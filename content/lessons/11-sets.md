---
title: Sets
part: Collections
summary: Set literals, the {} trap, operators for union and intersection, frozenset, and order-preserving dedupes.
minutes: 20
---

Python's `set` is JavaScript's `Set` with better ergonomics: a literal syntax, equality that compares contents, and operators for the set algebra that ES2025 added as methods (`a | b` instead of `a.union(b)`). Two differences matter. A Python set has **no defined order**, while a JS `Set` iterates in insertion order. And its members must be **hashable**, which rules out lists and dicts but lets tuples compare by value.

## Creating sets

:::compare
```js
const tags = new Set(["python", "js"]);
const empty = new Set();
const letters = new Set("hello");     // "h", "e", "l", "o"
tags.size;                            // 2
tags instanceof Set;                  // true
```
```python
tags = {"python", "js"}
empty = set()                         # {} is an empty dict!
letters = set("hello")                # "h", "e", "l", "o"
len(tags)                             # 2
isinstance(tags, set)                 # True
```
:::

Curly braces around bare values make a set; curly braces around `key: value` pairs make a dict. Empty braces had to mean one of them, and dicts got there first, so the empty set is spelled `set()`. `set(iterable)` builds a set from anything iterable, dropping duplicates on the way in.

```python run
print(type({}), type({1}), type(set()))

langs = set(["python", "js", "python"])
print(len(langs), "python" in langs)
print(sorted(set("mississippi")))
```

:::quiz output
What happens?

```python
seen = {}
seen.add("ada")
print(seen)
```

- [ ] `{'ada'}`
- [x] `AttributeError`
- [ ] `TypeError`
- [ ] `{'ada': None}`

`{}` is an empty **dict**, and dicts have no `add` method: `AttributeError: 'dict' object has no attribute 'add'`. Start an empty set with `set()`.
:::

## Members must be hashable

:::compare
```js
const points = new Set([[0, 0], [0, 0]]);
points.size;                      // 2: arrays compare by identity
points.has([0, 0]);               // false
new Set([1, true]).size;          // 2
```
```python
points = {(0, 0), (0, 0)}
len(points)                       # 1: tuples compare by value
(0, 0) in points                  # True
len({1, True})                    # 1: 1 == True in Python
```
:::

A set is a hash table of members, with the same rules as dict keys (see [Dicts](lesson:dicts)): members must be hashable, and two values count as the same member when they're equal. So a set of tuples dedupes by contents, which a JS `Set` of arrays can't do, while lists, dicts and sets can't be members at all. For a set of sets, use `frozenset` (below).

```python run raises
visited = {(0, 0), (0, 1)}
visited.add((0, 0))                  # already there
print(len(visited), (0, 1) in visited)

visited.add([1, 1])                  # lists are unhashable
```

:::quiz output
What does this print?

```python
print(len({1, 1.0, True, "1"}))
```

- [ ] `4`
- [ ] `1`
- [x] `2`
- [ ] `TypeError`

`1`, `1.0` and `True` are equal (and hash alike), so they collapse into one member. The string `"1"` is a different value, so it stays: two members.
:::

:::deep NaN in a set
JavaScript's `Set` uses SameValueZero, so `NaN` matches `NaN`. Python checks identity before equality, so the *same* NaN object is found again, but two separately created NaNs are two members, because `float("nan") != float("nan")`. `len({float("nan"), float("nan")})` is `2`, while `x = float("nan")` gives `len({x, x}) == 1`.
:::

## No insertion order

:::compare
```js
const s = new Set([3, 1, 2]);
[...s];                     // [3, 1, 2]: insertion order, guaranteed
```
```python
s = {3, 1, 2}
list(s)                     # [1, 2, 3] here, but nothing is promised
```
:::

A JS `Set` remembers insertion order. A Python set doesn't: iteration order falls out of the hash table layout. Small integers often come out sorted, by coincidence, and the order of strings changes from one Python process to the next, because string hashing is randomized per process. Never rely on it. Sort when you display a set, and use a dict when you need a de-duplicated collection that keeps its order (the idiom is coming up below).

```python run
print({3, 1, 2})                    # looks sorted...
print({1, 2, 32})                   # ...until it doesn't
print({"kiwi", "apple", "mango"})   # varies between Python processes
print(sorted({"kiwi", "apple", "mango"}))   # deterministic
```

:::gotcha No indexing and no "first"
Sets aren't sequences: `s[0]` raises `TypeError`, and there's no first or last member. `s.pop()` removes and returns an *arbitrary* one. To peek at some member without removing it, use `next(iter(s))`.
:::

## Adding and removing

:::compare
```js
const s = new Set(["a"]);
s.add("b");                 // returns s, so calls chain
s.delete("b");              // true
s.delete("zzz");            // false, no error
for (const x of ["c", "d"]) s.add(x);
s.clear();
```
```python
s = {"a"}
s.add("b")                  # returns None
s.remove("b")               # KeyError if missing
s.discard("zzz")            # no error if missing
s.update(["c", "d"])        # add many at once
s.clear()
```
:::

`remove` is strict and `discard` is lenient, so pick by whether a missing member is a bug. `pop()` takes an arbitrary member out (and raises `KeyError` on an empty set). Like list methods, these all mutate in place and return `None`, so they don't chain. And as with dicts, changing a set's size while you iterate over it raises `RuntimeError`, so loop over `s.copy()` or build a new set with a comprehension.

:::quiz output
What does this print?

```python
tags = {"python"}
tags.update("js")
print(len(tags))
```

- [ ] `2`
- [x] `3`
- [ ] `1`
- [ ] `TypeError`

`update` iterates its argument, and a string iterates as characters, so it adds `"j"` and `"s"`. Use `tags.add("js")` for one member, or `tags.update(["js"])`. It's the `append` vs `extend` trap from [Lists](lesson:lists#adding-and-removing-push-pop-shift-unshift-splice) again.
:::

## Fast membership

:::compare
```js
const banned = ["spam", "scam", "phish"];
banned.includes(word);          // scans the array

const bannedSet = new Set(banned);
bannedSet.has(word);            // hash lookup
```
```python
banned = ["spam", "scam", "phish"]
word in banned                  # scans the list: O(n)

banned_set = set(banned)
word in banned_set              # hash lookup: O(1) on average
```
:::

`in` on a set hashes the value and jumps straight to its slot, so it takes constant time on average, however big the set. `in` on a list compares against every element until it finds a match. When you test membership inside a loop, convert the list to a set once, outside the loop.

```python run
from timeit import timeit

ids = list(range(100_000))
id_set = set(ids)

list_time = timeit(lambda: 99_999 in ids, number=200)
set_time = timeit(lambda: 99_999 in id_set, number=200)
print(f"list: {list_time * 1000:.2f} ms")
print(f"set:  {set_time * 1000:.2f} ms")
```

:::tip Dict keys are just as fast
`key in d` and `key in d.keys()` are hash lookups too. `value in d.values()` is a linear scan, like a list.
:::

## Set algebra: operators and methods

:::compare
```js
a.union(b);                       // ES2025
a.intersection(b);
a.difference(b);
a.symmetricDifference(b);
a.isSubsetOf(b);
a.isSupersetOf(b);
a.isDisjointFrom(b);
a.size < b.size && a.isSubsetOf(b);
```
```python
a | b                             # or a.union(b)
a & b                             # or a.intersection(b)
a - b                             # or a.difference(b)
a ^ b                             # or a.symmetric_difference(b)
a <= b                            # or a.issubset(b)
a >= b                            # or a.issuperset(b)
a.isdisjoint(b)                   # no operator for this one
a < b                             # proper subset
```
:::

ES2025 finally gave JavaScript sets these operations as methods. Python has had them for decades, as operators *and* as methods, and there's a difference between the two forms. The **operators** require both operands to be sets (or frozensets). The **methods** accept any iterable, so `a.union(some_list)` works without converting first, and `union`, `intersection` and `difference` take several arguments at once. JavaScript's methods are pickier: they need a set-like argument with `size`, `has` and `keys`, so passing an array throws a `TypeError`.

`==` compares contents, regardless of order. JavaScript has no built-in set equality; the usual workaround is `a.size === b.size && a.isSubsetOf(b)`.

```python run raises
backend = {"python", "sql", "docker"}
frontend = {"js", "css", "docker"}

print(sorted(backend | frontend))      # in either
print(sorted(backend & frontend))      # in both
print(sorted(backend - frontend))      # backend only
print(sorted(backend ^ frontend))      # in exactly one

print(backend.issuperset(["python", "sql"]))   # methods take any iterable
print(backend.isdisjoint(["go", "rust"]))
print(backend | ["go"])                        # operators want two sets
```

:::gotcha `<` on sets isn't an ordering
`<=` and `<` mean subset and proper subset, which only orders *some* pairs of sets. For `{1}` and `{2}`, `a < b`, `b < a` and `a == b` are all `False`. So `sorted()`, `min()` and `max()` over a list of sets don't give you anything meaningful.
:::

:::quiz output
What does this print?

```python
print({1, 2} < {1, 2, 3}, {3} < {1, 2})
```

- [x] `True False`
- [ ] `True True`
- [ ] `False False`
- [ ] `TypeError`

`{1, 2}` is a proper subset of `{1, 2, 3}`. `{3}` is smaller than `{1, 2}` by size, but it isn't a subset, so `<` is `False`.
:::

### Updating in place

:::compare
```js
for (const user of newcomers) online.add(user);
for (const user of banned) online.delete(user);
online = online.intersection(allowed);   // new set, rebind
```
```python
online |= newcomers               # or online.update(newcomers)
online -= banned                  # or online.difference_update(banned)
online &= allowed                 # or online.intersection_update(allowed)
```
:::

Each operator has an augmented form (`|=`, `&=`, `-=`, `^=`) that modifies the set **in place**, plus a method twin (`update`, `intersection_update`, `difference_update`, `symmetric_difference_update`) that accepts any iterable. In place means every other name for that set sees the change, while `a = a | b` builds a new set and rebinds only `a`.

```python run
online = {"ada", "grace"}
everyone = online                 # a second name for the same set

online |= {"linus"}               # in place
print(sorted(everyone))           # sees linus

online = online - {"ada"}         # a new set; only online is rebound
print(sorted(online), sorted(everyone))
```

:::tip Combine a whole list of sets
`set.intersection(*groups)` and `set().union(*groups)` combine any number of sets in one call. The first needs at least one set, and raises `TypeError` for an empty list, while `set().union(*groups)` safely returns an empty set.
:::

## Set comprehensions and frozenset

:::compare
```js
const domains = new Set(emails.map((e) => e.split("@")[1]));

const pair = Object.freeze(new Set(["ada", "bob"]));
pair.add("cy");                   // works: freeze can't reach Set internals
```
```python
domains = {e.split("@")[1] for e in emails}

pair = frozenset({"ada", "bob"})
pair.add("cy")                    # AttributeError: frozensets are immutable
```
:::

A **set comprehension** is a list comprehension in curly braces, and it dedupes as it goes. The syntax lives in [Comprehensions](lesson:map-filter-reduce).

`frozenset` is the immutable set: no `add` or `remove`, but every non-mutating operation works, and it's **hashable**. That's what lets a set be a dict key or a member of another set. A neat use is an unordered pair as a key, since `frozenset({"ada", "bob"})` and `frozenset({"bob", "ada"})` are the same key. A frozenset equals a set with the same members, and operators return the type of the left operand.

```python run
emails = ["ada@example.com", "grace@example.org", "alan@example.com"]
print(sorted({e.split("@")[1] for e in emails}))

meetings = {}
for a, b in [("ada", "bob"), ("bob", "ada"), ("ada", "cy")]:
    pair = frozenset((a, b))           # order doesn't matter
    meetings[pair] = meetings.get(pair, 0) + 1
print(len(meetings), meetings[frozenset(("ada", "bob"))])

print(frozenset({1, 2}) == {1, 2}, type(frozenset({1}) | {2}).__name__)
```

## Dedupe, keeping order

:::compare
```js
const unique = [...new Set(visits)];          // keeps first-seen order
const alphabetical = [...new Set(visits)].sort();
```
```python
unique = list(dict.fromkeys(visits))          # keeps first-seen order
alphabetical = sorted(set(visits))
```
:::

`[...new Set(xs)]` is the JavaScript dedupe idiom because JS sets remember insertion order. Its literal translation, `list(set(xs))`, dedupes but scrambles the order. Dicts *do* keep insertion order, so `dict.fromkeys(xs)`, a dict whose keys are the items of `xs` (all with the value `None`), is the order-preserving dedupe. If you want the result sorted anyway, `sorted(set(xs))` is simplest.

```python run
visits = ["home", "pricing", "home", "docs", "pricing", "home"]
print(list(dict.fromkeys(visits)))   # first-seen order
print(sorted(set(visits)))           # alphabetical
print(list(set(visits)))             # some order: don't rely on it
```

## "Seen" sets in loops

:::compare
```js
const seen = new Set();
const unique = [];
for (const user of users) {
  const key = user.email.toLowerCase();
  if (seen.has(key)) continue;
  seen.add(key);
  unique.push(user);
}
```
```python
seen = set()
unique = []
for user in users:
    key = user["email"].lower()
    if key in seen:
        continue
    seen.add(key)
    unique.append(user)
```
:::

When the dedupe key isn't the item itself (emails compared case-insensitively, records by id), or when you need to stop at the first repeat, keep a `seen` set next to the loop. The pattern is identical to JavaScript's, with `in` and `add`. It's also how graph traversals avoid visiting a node twice:

```python run
from collections import deque

links = {"home": ["docs", "blog"], "docs": ["api", "home"], "blog": ["home"], "api": []}

def reachable(start):
    seen = {start}
    queue = deque([start])
    while queue:
        page = queue.popleft()
        for nxt in links[page]:
            if nxt not in seen:
                seen.add(nxt)
                queue.append(nxt)
    return seen

print(sorted(reachable("blog")))
```

:::pythonic Let a set answer "any duplicates?"
`len(set(xs)) != len(xs)` checks a list of hashable items for duplicates in one line. Keep the explicit `seen` loop for when you need to know *which* item repeats, or want to stop early.
:::

## Cheat sheet

| JavaScript | Python | Notes |
| --- | --- | --- |
| `new Set([1, 2])` | `{1, 2}` | |
| `new Set()` | `set()` | `{}` is a dict |
| `new Set(iterable)` | `set(iterable)` | |
| `s.size` | `len(s)` | |
| `s.has(x)` | `x in s` | O(1) on average |
| `s.add(x)` | `s.add(x)` | returns `None` |
| `s.delete(x)` | `s.discard(x)` | `s.remove(x)` raises `KeyError` |
| `a.union(b)` | `a \| b` | `a.union(iterable)` takes any iterable |
| `a.intersection(b)` | `a & b` | |
| `a.difference(b)` | `a - b` | |
| `a.symmetricDifference(b)` | `a ^ b` | |
| `a.isSubsetOf(b)` | `a <= b` | `a < b` for a proper subset |
| `a.isSupersetOf(b)` | `a >= b` | |
| `a.isDisjointFrom(b)` | `a.isdisjoint(b)` | |
| `a.size === b.size && a.isSubsetOf(b)` | `a == b` | |
| `[...new Set(xs)]` | `list(dict.fromkeys(xs))` | keeps first-seen order |
| `[...s].sort()` | `sorted(s)` | sets have no order |
| a `Set` of `"x,y"` strings | a set of `(x, y)` tuples | members compare by value |
| `Object.freeze(s)` | `frozenset(s)` | truly immutable, hashable |

## Challenges

:::challenge id=set-first-repeat title="First repeat" difficulty=easy
Write `first_repeat(items)` that scans `items` from left to right and returns the first item seen for the **second** time, or `None` if every item is unique. `items` can be any iterable.

```text
first_repeat(["a", "b", "c", "b", "a"])  ->  "b"
first_repeat([3, 1, 4, 1, 5, 3])         ->  1
first_repeat([1, 2, 3])                  ->  None
```

Keep the items you've seen in a set, so the function stays fast on long inputs. No `count()` or `index()`.

```js
function firstRepeat(items) {
  const seen = new Set();
  for (const item of items) {
    if (seen.has(item)) return item;
    seen.add(item);
  }
  return null;
}
```

```python starter
def first_repeat(items):
    ...
```

```python solution
def first_repeat(items):
    seen = set()
    for item in items:
        if item in seen:
            return item
        seen.add(item)
    return None
```

```python tests
@test("finds the first item to repeat")
def _():
    eq(first_repeat(["a", "b", "c", "b", "a"]), "b")

@test("it's the second occurrence that counts, not the first")
def _():
    eq(first_repeat([3, 1, 4, 1, 5, 3]), 1)

@test("returns None when everything is unique")
def _():
    eq(first_repeat([1, 2, 3]), None)
    eq(first_repeat([]), None)

@test("falsy repeats are still repeats")
def _():
    eq(first_repeat([0, 1, 0]), 0)
    eq(first_repeat(["", "x", ""]), "")

@test("works with any iterable, even a generator")
def _():
    eq(first_repeat(n % 4 for n in range(10)), 0)

@test("keeps a set of seen items")
def _():
    forbids_call("count", "count() rescans the list for every item")
    forbids_call("index", "index() rescans the list for every item")
    requires_call("set", "start with seen = set()")
```

```hint
Walk the items once. Before adding an item to `seen`, check whether it's already in there.
```

```hint
`return item` as soon as `item in seen` is true. If the loop finishes, nothing repeated, so return `None`.
```
:::

:::challenge id=set-tag-filter title="Filter by tags" difficulty=medium
Write `matching_titles(posts, required, excluded)`. Each post is a dict with a `"title"` and a set of `"tags"`. Return the titles of the posts that have **every** tag in `required` and **none** of the tags in `excluded`, in their original order. `required` and `excluded` can be any iterables, including one-shot generators.

```text
posts = [
    {"title": "Intro to sets", "tags": {"python", "beginner"}},
    {"title": "Async deep dive", "tags": {"python", "async", "advanced"}},
    {"title": "CSS grids", "tags": {"css", "beginner"}},
]
matching_titles(posts, ["python"], ["advanced"])  ->  ["Intro to sets"]
matching_titles(posts, [], ["python"])            ->  ["CSS grids"]
```

Let set operations do the work instead of `all(...)` or `any(...)` over the tags.

```js
function matchingTitles(posts, required, excluded) {
  const req = new Set(required);
  const exc = new Set(excluded);
  return posts
    .filter((p) => req.isSubsetOf(p.tags) && p.tags.isDisjointFrom(exc))
    .map((p) => p.title);
}
```

```python starter
def matching_titles(posts, required, excluded):
    ...
```

```python solution
def matching_titles(posts, required, excluded):
    required, excluded = set(required), set(excluded)
    return [
        post["title"]
        for post in posts
        if required <= post["tags"] and post["tags"].isdisjoint(excluded)
    ]
```

```python tests
POSTS = [
    {"title": "Intro to sets", "tags": {"python", "beginner"}},
    {"title": "Async deep dive", "tags": {"python", "async", "advanced"}},
    {"title": "CSS grids", "tags": {"css", "beginner"}},
    {"title": "Typing tricks", "tags": {"python", "advanced"}},
]

@test("requires every listed tag")
def _():
    eq(matching_titles(POSTS, ["python", "advanced"], []), ["Async deep dive", "Typing tricks"])

@test("drops posts with any excluded tag")
def _():
    eq(matching_titles(POSTS, ["python"], ["advanced"]), ["Intro to sets"])
    eq(matching_titles(POSTS, [], ["async", "css"]), ["Intro to sets", "Typing tricks"])

@test("no requirements and no exclusions keeps every post")
def _():
    eq(matching_titles(POSTS, [], []), [p["title"] for p in POSTS])

@test("accepts sets and tuples")
def _():
    eq(matching_titles(POSTS, {"beginner"}, ("css",)), ["Intro to sets"])

@test("accepts one-shot generators")
def _():
    required = (tag for tag in ["advanced"])
    excluded = (tag for tag in ["async"])
    eq(matching_titles(POSTS, required, excluded), ["Typing tricks"])

@test("keeps the original order")
def _():
    eq(matching_titles(POSTS[::-1], ["python"], []), ["Typing tricks", "Async deep dive", "Intro to sets"])

@test("lets set operations do the looping")
def _():
    forbids_call("all", "a subset test replaces all(tag in tags for tag in required)")
    forbids_call("any", "isdisjoint() replaces any(tag in tags for tag in excluded)")
```

```hint
`set(required) <= post["tags"]` asks "does this post have every required tag?", and `post["tags"].isdisjoint(excluded)` asks "does it have none of the excluded ones?"
```

```hint
A generator can only be consumed once, so the second post would see an empty `required`. Convert `required` and `excluded` to sets once, before the loop. It's faster too: each tag is hashed once instead of once per post.
```
:::

:::challenge id=set-life-step title="Game of Life on a set" difficulty=hard
Conway's Game of Life fits naturally in a set of live `(row, col)` cells on an unbounded grid. Write `step(live)` that returns the **next generation** as a new set:

- a live cell with 2 or 3 live neighbours stays alive,
- a dead cell with exactly 3 live neighbours comes alive,
- every other cell is dead.

Each cell has 8 neighbours (horizontal, vertical and diagonal). Don't modify the input set.

```text
step({(1, 0), (1, 1), (1, 2)})  ->  {(0, 1), (1, 1), (2, 1)}     # a blinker flips
```

```js
// JS needs "r,c" string keys, because arrays in a Set compare by identity
function step(live) {
  const counts = new Map();
  for (const cell of live) {
    const [r, c] = cell.split(",").map(Number);
    for (const dr of [-1, 0, 1])
      for (const dc of [-1, 0, 1])
        if (dr || dc) {
          const key = `${r + dr},${c + dc}`;
          counts.set(key, (counts.get(key) ?? 0) + 1);
        }
  }
  const alive = ([key, n]) => n === 3 || (n === 2 && live.has(key));
  return new Set([...counts].filter(alive).map(([key]) => key));
}
```

```python starter
def step(live):
    ...
```

```python solution
def neighbours(cell):
    row, col = cell
    return {
        (row + dr, col + dc)
        for dr in (-1, 0, 1)
        for dc in (-1, 0, 1)
        if (dr, dc) != (0, 0)
    }


def step(live):
    candidates = live.union(*(neighbours(cell) for cell in live))
    next_gen = set()
    for cell in candidates:
        count = len(neighbours(cell) & live)
        if count == 3 or (count == 2 and cell in live):
            next_gen.add(cell)
    return next_gen
```

```python tests
BLINKER_H = {(1, 0), (1, 1), (1, 2)}
BLINKER_V = {(0, 1), (1, 1), (2, 1)}
BLOCK = {(0, 0), (0, 1), (1, 0), (1, 1)}

@test("a blinker flips between horizontal and vertical")
def _():
    eq(step(BLINKER_H), BLINKER_V)
    eq(step(BLINKER_V), BLINKER_H)

@test("a block is stable")
def _():
    eq(step(BLOCK), BLOCK)

@test("a lone cell dies")
def _():
    eq(step({(5, 5)}), set())

@test("three cells in an L give birth to a fourth")
def _():
    eq(step({(0, 0), (0, 1), (1, 0)}), BLOCK)

@test("overcrowded cells die")
def _():
    plus = {(1, 1), (0, 1), (2, 1), (1, 0), (1, 2)}
    check((1, 1) not in step(plus), "the centre has 4 live neighbours, so it should die")

@test("negative coordinates work")
def _():
    eq(step({(-1, -5), (-1, -4), (-1, -3)}), {(-2, -4), (-1, -4), (0, -4)})

@test("an empty board stays empty")
def _():
    eq(step(set()), set())

@test("returns a new set and leaves the input alone")
def _():
    live = set(BLINKER_H)
    result = step(live)
    eq(live, BLINKER_H, "the input set was modified")
    check(result is not live, "return a new set")

@test("a glider moves one cell diagonally every 4 steps")
def _():
    glider = {(0, 1), (1, 2), (2, 0), (2, 1), (2, 2)}
    cells = glider
    for _ in range(4):
        cells = step(cells)
    eq(cells, {(r + 1, c + 1) for r, c in glider})
```

```hint
Write a helper `neighbours(cell)` that unpacks `row, col = cell` and returns the set of the 8 surrounding `(row, col)` tuples.
```

```hint
Only live cells and their neighbours can be alive next turn. `live.union(*(neighbours(c) for c in live))` gathers every candidate.
```

```hint
For each candidate, `len(neighbours(cell) & live)` counts its live neighbours. Then apply the two rules.
```
:::
