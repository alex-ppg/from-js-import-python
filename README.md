# from js import python

**Python for people who already think in JavaScript.**

An interactive course that maps the JavaScript in your head onto idiomatic Python. It covers side-by-side translations, the traps your JS instincts walk into, and the syntax shortcuts that make Python pleasant. Every Python snippet is live: it runs CPython 3.14 compiled to WebAssembly ([Pyodide](https://pyodide.org)) right in the browser, with nothing to install.

## What's inside

- **25 lessons in 6 parts**, from syntax and numbers through comprehensions, generators, classes, dunder methods, exceptions, `asyncio`, type hints and pattern matching. Each lesson leads with JS ↔ Python comparisons, adds runnable playgrounds and "what does this print?" quizzes, and ends with a cheat sheet. In total there are 800+ code snippets (270+ of them live) and 125 quizzes.
- **80 coding challenges** checked by real tests, plus idiom checks ("use a comprehension", "no index loops", "don't call `len()`"). Many show the JavaScript you'd write next to your Python editor. Hints are revealed one at a time, and the reference solution is there when you need it.
- **A JS → Python reference** with 236 entries in 20 categories: a searchable Rosetta stone (`arr.at(-1)`, `padStart`, `Promise.all`, `?.`, `structuredClone`, `npm install`...).
- **A playground**: a scratchpad with shareable links.
- **Search everything** with <kbd>Ctrl</kbd>/<kbd>⌘</kbd> <kbd>K</kbd> or <kbd>/</kbd>.
- Progress, saved solutions and quiz answers persist in `localStorage`. There are no accounts and no backend.
- Light and dark themes, responsive down to phone width, and keyboard friendly (<kbd>Ctrl</kbd>/<kbd>⌘</kbd> <kbd>Enter</kbd> runs code).

## Getting started

Requires Node.js 22.18+ (the scripts use Node's built-in TypeScript support).

```bash
npm install
npm run dev
```

| Script | What it does |
| --- | --- |
| `npm run dev` | Vite dev server with hot reload for lessons and code |
| `npm run build` | Static production build in `dist/` |
| `npm run preview` | Serve the production build locally |
| `npm run typecheck` | TypeScript checks for the app and the Node tooling |
| `npm run validate` | **Executes every lesson**: playgrounds, output quizzes and challenge solutions/starters, using the real Pyodide runtime (see below) |
| `npm run check` | `typecheck` + `validate` |

`npm run validate -- 07 dicts` validates only lessons whose filename contains `07` or `dicts`, and `-- --no-run` skips execution.

## How it works

```
content/lessons/*.md ──► plugins/content (Vite plugin) ──► one JS chunk per lesson
   Markdown + :::compare / :::quiz /         markdown-it + Shiki        (HTML + widget data)
   :::challenge containers                   (dual-theme highlighting)
                                                                            │
src/ (vanilla TypeScript SPA, hash routing) ◄──────────────────────────────┘
   ├─ editor/      CodeMirror 6 Python editor (themed to match Shiki)
   ├─ components/  playgrounds, quizzes, challenges, console, command palette
   └─ python/      client.ts ──postMessage──► worker.ts (Pyodide) ──► runtime.py
```

- **Content** is Markdown with a few custom containers (`:::compare`, `:::gotcha`, `:::pythonic`, `:::quiz`, `:::challenge`...), compiled at build time. No Markdown parser or syntax highlighter ships to the browser.
- **Python runs in a Web Worker.** Pyodide loads from jsDelivr on first use and is cached by the browser after that. `src/python/runtime.py` gives every run a fresh `__main__`, shows the trailing expression's value like a REPL, supports top-level `await` (and rewrites `asyncio.run(main())` to work in the browser), trims tracebacks to the learner's code, and implements the challenge test API.
- **Infinite loops**: the main thread terminates and respawns the worker after 10 s, or when you press Stop. That needs no `SharedArrayBuffer` or cross-origin isolation, so the site works on any static host.
- **Validation**: `scripts/validate.ts` runs the same harness on the same Pyodide build in Node, so CI proves every snippet runs, every quiz answer matches real output, every solution passes its tests, and every starter doesn't. A watchdog thread interrupts runaway code through Pyodide's interrupt buffer.

## Writing lessons

See [AUTHORING.md](AUTHORING.md) for the content format, the challenge test API, the sandbox's constraints and the style guide. [`content/lessons/07-lists.md`](content/lessons/07-lists.md) is the reference lesson.

## Deploying

The build is fully static, with relative asset URLs and hash routing, so `dist/` works on any static host and in any sub-folder.

The included workflow (`.github/workflows/ci.yml`) type-checks, validates and builds every push and pull request. It deploys `main` to **GitHub Pages** once the repository is public (Pages on private repositories needs a paid plan). To enable it:

1. Make the repository public.
2. In **Settings → Pages**, set **Source** to **GitHub Actions**.
3. Push to `main`, or re-run the workflow.
