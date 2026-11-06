// A Run button that turns into Stop while its own run is in flight, and a
// status chip that explains what the runtime is doing (loading, queued...).

import { h, icon } from '../lib/dom.ts';
import { python } from '../python/client.ts';

export interface RunControls {
  button: HTMLButtonElement;
  status: HTMLElement;
  setRunning(running: boolean): void;
  setStatus(text: string, tone?: 'ok' | 'err' | 'busy' | ''): void;
}

export function createRunControls(label: string, onRun: () => void, primary = true): RunControls {
  let running = false;
  const button = h('button', {
    type: 'button',
    class: `btn ${primary ? 'btn-primary' : ''} btn-run`,
    title: `${label} (Ctrl/Cmd + Enter)`,
    onclick: () => (running ? python.stop() : onRun()),
  });
  const status = h('span', { class: 'run-status', 'aria-live': 'polite' });

  const render = () => {
    button.innerHTML = running ? `${icon('stop', 14)}<span>Stop</span>` : `${icon('play', 14)}<span>${label}</span>`;
    button.classList.toggle('is-running', running);
  };
  render();

  return {
    button,
    status,
    setRunning(value) {
      running = value;
      render();
    },
    setStatus(text, tone = '') {
      status.textContent = text;
      status.dataset.tone = tone;
    },
  };
}

/** Status text to show while waiting for a run to start. */
export function pendingStatus(): string {
  const state = python.state;
  if (state.state === 'idle' || state.state === 'loading') return 'Loading Python…';
  if (python.busy) return 'Queued…';
  return 'Running…';
}
