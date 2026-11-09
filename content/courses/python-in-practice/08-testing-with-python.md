---
title: "Testing: unittest, pytest & Mocks"
part: Quality & Testing
summary: From jest and vitest to unittest, pytest and unittest.mock, plus the tests that catch real bugs.
minutes: 45
---

jest and vitest are frameworks you install. Python ships one in the standard library: `unittest`, an xUnit design modelled on Java's JUnit (hence the camelCase `assertEqual`), along with `unittest.mock` and `doctest`. The runner most projects actually use is **pytest**, which also runs unittest tests unchanged. The mental-model shift: there are no `describe`, `it` or `expect` globals and no module-mocking magic. **Tests are classes or plain functions found by name, assertions are methods or a bare `assert`, and mocking means temporarily replacing an attribute at the place your code looks it up.**

The sandbox can't install pytest, so the runnable demos use `unittest`, `doctest` and `unittest.mock`, and the pytest examples are static. They're plain Python, so they read the same either way.

## `unittest.TestCase`

:::compare
```js
import { describe, expect, it } from "vitest";
import { slugify } from "./slugify.js";

describe("slugify", () => {
  it("lowercases and hyphenates", () => {
    expect(slugify("Hello World")).toBe("hello-world");
  });

  it("drops punctuation", () => {
    expect(slugify("Hi, there!")).toBe("hi-there");
  });
});
```
```python
import unittest
from slugify import slugify


class TestSlugify(unittest.TestCase):
    def test_lowercases_and_hyphenates(self):
        self.assertEqual(slugify("Hello World"), "hello-world")

    def test_drops_punctuation(self):
        self.assertEqual(slugify("Hi, there!"), "hi-there")


if __name__ == "__main__":
    unittest.main()
```
:::

The class plays the role of `describe`, and every method whose name starts with `test` is a test. Each test runs on a **fresh instance** of the class, so state stored on `self` never leaks from one test into the next. Assertions are methods on `self`, and they print a readable diff when they fail. From the command line, `python -m unittest` discovers files named `test*.py` and runs them, and `pytest` runs the same classes unchanged.

In a playground, call `unittest.main(argv=[""], exit=False)`. The `argv` argument stops it from parsing the page's command line, and `exit=False` stops it from calling `sys.exit()` when it's done. The report goes to stderr. One test below fails on purpose:

```python run
import unittest

def slugify(title):
    return "-".join(title.lower().split())

class TestSlugify(unittest.TestCase):
    def test_lowercases_and_hyphenates(self):
        self.assertEqual(slugify("Hello World"), "hello-world")

    def test_collapses_whitespace(self):
        self.assertEqual(slugify("  many   spaces "), "many-spaces")

    def test_drops_punctuation(self):
        self.assertEqual(slugify("Hi, there!"), "hi-there")   # fails: fix slugify

if __name__ == "__main__":
    unittest.main(argv=[""], exit=False)   # in a real file: unittest.main()
```

| jest / vitest | unittest | pytest |
| --- | --- | --- |
| `expect(a).toBe(b)`, `toEqual(b)` | `assertEqual(a, b)` | `assert a == b` |
| `toBe` on objects (same reference) | `assertIs(a, b)` | `assert a is b` |
| `toBeTruthy()`, `toBeFalsy()` | `assertTrue(x)`, `assertFalse(x)` | `assert x`, `assert not x` |
| `toBeNull()` | `assertIsNone(x)` | `assert x is None` |
| `toContain(x)` | `assertIn(x, items)` | `assert x in items` |
| `toBeInstanceOf(C)` | `assertIsInstance(x, C)` | `assert isinstance(x, C)` |
| `toBeCloseTo(x)` | `assertAlmostEqual(a, b)` | `assert a == pytest.approx(b)` |
| `toBeGreaterThan(n)` | `assertGreater(a, n)` | `assert a > n` |
| same items, any order | `assertCountEqual(a, b)` | `assert sorted(a) == sorted(b)` |
| `toMatch(/re/)` | `assertRegex(s, r"re")` | `assert re.search(r"re", s)` |
| `toThrow(Err)` | `with self.assertRaises(Err):` | `with pytest.raises(Err):` |
| `toThrow(/msg/)` | `assertRaisesRegex(Err, r"msg")` | `pytest.raises(Err, match=r"msg")` |

`assertEqual` compares with `==`, which is already deep for lists, dicts and dataclasses, so there's no `toBe`/`toEqual` split to remember (see [Truthiness & Equality](lesson:truthiness-and-equality)).

:::gotcha `assertEquals` is gone
Older tutorials use `assertEquals`, `assertNotEquals`, `assert_`, `failUnless` and friends. Those deprecated aliases were removed in 3.12, and calling one now raises `AttributeError`. Use the current names: `assertEqual`, `assertNotEqual` and `assertTrue`.
:::

### Running a suite yourself

`unittest.main()` is a thin layer over three objects you can drive directly: a **loader** collects tests into a suite, a **runner** runs the suite, and a **result** records what happened. The challenges at the end of this lesson use exactly this to run *your* tests.

```python run
import io
import unittest

class TestNumbers(unittest.TestCase):
    def test_passes(self):
        self.assertEqual(sum([1, 2, 3]), 6)

    def test_fails(self):
        self.assertEqual(sorted([3, 1, 2]), [1, 2, 4])

    def test_errors(self):
        {}["missing"]

    @unittest.skip("not today")
    def test_skipped(self):
        pass

suite = unittest.defaultTestLoader.loadTestsFromTestCase(TestNumbers)
result = unittest.TextTestRunner(stream=io.StringIO()).run(suite)
print(result.testsRun, len(result.failures), len(result.errors), len(result.skipped))
print(result.wasSuccessful())
```

A **failure** is an assertion that didn't hold, and an **error** is any other exception escaping the test. jest reports both as failures, but the distinction is handy: an error means something blew up before any assertion could judge the result. From a terminal:

```bash
python -m unittest                          # discover test*.py from the current directory
python -m unittest tests.test_slugify -v    # one module, verbose
python -m unittest -k punctuation           # only tests whose names match
```

:::quiz output
What does this print?

```python
import io
import unittest

class TestTotal(unittest.TestCase):
    def test_total_seconds(self):
        self.assertEqual(sum([1800.0, 3600.0]), 5400)

suite = unittest.defaultTestLoader.loadTestsFromTestCase(TestTotal)
result = unittest.TextTestRunner(stream=io.StringIO()).run(suite)
print(result.wasSuccessful())
```

- [x] `True`
- [ ] `False`
- [ ] `TypeError`

`5400.0 == 5400` is `True`, so `assertEqual` passes even though the function returned a float. When the type is part of the contract, add `assertIsInstance(result, int)`. The coercion stops there, though: `assertEqual(1, "1")` fails.
:::

## Table-driven tests with `subTest`

:::compare
```js
it.each([
  ["Hello World", "hello-world"],
  ["  spaced  out ", "spaced-out"],
  ["Hi, there!", "hi-there"],
])("slugify(%s)", (title, expected) => {
  expect(slugify(title)).toBe(expected);
});
```
```python
class TestSlugify(unittest.TestCase):
    def test_examples(self):
        cases = [
            ("Hello World", "hello-world"),
            ("  spaced  out ", "spaced-out"),
            ("Hi, there!", "hi-there"),
        ]
        for title, expected in cases:
            with self.subTest(title=title):
                self.assertEqual(slugify(title), expected)
```
:::

A plain loop would stop at the first failing case and hide the rest. Inside `with self.subTest(...)`, a failure is recorded with the keyword arguments you passed, and the loop carries on, so every broken case shows up in one run. pytest's `@pytest.mark.parametrize`, [shown later](#pytest-plain-functions-and-plain-assert), goes a step further and generates one test per case.

```python run
import unittest

def is_leap_year(year):
    return year % 4 == 0          # bug: forgets the century rule

class TestLeapYear(unittest.TestCase):
    def test_known_years(self):
        cases = [(2024, True), (2023, False), (2000, True), (1900, False), (2100, False)]
        for year, expected in cases:
            with self.subTest(year=year):
                self.assertEqual(is_leap_year(year), expected)

if __name__ == "__main__":
    unittest.main(argv=[""], exit=False)
```

:::pythonic Several context managers, one `with`
Checking that every bad input raises is a nested pair of `with` blocks, which collapses onto one line: `with self.subTest(text=text), self.assertRaises(ValueError):`.
:::

## Fixtures: `setUp`, `tearDown` and `addCleanup`

:::compare
```js
describe("TodoStore", () => {
  let dir, store;
  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), "todo-"));
    store = new TodoStore(path.join(dir, "todos.json"));
  });
  afterEach(() => fs.rmSync(dir, { recursive: true }));

  it("starts empty", () => {
    expect(store.all()).toEqual([]);
  });
});
```
```python
class TestTodoStore(unittest.TestCase):
    def setUp(self):
        tmp = tempfile.TemporaryDirectory()
        self.addCleanup(tmp.cleanup)    # the afterEach, next to its resource
        self.store = TodoStore(Path(tmp.name) / "todos.json")

    def test_starts_empty(self):
        self.assertEqual(self.store.all(), [])
```
:::

`setUp` and `tearDown` run around every test method, like `beforeEach` and `afterEach`. `setUpClass` and `tearDownClass` are classmethods that run once per class, like `beforeAll` and `afterAll`, and module-level `setUpModule()` and `tearDownModule()` functions do the same once per file.

Prefer `addCleanup(fn, *args)` to `tearDown`. You register the undo step right where you create the resource, cleanups run in reverse order, and they still run when a later line of `setUp` raises, which is precisely the case where `tearDown` isn't called at all. `self.enterContext(cm)` (3.11+) goes one step further: it enters a context manager and registers its exit as a cleanup, so any `with`-style resource becomes a fixture in one line.

```python run
import json
import tempfile
import unittest
from pathlib import Path

class TodoStore:
    def __init__(self, path):
        self.path = path

    def all(self):
        if not self.path.exists():
            return []
        return json.loads(self.path.read_text(encoding="utf-8"))

    def add(self, title):
        self.path.write_text(json.dumps([*self.all(), title]), encoding="utf-8")

class TestTodoStore(unittest.TestCase):
    def setUp(self):
        tmp_dir = self.enterContext(tempfile.TemporaryDirectory())   # 3.11+
        self.store = TodoStore(Path(tmp_dir) / "todos.json")

    def test_starts_empty(self):
        self.assertEqual(self.store.all(), [])

    def test_add_persists(self):
        self.store.add("write tests")
        self.assertEqual(TodoStore(self.store.path).all(), ["write tests"])

if __name__ == "__main__":
    unittest.main(argv=[""], verbosity=2, exit=False)
```

## Exceptions, warnings and logs

:::compare
```js
expect(() => parsePort("http")).toThrow(RangeError);
expect(() => parsePort("99999")).toThrow(/out of range/);


const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
connect({ retries: 0 });
expect(warn).toHaveBeenCalledWith(expect.stringContaining("no retries"));
```
```python
with self.assertRaises(ValueError):
    parse_port("http")
with self.assertRaisesRegex(ValueError, "out of range"):
    parse_port("99999")

with self.assertLogs("net", level="WARNING") as logs:
    connect(retries=0)
self.assertIn("no retries", logs.output[0])
```
:::

Used as a context manager, `assertRaises` passes only if the block raises that exception type or a subclass, and it keeps the exception on `cm.exception` for further checks. `assertRaisesRegex` also matches the message, like `toThrow(/.../)`. `assertWarns` and `assertWarnsRegex` do the same for warnings. Instead of spying on `console`, `assertLogs(logger, level)` captures what a block logs through [the logging tree](lesson:logging-and-debugging) without any handler setup: `cm.output` holds `"LEVEL:logger:message"` strings and `cm.records` the records themselves. `assertNoLogs` (3.10+) checks the opposite.

```python run
import logging
import unittest
import warnings

log = logging.getLogger("billing")

def charge(amount):
    if amount < 0:
        raise ValueError(f"negative amount: {amount}")
    if amount > 1000:
        log.warning("large charge: %s", amount)
    return amount

def charge_v1(amount):
    warnings.warn("charge_v1() is deprecated; use charge()", DeprecationWarning, stacklevel=2)
    return charge(amount)

class TestCharge(unittest.TestCase):
    def test_rejects_negative_amounts(self):
        with self.assertRaises(ValueError) as cm:
            charge(-5)
        self.assertIn("negative", str(cm.exception))

    def test_logs_large_charges(self):
        with self.assertLogs("billing", level="WARNING") as cm:
            charge(5000)
        self.assertEqual(cm.output, ["WARNING:billing:large charge: 5000"])

    def test_v1_is_deprecated(self):
        with self.assertWarns(DeprecationWarning):
            charge_v1(10)

if __name__ == "__main__":
    unittest.main(argv=[""], verbosity=2, exit=False)
```

:::gotcha `assertRaises(ValueError, charge(-5))` never gets a chance
That line calls `charge(-5)` first and hands its result to `assertRaises`, so the `ValueError` escapes before any assertion runs, and the test errors. It's the same trap as `expect(fn()).toThrow()` instead of `expect(() => fn()).toThrow()`. Use the `with` form, or pass the callable and its arguments separately: `self.assertRaises(ValueError, charge, -5)`.
:::

## doctest: examples that run

:::compare
```js
/**
 * Return the uppercase initials of a name.
 *
 * @example
 * initials("ada lovelace"); // "AL"
 */
function initials(name) { ... }
```
```python
def initials(name):
    """Return the uppercase initials of a name.

    >>> initials("ada lovelace")
    'AL'
    """
    ...
```
:::

A JSDoc `@example` is a comment that can quietly go stale. **doctest** scans docstrings for lines that start with `>>>`, runs them as if they'd been typed at the REPL, and compares what the REPL would print with the lines below, character for character. `doctest.testmod()` checks every docstring in the current module, `python -m doctest README.md -v` checks a text file, and pytest collects them with `--doctest-modules`. An expected exception is written as `Traceback (most recent call last):`, an indented `...`, then the final line.

```python run
import doctest

def average(values):
    """Return the arithmetic mean of a non-empty list.

    >>> average([1, 2, 3, 4])
    2.5
    >>> average([])
    Traceback (most recent call last):
      ...
    ZeroDivisionError: division by zero
    >>> average([0.1, 0.2])
    0.15
    """
    return sum(values) / len(values)

doctest.testmod()   # the last example fails: see why below
```

:::gotcha doctest compares text, not values
Strings come back with quotes (`'AL'`), floats print every digit (`0.15000000000000002`), and a set of strings prints in an order that changes from run to run, because Python randomises string hashing per process. Write examples whose output is stable, such as `sorted(tags)` or `round(x, 2)`. doctest is for keeping documentation honest; edge cases belong in real tests.
:::

:::quiz
This example fails under doctest. Why?

```python
def initials(name):
    """Return the uppercase initials of a name.

    >>> initials("ada lovelace")
    "AL"
    """
    return "".join(word[0].upper() for word in name.split())
```

- [x] The REPL echoes `repr()`, which is `'AL'` with single quotes, and doctest compares text exactly
- [ ] doctest needs a `print()` around every example
- [ ] `initials` returns `"al"`, because `upper()` is never applied
- [ ] Docstring examples must be indented with tabs

The expected output has to match what the interactive prompt would print, character for character. Either write `'AL'`, or call `print(initials("ada lovelace"))` and expect `AL`.
:::

## pytest: plain functions and plain `assert`

:::compare
```js
// cart.test.js
import { beforeEach, expect, it, vi } from "vitest";

let cart;
beforeEach(() => {
  cart = new Cart();
});

it("totals line items", () => {
  cart.add("tea", 4.5, 2);
  expect(cart.total()).toBeCloseTo(9);
});

it("reads the tax rate from the environment", () => {
  vi.stubEnv("TAX_RATE", "0.2");
  expect(cart.taxRate()).toBe(0.2);
});
```
```python
# test_cart.py
import pytest


@pytest.fixture
def cart():
    return Cart()


def test_totals_line_items(cart):
    cart.add("tea", 4.5, qty=2)
    assert cart.total() == pytest.approx(9)


def test_reads_tax_rate_from_env(cart, monkeypatch):
    monkeypatch.setenv("TAX_RATE", "0.2")
    assert cart.tax_rate() == 0.2
```
:::

pytest needs no base class and no assertion vocabulary. A test is a function named `test_*` in a file named `test_*.py` (or `*_test.py`), and the assertion is the `assert` statement. pytest rewrites the `assert`s in test files, so a failure shows the values on both sides:

```text
>       assert "linus" in users
E       AssertionError: assert 'linus' in ['ada', 'grace']
```

**Fixtures** replace `beforeEach`. A fixture is a function decorated with `@pytest.fixture`, and a test asks for it by naming it as a parameter, so each test declares exactly what it needs. Code after a `yield` in the fixture is the teardown, `scope="module"` or `scope="session"` shares one instance like `beforeAll`, and fixtures defined in a `conftest.py` are available to every test file in that directory and below. The built-in ones cover the usual chores: `tmp_path` (a fresh `pathlib.Path` directory per test), `monkeypatch` (set attributes and environment variables, undone after the test) and `capsys` (captured stdout and stderr). The basics are also in [Modules, Packages & Tooling](lesson:modules-and-tooling#ruff-mypy-and-pytest).

```python title="conftest.py"
import sqlite3

import pytest


@pytest.fixture(scope="session")
def db():
    conn = sqlite3.connect(":memory:")
    yield conn              # every test in the run shares this connection
    conn.close()            # teardown, after the last test


@pytest.fixture
def todo_path(tmp_path):    # fixtures can request other fixtures
    return tmp_path / "todos.json"
```

```python title="test_slugify.py"
import pytest

from shop.text import slugify


@pytest.mark.parametrize(
    ("title", "expected"),
    [("Hello World", "hello-world"), ("  spaced  out ", "spaced-out")],
    ids=["basic", "whitespace"],
)
def test_slugify(title, expected):
    assert slugify(title) == expected


@pytest.mark.skip(reason="waiting on the new tax rules")
def test_reverse_charge_vat(): ...


@pytest.mark.xfail(reason="2.675 is stored as 2.67499999...")
def test_rounding():
    assert round(2.675, 2) == 2.68
```

| jest / vitest | pytest | Notes |
| --- | --- | --- |
| `test("...", fn)`, `it(...)` | `def test_name():` | discovered by name |
| `describe(...)` | the module, or a `class TestCart:` | no base class needed |
| `expect(x).toBe(y)` | `assert x == y` | values shown on failure |
| `beforeEach`, `afterEach` | a fixture; code after `yield` tears down | requested by parameter name |
| `beforeAll` | `@pytest.fixture(scope="module")` | or `"session"` |
| `it.each(table)` | `@pytest.mark.parametrize("a,b", table)` | one test per row |
| `it.skip`, `it.fails` | `@pytest.mark.skip`, `@pytest.mark.xfail` | `skipif(condition, ...)` too |
| `toThrow(/msg/)` | `with pytest.raises(E, match=r"msg"):` | `match` is a regex search |
| `toBeCloseTo` | `pytest.approx` | works on lists and dicts too |
| `vi.stubEnv`, `vi.spyOn` | `monkeypatch.setenv`, `monkeypatch.setattr` | undone automatically |
| temporary directories | the `tmp_path` fixture | a `pathlib.Path` |
| capturing `console.log` | the `capsys` fixture | `capsys.readouterr().out` |
| `setupFiles`, shared helpers | `conftest.py` | fixtures for a whole directory |
| `-t pattern`, `--bail` | `-k pattern`, `-x` | |
| `--coverage` | `--cov` | the pytest-cov plugin |

```bash
pytest                     # discover and run everything
pytest -x -k slugify       # stop at the first failure; only tests matching "slugify"
pytest --lf                # rerun only the tests that failed last time
pytest -n auto             # run in parallel (the pytest-xdist plugin)
```

There's no magic in the discovery step: pytest imports the file and collects the names that start with `test`. Here's the idea in a few lines, minus the assertion rewriting. [Build a Tiny Test Runner](lesson:project-test-runner) takes it all the way.

```python run
def add(a, b):
    return a + b

def test_adds_numbers():
    assert add(2, 3) == 5

def test_joins_strings():
    assert add("py", "test") == "pytest"

def test_mixes_types():
    assert add(1, "2") == "12"     # JavaScript says "12"; Python raises TypeError

for name, fn in list(globals().items()):
    if name.startswith("test_") and callable(fn):
        try:
            fn()
            print(f"PASSED  {name}")
        except Exception as exc:
            print(f"FAILED  {name}: {type(exc).__name__}: {exc}")
```

## Mock objects

:::compare
```js
const send = vi.fn().mockReturnValue({ id: "msg_1" });

notifyOverdue(invoices, send);

expect(send).toHaveBeenCalledTimes(1);
expect(send).toHaveBeenCalledWith("ada@example.com", expect.any(String));
send.mock.calls[0][1];                          // the message
```
```python
send = Mock(return_value={"id": "msg_1"})

notify_overdue(invoices, send)

send.assert_called_once()
send.assert_called_once_with("ada@example.com", ANY)
send.call_args.args[1]                          # the message
```
:::

A `Mock` from `unittest.mock` records every call made to it and invents attributes on demand: `mailer.send` is itself a `Mock`, so one object can stand in for a function, an object, or a whole client. `return_value` is `mockReturnValue`. `side_effect` covers the rest: a function becomes the implementation, like `mockImplementation`, an iterable supplies one result per call, like chained `mockReturnValueOnce`, and an exception class or instance is raised. Afterwards you inspect `call_count`, `call_args` (with `.args` and `.kwargs`), `call_args_list` and `mock_calls`, or assert with `assert_called_once_with`, `assert_has_calls`, `assert_not_called` and friends. `MagicMock` also supports dunder methods (`len()`, iteration, `with`), and `AsyncMock` returns awaitables and adds `assert_awaited_once_with`.

```python run
from unittest.mock import ANY, Mock

def notify_overdue(invoices, send):
    for invoice in invoices:
        if invoice["days_late"] > 30:
            send(invoice["email"], f"Invoice {invoice['id']} is overdue")

send = Mock(return_value={"id": "msg_1"})
notify_overdue([
    {"id": 7, "email": "ada@example.com", "days_late": 45},
    {"id": 8, "email": "grace@example.com", "days_late": 3},
], send)

send.assert_called_once_with("ada@example.com", ANY)
print(send.call_count, send.call_args.args)

double = Mock(side_effect=lambda n: n * 2)     # a fake implementation
print(double(21), double.call_args_list)
```

:::quiz output
What does this print?

```python
from unittest.mock import Mock

fetch = Mock(side_effect=[ConnectionError("timeout"), {"status": "ok"}])
results = []
for _ in range(2):
    try:
        results.append(fetch("/health"))
    except ConnectionError as err:
        results.append(f"failed: {err}")
print(results)
```

- [x] `['failed: timeout', {'status': 'ok'}]`
- [ ] `[{'status': 'ok'}, {'status': 'ok'}]`
- [ ] `['failed: timeout', 'failed: timeout']`
- [ ] `StopIteration`

An iterable `side_effect` is consumed one item per call, and an item that's an exception is raised instead of returned. A third call would raise `StopIteration`, because the list has run out.
:::

### `spec` and `autospec`

:::gotcha A `Mock` accepts anything
Misspell a method, `mailer.sned(...)`, or call it with the wrong arguments, and a plain `Mock` happily records the call. The test passes, and production crashes. Python does catch typos in the *assertion* methods (`assret_called_once` and `called_once_with` raise `AttributeError`), but your own method names get no such protection.
:::

Give the mock a specification. `Mock(spec=Gateway)` only allows attribute names that `Gateway` has. `create_autospec(Gateway, instance=True)`, or `patch(..., autospec=True)`, goes further and checks every call against the real signatures, so a refactor that changes a signature also breaks the tests still using the old one. It's the runtime version of typing your mocks in TypeScript.

```python run
from unittest.mock import Mock, create_autospec

class Gateway:
    def charge(self, amount_cents, *, currency):
        raise NotImplementedError("talks to the real payment provider")

loose = Mock()
loose.charge(1999, "EUR")          # wrong call shape: accepted
loose.chrage(1999)                 # typo: accepted too

strict = create_autospec(Gateway, instance=True)
strict.charge(1999, currency="EUR")
strict.charge.assert_called_once_with(1999, currency="EUR")
for bad_call in (lambda: strict.charge(1999, "EUR"), lambda: strict.chrage(1999)):
    try:
        bad_call()
    except (TypeError, AttributeError) as err:
        print(f"{type(err).__name__}: {err}")
```

## `patch`: swap a name where it's looked up

:::compare
```js
import { expect, it, vi } from "vitest";
import { totalIn } from "./invoice.js";
import { fetchRate } from "./rates.js";

vi.mock("./rates.js", () => ({ fetchRate: vi.fn(() => 0.5) }));

it("converts with the fetched rate", () => {
  expect(totalIn("GBP", 10)).toBe(5);
  expect(fetchRate).toHaveBeenCalledWith("GBP");
});
```
```python
from unittest.mock import patch

import invoice


def test_converts_with_the_fetched_rate():
    with patch("invoice.fetch_rate", return_value=0.5) as fake:
        assert invoice.total_in("GBP", 10) == 5
    fake.assert_called_once_with("GBP")
```
:::

`vi.mock` is hoisted above the imports and swaps a whole module in the module registry. `patch("invoice.fetch_rate")` is far less magical: it imports `invoice`, replaces the attribute `fetch_rate` with a `MagicMock` for the duration of the `with` block (or the decorated test), then puts the original back. It's `setattr` plus an undo.

That leads to the rule that trips everyone up: **patch the name where it's looked up, not where it's defined.** `invoice.py` did `from rates import fetch_rate`, which bound a second name, `invoice.fetch_rate`, to the same function (see [Modules & Tooling](lesson:modules-and-tooling#from-imports-don-t-stay-live)). Patching `rates.fetch_rate` changes the `rates` module, but `invoice` still holds the original:

```python run
import importlib
import sys
from pathlib import Path
from unittest.mock import patch

Path("rates.py").write_text(
    "def fetch_rate(currency):\n    raise ConnectionError('no network in tests')\n", encoding="utf-8")
Path("invoice.py").write_text(
    "from rates import fetch_rate\n\n"
    "def total_in(currency, amount):\n    return round(amount * fetch_rate(currency), 2)\n",
    encoding="utf-8")
for name in ("rates", "invoice"):
    sys.modules.pop(name, None)
importlib.invalidate_caches()
import invoice

with patch("rates.fetch_rate", return_value=0.5):
    try:
        invoice.total_in("GBP", 10)
    except ConnectionError as err:
        print("patched rates.fetch_rate, invoice still called the real one:", err)

with patch("invoice.fetch_rate", return_value=0.5) as fake:
    print(invoice.total_in("GBP", 10))
fake.assert_called_once_with("GBP")
```

The other forms follow the same idea. `patch.object(client, "get")` patches an attribute of an object you already hold, `patch.dict(os.environ, {"APP_ENV": "test"})` adds keys to a dict and removes them afterwards, and `patch.object(repo, "save", wraps=repo.save)` is a spy that records calls but still runs the real method, like `vi.spyOn`.

:::gotcha Stacked `@patch` decorators pass mocks bottom-up
As a decorator, `patch` adds the mock as an extra argument to the test. Decorators apply from the bottom up, so the **lowest** `@patch` provides the **first** argument:

```python
@patch("shop.emails.send")
@patch("shop.payments.charge")
def test_checkout(mock_charge, mock_send):   # the bottom decorator comes first
    ...
```
:::

:::quiz
`report.py` starts with `from clock import now` and calls `now()` inside `build_report()`. Which patch makes `build_report()` see a fake time?

- [x] `patch("report.now", return_value=...)`
- [ ] `patch("clock.now", return_value=...)`
- [ ] Either one: they patch the same function
- [ ] Neither: `from` imports can't be patched

`from clock import now` binds a second name, `report.now`, to the function object, and `build_report()` looks up that name. Patching `clock.now` rebinds the name in `clock` only. If `report.py` did `import clock` and called `clock.now()`, then `patch("clock.now")` would be the right target.
:::

## Test doubles for time and randomness

:::compare
```js
vi.useFakeTimers();
vi.setSystemTime(1_800_000_000_000);

expect(isExpired(token)).toBe(true);

vi.useRealTimers();
```
```python
def is_expired(token, clock=time.time):    # inject the clock
    return clock() >= token.expires_at


assert is_expired(token, clock=lambda: 1_800_000_000)
```
:::

The standard library has no `useFakeTimers`. There are three ways to control time, best first:

1. **Inject the clock.** Take `now` (a value) or `clock` (a function such as `time.time` or `datetime.now`) as a parameter with a real default. Tests pass a fixed value, and production code never notices. Default to `None` when the default must be computed, because a default like `now=datetime.now()` is [evaluated once](lesson:functions#defaults-are-evaluated-once), when `def` runs.
2. **Patch the name your module looks up**, such as `patch("shop.tokens.time")`. You can't patch `datetime.datetime.now` itself: built-in types are immutable, so the patch raises `TypeError`.
3. **Use a library.** `time-machine` and `freezegun` fake the clock for the whole process (`@time_machine.travel("2030-01-01")`, `@freeze_time("2030-01-01")`), and `pytest-freezer` wraps freezegun as a fixture.

The same goes for sleeps in retry loops: pass the `sleep` function in, so tests can record the delays instead of waiting for them. For randomness, pass in a `random.Random(seed)` instance rather than calling the module-level functions. The same seed gives the same sequence on a given Python version, and nothing else in the process can disturb its state.

```python run
import random
from datetime import datetime
from unittest.mock import patch

try:
    with patch("datetime.datetime.now", return_value=datetime(2030, 1, 1)):
        pass
except TypeError as err:
    print("TypeError:", err)

dice = random.Random(42)
replay = random.Random(42)
print([dice.randint(1, 6) for _ in range(5)])
print([replay.randint(1, 6) for _ in range(5)])   # same seed, same rolls
```

## Property-based tests, coverage and mutation testing

:::compare
```js
import fc from "fast-check";

test("reversing twice is a no-op", () => {
  fc.assert(
    fc.property(fc.array(fc.integer()), (xs) => {
      expect(xs.toReversed().toReversed()).toEqual(xs);
    }),
  );
});
```
```python
from hypothesis import given
from hypothesis import strategies as st


@given(st.lists(st.integers()))
def test_reversing_twice_is_a_no_op(xs):
    assert xs[::-1][::-1] == xs
```
:::

**hypothesis** is Python's fast-check: you describe the inputs with strategies, it generates hundreds of cases, and when one fails it shrinks it to the smallest input that still fails. It runs under pytest and under unittest.

**Coverage** comes from coverage.py, usually through the pytest-cov plugin, which is the `vitest --coverage` of Python. Turn on branch coverage, so an `if` whose `else` path never ran doesn't count as covered:

```bash
pytest --cov=shop --cov-branch --cov-report=term-missing
```

```toml title="pyproject.toml"
[tool.coverage.run]
branch = true
source = ["src"]

[tool.coverage.report]
show_missing = true
fail_under = 90
```

Coverage tells you which lines ran, not whether any test would notice them being wrong. **Mutation testing** answers that question. `mutmut`, Python's Stryker, makes small edits to your code (`<` becomes `<=`, `+` becomes `-`, a constant changes), reruns the tests against every edit, and reports each **mutant** that survived. The challenges below are mutation testing in miniature: your tests must pass against the correct code and fail against every broken version.

## Cheat sheet

| JavaScript | Python | Notes |
| --- | --- | --- |
| `describe` + `it` | `class TestX(unittest.TestCase)` + `def test_*` | or plain `def test_*` functions under pytest |
| `expect(a).toEqual(b)` | `self.assertEqual(a, b)`, `assert a == b` | `==` is already deep |
| `expect(a).toBe(b)` (same object) | `assertIs(a, b)`, `assert a is b` | |
| `expect(fn).toThrow(E)` | `with self.assertRaises(E):`, `pytest.raises(E)` | a `with` block |
| `it.each(table)` | `with self.subTest(...)`, `@pytest.mark.parametrize` | |
| `beforeEach`, `afterEach` | `setUp`, `addCleanup`, `enterContext` | pytest: fixtures with `yield` |
| `beforeAll` | `setUpClass`, `scope="module"` fixture | |
| spying on `console.warn` | `assertLogs`, `assertWarns` | |
| JSDoc `@example` | doctest | the examples actually run |
| `vi.fn()` | `Mock()` | `MagicMock` for dunders, `AsyncMock` for coroutines |
| `mockReturnValue(v)` | `Mock(return_value=v)` | |
| `mockImplementation(fn)` | `Mock(side_effect=fn)` | |
| `mockReturnValueOnce(a)` chains | `side_effect=[a, b]` | exceptions in the list are raised |
| `mockRejectedValue(err)` | `AsyncMock(side_effect=err)` | |
| `toHaveBeenCalledWith(...)` | `assert_called_with(...)`, `assert_called_once_with(...)` | |
| `toHaveBeenCalledTimes(n)` | `mock.call_count == n` | |
| `mock.calls` | `mock.call_args_list` | |
| typed mocks | `create_autospec(Cls)`, `patch(..., autospec=True)` | checks names and signatures |
| `vi.mock("./rates.js")` | `patch("invoice.fetch_rate")` | patch where it's looked up |
| `vi.spyOn(obj, "m")` | `patch.object(obj, "m", wraps=obj.m)` | |
| `vi.stubEnv(k, v)` | `patch.dict(os.environ, {k: v})` | `monkeypatch.setenv` in pytest |
| `vi.useFakeTimers()` | inject the clock | or time-machine / freezegun |
| fast-check | hypothesis | |
| `vitest --coverage` | `pytest --cov` | coverage.py underneath |
| Stryker | mutmut | |

## Challenges

:::challenge id=testing-inject-clock title="Make the greeting testable" difficulty=easy
This greeting reads the clock directly, so a test can only check whatever the time happens to be. Rewrite it as `greeting(name, now=None)`, where `now` is a `datetime`. When it's omitted, use the current local time.

- Before 12:00 it's `"Good morning, <name>"`.
- From 12:00 until 18:00 it's `"Good afternoon, <name>"`.
- From 18:00 it's `"Good evening, <name>"`.

```js
function greeting(name) {
  const hour = new Date().getHours();
  if (hour < 12) return `Good morning, ${name}`;
  if (hour < 18) return `Good afternoon, ${name}`;
  return `Good evening, ${name}`;
}
```

```python starter
from datetime import datetime


def greeting(name):
    hour = datetime.now().hour
    if hour < 12:
        return f"Good morning, {name}"
    if hour < 18:
        return f"Good afternoon, {name}"
    return f"Good evening, {name}"
```

```python solution
from datetime import datetime


def greeting(name, now=None):
    if now is None:
        now = datetime.now()
    if now.hour < 12:
        return f"Good morning, {name}"
    if now.hour < 18:
        return f"Good afternoon, {name}"
    return f"Good evening, {name}"
```

```python tests
from datetime import datetime


@test("morning before 12:00")
def _():
    eq(greeting("Ada", now=datetime(2030, 1, 1, 9, 30)), "Good morning, Ada")
    eq(greeting("Ada", now=datetime(2030, 1, 1, 0, 0)), "Good morning, Ada")
    eq(greeting("Ada", now=datetime(2030, 1, 1, 11, 59)), "Good morning, Ada")


@test("afternoon from 12:00 until 18:00")
def _():
    eq(greeting("Grace", now=datetime(2030, 1, 1, 12, 0)), "Good afternoon, Grace")
    eq(greeting("Grace", now=datetime(2030, 1, 1, 17, 59)), "Good afternoon, Grace")


@test("evening from 18:00")
def _():
    eq(greeting("Linus", now=datetime(2030, 1, 1, 18, 0)), "Good evening, Linus")
    eq(greeting("Linus", now=datetime(2030, 1, 1, 23, 59)), "Good evening, Linus")


@test("still works without now")
def _():
    check(
        greeting("Ada") in {"Good morning, Ada", "Good afternoon, Ada", "Good evening, Ada"},
        "greeting('Ada') should fall back to the current time",
    )


@test("reads the clock at call time, not when def runs")
def _():
    defaults = [*(greeting.__defaults__ or ()), *(greeting.__kwdefaults__ or {}).values()]
    check(
        not any(isinstance(value, datetime) for value in defaults),
        "a default of datetime.now() is evaluated once, when def runs: default to None instead",
    )
```

```hint
Add the parameter with a default of `None`, then replace it with `datetime.now()` inside the body when it's missing.
```

```hint
`def greeting(name, now=datetime.now())` looks right, but the default is computed once, when the module loads, so every call would see the same time.
```
:::

:::challenge id=testing-catch-the-mutants title="Tests that catch bugs" difficulty=medium
`parse_duration` below is correct. Your job is to write the `TestParseDuration` test case that proves it.

The tests run your `TestParseDuration` against the correct `parse_duration`, where every test must pass, then against each of seven broken versions, where at least one test must fail. Each broken version is a realistic bug: a wrong number, a missing normalisation step, a missing validation, or the wrong type. Read the docstring as the spec, and cover what it promises.

Use `self.subTest` for at least one table of cases.

```js
// The vitest equivalent: a table of cases plus the error cases
it.each([["5m", 300], ["1h30m", 5400]])("parses %s", (text, seconds) => {
  expect(parseDuration(text)).toBe(seconds);
});
it("rejects junk", () => {
  expect(() => parseDuration("5x")).toThrow(RangeError);
});
```

```python starter
import re
import unittest

UNITS = {"h": 3600, "m": 60, "s": 1}
PAIR = re.compile(r"(\d+)([hms])")


def parse_duration(text):
    """Turn "1h30m", "90s" or " 2H " into a whole number of seconds, as an int.

    Surrounding whitespace and letter case are ignored. Anything else that isn't
    one or more <digits><h, m or s> pairs raises ValueError: inner spaces, other
    units, a missing unit, decimals, signs, or an empty string.
    """
    cleaned = text.strip().lower()
    if not cleaned or PAIR.sub("", cleaned):
        raise ValueError(f"invalid duration: {text!r}")
    return sum(int(amount) * UNITS[unit] for amount, unit in PAIR.findall(cleaned))


# Write your tests below. Don't change parse_duration.
class TestParseDuration(unittest.TestCase):
    def test_minutes(self):
        self.assertEqual(parse_duration("5m"), 300)
```

```python solution
import re
import unittest

UNITS = {"h": 3600, "m": 60, "s": 1}
PAIR = re.compile(r"(\d+)([hms])")


def parse_duration(text):
    """Turn "1h30m", "90s" or " 2H " into a whole number of seconds, as an int.

    Surrounding whitespace and letter case are ignored. Anything else that isn't
    one or more <digits><h, m or s> pairs raises ValueError: inner spaces, other
    units, a missing unit, decimals, signs, or an empty string.
    """
    cleaned = text.strip().lower()
    if not cleaned or PAIR.sub("", cleaned):
        raise ValueError(f"invalid duration: {text!r}")
    return sum(int(amount) * UNITS[unit] for amount, unit in PAIR.findall(cleaned))


class TestParseDuration(unittest.TestCase):
    def test_valid_durations(self):
        cases = [
            ("45s", 45),
            ("5m", 300),
            ("2h", 7200),
            ("1h30m", 5400),
            ("1h1m1s", 3661),
            (" 2H ", 7200),
            ("90S", 90),
        ]
        for text, seconds in cases:
            with self.subTest(text=text):
                self.assertEqual(parse_duration(text), seconds)

    def test_returns_an_int(self):
        self.assertIsInstance(parse_duration("1h30m"), int)

    def test_rejects_invalid_input(self):
        for text in ["", "   ", "abc", "5x", "1h30", "1.5h", "-5m", "1h 30m"]:
            with self.subTest(text=text), self.assertRaises(ValueError):
                parse_duration(text)
```

```python tests
import io
import re
import unittest
from unittest import mock

_UNITS = {"h": 3600, "m": 60, "s": 1}
_PAIR = re.compile(r"(\d+)([hms])")


def correct(text):
    cleaned = text.strip().lower()
    if not cleaned or _PAIR.sub("", cleaned):
        raise ValueError(f"invalid duration: {text!r}")
    return sum(int(amount) * _UNITS[unit] for amount, unit in _PAIR.findall(cleaned))


def first_pair_only(text):
    cleaned = text.strip().lower()
    if not cleaned or _PAIR.sub("", cleaned):
        raise ValueError(f"invalid duration: {text!r}")
    amount, unit = _PAIR.findall(cleaned)[0]
    return int(amount) * _UNITS[unit]


def hour_typo(text):
    units = {"h": 360, "m": 60, "s": 1}
    cleaned = text.strip().lower()
    if not cleaned or _PAIR.sub("", cleaned):
        raise ValueError(f"invalid duration: {text!r}")
    return sum(int(amount) * units[unit] for amount, unit in _PAIR.findall(cleaned))


def case_sensitive(text):
    cleaned = text.strip()
    if not cleaned or _PAIR.sub("", cleaned):
        raise ValueError(f"invalid duration: {text!r}")
    return sum(int(amount) * _UNITS[unit] for amount, unit in _PAIR.findall(cleaned))


def no_strip(text):
    cleaned = text.lower()
    if not cleaned or _PAIR.sub("", cleaned):
        raise ValueError(f"invalid duration: {text!r}")
    return sum(int(amount) * _UNITS[unit] for amount, unit in _PAIR.findall(cleaned))


def empty_is_zero(text):
    cleaned = text.strip().lower()
    if _PAIR.sub("", cleaned):
        raise ValueError(f"invalid duration: {text!r}")
    return sum(int(amount) * _UNITS[unit] for amount, unit in _PAIR.findall(cleaned))


def ignores_junk(text):
    cleaned = text.strip().lower()
    if not cleaned:
        raise ValueError(f"invalid duration: {text!r}")
    return sum(int(amount) * _UNITS[unit] for amount, unit in _PAIR.findall(cleaned))


def returns_float(text):
    cleaned = text.strip().lower()
    if not cleaned or _PAIR.sub("", cleaned):
        raise ValueError(f"invalid duration: {text!r}")
    return sum(float(amount) * _UNITS[unit] for amount, unit in _PAIR.findall(cleaned))


def run_against(impl):
    """Run your TestParseDuration with parse_duration swapped for impl."""
    suite = unittest.defaultTestLoader.loadTestsFromTestCase(TestParseDuration)
    with mock.patch("__main__.parse_duration", impl):
        return unittest.TextTestRunner(stream=io.StringIO()).run(suite)


def catches(bug):
    baseline = run_against(correct)
    check(baseline.testsRun > 0, "TestParseDuration has no test methods yet")
    check(baseline.wasSuccessful(), "first make your tests pass against the correct parse_duration")
    return not run_against(bug).wasSuccessful()


@test("your tests pass against the correct parse_duration")
def _():
    result = run_against(correct)
    check(result.testsRun > 0, "TestParseDuration has no test methods yet")
    problems = result.failures + result.errors
    if problems:
        case, trace = problems[0]
        check(False, f"{case.id().rsplit('.', 1)[-1]} fails: {trace.strip().splitlines()[-1]}")


@test("catches a version that only reads the first pair (\"1h30m\" gives 3600)")
def _():
    check(catches(first_pair_only), "every test still passed against this bug")


@test("catches a version with a typo in the hour (360 seconds)")
def _():
    check(catches(hour_typo), "every test still passed against this bug")


@test("catches a version that rejects uppercase units")
def _():
    check(catches(case_sensitive), "every test still passed against this bug")


@test("catches a version that rejects surrounding whitespace")
def _():
    check(catches(no_strip), "every test still passed against this bug")


@test("catches a version that returns 0 for an empty string")
def _():
    check(catches(empty_is_zero), "every test still passed against this bug")


@test("catches a version that ignores junk (\"5x\" gives 0, \"1h30\" gives 3600)")
def _():
    check(catches(ignores_junk), "every test still passed against this bug")


@test("catches a version that returns floats (5400.0, not 5400)")
def _():
    check(catches(returns_float), "every test still passed against this bug: assertEqual(5400.0, 5400) passes")


@test("uses self.subTest for a table of cases")
def _():
    requires_call("subTest", "loop over a table of inputs inside `with self.subTest(...)`")
```

```hint
Start with a table of valid inputs and their expected seconds, looping inside `with self.subTest(text=text):`. Include a multi-unit duration, every unit on its own, uppercase letters and surrounding spaces.
```

```hint
The docstring lists what must raise `ValueError`. Write a second table of bad inputs and check each one with `self.assertRaises(ValueError)`. The empty string is one of them.
```

```hint
One bug returns `5400.0` instead of `5400`. `assertEqual` can't tell them apart, because `5400.0 == 5400`, so add `self.assertIsInstance(..., int)`.
```
:::

:::challenge id=testing-mock-gateway title="Mock the payment gateway" difficulty=hard
`checkout` below is correct, and it talks to a payment `gateway` that tests mustn't touch. Write `TestCheckout`, a `unittest.TestCase` that pins down its behaviour with test doubles.

As in the previous challenge, your tests run against the correct `checkout`, where they must all pass, and against eight broken versions, each of which must make at least one test fail. Every line of the docstring is there for a reason.

A `Mock` is the natural double: set `return_value` for a successful charge, `side_effect` for a failing one, and assert on how `charge` was called. A hand-written fake class works too, as long as it records its calls.

```js
// The vitest equivalent
const gateway = { charge: vi.fn().mockReturnValue({ id: "rcpt_1" }) };
expect(checkout(1999, gateway)).toBe("rcpt_1");
expect(gateway.charge).toHaveBeenCalledTimes(1);
expect(gateway.charge).toHaveBeenCalledWith(1999, { currency: "EUR" });
```

```python starter
import unittest
from unittest.mock import Mock


class PaymentDeclined(Exception):
    """Raised by the gateway when the card is declined."""


def checkout(total_cents, gateway, *, currency="EUR"):
    """Charge the cart once and return the receipt id, or None if the card is declined.

    gateway.charge(amount_cents, currency=...) returns a dict like {"id": "rcpt_1"}
    or raises PaymentDeclined. Any other exception propagates. A total below one
    cent raises ValueError without charging anything.
    """
    if total_cents < 1:
        raise ValueError(f"nothing to charge: {total_cents}")
    try:
        receipt = gateway.charge(total_cents, currency=currency)
    except PaymentDeclined:
        return None
    return receipt["id"]


# Write your tests below. Don't change checkout() or PaymentDeclined.
class TestCheckout(unittest.TestCase):
    def setUp(self):
        self.gateway = Mock()
        self.gateway.charge.return_value = {"id": "rcpt_1"}

    def test_returns_the_receipt_id(self):
        self.assertEqual(checkout(1999, self.gateway), "rcpt_1")
```

```python solution
import unittest
from unittest.mock import Mock


class PaymentDeclined(Exception):
    """Raised by the gateway when the card is declined."""


def checkout(total_cents, gateway, *, currency="EUR"):
    """Charge the cart once and return the receipt id, or None if the card is declined.

    gateway.charge(amount_cents, currency=...) returns a dict like {"id": "rcpt_1"}
    or raises PaymentDeclined. Any other exception propagates. A total below one
    cent raises ValueError without charging anything.
    """
    if total_cents < 1:
        raise ValueError(f"nothing to charge: {total_cents}")
    try:
        receipt = gateway.charge(total_cents, currency=currency)
    except PaymentDeclined:
        return None
    return receipt["id"]


class TestCheckout(unittest.TestCase):
    def setUp(self):
        self.gateway = Mock()
        self.gateway.charge.return_value = {"id": "rcpt_1"}

    def test_returns_the_receipt_id(self):
        self.assertEqual(checkout(1999, self.gateway), "rcpt_1")

    def test_charges_once_in_cents(self):
        checkout(1999, self.gateway)
        self.gateway.charge.assert_called_once_with(1999, currency="EUR")

    def test_passes_the_currency_through(self):
        checkout(500, self.gateway, currency="GBP")
        self.gateway.charge.assert_called_once_with(500, currency="GBP")

    def test_declined_card_returns_none(self):
        self.gateway.charge.side_effect = PaymentDeclined("card declined")
        self.assertIsNone(checkout(1999, self.gateway))

    def test_other_errors_propagate(self):
        self.gateway.charge.side_effect = ConnectionError("gateway timeout")
        with self.assertRaises(ConnectionError):
            checkout(1999, self.gateway)

    def test_rejects_empty_totals_without_charging(self):
        for total in (0, -100):
            with self.subTest(total=total), self.assertRaises(ValueError):
                checkout(total, self.gateway)
        self.gateway.charge.assert_not_called()
```

```python tests
import io
import unittest
from unittest import mock


def correct(total_cents, gateway, *, currency="EUR"):
    if total_cents < 1:
        raise ValueError(f"nothing to charge: {total_cents}")
    try:
        receipt = gateway.charge(total_cents, currency=currency)
    except PaymentDeclined:
        return None
    return receipt["id"]


def charges_twice(total_cents, gateway, *, currency="EUR"):
    if total_cents < 1:
        raise ValueError(f"nothing to charge: {total_cents}")
    try:
        gateway.charge(total_cents, currency=currency)     # a leftover "retry"
        receipt = gateway.charge(total_cents, currency=currency)
    except PaymentDeclined:
        return None
    return receipt["id"]


def charges_euros(total_cents, gateway, *, currency="EUR"):
    if total_cents < 1:
        raise ValueError(f"nothing to charge: {total_cents}")
    try:
        receipt = gateway.charge(total_cents / 100, currency=currency)
    except PaymentDeclined:
        return None
    return receipt["id"]


def ignores_currency(total_cents, gateway, *, currency="EUR"):
    if total_cents < 1:
        raise ValueError(f"nothing to charge: {total_cents}")
    try:
        receipt = gateway.charge(total_cents, currency="EUR")
    except PaymentDeclined:
        return None
    return receipt["id"]


def swallows_every_error(total_cents, gateway, *, currency="EUR"):
    if total_cents < 1:
        raise ValueError(f"nothing to charge: {total_cents}")
    try:
        receipt = gateway.charge(total_cents, currency=currency)
    except Exception:
        return None
    return receipt["id"]


def lets_declines_escape(total_cents, gateway, *, currency="EUR"):
    if total_cents < 1:
        raise ValueError(f"nothing to charge: {total_cents}")
    receipt = gateway.charge(total_cents, currency=currency)
    return receipt["id"]


def declined_returns_false(total_cents, gateway, *, currency="EUR"):
    if total_cents < 1:
        raise ValueError(f"nothing to charge: {total_cents}")
    try:
        receipt = gateway.charge(total_cents, currency=currency)
    except PaymentDeclined:
        return False
    return receipt["id"]


def accepts_empty_totals(total_cents, gateway, *, currency="EUR"):
    try:
        receipt = gateway.charge(total_cents, currency=currency)
    except PaymentDeclined:
        return None
    return receipt["id"]


def charges_before_validating(total_cents, gateway, *, currency="EUR"):
    try:
        receipt = gateway.charge(total_cents, currency=currency)
    except PaymentDeclined:
        return None
    if total_cents < 1:
        raise ValueError(f"nothing to charge: {total_cents}")
    return receipt["id"]


def run_against(impl):
    """Run your TestCheckout with checkout swapped for impl."""
    suite = unittest.defaultTestLoader.loadTestsFromTestCase(TestCheckout)
    with mock.patch("__main__.checkout", impl):
        return unittest.TextTestRunner(stream=io.StringIO()).run(suite)


def catches(bug):
    baseline = run_against(correct)
    check(baseline.testsRun > 0, "TestCheckout has no test methods yet")
    check(baseline.wasSuccessful(), "first make your tests pass against the correct checkout")
    return not run_against(bug).wasSuccessful()


@test("your tests pass against the correct checkout")
def _():
    result = run_against(correct)
    check(result.testsRun > 0, "TestCheckout has no test methods yet")
    problems = result.failures + result.errors
    if problems:
        case, trace = problems[0]
        check(False, f"{case.id().rsplit('.', 1)[-1]} fails: {trace.strip().splitlines()[-1]}")


@test("catches a checkout that charges the card twice")
def _():
    check(catches(charges_twice), "every test still passed against this bug")


@test("catches a checkout that charges euros instead of cents")
def _():
    check(catches(charges_euros), "every test still passed against this bug")


@test("catches a checkout that always charges in EUR")
def _():
    check(catches(ignores_currency), "every test still passed against this bug")


@test("catches a checkout that swallows every gateway error")
def _():
    check(catches(swallows_every_error), "every test still passed against this bug")


@test("catches a checkout that lets PaymentDeclined escape")
def _():
    check(catches(lets_declines_escape), "every test still passed against this bug")


@test("catches a checkout that returns False for a declined card")
def _():
    check(catches(declined_returns_false), "every test still passed against this bug: assertFalse(None) and assertFalse(False) both pass")


@test("catches a checkout that charges an empty cart")
def _():
    check(catches(accepts_empty_totals), "every test still passed against this bug")


@test("catches a checkout that charges first and validates afterwards")
def _():
    check(catches(charges_before_validating), "every test still passed against this bug")
```

```hint
Create a fresh `Mock()` gateway in `setUp`, so call counts never leak between tests. `self.gateway.charge.assert_called_once_with(1999, currency="EUR")` checks the count, the amount and the currency in one line.
```

```hint
For the failure paths, set `self.gateway.charge.side_effect` to `PaymentDeclined("declined")` in one test and to some other exception, such as `ConnectionError`, in another. A declined card must give exactly `None`, so use `assertIsNone`.
```

```hint
One broken version raises the right `ValueError` for an empty cart, but only after charging it. After your `assertRaises(ValueError)` block, add `self.gateway.charge.assert_not_called()`.
```
:::
