---
title: "Exam: Objects & Classes"
part: Core Course Exams
summary: Quizzes and integrative challenges on classes, dunder protocols, dataclasses and enums.
minutes: 55
---

This exam covers the Objects & Classes part of the core course: [Classes & Objects](lesson:classes), [Dunder Methods](lesson:dunder-methods) and [Dataclasses, NamedTuples & Enums](lesson:dataclasses-and-enums). Every quiz runs real code, so commit to an answer before you reveal it: the ones you miss show which sections deserve a second read, and each section ends with a pointer to them. The final challenges are bigger than the lessons' own, and each one needs more than one lesson: a dataclass with operators, an enum-driven workflow, a class that plugs into the container protocols, and an abstract base class that registers its subclasses.

## Attributes, methods and privacy

Where an attribute lives decides who sees a change to it.

:::quiz output
What does this print?

```python
class Config:
    retries = 3

a, b = Config(), Config()
b.retries = 5
Config.retries = 10
print(a.retries, b.retries)
```

- [ ] `3 5`
- [x] `10 5`
- [ ] `10 10`
- [ ] `3 10`

Reading `a.retries` checks the instance, finds nothing, and falls back to the class **at the moment of the read**, so `a` sees the new `10`. `b.retries = 5` created an instance attribute that shadows the class one, so `b` keeps its own value. Nothing is copied at construction time: it's a live prototype chain.
:::

:::quiz output
What does this print?

```python
class Greeter:
    def __init__(self, name):
        self.name = name

    def greet(self):
        return f"hi {self.name}"

ada = Greeter("Ada")
say = ada.greet
ada.name = "Augusta"
print(say())
```

- [ ] `hi Ada`
- [x] `hi Augusta`
- [ ] `TypeError`
- [ ] `AttributeError`

`ada.greet` is a bound method: it holds the function plus a reference to `ada` itself, not a snapshot of its attributes. Calling it later passes that same object as `self`, which by then has the new name. And unlike `const say = ada.greet` in JavaScript, there's no `this` to lose.
:::

:::quiz output
What does this print?

```python
class Base:
    def __init__(self):
        self.__token = "base"

class Child(Base):
    def __init__(self):
        super().__init__()
        self.__token = "child"

print(sorted(vars(Child())))
```

- [ ] `['__token']`
- [ ] `['_Child__token']`
- [x] `['_Base__token', '_Child__token']`
- [ ] `['_Base__token']`

Inside a class body, `__token` is rewritten to `_ClassName__token`, using the class whose body contains the code. `Base.__init__` writes `_Base__token` and `Child.__init__` writes `_Child__token`, so the two can't collide. That's what mangling is for: stopping a subclass from overwriting its parent's internals by accident. It isn't privacy, since both attributes are one `vars()` call away.
:::

:::quiz output
What does this print?

```python
from functools import cached_property

class Report:
    def __init__(self, rows):
        self.rows = rows

    @cached_property
    def total(self):
        return sum(self.rows)

report = Report([1, 2])
first = report.total
report.rows = [10, 20]
print(report.total, "total" in vars(report))
```

- [ ] `30 True`
- [x] `3 True`
- [ ] `30 False`
- [ ] `3 False`

The first read ran the method and stored `3` in the instance's `__dict__` under the name `total`, where every later read finds it. Nothing watches `rows`, so the value stays stale until you `del report.total`. Use a plain `@property` when the inputs can change.
:::

Review: [Classes & Objects](lesson:classes), especially [class attributes](lesson:classes#class-attributes-vs-instance-attributes), [bound methods](lesson:classes#methods-are-bound-to-their-instance), [name mangling](lesson:classes#privacy-by-convention) and [`cached_property`](lesson:classes#properties-instead-of-get-and-set).

## Inheritance and abstract classes

`super()` and `ABC` both do less, and later, than their JavaScript look-alikes.

:::quiz output
What does this print?

```python
class Base:
    def setup(self):
        return ["base"]

class Logging(Base):
    def setup(self):
        return ["logging", *super().setup()]

class Metrics(Base):
    def setup(self):
        return ["metrics"]

class App(Logging, Metrics):
    pass

print(App().setup())
```

- [ ] `['logging', 'base']`
- [ ] `['logging', 'metrics', 'base']`
- [x] `['logging', 'metrics']`
- [ ] `['metrics', 'logging', 'base']`

The MRO is `App, Logging, Metrics, Base, object`. `super()` inside `Logging` means "the next class in the MRO of this object's type", which is `Metrics`, not `Base`. `Metrics.setup` doesn't call `super()`, so the chain stops there and `Base.setup` never runs. Cooperative inheritance only works when every link hands off.
:::

:::quiz output
What happens?

```python
from abc import ABC, abstractmethod

class Exporter(ABC):
    @abstractmethod
    def export(self, rows): ...

    def run(self, rows):
        return f"exported {self.export(rows)}"

class CsvExporter(Exporter):
    def export_rows(self, rows):
        return len(rows)

print(CsvExporter().run([1, 2]))
```

- [ ] `exported 2`
- [ ] `AttributeError`
- [ ] `NotImplementedError`
- [x] `TypeError`

The misspelled `export_rows` doesn't override `export`, so `CsvExporter` is still abstract. Defining the class is fine; **calling** it raises `TypeError: Can't instantiate abstract class CsvExporter without an implementation for abstract method 'export'`. Without `ABC`, the inherited `...` stub would have run and quietly returned `None`.
:::

Review: [Classes & Objects](lesson:classes), especially [the MRO and `super()`](lesson:classes#multiple-inheritance-and-mixins) and [abstract base classes](lesson:classes#abstract-base-classes-and-duck-typing).

## Protocols: truthiness, indexing and attribute fallbacks

Built-ins call your dunder methods, and they assume you follow the rules.

:::quiz output
What does this print?

```python
class Inbox:
    def __init__(self, messages):
        self.messages = messages

    def __len__(self):
        return len(self.messages)

inbox = Inbox([])
print("new mail" if inbox else "empty", inbox is not None)
```

- [ ] `new mail True`
- [x] `empty True`
- [ ] `empty False`
- [ ] `new mail False`

`if inbox:` doesn't ask whether there's an inbox. With no `__bool__`, truthiness falls back to `__len__`, and this inbox has length `0`. It's the same rule that makes empty lists falsy, and the reason `if obj:` is the wrong test for "not `None`". Write `if inbox is not None:` when that's what you mean.
:::

:::quiz output
What does this print?

```python
class Echo:
    def __getitem__(self, key):
        return key

e = Echo()
print(e[1:3], e["a", 2])
```

- [ ] `[1, 2] ['a', 2]`
- [x] `slice(1, 3, None) ('a', 2)`
- [ ] `(1, 3) ('a', 2)`
- [ ] `TypeError`

Whatever sits between the brackets reaches `__getitem__` as **one** object. `1:3` becomes a `slice` object, and `"a", 2` becomes a tuple, because the comma makes the tuple. That's how a single method serves indexes, slices and `grid[x, y]` keys. Delegating to a list handles slices for you; anything else has to check `isinstance(key, slice)`.
:::

:::quiz output
What happens?

```python
class Config:
    def __init__(self, settings):
        self._settings = settings

    def __getattr__(self, name):
        return self._settings[name]

cfg = Config({"debug": True})
print(getattr(cfg, "timeout", 30))
```

- [ ] `30`
- [ ] `None`
- [ ] `AttributeError`
- [x] `KeyError`

`getattr(obj, name, default)` returns the default only when the lookup raises `AttributeError`. This `__getattr__` lets the dict's `KeyError` escape, so the "safe" call crashes, and `hasattr` breaks the same way. Translate the error inside `__getattr__`: `raise AttributeError(name) from None`.
:::

Review: [Dunder Methods](lesson:dunder-methods), especially [truthiness](lesson:dunder-methods#truthiness-and-callables), [the container protocols](lesson:dunder-methods#container-protocols) and [`__getattr__`](lesson:dunder-methods#attribute-hooks-getattr).

## Operators and comparisons

Every operator is a negotiation between two objects, and either side can decline.

:::quiz output
What does this print?

```python
class Celsius:
    def __init__(self, degrees):
        self.degrees = degrees

    def __eq__(self, other):
        if isinstance(other, (int, float)):
            return self.degrees == other
        return NotImplemented

print(Celsius(20) == 20, 20 == Celsius(20))
```

- [x] `True True`
- [ ] `True False`
- [ ] `False False`
- [ ] `TypeError`

For `20 == Celsius(20)`, Python asks `int.__eq__` first, and it returns `NotImplemented` for a type it doesn't know. Python then tries the **reflected** comparison, `Celsius(20).__eq__(20)`, which answers `True`. Returning `NotImplemented` rather than `False` is what gives the other operand its turn.
:::

:::quiz output
What happens?

```python
class Money:
    def __init__(self, cents):
        self.cents = cents

    def __add__(self, other):
        return Money(self.cents + other.cents)

print(sum([Money(100), Money(250)]).cents)
```

- [ ] `350`
- [ ] `AttributeError`
- [x] `TypeError`
- [ ] `0`

`sum()` starts from `0`, so its first step is `0 + Money(100)`. `int.__add__` declines, Python looks for `Money.__radd__`, finds none, and raises `TypeError: unsupported operand type(s) for +: 'int' and 'Money'`. Your `__add__` never runs, so it never gets the chance to fail on `0.cents`. Pass a start value, `sum(wallet, Money(0))`, or handle `0` in `__radd__`.
:::

:::quiz output
What does this print?

```python
class Tally:
    def __init__(self, n=0):
        self.n = n

    def __add__(self, other):
        return Tally(self.n + other)

score = Tally()
alias = score
score += 5
print(score.n, alias.n, score is alias)
```

- [ ] `5 5 True`
- [x] `5 0 False`
- [ ] `5 0 True`
- [ ] `TypeError`

Without `__iadd__`, `score += 5` falls back to `score = score + 5`: `__add__` builds a new `Tally`, and only the name `score` is rebound. `alias` still points at the original. Define `__iadd__`, mutating and then returning `self`, when `+=` should change the object in place the way it does for lists.
:::

:::quiz output
What happens?

```python
class Version:
    def __init__(self, n):
        self.n = n

    def __lt__(self, other):
        return self.n < other.n

print(Version(1) <= Version(2))
```

- [ ] `True`
- [ ] `False`
- [x] `TypeError`
- [ ] `NotImplemented`

Python pairs each comparison with its mirror image, `<` with `>` and `<=` with `>=`, so `__lt__` alone answers both `a < b` and `b > a`. Nothing derives `<=` from `<` and `==`: both operands decline, and Python raises `TypeError: '<=' not supported between instances of 'Version' and 'Version'`. `@functools.total_ordering` fills in the rest from `__eq__` plus one ordering method.
:::

Review: [Dunder Methods](lesson:dunder-methods), especially [equality and `NotImplemented`](lesson:dunder-methods#equality-and-hashing), [ordering](lesson:dunder-methods#ordering-with-total-ordering), and [operators, including `+=`](lesson:dunder-methods#operator-overloading).

## Dataclasses

The decorator writes the boilerplate, from rules you have to know.

:::quiz output
What does this print?

```python
from dataclasses import dataclass

@dataclass
class Order:
    id: int
    status = "new"
    total: float = 0.0

print(Order(7, "paid"))
```

- [ ] `Order(id=7, status='paid', total=0.0)`
- [x] `Order(id=7, total='paid')`
- [ ] `TypeError`
- [ ] `Order(id=7, status='new', total='paid')`

Only **annotated** names become fields. `status = "new"` is a plain class attribute, so the generated `__init__` takes `(id, total)` and `"paid"` lands in `total`, where nothing checks the `float` annotation either. Write `status: str = "new"` to make it a field.
:::

:::quiz output
What happens?

```python
from dataclasses import dataclass

@dataclass
class Cart:
    owner: str
    items: list = []

print(Cart("ada"))
```

- [ ] `Cart(owner='ada', items=[])`
- [x] `ValueError`
- [ ] `TypeError`
- [ ] `AttributeError`

A default in the class body is created once and would be shared by every instance, so `@dataclass` rejects list, dict and set defaults as soon as the class is created: `ValueError: mutable default <class 'list'> for field items is not allowed: use default_factory`. `items: list = field(default_factory=list)` gives each instance a fresh list, which is what a JavaScript class field does.
:::

:::quiz output
What does this print?

```python
from dataclasses import dataclass, field, replace

@dataclass
class Invoice:
    items: list[float]
    total: float = field(init=False)

    def __post_init__(self):
        self.total = sum(self.items)

bill = Invoice([10.0, 5.0])
bill.items.append(20.0)
print(bill.total, replace(bill).total)
```

- [ ] `15.0 15.0`
- [ ] `35.0 35.0`
- [x] `15.0 35.0`
- [ ] `ValueError`

`__post_init__` runs once, at construction, so `total` is a snapshot; appending to `items` doesn't update it. `replace()` builds a new instance through `__init__`, sharing the same `items` list because the copy is shallow, so `__post_init__` runs again and sees all three items. Use a `@property` for values that must track their inputs.
:::

:::quiz output
What does this print?

```python
from dataclasses import dataclass, asdict

@dataclass
class Team:
    name: str
    members: list[str]

team = Team("core", ["ada"])
data = asdict(team)
data["members"].append("linus")
print(team.members)
```

- [x] `['ada']`
- [ ] `['ada', 'linus']`
- [ ] `TypeError`
- [ ] `None`

`asdict()` recurses into the fields and copies as it goes, so `data["members"]` is a new list, and editing the dict can't reach back into the dataclass. `replace()` is the opposite: shallow, so the fields you don't change share their objects with the original.
:::

Review: [Dataclasses, NamedTuples & Enums](lesson:dataclasses-and-enums), especially [fields](lesson:dataclasses-and-enums#dataclass-a-class-from-its-fields), [defaults](lesson:dataclasses-and-enums#defaults-and-field), [`__post_init__`](lesson:dataclasses-and-enums#validation-with-post-init), [`replace()`](lesson:dataclasses-and-enums#frozen-dataclasses) and [`asdict()`](lesson:dataclasses-and-enums#asdict-and-json).

## Enums

Members are objects of their own type, not the strings they hold.

:::quiz output
What happens?

```python
from enum import Enum

class Status(Enum):
    ACTIVE = "active"
    BANNED = "banned"

print(Status["ACTIVE"] is Status("active"), Status("ACTIVE"))
```

- [ ] `True Status.ACTIVE`
- [ ] `False Status.ACTIVE`
- [ ] `KeyError`
- [x] `ValueError`

Brackets look members up by **name**, parentheses by **value**. The first comparison would be `True`, since each member is a singleton, but `Status("ACTIVE")` asks for a member whose value is `"ACTIVE"`, and there isn't one: `ValueError: 'ACTIVE' is not a valid Status`. A failed lookup by name, such as `Status["active"]`, is the one that raises `KeyError`.
:::

:::quiz output
What happens?

```python
import json
from enum import Enum, StrEnum

class Plan(StrEnum):
    FREE = "free"

class Tier(Enum):
    GOLD = "gold"

print(json.dumps([Plan.FREE, Tier.GOLD]))
```

- [ ] `["free", "gold"]`
- [ ] `["free", "Tier.GOLD"]`
- [x] `TypeError`
- [ ] `["Plan.FREE", "Tier.GOLD"]`

A `StrEnum` member **is** a `str`, so `json` writes it as `"free"`. A plain `Enum` member is an instance of its own class, and `json.dumps` raises `TypeError: Object of type Tier is not JSON serializable`. Serialize `.value`, or use a `StrEnum` for values that cross a JSON boundary.
:::

Review: [Dataclasses, NamedTuples & Enums](lesson:dataclasses-and-enums), especially [enum lookups](lesson:dataclasses-and-enums#enums) and [`StrEnum`](lesson:dataclasses-and-enums#auto-strenum-and-intenum).

## Final challenges

:::challenge id=exam-oop-money title="Money that adds up" difficulty=easy
Write `Money`, an immutable value for an amount in cents:

- `Money(cents, currency="USD")` is a **frozen dataclass**, so equal amounts are `==`, hash equal, and work as dict keys and set members.
- `a + b` returns a new `Money`. Adding two different currencies raises `ValueError`, and adding anything else raises `TypeError`: return `NotImplemented` rather than guessing.
- The one exception is `0 + money`, which returns `money`, so that `sum(wallet)` works without a start value.
- `str(Money(1250, "EUR"))` is `"12.50 EUR"`, while `repr()` stays the one the dataclass generates.

```js
class Money {
  constructor(cents, currency = "USD") {
    Object.assign(this, { cents, currency });
    Object.freeze(this);
  }
  add(other) {
    if (other.currency !== this.currency) throw new RangeError("currency mismatch");
    return new Money(this.cents + other.cents, this.currency);
  }
  toString() {
    return `${(this.cents / 100).toFixed(2)} ${this.currency}`;
  }
}

wallet.reduce((total, m) => total.add(m));
```

```python starter
class Money:
    def __init__(self, cents, currency="USD"):
        self.cents = cents
        self.currency = currency
```

```python solution
from dataclasses import dataclass, replace


@dataclass(frozen=True)
class Money:
    cents: int
    currency: str = "USD"

    def __str__(self):
        return f"{self.cents / 100:.2f} {self.currency}"

    def __add__(self, other):
        if not isinstance(other, Money):
            return NotImplemented
        if other.currency != self.currency:
            raise ValueError(f"can't add {other.currency} to {self.currency}")
        return replace(self, cents=self.cents + other.cents)

    def __radd__(self, other):
        if other == 0:              # sum() starts from 0
            return self
        return NotImplemented
```

```python tests
import dataclasses

@test("stores cents and a currency that defaults to USD")
def _():
    price = Money(1250, "EUR")
    eq((price.cents, price.currency), (1250, "EUR"))
    eq(Money(5).currency, "USD")

@test("is a frozen dataclass, equal and hashable by value")
def _():
    check(dataclasses.is_dataclass(Money), "decorate Money with @dataclass(frozen=True)")
    with raises(AttributeError):
        Money(5).cents = 10
    eq(Money(5), Money(5, "USD"))
    eq(len({Money(5), Money(5, "USD"), Money(5, "EUR")}), 2)

@test("adds amounts in the same currency")
def _():
    price, fee = Money(1250, "EUR"), Money(50, "EUR")
    eq(price + fee, Money(1300, "EUR"))
    eq(price, Money(1250, "EUR"), "+ must return a new Money")

@test("refuses to mix currencies")
def _():
    raises(ValueError, lambda: Money(100, "EUR") + Money(100, "USD"))

@test("other operands raise TypeError")
def _():
    raises(TypeError, lambda: Money(100) + 5)
    raises(TypeError, lambda: 1 + Money(100))
    raises(TypeError, lambda: "5" + Money(100))

@test("sum() works without a start value")
def _():
    eq(sum([Money(100), Money(250), Money(5)]), Money(355))
    eq(sum([Money(1, "EUR")]), Money(1, "EUR"))

@test("str() shows the amount, repr() is the dataclass one")
def _():
    eq(str(Money(1250, "EUR")), "12.50 EUR")
    eq(f"{Money(5)}", "0.05 USD")
    eq(repr(Money(5)), "Money(cents=5, currency='USD')")
```

```hint
`@dataclass(frozen=True)` writes `__init__`, `__repr__`, `__eq__` and a matching `__hash__`. You write `__str__` and the operators.
```

```hint
In `__add__`, return `NotImplemented` for anything that isn't a `Money`, and Python raises the `TypeError` itself. `dataclasses.replace(self, cents=...)` builds the result.
```

```hint
`sum()` computes `0 + first_item`, which ends up in `__radd__(0)`. Return `self` when `other == 0`, and `NotImplemented` otherwise.
```
:::

:::challenge id=exam-oop-ticket-workflow title="A ticket workflow" difficulty=medium
Model support tickets with an enum and a dataclass.

- `Status` is a `StrEnum` (3.11+) with the members `OPEN`, `IN_PROGRESS`, `BLOCKED` and `DONE`, whose values are the lowercase names (`"in_progress"`).
- The allowed moves are open → in progress, in progress → blocked, in progress → done, and blocked → in progress. Nothing leaves done. `status.can_move_to(other)` says whether a move is allowed.
- `Ticket` is a dataclass with `title: str`, `status: Status` (default `Status.OPEN`) and `history: list[Status]`, which starts empty and is never shared between tickets.
- Creating a ticket strips the title and raises `ValueError` if nothing is left. It also accepts a status as a plain string, `Ticket("Fix login", "blocked")`, converting it to a `Status` and raising `ValueError` for unknown values.
- `ticket.move_to(status)` takes a `Status` or its string value. It raises `ValueError` for a move the workflow doesn't allow, leaving the ticket unchanged. Otherwise it appends the old status to `history` and sets the new one.

```js
const Status = Object.freeze({ OPEN: "open", IN_PROGRESS: "in_progress", BLOCKED: "blocked", DONE: "done" });
const ALLOWED = { open: ["in_progress"], in_progress: ["blocked", "done"], blocked: ["in_progress"], done: [] };

class Ticket {
  constructor(title, status = Status.OPEN) {
    this.title = title.trim();
    if (!this.title) throw new Error("a ticket needs a title");
    if (!Object.values(Status).includes(status)) throw new Error(`unknown status ${status}`);
    this.status = status;
    this.history = [];
  }
  moveTo(status) {
    if (!ALLOWED[this.status].includes(status)) throw new Error(`can't move to ${status}`);
    this.history.push(this.status);
    this.status = status;
  }
}
```

```python starter
from dataclasses import dataclass, field
from enum import StrEnum, auto


class Status:
    ...


@dataclass
class Ticket:
    title: str
    status: str = "open"
```

```python solution
from dataclasses import dataclass, field
from enum import StrEnum, auto


class Status(StrEnum):
    OPEN = auto()
    IN_PROGRESS = auto()
    BLOCKED = auto()
    DONE = auto()

    def can_move_to(self, other):
        return other in ALLOWED_MOVES[self]


ALLOWED_MOVES = {
    Status.OPEN: {Status.IN_PROGRESS},
    Status.IN_PROGRESS: {Status.BLOCKED, Status.DONE},
    Status.BLOCKED: {Status.IN_PROGRESS},
    Status.DONE: set(),
}


@dataclass
class Ticket:
    title: str
    status: Status = Status.OPEN
    history: list[Status] = field(default_factory=list)

    def __post_init__(self):
        self.title = self.title.strip()
        if not self.title:
            raise ValueError("a ticket needs a title")
        self.status = Status(self.status)

    def move_to(self, status):
        status = Status(status)
        if not self.status.can_move_to(status):
            raise ValueError(f"can't move from {self.status} to {status}")
        self.history.append(self.status)
        self.status = status
```

```python tests
import dataclasses

@test("Status is a StrEnum with lowercase values")
def _():
    eq([s.value for s in Status], ["open", "in_progress", "blocked", "done"])
    check(isinstance(Status.DONE, str), "Status members should be strings: use StrEnum")
    check(Status("blocked") is Status.BLOCKED, "Status('blocked') should return the BLOCKED member")

@test("can_move_to follows the workflow")
def _():
    moves = {status: {target for target in Status if status.can_move_to(target)} for status in Status}
    eq(moves, {
        Status.OPEN: {Status.IN_PROGRESS},
        Status.IN_PROGRESS: {Status.BLOCKED, Status.DONE},
        Status.BLOCKED: {Status.IN_PROGRESS},
        Status.DONE: set(),
    })

@test("Ticket is a dataclass with three fields")
def _():
    check(dataclasses.is_dataclass(Ticket), "decorate Ticket with @dataclass")
    eq([f.name for f in dataclasses.fields(Ticket)], ["title", "status", "history"])

@test("a new ticket starts open, with a history of its own")
def _():
    first, second = Ticket("Fix login"), Ticket("Update docs")
    check(first.status is Status.OPEN, f"expected Status.OPEN, got {first.status!r}")
    first.history.append(Status.OPEN)
    eq(second.history, [], "history is shared: use field(default_factory=list)")

@test("cleans the title and converts a string status")
def _():
    eq(Ticket("  Fix login  ").title, "Fix login")
    ticket = Ticket("Fix login", "blocked")
    check(ticket.status is Status.BLOCKED, f"expected Status.BLOCKED, got {ticket.status!r}")

@test("rejects an empty title and an unknown status")
def _():
    raises(ValueError, Ticket, "   ")
    raises(ValueError, Ticket, "Fix login", "closed")

@test("move_to changes the status and records the old one")
def _():
    ticket = Ticket("Fix login")
    ticket.move_to(Status.IN_PROGRESS)
    ticket.move_to("blocked")
    ticket.move_to("in_progress")
    ticket.move_to(Status.DONE)
    check(ticket.status is Status.DONE, f"expected Status.DONE, got {ticket.status!r}")
    eq(ticket.history, [Status.OPEN, Status.IN_PROGRESS, Status.BLOCKED, Status.IN_PROGRESS])

@test("an illegal move raises ValueError and changes nothing")
def _():
    ticket = Ticket("Fix login")
    raises(ValueError, ticket.move_to, Status.DONE)
    raises(ValueError, ticket.move_to, "archived")
    check(ticket.status is Status.OPEN, "a rejected move must keep the old status")
    eq(ticket.history, [], "a rejected move must not be recorded")

@test("done is final")
def _():
    ticket = Ticket("Fix login", "in_progress")
    ticket.move_to("done")
    for status in Status:
        raises(ValueError, ticket.move_to, status)
```

```hint
With `auto()`, a `StrEnum` member's value is its lowercased name. Methods defined on an enum receive the member as `self`, and a module-level dict defined after the class can map each status to the set it may move to.
```

```hint
`Status(value)` converts a string and raises `ValueError` for unknown values. Called with a member, it returns the member itself, so `__post_init__` and `move_to` can both normalise their input with it.
```

```hint
`history: list[Status] = field(default_factory=list)` gives each ticket its own list. In `move_to`, check the move before changing anything, then append the old status and assign the new one.
```
:::

:::challenge id=exam-oop-inventory title="An inventory that acts like a container" difficulty=medium
Write `Inventory`, a stock count per SKU that plugs into Python's protocols instead of exposing `get`/`set`/`has` methods:

- `Inventory(stock=None)` takes an optional dict of starting quantities and copies it. Starting stock follows the same rules as assignment.
- `inv["tea"]` is the quantity, and `0` for an unknown SKU rather than a `KeyError`.
- `inv["tea"] = 5` sets a quantity. Setting `0` removes the SKU, and a negative quantity raises `ValueError`.
- `"tea" in inv` and `len(inv)` count only SKUs in stock, so an empty inventory is falsy.
- Iterating yields the SKUs in alphabetical order.
- `inv += {"tea": 2, "mug": 1}` adds stock **in place**, so every name for the inventory sees it. Adding anything other than a dict raises `TypeError`.
- `repr(inv)` looks like `Inventory({'mug': 1, 'tea': 5})`, sorted by SKU.

```js
class Inventory {
  #stock = new Map();
  get(sku) { return this.#stock.get(sku) ?? 0; }
  set(sku, qty) {
    if (qty < 0) throw new RangeError("negative stock");
    qty === 0 ? this.#stock.delete(sku) : this.#stock.set(sku, qty);
  }
  has(sku) { return this.#stock.has(sku); }
  get size() { return this.#stock.size; }
  *[Symbol.iterator]() { yield* [...this.#stock.keys()].sort(); }
  addAll(delta) {
    for (const [sku, qty] of Object.entries(delta)) this.set(sku, this.get(sku) + qty);
    return this;
  }
}
```

```python starter
class Inventory:
    def __init__(self, stock=None):
        self.stock = dict(stock or {})
```

```python solution
class Inventory:
    def __init__(self, stock=None):
        self._stock = {}
        for sku, quantity in (stock or {}).items():
            self[sku] = quantity

    def __repr__(self):
        return f"Inventory({dict(sorted(self._stock.items()))!r})"

    def __getitem__(self, sku):
        return self._stock.get(sku, 0)

    def __setitem__(self, sku, quantity):
        if quantity < 0:
            raise ValueError(f"negative stock for {sku!r}: {quantity}")
        if quantity == 0:
            self._stock.pop(sku, None)
        else:
            self._stock[sku] = quantity

    def __contains__(self, sku):
        return sku in self._stock

    def __len__(self):
        return len(self._stock)

    def __iter__(self):
        return iter(sorted(self._stock))

    def __iadd__(self, other):
        if not isinstance(other, dict):
            return NotImplemented
        for sku, quantity in other.items():
            self[sku] += quantity
        return self
```

```python tests
@test("reads quantities, and 0 for unknown SKUs")
def _():
    inv = Inventory({"tea": 3})
    eq(inv["tea"], 3)
    eq(inv["jam"], 0, "an unknown SKU has no stock: return 0 instead of raising KeyError")

@test("sets quantities; 0 removes the SKU and negatives raise")
def _():
    inv = Inventory({"tea": 3, "mug": 1})
    inv["tea"] = 5
    eq(inv["tea"], 5)
    inv["mug"] = 0
    check("mug" not in inv, "setting 0 should remove the SKU")
    with raises(ValueError):
        inv["tea"] = -1
    eq(inv["tea"], 5, "a rejected assignment must keep the old quantity")

@test("in, len() and truthiness count only SKUs in stock")
def _():
    inv = Inventory({"tea": 2, "jam": 0})
    eq(len(inv), 1)
    check("tea" in inv and "jam" not in inv, "only SKUs with stock are in the inventory")
    check(inv, "an inventory with stock should be truthy")
    check(not Inventory(), "an empty inventory should be falsy")

@test("the constructor validates and copies its input")
def _():
    raises(ValueError, Inventory, {"tea": -2})
    stock = {"tea": 3}
    inv = Inventory(stock)
    stock["tea"] = 99
    eq(inv["tea"], 3, "copy the starting stock in __init__")

@test("inventories don't share state")
def _():
    first, second = Inventory(), Inventory()
    first["tea"] = 1
    eq(second["tea"], 0, "create the dict in __init__, not in the class body or a default argument")

@test("iterates over SKUs in alphabetical order")
def _():
    eq(list(Inventory({"tea": 1, "mug": 2, "jam": 3})), ["jam", "mug", "tea"])

@test("+= adds stock in place")
def _():
    inv = Inventory({"tea": 1})
    alias = inv
    inv += {"tea": 2, "mug": 1}
    check(inv is alias, "+= should mutate the inventory and return self")
    eq((alias["tea"], alias["mug"]), (3, 1))

@test("+= with something other than a dict raises TypeError")
def _():
    inv = Inventory({"tea": 1})
    with raises(TypeError):
        inv += 5

@test("repr shows the stock sorted by SKU")
def _():
    eq(repr(Inventory({"tea": 5, "mug": 1})), "Inventory({'mug': 1, 'tea': 5})")
    eq(repr(Inventory()), "Inventory({})")
```

```hint
Keep the quantities in a dict created in `__init__`. Feed the starting stock through `self[sku] = quantity` so the constructor gets the same validation as assignment.
```

```hint
`__getitem__`, `__setitem__`, `__contains__`, `__len__` and `__iter__` back `inv[sku]`, `inv[sku] = n`, `in`, `len()` and `for`. `__len__` also drives truthiness, and `__iter__` can return `iter(sorted(...))`.
```

```hint
`inv += other` calls `__iadd__` and rebinds `inv` to whatever it returns, so mutate the inventory and `return self`. Return `NotImplemented` for anything that isn't a dict, and Python raises the `TypeError`.
```
:::

:::challenge id=exam-oop-shape-registry title="Shapes that register themselves" difficulty=hard
Build the plugin pattern that serializers and ORMs use: subclasses register themselves, and a factory builds the right one from plain data.

- `Shape` is an abstract base class. Each subclass names its kind in the class statement, as in `class Circle(Shape, kind="circle")`, and `Shape.__init_subclass__` records it in `Shape.registry`, a dict mapping kinds to classes. Leaving out `kind` raises `TypeError`, and a kind that's already registered raises `ValueError`.
- Every shape has an abstract `area()` method, so instantiating `Shape`, or a subclass that doesn't implement `area`, raises `TypeError`.
- `Circle(radius)` and `Rect(width, height)` are dataclasses that subclass `Shape`, and their reprs show only their own fields: `Rect(width=2, height=3)`.
- `Shape.from_dict(data)` is a class method that looks up `data["kind"]` and builds that class from the remaining keys: `{"kind": "rect", "width": 2, "height": 3}` becomes `Rect(width=2, height=3)`. A missing or unknown kind raises `ValueError`, and the input dict is never modified.
- `shape.to_dict()` is the reverse, so `Shape.from_dict(shape.to_dict()) == shape`.

```js
const registry = new Map();

class Shape {
  static register(kind, cls) {
    registry.set(kind, cls);
    cls.kind = kind;
  }
  static fromJSON({ kind, ...props }) {
    const cls = registry.get(kind);
    if (!cls) throw new Error(`unknown kind ${kind}`);
    return Object.assign(new cls(), props);
  }
}

class Circle extends Shape { /* ... */ }
Shape.register("circle", Circle);
```

```python starter
import math
from abc import ABC, abstractmethod
from dataclasses import asdict, dataclass


class Shape(ABC):
    registry = {}


@dataclass
class Circle(Shape):
    radius: float

    def area(self):
        return math.pi * self.radius ** 2


@dataclass
class Rect(Shape):
    width: float
    height: float

    def area(self):
        return self.width * self.height
```

```python solution
import math
from abc import ABC, abstractmethod
from dataclasses import asdict, dataclass


class Shape(ABC):
    registry = {}

    def __init_subclass__(cls, kind, **kwargs):
        super().__init_subclass__(**kwargs)
        if kind in Shape.registry:
            raise ValueError(f"shape kind {kind!r} is already registered")
        cls.kind = kind
        Shape.registry[kind] = cls

    @abstractmethod
    def area(self): ...

    @classmethod
    def from_dict(cls, data):
        fields = dict(data)
        kind = fields.pop("kind", None)
        try:
            shape_class = Shape.registry[kind]
        except KeyError:
            raise ValueError(f"unknown shape kind {kind!r}") from None
        return shape_class(**fields)

    def to_dict(self):
        return {"kind": self.kind, **asdict(self)}


@dataclass
class Circle(Shape, kind="circle"):
    radius: float

    def area(self):
        return math.pi * self.radius ** 2


@dataclass
class Rect(Shape, kind="rect"):
    width: float
    height: float

    def area(self):
        return self.width * self.height
```

```python tests
import dataclasses
import math

@test("Circle and Rect compute their areas")
def _():
    approx(Circle(1).area(), math.pi)
    eq(Rect(2, 3).area(), 6)

@test("subclasses register themselves by kind")
def _():
    check(Shape.registry.get("circle") is Circle, "Shape.registry['circle'] should be Circle")
    check(Shape.registry.get("rect") is Rect, "Shape.registry['rect'] should be Rect")

@test("new subclasses register too, and from_dict can build them")
def _():
    @dataclasses.dataclass
    class Square(Shape, kind="square"):
        side: float

        def area(self):
            return self.side ** 2

    check(Shape.registry.get("square") is Square, "registration should happen in __init_subclass__")
    eq(Shape.from_dict({"kind": "square", "side": 3}), Square(3))

@test("a missing or duplicate kind is rejected")
def _():
    with raises(TypeError):
        class Nameless(Shape):
            def area(self):
                return 0
    with raises(ValueError):
        class Imposter(Shape, kind="circle"):
            def area(self):
                return 0
    check(Shape.registry["circle"] is Circle, "the original registration must survive")

@test("Shape and incomplete subclasses can't be instantiated")
def _():
    raises(TypeError, Shape)
    class Blob(Shape, kind="blob"):
        pass
    raises(TypeError, Blob)

@test("from_dict builds the registered class")
def _():
    shape = Shape.from_dict({"kind": "rect", "width": 2, "height": 3})
    check(type(shape) is Rect, f"expected a Rect, got {type(shape).__name__}")
    eq(shape, Rect(2, 3))

@test("from_dict rejects unknown kinds and leaves its input alone")
def _():
    raises(ValueError, Shape.from_dict, {"kind": "hexagon", "side": 1})
    raises(ValueError, Shape.from_dict, {"radius": 1})
    data = {"kind": "circle", "radius": 2}
    Shape.from_dict(data)
    eq(data, {"kind": "circle", "radius": 2}, "copy the dict before taking 'kind' out")

@test("to_dict round-trips through from_dict")
def _():
    eq(Rect(2, 3).to_dict(), {"kind": "rect", "width": 2, "height": 3})
    eq(Shape.from_dict(Circle(1.5).to_dict()), Circle(1.5))

@test("kind isn't a dataclass field")
def _():
    eq([f.name for f in dataclasses.fields(Rect)], ["width", "height"])
    eq(repr(Rect(2, 3)), "Rect(width=2, height=3)")
```

```hint
`def __init_subclass__(cls, kind, **kwargs):` receives the keyword from the class statement, and a required parameter makes a missing `kind` a `TypeError` for free. Call `super().__init_subclass__(**kwargs)`, then store the class in `Shape.registry`. That one shared dict is the rare class attribute you *want* every subclass to share.
```

```hint
Decorate `area` with `@abstractmethod`. `ABC` then refuses to instantiate `Shape`, and any subclass that doesn't override it, with a `TypeError`.
```

```hint
In `from_dict`, copy the dict, `pop("kind", None)` from the copy, translate the registry's `KeyError` into `ValueError`, and call the class with `**fields`. Set `cls.kind = kind` in `__init_subclass__`: a plain class attribute without an annotation isn't a dataclass field, so `to_dict()` can return `{"kind": self.kind, **asdict(self)}`.
```
:::
