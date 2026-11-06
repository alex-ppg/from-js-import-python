---
title: "Dunder Methods: Python's Protocols"
part: Objects & Classes
summary: How len(), ==, +, [], in and for call your methods, and how to make your own objects feel built in.
minutes: 40
---

JavaScript lets objects hook into the language through a handful of well-known symbols and legacy methods: `[Symbol.iterator]` for `for...of`, `valueOf()` and `[Symbol.toPrimitive]` for coercion, `toString()` for string conversion. Python takes that idea all the way. Nearly every operator and built-in is a call to a **dunder** (double underscore) method: `len(x)` calls `x.__len__()`, `a + b` calls `a.__add__(b)`, `x[k]` calls `x.__getitem__(k)`, and `for` calls `__iter__`.

The mental-model shift: you don't give a class `size()`, `equals()` or `get(i)` methods. You implement the protocol, and the built-ins, the operators and the whole standard library treat your object like a native one. You define dunders, but you almost never call them: write `len(x)`, not `x.__len__()`.

## Syntax is a method call

:::compare
```js
class Span {
  constructor(start, end) {
    this.start = start;
    this.end = end;
  }
  *[Symbol.iterator]() {
    for (let i = this.start; i < this.end; i++) yield i;
  }
  get length() {
    return this.end - this.start;
  }
  toString() {
    return `${this.start}..${this.end}`;
  }
}

const span = new Span(1, 4);
[...span];       // [1, 2, 3]
span.length;     // 3
`${span}`;       // "1..4"
```
```python
class Span:
    def __init__(self, start, end):
        self.start = start
        self.end = end

    def __iter__(self):
        yield from range(self.start, self.end)

    def __len__(self):
        return self.end - self.start

    def __str__(self):
        return f"{self.start}..{self.end}"


span = Span(1, 4)
list(span)       # [1, 2, 3]
len(span)        # 3
f"{span}"        # "1..4"
```
:::

In JavaScript, `length` is just a property name, and only a few symbols are special. In Python, the name is the contract: `__len__` makes `len()` work, and it also makes `bool(span)` false for an empty span, because truthiness falls back to length. `__iter__` makes `list()`, `for`, unpacking, `in`, `sum()`, `max()` and `sorted()` work, since they all just iterate.

```python run
class Span:
    def __init__(self, start, end):
        self.start = start
        self.end = end

    def __iter__(self):
        yield from range(self.start, self.end)

    def __len__(self):
        return self.end - self.start

span = Span(1, 4)
print(list(span), len(span), sum(span), max(span))
print(2 in span, bool(Span(3, 3)))
first, *rest = span
print(first, rest)
```

:::deep Dunders are looked up on the class
When Python runs `len(obj)`, it calls `type(obj).__len__(obj)` and skips the instance entirely. Assigning `obj.__len__ = lambda: 5` therefore changes nothing (`len(obj)` still raises `TypeError` if the class lacks `__len__`), and the special-method machinery bypasses `__getattr__` too. It's a speed shortcut, and it keeps `hash(SomeClass)` from accidentally calling the method meant for its instances.
:::

## `__repr__` and `__str__`

:::compare
```js
class Money {
  constructor(cents) {
    this.cents = cents;
  }
  toString() {
    return `$${(this.cents / 100).toFixed(2)}`;
  }
  [Symbol.for("nodejs.util.inspect.custom")]() {
    return `Money(${this.cents})`;
  }
}

`${price}`;            // "$19.99"
console.log(price);    // Money(1999)
```
```python
class Money:
    def __init__(self, cents):
        self.cents = cents

    def __str__(self):
        return f"${self.cents / 100:.2f}"

    def __repr__(self):
        return f"Money({self.cents})"


f"{price}"             # "$19.99"
repr(price)            # "Money(1999)"
```
:::

Python has two string conversions, for two audiences:

- **`__repr__`** is for developers: unambiguous, and ideally valid Python that would recreate the object. The REPL, debuggers, `repr()`, `!r` and `=` in f-strings, and every container displaying its items use it.
- **`__str__`** is for end users. `print()`, `str()` and plain f-string interpolation use it, and it falls back to `__repr__` when you don't define it.

```python run
class Money:
    def __init__(self, cents):
        self.cents = cents

    def __str__(self):
        return f"${self.cents / 100:.2f}"

    def __repr__(self):
        return f"Money({self.cents})"

price = Money(1999)
print(price)                  # __str__
print([price, Money(5)])      # containers use __repr__ for their items
print(f"{price} vs {price!r}")
print(f"{price=}")            # the = specifier uses __repr__ too
```

:::gotcha Define `__repr__` first
Write only `__str__` and `print(x)` looks fine, but a list of them, a log line, an error message or a debugger still shows `<__main__.Money object at 0x...>`. Since `__str__` falls back to `__repr__`, one good `__repr__` covers both audiences. Add `__str__` only when users need a different, friendlier format.
:::

:::quiz output
What does this print?

```python
class Tag:
    def __init__(self, name):
        self.name = name

    def __str__(self):
        return f"#{self.name}"

    def __repr__(self):
        return f"Tag({self.name!r})"

print([Tag("python"), Tag("js")])
```

- [ ] `[#python, #js]`
- [x] `[Tag('python'), Tag('js')]`
- [ ] `['#python', '#js']`

`print()` calls `str()` on the list, and a list's string form shows its items with `repr()`. `__str__` would only be used by `print(tag)` on a single tag, or by `", ".join(str(t) for t in tags)`.
:::

## Equality and hashing

:::compare
```js
class Point {
  constructor(x, y) {
    this.x = x;
    this.y = y;
  }

  equals(other) {
    return other instanceof Point
      && this.x === other.x && this.y === other.y;
  }
}

new Point(1, 2) === new Point(1, 2);       // false, always
new Set([new Point(1, 2), new Point(1, 2)]).size;  // 2
```
```python
class Point:
    def __init__(self, x, y):
        self.x = x
        self.y = y

    def __eq__(self, other):
        if not isinstance(other, Point):
            return NotImplemented
        return (self.x, self.y) == (other.x, other.y)

    def __hash__(self):
        return hash((self.x, self.y))

Point(1, 2) == Point(1, 2)                 # True
len({Point(1, 2), Point(1, 2)})            # 1
```
:::

Without `__eq__`, `==` falls back to identity, like `===` on JS objects. Define it, and `==`, `in`, `list.index()`, `list.count()` and `dict` lookups all use it. You get `!=` for free: Python inverts `__eq__` unless you define `__ne__`.

Return `NotImplemented`, not `False`, when the other operand isn't a type you understand. That tells Python to ask the other operand's `__eq__` instead, and if both decline, to fall back to identity. So `Point(1, 2) == (1, 2)` is simply `False`, and a subclass or a different class still gets a say.

:::gotcha Defining `__eq__` makes instances unhashable
A class that defines `__eq__` without `__hash__` gets `__hash__ = None`, so its instances can't be set members or dict keys: Python raises `TypeError` with `unhashable type: 'Point'`. That's deliberate. Objects that compare equal must have equal hashes, and the default identity-based hash would break that rule. Hash a tuple of the **same fields** `__eq__` compares, and only for objects that won't change while they're inside a set or dict.
:::

```python run
class Point:
    def __init__(self, x, y):
        self.x = x
        self.y = y

    def __eq__(self, other):
        if not isinstance(other, Point):
            return NotImplemented
        return (self.x, self.y) == (other.x, other.y)

    def __hash__(self):
        return hash((self.x, self.y))

print(Point(1, 2) == Point(1, 2), Point(1, 2) != Point(3, 4))
print(Point(1, 2) == (1, 2))              # both sides decline: False
print(len({Point(1, 2), Point(1, 2)}))    # deduplicated
print({Point(0, 0): "origin"}[Point(0, 0)])
```

:::quiz output
What does this print?

```python
class Tag:
    def __init__(self, name):
        self.name = name

    def __eq__(self, other):
        return isinstance(other, Tag) and self.name == other.name

print(len({Tag("a"), Tag("a")}))
```

- [ ] `1`
- [ ] `2`
- [x] `TypeError`

`Tag` defines `__eq__` but not `__hash__`, so Python sets `__hash__` to `None` and the set literal can't hash its members. Add `def __hash__(self): return hash(self.name)` and the answer becomes `1`.
:::

:::tip Let a dataclass write these
`@dataclass` generates `__eq__` (and `__repr__`), and `@dataclass(frozen=True)` adds a matching `__hash__`. Hand-written versions are for when you need custom rules. See [Dataclasses](lesson:dataclasses-and-enums).
:::

## Ordering with `total_ordering`

:::compare
```js
class Version {
  // ...constructor parses this.parts
  compare(other) {
    for (let i = 0; i < 3; i++) {
      const diff = (this.parts[i] ?? 0) - (other.parts[i] ?? 0);
      if (diff) return diff;
    }
    return 0;
  }
}

versions.sort((a, b) => a.compare(b));
```
```python
@total_ordering
class Version:
    # ...__init__ parses self.parts, a tuple of ints
    def __eq__(self, other):
        return self.parts == other.parts

    def __lt__(self, other):
        return self.parts < other.parts



versions.sort()
```
:::

Define `__lt__` and `sorted()`, `list.sort()`, `min()`, `max()`, `heapq` and `bisect` all work with no comparator. Tuples compare item by item, so `self.parts < other.parts` replaces the whole loop.

Python also tries the **reflected** comparison: when `a > b` has no answer, it asks `b < a`. So `__lt__` alone gives you both `<` and `>`, but `<=` and `>=` still raise `TypeError`. `functools.total_ordering` fills in the missing methods from `__eq__` plus any one of `__lt__`, `__le__`, `__gt__` or `__ge__`.

```python run
from functools import total_ordering

@total_ordering
class Version:
    def __init__(self, text):
        self.text = text
        self.parts = tuple(int(p) for p in text.split("."))

    def __repr__(self):
        return f"Version({self.text!r})"

    def __eq__(self, other):
        if not isinstance(other, Version):
            return NotImplemented
        return self.parts == other.parts

    def __lt__(self, other):
        if not isinstance(other, Version):
            return NotImplemented
        return self.parts < other.parts

releases = [Version("1.10.0"), Version("1.2.3"), Version("1.9")]
print(sorted(releases))
print(max(releases), Version("2.0") >= Version("1.10"))
```

:::note Mixed types refuse to order
`Version("1.0") < "2.0"` raises `TypeError: '<' not supported between instances of 'Version' and 'str'` once both sides return `NotImplemented`. That's the same rule that makes `sorted([3, "a"])` fail. Python never coerces objects to numbers or strings to compare them, so there's no `valueOf()` trick to reach for.
:::

## Container protocols

:::compare
```js
class Playlist {
  #songs;
  constructor(songs) {
    this.#songs = [...songs];
  }
  get length() {
    return this.#songs.length;
  }
  at(i) {
    return this.#songs.at(i);
  }
  includes(song) {
    return this.#songs.includes(song);
  }
  [Symbol.iterator]() {
    return this.#songs[Symbol.iterator]();
  }
}
```
```python
class Playlist:
    def __init__(self, songs):
        self._songs = list(songs)

    def __len__(self):
        return len(self._songs)

    def __getitem__(self, index):
        return self._songs[index]

    def __contains__(self, song):
        return song in self._songs

    def __iter__(self):
        return iter(self._songs)
```
:::

| Method | Unlocks |
| --- | --- |
| `__len__` | `len(x)`, and truthiness when there's no `__bool__` |
| `__getitem__` | `x[i]`, `x[a:b]`, `x["key"]`, `x[row, col]` |
| `__setitem__` / `__delitem__` | `x[k] = v` / `del x[k]` |
| `__contains__` | `v in x` |
| `__iter__` | `for`, `list(x)`, unpacking, `sum`, `max`, comprehensions... |
| `__reversed__` | `reversed(x)` |

`__getitem__` receives whatever is between the brackets. `deck[3]` passes `3`, `deck[1:3]` passes a `slice(1, 3, None)` object, and `grid[2, 1]` passes the tuple `(2, 1)`. Delegating to a list, as above, gets you negative indices and slicing for free, because the list handles any key you forward to it.

:::pythonic `__getitem__` alone gets you a lot
With no `__iter__`, `for` falls back to calling `__getitem__(0)`, `__getitem__(1)`, ... until it raises `IndexError`. `in` falls back to the same loop, and `reversed()` works once `__len__` exists too. Two methods make a class behave like a full sequence.
:::

```python run
class Deck:
    def __init__(self, cards):
        self._cards = list(cards)

    def __len__(self):
        return len(self._cards)

    def __getitem__(self, index):
        return self._cards[index]          # ints and slices both work

deck = Deck("A23456789TJQK")
print(len(deck), deck[0], deck[-1], deck[::4])
print("Q" in deck)                         # iterates via __getitem__
print(list(reversed(deck))[:3])            # __len__ + __getitem__
print([card for card in deck if card.isdigit()])
```

Note that `deck[::4]` returns a plain `list`, because that's what the list slice produced. To return a `Deck`, check for a slice: `if isinstance(index, slice): return Deck(self._cards[index])`.

Mutable containers add `__setitem__` and `__delitem__`. Keys can be anything, including tuples, so a 2D grid doesn't need nested lists or `"x,y"` string keys:

```python run
class Grid:
    def __init__(self, width, height):
        self.width, self.height = width, height
        self._cells = {}

    def __getitem__(self, pos):            # grid[x, y] passes (x, y)
        return self._cells.get(pos, ".")

    def __setitem__(self, pos, value):
        self._cells[pos] = value

    def __delitem__(self, pos):
        del self._cells[pos]

board = Grid(3, 2)
board[0, 0], board[2, 1] = "X", "O"
del board[0, 0]
for y in range(board.height):
    print("".join(board[x, y] for x in range(board.width)))
```

Define `__contains__` when membership has a faster or different answer than a linear scan, such as a set lookup or a case-insensitive match. Define `__iter__` when there's no natural integer index. It's usually a generator method, as in `Span` above, and [Iterators & Generators](lesson:iterators-and-generators) covers the protocol in depth.

:::quiz output
What does this print?

```python
class Squares:
    def __getitem__(self, index):
        if index >= 4:
            raise IndexError(index)
        return index * index

print(list(Squares()))
```

- [ ] `TypeError`
- [x] `[0, 1, 4, 9]`
- [ ] `[]`
- [ ] `[0, 1, 4, 9, 16]`

`Squares` has no `__iter__`, so `list()` uses the old sequence protocol: it calls `__getitem__` with `0, 1, 2, ...` and stops at the first `IndexError`.
:::

:::tip Inherit the rest from `collections.abc`
Subclass `collections.abc.Sequence`, implement `__getitem__` and `__len__`, and you get `__contains__`, `__iter__`, `__reversed__`, `index()` and `count()` as real methods. `MutableMapping` does the same for dict-like classes: five methods in, most of the `dict` API out.
:::

## Operator overloading

:::compare
```js
class Vector {
  constructor(x, y) {
    this.x = x;
    this.y = y;
  }
  add(other) {
    return new Vector(this.x + other.x, this.y + other.y);
  }
  scale(k) {
    return new Vector(this.x * k, this.y * k);
  }
}

const v = new Vector(1, 2).add(new Vector(3, 4)).scale(2);
```
```python
class Vector:
    def __init__(self, x, y):
        self.x = x
        self.y = y

    def __add__(self, other):
        return Vector(self.x + other.x, self.y + other.y)

    def __mul__(self, k):
        return Vector(self.x * k, self.y * k)


v = (Vector(1, 2) + Vector(3, 4)) * 2
```
:::

JavaScript has no operator overloading, so vector, money and date libraries fall back to method chains. Python maps every operator to a method: `+` `__add__`, `-` `__sub__`, `*` `__mul__`, `/` `__truediv__`, `//` `__floordiv__`, `%` `__mod__`, `**` `__pow__`, `@` `__matmul__`, unary `-` `__neg__`, and `abs()` `__abs__`. That's how `datetime - timedelta`, `Path / "file.txt"` and `Decimal("0.1") + Decimal("0.2")` work.

**Binary operators are a negotiation.** For `a + b`, Python calls `a.__add__(b)`. If that returns `NotImplemented`, Python tries the **reflected** method on the right operand, `b.__radd__(a)`. If both decline, it raises `TypeError: unsupported operand type(s)`. So return `NotImplemented` for types you don't handle, and add `__radd__`/`__rmul__` when your object may sit on the right, as in `3 * v`.

```python run raises
class Vector:
    def __init__(self, x, y):
        self.x, self.y = x, y

    def __repr__(self):
        return f"Vector({self.x}, {self.y})"

    def __add__(self, other):
        if not isinstance(other, Vector):
            return NotImplemented
        return Vector(self.x + other.x, self.y + other.y)

    def __mul__(self, k):
        if not isinstance(k, (int, float)):
            return NotImplemented
        return Vector(self.x * k, self.y * k)

    __rmul__ = __mul__                   # 3 * v asks v.__rmul__(3)

v = Vector(3, 4)
print(v + Vector(1, 1), v * 2, 3 * v)
v + 1                                    # both sides decline: TypeError
```

:::gotcha `NotImplemented` is not `NotImplementedError`
Binary dunders **return** the `NotImplemented` singleton to say "not my type". `NotImplementedError` is an exception, raised by abstract methods. Mixing them up fails quietly: `return NotImplementedError` from `__eq__` hands back a class, which is truthy, so every comparison answers "equal". The singleton isn't a boolean either. A hand-written `__ne__` that returns `not self.__eq__(other)` quietly answered `False` for foreign types until 3.14, which made it a `TypeError`. Python already derives `!=`, so don't write `__ne__` at all.
:::

`sum(vectors)` starts from `0`, so its first step is `0 + Vector(...)`. `int` declines, Python asks `Vector.__radd__(0)`, and you either handle the zero there or pass a start value: `sum(vectors, Vector(0, 0))`.

### In-place operators

`a += b` tries `a.__iadd__(b)` first and rebinds `a` to whatever it returns. Mutable objects implement it to change themselves and **return `self`**. Without `__iadd__`, Python falls back to `a = a + b`, which builds a new object, so other names for the old object don't see the change. That's the difference between `+=` on a list (mutates) and on a tuple (rebinds).

:::quiz output
What does this print?

```python
class Cart:
    def __init__(self):
        self.items = []

    def __iadd__(self, item):
        self.items.append(item)

cart = Cart()
cart += "apple"
print(cart)
```

- [x] `None`
- [ ] `['apple']`
- [ ] `<__main__.Cart object at 0x...>`
- [ ] `TypeError`

`cart += "apple"` means `cart = cart.__iadd__("apple")`. This `__iadd__` forgets to `return self`, so it returns `None` and `cart` is rebound to `None`. The item was appended to a cart nobody can reach any more.
:::

## Truthiness and callables

`__bool__` decides what `if obj:` means. Without it Python uses `__len__` (zero is falsy), and without either, every object is truthy. That's how empty containers are falsy, as [Truthiness & Equality](lesson:truthiness-and-equality) covers.

:::compare
```js
function makeLimiter(limit) {
  let calls = 0;
  return (user) => ++calls <= limit;
}

const allow = makeLimiter(2);
allow("ada");     // true
// calls is hidden inside the closure
```
```python
class RateLimiter:
    def __init__(self, limit):
        self.limit = limit
        self.calls = 0

    def __call__(self, user):
        self.calls += 1
        return self.calls <= self.limit

allow = RateLimiter(2)
allow("ada")      # True
allow.calls       # 1: state you can inspect
```
:::

An instance with `__call__` can be called like a function, and it keeps its state in plain attributes instead of a closure. Anything that takes a callback takes it, and `callable(obj)` tells you whether something can be called. Class-based decorators are built on this ([Decorators](lesson:decorators)).

```python run
class RateLimiter:
    def __init__(self, limit):
        self.limit = limit
        self.calls = 0

    def __call__(self, user):
        self.calls += 1
        return self.calls <= self.limit

    def __bool__(self):                  # truthy while calls remain
        return self.calls < self.limit

allow = RateLimiter(2)
print([allow("ada") for _ in range(3)], allow.calls)
print(callable(allow), bool(allow))
```

## Attribute hooks: `__getattr__`

:::compare
```js
const config = new Proxy(settings, {
  get(target, name) {
    if (!(name in target)) {
      throw new Error(`no setting ${String(name)}`);
    }
    return target[name];
  },
});

config.debug;
```
```python
class Config:
    def __init__(self, settings):
        self._settings = settings

    def __getattr__(self, name):
        try:
            return self._settings[name]
        except KeyError:
            raise AttributeError(f"no setting {name!r}") from None


config.debug
```
:::

`__getattr__` is a **fallback**: Python calls it only after normal lookup (instance, class, bases) has failed. A `Proxy` `get` trap intercepts every access. Python's always-on equivalent is `__getattribute__`, which you'll rarely need and which recurses easily. `__setattr__` and `__delattr__` intercept every assignment and `del`, like the `set` and `deleteProperty` traps. That's how `@dataclass(frozen=True)` blocks assignment.

```python run
class Config:
    def __init__(self, settings):
        self._settings = settings

    def __getattr__(self, name):          # only runs for missing attributes
        try:
            value = self._settings[name]
        except KeyError:
            raise AttributeError(f"no setting {name!r}") from None
        return Config(value) if isinstance(value, dict) else value

cfg = Config({"debug": True, "db": {"host": "localhost", "port": 5432}})
print(cfg.debug, cfg.db.host, cfg.db.port)
print(getattr(cfg, "timeout", 30), hasattr(cfg, "timeout"))
```

:::gotcha Raise `AttributeError`, nothing else
`getattr(obj, name, default)` and `hasattr()` only catch `AttributeError`. A `__getattr__` that lets a `KeyError` escape breaks both of them, and every library that probes attributes along with them. Translate the error, as above. `from None` keeps the original `KeyError` out of the traceback.
:::

:::deep `__getattr__` and half-built objects
`__getattr__` also runs for names Python probes internally. `copy.copy(cfg)` creates the new instance without calling `__init__`, then checks it for `__setstate__`. That lookup lands in `__getattr__`, which reads `self._settings`, which doesn't exist yet, which calls `__getattr__` again, until `RecursionError`. Start the method with `if name.startswith("_"): raise AttributeError(name)` and private and dunder names never reach your fallback.
:::

## Context managers and subclass hooks

Two more protocols deserve a preview. `with` calls `__enter__` on the way in and `__exit__` on the way out, even when the block raises. It's Python's `try`/`finally` packaged as an object, and the counterpart of JavaScript's `using` with `[Symbol.dispose]`. [Context Managers](lesson:context-managers) covers it properly.

```python run
import time

class Timer:
    def __enter__(self):
        self.start = time.perf_counter()
        return self                         # what `as` binds

    def __exit__(self, exc_type, exc, tb):
        self.elapsed = time.perf_counter() - self.start
        print(f"took {self.elapsed:.4f}s")  # runs even if the block raises

with Timer() as timer:
    total = sum(range(100_000))
print(total)
```

`__init_subclass__` runs on the parent class every time it's subclassed, which makes self-registering plugins a few lines of code. Keyword arguments in the `class` statement are passed to it. In JavaScript you'd call `register(CsvExporter)` after each class or reach for a decorator.

```python run
class Exporter:
    registry = {}

    def __init_subclass__(cls, format, **kwargs):
        super().__init_subclass__(**kwargs)
        Exporter.registry[format] = cls

class CsvExporter(Exporter, format="csv"):
    pass

class JsonExporter(Exporter, format="json"):
    pass

print(Exporter.registry)
```

## Cheat sheet

| JavaScript | Python | Notes |
| --- | --- | --- |
| `toString()` | `__str__` | `print()`, `str()`, f-strings |
| `util.inspect.custom` | `__repr__` | REPL, containers, `!r`; define it first |
| `a.equals(b)` | `__eq__` | return `NotImplemented` for foreign types |
| no equivalent | `__hash__` | needed for sets and dict keys once `__eq__` exists |
| comparator function | `__lt__` + `@total_ordering` | `sorted`, `min`, `max` just work |
| `get length()` | `__len__` | also drives truthiness |
| `at(i)`, `Proxy` get | `__getitem__` | receives ints, slices or tuples |
| `Proxy` set / deleteProperty | `__setitem__` / `__delitem__` | `x[k] = v`, `del x[k]` |
| `includes(v)` | `__contains__` | `v in x`; falls back to iteration |
| `[Symbol.iterator]()` | `__iter__` | usually a generator |
| no equivalent | `__reversed__` | `reversed(x)` |
| `a.add(b)` | `__add__` / `__radd__` | `a + b`, and `b + a` when `b` declines |
| no equivalent | `__iadd__` | `a += b`; mutate and `return self` |
| `a.scale(k)`, `a.negate()` | `__mul__`, `__neg__`, `__abs__` | `a * k`, `-a`, `abs(a)` |
| `valueOf()` coercion | none | operators never coerce; unsupported means `TypeError` |
| truthiness is fixed | `__bool__` | `if x:` |
| closure with state | `__call__` | `x(...)`; check with `callable(x)` |
| `Proxy` get trap | `__getattr__` | only for missing attributes |
| `using` + `[Symbol.dispose]` | `__enter__` / `__exit__` | `with x:` |
| register after each class | `__init_subclass__` | runs for every subclass |

## Challenges

:::challenge id=dunder-playlist title="A playlist that acts like a list" difficulty=easy
Write a `Playlist` class that wraps a list of song titles and supports the container protocols:

- `len(p)`, `p[i]` (negative indices too), and `p[a:b]`, which returns a **`Playlist`**, not a list.
- `title in p`, matching **case-insensitively**.
- Iteration in order, and `reversed(p)`.
- `repr(p)` looks like `Playlist(['Intro', 'Toxic'])`.

`Playlist()` with no arguments is empty (and therefore falsy), and changing the list you passed in afterwards mustn't change the playlist.

```python starter
class Playlist:
    def __init__(self, songs=()):
        self.songs = list(songs)
```

```python solution
class Playlist:
    def __init__(self, songs=()):
        self._songs = list(songs)

    def __repr__(self):
        return f"Playlist({self._songs!r})"

    def __len__(self):
        return len(self._songs)

    def __getitem__(self, index):
        if isinstance(index, slice):
            return Playlist(self._songs[index])
        return self._songs[index]

    def __contains__(self, title):
        return title.casefold() in (song.casefold() for song in self._songs)

    def __iter__(self):
        return iter(self._songs)
```

```python tests
MIX = ["Intro", "Hey Ya", "Toxic", "Outro"]

@test("len() and indexing, including negative indices")
def _():
    p = Playlist(MIX)
    eq(len(p), 4)
    eq((p[0], p[-1]), ("Intro", "Outro"))
    raises(IndexError, lambda: p[10])

@test("slicing returns a Playlist")
def _():
    part = Playlist(MIX)[1:3]
    check(isinstance(part, Playlist), f"expected a Playlist, got {type(part).__name__}")
    eq(list(part), ["Hey Ya", "Toxic"])

@test("repr looks like the constructor call")
def _():
    eq(repr(Playlist(["Toxic"])), "Playlist(['Toxic'])")
    eq(repr(Playlist(MIX)[:0]), "Playlist([])")

@test("in is case-insensitive")
def _():
    p = Playlist(MIX)
    check("toxic" in p, "'toxic' should match 'Toxic'")
    check("HEY YA" in p, "'HEY YA' should match 'Hey Ya'")
    check("Halo" not in p, "'Halo' isn't in the playlist")

@test("iterates in order, forwards and backwards")
def _():
    p = Playlist(MIX)
    eq([song for song in p], MIX)
    eq(list(reversed(p)), MIX[::-1])

@test("an empty playlist is falsy")
def _():
    check(not Playlist(), "len() == 0 should make it falsy")
    check(Playlist(["Toxic"]), "a non-empty playlist should be truthy")

@test("doesn't share the caller's list")
def _():
    songs = ["Toxic"]
    p = Playlist(songs)
    songs.append("Halo")
    eq(len(p), 1, "copy the songs in __init__")
```

```hint
Delegate to the inner list: `self._songs[index]` already handles negative indices and slices. For a slice, wrap the result: `Playlist(self._songs[index])`.
```

```hint
`str.casefold()` is the aggressive version of `lower()` meant for case-insensitive matching. Compare `title.casefold()` against each song's casefolded title.
```
:::

:::challenge id=dunder-vector title="Vector arithmetic" difficulty=medium
Write an immutable 2D `Vector(x, y)` that supports:

- `v + w`, `v - w`, `v * k` **and** `k * v` (for numbers `k`), `-v` and `abs(v)` (its length). Every operator returns a new `Vector`.
- `==` between vectors, and `repr(v)` like `Vector(2, 3)`.
- Truthiness: only the zero vector is falsy.
- `sum(vectors)` with no start value.

Unsupported operands, like `Vector(1, 2) + 5` or `v * v`, must raise `TypeError`, so return `NotImplemented` rather than guessing.

```python starter
class Vector:
    def __init__(self, x, y):
        self.x = x
        self.y = y
```

```python solution
import math


class Vector:
    def __init__(self, x, y):
        self.x = x
        self.y = y

    def __repr__(self):
        return f"Vector({self.x}, {self.y})"

    def __eq__(self, other):
        if not isinstance(other, Vector):
            return NotImplemented
        return (self.x, self.y) == (other.x, other.y)

    def __add__(self, other):
        if not isinstance(other, Vector):
            return NotImplemented
        return Vector(self.x + other.x, self.y + other.y)

    def __radd__(self, other):
        if other == 0:              # sum() starts from 0
            return self
        return self.__add__(other)

    def __sub__(self, other):
        if not isinstance(other, Vector):
            return NotImplemented
        return Vector(self.x - other.x, self.y - other.y)

    def __mul__(self, k):
        if not isinstance(k, (int, float)):
            return NotImplemented
        return Vector(self.x * k, self.y * k)

    __rmul__ = __mul__

    def __neg__(self):
        return Vector(-self.x, -self.y)

    def __abs__(self):
        return math.hypot(self.x, self.y)

    def __bool__(self):
        return bool(self.x or self.y)
```

```python tests
@test("adds and subtracts vectors")
def _():
    eq(Vector(1, 2) + Vector(3, 4), Vector(4, 6))
    eq(Vector(5, 5) - Vector(1, 2), Vector(4, 3))

@test("scales by a number on either side")
def _():
    eq(Vector(1, 2) * 3, Vector(3, 6))
    eq(3 * Vector(1, 2), Vector(3, 6))
    eq(Vector(1, 2) * 0.5, Vector(0.5, 1.0))

@test("negation and abs()")
def _():
    eq(-Vector(1, -2), Vector(-1, 2))
    approx(abs(Vector(3, 4)), 5.0)

@test("only the zero vector is falsy")
def _():
    check(not Vector(0, 0), "Vector(0, 0) should be falsy")
    check(Vector(0, 1), "Vector(0, 1) should be truthy")

@test("sum() works without a start value")
def _():
    eq(sum([Vector(1, 2), Vector(3, 4), Vector(5, 6)]), Vector(9, 12))

@test("unsupported operands raise TypeError")
def _():
    raises(TypeError, lambda: Vector(1, 2) + 5)
    raises(TypeError, lambda: Vector(1, 2) * Vector(3, 4))
    raises(TypeError, lambda: "a" * Vector(1, 2))
    eq(Vector(1, 2) == (1, 2), False, "== with another type should be False, not an error")

@test("operators return new vectors")
def _():
    v = Vector(1, 2)
    w = v
    w += Vector(1, 1)
    eq(v, Vector(1, 2), "+= on an immutable vector should rebind, not mutate")
    eq(repr(w), "Vector(2, 3)")
```

```hint
`k * v` first asks `int.__mul__(k, v)`, which returns `NotImplemented`, and then `v.__rmul__(k)`. Multiplication is commutative here, so `__rmul__ = __mul__` is enough.
```

```hint
`sum()` computes `0 + first_vector`, which ends up in `__radd__(0)`. Return `self` when `other == 0` and delegate to `__add__` otherwise.
```

```hint
`math.hypot(x, y)` is the length of `(x, y)`. Don't define `__iadd__`: without it, `+=` falls back to `__add__` and rebinds, which is what an immutable value wants.
```
:::

:::challenge id=dunder-version title="Semantic versions" difficulty=hard
Write a `Version` class for dotted version strings like `"1.10.2"`:

- `Version("1.10.2").parts == (1, 10, 2)`, and `repr()` shows the original text: `Version('1.10.2')`.
- Versions compare **numerically** (`1.10` is newer than `1.9`) with all six operators, so `sorted()` and `max()` work.
- Trailing zeros don't matter: `Version("1.2") == Version("1.2.0")`. Equal versions must hash equal, so they collapse in a set and work as dict keys.
- Against other types, `==` is `False` and `<` raises `TypeError`.

Write `__eq__`, `__hash__` and one ordering method, and let `functools.total_ordering` derive the rest.

```python starter
from functools import total_ordering


class Version:
    def __init__(self, text):
        ...
```

```python solution
from functools import total_ordering


@total_ordering
class Version:
    def __init__(self, text):
        self.text = text
        self.parts = tuple(int(part) for part in text.split("."))

    def __repr__(self):
        return f"Version({self.text!r})"

    def _key(self):
        parts = list(self.parts)
        while len(parts) > 1 and parts[-1] == 0:   # "1.2.0" means "1.2"
            parts.pop()
        return tuple(parts)

    def __eq__(self, other):
        if not isinstance(other, Version):
            return NotImplemented
        return self._key() == other._key()

    def __hash__(self):
        return hash(self._key())

    def __lt__(self, other):
        if not isinstance(other, Version):
            return NotImplemented
        return self._key() < other._key()
```

```python tests
@test("parses and shows the original text")
def _():
    eq(Version("1.10.2").parts, (1, 10, 2))
    eq(repr(Version("2.0")), "Version('2.0')")

@test("compares numerically, not as strings")
def _():
    check(Version("1.10") > Version("1.9"), "1.10 is newer than 1.9")
    check(Version("2.0.0") > Version("1.99.99"), "2.0.0 is newer than 1.99.99")
    check(Version("1.2.3") < Version("1.2.10"), "1.2.3 is older than 1.2.10")

@test("supports every comparison operator")
def _():
    a, b = Version("1.0"), Version("1.1")
    eq([a < b, a <= b, a > b, a >= b, a == b, a != b], [True, True, False, False, False, True])

@test("trailing zeros don't matter")
def _():
    eq(Version("1.2"), Version("1.2.0"))
    check(not Version("1.2") < Version("1.2.0"), "1.2 and 1.2.0 are the same version")
    check(Version("1.2") <= Version("1.2.0"), "<= should be True for equal versions")

@test("sorts and finds the latest release")
def _():
    releases = [Version(v) for v in ["1.10.0", "1.2.3", "1.9", "0.9.12"]]
    eq([v.text for v in sorted(releases)], ["0.9.12", "1.2.3", "1.9", "1.10.0"])
    eq(max(releases).text, "1.10.0")

@test("equal versions hash equal")
def _():
    eq(len({Version("1.2"), Version("1.2.0"), Version("1.2.0.0")}), 1)
    eq({Version("3.0"): "stable"}[Version("3")], "stable")

@test("other types: == is False and < raises TypeError")
def _():
    eq(Version("1.0") == "1.0", False)
    raises(TypeError, lambda: Version("1.0") < "2.0")
```

```hint
Tuples already compare element by element, numerically: `(1, 10) > (1, 9)`. Compare tuples of ints, never the raw strings.
```

```hint
Normalize before comparing: strip trailing zeros so `(1, 2, 0)` becomes `(1, 2)`. Use the same normalized tuple in `__eq__`, `__lt__` and `__hash__`, or equal versions will land in different hash buckets.
```

```hint
Return `NotImplemented` for non-`Version` operands. Python then makes `==` fall back to `False` and makes `<` raise `TypeError` on its own.
```
:::
