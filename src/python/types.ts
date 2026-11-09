// Messages between the main thread (client.ts) and the Pyodide worker, and
// the result shape produced by runtime.py's `run_json`.

export interface PyError {
  type: string;
  message: string;
  traceback: string;
  /** 1-based line in the learner's code, when the error points into it. */
  line: number | null;
}

export interface TestResult {
  name: string;
  passed: boolean;
  message: string | null;
  traceback: string | null;
  output: string;
  durationMs: number;
}

export interface RunResult {
  ok: boolean;
  error: PyError | null;
  /** repr() of the trailing expression, REPL-style. */
  value: string | null;
  exitCode: number | null;
  tests: TestResult[] | null;
  /** The test code itself failed to load (a content bug, or a name the learner removed). */
  testsError: PyError | null;
  durationMs: number;
}

export type TestEvent = { event: 'start'; name: string } | { event: 'done'; result: TestResult };

export interface RunRequest {
  type: 'run';
  id: number;
  code: string;
  tests: string | null;
  showLast: boolean;
}

export type WorkerMessage =
  | { type: 'status'; status: 'loading'; detail: string }
  | { type: 'status'; status: 'ready'; python: string; pyodide: string }
  | { type: 'status'; status: 'error'; message: string }
  | { type: 'started'; id: number }
  | { type: 'stdout' | 'stderr' | 'info'; id: number; text: string }
  | { type: 'done'; id: number; result: RunResult }
  /** Streamed while challenge tests run (before `done`). */
  | { type: 'test'; id: number; event: TestEvent }
  /** The interpreter is unusable (e.g. wasm stack overflow); respawn the worker. */
  | { type: 'fatal' };
