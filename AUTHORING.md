# Authoring guide

Everything a contributor (human or AI) needs to write lessons for **from js import python**. Read it fully before writing, then read [`content/courses/python-for-js-devs/07-lists.md`](content/courses/python-for-js-devs/07-lists.md), the reference lesson for tone, density and structure.

- [The audience](#the-audience)
- [Files and frontmatter](#files-and-frontmatter)
- [Markdown building blocks](#markdown-building-blocks)
- [Challenges and the test API](#challenges-and-the-test-api)
- [The Python sandbox](#the-python-sandbox)
- [Course formats](#course-formats)
- [Style guide](#style-guide)
- [Validating your work](#validating-your-work)
- [Curriculum maps](#curriculum-maps)

## The audience

Readers are **senior JavaScript/TypeScript engineers**. They know what a closure, an iterator, a promise and a hash map are. Don't explain programming. Explain **how Python differs, why, and what the idiomatic Python looks like**. Every lesson should leave them able to:

1. translate the JS they would have written into Python that a Python reviewer would approve,
2. recognise the traps where JS intuition gives the wrong answer, and
3. use the syntax savers (comprehensions, unpacking, slicing, `with`, decorators, dataclasses, ...) that make Python pleasant.

## Files and frontmatter

The site hosts several **courses**. Each one is a folder, `content/courses/<course-id>/`, holding a `course.json` (title, summary, level, icon, order and the ordered list of **parts**) and its lessons, `NN-slug.md`. The number orders lessons within the course. The slug becomes the URL (`#/learn/slug`) and must be **unique across all courses**.

```yaml
---
title: Arrays → Lists
part: Collections
summary: One sentence, under ~110 characters, shown on cards and in the sidebar.
minutes: 30
---
```

- `part` must be one of the parts listed in **that course's** `course.json`.
- `minutes` is the estimated reading and practice time (a whole number).
- Don't edit `course.json` unless you own the course.

## Markdown building blocks

Regular CommonMark/GFM works: paragraphs, lists, tables, emphasis, `inline code`, links. Use `##` for sections and `###` for subsections. Both appear in the "On this page" table of contents. Don't use `#`, because the title comes from frontmatter.

### Code fences

````md
```js
const xs = [1, 2, 3];
```

```python
xs = [1, 2, 3]
```
````

Languages: `js`, `ts`, `python`, `bash`, `json`, `toml`, `text`, `output` (labelled "Output"), `html`, `css`, `diff`, `ini`, `yaml`, `sql`.

Flags on `python` fences:

| Info string | Meaning |
| --- | --- |
| `python` | Static, syntax-highlighted. The validator **parses** it, so it must be valid syntax. |
| `python run` | An **editable, runnable playground**. The validator **executes** it and it must not raise. |
| `python run raises` | A playground that demonstrates an error. The validator requires it to raise. |
| `python nocheck` | Static and not parsed. Use it for intentionally invalid code such as `i++`. |
| `python title="config.py"` | Shows a filename in the code header. Works with any language. |

Playgrounds show stdout, stderr, tracebacks and, like a REPL or notebook, the **value of a trailing expression**. Ending a snippet with `xs` displays `xs`'s repr. Prefer explicit `print()` when there's more than one value to show.

### Side-by-side comparisons

The signature component. The JS goes first and the Python second. Fences render side by side (and stack on mobile). Any prose inside the container becomes a note under the panels, and the text after `:::compare` becomes an optional caption.

````md
:::compare Optional caption
```js
const doubled = nums.map((n) => n * 2);
```
```python
doubled = [n * 2 for n in nums]
```
:::
````

A `python run` fence inside a compare is allowed: static JS on the left and a live Python editor on the right. Keep the two panels roughly line-aligned, so the eye can map line 3 to line 3.

### Callouts

````md
:::gotcha Optional custom title
Where JS intuition gives the wrong answer.
:::
````

| Container | Default title | Use it for |
| --- | --- | --- |
| `:::gotcha` | JS habit alert | Traps where JS habits produce bugs. **The most valuable callout.** |
| `:::pythonic` | Pythonic upgrade | Idioms and syntax savers ("here's the nicer way"). |
| `:::tip` | Tip | Practical advice: performance, tooling, style. |
| `:::note` | Note | Neutral context or asides. |
| `:::deep` | Under the hood | Collapsible deep dives for the curious (CPython internals, history, edge cases). |

Callouts can contain any Markdown, including fences. **Containers can't be nested.**

### Quizzes

````md
:::quiz output
What does this print?

```python
print(-7 % 3)
```

- [ ] `-1`
- [x] `2`
- [ ] `-2`

Explanation shown after answering. Python's `%` follows floor division...
:::
````

- Exactly one `- [x]` option. Options form one contiguous list. Everything above them is the question and everything below is the explanation.
- `:::quiz output` makes the validator **run the code and check that stdout equals the correct option** (backticks stripped, whitespace trimmed). If the correct option is an exception name such as `` `TypeError` ``, the code must raise that exception. Use `output` whenever you can, because it guarantees the quiz is right.
- Without `output` the quiz is conceptual ("Which of these is idiomatic?"), and code in it is only parsed.
- Learners can press **Run it** on quiz code after answering, so a single-line, deterministic output works best.

### Links

- To other lessons: `[Dicts](lesson:dicts)` or `[the get() section](lesson:dicts#reading-values)`. Anchors are heading slugs: lowercase, with runs of non-alphanumerics turned into `-` (`## Reading values` becomes `reading-values`). Challenge ids are valid anchors too.
- Within the same lesson, `[see above](#reading-values)` works too. The validator checks every anchor.
- External: plain `https://` links open in a new tab. Link to docs.python.org for depth.

### Tables

GFM tables are great for cheat sheets. Escape pipes inside cells as `\|`, for example `` `a \| b` ``.

## Challenges and the test API

Every lesson ends with a `## Challenges` section holding **2 to 4 challenges**, ordered easy → hard.

````md
:::challenge id=rotate-list title="Rotate a list" difficulty=medium
Description in Markdown. State the function name, signature, and any constraints.
Example blocks with any non-python language (text, output, ...) stay in the description.

```js
// Optional: the JavaScript you'd write. Shown as "JavaScript version".
const rotate = (xs, k) => ...
```

```python starter
def rotate(xs, k):
    ...
```

```python solution
def rotate(xs, k):
    ...
```

```python tests
@test("rotates right")
def _():
    eq(rotate([1, 2, 3, 4, 5], 2), [4, 5, 1, 2, 3])
```

```hint
Hints are Markdown, revealed one at a time. Two or three of them, from gentle to explicit.
```
:::
````

- `id` is kebab-case and **globally unique** across all lessons. Prefix it with something lesson-specific when it's generic (`dict-group-by`, not `group-by`).
- `difficulty` is `easy`, `medium` or `hard`.
- The **starter must parse** but should fail the tests. The validator warns if a starter already passes. The **solution must pass every test**. Write it the way a strong Python developer would, because learners will read it.
- Learners can reveal the solution and the tests, so test names should read as a spec.

### Test API

Tests run in a namespace containing the learner's top-level names (so `rotate` is in scope) plus these helpers:

| Helper | Purpose |
| --- | --- |
| `@test("name")` | Register a test function (`@test` with no argument uses the function name). `async def` tests are awaited. |
| `eq(actual, expected, msg=None)` | `actual == expected`, with a readable diff message. **Use this instead of bare `assert`.** |
| `approx(actual, expected, tol=1e-9)` | Floats. |
| `check(condition, msg)` | Any boolean condition, with your message. |
| `raises(ExcType, fn, *args, **kwargs)` | Assert that the call raises. Returns the exception. Also usable as `with raises(KeyError): ...`. |
| `output_of(fn, *args)` | Call `fn` and return everything it printed. |
| `stdout` | Everything the learner's code printed at module level. |
| `requires_syntax(ast.ListComp, msg)` / `forbids_syntax((ast.For, ast.While), msg)` | Enforce idioms by inspecting the learner's AST. |
| `requires_call("sorted")` / `forbids_call("len")` | The learner must (not) call a function or method with this name. |
| `requires_import("functools")` / `forbids_import(...)` | Same, for imports. |
| `source`, `tree`, `ast` | The learner's raw source, its parsed `ast.Module`, and the `ast` module, for custom checks. |

Guidelines:

- **Test behaviour first, idiom second.** One or two syntax checks per challenge, when the point of the exercise is an idiom ("use a comprehension", "no index loops"). Give the reason in the message.
- Cover edge cases a JS developer would get wrong: empty inputs, falsy values like `0` and `""`, negative numbers, mutation of inputs, `None` vs missing.
- Tests must be deterministic. No randomness, wall-clock timing, or network.
- Each test should check one idea, so a learner can see exactly what's failing.

## The Python sandbox

Code runs in **Pyodide 314 (CPython 3.14)** inside a Web Worker. The same harness runs in Node for validation.

- Python 3.10 to 3.14 features all work (`match`, `except*`, `TaskGroup`, PEP 695 generics, t-strings...). Readers may run older Pythons locally, so **mention the minimum version** when you use something newer than 3.10, e.g. "(3.12+)".
- Every run gets a fresh `__main__`. Snippets never see each other's variables, so make each one self-contained.
- **Top-level `await` works**, and a top-level `asyncio.run(main())` is rewritten to `await main()` (the browser owns the event loop). Write idiomatic `asyncio.run(main())`.
- `time.sleep` works but blocks, so keep sleeps short (≤ 0.2 s total per snippet).
- There's an **in-memory filesystem**. `open("notes.txt", "w")` works, but files don't persist across page reloads. Create the files you need inside the same snippet.
- **Not available:** `input()` (raises), threads and processes (`threading.Thread.start()` raises `RuntimeError`), network access, and `zoneinfo` time zones (they need the `tzdata` package). Show those as static `python` code.
- **Stdlib only** in runnable code. Pyodide can load NumPy and friends on demand, but the validator runs offline. Show third-party code as static fences. `sqlite3`, `csv`, `json`, `tomllib`, `logging`, `unittest`, `doctest`, `unittest.mock`, `argparse`, `asyncio`, `contextvars`, `ast`, `inspect`, `dis`, `gc` and `weakref` all work.
- Runs time out after 10 seconds. Pyodide is about 2 to 3 times slower than native CPython: size large-input tests so an efficient solution finishes in well under a second.
- **Keep recursion shallow (under about 500 frames).** Plain Python recursion past the limit (1000) raises `RecursionError` as usual. But recursion through C code, such as a `@functools.cache`-decorated function about 900 deep, or building and freeing very deeply nested structures, overflows the browser's WebAssembly stack and **kills the interpreter**. The site restarts Python and reports it, but don't design snippets or tests that go there. Use bottom-up/iterative solutions for big inputs.
- **The interpreter is reused across runs on a page.** `__main__` is fresh every run, but `sys.modules` persists. Demos that write and import their own module files should call `sys.modules.pop("name", None)` first.
- **asyncio runs on the browser's event loop.** It mostly behaves like CPython, but eager task factories aren't supported, and tasks still pending when `main()` returns are **not** cancelled. Await everything you start, keep total sleeps small, and show the rare CPython-only behaviour as static code. A coroutine that awaits forever can't be interrupted (the 10 s timeout still kills the run), so guard async tests with `asyncio.timeout(...)`.

## Course formats

The core course, **Python in Practice** and **Advanced Python** use the standard lesson shape described in this guide. The other courses reuse the same building blocks in a different proportion:

- **Algorithms & Interview Prep.** Per pattern: one short explanation including the time and space complexity, the JS habit it replaces where relevant, and a `python run` playground. Add a few quizzes, mostly about complexity and behaviour, and finish with **5 challenges** (4 in the toolkit lesson) from easy to hard. Tests cover edge cases thoroughly: empty input, one element, duplicates, negatives, ties. Where efficiency is the point, include **one large-input test**, sized so an efficient solution takes well under a second in the validator and a quadratic one would blow the 10 s timeout. Respect the recursion note in [The Python sandbox](#the-python-sandbox): iterative DFS, bottom-up DP for large inputs.
- **JS → Python Drills.** Minimal prose: an intro paragraph and optionally a small table of the mappings the set uses. Then **8 to 10 challenges**, roughly 4 easy, 3 medium and 2 hard. Each one has a `js` fence holding the code to translate, a description stating the Python function name and signature, tests that pin down behaviour (including the edge cases where JS and Python differ), and, where it matters, one idiom check. Playgrounds and quizzes are optional (0 to 2). Challenge ids start with `drill-`.
  - In **Make It Pythonic**, the starter is working but JS-flavoured Python. It passes the behaviour tests and fails only the idiom checks. That's intended (the validator only warns when a starter passes *every* test).
- **Guided Projects.** Open with "What you'll build" (with a sample of the finished thing working) and "How the pieces fit", then **5 or 6 steps**. Each step is a `## Step N: ...` section with a short design explanation, then one challenge with id `<project>-step-N`. **Every step's starter contains the complete reference solution of all previous steps, plus the stub for the new piece**, so each step stands alone even if the learner skipped the last one. Step tests focus on the new piece, and a final integration step exercises everything together. Keep each step's new code to roughly 10 to 40 lines.
- **Checkpoints.** One exam per part of the core course. A one-paragraph intro links every lesson covered, then sections by topic hold **16 to 20 quizzes** in total (mostly `:::quiz output`, so they're proven correct), then `## Final challenges` with **4 or 5 integrative challenges** that combine several of the part's topics. Don't teach new material; each section can end with a one-line pointer back to the owning lesson.

## Style guide

- **Voice.** Crisp, confident, peer-to-peer, occasionally wry, never padded. Say "Python raises `KeyError`", not "it might be worth noting that Python may raise an error". No emoji in prose.
- **Show, then explain.** Lead each section with a `:::compare`, follow with one to three short paragraphs on the mental-model shift, then a `python run` playground to poke at.
- **Every section earns its place** with a difference, a trap, or an idiom. If Python and JS behave the same, say so in one sentence and move on.
- **Density.** A lesson usually has 6 to 10 `##` sections, 6 to 12 playgrounds, 3 to 6 quizzes, several gotchas and pythonic callouts, a cheat-sheet table, and 2 to 4 challenges. Target about 25 to 40 minutes.
- **Snippets.** Short (≤ 15 lines), realistic names (`users`, `orders`, `prices`, never `foo`), and outputs labelled when there are several. `print(f"{expr=}")` is a handy pattern: it prints `expr=value`.
- **Correctness over cleverness.** Every claim about behaviour must be true for CPython 3.14. If you aren't sure, run it. Mention a performance characteristic only when you're sure of it.
- **Modern Python.** Use f-strings, `pathlib`, type hints where they help readability (not everywhere), and `X | None` rather than `Optional[X]`. PEP 8 naming, 4-space indents.
- **Cross-link** with `lesson:` links instead of re-teaching another lesson's topic.
- **End with** a `## Cheat sheet` table (JS | Python | Notes) and then `## Challenges`.

### Lesson skeleton

````md
---
title: ...
part: ...
summary: ...
minutes: 30
---

Two or three sentences: what maps to what, and the one mental-model shift that matters most.

## First concept

:::compare
...
:::

Short explanation.

```python run
...
```

:::gotcha ...
:::

## ...more sections...

## Cheat sheet

| JavaScript | Python | Notes |
| --- | --- | --- |

## Challenges

:::challenge ...
:::
````

## The reference page

`content/reference.md` powers the searchable **JS → Python Rosetta stone** at `#/reference`. Its structure is strict:

````md
---
title: Reference
---

## Arrays & lists

### Map over items
```js
nums.map((n) => n * 2)
```
```python
[n * 2 for n in nums]
```
```python
list(map(lambda n: n * 2, nums))
```
Prefer the comprehension. `map()` returns a lazy iterator. See [Comprehensions](lesson:map-filter-reduce).
````

- `##` is a category and `###` is an entry. Titles are short and searchable: name the task, and include the JS API where there is one (`` `arr.map(fn)`: transform each item ``).
- An entry's **first fence is the JavaScript side** and every following fence is a Python alternative, best first. Any language works (`bash` for `npm install` vs `pip install`), but keep each fence to one to four lines.
- Prose after the fences is a short note: the catch, the version requirement, or a `lesson:` link.
- Python fences are syntax-checked, so mark fragments with `nocheck`.

## Validating your work

```bash
npm run validate -- 07-lists          # just your lesson (any path substring: file name or slug)
npm run validate -- algorithms        # a whole course
npm run validate                      # everything
npm run validate -- --no-run          # structure and link checks only
```

Filters match the lesson's path, `content/courses/<course>/NN-slug.md`. Lesson numbers repeat across courses, so filter by **slug**, not by number.

The validator parses every lesson and checks frontmatter (including that the part belongs to the course), ids unique across all courses, and `lesson:` links. It **executes** every playground, output quiz and challenge (solution and starter) with the real Pyodide runtime, and parses every other Python fence. A lesson is done when it has **0 errors**. A warning for links to lessons that don't exist *yet* is fine.

## Curriculum maps

Use these slugs for `lesson:` links. Slugs are global, so `lesson:dicts` works from any course. The bullets are each lesson's scope. Stay inside your scope and link to the lesson that owns a topic instead of teaching it twice. Later courses build on the core course: link back to it rather than re-teaching basics.

## Course: Python for JavaScript Developers (`python-for-js-devs`)

The core course: 25 lessons, all written. Its six parts follow.

### Foundations

**01 `first-contact`: First Contact: Syntax & Shape.** The same small program in JS and Python, annotated. Indentation as syntax, colons, no braces or semicolons, comments and docstrings vs JSDoc, implicit line continuation inside brackets. `print()` vs `console.log` (`sep`, `end`, multiple args, `f"{x=}"`). `pass`. Naming conventions and PEP 8; ruff/black ≈ prettier. Running code: the REPL, scripts, `if __name__ == "__main__":` (≈ `import.meta.main`). Introspection with `type()`, `help()`, `dir()`; "everything is an object". A keyword Rosetta table (`null`→`None`, `true`→`True`, `&&`→`and`, `else if`→`elif`, `throw`→`raise`, `catch`→`except`, `function`→`def`, no `new`).

**02 `variables-and-scope`: Variables, Types & Scope.** No `let`/`const`/`var`: names are labels bound to objects. Dynamic but **strongly** typed (`"1" + 1` is a `TypeError`), with explicit conversions. A built-in types table vs JS, `type()`/`isinstance()` vs `typeof`/`instanceof`. `None` replaces both `null` and `undefined`, and missing attributes raise. Multiple assignment, swap, `del`. Mutability vs immutability and aliasing. **No block scope** (loop variables leak and survive the loop), LEGB, `global`, `nonlocal`, the `UnboundLocalError` trap. Constants by convention (`UPPER_CASE`, `typing.Final`), and immutable alternatives to `Object.freeze`.

**03 `numbers-and-math`: Numbers & Math.** int (arbitrary precision; no `MAX_SAFE_INTEGER` or `BigInt`) vs float vs complex. `/` vs `//` (floors toward −∞), `%` takes the divisor's sign, `divmod`, `**`, `pow(b, e, mod)`. **No `++`/`--`**: `i++` is a SyntaxError and `++i` is silently `+(+i)`; use `i += 1`, and loop with `range` (link `control-flow`). `round()` is banker's rounding; `math.floor/ceil/trunc`. The `Math.*` → `math` map, with builtins `abs`/`min`/`max`/`sum` taking iterables, `math.isclose`, `inf`/`nan`, `math.prod/comb/gcd/fsum`. Strict parsing (`int("42px")` raises vs `parseInt`), `int(s, base)`, `float.is_integer()`. Format specs instead of `toFixed`/`toString(2)` (`:.2f`, `:,`, `:b`, `:%`). Literals (`1_000_000`, `0o`, `0b`, `0x`). `0.1 + 0.2`, `Decimal` (from strings), `Fraction`. Bitwise operators (no `>>>`), `bool` is an int. `random` vs `Math.random` (`randint` is inclusive), `statistics`.

**04 `strings`: Strings & f-strings.** Quote styles, triple quotes, raw strings. Template literals → f-strings: expressions, the format-spec mini-language, `=` and `!r`, nested quotes (3.12+). Tagged templates → **t-strings** (3.14, `string.templatelib.Template`). Recognise `str.format`/`%`. A big method-mapping table (`trim`→`strip`, `padStart`→`rjust`/`zfill`, `includes`→`in`, `indexOf`→`find`/`index`, `replace` replaces **all**, `startswith` accepts a tuple, `removeprefix`, `partition`, `splitlines`, `casefold`, `isdigit`...). Immutability, building with `"".join`, `len()` counts code points (vs UTF-16 units), `ord`/`chr`, `str()` vs `repr()`, comparison. Regex: `re` vs `RegExp` (`search`/`match`/`fullmatch`/`findall`/`finditer`/`sub` with a function, named groups `(?P<name>...)`, flags, no `/g` because `findall`/`sub` are global). Bytes vs str (`encode`/`decode` ≈ `TextEncoder`).

**05 `truthiness-and-equality`: Truthiness, Booleans & Equality.** `True`/`False`/`None`. Falsy values, with the big differences: **empty containers are falsy**, and **NaN is truthy**. Custom `__bool__`/`__len__`. `and`/`or`/`not` return operands, with their precedence. Replacements for `??` (`x if x is not None else d`, and the `or`-default pitfall with `0` and `""`) and `?.` (`getattr`, chained `.get`, walrus). `==` is value equality, deep for containers. `is` is identity (use it for `None`). No `===` and no coercion (`1 == "1"` is False, `1 == 1.0 == True` is True). Never `is` for values (small-int caching). Chained comparisons. Ordering across types raises `TypeError`; sequences compare lexicographically. Conditional expressions, `any`/`all`.

**06 `control-flow`: Control Flow & Loops.** `if`/`elif`/`else`, the conditional expression, `pass`. `for...of` → `for x in`. C-style loops → `range(start, stop, step)` (reverse ranges). `for...in` keys → `for k in d`. `forEach((x, i))` → `enumerate(xs, start=1)`. `zip` (`strict=True`). `while`, no `do...while` (`while True` + `break`), `break`/`continue`, no labeled break (flags, functions, `for...else`). **`for...else` / `while...else`.** The walrus `:=` in loops and conditions. `match` basics as a `switch` replacement (no fall-through, `case _:`, `|`), with depth in `pattern-matching`. Mutating a list while iterating.

### Collections

**07 `lists`: Arrays → Lists.** *(Written.)* Creation, indexing, slicing, push/pop/shift/unshift/splice, searching, spreading, sorting with `key=`, join/split, copying, iterating.

**08 `map-filter-reduce`: map, filter, reduce → Comprehensions.** List comprehensions replace `.map().filter()` chains (`[f(x) for x in xs if p(x)]`). The filter clause vs a conditional expression in the output (`[a if c else b for x in xs]`). Dict and set comprehensions. Nested comprehensions for `flat`/`flatMap`, and the order of `for` clauses. Generator expressions (lazy: `sum(x * x for x in xs)`). The `map()`/`filter()` builtins return lazy, single-use iterators. `functools.reduce`, and why `sum`, `min`, `max`, `math.prod`, `any`, `all`, `"".join`, `Counter` and dict comprehensions usually replace it. `find` → `next((x for x in xs if p(x)), None)`, `findIndex` with `enumerate`, `findLast`. `some`/`every` → `any`/`all` (short-circuiting). `forEach` → a plain `for` loop (comprehensions aren't for side effects). `Object.groupBy` → `defaultdict(list)` or `itertools.groupby`. Partitioning. `zip`/`enumerate` inside comprehensions. `min`/`max` with `key=` and `default=`. The walrus inside comprehensions. Method-chaining habits → generator pipelines or named steps. Readability limits, and comprehension scope (the variable doesn't leak).

**09 `tuples-and-unpacking`: Tuples & Destructuring.** Tuples are immutable (shallowly), the `(1,)` gotcha, and when to use a tuple vs a list. Hashable, so usable as dict keys. Unpacking ≈ array destructuring: swap, `first, *rest`, `*init, last`, nested patterns, `_`. Unpacking errors vs JS leniency. No object destructuring, and the alternatives (`itemgetter`, `match` mapping patterns). Unpacking in `for` loops (`for i, (k, v) in enumerate(d.items())`). Returning multiple values. Spreading `[*a, *b]`, `f(*args)`, `print(*xs)`. Transpose with `zip(*rows)`. A `NamedTuple` teaser (depth in `dataclasses-and-enums`). Lexicographic tuple comparison.

**10 `dicts`: Objects & Maps → Dicts.** Literal syntax (keys are expressions: `{name: 1}` uses the *variable*). `d["k"]` raises `KeyError`, `.get(k, default)`. No dot access (`SimpleNamespace`/dataclasses instead). `in` checks keys. `keys()`/`values()`/`items()` are live views. Insertion order, with **no integer-key reordering**. **Keys aren't coerced to strings** (`d[1]` ≠ `d["1"]`), so dict is a value-equality `Map`, and tuples work as composite keys. Update/merge (`|`, `|=`, `{**a, **b}`), `pop`, `setdefault`, `del`. `Object.fromEntries` → `dict(pairs)`, `dict(zip(...))`, dict comprehensions, inverting and filtering. `defaultdict`, `Counter`, `ChainMap`. JSON (`json.dumps(indent=2)`, `loads`, the null/true mapping, `default=`). Mutating during iteration raises `RuntimeError`. Sorting by value. `WeakMap` → `weakref.WeakKeyDictionary`.

**11 `sets`: Sets.** `{1, 2}` literal, but `set()` for empty (`{}` is a dict!). Hashable members only. **Unordered** (unlike JS `Set`'s insertion order). `add`/`remove`/`discard`/`pop`. O(1) `in`. Operators `|` `&` `-` `^` `<=` `<` `>=` and `isdisjoint`, mapped to the ES2025 `Set` methods (`union`, `intersection`, `difference`, `symmetricDifference`, `isSubsetOf`...); method forms accept any iterable; in-place `|=`. Set comprehensions, `frozenset`. Order-preserving dedupe with `list(dict.fromkeys(xs))` vs `[...new Set(xs)]`. "Seen" sets in loops.

### Functions & Iteration

**12 `functions`: Functions, Arrows & Lambdas.** `def` vs declarations and arrows. Implicit `return None`. **No hoisting** (`def` runs at runtime). Functions are objects. Arrow → `lambda` (a single expression only; prefer `def`; PEP 8 frowns on `f = lambda`). No `this` binding issues. Defaults are **evaluated once**, giving the mutable-default trap and the `None` sentinel idiom. Keyword arguments at the call site replace options objects. Keyword-only `*`, positional-only `/`, `*args` ≈ rest, `**kwargs` ≈ options bag, call-site unpacking `f(*xs, **opts)`. Wrong or missing arguments raise `TypeError` (JS silently gives `undefined`). Closures, `nonlocal`, **late-binding closures in loops** (the `var` trap without a `let` fix; the default-arg fix). Recursion limit, no TCO. Docstrings and `help()`. A brief note on annotations (link `type-hints`).

**13 `decorators`: Higher-Order Functions & Decorators.** HOFs as in JS. `@decorator` is `f = decorator(f)`. Writing decorators (timing, logging) with `functools.wraps`, decorator factories with arguments (`@retry(times=3)`), stacking order, class-based decorators (`__call__`), class decorators. Built-ins: `functools.cache`/`lru_cache` (memoization), `property`/`staticmethod`/`classmethod` (brief, link `classes`), `singledispatch`. `functools.partial` ≈ `bind`, and the `operator` module (`itemgetter`, `attrgetter`, `methodcaller`, `operator.add`). Contrast with TC39/TS decorators.

**14 `iterators-and-generators`: Iterators & Generators.** The protocol: `iter()`/`next()`, `__iter__`/`__next__`, `StopIteration` vs `[Symbol.iterator]` and `{value, done}`; `next(it, default)`. Iterables vs iterators. `map`/`filter`/`zip`/`enumerate`/`reversed` return iterators, and **exhaustion** is the trap. Generator functions (`yield` ≈ `function*`), laziness, infinite generators, `yield from` ≈ `yield*`, `send()` ≈ `next(v)`, generator return values. Generator expressions (`sum(x * x for x in xs)`). An `itertools` tour (count, cycle, repeat, chain, islice, takewhile/dropwhile, groupby needing sorted input, product, permutations, combinations, accumulate ≈ scan, pairwise, batched 3.12, zip_longest, starmap, tee). The ES2025 iterator helpers compared. Lazy pipelines. Custom iterables via a generator `__iter__`.

### Objects & Classes

**15 `classes`: Classes & Objects.** Syntax side by side. `__init__` vs `constructor`, explicit `self`, no `new`, attributes created by assignment. Class vs instance attributes (the **shared mutable class attribute** trap ≈ arrays on a prototype). Bound methods (`f = obj.method; f()` just works). Privacy: `_name` convention and `__name` mangling vs `#private`. `@property` + setter vs `get`/`set`, `functools.cached_property`. `@staticmethod`, and `@classmethod` alternative constructors. Inheritance, `super().__init__()`, `isinstance`/`issubclass`, multiple inheritance and MRO, mixins, `abc.ABC`/`@abstractmethod`. `getattr`/`setattr`/`hasattr`, `__dict__`, `__slots__` (brief). Duck typing. `__repr__`/`__str__` teaser (depth in `dunder-methods`).

**16 `dunder-methods`: Dunder Methods: Python's Protocols.** Operators and builtins dispatch to `__dunder__` methods (vs `Symbol.iterator`, `Symbol.toPrimitive`, `valueOf`, `toString`). `__repr__` vs `__str__`, `__eq__`/`__hash__` (defining `__eq__` makes instances unhashable), ordering with `functools.total_ordering`. Container protocols: `__len__`, `__getitem__` (indexing, slicing, iteration fallback), `__setitem__`, `__delitem__`, `__contains__`, `__iter__`, `__reversed__`. Operator overloading (`__add__`, `__radd__`, `__iadd__`, `__mul__`, `__neg__`, `__abs__`, returning `NotImplemented`); JS has none. `__bool__`, `__call__`, `__getattr__` (≈ a `Proxy` get-trap fallback), `__enter__`/`__exit__` teaser (link `context-managers`), `__init_subclass__` (brief).

**17 `dataclasses-and-enums`: Dataclasses, NamedTuples & Enums.** `@dataclass` generates `__init__`, `__repr__` and `__eq__`. `field(default_factory=list)`, `frozen=True` (immutable and hashable), `order=True`, `slots=True`, `kw_only=True`, `__post_init__` validation. `dataclasses.replace`/`copy.replace` (3.13) ≈ `{...obj, x: 1}`. `asdict`. When to use a dict vs a dataclass vs a NamedTuple vs a TypedDict vs pydantic (≈ zod, static mention). `typing.NamedTuple` (`_replace`, `_asdict`, unpacking). `enum.Enum` vs TS enums, `Object.freeze` and literal unions: `.name`/`.value`, iteration, `auto()`, `StrEnum` (3.11), `IntEnum`, `Flag`, identity comparison, enums in `match`.

### Robust Code

**18 `exceptions`: Errors & Exceptions.** `try`/`except`/`else`/`finally`, catching specific types (tuples, `as e`), and why to avoid a bare `except`. `raise ValueError(msg)` vs `throw new Error`. The hierarchy (`BaseException` vs `Exception`) and the common built-ins mapped from JS (`ReferenceError`→`NameError`, `RangeError`→`ValueError`/`IndexError`...). **Where JS returns `undefined`/`NaN`/`Infinity`, Python raises.** Custom exceptions with fields, bare `raise` to re-raise, chaining `raise X from err` ≈ `new Error(msg, { cause })`, `from None`. EAFP vs LBYL, `contextlib.suppress`. `ExceptionGroup` and `except*` (3.11) ≈ `AggregateError`, `add_note()`. Reading tracebacks, and `assert`.

**19 `context-managers`: Context Managers & `with`.** `with` guarantees cleanup (≈ try/finally ≈ JS explicit resource management `using`/`Symbol.dispose`). Files with `open()` and `pathlib` (in-memory FS in the playground; always pass `encoding="utf-8"`). Writing managers as classes (`__enter__`/`__exit__`, the exception arguments, suppressing by returning True) and with `@contextlib.contextmanager` (try/finally around `yield`). Stdlib helpers: `suppress`, `redirect_stdout`, `ExitStack`, `closing`, `nullcontext`, `chdir` (3.11). Multiple managers in a parenthesised `with` (3.10+). `async with` teaser (link `async`).

**20 `modules-and-tooling`: Modules, Packages & Tooling.** Every `.py` file is a module. `import x`, `from x import y`, `as`, why to avoid `import *`, `__all__`, no default exports. Modules execute once and are cached in `sys.modules`. Circular imports. Packages (`__init__.py`), relative imports, `__name__`/`__main__`, `python -m`. Demo modules in the playground by writing files to the in-memory FS and importing them (call `importlib.invalidate_caches()` after writing). The tooling map: npm → pip/**uv**, package.json → pyproject.toml (example), lockfiles, node_modules → `.venv`, npx → `uvx`/pipx, nvm → `uv python`/pyenv, eslint+prettier → **ruff**, tsc → mypy/pyright, jest/vitest → **pytest** (example test file), the PyPI registry, `[project.scripts]` ≈ `bin`, src layout.

### Advanced Python

**21 `async`: Async/Await & asyncio.** Same keywords, different model: calling an async function returns a **coroutine that doesn't run until awaited or scheduled** (JS promises start eagerly), so `asyncio.create_task` starts work. The explicit event loop (`asyncio.run`). `asyncio.sleep` ≈ a `setTimeout` promise. `gather` ≈ `Promise.all` (`return_exceptions=True` ≈ `allSettled`), `asyncio.timeout`/`wait_for`, `wait(FIRST_COMPLETED)` ≈ `race`, `as_completed`, `TaskGroup` (3.11) structured concurrency. Cancellation ≈ `AbortController`. `async for`/async generators ≈ `for await`, `async with`. `asyncio.Queue`, `Semaphore` for limiting concurrency. Most of the ecosystem is sync (requests vs httpx), and CPU work blocks the loop. Async tests are supported in challenges (`@test` on an `async def`).

**22 `type-hints`: Type Hints for TypeScript Devs.** Annotation syntax; erased at runtime like TS, but introspectable (`__annotations__`, `typing.get_type_hints`, lazy annotations in 3.14). A big mapping table: `number`→`int | float`, `T[]`→`list[T]`, tuples, `Record<K, V>`→`dict[K, V]`, unions, `T | undefined`→`T | None`, `any`→`Any`, `unknown`→`object`, `never`→`Never`, function types→`Callable[[A], R]`, literal types→`Literal`, readonly→`Final`/`Sequence`/`Mapping`, object shapes→`TypedDict` (`NotRequired`, `ReadOnly`), interfaces→`Protocol` (structural), generics `def f[T](x: T) -> T` (3.12) and `TypeVar`, `type Alias = ...` (3.12), casts→`typing.cast`, type guards→`TypeIs` (3.13), `@overload`, `Self`, `ParamSpec`. No `keyof`/mapped types. Checkers: mypy and pyright ≈ tsc, `reveal_type`. Narrowing with `isinstance`. Stubs (`types-*` ≈ `@types/*`). Runtime validation with pydantic ≈ zod. Challenges can introspect annotations or build runtime checks with `inspect.signature`.

**23 `pattern-matching`: Structural Pattern Matching.** `match`/`case` vs `switch`: literals, `|`, `_`, guards, `as`. **Bare names capture** (`case RED:` captures, so use dotted names like `Color.RED`). Sequence patterns (`[x, y, *rest]`), mapping patterns (`{"type": "click", "pos": (x, y)}`; extra keys ignored; `**rest`), class patterns (`Point(x=0, y=y)`, `__match_args__`), nesting. Use cases: command parsing, Redux-style reducers over dict actions, expression-tree evaluators, JSON shape checks. Compare with TS discriminated unions and the TC39 proposal.

**24 `standard-library`: Batteries Included.** An npm → stdlib mapping table (lodash → itertools/functools/collections/operator; date-fns/dayjs → datetime (+ zoneinfo); uuid → uuid; crypto → hashlib/secrets/hmac; path/fs → pathlib/shutil; process.argv/commander → sys.argv/argparse; child_process → subprocess; querystring/URL → urllib.parse; dotenv → os.environ; csv → csv; sqlite → sqlite3; base64; logging libs → logging; util.inspect → pprint; structuredClone → copy.deepcopy; perf_hooks → time.perf_counter). Runnable tours of `collections`, `datetime` (1-based months vs `Date`'s 0-based!, timedelta, ISO parsing, strftime, aware vs naive, `timezone.utc`), `pathlib`, `json`, `csv` with `io.StringIO`, `textwrap`, `pprint`, `heapq`, `bisect`, `statistics`, `random`/`secrets`, `uuid`, `hashlib`, `base64`, `urllib.parse`, `difflib`, `logging`. Notable third-party packages as static mentions (requests/httpx, pydantic, FastAPI, rich, typer, pytest, numpy/pandas).

**25 `gotchas`: Gotchas: A Field Guide for JS Brains.** A rapid-fire, quiz-heavy recap of the traps, each with a one-paragraph explanation and a link to the owning lesson. Mutable defaults, late-binding closures, `[[0]*3]*3`, `++i`, `is` vs `==`, `sort()` returns `None`, `{}` is a dict, `(1)` isn't a tuple, falsy empty containers, truthy NaN, `0 or default`, `round(2.5)`, `-7 % 3`, `//` floors, strict `int()`, `"1" + 1`, iterator exhaustion, mutating while iterating, no block scope, `UnboundLocalError`, shadowing builtins (`list`, `id`, `type`, `sum`), `{1: "a", True: "b"}`, `a += [x]` vs `a = a + [x]` aliasing, the shared class attribute, forgetting `self`, a coroutine never awaited, `split()` vs `split(" ")`, `replace` replaces all. Challenges are "fix the JS-brained bug" exercises: the starter contains the bug and the tests prove the fix.

## Course: Python in Practice (`python-in-practice`)

Parts: `Files & Data`, `Tools & Automation`, `Quality & Testing`, `Services & Storage`. A standard lesson format, aimed at someone who has finished the core course. Show the JS/Node equivalent (`fs`, `path`, commander, winston, jest, fetch, better-sqlite3...) at the start of each section.

**01 `files-and-paths` (Files & Data): Files & Paths.** `pathlib.Path` vs Node's `path`/`fs`: joining with `/`, `.name`/`.stem`/`.suffix`/`.parent`, `resolve`, `relative_to`, `with_suffix`. Reading and writing (`read_text`/`write_text`/`read_bytes`, `open()` modes, always `encoding="utf-8"`, newlines), lazy line iteration. `exists`/`is_file`/`mkdir(parents=True, exist_ok=True)`/`unlink`/`rename`/`replace`. `iterdir`/`glob`/`rglob` vs `readdir` and glob packages, `stat()`, `shutil` (copy, copytree, move, rmtree), `tempfile`, the atomic-write pattern, `os.walk`. Every demo creates its own files in the in-memory filesystem.

**02 `text-processing` (Files & Data): Text Processing & Regular Expressions.** `re` in depth: compiled patterns, flags (including `VERBOSE` with comments), named groups `(?P<name>...)` vs JS `(?<name>...)` (check what 3.14 accepts), non-capturing groups, backreferences, lookarounds, greedy vs lazy, `finditer` with spans, `sub` with a function and `\g<name>`, `split` with capture groups, `fullmatch` for validation, `re.escape`. Mapping from JS RegExp flags and methods (`matchAll`, `replaceAll` with a callback, the sticky flag). Parsing structured text (log lines, `key=value`), `str.translate`, `textwrap`, `string.Template`, `difflib` (`get_close_matches`, `unified_diff`), Unicode normalisation and `casefold`.

**03 `data-formats` (Files & Data): CSV, JSON & Config Files.** `csv` (reader/writer, `DictReader`/`DictWriter`, `newline=""`, dialects and delimiters, quoting) with `io.StringIO`. `json` in depth: `dumps` options, a custom `default=` for datetimes/dataclasses/sets, `object_hook`, `JSONDecodeError` positions, number-precision differences from JS. `tomllib` (3.11+, read-only) vs package.json-style config, `configparser`, environment-based config, `base64`/`binascii`, `struct` for binary records (≈ `DataView`).

**04 `dates-and-times` (Files & Data): Dates, Times & Durations.** `datetime`/`date`/`time`/`timedelta` vs JS `Date`: months are 1–12, objects are immutable, and timestamps are float seconds rather than milliseconds. ISO 8601 (`fromisoformat`, which accepts `Z` since 3.11, and `isoformat`), a `strftime`/`strptime` code table, naive vs aware, `timezone.utc`, fixed offsets, `zoneinfo` and DST pitfalls (static), arithmetic (no built-in add-months: use `calendar.monthrange`), `calendar`, `time.perf_counter`/`monotonic`, and the Temporal API compared. **Tests and snippets must be deterministic**: never compare against `now()`, inject "today" instead.

**05 `data-wrangling` (Files & Data): Data Wrangling with the Standard Library.** List-of-dicts pipelines, grouping and aggregation (`defaultdict`, `Counter`, `groupby` after sorting), multi-key sorting, `statistics` (mean, median, mode, stdev, quantiles), joining datasets through dict indexes, pivoting and reshaping (`zip(*rows)`, nested dicts), dedupe and missing values, top-N with `heapq`, rolling windows with `deque`, text reports with f-string alignment, `pprint`. When to reach for pandas/polars (static). Compared with lodash and Array-method pipelines.

**06 `command-line-tools` (Tools & Automation): Command-Line Tools.** `sys.argv`. `argparse`: positionals and options, `type`, `default`, `choices`, `store_true`, `nargs`, mutually exclusive groups, subcommands, help text, and `parse_args(list)` for testing. Exit codes (`sys.exit`, `SystemExit`), stdin/stdout/stderr, `os.environ`, `shlex`, `subprocess.run` (static), entry points, click/typer (static). Compared with commander/yargs and `process.argv`.

**07 `logging-and-debugging` (Tools & Automation): Logging & Debugging.** `logging`: `getLogger(__name__)`, levels, `basicConfig`, handlers/formatters (a `StreamHandler` to a `StringIO` for demos), `logger.exception`, lazy `%s` arguments, `extra`, `LoggerAdapter`, filters, propagation, `dictConfig`, JSON logging. Compared with console/winston/pino. Debugging: `breakpoint()`/pdb commands (static), the `traceback` module, `warnings` (filters, `DeprecationWarning` visibility), `pprint`, `f"{x=}"`, `sys.excepthook`, reading chained tracebacks.

**08 `testing-with-python` (Quality & Testing): Testing: unittest, pytest & Mocks.** `unittest.TestCase` (assertions, `subTest`, setUp/tearDown), run inside the sandbox with `unittest.main(argv=[""], exit=False)` or a `TextTestRunner` writing to a `StringIO`. `doctest`. pytest style (plain `assert`, fixtures, `parametrize`, `tmp_path`, `monkeypatch`, `pytest.raises`) as static code, with a jest/vitest mapping table. `unittest.mock` (`Mock`, `MagicMock`, `patch`, `side_effect`, `assert_called_once_with`, `autospec`), test doubles for time and randomness, hypothesis and coverage (static). Challenge idea: the learner writes a `TestCase` that must pass against a correct implementation and fail against several buggy ones (mutation testing).

**09 `code-quality` (Quality & Testing): Code Quality & Refactoring.** PEP 8 essentials, `import this`. ruff (lint and format; the F/E/B/I/UP/SIM rule families), type checking in CI, docstring conventions (PEP 257, Google style), naming. Refactoring moves: guard clauses and early returns, removing flag arguments, extracting functions, dataclasses instead of dict-records, no mutable defaults or globals, EAFP, small pure functions. pyproject/pre-commit config (static). Challenges are refactoring katas: behaviour tests plus AST checks such as maximum nesting depth, no `range(len(...))` and no `global`.

**10 `performance-basics` (Quality & Testing): Performance: Measure, Then Speed Up.** `timeit`, `time.perf_counter`, `cProfile`/`pstats` (check they work in the sandbox). A big-O table of built-in operations (list `insert(0)`/`in`/`pop(0)`, dict/set, deque, string concatenation, sorting). Choosing structures (set membership, deque, heapq, bisect), generator vs list memory (`sys.getsizeof`), caching (mind the sandbox's recursion note), hoisting work out of loops, `"".join`, `__slots__`, and when to use numpy/PyPy/C extensions (static). Challenges: speed up slow functions, with a large-input test that times out on the quadratic version.

**11 `http-and-apis` (Services & Storage): HTTP & JSON APIs.** There's no network in the sandbox, so demos use fake transports and canned responses. `urllib.parse` (`urlsplit`, `urlencode`, `quote`, `parse_qs`, `urljoin`), `http.HTTPStatus`, modelling requests and responses with dataclasses, `requests`/`httpx` usage (static: params, headers, json, timeouts, `raise_for_status`, sessions), async httpx (static). Retries with exponential backoff (inject `sleep`), pagination with generators, rate-limit and `Link` headers, an API client class built over an injectable transport, and serving APIs with FastAPI/Flask (static) vs Express. Compared with fetch/axios.

**12 `sqlite-and-sql` (Services & Storage): SQL with sqlite3.** In-memory databases (`sqlite3.connect(":memory:")`): `execute`/`executemany`, fetching and cursor iteration, parameter binding (`?` and `:name`) vs injection, `row_factory = sqlite3.Row`, transactions with `with conn:`, schema and constraints, joins and aggregates, `lastrowid`, date adapters (the default adapters were deprecated in 3.12), and ORMs (SQLAlchemy, static) vs Prisma/knex/better-sqlite3.

## Course: Advanced Python (`advanced-python`)

Parts: `The Object Model`, `Functions & Generators`, `Types & Metaprogramming`, `Runtime & Concurrency`. A standard lesson format for readers who have finished the core course. Go deep: show the mechanism, then build a small version of the library feature yourself.

**01 `attribute-lookup` (The Object Model): How Attribute Lookup Works.** Instance and class `__dict__`, `__mro__`, the full lookup order (data descriptors → instance dict → non-data descriptors and class attributes → `__getattr__`), `__getattribute__` vs `__getattr__`, `__setattr__`/`__delattr__` and the `object.__setattr__` recursion trap, `super()` mechanics (MRO-based; zero-argument `super` uses the `__class__` cell), how bound methods are created, `vars()`/`dir()`, and `__slots__`. Compared with the JS prototype chain and Proxy traps.

**02 `descriptors` (The Object Model): Descriptors.** `__get__`/`__set__`/`__delete__`/`__set_name__`, data vs non-data precedence, and how `property`, functions → bound methods, `classmethod`, `staticmethod` and `cached_property` are all descriptors (implement mini versions). Validated and typed fields, lazy attributes, ORM-style columns, per-instance storage. Compared with `Object.defineProperty`.

**03 `metaclasses` (The Object Model): Classes as Objects & Metaclasses.** Classes are instances of `type`, `type(name, bases, ns)`, the class-creation sequence (`__prepare__`, body, `__new__`, `__init__`, `__set_name__`, `__init_subclass__`). Prefer `__init_subclass__` for registries. Class decorators, metaclasses for validation and registries, singletons via `__call__`, `ABCMeta`, `__class_getitem__`, and when *not* to use metaclasses. Compared with JS class factories and mixins.

**04 `functional-python` (Functions & Generators): Functional Programming in Python.** Closure internals (`__closure__`, cells), `functools` in depth (`partial`/`partialmethod`, `reduce`, `singledispatch`/`singledispatchmethod`, `cache`/`lru_cache` with `cache_info` and the mutable-argument pitfalls, `wraps` and `__wrapped__`, `total_ordering`, `cmp_to_key`), the `operator` module, composition and pipelines, currying, immutability (tuples, frozenset, `MappingProxyType`, frozen dataclasses), and why there's no TCO. Compared with Ramda and lodash/fp.

**05 `generators-in-depth` (Functions & Generators): Generators & Coroutines in Depth.** The full generator protocol (`send`, `throw`, `close`, `GeneratorExit`, `StopIteration.value`), priming, `yield from` delegation (return values, exception forwarding), push vs pull pipelines, how `@contextmanager` works, itertools recipes (pairwise, sliding window, roundrobin, partition, unique-everseen, batched, flatten), the caveats of `tee`, async generators (`aclose`, `async for`), and cleanup semantics. Compared with JS `gen.next(v)`/`return`/`throw`.

**06 `typing-in-depth` (Types & Metaprogramming): Advanced Typing.** PEP 695 generics (bounds, constraints, defaults from PEP 696 in 3.13), variance, generic `Protocol`s, `ParamSpec`/`Concatenate` for typing decorators, `TypeVarTuple`, `Self`, `@overload`, advanced `TypedDict` (`Required`/`NotRequired`/`ReadOnly`, `Unpack` for `**kwargs`), `TypeIs`, `Never`/`assert_never` exhaustiveness, `Literal`/`LiteralString`, `Annotated` metadata, and runtime introspection (`get_type_hints(include_extras=True)`, `get_origin`, `get_args`, 3.14's `annotationlib`). TS features with no equivalent (conditional and mapped types). Challenges are runtime checkers built from hints.

**07 `introspection-and-ast` (Types & Metaprogramming): Introspection & the ast Module.** `inspect` (`signature`, `bind`, `getsource`, `getmembers`, predicates), `ast` (parse, dump, walk, `NodeVisitor`, `NodeTransformer`, `unparse`, `literal_eval` for safe evaluation), `dis`, the dangers of `compile`/`exec`/`eval`, building a mini linter, code transformation, and `importlib` (`import_module`, `reload`, `importlib.metadata`) plus plugin discovery. Compared with acorn/babel, `Function()` and `eval`.

**08 `pythonic-api-design` (Types & Metaprogramming): Designing Pythonic APIs.** Protocol-first design (`__iter__`, `__len__`, `__contains__`, `__enter__`), keyword-only parameters and sentinels, rich return types (dataclasses/NamedTuple) vs tuples and dicts, `__repr__` conventions, exception hierarchies for libraries, context managers and decorators as API surface, fluent interfaces vs Python style, `__all__` and the public surface, deprecation (`warnings.warn(..., DeprecationWarning, stacklevel=2)`, `warnings.deprecated` in 3.13), and backwards compatibility. Compared with JS library conventions (options objects, chaining).

**09 `cpython-internals` (Runtime & Concurrency): CPython Internals: Memory & Execution.** Refcounting (`sys.getrefcount`), garbage collection and cycles (`gc`), `weakref` (`ref`, `WeakValueDictionary`, `finalize`) vs `WeakRef`/`FinalizationRegistry`, object sizes, the small-int cache and interning (as the reason `is` misleads), `__slots__` savings, `array`/`memoryview`/`bytearray`, bytecode and the specialising adaptive interpreter (3.11+), the experimental JIT (3.13+), the GIL and free-threaded builds (3.13t/3.14t, PEP 703), `__pycache__`, and Pyodide itself (CPython compiled to WebAssembly). Keep tests deterministic: call `gc.collect()` explicitly.

**10 `concurrency-models` (Runtime & Concurrency): Concurrency Models: Threads, Processes & asyncio.** The GIL and CPU-bound vs I/O-bound work. `threading` (Thread, Lock, Event, Queue, `ThreadPoolExecutor`) and `multiprocessing`/`ProcessPoolExecutor` as static code, since there are no threads in the sandbox. The `concurrent.futures` API (static). asyncio in depth (runnable): tasks, cancellation and `CancelledError`, `TaskGroup`, `asyncio.timeout`, `shield`, semaphores, queues and backpressure. `contextvars` (runnable; ≈ `AsyncLocalStorage`), free-threading, choosing a model. Compared with Node's event loop, `worker_threads` and `cluster`.

## Course: Algorithms & Interview Prep (`algorithms`)

Parts: `Toolkit`, `Patterns`, `Structures`, `Techniques`. **Challenge-heavy format** (see [Course formats](#course-formats)). Prefix challenge ids with `algo-`.

**01 `algorithm-toolkit` (Toolkit): Python's Algorithm Toolkit.** A complexity table of the built-ins (list, dict, set, deque, str, heapq, bisect). `collections` (deque, Counter, defaultdict, OrderedDict), `heapq` (min-heap only, the negation trick, tuple tie-breakers, `nlargest`/`nsmallest`), `bisect`, `sorted` with `key`, `itertools` (`accumulate`, `combinations`, `permutations`, `product`, `pairwise`), `math.inf`, big ints, `functools.cache` (with the sandbox depth caveat), and the recursion limit. JS has no built-in heap or deque. 4 challenges.

**02 `two-pointers-and-windows` (Patterns): Two Pointers, Sliding Windows & Prefix Sums.** Opposite-end pointers, fast/slow pointers, in-place compaction, fixed and variable windows (longest substring without repeats), prefix sums with `accumulate`, subarray-sum-equals-k with a Counter, Kadane. 5 challenges.

**03 `hashing-patterns` (Patterns): Hash Maps & Sets.** Frequency maps, two-sum, grouping by a canonical key (anagrams), order-preserving dedupe, longest consecutive sequence, first unique element, isomorphic strings, set algebra. 5 challenges.

**04 `sorting-and-searching` (Patterns): Sorting & Binary Search.** Keys, stability and multi-key sorts, `cmp_to_key` for custom orders (largest concatenated number), `bisect_left`/`bisect_right` (with `key=` from 3.10), binary search on the answer, k-th largest (heapq vs quickselect), intervals (merge, insert, meeting rooms with a heap). 5 challenges.

**05 `stacks-queues-heaps` (Structures): Stacks, Queues & Heaps.** List as stack, deque as queue, balanced brackets, monotonic stacks (next greater element, daily temperatures), min-stack, RPN evaluation, top-k, `heapq.merge` for k sorted streams, running median with two heaps. 5 challenges.

**06 `linked-lists-and-trees` (Structures): Linked Lists & Trees.** `@dataclass(slots=True)` nodes and helpers to build from and to Python lists. Reverse, cycle detection (Floyd), merge two sorted lists. Binary-tree traversals (recursive with `yield from`, iterative with a stack), level order with deque, depth, BST insert/search/validate with bounds, lowest common ancestor. Keep tree depths modest. 5 challenges.

**07 `graphs` (Structures): Graphs.** Adjacency dicts (`defaultdict(list)`) and grids, BFS shortest paths with deque, **iterative** DFS, connected components/islands, topological sort (Kahn, with indegree counts) and cycle detection, Dijkstra with heapq, union-find with path compression, bipartite check. 5 challenges.

**08 `recursion-and-backtracking` (Techniques): Recursion & Backtracking.** Python's recursion limit and the sandbox caveat, the choose/explore/unchoose template, subsets, permutations (and `itertools` equivalents), combination sum, N-Queens (n ≤ 8), word search, generating parentheses, pruning, generator-based backtracking with `yield`. 5 challenges.

**09 `dynamic-programming` (Techniques): Dynamic Programming.** Recognising overlapping subproblems. Top-down with `@cache` (keep depth ≤ about 500 in the sandbox) vs bottom-up tables (preferred for big inputs). 1D DP (climbing stairs, house robber, coin change: min coins and number of ways), 2D DP (grid paths, edit distance, LCS, 0/1 knapsack), LIS in O(n log n) with bisect, rolling-array space optimisation, reconstructing the answer. 5 challenges, each with a large-input test that needs the efficient approach.

## Course: JS → Python Drills (`translation-drills`)

Parts: `Warm-up`, `Collections`, `Functions & Objects`, `Async & Errors`, `Refactoring`. **Drill format** (see [Course formats](#course-formats)).

**01 `drills-syntax-and-strings` (Warm-up): Drills: Syntax & Strings.** Template literals, string methods (`padStart`, `includes`, `slice`, `split`/`join`, `trim`, `replaceAll`, case), number formatting (`toFixed`, grouping), ternaries and `??` defaults, `switch` → `match`, index loops, `typeof` → `isinstance`, `parseInt` with validation → `try`/`except`.

**02 `drills-arrays` (Collections): Drills: Array Methods.** `map`/`filter`/`reduce` chains → comprehensions, `sum`, and so on; `find`/`findIndex`/`findLast`; `some`/`every`; `flat`/`flatMap`; comparator sorts → `key` (multi-key, descending); `slice`/`splice`; `Array.from({length})`; reduce-to-object → dict comprehension; `groupBy` → defaultdict; index-parallel loops → `zip`; chunk and partition.

**03 `drills-objects-maps-sets` (Collections): Drills: Objects, Maps & Sets.** Spread merges → `|`, destructuring with defaults, `Object.entries`/`fromEntries`, optional-chaining deep get, `Map` counting → `Counter`, Set operations, JSON round trips, `structuredClone` → `deepcopy`, pick/omit, inverting an object.

**04 `drills-functions-and-classes` (Functions & Objects): Drills: Functions & Classes.** Default and rest params, closures (counter, `once`), currying/partial, memoize, getters/setters → `property`, static factories → `classmethod`, `extends`/`super`, `toString`/`toJSON` → `__str__`/`__repr__`/`asdict`, `Symbol.iterator` → `__iter__`, `Object.freeze` enums → `Enum`.

**05 `drills-async-and-errors` (Async & Errors): Drills: Async & Errors.** async functions, `Promise.all` → `gather`, `allSettled` → `return_exceptions=True`, `race`/timeouts → `asyncio.timeout`/`wait_for`, retry with backoff (inject the sleep), `for await` → `async for`, try/catch/finally, custom `Error` subclasses, `cause` → `raise ... from`, `AggregateError` → `ExceptionGroup`. Async tests are supported (`@test` on an `async def`).

**06 `drills-make-it-pythonic` (Refactoring): Drills: Make It Pythonic.** Starters are working, JS-flavoured Python. Learners refactor to idiomatic Python, and tests check identical behaviour plus AST constraints: no `range(len(...))`, `enumerate`/`zip`, comprehensions instead of append loops, `with` for files, `dict.get`/`defaultdict`, unpacking and swaps, `any`/`all`, `str.join`, EAFP, f-strings instead of concatenation.

## Course: Guided Projects (`projects`)

Parts: `Interpreters & Text`, `Apps & Data`, `Systems`. **Project format** (see [Course formats](#course-formats)): 5 or 6 steps, each one a challenge whose starter carries all earlier steps' reference code.

**01 `project-calculator` (Interpreters & Text): Build an Expression Calculator.** A tokenizer (regex with named groups → `Token` dataclasses), a recursive-descent parser with precedence and parentheses producing an AST of dataclasses, an evaluator using `match`, variables and assignment through an environment dict, custom exceptions carrying positions, and `evaluate_lines()`. Ids `calc-step-N`.

**02 `project-markdown` (Interpreters & Text): Build a Markdown-to-HTML Converter.** HTML escaping, inline formatting (bold, italic, code, links) with `re.sub` and callbacks, a line-based block state machine (headings, paragraphs, lists, fenced code, blockquotes), a generator pipeline, and `render(markdown) -> str`. Ids `md-step-N`.

**03 `project-todo-cli` (Apps & Data): Build a Todo CLI.** A `Task` dataclass with JSON serialisation, a `TaskStore` saving to a JSON file in the in-memory filesystem, an argparse command parser with subcommands (`add`, `done`, `list --all`, `remove`), filtering and sorting by priority and due date, table output, and `main(argv) -> int` (test it with `output_of`). Ids `todo-step-N`.

**04 `project-ledger` (Apps & Data): Build an Event-Sourced Ledger.** Events as frozen dataclasses, applying them with `match` (deposit, withdraw, transfer), validation with custom exceptions, projections (balances, history), replay from a JSON-lines log, undo via compensating events, and reports. Ids `ledger-step-N`.

**05 `project-text-adventure` (Apps & Data): Build a Text Adventure Engine.** A world loaded from data (a rooms graph), command parsing with `match` on `split()` (go, take, drop, look, inventory), a game-state dataclass, win and lose conditions, save/load as JSON, and `play(commands) -> transcript` for deterministic tests. Ids `adventure-step-N`.

**06 `project-test-runner` (Systems): Build a Tiny Test Runner.** A `@test` registry decorator, running tests and collecting results, assertion messages, fixtures injected by parameter name (`inspect.signature`), `@parametrize`, setup/teardown via context managers, a pytest-like report (`..F.` plus a summary), and discovery from a namespace dict. Ids `runner-step-N`.

**07 `project-async-crawler` (Systems): Build an Async Web Crawler.** A fake async fetcher (a dict of URL → HTML with simulated latency via `asyncio.sleep(0)`), link extraction (`html.parser` or regex), BFS crawling with `asyncio.Queue` and worker tasks, a `Semaphore` concurrency limit, retries and timeouts for flaky pages, depth limits and dedupe, and a summary. Everything deterministic. Ids `crawler-step-N`.

**08 `project-caches` (Systems): Build Caches & Rate Limiters.** An LRU cache class on `OrderedDict`, an `@lru` decorator on top of it with stats, a TTL cache with an injectable clock, a token-bucket rate limiter (injectable clock), a sliding-window limiter, and a cached, rate-limited client combining them. Ids `cache-step-N`.

## Course: Checkpoints (`checkpoints`)

Part: `Core Course Exams`. **Checkpoint format** (see [Course formats](#course-formats)). Each exam covers one part of the core course. Prefix challenge ids with `exam-`.

**01 `exam-foundations`: Exam: Foundations.** Covers `first-contact`, `variables-and-scope`, `numbers-and-math`, `strings`, `truthiness-and-equality` and `control-flow`.

**02 `exam-collections`: Exam: Collections.** Covers `lists`, `map-filter-reduce`, `tuples-and-unpacking`, `dicts` and `sets`.

**03 `exam-functions-and-iteration`: Exam: Functions & Iteration.** Covers `functions`, `decorators` and `iterators-and-generators`.

**04 `exam-objects-and-classes`: Exam: Objects & Classes.** Covers `classes`, `dunder-methods` and `dataclasses-and-enums`.

**05 `exam-robust-code`: Exam: Robust Code.** Covers `exceptions`, `context-managers` and `modules-and-tooling`.

**06 `exam-advanced-python`: Exam: Advanced Python.** Covers `async`, `type-hints`, `pattern-matching`, `standard-library` and `gotchas`.
