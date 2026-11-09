// Web Worker that owns the Pyodide interpreter. Runs are processed one at a
// time; the main thread enforces timeouts by terminating this worker.

import { version as PYODIDE_VERSION } from 'pyodide/package.json';
import runtimeSource from './runtime.py?raw';
import type { RunRequest, RunResult, TestEvent, WorkerMessage } from './types.ts';

const INDEX_URL = `https://cdn.jsdelivr.net/pyodide/v${PYODIDE_VERSION}/full/`;
const OUTPUT_CAP = 200_000;

interface Writer {
  write(buffer: Uint8Array): number;
  isatty?: boolean;
}

interface Pyodide {
  version: string;
  FS: { mkdirTree(path: string): void; writeFile(path: string, data: string): void };
  runPython(code: string): unknown;
  pyimport(name: string): unknown;
  setStdout(writer: Writer): void;
  setStderr(writer: Writer): void;
  setStdin(options: { error: boolean }): void;
  loadPackage(names: string[], options?: PackageOptions): Promise<unknown>;
  loadPackagesFromImports(code: string, options?: PackageOptions): Promise<unknown>;
}

interface PackageOptions {
  messageCallback?: (message: string) => void;
  errorCallback?: (message: string) => void;
}

interface Harness {
  run_json(code: string, tests: string | null, showLast: boolean): Promise<string>;
  missing_imports_json(code: string): string;
  set_test_reporter(reporter: (json: string) => void): void;
  set_interrupt_aborts(aborts: boolean): void;
}

const post = (message: WorkerMessage) => self.postMessage(message);

let currentId = 0;

// stdout and stderr share one ordered buffer so their interleaving survives
// batching. Writes go out immediately unless a print-heavy loop is flooding
// (more than 20 writes per 50 ms), which keeps the main thread responsive.
const output = {
  chunks: [] as Array<{ kind: 'stdout' | 'stderr'; text: string }>,
  size: 0,
  emitted: 0,
  windowStart: 0,
  windowWrites: 0,
  reset() {
    this.chunks = [];
    this.size = 0;
    this.emitted = 0;
  },
  push(kind: 'stdout' | 'stderr', text: string) {
    if (this.emitted < OUTPUT_CAP) {
      const room = OUTPUT_CAP - this.emitted;
      const piece = text.length > room ? `${text.slice(0, room)}\n… output truncated (over ${OUTPUT_CAP / 1000} kB) …\n` : text;
      const last = this.chunks.at(-1);
      if (last?.kind === kind) last.text += piece;
      else this.chunks.push({ kind, text: piece });
      this.size += piece.length;
    }
    this.emitted += text.length;
    const now = performance.now();
    if (now - this.windowStart > 50) {
      this.windowStart = now;
      this.windowWrites = 0;
    }
    if (++this.windowWrites <= 20 || this.size > 8192) this.flush();
  },
  flush() {
    for (const chunk of this.chunks) post({ type: chunk.kind, id: currentId, text: chunk.text });
    this.chunks = [];
    this.size = 0;
  },
};

function writer(kind: 'stdout' | 'stderr'): Writer {
  const decoder = new TextDecoder();
  return {
    isatty: false,
    write(buffer) {
      output.push(kind, decoder.decode(buffer, { stream: true }));
      return buffer.length;
    },
  };
}

const stdout = writer('stdout');
const stderr = writer('stderr');

let pyodide: Pyodide;
let harness: Harness;

const ready = (async () => {
  post({ type: 'status', status: 'loading', detail: 'Downloading the Python runtime (cached after the first visit)…' });
  const { loadPyodide } = (await import(/* @vite-ignore */ `${INDEX_URL}pyodide.mjs`)) as {
    loadPyodide(options: { indexURL: string }): Promise<Pyodide>;
  };
  pyodide = await loadPyodide({ indexURL: INDEX_URL });
  pyodide.setStdout(stdout);
  pyodide.setStderr(stderr);
  pyodide.setStdin({ error: true });
  pyodide.FS.mkdirTree('/fjip');
  pyodide.FS.writeFile('/fjip/fjip_runtime.py', runtimeSource);
  pyodide.runPython("import sys\nsys.path.insert(0, '/fjip')");
  harness = pyodide.pyimport('fjip_runtime') as Harness;
  // Stream per-test progress so a timeout still shows the finished tests.
  harness.set_test_reporter((json: string) => post({ type: 'test', id: currentId, event: JSON.parse(json) as TestEvent }));
  // No interrupt buffer here: any KeyboardInterrupt is the learner's own.
  harness.set_interrupt_aborts(false);
  const python = String(pyodide.runPython("import sys\nsys.version.split()[0]"));
  post({ type: 'status', status: 'ready', python, pyodide: pyodide.version });
})();

ready.catch((error: unknown) => {
  post({ type: 'status', status: 'error', message: error instanceof Error ? error.message : String(error) });
});

function failure(type: string, message: string): RunResult {
  return {
    ok: false,
    error: { type, message, traceback: `${type}: ${message}\n`, line: null },
    value: null,
    exitCode: null,
    tests: null,
    testsError: null,
    durationMs: 0,
  };
}

async function run(request: RunRequest): Promise<void> {
  try {
    await ready;
  } catch (error) {
    post({ type: 'done', id: request.id, result: failure('RuntimeError', `Python failed to load: ${String(error)}`) });
    return;
  }
  currentId = request.id;
  running = request;
  output.reset();
  const info = (text: string) => post({ type: 'info', id: request.id, text });
  try {
    const source = request.tests ? `${request.code}\n${request.tests}` : request.code;
    // Third-party imports (numpy, ...) are fetched on demand from the Pyodide CDN.
    const missing = JSON.parse(harness.missing_imports_json(source)) as string[];
    if (missing.some((name) => name !== 'tzdata')) {
      await pyodide.loadPackagesFromImports(source, { messageCallback: info, errorCallback: info });
    }
    if (missing.includes('tzdata')) await pyodide.loadPackage(['tzdata'], { messageCallback: info, errorCallback: info });
    post({ type: 'started', id: request.id });
    const json = await harness.run_json(request.code, request.tests, request.showLast);
    output.flush();
    post({ type: 'done', id: request.id, result: JSON.parse(json) as RunResult });
  } catch (error) {
    output.flush();
    if (isFatal(error)) {
      crash(error);
      return;
    }
    post({ type: 'done', id: request.id, result: failure('InternalError', error instanceof Error ? error.message : String(error)) });
  } finally {
    running = null;
  }
}

// Deep recursion through C code (e.g. @functools.cache) can overflow the
// wasm stack before Python's own recursion limit kicks in. Pyodide then dies
// with a fatal error, usually thrown from an event-loop callback rather than
// from the call we awaited. Report it the way Python would, then ask the main
// thread for a fresh worker.
let running: RunRequest | null = null;

function isFatal(error: unknown): boolean {
  if (error instanceof RangeError) return true;
  return !!error && typeof error === 'object' && 'pyodide_fatal_error' in error;
}

function crash(error: unknown): void {
  output.flush();
  const overflow = error instanceof RangeError || /call stack/i.test(String((error as Error)?.message ?? error));
  if (running) {
    const result = overflow
      ? failure('RecursionError', 'maximum recursion depth exceeded (the browser ran out of stack space; Python was restarted)')
      : failure('RuntimeError', `the Python runtime crashed and was restarted: ${String((error as Error)?.message ?? error)}`);
    post({ type: 'done', id: running.id, result });
    running = null;
  }
  post({ type: 'fatal' });
}

self.addEventListener('error', (event) => {
  if (!isFatal(event.error)) return;
  event.preventDefault();
  crash(event.error);
});
self.addEventListener('unhandledrejection', (event) => {
  if (!isFatal(event.reason)) return;
  event.preventDefault();
  crash(event.reason);
});

let queue = Promise.resolve();
self.onmessage = (event: MessageEvent<RunRequest>) => {
  if (event.data.type === 'run') queue = queue.then(() => run(event.data));
};
