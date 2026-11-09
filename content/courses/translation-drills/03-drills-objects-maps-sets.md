---
title: "Drills: Objects, Maps & Sets"
part: Collections
summary: Port object, Map and Set code to merges, defaults, deep gets, Counter, set algebra, JSON and deepcopy.
minutes: 50
---

Ten drills on objects, `Map` and `Set`. Python folds plain objects and `Map` into one type, `dict`, and adds `Counter` and `defaultdict` for the jobs you'd hand-roll with a `Map`. The tests check the differences that bite during a port: keys keep their type, so `1` and `"1"` are different keys; a missing key raises `KeyError` instead of returning `undefined`; sets have no order; and `json.dumps` only matches `JSON.stringify` once you ask it to.

## The mappings

| JavaScript | Python |
| --- | --- |
| `{ ...defaults, ...overrides }` | `defaults \| overrides` |
| `const { port = 80 } = config` | `port = config.get("port", 80)` |
| `Object.entries(o)`, `Object.fromEntries(pairs)` | `o.items()`, `dict(pairs)` or a dict comprehension |
| `o?.a?.[0] ?? fallback` | a `match` mapping pattern, or `try` / `except` |
| `counts.set(k, (counts.get(k) ?? 0) + 1)` | `Counter(items)` |
| `(groups[k] ??= []).push(v)` | `groups.setdefault(k, []).append(v)` |
| `a.union(b)`, `a.intersection(b)`, `a.difference(b)` | `a \| b`, `a & b`, `a - b` |
| `JSON.stringify(x)` | `json.dumps(x, separators=(",", ":"), ensure_ascii=False)` |
| `structuredClone(x)` | `copy.deepcopy(x)` |

## Challenges

:::challenge id=drill-obj-merge-settings title="Spread merge" difficulty=easy
Write `merge_settings(defaults: dict, overrides: dict) -> dict` that returns a **new** dict: `defaults` with `overrides` applied on top, skipping any override whose value is `None`. Don't modify either input.

```text
merge_settings({"theme": "light", "font_size": 14}, {"theme": "dark", "font_size": None})
->  {'theme': 'dark', 'font_size': 14}
```

`a | b` (3.9+) is `{ ...a, ...b }`: a new dict in which `b`'s values win, existing keys keep their position, and new keys go at the end. A dict comprehension handles the `Object.entries(...).filter(...)` part. Filter with `is not None`, because `0`, `False` and `""` are real settings.

Refresher: [Adding, updating and removing](lesson:dicts#adding-updating-and-removing).

```js
function mergeSettings(defaults, overrides) {
  const given = Object.fromEntries(
    Object.entries(overrides).filter(([, value]) => value != null),
  );
  return { ...defaults, ...given };
}
```

```python starter
def merge_settings(defaults: dict, overrides: dict) -> dict:
    ...
```

```python solution
def merge_settings(defaults: dict, overrides: dict) -> dict:
    return defaults | {key: value for key, value in overrides.items() if value is not None}
```

```python tests
def make_defaults():
    return {"theme": "light", "font_size": 14, "autosave": True}

@test("overrides win, the other defaults stay")
def _():
    eq(merge_settings(make_defaults(), {"theme": "dark"}), {"theme": "dark", "font_size": 14, "autosave": True})

@test("None means 'not set'")
def _():
    eq(merge_settings(make_defaults(), {"theme": None}), make_defaults())

@test("0, False and empty strings are real settings")
def _():
    eq(
        merge_settings(make_defaults(), {"font_size": 0, "autosave": False, "theme": ""}),
        {"theme": "", "font_size": 0, "autosave": False},
    )

@test("new keys go after the defaults")
def _():
    eq(
        list(merge_settings(make_defaults(), {"lang": "pt", "theme": "dark"})),
        ["theme", "font_size", "autosave", "lang"],
    )

@test("returns a new dict and modifies neither input")
def _():
    defaults = make_defaults()
    overrides = {"theme": "dark", "lang": None}
    result = merge_settings(defaults, overrides)
    eq(defaults, make_defaults())
    eq(overrides, {"theme": "dark", "lang": None})
    check(result is not defaults, "return a new dict, not defaults itself")

@test("a comprehension and |, no loop")
def _():
    forbids_syntax(ast.For, "a dict comprehension filters the overrides, and | merges")
```

```hint
`{key: value for key, value in overrides.items() if value is not None}` drops the `None`s and keeps everything else.
```
:::

:::challenge id=drill-obj-connection-string title="Destructuring with defaults" difficulty=easy
Write `connection_string(config: dict) -> str` that builds a Postgres URL from a config dict. `user` is required. `host` defaults to `"localhost"`, `port` to `5432`, `database` to the user name and `pool_size` to `10`.

```text
connection_string({"user": "ada"})  ->  'postgres://ada@localhost:5432/ada?pool=10'
```

Python has no object destructuring, but `config.get(key, default)` follows the same rule as a destructuring default: the default applies only when the key is **missing**. Don't reach for `or`, which would also replace a `pool_size` of `0`. The languages part ways on a missing *required* key: JavaScript quietly builds `postgres://undefined@...`, while `config["user"]` raises `KeyError`, which is what you want.

If you control the callers, keyword-only parameters make a more Pythonic options object: see [keyword arguments replace options objects](lesson:functions#keyword-arguments-replace-options-objects).

Refresher: [Reading values: brackets, `get()` and `in`](lesson:dicts#reading-values-brackets-get-and-in).

```js
function connectionString({ user, host = "localhost", port = 5432, database = user, poolSize = 10 }) {
  return `postgres://${user}@${host}:${port}/${database}?pool=${poolSize}`;
}
```

```python starter
def connection_string(config: dict) -> str:
    ...
```

```python solution
def connection_string(config: dict) -> str:
    user = config["user"]
    host = config.get("host", "localhost")
    port = config.get("port", 5432)
    database = config.get("database", user)
    pool_size = config.get("pool_size", 10)
    return f"postgres://{user}@{host}:{port}/{database}?pool={pool_size}"
```

```python tests
@test("fills in the defaults")
def _():
    eq(connection_string({"user": "ada"}), "postgres://ada@localhost:5432/ada?pool=10")

@test("given values win")
def _():
    config = {"user": "ada", "host": "db.internal", "port": 6432, "database": "shop", "pool_size": 25}
    eq(connection_string(config), "postgres://ada@db.internal:6432/shop?pool=25")

@test("database defaults to the user name")
def _():
    eq(connection_string({"user": "grace", "host": "db"}), "postgres://grace@db:5432/grace?pool=10")

@test("a pool size of 0 is a real value")
def _():
    eq(connection_string({"user": "ada", "pool_size": 0}), "postgres://ada@localhost:5432/ada?pool=0")

@test("a missing user raises KeyError")
def _():
    raises(KeyError, connection_string, {"host": "db"})
```

```hint
`config.get("port", 5432)` returns the default only when the key is absent.
```

```hint
A default can use an earlier value: `database = config.get("database", user)`.
```
:::

:::challenge id=drill-obj-pick-omit title="pick and omit" difficulty=easy
Write lodash-style `pick(obj: dict, keys) -> dict` and `omit(obj: dict, keys) -> dict`:

- `pick` keeps only the listed keys that exist in `obj`, in the order of `keys`, even when the value is `None`;
- `omit` keeps every other key, in `obj`'s order;
- `keys` can be any iterable, including a one-shot generator, and neither function modifies `obj`.

```text
pick({"id": 7, "name": "Ada", "password": "hunter2"}, ["name", "id"])  ->  {'name': 'Ada', 'id': 7}
omit({"id": 7, "name": "Ada", "password": "hunter2"}, ["password"])    ->  {'id': 7, 'name': 'Ada'}
```

Each one is a single dict comprehension. In `omit`, turn `keys` into a set first: you test membership once per key of `obj`, a set makes each test O(1), and a generator can only be read once.

Refresher: [Building dicts: fromEntries, zip and comprehensions](lesson:dicts#building-dicts-fromentries-zip-and-comprehensions) and [fast membership](lesson:sets#fast-membership).

```js
const pick = (obj, keys) =>
  Object.fromEntries(keys.filter((key) => Object.hasOwn(obj, key)).map((key) => [key, obj[key]]));

const omit = (obj, keys) =>
  Object.fromEntries(Object.entries(obj).filter(([key]) => !keys.includes(key)));
```

```python starter
def pick(obj: dict, keys) -> dict:
    ...


def omit(obj: dict, keys) -> dict:
    ...
```

```python solution
def pick(obj: dict, keys) -> dict:
    return {key: obj[key] for key in keys if key in obj}


def omit(obj: dict, keys) -> dict:
    drop = set(keys)
    return {key: value for key, value in obj.items() if key not in drop}
```

```python tests
def make_user():
    return {"id": 7, "name": "Ada", "email": "ada@example.com", "password": "hunter2", "admin": False}

@test("pick keeps the listed keys, in the order asked")
def _():
    eq(list(pick(make_user(), ["name", "id"]).items()), [("name", "Ada"), ("id", 7)])

@test("pick skips keys that don't exist")
def _():
    eq(pick(make_user(), ["id", "phone"]), {"id": 7})

@test("pick keeps falsy and None values")
def _():
    eq(pick({"admin": False, "note": None, "id": 7}, ["admin", "note"]), {"admin": False, "note": None})

@test("omit drops the listed keys and keeps the original order")
def _():
    eq(list(omit(make_user(), ["password", "email"])), ["id", "name", "admin"])

@test("keys can be a one-shot generator")
def _():
    eq(omit(make_user(), (key for key in ["password", "email"])), {"id": 7, "name": "Ada", "admin": False})
    eq(pick(make_user(), (key for key in ["id"])), {"id": 7})

@test("neither function modifies the input")
def _():
    user = make_user()
    pick(user, ["id"])
    omit(user, ["id", "password"])
    eq(user, make_user())

@test("dict comprehensions do the work")
def _():
    requires_syntax(ast.DictComp, "build each result with a dict comprehension")
```

```hint
`{key: obj[key] for key in keys if key in obj}` loops over the keys you asked for, so it keeps their order.
```
:::

:::challenge id=drill-obj-shopping-list title="Map counting → Counter" difficulty=easy
Write `shopping_list(recipe: list[str], pantry: list[str]) -> Counter` that returns what you still need to buy: for each recipe item, how many more you need than the pantry holds. Items the pantry fully covers don't appear.

```text
shopping_list(["egg", "flour", "egg", "milk", "egg"], ["flour", "egg", "salt"])
->  Counter({'egg': 2, 'milk': 1})
```

`Counter(iterable)` does the whole counting loop, and subtracting one `Counter` from another keeps only the positive counts, which replaces the clean-up loop. A `Counter` is a dict with one extra convenience the JavaScript `Map` lacks: a missing item reads as `0` instead of `undefined`.

Refresher: [`Counter`: counting in one line](lesson:dicts#counter-counting-in-one-line).

```js
function shoppingList(recipe, pantry) {
  const need = new Map();
  for (const item of recipe) need.set(item, (need.get(item) ?? 0) + 1);
  for (const item of pantry) {
    if (need.has(item)) need.set(item, need.get(item) - 1);
  }
  for (const [item, count] of need) {
    if (count <= 0) need.delete(item);
  }
  return need;
}
```

```python starter
from collections import Counter


def shopping_list(recipe: list[str], pantry: list[str]) -> Counter:
    ...
```

```python solution
from collections import Counter


def shopping_list(recipe: list[str], pantry: list[str]) -> Counter:
    return Counter(recipe) - Counter(pantry)
```

```python tests
from collections import Counter

RECIPE = ("egg", "flour", "egg", "milk", "egg", "sugar")

@test("counts what's missing")
def _():
    eq(shopping_list(list(RECIPE), ["flour", "egg", "sugar", "salt"]), {"egg": 2, "milk": 1})

@test("extra pantry items never go negative")
def _():
    eq(shopping_list(["egg"], ["egg", "egg", "egg"]), {})

@test("returns a Counter, so a missing item reads as 0")
def _():
    result = shopping_list(list(RECIPE), [])
    check(isinstance(result, Counter), "return a collections.Counter")
    eq(result["caviar"], 0)

@test("keeps the recipe's order")
def _():
    eq(list(shopping_list(list(RECIPE), ["flour"])), ["egg", "milk", "sugar"])

@test("nothing to buy is an empty Counter, which is falsy")
def _():
    check(not shopping_list(["egg"], ["egg"]), "an empty Counter is falsy, like any empty dict")

@test("leaves both lists alone")
def _():
    recipe, pantry = ["egg", "egg"], ["egg"]
    shopping_list(recipe, pantry)
    eq((recipe, pantry), (["egg", "egg"], ["egg"]))

@test("Counter does the loops")
def _():
    forbids_syntax((ast.For, ast.While), "Counter(iterable) counts for you, and - subtracts")
```

```hint
`Counter(["egg", "egg", "milk"])` is `Counter({'egg': 2, 'milk': 1})`.
```

```hint
Subtraction drops anything that isn't positive: `Counter(egg=3) - Counter(egg=5)` is an empty `Counter`.
```
:::

:::challenge id=drill-obj-sale-prices title="entries and fromEntries" difficulty=medium
Write `sale_prices(prices: dict[str, int], percent_off: int) -> dict[str, int]`. Prices are integer cents keyed by SKU. Drop the items priced at 0 or less, and discount the rest, rounding to the nearest cent with halves going **up**, like `Math.round`.

```text
sale_prices({"tea": 350, "mug": 25, "gift-card": 0}, 10)  ->  {'tea': 315, 'mug': 23}
```

`Object.entries` is `.items()`, and the whole `fromEntries(entries.filter().map())` pipeline is one dict comprehension with an `if` clause. The trap is the rounding. Python's `round()` rounds halves to the *even* neighbour (`round(22.5)` is `22`), while `Math.round(22.5)` is `23`, and the tests include half cents.

Refresher: [Building dicts](lesson:dicts#building-dicts-fromentries-zip-and-comprehensions) and [rounding](lesson:numbers-and-math#rounding-round-floor-ceil-trunc).

```js
function salePrices(prices, percentOff) {
  return Object.fromEntries(
    Object.entries(prices)
      .filter(([, cents]) => cents > 0)
      .map(([sku, cents]) => [sku, Math.round((cents * (100 - percentOff)) / 100)]),
  );
}
```

```python starter
def sale_prices(prices: dict[str, int], percent_off: int) -> dict[str, int]:
    ...
```

```python solution
def sale_prices(prices: dict[str, int], percent_off: int) -> dict[str, int]:
    # (x + 50) // 100 divides by 100 and rounds halves up, in exact integer arithmetic.
    return {
        sku: (cents * (100 - percent_off) + 50) // 100
        for sku, cents in prices.items()
        if cents > 0
    }
```

```python tests
@test("discounts every price")
def _():
    eq(sale_prices({"tea": 350, "jam": 1000}, 10), {"tea": 315, "jam": 900})

@test("drops free and negative prices")
def _():
    eq(sale_prices({"gift-card": 0, "refund": -500, "tea": 350}, 10), {"tea": 315})

@test("half cents round up, like Math.round")
def _():
    eq(sale_prices({"mug": 25}, 10), {"mug": 23})        # 22.5
    eq(sale_prices({"sticker": 5}, 50), {"sticker": 3})  # 2.5

@test("other fractions round to the nearest cent")
def _():
    eq(sale_prices({"tea": 333}, 10), {"tea": 300})  # 299.7
    eq(sale_prices({"jam": 999}, 15), {"jam": 849})  # 849.15

@test("prices stay int cents and keep their order")
def _():
    result = sale_prices({"b": 199, "a": 1001}, 25)
    eq(result, {"b": 149, "a": 751})
    eq(list(result), ["b", "a"])
    check(all(type(cents) is int for cents in result.values()), "prices should be int cents, not floats")

@test("leaves the input alone")
def _():
    prices = {"tea": 350}
    sale_prices(prices, 50)
    eq(prices, {"tea": 350})

@test("one dict comprehension")
def _():
    requires_syntax(ast.DictComp, "Object.fromEntries(Object.entries(...).filter(...).map(...)) is one dict comprehension")
```

```hint
`{sku: f(cents) for sku, cents in prices.items() if cents > 0}` filters and maps in one go.
```

```hint
`(x + 50) // 100` divides by 100 and rounds halves up, exactly, in integer arithmetic. `math.floor(x / 100 + 0.5)` works too.
```
:::

:::challenge id=drill-obj-shipping-city title="Optional chaining" difficulty=medium
Write `shipping_city(order) -> str` that returns the city of the customer's **first** address, or `"unknown"` if any step on the way is missing or `None`.

```text
shipping_city({"customer": {"addresses": [{"city": "Lisbon"}]}})  ->  'Lisbon'
shipping_city({"customer": None})                                 ->  'unknown'
```

`?.` stops at `null` or `undefined`, and `??` replaces only those two, so an empty-string city comes back as `""`. Python has no `?.`, and chains of `.get(key, {})` don't cover it: they break as soon as a key is present with the value `None`. There are two idiomatic options. A `match` statement with a mapping pattern describes the whole shape at once. Or go EAFP: index straight down the path inside `try` and catch the exceptions a missing step raises. Only the first address counts, even if a later one has a city.

Refresher: [Mapping patterns](lesson:pattern-matching#mapping-patterns) and [No `??` and no `?.`](lesson:truthiness-and-equality#no-and-no).

```js
const shippingCity = (order) => order?.customer?.addresses?.[0]?.city ?? "unknown";
```

```python starter
def shipping_city(order) -> str:
    ...
```

```python solution
def shipping_city(order) -> str:
    match order:
        case {"customer": {"addresses": [{"city": str() as city}, *_]}}:
            return city
        case _:
            return "unknown"
```

```python tests
@test("follows the path to the first address's city")
def _():
    order = {"id": 1, "customer": {"name": "Ada", "addresses": [{"city": "London"}, {"city": "Paris"}]}}
    eq(shipping_city(order), "London")

@test("a missing key anywhere gives 'unknown'")
def _():
    eq(shipping_city({}), "unknown")
    eq(shipping_city({"customer": {}}), "unknown")
    eq(shipping_city({"customer": {"addresses": [{"zip": "10115"}]}}), "unknown")

@test("None anywhere gives 'unknown'")
def _():
    eq(shipping_city(None), "unknown")
    eq(shipping_city({"customer": None}), "unknown")
    eq(shipping_city({"customer": {"addresses": None}}), "unknown")
    eq(shipping_city({"customer": {"addresses": [None]}}), "unknown")
    eq(shipping_city({"customer": {"addresses": [{"city": None}]}}), "unknown")

@test("no addresses gives 'unknown', not IndexError")
def _():
    eq(shipping_city({"customer": {"addresses": []}}), "unknown")

@test("only the first address counts")
def _():
    eq(shipping_city({"customer": {"addresses": [{"zip": "10115"}, {"city": "Berlin"}]}}), "unknown")

@test("an empty city is still a city, as with ??")
def _():
    eq(shipping_city({"customer": {"addresses": [{"city": ""}]}}), "")
```

```hint
A mapping pattern matches nested shapes and ignores extra keys: `case {"customer": {"addresses": [first, *_]}}:`. Inside it, `str() as city` matches only a string.
```

```hint
The EAFP version indexes straight down, `order["customer"]["addresses"][0]["city"]`, inside `try`, and catches `KeyError` (a missing key), `IndexError` (an empty list) and `TypeError` (indexing `None`). Check the final value for `None` too.
```
:::

:::challenge id=drill-obj-invert-grouped title="Invert, grouping with ??=" difficulty=medium
Write `invert_grouped(d: dict) -> dict` that maps each value of `d` to the list of keys that had it, in order.

```text
invert_grouped({"api": "ada", "web": "grace", "db": "ada"})  ->  {'ada': ['api', 'db'], 'grace': ['web']}
```

`(out[value] ??= [])` is `out.setdefault(value, [])`: it returns the existing list, or stores a new one and returns that. And where JavaScript turns every value into a string key (`out[1]` and `out["1"]` are the same slot), a dict keeps the values exactly as they are, so inverting `{"low": 1}` gives `{1: ["low"]}`.

Refresher: [`??` and `??=`](lesson:truthiness-and-equality#no-and-no) and [keys compared by value](lesson:dicts#keys-any-hashable-value-compared-by-value).

```js
function invertGrouped(obj) {
  const out = {};
  for (const [key, value] of Object.entries(obj)) {
    (out[value] ??= []).push(key);
  }
  return out;
}
```

```python starter
def invert_grouped(d: dict) -> dict:
    ...
```

```python solution
def invert_grouped(d: dict) -> dict:
    inverted = {}
    for key, value in d.items():
        inverted.setdefault(value, []).append(key)
    return inverted
```

```python tests
@test("groups the keys by their value")
def _():
    eq(invert_grouped({"api": "ada", "web": "grace", "db": "ada"}), {"ada": ["api", "db"], "grace": ["web"]})

@test("values keep their type as keys")
def _():
    result = invert_grouped({"low": 1, "high": 3, "minor": 1})
    eq(result, {1: ["low", "minor"], 3: ["high"]})
    check("1" not in result, "the int 1 shouldn't turn into the string '1'")

@test("falsy values are keys like any other")
def _():
    eq(invert_grouped({"a": 0, "b": None, "c": "", "d": 0}), {0: ["a", "d"], None: ["b"], "": ["c"]})

@test("values appear in order of first appearance")
def _():
    eq(list(invert_grouped({"x": "b", "y": "a", "z": "b"})), ["b", "a"])

@test("empty in, empty out")
def _():
    eq(invert_grouped({}), {})

@test("returns a plain dict")
def _():
    raises(KeyError, lambda: invert_grouped({"a": 1})[2])

@test("no 'is the key there yet?' check")
def _():
    forbids_syntax(ast.If, "setdefault (or a defaultdict) creates the list for you")
```

```hint
`d.setdefault(key, [])` returns `d[key]`, storing the `[]` first if the key is missing. Chain `.append(...)` straight onto it.
```

```hint
`defaultdict(list)` works too. Convert it with `dict(...)` before returning, so a missing value raises `KeyError` instead of conjuring an empty list.
```
:::

:::challenge id=drill-obj-clone-cart title="structuredClone → deepcopy" difficulty=medium
Write `with_quantity(cart: dict, sku: str, qty: int) -> dict` that returns an updated **copy** of the cart: the line with that `sku` gets the new `qty` (or a new line `{"sku": sku, "qty": qty}` is appended), and `version` goes up by one. The original cart, including everything nested inside it, must not change, and the copy must share no mutable parts with it.

`copy.deepcopy` is Python's `structuredClone`. A shallow copy (`cart.copy()` or `{**cart}`) would still share the `lines` list and its dicts. And skip the old `JSON.parse(JSON.stringify(x))` trick: JSON has no tuples and no datetimes, so a round trip would change or reject them, and this cart has both.

Refresher: [Copying: shallow and deep](lesson:lists#copying-shallow-and-deep) and [`find`](lesson:map-filter-reduce#find-findindex-some-and-every).

```js
function withQuantity(cart, sku, qty) {
  const next = structuredClone(cart);
  const line = next.lines.find((l) => l.sku === sku);
  if (line) line.qty = qty;
  else next.lines.push({ sku, qty });
  next.version += 1;
  return next;
}
```

```python starter
def with_quantity(cart: dict, sku: str, qty: int) -> dict:
    ...
```

```python solution
import copy


def with_quantity(cart: dict, sku: str, qty: int) -> dict:
    updated = copy.deepcopy(cart)
    line = next((line for line in updated["lines"] if line["sku"] == sku), None)
    if line is None:
        updated["lines"].append({"sku": sku, "qty": qty})
    else:
        line["qty"] = qty
    updated["version"] += 1
    return updated
```

```python tests
from datetime import datetime, timezone

def make_cart():
    return {
        "id": "c-42",
        "version": 3,
        "lines": [{"sku": "tea", "qty": 2}, {"sku": "mug", "qty": 1}],
        "coupons": ("SPRING",),
        "created": datetime(2025, 3, 1, 9, 30, tzinfo=timezone.utc),
    }

@test("updates an existing line and bumps the version")
def _():
    result = with_quantity(make_cart(), "mug", 4)
    eq(result["lines"], [{"sku": "tea", "qty": 2}, {"sku": "mug", "qty": 4}])
    eq(result["version"], 4)

@test("appends a line for a new sku")
def _():
    result = with_quantity(make_cart(), "jam", 1)
    eq(result["lines"], [{"sku": "tea", "qty": 2}, {"sku": "mug", "qty": 1}, {"sku": "jam", "qty": 1}])

@test("a quantity of 0 is set, not skipped")
def _():
    eq(with_quantity(make_cart(), "tea", 0)["lines"][0], {"sku": "tea", "qty": 0})

@test("the original cart is untouched")
def _():
    cart = make_cart()
    with_quantity(cart, "mug", 4)
    with_quantity(cart, "jam", 1)
    eq(cart, make_cart())

@test("the copy shares nothing mutable with the original")
def _():
    cart = make_cart()
    result = with_quantity(cart, "jam", 1)
    result["lines"][0]["qty"] = 99
    eq(cart["lines"][0], {"sku": "tea", "qty": 2}, "changing the copy changed the original")

@test("tuples and datetimes survive the copy")
def _():
    result = with_quantity(make_cart(), "tea", 3)
    eq(result["coupons"], ("SPRING",))
    eq(result["created"], datetime(2025, 3, 1, 9, 30, tzinfo=timezone.utc))

@test("uses copy.deepcopy()")
def _():
    requires_call("deepcopy", "copy.deepcopy() is Python's structuredClone()")
```

```hint
`copy.deepcopy(cart)` copies every nested list and dict. After that, mutate the copy freely.
```

```hint
`next((line for line in updated["lines"] if line["sku"] == sku), None)` is `find`.
```
:::

:::challenge id=drill-obj-suggest-friends title="Set algebra" difficulty=hard
Write `suggest_friends(graph: dict[str, list[str]], user: str) -> list[str]`. `graph` maps each person to their friends, and friendship goes both ways. Suggest everyone who is a friend of one of `user`'s friends, except `user` and their existing friends. Rank the suggestions by how many friends they share with `user`, most first, then alphabetically. Anyone missing from `graph` has no friends.

```text
graph = {
    "ada": ["grace", "linus"],
    "grace": ["ada", "linus", "matz"],
    "linus": ["ada", "grace", "matz", "ken"],
    "matz": ["grace", "linus"],
    "ken": ["linus"],
}
suggest_friends(graph, "ada")  ->  ['matz', 'ken']
```

ES2025's `Set` methods map onto operators: `union` is `|`, `intersection` is `&` and `difference` is `-`, and set comprehensions build the sets. One real difference: JavaScript sets remember insertion order and Python sets don't, so the explicit sort is what makes the result predictable.

Refresher: [Set algebra: operators and methods](lesson:sets#set-algebra-operators-and-methods) and [no insertion order](lesson:sets#no-insertion-order).

```js
function suggestFriends(graph, user) {
  const friends = new Set(graph[user] ?? []);
  const candidates = new Set();
  for (const friend of friends) {
    for (const other of graph[friend] ?? []) candidates.add(other);
  }
  const suggestions = candidates.difference(friends).difference(new Set([user]));
  const mutual = (person) => new Set(graph[person] ?? []).intersection(friends).size;
  return [...suggestions].sort((a, b) => mutual(b) - mutual(a) || a.localeCompare(b));
}
```

```python starter
def suggest_friends(graph: dict[str, list[str]], user: str) -> list[str]:
    ...
```

```python solution
def suggest_friends(graph: dict[str, list[str]], user: str) -> list[str]:
    friends = set(graph.get(user, []))
    candidates = {other for friend in friends for other in graph.get(friend, [])}
    suggestions = candidates - friends - {user}

    def mutual(person: str) -> int:
        return len(friends & set(graph.get(person, [])))

    return sorted(suggestions, key=lambda person: (-mutual(person), person))
```

```python tests
def make_graph():
    return {
        "ada": ["grace", "linus"],
        "grace": ["ada", "linus", "matz"],
        "linus": ["ada", "grace", "matz", "ken"],
        "matz": ["grace", "linus"],
        "ken": ["linus"],
        "barbara": [],
    }

@test("ranks friends of friends by mutual friends")
def _():
    eq(suggest_friends(make_graph(), "ada"), ["matz", "ken"])

@test("never suggests the user or an existing friend")
def _():
    eq(suggest_friends(make_graph(), "grace"), ["ken"])

@test("ties are broken alphabetically")
def _():
    eq(suggest_friends(make_graph(), "ken"), ["ada", "grace", "matz"])

@test("no friends, or an unknown user, means no suggestions")
def _():
    eq(suggest_friends(make_graph(), "barbara"), [])
    eq(suggest_friends(make_graph(), "nobody"), [])

@test("a friend missing from the graph has no friends, not a KeyError")
def _():
    graph = {"me": ["ghost", "hub"], "hub": ["me", "zed"], "zed": ["hub"]}
    eq(suggest_friends(graph, "me"), ["zed"])

@test("set operators, not add() loops")
def _():
    forbids_call("add", "build the sets with comprehensions and combine them with | & -")
```

```hint
A set comprehension with two `for` clauses collects the friends of friends: `{other for friend in friends for other in graph.get(friend, [])}`. Then `- friends - {user}` removes the people you shouldn't suggest.
```

```hint
`len(friends & set(graph.get(person, [])))` counts mutual friends. Sort with `key=lambda person: (-mutual(person), person)`.
```
:::

:::challenge id=drill-obj-json-events title="JSON round trip" difficulty=hard
An API written in JavaScript sends and receives events as JSON. Write the Python side:

- `to_json(event: dict) -> str` must produce exactly what `JSON.stringify(event)` would: no spaces, non-ASCII characters written as they are, and each `datetime` (they're always timezone-aware) written the way `Date.prototype.toJSON` writes it: in UTC, with milliseconds and a trailing `Z`, like `"2024-05-01T12:30:00.000Z"`. Any other value JSON can't represent, like a `set`, raises `TypeError`, where `JSON.stringify` would silently write `{}` for a `Set`.
- `from_json(text: str) -> dict` parses the text and, like the reviver in the JavaScript version, turns every value under an `"at"` key, at any depth, back into an aware `datetime`.

```text
to_json({"id": 7, "at": datetime(2024, 5, 1, 12, 30, tzinfo=timezone.utc), "note": "café"})
->  '{"id":7,"at":"2024-05-01T12:30:00.000Z","note":"café"}'
```

`json.dumps` has different defaults: it puts a space after every `,` and `:`, and escapes non-ASCII characters, so `"café"` comes out as `"caf\u00e9"`. The `separators` and `ensure_ascii` arguments fix both, and `default` handles the datetimes. On the way back, `object_hook` is called with every decoded dict, and `datetime.fromisoformat` accepts the `Z` suffix (3.11+).

Refresher: [JSON](lesson:dicts#json), [aware and naive datetimes](lesson:standard-library#aware-and-naive-datetimes) and [CSV, JSON & Config Files](lesson:data-formats).

```js
const toJson = (event) => JSON.stringify(event);

const fromJson = (text) =>
  JSON.parse(text, (key, value) => (key === "at" ? new Date(value) : value));
```

```python starter
import json
from datetime import datetime, timezone


def to_json(event: dict) -> str:
    ...


def from_json(text: str) -> dict:
    ...
```

```python solution
import json
from datetime import datetime, timezone


def _encode(value):
    if isinstance(value, datetime):
        utc = value.astimezone(timezone.utc)
        return utc.isoformat(timespec="milliseconds").replace("+00:00", "Z")
    raise TypeError(f"{type(value).__name__} is not JSON serializable")


def _revive(obj: dict) -> dict:
    if "at" in obj:
        obj["at"] = datetime.fromisoformat(obj["at"])
    return obj


def to_json(event: dict) -> str:
    return json.dumps(event, separators=(",", ":"), ensure_ascii=False, default=_encode)


def from_json(text: str) -> dict:
    return json.loads(text, object_hook=_revive)
```

```python tests
from datetime import datetime, timedelta, timezone

AT = datetime(2024, 5, 1, 12, 30, tzinfo=timezone.utc)

@test("compact output, like JSON.stringify")
def _():
    eq(
        to_json({"id": 7, "tags": ["a", "b"], "ok": True, "note": None}),
        '{"id":7,"tags":["a","b"],"ok":true,"note":null}',
    )

@test("commas and colons inside strings are left alone")
def _():
    eq(to_json({"note": "a, b: c"}), '{"note":"a, b: c"}')

@test("non-ASCII text is written as is")
def _():
    eq(to_json({"city": "Zürich", "note": "café ☕"}), '{"city":"Zürich","note":"café ☕"}')

@test("datetimes become ISO strings in UTC, with milliseconds and Z")
def _():
    eq(to_json({"at": AT}), '{"at":"2024-05-01T12:30:00.000Z"}')
    later = datetime(2024, 5, 1, 12, 30, 5, 250000, tzinfo=timezone.utc)
    eq(to_json({"at": later}), '{"at":"2024-05-01T12:30:05.250Z"}')

@test("other offsets are converted to UTC first")
def _():
    cest = timezone(timedelta(hours=2))
    eq(to_json({"at": datetime(2024, 5, 1, 14, 30, tzinfo=cest)}), '{"at":"2024-05-01T12:30:00.000Z"}')

@test("anything else JSON can't represent raises TypeError")
def _():
    raises(TypeError, to_json, {"tags": {"a", "b"}})

@test("to_json leaves the event alone")
def _():
    event = {"at": AT, "tags": ["a"]}
    to_json(event)
    eq(event, {"at": AT, "tags": ["a"]})

@test("from_json revives 'at' values at any depth")
def _():
    event = from_json('{"id":7,"at":"2024-05-01T12:30:00.000Z","replies":[{"at":"2024-05-02T08:00:00.000Z"}]}')
    eq(event["at"], AT)
    eq(event["replies"][0]["at"], datetime(2024, 5, 2, 8, 0, tzinfo=timezone.utc))

@test("other strings that look like dates stay strings")
def _():
    eq(from_json('{"note":"2024-05-01T12:30:00.000Z"}'), {"note": "2024-05-01T12:30:00.000Z"})

@test("round trip")
def _():
    event = {"id": 1, "type": "comment", "at": AT, "text": "olá", "replies": [{"at": AT, "text": "👍"}]}
    eq(from_json(to_json(event)), event)
```

```hint
`json.dumps(value, separators=(",", ":"), ensure_ascii=False)` matches `JSON.stringify`'s spacing and leaves non-ASCII text alone.
```

```hint
`default=fn` is called with every object `json` can't serialize. Return a string for a `datetime` and raise `TypeError` for anything else. `dt.astimezone(timezone.utc).isoformat(timespec="milliseconds")` ends in `+00:00`, so swap that for `Z`.
```

```hint
`json.loads(text, object_hook=fn)` calls `fn` with each dict as it's decoded, innermost first, and uses whatever `fn` returns in its place.
```
:::
