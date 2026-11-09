---
title: Dynamic Programming
part: Techniques
summary: From @cache to bottom-up tables, with stairs, coins, grids, edit distance, knapsack and LIS with bisect.
minutes: 55
---

Dynamic programming is recursion with a memory: when the same subproblem keeps coming back, solve it once and look the answer up afterwards. Python makes the top-down version a one-line decorator, `@functools.cache`, but the recursion it rides on is shallow, so anything with a large input gets built **bottom-up**, as a table filled by a loop. Almost every interview DP is the same three moves: say what `dp[i]` (or `dp[i][j]`) means, write the recurrence, and pick a fill order in which every cell's dependencies are already done.

## Spotting overlapping subproblems

Two signs point to DP. The question asks for a count, a minimum or maximum, or a yes/no over a sequence of choices. And the obvious recursion keeps calling itself with arguments it has already seen. Counting the ways to climb `n` stairs, one or two at a time, shows both:

```python run
calls = 0

def ways(n):
    global calls
    calls += 1
    if n <= 1:
        return 1
    return ways(n - 1) + ways(n - 2)    # the last move was one step, or two

print(ways(25), f"{calls:,} calls")
```

`ways(25)` depends on only 26 distinct subproblems, `ways(0)` to `ways(25)`, yet the recursion makes 242,785 calls, because each value is recomputed every time it's needed. The call count grows like the Fibonacci numbers themselves, about 1.6ⁿ. Storing each answer the first time cuts that to O(n).

## Top-down: `@cache`

:::compare
```js
const memo = new Map();

function ways(n) {
  if (n <= 1) return 1;
  if (!memo.has(n)) memo.set(n, ways(n - 1) + ways(n - 2));
  return memo.get(n);
}
```
```python
from functools import cache

@cache
def ways(n):
    if n <= 1:
        return 1
    return ways(n - 1) + ways(n - 2)
```
:::

`@cache` stores every result keyed by the arguments ([functools.cache](lesson:decorators#functools-cache-and-lru-cache) has the details), so each subproblem is computed once: O(n) time and O(n) space here. The arguments become dict keys, so they must be hashable. Pass tuples or strings, not lists.

```python run
from functools import cache

@cache
def ways(n):
    if n <= 1:
        return 1
    return ways(n - 1) + ways(n - 2)

print(ways(200))            # instant, and exact: Python ints never overflow
print(ways.cache_info())
```

:::quiz output
What does this print?

```python
from functools import cache

@cache
def ways(n):
    return 1 if n <= 1 else ways(n - 1) + ways(n - 2)

ways(40)
print(ways.cache_info().misses)
```

- [ ] `40`
- [x] `41`
- [ ] `81`
- [ ] `331160281`

The body runs once per distinct argument, `0` through `40`, and every other call is a cache hit. Without `@cache`, `ways(40)` would make 331,160,281 calls.
:::

:::gotcha Top-down DP is as deep as its longest chain of calls
`ways(200)` recurses 200 levels before the first result is cached. CPython raises `RecursionError` past 1,000 frames, but in a browser, recursion through `@cache`'s C wrapper can crash the interpreter long before that (as early as 600 levels in Chrome), so keep top-down DP under about 300 levels in this sandbox. Raising the limit with `sys.setrecursionlimit()` just moves the cliff ([the toolkit lesson](lesson:algorithm-toolkit) explains why). When the input can be large, fill a table bottom-up instead.
:::

:::gotcha A module-level `@cache` outlives the call
A cached function at module level keeps its results for the life of the program, and its key is only its arguments. If it also reads something else, like a global list of coins, changing that later returns stale answers. Define the cached helper *inside* the function that uses it, so every call gets a fresh cache built from the right inputs.
:::

```python run
from functools import cache

coins = [1, 5]

@cache
def fewest(amount):                      # secretly depends on the global coins
    if amount == 0:
        return 0
    return 1 + min(fewest(amount - c) for c in coins if c <= amount)

print(fewest(10))       # 2: five plus five
coins = [1, 2]
print(fewest(10))       # still 2, from the cache: the right answer is now 5
```

## Bottom-up: fill a table

:::compare
```js
function ways(n) {
  const dp = new Array(n + 1).fill(1);
  for (let i = 2; i <= n; i++) {
    dp[i] = dp[i - 1] + dp[i - 2];
  }
  return dp[n];
}
```
```python
def ways(n):
    dp = [1] * (n + 1)
    for i in range(2, n + 1):
        dp[i] = dp[i - 1] + dp[i - 2]

    return dp[n]
```
:::

Bottom-up DP computes the subproblems in an order where each one's dependencies are already in the table, so there's no recursion at all: no depth limit, and no function call or cache lookup per subproblem, which adds up in CPython. The price is that you choose the fill order yourself, and you compute every cell, even ones the top-down version would never have reached.

```python run
def ways(n):
    dp = [1] * (n + 1)
    for i in range(2, n + 1):
        dp[i] = dp[i - 1] + dp[i - 2]
    return dp[n]

big = ways(10_000)                  # 10,000 levels deep top-down; here it's a loop
print(len(str(big)), "digits")
print(big % 1_000_000_007)          # interview problems often ask for the answer mod 10**9 + 7
```

| | Top-down `@cache` | Bottom-up table |
| --- | --- | --- |
| Writing it | the recurrence, almost word for word | you pick the fill order |
| Work | only the states it reaches | every cell |
| Depth | as deep as the longest chain of calls | none: it's loops |
| Speed | a call and a cache lookup per state | tight loops, usually faster |
| Space | the cache plus the call stack | the table, often shrinkable to a row or two |

:::gotcha `[[0] * cols] * rows` shares one row
A 2D table needs a comprehension, `[[0] * cols for _ in range(rows)]`. Multiplying the outer list repeats a reference to the same inner list, so writing one cell writes the whole column. It's the `new Array(n).fill([])` trap from JavaScript ([Lists](lesson:lists#creating-lists)).
:::

## 1D DP: robbers and coins

**House robber**: take money from houses along a street without ever robbing two neighbours. The best total up to house `i` is either the best up to `i - 1` (skip house `i`), or the best up to `i - 2` plus house `i`. Only the last two answers matter, so two variables replace the table: O(n) time, O(1) space.

:::compare
```js
function rob(houses) {
  let skip = 0, take = 0;
  for (const money of houses) {
    const tookLast = take;
    take = skip + money;
    skip = Math.max(skip, tookLast);
  }
  return Math.max(skip, take);
}
```
```python
def rob(houses):
    skip, take = 0, 0
    for money in houses:
        skip, take = max(skip, take), skip + money
    return max(skip, take)
```
:::

Tuple assignment evaluates the whole right-hand side before binding anything, so there's no temporary variable to juggle ([multiple assignment](lesson:variables-and-scope#multiple-assignment-swapping-and-del)).

```python run
def rob(houses):
    skip, take = 0, 0           # best total if we skip / rob the current house
    for money in houses:
        skip, take = max(skip, take), skip + money
    return max(skip, take)

print(rob([2, 7, 9, 3, 1]))     # 2 + 9 + 1
print(rob([]), rob([5]), rob([5, 1, 1, 5]))
```

**Coin change**, fewest coins: `fewest[a]` is the fewest coins that make amount `a`, built from `fewest[a - coin] + 1` for every coin that fits. Unreachable amounts stay at `math.inf`, and `inf + 1` is still `inf`, so they never win a `min`. That's O(amount × coins) time and O(amount) space. Greedy, always taking the biggest coin that fits, is wrong for coin sets like `[1, 3, 4]`.

```python run
from math import inf

def fewest_coins(coins, amount):
    fewest = [0] + [inf] * amount              # fewest[a]: coins needed to make a
    for a in range(1, amount + 1):
        for coin in coins:
            if coin <= a:
                fewest[a] = min(fewest[a], fewest[a - coin] + 1)
    return fewest[amount] if fewest[amount] != inf else None

print(fewest_coins([1, 3, 4], 6))      # 3 + 3; greedy would use 4 + 1 + 1
print(fewest_coins([2], 3))
```

**Coin change**, number of ways: the same table shape, adding instead of minimising. The loop order decides what you count. With the coins in the outer loop, each combination is counted once, because coins are only ever added in a fixed order.

```python run
def count_ways(coins, amount):
    ways = [1] + [0] * amount           # one way to make 0: use no coins
    for coin in coins:                  # coins outside: each combination once
        for a in range(coin, amount + 1):
            ways[a] += ways[a - coin]
    return ways[amount]

print(count_ways([1, 2, 5], 5))         # 5, 2+2+1, 2+1+1+1, 1+1+1+1+1
print(count_ways([1, 2, 5, 10, 20, 50, 100, 200], 200))
```

:::quiz output
The loops are swapped. What does this print?

```python
coins, amount = [1, 2], 4
ways = [1] + [0] * amount
for total in range(1, amount + 1):
    for coin in coins:
        if coin <= total:
            ways[total] += ways[total - coin]
print(ways[amount])
```

- [ ] `3`
- [x] `5`
- [ ] `4`
- [ ] `8`

With the amount in the outer loop, every total tries every coin as its *last* coin, so `1+1+2`, `1+2+1` and `2+1+1` all count separately: 1+1+1+1, 1+1+2, 1+2+1, 2+1+1 and 2+2. That counts ordered sequences. Put the coins in the outer loop to count combinations, which gives 3.
:::

## 2D DP: grids and strings

When a state needs two coordinates, the table gets two dimensions. **Grid paths** counts the ways to walk from the top-left to the bottom-right of a grid, moving only right or down and avoiding walls. Each cell is reached from the cell above or the cell to its left, so `paths[r][c] = paths[r - 1][c] + paths[r][c - 1]`, filled row by row. That's O(R × C) time and space.

```python run
def grid_paths(grid):
    rows, cols = len(grid), len(grid[0])
    paths = [[0] * (cols + 1) for _ in range(rows + 1)]   # a border of zeros
    paths[0][1] = 1                                        # seeds the start cell
    for r in range(1, rows + 1):
        for c in range(1, cols + 1):
            if grid[r - 1][c - 1] != "#":
                paths[r][c] = paths[r - 1][c] + paths[r][c - 1]
    return paths[rows][cols]

print(grid_paths(["....",
                  ".#..",
                  "...#",
                  "...."]))
print(grid_paths(["." * 100] * 100))       # exact; a JS number would round this
```

The extra row and column of zeros remove every bounds check: row 0 and column 0 of the table stand for "off the grid". String DPs use the same trick, with row 0 meaning "the empty prefix".

:::note Big counts stay exact
The 100 × 100 count is about 2.3 × 10⁵⁸. A JavaScript number keeps 53 bits of integer precision, so you'd need `BigInt` or a modulus. Python's `int` is arbitrary precision ([Numbers](lesson:numbers-and-math#int-float-and-complex)), which is why interview problems that ask for "the answer modulo 10⁹ + 7" only need the `%` at the end in Python, although reducing as you go keeps the numbers small and fast.
:::

**Longest common subsequence** (LCS) compares two strings. `length[i][j]` is the LCS of the first `i` characters of `a` and the first `j` of `b`. If those last characters match, extend the diagonal; otherwise, drop a character from one side or the other and keep the better result. O(m × n) time and space. Edit distance, the third challenge, has exactly this shape with a different recurrence.

```python run
def lcs_length(a, b):
    m, n = len(a), len(b)
    length = [[0] * (n + 1) for _ in range(m + 1)]
    for i in range(1, m + 1):
        for j in range(1, n + 1):
            if a[i - 1] == b[j - 1]:
                length[i][j] = length[i - 1][j - 1] + 1
            else:
                length[i][j] = max(length[i - 1][j], length[i][j - 1])
    return length[m][n]

print(lcs_length("dynamic", "pythonic"))     # "ynic"
print(lcs_length("AGGTAB", "GXTXAYB"))       # "GTAB"
```

## 0/1 knapsack

Each item has a weight and a value, the bag has a capacity, and every item goes in at most once. `best[c]` is the highest value that fits in capacity `c` using the items seen so far. For each item, every capacity either ignores it or takes it: `max(best[c], best[c - weight] + value)`. That's O(items × capacity) time, which is fast when the capacity is a modest integer, and O(capacity) space with one rolling row.

```python run
def best_value(items, capacity):
    best = [0] * (capacity + 1)                        # best[c]: top value within weight c
    for weight, value in items:
        for c in range(capacity, weight - 1, -1):      # right to left: each item once
            best[c] = max(best[c], best[c - weight] + value)
    return best[capacity]

gear = [(5, 60), (3, 50), (4, 70), (2, 30)]            # (weight, value)
print(best_value(gear, 8))                             # 4 + 3 -> 70 + 50
```

The loop direction is the whole trick. Going from high capacity to low, `best[c - weight]` still holds the value from *before* this item was considered, so the item can only be added once.

:::quiz output
What does this print? The capacity loop runs left to right.

```python
best = [0] * 7
weight, value = 2, 10
for c in range(weight, 7):
    best[c] = max(best[c], best[c - weight] + value)
print(best[6])
```

- [ ] `10`
- [x] `30`
- [ ] `20`
- [ ] `60`

Left to right, `best[4]` reads `best[2]`, which already includes this item, then `best[6]` reads `best[4]`. The single item gets packed three times. That's the *unbounded* knapsack, where items repeat. For 0/1, loop from high capacities to low.
:::

## Rolling arrays: keep only what you read

If row `i` of a table only ever reads row `i - 1`, you don't need the rows before that. Keep two rows, or even one updated in the right order, and the space drops from O(m × n) to O(n). Swap the strings so the row is the shorter one, and LCS needs O(min(m, n)) space:

```python run
def lcs_length(a, b):
    if len(a) < len(b):
        a, b = b, a                       # the row spans the shorter string
    prev = [0] * (len(b) + 1)
    for ch in a:
        curr = [0]
        for j, other in enumerate(b, 1):
            curr.append(prev[j - 1] + 1 if ch == other else max(prev[j], curr[j - 1]))
        prev = curr
    return prev[-1]

print(lcs_length("dynamic", "pythonic"))
print(lcs_length("ab" * 250, "ba" * 250))     # 250,000 cells, two rows of memory
```

Grid paths roll down to a single row: before you update it, `paths[c]` still holds the count from the row above, and `paths[c - 1]` already holds the current row's count to the left.

```python run
def grid_paths(grid):
    paths = [1] + [0] * (len(grid[0]) - 1)
    for row in grid:
        for c, cell in enumerate(row):
            if cell == "#":
                paths[c] = 0
            elif c:
                paths[c] += paths[c - 1]      # from above (old value) + from the left (new value)
    return paths[-1]

print(grid_paths(["....", ".#..", "...#", "...."]))
```

## LIS in O(n log n) with `bisect`

The longest strictly increasing subsequence has a textbook O(n²) DP: `lis[i] = 1 + max(lis[j] for j < i if nums[j] < nums[i])`. The faster method keeps `tails`, where `tails[k]` is the smallest value that ends an increasing run of length `k + 1` seen so far. `tails` is always sorted, so each new number finds its place with a binary search: append it if it's bigger than every tail, otherwise replace the first tail that's `>=` it. That's O(n log n) time and O(n) space, and `bisect` does the search in C.

```python run
from bisect import bisect_left

def lis_length(nums):
    tails = []
    for x in nums:
        k = bisect_left(tails, x)
        if k == len(tails):
            tails.append(x)          # x extends the longest run so far
        else:
            tails[k] = x             # x is a smaller tail for runs of length k + 1
    return len(tails)

print(lis_length([10, 9, 2, 5, 3, 7, 101, 18]))
print(lis_length([7, 7, 7]))         # strictly increasing: 1
```

`bisect_left` makes equal values replace each other, which gives *strictly* increasing runs. For non-decreasing runs, use `bisect_right` so an equal value goes after its twin.

:::quiz output
What does this print?

```python
from bisect import bisect_left

tails = []
for x in [3, 10, 2, 11, 1]:
    k = bisect_left(tails, x)
    if k == len(tails):
        tails.append(x)
    else:
        tails[k] = x
print(tails)
```

- [ ] `[3, 10, 11]`
- [x] `[1, 10, 11]`
- [ ] `[2, 10, 11]`
- [ ] `[1, 2, 3]`

`2` replaces `3`, and later `1` replaces `2`. The *length* is right, 3 for `3, 10, 11`, but `tails` itself isn't a subsequence of the input: `1` comes after `10` and `11`. To rebuild an actual subsequence, record where each number's run came from.
:::

## Reconstructing the answer

A DP table gives you the optimal *value*. To recover the choices behind it, either keep the full table and walk back from the final cell, asking at each step which option produced this value, or record each choice as you fill the table: the coin used, whether an item was taken, the index a run came from. A rolled-up table can't do the first, because the earlier rows are gone, so decide which you need before you shrink the memory.

```python run
def lcs(a, b):
    m, n = len(a), len(b)
    length = [[0] * (n + 1) for _ in range(m + 1)]
    for i in range(1, m + 1):
        for j in range(1, n + 1):
            if a[i - 1] == b[j - 1]:
                length[i][j] = length[i - 1][j - 1] + 1
            else:
                length[i][j] = max(length[i - 1][j], length[i][j - 1])
    out, i, j = [], m, n                 # walk back from the bottom-right corner
    while i and j:
        if a[i - 1] == b[j - 1]:
            out.append(a[i - 1])
            i, j = i - 1, j - 1
        elif length[i - 1][j] >= length[i][j - 1]:
            i -= 1
        else:
            j -= 1
    return "".join(reversed(out))

print(lcs("dynamic", "pythonic"))
print(lcs("AGGTAB", "GXTXAYB"))
```

The walk-back appends in reverse, so the result is reversed once at the end: O(m + n) for the walk, on top of the O(m × n) fill.

## Cheat sheet

| JavaScript | Python | Notes |
| --- | --- | --- |
| a `memo` `Map` by hand | `@functools.cache` | hashable arguments; depth = longest call chain |
| `memo.clear()` | `f.cache_clear()` | `f.cache_info()` shows hits and misses |
| `new Array(n + 1).fill(0)` | `[0] * (n + 1)` | |
| `Array.from({ length: m }, () => Array(n).fill(0))` | `[[0] * n for _ in range(m)]` | never `[[0] * n] * m` |
| `Infinity` | `math.inf` | `inf + 1 == inf`, so it never wins a `min` |
| a temp variable to roll two values | `a, b = b, a + x` | the right side is evaluated first |
| `BigInt` for huge counts | a plain `int` | arbitrary precision |
| a hand-written binary search | `bisect_left(tails, x)` | LIS in O(n log n) |

## Challenges

:::challenge id=algo-dp-cheapest-climb title="Cheapest climb" difficulty=easy
Write `cheapest_climb(costs)`. `costs[i]` is the price of standing on step `i` of a staircase. You start on step 0 or step 1, and from any step you climb one or two steps, paying for every step you stand on, including the first. The top is just past the last step. Return the cheapest total that reaches the top.

```text
cheapest_climb([10, 15, 20])                          ->  15   (stand on 15, then climb two)
cheapest_climb([1, 100, 1, 1, 1, 100, 1, 1, 100, 1])  ->  6
```

With no steps, or just one, you can start at the top, so the answer is 0. One test has 100,000 steps: build the answer bottom-up rather than recursing.

```js
function cheapestClimb(costs) {
  const best = new Array(costs.length + 1).fill(0);   // best[i]: cheapest way to reach step i
  for (let i = 2; i <= costs.length; i++) {
    best[i] = Math.min(best[i - 1] + costs[i - 1], best[i - 2] + costs[i - 2]);
  }
  return best[costs.length];
}
```

```python starter
def cheapest_climb(costs):
    ...
```

```python solution
def cheapest_climb(costs):
    before, current = 0, 0       # cheapest arrival at steps 0 and 1, then rolling forward
    for i in range(2, len(costs) + 1):
        before, current = current, min(current + costs[i - 1], before + costs[i - 2])
    return current
```

```python tests
import sys


def shallow(fn, *args):
    """Call fn with a low recursion limit, so a deep top-down solution fails cleanly."""
    forbids_call("setrecursionlimit", "raising the recursion limit only moves the cliff: build the answer bottom-up")
    limit = sys.getrecursionlimit()
    sys.setrecursionlimit(250)
    try:
        return fn(*args)
    except RecursionError:
        raise CheckFailed("recursion went too deep for this input: build the answer bottom-up") from None
    finally:
        sys.setrecursionlimit(limit)


@test("the examples")
def _():
    eq(cheapest_climb([10, 15, 20]), 15)
    eq(cheapest_climb([1, 100, 1, 1, 1, 100, 1, 1, 100, 1]), 6)

@test("no steps, or just one")
def _():
    eq(cheapest_climb([]), 0)
    eq(cheapest_climb([7]), 0)

@test("two steps: start on the cheaper one")
def _():
    eq(cheapest_climb([5, 3]), 3)
    eq(cheapest_climb([3, 5]), 3)

@test("skipping an expensive step")
def _():
    eq(cheapest_climb([1, 1, 100, 1]), 2)

@test("free steps")
def _():
    eq(cheapest_climb([0, 0, 0, 0]), 0)

@test("doesn't modify the input")
def _():
    costs = [10, 15, 20]
    cheapest_climb(costs)
    eq(costs, [10, 15, 20])

@test("100,000 steps, bottom-up")
def _():
    costs = [(i * 37) % 101 for i in range(100_000)]
    eq(shallow(cheapest_climb, costs), 1_996_041)
```

```hint
Let `best[i]` be the cheapest way to *arrive* at step `i` (not yet paying for it). `best[0]` and `best[1]` are 0, and you arrive at `i` from `i - 1` or `i - 2`, paying for the step you leave: `best[i] = min(best[i - 1] + costs[i - 1], best[i - 2] + costs[i - 2])`. The answer is `best[len(costs)]`.
```

```hint
Each step only reads the two before it, so two variables replace the list: `before, current = current, min(...)`.
```
:::

:::challenge id=algo-dp-make-change title="Make change" difficulty=medium
Write `make_change(coins, amount)` that returns the fewest coins adding up to `amount`, as a list sorted from largest to smallest, or `None` if the amount can't be made. `coins` holds distinct positive denominations in any order, with an unlimited supply of each. `make_change(coins, 0)` is `[]`. If several answers use the fewest coins, any of them is fine.

```text
make_change([1, 3, 4], 6)  ->  [3, 3]      (greedy would give [4, 1, 1])
make_change([2], 3)        ->  None
```

One test makes 50,000 from five coins. A top-down solution would recurse thousands of calls deep, so fill a table bottom-up, and record enough as you go to rebuild the coins.

```python starter
def make_change(coins, amount):
    ...
```

```python solution
from math import inf


def make_change(coins, amount):
    fewest = [0] + [inf] * amount        # fewest[a]: coins needed to make a
    last_coin = [0] * (amount + 1)       # the coin that achieved it
    for total in range(1, amount + 1):
        for coin in coins:
            if coin <= total and fewest[total - coin] + 1 < fewest[total]:
                fewest[total] = fewest[total - coin] + 1
                last_coin[total] = coin
    if fewest[amount] == inf:
        return None
    change = []
    while amount:
        change.append(last_coin[amount])
        amount -= last_coin[amount]
    return sorted(change, reverse=True)
```

```python tests
import sys


def shallow(fn, *args):
    """Call fn with a low recursion limit, so a deep top-down solution fails cleanly."""
    forbids_call("setrecursionlimit", "raising the recursion limit only moves the cliff: build the table bottom-up")
    limit = sys.getrecursionlimit()
    sys.setrecursionlimit(250)
    try:
        return fn(*args)
    except RecursionError:
        raise CheckFailed("recursion went too deep for this input: build the table bottom-up") from None
    finally:
        sys.setrecursionlimit(limit)


def check_change(change, coins, amount, count):
    check(change is not None, f"{amount} can be made from {coins}")
    eq(sum(change), amount, f"the coins {change} don't add up to {amount}")
    check(all(coin in coins for coin in change), f"{change} uses a coin that isn't in {coins}")
    eq(len(change), count, f"{amount} needs exactly {count} coins")
    eq(change, sorted(change, reverse=True), "list the coins from largest to smallest")


@test("beats the greedy choice")
def _():
    eq(make_change([1, 3, 4], 6), [3, 3])
    eq(make_change([1, 5, 6, 9], 11), [6, 5])

@test("everyday coins")
def _():
    eq(make_change([1, 5, 10, 25], 63), [25, 25, 10, 1, 1, 1])

@test("coins can arrive in any order")
def _():
    eq(make_change([4, 1, 3], 6), [3, 3])

@test("a single coin")
def _():
    eq(make_change([7], 21), [7, 7, 7])

@test("zero needs no coins")
def _():
    eq(make_change([1, 2], 0), [])
    eq(make_change([], 0), [])

@test("impossible amounts return None")
def _():
    eq(make_change([2], 3), None)
    eq(make_change([5, 10], 3), None)
    eq(make_change([], 7), None)

@test("any of several fewest-coin answers is fine")
def _():
    check_change(make_change([1, 2, 3], 4), [1, 2, 3], 4, 2)

@test("doesn't modify the coins")
def _():
    coins = [4, 1, 3]
    make_change(coins, 6)
    eq(coins, [4, 1, 3])

@test("50,000 from five coins")
def _():
    coins = [7, 23, 59, 97, 113]
    check_change(shallow(make_change, coins, 50_000), coins, 50_000, 444)
```

```hint
`fewest[a]` is the fewest coins that make `a`: start with `[0] + [inf] * amount`, and for every amount try every coin, `fewest[a] = min(fewest[a], fewest[a - coin] + 1)`.
```

```hint
Whenever a coin improves `fewest[a]`, remember it in `last_coin[a]`. Afterwards, rebuild the answer by repeatedly taking `last_coin[amount]` and subtracting it, then sort the coins in reverse.
```
:::

:::challenge id=algo-dp-edit-distance title="Edit distance" difficulty=medium
Write `edit_distance(a, b)`: the smallest number of single-character insertions, deletions and substitutions that turn string `a` into string `b`.

```text
edit_distance("kitten", "sitting")  ->  3   (k→s, e→i, then insert g)
edit_distance("horse", "ros")       ->  3
```

One test compares two strings of about 700 characters each. A top-down solution would recurse over a thousand calls deep, so fill the table bottom-up, ideally keeping only two rows.

```python starter
def edit_distance(a, b):
    ...
```

```python solution
def edit_distance(a, b):
    if len(a) < len(b):
        a, b = b, a                      # the distance is symmetric; keep the row short
    prev = list(range(len(b) + 1))       # from the empty prefix of a: j insertions
    for i, ca in enumerate(a, 1):
        curr = [i]                       # to the empty prefix of b: i deletions
        for j, cb in enumerate(b, 1):
            curr.append(min(
                prev[j] + 1,                 # delete ca
                curr[j - 1] + 1,             # insert cb
                prev[j - 1] + (ca != cb),    # substitute, free if they match
            ))
        prev = curr
    return prev[-1]
```

```python tests
import sys


def shallow(fn, *args):
    """Call fn with a low recursion limit, so a deep top-down solution fails cleanly."""
    forbids_call("setrecursionlimit", "raising the recursion limit only moves the cliff: build the table bottom-up")
    limit = sys.getrecursionlimit()
    sys.setrecursionlimit(250)
    try:
        return fn(*args)
    except RecursionError:
        raise CheckFailed("recursion went too deep for this input: build the table bottom-up") from None
    finally:
        sys.setrecursionlimit(limit)


def dna(seed, n):
    """A deterministic pseudo-random string of n letters from ACGT."""
    letters, x = [], seed
    for _ in range(n):
        x = (x * 1103515245 + 12345) % 2**31
        letters.append("acgt"[x >> 16 & 3])
    return "".join(letters)


@test("the classic examples")
def _():
    eq(edit_distance("kitten", "sitting"), 3)
    eq(edit_distance("horse", "ros"), 3)
    eq(edit_distance("intention", "execution"), 5)

@test("empty strings")
def _():
    eq(edit_distance("", ""), 0)
    eq(edit_distance("", "abc"), 3)
    eq(edit_distance("abc", ""), 3)

@test("identical strings")
def _():
    eq(edit_distance("same", "same"), 0)

@test("it's symmetric")
def _():
    eq(edit_distance("sunday", "saturday"), 3)
    eq(edit_distance("saturday", "sunday"), 3)

@test("case matters")
def _():
    eq(edit_distance("Python", "python"), 1)

@test("each code point is one character, emoji included")
def _():
    eq(edit_distance("café", "cafe"), 1)
    eq(edit_distance("👍👍", "👍"), 1)

@test("two strings of about 700 characters")
def _():
    eq(shallow(edit_distance, dna(1, 700), dna(2, 650)), 365)
```

```hint
Let `d[i][j]` be the distance between the first `i` characters of `a` and the first `j` of `b`. Row 0 is `0, 1, 2, ...` (insert everything) and column 0 is `0, 1, 2, ...` (delete everything).
```

```hint
For the last characters `ca` and `cb`: delete `ca` (`d[i - 1][j] + 1`), insert `cb` (`d[i][j - 1] + 1`), or substitute (`d[i - 1][j - 1]`, plus 1 unless they're equal). Take the minimum. Each row only reads the row above, so two lists are enough.
```
:::

:::challenge id=algo-dp-knapsack title="Pack the bag" difficulty=hard
Write `pack(items, capacity)`. Each item is a `(name, weight, value)` tuple with a positive integer weight and a non-negative integer value, and each item can be packed at most once. Return `(best_value, names)`: the highest total value whose total weight fits within `capacity`, and the sorted names of the items that achieve it. If several packings tie, any of them is fine.

```text
gear = [("tent", 5, 60), ("stove", 3, 50), ("camera", 4, 70), ("book", 2, 30)]
pack(gear, 8)  ->  (120, ["camera", "stove"])
```

One test has 100 items and a capacity of 2,000, which rules out trying every subset (there are 2¹⁰⁰). Keep enough of the table, or of your choices, to rebuild which items went in.

```python starter
def pack(items, capacity):
    ...
```

```python solution
def pack(items, capacity):
    best = [0] * (capacity + 1)              # best[c]: top value within weight c
    took = []                                # took[i][c]: item i improved best[c]
    for name, weight, value in items:
        row = bytearray(capacity + 1)
        for c in range(capacity, weight - 1, -1):
            if best[c - weight] + value > best[c]:
                best[c] = best[c - weight] + value
                row[c] = 1
        took.append(row)

    names, c = [], capacity                  # walk back from the last item
    for (name, weight, _), row in zip(reversed(items), reversed(took)):
        if row[c]:
            names.append(name)
            c -= weight
    return best[capacity], sorted(names)
```

```python tests
import copy
import sys


def shallow(fn, *args):
    """Call fn with a low recursion limit, so a deep top-down solution fails cleanly."""
    forbids_call("setrecursionlimit", "raising the recursion limit only moves the cliff: build the table bottom-up")
    limit = sys.getrecursionlimit()
    sys.setrecursionlimit(250)
    try:
        return fn(*args)
    except RecursionError:
        raise CheckFailed("recursion went too deep for this input: build the table bottom-up") from None
    finally:
        sys.setrecursionlimit(limit)


def check_packing(items, capacity, result, expected_value):
    best_value, names = result
    by_name = {name: (weight, value) for name, weight, value in items}
    eq(best_value, expected_value)
    eq(names, sorted(names), "the names should be sorted")
    eq(len(set(names)), len(names), "an item was packed twice")
    check(all(name in by_name for name in names), "packed an item that doesn't exist")
    check(sum(by_name[n][0] for n in names) <= capacity, "the packing is over capacity")
    eq(sum(by_name[n][1] for n in names), best_value, "the packed items' values don't add up to best_value")


GEAR = [("tent", 5, 60), ("stove", 3, 50), ("camera", 4, 70), ("book", 2, 30)]

@test("the example")
def _():
    eq(pack(GEAR, 8), (120, ["camera", "stove"]))

@test("the best value per kilo isn't the best bag")
def _():
    eq(pack([("a", 10, 60), ("b", 20, 100), ("c", 30, 120)], 50), (220, ["b", "c"]))

@test("each item goes in at most once")
def _():
    eq(pack([("gold", 2, 100)], 10), (100, ["gold"]))

@test("nothing fits, no items, or no capacity")
def _():
    eq(pack([("anvil", 50, 10)], 49), (0, []))
    eq(pack([], 10), (0, []))
    eq(pack(GEAR, 0), (0, []))

@test("an exact fit takes everything")
def _():
    eq(pack(GEAR, 14), (210, ["book", "camera", "stove", "tent"]))

@test("any of several best packings is fine")
def _():
    items = [("a", 1, 10), ("b", 1, 10), ("c", 2, 5)]
    check_packing(items, 1, pack(items, 1), 10)

@test("doesn't modify the items")
def _():
    items = copy.deepcopy(GEAR)
    pack(items, 8)
    eq(items, GEAR)

@test("100 items and a capacity of 2,000")
def _():
    items = [(f"item{i:03}", 1 + (i * 37) % 97, 1 + (i * 53) % 113) for i in range(100)]
    check_packing(items, 2_000, shallow(pack, items, 2_000), 4_176)
```

```hint
`best[c]` is the best value within capacity `c` using the items so far. For each item, go through the capacities from high to low: `best[c] = max(best[c], best[c - weight] + value)`. High to low is what stops an item from being packed twice.
```

```hint
The rolling list forgets how it got its values, so keep a row of booleans per item (a `bytearray(capacity + 1)` is compact): mark `c` when taking the item improved `best[c]`. Then walk the items backwards from `c = capacity`: if the item's mark at `c` is set, it's in the bag, so subtract its weight.
```
:::

:::challenge id=algo-dp-lis title="Longest increasing subsequence" difficulty=hard
Write `longest_increasing(nums)` that returns a longest strictly increasing subsequence of `nums`: a list of values in their original order, each larger than the one before. If several are equally long, any of them is fine. An empty input gives `[]`.

```text
longest_increasing([10, 9, 2, 5, 3, 7, 101, 18])  ->  [2, 3, 7, 18]   (or [2, 5, 7, 101], ...)
```

One test has 100,000 numbers, so the O(n²) DP won't finish in time. Use the O(n log n) `tails` method with `bisect`, plus enough bookkeeping to rebuild the subsequence itself.

```python starter
def longest_increasing(nums):
    ...
```

```python solution
from bisect import bisect_left


def longest_increasing(nums):
    tails = []                  # tails[k]: smallest value ending a run of length k + 1
    tail_at = []                # tail_at[k]: the index in nums of that value
    parent = [-1] * len(nums)   # parent[i]: index of the previous element in i's run
    for i, x in enumerate(nums):
        k = bisect_left(tails, x)
        if k == len(tails):
            tails.append(x)
            tail_at.append(i)
        else:
            tails[k] = x
            tail_at[k] = i
        parent[i] = tail_at[k - 1] if k else -1

    run = []
    i = tail_at[-1] if tail_at else -1
    while i != -1:
        run.append(nums[i])
        i = parent[i]
    return run[::-1]
```

```python tests
import sys


def shallow(fn, *args):
    """Call fn with a low recursion limit, so a deep top-down solution fails cleanly."""
    forbids_call("setrecursionlimit", "raising the recursion limit only moves the cliff: use the bisect method")
    limit = sys.getrecursionlimit()
    sys.setrecursionlimit(250)
    try:
        return fn(*args)
    except RecursionError:
        raise CheckFailed("recursion went too deep for this input: use the bisect method") from None
    finally:
        sys.setrecursionlimit(limit)


def is_increasing_subsequence(run, nums):
    remaining = iter(nums)
    return all(a < b for a, b in zip(run, run[1:])) and all(x in remaining for x in run)


def check_lis(nums, length):
    run = longest_increasing(nums)
    check(is_increasing_subsequence(run, nums), f"{run} isn't a strictly increasing subsequence of the input")
    eq(len(run), length, "not the longest")


@test("the example")
def _():
    check_lis([10, 9, 2, 5, 3, 7, 101, 18], 4)

@test("strictly increasing: equal values don't extend a run")
def _():
    eq(longest_increasing([7, 7, 7]), [7])
    eq(longest_increasing([1, 2, 2, 3]), [1, 2, 3])

@test("empty and single-element inputs")
def _():
    eq(longest_increasing([]), [])
    eq(longest_increasing([5]), [5])

@test("already sorted, and reversed")
def _():
    eq(longest_increasing([1, 2, 3, 4]), [1, 2, 3, 4])
    check_lis([4, 3, 2, 1], 1)

@test("negative numbers")
def _():
    check_lis([-3, -1, -2, 0], 3)

@test("a later, smaller start can win")
def _():
    eq(longest_increasing([5, 6, 1, 2, 3]), [1, 2, 3])

@test("doesn't modify the input")
def _():
    nums = [3, 1, 2]
    longest_increasing(nums)
    eq(nums, [3, 1, 2])

@test("100,000 numbers")
def _():
    nums, x = [], 7
    for _ in range(100_000):
        x = (x * 1103515245 + 12345) % 2**31
        nums.append(x % 1_000_000 - 500_000)
    run = shallow(longest_increasing, nums)
    check(is_increasing_subsequence(run, nums), "not a strictly increasing subsequence of the input")
    eq(len(run), 623, "not the longest")
```

```hint
Run the `tails` method from the lesson, but store *indices* alongside the values: `tail_at[k]` is the index of the number currently ending the best run of length `k + 1`.
```

```hint
When `nums[i]` lands at position `k`, the number before it in its run is the one ending the run of length `k`: set `parent[i] = tail_at[k - 1]` (or `-1` when `k == 0`). At the end, start from `tail_at[-1]`, follow `parent` back to `-1`, and reverse.
```
:::
