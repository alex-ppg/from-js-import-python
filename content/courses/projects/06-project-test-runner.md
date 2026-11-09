---
title: Build a Tiny Test Runner
part: Systems
summary: A pytest-style runner: a test registry, fixtures injected by name, teardown, parametrize and a report.
minutes: 80
---

Jest, Vitest and pytest look like magic from the outside. You write `def test_total(cart):` and a `cart` shows up, built fresh for that test and cleaned up afterwards. In this project you'll build that machinery in about 150 lines, and find that there's no magic in it: a registry, a `try`/`except`, `inspect.signature`, and a context manager or two. Along the way you'll use most of what Python functions can do: decorators with and without arguments, attributes on functions, `**kwargs` calls, and generators that act as context managers.

Keep two things apart while you read the challenge tests. This site's own tests use a runner much like the one you're building (`@test("...")`, `eq()`, `check()`), so the test code contains both: `@test` registers a check of **your** code, while `@suite.test` registers a test inside **your runner**.

## What you'll build

A `Suite` that collects tests from a decorator and by name, injects fixtures into them by parameter name, sets resources up and tears them down around each test, expands parametrized tests into one case per row, and prints a pytest-style report:

```python
suite = Suite()


@suite.fixture
def prices():
    return {"tea": 300, "cake": 450}


@suite.fixture
def receipt():
    lines = []
    try:
        yield lines                  # the test runs here
    finally:
        print(f"(receipt closed with {len(lines)} lines)")


@suite.test
def test_lookup(prices):
    assert prices["tea"] == 300


@suite.test("a receipt adds up")
def _(prices, receipt):
    receipt.extend([prices["tea"], prices["cake"]])
    assert sum(receipt) == 700


@suite.test
@parametrize("word, length", [("tea", 3), ("", 0), ("naïve", 5)])
def test_len(word, length):
    assert len(word) == length


def test_missing_item(prices):       # no decorator: discover() finds it by name
    assert prices["scone"] > 0


suite.discover(globals())
print("exit code:", suite.main())
```

```output
(receipt closed with 2 lines)
.F...E
FAILED a receipt adds up - assert sum(receipt) == 700
ERROR test_missing_item - KeyError: 'scone'
1 failed, 4 passed, 1 error
exit code: 1
```

`receipt` was set up before its test and torn down afterwards, even though the test failed. `test_len` became three cases. And `test_missing_item` ran without a decorator, because `discover()` found it by name.

:::deep Spoiler: run the finished runner
Every step below builds one piece of this file. Open it if you'd like to try the finished runner first: add a test at the bottom and run it again.

```python run
import inspect
import traceback
from collections import Counter
from collections.abc import Callable
from contextlib import ExitStack, contextmanager
from dataclasses import dataclass, field
from typing import Literal


@dataclass
class TestCase:
    name: str
    fn: Callable[..., object]
    params: dict[str, object] = field(default_factory=dict)  # one @parametrize row


type Outcome = Literal["passed", "failed", "error"]


@dataclass
class Result:
    name: str
    outcome: Outcome
    message: str = ""


def failure_message(exc: AssertionError) -> str:
    """The assert's own message, or else the source line that failed."""
    if message := str(exc):
        return message
    frame = traceback.extract_tb(exc.__traceback__)[-1]
    return frame.line or "assertion failed"


def parametrize(names: str, rows):
    """Run a test once per row: @parametrize("a, b", [(1, 2), (3, 4)])."""
    keys = [key.strip() for key in names.split(",")]
    if len(keys) == 1:                    # @parametrize("n", [1, 2]): bare values
        rows = [(row,) for row in rows]

    def mark(fn):
        fn.params = [dict(zip(keys, row, strict=True)) for row in rows]
        return fn

    return mark


def expand(case: TestCase) -> list[TestCase]:
    """One case per parameter row, named like pytest: test_add[1-2-3]."""
    rows = getattr(case.fn, "params", None)
    if rows is None:
        return [case]
    return [
        TestCase(f"{case.name}[{'-'.join(map(str, row.values()))}]", case.fn, row)
        for row in rows
    ]


class Suite:
    def __init__(self):
        self.cases: list[TestCase] = []
        self.fixtures: dict[str, Callable[..., object]] = {}

    def test(self, name=None):
        """Register a test: @suite.test, @suite.test() or @suite.test("a name")."""
        if callable(name):                  # bare @suite.test: `name` is the function
            return self._register(name.__name__, name)
        return lambda fn: self._register(name or fn.__name__, fn)

    def _register(self, name: str, fn):
        self.cases.append(TestCase(name, fn))
        return fn

    def fixture(self, fn):
        """Register `fn` as a fixture, injected into tests by parameter name."""
        self.fixtures[fn.__name__] = fn
        return fn

    def _resolve(self, fn, values: dict, stack: ExitStack) -> dict:
        """Keyword arguments for `fn`, creating any fixtures it asks for.

        `values` caches the fixtures already made for the current test.
        """
        kwargs = {}
        for name, param in inspect.signature(fn).parameters.items():
            if name not in values:
                if param.default is not param.empty:
                    continue                # an ordinary default, not a fixture
                values[name] = self._create(name, values, stack)
            kwargs[name] = values[name]
        return kwargs

    def _create(self, name: str, values: dict, stack: ExitStack):
        if name not in self.fixtures:
            raise LookupError(f"fixture {name!r} not found")
        factory = self.fixtures[name]
        args = self._resolve(factory, values, stack)
        if inspect.isgeneratorfunction(factory):    # setup, yield, teardown
            return stack.enter_context(contextmanager(factory)(**args))
        return factory(**args)

    def run_case(self, case: TestCase) -> Result:
        try:
            with ExitStack() as stack:      # unwinds this test's fixtures, newest first
                case.fn(**self._resolve(case.fn, dict(case.params), stack))
        except AssertionError as exc:
            return Result(case.name, "failed", failure_message(exc))
        except Exception as exc:
            return Result(case.name, "error", f"{type(exc).__name__}: {exc}")
        return Result(case.name, "passed")

    def run(self) -> list[Result]:
        return [self.run_case(each) for case in self.cases for each in expand(case)]

    def discover(self, namespace: dict) -> None:
        """Register every test_* function in `namespace` that isn't registered yet."""
        known = {case.fn for case in self.cases}
        for name, obj in namespace.items():
            if name.startswith("test_") and inspect.isfunction(obj) and obj not in known:
                self._register(name, obj)

    def main(self) -> int:
        """Run everything, print the report, and return a process exit code."""
        results = self.run()
        print(report(results))
        return 0 if all(result.outcome == "passed" for result in results) else 1


MARKS = {"passed": ".", "failed": "F", "error": "E"}


def report(results: list[Result]) -> str:
    """A pytest-style report: one mark per test, the problems, then the counts."""
    if not results:
        return "no tests ran"
    lines = ["".join(MARKS[result.outcome] for result in results)]
    for result in results:
        if result.outcome != "passed":
            lines.append(f"{result.outcome.upper()} {result.name} - {result.message}")
    counts = Counter(result.outcome for result in results)
    summary = [f"{counts[outcome]} {outcome}" for outcome in ("failed", "passed") if counts[outcome]]
    if errors := counts["error"]:
        summary.append(f"{errors} error{'s' if errors > 1 else ''}")
    lines.append(", ".join(summary))
    return "\n".join(lines)


suite = Suite()


@suite.fixture
def prices():
    return {"tea": 300, "cake": 450}


@suite.fixture
def receipt():
    lines = []
    try:
        yield lines                  # the test runs here
    finally:
        print(f"(receipt closed with {len(lines)} lines)")


@suite.test
def test_lookup(prices):
    assert prices["tea"] == 300


@suite.test("a receipt adds up")
def _(prices, receipt):
    receipt.extend([prices["tea"], prices["cake"]])
    assert sum(receipt) == 700


@suite.test
@parametrize("word, length", [("tea", 3), ("", 0), ("naïve", 5)])
def test_len(word, length):
    assert len(word) == length


def test_missing_item(prices):       # no decorator: discover() finds it by name
    assert prices["scone"] > 0


suite.discover(globals())
print("exit code:", suite.main())
```
:::

## How the pieces fit

```text
  @suite.test, discover() ──► suite.cases ──► expand()     one case per @parametrize row   (steps 1, 5, 6)
                                                  │
                                                  ▼
                                   run_case(case)     fixtures injected by name            (step 3)
                                                      yield fixtures on an ExitStack       (step 4)
                                                  │
                                                  ▼
                       Result(name, "passed" | "failed" | "error", message)                (step 2)
                                                  │
                                                  ▼
                       report() ──► ".F..E", the problems, "1 failed, 3 passed, 1 error"    (step 6)
```

| Step | You build | Python you'll use |
| --- | --- | --- |
| 1 | `TestCase`, `Suite.test()` | registration decorators, with and without arguments |
| 2 | `Result`, `failure_message()`, `run_case()` | ordered `except` clauses, `traceback.extract_tb()` |
| 3 | `Suite.fixture()`, fixture injection | `inspect.signature()`, `**kwargs` calls, recursion |
| 4 | setup and teardown | `contextmanager()` as a plain function, `ExitStack` |
| 5 | `parametrize()`, `expand()` | decorator factories, function attributes, `zip(strict=True)` |
| 6 | `discover()`, `report()`, `main()` | namespaces as dicts, `Counter`, exit codes |

Each step's starter contains the finished code from every earlier step, so you can start anywhere. Where a step changes code from an earlier one, the starter marks the spot with a `TODO` comment. The tests focus on the new piece, and the last step runs a whole suite.

## Step 1: A registry decorator

:::compare
```js
const tests = [];
const test = (name, fn) => tests.push({ name, fn });

test("adds small numbers", () => {
  expect(1 + 1).toBe(2);
});
```
```python
suite = Suite()


@suite.test("adds small numbers")
def _():
    assert 1 + 1 == 2
```
:::

Jest passes the test body as an arrow function. A Python `lambda` can't hold statements, so a test body has to be a `def`, and a decorator is how you hand a `def` to someone else. The decorator **registers** the function and returns it unchanged, the way Flask's `@app.route` does ([Registration decorators](lesson:decorators#decorators-with-arguments)). Since the suite keeps a reference, the function's own name doesn't matter, and `def _():` is the idiom for "this name is never used".

Put the registry on a `Suite` object rather than in a module-level list. Two suites then never share state, which is also what lets the tests below build a throwaway suite per check.

`@suite.test`, `@suite.test()` and `@suite.test("a name")` should all work. The bare form calls `suite.test(fn)` directly, while the other two call `suite.test(...)` first and apply what it returns, so `test()` checks what it was given: if `callable(name)`, it was used bare. The decorators lesson builds the same trick in [With or without parentheses](lesson:decorators#deco-command-registry).

:::challenge id=runner-step-1 title="Step 1: A registry decorator" difficulty=easy
Make `TestCase` a dataclass with two fields, `name` and `fn` (the test function), then write `Suite.test()`. It appends a `TestCase` to `self.cases` and returns the function unchanged, in all three spellings:

```python
@suite.test                    # registered as "test_total"
def test_total(): ...

@suite.test("totals add up")   # registered as "totals add up"
def _(): ...

@suite.test()                  # empty parentheses: registered as "test_tax"
def test_tax(): ...
```

```python starter
from collections.abc import Callable
from dataclasses import dataclass


@dataclass
class TestCase:
    ...  # TODO: name (str) and fn (the test function)


class Suite:
    def __init__(self):
        self.cases: list[TestCase] = []

    def test(self, name=None):
        """Register a test: @suite.test, @suite.test() or @suite.test("a name")."""
        ...
```

```python solution
from collections.abc import Callable
from dataclasses import dataclass


@dataclass
class TestCase:
    name: str
    fn: Callable[..., object]


class Suite:
    def __init__(self):
        self.cases: list[TestCase] = []

    def test(self, name=None):
        """Register a test: @suite.test, @suite.test() or @suite.test("a name")."""
        if callable(name):                  # bare @suite.test: `name` is the function
            return self._register(name.__name__, name)
        return lambda fn: self._register(name or fn.__name__, fn)

    def _register(self, name: str, fn):
        self.cases.append(TestCase(name, fn))
        return fn
```

```python tests
def test_addition():
    assert 1 + 1 == 2


def test_strings():
    assert "py" + "thon" == "python"


@test("bare @suite.test registers the function under its own name")
def _():
    suite = Suite()
    suite.test(test_addition)
    eq([case.name for case in suite.cases], ["test_addition"])
    check(suite.cases[0].fn is test_addition, "the case should hold the test function itself")

@test("@suite.test returns the function unchanged")
def _():
    suite = Suite()
    check(suite.test(test_addition) is test_addition, "return the original function, not a wrapper")
    check(suite.test("named")(test_strings) is test_strings, "the factory form should return it too")

@test('@suite.test("a name") registers under that name')
def _():
    suite = Suite()
    suite.test("adds small numbers")(test_addition)
    eq(suite.cases, [TestCase("adds small numbers", test_addition)])

@test("@suite.test() with empty parentheses uses the function's name")
def _():
    suite = Suite()
    suite.test()(test_strings)
    eq([case.name for case in suite.cases], ["test_strings"])

@test("all three spellings work with @, and keep their order")
def _():
    suite = Suite()

    @suite.test
    def test_first():
        pass

    @suite.test("second, with a description")
    def _():
        pass

    @suite.test()
    def test_third():
        pass

    eq([case.name for case in suite.cases], ["test_first", "second, with a description", "test_third"])

@test("two suites don't share a registry")
def _():
    first, second = Suite(), Suite()
    first.test(test_addition)
    eq(second.cases, [])
```

```hint
Used bare, `test()` receives the function itself as `name`. Check `callable(name)` first.
```

```hint
Otherwise return a decorator: `lambda fn: ...` that appends `TestCase(name or fn.__name__, fn)` and returns `fn`. A small helper method for the append-and-return keeps both branches short.
```
:::

## Step 2: Run the tests

A test can end three ways, and pytest reports all three differently. It **passes** by returning. It **fails** by raising `AssertionError`, which means it checked something and the check was false. And it **errors** by raising anything else, which means the test itself broke before it could check anything. Python's ordered `except` clauses sort the three in one statement ([try, except, else, finally](lesson:exceptions#try-except-else-finally)):

:::compare
```js
try {
  fn();
  // nothing was thrown: it passed
} catch (err) {
  if (err instanceof AssertionError) {
    // it checked something, and the check was false
  } else {
    // the test itself broke
  }
}
```
```python
try:
    fn()

except AssertionError as exc:
    ...   # it checked something, and the check was false
except Exception as exc:
    ...   # the test itself broke
else:
    ...   # nothing was raised: it passed


```
:::

The first matching clause wins, so `AssertionError` must come before `Exception`. The `else:` block runs only when the `try` block raised nothing; returning from each `except` clause and putting the passing case after the whole statement works just as well. Catch `Exception` rather than `BaseException`, so that Ctrl+C (`KeyboardInterrupt`) still stops the whole run.

Python's `assert` is a statement. `assert total == 5` raises an `AssertionError` with no message, and `assert total == 5, "why"` attaches one ([`assert` is for invariants](lesson:exceptions#assert-is-for-invariants)). pytest rewrites every `assert` while importing your test files so that it can print the values (`assert 4 == 5`). This runner does the next best thing and reports the line that failed. The traceback knows it: `traceback.extract_tb()` turns it into a list of frames, outermost first, and each frame's `.line` is its source line, stripped.

```python run
import traceback

def check_total(total):
    assert total == 5

try:
    check_total(2 + 2)
except AssertionError as exc:
    for frame in traceback.extract_tb(exc.__traceback__):
        print(f"{frame.name}: line {frame.lineno}: {frame.line}")
```

:::quiz output
JavaScript's `console.assert(condition, message)` is a function call. What does this print?

```python
total = 4
assert(total == 5, "total should be 5")
print("still running")
```

- [x] `still running`
- [ ] `AssertionError`
- [ ] `TypeError`

`assert` isn't a function, so the parentheses build a two-item **tuple**, and a non-empty tuple is always truthy: the assert can never fail. Python does notice and prints `SyntaxWarning: assertion is always true, perhaps remove parentheses?`, but only as a warning. Write `assert total == 5, "total should be 5"`.
:::

:::challenge id=runner-step-2 title="Step 2: Run the tests" difficulty=medium
`Result` is a dataclass with `name`, `outcome` (`"passed"`, `"failed"` or `"error"`) and `message`. Write the code that produces them:

- `failure_message(exc)` returns the message an `AssertionError` was raised with. If it has none, it returns the source line that raised it, such as `"assert total == 5"`, found through `traceback.extract_tb()`.
- `Suite.run_case(case)` calls the test function and returns its `Result`: `"passed"` with an empty message, `"failed"` with `failure_message()` for an `AssertionError`, or `"error"` with `"KeyError: 'cake'"` (the exception's class name, a colon, and its message) for any other exception.
- `Suite.run()` runs every case in registration order and returns the list of results. A failure in one test must not stop the others.

```js
const failureMessage = (err) =>
  err.message || err.stack.split("\n")[1].trim();
```

```python starter
import traceback
from collections.abc import Callable
from dataclasses import dataclass
from typing import Literal


@dataclass
class TestCase:
    name: str
    fn: Callable[..., object]


type Outcome = Literal["passed", "failed", "error"]


@dataclass
class Result:
    name: str
    outcome: Outcome
    message: str = ""


def failure_message(exc: AssertionError) -> str:
    """The assert's own message, or else the source line that failed."""
    ...


class Suite:
    def __init__(self):
        self.cases: list[TestCase] = []

    def test(self, name=None):
        """Register a test: @suite.test, @suite.test() or @suite.test("a name")."""
        if callable(name):                  # bare @suite.test: `name` is the function
            return self._register(name.__name__, name)
        return lambda fn: self._register(name or fn.__name__, fn)

    def _register(self, name: str, fn):
        self.cases.append(TestCase(name, fn))
        return fn

    def run_case(self, case: TestCase) -> Result:
        ...

    def run(self) -> list[Result]:
        ...
```

```python solution
import traceback
from collections.abc import Callable
from dataclasses import dataclass
from typing import Literal


@dataclass
class TestCase:
    name: str
    fn: Callable[..., object]


type Outcome = Literal["passed", "failed", "error"]


@dataclass
class Result:
    name: str
    outcome: Outcome
    message: str = ""


def failure_message(exc: AssertionError) -> str:
    """The assert's own message, or else the source line that failed."""
    if message := str(exc):
        return message
    frame = traceback.extract_tb(exc.__traceback__)[-1]
    return frame.line or "assertion failed"


class Suite:
    def __init__(self):
        self.cases: list[TestCase] = []

    def test(self, name=None):
        """Register a test: @suite.test, @suite.test() or @suite.test("a name")."""
        if callable(name):                  # bare @suite.test: `name` is the function
            return self._register(name.__name__, name)
        return lambda fn: self._register(name or fn.__name__, fn)

    def _register(self, name: str, fn):
        self.cases.append(TestCase(name, fn))
        return fn

    def run_case(self, case: TestCase) -> Result:
        try:
            case.fn()
        except AssertionError as exc:
            return Result(case.name, "failed", failure_message(exc))
        except Exception as exc:
            return Result(case.name, "error", f"{type(exc).__name__}: {exc}")
        return Result(case.name, "passed")

    def run(self) -> list[Result]:
        return [self.run_case(case) for case in self.cases]
```

```python tests
@test("a test that returns normally passes")
def _():
    suite = Suite()

    @suite.test
    def test_ok():
        assert sorted([3, 1, 2]) == [1, 2, 3]

    eq(suite.run(), [Result("test_ok", "passed")])

@test("a failing assert is 'failed', and the message is its source line")
def _():
    suite = Suite()

    @suite.test
    def test_total():
        total = 2 + 2
        assert total == 5

    eq(suite.run(), [Result("test_total", "failed", "assert total == 5")])

@test("an assert's own message wins over its source line")
def _():
    suite = Suite()

    @suite.test
    def test_total():
        total = 2 + 2
        assert total == 5, f"expected 5, got {total}"

    eq(suite.run(), [Result("test_total", "failed", "expected 5, got 4")])

@test("any other exception is an 'error', reported with its type")
def _():
    suite = Suite()

    @suite.test
    def test_lookup():
        prices = {"tea": 3}
        assert prices["cake"] == 5

    eq(suite.run(), [Result("test_lookup", "error", "KeyError: 'cake'")])

@test("every test runs, in order, whatever happened before it")
def _():
    suite = Suite()
    ran = []

    @suite.test
    def test_fails():
        ran.append("fails")
        assert False

    @suite.test
    def test_crashes():
        ran.append("crashes")
        1 / 0

    @suite.test
    def test_passes():
        ran.append("passes")

    eq([result.outcome for result in suite.run()], ["failed", "error", "passed"])
    eq(ran, ["fails", "crashes", "passes"])

@test("failure_message() points at the assert that actually failed")
def _():
    def check_positive(n):
        assert n > 0

    try:
        check_positive(-1)
    except AssertionError as exc:
        eq(failure_message(exc), "assert n > 0")
    else:
        check(False, "the helper should have raised")

@test("run_case() runs a single TestCase")
def _():
    eq(Suite().run_case(TestCase("inline", lambda: None)), Result("inline", "passed"))
```

```hint
`str(exc)` is `""` for a bare `assert`, so `if message := str(exc): return message` handles the first case.
```

```hint
`traceback.extract_tb(exc.__traceback__)[-1]` is the innermost frame, where the assert ran. Return its `.line`.
```

```hint
In `run_case()`, return from inside each `except` clause and return the passing `Result` after the `try` statement. `type(exc).__name__` gives you `"KeyError"`.
```
:::

## Step 3: Fixtures by parameter name

:::compare
```js
let cart;
beforeEach(() => {
  cart = new Cart();
});

test("starts empty", () => {
  expect(cart.items).toEqual([]);
});
```
```python
@suite.fixture
def cart():
    return Cart()



@suite.test
def test_starts_empty(cart):
    assert cart.items == []
```
:::

This is pytest's best idea. Instead of a `beforeEach` that assigns to a variable shared by the whole file, a test **names** what it needs as parameters, and the runner supplies them. Each fixture is an ordinary function, registered under its own name.

Reading the names is where `inspect.signature()` comes in, Python's richer answer to JavaScript's `fn.length` ([Functions are objects](lesson:functions#functions-are-objects)). Its `.parameters` is an ordered mapping from each name to a `Parameter`, whose `.default` is `Parameter.empty` when there isn't one:

```python run
import inspect

def test_checkout(cart, user, retries=3):
    ...

for name, param in inspect.signature(test_checkout).parameters.items():
    has_default = param.default is not inspect.Parameter.empty
    print(name, "has a default" if has_default else "needs a fixture")
```

Build a dict of values, then call the test with `case.fn(**kwargs)` ([`*args`, `**kwargs` and spreading](lesson:functions#args-kwargs-and-spreading)). Three details make it pytest-like:

- **Fixtures can ask for fixtures.** A `users(db)` fixture needs `db` first, so resolving is recursive: work out a fixture's own arguments the same way you do a test's.
- **One value per name per test.** If both the test and the `users` fixture ask for `db`, they must get the same object. Cache the values for the current test in a dict, and start with an empty one for every test so nothing leaks between them.
- **A default means "not a fixture".** pytest follows the same rule: a parameter with a default value is never treated as a fixture request.

:::challenge id=runner-step-3 title="Step 3: Fixtures by parameter name" difficulty=medium
Add fixtures to `Suite`:

- `fixture(fn)` registers `fn` in `self.fixtures` under its function name and returns it unchanged.
- `_resolve(fn, values)` returns the keyword arguments to call `fn` with: one entry per parameter that has no default. `values` caches the fixtures already made for the current test. A name missing from it is created by calling its fixture function, with that fixture's own arguments resolved the same way, then stored in `values`. An unknown fixture raises an exception whose message names it.
- `run_case()` calls the test with the resolved arguments, starting from a fresh `{}` for every test. A fixture that raises, or one that doesn't exist, makes the test an `"error"`.

```js
function resolve(fn, values) {
  const kwargs = {};
  for (const name of parameterNames(fn)) {   // no such thing in JS
    if (!(name in values)) values[name] = create(name, values);
    kwargs[name] = values[name];
  }
  return kwargs;
}
```

```python starter
import inspect
import traceback
from collections.abc import Callable
from dataclasses import dataclass
from typing import Literal


@dataclass
class TestCase:
    name: str
    fn: Callable[..., object]


type Outcome = Literal["passed", "failed", "error"]


@dataclass
class Result:
    name: str
    outcome: Outcome
    message: str = ""


def failure_message(exc: AssertionError) -> str:
    """The assert's own message, or else the source line that failed."""
    if message := str(exc):
        return message
    frame = traceback.extract_tb(exc.__traceback__)[-1]
    return frame.line or "assertion failed"


class Suite:
    def __init__(self):
        self.cases: list[TestCase] = []
        self.fixtures: dict[str, Callable[..., object]] = {}

    def test(self, name=None):
        """Register a test: @suite.test, @suite.test() or @suite.test("a name")."""
        if callable(name):                  # bare @suite.test: `name` is the function
            return self._register(name.__name__, name)
        return lambda fn: self._register(name or fn.__name__, fn)

    def _register(self, name: str, fn):
        self.cases.append(TestCase(name, fn))
        return fn

    def fixture(self, fn):
        """Register `fn` as a fixture, injected into tests by parameter name."""
        ...

    def _resolve(self, fn, values: dict) -> dict:
        """Keyword arguments for `fn`, creating any fixtures it asks for.

        `values` caches the fixtures already made for the current test.
        """
        ...

    def run_case(self, case: TestCase) -> Result:
        try:
            case.fn()  # TODO: pass the test its fixtures as keyword arguments
        except AssertionError as exc:
            return Result(case.name, "failed", failure_message(exc))
        except Exception as exc:
            return Result(case.name, "error", f"{type(exc).__name__}: {exc}")
        return Result(case.name, "passed")

    def run(self) -> list[Result]:
        return [self.run_case(case) for case in self.cases]
```

```python solution
import inspect
import traceback
from collections.abc import Callable
from dataclasses import dataclass
from typing import Literal


@dataclass
class TestCase:
    name: str
    fn: Callable[..., object]


type Outcome = Literal["passed", "failed", "error"]


@dataclass
class Result:
    name: str
    outcome: Outcome
    message: str = ""


def failure_message(exc: AssertionError) -> str:
    """The assert's own message, or else the source line that failed."""
    if message := str(exc):
        return message
    frame = traceback.extract_tb(exc.__traceback__)[-1]
    return frame.line or "assertion failed"


class Suite:
    def __init__(self):
        self.cases: list[TestCase] = []
        self.fixtures: dict[str, Callable[..., object]] = {}

    def test(self, name=None):
        """Register a test: @suite.test, @suite.test() or @suite.test("a name")."""
        if callable(name):                  # bare @suite.test: `name` is the function
            return self._register(name.__name__, name)
        return lambda fn: self._register(name or fn.__name__, fn)

    def _register(self, name: str, fn):
        self.cases.append(TestCase(name, fn))
        return fn

    def fixture(self, fn):
        """Register `fn` as a fixture, injected into tests by parameter name."""
        self.fixtures[fn.__name__] = fn
        return fn

    def _resolve(self, fn, values: dict) -> dict:
        """Keyword arguments for `fn`, creating any fixtures it asks for.

        `values` caches the fixtures already made for the current test.
        """
        kwargs = {}
        for name, param in inspect.signature(fn).parameters.items():
            if name not in values:
                if param.default is not param.empty:
                    continue                # an ordinary default, not a fixture
                values[name] = self._create(name, values)
            kwargs[name] = values[name]
        return kwargs

    def _create(self, name: str, values: dict):
        if name not in self.fixtures:
            raise LookupError(f"fixture {name!r} not found")
        factory = self.fixtures[name]
        return factory(**self._resolve(factory, values))

    def run_case(self, case: TestCase) -> Result:
        try:
            case.fn(**self._resolve(case.fn, {}))
        except AssertionError as exc:
            return Result(case.name, "failed", failure_message(exc))
        except Exception as exc:
            return Result(case.name, "error", f"{type(exc).__name__}: {exc}")
        return Result(case.name, "passed")

    def run(self) -> list[Result]:
        return [self.run_case(case) for case in self.cases]
```

```python tests
@test("@suite.fixture registers by function name and returns the function")
def _():
    suite = Suite()

    def numbers():
        return [3, 1, 2]

    check(suite.fixture(numbers) is numbers, "return the fixture function unchanged")
    eq(suite.fixtures, {"numbers": numbers})

@test("a test parameter receives the fixture with the same name")
def _():
    suite = Suite()
    seen = []

    @suite.fixture
    def numbers():
        return [3, 1, 2]

    @suite.test
    def test_sorted(numbers):
        seen.append(numbers)
        assert sorted(numbers) == [1, 2, 3]

    eq(suite.run(), [Result("test_sorted", "passed")])
    eq(seen, [[3, 1, 2]])

@test("every test gets fresh fixture values")
def _():
    suite = Suite()

    @suite.fixture
    def cart():
        return []

    @suite.test
    def test_add(cart):
        cart.append("tea")
        assert cart == ["tea"]

    @suite.test
    def test_starts_empty(cart):
        assert cart == []

    eq([result.outcome for result in suite.run()], ["passed", "passed"])

@test("fixtures can ask for fixtures, and each is made once per test")
def _():
    suite = Suite()
    made = []

    @suite.fixture
    def db():
        made.append("db")
        return {"users": ["ada", "linus"]}

    @suite.fixture
    def users(db):
        return db["users"]

    @suite.test
    def test_shared(users, db):
        assert users is db["users"]

    eq(suite.run(), [Result("test_shared", "passed")])
    eq(made, ["db"], "db should be created once for the test, then shared")

@test("an unknown fixture makes the test an error that names it")
def _():
    suite = Suite()

    @suite.test
    def test_needs_db(db):
        pass

    [result] = suite.run()
    eq(result.outcome, "error")
    check("db" in result.message, f"name the missing fixture, got {result.message!r}")

@test("a fixture that raises makes the test an error")
def _():
    suite = Suite()

    @suite.fixture
    def settings():
        raise FileNotFoundError("settings.toml")

    @suite.test
    def test_settings(settings):
        pass

    eq(suite.run(), [Result("test_settings", "error", "FileNotFoundError: settings.toml")])

@test("parameters with a default aren't fixtures")
def _():
    suite = Suite()

    @suite.test
    def test_retries(retries=3):
        assert retries == 3

    eq(suite.run(), [Result("test_retries", "passed")])

@test("parameter names come from inspect.signature()")
def _():
    requires_call("signature", "read the parameters with inspect.signature(fn).parameters")
```

```hint
Loop over `inspect.signature(fn).parameters.items()`. Skip a parameter whose `param.default is not param.empty`, unless its name is already in `values`.
```

```hint
To create a fixture, look up its function, call `self._resolve(factory, values)` for its own arguments, then call `factory(**those)`. Raise `LookupError(f"fixture {name!r} not found")` for an unknown name.
```
:::

## Step 4: Setup and teardown

:::compare
```js
let conn;
beforeEach(async () => {
  conn = await connect();
});
afterEach(async () => {
  await conn.close();
});
```
```python
@suite.fixture
def conn():
    conn = connect()
    try:
        yield conn
    finally:
        conn.close()
```
:::

pytest's answer to `afterEach` is the **yield fixture**: the code before `yield` is setup, the yielded value goes to the test, and the code after it is teardown. That's exactly the protocol of `@contextmanager` ([`@contextmanager`: a generator does the work](lesson:context-managers#contextmanager-a-generator-does-the-work)). The fixture authors don't decorate anything, so the runner applies it itself: `contextmanager(factory)(**args)` is the same call that decorator syntax would have made, just done at runtime ([`@decorator` is just `f = decorator(f)`](lesson:decorators#decorator-is-just-f-decorator-f)). `inspect.isgeneratorfunction(factory)` tells the two kinds of fixture apart.

A test can use any number of fixtures, so you need a `with` statement whose managers are decided at runtime. That's `ExitStack` ([`ExitStack`: any number of resources](lesson:context-managers#exitstack-any-number-of-resources)). `stack.enter_context(cm)` enters a manager and returns the value it yields, and when the stack's own `with` block ends, everything entered unwinds in reverse order, whether the test passed or raised:

```python run
from contextlib import ExitStack, contextmanager

def resource(name):
    print("open", name)
    try:
        yield name
    finally:
        print("close", name)

try:
    with ExitStack() as stack:
        db = stack.enter_context(contextmanager(resource)("db"))
        cache = stack.enter_context(contextmanager(resource)("cache"))
        print("test uses", db, "and", cache)
        raise AssertionError("the test failed")
except AssertionError as exc:
    print("caught:", exc)
```

Open one stack per test in `run_case()` and pass it down to wherever fixtures are created. If a fixture fails halfway through setup, the ones already entered still get torn down, and an exception during teardown surfaces from the `with` block, where `run_case()` reports it as an error.

:::note pytest is gentler here
When the test raises, `contextmanager` throws that exception into the fixture at its `yield`, so teardown code that isn't in a `finally` block never runs. That's the [rule for every `@contextmanager`](lesson:context-managers#contextmanager-a-generator-does-the-work), and this runner inherits it. pytest instead resumes the generator normally after a failing test, so its teardown code runs either way.
:::

:::challenge id=runner-step-4 title="Step 4: Setup and teardown" difficulty=medium
Support yield fixtures. Change the two places marked `TODO`:

- `run_case()` opens an `ExitStack` around resolving the fixtures and calling the test, and passes it down.
- When a fixture function is a generator function, enter it on the stack as a context manager, and give the test the yielded value. Plain fixtures work as before.

Teardowns run after the test, newest first, whether the test passed or not, and an exception raised during teardown makes the test an `"error"`.

```python starter
import inspect
import traceback
from collections.abc import Callable
from contextlib import ExitStack, contextmanager
from dataclasses import dataclass
from typing import Literal


@dataclass
class TestCase:
    name: str
    fn: Callable[..., object]


type Outcome = Literal["passed", "failed", "error"]


@dataclass
class Result:
    name: str
    outcome: Outcome
    message: str = ""


def failure_message(exc: AssertionError) -> str:
    """The assert's own message, or else the source line that failed."""
    if message := str(exc):
        return message
    frame = traceback.extract_tb(exc.__traceback__)[-1]
    return frame.line or "assertion failed"


class Suite:
    def __init__(self):
        self.cases: list[TestCase] = []
        self.fixtures: dict[str, Callable[..., object]] = {}

    def test(self, name=None):
        """Register a test: @suite.test, @suite.test() or @suite.test("a name")."""
        if callable(name):                  # bare @suite.test: `name` is the function
            return self._register(name.__name__, name)
        return lambda fn: self._register(name or fn.__name__, fn)

    def _register(self, name: str, fn):
        self.cases.append(TestCase(name, fn))
        return fn

    def fixture(self, fn):
        """Register `fn` as a fixture, injected into tests by parameter name."""
        self.fixtures[fn.__name__] = fn
        return fn

    def _resolve(self, fn, values: dict) -> dict:
        """Keyword arguments for `fn`, creating any fixtures it asks for.

        `values` caches the fixtures already made for the current test.
        """
        kwargs = {}
        for name, param in inspect.signature(fn).parameters.items():
            if name not in values:
                if param.default is not param.empty:
                    continue                # an ordinary default, not a fixture
                values[name] = self._create(name, values)
            kwargs[name] = values[name]
        return kwargs

    def _create(self, name: str, values: dict):
        if name not in self.fixtures:
            raise LookupError(f"fixture {name!r} not found")
        factory = self.fixtures[name]
        # TODO: a generator fixture should run up to its `yield` here,
        # hand over the yielded value, and finish after the test is done
        return factory(**self._resolve(factory, values))

    def run_case(self, case: TestCase) -> Result:
        try:
            # TODO: open an ExitStack for this test, and pass it down to _create()
            case.fn(**self._resolve(case.fn, {}))
        except AssertionError as exc:
            return Result(case.name, "failed", failure_message(exc))
        except Exception as exc:
            return Result(case.name, "error", f"{type(exc).__name__}: {exc}")
        return Result(case.name, "passed")

    def run(self) -> list[Result]:
        return [self.run_case(case) for case in self.cases]
```

```python solution
import inspect
import traceback
from collections.abc import Callable
from contextlib import ExitStack, contextmanager
from dataclasses import dataclass
from typing import Literal


@dataclass
class TestCase:
    name: str
    fn: Callable[..., object]


type Outcome = Literal["passed", "failed", "error"]


@dataclass
class Result:
    name: str
    outcome: Outcome
    message: str = ""


def failure_message(exc: AssertionError) -> str:
    """The assert's own message, or else the source line that failed."""
    if message := str(exc):
        return message
    frame = traceback.extract_tb(exc.__traceback__)[-1]
    return frame.line or "assertion failed"


class Suite:
    def __init__(self):
        self.cases: list[TestCase] = []
        self.fixtures: dict[str, Callable[..., object]] = {}

    def test(self, name=None):
        """Register a test: @suite.test, @suite.test() or @suite.test("a name")."""
        if callable(name):                  # bare @suite.test: `name` is the function
            return self._register(name.__name__, name)
        return lambda fn: self._register(name or fn.__name__, fn)

    def _register(self, name: str, fn):
        self.cases.append(TestCase(name, fn))
        return fn

    def fixture(self, fn):
        """Register `fn` as a fixture, injected into tests by parameter name."""
        self.fixtures[fn.__name__] = fn
        return fn

    def _resolve(self, fn, values: dict, stack: ExitStack) -> dict:
        """Keyword arguments for `fn`, creating any fixtures it asks for.

        `values` caches the fixtures already made for the current test.
        """
        kwargs = {}
        for name, param in inspect.signature(fn).parameters.items():
            if name not in values:
                if param.default is not param.empty:
                    continue                # an ordinary default, not a fixture
                values[name] = self._create(name, values, stack)
            kwargs[name] = values[name]
        return kwargs

    def _create(self, name: str, values: dict, stack: ExitStack):
        if name not in self.fixtures:
            raise LookupError(f"fixture {name!r} not found")
        factory = self.fixtures[name]
        args = self._resolve(factory, values, stack)
        if inspect.isgeneratorfunction(factory):    # setup, yield, teardown
            return stack.enter_context(contextmanager(factory)(**args))
        return factory(**args)

    def run_case(self, case: TestCase) -> Result:
        try:
            with ExitStack() as stack:      # unwinds this test's fixtures, newest first
                case.fn(**self._resolve(case.fn, {}, stack))
        except AssertionError as exc:
            return Result(case.name, "failed", failure_message(exc))
        except Exception as exc:
            return Result(case.name, "error", f"{type(exc).__name__}: {exc}")
        return Result(case.name, "passed")

    def run(self) -> list[Result]:
        return [self.run_case(case) for case in self.cases]
```

```python tests
@test("a generator fixture sets up before the test and tears down after it")
def _():
    suite = Suite()
    log = []

    @suite.fixture
    def connection():
        log.append("connect")
        yield "conn-1"
        log.append("disconnect")

    @suite.test
    def test_query(connection):
        log.append(f"query on {connection}")

    eq(suite.run(), [Result("test_query", "passed")])
    eq(log, ["connect", "query on conn-1", "disconnect"])

@test("teardown in a finally block runs even when the test fails")
def _():
    suite = Suite()
    log = []

    @suite.fixture
    def resource():
        try:
            yield 42
        finally:
            log.append("released")

    @suite.test
    def test_wrong(resource):
        assert resource == 0

    [result] = suite.run()
    eq((result.outcome, result.message), ("failed", "assert resource == 0"))
    eq(log, ["released"])

@test("fixtures are torn down in reverse order of setup")
def _():
    suite = Suite()
    log = []

    @suite.fixture
    def db():
        log.append("open db")
        yield "db"
        log.append("close db")

    @suite.fixture
    def session(db):
        log.append("open session")
        yield f"session on {db}"
        log.append("close session")

    @suite.test
    def test_session(session):
        log.append(session)

    suite.run()
    eq(log, ["open db", "open session", "session on db", "close session", "close db"])

@test("each test gets its own setup and teardown")
def _():
    suite = Suite()
    log = []

    @suite.fixture
    def scratch():
        log.append("+")
        yield
        log.append("-")

    @suite.test
    def test_one(scratch):
        pass

    @suite.test
    def test_two(scratch):
        pass

    suite.run()
    eq(log, ["+", "-", "+", "-"])

@test("an exception during teardown makes the test an error")
def _():
    suite = Suite()

    @suite.fixture
    def disk():
        yield
        raise OSError("disk full")

    @suite.test
    def test_write(disk):
        pass

    eq(suite.run(), [Result("test_write", "error", "OSError: disk full")])

@test("when a fixture fails to set up, the ones before it are still torn down")
def _():
    suite = Suite()
    log = []

    @suite.fixture
    def db():
        try:
            yield "db"
        finally:
            log.append("close db")

    @suite.fixture
    def network():
        raise ConnectionError("offline")

    @suite.test
    def test_sync(db, network):
        pass

    eq(suite.run(), [Result("test_sync", "error", "ConnectionError: offline")])
    eq(log, ["close db"])

@test("plain fixtures still work")
def _():
    suite = Suite()

    @suite.fixture
    def answer():
        return 42

    @suite.test
    def test_answer(answer):
        assert answer == 42

    eq(suite.run(), [Result("test_answer", "passed")])
```

```hint
Add a `stack` parameter to `_resolve()` and `_create()`, and pass it along on every call, including the recursive one.
```

```hint
`stack.enter_context(contextmanager(factory)(**args))` runs the fixture up to its `yield` and returns the yielded value. Wrap the body of the `try` in `run_case()` in `with ExitStack() as stack:`.
```
:::

## Step 5: Parametrize

:::compare
```js
test.each([
  [1, 2, 3],
  [2, 2, 4],
])("add(%i, %i) is %i", (a, b, total) => {
  expect(a + b).toBe(total);
});
```
```python
@suite.test
@parametrize("a, b, total", [
    (1, 2, 3),
    (2, 2, 4),
])
def test_add(a, b, total):
    assert a + b == total
```
:::

`@parametrize("a, b, total", rows)` takes arguments, so it's a decorator factory ([Decorators with arguments](lesson:decorators#decorators-with-arguments)). It doesn't wrap the test, though. Functions are objects that can carry attributes, so it just pins the rows to the function, as `fn.params`, and returns the function. pytest's marks work the same way: they're stored in an attribute on the function, named `pytestmark`.

Read the rows when the suite **runs**, not when the test is registered. Then the order of `@suite.test` and `@parametrize` doesn't matter, and the tests that `discover()` finds in step 6 get parametrized too. `expand(case)` turns one registered case into one `TestCase` per row, named like pytest's `test_add[1-2-3]`, with the row in its new `params` field. `run_case()` puts those values in the per-test `values` dict before resolving anything, so a parameter is found before any fixture would be.

Build each row's dict with `zip(keys, row, strict=True)` (3.10+). Plain `zip` stops at the shortest input, so a row with a value missing would quietly lose a parameter. With `strict=True` it raises `ValueError` the moment the decorator runs ([Two arrays at once: `zip()`](lesson:control-flow#two-arrays-at-once-zip)).

:::quiz output
What does this print?

```python
print(list(zip(["a", "b"], [1, 2, 3])))
```

- [x] `[('a', 1), ('b', 2)]`
- [ ] `[('a', 1), ('b', 2), (None, 3)]`
- [ ] `ValueError`

`zip` stops as soon as the shortest input runs out and drops the rest without a word. `zip(..., strict=True)` raises `ValueError` instead, and `itertools.zip_longest` pads with `None`.
:::

:::challenge id=runner-step-5 title="Step 5: Parametrize" difficulty=hard
`TestCase` has a new field, `params`, that holds one row's values. Write the decorator and the expansion, then wire them in where the starter says `TODO`:

- `parametrize(names, rows)` takes comma-separated parameter names and a list of rows, and returns a decorator that stores the rows on the function as a list of dicts, one per row, then returns the function unchanged. With a single name, each row is a bare value, as in pytest: `@parametrize("n", [1, 2])`. A row with the wrong number of values raises `ValueError`.
- `expand(case)` returns `[case]` for an ordinary test. For a parametrized one it returns one `TestCase` per row, named `f"{case.name}[{id}]"`, where the id joins `str()` of each value with `-`.
- `run()` expands every case before running it, and `run_case()` starts from `dict(case.params)` instead of `{}`.

```python starter
import inspect
import traceback
from collections.abc import Callable
from contextlib import ExitStack, contextmanager
from dataclasses import dataclass, field
from typing import Literal


@dataclass
class TestCase:
    name: str
    fn: Callable[..., object]
    params: dict[str, object] = field(default_factory=dict)  # one @parametrize row


type Outcome = Literal["passed", "failed", "error"]


@dataclass
class Result:
    name: str
    outcome: Outcome
    message: str = ""


def failure_message(exc: AssertionError) -> str:
    """The assert's own message, or else the source line that failed."""
    if message := str(exc):
        return message
    frame = traceback.extract_tb(exc.__traceback__)[-1]
    return frame.line or "assertion failed"


def parametrize(names: str, rows):
    """Run a test once per row: @parametrize("a, b", [(1, 2), (3, 4)])."""
    ...


def expand(case: TestCase) -> list[TestCase]:
    """One case per parameter row, named like pytest: test_add[1-2-3]."""
    ...


class Suite:
    def __init__(self):
        self.cases: list[TestCase] = []
        self.fixtures: dict[str, Callable[..., object]] = {}

    def test(self, name=None):
        """Register a test: @suite.test, @suite.test() or @suite.test("a name")."""
        if callable(name):                  # bare @suite.test: `name` is the function
            return self._register(name.__name__, name)
        return lambda fn: self._register(name or fn.__name__, fn)

    def _register(self, name: str, fn):
        self.cases.append(TestCase(name, fn))
        return fn

    def fixture(self, fn):
        """Register `fn` as a fixture, injected into tests by parameter name."""
        self.fixtures[fn.__name__] = fn
        return fn

    def _resolve(self, fn, values: dict, stack: ExitStack) -> dict:
        """Keyword arguments for `fn`, creating any fixtures it asks for.

        `values` caches the fixtures already made for the current test.
        """
        kwargs = {}
        for name, param in inspect.signature(fn).parameters.items():
            if name not in values:
                if param.default is not param.empty:
                    continue                # an ordinary default, not a fixture
                values[name] = self._create(name, values, stack)
            kwargs[name] = values[name]
        return kwargs

    def _create(self, name: str, values: dict, stack: ExitStack):
        if name not in self.fixtures:
            raise LookupError(f"fixture {name!r} not found")
        factory = self.fixtures[name]
        args = self._resolve(factory, values, stack)
        if inspect.isgeneratorfunction(factory):    # setup, yield, teardown
            return stack.enter_context(contextmanager(factory)(**args))
        return factory(**args)

    def run_case(self, case: TestCase) -> Result:
        try:
            with ExitStack() as stack:      # unwinds this test's fixtures, newest first
                # TODO: start from the case's params instead of an empty dict
                case.fn(**self._resolve(case.fn, {}, stack))
        except AssertionError as exc:
            return Result(case.name, "failed", failure_message(exc))
        except Exception as exc:
            return Result(case.name, "error", f"{type(exc).__name__}: {exc}")
        return Result(case.name, "passed")

    def run(self) -> list[Result]:
        # TODO: expand() each case into one case per parameter row
        return [self.run_case(case) for case in self.cases]
```

```python solution
import inspect
import traceback
from collections.abc import Callable
from contextlib import ExitStack, contextmanager
from dataclasses import dataclass, field
from typing import Literal


@dataclass
class TestCase:
    name: str
    fn: Callable[..., object]
    params: dict[str, object] = field(default_factory=dict)  # one @parametrize row


type Outcome = Literal["passed", "failed", "error"]


@dataclass
class Result:
    name: str
    outcome: Outcome
    message: str = ""


def failure_message(exc: AssertionError) -> str:
    """The assert's own message, or else the source line that failed."""
    if message := str(exc):
        return message
    frame = traceback.extract_tb(exc.__traceback__)[-1]
    return frame.line or "assertion failed"


def parametrize(names: str, rows):
    """Run a test once per row: @parametrize("a, b", [(1, 2), (3, 4)])."""
    keys = [key.strip() for key in names.split(",")]
    if len(keys) == 1:                    # @parametrize("n", [1, 2]): bare values
        rows = [(row,) for row in rows]

    def mark(fn):
        fn.params = [dict(zip(keys, row, strict=True)) for row in rows]
        return fn

    return mark


def expand(case: TestCase) -> list[TestCase]:
    """One case per parameter row, named like pytest: test_add[1-2-3]."""
    rows = getattr(case.fn, "params", None)
    if rows is None:
        return [case]
    return [
        TestCase(f"{case.name}[{'-'.join(map(str, row.values()))}]", case.fn, row)
        for row in rows
    ]


class Suite:
    def __init__(self):
        self.cases: list[TestCase] = []
        self.fixtures: dict[str, Callable[..., object]] = {}

    def test(self, name=None):
        """Register a test: @suite.test, @suite.test() or @suite.test("a name")."""
        if callable(name):                  # bare @suite.test: `name` is the function
            return self._register(name.__name__, name)
        return lambda fn: self._register(name or fn.__name__, fn)

    def _register(self, name: str, fn):
        self.cases.append(TestCase(name, fn))
        return fn

    def fixture(self, fn):
        """Register `fn` as a fixture, injected into tests by parameter name."""
        self.fixtures[fn.__name__] = fn
        return fn

    def _resolve(self, fn, values: dict, stack: ExitStack) -> dict:
        """Keyword arguments for `fn`, creating any fixtures it asks for.

        `values` caches the fixtures already made for the current test.
        """
        kwargs = {}
        for name, param in inspect.signature(fn).parameters.items():
            if name not in values:
                if param.default is not param.empty:
                    continue                # an ordinary default, not a fixture
                values[name] = self._create(name, values, stack)
            kwargs[name] = values[name]
        return kwargs

    def _create(self, name: str, values: dict, stack: ExitStack):
        if name not in self.fixtures:
            raise LookupError(f"fixture {name!r} not found")
        factory = self.fixtures[name]
        args = self._resolve(factory, values, stack)
        if inspect.isgeneratorfunction(factory):    # setup, yield, teardown
            return stack.enter_context(contextmanager(factory)(**args))
        return factory(**args)

    def run_case(self, case: TestCase) -> Result:
        try:
            with ExitStack() as stack:      # unwinds this test's fixtures, newest first
                case.fn(**self._resolve(case.fn, dict(case.params), stack))
        except AssertionError as exc:
            return Result(case.name, "failed", failure_message(exc))
        except Exception as exc:
            return Result(case.name, "error", f"{type(exc).__name__}: {exc}")
        return Result(case.name, "passed")

    def run(self) -> list[Result]:
        return [self.run_case(each) for case in self.cases for each in expand(case)]
```

```python tests
@test("one case per row, named like pytest")
def _():
    suite = Suite()

    @suite.test
    @parametrize("a, b, total", [(1, 2, 3), (2, 2, 5)])
    def test_add(a, b, total):
        assert a + b == total

    eq(suite.run(), [
        Result("test_add[1-2-3]", "passed"),
        Result("test_add[2-2-5]", "failed", "assert a + b == total"),
    ])

@test("parametrize() returns the function itself, so it can still be called")
def _():
    def test_square(n, expected):
        return n * n == expected

    marked = parametrize("n, expected", [(3, 9)])(test_square)
    check(marked is test_square, "return the same function, with the rows attached")
    eq(marked(3, 9), True)

@test("ids come from str() of each value")
def _():
    suite = Suite()

    @suite.test
    @parametrize("word, length", [("tea", 3), ("", 0)])
    def test_len(word, length):
        assert len(word) == length

    eq([result.name for result in suite.run()], ["test_len[tea-3]", "test_len[-0]"])

@test("a custom test name becomes the prefix")
def _():
    suite = Suite()

    @suite.test("positive numbers")
    @parametrize("n", [1, 2])
    def _(n):
        assert n > 0

    eq([result.name for result in suite.run()], ["positive numbers[1]", "positive numbers[2]"])

@test("parameters and fixtures mix")
def _():
    suite = Suite()

    @suite.fixture
    def prices():
        return {"tea": 300, "cake": 450}

    @suite.test
    @parametrize("item, cents", [("tea", 300), ("cake", 450)])
    def test_price(prices, item, cents):
        assert prices[item] == cents

    eq([result.outcome for result in suite.run()], ["passed", "passed"])

@test("decorator order doesn't matter, because rows are read when the suite runs")
def _():
    suite = Suite()

    @parametrize("n", [1, 2])
    @suite.test
    def test_n(n):
        assert n in (1, 2)

    eq(suite.run(), [Result("test_n[1]", "passed"), Result("test_n[2]", "passed")])

@test("names may be separated by commas without spaces")
def _():
    suite = Suite()

    @suite.test
    @parametrize("x,y", [(1, 1)])
    def test_same(x, y):
        assert x == y

    eq(suite.run(), [Result("test_same[1-1]", "passed")])

@test("a row of the wrong length is refused at decoration time")
def _():
    def decorate():
        @parametrize("a, b", [(1, 2), (3,)])
        def test_pair(a, b):
            pass

    raises(ValueError, decorate)

@test("expand() leaves an ordinary case alone")
def _():
    case = TestCase("test_plain", lambda: None)
    eq(expand(case), [case])
```

```hint
Split the names with `[key.strip() for key in names.split(",")]`. With one key, wrap each value in a one-item tuple first: `[(row,) for row in rows]`.
```

```hint
Inside the decorator, `fn.params = [dict(zip(keys, row, strict=True)) for row in rows]`. In `expand()`, `getattr(case.fn, "params", None)` is `None` for an ordinary test.
```

```hint
A comprehension with two `for` clauses expands and runs in one go: `[self.run_case(each) for case in self.cases for each in expand(case)]`.
```
:::

## Step 6: Discovery and the report

A module's global namespace is a dict, in definition order: `globals()` from inside the module, or `vars(module)` from outside it. So finding tests by name, as pytest does with `test_*` functions, is a loop over its items:

```python run
import inspect

def test_one():
    pass

def helper():
    pass

def test_two():
    pass

print([name for name, obj in globals().items() if name.startswith("test_") and inspect.isfunction(obj)])
```

Filter with `inspect.isfunction()`, so that a list called `test_data` isn't mistaken for a test, and skip functions that are already registered, so a decorated test isn't collected twice. Since `TestCase` keeps the original function, a set of `case.fn` values answers "is it registered?" in one lookup.

The report is the pytest summary you know. One mark per test (`.` passed, `F` failed, `E` error), then a line for each problem, then the counts. `collections.Counter` counts the outcomes in one call ([Counter](lesson:dicts#counter-counting-in-one-line)). `main()` returns an exit code instead of exiting, so a script decides what to do with it:

:::compare
```js
const results = run(tests);
console.log(report(results));
process.exitCode = results.every((r) => r.outcome === "passed") ? 0 : 1;
```
```python
if __name__ == "__main__":
    suite.discover(globals())
    sys.exit(suite.main())
```
:::

pytest uses the same convention: 0 when every test passed, 1 when any failed. It has a few more codes too, such as 5 when it collected no tests at all.

:::challenge id=runner-step-6 title="Step 6: Discovery and the report" difficulty=medium
Finish the runner:

- `Suite.discover(namespace)` registers every function in the `namespace` dict whose name starts with `test_`, in the dict's order, under that name. Skip values that aren't functions, and functions that are already registered.
- `report(results)` builds the text report. Its first line has one mark per result: `.` for passed, `F` for failed, `E` for error. Then comes one line per failure or error, as `FAILED <name> - <message>` or `ERROR <name> - <message>`. The last line holds the counts, in the order failed, passed, errors, leaving out the zeros: `1 failed, 3 passed, 1 error`, or `2 errors` for more than one. With no results at all, the whole report is `no tests ran`.
- `Suite.main()` runs everything, prints the report, and returns `0` if every test passed, otherwise `1`.

The last test builds a suite with every feature from the previous steps and checks the printed report.

```text
.F..E
FAILED a receipt adds up - assert sum(receipt) == 700
ERROR test_missing_item - KeyError: 'scone'
1 failed, 3 passed, 1 error
```

```python starter
import inspect
import traceback
from collections import Counter
from collections.abc import Callable
from contextlib import ExitStack, contextmanager
from dataclasses import dataclass, field
from typing import Literal


@dataclass
class TestCase:
    name: str
    fn: Callable[..., object]
    params: dict[str, object] = field(default_factory=dict)  # one @parametrize row


type Outcome = Literal["passed", "failed", "error"]


@dataclass
class Result:
    name: str
    outcome: Outcome
    message: str = ""


def failure_message(exc: AssertionError) -> str:
    """The assert's own message, or else the source line that failed."""
    if message := str(exc):
        return message
    frame = traceback.extract_tb(exc.__traceback__)[-1]
    return frame.line or "assertion failed"


def parametrize(names: str, rows):
    """Run a test once per row: @parametrize("a, b", [(1, 2), (3, 4)])."""
    keys = [key.strip() for key in names.split(",")]
    if len(keys) == 1:                    # @parametrize("n", [1, 2]): bare values
        rows = [(row,) for row in rows]

    def mark(fn):
        fn.params = [dict(zip(keys, row, strict=True)) for row in rows]
        return fn

    return mark


def expand(case: TestCase) -> list[TestCase]:
    """One case per parameter row, named like pytest: test_add[1-2-3]."""
    rows = getattr(case.fn, "params", None)
    if rows is None:
        return [case]
    return [
        TestCase(f"{case.name}[{'-'.join(map(str, row.values()))}]", case.fn, row)
        for row in rows
    ]


class Suite:
    def __init__(self):
        self.cases: list[TestCase] = []
        self.fixtures: dict[str, Callable[..., object]] = {}

    def test(self, name=None):
        """Register a test: @suite.test, @suite.test() or @suite.test("a name")."""
        if callable(name):                  # bare @suite.test: `name` is the function
            return self._register(name.__name__, name)
        return lambda fn: self._register(name or fn.__name__, fn)

    def _register(self, name: str, fn):
        self.cases.append(TestCase(name, fn))
        return fn

    def fixture(self, fn):
        """Register `fn` as a fixture, injected into tests by parameter name."""
        self.fixtures[fn.__name__] = fn
        return fn

    def _resolve(self, fn, values: dict, stack: ExitStack) -> dict:
        """Keyword arguments for `fn`, creating any fixtures it asks for.

        `values` caches the fixtures already made for the current test.
        """
        kwargs = {}
        for name, param in inspect.signature(fn).parameters.items():
            if name not in values:
                if param.default is not param.empty:
                    continue                # an ordinary default, not a fixture
                values[name] = self._create(name, values, stack)
            kwargs[name] = values[name]
        return kwargs

    def _create(self, name: str, values: dict, stack: ExitStack):
        if name not in self.fixtures:
            raise LookupError(f"fixture {name!r} not found")
        factory = self.fixtures[name]
        args = self._resolve(factory, values, stack)
        if inspect.isgeneratorfunction(factory):    # setup, yield, teardown
            return stack.enter_context(contextmanager(factory)(**args))
        return factory(**args)

    def run_case(self, case: TestCase) -> Result:
        try:
            with ExitStack() as stack:      # unwinds this test's fixtures, newest first
                case.fn(**self._resolve(case.fn, dict(case.params), stack))
        except AssertionError as exc:
            return Result(case.name, "failed", failure_message(exc))
        except Exception as exc:
            return Result(case.name, "error", f"{type(exc).__name__}: {exc}")
        return Result(case.name, "passed")

    def run(self) -> list[Result]:
        return [self.run_case(each) for case in self.cases for each in expand(case)]

    def discover(self, namespace: dict) -> None:
        """Register every test_* function in `namespace` that isn't registered yet."""
        ...

    def main(self) -> int:
        """Run everything, print the report, and return a process exit code."""
        ...


MARKS = {"passed": ".", "failed": "F", "error": "E"}


def report(results: list[Result]) -> str:
    """A pytest-style report: one mark per test, the problems, then the counts."""
    ...
```

```python solution
import inspect
import traceback
from collections import Counter
from collections.abc import Callable
from contextlib import ExitStack, contextmanager
from dataclasses import dataclass, field
from typing import Literal


@dataclass
class TestCase:
    name: str
    fn: Callable[..., object]
    params: dict[str, object] = field(default_factory=dict)  # one @parametrize row


type Outcome = Literal["passed", "failed", "error"]


@dataclass
class Result:
    name: str
    outcome: Outcome
    message: str = ""


def failure_message(exc: AssertionError) -> str:
    """The assert's own message, or else the source line that failed."""
    if message := str(exc):
        return message
    frame = traceback.extract_tb(exc.__traceback__)[-1]
    return frame.line or "assertion failed"


def parametrize(names: str, rows):
    """Run a test once per row: @parametrize("a, b", [(1, 2), (3, 4)])."""
    keys = [key.strip() for key in names.split(",")]
    if len(keys) == 1:                    # @parametrize("n", [1, 2]): bare values
        rows = [(row,) for row in rows]

    def mark(fn):
        fn.params = [dict(zip(keys, row, strict=True)) for row in rows]
        return fn

    return mark


def expand(case: TestCase) -> list[TestCase]:
    """One case per parameter row, named like pytest: test_add[1-2-3]."""
    rows = getattr(case.fn, "params", None)
    if rows is None:
        return [case]
    return [
        TestCase(f"{case.name}[{'-'.join(map(str, row.values()))}]", case.fn, row)
        for row in rows
    ]


class Suite:
    def __init__(self):
        self.cases: list[TestCase] = []
        self.fixtures: dict[str, Callable[..., object]] = {}

    def test(self, name=None):
        """Register a test: @suite.test, @suite.test() or @suite.test("a name")."""
        if callable(name):                  # bare @suite.test: `name` is the function
            return self._register(name.__name__, name)
        return lambda fn: self._register(name or fn.__name__, fn)

    def _register(self, name: str, fn):
        self.cases.append(TestCase(name, fn))
        return fn

    def fixture(self, fn):
        """Register `fn` as a fixture, injected into tests by parameter name."""
        self.fixtures[fn.__name__] = fn
        return fn

    def _resolve(self, fn, values: dict, stack: ExitStack) -> dict:
        """Keyword arguments for `fn`, creating any fixtures it asks for.

        `values` caches the fixtures already made for the current test.
        """
        kwargs = {}
        for name, param in inspect.signature(fn).parameters.items():
            if name not in values:
                if param.default is not param.empty:
                    continue                # an ordinary default, not a fixture
                values[name] = self._create(name, values, stack)
            kwargs[name] = values[name]
        return kwargs

    def _create(self, name: str, values: dict, stack: ExitStack):
        if name not in self.fixtures:
            raise LookupError(f"fixture {name!r} not found")
        factory = self.fixtures[name]
        args = self._resolve(factory, values, stack)
        if inspect.isgeneratorfunction(factory):    # setup, yield, teardown
            return stack.enter_context(contextmanager(factory)(**args))
        return factory(**args)

    def run_case(self, case: TestCase) -> Result:
        try:
            with ExitStack() as stack:      # unwinds this test's fixtures, newest first
                case.fn(**self._resolve(case.fn, dict(case.params), stack))
        except AssertionError as exc:
            return Result(case.name, "failed", failure_message(exc))
        except Exception as exc:
            return Result(case.name, "error", f"{type(exc).__name__}: {exc}")
        return Result(case.name, "passed")

    def run(self) -> list[Result]:
        return [self.run_case(each) for case in self.cases for each in expand(case)]

    def discover(self, namespace: dict) -> None:
        """Register every test_* function in `namespace` that isn't registered yet."""
        known = {case.fn for case in self.cases}
        for name, obj in namespace.items():
            if name.startswith("test_") and inspect.isfunction(obj) and obj not in known:
                self._register(name, obj)

    def main(self) -> int:
        """Run everything, print the report, and return a process exit code."""
        results = self.run()
        print(report(results))
        return 0 if all(result.outcome == "passed" for result in results) else 1


MARKS = {"passed": ".", "failed": "F", "error": "E"}


def report(results: list[Result]) -> str:
    """A pytest-style report: one mark per test, the problems, then the counts."""
    if not results:
        return "no tests ran"
    lines = ["".join(MARKS[result.outcome] for result in results)]
    for result in results:
        if result.outcome != "passed":
            lines.append(f"{result.outcome.upper()} {result.name} - {result.message}")
    counts = Counter(result.outcome for result in results)
    summary = [f"{counts[outcome]} {outcome}" for outcome in ("failed", "passed") if counts[outcome]]
    if errors := counts["error"]:
        summary.append(f"{errors} error{'s' if errors > 1 else ''}")
    lines.append(", ".join(summary))
    return "\n".join(lines)
```

```python tests
RESULTS = [
    Result("test_a", "passed"),
    Result("test_b", "failed", "assert 1 == 2"),
    Result("test_c", "passed"),
    Result("test_d", "error", "KeyError: 'x'"),
]


@test("report() shows one mark per test, then the problems, then the counts")
def _():
    eq(report(RESULTS), "\n".join([
        ".F.E",
        "FAILED test_b - assert 1 == 2",
        "ERROR test_d - KeyError: 'x'",
        "1 failed, 2 passed, 1 error",
    ]))

@test("the counts skip zeros and pluralise errors")
def _():
    eq(report([Result("test_a", "passed")] * 3), "...\n3 passed")
    eq(report([Result("test_e", "error", "OSError: gone")] * 2).splitlines()[-1], "2 errors")

@test("an empty run says so")
def _():
    eq(report([]), "no tests ran")

@test("discover() registers test_ functions from a namespace, in order")
def _():
    def test_one():
        pass

    def helper():
        pass

    def test_two():
        pass

    suite = Suite()
    suite.discover({"test_one": test_one, "helper": helper, "test_two": test_two, "test_data": [1, 2]})
    eq([case.name for case in suite.cases], ["test_one", "test_two"])

@test("discover() skips functions that are already registered")
def _():
    suite = Suite()

    @suite.test("a custom name")
    def test_decorated():
        pass

    def test_plain():
        pass

    suite.discover({"test_decorated": test_decorated, "test_plain": test_plain})
    eq([case.name for case in suite.cases], ["a custom name", "test_plain"])

@test("discovered tests get fixtures and parameters too")
def _():
    suite = Suite()

    @suite.fixture
    def base():
        return 10

    @parametrize("n", [1, 2])
    def test_add(base, n):
        assert base + n > 10

    suite.discover({"test_add": test_add})
    eq(suite.run(), [Result("test_add[1]", "passed"), Result("test_add[2]", "passed")])

@test("main() prints the report and returns 0 when everything passes")
def _():
    suite = Suite()

    @suite.test
    def test_ok():
        pass

    codes = []
    eq(output_of(lambda: codes.append(suite.main())), ".\n1 passed\n")
    eq(codes, [0])

@test("main() returns 1 when anything fails or errors")
def _():
    suite = Suite()

    @suite.test
    def test_bad():
        assert False

    codes = []
    output_of(lambda: codes.append(suite.main()))
    eq(codes, [1])

@test("everything together: fixtures, teardown, parametrize, discovery and the report")
def _():
    suite = Suite()
    log = []

    @suite.fixture
    def prices():
        return {"tea": 300, "cake": 450}

    @suite.fixture
    def receipt():
        lines = []
        try:
            yield lines
        finally:
            log.append(f"receipt closed with {len(lines)} lines")

    @suite.test
    def test_lookup(prices):
        assert prices["tea"] == 300

    @suite.test("a receipt adds up")
    def _(prices, receipt):
        receipt.extend([prices["tea"], prices["cake"]])
        assert sum(receipt) == 700

    @suite.test
    @parametrize("word, length", [("tea", 3), ("", 0)])
    def test_len(word, length):
        assert len(word) == length

    def test_missing_item(prices):
        assert prices["scone"] > 0

    suite.discover({"test_lookup": test_lookup, "test_missing_item": test_missing_item})
    codes = []
    out = output_of(lambda: codes.append(suite.main()))
    eq(out, "\n".join([
        ".F..E",
        "FAILED a receipt adds up - assert sum(receipt) == 700",
        "ERROR test_missing_item - KeyError: 'scone'",
        "1 failed, 3 passed, 1 error",
    ]) + "\n")
    eq(codes, [1])
    eq(log, ["receipt closed with 2 lines"])
```

```hint
`MARKS[result.outcome]` gives each result's mark, so `"".join(...)` over the results builds the first line.
```

```hint
`counts = Counter(result.outcome for result in results)` returns `0` for a missing key, so `if counts["failed"]` skips the zeros.
```

```hint
In `discover()`, collect `known = {case.fn for case in self.cases}` before the loop, then check `name.startswith("test_") and inspect.isfunction(obj) and obj not in known`.
```
:::

## Where to take it next

- **Capture output.** Run each test under `contextlib.redirect_stdout()` and show what it printed only when it fails, as pytest does.
- **Show the values.** Parse the failing line with `ast`, evaluate both sides of the comparison in the failing frame, and print `assert 4 == 5`. [Introspection & the ast Module](lesson:introspection-and-ast) has the tools.
- **Fixture scopes.** Give `fixture()` a `scope="suite"` option that creates a value once per run, on an `ExitStack` that lives as long as `run()`.
- **Async tests.** Detect `async def` tests with `inspect.iscoroutinefunction()` and run them with `asyncio.run()` ([Async/Await & asyncio](lesson:async)).
