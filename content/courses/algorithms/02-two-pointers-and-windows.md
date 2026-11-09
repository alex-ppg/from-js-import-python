---
title: Two Pointers, Sliding Windows & Prefix Sums
part: Patterns
summary: Turn nested loops into single passes with two pointers, sliding windows, prefix sums and Kadane's algorithm.
minutes: 45
---

Most array and string problems have an obvious O(n²) answer: try every pair, or every subarray. The patterns in this lesson find the O(n) answer by never revisiting work. Two indices walk toward each other or at different speeds, a window slides instead of being rebuilt, and running sums answer range questions in O(1).

The algorithms are the same in any language. The Python part is mostly about what *not* to carry over: slicing inside a loop copies, a negative index silently reads from the other end, and `del xs[i]`, `remove` and `pop(0)` are each O(n). The [toolkit lesson](lesson:algorithm-toolkit#what-the-built-ins-cost) has the full table of costs.

## Opposite-end pointers

:::compare
```js
// every pair: O(n²)
function pairWithSum(prices, budget) {
  for (let i = 0; i < prices.length; i++) {
    for (let j = i + 1; j < prices.length; j++) {
      if (prices[i] + prices[j] === budget) return [prices[i], prices[j]];
    }
  }
  return null;
}

pairWithSum([3, 8, 11, 15, 22], 26);   // [11, 15]
pairWithSum([3, 8, 11, 15, 22], 4);    // null
```
```python run
def pair_with_sum(prices, budget):   # prices is sorted
    lo, hi = 0, len(prices) - 1
    while lo < hi:
        total = prices[lo] + prices[hi]
        if total == budget:
            return prices[lo], prices[hi]
        if total < budget:
            lo += 1                  # only a bigger left value can help
        else:
            hi -= 1                  # only a smaller right value can help
    return None

print(pair_with_sum([3, 8, 11, 15, 22], 26))
print(pair_with_sum([3, 8, 11, 15, 22], 4))
```
:::

On a sorted list, start one index at each end. If the pair sums too low, `prices[lo]` can't be part of any answer (pairing it with anything smaller than `prices[hi]` only lowers the sum), so move `lo` right. If it's too high, the same argument retires `prices[hi]`. Every step discards one element for good: O(n) time and O(1) space. The same shape reverses a list in place, checks palindromes, and builds sorted output from both ends.

Pointers can also skip what doesn't matter. A palindrome check that ignores punctuation and case moves each side past non-alphanumeric characters before comparing:

```python run
def is_palindrome(text):
    lo, hi = 0, len(text) - 1
    while lo < hi:
        if not text[lo].isalnum():
            lo += 1
        elif not text[hi].isalnum():
            hi -= 1
        elif text[lo].lower() != text[hi].lower():
            return False
        else:
            lo, hi = lo + 1, hi - 1
    return True

print(is_palindrome("Never odd or even!"), is_palindrome("Was it a rat?"))
```

:::pythonic Sometimes a slice is the better answer
For a plain string, `word == word[::-1]` is the idiomatic palindrome check (JS: `[...word].reverse().join("")`). It's O(n) time, with an O(n) copy. Reach for two pointers when you'd otherwise build a cleaned-up copy first, or when the interviewer asks for O(1) extra space.
:::

:::gotcha A pointer that runs off the left end doesn't crash
In JavaScript, `xs[-1]` is `undefined`, and the bug usually surfaces a line later. In Python, `xs[-1]` is the **last element**, so an index that drifts below zero quietly reads real data from the other end. Keep loop conditions tight (`lo < hi`, `i >= 0`) and check bounds before you index, rather than relying on an `IndexError` to catch you.
:::

## Fast and slow pointers

:::compare
```js
function isHappy(n) {          // does n -> sum of squared digits reach 1?
  const seen = new Set();      // O(n) memory
  while (n !== 1 && !seen.has(n)) {
    seen.add(n);
    n = [...String(n)].reduce((sum, d) => sum + d * d, 0);
  }
  return n === 1;
}

Array.from({ length: 29 }, (_, i) => i + 1).filter(isHappy);
```
```python run
def step(n):
    return sum(int(d) ** 2 for d in str(n))

def is_happy(n):               # does n -> sum of squared digits reach 1?
    slow = fast = n            # O(1) memory
    while True:
        slow = step(slow)
        fast = step(step(fast))
        if slow == fast:       # they meet inside the loop
            return slow == 1

print([n for n in range(1, 30) if is_happy(n)])
```
:::

Any sequence built by repeating `x = f(x)` over a finite set of values must eventually cycle. Floyd's "tortoise and hare" moves one pointer a step at a time and the other two steps at a time. Once both are inside the cycle, the fast one closes the gap by one step per move, so they're guaranteed to meet. That detects the cycle in time proportional to the sequence's length before it repeats, with O(1) memory where a `seen` set grows with every value. Here 1 maps to itself, so a happy number's pointers meet at 1. The same trick finds the loop in a linked list ([Linked Lists & Trees](lesson:linked-lists-and-trees)).

## In-place compaction

:::compare
```js
// drop the zeros, in place
for (let i = nums.length - 1; i >= 0; i--) {
  if (nums[i] === 0) nums.splice(i, 1);   // O(n) each: O(n²) overall
}
```
```python
write = 0
for value in nums:                       # the read pointer
    if value != 0:
        nums[write] = value              # keep it
        write += 1
del nums[write:]                         # truncate once
```
:::

When you must remove things from a list in place, run two pointers in the same direction. The read pointer visits every element, the write pointer marks where the next survivor goes, and a single `del nums[write:]` truncates at the end: O(n) time, O(1) extra space. The JS habit of a backwards `splice` loop is quadratic, and so are its Python spellings, `del nums[i]`, `nums.pop(i)` and `nums.remove(x)` inside a loop. Writing behind the read pointer is safe, because it never overwrites anything the loop hasn't read yet.

```python run
def move_zeros_to_end(nums):
    write = 0
    for value in nums:
        if value != 0:
            nums[write] = value
            write += 1
    nums[write:] = [0] * (len(nums) - write)   # refill the tail in one go

orders = [0, 3, 0, 0, 7, 1]
move_zeros_to_end(orders)
print(orders)
```

:::pythonic The non-interview answer: assign to a slice
Outside an interview, `nums[:] = [v for v in nums if v != 0]` does the job in one line: O(n) time, O(n) temporary space. The `[:]` matters. It replaces the list's *contents*, so the caller sees the change. `nums = [...]` would only rebind the local name, exactly like reassigning a parameter in JavaScript.
:::

```python run
def drop_zeros_wrong(nums):
    nums = [v for v in nums if v != 0]      # a new local list; the caller's is untouched

def drop_zeros(nums):
    nums[:] = [v for v in nums if v != 0]   # same list object, new contents

stock = [4, 0, 2, 0]
drop_zeros_wrong(stock)
print(stock)
drop_zeros(stock)
print(stock)
```

:::quiz
`nums` holds `n` numbers, about half of them zeros. What's the time complexity of this loop?

```python
for value in list(nums):
    if value == 0:
        nums.remove(0)
```

- [ ] O(n)
- [ ] O(n log n)
- [x] O(n²)

Iterating over a copy avoids the skipped-element bug, but each `remove(0)` scans from the front for a zero and then shifts everything after it. That's O(n) per removal and about n/2 removals.
:::

## Fixed-size windows

:::compare
```js
// the best total over k consecutive days: O(n·k)
let best = -Infinity;
for (let i = 0; i + k <= sales.length; i++) {
  const total = sales.slice(i, i + k).reduce((a, b) => a + b, 0);
  best = Math.max(best, total);
}
```
```python
window = sum(sales[:k])                 # the first window
best = window
for i in range(k, len(sales)):
    window += sales[i] - sales[i - k]   # add the new day, drop the oldest
    best = max(best, window)
```
:::

Neighbouring windows share k − 1 elements, so update the window instead of rebuilding it: O(n) time and O(1) space. The literal Python translation of the JS version, `max(sum(sales[i:i + k]) for i in ...)`, is O(n·k) twice over, because every slice copies k items before `sum` adds them up. When you need the window's contents and not just its total, keep them in a `deque(maxlen=k)` ([the toolkit](lesson:algorithm-toolkit#deque-o-1-at-both-ends)).

```python run
def best_run(sales, k):
    if not 0 < k <= len(sales):
        raise ValueError(f"need 1 <= k <= {len(sales)}, got {k}")
    window = sum(sales[:k])
    best = window
    for i in range(k, len(sales)):
        window += sales[i] - sales[i - k]
        best = max(best, window)
    return best

daily = [3, 1, 4, 1, 5, 9, 2, 6, 5, 3]
print(best_run(daily, 3))       # 9 + 2 + 6
print(best_run(daily, 10))      # the whole list is one window
```

:::quiz
With `n` days of sales and a window of `k` days, what's the time complexity of this one-liner?

```python
best = max(sum(sales[i:i + k]) for i in range(len(sales) - k + 1))
```

- [ ] O(n)
- [x] O(n·k)
- [ ] O(n log n)
- [ ] O(k)

There are about n windows, and each one costs O(k) twice: once to copy the slice and once to sum it. With n = 100,000 and k = 50,000 that's billions of steps, where the rolling total needs 100,000.
:::

## Variable-size windows

:::compare
```js
// the longest run of unique characters: every start, O(n²)
let best = 0;
for (let i = 0; i < s.length; i++) {
  const seen = new Set();
  for (let j = i; j < s.length && !seen.has(s[j]); j++) seen.add(s[j]);
  best = Math.max(best, seen.size);
}
```
```python
last_seen = {}                         # char -> index of its latest copy
best = left = 0
for right, ch in enumerate(s):
    if last_seen.get(ch, -1) >= left:  # ch repeats inside the window
        left = last_seen[ch] + 1       # jump past the earlier copy
    last_seen[ch] = right
    best = max(best, right - left + 1)
```
:::

A variable window grows by one on the right every step and shrinks from the left only when it breaks the rule. Both edges only move forward, so each element enters and leaves the window once: O(n) time, plus space for whatever the window tracks (here, one entry per distinct character). For "longest substring without repeating characters", remembering each character's latest index lets `left` jump straight past the duplicate instead of creeping.

The general template is "grow, then shrink while invalid". Here it finds the shortest run of consecutive payments that reaches a target:

```python run
import math

def shortest_reaching(payments, target):
    best = math.inf
    total = left = 0
    for right, amount in enumerate(payments):
        total += amount
        while total >= target:             # valid: record it, then try smaller
            best = min(best, right - left + 1)
            total -= payments[left]
            left += 1
    return best if best != math.inf else 0

print(shortest_reaching([2, 3, 1, 2, 4, 3], 7))   # [4, 3]
print(shortest_reaching([1, 1, 1], 10))           # no run is enough
```

:::gotcha Windows need a rule that shrinking can only help
The shrink loop assumes that dropping the leftmost element makes an invalid window "less invalid". With all-positive payments, removing one always lowers the total, so that holds. Add a negative number and it doesn't: a window's sum can rise when it gets shorter, and the sliding window gives wrong answers. That's the job for prefix sums, below.
:::

:::quiz output
This version forgets one check. What does it print?

```python
def longest_unique(s):
    last_seen = {}
    best = left = 0
    for right, ch in enumerate(s):
        if ch in last_seen:
            left = last_seen[ch] + 1
        last_seen[ch] = right
        best = max(best, right - left + 1)
    return best

print(longest_unique("abba"))
```

- [ ] `2`
- [x] `3`
- [ ] `4`
- [ ] `1`

The right answer is 2, but at the final `a`, its earlier copy (index 0) is already outside the window, and the code moves `left` *backwards* from 2 to 1. The window `"bba"` then counts as unique. Guard with `last_seen[ch] >= left`, or write `left = max(left, last_seen[ch] + 1)`.
:::

## Prefix sums with `accumulate`

:::compare
```js
const prefix = [0];
for (const x of sales) prefix.push(prefix.at(-1) + x);

// the sum of sales[i] through sales[j - 1], in O(1)
const rangeSum = (i, j) => prefix[j] - prefix[i];
```
```python
from itertools import accumulate

prefix = list(accumulate(sales, initial=0))

def range_sum(i, j):           # sum(sales[i:j]), in O(1)
    return prefix[j] - prefix[i]
```
:::

`prefix[j] - prefix[i]` is the sum of `sales[i:j]`, so after an O(n) build, every range query costs O(1) instead of the O(j − i) of `sum(sales[i:j])`. `initial=0` adds the empty prefix at the front, which lines the indices up with Python's slicing: `prefix` has n + 1 entries, and the half-open range `[i, j)` means the same thing in both. `accumulate` takes any two-argument function, so `accumulate(xs, max)` gives running maxima.

```python run
from itertools import accumulate

sales = [5, 3, 8, 6, 2]
prefix = list(accumulate(sales, initial=0))
print(prefix)                                    # n + 1 entries
print(prefix[4] - prefix[1], sum(sales[1:4]))    # the same range: O(1) vs O(k)
print(list(accumulate(sales, max)))              # running maximum
```

## Subarray sum equals k: prefix sums meet a `Counter`

:::compare
```js
// how many subarrays add up to k? every start and end: O(n²)
let count = 0;
for (let i = 0; i < nums.length; i++) {
  let sum = 0;
  for (let j = i; j < nums.length; j++) {
    sum += nums[j];
    if (sum === k) count++;
  }
}
```
```python
from collections import Counter

seen = Counter({0: 1})         # the empty prefix
count = total = 0
for n in nums:
    total += n
    count += seen[total - k]   # earlier prefixes exactly k below this one
    seen[total] += 1
```
:::

A subarray ending at the current element sums to `k` exactly when some earlier prefix equals `total - k`. So count the prefixes as you go, and each step adds how many earlier prefixes fit: O(n) time and O(n) space. It works with negative numbers, where a sliding window can't, because it never assumes that a longer window has a bigger sum. Two details make or break it. Seed the counter with `{0: 1}` so subarrays starting at index 0 are counted, and look up **before** recording the current prefix, or with `k == 0` every prefix would pair with itself. A `Counter` returns `0` for prefixes it hasn't seen, without inserting them.

```python run
from collections import Counter

def count_subarrays_summing_to(nums, k):
    seen = Counter({0: 1})
    count = total = 0
    for n in nums:
        total += n
        count += seen[total - k]
        seen[total] += 1
    return count

print(count_subarrays_summing_to([1, 1, 1], 2))          # [1, 1] twice
print(count_subarrays_summing_to([3, 4, -7, 3, 1], 0))   # negatives are fine
print(count_subarrays_summing_to([0, 0], 0))             # [0], [0] and [0, 0]
```

:::quiz output
This version records each prefix before looking it up. What does it print? (The right answer is 1: just `[1, -1]`.)

```python
from collections import Counter

seen = Counter({0: 1})
count = total = 0
for n in [1, -1]:
    total += n
    seen[total] += 1
    count += seen[total - 0]
print(count)
```

- [ ] `1`
- [ ] `2`
- [x] `3`
- [ ] `0`

With `k == 0`, `total - k` is `total` itself, so every prefix finds the copy of itself that was just recorded. That adds one false match per element: 1 + 2 = 3 instead of 0 + 1 = 1.
:::

## Kadane's algorithm

:::compare
```js
// the best sum of any contiguous run: every start and end, O(n²)
let best = -Infinity;
for (let i = 0; i < nums.length; i++) {
  let sum = 0;
  for (let j = i; j < nums.length; j++) {
    sum += nums[j];
    best = Math.max(best, sum);
  }
}
```
```python
def max_subarray(nums):
    best, current = nums[0], 0         # nums[0]: IndexError on an empty list
    for x in nums:
        current = max(x, current + x)  # extend the run, or restart at x
        best = max(best, current)
    return best
```
:::

Kadane's algorithm tracks the best sum of a run that *ends at the current element*. Either the run so far helps (`current + x`) or it doesn't and you restart at `x`. The answer is the best `current` seen anywhere. It's one pass, O(n) time and O(1) space: dynamic programming with the whole table squeezed into one variable ([Dynamic Programming](lesson:dynamic-programming)). Tracking where the current run started recovers the subarray itself.

```python run
def best_streak(changes):
    best, current = changes[0], 0
    start = best_start = best_end = 0
    for i, x in enumerate(changes):
        if current + x < x:              # the old run only drags x down
            current, start = x, i
        else:
            current += x
        if current > best:
            best, best_start, best_end = current, start, i
    return best, changes[best_start:best_end + 1]

print(best_streak([-2, 1, -3, 4, -1, 2, 1, -5, 4]))
print(best_streak([-3, -1, -2]))         # all negative: the least bad day
```

:::quiz output
What does this print?

```python
def max_subarray(nums):
    best = current = 0
    for x in nums:
        current = max(x, current + x)
        best = max(best, current)
    return best

print(max_subarray([-4, -1, -7]))
```

- [ ] `-1`
- [x] `0`
- [ ] `-12`
- [ ] `-4`

`best` starts at 0, and no non-empty subarray of an all-negative list beats it, so the function returns the sum of the *empty* subarray. Initialise `best` from `nums[0]` (or `-math.inf`) and the answer is the correct `-1`.
:::

## Cheat sheet

| Signal in the problem | Pattern | Core move | Time, space |
| --- | --- | --- | --- |
| sorted input, find a pair | opposite-end pointers | `while lo < hi:` move the side that can improve | O(n), O(1) |
| a sequence `x = f(x)` might loop | fast and slow pointers | `slow = f(slow)`, `fast = f(f(fast))` | O(n), O(1) |
| remove or dedupe in place | read/write pointers | `nums[write] = x`, then `del nums[write:]` | O(n), O(1) |
| every run of exactly k items | fixed window | `window += xs[i] - xs[i - k]` | O(n), O(1) |
| longest/shortest run obeying a rule | variable window | grow right; `while` broken, shrink left | O(n), O(distinct values) |
| many range-sum queries | prefix sums | `prefix = list(accumulate(xs, initial=0))` | O(n) build, O(1) per query |
| count subarrays summing to k, negatives allowed | prefix sums + `Counter` | `count += seen[total - k]`, then `seen[total] += 1` | O(n), O(n) |
| best contiguous sum | Kadane | `current = max(x, current + x)` | O(n), O(1) |

## Challenges

:::challenge id=algo-sorted-squares title="Squares of a sorted list" difficulty=easy
Write `sorted_squares(nums)` that takes a list of integers sorted in ascending order, negatives included, and returns a **new** list of their squares, also in ascending order.

```text
sorted_squares([-4, -1, 0, 3, 10])  ->  [0, 1, 9, 16, 100]
sorted_squares([-7, -3, 2, 3, 11])  ->  [4, 9, 9, 49, 121]
```

Squaring and re-sorting is O(n log n). Do it in O(n) with two pointers, and without calling `sorted()` or `.sort()`.

```js
const sortedSquares = (nums) => nums.map((n) => n * n).sort((a, b) => a - b);
```

```python starter
def sorted_squares(nums):
    ...
```

```python solution
def sorted_squares(nums):
    result = [0] * len(nums)
    lo, hi = 0, len(nums) - 1
    for out in range(len(nums) - 1, -1, -1):    # fill from the back
        if abs(nums[lo]) > abs(nums[hi]):
            result[out] = nums[lo] * nums[lo]
            lo += 1
        else:
            result[out] = nums[hi] * nums[hi]
            hi -= 1
    return result
```

```python tests
@test("mixed signs")
def _():
    eq(sorted_squares([-4, -1, 0, 3, 10]), [0, 1, 9, 16, 100])
    eq(sorted_squares([-7, -3, 2, 3, 11]), [4, 9, 9, 49, 121])

@test("all negative")
def _():
    eq(sorted_squares([-5, -3, -1]), [1, 9, 25])

@test("all non-negative")
def _():
    eq(sorted_squares([0, 2, 3]), [0, 4, 9])

@test("duplicates and zeros")
def _():
    eq(sorted_squares([-2, -2, 0, 0, 2]), [0, 0, 4, 4, 4])

@test("one element, or none")
def _():
    eq(sorted_squares([-3]), [9])
    eq(sorted_squares([]), [])

@test("returns a new list and leaves the input alone")
def _():
    nums = [-2, 1, 3]
    result = sorted_squares(nums)
    eq(nums, [-2, 1, 3], "the input list changed")
    check(result is not nums, "return a new list")

@test("500,000 numbers in O(n)")
def _():
    nums = list(range(-250_000, 250_000))
    result = sorted_squares(nums)
    check(result == sorted(n * n for n in nums), "wrong result for the large input")

@test("no sorting")
def _():
    forbids_call("sorted", "the two-pointer merge is O(n): no sorting needed")
    forbids_call("sort", "the two-pointer merge is O(n): no sorting needed")
```

```hint
In a sorted list with negatives, the biggest squares sit at the two ends and the smallest is somewhere in the middle. So build the result from the back.
```

```hint
Keep `lo` and `hi` at the ends. Compare `abs(nums[lo])` with `abs(nums[hi])`, write the larger one's square into the last free slot, and move that pointer inward.
```
:::

:::challenge id=algo-keep-at-most-k title="Keep at most k copies" difficulty=medium
Write `keep_at_most(nums, k)` that takes a **sorted** list and removes the extra copies in place, so that each value appears at most `k` times and the order is preserved. Like `list.sort()`, it mutates its argument and returns `None`. `k` is at least 1.

```text
nums = [1, 1, 1, 2, 2, 3]
keep_at_most(nums, 2)
nums  ->  [1, 1, 2, 2, 3]
```

Use a read pointer and a write pointer, and truncate once at the end. Deleting one duplicate at a time is O(n) per deletion, which makes the whole thing O(n²).

```js
function keepAtMost(nums, k) {
  for (let i = nums.length - 1; i >= k; i--) {
    if (nums[i] === nums[i - k]) nums.splice(i, 1);   // O(n) per removal
  }
}
```

```python starter
def keep_at_most(nums, k):
    ...
```

```python solution
def keep_at_most(nums, k):
    write = 0
    for value in nums:
        # Keep it, unless the survivor k places back already holds this value
        if write < k or nums[write - k] != value:
            nums[write] = value
            write += 1
    del nums[write:]
```

```python tests
def kept(nums, k):
    nums = list(nums)
    keep_at_most(nums, k)
    return nums

@test("keeps at most two copies")
def _():
    eq(kept([1, 1, 1, 2, 2, 3], 2), [1, 1, 2, 2, 3])

@test("k = 1 removes every duplicate")
def _():
    eq(kept([0, 0, 1, 1, 1, 2, 3, 3], 1), [0, 1, 2, 3])

@test("runs shorter than k are untouched")
def _():
    eq(kept([1, 2, 2, 3], 5), [1, 2, 2, 3])

@test("negatives and long runs")
def _():
    eq(kept([-3, -3, -3, -3, 0, 5, 5, 5, 5, 5], 3), [-3, -3, -3, 0, 5, 5, 5])

@test("empty and single-element lists")
def _():
    eq(kept([], 2), [])
    eq(kept([7], 1), [7])

@test("modifies the caller's list in place and returns None")
def _():
    nums = [4, 4, 4, 9]
    alias = nums
    eq(keep_at_most(nums, 1), None, "return None, like list.sort()")
    eq(alias, [4, 9], "the caller's list didn't change: mutate it, don't rebind the name")

@test("1,400,000 values in one pass")
def _():
    nums = [i // 7 for i in range(1_400_000)]       # every value 7 times
    keep_at_most(nums, 2)
    eq(len(nums), 400_000)
    check(nums == [v for v in range(200_000) for _ in range(2)], "wrong values kept")
```

```hint
Keep a `write` index: everything before it is the answer so far. Walk every `value` in the list (that's the read pointer) and decide whether to copy it to `nums[write]`.
```

```hint
Because the list is sorted, `value` would be one copy too many exactly when the survivor `k` places back, `nums[write - k]`, is equal to it. The first `k` values are always kept.
```

```hint
After the loop, `del nums[write:]` drops the leftover tail in one step.
```
:::

:::challenge id=algo-longest-k-distinct title="Longest stretch with k distinct characters" difficulty=medium
Write `longest_with_k_distinct(s, k)` that returns the longest substring of `s` with at most `k` distinct characters. If several are equally long, return the leftmost. `k` can be `0`, in which case the answer is `""`.

```text
longest_with_k_distinct("eceba", 2)    ->  "ece"
longest_with_k_distinct("aabbcc", 1)   ->  "aa"
longest_with_k_distinct("aabbcc", 3)   ->  "aabbcc"
```

Make it O(n) with a variable window: grow it on the right, and while it holds more than `k` distinct characters, shrink it from the left. Count the characters in the window with a `Counter`.

```js
function longestWithKDistinct(s, k) {
  let best = "";
  for (let i = 0; i < s.length; i++) {          // every start: O(n²)
    const seen = new Set();
    for (let j = i; j < s.length; j++) {
      seen.add(s[j]);
      if (seen.size > k) break;
      if (j - i + 1 > best.length) best = s.slice(i, j + 1);
    }
  }
  return best;
}
```

```python starter
from collections import Counter


def longest_with_k_distinct(s, k):
    ...
```

```python solution
from collections import Counter


def longest_with_k_distinct(s, k):
    counts = Counter()
    best_start = best_len = 0
    left = 0
    for right, ch in enumerate(s):
        counts[ch] += 1
        while len(counts) > k:                 # too many distinct: shrink
            gone = s[left]
            counts[gone] -= 1
            if counts[gone] == 0:
                del counts[gone]               # a zero count still counts as a key
            left += 1
        if right - left + 1 > best_len:        # strictly longer keeps the leftmost tie
            best_start, best_len = left, right - left + 1
    return s[best_start:best_start + best_len]
```

```python tests
@test("examples")
def _():
    eq(longest_with_k_distinct("eceba", 2), "ece")
    eq(longest_with_k_distinct("aabbcc", 1), "aa")
    eq(longest_with_k_distinct("aabbcc", 3), "aabbcc")

@test("ties go to the leftmost substring")
def _():
    eq(longest_with_k_distinct("aabbcc", 2), "aabb")
    eq(longest_with_k_distinct("abcabc", 2), "ab")

@test("k = 0 gives an empty string")
def _():
    eq(longest_with_k_distinct("abc", 0), "")

@test("an empty string gives an empty string")
def _():
    eq(longest_with_k_distinct("", 2), "")

@test("k larger than the number of distinct characters")
def _():
    eq(longest_with_k_distinct("abc", 10), "abc")

@test("case-sensitive, and emoji are single characters")
def _():
    eq(longest_with_k_distinct("aAaA", 1), "a")
    eq(longest_with_k_distinct("😀😀x", 1), "😀😀")

@test("300,000 characters in one pass")
def _():
    s = "".join(chr(ord("a") + (i // 1000) % 26) for i in range(300_000))   # runs of 1,000
    result = longest_with_k_distinct(s, 2)
    check(result == s[:2000], "expected the first two runs of letters, s[:2000]")
```

```hint
Grow the window one character at a time with `for right, ch in enumerate(s)`, counting characters in a `Counter`.
```

```hint
While `len(counts) > k`, take `s[left]` out of the counts and advance `left`. Delete a key when its count reaches zero: a `Counter` keeps zero counts as keys, and `len()` would still see them.
```

```hint
Record `(start, length)` only when the window is *strictly* longer than the best so far, which keeps the leftmost answer on ties. Slice once, at the end.
```
:::

:::challenge id=algo-divisible-subarrays title="Subarrays divisible by k" difficulty=medium
Write `count_divisible_subarrays(nums, k)` that counts the non-empty contiguous subarrays whose sum is divisible by `k` (with `k >= 1`). `nums` can contain negative numbers and zeros.

```text
count_divisible_subarrays([4, 5, 0, -2, -3, 1], 5)  ->  7
    [5], [5, 0], [0], [5, 0, -2, -3], [0, -2, -3], [-2, -3], [4, 5, 0, -2, -3, 1]
```

A subarray's sum is a difference of two prefix sums, and it's divisible by `k` exactly when those two prefixes leave the same remainder. Count remainders with a `Counter` for an O(n) solution.

```js
function countDivisibleSubarrays(nums, k) {
  let count = 0;
  for (let i = 0; i < nums.length; i++) {      // every start and end: O(n²)
    let sum = 0;
    for (let j = i; j < nums.length; j++) {
      sum += nums[j];
      if (sum % k === 0) count++;
    }
  }
  return count;
}
```

```python starter
from collections import Counter


def count_divisible_subarrays(nums, k):
    ...
```

```python solution
from collections import Counter


def count_divisible_subarrays(nums, k):
    remainders = Counter({0: 1})       # the empty prefix
    total = count = 0
    for n in nums:
        total += n
        r = total % k                  # always 0..k-1 when k > 0, even if total < 0
        count += remainders[r]
        remainders[r] += 1
    return count
```

```python tests
@test("example")
def _():
    eq(count_divisible_subarrays([4, 5, 0, -2, -3, 1], 5), 7)

@test("with k = 1, every subarray counts")
def _():
    eq(count_divisible_subarrays([1, 2, 3], 1), 6)

@test("zeros are divisible by anything")
def _():
    eq(count_divisible_subarrays([0, 0, 0], 3), 6)

@test("negative running sums share remainders with positive ones")
def _():
    eq(count_divisible_subarrays([-2, 5], 5), 1)
    eq(count_divisible_subarrays([-1, 2, 9], 2), 2)

@test("no subarray qualifies")
def _():
    eq(count_divisible_subarrays([1, 1], 5), 0)

@test("one element, or none")
def _():
    eq(count_divisible_subarrays([5], 5), 1)
    eq(count_divisible_subarrays([3], 5), 0)
    eq(count_divisible_subarrays([], 5), 0)

@test("200,000 numbers in one pass")
def _():
    nums = [(i * 7919) % 201 - 100 for i in range(200_000)]
    eq(count_divisible_subarrays(nums, 7), 2_956_806_677)
```

```hint
Keep a running total. With `prefix[i]` as the sum of the first `i` numbers, `nums[i:j]` sums to `prefix[j] - prefix[i]`, and that's divisible by `k` exactly when `prefix[i] % k == prefix[j] % k`.
```

```hint
Count remainders in a `Counter` seeded with `{0: 1}` for the empty prefix. At each step, add the number of earlier prefixes with the same remainder, then record this one.
```

```hint
You don't need JavaScript's `((total % k) + k) % k`: with a positive `k`, Python's `%` is never negative, so `-3 % 5` is already `2`.
```
:::

:::challenge id=algo-max-circular-subarray title="Best run on a circular track" difficulty=hard
Write `max_circular_subarray(nums)` that returns the largest sum of a non-empty contiguous subarray of a **circular** list, where the end wraps around to the start. Each element can be used at most once, so `[5, -3, 5]` can take both 5s for a total of 10. Raise `ValueError` for an empty list.

```text
max_circular_subarray([1, -2, 3, -2])   ->  3     just [3]
max_circular_subarray([5, -3, 5])       ->  10    5 + 5, wrapping around
max_circular_subarray([-3, -2, -3])     ->  -2    the best non-empty subarray
```

Aim for O(n) time and O(1) extra space: one pass, no copies of the list.

```js
function maxCircularSubarray(nums) {
  const n = nums.length;
  let best = -Infinity;
  for (let start = 0; start < n; start++) {         // O(n²)
    let sum = 0;
    for (let len = 1; len <= n; len++) {
      sum += nums[(start + len - 1) % n];
      best = Math.max(best, sum);
    }
  }
  return best;
}
```

```python starter
def max_circular_subarray(nums):
    ...
```

```python solution
import math


def max_circular_subarray(nums):
    if not nums:
        raise ValueError("max_circular_subarray() of an empty list")
    total = 0
    cur_max = cur_min = 0
    best_max, best_min = -math.inf, math.inf
    for x in nums:
        total += x
        cur_max = max(x, cur_max + x)      # Kadane for the largest run...
        best_max = max(best_max, cur_max)
        cur_min = min(x, cur_min + x)      # ...and for the smallest
        best_min = min(best_min, cur_min)
    if best_max < 0:                       # all negative: wrapping can't help
        return best_max
    return max(best_max, total - best_min)
```

```python tests
@test("no wrap needed")
def _():
    eq(max_circular_subarray([1, -2, 3, -2]), 3)

@test("wraps around the end")
def _():
    eq(max_circular_subarray([5, -3, 5]), 10)
    eq(max_circular_subarray([8, -10, 1, 7]), 16)
    eq(max_circular_subarray([2, -5, 1, 3]), 6)

@test("all negative: the largest single number")
def _():
    eq(max_circular_subarray([-3, -2, -3]), -2)
    eq(max_circular_subarray([-5]), -5)

@test("the whole list can be the answer")
def _():
    eq(max_circular_subarray([2, 3, 4]), 9)

@test("zeros")
def _():
    eq(max_circular_subarray([0, -1, 0]), 0)
    eq(max_circular_subarray([-2, 0, -2]), 0)

@test("one element")
def _():
    eq(max_circular_subarray([7]), 7)

@test("an empty list raises ValueError")
def _():
    raises(ValueError, max_circular_subarray, [])

@test("200,000 numbers in one pass")
def _():
    nums = [(i * 7919) % 2001 - 1000 for i in range(200_000)]
    eq(max_circular_subarray(nums), 11_218)
```

```hint
Without the wrap-around, this is Kadane's algorithm. A wrapping subarray leaves out a chunk in the middle, so its sum is `total - (that chunk's sum)`, which is largest when you leave out the **minimum** subarray.
```

```hint
Run Kadane for the maximum and the minimum in the same loop. The answer is usually `max(best_max, total - best_min)`.
```

```hint
If every number is negative, the minimum subarray is the whole list and `total - best_min` is `0`, the sum of an *empty* subarray, which isn't allowed. Return `best_max` in that case.
```
:::
