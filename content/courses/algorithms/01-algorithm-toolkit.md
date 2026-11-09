---
title: Python's Algorithm Toolkit
part: Toolkit
summary: What the built-ins cost, plus deque, heapq, bisect, Counter and the rest of the interview toolkit.
minutes: 40
---

JavaScript interview code starts with a tax. The standard library has no heap, no deque, no multiset and no binary search, so you hand-roll them or fake them with arrays and objects. Python ships all of them, written in C, which turns most of a solution into choosing the right container and knowing what each operation costs. This lesson is that inventory, and the rest of the course leans on it.

The core course covers how these types behave ([Lists](lesson:lists), [Dicts](lesson:dicts), [Sets](lesson:sets), [Batteries Included](lesson:standard-library)). Here the focus is cost: the big-O of each operation, and the idioms an interviewer expects to see.

## What the built-ins cost

Average-case costs in CPython. `n` is the size of the container and `k` the size of a slice or of the result.

| Type | Operation | Time | Notes |
| --- | --- | --- | --- |
| list | `xs[i]`, `xs[i] = v`, `len(xs)` | O(1) | a dynamic array, like a JS array |
| list | `xs.append(v)`, `xs.pop()` | O(1) amortised | the end is cheap |
| list | `xs.pop(0)`, `xs.insert(0, v)`, `del xs[i]` | O(n) | everything after `i` shifts |
| list | `v in xs`, `xs.index(v)`, `xs.count(v)`, `xs.remove(v)` | O(n) | linear scans |
| list | `xs[a:b]`, `xs + ys`, `xs.copy()` | O(k) | slicing copies |
| list | `xs.sort()`, `sorted(xs)` | O(n log n) | stable, and O(n) on already-sorted input |
| any | `min(xs)`, `max(xs)`, `sum(xs)` | O(n) | a loop in disguise |
| dict | `d[k]`, `d[k] = v`, `k in d`, `d.get(k)`, `del d[k]` | O(1) | average; a hash table |
| set | `s.add(v)`, `v in s`, `s.discard(v)` | O(1) | average |
| set | `a \| b` | O(len(a) + len(b)) | |
| set | `a & b` | O(min(len(a), len(b))) | iterates the smaller set |
| set | `a - b` | O(len(a)) | |
| deque | `append`, `appendleft`, `pop`, `popleft` | O(1) | |
| deque | `dq[i]` | O(n) | O(1) at either end, slow in the middle |
| str | `s[i]`, `len(s)` | O(1) | |
| str | `s[a:b]` | O(k) | a copy, like a list slice |
| str | `s + t`, `s.replace(a, b)`, `"".join(parts)` | O(n) | linear in the total length: strings are immutable, so every edit builds a new one |
| heapq | `heappush(h, v)`, `heappop(h)` | O(log n) | |
| heapq | `heapify(xs)` | O(n) | in place |
| heapq | `nlargest(k, xs)`, `nsmallest(k, xs)` | O(n log k) | |
| bisect | `bisect_left(xs, v)`, `bisect_right(xs, v)` | O(log n) | `xs` must be sorted |
| bisect | `insort(xs, v)` | O(n) | an O(log n) search, then an O(n) insert |

Three rows catch JavaScript developers out. `in` on a list is a linear scan, so `if x in seen` inside a loop is quadratic when `seen` is a list. Slicing copies, so `xs[1:]` in a loop or a recursive call adds O(n) each time. And `pop(0)` costs what `shift()` does. Dict and set costs are averages: a pathological pile of colliding keys degrades them to O(n), but interviews treat them as O(1).

:::quiz
`orders` and `refunds` are both lists of `n` order ids. What's the time complexity of this line?

```python
refunded = [order for order in orders if order in refunds]
```

- [ ] O(n)
- [ ] O(n log n)
- [x] O(n²)
- [ ] O(1)

`order in refunds` scans the list, so each of the `n` iterations costs O(n). Build `refund_ids = set(refunds)` once, before the comprehension, and the same line is O(n) overall.
:::

## `deque`: O(1) at both ends

:::compare
```js
const queue = [rootTask];
while (queue.length) {
  const task = queue.shift();     // moves every other element
  queue.push(...task.subtasks);
}

// a sliding buffer of the last 3 readings
buffer.push(reading);
if (buffer.length > 3) buffer.shift();
```
```python
from collections import deque

queue = deque([root_task])
while queue:
    task = queue.popleft()        # O(1)
    queue.extend(task.subtasks)


# a sliding buffer of the last 3 readings
buffer = deque(maxlen=3)
buffer.append(reading)            # the oldest falls off by itself
```
:::

`collections.deque` is a double-ended queue built from linked blocks: appending or popping at either end is O(1), and memory is O(n). It's the queue for every BFS, and with `maxlen` it's a fixed-size window that drops the oldest item on its own. What it gives up is the middle. `dq[i]` walks from the nearer end, so it's O(n) away from the ends, and slicing raises `TypeError`.

JavaScript's `shift()` has to move every remaining element down an index. Engines optimise some cases, but careful JS solutions keep a head index into the array instead. In Python you reach for a deque and stop thinking about it.

```python run
from collections import deque

# Round-robin: each job gets one slice of time, unfinished jobs rejoin the back
jobs = deque([("build", 3), ("test", 1), ("deploy", 2)])
order = []
while jobs:
    name, slices_left = jobs.popleft()
    order.append(name)
    if slices_left > 1:
        jobs.append((name, slices_left - 1))
print(order)

latency = deque(maxlen=3)              # only the last 3 readings
for ms in [120, 80, 95, 300]:
    latency.append(ms)
print(latency, f"average {sum(latency) / len(latency):.1f} ms")
```

:::quiz
A BFS over a graph with `n` nodes uses a plain list as its queue and dequeues with `queue.pop(0)`. In the worst case, what do all the dequeues cost together?

- [ ] O(n)
- [ ] O(n log n)
- [x] O(n²)
- [ ] O(1) amortised

Each `pop(0)` shifts every item still waiting. On a star-shaped graph the queue holds nearly all `n` nodes at once, so that's `n` dequeues at O(n) each. `deque.popleft()` brings the total back to O(n).
:::

## `Counter`, `defaultdict` and `OrderedDict`

:::compare
```js
const counts = new Map();
for (const ch of word) counts.set(ch, (counts.get(ch) ?? 0) + 1);

const graph = new Map();
for (const [a, b] of edges) {
  if (!graph.has(a)) graph.set(a, []);
  graph.get(a).push(b);
}
```
```python
from collections import Counter, defaultdict

counts = Counter(word)

graph = defaultdict(list)
for a, b in edges:
    graph[a].append(b)
```
:::

A `Counter` is a multiset. Missing items count as `0` without being inserted, `most_common(k)` is O(n log k), `+` and `-` add and subtract counts (dropping anything that falls to zero or below), `&` and `|` take the minimum and maximum of each count, and since 3.10, `a <= b` asks whether every count in `a` fits inside `b`. That last one is the whole of "can I spell this word with these tiles?". A `defaultdict(list)` is the standard adjacency list and grouping bucket. Both build in O(n). The API is in [Dicts](lesson:dicts#specialised-mappings), and [Hash Maps & Sets](lesson:hashing-patterns) puts them to work.

```python run
from collections import Counter

tiles = Counter("aabbcde")
print(Counter("abba") <= tiles)     # 3.10+: every count fits, so we can spell it
print(Counter("deed") - tiles)      # what we're short of
print(Counter("cab") & tiles)       # the minimum of each count
print(tiles.most_common(2))         # highest first, ties in first-seen order
print(tiles["z"], len(tiles))       # a missing item is 0, and reading it inserts nothing
```

`OrderedDict` earns its keep in one place: LRU caches. `move_to_end(key)` and `popitem(last=False)` are both O(1), so "touch on every read, evict the oldest" costs nothing extra. In JavaScript you'd delete and re-set a `Map` key to move it to the end, and take `map.keys().next().value` as the oldest.

```python run
from collections import OrderedDict

CAPACITY = 2
pages = OrderedDict()

def remember(url, html):
    pages[url] = html
    pages.move_to_end(url)            # newest at the end: O(1)
    if len(pages) > CAPACITY:
        pages.popitem(last=False)     # evict the oldest: O(1)

remember("/home", "<h1>Home</h1>")
remember("/docs", "<h1>Docs</h1>")
pages.move_to_end("/home")            # /home was just read
remember("/blog", "<h1>Blog</h1>")
print(list(pages))                    # /docs was evicted
```

:::deep Why not a plain dict?
Dicts keep insertion order too, so `next(iter(d))` finds the oldest key, and deleting and re-assigning a key moves it to the end. It works, but a dict doesn't compact itself when you delete. It leaves a dead slot behind until the next resize, and `next(iter(d))` has to step over every dead slot at the front. Used as a queue, a plain dict slows down quadratically. `OrderedDict` keeps a linked list next to its hash table, so both ends stay O(1).
:::

## `heapq`: a priority queue on a plain list

:::compare
```js
// No heap in JS: re-sort on every push, or write sift-up and sift-down yourself
tasks.push([priority, name]);
tasks.sort((a, b) => a[0] - b[0]);     // O(n log n) per push
const [p, next] = tasks.shift();       // O(n)
```
```python
import heapq

heapq.heappush(tasks, (priority, name))   # O(log n)
p, next_task = heapq.heappop(tasks)       # O(log n), smallest first
```
:::

A heap is a list kept in heap order: `h[0]` is always the smallest item, `heappush` and `heappop` are O(log n), and `heapify(xs)` rearranges an existing list in O(n), in place. `heapq` is a set of functions over an ordinary list rather than a class, so the list *is* the priority queue.

It's a **min-heap**. For a max-heap, push negated keys (`-score`) and negate again on the way out. Python 3.14 adds `heappush_max`, `heappop_max` and `heapify_max`, but the negation trick works on every version and is what you'll see in most solutions.

Items are compared with `<`, so tuples give you priorities: `(priority, item)` pops the lowest priority first. When two priorities tie, Python compares the next field, and if that's a dict or an object with no ordering, the push or pop raises `TypeError`. Put a counter in between: `(priority, next(seq), item)` never gets as far as comparing items, and it makes equal priorities come out first in, first out.

```python run
import heapq
from itertools import count

scores = [40, 95, 12, 77]
max_heap = [-s for s in scores]
heapq.heapify(max_heap)                     # O(n)
print(-heapq.heappop(max_heap))             # the negation trick: 95

seq = count()                               # tie-breaker, and FIFO among equals
queue = []
for priority, job in [(2, {"id": "a"}), (1, {"id": "b"}), (2, {"id": "c"})]:
    heapq.heappush(queue, (priority, next(seq), job))
print([heapq.heappop(queue)[2]["id"] for _ in range(len(queue))])
```

:::quiz output
What does this print?

```python
import heapq

readings = [5, 1, 4, 2, 3]
heapq.heapify(readings)
print(readings[0], readings[-1])
```

- [ ] `1 5`
- [x] `1 3`
- [ ] `5 1`
- [ ] `1 2`

`heapify` only guarantees heap order: every parent is `<=` its children, so `readings[0]` is the minimum. The list as a whole isn't sorted (here it's `[1, 2, 4, 5, 3]`), and the largest item can sit anywhere in the bottom row.
:::

:::gotcha A heap is not a sorted list
Only `h[0]` means anything. `h[1]` isn't the second smallest and `h[-1]` isn't the largest. To read items in order, pop them, or call `sorted(h)`. And the functions trust you: `heappush` onto a list you never heapified silently produces a list that isn't a heap.
:::

For "the k best", `heapq.nlargest(k, items, key=...)` and `nsmallest` keep a heap of size k, which is O(n log k) instead of sorting everything. Ties come out in input order, because the result is the same as `sorted(items, key=key, reverse=True)[:k]`. For k = 1 use `max()` or `min()`, and when k is close to n, just sort.

```python run
import heapq

depots = {"north": (3, 4), "east": (1, 1), "south": (-2, 2), "west": (5, -1)}

def distance(name):
    x, y = depots[name]
    return x * x + y * y          # squared distance sorts the same, without sqrt

print(heapq.nsmallest(2, depots, key=distance))
print(heapq.nlargest(1, depots, key=distance))
```

## Sorting and `bisect`

:::compare
```js
// lower bound: the first index whose item is >= target
let lo = 0, hi = xs.length;
while (lo < hi) {
  const mid = (lo + hi) >> 1;
  if (xs[mid] < target) lo = mid + 1;
  else hi = mid;
}
```
```python
from bisect import bisect_left, bisect_right

# lower bound: the first index whose item is >= target
lo = bisect_left(xs, target)

# and the upper bound comes free
hi = bisect_right(xs, target)
```
:::

`sorted()` and `list.sort()` are O(n log n) time and O(n) extra space, they're **stable**, and `key=` computes each element's key once (see [Lists](lesson:lists#sorting-and-reversing)). Sorting first is often the whole trick, because sorted data unlocks two pointers, interval merging and binary search.

On sorted data, `bisect` replaces the hand-written binary search and its off-by-one bugs. `bisect_left(xs, x)` is the first index whose item is `>= x`, the insertion point before any equal items. `bisect_right(xs, x)` (also spelled `bisect`) is the first index whose item is `> x`. Both are O(log n), both return `len(xs)` rather than `-1` when everything is smaller, and the difference between them counts the copies of `x`. `insort(xs, x)` inserts in order, but the insert shifts elements, so it's O(n).

```python run
from bisect import bisect_left, bisect_right

prices = [3, 5, 5, 5, 8, 13]
print(bisect_left(prices, 5), bisect_right(prices, 5))    # 1 4
print(bisect_right(prices, 5) - bisect_left(prices, 5))   # three 5s
print(bisect_left(prices, 6))                             # where a 6 would go

def contains(xs, x):
    i = bisect_left(xs, x)
    return i < len(xs) and xs[i] == x

print(contains(prices, 8), contains(prices, 9))
```

Since 3.10, `bisect_left` and `bisect_right` take `key=`, which is applied to the list's items but **not** to the value you're searching for, so you pass the key itself. (`insort`, which needs a whole item to insert, applies it to both.)

```python run
from bisect import bisect_right

meetings = [(900, "standup"), (1300, "lunch"), (1600, "review")]   # sorted by time
i = bisect_right(meetings, 1430, key=lambda m: m[0])               # 1430, not a tuple
print(meetings[i - 1][1] if i else None)                           # the last one at or before 14:30
```

:::quiz output
What does this print?

```python
from bisect import bisect_left

limits = [10, 20, 30]
print(bisect_left(limits, 35), bisect_left(limits, 5))
```

- [x] `3 0`
- [ ] `2 0`
- [ ] `-1 -1`
- [ ] `-1 0`

`bisect` returns an insertion point, never a "not found" marker: 35 would go at the very end (index 3, which is `len(limits)`), and 5 at the very start. Guard with `i < len(xs)` before you index.
:::

:::quiz output
What does this print?

```python
tasks = [("email", 1), ("deploy", 2), ("lunch", 1)]
print(sorted(tasks, key=lambda t: t[1], reverse=True))
```

- [x] `[('deploy', 2), ('email', 1), ('lunch', 1)]`
- [ ] `[('deploy', 2), ('lunch', 1), ('email', 1)]`
- [ ] `[('email', 1), ('lunch', 1), ('deploy', 2)]`

`reverse=True` reverses the comparisons, not the result, so the sort stays stable: equal keys keep their input order and `email` stays ahead of `lunch`. Sorting ascending and then reversing the list would flip the ties as well.
:::

## `itertools`: brute force in one line

:::compare
```js
for (let i = 0; i < xs.length; i++) {
  for (let j = i + 1; j < xs.length; j++) visit(xs[i], xs[j]);   // every pair
}

const running = [];
let total = 0;
for (const x of xs) running.push((total += x));                   // prefix sums
```
```python
from itertools import accumulate, combinations

for a, b in combinations(xs, 2):        # every pair
    visit(a, b)


running = list(accumulate(xs))          # prefix sums
```
:::

Brute force has its place: tiny inputs, and reference answers to test a clever solution against. `combinations(xs, r)` yields C(n, r) tuples, `permutations(xs, r)` yields n!/(n − r)! and `product(xs, repeat=r)` yields nʳ, all lazily, one tuple at a time. `math.comb` and `math.perm` count them without generating anything, which is how you check whether brute force can finish at all. `accumulate` builds prefix sums and running maxima in O(n), and `pairwise` (3.10+) walks adjacent pairs. They replace the nested index loops and recursive generators you'd write in JS. The [itertools tour](lesson:iterators-and-generators#an-itertools-tour) has the rest of the module.

```python run
from itertools import accumulate, combinations, pairwise, permutations, product
from math import comb, perm

nums = [3, 1, 4, 1]
print(list(accumulate(nums, initial=0)))         # prefix sums
print(list(accumulate(nums, max)))               # running maximum
print([b - a for a, b in pairwise(nums)])        # deltas between neighbours
print(sum(1 for a, b in combinations(nums, 2) if a + b == 5))   # pairs adding to 5
print(len(list(permutations(range(5), 2))), perm(5, 2))         # ordered pairs
print(comb(52, 5))                               # poker hands, counted not generated
print(["".join(flips) for flips in product("HT", repeat=2)])
```

:::quiz output
A brute-force solution checks every triple of a 1,000-item list. How many triples is that?

```python
from math import comb

print(f"{comb(1000, 3):,}")
```

- [ ] `1,000,000,000`
- [x] `166,167,000`
- [ ] `997,002,000`
- [ ] `333,000`

C(n, 3) is n(n − 1)(n − 2)/6, which grows like n³/6. At `n = 1000` that's already 166 million triples: far too many for a Python loop inside a time limit. Time to find the O(n²) or O(n log n) idea.
:::

## `math.inf` and big ints

:::compare
```js
let cheapest = Infinity;
const mid = Math.floor((lo + hi) / 2);   // (lo + hi) >> 1 breaks past 2 ** 31
2 ** 53 + 1;                             // 9007199254740992: off by one
2n ** 64n + 1n;                          // BigInt, which won't mix with numbers
```
```python
cheapest = math.inf
mid = (lo + hi) // 2                     # exact at any size
2 ** 53 + 1                              # 9007199254740993
2 ** 64 + 1                              # just an int
```
:::

`math.inf` (or `float("inf")`) is JavaScript's `Infinity`: the starting value for a running minimum, freely comparable with ints. `min(math.inf, 7)` gives you back the int `7`. Python's ints never overflow, so the Java habit of writing `lo + (hi - lo) // 2` is unnecessary: `(lo + hi) // 2` is exact at any size. Factorials, path counts and Catalan numbers come out exact too, with no `BigInt` in sight ([Numbers & Math](lesson:numbers-and-math#int-float-and-complex)).

```python run
import math

cheapest = math.inf
for price in [12, 7, 30]:
    cheapest = min(cheapest, price)
print(cheapest, type(cheapest).__name__)    # an int, not a float

lo, hi = 0, 10 ** 30
print((lo + hi) // 2)                       # no overflow to dodge

MOD = 10 ** 9 + 7
print(pow(3, 10 ** 18, MOD))                # modular exponentiation in O(log exp) steps
print(math.comb(100, 50))                   # exact: 30 digits
```

Big ints aren't free, though. Arithmetic slows down as numbers grow, so when a problem says "return the answer modulo 10⁹ + 7", reduce as you go rather than once at the end. `pow(base, exp, mod)` does that for powers.

:::gotcha Huge ints don't convert to strings
Since 3.11, converting an int with more than 4,300 digits to or from a `str` raises `ValueError`. It's a guard against denial-of-service attacks through quadratic-time parsing, and it bites "print the exact answer" problems. `sys.set_int_max_str_digits()` raises the limit, interpreter-wide.
:::

```python run raises
import math

print(len(str(math.factorial(1000))))   # 2,568 digits: fine
print(len(str(math.factorial(2000))))   # 5,736 digits: ValueError
```

## Recursion and `functools.cache`

:::compare
```js
const memo = new Map();
function ways(n) {             // stairs climbed 1 or 2 at a time
  if (n <= 1) return 1;
  if (!memo.has(n)) memo.set(n, ways(n - 1) + ways(n - 2));
  return memo.get(n);
}

ways(5000);                    // Infinity: the depth is fine, the number isn't
```
```python
from functools import cache

@cache
def ways(n):                   # stairs climbed 1 or 2 at a time
    if n <= 1:
        return 1
    return ways(n - 1) + ways(n - 2)


ways(5000)                     # RecursionError: the limit is 1,000 frames
```
:::

A JS engine allows several thousand frames, so the recursion survives, and the number overflows to `Infinity` instead. Python has the opposite problem. Its ints would hold the exact answer, but CPython stops at 1,000 frames and never eliminates tail calls ([Functions](lesson:functions#recursion-a-low-limit-and-no-tail-calls) explains why). For algorithms, that means recursive DFS down a 10,000-node path fails, and so does top-down DP over 10,000 states. `@cache` turns exponential recursion into one call per state, but it doesn't make the recursion any shallower.

This browser sandbox is stricter still, because WebAssembly's stack is much smaller than a native one. Every call to a `@cache` function passes through C code, and in Chrome, cached recursion 600 to 800 frames deep overflows that stack and kills the interpreter (the site restarts it). Other browsers can be tighter. Here, keep cached recursion under about 300 frames and plain recursion under about 500. For big inputs, go bottom-up with a loop over a table, or keep an explicit stack: the [Dynamic Programming](lesson:dynamic-programming) and [Graphs](lesson:graphs) lessons do both.

```python run
from functools import cache

def count_paths(rows, cols):
    @cache                          # a fresh cache for every call
    def paths(r, c):
        if r == 0 or c == 0:
            return 1
        return paths(r - 1, c) + paths(r, c - 1)
    return paths(rows - 1, cols - 1)

print(count_paths(3, 3))
print(count_paths(16, 16))          # about 30 frames deep: safe
```

:::tip Put the cached helper inside the function
Defined inside `count_paths`, the cache lives for one call, can read that call's inputs (a grid, a word list) through the closure, and can't hand stale answers to the next test case. A module-level `@cache` function that reads a global grid will happily return results computed for the previous grid.
:::

The bottom-up version needs no recursion at all, so input size stops mattering:

```python run
def climb_ways(n):
    prev, curr = 1, 1               # ways to reach steps 0 and 1
    for _ in range(n - 1):
        prev, curr = curr, prev + curr
    return curr

print(climb_ways(5))
print(len(str(climb_ways(5000))))   # a 1,045-digit int, no stack in sight
```

:::gotcha `sys.setrecursionlimit` is not a fix
You'll see `sys.setrecursionlimit(10**6)` at the top of many online solutions. It raises Python's frame counter, not the size of the C stack underneath, so recursion that passes through C code, like a `@cache` wrapper, can still overflow it. Depending on the version and platform that's a `RecursionError` or a hard crash, and in this sandbox it kills the interpreter. Rewrite the recursion as a loop instead.
:::

## Cheat sheet

| JavaScript | Python | Notes |
| --- | --- | --- |
| `queue.shift()` | `queue.popleft()` on a `deque` | O(1) instead of O(n) |
| `buf.push(x); if (buf.length > k) buf.shift()` | `buf.append(x)` on a `deque(maxlen=k)` | the oldest item falls off |
| a hand-written heap | `heapq.heappush(h, x)`, `heapq.heappop(h)` | a min-heap on a plain list |
| a max-heap | push `-x`, negate on the way out | or `heappush_max` (3.14+) |
| sort, then `.slice(0, k)` | `heapq.nsmallest(k, xs, key=...)` | O(n log k) |
| a hand-written lower bound | `bisect_left(xs, x)` | `bisect_right` for the upper bound |
| `map.set(k, (map.get(k) ?? 0) + 1)` | `Counter(xs)` | missing counts read as 0 |
| `if (!m.has(k)) m.set(k, [])` | `defaultdict(list)` | |
| delete and re-set a `Map` key | `od.move_to_end(k)` | `od.popitem(last=False)` evicts the oldest |
| `Infinity` | `math.inf` | `min(math.inf, 7)` is the int `7` |
| `BigInt` | `int` | exact; `str()` stops at 4,300 digits |
| a memo `Map` | `@functools.cache` | keep cached recursion under ~300 frames here |
| nested loops over pairs | `combinations(xs, 2)` | `math.comb(n, 2)` counts them |
| a running total | `accumulate(xs, initial=0)` | prefix sums |

## Challenges

:::challenge id=algo-moving-average title="Moving average" difficulty=easy
Write a class `MovingAverage(size)` whose `add(value)` method records a value and returns the average of the last `size` values added (or of all of them, until `size` have arrived). Raise `ValueError` if `size` is less than 1.

```text
avg = MovingAverage(3)
avg.add(1)    ->  1.0
avg.add(10)   ->  5.5
avg.add(3)    ->  4.666...
avg.add(5)    ->  6.0       (10 + 3 + 5) / 3
```

Each `add` must be O(1), however big the window. Keep the window in a `deque` and maintain a running total, rather than re-summing the window or shifting a list.

```js
class MovingAverage {
  constructor(size) {
    this.size = size;
    this.window = [];
    this.total = 0;
  }
  add(value) {
    this.window.push(value);
    this.total += value;
    if (this.window.length > this.size) this.total -= this.window.shift();  // O(n)
    return this.total / this.window.length;
  }
}
```

```python starter
from collections import deque


class MovingAverage:
    def __init__(self, size):
        ...

    def add(self, value):
        ...
```

```python solution
from collections import deque


class MovingAverage:
    def __init__(self, size):
        if size < 1:
            raise ValueError("size must be at least 1")
        self._window = deque(maxlen=size)
        self._total = 0

    def add(self, value):
        if len(self._window) == self._window.maxlen:
            self._total -= self._window[0]    # about to fall off the left
        self._window.append(value)
        self._total += value
        return self._total / len(self._window)
```

```python tests
@test("averages everything until the window fills")
def _():
    avg = MovingAverage(3)
    approx(avg.add(1), 1.0)
    approx(avg.add(10), 5.5)

@test("drops the oldest value once the window is full")
def _():
    avg = MovingAverage(3)
    for value in [1, 10]:
        avg.add(value)
    approx(avg.add(3), 14 / 3)
    approx(avg.add(5), 6.0)
    approx(avg.add(5), 13 / 3)

@test("a window of 1 returns the latest value")
def _():
    avg = MovingAverage(1)
    approx(avg.add(4), 4.0)
    approx(avg.add(-2), -2.0)

@test("handles negatives, zeros and floats")
def _():
    avg = MovingAverage(2)
    approx(avg.add(-3), -3.0)
    approx(avg.add(0), -1.5)
    approx(avg.add(0), 0.0)
    approx(avg.add(0.5), 0.25)

@test("instances don't share a window")
def _():
    a, b = MovingAverage(2), MovingAverage(2)
    a.add(100)
    approx(b.add(1), 1.0, msg="b saw a's value: keep the window on self, not on the class")

@test("size < 1 raises ValueError")
def _():
    raises(ValueError, MovingAverage, 0)
    raises(ValueError, MovingAverage, -5)

@test("each add is O(1), even with a 500,000-value window")
def _():
    avg = MovingAverage(500_000)
    for value in range(800_000):
        last = avg.add(value)
    approx(last, 549_999.5)
```

```hint
`deque(maxlen=size)` drops the oldest item by itself when you append to a full deque. You can tell it's full with `len(d) == d.maxlen`.
```

```hint
Keep a running total. Before appending to a full window, subtract the value that's about to fall off: `d[0]`, which is O(1) on a deque.
```
:::

:::challenge id=algo-last-stone title="Last stone standing" difficulty=medium
You have a pile of stones with positive integer weights. Each turn, take the two heaviest and smash them together. If they weigh the same, both are destroyed; otherwise a stone weighing the difference goes back on the pile. Write `last_stone_weight(stones)` that returns the weight of the last stone left, or `0` if none is.

```text
last_stone_weight([2, 7, 4, 1, 8, 1])  ->  1
    8 and 7 leave 1, 4 and 2 leave 2, 2 and 1 leave 1, 1 and 1 cancel out, and a 1 is left
```

Don't modify the input list, and make each turn O(log n) with a heap.

```js
function lastStoneWeight(stones) {
  const pile = [...stones];
  while (pile.length > 1) {
    pile.sort((a, b) => b - a);          // O(n log n) every turn
    const [y, x] = pile.splice(0, 2);
    if (y !== x) pile.push(y - x);
  }
  return pile[0] ?? 0;
}
```

```python starter
import heapq


def last_stone_weight(stones):
    ...
```

```python solution
import heapq


def last_stone_weight(stones):
    heap = [-weight for weight in stones]    # negated: heapq is a min-heap
    heapq.heapify(heap)
    while len(heap) > 1:
        heaviest = -heapq.heappop(heap)
        second = -heapq.heappop(heap)
        if heaviest != second:
            heapq.heappush(heap, -(heaviest - second))
    return -heap[0] if heap else 0
```

```python tests
@test("smashes the two heaviest stones each turn")
def _():
    eq(last_stone_weight([2, 7, 4, 1, 8, 1]), 1)

@test("the difference goes back on the pile")
def _():
    eq(last_stone_weight([10, 4]), 6)
    eq(last_stone_weight([1, 3]), 2)
    eq(last_stone_weight([1, 1, 1, 2]), 1)

@test("equal stones destroy each other")
def _():
    eq(last_stone_weight([3, 3]), 0)
    eq(last_stone_weight([5, 5, 5, 5]), 0)

@test("three equal stones leave one")
def _():
    eq(last_stone_weight([5, 5, 5]), 5)

@test("one stone, or none")
def _():
    eq(last_stone_weight([9]), 9)
    eq(last_stone_weight([]), 0)

@test("doesn't modify the input")
def _():
    stones = [2, 7, 4, 1, 8, 1]
    last_stone_weight(stones)
    eq(stones, [2, 7, 4, 1, 8, 1], "the input list changed")

@test("100,000 stones (each turn must be O(log n))")
def _():
    pebbles = [(i * 7919) % 10_007 + 1 for i in range(99_999)]
    boulder = 10 ** 9
    # The boulder stays the heaviest stone and grinds down every pebble in turn
    eq(last_stone_weight([*pebbles, boulder]), boulder - sum(pebbles))
```

```hint
`heapq` only hands you the smallest item. Store negated weights and the smallest negative number is the heaviest stone.
```

```hint
Build the heap from a copy: `heap = [-w for w in stones]`, then `heapq.heapify(heap)` in O(n). Each turn, pop twice, and push the difference back (negated) when it isn't zero.
```

```hint
On 3.14+, `heapq.heapify_max`, `heappop_max` and `heappush_max` do the same job without the negation.
```
:::

:::challenge id=algo-time-map title="Time-travelling key-value store" difficulty=medium
Build a key-value store that remembers history. `TimeMap.set(key, value, timestamp)` stores a value, and `TimeMap.get(key, timestamp)` returns the value that `key` had at `timestamp`: the one stored with the latest timestamp at or before it. Return `None` if the key had no value yet, or doesn't exist.

```text
store = TimeMap()
store.set("price", "10.00", 5)
store.set("price", "12.50", 10)
store.get("price", 7)    ->  "10.00"
store.get("price", 10)   ->  "12.50"
store.get("price", 4)    ->  None
store.get("stock", 99)   ->  None
```

For each key, `set` is called with strictly increasing timestamps, so every key's history is already sorted. `get` must binary-search it in O(log n) rather than scanning. Values can be anything, including falsy ones like `""` and `0`.

```js
class TimeMap {
  #history = new Map();     // key -> [[timestamp, value], ...]
  set(key, value, timestamp) {
    if (!this.#history.has(key)) this.#history.set(key, []);
    this.#history.get(key).push([timestamp, value]);
  }
  get(key, timestamp) {
    const entries = this.#history.get(key) ?? [];
    return entries.findLast(([t]) => t <= timestamp)?.[1] ?? null;  // O(n)
  }
}
```

```python starter
from bisect import bisect_right
from collections import defaultdict


class TimeMap:
    def __init__(self):
        ...

    def set(self, key, value, timestamp):
        ...

    def get(self, key, timestamp):
        ...
```

```python solution
from bisect import bisect_right
from collections import defaultdict


class TimeMap:
    def __init__(self):
        self._history = defaultdict(list)    # key -> [(timestamp, value), ...]

    def set(self, key, value, timestamp):
        self._history[key].append((timestamp, value))

    def get(self, key, timestamp):
        history = self._history.get(key, [])   # .get() doesn't insert missing keys
        i = bisect_right(history, timestamp, key=lambda entry: entry[0])
        return history[i - 1][1] if i else None
```

```python tests
def price_store():
    store = TimeMap()
    store.set("price", "10.00", 5)
    store.set("price", "12.50", 10)
    return store

@test("returns the latest value at or before the timestamp")
def _():
    store = price_store()
    eq(store.get("price", 7), "10.00")
    eq(store.get("price", 99), "12.50")

@test("an exact timestamp counts")
def _():
    store = price_store()
    eq(store.get("price", 5), "10.00")
    eq(store.get("price", 10), "12.50")

@test("before the first timestamp is None")
def _():
    eq(price_store().get("price", 4), None)

@test("an unknown key is None")
def _():
    eq(price_store().get("stock", 99), None)

@test("keys have separate histories")
def _():
    store = TimeMap()
    store.set("a", "first", 1)
    store.set("b", "second", 2)
    eq(store.get("a", 5), "first")
    eq(store.get("b", 1), None)

@test("falsy values come back as themselves, not None")
def _():
    store = TimeMap()
    store.set("note", "", 1)
    store.set("count", 0, 3)
    eq(store.get("note", 2), "")
    eq(store.get("count", 3), 0)

@test("values are never compared, so any object works")
def _():
    store = TimeMap()
    config_v1, config_v2 = {"retries": 1}, {"retries": 3}
    store.set("config", config_v1, 1)
    store.set("config", config_v2, 2)
    check(store.get("config", 2) is config_v2, "expected the dict stored at timestamp 2")
    check(store.get("config", 1) is config_v1, "expected the dict stored at timestamp 1")

@test("stores don't share data")
def _():
    a, b = TimeMap(), TimeMap()
    a.set("k", "v", 1)
    eq(b.get("k", 1), None)

@test("50,000 versions of one key (get must be O(log n))")
def _():
    store = TimeMap()
    for i in range(50_000):
        store.set("sku", i, 10 * i)
    wrong = [i for i in range(50_000) if store.get("sku", 10 * i + 5) != i]
    eq(wrong[:3], [], "versions that came back wrong")
```

```hint
Group each key's history with `defaultdict(list)`. Because timestamps only grow, appending `(timestamp, value)` keeps every history sorted.
```

```hint
`bisect_right(history, timestamp, key=lambda entry: entry[0])` (3.10+) returns how many entries have a timestamp `<=` the one you asked for. The answer is the entry just before that index, if there is one.
```

```hint
Avoid `bisect_right(history, (timestamp, ...))` with a tuple: on a timestamp tie, it compares your sentinel against the stored *value*, which fails for dicts and mixed types. And read with `.get(key, [])`, so looking up an unknown key doesn't insert it into the `defaultdict`.
```
:::

:::challenge id=algo-price-tracker title="Price tracker with corrections" difficulty=hard
A market feed sends `(timestamp, price)` updates for one stock, out of order. Sometimes it sends a **correction**: another update for a timestamp it already sent, which replaces the earlier price. Write a class `PriceTracker` with four methods:

- `update(timestamp, price)` records a price, or corrects it.
- `latest()` returns the price at the largest timestamp seen so far.
- `highest()` and `lowest()` return the maximum and minimum of the current prices. A corrected price no longer counts.

All three queries raise `ValueError` while the tracker is empty.

```text
tracker = PriceTracker()
tracker.update(1, 10)
tracker.update(2, 5)
tracker.highest()   ->  10
tracker.update(1, 3)        # a correction: timestamp 1 is now 3, not 10
tracker.highest()   ->  5
tracker.lowest()    ->  3
tracker.latest()    ->  5   # timestamp 2 is still the latest
```

Every operation should be O(log n), amortised. `heapq` has no "remove" or "decrease key", so you can't take a corrected price out of a heap. Use **lazy deletion** instead: leave stale entries in the heap and throw them away when they reach the top.

```js
class PriceTracker {
  #prices = new Map();      // timestamp -> price
  update(timestamp, price) { this.#prices.set(timestamp, price); }
  latest() { return this.#prices.get(Math.max(...this.#prices.keys())); }   // O(n)
  highest() { return Math.max(...this.#prices.values()); }                // O(n)
  lowest() { return Math.min(...this.#prices.values()); }                 // O(n)
}
```

```python starter
import heapq


class PriceTracker:
    def __init__(self):
        ...

    def update(self, timestamp, price):
        ...

    def latest(self):
        ...

    def highest(self):
        ...

    def lowest(self):
        ...
```

```python solution
import heapq


class PriceTracker:
    def __init__(self):
        self._prices = {}           # timestamp -> current price
        self._latest = None         # the largest timestamp seen
        self._min_heap = []         # (price, timestamp), possibly stale
        self._max_heap = []         # (-price, timestamp), possibly stale

    def update(self, timestamp, price):
        self._prices[timestamp] = price
        if self._latest is None or timestamp > self._latest:
            self._latest = timestamp
        heapq.heappush(self._min_heap, (price, timestamp))
        heapq.heappush(self._max_heap, (-price, timestamp))

    def latest(self):
        if self._latest is None:
            raise ValueError("no prices yet")
        return self._prices[self._latest]

    def highest(self):
        return self._peek(self._max_heap, sign=-1)

    def lowest(self):
        return self._peek(self._min_heap, sign=1)

    def _peek(self, heap, sign):
        # Lazy deletion: drop entries that a later correction made stale.
        while heap and self._prices[heap[0][1]] != sign * heap[0][0]:
            heapq.heappop(heap)
        if not heap:
            raise ValueError("no prices yet")
        return sign * heap[0][0]
```

```python tests
@test("tracks the latest, highest and lowest prices")
def _():
    tracker = PriceTracker()
    for timestamp, price in [(1, 10), (2, 5), (3, 8)]:
        tracker.update(timestamp, price)
    eq(tracker.latest(), 8)
    eq(tracker.highest(), 10)
    eq(tracker.lowest(), 5)

@test("latest() means the largest timestamp, not the last update")
def _():
    tracker = PriceTracker()
    tracker.update(5, 50)
    tracker.update(2, 20)
    eq(tracker.latest(), 50)

@test("a correction replaces the old price")
def _():
    tracker = PriceTracker()
    tracker.update(1, 10)
    tracker.update(2, 5)
    eq(tracker.highest(), 10)
    tracker.update(1, 3)
    eq(tracker.highest(), 5)
    eq(tracker.lowest(), 3)
    eq(tracker.latest(), 5)

@test("correcting the latest timestamp changes latest()")
def _():
    tracker = PriceTracker()
    tracker.update(1, 10)
    tracker.update(2, 5)
    tracker.update(2, 7)
    eq(tracker.latest(), 7)
    eq(tracker.lowest(), 7)

@test("equal prices at different timestamps are separate")
def _():
    tracker = PriceTracker()
    tracker.update(1, 7)
    tracker.update(2, 7)
    tracker.update(1, 1)
    eq(tracker.highest(), 7)
    eq(tracker.lowest(), 1)

@test("a price corrected back to an old value counts again")
def _():
    tracker = PriceTracker()
    tracker.update(1, 5)
    tracker.update(1, 9)
    tracker.update(1, 5)
    eq(tracker.highest(), 5)
    eq(tracker.lowest(), 5)

@test("zero and negative prices are real prices")
def _():
    tracker = PriceTracker()
    tracker.update(1, 0)
    eq((tracker.latest(), tracker.highest(), tracker.lowest()), (0, 0, 0))
    tracker.update(2, -3)
    eq((tracker.latest(), tracker.highest(), tracker.lowest()), (-3, 0, -3))

@test("an empty tracker raises ValueError")
def _():
    tracker = PriceTracker()
    raises(ValueError, tracker.latest)
    raises(ValueError, tracker.highest)
    raises(ValueError, tracker.lowest)

@test("trackers don't share state")
def _():
    a, b = PriceTracker(), PriceTracker()
    a.update(1, 100)
    raises(ValueError, b.highest)

@test("60,000 updates and corrections, each followed by three queries")
def _():
    tracker = PriceTracker()
    checksum = 0
    for i in range(60_000):
        # 30,011 timestamps arrive out of order, and almost every one is corrected once
        tracker.update((i * 7919) % 30_011, (i * 104_729) % 1_000_003)
        checksum += tracker.highest() - tracker.lowest() + tracker.latest()
    eq(checksum, 93_387_027_141)
```

```hint
Keep a dict of `timestamp -> current price` as the source of truth, and track the largest timestamp in a plain attribute. That makes `update` and `latest` easy.
```

```hint
On every update, push `(price, timestamp)` onto a min-heap and `(-price, timestamp)` onto a max-heap. Don't try to find and remove the old entry for that timestamp.
```

```hint
Before answering `highest()` or `lowest()`, pop from that heap while its top entry disagrees with the dict (`prices[timestamp] != price`). Every entry is pushed once and popped at most once, so the clean-up is amortised O(log n).
```
:::
