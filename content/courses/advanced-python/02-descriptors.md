---
title: Descriptors
part: The Object Model
summary: The protocol behind property, methods, classmethod and cached_property, and how to write reusable fields.
minutes: 40
---

`Object.defineProperty(proto, "email", { get, set })` attaches an accessor to one object, under one name. A Python **descriptor** is the same idea turned into a reusable object: anything whose class defines `__get__`, `__set__` or `__delete__`. Store one as a *class* attribute, and the lookup algorithm from [How Attribute Lookup Works](lesson:attribute-lookup) calls it whenever that name is read, written or deleted on an instance.

That one protocol explains a surprising amount of Python. `property`, bound methods, `classmethod`, `staticmethod`, `functools.cached_property` and `__slots__` are all descriptors, and so are the attributes behind Django model fields and SQLAlchemy columns. This lesson writes each of them by hand, then uses the same tools for validated fields and ORM-style columns.

## The descriptor protocol

:::compare
```js
const loud = {
  get() {
    console.log("reading email");
    return this._email;
  },
  set(value) {
    console.log("writing email");
    this._email = value;
  },
};
Object.defineProperty(User.prototype, "email", loud);

user.email = "ada@example.com";   // logs "writing email"
user.email;                       // logs "reading email"
```
```python
class Loud:
    def __get__(self, instance, owner=None):
        print("reading email")
        return instance._email

    def __set__(self, instance, value):
        print("writing email")
        instance._email = value


class User:
    email = Loud()


user.email = "ada@example.com"    # prints "writing email"
user.email                        # prints "reading email"
```
:::

A descriptor is an object whose **class** defines at least one of these methods. Put an instance of it in a class body, and Python calls it for that attribute name:

| Method | Runs for | Notes |
| --- | --- | --- |
| `__get__(self, instance, owner)` | `obj.attr`, and `Owner.attr` | on the class, `instance` is `None` |
| `__set__(self, instance, value)` | `obj.attr = value` | makes it a data descriptor |
| `__delete__(self, instance)` | `del obj.attr` | makes it a data descriptor too |

`self` is the descriptor: one object, shared by every instance of the owner class. `instance` is the object being accessed, the receiver that JS passes to an accessor as `this`. Python hands you both, plus `owner`, the class the lookup went through.

```python run
class Loud:
    def __get__(self, instance, owner=None):
        if instance is None:                  # looked up on the class itself
            return self
        print(f"  get on a {owner.__name__}")
        return instance._email

    def __set__(self, instance, value):
        print(f"  set {value!r}")
        instance._email = value

class User:
    email = Loud()

user = User()
user.email = "ada@example.com"
print(user.email)
print(User.email)                    # instance is None: the descriptor itself
user.__dict__["backup"] = Loud()
print(user.backup)                   # in an instance dict, it's just a value
```

:::tip Return the descriptor for class access
`Owner.attr` calls `__get__(None, Owner)`. Returning `self` there is the convention, and it's what `property` does: it lets docs, tests and introspection reach the descriptor object, as in `User.email`.
:::

:::gotcha Assigning on the class replaces the descriptor
`__set__` and `__delete__` intercept writes **on instances**. `User.email = "x"` on the class doesn't call `__set__`. It replaces the descriptor, and every instance silently loses the behaviour. Descriptors also do nothing when stored on an instance, as the playground shows: the protocol only applies to attributes found on the type.
:::

:::quiz output
What does this print?

```python
class Probe:
    def __get__(self, instance, owner=None):
        return instance is None

class Thing:
    flag = Probe()

print(Thing.flag, Thing().flag)
```

- [ ] `False False`
- [x] `True False`
- [ ] `False True`
- [ ] `<__main__.Probe object at ...> False`

`Thing.flag` goes through the class, so Python calls `__get__(None, Thing)`. `Thing().flag` passes the new instance. Real descriptors use that `None` check to return themselves for class access.
:::

## `__set_name__`: descriptors that know their name

:::compare
```js
function positive(proto, name) {
  const key = Symbol(name);
  Object.defineProperty(proto, name, {
    get() {
      return this[key];
    },
    set(value) {
      if (value <= 0) throw new RangeError(`${name} must be positive`);
      this[key] = value;
    },
  });
}

class Order {}
positive(Order.prototype, "quantity");    // repeat the name by hand
positive(Order.prototype, "price");
```
```python
class Positive:
    def __set_name__(self, owner, name):   # called once, at class creation
        self.name = name

    def __get__(self, instance, owner=None):
        if instance is None:
            return self
        return instance.__dict__[self.name]

    def __set__(self, instance, value):
        if value <= 0:
            raise ValueError(f"{self.name} must be positive")
        instance.__dict__[self.name] = value

class Order:
    quantity = Positive()                  # the name comes for free
    price = Positive()
```
:::

When a `class` statement finishes, class creation calls `__set_name__(owner, name)` on every attribute of the new class that defines it (3.6+). Before that hook existed, descriptors needed the name twice, as in `quantity = Positive("quantity")`, or a metaclass to fill it in.

The name also solves the storage problem. A descriptor is shared by every instance, so per-instance values must live on the instance, and `instance.__dict__[self.name]`, under the descriptor's own name, is the standard spot. A data descriptor beats the instance dict on reads, so the stored value can't shadow it, and `vars(order)` shows clean field names. Writing to `instance.__dict__` directly, rather than with `setattr`, avoids calling `__set__` again.

```python run
class Positive:
    def __set_name__(self, owner, name):
        self.name = name

    def __get__(self, instance, owner=None):
        if instance is None:
            return self
        return instance.__dict__[self.name]

    def __set__(self, instance, value):
        if value <= 0:
            raise ValueError(f"{self.name} must be positive, got {value}")
        instance.__dict__[self.name] = value

class Order:
    quantity = Positive()
    price = Positive()

    def __init__(self, quantity, price):
        self.quantity = quantity            # runs Positive.__set__
        self.price = price

order = Order(3, 9.99)
print(order.quantity, order.price, vars(order))
try:
    order.price = -1
except ValueError as err:
    print("ValueError:", err)
print(Order.price.name)
```

:::gotcha `__set_name__` only runs during class creation
A descriptor attached later, as in `Order.discount = Positive()`, never learns its name, and its first use fails with `AttributeError: 'Positive' object has no attribute 'name'`. Call the hook yourself when you add descriptors dynamically: `Order.discount.__set_name__(Order, "discount")`. Classes built with `type(name, bases, namespace)` get the call as usual.
:::

## Data and non-data descriptors

:::compare
```js
class Settings {
  get region() {
    return "eu";
  }
}

const s = new Settings();
Object.defineProperty(s, "region", { value: "us" });
s.region;       // "us": an own property always shadows a getter
```
```python
class Constant:
    def __init__(self, value):
        self.value = value

    def __get__(self, instance, owner=None):
        return self.value

class Settings:
    region = Constant("eu")

s = Settings()
s.region = "us"
s.region        # "us": a non-data descriptor can be shadowed
```
:::

Which side of the instance dict a descriptor sits on depends only on the methods its type defines:

| The descriptor's type defines | Kind | Who wins a read | Examples |
| --- | --- | --- | --- |
| `__get__` only | non-data | the instance dict | functions, `classmethod`, `staticmethod`, `cached_property` |
| `__set__` or `__delete__` | data | the descriptor | `property`, `__slots__` entries, validated fields |

A non-data descriptor is a default: it answers until the instance has its own value. That's why `obj.method = something` can override a method for one object. A data descriptor is in charge of the name: assignments go through `__set__`, and even a value smuggled into `obj.__dict__` stays hidden behind `__get__`. Defining `__set__` just to raise `AttributeError` gives you a read-only attribute that can't be shadowed, which is exactly what a property without a setter is.

```python run
class Constant:
    """Non-data: only __get__."""
    def __init__(self, value):
        self.value = value

    def __get__(self, instance, owner=None):
        return self.value

class Locked(Constant):
    """Data: adding __set__ changes the precedence."""
    def __set__(self, instance, value):
        raise AttributeError("read-only setting")

class Settings:
    region = Constant("eu")
    version = Locked(3)

s = Settings()
s.region = "us"                      # lands in the instance dict and shadows
print(s.region, Settings.region)
try:
    s.version = 4
except AttributeError as err:
    print("AttributeError:", err)
s.__dict__["version"] = 4            # even a direct write can't shadow it
print(s.version)
```

:::quiz output
What does this print?

```python
class Default:
    def __get__(self, instance, owner=None):
        return "default"

class Widget:
    color = Default()

w = Widget()
w.color = "red"
print(w.color, Widget().color)
```

- [ ] `default default`
- [x] `red default`
- [ ] `red red`
- [ ] `AttributeError`

`Default` has no `__set__`, so it's a non-data descriptor. The assignment stores `"red"` in `w.__dict__`, which wins over the descriptor for that one object. A fresh `Widget()` has an empty dict and still gets the default.
:::

:::deep Built-in types use the same protocol
The C-level attributes of built-in types are descriptors too, just implemented in C: `vars(list)["append"]` is a `method_descriptor` (binding like a function), `vars(int)["real"]` is a `getset_descriptor` (a property, in effect), and slots are `member_descriptor`s. `inspect.isdatadescriptor()` and `inspect.ismethoddescriptor()` classify any of them.
:::

## `property`, rebuilt

:::compare
```js
class Temperature {
  constructor(celsius) {
    this.celsius = celsius;
  }
  get celsius() {
    return this._celsius;
  }
  set celsius(value) {
    if (value < -273.15) throw new RangeError("below absolute zero");
    this._celsius = value;
  }
}
```
```python
class Temperature:
    def __init__(self, celsius):
        self.celsius = celsius

    @Property                    # our own, from the playground below
    def celsius(self):
        return self._celsius

    @celsius.setter
    def celsius(self, value):
        if value < -273.15:
            raise ValueError("below absolute zero")
        self._celsius = value
```
:::

`property` is a data descriptor that stores functions and calls them. `@Property` calls `Property(fget)`. Then `@celsius.setter` reads the descriptor currently bound to `celsius` in the class body and calls its `setter` method, which returns a **new** descriptor holding both functions, and the `def` rebinds `celsius` to it. That's why the setter has to reuse the property's name: under any other name, `celsius` would still be the read-only version.

```python run
class Property:
    def __init__(self, fget=None, fset=None):
        self.fget, self.fset = fget, fset

    def __get__(self, instance, owner=None):
        if instance is None:
            return self
        return self.fget(instance)

    def __set__(self, instance, value):
        if self.fset is None:
            raise AttributeError("read-only property")
        self.fset(instance, value)

    def setter(self, fset):
        return type(self)(self.fget, fset)    # a new descriptor with both

class Temperature:
    def __init__(self, celsius):
        self.celsius = celsius                # goes through Property.__set__

    @Property
    def celsius(self):
        return self._celsius

    @celsius.setter
    def celsius(self, value):
        if value < -273.15:
            raise ValueError("below absolute zero")
        self._celsius = value

    @Property
    def fahrenheit(self):
        return self.celsius * 9 / 5 + 32

t = Temperature(100)
print(t.celsius, t.fahrenheit, vars(t))
try:
    t.fahrenheit = 0
except AttributeError as err:
    print("AttributeError:", err)
```

The real `property` adds `deleter`, docstrings and clearer error messages, and it **always** defines `__set__` and `__delete__`, raising when the matching function is missing. So even a read-only property is a data descriptor, and that's why nothing written into the instance dict can shadow it.

## Functions, `classmethod` and `staticmethod`

:::compare
```js
class Temperature {
  static fromFahrenheit(f) {
    // `this` is whatever the call site puts before the dot
    return new this((f - 32) * 5 / 9);
  }
}

const parse = Temperature.fromFahrenheit;
parse(212);      // TypeError: `this` is undefined
```
```python
class Temperature:
    @classmethod
    def from_fahrenheit(cls, f):
        # cls was bound when the attribute was looked up
        return cls((f - 32) * 5 / 9)




parse = Temperature.from_fahrenheit
parse(212)       # works
```
:::

All three are non-data descriptors, and they differ only in what their `__get__` binds:

- A **function** binds the instance: `func.__get__(obj, cls)` returns a bound method ([How Attribute Lookup Works](lesson:attribute-lookup#bound-methods-are-built-on-every-lookup)), and `func.__get__(None, cls)` returns the plain function.
- A **`classmethod`** binds the class: `owner`, or `type(instance)` when no owner is passed.
- A **`staticmethod`** binds nothing and returns the function as is.

Because binding happens at lookup time, `Temperature.from_fahrenheit` is already a bound method with `cls` inside, and storing it in a variable loses nothing. Here are both decorators rebuilt in a few lines each:

```python run
import types

class ClassMethod:
    def __init__(self, func):
        self.__func__ = func

    def __get__(self, instance, owner=None):
        if owner is None:
            owner = type(instance)
        return types.MethodType(self.__func__, owner)    # bind the class

class StaticMethod:
    def __init__(self, func):
        self.__func__ = func

    def __get__(self, instance, owner=None):
        return self.__func__                             # bind nothing

class Temperature:
    def __init__(self, celsius):
        self.celsius = celsius

    @ClassMethod
    def from_fahrenheit(cls, f):
        return cls(round((f - 32) * 5 / 9, 2))

    @StaticMethod
    def is_valid(celsius):
        return celsius >= -273.15

class Reading(Temperature):
    pass

reading = Reading.from_fahrenheit(212)
print(type(reading).__name__, reading.celsius)
print(type(Reading(0).from_fahrenheit(32)).__name__)   # via an instance: still the class
print(Temperature.is_valid(-300), reading.is_valid(20))
```

Only objects whose type has a `__get__` bind at all. Built-in functions such as `len` don't have one, so storing one on a class gives you the plain function, called without `self`.

:::quiz output
What does this print?

```python
class Tools:
    size = len

    def count(self, items):
        return len(items)

    measure = count

t = Tools()
print(t.size("abc"), t.measure("abcd"))
```

- [x] `3 4`
- [ ] `TypeError`
- [ ] `AttributeError`

`len` is a built-in function with no `__get__`, so `t.size` is just `len` and receives only `"abc"`. `measure = count` stores the same Python function under a second name, and functions bind wherever they're found, so `t.measure("abcd")` passes `t` as `self`.
:::

:::note `functools.partial` binds since 3.14
A `partial` object stored as a class attribute used to stay unbound (3.13 emitted a `FutureWarning` about it). In 3.14, `partial` is a method descriptor, so it binds `self` like a plain function. Wrap it in `staticmethod()` to keep the old behaviour, or use `functools.partialmethod`, which was designed for methods from the start.
:::

## `cached_property`: a descriptor that gets out of the way

:::compare
```js
class Report {
  constructor(rows) {
    this.rows = rows;
  }
  get total() {
    const value = this.rows.reduce((a, b) => a + b, 0);
    // replace the getter with an own data property
    Object.defineProperty(this, "total", { value });
    return value;
  }
}
```
```python
class CachedProperty:
    def __init__(self, func):
        self.func = func

    def __set_name__(self, owner, name):
        self.name = name

    def __get__(self, instance, owner=None):
        if instance is None:
            return self
        value = self.func(instance)
        # store an instance value that shadows us from now on
        instance.__dict__[self.name] = value
        return value
```
:::

`functools.cached_property` is the JS self-replacing getter, built on the non-data rule. On the first read, the instance dict has no entry, so lookup reaches step 4 and calls `__get__`, which computes the value and stores it in the instance dict **under its own name**. Every later read stops at step 3 and finds the stored value. The descriptor never runs again, so a cached read costs the same as a plain attribute.

The same rule explains the rest of its behaviour. Assigning `report.total = 0` simply overwrites the cached value, `del report.total` removes it so the next read recomputes, and classes with `__slots__` (no instance dict) can't use it at all.

```python run
class CachedProperty:
    def __init__(self, func):
        self.func = func

    def __set_name__(self, owner, name):
        self.name = name

    def __get__(self, instance, owner=None):
        if instance is None:
            return self
        value = self.func(instance)
        instance.__dict__[self.name] = value
        return value

class Report:
    def __init__(self, rows):
        self.rows = rows

    @CachedProperty
    def total(self):
        print("  summing...")
        return sum(self.rows)

report = Report([120, 80])
print(report.total, report.total, vars(report))
report.rows.append(50)
del report.total                     # drop the cached value
print(report.total)
```

:::quiz output
What does this print?

```python
from functools import cached_property

class Report:
    calls = 0

    @cached_property
    def total(self):
        Report.calls += 1
        return 100

r = Report()
r.total
r.total = 5
del r.total
r.total
print(r.total, Report.calls)
```

- [ ] `5 1`
- [ ] `100 1`
- [x] `100 2`
- [ ] `AttributeError`

The first read computes `100` and caches it. `cached_property` has no `__set__`, so `r.total = 5` just overwrites the cached value in the instance dict, and `del` removes it. The next read finds nothing and computes again, for two calls in total.
:::

## Reusable validated fields

:::compare
```ts
// class-validator style: decorators record metadata,
// and a separate validate() call checks it later
class Order {
  @IsPositive() quantity!: number;
  @IsIn(["eur", "usd"]) currency!: string;
}

const errors = await validate(order);
```
```python
class Order:
    quantity = Positive()
    currency = OneOf("eur", "usd")




# checked on every assignment, no validate() step
order.quantity = 0           # ValueError
```
:::

With `__set_name__` for the name and the instance dict for storage, a validation library is a small class hierarchy. A base `Field` handles storage and reading, and each subclass contributes a `validate()` method. Validation runs on every assignment, including the ones in `__init__`, so ordinary code can't build an invalid object.

```python run
class Field:
    def __set_name__(self, owner, name):
        self.name = name

    def __get__(self, instance, owner=None):
        if instance is None:
            return self
        try:
            return instance.__dict__[self.name]
        except KeyError:
            raise AttributeError(f"{self.name!r} is not set") from None

    def __set__(self, instance, value):
        self.validate(value)
        instance.__dict__[self.name] = value

    def validate(self, value):
        pass

class Positive(Field):
    def validate(self, value):
        if not isinstance(value, (int, float)) or value <= 0:
            raise ValueError(f"{self.name} must be a positive number, got {value!r}")

class OneOf(Field):
    def __init__(self, *options):
        self.options = options

    def validate(self, value):
        if value not in self.options:
            raise ValueError(f"{self.name} must be one of {self.options}, got {value!r}")

class Order:
    quantity = Positive()
    currency = OneOf("eur", "usd")

    def __init__(self, quantity, currency):
        self.quantity = quantity
        self.currency = currency

order = Order(3, "eur")
print(vars(order))
for field, bad in [("quantity", 0), ("currency", "gbp")]:
    try:
        setattr(order, field, bad)
    except ValueError as err:
        print(err)
```

:::gotcha The descriptor is shared by every instance
There's one `Positive()` object per class attribute, not one per instance. A `__set__` that stores the value on the descriptor, as in `self.value = value`, therefore keeps a single value for **every** order, the descriptor version of the shared mutable class attribute.
:::

```python run
class Remembers:
    def __get__(self, instance, owner=None):
        return self.value

    def __set__(self, instance, value):
        self.value = value                 # BUG: one slot for all instances

class Account:
    balance = Remembers()

savings, checking = Account(), Account()
savings.balance = 1_000
checking.balance = 5
print(savings.balance)                     # 5: overwritten through another account
```

Per-instance data belongs on the instance. You have three common places to put it:

| Storage | Code | Trade-offs |
| --- | --- | --- |
| The instance dict, under the field's own name | `instance.__dict__[self.name] = value` | fastest, and `vars()` stays clean; needs a `__dict__`; data descriptors only |
| A private attribute | `setattr(instance, "_" + self.name, value)` | works with `__slots__` if `_name` is a slot; shows up in `vars()` |
| A `weakref.WeakKeyDictionary` on the descriptor | `self.values[instance] = value` | no `__dict__` needed; instances must be hashable and weak-referenceable |

## ORM-style columns

:::compare
```ts
@Entity()
class User {
  @Column("text") name!: string;
  @Column("int") age!: number;
}



repo.find({ where: { age: MoreThan(30) } });
```
```python
class User(Model):
    name = Column("TEXT")
    age = Column("INTEGER")




User.where(User.age > 30)
```
:::

ORMs use both halves of `__get__`. On an instance, a column returns that row's value. On the class, it returns the column object itself, and the column overloads comparison operators to build query expressions instead of booleans. That's why SQLAlchemy lets you write `select(User).where(User.age > 30)`: `User.age` is a descriptor, and `>` returns a SQL expression. `__set_name__` also lets each column register itself with the model, so the class knows its own schema.

```python run
class Column:
    def __init__(self, sql_type):
        self.sql_type = sql_type

    def __set_name__(self, owner, name):
        self.name = name
        owner.columns = {**getattr(owner, "columns", {}), name: self}

    def __get__(self, instance, owner=None):
        if instance is None:
            return self                          # User.age: the column itself
        return instance.__dict__.get(self.name)  # ada.age: this row's value

    def __set__(self, instance, value):
        instance.__dict__[self.name] = value

    def __gt__(self, other):                     # User.age > 30 builds SQL
        return f"{self.name} > {other!r}"

    def __eq__(self, other):                     # so does User.name == "Ada"
        return f"{self.name} = {other!r}"

class Model:
    def __init__(self, **values):
        for name, value in values.items():
            setattr(self, name, value)

    @classmethod
    def where(cls, condition):
        return f"SELECT * FROM {cls.__name__.lower()} WHERE {condition}"

class User(Model):
    name = Column("TEXT")
    age = Column("INTEGER")

print({name: col.sql_type for name, col in User.columns.items()})
print(User.where(User.age > 30))
print(User.where(User.name == "Ada"))
ada = User(name="Ada", age=36)
print(ada.name, ada.age)
```

The `getattr(owner, "columns", {})` read starts from whatever the base class registered, so a subclass of `User` inherits its columns and adds its own. Django goes one step further: each model field installs a separate descriptor on the class for the attribute you read, which is how deferred fields and foreign keys load lazily.

## Cheat sheet

| JavaScript | Python | Notes |
| --- | --- | --- |
| `Object.defineProperty(proto, k, { get })` | an object with `__get__`, as a class attribute | one descriptor serves every instance |
| `set(value)` in the accessor | `__set__(self, instance, value)` | makes it a data descriptor |
| `delete` handling | `__delete__(self, instance)` | also makes it a data descriptor |
| repeating the property name | `__set_name__(self, owner, name)` | called at class creation (3.6+) |
| reading the accessor off the prototype | `Owner.attr` → `__get__(None, Owner)` | return `self` by convention |
| own property shadows a getter | non-data descriptor (`__get__` only) | the instance dict wins |
| no equivalent | data descriptor (`__set__`/`__delete__`) | wins over the instance dict |
| `get x()` / `set x(v)` | `property` | always a data descriptor |
| `fn.bind(obj)` | `function.__get__(obj)` | how bound methods are made |
| `static m()` using `this` | `classmethod` | binds the class at lookup time |
| `static m()` | `staticmethod` | binds nothing |
| self-replacing lazy getter | `functools.cached_property` | non-data; `del obj.x` recomputes |
| `#field` storage | `instance.__dict__[self.name]` | never store per-instance state on the descriptor |
| class-validator decorators | `Field` subclasses with `validate()` | checked on every assignment |
| TypeORM `@Column` + query builder | descriptors returning themselves on the class | operators build query expressions |

## Challenges

:::challenge id=descriptor-positive-field title="A positive-number field" difficulty=easy
Write `Positive`, a data descriptor for fields that must hold positive numbers:

- Assigning `0` or a negative number raises `ValueError`. Assigning anything that isn't an `int` or `float` raises `TypeError`, and that includes `bool`: `True` is an `int` in Python, but it isn't a quantity. Both messages mention the field's name.
- Each instance keeps its own value, and a rejected value is never stored. Reading a field that was never set raises `AttributeError`.
- `LineItem.price` on the class returns the descriptor itself.
- Use `__set_name__` to learn the field's name, and keep it as `self.name`.

```python
class LineItem:
    quantity = Positive()
    price = Positive()
```

```python starter
class Positive:
    ...
```

```python solution
class Positive:
    def __set_name__(self, owner, name):
        self.name = name

    def __get__(self, instance, owner=None):
        if instance is None:
            return self
        try:
            return instance.__dict__[self.name]
        except KeyError:
            raise AttributeError(f"{self.name!r} has not been set") from None

    def __set__(self, instance, value):
        if isinstance(value, bool) or not isinstance(value, (int, float)):
            raise TypeError(f"{self.name} must be a number, got {type(value).__name__}")
        if value <= 0:
            raise ValueError(f"{self.name} must be positive, got {value}")
        instance.__dict__[self.name] = value
```

```python tests
class LineItem:
    quantity = Positive()
    price = Positive()

    def __init__(self, quantity, price):
        self.quantity = quantity
        self.price = price

@test("stores a value per instance")
def _():
    a, b = LineItem(2, 9.99), LineItem(5, 1.5)
    eq((a.quantity, a.price, b.quantity, b.price), (2, 9.99, 5, 1.5))

@test("rejects zero and negative numbers with ValueError")
def _():
    raises(ValueError, LineItem, 0, 9.99)
    item = LineItem(1, 1.0)
    err = raises(ValueError, setattr, item, "price", -5)
    check("price" in str(err), "mention the field name in the message")
    eq(item.price, 1.0, "a rejected value must not be stored")

@test("rejects non-numbers, including bools, with TypeError")
def _():
    item = LineItem(1, 1.0)
    for bad in ["3", None, True]:
        raises(TypeError, setattr, item, "quantity", bad)
    eq(item.quantity, 1)

@test("reading an unset field raises AttributeError")
def _():
    class Parcel:
        weight = Positive()
    raises(AttributeError, getattr, Parcel(), "weight")
    eq(getattr(Parcel(), "weight", "n/a"), "n/a")

@test("class access returns the descriptor")
def _():
    check(isinstance(LineItem.price, Positive), "return self when instance is None")

@test("learns its name from __set_name__")
def _():
    eq((LineItem.quantity.name, LineItem.price.name), ("quantity", "price"))
```

```hint
Store values in `instance.__dict__[self.name]`. A data descriptor wins over the instance dict on reads, so the stored value never hides it.
```

```hint
Check the type first: `isinstance(value, bool) or not isinstance(value, (int, float))`. Then check the sign. Convert the `KeyError` for an unset field into an `AttributeError` so `getattr(obj, name, default)` works.
```
:::

:::challenge id=descriptor-hybrid-method title="A method for the class and its instances" difficulty=medium
Write `hybridmethod`, a decorator like SQLAlchemy's `hybrid_method`: called on an **instance**, the function receives the instance as its first argument, and called on the **class**, it receives the class.

```text
class Product:
    @hybridmethod
    def describe(target): ...

Product.describe()           # target is Product
Product("lamp").describe()   # target is that instance
```

- Bind in `__get__`, the way functions and `classmethod` do, and return a real bound method, so `Product.describe.__self__ is Product`. Subclasses get themselves (or their instances) as the first argument.
- Like functions, it's a non-data descriptor, so an instance can shadow it with its own attribute.
- Keep the original function as `__func__`, and don't use the built-in `classmethod` or `staticmethod`.

```python starter
class hybridmethod:
    def __init__(self, func):
        self.__func__ = func
```

```python solution
import types


class hybridmethod:
    def __init__(self, func):
        self.__func__ = func

    def __get__(self, instance, owner=None):
        target = owner if instance is None else instance
        return types.MethodType(self.__func__, target)
```

```python tests
class Product:
    kind = "product"

    def __init__(self, name):
        self.name = name

    @hybridmethod
    def describe(target):
        if isinstance(target, type):
            return f"all {target.kind}s"
        return f"the {target.name}"

class Book(Product):
    kind = "book"

@test("called on the class, it receives the class")
def _():
    eq(Product.describe(), "all products")
    check(Product.describe.__self__ is Product, "bind the class when instance is None")

@test("called on an instance, it receives the instance")
def _():
    lamp = Product("lamp")
    eq(lamp.describe(), "the lamp")
    check(lamp.describe.__self__ is lamp, "bind the instance when there is one")

@test("subclasses receive themselves")
def _():
    eq(Book.describe(), "all books")
    eq(Book("novel").describe(), "the novel")

@test("works as a stored bound method")
def _():
    describe_all = Product.describe
    eq(describe_all(), "all products")

@test("is a non-data descriptor")
def _():
    lamp = Product("lamp")
    lamp.describe = lambda: "shadowed"
    eq(lamp.describe(), "shadowed", "don't define __set__: an instance attribute should win")

@test("keeps __func__ and doesn't use the built-ins")
def _():
    descriptor = vars(Product)["describe"]
    check(isinstance(descriptor, hybridmethod), "decorate with hybridmethod")
    eq(descriptor.__func__.__name__, "describe")
    names = {node.id for node in ast.walk(tree) if isinstance(node, ast.Name)}
    check(not names & {"classmethod", "staticmethod"}, "build the binding yourself with __get__")
```

```hint
`__get__(self, instance, owner)` receives `instance=None` when the lookup goes through the class. That's the only difference between the two cases.
```

```hint
`types.MethodType(func, target)` builds a bound method that passes `target` as the first argument.
```
:::

:::challenge id=descriptor-cached title="Build cached_property" difficulty=medium
Write `cached`, a decorator that works like `functools.cached_property`:

- The first read on an instance calls the method and stores the result in that instance's `__dict__` under the same name, so later reads never reach your descriptor.
- `del obj.name` drops the cached value and the next read recomputes it. Assigning `obj.name = value` replaces it.
- On the class, `Report.total` returns the descriptor itself, which keeps the method's docstring as `__doc__`.

Don't wrap `functools.cached_property`: build the descriptor yourself.

```python starter
class cached:
    def __init__(self, func):
        self.func = func
```

```python solution
class cached:
    def __init__(self, func):
        self.func = func
        self.__doc__ = func.__doc__

    def __set_name__(self, owner, name):
        self.name = name

    def __get__(self, instance, owner=None):
        if instance is None:
            return self
        value = self.func(instance)
        instance.__dict__[self.name] = value   # later reads stop at the instance dict
        return value
```

```python tests
class Report:
    def __init__(self, rows):
        self.rows = rows
        self.computed = 0

    @cached
    def total(self):
        """Sum of all rows."""
        self.computed += 1
        return sum(self.rows)

    @cached
    def biggest(self):
        self.computed += 1
        return max(self.rows)

@test("computes the value on first access")
def _():
    eq(Report([1, 2, 3]).total, 6)

@test("computes once per instance")
def _():
    report = Report([1, 2, 3])
    for _ in range(3):
        report.total
    eq(report.computed, 1)

@test("instances don't share cached values")
def _():
    a, b = Report([1]), Report([10, 20])
    eq((a.total, b.total), (1, 30))

@test("stores the value in the instance __dict__ under its own name")
def _():
    report = Report([4, 5])
    report.total
    eq(vars(report).get("total"), 9)

@test("several cached attributes in one class")
def _():
    report = Report([4, 5])
    eq((report.total, report.biggest), (9, 5))
    eq(report.computed, 2)

@test("del forces a recompute and assignment overrides")
def _():
    report = Report([1, 2])
    eq(report.total, 3)
    report.rows.append(10)
    eq(report.total, 3, "the value should stay cached")
    del report.total
    eq(report.total, 13)
    report.total = 0
    eq(report.total, 0)

@test("class access returns the descriptor, with the docstring")
def _():
    check(isinstance(Report.total, cached), "return self when instance is None")
    eq(Report.total.__doc__, "Sum of all rows.")

@test("is a non-data descriptor built from scratch")
def _():
    check(not hasattr(cached, "__set__"), "a __set__ would make it a data descriptor, which the cached value couldn't shadow")
    check("cached_property" not in source, "write the descriptor yourself instead of reusing functools.cached_property")
```

```hint
You need the attribute's name to store the value under it. `__set_name__(self, owner, name)` gives it to you.
```

```hint
Only define `__get__`. After you write `instance.__dict__[self.name] = value`, step 3 of the lookup finds the instance value before step 4 would call your descriptor, and `del` and assignment act on the instance dict.
```
:::

:::challenge id=descriptor-typed-model title="Typed models from descriptors" difficulty=hard
Build a tiny model layer from descriptors:

- `Field(kind, default=_MISSING)` is a data descriptor. Assigning a value that isn't an instance of `kind` raises `TypeError` naming the field. Reading a field that was never set returns its default, or raises `AttributeError` if it has none.
- `Model` is a base class with `fields = ()`. Every subclass's `fields` lists its field names in definition order, with inherited fields first.
- `Model(**values)` sets the given fields. It raises `TypeError` for unknown names, and for required fields (those without a default) that are missing.
- `repr()` looks like `Product(name='Lamp', price=19.5, stock=0)`, and two models are `==` when they're the same class with the same field values.
- On the class, `Product.price` is the `Field` itself, with `.name` and `.kind` attributes.

```text
class Product(Model):
    name = Field(str)
    price = Field(float)
    stock = Field(int, default=0)

Product(name="Lamp", price=19.5)   ->  Product(name='Lamp', price=19.5, stock=0)
Product.fields                     ->  ('name', 'price', 'stock')
```

```python starter
_MISSING = object()


class Field:
    def __init__(self, kind, default=_MISSING):
        self.kind = kind
        self.default = default


class Model:
    fields = ()
```

```python solution
_MISSING = object()


class Field:
    def __init__(self, kind, default=_MISSING):
        self.kind = kind
        self.default = default

    def __set_name__(self, owner, name):
        self.name = name
        if name not in owner.fields:           # starts from the inherited tuple
            owner.fields = (*owner.fields, name)

    def __get__(self, instance, owner=None):
        if instance is None:
            return self
        try:
            return instance.__dict__[self.name]
        except KeyError:
            if self.default is _MISSING:
                raise AttributeError(f"{self.name!r} has no value") from None
            return self.default

    def __set__(self, instance, value):
        if not isinstance(value, self.kind):
            raise TypeError(f"{self.name} must be {self.kind.__name__}, got {type(value).__name__}")
        instance.__dict__[self.name] = value


class Model:
    fields = ()

    def __init__(self, **values):
        unknown = values.keys() - set(self.fields)
        if unknown:
            raise TypeError(f"unknown field(s): {', '.join(sorted(unknown))}")
        for name in self.fields:
            if name in values:
                setattr(self, name, values[name])
            elif getattr(type(self), name).default is _MISSING:
                raise TypeError(f"missing required field {name!r}")

    def __repr__(self):
        args = ", ".join(f"{name}={getattr(self, name)!r}" for name in self.fields)
        return f"{type(self).__name__}({args})"

    def __eq__(self, other):
        if type(other) is not type(self):
            return NotImplemented
        return all(getattr(self, name) == getattr(other, name) for name in self.fields)
```

```python tests
class Product(Model):
    name = Field(str)
    price = Field(float)
    stock = Field(int, default=0)

class Book(Product):
    isbn = Field(str, default="")

@test("stores values per instance")
def _():
    lamp = Product(name="Lamp", price=19.5)
    desk = Product(name="Desk", price=120.0, stock=3)
    eq((lamp.name, lamp.price, lamp.stock), ("Lamp", 19.5, 0))
    eq((desk.name, desk.price, desk.stock), ("Desk", 120.0, 3))

@test("type-checks every assignment")
def _():
    lamp = Product(name="Lamp", price=19.5)
    err = raises(TypeError, setattr, lamp, "stock", "3")
    check("stock" in str(err), "name the field in the error message")
    raises(TypeError, Product, name=42, price=1.0)
    lamp.stock = 7
    eq(lamp.stock, 7)

@test("unset fields fall back to the default or raise AttributeError")
def _():
    blank = Product.__new__(Product)           # an instance that skipped __init__
    eq(blank.stock, 0)
    raises(AttributeError, getattr, blank, "name")

@test("rejects missing required fields and unknown names")
def _():
    raises(TypeError, Product, name="Lamp")
    raises(TypeError, Product, name="Lamp", price=1.0, color="red")

@test("fields lists names in order, inherited ones first")
def _():
    eq(Model.fields, ())
    eq(Product.fields, ("name", "price", "stock"))
    eq(Book.fields, ("name", "price", "stock", "isbn"))

@test("subclasses inherit the fields")
def _():
    novel = Book(name="Dune", price=9.5, isbn="978-0441013593")
    eq((novel.name, novel.stock, novel.isbn), ("Dune", 0, "978-0441013593"))
    raises(TypeError, Book, price=9.5)

@test("class access returns the Field")
def _():
    check(isinstance(Product.price, Field), "Product.price should be the Field object")
    eq((Product.price.name, Product.price.kind), ("price", float))

@test("repr and equality")
def _():
    lamp = Product(name="Lamp", price=19.5)
    eq(repr(lamp), "Product(name='Lamp', price=19.5, stock=0)")
    eq(lamp, Product(name="Lamp", price=19.5, stock=0))
    check(lamp != Product(name="Lamp", price=20.0), "different values aren't equal")
    check(Book(name="Lamp", price=19.5) != lamp, "different classes aren't equal")
```

```hint
`__set_name__` runs once per field, in definition order, while the subclass is being created. Reading `owner.fields` there finds the base class's tuple through normal inheritance, so `owner.fields = (*owner.fields, name)` extends it for the subclass only.
```

```hint
In `Model.__init__`, `getattr(type(self), name)` gives you the `Field` object (class access returns the descriptor), so you can check whether it has a default.
```

```hint
`values.keys() - set(self.fields)` finds unknown names in one step. In `__eq__`, return `NotImplemented` for other classes and compare `getattr(self, name)` for every field.
```
:::
