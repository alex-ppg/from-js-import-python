// The console panel under editors: streamed stdout/stderr, tracebacks, the
// trailing-expression value, and run notices.

import type { RunOutcome } from '../python/client.ts';
import { DEFAULT_TIMEOUT_MS } from '../python/client.ts';
import type { PyError } from '../python/types.ts';
import { h } from '../lib/dom.ts';

type Kind = 'out' | 'err' | 'info' | 'value' | 'error' | 'notice';

const MAX_CHARS = 120_000;

export class ConsoleView {
  readonly el: HTMLElement;
  private readonly body: HTMLPreElement;
  private lastKind: Kind | null = null;
  private lastSpan: HTMLSpanElement | null = null;
  private chars = 0;
  private wroteSomething = false;

  constructor(label = 'Output') {
    this.body = h('pre', { class: 'console-body', tabindex: '0' });
    this.el = h('div', { class: 'console', role: 'log', 'aria-live': 'polite', 'aria-label': label }, this.body);
  }

  get isEmpty(): boolean {
    return !this.wroteSomething;
  }

  clear(): void {
    this.body.textContent = '';
    this.lastKind = null;
    this.lastSpan = null;
    this.chars = 0;
    this.wroteSomething = false;
  }

  write(text: string, kind: Kind = 'out'): void {
    if (!text) return;
    if (this.chars > MAX_CHARS) return;
    this.chars += text.length;
    this.wroteSomething = true;
    if (kind === this.lastKind && this.lastSpan) {
      this.lastSpan.textContent += text;
    } else {
      this.lastSpan = h('span', { class: `console-${kind}` }, text);
      this.body.append(this.lastSpan);
      this.lastKind = kind;
    }
    const nearBottom = this.body.scrollHeight - this.body.scrollTop - this.body.clientHeight < 40;
    if (nearBottom) this.body.scrollTop = this.body.scrollHeight;
  }

  /** Start a new block on its own line. */
  private block(text: string, kind: Kind): void {
    const tail = this.body.textContent ?? '';
    if (tail && !tail.endsWith('\n')) this.write('\n', this.lastKind ?? 'out');
    this.lastKind = null;
    this.write(text.endsWith('\n') ? text : `${text}\n`, kind);
  }

  value(repr: string): void {
    this.block(repr, 'value');
  }

  error(error: PyError): void {
    this.block(error.traceback || `${error.type}: ${error.message}`, 'error');
  }

  notice(text: string): void {
    this.block(text, 'notice');
  }

  /** Render the terminal state of a run. Returns a short status label. */
  finish(outcome: RunOutcome, { quietValue = false } = {}): { label: string; ok: boolean } {
    if (outcome.timedOut) {
      this.notice(`Stopped after ${DEFAULT_TIMEOUT_MS / 1000} s: infinite loop? Python was restarted, so re-run anything you need.`);
      return { label: 'Timed out', ok: false };
    }
    if (outcome.stopped) {
      this.notice('Stopped. Python was restarted.');
      return { label: 'Stopped', ok: false };
    }
    if (outcome.error) {
      this.error(outcome.error);
      return { label: outcome.error.type, ok: false };
    }
    if (outcome.value !== null && !quietValue) this.value(outcome.value);
    if (outcome.exitCode !== null && outcome.exitCode !== 0) this.notice(`Exited with code ${outcome.exitCode}`);
    if (this.isEmpty) this.notice('(no output)');
    return { label: formatDuration(outcome.durationMs), ok: true };
  }
}

export function formatDuration(ms: number): string {
  if (ms < 1) return '<1 ms';
  if (ms < 1000) return `${Math.round(ms)} ms`;
  return `${(ms / 1000).toFixed(2)} s`;
}
