import { ConsoleView } from '../components/output.ts';
import { flash } from '../components/playground.ts';
import { createRunControls, pendingStatus } from '../components/run-button.ts';
import { createEditor } from '../editor/editor.ts';
import { copyText, h, icon } from '../lib/dom.ts';
import { decodeCode, encodeCode } from '../lib/router.ts';
import { readString, writeString } from '../lib/storage.ts';
import { python } from '../python/client.ts';

const KEY = 'fjip:playground';

const EXAMPLES: Record<string, string> = {
  'Welcome': `# A scratchpad running CPython 3.14 in your browser (via Pyodide).
# Ctrl/Cmd + Enter runs it. The trailing expression is displayed, REPL-style.

from dataclasses import dataclass


@dataclass
class Language:
    name: str
    year: int


langs = [Language("JavaScript", 1995), Language("Python", 1991)]
oldest = min(langs, key=lambda lang: lang.year)
print(f"{oldest.name} is older, by {max(l.year for l in langs) - oldest.year} years")

[lang.name.upper() for lang in langs]
`,
  'Comprehensions': `orders = [
    {"id": 1, "total": 42.5, "status": "paid"},
    {"id": 2, "total": 17.0, "status": "refunded"},
    {"id": 3, "total": 99.9, "status": "paid"},
]

paid = [o for o in orders if o["status"] == "paid"]
by_id = {o["id"]: o["total"] for o in orders}
statuses = {o["status"] for o in orders}

print(f"{len(paid)=}")
print(f"{by_id=}")
print(f"{statuses=}")
sum(o["total"] for o in paid)
`,
  'Generators': `from itertools import islice


def fibonacci():
    a, b = 0, 1
    while True:
        yield a
        a, b = b, a + b


print(list(islice(fibonacci(), 12)))
evens = (n for n in fibonacci() if n % 2 == 0)
next(evens), next(evens), next(evens)
`,
  'Pattern matching': `def describe(event: dict) -> str:
    match event:
        case {"type": "click", "pos": (x, y)}:
            return f"click at {x},{y}"
        case {"type": "key", "key": "Enter" | "Return"}:
            return "submit"
        case {"type": "key", "key": str(k)}:
            return f"typed {k!r}"
        case _:
            return "unknown event"


for e in [{"type": "click", "pos": (3, 4)}, {"type": "key", "key": "Enter"}, {"type": "key", "key": "q"}, {}]:
    print(describe(e))
`,
  'asyncio': `import asyncio
import time


async def fetch(name: str, delay: float) -> str:
    await asyncio.sleep(delay)
    return f"{name} done"


async def main():
    start = time.perf_counter()
    results = await asyncio.gather(fetch("a", 0.2), fetch("b", 0.1), fetch("c", 0.15))
    print(results)
    print(f"took {time.perf_counter() - start:.2f}s, not 0.45s")


asyncio.run(main())
`,
};

export function renderPlaygroundPage(main: HTMLElement, encoded: string | null): () => void {
  const fromUrl = encoded ? decodeCode(encoded) : null;
  const initial = fromUrl ?? readString(KEY) ?? EXAMPLES.Welcome!;
  let saveTimer: number | undefined;

  const consoleView = new ConsoleView();
  const editorHost = h('div', { class: 'playground-editor' });
  const controls = createRunControls('Run', () => void run());

  const run = async () => {
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
    controls.setStatus(label, ok ? 'ok' : 'err');
  };

  const editor = createEditor({
    parent: editorHost,
    doc: initial,
    label: 'Playground code',
    onRun: () => void run(),
    onChange: (value) => {
      window.clearTimeout(saveTimer);
      saveTimer = window.setTimeout(() => writeString(KEY, value), 300);
    },
  });

  const examples = h(
    'select',
    { class: 'select', 'aria-label': 'Load an example' },
    h('option', { value: '' }, 'Load an example…'),
    ...Object.keys(EXAMPLES).map((name) => h('option', { value: name }, name)),
  );
  examples.addEventListener('change', () => {
    const code = EXAMPLES[examples.value];
    if (code) {
      editor.setValue(code);
      writeString(KEY, code);
      editor.focus();
    }
    examples.value = '';
  });

  const share = h('button', {
    type: 'button',
    class: 'btn btn-ghost',
    html: `${icon('link', 15)}<span>Copy share link</span>`,
    onclick: async () => {
      const url = `${location.origin}${location.pathname}#/playground?code=${encodeCode(editor.getValue())}`;
      if (await copyText(url)) flash(share, `${icon('check', 15)}<span>Link copied</span>`, `${icon('link', 15)}<span>Copy share link</span>`);
    },
  });
  const clear = h('button', {
    type: 'button',
    class: 'btn btn-ghost',
    html: `${icon('trash', 15)}<span>Clear output</span>`,
    onclick: () => consoleView.clear(),
  });

  main.replaceChildren(
    h(
      'div',
      { class: 'page page-playground' },
      h(
        'header',
        { class: 'playground-head' },
        h('div', null, h('h1', null, 'Playground'), h('p', { class: 'page-lede' }, 'Python 3.14 in your browser. Your code is saved locally as you type.')),
        h('div', { class: 'playground-toolbar' }, controls.button, controls.status, h('span', { class: 'spacer' }), examples, share, clear),
      ),
      h(
        'div',
        { class: 'playground-split' },
        h('section', { class: 'playground-pane', 'aria-label': 'Editor' }, h('div', { class: 'code-head' }, h('span', { class: 'code-lang' }, 'main.py')), editorHost),
        h('section', { class: 'playground-pane', 'aria-label': 'Output' }, h('div', { class: 'code-head' }, h('span', { class: 'code-lang' }, 'Output')), consoleView.el),
      ),
    ),
  );
  if (fromUrl) writeString(KEY, fromUrl);
  python.warmup();
  editor.focus();

  return () => {
    window.clearTimeout(saveTimer);
    writeString(KEY, editor.getValue());
    editor.destroy();
  };
}
