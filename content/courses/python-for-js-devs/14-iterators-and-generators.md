---
title: Iterators & Generators
part: Functions & Iteration
summary: The iteration protocol, yield and yield from, single-use iterator traps, and a tour of itertools.
minutes: 40
---

Python's iteration model is JavaScript's with different spelling. An **iterable** hands out **iterators**, and an iterator produces values until it's done. `for` loops, unpacking, `list()`, `sum()`, `in` and dozens of builtins all speak that protocol, and generators are `function*` with lighter syntax.

Two differences matter day to day. Python signals the end by *raising* `StopIteration` instead of returning `{ done: true }`, which you'll rarely see because `for` handles it. And the functions you call constantly, `map`, `filter`, `zip`, `enumerate` and `reversed`, return lazy, **single-use** iterators where JavaScript's array methods hand back fresh arrays.

## The protocol: `iter()`, `next()` and `StopIteration`

:::compare
```js
const it = ["a", "b"][Symbol.iterator]();

it.next();   // { value: "a", done: false }
it.next();   // { value: "b", done: false }
it.next();   // { value: undefined, done: true }
```
```python
it = iter(["a", "b"])

next(it)         # "a"
next(it)         # "b"
next(it)         # raises StopIteration
next(it, None)   # None: a default instead of the exception
```
:::

`iter(obj)` calls `obj.__iter__()`, Python's `[Symbol.iterator]()`, and `next(it)` calls `it.__next__()`. There's no result object: `next` returns the value itself, and an exhausted iterator raises `StopIteration`. A `for` loop is exactly `iter()` plus repeated `next()` until that exception, which it swallows for you.

Give `next()` a second argument and you get it back instead of the exception. That makes `next(it, None)` the idiomatic "first item or nothing", and with a generator expression inside, it's JavaScript's `find` ([Comprehensions](lesson:map-filter-reduce)).

```python run
prices = [3, 5, 8]

it = iter(prices)                   # what `for price in prices:` does
while True:
    try:
        price = next(it)
    except StopIteration:
        break
    print(price)

print(next(iter([]), "empty"))      # a default instead of StopIteration
```

:::quiz output
What does this print?

```python
it = iter("abc")
next(it)
print(next(it), next(it), next(it, "done"))
```

- [ ] `a b c`
- [x] `b c done`
- [ ] `b c None`
- [ ] `StopIteration`

The bare `next(it)` consumes `"a"`. The next two calls return `"b"` and `"c"`, and the third finds the iterator exhausted, so it returns the default instead of raising.
:::

## Iterables vs iterators

:::compare
```js
const xs = [1, 2];
[...xs];                        // [1, 2]
[...xs];                        // [1, 2]: arrays are re-iterable

const it = xs.values();         // an iterator
[...it];                        // [1, 2]
[...it];                        // []: iterators are single-use
it[Symbol.iterator]() === it;   // true
```
```python
xs = [1, 2]
list(xs)                        # [1, 2]
list(xs)                        # [1, 2]: lists are re-iterable

it = iter(xs)                   # an iterator
list(it)                        # [1, 2]
list(it)                        # []: iterators are single-use
iter(it) is it                  # True
```
:::

The split is identical to JavaScript's. An **iterable** (list, tuple, str, dict, set, `range`) returns a *new* iterator from every `iter()` call, so you can loop over it as often as you like. An **iterator** returns *itself* from `iter()` and remembers its position, so it can be consumed exactly once. Every iterator is also iterable, which is why you can hand one to `for` or `list()`, but not every iterable is an iterator.

`range` is the iterable worth knowing well. It's lazy (`range(10**12)` costs nothing), but it isn't an iterator: it supports `len()`, indexing and a constant-time `in` for integers, and you can loop over it again and again.

```python run
nums = range(1, 4)               # a lazy iterable, not an iterator
print(list(nums), list(nums))    # re-iterable
print(len(nums), nums[-1], 2 in nums)

it = iter(nums)
print(iter(it) is it)            # iterators return themselves
print(list(it), list(it))        # single use
```

## Lazy builtins and the exhaustion trap

:::compare
```js
const names = ["ada", "grace"];
const scores = [92, 95];
const pairs = names.map((n, i) => [n, scores[i]]);   // an array

pairs.length;       // 2
pairs[0];           // ["ada", 92]
[...pairs];         // both pairs
[...pairs];         // both pairs, again
```
```python
names = ["ada", "grace"]
scores = [92, 95]
pairs = zip(names, scores)                           # a lazy iterator

len(pairs)          # TypeError: object of type 'zip' has no len()
pairs[0]            # TypeError: 'zip' object is not subscriptable
list(pairs)         # both pairs
list(pairs)         # []: already consumed
```
:::

`map`, `filter`, `zip`, `enumerate` and `reversed` all return iterators, and generators and open files are iterators too. They do no work up front, hold no list, and compute each value when asked, which is great for memory and for pipelines. The price: no `len()`, no indexing, a repr like `<zip object at 0x...>` instead of the contents, and **one pass only**. Dict views (`d.keys()`, `d.items()`) and `range` are the friendly exceptions: lazy, but re-iterable.

:::gotcha Exhaustion fails silently
A second loop over a spent iterator doesn't raise. It just runs zero times. The classic bug: compute something from a `zip` or a generator (a `max()`, a validation pass, a debugging `print(list(it))`), then loop over it again for the real work, and get an empty result with no error anywhere. If you need the values twice, materialise them once with `list(...)`.
:::

```python run
names = ["ada", "grace", "linus"]
scores = [92, 95, 87]

pairs = zip(names, scores)
print(pairs)                          # an iterator object, not its contents
print(max(pairs, key=lambda p: p[1]))
print(dict(pairs))                    # empty: max() consumed everything

pairs = list(zip(names, scores))      # materialise when you need it twice
print(max(pairs, key=lambda p: p[1]), dict(pairs))
```

:::quiz output
What does this print?

```python
it = iter([1, 2, 3, 4, 5])
print(3 in it, list(it))
```

- [ ] `True [1, 2, 3, 4, 5]`
- [x] `True [4, 5]`
- [ ] `True []`
- [ ] `False [4, 5]`

`in` on an iterator has nothing to search but the iterator itself, so it consumes values up to and including the first match. Only `4` and `5` are left for `list()`.
:::

## Generator functions: `yield` ≈ `function*`

:::compare
```js
function* countdown(n) {
  while (n > 0) {
    yield n;
    n--;
  }
}

for (const n of countdown(3)) console.log(n);
[...countdown(3)];   // [3, 2, 1]
```
```python
def countdown(n):
    while n > 0:
        yield n
        n -= 1


for n in countdown(3):
    print(n)
list(countdown(3))   # [3, 2, 1]
```
:::

There's no `function*`: any `def` whose body contains `yield` is a **generator function**. Calling it runs *none* of the body; it returns a generator object, which is an iterator. Each `next()` resumes the body until the next `yield`, hands that value out, and freezes again with every local variable intact. When the body returns, the generator raises `StopIteration` and is finished for good.

```python run
def read_orders():
    print("  (opening the source)")
    for order_id in [101, 102, 103]:
        print(f"  (fetching {order_id})")
        yield order_id
    print("  (closing the source)")


orders = read_orders()
print("nothing has run yet")
print("first:", next(orders))
for order_id in orders:              # resumes where next() left off
    print("got", order_id)
```

:::gotcha One stray `yield` changes the whole function
In JS the `*` sits right in the signature. In Python, a single `yield` anywhere in the body, even in a branch that never runs, makes the whole function a generator function, and calling it executes nothing. A `save_all(records)` that yields progress updates is a silent no-op until something iterates it.
:::

:::quiz output
What does this print?

```python
log = []


def gen():
    log.append("start")
    yield 1
    log.append("end")


g = gen()
log.append("created")
log.append(next(g))
print(log)
```

- [x] `['created', 'start', 1]`
- [ ] `['start', 'created', 1]`
- [ ] `['created', 'start', 1, 'end']`
- [ ] `['start', 1, 'end', 'created']`

`gen()` only creates the generator. The first `next()` runs the body up to `yield 1`, and `"end"` would only be logged by a second `next()`.
:::

## Laziness and infinite generators

:::compare
```js
function* fibonacci() {
  let [a, b] = [0, 1];
  while (true) {
    yield a;
    [a, b] = [b, a + b];
  }
}

fibonacci().take(10).toArray();   // ES2025 iterator helpers
```
```python
def fibonacci():
    a, b = 0, 1
    while True:
        yield a
        a, b = b, a + b


list(islice(fibonacci(), 10))     # itertools.islice ≈ take()
```
:::

Because values are produced on demand, an infinite generator is perfectly fine as long as the consumer stops. `itertools.islice(it, n)` is `take(n)`, `takewhile` stops at the first value that fails a test, and `next()` over a generator expression grabs the first match. Nothing past the last value you ask for is ever computed.

```python run
from itertools import islice, takewhile


def fibonacci():
    a, b = 0, 1
    while True:
        yield a
        a, b = b, a + b


print(list(islice(fibonacci(), 10)))
print(list(takewhile(lambda n: n < 100, fibonacci())))
print(next(n for n in fibonacci() if n > 1_000_000))
```

## `yield from` ≈ `yield*`

:::compare
```js
function* flatten(items) {
  for (const item of items) {
    if (Array.isArray(item)) yield* flatten(item);
    else yield item;
  }
}

[...flatten([1, [2, [3, [4]]]])];   // [1, 2, 3, 4]
```
```python run
def flatten(items):
    for item in items:
        if isinstance(item, list):
            yield from flatten(item)
        else:
            yield item


print(list(flatten([1, [2, [3, [4]]]])))
```
:::

`yield from iterable` yields every value of another iterable, exactly like `yield*`. It accepts any iterable, not just generators, so `yield from range(3)` and `yield from some_list` are fine, and it's what makes recursive generators pleasant. Each level of nesting is still a level of recursion, so [the recursion limit](lesson:functions#recursion-a-low-limit-and-no-tail-calls) applies. `yield from` also forwards `send()` calls and exceptions to the inner generator and evaluates to its return value, which the next section uses.

## `send()`, `return` and the rest of the generator API

:::compare
```js
function* runningMax() {
  let best;
  while (true) {
    const value = yield best;
    if (best === undefined || value > best) best = value;
  }
}

const tracker = runningMax();
tracker.next();                    // run to the first yield
for (const reading of [3, 7, 5, 9]) {
  console.log(reading, tracker.next(reading).value);
}
```
```python run
def running_max():
    best = None
    while True:
        value = yield best
        if best is None or value > best:
            best = value


tracker = running_max()
next(tracker)                      # run to the first yield
for reading in [3, 7, 5, 9]:
    print(reading, tracker.send(reading))
```
:::

`gen.send(value)` resumes the generator and makes the paused `yield` expression evaluate to `value`, which is JS's `gen.next(value)`. The first resume must be a plain `next(gen)` (or `send(None)`), because no `yield` is paused yet to receive anything; sending a real value to a just-started generator raises `TypeError`. `gen.throw(exc)` raises an exception at the paused `yield`, as in JS, and `gen.close()` stops the generator and runs its `finally` blocks, like JS's `gen.return()`.

A `return value` inside a generator ends it, and the value rides along on the `StopIteration` as `.value`, the counterpart of JS's final `{ value, done: true }`. You rarely catch that by hand: `result = yield from sub()` re-yields everything `sub` yields, then evaluates to its return value.

```python run
def read_batch(rows):
    for row in rows:
        yield row.upper()
    return len(rows)                           # becomes StopIteration.value


def read_all(batches):
    total = 0
    for rows in batches:
        total += yield from read_batch(rows)   # re-yield, then collect the return
    print(f"(read {total} rows)")


print(list(read_all([["a", "b"], ["c"]])))
```

You won't write much `send()` code. This pause-and-resume machinery is what asyncio's coroutines grew out of ([Async](lesson:async)), and `@contextmanager` builds a `with` block from a generator with a single `yield` ([Context Managers](lesson:context-managers)). Everyday generators mostly just yield.

:::quiz output
What does this print?

```python
def echo():
    received = yield "ready"
    yield f"got {received}"


g = echo()
print(next(g), g.send("ping"))
```

- [x] `ready got ping`
- [ ] `ready got None`
- [ ] `got ping got ping`
- [ ] `TypeError`

`next(g)` runs to the first `yield` and returns `"ready"`. `send("ping")` resumes it, so `received` is `"ping"`, and the generator runs on to the second `yield`.
:::

:::deep `StopIteration` inside a generator becomes `RuntimeError`
Since Python 3.7 (PEP 479), a `StopIteration` that escapes a generator's body, for example from a bare `next(it)` on an empty iterator, is converted into `RuntimeError: generator raised StopIteration`. Otherwise it would silently end whatever loop was consuming the generator. Inside a generator, use `next(it, default)` or catch `StopIteration` yourself.
:::

## Generator expressions

:::compare
```js
const total = orders.reduce((sum, o) => sum + o.qty * o.price, 0);
const anyLarge = orders.some((o) => o.qty > 100);
```
```python
total = sum(o["qty"] * o["price"] for o in orders)
any_large = any(o["qty"] > 100 for o in orders)
```
:::

A generator expression is a comprehension in round brackets: the same syntax, but it yields values lazily instead of building a list, and as the only argument of a call it can share the call's parentheses. It's a generator in every way that matters here, lazy and single-use, and [Comprehensions](lesson:map-filter-reduce) covers the syntax. The point to add is that `any()`, `all()`, `next()` and `islice()` stop pulling as soon as they have an answer, so the rest of the expression never runs:

```python run
def is_large(n):
    print(f"  checking {n}")
    return n > 2


nums = [1, 2, 3, 4, 5]
print(any(is_large(n) for n in nums))       # stops at the first True
print(any([is_large(n) for n in nums]))     # the list checks everything first
```

## An `itertools` tour

:::compare
```js
// lodash
_.take(xs, 3);
_.takeWhile(xs, (x) => x < 10);
_.flatten([a, b]);
_.zip(a, b);             // pads with undefined
_.chunk(xs, 3);
```
```python
# itertools
list(islice(xs, 3))
list(takewhile(lambda x: x < 10, xs))
list(chain(a, b))
list(zip_longest(a, b))  # pads with None
list(batched(xs, 3))     # 3.12+, yields tuples
```
:::

`itertools` is the standard library's lodash for iterators. Every function takes iterables, returns a lazy iterator, and composes with the others. Wrap a result in `list()` when you want to look at it.

### Infinite sources and slices

```python run
from itertools import count, cycle, dropwhile, islice, repeat, takewhile

for ticket, name in zip(count(100), ["ada", "grace"]):
    print(ticket, name)
print(list(islice(cycle("RGB"), 7)))
print(list(repeat("-", 3)), list(map(pow, [2, 3, 4], repeat(2))))

log = ["# header", "# v2", "start", "# note", "stop"]
print(list(islice(log, 1, 4)))                                  # like log[1:4]
print(list(takewhile(lambda line: line.startswith("#"), log)))
print(list(dropwhile(lambda line: line.startswith("#"), log)))
```

`zip(count(100), xs)` pairs up exactly like `enumerate(xs, start=100)`, and `count` also takes a step, floats included. `islice(it, start, stop, step)` is slicing for iterators, minus negative indices, since an iterator doesn't know where it ends. `takewhile` yields the prefix that passes a test, and `dropwhile` skips that prefix and yields everything after it, including later items that would have passed.

### Combining and grouping

```python run
from itertools import batched, chain, groupby, pairwise, zip_longest

print(list(chain([1, 2], (3,), "ab")))
print(list(chain.from_iterable([[1, 2], [3], []])))       # flatten one level
print(list(zip_longest("abc", [1, 2], fillvalue="-")))
readings = [10, 13, 19, 20]
print([b - a for a, b in pairwise(readings)])              # deltas (3.10+)
print(list(batched(range(7), 3)))                          # chunks (3.12+)
print([(k, len(list(g))) for k, g in groupby("aaabcc")])   # runs
```

`batched(xs, n, strict=True)` (3.13+) raises if the last batch comes up short, the same check `zip(..., strict=True)` does for plain `zip` ([Control Flow](lesson:control-flow)).

:::gotcha `groupby` groups runs, not keys
`groupby` starts a new group every time the key changes, like Unix `uniq`, so it is not `Object.groupBy`: unsorted input produces the same key several times. Sort by the same key first, or use a `defaultdict(list)` ([Comprehensions](lesson:map-filter-reduce) has both). And consume each group before advancing. The groups share one underlying iterator, so `list(groupby(xs))` leaves every group empty.
:::

### Combinatorics and running totals

```python run
import operator
from itertools import accumulate, combinations, permutations, product, starmap

print(list(product(["S", "M"], ["red", "blue"])))    # nested loops, flattened
print(list(permutations("abc", 2)))                  # order matters
print(list(combinations("abcd", 2)))                 # order doesn't
print(list(accumulate([100, -20, 50, -70])))         # running balance: a scan
print(list(accumulate([3, 1, 4, 1, 5], max)))        # running maximum
print(list(accumulate([1, 2, 3], operator.mul, initial=10)))
print(list(starmap(pow, [(2, 5), (3, 2)])))          # pow(*pair) for each pair
```

`accumulate` is the `scan` JavaScript never added: a `reduce` that yields every intermediate result, with an optional `initial`. `starmap(f, pairs)` calls `f(*pair)` for each pair, the Python spelling of `pairs.map(([a, b]) => f(a, b))`.

`tee(it, n)` splits one iterator into `n` independent ones. It buffers whatever one copy has seen and the others haven't, so if one copy runs far ahead it's no better than `list()`, and once you've teed an iterator you must stop using the original.

```python run
from itertools import pairwise, tee

readings = iter([3, 5, 4, 8])           # a single-use iterator
for_max, for_deltas = tee(readings)
print(max(for_max))
print([b - a for a, b in pairwise(for_deltas)])
```

| `itertools` | Yields | JS / lodash |
| --- | --- | --- |
| `count(10)` | 10, 11, 12, ... forever | a `while (true)` generator |
| `cycle(xs)` | `xs` over and over | |
| `repeat(x, n)` | `x`, `n` times (or forever) | `Array(n).fill(x)` |
| `islice(it, n)` / `islice(it, n, None)` | a slice of any iterator | `it.take(n)` / `it.drop(n)` |
| `takewhile(p, it)` / `dropwhile(p, it)` | the passing prefix / the rest | `_.takeWhile` / `_.dropWhile` |
| `chain(a, b)` / `chain.from_iterable(xss)` | concatenation / one level flattened | `[...a, ...b]` / `xss.flat()` |
| `zip_longest(a, b, fillvalue=x)` | pairs, padding the shorter side | `_.zip` |
| `pairwise(xs)` (3.10) | overlapping pairs | |
| `batched(xs, n)` (3.12) | tuples of `n` | `_.chunk` |
| `groupby(xs, key)` | runs of equal keys | not `Object.groupBy` |
| `product(a, b)` | the cartesian product | nested loops |
| `permutations(xs, r)` / `combinations(xs, r)` | orderings / subsets | |
| `accumulate(xs, fn, initial=)` | running results | RxJS `scan` |
| `starmap(fn, pairs)` | `fn(*pair)` for each pair | |
| `tee(it, n)` | `n` independent copies | |

## Lazy pipelines and the ES2025 iterator helpers

:::compare
```js
const firstErrors = Iterator.from(lines)
  .map((line) => line.trim())
  .filter((line) => line.startsWith("ERROR"))
  .take(3)
  .toArray();
```
```python
stripped = (line.strip() for line in lines)
errors = (line for line in stripped if line.startswith("ERROR"))
first_errors = list(islice(errors, 3))
```
:::

ES2025 gave JavaScript iterators lazy `map`, `filter`, `take` and friends, and they line up one for one with Python's tools. The difference is shape. JS chains methods left to right, while Python's tools are functions and generator expressions, so a long pipeline written as one expression nests inside out. The idiom is to name each stage, as above. Nothing runs until the last line pulls values through, and only as many lines as needed are ever read.

| ES2025 iterator helper | Python |
| --- | --- |
| `it.map(f)` | `(f(x) for x in it)` or `map(f, it)` |
| `it.filter(p)` | `(x for x in it if p(x))` or `filter(p, it)` |
| `it.take(n)` / `it.drop(n)` | `islice(it, n)` / `islice(it, n, None)` |
| `it.flatMap(f)` | `(y for x in it for y in f(x))` |
| `it.reduce(f, init)` | `functools.reduce(f, it, init)` |
| `it.toArray()` | `list(it)` |
| `it.forEach(f)` | a `for` loop |
| `it.some(p)` / `it.every(p)` | `any(p(x) for x in it)` / `all(p(x) for x in it)` |
| `it.find(p)` | `next((x for x in it if p(x)), None)` |
| `Iterator.from(obj)` | `iter(obj)` |

```python run
from itertools import islice

log_lines = [
    "200 /home 12",
    "500 /api/users 340",
    "200 /about 8",
    "503 /api/orders 1200",
    "500 /api/users 290",
]


def parse(lines):
    for line in lines:
        print(f"  parsing {line!r}")
        status, path, ms = line.split()
        yield int(status), path, int(ms)


errors = (record for record in parse(log_lines) if record[0] >= 500)
for status, path, ms in islice(errors, 2):
    print(status, path, ms)
```

:::pythonic Name the stages
A pipeline of small generator functions (read, parse, keep the errors, take a few) reads like a Unix pipe, holds one record in memory at a time, and lets you test each stage on a plain list. File objects are already lazy line iterators, so the same pipeline streams a multi-gigabyte log in constant memory.
:::

## Custom iterables: make `__iter__` a generator

:::compare
```js
class Tree {
  constructor(value, left = null, right = null) {
    Object.assign(this, { value, left, right });
  }

  *[Symbol.iterator]() {
    if (this.left) yield* this.left;
    yield this.value;
    if (this.right) yield* this.right;
  }
}
```
```python
class Tree:
    def __init__(self, value, left=None, right=None):
        self.value, self.left, self.right = value, left, right

    def __iter__(self):
        if self.left is not None:
            yield from self.left
        yield self.value
        if self.right is not None:
            yield from self.right
```
:::

Implementing `__iter__` makes any object work with `for`, unpacking, `list()`, `in`, `sorted()`, `sum()` and the rest. Writing it as a generator method is the idiomatic shortcut, exactly like `*[Symbol.iterator]()`: every `iter()` call starts a fresh generator, so the object stays re-iterable, and you never write `__next__` or raise `StopIteration` yourself. The other container protocols live in [Dunder Methods](lesson:dunder-methods).

```python run
class Tree:
    def __init__(self, value, left=None, right=None):
        self.value, self.left, self.right = value, left, right

    def __iter__(self):                  # in order: left, value, right
        if self.left is not None:
            yield from self.left
        yield self.value
        if self.right is not None:
            yield from self.right


tree = Tree(5, Tree(3, Tree(1)), Tree(8, None, Tree(9)))
print(list(tree), list(tree))            # re-iterable
print(sum(tree), 8 in tree, max(tree))
smallest, *rest = tree                   # unpacking works too
print(smallest, rest)
```

:::deep The long way: an iterator class
Without a generator you implement both halves of the protocol: the iterable's `__iter__` returns a fresh iterator object, and that object implements `__next__` (raising `StopIteration` at the end) plus an `__iter__` that returns itself.

```python
class Countdown:
    def __init__(self, start):
        self.start = start

    def __iter__(self):
        return CountdownIterator(self.start)


class CountdownIterator:
    def __init__(self, n):
        self.n = n

    def __iter__(self):
        return self

    def __next__(self):
        if self.n <= 0:
            raise StopIteration
        self.n -= 1
        return self.n + 1
```

A generator method replaces both classes with a three-line `while` loop.
:::

## Cheat sheet

| JavaScript | Python | Notes |
| --- | --- | --- |
| `obj[Symbol.iterator]()` | `iter(obj)` | calls `__iter__` |
| `it.next()` → `{ value, done }` | `next(it)` | raises `StopIteration` at the end |
| `it.next().value ?? fallback` | `next(it, fallback)` | no exception |
| `function* gen() {}` | `def gen():` with `yield` | no star |
| `yield* other` | `yield from other` | any iterable |
| `gen.next(value)` | `gen.send(value)` | prime with `next()` first |
| `gen.return()` / `gen.throw(e)` | `gen.close()` / `gen.throw(e)` | |
| final `{ value: x, done: true }` | `return x` → `StopIteration.value` | `r = yield from gen()` |
| `*[Symbol.iterator]() {}` | `def __iter__(self): yield ...` | re-iterable |
| `arr.map(f)` (an array) | `map(f, xs)` (an iterator!) | one pass, no `len()` |
| `[...it]` / `Array.from(it)` | `list(it)` | consumes it |
| `it.take(n)` / `it.drop(n)` | `islice(it, n)` / `islice(it, n, None)` | |
| `xss.flat()` | `chain.from_iterable(xss)` | lazy |
| `_.chunk(xs, n)` | `batched(xs, n)` | 3.12+, tuples |
| `Object.groupBy` | `defaultdict(list)` | `groupby` only groups runs |
| RxJS `scan` | `accumulate(xs)` | |

## Challenges

:::challenge id=iter-summary-stats title="Summarize any iterable" difficulty=easy
Write `summarize(numbers)` that returns a tuple `(lowest, highest, mean)`. `numbers` can be any iterable of numbers: a list, but also a generator or a `map` object, which can only be looped over **once** and have no `len()`. Raise `ValueError` if there are no numbers.

```text
summarize([4, 8, 6])                  ->  (4, 8, 6.0)
summarize(n * 2 for n in [1, 2, 3])   ->  (2, 6, 4.0)
```

The starter works on lists and breaks on everything else. Fix it.

```js
function summarize(numbers) {
  const xs = [...numbers];
  if (xs.length === 0) throw new RangeError("no numbers");
  return [Math.min(...xs), Math.max(...xs), xs.reduce((a, b) => a + b, 0) / xs.length];
}
```

```python starter
def summarize(numbers):
    return min(numbers), max(numbers), sum(numbers) / len(numbers)
```

```python solution
def summarize(numbers):
    values = list(numbers)
    if not values:
        raise ValueError("summarize() needs at least one number")
    return min(values), max(values), sum(values) / len(values)
```

```python tests
@test("works on a list")
def _():
    eq(summarize([4, 8, 6]), (4, 8, 6.0))

@test("works on a generator expression")
def _():
    eq(summarize(n * 2 for n in [1, 2, 3]), (2, 6, 4.0))

@test("works on a map object")
def _():
    eq(summarize(map(int, ["10", "30"])), (10, 30, 20.0))

@test("works on a one-shot iterator with a single item")
def _():
    eq(summarize(iter([7])), (7, 7, 7.0))

@test("raises ValueError when there are no numbers")
def _():
    raises(ValueError, summarize, [])
    raises(ValueError, summarize, iter([]))
```

```hint
`min()` consumes a generator completely, so the `max()` after it sees an empty iterator.
```

```hint
Materialise the input once, `values = list(numbers)`, then compute everything from the list.
```
:::

:::challenge id=iter-paginated title="Lazy pagination" difficulty=medium
APIs hand out results a page at a time. Write a class `Paginated` whose constructor takes `fetch_page`, a function that takes a page number (starting at 1) and returns a list of items, or an empty list once you're past the last page. Iterating a `Paginated` yields every **item** from every page, in order.

- It must be **lazy**: fetch a page only when the iteration needs it, so stopping early never fetches pages you didn't use.
- It must be **re-iterable**: each new loop starts again from page 1.

```js
class Paginated {
  constructor(fetchPage) {
    this.fetchPage = fetchPage;
  }

  *[Symbol.iterator]() {
    for (let page = 1; ; page++) {
      const items = this.fetchPage(page);
      if (items.length === 0) return;
      yield* items;
    }
  }
}
```

```python starter
class Paginated:
    def __init__(self, fetch_page):
        self.fetch_page = fetch_page
```

```python solution
from itertools import count


class Paginated:
    def __init__(self, fetch_page):
        self.fetch_page = fetch_page

    def __iter__(self):
        for page in count(1):
            items = self.fetch_page(page)
            if not items:
                return
            yield from items
```

```python tests
def fake_api(pages):
    """A fake fetch_page over `pages` (a list of lists) that records each request."""
    requested = []

    def fetch_page(number):
        requested.append(number)
        return pages[number - 1] if number <= len(pages) else []

    return fetch_page, requested


@test("yields every item across pages, in order")
def _():
    fetch, _ = fake_api([[1, 2], [3], [4, 5]])
    eq(list(Paginated(fetch)), [1, 2, 3, 4, 5])

@test("stops at the first empty page")
def _():
    fetch, requested = fake_api([["a"], ["b"]])
    eq(list(Paginated(fetch)), ["a", "b"])
    eq(requested, [1, 2, 3], "fetch pages 1 and 2, then 3 (empty), and stop")

@test("an empty API yields nothing")
def _():
    fetch, _ = fake_api([])
    eq(list(Paginated(fetch)), [])

@test("is lazy: only fetches the pages it needs")
def _():
    fetch, requested = fake_api([[1, 2], [3, 4], [5, 6]])
    pages = Paginated(fetch)
    eq(requested, [], "creating a Paginated shouldn't fetch anything")
    items = iter(pages)
    eq([next(items), next(items)], [1, 2])
    eq(requested, [1], "the first two items come from page 1 alone")
    eq(next(items), 3)
    eq(requested, [1, 2])

@test("is re-iterable: every loop starts from page 1")
def _():
    fetch, requested = fake_api([[1], [2]])
    pages = Paginated(fetch)
    eq(list(pages), [1, 2])
    eq(list(pages), [1, 2], "a second loop should fetch again from the start")
```

```hint
Write `__iter__` as a generator method. Loop over page numbers with `itertools.count(1)` (or a `while True` with a counter).
```

```hint
For each page, `return` if it's empty; otherwise `yield from` its items.
```
:::

:::challenge id=iter-sliding-window title="Sliding window" difficulty=hard
Write a generator function `windows(iterable, size)` that yields every run of `size` consecutive items as a tuple:

```text
list(windows([1, 2, 3, 4, 5], 3))  ->  [(1, 2, 3), (2, 3, 4), (3, 4, 5)]
list(windows("ab", 3))             ->  []
```

It must work on **any** iterable, including one-shot and infinite iterators, so you can't index, slice or call `len()` on the input. Read only as much input as each window needs, and hold at most `size` items. `itertools.pairwise` is the `size == 2` case, and a `collections.deque(maxlen=size)` makes a natural buffer.

Raise `ValueError` if `size` is less than 1. Because `windows` is a generator, that error naturally surfaces on the first `next()` rather than at the call, which is fine.

```js
function* windows(iterable, size) {
  const window = [];
  for (const item of iterable) {
    window.push(item);
    if (window.length > size) window.shift();
    if (window.length === size) yield [...window];
  }
}
```

```python starter
def windows(iterable, size):
    ...
```

```python solution
from collections import deque


def windows(iterable, size):
    if size < 1:
        raise ValueError("size must be at least 1")
    window = deque(maxlen=size)
    for item in iterable:
        window.append(item)            # a full deque drops its oldest item
        if len(window) == size:
            yield tuple(window)
```

```python tests
import inspect
from itertools import islice


def guarded(n):
    """Yields 0 .. n-1, then fails loudly if anyone asks for more."""
    yield from range(n)
    raise AssertionError("windows() read more input than it needed")


@test("yields each window as a tuple")
def _():
    eq(list(windows([1, 2, 3, 4, 5], 3)), [(1, 2, 3), (2, 3, 4), (3, 4, 5)])

@test("input shorter than size gives no windows")
def _():
    eq(list(windows("ab", 3)), [])
    eq(list(windows([], 1)), [])

@test("size 1 yields 1-tuples")
def _():
    eq(list(windows([7, 8], 1)), [(7,), (8,)])

@test("works on a one-shot iterator")
def _():
    eq(list(windows(iter("abcd"), 2)), [("a", "b"), ("b", "c"), ("c", "d")])

@test("is lazy: reads only the input it needs")
def _():
    eq(list(islice(windows(guarded(4), 2), 3)), [(0, 1), (1, 2), (2, 3)])

@test("is a generator function")
def _():
    check(inspect.isgeneratorfunction(windows), "use `yield` so windows are produced one at a time")

@test("size < 1 raises ValueError")
def _():
    raises(ValueError, lambda: list(windows([1, 2], 0)))
```

```hint
A `deque(maxlen=size)` drops its oldest item automatically when you append to a full one.
```

```hint
Append each item, and once the deque holds `size` items, `yield tuple(window)`. Yield a tuple copy: the deque keeps changing after you hand it out.
```
:::
