---
title: Type Hints for TypeScript Devs
part: Advanced Python
summary: TypeScript's types, translated. Annotations, generics, Protocols, TypedDict, and the tools that check them.
minutes: 40
---

Python's type hints will feel like home: `name: str`, `-> int`, unions with `|`, generics, structural interfaces. The packaging is what differs. There's no compile step: the interpreter **ignores** your annotations (much like Node's built-in type stripping) and a separate checker, mypy or pyright, plays the role of `tsc --noEmit`. And unlike TypeScript's types, the annotations survive at runtime as ordinary objects, which is how dataclasses, pydantic and FastAPI turn them into behaviour.

## Annotations: TypeScript syntax, no compiler

:::compare
```ts
function greet(name: string, times: number = 1): string {
  return Array(times).fill(`hi ${name}`).join(", ");
}

let retries: number = 3;
const names: string[] = [];

greet(42); // tsc: Argument of type 'number' is not assignable...
```
```python
def greet(name: str, times: int = 1) -> str:
    return ", ".join([f"hi {name}"] * times)


retries: int = 3
names: list[str] = []

greet(42)  # mypy: Argument 1 to "greet" has incompatible type "int"...
```
:::

Parameters and variables take `name: type`, and the return type goes after `->`. Defaults come after the annotation (`times: int = 1`). The checker reports `greet(42)` as an error, but Python itself runs it without complaint:

```python run
def greet(name: str, times: int = 1) -> str:
    return ", ".join([f"hi {name}"] * times)

print(greet("Ada"))
print(greet(42, times=2))      # wrong type, runs anyway
print(greet.__annotations__)
```

:::gotcha Hints validate nothing at runtime
TypeScript at least makes `tsc` fail. A Python program with type errors runs until the wrong value actually breaks something, possibly far from the call that passed it. Run a checker in your editor and CI, and validate data from the outside world (JSON, forms, environment variables) explicitly, as the [last section](lesson:type-hints#runtime-validation-pydantic-zod) shows.
:::

:::quiz output
What does this print?

```python
def double(n: int) -> int:
    return n * 2

print(double("ab"))
```

- [ ] `TypeError`
- [x] `abab`
- [ ] `None`

The annotation says `int`, but nothing enforces it, and `"ab" * 2` is valid Python. A checker would flag the call. The interpreter just runs it.
:::

Annotations are optional, and that's the "gradual" in *gradual typing*. Annotate function signatures, and let the checker infer local variables the way TypeScript does. `names: list[str] = []` is the exception, because the checker can't tell what an empty list will hold.

:::gotcha `x: int` declares nothing
`let retries: number;` creates a variable in TS. In Python, `retries: int` on its own only records an annotation. No variable exists until you assign one, so reading it raises `NameError`. The same goes for a class body: `name: str` creates no attribute, which is exactly the declaration style that `@dataclass` reads to generate `__init__` (see [Dataclasses](lesson:dataclasses-and-enums)).
:::

:::quiz output
What does this print?

```python
retries: int
print(retries)
```

- [ ] `0`
- [ ] `None`
- [ ] `int`
- [x] `NameError`

A bare annotation binds no name. Python has no "declared but undefined" state like TypeScript's `let retries: number;`.
:::

## Annotations at runtime

:::compare
```js
// what tsc emits for
//   function find(users: User[], id: number): User | undefined
function find(users, id) {
  return users.find((u) => u.id === id);
}
// every type is gone
```
```python
def find(users: list[User], user_id: int) -> User | None:
    return next((u for u in users if u.id == user_id), None)



find.__annotations__["user_id"]   # <class 'int'>, a real object
find.__annotations__["return"]    # the union User | None
```
:::

TypeScript erases types completely. Python keeps annotations on the function, class or module as ordinary objects. `typing.get_type_hints(obj)` is the reliable way to read them: it resolves string annotations and turns a bare `None` into `type(None)`. `inspect.signature(fn)` pairs them with each parameter's kind and default. dataclasses, pydantic, FastAPI and typer all work this way: they read your annotations and generate code from them.

Since **Python 3.14**, annotations are also **lazy**. Python stores a small function that computes them and only calls it when someone asks. Forward references therefore just work: a class can refer to itself, and a function can mention a class defined further down the file.

```python run
import inspect
from typing import get_type_hints

def find(users: list[User], user_id: int, *, active: bool = True) -> User | None:
    ...

class User:                        # defined after find(): fine in 3.14
    name: str
    friends: list[User]            # refers to itself

print(get_type_hints(find))
print(get_type_hints(User))
print(inspect.signature(find))
```

:::deep Before 3.14: quotes and `from __future__ import annotations`
Older Pythons evaluated annotations as soon as the `def` ran, so a name that didn't exist yet raised `NameError`. Existing code works around that with string annotations (`-> "User"`) or with `from __future__ import annotations` at the top of the module, which turns every annotation into a string. Both still work. In 3.14 the error moves to access time instead, and the new `annotationlib` module can hand back unresolved annotations:

```python run
import annotationlib

def load(user_id: UserId) -> Profile:      # neither name exists
    ...

print(annotationlib.get_annotations(load, format=annotationlib.Format.STRING))
try:
    load.__annotations__
except NameError as err:
    print("NameError:", err)
```
:::

## Translating the type vocabulary

:::compare
```ts
type Method = "GET" | "POST";

function send(
  url: string,
  method: Method = "GET",
  headers: Record<string, string> = {},
  timeout?: number,
  onDone?: (status: number) => void,
): [number, string] {
```
```python
type Method = Literal["GET", "POST"]

def send(
    url: str,
    method: Method = "GET",
    headers: Mapping[str, str] | None = None,
    timeout: float | None = None,
    on_done: Callable[[int], None] | None = None,
) -> tuple[int, str]: ...
```
:::

Most of the vocabulary maps one to one. Generic containers use square brackets, `Callable` and the read-only collection types come from `collections.abc`, and the special forms (`Literal`, `Any`, `Final`...) come from `typing`.

| TypeScript | Python | Notes |
| --- | --- | --- |
| `string`, `boolean` | `str`, `bool` | |
| `number` | `int` or `float` | a `float` parameter also accepts `int` |
| `bigint` | `int` | ints have arbitrary precision |
| `T[]`, `Array<T>` | `list[T]` | |
| `readonly T[]` | `Sequence[T]` | also accepts tuples and ranges |
| `[string, number]` | `tuple[str, int]` | fixed length |
| a tuple of any length | `tuple[int, ...]` | `tuple[int]` is exactly one int |
| `Record<string, number>` | `dict[str, int]` | |
| `Readonly<Record<K, V>>` | `Mapping[K, V]` | |
| `Set<T>`, `Map<K, V>` | `set[T]`, `dict[K, V]` | |
| `A \| B` | `A \| B` | `Union[A, B]` in older code |
| `T \| null`, `T \| undefined` | `T \| None` | `Optional[T]` in older code |
| `x?: T` (parameter) | `x: T \| None = None` | |
| `any` | `Any` | switches checking off |
| `unknown` | `object` | must be narrowed before use |
| `void` | `None` | `-> None` |
| `never` | `Never` (3.11+), `NoReturn` | |
| `(a: A, b: B) => R` | `Callable[[A, B], R]` | |
| `Promise<T>` from an `async` function | `async def f() -> T` | annotate the awaited value |
| `"GET" \| "POST"` | `Literal["GET", "POST"]` | or an `Enum` |
| `const MAX = 3` | `MAX: Final = 3` | checker-only |
| `enum Color { ... }` | `class Color(Enum)` | see [Enums](lesson:dataclasses-and-enums) |

`List`, `Dict`, `Optional` and `Union` imported from `typing` are the pre-3.9/3.10 spellings. You'll meet them in older code, but write `list[int]` and `int | None` today.

:::gotcha `list[int]` is not a `list[float]`
TypeScript lets you pass a `number[]` where a `(number | string)[]` is expected, even though the callee could then push a string into your array. Python checkers close that hole: `list` is **invariant**, so a `list[int]` argument for a `list[float]` parameter is an error. If the function only reads, annotate the parameter with `Sequence[float]` (read-only, so covariant). The same goes for `dict` versus `Mapping`.
:::

:::pythonic Accept abstract types, return concrete ones
Annotate parameters with the loosest protocol that works (`Iterable[str]` if you only loop, `Sequence[str]` if you index, `Mapping[str, int]` if you only read), so callers can pass lists, tuples, generators or dict views. Return concrete types (`list[str]`) so callers know exactly what they get.
:::

:::quiz
`median(values)` indexes into `values` but never modifies it. Which annotation lets callers pass a `list[int]`, a `tuple[int, ...]` or a `range`?

- [ ] `list[int]`
- [ ] `tuple[int, ...]`
- [x] `Sequence[int]`
- [ ] `list[int] | tuple[int, ...]`

`Sequence` is the read-only, indexable protocol that lists, tuples, ranges and strings all satisfy. `list[int]` rejects tuples and ranges, and because `list` is invariant it would even reject a `list[bool]`.
:::

:::note What has no Python equivalent
`keyof`, indexed access types (`User["id"]`), mapped types like `Partial<T>` and `Pick<T, K>`, conditional types, `infer` and template literal types don't exist. Python's type system is closer to Java's or C#'s generics plus structural protocols than to TypeScript's type-level programming. The usual substitutes are `Literal` unions, separate `TypedDict`s, and `@overload`.
:::

## Object shapes: TypedDict

:::compare
```ts
type Movie = {
  title: string;
  year: number;
  rating?: number;
  readonly id: number;
};

const heat: Movie = { id: 1, title: "Heat", year: 1995 };
```
```python
class Movie(TypedDict):
    title: str
    year: int
    rating: NotRequired[float]
    id: ReadOnly[int]                # 3.13+


heat: Movie = {"id": 1, "title": "Heat", "year": 1995}
```
:::

A `TypedDict` describes the shape of a plain dict, which makes it the natural type for JSON payloads and `**kwargs`. Every key is required unless it's wrapped in `NotRequired[...]`. Declaring the class with `total=False` flips the default, and `Required[...]` then marks the exceptions. `ReadOnly[...]` (3.13+) is TypeScript's `readonly`.

At runtime there's no special object at all. `heat` is an ordinary dict, nothing checks its contents, and the class only carries metadata about the keys:

```python run
from typing import NotRequired, ReadOnly, TypedDict, get_type_hints

class Movie(TypedDict):
    title: str
    year: int
    rating: NotRequired[float]
    id: ReadOnly[int]

heat: Movie = {"id": 1, "title": "Heat", "year": "1995"}   # wrong type, runs anyway
print(type(heat), heat)
print(sorted(Movie.__required_keys__), sorted(Movie.__optional_keys__))
print(get_type_hints(Movie))
```

:::gotcha You can't `isinstance` a TypedDict
`isinstance(heat, Movie)` raises `TypeError: TypedDict does not support instance and class checks`. A TypedDict is a static description of a dict's keys, not a runtime class. To check a dict that came from outside, validate its keys and values yourself (the second challenge does exactly that) or use pydantic.
:::

:::quiz output
What does this print?

```python
from typing import TypedDict

class Point(TypedDict):
    x: int
    y: int

p = Point(x=1, y=2)
print(type(p).__name__)
```

- [ ] `Point`
- [x] `dict`
- [ ] `TypedDict`
- [ ] `TypeError`

Calling a TypedDict like a class just builds a plain `dict`. When the data lives inside your program rather than arriving from outside, a dataclass is usually the better tool, because it's a real class with attribute access.
:::

## Interfaces: Protocol

:::compare
```ts
interface Closeable {
  close(): void;
}

class FileHandle {          // never mentions Closeable
  close() {}
}

function closeAll(items: Closeable[]) {
  for (const item of items) item.close();
}

closeAll([new FileHandle()]); // OK: structural
```
```python
class Closeable(Protocol):
    def close(self) -> None: ...


class FileHandle:               # never mentions Closeable
    def close(self) -> None: ...



def close_all(items: Iterable[Closeable]) -> None:
    for item in items:
        item.close()

close_all([FileHandle()])       # OK: structural
```
:::

TypeScript is structural everywhere: any object with the right shape satisfies an interface. Python checkers are **nominal** for ordinary classes, so an `Admin` is a `User` only if it inherits from `User`. `Protocol` is the opt-in structural part: any class with matching members satisfies it, with no inheritance required. It's duck typing, written down. The standard library is full of protocols (`Iterable`, `Sized`, `Hashable`, `SupportsAbs`...), and abstract base classes remain the tool when you want a declared contract plus shared code (see [Classes](lesson:classes)).

:::gotcha Translate `interface` to `Protocol`, not to a base class
If you port a TS interface as a plain class and use it as a parameter type, the checker rejects every object that doesn't inherit from it, however well its shape matches. Shapes that unrelated classes should satisfy belong in a `Protocol`.
:::

Protocols are static by default. `@runtime_checkable` makes `isinstance` work with them, but the runtime check only confirms that the members **exist**. It never looks at signatures or types:

```python run
from typing import Protocol, runtime_checkable

@runtime_checkable
class Closeable(Protocol):
    def close(self) -> None: ...

class FileHandle:
    def close(self) -> None:
        print("file closed")

class Socket:
    def close(self, force: bool) -> None:     # different signature
        print("socket closed")

for thing in [FileHandle(), Socket(), "not closeable"]:
    print(type(thing).__name__, isinstance(thing, Closeable))
```

## Generics and type aliases

:::compare
```ts
function first<T>(items: T[], fallback: T): T {
  return items.length ? items[0] : fallback;
}

class Stack<T> {
  private items: T[] = [];
  push(item: T): void {
    this.items.push(item);
  }
}

type Pair<T> = [T, T];
function longest<T extends { length: number }>(a: T, b: T): T {
  return a.length >= b.length ? a : b;
}
```
```python
def first[T](items: list[T], fallback: T) -> T:
    return items[0] if items else fallback


class Stack[T]:
    def __init__(self) -> None:
        self.items: list[T] = []

    def push(self, item: T) -> None:
        self.items.append(item)


type Pair[T] = tuple[T, T]
def longest[T: Sized](a: T, b: T) -> T:
    return a if len(a) >= len(b) else b
```
:::

Python 3.12 added TypeScript-like syntax: type parameters go in square brackets after the name, `[T: Bound]` replaces `extends`, and the `type` statement declares aliases. Variance is inferred, so there's no `in`/`out` to write. Most existing code predates 3.12 and declares type variables explicitly, so you'll see this form a lot:

```python
from typing import TypeVar

T = TypeVar("T")

def first(items: list[T], fallback: T) -> T:
    return items[0] if items else fallback
```

```python run
from collections.abc import Sized

def longest[T: Sized](a: T, b: T) -> T:
    return a if len(a) >= len(b) else b

type Pair[T] = tuple[T, T]
type Tree = dict[str, Tree]          # aliases may be recursive

print(longest("hello", "hi"), longest([1, 2], [3, 4, 5]))
print(longest.__type_params__, Pair.__value__, Pair[int])
print(Tree.__value__)
```

:::gotcha `Stack[int]` doesn't check anything either
`Stack[int]()` is valid at runtime, but the `[int]` exists only for the checker: `push("oops")` succeeds. Like every other hint, generics constrain what the checker accepts, not what the program does.
:::

## Narrowing, casts and type guards

:::compare
```ts
function label(value: string | number | null): string {
  if (value === null) return "none";
  if (typeof value === "string") return value.toUpperCase();
  return value.toFixed(2);
}

const config = JSON.parse(raw) as Record<string, number>;

function isStringArray(xs: unknown[]): xs is string[] {
  return xs.every((x) => typeof x === "string");
}
```
```python
def label(value: str | float | None) -> str:
    if value is None:
        return "none"
    if isinstance(value, str):
        return value.upper()
    return f"{value:.2f}"

config = cast(dict[str, int], json.loads(raw))

def is_str_list(xs: list[object]) -> TypeGuard[list[str]]:
    return all(isinstance(x, str) for x in xs)
```
:::

Checkers narrow on the same kinds of tests TypeScript does, spelled the Python way: `isinstance` for `typeof` and `instanceof`, `is None` for `=== null`, plus truthiness, `in`, `==` against literals, and `match` statements ([Pattern Matching](lesson:pattern-matching)). `cast(T, value)` is `as`: a promise to the checker that does nothing at runtime, not a conversion. `TypeIs[...]` (3.13+) is the `xs is T` return type for your own predicates. It narrows both branches, but only to a *subtype* of the parameter's type. `TypeGuard` (3.10) is the looser, older form: it only narrows the `True` branch, but it may narrow to types that aren't subtypes. The example needs it, because lists are invariant, so `list[str]` isn't a subtype of `list[object]`. For a predicate over `object` (`def is_str(x: object) -> TypeIs[str]`), prefer `TypeIs`.

For exhaustiveness, end the chain with `assert_never(x)`, the counterpart of TS's `const _exhaustive: never = x`. A checker proves the branch unreachable, and if it's reached anyway, it raises at runtime:

```python run raises
from typing import Literal, assert_never

type Status = Literal["active", "banned"]

def describe(status: Status) -> str:
    if status == "active":
        return "can log in"
    elif status == "banned":
        return "locked out"
    else:
        assert_never(status)       # the checker proves this unreachable

print(describe("active"))
print(describe("pending"))         # a checker error; at runtime, AssertionError
```

## Overloads, Self and ParamSpec

:::compare
```ts
function parse(raw: string): number;
function parse(raw: string[]): number[];
function parse(raw: string | string[]) {
  return Array.isArray(raw) ? raw.map(Number) : Number(raw);
}

class Query {
  where(cond: string): this {
    return this;
  }
}
```
```python
@overload
def parse(raw: str) -> int: ...
@overload
def parse(raw: list[str]) -> list[int]: ...
def parse(raw: str | list[str]) -> int | list[int]:
    return [int(r) for r in raw] if isinstance(raw, list) else int(raw)

class Query:
    def where(self, cond: str) -> Self:
        return self


```
:::

`@overload` stacks signature-only declarations (with `...` bodies) above one real implementation, the same split as TypeScript's overload signatures. At runtime only the last definition exists. `Self` (3.11+) is TypeScript's `this` return type, so a subclass of `Query` keeps its own type through a method chain.

The last piece is typing decorators. `[**P, R]` declares a `ParamSpec`, which captures a whole parameter list, so the decorated function keeps its exact signature for the checker. It's the Python spelling of `<A extends unknown[], R>(fn: (...args: A) => R) => (...args: A) => R`, and [Decorators](lesson:decorators) covers writing them.

```python run
import functools
from collections.abc import Callable

def logged[**P, R](fn: Callable[P, R]) -> Callable[P, R]:
    @functools.wraps(fn)
    def wrapper(*args: P.args, **kwargs: P.kwargs) -> R:
        print(f"calling {fn.__name__}{args}")
        return fn(*args, **kwargs)
    return wrapper

@logged
def add(a: int, b: int) -> int:
    return a + b

print(add(2, 3))
```

## Checkers and stubs: Python's `tsc`

:::compare
```bash
npx tsc --noEmit              # type-check, emit nothing
npm install -D @types/express # types for an untyped package
```
```bash
uvx mypy --strict src/        # or: npx pyright
uv add --dev types-requests    # stubs for an untyped package
```
:::

**mypy** is the original checker. **pyright**, from Microsoft, is the engine inside VS Code's Pylance; it's fast and strict, and since it's written in TypeScript, `npx pyright` works. Newer Rust-based checkers such as Astral's `ty` and Meta's `pyrefly` read the same annotations. Configure them in `pyproject.toml`:

```toml
[tool.mypy]
strict = true                  # like "strict": true in tsconfig.json

[tool.pyright]
typeCheckingMode = "strict"
```

The rest of the TypeScript toolbox has direct counterparts:

| TypeScript | Python |
| --- | --- |
| `.d.ts` declaration files | `.pyi` stub files |
| DefinitelyTyped, `@types/x` | typeshed (bundled with the checkers), `types-x` packages |
| `"types"` in `package.json` | a `py.typed` marker file in the package |
| `// @ts-ignore`, `// @ts-expect-error` | `# type: ignore[code]` |
| `import type { User } from "./models"` | imports under `if TYPE_CHECKING:` |
| hover in the editor | `reveal_type(expr)` |

:::gotcha Unannotated code is unchecked code
mypy treats the parameters of an unannotated function as `Any` and, by default, doesn't even check its body. There's no `noImplicitAny` until you enable `--strict` (or `disallow_untyped_defs`), so a clean mypy run on a half-annotated codebase proves much less than a clean `tsc`. Turn on strict mode for new code.
:::

`reveal_type(expr)` makes the checker print the type it inferred, as hovering does in an editor. It also exists at runtime (3.11+, `from typing import reveal_type`), where it prints the runtime type to stderr and returns its argument unchanged, so a leftover call doesn't break anything:

```python run
from typing import reveal_type

prices = reveal_type([9.99, 4.50])   # checker: list[float]; runtime: 'list'
print(sum(prices))
```

## Runtime validation: pydantic ≈ zod

:::compare
```ts
import { z } from "zod";

const User = z.object({
  id: z.number().int(),
  email: z.string(),
  tags: z.array(z.string()),
});
type User = z.infer<typeof User>;

const user = User.parse(JSON.parse(body));
```
```python
from pydantic import BaseModel


class User(BaseModel):
    id: int
    email: str
    tags: list[str]




user = User.model_validate_json(body)
```
:::

Type hints describe data. They don't check what arrives from the network. zod builds a runtime schema and derives the static type from it. pydantic goes the other way: you write an ordinary annotated class, it reads the annotations to build a validator, and invalid input raises a `ValidationError` listing every problem. FastAPI validates request bodies with pydantic models, much like wiring zod into a Hono or tRPC route.

:::gotcha pydantic coerces by default
zod rejects `"42"` for a number unless you opt in with `z.coerce`. pydantic's default "lax" mode converts compatible input, so `"42"` becomes `42` for an `int` field. Turn on strict mode (`model_config = ConfigDict(strict=True)`) when you want zod's behaviour.
:::

The core trick, reading annotations and checking values against them, takes a few lines of standard library. This version handles plain classes only; the last challenge extends it to unions and `list[X]`:

```python run raises
import inspect
from typing import get_type_hints

def checked_call(fn, *args, **kwargs):
    hints = get_type_hints(fn)
    bound = inspect.signature(fn).bind(*args, **kwargs)
    for name, value in bound.arguments.items():
        expected = hints.get(name)
        if expected is not None and not isinstance(value, expected):
            raise TypeError(f"{name}: expected {expected.__name__}, got {type(value).__name__}")
    return fn(*args, **kwargs)

def repeat(word: str, times: int) -> str:
    return word * times

print(checked_call(repeat, "ab", times=3))
checked_call(repeat, "ab", "3")
```

## Cheat sheet

| TypeScript | Python | Notes |
| --- | --- | --- |
| `function f(x: number): string` | `def f(x: int) -> str:` | hints are never enforced at runtime |
| `let x: number;` | `x: int` | declares nothing: no variable exists |
| type erasure | `get_type_hints(obj)`, `inspect.signature(fn)` | annotations survive at runtime, lazily (3.14) |
| `type Alias = ...` | `type Alias = ...` | 3.12+; `TypeAlias` before |
| `function f<T>(x: T): T` | `def f[T](x: T) -> T:` | 3.12+; `TypeVar` before |
| `T extends Bound` | `[T: Bound]` | |
| `{ a: string; b?: number }` | `TypedDict` + `NotRequired` | a plain dict at runtime |
| `readonly` property | `ReadOnly[...]`, `Final` | 3.13+ for `ReadOnly` |
| `interface` | `Protocol` | structural; ordinary classes are nominal |
| `x as T` | `cast(T, x)` | no runtime effect |
| `x is T` | `TypeIs[T]` | 3.13+; `TypeGuard` in 3.10 |
| `const _: never = x` | `assert_never(x)` | raises if reached |
| overload signatures | `@overload` | |
| `this` type | `Self` | 3.11+ |
| `(...args: A) => R` generics | `[**P, R]` with `Callable[P, R]` | `ParamSpec` |
| `tsc --noEmit` | `mypy --strict`, `pyright` | |
| `@types/x` | `types-x` | stubs are `.pyi` files |
| `// @ts-ignore` | `# type: ignore[code]` | |
| `import type` | `if TYPE_CHECKING:` | |
| zod | pydantic | coerces unless strict |

## Challenges

:::challenge id=hints-translate title="Translate the signatures" difficulty=easy
The three functions below work, but have no annotations. Add annotations matching these TypeScript signatures. The counts and port numbers are whole numbers, so their `number`s become `int`.

```ts
function wordCounts(text: string): Record<string, number>
function firstOr<T>(items: T[], fallback: T): T
function parsePort(raw: string): number | undefined
```

Use the built-in generics (`list[...]`, `dict[...]`) and `|`, as this lesson recommends, and give `first_or` a type parameter (`def first_or[T](...)`, or a `TypeVar`). The tests read your annotations with `typing.get_type_hints`.

```python starter
def word_counts(text):
    counts = {}
    for word in text.lower().split():
        counts[word] = counts.get(word, 0) + 1
    return counts


def first_or(items, fallback):
    return items[0] if items else fallback


def parse_port(raw):
    if raw.isdigit() and 0 < int(raw) < 65536:
        return int(raw)
    return None
```

```python solution
def word_counts(text: str) -> dict[str, int]:
    counts: dict[str, int] = {}
    for word in text.lower().split():
        counts[word] = counts.get(word, 0) + 1
    return counts


def first_or[T](items: list[T], fallback: T) -> T:
    return items[0] if items else fallback


def parse_port(raw: str) -> int | None:
    if raw.isdigit() and 0 < int(raw) < 65536:
        return int(raw)
    return None
```

```python tests
from typing import TypeVar, get_type_hints

@test("word_counts(text: str) -> dict[str, int]")
def _():
    eq(get_type_hints(word_counts), {"text": str, "return": dict[str, int]})

@test("parse_port(raw: str) -> int | None")
def _():
    eq(get_type_hints(parse_port), {"raw": str, "return": int | None})

@test("first_or uses one type parameter for the items, the fallback and the result")
def _():
    hints = get_type_hints(first_or)
    T = hints.get("return")
    check(isinstance(T, TypeVar), "the return type should be a type parameter such as T")
    eq(hints, {"items": list[T], "fallback": T, "return": T})

@test("the functions still work")
def _():
    eq(word_counts("the cat saw the dog"), {"the": 2, "cat": 1, "saw": 1, "dog": 1})
    eq(first_or([], "none"), "none")
    eq(first_or([3, 4], 0), 3)
    eq(parse_port("8080"), 8080)
    eq(parse_port("http"), None)
```

```hint
`Record<string, number>` is `dict[str, int]`, and `number | undefined` is `int | None`.
```

```hint
Python 3.12+ declares the type parameter right after the function name: `def first_or[T](items: list[T], fallback: T) -> T:`.
```
:::

:::challenge id=hints-validate-typeddict title="Validate a TypedDict" difficulty=medium
A `TypedDict` checks nothing at runtime, so write the check yourself: the core of what zod and pydantic do. `validate(data, schema)` takes a dict and a `TypedDict` class and returns a list of error strings, empty when the data is valid. Report errors in this order:

1. For each field of the schema, in definition order: `"missing: <field>"` if a **required** field is absent, or `"<field>: expected <type>, got <type>"` if the value has the wrong type. Optional fields may be absent, but are checked when present.
2. Then, for each key in `data` that the schema doesn't define: `"unexpected: <key>"`.

Field types are plain classes such as `str`, `int`, `bool` and `list`, so `isinstance` works. Read everything from the schema itself (`get_type_hints(schema)` and `schema.__required_keys__`), because the tests use more than one schema.

```text
class Signup(TypedDict):
    email: str
    age: int
    newsletter: NotRequired[bool]

validate({"email": "ada@example.com", "age": "36", "admin": True}, Signup)
-> ["age: expected int, got str", "unexpected: admin"]
```

```js
const Signup = z.strictObject({
  email: z.string(),
  age: z.number(),
  newsletter: z.boolean().optional(),
});
const issues = Signup.safeParse(data).error?.issues ?? [];
```

```python starter
from typing import get_type_hints

def validate(data, schema):
    ...
```

```python solution
from typing import get_type_hints

def validate(data: dict[str, object], schema: type) -> list[str]:
    hints = get_type_hints(schema)
    errors = []
    for field, expected in hints.items():
        if field not in data:
            if field in schema.__required_keys__:
                errors.append(f"missing: {field}")
        elif not isinstance(data[field], expected):
            got = type(data[field]).__name__
            errors.append(f"{field}: expected {expected.__name__}, got {got}")
    errors += [f"unexpected: {key}" for key in data if key not in hints]
    return errors
```

```python tests
from typing import NotRequired, Required, TypedDict

class Signup(TypedDict):
    email: str
    age: int
    newsletter: NotRequired[bool]

class Product(TypedDict, total=False):
    sku: Required[str]
    price: float
    tags: list

@test("valid data has no errors")
def _():
    eq(validate({"email": "ada@example.com", "age": 36}, Signup), [])

@test("optional keys may be present")
def _():
    eq(validate({"email": "ada@example.com", "age": 36, "newsletter": True}, Signup), [])

@test("reports a missing required key")
def _():
    eq(validate({"email": "ada@example.com"}, Signup), ["missing: age"])

@test("reports a value of the wrong type")
def _():
    eq(validate({"email": "ada@example.com", "age": "36"}, Signup), ["age: expected int, got str"])

@test("checks optional keys when they're present")
def _():
    eq(
        validate({"email": "ada@example.com", "age": 36, "newsletter": "yes"}, Signup),
        ["newsletter: expected bool, got str"],
    )

@test("lists field errors in schema order, then unexpected keys")
def _():
    eq(
        validate({"admin": True, "age": "36", "email": 7}, Signup),
        ["email: expected str, got int", "age: expected int, got str", "unexpected: admin"],
    )

@test("works with any TypedDict, including total=False")
def _():
    eq(validate({"price": 9.99}, Product), ["missing: sku"])
    eq(validate({"sku": "A1", "tags": "sale"}, Product), ["tags: expected list, got str"])

@test("doesn't modify the data")
def _():
    data = {"email": "ada@example.com"}
    validate(data, Signup)
    eq(data, {"email": "ada@example.com"})
```

```hint
`get_type_hints(Signup)` returns `{"email": str, "age": int, "newsletter": bool}` in definition order, with the `NotRequired[...]` wrapper already stripped.
```

```hint
`Signup.__required_keys__` is a frozenset of the required field names. A missing key is only an error if it's in there.
```

```hint
`expected.__name__` and `type(value).__name__` give you the `int` and `str` for the message.
```
:::

:::challenge id=hints-enforce title="Enforce the annotations" difficulty=hard
Write a decorator `enforce` that makes a function check its own annotations on every call, a small version of what libraries like `typeguard` and `beartype` do.

- Map the call's arguments to parameter names, including defaults, and check each annotated parameter. Unannotated parameters accept anything.
- Check the return value against the return annotation, if there is one.
- On a mismatch, raise `TypeError` with a message that names the parameter, or says `return` for the return value.
- Support plain classes (`int`, `str`, your own classes), `Any`, unions written with `|` (including `X | None`), and `list[X]`, meaning a list whose items all match `X`.
- Keep the wrapped function's `__name__` and docstring.

```text
@enforce
def notify(user_ids: list[int], channel: str, note: str | None = None) -> int: ...

notify([1, 2], "email")           # fine
notify([1, "2"], "email")         # TypeError: user_ids ...
notify([1], "email", note=42)     # TypeError: note ...
```

```python starter
import functools
import inspect
import types
from typing import Any, Union, get_args, get_origin, get_type_hints


def matches(value, expected):
    """True if value fits the annotation `expected`."""
    ...


def enforce(fn):
    ...
```

```python solution
import functools
import inspect
import types
from typing import Any, Union, get_args, get_origin, get_type_hints


def matches(value: object, expected: object) -> bool:
    """True if value fits the annotation `expected`."""
    if expected is Any:
        return True
    origin = get_origin(expected)
    if origin is Union or origin is types.UnionType:
        return any(matches(value, option) for option in get_args(expected))
    if origin is list:
        (item_type,) = get_args(expected)
        return isinstance(value, list) and all(matches(item, item_type) for item in value)
    return isinstance(value, expected)


def enforce(fn):
    signature = inspect.signature(fn)
    hints = get_type_hints(fn)

    @functools.wraps(fn)
    def wrapper(*args, **kwargs):
        bound = signature.bind(*args, **kwargs)
        bound.apply_defaults()
        for name, value in bound.arguments.items():
            if name in hints and not matches(value, hints[name]):
                raise TypeError(f"{name}: expected {hints[name]}, got {value!r}")
        result = fn(*args, **kwargs)
        if "return" in hints and not matches(result, hints["return"]):
            raise TypeError(f"return: expected {hints['return']}, got {result!r}")
        return result

    return wrapper
```

```python tests
from typing import Any

def build():
    @enforce
    def notify(user_ids: list[int], channel: str, note: str | None = None) -> int:
        """Send a notification."""
        return len(user_ids)

    @enforce
    def describe(value: Any, label) -> str:
        return f"{label}: {value}"

    @enforce
    def broken(n: int) -> str:
        return n * 2              # returns an int, not a str

    check(callable(notify), "enforce() should return the wrapper function")
    return notify, describe, broken

@test("passes valid calls through")
def _():
    notify, describe, broken = build()
    eq(notify([1, 2, 3], "email"), 3)
    eq(notify([1], channel="sms", note="from the import"), 1)

@test("rejects a wrong positional argument, naming the parameter")
def _():
    notify, describe, broken = build()
    err = raises(TypeError, notify, [1, 2], 42)
    check("channel" in str(err), f"the message should name the parameter, got: {err}")

@test("rejects a wrong keyword argument")
def _():
    notify, describe, broken = build()
    err = raises(TypeError, notify, [1], "email", note=42)
    check("note" in str(err), f"the message should name the parameter, got: {err}")

@test("X | None accepts None and X")
def _():
    notify, describe, broken = build()
    eq(notify([1], "email", None), 1)
    eq(notify([1], "email", "hi"), 1)

@test("list[X] checks the container and every item")
def _():
    notify, describe, broken = build()
    raises(TypeError, notify, [1, "2"], "email")
    raises(TypeError, notify, (1, 2), "email")
    eq(notify([], "email"), 0)

@test("Any and unannotated parameters accept anything")
def _():
    notify, describe, broken = build()
    eq(describe([1], 2), "2: [1]")
    eq(describe(None, "x"), "x: None")

@test("checks the return value")
def _():
    notify, describe, broken = build()
    err = raises(TypeError, broken, 2)
    check("return" in str(err), f"the message should mention the return value, got: {err}")

@test("keeps the function's name and docstring")
def _():
    notify, describe, broken = build()
    eq(notify.__name__, "notify")
    eq(notify.__doc__, "Send a notification.")
```

```hint
`get_type_hints(fn)` gives `{parameter: annotation}` plus a `"return"` key. `inspect.signature(fn).bind(*args, **kwargs)` maps a call's arguments to parameter names, and `.apply_defaults()` adds the defaults.
```

```hint
Take the annotation apart with `get_origin` and `get_args`. `get_origin(int | None)` is `typing.Union` (it's `types.UnionType` before 3.14, so accept either) and `get_args` gives `(int, NoneType)`. `get_origin(list[int])` is `list`. Anything without an origin is a plain class that `isinstance` can handle, so recurse for nested types.
```

```hint
Decorate the wrapper with `@functools.wraps(fn)` to copy the name and docstring.
```
:::
