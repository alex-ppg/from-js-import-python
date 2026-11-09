---
title: Truthiness, Booleans & Equality
part: Foundations
summary: Empty containers are falsy, NaN is truthy, == compares deeply, and there's no ===, ?? or ?. to lean on.
minutes: 30
---

Python's boolean logic looks like JavaScript's with the punctuation spelled out: `&&`, `||` and `!` become `and`, `or` and `not`, and they still short-circuit and return operands. The differences are in the values. **Empty containers are falsy** and **NaN is truthy**, so the "is this set?" checks you port will change meaning. Equality is simpler than in JS: there's one `==`, it never coerces, and it compares lists and dicts by their contents. There's no `===` to reach for, and no `??` or `?.` either, so this lesson also covers what replaces them.

## Booleans and falsy values

:::compare
```js
const flags = [true, false];
let user = null;              // or undefined

// falsy: false, 0, -0, 0n, "", null, undefined, NaN
Boolean([]);                  // true
Boolean({});                  // true
Boolean(NaN);                 // false
Boolean("0");                 // true

if (cart.items.length) render(cart.items);
```
```python
flags = [True, False]
user = None                   # the only "nothing" value

# falsy: False, None, zero of any number type, and empty containers
bool([])                      # False
bool({})                      # False
bool(float("nan"))            # True
bool("0")                     # True

if cart.items: render(cart.items)
```
:::

`True`, `False` and `None` are capitalized keywords. `None` is the single "no value" object that replaces both `null` and `undefined` (see [Variables, Types & Scope](lesson:variables-and-scope)), and `bool` is a subclass of `int`, so `True == 1` (see [Numbers & Math](lesson:numbers-and-math)). `bool(x)` converts like `Boolean(x)` or `!!x`, and `not x` is `!x`.

Python's falsy values are `False`, `None`, the zero of every numeric type (`0`, `0.0`, `0j`, `Decimal(0)`...), and **every empty container or sequence**: `""`, `[]`, `()`, `{}`, `set()`, `range(0)`, `b""`. Everything else is truthy unless its class says otherwise (next section). Two rules flip compared to JS: empty lists and dicts are falsy, and NaN, being a non-zero float, is truthy.

```python run
from decimal import Decimal

falsy = [False, None, 0, 0.0, -0.0, "", [], (), {}, set(), range(0), Decimal(0)]
truthy = ["0", "False", " ", [0], [[]], {"": None}, float("nan"), -1]

print([bool(value) for value in falsy])
print([bool(value) for value in truthy])
```

:::gotcha `if items:` means "if not empty"
In JS, `if (cart.items)` is true for an empty array, which is why JS code checks `.length`. In Python, `if items:` is the idiomatic emptiness test, and `if len(items) > 0:` is noise. The trap runs the other way when you port a presence check: `if user.tags:` now also skips users whose tag list exists but is empty. When "present but empty" must count as present, test `if user.tags is not None:`.
:::

:::gotcha NaN is truthy
`if price:` doesn't filter out NaN, because NaN is a non-zero float. Test it explicitly with `math.isnan(price)`.
:::

:::quiz output
What does this print?

```python
print(bool([0]), bool(float("nan")), bool(""))
```

- [x] `True True False`
- [ ] `False False False`
- [ ] `True False False`
- [ ] `False True False`

`[0]` is a non-empty list, and what's inside doesn't matter. NaN is a non-zero float. Only the empty string is falsy.
:::

## Custom truthiness: `__bool__` and `__len__`

:::compare
```js
class Cart {
  constructor(items = []) { this.items = [...items]; }
  get size() { return this.items.length; }
}

const cart = new Cart();
if (cart) { }        // always true: every object is truthy
if (cart.size) { }   // what you write instead
```
```python
class Cart:
    def __init__(self, items=()):
        self.items = list(items)
    def __len__(self):
        return len(self.items)

cart = Cart()
if cart: ...         # False: len(cart) == 0
if len(cart): ...    # works, but nobody writes it
```
:::

`bool(obj)` asks the object. Python calls `obj.__bool__()` if the class defines it (it must return a real `bool`). Otherwise it calls `__len__()` and treats `0` as falsy. Otherwise the object is truthy, as every object is in JS. That's how collection-like classes make `if cart:` read naturally. [Dunder Methods](lesson:dunder-methods) covers these protocol methods in general.

```python run
class Cart:
    def __init__(self, items=()):
        self.items = list(items)

    def __len__(self):
        return len(self.items)

class Account:
    def __init__(self, balance):
        self.balance = balance

    def __bool__(self):
        return self.balance > 0

print(bool(Cart()), bool(Cart(["book"])))
print(bool(Account(0)), bool(Account(50)))
print(bool(object()))          # neither method: truthy
```

:::gotcha `if result:` vs `if result is not None:`
Once a class defines `__len__`, an empty instance is falsy. So if `find_cart()` returns a `Cart` or `None`, then `if cart:` treats an empty cart exactly like a missing one. Say what you mean: `if cart is not None:` when the question is "did I get one?", and `if cart:` when it's "does it have anything in it?".
:::

:::note Some objects refuse to be truthy
A NumPy array with more than one element raises `ValueError` from `if arr:` ("The truth value of an array with more than one element is ambiguous"), and so does a pandas Series, because "any element true", "all elements true" and "non-empty" are all reasonable readings. They make you choose: `arr.any()`, `arr.all()` or `arr.size`.
:::

## `and`, `or` and `not` return operands

:::compare
```js
const name = input || "Anonymous";
const city = user && user.address && user.address.city;
const isEmpty = !items.length;

a || b && c;           // a || (b && c)
!a == b;               // (!a) == b
x > 0 && y > 0;
```
```python
name = text or "Anonymous"
city = user and user.address and user.address.city
is_empty = not items

a or b and c           # a or (b and c)
not a == b             # not (a == b)
x > 0 and y > 0
```
:::

`and` and `or` short-circuit and return one of their operands, exactly like `&&` and `||`. `x or y` returns `x` if it's truthy and `y` otherwise; `x and y` returns `x` if it's falsy and `y` otherwise. `not` is different: it always returns `True` or `False`.

The precedence order is the same as JS (`not`, then `and`, then `or`), with one twist: `not` binds more loosely than comparisons. `not a == b` means `not (a == b)`, where JS's `!a == b` means `(!a) == b`. For membership and identity there are dedicated negated operators, `x not in xs` and `x is not None`, which read better than `not x in xs`.

```python run
print(0 or "default", "" or None, [] or {})   # or: first truthy, else the last
print("a" and "b", 0 and 1 / 0)               # and: first falsy, else the last
print(not "", not [0], type(not 1))

a, b = 1, 2
print(not a == b)       # not (a == b) -> True
print((not a) == b)     # False == 2   -> False
```

:::gotcha `&` and `|` are not `and` and `or`
`&&` and `||` are syntax errors, which is good. The trap is the single-character versions, which exist as **bitwise** operators. They don't short-circuit, and they bind tighter than comparisons, so `x > 0 & y > 0` parses as the chained comparison `x > (0 & y) > 0`, which can never be true. (pandas and NumPy do use `&` and `|` for element-wise logic, which is why their examples parenthesize every comparison.)
:::

:::quiz output
What does this print?

```python
print(None or 0 or "" or [])
```

- [ ] `None`
- [ ] `0`
- [x] `[]`
- [ ] `False`

`or` returns the first truthy operand, or the **last** operand if none is truthy. All four are falsy, so you get `[]`. JavaScript's `||` behaves the same way.
:::

## No `??` and no `?.`

Python has neither nullish coalescing nor optional chaining. (PEP 505 proposed both years ago, and it has never been accepted.) Each has a few idiomatic replacements, and the right one depends on whether you're dealing with `None` values, missing dict keys or missing attributes.

### `??` and `??=`

:::compare
```js
const port = config.port ?? 8080;
const timeout = opts.timeout ?? 30;
const name = user.name || "Anonymous";

cache[key] ??= [];
opts.retries ??= 3;
```
```python
port = config.get("port", 8080)      # only if the key is missing
timeout = opts.timeout if opts.timeout is not None else 30
name = user.name or "Anonymous"      # any falsy value, like ||

cache.setdefault(key, [])
if opts.retries is None:
    opts.retries = 3
```
:::

The faithful translation of `a ?? b` is the conditional expression `a if a is not None else b`. It's wordy, so you'll see `or` used instead, and `or` is `||`, not `??`: it also throws away `0`, `""`, `[]` and `False`. Use `or` only when every falsy value should fall back to the default, as with a display name.

For dicts, `d.get(key, default)` returns the default when the key is **missing**, but not when it's present with the value `None` (JSON's `null`). `d.setdefault(key, value)` is `d[key] ??= value` for missing keys, and it returns the value, which makes `groups.setdefault(k, []).append(item)` a classic idiom (more in [Dicts](lesson:dicts)). For variables and attributes, `??=` is just an `if x is None:` block, `||=` is `x = x or default`, and the rarely needed `&&=` is `x = x and value`.

```python run
settings = {"port": 0, "name": "", "debug": None}

print(settings.get("port") or 8080)          # 8080: the 0 was thrown away
port = settings.get("port")
print(port if port is not None else 8080)    # 0: only None is replaced

print(settings.get("debug", True))           # None: the key exists
print(settings.get("verbose", True))         # True: the key is missing
```

:::gotcha `or` is `||`, not `??`
`retries = options.get("retries") or 3` silently turns an explicit `0` into `3`, and `title = form.get("title") or "Untitled"` turns a deliberately empty string into `"Untitled"`. Whenever `0`, `""` or `False` is a legitimate value, compare with `is None`.
:::

### `?.`

:::compare
```js
const city = data.user?.address?.city;
const name = user?.name;
const label = widget.label ?? "Untitled";
```
```python
city = data.get("user", {}).get("address", {}).get("city")
name = user.name if user is not None else None
label = getattr(widget, "label", "Untitled")
```
:::

Optional chaining guards against `null`/`undefined` receivers *and* missing properties, which in Python are separate problems:

- **Missing dict keys.** Chain `.get(key, {})` calls. When a value can also be an explicit `None`, write `(d.get(key) or {})` instead, which turns both cases into an empty dict you can keep calling `.get()` on.
- **A value that may be `None`.** Use a conditional expression, or the walrus operator (from [Control Flow](lesson:control-flow)) to name the intermediate value: `if (user := data.get("user")) is not None:`.
- **Missing attributes.** In JS, a missing property is `undefined`. In Python it raises `AttributeError`, so use `getattr(obj, "name", default)`.

For deeply nested, irregular JSON, `match` with mapping patterns checks the whole shape at once (see [Structural Pattern Matching](lesson:pattern-matching)).

```python run
order = {"id": 7, "customer": {"name": "Ada", "address": None}}

customer = order.get("customer") or {}
address = customer.get("address") or {}       # None and missing both become {}
print(address.get("city", "unknown"))

if (customer := order.get("customer")) is not None:
    print("ships to", customer["name"])

class Widget: ...
print(getattr(Widget(), "label", "Untitled"))  # missing attribute -> default
```

:::gotcha `.get(key, {})` doesn't protect you from `null`
`order.get("customer", {}).get("address", {}).get("city")` works when keys are missing, but here `"address"` is present with the value `None`, so the chain ends up calling `None.get("city")` and raises `AttributeError: 'NoneType' object has no attribute 'get'`. JSON from APIs is full of explicit nulls. Write `(d.get("address") or {})` when the value can be `None`.
:::

## `==` compares values, deeply

:::compare
```js
[1, 2] === [1, 2];                       // false: two objects
({ a: 1, b: 2 }) === ({ b: 2, a: 1 });   // false
_.isEqual(nested, copy);                 // deep equality needs a library
new Set([1, 2]) === new Set([2, 1]);     // false
```
```python
[1, 2] == [1, 2]                         # True: same contents
{"a": 1, "b": 2} == {"b": 2, "a": 1}     # True: key order doesn't matter
nested == copy                           # deep, recursive, built in
{1, 2} == {2, 1}                         # True
```
:::

`==` asks "same value?", and for the built-in containers that means **recursively equal contents**. Lists and tuples compare element by element, dicts by their key/value pairs regardless of insertion order, and sets by membership. A list never equals a tuple, though, so `[1, 2] == (1, 2)` is `False`. The negation is `!=`, and that's the whole set: no `===`, no `!==`.

Because `in`, `list.index()` and `list.count()` use `==`, they search by value too: `[1, 2] in [[1, 2]]` is `True` (see [Lists](lesson:lists#searching-includes-indexof-count)). Your own classes compare by identity until they define `__eq__` ([Dunder Methods](lesson:dunder-methods)), which `@dataclass` writes for you ([Dataclasses, NamedTuples & Enums](lesson:dataclasses-and-enums)).

```python run
order = {"id": 7, "items": [{"sku": "A1", "qty": 2}], "tags": {"gift"}}
copy = {"tags": {"gift"}, "items": [{"qty": 2, "sku": "A1"}], "id": 7}
print(order == copy)                  # deep, and key order is ignored
print([1, 2] == (1, 2), [1, 2] == [2, 1])

class Point:
    def __init__(self, x, y):
        self.x, self.y = x, y

print(Point(1, 2) == Point(1, 2))     # False: no __eq__, so identity
```

## `is` compares identity

:::compare
```js
const a = [1, 2];
const b = a;
const c = [1, 2];
a === b;                  // true: same object
a === c;                  // false
value === null;
```
```python
a = [1, 2]
b = a
c = [1, 2]
a is b                    # True: same object
a is c                    # False, although a == c
value is None
```
:::

`is` checks whether two names refer to the **same object**, which is what JS's `===` checks for objects. Use it for singletons: `None` above all (`if x is None:` and `if x is not None:`, as PEP 8 asks), and sentinel objects like `MISSING = object()` when `None` is itself a valid value. Why not `x == None`? Because classes can override `==`: a NumPy array returns an array from `== None`, and an ORM column returns a SQL expression. `is` can't be overridden, so it always means exactly one thing.

:::gotcha Never use `is` to compare values
CPython caches the integers from -5 to 256 and reuses some strings, so `is` *seems* to work on small values. Then a value computed at runtime turns out to be a different object, and the comparison silently flips: `int("256") is int("256")` is `True`, but `int("257") is int("257")` is `False`. The compiler warns about `x is 257` (`SyntaxWarning: "is" with 'int' literal`). Compare values with `==`.
:::

```python run
a = int("256")
b = int("256")
c = int("257")
d = int("257")
print(a is b, c is d, c == d)        # 256 comes from a cache; 257 doesn't

first = "".join(["hel", "lo"])
second = "".join(["hel", "lo"])
print(first == second, first is second)
```

:::quiz output
What does this print?

```python
orders = [3, 1, 2]
snapshot = orders[:]
print(orders == snapshot, orders is snapshot)
```

- [ ] `True True`
- [x] `True False`
- [ ] `False False`
- [ ] `False True`

The slice builds a new list with equal contents: equal by `==`, but a different object, so `is` is `False`.
:::

## No `===`, and no coercion

:::compare
```js
1 == "1";            // true: "1" is coerced
0 == "";             // true
null == undefined;   // true
[] == false;         // true
1 === 1.0;           // true: one number type
NaN === NaN;         // false
```
```python
1 == "1"             # False: different types are simply unequal
0 == ""              # False
None == False        # False
[] == False          # False, though both are falsy
1 == 1.0 == True     # True: numbers compare by value
float("nan") == float("nan")   # False
```
:::

Python has one equality operator, and it never converts its operands. Comparing values of unrelated types with `==` just returns `False`. It doesn't raise, unlike the ordering operators below. The JS coercion table, and the habit of writing `===` to dodge it, simply don't apply.

Numbers are the big exception. `int`, `float`, `complex`, `Decimal` and `Fraction` compare by mathematical value across types, and `bool` is an `int`, so `1 == 1.0 == True`. Equal numbers also hash the same, which makes them the *same key* in a dict or set: `{1: "a", True: "b", 1.0: "c"}` is the one-item dict `{1: 'c'}`.

```python run
print(1 == "1", 0 == "", None == False, [] == False)
print(1 == 1.0 == True)
print({1: "int", True: "bool", 1.0: "float"})   # one key: 1 == True == 1.0

nan = float("nan")
print(nan == nan, nan in [nan], [nan] == [nan])
```

:::deep Why `nan in [nan]` is `True`
Containers check identity before equality: `x in items` and list `==` treat an element as matching if it `is` the target *or* `==` it. That shortcut exists for speed, and it means the very same NaN object is found even though `nan == nan` is `False`. A *different* NaN isn't: `float("nan") in [float("nan")]` is `False`. JavaScript has its own split here, with `[NaN].includes(NaN)` true and `[NaN].indexOf(NaN)` -1.
:::

## Chained comparisons

:::compare
```js
0 <= x && x < 10;
a === b && b === c;
3 > 2 > 1;            // false: (3 > 2) > 1 is true > 1
```
```python
0 <= x < 10
a == b == c
3 > 2 > 1             # True: 3 > 2 and 2 > 1
```
:::

Comparisons chain the way they do in maths: `a < b < c` means `a < b and b < c`, except that `b` is evaluated only once. Every comparison operator chains, including `==`, `!=`, `is` and `in`, which makes range checks read naturally. In JS, `3 > 2 > 1` evaluates `(3 > 2) > 1`, which is `true > 1`, which is `false`.

```python run
age = 34
print(18 <= age < 65, 3 > 2 > 1)

def middle():
    print("evaluated once")
    return 5

print(0 < middle() < 10)
print(1 < 3 > 2)          # legal: 1 < 3 and 3 > 2
```

:::quiz output
What does this print?

```python
print(False == False in [False])
```

- [x] `True`
- [ ] `False`
- [ ] `TypeError`

`==` and `in` are both comparison operators, so they chain: this is `False == False and False in [False]`, and both halves are `True`. If you read it as `(False == False) in [False]`, you'd get `True in [False]`, which is `False`. Mixing `==` with `in` or `is` in one chain is legal but unreadable, so add parentheses.
:::

## Ordering: no mixing types

:::compare
```js
1 < "2";               // true: "2" becomes 2
null < 1;              // true: null becomes 0
[2] < [10];            // false: compares "2" < "10" as strings
[3, null, 1].sort();   // [1, 3, null]
```
```python
1 < "2"                # TypeError
None < 1               # TypeError
[2] < [10]             # True: element by element
sorted([3, None, 1])   # TypeError
```
:::

`==` is happy to say `False` across types, but `<`, `<=`, `>` and `>=` raise `TypeError` when the types have no natural order. Numbers mix freely (`1 < 2.5`, `True < 2`), while `str` against `int`, anything against `None`, and dicts against anything all raise. That includes sorting a list with a `None` in it, which JS would quietly convert to strings or push to the end. Python makes you decide where `None` goes, usually with a `key=` function (see [Lists](lesson:lists#sorting-and-reversing)).

Sequences of the same type compare **lexicographically**: the first unequal pair of elements decides, and if one sequence is a prefix of the other, the shorter one is smaller. That works for lists, tuples and strings, but a list never compares with a tuple. Tuple ordering powers multi-key sorting, covered in [Tuples & Destructuring](lesson:tuples-and-unpacking). (Sets are the odd one out: on sets, `<` means "proper subset", as [Sets](lesson:sets) explains.)

```python run
print([1, 2, 3] < [1, 3], (1, 2) < (1, 2, 0), "apple" < "apricot")
print(sorted([[2, "b"], [1, "z"], [2, "a"]]))

scores = [72, None, 95, None, 41]
print(sorted(scores, key=lambda s: (s is None, s)))   # None sorts last
```

:::tip Why the `(s is None, s)` key works
Each key is a tuple. `False` sorts before `True`, so real numbers come first, and two keys are only compared on their second item when the first items are equal. Two `None` entries produce equal tuples, so `None < None` is never evaluated.
:::

## Conditional expressions, `any()` and `all()`

:::compare
```js
const label = count === 1 ? "item" : "items";
const size = n < 10 ? "small" : n < 100 ? "medium" : "large";

const hasAdmin = users.some((u) => u.isAdmin);
const allPaid = orders.every((o) => o.paid);
```
```python
label = "item" if count == 1 else "items"
size = "small" if n < 10 else "medium" if n < 100 else "large"

has_admin = any(u.is_admin for u in users)
all_paid = all(o.paid for o in orders)
```
:::

Python's ternary puts the condition in the middle: `value_if_true if condition else value_if_false`. The condition is evaluated first, and only the chosen branch runs. It's an expression, so it works anywhere a value does: arguments, f-strings, comprehensions, return statements. It also has the lowest precedence of any operator except `lambda` and `:=`, so `x = a + b if ok else c` means `(a + b) if ok else c`. Chains read left to right but get unreadable fast; past two branches, use `if`/`elif` ([Control Flow](lesson:control-flow)) or a dict lookup.

`any()` and `all()` are built-in functions that take **any iterable**, usually a generator expression. They short-circuit like `some()` and `every()`, test truthiness rather than requiring booleans, and have the same answers for empty input: `any([])` is `False` and `all([])` is `True`. More in [map, filter, reduce → Comprehensions](lesson:map-filter-reduce).

```python run
count = 1
print(f"{count} {'item' if count == 1 else 'items'}")

orders = [{"id": 1, "paid": True}, {"id": 2, "paid": False}, {"id": 3, "paid": True}]
print(any(not o["paid"] for o in orders), all(o["paid"] for o in orders))
print(any([]), all([]))                        # same as [].some() and [].every()
print(any(["", 0, None]), all(["a", 1, [0]]))  # truthiness, not just booleans
```

:::quiz output
What does this print?

```python
print(1 + 2 if False else 3)
```

- [ ] `4`
- [x] `3`
- [ ] `1`
- [ ] `SyntaxError`

The conditional expression binds more loosely than `+`, so this is `(1 + 2) if False else 3`, and the condition is false.
:::

## Cheat sheet

| JavaScript | Python | Notes |
| --- | --- | --- |
| `true`, `false` | `True`, `False` | `bool` is a subclass of `int` |
| `null`, `undefined` | `None` | test with `is None` |
| `Boolean(x)`, `!!x` | `bool(x)` | |
| `!x` | `not x` | always returns a `bool` |
| `a && b`, `a \|\| b` | `a and b`, `a or b` | return an operand |
| `if (arr.length)` | `if arr:` | empty containers are falsy |
| `Number.isNaN(x)` | `math.isnan(x)` | NaN is truthy |
| `a ?? b` | `a if a is not None else b` | `a or b` also replaces `0` and `""` |
| `data.key ?? fallback` | `data.get("key", fallback)` | dicts; missing keys only, not `None` values |
| `a ??= b` | `if a is None: a = b` | `d.setdefault(k, b)` for dict keys |
| `a?.b?.c` on JSON | `(a.get("b") or {}).get("c")` | |
| `obj.prop ?? d` | `getattr(obj, "prop", d)` | missing attributes raise otherwise |
| `===`, `!==` | `==`, `!=` | no coercion; deep for containers |
| `_.isEqual(a, b)` | `a == b` | |
| object `===` | `a is b` | identity; use for `None` and sentinels |
| `lo <= x && x < hi` | `lo <= x < hi` | chains evaluate `x` once |
| `1 < "2"` | `TypeError` | no cross-type ordering |
| `c ? a : b` | `a if c else b` | |
| `arr.some(f)` | `any(f(x) for x in arr)` | |
| `arr.every(f)` | `all(f(x) for x in arr)` | |

## Challenges

:::challenge id=truthy-js-boolean title="What would JavaScript say?" difficulty=easy
Write `js_truthy(value)` that returns the `bool` JavaScript's `Boolean()` would produce for the equivalent JS value. Treat Python values like this:

- `None` is `null`, so it's falsy.
- Numbers, booleans and strings follow the same rules in both languages, **except** NaN, which is falsy in JS.
- Every other object (lists, dicts, sets, tuples, instances of your own classes) is a JS object, so it's truthy, even when Python would call it falsy.

```text
js_truthy([])            ->  True
js_truthy(float("nan"))  ->  False
js_truthy("0")           ->  True
js_truthy(0)             ->  False
```

```js
// Nothing to write: this is JavaScript's own definition.
const jsTruthy = (value) => Boolean(value);
```

```python starter
import math

def js_truthy(value) -> bool:
    return bool(value)
```

```python solution
import math

def js_truthy(value) -> bool:
    if isinstance(value, float) and math.isnan(value):
        return False
    if value is None or isinstance(value, (int, float, str)):  # bool is an int
        return bool(value)
    return True
```

```python tests
@test("empty containers are truthy in JS")
def _():
    for value in ([], {}, set(), ()):
        eq(js_truthy(value), True, f"js_truthy({value!r})")

@test("NaN is falsy in JS")
def _():
    eq(js_truthy(float("nan")), False)

@test("primitives follow the shared rules")
def _():
    eq([js_truthy(v) for v in (0, -0.0, "", False, None)], [False] * 5)
    eq([js_truthy(v) for v in (1, -2.5, "0", " ", True)], [True] * 5)

@test("objects are truthy even if they define __len__ or __bool__")
def _():
    class Empty:
        def __len__(self):
            return 0

    class Never:
        def __bool__(self):
            return False

    eq(js_truthy(Empty()), True)
    eq(js_truthy(Never()), True)

@test("returns a real bool")
def _():
    check(all(type(js_truthy(v)) is bool for v in (0, "x", [], None)), "return True or False, not the value itself")
```

```hint
Handle the special cases first: NaN is the only primitive whose answer differs. `math.isnan()` only accepts numbers, so check `isinstance(value, float)` before calling it.
```

```hint
After that, `bool(value)` is right for `None`, numbers and strings (`isinstance(value, (int, float, str))` covers `bool` too, because `bool` subclasses `int`), and everything else is simply `True`.
```
:::

:::challenge id=truthy-get-path title="Optional chaining for JSON" difficulty=medium
Write `get_path(data, path, default=None)` that follows a dotted `path` through nested dicts and lists, like `data?.user?.address?.city ?? default`.

- Each step looks up a key in a dict, or an index in a list (written in digits, like `"items.0.sku"`).
- If a step is missing, an index is out of range, or the current value is `None` or isn't a dict or list, return `default` instead of raising.
- A `None` at the end of the path also gives `default`. Any other value, including `0`, `""`, `False` and `[]`, is returned as is.

```text
order = {"customer": {"name": "Ada", "address": None}, "items": [{"sku": "A1", "qty": 0}]}
get_path(order, "customer.name")            ->  'Ada'
get_path(order, "customer.address.city")    ->  None
get_path(order, "items.0.qty")              ->  0
get_path(order, "items.5.sku", "n/a")       ->  'n/a'
```

```js
const getPath = (data, path, fallback = null) =>
  path.split(".").reduce((node, key) => node?.[key], data) ?? fallback;
```

```python starter
def get_path(data, path, default=None):
    ...
```

```python solution
def get_path(data, path, default=None):
    node = data
    for key in path.split("."):
        if isinstance(node, dict):
            node = node.get(key)
        elif isinstance(node, list) and key.isdecimal() and int(key) < len(node):
            node = node[int(key)]
        else:
            return default
        if node is None:
            return default
    return node
```

```python tests
ORDER = {
    "id": 7,
    "customer": {"name": "Ada", "address": None, "vip": False},
    "items": [{"sku": "A1", "qty": 0}, {"sku": "B2", "qty": 3}],
    "note": "",
}

@test("follows nested dict keys")
def _():
    eq(get_path(ORDER, "customer.name"), "Ada")
    eq(get_path(ORDER, "id"), 7)

@test("indexes into lists")
def _():
    eq(get_path(ORDER, "items.1.sku"), "B2")

@test("missing keys and bad indexes give the default")
def _():
    eq(get_path(ORDER, "customer.email"), None)
    eq(get_path(ORDER, "items.5.sku", "n/a"), "n/a")
    eq(get_path(ORDER, "items.first.sku", "n/a"), "n/a")

@test("an explicit None along the way gives the default")
def _():
    eq(get_path(ORDER, "customer.address.city", "unknown"), "unknown")
    eq(get_path(ORDER, "customer.address", "unknown"), "unknown")

@test("falsy values are returned, not replaced")
def _():
    eq(get_path(ORDER, "items.0.qty", 99), 0)
    eq(get_path(ORDER, "customer.vip", True), False)
    eq(get_path(ORDER, "note", "none"), "")

@test("stepping into a non-container gives the default")
def _():
    eq(get_path(ORDER, "customer.name.first", "?"), "?")
    eq(get_path(ORDER, "id.value", "?"), "?")
```

```hint
Walk the path with `for key in path.split("."):`, keeping the current value in a variable. Use `isinstance(node, dict)` and `isinstance(node, list)` to decide how to take the next step.
```

```hint
`node.get(key)` returns `None` for a missing key, so a single `if node is None: return default` after each step covers missing keys and explicit nulls alike. For lists, `key.isdecimal()` tells you whether the key is an index.
```
:::

:::challenge id=ordering-nulls-last title="Sort with nulls last" difficulty=medium
Write `sort_nulls_last(values, reverse=False)` that returns a **new** sorted list in which every `None` comes last, in both ascending and descending order. The other values are all mutually comparable (all numbers, or all strings).

```text
sort_nulls_last([3, None, 1, 0])                ->  [0, 1, 3, None]
sort_nulls_last([3, None, 1, 0], reverse=True)  ->  [3, 1, 0, None]
```

`sorted(values)` raises `TypeError` as soon as it compares a `None` with a number, and `sorted(values, reverse=True)` with a `(v is None, v)` key would put the `None`s first.

```js
// numbers only: strings would need localeCompare
const sortNullsLast = (values, reverse = false) =>
  values.toSorted((a, b) =>
    (a === null) - (b === null) || (reverse ? b - a : a - b));
```

```python starter
def sort_nulls_last(values, reverse=False):
    return sorted(values, reverse=reverse)
```

```python solution
def sort_nulls_last(values, reverse=False):
    present = sorted((v for v in values if v is not None), reverse=reverse)
    return present + [None] * (len(values) - len(present))
```

```python tests
@test("sorts ascending with None last")
def _():
    eq(sort_nulls_last([3, None, 1, None, 2]), [1, 2, 3, None, None])

@test("keeps None last when sorting descending")
def _():
    eq(sort_nulls_last([3, None, 1, 2], reverse=True), [3, 2, 1, None])

@test("keeps falsy values like 0")
def _():
    eq(sort_nulls_last([0, None, -1, 2]), [-1, 0, 2, None])
    eq(sort_nulls_last(["b", "", None, "a"]), ["", "a", "b", None])

@test("handles all-None and None-free lists")
def _():
    eq(sort_nulls_last([None, None]), [None, None])
    eq(sort_nulls_last([2, 1]), [1, 2])
    eq(sort_nulls_last([]), [])

@test("doesn't modify the input")
def _():
    values = [3, None, 1]
    sort_nulls_last(values)
    eq(values, [3, None, 1], "the original list changed")
```

```hint
Split the problem: sort the values that aren't `None`, then add the right number of `None`s at the end.
```

```hint
Filter with `v is not None`, not with plain truthiness: `if v` would drop `0` and `""` too.
```
:::
