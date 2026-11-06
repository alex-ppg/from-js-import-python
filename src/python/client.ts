// Main-thread facade over the Pyodide worker: one run at a time, streamed
// output, and timeouts/stop implemented by terminating and respawning the
// worker (SharedArrayBuffer interrupts would need cross-origin isolation,
// which static hosts like GitHub Pages can't provide).

import type { RunResult, WorkerMessage } from './types.ts';

export type RuntimeState =
  | { state: 'idle' }
  | { state: 'loading'; detail: string }
  | { state: 'ready'; python: string }
  | { state: 'running'; python: string }
  | { state: 'error'; message: string };

export interface RunOptions {
  code: string;
  tests?: string | null;
  /** Report the trailing expression's value (REPL-style). Default true. */
  showLast?: boolean;
  timeoutMs?: number;
  onStdout?: (text: string) => void;
  onStderr?: (text: string) => void;
  onInfo?: (text: string) => void;
  /** Called when the code actually starts executing (after Python loads). */
  onStart?: () => void;
}

export interface RunOutcome extends RunResult {
  timedOut?: boolean;
  stopped?: boolean;
}

interface ActiveRun {
  id: number;
  options: RunOptions;
  resolve: (outcome: RunOutcome) => void;
  timer: number | undefined;
}

export const DEFAULT_TIMEOUT_MS = 10_000;

function emptyOutcome(extra: Partial<RunOutcome>): RunOutcome {
  return { ok: false, error: null, value: null, exitCode: null, tests: null, testsError: null, durationMs: 0, ...extra };
}

class PythonRuntime {
  private worker: Worker | null = null;
  private current: RuntimeState = { state: 'idle' };
  private python = '';
  private listeners = new Set<(state: RuntimeState) => void>();
  private active: ActiveRun | null = null;
  /** Output that arrives after a run resolved (e.g. a background task) goes here. */
  private last: { id: number; options: RunOptions } | null = null;
  private queue: Promise<unknown> = Promise.resolve();
  private nextId = 1;

  get state(): RuntimeState {
    return this.current;
  }

  get busy(): boolean {
    return this.active !== null;
  }

  subscribe(listener: (state: RuntimeState) => void): () => void {
    this.listeners.add(listener);
    listener(this.current);
    return () => this.listeners.delete(listener);
  }

  /** Start loading Python ahead of the first run. */
  warmup(): void {
    if (!this.worker) this.spawn();
  }

  restart(): void {
    this.worker?.terminate();
    this.worker = null;
    this.spawn();
  }

  run(options: RunOptions): Promise<RunOutcome> {
    const job = this.queue.then(() => this.execute(options));
    this.queue = job.catch(() => undefined);
    return job;
  }

  /** Abort the run in progress (the interpreter is restarted). */
  stop(): void {
    if (this.active) this.kill({ stopped: true });
  }

  private setState(state: RuntimeState): void {
    this.current = state;
    for (const listener of this.listeners) listener(state);
  }

  private spawn(): void {
    const worker = new Worker(new URL('./worker.ts', import.meta.url), { type: 'module', name: 'python' });
    this.worker = worker;
    this.setState({ state: 'loading', detail: 'Starting Python…' });
    worker.onmessage = (event: MessageEvent<WorkerMessage>) => this.handle(event.data);
    worker.onerror = (event) => {
      event.preventDefault();
      const message = event.message || 'The Python worker failed to start.';
      this.setState({ state: 'error', message });
      if (this.active) {
        this.finish(emptyOutcome({ error: { type: 'RuntimeError', message, traceback: message, line: null } }));
      }
    };
  }

  private execute(options: RunOptions): Promise<RunOutcome> {
    if (!this.worker) this.spawn();
    return new Promise((resolve) => {
      const id = this.nextId++;
      this.active = { id, options, resolve, timer: undefined };
      this.worker!.postMessage({
        type: 'run',
        id,
        code: options.code,
        tests: options.tests ?? null,
        showLast: options.showLast ?? true,
      });
    });
  }

  private handle(message: WorkerMessage): void {
    switch (message.type) {
      case 'status':
        if (message.status === 'loading') this.setState({ state: 'loading', detail: message.detail });
        else if (message.status === 'ready') {
          this.python = message.python;
          this.setState({ state: 'ready', python: message.python });
        } else this.setState({ state: 'error', message: message.message });
        return;
      case 'started': {
        const run = this.active;
        if (run?.id !== message.id) return;
        run.options.onStart?.();
        run.timer = window.setTimeout(() => this.kill({ timedOut: true }), run.options.timeoutMs ?? DEFAULT_TIMEOUT_MS);
        this.setState({ state: 'running', python: this.python });
        return;
      }
      case 'stdout':
      case 'stderr':
      case 'info': {
        const options = this.active?.id === message.id ? this.active.options : this.last?.id === message.id ? this.last.options : null;
        if (!options) return;
        if (message.type === 'stdout') options.onStdout?.(message.text);
        else if (message.type === 'stderr') options.onStderr?.(message.text);
        else options.onInfo?.(message.text);
        return;
      }
      case 'done':
        if (this.active?.id === message.id) this.finish(message.result);
        return;
      case 'fatal':
        this.restart();
        return;
    }
  }

  private finish(outcome: RunOutcome): void {
    const run = this.active;
    if (!run) return;
    window.clearTimeout(run.timer);
    this.active = null;
    this.last = { id: run.id, options: run.options };
    if (this.current.state === 'running') this.setState({ state: 'ready', python: this.python });
    run.resolve(outcome);
  }

  private kill(reason: Partial<RunOutcome>): void {
    this.worker?.terminate();
    this.worker = null;
    this.finish(emptyOutcome(reason));
    this.spawn();
  }
}

export const python = new PythonRuntime();
