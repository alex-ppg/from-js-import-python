---
title: map, filter, reduce → Comprehensions
part: Collections
summary: Rewrite .map().filter().reduce() chains as comprehensions, generator expressions and named reducers.
minutes: 40
---

JavaScript hangs its collection toolkit on `Array.prototype`: `map`, `filter`, `reduce`, `find`, `some`, `flatMap`, chained one step at a time. Python moves most of it into **syntax**. A comprehension maps and filters in one expression, a generator expression does the same lazily, and the usual `reduce` jobs go to small built-ins (`sum`, `max`, `any`, `"".join`, `Counter`) that accept any iterable.

So the question changes from "which method do I chain next?" to "what should the result contain?". `map()`, `filter()` and `functools.reduce()` all exist, but a Python reviewer expects a comprehension first.

## map and filter → list comprehensions

:::compare
```js
const nums = [1, 2, 3, 4, 5, 6];

nums.map((n) => n * n);              // [1, 4, 9, 16, 25, 36]
nums.filter((n) => n % 2 === 0);     // [2, 4, 6]
nums.filter((n) => n % 2 === 0)
    .map((n) => n * n);              // [4, 16, 36]
```
```python
nums = [1, 2, 3, 4, 5, 6]

[n * n for n in nums]                # [1, 4, 9, 16, 25, 36]
[n for n in nums if n % 2 == 0]      # [2, 4, 6]
[n * n for n in nums if n % 2 == 0]  # [4, 16, 36]
```
:::

A **list comprehension** is `[expression for name in iterable if condition]`. Read it like SQL: what you select, where it comes from, then the filter. Both parts can be any expression, the result is always a new list, and the source can be anything iterable: a list, a string, a dict (its keys), a `range`, a file (its lines) or a generator.

The `if` runs first, and the expression only runs for the items that pass. So the last line is `.filter().map()`, in a single pass with no intermediate array.

```python run
orders = [
    {"id": 1, "total": 120, "status": "paid"},
    {"id": 2, "total": 35, "status": "refunded"},
    {"id": 3, "total": 80, "status": "paid"},
]
print([o["id"] for o in orders])
print([o["total"] for o in orders if o["status"] == "paid"])
print([f"#{o['id']}: ${o['total']}" for o in orders])
```

:::gotcha `.map().filter()` needs a different shape
Because the `if` tests the **source item**, `[f(x) for x in xs if p(x)]` is `.filter(p).map(f)`. To filter on the *transformed* value, as in `raw.map(parse).filter((n) => n !== null)`, compute it first: feed one generator into another, `[n for n in (parse(s) for s in raw) if n is not None]`, or use [the walrus](lesson:map-filter-reduce#the-walrus-compute-once-use-twice).
:::

### `if` at the end filters, `if`/`else` in front transforms

:::compare
```js
const scores = [72, -1, 90, -5];

scores.filter((s) => s >= 0);          // [72, 90]
scores.map((s) => (s >= 0 ? s : 0));   // [72, 0, 90, 0]
```
```python
scores = [72, -1, 90, -5]

[s for s in scores if s >= 0]          # [72, 90]
[s if s >= 0 else 0 for s in scores]   # [72, 0, 90, 0]
```
:::

Two different `if`s. The trailing one belongs to the comprehension and **drops** items. The `if`/`else` in front is Python's conditional expression (`a if condition else b`), and it **transforms** every item. A filter can't take an `else`, so `[s for s in scores if s >= 0 else 0]` is a `SyntaxError`.

:::quiz output
What does this print?

```python
temps = [21, -3, 0, 15]
print([t if t > 0 else 0 for t in temps if t != 15])
```

- [ ] `[21, 0, 0, 15]`
- [x] `[21, 0, 0]`
- [ ] `[21]`
- [ ] `SyntaxError`

The trailing `if` drops `15` first. The conditional expression then runs on the three survivors and turns `-3` into `0`. Both kinds of `if` can share one comprehension.
:::

## Generator expressions: lazy comprehensions

:::compare
```js
const nums = [3, 4, 5];

// Builds a temporary array, then reduces it
nums.map((n) => n * n).reduce((a, b) => a + b, 0);  // 50

// ES2025 iterator helpers are lazy
const squares = nums.values().map((n) => n * n);
```
```python
nums = [3, 4, 5]

# No temporary list: the values stream into sum()
sum(n * n for n in nums)                            # 50

# Round brackets make a lazy generator
squares = (n * n for n in nums)
```
:::

Swap the square brackets for round ones and you get a **generator expression**: the same syntax, but lazy. It produces one value each time something asks for the next and never builds a list, so a million-line log file costs no more memory than a short one. As the only argument to a call, it can share the call's parentheses: `sum(n * n for n in nums)`.

Like a JS iterator, a generator is single-use ([Iterators & Generators](lesson:iterators-and-generators) has the machinery). The rule of thumb: `[...]` when you need a real list (to index it, call `len()`, loop over it twice or return it), and `(...)` when the values flow straight into a consumer such as `sum`, `max`, `any`, `sorted`, `"".join` or `set()`.

```python run
squares = (n * n for n in [1, 2, 3])
print(squares)            # a generator object: nothing computed yet
print(next(squares))      # pull one value: 1
print(list(squares))      # drain the rest: [4, 9]
print(list(squares))      # already exhausted: []
```

:::quiz output
What does this print?

```python
squares = (n * n for n in [1, 2, 3])
print(sum(squares), sum(squares))
```

- [ ] `14 14`
- [x] `14 0`
- [ ] `14 None`
- [ ] `TypeError`

The first `sum` drains the generator. The second finds it empty, and the sum of nothing is `0`. If you need the values twice, build a list.
:::

:::gotcha A second argument needs its own parentheses
The parentheses can only be shared when the generator is the **sole** argument. `sorted(n * n for n in nums, reverse=True)` is a `SyntaxError: Generator expression must be parenthesized`. Write `sorted((n * n for n in nums), reverse=True)`.
:::

## The `map()` and `filter()` builtins

:::compare
```js
const raw = ["10", "20", "30"];

raw.map(Number);                         // [10, 20, 30]
raw.map((s) => `${s}px`);                // ["10px", "20px", "30px"]
[0, 1, "", "a", null].filter(Boolean);   // [1, "a"]
```
```python
raw = ["10", "20", "30"]

list(map(int, raw))                      # [10, 20, 30]
[f"{s}px" for s in raw]                  # ["10px", "20px", "30px"]
list(filter(None, [0, 1, "", "a", None]))  # [1, "a"]
```
:::

`map(function, iterable)` and `filter(predicate, iterable)` take the function first and return lazy, single-use iterators, not lists: `len()` and indexing raise `TypeError`, and a second pass sees nothing. Wrap them in `list()` when you need a list. `filter(None, xs)` keeps the truthy items, which makes it Python's `.filter(Boolean)` ([Truthiness & Equality](lesson:truthiness-and-equality) lists what counts as falsy).

Use `map` when a named function already exists: `map(int, parts)`, `map(str.strip, lines)`, `", ".join(map(str, ids))`. The moment you'd need a `lambda`, write the comprehension instead: `[n * 2 for n in nums]`, not `list(map(lambda n: n * 2, nums))`. A Python reviewer will ask for it.

```python run
nums = map(int, "3 14 15 92".split())
print(nums)                # a lazy map object, not a list
print(list(nums))          # [3, 14, 15, 92]
print(list(nums))          # []: already consumed
print(list(map(pow, [2, 3, 4], [3, 2])))   # several iterables, zipped: [8, 9]
```

:::note The callback gets the item, and nothing else
JS passes `(item, index, array)` to every callback, which is how `["1", "2", "3"].map(parseInt)` produces `[1, NaN, NaN]`. Python's `map` and `filter` pass only the item, so `list(map(int, ["1", "2", "3"]))` is `[1, 2, 3]`. When you want the index, ask for it with `enumerate`.
:::

## Dict and set comprehensions

:::compare
```js
const users = [{ id: 7, name: "Ada" }, { id: 9, name: "Linus" }];

const names = Object.fromEntries(users.map((u) => [u.id, u.name]));
const initials = new Set(users.map((u) => u.name[0]));

const prices = { tea: 4, cake: 12, pie: 9 };
const cheap = Object.fromEntries(
  Object.entries(prices).filter(([, p]) => p < 10));
```
```python
users = [{"id": 7, "name": "Ada"}, {"id": 9, "name": "Linus"}]

names = {u["id"]: u["name"] for u in users}
initials = {u["name"][0] for u in users}

prices = {"tea": 4, "cake": 12, "pie": 9}
cheap = {item: p for item, p in prices.items() if p < 10}

```
:::

Braces around `key: value` make a **dict comprehension**, and braces around a bare expression make a **set comprehension**. Iterating over `d.items()` yields `(key, value)` pairs that unpack into two names, which replaces the `Object.entries` → `filter` → `Object.fromEntries` round trip. Duplicate keys keep the last value, as in JS. One difference: `Object.fromEntries` turns the ids into strings, but dict keys keep their type, so `names[7]` works and `names["7"]` raises `KeyError` ([Dicts](lesson:dicts)).

```python run
prices = {"tea": 4, "cake": 12, "pie": 9}
print({item: round(p * 1.2, 2) for item, p in prices.items()})
print({p: item for item, p in prices.items()})             # invert
print(sorted({w.lower() for w in ["Tea", "tea", "TEA", "pie"]}))
```

:::gotcha No tuple comprehensions, and `{}` is a dict
`(x for x in xs)` is a generator expression, not a tuple: write `tuple(x for x in xs)`. And empty braces `{}` are an empty **dict**. An empty set is `set()` ([Sets](lesson:sets)).
:::

## `flat` and `flatMap` → multiple `for` clauses

:::compare
```js
const matrix = [[1, 2], [3, 4], [5]];
matrix.flat();                               // [1, 2, 3, 4, 5]

const orders = [{ items: ["tea", "pie"] }, { items: ["cake"] }];
orders.flatMap((o) => o.items);              // ["tea", "pie", "cake"]

[1, 2].flatMap((n) => [n, n * 10]);          // [1, 10, 2, 20]
```
```python
matrix = [[1, 2], [3, 4], [5]]
[n for row in matrix for n in row]           # [1, 2, 3, 4, 5]

orders = [{"items": ["tea", "pie"]}, {"items": ["cake"]}]
[item for o in orders for item in o["items"]]  # ["tea", "pie", "cake"]

[m for n in [1, 2] for m in (n, n * 10)]     # [1, 10, 2, 20]
```
:::

Multiple `for` clauses nest **left to right, in the order you'd write the loops**, and the expression in front is the body of the innermost one. When in doubt, write the loops out and move the body to the front:

```python
flat = []
for row in matrix:
    for n in row:
        flat.append(n)

flat = [n for row in matrix for n in row]   # same order, body moved to the front
```

:::gotcha The English order is the wrong order
`[n for n in row for row in matrix]` reads naturally and fails with `NameError: name 'row' is not defined`, because the first `for` runs first. It's worse if an earlier loop left a `row` variable behind: then it runs, and silently builds the wrong list.
:::

A comprehension *inside* the expression is a different thing: it builds one inner list per outer item, so the shape survives, like `matrix.map((row) => row.map(...))`.

```python run
matrix = [[1, 2], [3, 4]]
print([[n * 10 for n in row] for row in matrix])   # map inside map: keeps the rows
print([n * 10 for row in matrix for n in row])     # two for clauses: flattens
print([n for row in matrix if len(row) > 1 for n in row if n % 2])  # an if after any for
```

:::quiz output
What does this print?

```python
print([size + color for size in "SM" for color in "rb"])
```

- [ ] `['Sr', 'Mr', 'Sb', 'Mb']`
- [x] `['Sr', 'Sb', 'Mr', 'Mb']`
- [ ] `[['Sr', 'Sb'], ['Mr', 'Mb']]`
- [ ] `['SM', 'rb']`

The first `for` is the outer loop, so each size runs through every color before the next size starts. For the nested shape, put a comprehension inside the expression: `[[s + c for c in "rb"] for s in "SM"]`.
:::

:::tip Flattening without a comprehension
`itertools.chain.from_iterable(matrix)` flattens one level lazily. There's no built-in `flat(Infinity)`: for arbitrary nesting, write a small recursive generator with `yield from` ([Iterators & Generators](lesson:iterators-and-generators)).
:::

## `enumerate`, `zip` and the walrus

:::compare
```js
const names = ["Ada", "Linus", "Grace"];
names.map((n, i) => `${i + 1}. ${n}`);

const qty = [2, 1, 3];
const price = [4, 12, 9];
qty.map((q, i) => q * price[i]);         // [8, 12, 27]

const keys = ["host", "port"];
const values = ["localhost", 8080];
Object.fromEntries(keys.map((k, i) => [k, values[i]]));
```
```python
names = ["Ada", "Linus", "Grace"]
[f"{i}. {n}" for i, n in enumerate(names, start=1)]

qty = [2, 1, 3]
price = [4, 12, 9]
[q * p for q, p in zip(qty, price)]      # [8, 12, 27]

keys = ["host", "port"]
values = ["localhost", 8080]
dict(zip(keys, values))
```
:::

There's no free index. Ask for one with `enumerate(xs)`, which yields `(index, item)` pairs (`start=1` for human numbering), and walk sequences in step with `zip(a, b)` instead of indexing into the second. Both unpack right in the `for` clause, nested tuples included. `zip` stops at the shortest input; `strict=True` (3.10+) raises `ValueError` on a length mismatch instead. [Control Flow](lesson:control-flow) covers both in ordinary loops.

```python run
readings = [12, 15, 11, 18]
print([b - a for a, b in zip(readings, readings[1:])])   # neighbour differences
print([i for i, r in enumerate(readings) if r > 12])     # positions above 12

stock = {"tea": 0, "cake": 4, "pie": 0}
print([f"{i}: {name}" for i, (name, qty) in enumerate(stock.items()) if qty == 0])
```

`itertools.pairwise(readings)` (3.10+) yields the same neighbouring pairs without the slice.

### The walrus: compute once, use twice

:::compare
```js
const raw = ["42", "n/a", "0", ""];
const parse = (s) => (/^\d+$/.test(s) ? Number(s) : null);

raw.map(parse).filter((n) => n !== null);   // two passes
raw.flatMap((s) => {                        // or one, with a trick
  const n = parse(s);
  return n === null ? [] : [n];
});
```
```python
raw = ["42", "n/a", "0", ""]
def parse(s):
    return int(s) if s.isdigit() else None

# One pass: bind the value in the filter, reuse it in front
[n for s in raw if (n := parse(s)) is not None]   # [42, 0]
```
:::

To filter on a computed value, compute it *in* the filter. The walrus operator `:=` (3.8+) assigns a value and returns it mid-expression, so `parse` runs once per item and the output reuses the result. The `is not None` matters: `0` is a valid parse, and a bare `if (n := parse(s))` would drop it for being falsy.

Regex matches, which are `None` on failure, are the classic case. Unlike the loop variable, a walrus target binds in the *enclosing* scope and outlives the comprehension. PEP 572 did that deliberately, so that after `if any((bad := x) < 0 for x in xs):` the name `bad` holds the culprit.

```python run
import re

lines = ["user=ada id=7", "garbage", "user=linus id=12"]
PATTERN = re.compile(r"user=(\w+) id=(\d+)")

print({m[1]: int(m[2]) for line in lines if (m := PATTERN.fullmatch(line))})
print(m)       # still bound: the last match
```

## `reduce`, and what replaces it

:::compare
```js
const nums = [4, 8, 15, 16, 23, 42];

nums.reduce((a, b) => a + b, 0);             // 108
nums.reduce((a, b) => a * b, 1);
nums.reduce((a, b) => Math.max(a, b));
parts.reduce((acc, s) => acc + s, "");
words.reduce((acc, w) => ({ ...acc, [w]: (acc[w] ?? 0) + 1 }), {});
users.reduce((acc, u) => ({ ...acc, [u.id]: u }), {});
```
```python
nums = [4, 8, 15, 16, 23, 42]

sum(nums)                                    # 108
math.prod(nums)
max(nums)
"".join(parts)
Counter(words)                               # from collections
{u["id"]: u for u in users}
```
:::

In JavaScript, `reduce` is the universal fallback. In Python, nearly every common reduction already has a name, and the named version is shorter and harder to get wrong. They all accept any iterable, so they compose with generator expressions: `sum(o["total"] for o in orders)`. The rest of the family: `any` and `all` for boolean folds (next section), two `for` clauses for flattening, and `itertools.accumulate(xs)` for running totals.

```python run
from collections import Counter
import math

cart = [{"item": "tea", "qty": 2, "price": 4}, {"item": "pie", "qty": 1, "price": 9}]
print(sum(line["qty"] * line["price"] for line in cart))   # 17
print(math.prod([2, 3, 4]))                               # 24

counts = Counter("the cat and the hat and the bat".split())
print(counts.most_common(2))
print(counts["dog"])        # missing keys count as 0
```

:::tip The spread reducer is quadratic
`({ ...acc, [w]: ... })` copies the whole accumulator for every item. `Counter` and dict comprehensions build their result once. And `sum` won't join strings: `sum(parts, "")` raises `TypeError` and points you at `"".join(parts)`.
:::

### `min` and `max` with `key=` and `default=`

:::compare
```js
const players = [{ name: "Ada", score: 92 }, { name: "Linus", score: 87 }];

players.reduce((best, p) => (p.score > best.score ? p : best));
Math.max(...players.map((p) => p.score));   // 92
Math.max(...[]);                            // -Infinity
```
```python
players = [{"name": "Ada", "score": 92}, {"name": "Linus", "score": 87}]

max(players, key=lambda p: p["score"])
max(p["score"] for p in players)            # 92
max([], default=None)                       # no default: ValueError
```
:::

`key=` works as it does in `sorted()` ([Lists](lesson:lists#sorting-and-reversing)): `max` compares `key(item)` but returns the **item**, so there's no ternary-inside-`reduce` to write. On a tie, `max` and `min` return the first winner they met. An empty input raises `ValueError` rather than producing `-Infinity`, so pass `default=` when empty is a legitimate case.

```python run
stock = {"tea": 12, "cake": 3, "pie": 7}
print(max(stock, key=stock.get))                  # the key with the biggest value
print(min(stock.items(), key=lambda kv: kv[1]))   # the (key, value) pair

words = ["kiwi", "fig", "banana", "plum"]
print(max(words, key=len))
print(min((w for w in words if w.startswith("z")), default="no z-words"))
```

### When `reduce` is the right tool

`functools.reduce(function, iterable, initial)` remains for folds that have no name. The function comes first and the starting value last (3.14 also accepts `initial=` as a keyword). The callback gets only `(accumulator, item)`, and an empty iterable with no starting value raises `TypeError`, as in JS. Walking a path into nested data is a classic legitimate use:

```python run
from functools import reduce
import operator

config = {"db": {"primary": {"host": "10.0.0.1", "port": 5432}}}
print(reduce(operator.getitem, ["db", "primary", "host"], config))
```

:::pythonic If the reducer needs braces, write a loop
A `reduce` whose callback would need a block body in JS should be a `for` loop with an accumulator in Python. Guido van Rossum moved `reduce` out of the builtins in Python 3 on exactly that argument.
:::

## `find`, `findIndex`, `some` and `every`

:::compare
```js
const users = [
  { name: "Ada", admin: false },
  { name: "Linus", admin: true },
];

users.find((u) => u.admin);            // { name: "Linus", ... }
users.find((u) => u.name === "Zed");   // undefined
users.findIndex((u) => u.admin);       // 1
users.findLast((u) => !u.admin);       // { name: "Ada", ... }
users.some((u) => u.admin);            // true
users.every((u) => u.name);            // true
```
```python
users = [
    {"name": "Ada", "admin": False},
    {"name": "Linus", "admin": True},
]

next((u for u in users if u["admin"]), None)
next((u for u in users if u["name"] == "Zed"), None)       # None
next((i for i, u in enumerate(users) if u["admin"]), None)  # 1
next((u for u in reversed(users) if not u["admin"]), None)
any(u["admin"] for u in users)         # True
all(u["name"] for u in users)          # True
```
:::

There's no `find` method. The idiom is `next(generator, default)`: the generator yields matches lazily, `next` takes the first, and the default comes back when there are none. It stops at the first match, like `find`. The generator needs its own parentheses because `next` takes a second argument. Without a default, a search with no match raises `StopIteration`, so pass one unless "not found" really is a bug. `findLast` searches `reversed(xs)`, which needs a sequence, not a generator.

:::gotcha `-1` is a real index in Python
`findIndex`'s `-1` sentinel is dangerous here. `xs[-1]` is the last element, so a "not found" result that gets used as an index silently hands you the wrong item. Default to `None`, and the mistake fails loudly with a `TypeError`.
:::

`any` and `all` are `some` and `every`. They short-circuit, but only when you give them a generator expression. A list comprehension builds the whole list, calling your predicate on every item, before `any` sees any of it:

```python run
def is_big(n):
    print(f"  checking {n}")
    return n > 10

nums = [4, 25, 7, 40]
print(any([is_big(n) for n in nums]))   # builds the list first: checks all four
print(any(is_big(n) for n in nums))     # generator: stops at 25
```

:::quiz output
What does this print?

```python
carts = []
print(all(c["paid"] for c in carts), any(c["paid"] for c in carts))
```

- [ ] `False False`
- [x] `True False`
- [ ] `True True`
- [ ] `KeyError`

`all` of nothing is `True` (there's no counterexample) and `any` of nothing is `False` (there's no witness), exactly like `[].every()` and `[].some()`. The generator body never runs, so there's no `KeyError`. Guard with `if carts` when "no carts" shouldn't count as "all paid".
:::

## Grouping and partitioning

:::compare
```js
const orders = [
  { id: 1, status: "paid" },
  { id: 2, status: "open" },
  { id: 3, status: "paid" },
];

const byStatus = Object.groupBy(orders, (o) => o.status);
// { paid: [{ id: 1 }, { id: 3 }], open: [{ id: 2 }] }
const counts = Object.fromEntries(
  Object.entries(byStatus).map(([k, v]) => [k, v.length]));
```
```python
from collections import Counter, defaultdict

orders = [
    {"id": 1, "status": "paid"},
    {"id": 2, "status": "open"},
    {"id": 3, "status": "paid"},
]
by_status = defaultdict(list)
for o in orders:
    by_status[o["status"]].append(o)
counts = Counter(o["status"] for o in orders)
```
:::

There's no `groupBy` builtin. The idiom is a three-line loop over a `defaultdict(list)`, a dict that creates an empty list the first time you touch a missing key. Grouping is accumulation, and accumulation is what loops are for: a comprehension version has to rescan the whole list for every key. If you only need the sizes, `Counter` the keys.

```python run
from collections import defaultdict

by_status = defaultdict(list)
for order_id, status in [(1, "paid"), (2, "open"), (3, "paid")]:
    by_status[status].append(order_id)

print(dict(by_status))
print(by_status["refunded"], "<- merely reading a missing key inserts it")
print(dict(by_status))
```

That's why grouping functions usually end with `return dict(groups)`: a caller's typo should raise `KeyError`, not quietly add an empty group to your data.

### `itertools.groupby` groups runs, not keys

`itertools.groupby` sounds like `Object.groupBy`, but it only groups **consecutive** items with the same key, like Unix `uniq`. That's perfect for run-length problems. For one group per key, sort by the same key first or use the `defaultdict` loop. Each group is a view into one shared iterator, so use it (here, `len(list(g))`) before moving on to the next key, which empties it.

```python run
from itertools import groupby

statuses = ["paid", "paid", "open", "paid"]
print([(k, len(list(g))) for k, g in groupby(statuses)])          # runs
print([(k, len(list(g))) for k, g in groupby(sorted(statuses))])  # one per key
```

:::quiz output
What does this print?

```python
from itertools import groupby
print([key for key, _ in groupby("aabbba")])
```

- [ ] `['a', 'b']`
- [x] `['a', 'b', 'a']`
- [ ] `['a', 'a', 'b', 'b', 'b', 'a']`
- [ ] `{'a': 3, 'b': 3}`

`groupby` starts a new group whenever the key changes, so the trailing `a` gets a group of its own.
:::

### Partitioning

lodash's `_.partition` is two comprehensions, `[s for s in scores if s >= 50]` and `[s for s in scores if s < 50]`. That's two passes, which rarely matters. When it does, or when the input is a one-shot iterator, choose the destination list with a conditional expression:

```python run
scores = [72, 45, 90, 38, 66]
passed, failed = [], []
for s in scores:
    (passed if s >= 50 else failed).append(s)
print(passed, failed)
```

## Loops, pipelines and readability

### `forEach` is a `for` loop

:::compare
```js
orders.forEach((o) => sendReceipt(o));
orders.forEach((o, i) => console.log(i, o.id));
```
```python
for order in orders:
    send_receipt(order)
for i, order in enumerate(orders):
    print(i, order["id"])
```
:::

Comprehensions build collections. For side effects, write a `for` loop. A comprehension used as a loop still builds a list, fills it with the `None`s that `print` and `append` return, and throws it away. The playground shows the evidence:

```python run
[print(n) for n in [1, 2, 3]]
```

### Method chains become named steps

:::compare
```js
const revenue = orders
  .filter((o) => o.status === "paid")
  .map((o) => o.qty * o.price)
  .filter((total) => total >= 100)
  .reduce((a, b) => a + b, 0);
```
```python
paid = (o for o in orders if o["status"] == "paid")
totals = (o["qty"] * o["price"] for o in paid)
revenue = sum(t for t in totals if t >= 100)
```
:::

Don't translate a long chain into one heroic comprehension. Name the stages. Generator expressions are lazy, so the stages form a pipeline: each item flows all the way through before the next is read, and no intermediate lists exist. An array chain finishes the whole array at every step. (The ES2025 iterator helpers, `orders.values().filter(...)`, are the lazy JS equivalent.)

```python run
def parse(raw):
    print(f"parse {raw!r}")
    return int(raw)

amounts = (parse(r) for r in ["5", "120", "80"])
large = (a for a in amounts if a >= 50)
print("nothing has run yet")
for a in large:
    print(f"  -> {a}")
```

### Know when to stop

Comprehensions are expressions, so they can't hold statements: no `try`, no assignments other than `:=`, no multi-step logic. When the body outgrows an expression, move it into a named function and call that from the comprehension, or write the loop. The limits a Python reviewer will hold you to:

- One `for` and one `if` is the sweet spot, and two `for` clauses are fine for flattening. Past that, use named steps or a loop.
- Keep conditional expressions in the output short, and never nest them.
- Never use a comprehension only for its side effects.
- When it no longer fits on a line, give the expression, each `for` and each `if` a line of their own. Brackets continue lines implicitly, and ruff and black format long comprehensions this way:

```python
labels = [
    f"#{order['id']}: {order['customer'].title()}"
    for order in orders
    if order["status"] == "paid"
]
```

### The loop variable stays inside

A `for` loop's variable survives the loop, because Python has no block scope ([Variables & Scope](lesson:variables-and-scope)). A comprehension's variables don't. The comprehension gets its own scope, like the arrow function inside `.map`, so it can't clobber an outer variable of the same name. The walrus target is the one deliberate exception.

:::quiz output
What does this print?

```python
name = "Ada"
lengths = [len(name) for name in ["Linus", "Grace"]]
print(name)
```

- [x] `Ada`
- [ ] `Grace`
- [ ] `Linus`
- [ ] `NameError`

The comprehension's `name` is local to the comprehension, so the outer `name` is untouched. A `for` loop over the same list would have left `name` set to `"Grace"`.
:::

:::gotcha Lambdas in a comprehension share one variable
`[lambda: n for n in range(3)]` makes three functions that all return `2`, because each looks `n` up when it's called, after the comprehension has finished. JS's `let` gives every iteration a fresh binding, and Python doesn't. The fix, a default argument (`lambda n=n: n`), is in [Functions](lesson:functions).
:::

## Cheat sheet

| JavaScript | Python | Notes |
| --- | --- | --- |
| `xs.map(f)` | `[f(x) for x in xs]` | `list(map(f, xs))` when `f` already exists |
| `xs.filter(p)` | `[x for x in xs if p(x)]` | |
| `xs.filter(p).map(f)` | `[f(x) for x in xs if p(x)]` | the filter runs first |
| `xs.map(f).filter(p)` | `[y for x in xs if p(y := f(x))]` | walrus: compute once |
| `xs.map((x) => c ? a : b)` | `[a if c else b for x in xs]` | `if`/`else` goes in front |
| `xs.filter(Boolean)` | `[x for x in xs if x]` | or `list(filter(None, xs))` |
| `Object.fromEntries(...)` | `{k: v for k, v in pairs}` | keys keep their type |
| `new Set(xs.map(f))` | `{f(x) for x in xs}` | `set()` for empty |
| `xs.flat()` | `[y for x in xs for y in x]` | loops in written order |
| `xs.flatMap(f)` | `[y for x in xs for y in f(x)]` | |
| `xs.reduce((a, b) => a + b, 0)` | `sum(xs)` | `math.prod` for products |
| `xs.reduce(fn, init)` | `functools.reduce(fn, xs, init)` | function first, no index |
| `Math.max(...xs)` | `max(xs)` | `key=`, `default=` |
| count by key | `Counter(key(x) for x in xs)` | `collections` |
| `xs.find(p)` | `next((x for x in xs if p(x)), None)` | stops at the first match |
| `xs.findIndex(p)` | `next((i for i, x in enumerate(xs) if p(x)), None)` | `-1` is a valid index |
| `xs.findLast(p)` | `next((x for x in reversed(xs) if p(x)), None)` | needs a sequence |
| `xs.some(p)` | `any(p(x) for x in xs)` | short-circuits with a generator |
| `xs.every(p)` | `all(p(x) for x in xs)` | `True` when empty |
| `xs.forEach(f)` | `for x in xs: f(x)` | not a comprehension |
| `xs.map((x, i) => ...)` | `[... for i, x in enumerate(xs)]` | |
| `xs.map((x, i) => x + ys[i])` | `[x + y for x, y in zip(xs, ys)]` | `strict=True` checks lengths |
| `Object.groupBy(xs, k)` | `defaultdict(list)` + a loop | `itertools.groupby` groups runs |

## Challenges

:::challenge id=mfr-active-emails title="Active emails" difficulty=easy
Write `active_emails(users)` that returns the email addresses of the active users, lowercased and in their original order. Each user is a dict with an `"active"` flag. Skip users whose email is missing, `None` or empty.

Use a single list comprehension, with no `for` statement.

```js
const activeEmails = (users) =>
  users.filter((u) => u.active && u.email).map((u) => u.email.toLowerCase());
```

```python starter
def active_emails(users):
    ...
```

```python solution
def active_emails(users):
    return [u["email"].lower() for u in users if u["active"] and u.get("email")]
```

```python tests
USERS = [
    {"name": "Ada", "email": "ADA@Example.com", "active": True},
    {"name": "Linus", "email": "linus@example.com", "active": False},
    {"name": "Grace", "email": "grace@example.com", "active": True},
]

@test("returns the lowercased emails of active users, in order")
def _():
    eq(active_emails(USERS), ["ada@example.com", "grace@example.com"])

@test("skips users whose email is missing, None or empty")
def _():
    users = [
        {"name": "NoKey", "active": True},
        {"name": "Null", "email": None, "active": True},
        {"name": "Blank", "email": "", "active": True},
        {"name": "Kept", "email": "Kept@Example.com", "active": True},
    ]
    eq(active_emails(users), ["kept@example.com"])

@test("no users, no emails")
def _():
    eq(active_emails([]), [])

@test("returns a list")
def _():
    check(type(active_emails(USERS)) is list, "return a list, not a generator or a map object")

@test("uses a list comprehension")
def _():
    requires_syntax(ast.ListComp, "build the result with [... for ... if ...]")
    forbids_syntax(ast.For, "no for statement needed: the comprehension is the loop")
```

```hint
The shape is `[expression for u in users if condition]`. The expression is the lowercased email, and the condition checks two things.
```

```hint
`u["email"]` raises `KeyError` when the key is missing. `u.get("email")` returns `None` instead, and `None` and `""` are both falsy.
```
:::

:::challenge id=mfr-first-out-of-stock title="First out of stock" difficulty=easy
Write `first_out_of_stock(products)` that returns the **name** of the first product whose `"stock"` is `0`, or `None` if there isn't one.

A stock of `None` means "unknown", which is not the same as out of stock. And `products` can be any iterable, including a generator reading from a slow API, so stop as soon as you find a match.

```js
const firstOutOfStock = (products) =>
  products.find((p) => p.stock === 0)?.name ?? null;
```

```python starter
def first_out_of_stock(products):
    ...
```

```python solution
def first_out_of_stock(products):
    return next((p["name"] for p in products if p["stock"] == 0), None)
```

```python tests
PRODUCTS = [
    {"name": "mug", "stock": 4},
    {"name": "lamp", "stock": 0},
    {"name": "desk", "stock": 0},
]

@test("returns the name of the first product with no stock")
def _():
    eq(first_out_of_stock(PRODUCTS), "lamp")

@test("returns None when nothing is out of stock")
def _():
    eq(first_out_of_stock([{"name": "mug", "stock": 4}]), None)
    eq(first_out_of_stock([]), None)

@test("unknown stock (None) doesn't count as out of stock")
def _():
    products = [{"name": "ghost", "stock": None}, {"name": "lamp", "stock": 0}]
    eq(first_out_of_stock(products), "lamp")

@test("works with a generator")
def _():
    eq(first_out_of_stock(p for p in PRODUCTS), "lamp")

@test("stops reading at the first match")
def _():
    def feed():
        yield {"name": "mug", "stock": 4}
        yield {"name": "lamp", "stock": 0}
        raise AssertionError("kept reading after the first match")
    eq(first_out_of_stock(feed()), "lamp")

@test("uses next() with a default")
def _():
    requires_call("next", "find the first match with next((... for ... if ...), None)")
```

```hint
A generator expression yields the names of the matching products, lazily: `(p["name"] for p in products if ...)`.
```

```hint
`next(generator, None)` takes the first value, or returns `None` when there are none. The generator needs its own parentheses inside the call.
```

```hint
`not p["stock"]` is also true for `None`. Compare with `== 0` instead.
```
:::

:::challenge id=mfr-group-by title="Object.groupBy" difficulty=medium
Write `group_by(items, key)`, Python's version of `Object.groupBy`. `key` is a function. Return a dict that maps each key to the list of items that produced it. Keys appear in order of first appearance, and items keep their original order within each group.

Return a **plain `dict`**: looking up a key that doesn't exist should raise `KeyError`, not quietly hand back an empty list. And `items` can be a one-shot iterator, so make a single pass and call `key` once per item.

```js
const byStatus = Object.groupBy(orders, (o) => o.status);
```

```python starter
def group_by(items, key):
    ...
```

```python solution
from collections import defaultdict

def group_by(items, key):
    groups = defaultdict(list)
    for item in items:
        groups[key(item)].append(item)
    return dict(groups)
```

```python tests
ORDERS = [
    {"id": 1, "status": "paid"},
    {"id": 2, "status": "open"},
    {"id": 3, "status": "paid"},
    {"id": 4, "status": "refunded"},
]

def by_status(order):
    return order["status"]

def ids(groups):
    return {k: [o["id"] for o in v] for k, v in groups.items()}

@test("groups items by the key function")
def _():
    eq(ids(group_by(ORDERS, by_status)), {"paid": [1, 3], "open": [2], "refunded": [4]})

@test("keys appear in order of first appearance")
def _():
    eq(list(group_by(ORDERS, by_status)), ["paid", "open", "refunded"])

@test("works with any key function")
def _():
    eq(group_by(["fig", "kiwi", "pear", "apple"], len), {3: ["fig"], 4: ["kiwi", "pear"], 5: ["apple"]})
    eq(group_by(range(6), lambda n: n % 2 == 0), {True: [0, 2, 4], False: [1, 3, 5]})

@test("an empty input gives an empty dict")
def _():
    eq(group_by([], len), {})

@test("returns a plain dict, so missing keys raise KeyError")
def _():
    groups = group_by(ORDERS, by_status)
    check(type(groups) is dict, f"expected a plain dict, got {type(groups).__name__}")
    with raises(KeyError):
        groups["cancelled"]

@test("makes one pass and calls key once per item")
def _():
    calls = []
    def key(n):
        calls.append(n)
        return n % 3
    eq(group_by(iter([1, 2, 3, 4, 5]), key), {1: [1, 4], 2: [2, 5], 0: [3]})
    eq(len(calls), 5, "key should run exactly once per item")
```

```hint
`collections.defaultdict(list)` gives you an empty list the first time you touch a key, so the loop body is one line: `groups[key(item)].append(item)`.
```

```hint
`dict(groups)` copies a `defaultdict` into a plain dict, which raises `KeyError` for missing keys again.
```

```hint
`itertools.groupby` isn't a drop-in replacement: it only groups consecutive items, and sorting first would lose the first-appearance order.
```
:::

:::challenge id=mfr-top-words title="Top words" difficulty=hard
Write `top_words(lines, n)` that returns the `n` most common words across an iterable of text lines, as a list of `(word, count)` tuples, most common first. Break ties alphabetically.

- Split each line on whitespace and lowercase every word.
- Strip the characters in `PUNCTUATION` from both ends of each word (`str.strip(chars)` does exactly that), and skip anything left empty.
- Ignore the words in `STOP_WORDS`.

`lines` may be a generator over a huge file, so make a single pass. This is the classic word-count `reduce`, and the JS below spreads its accumulator on every word. Python has a better tool.

```text
top_words(["The cat sat.", "The cat ran!"], 2)  ->  [("cat", 2), ("ran", 1)]
```

```js
function topWords(lines, n) {
  const counts = lines
    .flatMap((line) => line.toLowerCase().split(/\s+/))
    .map((w) => w.replace(/^[.,;:!?"'()-]+|[.,;:!?"'()-]+$/g, ""))
    .filter((w) => w && !STOP_WORDS.has(w))
    .reduce((acc, w) => ({ ...acc, [w]: (acc[w] ?? 0) + 1 }), {});
  return Object.entries(counts)
    .sort(([a, x], [b, y]) => y - x || a.localeCompare(b))
    .slice(0, n);
}
```

```python starter
from collections import Counter

STOP_WORDS = {"the", "a", "an", "and", "of", "to", "in", "is", "it"}
PUNCTUATION = ".,;:!?\"'()-"

def top_words(lines, n):
    ...
```

```python solution
from collections import Counter

STOP_WORDS = {"the", "a", "an", "and", "of", "to", "in", "is", "it"}
PUNCTUATION = ".,;:!?\"'()-"

def top_words(lines, n):
    words = (w.strip(PUNCTUATION) for line in lines for w in line.lower().split())
    counts = Counter(w for w in words if w and w not in STOP_WORDS)
    return sorted(counts.items(), key=lambda item: (-item[1], item[0]))[:n]
```

```python tests
@test("counts words across lines, most common first")
def _():
    eq(top_words(["red green red", "blue red green"], 2), [("red", 3), ("green", 2)])

@test("ignores case")
def _():
    eq(top_words(["Python python PYTHON"], 1), [("python", 3)])

@test("strips punctuation from the ends of words, not the middle")
def _():
    eq(top_words(['"Done." done! (done)'], 1), [("done", 3)])
    eq(top_words(["don't stop, don't"], 1), [("don't", 2)])

@test("skips stop words and words that strip down to nothing")
def _():
    eq(top_words(["The cat and the hat -- !!!"], 5), [("cat", 1), ("hat", 1)])

@test("breaks ties alphabetically")
def _():
    eq(top_words(["pear fig apple fig pear apple kiwi"], 3), [("apple", 2), ("fig", 2), ("pear", 2)])

@test("n larger than the number of words returns them all")
def _():
    eq(top_words(["one two two"], 10), [("two", 2), ("one", 1)])

@test("blank input gives an empty list")
def _():
    eq(top_words([], 3), [])
    eq(top_words(["", "   "], 3), [])

@test("reads the lines in a single pass")
def _():
    eq(top_words(iter(["red green", "red"]), 1), [("red", 2)])
```

```hint
Flatten the lines into words with a generator expression that has two `for` clauses: `for line in lines for w in line.lower().split()`.
```

```hint
`Counter(iterable)` does the whole `reduce`. But `counts.most_common(n)` breaks ties by first appearance, not alphabetically.
```

```hint
Sort `counts.items()` with `key=lambda item: (-item[1], item[0])`: count descending, then word ascending. Then slice `[:n]`.
```
:::
