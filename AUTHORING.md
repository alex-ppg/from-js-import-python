# Authoring guide

Everything a contributor (human or AI) needs to write lessons for **from js import python**. Read it fully before writing, then read [`content/lessons/07-lists.md`](content/lessons/07-lists.md), the reference lesson for tone, density and structure.

- [The audience](#the-audience)
- [Files and frontmatter](#files-and-frontmatter)
- [Markdown building blocks](#markdown-building-blocks)
- [Challenges and the test API](#challenges-and-the-test-api)
- [The Python sandbox](#the-python-sandbox)
- [Style guide](#style-guide)
- [Validating your work](#validating-your-work)
- [Curriculum map](#curriculum-map)

## The audience

Readers are **senior JavaScript/TypeScript engineers**. They know what a closure, an iterator, a promise and a hash map are. Don't explain programming. Explain **how Python differs, why, and what the idiomatic Python looks like**. Every lesson should leave them able to:

1. translate the JS they would have written into Python that a Python reviewer would approve,
2. recognise the traps where JS intuition gives the wrong answer, and
3. use the syntax savers (comprehensions, unpacking, slicing, `with`, decorators, dataclasses, ...) that make Python pleasant.

## Files and frontmatter

Lessons live in `content/lessons/NN-slug.md`. The number orders the curriculum and the slug becomes the URL (`#/learn/slug`).

```yaml
---
title: Arrays → Lists
part: Collections
summary: One sentence, under ~110 characters, shown on cards and in the sidebar.
minutes: 30
---
```

- `part` must be one of: `Foundations`, `Collections`, `Functions & Iteration`, `Objects & Classes`, `Robust Code`, `Advanced Python`.
- `minutes` is the estimated reading and practice time (a whole number).

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
- **Stdlib only** in runnable code. Pyodide can load NumPy and friends on demand, but the validator runs offline. Show third-party code as static fences.
- Runs time out after 10 seconds.

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
npm run validate -- 07-lists      # just your lesson (any filename substring)
npm run validate                  # everything
npm run validate -- --no-run      # structure and link checks only
```

The validator parses every lesson, checks frontmatter, unique ids and `lesson:` links, **executes** every playground, output quiz and challenge (solution and starter) with the real Pyodide runtime, and parses every other Python fence. A lesson is done when it has **0 errors**. A warning for links to lessons that don't exist *yet* is fine. Then preview it with `npm run dev`.

## Curriculum map

Use these slugs for `lesson:` links. The bullets are each lesson's scope. Stay inside your scope and link to the lesson that owns a topic instead of teaching it twice.

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
