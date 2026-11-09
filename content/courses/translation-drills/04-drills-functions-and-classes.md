---
title: "Drills: Functions & Classes"
part: Functions & Objects
summary: Ten reps on closures, options objects, memoizers, getters, factories, subclasses, iterators and enums.
minutes: 50
---

Ten JavaScript snippets built from functions and classes, each one to rewrite as the Python a reviewer would approve. Most of them translate line by line until you reach a spot where the languages part ways: defaults that are evaluated once, closures that need `nonlocal` before they can assign, `this` turning into an explicit `self` or `cls`, and protocols (`__iter__`, `__str__`, `__len__`) where JavaScript uses `Symbol` keys and conventional method names. The tests pin those edges down, so read the failure messages: they usually name the trap.

## The mappings

| JavaScript | Python |
| --- | --- |
| `function f(a, { b = 1, ...extra } = {})` | `def f(a, *, b=1, **extra)` |
| a default like `= []` or `= nextId++` | `=None`, filled in inside the body |
| reassigning a captured `let` | `nonlocal name`, then assign |
| a memo `Map` with string keys | `@functools.cache` |
| `get fullName()` / `set fullName(v)` | `@property` / `@full_name.setter` |
| `static fromHex(s) { return new this(...) }` | `@classmethod` with `return cls(...)` |
| `class B extends A`, `super(x)` | `class B(A):`, `super().__init__(x)` |
| `toString()` / `toJSON()` | `__str__` / `asdict()` with `json.dumps(default=...)` |
| `*[Symbol.iterator]() { yield* child }` | `def __iter__(self): yield from child` |
| `Object.freeze({ PAID: "paid" })` | `class Status(Enum): PAID = "paid"` |
| `fn.length` | `inspect.signature(fn).parameters` |

## Challenges

:::challenge id=drill-fn-once title="once()" difficulty=easy
Write `once(fn)`, which returns a wrapper that calls `fn` on its first call only, passing along whatever positional and keyword arguments it receives. Every later call returns that first result without calling `fn` again.

- The first result counts even when it's `None`, `0` or `""`, so don't use the result itself as the "already called" flag.
- The wrapper keeps `fn`'s `__name__` and `__doc__`, so `once` also works as a well-behaved decorator.

Refresher: [Closures and `nonlocal`](lesson:functions#closures-and-nonlocal) and [Writing a well-behaved decorator](lesson:decorators#writing-a-well-behaved-decorator).

```js
function once(fn) {
  let called = false;
  let result;
  return function (...args) {
    if (!called) {
      called = true;
      result = fn.apply(this, args);
    }
    return result;
  };
}
```

```python starter
def once(fn):
    ...
```

```python solution
from functools import wraps

def once(fn):
    called = False
    result = None

    @wraps(fn)
    def wrapper(*args, **kwargs):
        nonlocal called, result
        if not called:
            result = fn(*args, **kwargs)
            called = True
        return result

    return wrapper
```

```python tests
def spy(value):
    """A function that records every call and returns `value`."""
    def setup(*args, **kwargs):
        setup.calls.append((args, kwargs))
        return value
    setup.calls = []
    return setup

@test("the first call runs fn and returns its result")
def _():
    setup = spy(42)
    eq(once(setup)(), 42)
    eq(len(setup.calls), 1)

@test("later calls return the first result without running fn")
def _():
    setup = spy("ready")
    init = once(setup)
    eq([init(), init(), init()], ["ready", "ready", "ready"])
    eq(len(setup.calls), 1, "fn ran more than once")

@test("passes positional and keyword arguments through")
def _():
    setup = spy("ok")
    once(setup)("db", 5432, retries=3)
    eq(setup.calls, [(("db", 5432), {"retries": 3})])

@test("a None or falsy first result still counts as done")
def _():
    for value in (None, 0, "", False):
        setup = spy(value)
        init = once(setup)
        init()
        init()
        eq(len(setup.calls), 1, f"fn ran again after returning {value!r}")

@test("each wrapper has its own state")
def _():
    first, second = once(spy("a")), once(spy("b"))
    eq((first(), second(), first()), ("a", "b", "a"))

@test("works as a decorator and keeps the name and docstring")
def _():
    @once
    def connect():
        """Open the database connection."""
        return "connection"

    eq(connect(), "connection")
    eq(connect.__name__, "connect")
    eq(connect.__doc__, "Open the database connection.")
```

```hint
Keep `called` and `result` as local variables of `once`. The wrapper can read them freely, but assigning to them needs `nonlocal called, result`; otherwise Python treats them as new locals of the wrapper and raises `UnboundLocalError`.
```

```hint
Accept `*args, **kwargs` and forward them with `fn(*args, **kwargs)`. Decorate the wrapper with `@functools.wraps(fn)` to copy the name and docstring.
```
:::

:::challenge id=drill-fn-grid-paths title="Memoize with @cache" difficulty=easy
Write `count_paths(rows, cols)`: the number of paths from the top-left to the bottom-right cell of a `rows` × `cols` grid, moving only right or down. Both sizes are at least 1.

The JavaScript memoizes by hand, with a `Map` and string keys. In Python, decorate the function with `functools.cache`: the arguments become the cache key, and `cache_info()` and `cache_clear()` come for free.

The big-grid test also checks something the JavaScript can't do: past `Number.MAX_SAFE_INTEGER` it quietly returns a rounded float, while Python's integers stay exact.

Refresher: [`functools.cache` and `lru_cache`](lesson:decorators#functools-cache-and-lru-cache) and [Numbers & Math](lesson:numbers-and-math).

```js
const memo = new Map();

function countPaths(rows, cols) {
  if (rows === 1 || cols === 1) return 1;
  const key = `${rows},${cols}`;
  if (!memo.has(key)) {
    memo.set(key, countPaths(rows - 1, cols) + countPaths(rows, cols - 1));
  }
  return memo.get(key);
}
```

```python starter
def count_paths(rows, cols):
    ...
```

```python solution
from functools import cache

@cache
def count_paths(rows, cols):
    if rows == 1 or cols == 1:
        return 1
    return count_paths(rows - 1, cols) + count_paths(rows, cols - 1)
```

```python tests
import math

@test("a single row or column has exactly one path")
def _():
    eq(count_paths(1, 1), 1)
    eq(count_paths(1, 9), 1)
    eq(count_paths(9, 1), 1)

@test("small grids")
def _():
    eq(count_paths(2, 2), 2)
    eq(count_paths(3, 3), 6)
    eq(count_paths(3, 7), 28)

@test("transposing the grid doesn't change the count")
def _():
    eq(count_paths(4, 9), count_paths(9, 4))

@test("a 40 x 40 grid is fast and exact (a JavaScript number can't hold the answer)")
def _():
    eq(count_paths(40, 40), math.comb(78, 39))

@test("memoized with functools.cache")
def _():
    check(hasattr(count_paths, "cache_info"), "decorate count_paths with @functools.cache instead of keeping your own dict")
```

```hint
`@cache` goes on the line above `def`. Call `count_paths` recursively as usual: the name refers to the cached wrapper, so the recursive calls are memoized too.
```

```hint
The base case is `if rows == 1 or cols == 1: return 1`. Without the cache, the 40 x 40 grid takes far too many calls to finish.
```
:::

:::challenge id=drill-cls-full-name title="Getter and setter" difficulty=easy
Translate `Person` into a Python class with a `full_name` **property**:

- `Person(first, last)` stores `first` and `last`.
- Reading `person.full_name` gives `"first last"`. It's computed on every read, so it follows changes to `first` and `last`.
- Assigning `person.full_name = "..."` splits the text at the **first** space: `"Ada King Lovelace"` becomes first `"Ada"` and last `"King Lovelace"`. The JavaScript destructuring silently drops `"Lovelace"`.
- Assigning a name without a space raises `ValueError` and leaves the person unchanged. JavaScript would set `last` to `undefined`.

Refresher: [Properties instead of get and set](lesson:classes#properties-instead-of-get-and-set).

```js
class Person {
  constructor(first, last) {
    this.first = first;
    this.last = last;
  }
  get fullName() {
    return `${this.first} ${this.last}`;
  }
  set fullName(value) {
    [this.first, this.last] = value.split(" ");
  }
}
```

```python starter
class Person:
    def __init__(self, first, last):
        self.first = first
        self.last = last
```

```python solution
class Person:
    def __init__(self, first, last):
        self.first = first
        self.last = last

    @property
    def full_name(self):
        return f"{self.first} {self.last}"

    @full_name.setter
    def full_name(self, value):
        self.first, self.last = value.split(" ", 1)
```

```python tests
@test("full_name joins first and last")
def _():
    eq(Person("Ada", "Lovelace").full_name, "Ada Lovelace")

@test("full_name follows changes to first and last")
def _():
    person = Person("Ada", "Lovelace")
    person.first = "Augusta"
    eq(person.full_name, "Augusta Lovelace")

@test("assigning full_name updates first and last")
def _():
    person = Person("Ada", "Lovelace")
    person.full_name = "Grace Hopper"
    eq((person.first, person.last), ("Grace", "Hopper"))

@test("splits at the first space only")
def _():
    person = Person("Ada", "Lovelace")
    person.full_name = "Ada King Lovelace"
    eq((person.first, person.last), ("Ada", "King Lovelace"))

@test("a name without a space raises ValueError and changes nothing")
def _():
    person = Person("Ada", "Lovelace")
    raises(ValueError, setattr, person, "full_name", "Plato")
    eq((person.first, person.last), ("Ada", "Lovelace"))

@test("full_name is a property, not a stored attribute")
def _():
    check(isinstance(vars(Person).get("full_name"), property), "define full_name with @property and @full_name.setter")
    check("full_name" not in vars(Person("Ada", "Lovelace")), "don't store full_name on the instance")
```

```hint
Put `@property` above `def full_name(self)`, then `@full_name.setter` above a second `def full_name(self, value)`. Both methods have the same name.
```

```hint
`value.split(" ", 1)` splits at most once. Unpacking the result into `self.first, self.last` raises `ValueError` on its own when there's only one part, before either attribute changes.
```
:::

:::challenge id=drill-cls-order-status title="Frozen object to Enum" difficulty=easy
Replace the frozen object with an enum:

- `Status` is an `enum.Enum` with the members `PENDING`, `PAID`, `SHIPPED` and `DELIVERED`, in that order. Each value is the lowercase name (`"pending"`, ...).
- `parse_status(text)` turns text from the outside world into a member, ignoring case and surrounding whitespace. Unknown text raises `ValueError`.
- `advance(status)` takes a member and returns the next one in definition order. Advancing `DELIVERED` raises `ValueError`.

Calling the enum with a value, `Status("paid")`, looks the member up. Iterating over `Status` yields the members in definition order, and since members are singletons, you compare them with `is`.

Refresher: [Enums](lesson:dataclasses-and-enums#enums).

```js
const Status = Object.freeze({
  PENDING: "pending",
  PAID: "paid",
  SHIPPED: "shipped",
  DELIVERED: "delivered",
});
const FLOW = Object.values(Status);

function parseStatus(text) {
  const value = text.trim().toLowerCase();
  if (!FLOW.includes(value)) throw new Error(`unknown status: ${text}`);
  return value;
}

function advance(status) {
  const i = FLOW.indexOf(status);
  if (i === FLOW.length - 1) throw new Error("already delivered");
  return FLOW[i + 1];
}
```

```python starter
from enum import Enum

class Status:
    PENDING = "pending"
    PAID = "paid"
    SHIPPED = "shipped"
    DELIVERED = "delivered"

def parse_status(text):
    ...

def advance(status):
    ...
```

```python solution
from enum import Enum

class Status(Enum):
    PENDING = "pending"
    PAID = "paid"
    SHIPPED = "shipped"
    DELIVERED = "delivered"

def parse_status(text):
    return Status(text.strip().lower())

def advance(status):
    members = list(Status)
    position = members.index(status)
    if position == len(members) - 1:
        raise ValueError(f"{status.name} is the last status")
    return members[position + 1]
```

```python tests
from enum import Enum

@test("Status is an Enum with four members, in order")
def _():
    check(isinstance(Status, type) and issubclass(Status, Enum), "make Status a subclass of enum.Enum")
    eq([member.name for member in Status], ["PENDING", "PAID", "SHIPPED", "DELIVERED"])

@test("each member's value is its lowercase name")
def _():
    eq([member.value for member in Status], ["pending", "paid", "shipped", "delivered"])

@test("parse_status looks members up by value")
def _():
    check(parse_status("paid") is Status.PAID, "parse_status('paid') should return Status.PAID")
    check(parse_status("  Shipped\n") is Status.SHIPPED, "ignore case and surrounding whitespace")

@test("parse_status rejects unknown text with ValueError")
def _():
    raises(ValueError, parse_status, "lost")

@test("advance moves to the next status")
def _():
    check(advance(Status.PENDING) is Status.PAID, "PENDING should advance to PAID")
    check(advance(Status.SHIPPED) is Status.DELIVERED, "SHIPPED should advance to DELIVERED")

@test("advancing a delivered order raises ValueError")
def _():
    raises(ValueError, advance, Status.DELIVERED)

@test("members are read-only, like Object.freeze")
def _():
    raises(AttributeError, setattr, Status, "PAID", "refunded")
```

```hint
Write `class Status(Enum):` with one `NAME = "value"` line per member. `Status("paid")` returns `Status.PAID`, and raises `ValueError` for a value that isn't a member.
```

```hint
`list(Status)` gives the members in definition order, so `advance` can find the current position with `.index()` and return the member after it.
```
:::

:::challenge id=drill-fn-user-factory title="Options object with defaults" difficulty=medium
Write `make_user_factory(first_id=1)`. It returns a function `create_user(name, *, roles, user_id, **extra)` that builds a user record as a dict, `{"id": ..., "name": ..., "roles": [...], **extra}`. Both `roles` and `user_id` are optional.

JavaScript evaluates a default each time a call leaves the argument out, so every user gets a fresh `roles` array, and `nextId++` only runs when no `id` is passed. Python evaluates a default **once**, when the `def` statement runs. Default to `None` and fill the value in inside the function:

- Users never share a `roles` list. A list the caller passes in is used as is, even an empty one.
- Ids count up from `first_id`, one per user, and each factory has its own counter. An explicit `user_id` (which may be `0`) is used instead and doesn't use up an id.
- `roles` and `user_id` are keyword-only. Any other keyword arguments are merged into the record, like `...extra`.

Refresher: [Defaults are evaluated once](lesson:functions#defaults-are-evaluated-once), [Keyword arguments replace options objects](lesson:functions#keyword-arguments-replace-options-objects) and [Closures and `nonlocal`](lesson:functions#closures-and-nonlocal).

```js
function makeUserFactory(firstId = 1) {
  let nextId = firstId;
  return (name, { roles = [], id = nextId++, ...extra } = {}) => ({
    id,
    name,
    roles,
    ...extra,
  });
}
```

```python starter
def make_user_factory(first_id=1):
    ...
```

```python solution
def make_user_factory(first_id=1):
    next_id = first_id

    def create_user(name, *, roles=None, user_id=None, **extra):
        nonlocal next_id
        if user_id is None:
            user_id = next_id
            next_id += 1
        if roles is None:
            roles = []
        return {"id": user_id, "name": name, "roles": roles, **extra}

    return create_user
```

```python tests
@test("builds a record with the defaults filled in")
def _():
    create_user = make_user_factory()
    eq(create_user("ada"), {"id": 1, "name": "ada", "roles": []})

@test("ids count up from first_id")
def _():
    create_user = make_user_factory(100)
    eq([create_user(name)["id"] for name in ("ada", "grace", "linus")], [100, 101, 102])

@test("an explicit user_id, even 0, doesn't use up an id")
def _():
    create_user = make_user_factory()
    create_user("ada")
    eq(create_user("root", user_id=0)["id"], 0)
    eq(create_user("grace")["id"], 2)

@test("users never share a roles list")
def _():
    create_user = make_user_factory()
    ada, grace = create_user("ada"), create_user("grace")
    ada["roles"].append("admin")
    eq(grace["roles"], [], "grace got ada's role: the default list is shared")
    eq(create_user("linus")["roles"], [])

@test("a roles list you pass in is used as is, even an empty one")
def _():
    create_user = make_user_factory()
    mine = []
    check(create_user("ada", roles=mine)["roles"] is mine, "use the caller's list: `roles or []` swaps an empty list for a new one")
    eq(create_user("grace", roles=["admin"])["roles"], ["admin"])

@test("extra keyword arguments are merged into the record")
def _():
    user = make_user_factory()("ada", team="core", active=False)
    eq(user, {"id": 1, "name": "ada", "roles": [], "team": "core", "active": False})

@test("each factory has its own counter")
def _():
    first, second = make_user_factory(), make_user_factory()
    first("ada")
    first("grace")
    eq(second("linus")["id"], 1)

@test("roles and user_id are keyword-only")
def _():
    raises(TypeError, make_user_factory(), "ada", ["admin"])
```

```hint
Inside `create_user`, `if user_id is None:` is the moment JavaScript would evaluate `nextId++`: read the counter, then add one to it. The counter lives in `make_user_factory`, so the inner function needs `nonlocal`.
```

```hint
A bare `*` in the parameter list makes everything after it keyword-only: `def create_user(name, *, roles=None, user_id=None, **extra)`. Then `{"id": user_id, "name": name, "roles": roles, **extra}` builds the record.
```
:::

:::challenge id=drill-cls-color-hex title="Static factory to classmethod" difficulty=medium
Translate `Color`:

- `Color(r, g, b)` holds three channels from 0 to 255. Make it a dataclass, so two colors with the same channels compare equal (two JavaScript objects never do).
- `Color.from_hex(text)` is an alternative constructor for `"#rrggbb"` strings. The `#` is optional and case doesn't matter. Anything else raises `ValueError`.
- `color.to_hex()` returns lowercase `"#rrggbb"`, with each channel padded to two digits.
- `from_hex` builds whichever class it's called on, the way `new this(...)` does in the JavaScript, so a subclass gets instances of itself.

Two Python traps wait in the parsing. `int(text, 16)` accepts things the regex wouldn't, like `"+f"` and `" f"`. And `$` in Python's `re` also matches just **before a trailing newline**. `re.fullmatch` avoids both.

Refresher: [Class methods and static methods](lesson:classes#class-methods-and-static-methods) and [`search`, `match` and `fullmatch`](lesson:strings#search-match-and-fullmatch).

```js
class Color {
  constructor(r, g, b) {
    this.r = r;
    this.g = g;
    this.b = b;
  }
  static fromHex(text) {
    const match = /^#?([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(text);
    if (!match) throw new Error(`invalid hex color: ${text}`);
    return new this(...match.slice(1).map((pair) => parseInt(pair, 16)));
  }
  toHex() {
    return "#" + [this.r, this.g, this.b].map((n) => n.toString(16).padStart(2, "0")).join("");
  }
}
```

```python starter
class Color:
    def __init__(self, r, g, b):
        self.r = r
        self.g = g
        self.b = b
```

```python solution
import re
from dataclasses import dataclass

HEX_COLOR = re.compile(r"#?([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})", re.IGNORECASE)

@dataclass
class Color:
    r: int
    g: int
    b: int

    @classmethod
    def from_hex(cls, text):
        match = HEX_COLOR.fullmatch(text)
        if match is None:
            raise ValueError(f"invalid hex color: {text!r}")
        return cls(*(int(pair, 16) for pair in match.groups()))

    def to_hex(self):
        return f"#{self.r:02x}{self.g:02x}{self.b:02x}"
```

```python tests
def rejects(text):
    try:
        Color.from_hex(text)
    except ValueError:
        return True
    return False

@test("from_hex parses #rrggbb")
def _():
    eq(Color.from_hex("#ff8000"), Color(255, 128, 0))

@test("the # is optional and case doesn't matter")
def _():
    eq(Color.from_hex("FF8000"), Color(255, 128, 0))
    eq(Color.from_hex("#0A0b0C"), Color(10, 11, 12))

@test("malformed strings raise ValueError")
def _():
    for text in ["", "#", "#fff", "#ff80001", "#gg0000", "ff 800"]:
        check(rejects(text), f"from_hex({text!r}) should raise ValueError")

@test("rejects what int(..., 16) or a $ anchor would let through")
def _():
    for text in ["#+1+2+3", "# f f f", "#ff8000\n"]:
        check(rejects(text), f"from_hex({text!r}) should raise ValueError")

@test("to_hex gives lowercase #rrggbb with two digits per channel")
def _():
    eq(Color(255, 128, 0).to_hex(), "#ff8000")
    eq(Color(0, 10, 255).to_hex(), "#000aff")

@test("from_hex and to_hex round-trip")
def _():
    eq(Color.from_hex("#1E90FF").to_hex(), "#1e90ff")

@test("from_hex builds the class it's called on")
def _():
    class Swatch(Color):
        pass

    swatch = Swatch.from_hex("#123456")
    check(type(swatch) is Swatch, f"Swatch.from_hex() returned a {type(swatch).__name__}: build it with cls(...)")

@test("from_hex is a classmethod")
def _():
    check(isinstance(vars(Color).get("from_hex"), classmethod), "decorate from_hex with @classmethod")
```

```hint
`@classmethod` passes the class itself as the first argument, conventionally named `cls`. `return cls(r, g, b)` then builds a `Swatch` when called as `Swatch.from_hex(...)` and a `Color` otherwise.
```

```hint
`re.fullmatch(r"#?([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})", text, re.IGNORECASE)` returns `None` unless the whole string matches, and `match.groups()` gives the three pairs for `int(pair, 16)`.
```

```hint
The format spec `02x` writes an int as two lowercase hex digits: `f"{10:02x}"` is `"0a"`.
```
:::

:::challenge id=drill-cls-shapes title="extends and super()" difficulty=medium
Translate the shape hierarchy:

- `Shape(name)` stores `name` and is **abstract**: `Shape("blob")` raises `TypeError`, and so does creating an instance of a subclass that doesn't implement `area()`. JavaScript needs a `new.target` check for the first, and only notices the second when `area()` is finally called.
- `describe()` returns `"<name> with area <area>"`, with the area to two decimal places.
- `Rectangle(width, height)` and `Circle(radius)` pass their name up with `super().__init__(...)`. `Square(side)` is a `Rectangle` named `"square"`.
- `Circle.describe()` appends `" (r=<radius>)"` to the inherited text, which it gets from `super().describe()`.

Refresher: [Inheritance and `super()`](lesson:classes#inheritance-and-super) and [Abstract base classes and duck typing](lesson:classes#abstract-base-classes-and-duck-typing).

```js
class Shape {
  constructor(name) {
    if (new.target === Shape) throw new TypeError("Shape is abstract");
    this.name = name;
  }
  area() {
    throw new Error("not implemented");
  }
  describe() {
    return `${this.name} with area ${this.area().toFixed(2)}`;
  }
}

class Rectangle extends Shape {
  constructor(width, height) {
    super("rectangle");
    this.width = width;
    this.height = height;
  }
  area() {
    return this.width * this.height;
  }
}

class Square extends Rectangle {
  constructor(side) {
    super(side, side);
    this.name = "square";
  }
}

class Circle extends Shape {
  constructor(radius) {
    super("circle");
    this.radius = radius;
  }
  area() {
    return Math.PI * this.radius ** 2;
  }
  describe() {
    return `${super.describe()} (r=${this.radius})`;
  }
}
```

```python starter
import math

class Shape:
    ...

class Rectangle(Shape):
    ...

class Square(Rectangle):
    ...

class Circle(Shape):
    ...
```

```python solution
import math
from abc import ABC, abstractmethod

class Shape(ABC):
    def __init__(self, name):
        self.name = name

    @abstractmethod
    def area(self):
        ...

    def describe(self):
        return f"{self.name} with area {self.area():.2f}"

class Rectangle(Shape):
    def __init__(self, width, height):
        super().__init__("rectangle")
        self.width = width
        self.height = height

    def area(self):
        return self.width * self.height

class Square(Rectangle):
    def __init__(self, side):
        super().__init__(side, side)
        self.name = "square"

class Circle(Shape):
    def __init__(self, radius):
        super().__init__("circle")
        self.radius = radius

    def area(self):
        return math.pi * self.radius**2

    def describe(self):
        return f"{super().describe()} (r={self.radius})"
```

```python tests
@test("rectangles describe themselves")
def _():
    eq(Rectangle(3, 4).describe(), "rectangle with area 12.00")

@test("a square is a rectangle named square")
def _():
    square = Square(2)
    check(isinstance(square, Rectangle), "Square should extend Rectangle")
    eq((square.width, square.height), (2, 2))
    eq(square.describe(), "square with area 4.00")

@test("circles extend the inherited description")
def _():
    eq(Circle(1).describe(), "circle with area 3.14 (r=1)")
    eq(Circle(2.5).describe(), "circle with area 19.63 (r=2.5)")

@test("every shape is a Shape and gets its name through super().__init__")
def _():
    for shape, name in [(Rectangle(1, 2), "rectangle"), (Circle(1), "circle"), (Square(1), "square")]:
        check(isinstance(shape, Shape), f"{type(shape).__name__} should extend Shape")
        eq(shape.name, name)

@test("Shape itself is abstract")
def _():
    check("area" in getattr(Shape, "__abstractmethods__", ()), "inherit from abc.ABC and mark area() with @abstractmethod")
    raises(TypeError, Shape, "blob")

@test("a subclass that forgets area() fails when it's created, not later")
def _():
    class Blob(Shape):
        def __init__(self):
            self.name = "blob"

    raises(TypeError, Blob)
```

```hint
`from abc import ABC, abstractmethod`. Make `Shape` inherit from `ABC` and put `@abstractmethod` on `area`. Python then refuses to create any class that still has an abstract method.
```

```hint
In a subclass's `__init__`, `super().__init__("rectangle")` runs the parent's initializer, like `super("rectangle")` in JavaScript. Any method can call `super().describe()` the same way, with no `this` binding to think about.
```
:::

:::challenge id=drill-cls-money title="toString and toJSON" difficulty=medium
Translate `Money` and the `toJSON` helper:

- `Money(cents, currency="USD")` is a dataclass. Its generated `__repr__`, `Money(cents=1250, currency='USD')`, is the debugging view.
- `str(money)` is the display view, `"12.50 USD"`, which `print()` and f-strings use. Negative amounts keep their sign: `"-0.05 USD"`.
- `to_json(value)` serializes any JSON-friendly structure with `Money` values anywhere inside, writing each one as `{"cents": ..., "currency": ...}`.

JavaScript calls `toString()` and `toJSON()` for you. Python splits the first job between `__str__` and `__repr__`, and containers show their items' **repr**, so `str([money])` isn't the display text. `json.dumps` won't call methods on your objects either. Instead, it calls its `default=` function for every object it can't encode. That function should raise `TypeError` for anything that isn't `Money`, so a stray `set` still fails loudly instead of becoming `{}` as it would in JavaScript.

Refresher: [`__repr__` and `__str__`](lesson:dunder-methods#repr-and-str) and [`asdict()` and JSON](lesson:dataclasses-and-enums#asdict-and-json).

```js
class Money {
  constructor(cents, currency = "USD") {
    this.cents = cents;
    this.currency = currency;
  }
  toString() {
    return `${(this.cents / 100).toFixed(2)} ${this.currency}`;
  }
  toJSON() {
    return { cents: this.cents, currency: this.currency };
  }
}

const toJSON = (value) => JSON.stringify(value);
```

```python starter
import json

class Money:
    def __init__(self, cents, currency="USD"):
        self.cents = cents
        self.currency = currency

def to_json(value):
    ...
```

```python solution
import json
from dataclasses import asdict, dataclass

@dataclass(frozen=True)
class Money:
    cents: int
    currency: str = "USD"

    def __str__(self):
        return f"{self.cents / 100:.2f} {self.currency}"

def encode_money(obj):
    if isinstance(obj, Money):
        return asdict(obj)
    raise TypeError(f"{type(obj).__name__} is not JSON serializable")

def to_json(value):
    return json.dumps(value, default=encode_money)
```

```python tests
import json

@test("str() shows the amount with two decimals and the currency")
def _():
    eq(str(Money(1250)), "12.50 USD")
    eq(str(Money(5, "EUR")), "0.05 EUR")

@test("f-strings use __str__")
def _():
    eq(f"Total: {Money(1999)}", "Total: 19.99 USD")

@test("negative amounts keep their sign")
def _():
    eq(str(Money(-5)), "-0.05 USD")

@test("repr() is the generated debugging view, and lists use it")
def _():
    eq(repr(Money(1250)), "Money(cents=1250, currency='USD')")
    eq(str([Money(5)]), "[Money(cents=5, currency='USD')]")

@test("equal amounts are equal")
def _():
    eq(Money(100, "EUR"), Money(100, "EUR"))
    check(Money(100, "EUR") != Money(100, "USD"), "different currencies shouldn't be equal")

@test("to_json writes Money as an object")
def _():
    eq(json.loads(to_json(Money(1250))), {"cents": 1250, "currency": "USD"})

@test("to_json finds Money anywhere in nested data")
def _():
    order = {"id": 7, "lines": [{"sku": "A1", "price": Money(999)}], "total": Money(999, "EUR")}
    eq(json.loads(to_json(order)), {
        "id": 7,
        "lines": [{"sku": "A1", "price": {"cents": 999, "currency": "USD"}}],
        "total": {"cents": 999, "currency": "EUR"},
    })

@test("other unsupported values still raise TypeError")
def _():
    raises(TypeError, to_json, {"tags": {"sale", "new"}})
```

```hint
Decorate the class with `@dataclass` and declare `cents: int` and `currency: str = "USD"`. Then add only `__str__`: the dataclass has already written `__init__`, `__repr__` and `__eq__`.
```

```hint
`f"{self.cents / 100:.2f}"` formats the amount. Avoid `//` and `divmod` here: they floor, so `-5 // 100` is `-1`.
```

```hint
`json.dumps(value, default=fn)` calls `fn(obj)` for each object it can't encode, then encodes whatever `fn` returns. Return `dataclasses.asdict(obj)` for `Money` and raise `TypeError` for anything else.
```
:::

:::challenge id=drill-cls-tree title="Symbol.iterator to __iter__" difficulty=hard
Translate `TreeNode`:

- `TreeNode(value, children=...)` stores a value and a list of child nodes. Nodes never share a children list unless you pass the same one in.
- `add(child)` appends a child and returns the node, so calls chain.
- Iterating over a node yields every value in its subtree, depth first: the node's own value, then each child's subtree in order. Every `for` loop starts a fresh walk, so a tree can be iterated any number of times.
- `len(node)` counts the values in the subtree: the `size` getter becomes `__len__`.
- `level_order()` returns an iterator over the values breadth first, level by level.

Once `__iter__` exists, `in`, `list()`, `sorted()` and `max()` all work on a tree for free. Python's `yield from` is JavaScript's `yield*`.

Careful with the literal translation of `size`. `len(list(self))` recurses forever, because `list()` asks `__len__` for a size hint before it starts iterating, and the same goes for `[*self]`. Count with a generator expression instead.

Refresher: [Custom iterables: make `__iter__` a generator](lesson:iterators-and-generators#custom-iterables-make-iter-a-generator) and [`yield from` ≈ `yield*`](lesson:iterators-and-generators#yield-from-yield).

```js
class TreeNode {
  constructor(value, children = []) {
    this.value = value;
    this.children = children;
  }
  add(child) {
    this.children.push(child);
    return this;
  }
  *[Symbol.iterator]() {
    yield this.value;
    for (const child of this.children) yield* child;
  }
  get size() {
    return [...this].length;
  }
  *levelOrder() {
    const queue = [this];
    while (queue.length > 0) {
      const node = queue.shift();
      yield node.value;
      queue.push(...node.children);
    }
  }
}
```

```python starter
class TreeNode:
    ...
```

```python solution
from collections import deque

class TreeNode:
    def __init__(self, value, children=None):
        self.value = value
        self.children = [] if children is None else children

    def add(self, child):
        self.children.append(child)
        return self

    def __iter__(self):
        yield self.value
        for child in self.children:
            yield from child

    def __len__(self):
        return sum(1 for _ in self)

    def level_order(self):
        queue = deque([self])
        while queue:
            node = queue.popleft()
            yield node.value
            queue.extend(node.children)
```

```python tests
import sys

def checked_len(node):
    """len(node) under a low recursion limit, so a __len__ that calls itself
    fails with a clear message instead of crashing the interpreter."""
    frame, depth = sys._getframe(), 0
    while frame is not None:
        frame, depth = frame.f_back, depth + 1
    limit = sys.getrecursionlimit()
    sys.setrecursionlimit(depth + 100)
    try:
        return len(node)
    except RecursionError:
        check(False, "__len__ calls itself: list(self) asks __len__ for a size hint, so count with sum(1 for _ in self)")
    finally:
        sys.setrecursionlimit(limit)

def site_map():
    #          home
    #        /   |   \
    #     api   blog  docs
    #    /   \           \
    #  auth  users       faq
    auth, users, blog, faq = (TreeNode(name) for name in ("auth", "users", "blog", "faq"))
    api = TreeNode("api").add(auth).add(users)
    docs = TreeNode("docs", [faq])
    home = TreeNode("home").add(api).add(blog).add(docs)
    nodes = [home, api, blog, docs, auth, users, faq]
    check(
        len({id(node.children) for node in nodes}) == len(nodes),
        "the nodes share one children list: a [] default is created once, not per node",
    )
    if hasattr(TreeNode, "__len__"):
        checked_len(home)
    return home

@test("iterating yields values depth first")
def _():
    eq(list(site_map()), ["home", "api", "auth", "users", "blog", "docs", "faq"])

@test("a tree can be iterated more than once")
def _():
    tree = site_map()
    first = list(tree)
    eq(list(tree), first, "the second walk came out different: return a fresh generator from __iter__")
    eq([value for value in tree], first)

@test("len() counts every node in the subtree")
def _():
    eq(checked_len(site_map()), 7)
    eq(checked_len(TreeNode("leaf")), 1)

@test("in, sorted() and max() work through __iter__")
def _():
    tree = site_map()
    check("users" in tree, "'users' should be in the tree")
    check("admin" not in tree, "'admin' shouldn't be in the tree")
    eq(sorted(tree)[:3], ["api", "auth", "blog"])
    eq(max(tree), "users")

@test("add() returns the node so calls chain")
def _():
    root = TreeNode("root")
    check(root.add(TreeNode("child")) is root, "add() should return self")

@test("nodes don't share a children list")
def _():
    first, second = TreeNode("a"), TreeNode("b")
    first.add(TreeNode("c"))
    check(first.children is not second.children, "adding to one node changed another: is the default list shared?")
    eq(len(second.children), 0)

@test("level_order() walks breadth first")
def _():
    eq(list(site_map().level_order()), ["home", "api", "blog", "docs", "auth", "users", "faq"])

@test("level_order() is lazy")
def _():
    walk = site_map().level_order()
    eq(next(walk), "home")
    eq(next(walk), "api")
```

```hint
Make `__iter__` a generator: `yield self.value`, then `yield from child` for each child. Every call to `iter(tree)`, which is what a `for` loop makes, gets a brand-new generator, so walks never interfere. `__len__` can then count with `sum(1 for _ in self)`.
```

```hint
`children=[]` in the signature is evaluated once and shared by every node. Default to `None` and create the list inside `__init__`.
```

```hint
For `level_order`, use a `collections.deque` as the queue: `popleft()` is O(1), where `list.pop(0)`, like JavaScript's `shift()`, is O(n). Making it a generator keeps it lazy.
```
:::

:::challenge id=drill-fn-curry title="Curry" difficulty=hard
Write `curry(fn)`. The curried function collects positional arguments across calls, in any grouping, and calls `fn` as soon as it has at least as many as `fn` requires:

```text
volume = curry(lambda length, width, height: length * width * height)
volume(2)(3)(4)   ->  24
volume(2, 3)(4)   ->  24
volume(2)(3, 4)   ->  24
volume(2, 3, 4)   ->  24
```

- Count what `fn` requires the way JavaScript's `fn.length` does: positional parameters without a default. Read them from `inspect.signature(fn)`, which also handles bound methods (no `self` to count) and `functools.partial` objects. `fn.__code__` gets the first wrong and doesn't exist on the second.
- A partial application is a value you can reuse: `with_length = volume(2)` followed by `with_length(3)(4)` and `with_length(5)(6)` must not interfere.
- Arguments beyond what `fn` requires are passed on to it, and `fn` raises `TypeError` if it can't take them. JavaScript would silently ignore them.

In everyday Python you'd rarely curry: `functools.partial(fn, 2)` is the idiomatic way to fix some arguments, and it's also the natural tool for building this.

Refresher: [`functools.partial` ≈ `bind`](lesson:decorators#functools-partial-bind) and [Calls are checked against the signature](lesson:functions#calls-are-checked-against-the-signature).

```js
const curry = (fn) => {
  const curried = (...args) =>
    args.length >= fn.length
      ? fn(...args)
      : (...more) => curried(...args, ...more);
  return curried;
};
```

```python starter
def curry(fn):
    ...
```

```python solution
from functools import partial
from inspect import Parameter, signature

POSITIONAL = (Parameter.POSITIONAL_ONLY, Parameter.POSITIONAL_OR_KEYWORD)

def curry(fn):
    required = sum(
        1
        for param in signature(fn).parameters.values()
        if param.kind in POSITIONAL and param.default is Parameter.empty
    )

    def curried(*args):
        if len(args) >= required:
            return fn(*args)
        return partial(curried, *args)

    return curried
```

```python tests
from functools import partial

def volume_of(length, width, height):
    return length * width * height

@test("one argument at a time")
def _():
    eq(curry(volume_of)(2)(3)(4), 24)

@test("any grouping of arguments")
def _():
    volume = curry(volume_of)
    eq(volume(2, 3)(4), 24)
    eq(volume(2)(3, 4), 24)
    eq(volume(2, 3, 4), 24)

@test("partial applications can be reused independently")
def _():
    with_length = curry(volume_of)(2)
    eq(with_length(3)(4), 24)
    eq(with_length(5)(6), 60)
    eq(with_length(1, 1), 2)

@test("parameters with defaults don't count, like fn.length")
def _():
    add = curry(lambda a, b, c=10: a + b + c)
    eq(add(1)(2), 13)

@test("a function with no required parameters runs on the first call")
def _():
    eq(curry(lambda: "ready")(), "ready")

@test("works with bound methods and partial objects")
def _():
    class Pricing:
        def __init__(self, tax):
            self.tax = tax

        def total(self, price, qty):
            return price * qty * (1 + self.tax)

    eq(curry(Pricing(0.5).total)(10)(2), 30.0)
    eq(curry(partial(volume_of, 2))(3)(4), 24)

@test("extra arguments raise TypeError instead of vanishing")
def _():
    raises(TypeError, curry(volume_of), 1, 2, 3, 4)
```

```hint
`inspect.signature(fn).parameters` maps names to `Parameter` objects. Count the ones whose `kind` is `POSITIONAL_ONLY` or `POSITIONAL_OR_KEYWORD` and whose `default is Parameter.empty`.
```

```hint
Define `curried(*args)` inside `curry`. With enough arguments, return `fn(*args)`. Otherwise return `functools.partial(curried, *args)`: a new callable that remembers `args` and adds whatever comes next, without mutating anything shared.
```
:::
