// Inline runnable snippet: replaces the static highlighted fallback with an
// editor, Run/Reset/Copy controls and a console.

import type { PlaygroundData } from '../../plugins/content/types.ts';
import { createEditor } from '../editor/editor.ts';
import { copyText, h, icon } from '../lib/dom.ts';
import { python } from '../python/client.ts';
import { ConsoleView } from './output.ts';
import { createRunControls, pendingStatus } from './run-button.ts';

export function mountPlayground(host: HTMLElement, data: PlaygroundData): () => void {
  const consoleView = new ConsoleView();
  const consoleWrap = h('div', { class: 'pg-console', hidden: true }, consoleView.el);
  const editorHost = h('div', { class: 'pg-editor' });

  const reset = h('button', {
    type: 'button',
    class: 'icon-btn',
    title: 'Reset to the original code',
    'aria-label': 'Reset code',
    hidden: true,
    html: icon('reset', 15),
    onclick: () => {
      editor.setValue(data.code);
      editor.focus();
    },
  });
  const copy = h('button', {
    type: 'button',
    class: 'icon-btn',
    title: 'Copy code',
    'aria-label': 'Copy code',
    html: icon('copy', 15),
    onclick: async () => {
      if (await copyText(editor.getValue())) flash(copy, icon('check', 15), icon('copy', 15));
    },
  });

  const controls = createRunControls('Run', () => void run(), false);

  const run = async () => {
    consoleWrap.hidden = false;
    consoleView.clear();
    editor.setErrorLine(null);
    controls.setRunning(true);
    controls.setStatus(pendingStatus(), 'busy');
    const outcome = await python.run({
      code: editor.getValue(),
      onStart: () => controls.setStatus('Running…', 'busy'),
      onStdout: (text) => consoleView.write(text, 'out'),
      onStderr: (text) => consoleView.write(text, 'err'),
      onInfo: (text) => consoleView.write(`${text}\n`, 'info'),
    });
    controls.setRunning(false);
    const { label, ok } = consoleView.finish(outcome);
    editor.setErrorLine(outcome.error?.line ?? null);
    controls.setStatus(label, ok ? 'ok' : data.raises && outcome.error ? '' : 'err');
  };

  const editor = createEditor({
    parent: editorHost,
    doc: data.code,
    onRun: () => void run(),
    onChange: (value) => {
      reset.hidden = value === data.code;
    },
  });

  const head = h(
    'div',
    { class: 'code-head pg-head' },
    h('span', { class: 'code-lang' }, 'Python'),
    h('span', { class: 'pg-badge', title: 'Edit the code and run it' }, 'live'),
    controls.status,
    h('span', { class: 'pg-actions' }, reset, copy, controls.button),
  );

  const live = h('div', { class: 'pg-live' }, head, editorHost, consoleWrap);
  host.replaceChildren(live);
  host.classList.add('is-live');
  return () => editor.destroy();
}

export function flash(button: HTMLElement, temporary: string, original: string): void {
  button.innerHTML = temporary;
  button.classList.add('is-flashed');
  window.setTimeout(() => {
    button.innerHTML = original;
    button.classList.remove('is-flashed');
  }, 1400);
}
