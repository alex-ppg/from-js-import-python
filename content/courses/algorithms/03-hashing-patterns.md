---
title: Hash Maps & Sets
part: Patterns
summary: Counting, complement lookups, canonical keys, consecutive runs and set algebra: O(n) answers bought with memory.
minutes: 40
---

A hash map turns "have I seen this?" and "how many of these?" into O(1) questions, which makes it the most common way to knock an O(n²) brute force down to O(n). Every pattern in this lesson makes the same trade: O(n) extra memory for a single pass.

Python's `dict` and `set` play the roles of JavaScript's `Map` and `Set`, with two differences that shape algorithm code. Keys are compared **by value**, so a tuple or a `frozenset` works as a composite key, where a JS `Map` keys an array by identity and pushes you into building strings like `"3,4"`. And `collections` ships `Counter` and `defaultdict`, so counting and grouping are one-liners. The basics are in [Dicts](lesson:dicts) and [Sets](lesson:sets). Here they go to work.

## Frequency maps with `Counter`

:::compare
```js
function isAnagram(a, b) {
  if (a.length !== b.length) return false;
  const counts = new Map();
  for (const ch of a) counts.set(ch, (counts.get(ch) ?? 0) + 1);
  for (const ch of b) {
    if (!counts.get(ch)) return false;
    counts.set(ch, counts.get(ch) - 1);
  }
  return true;
}
```
```python run
from collections import Counter

def is_anagram(a, b):
    return Counter(a) == Counter(b)

print(is_anagram("listen", "silent"))
print(is_anagram("rat", "tar"), is_anagram("aab", "abb"))
```
:::

`Counter(xs)` builds a frequency map in O(n), and two counters are equal when every count matches. (Since 3.10, a missing key and a zero count compare equal, too.) That's an anagram check in O(n + m) time and O(k) space for k distinct characters, with no decrement dance. `most_common(k)` ranks items, breaking ties by first appearance, and the operators answer multiset questions: `a - b` is what `a` has that `b` lacks, and `a & b` is what they share.

```python run
from collections import Counter

votes = Counter(["tea", "coffee", "tea", "juice", "coffee", "tea"])
print(votes.most_common(2))                        # the top two, with counts

recipe = Counter(egg=3, flour=2, milk=1)
pantry = Counter(egg=2, flour=5)
print(recipe - pantry)                             # still to buy
print(sum((recipe & pantry).values()))             # units already covered
```

:::quiz output
What does this print?

```python
from collections import Counter

diff = Counter("aab") - Counter("abbb")
print(diff, len(diff))
```

- [x] `Counter({'a': 1}) 1`
- [ ] `Counter({'a': 1, 'b': -2}) 2`
- [ ] `Counter({'b': -2, 'a': 1}) 2`

`-` keeps only positive results, so `b`'s count of 1 − 3 disappears instead of going negative. That's usually what you want ("what's still missing?"). When you need the negative counts, call `c.subtract(other)`, which updates in place and keeps them.
:::

## Two-sum: remember what you've passed

:::compare
```js
function hasPairWithSum(prices, budget) {
  for (let i = 0; i < prices.length; i++) {
    // includes() is a hidden O(n) scan: O(n²) overall
    if (prices.includes(budget - prices[i], i + 1)) return true;
  }
  return false;
}
```
```python
def has_pair_with_sum(prices, budget):
    seen = set()
    for price in prices:
        if budget - price in seen:     # O(1) on average
            return True
        seen.add(price)
    return False
```
:::

Instead of searching for each element's partner, remember what you've already passed. Each `price` needs `budget - price`, and if that's in `seen`, you're done: one pass, O(n) time and O(n) space. Check **before** adding, so an element can't pair with itself (`[3]` with a budget of 6 stays `False`) while duplicates still pair with each other (`[3, 3]` finds its pair). When you need positions rather than a yes or no, make `seen` a dict from value to index, which is the classic two-sum and the first challenge. Swap the set for a `Counter` and the same loop counts pairs instead:

```python run
from collections import Counter

def count_pairs_with_sum(nums, target):
    seen = Counter()
    pairs = 0
    for x in nums:
        pairs += seen[target - x]      # every earlier partner makes a pair
        seen[x] += 1
    return pairs

print(count_pairs_with_sum([1, 5, 7, -1, 5], 6))   # (1, 5) twice, and (7, -1)
print(count_pairs_with_sum([2, 2, 2], 4))          # three ways to pick two 2s
```

:::quiz
What's the time complexity of this duplicate check on a list of `n` items?

```python
def has_duplicate(items):
    return any(items.count(item) > 1 for item in items)
```

- [ ] O(n)
- [ ] O(n log n)
- [x] O(n²)

`items.count(item)` scans the whole list, once per item. `len(set(items)) != len(items)` answers the same question in O(n), and a `seen` set loop does too while stopping at the first repeat.
:::

## Grouping by a canonical key

:::compare
```js
const groups = new Map();
for (const word of words) {
  const key = [...word].sort().join("");   // arrays can't be Map keys by value
  if (!groups.has(key)) groups.set(key, []);
  groups.get(key).push(word);
}
[...groups.values()];
```
```python
from collections import defaultdict

groups = defaultdict(list)
for word in words:
    groups[tuple(sorted(word))].append(word)   # any hashable value can be a key

list(groups.values())
```
:::

Items that belong together get the same **canonical key**: a normal form that every equivalent item maps to. Sorting a word's letters gives all its anagrams one key. In Python the key can be any hashable value, compared by value: a tuple of sorted letters, a tuple of letter counts, a reduced `(dx, dy)` direction, or a `frozenset` when order doesn't matter. Grouping n words of length k costs O(n·k log k) with a sorted key, or O(n·k) with a count signature. Hashing a string or tuple key is linear in its length too, so no key is cheaper than O(k).

```python run
from collections import defaultdict

words = ["listen", "google", "silent", "enlist", "banana", "gogole"]
groups = defaultdict(list)
for word in words:
    groups["".join(sorted(word))].append(word)
print(list(groups.values()))

def letter_counts(word):                 # O(k) instead of O(k log k)
    counts = [0] * 26
    for ch in word:
        counts[ord(ch) - ord("a")] += 1
    return tuple(counts)                 # a list can't be a key; a tuple can

print(letter_counts("listen") == letter_counts("silent"))

pairs = [("ada", "bob"), ("bob", "ada"), ("ada", "cy")]
print(len({frozenset(p) for p in pairs}))   # order-free keys: 2 distinct pairs
```

:::gotcha Lists, sets and dicts can't be keys
`groups[sorted(word)]` raises `TypeError: cannot use 'list' as a dict key`, because a mutable container could change after insertion and end up in the wrong slot. Convert first: `tuple(...)` for sequences, `frozenset(...)` for sets. A tuple is only hashable if everything inside it is, so `(1, [2])` fails too.
:::

```python run raises
groups = {}
key = sorted("listen")       # a list
groups[key] = ["listen"]
```

:::quiz
Which of these can be a dict key?

- [ ] `[3, 4]`
- [ ] `{3, 4}`
- [ ] `(3, [4])`
- [x] `frozenset({3, 4})`

Keys must be hashable. Lists and sets are mutable, so they aren't, and a tuple is hashable only when all of its items are. `frozenset` is the immutable set, built for exactly this.
:::

## Order-preserving dedupe

:::compare
```js
const unique = [...new Set(emails)];

const seen = new Set();
const byAddress = emails.filter((e) => {
  const key = e.toLowerCase();
  return !seen.has(key) && seen.add(key);
});
```
```python
unique = list(dict.fromkeys(emails))

first = {}
for e in emails:
    first.setdefault(e.lower(), e)     # keep the first spelling of each address
by_address = list(first.values())
```
:::

Dicts keep insertion order, so a dict's keys make an ordered set: `list(dict.fromkeys(xs))` dedupes in O(n) and keeps first-seen order, where `list(set(xs))` scrambles it ([Sets](lesson:sets#dedupe-keeping-order) has the details). To dedupe by a key, map the key to the item you want to keep. `setdefault` keeps the first item, and a dict comprehension keeps the last. Either way it's O(n) time and O(k) space.

```python run
emails = ["Ada@x.io", "bob@x.io", "ada@x.io", "Cy@x.io", "BOB@x.io"]

print(list(dict.fromkeys(emails)))                     # exact duplicates only: none here
print(list({e.lower(): e for e in emails}.values()))   # one per address, last spelling wins

first = {}
for e in emails:
    first.setdefault(e.lower(), e)                     # one per address, first spelling wins
print(list(first.values()))
```

:::quiz output
What does this print?

```python
latest = {}
for sku, price in [("tea", 3), ("pie", 5), ("tea", 4)]:
    latest[sku] = price
print(list(latest.items()))
```

- [x] `[('tea', 4), ('pie', 5)]`
- [ ] `[('pie', 5), ('tea', 4)]`
- [ ] `[('tea', 3), ('pie', 5)]`

Assigning to an existing key replaces the value but keeps the key's original position, exactly as `Map.set` does in JavaScript. That's why the dict comprehension above keeps each address in first-seen order with its last spelling. To move a key to the end, delete it first, or use `OrderedDict.move_to_end`.
:::

## Longest consecutive sequence

:::compare
```js
function longestRun(nums) {
  const sorted = [...new Set(nums)].sort((a, b) => a - b);   // O(n log n)
  let best = sorted.length ? 1 : 0, run = 1;
  for (let i = 1; i < sorted.length; i++) {
    run = sorted[i] === sorted[i - 1] + 1 ? run + 1 : 1;
    best = Math.max(best, run);
  }
  return best;
}
```
```python
from itertools import pairwise

def longest_run(nums):
    ordered = sorted(set(nums))                  # O(n log n)
    best = run = 1 if ordered else 0
    for prev, x in pairwise(ordered):
        run = run + 1 if x == prev + 1 else 1
        best = max(best, run)
    return best
```
:::

Given unsorted integers, find the longest run of consecutive values. Sorting makes it easy and O(n log n). A set makes it O(n), with one observation: a number **starts** a run exactly when `x - 1` is missing. Walk upward (`x + 1`, `x + 2`, ...) only from those starts. Every number then gets stepped over once, by the walk from its own run's start, so the walks add up to O(n) in total. Without the start check, a run of length L is walked from each of its L members, and one long run makes the whole thing O(n²).

```python run
readings = [100, 4, 200, 1, 3, 2, 101]
values = set(readings)
starts = [x for x in values if x - 1 not in values]
print(sorted(starts))           # 1, 100 and 200 begin runs; 2, 3, 4 and 101 don't
```

Walking up from each start with `while end + 1 in values` finishes the job, and that's [the fourth challenge](#algo-longest-consecutive).

## First unique element

:::compare
```js
function firstUnique(items) {
  const counts = new Map();
  for (const x of items) counts.set(x, (counts.get(x) ?? 0) + 1);
  return items.find((x) => counts.get(x) === 1) ?? null;
}
```
```python
from collections import Counter

def first_unique(items):
    counts = Counter(items)
    return next((x for x in items if counts[x] == 1), None)
```
:::

Count everything, then scan in order for the first count of 1: two passes, O(n) time and O(k) space. `next(generator, default)` is Python's `find` with a fallback ([Comprehensions](lesson:map-filter-reduce#find-findindex-some-and-every)). Because a `Counter` is a dict, it remembers the order in which each item first appeared, so the second pass can scan `counts.items()`, the k distinct items, instead of the whole input.

```python run
from collections import Counter

def first_unique(items):
    counts = Counter(items)                        # remembers first-seen order
    return next((x for x, n in counts.items() if n == 1), None)

print(first_unique("swiss"))
print(first_unique([0, 4, 4, 7]))                  # 0 is falsy, but it's the answer
print(first_unique("aabb"))
```

:::gotcha `None` is a sentinel, so it can't also be data
`next(..., None)` can't tell "no unique item" apart from "the unique item is `None`". When `None` can appear in the input, pick a private sentinel (`MISSING = object()`) or raise. And never test the result with `if result:`: a unique `0` or `""` is falsy, which is the same trap as JavaScript's `||` default.
:::

## Isomorphic strings: one-to-one mappings

:::compare
```js
function isIsomorphic(a, b) {
  if (a.length !== b.length) return false;
  const ab = new Map(), ba = new Map();
  for (let i = 0; i < a.length; i++) {
    if ((ab.get(a[i]) ?? b[i]) !== b[i]) return false;
    if ((ba.get(b[i]) ?? a[i]) !== a[i]) return false;
    ab.set(a[i], b[i]);
    ba.set(b[i], a[i]);
  }
  return true;
}
```
```python
def is_isomorphic(a, b):
    if len(a) != len(b):
        return False
    forward, backward = {}, {}
    for x, y in zip(a, b):
        if forward.setdefault(x, y) != y:
            return False
        if backward.setdefault(y, x) != x:
            return False
    return True
```
:::

Two sequences are isomorphic when a one-to-one mapping turns one into the other: `"egg"` and `"add"` (e→a, g→d), or `"paper"` and `"title"`, but not `"foo"` and `"bar"`, where `o` would have to become both `a` and `r`. `d.setdefault(x, y)` returns the existing mapping for `x`, or records `y` and returns it, so a result other than `y` is a contradiction. The trap is checking one direction only: a single dict happily maps both `a` and `b` in `"ab"` to the `a` in `"aa"`. Keep a dict each way. It's O(n) time and O(k) space, and `zip` makes it work on any pair of sequences, not just strings.

```python run
def is_isomorphic(a, b):
    if len(a) != len(b):
        return False
    forward, backward = {}, {}
    for x, y in zip(a, b):
        if forward.setdefault(x, y) != y or backward.setdefault(y, x) != x:
            return False
    return True

print(is_isomorphic("egg", "add"), is_isomorphic("paper", "title"))
print(is_isomorphic("foo", "bar"), is_isomorphic("ab", "aa"))
print(is_isomorphic(["red", "blue", "red"], "xyx"))     # any two sequences
```

:::pythonic Count the distinct pairs
For equal-length inputs, `len(set(zip(a, b))) == len(set(a)) == len(set(b))` is the same test in one line. The mapping is one-to-one exactly when there are as many distinct `(x, y)` pairs as there are distinct `x`s and distinct `y`s.
:::

:::quiz output
This check only looks one way. What does it print?

```python
def one_way(a, b):
    mapping = {}
    return all(mapping.setdefault(x, y) == y for x, y in zip(a, b))

print(one_way("ab", "aa"), one_way("aa", "ab"))
```

- [x] `True False`
- [ ] `False False`
- [ ] `True True`
- [ ] `False True`

`"ab"` → `"aa"` passes, since `a` and `b` each map to `a` without a contradiction, but no one-to-one mapping exists. In the other direction, `a` would have to map to both `a` and `b`, which `setdefault` catches. You need the backward dict too.
:::

## Set algebra

:::compare
```js
const added = [...today].filter((u) => !yesterday.has(u));
const common = lists.reduce((acc, xs) => acc.filter((x) => xs.includes(x)));

// ES2025
today.difference(yesterday);
```
```python
added = today - yesterday
common = set.intersection(*map(set, lists))


# methods also accept any iterable
today.difference(yesterday_list)
```
:::

When the question is "in both", "in either", "in only one" or "missing", set operators answer it in one expression. `a | b` costs O(len(a) + len(b)), `a - b` is O(len(a)), and `a & b` iterates the **smaller** set and probes the larger one, so it's O(min(len(a), len(b))). The method forms (`a.intersection(xs)`, `a.issuperset(xs)`) accept any iterable and cost O(len(xs)). Building a set from a list is O(n), so convert once and reuse it. The [Sets](lesson:sets#set-algebra-operators-and-methods) lesson maps every operator to JavaScript.

```python run
yesterday = {"ada", "bob", "cy", "dee"}
today = {"bob", "dee", "eve"}
print(sorted(today - yesterday))                 # who's new
print(sorted(yesterday ^ today))                 # who came or went

teams = [["ada", "bob", "cy"], ["bob", "cy", "dee"], ["cy", "bob"]]
print(sorted(set.intersection(*map(set, teams))))   # on every team

ids = [3, 1, 4, 5, 9, 2, 6, 8]
print(sorted(set(range(1, 11)) - set(ids)))      # missing from 1..10
```

:::quiz
`big` is a set of 1,000,000 items and `small` a set of 10. About how many membership checks does `big & small` make?

- [x] About 10
- [ ] About 1,000
- [ ] About 1,000,000
- [ ] About 1,000,010

CPython's intersection loops over the smaller set and looks each item up in the larger one, so it's about 10 hash lookups whichever operand comes first. A hand-written `{x for x in big if x in small}` would make a million.
:::

## Cheat sheet

| Signal in the problem | Pattern | Python | Time, space |
| --- | --- | --- | --- |
| how many of each? | frequency map | `Counter(xs)` | O(n), O(k) |
| same letters, any order? | compare counts | `Counter(a) == Counter(b)` | O(n + m), O(k) |
| what's missing, what's shared? | multiset arithmetic | `need - have`, `a & b` | O(k) |
| a pair that adds up to `t` | complement lookup | `if t - x in seen:` before `seen.add(x)` | O(n), O(n) |
| group equivalent items | canonical key | `groups[key(x)].append(x)` on a `defaultdict(list)` | O(n × key cost) |
| dedupe, keep order | dict as an ordered set | `list(dict.fromkeys(xs))` | O(n), O(n) |
| longest run of consecutive numbers | set and run starts | walk up only when `x - 1 not in values` | O(n), O(n) |
| first item that appears once | count, then scan | `next((x for x, c in counts.items() if c == 1), None)` | O(n), O(k) |
| one-to-one mapping? | a dict each way | `forward.setdefault(x, y) != y` | O(n), O(k) |
| in both / either / only one / missing | set algebra | `a & b`, `a \| b`, `a ^ b`, `a - b` | O(len(a) + len(b)) at most |

## Challenges

:::challenge id=algo-two-sum title="Two-sum" difficulty=easy
Write `two_sum(nums, target)` that returns a tuple `(i, j)` of indices with `i < j` and `nums[i] + nums[j] == target`, or `None` if there's no such pair. When several pairs work, return the one a left-to-right scan completes first: the smallest `j`, and for that `j`, the smallest `i`.

```text
two_sum([2, 7, 11, 15], 9)   ->  (0, 1)
two_sum([3, 2, 4], 6)        ->  (1, 2)
two_sum([3, 3], 6)           ->  (0, 1)
two_sum([2, 2, 8], 10)       ->  (0, 2)    both 2s fit; the earlier one wins
```

Make it one pass with a dict: O(n), not O(n²).

```js
function twoSum(nums, target) {
  for (let j = 0; j < nums.length; j++) {
    const i = nums.indexOf(target - nums[j]);    // O(n) inside the loop
    if (i !== -1 && i < j) return [i, j];
  }
  return null;
}
```

```python starter
def two_sum(nums, target):
    ...
```

```python solution
def two_sum(nums, target):
    first_index = {}                       # value -> earliest index seen
    for j, x in enumerate(nums):
        i = first_index.get(target - x)
        if i is not None:                  # not `if i:`, index 0 is falsy
            return i, j
        first_index.setdefault(x, j)       # keep the earliest copy
    return None
```

```python tests
@test("finds the pair")
def _():
    eq(two_sum([2, 7, 11, 15], 9), (0, 1))
    eq(two_sum([3, 2, 4], 6), (1, 2))

@test("index 0 is a real answer")
def _():
    eq(two_sum([0, 4, 0], 0), (0, 2))

@test("an element can't pair with itself")
def _():
    eq(two_sum([3], 6), None)
    eq(two_sum([3, 4], 6), None)

@test("duplicates can pair with each other")
def _():
    eq(two_sum([3, 3], 6), (0, 1))

@test("the earliest partner wins when it repeats")
def _():
    eq(two_sum([2, 2, 8], 10), (0, 2))

@test("the pair that completes first wins")
def _():
    eq(two_sum([4, 1, 6, 9], 10), (0, 2))

@test("negatives and zero")
def _():
    eq(two_sum([-3, 4, 3, 90], 0), (0, 2))
    eq(two_sum([-1, -2, -3, -4, -5], -8), (2, 4))

@test("no pair")
def _():
    eq(two_sum([1, 2, 3], 7), None)
    eq(two_sum([], 7), None)

@test("100,001 numbers, pair at the very end (one pass)")
def _():
    nums = [2 * i for i in range(100_000)] + [-1]
    eq(two_sum(nums, 199_997), (99_999, 100_000))
```

```hint
For each `x`, the partner you need is `target - x`. Keep a dict from every value you've passed to its index, and look up the partner *before* storing `x`.
```

```hint
Store only the first index of each value: `setdefault` leaves an existing entry alone, while `d[x] = j` would overwrite it with a later copy.
```

```hint
`if i:` treats index `0` as "not found". Compare with `None` instead.
```
:::

:::challenge id=algo-bulls-and-cows title="Bulls and cows" difficulty=easy
In the code-breaking game Bulls and Cows, a guess scores a **bull** for every position where it matches the secret exactly, and a **cow** for every other digit that appears in the secret but somewhere else. Each digit of the secret can be matched only once, so duplicates need care. Write `score(secret, guess)` that returns `(bulls, cows)`. Both arguments are strings of digits of the same length.

```text
score("1807", "7810")  ->  (1, 3)    the 8 is a bull; 1, 0 and 7 are cows
score("1123", "0111")  ->  (1, 1)    one 1 is a bull, and only one more 1 can be a cow
```

```js
function score(secret, guess) {
  let bulls = 0, cows = 0;
  const balance = Array(10).fill(0);      // digit -> secret count minus guess count
  for (let i = 0; i < secret.length; i++) {
    if (secret[i] === guess[i]) bulls++;
    else {
      if (balance[secret[i]]++ < 0) cows++;
      if (balance[guess[i]]-- > 0) cows++;
    }
  }
  return [bulls, cows];
}
```

```python starter
from collections import Counter


def score(secret, guess):
    ...
```

```python solution
from collections import Counter


def score(secret, guess):
    bulls = sum(s == g for s, g in zip(secret, guess))
    shared = sum((Counter(secret) & Counter(guess)).values())   # with multiplicity
    return bulls, shared - bulls
```

```python tests
@test("examples")
def _():
    eq(score("1807", "7810"), (1, 3))
    eq(score("1123", "0111"), (1, 1))

@test("all bulls")
def _():
    eq(score("1234", "1234"), (4, 0))

@test("all cows")
def _():
    eq(score("1234", "4321"), (0, 4))

@test("nothing in common")
def _():
    eq(score("1234", "5678"), (0, 0))

@test("duplicates are matched at most once")
def _():
    eq(score("1122", "2211"), (0, 4))
    eq(score("1000", "0001"), (2, 2))

@test("a digit used as a bull can't also be a cow")
def _():
    eq(score("1111", "1222"), (1, 0))
    eq(score("1222", "1111"), (1, 0))

@test("empty strings")
def _():
    eq(score("", ""), (0, 0))
```

```hint
Bulls are the positions where the characters match: `sum(s == g for s, g in zip(secret, guess))`. Booleans add up as 0 and 1.
```

```hint
`Counter(secret) & Counter(guess)` keeps the *minimum* count of each digit: the digits the two strings share, duplicates included. That total counts the bulls as well as the cows, so subtract the bulls.
```
:::

:::challenge id=algo-group-by-pattern title="Group words by letter pattern" difficulty=medium
Two words share a **letter pattern** when one turns into the other by consistently replacing letters one-for-one. `"egg"`, `"add"` and `"too"` share the pattern *x y y*, and `"ego"` and `"cat"` share *x y z*. Write `group_by_pattern(words)` that groups the words that share a pattern. Return a list of groups, ordered by each group's first appearance, with each group's words in input order.

```text
group_by_pattern(["egg", "add", "ego", "too", "pip", "dad", "cat"])
    ->  [["egg", "add", "too"], ["ego", "cat"], ["pip", "dad"]]
```

Comparing words pair by pair is O(n²). Give each word a canonical key instead, identical for words with the same pattern, and group them with a dict in time linear in the total length of the words.

```js
function groupByPattern(words) {
  const groups = [];
  for (const word of words) {
    const group = groups.find((g) => isIsomorphic(g[0], word));   // scans every group
    if (group) group.push(word);
    else groups.push([word]);
  }
  return groups;
}
```

```python starter
from collections import defaultdict


def group_by_pattern(words):
    ...
```

```python solution
from collections import defaultdict


def pattern(word):
    """Number each letter by its first appearance: "egg" -> (0, 1, 1)."""
    first_seen = {}
    return tuple(first_seen.setdefault(ch, len(first_seen)) for ch in word)


def group_by_pattern(words):
    groups = defaultdict(list)
    for word in words:
        groups[pattern(word)].append(word)
    return list(groups.values())
```

```python tests
@test("groups the example")
def _():
    eq(
        group_by_pattern(["egg", "add", "ego", "too", "pip", "dad", "cat"]),
        [["egg", "add", "too"], ["ego", "cat"], ["pip", "dad"]],
    )

@test("words of different lengths never share a pattern")
def _():
    eq(group_by_pattern(["ab", "abc", "xy"]), [["ab", "xy"], ["abc"]])

@test("the mapping must be one-to-one")
def _():
    eq(group_by_pattern(["ab", "aa"]), [["ab"], ["aa"]])

@test("letter order matters, not just letter counts")
def _():
    eq(group_by_pattern(["aab", "aba", "baa", "xxy"]), [["aab", "xxy"], ["aba"], ["baa"]])

@test("duplicate words stay in their group")
def _():
    eq(group_by_pattern(["noon", "noon", "abba"]), [["noon", "noon", "abba"]])

@test("case-sensitive")
def _():
    eq(group_by_pattern(["Aa", "aa", "xy"]), [["Aa", "xy"], ["aa"]])

@test("empty input and empty words")
def _():
    eq(group_by_pattern([]), [])
    eq(group_by_pattern(["", ""]), [["", ""]])

@test("doesn't modify the input")
def _():
    words = ["egg", "add"]
    group_by_pattern(words)
    eq(words, ["egg", "add"])

@test("20,000 words in 2,795 groups, without comparing pairs")
def _():
    words = ["".join("abcd"[(i * 7 % 65_536) // 4 ** p % 4] for p in range(8)) for i in range(20_000)]
    groups = group_by_pattern(words)
    eq(len(groups), 2795)
    eq(sum(len(g) ** 2 for g in groups), 153_918, "the groups have the wrong sizes")
    eq([g[0] for g in groups[:4]], ["aaaaaaaa", "dbaaaaaa", "bbbaaaaa", "adbaaaaa"])
```

```hint
Build a key that's the same for every word with the same pattern: number each letter by when it first appears, so `"egg"` and `"too"` both become `(0, 1, 1)`.
```

```hint
With a fresh dict per word, `first_seen.setdefault(ch, len(first_seen))` returns a letter's existing number, or gives a new letter the next one. Collect the numbers in a `tuple`, because a list can't be a dict key.
```

```hint
Group with `defaultdict(list)`. Dicts keep insertion order, so `list(groups.values())` is already ordered by first appearance.
```
:::

:::challenge id=algo-longest-consecutive title="Longest consecutive run" difficulty=medium
Write `longest_consecutive(nums)` that returns the length of the longest run of consecutive integers that appear in `nums`. The numbers are in any order, and duplicates count once.

```text
longest_consecutive([100, 4, 200, 1, 3, 2])           ->  4    1, 2, 3, 4
longest_consecutive([0, 3, 7, 2, 5, 8, 4, 6, 0, 1])   ->  9    0 through 8
```

It must run in O(n), so no sorting: use a set and start counting only where a run begins.

```js
function longestConsecutive(nums) {
  let best = 0;
  for (const x of nums) {
    let length = 1;
    while (nums.includes(x + length)) length++;    // O(n) per step
    best = Math.max(best, length);
  }
  return best;
}
```

```python starter
def longest_consecutive(nums):
    ...
```

```python solution
def longest_consecutive(nums):
    values = set(nums)
    best = 0
    for x in values:
        if x - 1 in values:
            continue                   # not the start of a run
        end = x
        while end + 1 in values:
            end += 1
        best = max(best, end - x + 1)
    return best
```

```python tests
@test("examples")
def _():
    eq(longest_consecutive([100, 4, 200, 1, 3, 2]), 4)
    eq(longest_consecutive([0, 3, 7, 2, 5, 8, 4, 6, 0, 1]), 9)

@test("duplicates count once")
def _():
    eq(longest_consecutive([1, 2, 2, 3]), 3)
    eq(longest_consecutive([5, 5, 5]), 1)

@test("negative numbers")
def _():
    eq(longest_consecutive([-1, -3, -2, 5]), 3)
    eq(longest_consecutive([0, -1]), 2)

@test("no consecutive pairs")
def _():
    eq(longest_consecutive([10, 30, 20]), 1)

@test("one number, or none")
def _():
    eq(longest_consecutive([7]), 1)
    eq(longest_consecutive([]), 0)

@test("doesn't modify the input")
def _():
    nums = [3, 1, 2]
    longest_consecutive(nums)
    eq(nums, [3, 1, 2])

@test("one shuffled run of 200,003 numbers (O(n))")
def _():
    nums = [(i * 7919) % 200_003 for i in range(200_003)]    # 0..200,002 in a scrambled order
    eq(longest_consecutive(nums), 200_003)

@test("no sorting")
def _():
    forbids_call("sorted", "sorting is O(n log n): use a set instead")
    forbids_call("sort", "sorting is O(n log n): use a set instead")
```

```hint
Put the numbers in a set, so `x + 1 in values` is an O(1) check.
```

```hint
A number starts a run exactly when `x - 1` isn't in the set. From each start, walk up while `end + 1` is in the set, and measure the run.
```

```hint
Loop over the set rather than the list, so duplicates don't repeat the work. Each number is then walked over at most once.
```
:::

:::challenge id=algo-max-points-on-line title="Most points on a line" difficulty=hard
Write `max_points_on_line(points)` that takes a list of `(x, y)` integer points and returns the largest number of them that lie on one straight line. Points can repeat, and every copy counts.

```text
max_points_on_line([(1, 1), (2, 2), (3, 3)])                           ->  3
max_points_on_line([(1, 1), (3, 2), (5, 3), (4, 1), (2, 3), (1, 4)])   ->  4
```

Aim for O(n²): for each anchor point, group the other points by their direction from the anchor. The hard part is the key. A float slope like `dy / dx` fails on vertical lines and can merge two different slopes that differ by less than float precision. Use an exact, canonical key instead.

```js
function maxPointsOnLine(points) {
  let best = 0;
  for (const [x1, y1] of points) {
    const slopes = new Map();
    let same = 0;
    for (const [x2, y2] of points) {
      if (x1 === x2 && y1 === y2) { same++; continue; }
      const key = x1 === x2 ? "vertical" : String((y2 - y1) / (x2 - x1));   // float keys!
      slopes.set(key, (slopes.get(key) ?? 0) + 1);
    }
    best = Math.max(best, same + Math.max(0, ...slopes.values()));
  }
  return best;
}
```

```python starter
from collections import Counter
from math import gcd


def max_points_on_line(points):
    ...
```

```python solution
from collections import Counter
from math import gcd


def max_points_on_line(points):
    best = 0
    for i, (x1, y1) in enumerate(points):
        directions = Counter()
        same = 1                                  # the anchor itself
        for x2, y2 in points[i + 1:]:
            dx, dy = x2 - x1, y2 - y1
            if dx == dy == 0:
                same += 1
                continue
            g = gcd(dx, dy)                       # never negative
            dx, dy = dx // g, dy // g
            if dx < 0 or (dx == 0 and dy < 0):    # one sign per line
                dx, dy = -dx, -dy
            directions[dx, dy] += 1
        best = max(best, same + max(directions.values(), default=0))
    return best
```

```python tests
@test("examples")
def _():
    eq(max_points_on_line([(1, 1), (2, 2), (3, 3)]), 3)
    eq(max_points_on_line([(1, 1), (3, 2), (5, 3), (4, 1), (2, 3), (1, 4)]), 4)

@test("no points, or one")
def _():
    eq(max_points_on_line([]), 0)
    eq(max_points_on_line([(0, 0)]), 1)

@test("any two points make a line")
def _():
    eq(max_points_on_line([(0, 0), (5, -2)]), 2)

@test("repeated points all count")
def _():
    eq(max_points_on_line([(1, 1), (1, 1), (2, 2)]), 3)
    eq(max_points_on_line([(3, 3), (3, 3), (3, 3)]), 3)
    eq(max_points_on_line([(0, 0), (1, 1), (0, 0), (5, 9)]), 3)

@test("vertical and horizontal lines")
def _():
    eq(max_points_on_line([(2, 1), (2, 5), (2, -3), (4, 4)]), 3)
    eq(max_points_on_line([(0, 7), (5, 7), (-2, 7), (1, 1)]), 3)

@test("opposite directions are the same line")
def _():
    eq(max_points_on_line([(0, 0), (2, 2), (-3, -3), (1, 5)]), 3)

@test("negative slopes")
def _():
    eq(max_points_on_line([(0, 0), (1, -1), (2, -2), (3, 3)]), 3)

@test("slopes are compared exactly, not as floats")
def _():
    # 94911150 / 94911151 == 94911151 / 94911152 in floating point
    eq(max_points_on_line([(0, 0), (94_911_151, 94_911_150), (94_911_152, 94_911_151)]), 2)

@test("600 points (O(n²), not O(n³))")
def _():
    points = [(x, 2 * x + 1) for x in range(0, 400, 2)]     # 200 on y = 2x + 1
    points += [(x, 1000 - x) for x in range(150)]           # 150 on y = 1000 - x
    points += [(7, y) for y in range(2000, 2150)]           # 150 on x = 7
    points += [(x, x * x) for x in range(-50, 50)]          # 100 on a parabola
    eq(max_points_on_line(points), 200)
```

```hint
Fix an anchor point and count the other points by their direction from it: points on the same line through the anchor share a direction. Do that for every anchor and keep the best count, plus the anchor's duplicates.
```

```hint
Make the direction an exact, hashable key: divide `(dx, dy)` by `math.gcd(dx, dy)`, then flip both signs when `dx < 0` (or when `dx == 0` and `dy < 0`), so `(2, 4)` and `(-1, -2)` both become `(1, 2)`. Tuples work directly as `Counter` keys.
```

```hint
Copies of the anchor have no direction at all. Count them separately and add them to the best direction's count. `max(directions.values(), default=0)` covers an anchor with nothing else around it.
```
:::
