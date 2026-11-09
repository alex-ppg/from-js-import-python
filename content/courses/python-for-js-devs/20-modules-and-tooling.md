---
title: Modules, Packages & Tooling
part: Robust Code
summary: Imports without export, packages, sys.modules, and the uv, ruff and pytest toolchain mapped from npm.
minutes: 35
---

Every `.py` file is a module, and every top-level name in it is importable: there's no `export` keyword and no default export. Imports name **modules**, found by searching `sys.path`, rather than file paths relative to the importer, and each module runs exactly once before landing in a cache. The second half of the lesson maps your npm toolchain onto Python's, which has finally converged: `pyproject.toml` for metadata, **uv** for environments and installs, **ruff** for linting and formatting, **pytest** for tests.

## Every file is a module

:::compare
```js
// pricing.js
export const TAX_RATE = 0.2;

export function withTax(amount) {
  return Math.round(amount * (1 + TAX_RATE) * 100) / 100;
}

function roundCents(x) { /* not exported */ }

// app.js
import { withTax } from "./pricing.js";
```
```python
# pricing.py
TAX_RATE = 0.2


def with_tax(amount):
    return round(amount * (1 + TAX_RATE), 2)


def _round_cents(x):  # "private" by convention only
    ...

# app.py
from pricing import with_tax
```
:::

Everything defined at the top level of a module (functions, classes, variables, even the names it imported) becomes an attribute of the module object. A leading underscore marks a name as internal. Linters and `import *` respect it, but nothing stops a determined caller, much like a `_private` field in JavaScript before `#private`.

The playgrounds below write real `.py` files into the sandbox's in-memory filesystem and then import them. Two setup lines make that reliable: `importlib.invalidate_caches()` makes the import system rescan the directory for new files, and `sys.modules.pop(...)` throws away a copy cached by an earlier run (more on that cache below).

```python run
import importlib
import sys
from pathlib import Path

Path("pricing.py").write_text('''
TAX_RATE = 0.2

def with_tax(amount):
    return round(amount * (1 + TAX_RATE), 2)

def _round_cents(amount):
    return round(amount, 2)
''', encoding="utf-8")
importlib.invalidate_caches()
sys.modules.pop("pricing", None)

import pricing
print(pricing.with_tax(100), pricing.TAX_RATE)
print(type(pricing).__name__, pricing.__name__, pricing.__file__)
print([name for name in vars(pricing) if not name.startswith("__")])
```

## Import styles

:::compare
```js
import * as pricing from "./pricing.js";
import { withTax } from "./pricing.js";
import { withTax as addTax } from "./pricing.js";
import { join } from "node:path";
import fs from "node:fs";              // a default export
const plugin = await import(`./plugins/${name}.js`);
```
```python
import pricing
from pricing import with_tax
from pricing import with_tax as add_tax
from os.path import join
import json                           # no default exports
plugin = importlib.import_module(f"plugins.{name}")
```
:::

`import pricing` binds the module object, like `import * as pricing`, and you reach members with a dot. `from pricing import with_tax` binds a single name, and `as` renames in either form (`import numpy as np` is a convention the whole ecosystem shares). There are no default exports, so you import the module or a name from it. `importlib.import_module()` is the dynamic `import()`, except that it's synchronous.

Imports are **statements that run when reached**, not declarations hoisted to the top like ESM. You can import inside a function to defer a slow import or break a cycle, or inside a `try` to fall back:

```python
try:
    import tomllib                    # stdlib since 3.11
except ModuleNotFoundError:
    import tomli as tomllib           # the PyPI backport for older Pythons
```

:::pythonic Group your imports
PEP 8 puts imports at the top of the file in three blocks separated by blank lines: the standard library, third-party packages, then your own modules. Prefer absolute imports (`from invoice_tool.pricing import with_tax`). `ruff check --select I --fix` sorts them for you, the way an eslint import-order plugin would.
:::

### `from` imports don't stay live

:::gotcha `from module import name` copies the binding
ES module imports are **live bindings**: if `counter.js` reassigns `export let count`, every importer sees the new value. Python's `from counter import count` binds your own name to whatever object `count` referred to at import time. When the module later rebinds its global, your copy doesn't follow. Mutating a shared object (appending to a list) is visible everywhere, because it's the same object. For module-level state that changes, import the module and read `counter.count`.
:::

```python run
import importlib
import sys
from pathlib import Path

Path("counter.py").write_text('''
count = 0

def bump():
    global count
    count += 1
''', encoding="utf-8")
importlib.invalidate_caches()
sys.modules.pop("counter", None)

import counter
from counter import count, bump
bump()
bump()
print(count, counter.count)
```

### `import *` and `__all__`

`from shapes import *` copies every public name into **your** namespace. There's no namespace object, unlike JavaScript's `import * as shapes`. Without `__all__`, "public" means every name that doesn't start with an underscore, including modules that `shapes` itself imported. With `__all__`, it means exactly the names listed. Star imports hide where names come from and can silently shadow your own, so PEP 8 discourages them outside the REPL, and ruff flags them (`F403`). `__all__` is still worth writing: it documents the public API, controls `*` re-exports in a package's `__init__.py`, and tells documentation tools and type checkers what's public.

```python run
import importlib
import sys
from pathlib import Path

Path("shapes.py").write_text('''
import math

__all__ = ["circle_area"]

def circle_area(r):
    return round(math.pi * r ** 2, 2)

def square_area(side):
    return side ** 2
''', encoding="utf-8")
importlib.invalidate_caches()
sys.modules.pop("shapes", None)

from shapes import *
print(circle_area(2))
print("square_area" in globals(), "math" in globals())

from shapes import square_area   # __all__ isn't access control
print(square_area(3))
```

## Modules run once

:::compare
```js
// db.js
console.log("connecting...");
export const pool = createPool();

// orders.js and users.js both import "./db.js":
// "connecting..." prints once, and both share one pool
```
```python
# db.py
print("connecting...")
pool = create_pool()

# orders.py and users.py both `import db`:
# "connecting..." prints once, and both share one pool
```
:::

The first `import db` creates a module object, stores it in `sys.modules["db"]` (Python's version of Node's module cache), and executes `db.py` top to bottom. Every later import, from any file, gets that same object back without running anything. That makes a module Python's natural singleton: module-level state is shared app-wide, and "importing for side effects" works as it does in JavaScript. `importlib.reload(module)` re-executes the file in place, which is handy in a REPL, but names already copied out with `from module import name` keep pointing at the old objects.

This cache is also why the playgrounds here call `sys.modules.pop()`. The sandbox keeps one interpreter alive while the page is open, so without that line, editing a module's source and running again would hand you the stale copy.

:::quiz output
What does this print?

```python
import importlib
import sys
from pathlib import Path

Path("greeting.py").write_text('print("hi", end=" ")\n', encoding="utf-8")
importlib.invalidate_caches()
sys.modules.pop("greeting", None)

import greeting
import greeting
greeting = importlib.reload(greeting)
```

- [ ] `hi`
- [x] `hi hi`
- [ ] `hi hi hi`
- [ ] Nothing

The first import runs the file, the second finds it in `sys.modules` and does nothing, and `reload` runs it again.
:::

## `__name__` and `python -m`

:::compare
```js
// report.js
function main() { /* ... */ }

if (require.main === module) {   // or import.meta.main
  main();
}
```
```python
# report.py
def main():
    ...

if __name__ == "__main__":
    main()
```
:::

Each module's `__name__` is its import name (`"pricing"`, `"shop.cart"`), except in the module Python was asked to run, where it's `"__main__"`. The guard lets one file be both importable and runnable, as [First Contact](lesson:first-contact) showed. What it means for the import system is the interesting part.

`python path/to/report.py` runs a **file**, and puts that file's directory first on `sys.path`. `python -m package.report` runs a **module by import name**: it puts the current directory on `sys.path` and sets up the package properly, so `import package...` and relative imports work. The standard library ships plenty of `-m` tools, and `-m` guarantees the tool belongs to the same interpreter you're using:

```bash
python -m venv .venv              # create a virtual environment
python -m pip install httpx       # pip for *this* interpreter
python -m http.server 8000        # serve the current directory, like npx serve
python -m json.tool orders.json   # pretty-print JSON
python -m invoice_tool            # runs invoice_tool/__main__.py
```

`runpy.run_module("report", run_name="__main__")` is the machinery behind `-m`, if you ever need to do the same thing from code.

## Packages and relative imports

:::compare
```js
// shop/index.js, a barrel file
export { Cart } from "./cart.js";

// shop/cart.js
import { fmt } from "./money.js";

// app.js
import { Cart } from "./shop/index.js";
```
```python
# shop/__init__.py
from .cart import Cart

# shop/cart.py
from .money import fmt

# app.py
from shop import Cart
```
:::

A **package** is a directory with an `__init__.py` file, which can be empty. Importing `shop.cart` runs `shop/__init__.py` first, then `shop/cart.py`, and both land in `sys.modules`. `__init__.py` is the barrel file: re-export the public names there so callers can write `from shop import Cart`. Imports never contain file extensions, `index` lookups or path strings. Dots separate package levels.

Relative imports (`from .money import fmt`, or `from ..utils import log` one level up) are relative to the **package**, not the filesystem, and they only work inside one. Inside a package, both relative and absolute (`from shop.money import fmt`) imports are fine.

```python run
import importlib
import sys
from pathlib import Path

Path("shop").mkdir(exist_ok=True)
Path("shop/__init__.py").write_text("from .cart import Cart\n", encoding="utf-8")
Path("shop/cart.py").write_text('''
from .money import fmt

class Cart:
    def __init__(self):
        self.items = []

    def total(self):
        return fmt(sum(cents for _, cents in self.items))
''', encoding="utf-8")
Path("shop/money.py").write_text('def fmt(cents):\n    return f"${cents / 100:.2f}"\n', encoding="utf-8")
Path("shop/admin.py").write_text('ROLE = "staff"\n', encoding="utf-8")
importlib.invalidate_caches()
for name in [n for n in sys.modules if n == "shop" or n.startswith("shop.")]:
    del sys.modules[name]

import shop
cart = shop.Cart()
cart.items.append(("mug", 1250))
print(cart.total(), sorted(n for n in sys.modules if n.startswith("shop")))
print(hasattr(shop, "admin"))        # submodules load only when imported
```

:::quiz
`shop/cart.py` starts with `from .money import fmt`. You `cd shop` and run `python cart.py`. What happens?

- [ ] It works: `.money` means "the `money.py` next to this file"
- [x] `ImportError: attempted relative import with no known parent package`
- [ ] `ModuleNotFoundError: No module named 'money'`
- [ ] It works, but only when `__init__.py` exists

Run as a file, `cart.py` is just `__main__`, with no package around it, so `.` has nothing to be relative to. Run it from the project root as `python -m shop.cart` instead.
:::

:::gotcha Don't name your files after modules you import
The directory of the script you run comes first on `sys.path`, so a `random.py`, `json.py` or `requests.py` of your own shadows the real module for every import in the program. The symptom is baffling: `AttributeError: module 'random' has no attribute 'randint'`. Python 3.13+ adds a hint suggesting you rename the file. JavaScript's `./` prefix makes local imports explicit, so the trap doesn't exist there.
:::

## Circular imports

:::compare
```js
// orders.js
import { Customer } from "./customers.js";
export class Order {}

// customers.js
import { Order } from "./orders.js";
export class Customer {}

// ESM links both modules before running either,
// so this only fails if a value is used too early.
```
```python
# orders.py
from customers import Customer

class Order: ...

# customers.py
from orders import Order

class Customer: ...

# ImportError: cannot import name 'Order' from partially
# initialized module 'orders' (most likely due to a
# circular import)
```
:::

Python executes `orders.py` line by line. Its first line starts importing `customers`, whose first line asks the half-finished `orders` module for `Order`, which doesn't exist yet. `orders` is already in `sys.modules`, so Python doesn't loop forever; it hands back the **partially initialized** module and the `from` import fails. The fixes, best first:

1. Move the shared code into a third module that both import. A cycle is usually a design smell.
2. Import the module instead of the name (`import customers`) and look up `customers.Customer` inside functions. By the time a function runs, both modules have finished.
3. Import inside the function that needs it.
4. If a name is only needed in type hints, import it under `if TYPE_CHECKING:`, Python's `import type` (see [Type Hints](lesson:type-hints)).

```python run raises
import importlib
import sys
from pathlib import Path

Path("orders.py").write_text("from customers import Customer\n\nclass Order:\n    pass\n", encoding="utf-8")
Path("customers.py").write_text("from orders import Order\n\nclass Customer:\n    pass\n", encoding="utf-8")
importlib.invalidate_caches()
for name in ("orders", "customers"):
    sys.modules.pop(name, None)

import orders    # try fix 2: `import orders` / `import customers` in the files
```

## The toolchain, mapped

| npm world | Python world | Notes |
| --- | --- | --- |
| npm registry | PyPI (pypi.org) | |
| `npm`, `pnpm`, `yarn` | `uv` (or `pip`) | uv is a fast, all-in-one manager written in Rust |
| `package.json` | `pyproject.toml` | metadata, dependencies and tool config |
| `package-lock.json` | `uv.lock` | or a pinned `requirements.txt` |
| `node_modules/` | `.venv/` | one flat environment per project |
| `npm init` | `uv init` | |
| `npm install` | `uv sync` | creates `.venv` and installs the locked versions |
| `npm ci` | `uv sync --locked` | fails if the lockfile is out of date |
| `npm install zod` | `uv add pydantic` | updates `pyproject.toml` and `uv.lock` |
| `npm install -D vitest` | `uv add --dev pytest` | lands in `[dependency-groups]` |
| `npm uninstall x` | `uv remove x` | |
| `npx vitest` (local bin) | `uv run pytest` | runs inside the project's environment |
| `npx some-cli` (one-off) | `uvx some-cli` | or `pipx run some-cli` |
| `npm install -g` | `uv tool install` | or `pipx install` |
| nvm, `.nvmrc` | `uv python install`, `.python-version` | or pyenv |
| `npm ls` | `uv tree` | |
| `npm publish` | `uv build`, then `uv publish` | |
| `"bin"` | `[project.scripts]` | |
| eslint + prettier | ruff | `ruff check`, `ruff format` |
| `tsc --noEmit` | mypy or pyright | |
| jest, vitest | pytest | |

A typical first day with uv:

```bash
uv init invoice-tool          # creates pyproject.toml and friends
cd invoice-tool
uv python pin 3.14            # writes .python-version, like .nvmrc
uv add httpx pydantic         # like npm install: edits pyproject.toml and uv.lock
uv add --dev pytest ruff      # like npm install -D
uv run main.py                # syncs .venv, then runs inside it
uv run pytest                 # like npx vitest
uvx pycowsay "hello"          # like npx: run a tool without adding it
```

Don't confuse `[project.scripts]` with npm's `"scripts"`: it declares installable commands, like `"bin"`. `pyproject.toml` has no standard task-runner section, so teams run commands through `uv run <command>` or reach for a Makefile or a task runner.

## pyproject.toml

:::compare
```json
{
  "name": "invoice-tool",
  "version": "0.1.0",
  "description": "Turn CSV exports into invoices",
  "engines": { "node": ">=22" },
  "dependencies": {
    "zod": "^3.23.0",
    "undici": "^6.19.0"
  },
  "devDependencies": {
    "vitest": "^2.0.0"
  },
  "bin": { "invoice": "./dist/cli.js" }
}
```
```toml
[project]
name = "invoice-tool"
version = "0.1.0"
description = "Turn CSV exports into invoices"
requires-python = ">=3.12"
dependencies = [
    "pydantic>=2.7,<3",
    "httpx>=0.27",
]

[dependency-groups]
dev = ["pytest>=8", "ruff>=0.6"]

[project.scripts]
invoice = "invoice_tool.cli:main"

[build-system]
requires = ["hatchling"]
build-backend = "hatchling.build"

[tool.ruff]
line-length = 100
```
:::

- `[project]` is a standard (PEP 621), so uv, pip, poetry and hatch all read it. Dependencies are strings with version specifiers: `>=`, `<`, `==`, `!=`, and `~=`, the "compatible release" operator.
- `[dependency-groups]` holds development-only dependencies, like `devDependencies`. They're never published.
- `[project.scripts]` maps a command name to a `module:function`, like `"bin"`. Installing the project puts an `invoice` executable into `.venv/bin`.
- `[build-system]` names the backend that packages your code into a **wheel**, the zip file that gets installed. There's no compile step: a wheel is mostly your `.py` files plus metadata.
- `[tool.*]` tables configure individual tools, like the `"eslintConfig"` key or the rc files you'd use in JavaScript.

:::quiz
`dependencies = ["requests~=2.31"]`. Which versions does that allow?

- [x] `>=2.31` and `<3`, like npm's `^2.31.0`
- [ ] `>=2.31` and `<2.32`, like npm's `~2.31.0`
- [ ] exactly `2.31`
- [ ] anything `>=2.31`

`~=` keeps every component except the last one fixed: `~=2.31` means `>=2.31, ==2.*`. Write `~=2.31.0` to stay within `2.31.*`, like npm's tilde.
:::

TOML maps directly onto dicts and lists, and the standard library can read it (`tomllib`, 3.11+). This is how every tool reads its configuration:

```python run
import tomllib

pyproject = tomllib.loads('''
[project]
name = "invoice-tool"
dependencies = ["httpx>=0.27", "pydantic>=2.7,<3"]

[project.scripts]
invoice = "invoice_tool.cli:main"
''')
print(pyproject["project"]["dependencies"])
print(pyproject["project"]["scripts"])
```

The recommended layout puts your package in `src/`, and `uv init --package` starts you off with it:

```text
invoice-tool/
├── pyproject.toml
├── uv.lock
├── .python-version
├── src/
│   └── invoice_tool/
│       ├── __init__.py
│       ├── __main__.py      # python -m invoice_tool
│       ├── cli.py           # def main(), named in [project.scripts]
│       └── pricing.py
└── tests/
    └── test_pricing.py
```

The `src/` directory keeps the package out of the project root, so `import invoice_tool` only works once the project is installed (`uv sync` installs it into `.venv` in editable mode). Tests then import the package the way your users will, rather than whatever happens to sit in the current directory.

## Virtual environments

```bash
uv sync                     # like npm install: creates ./.venv and installs into it
uv run python app.py        # run with the .venv interpreter
source .venv/bin/activate   # or put .venv first on PATH for this shell
```

Python has no `node_modules` lookup. An interpreter imports third-party code from its own `site-packages` directory, so a **virtual environment** (`.venv/`) is a lightweight link to an interpreter plus a private `site-packages`. "Activating" it just puts `.venv/bin` (`.venv\Scripts` on Windows) first on your `PATH`, and `uv run` does that for a single command. Without uv, the same workflow is `python -m venv .venv`, activate, then `pip install -r requirements.txt`. Installing into the system Python is the global-install footgun, and many operating systems now refuse it with `error: externally-managed-environment`.

:::gotcha One version of each package per environment
`node_modules` nests: two dependencies can each get their own copy of `lodash`. A Python environment is **flat**. A module name maps to exactly one entry in `sys.modules`, so if one dependency needs `pydantic<2` and another needs `pydantic>=2`, there's no nested copy to fall back on: resolution fails, and you have to find compatible versions. That's why libraries declare loose lower bounds and only applications pin exact versions, in the lockfile.
:::

:::gotcha The install name isn't the import name
In npm, the package name is the import specifier. On PyPI they're independent: `uv add beautifulsoup4` gives you `import bs4`, `Pillow` gives `PIL`, `PyYAML` gives `yaml`, `scikit-learn` gives `sklearn`, and `python-dateutil` gives `dateutil`. PyPI names are also case-insensitive and treat `-`, `_` and `.` alike, so `typing_extensions` and `Typing-Extensions` are the same package.
:::

## ruff, mypy and pytest

**ruff** is the linter and the formatter in one Rust binary, replacing flake8, isort, pyupgrade and black (its formatter is Black-compatible). [First Contact](lesson:first-contact) introduced it. **mypy** and **pyright** are the type checkers, Python's `tsc --noEmit`. They read your annotations and never run your code. pyright is written in TypeScript and also powers VS Code's Pylance, so `npx pyright` works. The details of the type system live in [Type Hints](lesson:type-hints).

```bash
uv run ruff check --fix .     # like eslint --fix
uv run ruff format .          # like prettier --write
uv run mypy src               # like tsc --noEmit
```

Both are configured in `pyproject.toml`, under `[tool.ruff]` (pick rule sets with `select = ["E", "F", "I", "UP", "B"]` in `[tool.ruff.lint]`) and `[tool.mypy]` (`strict = true` is the `"strict": true` of tsconfig).

**pytest** is the test runner everyone uses:

:::compare
```js
// tests/pricing.test.js
import { expect, it } from "vitest";
import { withTax } from "../src/pricing.js";

it("adds 20%", () => {
  expect(withTax(100)).toBe(120);
});

it.each([[0, 0], [10, 12]])("withTax(%d)", (amount, expected) => {
  expect(withTax(amount)).toBeCloseTo(expected);
});

it("rejects negative amounts", () => {
  expect(() => withTax(-1)).toThrow(/negative/);
});
```
```python
# tests/test_pricing.py
import pytest
from invoice_tool.pricing import with_tax


def test_adds_twenty_percent():
    assert with_tax(100) == 120


@pytest.mark.parametrize(("amount", "expected"), [(0, 0), (10, 12)])
def test_with_tax(amount, expected):
    assert with_tax(amount) == pytest.approx(expected)


def test_rejects_negative_amounts():
    with pytest.raises(ValueError, match="negative"):
        with_tax(-1)
```
:::

- Tests are discovered **by name**: files called `test_*.py`, functions called `test_*`. Nothing needs registering.
- A plain `assert` is the whole assertion API. pytest rewrites assert statements so a failure prints the values on both sides, so there's no matcher vocabulary to learn.
- `@pytest.mark.parametrize` is `it.each`, and `pytest.raises` is `toThrow`, written as a context manager (see [Context Managers](lesson:context-managers)).

Fixtures replace `beforeEach`. Declare a function with `@pytest.fixture` and a test requests it by naming it as a parameter. Code after a `yield` in the fixture is the teardown. Built-in fixtures cover the usual chores: `tmp_path` (a fresh temporary directory), `monkeypatch` and `capsys` (captured output). Fixtures shared across files go in `conftest.py`.

```python
@pytest.fixture
def cart():
    cart = Cart()
    yield cart              # the test runs here
    cart.clear()            # teardown, like afterEach


def test_new_cart_is_empty(cart):     # pytest passes the fixture by name
    assert cart.total() == 0
```

On the command line, `pytest -x` stops at the first failure (vitest's `--bail`), `pytest -k tax` runs only tests whose names match, and `pytest --lf` reruns whatever failed last time.

## Cheat sheet

| JavaScript | Python | Notes |
| --- | --- | --- |
| `export function f` | top-level `def f` | everything is public; `_name` by convention |
| `export default x` | *(none)* | import the module, or a name from it |
| `import * as m from "./m.js"` | `import m` | |
| `import { a, b } from "./m.js"` | `from m import a, b` | copies the bindings, not live |
| `import { a as b }` | `from m import a as b` | also `import m as alias` |
| `await import(name)` | `importlib.import_module(name)` | synchronous |
| `import type { T }` | `if TYPE_CHECKING:` imports | |
| `index.js` barrel | `__init__.py` | |
| `"./sibling.js"` | `from . import sibling` | inside packages only |
| module cache, `require.cache` | `sys.modules` | each module runs once |
| `import.meta.main` | `if __name__ == "__main__":` | |
| `node script.js` | `python script.py` | or `python -m pkg.module`, by import name |
| `package.json` | `pyproject.toml` | |
| `npm install x` / `npm install` | `uv add x` / `uv sync` | |
| `node_modules` | `.venv` | flat: one version per package |
| `npx tool` | `uvx tool` | |
| eslint + prettier | ruff | |
| `tsc --noEmit` | mypy, pyright | |
| vitest, jest | pytest | plain `assert`, fixtures, `parametrize` |

## Challenges

:::challenge id=mod-star-names title="What does import * import?" difficulty=easy
Write `star_names(module)` that returns a sorted list of the names `from module import *` would bind:

- if the module defines `__all__`, exactly those names;
- otherwise, every global name that doesn't start with an underscore.

`vars(module)` returns a module's namespace as a dict.

```js
import * as shapes from "./shapes.js";
Object.keys(shapes).sort();   // every export, and only exports
```

```python starter
def star_names(module):
    ...
```

```python solution
def star_names(module):
    namespace = vars(module)
    if "__all__" in namespace:
        return sorted(namespace["__all__"])
    return sorted(name for name in namespace if not name.startswith("_"))
```

```python tests
import sys
import types

def make_module(source, name="demo"):
    module = types.ModuleType(name)
    exec(source, vars(module))
    return module

@test("without __all__: every public name, sorted")
def _():
    module = make_module("def save(): pass\ndef load(): pass\nRATE = 0.2\n")
    eq(star_names(module), ["RATE", "load", "save"])

@test("skips names that start with an underscore")
def _():
    module = make_module("def area(): pass\ndef _helper(): pass\n_cache = {}\n")
    eq(star_names(module), ["area"])

@test("imported modules count too when there's no __all__")
def _():
    module = make_module("import math\ndef area(r): return math.pi * r * r\n")
    eq(star_names(module), ["area", "math"])

@test("__all__ wins when present, even as a tuple")
def _():
    module = make_module('import math\n__all__ = ("area", "_raw")\ndef area(): pass\ndef perimeter(): pass\n_raw = 1\n')
    eq(star_names(module), ["_raw", "area"])

@test("matches a real star import")
def _():
    module = make_module("import json\n__all__ = ['dump_all']\ndef dump_all(): pass\n_x = 1\n", "fjip_star_demo")
    sys.modules["fjip_star_demo"] = module
    namespace = {}
    exec("from fjip_star_demo import *", namespace)
    eq(star_names(module), sorted(k for k in namespace if k != "__builtins__"))
```

```hint
`"__all__" in vars(module)` tells you whether the module defines it.
```

```hint
`sorted()` accepts any iterable, including a tuple or a generator expression, and always returns a list.
```
:::

:::challenge id=mod-load-entry-point title="Resolve an entry point" difficulty=medium
`[project.scripts]` and plugin systems name objects with strings like `"invoice_tool.cli:main"`: a module path, a colon, then an attribute path. Write `load(spec)` that imports the module and returns the object:

```text
load("json:dumps")               ->  the json.dumps function
load("os.path:join")             ->  os.path.join
load("json:JSONDecoder.decode")  ->  attributes are walked left to right
load("json")                     ->  no colon: the module itself
```

Let `ModuleNotFoundError` and `AttributeError` propagate. Use `importlib.import_module`, not `eval` or `exec`.

```js
async function load(spec) {
  const [modulePath, attrPath] = spec.split(":");
  const mod = await import(modulePath);
  return attrPath ? attrPath.split(".").reduce((obj, key) => obj[key], mod) : mod;
}
```

```python starter
import importlib


def load(spec):
    ...
```

```python solution
from importlib import import_module


def load(spec):
    module_name, _, attr_path = spec.partition(":")
    obj = import_module(module_name)
    if attr_path:
        for name in attr_path.split("."):
            obj = getattr(obj, name)
    return obj
```

```python tests
import importlib
import json
import os
import sys
from pathlib import Path

@test("module:attribute, with dotted module paths")
def _():
    check(load("json:dumps") is json.dumps, 'load("json:dumps") should return json.dumps')
    check(load("os.path:join") is os.path.join, "import os.path, then get join")

@test("dotted attribute paths")
def _():
    check(load("json:JSONDecoder.decode") is json.JSONDecoder.decode, "get JSONDecoder, then its decode")

@test("no colon returns the module")
def _():
    check(load("json") is json, 'load("json") should return the json module')

@test("works with your own modules")
def _():
    Path("fjip_invoice_cli.py").write_text('def main():\n    return "invoice sent"\n', encoding="utf-8")
    importlib.invalidate_caches()
    sys.modules.pop("fjip_invoice_cli", None)
    eq(load("fjip_invoice_cli:main")(), "invoice sent")

@test("missing modules and attributes raise")
def _():
    raises(ModuleNotFoundError, load, "no_such_module_xyz:main")
    raises(AttributeError, load, "json:no_such_function")

@test("uses importlib, not eval or exec")
def _():
    requires_call("import_module", "use importlib.import_module(name)")
    forbids_call("eval", "eval isn't needed")
    forbids_call("exec", "exec isn't needed")
```

```hint
`spec.partition(":")` splits into `(before, separator, after)` and never raises, even when there's no colon.
```

```hint
`getattr(obj, name)` is `obj[name]` for attributes. Loop over `attr_path.split(".")` and walk one step at a time.
```
:::

:::challenge id=mod-import-order title="Simulate the import system" difficulty=hard
Model what `import entry` does. `graph` maps each module name to the modules it imports, in the order its import statements appear. A module that isn't in `graph` (like `json`) imports nothing.

Write `simulate_import(graph, entry)` that returns a tuple `(order, partial)`:

- `order`: module names in the order their code **finishes** running.
- `partial`: `(importer, imported)` pairs, in order, for every import that received a **partially initialized** module because of a cycle.

Follow Python's own rules. A module is added to `sys.modules` *before* its code runs. Its code then runs its imports top to bottom, and finishes. Importing a module that's already in `sys.modules` never runs it again, even if it's still running.

```text
graph = {"app": ["config", "db"], "db": ["config"], "config": []}
simulate_import(graph, "app")     ->  (["config", "db", "app"], [])

graph = {"orders": ["customers"], "customers": ["orders"]}
simulate_import(graph, "orders")  ->  (["customers", "orders"], [("customers", "orders")])
```

```python starter
def simulate_import(graph, entry):
    ...
```

```python solution
def simulate_import(graph, entry):
    started = set()      # in sys.modules, finished or not
    finished = set()
    order = []
    partial = []

    def load(name):
        started.add(name)
        for dep in graph.get(name, []):
            if dep not in started:
                load(dep)
            elif dep not in finished:
                partial.append((name, dep))
        finished.add(name)
        order.append(name)

    load(entry)
    return order, partial
```

```python tests
@test("a chain finishes from the bottom up")
def _():
    graph = {"app": ["db"], "db": ["config"], "config": []}
    eq(simulate_import(graph, "app"), (["config", "db", "app"], []))

@test("a shared dependency runs once, and isn't partial")
def _():
    graph = {"app": ["config", "db"], "db": ["config"], "config": []}
    eq(simulate_import(graph, "app"), (["config", "db", "app"], []))

@test("imports run in the order they're written")
def _():
    graph = {"app": ["views", "models"], "views": [], "models": []}
    eq(simulate_import(graph, "app")[0], ["views", "models", "app"])

@test("modules outside the graph import nothing")
def _():
    graph = {"app": ["json", "db"], "db": ["json", "sqlite3"]}
    eq(simulate_import(graph, "app")[0], ["json", "sqlite3", "db", "app"])

@test("a cycle terminates and reports the partial import")
def _():
    graph = {"orders": ["customers"], "customers": ["orders"]}
    eq(simulate_import(graph, "orders"), (["customers", "orders"], [("customers", "orders")]))

@test("a longer cycle")
def _():
    graph = {"main": ["a"], "a": ["b"], "b": ["c", "a"], "c": ["main"]}
    eq(simulate_import(graph, "main"), (["c", "b", "a", "main"], [("c", "main"), ("b", "a")]))

@test("doesn't modify the graph")
def _():
    graph = {"app": ["db"], "db": []}
    simulate_import(graph, "app")
    eq(graph, {"app": ["db"], "db": []})
```

```hint
Write a recursive helper `load(name)` inside the function. A set of started module names plays the role of `sys.modules`.
```

```hint
A dependency that has started but not finished is partially initialized. Track "finished" separately from "started".
```

```hint
Append a module to `order` after the loop over its imports, not before.
```
:::
