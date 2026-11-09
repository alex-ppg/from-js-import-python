---
title: Sorting & Binary Search
part: Patterns
summary: Stable key sorts, cmp_to_key, bisect, binary search on the answer, the k-th largest and interval sweeps.
minutes: 45
---

Sorting is the most common first move in an interview solution: pay O(n log n) once, and many O(n²) questions collapse into a single pass or a binary search. Python ships both halves. `sorted()` and `list.sort()` are stable and take a **key function** instead of a comparator, and the `bisect` module is the binary search you would otherwise hand-roll, off-by-one bug included.

The complexity table and the `heapq` basics are in [Python's Algorithm Toolkit](lesson:algorithm-toolkit). This lesson is about the patterns built on top of them.

## Sorting by key

:::compare
```js
// The comparator runs O(n log n) times
users.sort((a, b) =>
  a.team.localeCompare(b.team) || b.score - a.score);
```
```python
# The key runs once per element; tuples compare field by field
users.sort(key=lambda u: (u["team"], -u["score"]))

```
:::

Sorting costs O(n log n) time and O(n) extra memory: `sorted()` builds a new list, and even the in-place `list.sort()` needs a merge buffer, plus room for the keys when you pass `key=`. The key function runs exactly **once per element**, before any comparison, so an expensive key (parsing a date, lowercasing a name) is paid n times rather than n log n times. Tuple keys give you multi-field orders, and negating a number flips that one field to descending. The basics are in [Arrays → Lists](lesson:lists#sorting-and-reversing).

The property that matters most in algorithm problems is **stability**: elements with equal keys keep their input order. (JS guarantees this too, since ES2019.) Stability lets you sort in several passes, least important key first. That's how you mix directions when a field can't be negated, because there's no `-` for strings.

```python run
from operator import itemgetter

players = [
    {"name": "ana", "team": "red", "score": 90},
    {"name": "ben", "team": "blue", "score": 85},
    {"name": "cy", "team": "red", "score": 85},
    {"name": "dee", "team": "blue", "score": 90},
]
by_score = sorted(players, key=lambda p: (-p["score"], p["name"]))
print([p["name"] for p in by_score])                # score down, then name up

ranked = sorted(players, key=itemgetter("name"))    # least important key first
ranked.sort(key=itemgetter("team"), reverse=True)   # team down; names stay in order
print([(p["team"], p["name"]) for p in ranked])
```

:::quiz output
How many times does `by_value` run?

```python
calls = []

def by_value(x):
    calls.append(x)
    return x

sorted([5, 3, 8, 1, 9, 2], key=by_value)
print(len(calls))
```

- [x] `6`
- [ ] `15`
- [ ] `36`

Python computes every key once, up front, and then sorts the keys: decorate, sort, undecorate, built in. A comparator runs once per comparison instead, roughly n log n times, and that includes one wrapped with `cmp_to_key`.
:::

:::gotcha Every key must be comparable with every other key
A key that returns `None` for some elements raises `TypeError` as soon as `None` meets a number. In JS, `a.age - b.age` with a missing age is `NaN`, and the sort quietly produces some order. Make the key total instead: `key=lambda u: (u["age"] is None, u["age"] or 0)` sorts missing ages last. [Sort with nulls last](lesson:truthiness-and-equality#ordering-nulls-last) is the full exercise.
:::

:::deep How CPython sorts
`list.sort` is Timsort, with the Powersort merge policy since 3.11. It scans for runs that are already ascending (or strictly descending, which it reverses in place), extends short runs with binary insertion sort, and merges runs pairwise. The worst case is O(n log n), but sorted or nearly sorted input costs close to O(n), so re-sorting a list after appending one item is a linear operation, not an O(n log n) one. Stability is guaranteed by the language, not just by this implementation.
:::

## Custom orders with `cmp_to_key`

:::compare
```js
// In JS a comparator is the only option
releases.sort(compareReleases);
```
```python
from functools import cmp_to_key

releases.sort(key=cmp_to_key(compare_releases))
```
:::

Python 3 has no `cmp=` argument, so `sorted(xs, cmp=f)` raises `TypeError`. When an order is easiest to state as a comparison between two elements, `functools.cmp_to_key` wraps a JS-style comparator (negative, zero or positive) in a key object whose `<` calls it. Every comparison is then a Python function call, which makes it slower than a plain key. Use it when the order genuinely depends on the pair, or as a first step when porting a comparator, and refactor to a key once the tests pass.

```python run
from functools import cmp_to_key

def by_length_then_alpha(a, b):              # a JS comparator, ported as is
    return len(a) - len(b) or (a > b) - (a < b)

words = ["pear", "fig", "apple", "kiwi"]
print(sorted(words, key=cmp_to_key(by_length_then_alpha)))
print(sorted(words, key=lambda w: (len(w), w)))           # the same order, as a key

print(sorted(words, key=cmp_to_key(lambda a, b: a > b)))  # a bool is never negative
```

`(a > b) - (a < b)` is the idiom for Python 2's removed `cmp()` builtin: booleans are ints, so it evaluates to -1, 0 or 1.

:::gotcha A boolean comparator sorts nothing
`lambda a, b: a > b` returns `True` or `False`, which are 1 and 0, and never a negative number. The sort never learns that anything is smaller than anything else, so it hands the list back in its original order without an error. It's a classic JS bug too. Return a negative number, zero or a positive number.
:::

Some orders have no natural key at all. The textbook case is arranging numbers so that their concatenation is as large as possible: whether `9` goes before `34` depends on comparing `"934"` with `"349"`, which is a property of the pair rather than of either number. That's the [second challenge](#algo-largest-concat).

## Binary search patterns with `bisect`

:::compare
```js
// The latest release at or before a date: a linear scan
const current = releases.findLast((r) => r.date <= date);
```
```python
# On sorted data, a binary search: O(log n)
i = bisect_right(dates, date)
current = releases[i - 1] if i else None
```
:::

[Python's Algorithm Toolkit](lesson:algorithm-toolkit) covers what `bisect_left` and `bisect_right` return and how their `key=` argument works. Most binary-search questions are one of a few shapes built from those two calls, as long as you remember that both return **insertion points** rather than "found" or "not found":

| Question about a sorted `xs` | Expression |
| --- | --- |
| Is `x` present? | `i = bisect_left(xs, x)`, then `i < len(xs) and xs[i] == x` |
| How many items equal `x`? | `bisect_right(xs, x) - bisect_left(xs, x)` |
| How many lie in `[lo, hi]`? | `bisect_right(xs, hi) - bisect_left(xs, lo)` |
| The largest item `<= x` (floor) | `xs[i - 1]` with `i = bisect_right(xs, x)`, if `i > 0` |
| The smallest item `>= x` (ceiling) | `xs[i]` with `i = bisect_left(xs, x)`, if `i < len(xs)` |
| The item closest to `x` | whichever of the floor and the ceiling is nearer |

Each lookup is O(log n), so sorting once and answering q queries costs O((n + q) log n), where a scan per query would cost O(n·q). That's the trade the [third challenge](#algo-nearest-station) asks you to make.

```python run
from bisect import bisect_left, bisect_right

latencies = sorted([120, 85, 300, 85, 95, 210, 150])   # sort once: O(n log n)
print(latencies)
print(bisect_right(latencies, 150) - bisect_left(latencies, 90))   # how many in [90, 150]

def floor(xs, x):
    i = bisect_right(xs, x)
    return xs[i - 1] if i else None        # i == 0: nothing is <= x

def ceiling(xs, x):
    i = bisect_left(xs, x)
    return xs[i] if i < len(xs) else None

print(floor(latencies, 100), ceiling(latencies, 100))
print(floor(latencies, 50), ceiling(latencies, 500))
```

:::gotcha `xs[i - 1]` when `i` is 0
When nothing is `<= x`, `bisect_right` returns 0, and `xs[i - 1]` is `xs[-1]`: the **largest** item, returned without complaint. In JS `xs[-1]` is `undefined`, so the same slip would at least look like "nothing found". Guard every floor lookup with `if i`.
:::

:::quiz output
What does this print?

```python
from bisect import bisect_right

releases = [10, 20, 30]
i = bisect_right(releases, 5)
print(releases[i - 1])
```

- [ ] `None`
- [ ] `IndexError`
- [x] `30`
- [ ] `10`

Nothing is `<= 5`, so `i` is 0 and `releases[-1]` quietly returns the last release.
:::

When inserts and queries interleave, `insort(xs, x)` keeps a list sorted as you go. Finding the spot is O(log n) but shifting the tail is O(n). The shift is a fast C-level memory move, so it's fine for tens of thousands of items; beyond that, reach for a balanced structure such as the third-party `sortedcontainers.SortedList`. And `bisect` trusts you: on a list that isn't sorted (by the same key you search with) it returns a plausible-looking wrong index rather than raising.

## Binary search on the answer

Binary search isn't only for arrays. When a problem asks for the *smallest value that works* (the lowest rate, the smallest capacity, the shortest deadline) and "works" is monotone, so that once a value works every bigger one does too, binary search the range of candidate answers and test each midpoint with a feasibility check. It costs O(log R) checks for a range of R candidates: about 30 checks for a billion.

:::compare
```js
let lo = 1, hi = Math.max(...jobs);
while (lo < hi) {
  const mid = Math.floor((lo + hi) / 2);
  if (fits(mid)) hi = mid;
  else lo = mid + 1;
}
```
```python
lo, hi = 1, max(jobs)
while lo < hi:
    mid = (lo + hi) // 2      # Python ints never overflow
    if fits(mid):
        hi = mid
    else:
        lo = mid + 1
```
:::

The template is the same in both languages, minus one defensive habit. Python's ints are arbitrary precision, so `(lo + hi) // 2` can't overflow and the `lo + (hi - lo) // 2` dance from Java and C is unnecessary. (In JS, the shortcut `(lo + hi) >> 1` is the risky one, because `>>` truncates to 32 bits.)

```python run
def min_rate(jobs, limit):
    """Slowest rate that finishes every job within `limit` ticks (limit >= len(jobs))."""
    def fits(rate):
        return sum(-(-size // rate) for size in jobs) <= limit   # ceiling division

    lo, hi = 1, max(jobs)
    while lo < hi:
        mid = (lo + hi) // 2
        if fits(mid):
            hi = mid
        else:
            lo = mid + 1
    return lo

print(min_rate([3, 6, 7, 11], 8), min_rate([30, 11, 23, 4, 20], 5))
```

:::tip Ceiling division without floats
`math.ceil(a / b)` goes through a float, which loses precision past 2**53. `-(-a // b)` floors the negation and negates it back, so it stays an exact int. You'll see it in most Python solutions. See [Division](lesson:numbers-and-math#division-and-divmod) for why `//` floors toward negative infinity.
:::

:::pythonic Let `bisect` run the loop
A `range` supports `len()` and indexing without building a list, and `key=` maps each candidate to `False` or `True`. Since `False < True`, `bisect_left` finds the first candidate that works (3.10+):

```python
rates = range(1, max(jobs) + 1)
best = rates[bisect_left(rates, True, key=fits)]
```
:::

:::quiz output
What does this print?

```python
from bisect import bisect_left

rates = range(1, 12)
print(bisect_left(rates, True, key=lambda r: r >= 4))
```

- [ ] `4`
- [x] `3`
- [ ] `True`

`bisect_left` returns an *index*. The first rate that passes is `rates[3]`, which is `4`, so index the range with the result to get the value.
:::

## The k-th largest: heap or quickselect

:::compare
```js
const kth = nums.toSorted((a, b) => b - a)[k - 1];
```
```python
kth = heapq.nlargest(k, nums)[-1]
```
:::

There are three standard answers, at three different costs:

| Approach | Time | Extra space | Notes |
| --- | --- | --- | --- |
| `sorted(nums)[-k]` | O(n log n) | O(n) | the simplest, and it runs in C |
| `heapq.nlargest(k, nums)[-1]` | O(n log k) | O(k) | works on any iterable, even a stream |
| quickselect | O(n) average, O(n²) worst | O(n) as written below | the answer interviewers fish for |

`nlargest` keeps a min-heap of the k best items seen so far and replaces its root whenever a bigger item arrives, so memory stays at k. Quickselect partitions around a pivot and keeps only the side that holds the answer, for n + n/2 + n/4 + ... ≈ 2n work on average. A **random pivot** makes the quadratic case vanishingly unlikely (a fixed first-element pivot hits it on sorted input), and a three-way split into bigger, equal and smaller stops a run of duplicates from degrading it.

```python run
import heapq
import random

def kth_largest(nums, k):
    """Iterative quickselect: average O(n), and no recursion."""
    pool = nums
    while True:
        pivot = random.choice(pool)
        bigger = [x for x in pool if x > pivot]
        if k <= len(bigger):
            pool = bigger                      # the answer is one of the bigger ones
            continue
        same = pool.count(pivot)
        if k <= len(bigger) + same:
            return pivot
        k -= len(bigger) + same                # skip the bigger and equal ones
        pool = [x for x in pool if x < pivot]

nums = [7, 2, 9, 4, 9, 1, 5]
print(kth_largest(nums, 3), heapq.nlargest(3, nums)[-1], sorted(nums)[-3])
```

:::tip Measure before you choose
`nlargest`'s main loop is Python code, so it's fast only when few items beat the heap's root. On a million random numbers in this sandbox it's more than ten times faster than `sorted` for k = 10, but several times slower than `sorted` for k = n/2. There, the comprehension-based quickselect above beats both, because its partitions run at C speed. Use `nlargest` for a small k, and `sorted` or quickselect when k is a sizeable fraction of n.
:::

:::quiz
`heapq.nlargest(k, nums)` scans n numbers. What does it cost in the worst case?

- [ ] O(k log n)
- [x] O(n log k)
- [ ] O(n log n)
- [ ] O(n + k)

Each element is compared with the heap's root, and every element that beats it costs an O(log k) replacement. In the worst case (ascending input) that's every element: O(n log k) time and O(k) memory.
:::

## Intervals: sort, then sweep

:::compare
```js
intervals.sort((a, b) => a[0] - b[0] || a[1] - b[1]);
for (const [start, end] of intervals) {
  // ...
}
```
```python
for start, end in sorted(intervals):
    ...


```
:::

Interval problems nearly always start by sorting by start time. After the O(n log n) sort, an interval can only overlap its neighbours or whatever is still "open", so one pass finishes the job. Tuples already compare by start and then by end, so a plain `sorted()` does it. Decide early whether touching intervals overlap: page ranges `[1, 3]` and `[3, 5]` do, but a meeting from 9 to 10 and another from 10 to 11 don't.

- **Merging** overlapping intervals takes one pass that extends the last merged interval or starts a new one. It's the [Merge intervals](lesson:tuples-and-unpacking#tup-merge-intervals) challenge in the core course.
- **Inserting** into a list that is already sorted and non-overlapping needs no sort at all. Everything entirely before or entirely after the new interval stays put, and whatever lies in between merges into it, all in O(n).
- **Conflict checks** ask whether any meeting starts before the previous one ends. After sorting, that's one `all()` over `pairwise()`.

```python run
from itertools import pairwise

def insert(intervals, new):
    """intervals: sorted, non-overlapping, closed (start, end) pairs."""
    start, end = new
    before = [iv for iv in intervals if iv[1] < start]
    after = [iv for iv in intervals if iv[0] > end]
    for s, e in intervals[len(before):len(intervals) - len(after)]:
        start, end = min(start, s), max(end, e)       # swallow the overlaps
    return [*before, (start, end), *after]

def can_attend(meetings):                            # half-open: 10 frees up at 10
    ordered = sorted(meetings)
    return all(end <= start for (_, end), (start, _) in pairwise(ordered))

print(insert([(1, 2), (3, 5), (6, 7), (8, 10), (12, 16)], (4, 8)))
print(can_attend([(9, 10), (10, 11)]), can_attend([(9, 11), (10, 12)]))
```

Counting the rooms you need for a set of meetings, which is the number of meetings in progress at the busiest moment, adds one structure: a min-heap of the end times of the meetings in progress, so the room that frees up first is always at `heap[0]`. That's the [last challenge](#algo-meeting-rooms).

## Cheat sheet

| JavaScript | Python | Notes |
| --- | --- | --- |
| `xs.sort((a, b) => a - b)` | `xs.sort()` | in place, returns `None`, stable |
| `xs.toSorted(cmp)` | `sorted(xs, key=...)` | new list, O(n log n) |
| `a.x - b.x \|\| a.y - b.y` | `key=lambda r: (r.x, r.y)` | tuples compare field by field |
| `b.score - a.score` | `key=lambda r: -r.score` | numbers only; otherwise sort twice |
| any comparator | `key=cmp_to_key(cmp)` | from `functools` |
| hand-rolled lower bound | `bisect_left(xs, x)` | first index with `xs[i] >= x` |
| hand-rolled upper bound | `bisect_right(xs, x)` | first index with `xs[i] > x` |
| `xs.findLast((v) => v <= x)` | `xs[i - 1]`, `i = bisect_right(xs, x)` | O(log n); guard `i == 0` |
| count of `lo <= v <= hi` | `bisect_right(xs, hi) - bisect_left(xs, lo)` | on sorted data |
| search, then `splice(i, 0, x)` | `insort(xs, x)` | O(log n) search, O(n) insert |
| search records by a field | `bisect_left(rows, k, key=f)` | 3.10+; `key` isn't applied to `k` |
| `(lo + hi) >> 1` | `(lo + hi) // 2` | no overflow |
| `Math.ceil(a / b)` | `-(-a // b)` | exact for big ints |
| `toSorted(...)[k - 1]` | `heapq.nlargest(k, xs)[-1]` | O(n log k) |

## Challenges

:::challenge id=algo-sort-log-lines title="Reorder log lines" difficulty=easy
Each log line is an identifier, a space, then a message, as in `"web1 GET /cart"`. Write `reorder_logs(logs)` that returns a **new** list with:

- **letter-logs** (the message starts with a letter) first, sorted by message, with ties broken by identifier,
- then the **digit-logs** (the message starts with a digit), in their original order.

```text
reorder_logs([
    "dig1 8 1 5 1",
    "let1 art can",
    "dig2 3 6",
    "let2 own kit dig",
    "let3 art zero",
])
-> ["let1 art can", "let3 art zero", "let2 own kit dig", "dig1 8 1 5 1", "dig2 3 6"]
```

Do it with a single `sorted()` call and a key function. Stability does half the work.

```js
function reorderLogs(logs) {
  const split = (line) => [line.slice(0, line.indexOf(" ")), line.slice(line.indexOf(" ") + 1)];
  const isDigitLog = (line) => /^\d/.test(split(line)[1]);
  const cmp = (a, b) => (a < b ? -1 : a > b ? 1 : 0);
  const letters = logs.filter((line) => !isDigitLog(line));
  letters.sort((a, b) => {
    const [idA, msgA] = split(a), [idB, msgB] = split(b);
    return cmp(msgA, msgB) || cmp(idA, idB);
  });
  return [...letters, ...logs.filter(isDigitLog)];
}
```

```python starter
def reorder_logs(logs):
    ...
```

```python solution
def reorder_logs(logs):
    def key(line):
        ident, message = line.split(" ", 1)
        if message[0].isdigit():
            return (1,)          # every digit-log ties, so stability keeps their order
        return (0, message, ident)

    return sorted(logs, key=key)
```

```python tests
LOGS = [
    "dig1 8 1 5 1",
    "let1 art can",
    "dig2 3 6",
    "let2 own kit dig",
    "let3 art zero",
]

@test("letter-logs come first, sorted by message")
def _():
    eq(reorder_logs(LOGS), ["let1 art can", "let3 art zero", "let2 own kit dig", "dig1 8 1 5 1", "dig2 3 6"])

@test("ties on the message are broken by identifier")
def _():
    eq(
        reorder_logs(["b1 same text", "a2 same text", "a1 same text"]),
        ["a1 same text", "a2 same text", "b1 same text"],
    )

@test("digit-logs keep their original order")
def _():
    logs = ["z9 9 9", "a1 1 1", "m5 5 5"]
    eq(reorder_logs(logs), logs)

@test("the first character of the message decides the kind")
def _():
    eq(reorder_logs(["d1 404 not found", "l1 timeout 30s"]), ["l1 timeout 30s", "d1 404 not found"])

@test("compares whole messages, not just their first word")
def _():
    eq(reorder_logs(["x1 art zero", "x2 art can", "x3 art"]), ["x3 art", "x2 art can", "x1 art zero"])

@test("empty input")
def _():
    eq(reorder_logs([]), [])

@test("returns a new list and leaves the input alone")
def _():
    logs = list(LOGS)
    result = reorder_logs(logs)
    eq(logs, LOGS, "the input list changed")
    check(result is not logs, "return a new list, not the input")

@test("uses a key, not a comparator")
def _():
    forbids_call("cmp_to_key", "a tuple key plus stability is enough here")
```

```hint
`line.split(" ", 1)` splits off the identifier and keeps the rest of the message in one piece.
```

```hint
Return a tuple from the key: `(0, message, ident)` for letter-logs and `(1,)` for digit-logs. Tuples compare item by item, and `0 < 1` puts the letter-logs first.
```

```hint
Every digit-log gets the *same* key, so the sort leaves them in their input order. That's stability doing the work.
```
:::

:::challenge id=algo-largest-concat title="Largest concatenated number" difficulty=easy
Write `largest_number(nums)` that arranges a non-empty list of non-negative integers so that their concatenation is the largest possible number. Return it as a string with no leading zeros.

```text
largest_number([10, 2])            ->  "210"
largest_number([3, 30, 34, 5, 9])  ->  "9534330"
largest_number([0, 0])             ->  "0"
```

Sorting the digit strings in reverse doesn't work: it puts `"30"` before `"3"`, but `"330"` beats `"303"`. The right order is pairwise, so `a` goes first when `a + b > b + a`. Use `functools.cmp_to_key`.

```js
function largestNumber(nums) {
  const joined = nums
    .map(String)
    .sort((a, b) => (b + a > a + b) - (b + a < a + b))
    .join("");
  return joined[0] === "0" ? "0" : joined;
}
```

```python starter
def largest_number(nums):
    ...
```

```python solution
from functools import cmp_to_key


def largest_number(nums):
    digits = [str(n) for n in nums]

    def order(a, b):
        # Negative puts a first. a + b and b + a have the same length,
        # so comparing them as strings compares them as numbers.
        return (b + a > a + b) - (b + a < a + b)

    digits.sort(key=cmp_to_key(order))
    return "".join(digits).lstrip("0") or "0"
```

```python tests
@test("the examples")
def _():
    eq(largest_number([10, 2]), "210")
    eq(largest_number([3, 30, 34, 5, 9]), "9534330")

@test("all zeros collapse to a single 0")
def _():
    eq(largest_number([0, 0]), "0")
    eq(largest_number([0, 0, 0, 0]), "0")

@test("zeros mixed with other numbers")
def _():
    eq(largest_number([0, 1]), "10")
    eq(largest_number([0, 0, 1]), "100")
    eq(largest_number([10, 0]), "100")

@test("a single number")
def _():
    eq(largest_number([5]), "5")
    eq(largest_number([0]), "0")
    eq(largest_number([1000]), "1000")

@test("numbers that share a prefix")
def _():
    eq(largest_number([121, 12]), "12121")
    eq(largest_number([824, 8247]), "8248247")
    eq(largest_number([432, 43243]), "43243432")

@test("duplicates")
def _():
    eq(largest_number([1, 1, 1]), "111")
    eq(largest_number([9, 99, 999]), "999999")

@test("many numbers")
def _():
    nums = [d for d in range(1, 10) for _ in range(100)]
    eq(largest_number(nums), "".join(str(d) * 100 for d in range(9, 0, -1)))

@test("doesn't reorder the input")
def _():
    nums = [3, 30, 34, 5, 9]
    largest_number(nums)
    eq(nums, [3, 30, 34, 5, 9], "the input list changed")

@test("returns a string")
def _():
    check(isinstance(largest_number([1, 2]), str), "return a str, not an int")

@test("uses cmp_to_key")
def _():
    requires_call("cmp_to_key", "wrap a two-argument comparator with functools.cmp_to_key")
```

```hint
Convert the numbers to strings first. For a pair `a`, `b`, compare the two concatenations `a + b` and `b + a`. They have the same length, so string order is numeric order.
```

```hint
The comparator returns a negative number when `a` should come first, and `(x > y) - (x < y)` turns a comparison into -1, 0 or 1.
```

```hint
If the first piece after sorting is `"0"`, every piece is zero. `"".join(parts).lstrip("0") or "0"` handles that case.
```
:::

:::challenge id=algo-nearest-station title="Nearest charging station" difficulty=medium
Charging stations stand along a highway at the kilometre markers in `stations`, which are unsorted and may repeat. Write `nearest_stations(stations, cars)` that returns, for each car position in `cars`, the marker of the closest station. When two stations are equally close, pick the smaller marker. Raise `ValueError` if there are no stations.

```text
nearest_stations([30, 10, 50], [12, 40, 0, 55, 30])  ->  [10, 30, 10, 50, 30]
```

The brute force below scans every station for every car, which is O(n·q). Sort the stations once instead, then answer each car with `bisect` in O(log n): the closest station sits just left or just right of the car's insertion point.

```js
// Brute force: O(stations × cars)
const nearestStations = (stations, cars) =>
  cars.map((car) =>
    stations.reduce((best, s) => {
      const d = Math.abs(s - car), bestD = Math.abs(best - car);
      return d < bestD || (d === bestD && s < best) ? s : best;
    }));
```

```python starter
def nearest_stations(stations, cars):
    ...
```

```python solution
from bisect import bisect_left


def nearest_stations(stations, cars):
    if not stations:
        raise ValueError("there are no stations")
    markers = sorted(stations)
    nearest = []
    for car in cars:
        i = bisect_left(markers, car)
        # The floor is markers[i - 1] and the ceiling is markers[i]. Slicing clamps
        # at both ends, so there's no markers[-1] trap when i == 0.
        candidates = markers[max(i - 1, 0):i + 1]
        nearest.append(min(candidates, key=lambda m: (abs(m - car), m)))
    return nearest
```

```python tests
@test("the example")
def _():
    eq(nearest_stations([30, 10, 50], [12, 40, 0, 55, 30]), [10, 30, 10, 50, 30])

@test("a car at a station gets that station")
def _():
    eq(nearest_stations([5, 15, 25], [5, 15, 25]), [5, 15, 25])

@test("cars before the first or after the last station")
def _():
    eq(nearest_stations([100, 200], [-50, 0, 99]), [100, 100, 100])
    eq(nearest_stations([100, 200], [201, 10_000]), [200, 200])

@test("ties go to the smaller marker")
def _():
    eq(nearest_stations([10, 20], [15]), [10])
    eq(nearest_stations([20, 10, 30], [15, 25]), [10, 20])

@test("duplicate stations")
def _():
    eq(nearest_stations([5, 5, 9, 9], [6, 8, 7]), [5, 9, 5])

@test("negative and fractional markers")
def _():
    eq(nearest_stations([-3.5, 2], [-1, 0, -0.75]), [-3.5, 2, -3.5])

@test("a single station serves every car")
def _():
    eq(nearest_stations([42], [0, 42, 1_000]), [42, 42, 42])

@test("no cars")
def _():
    eq(nearest_stations([1, 2, 3], []), [])

@test("no stations raises ValueError")
def _():
    raises(ValueError, nearest_stations, [], [5])

@test("doesn't modify the inputs")
def _():
    stations, cars = [30, 10, 50], [12, 40]
    nearest_stations(stations, cars)
    eq(stations, [30, 10, 50], "stations were reordered")
    eq(cars, [12, 40], "cars were changed")

@test("50,000 stations and 50,000 cars stay fast")
def _():
    stations = [(i * 7919) % 50_000 * 10 for i in range(50_000)]   # 0, 10, ..., 499_990, shuffled
    cars = [(i * 7907) % 500_000 for i in range(50_000)]
    expected = [min((car + 4) // 10 * 10, 499_990) for car in cars]  # round half down
    check(nearest_stations(stations, cars) == expected, "some cars got the wrong station")
```

```hint
Sort the markers once, outside the loop. Sorting per car would cost more than the brute force.
```

```hint
`i = bisect_left(markers, car)` is the insertion point: `markers[i - 1]` is the nearest station on the left and `markers[i]` the nearest at or to the right. Either one may not exist.
```

```hint
`min(candidates, key=lambda m: (abs(m - car), m))` picks the nearer one and breaks ties with the smaller marker. Watch `i == 0`: `markers[i - 1]` would be the *last* station, but a slice like `markers[max(i - 1, 0):i + 1]` can't wrap around.
```
:::

:::challenge id=algo-min-ship-capacity title="Minimum shipping capacity" difficulty=medium
Packages with the given `weights` must ship **in order** within `days` days. Each day the ship takes packages from the front of the line until the next one would exceed its capacity. Write `min_capacity(weights, days)` that returns the smallest capacity that ships everything in time.

```text
min_capacity([1, 2, 3, 4, 5, 6, 7, 8, 9, 10], 5)  ->  15
min_capacity([3, 2, 2, 4, 1, 4], 3)               ->  6
min_capacity([1, 2, 3, 1, 1], 4)                  ->  3
```

`weights` is non-empty, every weight is positive, and `days >= 1`. The brute force below tries every capacity in turn. Binary search on the answer instead: the capacity lies between `max(weights)` and `sum(weights)`, and if a capacity works, every larger one does too.

```js
// Brute force: correct, but it tries every capacity up to the answer
function minCapacity(weights, days) {
  const fits = (cap) => {
    let used = 1, load = 0;
    for (const w of weights) {
      if (load + w > cap) { used++; load = 0; }
      load += w;
    }
    return used <= days;
  };
  for (let cap = Math.max(...weights); ; cap++) if (fits(cap)) return cap;
}
```

```python starter
def min_capacity(weights, days):
    ...
```

```python solution
def min_capacity(weights, days):
    def ships_in_time(capacity):
        days_used, load = 1, 0
        for weight in weights:
            if load + weight > capacity:   # this one waits for the next day
                days_used += 1
                load = 0
            load += weight
        return days_used <= days

    lo, hi = max(weights), sum(weights)    # hi always works: everything on day one
    while lo < hi:
        mid = (lo + hi) // 2
        if ships_in_time(mid):
            hi = mid
        else:
            lo = mid + 1
    return lo
```

```python tests
@test("the examples")
def _():
    eq(min_capacity([1, 2, 3, 4, 5, 6, 7, 8, 9, 10], 5), 15)
    eq(min_capacity([3, 2, 2, 4, 1, 4], 3), 6)
    eq(min_capacity([1, 2, 3, 1, 1], 4), 3)

@test("a single day means shipping everything at once")
def _():
    eq(min_capacity([4, 8, 15, 16, 23, 42], 1), 108)

@test("with a day per package, the heaviest one decides")
def _():
    eq(min_capacity([4, 8, 15, 16, 23, 42], 6), 42)
    eq(min_capacity([4, 8, 15, 16, 23, 42], 100), 42)

@test("a single package")
def _():
    eq(min_capacity([7], 1), 7)
    eq(min_capacity([7], 3), 7)

@test("equal weights")
def _():
    eq(min_capacity([5] * 10, 3), 20)

@test("packages can't be reordered")
def _():
    eq(min_capacity([5, 5, 1, 1], 2), 7)

@test("doesn't modify the input")
def _():
    weights = [3, 2, 2, 4, 1, 4]
    min_capacity(weights, 3)
    eq(weights, [3, 2, 2, 4, 1, 4], "the input list changed")

@test("20,000 packages: binary search, not a linear scan")
def _():
    weights = [(i * i * 31 + i * 17) % 1000 + 1 for i in range(20_000)]
    eq(min_capacity(weights, 7), 1_394_631)
```

```hint
Write `ships_in_time(capacity)` first: walk the weights and start a new day whenever the next package doesn't fit. It's O(n).
```

```hint
`ships_in_time` is False up to some capacity and True from there on, and the answer lies in `[max(weights), sum(weights)]`. Binary search for the first True.
```

```hint
With `lo, hi = max(weights), sum(weights)`: if `mid` works, the answer is `mid` or smaller (`hi = mid`); otherwise it's bigger (`lo = mid + 1`). Stop when `lo == hi`.
```
:::

:::challenge id=algo-meeting-rooms title="Meeting rooms" difficulty=hard
Write `min_rooms(meetings)` that returns the smallest number of rooms that can hold every meeting. Each meeting is a `(start, end)` pair with `start < end`. Meetings are half-open: one that ends at 10 frees its room for one that starts at 10.

```text
min_rooms([(0, 30), (5, 10), (15, 20)])  ->  2
min_rooms([(7, 10), (2, 4)])             ->  1
min_rooms([])                            ->  0
```

The brute force below counts the meetings in progress at every start time, which is O(n²). Aim for O(n log n): sort by start time and keep a min-heap of the end times of the rooms in use.

```js
// Brute force: at each meeting's start, count the meetings in progress
const minRooms = (meetings) =>
  Math.max(0, ...meetings.map(([t]) =>
    meetings.filter(([start, end]) => start <= t && t < end).length));
```

```python starter
def min_rooms(meetings):
    ...
```

```python solution
import heapq


def min_rooms(meetings):
    ends = []                                 # end times of the rooms in use (min-heap)
    for start, end in sorted(meetings):
        if ends and ends[0] <= start:
            heapq.heapreplace(ends, end)      # the earliest-free room is free: reuse it
        else:
            heapq.heappush(ends, end)         # every room is busy: open another one
    return len(ends)
```

```python tests
@test("the examples")
def _():
    eq(min_rooms([(0, 30), (5, 10), (15, 20)]), 2)
    eq(min_rooms([(7, 10), (2, 4)]), 1)

@test("no meetings need no rooms")
def _():
    eq(min_rooms([]), 0)

@test("a single meeting")
def _():
    eq(min_rooms([(9, 17)]), 1)

@test("back-to-back meetings share a room")
def _():
    eq(min_rooms([(9, 10), (10, 11), (11, 12)]), 1)
    eq(min_rooms([(11, 12), (9, 10), (10, 11)]), 1)

@test("identical meetings each need a room")
def _():
    eq(min_rooms([(1, 5)] * 4), 4)

@test("one long meeting overlapping short ones")
def _():
    eq(min_rooms([(1, 10), (2, 3), (4, 5), (6, 7), (8, 9)]), 2)

@test("the busiest moment decides, not the number of overlaps")
def _():
    eq(min_rooms([(1, 4), (2, 5), (3, 6), (5, 8), (6, 9)]), 3)

@test("negative and fractional times")
def _():
    eq(min_rooms([(-5, 0), (0, 2.5), (-1, 1)]), 2)

@test("doesn't reorder the input")
def _():
    meetings = [(15, 20), (0, 30), (5, 10)]
    min_rooms(meetings)
    eq(meetings, [(15, 20), (0, 30), (5, 10)], "the input list changed")

@test("100,000 meetings in well under a second")
def _():
    n = 100_000
    meetings = [(start, start + 50) for start in ((i * 7919) % n for i in range(n))]
    eq(min_rooms(meetings), 50)
```

```hint
Sort the meetings by start time (a plain `sorted()` does that for tuples), then decide meeting by meeting whether an existing room is free.
```

```hint
Keep the end times of the rooms in use in a min-heap, so `ends[0]` is the room that frees up first. If `ends[0] <= start`, that room is free.
```

```hint
Reusing a room means replacing its end time: `heapq.heapreplace(ends, end)`. Otherwise, `heappush` a new room. The heap's final size is the number of rooms you ever needed.
```
:::
