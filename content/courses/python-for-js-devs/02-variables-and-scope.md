---
title: Variables, Types & Scope
part: Foundations
summary: No let or const, strong dynamic typing, one None, aliasing, and scopes that ignore blocks entirely.
minutes: 35
---

Python has no `let`, `const` or `var`. Assignment binds a **name** to an **object**, and that's the entire variable model: names have no types, objects do, and no operator will quietly convert one type into another. Scoping is simpler than in JavaScript and surprising in exactly one way: **blocks don't create scopes**. Functions do (along with modules, classes and comprehensions), while `if`, `for`, `while`, `with` and `try` don't.

## Names are labels, not boxes

:::compare
```js
let count = 1;
count = "one";              // let doesn't fix the type either
const user = { name: "Ada" };
user.name = "Grace";        // const freezes the binding, not the object
let draft;                  // declared, holds undefined
console.log(later);         // ReferenceError (temporal dead zone)
let later = 1;
```
```python
count = 1
count = "one"               # rebinding to another type is fine
user = {"name": "Ada"}
user["name"] = "Grace"      # mutating the object, as in JS
# no declarations: a name exists once something is assigned to it
print(later)                # NameError: name 'later' is not defined
later = 1
```
:::

An assignment like `count = 1` creates the name `count` in the current scope (or rebinds it) and points it at an int object. Think of a name as a sticky label on an object, not a box with a type stamped on it: you can peel it off and stick it on something of a different type at any time. There's no declaration step, no hoisting, and no `undefined` placeholder. Reading a name that hasn't been assigned raises `NameError`, Python's `ReferenceError`.

```python run raises
price = 42
print(type(price))
price = "forty-two"           # the name now refers to a str
print(type(price))

print(discount)               # never assigned: NameError
```

:::gotcha `total: int` doesn't create `total`
`let total;` declares a variable holding `undefined`. The Python that looks closest, `total: int`, is only a type annotation: it records a hint and creates no name, so reading `total` afterwards still raises `NameError`. If you need a placeholder, assign one: `total = 0`, or `total: int | None = None`.
:::

## Dynamic, but strongly typed

:::compare
```js
"1" + 1;            // "11"
"3" * "4";          // 12
"5" - 2;            // 3
null + 1;           // 1
[] + {};            // "[object Object]"
1 + true;           // 2
```
```python
"1" + 1             # TypeError
"3" * "4"           # TypeError
"5" - 2             # TypeError
None + 1            # TypeError
[] + {}             # TypeError
1 + True            # 2: bool really is an int subclass
```
:::

Python is **dynamically** typed (types are checked at runtime, and a name can refer to anything) but **strongly** typed: operators never coerce operands to make an expression work. The exceptions are deliberate and narrow. Numeric types mix (`1 + 2.5` is `3.5`, and `True` counts as `1`), and `*` repeats sequences (`"ab" * 3`, `[0] * 3`). Everything else fails fast with a `TypeError` that names both types, at the line where the mistake is, instead of producing `"[object Object]"` three functions later.

Conversions are explicit: you call the type you want.

| JavaScript | Python | Notes |
| --- | --- | --- |
| `String(x)`, `` `${x}` `` | `str(x)`, `f"{x}"` | |
| `Number(s)`, `parseInt(s)` | `int(s)`, `float(s)` | strict: `int("42px")` raises ([Numbers & Math](lesson:numbers-and-math)) |
| `Boolean(x)`, `!!x` | `bool(x)` | the falsy rules differ ([Truthiness & Equality](lesson:truthiness-and-equality)) |
| `Array.from(x)` | `list(x)` | any iterable |
| `JSON.stringify(x)` | `json.dumps(x)` | [Dicts](lesson:dicts) |

```python run raises
quantity = "3"                            # from a form, a query string, a CSV...
price = 4.5
print(int(quantity) * price)              # convert explicitly: 13.5
print("Quantity: " + quantity)            # str + str is fine
print(f"Total: {int(quantity) * price}")  # f-strings format any type
print("Total: " + int(quantity) * price)  # str + float: TypeError
```

:::quiz output
What does this print?

```python
print("ab" * 2 + str(1 + True))
```

- [x] `abab2`
- [ ] `ab21`
- [ ] `abab11`
- [ ] `TypeError`

`"ab" * 2` is repetition, giving `"abab"`. `1 + True` is integer addition, because `bool` subclasses `int`, so it's `2`, and `str()` makes the concatenation legal.
:::

## Built-in types, `type()` and `isinstance()`

| JavaScript | Python | Notes |
| --- | --- | --- |
| `number` | `int`, `float` | two types; `complex` too ([Numbers & Math](lesson:numbers-and-math)) |
| `bigint` | `int` | ints are unbounded |
| `string` | `str` | immutable ([Strings & f-strings](lesson:strings)) |
| `boolean` | `bool` | `True`, `False`; a subclass of `int` |
| `null`, `undefined` | `None` | its type is `NoneType` |
| `symbol` | (none) | `object()` sentinels or an `Enum` |
| `Array` | `list`, or `tuple` if immutable | [Lists](lesson:lists), [Tuples](lesson:tuples-and-unpacking) |
| `Object` as a record, `Map` | `dict` | [Dicts](lesson:dicts) |
| `Set` | `set`, `frozenset` | [Sets](lesson:sets) |
| `Uint8Array`, `ArrayBuffer` | `bytes`, `bytearray` | |
| `Function` | `function` and other callables | [Functions](lesson:functions) |
| `Date` | `datetime.datetime` | [Batteries Included](lesson:standard-library) |
| `Promise` | coroutine, `asyncio.Task` | [Async/Await](lesson:async) |

:::compare
```js
typeof x === "string";
typeof x === "number";
x instanceof Date;
Array.isArray(x);
typeof x === "function";
x === null;
```
```python
isinstance(x, str)
isinstance(x, (int, float))   # a tuple means "any of these"
isinstance(x, datetime)
isinstance(x, list)
callable(x)
x is None
```
:::

`typeof` answers with a string for a handful of categories, so JavaScript code mixes `typeof`, `instanceof` and `Array.isArray`. Python has one model: every value is an instance of a class. `isinstance(x, cls)` asks the question, follows inheritance like `instanceof`, and accepts a tuple of classes or, since 3.10, a union such as `int | float`. `type(x)` returns the exact class; compare it with `is` (`type(x) is int`) for the rare case where subclasses must not match. Most of the time, idiomatic Python doesn't check at all: it calls the method and lets duck typing do the work ([Classes & Objects](lesson:classes)).

```python run
from datetime import date

for value in [42, 4.2, "42", True, None, [4, 2], date(2024, 6, 1), len]:
    kind = type(value).__name__
    print(f"{kind:>26}  number={isinstance(value, (int, float))}  callable={callable(value)}")
```

:::quiz output
What does this print?

```python
print(type(True) is int, isinstance(True, int))
```

- [ ] `True True`
- [x] `False True`
- [ ] `False False`
- [ ] `True False`

`True`'s exact type is `bool`, so the `type()` check fails, but `bool` is a subclass of `int`, so `isinstance` accepts it. [Numbers & Math](lesson:numbers-and-math) explains when that matters.
:::

## `None` replaces `null` and `undefined`

:::compare
```js
let user = null;               // deliberately empty
let draft;                     // undefined
function log(msg) { console.log(msg); }   // returns undefined
const config = {};
config.timeout;                // undefined
config.timeout.ms;             // TypeError, one step too late
user?.name;                    // undefined, no error
```
```python
user = None                    # the one "nothing" value
# no undefined: names must be assigned before use
def log(msg): print(msg)       # returns None implicitly
config = {}
config["timeout"]              # KeyError: 'timeout'
config.get("timeout")          # None: you asked for a default
getattr(user, "name", None)    # None: ditto
```
:::

Python has a single null value, `None`, the only instance of `NoneType`. It covers both of JavaScript's "nothing" values because the second one has no job left to do. A name can't exist without a value. A function that ends without `return` returns `None`. And asking for something that isn't there raises immediately instead of producing `undefined`:

- a missing attribute raises `AttributeError`,
- a missing dict key raises `KeyError`, and an index past the end raises `IndexError`,
- a missing name raises `NameError`,
- a missing or unexpected argument raises `TypeError` ([Functions](lesson:functions)).

When absence is a normal outcome, say so and supply the default yourself: `d.get(key, default)` and `getattr(obj, name, default)`. The replacements for `?.` and `??` are covered in [Truthiness & Equality](lesson:truthiness-and-equality).

```python run raises
def find_user(user_id):
    if user_id == 1:
        return {"name": "Ada"}
    # falling off the end returns None

user = find_user(2)
print(user, user is None)
print(find_user(1).get("email"))           # None, by request
print(getattr(object(), "theme", "light"))  # default for a missing attribute
print(user["name"])                        # TypeError: None isn't subscriptable
```

:::pythonic Test for `None` with `is`
`None` is a singleton, so `x is None` and `x is not None` are the idiomatic checks: explicit, fast, and immune to classes that override `==`. Avoid `if not x:` when `0`, `""` or `[]` are legitimate values, because all of them are falsy too.
:::

## Multiple assignment, swapping and `del`

:::compare
```js
let width = 0, height = 0;
const [lat, lng] = [51.5, -0.12];
[low, high] = [high, low];       // swap by destructuring
counts.total += 1;
delete config.debug;             // remove a property
// there's no way to delete a variable
```
```python
width = height = 0               # chained: both names, ONE object
lat, lng = 51.5, -0.12           # tuple unpacking
low, high = high, low            # swap, no temp variable
counts["total"] += 1
del config["debug"]              # remove a key
del width                        # unbind the name itself
```
:::

`a = b = value` binds every target to the **same object**. That's harmless for immutable values like `0`, and a trap for mutable ones: `a = b = []` gives you two names for one list. Comma-separated targets unpack: `lat, lng = 51.5, -0.12` builds a tuple on the right and unpacks it on the left. The right-hand side is evaluated completely before anything is assigned, which is why swapping needs no temporary. Star targets, nesting and the strict length check are covered in [Tuples & Destructuring](lesson:tuples-and-unpacking).

`del name` removes the binding, so reading the name afterwards raises `NameError`. It doesn't free memory by itself: an object is reclaimed when nothing refers to it any more (CPython counts references and also collects cycles). `del` deletes list items, slices and dict keys too.

```python run raises
low, high = 10, 3
if low > high:
    low, high = high, low      # the right side is built first
print(low, high)

a = b = []                     # one list with two names
a.append("shared")
print(b)

temp = "scratch"
del temp
print(temp)                    # NameError
```

## Mutability and aliasing

:::compare
```js
const tags = ["new"];
const alias = tags;
alias.push("sale");
tags;                  // ["new", "sale"]: same array

let label = "new";
let other = label;
other += "!";
label;                 // "new": strings are immutable
```
```python
tags = ["new"]
alias = tags
alias.append("sale")
tags                   # ['new', 'sale']: same list

label = "new"
other = label
other += "!"
label                  # 'new': strings are immutable
```
:::

This part works exactly as in JavaScript: assignment never copies, so two names can share one mutable object. The difference is in the mental model. JS splits values into primitives and objects; in Python *every* value is an object and every name is a reference, ints and strings included. They only seem to have value semantics because they're **immutable**: anything that looks like modifying one actually builds a new object and rebinds the name.

| Immutable | Mutable |
| --- | --- |
| `int`, `float`, `complex`, `bool` | `list` |
| `str`, `bytes` | `dict` |
| `tuple`, `frozenset` | `set`, `bytearray` |
| `None` | instances of most classes |

Function arguments follow the same rule ("call by sharing", as in JS): the parameter is a new name for the caller's object. Mutating it is visible to the caller, but rebinding the parameter isn't. To get an independent copy, use the techniques in [Lists: copying](lesson:lists#copying-shallow-and-deep).

```python run
def add_item(cart, item):
    cart.append(item)          # mutates the caller's list
    cart = ["replaced"]        # rebinds the local name only

cart = ["mug"]
add_item(cart, "tea")
print(cart)                    # ['mug', 'tea']

alias = cart
cart += ["jam"]                # in place: the alias sees it
print(alias)
cart = cart + ["oat milk"]     # a new list: the alias doesn't
print(alias)
print(cart)
```

:::gotcha `+=` on a list mutates it
For immutable types, `x += y` builds a new object and rebinds `x`. For a list, `+=` is `extend`: it changes the existing list in place, so every alias sees it. `xs = xs + [item]` creates a new list and leaves aliases alone. The two spellings look interchangeable, and with shared lists they aren't.
:::

:::quiz output
What does this print?

```python
a = [1, 2]
b = a
a += [3]
a = a + [4]
print(b)
```

- [ ] `[1, 2]`
- [x] `[1, 2, 3]`
- [ ] `[1, 2, 3, 4]`
- [ ] `TypeError`

`a += [3]` extends the list that `a` and `b` share. `a = a + [4]` builds a brand-new list and points only `a` at it, so `b` stops at `[1, 2, 3]`.
:::

## No block scope

:::compare
```js
for (let i = 0; i < 3; i++) {}
console.log(i);          // ReferenceError: i is block-scoped

if (true) {
  const msg = "hi";
}
console.log(msg);        // ReferenceError

try { JSON.parse("{"); } catch (err) {}
console.log(err);        // ReferenceError
```
```python
for i in range(3):
    pass
print(i)                 # 2: the loop variable survives

if True:
    msg = "hi"
print(msg)               # 'hi': if doesn't create a scope

try:
    int("x")
except ValueError as err:
    pass
print(err)               # NameError: deleted when the block ended
```
:::

Only functions, modules, classes, comprehensions and lambdas create scopes. An `if`, `for`, `while`, `with` or `try` block doesn't, so a name assigned inside one is still there after it, in the enclosing function or module. In JS terms, every assignment behaves like `var`: scoped to the whole function, never to the block. A `for` loop's variable keeps its last value after the loop ends. If the loop never ran, the variable was never assigned, and reading it raises `NameError`.

There's one deliberate exception: the name bound by `except SomeError as err` is deleted at the end of the `except` block, because the exception holds a reference to the stack frame and keeping it alive would create a reference cycle. Assign it to another name if you need it afterwards. Comprehension variables don't leak either ([map, filter, reduce → Comprehensions](lesson:map-filter-reduce)).

```python run
orders = [120, 80, 310]
for index, amount in enumerate(orders):
    if amount > 100:
        big = amount
print(index, amount, big)          # all three survive the loop

for leftover in []:
    pass
print("leftover" in globals())     # False: an empty loop binds nothing

squares = [n * n for n in range(3)]
print("n" in globals())            # False: comprehensions have their own scope
```

:::gotcha Loops don't isolate their temporaries
Because blocks don't scope, a helper name inside a loop or `if` can overwrite an outer variable with the same name, and code after a loop can read a stale value from the last iteration. Keep functions short, and only use a loop variable after the loop when that's the point. The related closure trap, where callbacks created in a loop all see the final value, is in [Functions](lesson:functions).
:::

:::quiz output
What does this print?

```python
total = 0
for n in [3, 4, 5]:
    total += n
print(n, total)
```

- [x] `5 12`
- [ ] `NameError`
- [ ] `3 12`
- [ ] `None 12`

`n` isn't scoped to the loop. It's an ordinary variable that still holds the last value it was given, `5`.
:::

## LEGB: how names are looked up

:::compare
```js
const label = "global";
function outer() {
  const label = "enclosing";
  function inner() {
    return label;            // "enclosing"
  }
  return inner();
}
// globals are shared through globalThis
```
```python
label = "global"
def outer():
    label = "enclosing"
    def inner():
        return label         # 'enclosing'
    return inner()

# len, print and friends live in a scope of their own
```
:::

Python resolves a name by searching four scopes in order, known as **LEGB**: **L**ocal (the current function), **E**nclosing (outer functions, innermost first), **G**lobal (the module) and **B**uiltins (`len`, `print`, `list`, `ValueError` and the rest). It's lexical scoping, like JavaScript's. Two differences matter:

1. **"Global" means the module.** Every file has its own global namespace. There's no `globalThis` or `window` shared across files, so to use a name from another module you import it.
2. **Builtins are just the outermost scope**, not reserved words, so any assignment can shadow them.

```python run raises
import builtins

print(len is builtins.len)     # the builtins scope is a real module
sum = 0                        # shadows the builtin sum() in this module
for price in [3, 4]:
    sum += price
print(sum)
print(sum([1, 2]))             # TypeError: 'int' object is not callable
```

:::gotcha Don't name things after builtins
`list`, `dict`, `str`, `id`, `type`, `input`, `sum`, `max`, `min` and `filter` are ordinary names. `list = [1, 2]` works, and then every later `list(...)` in that scope fails with `TypeError: 'list' object is not callable`. Choose descriptive names (`items`, `user_id`, `total`); ruff's `A` rules catch the rest.
:::

## `global`, `nonlocal` and `UnboundLocalError`

:::compare
```js
let requests = 0;
function track() {
  requests += 1;             // just works
}

function makeCounter() {
  let count = 0;
  return () => ++count;      // closures can write outer variables
}
```
```python
requests = 0
def track():
    global requests          # required to rebind a module-level name
    requests += 1

def make_counter():
    count = 0
    def increment():
        nonlocal count       # required to rebind an enclosing name
        count += 1
        return count
    return increment
```
:::

Python decides at compile time which names are local to a function, and the rule is blunt: **if a function assigns to a name anywhere in its body, that name is local for the entire function**. Assignment includes `=`, `+=`, a `for` target, `import`, `def`, `class` and `with ... as`. So `requests += 1` inside a function refers to a *local* `requests`, which has no value yet, and the call raises `UnboundLocalError`. JavaScript's temporal dead zone is the nearest analogy, except that there's no `let` to spot: the assignment itself, wherever it sits in the function, makes the name local from the function's first line.

```python run raises
hits = 0

def record_hit():
    hits += 1      # assigning makes `hits` local to the whole function

record_hit()
```

`global name` and `nonlocal name` opt out of that rule, telling the compiler to rebind the module-level or enclosing-function variable instead. You only need them to **rebind** a name. Mutating an outer object (`cache[key] = value`, `seen.append(item)`) is a method call on an object you merely *read*, so it needs no declaration at all.

```python run
def make_counter():
    count = 0
    def increment():
        nonlocal count
        count += 1
        return count
    return increment

next_ticket = make_counter()
print(next_ticket(), next_ticket(), next_ticket())

seen = []
def remember(item):
    seen.append(item)          # mutation, not rebinding: no declaration
remember("a")
remember("b")
print(seen)
```

:::gotcha An assignment further down changes the lines above it
```python
theme = "dark"

def render():
    print(theme)       # UnboundLocalError, not 'dark'
    theme = "light"
```
The `print` looks like it reads the global, but the assignment on the next line makes `theme` local to all of `render`. Rename the local, or pass the value in as a parameter.
:::

:::pythonic Prefer returning values to `global`
Outside small scripts, `global` is a code smell, much like mutating module state in JS. Return the new value, keep state on an object ([Classes & Objects](lesson:classes)), or use a closure with `nonlocal` ([Functions](lesson:functions)).
:::

:::quiz output
What does this print?

```python
x = 1
def f():
    x = 2
    def g():
        nonlocal x
        x = 3
    g()
    return x
print(f(), x)
```

- [x] `3 1`
- [ ] `2 1`
- [ ] `3 3`
- [ ] `UnboundLocalError`

`nonlocal x` in `g` rebinds the `x` of the nearest enclosing *function*, `f`, so `f` returns `3`. The module-level `x` is a different variable, and nothing touched it.
:::

## Constants and freezing

:::compare
```js
const MAX_RETRIES = 3;
MAX_RETRIES = 4;                 // TypeError: assignment to constant
const config = Object.freeze({ debug: false });
config.debug = true;             // ignored, or TypeError in strict mode
const DEFAULTS = Object.freeze(["a", "b"]);
```
```python
MAX_RETRIES = 3                  # a convention: nothing stops rebinding
MAX_RETRIES: Final = 3           # type checkers flag any rebinding
CONFIG = MappingProxyType({"debug": False})
CONFIG["debug"] = True           # TypeError: a read-only view
DEFAULTS = ("a", "b")            # tuples can't change
```
:::

Python has no `const`. A module-level `UPPER_SNAKE_CASE` name means "don't rebind this", and the convention is strong enough that reviewers treat it as a rule. To have a tool enforce it, annotate the name with `typing.Final`: mypy and pyright reject any reassignment, while the interpreter ignores the annotation, the way TypeScript's `readonly` vanishes at runtime ([Type Hints](lesson:type-hints)).

To freeze *values* rather than names, pick an immutable type:

- a `tuple` instead of a list, and a `frozenset` instead of a set,
- `types.MappingProxyType(d)`, a read-only **view** of a dict. Writes through it raise `TypeError`, but it reflects later changes to the dict underneath, so wrap a copy nobody else holds,
- `@dataclass(frozen=True)` for records, and `enum.Enum` for sets of named constants ([Dataclasses, NamedTuples & Enums](lesson:dataclasses-and-enums)).

Like `Object.freeze`, all of these are **shallow**: a tuple's slots can't be reassigned, but a list stored in one can still change.

```python run raises
from types import MappingProxyType

settings = {"debug": False, "retries": 3}
SETTINGS = MappingProxyType(settings)   # a read-only view...
settings["debug"] = True                # ...of a dict that can still change
print(SETTINGS["debug"])                # True

LIMITS = (10, [20, 30])                 # shallow: the inner list is mutable
LIMITS[1].append(40)
print(LIMITS)
SETTINGS["retries"] = 5                 # TypeError
```

## Cheat sheet

| JavaScript | Python | Notes |
| --- | --- | --- |
| `let x = 1`, `const x = 1` | `x = 1` | no declarations |
| `let x;` | `x = None` | `x: int` alone creates nothing |
| `ReferenceError` | `NameError` | no hoisting |
| `"1" + 1` | `"1" + str(1)` | no implicit coercion |
| `typeof x === "string"` | `isinstance(x, str)` | |
| `x instanceof C` | `isinstance(x, C)` | accepts a tuple of classes |
| `Array.isArray(x)` | `isinstance(x, list)` | |
| `null`, `undefined` | `None` | test with `is None` |
| `obj.missing` → `undefined` | `AttributeError` | `getattr(obj, "k", default)` |
| `obj.k ?? d` (for a record) | `d.get("k", default)` | |
| `[a, b] = [b, a]` | `a, b = b, a` | |
| `delete obj.k` | `del d["k"]` | `del x` unbinds a name |
| block scope (`let`, `const`) | function scope only | loop variables survive the loop |
| writing an outer `let` | `nonlocal x` / `global x` | only needed to rebind |
| `const MAX = 3` | `MAX = 3` | convention, or `typing.Final` |
| `Object.freeze(obj)` | `MappingProxyType(dict(obj))` | read-only view, shallow |
| `Object.freeze([...])` | `tuple(...)` | shallow |

## Challenges

:::challenge id=vars-fix-counter title="Fix the counter" difficulty=easy
`make_counter()` should return a function that returns `1`, `2`, `3`, ... on successive calls, and every counter it creates should count independently. As written, the first call raises `UnboundLocalError`. Fix it without using a global.

```js
function makeCounter() {
  let count = 0;
  return () => ++count;
}
```

```python starter
def make_counter():
    count = 0

    def increment():
        count += 1
        return count

    return increment
```

```python solution
def make_counter():
    count = 0

    def increment():
        nonlocal count
        count += 1
        return count

    return increment
```

```python tests
@test("counts up from 1")
def _():
    tick = make_counter()
    eq([tick(), tick(), tick()], [1, 2, 3])

@test("each counter is independent")
def _():
    first, second = make_counter(), make_counter()
    first()
    first()
    eq(second(), 1, "a new counter should start from 1")
    eq(first(), 3)

@test("rebinds the enclosing variable with nonlocal")
def _():
    requires_syntax(ast.Nonlocal, "declare `nonlocal count` inside increment()")
```

```hint
`count += 1` assigns to `count`, so Python treats `count` as local to `increment` for the whole function, and it has no value yet.
```

```hint
Add `nonlocal count` as the first line of `increment` to rebind the variable that belongs to `make_counter`.
```
:::

:::challenge id=vars-strict-int title="A strict to_int" difficulty=medium
Query parameters and form fields arrive as strings, JSON numbers arrive as ints, and sloppy coercion lets garbage through. Write `to_int(value)`:

- an `int` is returned unchanged,
- a `str` is parsed with `int()`, so surrounding whitespace is fine and bad text raises `ValueError` (just let `int()` raise it),
- anything else raises `TypeError`: floats, `None`, lists, and **booleans**, even though `bool` is a subclass of `int`.

```text
to_int(42)        ->  42
to_int(" -7\n")   ->  -7
to_int("4.5")     ->  ValueError
to_int(4.0)       ->  TypeError
to_int(True)      ->  TypeError
```

```js
function toInt(value) {
  if (typeof value === "number" && Number.isInteger(value)) return value;
  if (typeof value === "string" && /^\s*[-+]?\d+\s*$/.test(value)) {
    return Number(value);
  }
  throw new TypeError(`expected an integer, got ${typeof value}`);
}
```

```python starter
def to_int(value):
    ...
```

```python solution
def to_int(value):
    if isinstance(value, bool):
        raise TypeError("booleans aren't accepted as integers")
    if isinstance(value, int):
        return value
    if isinstance(value, str):
        return int(value)
    raise TypeError(f"expected int or str, got {type(value).__name__}")
```

```python tests
@test("ints pass through unchanged")
def _():
    eq(to_int(42), 42)
    eq(to_int(-7), -7)
    eq(to_int(0), 0)

@test("numeric strings are parsed")
def _():
    eq(to_int("42"), 42)
    eq(to_int(" -7\n"), -7)
    check(type(to_int("5")) is int, "return an int, not the original string")

@test("strings that aren't integers raise ValueError")
def _():
    raises(ValueError, to_int, "4.5")
    raises(ValueError, to_int, "12px")
    raises(ValueError, to_int, "")

@test("booleans are rejected, even though bool subclasses int")
def _():
    raises(TypeError, to_int, True)
    raises(TypeError, to_int, False)

@test("other types raise TypeError")
def _():
    raises(TypeError, to_int, 4.0)
    raises(TypeError, to_int, None)
    raises(TypeError, to_int, [1])
```

```hint
`isinstance(value, int)` is `True` for `True` and `False`, so check for `bool` *before* you check for `int`.
```

```hint
For strings, `int(value)` already strips whitespace and raises `ValueError` on bad input. You don't need a regex.
```
:::

:::challenge id=vars-deep-freeze title="Deep freeze" difficulty=hard
`Object.freeze` is shallow, so JS developers write a recursive `deepFreeze` for config objects. Write the Python version: `deep_freeze(value)` returns a **read-only deep copy** of JSON-like data.

- A `dict` becomes a `types.MappingProxyType` over a **new** dict of frozen values.
- A `list` or `tuple` becomes a `tuple` of frozen values.
- A `set` becomes a `frozenset`.
- Anything else (`str`, `int`, `float`, `bool`, `None`) is returned as it is.

The copy must be cut off from the original: changing the input afterwards must not show through. And unlike the JS version, the input itself must not be modified.

```js
function deepFreeze(value) {
  if (value !== null && typeof value === "object") {
    Object.values(value).forEach(deepFreeze);
    Object.freeze(value);          // freezes the original in place
  }
  return value;
}
```

```python starter
from types import MappingProxyType


def deep_freeze(value):
    ...
```

```python solution
from types import MappingProxyType


def deep_freeze(value):
    if isinstance(value, dict):
        return MappingProxyType({key: deep_freeze(item) for key, item in value.items()})
    if isinstance(value, (list, tuple)):
        return tuple(deep_freeze(item) for item in value)
    if isinstance(value, (set, frozenset)):
        return frozenset(deep_freeze(item) for item in value)
    return value
```

```python tests
CONFIG = {"debug": False, "servers": [{"host": "a", "ports": [80, 443]}], "tags": {"x"}}

def fresh_config():
    return {"debug": False, "servers": [{"host": "a", "ports": [80, 443]}], "tags": {"x"}}

@test("scalars come back unchanged")
def _():
    eq(deep_freeze(5), 5)
    eq(deep_freeze("prod"), "prod")
    check(deep_freeze(None) is None, "None should stay None")

@test("lists become tuples, sets become frozensets")
def _():
    eq(deep_freeze([1, [2, 3]]), (1, (2, 3)))
    eq(deep_freeze({1, 2}), frozenset({1, 2}))
    check(type(deep_freeze([1])) is tuple, "lists should become tuples")

@test("dicts become read-only")
def _():
    frozen = deep_freeze({"debug": False})
    eq(frozen["debug"], False)
    with raises(TypeError):
        frozen["debug"] = True

@test("nested values are frozen all the way down")
def _():
    frozen = deep_freeze(fresh_config())
    eq(frozen["servers"][0]["ports"], (80, 443))
    eq(frozen["tags"], frozenset({"x"}))
    with raises(TypeError):
        frozen["servers"][0]["host"] = "b"

@test("later changes to the original don't leak in")
def _():
    config = fresh_config()
    frozen = deep_freeze(config)
    config["debug"] = True
    config["servers"][0]["ports"].append(8080)
    eq(frozen["debug"], False)
    eq(frozen["servers"][0]["ports"], (80, 443))

@test("the original is left untouched")
def _():
    config = fresh_config()
    deep_freeze(config)
    eq(config, CONFIG)
    check(type(config["servers"]) is list, "don't convert the input in place")
```

```hint
Recurse: freeze each item first, then wrap the results in the immutable container that matches the input's type.
```

```hint
`MappingProxyType(config)` would be a *live* view of the caller's dict. Build a new dict for it to wrap, e.g. with a dict comprehension: `{key: deep_freeze(item) for key, item in value.items()}`.
```

```hint
Check `dict` first, then `(list, tuple)`, then `(set, frozenset)`, and return everything else as it is.
```
:::
