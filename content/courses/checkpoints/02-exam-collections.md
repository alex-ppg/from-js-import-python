---
title: "Exam: Collections"
part: Core Course Exams
summary: Predict the output of list, dict, set and tuple code, then solve challenges that combine them.
minutes: 50
---

This exam covers the Collections part of the core course: [Arrays → Lists](lesson:lists), [map, filter, reduce → Comprehensions](lesson:map-filter-reduce), [Tuples & Destructuring](lesson:tuples-and-unpacking), [Objects & Maps → Dicts](lesson:dicts) and [Sets](lesson:sets). Predict what each snippet prints, or which exception it raises, before you read the options: most of the traps are places where a list, dict or set quietly behaves unlike the JavaScript array, object or `Set` you'd have written. Every answer has been checked against real Python 3.14, each section ends with a pointer to the lesson that owns its topic, and the final challenges combine the collection types the way real code does.

## Lists

:::quiz output
What does this print?

```python
tags = ["new"]
tags.extend("hot")
tags.append(["sale"])
print(len(tags))
```

- [ ] `3`
- [x] `5`
- [ ] `6`
- [ ] `TypeError`

`extend` iterates its argument, and a string iterates as characters, so it adds three items: `"h"`, `"o"` and `"t"`. `append` adds its argument as a single item, so the nested `["sale"]` counts once. JS's `push(...items)` is `extend`, and `push(item)` is `append`.
:::

:::quiz output
What does this print?

```python
xs = [1, 2, 3, 4, 5]
xs[1:4] = []
xs[0] = [9, 9]
print(xs)
```

- [ ] `[9, 9, 5]`
- [x] `[[9, 9], 5]`
- [ ] `[[9, 9], 2, 3, 4, 5]`
- [ ] `[1, 5]`

Assigning to a slice replaces that whole region, so `xs[1:4] = []` deletes three items, like `splice(1, 3)`. Assigning to an index replaces exactly one item, so `xs[0]` becomes the list `[9, 9]` itself. `xs[0:1] = [9, 9]` would have spliced in two items instead.
:::

:::quiz output
What does this print?

```python
flags = [0, 1, True, 1]
flags.remove(True)
print(flags)
```

- [ ] `[0, 1, 1]`
- [x] `[0, True, 1]`
- [ ] `[0]`
- [ ] `ValueError`

`remove` deletes the **first** item that's equal to its argument, and `1 == True` because `bool` is a subclass of `int`. So it's the `1` at index 1 that goes, not the `True`. `in`, `index` and `count` use the same `==` test.
:::

:::quiz output
What does this print?

```python
words = ["bb", "a", "ccc", "dd", "e"]
print(sorted(words, key=len))
```

- [x] `['a', 'e', 'bb', 'dd', 'ccc']`
- [ ] `['e', 'a', 'dd', 'bb', 'ccc']`
- [ ] `['a', 'bb', 'ccc', 'dd', 'e']`
- [ ] `['a', 'e', 'dd', 'bb', 'ccc']`

`key=len` sorts by length alone, and Python's sort is **stable**: items whose keys are equal keep their original order, so `"a"` stays ahead of `"e"` and `"bb"` ahead of `"dd"`. Stability is what makes sorting by a tuple key, or in several passes, predictable. Without the key, `sorted(words)` would be plain alphabetical order.
:::

Review: [Arrays → Lists](lesson:lists), especially [slicing](lesson:lists#slicing-slice-with-superpowers), [adding and removing](lesson:lists#adding-and-removing-push-pop-shift-unshift-splice) and [sorting](lesson:lists#sorting-and-reversing).

## Comprehensions

:::quiz output
What does this print?

```python
prices = [12, 7, 30]
cheap = [p for p in prices if (last := p) < 10]
print(last, cheap)
```

- [ ] `7 [7]`
- [x] `30 [7]`
- [ ] `12 [7]`
- [ ] `NameError`

The filter runs for every item, so the walrus rebinds `last` three times and keeps the final price, `30`. The loop variable `p` stays inside the comprehension, but a walrus target binds in the enclosing scope, so `last` is still readable afterwards.
:::

:::quiz output
What does this print?

```python
prices = [10, 20]
taxed = (p * 1.2 for p in prices)
prices.append(30)
print(len(list(taxed)))
```

- [ ] `2`
- [x] `3`
- [ ] `0`
- [ ] `TypeError`

A generator expression computes nothing when it's created. It reads `prices` one item at a time, as something pulls values, and by the time `list()` does, the list holds three prices. A JS `prices.map(...)`, or a list comprehension, would have computed two values on the spot.
:::

:::quiz output
What does this print?

```python
stock = {"tea": 5, "pie": 9, "jam": 9}
print(max(stock, key=stock.get), min(stock.values()))
```

- [ ] `9 5`
- [ ] `jam 5`
- [x] `pie 5`
- [ ] `('pie', 9) 5`

Iterating a dict yields its keys, and `key=stock.get` makes `max` compare stock levels while returning the **key**. `pie` and `jam` tie at 9, and `max` returns the first winner it meets, in insertion order. `min(stock.values())` works on the values directly.
:::

:::quiz output
What does this print?

```python
pairs = [("a", 1), ("b", 2), ("a", 3)]
print({k: v for k, v in pairs})
```

- [ ] `{'a': 1, 'b': 2}`
- [x] `{'a': 3, 'b': 2}`
- [ ] `{'b': 2, 'a': 3}`
- [ ] `ValueError`

A repeated key overwrites the value but keeps the position it got when it was first inserted, so `"a"` stays first and ends up holding `3`, just as with `Object.fromEntries`. To move a key to the end, delete it and insert it again.
:::

Review: [map, filter, reduce → Comprehensions](lesson:map-filter-reduce), especially [generator expressions](lesson:map-filter-reduce#generator-expressions-lazy-comprehensions), [the walrus](lesson:map-filter-reduce#the-walrus-compute-once-use-twice) and [`min` and `max`](lesson:map-filter-reduce#min-and-max-with-key-and-default).

## Tuples and unpacking

:::quiz output
What does this print?

```python
total = 19.99,
print(total * 2)
```

- [ ] `39.98`
- [x] `(19.99, 19.99)`
- [ ] `SyntaxError`
- [ ] `TypeError`

The trailing comma makes `total` a one-element tuple, and `*` on a tuple repeats it. A stray comma raises nothing on the line where it's written: the wrong value, or the error, turns up somewhere else. It's the comma that makes a tuple, not the parentheses.
:::

:::quiz output
What does this print?

```python
a, b = 1, 2
a, b = b, a + b
print(a, b)
```

- [ ] `2 4`
- [x] `2 3`
- [ ] `2 2`
- [ ] `1 3`

The whole right-hand side is evaluated first, into the tuple `(2, 3)`, and only then unpacked into `a` and `b`, so `a + b` still sees the old `a`. It's why a swap, or a Fibonacci step like this one, needs no temporary variable.
:::

:::quiz output
What happens?

```python
cache = {}
key = ("users", [1, 2])
cache[key] = "hit"
print(cache)
```

- [ ] `{('users', [1, 2]): 'hit'}`
- [x] `TypeError`
- [ ] `KeyError`
- [ ] `{}`

A tuple is hashable only if everything inside it is, and a list isn't, so this tuple can't be a dict key. Python 3.14 spells it out: `TypeError: cannot use 'tuple' as a dict key (unhashable type: 'list')`. Use `("users", (1, 2))` or a `frozenset` instead.
:::

:::quiz output
What does this print?

```python
order = ("ord-1", ["tea"])
try:
    order[1] += ["pie"]
except TypeError:
    pass
print(order)
```

- [ ] `('ord-1', ['tea'])`
- [x] `('ord-1', ['tea', 'pie'])`
- [ ] `('ord-1', ['pie'])`
- [ ] `TypeError`

`order[1] += ["pie"]` does two things. It extends the list in place, which works because the list is mutable, and then it stores the result back into `order[1]`, which fails because the tuple isn't. The `TypeError` is real, and so is the change. `order[1].extend(["pie"])` has nothing to store back, so it simply works.
:::

Review: [Tuples & Destructuring](lesson:tuples-and-unpacking), especially [the comma](lesson:tuples-and-unpacking#the-comma-makes-the-tuple), [unpacking](lesson:tuples-and-unpacking#unpacking-destructuring-without-brackets) and [hashability](lesson:tuples-and-unpacking#hashable-so-tuples-can-be-keys).

## Dicts

:::quiz output
What does this print?

```python
ranks = {"b": 1, 2: "x", "a": 3}
ranks["b"] = 10
ranks[1] = "y"
print(list(ranks))
```

- [ ] `[1, 2, 'b', 'a']`
- [x] `['b', 2, 'a', 1]`
- [ ] `[2, 'a', 'b', 1]`
- [ ] `['1', '2', 'b', 'a']`

A dict keeps plain insertion order, whatever the type of its keys. Updating `"b"` leaves it where it was, and the new key `1` goes at the end. A JS object would list integer-like keys first, in numeric order, and would have turned them into strings as well.
:::

:::quiz output
What happens?

```python
from collections import defaultdict

groups = defaultdict(list)
if groups["admins"]:
    print("has admins")
print(len(groups))
```

- [ ] `0`
- [x] `1`
- [ ] `KeyError`
- [ ] `has admins`, then `1`

On a `defaultdict`, merely **reading** a missing key calls the factory and stores the result, so the `if` inserts `"admins": []`. The new list is empty and falsy, so nothing is printed, but the key is there now. Use `"admins" in groups` or `groups.get("admins")` for lookups that shouldn't create anything.
:::

:::quiz output
What does this print?

```python
teams = dict.fromkeys(["red", "blue"], [])
teams["red"].append("ada")
print(teams["blue"])
```

- [ ] `[]`
- [x] `['ada']`
- [ ] `KeyError`
- [ ] `None`

`fromkeys` stores the **same** default object under every key, so both teams share one list, the dict version of `new Array(2).fill([])`. Build one list per key with a comprehension, `{team: [] for team in ["red", "blue"]}`, or use a `defaultdict(list)`.
:::

:::quiz output
What does this print?

```python
defaults = {"theme": "light"}
prefs = defaults.update({"theme": "dark"})
print(prefs, defaults)
```

- [ ] `{'theme': 'dark'} {'theme': 'light'}`
- [ ] `{'theme': 'dark'} {'theme': 'dark'}`
- [x] `None {'theme': 'dark'}`
- [ ] `TypeError`

`update` merges in place and returns `None`, like every method that mutates (`append`, `sort`, `add`, ...). `Object.assign` returns its target, which is how this habit slips through. For a new, merged dict that leaves `defaults` alone, write `defaults | {"theme": "dark"}`.
:::

Review: [Objects & Maps → Dicts](lesson:dicts), especially [order](lesson:dicts#order-insertion-order-no-surprises), [updating](lesson:dicts#adding-updating-and-removing) and [`defaultdict`](lesson:dicts#defaultdict-no-more-create-it-if-it-s-missing).

## Sets

:::quiz output
What happens?

```python
online = {"ada", "bob"}
print(sorted(online.union(["cy"])), online | ["cy"])
```

- [ ] `['ada', 'bob', 'cy']`, then the same three names as a set
- [x] `TypeError`
- [ ] `['ada', 'bob', 'cy'] ['cy']`
- [ ] `AttributeError`

The set methods accept any iterable, so `online.union(["cy"])` is fine. The operators insist on two sets (or frozensets), so `online | ["cy"]` raises `TypeError`, and since Python evaluates every argument before it calls `print`, nothing is printed at all. Convert first: `online | {"cy"}`.
:::

:::quiz output
What does this print?

```python
meetings = {frozenset({"ada", "bob"}): 1}
print(meetings.get(frozenset({"bob", "ada"})), {"ada"} == frozenset({"ada"}))
```

- [ ] `None True`
- [x] `1 True`
- [ ] `1 False`
- [ ] `TypeError`

A `frozenset` is hashable, so it can be a dict key, and like any set it ignores order, so `{"bob", "ada"}` finds the same entry: an unordered pair as a key, with no string to build by hand. A frozenset also compares equal to a plain set with the same members.
:::

:::quiz
`[...new Set(visits)]` removes duplicates and keeps each item's first position. Which Python line does the same?

- [ ] `list(set(visits))`
- [ ] `sorted(set(visits))`
- [x] `list(dict.fromkeys(visits))`
- [ ] `[*{visits}]`

A Python set has no defined order, so `list(set(visits))` dedupes but scrambles the order, and `sorted` imposes a different one. Dicts keep insertion order, so a dict whose keys are the items dedupes and keeps the first occurrence of each. `{visits}` tries to put the list itself into a set, and raises `TypeError`.
:::

Review: [Sets](lesson:sets), especially [set algebra](lesson:sets#set-algebra-operators-and-methods), [`frozenset`](lesson:sets#set-comprehensions-and-frozenset) and [order-preserving dedupes](lesson:sets#dedupe-keeping-order).

## Final challenges

Each challenge combines several collection types. They're ordered from easy to hard.

:::challenge id=exam-order-totals title="Order totals" difficulty=easy
Write `order_totals(orders)`. Each order is a dict with a `"customer"` and a list of `(sku, quantity)` tuples under `"items"`. Return a dict that maps every customer to the total quantity they ordered, across all their orders.

- Customers appear in the order of their first order.
- A customer whose orders have no items still appears, with `0`.
- Looking up a customer who never ordered must raise `KeyError`, so return a plain `dict`. Don't modify the input.

```text
orders = [
    {"customer": "ada", "items": [("tea", 2), ("pie", 1)]},
    {"customer": "bob", "items": []},
    {"customer": "ada", "items": [("tea", 1)]},
]
order_totals(orders)  ->  {"ada": 4, "bob": 0}
```

```js
function orderTotals(orders) {
  const totals = {};
  for (const { customer, items } of orders) {
    const quantity = items.reduce((sum, [, qty]) => sum + qty, 0);
    totals[customer] = (totals[customer] ?? 0) + quantity;
  }
  return totals;
}
```

```python starter
def order_totals(orders):
    ...
```

```python solution
def order_totals(orders):
    totals = {}
    for order in orders:
        customer = order["customer"]
        quantity = sum(qty for _, qty in order["items"])
        totals[customer] = totals.get(customer, 0) + quantity
    return totals
```

```python tests
ORDERS = [
    {"customer": "ada", "items": [("tea", 2), ("pie", 1)]},
    {"customer": "bob", "items": []},
    {"customer": "ada", "items": [("tea", 1)]},
    {"customer": "cy", "items": [("jam", 5)]},
]

@test("adds up quantities per customer, across orders")
def _():
    eq(order_totals(ORDERS), {"ada": 4, "bob": 0, "cy": 5})

@test("customers appear in the order of their first order")
def _():
    eq(list(order_totals(ORDERS)), ["ada", "bob", "cy"])

@test("a customer with no items still appears, with 0")
def _():
    eq(order_totals([{"customer": "bob", "items": []}]), {"bob": 0})

@test("no orders, no customers")
def _():
    eq(order_totals([]), {})

@test("an unknown customer raises KeyError")
def _():
    totals = order_totals(ORDERS)
    with raises(KeyError):
        totals["zed"]
    check("zed" not in totals, "looking up an unknown customer shouldn't add it")

@test("doesn't modify the orders")
def _():
    orders = [{"customer": "ada", "items": [("tea", 2)]}]
    order_totals(orders)
    eq(orders, [{"customer": "ada", "items": [("tea", 2)]}])
```

```hint
Unpack each `(sku, quantity)` pair right in a generator expression: `sum(qty for _, qty in order["items"])`.
```

```hint
`totals.get(customer, 0) + quantity` adds to whatever the customer already has. The sum of no items is `0`, so an empty order still creates the key.
```

```hint
A `Counter` or a `defaultdict(int)` works too, as long as you convert it with `dict(...)` before returning it: neither one raises `KeyError` for a missing key.
```
:::

:::challenge id=exam-table-records title="Table to records" difficulty=medium
Write `parse_table(text)` that turns a small comma-separated table into a list of dicts, one per row:

- The first non-blank line is the header, and every later non-blank line is a row. Blank lines, whitespace-only ones included, are skipped.
- Cells are separated by commas, and the whitespace around each cell is stripped.
- Each row becomes a dict from header names to cells, in header order.
- A cell made only of digits becomes an `int`. Every other cell stays a string, including `""`, `"4.50"` and a dialling code like `"+44"`.
- A row with a different number of cells than the header raises `ValueError`.
- Text with no header at all gives `[]`.

```text
parse_table("""
name, age, city
Ada, 36, London

Grace, 45, New York
""")
->  [{"name": "Ada", "age": 36, "city": "London"},
     {"name": "Grace", "age": 45, "city": "New York"}]
```

```js
function parseTable(text) {
  const lines = text.split("\n").filter((line) => line.trim());
  if (lines.length === 0) return [];
  const [header, ...rows] = lines.map((line) => line.split(",").map((cell) => cell.trim()));
  return rows.map((row) => {
    if (row.length !== header.length) throw new RangeError(`expected ${header.length} cells`);
    return Object.fromEntries(
      header.map((name, i) => [name, /^\d+$/.test(row[i]) ? Number(row[i]) : row[i]]),
    );
  });
}
```

```python starter
def parse_table(text):
    ...
```

```python solution
def parse_cell(cell):
    return int(cell) if cell.isdecimal() else cell


def parse_table(text):
    lines = [line for line in text.splitlines() if line.strip()]
    if not lines:
        return []
    header, *rows = ([cell.strip() for cell in line.split(",")] for line in lines)
    return [
        {name: parse_cell(cell) for name, cell in zip(header, row, strict=True)}
        for row in rows
    ]
```

```python tests
TEXT = """
name, age, city
Ada, 36, London

Grace, 45, New York
"""

@test("one dict per row, keyed by the header")
def _():
    eq(parse_table(TEXT), [
        {"name": "Ada", "age": 36, "city": "London"},
        {"name": "Grace", "age": 45, "city": "New York"},
    ])

@test("keys follow the header order")
def _():
    eq(list(parse_table(TEXT)[0]), ["name", "age", "city"])

@test("only all-digit cells become ints")
def _():
    rows = parse_table("sku,qty,price,dial,note\nA1,3,4.50,+44,\nB2,10,12,+1,x2")
    eq(rows, [
        {"sku": "A1", "qty": 3, "price": "4.50", "dial": "+44", "note": ""},
        {"sku": "B2", "qty": 10, "price": 12, "dial": "+1", "note": "x2"},
    ])

@test("blank and whitespace-only lines are skipped")
def _():
    eq(parse_table("\n  \nid\n\n1\n   \n2\n"), [{"id": 1}, {"id": 2}])

@test("a header without rows gives an empty list")
def _():
    eq(parse_table("name,age"), [])

@test("text without a header gives an empty list")
def _():
    eq(parse_table(""), [])
    eq(parse_table("   \n\n"), [])

@test("rows with the wrong number of cells raise ValueError")
def _():
    raises(ValueError, parse_table, "a,b\n1,2,3")
    raises(ValueError, parse_table, "a,b\n1")
```

```hint
Drop the blank lines first: `line.strip()` is falsy for a whitespace-only line. Then split every remaining line into stripped cells.
```

```hint
`header, *rows = ...` splits the header off in one step, and `zip(header, row, strict=True)` pairs names with cells and raises `ValueError` when the lengths differ.
```

```hint
A dict comprehension inside a list comprehension builds the result: `[{name: ... for name, cell in zip(...)} for row in rows]`. `str.isdecimal()` tells you whether a cell is all digits.
```
:::

:::challenge id=exam-friend-suggestions title="People you may know" difficulty=medium
A social graph is a dict that maps each person to the set of their friends. Write `suggest_friends(friends, user)` that suggests people `user` might know: friends of their friends who aren't `user` and aren't already their friends.

Return a list of `(name, mutual)` tuples, where `mutual` is the number of friends they have in common with `user`, sorted by most mutual friends first, then alphabetically.

- A user who isn't in the graph gets no suggestions.
- The data can be lopsided: a friend may have no entry of their own.
- Don't modify the graph.

```text
friends = {
    "ada": {"bob", "cy"},
    "bob": {"ada", "cy", "dee", "eve"},
    "cy": {"ada", "bob", "dee"},
    "dee": {"bob", "cy"},
    "eve": {"bob"},
}
suggest_friends(friends, "ada")  ->  [("dee", 2), ("eve", 1)]
```

```js
function suggestFriends(friends, user) {
  const direct = friends.get(user) ?? new Set();
  const mutual = new Map();
  for (const friend of direct) {
    for (const candidate of friends.get(friend) ?? []) {
      if (candidate === user || direct.has(candidate)) continue;
      mutual.set(candidate, (mutual.get(candidate) ?? 0) + 1);
    }
  }
  return [...mutual].sort(([a, x], [b, y]) => y - x || a.localeCompare(b));
}
```

```python starter
def suggest_friends(friends, user):
    ...
```

```python solution
from collections import Counter


def suggest_friends(friends, user):
    direct = friends.get(user, set())
    mutual = Counter(
        candidate
        for friend in direct
        for candidate in friends.get(friend, set())
        if candidate != user and candidate not in direct
    )
    return sorted(mutual.items(), key=lambda item: (-item[1], item[0]))
```

```python tests
def sample_graph():
    """A fresh copy of the sample graph for every test."""
    return {
        "ada": {"bob", "cy"},
        "bob": {"ada", "cy", "dee", "eve"},
        "cy": {"ada", "bob", "dee"},
        "dee": {"bob", "cy"},
        "eve": {"bob"},
    }

@test("suggests friends of friends, with their mutual friend count")
def _():
    eq(suggest_friends(sample_graph(), "ada"), [("dee", 2), ("eve", 1)])

@test("never suggests the user or someone they already know")
def _():
    eq(suggest_friends(sample_graph(), "bob"), [], "bob already knows everyone his friends know")
    eq(suggest_friends(sample_graph(), "eve"), [("ada", 1), ("cy", 1), ("dee", 1)])

@test("ties are broken alphabetically")
def _():
    graph = {"me": {"al"}, "al": {"me", "zed", "kim", "lou"}}
    eq(suggest_friends(graph, "me"), [("kim", 1), ("lou", 1), ("zed", 1)])

@test("a user missing from the graph gets no suggestions")
def _():
    eq(suggest_friends(sample_graph(), "zoe"), [])

@test("friends without an entry of their own are skipped")
def _():
    graph = {"me": {"ghost", "al"}, "al": {"me", "bea"}}
    eq(suggest_friends(graph, "me"), [("bea", 1)])

@test("returns a list of tuples")
def _():
    result = suggest_friends(sample_graph(), "ada")
    check(type(result) is list, "return a list")
    check(all(type(pair) is tuple for pair in result), "each suggestion should be a (name, count) tuple")

@test("doesn't modify the graph")
def _():
    graph = sample_graph()
    suggest_friends(graph, "ada")
    suggest_friends(graph, "zoe")
    eq(graph, sample_graph())
```

```hint
Count candidates with a `Counter` fed by a generator with two `for` clauses: for each of the user's friends, for each of *their* friends.
```

```hint
`friends.get(name, set())` covers people who have no entry. Skip `user` and anyone already in the user's own set of friends.
```

```hint
Sort the counter's items with `key=lambda item: (-item[1], item[0])`: count descending, then name. `most_common()` breaks ties by insertion order, not alphabetically.
```
:::

:::challenge id=exam-inverted-index title="An inverted index" difficulty=hard
Search engines look words up in an **inverted index**: a dict that maps each word to the set of documents that contain it. Write two functions:

- `build_index(docs)` takes a dict of document id → text and returns a plain dict of word → set of ids, built in a single pass over the documents.
- `search(index, query)` returns the sorted list of ids of the documents that contain **every** word of the query.

A word is what you get by splitting a text on whitespace, lowercasing it, and stripping the characters in `PUNCTUATION` from both ends; anything that strips down to nothing isn't a word. Queries are normalised the same way, and a repeated query word counts once. A query with no words matches nothing, and searching must never change the index.

```text
index = build_index({1: "A cat, a hat!", 2: "The cat sat.", 3: "A hat stand"})
search(index, "cat")        ->  [1, 2]
search(index, "Hat A")      ->  [1, 3]
search(index, "cat stand")  ->  []
```

```js
const words = (text) =>
  new Set(
    text.toLowerCase().split(/\s+/)
      .map((w) => w.replace(/^[.,;:!?"'()]+|[.,;:!?"'()]+$/g, ""))
      .filter(Boolean),
  );

function buildIndex(docs) {
  const index = new Map();
  for (const [id, text] of Object.entries(docs)) {
    for (const word of words(text)) {
      if (!index.has(word)) index.set(word, new Set());
      index.get(word).add(Number(id));        // Object.entries made the id a string
    }
  }
  return index;
}

function search(index, query) {
  const sets = [...words(query)].map((term) => index.get(term) ?? new Set());
  if (sets.length === 0) return [];
  return [...sets.reduce((a, b) => a.intersection(b))].sort((a, b) => a - b);
}
```

```python starter
PUNCTUATION = ".,;:!?\"'()"


def build_index(docs):
    ...


def search(index, query):
    ...
```

```python solution
from collections import defaultdict

PUNCTUATION = ".,;:!?\"'()"


def words(text):
    return {word for raw in text.lower().split() if (word := raw.strip(PUNCTUATION))}


def build_index(docs):
    index = defaultdict(set)
    for doc_id, text in docs.items():
        for word in words(text):
            index[word].add(doc_id)
    return dict(index)


def search(index, query):
    terms = words(query)
    if not terms:
        return []
    return sorted(set.intersection(*(index.get(term, set()) for term in terms)))
```

```python tests
import copy

DOCS = {
    3: "The cat sat on the mat.",
    1: "A cat, a hat!",
    2: "Mats and hats (on sale)",
    7: "THE CAT IS BACK",
}

@test("build_index maps each word to the ids that contain it")
def _():
    index = build_index({1: "A cat, a hat!", 2: "the cat"})
    eq(index, {"a": {1}, "cat": {1, 2}, "hat": {1}, "the": {2}})

@test("build_index returns a plain dict of sets")
def _():
    index = build_index(DOCS)
    check(type(index) is dict, f"expected a plain dict, got {type(index).__name__}")
    check(all(type(ids) is set for ids in index.values()), "every value should be a set of ids")
    with raises(KeyError):
        index["dog"]

@test("search returns the sorted ids of documents with every query word")
def _():
    index = build_index(DOCS)
    eq(search(index, "cat"), [1, 3, 7])
    eq(search(index, "the cat"), [3, 7])

@test("case and punctuation don't matter, in documents or queries")
def _():
    index = build_index(DOCS)
    eq(search(index, '"Cat!"'), [1, 3, 7])
    eq(search(index, "(sale)"), [2])

@test("a word that's in no document matches nothing")
def _():
    eq(search(build_index(DOCS), "cat dog"), [])

@test("a query with no words matches nothing")
def _():
    index = build_index(DOCS)
    eq(search(index, ""), [])
    eq(search(index, " ... !! "), [])

@test("repeated query words count once")
def _():
    eq(search(build_index(DOCS), "cat CAT cat."), [1, 3, 7])

@test("searching never changes the index")
def _():
    index = build_index(DOCS)
    snapshot = copy.deepcopy(index)
    search(index, "the cat")
    search(index, "on sale")
    search(index, "cat dog")
    eq(index, snapshot, "search() modified the index")
```

```hint
Normalise documents and queries with one helper that turns a text into its **set** of words. Sets make repeated words disappear for free, and a set comprehension with the walrus can strip and filter in one go.
```

```hint
Build the index with a `defaultdict(set)`, then return `dict(index)`, so a missing word raises `KeyError` instead of quietly being inserted.
```

```hint
`set.intersection(*sets)` intersects any number of sets and returns a new one, but it needs at least one, so handle the empty query first. Avoid `&=` on a set you got from the index: that would change the index itself.
```
:::
