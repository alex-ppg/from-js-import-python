---
title: Errors & Exceptions
part: Robust Code
summary: try/except/else/finally, raising and chaining, custom errors, EAFP, and exception groups.
minutes: 35
---

`throw` becomes `raise`, `catch` becomes `except`, and `Error` becomes `Exception`. The syntax maps almost one to one, but the culture doesn't. Where JavaScript hands you `undefined`, `NaN` or `Infinity` and lets the bad value wander off, Python raises on the exact line where things went wrong. You catch by **type** instead of catching everything and inspecting it. And exceptions are ordinary control flow: every `for` loop ends when its iterator raises `StopIteration`.

## try, except, else, finally

:::compare
```js
try {
  const order = JSON.parse(body);
  save(order);
} catch (err) {
  if (err instanceof SyntaxError) {
    console.error("bad JSON:", err.message);
  } else {
    throw err;
  }
} finally {
  db.release();
}
```
```python
try:
    order = json.loads(body)
except json.JSONDecodeError as err:
    print("bad JSON:", err)

else:
    save(order)



finally:
    db.release()
```
:::

Each `except` clause names the types it handles, so the `instanceof` ladder and the manual rethrow disappear: anything that doesn't match keeps propagating on its own. `as err` binds the exception object.

`else` is the clause JavaScript lacks. It runs only when the `try` block raised nothing, which keeps the `try` body down to the one call that can fail. That matters: `JSONDecodeError` is a subclass of `ValueError`, so with `save()` inside the `try` and an `except ValueError`, a bug in `save()` would be reported as "bad JSON". `finally` runs however the block ends: normally, by exception, or through `return`, `break` or `continue`.

```python run
import json

def parse_quantity(body):
    try:
        data = json.loads(body)
    except json.JSONDecodeError as err:
        print(f"  bad JSON: {err.msg}")
        return None
    else:
        print("  parsed fine")
        return data["qty"]
    finally:
        print("  finally runs either way")

print(parse_quantity('{"qty": 3}'))
print(parse_quantity("{qty: 3}"))
```

:::gotcha The `as` name is deleted after the clause
Python has no block scope, so you'd expect `err` to outlive the `except` clause like any other variable. It doesn't. Python deletes the name when the clause ends, because the exception holds its traceback and the traceback holds every local in the frame. Assign it to another name if you need it later.
:::

:::quiz output
What does this print?

```python
try:
    1 / 0
except ZeroDivisionError as err:
    pass
print(err)
```

- [ ] `division by zero`
- [ ] `None`
- [x] `NameError`
- [ ] `ZeroDivisionError`

`err` is unbound once the `except` clause finishes, so `print(err)` raises `NameError: name 'err' is not defined`.
:::

A `return`, `break` or `continue` inside `finally` silently discards any exception in flight, exactly as in JavaScript. Python 3.14 emits a `SyntaxWarning` for it.

## Catch what you can handle

:::compare
```js
try {
  const user = users[id];
  total += user.balance / user.orderCount;
} catch (err) {
  if (err instanceof TypeError) {
    console.warn("no such user:", id);
  } else {
    throw err;
  }
}
```
```python
try:
    user = users[user_id]
    total += user["balance"] / user["order_count"]
except KeyError as err:
    print("missing user or field:", err)
except ZeroDivisionError:
    print("user has no orders yet")
except (TypeError, ValueError):
    print("corrupt record")
```
:::

Clauses are tested top to bottom and the **first match wins**. Matching works like `isinstance`, so a clause also catches every subclass of the type it names, and a parenthesised tuple handles several types at once. (Python 3.14 lets you drop the parentheses when there's no `as`, as in `except TypeError, ValueError:`. Keep them if your code must run on older versions.) Note the clause JavaScript never needs: there, `user.balance / 0` is just `Infinity`.

Exceptions form a class hierarchy, and catching a base class catches the whole family:

```python run
for exc_type in (KeyError, IndexError, FileNotFoundError, KeyboardInterrupt):
    print(" -> ".join(cls.__name__ for cls in exc_type.__mro__[:-1]))

def first_tag(post):
    try:
        return post["tags"][0]
    except LookupError:              # KeyError *or* IndexError
        return None

print(first_tag({"tags": ["python"]}), first_tag({"tags": []}), first_tag({}))
```

:::quiz output
What does this print?

```python
try:
    {"sku": "A1"}["qty"]
except LookupError:
    print("lookup")
except KeyError:
    print("key")
```

- [ ] `key`
- [x] `lookup`
- [ ] `lookup key`
- [ ] `KeyError`

`KeyError` is a subclass of `LookupError`, and the first matching clause wins, which makes `except KeyError` unreachable. Put specific types before general ones.
:::

:::gotcha Never write a bare `except:`
`except:` with no type catches `BaseException`, the root of the hierarchy. That includes `KeyboardInterrupt` (Ctrl+C) and `SystemExit` (raised by `sys.exit()`), so a bare `except` in a retry loop makes your script impossible to stop. `except Exception:` is the closest thing to JavaScript's catch-all `catch (err)`. It belongs at the outer boundary of a program, such as a request handler or a job runner, where you log the error and carry on. Everywhere else, catch the types you know how to handle.
:::

## Raising exceptions

:::compare
```js
function setDiscount(pct) {
  if (pct < 0 || pct > 100) {
    throw new RangeError(`discount out of range: ${pct}`);
  }
}

try {
  setDiscount(150);
} catch (err) {
  console.log(err.name, err.message);
  console.log(err.stack);
}
```
```python run
import traceback

def set_discount(pct):
    if not 0 <= pct <= 100:
        raise ValueError(f"discount out of range: {pct}")

try:
    set_discount(150)
except ValueError as err:
    print(type(err).__name__, err)
    traceback.print_exc()
```
:::

There's no `new`: you raise an instance, or a bare class (`raise ValueError`) that Python instantiates for you. And you can only raise exceptions. `throw "oops"` is legal JavaScript, while `raise "oops"` is a `TypeError`. Prefer a built-in type that describes the problem, because callers already know how to catch them:

| JavaScript | Python | Raised for |
| --- | --- | --- |
| `Error` | `Exception` | the base class for your own errors |
| `TypeError` | `TypeError` | wrong type, wrong number of arguments, calling a non-callable |
| `TypeError` reading a property of `undefined` | `AttributeError` | a missing attribute, often on `None` |
| `RangeError` | `ValueError` | the right type with a bad value: `int("abc")`, `math.sqrt(-1)` |
| `RangeError` from a stack overflow | `RecursionError` | recursion deeper than `sys.getrecursionlimit()` |
| `ReferenceError` | `NameError` | an unknown name (`UnboundLocalError` is its read-before-assignment subclass) |
| `SyntaxError` from `JSON.parse` | `json.JSONDecodeError` | invalid JSON (a `ValueError` subclass) |
| `AggregateError` | `ExceptionGroup` | several errors at once |
| Node's `ENOENT` error code | `FileNotFoundError` | `OSError` subclasses replace error codes: `PermissionError`, `FileExistsError`, `TimeoutError`... |
| *(returns `undefined`)* | `KeyError`, `IndexError` | a missing dict key, a list index out of range |
| *(returns `Infinity`)* | `ZeroDivisionError` | `x / 0`, `x // 0` and `x % 0` |
| *(no equivalent)* | `NotImplementedError` | a method that subclasses must override |

:::gotcha There's no `.message`
`err.message` raises `AttributeError`. The message is `str(err)`, and the constructor's arguments live in `err.args`. `err.name` becomes `type(err).__name__`, and `err.stack` becomes `traceback.format_exception(err)`, or `traceback.format_exc()` inside an `except` block.
:::

## Where JavaScript shrugs, Python raises

This is the biggest behavioural difference between the languages, and it's a feature. JavaScript returns a placeholder value and the bug surfaces three function calls later. Python stops at the line that produced the problem.

:::compare
```js
const user = { name: "Ada" };
user.email;             // undefined
[1, 2, 3][10];          // undefined
1 / 0;                  // Infinity
parseInt("42px");       // 42
Number("abc");          // NaN
Math.sqrt(-1);          // NaN
"total: " + 1;          // "total: 1"
undeclaredName;         // ReferenceError, finally
greet("Ada", "extra");  // extra argument ignored
```
```python
user = {"name": "Ada"}
user["email"]           # KeyError
[1, 2, 3][10]           # IndexError
1 / 0                   # ZeroDivisionError
int("42px")             # ValueError
float("abc")            # ValueError
math.sqrt(-1)           # ValueError
"total: " + 1           # TypeError
undeclared_name         # NameError
greet("Ada", "extra")   # TypeError
```
:::

```python run
import math

attempts = {
    "missing key": lambda: {"name": "Ada"}["email"],
    "index past end": lambda: [1, 2, 3][10],
    "divide by zero": lambda: 1 / 0,
    "strict int()": lambda: int("42px"),
    "sqrt(-1)": lambda: math.sqrt(-1),
    "str + int": lambda: "total: " + 1,
    "extra argument": lambda: len("Ada", "extra"),
}
for label, attempt in attempts.items():
    try:
        attempt()
    except Exception as err:
        print(f"{label:15} {type(err).__name__}: {err}")
```

The price of loud failures is that you must say what "missing" means when missing is normal: `user.get("email")`, `xs[-1] if xs else None`, `next(iter(xs), None)`. Those idioms live in [Dicts](lesson:dicts), [Lists](lesson:lists#length-indexing-and-negative-indices) and [Iterators & Generators](lesson:iterators-and-generators). Floats still have `inf` and `nan` (`1e308 * 10` overflows to `inf`), but even `1.0 / 0.0` raises (see [Numbers & Math](lesson:numbers-and-math)).

## Custom exceptions

:::compare
```js
class PaymentError extends Error {}

class InsufficientFundsError extends PaymentError {
  constructor(balance, amount) {
    super(`balance ${balance} is less than ${amount}`);
    this.name = "InsufficientFundsError";
    this.balance = balance;
    this.amount = amount;
  }
}

function withdraw(balance, amount) {
  if (amount > balance) {
    throw new InsufficientFundsError(balance, amount);
  }
  return balance - amount;
}
```
```python run
class PaymentError(Exception):
    """Base class for payment failures."""

class InsufficientFundsError(PaymentError):
    def __init__(self, balance, amount):
        super().__init__(f"balance {balance} is less than {amount}")

        self.balance = balance
        self.amount = amount


def withdraw(balance, amount):
    if amount > balance:
        raise InsufficientFundsError(balance, amount)
    return balance - amount

try:
    withdraw(20, 50)
except PaymentError as err:
    print(f"{type(err).__name__}: {err} (short by {err.amount - err.balance})")
```
:::

Subclass `Exception` (never `BaseException`), end the name in `Error`, and you're done: a docstring is a complete class body. There's no `this.name` boilerplate, because tracebacks print the class name automatically. Pass the message to `super().__init__()` so `str(err)` and tracebacks show it, then attach whatever structured data a handler might need.

:::pythonic Give your library one base exception
A single `PaymentError` base lets callers catch everything your module raises with one clause, while still being able to single out `InsufficientFundsError`. When a built-in already describes the failure, inherit from it too: `class UnknownSKUError(LookupError)` is still caught by code that handles `LookupError`.
:::

## Re-raising and chaining

:::compare
```js
try {
  charge(card);
} catch (err) {
  console.error(err);
  throw err;
}

try {
  config = JSON.parse(text);
} catch (err) {
  throw new ConfigError("invalid config", { cause: err });
}
```
```python
try:
    charge(card)
except PaymentError:
    log.exception("charge failed")
    raise


try:
    config = json.loads(text)
except json.JSONDecodeError as err:
    raise ConfigError("invalid config") from err
```
:::

A bare `raise` inside an `except` block re-raises the exception being handled, with its original traceback intact. `raise New(...) from err` is `new Error(msg, { cause: err })`: it stores the original on `__cause__`, and the traceback prints both, joined by "The above exception was the direct cause of the following exception".

Unlike JavaScript, Python also chains **implicitly**. Raise anything while handling an exception and the original is kept on `__context__`, printed above yours with "During handling of the above exception, another exception occurred". That wording reads like a bug in your handler, so say what you mean: `from err` for a deliberate translation, `from None` to hide an internal detail the caller doesn't need.

```python run raises
import json

class ConfigError(Exception):
    pass

def load_config(text):
    try:
        return json.loads(text)
    except json.JSONDecodeError as err:
        raise ConfigError("config.json is not valid JSON") from err

load_config("{port: 8080}")    # try `from None`, then no `from` at all
```

:::quiz
Inside an `except KeyError:` block you write `raise ValueError("unknown user")`, with no `from`. What does the traceback show?

- [ ] Only the `ValueError`
- [ ] Only the `KeyError`
- [x] Both, joined by "During handling of the above exception, another exception occurred"
- [ ] Both, joined by "The above exception was the direct cause of the following exception"

Raising inside a handler chains implicitly through `__context__`. "Direct cause" is reserved for an explicit `raise ... from err`, and `from None` hides the `KeyError` entirely.
:::

## EAFP: ask forgiveness, not permission

:::compare
```js
// look before you leap
let text = "";
if (fs.existsSync(path)) {
  text = fs.readFileSync(path, "utf8");
}

let timeout = 30;
if (typeof options.timeout === "number") {
  timeout = options.timeout;
}
```
```python
# easier to ask forgiveness than permission
try:
    text = Path(path).read_text(encoding="utf-8")
except FileNotFoundError:
    text = ""

try:
    timeout = float(options["timeout"])
except (KeyError, TypeError, ValueError):
    timeout = 30.0
```
:::

Python's culture prefers **EAFP**: attempt the operation and handle the specific failure, rather than checking every precondition first (**LBYL**, look before you leap). The check and the use can't drift apart. A file can vanish between `exists()` and `read_text()`, but not between "try to read" and "reading failed". And since Python 3.11, entering a `try` block costs almost nothing when no exception is raised.

EAFP isn't a mandate to wrap everything in `try`. Raising and catching costs far more than an `if`, so check first when failure is the common case. And when an API already encodes the fallback, use it: `d.get(key, default)`, `Path.unlink(missing_ok=True)`, `next(it, None)`.

```python run
from contextlib import suppress
from pathlib import Path

def read_or_default(path, default=""):
    try:
        return Path(path).read_text(encoding="utf-8")
    except FileNotFoundError:
        return default

Path("motd.txt").write_text("Deploy freeze on Friday", encoding="utf-8")
print(repr(read_or_default("motd.txt")))
print(repr(read_or_default("missing.txt")))

with suppress(FileNotFoundError):
    Path("missing.txt").unlink()
print("no crash")
```

:::pythonic `contextlib.suppress` for "ignore this one error"
`with suppress(FileNotFoundError):` replaces a `try` whose `except` clause is just `pass`, and it names the error up front. It's a context manager, the protocol covered in [Context Managers](lesson:context-managers).
:::

:::quiz
`config` is a dict that may or may not contain `"retries"`. Which line is the idiomatic way to read it with a default of 3?

- [x] `retries = config.get("retries", 3)`
- [ ] `retries = config["retries"] or 3`
- [ ] `try: retries = config["retries"]` / `except KeyError: retries = 3`
- [ ] `retries = config["retries"] if "retries" in config else 3`

`get` encodes the fallback in one call. The `try` and `in` versions work but say more than they need to. `or 3` is a bug: a configured `0` is falsy, so it silently becomes 3.
:::

## Exception groups and notes

:::compare
```js
const results = await Promise.allSettled(jobs);
const errors = results
  .filter((r) => r.status === "rejected")
  .map((r) => r.reason);
if (errors.length) {
  throw new AggregateError(errors, "jobs failed");
}

// the caller loops over err.errors by hand
```
```python
errors = []
for job in jobs:
    try:
        job.run()
    except Exception as err:
        errors.append(err)
if errors:
    raise ExceptionGroup("jobs failed", errors)

try:
    run_all(jobs)
except* TimeoutError as group:
    retry_later(group.exceptions)
except* ValueError as group:
    report(group.exceptions)
```
:::

`ExceptionGroup(message, exceptions)` is `AggregateError` (3.11+). The new part is `except*`. Each `except*` clause receives a sub-group holding only the exceptions it matches, **several clauses can run** for one group, and whatever no clause matched is re-raised as a smaller group. You'll meet groups from `asyncio.TaskGroup` when several tasks fail at once (see [Async](lesson:async)).

```python run
def check_order(order):
    problems = []
    if order.get("qty", 0) <= 0:
        problems.append(ValueError("qty must be positive"))
    if not isinstance(order.get("sku"), str):
        problems.append(TypeError("sku must be a string"))
    if problems:
        raise ExceptionGroup("invalid order", problems)

try:
    check_order({"qty": 0, "sku": 42})
except* ValueError as group:
    print("value problems:", group.exceptions)
except* TypeError as group:
    print("type problems:", group.exceptions)
```

:::gotcha A plain `except ValueError` doesn't look inside groups
`ExceptionGroup` isn't a subclass of `ValueError`, so `except ValueError:` misses a group full of them. Handle groups with `except*` or `except ExceptionGroup`. An uncaught group prints as a tree, one branch per sub-exception: call `check_order` above outside the `try` to see it.
:::

`err.add_note(text)` (3.11+) attaches context to an exception without wrapping it. Notes print under the message, which makes them ideal for adding "where" information on the way up:

```python run raises
rows = [{"sku": "A1", "qty": "3"}, {"sku": "B2", "qty": "three"}]

def parse_rows(rows):
    for line_no, row in enumerate(rows, start=2):   # line 1 is the CSV header
        try:
            yield row["sku"], int(row["qty"])
        except ValueError as err:
            err.add_note(f"while parsing line {line_no}: {row}")
            raise

print(list(parse_rows(rows)))
```

## Reading tracebacks

:::compare
```text title="node cart.js"
TypeError: Cannot read properties of undefined (reading 'price')
    at lineTotal (cart.js:2:23)
    at cart.js:6:49
    at Array.reduce (<anonymous>)
    at cartTotal (cart.js:6:21)
    at Object.<anonymous> (cart.js:9:13)
```
```text title="python cart.py"
Traceback (most recent call last):
  File "cart.py", line 7, in <module>
    print(cart_total({"lines": [{"qty": 1}]}))
          ~~~~~~~~~~^^^^^^^^^^^^^^^^^^^^^^^^^
  File "cart.py", line 5, in cart_total
    return sum(line_total(line) for line in cart["lines"])
  File "cart.py", line 5, in <genexpr>
    return sum(line_total(line) for line in cart["lines"])
               ~~~~~~~~~~^^^^^^
  File "cart.py", line 2, in line_total
    return line["product"]["price"] * line["qty"]
           ~~~~^^^^^^^^^^^
KeyError: 'product'
```
:::

Read a Python traceback **bottom-up**. The last line is the exception type and message. Above it, frames run from the outermost call at the top down to the line that raised: "most recent call last". That's the reverse of a JavaScript stack trace, which puts the error first and the innermost frame right under it. Since 3.11, the `~~~^^^` markers underline the exact sub-expression that failed, so `line["product"]` is the culprit even though that line indexes three times.

```python run raises
def apply_coupon(order, coupons):
    return order["total"] * (1 - coupons[order["coupon"]])

def checkout(orders, coupons):
    return [apply_coupon(order, coupons) for order in orders]

coupons = {"WELCOME10": 0.1}
orders = [{"total": 50, "coupon": "WELCOME10"}, {"total": 80, "coupon": "SPRING"}]
print(checkout(orders, coupons))
```

:::tip Logging a traceback you caught
Inside an `except` block, `traceback.print_exc()` prints the full traceback to stderr and `traceback.format_exc()` returns it as a string. With `logging`, `log.exception("charge failed")` logs your message plus the traceback at ERROR level. That's the `console.error(err)` habit, done right.
:::

## `assert` is for invariants

:::compare
```js
console.assert(total >= 0, "negative total"); // only logs!

import assert from "node:assert";
assert(total >= 0, "negative total");         // throws
```
```python run raises
def apply_discount(price, pct):
    discounted = price * (1 - pct / 100)
    assert 0 <= discounted <= price, f"bad discount math: {discounted}"
    return discounted

print(apply_discount(80, 25))
print(apply_discount(80, 150))
```
:::

`assert condition, message` raises `AssertionError(message)` when the condition is falsy. It's a statement, not a function, meant for things that can't happen unless your code has a bug. It's also the entire assertion API of pytest (see [Modules & Tooling](lesson:modules-and-tooling)). Never use it to validate input: running Python with `-O` strips every `assert` from the program.

:::gotcha `assert(x, "msg")` always passes
With parentheses, the argument is a two-item tuple, and a non-empty tuple is truthy, so the assertion can never fail. Python emits `SyntaxWarning: assertion is always true, perhaps remove parentheses?`, but warnings are easy to miss.
:::

## Cheat sheet

| JavaScript | Python | Notes |
| --- | --- | --- |
| `throw new Error(msg)` | `raise ValueError(msg)` | pick a specific type; no `new` |
| `catch (err)` | `except SomeError as err:` | catch by type |
| `instanceof` check, else rethrow | `except A:` | unmatched exceptions propagate |
| `instanceof A \|\| instanceof B` | `except (A, B):` | 3.14 drops the parentheses if there's no `as` |
| catch-all `catch (err)` | `except Exception as err:` | never a bare `except:` |
| *(none)* | `else:` | runs only if `try` raised nothing |
| `finally { }` | `finally:` | always runs |
| `throw err` (rethrow) | `raise` | keeps the original traceback |
| `new Error(msg, { cause: err })` | `raise New(msg) from err` | stored on `__cause__` |
| *(none)* | `raise New(msg) from None` | hides the internal exception |
| `err.message` | `str(err)` | also `err.args` |
| `err.name` | `type(err).__name__` | |
| `err.stack` | `traceback.format_exc()` | or `log.exception(...)` |
| `class MyError extends Error` | `class MyError(Exception):` | no `this.name` needed |
| `AggregateError` | `ExceptionGroup` | handle with `except*` (3.11+) |
| *(none)* | `err.add_note(text)` | extra context in the traceback (3.11+) |
| `try { } catch { }` (ignore) | `with suppress(SomeError):` | from `contextlib` |
| `console.assert(c, msg)` | `assert c, msg` | raises; stripped by `python -O` |

## Challenges

:::challenge id=exc-to-int title="Parse or fall back" difficulty=easy
Write `to_int(text, default=None)` that returns `text` parsed as an integer, or `default` when the text isn't a valid integer. Surrounding whitespace is fine, as it is for `int()`.

Catch only the error you expect. Passing something that isn't a string at all, like `None`, is a bug in the caller, so let that `TypeError` propagate.

```js
function toInt(text, fallback = null) {
  if (typeof text !== "string") throw new TypeError("text must be a string");
  return /^\s*[+-]?\d+\s*$/.test(text) ? Number(text) : fallback;
}
```

```python starter
def to_int(text, default=None):
    ...
```

```python solution
def to_int(text, default=None):
    try:
        return int(text)
    except ValueError:
        return default
```

```python tests
@test("parses integers, ignoring surrounding whitespace")
def _():
    eq(to_int("42"), 42)
    eq(to_int("-7"), -7)
    eq(to_int("  12\n"), 12)

@test("returns the default for invalid text")
def _():
    eq(to_int("42px"), None)
    eq(to_int("", default=0), 0)
    eq(to_int("3.5", default=-1), -1)

@test("zero is a result, not a failure")
def _():
    eq(to_int("0", default=99), 0)

@test("lets TypeError through for non-strings")
def _():
    raises(TypeError, to_int, None)

@test("uses try/except with a specific type")
def _():
    handlers = [node for node in ast.walk(tree) if isinstance(node, ast.ExceptHandler)]
    check(handlers, "use try/except: EAFP is the idiomatic way to parse")
    check(all(h.type is not None for h in handlers), "a bare `except:` catches everything, even Ctrl+C")
```

```hint
`int("42px")` raises `ValueError`, while `int(None)` raises `TypeError`.
```

```hint
Wrap `return int(text)` in a `try` and handle `ValueError` only. Avoid `int(text) or default`: `0` is falsy.
```
:::

:::challenge id=exc-config-error title="Translate low-level errors" difficulty=medium
Callers of a config loader shouldn't have to know that it uses `json`, or that a missing key is a `KeyError`. Write:

- `ConfigError(message, key=None)`, an `Exception` subclass. `str(err)` is the message, and `err.key` names the setting involved (or `None`).
- `load_port(text)`, which parses `text` as JSON and returns its `"port"` value.

Translate the two failures:

- Invalid JSON raises `ConfigError("invalid JSON")`, **chained** from the original `JSONDecodeError` so it stays debuggable.
- A missing `"port"` raises `ConfigError("missing setting", key="port")`, **without** dragging the internal `KeyError` into the traceback.

```python starter
import json


class ConfigError(Exception):
    ...


def load_port(text):
    ...
```

```python solution
import json


class ConfigError(Exception):
    def __init__(self, message, key=None):
        super().__init__(message)
        self.key = key


def load_port(text):
    try:
        config = json.loads(text)
    except json.JSONDecodeError as err:
        raise ConfigError("invalid JSON") from err
    try:
        return config["port"]
    except KeyError:
        raise ConfigError("missing setting", key="port") from None
```

```python tests
import json

@test("returns the port")
def _():
    eq(load_port('{"host": "db", "port": 5432}'), 5432)

@test("ConfigError carries a message and a key")
def _():
    err = ConfigError("bad value", key="timeout")
    check(isinstance(err, Exception), "ConfigError should subclass Exception")
    eq(str(err), "bad value")
    eq(err.key, "timeout")
    eq(ConfigError("oops").key, None)

@test("invalid JSON raises ConfigError, chained from the JSONDecodeError")
def _():
    err = raises(ConfigError, load_port, "{port: 5432}")
    eq(str(err), "invalid JSON")
    check(isinstance(err.__cause__, json.JSONDecodeError), "use `raise ConfigError(...) from err`")

@test("a missing port raises ConfigError with key='port'")
def _():
    err = raises(ConfigError, load_port, '{"host": "db"}')
    eq(str(err), "missing setting")
    eq(err.key, "port")

@test("a missing port doesn't leak the KeyError")
def _():
    err = raises(ConfigError, load_port, "{}")
    check(
        err.__cause__ is None and (err.__context__ is None or err.__suppress_context__),
        "the traceback shouldn't show a KeyError: raise ... from None",
    )
```

```hint
Call `super().__init__(message)` in `ConfigError.__init__` so `str(err)` works, then store `self.key = key`.
```

```hint
`raise ConfigError("invalid JSON") from err` chains explicitly. Inside `except KeyError:`, `from None` stops the implicit chain.
```
:::

:::challenge id=exc-retry title="Retry, then report everything" difficulty=hard
Write `retry(fn, attempts=3, retry_on=(TimeoutError, ConnectionError))`:

- Call `fn()` and return its result as soon as a call succeeds.
- If a call raises one of the `retry_on` types, try again, up to `attempts` calls in total.
- Any other exception propagates immediately, unchanged.
- If every attempt fails, raise `ExceptionGroup(f"all {attempts} attempts failed", errors)` with the errors in order. Before collecting each error, add a note to it: `"attempt 1"`, `"attempt 2"`, and so on.

`attempts` is always at least 1. Don't sleep between attempts.

```js
async function retry(fn, attempts = 3, retryOn = [TimeoutError]) {
  const errors = [];
  for (let i = 1; i <= attempts; i++) {
    try {
      return await fn();
    } catch (err) {
      if (!retryOn.some((type) => err instanceof type)) throw err;
      errors.push(err);
    }
  }
  throw new AggregateError(errors, `all ${attempts} attempts failed`);
}
```

```python starter
def retry(fn, attempts=3, retry_on=(TimeoutError, ConnectionError)):
    return fn()
```

```python solution
def retry(fn, attempts=3, retry_on=(TimeoutError, ConnectionError)):
    errors = []
    for attempt in range(1, attempts + 1):
        try:
            return fn()
        except retry_on as err:
            err.add_note(f"attempt {attempt}")
            errors.append(err)
    raise ExceptionGroup(f"all {attempts} attempts failed", errors)
```

```python tests
def flaky(*outcomes):
    """Each call raises or returns the next outcome."""
    def fn():
        fn.calls += 1
        outcome = outcomes[fn.calls - 1]
        if isinstance(outcome, BaseException):
            raise outcome
        return outcome
    fn.calls = 0
    return fn

@test("returns the first success")
def _():
    fn = flaky(TimeoutError(), ConnectionError(), "ok")
    eq(retry(fn), "ok")
    eq(fn.calls, 3)

@test("other errors propagate immediately, unchanged")
def _():
    boom = ValueError("bad input")
    fn = flaky(boom, "ok")
    check(raises(ValueError, retry, fn) is boom, "let the original exception through")
    eq(fn.calls, 1, "don't retry errors that aren't in retry_on")

@test("gives up with an ExceptionGroup after `attempts` calls")
def _():
    first, second = TimeoutError("t1"), TimeoutError("t2")
    fn = flaky(first, second, "too late")
    group = raises(ExceptionGroup, retry, fn, attempts=2)
    eq(str(group), "all 2 attempts failed (2 sub-exceptions)")
    check(group.exceptions == (first, second), "collect the errors in order")
    eq(fn.calls, 2)

@test("notes each error with its attempt number")
def _():
    group = raises(ExceptionGroup, retry, flaky(TimeoutError(), ConnectionError()), attempts=2)
    eq([err.__notes__ for err in group.exceptions], [["attempt 1"], ["attempt 2"]])

@test("respects a custom retry_on")
def _():
    eq(retry(flaky(KeyError("sku"), 5), retry_on=(KeyError,)), 5)
    raises(TimeoutError, retry, flaky(TimeoutError(), 5), retry_on=(KeyError,))
```

```hint
`except` accepts any expression that evaluates to an exception class or a tuple of them, so `except retry_on as err:` works.
```

```hint
Exceptions that don't match the `except` clause propagate on their own. The "other errors" rule needs no code at all.
```

```hint
Loop with `for attempt in range(1, attempts + 1):`, `return` from inside the `try`, and raise the group after the loop.
```
:::
