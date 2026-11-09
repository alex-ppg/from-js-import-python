---
title: "Performance: Measure, Then Speed Up"
part: Quality & Testing
summary: timeit and cProfile, the big-O of the built-ins, and the structure swaps that turn minutes into milliseconds.
minutes: 40
---

Your sense of what's fast was trained on V8, which JIT-compiles hot loops to machine code. CPython interprets bytecode, so a tight arithmetic loop typically runs an order of magnitude slower, and the micro-tricks you'd use in JS rarely pay off. What pays off is the same thing that matters everywhere, only more so: the algorithm and the data structure. A list where you needed a set, `pop(0)` where you needed a deque, or a `max()` inside a loop that should have run once turns a 50 ms job into a five-minute one.

So the workflow is: measure, find the hot spot, fix the structure, measure again. This lesson covers the measuring tools, what each built-in operation costs, and the fixes that come up again and again. The sandbox runs CPython compiled to WebAssembly, two to three times slower than a native build, so read the numbers in these playgrounds as ratios.

## Timing code: `perf_counter` and `timeit`

:::compare
```js
const start = performance.now();
buildReport(orders);
console.log(`${(performance.now() - start).toFixed(1)} ms`);

// micro-benchmarks: tinybench, mitata, benchmark.js
bench.add("report", () => buildReport(orders));
```
```python
import time
from timeit import repeat

start = time.perf_counter()
build_report(orders)
print(f"{(time.perf_counter() - start) * 1000:.1f} ms")

best = min(repeat(lambda: build_report(orders), number=100, repeat=5))
```
:::

`time.perf_counter()` is `performance.now()` in **seconds**: a monotonic, high-resolution clock for measuring durations. That's enough to time one slow job. For small, fast code, use `timeit`. It runs the code `number` times in a loop, switches the garbage collector off while it does, and returns the total in seconds. `repeat` does that several times, and the number to report is the **minimum**: the fastest round is the code's real speed, and the slower ones are measuring interference from everything else running on the machine.

```python run
from timeit import repeat

prices = [19.99, 5.25, 3.50, 12.00] * 25_000

def total_loop():
    total = 0.0
    for price in prices:
        total += price
    return total

def total_builtin():
    return sum(prices)

for fn in (total_loop, total_builtin):
    best = min(repeat(fn, number=20, repeat=5)) / 20
    print(f"{fn.__name__:<14} {best * 1000:6.2f} ms per call")
```

:::pythonic Let the built-ins do the looping
That gap is the first rule of fast Python. `sum`, `min`, `max`, `sorted`, `any`, `str.join`, set operations and `Counter` run their loops in C, while a hand-written `for` loop pays the interpreter for every step. The idiomatic version is usually the fast one too.
:::

For quick experiments, `python -m timeit` picks the loop count itself and prints the best round:

```bash
python -m timeit -s "words = ['ada', 'grace'] * 500" "'-'.join(words)"
# 50000 loops, best of 5: 7.91 usec per loop
```

:::tip Pass a callable, not a string
`timeit("build_report(orders)")` runs the string in a fresh namespace, so it raises `NameError`. Pass a callable such as `lambda: build_report(orders)`, or add `globals=globals()`. In Jupyter or IPython, `%timeit build_report(orders)` does it all for you.
:::

:::quiz
`repeat(fn, number=100, repeat=3)` returns `[0.52, 0.48, 0.61]`. Which figure best describes how fast `fn` is?

- [ ] The mean, 0.537 s per 100 calls
- [x] The minimum, 0.48 s per 100 calls
- [ ] The maximum, 0.61 s per 100 calls
- [ ] None of them: one round is too noisy, so call it again with `repeat=1`

Noise only ever makes a round slower, never faster, so the minimum is the closest to the true cost. The `timeit` docs say so explicitly. Mean and standard deviation mostly describe the other processes on your machine.
:::

## Profiling: find the hot spot first

:::compare
```js
// node --cpu-prof report.js  -> open the .cpuprofile in DevTools
console.profile("report");
const fresh = findNewSignups(signups, existing);
console.profileEnd("report");
```
```python
# python -m cProfile -s cumtime report.py
import cProfile, pstats

with cProfile.Profile() as profiler:
    fresh = find_new_signups(signups, existing)
pstats.Stats(profiler).sort_stats("cumtime").print_stats(10)
```
:::

Guessing where the time goes is unreliable in any language, and more so in a new one. `cProfile` records every function call and reports, per function, `ncalls`, `tottime` (time spent in the function's own code) and `cumtime` (including everything it called). Sort by `cumtime` to find the expensive branch of the call tree, then by `tottime` to find the function that's actually burning the time.

```python run
import cProfile
import pstats

def normalise(email):
    return email.strip().lower()

def find_new_signups(signups, existing):
    known = [normalise(e) for e in existing]
    return [e for e in signups if normalise(e) not in known]

existing = [f"user{i}@example.com" for i in range(3_000)]
signups = [f" User{i}@Example.com" for i in range(2_000, 5_000)]

with cProfile.Profile() as profiler:
    fresh = find_new_signups(signups, existing)
stats = pstats.Stats(profiler)
stats.sort_stats("tottime").print_stats(4)
print(len(fresh), "new signups")
```

Read it top-down. `normalise` runs 6,000 times but costs almost nothing. Nearly all of the `tottime` belongs to `find_new_signups` itself, and the only expensive thing it does is `not in known`, a linear scan of a 3,000-item list for each of 3,000 signups. The profiler can't name the operator (it only sees function calls), but it narrows the search to a few lines. Make `known` a set and the whole function drops to a few milliseconds.

:::tip Profilers worth installing
`cProfile` adds overhead to every call, so its absolute numbers are inflated: compare ratios. For a running service, the sampling profiler **py-spy** attaches to a live process without restarting it and draws flame graphs, much like `0x` or clinic.js for Node: `py-spy record -o profile.svg --pid 12345`. **scalene** profiles CPU and memory line by line, `line_profiler` times individual lines of a function you mark, and `snakeviz` turns a `python -m cProfile -o out.prof app.py` file into an interactive chart. Slow start-up? `python -X importtime app.py` shows what every import costs.
:::

## What the built-ins cost

:::compare
```js
users.includes(user);                          // a scan
userSet.has(user);                             // a hash lookup
const best = scores.toSorted((a, b) => b - a)[0];   // sorts everything
```
```python
user in users                                  # O(n): a scan
user in user_set                               # O(1) on average: a hash lookup
best = max(scores)                             # O(n): no sort needed
```
:::

The complexity classes are the ones you know from JS. What changes is how hard an interpreter punishes a needless O(n) per item. Most performance bugs are exactly that: a hidden linear operation inside a loop. These are the costs to know, in CPython:

| Operation | Cost | Notes |
| --- | --- | --- |
| `xs[i]`, `xs[i] = v`, `len(xs)` | O(1) | `len` is stored, never counted |
| `xs.append(v)`, `xs.pop()` | O(1) amortised | `push`, `pop` |
| `xs.pop(0)`, `xs.insert(0, v)`, `del xs[0]` | **O(n)** | every element shifts, like `shift`/`unshift` |
| `v in xs`, `xs.index(v)`, `xs.count(v)`, `xs.remove(v)` | **O(n)** | a linear scan, like `includes`/`indexOf` |
| `xs[a:b]`, `xs + ys`, `xs.copy()` | O(k) | k = the number of items copied |
| `xs.sort()`, `sorted(xs)` | O(n log n) | close to O(n) when the data is already mostly sorted |
| `min(xs)`, `max(xs)`, `sum(xs)` | O(n) | |
| `d[k]`, `d[k] = v`, `k in d`, `d.get(k)`, `del d[k]` | O(1) average | `Map` |
| `v in d.values()` | **O(n)** | values aren't indexed |
| `s.add(v)`, `v in s`, `s.discard(v)` | O(1) average | `Set` |
| `a \| b`, `a & b`, `a - b` on sets | O(len(a) + len(b)), O(min(len(a), len(b))), O(len(a)) | |
| `dq.append`, `dq.appendleft`, `dq.pop`, `dq.popleft` | O(1) | `collections.deque` |
| `dq[i]` | O(n) in the middle | O(1) at either end |
| `heapq.heappush`, `heapq.heappop` | O(log n) | `heapify` is O(n) |
| `bisect.bisect_left(xs, v)` | O(log n) | `xs` must be sorted |
| `bisect.insort(xs, v)` | O(n) | the search is fast, the insert shifts |
| `s + t` on strings | O(len(s) + len(t)) | builds a new string |
| `"".join(parts)` | O(total length) | |

"Average" is the fine print of hashing: a dict or set lookup is constant time unless many keys collide, which is rare in practice.

:::quiz
Which of these is **not** constant time on a list `xs` with a million items?

- [ ] `xs[-1]`
- [ ] `len(xs)`
- [ ] `xs.pop()`
- [x] `xs.pop(0)`

Removing the first item shifts the 999,999 others down one slot. `pop()` from the end, indexing and `len` are all O(1). If you take items from the front, use a `deque`.
:::

O(n) per operation adds up to O(n²) for a loop. The shift is a fast block copy, so you won't notice it below a few thousand items, which is exactly why it survives code review:

```python run
import time
from collections import deque

def drain_list(n):
    queue = list(range(n))
    while queue:
        queue.pop(0)

def drain_deque(n):
    queue = deque(range(n))
    while queue:
        queue.popleft()

for n in (20_000, 40_000, 80_000, 160_000):
    timings = []
    for drain in (drain_list, drain_deque):
        start = time.perf_counter()
        drain(n)
        timings.append(f"{drain.__name__} {(time.perf_counter() - start) * 1000:6.1f} ms")
    print(f"n={n:>7,}   " + "   ".join(timings))
```

Each doubling of `n` roughly quadruples the list's time and only doubles the deque's.

## Choosing the right structure

The fix for a slow loop is usually a different container, chosen by asking how the data is accessed.

### Lookups: sets and dict indexes

:::compare
```js
const withCustomers = orders.map((order) => ({
  ...order,
  customer: customers.find((c) => c.id === order.customerId),
}));
```
```python
customers_by_id = {c["id"]: c for c in customers}   # once: O(m)
with_customers = [
    {**order, "customer": customers_by_id.get(order["customer_id"])}
    for order in orders                              # then O(1) each
]
```
:::

`find` inside `map` is a nested loop: orders × customers. Build a dict keyed by the field you join on, once, and every lookup becomes a hash probe. It's the hash join that databases do for you. The same goes for membership: `x in some_list` inside a loop should almost always be `x in some_set`, with the set built before the loop. [Sets](lesson:sets#fast-membership) has the timing demo, and the first challenge below has you apply it.

```python run
import time

customers = [{"id": i, "name": f"customer {i}"} for i in range(5_000)]
orders = [{"id": n, "customer_id": (n * 7) % 5_000} for n in range(5_000)]

start = time.perf_counter()
slow = [next(c for c in customers if c["id"] == o["customer_id"]) for o in orders]
print(f"scan per order: {(time.perf_counter() - start) * 1000:7.1f} ms")

start = time.perf_counter()
by_id = {c["id"]: c for c in customers}
fast = [by_id[o["customer_id"]] for o in orders]
print(f"dict index:     {(time.perf_counter() - start) * 1000:7.1f} ms")
print(slow == fast)
```

### Queues: `deque`

:::compare
```js
const queue = [start];
while (queue.length) {
  const page = queue.shift();
  queue.push(...links[page]);
}
```
```python
from collections import deque

queue = deque([start])
while queue:
    page = queue.popleft()           # O(1), whatever the size
    queue.extend(links[page])
```
:::

A `deque` (double-ended queue) is O(1) at both ends. Use it for any FIFO queue (BFS, job queues, retry queues), for a bounded history with `deque(maxlen=100)`, and for rotating with `rotate(k)`. It isn't a list replacement, though: indexing into the middle is O(n), and it can't be sliced.

### The smallest few: `heapq`

:::compare
```js
const top3 = scores.toSorted((a, b) => b - a).slice(0, 3);

// "always give me the job due soonest": re-sort, or install a heap
jobs.push(job);
jobs.sort((a, b) => a.due - b.due);
const next = jobs.shift();
```
```python
import heapq

top3 = heapq.nlargest(3, scores)

# a heap keeps the smallest item at index 0
heapq.heappush(jobs, (job.due, job.name))

next_job = heapq.heappop(jobs)       # O(log n)
```
:::

`heapq` turns a plain list into a binary min-heap. `heappush` and `heappop` are O(log n), and `jobs[0]` is always the smallest item. `nlargest(k, items)` and `nsmallest` find a top-k in O(n log k) without sorting everything, though for k close to n a plain `sorted(...)[:k]` is faster. The [standard library tour](lesson:standard-library#small-modules-worth-knowing) introduces it; [Data Wrangling](lesson:data-wrangling) uses it for top-N reports.

### Sorted data: `bisect`

:::compare
```js
// first tier whose limit is >= weight: a linear scan
const tier = limits.findIndex((limit) => weight <= limit);
```
```python
from bisect import bisect_left

# binary search over the sorted limits: O(log n)
tier = bisect_left(limits, weight)
```
:::

`bisect_left(xs, v)` returns the index where `v` would be inserted to keep `xs` sorted, so it doubles as "the first item that is ≥ v". `bisect_right` gives the position after any equal items ("the first item > v"). Both take a `key=` function (3.10+), and `insort` inserts while keeping the order. That turns range lookups (price tiers, time windows, version ranges) from a scan into a binary search.

```python run
import heapq
from bisect import bisect_left

limits = [1, 5, 20, 50]                  # kg; sorted
prices = ["$4", "$9", "$25", "$60", "freight"]
for weight in (0.5, 5, 5.1, 75):
    print(f"{weight:>5} kg -> {prices[bisect_left(limits, weight)]}")

latencies = [120, 85, 430, 97, 1_200, 66, 310]
print("slowest:", heapq.nlargest(3, latencies))

jobs = []
for due, name in [(30, "invoice"), (10, "backup"), (20, "report")]:
    heapq.heappush(jobs, (due, name))
print("next:", heapq.heappop(jobs), "then:", jobs[0])
```

## Generators keep memory flat

:::compare
```js
const doubled = orders.map((o) => o.total * 2);   // a whole new array
const total = doubled.reduce((a, b) => a + b, 0);
```
```python
total = sum(o["total"] * 2 for o in orders)       # one item at a time

import sys
sys.getsizeof([x for x in range(10**6)])          # megabytes
sys.getsizeof(x for x in range(10**6))            # a few hundred bytes at most
```
:::

A list comprehension materialises every result before `sum` sees the first one. A [generator expression](lesson:map-filter-reduce#generator-expressions-lazy-comprehensions) hands them over one at a time, so its memory use stays flat however much data flows through. It isn't faster, though, and it's single-use: when you need the results twice, or need `len()` or indexing, keep the list.

`sys.getsizeof` is **shallow**: it measures the container itself (for a list, one pointer per slot) and not the objects inside. For the real footprint of some code, trace its allocations with `tracemalloc`:

```python run
import sys
import tracemalloc

def peak_bytes(fn):
    tracemalloc.start()
    fn()
    peak = tracemalloc.get_traced_memory()[1]
    tracemalloc.stop()
    return peak

n = 500_000
print(f"list object: {sys.getsizeof([i * 2 for i in range(n)]):>10,} bytes")
print(f"generator:   {sys.getsizeof(i * 2 for i in range(n)):>10,} bytes")
print(f"peak, sum of a list:      {peak_bytes(lambda: sum([i * 2 for i in range(n)])):>10,} bytes")
print(f"peak, sum of a generator: {peak_bytes(lambda: sum(i * 2 for i in range(n))):>10,} bytes")
```

:::note The sandbox is a 32-bit build
WebAssembly uses 4-byte pointers, so object sizes here come out at roughly half of what a 64-bit machine reports. The ratios are what carry over.
:::

:::quiz output
What does this print?

```python
import sys

short = ["a"] * 1_000
long = ["a" * 10_000] * 1_000
print(sys.getsizeof(short) == sys.getsizeof(long))
```

- [x] `True`
- [ ] `False`
- [ ] `TypeError`

Both lists hold 1,000 references, and `getsizeof` only measures the list object, not the strings it points to. That's why it's the wrong tool for "how much memory does this data take?". Reach for `tracemalloc` instead.
:::

## Caching repeated work

:::compare
```js
import memoize from "lodash/memoize.js";

const parseAgent = memoize((ua) => expensiveParse(ua));

parseAgent.cache.size;              // inspect the Map
```
```python
from functools import lru_cache

@lru_cache(maxsize=1024)
def parse_agent(ua):
    return expensive_parse(ua)

parse_agent.cache_info()            # hits, misses, size
```
:::

When a pure function is called over and over with the same arguments, cache it. [Decorators](lesson:decorators#functools-cache-and-lru-cache) covers `@cache` and `@lru_cache` in general. The performance angle comes down to four rules:

- **Check that it hits.** `cache_info()` reports hits and misses. A cache that only ever misses is pure overhead.
- **Bound it.** `@cache` never forgets, so in a long-running process it's a slow memory leak. `@lru_cache(maxsize=...)` evicts the least recently used entry.
- **Only cache pure functions.** Anything that reads the clock, the database or the network will serve stale answers. Time-based expiry needs a library such as `cachetools`.
- **Arguments must be hashable.** Lists and dicts raise `TypeError`, so pass tuples, or cache an inner function that closes over the unhashable data.

```python run
import re
from functools import lru_cache

@lru_cache(maxsize=256)
def browser(user_agent):
    match = re.search(r"(Firefox|Chrome|Safari)/(\d+)", user_agent)
    return f"{match[1]} {match[2]}" if match else "other"

agents = [
    "Mozilla/5.0 (Windows NT 10.0) Chrome/126.0 Safari/537.36",
    "Mozilla/5.0 (X11; Linux x86_64) Firefox/127.0",
    "curl/8.5.0",
] * 10_000
print(sorted({browser(ua) for ua in agents}))
print(browser.cache_info())
```

:::quiz output
What does this print?

```python
from functools import cache

@cache
def rate(currency):
    return {"EUR": 1.08, "GBP": 1.27}.get(currency, 1.0)

for currency in ["EUR", "GBP", "EUR", "EUR", "USD"]:
    rate(currency)
print(rate.cache_info().hits)
```

- [ ] `5`
- [ ] `3`
- [x] `2`
- [ ] `0`

Three distinct arguments means three misses. The second and third `"EUR"` calls are the only hits.
:::

:::gotcha Memoised recursion still recurses
`@cache` makes recursive functions fast, but each uncached call still adds a stack frame, and CPython stops at about 1,000 frames ([Functions](lesson:functions#recursion-a-low-limit-and-no-tail-calls)). In this sandbox, recursion through `@cache` gets even less room: somewhere between 600 and 800 levels, depending on the browser, it overflows the WebAssembly stack and crashes the interpreter, so keep it to a few hundred. For deep inputs, fill a table bottom-up in a loop instead, as [Dynamic Programming](lesson:dynamic-programming) does.
:::

## Hoisting work out of loops

:::compare
```js
const flagged = orders.filter(
  (o) => o.total > 0.9 * Math.max(...orders.map((x) => x.total)),
);
```
```python
threshold = 0.9 * max(o["total"] for o in orders)   # once
flagged = [o for o in orders if o["total"] > threshold]
```
:::

Anything inside a loop that doesn't depend on the loop variable gets recomputed on every pass. Callbacks hide it in JS and comprehensions hide it in Python: a `max()`, `sum()`, `sorted()`, `set(...)` or `json.loads(config)` in the filter clause runs once per item. Compute it once, give it a name, and the code gets faster and easier to read.

```python run
import time

orders = [{"id": i, "total": (i * 37) % 1_000} for i in range(2_000)]

def flag_slow(orders):
    return [o["id"] for o in orders if o["total"] > 0.9 * max(x["total"] for x in orders)]

def flag_fast(orders):
    threshold = 0.9 * max(o["total"] for o in orders)
    return [o["id"] for o in orders if o["total"] > threshold]

for flag in (flag_slow, flag_fast):
    start = time.perf_counter()
    flagged = flag(orders)
    print(f"{flag.__name__}: {len(flagged)} orders in {(time.perf_counter() - start) * 1000:.1f} ms")
```

:::tip Old micro-optimisations have expired
Older Python advice says to cache method lookups (`append = out.append`) and to copy globals into local names before a hot loop. Since 3.11 the interpreter specialises each instruction for the types it actually sees, so these tricks gain a few percent at best, and caching `out.append` is often *slower* than just calling it. Fix the algorithm first, and measure before reaching for anything cleverer.
:::

```python run
from timeit import repeat

def plain(n):
    out = []
    for i in range(n):
        out.append(i)
    return out

def cached_method(n):
    out = []
    append = out.append
    for i in range(n):
        append(i)
    return out

for fn in (plain, cached_method):
    print(f"{fn.__name__:<14} {min(repeat(lambda: fn(100_000), number=10, repeat=5)):.3f} s")
```

## Building strings: `join`, not `+=`

:::compare
```js
let html = "";
for (const user of users) {
  html += `<li>${user.name}</li>\n`;    // V8 builds a rope: cheap
}
```
```python
html = "".join(f"<li>{user['name']}</li>\n" for user in users)

parts = []                                # or collect the pieces
for user in users:
    parts.append(f"<li>{user['name']}</li>\n")
html = "".join(parts)
```
:::

In V8, `a + b` on long strings creates a rope, a small node pointing at both halves, and copies nothing until the string is flattened, so `+=` in a loop is cheap. CPython strings are flat arrays, and `a + b` copies both into a new one. Appending in a loop therefore copies everything built so far on every pass: quadratic. Collect the pieces and `"".join` them once, or write them to an `io.StringIO`. [Strings](lesson:strings#immutability-and-building-strings) has the basics.

:::gotcha The fast `+=` is a special case
CPython can extend a string in place, but only when it's a **local variable inside a function** and nothing else refers to it. That's why `+=` in a loop often seems fine, until the same loop runs at the top level of a script, or appends to `self.html`, `parts["body"]` or `rows[-1]`, and turns quadratic. PEP 8 says not to rely on the shortcut at all, and PyPy doesn't have it.
:::

```python run
import time

for n in (10_000, 20_000, 40_000):
    pieces = [f"<li>user{i}</li>\n" for i in range(n)]

    start = time.perf_counter()
    html = ""
    for piece in pieces:          # module level: no in-place shortcut
        html += piece
    middle = time.perf_counter()
    html = "".join(pieces)
    end = time.perf_counter()
    print(f"n={n:>6,}  +=: {(middle - start) * 1000:6.1f} ms   join: {(end - middle) * 1000:4.1f} ms")
```

## `__slots__` for many small objects

:::compare
```js
class Point {
  constructor(x, y) {
    this.x = x;          // V8 gives same-shaped objects a hidden class
    this.y = y;          // and stores the fields compactly
  }
}
```
```python
from dataclasses import dataclass

@dataclass(slots=True)   # 3.10+
class Point:
    x: float
    y: float
```
:::

V8 notices that every `Point` has the same shape and packs the fields for you. CPython stores instance attributes so that any new one can be added at any time. Declaring `__slots__` (or using `@dataclass(slots=True)`) fixes the set of attributes, which makes each instance smaller and turns a misspelled assignment into an `AttributeError` ([Classes](lesson:classes#slots-a-fixed-set-of-attributes)). It's worth it when you hold hundreds of thousands of instances. Recent CPython versions already store regular instance attributes compactly, so the saving is smaller than older articles suggest. Measure it:

```python run
import tracemalloc
from dataclasses import dataclass

@dataclass
class Point:
    x: float
    y: float

@dataclass(slots=True)
class SlotPoint:
    x: float
    y: float

for cls in (Point, SlotPoint):
    tracemalloc.start()
    points = [cls(float(i), float(i)) for i in range(100_000)]
    per_point = tracemalloc.get_traced_memory()[0] / len(points)
    tracemalloc.stop()
    print(f"{cls.__name__:<10} {per_point:5.1f} bytes per point, floats included")
```

:::note Slots are a trade
A slotted instance has no `__dict__`, so you can't attach ad-hoc attributes, `functools.cached_property` doesn't work, and every subclass needs its own `__slots__` to stay dict-free. Use them for big collections of plain records, not as a default.
:::

## When pure Python isn't fast enough

:::compare
```js
// hot numeric code: typed arrays, WebAssembly, a native addon (napi-rs)
// CPU-bound parallelism: worker_threads
const prices = new Float64Array(priceList);
const withTax = prices.map((p) => p * 1.2);
```
```python
import numpy as np                  # pip install numpy

prices = np.array(price_list)       # one contiguous block of float64s
with_tax = prices * 1.2             # one C loop, no bytecode per item
print(with_tax[with_tax > 100].sum())
```
:::

When the algorithm is right and the profile still says Python is the bottleneck, move the hot loop out of the interpreter:

- **NumPy** (and pandas or polars for tables) runs whole-array operations in compiled code. Turning a per-item loop into array expressions is often worth 10 to 100 times. See [Data Wrangling](lesson:data-wrangling) for when to reach for a dataframe.
- **PyPy** is an alternative interpreter with a tracing JIT, closer to how V8 works. Pure-Python loops often run several times faster, but it trails CPython's newest versions and some C extensions run slower or not at all.
- **Compiled extensions**: Cython, mypyc (compiles type-annotated Python; mypy and black ship that way) and Rust through PyO3 and maturin (the napi-rs of Python; pydantic-core and polars are built with it).
- **Processes for CPU-bound parallelism.** The GIL lets only one thread run Python bytecode at a time in the default build, so `concurrent.futures.ProcessPoolExecutor` is the `worker_threads` equivalent for number crunching. 3.14 also officially supports the free-threaded build (`python3.14t`), which drops the GIL. [Concurrency Models](lesson:concurrency-models) compares the options.
- **CPython's own JIT** arrived experimentally in 3.13 and is off by default. Its gains so far are modest, so don't plan around it.

## Cheat sheet

| JavaScript | Python | Notes |
| --- | --- | --- |
| `performance.now()` | `time.perf_counter()` | seconds, not milliseconds |
| tinybench, benchmark.js | `min(timeit.repeat(fn, number=n))` | report the minimum |
| `node --cpu-prof` | `python -m cProfile -s cumtime app.py` | `py-spy` for running processes |
| `arr.includes(x)` in a loop | `x in ids_set` | build the set once, before the loop |
| `arr.find(...)` in a loop | `by_id = {c["id"]: c for c in rows}` | a dict index: O(1) lookups |
| `queue.shift()` | `queue.popleft()` on a `deque` | `list.pop(0)` is O(n) |
| `toSorted(...).slice(0, k)` | `heapq.nlargest(k, xs)` | O(n log k) |
| `findIndex` on sorted data | `bisect.bisect_left(xs, v)` | O(log n); `key=` in 3.10+ |
| `_.memoize(fn)` | `@functools.lru_cache(maxsize=...)` | hashable arguments only |
| `str += piece` in a loop | `"".join(pieces)` | `+=` may copy every time |
| `.map()` then `.reduce()` | `sum(f(x) for x in xs)` | a generator: O(1) memory |
| hidden classes | `@dataclass(slots=True)` | smaller instances, fixed attributes |
| `Float64Array` math | NumPy arrays | whole-array operations in C |
| `worker_threads` | `ProcessPoolExecutor` | for CPU-bound work |

## Challenges

Each starter below is **correct but slow**. The last test in each challenge feeds it a large input that it would take minutes to chew through, so the tests time out until your fix lands. Change the data structure or the algorithm, not the behaviour.

:::challenge id=perf-returning-customers title="Returning customers" difficulty=easy
Write `returning(this_month, last_month)` that returns the customer ids from `this_month` that also appear in `last_month`, in `this_month`'s order and keeping its repeats.

The starter is a direct translation of the JavaScript below. It's correct, but with 200,000 ids per month it does tens of billions of comparisons.

```js
const returning = (thisMonth, lastMonth) =>
  thisMonth.filter((id) => lastMonth.includes(id));
```

```python starter
def returning(this_month, last_month):
    return [c for c in this_month if c in last_month]
```

```python solution
def returning(this_month, last_month):
    seen_last_month = set(last_month)
    return [c for c in this_month if c in seen_last_month]
```

```python tests
@test("keeps the ids that appear in both months")
def _():
    eq(returning(["ada", "bob", "cy"], ["cy", "ada"]), ["ada", "cy"])

@test("keeps this month's order and repeats")
def _():
    eq(returning(["cy", "ada", "cy"], ["ada", "cy"]), ["cy", "ada", "cy"])

@test("works with any hashable id")
def _():
    eq(returning([3, 1, 2], [2, 3]), [3, 2])

@test("empty months")
def _():
    eq(returning([], ["ada"]), [])
    eq(returning(["ada"], []), [])

@test("doesn't modify its inputs")
def _():
    this_month, last_month = ["ada", "bob"], ["bob"]
    returning(this_month, last_month)
    eq((this_month, last_month), (["ada", "bob"], ["bob"]))

@test("200,000 ids per month, well under a second")
def _():
    this_month = [f"c{i}" for i in range(200_000)]
    last_month = [f"c{i}" for i in range(100_000, 300_000)]
    eq(returning(this_month, last_month), this_month[100_000:])
```

```hint
`c in last_month` scans the list from the start for every single id: up to 200,000 × 200,000 comparisons.
```

```hint
Build a set from `last_month` once, before the comprehension. Membership in a set is a hash lookup, and the comprehension itself doesn't change.
```
:::

:::challenge id=perf-live-version title="Which version was live?" difficulty=medium
Deploys are recorded as `(deployed_at, version)` pairs, sorted by time. For each error timestamp, find the version that was live when it happened: the most recent deploy **at or before** that moment, or `None` if the error predates every deploy.

Write `live_versions(deploys, error_times)` that returns one version per error, in the order of `error_times`. The error times aren't sorted. If two deploys share a timestamp, the later one in the list wins.

```text
live_versions([(100, "v1"), (200, "v2")], [150, 250, 50])  ->  ["v1", "v2", None]
```

```js
const liveVersions = (deploys, errorTimes) =>
  errorTimes.map((t) => deploys.findLast(([at]) => at <= t)?.[1] ?? null);
```

```python starter
def live_versions(deploys, error_times):
    versions = []
    for t in error_times:
        live = None
        for deployed_at, version in deploys:
            if deployed_at > t:
                break
            live = version
        versions.append(live)
    return versions
```

```python solution
from bisect import bisect_right

def live_versions(deploys, error_times):
    times = [deployed_at for deployed_at, _ in deploys]

    def live(t):
        i = bisect_right(times, t)   # how many deploys happened at or before t
        return deploys[i - 1][1] if i else None

    return [live(t) for t in error_times]
```

```python tests
DEPLOYS = [(100, "v1"), (200, "v2"), (300, "v3")]

@test("finds the version that was live")
def _():
    eq(live_versions(DEPLOYS, [150, 250, 999]), ["v1", "v2", "v3"])

@test("a deploy is live from its own timestamp")
def _():
    eq(live_versions(DEPLOYS, [100, 200, 300]), ["v1", "v2", "v3"])

@test("errors before the first deploy get None")
def _():
    eq(live_versions(DEPLOYS, [5, 99]), [None, None])

@test("error times can come in any order")
def _():
    eq(live_versions(DEPLOYS, [301, 101, 201, 0]), ["v3", "v1", "v2", None])

@test("of two deploys at the same moment, the later one wins")
def _():
    eq(live_versions([(100, "v1"), (100, "v1-hotfix")], [100, 150]), ["v1-hotfix", "v1-hotfix"])

@test("no deploys, or no errors")
def _():
    eq(live_versions([], [10, 20]), [None, None])
    eq(live_versions(DEPLOYS, []), [])

@test("100,000 deploys and 100,000 errors, well under a second")
def _():
    deploys = [(i * 10, f"v{i}") for i in range(100_000)]
    error_times = [(i * 7_919) % 1_000_000 for i in range(100_000)]
    versions = live_versions(deploys, error_times)
    eq(len(versions), 100_000)
    eq(versions[:4], ["v0", "v791", "v1583", "v2375"])
    eq(versions.count(None), 0)
```

```hint
The inner loop walks the deploys from the beginning for every error. The deploy times are sorted, so you can binary-search them instead.
```

```hint
Build `times = [at for at, _ in deploys]` once, outside the loop. `bisect_right(times, t)` returns how many deploys happened at or before `t`.
```

```hint
If that count is `i`, the live deploy is `deploys[i - 1]`, and `i == 0` means there wasn't one yet. `bisect_right` (not `bisect_left`) is what makes the later of two equal timestamps win.
```
:::

:::challenge id=perf-build-time title="Critical path" difficulty=medium
A build graph maps each target to the targets it depends on, and `durations` maps every target to its own build time in seconds. With unlimited parallel workers, a target starts as soon as its **slowest** dependency finishes, so its finish time is its own duration plus the largest finish time among its dependencies.

Write `build_time(graph, durations, target)`. Targets with no dependencies may be missing from `graph`, and the graph has no cycles.

The starter is correct, but it recomputes a shared dependency once for every path that leads to it. The last test's graph is a ladder of 30 levels where every target depends on both targets of the next level: 2³⁰ paths, but only 60 targets. Make each target compute once.

```js
function buildTime(graph, durations, target) {
  const deps = graph[target] ?? [];
  return durations[target] + Math.max(0, ...deps.map((d) => buildTime(graph, durations, d)));
}
```

```python starter
def build_time(graph, durations, target):
    deps = graph.get(target, [])
    slowest = max((build_time(graph, durations, dep) for dep in deps), default=0)
    return durations[target] + slowest
```

```python solution
from functools import cache

def build_time(graph, durations, target):
    @cache
    def finish(name):
        deps = graph.get(name, [])
        return durations[name] + max((finish(dep) for dep in deps), default=0)

    return finish(target)
```

```python tests
@test("a target with no dependencies takes its own duration")
def _():
    eq(build_time({}, {"app": 5}, "app"), 5)
    eq(build_time({"app": []}, {"app": 7}, "app"), 7)

@test("waits for the slowest dependency")
def _():
    graph = {"app": ["api", "ui"]}
    eq(build_time(graph, {"app": 2, "api": 10, "ui": 3}, "app"), 12)

@test("chains add up")
def _():
    graph = {"app": ["lib"], "lib": ["core"]}
    eq(build_time(graph, {"app": 1, "lib": 2, "core": 3}, "app"), 6)

@test("a diamond takes its slowest path")
def _():
    graph = {"app": ["api", "ui"], "api": ["core"], "ui": ["core"]}
    eq(build_time(graph, {"app": 1, "api": 4, "ui": 2, "core": 5}, "app"), 10)

@test("results don't leak between calls with different graphs")
def _():
    eq(build_time({}, {"app": 1}, "app"), 1)
    eq(build_time({}, {"app": 2}, "app"), 2)
    eq(build_time({"app": ["lib"]}, {"app": 1, "lib": 5}, "app"), 6)

@test("a ladder with 2**30 paths, well under a second")
def _():
    graph, durations = {}, {}
    for level in range(30):
        for side in "ab":
            name = f"{side}{level}"
            durations[name] = level % 3 + 1
            if level < 29:
                graph[name] = [f"a{level + 1}", f"b{level + 1}"]
    eq(build_time(graph, durations, "a0"), 60)
```

```hint
Putting `@cache` on `build_time` itself fails: `graph` and `durations` are dicts, and dicts aren't hashable, so they can't be part of a cache key.
```

```hint
Define an inner function `finish(name)` that closes over `graph` and `durations`, and decorate that one with `@functools.cache`. Its only argument is a string.
```

```hint
A new inner function per call means a new, empty cache per call, so results can't leak from one graph to the next.
```
:::

:::challenge id=perf-leaderboard title="Live leaderboard" difficulty=hard
Scores stream in one at a time, and after each one the game shows the top `k` scores so far, highest first. Write `leaderboards(scores, k)` that returns that snapshot, a new list, for every prefix of `scores`. `k` is at least 1.

```text
leaderboards([5, 1, 9], 2)  ->  [[5], [5, 1], [9, 5]]
```

The starter re-sorts everything seen so far after every score: O(n² log n) for the whole stream. You only ever need the best `k`.

```js
const leaderboards = (scores, k) =>
  scores.map((_, i) => scores.slice(0, i + 1).toSorted((a, b) => b - a).slice(0, k));
```

```python starter
def leaderboards(scores, k):
    return [sorted(scores[: i + 1], reverse=True)[:k] for i in range(len(scores))]
```

```python solution
import heapq

def leaderboards(scores, k):
    best = []          # a min-heap of the top k so far: best[0] is the lowest
    snapshots = []
    for score in scores:
        if len(best) < k:
            heapq.heappush(best, score)
        elif score > best[0]:
            heapq.heapreplace(best, score)
        snapshots.append(sorted(best, reverse=True))
    return snapshots
```

```python tests
@test("one snapshot per score")
def _():
    eq(leaderboards([5, 1, 9], 2), [[5], [5, 1], [9, 5]])

@test("shows everything while there are fewer than k scores")
def _():
    eq(leaderboards([3, 7], 5), [[3], [7, 3]])

@test("a low score doesn't change a full board")
def _():
    eq(leaderboards([50, 40, 10], 2)[-1], [50, 40])

@test("handles ties and negative scores")
def _():
    eq(leaderboards([-1, -1, -5, 0], 2), [[-1], [-1, -1], [-1, -1], [0, -1]])

@test("k = 1 tracks the maximum")
def _():
    eq(leaderboards([4, 2, 8, 6], 1), [[4], [4], [8], [8]])

@test("no scores, no snapshots")
def _():
    eq(leaderboards([], 3), [])

@test("snapshots are independent lists")
def _():
    boards = leaderboards([1, 2, 3], 3)
    boards[0].append(99)
    eq(boards[1], [2, 1])

@test("doesn't modify the input")
def _():
    scores = [3, 1, 2]
    leaderboards(scores, 2)
    eq(scores, [3, 1, 2])

@test("100,000 scores, well under a second")
def _():
    scores = [(i * 7_919) % 100_003 for i in range(100_000)]
    boards = leaderboards(scores, 3)
    eq(len(boards), 100_000)
    eq(boards[2], sorted(scores[:3], reverse=True))
    eq(boards[-1], sorted(scores, reverse=True)[:3])
```

```hint
Keep the current top `k` in a list managed by `heapq`. It's a min-heap, so `best[0]` is always the lowest score still on the board: the one a new high score knocks off.
```

```hint
While the board has fewer than `k` scores, `heappush`. After that, a score bigger than `best[0]` replaces it with `heapq.heapreplace(best, score)`, and anything else changes nothing.
```

```hint
Each snapshot is `sorted(best, reverse=True)`: sorting `k` items is cheap, and it builds a fresh list every time.
```
:::
