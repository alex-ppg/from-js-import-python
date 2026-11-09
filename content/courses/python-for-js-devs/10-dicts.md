---
title: Objects & Maps → Dicts
part: Collections
summary: Objects and Maps in one type: KeyError vs .get(), live views, merging, Counter, defaultdict and JSON.
minutes: 35
---

In JavaScript you pick between a plain object (string keys, literal syntax, JSON-shaped) and a `Map` (any key, insertion order, a real `.size`). Python's `dict` is both at once: object-literal syntax with `Map` semantics. Keys can be any hashable value and are never coerced to strings, order is plain insertion order, and there's no prototype underneath.

Two habits to unlearn right away: there's **no dot access**, and reading a missing key **raises `KeyError`** instead of handing you `undefined`.

## Dict literals

:::compare
```js
const user = { name: "Ada", age: 36 };
const key = "role";
const admin = { ...user, [key]: "admin" };
const empty = {};
const lookup = new Map([[1, "one"], [2, "two"]]);
const short = { name, age };            // shorthand properties
```
```python
user = {"name": "Ada", "age": 36}
key = "role"
admin = {**user, key: "admin"}
empty = {}
lookup = {1: "one", 2: "two"}
short = {"name": name, "age": age}      # no shorthand
```
:::

A dict literal looks like an object literal, but its keys are **expressions**, evaluated like any other. A string key needs quotes, because a bare word is a variable name. So JavaScript's computed `[key]: value` is simply the normal behaviour, and one literal syntax covers both the object and the `Map` use cases. For string keys that are valid identifiers, `dict(name="Ada", age=36)` works too.

```python run
field = "email"
contact = {field: "ada@example.com", "verified": True}
print(contact)

grid = {(0, 0): "start", 42: "answer", None: "nothing"}   # any hashable key
print(grid[(0, 0)], grid[42], grid[None])

print(dict(name="Ada", age=36))     # keyword form: string keys only
```

:::gotcha `{ name, age }` is a set
There's no shorthand property syntax. `{name, age}` is valid Python, but it builds a **set** of the two values (see [Sets](lesson:sets)). And `{name: "Ada"}` doesn't use the key `"name"`: it uses whatever the variable `name` holds, or raises `NameError` if there is no such variable.
:::

:::quiz output
What does this print?

```python
name = "title"
book = {name: "Dune"}
print(book)
```

- [ ] `{'name': 'Dune'}`
- [x] `{'title': 'Dune'}`
- [ ] `NameError`

The key is the *value* of the variable `name`. To get the key `"name"`, write the string: `{"name": "Dune"}`.
:::

## Reading values: brackets, `get()` and `in`

:::compare
```js
const user = { name: "Ada" };

user["name"];                     // "Ada"
user.name;                        // "Ada"
user.email;                       // undefined
user.email ?? "n/a";              // "n/a"
"name" in user;                   // true
"toString" in user;               // true: inherited from the prototype
```
```python
user = {"name": "Ada"}

user["name"]                      # "Ada"
user.name                         # AttributeError: no dot access
user["email"]                     # KeyError: 'email'
user.get("email", "n/a")          # "n/a"
"name" in user                    # True
"keys" in user                    # False: methods aren't keys
```
:::

Square brackets are the only syntax for keys. A missing key raises `KeyError`, Python's way of failing fast on a typo'd property name. Use `d[k]` when the key must be there and `d.get(k, default)` when absence is normal; without a default, `get` returns `None`. And `in` tests **keys**, never values. Use `value in d.values()` for those.

```python run raises
settings = {"theme": "dark", "font_size": 0, "proxy": None}

print(settings.get("font_size", 14))      # 0: the key exists
print(settings.get("language", "en"))     # missing -> default
print(settings.get("proxy", "unset"))     # None is a stored value
print("proxy" in settings, "dark" in settings, "dark" in settings.values())

print(settings["languge"])                # a typo -> KeyError
```

:::gotcha `get()` can't tell `None` from missing
`d.get(k)` returns `None` both when the key is absent and when it's stored with the value `None`, so the JS distinction between "missing" (`undefined`) and "deliberately empty" (`null`) collapses. When it matters, test `k in d`. And prefer `d.get(k, 14)` to `d.get(k) or 14`, which also replaces a stored `0` or `""` (see [Truthiness](lesson:truthiness-and-equality)).
:::

### No dot access

:::compare
```js
const user = { name: "Ada", age: 36 };

user.name;                          // "Ada"
user.age += 1;
console.log(user);
```
```python run
from types import SimpleNamespace
user = SimpleNamespace(name="Ada", age=36)
print(user.name)
user.age += 1
print(user)
```
:::

A dict is a data structure, not an object with properties, so `user.name` raises `AttributeError`. That's a feature: keys can be any value, and data can never collide with method names such as `keys` or `items`. When you want attribute access, use a different type:

- `types.SimpleNamespace` is an ad-hoc attribute bag, the closest thing to a JS object literal. `SimpleNamespace(**user)` converts a dict, and `vars(ns)` converts back.
- A dataclass (or a NamedTuple) suits a known shape: you get a constructor, a `repr`, equality and type-checker support. See [Dataclasses](lesson:dataclasses-and-enums).
- JSON-shaped data usually stays a dict. To type-check its shape, describe it with a `TypedDict` ([Type Hints](lesson:type-hints)).

## Keys: any hashable value, compared by value

:::compare
```js
const obj = {};
obj[1] = "number";
obj["1"] = "string";          // same key: "1"
Object.keys(obj);             // ["1"]

const m = new Map();
m.set([0, 0], "origin");
m.get([0, 0]);                // undefined: a different array
```
```python
d = {}
d[1] = "number"
d["1"] = "string"             # a different key
list(d)                       # [1, "1"]

m = {}
m[(0, 0)] = "origin"
m[(0, 0)]                     # "origin": equal tuples, same key
```
:::

Object keys are always strings (or symbols), so `obj[1]` and `obj["1"]` are the same slot. Dict keys keep their type, like `Map` keys, so `1` and `"1"` are different keys. Unlike `Map`, a dict matches keys by **value** (equal hash, then `==`), not by identity, which is what makes tuples work as composite keys (see [Tuples](lesson:tuples-and-unpacking)).

The price is that keys must be **hashable**. Immutable built-ins qualify: `str`, `int`, `float`, `bool`, `None`, `frozenset`, and tuples of hashables. Lists, dicts and sets don't.

```python run raises
seats = {("A", 1): "Ada", ("A", 2): "Grace"}
print(seats["A", 2])             # brackets build the tuple for you

ids = {1: "one", "1": "the string one"}
print(len(ids), ids[1], ids["1"])

seats[["B", 1]] = "Linus"        # a list can't be a key
```

:::quiz output
What does this print?

```python
print({1: "int", 1.0: "float", True: "bool"})
```

- [ ] `{1: 'int', 1.0: 'float', True: 'bool'}`
- [ ] `{1: 'int'}`
- [x] `{1: 'bool'}`
- [ ] `{True: 'bool'}`

Keys match by equality, and `1 == 1.0 == True` in Python (and their hashes are equal), so all three land in one slot. The first key object stays and the last value wins.
:::

:::deep Hash tables all the way down
A dict hashes each key to pick a slot, then uses `==` to confirm the match. That's why equal keys must have equal hashes, why mutable containers opt out of hashing (a list that changed after insertion would sit in the wrong slot), and why lookups take constant time on average. Your own classes are hashable by identity until you define `__eq__`; [Dunder Methods](lesson:dunder-methods) covers `__hash__`.
:::

## Order: insertion order, no surprises

:::compare
```js
const byId = { b: "x", 2: "y", a: "z", 1: "w" };
Object.keys(byId);        // ["1", "2", "b", "a"]: integer keys first!
```
```python
by_id = {"b": "x", 2: "y", "a": "z", 1: "w"}
list(by_id)               # ["b", 2, "a", 1]: insertion order, always
```
:::

JavaScript objects list integer-like keys first, in ascending numeric order, and only then string keys in insertion order. Dicts, like `Map`s, use pure insertion order, guaranteed by the language since Python 3.7. Overwriting an existing key keeps its position, while deleting and re-adding moves it to the end. Equality ignores order: two dicts are equal when they hold the same key/value pairs.

```python run
stock = {"apples": 3, "kiwis": 0, "mangos": 5}
stock["apples"] = 10          # update: keeps its place
print(list(stock))
del stock["apples"]
stock["apples"] = 1           # re-insert: moves to the end
print(list(stock))
print({"a": 1, "b": 2} == {"b": 2, "a": 1})
```

:::note `OrderedDict` is mostly history
Before 3.7 you needed `collections.OrderedDict` to keep order. It survives for its extras, such as `move_to_end()` and an equality test between two `OrderedDict`s that does care about order, but a plain dict is the default choice.
:::

## Iterating: keys(), values(), items()

:::compare
```js
for (const key of Object.keys(obj)) {}
for (const value of Object.values(obj)) {}
for (const [key, value] of Object.entries(obj)) {}
Object.keys(obj).length;              // or map.size
```
```python
for key in d: ...                     # or: for key in d.keys()
for value in d.values(): ...
for key, value in d.items(): ...
len(d)
```
:::

Iterating a dict yields its keys. `.items()` yields `(key, value)` tuples that you unpack right in the loop header: it's the `Object.entries` you'll type most often. `len(d)` replaces both `Object.keys(obj).length` and `map.size`.

`keys()`, `values()` and `items()` don't copy anything. They return **views**: live windows onto the dict that reflect later changes. Key views (and item views, when the values are hashable) also behave like sets, so you can diff the keys of two dicts with set operators from [Sets](lesson:sets). Wrap a view in `list()` when you need a snapshot.

```python run
prices = {"apple": 1.25, "kiwi": 0.5}
keys = prices.keys()
prices["mango"] = 2.0
print(keys)                                 # the view sees the new key
print(len(keys), "mango" in keys)

old = {"apple": 1.25, "kiwi": 0.5, "fig": 3.0}
print(sorted(prices.keys() - old.keys()))   # added
print(sorted(old.keys() - prices.keys()))   # removed
print(sorted(prices.keys() & old.keys()))   # in both
```

### Mutating while iterating

:::gotcha Adding or removing keys mid-loop raises
If a dict changes size while you loop over it (or over one of its views), Python raises `RuntimeError: dictionary changed size during iteration`. JavaScript tolerates this: `delete` inside `for...in` is allowed, and a `Map` even visits entries added mid-loop. Updating the *values* of existing keys is fine. To remove keys, loop over a snapshot (`for k in list(d):`) or, usually better, build a new dict with a comprehension.
:::

```python run raises
stock = {"apples": 3, "kiwis": 0, "mangos": 5}

for fruit in stock:
    stock[fruit] *= 2                        # changing values: fine
print(stock)

in_stock = {k: v for k, v in stock.items() if v > 0}   # the idiomatic filter
print(in_stock)

for fruit in stock:
    if stock[fruit] == 0:
        del stock[fruit]                     # RuntimeError
```

### Sorting by value

:::compare
```js
const votes = { tabs: 31, spaces: 58, both: 4 };
const ranking = Object.entries(votes).sort((a, b) => b[1] - a[1]);
console.log(ranking);
console.log(Object.fromEntries(ranking));
console.log(ranking[0][0]);                  // the top key
console.log(Object.keys(votes).sort());
```
```python run
votes = {"tabs": 31, "spaces": 58, "both": 4}
ranking = sorted(votes.items(), key=lambda kv: kv[1], reverse=True)
print(ranking)
print(dict(ranking))
print(max(votes, key=votes.get))
print(sorted(votes))
```
:::

Dicts have no `sort` method. Sort their items and, if you need a dict again, rebuild one from the sorted pairs, which keeps that order. `sorted(d)` sorts the keys. For "the key with the biggest value", `max(d, key=d.get)` passes the dict's own `get` method as the key function, and `operator.itemgetter(1)` can replace `lambda kv: kv[1]`.

## Adding, updating and removing

:::compare
```js
user.email = "ada@example.com";
Object.assign(user, { age: 37, role: "admin" });
const merged = { ...defaults, ...overrides };
delete user.role;                     // true, even if it was missing
const age = user.age; delete user.age;
map.delete("k");                      // false if it was missing
user.tags ??= [];                     // set only if missing
```
```python
user["email"] = "ada@example.com"
user.update({"age": 37, "role": "admin"})
merged = defaults | overrides         # 3.9+, or {**defaults, **overrides}
del user["role"]                      # KeyError if missing
age = user.pop("age")                 # remove and return the value
user.pop("k", None)                   # with a default: no error
user.setdefault("tags", [])           # set only if missing
```
:::

`|` merges two dicts into a new one and `|=` merges in place (both 3.9+). `{**a, **b}` is the spread spelling, and it also works on older versions. In every form, the **right-hand side wins** on duplicate keys, just as later spreads win in JS, and keys keep the position where they first appeared. `update()` and `|=` accept any mapping or an iterable of pairs, while `|` insists on two dicts.

Removal is strict by default: `del d[k]` and `d.pop(k)` raise `KeyError` for a missing key, so pass `pop` a default when absence is fine. `d.popitem()` removes and returns the most recently inserted pair, and `d.clear()` empties the dict.

```python run
defaults = {"theme": "light", "font_size": 14, "autosave": True}
user_prefs = {"theme": "dark", "font_size": 16}

settings = defaults | user_prefs
print(settings)
print({**defaults, **user_prefs, "autosave": False})

settings |= [("language", "en")]        # |= takes any iterable of pairs
print(settings.pop("autosave"), settings.pop("missing", None))
print(settings)
```

:::quiz output
What does this print?

```python
a = {"x": 1, "y": 2}
b = {"y": 20, "z": 30}
print(b | a)
```

- [ ] `{'x': 1, 'y': 20, 'z': 30}`
- [x] `{'y': 2, 'z': 30, 'x': 1}`
- [ ] `{'y': 20, 'z': 30, 'x': 1}`
- [ ] `TypeError`

The right operand wins on duplicate keys, so `y` takes `a`'s value, `2`. Order comes from the left operand first, with new keys from the right appended at the end.
:::

:::tip Copies are shallow
`d.copy()`, `dict(d)` and `{**d}` all make a new dict whose values are the same objects as before, so nested dicts and lists are shared, exactly as with `{ ...obj }`. Reach for `copy.deepcopy` when nested data must be independent, as with [lists](lesson:lists#copying-shallow-and-deep).
:::

## Building dicts: fromEntries, zip and comprehensions

:::compare
```js
Object.fromEntries([["a", 1], ["b", 2]]);
Object.fromEntries(keys.map((k, i) => [k, values[i]]));
Object.fromEntries(Object.entries(prices).map(([k, v]) => [k, v * 2]));
Object.fromEntries(Object.entries(prices).filter(([, v]) => v > 1));
Object.fromEntries(Object.entries(codes).map(([k, v]) => [v, k]));
Object.fromEntries(keys.map((k) => [k, 0]));
```
```python
dict([("a", 1), ("b", 2)])
dict(zip(keys, values))
{k: v * 2 for k, v in prices.items()}
{k: v for k, v in prices.items() if v > 1}
{v: k for k, v in codes.items()}
dict.fromkeys(keys, 0)
```
:::

`dict()` accepts any iterable of pairs, which makes it `Object.fromEntries`. Paired with `zip`, it builds a dict from parallel lists of keys and values. The **dict comprehension** `{key: value for ...}` handles mapping, filtering and inverting in one expression; it shares its syntax with list comprehensions, which [Comprehensions](lesson:map-filter-reduce) covers in depth. In every form, a repeated key keeps the last value.

```python run
headers = ["id", "name", "role"]
row = [7, "Grace", "admin"]
print(dict(zip(headers, row, strict=True)))     # strict: 3.10+

prices = {"apple": 1.25, "kiwi": 0.5, "mango": 2.0}
print({fruit: round(p * 1.2, 2) for fruit, p in prices.items()})
print({fruit: p for fruit, p in prices.items() if p >= 1})

codes = {"en": "English", "pt": "Portuguese"}
print({name: code for code, name in codes.items()})   # inverted
```

:::gotcha `dict.fromkeys(keys, [])` shares one list
`fromkeys` stores the *same* default object under every key, the dict version of `[[0] * 3] * 3`. That's fine for `0` or `None` and a bug for `[]` or `{}`: append to one key's list and every key sees it. Use a comprehension (`{k: [] for k in keys}`) or a `defaultdict(list)`.
:::

## Specialised mappings

The `collections` and `weakref` modules provide mappings for jobs you'd otherwise hand-roll around a plain dict or `Map`.

### defaultdict: no more "create it if it's missing"

:::compare
```js
const dependsOn = new Map();
for (const [src, dst] of edges) {
  if (!dependsOn.has(src)) dependsOn.set(src, []);
  dependsOn.get(src).push(dst);
}
```
```python
from collections import defaultdict

depends_on = defaultdict(list)
for src, dst in edges:
    depends_on[src].append(dst)
```
:::

A `defaultdict` takes a factory, any zero-argument callable, and calls it to create the value the first time a missing key is *read*: `list` gives `[]`, `int` gives `0`, `set` gives `set()`. Grouping is the classic use, and [Comprehensions](lesson:map-filter-reduce) shows it standing in for `Object.groupBy`. The built-in alternative is `d.setdefault(key, []).append(value)`, which reads the key, inserts the default if needed, and returns the value, all in one call.

```python run
from collections import defaultdict

edges = [("app", "db"), ("app", "cache"), ("worker", "db")]
depends_on = defaultdict(list)
for src, dst in edges:
    depends_on[src].append(dst)
print(dict(depends_on))

print(depends_on.get("db"), "db" in depends_on)   # no insertion
print(depends_on["db"], "db" in depends_on)       # inserted!
```

:::gotcha Reading a missing key inserts it
On a `defaultdict`, `d["typo"]` doesn't fail: it quietly adds `"typo"` with a fresh default. `in` and `.get()` don't trigger the factory, so use them for lookups that shouldn't create anything, and convert with `dict(d)` before handing the result to code that expects `KeyError`s.
:::

### Counter: counting in one line

:::compare
```js
const counts = {};
for (const w of words) counts[w] = (counts[w] ?? 0) + 1;
Object.entries(counts).sort((a, b) => b[1] - a[1]).slice(0, 3);
```
```python
from collections import Counter
counts = Counter(words)
counts.most_common(3)
```
:::

A `Counter` is a dict of counts. Build one from any iterable, then ask for `most_common(n)`, which lists the highest counts first and breaks ties by first appearance. Missing keys read as `0` *without* being inserted, `update()` adds more observations, and counters combine with `+` and `-`.

```python run
from collections import Counter

words = "the cat and the hat and the bat".split()
counts = Counter(words)
print(counts.most_common(2))
print(counts["the"], counts["dog"])      # missing -> 0, no KeyError
counts.update(["cat", "cat"])
print(counts["cat"], counts.total())     # total(): 3.10+

print(Counter("mississippi"))
```

:::quiz output
What does this print?

```python
from collections import Counter
letters = Counter("hello")
print(letters["l"], letters["z"], len(letters))
```

- [x] `2 0 4`
- [ ] `2 0 5`
- [ ] `2 None 4`
- [ ] `KeyError`

`"hello"` has four distinct letters, and `l` appears twice. Reading the missing `"z"` returns `0` but doesn't add it, so the length stays `4`. A `defaultdict(int)` would have inserted it.
:::

:::deep `__missing__` is the hook
When `d[key]` finds no key, `dict` calls `self.__missing__(key)` if the class defines it. `defaultdict` implements it by calling the factory and storing the result, and `Counter` by returning `0` without storing anything. `.get()` and `in` never call it, which is why they behave the same on all three types.
:::

### ChainMap: layered lookups

:::compare
```js
const config = { ...defaults, ...fromEnv, ...fromCli };
// a snapshot: later changes to defaults aren't seen
```
```python
from collections import ChainMap
config = ChainMap(from_cli, from_env, defaults)
# a live view: each lookup searches the dicts in order
```
:::

A `ChainMap` groups several dicts into one view. Lookups search them left to right and return the first hit, while writes and deletes go to the first dict only. It's how you layer command-line flags over environment variables over defaults without copying anything, and it behaves more like a prototype chain than like spreading.

```python run
from collections import ChainMap

defaults = {"theme": "light", "debug": False, "port": 8000}
from_env = {"debug": True}
from_cli = {"port": 9000}

config = ChainMap(from_cli, from_env, defaults)
print(config["theme"], config["debug"], config["port"])

from_env["debug"] = False            # live: the change shows through
config["theme"] = "dark"             # writes go to the first dict
print(config["debug"], from_cli, defaults["theme"])
```

### WeakMap → WeakKeyDictionary

:::compare
```js
const metadata = new WeakMap();
let session = new Session();
metadata.set(session, { user: "ada" });
session = null;          // the entry can now be collected
```
```python
import weakref
metadata = weakref.WeakKeyDictionary()
session = Session()
metadata[session] = {"user": "ada"}
del session              # the entry disappears
```
:::

`weakref.WeakKeyDictionary` holds its keys weakly, so an entry vanishes once nothing else references the key. That's how you attach data to objects you don't own without leaking memory. Keys must be hashable *and* weak-referenceable: instances of your own classes are, but `str`, `int`, `tuple`, `list` and `dict` objects aren't (JavaScript's `WeakMap` similarly refuses primitives). Its sibling `WeakValueDictionary` holds the values weakly instead, which suits caches.

CPython frees most objects the moment their last reference disappears, so the entry goes immediately, which JavaScript's garbage collector never promises. Objects caught in reference cycles wait for the cycle collector, though, so don't build program logic on the timing.

```python run
import weakref

class Session:
    pass

metadata = weakref.WeakKeyDictionary()
session = Session()
metadata[session] = {"user": "ada"}
print(len(metadata))

del session              # the last strong reference is gone...
print(len(metadata))     # ...and so is the entry
```

## JSON

:::compare
```js
// JSON is a global
const text = JSON.stringify(order);
const pretty = JSON.stringify(order, null, 2);
const back = JSON.parse(text);
JSON.stringify({ on: new Date() });         // Dates have toJSON()
JSON.stringify({ tags: new Set(["a"]) });   // '{"tags":{}}': silently lossy
```
```python
import json
text = json.dumps(order)
pretty = json.dumps(order, indent=2)
back = json.loads(text)
json.dumps({"on": today}, default=str)      # you supply the conversion
json.dumps({"tags": {"a"}})                 # TypeError: not serializable
```
:::

The `json` module maps JSON onto built-in types:

| JSON | Python |
| --- | --- |
| object | `dict` |
| array | `list` (tuples are written as arrays too) |
| string | `str` |
| number | `int` or `float` |
| `true` / `false` | `True` / `False` |
| `null` | `None` |

`dumps` and `loads` work with strings (the `s` stands for string), and `dump` and `load` read and write open files. Where `JSON.stringify` quietly drops or mangles values it can't represent, `json.dumps` raises `TypeError`, unless you pass `default=`: a function that converts an unknown object into something serializable (and raises `TypeError` itself for anything it doesn't handle).

```python run
import json
from datetime import date

order = {"id": 17, "items": ("apple", "kiwi"), "paid": True, "coupon": None}
text = json.dumps(order)
print(text)
print(json.loads(text))                    # the tuple comes back as a list

shipped = {"id": 17, "on": date(2025, 6, 1)}
print(json.dumps(shipped, default=str))    # str() of a date is ISO 8601
print(json.dumps(order, indent=2, sort_keys=True))
```

:::quiz output
What does this print?

```python
import json
data = json.loads(json.dumps({1: "one"}))
print(data.get(1))
```

- [ ] `one`
- [x] `None`
- [ ] `KeyError`
- [ ] `TypeError`

JSON object keys are always strings, so `dumps` writes the key `1` as `"1"`, and after the round trip the dict is `{'1': 'one'}`. Looking up the integer `1` finds nothing.
:::

:::gotcha Round trips change keys
`json.dumps` silently converts `int`, `float`, `bool` and `None` keys to strings, so a dict with non-string keys doesn't survive a round trip. Tuple keys don't convert at all: they raise `TypeError`. Turn composite keys into strings, or into a list of records, before serializing.
:::

:::tip The options you'll actually use
`indent=2` for humans, `sort_keys=True` for stable diffs, `ensure_ascii=False` to write `"Zürich"` instead of `"Z\u00fcrich"`, and `separators=(",", ":")` for the most compact output. Python writes `float("nan")` as `NaN`, which isn't valid JSON; `allow_nan=False` makes `dumps` raise `ValueError` instead.
:::

## Cheat sheet

| JavaScript | Python | Notes |
| --- | --- | --- |
| `{ name: "Ada" }` | `{"name": "Ada"}` | keys are expressions: quote strings |
| `{ [key]: value }` | `{key: value}` | |
| `obj.k`, `obj["k"]` | `d["k"]` | `KeyError` if missing |
| `obj.k ?? fallback` | `d.get("k", fallback)` | `None` without a fallback |
| `"k" in obj`, `map.has(k)` | `"k" in d` | keys only |
| `Object.keys(obj)` | `list(d)` or `d.keys()` | views are live |
| `Object.values(obj)` | `d.values()` | |
| `Object.entries(obj)` | `d.items()` | `for k, v in d.items():` |
| `Object.fromEntries(pairs)` | `dict(pairs)` | or a dict comprehension |
| `map.size` | `len(d)` | |
| `{ ...a, ...b }` | `a \| b` or `{**a, **b}` | right side wins |
| `Object.assign(a, b)` | `a.update(b)` or `a \|= b` | |
| `delete obj.k` | `del d["k"]` | `KeyError` if missing |
| `map.delete(k)` | `d.pop(k, None)` | `pop` returns the value |
| `obj.k ??= []` | `d.setdefault("k", [])` | returns the value |
| `new Map()` with array keys | `{(x, y): value}` | keys compare by value |
| sort `Object.entries` by value | `sorted(d.items(), key=...)` | `max(d, key=d.get)` |
| counting with `reduce` | `Counter(xs)` | `.most_common(n)` |
| `if (!m.has(k)) m.set(k, [])` | `defaultdict(list)` | reading inserts |
| `JSON.stringify(obj, null, 2)` | `json.dumps(d, indent=2)` | `default=` for other types |
| `JSON.parse(text)` | `json.loads(text)` | |
| `new WeakMap()` | `weakref.WeakKeyDictionary()` | |
| `structuredClone(obj)` | `copy.deepcopy(d)` | |

## Challenges

:::challenge id=dict-invert title="Invert a dict" difficulty=easy
Write `invert(d)` that swaps keys and values, so `{"en": "English"}` becomes `{"English": "en"}`. If two keys share a value, inverting would silently lose one of them, so raise `ValueError` instead. Don't modify the input.

Use a dict comprehension.

```js
function invert(obj) {
  const out = new Map();
  for (const [key, value] of Object.entries(obj)) {
    if (out.has(value)) throw new Error(`duplicate value: ${value}`);
    out.set(value, key);
  }
  return out;
}
```

```python starter
def invert(d):
    ...
```

```python solution
def invert(d):
    inverted = {value: key for key, value in d.items()}
    if len(inverted) != len(d):
        raise ValueError("values must be unique to invert a dict")
    return inverted
```

```python tests
@test("swaps keys and values")
def _():
    eq(invert({"en": "English", "pt": "Portuguese"}), {"English": "en", "Portuguese": "pt"})

@test("keeps the original order")
def _():
    eq(list(invert({"b": 2, "a": 1, "c": 3})), [2, 1, 3])

@test("works with any hashable values, falsy ones included")
def _():
    eq(invert({1: (0, 0), 2: (0, 1)}), {(0, 0): 1, (0, 1): 2})
    eq(invert({"zero": 0, "empty": ""}), {0: "zero", "": "empty"})

@test("an empty dict inverts to an empty dict")
def _():
    eq(invert({}), {})

@test("duplicate values raise ValueError")
def _():
    raises(ValueError, invert, {"a": 1, "b": 1})

@test("doesn't modify the input")
def _():
    d = {"x": 1, "y": 2}
    invert(d)
    eq(d, {"x": 1, "y": 2})

@test("uses a dict comprehension")
def _():
    requires_syntax(ast.DictComp, "build the result with {value: key for ...}")
```

```hint
`{value: key for key, value in d.items()}` builds the inverted dict.
```

```hint
When two keys share a value, the comprehension quietly keeps only the last one. Compare the lengths of the input and the result to detect it.
```
:::

:::challenge id=dict-diff title="Diff two dicts" difficulty=medium
Write `diff(old, new)` that compares two flat dicts, such as two versions of a config, and returns a report with three keys:

- `"added"`: the keys only in `new`, with their values,
- `"removed"`: the keys only in `old`, with their old values,
- `"changed"`: the keys in both whose values differ, mapped to `(old_value, new_value)` tuples.

Unchanged keys don't appear anywhere. Don't modify the inputs.

```text
diff({"host": "localhost", "port": 5432, "debug": True},
     {"host": "db.internal", "port": 5432, "pool": 10})
    ->  {"added": {"pool": 10},
         "removed": {"debug": True},
         "changed": {"host": ("localhost", "db.internal")}}
```

Key views behave like sets, so `new.keys() - old.keys()` is a good place to start.

```js
function diff(oldObj, newObj) {
  const added = {}, removed = {}, changed = {};
  for (const [k, v] of Object.entries(newObj)) {
    if (!(k in oldObj)) added[k] = v;
    else if (oldObj[k] !== v) changed[k] = [oldObj[k], v];  // objects compare by reference!
  }
  for (const [k, v] of Object.entries(oldObj)) {
    if (!(k in newObj)) removed[k] = v;
  }
  return { added, removed, changed };
}
```

```python starter
def diff(old, new):
    ...
```

```python solution
def diff(old, new):
    return {
        "added": {k: new[k] for k in new.keys() - old.keys()},
        "removed": {k: old[k] for k in old.keys() - new.keys()},
        "changed": {k: (old[k], new[k]) for k in old.keys() & new.keys() if old[k] != new[k]},
    }
```

```python tests
OLD = {"host": "localhost", "port": 5432, "debug": True}
NEW = {"host": "db.internal", "port": 5432, "pool": 10}

@test("reports added keys with their values")
def _():
    eq(diff(OLD, NEW)["added"], {"pool": 10})

@test("reports removed keys with their old values")
def _():
    eq(diff(OLD, NEW)["removed"], {"debug": True})

@test("reports changes as (old, new) tuples")
def _():
    eq(diff(OLD, NEW)["changed"], {"host": ("localhost", "db.internal")})

@test("identical dicts give three empty dicts")
def _():
    eq(diff(OLD, dict(OLD)), {"added": {}, "removed": {}, "changed": {}})
    eq(diff({}, {}), {"added": {}, "removed": {}, "changed": {}})

@test("None is a value, not a missing key")
def _():
    eq(diff({"proxy": 0}, {"proxy": None})["changed"], {"proxy": (0, None)})
    eq(diff({}, {"proxy": None})["added"], {"proxy": None})

@test("values compare by content, not identity")
def _():
    eq(diff({"tags": ["web"]}, {"tags": ["web"]})["changed"], {})

@test("keys keep their types: 1 and '1' are different keys")
def _():
    eq(diff({1: "a"}, {"1": "a"}), {"added": {"1": "a"}, "removed": {1: "a"}, "changed": {}})

@test("doesn't modify the inputs")
def _():
    old, new = dict(OLD), dict(NEW)
    diff(old, new)
    eq(old, OLD, "old was modified")
    eq(new, NEW, "new was modified")

@test("uses dict comprehensions")
def _():
    requires_syntax(ast.DictComp, "build each part with a dict comprehension")
```

```hint
`new.keys() - old.keys()` is the set of added keys, `old.keys() - new.keys()` the removed ones, and `old.keys() & new.keys()` the keys in both.
```

```hint
Build each part with a dict comprehension, such as `{k: new[k] for k in new.keys() - old.keys()}`. For `"changed"`, add an `if old[k] != new[k]` filter: `!=` compares lists and dicts by content.
```
:::

:::challenge id=dict-deep-merge title="Deep merge" difficulty=hard
Write `deep_merge(base, override)` that returns a **new** dict combining two nested configs. Keys from `override` win, except when *both* sides hold a dict under the same key: then those two dicts are deep-merged in turn. Every other value, including lists and `None`, simply replaces the base value. Don't modify either input.

```text
base     = {"db": {"host": "localhost", "port": 5432}, "debug": False}
override = {"db": {"port": 6543}, "debug": True}
deep_merge(base, override)
    ->  {"db": {"host": "localhost", "port": 6543}, "debug": True}
```

```js
function deepMerge(base, override) {
  const isObj = (v) => v !== null && typeof v === "object" && !Array.isArray(v);
  const out = { ...base };
  for (const [key, value] of Object.entries(override)) {
    out[key] = isObj(out[key]) && isObj(value) ? deepMerge(out[key], value) : value;
  }
  return out;
}
```

```python starter
def deep_merge(base, override):
    ...
```

```python solution
def deep_merge(base, override):
    merged = base | override              # a new dict: override wins at the top level
    for key in base.keys() & override.keys():
        if isinstance(base[key], dict) and isinstance(override[key], dict):
            merged[key] = deep_merge(base[key], override[key])
    return merged
```

```python tests
@test("override wins for plain values, and new keys are added")
def _():
    eq(deep_merge({"debug": False, "name": "app"}, {"debug": True}), {"debug": True, "name": "app"})
    eq(deep_merge({"a": 1}, {"b": {"c": 2}}), {"a": 1, "b": {"c": 2}})

@test("nested dicts merge key by key")
def _():
    base = {"db": {"host": "localhost", "port": 5432}, "debug": False}
    eq(deep_merge(base, {"db": {"port": 6543}}), {"db": {"host": "localhost", "port": 6543}, "debug": False})

@test("merges several levels deep")
def _():
    base = {"a": {"b": {"c": 1, "d": 2}}}
    eq(deep_merge(base, {"a": {"b": {"d": 3, "e": 4}}}), {"a": {"b": {"c": 1, "d": 3, "e": 4}}})

@test("lists are replaced, not concatenated")
def _():
    eq(deep_merge({"tags": ["web"]}, {"tags": ["api"]}), {"tags": ["api"]})

@test("None is a value: it replaces the base value")
def _():
    eq(deep_merge({"proxy": "http://cache:3128"}, {"proxy": None}), {"proxy": None})

@test("a dict and a non-dict: the override replaces")
def _():
    eq(deep_merge({"db": {"host": "x"}}, {"db": "sqlite://"}), {"db": "sqlite://"})
    eq(deep_merge({"db": "sqlite://"}, {"db": {"host": "x"}}), {"db": {"host": "x"}})

@test("doesn't modify either input")
def _():
    base = {"db": {"host": "localhost", "port": 5432}}
    override = {"db": {"port": 6543}}
    deep_merge(base, override)
    eq(base, {"db": {"host": "localhost", "port": 5432}}, "base was modified")
    eq(override, {"db": {"port": 6543}}, "override was modified")
```

```hint
Start from a shallow merge: `base | override` is a new dict that already gets every top-level key right.
```

```hint
Only keys present in *both* dicts can need recursion, and `base.keys() & override.keys()` gives exactly those.
```

```hint
Recurse when `isinstance(base[key], dict) and isinstance(override[key], dict)`. The recursive call returns a new dict, so nothing gets mutated.
```
:::
