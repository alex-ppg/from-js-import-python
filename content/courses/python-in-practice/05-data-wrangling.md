---
title: Data Wrangling with the Standard Library
part: Files & Data
summary: Group, aggregate, join, pivot, clean and report on lists of dicts with collections, statistics and heapq.
minutes: 40
---

In JavaScript, wrangling an array of objects means a chain of `filter`, `map` and `reduce`, a few lodash helpers, or both. Python's answer is a small kit that ships with the language: comprehensions for filtering and projecting, `collections` for grouping and counting, `heapq` and `itertools` for ordering and windows, and `statistics` for the maths. For the thousands-of-rows jobs that make up most scripts and ETL glue, you need nothing else. The mental shift: instead of one long method chain, write a few **named steps**, each a comprehension or a short loop, and let dicts do the indexing that a `find` inside a `map` would do in JS.

This lesson assumes [Comprehensions](lesson:map-filter-reduce) and the [`defaultdict` and `Counter`](lesson:dicts#specialised-mappings) basics. Loading the rows from CSV or JSON is the job of [CSV, JSON & Config Files](lesson:data-formats); here they start as literals.

## Records: lists of dicts

:::compare
```js
const orders = [
  { id: 1, customer: "ada", region: "EU", amount: 120 },
  { id: 2, customer: "linus", region: "EU", amount: 80 },
  { id: 3, customer: "grace", region: "US", amount: 200 },
];
const bigEu = orders
  .filter((o) => o.region === "EU" && o.amount >= 100)
  .map(({ id, amount }) => ({ id, amount }));
```
```python
orders = [
    {"id": 1, "customer": "ada", "region": "EU", "amount": 120},
    {"id": 2, "customer": "linus", "region": "EU", "amount": 80},
    {"id": 3, "customer": "grace", "region": "US", "amount": 200},
]
big_eu = [
    {"id": o["id"], "amount": o["amount"]}
    for o in orders if o["region"] == "EU" and o["amount"] >= 100
]
```
:::

A list of dicts is the lingua franca: it's what `json.load` and `csv.DictReader` hand you, and it's what lodash calls a collection. One comprehension does the `filter` and the `map` together. Two helpers keep projections short. `operator.itemgetter("customer", "amount")` builds a function that pulls several fields out as a tuple, and a dict comprehension over a few keys is lodash's `_.pick`.

```python run
from operator import itemgetter

orders = [
    {"id": 1, "customer": "ada", "region": "EU", "amount": 120},
    {"id": 2, "customer": "linus", "region": "EU", "amount": 80},
    {"id": 3, "customer": "grace", "region": "US", "amount": 200},
]

def pick(record, *keys):                       # lodash's _.pick
    return {k: record[k] for k in keys}

print([pick(o, "id", "amount") for o in orders if o["amount"] >= 100])
customer_and_amount = itemgetter("customer", "amount")
print([customer_and_amount(o) for o in orders])
print(sum(o["amount"] for o in orders if o["region"] == "EU"))
```

:::pythonic Name the steps
A ten-link method chain becomes three or four assignments, each a comprehension or a generator expression with a name that says what it holds (`paid`, `eu_paid`, `totals`). You can `print` any step while debugging, and generator expressions keep the pipeline lazy until the final `sum`, `sorted` or `list`. [Comprehensions](lesson:map-filter-reduce#method-chains-become-named-steps) shows the pattern.
:::

:::tip Dicts at the edges, dataclasses inside
When you own the shape of a record and keep it around, a `@dataclass(frozen=True)` catches typos that a dict key never will, and `operator.attrgetter` replaces `itemgetter` ([Dataclasses](lesson:dataclasses-and-enums)). Dicts stay the natural format at the boundaries, where JSON and CSV arrive. The techniques in this lesson work on either: swap `row["field"]` for `row.field`.
:::

## Grouping and counting

:::compare
```js
_.groupBy(orders, "region");               // { EU: [...], US: [...] }
_.countBy(orders, "region");               // { EU: 2, US: 1 }
_.countBy(orders, (o) => `${o.region}|${o.month}`);  // a composite key, as a string
```
```python
group_by(orders, itemgetter("region"))     # a five-line helper, below
Counter(o["region"] for o in orders)       # Counter({'EU': 2, 'US': 1})
Counter((o["region"], o["month"]) for o in orders)   # a composite key, as a tuple
```
:::

Python has no `groupBy` builtin, so most codebases carry the helper below, a `defaultdict(list)` loop with the key function as a parameter. Counting needs no helper at all: `Counter` takes any iterable of keys.

The habit to drop is gluing composite keys into strings. A tuple is hashable, so `(region, month)` is a perfectly good dict key: nothing to `split("|")` later, no collisions when a value contains the separator, and the parts keep their types. `itemgetter("region", "month")` returns exactly that tuple.

```python run
from collections import Counter, defaultdict
from operator import itemgetter

orders = [
    {"region": "EU", "month": "2024-01", "amount": 120},
    {"region": "US", "month": "2024-01", "amount": 200},
    {"region": "EU", "month": "2024-02", "amount": 80},
    {"region": "EU", "month": "2024-01", "amount": 45},
]

def group_by(rows, key):
    groups = defaultdict(list)
    for row in rows:
        groups[key(row)].append(row)
    return dict(groups)

for (region, month), rows in group_by(orders, itemgetter("region", "month")).items():
    print(region, month, [r["amount"] for r in rows])
print(Counter(o["region"] for o in orders).most_common())
```

`itertools.groupby` is the other option, and it [groups runs, not keys](lesson:map-filter-reduce#itertools-groupby-groups-runs-not-keys). After sorting by the same key it does give one group per key, and it streams: handy when the rows come from a file that's already sorted.

## Aggregating per group

:::compare
```js
_.mapValues(_.groupBy(orders, "region"), (rows) => ({
  orders: rows.length,
  revenue: _.sumBy(rows, "amount"),
  average: _.meanBy(rows, "amount"),
  largest: _.maxBy(rows, "amount").amount,
}));
```
```python
{
    region: {
        "orders": len(rows),
        "revenue": sum(r["amount"] for r in rows),
        "average": mean(r["amount"] for r in rows),
        "largest": max(r["amount"] for r in rows),
    }
    for region, rows in group_by(orders, itemgetter("region")).items()
}
```
:::

Once rows are grouped, a dict comprehension over `groups.items()` is `_.mapValues`, and each aggregate is a builtin over a generator expression: `len`, `sum`, `min`, `max`, or `statistics.mean`. When the input is large or arrives as a stream, skip the grouping and keep running totals in one pass. A `Counter` is a dict of sums, so it handles single-metric aggregates; for several metrics, give each group a small accumulator.

```python run
from collections import Counter, defaultdict

orders = [
    {"region": "EU", "amount": 120}, {"region": "US", "amount": 200},
    {"region": "EU", "amount": 80}, {"region": "EU", "amount": 45},
]

revenue = Counter()
stats = defaultdict(lambda: {"orders": 0, "largest": 0})   # a fresh dict per region
for o in orders:
    revenue[o["region"]] += o["amount"]
    s = stats[o["region"]]
    s["orders"] += 1
    s["largest"] = max(s["largest"], o["amount"])

for region, s in stats.items():
    average = revenue[region] / s["orders"]
    print(f"{region}: orders={s['orders']} revenue={revenue[region]} avg={average:.2f} max={s['largest']}")
```

:::gotcha The default factory must build a new object
`defaultdict` takes a *function* and calls it for every missing key. `defaultdict({"orders": 0})` raises `TypeError` because a dict isn't callable, and the tempting fix, `template = {...}` then `defaultdict(lambda: template)`, hands every group the *same* dict, so all the regions share one set of totals. Build the object inside the lambda, as above, or use a dataclass as the factory.
:::

## Sorting by several keys

:::compare
```js
_.orderBy(orders, ["amount", "customer"], ["desc", "asc"]);
_.orderBy(orders, ["region", "customer"], ["desc", "asc"]);

_.sortBy(orders, (o) => o.customer.toLowerCase());
```
```python
sorted(orders, key=lambda o: (-o["amount"], o["customer"]))
by_customer = sorted(orders, key=itemgetter("customer"))      # secondary key first,
by_region = sorted(by_customer, key=itemgetter("region"), reverse=True)  # then primary
sorted(orders, key=lambda o: o["customer"].casefold())
```
:::

Multi-key sorting is a tuple key, as [Lists](lesson:lists#sorting-and-reversing) showed: tuples compare field by field, which gives you `orderBy` with several columns. Negating a number flips that field to descending, but strings and dates can't be negated. For those, lean on stability. Sort by the least important key first, then by the most important one, each pass with its own `reverse=`. Python's sort is stable, `reverse=True` included, so the earlier order survives among equal keys.

```python run
from operator import itemgetter

orders = [
    {"customer": "linus", "region": "EU", "amount": 80},
    {"customer": "ada", "region": "US", "amount": 200},
    {"customer": "grace", "region": "EU", "amount": 120},
    {"customer": "alan", "region": "US", "amount": 200},
]
by_amount = sorted(orders, key=lambda o: (-o["amount"], o["customer"]))
print([o["customer"] for o in by_amount])

step1 = sorted(orders, key=itemgetter("customer"))              # secondary: A to Z
step2 = sorted(step1, key=itemgetter("region"), reverse=True)   # primary: Z to A
print([(o["region"], o["customer"]) for o in step2])
```

Missing values break sorting outright. A JavaScript comparator such as `b.stars - a.stars` quietly treats `null` as `0`; Python raises `TypeError` the moment it compares `None` with a number. Put a flag in front so `None` is only ever compared with `None`:

```python run raises
ratings = [{"name": "tea", "stars": 4.5}, {"name": "pie", "stars": None}, {"name": "cake", "stars": 4.8}]

best_first = sorted(ratings, key=lambda r: (r["stars"] is not None, r["stars"]), reverse=True)
print([r["name"] for r in best_first])            # missing ratings sink to the end
print(sorted(r["stars"] for r in ratings))        # TypeError: None vs float
```

## Joining datasets

:::compare
```js
const customersById = _.keyBy(customers, "id");
const enriched = orders.map((o) => ({
  ...o,
  tier: customersById[o.customerId]?.tier ?? null,
}));
```
```python
customers_by_id = {c["id"]: c for c in customers}
enriched = [
    o | {"tier": customers_by_id.get(o["customer_id"], {}).get("tier")}
    for o in orders
]
```
:::

A join is an index plus a lookup. Build a dict keyed by the join field once (lodash's `keyBy`), and every lookup after that is O(1). The tempting alternative, a `next(...)` search inside the comprehension (`find` inside `map`), rescans the other list for every row. That's fine for ten rows and painful for a hundred thousand.

`dict | dict` (3.9+) merges into a **new** dict, as `{ ...o, tier }` does, and leaves the input rows untouched. `.get()` gives a left join, where unmatched rows get `None`. An `if` on membership gives an inner join. Set operations on the keys find the rows with no partner at all, an anti-join; dict key views support `-` and `&` directly.

```python run
customers = [
    {"id": "c1", "name": "Ada", "tier": "gold"},
    {"id": "c2", "name": "Linus", "tier": "free"},
]
orders = [
    {"id": 1, "customer_id": "c1", "amount": 120},
    {"id": 2, "customer_id": "c9", "amount": 80},
    {"id": 3, "customer_id": "c1", "amount": 45},
]
by_id = {c["id"]: c for c in customers}

left = [o | {"tier": by_id.get(o["customer_id"], {}).get("tier")} for o in orders]
print([o["tier"] for o in left])
inner = [o | by_id[o["customer_id"]] for o in orders if o["customer_id"] in by_id]
print(inner[0])                                       # whose "id" is that?
print({o["customer_id"] for o in orders} - by_id.keys())   # orders with no customer
```

:::gotcha Merging rows can overwrite fields
`o | customer` lets the right-hand side win, exactly like `{ ...o, ...customer }`, so the customer's `"id"` replaced the order's `id` above, silently. When both sides share field names, copy the fields you need under new names (`"customer_name": c["name"]`) instead of merging whole records.
:::

The other direction, nesting the orders under each customer, is grouping again: index the orders with `defaultdict(list)` keyed by `customer_id`, then read `orders_by_customer.get(c["id"], [])` for each customer. The second challenge below builds exactly that.

## Reshaping: transpose, pivot, unpivot

:::compare
```js
const columns = _.zip(...rows);                  // rows -> columns
const records = rows.map((r) => _.zipObject(header, r));
const pivot = {};                                // region -> month -> total
for (const s of sales) {
  pivot[s.region] ??= {};
  pivot[s.region][s.month] = (pivot[s.region][s.month] ?? 0) + s.amount;
}
```
```python
columns = list(zip(*rows))                       # rows -> columns
records = [dict(zip(header, r)) for r in rows]
pivot = defaultdict(Counter)                     # region -> month -> total
for s in sales:
    pivot[s["region"]][s["month"]] += s["amount"]
```
:::

`zip(*rows)` transposes ([Tuples & Destructuring](lesson:tuples-and-unpacking#transpose-with-zip-rows)), and `dict(zip(header, row))` is `_.zipObject`. For pivots, nest the defaults: `defaultdict(Counter)` creates a counter for each row key the first time you touch it, and the counter supplies the zero for each new column, which replaces both `??=` lines. To print a pivot as a grid, collect the full set of column keys first, because each row only holds the columns it has seen. Reading a missing key from a `Counter` returns `0` without inserting it.

```python run
from collections import Counter, defaultdict

sales = [
    {"region": "EU", "month": "2024-01", "amount": 120},
    {"region": "US", "month": "2024-01", "amount": 200},
    {"region": "EU", "month": "2024-02", "amount": 80},
    {"region": "EU", "month": "2024-01", "amount": 45},
]
pivot = defaultdict(Counter)
for s in sales:
    pivot[s["region"]][s["month"]] += s["amount"]

months = sorted({s["month"] for s in sales})      # ISO strings sort by date
print("    " + "".join(f"{m:>9}" for m in months))
for region, cells in pivot.items():
    print(f"{region:<4}" + "".join(f"{cells[m]:>9}" for m in months))
```

Going back from a grid to records ("unpivot", pandas' `melt`) is a two-`for` comprehension, and a column-oriented dict of lists, the shape charting libraries like, is one more `zip` away:

```python run
grid = {"EU": {"2024-01": 165, "2024-02": 80}, "US": {"2024-01": 200}}
records = [
    {"region": region, "month": month, "amount": amount}
    for region, cells in grid.items()
    for month, amount in cells.items()
]
print(records)

columns = {key: [r[key] for r in records] for key in records[0]}
print(columns)
print([dict(zip(columns, values)) for values in zip(*columns.values())] == records)
```

:::quiz output
What does this print?

```python
rows = [[1, 2, 3], [4, 5]]
print(list(zip(*rows)))
```

- [ ] `[(1, 4), (2, 5), (3, None)]`
- [x] `[(1, 4), (2, 5)]`
- [ ] `[(1, 4), (2, 5), (3,)]`
- [ ] `ValueError`

`zip` stops at the shortest input, so the ragged row silently loses the `3`. lodash's `_.zip` pads with `undefined` instead. Pass `strict=True` (3.10+) to make `zip` raise `ValueError` on uneven input, or use `itertools.zip_longest(*rows, fillvalue=None)` to pad.
:::

## Cleaning: missing values, types and duplicates

:::compare
```js
const qty = Number(row.qty) || 0;               // "", "abc", undefined: all 0
const city = row.city?.trim() || "unknown";
const firstByEmail = _.uniqBy(rows, "email");
const lastByEmail = Object.values(_.keyBy(rows, "email"));
```
```python
qty = int(row["qty"]) if row.get("qty") else 0  # "abc" still raises
city = (row.get("city") or "").strip() or "unknown"
first_by_email = dedupe(rows, itemgetter("email"))  # a short loop, below
last_by_email = list({r["email"]: r for r in rows}.values())
```
:::

Real data has four flavours of missing: the key is absent, the value is `None` (JSON's `null`), it's an empty string (every blank CSV cell), or it's a sentinel such as `"N/A"`. JavaScript's `||` and `Number()` blur them all into one falsy mush. Python makes you choose. `row.get("qty")` handles absent keys, `or` treats `None` and `""` alike (and `0` too, the trap from [Gotchas](lesson:gotchas#x-or-default)), and conversion is strict: `int("abc")` raises instead of producing `NaN`. Normalise each field once, at the boundary, and the rest of the pipeline can trust its types.

```python run
raw = [
    {"sku": " TEA-01 ", "qty": "3", "price": "4.50"},
    {"sku": "pie-02", "qty": "", "price": "9"},
    {"sku": "cake-03", "qty": "0", "price": "N/A"},
]

def to_number(text, cast=float):
    text = (text or "").strip()
    return None if text in ("", "N/A") else cast(text)

clean = [
    {"sku": r["sku"].strip().upper(), "qty": to_number(r["qty"], int), "price": to_number(r["price"])}
    for r in raw
]
print(clean)
print(sum(r["qty"] for r in clean if r["qty"] is not None))
```

:::quiz output
These came straight out of a CSV file. What does this print?

```python
amounts = ["80", "120", "9"]
print(max(amounts))
```

- [ ] `120`
- [x] `9`
- [ ] `80`
- [ ] `TypeError`

CSV cells are strings, and strings compare character by character, so `"9"` beats `"80"` and `"120"`. Nothing raises; the answer is just wrong. Convert at the boundary (`[int(a) for a in amounts]`), or at least compare by number with `max(amounts, key=int)`.
:::

For duplicates, decide which copy wins. A dict comprehension keeps the **last** value for each key, while `setdefault` keeps the **first**. Either way the result follows the order in which keys first appeared, and `dict.fromkeys` dedupes plain values in order ([Sets](lesson:sets)).

```python run
rows = [
    {"email": "ada@example.com", "plan": "free"},
    {"email": "linus@example.com", "plan": "pro"},
    {"email": "ADA@example.com ", "plan": "pro"},
]

def dedupe(rows, key):                      # keep the first row for each key
    first = {}
    for row in rows:
        first.setdefault(key(row), row)
    return list(first.values())

def email(row):
    return row["email"].strip().casefold()

print([r["plan"] for r in dedupe(rows, email)])
print([r["plan"] for r in {email(r): r for r in rows}.values()])   # last wins
print(list(dict.fromkeys(map(email, rows))))
```

:::quiz output
What does this print?

```python
rows = [("ada", 1), ("linus", 2), ("ada", 3)]
print({name: n for name, n in rows})
```

- [ ] `{'linus': 2, 'ada': 3}`
- [x] `{'ada': 3, 'linus': 2}`
- [ ] `{'ada': 1, 'linus': 2}`
- [ ] `ValueError`

Assigning to an existing key replaces the value but keeps the key's original position, so `"ada"` stays first while holding its last value. A JS `Map` and `Object.fromEntries` behave the same way. If you want "the latest row, in the order rows were last seen", delete the key before reinserting it.
:::

## Statistics

:::compare
```js
// nothing built in: simple-statistics, or by hand
const mean = xs.reduce((a, b) => a + b, 0) / xs.length;   // NaN for []
const median = ss.median(xs);
const p90 = ss.quantile(xs, 0.9);
const sd = ss.sampleStandardDeviation(xs);
```
```python
from statistics import mean, median, quantiles, stdev
mean(xs)                        # raises StatisticsError for []
median(xs)
quantiles(xs, n=10)[-1]         # the 90th percentile
stdev(xs)                       # sample standard deviation
```
:::

`statistics` covers descriptive statistics: `mean` and `fmean` (faster, always a float), `median` (plus `median_low` and `median_high` when the answer must be an actual data point), `mode` and `multimode`, `stdev` and `variance` for samples, `pstdev` and `pvariance` for whole populations, `quantiles`, and since 3.10 `correlation`, `covariance` and `linear_regression`. Empty input raises `StatisticsError`, a subclass of `ValueError`, rather than returning `NaN`. The functions accept `Decimal` and `Fraction` data too, and the result type follows the data.

```python run
import statistics as st

response_ms = [120, 95, 101, 340, 99, 110, 2050, 105, 98, 130]
print(f"mean   {st.mean(response_ms):8.1f}")
print(f"median {st.median(response_ms):8.1f}")
print(f"stdev  {st.stdev(response_ms):8.1f}")
print(f"p90    {st.quantiles(response_ms, n=10)[-1]:8.1f}  (exclusive, the default)")
print(f"p90    {st.quantiles(response_ms, n=10, method='inclusive')[-1]:8.1f}  (inclusive)")
print(st.multimode(["tea", "pie", "tea", "pie", "cake"]))
```

:::gotcha `quantiles` has two methods, and they disagree
The default, `method="exclusive"`, treats your data as a sample from a larger population that may hold more extreme values, so on small samples its outer quantiles stretch towards the outliers. `method="inclusive"` treats the data as the whole population, and it matches spreadsheets' `PERCENTILE.INC` and NumPy's default. With ten response times the two p90s above differ by more than three times. Pick one deliberately, and say which one in the report.
:::

:::quiz output
What does this print?

```python
from statistics import mean
print(mean([1, 2, 3]), mean([1, 2, 3, 4]))
```

- [ ] `2.0 2.5`
- [x] `2 2.5`
- [ ] `2 2`
- [ ] `2.0 2.0`

`mean` computes exactly and keeps the type when it can: integer data whose mean is a whole number gives an `int`. Use `fmean` when you always want a float, which is also faster.
:::

## Top-N and rolling windows

:::compare
```js
_.take(_.orderBy(products, "sales", "desc"), 3);
products.toSorted((a, b) => b.sales - a.sales).slice(0, 3);
_.maxBy(products, "sales");
```
```python
heapq.nlargest(3, products, key=itemgetter("sales"))
sorted(products, key=itemgetter("sales"), reverse=True)[:3]
max(products, key=itemgetter("sales"))
```
:::

`heapq.nlargest(n, items, key=...)` and `nsmallest` return the top N without sorting everything, and they accept any iterable, including a generator streaming rows from a file. They're equivalent to `sorted(...)[:n]`, ties in their original order included. For small inputs, `sorted` is just as good, and for a single winner `max` with `key=` is simplest.

For windows over a sequence, `itertools` and `deque` cover the common shapes: `accumulate` for running totals (a cumulative sum), `pairwise` (3.10+) for each value with its predecessor, and `deque(maxlen=n)` for the last `n` values, with the oldest one falling off the far end as you append.

```python run
from collections import deque
from itertools import accumulate, pairwise

daily = [12, 15, 11, 30, 28, 9, 14]
print(list(accumulate(daily)))                     # running total
print([b - a for a, b in pairwise(daily)])         # day-over-day change

window = deque(maxlen=3)
for day, value in enumerate(daily, start=1):
    window.append(value)                           # the oldest value drops out
    if len(window) == window.maxlen:
        print(f"day {day}: 3-day mean {sum(window) / len(window):.1f}")
```

:::tip Big windows want a running sum
`sum(window)` on every step costs O(window), so a 1,000-value window over a million rows does a billion additions. Keep a running total instead: add the new value, subtract the one that falls out. The last challenge does exactly that.
:::

## Text reports

:::compare
```js
console.table(rows);
`${name.padEnd(12)}${String(qty).padStart(5)}${price.toFixed(2).padStart(10)}`;
new Intl.NumberFormat("en-US").format(1234567.891);   // "1,234,567.891"
```
```python
pprint.pp(rows)
f"{name:<12}{qty:>5}{price:>10.2f}"
f"{1234567.891:,}"                                    # "1,234,567.891"
```
:::

Format specs do the padding and the number formatting in one place: `<`, `>` and `^` align, a number sets the width, `,` groups thousands, `.2f` fixes the decimals and `%` turns a ratio into a percentage ([the format-spec mini-language](lesson:strings#the-format-spec-mini-language)). Widths can be computed, as in `f"{name:<{width}}"`, so a report can size its columns to the data.

```python run
rows = [
    {"region": "EU", "orders": 1234, "revenue": 98765.4},
    {"region": "US", "orders": 987, "revenue": 123456.789},
    {"region": "Asia-Pacific", "orders": 45, "revenue": 3210.0},
]
total = sum(r["revenue"] for r in rows)
width = max(len(r["region"]) for r in rows)

print(f"{'Region':<{width}}  {'Orders':>7}  {'Revenue':>12}  {'Share':>6}")
print(f"{'-' * width}  {'-' * 7}  {'-' * 12}  {'-' * 6}")
for r in rows:
    print(f"{r['region']:<{width}}  {r['orders']:>7,}  {r['revenue']:>12,.2f}  {r['revenue'] / total:>6.1%}")
print(f"{'Total':<{width}}  {sum(r['orders'] for r in rows):>7,}  {total:>12,.2f}")
```

:::quiz output
What does this print?

```python
name = "Christopher"
print(f"[{name:<5}] [{name:.5}]")
```

- [ ] `[Chris] [Chris]`
- [x] `[Christopher] [Chris]`
- [ ] `[Chris] [Christopher]`
- [ ] `[Christopher] [Christopher]`

A width is a minimum, so a long value pushes the column out. A precision on a string truncates it. Combine them, `f"{name:<8.8}"`, for a column that is always exactly eight characters wide.
:::

For nested data, `pprint` is `util.inspect` with line breaks: it wraps at `width` characters and indents the structure.

```python run
from pprint import pp, pprint

summary = {"region": "EU", "months": {"2024-02": 80, "2024-01": 165}, "top": ["ada", "linus"]}
pprint(summary)          # sorts the keys!
pp(summary)              # keeps insertion order
pp(summary, width=40)
```

:::gotcha `pprint()` sorts dict keys, `pp()` doesn't
`pprint.pprint` defaults to `sort_dicts=True`, a leftover from the days before dicts kept their order, so its output hides the order your pipeline produced. `pprint.pp` (3.8+) is the same function with `sort_dicts=False`. Use `pp`.
:::

## When to reach for pandas or polars

The standard library is plenty for scripts, ETL glue and anything up to a few tens of thousands of rows, and it costs no dependencies. Reach for a dataframe library when the data gets big (columnar, vectorised operations beat Python loops by orders of magnitude), when you need time-series tools such as resampling and date-aware rolling windows, when you join many tables, or when you read Parquet or Excel. pandas is the incumbent with the largest ecosystem; polars is newer, usually faster, and has a lazy query engine; DuckDB runs SQL directly over the same files. None of them are in the standard library, so the code is static:

```python
import pandas as pd

df = pd.DataFrame(orders)                  # or pd.read_csv("orders.csv")
summary = df.groupby("region")["amount"].agg(["count", "sum", "mean"])
pivot = df.pivot_table(index="region", columns="month", values="amount",
                       aggfunc="sum", fill_value=0)
top = df.nlargest(3, "amount")
```

```python
import polars as pl

df = pl.DataFrame(orders)
summary = df.group_by("region").agg(
    pl.len().alias("orders"),
    pl.col("amount").sum().alias("revenue"),
)
```

Everything you've seen in this lesson has a one-line dataframe equivalent, and knowing the plain-Python version makes the dataframe one easier to read: `groupby().agg()` is the grouping-plus-aggregates section, `pivot_table` is `defaultdict(Counter)`, and `nlargest` is `heapq.nlargest`.

## Cheat sheet

| JavaScript / lodash | Python | Notes |
| --- | --- | --- |
| `xs.filter(f).map(g)` | `[g(x) for x in xs if f(x)]` | one comprehension |
| `_.pick(o, ["a", "b"])` | `{k: o[k] for k in ("a", "b")}` | |
| `_.groupBy(xs, f)` | `defaultdict(list)` loop | `return dict(groups)` |
| `_.countBy(xs, f)` | `Counter(f(x) for x in xs)` | `.most_common(n)` |
| `"EU\|2024-01"` string keys | `("EU", "2024-01")` | tuples are hashable |
| `_.keyBy(xs, "id")` | `{x["id"]: x for x in xs}` | last duplicate wins |
| `_.sumBy(xs, "n")` | `sum(x["n"] for x in xs)` | |
| `_.meanBy(xs, "n")` | `statistics.mean(x["n"] for x in xs)` | raises on empty input |
| `_.maxBy(xs, "n")` | `max(xs, key=itemgetter("n"))` | `default=` for empty input |
| `_.orderBy(xs, [a, b], ["asc", "desc"])` | `sorted(xs, key=lambda x: (x[a], -x[b]))` | or two stable sorts |
| `_.take(_.orderBy(...), n)` | `heapq.nlargest(n, xs, key=...)` | |
| `_.uniqBy(xs, "id")` | `setdefault` loop | keeps the first |
| `{ ...a, ...b }` | `a \| b` | 3.9+; the right side wins |
| `_.zip(...rows)` | `zip(*rows)` | truncates; `strict=True` raises |
| `_.zipObject(keys, values)` | `dict(zip(keys, values))` | |
| nested `??=` pivot | `defaultdict(Counter)` | missing cells read as `0` |
| moving average | `deque(maxlen=n)` | plus a running sum |
| `console.table(rows)` | f-string columns, `pprint.pp` | `rich` for real tables |

## Challenges

:::challenge id=wrangle-rank-totals title="Rank the totals" difficulty=easy
Write `rank_totals(rows, group, value)`. It sums `row[value]` for each distinct `row[group]` and returns a list of `(group_value, total)` tuples, highest total first, with ties broken by the group value in ascending order.

```text
rows = [
    {"team": "red", "points": 3},
    {"team": "blue", "points": 5},
    {"team": "red", "points": 4},
]
rank_totals(rows, "team", "points")  ->  [("red", 7), ("blue", 5)]
```

Group values keep their type: when you group by a year, the keys are `int`s, not strings.

```js
function rankTotals(rows, group, value) {
  const totals = {};
  for (const row of rows) totals[row[group]] = (totals[row[group]] ?? 0) + row[value];
  return Object.entries(totals)            // object keys are always strings
    .sort((a, b) => b[1] - a[1] || String(a[0]).localeCompare(b[0]));
}
```

```python starter
def rank_totals(rows, group, value):
    ...
```

```python solution
from collections import Counter

def rank_totals(rows, group, value):
    totals = Counter()
    for row in rows:
        totals[row[group]] += row[value]
    return sorted(totals.items(), key=lambda item: (-item[1], item[0]))
```

```python tests
def teams():
    return [
        {"team": "red", "points": 3},
        {"team": "green", "points": 5},
        {"team": "red", "points": 4},
        {"team": "blue", "points": 5},
    ]

@test("sums per group, highest total first")
def _():
    eq(rank_totals(teams(), "team", "points")[0], ("red", 7))

@test("breaks ties by the group value")
def _():
    eq(rank_totals(teams(), "team", "points"), [("red", 7), ("blue", 5), ("green", 5)])

@test("group values keep their type")
def _():
    rows = [{"year": 2024, "n": 1}, {"year": 2023, "n": 2}, {"year": 2024, "n": 2}]
    eq(rank_totals(rows, "year", "n"), [(2024, 3), (2023, 2)])

@test("falsy groups and zero totals are kept")
def _():
    rows = [{"tag": "", "n": 0}, {"tag": "x", "n": 1}, {"tag": "", "n": 0}]
    eq(rank_totals(rows, "tag", "n"), [("x", 1), ("", 0)])

@test("float values are summed")
def _():
    rows = [{"k": "a", "v": 0.1}, {"k": "a", "v": 0.2}]
    result = rank_totals(rows, "k", "v")
    eq(result[0][0], "a")
    approx(result[0][1], 0.3)

@test("an empty input gives an empty list")
def _():
    eq(rank_totals([], "team", "points"), [])

@test("doesn't modify the rows")
def _():
    rows = teams()
    rank_totals(rows, "team", "points")
    eq(rows, teams())
```

```hint
`Counter()` starts every key at `0`, so `totals[row[group]] += row[value]` needs no "if missing" check.
```

```hint
`totals.items()` gives `(key, total)` pairs. Sort them with a tuple key: negate the total for descending order, then the key for ties.
```
:::

:::challenge id=wrangle-customer-summary title="Join and summarise" difficulty=medium
Write `customer_summary(customers, orders)`. Customers look like `{"id": "c1", "name": "Ada"}` and orders like `{"customer_id": "c1", "amount": 120}`. Return one **new** dict per customer, in the customers' order, shaped `{"name": ..., "orders": count, "total": sum_of_amounts}`.

- Customers with no orders get `0` and `0`.
- Orders whose `customer_id` matches no customer are ignored.
- Don't modify the input dicts.
- It must handle 20,000 customers and 40,000 orders in well under a second, so index the orders instead of searching them once per customer.

```js
function customerSummary(customers, orders) {
  return customers.map((c) => {
    const mine = orders.filter((o) => o.customerId === c.id);   // O(n * m)
    return { name: c.name, orders: mine.length, total: _.sumBy(mine, "amount") };
  });
}
```

```python starter
def customer_summary(customers, orders):
    ...
```

```python solution
from collections import defaultdict

def customer_summary(customers, orders):
    amounts = defaultdict(list)
    for order in orders:
        amounts[order["customer_id"]].append(order["amount"])
    summary = []
    for customer in customers:
        mine = amounts.get(customer["id"], [])
        summary.append({"name": customer["name"], "orders": len(mine), "total": sum(mine)})
    return summary
```

```python tests
def make_customers():
    return [{"id": "c1", "name": "Ada"}, {"id": "c2", "name": "Linus"}, {"id": "c3", "name": "Grace"}]

def make_orders():
    return [
        {"customer_id": "c3", "amount": 200},
        {"customer_id": "c1", "amount": 120},
        {"customer_id": "c9", "amount": 999},
        {"customer_id": "c1", "amount": 45},
    ]

@test("counts and sums each customer's orders")
def _():
    result = customer_summary(make_customers(), make_orders())
    eq(result[0], {"name": "Ada", "orders": 2, "total": 165})
    eq(result[2], {"name": "Grace", "orders": 1, "total": 200})

@test("keeps the customers' order")
def _():
    eq([s["name"] for s in customer_summary(make_customers(), make_orders())], ["Ada", "Linus", "Grace"])

@test("customers without orders get zeros")
def _():
    eq(customer_summary(make_customers(), make_orders())[1], {"name": "Linus", "orders": 0, "total": 0})

@test("orders for unknown customers are ignored")
def _():
    eq(sum(s["total"] for s in customer_summary(make_customers(), make_orders())), 365)
    eq(customer_summary([], make_orders()), [])

@test("doesn't modify the inputs")
def _():
    customers, orders = make_customers(), make_orders()
    customer_summary(customers, orders)
    eq(customers, make_customers(), "the customer dicts changed")
    eq(orders, make_orders(), "the order dicts changed")

@test("handles 20,000 customers and 40,000 orders quickly")
def _():
    customers = [{"id": f"c{i}", "name": f"customer {i}"} for i in range(20_000)]
    orders = [{"customer_id": f"c{(i * 37) % 25_000}", "amount": i % 100} for i in range(40_000)]
    result = customer_summary(customers, orders)
    eq(len(result), 20_000)
    eq(sum(s["orders"] for s in result), sum(1 for o in orders if int(o["customer_id"][1:]) < 20_000))
```

```hint
One pass over `orders` with a `defaultdict(list)` keyed by `customer_id` gives you every customer's amounts. After that, each customer is a single dict lookup.
```

```hint
Use `.get(customer["id"], [])` for the lookup: customers with no orders get an empty list, so `len()` and `sum()` both give `0`.
```
:::

:::challenge id=wrangle-pivot-table title="Pivot table" difficulty=medium
Write `pivot(rows, index, columns, values)` that turns records into a nested dict, like a spreadsheet pivot table: `result[row[index]][row[columns]]` is the sum of `row[values]` for every row with that index and column.

- Outer keys appear in order of first appearance.
- Every inner dict has **every** column value seen anywhere in the input, sorted ascending, with `0` for missing cells.
- Return plain dicts, so a typo in a lookup raises `KeyError` instead of inventing an empty cell.

```text
sales = [
    {"region": "EU", "month": "2024-02", "amount": 80},
    {"region": "US", "month": "2024-01", "amount": 200},
    {"region": "EU", "month": "2024-01", "amount": 120},
    {"region": "EU", "month": "2024-01", "amount": 45},
]
pivot(sales, "region", "month", "amount")
->  {"EU": {"2024-01": 165, "2024-02": 80}, "US": {"2024-01": 200, "2024-02": 0}}
```

```js
function pivot(rows, index, columns, values) {
  const cols = [...new Set(rows.map((r) => r[columns]))].sort();   // string sort!
  const out = {};
  for (const r of rows) {
    out[r[index]] ??= Object.fromEntries(cols.map((c) => [c, 0]));
    out[r[index]][r[columns]] += r[values];
  }
  return out;
}
```

```python starter
from collections import Counter, defaultdict

def pivot(rows, index, columns, values):
    ...
```

```python solution
from collections import Counter, defaultdict

def pivot(rows, index, columns, values):
    cells = defaultdict(Counter)
    for row in rows:
        cells[row[index]][row[columns]] += row[values]
    all_columns = sorted({row[columns] for row in rows})
    return {key: {col: counts[col] for col in all_columns} for key, counts in cells.items()}
```

```python tests
def sales():
    return [
        {"region": "EU", "month": "2024-02", "amount": 80},
        {"region": "US", "month": "2024-01", "amount": 200},
        {"region": "EU", "month": "2024-01", "amount": 120},
        {"region": "EU", "month": "2024-01", "amount": 45},
    ]

@test("sums the values in each cell")
def _():
    eq(pivot(sales(), "region", "month", "amount")["EU"]["2024-01"], 165)

@test("fills missing cells with 0")
def _():
    eq(pivot(sales(), "region", "month", "amount")["US"], {"2024-01": 200, "2024-02": 0})

@test("columns are sorted in every row")
def _():
    result = pivot(sales(), "region", "month", "amount")
    eq(list(result["EU"]), ["2024-01", "2024-02"])
    eq(list(result["US"]), ["2024-01", "2024-02"])

@test("rows keep their order of first appearance")
def _():
    eq(list(pivot(sales(), "region", "month", "amount")), ["EU", "US"])

@test("numeric columns sort as numbers")
def _():
    rows = [{"store": "a", "week": 10, "n": 1}, {"store": "a", "week": 9, "n": 2}]
    eq(list(pivot(rows, "store", "week", "n")["a"]), [9, 10])

@test("returns plain dicts")
def _():
    result = pivot(sales(), "region", "month", "amount")
    check(type(result) is dict, "convert the outer defaultdict to a dict")
    check(all(type(cells) is dict for cells in result.values()), "each row should be a plain dict")

@test("an empty input gives an empty dict")
def _():
    eq(pivot([], "region", "month", "amount"), {})

@test("doesn't modify the rows")
def _():
    rows = sales()
    pivot(rows, "region", "month", "amount")
    eq(rows, sales())
```

```hint
`defaultdict(Counter)` gives you a counter per outer key on first use, and `cells[r][c] += v` needs no initialisation.
```

```hint
Collect every column value with a set comprehension, then `sorted()` it. Python sorts numbers as numbers.
```

```hint
Finish with a nested dict comprehension, `{key: {col: counts[col] for col in all_columns} for key, counts in cells.items()}`. Reading a missing key from a `Counter` gives `0`.
```
:::

:::challenge id=wrangle-rolling-mean title="Rolling average" difficulty=hard
Write `rolling_mean(values, window)` for a dashboard's moving-average line. It returns a list as long as the input. Position `i` holds the mean of the `window` values ending at position `i`, or `None` while fewer than `window` values have been seen.

```text
rolling_mean([1, 2, 3, 4, 5], 2)  ->  [None, 1.5, 2.5, 3.5, 4.5]
rolling_mean([1, 2, 3, 4, 5], 3)  ->  [None, None, 2.0, 3.0, 4.0]
```

- `values` can be any iterable, including a generator, so you can't index or slice it.
- Raise `ValueError` if `window` is less than 1.
- Keep the window in a `collections.deque`, together with a running total. It must handle 400,000 values with a window of 10,000 in well under a second, which rules out re-summing the window on every step.

```js
function rollingMean(values, window) {
  if (window < 1) throw new RangeError("window must be >= 1");
  return values.map((_, i) =>
    i + 1 < window ? null : _.sum(values.slice(i + 1 - window, i + 1)) / window);
}
```

```python starter
from collections import deque

def rolling_mean(values, window):
    ...
```

```python solution
from collections import deque

def rolling_mean(values, window):
    if window < 1:
        raise ValueError("window must be at least 1")
    recent = deque()
    total = 0
    means = []
    for value in values:
        recent.append(value)
        total += value
        if len(recent) > window:
            total -= recent.popleft()
        means.append(total / window if len(recent) == window else None)
    return means
```

```python tests
@test("a window of 2")
def _():
    eq(rolling_mean([1, 2, 3, 4, 5], 2), [None, 1.5, 2.5, 3.5, 4.5])

@test("a window of 3")
def _():
    eq(rolling_mean([1, 2, 3, 4, 5], 3), [None, None, 2.0, 3.0, 4.0])

@test("a window of 1 is the values themselves")
def _():
    eq(rolling_mean([3, 5, 0], 1), [3, 5, 0])

@test("a window longer than the input gives only None")
def _():
    eq(rolling_mean([1, 2], 3), [None, None])
    eq(rolling_mean([], 3), [])

@test("accepts any iterable, including a generator")
def _():
    eq(rolling_mean((n * 2 for n in range(1, 4)), 2), [None, 3.0, 5.0])

@test("works with floats")
def _():
    result = rolling_mean([0.1, 0.2, 0.3], 2)
    eq(result[0], None)
    approx(result[1], 0.15)
    approx(result[2], 0.25)

@test("a window below 1 raises ValueError")
def _():
    raises(ValueError, rolling_mean, [1, 2, 3], 0)

@test("handles 400,000 values with a window of 10,000 quickly")
def _():
    values = [(i * 7919) % 1000 for i in range(400_000)]
    result = rolling_mean(values, 10_000)
    eq(len(result), 400_000)
    eq(result[9_998], None)
    for i in (9_999, 123_456, 399_999):
        approx(result[i], sum(values[i - 9_999:i + 1]) / 10_000)

@test("keeps the window in a deque")
def _():
    requires_call("deque", "keep the window in a collections.deque")
```

```hint
Append each value to a `deque` and add it to a running `total`. When the deque grows past `window`, `popleft()` returns the value that fell out of the window, so subtract it from the total.
```

```hint
Once `len(recent) == window`, the mean is `total / window`; before that, append `None`.
```

```hint
A plain `for value in values:` loop works for lists and generators alike. Don't call `len(values)` or slice it.
```
:::
