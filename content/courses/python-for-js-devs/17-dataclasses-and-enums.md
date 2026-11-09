---
title: Dataclasses, NamedTuples & Enums
part: Objects & Classes
summary: Records without boilerplate, hashable immutable values, and enums that are real types, not magic strings.
minutes: 40
---

In TypeScript, a record is an `interface` plus object literals, and an enum is an `enum`, a frozen object or a union of string literals. Python has runtime-real versions of all of these. `@dataclass` writes `__init__`, `__repr__` and `__eq__` from a list of annotated fields. `NamedTuple` is an immutable tuple with field names. `Enum` defines a closed set of constants whose members are objects of their own type, not bare strings.

The mental-model shift is that these are ordinary classes with generated methods. Everything below is a dunder from [Dunder Methods](lesson:dunder-methods) that you could write by hand, and that you no longer have to. In modern Python, most classes that mainly hold data are dataclasses.

## `@dataclass`: a class from its fields

:::compare
```ts
class User {
  constructor(
    public name: string,
    public email: string,
    public age: number = 0,
  ) {}
}


const ada = new User("Ada", "ada@example.com", 36);
console.log(ada);   // User { name: 'Ada', ... }
ada === new User("Ada", "ada@example.com", 36);   // false
```
```python
from dataclasses import dataclass

@dataclass
class User:
    name: str
    email: str
    age: int = 0



ada = User("Ada", "ada@example.com", 36)
print(ada)          # User(name='Ada', email='ada@example.com', age=36)
ada == User("Ada", "ada@example.com", 36)         # True
```
:::

Annotated class attributes become **fields**, in order. From them `@dataclass` generates an `__init__` that takes the fields positionally or by keyword, a readable `__repr__`, and an `__eq__` that compares field by field. It's TypeScript's parameter properties plus the `toString()` and `equals()` you'd otherwise write yourself. The result is still an ordinary class, so methods and properties work as usual:

```python run
from dataclasses import dataclass

@dataclass
class Product:
    name: str
    price: float
    quantity: int = 1

    @property
    def total(self):
        return self.price * self.quantity

pen = Product("pen", 1.5, quantity=4)
print(pen, pen.total)
print(pen == Product("pen", 1.5, 4))
print(Product("ink", 7.25))
```

Only annotated names become fields: a plain `count = 0` in the body stays a class attribute. Fields with defaults must come after fields without one, as with function parameters. Declaring `age: int = 0` before `email: str` fails at class creation with `TypeError: non-default argument 'email' follows default argument 'age'`.

:::gotcha Type hints aren't checked at runtime
The annotations define the fields, but nothing enforces them: `Product("pen", "cheap")` is accepted and fails later, when something multiplies `"cheap"`. A type checker catches it statically, `__post_init__` (below) can validate at runtime, and pydantic does both for data from outside.
:::

## Defaults and `field()`

:::compare
```ts
class Cart {
  items: string[] = [];         // a fresh array per instance
  coupon: string | null = null;
}
```
```python
@dataclass
class Cart:
    items: list[str] = field(default_factory=list)
    coupon: str | None = None
```
:::

A default in a class body is evaluated **once**, when the class is created. That's the shared-mutable-attribute trap from [Classes](lesson:classes), and a cousin of the mutable-default-argument trap in [Functions](lesson:functions). Dataclasses refuse to fall into it. `items: list = []` raises `ValueError: mutable default <class 'list'> for field items is not allowed: use default_factory`. `field(default_factory=list)` calls `list()` again for every new instance, which is what JavaScript class fields do by default.

`field()` takes a few other switches worth knowing:

- `repr=False` hides a field from `__repr__`, for secrets and noisy data.
- `compare=False` leaves it out of `==` and ordering.
- `init=False` removes it from `__init__`, for values computed in `__post_init__`.

```python run
from dataclasses import dataclass, field

@dataclass
class Cart:
    owner: str
    items: list[str] = field(default_factory=list)
    coupon: str | None = None
    token: str = field(default="", repr=False, compare=False)

a, b = Cart("ada"), Cart("linus")
a.items.append("book")
print(a, b)                                            # separate lists
print(Cart("x", token="t1") == Cart("x", token="t2"))  # token isn't compared
```

:::note The check is approximate
Dataclasses reject unhashable defaults (lists, dicts, sets) as a stand-in for "mutable". A mutable object that happens to be hashable, like an instance of your own class, slips through and is shared. Use `default_factory` for any mutable default.
:::

## Validation with `__post_init__`

:::compare
```ts
class Order {
  readonly total: number;
  constructor(public id: number, public items: number[]) {
    if (items.length === 0) throw new Error("empty order");
    this.total = items.reduce((a, b) => a + b, 0);
  }
}
```
```python
@dataclass
class Order:
    id: int
    items: list[float]
    total: float = field(init=False)

    def __post_init__(self):
        if not self.items:
            raise ValueError("an order needs at least one item")
        self.total = round(sum(self.items), 2)
```
:::

The generated `__init__` calls `__post_init__` as its last step. That's the place for validation, normalization and derived fields. A field declared with `init=False` isn't a constructor argument, so `__post_init__` has to set it.

```python run raises
from dataclasses import dataclass, field

@dataclass
class Order:
    id: int
    items: list[float]
    email: str = ""
    total: float = field(init=False)

    def __post_init__(self):
        if not self.items:
            raise ValueError("an order needs at least one item")
        self.email = self.email.strip().lower()
        self.total = round(sum(self.items), 2)

print(Order(1, [9.99, 5.01], " Ada@Example.com "))
Order(2, [])
```

## Frozen dataclasses

:::compare
```ts
const home = Object.freeze({ lat: 51.5, lon: -0.12 });
home.lat = 0;      // ignored, or TypeError in strict mode

type Point = Readonly<{ lat: number; lon: number }>;   // compile time only
new Map([[home, 3]]).get({ lat: 51.5, lon: -0.12 });  // undefined
```
```python
@dataclass(frozen=True)
class Point:
    lat: float
    lon: float

home = Point(51.5, -0.12)
home.lat = 0       # FrozenInstanceError
{home: 3}[Point(51.5, -0.12)]                          # 3
```
:::

`frozen=True` makes assignment and `del` on fields raise `dataclasses.FrozenInstanceError`, a subclass of `AttributeError`. Since a frozen instance can't change, `@dataclass` also generates a `__hash__` that agrees with `__eq__`, so equal values work as the same dict key or set member. That's the value-object behaviour JavaScript `Map` and `Set` can't give you. A plain `@dataclass` defines `__eq__` without `__hash__`, so its instances are unhashable.

```python run raises
from dataclasses import dataclass

@dataclass(frozen=True)
class Point:
    lat: float
    lon: float

home = Point(51.5, -0.12)
visits = {home: 3}
print(visits[Point(51.5, -0.12)])        # an equal key finds the entry
print(len({home, Point(51.5, -0.12)}))   # and dedupes in a set
home.lat = 0                             # FrozenInstanceError
```

:::quiz output
What does this print?

```python
from dataclasses import dataclass

@dataclass(frozen=True)
class Team:
    name: str
    members: list

team = Team("core", ["ada"])
team.members.append("linus")
print(team)
```

- [ ] `FrozenInstanceError`
- [ ] `Team(name='core', members=['ada'])`
- [x] `Team(name='core', members=['ada', 'linus'])`

Like `Object.freeze`, `frozen=True` is **shallow**. It stops you from reassigning `team.members`, not from mutating the list inside. That list also makes `hash(team)` fail, because lists are unhashable. Use tuples and `frozenset` inside frozen dataclasses.
:::

:::tip Normalising a frozen instance
Inside `__post_init__` of a frozen class, `self.email = ...` raises too. The escape hatch is `object.__setattr__(self, "email", self.email.lower())`, which is exactly what the generated `__init__` does.
:::

### Copy with changes: `replace()`

:::compare
```js
const older = { ...user, age: user.age + 1 };
const typo = { ...user, agee: 37 };   // silently adds a key
```
```python
older = replace(user, age=user.age + 1)
typo = replace(user, agee=37)         # TypeError: unexpected keyword
```
:::

`dataclasses.replace()` is the spread-and-override pattern: a **new** instance with some fields changed, which is how you "modify" a frozen dataclass. It goes through `__init__`, so `__post_init__` validation runs again and a misspelled field raises `TypeError`. Python 3.13 added the general `copy.replace()`, which works on dataclasses, named tuples, `datetime` objects and anything else that implements `__replace__`. Like spread, both are shallow: unchanged fields are shared, not copied.

```python run
import copy
from dataclasses import dataclass, replace

@dataclass(frozen=True)
class User:
    name: str
    age: int

    def __post_init__(self):
        if self.age < 0:
            raise ValueError("age can't be negative")

ada = User("Ada", 36)
print(replace(ada, age=37), ada)          # the original is untouched
print(copy.replace(ada, name="Augusta"))  # 3.13+
try:
    replace(ada, age=-1)
except ValueError as err:
    print("rejected:", err)
```

## `kw_only`, `order` and `slots`

:::compare
```ts
function request({ url, method = "GET", timeout = 10 }: Options) {
  // ...
}

request({ url: "/api", timeout: 2 });
```
```python
@dataclass(kw_only=True)
class Request:
    url: str
    method: str = "GET"
    timeout: float = 10.0

Request(url="/api", timeout=2)
```
:::

Three more switches cover most remaining needs:

- **`kw_only=True`** (3.10+) makes every field keyword-only, so call sites read like an options object and nobody passes six positional arguments in the wrong order. It also lifts the defaults-last rule. To make only the later fields keyword-only, put a `_: KW_ONLY` pseudo-field before them.
- **`order=True`** generates `<`, `<=`, `>` and `>=`, comparing the fields as a tuple **in declaration order**. Put the sort key first, and exclude fields with `field(compare=False)`.
- **`slots=True`** (3.10+) generates `__slots__`: smaller instances, faster attribute access, and `AttributeError` for typos like `task.titel = "x"`.

```python run raises
from dataclasses import dataclass, field

@dataclass(order=True, slots=True)
class Task:
    priority: int
    title: str = field(compare=False)

@dataclass(kw_only=True)
class Request:
    url: str
    method: str = "GET"
    timeout: float = 10.0

tasks = [Task(3, "deploy"), Task(1, "write tests"), Task(2, "review")]
print([t.title for t in sorted(tasks)])
print(Request(url="https://example.com/api", timeout=2.5))
Request("https://example.com/api")       # positional: TypeError
```

:::quiz output
What does this print?

```python
from dataclasses import dataclass

@dataclass(order=True)
class Player:
    name: str
    score: int

players = [Player("Linus", 87), Player("Ada", 92)]
print(max(players).name)
```

- [ ] `Ada`
- [x] `Linus`
- [ ] `TypeError`

`order=True` compares `(name, score)` tuples, so `name` decides first and `"Linus" > "Ada"`. The generated ordering follows declaration order, not what you meant. Put `score` first, or skip `order=True` and say it explicitly: `max(players, key=lambda p: p.score)`.
:::

## `asdict()` and JSON

:::compare
```js
JSON.stringify(customer);             // walks any object

const data = JSON.parse(text);        // a plain object, no class
```
```python
json.dumps(asdict(customer))          # dataclass -> dict -> JSON

customer = Customer(**json.loads(text))   # flat data only
```
:::

`json.dumps()` doesn't know your classes: `TypeError: Object of type Customer is not JSON serializable`. `dataclasses.asdict()` converts an instance into a dict, recursing into nested dataclasses, lists and dicts and deep-copying as it goes. (`astuple()` does the same into tuples.) The reverse direction is manual. `Customer(**data)` works for flat data, but nested dicts stay dicts, and nothing checks the types. That gap is what pydantic fills. [Dicts](lesson:dicts) covers the `json` module itself.

```python run
import json
from dataclasses import dataclass, field, asdict

@dataclass
class Address:
    city: str
    country: str

@dataclass
class Customer:
    name: str
    address: Address
    tags: list[str] = field(default_factory=list)

ada = Customer("Ada", Address("London", "UK"), ["vip"])
print(json.dumps(asdict(ada)))
raw = '{"name": "Linus", "address": {"city": "Helsinki", "country": "FI"}}'
linus = Customer(**json.loads(raw))
print(type(linus.address))                # still a dict, not an Address
```

## `NamedTuple`: a tuple with names

:::compare
```ts
type Point = [x: number, y: number];   // labels exist only in the type

const p: Point = [3, 4];
const [x, y] = p;
p[0];
```
```python
class Point(NamedTuple):
    x: float
    y: float

p = Point(3, 4)
x, y = p
p.x, p[0]
```
:::

`typing.NamedTuple` builds a tuple subclass with named fields. Instances are immutable, hashable, indexable and unpackable, they compare like tuples, and they cost no more memory than tuples. They shine where a function returns several values or a row has a fixed shape. The helper methods carry a leading underscore so they can't clash with your field names: `_replace()`, `_asdict()` and `_fields`.

```python run
from typing import NamedTuple

class Point(NamedTuple):
    x: float
    y: float = 0.0

p = Point(3, 4)
x, y = p                         # unpacks like any tuple
print(p, p.x, p[1], x + y)
print(p._replace(y=10), p._asdict(), Point._fields)
print(sorted([Point(2, 1), Point(1, 5), Point(1, 2)]))
print({p: "here"}[Point(3, 4)])
```

:::quiz output
What does this print?

```python
from typing import NamedTuple

class Point(NamedTuple):
    x: int
    y: int

class Size(NamedTuple):
    width: int
    height: int

print(Point(3, 4) == Size(3, 4))
```

- [x] `True`
- [ ] `False`
- [ ] `TypeError`

A named tuple is still a tuple, and tuple equality compares items only, so `Point(3, 4) == Size(3, 4)` and even `Point(3, 4) == (3, 4)` are `True`. A dataclass compares equal only to instances of its own class. Prefer a dataclass unless you actually want tuple behaviour.
:::

You'll also meet the older `collections.namedtuple("Point", ["x", "y"])` form, which does the same thing without type hints.

## Choosing a record type

| You want | Use | Why |
| --- | --- | --- |
| Ad hoc data, JSON in and out | `dict` | No class needed. A typo in a key is a runtime `KeyError`. |
| A dict with a known shape | `TypedDict` | Still a plain dict at runtime, but a type checker knows the keys ([Type Hints](lesson:type-hints)). |
| A domain object with behaviour | `@dataclass` | Methods, defaults, validation, `frozen`, `slots`. The default choice. |
| A small immutable value that acts like a tuple | `NamedTuple` | Unpacking, indexing, tuple equality, minimal overhead. |
| Parsing untrusted input | pydantic `BaseModel` | Third-party. Validates and coerces types at runtime, like zod. |

Pydantic isn't in the standard library (or the sandbox), but you'll see it everywhere, from FastAPI to config loading:

```python
from pydantic import BaseModel

class Signup(BaseModel):
    email: str
    age: int

Signup.model_validate({"email": "ada@example.com", "age": "36"})   # age coerced to 36
Signup.model_validate({"email": "ada@example.com", "age": "old"})  # ValidationError
```

## Enums

:::compare
```ts
enum Color {
  Red = "red",
  Green = "green",
  Blue = "blue",
}

Color.Red;                    // "red"
Object.values(Color);         // ["red", "green", "blue"]
const c = input as Color;     // a cast, no runtime check
typeof Color.Red;             // "string": members are plain strings
```
```python
from enum import Enum

class Color(Enum):
    RED = "red"
    GREEN = "green"
    BLUE = "blue"


Color.RED                     # <Color.RED: 'red'>
list(Color)                   # all three members, in order
c = Color("green")            # lookup by value, ValueError if invalid
Color.RED == "red"            # False: a member isn't its value
```
:::

Each member is a **singleton instance of the enum class**, with a `.name` (`"RED"`) and a `.value` (`"red"`). `Color("green")` looks a member up by value and raises `ValueError` for anything else, which makes it a one-line validator for incoming data. `Color["GREEN"]` looks up by name. The class is iterable, has a `len()`, and its members can't be reassigned or added to at runtime, so it replaces `Object.freeze` constant maps and literal unions too.

Members are unique objects, so `Color("green") is Color.GREEN` holds and `is` is the idiomatic comparison. Unlike a TypeScript string enum, a plain `Enum` member never equals its raw value. Convert at the boundaries instead: `Color(raw)` on the way in, `.value` on the way out.

```python run raises
from enum import Enum

class Color(Enum):
    RED = "red"
    GREEN = "green"
    BLUE = "blue"

print(Color.RED, Color.RED.name, Color.RED.value)
print(Color("green"), Color["BLUE"], len(Color))
print([c.value for c in Color])
print(Color("green") is Color.GREEN, Color.RED == "red")
print("red" in Color)                    # checks values too (3.12+)
Color("purple")                          # ValueError
```

:::gotcha Parentheses look up values, brackets look up names
`Color("RED")` raises `ValueError`, because no member has the *value* `"RED"`. Use `Color["RED"]` for names. And `json.dumps(Color.RED)` raises `TypeError`: a plain enum member isn't a string, so serialize `.value`, or use `StrEnum`.
:::

### `auto()`, `StrEnum` and `IntEnum`

`auto()` picks values for you: `1, 2, 3, ...` for `Enum`, and the lowercased member name for `StrEnum` (3.11+). `StrEnum` and `IntEnum` members **are** strings and ints: they compare equal to raw values, serialize straight to JSON and work anywhere a `str` or `int` does. That's TypeScript string-enum behaviour, at the cost of the strictness above. The standard library's `http.HTTPStatus` is an `IntEnum`.

```python run
import json
from enum import IntEnum, StrEnum, auto

class Status(StrEnum):
    PENDING = auto()            # "pending"
    PAID = auto()
    SHIPPED = auto()

class Priority(IntEnum):
    LOW = 1
    HIGH = 3

print(Status.PAID == "paid", Status("shipped"), f"order is {Status.PAID}")
print(json.dumps({"status": Status.PAID, "priority": Priority.HIGH}))
print(Priority.HIGH > Priority.LOW, sorted([Priority.HIGH, Priority.LOW]))
```

:::quiz output
What does this print?

```python
from enum import Enum, StrEnum

class Plain(Enum):
    RED = "red"

class Text(StrEnum):
    RED = "red"

print(Plain.RED == "red", Text.RED == "red")
```

- [ ] `True True`
- [x] `False True`
- [ ] `False False`

A plain `Enum` member is only equal to itself. A `StrEnum` member is a subclass of `str`, so it compares like the string it holds. Pick `StrEnum` for values that cross a JSON or database boundary, and `Enum` when you want mixing with raw strings to be a bug.
:::

### `Flag`: combinable members

`Flag` members combine with `|` into sets of options, replacing bitmask constants like `const READ = 1, WRITE = 2`. Test them with `in`. Iterating over a combination yields its members (3.11+).

```python run
from enum import Flag, auto

class Permission(Flag):
    READ = auto()       # 1
    WRITE = auto()      # 2
    EXECUTE = auto()    # 4

editor = Permission.READ | Permission.WRITE
print(editor, Permission.WRITE in editor, Permission.EXECUTE in editor)
print(list(editor), editor.value)
```

### Enums with behaviour, and `match`

Enums are classes, so members can carry methods and properties. In a `match` statement, dotted names like `Light.RED` are value patterns, which makes enums the cleanest `case` labels. A bare name like `case RED:` would capture instead of compare, as [Pattern Matching](lesson:pattern-matching) explains.

```python run
from enum import Enum

class Light(Enum):
    RED = "red"
    YELLOW = "yellow"
    GREEN = "green"

    @property
    def next(self):
        match self:
            case Light.RED:
                return Light.GREEN
            case Light.GREEN:
                return Light.YELLOW
            case Light.YELLOW:
                return Light.RED

light = Light.RED
for _ in range(4):
    print(light.name, end=" -> ")
    light = light.next
print(light.name)
```

## Cheat sheet

| TypeScript / JavaScript | Python | Notes |
| --- | --- | --- |
| class with parameter properties | `@dataclass` | generates `__init__`, `__repr__`, `__eq__` |
| `items = []` class field | `field(default_factory=list)` | a plain `[]` default raises `ValueError` |
| validation in the constructor | `__post_init__` | runs after the generated `__init__` |
| `Object.freeze` / `Readonly<T>` | `@dataclass(frozen=True)` | shallow; makes instances hashable |
| `{ ...obj, x: 1 }` | `replace(obj, x=1)` | new object, validated again; `copy.replace` in 3.13+ |
| options object | `@dataclass(kw_only=True)` | or `_: KW_ONLY` for some fields |
| comparator | `@dataclass(order=True)` | compares fields in declaration order |
| `JSON.stringify(obj)` | `json.dumps(asdict(obj))` | `asdict` recurses into nested dataclasses |
| labelled tuple type | `NamedTuple` | `_replace`, `_asdict`, tuple equality |
| `interface` for a JSON shape | `TypedDict` | static only, a plain dict at runtime |
| zod schema | pydantic `BaseModel` | third-party |
| `enum Color { Red = "red" }` | `class Color(Enum): RED = "red"` | members are singletons |
| `Color.Red` | `Color.RED.value` | `.name` too |
| `"red" as Color` | `Color("red")` | validates, raises `ValueError` |
| `Object.values(Color)` | `list(Color)` | definition order |
| string enum | `StrEnum` (3.11+) | members are `str` |
| numeric enum | `IntEnum` | members are `int` |
| bit flags | `Flag` | `READ \| WRITE`, test with `in` |
| `switch (color)` | `match color:` + `case Color.RED:` | dotted names only |

## Challenges

:::challenge id=dataclass-cart-item title="Cart items" difficulty=easy
Turn `CartItem` into a dataclass with the fields `sku: str`, `price: float`, `quantity: int` (default `1`) and `tags: list[str]` (default empty, and never shared between items).

- `total` is a **property**: `price * quantity`.
- Creating an item with a negative price or a quantity below 1 raises `ValueError`.

The generated `__repr__` and `__eq__` should do the rest.

```ts
class CartItem {
  constructor(
    public sku: string,
    public price: number,
    public quantity = 1,
    public tags: string[] = [],
  ) {
    if (price < 0 || quantity < 1) throw new RangeError("invalid item");
  }
  get total() { return this.price * this.quantity; }
}
```

```python starter
class CartItem:
    pass
```

```python solution
from dataclasses import dataclass, field


@dataclass
class CartItem:
    sku: str
    price: float
    quantity: int = 1
    tags: list[str] = field(default_factory=list)

    def __post_init__(self):
        if self.price < 0:
            raise ValueError("price can't be negative")
        if self.quantity < 1:
            raise ValueError("quantity must be at least 1")

    @property
    def total(self):
        return self.price * self.quantity
```

```python tests
import dataclasses

@test("is a dataclass with the right fields")
def _():
    check(dataclasses.is_dataclass(CartItem), "decorate CartItem with @dataclass")
    eq([f.name for f in dataclasses.fields(CartItem)], ["sku", "price", "quantity", "tags"])

@test("generated __init__, __repr__ and __eq__")
def _():
    item = CartItem("PEN-1", 1.5, 4)
    eq(repr(item), "CartItem(sku='PEN-1', price=1.5, quantity=4, tags=[])")
    eq(item, CartItem(sku="PEN-1", price=1.5, quantity=4))
    eq(CartItem("INK-2", 7.25).quantity, 1, "quantity should default to 1")

@test("each item gets its own tags list")
def _():
    a, b = CartItem("A", 1.0), CartItem("B", 2.0)
    a.tags.append("sale")
    eq(b.tags, [], "tags is shared: use field(default_factory=list)")

@test("total is a computed property")
def _():
    approx(CartItem("PEN-1", 1.5, 4).total, 6.0)
    check(isinstance(CartItem.total, property), "make total a @property, not a field")

@test("rejects a negative price or a quantity below 1")
def _():
    raises(ValueError, CartItem, "X", -1.0)
    raises(ValueError, CartItem, "X", 1.0, 0)
    eq(CartItem("FREE", 0.0).total, 0.0, "a price of 0 is fine")
```

```hint
Import `dataclass` and `field` from `dataclasses`. Fields are annotated class attributes, in the order the constructor should take them.
```

```hint
`tags: list[str] = field(default_factory=list)` gives every item a fresh list. Validation goes in `__post_init__`, which the generated `__init__` calls at the end.
```
:::

:::challenge id=dataclass-time-slot title="Calendar slots" difficulty=medium
Model a calendar slot as an **immutable** value: `Slot(start, end)`, both in minutes since midnight.

- It's frozen, hashable and sortable (by `start`, then `end`).
- Creating one raises `ValueError` unless `0 <= start < end <= 1440`.
- `duration` is a property.
- `shifted(minutes)` returns a **new** slot moved by that many minutes. It must be validated too, so shifting past midnight raises `ValueError`.
- `overlaps(other)` is `True` when the slots share any time. Back-to-back slots (`60-120` and `120-180`) don't overlap.

```python starter
from dataclasses import dataclass

DAY = 24 * 60


@dataclass
class Slot:
    start: int
    end: int
```

```python solution
from dataclasses import dataclass, replace

DAY = 24 * 60


@dataclass(frozen=True, order=True)
class Slot:
    start: int
    end: int

    def __post_init__(self):
        if not 0 <= self.start < self.end <= DAY:
            raise ValueError(f"invalid slot {self.start}-{self.end}")

    @property
    def duration(self):
        return self.end - self.start

    def shifted(self, minutes):
        return replace(self, start=self.start + minutes, end=self.end + minutes)

    def overlaps(self, other):
        return self.start < other.end and other.start < self.end
```

```python tests
import dataclasses

@test("stores start and end in minutes, with a duration")
def _():
    standup = Slot(9 * 60, 9 * 60 + 15)
    eq((standup.start, standup.end, standup.duration), (540, 555, 15))

@test("is frozen")
def _():
    slot = Slot(60, 120)
    with raises(dataclasses.FrozenInstanceError):
        slot.start = 0

@test("rejects invalid slots")
def _():
    raises(ValueError, Slot, 120, 60)
    raises(ValueError, Slot, 60, 60)
    raises(ValueError, Slot, -10, 30)
    raises(ValueError, Slot, 23 * 60, 25 * 60)
    eq(Slot(0, 24 * 60).duration, 1440, "a slot may span the whole day")

@test("shifted() returns a new, validated slot")
def _():
    lunch = Slot(720, 780)
    eq(lunch.shifted(30), Slot(750, 810))
    eq(lunch, Slot(720, 780), "the original must not change")
    raises(ValueError, lunch.shifted, 12 * 60)

@test("sorts by start, then end")
def _():
    slots = [Slot(600, 660), Slot(540, 600), Slot(540, 555)]
    eq(sorted(slots), [Slot(540, 555), Slot(540, 600), Slot(600, 660)])

@test("equal slots work as the same set member and dict key")
def _():
    eq(len({Slot(60, 90), Slot(60, 90), Slot(90, 120)}), 2)
    eq({Slot(60, 90): "standup"}[Slot(60, 90)], "standup")

@test("overlaps() treats touching slots as free")
def _():
    check(Slot(60, 120).overlaps(Slot(90, 150)), "60-120 and 90-150 overlap")
    check(Slot(90, 150).overlaps(Slot(60, 120)), "overlap is symmetric")
    check(not Slot(60, 120).overlaps(Slot(120, 180)), "back-to-back slots don't overlap")
    check(Slot(0, 300).overlaps(Slot(60, 120)), "a slot inside another overlaps it")
```

```hint
`@dataclass(frozen=True, order=True)` gives you immutability, a matching `__hash__` and tuple-style ordering on `(start, end)`.
```

```hint
`dataclasses.replace(self, start=..., end=...)` builds the new slot through `__init__`, so `__post_init__` validates it for free.
```

```hint
Two half-open intervals overlap when each one starts before the other ends: `self.start < other.end and other.start < self.end`.
```
:::

:::challenge id=dataclass-order-json title="Orders from JSON" difficulty=hard
Orders arrive as JSON like this:

```json
{"id": 7, "status": "paid", "items": [{"sku": "PEN-1", "quantity": 2}]}
```

Model them with real types:

- `Status`, a `StrEnum` with the members `PENDING`, `PAID`, `SHIPPED` and `CANCELLED`, whose values are the lowercase names.
- `LineItem`, a frozen dataclass with `sku: str` and `quantity: int`.
- `Order`, a dataclass with `id: int`, `status: Status` and `items: list[LineItem]` (empty by default).
- `Order.from_dict(data)`, a class method that builds an `Order` from parsed JSON, converting the status string and every item dict. An unknown status raises `ValueError`, and a missing `"items"` key means no items.
- `order.to_dict()`, which returns plain data that `json.dumps` accepts and that `from_dict` turns back into an equal `Order`.

```ts
// With zod you'd write a schema and call OrderSchema.parse(json).
const Status = z.enum(["pending", "paid", "shipped", "cancelled"]);
const Order = z.object({
  id: z.number(),
  status: Status,
  items: z.array(z.object({ sku: z.string(), quantity: z.number() })).default([]),
});
```

```python starter
from dataclasses import dataclass, field, asdict
from enum import StrEnum, auto


class Status:
    ...


class LineItem:
    ...


class Order:
    ...
```

```python solution
from dataclasses import dataclass, field, asdict
from enum import StrEnum, auto


class Status(StrEnum):
    PENDING = auto()
    PAID = auto()
    SHIPPED = auto()
    CANCELLED = auto()


@dataclass(frozen=True)
class LineItem:
    sku: str
    quantity: int


@dataclass
class Order:
    id: int
    status: Status
    items: list[LineItem] = field(default_factory=list)

    @classmethod
    def from_dict(cls, data):
        return cls(
            id=data["id"],
            status=Status(data["status"]),
            items=[LineItem(**item) for item in data.get("items", [])],
        )

    def to_dict(self):
        return asdict(self)   # StrEnum members are already strings
```

```python tests
import dataclasses
import json

PAYLOAD = '{"id": 7, "status": "paid", "items": [{"sku": "PEN-1", "quantity": 2}, {"sku": "INK-2", "quantity": 1}]}'

@test("Status is a StrEnum with lowercase values")
def _():
    eq([s.value for s in Status], ["pending", "paid", "shipped", "cancelled"])
    check(Status("paid") is Status.PAID, "Status('paid') should return the PAID member")
    check(isinstance(Status.PAID, str), "Status members should be strings: use StrEnum")

@test("LineItem is a frozen dataclass")
def _():
    item = LineItem("PEN-1", 2)
    with raises(dataclasses.FrozenInstanceError):
        item.quantity = 3
    eq(len({LineItem("PEN-1", 2), LineItem("PEN-1", 2)}), 1)

@test("from_dict converts the status and the items")
def _():
    order = Order.from_dict(json.loads(PAYLOAD))
    check(order.status is Status.PAID, f"expected Status.PAID, got {order.status!r}")
    eq(order.items, [LineItem("PEN-1", 2), LineItem("INK-2", 1)])
    check(all(isinstance(i, LineItem) for i in order.items), "items should be LineItem objects, not dicts")

@test("from_dict rejects an unknown status")
def _():
    raises(ValueError, Order.from_dict, {"id": 1, "status": "lost"})

@test("items default to a new empty list")
def _():
    eq(Order.from_dict({"id": 1, "status": "pending"}).items, [])
    Order(2, Status.PENDING).items.append(LineItem("X", 1))
    eq(Order(3, Status.PENDING).items, [], "items is shared between orders")

@test("to_dict gives plain, JSON-ready data")
def _():
    data = json.loads(PAYLOAD)
    eq(json.loads(json.dumps(Order.from_dict(data).to_dict())), data)

@test("round-trips through JSON")
def _():
    order = Order(9, Status.SHIPPED, [LineItem("MUG-3", 4)])
    eq(Order.from_dict(json.loads(json.dumps(order.to_dict()))), order)
```

```hint
`Status(data["status"])` converts and validates in one step: it raises `ValueError` for unknown values. With `auto()`, a `StrEnum` member's value is its lowercased name.
```

```hint
A list comprehension turns item dicts into objects: `[LineItem(**item) for item in data.get("items", [])]`. `**item` passes each key as a keyword argument.
```

```hint
`asdict(self)` recurses into the `LineItem`s. Because `StrEnum` members are `str` instances, `json.dumps` accepts the status as is. A plain `Enum` would need `self.status.value`.
```
:::
