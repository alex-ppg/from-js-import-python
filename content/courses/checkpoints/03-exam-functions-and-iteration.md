---
title: "Exam: Functions & Iteration"
part: Core Course Exams
summary: Closures, defaults, decorators and generators: predict the output, then build tools that combine them.
minutes: 50
---

This exam covers the Functions & Iteration part of the core course: [Functions, Arrows & Lambdas](lesson:functions), [Higher-Order Functions & Decorators](lesson:decorators) and [Iterators & Generators](lesson:iterators-and-generators). Predict what each snippet prints, or which exception it raises, before you read the options. Most of the traps are about *when* things happen: when a default is evaluated, when a closure looks a variable up, when a decorator runs, and when a generator's body actually executes. Every answer has been checked against real Python 3.14, each section ends with a pointer to the lesson that owns its topic, and the final challenges combine closures, decorators and generators.

## Functions

:::quiz output
What does this print?

```python
def double_all(nums):
    [n * 2 for n in nums]


print(double_all([1, 2]))
```

- [ ] `[2, 4]`
- [x] `None`
- [ ] `[]`
- [ ] `SyntaxError`

A `def` never returns implicitly. The comprehension builds `[2, 4]` and throws it away, and a function that runs off its end returns `None`. It's the classic bug when an expression arrow, `(nums) => nums.map(...)`, becomes a `def`: write the `return`.
:::

:::quiz output
What does this print?

```python
counter = 0


def next_label(prefix=f"item-{counter}"):
    return prefix


counter = 5
print(next_label())
```

- [x] `item-0`
- [ ] `item-5`
- [ ] `NameError`
- [ ] `prefix`

A default is computed **once**, when the `def` statement runs, and stored on the function. At that moment `counter` was `0`, so every call that omits `prefix` gets `"item-0"`, where JS would evaluate the default again on every call that needs it. For a fresh value per call, default to `None` and compute the value in the body.
:::

:::quiz output
What happens?

```python
def tag(name, **attrs):
    return name, attrs


defaults = {"href": "#", "rel": "nofollow"}
print(tag("a", **defaults, href="/"))
```

- [ ] `('a', {'href': '/', 'rel': 'nofollow'})`
- [ ] `('a', {'href': '#', 'rel': 'nofollow'})`
- [x] `TypeError`
- [ ] `SyntaxError`

In a JS object spread, a later key quietly wins. In a call, `**defaults` and `href="/"` are two keyword arguments with the same name, and Python refuses with `TypeError: ... got multiple values for keyword argument 'href'`. Merge first, then spread: `tag("a", **(defaults | {"href": "/"}))`.
:::

:::quiz output
What does this print?

```python
def make_greeter():
    greeting = "hi"

    def greet(name):
        return f"{greeting} {name}"

    greeting = "hello"
    return greet


print(make_greeter()("ada"))
```

- [ ] `hi ada`
- [x] `hello ada`
- [ ] `UnboundLocalError`
- [ ] `NameError`

A closure captures the **variable**, not the value it held when the inner function was defined. `greet` looks `greeting` up when it runs, after `make_greeter` has rebound it to `"hello"`. JS closures work the same way. What Python lacks is a fresh variable per loop iteration, which is where late binding turns into a bug.
:::

:::quiz output
What happens?

```python
def total(*prices, discount=0):
    return sum(prices) - discount


print(total(10, 20, 5))
```

- [ ] `25`
- [x] `35`
- [ ] `30`
- [ ] `TypeError`

Every parameter after `*prices` is keyword-only, so the `5` can't reach `discount`: `*prices` collects all three positional arguments into a tuple, and `discount` keeps its default. The caller meant `total(10, 20, discount=5)`.
:::

:::quiz output
What happens?

```python
def main():
    return helper()


print(main())


def helper():
    return "ok"
```

- [ ] `ok`
- [x] `NameError`
- [ ] `None`
- [ ] `SyntaxError`

`def` is a statement that binds its name when execution reaches it; nothing is hoisted. Defining `main` before `helper` is fine, because `main`'s body only looks `helper` up when it runs, but here it runs before the second `def` has. That's why scripts define everything first and call the entry point at the very bottom.
:::

:::quiz
`export(rows, False)` is a mystery at the call site. Which signature accepts `export(rows, include_header=False)` but makes `export(rows, False)` raise `TypeError`?

- [ ] `def export(rows, include_header=True):`
- [ ] `def export(rows, /, include_header=True):`
- [x] `def export(rows, *, include_header=True):`
- [ ] `def export(*rows, include_header=True):`

A bare `*` makes every parameter after it keyword-only. A `/` does a different job: it makes the parameters *before* it positional-only, so `include_header` could still be passed positionally. `*rows` makes `include_header` keyword-only too, but `export(rows, False)` wouldn't raise: it would quietly collect both arguments into `rows`.
:::

Review: [Functions, Arrows & Lambdas](lesson:functions), especially [hoisting](lesson:functions#no-hoisting-def-runs-when-it-s-reached), [keyword arguments](lesson:functions#keyword-arguments-replace-options-objects), [defaults](lesson:functions#defaults-are-evaluated-once) and [closures](lesson:functions#closures-and-nonlocal).

## Decorators

:::quiz output
What happens?

```python
def logged(fn):
    def wrapper(*args):
        print("calling", fn.__name__)
        return fn(*args)


@logged
def ping():
    return "pong"


print(ping)
```

- [ ] `pong`
- [ ] `calling ping`, then `pong`
- [ ] `<function logged.<locals>.wrapper at 0x...>`
- [x] `None`

`@logged` means `ping = logged(ping)`, and `logged` forgot to `return wrapper`, so it returns `None` and the name `ping` is bound to `None`. Nothing fails at definition time; the first call raises `TypeError: 'NoneType' object is not callable`. A decorator has two `return`s, and both matter.
:::

:::quiz output
What does this print?

```python
def timed(fn):
    def wrapper(*args, **kwargs):
        return fn(*args, **kwargs)

    return wrapper


@timed
def checkout(cart):
    """Charge the cart."""
    return len(cart)


print(checkout.__name__, checkout.__doc__)
```

- [ ] `checkout Charge the cart.`
- [x] `wrapper None`
- [ ] `timed None`
- [ ] `wrapper Charge the cart.`

After decoration the name `checkout` refers to `wrapper`, and nothing copied the original's metadata across, so tracebacks, logs and `help()` all see a function called `wrapper` with no docstring. `@functools.wraps(fn)` on the wrapper copies the name, the docstring and the rest, and sets `__wrapped__`.
:::

:::quiz output
What does this print?

```python
def repeat(times=2):
    def decorator(fn):
        def wrapper():
            return [fn() for _ in range(times)]

        return wrapper

    return decorator


@repeat
def roll():
    return 4


print(roll.__name__)
```

- [ ] `roll`
- [ ] `wrapper`
- [x] `decorator`
- [ ] `TypeError`

`repeat` is a decorator **factory**, so it needs its parentheses even when every argument has a default. Bare `@repeat` calls `repeat(roll)`, which makes `times` the function and returns the middle layer, so `roll` is now `decorator`. Nothing fails until someone calls `roll()`. Write `@repeat()`.
:::

:::quiz output
What happens?

```python
from functools import cache


@cache
def total(prices):
    return sum(prices)


print(total((1, 2)), total([1, 2]))
```

- [ ] `3 3`
- [x] `TypeError`
- [ ] `3 None`
- [ ] `ValueError`

`@cache` stores results in a dict keyed by the arguments, so every argument must be hashable. The tuple is fine, but the list raises `TypeError: unhashable type: 'list'` before `total` even runs, and because `print`'s arguments are evaluated first, nothing is printed. Pass tuples (or frozensets) to cached functions.
:::

:::quiz output
What does this print, with `page` never called?

```python
def tag(label):
    def decorator(fn):
        print(label, end=" ")
        return fn

    return decorator


@tag("outer")
@tag("inner")
def page():
    pass
```

- [ ] Nothing, until `page()` is called
- [ ] `outer inner`
- [x] `inner outer`
- [ ] `inner`

A decorator runs once, when the `def` runs, so this prints without `page` ever being called. Stacked decorators are applied **bottom-up**: the one nearest the `def` wraps the function first, so `inner` prints first. At call time the order flips, and the outermost wrapper runs first.
:::

:::quiz output
What does this print?

```python
from functools import partial


def notify(user, msg):
    return f"{user}: {msg}"


user = "ada"
handlers = [partial(notify, user), lambda msg: notify(user, msg)]
user = "bob"
print([handler("hi") for handler in handlers])
```

- [ ] `['ada: hi', 'ada: hi']`
- [x] `['ada: hi', 'bob: hi']`
- [ ] `['bob: hi', 'bob: hi']`
- [ ] `['bob: hi', 'ada: hi']`

`partial` evaluates its arguments when you create it, so it stored the string `"ada"`. The lambda is a closure that looks `user` up when it's called, by which time it's `"bob"`. That's why `partial`, like a default argument, fixes late-binding bugs in loops.
:::

Review: [Higher-Order Functions & Decorators](lesson:decorators), especially [well-behaved decorators](lesson:decorators#writing-a-well-behaved-decorator), [stacking](lesson:decorators#stacking-decorators), [decorators with arguments](lesson:decorators#decorators-with-arguments) and [`partial`](lesson:decorators#functools-partial-bind).

## Iterators and generators

:::quiz output
What happens?

```python
def save(records):
    if not records:
        yield "nothing to save"
    print("saving", len(records))


save([1, 2])
print("done")
```

- [ ] `saving 2`, then `done`
- [x] `done`
- [ ] `nothing to save`, then `done`
- [ ] `TypeError`

One `yield` anywhere in the body, even in a branch that never runs, makes `save` a generator function. Calling it only creates a generator object and runs none of the body, so nothing is saved, and nothing is printed until something iterates it. A JS `function*` at least wears its star in the signature.
:::

:::quiz output
What does this print?

```python
def inner():
    yield 1
    return 10


def outer():
    result = yield from inner()
    yield result


print(list(outer()))
```

- [ ] `[1]`
- [x] `[1, 10]`
- [ ] `[1, 10, None]`
- [ ] `[10]`

A generator's `return` value isn't yielded: it rides on the `StopIteration` that ends the generator, which `list()` swallows. `yield from` re-yields everything the inner generator yields (the `1`) and then evaluates to that return value, which `outer` yields itself.
:::

:::quiz output
What does this print?

```python
from itertools import dropwhile, takewhile

temps = [3, 5, 12, 4, 15]
cold = list(takewhile(lambda t: t < 10, temps))
rest = list(dropwhile(lambda t: t < 10, temps))
print(cold, rest)
```

- [ ] `[3, 5, 4] [12, 15]`
- [x] `[3, 5] [12, 4, 15]`
- [ ] `[3, 5] [12, 15]`
- [ ] `[3, 5, 4] [12, 4, 15]`

`takewhile` yields items while the test passes and stops for good at the first failure, so the later `4` never gets in. `dropwhile` skips that same prefix and then yields everything after it, including items that would pass. Neither is a `filter`, which tests every item.
:::

:::quiz output
What does this print?

```python
class Countdown:
    def __init__(self, n):
        self.n = n

    def __iter__(self):
        yield from range(self.n, 0, -1)


timer = Countdown(2)
ticks = iter(timer)
print(list(timer), list(timer), list(ticks), list(ticks))
```

- [ ] `[2, 1] [] [] []`
- [x] `[2, 1] [2, 1] [2, 1] []`
- [ ] `[2, 1] [2, 1] [2, 1] [2, 1]`
- [ ] `[2, 1] [] [2, 1] []`

`Countdown` is an iterable: every `iter()` call, including the one inside each `list()`, runs `__iter__` again and gets a fresh generator, so it can be looped over as often as you like. `ticks` is one of those generators, an iterator, and iterators are single-use: the second `list(ticks)` finds it exhausted and returns `[]` without complaint.
:::

:::quiz output
What happens?

```python
def first_two(items):
    it = iter(items)
    yield next(it)
    yield next(it)


print(list(first_two([1])))
```

- [ ] `[1]`
- [ ] `[1, None]`
- [ ] `StopIteration`
- [x] `RuntimeError`

The second `next(it)` raises `StopIteration` inside the generator's body. Since Python 3.7 (PEP 479), a `StopIteration` that escapes a generator becomes `RuntimeError: generator raised StopIteration`, because otherwise it would silently end whatever loop was consuming the generator. Inside a generator, use `next(it, default)`, or catch `StopIteration` and `return`.
:::

:::quiz output
What does this print?

```python
readings = iter([1, 5, 2, 8])
print(any(r > 4 for r in readings), list(readings))
```

- [ ] `True [1, 5, 2, 8]`
- [x] `True [2, 8]`
- [ ] `True []`
- [ ] `True [5, 2, 8]`

`any` stops pulling values as soon as it finds a match, so it consumes `1` and `5` and leaves the rest. With a list you'd never notice, but `readings` is an iterator, and an iterator remembers its position, so `list()` carries on from where `any` stopped.
:::

Review: [Iterators & Generators](lesson:iterators-and-generators), especially [iterables vs iterators](lesson:iterators-and-generators#iterables-vs-iterators), [generator functions](lesson:iterators-and-generators#generator-functions-yield-function), [the generator API](lesson:iterators-and-generators#send-return-and-the-rest-of-the-generator-api) and [`itertools`](lesson:iterators-and-generators#an-itertools-tour).

## Final challenges

Each challenge combines functions, decorators and iteration. They're ordered from easy to hard.

:::challenge id=exam-unique-everseen title="Lazy dedupe" difficulty=easy
Write a generator function `unique(iterable, key=None)` that yields each item the first time it's seen, in order, and skips later repeats. With a `key` function, two items count as repeats when their keys are equal, and the first of them is the one that's yielded.

- It must work on any iterable, including one-shot and infinite iterators, so it reads only as much input as it needs.
- Items (or their keys) are hashable, and `None`, `0` and `""` are items like any other.
- `key` is called exactly once per item.

```text
list(unique([3, 1, 3, 2, 1]))                       ->  [3, 1, 2]
list(unique(["Ada", "ada", "Bob"], key=str.lower))  ->  ["Ada", "Bob"]
```

```js
function* unique(iterable, key = (item) => item) {
  const seen = new Set();
  for (const item of iterable) {
    const marker = key(item);
    if (seen.has(marker)) continue;
    seen.add(marker);
    yield item;
  }
}
```

```python starter
def unique(iterable, key=None):
    ...
```

```python solution
def unique(iterable, key=None):
    seen = set()
    for item in iterable:
        marker = item if key is None else key(item)
        if marker not in seen:
            seen.add(marker)
            yield item
```

```python tests
import inspect
from itertools import islice


def guarded(items):
    """Yields the items, then fails loudly if anyone asks for more."""
    yield from items
    raise AssertionError("unique() read more input than it needed")


@test("yields first occurrences, in order")
def _():
    eq(list(unique([3, 1, 3, 2, 1])), [3, 1, 2])

@test("a key decides what counts as a repeat, and the first item wins")
def _():
    eq(list(unique(["Ada", "ada", "Bob", "ADA"], key=str.lower)), ["Ada", "Bob"])

@test("falsy items are items too")
def _():
    eq(list(unique([0, None, "", 0, None, ""])), [0, None, ""])

@test("works on a one-shot iterator")
def _():
    eq(list(unique(iter("mississippi"))), ["m", "i", "s", "p"])

@test("is lazy: reads only as much input as it needs")
def _():
    eq(list(islice(unique(guarded([1, 1, 2, 3])), 3)), [1, 2, 3])
    eq(next(unique(guarded(["only"]))), "only")

@test("calls the key once per item")
def _():
    calls = []

    def key(word):
        calls.append(word)
        return word.lower()

    list(unique(["a", "A", "b"], key=key))
    eq(calls, ["a", "A", "b"])

@test("is a generator function")
def _():
    check(inspect.isgeneratorfunction(unique), "use yield, so items are produced one at a time")
```

```hint
Keep a `seen` set and loop over the input, yielding an item only when its marker isn't in the set yet.
```

```hint
Default `key` to `None` and compute the marker with a conditional expression: `item if key is None else key(item)`. Compute it once and reuse it.
```

```hint
Test membership with `in`, never with truthiness: `0`, `None` and `""` are perfectly good items.
```
:::

:::challenge id=exam-collect-decorator title="Collect a generator" difficulty=medium
Generator functions are pleasant to write, but callers often want a real list, set or dict back. Write a decorator factory `collect(into)` that turns a generator function into an ordinary function that returns `into(generator)`:

```python
@collect(list)
def evens(limit):
    for n in range(limit):
        if n % 2 == 0:
            yield n


evens(7)   # [0, 2, 4, 6]
```

- `into` is any callable that takes an iterable: `list`, `set`, `sorted`, `sum`, `"-".join`, or `dict` for a generator of pairs.
- The decorated function accepts the same positional and keyword arguments as the original, and returns a value rather than a generator.
- It keeps the original's name and docstring, and exposes the generator function as `__wrapped__`.

```js
// JS has no function decorators, so wrap by hand.
const collect = (into) => (genFn) => (...args) => into(genFn(...args));

const evens = collect(Array.from)(function* (limit) {
  for (let n = 0; n < limit; n += 2) yield n;
});
```

```python starter
import functools


def collect(into):
    ...
```

```python solution
import functools


def collect(into):
    def decorator(gen_fn):
        @functools.wraps(gen_fn)
        def wrapper(*args, **kwargs):
            return into(gen_fn(*args, **kwargs))

        return wrapper

    return decorator
```

```python tests
import inspect


@test("returns the collected results")
def _():
    @collect(list)
    def evens(limit):
        for n in range(limit):
            if n % 2 == 0:
                yield n

    eq(evens(7), [0, 2, 4, 6])
    eq(evens(0), [])

@test("works with any callable that takes an iterable")
def _():
    @collect(dict)
    def positions(words):
        for position, word in enumerate(words):
            yield word, position

    @collect("-".join)
    def shout(word):
        yield from word.upper()

    @collect(sum)
    def squares(n):
        for i in range(n):
            yield i * i

    eq(positions(["a", "b"]), {"a": 0, "b": 1})
    eq(shout("abc"), "A-B-C")
    eq(squares(4), 14)

@test("passes positional and keyword arguments through")
def _():
    @collect(list)
    def countdown(start, *, step=1):
        while start > 0:
            yield start
            start -= step

    eq(countdown(5, step=2), [5, 3, 1])
    eq(countdown(start=2), [2, 1])

@test("the decorated function returns a value, not a generator")
def _():
    @collect(set)
    def tags():
        yield "py"
        yield "py"

    eq(tags(), {"py"})
    check(not inspect.isgeneratorfunction(tags), "the wrapper itself shouldn't yield")

@test("keeps the name and docstring, and exposes __wrapped__")
def _():
    def squares(n):
        """Yield the first n squares."""
        for i in range(n):
            yield i * i

    collected = collect(list)(squares)
    eq((collected.__name__, collected.__doc__), ("squares", "Yield the first n squares."))
    check(collected.__wrapped__ is squares, "__wrapped__ should be the original generator function")
```

```hint
`@collect(list)` runs `collect(list)` first, and whatever *that* returns is applied to the function: three layers, like `retry(times=3)`.
```

```hint
The innermost wrapper takes `*args, **kwargs`, creates the generator with `gen_fn(*args, **kwargs)`, and passes it to `into`.
```

```hint
`@functools.wraps(gen_fn)` on the wrapper copies the name and docstring and sets `__wrapped__` for you.
```
:::

:::challenge id=exam-call-once title="Run it once" difficulty=medium
Write a decorator `once`, Python's version of lodash's `_.once`. The first call runs the function and remembers its result. Every later call returns that same result without running the function again, whatever arguments it's given.

- Falsy results, `None` included, still count: a function that returned `None` has run.
- Each decorated function keeps its own state, and keeps its name and docstring.
- The decorated function gets a `reset()` method, after which the next call runs the function again.

```python
@once
def connect():
    print("connecting...")
    return "connection"


connect()        # prints "connecting..." and returns "connection"
connect()        # returns "connection" without printing
connect.reset()
connect()        # prints "connecting..." again
```

```js
function once(fn) {
  let called = false;
  let result;
  const wrapper = (...args) => {
    if (!called) {
      result = fn(...args);
      called = true;
    }
    return result;
  };
  wrapper.reset = () => {
    called = false;
  };
  return wrapper;
}
```

```python starter
import functools


def once(fn):
    ...
```

```python solution
import functools

_NOT_CALLED = object()


def once(fn):
    result = _NOT_CALLED

    @functools.wraps(fn)
    def wrapper(*args, **kwargs):
        nonlocal result
        if result is _NOT_CALLED:
            result = fn(*args, **kwargs)
        return result

    def reset():
        nonlocal result
        result = _NOT_CALLED

    wrapper.reset = reset
    return wrapper
```

```python tests
def counted(result):
    """A function that returns `result`, plus a list that records each real call."""
    calls = []

    def fn(*args, **kwargs):
        calls.append((args, kwargs))
        return result

    return fn, calls


@test("the first call runs the function and returns its result")
def _():
    fn, calls = counted("ready")
    init = once(fn)
    eq(init(), "ready")
    eq(len(calls), 1)

@test("later calls return the same result without running it again")
def _():
    fn, calls = counted([1, 2])
    init = once(fn)
    first = init()
    check(init() is first, "later calls should return the very same object")
    init()
    eq(len(calls), 1, "the function body should run exactly once")

@test("arguments are used on the first call and ignored afterwards")
def _():
    fn, calls = counted("ok")
    init = once(fn)
    init(1, retries=3)
    init(2, retries=5)
    eq(calls, [((1,), {"retries": 3})])

@test("None and other falsy results still count as a call")
def _():
    for result in (None, 0, "", []):
        fn, calls = counted(result)
        init = once(fn)
        init()
        init()
        eq(len(calls), 1, f"a function returning {result!r} ran twice")

@test("reset() makes the next call run the function again")
def _():
    fn, calls = counted("ok")
    init = once(fn)
    init()
    init.reset()
    init()
    init()
    eq(len(calls), 2)

@test("each decorated function has its own state")
def _():
    fn_a, calls_a = counted("a")
    fn_b, calls_b = counted("b")
    a, b = once(fn_a), once(fn_b)
    eq((a(), b(), a()), ("a", "b", "a"))
    eq((len(calls_a), len(calls_b)), (1, 1))

@test("keeps the name and docstring")
def _():
    @once
    def connect():
        """Open the shared connection."""
        return "connection"

    eq((connect.__name__, connect.__doc__), ("connect", "Open the shared connection."))
```

```hint
Keep the state in the decorator's closure, and rebind it from the wrapper with `nonlocal`.
```

```hint
`None` can't mean "not called yet", because `None` is a perfectly good result. Use a private sentinel, `_NOT_CALLED = object()`, and test it with `is`, or keep a separate boolean flag.
```

```hint
Functions are objects, so `wrapper.reset = reset` attaches the method. Make `reset` a nested function that rebinds the same state with `nonlocal`.
```
:::

:::challenge id=exam-roundrobin title="Round-robin" difficulty=hard
Write a generator function `interleave(*iterables)` that yields one item from each iterable in turn, round-robin, skipping the ones that have run out, until every one of them is exhausted:

```text
list(interleave("ABC", "d", "EF"))  ->  ["A", "d", "E", "B", "F", "C"]
```

- Any iterables work, including one-shot and infinite iterators, so it must be lazy: read only as much input as the consumer asks for.
- Items can be anything, `None` and other falsy values included.
- With no arguments it yields nothing.

```js
function* interleave(...iterables) {
  let iterators = iterables.map((it) => it[Symbol.iterator]());
  while (iterators.length) {
    const live = [];
    for (const it of iterators) {
      const { value, done } = it.next();
      if (done) continue;
      yield value;
      live.push(it);
    }
    iterators = live;
  }
}
```

```python starter
def interleave(*iterables):
    ...
```

```python solution
from collections import deque

_DONE = object()


def interleave(*iterables):
    queue = deque(iter(iterable) for iterable in iterables)
    while queue:
        iterator = queue.popleft()
        item = next(iterator, _DONE)
        if item is not _DONE:
            yield item
            queue.append(iterator)
```

```python tests
import inspect
from itertools import islice


def guarded(items):
    """Yields the items, then fails loudly if anyone asks for more."""
    yield from items
    raise AssertionError("interleave() read more input than it needed")


@test("takes one item from each iterable in turn")
def _():
    eq(list(interleave("ABC", "def")), ["A", "d", "B", "e", "C", "f"])

@test("skips iterables that have run out")
def _():
    eq(list(interleave("ABC", "d", "EF")), ["A", "d", "E", "B", "F", "C"])
    eq(list(interleave([], [1, 2], [])), [1, 2])

@test("no iterables, nothing to yield")
def _():
    eq(list(interleave()), [])

@test("None and other falsy items are yielded like any other")
def _():
    eq(list(interleave([None, 0], ["", False])), [None, "", 0, False])

@test("works with one-shot iterators and generators")
def _():
    eq(list(interleave(iter([1, 2]), (c for c in "xy"))), [1, "x", 2, "y"])

@test("is lazy: reads only as much input as it needs")
def _():
    eq(list(islice(interleave(guarded("ab"), guarded("c")), 3)), ["a", "c", "b"])
    eq(list(islice(interleave(guarded("xyz"), "ab"), 5)), ["x", "a", "y", "b", "z"])

@test("is a generator function")
def _():
    check(inspect.isgeneratorfunction(interleave), "use yield, so items are produced one at a time")
```

```hint
Turn every argument into an iterator with `iter()` first, so you can pull one item at a time from each with `next()`.
```

```hint
`next(it, default)` returns the default instead of raising when `it` is exhausted. `None` is a valid item, so make the default a private sentinel, `_DONE = object()`, and test it with `is`.
```

```hint
A `collections.deque` of live iterators makes the rotation easy: `popleft()` one, pull an item, and `append()` the iterator back only if it produced something. (`zip_longest` is tempting, but it pulls a whole round from every iterable before you yield the first item of that round, so it reads ahead.)
```
:::
