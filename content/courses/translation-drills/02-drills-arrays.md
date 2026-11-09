---
title: "Drills: Array Methods"
part: Collections
summary: Port array chains to comprehensions, sum, next, any/all, key sorts, defaultdict, zip and slices.
minutes: 50
---

Ten drills on the Array methods you use every day. Most of the Python answers come out shorter than the JavaScript: a comprehension replaces a `filter().map()` chain, `sum`, `any`, `all` and `next` replace most `reduce` and `find` calls, and a `key=` function replaces the comparator. The tests probe the places where the two languages part ways: `zip` stops quietly at the shortest list, integer keys stay integers, a generator can be read only once, and `-30 % 7` is `5`, not `-2`.

## The mappings

| JavaScript | Python |
| --- | --- |
| `xs.filter(p).map(f)` | `[f(x) for x in xs if p(x)]` |
| `xs.reduce((sum, x) => sum + x, 0)` | `sum(xs)` |
| `xs.find(p) ?? null` | `next((x for x in xs if p(x)), None)` |
| `xs.some(p)`, `xs.every(p)` | `any(p(x) for x in xs)`, `all(p(x) for x in xs)` |
| `xs.flatMap(f)` | `[y for x in xs for y in f(x)]` |
| `xs.toSorted((a, b) => b.n - a.n)` | `sorted(xs, key=lambda x: -x["n"])` |
| `Object.groupBy(xs, f)` | a loop appending to a `defaultdict(list)` |
| `Array.from({ length: n }, (_, i) => f(i))` | `[f(i) for i in range(n)]` |
| `a.forEach((x, i) => use(x, b[i]))` | `for x, y in zip(a, b, strict=True):` |
| `xs.splice(i, n, ...ys)` | `xs[i:i + n] = ys` |

## Challenges

:::challenge id=drill-arr-paid-total title="filter, map, reduce → sum" difficulty=easy
Write `paid_total(orders: list[dict]) -> int` that adds up the `amount` (in cents) of every order whose `status` is `"paid"`.

```text
paid_total([{"status": "paid", "amount": 1200}, {"status": "refunded", "amount": 800}])  ->  1200
```

One `sum()` over a generator expression replaces the whole chain: the `if` clause filters, the expression in front maps, and `sum` reduces. It starts from `0`, so empty input needs no special case. (`reduce` without an initial value throws on an empty array.)

Refresher: [generator expressions](lesson:map-filter-reduce#generator-expressions-lazy-comprehensions) and [what replaces `reduce`](lesson:map-filter-reduce#reduce-and-what-replaces-it).

```js
const paidTotal = (orders) =>
  orders
    .filter((order) => order.status === "paid")
    .map((order) => order.amount)
    .reduce((sum, amount) => sum + amount, 0);
```

```python starter
def paid_total(orders: list[dict]) -> int:
    ...
```

```python solution
def paid_total(orders: list[dict]) -> int:
    return sum(order["amount"] for order in orders if order["status"] == "paid")
```

```python tests
ORDERS = [
    {"id": 1, "status": "paid", "amount": 1200},
    {"id": 2, "status": "refunded", "amount": 800},
    {"id": 3, "status": "paid", "amount": 350},
    {"id": 4, "status": "pending", "amount": 99},
]

@test("adds up only the paid orders")
def _():
    eq(paid_total(ORDERS), 1550)

@test("no orders, or no paid ones, gives 0")
def _():
    eq(paid_total([]), 0)
    eq(paid_total([{"id": 5, "status": "pending", "amount": 99}]), 0)

@test("one sum() over a generator expression")
def _():
    requires_call("sum", "sum() replaces the reduce")
    forbids_syntax(ast.For, "no loop statement: the generator expression inside sum() filters and maps")
```

```hint
`sum(expression for item in items if condition)` filters, maps and adds in one pass, without building a list.
```
:::

:::challenge id=drill-arr-find-errors title="find, findIndex, findLast" difficulty=easy
Write three functions over a list of log events (dicts with a `"level"` key):

- `first_error(events)` returns the first event whose level is `"error"`, or `None`;
- `first_error_index(events)` returns that event's index, or `-1`;
- `last_error(events)` returns the last such event, or `None`.

Lists have no `find` methods. `next()` takes an iterator and a default, so `next((x for x in xs if ...), None)` is `find`, `enumerate` supplies the index, and `reversed` searches from the end. Don't use `list.index()` here: it raises `ValueError` instead of returning `-1`.

Refresher: [`find`, `findIndex`, `some` and `every`](lesson:map-filter-reduce#find-findindex-some-and-every).

```js
const isError = (event) => event.level === "error";

const firstError = (events) => events.find(isError) ?? null;
const firstErrorIndex = (events) => events.findIndex(isError);
const lastError = (events) => events.findLast(isError) ?? null;
```

```python starter
def first_error(events: list[dict]) -> dict | None:
    ...


def first_error_index(events: list[dict]) -> int:
    ...


def last_error(events: list[dict]) -> dict | None:
    ...
```

```python solution
def is_error(event: dict) -> bool:
    return event["level"] == "error"


def first_error(events: list[dict]) -> dict | None:
    return next((event for event in events if is_error(event)), None)


def first_error_index(events: list[dict]) -> int:
    return next((i for i, event in enumerate(events) if is_error(event)), -1)


def last_error(events: list[dict]) -> dict | None:
    return next((event for event in reversed(events) if is_error(event)), None)
```

```python tests
EVENTS = [
    {"id": 1, "level": "info"},
    {"id": 2, "level": "error"},
    {"id": 3, "level": "warn"},
    {"id": 4, "level": "error"},
]
QUIET = [{"id": 5, "level": "info"}]

@test("first_error returns the first match")
def _():
    eq(first_error(EVENTS), {"id": 2, "level": "error"})

@test("first_error_index returns its position")
def _():
    eq(first_error_index(EVENTS), 1)

@test("an error at index 0 is found, not mistaken for 'missing'")
def _():
    eq(first_error_index([{"id": 6, "level": "error"}]), 0)

@test("last_error searches from the end")
def _():
    eq(last_error(EVENTS), {"id": 4, "level": "error"})

@test("last_error leaves the list in its original order")
def _():
    events = [{"id": 7, "level": "error"}, {"id": 8, "level": "info"}, {"id": 9, "level": "error"}]
    last_error(events)
    eq([event["id"] for event in events], [7, 8, 9])

@test("no match gives None, -1 and None, never an exception")
def _():
    eq((first_error(QUIET), first_error_index(QUIET), last_error(QUIET)), (None, -1, None))
    eq((first_error([]), first_error_index([]), last_error([])), (None, -1, None))

@test("next() instead of loops")
def _():
    forbids_syntax(ast.For, "use next(<generator expression>, default) instead of a for loop")
```

```hint
`next(iterator, default)` returns the first item the iterator yields, or `default` if it yields nothing.
```

```hint
`enumerate(events)` yields `(index, event)` pairs, and `reversed(events)` walks the list backwards without copying it.
```
:::

:::challenge id=drill-arr-some-every title="some and every" difficulty=easy
Write `has_admin(users: list[dict]) -> bool` and `all_verified(users: list[dict]) -> bool`.

`some` is `any()` and `every` is `all()`. They agree with JavaScript on empty input (`any([])` is `False`, `all([])` is `True`), and they stop at the first user that settles the answer, as long as you pass a **generator expression**. Square brackets, as in `any([...])`, build the whole list first, which touches every user, and the tests include a record that blows up when touched.

Refresher: [conditional expressions, `any()` and `all()`](lesson:truthiness-and-equality#conditional-expressions-any-and-all).

```js
const hasAdmin = (users) => users.some((user) => user.roles.includes("admin"));
const allVerified = (users) => users.every((user) => user.verified);
```

```python starter
def has_admin(users: list[dict]) -> bool:
    ...


def all_verified(users: list[dict]) -> bool:
    ...
```

```python solution
def has_admin(users: list[dict]) -> bool:
    return any("admin" in user["roles"] for user in users)


def all_verified(users: list[dict]) -> bool:
    return all(user["verified"] for user in users)
```

```python tests
@test("has_admin finds an admin anywhere in the list")
def _():
    eq(has_admin([{"roles": ["dev"]}, {"roles": ["dev", "admin"]}]), True)
    eq(has_admin([{"roles": ["dev"]}, {"roles": []}]), False)

@test("all_verified needs every user verified")
def _():
    eq(all_verified([{"verified": True}, {"verified": True}]), True)
    eq(all_verified([{"verified": True}, {"verified": False}]), False)

@test("empty lists: some is False, every is True")
def _():
    eq(has_admin([]), False)
    eq(all_verified([]), True)

@test("both stop at the first user that settles the answer")
def _():
    half_imported = {"name": "no roles or verified flag yet"}
    eq(has_admin([{"roles": ["admin"]}, half_imported]), True)
    eq(all_verified([{"verified": False}, half_imported]), False)

@test("any() and all(), not loops")
def _():
    forbids_syntax(ast.For, "any() and all() over generator expressions replace the loops")
```

```hint
`any(condition for user in users)` is `users.some(...)`. Leave out the square brackets, so it stays lazy.
```
:::

:::challenge id=drill-arr-flatmap-tags title="flat and flatMap" difficulty=easy
Write `flatten(rows: list[list]) -> list`, which removes **one** level of nesting like `rows.flat()`, and `all_tags(posts: list[dict]) -> list[str]`, which returns every post's tags lowercased, in order, duplicates included.

Both become a comprehension with two `for` clauses, written in the order you'd nest the loops: `[item for row in rows for item in row]`.

Refresher: [`flat` and `flatMap` → multiple `for` clauses](lesson:map-filter-reduce#flat-and-flatmap-multiple-for-clauses).

```js
const flatten = (rows) => rows.flat();

const allTags = (posts) =>
  posts.flatMap((post) => post.tags.map((tag) => tag.toLowerCase()));
```

```python starter
def flatten(rows: list[list]) -> list:
    ...


def all_tags(posts: list[dict]) -> list[str]:
    ...
```

```python solution
def flatten(rows: list[list]) -> list:
    return [item for row in rows for item in row]


def all_tags(posts: list[dict]) -> list[str]:
    return [tag.lower() for post in posts for tag in post["tags"]]
```

```python tests
POSTS = [
    {"id": 1, "tags": ["Python", "JS"]},
    {"id": 2, "tags": []},
    {"id": 3, "tags": ["python", "Async"]},
]

@test("flatten removes one level of nesting")
def _():
    eq(flatten([[1, 2], [3], []]), [1, 2, 3])

@test("flatten goes only one level deep, like flat()")
def _():
    eq(flatten([[1, [2, 3]], [[4]]]), [1, [2, 3], [4]])

@test("all_tags lowercases every tag and keeps the order")
def _():
    eq(all_tags(POSTS), ["python", "js", "python", "async"])

@test("empty inputs give empty lists")
def _():
    eq(flatten([]), [])
    eq(all_tags([]), [])

@test("comprehensions, not loops")
def _():
    forbids_syntax(ast.For, "nested for clauses in one comprehension replace flat() and flatMap()")
```

```hint
Read the clauses left to right as nested loops, `for post in posts`, then `for tag in post["tags"]`. The expression at the front, `tag.lower()`, is what gets collected.
```
:::

:::challenge id=drill-arr-sort-products title="Comparator → key" difficulty=medium
Write `rank_products(products: list[dict]) -> list[str]` that returns the product names in this order: in-stock products first, then higher `rating` first, then lower `price` first, then by name, ignoring case. Don't reorder the input list.

A `key=` function replaces the comparator. Return a tuple and Python compares it item by item, which gives you the `||` chain for free. Negate a number to sort it descending. `False` sorts before `True`, so `not p["in_stock"]` puts in-stock products first, and `str.casefold()` (a more thorough `lower()`) ignores case.

Refresher: [Sorting and reversing](lesson:lists#sorting-and-reversing) and [comparing tuples](lesson:tuples-and-unpacking#comparing-tuples).

```js
const rankProducts = (products) =>
  products
    .toSorted(
      (a, b) =>
        Number(b.inStock) - Number(a.inStock) ||
        b.rating - a.rating ||
        a.price - b.price ||
        a.name.localeCompare(b.name, "en", { sensitivity: "base" }),
    )
    .map((product) => product.name);
```

```python starter
def rank_products(products: list[dict]) -> list[str]:
    ...
```

```python solution
def rank_products(products: list[dict]) -> list[str]:
    ranked = sorted(
        products,
        key=lambda p: (not p["in_stock"], -p["rating"], p["price"], p["name"].casefold()),
    )
    return [p["name"] for p in ranked]
```

```python tests
PRODUCTS = [
    {"name": "Kettle", "in_stock": True, "rating": 4.5, "price": 30},
    {"name": "toaster", "in_stock": False, "rating": 5.0, "price": 25},
    {"name": "blender", "in_stock": True, "rating": 4.5, "price": 30},
    {"name": "mixer", "in_stock": True, "rating": 4.8, "price": 120},
    {"name": "grinder", "in_stock": True, "rating": 4.5, "price": 18},
]

@test("in-stock products come first")
def _():
    eq(rank_products(PRODUCTS)[-1], "toaster")

@test("then the highest rating")
def _():
    eq(rank_products(PRODUCTS)[0], "mixer")

@test("then the lowest price")
def _():
    eq(rank_products(PRODUCTS)[1], "grinder")

@test("then the name, ignoring case")
def _():
    eq(rank_products(PRODUCTS), ["mixer", "grinder", "blender", "Kettle", "toaster"])

@test("doesn't reorder the input")
def _():
    products = [dict(p) for p in PRODUCTS]
    rank_products(products)
    eq([p["name"] for p in products], ["Kettle", "toaster", "blender", "mixer", "grinder"])

@test("a key function, not a comparator")
def _():
    forbids_call("cmp_to_key", "a key tuple replaces the whole || chain")
    check(
        any(isinstance(node, ast.keyword) and node.arg == "key" for node in ast.walk(tree)),
        "pass key=... to sorted()",
    )
```

```hint
`sorted(products, key=lambda p: (first, second, ...))` sorts by `first`, breaks ties with `second`, and so on.
```

```hint
`-p["rating"]` sorts ratings high to low, and `not p["in_stock"]` is `False`, which sorts first, for products in stock.
```
:::

:::challenge id=drill-arr-group-totals title="groupBy, then summarize" difficulty=medium
Write `stats_by_year(posts: list[dict]) -> dict[int, dict]` that groups posts by `year` and returns `{"count": ..., "views": ...}` for each year.

```text
stats_by_year([{"year": 2024, "views": 120}, {"year": 2022, "views": 30}, {"year": 2024, "views": 80}])
->  {2024: {'count': 2, 'views': 200}, 2022: {'count': 1, 'views': 30}}
```

Two JavaScript quirks don't survive the port, and the tests check both. Object keys are always strings, so the JavaScript hands back `"2024"`, and integer-like keys are listed in ascending order instead of insertion order. A dict keeps the `int` keys, in the order they first appeared.

Refresher: [`defaultdict`](lesson:dicts#defaultdict-no-more-create-it-if-it-s-missing) and [grouping and partitioning](lesson:map-filter-reduce#grouping-and-partitioning).

```js
function statsByYear(posts) {
  const groups = Object.groupBy(posts, (post) => post.year);
  return Object.fromEntries(
    Object.entries(groups).map(([year, items]) => [
      year,
      { count: items.length, views: items.reduce((sum, post) => sum + post.views, 0) },
    ]),
  );
}
```

```python starter
def stats_by_year(posts: list[dict]) -> dict[int, dict]:
    ...
```

```python solution
from collections import defaultdict


def stats_by_year(posts: list[dict]) -> dict[int, dict]:
    groups = defaultdict(list)
    for post in posts:
        groups[post["year"]].append(post)
    return {
        year: {"count": len(items), "views": sum(post["views"] for post in items)}
        for year, items in groups.items()
    }
```

```python tests
POSTS = [
    {"title": "Hello again", "year": 2024, "views": 120},
    {"title": "Old news", "year": 2022, "views": 30},
    {"title": "Still here", "year": 2024, "views": 80},
    {"title": "Retro", "year": 2023, "views": 0},
]

@test("counts and sums per year")
def _():
    eq(stats_by_year(POSTS), {
        2024: {"count": 2, "views": 200},
        2022: {"count": 1, "views": 30},
        2023: {"count": 1, "views": 0},
    })

@test("years stay ints")
def _():
    result = stats_by_year(POSTS)
    check(2024 in result and "2024" not in result, "the keys should be int years, not strings")

@test("years appear in order of first appearance")
def _():
    eq(list(stats_by_year(POSTS)), [2024, 2022, 2023])

@test("no posts, no years")
def _():
    eq(stats_by_year([]), {})

@test("an unknown year raises KeyError")
def _():
    raises(KeyError, lambda: stats_by_year(POSTS)[1999])

@test("no 'is the key there yet?' check")
def _():
    forbids_syntax(ast.If, "defaultdict(list) (or setdefault) creates each group for you")
```

```hint
`groups = defaultdict(list)` creates each list on first use, so `groups[post["year"]].append(post)` needs no check.
```

```hint
Then build the summary with a dict comprehension over `groups.items()`: `len(items)` counts, and `sum(...)` over a generator expression adds up the views.
```
:::

:::challenge id=drill-arr-price-changes title="Parallel arrays → zip" difficulty=medium
Write `price_changes(names: list[str], old_prices: list[int], new_prices: list[int]) -> list[str]` that returns `"name: old -> new"` for every product whose price changed, in order. Raise `ValueError` if the three lists aren't the same length.

```text
price_changes(["tea", "milk", "jam"], [350, 120, 425], [375, 120, 450])
->  ['tea: 350 -> 375', 'jam: 425 -> 450']
```

`zip` walks several lists in step, so there's no index to manage. Plain `zip` stops quietly at the shortest list, which would hide exactly the bug the JavaScript checks for. `zip(..., strict=True)` (3.10+) raises `ValueError` instead.

Refresher: [Two arrays at once: `zip()`](lesson:control-flow#two-arrays-at-once-zip).

```js
function priceChanges(names, oldPrices, newPrices) {
  if (oldPrices.length !== names.length || newPrices.length !== names.length) {
    throw new RangeError("all three arrays must have the same length");
  }
  const changes = [];
  for (let i = 0; i < names.length; i++) {
    if (oldPrices[i] !== newPrices[i]) {
      changes.push(`${names[i]}: ${oldPrices[i]} -> ${newPrices[i]}`);
    }
  }
  return changes;
}
```

```python starter
def price_changes(names: list[str], old_prices: list[int], new_prices: list[int]) -> list[str]:
    ...
```

```python solution
def price_changes(names: list[str], old_prices: list[int], new_prices: list[int]) -> list[str]:
    return [
        f"{name}: {old} -> {new}"
        for name, old, new in zip(names, old_prices, new_prices, strict=True)
        if old != new
    ]
```

```python tests
@test("reports the prices that changed, in order")
def _():
    eq(
        price_changes(["tea", "milk", "jam"], [350, 120, 425], [375, 120, 450]),
        ["tea: 350 -> 375", "jam: 425 -> 450"],
    )

@test("drops and rises both count, from zero too")
def _():
    eq(price_changes(["a", "b"], [500, 0], [450, 99]), ["a: 500 -> 450", "b: 0 -> 99"])

@test("no changes, no lines")
def _():
    eq(price_changes(["tea"], [350], [350]), [])
    eq(price_changes([], [], []), [])

@test("lists of different lengths raise ValueError")
def _():
    raises(ValueError, price_changes, ["tea", "milk"], [350, 120], [375])
    raises(ValueError, price_changes, ["tea"], [350, 120], [375, 120])

@test("zip, not indices")
def _():
    forbids_call("range", "zip() pairs the lists up; there's no index to manage")
```

```hint
`for name, old, new in zip(names, old_prices, new_prices)` unpacks each triple as it goes.
```

```hint
The whole thing fits in one list comprehension with an `if old != new` clause, and `strict=True` goes inside the `zip(...)` call.
```
:::

:::challenge id=drill-arr-partition title="Partition in one pass" difficulty=medium
Write `partition(items, predicate) -> tuple[list, list]` that returns `(matches, rest)`: the items for which `predicate(item)` is truthy, then all the others, each in their original order.

Make a single pass. `items` can be a one-shot generator, and `predicate` may be expensive, so call it exactly once per item. That rules out the tempting pair of comprehensions. The reducer in the JavaScript version also copies both arrays on every step, which makes it quadratic; two lists and a loop are simpler, and linear.

Refresher: [Partitioning](lesson:map-filter-reduce#partitioning) and [returning multiple values](lesson:tuples-and-unpacking#returning-multiple-values).

```js
const partition = (items, predicate) =>
  items.reduce(
    ([matches, rest], item) =>
      predicate(item) ? [[...matches, item], rest] : [matches, [...rest, item]],
    [[], []],
  );
```

```python starter
def partition(items, predicate) -> tuple[list, list]:
    ...
```

```python solution
def partition(items, predicate) -> tuple[list, list]:
    matches, rest = [], []
    for item in items:
        (matches if predicate(item) else rest).append(item)
    return matches, rest
```

```python tests
def is_even(n):
    return n % 2 == 0

@test("splits by the predicate, keeping order")
def _():
    eq(partition([1, 2, 3, 4, 5, 6], is_even), ([2, 4, 6], [1, 3, 5]))

@test("empty input gives two empty lists")
def _():
    eq(partition([], is_even), ([], []))

@test("falsy items go wherever the predicate puts them")
def _():
    eq(partition([0, "", None, 5], lambda x: x is None), ([None], [0, "", 5]))

@test("calls the predicate once per item")
def _():
    calls = []
    def tracked(n):
        calls.append(n)
        return n > 1
    partition([1, 2, 3], tracked)
    eq(calls, [1, 2, 3])

@test("works with a one-shot generator")
def _():
    eq(partition((n for n in range(6)), is_even), ([0, 2, 4], [1, 3, 5]))
```

```hint
A conditional expression can choose which list to append to: `(matches if predicate(item) else rest).append(item)`.
```

```hint
Return both lists at once with `return matches, rest`, and the caller unpacks them: `evens, odds = partition(nums, is_even)`.
```
:::

:::challenge id=drill-arr-month-grid title="Calendar grid" difficulty=hard
Write `month_grid(days_in_month: int, first_weekday: int) -> list[list[int | None]]` that lays a month out in weeks of seven cells, Monday first. `first_weekday` is the column of day 1, from 0 (Monday) to 6 (Sunday). Fill the cells before day 1 and after the last day with `None`, so every week has exactly seven cells.

```text
month_grid(30, 2)  ->  [[None, None, 1, 2, 3, 4, 5],
                        [6, 7, 8, 9, 10, 11, 12],
                        [13, 14, 15, 16, 17, 18, 19],
                        [20, 21, 22, 23, 24, 25, 26],
                        [27, 28, 29, 30, None, None, None]]
```

`Array(n).fill(null)` is `[None] * n`, `Array.from({ length: n }, (_, i) => i + 1)` is `list(range(1, n + 1))`, and the chunking `Array.from` becomes a list comprehension over `range(0, len(cells), 7)`. You don't need the `while` loop that pads the last week, either. Python's `%` takes the sign of the divisor, so `-len(cells) % 7` is never negative: it's exactly the number of cells missing.

Refresher: [Creating lists](lesson:lists#creating-lists) and [Division: `/`, `//`, `%` and `divmod`](lesson:numbers-and-math#division-and-divmod).

```js
function monthGrid(daysInMonth, firstWeekday) {
  const cells = [
    ...Array(firstWeekday).fill(null),
    ...Array.from({ length: daysInMonth }, (_, i) => i + 1),
  ];
  while (cells.length % 7 !== 0) cells.push(null);
  return Array.from({ length: cells.length / 7 }, (_, week) =>
    cells.slice(week * 7, week * 7 + 7),
  );
}
```

```python starter
def month_grid(days_in_month: int, first_weekday: int) -> list[list[int | None]]:
    ...
```

```python solution
def month_grid(days_in_month: int, first_weekday: int) -> list[list[int | None]]:
    cells = [None] * first_weekday + list(range(1, days_in_month + 1))
    cells += [None] * (-len(cells) % 7)
    return [cells[i:i + 7] for i in range(0, len(cells), 7)]
```

```python tests
@test("pads the first and last weeks with None")
def _():
    eq(month_grid(30, 2), [
        [None, None, 1, 2, 3, 4, 5],
        [6, 7, 8, 9, 10, 11, 12],
        [13, 14, 15, 16, 17, 18, 19],
        [20, 21, 22, 23, 24, 25, 26],
        [27, 28, 29, 30, None, None, None],
    ])

@test("28 days starting on a Monday fill exactly four weeks")
def _():
    grid = month_grid(28, 0)
    eq(len(grid), 4)
    eq(grid[0], [1, 2, 3, 4, 5, 6, 7])
    eq(grid[-1], [22, 23, 24, 25, 26, 27, 28])

@test("31 days starting on a Sunday need six weeks")
def _():
    grid = month_grid(31, 6)
    eq(len(grid), 6)
    eq(grid[0], [None, None, None, None, None, None, 1])
    eq(grid[-1], [30, 31, None, None, None, None, None])

@test("every week has seven cells")
def _():
    for days in (28, 29, 30, 31):
        for start in range(7):
            weeks = month_grid(days, start)
            check(all(len(week) == 7 for week in weeks), f"month_grid({days}, {start}) has a week without 7 cells")

@test("the days run from 1 to the last day, in order")
def _():
    for days in (28, 29, 30, 31):
        for start in range(7):
            weeks = month_grid(days, start)
            eq([day for week in weeks for day in week if day is not None], list(range(1, days + 1)))

@test("weeks are independent lists")
def _():
    grid = month_grid(30, 2)
    grid[1][0] = "X"
    eq([week[0] for week in grid], [None, "X", 13, 20, 27])

@test("Python's % does the padding")
def _():
    forbids_syntax(ast.While, "-len(cells) % 7 is the padding you need; no while loop")
```

```hint
`[None] * first_weekday + list(range(1, days_in_month + 1))` builds the cells.
```

```hint
In JavaScript `-30 % 7` is `-2`, but in Python it's `5`: exactly the padding that makes 30 cells a multiple of 7.
```

```hint
`range(0, len(cells), 7)` yields the first index of each week, and `cells[i:i + 7]` slices the week out.
```
:::

:::challenge id=drill-arr-splice title="Port splice()" difficulty=hard
Write `splice(xs: list, start: int, delete_count: int | None = None, *items) -> list` that behaves like `Array.prototype.splice`: remove `delete_count` items from `xs` starting at `start`, insert `items` in their place, **mutate `xs` in place**, and return the removed items as a new list.

- A negative `start` counts from the end. A start before the beginning clamps to `0`, and one past the end clamps to `len(xs)`.
- `delete_count=None` (left out) removes everything from `start` on, a negative count removes nothing, and a count that runs past the end stops there.

```text
xs = [1, 2, 3, 4, 5]
splice(xs, 1, 2, "a", "b", "c")  ->  [2, 3]   and xs is now [1, 'a', 'b', 'c', 4, 5]
splice(xs, -1, 1)                ->  [5]      and xs is now [1, 'a', 'b', 'c', 4]
```

Slice assignment does the heavy lifting: `xs[i:j] = items` replaces a region with any number of items, and a slice that runs past the end is clamped for you. Normalize a negative `start` first, though. Python reads `xs[-1:-1 + 1]` as `xs[-1:0]`, which is empty.

Refresher: [Adding and removing](lesson:lists#adding-and-removing-push-pop-shift-unshift-splice) and [`*args`](lesson:functions#args-kwargs-and-spreading).

```js
// A polyfill of Array.prototype.splice
function splice(xs, start, deleteCount = Infinity, ...items) {
  const len = xs.length;
  const from = start < 0 ? Math.max(len + start, 0) : Math.min(start, len);
  const count = Math.min(Math.max(deleteCount, 0), len - from);
  const removed = xs.slice(from, from + count);
  const tail = xs.slice(from + count);
  xs.length = from;
  xs.push(...items, ...tail);
  return removed;
}
```

```python starter
def splice(xs: list, start: int, delete_count: int | None = None, *items) -> list:
    ...
```

```python solution
def splice(xs: list, start: int, delete_count: int | None = None, *items) -> list:
    n = len(xs)
    start = max(n + start, 0) if start < 0 else min(start, n)
    stop = n if delete_count is None else start + max(delete_count, 0)
    removed = xs[start:stop]
    xs[start:stop] = items
    return removed
```

```python tests
@test("removes items and returns them")
def _():
    xs = [1, 2, 3, 4, 5]
    eq(splice(xs, 1, 2), [2, 3])
    eq(xs, [1, 4, 5])

@test("inserts the new items in their place")
def _():
    xs = [1, 2, 3, 4, 5]
    eq(splice(xs, 1, 2, "a", "b", "c"), [2, 3])
    eq(xs, [1, "a", "b", "c", 4, 5])

@test("a count of 0 only inserts")
def _():
    xs = ["a", "d"]
    eq(splice(xs, 1, 0, "b", "c"), [])
    eq(xs, ["a", "b", "c", "d"])

@test("no count removes everything from start on")
def _():
    xs = [1, 2, 3, 4]
    eq(splice(xs, 2), [3, 4])
    eq(xs, [1, 2])

@test("a negative start counts from the end")
def _():
    xs = [1, 2, 3, 4]
    eq(splice(xs, -1, 1), [4])
    eq(xs, [1, 2, 3])
    ys = [1, 2, 3, 4]
    eq(splice(ys, -2, 1, "x", "y"), [3])
    eq(ys, [1, 2, "x", "y", 4])

@test("starts and counts out of range are clamped")
def _():
    xs = [1, 2, 3]
    eq(splice(xs, 10, 1, "end"), [])
    eq(xs, [1, 2, 3, "end"])
    ys = [1, 2, 3]
    eq(splice(ys, -10, 2), [1, 2])
    eq(ys, [3])
    zs = [1, 2, 3]
    eq(splice(zs, 1, 99), [2, 3])
    eq(zs, [1])

@test("a negative count removes nothing")
def _():
    xs = [1, 2, 3]
    eq(splice(xs, 1, -2, "x"), [])
    eq(xs, [1, "x", 2, 3])

@test("slices, not loops")
def _():
    forbids_syntax((ast.For, ast.While), "slice assignment replaces the whole region at once")
```

```hint
Normalize `start` first: `max(len(xs) + start, 0)` when it's negative, `min(start, len(xs))` otherwise.
```

```hint
`removed = xs[start:stop]` copies the doomed region, then `xs[start:stop] = items` replaces it in place, even with a different number of items.
```
:::
