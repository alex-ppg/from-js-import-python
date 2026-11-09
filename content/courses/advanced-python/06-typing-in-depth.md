---
title: Advanced Typing
part: Types & Metaprogramming
summary: Bounds, variance, ParamSpec, TypeVarTuple, overloads, TypedDict kwargs, Annotated and runtime introspection.
minutes: 45
---

[Type Hints](lesson:type-hints) translated TypeScript's everyday vocabulary. This lesson covers the machinery underneath: generics with bounds, constraints and defaults, variance, generic protocols and `Self`, typing decorators and variadic functions, overloads and literal types, `TypedDict` for `**kwargs`, exhaustiveness, and `Annotated` metadata.

Two facts shape all of it. Only the static checkers (mypy, pyright and friends) enforce these types, so much of this lesson is about telling the checker more. And every annotation is still an ordinary object at runtime, so the same hints that drive the checker can drive your own code. That's how dataclasses, pydantic, FastAPI and typer work, and it's what this lesson's challenges do.

## Generics in depth: bounds, constraints and defaults

:::compare
```ts
function longest<T extends { length: number }>(a: T, b: T): T {
  return a.length >= b.length ? a : b;
}

// no constrained generics: the closest thing is a set of overloads
declare function concat(a: string, b: string): string;
declare function concat(a: Uint8Array, b: Uint8Array): Uint8Array;

interface Page<T = Record<string, unknown>> {
  items: T[];
  next?: string;
}
```
```python
def longest[T: Sized](a: T, b: T) -> T:            # a bound
    return a if len(a) >= len(b) else b


# constraints: exactly one of these types, chosen per call
def concat[S: (str, bytes)](a: S, b: S) -> S: ...


@dataclass
class Page[T = dict[str, object]]:                 # a default, 3.13+
    items: list[T]
    next: str | None = None
```
:::

PEP 695 syntax (3.12+) gives a type parameter three optional extras:

- **A bound**, `[T: Sized]`, is TypeScript's `extends`. `T` can be any subtype of `Sized`, and the checker solves it to the actual argument type: `longest("ab", "c")` is a `str`, and a pair of `list[int]` gives back a `list[int]`.
- **Constraints**, `[S: (str, bytes)]`, a tuple of two or more types, have no TypeScript counterpart. `S` must be *exactly one* of the listed types, picked per call: `concat("a", "b")` is a `str`, `concat(b"a", b"b")` is `bytes`, and `concat("a", b"b")` is an error. An argument whose type is a subclass of `str` solves `S` to `str` itself. Constraints model functions like `re.sub()` that accept `str` or `bytes`, but never a mix, and `typing.AnyStr` is exactly such a type variable, ready-made.
- **A default** (PEP 696, 3.13+) works like TypeScript's `<T = ...>`: a bare `Page` means `Page[dict[str, object]]`. A default may refer to an earlier parameter (`class Pair[K, V = K]`), and parameters with defaults must come last.

At runtime these are real `TypeVar` objects, created in a special scope that doesn't leak into the module. Read them from `__type_params__`. Their bounds, constraints and defaults are evaluated lazily, the first time you access them, so a bound may name a class defined further down. A generic class also gets `typing.Generic` as a base, which is what makes `Pair[str]` subscriptable:

```python run
from collections.abc import Sized


def longest[T: Sized](a: T, b: T) -> T:
    return a if len(a) >= len(b) else b


def concat[S: (str, bytes)](a: S, b: S) -> S:
    return a + b


class Pair[K, V = K]:                          # 3.13+: V defaults to K
    def __init__(self, key: K, value: V) -> None:
        self.key, self.value = key, value


print("T" in globals())                        # type parameters don't leak
print(longest.__type_params__[0].__bound__)
print(concat.__type_params__[0].__constraints__)
key, value = Pair.__type_params__
print(value.__default__ is key, key.has_default(), Pair.__mro__)
```

:::quiz
`def pick[T: (int, str)](a: T, b: T) -> T` is called as `pick(True, False)`. What does a type checker infer for the result?

- [ ] `bool`
- [x] `int`
- [ ] `int | str`
- [ ] an error, since `bool` isn't one of the constraints

A constrained type variable always resolves to one of the listed types. A `bool` is an `int`, so `T` becomes `int`. With a bound, `[T: int]`, the checker would keep the more precise `bool`.
:::

## Variance

:::compare
```ts
interface Source<out T> { get(): T }       // TS 4.7+: optional annotations
interface Sink<in T> { put(item: T): void }

const animals: Animal[] = dogs;            // allowed: arrays are covariant...
animals.push(new Cat());                   // ...so this unsound push compiles
```
```python
class Source[T]:                    # inferred covariant: T only comes out
    def get(self) -> T: ...

class Sink[T]:                      # inferred contravariant: T only goes in
    def put(self, item: T) -> None: ...

animals: list[Animal] = dogs        # error: list is invariant
```
:::

Variance answers one question: if `Dog` is a subtype of `Animal`, is `Box[Dog]` a subtype of `Box[Animal]`? It depends on what `Box` does with its `T`:

- If `T` only comes **out** (return types, read-only attributes), yes. That's **covariance**: a `Source[Dog]` works wherever a `Source[Animal]` is expected.
- If `T` only goes **in** (parameters), the direction flips. A `Sink[Animal]` accepts dogs, so it works where a `Sink[Dog]` is expected. That's **contravariance**, and it's why a `Callable[[Animal], None]` is assignable to `Callable[[Dog], None]` and not the other way round.
- If `T` goes both ways, or sits in a mutable attribute, neither direction is safe. That's **invariance**, which is why `list` is invariant while the read-only `Sequence` is covariant ([the core lesson's gotcha](lesson:type-hints#translating-the-type-vocabulary)).

TypeScript checks variance structurally, and checks method parameters bivariantly: methods are deliberately unsound so that `Array<T>` can stay covariant. TS 4.7 added optional `in` and `out` annotations. Python checkers are strict everywhere, and with PEP 695 syntax there's nothing to write: the checker **infers** each parameter's variance from how the class uses it. Before 3.12 you declared it, with `TypeVar("T_co", covariant=True)`, and you'll still see the `_co` and `_contra` suffixes all over typeshed. The runtime only records which style you used:

```python run
from typing import TypeVar


class Source[T]:
    def get(self) -> T: ...


param = Source.__type_params__[0]
print(repr(param), param.__infer_variance__, param.__covariant__)

T_co = TypeVar("T_co", covariant=True)          # the pre-3.12 spelling
T_contra = TypeVar("T_contra", contravariant=True)
print(repr(T_co), repr(T_contra), repr(TypeVar("T")))
```

:::gotcha One mutable attribute makes a type parameter invariant
Give `Source[T]` a plain attribute `self.latest: T` and the checker infers it's invariant, because anyone holding a `Source[Animal]` could assign a `Cat` to `latest`. A `Source[Dog]` then stops being accepted where a `Source[Animal]` is expected. To keep it covariant, expose the value through a read-only `@property`.
:::

## Generic protocols and `Self`

:::compare
```ts
interface Repository<T> {
  get(id: string): T | undefined;
  add(id: string, item: T): void;
}

class MemoryRepo<T> {               // implements it without saying so
  private items = new Map<string, T>();
  /* ...get and add... */
}

function preload<T>(repo: Repository<T>, items: Map<string, T>) { /* ... */ }
```
```python
class Repository[T](Protocol):
    def get(self, key: str) -> T | None: ...
    def add(self, key: str, item: T) -> None: ...


class MemoryRepo[T]:                # satisfies it without saying so
    def __init__(self) -> None:
        self.items: dict[str, T] = {}
    # ...get and add...


def preload[T](repo: Repository[T], items: Mapping[str, T]) -> None: ...
```
:::

A generic `Protocol` is a structural interface with a type parameter, the direct equivalent of a generic TypeScript interface ([Protocols](lesson:type-hints#interfaces-protocol) in the core course). The checker matches any class with the right members, inheritance or no inheritance, and solves `T` from the member types: a `MemoryRepo[User]` is a `Repository[User]`.

Protocols also cover what `Callable[...]` can't express. `Callable` has no way to describe keyword arguments, defaults or overloads, so for those you write a **callback protocol** with a `__call__` method, the equivalent of a call signature in a TypeScript interface:

```python
class Handler(Protocol):
    def __call__(self, event: str, *, retries: int = 0) -> bool: ...
```

At runtime, `@runtime_checkable` makes a protocol usable with `isinstance`, but only to check that the members *exist*: it can't check type arguments, and it never looks at signatures. 3.13 added `typing.is_protocol()` and `typing.get_protocol_members()` for introspection.

```python run
import typing
from typing import Protocol, runtime_checkable


@runtime_checkable
class Repository[T](Protocol):
    def get(self, key: str) -> T | None: ...
    def add(self, key: str, item: T) -> None: ...


class MemoryRepo:
    def __init__(self):
        self.items = {}

    def get(self, key):
        return self.items.get(key)

    def add(self, key, item):
        self.items[key] = item


repo = MemoryRepo()
print(isinstance(repo, Repository), sorted(typing.get_protocol_members(Repository)))
try:
    isinstance(repo, Repository[int])
except TypeError as err:
    print("TypeError:", err)
```

:::quiz output
What does this print?

```python
from typing import Protocol, runtime_checkable


@runtime_checkable
class SupportsClose(Protocol):
    def close(self) -> None: ...


@runtime_checkable
class SupportsLessThan(Protocol):
    def __lt__(self, other, /) -> bool: ...


print(isinstance("text", SupportsClose), isinstance(object(), SupportsLessThan))
```

- [ ] `False False`
- [x] `False True`
- [ ] `True True`
- [ ] `TypeError`

A runtime protocol check only asks whether the attribute exists. Strings have no `close`, but `object` itself defines `__lt__` (it returns `NotImplemented`), so *every* object passes the second check. Runtime protocol checks are only meaningful for members that ordinary objects don't have.
:::

### `Self`: the receiver's own type

:::compare
```ts
class Query {
  where(cond: string): this {
    return this;
  }
}

class UserQuery extends Query {
  active(): this {
    return this.where("active = true");
  }
}

new UserQuery().where("age > 18").active();   // where() returned a UserQuery
```
```python
class Query:
    def where(self, cond: str) -> Self:
        return self

    @classmethod
    def create(cls) -> Self:
        return cls()


class UserQuery(Query):
    def active(self) -> Self:
        return self.where("active = true")


UserQuery.create().where("age > 18").active()   # a UserQuery at every step
```
:::

`Self` (3.11+) is TypeScript's polymorphic `this` type: inside a class it means "the class of whatever this was called on", so a subclass that inherits `where()` gets its own type back and a method chain keeps the subclass's methods ([the basics](lesson:type-hints#overloads-self-and-paramspec)). It reaches places `this` doesn't. A `@classmethod` alternative constructor returning `Self` builds the subclass when called on one, an `__enter__` returning `Self` keeps `with Connection() as conn:` precise for subclasses, and in a protocol, `def __lt__(self, other: Self, /) -> bool` means "comparable with its own kind". Before 3.11 the same thing took a bound type variable on `self`, `def where[Q: Query](self: Q, cond: str) -> Q`, which you'll still meet in older code. `Self` isn't allowed in static methods or metaclasses, which have no receiver instance.

At runtime, `Self` is only a marker: `get_type_hints()` hands back `typing.Self` itself, so a runtime tool has to substitute the class it's inspecting.

```python run
from typing import Self, get_type_hints


class Query:
    def __init__(self) -> None:
        self.conditions: list[str] = []

    def where(self, cond: str) -> Self:
        self.conditions.append(cond)
        return self

    @classmethod
    def create(cls) -> Self:
        return cls()


class UserQuery(Query):
    def active(self) -> Self:
        return self.where("active = true")


query = UserQuery.create().where("age > 18").active()
print(type(query).__name__, query.conditions)
print(get_type_hints(Query.where)["return"])      # just a marker at runtime
```

## Typing decorators: `ParamSpec`, `Concatenate` and `TypeVarTuple`

:::compare
```ts
function withDb<A extends unknown[], R>(
  fn: (db: Database, ...args: A) => R,
): (...args: A) => R {
  return (...args) => fn(getDb(), ...args);
}
```
```python
def with_db[**P, R](
    fn: Callable[Concatenate[Database, P], R],
) -> Callable[P, R]:
    def wrapper(*args: P.args, **kwargs: P.kwargs) -> R:
        return fn(get_db(), *args, **kwargs)
    return wrapper
```
:::

[The core lesson](lesson:type-hints#overloads-self-and-paramspec) used `[**P, R]` to type a decorator that keeps the signature unchanged. `Concatenate` types one that changes it: `Callable[Concatenate[Database, P], R]` means "a callable whose first parameter is a `Database`, followed by whatever `P` captures". Returning `Callable[P, R]` tells the checker the decorated function no longer takes that argument, so `save_user(db, name)` becomes `save_user(name)` at every call site, with the remaining parameter names, defaults and keyword-only markers all checked. Swap the two sides to type a decorator that *adds* a leading parameter. TypeScript's rest tuple `A extends unknown[]` captures positional parameters only; a `ParamSpec` captures keyword arguments too.

The rules are strict. `P.args` and `P.kwargs` must annotate `*args` and `**kwargs` together, and nothing else. `Concatenate` can only prepend positional parameters, so "the same signature plus a keyword-only `timeout`" isn't expressible; that takes a callback protocol, or a less precise type.

Like everything else, the decorator's own annotations are objects you can take apart:

```python run
import functools
from collections.abc import Callable
from typing import Concatenate, get_args, get_origin, get_type_hints


class Database:
    def __repr__(self):
        return "Database()"


def with_db[**P, R](fn: Callable[Concatenate[Database, P], R]) -> Callable[P, R]:
    @functools.wraps(fn)
    def wrapper(*args: P.args, **kwargs: P.kwargs) -> R:
        return fn(Database(), *args, **kwargs)

    return wrapper


@with_db
def save_user(db: Database, name: str, *, admin: bool = False) -> str:
    return f"saved {name} (admin={admin}) via {db!r}"


print(save_user("ada", admin=True))
hints = get_type_hints(with_db)
params, result = get_args(hints["fn"])
print(get_origin(params), get_args(params), result)
print(hints["return"])
```

:::gotcha The runtime signature doesn't know about `Concatenate`
The checker now believes `save_user` takes `(name, *, admin=False)`, but `functools.wraps` makes `inspect.signature(save_user)` report the original, `db` included, and frameworks that read signatures (pytest, FastAPI, typer) will see it. Set `wrapper.__signature__` as well, as [Functional Programming in Python](lesson:functional-python) shows.
:::

### Variadic generics: `TypeVarTuple`

:::compare
```ts
function callLater<A extends unknown[]>(fn: (...args: A) => void, ...args: A): void {
  setTimeout(() => fn(...args), 0);
}

const greet = (id: number, name: string) => {};
callLater(greet, 1, "ada");      // OK
callLater(greet, "ada", 1);      // error
```
```python
def call_later[*Ts](fn: Callable[[*Ts], None], *args: *Ts) -> None:
    loop.call_soon(fn, *args)


def greet(user_id: int, name: str) -> None: ...

call_later(greet, 1, "ada")      # OK
call_later(greet, "ada", 1)      # error
```
:::

`[*Ts]` declares a `TypeVarTuple` (3.11+, PEP 646): one type parameter standing for any number of types, the counterpart of a TypeScript rest tuple. `Callable[[*Ts], None]` with `*args: *Ts` checks that the extra arguments match the callback's parameters, the pattern behind callback-scheduling APIs like asyncio's `loop.call_soon(callback, *args)`. It also types shapes: with `class Array[*Shape]`, `Array[int, int]` and `Array[int, int, int]` are different types, the NumPy-style use case that motivated the PEP. A parameter list can hold only one `TypeVarTuple`, alongside ordinary parameters (`tuple[int, *Ts]`). At runtime, `*Ts` shows up as `typing.Unpack[Ts]`:

```python run
from collections.abc import Callable
from typing import get_args, get_type_hints


def call_later[*Ts](fn: Callable[[*Ts], None], *args: *Ts) -> None:
    fn(*args)                       # a real version would schedule it


class Array[*Shape]:
    pass


call_later(print, "ready", 3)
print(call_later.__type_params__, get_type_hints(call_later)["args"])
print(Array[int, int], get_args(Array[int, int, int]))
```

## Overloads and literal types

:::compare
```ts
function fetchData(url: string, asJson: true): Promise<object>;
function fetchData(url: string, asJson?: false): Promise<string>;
function fetchData(url: string, asJson = false) { /* ... */ }

type Mode = "r" | "w" | "a";

// nothing stops a value interpolated into SQL
db.query(`SELECT * FROM users WHERE name = '${name}'`);
```
```python
@overload
def fetch(url: str, *, as_json: Literal[True]) -> dict[str, object]: ...
@overload
def fetch(url: str, *, as_json: Literal[False] = ...) -> str: ...
def fetch(url: str, *, as_json: bool = False) -> dict[str, object] | str: ...

type Mode = Literal["r", "w", "a"]

# LiteralString rejects anything built from runtime strings
def query(sql: LiteralString) -> None: ...
```
:::

Overloads keyed on `Literal` flags are how the standard library's stubs type `open()` (text or binary, by mode) and `subprocess.run(text=True)`. The implementation's signature has to accept every overload, and checkers verify that. At runtime only the implementation exists, but since 3.11 `typing.get_overloads(fn)` returns the registered signatures, which documentation tools and runtime validators can read.

`Literal` accepts ints, strings, bytes, bools, enum members and `None`, and checkers reject anything else, floats included. At runtime a `Literal` deduplicates its values, flattens nested `Literal`s and compares without regard to order, but it compares the *type* as well as the value, so `Literal[1]` and `Literal[True]` are different types even though `1 == True`. Any runtime checker you write has to make the same distinction, and [the last challenge](#typing-conforms) does.

`LiteralString` (3.11+, PEP 675) is the type of strings that come from literals in your source code, and of concatenations, joins and f-strings built only from them. Put it on APIs that must never receive user input, like SQL, shell commands and HTML templates: a checker accepts `query("SELECT * FROM users WHERE name = ?")` and rejects `query(f"SELECT ... '{name}'")` when `name` is an ordinary `str`. TypeScript has nothing like it. At runtime it's an ordinary `str`, and `isinstance` can't test for it. For enforcement at runtime, 3.14's t-strings are the stronger tool, since the library receives the interpolated values separately and can escape them ([Strings](lesson:strings#tagged-templates-t-strings-3-14)).

```python run
from typing import Literal, get_overloads, get_type_hints, overload


@overload
def fetch(url: str, *, as_json: Literal[True]) -> dict[str, object]: ...
@overload
def fetch(url: str, *, as_json: Literal[False] = ...) -> str: ...
def fetch(url, *, as_json=False):
    return {"ok": True} if as_json else '{"ok": true}'


print(fetch("/health"), fetch("/health", as_json=True))
for variant in get_overloads(fetch):
    hints = get_type_hints(variant)
    print(hints["as_json"], "->", hints["return"])
print(Literal["r", "w", "r"], Literal["a", Literal["b"]])
```

:::quiz output
What does this print?

```python
from typing import Literal

print(Literal[1, 2] == Literal[2, 1], Literal[1] == Literal[True])
```

- [x] `True False`
- [ ] `True True`
- [ ] `False False`
- [ ] `False True`

A `Literal` is a set of allowed values, so order doesn't matter. But values are compared by type as well as by `==`, so `Literal[1]` and `Literal[True]` stay distinct, just as checkers treat them.
:::

## `TypedDict` in depth, and typed `**kwargs`

:::compare
```ts
interface RequestOptions {
  url: string;
  method?: "GET" | "POST";
  timeout?: number;
  readonly token: string;
}

function request(opts: RequestOptions) { /* ... */ }
request({ url: "/users", timeout: 5, token: "t" });
```
```python
class RequestOptions(TypedDict):
    url: str
    method: NotRequired[Literal["GET", "POST"]]
    timeout: NotRequired[float]
    token: ReadOnly[str]                       # 3.13+


def request(**options: Unpack[RequestOptions]) -> None: ...
request(url="/users", timeout=5, token="t")    # real keyword arguments
```
:::

An options object becomes keyword arguments in Python ([Functions](lesson:functions#keyword-arguments-replace-options-objects)), and `Unpack[SomeTypedDict]` on `**kwargs` (PEP 692, 3.12+) types them. The checker treats `request` as if it declared keyword-only parameters `url`, `method`, `timeout` and `token`, each required or optional as the TypedDict says, so a misspelled keyword or a wrong type is caught at the call site. It's the tool for wrappers that forward a large bag of options, where spelling every parameter out twice would be noise.

The rest of `TypedDict`'s machinery, beyond [the basics](lesson:type-hints#object-shapes-typeddict):

- **Totality is per class.** `total=False` on a base class makes *its* keys optional; a subclass's own keys follow the subclass's setting. `Required[...]` and `NotRequired[...]` override either per key.
- **The key sets are introspectable**: `__required_keys__` and `__optional_keys__`, plus `__readonly_keys__` and `__mutable_keys__` since 3.13.
- **`get_type_hints()` strips the qualifiers.** You get `str`, not `NotRequired[str]`, unless you pass `include_extras=True`. Use the key sets to know what's required.
- **TypedDicts can be generic**: `class Page[T](TypedDict): items: list[T]`.
- **They're structural and open.** As with TypeScript's object types, a TypedDict with extra keys is assignable to one that declares fewer, so a function receiving `RequestOptions` may get keys it doesn't know about. Python 3.14 has no way to close a TypedDict against extra keys.

```python run
from typing import Literal, NotRequired, ReadOnly, TypedDict, Unpack, get_type_hints


class Retry(TypedDict, total=False):
    retries: int
    backoff: float


class RequestOptions(Retry):
    url: str
    method: NotRequired[Literal["GET", "POST"]]
    token: ReadOnly[str]


def request(**options: Unpack[RequestOptions]) -> str:
    return f"{options.get('method', 'GET')} {options['url']}"


print(request(url="/users", retries=3, token="t"))
print(sorted(RequestOptions.__required_keys__), sorted(RequestOptions.__optional_keys__))
print(sorted(RequestOptions.__readonly_keys__))
print(get_type_hints(request)["options"])
print(get_type_hints(RequestOptions, include_extras=True)["method"])
```

## Narrowing and exhaustiveness

:::compare
```ts
type Shape =
  | { kind: "circle"; radius: number }
  | { kind: "square"; side: number };

function area(shape: Shape): number {
  switch (shape.kind) {
    case "circle":
      return Math.PI * shape.radius ** 2;
    case "square":
      return shape.side ** 2;
    default: {
      const unreachable: never = shape;
      throw new Error(`unhandled ${unreachable}`);
    }
  }
}
```
```python
@dataclass
class Circle:
    radius: float

@dataclass
class Square:
    side: float

type Shape = Circle | Square

def area(shape: Shape) -> float:
    match shape:
        case Circle(radius=r):
            return math.pi * r**2
        case Square(side=s):
            return s**2
        case _:
            assert_never(shape)
```
:::

TypeScript's discriminated unions translate into unions of dataclasses matched with class patterns ([Pattern Matching](lesson:pattern-matching#class-patterns)), or into TypedDicts with a `Literal` tag, which checkers narrow on `shape["kind"] == "circle"`. Either way, exhaustiveness is TypeScript's `never` trick. After every handled case, the type left over is `Never`, and `assert_never(shape)` only type-checks if that's so. Add a `Triangle` to `Shape` and the checker points at every `match` you forgot to update. At runtime, `assert_never` raises `AssertionError` with the stray value in the message:

```python run raises
import math
from dataclasses import dataclass
from typing import assert_never


@dataclass
class Circle:
    radius: float


@dataclass
class Square:
    side: float


@dataclass
class Triangle:
    base: float
    height: float


type Shape = Circle | Square | Triangle    # Triangle was added...


def area(shape: Shape) -> float:           # ...but not handled here
    match shape:
        case Circle(radius=r):
            return round(math.pi * r**2, 2)
        case Square(side=s):
            return s**2
        case _:
            assert_never(shape)            # checker: "Triangle" is not "Never"


print(area(Circle(1)), area(Square(2)))
print(area(Triangle(3, 4)))
```

`Never` is also the return type of a function that can't return normally, because it always raises or loops forever: `def fail(message: str) -> Never`. `NoReturn` is the older spelling, and checkers treat the two the same.

For your own predicates, the counterpart of TypeScript's `value is T` comes in two strengths:

```python
def is_admin(user: Admin | Guest) -> TypeIs[Admin]:          # 3.13+
    return isinstance(user, Admin)


def is_str_list(values: list[object]) -> TypeGuard[list[str]]:
    return all(isinstance(value, str) for value in values)
```

`TypeIs[T]` narrows both branches: after `if is_admin(user):`, the `if` side sees an `Admin` and the `else` side a `Guest`. The price is that `T` must be a subtype of the parameter's type, a rule TypeScript enforces for its predicates too. `TypeGuard[T]` (3.10+) narrows only the true branch, and its `T` needn't be related to the input. That's what `list[object]` to `list[str]` needs: `list` is invariant, so `list[str]` isn't a subtype of `list[object]`, and a checker rejects `TypeIs[list[str]]` on that parameter.

:::quiz
You need a predicate that tells the checker a `dict[str, object]` holds only `int` values. Which return annotation works?

- [ ] `TypeIs[dict[str, int]]`
- [x] `TypeGuard[dict[str, int]]`
- [ ] `bool`
- [ ] `Literal[True]`

`dict` is invariant in its value type, so `dict[str, int]` isn't a subtype of `dict[str, object]`, and `TypeIs` refuses to narrow to it. `TypeGuard` allows narrowing to an unrelated type, at the cost of narrowing only when the predicate returns `True`. A plain `bool` narrows nothing.
:::

## `Annotated`: metadata for libraries

:::compare
```ts
// zod: the schema is a value, and the type is derived from it
const Signup = z.object({
  age: z.number().int().min(13),
  username: z.string().max(20),
});
type Signup = z.infer<typeof Signup>;
```
```python
# Annotated: the type stays a type, and the metadata rides along
@dataclass
class Signup:
    age: Annotated[int, Ge(13)]
    username: Annotated[str, MaxLen(20)]


# checkers see int and str; pydantic and FastAPI read the rest
```
:::

`Annotated[T, *metadata]` attaches arbitrary objects to a type. Checkers treat it as plain `T` and ignore the rest, which makes it the standard way for libraries to hang validation rules and configuration on annotations: pydantic's `Annotated[int, Field(gt=0)]`, FastAPI's `Annotated[str, Query(max_length=50)]`, typer's `Annotated[str, typer.Option()]`, and the shared vocabulary of the `annotated-types` package (`Gt`, `Le`, `MaxLen`...). zod goes the other way: you build a schema value and derive the static type from it. With `Annotated`, the type stays a type and the schema is read off it.

`get_type_hints()` strips `Annotated` unless you pass `include_extras=True`. With it, `get_origin(hint) is Annotated`, `get_args(hint)` is `(T, *metadata)`, and the same data sits on `hint.__origin__` and `hint.__metadata__`. Nested `Annotated` flattens into one.

```python run
from dataclasses import dataclass
from typing import Annotated, get_args, get_origin, get_type_hints


@dataclass(frozen=True)
class MaxLen:
    limit: int


Username = Annotated[str, MaxLen(20), "shown on the profile page"]


@dataclass
class Signup:
    username: Username
    age: int


print(get_type_hints(Signup))                          # metadata stripped
hint = get_type_hints(Signup, include_extras=True)["username"]
print(get_origin(hint) is Annotated, get_args(hint))
print(hint.__origin__, hint.__metadata__)
print(Annotated[Annotated[int, "a"], "b"])             # nested metadata flattens
```

:::gotcha A `type` alias hides its metadata
`Username = Annotated[str, MaxLen(20)]` is a plain assignment, so the field's annotation *is* the `Annotated` object. Write `type Username = Annotated[str, MaxLen(20)]` instead and the field's annotation becomes the alias, a `TypeAliasType`: `get_type_hints(..., include_extras=True)` returns `Username` itself, and code looking for `Annotated` finds nothing. Libraries that support `type` aliases unwrap them through `__value__`. Your own runtime code has to do the same.
:::

[The second challenge](#typing-annotated-validate) builds a small validator on `Annotated`.

## Runtime introspection: `get_origin`, `get_args` and `annotationlib`

:::compare
```ts
// emitDecoratorMetadata records one constructor per property, no more
class User {
  @Column() tags!: string[];
}

Reflect.getMetadata("design:type", User.prototype, "tags");  // Array
// the element type, string, is gone
```
```python
class User:
    tags: list[str]


get_type_hints(User)["tags"]                    # list[str]
get_origin(list[str]), get_args(list[str])      # (list, (str,))
# the whole structure is there
```
:::

Every annotation can be taken apart with two functions. `get_origin(tp)` returns the unsubscripted form, or `None` for a plain class, and `get_args(tp)` returns the arguments as a tuple. A runtime checker is a recursive function that branches on the origin:

| Annotation | `get_origin` | `get_args` |
| --- | --- | --- |
| `int`, `str`, any class | `None` | `()` |
| `list[int]` | `list` | `(int,)` |
| `dict[str, int]` | `dict` | `(str, int)` |
| `tuple[int, str]` | `tuple` | `(int, str)` |
| `tuple[int, ...]` | `tuple` | `(int, Ellipsis)` |
| `int \| None`, `Optional[int]` | `typing.Union` | `(int, NoneType)` |
| `Literal["a", "b"]` | `Literal` | `('a', 'b')` |
| `Callable[[int], str]` | `collections.abc.Callable` | `([int], str)` |
| `Annotated[int, x]` | `Annotated` | `(int, x)` |
| `Box[int]`, a user generic | `Box` | `(int,)` |
| `Alias`, from a `type` statement | `None` | `()`: read `Alias.__value__` |

Three details trip people up. Unions changed in 3.14: `int | None` and `Optional[int]` now build the same kind of object, a `typing.Union`, and `types.UnionType` is an alias for that class, whereas before 3.14 the `|` form had the origin `types.UnionType`, so code that must run on older versions checks for both. A TypedDict is an ordinary class as far as `get_origin` is concerned, so detect it with `typing.is_typeddict()`. And `type` aliases are opaque: unwrap them through `__value__`, which is evaluated lazily, so recursive aliases work.

```python run
from collections.abc import Callable
from typing import Annotated, Literal, get_args, get_origin

type Json = dict[str, Json] | list[Json] | str | int | float | bool | None

for hint in [list[int], tuple[int, ...], int | None, Literal["a", "b"],
             Callable[[int], str], Annotated[int, "meta"], Json]:
    print(f"{hint!s:37} {get_origin(hint)!s:35} {get_args(hint)}")
print(Json.__value__)
```

:::quiz output
What does this print on Python 3.14?

```python
from typing import Optional, get_origin

print(get_origin(int | None) is get_origin(Optional[int]))
```

- [x] `True`
- [ ] `False`
- [ ] `None`
- [ ] `TypeError`

Since 3.14 both spellings build the same kind of object, so both origins are `typing.Union`. On 3.13 and earlier this prints `False`, because the `|` form's origin was `types.UnionType`.
:::

3.14's lazy annotations ([Annotations at runtime](lesson:type-hints#annotations-at-runtime)) come with the `annotationlib` module, which lets a library ask for annotations in the format it can cope with. `Format.VALUE` evaluates them and raises `NameError` for any name that isn't defined yet. `Format.FORWARDREF` evaluates what it can and wraps the rest in `ForwardRef` objects, which you can resolve later with `.evaluate()` or `typing.evaluate_forward_ref()`. `Format.STRING` returns the source text. Frameworks that inspect a class while it's being decorated use `FORWARDREF`, which is how a 3.14 dataclass can name a class that's defined further down the module:

```python run
from annotationlib import Format, get_annotations
from dataclasses import dataclass, fields
from typing import get_type_hints


def load(user_id: UserId, cache: dict[str, Profile] | None = None) -> Profile: ...


refs = get_annotations(load, format=Format.FORWARDREF)
print(type(refs["user_id"]).__name__, refs["user_id"].__forward_arg__)


@dataclass
class Team:
    members: list[Profile]         # Profile doesn't exist yet


class Profile: ...
UserId = int

print(refs["user_id"].evaluate(), refs["return"].evaluate())
print(fields(Team)[0].type)        # captured as a ForwardRef at decoration time
print(get_type_hints(Team))        # resolved now that Profile exists
```

## What TypeScript has and Python doesn't

:::compare
```ts
interface User {
  id: number;
  name: string;
  email: string;
}

type UserPatch = Partial<Omit<User, "id">>;
```
```python
class User(TypedDict):
    id: int
    name: str
    email: str


class UserPatch(TypedDict, total=False):    # written out by hand
    name: str
    email: str
```
:::

Python's type system can't compute one type from another. There's no `keyof`, no indexed access, no mapped or conditional types, no `infer` and no template literal types. Much of that machinery exists in TypeScript to describe JavaScript's dynamic object patterns, and Python code mostly uses fixed shapes instead (classes, dataclasses, TypedDicts), so the type system grew in a different direction. When you miss a TypeScript feature, the usual substitutes are:

| TypeScript | Closest Python | Notes |
| --- | --- | --- |
| `Partial<T>`, `Pick<T, K>`, `Omit<T, K>` | another TypedDict, written out | `total=False` for `Partial` |
| `keyof T`, `T["id"]` | a `Literal` of the key names, kept in sync by hand | |
| `T extends U ? X : Y` | `@overload`, one signature per input type | |
| `Parameters<F>`, `ReturnType<F>` | `ParamSpec` and a `TypeVar` captured in a generic signature | |
| template literal types | `Literal` of complete strings, or `LiteralString` | |
| `satisfies` | an annotated assignment, or `assert_type()` | `assert_type` is checker-only |
| type-level metaprogramming | `typing.dataclass_transform` (3.11+), checker plugins, code generation | |

`dataclass_transform` is the one worth knowing about: it tells checkers that a decorator, base class or metaclass generates a dataclass-style `__init__`, which is how pydantic models, attrs classes and SQLAlchemy's mapped dataclasses get checked constructor calls without any special support in the checker.

## Cheat sheet

| TypeScript | Python | Notes |
| --- | --- | --- |
| `<T extends Bound>` | `[T: Bound]` | 3.12+; solved to the argument's own type |
| no equivalent | `[T: (str, bytes)]` | constraints: exactly one, per call |
| `<T = Default>` | `[T = Default]` | 3.13+; defaults come last |
| `in` / `out` | inferred from usage | `TypeVar("T_co", covariant=True)` before 3.12 |
| `interface Repo<T>` | `class Repo[T](Protocol)` | `isinstance` can't check `Repo[int]` |
| a call signature in an interface | a `Protocol` with `__call__` | keyword arguments, overloads |
| `this` as a return type | `Self` | 3.11+; classmethods, `__enter__`, protocols |
| `(...args: A) => R` | `[**P, R]` with `Callable[P, R]` | `P.args` and `P.kwargs` go together |
| `(ctx: C, ...args: A) => R` | `Callable[Concatenate[C, P], R]` | positional prefixes only |
| `A extends unknown[]` | `[*Ts]` | `Callable[[*Ts], R]` and `*args: *Ts` |
| overload signatures | `@overload` | `get_overloads(fn)` at runtime |
| `"a" \| "b"` | `Literal["a", "b"]` | `Literal[1]` isn't `Literal[True]` |
| no equivalent | `LiteralString` | for SQL and shell APIs |
| an options object | `**kwargs: Unpack[TD]` | 3.12+ |
| `readonly` key | `ReadOnly[T]` | 3.13+; `__readonly_keys__` |
| `value is T` | `TypeIs[T]`, `TypeGuard[T]` | both branches, or true branch only |
| `const _: never = x` | `assert_never(x)` | raises `AssertionError` at runtime |
| `never` as a return type | `Never`, `NoReturn` | |
| a zod schema | `Annotated[T, *metadata]` | `get_type_hints(..., include_extras=True)` |
| `reflect-metadata` | `get_type_hints`, `get_origin`, `get_args` | `annotationlib` for forward references |
| `keyof`, mapped and conditional types | none | overloads, separate TypedDicts |

## Challenges

:::challenge id=typing-literal-choices title="Choices from a Literal" difficulty=easy
argparse's `choices=`, a CLI's completion list, an HTML `<select>`: they all want the allowed values of a `Literal` type. Write `literal_choices(tp)` that returns them as a tuple, in order and without repeats, when `tp` is:

- a `Literal[...]`,
- a `type` alias of one (unwrap it through `__value__`),
- `Annotated[...]` around one,
- or a union of any of these. Flatten it, and skip `None`, which in a union means "optional", not a choice.

Anything else raises `TypeError`.

```python
type Level = Literal["debug", "info"]

literal_choices(Level | Literal["warn", "info"] | None)   ->  ('debug', 'info', 'warn')
literal_choices(int)                                       ->  TypeError
```

```ts
// TypeScript goes the other way: values first, then the type
const LEVELS = ["debug", "info", "warn"] as const;
type Level = (typeof LEVELS)[number];
```

```python starter
import types
from typing import Annotated, Literal, TypeAliasType, Union, get_args, get_origin


def literal_choices(tp):
    ...
```

```python solution
import types
from typing import Annotated, Literal, TypeAliasType, Union, get_args, get_origin


def literal_choices(tp):
    if isinstance(tp, TypeAliasType):
        return literal_choices(tp.__value__)
    origin = get_origin(tp)
    if origin is Literal:
        return get_args(tp)
    if origin is Annotated:
        return literal_choices(get_args(tp)[0])
    if origin is Union or origin is types.UnionType:
        values = [
            value
            for option in get_args(tp)
            if option is not type(None)
            for value in literal_choices(option)
        ]
        return get_args(Literal[*values])     # Literal drops repeats, keeping True and 1 apart
    raise TypeError(f"not a Literal type: {tp!r}")
```

```python tests
from typing import Annotated, Literal

type Level = Literal["debug", "info", "warn"]
type Method = Literal["GET", "POST"]


@test("returns the values of a Literal, in order")
def _():
    eq(literal_choices(Literal["red", "green", "blue"]), ("red", "green", "blue"))
    eq(literal_choices(Literal[3, 1, 2]), (3, 1, 2))

@test("returns a tuple")
def _():
    check(type(literal_choices(Literal["a", "b"])) is tuple, "return a tuple")

@test("unwraps type aliases")
def _():
    eq(literal_choices(Level), ("debug", "info", "warn"))

@test("looks inside Annotated")
def _():
    eq(literal_choices(Annotated[Method, "HTTP verb"]), ("GET", "POST"))

@test("flattens unions, skipping None and repeats")
def _():
    eq(literal_choices(Method | Literal["PUT", "GET"] | None), ("GET", "POST", "PUT"))
    eq(literal_choices(Literal["a"] | None), ("a",))

@test("nesting works at any depth")
def _():
    type Verb = Method | Literal["DELETE"]
    eq(literal_choices(Annotated[Verb, "doc"] | None), ("GET", "POST", "DELETE"))

@test("anything that isn't made of Literals raises TypeError")
def _():
    raises(TypeError, literal_choices, int)
    raises(TypeError, literal_choices, list[str])
    raises(TypeError, literal_choices, Literal["a"] | int)
```

```hint
Check `isinstance(tp, TypeAliasType)` first and recurse on `tp.__value__`. For everything else, branch on `get_origin(tp)`.
```

```hint
The origin is `Literal` for a literal (its values are `get_args(tp)`), `Annotated` for an annotated type (the real type is `get_args(tp)[0]`), and `typing.Union` for a union. Accept `types.UnionType` too, which is what `X | Y` gives on Pythons before 3.14.
```

```hint
For a union, recurse into every member except `type(None)` and collect the values. `tuple(dict.fromkeys(values))` drops repeats in order. So does `get_args(Literal[*values])`, which also keeps `True` and `1` apart, as `Literal` does.
```
:::

:::challenge id=typing-annotated-validate title="Validate with Annotated" difficulty=medium
pydantic, FastAPI and the `annotated-types` package hang validation rules on annotations with `Annotated`. Write `validate(obj)` that checks an instance of any annotated class (the tests use dataclasses) and returns a list of error messages, empty when everything is valid. For each annotated attribute, in definition order:

1. Find the underlying type (`Annotated[int, ...]` gives `int`; a plain annotation is its own type). If the value isn't an instance of it, report `"<name>: expected <type>, got <type>"` and skip that attribute's constraints.
2. Otherwise, run the attribute's **constraints**: every metadata object that has a `check(value)` method. `check` returns an error message, or `None` when the value passes. Report each message as `"<name>: <message>"`, in metadata order. Ignore metadata without a `check` method, such as documentation strings.

```text
@dataclass
class Signup:
    username: Annotated[str, MaxLen(12), "shown publicly"]
    age: Annotated[int, Between(13, 120)]

validate(Signup("ada", 7))      ->  ["age: must be between 13 and 120"]
validate(Signup("ada", "36"))   ->  ["age: expected int, got str"]
```

The starter includes three constraint classes. The tests bring their own as well, so rely only on the `check()` method. All the underlying types are plain classes, so `isinstance` works.

```python starter
import re
from dataclasses import dataclass
from typing import Annotated, get_args, get_origin, get_type_hints


@dataclass(frozen=True)
class Between:
    low: float
    high: float

    def check(self, value):
        if not self.low <= value <= self.high:
            return f"must be between {self.low} and {self.high}"


@dataclass(frozen=True)
class MaxLen:
    limit: int

    def check(self, value):
        if len(value) > self.limit:
            return f"must be at most {self.limit} characters"


@dataclass(frozen=True)
class Matches:
    pattern: str

    def check(self, value):
        if re.fullmatch(self.pattern, value) is None:
            return "has the wrong format"


def validate(obj):
    ...
```

```python solution
import re
from dataclasses import dataclass
from typing import Annotated, get_args, get_origin, get_type_hints


@dataclass(frozen=True)
class Between:
    low: float
    high: float

    def check(self, value):
        if not self.low <= value <= self.high:
            return f"must be between {self.low} and {self.high}"


@dataclass(frozen=True)
class MaxLen:
    limit: int

    def check(self, value):
        if len(value) > self.limit:
            return f"must be at most {self.limit} characters"


@dataclass(frozen=True)
class Matches:
    pattern: str

    def check(self, value):
        if re.fullmatch(self.pattern, value) is None:
            return "has the wrong format"


def validate(obj):
    errors = []
    for name, hint in get_type_hints(type(obj), include_extras=True).items():
        value = getattr(obj, name)
        expected, *metadata = get_args(hint) if get_origin(hint) is Annotated else (hint,)
        if not isinstance(value, expected):
            errors.append(f"{name}: expected {expected.__name__}, got {type(value).__name__}")
            continue
        for constraint in metadata:
            check = getattr(constraint, "check", None)
            if check is not None and (message := check(value)) is not None:
                errors.append(f"{name}: {message}")
    return errors
```

```python tests
from dataclasses import dataclass, field
from typing import Annotated


@dataclass(frozen=True)
class AtLeast:
    low: float

    def check(self, value):
        if value < self.low:
            return f"must be at least {self.low}"


@dataclass(frozen=True)
class NotBlank:
    def check(self, value):
        if not value.strip():
            return "must not be blank"


@dataclass
class Signup:
    username: Annotated[str, NotBlank(), MaxLen(12), "shown publicly"]
    age: Annotated[int, Between(13, 120)]
    email: Annotated[str, Matches(r"[^@\s]+@[^@\s]+")]
    newsletter: bool = False


@dataclass
class Product:
    sku: Annotated[str, Matches(r"[A-Z]{3}-\d{4}")]
    price: Annotated[float, AtLeast(0)]
    tags: list = field(default_factory=list)


@dataclass
class Note:
    text: Annotated[str, "free text", {"widget": "textarea"}]


def signup(**changes):
    return Signup(**({"username": "ada", "age": 36, "email": "ada@example.com"} | changes))


@test("a valid instance has no errors")
def _():
    eq(validate(signup()), [])
    eq(validate(Product("ABC-1234", 9.5, ["sale"])), [])

@test("runs the constraints from the metadata")
def _():
    eq(validate(signup(age=7)), ["age: must be between 13 and 120"])
    eq(validate(signup(email="ada.example.com")), ["email: has the wrong format"])
    eq(validate(Product("abc-12", 9.5)), ["sku: has the wrong format"])
    eq(validate(Product("ABC-1234", -1.0)), ["price: must be at least 0"])

@test("reports every failing constraint, in metadata order")
def _():
    eq(validate(signup(username="a" * 20)), ["username: must be at most 12 characters"])
    eq(
        validate(signup(username=" " * 20)),
        ["username: must not be blank", "username: must be at most 12 characters"],
    )

@test("ignores metadata without a check() method")
def _():
    eq(validate(Note("hello")), [])

@test("checks the underlying type first, and skips the constraints when it's wrong")
def _():
    eq(validate(signup(age="36")), ["age: expected int, got str"])
    eq(validate(Note(42)), ["text: expected str, got int"])

@test("plain annotations are type-checked too")
def _():
    eq(validate(signup(newsletter="yes")), ["newsletter: expected bool, got str"])
    eq(validate(Product("ABC-1234", 2.5, tags="sale")), ["tags: expected list, got str"])

@test("reports errors in field order")
def _():
    eq(
        validate(Signup(username="", age=200, email="x", newsletter=1)),
        [
            "username: must not be blank",
            "age: must be between 13 and 120",
            "email: has the wrong format",
            "newsletter: expected bool, got int",
        ],
    )
```

```hint
`get_type_hints(type(obj), include_extras=True)` gives every attribute's annotation, in definition order, with `Annotated` kept. Without `include_extras=True` the metadata is stripped.
```

```hint
For an `Annotated` hint, `get_args(hint)` is `(underlying_type, *metadata)`, so `expected, *metadata = get_args(hint)` splits it. A plain hint is its own type and has no metadata.
```

```hint
Duck-type the constraints: `check = getattr(constraint, "check", None)`. Call it only when it exists, and report its result when that isn't `None`.
```
:::

:::challenge id=typing-conforms title="A deep runtime type check" difficulty=hard
Write `conforms(value, tp)`, which returns `True` if `value` is a valid instance of the annotation `tp`, all the way down. Support:

- `Any`, which accepts anything, and `None`, which accepts only `None`;
- plain classes, via `isinstance`, except that `float` also accepts an `int`, as type checkers do;
- unions, written `X | Y` or `Optional[X]`;
- `Literal[...]`, compared by type as well as value, so `Literal[1]` rejects `True` (as checkers do);
- `list[X]` and `dict[K, V]`, checking every item, key and value;
- `tuple[X, ...]` (any length, every item an `X`) and `tuple[X, Y, Z]` (exactly that length, a type per position);
- `TypedDict` classes: a dict with every required key, no keys the TypedDict doesn't declare, and every present value conforming, nested TypedDicts included;
- `type` aliases, including recursive ones such as `type Json = dict[str, Json] | list[Json] | str | int | float | bool | None`.

```text
conforms({"id": 1, "tags": ["a"]}, dict[str, int | list[str]])  ->  True
conforms(True, Literal[1])                                        ->  False
conforms((1, "a"), tuple[int, ...])                               ->  False
```

```ts
// TypeScript can't derive a runtime check from a type: you write each one by hand
function isStringList(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === "string");
}
```

```python starter
import types
from typing import (
    Any,
    Literal,
    TypeAliasType,
    Union,
    get_args,
    get_origin,
    get_type_hints,
    is_typeddict,
)


def conforms(value, tp):
    ...
```

```python solution
import types
from typing import (
    Any,
    Literal,
    TypeAliasType,
    Union,
    get_args,
    get_origin,
    get_type_hints,
    is_typeddict,
)


def conforms(value, tp):
    if tp is Any:
        return True
    if tp is None or tp is type(None):
        return value is None
    if isinstance(tp, TypeAliasType):
        return conforms(value, tp.__value__)
    if is_typeddict(tp):
        return conforms_typeddict(value, tp)
    origin, args = get_origin(tp), get_args(tp)
    if origin is Union or origin is types.UnionType:
        return any(conforms(value, option) for option in args)
    if origin is Literal:
        return any(type(value) is type(option) and value == option for option in args)
    if origin is list:
        return isinstance(value, list) and all(conforms(item, args[0]) for item in value)
    if origin is dict:
        key_type, value_type = args
        return isinstance(value, dict) and all(
            conforms(key, key_type) and conforms(item, value_type) for key, item in value.items()
        )
    if origin is tuple:
        if not isinstance(value, tuple):
            return False
        if len(args) == 2 and args[1] is Ellipsis:
            return all(conforms(item, args[0]) for item in value)
        return len(value) == len(args) and all(map(conforms, value, args))
    if tp is float:
        return isinstance(value, (int, float))      # checkers accept an int for a float
    return isinstance(value, tp)


def conforms_typeddict(value, td):
    if not isinstance(value, dict):
        return False
    hints = get_type_hints(td)
    return (
        value.keys() >= td.__required_keys__          # every required key is present
        and value.keys() <= hints.keys()              # and nothing undeclared
        and all(conforms(item, hints[key]) for key, item in value.items())
    )
```

```python tests
from typing import Any, Literal, NotRequired, Optional, TypedDict

type Json = dict[str, Json] | list[Json] | str | int | float | bool | None


class Address(TypedDict):
    city: str
    postcode: NotRequired[str]


class User(TypedDict):
    id: int
    name: str
    address: Address
    tags: NotRequired[list[str]]


@test("plain classes, None and Any")
def _():
    check(conforms(3, int) and conforms("a", str), "plain classes use isinstance")
    check(not conforms("3", int), '"3" is not an int')
    check(conforms(None, None) and not conforms(0, None), "None only accepts None")
    check(conforms(object(), Any) and conforms(None, Any), "Any accepts anything")

@test("float accepts int, as type checkers do")
def _():
    check(conforms(2, float) and conforms(2.5, float), "an int is acceptable where a float is expected")
    check(not conforms("2.5", float), "a str is not a float")

@test("unions, in both spellings")
def _():
    check(conforms(None, int | None) and conforms(4, int | None), "X | None accepts None and X")
    check(not conforms("4", Optional[int]), "Optional[int] rejects a str")

@test("Literal compares the type as well as the value")
def _():
    check(conforms("GET", Literal["GET", "POST"]), "a listed value")
    check(not conforms("PUT", Literal["GET", "POST"]), "an unlisted value")
    check(not conforms(True, Literal[1]), "True == 1, but Literal[1] doesn't accept True")
    check(not conforms(1, Literal[True]), "nor does Literal[True] accept 1")

@test("list[X] and dict[K, V] check every item")
def _():
    check(conforms([1, 2], list[int]) and conforms([], list[int]), "lists of ints")
    check(not conforms([1, "2"], list[int]), "one bad item fails the list")
    check(not conforms((1, 2), list[int]), "a tuple is not a list")
    check(conforms({"a": 1}, dict[str, int]), "a dict of str to int")
    check(not conforms({"a": "1"}, dict[str, int]), "values are checked")
    check(not conforms({1: 1}, dict[str, int]), "keys are checked")

@test("tuple[X, ...] versus tuple[X, Y]")
def _():
    check(conforms((1, 2, 3), tuple[int, ...]) and conforms((), tuple[int, ...]), "any length")
    check(not conforms((1, "a"), tuple[int, ...]), "every item must match")
    check(conforms((1, "a"), tuple[int, str]), "fixed length, a type per position")
    check(not conforms((1, "a", 2), tuple[int, str]), "wrong length")
    check(not conforms(("a", 1), tuple[int, str]), "wrong order")

@test("TypedDicts: required keys, optional keys, no extras")
def _():
    ada = {"id": 1, "name": "Ada", "address": {"city": "London"}}
    check(conforms(ada, User), "a valid user")
    check(conforms(ada | {"tags": ["admin"]}, User), "optional keys may be present")
    check(not conforms({"id": 1, "name": "Ada"}, User), "a required key is missing")
    check(not conforms(ada | {"admin": True}, User), "an undeclared key")
    check(not conforms(ada | {"tags": "admin"}, User), "an optional key with the wrong type")
    check(not conforms(ada | {"address": {"postcode": "N1"}}, User), "nested TypedDicts are checked too")
    check(not conforms([("id", 1)], User), "a TypedDict value must be a dict")

@test("type aliases, including recursive ones")
def _():
    check(conforms({"a": [1, {"b": None, "c": 2.5}], "d": "x"}, Json), "nested JSON")
    check(not conforms({"a": [1, {"b": {1, 2}}]}, Json), "a set is not JSON")
    check(not conforms({1: "x"}, Json), "JSON object keys are strings")
```

```hint
Write one recursive function that branches on the annotation: `Any`, then `None`, then a `TypeAliasType` (recurse on `__value__`), then a TypedDict (`typing.is_typeddict`), then `get_origin(tp)` for the parameterised forms, and finally `isinstance` for plain classes.
```

```hint
`get_origin(int | None)` is `typing.Union` (accept `types.UnionType` too, for older Pythons), and `get_args(tuple[int, ...])` is `(int, Ellipsis)`. For `Literal`, require `type(value) is type(option)` as well as `value == option`.
```

```hint
For a TypedDict, `get_type_hints(td)` maps every key to its type, with `NotRequired` already stripped, and `td.__required_keys__` is a frozenset. Dict key views support set comparisons: `value.keys() >= td.__required_keys__` and `value.keys() <= hints.keys()`.
```
:::
