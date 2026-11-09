---
title: Generators & Coroutines in Depth
part: Functions & Generators
summary: send, throw and close, yield from, push pipelines, cleanup, @contextmanager's internals and async generators.
minutes: 45
---

The core course used generators as lazy iterators ([Iterators & Generators](lesson:iterators-and-generators)). This lesson covers the other half of the API. A generator is a suspended stack frame with a two-way door: `next()` and `send()` resume it with a value, `throw()` resumes it with an exception, and `close()` asks it to finish. That makes every generator a **coroutine**, a function that pauses in the middle and is driven from outside, and it's the machinery `@contextmanager` is built on and asyncio grew out of.

JavaScript has the same machinery (`gen.next(v)`, `gen.throw(e)`, `gen.return(v)`), so the shapes will look familiar. The differences are in the details that bite: priming, `GeneratorExit`, and above all *when cleanup actually runs*.

## The generator state machine

:::compare
```js
function* worker() {
  try {
    while (true) {
      const job = yield "ready";
      console.log(`got ${job}`);
    }
  } finally {
    console.log("cleanup");
  }
}

const w = worker();
w.next("lost");     // { value: "ready", done: false }: "lost" is dropped
w.next("job-1");    // logs "got job-1"
w.return("bye");    // logs "cleanup", then { value: "bye", done: true }
```
```python run
from inspect import getgeneratorstate


def worker():
    try:
        while True:
            job = yield "ready"
            print(f"got {job}")
    finally:
        print("cleanup")


w = worker()
print(getgeneratorstate(w))    # GEN_CREATED: nothing has run yet
print(next(w))                 # prime: run to the first yield
w.send("job-1")
print(w.close(), getgeneratorstate(w))
```
:::

A generator object moves through four states, which `inspect.getgeneratorstate()` reports: `GEN_CREATED` (no code has run), `GEN_RUNNING` (executing right now), `GEN_SUSPENDED` (paused at a `yield`) and `GEN_CLOSED` (finished by returning, raising or being closed). Four operations move it along:

| Python | JavaScript | The paused `yield` evaluates to |
| --- | --- | --- |
| `next(gen)` | `gen.next()` | `None` |
| `gen.send(value)` | `gen.next(value)` | `value` |
| `gen.throw(exc)` | `gen.throw(exc)` | nothing: `exc` is raised there |
| `gen.close()` | `gen.return(value)` | nothing: `GeneratorExit` is raised there |

Each call runs the generator until its next `yield` and returns the yielded value, or raises `StopIteration` (with the return value in `.value`) if the generator finishes instead. `close()` is the exception: it returns `None`, or since 3.13, whatever the generator returns while handling `GeneratorExit`. Three differences from JavaScript matter:

1. **Priming is enforced.** A fresh generator isn't paused at a `yield`, so there's nowhere for a sent value to land. JavaScript silently drops the argument of the first `next(v)`; Python raises `TypeError` for any `send()` of a value other than `None`.
2. **`close()` isn't `return(value)`.** JS's `return(v)` finishes the generator with a value you pick. Python's `close()` raises `GeneratorExit` at the paused `yield`, runs the `finally` blocks, and insists the generator doesn't yield again.
3. **An exhausted generator raises every time.** JS keeps answering `{ value: undefined, done: true }`; every later `next()` on a finished Python generator raises `StopIteration` again.

A suspended generator is a real frame, so you can look inside it. `gi_frame` exposes the paused line and the local variables, and it's set to `None` once the generator closes:

```python run
def countdown(n):
    while n > 0:
        received = yield n
        n -= 1


gen = countdown(3)
next(gen)
next(gen)
print(gen.gi_frame.f_lineno, gen.gi_frame.f_locals)   # paused, locals intact
print(gen.gi_suspended, gen.gi_running)
gen.close()
print(gen.gi_frame)
```

:::quiz output
What does this print?

```python
log = []


def echo():
    while True:
        message = yield
        log.append(message)


e = echo()
try:
    e.send("hello")
except TypeError:
    log.append("TypeError")
next(e)
e.send("hi")
print(log)
```

- [ ] `['hello', 'hi']`
- [x] `['TypeError', 'hi']`
- [ ] `['TypeError', None, 'hi']`
- [ ] `['hi']`

Sending a value to a generator that hasn't started raises `TypeError` (JavaScript would silently drop it) and leaves the generator unstarted. `next(e)` then runs it to the first `yield`, which records nothing until it's resumed, and `"hi"` arrives at that `yield`.
:::

## `send()` and priming: generators as consumers

:::compare
```js
function* runningAverage() {
  let total = 0, count = 0, average;
  while (true) {
    const value = yield average;
    total += value;
    count += 1;
    average = total / count;
  }
}

const avg = runningAverage();
avg.next();                  // prime: run to the first yield
avg.next(10).value;          // 10
avg.next(20).value;          // 15
```
```python
@primed
def running_average():
    total = count = 0
    average = None
    while True:
        value = yield average
        total += value
        count += 1
        average = total / count


avg = running_average()      # the decorator primed it
avg.send(10)                 # 10.0
avg.send(20)                 # 15.0
```
:::

A generator that mostly *receives* values is a **consumer coroutine**. `value = yield average` does two jobs: it hands `average` to whoever resumed the generator, and when the generator resumes, the `yield` expression evaluates to the value they sent. Forgetting to prime is the classic bug, so coroutine code usually wraps the generator function in a decorator that calls `next()` for you:

```python run
import functools


def primed(gen_fn):
    @functools.wraps(gen_fn)
    def start(*args, **kwargs):
        gen = gen_fn(*args, **kwargs)
        next(gen)                       # run to the first yield
        return gen

    return start


@primed
def running_average():
    total = count = 0
    average = None
    while True:
        value = yield average
        total += value
        count += 1
        average = total / count


avg = running_average()
print([avg.send(reading) for reading in [10, 20, 60]])
```

:::gotcha The value of `yield` is `None` unless you `send()` one
`next(gen)` is `gen.send(None)`. So iterating a consumer with `for`, or calling `next()` on it, feeds it `None`, and `total += value` fails with `TypeError: unsupported operand type(s) for +=: 'int' and 'NoneType'`. Give each generator one role: a producer you iterate, or a consumer you `send()` to.
:::

## `throw()`, `close()` and `GeneratorExit`

:::compare
```js
function* job() {
  try {
    yield "step 1";
    yield "step 2";
  } catch (err) {
    console.log(`recovered: ${err.message}`);
    yield "fallback";
  } finally {
    console.log("released");
  }
}

const j = job();
j.next();                         // { value: "step 1" }
j.throw(new Error("timed out"));  // logs, then { value: "fallback" }
j.return();                       // logs "released"
```
```python run
def job():
    try:
        yield "step 1"
        yield "step 2"
    except TimeoutError as err:
        print(f"recovered: {err}")
        yield "fallback"
    finally:
        print("released")


j = job()
next(j)
print(j.throw(TimeoutError("timed out")))
j.close()
```
:::

`throw(exc)` raises `exc` at the paused `yield`, exactly like JavaScript's. If the generator catches it and yields again, `throw()` returns that value; if not, the exception propagates out of `throw()` and the generator is finished. Pass an exception instance: the old three-argument form, `throw(type, value, traceback)`, has been deprecated since 3.12.

`close()` is `throw(GeneratorExit())` with rules attached. `GeneratorExit` inherits from `BaseException`, not `Exception`, so a well-meant `except Exception:` inside the generator lets it through, and the `finally` blocks run as the frame unwinds. A generator may catch `GeneratorExit` to clean up, but then it must finish: yielding again makes `close()` raise `RuntimeError: generator ignored GeneratorExit`. And since 3.13, a value the generator *returns* while handling `GeneratorExit` comes back from `close()`, which gives consumer coroutines a tidy way to hand over a final result:

```python run
def collector():
    items = []
    try:
        while True:
            item = yield
            items.append(item)
    except GeneratorExit:
        return items              # 3.13+: close() returns this


c = collector()
next(c)
c.send("a")
c.send("b")
print(c.close())


def stubborn():
    try:
        yield "working"
    except GeneratorExit:
        yield "still working"     # yielding after GeneratorExit is an error


s = stubborn()
next(s)
try:
    s.close()
except RuntimeError as err:
    print("RuntimeError:", err)
```

:::gotcha `except BaseException:` and a bare `except:` swallow `GeneratorExit`
They catch it along with everything else, and if the loop then reaches another `yield`, closing the generator raises `RuntimeError`. Inside a generator, catch `Exception` (which excludes `GeneratorExit`), or re-raise `GeneratorExit` explicitly.
:::

:::quiz output
What does this print?

```python
log = []


def guarded():
    try:
        yield 1
    except Exception:
        log.append("caught")
    finally:
        log.append("finally")


g = guarded()
next(g)
g.close()
print(log)
```

- [ ] `['caught', 'finally']`
- [x] `['finally']`
- [ ] `['caught']`
- [ ] `RuntimeError`

`close()` raises `GeneratorExit`, which derives from `BaseException` and slips past `except Exception`. The `finally` block runs as the frame unwinds, and since the generator doesn't yield again, `close()` succeeds quietly.
:::

## When cleanup runs

:::compare
```js
function* rows() {
  try {
    yield* ["a", "b", "c"];
  } finally {
    console.log("closed");
  }
}

const it = rows();
for (const row of it) break;  // for...of calls it.return(): "closed"
console.log("after loop");
```
```python run
def rows():
    try:
        yield from ["a", "b", "c"]
    finally:
        print("closed")


it = rows()
for row in it:
    break                     # the generator is left suspended
print("after loop")
it.close()                    # cleanup runs now
```
:::

JavaScript's `for...of` calls the iterator's `return()` when you `break`, `return` or throw out of the loop, so a generator's `finally` runs immediately. Python's `for` does nothing of the sort: it simply stops calling `next()`. The generator stays suspended, holding whatever its `try` block opened, until something calls `close()` or the object is garbage-collected (a generator's finaliser calls `close()`). CPython's reference counting usually hides the difference: in `for row in rows(): break`, the loop holds the only reference, so the generator is finalised as the loop ends. Keep a reference, as above, or run on PyPy with its tracing garbage collector, and the cleanup waits.

When cleanup has to happen at a known point, say so. `contextlib.closing()` calls `close()` when its `with` block exits:

```python run
from contextlib import closing


def read_rows(name):
    print(f"  open {name}")
    try:
        yield from ["a", "b", "c"]
    finally:
        print(f"  close {name}")


with closing(read_rows("orders.csv")) as rows:
    for row in rows:
        print(row)
        break
    print("still inside the with")
print("after the with")
```

:::quiz output
What does this print?

```python
log = []


def rows():
    try:
        yield from "abc"
    finally:
        log.append("closed")


it = rows()
for row in it:
    break
log.append("after loop")
it = None
print(log)
```

- [ ] `['closed', 'after loop']`
- [x] `['after loop', 'closed']`
- [ ] `['after loop']`
- [ ] `['closed']`

`break` leaves the generator suspended, because `it` still refers to it. Only `it = None` drops the last reference, and CPython finalises the generator on the spot, which closes it and runs the `finally`. JavaScript would log `closed` first.
:::

:::tip Don't hang important cleanup on a generator's `finally` alone
For a resource that must be released promptly (a file, a lock, a database cursor), open it with `with` in the code that drives the loop, or hand the generator to `closing()`. A generator's `finally` is a safety net, and on some interpreters it runs whenever the garbage collector gets round to it.
:::

## `yield from`: full delegation

:::compare
```js
function* inner() {
  const received = yield "inner ready";
  return `inner got ${received}`;
}

function* outer() {
  const result = yield* inner();  // forwards next(v), throw and return
  yield result;
}

const o = outer();
o.next();         // { value: "inner ready" }
o.next("ping");   // { value: "inner got ping" }
```
```python run
def inner():
    received = yield "inner ready"
    return f"inner got {received}"


def outer():
    result = yield from inner()   # forwards send, throw and close
    yield result


o = outer()
print(next(o))
print(o.send("ping"))
```
:::

`yield from sub` turns the outer generator into a transparent pipe to `sub` until `sub` finishes, then evaluates to `sub`'s return value. Transparent means everything passes through. Values `sub` yields go straight to the caller, `send()` values go straight into `sub`, `throw()` raises inside `sub` (and if `sub` handles it, the delegation carries on), and `close()` closes `sub` first, then the outer generator. The outer generator only sees an exception if `sub` lets it escape. It's the contract JavaScript's `yield*` has, and while a delegation is in progress, `outer.gi_yieldfrom` points at the subgenerator.

```python run
def worker(name):
    try:
        while True:
            try:
                task = yield
                print(f"  {name} ran {task}")
            except ValueError as err:
                print(f"  {name} skipped a bad task: {err}")
    finally:
        print(f"  {name} shut down")


def supervisor():
    try:
        yield from worker("w1")
    finally:
        print("  supervisor shut down")


s = supervisor()
next(s)
s.send("build")
s.throw(ValueError("missing input"))    # handled inside the worker
s.send("test")
s.close()                               # closes the worker, then the supervisor
```

This composability is what made generators a foundation for concurrency. Before `async def` existed (3.5), asyncio coroutines were generators composed with `yield from`, and the event loop's tasks drove them by calling `send()` and `throw()`. `await` is the same delegation with a stricter type ([Async](lesson:async)).

:::deep What `yield from` expands to
PEP 380 spells out the full expansion. It's about forty lines, nearly all of it plumbing for `throw()`, `close()` and plain iterators that have no `send()` method. Stripped to the core, `result = yield from sub` is:

```python
def delegate(sub):
    try:
        value = next(sub)
    except StopIteration as stop:
        return stop.value                 # sub finished without yielding
    while True:
        sent = yield value                # hand the value out, take one in
        try:
            value = sub.send(sent)
        except StopIteration as stop:
            return stop.value             # becomes the value of the expression
```

The real thing adds the rest: an exception thrown in is forwarded with `sub.throw()`, and `GeneratorExit` closes `sub` before re-raising. It also starts with `iter(sub)`, and when the value sent is `None` it calls `next()` instead of `send()`, which is why `yield from` works on any iterable, `range(3)` included.
:::

## Push pipelines: coroutines all the way down

:::compare
```js
// RxJS: the source pushes, each operator forwards downstream
lines$
  .pipe(
    filter((line) => line.includes("ERROR")),
    map((line) => line.toUpperCase()),
  )
  .subscribe((line) => errors.push(line));
```
```python
# coroutines: the source pushes, each stage send()s downstream
pipeline = grep("ERROR", upper(collect(errors)))


for line in lines:
    pipeline.send(line)
pipeline.close()
```
:::

Generator pipelines are usually **pull** pipelines: the consumer calls `next()` and each stage pulls from the one before it ([lazy pipelines](lesson:iterators-and-generators#lazy-pipelines-and-the-es2025-iterator-helpers) in the core course). Turn the arrows around and you get a **push** pipeline, the shape of RxJS observables and Node's `'data'` events: the source calls `send()` on the first stage, and every stage is a primed consumer that sends its output on to a target.

The trade-offs mirror the JavaScript ones. A pull pipeline stops early for free (just stop pulling) but fans out awkwardly: two consumers of one iterator need `tee`, and its buffer. A push pipeline fans out for free (send each item to two targets) and signals the end of the stream with `close()`, which each stage passes downstream from a `finally` so buffered work gets flushed. [The first challenge](#gen-batcher) builds a stage like that.

```python run
def primed(gen_fn):
    def start(*args):
        gen = gen_fn(*args)
        next(gen)
        return gen

    return start


@primed
def grep(pattern, target):
    while True:
        line = yield
        if pattern in line:
            target.send(line)


@primed
def broadcast(*targets):
    while True:
        item = yield
        for target in targets:
            target.send(item)


@primed
def collect(into):
    while True:
        into.append((yield))


errors, everything = [], []
pipeline = broadcast(grep("ERROR", collect(errors)), collect(everything))
for line in ["INFO boot", "ERROR disk full", "INFO retry", "ERROR timeout"]:
    pipeline.send(line)
print(errors, len(everything))
```

## How `@contextmanager` works

[Context Managers](lesson:context-managers#contextmanager-a-generator-does-the-work) showed `@contextmanager` from the outside: code before `yield` is setup, code after it is teardown. Inside, it's a few dozen lines of generator driving, and every rule from this lesson shows up:

1. Calling the decorated function creates a generator and wraps it in a `_GeneratorContextManager` object, with `__enter__` and `__exit__` methods ([Writing a context manager class](lesson:context-managers#writing-a-context-manager-class)).
2. `__enter__` calls `next()` on the generator and returns the yielded value, which is what `as` binds. A generator that finishes without yielding is a `RuntimeError`.
3. On a clean exit, `__exit__` calls `next()` again and expects `StopIteration`. A second `yield` is a `RuntimeError`.
4. If the block raised, `__exit__` calls `gen.throw(exc)`, so the exception surfaces at the `yield`, inside the generator's `try`. If the generator finishes without re-raising, `__exit__` returns `True` and the exception is **suppressed**. If it re-raises the same exception, that propagates as usual; if it raises a different one, the new one replaces it.

```python run
from contextlib import contextmanager


@contextmanager
def swallow(*errors):
    try:
        yield
    except errors as err:
        print(f"  suppressed {err!r}")    # finishing normally suppresses


@contextmanager
def twice():
    yield 1
    yield 2


with swallow(KeyError):
    {}["missing"]
print("carried on")

try:
    with twice():
        pass
except RuntimeError as err:
    print("RuntimeError:", err)
```

:::gotcha A `@contextmanager` object is single-use
Each call creates one generator, and a generator runs once, so entering the same manager object a second time fails. Call the function again for each `with` (write `with timer():` every time instead of storing `t = timer()` and reusing `t`). Used as a decorator, the manager takes care of this itself: it builds a fresh generator for every call.
:::

[The last challenge](#gen-contextmanager) has you write `contextmanager` from scratch.

## itertools recipes

:::compare
```js
_.uniqBy(users, "email");             // first user per email
_.partition(orders, (o) => o.paid);   // [paid, unpaid]
_.flatten([[1, 2], [3]]);             // [1, 2, 3]
_.chunk(rows, 100);                   // arrays of 100
// sliding windows, round-robin: write them yourself
```
```python
unique_everseen(users, key=itemgetter("email"))   # a recipe
partition(lambda o: o["paid"], orders)            # a recipe: (unpaid, paid)
chain.from_iterable([[1, 2], [3]])                # built in
batched(rows, 100)                                # built in, 3.12+
sliding_window(readings, 3)                       # a recipe
```
:::

The [`itertools` documentation](https://docs.python.org/3/library/itertools.html#itertools-recipes) ends with a page of **recipes**: short generator functions built from the module's primitives. A few have graduated into the module itself (`pairwise` in 3.10, `batched` in 3.12), and the third-party `more-itertools` package ships all of them and many more, so reach for it before hand-rolling. The recipes are worth reading as generator technique: each is a few lines long, lazy, and happy with infinite input.

```python run
from collections import deque
from itertools import filterfalse, islice, tee


def unique_everseen(iterable, key=None):
    seen = set()
    for item in iterable:
        marker = item if key is None else key(item)
        if marker not in seen:
            seen.add(marker)
            yield item


def partition(predicate, iterable):
    falses, trues = tee(iterable)
    return filterfalse(predicate, falses), filter(predicate, trues)


def sliding_window(iterable, n):
    iterator = iter(iterable)
    window = deque(islice(iterator, n - 1), maxlen=n)
    for item in iterator:
        window.append(item)
        yield tuple(window)


print(list(unique_everseen("AAAABBBCCDAABBB")))
letters, digits = partition(str.isdigit, ["a", "1", "b", "22"])
print(list(letters), list(digits))
print(list(sliding_window(range(6), 3)))
```

`sliding_window` primes its `deque` with the first `n - 1` items, then each new item pushes the oldest one out (the core course's [sliding-window challenge](lesson:iterators-and-generators#iter-sliding-window) builds the same thing). `unique_everseen` is the lazy `_.uniqBy`: it remembers every key it has seen, so its memory grows with the number of distinct keys, unlike its sibling recipe `unique_justseen`, which only collapses neighbours. `flatten` is `chain.from_iterable` for one level, or a recursive `yield from` for any depth. And `roundrobin` is [the second challenge](#gen-roundrobin).

:::gotcha `partition` returns the false items first
lodash's `_.partition` returns `[truthy, falsy]`. The itertools recipe, and `more_itertools.partition`, return `(falsy, truthy)`: `filterfalse` first, then `filter`. Unpack accordingly. The recipe also calls the predicate twice per item, once in each branch, so cache an expensive one.
:::

## `tee` and its caveats

:::compare
```js
// JS can't clone an iterator: materialise it
const readings = [...sensorReadings()];
const peak = Math.max(...readings);
const deltas = readings.slice(1).map((r, i) => r - readings[i]);
```
```python
# tee splits one iterator into independent copies
for_peak, for_deltas = tee(sensor_readings())
peak = max(for_peak)
deltas = [b - a for a, b in pairwise(for_deltas)]
```
:::

`tee(iterator, n=2)` returns `n` iterators that each see every item, while the source is read only once. It works by buffering: an item one copy has pulled is kept until every copy has seen it. So its memory cost depends on how far apart the copies drift. Copies that advance in lockstep, interleaved or zipped together, keep the buffer tiny. The example above is the opposite case: `max()` runs `for_peak` to the end before `for_deltas` starts, so `tee` holds every reading and is just a slower `list()`. The rules:

- **When one copy runs ahead of the others, use `list()`.** It's simpler and faster for the same memory.
- **Don't touch the original iterator after teeing.** Items you pull from it directly never reach the copies.
- **Side effects happen once per item**, when the first copy reaches it. The others replay the buffer.

```python run
from itertools import tee


def readings():
    for value in [3, 5, 4, 8]:
        print(f"  read {value}")
        yield value


fast, slow = tee(readings())
print(next(fast), next(fast))    # pulls 3 and 5 from the source
print(next(slow))                # replayed from the buffer: no read
print(list(slow), list(fast))
```

:::quiz output
What does this print?

```python
from itertools import tee

numbers = iter([1, 2, 3, 4])
left, right = tee(numbers)
next(left)
next(numbers)
print(list(left), list(right))
```

- [ ] `[2, 3, 4] [1, 2, 3, 4]`
- [x] `[3, 4] [1, 3, 4]`
- [ ] `[3, 4] [3, 4]`
- [ ] `[2, 3, 4] [2, 3, 4]`

`next(left)` pulls `1` from the source and buffers it for `right`. `next(numbers)` then takes `2` straight from the source, behind `tee`'s back, so neither copy ever sees it. `left` continues with `3` and `4`, and `right` replays `1` from its buffer, then gets `3` and `4`.
:::

## Async generators

:::compare
```js
async function* ticks() {
  try {
    for (let i = 0; ; i++) yield i;
  } finally {
    console.log("ticker stopped");
  }
}

for await (const t of ticks()) {
  if (t === 2) break;      // calls return(): "ticker stopped", right now
}
```
```python
async def ticks():
    try:
        for i in count():
            yield i
    finally:
        print("ticker stopped")


async with aclosing(ticks()) as stream:
    async for t in stream:
        if t == 2:
            break          # aclosing() runs the cleanup on exit
```
:::

An `async def` that contains `yield` is an async generator, driven by `async for` ([the basics](lesson:async#async-for-and-async-with)). Its API is the generator API with an `a` in front, and every method returns an awaitable: `anext(agen, default)` (a builtin since 3.10), `agen.asend(value)`, `agen.athrow(exc)` and `agen.aclose()`, with `inspect.getasyncgenstate()` (3.12+) for the state. Two things are missing. There's no `yield from`, which is a `SyntaxError` in an `async def` (write `async for item in sub: yield item`), and `return` with a value is a `SyntaxError` too, so an async generator can't hand back a result the way `StopIteration.value` does.

Cleanup is where it gets subtle. Closing an async generator means running its `finally`, which may itself `await`, so it can't happen synchronously the way a plain generator's does. When you `break` out of an `async for` and drop the generator, the event loop's finaliser hook schedules `aclose()` as a task that runs *later*, and `asyncio.run()` finalises any stragglers when the loop shuts down. JavaScript's `for await` waits for the cleanup before the loop statement completes. For that guarantee in Python, wrap the generator in `contextlib.aclosing()` (3.10+):

```python run
import asyncio
from contextlib import aclosing


async def ticks(label):
    try:
        for i in range(10):
            await asyncio.sleep(0)
            yield i
    finally:
        print(f"  {label}: cleaned up")


async def main():
    async for t in ticks("dropped"):
        if t == 1:
            break
    print("after the loop")          # the cleanup hasn't run yet...
    await asyncio.sleep(0.01)        # ...the event loop runs it a moment later

    async with aclosing(ticks("aclosing")) as stream:
        async for t in stream:
            if t == 1:
                break
    print("after aclosing")          # already cleaned up


asyncio.run(main())
```

:::gotcha An abandoned async generator is cleaned up on the event loop's schedule
A `finally` that returns a connection to a pool runs after your code has moved on, possibly after the pool is exhausted, and if the loop shuts down without finalising the generator, not at all. Any async generator that holds a resource should be consumed inside `async with aclosing(...)`. [The third challenge](#gen-take-async) is about exactly this.
:::

## Cheat sheet

| JavaScript | Python | Notes |
| --- | --- | --- |
| `gen.next()` | `next(gen)` | resumes with `None` |
| `gen.next(value)` | `gen.send(value)` | prime with `next()` first |
| first `next(v)` drops `v` | first `send(v)` raises `TypeError` | or use a `@primed` decorator |
| `gen.throw(err)` | `gen.throw(exc)` | pass an instance |
| `gen.return(value)` | `gen.close()` | raises `GeneratorExit` inside; returns the generator's result (3.13+) |
| final `{ value, done: true }` | `StopIteration.value` | `result = yield from sub()` |
| `yield* sub` | `yield from sub` | forwards `send`, `throw` and `close` |
| no equivalent | `inspect.getgeneratorstate(gen)` | `gen.gi_frame.f_locals` for the locals |
| `break` in `for...of` closes | `break` in `for` doesn't | `with closing(gen):` |
| `break` in `for await` closes | the loop schedules `aclose()` later | `async with aclosing(agen):` |
| `await it.next()` | `await anext(agen, default)` | 3.10+ |
| RxJS operators | coroutines that `send()` downstream | a push pipeline |
| `_.uniqBy(xs, key)` | `unique_everseen(xs, key)` | a recipe; `more-itertools` |
| `_.partition(xs, p)` | `partition(p, xs)` | returns `(falsy, truthy)` |
| `[...it]` to reuse it | `tee(it)` | `list()` if one copy runs ahead |

## Challenges

:::challenge id=gen-batcher title="A batching consumer" difficulty=easy
Write a consumer coroutine `batcher(size, emit)`. Items arrive through `send()`. Each time `size` of them have arrived, it calls `emit(batch)` with a list of those items. When the coroutine is closed, it emits the final, partial batch (if there is one) and finishes. Callers prime it with `next()`:

```python
batches = []
b = batcher(3, batches.append)
next(b)
for n in range(7):
    b.send(n)
b.close()
batches  ->  [[0, 1, 2], [3, 4, 5], [6]]
```

Each batch must be a list of its own: once a batch has been emitted, later items mustn't change it.

```js
function* batcher(size, emit) {
  let batch = [];
  try {
    while (true) {
      batch.push(yield);
      if (batch.length === size) {
        emit(batch);
        batch = [];
      }
    }
  } finally {
    if (batch.length) emit(batch);    // gen.return() lands here
  }
}
```

```python starter
def batcher(size, emit):
    ...
```

```python solution
def batcher(size, emit):
    batch = []
    try:
        while True:
            item = yield
            batch.append(item)
            if len(batch) == size:
                emit(batch)
                batch = []          # a new list: the emitted one stays intact
    except GeneratorExit:
        if batch:
            emit(batch)             # flush the partial batch, then finish
```

```python tests
import inspect


def started(size):
    batches = []
    b = batcher(size, batches.append)
    next(b)
    return b, batches


@test("emits a batch each time one fills up")
def _():
    b, batches = started(3)
    for n in range(6):
        b.send(n)
    eq(batches, [[0, 1, 2], [3, 4, 5]])

@test("close() flushes the partial batch")
def _():
    b, batches = started(3)
    for n in range(7):
        b.send(n)
    eq(batches, [[0, 1, 2], [3, 4, 5]], "the partial batch waits for close()")
    b.close()
    eq(batches, [[0, 1, 2], [3, 4, 5], [6]])

@test("close() with nothing pending emits nothing")
def _():
    b, batches = started(2)
    b.send("a")
    b.send("b")
    b.close()
    eq(batches, [["a", "b"]])
    b, batches = started(2)
    b.close()
    eq(batches, [])

@test("an emitted batch never changes afterwards")
def _():
    b, batches = started(2)
    for item in "abcd":
        b.send(item)
    eq(batches, [["a", "b"], ["c", "d"]], "start a new list for each batch instead of clearing the old one")

@test("size 1 emits every item on its own")
def _():
    b, batches = started(1)
    b.send(0)
    b.send(None)
    eq(batches, [[0], [None]])

@test("closing finishes the generator, and closing again is harmless")
def _():
    b, batches = started(2)
    b.send(1)
    b.close()
    eq(inspect.getgeneratorstate(b), "GEN_CLOSED")
    b.close()
    eq(batches, [[1]])

@test("batcher is a generator function")
def _():
    check(inspect.isgeneratorfunction(batcher), "use `yield` to receive the items")
```

```hint
`item = yield` pauses until someone calls `send(item)`. Loop forever, append each item, and emit when the list reaches `size`.
```

```hint
`close()` raises `GeneratorExit` at the paused `yield`. Catch it outside the loop, emit what's left, and let the function end. Don't yield again, or `close()` raises `RuntimeError`.
```

```hint
After emitting, start a fresh list with `batch = []`. `batch.clear()` would empty the very list you just handed to `emit`.
```
:::

:::challenge id=gen-roundrobin title="Round-robin" difficulty=medium
Write a generator function `roundrobin(*iterables)`, the itertools recipe. It takes one item from each iterable in turn, drops each iterable from the rotation when it runs out, and stops when all of them have:

```text
list(roundrobin("ABC", "D", "EF"))  ->  ['A', 'D', 'E', 'B', 'F', 'C']
```

It must be lazy and work with one-shot and infinite iterators. Call `iter()` on each argument once, and read an item only at the moment it's about to be yielded, so nothing is read ahead.

```js
function* roundrobin(...iterables) {
  let iterators = iterables.map((it) => it[Symbol.iterator]());
  while (iterators.length) {
    const live = [];
    for (const it of iterators) {
      const { value, done } = it.next();
      if (!done) {
        yield value;
        live.push(it);
      }
    }
    iterators = live;
  }
}
```

```python starter
def roundrobin(*iterables):
    ...
```

```python solution
from collections import deque


def roundrobin(*iterables):
    queue = deque(iter(iterable) for iterable in iterables)
    while queue:
        iterator = queue.popleft()
        try:
            item = next(iterator)
        except StopIteration:
            continue                    # exhausted: leave it out of the rotation
        yield item
        queue.append(iterator)
```

```python tests
import inspect
from itertools import count, islice


def spy(items, log):
    for item in items:
        log.append(item)
        yield item


class CountedIterable:
    def __init__(self, items):
        self.items, self.iter_calls = items, 0

    def __iter__(self):
        self.iter_calls += 1
        return iter(self.items)


@test("takes one item from each iterable in turn")
def _():
    eq(list(roundrobin("ABC", "D", "EF")), ["A", "D", "E", "B", "F", "C"])

@test("equal lengths interleave fully")
def _():
    eq(list(roundrobin([1, 2], ["a", "b"])), [1, "a", 2, "b"])

@test("no iterables, or only empty ones, yield nothing")
def _():
    eq(list(roundrobin()), [])
    eq(list(roundrobin([], "")), [])

@test("works with one-shot iterators")
def _():
    eq(list(roundrobin(iter([1, 2]), (c for c in "ab"))), [1, "a", 2, "b"])

@test("works with infinite iterables")
def _():
    eq(list(islice(roundrobin(count(), "ab"), 6)), [0, "a", 1, "b", 2, 3])

@test("is lazy: reads an item only when it's about to yield it")
def _():
    log = []
    items = roundrobin(spy([1, 2], log), spy("ab", log))
    eq(log, [], "nothing should be read before the first next()")
    eq(next(items), 1)
    eq(log, [1], "read 'a' only when it's about to be yielded")
    eq(next(items), "a")
    eq(next(items), 2)
    eq(log, [1, "a", 2])

@test("calls iter() once per argument")
def _():
    numbers = CountedIterable([1, 2, 3])
    eq(list(roundrobin(numbers, "xy")), [1, "x", 2, "y", 3])
    eq(numbers.iter_calls, 1)

@test("roundrobin is a generator function")
def _():
    check(inspect.isgeneratorfunction(roundrobin), "write it with `yield`")
```

```hint
Turn every argument into an iterator once, up front, and keep them in a `collections.deque`, so you can take one from the front and put it back at the end.
```

```hint
Pop an iterator and call `next()` on it. If that raises `StopIteration`, the iterator is done: simply don't put it back. Otherwise, yield the item and append the iterator to the back of the queue.
```

```hint
Catching `StopIteration` yourself inside a generator is fine. Only an *uncaught* one is turned into `RuntimeError` (PEP 479). `zip_longest` is tempting, but it reads a whole round of items before yielding the first.
```
:::

:::challenge id=gen-take-async title="Take, then close" difficulty=medium
Write an async generator `take(source, n)` that yields the first `n` items of the async generator `source` and then **closes** it, so that the source's cleanup has finished by the time `take` is done:

```python
async for row in take(query_rows(), 2):
    print(row)
# query_rows()'s finally block has already run here
```

- Never pull more than `n` items from `source`, and none at all when `n` is `0`.
- Close `source` however `take` ends: after `n` items, when `source` runs out first, or when the consumer closes `take` early with `aclose()`.

In JavaScript, `for await` closes the source for you on the way out. In Python, that's `contextlib.aclosing`'s job.

```js
async function* take(source, n) {
  if (n <= 0) return;
  let count = 0;
  for await (const item of source) {   // an early return calls source.return()
    yield item;
    if (++count === n) return;
  }
}
```

```python starter
from contextlib import aclosing


async def take(source, n):
    ...
```

```python solution
from contextlib import aclosing


async def take(source, n):
    async with aclosing(source):        # closes source however take ends
        if n <= 0:
            return
        count = 0
        async for item in source:
            yield item
            count += 1
            if count == n:
                return
```

```python tests
import asyncio
import inspect


def make_source(items, log):
    async def source():
        try:
            for item in items:
                log.append(f"pull {item}")
                await asyncio.sleep(0)
                yield item
        finally:
            log.append("closed")

    return source()


async def drain(agen):
    return [item async for item in agen]


@test("yields the first n items")
async def _():
    async with asyncio.timeout(2):
        log = []
        eq(await drain(take(make_source([1, 2, 3, 4], log), 2)), [1, 2])

@test("pulls no more than n items, then closes the source right away")
async def _():
    async with asyncio.timeout(2):
        log = []
        await drain(take(make_source([1, 2, 3, 4], log), 2))
        eq(log, ["pull 1", "pull 2", "closed"], "the source's cleanup should have run before take() finished")

@test("a short source is read to the end and closed")
async def _():
    async with asyncio.timeout(2):
        log = []
        eq(await drain(take(make_source([1, 2], log), 5)), [1, 2])
        eq(log, ["pull 1", "pull 2", "closed"])

@test("n = 0 reads nothing")
async def _():
    async with asyncio.timeout(2):
        log = []
        eq(await drain(take(make_source([1, 2], log), 0)), [])
        check("pull 1" not in log, "take(source, 0) shouldn't pull anything from the source")

@test("closing take early closes the source too")
async def _():
    async with asyncio.timeout(2):
        log = []
        taken = take(make_source([1, 2, 3], log), 3)
        eq(await anext(taken), 1)
        await taken.aclose()
        eq(log, ["pull 1", "closed"])

@test("take is an async generator function")
def _():
    check(inspect.isasyncgenfunction(take), "use `async def` with `yield`")
```

```hint
An `async def` containing `yield` is an async generator. Count the items as you yield them and `return` once you have `n`, rather than pulling one more to find out.
```

```hint
Returning out of an `async for` leaves the source suspended: the event loop will close it eventually, not now. `async with aclosing(source):` awaits `source.aclose()` when the block exits.
```

```hint
Put the whole body, including the `n <= 0` check, inside `async with aclosing(source):`. If the consumer calls `take.aclose()`, the `GeneratorExit` raised at your `yield` unwinds through the `async with`, which closes the source on its way out.
```
:::

:::challenge id=gen-contextmanager title="Build @contextmanager" difficulty=hard
Write `contextmanager` yourself, without importing `contextlib`. It decorates a generator function, and calling the result returns a context manager:

```python
@contextmanager
def tag(name):
    print(f"<{name}>")
    try:
        yield name.upper()
    finally:
        print(f"</{name}>")
```

The manager object must:

1. On `__enter__`, run the generator to its first `yield` and return the yielded value. If the generator finishes without yielding, raise `RuntimeError`.
2. On a clean exit, resume the generator, which must now finish. If it yields again, raise `RuntimeError`.
3. If the `with` block raised, throw that exception into the generator at the `yield`:
   - if the generator then finishes without raising, **suppress** the exception;
   - if it re-raises the same exception, let it propagate unchanged (return a false value from `__exit__` rather than raising it yourself);
   - if it raises a different exception, let that one propagate instead;
   - if it yields again, raise `RuntimeError`.
4. The decorated function keeps the generator function's `__name__` and `__doc__`.

(The real `contextlib` also untangles a `StopIteration` raised by the block, which PEP 479 turns into `RuntimeError` inside the generator. You can skip that case.)

```python starter
import functools


def contextmanager(gen_fn):
    ...
```

```python solution
import functools


class GeneratorContextManager:
    def __init__(self, gen):
        self.gen = gen

    def __enter__(self):
        try:
            return next(self.gen)
        except StopIteration:
            raise RuntimeError("generator didn't yield") from None

    def __exit__(self, exc_type, exc, tb):
        if exc_type is None:
            try:
                next(self.gen)
            except StopIteration:
                return False
            raise RuntimeError("generator didn't stop")
        try:
            self.gen.throw(exc)
        except StopIteration:
            return True                   # the generator handled it: suppress
        except BaseException as err:
            if err is exc:
                return False              # re-raised: let `with` propagate the original
            raise                         # a different exception replaces it
        raise RuntimeError("generator didn't stop after throw()")


def contextmanager(gen_fn):
    @functools.wraps(gen_fn)
    def helper(*args, **kwargs):
        return GeneratorContextManager(gen_fn(*args, **kwargs))

    return helper
```

```python tests
def make_tag(log):
    @contextmanager
    def tag(name):
        """Wrap output in a tag."""
        log.append(f"<{name}>")
        try:
            yield name.upper()
        finally:
            log.append(f"</{name}>")

    return tag


@test("enter runs the setup and returns the yielded value")
def _():
    log = []
    with make_tag(log)("p") as value:
        eq(value, "P")
        eq(log, ["<p>"], "only the code before yield should have run")
    eq(log, ["<p>", "</p>"])

@test("teardown runs when the block raises, and the error propagates")
def _():
    log = []
    with raises(ValueError):
        with make_tag(log)("div"):
            raise ValueError("render failed")
    eq(log, ["<div>", "</div>"])

@test("a generator that handles the exception suppresses it")
def _():
    @contextmanager
    def ignoring(error_type):
        try:
            yield
        except error_type:
            pass

    with ignoring(KeyError):
        {}["missing"]
    with raises(ZeroDivisionError):
        with ignoring(KeyError):
            1 / 0

@test("the same exception propagates unchanged when re-raised")
def _():
    @contextmanager
    def passthrough():
        try:
            yield
        except LookupError:
            raise

    error = KeyError("id")
    with raises(KeyError) as caught:
        with passthrough():
            raise error
    check(caught.exception is error, "propagate the original exception object")

@test("the generator can translate the exception")
def _():
    class ConfigError(Exception): ...

    @contextmanager
    def config_errors():
        try:
            yield
        except KeyError as err:
            raise ConfigError(f"missing setting {err}") from err

    with raises(ConfigError) as caught:
        with config_errors():
            {}["port"]
    check(isinstance(caught.exception.__cause__, KeyError), "the KeyError should be the cause")

@test("a generator that doesn't yield raises RuntimeError")
def _():
    @contextmanager
    def never():
        if False:
            yield

    with raises(RuntimeError):
        with never():
            pass

@test("a generator that yields twice raises RuntimeError")
def _():
    @contextmanager
    def twice():
        yield 1
        yield 2

    with raises(RuntimeError):
        with twice():
            pass

@test("yielding again after an exception raises RuntimeError")
def _():
    @contextmanager
    def stubborn():
        try:
            yield
        except ValueError:
            yield

    with raises(RuntimeError):
        with stubborn():
            raise ValueError("boom")

@test("each call makes a fresh manager")
def _():
    log = []
    tag = make_tag(log)
    with tag("a"):
        pass
    with tag("b"):
        pass
    eq(log, ["<a>", "</a>", "<b>", "</b>"])

@test("keeps the name and docstring")
def _():
    tag = make_tag([])
    eq((tag.__name__, tag.__doc__), ("tag", "Wrap output in a tag."))

@test("doesn't use contextlib")
def _():
    forbids_import("contextlib", "build it from the generator protocol instead")
```

```hint
`contextmanager(gen_fn)` returns a function. Calling *that* creates the generator and wraps it in an object with `__enter__` and `__exit__`, and a small class is the natural shape.
```

```hint
`__enter__` is `next(self.gen)`, with `StopIteration` turned into `RuntimeError`. On a clean exit (`exc_type is None`), `__exit__` calls `next()` once more and expects `StopIteration`.
```

```hint
When the block raised, call `self.gen.throw(exc)` inside a `try`. `StopIteration` means the generator handled it: return `True`. Catching the very same object back (`err is exc`) means it re-raised: return `False` and let `with` propagate it. Anything else, re-raise. If `throw()` returns at all, the generator yielded again.
```
:::
