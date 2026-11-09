---
title: Recursion & Backtracking
part: Techniques
summary: The choose-explore-unchoose template for subsets, permutations, combination sums, N-Queens and word search.
minutes: 50
---

Backtracking is depth-first search over a tree of choices: pick an option, recurse into what's left, undo the pick, try the next one. The code looks almost the same in JavaScript and Python, and recursion is the right tool for once, because the depth is the number of decisions (a few dozen at most), not the size of the data. What changes in Python is the kit around it: `itertools` already enumerates subsets, permutations and combinations in C, generators stream solutions so you can stop at the first one, and the classic aliasing bug, appending the shared `path` list to the results, bites exactly as it does in JS.

## Recursion in Python: shallow by design

CPython caps the call depth at 1,000 frames by default (`sys.getrecursionlimit()`), and it has no tail-call optimisation ([Recursion](lesson:functions#recursion-a-low-limit-and-no-tail-calls) covers why). The browser is stricter still: deep recursion can overflow the WebAssembly stack and crash the interpreter before the limit is reached, so in this sandbox keep plain recursion under about 500 frames, and recursion that passes through C code, such as a `@functools.cache` wrapper, under about 300.

That rules out recursing once per element of a big list, but backtracking is a different shape. Its depth is the length of one candidate answer: n for the subsets or permutations of n items, the number of rows for N-Queens, the length of the word in a word search. The cost is in the *breadth*, the exponential number of branches, which no stack limit cares about.

```python run
import sys

calls = 0
deepest = 0

def explore(i, n, depth=1):
    global calls, deepest
    calls += 1
    deepest = max(deepest, depth)
    if i == n:
        return
    explore(i + 1, n, depth + 1)       # leave item i out
    explore(i + 1, n, depth + 1)       # put item i in

explore(0, 15)
print(f"{calls=} {deepest=} limit={sys.getrecursionlimit()}")
```

:::tip Don't fix a deep recursion with `setrecursionlimit`
Raising the limit only moves the cliff. Deep recursion, especially through C code, can still exhaust the real stack, and here that crashes the interpreter instead of raising `RecursionError`. When the depth grows with the input, rewrite the recursion as a loop with an explicit stack (see [iterative DFS](lesson:graphs)).
:::

## The template: choose, explore, unchoose

:::compare
```js
function subsets(items) {
  const result = [];
  const path = [];
  function explore(start) {
    result.push([...path]);             // copy!
    for (let i = start; i < items.length; i++) {
      path.push(items[i]);              // choose
      explore(i + 1);                   // explore
      path.pop();                       // unchoose
    }
  }
  explore(0);
  return result;
}
```
```python
def subsets(items):
    result = []
    path = []
    def explore(start):
        result.append(path[:])              # copy!
        for i in range(start, len(items)):
            path.append(items[i])           # choose
            explore(i + 1)                  # explore
            path.pop()                      # unchoose
    explore(0)
    return result
```
:::

One shared `path` list is mutated in place: append a choice, recurse, pop it off again. That's O(1) per step instead of a new list per call. The nested `explore` closes over `path` and `result` and only mutates them, so it needs no `nonlocal` (that's only for *rebinding* a name, see [closures](lesson:functions#closures-and-nonlocal)). There are 2ⁿ subsets and each copy costs O(n), so this is O(n · 2ⁿ) time, with O(n) extra space for the path and the call stack.

:::gotcha `result.append(path)` stores the same list every time
`path` is one list object that the search keeps changing. Append it without copying and every entry in `result` is that same object, which ends up empty once the search has popped everything. JavaScript has the identical bug with `result.push(path)`. Copy with `path[:]`, `path.copy()` or `list(path)`, or store `tuple(path)` when the results should be immutable.
:::

```python run
def subsets_buggy(items):
    result, path = [], []
    def explore(start):
        result.append(path)                  # the same list, every time
        for i in range(start, len(items)):
            path.append(items[i])
            explore(i + 1)
            path.pop()
    explore(0)
    return result

print(subsets_buggy(["a", "b"]))
```

## Subsets with `itertools`

When you just need every subset, you don't need to write the search at all. `itertools.combinations(items, r)` yields the subsets of size `r`, so chaining it over every `r` gives the power set (this is the `powerset` recipe from the [itertools docs](https://docs.python.org/3/library/itertools.html#itertools-recipes)). A bitmask is the other classic: count from `0` to `2ⁿ - 1` and read bit `i` as "take item `i`".

```python run
from itertools import chain, combinations

def powerset(items):
    return chain.from_iterable(combinations(items, r) for r in range(len(items) + 1))

print(list(powerset("abc")))

items = ["ana", "bo", "cy"]
print([[x for i, x in enumerate(items) if mask >> i & 1] for mask in range(1 << len(items))])
```

:::pythonic Generate with `itertools`, search with backtracking
`combinations`, `permutations` and `product` run in C, yield tuples lazily, and beat any hand-written recursion at producing *everything*. What they can't do is skip a branch. Write the backtracking yourself when most of the tree is dead weight: a partial sum that already overshoots, a queen that's already attacked, a prefix that can't become a word.
:::

:::quiz output
What does this print?

```python
from itertools import combinations

print(len(list(combinations("aab", 2))))
```

- [ ] `1`
- [ ] `2`
- [x] `3`
- [ ] `6`

`combinations` works on positions, not values: it pairs position 0 with 1, 0 with 2, and 1 with 2, giving `('a', 'a')`, `('a', 'b')` and `('a', 'b')` again. Duplicate values in, duplicate combinations out.
:::

## Permutations

A permutation uses every item once, in some order, so instead of a start index the search tracks which items are already in the path. There are n! permutations of n items, each built in O(n): O(n · n!) time, O(n) extra space.

```python run
from itertools import permutations

def all_orders(items):
    result, path = [], []
    used = [False] * len(items)
    def explore():
        if len(path) == len(items):
            result.append(tuple(path))
            return
        for i, item in enumerate(items):
            if not used[i]:
                used[i] = True               # choose
                path.append(item)
                explore()                    # explore
                path.pop()                   # unchoose
                used[i] = False
    explore()
    return result

print(all_orders("abc"))
print(all_orders("abc") == list(permutations("abc")))   # same order, too
```

:::gotcha `permutations` doesn't know about duplicates
`itertools.permutations("aab")` yields 6 tuples, only 3 of them distinct, because it permutes positions. `set(permutations(word))` fixes the output but still generates all n! orderings first: 39.9 million of them for an 11-letter word, even when the word is `"aaaaaaaaaab"` and only 11 arrangements exist. To prune the duplicates instead, choose from a `Counter` of the letters that are left, trying each *distinct* letter once per position.
:::

:::quiz output
What does this print?

```python
from itertools import permutations

print(len(list(permutations("aab"))), len(set(permutations("aab"))))
```

- [ ] `3 3`
- [x] `6 3`
- [ ] `6 6`
- [ ] `3 6`

Positions are permuted, so the two `a`s are treated as different items: 3! = 6 tuples. The set collapses the ones that look the same.
:::

## Pruning: cut dead branches early

Pruning means rejecting a partial answer as soon as it can't lead anywhere, instead of discovering that at the leaves. The best prunes come from **sorting first**: if the candidates are in ascending order and one is already too big, every candidate after it is too big as well, so you `break` out of the loop instead of trying them.

```python run
def exact_baskets(prices, budget, prune):
    prices = sorted(prices)
    found, path, calls = [], [], 0
    def explore(start, remaining):
        nonlocal calls
        calls += 1
        if remaining == 0:
            found.append(path[:])
            return
        if remaining < 0:
            return                           # found out one level too late
        for i in range(start, len(prices)):
            if prune and prices[i] > remaining:
                break                        # sorted: the rest are too big too
            path.append(prices[i])
            explore(i + 1, remaining - prices[i])
            path.pop()
    explore(0, budget)
    return found, calls

prices = [12, 3, 7, 18, 5, 9, 14, 2, 11, 6, 8, 4, 16, 10, 13]
for prune in (False, True):
    found, calls = exact_baskets(prices, 20, prune)
    print(f"{prune=}: {len(found)} baskets, {calls} calls")
```

`nonlocal calls` *is* needed here, because `calls += 1` rebinds the name. Without it, Python treats `calls` as a new local and raises `UnboundLocalError`.

Other prunes worth knowing:

- **Skip equal neighbours.** After sorting, `if i > start and items[i] == items[i - 1]: continue` stops duplicate values from starting duplicate branches.
- **Check feasibility up front.** If the board doesn't contain enough copies of each letter, no search will find the word. A `Counter` comparison costs O(n) and can save an exponential search.
- **Bound the remaining work.** Stop when the items left can't possibly fill the slots left, or when a partial sum already exceeds the target.

## Grid search: per-path visited sets

On a grid, backtracking walks cell to cell, and a cell can't be reused *within one path*. That makes "visited" different from graph traversal: BFS and DFS mark a cell once and forever, but backtracking releases it on the way back, because a different path may legitimately pass through it. Each step has at most 3 new directions, so a search for paths of length L from each of R × C starting cells is O(R × C × 3^L) in the worst case, and the recursion is only L deep.

```python run
def count_routes(maze):
    rows, cols = len(maze), len(maze[0])
    goal = (rows - 1, cols - 1)
    on_path = {(0, 0)}
    def explore(r, c):
        if (r, c) == goal:
            return 1
        routes = 0
        for nr, nc in ((r + 1, c), (r - 1, c), (r, c + 1), (r, c - 1)):
            if 0 <= nr < rows and 0 <= nc < cols and maze[nr][nc] == "." and (nr, nc) not in on_path:
                on_path.add((nr, nc))        # choose
                routes += explore(nr, nc)    # explore
                on_path.remove((nr, nc))     # unchoose
        return routes
    return explore(0, 0)

print(count_routes(["...", ".#.", "..."]))   # around either side of the wall
print(count_routes(["....", "....", "...."]))
```

:::gotcha Forgetting to unchoose
If you never remove a cell from `on_path`, the first path to try a cell "uses it up" for every later path, and the search silently misses answers. The add and the remove must bracket the recursive call, the same way `append` and `pop` bracket it for lists.
:::

## Constraint search: N-Queens

N-Queens places n queens on an n × n board so that none attacks another. Put exactly one queen per row and the search is n levels deep. The constraints become three sets: used columns, used "\\" diagonals (where `row - col` is constant) and used "/" diagonals (where `row + col` is constant). Each check is O(1), and the sets prune so hard that all 92 solutions for n = 8 take about two thousand placements instead of 8⁸ (16.7 million).

```python run
def count_queens(n):
    cols, diag, anti = set(), set(), set()
    def place(row):
        if row == n:
            return 1
        total = 0
        for col in range(n):
            if col in cols or row - col in diag or row + col in anti:
                continue
            cols.add(col); diag.add(row - col); anti.add(row + col)
            total += place(row + 1)
            cols.remove(col); diag.remove(row - col); anti.remove(row + col)
        return total
    return place(0)

print([count_queens(n) for n in range(1, 9)])
```

:::quiz
Queens at `(row, col)` positions `(1, 2)` and `(3, 0)`. Which set check catches the conflict?

- [ ] the column set
- [ ] the `row - col` set
- [x] the `row + col` set
- [ ] neither: they don't attack each other

`1 + 2` and `3 + 0` are both 3, so the queens share a "/" diagonal, where every step down the board is a step to the left. `row - col` is constant along the other direction, the "\\" diagonals.
:::

## Generators: stream solutions with `yield`

:::compare
```js
function* baskets(prices, budget, start = 0, path = []) {
  if (budget === 0) {
    yield path;
    return;
  }
  for (let i = start; i < prices.length; i++) {
    if (prices[i] <= budget) {
      yield* baskets(prices, budget - prices[i], i + 1, [...path, prices[i]]);
    }
  }
}
```
```python
def baskets(prices, budget, start=0, path=()):
    if budget == 0:
        yield path
        return

    for i in range(start, len(prices)):
        if prices[i] <= budget:
            yield from baskets(prices, budget - prices[i], i + 1, path + (prices[i],))
```
:::

A generator turns "collect every solution" into "produce solutions on demand": `yield` replaces `result.append`, and `yield from` replaces the recursive call, just like `yield*` in JavaScript ([yield from](lesson:iterators-and-generators#yield-from-yield)). The caller decides how much to compute. `next()` stops at the first solution, `itertools.islice` takes the first k, and a `for` loop can `break` whenever it likes. Nothing is stored that the caller doesn't keep.

Passing an immutable tuple down (`path + (price,)`) builds a new tuple per step, O(depth), but it needs no unchoose step and can't alias. For shallow searches that's a good trade.

```python run
from itertools import islice

def baskets(prices, budget, start=0, path=()):
    if budget == 0:
        yield path
        return
    for i in range(start, len(prices)):
        if prices[i] <= budget:
            yield from baskets(prices, budget - prices[i], i + 1, path + (prices[i],))

prices = [8, 6, 5, 4, 3, 2]
print(next(baskets(prices, 10)))               # stops at the first solution
print(list(islice(baskets(prices, 10), 2)))    # the first two, then stops
print(sum(1 for _ in baskets(prices, 10)))     # count them all without storing any
```

:::gotcha Yielding the shared `path`
With a mutable `path` and an unchoose step, `yield path` hands out the list the search is about to change. A caller that runs `list(gen)` ends up with the same list repeated. Yield a snapshot, `tuple(path)` or `path[:]`, exactly as you'd copy before appending.
:::

:::quiz output
What does this print?

```python
def words(n):
    if n == 0:
        yield ""
        return
    for letter in "ab":
        for rest in words(n - 1):
            yield letter + rest

gen = words(3)
print(next(gen), next(gen))
```

- [x] `aaa aab`
- [ ] `aaa bbb`
- [ ] `a b`
- [ ] `aaa aba`

The outer loop stays on `"a"` while the inner generators run through their own options, so the last letter changes fastest. Only two of the eight words get built: the generator is paused before the third.
:::

## Cheat sheet

| JavaScript | Python | Notes |
| --- | --- | --- |
| `result.push([...path])` | `result.append(path[:])` | or `tuple(path)`; never the bare `path` |
| `path.push(x)` ... `path.pop()` | `path.append(x)` ... `path.pop()` | choose, explore, unchoose |
| a hand-written power set | `chain.from_iterable(combinations(xs, r) for r in ...)` | the `powerset` recipe |
| hand-written k-combinations | `itertools.combinations(xs, k)` | positions, not values |
| hand-written permutations | `itertools.permutations(xs)` | duplicates repeat; prune with a `Counter` |
| nested loops over options | `itertools.product(options, repeat=k)` | every combination of choices |
| `function*` and `yield*` | `def` with `yield` and `yield from` | stop early with `next()` or `islice` |
| `onPath.add(cell)` ... `onPath.delete(cell)` | `on_path.add(cell)` ... `on_path.remove(cell)` | per path, released on the way back |
| a stack thousands of frames deep | `sys.getrecursionlimit()` is 1,000 | sandbox: ~500 plain, ~300 through `@cache` |

## Challenges

:::challenge id=algo-bt-parentheses title="Balanced parentheses" difficulty=easy
Write `balanced(n)` that returns every string of `n` pairs of correctly nested parentheses, sorted. `balanced(0)` is `[""]`.

```text
balanced(3)  ->  ["((()))", "(()())", "(())()", "()(())", "()()()"]
```

Build the strings character by character, and only add a character that can still lead to a balanced string. One test asks for `n = 12`: that's 208,012 answers out of almost 17 million strings of the right length, so generating everything and filtering does about 80 times more work than it needs to.

```js
function balanced(n) {
  const result = [];
  const explore = (s, opens, closes) => {
    if (closes === n) {
      result.push(s);
      return;
    }
    if (opens < n) explore(s + "(", opens + 1, closes);
    if (closes < opens) explore(s + ")", opens, closes + 1);
  };
  explore("", 0, 0);
  return result;
}
```

```python starter
def balanced(n):
    ...
```

```python solution
def balanced(n):
    result = []
    path = []

    def explore(opens, closes):
        if closes == n:
            result.append("".join(path))
            return
        if opens < n:
            path.append("(")
            explore(opens + 1, closes)
            path.pop()
        if closes < opens:
            path.append(")")
            explore(opens, closes + 1)
            path.pop()

    explore(0, 0)
    return result
```

```python tests
def is_balanced(s):
    depth = 0
    for ch in s:
        depth += 1 if ch == "(" else -1
        if depth < 0:
            return False
    return depth == 0

@test("three pairs")
def _():
    eq(balanced(3), ["((()))", "(()())", "(())()", "()(())", "()()()"])

@test("zero, one and two pairs")
def _():
    eq(balanced(0), [""])
    eq(balanced(1), ["()"])
    eq(balanced(2), ["(())", "()()"])

@test("every string is balanced, with no duplicates")
def _():
    result = balanced(6)
    check(all(len(s) == 12 and is_balanced(s) for s in result), "found an unbalanced string")
    eq(len(set(result)), len(result), "duplicates")
    eq(result, sorted(result), "the list should be sorted")

@test("counts follow the Catalan numbers")
def _():
    eq([len(balanced(n)) for n in range(9)], [1, 1, 2, 5, 14, 42, 132, 429, 1430])

@test("twelve pairs: 208,012 strings, quickly")
def _():
    result = balanced(12)
    eq(len(result), 208_012)
    eq(result[0], "(" * 12 + ")" * 12)
    eq(result[-1], "()" * 12)
```

```hint
Track how many `(` and `)` you've placed. You may add `(` while you've placed fewer than `n`, and `)` only while there are more opens than closes. When you've placed `n` closes, the string is complete.
```

```hint
`"("` sorts before `")"`, so trying `(` first produces the strings already in sorted order. Use a list as the path and `"".join(path)` at the leaves.
```
:::

:::challenge id=algo-bt-unique-perms title="Unique arrangements" difficulty=medium
Write `unique_permutations(word)` that returns every distinct rearrangement of the letters of `word`, sorted, with no duplicates. The empty word has one arrangement, `""`.

```text
unique_permutations("aab")  ->  ["aab", "aba", "baa"]
```

Words can repeat letters heavily. `"aaaaaaaaaaab"` has only 12 distinct arrangements but 479 million permutations, so deduplicating the output of `itertools.permutations` won't finish: prune the duplicate branches instead.

```python starter
def unique_permutations(word):
    ...
```

```python solution
from collections import Counter


def unique_permutations(word):
    remaining = Counter(word)
    letters = sorted(remaining)
    result, path = [], []

    def explore():
        if len(path) == len(word):
            result.append("".join(path))
            return
        for letter in letters:
            if remaining[letter]:
                remaining[letter] -= 1       # choose
                path.append(letter)
                explore()                    # explore
                path.pop()                   # unchoose
                remaining[letter] += 1

    explore()
    return result
```

```python tests
from collections import Counter
from math import factorial

@test("repeated letters give each arrangement once")
def _():
    eq(unique_permutations("aab"), ["aab", "aba", "baa"])
    eq(unique_permutations("abab"), ["aabb", "abab", "abba", "baab", "baba", "bbaa"])

@test("distinct letters give every permutation, sorted")
def _():
    eq(unique_permutations("cab"), ["abc", "acb", "bac", "bca", "cab", "cba"])

@test("empty, single-letter and one-letter-repeated words")
def _():
    eq(unique_permutations(""), [""])
    eq(unique_permutations("z"), ["z"])
    eq(unique_permutations("aaaa"), ["aaaa"])

@test("banana: 60 arrangements, sorted and distinct")
def _():
    result = unique_permutations("banana")
    eq(len(result), factorial(6) // (factorial(3) * factorial(2)))
    eq(result, sorted(set(result)))
    check(all(Counter(s) == Counter("banana") for s in result), "every result must use exactly banana's letters")

@test("prunes instead of generating 479 million permutations")
def _():
    expected = ["a" * i + "b" + "a" * (11 - i) for i in reversed(range(12))]
    eq(unique_permutations("a" * 11 + "b"), expected)
```

```hint
Count the letters with a `Counter`. At each position, try each *distinct* letter that still has copies left: decrement its count, recurse, then put it back.
```

```hint
Because each position tries each distinct letter once, two branches can never build the same string, so there's nothing to deduplicate. Looping over the letters in sorted order makes the output come out sorted, too.
```
:::

:::challenge id=algo-bt-combination-sum title="Combination sum" difficulty=medium
Write `combination_sum(candidates, target)`. `candidates` is a list of distinct positive integers, and each one may be used any number of times. Return every combination that adds up to `target`, each as a non-decreasing list, with the whole result sorted. A combination is a multiset, so `[2, 3]` and `[3, 2]` are the same one. `target == 0` has one combination: `[]`.

```text
combination_sum([2, 3, 6, 7], 7)  ->  [[2, 2, 3], [7]]
combination_sum([2, 3, 5], 8)     ->  [[2, 2, 2, 2], [2, 3, 3], [3, 5]]
```

Don't modify `candidates`. One test asks for the 1,747 ways to make 40 from `[1, 2, 3, 4, 5]`, so generate each combination once rather than every ordering of it.

```python starter
def combination_sum(candidates, target):
    ...
```

```python solution
def combination_sum(candidates, target):
    nums = sorted(candidates)
    result, path = [], []

    def explore(start, remaining):
        if remaining == 0:
            result.append(path[:])
            return
        for i in range(start, len(nums)):
            if nums[i] > remaining:
                break                         # sorted: the rest are too big too
            path.append(nums[i])
            explore(i, remaining - nums[i])   # i, not i + 1: reuse is allowed
            path.pop()

    explore(0, target)
    return result
```

```python tests
@test("the examples")
def _():
    eq(combination_sum([2, 3, 6, 7], 7), [[2, 2, 3], [7]])
    eq(combination_sum([2, 3, 5], 8), [[2, 2, 2, 2], [2, 3, 3], [3, 5]])

@test("candidates can arrive in any order")
def _():
    eq(combination_sum([7, 3, 6, 2], 7), [[2, 2, 3], [7]])

@test("no combination, and a single candidate")
def _():
    eq(combination_sum([4, 6], 9), [])
    eq(combination_sum([3], 9), [[3, 3, 3]])
    eq(combination_sum([3], 10), [])
    eq(combination_sum([100, 200], 50), [])

@test("a target of 0 has one empty combination")
def _():
    eq(combination_sum([2, 3], 0), [[]])

@test("a candidate equal to the target")
def _():
    eq(combination_sum([5, 10], 10), [[5, 5], [10]])

@test("each combination is its own list")
def _():
    result = combination_sum([1, 2], 4)
    eq(result, [[1, 1, 1, 1], [1, 1, 2], [2, 2]])
    eq(len({id(combo) for combo in result}), len(result), "copy the path before storing it")

@test("doesn't modify the candidates")
def _():
    candidates = [7, 3, 6, 2]
    combination_sum(candidates, 7)
    eq(candidates, [7, 3, 6, 2])

@test("1,747 ways to make 40 from 1 to 5")
def _():
    result = combination_sum([5, 4, 3, 2, 1], 40)
    eq(len(result), 1747)
    eq(result[0], [1] * 40)
    eq(result[-1], [5] * 8)
    check(all(sum(c) == 40 and c == sorted(c) for c in result), "every combination must be sorted and sum to 40")
```

```hint
Sort the candidates and pass a start index down the recursion. Recursing with the *same* index `i` lets a candidate repeat; never going back to earlier indices is what stops `[3, 2]` from appearing after `[2, 3]`.
```

```hint
Once the candidates are sorted, `if nums[i] > remaining: break` prunes the rest of the loop. Copy the path when you record a combination: `result.append(path[:])`.
```
:::

:::challenge id=algo-bt-word-search title="Word search" difficulty=hard
Write `word_exists(board, word)`. The board is a list of equal-length strings of letters. Return `True` if `word` can be traced through the board by moving horizontally or vertically between neighbouring cells, using each cell at most once, and `False` otherwise. The empty word is always found.

```text
board = ["ABCE",
         "SFCS",
         "ADEE"]
word_exists(board, "ABCCED")  ->  True
word_exists(board, "SEE")     ->  True
word_exists(board, "ABCB")    ->  False   (the B would be used twice)
```

Some boards are adversarial: a 12 × 12 board of `A`s, searched for a word that can't be there. Rule those out *before* searching, or the search explores millions of paths.

```python starter
def word_exists(board, word):
    ...
```

```python solution
from collections import Counter


def word_exists(board, word):
    if not word:
        return True
    rows = len(board)
    cols = len(board[0]) if board else 0
    available = Counter("".join(board))
    if any(available[letter] < count for letter, count in Counter(word).items()):
        return False                              # not enough of some letter
    used = set()

    def explore(r, c, i):
        if not (0 <= r < rows and 0 <= c < cols) or (r, c) in used or board[r][c] != word[i]:
            return False
        if i == len(word) - 1:
            return True
        used.add((r, c))                          # choose
        found = (explore(r + 1, c, i + 1) or explore(r - 1, c, i + 1)
                 or explore(r, c + 1, i + 1) or explore(r, c - 1, i + 1))
        used.remove((r, c))                       # unchoose
        return found

    return any(explore(r, c, 0) for r in range(rows) for c in range(cols))
```

```python tests
BOARD = ["ABCE", "SFCS", "ADEE"]

@test("finds words that are there")
def _():
    eq(word_exists(BOARD, "ABCCED"), True)
    eq(word_exists(BOARD, "SEE"), True)
    eq(word_exists(BOARD, "ASADFBCCEESE"), True)

@test("each cell is used at most once")
def _():
    eq(word_exists(BOARD, "ABCB"), False)
    eq(word_exists(["AB"], "ABA"), False)

@test("paths turn back into cells another branch tried")
def _():
    eq(word_exists(["CAA", "AAA", "BCD"], "AAB"), True)

@test("single cells")
def _():
    eq(word_exists(["A"], "A"), True)
    eq(word_exists(["A"], "B"), False)
    eq(word_exists(["A"], "AA"), False)

@test("the empty word is always found, and an empty board finds nothing else")
def _():
    eq(word_exists(BOARD, ""), True)
    eq(word_exists([], ""), True)
    eq(word_exists([], "A"), False)
    eq(word_exists([""], "A"), False)

@test("moves don't wrap around the edges or go diagonally")
def _():
    eq(word_exists(["ABC"], "AC"), False)
    eq(word_exists(["A", "B", "C"], "AC"), False)
    eq(word_exists(["AB", "CD"], "AD"), False)

@test("doesn't modify the board")
def _():
    board = list(BOARD)
    word_exists(board, "ABCCED")
    word_exists(board, "XYZ")
    eq(board, BOARD)

@test("gives up fast when the board can't hold the word")
def _():
    board = ["A" * 12] * 12
    eq(word_exists(board, "A" * 14 + "B"), False)
    eq(word_exists(board, "A" * 145), False)
```

```hint
Try every cell as a starting point. From a cell that matches `word[i]`, mark it as used, try the four neighbours for `word[i + 1]`, then unmark it. The search is only `len(word)` deep, so plain recursion is fine.
```

```hint
For the adversarial boards, compare a `Counter` of the board's letters with a `Counter` of the word's. If the board is short of any letter, return `False` without searching.
```
:::

:::challenge id=algo-bt-queens title="N-Queens, lazily" difficulty=hard
Write a generator function `queens(n)` that yields every solution to the n-queens puzzle, in lexicographic order. A solution is a tuple of column indices: `solution[r]` is the column of the queen in row `r`. No two queens may share a row, a column or a diagonal. The tests use `n <= 8`.

```text
list(queens(4))  ->  [(1, 3, 0, 2), (2, 0, 3, 1)]
next(queens(8))  ->  (0, 4, 7, 5, 2, 6, 1, 3)
```

It must be lazy: `next(queens(8))` should stop as soon as the first solution is found, and two generators must not share state.

```js
function* queens(n) {
  const cols = new Set(), diag = new Set(), anti = new Set(), placed = [];
  function* place(row) {
    if (row === n) {
      yield [...placed];
      return;
    }
    for (let col = 0; col < n; col++) {
      if (cols.has(col) || diag.has(row - col) || anti.has(row + col)) continue;
      cols.add(col); diag.add(row - col); anti.add(row + col); placed.push(col);
      yield* place(row + 1);
      cols.delete(col); diag.delete(row - col); anti.delete(row + col); placed.pop();
    }
  }
  yield* place(0);
}
```

```python starter
def queens(n):
    ...
```

```python solution
def queens(n):
    cols, diag, anti = set(), set(), set()
    placed = []

    def place(row):
        if row == n:
            yield tuple(placed)
            return
        for col in range(n):
            if col in cols or row - col in diag or row + col in anti:
                continue
            cols.add(col); diag.add(row - col); anti.add(row + col)
            placed.append(col)
            yield from place(row + 1)
            placed.pop()
            cols.remove(col); diag.remove(row - col); anti.remove(row + col)

    yield from place(0)
```

```python tests
import inspect
from itertools import combinations

def attacks(solution):
    return any(c1 == c2 or abs(c1 - c2) == r2 - r1
               for (r1, c1), (r2, c2) in combinations(enumerate(solution), 2))

@test("it's a generator")
def _():
    check(inspect.isgenerator(queens(4)), "queens(n) should be a generator function: use yield")

@test("four queens")
def _():
    eq(list(queens(4)), [(1, 3, 0, 2), (2, 0, 3, 1)])

@test("one queen, and the boards with no solution")
def _():
    eq(list(queens(1)), [(0,)])
    eq(list(queens(2)), [])
    eq(list(queens(3)), [])

@test("the first eight-queens solution")
def _():
    eq(next(queens(8)), (0, 4, 7, 5, 2, 6, 1, 3))

@test("solution counts for n = 1 to 8")
def _():
    eq([sum(1 for _ in queens(n)) for n in range(1, 9)], [1, 0, 0, 2, 10, 4, 40, 92])

@test("solutions are tuples, valid, distinct and in lexicographic order")
def _():
    solutions = list(queens(6))
    check(all(type(s) is tuple and len(s) == 6 for s in solutions), "each solution is a tuple of 6 columns")
    check(not any(attacks(s) for s in solutions), "two queens attack each other")
    eq(solutions, sorted(set(solutions)))

@test("each generator keeps its own state")
def _():
    first, second = queens(5), queens(5)
    eq(next(first), (0, 2, 4, 1, 3))
    eq(next(second), (0, 2, 4, 1, 3))
    eq(len(list(first)), 9, "the first generator should have 9 solutions left")
```

```hint
Place one queen per row, recursing row by row. Keep three sets for the columns, the `row - col` diagonals and the `row + col` diagonals that are already taken, so each safety check is O(1).
```

```hint
Make the recursive helper a generator too: `yield tuple(placed)` at the bottom (a snapshot, not the list you keep mutating) and `yield from place(row + 1)` for the recursive call. Create the sets *inside* `queens`, so every call gets fresh ones.
```
:::
