---
title: How Attribute Lookup Works
part: The Object Model
summary: What really runs on obj.name: instance and class dicts, the MRO, descriptors first and __getattr__ last.
minutes: 40
---

In JavaScript, `obj.name` checks the object's own properties, then walks `Object.getPrototypeOf(obj)` until it finds the name or runs out of prototypes. Python's lookup has the same shape: the instance's own dict first, then its class and the class's bases in a fixed order. The twist that trips JS developers is that **the class gets the first look**. If the class holds a *data descriptor* for the name, such as a `property`, it wins even over a value stored on the instance itself.

This lesson walks through the whole algorithm, the four hooks that intercept it (`__getattribute__`, `__getattr__`, `__setattr__` and `__delattr__`), and the machinery that falls out of it: bound methods, `super()` and `__slots__`. It builds on [Classes & Objects](lesson:classes) and the [`__getattr__` section of Dunder Methods](lesson:dunder-methods#attribute-hooks-getattr). Descriptors get a lesson of their own next: [Descriptors](lesson:descriptors).

## Two dicts and a chain

:::compare
```js
class Base {
  greet() {
    return `hi, ${this.name}`;
  }
}
class User extends Base {
  constructor(name) {
    super();
    this.name = name;
  }
}
const ada = new User("Ada");

Object.getOwnPropertyNames(ada);   // ["name"]
Object.hasOwn(ada, "greet");       // false
Object.getPrototypeOf(User.prototype) === Base.prototype;  // true
```
```python
class Base:
    def greet(self):
        return f"hi, {self.name}"


class User(Base):
    def __init__(self, name):
        self.name = name



ada = User("Ada")

vars(ada)                          # {'name': 'Ada'}
"greet" in vars(ada)               # False
User.__mro__                       # (User, Base, object)
```
:::

Every instance keeps its attributes in `obj.__dict__`, a plain, writable dict that `vars(obj)` returns. A class has one too, but `Cls.__dict__` is a read-only `mappingproxy`. Changes go through `Cls.name = value` (or `setattr`), which lets Python keep its lookup caches, and the C-level slots behind dunders like `__len__`, in sync.

Instead of a linked chain of prototype objects, each class stores its search order as a tuple, `__mro__` (the method resolution order), computed once when the class is created. Looking up a name on an instance scans `vars(obj)`, then `vars(cls)` for each `cls` in `type(obj).__mro__`. [Classes & Objects](lesson:classes#multiple-inheritance-and-mixins) covers how the MRO is computed for multiple inheritance.

```python run
class Base:
    kind = "base"

    def greet(self):
        return f"hi, {self.name}"

class User(Base):
    role = "member"

    def __init__(self, name):
        self.name = name

ada = User("Ada")
print(vars(ada))                                          # the instance's own dict
print([k for k in vars(User) if not k.startswith("__")])  # User's own names
print([cls.__name__ for cls in User.__mro__])             # the search order
print("greet" in vars(ada), "greet" in vars(Base))        # ≈ Object.hasOwn
print(ada.greet(), ada.kind)                              # both found on Base
```

:::note Classes are mutable, their `__dict__` isn't
`User.__dict__["role"] = "admin"` raises `TypeError: 'mappingproxy' object does not support item assignment`, but `User.role = "admin"` works and changes what every instance sees, like patching a prototype. Since 3.13 the class dict also holds some compiler metadata: `__static_attributes__` lists the names that the class's methods assign through `self.`, and `__firstlineno__` records the line where the class starts.
:::

## The lookup order

:::compare
```js
class Box {
  constructor(w, h) {
    this.w = w;
    this.h = h;
  }
  get area() {
    return this.w * this.h;
  }
}

const box = new Box(2, 3);
Object.defineProperty(box, "area", { value: 99 });
box.area;    // 99: the own property hides the getter
```
```python
class Box:
    def __init__(self, w, h):
        self.w = w
        self.h = h

    @property
    def area(self):
        return self.w * self.h


box = Box(2, 3)
box.__dict__["area"] = 99
box.area     # 6: the property still wins
```
:::

`obj.name` runs `type(obj).__getattribute__(obj, name)`. For almost every class that's the default, `object.__getattribute__`, and it does this:

1. Find `name` on the class: the first class in `type(obj).__mro__` whose `__dict__` contains it. Call the result `attr`.
2. If `attr` is a **data descriptor**, meaning its type defines `__get__` and also `__set__` or `__delete__`, return `attr.__get__(obj, type(obj))`. Properties and `__slots__` entries are data descriptors.
3. Otherwise, if `name` is in `obj.__dict__`, return that value.
4. Otherwise, if `attr` is a **non-data descriptor** (its type defines only `__get__`), return `attr.__get__(obj, type(obj))`. Plain functions are non-data descriptors, and this step is where bound methods come from.
5. Otherwise, if `attr` was found at all, return it unchanged: an ordinary class attribute.
6. Otherwise raise `AttributeError`. If the class defines `__getattr__`, Python catches that error and calls `obj.__getattr__(name)` instead.

JavaScript has steps 3 to 5: own properties first, then the prototypes, running any getter found on the way. Step 2 is the one Python adds, and it's why a property can't be bypassed by stashing a value in the instance dict. [Descriptors](lesson:descriptors) builds both kinds by hand.

```python run
class Product:
    category = "misc"                     # plain class attribute

    def __init__(self, name):
        self.name = name                  # lives in the instance dict

    @property
    def label(self):                      # data descriptor
        return self.name.title()

    def describe(self):                   # function: a non-data descriptor
        return f"{self.label} ({self.category})"

    def __getattr__(self, name):          # the last resort
        return f"<no {name}>"

lamp = Product("desk lamp")
print(lamp.name, "|", lamp.category, "|", lamp.describe())
lamp.__dict__.update(label="ignored", describe="shadowed", category="lighting")
print(lamp.label)        # step 2: the property beats the instance dict
print(lamp.describe)     # step 3: the instance dict beats the function...
print(lamp.category)     # ...and the class attribute
print(lamp.price)        # step 6: found nowhere, so __getattr__ runs
```

:::gotcha Own properties don't always win
In JS, an own property hides anything on the prototype chain. In Python, a data descriptor on the class beats the instance's `__dict__`. Only plain class attributes and non-data descriptors such as methods can be shadowed per instance. That's what makes properties trustworthy: nothing written into `obj.__dict__` gets past the getter.
:::

:::quiz output
What does this print?

```python
class Temperature:
    @property
    def celsius(self):
        return 21

reading = Temperature()
reading.__dict__["celsius"] = 99
print(reading.celsius, reading.__dict__["celsius"])
```

- [x] `21 99`
- [ ] `99 99`
- [ ] `21 21`
- [ ] `AttributeError`

`property` is a data descriptor, so step 2 returns the getter's result before the instance dict is consulted. The `99` is really there, as the direct dict access shows. It's just unreachable through normal attribute access.
:::

:::deep Looking up attributes on a class
`Cls.name` runs `type.__getattribute__`, the same algorithm one level up. The "instance" is now the class, so its type is the metaclass (`type`, usually). Data descriptors on the metaclass come first, then the class's own MRO, where descriptors are called as `attr.__get__(None, Cls)`, then any other metaclass attributes. A function's `__get__(None, Cls)` returns the function itself and a property's returns the property object, which is why `Box.area` hands you the `property`. [Metaclasses](lesson:metaclasses) picks up the story.
:::

## Writing and deleting skip the chain

:::compare
```js
class Account {
  get balance() {
    return this._balance;
  }
  set balance(v) {
    if (v < 0) throw new RangeError("negative");
    this._balance = v;
  }
}


const acct = new Account();
acct.balance = 10;      // runs the setter found on the prototype
acct.owner = "Ada";     // creates an own property
delete acct.missing;    // true, silently
```
```python
class Account:
    @property
    def balance(self):
        return self._balance

    @balance.setter
    def balance(self, v):
        if v < 0:
            raise ValueError("negative")
        self._balance = v


acct = Account()
acct.balance = 10       # runs the setter found on the class
acct.owner = "Ada"      # goes into acct.__dict__
del acct.missing        # AttributeError
```
:::

Assignment never walks the MRO looking for a place to put the value. `obj.name = value` calls `type(obj).__setattr__(obj, name, value)`, and the default does one of two things. If the class has a data descriptor for `name`, it calls the descriptor's `__set__`, which is how property setters run. Otherwise it stores the value in `obj.__dict__`. It never writes to the class. Plain class attributes and methods don't intercept anything, so assigning to one of those names creates an instance attribute that shadows it. So far that matches JavaScript.

`del obj.name` mirrors assignment: the data descriptor's `__delete__` if there is one, otherwise removal from `obj.__dict__`, otherwise `AttributeError`, **even when the class has an attribute with that name**. Where JS's `delete` quietly returns `true` for a missing property, Python raises.

```python run
class Plan:
    seats = 5                         # a shared default

    def renew(self):
        return "renewed"

team = Plan()
team.seats = 10                       # creates an instance attribute
team.renew = "not a method"           # shadows the method for this object
print(vars(team), Plan.seats)

del team.seats, team.renew            # removes the instance attributes
print(team.seats, team.renew())       # the class versions show through again
try:
    del team.seats                    # the instance dict has no "seats" now
except AttributeError as err:
    print("AttributeError:", err)
```

:::quiz output
What happens here?

```python
class Plan:
    seats = 5

team = Plan()
team.seats += 1
del team.seats
del team.seats
print(team.seats)
```

- [ ] It prints `5`
- [ ] It prints `6`
- [x] `AttributeError`
- [ ] The second `del` removes `Plan.seats`, then the print raises

`team.seats += 1` reads `5` from the class and writes `6` into the instance dict. The first `del` removes that instance attribute. The second finds nothing in the instance dict and raises, even though `Plan.seats` is still there: `del` never reaches into the class.
:::

## Intercepting reads: `__getattr__` and `__getattribute__`

:::compare
```js
const traced = new Proxy(order, {
  get(target, name, receiver) {
    console.log(`get ${String(name)}`);
    return Reflect.get(target, name, receiver);
  },
});

traced.total;          // logs "get total"
```
```python
class Traced:
    def __getattribute__(self, name):
        print(f"get {name}")
        return super().__getattribute__(name)




order.total            # prints "get total"
```
:::

Python has two read hooks, and they nest. `__getattribute__` *is* the lookup algorithm above. Overriding it intercepts every attribute read on the instance, including method lookups and each `self.x` inside the class's own methods, like a Proxy `get` trap. Calling `super().__getattribute__(name)` runs the default algorithm, playing the part of `Reflect.get`. `__getattr__` is the fallback: Python calls it only when `__getattribute__` raises `AttributeError`.

Prefer `__getattr__`. It costs nothing for attributes that exist, and it covers the usual jobs: delegating to a wrapped object, lazy loading, and dynamic names. Override `__getattribute__` only when you must see every access, as in tracing or access control. Either way, the dunder lookups the interpreter makes for syntax and built-ins, such as `len(obj)`, bypass both hooks ([Dunder Methods](lesson:dunder-methods#syntax-is-a-method-call)).

```python run
class Traced:
    def __init__(self, items):
        self.items = items

    def total(self):
        return sum(self.items)

    def __len__(self):
        return len(self.items)

    def __getattribute__(self, name):
        print(f"  get {name}")
        return super().__getattribute__(name)

cart = Traced([5, 10])
print(cart.total())        # the method lookup AND self.items are traced
print(len(cart))           # no "get __len__": len() goes straight to the class
```

`__getattr__` makes delegation short, because it only sees the names the wrapper itself lacks. The wrapper's own attributes, `_target` and `calls` here, are found by the normal lookup and never reach it:

```python run
class Logged:
    """Wrap any object and record which of its methods get called."""

    def __init__(self, target):
        self._target = target
        self.calls = []

    def __getattr__(self, name):
        attr = getattr(self._target, name)
        if callable(attr):
            self.calls.append(name)
        return attr

tags = Logged(["python", "js"])
tags.append("rust")
tags.sort()
print(tags._target, tags.calls)
```

:::gotcha Every `self.x` inside `__getattribute__` calls `__getattribute__`
Reading `self._cache` or `self.__dict__` inside your own `__getattribute__` re-enters it, and the recursion ends in `RecursionError`. Fetch anything you need through `super().__getattribute__(...)` or `object.__getattribute__(self, ...)`.

```python
class Broken:
    def __getattribute__(self, name):
        cache = self._cache        # calls __getattribute__("_cache"), forever
        return cache[name]
```
:::

:::gotcha An `AttributeError` inside a property triggers `__getattr__`
Python can't tell "this attribute doesn't exist" from "this getter raised `AttributeError`". Either way, `__getattribute__` raised it, so `__getattr__` runs, and the real error vanishes behind your fallback's message. When a class has both, keep `__getattr__` narrow and test the properties on their own.
:::

```python run
class Order:
    def __init__(self, items, **extra):
        self.items = items
        self._extra = extra

    @property
    def total(self):
        return sum(item.price for item in self.items)   # bug: items are dicts

    def __getattr__(self, name):
        try:
            return self._extra[name]
        except KeyError:
            raise AttributeError(f"Order has no field {name!r}") from None

order = Order([{"price": 5}], coupon="SAVE10")
print(order.coupon)
try:
    order.total
except AttributeError as err:
    print(err)        # blames 'total', not the dict that has no .price
```

:::quiz output
What does this print?

```python
class Defaults:
    color = "blue"

    def __getattr__(self, name):
        return "default"

shirt = Defaults()
shirt.size = "L"
print(shirt.color, shirt.size, shirt.weight)
```

- [ ] `default default default`
- [ ] `blue default default`
- [x] `blue L default`
- [ ] `AttributeError`

`__getattr__` only runs when the normal lookup fails. `color` is found on the class and `size` in the instance dict, so only `weight` reaches the fallback.
:::

:::tip Modules have `__getattr__` too
A module-level `def __getattr__(name):` runs when someone reads a missing attribute of the module (3.7+). Libraries use it for lazy imports and for deprecation warnings on renamed names, without paying for anything up front.
:::

## Intercepting writes: `__setattr__` and `__delattr__`

:::compare
```js
const user = new Proxy({}, {
  set(target, name, value, receiver) {
    if (!["name", "email"].includes(name)) {
      throw new TypeError(`unknown field ${String(name)}`);
    }
    return Reflect.set(target, name, value, receiver);
  },
});
```
```python
class User:
    FIELDS = ("name", "email")

    def __setattr__(self, name, value):
        if name not in self.FIELDS:
            raise AttributeError(f"unknown field {name!r}")
        super().__setattr__(name, value)
```
:::

`__setattr__` sees every assignment to the instance, including the ones in `__init__`, and `__delattr__` sees every `del`. Inside them, any assignment through `self` calls `__setattr__` again, which assigns again, until `RecursionError`. Hand the real write to the default implementation with `super().__setattr__(name, value)` or the equivalent `object.__setattr__(self, name, value)`. Writing `self.__dict__[name] = value` also avoids the recursion, but it skips data descriptors, so a property setter would silently not run.

```python
class Broken:
    def __setattr__(self, name, value):
        print(f"setting {name}")
        self.name = value          # calls __setattr__ again: RecursionError
```

Reads inside `__setattr__` are fine, since they go through the read hooks, not the write hook. This class logs every change, and uses `object.__setattr__` once to create its own bookkeeping list without logging it:

```python run
class Tracked:
    def __init__(self, **fields):
        object.__setattr__(self, "changes", [])   # bypass our own hook
        for name, value in fields.items():
            setattr(self, name, value)

    def __setattr__(self, name, value):
        self.changes.append(f"set {name}={value!r}")
        super().__setattr__(name, value)          # the real write

    def __delattr__(self, name):
        self.changes.append(f"del {name}")
        super().__delattr__(name)

user = Tracked(name="Ada", plan="free")
user.plan = "pro"
del user.name
print(user.plan, hasattr(user, "name"))
print(user.changes)
```

:::pythonic That's how frozen dataclasses work
`@dataclass(frozen=True)` generates a `__setattr__` and a `__delattr__` that raise `FrozenInstanceError`, a subclass of `AttributeError`. Its generated `__init__` assigns the fields with `object.__setattr__`, the same escape hatch you'd use in `__post_init__` ([Dataclasses](lesson:dataclasses-and-enums#frozen-dataclasses)).
:::

## Bound methods are built on every lookup

:::compare
```js
const counter = new Counter();
const fn = Counter.prototype.increment;   // the plain function
const bound = fn.bind(counter);           // binding is your job
bound === fn.bind(counter);               // false: a new function each time
```
```python
counter = Counter()
fn = Counter.increment                    # the plain function
bound = fn.__get__(counter)               # what counter.increment does
bound == fn.__get__(counter)              # True (but `is` is False)
```
:::

A function is a non-data descriptor, so step 4 of the lookup calls `function.__get__(counter, Counter)`. That returns a new `method` object pairing `__func__` (the function) with `__self__` (the instance), and calling it calls `__func__(__self__, *args)`. A fresh one is built on **every** lookup, which is why `counter.increment is counter.increment` is `False` while `==` is `True`. CPython skips building the object when you call the method straight away, as in `counter.increment()`, but the behaviour is the same.

Through the class, the function's `__get__(None, Counter)` returns the function unchanged, so Python 3 has no separate "unbound method" type. And a function stored on the instance is found at step 3, before any descriptor gets a say, so it never binds. `types.MethodType(fn, obj)` binds one by hand, like `fn.bind(obj)`.

```python run
import types

class Counter:
    def __init__(self):
        self.count = 0

    def increment(self, step=1):
        self.count += step
        return self.count

counter = Counter()
method = counter.increment
print(method.__func__ is Counter.increment, method.__self__ is counter)
print(Counter.increment.__get__(counter)(10))   # bind by hand, then call
print(Counter.increment(counter))               # or pass self yourself

def reset(self):
    self.count = 0
    return "reset"

counter.reset = types.MethodType(reset, counter)   # ≈ reset.bind(counter)
print(counter.reset(), counter.count)
```

:::quiz output
What does this print?

```python
class Greeter:
    def hello(self):
        return "hi"

g = Greeter()
print(g.hello is g.hello, g.hello == g.hello, Greeter.hello is Greeter.hello)
```

- [ ] `True True True`
- [x] `False True True`
- [ ] `False False True`
- [ ] `False True False`

Each `g.hello` builds a new bound method, so `is` is `False`, but two bound methods are equal when they wrap the same function and the same instance. `Greeter.hello` is the plain function stored in the class, the same object every time.
:::

## `super()` follows the MRO

:::compare
```js
class Admin extends User {
  describe() {
    // `super` is fixed by where this method was written,
    // through the method's internal [[HomeObject]] slot
    return `${super.describe()} (admin)`;
  }
}
```
```python
class Admin(User):
    def describe(self):
        # super() means super(__class__, self), and class creation
        # fills the hidden __class__ cell with Admin
        return f"{super().describe()} (admin)"
```
:::

`super(cls, obj)` returns a proxy object. Looking a name up on it searches `type(obj).__mro__`, **starting after `cls`**, and binds whatever it finds to `obj` with `__get__`, just like the descriptor steps above. So the class it lands in depends on the type of `obj`, not on where the method was written. That's how a mixin's `super()` call can reach a class the mixin has never heard of ([Classes & Objects](lesson:classes#multiple-inheritance-and-mixins)).

The zero-argument form fills in both arguments. When a method mentions `super` (or `__class__`), the compiler gives it a hidden closure cell named `__class__`, and creating the class fills that cell with the new class. `obj` is the method's first argument. It's the same design as JS's `[[HomeObject]]`: the starting point is fixed when the method is defined.

```python run
class Base:
    def who(self):
        return ["Base"]

class Left(Base):
    def who(self):
        return ["Left", *super().who()]

class Right(Base):
    def who(self):
        return ["Right", *super().who()]

class Both(Left, Right):
    pass

both = Both()
print(both.who())                    # Left's super() continues to Right
print(super(Left, both).who())       # start the search after Left
print(Left.who.__closure__[0].cell_contents)   # the hidden __class__ cell
```

A function written outside a class body has no `__class__` cell, so attaching it to a class later doesn't give `super()` anything to work with. Pass the arguments explicitly there: `super(Fancy, self)`.

```python run raises
class Report:
    def render(self):
        return "report"

def render(self):                    # defined outside any class body
    return super().render() + "!"

class Fancy(Report):
    pass

Fancy.render = render
Fancy().render()                     # RuntimeError: super(): __class__ cell not found
```

:::gotcha `super().x = value` doesn't assign to the parent
In JS, `super.x = v` assigns to `this` (or runs an inherited setter). In Python the `super` object only supports lookups, so `super().x = value` raises `AttributeError`. To store a value, assign `self.x`. To run a parent's property setter from an overriding setter, call it explicitly: `Base.x.fset(self, value)`.
:::

:::quiz output
What does this print?

```python
class A:
    def name(self):
        return "A"

class B(A):
    def name(self):
        return "B" + super().name()

class C(A):
    def name(self):
        return "C" + super().name()

class D(B, C):
    def name(self):
        return "D" + super(B, self).name()

print(D().name())
```

- [ ] `DBCA`
- [x] `DCA`
- [ ] `DBA`
- [ ] `DA`

`D`'s MRO is `D, B, C, A, object`. `super(B, self)` starts searching *after* `B`, so `B.name` is skipped and `C.name` runs. Its own `super()` is `super(C, self)`, which lands in `A`.
:::

:::deep Where zero-argument `super()` breaks
Python finds `obj` by taking the **first argument of the current frame**. A `@staticmethod` has none, so `super()` raises `RuntimeError: super(): no arguments`. Since 3.12, list, dict and set comprehensions are inlined into the enclosing function, so `super()` works inside them. A generator expression still runs in a frame of its own whose first argument is an iterator, so `super()` there fails with `TypeError: super(type, obj): obj ... is not an instance or subtype of type`.
:::

## `vars()`, `dir()` and `__slots__`

:::compare
```js
Object.keys(ada);           // own enumerable keys
for (const k in ada) {}     // own + inherited enumerable keys
Reflect.ownKeys(ada);       // own keys, symbols included

new Proxy(ada, { ownKeys(t) { /* customise */ } });
```
```python
vars(ada)                   # the instance dict itself (live)
dir(ada)                    # own + class + bases, sorted
ada.__dict__                # the same object as vars(ada)

def __dir__(self): ...      # customise dir()
```
:::

`vars(obj)` returns `obj.__dict__` itself, the live dict rather than a copy, so writing to it writes attributes. `dir(obj)` is a different tool: a sorted list of names for humans and autocompleters, merged from the instance dict, the class and all its bases. Neither lists everything `getattr` can find. Names served by `__getattr__` are invisible to `dir()` unless you add them in `__dir__`, the counterpart of the `ownKeys` trap.

```python run
class Settings:
    defaults = {"theme": "dark"}

    def __init__(self):
        self.user = "ada"

    def __getattr__(self, name):
        if name in self.defaults:
            return self.defaults[name]
        raise AttributeError(name)

    def __dir__(self):                     # advertise the dynamic names too
        return [*super().__dir__(), *self.defaults]

settings = Settings()
print(vars(settings), settings.theme)
vars(settings)["user"] = "linus"           # the live dict
print(settings.user)
print([name for name in dir(settings) if not name.startswith("_")])
```

`__slots__` swaps the per-instance dict for fixed storage. Each slot name becomes a **member descriptor** on the class: a data descriptor whose `__get__` and `__set__` read and write a field inside the object, so slots win at step 2 of the lookup. With no instance dict there's nowhere to put an undeclared name, and `vars()` raises `TypeError`.

```python run
class Point:
    __slots__ = ("x", "y")

    def __init__(self, x, y):
        self.x, self.y = x, y

p = Point(1, 2)
print(Point.x, type(Point.x).__set__)     # a data descriptor on the class
print(Point.x.__get__(p), hasattr(p, "__dict__"))
try:
    p.z = 3
except AttributeError as err:
    print(err)

class Point3D(Point):                      # no __slots__ of its own...
    pass

print(vars(Point3D(1, 2)))                 # ...so its instances get a __dict__
```

:::gotcha A slot is a class attribute
Because the slot *is* the class attribute (the member descriptor), `__slots__ = ("x",)` next to `x = 0` raises `ValueError: 'x' in __slots__ conflicts with class variable`. Set defaults in `__init__`, or use `@dataclass(slots=True)`, which handles field defaults for you. And every class in a hierarchy needs its own `__slots__` (an empty tuple will do) for instances to stay dict-free.
:::

## Cheat sheet

| JavaScript | Python | Notes |
| --- | --- | --- |
| `obj.x` walks the prototypes | data descriptor → `obj.__dict__` → class attrs → `__getattr__` | the class gets the first look |
| prototype chain | `type(obj).__mro__` | a precomputed tuple of classes |
| `Object.hasOwn(obj, "x")` | `"x" in vars(obj)` | `vars()` raises for slotted objects |
| `Object.keys(obj)` | `vars(obj)` | the live `__dict__`, not a copy |
| devtools listing, `for...in` | `dir(obj)` | sorted; customise with `__dir__` |
| `Object.defineProperty(proto, ...)` | a descriptor on the class | data descriptors beat instance values |
| Proxy `get` trap | `__getattribute__` | every read; delegate with `super().__getattribute__` |
| fallback for missing names | `__getattr__` | only after `AttributeError` |
| `Reflect.get(t, k, r)` | `object.__getattribute__(obj, name)` | the default algorithm |
| Proxy `set` trap | `__setattr__` | write with `super().__setattr__` to avoid recursion |
| Proxy `deleteProperty` trap | `__delattr__` | `del` of a missing name raises |
| Proxy `ownKeys` trap | `__dir__` | only affects `dir()` |
| `fn.bind(obj)` | `fn.__get__(obj)`, `types.MethodType(fn, obj)` | `obj.method` does it for you |
| `super.m()` via `[[HomeObject]]` | `super().m()` via the `__class__` cell | searches `type(self).__mro__` after the class |
| `super.x = v` | `self.x = v` | `super().x = v` raises |
| `Object.preventExtensions(this)` | `__slots__` | slots are data descriptors |

## Challenges

:::challenge id=lookup-attr-dict title="A dict with dot access" difficulty=easy
Write `AttrDict`, a `dict` subclass whose keys can also be read, written and deleted as attributes, the way JS objects work:

```text
cfg = AttrDict(debug=True, port=8080)
cfg.port            ->  8080
cfg.port = 9000     # the same as cfg["port"] = 9000
del cfg.debug       # the same as del cfg["debug"]
cfg.timeout         ->  AttributeError
```

- Reading or deleting a missing key raises `AttributeError`, so `getattr(cfg, "timeout", 30)` and `hasattr()` keep working.
- Attribute writes go into the dict, never into the instance `__dict__`.
- Real attributes win: `cfg.items` is still the dict method even when there's an `"items"` key, which stays reachable as `cfg["items"]`.

```js
const cfg = { debug: true, port: 8080 };
cfg.port = 9000;
delete cfg.debug;
cfg.timeout;        // undefined
```

```python starter
class AttrDict(dict):
    ...
```

```python solution
class AttrDict(dict):
    def __getattr__(self, name):              # only runs when normal lookup fails
        try:
            return self[name]
        except KeyError:
            raise AttributeError(f"no key {name!r}") from None

    def __setattr__(self, name, value):
        self[name] = value                    # item assignment: no recursion

    def __delattr__(self, name):
        try:
            del self[name]
        except KeyError:
            raise AttributeError(f"no key {name!r}") from None
```

```python tests
import json

@test("reads keys as attributes")
def _():
    cfg = AttrDict(debug=True, port=8080)
    eq((cfg.debug, cfg.port), (True, 8080))

@test("falsy values are still found")
def _():
    cfg = AttrDict(retries=0, name="", token=None)
    eq((cfg.retries, cfg.name, cfg.token), (0, "", None))

@test("missing keys raise AttributeError")
def _():
    cfg = AttrDict(port=8080)
    raises(AttributeError, lambda: cfg.timeout)
    eq(getattr(cfg, "timeout", 30), 30, "getattr() with a default needs an AttributeError")
    check(not hasattr(cfg, "timeout"), "hasattr() should be False for a missing key")

@test("assigning an attribute writes a key")
def _():
    cfg = AttrDict(port=8080)
    cfg.port = 9000
    cfg.host = "localhost"
    eq(cfg, {"port": 9000, "host": "localhost"})
    eq(getattr(cfg, "__dict__", {}), {}, "nothing should land in the instance __dict__")

@test("del removes the key")
def _():
    cfg = AttrDict(debug=True, port=8080)
    del cfg.debug
    eq(cfg, {"port": 8080})
    with raises(AttributeError):
        del cfg.debug

@test("dict methods beat keys with the same name")
def _():
    cfg = AttrDict(items=3, keys="k")
    check(callable(cfg.items), "cfg.items should still be the dict method")
    eq(sorted(cfg.keys()), ["items", "keys"])
    eq(cfg["items"], 3)

@test("it's still a dict")
def _():
    cfg = AttrDict(a=1)
    cfg.b = 2
    check(isinstance(cfg, dict), "AttrDict should subclass dict")
    eq(json.loads(json.dumps(cfg)), {"a": 1, "b": 2})
```

```hint
`__getattr__` only runs after the normal lookup fails, so dict methods like `items` keep working for free. Translate the `KeyError` into an `AttributeError`.
```

```hint
`__setattr__` can simply do `self[name] = value`. Item assignment calls `__setitem__`, not `__setattr__`, so there's no recursion to worry about.
```
:::

:::challenge id=lookup-super-by-hand title="super() by hand" difficulty=medium
Write `super_lookup(cls, obj, name)` that returns the same thing as `super(cls, obj).<name>` for an instance `obj`, without calling `super()`:

1. Take `type(obj).__mro__` and keep only the classes **after** `cls`. If `cls` isn't in that MRO, raise `TypeError`.
2. Find the first of those classes whose **own** `__dict__` contains `name`.
3. If the type of what you found defines `__get__`, return `__get__(found, obj, type(obj))`, so methods come back bound. Otherwise return it unchanged.
4. If no class matches, raise `AttributeError`.

```text
class Both(Left, Right): ...
super_lookup(Left, Both(), "who")   is equivalent to   super(Left, Both()).who
```

```python starter
def super_lookup(cls, obj, name):
    ...
```

```python solution
def super_lookup(cls, obj, name):
    mro = type(obj).__mro__
    if cls not in mro:
        raise TypeError(f"{type(obj).__name__} object is not an instance of {cls.__name__}")
    for klass in mro[mro.index(cls) + 1:]:
        namespace = vars(klass)
        if name in namespace:
            found = namespace[name]
            kind = type(found)                  # dunders are looked up on the type
            if hasattr(kind, "__get__"):
                return kind.__get__(found, obj, type(obj))
            return found
    raise AttributeError(f"'super' object has no attribute {name!r}")
```

```python tests
class Base:
    kind = "base"

    def who(self):
        return ["Base"]

class Left(Base):
    def who(self):
        return ["Left", *super_lookup(Left, self, "who")()]

class Right(Base):
    def who(self):
        return ["Right", *super_lookup(Right, self, "who")()]

class Both(Left, Right):
    pass

@test("follows the MRO of the instance, not of the class")
def _():
    eq(Both().who(), ["Left", "Right", "Base"])
    eq(Left().who(), ["Left", "Base"])

@test("starts the search after cls")
def _():
    both = Both()
    eq(super_lookup(Left, both, "who")(), ["Right", "Base"])
    eq(super_lookup(Both, both, "who")(), ["Left", "Right", "Base"])

@test("returns methods bound to obj")
def _():
    both = Both()
    method = super_lookup(Left, both, "who")
    check(method.__self__ is both, "bind the function with __get__(obj, type(obj))")
    check(method.__func__ is Right.who, "the next who() in Both's MRO is Right.who")

@test("looks only in each class's own __dict__")
def _():
    class Root:
        def who(self):
            return "Root"
    class A(Root):                 # inherits who() without defining it
        pass
    class B(Root):
        def who(self):
            return "B"
    class C(A, B):                 # MRO: C, A, B, Root, object
        pass
    eq(super_lookup(C, C(), "who")(), "B", "getattr(A, 'who') would find Root.who and skip B")

@test("plain class attributes come back unchanged")
def _():
    eq(super_lookup(Left, Both(), "kind"), "base")

@test("looks for __get__ on the attribute's type")
def _():
    class Holder:
        class Inner:               # a class that happens to define a __get__ method
            def __get__(self, obj, owner=None):
                return "wrong"
    class Sub(Holder):
        pass
    check(super_lookup(Sub, Sub(), "Inner") is Holder.Inner, "check type(found) for __get__, not found itself")

@test("classmethods and properties bind too")
def _():
    class Model:
        @classmethod
        def table(cls):
            return cls.__name__.lower()

        @property
        def label(self):
            return "model"
    class User(Model):
        pass
    user = User()
    eq(super_lookup(User, user, "table")(), "user")
    eq(super_lookup(User, user, "label"), "model")

@test("missing names and foreign classes raise")
def _():
    raises(AttributeError, super_lookup, Left, Both(), "nope")
    raises(AttributeError, super_lookup, Base, Base(), "who")
    raises(TypeError, super_lookup, Right, Left(), "who")

@test("doesn't call super()")
def _():
    forbids_call("super", "walk type(obj).__mro__ yourself")
```

```hint
`mro.index(cls)` tells you where to start. Slice the tuple from the class after it.
```

```hint
Check `name in vars(klass)` for each remaining class. `getattr(klass, name)` would search `klass`'s own bases too, which can jump over a class that `obj`'s MRO puts in between.
```

```hint
Bind like the interpreter does: `kind = type(found)`, then `kind.__get__(found, obj, type(obj))` when `kind` has a `__get__`.
```
:::

:::challenge id=lookup-rebuild-getattr title="Rebuild getattr()" difficulty=hard
Write `get_attribute(obj, name)` that reproduces Python's default attribute lookup: what `getattr(obj, name)` does when the class doesn't override `__getattribute__`. Follow the order from this lesson:

1. Find `name` in the first class of `type(obj).__mro__` whose own `__dict__` contains it.
2. If that's a data descriptor (its type has `__get__`, plus `__set__` or `__delete__`), return its `__get__(obj, type(obj))`.
3. Otherwise, if `name` is in the instance's `__dict__` (slotted objects don't have one), return that.
4. Otherwise, if it's a non-data descriptor, return its `__get__(obj, type(obj))`.
5. Otherwise, if it was found on a class at all, return it unchanged.
6. Otherwise raise `AttributeError`.

If any of these steps raises `AttributeError` and the class defines `__getattr__`, return `__getattr__(obj, name)` instead.

Walk the dictionaries yourself: don't call `getattr(obj, name)` or `__getattribute__`. Asking questions of types, as in `hasattr(type(attr), "__set__")`, is fine.

```python starter
def get_attribute(obj, name):
    ...
```

```python solution
_MISSING = object()


def _class_lookup(cls, name):
    """The first match in cls.__mro__, looking only at each class's own dict."""
    for klass in cls.__mro__:
        if name in vars(klass):
            return vars(klass)[name]
    return _MISSING


def _default_lookup(obj, name):
    cls = type(obj)
    attr = _class_lookup(cls, name)
    kind = type(attr)
    has_get = hasattr(kind, "__get__")
    if has_get and (hasattr(kind, "__set__") or hasattr(kind, "__delete__")):
        return kind.__get__(attr, obj, cls)          # 2. data descriptor
    instance_dict = getattr(obj, "__dict__", {})
    if name in instance_dict:
        return instance_dict[name]                   # 3. the instance's own value
    if has_get:
        return kind.__get__(attr, obj, cls)          # 4. non-data descriptor
    if attr is not _MISSING:
        return attr                                  # 5. plain class attribute
    raise AttributeError(f"{cls.__name__!r} object has no attribute {name!r}")


def get_attribute(obj, name):
    try:
        return _default_lookup(obj, name)
    except AttributeError:
        fallback = _class_lookup(type(obj), "__getattr__")
        if fallback is _MISSING:
            raise
        return fallback(obj, name)                   # the last resort
```

```python tests
class Base:
    species = "human"

    def greet(self):
        return f"hi, I'm {self.name}"

class User(Base):
    role = "member"

    def __init__(self, name):
        self.name = name

    @property
    def handle(self):
        return "@" + self.name.lower()

    @classmethod
    def create(cls, name):
        return cls(name)

    @staticmethod
    def normalize(name):
        return name.strip().title()

@test("instance attributes")
def _():
    eq(get_attribute(User("Ada"), "name"), "Ada")

@test("class attributes, inherited through the MRO")
def _():
    ada = User("Ada")
    eq(get_attribute(ada, "role"), "member")
    eq(get_attribute(ada, "species"), "human")

@test("methods come back bound")
def _():
    ada = User("Ada")
    method = get_attribute(ada, "greet")
    check(getattr(method, "__self__", None) is ada, "call __get__(obj, type(obj)) on functions")
    eq(method(), "hi, I'm Ada")

@test("classmethods bind to the class, staticmethods don't bind")
def _():
    ada = User("Ada")
    eq(get_attribute(ada, "create")("Linus").name, "Linus")
    eq(get_attribute(ada, "normalize")("  grace "), "Grace")

@test("data descriptors beat the instance dict")
def _():
    ada = User("Ada")
    ada.__dict__["handle"] = "fake"
    eq(get_attribute(ada, "handle"), "@ada")

@test("the instance dict beats functions and class attributes")
def _():
    ada = User("Ada")
    ada.__dict__.update(greet="shadowed", role="admin")
    eq((get_attribute(ada, "greet"), get_attribute(ada, "role")), ("shadowed", "admin"))

@test("missing attributes raise AttributeError")
def _():
    raises(AttributeError, get_attribute, User("Ada"), "email")

@test("__getattr__ runs only as a last resort")
def _():
    class Config:
        debug = False

        def __init__(self):
            self.port = 8080

        def __getattr__(self, name):
            return f"<default {name}>"
    cfg = Config()
    eq(get_attribute(cfg, "port"), 8080)
    eq(get_attribute(cfg, "debug"), False)
    eq(get_attribute(cfg, "timeout"), "<default timeout>")

@test("an AttributeError from a property falls back to __getattr__")
def _():
    class Report:
        @property
        def total(self):
            raise AttributeError("broken getter")

        def __getattr__(self, name):
            return "fallback"
    eq(get_attribute(Report(), "total"), "fallback")

@test("works on slotted objects without a __dict__")
def _():
    class Point:
        __slots__ = ("x", "y")

        def __init__(self, x):
            self.x = x
    p = Point(3)
    eq(get_attribute(p, "x"), 3)
    raises(AttributeError, get_attribute, p, "y")     # declared but never set

@test("implements the default lookup instead of delegating")
def _():
    class Sneaky:
        def __getattribute__(self, name):
            if name == "secret":
                return "intercepted"
            return super().__getattribute__(name)
    s = Sneaky()
    s.__dict__["secret"] = "real"
    eq(get_attribute(s, "secret"), "real", "reimplement the default algorithm; don't call getattr(obj, name)")
    forbids_call("__getattribute__", "walk the dicts yourself instead of calling __getattribute__")

@test("agrees with getattr() on a mix of names")
def _():
    ada = User("Ada")
    for name in ["name", "role", "species", "handle", "greet", "create", "__class__", "__dict__", "__module__"]:
        eq(get_attribute(ada, name), getattr(ada, name), f"mismatch for {name!r}")
```

```hint
Write a helper that walks `type(obj).__mro__` and returns the first `vars(klass)[name]`, or a sentinel object when nothing matches. You'll need it twice: once for `name` and once for `__getattr__`.
```

```hint
Classify what you found by its **type**: `hasattr(type(attr), "__set__")`. Call a descriptor the way the interpreter does: `type(attr).__get__(attr, obj, type(obj))`.
```

```hint
Wrap the whole lookup in `try`/`except AttributeError`. That way an `AttributeError` raised inside a property's getter also reaches the `__getattr__` fallback, exactly as it does in real Python.
```
:::
