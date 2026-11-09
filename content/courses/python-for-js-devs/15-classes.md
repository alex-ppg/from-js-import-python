---
title: Classes & Objects
part: Objects & Classes
summary: Explicit self, attributes by assignment, properties instead of get/set, and inheritance beyond extends.
minutes: 40
---

Python classes look familiar: a `class` keyword, a constructor, methods, inheritance. The difference is that Python hides almost nothing. `this` becomes an explicit `self` parameter, attributes appear when you assign them, and privacy is a naming convention rather than a language feature. One mental model explains most of this lesson: an object is a dict of attributes that falls back to its class, and a class is a dict of functions and values that falls back to its base classes. It's the prototype chain, with fewer surprises.

The double-underscore hooks that plug objects into operators and built-ins get their own lesson, [Dunder Methods](lesson:dunder-methods). Boilerplate-free record classes live in [Dataclasses, NamedTuples & Enums](lesson:dataclasses-and-enums).

## Defining a class

:::compare
```js
class User {
  constructor(name, email) {
    this.name = name;
    this.email = email;
    this.active = true;
  }

  greet() {
    return `Hi, ${this.name}`;
  }
}

const ada = new User("Ada", "ada@example.com");
ada.greet();
```
```python
class User:
    def __init__(self, name, email):
        self.name = name
        self.email = email
        self.active = True

    def greet(self):
        return f"Hi, {self.name}"



ada = User("Ada", "ada@example.com")
ada.greet()
```
:::

Four differences in a dozen lines:

1. **No `new`.** A class is callable, and calling it builds an instance.
2. **`__init__` initialises.** The object already exists when `__init__` runs. Its job is to fill it in, and it returns nothing.
3. **`self` is explicit.** Every method receives the instance as its first parameter, and attributes are always reached through it. A bare `name` inside a method is a local or global variable, never an attribute.
4. **Attributes are created by assignment**, in `__init__` or any other method. There are no field declarations (a bare `name: str` in a class body is only a type hint), and reading a missing attribute raises `AttributeError` instead of returning `undefined`.

:::gotcha Forgetting `self`
`ada.greet()` passes `ada` as the first argument, so a method written as `def greet():` fails with `TypeError: User.greet() takes 0 positional arguments but 1 was given`. Inside a method, writing `name` instead of `self.name` raises `NameError`. JavaScript fills in `this` for you. Python never does.
:::

### Printing objects

Print an instance and you get something like `<__main__.User object at 0x10a3f2b50>`: the class and a memory address, not the field dump `console.log` shows. Define `__repr__` and every `print()`, f-string, REPL echo and debugger view uses it. By convention it looks like the constructor call, and `!r` formats each value with `repr()` so strings keep their quotes.

```python run raises
class User:
    def __init__(self, name, email):
        self.name = name
        self.email = email

    def __repr__(self):
        return f"User(name={self.name!r}, email={self.email!r})"

ada = User("Ada", "ada@example.com")
print(ada, [ada])
ada.nickname = "Countess"      # objects are open, as in JS
print(ada.nickname)
print(ada.phone)               # AttributeError, not undefined
```

`__str__` is an optional, user-facing version, closer to `toString()`. [Dunder Methods](lesson:dunder-methods) covers the split, and [dataclasses](lesson:dataclasses-and-enums) write `__repr__` for you.

## Class attributes vs instance attributes

:::compare
```js
class Order {
  static taxRate = 0.2;    // on the class
  items = [];              // a new array per instance

  constructor(customer) {
    this.customer = customer;
  }
}

new Order("Ada").taxRate;  // undefined
```
```python
class Order:
    tax_rate = 0.2         # on the class

    def __init__(self, customer):
        self.customer = customer
        self.items = []    # a new list per instance



Order("Ada").tax_rate      # 0.2: falls back to the class
```
:::

Assignments in the class body create **class attributes**: one value, stored on the class, shared by every instance. Reading `order.tax_rate` checks the instance first, then the class, then its base classes. Unlike JS `static` fields, class attributes are visible through instances.

Writing through an instance never touches the class. `order.tax_rate = 0` creates an instance attribute that **shadows** the class one, for that object only. That makes immutable class attributes handy as per-class defaults that any instance can override.

:::gotcha A mutable class attribute is shared by every instance
JavaScript evaluates a class field initialiser like `items = [];` once **per instance**. A Python class body is ordinary code that runs **once**, when the `class` statement executes. So `items = []` there creates a single list that every instance shares, exactly like an array on a prototype. Create per-instance state in `__init__`.
:::

```python run
class Order:
    items = []                      # ONE list, stored on the class

    def __init__(self, customer):
        self.customer = customer

    def add(self, item):
        self.items.append(item)     # finds the class's list and mutates it

first = Order("Ada")
second = Order("Linus")
first.add("book")
print(second.items)                 # Linus has Ada's book
print(first.items is Order.items)
```

:::quiz output
What does this print?

```python
class Counter:
    count = 0

    def __init__(self):
        self.count += 1

a = Counter()
b = Counter()
print(Counter.count, a.count, b.count)
```

- [ ] `2 2 2`
- [ ] `2 1 2`
- [x] `0 1 1`
- [ ] `AttributeError`

`self.count += 1` means `self.count = self.count + 1`. The read falls back to the class attribute (`0`), but the write creates an **instance** attribute on each object, so `Counter.count` never changes. To update shared state, assign through the class: `type(self).count += 1`.
:::

## Methods are bound to their instance

:::compare
```js
class Counter {
  count = 0;

  increment() {
    this.count += 1;
  }
}

const counter = new Counter();
const inc = counter.increment;
inc();      // TypeError: this is undefined
button.addEventListener("click", counter.increment.bind(counter));
```
```python
class Counter:
    def __init__(self):
        self.count = 0

    def increment(self):
        self.count += 1


counter = Counter()
inc = counter.increment
inc()       # works: counter.count is now 1
button.on_click(counter.increment)
```
:::

Reading `counter.increment` produces a **bound method**: an object that remembers both the function and the instance, and passes the instance as `self` whenever it's called. Python has no dynamic `this`, so there's nothing to lose: no `.bind()`, no arrow functions in class fields, no `const self = this`.

Under the sugar, `counter.increment()` is `Counter.increment(counter)`. Methods are plain functions stored on the class, and `self` is just the conventional name of the first parameter.

:::pythonic Pass methods as callbacks
Bound methods drop straight into `map()`, `sorted(key=...)` and callback APIs, with no wrapper arrow. Methods looked up on the class work too, taking the instance as their argument: `sorted(words, key=str.lower)` calls `str.lower(word)` for each word.
:::

```python run
class PriceList:
    def __init__(self, rate):
        self.rate = rate

    def convert(self, amount):
        return round(amount * self.rate, 2)

to_eur = PriceList(0.92).convert          # a bound method
print(to_eur(10))                         # self comes along
print(list(map(to_eur, [25, 99.99])))
print(PriceList.convert(PriceList(2), 5)) # the explicit form
```

:::deep How binding works
Functions are **descriptors**: they define `__get__`, and looking one up through an instance calls it to build a bound method. So `counter.increment is counter.increment` is `False` (each lookup builds a fresh bound method) while `==` is `True`. A bound method exposes its parts as `__self__` and `__func__`. Only attributes found on the class get bound: a function stored on the instance itself (`counter.f = some_function`) is called without `self`.
:::

## Privacy by convention

:::compare
```js
class Account {
  #balance = 0;     // hard private
  _fee = 1;         // internal, by convention
}

const acct = new Account();
acct._fee;          // 1: nothing stops you
acct.#balance;      // SyntaxError
```
```python
class Account:
    def __init__(self):
        self.__balance = 0  # name-mangled
        self._fee = 1       # internal, by convention

acct = Account()
acct._fee           # 1: nothing stops you
acct.__balance      # AttributeError, but see below
```
:::

Python has no access modifiers. A single leading underscore means *internal, use at your own risk*. Linters flag `other._fee`, `from module import *` skips such names, and reviewers will ask why you're reaching in, but nothing stops it at runtime. The community line is "we're all consenting adults here".

Two leading underscores trigger **name mangling**: inside a class body, `__balance` is rewritten to `_Account__balance`. That stops a subclass from accidentally overwriting its parent's attribute, which matters mostly in classes that strangers will subclass. Everywhere else, one underscore is the norm. Mangling isn't security either:

```python run
class Account:
    def __init__(self, balance):
        self._fee = 1                 # internal by convention
        self.__balance = balance      # stored as _Account__balance

acct = Account(100)
print(vars(acct))
print(acct._Account__balance)         # one rename away
acct.__balance = 0                    # outside a class body: no mangling
print(vars(acct))                     # a NEW attribute; the real one is untouched
```

Names with two underscores on **both** sides, like `__init__`, are never mangled: they're the language's hook methods.

## Properties instead of get and set

:::compare
```js
class Temperature {
  #celsius;
  constructor(celsius) {
    this.celsius = celsius;   // runs the setter
  }
  get celsius() {
    return this.#celsius;
  }
  set celsius(value) {
    if (value < -273.15) throw new RangeError("too cold");
    this.#celsius = value;
  }
}
```
```python
class Temperature:
    def __init__(self, celsius):
        self.celsius = celsius   # runs the setter

    @property
    def celsius(self):
        return self._celsius

    @celsius.setter
    def celsius(self, value):
        if value < -273.15:
            raise ValueError("too cold")
        self._celsius = value
```
:::

`@property` turns a method into an attribute read, and `@celsius.setter` handles assignment. It's `get`/`set` with the value stored under a second name: `_celsius` here, `#celsius` in JS. Callers write `t.celsius = 30`, never `t.set_celsius(30)`. A property without a setter is read-only.

```python run raises
class Rectangle:
    def __init__(self, width, height):
        self.width = width
        self.height = height

    @property
    def area(self):              # computed on every read
        return self.width * self.height

box = Rectangle(3, 4)
box.width = 10
print(box.area)                  # no parentheses
box.area = 99                    # read-only: there's no setter
```

:::pythonic Start with a plain attribute
Python code rarely starts with getters. Make the attribute public, and if it later needs validation or computing, turn it into a property: call sites like `t.celsius` and `t.celsius = 30` don't change. That's why Java-style `get_x()`/`set_x()` methods read as un-Pythonic.
:::

:::gotcha The property and its storage need different names
Inside the setter, `self.celsius = value` calls the setter again, which calls it again, until `RecursionError`. Store the value under another name such as `self._celsius`. Note that `__init__` deliberately assigns `self.celsius`, so construction goes through the validation too.
:::

### `cached_property`: compute once, on demand

The JS trick of a getter that replaces itself via `Object.defineProperty` is built in. `functools.cached_property` runs the method on first access and stores the result in the instance's `__dict__` under the same name, so later reads are ordinary attribute lookups. It never invalidates itself. When the inputs change, `del report.total` forces a recompute on the next read.

```python run
from functools import cached_property

class Report:
    def __init__(self, rows):
        self.rows = rows

    @cached_property
    def total(self):
        print("summing...")
        return sum(self.rows)

report = Report([120, 80, 45])
print(report.total, report.total)   # computed once
report.rows.append(55)
print(report.total)                 # stale
del report.total                    # drop the cached value
print(report.total)
```

## Class methods and static methods

:::compare
```js
class Color {
  constructor(r, g, b) {
    Object.assign(this, { r, g, b });
  }

  static fromHex(code) {
    const n = parseInt(code.slice(1), 16);
    return new this(n >> 16, (n >> 8) & 255, n & 255);
  }

  static isChannel(value) {
    return value >= 0 && value <= 255;
  }
}
```
```python
class Color:
    def __init__(self, r, g, b):
        self.r, self.g, self.b = r, g, b

    @classmethod
    def from_hex(cls, code):
        n = int(code.lstrip("#"), 16)
        return cls(n >> 16, (n >> 8) & 255, n & 255)

    @staticmethod
    def is_channel(value):
        return 0 <= value <= 255
```
:::

JavaScript has one kind of `static`. Python has two:

- **`@classmethod`** receives the class itself as `cls`. Its main job is **alternative constructors**. Python has no constructor overloading, so where TypeScript would declare overloads or accept `string | number | Options`, you keep `__init__` simple and add `from_hex`, `from_json` or `from_row`. The standard library is full of them: `dict.fromkeys`, `datetime.fromisoformat`, `int.from_bytes`.
- **`@staticmethod`** receives nothing. It's a plain function in the class namespace, and it's rarer than you'd expect, because a module-level function usually does the job just as well.

Return `cls(...)` rather than `Color(...)`: a subclass that inherits `from_hex` then builds instances of itself, the way `new this(...)` does in a JS static method. For what the `@` syntax actually does, see [Decorators](lesson:decorators).

:::quiz output
What does this print?

```python
class Animal:
    @classmethod
    def create(cls):
        return cls()

class Dog(Animal):
    pass

print(type(Dog.create()).__name__)
```

- [ ] `Animal`
- [x] `Dog`
- [ ] `cls`
- [ ] `TypeError`

`cls` is whichever class the method was called on. `Dog.create()` passes `Dog`, so `cls()` builds a `Dog` even though the method is defined on `Animal`.
:::

## Inheritance and `super()`

:::compare
```js
class User {
  constructor(name) {
    this.name = name;
  }
  describe() {
    return this.name;
  }
}

class Admin extends User {
  constructor(name, permissions) {
    super(name);
    this.permissions = permissions;
  }
  describe() {
    return `${super.describe()} (admin)`;
  }
}
```
```python
class User:
    def __init__(self, name):
        self.name = name

    def describe(self):
        return self.name


class Admin(User):
    def __init__(self, name, permissions):
        super().__init__(name)
        self.permissions = permissions

    def describe(self):
        return f"{super().describe()} (admin)"
```
:::

The base class goes in parentheses. `super().__init__(...)` replaces `super(...)`, and `super().describe()` replaces `super.describe()`. A subclass without its own `__init__` inherits the parent's, the same as omitting a JS constructor. Every class ultimately inherits from `object`, so `class User:` and `class User(object):` mean the same thing.

:::gotcha Nothing forces you to call `super().__init__()`
JavaScript won't let you touch `this` before `super()` has run. Python doesn't check at all. A subclass `__init__` that forgets `super().__init__(name)` silently skips the parent's setup, and the missing attribute surfaces later as an `AttributeError`, far from the cause.
:::

```python run raises
class User:
    def __init__(self, name):
        self.name = name

class Admin(User):
    def __init__(self, name, permissions):
        self.permissions = permissions    # forgot super().__init__(name)

admin = Admin("Grace", {"deploy"})
print(admin.permissions)
print(admin.name)
```

`x instanceof A` becomes `isinstance(x, A)`, and `issubclass(Admin, User)` checks classes. `isinstance` also accepts a tuple, `isinstance(x, (int, float))`, which reads better than chaining `or`. Prefer it to `type(x) is A`, because it accepts subclasses. One surprise: `bool` is a subclass of `int`, so `isinstance(True, int)` is `True`.

## Multiple inheritance and mixins

:::compare
```js
// One parent per class, so mixins are class factories:
const Serializable = (Base) => class extends Base {
  toJSON() {
    return JSON.stringify(this);
  }
};

class ApiUser extends Serializable(User) {}
```
```python
# A class can list several bases:
class JsonMixin:
    def to_json(self):
        return json.dumps(vars(self))



class ApiUser(JsonMixin, User):
    pass
```
:::

Python allows several base classes. Their most common use is the **mixin**: a small class that adds a method or two and isn't meant to stand alone. Mixins go to the **left** of the main base, as in `class ApiUser(JsonMixin, User)`.

When several classes define the same name, Python searches them in the **method resolution order** (MRO), which you can inspect as `ClassName.__mro__`. The algorithm (C3 linearization) boils down to two rules: a class comes before its bases, and bases keep the left-to-right order you wrote.

```python run
class Base:
    def save(self):
        return ["base"]

class Timestamped(Base):
    def save(self):
        return ["timestamp", *super().save()]

class Validated(Base):
    def save(self):
        return ["validate", *super().save()]

class Post(Validated, Timestamped):
    pass

print(Post().save())
print([cls.__name__ for cls in Post.__mro__])
```

Look at `Validated.save`: its `super()` call reaches `Timestamped`, a class `Validated` has never heard of. `super()` means *the next class in the MRO of this object's type*, not *my parent*. That lets each class do its part and hand off, so every `save()` in a diamond runs exactly once. Keep this tool for mixins, though. If you find yourself drawing deep diamonds, composition (an object that *has* a logger instead of *being* one) is usually clearer.

:::quiz output
What does this print?

```python
class A:
    def who(self):
        return "A"

class B(A):
    pass

class C(A):
    def who(self):
        return "C"

class D(B, C):
    pass

print(D().who())
```

- [ ] `A`
- [x] `C`
- [ ] `TypeError`

The MRO is `D, B, C, A, object`. `B` doesn't define `who`, so the search moves on to `C` before `A`: `A` is a base of both `B` and `C`, so it must come after both. A plain depth-first search would have found `A.who` first.
:::

## Abstract base classes and duck typing

:::compare
```ts
abstract class Shape {
  abstract area(): number;

  describe(): string {
    return `${this.constructor.name} with area ${this.area()}`;
  }
}

new Shape();   // compile-time error
```
```python
from abc import ABC, abstractmethod

class Shape(ABC):
    @abstractmethod
    def area(self) -> float: ...

    def describe(self) -> str:
        return f"{type(self).__name__} with area {self.area()}"

Shape()        # TypeError at runtime
```
:::

Inherit from `abc.ABC` and mark methods with `@abstractmethod`. Python then refuses to instantiate the class, or any subclass that hasn't overridden every abstract method. The check happens when you **call the class**, not when you define the subclass. A type checker such as mypy reports it earlier. The `...` body is Python's idiom for "intentionally empty", like `pass`.

```python run raises
from abc import ABC, abstractmethod

class Shape(ABC):
    @abstractmethod
    def area(self): ...

    def describe(self):
        return f"{type(self).__name__} with area {self.area()}"

class Square(Shape):
    def __init__(self, side):
        self.side = side

    def area(self):
        return self.side ** 2

class Blob(Shape):           # forgot to implement area()
    pass

print(Square(3).describe())
Blob()
```

ABCs are the exception, though. Idiomatic Python mostly relies on **duck typing**: if an object has the method you need, call it, whatever its class. Functions that accept "a file" take anything with a `.read()` method, and `len()` takes anything that defines `__len__`. If you want TypeScript's structural `interface` checked statically, that's `typing.Protocol`, covered in [Type Hints](lesson:type-hints).

## Dynamic attributes

:::compare
```js
const field = "email";
user[field];                    // dynamic read
user[field] ?? "n/a";           // with a fallback
user[field] = "ada@new.dev";    // dynamic write
"email" in user;                // does it exist?
delete user.email;
Object.keys(user);
```
```python
field = "email"
getattr(user, field)            # dynamic read
getattr(user, field, "n/a")     # with a fallback
setattr(user, field, "ada@new.dev")  # dynamic write
hasattr(user, "email")          # does it exist?
del user.email
vars(user)                      # the attribute dict
```
:::

Square brackets are for items (`d["k"]`, `xs[0]`), never attributes. To use an attribute name stored in a variable, call `getattr`, `setattr`, `hasattr` or `delattr`. Without a default, `getattr` raises `AttributeError` for a missing name, just like dot access.

Instance attributes live in a real dict, `obj.__dict__`, which `vars(obj)` returns. It's the nearest thing to `Object.keys` and `Object.entries` for an object, and handy for debugging: `print(vars(order))`.

```python run
class User:
    def __init__(self, name, email):
        self.name = name
        self.email = email

ada = User("Ada", "ada@example.com")
changes = {"email": "ada@new.dev", "role": "admin"}
for field, value in changes.items():
    setattr(ada, field, value)

print(vars(ada))
print(getattr(ada, "phone", "n/a"))
print(hasattr(ada, "role"))
```

### `__slots__`: a fixed set of attributes

By default every instance carries a `__dict__`, so anyone can add attributes to it. Declaring `__slots__` replaces that dict with fixed storage for the names you list. Instances get smaller and faster to access, and assigning an undeclared name raises `AttributeError`, which also catches typos. The effect is close to calling `Object.preventExtensions(this)` in every constructor.

```python run raises
class Point:
    __slots__ = ("x", "y")

    def __init__(self, x, y):
        self.x = x
        self.y = y

p = Point(1, 2)
p.x = 10           # fine: a declared slot
print(p.x, p.y)
p.z = 3            # not declared
```

Reach for slots when you create very large numbers of small objects, or get them for free with `@dataclass(slots=True)`. `cached_property` needs a per-instance `__dict__`, so it doesn't combine with `__slots__`.

## Cheat sheet

| JavaScript | Python | Notes |
| --- | --- | --- |
| `constructor(x) { ... }` | `def __init__(self, x):` | initialises an existing object |
| `new User(x)` | `User(x)` | no `new` |
| `this.x` | `self.x` | `self` is an explicit first parameter |
| `x = [];` (class field) | `self.x = []` in `__init__` | class-body values are shared |
| `static rate = 0.2` | `rate = 0.2` in the class body | also visible through instances |
| `static create() { return new this() }` | `@classmethod` + `return cls()` | alternative constructors |
| `static helper()` | `@staticmethod` | or a module-level function |
| `#secret` | `_secret` | convention only; `__secret` mangles |
| `get area()` / `set area(v)` | `@property` / `@area.setter` | read-only without a setter |
| self-replacing lazy getter | `@functools.cached_property` | `del obj.attr` resets it |
| `class B extends A` | `class B(A):` | several bases allowed |
| `super(x)` | `super().__init__(x)` | not enforced |
| `super.method()` | `super().method()` | follows the MRO |
| `x instanceof A` | `isinstance(x, A)` | accepts a tuple of classes |
| `abstract class` | `class A(ABC)` + `@abstractmethod` | checked at instantiation |
| `fn.bind(obj)` | `obj.fn` | already bound |
| `obj[name]` / `obj[name] = v` | `getattr(obj, name)` / `setattr(obj, name, v)` | `getattr` takes a default |
| `name in obj` | `hasattr(obj, name)` | |
| `Object.keys(obj)` | `vars(obj)` | the instance `__dict__` |
| `Object.preventExtensions` | `__slots__` | |
| `toString()` | `__repr__` / `__str__` | define `__repr__` first |

## Challenges

:::challenge id=classes-bank-account title="Bank account" difficulty=easy
Write a `BankAccount` class:

- `BankAccount(owner, balance=0)` stores `owner` and the starting balance.
- `deposit(amount)` and `withdraw(amount)` return the new balance. Both raise `ValueError` for an amount that isn't positive, and `withdraw` raises `ValueError` rather than overdraw.
- `balance` is a **read-only property**.
- `history` lists `("deposit", amount)` and `("withdraw", amount)` tuples, one list per account.

```python starter
class BankAccount:
    def __init__(self, owner, balance=0):
        ...

    def deposit(self, amount):
        ...

    def withdraw(self, amount):
        ...
```

```python solution
class BankAccount:
    def __init__(self, owner, balance=0):
        self.owner = owner
        self._balance = balance
        self.history = []

    @property
    def balance(self):
        return self._balance

    def deposit(self, amount):
        if amount <= 0:
            raise ValueError("amount must be positive")
        self._balance += amount
        self.history.append(("deposit", amount))
        return self._balance

    def withdraw(self, amount):
        if amount <= 0 or amount > self._balance:
            raise ValueError(f"can't withdraw {amount} from {self._balance}")
        self._balance -= amount
        self.history.append(("withdraw", amount))
        return self._balance
```

```python tests
@test("stores the owner and the balance")
def _():
    acct = BankAccount("Ada", 100)
    eq((acct.owner, acct.balance), ("Ada", 100))
    eq(BankAccount("Linus").balance, 0, "balance should default to 0")

@test("deposit and withdraw return the new balance")
def _():
    acct = BankAccount("Ada", 100)
    eq(acct.deposit(50), 150)
    eq(acct.withdraw(150), 0)

@test("rejects bad amounts without changing the balance")
def _():
    acct = BankAccount("Ada", 100)
    for method in (acct.deposit, acct.withdraw):
        raises(ValueError, method, 0)
        raises(ValueError, method, -5)
    raises(ValueError, acct.withdraw, 101)
    eq(acct.balance, 100)

@test("balance is a read-only property")
def _():
    check(isinstance(BankAccount.balance, property), "make balance a @property")
    with raises(AttributeError):
        BankAccount("Ada").balance = 1_000_000

@test("records history, one list per account")
def _():
    first, second = BankAccount("Ada"), BankAccount("Linus")
    first.deposit(20)
    first.withdraw(5)
    eq(first.history, [("deposit", 20), ("withdraw", 5)])
    eq(second.history, [], "history is shared: create the list in __init__, not in the class body")
```

```hint
Store the balance under another name, such as `self._balance`, and expose it with a `@property` that has no setter.
```

```hint
Create `self.history = []` inside `__init__`. A list in the class body would be shared by every account.
```
:::

:::challenge id=classes-temperature title="Temperature converter" difficulty=medium
Write a `Temperature` class that stores degrees Celsius:

- `celsius` is a property whose setter raises `ValueError` below absolute zero (-273.15). That includes `Temperature(-300)`.
- `fahrenheit` is a property you can read **and** assign. Assigning converts and stores Celsius, with the same validation.
- `Temperature.from_fahrenheit(f)` is a class method that builds an instance of whichever class it's called on.

`F = C × 9/5 + 32`, so `C = (F − 32) × 5/9`.

```python starter
class Temperature:
    def __init__(self, celsius):
        self.celsius = celsius
```

```python solution
ABSOLUTE_ZERO = -273.15


class Temperature:
    def __init__(self, celsius):
        self.celsius = celsius

    @property
    def celsius(self):
        return self._celsius

    @celsius.setter
    def celsius(self, value):
        if value < ABSOLUTE_ZERO:
            raise ValueError(f"{value} °C is below absolute zero")
        self._celsius = value

    @property
    def fahrenheit(self):
        return self._celsius * 9 / 5 + 32

    @fahrenheit.setter
    def fahrenheit(self, value):
        self.celsius = (value - 32) * 5 / 9

    @classmethod
    def from_fahrenheit(cls, fahrenheit):
        return cls((fahrenheit - 32) * 5 / 9)
```

```python tests
@test("converts between the scales")
def _():
    approx(Temperature(100).fahrenheit, 212)
    approx(Temperature(-40).fahrenheit, -40)
    t = Temperature(0)
    t.fahrenheit = 212
    approx(t.celsius, 100)

@test("rejects temperatures below absolute zero")
def _():
    raises(ValueError, Temperature, -300)
    t = Temperature(20)
    with raises(ValueError):
        t.celsius = -274
    with raises(ValueError):
        t.fahrenheit = -500
    eq(t.celsius, 20, "a rejected assignment must keep the old value")
    eq(Temperature(-273.15).celsius, -273.15, "absolute zero itself is allowed")

@test("celsius and fahrenheit are properties")
def _():
    check(isinstance(Temperature.celsius, property), "celsius should be a @property")
    check(isinstance(Temperature.fahrenheit, property), "fahrenheit should be a @property")

@test("from_fahrenheit builds an instance")
def _():
    t = Temperature.from_fahrenheit(212)
    check(isinstance(t, Temperature), "from_fahrenheit should return a Temperature")
    approx(t.celsius, 100)

@test("from_fahrenheit is a classmethod that respects subclasses")
def _():
    check(isinstance(vars(Temperature).get("from_fahrenheit"), classmethod), "decorate it with @classmethod")
    class Reading(Temperature):
        pass
    eq(type(Reading.from_fahrenheit(50)).__name__, "Reading", "return cls(...), not Temperature(...)")
```

```hint
Keep the real value in `self._celsius`. The `fahrenheit` setter can convert and assign `self.celsius = ...`, which reuses the validation for free.
```

```hint
A class method receives the class as `cls`. Return `cls(celsius_value)`.
```
:::

:::challenge id=classes-cooperative-mixins title="Composable cleaners" difficulty=hard
`Cleaner.clean(text)` returns its input unchanged. Write three mixins that each override `clean(self, text)`, do one job, and hand the text along with `super().clean(...)`:

- `StripMixin` removes surrounding whitespace.
- `LowerMixin` lowercases.
- `RequiredMixin` raises `ValueError` if the **fully cleaned** text is empty, wherever it sits in the chain.

Then define `UsernameCleaner`, combining the three (in that order) with `Cleaner`. The mixins mustn't know about each other: `super()` calls the next class in the MRO of the object being cleaned, whatever that turns out to be.

```text
UsernameCleaner().clean("  Ada  ")  ->  "ada"
UsernameCleaner().clean("   ")      ->  ValueError
```

```js
const Strip = (Base) => class extends Base {
  clean(text) { return super.clean(text.trim()); }
};
class UsernameCleaner extends Strip(Lower(Required(Cleaner))) {}
```

```python starter
class Cleaner:
    def clean(self, text):
        return text


class StripMixin:
    ...


class LowerMixin:
    ...


class RequiredMixin:
    ...


class UsernameCleaner:
    ...
```

```python solution
class Cleaner:
    def clean(self, text):
        return text


class StripMixin:
    def clean(self, text):
        return super().clean(text.strip())


class LowerMixin:
    def clean(self, text):
        return super().clean(text.lower())


class RequiredMixin:
    def clean(self, text):
        cleaned = super().clean(text)   # let the rest of the chain run first
        if not cleaned:
            raise ValueError("this field is required")
        return cleaned


class UsernameCleaner(StripMixin, LowerMixin, RequiredMixin, Cleaner):
    pass
```

```python tests
@test("UsernameCleaner strips, lowercases and requires")
def _():
    eq(UsernameCleaner().clean("  Ada  "), "ada")
    raises(ValueError, UsernameCleaner().clean, "")
    raises(ValueError, UsernameCleaner().clean, "   ")

@test("UsernameCleaner lists its bases in order")
def _():
    eq(
        [cls.__name__ for cls in UsernameCleaner.__mro__],
        ["UsernameCleaner", "StripMixin", "LowerMixin", "RequiredMixin", "Cleaner", "object"],
    )

@test("each mixin works on its own")
def _():
    class JustStrip(StripMixin, Cleaner): pass
    class JustLower(LowerMixin, Cleaner): pass
    class JustRequired(RequiredMixin, Cleaner): pass
    eq(JustStrip().clean("  Hi  "), "Hi")
    eq(JustLower().clean("  Hi  "), "  hi  ")
    eq(JustRequired().clean("  "), "  ", "whitespace isn't empty until something strips it")

@test("every mixin hands off with super()")
def _():
    class Recorder(Cleaner):
        def clean(self, text):
            self.received = text
            return text
    class Probe(StripMixin, LowerMixin, RequiredMixin, Recorder): pass
    probe = Probe()
    probe.clean("  MiXeD ")
    eq(probe.received, "mixed", "the last class in the MRO should receive the cleaned text")

@test("RequiredMixin checks the final result, wherever it sits")
def _():
    class RequiredFirst(RequiredMixin, StripMixin, Cleaner): pass
    raises(ValueError, RequiredFirst().clean, "   ")
```

```hint
Each transforming mixin is one line: `return super().clean(<transformed text>)`. Calling `Cleaner.clean(self, ...)` directly would skip whatever sits in between.
```

```hint
`RequiredMixin` can't check its input, because classes later in the chain may still strip it. Call `super().clean(text)` first, then check the result.
```
:::
