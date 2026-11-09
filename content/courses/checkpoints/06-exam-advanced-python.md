---
title: "Exam: Advanced Python"
part: Core Course Exams
summary: Quizzes and integrative challenges on asyncio, type hints, pattern matching, the stdlib and gotchas.
minutes: 65
---

This exam covers the Advanced Python part of the core course: [Async/Await & asyncio](lesson:async), [Type Hints for TypeScript Devs](lesson:type-hints), [Structural Pattern Matching](lesson:pattern-matching), [Batteries Included](lesson:standard-library) and [Gotchas: A Field Guide for JS Brains](lesson:gotchas). Every quiz runs real code, so commit to an answer before you reveal it: the ones you miss show which sections deserve a second read, and each section ends with a pointer to them. The final challenges mix the lessons the way production code does: `match` over JSON payloads, a JavaScript port with four bugs to fix, settings typed by their annotations, a log report built from dates and patterns, and an async fetcher with a concurrency limit and a deadline.

## Coroutines and tasks

The keywords match JavaScript; when the work starts doesn't.

:::quiz output
What does this print?

```python
import asyncio

async def step(name, delay):
    await asyncio.sleep(delay)
    print(name, end=" ")

async def main():
    first = step("a", 0.02)
    second = step("b", 0.01)
    await first
    await second
    third = asyncio.create_task(step("c", 0.02))
    fourth = asyncio.create_task(step("d", 0.01))
    await third
    await fourth

asyncio.run(main())
```

- [ ] `b a d c`
- [ ] `a b c d`
- [x] `a b d c`
- [ ] `b a c d`

Calling `step(...)` only creates a coroutine, and nothing runs until it's awaited, so `a` runs to completion before `b` even starts. The JavaScript equivalent prints `b` first, because calling an async function starts it. Tasks are the opt-in version of that eagerness: `create_task` schedules both, they sleep concurrently, and the shorter one finishes first.
:::

:::quiz output
What does this print?

```python
import asyncio

async def fetch(name, delay):
    await asyncio.sleep(delay)
    return name

async def main():
    by_argument = await asyncio.gather(fetch("slow", 0.03), fetch("fast", 0.01))
    by_finish = [await job for job in asyncio.as_completed([fetch("slow", 0.03), fetch("fast", 0.01)])]
    print(by_argument, by_finish)

asyncio.run(main())
```

- [x] `['slow', 'fast'] ['fast', 'slow']`
- [ ] `['fast', 'slow'] ['fast', 'slow']`
- [ ] `['slow', 'fast'] ['slow', 'fast']`
- [ ] `['fast', 'slow'] ['slow', 'fast']`

`gather` is `Promise.all`: it runs everything concurrently and returns the results **in argument order**, however they finish. `as_completed` yields awaitables in **finishing** order, which is what you want for progress output, or for taking the first good result.
:::

:::quiz output
What happens?

```python
import asyncio

async def load():
    return 42

async def main():
    coro = load()
    first = await coro
    second = await coro
    print(first, second)

asyncio.run(main())
```

- [ ] `42 42`
- [ ] `42 None`
- [x] `RuntimeError`
- [ ] `StopIteration`

A promise remembers its result and can be awaited any number of times. A coroutine runs once: awaiting it again raises `RuntimeError: cannot reuse already awaited coroutine`. The promise-like object is a `Task`: `task = asyncio.create_task(load())` can be awaited twice and returns `42` both times.
:::

Review: [Async/Await & asyncio](lesson:async), especially [lazy coroutines](lesson:async#coroutines-are-lazy), [tasks](lesson:async#tasks-start-the-work), [`gather`](lesson:async#gather-promise-all-and-allsettled) and [`as_completed`](lesson:async#timeouts-and-races).

## Cancellation and task groups

Cancellation is an exception, and task groups (3.11+) report failures as groups.

:::quiz output
What does this print?

```python
import asyncio

async def job():
    try:
        await asyncio.sleep(1)
    except asyncio.CancelledError:
        return "swallowed"

async def main():
    task = asyncio.create_task(job())
    await asyncio.sleep(0)
    task.cancel()
    result = await task
    print(result, task.cancelled())

asyncio.run(main())
```

- [x] `swallowed False`
- [ ] `swallowed True`
- [ ] `CancelledError`
- [ ] `None True`

`task.cancel()` raises `CancelledError` inside the task at its `await`, and this coroutine catches it and returns normally. As far as asyncio is concerned, the task simply finished with a result, so it isn't cancelled and `await task` returns `"swallowed"`. `TaskGroup`, `asyncio.timeout` and every caller of `cancel()` rely on the error propagating: catch it only to clean up, then `raise`.
:::

:::quiz output
What does this print?

```python
import asyncio

async def fail():
    raise ValueError("bad")

async def main():
    try:
        async with asyncio.TaskGroup() as tg:
            tg.create_task(fail())
    except ValueError:
        print("caught ValueError")
    except ExceptionGroup as group:
        print("group of", len(group.exceptions))

asyncio.run(main())
```

- [ ] `caught ValueError`
- [x] `group of 1`
- [ ] `ValueError`
- [ ] `group of 0`

A `TaskGroup` always reports failures as an `ExceptionGroup`, even when a single task failed, so `except ValueError:` doesn't match. `Promise.all` rejects with the error itself; with a task group, write `except* ValueError:`.
:::

Review: [Async/Await & asyncio](lesson:async), especially [cancellation](lesson:async#cancellation-an-abortcontroller-in-every-task) and [`TaskGroup`](lesson:async#taskgroup-structured-concurrency).

## Type hints at runtime

Annotations survive at runtime, but they don't do anything there.

:::quiz output
What does this print?

```python
class User:
    name: str
    active: bool = True

print(hasattr(User, "name"), hasattr(User, "active"), list(User.__annotations__))
```

- [ ] `True True ['name', 'active']`
- [x] `False True ['name', 'active']`
- [ ] `False True ['active']`
- [ ] `AttributeError`

A bare annotation records a type and binds nothing, in a class body just as at module level: `name: str` adds `"name"` to `__annotations__` but creates no attribute. Only `active` has a value. That declaration style is exactly what `@dataclass` reads to generate `__init__`.
:::

:::quiz output
What does this print?

```python
from typing import cast

raw = "42"
port = cast(int, raw)
print(port + "0")
```

- [ ] `42`
- [x] `420`
- [ ] `TypeError`
- [ ] `ValueError`

`cast(int, raw)` is TypeScript's `raw as number`: a promise to the type checker that does nothing at runtime. `port` is still the string `"42"`, so `+ "0"` concatenates. To convert, call `int(raw)`. A checker that believed the cast would even have reported `port + "0"` as an error.
:::

:::quiz output
What happens?

```python
from typing import TypedDict

class Movie(TypedDict):
    title: str
    year: int

heat = Movie(title="Heat", year=1995)
print(isinstance(heat, Movie))
```

- [ ] `True`
- [ ] `False`
- [x] `TypeError`
- [ ] `NameError`

A `TypedDict` describes the keys of a plain dict for the type checker, and calling `Movie(...)` just builds a `dict`. There's no runtime class to check against, so `isinstance` raises `TypeError: TypedDict does not support instance and class checks`. Check the keys and value types of outside data yourself, or use pydantic.
:::

Review: [Type Hints for TypeScript Devs](lesson:type-hints), especially [annotations](lesson:type-hints#annotations-typescript-syntax-no-compiler), [casts](lesson:type-hints#narrowing-casts-and-type-guards) and [`TypedDict`](lesson:type-hints#object-shapes-typeddict).

## Pattern matching

Every pattern is a test, and some test less than they appear to.

:::quiz output
What does this print?

```python
def route(event):
    match event:
        case {}:
            return "empty"
        case {"type": "click"}:
            return "click"
    return "other"

print(route({"type": "click", "x": 1}))
```

- [ ] `click`
- [x] `empty`
- [ ] `other`
- [ ] `SyntaxError`

A mapping pattern matches any mapping that has **at least** the keys it lists, and `{}` lists none, so it matches every dict, including this one. Put the specific shapes first, and test for an empty dict with a guard: `case {} if not event:`.
:::

:::quiz output
What does this print?

```python
def first_item(value):
    match value:
        case [first, *_]:
            return first
        case _:
            return "no match"

print(first_item("abc"), first_item(["x", "y"]))
```

- [ ] `a x`
- [x] `no match x`
- [ ] `a no match`
- [ ] `TypeError`

Sequence patterns deliberately skip `str`, `bytes` and `bytearray`, so `"abc"` doesn't match `[first, *_]` even though strings are sequences. Lists and tuples do. Match on `list(text)` if you really want the characters.
:::

:::quiz output
What happens?

```python
class Point:
    def __init__(self, x, y):
        self.x, self.y = x, y

match Point(0, 5):
    case Point(0, y):
        print(f"on the y axis at {y}")
```

- [ ] `on the y axis at 5`
- [x] `TypeError`
- [ ] Nothing: no case matches
- [ ] `SyntaxError`

Positional sub-patterns need `__match_args__` to know which attribute each position stands for, and a plain class doesn't define one, so matching raises `TypeError: Point() accepts 0 positional sub-patterns (2 given)`. Use keywords, `case Point(x=0, y=y):`, or make `Point` a dataclass, which generates `__match_args__` from its fields.
:::

:::quiz output
What does this print?

```python
def kind(value):
    match value:
        case int(n):
            return f"int {n}"
        case bool(b):
            return f"bool {b}"
        case _:
            return "other"

print(kind(True), kind(2.0))
```

- [ ] `bool True other`
- [x] `int True other`
- [ ] `int True int 2.0`
- [ ] `bool True int 2`

Class patterns are `isinstance` checks. `bool` is a subclass of `int`, so `case int(n):` claims `True` before the `bool` case gets a look: put `case bool():` first. And `2.0` is a `float`, not an `int`, so it falls through to `_`, even though a literal `case 2:` would have matched it, since literal patterns compare with `==`.
:::

Review: [Structural Pattern Matching](lesson:pattern-matching), especially [mapping patterns](lesson:pattern-matching#mapping-patterns), [sequence patterns](lesson:pattern-matching#sequence-patterns) and [class patterns](lesson:pattern-matching#class-patterns).

## Batteries included

The standard library makes different choices from date-fns and `JSON.stringify`.

:::quiz output
What does this print?

```python
from datetime import timedelta

wait = timedelta(days=1, hours=2)
print(wait.seconds, wait.total_seconds())
```

- [ ] `93600 93600.0`
- [x] `7200 93600.0`
- [ ] `7200 7200.0`
- [ ] `26 93600.0`

A `timedelta` stores days, seconds and microseconds separately, and `.seconds` is only the seconds **component**: the two hours left after the whole day. `total_seconds()` is the entire duration. Reaching for `.seconds` is a classic bug that waits until a duration first exceeds a day.
:::

:::quiz output
What happens?

```python
from datetime import date, timedelta

print(date(2024, 1, 31) + timedelta(months=1))
```

- [ ] `2024-02-29`
- [ ] `2024-03-02`
- [x] `TypeError`
- [ ] `ValueError`

`timedelta` has no `months` argument, because a month isn't a fixed length: what is January 31 plus one month? Python refuses to guess, and the unknown keyword raises `TypeError`. JavaScript's `setMonth` quietly rolls over to March 2. When you need month arithmetic, choose a policy, or use the `relativedelta` from `python-dateutil`.
:::

:::quiz output
What does this print?

```python
import json

print(json.dumps({"city": "Zürich"}))
```

- [ ] `{"city": "Zürich"}`
- [x] `{"city": "Z\u00fcrich"}`
- [ ] `{'city': 'Zürich'}`
- [ ] `UnicodeEncodeError`

`json.dumps` escapes every non-ASCII character by default, where `JSON.stringify` leaves them alone. The output is valid JSON and decodes back to `"Zürich"`, but pass `ensure_ascii=False` when people will read it.
:::

:::quiz output
What does this print?

```python
from datetime import datetime

stamp = datetime.fromisoformat("2024-06-01T09:30:00Z")
print(stamp.isoformat())
```

- [ ] `2024-06-01T09:30:00Z`
- [x] `2024-06-01T09:30:00+00:00`
- [ ] `2024-06-01T09:30:00.000Z`
- [ ] `ValueError`

`fromisoformat` accepts the `Z` suffix (3.11+) and turns it into a UTC offset, but `isoformat()` always writes the offset out as `+00:00`. Both are valid ISO 8601. If an API insists on `Z`, format it yourself with `strftime("%Y-%m-%dT%H:%M:%SZ")`.
:::

Review: [Batteries Included](lesson:standard-library), especially [`timedelta`](lesson:standard-library#durations-with-timedelta), [parsing and formatting dates](lesson:standard-library#parsing-and-formatting) and [`json`](lesson:standard-library#data-formats-json-csv-and-sqlite3).

## Gotchas that compound

The traps get harder to spot when two of them share a line, or when one hides behind a function call.

:::quiz output
What does this print?

```python
settings = {"retries": 0, "timeout": None}
retries = settings.get("retries") or 3
timeout = settings.get("timeout", 30)
print(retries, timeout)
```

- [ ] `0 30`
- [ ] `3 30`
- [x] `3 None`
- [ ] `0 None`

Two traps in two lines. `or` falls back on any falsy value, so the deliberate `0` becomes `3`; `settings.get("retries", 3)` keeps it. And `get`'s default only applies when the key is **missing**: `"timeout"` is present, with the value `None`, so that's what you get. If `None` should mean "use the default", test for it with `is None`.
:::

:::quiz output
What does this print?

```python
def add_tag(tags, tag):
    tags += (tag,)
    return tags

mine = ("python",)
result = add_tag(mine, "js")
print(mine, result)
```

- [ ] `('python', 'js') ('python', 'js')`
- [x] `('python',) ('python', 'js')`
- [ ] `('python',) ('python',)`
- [ ] `TypeError`

Tuples are immutable, so `tags += (tag,)` builds a new tuple and rebinds the **local** name `tags`, and the caller's tuple can't change. Pass a list instead and the same line would extend the caller's list in place. When one line mutates or rebinds depending on the type, return the new value and let the caller assign it.
:::

:::quiz output
What does this print?

```python
names = ["ada", "linus"]
pairs = zip(names, range(2))
lookup = dict(pairs)
print(lookup, list(pairs))
```

- [ ] `{'ada': 0, 'linus': 1} [('ada', 0), ('linus', 1)]`
- [x] `{'ada': 0, 'linus': 1} []`
- [ ] `{} []`
- [ ] `TypeError`

`zip` returns a one-shot iterator, and `dict(pairs)` consumed it, so `list(pairs)` finds nothing left. There's no error, just an empty result. Materialize it with `list(zip(...))` when you need the pairs twice.
:::

Review: [Gotchas: A Field Guide for JS Brains](lesson:gotchas), especially [`x or default`](lesson:gotchas#x-or-default), [`+=` and aliasing](lesson:gotchas#a-x-versus-a-a-x) and [reading an iterator twice](lesson:gotchas#reading-an-iterator-twice).

## Final challenges

:::challenge id=exam-adv-webhook-summary title="Summarize webhook events" difficulty=easy
A payment provider posts JSON events to your webhook. Write `describe(event)`, which takes the parsed payload and returns a one-line summary. Use `match`:

| Event | Summary |
| --- | --- |
| `{"type": "payment", "amount": <number>, "currency": <str>}` | `"payment of 12.50 EUR"`, with two decimals |
| `{"type": "signup", "user": {"email": <str>}}` | `"signup from ada@example.com"` |
| `{"type": "ping"}` | `"ping"` |
| any other `"type"` string | `"ignored <type> event"` |

Payloads may carry extra keys, which you ignore. Everything else raises `ValueError`: a payload that isn't a dict, a missing or non-string `"type"`, and a `payment` or `signup` event whose fields are missing or of the wrong type. A number means an `int` or a `float`, and `True` is not an amount.

```js
function describe(event) {
  switch (event?.type) {
    case "payment":
      if (typeof event.amount !== "number" || typeof event.currency !== "string") {
        throw new Error("malformed payment");
      }
      return `payment of ${event.amount.toFixed(2)} ${event.currency}`;
    case "signup":
      if (typeof event.user?.email !== "string") throw new Error("malformed signup");
      return `signup from ${event.user.email}`;
    case "ping":
      return "ping";
    default:
      if (typeof event?.type !== "string") throw new Error("not an event");
      return `ignored ${event.type} event`;
  }
}
```

```python starter
def describe(event):
    ...
```

```python solution
def describe(event):
    match event:
        case {"type": "payment", "amount": int() | float() as amount, "currency": str(currency)} if not isinstance(amount, bool):
            return f"payment of {amount:.2f} {currency}"
        case {"type": "signup", "user": {"email": str(email)}}:
            return f"signup from {email}"
        case {"type": "ping"}:
            return "ping"
        case {"type": "payment" | "signup" as kind}:
            raise ValueError(f"malformed {kind} event: {event!r}")
        case {"type": str(kind)}:
            return f"ignored {kind} event"
        case _:
            raise ValueError(f"not a webhook event: {event!r}")
```

```python tests
@test("summarizes a payment with two decimals")
def _():
    eq(describe({"type": "payment", "amount": 12.5, "currency": "EUR"}), "payment of 12.50 EUR")
    eq(describe({"type": "payment", "amount": 3, "currency": "USD"}), "payment of 3.00 USD")

@test("summarizes a signup from the nested user")
def _():
    event = {"type": "signup", "user": {"email": "ada@example.com", "plan": "pro"}}
    eq(describe(event), "signup from ada@example.com")

@test("answers a ping, ignoring extra keys")
def _():
    eq(describe({"type": "ping"}), "ping")
    eq(describe({"type": "ping", "id": "evt_1", "livemode": False}), "ping")
    eq(describe({"type": "payment", "amount": 1, "currency": "EUR", "id": "evt_2"}), "payment of 1.00 EUR")

@test("unknown event types are ignored, not errors")
def _():
    eq(describe({"type": "invoice.created", "id": "evt_3"}), "ignored invoice.created event")

@test("malformed payments and signups raise ValueError")
def _():
    for event in [
        {"type": "payment", "amount": "12.50", "currency": "EUR"},
        {"type": "payment", "amount": 12.5},
        {"type": "signup", "user": "ada@example.com"},
        {"type": "signup", "user": {"name": "Ada"}},
    ]:
        with raises(ValueError):
            describe(event)

@test("True is not an amount")
def _():
    raises(ValueError, describe, {"type": "payment", "amount": True, "currency": "EUR"})

@test("payloads without a string type raise ValueError")
def _():
    for event in [{}, {"type": 7}, ["payment", 12.5], "ping", None]:
        with raises(ValueError):
            describe(event)

@test("uses match with mapping patterns")
def _():
    requires_syntax(ast.MatchMapping, 'match on the payload, e.g. case {"type": "ping"}:')
```

```hint
A mapping pattern matches any dict that has at least the listed keys, and class patterns check the types inside it: `"currency": str(currency)`. Nest another mapping pattern for the signup's user.
```

```hint
`int() | float() as amount` accepts either kind of number, but `bool` is a subclass of `int`, so `True` matches too. Add a guard: `if not isinstance(amount, bool)`.
```

```hint
Order the cases from specific to general: the three well-formed shapes, then `case {"type": "payment" | "signup" as kind}:` for malformed known events, then `case {"type": str(kind)}:` for unknown types, and a final `case _:` that raises.
```
:::

:::challenge id=exam-adv-fix-error-report title="Fix: the error report that lies" difficulty=medium
`top_errors(lines, options=None)` summarizes the errors in a log:

- An error line starts with `"ERROR:"`, and its message is the text after the first colon, stripped.
- It returns `{"total": <number of error lines>, "top": [(message, count), ...]}`, most frequent first, ties in order of first appearance, with at most `options["limit"]` entries. The limit defaults to 3, and `0` is a valid limit that asks for no entries.
- `lines` can be any iterable of strings, including a one-shot generator over a file, and each call is independent of the last.

The starter is a port of the JavaScript below, which works. The port has four bugs, and each one is a JavaScript habit that doesn't carry over to Python. Fix them.

```js
function topErrors(lines, options = {}) {
  const counts = {};
  const errors = lines.filter((line) => line.startsWith("ERROR:"));
  for (const line of errors) {
    const message = line.slice(line.indexOf(":") + 1).trim();
    counts[message] = (counts[message] ?? 0) + 1;
  }
  const limit = options.limit ?? 3;
  const ranking = Object.entries(counts).sort((a, b) => b[1] - a[1]);
  return { total: errors.length, top: ranking.slice(0, limit) };
}
```

```python starter
def top_errors(lines, options={}, counts={}):
    errors = filter(lambda line: line.startswith("ERROR:"), lines)
    for line in errors:
        message = line.split(":", 1)[1].strip()
        counts[message] = counts.get(message, 0) + 1
    limit = options.get("limit") or 3
    ranking = list(counts.items()).sort(key=lambda pair: pair[1], reverse=True)
    return {"total": len(list(errors)), "top": ranking[:limit]}
```

```python solution
from collections import Counter


def top_errors(lines, options=None):
    limit = 3 if options is None else options.get("limit", 3)
    counts = Counter(
        line.split(":", 1)[1].strip()
        for line in lines
        if line.startswith("ERROR:")
    )
    return {"total": counts.total(), "top": counts.most_common(limit)}
```

```python tests
LOG = [
    "INFO: server started",
    "ERROR: db timeout",
    "ERROR: disk full",
    "WARN: slow request",
    "ERROR: cache miss: user 42",
    "ERROR: db timeout",
    "ERROR: cache miss: user 42",
    "ERROR: disk full",
    "ERROR: db timeout",
]
TOP = [("db timeout", 3), ("disk full", 2), ("cache miss: user 42", 2)]

@test("counts the error lines")
def _():
    eq(top_errors(LOG)["total"], 7)

@test("ranks messages by count, ties in order of first appearance")
def _():
    eq(top_errors(LOG)["top"], TOP)

@test("respects the limit, including 0")
def _():
    eq(top_errors(LOG, {"limit": 2})["top"], TOP[:2])
    eq(top_errors(LOG, {"limit": 0})["top"], [], "0 is a real limit, not a missing one")

@test("calls don't share their counts")
def _():
    top_errors(["ERROR: db timeout"])
    eq(top_errors(["ERROR: db timeout"]), {"total": 1, "top": [("db timeout", 1)]}, "the second call saw the first call's errors")

@test("works with a one-shot generator")
def _():
    eq(top_errors(line for line in LOG), {"total": 7, "top": TOP})

@test("no errors, an empty report")
def _():
    eq(top_errors(["INFO: all good"]), {"total": 0, "top": []})
```

```hint
Four JavaScript habits: expecting a default argument to be fresh on every call, using `or` for `??`, using the return value of `sort()`, and reading a `filter()` result twice.
```

```hint
Default `options` to `None`, and read the limit with `options.get("limit", 3)`, which only falls back when the key is missing. Use `sorted()`, which returns a new list.
```

```hint
`collections.Counter` counts in a single pass over the lines: `counts.total()` is the number of error lines, and `counts.most_common(limit)` ranks them, keeping ties in first-seen order.
```
:::

:::challenge id=exam-adv-env-settings title="Typed settings from the environment" difficulty=medium
Environment variables are always strings. Write `from_env(cls, env, prefix="APP_")`, which builds an instance of the dataclass `cls` from `env`, a dict of environment variables (in production you'd pass `os.environ`):

- Each field reads the variable named by `prefix` plus the field name in upper case: `port` reads `APP_PORT`. Other variables are ignored.
- Values are converted according to the field's **type hint**, which you read with `typing.get_type_hints(cls)`. Fields are annotated `str`, `int`, `float` or `bool`.
- Booleans accept `true`/`false`, `yes`/`no`, `on`/`off` and `1`/`0` in any case, and nothing else.
- A missing variable leaves the field's default in place. If the field has no default, raise `KeyError` with the variable's name.
- A value that can't be converted raises `ValueError` whose message starts with the variable's name, such as `"APP_PORT: invalid literal for int() with base 10: 'eighty'"`.

```text
@dataclass
class Settings:
    host: str
    port: int = 8000
    debug: bool = False

from_env(Settings, {"APP_HOST": "db.internal", "APP_DEBUG": "yes"})
  ->  Settings(host='db.internal', port=8000, debug=True)
```

```js
// Types are erased, so the JavaScript version guesses them from the defaults.
function fromEnv(defaults, env, prefix = "APP_") {
  const settings = { ...defaults };
  for (const [key, fallback] of Object.entries(defaults)) {
    const raw = env[prefix + key.toUpperCase()];
    if (raw === undefined) continue;
    settings[key] = typeof fallback === "number" ? Number(raw)
      : typeof fallback === "boolean" ? raw === "true"
      : raw;
  }
  return settings;
}
```

```python starter
import dataclasses
from typing import get_type_hints


def from_env(cls, env, prefix="APP_"):
    values = {}
    for field in dataclasses.fields(cls):
        name = prefix + field.name.upper()
        if name in env:
            values[field.name] = env[name]
    return cls(**values)
```

```python solution
import dataclasses
from typing import get_type_hints

TRUE_WORDS = {"true", "yes", "on", "1"}
FALSE_WORDS = {"false", "no", "off", "0"}


def parse_bool(text):
    word = text.strip().lower()
    if word in TRUE_WORDS:
        return True
    if word in FALSE_WORDS:
        return False
    raise ValueError(f"expected a boolean, got {text!r}")


def has_default(field):
    return field.default is not dataclasses.MISSING or field.default_factory is not dataclasses.MISSING


def from_env(cls, env, prefix="APP_"):
    hints = get_type_hints(cls)
    values = {}
    for field in dataclasses.fields(cls):
        name = prefix + field.name.upper()
        if name not in env:
            if not has_default(field):
                raise KeyError(name)
            continue
        convert = parse_bool if hints[field.name] is bool else hints[field.name]
        try:
            values[field.name] = convert(env[name])
        except ValueError as err:
            raise ValueError(f"{name}: {err}") from err
    return cls(**values)
```

```python tests
from dataclasses import dataclass

@dataclass
class Settings:
    host: str
    port: int = 8000
    debug: bool = False
    ratio: float = 1.0

@dataclass
class Worker:
    queue: str
    concurrency: int = 4
    timeout: float = 5          # an int default, but the hint says float

@test("reads and converts every field")
def _():
    env = {"APP_HOST": "db.internal", "APP_PORT": "5432", "APP_DEBUG": "true", "APP_RATIO": "0.25"}
    settings = from_env(Settings, env)
    eq(settings, Settings("db.internal", 5432, True, 0.25))
    check(type(settings.port) is int, f"port should be an int, got {type(settings.port).__name__}")

@test("missing variables keep the defaults, other variables are ignored")
def _():
    eq(from_env(Settings, {"APP_HOST": "localhost", "APP_SECRET": "hunter2", "PATH": "/usr/bin"}), Settings("localhost"))

@test("a missing required variable raises KeyError naming it")
def _():
    err = raises(KeyError, from_env, Settings, {"APP_PORT": "80"})
    eq(err.args, ("APP_HOST",))

@test("parses booleans instead of truth-testing them")
def _():
    for text in ["false", "False", "0", "no", "OFF"]:
        eq(from_env(Settings, {"APP_HOST": "x", "APP_DEBUG": text}).debug, False, f"APP_DEBUG={text!r}")
    for text in ["true", "TRUE", "1", "yes", "on"]:
        eq(from_env(Settings, {"APP_HOST": "x", "APP_DEBUG": text}).debug, True, f"APP_DEBUG={text!r}")

@test("bad values raise ValueError naming the variable")
def _():
    for env, name in [
        ({"APP_HOST": "x", "APP_PORT": "eighty"}, "APP_PORT"),
        ({"APP_HOST": "x", "APP_DEBUG": "maybe"}, "APP_DEBUG"),
        ({"APP_HOST": "x", "APP_RATIO": "half"}, "APP_RATIO"),
    ]:
        err = raises(ValueError, from_env, Settings, env)
        check(str(err).startswith(name), f"the message should start with {name}, got {str(err)!r}")

@test("converts with the type hint, not the default's type")
def _():
    worker = from_env(Worker, {"APP_QUEUE": "emails", "APP_TIMEOUT": "2.5"})
    eq(worker, Worker("emails", 4, 2.5))

@test("supports a custom prefix and any dataclass")
def _():
    eq(from_env(Worker, {"JOBS_QUEUE": "reports", "JOBS_CONCURRENCY": "8"}, prefix="JOBS_"), Worker("reports", 8))
```

```hint
`typing.get_type_hints(cls)` maps each field name to its annotation, and `dataclasses.fields(cls)` lists the fields in order. Build a dict of keyword arguments and finish with `cls(**values)`.
```

```hint
`bool("false")` is `True`, because every non-empty string is truthy. Parse booleans by comparing the lowercased text with known words, and call `int`, `float` or `str` directly for the other hints.
```

```hint
Leave a missing variable out of the keyword arguments, and the dataclass applies its own default. A field is required when both `field.default` and `field.default_factory` are `dataclasses.MISSING`. Wrap each conversion in `try` and re-raise with `raise ValueError(f"{name}: {err}") from err`.
```
:::

:::challenge id=exam-adv-deploy-report title="Report on a deploy log" difficulty=medium
Write `deploy_report(lines)`, which reads a deploy log and returns one line per finished deploy, in the order the deploys finished:

```text
2024-06-01T09:00:00Z deploy start api
2024-06-01T09:02:00Z deploy start web
2024-06-01T09:04:30Z deploy done api
2024-06-01T11:07:15+02:00 deploy failed web health check timeout

->  ["api: done in 4m30s", "web: failed after 5m15s (health check timeout)"]
```

- Every line starts with an ISO 8601 timestamp that ends in `Z` or carries an offset. Blank lines are skipped.
- `deploy start <service>` starts a deploy. `deploy done <service>` and `deploy failed <service> <reason>` finish it, where the reason is one or more words.
- Durations are whole minutes and seconds, even for very long deploys: `4m30s`, `75m05s`, `1470m00s`.
- A line with any other shape, or one that finishes a deploy that never started, raises `ValueError` whose message includes `line <n>`, counting from 1. An invalid timestamp raises `ValueError` too.

```js
function deployReport(lines) {
  const started = new Map();
  const report = [];
  lines.forEach((line, i) => {
    if (!line.trim()) return;
    const [stamp, kind, action, service, ...reason] = line.trim().split(/\s+/);
    if (kind !== "deploy") throw new Error(`line ${i + 1}: unexpected ${line}`);
    // ...an if/else chain on action, reason.length and started.has(service)
  });
  return report;
}
```

```python starter
from datetime import datetime


def deploy_report(lines):
    ...
```

```python solution
from datetime import datetime


def duration(start, end):
    minutes, seconds = divmod(int((end - start).total_seconds()), 60)
    return f"{minutes}m{seconds:02d}s"


def deploy_report(lines):
    started = {}
    report = []
    for line_no, line in enumerate(lines, start=1):
        match line.split():
            case []:
                continue
            case [stamp, "deploy", "start", service]:
                started[service] = datetime.fromisoformat(stamp)
            case [stamp, "deploy", "done", service] if service in started:
                took = duration(started.pop(service), datetime.fromisoformat(stamp))
                report.append(f"{service}: done in {took}")
            case [stamp, "deploy", "failed", service, *reason] if reason and service in started:
                took = duration(started.pop(service), datetime.fromisoformat(stamp))
                report.append(f"{service}: failed after {took} ({' '.join(reason)})")
            case _:
                raise ValueError(f"line {line_no}: unexpected {line!r}")
    return report
```

```python tests
@test("reports a finished deploy with its duration")
def _():
    log = ["2024-06-01T09:00:00Z deploy start api", "2024-06-01T09:04:30Z deploy done api"]
    eq(deploy_report(log), ["api: done in 4m30s"])

@test("reports a failure with its reason")
def _():
    log = ["2024-06-01T09:02:00Z deploy start web", "2024-06-01T09:07:15Z deploy failed web health check timeout"]
    eq(deploy_report(log), ["web: failed after 5m15s (health check timeout)"])

@test("lists deploys in the order they finished, skipping blank lines")
def _():
    log = [
        "2024-06-01T09:00:00Z deploy start api",
        "2024-06-01T09:01:00Z deploy start web",
        "",
        "2024-06-01T09:03:00Z deploy done web",
        "   ",
        "2024-06-01T09:04:00Z deploy done api",
    ]
    eq(deploy_report(log), ["web: done in 2m00s", "api: done in 4m00s"])

@test("compares timestamps across UTC offsets")
def _():
    log = ["2024-06-01T11:00:00+02:00 deploy start api", "2024-06-01T09:02:00Z deploy done api"]
    eq(deploy_report(log), ["api: done in 2m00s"])

@test("durations count whole minutes, past an hour and past a day")
def _():
    hour = ["2024-06-01T09:00:00Z deploy start api", "2024-06-01T10:15:05Z deploy done api"]
    eq(deploy_report(hour), ["api: done in 75m05s"])
    day = ["2024-06-01T09:00:00Z deploy start db", "2024-06-02T09:30:00Z deploy failed db stuck"]
    eq(deploy_report(day), ["db: failed after 1470m00s (stuck)"], "timedelta.seconds is only the seconds part: use total_seconds()")

@test("rejects lines it doesn't understand, naming the line")
def _():
    for log, line_no in [
        (["2024-06-01T09:00:00Z deploy start api", "2024-06-01T09:01:00Z deploy launch api"], 2),
        (["2024-06-01T09:00:00Z deploy start api", "2024-06-01T09:01:00Z deploy failed api"], 2),
        (["2024-06-01T09:00:00Z deploy done api"], 1),
    ]:
        err = raises(ValueError, deploy_report, log)
        check(f"line {line_no}" in str(err), f"expected 'line {line_no}' in the message, got {str(err)!r}")

@test("an invalid timestamp raises ValueError")
def _():
    raises(ValueError, deploy_report, ["yesterday deploy start api"])

@test("an empty log gives an empty report")
def _():
    eq(deploy_report([]), [])

@test("uses match on the split line")
def _():
    requires_syntax(ast.MatchSequence, "match on line.split() with sequence patterns")
```

```hint
`match line.split():` with sequence patterns does the parsing: `case [stamp, "deploy", "start", service]:` checks the length and the literal words, and binds the rest. `case []:` catches blank lines.
```

```hint
Guards keep the error handling in one place: `case [stamp, "deploy", "done", service] if service in started:`. A finish without a start then falls through, like any other unknown shape, to a final `case _:` that raises with the line number from `enumerate(lines, start=1)`.
```

```hint
`datetime.fromisoformat` handles `Z` and offsets, and subtracting two aware datetimes works across offsets. Format the `timedelta` with `divmod(int(delta.total_seconds()), 60)`, because `.seconds` drops whole days.
```
:::

:::challenge id=exam-adv-fetch-with-deadline title="Fetch with a limit and a deadline" difficulty=hard
Write `async def fetch_all(fetch, urls, *, limit, timeout)`, a status checker. It calls the async function `fetch(url)` for every URL, **concurrently**, and returns a dict mapping each URL to a result, in the order of `urls`:

- At most `limit` calls are in flight at once. Raise `ValueError` if `limit` is less than 1.
- Each call gets `timeout` seconds, counted from when **it** starts: time spent waiting for a free slot doesn't count. A call that runs out of time gives `"timeout"`.
- A call that raises any other exception gives `f"failed: {ExceptionName}"`, such as `"failed: ConnectionError"`.
- Otherwise, `fetch` returns a response dict. Classify it with `match`, ignoring extra keys:

| Response | Result |
| --- | --- |
| `{"status": 200, "body": <str>}` | the body |
| `{"status": 301 or 302, "location": <str>}` | `"redirect to <location>"` |
| `{"status": <int, 400 or more>}` | `"error <status>"` |
| anything else | `"invalid response"` |

```js
import pLimit from "p-limit";

async function fetchAll(fetch, urls, { limit, timeout }) {
  const run = pLimit(limit);
  const results = await Promise.all(urls.map((url) => run(async () => {
    try {
      return classify(await fetch(url, { signal: AbortSignal.timeout(timeout * 1000) }));
    } catch (err) {
      return err.name === "TimeoutError" ? "timeout" : `failed: ${err.name}`;
    }
  })));
  return Object.fromEntries(urls.map((url, i) => [url, results[i]]));
}
```

```python starter
import asyncio


async def fetch_all(fetch, urls, *, limit, timeout):
    results = {}
    for url in urls:
        response = await fetch(url)
        results[url] = response.get("body")
    return results
```

```python solution
import asyncio


def classify(response):
    match response:
        case {"status": 200, "body": str(body)}:
            return body
        case {"status": 301 | 302, "location": str(location)}:
            return f"redirect to {location}"
        case {"status": int(code)} if code >= 400:
            return f"error {code}"
        case _:
            return "invalid response"


async def fetch_all(fetch, urls, *, limit, timeout):
    if limit < 1:
        raise ValueError("limit must be at least 1")
    slots = asyncio.Semaphore(limit)

    async def fetch_one(url):
        async with slots:
            try:
                async with asyncio.timeout(timeout):
                    response = await fetch(url)
            except TimeoutError:
                return "timeout"
            except Exception as exc:
                return f"failed: {type(exc).__name__}"
        return classify(response)

    results = await asyncio.gather(*(fetch_one(url) for url in urls))
    return dict(zip(urls, results))
```

```python tests
import asyncio

def fake_fetch(routes):
    """routes maps each url to (delay in seconds, response dict or exception)."""
    stats = {"active": 0, "peak": 0, "calls": 0}

    async def fetch(url):
        stats["calls"] += 1
        stats["active"] += 1
        stats["peak"] = max(stats["peak"], stats["active"])
        try:
            delay, outcome = routes[url]
            await asyncio.sleep(delay)
            if isinstance(outcome, Exception):
                raise outcome
            return outcome
        finally:
            stats["active"] -= 1

    return fetch, stats

async def finish(coro):
    async with asyncio.timeout(2):      # a safety net for code that waits forever
        return await coro

@test("classifies each kind of response")
async def _():
    routes = {
        "/": (0, {"status": 200, "body": "<h1>Home</h1>", "headers": {}}),
        "/old": (0, {"status": 301, "location": "/new"}),
        "/missing": (0, {"status": 404}),
        "/broken": (0, {"status": 500, "body": "oops"}),
        "/empty": (0, {"status": 200}),
        "/stringly": (0, {"status": "200", "body": "hi"}),
        "/weird": (0, {"ok": True}),
    }
    fetch, stats = fake_fetch(routes)
    eq(await finish(fetch_all(fetch, list(routes), limit=3, timeout=1)), {
        "/": "<h1>Home</h1>",
        "/old": "redirect to /new",
        "/missing": "error 404",
        "/broken": "error 500",
        "/empty": "invalid response",
        "/stringly": "invalid response",
        "/weird": "invalid response",
    })

@test("keeps the order of urls, whichever answers first")
async def _():
    fetch, stats = fake_fetch({
        "/slow": (0.03, {"status": 200, "body": "slow"}),
        "/fast": (0, {"status": 200, "body": "fast"}),
    })
    result = await finish(fetch_all(fetch, ["/slow", "/fast"], limit=2, timeout=1))
    eq(list(result.items()), [("/slow", "slow"), ("/fast", "fast")])

@test("a call that runs out of time becomes 'timeout'")
async def _():
    fetch, stats = fake_fetch({
        "/hang": (0.5, {"status": 200, "body": "too late"}),
        "/ok": (0, {"status": 200, "body": "ok"}),
    })
    eq(await finish(fetch_all(fetch, ["/hang", "/ok"], limit=2, timeout=0.05)), {"/hang": "timeout", "/ok": "ok"})

@test("a call that raises becomes 'failed: <exception>'")
async def _():
    fetch, stats = fake_fetch({
        "/down": (0, ConnectionError("refused")),
        "/ok": (0, {"status": 200, "body": "ok"}),
    })
    result = await finish(fetch_all(fetch, ["/down", "/ok"], limit=2, timeout=1))
    eq(result, {"/down": "failed: ConnectionError", "/ok": "ok"})

@test("never has more than limit calls in flight")
async def _():
    routes = {f"/page/{n}": (0.01, {"status": 200, "body": str(n)}) for n in range(6)}
    fetch, stats = fake_fetch(routes)
    await finish(fetch_all(fetch, list(routes), limit=2, timeout=1))
    eq(stats["peak"], 2, "peak number of calls in flight")
    eq(stats["calls"], 6)

@test("the timeout covers each call, not the wait for a slot")
async def _():
    routes = {f"/report/{n}": (0.02, {"status": 200, "body": "ok"}) for n in range(5)}
    fetch, stats = fake_fetch(routes)
    result = await finish(fetch_all(fetch, list(routes), limit=1, timeout=0.06))
    eq(set(result.values()), {"ok"}, "each call takes 0.02 s, well inside its own 0.06 s budget")

@test("a limit below 1 raises ValueError")
async def _():
    fetch, stats = fake_fetch({})
    with raises(ValueError):
        await finish(fetch_all(fetch, ["/"], limit=0, timeout=1))

@test("no urls, no calls")
async def _():
    fetch, stats = fake_fetch({})
    eq(await finish(fetch_all(fetch, [], limit=3, timeout=1)), {})
    eq(stats["calls"], 0)

@test("classifies responses with match")
def _():
    requires_syntax(ast.MatchMapping, 'match on the response dict, e.g. case {"status": 200, "body": str(body)}:')
```

```hint
Wrap each URL in a small inner `async def` and `gather` them all. `gather` returns results in argument order, so `dict(zip(urls, results))` keeps the order of `urls`. An `asyncio.Semaphore(limit)` entered with `async with` bounds the calls in flight.
```

```hint
Put `async with asyncio.timeout(timeout):` (3.11+) **inside** the semaphore's block, so each call's clock starts when the call does. Catch `TimeoutError` before `Exception`: it's a subclass, and the first matching `except` clause wins.
```

```hint
Classify with mapping and class patterns: `case {"status": 200, "body": str(body)}:`, `case {"status": 301 | 302, "location": str(location)}:`, then `case {"status": int(code)} if code >= 400:`, and finally `case _:`.
```
:::
