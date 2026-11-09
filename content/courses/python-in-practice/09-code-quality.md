---
title: Code Quality & Refactoring
part: Quality & Testing
summary: PEP 8, ruff, docstrings and type checks in CI, then the refactoring moves Python reviewers ask for.
minutes: 40
---

In JavaScript, code quality is a stack you assemble: a style guide, eslint with a config, prettier, tsc, husky and lint-staged. Python's version is more settled. There's one style guide that nearly everyone follows (PEP 8), one tool that has absorbed most of the others (ruff), and a shared sense of what "Pythonic" means. **Most of what a Python reviewer asks for can be checked by a tool, so set the tools up first and spend the review on structure.**

This lesson sets up the tooling, then works through the refactoring moves that come up most often in Python code review, from guard clauses to dataclasses. The challenges are refactoring katas: the tests check that the behaviour stays the same and that the structure improves.

## PEP 8 and the Zen of Python

:::compare
```js
import { readFile } from "node:fs/promises";
import express from "express";
import { loadConfig } from "./config.js";

const isEmpty = (xs) => xs.length === 0;



if (user === null || typeof user.age !== "number") {
  throw new TypeError("bad user");
}
const total = items.reduce((sum, item) => sum + item.price * item.qty, 0);
```
```python
import json                    # the standard library first
from pathlib import Path

import httpx                   # then third-party packages

from shop.config import load_config   # then your own code


def is_empty(items):           # a def, not is_empty = lambda items: ...
    return not items           # empty containers are falsy


if user is None or not isinstance(user.age, int):
    raise TypeError("bad user")
total = sum(item.price * item.qty for item in items)
```
:::

PEP 8 is the style guide of the standard library, and nearly every Python project follows it, so there's no Airbnb-versus-Standard debate to have. [First Contact](lesson:first-contact#names-pep-8-and-formatters) covered the naming half. The rest, condensed to what reviewers actually flag:

- Indent with four spaces. PEP 8 caps lines at 79 characters, while ruff and Black default to 88. Break long expressions inside brackets rather than with a trailing `\`.
- Two blank lines around top-level functions and classes, one between methods.
- Imports go at the top, one module per `import` line, in three groups separated by blank lines: the standard library, third-party packages, then your own code.
- Compare with `None` using `is` and `is not`, check types with `isinstance()`, and test emptiness with truthiness: `if not items:`, not `if len(items) == 0:`.
- Use `def` for anything with a name. A `lambda` is for passing a function inline.
- Give public modules, classes and functions a docstring.

PEP 8 also says when to break its rules, in a section titled "A Foolish Consistency is the Hobgoblin of Little Minds": readability and consistency with the surrounding code matter more than the letter of the guide.

```python run
import sys

sys.modules.pop("this", None)   # a module only runs on its first import (see below)
import this
```

`import this` prints the Zen of Python (PEP 20), Tim Peters' nineteen aphorisms, which Python developers still quote in code review. Several of them are refactoring advice in disguise and come back below: flat is better than nested, explicit is better than implicit, and errors should never pass silently. The `pop` is there because the playground reuses one interpreter, and [a module only runs once](lesson:modules-and-tooling#modules-run-once) per process.

## ruff: one tool for lint and format

:::compare
```js title="eslint.config.js"
import js from "@eslint/js";

export default [
  js.configs.recommended,
  {
    rules: {
      eqeqeq: "error",
      "no-unused-vars": "error",
    },
  },
];

// .prettierrc: { "printWidth": 88 }
```
```toml title="pyproject.toml"
[tool.ruff]
line-length = 88
target-version = "py312"

[tool.ruff.lint]
select = ["F", "E", "W", "B", "I", "UP", "SIM", "RET", "N"]
ignore = ["E501"]   # the formatter takes care of line length

[tool.ruff.lint.per-file-ignores]
"__init__.py" = ["F401"]   # re-exports look like unused imports
```
:::

ruff is a single Rust binary that reimplements flake8 and dozens of its plugins, isort, pyupgrade, pydocstyle and Black, which is why one `[tool.ruff]` table replaces an eslint-plus-prettier setup. Its rules come in **families** named after the tools they were ported from, each with a letter prefix, and you choose families with `select`. List them explicitly, so that upgrading ruff never silently changes what your CI checks.

| Prefix | Ported from | Catches | Examples |
| --- | --- | --- | --- |
| `F` | Pyflakes | real mistakes: undefined names, unused imports and variables | `F401` unused import, `F841` unused variable |
| `E`, `W` | pycodestyle | PEP 8 layout and comparisons | `E711` `== None`, `E722` bare `except`, `E731` a `lambda` assigned to a name |
| `B` | flake8-bugbear | likely bugs | `B006` mutable default, `B023` closure over a loop variable, `B904` `raise` without `from` inside `except` |
| `I` | isort | import order and grouping | `I001` unsorted imports |
| `UP` | pyupgrade | syntax older than your target version | `UP006` `List[int]`, `UP007` `Union[A, B]`, `UP032` `.format()` instead of an f-string |
| `SIM` | flake8-simplify | code with a simpler equivalent | `SIM102` nested `if`, `SIM108` an `if`/`else` that could be a conditional expression, `SIM110` a loop that could be `any()`, `SIM118` `in d.keys()` |
| `RET` | flake8-return | return style | `RET505` `else` after `return` |
| `N` | pep8-naming | naming conventions | `N802` a function name that isn't lowercase |
| `FBT` | flake8-boolean-trap | boolean flag arguments | `FBT001` a `bool` positional parameter |
| `PL` | Pylint | design smells | `PLR0913` too many arguments, `PLW0603` a `global` statement |
| `C90` | mccabe | complexity | `C901` a function with too many branches |

```bash
ruff check .                # lint, like eslint .
ruff check --fix .          # apply the safe fixes, like eslint --fix
ruff format .               # format, like prettier --write .
ruff format --check .       # fail if formatting would change anything (for CI)
ruff rule B006              # explain one rule
```

A `# noqa: E731` comment silences one rule on one line, like `// eslint-disable-line`. Always name the code: a bare `# noqa` silences everything, and the `RUF100` rule reports suppressions that no longer suppress anything.

Most of these rules exist because the "wrong" version quietly does something else. Three of them, demonstrated:

```python run
class Anything:
    def __eq__(self, other):      # NumPy, SQLAlchemy and others overload ==
        return True

value = Anything()
print(value == None, value is None)                # E711: `is` can't be overloaded
print(type(True) == int, isinstance(True, int))    # E721: isinstance accepts subclasses

def add_tag(tag, tags=[]):        # B006: one list, shared by every call
    tags.append(tag)
    return tags

add_tag("draft")
print(add_tag("urgent"))
```

:::quiz
You run `ruff format .` on a file whose imports are in the wrong order. What happens to the imports?

- [ ] ruff sorts and groups them, like Black and isort combined
- [x] Nothing: sorting imports is a lint fix, applied by `ruff check --fix` when the `I` rules are enabled
- [ ] ruff deletes the unused ones and leaves the order alone
- [ ] ruff refuses to format the file until they're sorted

The formatter only changes layout, exactly like Black. Import sorting belongs to the isort rules (`I001`), and removing unused imports is a lint fix too (`F401`). The usual sequence is `ruff check --fix`, then `ruff format`.
:::

## Docstrings

:::compare
```js
/**
 * Apply a percentage discount to a price.
 *
 * @param {number} price - The original price, in euros.
 * @param {number} percent - The discount, from 0 to 100.
 * @returns {number} The discounted price, rounded to cents.
 * @throws {RangeError} If percent is outside 0-100.
 */
function applyDiscount(price, percent) { /* ... */ }
```
```python
def apply_discount(price: float, percent: float) -> float:
    """Apply a percentage discount to a price.

    Args:
        price: The original price, in euros.
        percent: The discount, from 0 to 100.

    Returns:
        The discounted price, rounded to cents.

    Raises:
        ValueError: If percent is outside 0-100.
    """
```
:::

[First Contact](lesson:first-contact#comments-and-docstrings) introduced docstrings. The conventions that reviewers and tools check come from PEP 257: triple double quotes, then a one-line summary that ends with a period and is written as a command, "Return the total", not "Returns the total". After a blank line come the details. Types belong in the annotations, which checkers verify, so the docstring never repeats JSDoc's `{number}`.

For the details, pick one of three section formats and stick to it. **Google style** (`Args:`, `Returns:`, `Raises:`) is the most common in application code, **NumPy style** uses underlined headings and dominates scientific code, and reStructuredText fields (`:param price:`) are what Sphinx used originally. Tell ruff which one with `convention = "google"` under `[tool.ruff.lint.pydocstyle]`, and select the `D` rules. Docstrings are runtime data, so everything reads them: `help()`, IDE tooltips, documentation generators, and [doctest](lesson:testing-with-python).

```python run
import inspect

def apply_discount(price: float, percent: float) -> float:
    """Apply a percentage discount to a price.

    Args:
        price: The original price, in euros.
        percent: The discount, from 0 to 100.
    """
    return round(price * (1 - percent / 100), 2)

print(inspect.signature(apply_discount))
print(apply_discount.__doc__.splitlines()[0])
help(apply_discount)
```

:::deep Docstrings lost their indentation in 3.13
Since 3.13 the compiler strips the common leading whitespace from docstrings, so the indented lines of `__doc__` start at column 0 and the bytecode is smaller. `inspect.getdoc()` and `inspect.cleandoc()` do the same cleanup on older versions, and `help()` always did.
:::

:::quiz
Which docstring follows PEP 257?

- [ ] `"""returns the order total"""`
- [ ] `'''Returns the order total.'''`
- [x] `"""Return the order total, in cents."""`
- [ ] `# Return the order total, in cents.` on the line above the `def`

PEP 257 asks for triple double quotes and a summary line written as a command that ends with a period. A comment isn't a docstring at all: the compiler throws it away, so `help()` never sees it.
:::

:::gotcha The docstring goes inside
A JSDoc block sits above the function. A Python docstring must be the first statement *inside* the body. A string placed above the `def`, or after any other statement, is just an expression that's evaluated and thrown away, and the function's `__doc__` stays `None`.
:::

## Guard clauses and early returns

:::compare
```js
function shippingLabel(order) {
  if (order) {
    if (order.paid) {
      if (order.address) {
        return `Ship to ${order.address}`;
      } else {
        throw new Error("no address");
      }
    } else {
      return "Awaiting payment";
    }
  } else {
    throw new Error("no order");
  }
}
```
```python
def shipping_label(order):
    if order is None:
        raise ValueError("no order")
    if not order.paid:
        return "Awaiting payment"
    if not order.address:
        raise ValueError("no address")
    return f"Ship to {order.address}"
```
:::

Handle the special cases first and leave the function as soon as each one is dealt with, so the happy path comes last, unindented. The move is the same in any language, but Python makes nesting more expensive: every level costs four of your 88 columns, and no closing braces show where a deep block ends. The Zen puts it as *flat is better than nested*. ruff enforces the pieces: `RET505` and `RET506` flag an `else` after a `return` or `raise`, `SIM102` a nested `if` that could be one condition, and `C901` a function whose branches add up to too much complexity.

:::pythonic A flag loop is `any()`
The other common source of nesting is a loop that sets a flag and breaks. `any()` and `all()` short-circuit the same way, so the guard fits on one line: `if any(item.backordered for item in order.items): return "Waiting for stock"`. ruff's `SIM110` suggests the rewrite.
:::

Nesting is easy to measure, which is how the katas below check your refactorings. Here's the measurement, on a smaller version of the function above:

```python run
import ast

BLOCKS = (ast.If, ast.For, ast.While, ast.With, ast.Try, ast.Match)

def max_depth(node, depth=0):
    """How deeply if/for/while/with/try/match blocks nest inside node."""
    deepest = depth
    for child in ast.iter_child_nodes(node):
        child_depth = depth + 1 if isinstance(child, BLOCKS) else depth
        deepest = max(deepest, max_depth(child, child_depth))
    return deepest

nested = """
def label(order):
    if order:
        if order.paid:
            return "ship"
        else:
            return "awaiting payment"
    else:
        raise ValueError("no order")
"""
flat = """
def label(order):
    if not order:
        raise ValueError("no order")
    if not order.paid:
        return "awaiting payment"
    return "ship"
"""
print(max_depth(ast.parse(nested)), max_depth(ast.parse(flat)))
```

:::quiz output
Someone removed an `else` to flatten this function. What does it print now?

```python
def label(stock):
    if stock == 0:
        status = "sold out"
    status = "in stock"
    return status

print(label(0))
```

- [ ] `sold out`
- [x] `in stock`
- [ ] `None`
- [ ] `UnboundLocalError`

Dropping an `else` is only safe when the `if` branch leaves the block, with `return`, `raise`, `continue` or `break`. Here the branch falls through, and the next line overwrites `status`. That's why ruff's `RET505` to `RET508` only fire when the branch ends in one of those four statements.
:::

## Flag arguments

:::compare
```js
exportUsers(users, true);                 // true what?

exportUsers(users, { format: "csv" });    // the options-object fix

exportUsersAsCsv(users);                  // or two functions
```
```python
export_users(users, True)                 # True what?

export_users(users, fmt="csv")            # a keyword-only parameter

export_users_as_csv(users)                # or two functions
```
:::

A positional boolean makes the call site unreadable, and it usually means the function does two jobs. JavaScript repairs the call site with an options object. Python has the repair built in: parameters declared after a bare `*` are **keyword-only**, so callers must name them (see [Functions](lesson:functions#keyword-arguments-replace-options-objects)). When the flag switches between two different behaviours, go further and split the function in two, sharing the common part. For more than two modes, take an `Enum` or a `Literal["csv", "json"]`. ruff's `FBT` rules flag boolean positional parameters (`FBT001`, `FBT002`) and `True`/`False` passed positionally at call sites (`FBT003`).

```python run raises
def export_users(users, *, fmt="json"):    # everything after * must be named
    return f"exported {len(users)} users as {fmt}"

print(export_users(["ada", "grace"], fmt="csv"))
print(export_users(["ada", "grace"], "csv"))
```

## Small, pure functions

:::compare
```js
async function main(path) {
  const invoices = JSON.parse(await readFile(path, "utf8"));
  let overdue = 0;
  for (const invoice of invoices) {
    if (new Date(invoice.due) < new Date() && !invoice.paid) {
      overdue += invoice.amount;
    }
  }
  console.log(`Overdue: ${overdue.toFixed(2)}`);
}
```
```python
def overdue_total(invoices, today):         # pure: data in, a value out
    return sum(i.amount for i in invoices if i.due < today and not i.paid)


def main(path):                             # the shell: only I/O
    invoices = parse_invoices(Path(path).read_text(encoding="utf-8"))
    print(f"Overdue: {overdue_total(invoices, date.today()):.2f}")
```
:::

Pull the decisions out of the function that does the I/O. A **pure** function gets everything it needs as arguments, including "today" ([inject the clock](lesson:testing-with-python)), and returns a value without touching files, the network or global state. It can be tested with a one-line assertion and reused from a CLI, a web handler or a notebook. What's left in `main()` is a thin shell that reads, calls and prints, and it barely needs testing. This split is often called *functional core, imperative shell*.

Extract a function whenever a block needs a comment to say what it does: the function's name becomes the comment. ruff's `PLR0912` (too many branches), `PLR0915` (too many statements) and `C901` tell you when a function has outgrown its job.

```python run
from dataclasses import dataclass
from datetime import date

@dataclass(frozen=True)
class Invoice:
    amount: float
    due: date
    paid: bool = False

def overdue_total(invoices, today):
    return sum(i.amount for i in invoices if i.due < today and not i.paid)

invoices = [Invoice(120.0, date(2030, 1, 10)), Invoice(80.0, date(2030, 3, 1)),
            Invoice(45.5, date(2029, 12, 1), paid=True)]
assert overdue_total(invoices, today=date(2030, 2, 1)) == 120.0
assert overdue_total(invoices, today=date(2030, 3, 2)) == 200.0
assert overdue_total([], today=date(2030, 2, 1)) == 0
print("tested without files, clocks or mocks")
```

## Dataclasses instead of dict records

:::compare
```ts
interface Invoice {
  amount: number;
  due: Date;
  paid: boolean;
}

const invoice: Invoice = { amount: 120, due: new Date(2030, 0, 10), paid: false };
invoice.ammount;        // compile error
```
```python
@dataclass(frozen=True)
class Invoice:
    amount: float
    due: date
    paid: bool = False


invoice = Invoice(120, date(2030, 1, 10))
invoice.ammount         # AttributeError, and a type checker error
```
:::

A dict with string keys is Python's object literal, and it's fine at the edges of a program, straight out of `json.loads`. Passed around inside it, the dict becomes the weakest record type available. Every key is a string literal that the type checker can't verify, so `row["ammount"]` is a `KeyError` at runtime if you're lucky, and nothing documents the shape. Convert once, at the boundary, into a dataclass. You get a constructor that rejects missing fields, a readable `repr`, value equality, optional immutability and attributes that editors and type checkers understand. A `TypedDict` is the middle ground when the data has to stay a dict, for example because it goes straight back out as JSON. [Dataclasses, NamedTuples & Enums](lesson:dataclasses-and-enums#choosing-a-record-type) compares the options.

```python run
import json
from dataclasses import dataclass

@dataclass(frozen=True)
class Order:
    id: int
    customer: str
    total_cents: int

    @classmethod
    def from_json(cls, data):
        return cls(id=data["id"], customer=data["customer"], total_cents=data["total_cents"])

raw = json.loads('[{"id": 1042, "customer": "ada", "total_cents": 1999}]')
orders = [Order.from_json(item) for item in raw]       # convert once, at the edge
print(orders[0])
print(orders[0] == Order(1042, "ada", 1999))
try:
    orders[0].total_cents = 0
except AttributeError as err:                          # FrozenInstanceError
    print(type(err).__name__, err)
```

:::quiz output
What happens when this runs?

```python
from dataclasses import dataclass

@dataclass
class Order:
    id: int
    tags: list[str] = []

print(Order(1042))
```

- [ ] `Order(id=1042, tags=[])`
- [x] `ValueError`
- [ ] `TypeError`

`@dataclass` refuses a mutable default when it builds the class: "mutable default <class 'list'> for field tags is not allowed: use default_factory". Write `tags: list[str] = field(default_factory=list)`, so every instance gets a fresh list. Plain functions get no such protection, which is why ruff has `B006`.
:::

## No mutable defaults, no globals

:::compare
```js
// cart.js: module state is a singleton, shared by every importer
let items = [];

export function addItem(item) {
  items.push(item);
}

export function count() {
  return items.length;
}
```
```python
# cart.py: state lives in an object that callers create
class Cart:
    def __init__(self):
        self.items = []

    def add_item(self, item):
        self.items.append(item)

    def count(self):
        return len(self.items)
```
:::

Module-level state is a singleton in both languages: one copy, shared by everything that imports the module. jest and vitest soften the blow by giving every test file its own module registry, but pytest imports each module once per run, so the state leaks across test files too, and results start depending on the order the tests run in. Python adds its own friction: a function needs a `global` statement to rebind a module-level name (`PLW0603` flags it), and forgetting it gives you [`UnboundLocalError`](lesson:variables-and-scope#global-nonlocal-and-unboundlocalerror). Put the state in an object that callers create and pass around, a class instance or just an argument, and every test gets a fresh one. Module-level *constants* are fine. Module-level *mutable* state is the smell.

The function-sized version of the same smell is a mutable default argument. `def add_tag(tag, tags=[])` creates one list when `def` runs and shares it between all calls ([Functions](lesson:functions#defaults-are-evaluated-once)), and `B006` catches it. A module-level cache dict is usually better written as `@functools.cache` on the function that fills it.

:::gotcha `items = []` in a class body is shared too
In a JavaScript class, a field initialiser such as `items = [];` runs for every instance. In a Python class body, `items = []` runs once, and creates a *class* attribute that every instance shares, so moving module state into a class can leave it just as global. Create mutable state in `__init__` (`self.items = []`), or use a dataclass with `field(default_factory=list)`. ruff's `RUF012` flags mutable class attributes. See [Classes & Objects](lesson:classes#class-attributes-vs-instance-attributes).
:::

```python run
_seen = set()                        # module-level state: one per process

def is_new(order_id):
    if order_id in _seen:
        return False
    _seen.add(order_id)
    return True

def test_new_order():
    assert is_new(1042)

def test_new_order_from_another_file():
    assert is_new(1042)

for test in (test_new_order, test_new_order_from_another_file):
    try:
        test()
        print("PASSED", test.__name__)
    except AssertionError:
        print("FAILED", test.__name__, "(only because the other test ran first)")
```

## EAFP: try it, then handle the failure

:::compare
```js
let config = {};
if (fs.existsSync(path)) {
  config = JSON.parse(fs.readFileSync(path, "utf8"));
}

const port = "port" in config ? config.port : 8080;
```
```python
try:
    config = json.loads(Path(path).read_text(encoding="utf-8"))
except FileNotFoundError:
    config = {}

port = config.get("port", 8080)
```
:::

Checking first and acting second, *look before you leap*, is the JavaScript default. In Python it often does the work twice, and sometimes it's simply wrong: between `exists()` and `read_text()`, another process can delete the file. *Easier to ask forgiveness than permission* (EAFP) attempts the operation and handles the specific failure. Keep the `try` block to the one operation that can fail, catch the narrowest exception, and use the purpose-built forms where they exist: `dict.get`, `getattr(obj, name, default)`, and `contextlib.suppress(FileNotFoundError)` for a `try` whose `except` would just `pass` (ruff's `SIM105`). The [Exceptions lesson](lesson:exceptions#eafp-ask-forgiveness-not-permission) has the full story.

:::gotcha EAFP isn't `except Exception: pass`
A broad `except` that swallows everything hides bugs along with the failure you expected: a typo becomes a `NameError` that nobody ever sees. *Errors should never pass silently.* Catch the exceptions you can actually handle, and let the rest propagate. ruff flags the worst offenders: `E722` (bare `except:`), `BLE001` (blind `except Exception`) and `S110` (`try`-`except`-`pass`).
:::

## Type checks, pre-commit and CI

:::compare
```json title="package.json"
{
  "scripts": {
    "lint": "eslint . && prettier --check .",
    "typecheck": "tsc --noEmit",
    "test": "vitest run",
    "prepare": "husky"
  },
  "lint-staged": {
    "*.{js,ts}": ["eslint --fix", "prettier --write"]
  }
}
```
```yaml title=".pre-commit-config.yaml"
repos:
  - repo: https://github.com/astral-sh/ruff-pre-commit
    rev: v0.16.3
    hooks:
      - id: ruff-check
        args: [--fix]
      - id: ruff-format
  - repo: https://github.com/pre-commit/pre-commit-hooks
    rev: v5.0.0
    hooks:
      - id: trailing-whitespace
      - id: check-yaml
```
:::

**pre-commit** is husky and lint-staged in one tool. `.pre-commit-config.yaml` lists hooks by repository and pinned version, `pre-commit install` wires them into `.git/hooks`, and every commit then runs them on the staged files only. `pre-commit run --all-files` checks the whole repository, and `pre-commit autoupdate` bumps the pinned versions. Keep the hooks fast. Type checking and tests belong in CI.

Type hints are erased at runtime, just like TypeScript's types, so a checker is the only thing that reads them: **mypy**, the reference implementation, or **pyright**, which also powers VS Code's Pylance. `strict = true` is tsconfig's `"strict": true`. Without it, mypy doesn't check the bodies of functions that have no annotations at all, which lets you adopt type checking gradually and tighten it once the code is annotated: in strict mode, a missing annotation is itself an error. `# type: ignore[arg-type]` silences one error on one line, like `// @ts-expect-error`. The type system itself is covered in [Type Hints](lesson:type-hints#checkers-and-stubs-python-s-tsc).

```toml title="pyproject.toml"
[dependency-groups]
dev = ["mypy", "pre-commit", "pytest", "pytest-cov", "ruff"]

[tool.mypy]
strict = true
files = ["src"]

[tool.pytest.ini_options]
testpaths = ["tests"]
addopts = "-ra --strict-markers"
filterwarnings = ["error"]   # any warning, deprecations included, fails the tests
```

```yaml title=".github/workflows/checks.yml"
name: checks
on: [push, pull_request]

jobs:
  quality:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: astral-sh/setup-uv@v6
      - run: uv sync --locked
      - run: uv run ruff check .
      - run: uv run ruff format --check .
      - run: uv run mypy
      - run: uv run pytest --cov=src
```

## Cheat sheet

| JavaScript | Python | Notes |
| --- | --- | --- |
| Airbnb, Standard, xo | PEP 8 | one guide, followed nearly everywhere |
| `eslint .` | `ruff check .` | pick families with `select` |
| `eslint --fix` | `ruff check --fix` | also sorts imports (`I`) |
| `prettier --write` | `ruff format` | Black-compatible |
| `// eslint-disable-line rule` | `# noqa: CODE` | always name the code |
| `tsc --noEmit` | `mypy`, `pyright` | `strict = true` |
| `// @ts-expect-error` | `# type: ignore[code]` | |
| JSDoc | docstrings (PEP 257) | Google style; types go in annotations |
| husky + lint-staged | pre-commit | `.pre-commit-config.yaml` |
| nested `if`s | guard clauses | `RET505`, `SIM102`, `C901` |
| `fn(users, true)` | `fn(users, fmt="csv")` | keyword-only (after `*`), or split the function; `FBT` |
| a script doing everything | pure functions plus a thin I/O shell | inject "now" |
| object literals as records | `@dataclass` | convert at the boundary |
| module-level `let` state | an object the caller creates | `PLW0603` flags `global` |
| `function f(xs = [])` | `def f(xs=None)` | `B006`; defaults are evaluated once |
| `existsSync()`, then read | `try` / `except FileNotFoundError` | EAFP |

## Challenges

:::challenge id=quality-guard-clauses title="Flatten the arrow" difficulty=easy
`shipping_cost(order)` works, but it's the arrow-shaped code that guard clauses exist to fix. Refactor it without changing what it does:

- No block may sit inside another block. An `elif` counts as nesting, because it's an `if` inside the `else`.
- No `else` after a branch that ends in `return` or `raise`.

The rules, for reference. No order raises `ValueError("no order")`, and an order without items raises `ValueError("order has no items")`. Domestic orders (`"NL"`) ship free from 50 and cost 5 below that, express or not. International orders cost 15, or 25 with express.

```python starter
def shipping_cost(order):
    if order is not None:
        if order["items"]:
            if order["country"] == "NL":
                if order["total"] >= 50:
                    return 0
                else:
                    return 5
            else:
                if order["express"]:
                    return 25
                else:
                    return 15
        else:
            raise ValueError("order has no items")
    else:
        raise ValueError("no order")
```

```python solution
def shipping_cost(order):
    if order is None:
        raise ValueError("no order")
    if not order["items"]:
        raise ValueError("order has no items")
    if order["country"] != "NL":
        return 25 if order["express"] else 15
    return 0 if order["total"] >= 50 else 5
```

```python tests
BLOCKS = (ast.If, ast.For, ast.While, ast.With, ast.Try, ast.Match)


def block_depth(node, depth=0):
    """How deeply compound statements (if, for, while, with, try, match) nest under node."""
    deepest = depth
    for child in ast.iter_child_nodes(node):
        deepest = max(deepest, block_depth(child, depth + 1 if isinstance(child, BLOCKS) else depth))
    return deepest


def function_def(name):
    found = [node for node in ast.walk(tree) if isinstance(node, ast.FunctionDef) and node.name == name]
    check(found, f"define a function called {name}")
    return found[0]


def order(country="NL", total=20.0, express=False, items=("tea",)):
    return {"country": country, "total": total, "express": express, "items": list(items)}


@test("no order raises ValueError('no order')")
def _():
    err = raises(ValueError, shipping_cost, None)
    eq(str(err), "no order")


@test("an order without items raises ValueError('order has no items')")
def _():
    eq(str(raises(ValueError, shipping_cost, order(items=[]))), "order has no items")
    eq(str(raises(ValueError, shipping_cost, order(country="US", express=True, items=[]))), "order has no items")


@test("domestic orders ship free from 50")
def _():
    eq(shipping_cost(order(total=50)), 0)
    eq(shipping_cost(order(total=120.5)), 0)


@test("smaller domestic orders cost 5, express or not")
def _():
    eq(shipping_cost(order(total=49.99)), 5)
    eq(shipping_cost(order(total=10, express=True)), 5)


@test("international orders cost 15, or 25 with express")
def _():
    eq(shipping_cost(order(country="BE", total=500)), 15)
    eq(shipping_cost(order(country="US", express=True)), 25)


@test("no block inside another block (elif counts)")
def _():
    depth = block_depth(function_def("shipping_cost"))
    check(depth <= 1, f"blocks nest {depth} deep: give each special case its own if, and return early")


@test("no else after return or raise")
def _():
    for node in ast.walk(function_def("shipping_cost")):
        if isinstance(node, ast.If) and node.orelse:
            check(
                not isinstance(node.body[-1], (ast.Return, ast.Raise)),
                f"line {node.lineno}: that branch already left the function, so drop the else",
            )
```

```hint
Start with the two errors: `if order is None: raise ...`, then `if not order["items"]: raise ...`. Every line after them can assume a valid order.
```

```hint
Handle one country completely and return, and the other country needs no `else`. A conditional expression, `25 if order["express"] else 15`, keeps a two-way choice on one line.
```
:::

:::challenge id=quality-cart-without-globals title="A cart without globals" difficulty=medium
This module keeps a shopping cart in module-level variables, the way a JS module keeps state in top-level `let`s. That makes the cart a singleton: every importer, and every test, shares one. Move the state and the three functions into the `Cart` class, as methods with the same behaviour:

- `Cart()` starts empty, with no discount.
- `cart.add_item(name, price_cents, qty=1)` adds a line, or increases its quantity if that name is already in the cart.
- `cart.set_discount(percent)` sets a percentage discount from 0 to 100, and raises `ValueError` for anything else.
- `cart.total_cents()` returns the subtotal minus the discount, with the discount rounded down to a whole cent.

Then delete the module-level versions. The tests allow no `global` statements and no `range(len(...))` loops.

```js
// cart.js
let items = [];
let discountPercent = 0;

export function addItem(name, priceCents, qty = 1) {
  const line = items.find((item) => item.name === name);
  if (line) line.qty += qty;
  else items.push({ name, priceCents, qty });
}
```

```python starter
# JS-module style: the state lives in module-level variables.
_items = []
_discount_percent = 0


def add_item(name, price_cents, qty=1):
    global _items
    for i in range(len(_items)):
        if _items[i]["name"] == name:
            _items[i]["qty"] += qty
            return
    _items.append({"name": name, "price_cents": price_cents, "qty": qty})


def set_discount(percent):
    global _discount_percent
    if percent < 0 or percent > 100:
        raise ValueError("discount must be between 0 and 100")
    _discount_percent = percent


def total_cents():
    subtotal = 0
    for i in range(len(_items)):
        subtotal += _items[i]["price_cents"] * _items[i]["qty"]
    return subtotal - subtotal * _discount_percent // 100


class Cart:
    """Move the state and the three functions above in here."""
```

```python solution
from dataclasses import dataclass


@dataclass
class LineItem:
    name: str
    price_cents: int
    qty: int


class Cart:
    def __init__(self):
        self._items: dict[str, LineItem] = {}
        self._discount_percent = 0

    def add_item(self, name, price_cents, qty=1):
        if name in self._items:
            self._items[name].qty += qty
        else:
            self._items[name] = LineItem(name, price_cents, qty)

    def set_discount(self, percent):
        if not 0 <= percent <= 100:
            raise ValueError("discount must be between 0 and 100")
        self._discount_percent = percent

    def total_cents(self):
        subtotal = sum(item.price_cents * item.qty for item in self._items.values())
        return subtotal - subtotal * self._discount_percent // 100
```

```python tests
def calls_range_len():
    for node in ast.walk(tree):
        if isinstance(node, ast.Call) and isinstance(node.func, ast.Name) and node.func.id == "range":
            for arg in node.args:
                if isinstance(arg, ast.Call) and isinstance(arg.func, ast.Name) and arg.func.id == "len":
                    return True
    return False


@test("a new cart totals 0")
def _():
    eq(Cart().total_cents(), 0)


@test("adds line items")
def _():
    cart = Cart()
    cart.add_item("tea", 450, qty=2)
    cart.add_item("scone", 275)
    eq(cart.total_cents(), 1175)


@test("adding a name again increases its quantity")
def _():
    cart = Cart()
    cart.add_item("tea", 450)
    cart.add_item("tea", 450, qty=3)
    eq(cart.total_cents(), 1800)


@test("the discount is a percentage, rounded down to the cent")
def _():
    cart = Cart()
    cart.add_item("tea", 999)
    cart.set_discount(10)
    eq(cart.total_cents(), 900)


@test("rejects discounts outside 0-100")
def _():
    cart = Cart()
    cart.add_item("tea", 450)
    raises(ValueError, cart.set_discount, -1)
    raises(ValueError, cart.set_discount, 101)
    cart.set_discount(100)
    eq(cart.total_cents(), 0)


@test("carts don't share state")
def _():
    first, second = Cart(), Cart()
    first.add_item("tea", 450)
    first.set_discount(50)
    second.add_item("scone", 275)
    eq(first.total_cents(), 225)
    eq(second.total_cents(), 275, "the second cart saw the first one's items or discount")


@test("no global statements")
def _():
    forbids_syntax(ast.Global, "keep the state on self instead of in module globals")


@test("no range(len(...)) loops")
def _():
    check(not calls_range_len(), "loop over the items themselves, or look them up by name in a dict")
```

```hint
Move the module variables into `__init__` as `self._items` and `self._discount_percent`, and turn each function into a method that takes `self`. Create the containers in `__init__`, not in the class body, or every cart shares them.
```

```hint
A dict keyed by name turns "is this item already in the cart?" into a lookup instead of a loop. A small dataclass makes a tidy value for it.
```

```hint
`sum(item.price_cents * item.qty for item in self._items.values())` replaces the index loop, and `0 <= percent <= 100` is a single chained comparison.
```
:::

:::challenge id=quality-functional-core title="Split the script" difficulty=hard
`report(path)` reads a JSON timesheet, adds up the minutes of finished entries per user, and prints a summary. It works, but parsing, arithmetic and printing are welded together, so none of it can be tested without a file and captured output. Split it into a functional core and a thin I/O shell:

- `Entry`, a frozen dataclass with `user: str`, `minutes: int` and `status: str`;
- `parse_entries(text)`, which returns the JSON text as a list of `Entry` objects;
- `minutes_by_user(entries)`, which returns a dict of total minutes per user, counting only entries whose status is `"done"`;
- `format_report(totals)`, which returns the report as a string, without printing it and without a trailing newline;
- `report(path)`, which reads the file and prints `format_report(...)`. It's the only function allowed to do I/O.

The report must stay exactly as it is now: rows sorted by most minutes first, ties in alphabetical order, names padded to 10 characters, and minutes always shown as two digits. No function may have more than 8 statements.

```text
Time tracked
grace     3h 05m
ada       1h 30m
Total: 275 minutes
```

```python starter
import json
from pathlib import Path


def report(path):
    data = json.loads(Path(path).read_text(encoding="utf-8"))
    totals = {}
    for i in range(len(data)):
        entry = data[i]
        if entry["status"] == "done":
            if entry["user"] in totals:
                totals[entry["user"]] = totals[entry["user"]] + entry["minutes"]
            else:
                totals[entry["user"]] = entry["minutes"]
    names = sorted(totals, key=lambda name: (-totals[name], name))
    print("Time tracked")
    for name in names:
        hours = totals[name] // 60
        minutes = totals[name] % 60
        print(name.ljust(10) + str(hours) + "h " + str(minutes).zfill(2) + "m")
    print("Total: " + str(sum(totals.values())) + " minutes")
```

```python solution
import json
from dataclasses import dataclass
from pathlib import Path


@dataclass(frozen=True)
class Entry:
    user: str
    minutes: int
    status: str


def parse_entries(text):
    return [Entry(**item) for item in json.loads(text)]


def minutes_by_user(entries):
    totals = {}
    for entry in entries:
        if entry.status == "done":
            totals[entry.user] = totals.get(entry.user, 0) + entry.minutes
    return totals


def format_row(user, minutes):
    return f"{user:<10}{minutes // 60}h {minutes % 60:02d}m"


def format_report(totals):
    rows = sorted(totals.items(), key=lambda item: (-item[1], item[0]))
    lines = ["Time tracked"]
    lines += [format_row(user, minutes) for user, minutes in rows]
    lines.append(f"Total: {sum(totals.values())} minutes")
    return "\n".join(lines)


def report(path):
    text = Path(path).read_text(encoding="utf-8")
    print(format_report(minutes_by_user(parse_entries(text))))
```

```python tests
import dataclasses
import json
from pathlib import Path

ENTRIES_JSON = json.dumps([
    {"user": "ada", "minutes": 90, "status": "done"},
    {"user": "grace", "minutes": 120, "status": "done"},
    {"user": "linus", "minutes": 45, "status": "todo"},
    {"user": "grace", "minutes": 65, "status": "done"},
])
REPORT = "Time tracked\ngrace     3h 05m\nada       1h 30m\nTotal: 275 minutes"
IO_CALLS = {"print", "open", "read_text", "write_text", "read_bytes", "write_bytes"}
MAX_STATEMENTS = 8


def functions():
    return [node for node in ast.walk(tree) if isinstance(node, ast.FunctionDef)]


@test("Entry is a frozen dataclass with user, minutes and status")
def _():
    check(dataclasses.is_dataclass(Entry), "decorate Entry with @dataclass")
    eq([f.name for f in dataclasses.fields(Entry)], ["user", "minutes", "status"])
    raises(dataclasses.FrozenInstanceError, setattr, Entry("ada", 30, "done"), "minutes", 0)


@test("parse_entries turns JSON text into Entry objects")
def _():
    entries = parse_entries(ENTRIES_JSON)
    eq(len(entries), 4)
    eq(entries[0], Entry("ada", 90, "done"))
    eq(parse_entries("[]"), [])


@test("minutes_by_user sums the done entries per user")
def _():
    entries = [
        Entry("ada", 90, "done"),
        Entry("grace", 120, "done"),
        Entry("linus", 45, "todo"),
        Entry("grace", 65, "done"),
    ]
    eq(minutes_by_user(entries), {"ada": 90, "grace": 185})
    eq(minutes_by_user([Entry("linus", 45, "todo")]), {})
    eq(minutes_by_user([]), {})


@test("format_report returns the report text")
def _():
    eq(format_report({"ada": 90, "grace": 185}), REPORT)


@test("format_report sorts by minutes, then by name")
def _():
    eq(
        format_report({"bob": 60, "alice": 60, "cleo": 5}),
        "Time tracked\nalice     1h 00m\nbob       1h 00m\ncleo      0h 05m\nTotal: 125 minutes",
    )
    eq(format_report({}), "Time tracked\nTotal: 0 minutes")


@test("format_report returns its text instead of printing it")
def _():
    eq(output_of(format_report, {"ada": 90}), "", "leave the printing to report()")


@test("report() still prints the same report")
def _():
    path = Path("timesheet.json")
    path.write_text(ENTRIES_JSON, encoding="utf-8")
    eq(output_of(report, path), REPORT + "\n")


@test("only report() does I/O")
def _():
    for fn in functions():
        if fn.name == "report":
            continue
        for node in ast.walk(fn):
            if isinstance(node, ast.Call):
                name = getattr(node.func, "id", getattr(node.func, "attr", None))
                check(name not in IO_CALLS, f"{fn.name}() calls {name}(): keep reading and printing in report()")


@test(f"no function has more than {MAX_STATEMENTS} statements")
def _():
    for fn in functions():
        count = sum(isinstance(node, ast.stmt) for node in ast.walk(fn)) - 1
        check(count <= MAX_STATEMENTS, f"{fn.name}() has {count} statements: extract a smaller function")
```

```hint
Start with `Entry` and `parse_entries`. When the JSON keys match the field names, `[Entry(**item) for item in json.loads(text)]` is the whole function.
```

```hint
`format_report` can build a list of lines and return `"\n".join(lines)`. `f"{user:<10}{minutes // 60}h {minutes % 60:02d}m"` reproduces a row, and `sorted(totals.items(), key=lambda item: (-item[1], item[0]))` the order.
```

```hint
Once the core exists, `report` shrinks to two lines: read the text, then `print(format_report(minutes_by_user(parse_entries(text))))`.
```
:::
