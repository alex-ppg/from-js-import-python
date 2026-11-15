# from js import python

[![CI](https://github.com/alex-ppg/from-js-import-python/actions/workflows/ci.yml/badge.svg)](https://github.com/alex-ppg/from-js-import-python/actions/workflows/ci.yml)

**Python for people who already think in JavaScript.** **[Open the site →](https://alex-ppg.github.io/from-js-import-python/)**

Interactive courses that map the JavaScript in your head onto idiomatic Python: side-by-side translations, the traps your JS instincts walk into, and the syntax shortcuts that make Python pleasant. They then go further, into everyday tooling, CPython internals, algorithms and guided projects. Every Python snippet is live: it runs CPython 3.14 compiled to WebAssembly ([Pyodide](https://pyodide.org)) right in the browser, with nothing to install.

## Courses

There are **7 courses**: 76 lessons, **340 coding challenges**, **410 quizzes** and 1,700+ code snippets, plus a 410-entry reference. Every one is validated against real Python 3.14.

| Course | Lessons | Challenges | What it covers |
| --- | ---: | ---: | --- |
| **Python for JavaScript Developers** (start here) | 25 | 80 | Syntax, numbers, strings, truthiness, loops, lists, comprehensions, dicts, sets, functions and lambdas, decorators, generators, classes, dunder methods, dataclasses, exceptions, context managers, modules and tooling, `asyncio`, type hints, pattern matching, the standard library, and a gotchas field guide. |
| **Python in Practice** | 12 | 44 | Files and paths, regex and text processing, CSV/JSON/TOML, dates and times, data wrangling, CLIs with argparse, logging and debugging, testing (unittest, pytest, mocks), code quality, performance, HTTP APIs, and SQLite. |
| **Advanced Python** | 10 | 38 | Attribute lookup, descriptors, metaclasses, functional programming, generators and coroutines in depth, advanced typing, introspection and `ast`, Pythonic API design, CPython internals, and concurrency models. |
| **Algorithms & Interview Prep** | 9 | 44 | The algorithm toolkit, two pointers and sliding windows, hashing, sorting and binary search, stacks/queues/heaps, linked lists and trees, graphs, backtracking, and dynamic programming. Speed is tested with large inputs. |
| **JS → Python Drills** | 6 | 60 | Short translation reps: read a JS snippet, write the idiomatic Python. They run from strings and arrays to classes, async, and "make it Pythonic" refactors. |
| **Guided Projects** | 8 | 48 | Six-step builds where every step is a tested challenge: an expression calculator, a Markdown converter, a todo CLI, an event-sourced ledger, a text adventure, a test runner, an async crawler, and caches and rate limiters. |
| **Checkpoints** | 6 | 26 | One exam per part of the core course: 114 quizzes proven against real output, plus integrative challenges. |

## Features

- **Side-by-side lessons.** Each standard lesson leads with JS ↔ Python comparisons and adds runnable playgrounds, "what does this print?" quizzes, gotcha and "Pythonic upgrade" callouts, and a cheat sheet.
- **Coding challenges** checked by real tests, plus idiom checks ("use a comprehension", "no index loops", "don't call `len()`"). Many show the JavaScript you'd write next to your Python editor. Hints are revealed one at a time, and reference solutions are a click away.
- **Review.** A quiz review draws 10 questions from across every course, missed and unanswered questions first. Flashcards drill the reference with Leitner-box spaced repetition.
- **A JS → Python reference**: a searchable Rosetta stone (`arr.at(-1)`, `padStart`, `Promise.all`, `?.`, `structuredClone`, `fs.readFile`, `jest.fn`, `npm install`...).
- **A playground**: a scratchpad with shareable links.
- **Search everything** with <kbd>Ctrl</kbd>/<kbd>⌘</kbd> <kbd>K</kbd> or <kbd>/</kbd>.
- **No accounts and no backend.** Progress, saved solutions, quiz answers and flashcard boxes persist in `localStorage`.
- **Comfortable anywhere.** Light and dark themes, responsive down to phone width, and keyboard friendly (<kbd>Ctrl</kbd>/<kbd>⌘</kbd> <kbd>Enter</kbd> runs code).

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
| `npm run typecheck` | TypeScript checks for the app, the tooling and the tests |
| `npm test` | Platform unit tests: content parser, router, renderer, and the Python harness on real Pyodide |
| `npm run validate` | **Executes every lesson**: playgrounds, output quizzes, and challenge solutions/starters, on the real Pyodide runtime (see below) |
| `npm run check` | `typecheck` + `test` + `validate` |

Pass filters to validate part of the site: `npm run validate -- algorithms dicts` covers a whole course plus any lesson whose path contains `dicts`. `-- --no-run` skips execution.

## How it works

```
content/courses/<course>/            plugins/content (Vite plugin)         one JS chunk per lesson
  course.json + NN-slug.md   ──►     markdown-it + Shiki             ──►   (HTML + widget data)
  :::compare / :::quiz /             (dual-theme highlighting)             + a manifest of every
  :::challenge containers                                                    course and lesson
                                                                                    │
src/ (vanilla TypeScript SPA, hash routing) ◄───────────────────────────────────────┘
   ├─ editor/      CodeMirror 6 Python editor (themed to match Shiki)
   ├─ components/  playgrounds, quizzes, challenges, console, command palette, cards
   ├─ pages/       home, courses, course, lesson, practice, review, reference, playground
   └─ python/      client.ts ──postMessage──► worker.ts (Pyodide) ──► runtime.py
```

- **Content** is Markdown with a few custom containers (`:::compare`, `:::gotcha`, `:::pythonic`, `:::quiz`, `:::challenge`...), compiled at build time. No Markdown parser or syntax highlighter ships to the browser.
- **Python runs in a Web Worker.** Pyodide loads from jsDelivr on first use and is cached by the browser after that. `src/python/runtime.py`:
  - gives every run a fresh `__main__`
  - shows the trailing expression's value like a REPL
  - supports top-level `await`, and rewrites `asyncio.run(main())` to work in the browser
  - trims tracebacks to the learner's code
  - implements the challenge test API
- **Runaway code**: the main thread terminates and respawns the worker after 10 s, or when you press Stop. That needs no `SharedArrayBuffer` or cross-origin isolation, so the site works on any static host. A WebAssembly stack overflow from very deep recursion is caught too: it's reported as a `RecursionError` and Python restarts.
- **Validation**: `scripts/validate.ts` runs the same harness on the same Pyodide build in Node. So CI proves that every snippet runs, every quiz answer matches real output, every solution passes its tests, and every starter doesn't. A watchdog thread interrupts runaway code through Pyodide's interrupt buffer.

## Writing lessons

See [AUTHORING.md](AUTHORING.md) for the course layout, the content format, the challenge test API, the sandbox's constraints, the formats of each course and the style guide. [`content/courses/python-for-js-devs/07-lists.md`](content/courses/python-for-js-devs/07-lists.md) is the reference lesson.

## Deploying

The build is fully static, with relative asset URLs and hash routing, so `dist/` works on any static host and in any sub-folder.

The included workflow (`.github/workflows/ci.yml`) type-checks, tests, validates and builds every push and pull request. Every push to `main` that passes is deployed to **GitHub Pages** at <https://alex-ppg.github.io/from-js-import-python/>. The deploy job only runs while the repository is public, since Pages on private repositories needs a paid plan.

To deploy a fork: make it public, set **Settings → Pages → Source** to **GitHub Actions**, and push to `main` (or run the workflow manually).
