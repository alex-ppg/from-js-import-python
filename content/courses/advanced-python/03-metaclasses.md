---
title: Classes as Objects & Metaclasses
part: The Object Model
summary: Classes are instances of type: how a class statement runs, and when you need a metaclass at all.
minutes: 40
---

In JavaScript, a class is a function with a prototype, and making one at runtime means a class expression inside a factory function. In Python, a class is an ordinary object too, and its type is `type`. `type` is itself a class: call it and you get a new class, subclass it and you change how classes behave. A subclass of `type` is a **metaclass**, and every `class` statement is sugar for calling one.

Metaclasses are the heaviest tool in the box. Most problems that look like they need one are solved more simply by a class decorator, `__init_subclass__` or a descriptor ([Descriptors](lesson:descriptors)). This lesson walks through the whole class-creation sequence so you can pick the lightest tool that works, then builds what only a metaclass can do: custom class namespaces, operators on the class object, and control over instantiation.

## Classes are objects

:::compare
```js
class User {}

typeof User;                     // "function"
Object.getPrototypeOf(User);     // Function.prototype

const registry = { user: User }; // classes are values

const withTags = (Base) =>       // and can be made at runtime
  class extends Base {
    tags = new Set();
  };
```
```python
class User:
    pass

type(User)                       # <class 'type'>
type(type)                       # <class 'type'>: type is its own type

registry = {"user": User}        # classes are values

def with_tags(base):             # and can be made at runtime
    class Tagged(base):
        def __init__(self, *args, **kwargs):
            super().__init__(*args, **kwargs)
            self.tags = set()
    return Tagged
```
:::

A class is an object with a type, like any other value, and for ordinary classes that type is `type`. The chain stops there because `type` is an instance of itself. Keep two relations apart: `type(x)` and `isinstance` describe *instance of* (the metaclass relation), while `__bases__` and `issubclass` describe *subclass of* (inheritance). `object` is the root of one and `type` the root of the other, so `isinstance(object, type)` and `issubclass(type, object)` are both true.

Because a `class` statement is executable code, the JS class-factory pattern works unchanged: define a class inside a function, close over the arguments, return it. Each call produces a brand-new class object.

```python run
class User:
    def greet(self):
        return "hi"

ada = User()
print(type(ada), type(User), type(type))
print(isinstance(User, type), issubclass(User, object))
print(isinstance(object, type), issubclass(type, object))   # the two roots

def with_greeting(base, greeting):          # a class factory, like a JS mixin
    class Greeter(base):
        def greet(self):
            return greeting
    return Greeter

French = with_greeting(User, "bonjour")
print(French().greet(), [cls.__name__ for cls in French.__mro__])
print(with_greeting(User, "hola") is French)   # a new class on every call
```

## Building classes with `type()`

:::compare
```js
const errors = {};
for (const name of ["NotFound", "Conflict"]) {
  errors[name] = class extends ApiError {};
  Object.defineProperty(errors[name], "name", { value: name });
}
```
```python
errors = {
    name: type(name, (ApiError,), {})
    for name in ["NotFound", "Conflict"]
}
```
:::

With one argument, `type(obj)` tells you an object's type. With three, it **creates** a class from a name, a tuple of bases and a namespace dict, which becomes the class's `__dict__`. It's what a `class` statement does after running the body, and it runs the same machinery: the bases' metaclass, `__set_name__` and `__init_subclass__` all apply. The standard library builds classes this way too: `collections.namedtuple` calls `type()`, and `dataclasses.make_dataclass` and the functional `Enum("Color", "RED GREEN")` API also create classes at runtime.

```python run
class ApiError(Exception):
    status = 500

    def __str__(self):
        return f"{self.status} {type(self).__name__}"

STATUS_CODES = {"BadRequest": 400, "NotFound": 404, "Conflict": 409}
errors = {
    name: type(name, (ApiError,), {"status": code})
    for name, code in STATUS_CODES.items()
}

NotFound = errors["NotFound"]
print([cls.__name__ for cls in NotFound.__mro__])
print(NotFound(), isinstance(NotFound(), ApiError))
try:
    raise errors["Conflict"]()
except ApiError as err:
    print("caught:", err)
```

:::tip `types.new_class` for the full `class` behaviour
`type(name, bases, ns)` skips two steps of a `class` statement. It never calls the metaclass's `__prepare__`, and it only accepts real classes as bases, so `type("X", (Generic[T],), {})` raises `TypeError: type() doesn't support MRO entry resolution; use types.new_class()`. `types.new_class(name, bases, kwds, exec_body)` performs both steps, so prefer it when generating classes that rely on a metaclass.
:::

## How a `class` statement runs

:::compare
```js
class Order extends Base {
  static total = 0;            // evaluated once, at definition
  static {
    console.log("static blocks run at definition time");
  }
}
```
```python
class Order(Base):
    total = 0                  # evaluated once, at definition
    print("the whole body runs at definition time")
```
:::

A class body is ordinary code that runs once, top to bottom, when the `class` statement executes, the way a JS static block does. What happens around it is a fixed sequence:

1. **Pick the metaclass.** That's the `metaclass=` keyword if there is one, but it has to be compatible with the bases' own metaclasses: Python takes the most derived of all of them (`type` for plain classes) and raises `TypeError` if there isn't one.
2. **Prepare the namespace.** `__prepare__(name, bases, **kwargs)` on the metaclass returns the mapping the body writes into, normally an empty `dict`.
3. **Run the body** in that namespace. Every assignment and `def` becomes an entry.
4. **Call the metaclass**: `Meta(name, bases, namespace, **kwargs)`. That's an ordinary call, so `type.__call__` runs `Meta.__new__`, then `Meta.__init__`.
5. **Inside `type.__new__`**, once the class object exists, Python calls `__set_name__` on each attribute that defines it, then `__init_subclass__` on the parent class, passing the class keywords along.
6. **Apply class decorators**, bottom to top, to the finished class.
7. **Bind** the result to the class's name.

This trace hooks every step. Run it and match the numbers:

```python run
class Field:
    def __set_name__(self, owner, name):
        print(f"4. __set_name__({owner.__name__}, {name!r})")

class Meta(type):
    @classmethod
    def __prepare__(mcls, name, bases, **kwargs):
        print(f"1. __prepare__({name!r}, kwargs={kwargs})")
        return {}

    def __new__(mcls, name, bases, namespace, **kwargs):
        print(f"3. Meta.__new__ for {name}")
        cls = super().__new__(mcls, name, bases, namespace, **kwargs)
        print("6. type.__new__ returned the class")
        return cls

    def __init__(cls, name, bases, namespace, **kwargs):
        print("7. Meta.__init__")
        super().__init__(name, bases, namespace, **kwargs)

class Base(metaclass=Meta):
    def __init_subclass__(cls, table=None, **kwargs):
        super().__init_subclass__(**kwargs)
        print(f"5. __init_subclass__({cls.__name__}, table={table!r})")

def register(cls):
    print("8. class decorator")
    return cls

print("---- class Order")

@register
class Order(Base, table="orders"):
    print("2. the class body runs")
    price = Field()

print("9. bound to the name:", Order.__name__)
```

Defining `Base` already goes through the metaclass, minus step 5: `__init_subclass__` runs for subclasses, never for the class that defines it. Notice also that `Meta.__new__` passes `**kwargs` on to `type.__new__`. Drop them there and `__init_subclass__` never sees `table="orders"`.

:::gotcha Annotations aren't in the namespace any more (3.14)
Metaclasses written for older Pythons often read `namespace["__annotations__"]` in `__new__`. With 3.14's lazy annotations, the class body stores a function under `__annotate_func__` instead, and that lookup raises `KeyError`. Create the class first, then read the annotations from it: `annotationlib.get_annotations(cls)`, or `cls.__annotations__` ([Type Hints](lesson:type-hints#annotations-at-runtime)).
:::

:::quiz output
What does this print?

```python
log = []

class Plugin:
    def __init_subclass__(cls, **kwargs):
        super().__init_subclass__(**kwargs)
        log.append(f"init_subclass:{cls.__name__}")

def tag(cls):
    log.append(f"decorator:{cls.__name__}")
    return cls

@tag
class Csv(Plugin):
    log.append("body")

print(" ".join(log))
```

- [ ] `init_subclass:Csv body decorator:Csv`
- [x] `body init_subclass:Csv decorator:Csv`
- [ ] `decorator:Csv body init_subclass:Csv`
- [ ] `body decorator:Csv init_subclass:Csv`

The body runs first, to fill the namespace. `__init_subclass__` runs inside `type.__new__`, while the class is being created. The decorator can only run afterwards, because it receives the finished class.
:::

## `__init_subclass__`: the hook you usually want

:::compare
```js
class Command {
  static registry = new Map();
  static register(name) {
    Command.registry.set(name, this);
  }
}

class Status extends Command {
  static { this.register("status"); }   // each subclass must remember
}
```
```python
class Command:
    registry = {}

    def __init_subclass__(cls, name, **kwargs):
        super().__init_subclass__(**kwargs)
        Command.registry[name] = cls


class Status(Command, name="status"):
    pass                                 # registered automatically
```
:::

`__init_subclass__` (3.6+) covers the two most common metaclass jobs, registries and checking subclasses, with no metaclass at all. It's an implicit classmethod that Python calls on the **parent** after creating each subclass, with the new class as `cls` and the keywords from the `class` line as arguments. It runs for every descendant, grandchildren included, and because the base keeps the default metaclass, it combines freely with any other base class. [Dunder Methods](lesson:dunder-methods#context-managers-and-subclass-hooks) introduced the registry pattern. Validation works the same way, and an error raised there aborts the `class` statement:

```python run
class Command:
    commands = {}

    def __init_subclass__(cls, abstract=False, **kwargs):
        super().__init_subclass__(**kwargs)
        if abstract:
            return                               # an intermediate base: no checks
        if not isinstance(getattr(cls, "name", None), str):
            raise TypeError(f"{cls.__name__} must define a string 'name'")
        Command.commands[cls.name] = cls

class GitCommand(Command, abstract=True):
    def run(self):
        return f"git {self.name}"

class Status(GitCommand):
    name = "status"

class Push(GitCommand):
    name = "push"

print(list(Command.commands), Command.commands["push"]().run())
try:
    class Broken(GitCommand):
        pass
except TypeError as err:
    print("TypeError:", err)
```

:::pythonic Fail at import time
A check in `__init_subclass__` fails as soon as the module defining the bad class is imported, not when someone finally reaches the broken code path. It's Python's version of TypeScript's `abstract` members and `implements` clauses: not static, but early. Always accept `**kwargs` and pass them to `super().__init_subclass__()`, so the hooks of several bases can cooperate.
:::

:::quiz output
What does this print?

```python
seen = []

class Base:
    def __init_subclass__(cls, **kwargs):
        super().__init_subclass__(**kwargs)
        seen.append(cls.__name__)

class Child(Base):
    pass

class GrandChild(Child):
    pass

print(seen)
```

- [ ] `['Base', 'Child', 'GrandChild']`
- [ ] `['Child']`
- [x] `['Child', 'GrandChild']`
- [ ] `[]`

`Base.__init_subclass__` is inherited, so it runs for every class below `Base`, at any depth. It never runs for `Base` itself: the hook belongs to the parent, and `Base`'s parent is `object`.
:::

## Class decorators: one class at a time

:::compare
```ts
function withId(cls: any, context: ClassDecoratorContext) {
  cls.id = String(context.name).toLowerCase();
}

@withId
class Report {}
```
```python
def with_id(cls):
    cls.id = cls.__name__.lower()
    return cls


@with_id
class Report: ...
```
:::

A class decorator receives the finished class and returns it, changed or replaced ([Decorators](lesson:decorators#classes-as-decorators-decorators-for-classes)). It's the simplest tool here and the most local one: it runs once, on the class it decorates, and **subclasses don't run it again**. They inherit whatever it put on the parent, which may be stale. `@dataclass` behaves the same way: a subclass of a dataclass gets no generated methods for its own fields until you decorate it too.

```python run
def auto_repr(cls):
    fields = list(cls.__annotations__)      # read once, at decoration time

    def __repr__(self):
        args = ", ".join(f"{name}={getattr(self, name)!r}" for name in fields)
        return f"{type(self).__name__}({args})"

    cls.__repr__ = __repr__
    return cls

@auto_repr
class Point:
    x: int
    y: int

    def __init__(self, x, y):
        self.x, self.y = x, y

class Point3D(Point):                        # not decorated
    z: int

    def __init__(self, x, y, z):
        super().__init__(x, y)
        self.z = z

print(Point(1, 2))
print(Point3D(1, 2, 3))                      # the inherited repr knows only x and y
```

Use a decorator when the change belongs to one class, and `__init_subclass__` when it belongs to a whole hierarchy.

## Writing a metaclass

:::compare
```js
class Model {
  static tableName() {             // inherited by subclasses...
    return this.name.toLowerCase() + "s";
  }
}
class User extends Model {}

User.tableName();                  // "users"
new User().tableName;              // undefined: not on instances
```
```python
class ModelMeta(type):
    def table_name(cls):           # a method of the class object
        return cls.__name__.lower() + "s"

class Model(metaclass=ModelMeta): ...
class User(Model): ...

User.table_name()                  # 'users'
User().table_name                  # AttributeError: not on instances
```
:::

A metaclass is a subclass of `type`, and its methods are methods **of the classes it creates**, just as a class's methods are methods of its instances. The lookup rules from [How Attribute Lookup Works](lesson:attribute-lookup) apply one level up, so `User.table_name` finds the method on the metaclass, while an instance's lookup only searches `User`'s MRO and never sees it. That's the same visibility as a JS `static` method, and different from a `classmethod`, which instances can also reach.

The metaclass is inherited along with the base class: every subclass of `Model` is created by `ModelMeta`. That gives a metaclass three powers nothing else has:

- **Hooks around class creation.** `__prepare__` chooses the namespace the body runs in, and `__new__` and `__init__` can inspect or rewrite the class.
- **Behaviour of the class object itself.** Dunders on the metaclass apply to the class: `__iter__`, `__len__`, `__getitem__` and `__contains__` make `for x in Color` or `Color["RED"]` work, `__repr__` changes how the class prints, and `__instancecheck__` customises `isinstance()`, like JS's `static [Symbol.hasInstance]`.
- **Control over instantiation.** `User(...)` is a call on the class object, so it runs `type(User).__call__`. The next section uses that.

`__prepare__` is the rarest of these. Here it swaps in a dict that refuses to define the same method twice, a copy-paste bug that plain Python silently accepts (the second `def` wins):

```python run raises
class NoRedefinitions(dict):
    def __setitem__(self, key, value):
        if key in self and not key.startswith("__"):
            raise TypeError(f"{key!r} is defined twice in the class body")
        super().__setitem__(key, value)

class StrictMeta(type):
    @classmethod
    def __prepare__(mcls, name, bases, **kwargs):
        return NoRedefinitions()

class UserApi(metaclass=StrictMeta):
    def get_user(self): ...
    def list_users(self): ...
    def get_user(self): ...          # pasted twice by accident
```

Dunders on a metaclass shape the class object. This one gives every class a list of its direct subclasses, and makes the class itself iterable, sized and printable:

```python run
class PluginMeta(type):
    def __init__(cls, name, bases, namespace, **kwargs):
        super().__init__(name, bases, namespace, **kwargs)
        cls.plugins = []                          # every class gets its own list
        for base in bases:
            if isinstance(base, PluginMeta):
                base.plugins.append(cls)

    def __iter__(cls):                            # for plugin in Exporter: ...
        return iter(cls.plugins)

    def __len__(cls):                             # len(Exporter)
        return len(cls.plugins)

    def __repr__(cls):                            # how the class prints
        return f"<plugin {cls.__name__}>"

class Exporter(metaclass=PluginMeta): ...
class Csv(Exporter): ...
class Json(Exporter): ...

print(len(Exporter), list(Exporter))
print(Csv, type(Csv).__name__, repr(Csv())[:20])
```

:::gotcha Metaclass conflicts
Every class has exactly one metaclass, and it must be a subclass of the metaclasses of all its bases. Mixing bases whose metaclasses are unrelated raises `TypeError: metaclass conflict: the metaclass of a derived class must be a (non-strict) subclass of the metaclasses of all its bases`. That's a real cost of shipping a metaclass in a library: your users can't combine your base class with an ABC or with another framework's models unless they write a merged metaclass (`class Both(MetaA, MetaB): pass`). Decorators and `__init_subclass__` never conflict.
:::

:::quiz output
What does this print?

```python
class Meta(type):
    def describe(cls):
        return f"class {cls.__name__}"

class Model(metaclass=Meta):
    pass

class User(Model):
    pass

print(User.describe(), hasattr(User(), "describe"))
```

- [ ] `class Model False`
- [x] `class User False`
- [ ] `class User True`
- [ ] `AttributeError`

`User` inherits the metaclass, so `User.describe()` binds `User` as `cls`. An instance's lookup searches `User.__mro__` (`User`, `Model`, `object`), and `describe` lives on `Meta`, which isn't in it.
:::

:::deep What `__prepare__` was for
`__prepare__` arrived with Python 3's metaclass syntax, mostly so a class could return an `OrderedDict` and remember the order of its body. Since 3.6 the default namespace keeps definition order, so today it's mainly for namespaces that react while the body runs: rejecting duplicates as above, or `enum`'s namespace, which records member names and fills in `auto()` values as each line executes. Whatever mapping you return only exists during the body: `type.__new__` copies it into a regular dict, which is what `vars(cls)` shows afterwards.
:::

## Controlling instantiation with `__call__`

:::compare
```js
class Config {
  static #instance;

  constructor() {
    if (Config.#instance) return Config.#instance;   // a constructor may return an object
    Config.#instance = this;
    this.settings = {};
  }
}

new Config() === new Config();     // true
```
```python
class Singleton(type):
    def __call__(cls, *args, **kwargs):
        if "_instance" not in vars(cls):
            cls._instance = super().__call__(*args, **kwargs)
        return cls._instance


class Config(metaclass=Singleton):
    def __init__(self):
        self.settings = {}

Config() is Config()               # True
```
:::

`Config()` calls the class object, so Python runs `type(Config).__call__(Config)`. The default, `type.__call__`, is what calls `__new__` and then `__init__`. Overriding it on a metaclass controls instantiation completely: return a cached instance (singletons, flyweights, interning), build a different class, or validate arguments before `__init__` ever runs. Checking `vars(cls)` gives every subclass its own instance, where `hasattr(cls, "_instance")` would find the parent's through inheritance.

```python run
class Singleton(type):
    def __call__(cls, *args, **kwargs):
        if "_instance" not in vars(cls):          # per class, not inherited
            cls._instance = super().__call__(*args, **kwargs)
        return cls._instance

class Config(metaclass=Singleton):
    def __init__(self):
        print("  loading config")
        self.settings = {}

class TestConfig(Config):
    pass

first = Config()
first.settings["debug"] = True
print(Config() is first, Config().settings)       # __init__ ran only once
print(TestConfig() is first)                      # a subclass gets its own instance
```

:::gotcha A `__new__` singleton re-runs `__init__`
The popular alternative, returning a cached instance from `__new__`, has a catch: `type.__call__` runs `__init__` on whatever `__new__` returns when it's an instance of the class, so every `Config()` call re-initialises the shared object and wipes `settings`. And the most Pythonic singleton is no class trick at all: create one instance at module level and import it, since a module only runs once ([Modules](lesson:modules-and-tooling#modules-run-once)).
:::

:::quiz output
What does this print?

```python
class Meta(type):
    def __call__(cls, *args, **kwargs):
        return "intercepted"

class Thing(metaclass=Meta):
    def __init__(self):
        print("init")

print(Thing())
```

- [x] `intercepted`
- [ ] `init`, then `intercepted`
- [ ] `<__main__.Thing object at ...>`
- [ ] `TypeError`

`Thing()` runs `Meta.__call__`, which returns a string without calling `super().__call__()`. That's the call that would run `__new__` and `__init__`, so no instance is ever created and `init` never prints.
:::

## Metaclasses in the standard library

:::compare
```ts
abstract class Shape {
  abstract area(): number;
}

class Square extends Shape {}
// compile error: Square doesn't implement area()
```
```python
class Shape(ABC):              # ABC's metaclass is ABCMeta
    @abstractmethod
    def area(self): ...

class Square(Shape): ...
Square()                       # TypeError, at instantiation
```
:::

`abc.ABC` is an empty class whose metaclass is `abc.ABCMeta` ([Classes & Objects](lesson:classes#abstract-base-classes-and-duck-typing)). When a class is created, `ABCMeta.__new__` collects every name still marked by `@abstractmethod`, whether defined there or inherited and not overridden, into `__abstractmethods__`. Instantiation then refuses any class whose set isn't empty. The mechanism is small enough to rebuild:

```python run
def abstract(func):
    func.is_abstract = True
    return func

class AbstractMeta(type):
    def __new__(mcls, name, bases, namespace, **kwargs):
        cls = super().__new__(mcls, name, bases, namespace, **kwargs)
        cls.missing = sorted(
            attr for attr in dir(cls) if getattr(getattr(cls, attr), "is_abstract", False)
        )
        return cls

    def __call__(cls, *args, **kwargs):
        if cls.missing:
            raise TypeError(f"can't instantiate {cls.__name__}: implement {', '.join(cls.missing)}")
        return super().__call__(*args, **kwargs)

class Shape(metaclass=AbstractMeta):
    @abstract
    def area(self): ...

    @abstract
    def perimeter(self): ...

class Square(Shape):
    def __init__(self, side):
        self.side = side

    def area(self):
        return self.side ** 2

print(Shape.missing, Square.missing)
try:
    Square(3)
except TypeError as err:
    print("TypeError:", err)
```

`ABCMeta` also overrides `__instancecheck__` and `__subclasscheck__`, so `isinstance()` can answer yes without inheritance. `register()` declares a virtual subclass, and `__subclasshook__` lets an ABC recognise classes by shape: `collections.abc` uses it to treat anything with a `__len__` as `Sized` and anything with `__iter__` as `Iterable`, which is duck typing that `isinstance()` understands.

```python run
from abc import ABC, abstractmethod
from collections.abc import Sized

class Shape(ABC):
    @abstractmethod
    def area(self): ...

print(type(Shape).__name__, set(Shape.__abstractmethods__))

class Bag:                                    # no base class at all
    def __len__(self):
        return 0

print(isinstance(Bag(), Sized), Sized in Bag.__mro__)

Shape.register(int)                           # trust me, ints are shapes
print(isinstance(3, Shape), issubclass(int, Shape))
```

`enum` is the other classic: `type(Color)` is `enum.EnumType`, whose `__iter__`, `__len__`, `__getitem__` and `__call__` make `list(Color)`, `Color["RED"]` and `Color(1)` work ([Enums](lesson:dataclasses-and-enums#enums)). Outside the standard library, Django's `Model` and pydantic's `BaseModel` are built on metaclasses too.

### `__class_getitem__`: generics without a metaclass

`Cls[...]` first looks for `__getitem__` on the metaclass, so subscripting a class used to require one (`typing` had a `GenericMeta` for exactly this). Since 3.7, if the metaclass has no `__getitem__`, Python calls the class's own `__class_getitem__`, an implicit classmethod. That's how `list[int]` works, and with PEP 695 syntax (`class Box[T]:`, 3.12+) Python adds `typing.Generic` and the hook for you ([Type Hints](lesson:type-hints#generics-and-type-aliases)).

```python run
class Registry:
    def __class_getitem__(cls, item):          # implicitly a classmethod
        return f"{cls.__name__} of {item.__name__}"

print(Registry[int])                           # no metaclass needed

class Box[T]:                                  # 3.12+ generic syntax
    pass

print(list[int], Box[str], Box.__type_params__)
```

## When not to use a metaclass

The old Python saying is that if you have to ask whether you need a metaclass, you don't. Since 3.6, `__init_subclass__` and `__set_name__` have absorbed most of their remaining jobs. Metaclasses also spread: every subclass your users write is created by yours, and they collide with other metaclasses. Reach for the lightest tool that works:

| You need | Reach for | Why |
| --- | --- | --- |
| Code that runs for every subclass (registries, checks) | `__init_subclass__` | no metaclass, combines with any base |
| To add or rewrite methods on one class | a class decorator | explicit and local; not inherited |
| Per-attribute behaviour that knows its name | a descriptor with `__set_name__` | [Descriptors](lesson:descriptors) |
| Classes generated from data | `type()`, `types.new_class`, or a `class` in a function | ordinary code |
| `Box[int]` | `__class_getitem__` or `class Box[T]:` | no metaclass since 3.7 |
| One shared instance | a module-level object | modules run once |
| A custom namespace while the body runs | a metaclass with `__prepare__` | nothing else runs that early |
| Operators, `repr` or iteration on the class itself | a metaclass | dunders are looked up on the type |
| Control over every instantiation in a hierarchy | a metaclass `__call__` | or a factory function |

## Cheat sheet

| JavaScript | Python | Notes |
| --- | --- | --- |
| `typeof User === "function"` | `type(User) is type` | classes are instances of `type` |
| `const C = class extends B {}` | `C = type("C", (B,), {})` | or a `class` statement inside a function |
| class factory `(Base) => class extends Base {}` | a function that defines and returns a class | a new class per call |
| `static { ... }` block | the class body itself | runs once, at definition time |
| `this.register()` in every subclass | `__init_subclass__(cls, **kwargs)` | keywords from the `class` line |
| TS/TC39 class decorator | `@decorator` on the class | runs once; subclasses don't re-run it |
| `static method()` | a method on the metaclass | visible on the class, not on instances |
| `static [Symbol.hasInstance]` | `__instancecheck__` on the metaclass | `ABCMeta` uses it |
| constructor returning a cached object | metaclass `__call__` | `__init__` runs only when you call `super().__call__` |
| `abstract class` / `abstract m()` | `ABC` + `@abstractmethod` | checked when you instantiate |
| `Box<T>` | `class Box[T]:` / `__class_getitem__` | no metaclass needed |
| nothing | `__prepare__` | choose the class-body namespace |

## Challenges

:::challenge id=metaclass-make-record title="Records from type()" difficulty=easy
Write `make_record(name, fields)` that builds and returns a record class **with `type()`**, without a `class` statement:

- `Point = make_record("Point", ["x", "y"])` gives a class named `"Point"` with `Point.fields == ("x", "y")`.
- `Point(1, 2)` stores the values positionally, and the wrong number of values raises `TypeError`.
- `repr(Point(1, "a"))` is `Point(x=1, y='a')`, and two records are equal when they're the same class with the same values.
- The fields are `__slots__`, so instances have no `__dict__` and can't grow new attributes.

```js
function makeRecord(name, fields) {
  const Record = class {
    constructor(...values) {
      fields.forEach((field, i) => (this[field] = values[i]));
    }
  };
  Object.defineProperty(Record, "name", { value: name });
  return Record;
}
```

```python starter
def make_record(name, fields):
    ...
```

```python solution
def make_record(name, fields):
    fields = tuple(fields)

    def __init__(self, *values):
        if len(values) != len(fields):
            raise TypeError(f"{name} takes {len(fields)} values, got {len(values)}")
        for field, value in zip(fields, values):
            setattr(self, field, value)

    def __repr__(self):
        args = ", ".join(f"{field}={getattr(self, field)!r}" for field in fields)
        return f"{type(self).__name__}({args})"

    def __eq__(self, other):
        if type(other) is not type(self):
            return NotImplemented
        return all(getattr(self, field) == getattr(other, field) for field in fields)

    namespace = {
        "__slots__": fields,
        "fields": fields,
        "__init__": __init__,
        "__repr__": __repr__,
        "__eq__": __eq__,
    }
    return type(name, (), namespace)
```

```python tests
@test("builds a class with the given name and fields")
def _():
    Point = make_record("Point", ["x", "y"])
    check(isinstance(Point, type), "make_record should return a class")
    eq(Point.__name__, "Point")
    eq(Point.fields, ("x", "y"))

@test("stores values positionally")
def _():
    Point = make_record("Point", ["x", "y"])
    p = Point(1, 2)
    eq((p.x, p.y), (1, 2))

@test("the wrong number of values raises TypeError")
def _():
    Point = make_record("Point", ["x", "y"])
    raises(TypeError, Point, 1)
    raises(TypeError, Point, 1, 2, 3)

@test("repr and equality")
def _():
    Point = make_record("Point", ["x", "y"])
    eq(repr(Point(1, "a")), "Point(x=1, y='a')")
    eq(Point(1, 2), Point(1, 2))
    check(Point(1, 2) != Point(2, 1), "different values aren't equal")
    Pair = make_record("Pair", ["x", "y"])
    check(Point(1, 2) != Pair(1, 2), "records of different classes aren't equal")

@test("fields are slots: no instance __dict__")
def _():
    Point = make_record("Point", ["x", "y"])
    p = Point(1, 2)
    check(not hasattr(p, "__dict__"), "put the fields in __slots__")
    raises(AttributeError, setattr, p, "z", 3)

@test("each call builds an independent class")
def _():
    Point = make_record("Point", ["x", "y"])
    Color = make_record("Color", ("r", "g", "b"))
    eq((Point.fields, Color.fields), (("x", "y"), ("r", "g", "b")))
    eq(repr(Color(255, 0, 0)), "Color(r=255, g=0, b=0)")

@test("built with type(), not a class statement")
def _():
    forbids_syntax(ast.ClassDef, "no class statement: build it with type(name, bases, namespace)")
    forbids_import("dataclasses", "build the class yourself")
    forbids_import("collections", "build the class yourself")
```

```hint
Define `__init__`, `__repr__` and `__eq__` as ordinary nested functions. They close over `fields`, just like methods in a class body would read a class attribute.
```

```hint
The namespace is a plain dict: `{"__slots__": fields, "fields": fields, "__init__": __init__, ...}`. Then `return type(name, (), namespace)`.
```
:::

:::challenge id=metaclass-plugin-registry title="A self-registering plugin base" difficulty=medium
Write a `Plugin` base class that registers its subclasses with `__init_subclass__`, and no metaclass:

```python
class CsvExport(Plugin, name="csv"):
    def run(self, rows): ...

Plugin.get("csv")         # CsvExport
CsvExport.plugin_name     # "csv"
```

- A subclass passes `name=` in its `class` line. It's stored in `Plugin.registry`, one dict for the whole hierarchy, and gets a `plugin_name` attribute. `Plugin.get(name)` returns the class, or raises `KeyError`.
- `abstract=True` marks an intermediate base class: it isn't registered and needs no name.
- These raise `TypeError` when the class is defined, and leave the registry unchanged: a missing name, a name that's already taken, a registered class without a callable `run`, and unknown class keywords.
- Grandchildren register too.

```python starter
class Plugin:
    registry = {}
```

```python solution
class Plugin:
    registry = {}

    def __init_subclass__(cls, name=None, abstract=False, **kwargs):
        super().__init_subclass__(**kwargs)          # rejects unknown keywords
        if abstract:
            return
        if name is None:
            raise TypeError(f"{cls.__name__} needs a name: class {cls.__name__}(..., name='...')")
        if name in Plugin.registry:
            raise TypeError(f"plugin name {name!r} is taken by {Plugin.registry[name].__name__}")
        if not callable(getattr(cls, "run", None)):
            raise TypeError(f"{cls.__name__} must define run()")
        cls.plugin_name = name
        Plugin.registry[name] = cls

    @classmethod
    def get(cls, name):
        return Plugin.registry[name]
```

```python tests
class Exporter(Plugin, abstract=True):
    def run(self, rows):
        return self.render(rows)

class CsvExport(Exporter, name="csv"):
    def render(self, rows):
        return "\n".join(",".join(map(str, row)) for row in rows)

class TsvExport(CsvExport, name="tsv"):
    def render(self, rows):
        return "\n".join("\t".join(map(str, row)) for row in rows)

@test("registers subclasses by name")
def _():
    check(Plugin.get("csv") is CsvExport, "Plugin.get('csv') should return CsvExport")
    eq(CsvExport.plugin_name, "csv")
    eq(Plugin.get("csv")().run([[1, 2], [3, 4]]), "1,2\n3,4")

@test("grandchildren register too")
def _():
    check(Plugin.get("tsv") is TsvExport, "TsvExport subclasses CsvExport and should register as 'tsv'")

@test("abstract bases aren't registered")
def _():
    check(Exporter not in Plugin.registry.values(), "abstract=True classes shouldn't be registered")

@test("unknown names raise KeyError")
def _():
    raises(KeyError, Plugin.get, "xml")

@test("a missing name raises TypeError at definition time")
def _():
    with raises(TypeError):
        class Nameless(Exporter):
            pass

@test("a duplicate name raises TypeError and keeps the original")
def _():
    with raises(TypeError):
        class Impostor(Exporter, name="csv"):
            def render(self, rows):
                return "impostor"
    check(Plugin.get("csv") is CsvExport, "the first registration must win")

@test("registered plugins need a run() method")
def _():
    with raises(TypeError):
        class Idle(Plugin, name="idle"):
            pass
    check("idle" not in Plugin.registry, "a rejected class must not be registered")

@test("unknown class keywords still raise")
def _():
    with raises(TypeError):
        class Fancy(Exporter, name="fancy", colour="red"):
            pass
    check("fancy" not in Plugin.registry, "call super().__init_subclass__(**kwargs) before registering")

@test("uses __init_subclass__, not a metaclass")
def _():
    check(type(Plugin) is type, "no metaclass needed")
    check("__init_subclass__" in vars(Plugin), "define __init_subclass__ on Plugin")
```

```hint
Give `__init_subclass__` keyword parameters with defaults: `def __init_subclass__(cls, name=None, abstract=False, **kwargs)`. Call `super().__init_subclass__(**kwargs)` first: `object` rejects any keyword nobody consumed.
```

```hint
Do every check before touching the registry, so a rejected class leaves no trace. Write to `Plugin.registry`, not `cls.registry`, to make it clear there's one shared dict.
```
:::

:::challenge id=metaclass-interned title="Interned instances" difficulty=medium
Write a metaclass `Interned` whose classes cache their instances by constructor arguments, so equal arguments give back the **same object**:

```python
class Color(metaclass=Interned):
    def __init__(self, name, alpha=1.0):
        self.name, self.alpha = name, alpha

Color("red") is Color("red")     # True
Color("red") is Color("blue")    # False
```

- `__init__` runs once per distinct set of arguments.
- The cache key is the positional arguments plus the keyword arguments, and keyword order doesn't matter. (`Color("red")` and `Color(name="red")` may be cached separately.)
- Each class has its own cache, so a subclass never hands back its parent's instances.
- Unhashable arguments raise `TypeError`.
- `Color.clear_cache()` empties that class's cache. It's a method of the metaclass, so instances don't have it.

```python starter
class Interned(type):
    ...
```

```python solution
class Interned(type):
    def __init__(cls, name, bases, namespace, **kwargs):
        super().__init__(name, bases, namespace, **kwargs)
        cls._instances = {}                         # one cache per class

    def __call__(cls, *args, **kwargs):
        key = (args, tuple(sorted(kwargs.items())))
        if key not in cls._instances:               # unhashable args raise TypeError here
            cls._instances[key] = super().__call__(*args, **kwargs)
        return cls._instances[key]

    def clear_cache(cls):
        cls._instances.clear()
```

```python tests
log = []

class Color(metaclass=Interned):
    def __init__(self, name, alpha=1.0):
        log.append((type(self).__name__, name, alpha))
        self.name, self.alpha = name, alpha

class Shade(Color):
    pass

@test("equal arguments return the same object")
def _():
    check(Color("red") is Color("red"), "Color('red') should be cached")
    check(Color("red", 0.5) is Color("red", 0.5), "positional arguments are part of the key")

@test("different arguments return different objects")
def _():
    check(Color("red") is not Color("blue"), "different names are different instances")
    check(Color("red") is not Color("red", 0.5), "a different alpha is a different instance")
    eq(Color("green").name, "green")

@test("__init__ runs once per distinct key")
def _():
    log.clear()
    for _ in range(3):
        Color("teal")
        Color("navy", alpha=0.25)
    eq(log, [("Color", "teal", 1.0), ("Color", "navy", 0.25)])

@test("keyword order doesn't matter")
def _():
    check(Color(name="plum", alpha=0.5) is Color(alpha=0.5, name="plum"), "sort the keyword arguments for the key")

@test("each class has its own cache")
def _():
    base, shade = Color("olive"), Shade("olive")
    check(shade is not base, "a subclass must not return the parent's instance")
    check(type(shade) is Shade, "Shade('olive') should build a Shade")
    check(Shade("olive") is shade, "and cache it")

@test("unhashable arguments raise TypeError")
def _():
    raises(TypeError, Color, ["not", "hashable"])

@test("clear_cache() lives on the metaclass")
def _():
    first = Color("coral")
    Color.clear_cache()
    check(Color("coral") is not first, "after clear_cache() a new instance is built")
    check(not hasattr(first, "clear_cache"), "define clear_cache on the metaclass, so instances don't get it")
    check(isinstance(Color, Interned), "Color's metaclass should be Interned")
```

```hint
`Color(...)` runs `Interned.__call__(Color, ...)`. Build the key there, and only call `super().__call__(*args, **kwargs)`, which runs `__new__` and `__init__`, on a cache miss.
```

```hint
Create the cache in the metaclass's `__init__`, which runs once for every class it creates, subclasses included. A cache stored only on the first class would be shared through inheritance.
```
:::

:::challenge id=metaclass-mini-enum title="Build Enum" difficulty=hard
Write `EnumMeta` and a base class `Enum` (whose metaclass is `EnumMeta`) that work like a small version of the standard `enum`:

```python
class Color(Enum):
    RED = 1
    GREEN = 2

    def describe(self):
        return self.name.lower()
```

- Each name in the class body that doesn't start with `_` and isn't a descriptor (functions, properties, `classmethod`s: anything whose type has `__get__`) becomes a **member**: an instance of the class with `.name` and `.value`. So `Color.RED.name == "RED"`, `Color.RED.value == 1` and `Color.RED.describe() == "red"`.
- `repr(Color.RED)` is `<Color.RED: 1>`.
- On the class: `list(Color)` gives the members in definition order, `len(Color)` counts them, `Color["GREEN"]` finds one by name (or raises `KeyError`), and `Color(2)` finds one by value (or raises `ValueError`). Calling the class never builds new instances.
- Members can't be reassigned: `Color.RED = 5` raises `AttributeError`, though other class attributes can still be set.
- Assigning a name that already holds a member, as in `RED = 1` twice in the body, raises `TypeError`. Use `__prepare__`.
- Every enum has its own members, and `Enum` itself has none.

```python starter
class EnumMeta(type):
    ...


class Enum(metaclass=EnumMeta):
    ...
```

```python solution
def _is_member(name, value):
    return not name.startswith("_") and not hasattr(type(value), "__get__")


class _EnumNamespace(dict):
    """The class-body namespace: refuses to redefine a member."""

    def __setitem__(self, key, value):
        if key in self and _is_member(key, self[key]):
            raise TypeError(f"{key!r} is already defined as {self[key]!r}")
        super().__setitem__(key, value)


class EnumMeta(type):
    @classmethod
    def __prepare__(mcls, name, bases, **kwargs):
        return _EnumNamespace()

    def __new__(mcls, name, bases, namespace, **kwargs):
        cls = super().__new__(mcls, name, bases, dict(namespace), **kwargs)
        members = {}
        for key, value in namespace.items():
            if _is_member(key, value):
                member = object.__new__(cls)
                member.name, member.value = key, value
                members[key] = member
                type.__setattr__(cls, key, member)       # skip our own __setattr__
        type.__setattr__(cls, "_members", members)
        return cls

    def __setattr__(cls, name, value):
        if name in vars(cls).get("_members", {}):
            raise AttributeError(f"cannot reassign member {name!r}")
        super().__setattr__(name, value)

    def __call__(cls, value):
        for member in cls._members.values():
            if member.value == value:
                return member
        raise ValueError(f"{value!r} is not a valid {cls.__name__}")

    def __getitem__(cls, name):
        return cls._members[name]

    def __iter__(cls):
        return iter(cls._members.values())

    def __len__(cls):
        return len(cls._members)


class Enum(metaclass=EnumMeta):
    def __repr__(self):
        return f"<{type(self).__name__}.{self.name}: {self.value!r}>"
```

```python tests
class Color(Enum):
    RED = 1
    GREEN = 2
    BLUE = 3

    def describe(self):
        return self.name.lower()

class Status(Enum):
    ACTIVE = "active"
    BANNED = "banned"

    @property
    def is_ok(self):
        return self is Status.ACTIVE

@test("members are instances with a name and a value")
def _():
    check(isinstance(Color.RED, Color), "Color.RED should be an instance of Color")
    eq((Color.RED.name, Color.RED.value), ("RED", 1))
    eq(Color.GREEN.describe(), "green")

@test("repr looks like the real Enum")
def _():
    eq(repr(Color.BLUE), "<Color.BLUE: 3>")
    eq(repr(Status.ACTIVE), "<Status.ACTIVE: 'active'>")

@test("iterating and len() work on the class")
def _():
    eq([member.name for member in Color], ["RED", "GREEN", "BLUE"])
    eq(len(Color), 3)
    eq((len(Enum), list(Enum)), (0, []))

@test("lookup by name and by value")
def _():
    check(Color["GREEN"] is Color.GREEN, "Color['GREEN'] should return the member")
    check(Color(3) is Color.BLUE, "Color(3) should return the existing member")
    raises(KeyError, lambda: Color["PURPLE"])
    raises(ValueError, Color, 99)

@test("methods and properties aren't members")
def _():
    eq([member.name for member in Status], ["ACTIVE", "BANNED"])
    check(Status.ACTIVE.is_ok and not Status.BANNED.is_ok, "properties should still work on members")

@test("members can't be reassigned")
def _():
    class Size(Enum):
        SMALL = 1
    with raises(AttributeError):
        Size.SMALL = 5
    check(Size.SMALL.value == 1, "the member must survive")
    Size.default = "fine"
    eq(Size.default, "fine", "other class attributes can still be set")

@test("defining a member twice raises TypeError")
def _():
    with raises(TypeError):
        class Broken(Enum):
            A = 1
            A = 2

@test("enums don't share members")
def _():
    eq(len(Status), 2)
    raises(ValueError, Status, 1)
    check(type(Status.ACTIVE) is Status, "members belong to their own enum")

@test("uses a metaclass, not the enum module")
def _():
    check(issubclass(EnumMeta, type) and isinstance(Enum, EnumMeta), "Enum's metaclass should be EnumMeta, a subclass of type")
    forbids_import("enum", "build it yourself instead of importing enum")
```

```hint
Create the class first with `super().__new__(...)`, then walk the namespace. For each member name, build the instance with `object.__new__(cls)`, so the class's own `__call__` (lookup by value) isn't involved.
```

```hint
Your metaclass `__setattr__` blocks member reassignment, so install the members with `type.__setattr__(cls, key, member)`, which skips it. Keep a `{name: member}` dict on the class for `__iter__`, `__len__`, `__getitem__` and `__call__`.
```

```hint
`__prepare__` returns a `dict` subclass whose `__setitem__` raises `TypeError` when the key already holds a member. Only check public, non-descriptor values, so methods can still be redefined freely.
```
:::
