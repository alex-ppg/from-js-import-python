---
title: "Exam: Robust Code"
part: Core Course Exams
summary: Quizzes and integrative challenges on exceptions, context managers, files, imports and tooling.
minutes: 55
---

This exam covers the Robust Code part of the core course: [Errors & Exceptions](lesson:exceptions), [Context Managers & `with`](lesson:context-managers) and [Modules, Packages & Tooling](lesson:modules-and-tooling). Every quiz runs real code, so commit to an answer before you reveal it: the ones you miss show which sections deserve a second read, and each section ends with a pointer to them. The final challenges combine the three lessons the way real code does: files read with the right error handling, a context manager that annotates failures, all-or-nothing transactions, and a plugin loader that reports every broken import at once.

## Handling exceptions

`try` has two more clauses than in JavaScript, and the hierarchy decides what a handler catches.

:::quiz output
What does this print?

```python
def load():
    try:
        print("try", end=" ")
        return "value"
    except ValueError:
        print("except", end=" ")
    else:
        print("else", end=" ")
    finally:
        print("finally", end=" ")

print(load())
```

- [ ] `try else finally value`
- [x] `try finally value`
- [ ] `try value finally`
- [ ] `try else value`

`else` runs only when the `try` block **finishes** without an exception, and a `return` leaves the block early, so `else` is skipped. `finally` runs on the way out, before the caller receives the value, which is why `finally` prints before `value`. Keep the `try` body to the call that can fail, and put the follow-up work in `else`.
:::

:::quiz output
What does this print?

```python
import sys

def main():
    try:
        sys.exit(2)
    except Exception:
        return "caught"
    return "finished"

try:
    print(main())
except BaseException as err:
    print(type(err).__name__)
```

- [ ] `caught`
- [ ] `finished`
- [x] `SystemExit`
- [ ] `2`

`sys.exit(2)` raises `SystemExit`, which inherits from `BaseException`, not `Exception`, so the catch-all `except Exception:` lets it through. That's deliberate: a broad handler shouldn't be able to stop a program from exiting, and `KeyboardInterrupt` gets the same treatment. A bare `except:` would have swallowed it, which is how scripts become impossible to stop.
:::

:::quiz output
What does this print?

```python
try:
    int("forty-two")
except ValueError as err:
    print(err.args[0] == str(err), hasattr(err, "message"))
```

- [ ] `True True`
- [x] `True False`
- [ ] `False False`
- [ ] `AttributeError`

There's no `.message`. The constructor's arguments live in `err.args`, and `str(err)` is the message, built from them: with a single argument, the two are the same string. And for the class name, JavaScript's `err.name`, use `type(err).__name__`.
:::

Review: [Errors & Exceptions](lesson:exceptions), especially [`try`, `except`, `else`, `finally`](lesson:exceptions#try-except-else-finally), [catching by type](lesson:exceptions#catch-what-you-can-handle) and [the missing `.message`](lesson:exceptions#raising-exceptions).

## Raising, chaining and `assert`

Python is strict about what you raise, and it remembers what you were handling when you raised it.

:::quiz output
What does this print?

```python
try:
    raise "payment failed"
except Exception as err:
    print(type(err).__name__)
```

- [ ] `payment failed`
- [ ] `str`
- [x] `TypeError`
- [ ] `Exception`

`throw "oops"` is legal JavaScript, but Python can only raise exceptions. `raise "payment failed"` fails with `TypeError: exceptions must derive from BaseException`, and that `TypeError` is what the handler catches. Raise an instance of a real exception class: `raise PaymentError("payment failed")`.
:::

:::quiz output
What does this print?

```python
try:
    try:
        1 / 0
    except ZeroDivisionError:
        raise ValueError("bad ratio")
except ValueError as err:
    print(err.__cause__, type(err.__context__).__name__)
```

- [x] `None ZeroDivisionError`
- [ ] `ZeroDivisionError ZeroDivisionError`
- [ ] `None NoneType`
- [ ] `ZeroDivisionError NoneType`

Raising inside an `except` block chains **implicitly**: Python stores the exception being handled on `__context__`, and the traceback says "During handling of the above exception, another exception occurred". `__cause__` is set only by an explicit `raise ... from err`, the counterpart of `new Error(msg, { cause })`. Say which one you mean: `from err` for a deliberate translation, `from None` to hide the original.
:::

:::quiz output
What does this print?

```python
def withdraw(balance, amount):
    assert(amount <= balance, "insufficient funds")
    return balance - amount

print(withdraw(10, 50))
```

- [x] `-40`
- [ ] `AssertionError`
- [ ] `SyntaxError`
- [ ] `ValueError`

`assert` is a statement, not a function, so the parentheses make a two-item tuple, and a non-empty tuple is always truthy. The check can never fail; Python only prints `SyntaxWarning: assertion is always true, perhaps remove parentheses?`. And even the correct `assert amount <= balance, "insufficient funds"` is the wrong tool for checking input, because `python -O` strips every `assert`. Raise a `ValueError` instead.
:::

Review: [Errors & Exceptions](lesson:exceptions), especially [raising](lesson:exceptions#raising-exceptions), [re-raising and chaining](lesson:exceptions#re-raising-and-chaining) and [`assert`](lesson:exceptions#assert-is-for-invariants).

## Exception groups

`ExceptionGroup` (3.11+) is `AggregateError` with its own syntax for taking it apart.

:::quiz output
What does this print?

```python
try:
    try:
        raise ExceptionGroup("batch failed", [ValueError("bad sku"), KeyError("qty")])
    except ValueError:
        print("caught ValueError")
except ExceptionGroup as group:
    print(len(group.exceptions))
```

- [ ] `caught ValueError`
- [x] `2`
- [ ] `1`
- [ ] `ValueError`

An `ExceptionGroup` isn't a `ValueError`, even when it holds one, so `except ValueError:` doesn't match. The whole group propagates to the outer handler with both of its exceptions. To pick matching exceptions out of a group, use `except*`.
:::

:::quiz output
What does this print?

```python
def run():
    try:
        raise ExceptionGroup("import failed", [ValueError("row 2"), TypeError("row 5"), ValueError("row 9")])
    except* ValueError as group:
        print(len(group.exceptions), end=" ")

try:
    run()
except ExceptionGroup as leftover:
    print([type(e).__name__ for e in leftover.exceptions])
```

- [x] `2 ['TypeError']`
- [ ] `1 ['TypeError', 'ValueError']`
- [ ] `2`
- [ ] `TypeError`

`except*` runs its clause once, with a sub-group holding **every** matching exception, so it sees both `ValueError`s together. Whatever no clause matched is re-raised as a smaller `ExceptionGroup`, not as a bare exception, which is why the outer `except ExceptionGroup` receives the lone `TypeError` still wrapped in a group.
:::

Review: [Errors & Exceptions](lesson:exceptions), especially [exception groups and `except*`](lesson:exceptions#exception-groups-and-notes).

## Context managers

`with` guarantees that `__exit__` runs, and `__exit__` decides what happens to the exception.

:::quiz output
What happens?

```python
class Tracked:
    def __init__(self):
        self.log = []

    def __enter__(self):
        return self

    def __exit__(self, exc_type, exc, tb):
        self.log.append("closed")
        return self.log

with Tracked() as t:
    raise KeyError("sku")
print(t.log)
```

- [ ] `KeyError`
- [x] `['closed']`
- [ ] `[]`
- [ ] `None`

`__exit__` returns `self.log`, which is a non-empty list by then, and any truthy return value tells Python the exception was handled. The `KeyError` vanishes and execution carries on after the `with`. Return `None`, by falling off the end, unless swallowing the exception is the whole point, as it is for `contextlib.suppress`.
:::

:::quiz output
What does this print?

```python
from contextlib import contextmanager

@contextmanager
def locked(state):
    state["locked"] = True
    yield
    state["locked"] = False

state = {}
try:
    with locked(state):
        raise RuntimeError("deploy failed")
except RuntimeError:
    pass
print(state)
```

- [ ] `{'locked': False}`
- [x] `{'locked': True}`
- [ ] `{}`
- [ ] `RuntimeError`

When the block raises, the exception is thrown into the generator **at the `yield`**, so the line after it never runs and the state stays locked forever. Wrap the `yield` in `try`/`finally` so the cleanup runs whether or not the block fails.
:::

:::quiz output
What does this print?

```python
class Step:
    def __init__(self, name):
        self.name = name

    def __enter__(self):
        print(f"+{self.name}", end=" ")

    def __exit__(self, exc_type, exc, tb):
        print(f"-{self.name}:{exc_type.__name__}", end=" ")

try:
    with Step("db"), Step("cache"):
        raise TimeoutError
except TimeoutError:
    print("handled")
```

- [x] `+db +cache -cache:TimeoutError -db:TimeoutError handled`
- [ ] `+db +cache -db:TimeoutError -cache:TimeoutError handled`
- [ ] `+db +cache -cache:TimeoutError handled`
- [ ] `+db +cache handled`

Managers exit in reverse order, like a stack of `using` declarations, and **each** `__exit__` sees the exception on its way out. Both return `None`, so neither suppresses it, and the `TimeoutError` reaches the outer `except`.
:::

:::quiz output
What does this print?

```python
from contextlib import suppress

cache = {"a": 1}
with suppress(KeyError):
    del cache["missing"]
    cache["b"] = 2
print(cache)
```

- [x] `{'a': 1}`
- [ ] `{'a': 1, 'b': 2}`
- [ ] `KeyError`
- [ ] `{}`

`suppress(KeyError)` is a context manager whose `__exit__` swallows the error, and an exception always ends the block at the line that raised it, so `cache["b"] = 2` never runs. It's a `try`/`except KeyError: pass` around the **whole** block, not "skip the line that fails". Put only the operation that may fail inside it.
:::

Review: [Context Managers & `with`](lesson:context-managers), especially [manager classes](lesson:context-managers#writing-a-context-manager-class), [`@contextmanager`](lesson:context-managers#contextmanager-a-generator-does-the-work), [several managers](lesson:context-managers#several-managers-in-one-with) and [`suppress`](lesson:context-managers#the-contextlib-toolbox).

## Files and connections

Two managers that don't do quite what their names suggest.

:::quiz output
What does this print?

```python
from pathlib import Path

Path("notes.txt").write_text("keep me\n", encoding="utf-8")
with open("notes.txt", "w", encoding="utf-8") as f:
    pass
print(repr(Path("notes.txt").read_text(encoding="utf-8")))
```

- [ ] `'keep me\n'`
- [x] `''`
- [ ] `FileExistsError`
- [ ] `None`

Mode `"w"` truncates the file inside `open()` itself, before your first write, so a block that writes nothing still leaves an empty file. Use `"a"` to append, or `"x"` to refuse to touch a file that already exists.
:::

:::quiz output
What does this print?

```python
import sqlite3

with sqlite3.connect(":memory:") as conn:
    conn.execute("CREATE TABLE orders (id INTEGER)")
print(conn.execute("SELECT count(*) FROM orders").fetchone())
```

- [x] `(0,)`
- [ ] `ProgrammingError`
- [ ] `None`
- [ ] `(1,)`

A connection's context manager scopes a **transaction**: it commits when the block succeeds and rolls back when it raises, but it leaves the connection open. The query after the block works fine. To close the connection as well, wrap it in `contextlib.closing(...)`.
:::

Review: [Context Managers & `with`](lesson:context-managers), especially [file modes](lesson:context-managers#reading-and-writing-files) and [the managers you already use](lesson:context-managers#context-managers-you-already-use).

## Modules and tooling

Imports are statements that run, bind names and consult a cache. Each snippet below writes its modules to the sandbox filesystem first.

:::quiz output
What does this print?

```python
import importlib
import sys
from pathlib import Path

Path("flags.py").write_text("enabled = False\n\ndef enable():\n    global enabled\n    enabled = True\n", encoding="utf-8")
importlib.invalidate_caches()
sys.modules.pop("flags", None)

import flags
from flags import enabled
flags.enable()
print(enabled, flags.enabled)
```

- [x] `False True`
- [ ] `True True`
- [ ] `False False`
- [ ] `True False`

`from flags import enabled` binds your own name to the object the module's global referred to at import time. `enable()` rebinds the module's global, and your copy doesn't follow. ES module imports are live bindings; Python's aren't. Read `flags.enabled` for state that changes.
:::

:::quiz output
What does this print?

```python
import importlib
import sys
from pathlib import Path

Path("textutils.py").write_text("def clean(s):\n    return s.strip()\n\ndef title(s):\n    return s.strip().title()\n", encoding="utf-8")
importlib.invalidate_caches()
sys.modules.pop("textutils", None)

def title(s):
    return s.upper()

from textutils import *
print(title(" ada lovelace "))
```

- [ ] `ADA LOVELACE`
- [x] `Ada Lovelace`
- [ ] `NameError`
- [ ] `ImportError`

An import is a statement that runs where it's written, and `from textutils import *` binds every public name of the module into your namespace, silently replacing your own `title`. The last binding wins. That's why PEP 8 discourages star imports: nothing in your file shows what they overwrote.
:::

:::quiz output
What does this print?

```python
import importlib
import sys
from pathlib import Path

Path("report.py").write_text('print(__name__, end=" ")\nif __name__ == "__main__":\n    print("running", end=" ")\n', encoding="utf-8")
importlib.invalidate_caches()
sys.modules.pop("report", None)

import report
print(__name__)
```

- [ ] `__main__ running __main__`
- [x] `report __main__`
- [ ] `report running __main__`
- [ ] `__main__ __main__`

A module's `__name__` is its import name, so the imported `report.py` sees `"report"` and its guard skips the `running` line. Only the module Python was asked to run is called `"__main__"`, and here that's the snippet itself.
:::

:::quiz output
What happens?

```python
import importlib
import sys
from pathlib import Path

Path("invoices.py").write_text("import clients\n\nclass Invoice:\n    def billed_to(self):\n        return clients.Client.__name__\n", encoding="utf-8")
Path("clients.py").write_text("import invoices\n\nclass Client:\n    pass\n", encoding="utf-8")
importlib.invalidate_caches()
for name in ("invoices", "clients"):
    sys.modules.pop(name, None)

import invoices
print(invoices.Invoice().billed_to())
```

- [ ] `ImportError`
- [x] `Client`
- [ ] `AttributeError`
- [ ] `RecursionError`

The cycle is still there: `invoices.py` imports `clients`, which imports `invoices` and gets the **partially initialized** module back from `sys.modules`. It survives because each file binds only the module object, and nobody reads an attribute until `billed_to()` runs, when both modules have finished. With `from clients import Client` and `from invoices import Invoice`, the same cycle raises `ImportError` while importing.
:::

:::quiz
Your app depends on two libraries: one requires `pydantic<2` and the other `pydantic>=2`. What happens when you add the second one with `uv add`?

- [ ] uv installs both versions, nested like `node_modules`
- [ ] uv installs the newer version, and the older library imports it anyway
- [x] Dependency resolution fails: an environment holds one version of each package
- [ ] Each library gets its own copy of pydantic when it imports it

A Python environment is flat: `import pydantic` maps to a single entry in `sys.modules` and a single directory in `site-packages`, so there's nowhere to put a second copy. The resolver reports the conflict, and you have to find versions of the two libraries that agree. That's why libraries declare loose lower bounds and only applications pin exact versions, in the lockfile.
:::

Review: [Modules, Packages & Tooling](lesson:modules-and-tooling), especially [import styles](lesson:modules-and-tooling#import-styles), [`__name__`](lesson:modules-and-tooling#name-and-python-m), [circular imports](lesson:modules-and-tooling#circular-imports) and [virtual environments](lesson:modules-and-tooling#virtual-environments).

## Final challenges

:::challenge id=exam-robust-load-settings title="Settings with defaults" difficulty=easy
Write `load_settings(path, defaults)`, which reads a JSON object from the file at `path` and returns a **new** dict: `defaults` overlaid with the file's values. Along the way:

- A missing file isn't an error: return a copy of `defaults`.
- Write `SettingsError(message, path=None)`, an `Exception` subclass that stores `path`. Invalid JSON raises `SettingsError`, **chained** from the original `JSONDecodeError` so it stays debuggable.
- A file that holds valid JSON but not an object, such as `[1, 2]`, raises `SettingsError` too.
- Never modify `defaults`, and pass `encoding="utf-8"` whenever you open or read the file.

```js
function loadSettings(path, defaults) {
  let text;
  try {
    text = fs.readFileSync(path, "utf8");
  } catch (err) {
    if (err.code === "ENOENT") return { ...defaults };
    throw err;
  }
  try {
    return { ...defaults, ...JSON.parse(text) };
  } catch (err) {
    throw new SettingsError(`${path} is not valid JSON`, { cause: err, path });
  }
}
```

```python starter
import json


class SettingsError(Exception):
    pass


def load_settings(path, defaults):
    with open(path) as f:
        return json.load(f)
```

```python solution
import json


class SettingsError(Exception):
    def __init__(self, message, path=None):
        super().__init__(message)
        self.path = path


def load_settings(path, defaults):
    try:
        with open(path, encoding="utf-8") as f:
            data = json.load(f)
    except FileNotFoundError:
        return dict(defaults)
    except json.JSONDecodeError as err:
        raise SettingsError(f"{path} is not valid JSON", path=path) from err
    if not isinstance(data, dict):
        raise SettingsError(f"{path} must contain a JSON object", path=path)
    return defaults | data
```

```python tests
import json
from pathlib import Path

DEFAULTS = {"theme": "light", "lang": "en"}

def settings_file(name, text=None):
    path = Path(name)
    path.unlink(missing_ok=True)
    if text is not None:
        path.write_text(text, encoding="utf-8")
    return name

@test("overlays the file's values on the defaults")
def _():
    path = settings_file("exam-settings-1.json", '{"theme": "dark", "beta": true}')
    eq(load_settings(path, DEFAULTS), {"theme": "dark", "lang": "en", "beta": True})

@test("a missing file gives a copy of the defaults")
def _():
    path = settings_file("exam-settings-missing.json")
    result = load_settings(path, DEFAULTS)
    eq(result, DEFAULTS)
    check(result is not DEFAULTS, "return a copy, so callers can't edit the defaults through it")

@test("never modifies the defaults")
def _():
    defaults = {"theme": "light"}
    load_settings(settings_file("exam-settings-2.json", '{"theme": "dark"}'), defaults)
    eq(defaults, {"theme": "light"})

@test("SettingsError carries a message and a path")
def _():
    err = SettingsError("bad settings", path="app.json")
    check(isinstance(err, Exception), "SettingsError should subclass Exception")
    eq((str(err), err.path), ("bad settings", "app.json"))
    eq(SettingsError("oops").path, None)

@test("invalid JSON raises SettingsError, chained from the JSONDecodeError")
def _():
    path = settings_file("exam-settings-3.json", "{theme: dark}")
    err = raises(SettingsError, load_settings, path, DEFAULTS)
    eq(err.path, path)
    check(isinstance(err.__cause__, json.JSONDecodeError), "use `raise SettingsError(...) from err`")

@test("JSON that isn't an object raises SettingsError")
def _():
    path = settings_file("exam-settings-4.json", "[1, 2]")
    err = raises(SettingsError, load_settings, path, DEFAULTS)
    eq(err.path, path)

@test("reads non-ASCII values")
def _():
    path = settings_file("exam-settings-5.json", '{"greeting": "grüezi"}')
    eq(load_settings(path, {})["greeting"], "grüezi")

@test("passes an explicit encoding")
def _():
    calls = [
        node for node in ast.walk(tree)
        if isinstance(node, ast.Call)
        and getattr(node.func, "id", getattr(node.func, "attr", None)) in ("open", "read_text")
    ]
    check(calls, "read the file with open() or Path.read_text()")
    check(
        all(any(k.arg == "encoding" for k in call.keywords) for call in calls),
        'pass encoding="utf-8": the default depends on the platform',
    )
```

```hint
EAFP: open the file inside `try`, and handle `FileNotFoundError` and `json.JSONDecodeError` in separate `except` clauses. The second one raises `SettingsError(...) from err`.
```

```hint
Call `super().__init__(message)` in `SettingsError.__init__` so `str(err)` works, then store `self.path = path`.
```

```hint
`defaults | data` builds a new dict with the file's values winning, and leaves both inputs alone. Check `isinstance(data, dict)` before merging.
```
:::

:::challenge id=exam-robust-step-log title="Steps that annotate their failures" difficulty=medium
A deploy script runs in steps, and when one fails you want to know which. Write `step(name, log)` with `@contextmanager`:

- On entry, append `f"start {name}"` to the list `log`.
- If the block succeeds, append `f"done {name}"`.
- If the block raises an `Exception`, append `f"failed {name}: {ExceptionType}"` (for example `"failed upload: KeyError"`), add the note `f"in step {name!r}"` to the exception (`add_note`, 3.11+), and let the **same** exception propagate. Never swallow it.
- Anything that isn't an `Exception`, such as the `SystemExit` raised by `sys.exit()`, passes through untouched.

Because it's built with `@contextmanager`, `step` also works as a decorator, running each call of the function as a step.

```text
with step("deploy", log):
    with step("migrate", log):
        raise TimeoutError("db")

log  ->  ["start deploy", "start migrate", "failed migrate: TimeoutError", "failed deploy: TimeoutError"]
notes on the TimeoutError  ->  ["in step 'migrate'", "in step 'deploy'"]
```

```js
async function step(name, log, fn) {
  log.push(`start ${name}`);
  try {
    const result = await fn();
    log.push(`done ${name}`);
    return result;
  } catch (err) {
    log.push(`failed ${name}: ${err.name}`);
    err.message += ` (in step "${name}")`;   // no notes in JS
    throw err;
  }
}
```

```python starter
from contextlib import contextmanager


@contextmanager
def step(name, log):
    log.append(f"start {name}")
    yield
    log.append(f"done {name}")
```

```python solution
from contextlib import contextmanager


@contextmanager
def step(name, log):
    log.append(f"start {name}")
    try:
        yield
    except Exception as exc:
        log.append(f"failed {name}: {type(exc).__name__}")
        exc.add_note(f"in step {name!r}")
        raise
    log.append(f"done {name}")
```

```python tests
@test("logs the start and the end of a successful step")
def _():
    log = []
    with step("build", log):
        log.append("compiling")
    eq(log, ["start build", "compiling", "done build"])

@test("logs a failure and lets the exception propagate")
def _():
    log = []
    with raises(KeyError):
        with step("upload", log):
            raise KeyError("bucket")
    eq(log, ["start upload", "failed upload: KeyError"])

@test("adds a note to the original exception")
def _():
    boom = ValueError("bad row")
    with raises(ValueError) as caught:
        with step("import", []):
            raise boom
    check(caught.exception is boom, "re-raise the original exception with a bare `raise`; don't wrap it")
    eq(boom.__notes__, ["in step 'import'"])

@test("nested steps unwind innermost first")
def _():
    log = []
    with raises(TimeoutError) as caught:
        with step("deploy", log):
            with step("migrate", log):
                raise TimeoutError("db")
    eq(log, ["start deploy", "start migrate", "failed migrate: TimeoutError", "failed deploy: TimeoutError"])
    eq(caught.exception.__notes__, ["in step 'migrate'", "in step 'deploy'"])

@test("SystemExit passes through untouched")
def _():
    log = []
    with raises(SystemExit) as caught:
        with step("cli", log):
            raise SystemExit(1)
    eq(log, ["start cli"], "only Exception subclasses are failures: catch Exception, not BaseException")
    check(not hasattr(caught.exception, "__notes__"), "don't add notes to a SystemExit")

@test("works as a decorator")
def _():
    log = []

    @step("report", log)
    def build_report():
        return 42

    eq(build_report(), 42)
    eq(build_report(), 42)
    eq(log, ["start report", "done report", "start report", "done report"])
```

```hint
When the block raises, `@contextmanager` throws the exception into your generator at the `yield`. Wrap the `yield` in `try` and handle it there.
```

```hint
`except Exception as exc:` skips `SystemExit` and `KeyboardInterrupt` by design. Inside it, log, call `exc.add_note(...)`, then re-raise with a bare `raise`, which keeps the original exception and traceback.
```

```hint
Put `log.append(f"done {name}")` after the `try` statement, not in a `finally`: it must only run when the block succeeded.
```
:::

:::challenge id=exam-robust-ledger title="All-or-nothing transfers" difficulty=medium
Write a small `Ledger` whose transfers either fully happen or don't happen at all.

**Exceptions.** `LedgerError` is the base class. `UnknownAccountError(account)` subclasses both `LedgerError` and `LookupError`, so code that handles lookup failures catches it too. `InsufficientFundsError(account, balance, amount)` subclasses `LedgerError`, stores the three values as attributes, and reads `"alice has 30, needs 50"`.

**The ledger.**

- `Ledger(balances)` copies a dict mapping account names to balances. The `balances` property returns a copy of the current balances, so callers can't edit them behind the ledger's back.
- `deposit(account, amount)` and `withdraw(account, amount)` raise `UnknownAccountError` for an account that doesn't exist, `ValueError` for an amount that isn't positive, and, for `withdraw`, `InsufficientFundsError` rather than overdraw.
- `transaction()` is a context manager. Changes made inside the block apply as usual, but if the block raises, every balance goes back to what it was when the block started, and the exception propagates. Transactions nest: a failed inner block undoes only its own changes.
- `transfer(source, target, amount)` withdraws, then deposits, inside a transaction, so a transfer that fails halfway changes nothing.

```js
class Ledger {
  #balances;
  constructor(balances) { this.#balances = { ...balances }; }
  transaction(fn) {
    const snapshot = { ...this.#balances };
    try {
      return fn();
    } catch (err) {
      this.#balances = snapshot;
      throw err;
    }
  }
  transfer(from, to, amount) {
    this.transaction(() => {
      this.withdraw(from, amount);
      this.deposit(to, amount);
    });
  }
}
```

```python starter
from contextlib import contextmanager


class LedgerError(Exception):
    pass


class Ledger:
    def __init__(self, balances):
        self.balances = balances

    def deposit(self, account, amount):
        self.balances[account] += amount

    def withdraw(self, account, amount):
        self.balances[account] -= amount
```

```python solution
from contextlib import contextmanager


class LedgerError(Exception):
    """Base class for ledger failures."""


class UnknownAccountError(LedgerError, LookupError):
    def __init__(self, account):
        super().__init__(f"no account named {account!r}")
        self.account = account


class InsufficientFundsError(LedgerError):
    def __init__(self, account, balance, amount):
        super().__init__(f"{account} has {balance}, needs {amount}")
        self.account = account
        self.balance = balance
        self.amount = amount


class Ledger:
    def __init__(self, balances):
        self._balances = dict(balances)

    @property
    def balances(self):
        return dict(self._balances)

    def _check(self, account, amount):
        if account not in self._balances:
            raise UnknownAccountError(account)
        if amount <= 0:
            raise ValueError(f"amount must be positive, got {amount}")

    def deposit(self, account, amount):
        self._check(account, amount)
        self._balances[account] += amount

    def withdraw(self, account, amount):
        self._check(account, amount)
        balance = self._balances[account]
        if amount > balance:
            raise InsufficientFundsError(account, balance, amount)
        self._balances[account] = balance - amount

    @contextmanager
    def transaction(self):
        snapshot = dict(self._balances)
        try:
            yield self
        except BaseException:
            self._balances = snapshot
            raise

    def transfer(self, source, target, amount):
        with self.transaction():
            self.withdraw(source, amount)
            self.deposit(target, amount)
```

```python tests
def make_ledger():
    return Ledger({"alice": 100, "bob": 50})

@test("deposits and withdrawals update the balances")
def _():
    ledger = make_ledger()
    ledger.deposit("alice", 20)
    ledger.withdraw("bob", 50)
    eq(ledger.balances, {"alice": 120, "bob": 0})

@test("the ledger owns its balances")
def _():
    start = {"alice": 100}
    ledger = Ledger(start)
    start["alice"] = 0
    ledger.balances["alice"] = 1_000_000
    eq(ledger.balances, {"alice": 100}, "copy the dict in __init__, and return a copy from the property")

@test("the exceptions form a hierarchy")
def _():
    check(issubclass(LedgerError, Exception), "LedgerError should subclass Exception")
    check(issubclass(InsufficientFundsError, LedgerError), "InsufficientFundsError should subclass LedgerError")
    check(
        issubclass(UnknownAccountError, LedgerError) and issubclass(UnknownAccountError, LookupError),
        "UnknownAccountError should subclass both LedgerError and LookupError",
    )

@test("overdrawing raises InsufficientFundsError with the details")
def _():
    ledger = Ledger({"alice": 30})
    err = raises(InsufficientFundsError, ledger.withdraw, "alice", 50)
    eq((err.account, err.balance, err.amount), ("alice", 30, 50))
    eq(str(err), "alice has 30, needs 50")
    eq(ledger.balances, {"alice": 30})

@test("rejects unknown accounts and amounts that aren't positive")
def _():
    ledger = make_ledger()
    raises(UnknownAccountError, ledger.deposit, "mallory", 5)
    with raises(LookupError):
        ledger.withdraw("mallory", 5)
    raises(ValueError, ledger.deposit, "alice", 0)
    raises(ValueError, ledger.withdraw, "alice", -5)
    eq(ledger.balances, {"alice": 100, "bob": 50})

@test("a transaction keeps its changes when the block succeeds")
def _():
    ledger = make_ledger()
    with ledger.transaction():
        ledger.deposit("alice", 10)
        ledger.withdraw("bob", 10)
    eq(ledger.balances, {"alice": 110, "bob": 40})

@test("a failed transaction rolls everything back and re-raises")
def _():
    ledger = make_ledger()
    with raises(RuntimeError):
        with ledger.transaction():
            ledger.deposit("alice", 50)
            ledger.withdraw("bob", 10)
            raise RuntimeError("payment provider down")
    eq(ledger.balances, {"alice": 100, "bob": 50})

@test("transfer is all-or-nothing")
def _():
    ledger = make_ledger()
    ledger.transfer("alice", "bob", 30)
    eq(ledger.balances, {"alice": 70, "bob": 80})
    raises(UnknownAccountError, ledger.transfer, "alice", "mallory", 10)
    raises(InsufficientFundsError, ledger.transfer, "bob", "alice", 1_000)
    eq(ledger.balances, {"alice": 70, "bob": 80}, "a failed transfer must not move any money")

@test("a failed inner transaction undoes only its own changes")
def _():
    ledger = make_ledger()
    with ledger.transaction():
        ledger.deposit("alice", 10)
        try:
            with ledger.transaction():
                ledger.withdraw("bob", 5)
                raise RuntimeError("abort the inner block")
        except RuntimeError:
            pass
    eq(ledger.balances, {"alice": 110, "bob": 50})
```

```hint
Keep the real balances in a private dict (`self._balances`) and expose a copy through `@property`. Raise `UnknownAccountError` and `ValueError` from one small helper that both `deposit` and `withdraw` call.
```

```hint
`class UnknownAccountError(LedgerError, LookupError):` gives it two bases. Call `super().__init__(message)` in each exception's `__init__`, then store the attributes.
```

```hint
Write `transaction` as a `@contextmanager` method: take a snapshot with `dict(self._balances)`, `yield`, and in `except BaseException:` restore the snapshot and re-raise. Because each transaction takes its own snapshot when it starts, nesting works without extra code.
```
:::

:::challenge id=exam-robust-plugin-loader title="Load every plugin, report every failure" difficulty=hard
An app discovers its plugins by module name. Write `load_plugins(names)`:

- Import each module with `importlib.import_module`, call its `register()` function, and return a dict mapping each name to what `register()` returned, in the order of `names`.
- One broken plugin mustn't hide the others. Any `Exception` while importing a module or calling its `register()` is a failure: a missing module, an error in the module's own code, a module with no `register`, or a `register()` that raises. Add the note `f"plugin {name!r}"` to the exception, collect it, and move on.
- After trying them all, if anything failed, raise `ExceptionGroup(f"{failed} of {total} plugins failed to load", errors)` with the errors in order. Callers can then handle each kind with `except*`.
- Rely on the import system's cache: loading the same plugin twice must not run its module again.

```text
load_plugins(["csv_export", "pdf_export", "missing"])
  ->  ExceptionGroup("2 of 3 plugins failed to load", [RuntimeError(...), ModuleNotFoundError(...)])
```

```js
async function loadPlugins(names) {
  const loaded = {};
  const errors = [];
  for (const name of names) {
    try {
      const mod = await import(`./plugins/${name}.js`);
      loaded[name] = mod.register();
    } catch (err) {
      errors.push(new Error(`plugin ${name}`, { cause: err }));
    }
  }
  if (errors.length) {
    throw new AggregateError(errors, `${errors.length} of ${names.length} plugins failed to load`);
  }
  return loaded;
}
```

```python starter
import importlib


def load_plugins(names):
    return {name: importlib.import_module(name).register() for name in names}
```

```python solution
from importlib import import_module


def load_plugins(names):
    loaded = {}
    errors = []
    for name in names:
        try:
            loaded[name] = import_module(name).register()
        except Exception as err:
            err.add_note(f"plugin {name!r}")
            errors.append(err)
    if errors:
        raise ExceptionGroup(f"{len(errors)} of {len(names)} plugins failed to load", errors)
    return loaded
```

```python tests
import importlib
import sys
from pathlib import Path

def plugin(name, source=None):
    """Write (or, with no source, delete) a plugin module and forget any cached copy."""
    path = Path(f"{name}.py")
    if source is None:
        path.unlink(missing_ok=True)
    else:
        path.write_text(source, encoding="utf-8")
    importlib.invalidate_caches()
    sys.modules.pop(name, None)
    return name

def csv_plugin():
    return plugin("exam_plugin_csv", 'FORMATS = ["csv"]\n\ndef register():\n    return FORMATS\n')

def json_plugin():
    return plugin("exam_plugin_json", 'def register():\n    return "json exporter"\n')

@test("loads every plugin, in order")
def _():
    loaded = load_plugins([json_plugin(), csv_plugin()])
    eq(loaded, {"exam_plugin_json": "json exporter", "exam_plugin_csv": ["csv"]})
    eq(list(loaded), ["exam_plugin_json", "exam_plugin_csv"])

@test("no plugins, no work")
def _():
    eq(load_plugins([]), {})

@test("a missing module is reported in an ExceptionGroup")
def _():
    group = raises(ExceptionGroup, load_plugins, [csv_plugin(), plugin("exam_plugin_missing")])
    eq([type(e) for e in group.exceptions], [ModuleNotFoundError])
    eq(group.message, "1 of 2 plugins failed to load")

@test("collects every failure, in order, each with a note")
def _():
    names = [
        csv_plugin(),
        plugin("exam_plugin_broken", 'def register():\n    raise RuntimeError("missing API key")\n'),
        plugin("exam_plugin_empty", "VERSION = 1\n"),
        plugin("exam_plugin_missing"),
        json_plugin(),
    ]
    group = raises(ExceptionGroup, load_plugins, names)
    eq(group.message, "3 of 5 plugins failed to load")
    eq([type(e).__name__ for e in group.exceptions], ["RuntimeError", "AttributeError", "ModuleNotFoundError"])
    eq(
        [e.__notes__ for e in group.exceptions],
        [["plugin 'exam_plugin_broken'"], ["plugin 'exam_plugin_empty'"], ["plugin 'exam_plugin_missing'"]],
    )

@test("errors in a module's own code count as failures")
def _():
    name = plugin("exam_plugin_typo", "FORMATS = [csv]\n\ndef register():\n    return FORMATS\n")
    group = raises(ExceptionGroup, load_plugins, [name])
    eq([type(e) for e in group.exceptions], [NameError])

@test("callers can split the group with except*")
def _():
    handled = []
    try:
        load_plugins([plugin("exam_plugin_missing"), plugin("exam_plugin_empty", "VERSION = 1\n")])
    except* ModuleNotFoundError as group:
        handled.append(("missing", len(group.exceptions)))
    except* AttributeError as group:
        handled.append(("no register", len(group.exceptions)))
    eq(handled, [("missing", 1), ("no register", 1)])

@test("a module is imported once, however often it's loaded")
def _():
    name = csv_plugin()
    first = load_plugins([name])[name]
    second = load_plugins([name])[name]
    check(first is second, "the second load re-ran the module: let import_module use sys.modules")

@test("uses importlib.import_module")
def _():
    requires_call("import_module", "import plugins with importlib.import_module(name)")
    forbids_call("exec", "exec isn't needed: the import system runs the module")
```

```hint
Loop over the names with a `try` around `import_module(name).register()`. A missing module raises `ModuleNotFoundError`, and a missing `register` raises `AttributeError`, so one `except Exception as err:` covers every failure.
```

```hint
Inside the handler, `err.add_note(f"plugin {name!r}")` and append the error to a list. After the loop, raise the group only if the list isn't empty.
```

```hint
`import_module` checks `sys.modules` first, so a second load of the same plugin returns the module object that's already there. Don't `reload()` it or `exec` its source.
```
:::
