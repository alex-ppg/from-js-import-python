---
title: Designing Pythonic APIs
part: Types & Metaprogramming
summary: Protocols, keyword-only parameters, result objects, error hierarchies and deprecations that break nobody.
minutes: 45
---

A JavaScript library's API is mostly method names and options objects: `new Client(url, { timeout: 5 })`, `roster.size`, `query.where(...).limit(20)`. A Python library's API leans on the language itself. Callers expect your objects to work with `len()`, `in`, `for` and `with`, your functions to take keyword arguments, your errors to form a hierarchy they can catch, and your mistakes to be deprecated with a warning rather than broken in a minor release.

This lesson is the checklist a Python reviewer runs over a library's public surface, with what each item looks like in code. The mental shift: the most Pythonic API is often the one with the fewest names of its own.

## Protocols before methods

:::compare
```js
class Roster {
  constructor(pointsByEmail) {
    this.points = new Map(Object.entries(pointsByEmail));
  }
  get size() {
    return this.points.size;
  }
  has(email) {
    return this.points.has(email.toLowerCase());
  }
  [Symbol.iterator]() {
    return this.points.keys();
  }
}

[roster.size, roster.has("ada@example.com"), [...roster]];
```
```python
class Roster:
    def __init__(self, points_by_email):
        self._points = dict(points_by_email)

    def __len__(self):
        return len(self._points)

    def __contains__(self, email):
        return email.lower() in self._points

    def __iter__(self):
        return iter(self._points)


len(roster), "ada@example.com" in roster, list(roster)
```
:::

Every JavaScript collection library picks its own vocabulary: `size`, `length` or `count()`; `has`, `includes` or `contains`; `toArray()` or `values()`. Python fixed the vocabulary in the language. `len()`, `in`, `for`, `bool()`, `==`, `repr()` and `with` each call a dunder method, so once you implement the protocol your object works with everything that speaks it: `sorted()`, `sum()`, `max()`, `set()`, unpacking, comprehensions, `itertools`, and libraries that have never heard of your class. [Dunder Methods](lesson:dunder-methods#container-protocols) covers the mechanics. The design rule is to reach for a protocol first, and add named methods only for operations no protocol covers.

```python run
class Roster:
    def __init__(self, points_by_email):
        self._points = dict(points_by_email)

    def __len__(self):
        return len(self._points)

    def __contains__(self, email):
        return email.lower() in self._points

    def __iter__(self):                # best first: the class decides the order
        return iter(sorted(self._points, key=self._points.get, reverse=True))

roster = Roster({"ada@example.com": 50, "grace@example.com": 80, "linus@example.com": 20})
print(len(roster), "ADA@example.com" in roster, bool(Roster({})))
print(list(roster))
print(", ".join(roster), sorted(roster)[0])
leader, *others = roster
print(leader, len(others))
```

:::tip Inherit the rest from `collections.abc`
Subclass `Mapping`, `Sequence` or `Set` from `collections.abc`, implement the abstract methods, and the mixins supply the rest. `Mapping` turns `__getitem__`, `__iter__` and `__len__` into `get`, `keys`, `items`, `values`, `__contains__` and `__eq__`, and `isinstance(x, Mapping)` becomes true, so code that accepts "any mapping" accepts yours. You'll build one in the challenges.
:::

:::gotcha `__len__` also decides truthiness
Once a class has `__len__` and no `__bool__`, an empty instance is falsy, so `if roster:` means "if it has members", not "if it exists". That's right for containers, and a trap for objects that merely have a size. `xml.etree.ElementTree.Element` is falsy when it has no children, and testing its truth value now emits a `DeprecationWarning` telling you to write `len(elem)` or `elem is not None` instead. If an empty instance should still be true, define `__bool__` explicitly, or don't define `__len__`.
:::

:::pythonic Accept protocols, return concrete types
Annotate parameters with the most general protocol you need, from `collections.abc` (`Iterable[str]`, `Mapping[str, int]`), so callers can pass lists, tuples, generators, dict views or their own classes. Return concrete types (`list[str]`, `dict[str, int]`), so callers can index, mutate and serialise the result without guessing. For extension points of your own, `typing.Protocol` describes the methods you expect structurally, like a TypeScript interface ([Type Hints](lesson:type-hints#interfaces-protocol)).
:::

:::gotcha A `str` is an `Iterable[str]`
Accepting `Iterable[str]` has one famous hole. A string is an iterable of one-character strings, so a caller who passes one tag instead of a list of tags gets this, and the type checker approves:

```python run
from collections.abc import Iterable

def add_tags(tags: Iterable[str]) -> list[str]:
    return sorted(set(tags))

print(add_tags(["urgent", "billing"]))
print(add_tags("urgent"))            # a str is an Iterable[str] too
```

If a lone string is a likely mistake, reject it (`if isinstance(tags, str): raise TypeError(...)`), or accept `str | Iterable[str]` and wrap the single string in a list.
:::

## Keyword-only parameters instead of options objects

:::compare
```js
const client = new Client("https://api.shop.test", {
  timeout: 5,
  retries: 2,
  verify: false,
});
```
```python
client = Client(
    "https://api.shop.test",
    timeout=5,
    retries=2,
    verify=False,
)
```
The Python constructor is `def __init__(self, base_url, /, *, timeout=10.0, retries=3, verify=True)`.
:::

[Functions](lesson:functions#keyword-arguments-replace-options-objects) showed keyword arguments replacing options objects. As an API designer, the question is which parameters to make keyword-only, and the Pythonic answer is: almost all of them. A bare `*` buys three things. Call sites document themselves (`verify=False`, not a mystery `False`). You can add, reorder and deprecate keyword-only parameters without breaking a single caller, which positional parameters never allow. And unlike an opaque `**options` bag, every option shows up in `help()`, in editors and in type checkers.

Keep positional parameters for the one or two arguments whose meaning is obvious from their position: the URL here, or the iterable in `sorted(iterable, /, *, key=None, reverse=False)`.

### Positional-only parameters free up names

A `/` makes the parameters before it positional-only. Callers can't pass them by name, so you can rename them later without breaking anyone, and their names can't collide with a `**kwargs` catch-all. That second point matters for any function that forwards arbitrary keywords:

```python run
def render(template, **context):
    return template.format(**context)

try:
    render("Dear {name}, your {template} is attached", name="Ada", template="invoice")
except TypeError as err:
    print("TypeError:", err)

def render(template, /, **context):              # `template` can't be passed by name
    return template.format(**context)

print(render("Dear {name}, your {template} is attached", name="Ada", template="invoice"))
```

The standard library does this wherever it forwards keywords. `functools.partial(func, /, *args, **keywords)` has to accept a keyword argument called `func` for the function it wraps.

:::quiz output
What does this print?

```python
def connect(host, /, port=5432, *, timeout=10.0, **options):
    return sorted(options)

print(connect("db.local", host="replica", timeout=1))
```

- [ ] `TypeError`
- [x] `['host']`
- [ ] `['host', 'timeout']`
- [ ] `[]`

`host` is positional-only, so the name is free for keyword arguments: `host="replica"` doesn't clash with the first parameter and lands in `**options`. `timeout` matches a real keyword-only parameter, so it doesn't.
:::

### Sentinels for "not passed"

When `None` is a meaningful value, it can't also mean "the caller didn't pass anything". JavaScript has `undefined` for that, or a `"key" in options` check. Python libraries define a private sentinel, as [Functions](lesson:functions#defaults-are-evaluated-once) mentioned. `object()` works, but it shows up as `<object object at 0x...>` in `help()`, in signatures and in error messages. A one-member `Enum` with a short `__repr__` reads better, and type checkers can narrow it with `is`:

```python run
import enum
import inspect

class _Missing(enum.Enum):
    MISSING = enum.auto()

    def __repr__(self):
        return "MISSING"

MISSING = _Missing.MISSING

def get_setting(settings, key, *, default=MISSING):
    if key in settings:
        return settings[key]
    if default is MISSING:
        raise KeyError(key)
    return default

settings = {"theme": None}
print(get_setting(settings, "theme"), get_setting(settings, "locale", default=None))
print(inspect.signature(get_setting))

_SENTINEL = object()
def lookup(key, default=_SENTINEL): ...
print(inspect.signature(lookup))                 # the anonymous version
```

The standard library has its own: `dataclasses.MISSING` and `inspect.Parameter.empty` are sentinels of exactly this kind.

## Return objects, not anonymous tuples or dicts

:::compare
```js
function parseVersion(text) {
  const [major, minor, patch] = text.split(".").map(Number);
  return { major, minor, patch };   // callers destructure by name
}

const { major, minor } = parseVersion("3.14.2");
```
```python
class Version(NamedTuple):
    major: int
    minor: int
    patch: int


def parse_version(text: str) -> Version:
    return Version(*map(int, text.split(".")))


major, minor, _ = parse_version("3.14.2")    # by position...
parse_version("3.14.2").minor                # ...or by name
```
:::

JavaScript functions return objects and callers destructure them by name, so adding a field never breaks anyone. A Python tuple is destructured by **position**: its order is part of your API, and so is its length. A plain dict avoids that but gives up attribute access, a useful `repr`, immutability and precise types. Return a record instead:

- A **`NamedTuple`** when the result is small, fixed and naturally a tuple, or when you're upgrading a function that already returns a plain tuple, since unpacking callers keep working. The standard library did exactly that with `urllib.parse.urlsplit`, `sys.version_info` and `os.stat`.
- A **frozen dataclass** when the result may grow, needs methods, or shouldn't be iterable.
- A **`TypedDict`** when the data really is JSON-shaped and callers will serialise it as a dict.

[Dataclasses, NamedTuples & Enums](lesson:dataclasses-and-enums#choosing-a-record-type) compares the options in detail.

```python run
import sys
from urllib.parse import urlsplit

parts = urlsplit("https://shop.example/cart?item=42")
scheme, host, path, query, fragment = parts       # still a 5-tuple...
print(host, parts.query)                          # ...with names
print(parts._replace(query="").geturl())
print(sys.version_info >= (3, 12), sys.version_info.minor)   # compares like a tuple
```

:::gotcha A `NamedTuple` can't grow
Tuple compatibility cuts both ways: a caller who unpacked the result depends on its length. Add a field in your next release and every `major, minor, patch = parse_version(...)` breaks:

```python run raises
from typing import NamedTuple

class Version(NamedTuple):
    major: int
    minor: int
    patch: int
    pre_release: str = ""          # added in version 2 of your library

major, minor, patch = Version(3, 14, 2)
```

If a result might gain fields, return a frozen dataclass from the start. It isn't iterable, so nobody can come to depend on its field count.
:::

## A `__repr__` for developers

:::compare
```js
console.log(basket);
// Basket { owner: 'ada', items: [ 'tea', 'scones' ] }: free, via util.inspect

`${basket}`;
// "[object Object]" unless you write toString()
```
```python
print(repr(basket))
# Basket('ada', items=['tea', 'scones']): only if you write __repr__

print(basket)
# falls back to __repr__; without one, <__main__.Basket object at 0x7f3a...>
```
:::

Node's `util.inspect` shows an object's fields for free. Python's default repr shows only the class and a memory address, so a good `__repr__` is part of your API: it's what users see in the REPL, in tracebacks, in log lines formatted with `%r`, in pytest's failure messages and in debuggers. [Dunder Methods](lesson:dunder-methods#repr-and-str) covers `__repr__` versus `__str__`. The conventions for a library:

- If the object can be rebuilt from a constructor call, make the repr that call: `Money(amount=Decimal('9.99'), currency='EUR')`. Format each field with `!r`, so strings get quotes and nested objects show their own repr.
- If it can't, because it wraps a connection, a file or a match result, use angle brackets around the useful state, as the standard library does: `<re.Match object; span=(0, 3), match='abc'>`.
- Use `type(self).__name__`, not a hard-coded class name, so subclasses report themselves correctly.
- Keep it bounded. `reprlib.repr()` truncates long containers, and the `@reprlib.recursive_repr()` decorator guards against an object that contains itself.

```python run
import reprlib

class Basket:
    def __init__(self, owner, items=()):
        self.owner = owner
        self.items = list(items)

    def __repr__(self):
        return f"{type(self).__name__}({self.owner!r}, items={reprlib.repr(self.items)})"

class GiftBasket(Basket):
    pass

print(Basket("ada", ["tea", "scones"]))
print(GiftBasket("grace", range(100)))      # the subclass's name, truncated items
print([Basket("linus")])                    # containers show their items' repr
```

:::quiz output
What does this print?

```python
class Money:
    def __init__(self, cents):
        self.cents = cents

    def __repr__(self):
        return f"Money({self.cents!r})"

class Refund(Money):
    pass

print([Refund(500)])
```

- [ ] `[Refund(500)]`
- [x] `[Money(500)]`
- [ ] `[<__main__.Refund object>]`
- [ ] `[500]`

The hard-coded name lies about the subclass, and that repr is exactly what shows up in a log line or a failing test. `f"{type(self).__name__}({self.cents!r})"` prints `Refund(500)`. A dataclass's generated `__repr__` gets this right for you.
:::

## Exceptions are part of the API

:::compare
```js
try {
  await shop.reserve("A1", 3);
} catch (err) {
  if (err.code === "OUT_OF_STOCK") {
    showWaitlist(err.sku);
  } else if (err instanceof ShopError) {
    retryLater();
  } else {
    throw err;
  }
}
```
```python
try:
    shop.reserve("A1", 3)
except OutOfStockError as err:     # one class per failure
    show_waitlist(err.sku)
except ShopError:                  # the library's base class
    retry_later()
# anything else propagates on its own
```
:::

JavaScript libraries often identify a failure by an `err.code` string, as Node does with `ENOENT`, since messages change and `instanceof` breaks across duplicated packages and realms. Python's `except` matches by class, base classes included, so the class hierarchy *is* the error API. The conventions:

1. **One base class per library** (`class ShopError(Exception)`), so callers can catch everything you raise with one clause.
2. **One subclass per failure a caller might handle differently**, named for the problem and ending in `Error`.
3. **Also inherit from the built-in that describes the failure.** `class OutOfStockError(ShopError, LookupError)` is still caught by code that handles `LookupError`, including code written before your library existed.
4. **Put the data on attributes** (`err.sku`, `err.available`), so handlers never parse messages.
5. **Don't leak implementation details.** Translate a `sqlite3.IntegrityError` into your own error with `raise ... from err` ([Errors & Exceptions](lesson:exceptions#re-raising-and-chaining)).

Python's own `OSError` shows the pattern at scale. `FileNotFoundError` and `PermissionError` are subclasses, and `OSError(errno.ENOENT, "...")` even constructs a `FileNotFoundError` for you, so `except FileNotFoundError:` replaces Node's `err.code === "ENOENT"`.

```python run
class ShopError(Exception):
    """Base class for every error this library raises."""

class OutOfStockError(ShopError, LookupError):
    def __init__(self, sku, available):
        super().__init__(sku, available)
        self.sku = sku
        self.available = available

    def __str__(self):
        return f"only {self.available} of {self.sku!r} left"

def reserve(sku, qty):
    raise OutOfStockError(sku, available=2)

for handler in (OutOfStockError, ShopError, LookupError):
    try:
        reserve("A1", qty=3)
    except handler as err:
        print(f"caught as {handler.__name__}: {err} (available={err.available})")
```

:::gotcha Subclassing `KeyError` changes `str()`
`KeyError.__str__` shows its argument's repr, so that `d[""]` reports `KeyError: ''` rather than an empty message. Inherit from `KeyError` and your messages get quotes: `str(MissingSettingError("port is required"))` is `'port is required'`, quote marks included. Override `__str__`, as `OutOfStockError` does above, or inherit from `LookupError` instead, which prints its message as is.
:::

:::deep Pass every argument to `super().__init__()`
Exceptions are copied and pickled by calling their class with `err.args`, which is how they cross process boundaries in `multiprocessing` and `concurrent.futures`. If `__init__` takes `(sku, available)` but hands `super().__init__()` only a formatted message, `args` is that one message, and rebuilding the exception fails:

```python run
import pickle

class OutOfStockError(Exception):
    def __init__(self, sku, available):
        super().__init__(f"only {available} of {sku!r} left")   # args == (message,)
        self.sku = sku
        self.available = available

try:
    pickle.loads(pickle.dumps(OutOfStockError("A1", 2)))
except TypeError as err:
    print("TypeError:", err)
```

The fix is the one the playground above uses: pass the real arguments (`super().__init__(sku, available)`) and build the message in `__str__`. Then `args`, `repr()`, copying and pickling all agree.
:::

:::quiz output
What does this print?

```python
class ShopError(Exception): pass
class OutOfStockError(ShopError, LookupError): pass

try:
    raise OutOfStockError("A1")
except KeyError:
    print("KeyError")
except LookupError:
    print("LookupError")
except ShopError:
    print("ShopError")
```

- [ ] `KeyError`
- [x] `LookupError`
- [ ] `ShopError`
- [ ] `OutOfStockError`

`except` clauses are tried top to bottom and the first one that matches wins. `KeyError` is a sibling of `OutOfStockError`, not a parent, so it doesn't match; `LookupError` is a parent, so it does, and `ShopError` never gets a look.
:::

## Context managers and decorators as API surface

:::compare
```js
const tx = await db.begin();
try {
  await tx.insert("orders", order);
  await tx.commit();
} catch (err) {
  await tx.rollback();
  throw err;
}

app.get("/orders", listOrders);    // register a handler
```
```python
with db.transaction() as tx:
    tx.insert("orders", order)     # commit on success, roll back on error


@app.get("/orders")                # register a handler
def list_orders(): ...
```
:::

Two Python features turn usage patterns into syntax, and good libraries expose both. If using your API correctly requires a matching cleanup step (commit or roll back, release, restore, close), offer a context manager, so the cleanup can't be forgotten. `open()`, `sqlite3` connections, `unittest.mock.patch` and `decimal.localcontext` all work this way ([Context Managers](lesson:context-managers)). If users plug their functions into your framework, offer a decorator. Flask's `@app.get`, pytest's `@pytest.fixture` and click's `@click.command` all turn "define a function, then register it" into one line above the `def` ([Decorators](lesson:decorators#decorators-with-arguments)). Prefer returning the original function, as Flask does, so it stays callable and testable on its own.

### One implementation, both spellings

`contextlib.ContextDecorator` makes a context manager usable as a decorator too, and every `@contextmanager` function gets that for free: wrap a block with `with timed("load"):`, or a whole function with `@timed("total")`, from one implementation. Each call of the decorated function gets a fresh context, because the manager knows how to recreate its generator.

```python run
import time
from contextlib import contextmanager

@contextmanager
def timed(label, *, clock=time.perf_counter, report=print):
    start = clock()
    try:
        yield
    finally:
        report(f"{label}: {clock() - start:.3f}s")

with timed("load"):
    rows = [n * n for n in range(1000)]

@timed("total")                  # the same object, used as a decorator
def total(numbers):
    return sum(numbers)

print(total(rows))
```

Note the keyword-only `clock` and `report`: injectable dependencies with sensible defaults are what make an API like this testable without patching anything.

## Fluent chains vs Python style

:::compare
```js
const orders = await db("orders")
  .where("status", "paid")
  .orderBy("created_at", "desc")
  .limit(20);
```
```python
orders = session.scalars(
    select(Order)
    .where(Order.status == "paid")
    .order_by(Order.created_at.desc())
    .limit(20)
)
```
:::

Chaining is fine in Python, with one rule the standard library follows everywhere: **a method either mutates and returns `None`, or returns a new object, never both.** `list.sort()`, `dict.update()` and `random.shuffle()` return `None` precisely so nobody writes `xs.sort().reverse()` and mistakes a mutation for a copy. The chains you meet in Python (`str` methods, `pathlib.Path`, `datetime.replace()`, SQLAlchemy's `select()` above, pandas) return a new object from every step, and most of them are immutable values to begin with. So:

- When every option is known up front, prefer one call with keyword arguments to a builder: `fetch(url, timeout=5, retries=2)`, not `Request(url).timeout(5).retries(2).send()`.
- When you do want a builder (queries, pipelines, configuration composed in stages), make each step return a **new** object. A partial query can then be shared and extended safely, which a `return self` builder can't offer.

```python run
from dataclasses import dataclass, replace

@dataclass(frozen=True)
class Query:
    table: str
    filters: tuple = ()
    limit_to: int | None = None

    def where(self, **conditions):
        return replace(self, filters=self.filters + tuple(conditions.items()))

    def limit(self, n):
        return replace(self, limit_to=n)

paid = Query("orders").where(status="paid")       # a reusable base
recent_eu = paid.where(region="eu").limit(20)
print(paid)
print(recent_eu)
```

:::gotcha `return self` builders share state
If `where()` mutated and returned `self`, then `paid.where(region="eu")` would change `paid` too, and every query built from it afterwards would inherit the EU filter. Mutable JavaScript builders such as knex's have the same trap, which is why they grow a `.clone()` method. In Python the design also breaks the mutate-or-return rule, so a reviewer will flag it before it bites.
:::

## The public surface: underscores, `__all__` and `__init__.py`

:::compare
```json
{
  "name": "shopkit",
  "exports": {
    ".": "./dist/index.js",
    "./testing": "./dist/testing.js"
  }
}
```
```python
# shopkit/__init__.py
from shopkit._client import Client
from shopkit._errors import OutOfStockError, ShopError

__all__ = ["Client", "OutOfStockError", "ShopError"]
```
:::

A Node package can hide its internal files behind an `exports` map. Python can't hide anything: every module and every name is importable by anyone who types the path. "Public" is a convention instead, one that every tool understands:

- **Names and modules that start with `_` are private.** Put the implementation in `_client.py`, `_errors.py` and so on.
- **Re-export the public names from the package's `__init__.py`**, so users write `from shopkit import Client`, and you can move code between private modules without breaking them.
- **List them in `__all__`.** It documents the surface, controls `from shopkit import *` ([Modules, Packages & Tooling](lesson:modules-and-tooling#import-and-all)), and tells documentation tools what to show. Type checkers apply the same rule to typed libraries: a name your module merely imported counts as private unless it's listed in `__all__` or re-exported with the redundant `from shopkit._client import Client as Client` form.

Anything without an underscore that users can reach, they will use, and you'll have to keep it working. Keep the public surface small on purpose.

## Deprecating without breaking anyone

:::compare
```js
import { deprecate } from "node:util";

export const getJson = deprecate(
  (url) => fetchJson(url),
  "getJson() is deprecated, use fetchJson()",
  "SHOP001",
);
```
```python
import warnings


@warnings.deprecated("get_json() is deprecated, use fetch_json()")
def get_json(url):
    return fetch_json(url)
```
:::

Python's deprecation machinery is the `warnings` module. `warnings.warn(message, DeprecationWarning, stacklevel=2)` reports the warning against your **caller's** line, the code that has to change, instead of a line inside your library, which is what the default `stacklevel=1` does. `@warnings.deprecated` (3.13+, PEP 702) wraps a function or class so that every call or instantiation warns, stores the message on `__deprecated__`, and tells type checkers as well, so editors strike the name through, like JSDoc's `@deprecated` in TypeScript. On older Pythons, the same decorator lives in `typing_extensions`.

Who sees the warning? `DeprecationWarning` is hidden by default, except when it's attributed to code in `__main__`, which is another reason `stacklevel` matters. Test runners show it: pytest prints a warnings summary, and `python -W error::DeprecationWarning` turns every one into an exception, which is how you keep CI honest. For behaviour changes that the end users of an application should notice, use `FutureWarning`, which is shown by default.

```python run
import warnings

def get_json(url):
    warnings.warn("get_json() is deprecated, use fetch_json()", DeprecationWarning, stacklevel=2)
    return {"url": url}

with warnings.catch_warnings(record=True) as caught:
    warnings.simplefilter("always")
    get_json("/orders")                     # the line the warning blames
for w in caught:
    print(f"{w.category.__name__} at line {w.lineno}: {w.message}")

@warnings.deprecated("LegacyClient is deprecated, use Client")
class LegacyClient: ...

print(LegacyClient.__deprecated__)
```

:::quiz output
What does this print?

```python
import warnings

def old_api():
    warnings.warn("use new_api()", DeprecationWarning)

with warnings.catch_warnings(record=True) as caught:
    warnings.simplefilter("always")
    old_api()
print(caught[0].lineno)
```

- [x] `4`
- [ ] `8`
- [ ] `3`
- [ ] `9`

Without `stacklevel`, the warning is attributed to the `warnings.warn` line itself, inside `old_api`: useless to a caller hunting for the code to change. With `stacklevel=2` it would report line 8, the call.
:::

### Renamed and moved names

Most changes fit one of two patterns. A **renamed parameter** accepts both names for a release or two, warns on the old one, and raises `TypeError` if a caller passes both; you'll write it as a decorator in the challenges. A **renamed or moved module attribute** uses a module-level `__getattr__` (PEP 562), which Python calls only when normal lookup fails, so it can hand back the new object along with a warning:

```python run
import importlib
import sys
import warnings
from pathlib import Path

Path("shopkit_v2.py").write_text('''
import warnings

class Client: ...

def __getattr__(name):
    if name == "ShopClient":
        warnings.warn("ShopClient is now Client", DeprecationWarning, stacklevel=2)
        return Client
    raise AttributeError(f"module {__name__!r} has no attribute {name!r}")
''', encoding="utf-8")
importlib.invalidate_caches()
sys.modules.pop("shopkit_v2", None)

with warnings.catch_warnings(record=True) as caught:
    warnings.simplefilter("always")
    from shopkit_v2 import Client, ShopClient     # the old name still works...
print(ShopClient is Client, "|", caught[0].message)
```

## Backwards compatibility

In Python, more of a function is public than in JavaScript, because callers can use its parameter names. A change is breaking if a call, an unpacking or an `except` that worked before stops working:

| Change | Breaks callers? | Safer route |
| --- | --- | --- |
| Add a keyword-only parameter with a default | No | the standard way to grow a function |
| Rename a parameter | Yes, for keyword callers | make it positional-only from the start, or accept both names with a warning |
| Reorder positional parameters | Yes | make them keyword-only |
| Add a field to a `NamedTuple` result | Yes, for unpacking callers | return a dataclass |
| Add a field to a dataclass result | No, if it has a default and goes last | |
| Return a generator instead of a list | Yes: `len()`, indexing and a second loop all break | add a new function |
| Raise a different exception type | Yes, unless it subclasses the old one | `class NewError(OldError)` |
| Change a default value | Silently changes behaviour | warn with `FutureWarning` for a release first |
| Remove or rename a public name | Yes | deprecate first, with a module `__getattr__` |

Bump the major version for breaking changes, as on npm, and read installed versions with `importlib.metadata.version("shopkit")` rather than trusting a hand-maintained `__version__` string ([Introspection & the ast Module](lesson:introspection-and-ast)). Run your own test suite with `-W error::DeprecationWarning`, so your code never quietly depends on what you've deprecated.

## Cheat sheet

| JavaScript | Python | Notes |
| --- | --- | --- |
| `get size()`, `has()`, `[Symbol.iterator]` | `__len__`, `__contains__`, `__iter__` | protocols, not method names |
| implement `Map`'s whole API | subclass `collections.abc.Mapping` | three methods in, the rest free |
| `new Client(url, { timeout: 5 })` | `Client(url, timeout=5)` | keyword-only parameters after `*` |
| (no equivalent) | parameters before `/` | positional-only: free to rename |
| `undefined` means "not passed" | a private `MISSING` sentinel | when `None` is a real value |
| `return { major, minor }` | a `NamedTuple` or frozen dataclass | tuples unpack by position |
| `util.inspect.custom` | `__repr__` | `Type(field=...)` or `<Type ...>` |
| `class ShopError extends Error` | `class ShopError(Exception)` | one base class per library |
| `err.code === "ENOENT"` | `except FileNotFoundError:` | the hierarchy is the API |
| `try`/`finally` around a resource | a context manager | `with` |
| `app.get(path, handler)` | `@app.get(path)` | registration decorators |
| `return this` chains | return new objects, or `None` from mutators | never both |
| `package.json` `exports` | `_private` modules, `__init__.py` re-exports, `__all__` | convention, not enforcement |
| `util.deprecate(fn, msg)` | `@warnings.deprecated(msg)` | 3.13+; `typing_extensions` before |
| `console.warn()` at the call site | `warnings.warn(msg, DeprecationWarning, stacklevel=2)` | blames the caller's line |
| JSDoc `@deprecated` | `@warnings.deprecated` | type checkers see it too |

## Challenges

:::challenge id=api-first-default title="A default that can be None" difficulty=easy
Write `first(iterable, /, *, default=MISSING)` that returns the first item of any iterable:

- It works on any iterable: lists, strings, dict keys, generators.
- If the iterable is empty, return `default` when the caller passed one, **even if it's `None`**. Otherwise raise `ValueError`.
- `iterable` is positional-only and `default` is keyword-only.
- Define a module-level sentinel `MISSING` whose repr is `MISSING`, so `help(first)` shows `first(iterable, /, *, default=MISSING)`.
- Consume at most one item. Given an iterator, the rest of it must still be there afterwards.

```text
first([3, 1, 2])            ->  3
first([], default=None)     ->  None
first([])                   ->  ValueError
```

```js
function first(iterable, options = {}) {
  for (const item of iterable) return item;
  if ("default" in options) return options.default;   // passed, even as undefined
  throw new RangeError("first() of an empty iterable");
}
```

```python starter
MISSING = object()


def first(iterable, default=MISSING):
    ...
```

```python solution
class _MissingType:
    """The type of MISSING, the default that means "not passed"."""

    def __repr__(self):
        return "MISSING"


MISSING = _MissingType()


def first(iterable, /, *, default=MISSING):
    for item in iterable:
        return item
    if default is MISSING:
        raise ValueError("first() of an empty iterable with no default")
    return default
```

```python tests
import inspect

@test("returns the first item of any iterable")
def _():
    eq(first([3, 1, 2]), 3)
    eq(first("abc"), "a")
    eq(first({"x": 1, "y": 2}), "x")
    eq(first(n * n for n in range(2, 5)), 4)

@test("falsy first items are still returned")
def _():
    eq(first([0, 1]), 0)
    eq(first(["", "a"]), "")
    check(first([None, 1]) is None, "first([None, 1]) should return None, the first item")

@test("an empty iterable returns the default, even None")
def _():
    check(first([], default=None) is None, "default=None was passed, so return None")
    eq(first([], default=0), 0)
    eq(first(iter(()), default="none"), "none")

@test("an empty iterable without a default raises ValueError")
def _():
    raises(ValueError, first, [])
    raises(ValueError, first, (n for n in []))

@test("consumes at most one item")
def _():
    numbers = iter([1, 2, 3])
    eq(first(numbers), 1)
    eq(list(numbers), [2, 3], "the rest of an iterator should still be there")

@test("iterable is positional-only, default is keyword-only")
def _():
    raises(TypeError, first, iterable=[1])
    raises(TypeError, first, [], None)

@test("help() shows default=MISSING")
def _():
    eq(str(inspect.signature(first)), "(iterable, /, *, default=MISSING)")
    eq(repr(MISSING), "MISSING")
```

```hint
A `for` loop that `return`s on its first iteration takes exactly one item. If the loop body never runs, the iterable was empty.
```

```hint
Compare with `is`: `if default is MISSING:`. For the signature, put `/` after `iterable` and `*` before `default`.
```

```hint
`object()` prints as `<object object at 0x...>`. A tiny class with `def __repr__(self): return "MISSING"`, or a one-member `Enum`, gives the sentinel a readable name.
```
:::

:::challenge id=api-headers-mapping title="Case-insensitive headers" difficulty=medium
HTTP header names are case-insensitive, which is why `fetch`'s `Headers` has `get()` and `has()` instead of plain property access. Write a read-only `Headers` class that behaves like a dict, by inheriting from `collections.abc.Mapping` instead of reimplementing the dict API:

- `Headers(headers)` accepts what `dict()` accepts: a mapping, or an iterable of `(name, value)` pairs. `Headers()` is empty. Copy the input, so later changes to the caller's dict don't leak in.
- Lookups ignore case: `headers["content-type"]` finds `"Content-Type"`. A missing name raises `KeyError`.
- Iterating yields the names as they were written, in insertion order. Two names that differ only in case are the same header: the later one wins, spelling included.
- `len()`, `in`, `get()`, `keys()`, `items()` and `==` should all work, and all ignore case where they look names up.
- `repr(headers)` is `Headers({'Content-Type': 'text/html', 'X-Request-Id': '42'})`, which can be pasted back in.
- Assigning a header raises `TypeError`.

```js
const headers = new Headers({ "Content-Type": "text/html" });
headers.get("content-type");     // "text/html"
headers.has("CONTENT-TYPE");     // true
[...headers.keys()];             // ["content-type"]: fetch lowercases names
```

```python starter
from collections.abc import Mapping


class Headers(Mapping):
    def __init__(self, headers=()):
        ...
```

```python solution
from collections.abc import Mapping


class Headers(Mapping):
    """Read-only HTTP headers with case-insensitive names."""

    def __init__(self, headers=()):
        # lowercased name -> (name as written, value); a later duplicate wins
        self._items = {name.lower(): (name, value) for name, value in dict(headers).items()}

    def __getitem__(self, name):
        return self._items[name.lower()][1]

    def __iter__(self):
        return (name for name, _ in self._items.values())

    def __len__(self):
        return len(self._items)

    def __repr__(self):
        return f"{type(self).__name__}({dict(self)!r})"
```

```python tests
from collections.abc import Mapping

def sample():
    return Headers({"Content-Type": "text/html", "X-Request-Id": "42"})

@test("lookups ignore case")
def _():
    headers = sample()
    eq(headers["content-type"], "text/html")
    eq(headers["CONTENT-TYPE"], "text/html")
    eq(headers["x-request-id"], "42")

@test("a missing name raises KeyError")
def _():
    raises(KeyError, lambda: sample()["Accept"])

@test("accepts a mapping or (name, value) pairs")
def _():
    eq(Headers([("Accept", "*/*")])["accept"], "*/*")
    eq(len(Headers()), 0)

@test("in, len() and get() ignore case")
def _():
    headers = sample()
    check("content-type" in headers, "'content-type' in headers should be True")
    check("Accept" not in headers, "'Accept' in headers should be False")
    eq(len(headers), 2)
    eq(headers.get("CONTENT-type"), "text/html")
    eq(headers.get("Accept", "*/*"), "*/*")

@test("iterates over the names as written, in order")
def _():
    eq(list(Headers({"X-B": "1", "x-a": "2"})), ["X-B", "x-a"])
    eq(list(sample().items()), [("Content-Type", "text/html"), ("X-Request-Id", "42")])

@test("names that differ only in case are one header: the later one wins")
def _():
    headers = Headers([("Accept", "text/html"), ("ACCEPT", "application/json")])
    eq(len(headers), 1)
    eq(dict(headers), {"ACCEPT": "application/json"})

@test("is a real Mapping")
def _():
    headers = sample()
    check(isinstance(headers, Mapping), "inherit from collections.abc.Mapping")
    eq(dict(headers), {"Content-Type": "text/html", "X-Request-Id": "42"})
    eq(headers, {"Content-Type": "text/html", "X-Request-Id": "42"})

@test("is read-only")
def _():
    headers = sample()
    def assign():
        headers["Accept"] = "*/*"
    raises(TypeError, assign)

@test("copies its input")
def _():
    source = {"Accept": "text/html"}
    headers = Headers(source)
    source["Accept"] = "image/png"
    eq(headers["accept"], "text/html", "changing the caller's dict changed the headers")

@test("repr can be pasted back in")
def _():
    headers = sample()
    eq(repr(headers), "Headers({'Content-Type': 'text/html', 'X-Request-Id': '42'})")
    eq(eval(repr(headers), {"Headers": Headers}), headers)
```

```hint
`Mapping` needs exactly three methods: `__getitem__`, `__iter__` and `__len__`. Instantiating the starter tells you so. `in`, `get()`, `keys()`, `items()`, `values()` and `==` are built on top of them.
```

```hint
Store one dict keyed by `name.lower()`, holding `(name, value)` pairs, so you keep the original spelling for iteration. A dict comprehension over `dict(headers).items()` builds it, and a later duplicate replaces the earlier one.
```

```hint
For the repr, `dict(self)` builds a plain dict through your own `__iter__` and `__getitem__`; format it with `!r` inside `f"{type(self).__name__}(...)"`.
```
:::

:::challenge id=api-renamed-param title="Rename a parameter without breaking anyone" difficulty=medium
Version 2 of your library renames `fetch()`'s `max_retries` parameter to `retries`. Write a decorator factory `renamed(**old_to_new)` that keeps old callers working for a release:

```python
@renamed(max_retries="retries", wait="backoff")
def fetch(url, *, retries=3, backoff=1.0): ...

fetch("/orders", retries=5)                  # fine, no warning
fetch("/orders", max_retries=5)              # works, with a DeprecationWarning
fetch("/orders", max_retries=5, retries=1)   # TypeError: pass only one
```

- An old keyword is forwarded under its new name, with a `DeprecationWarning` whose message mentions both names, attributed to the **caller's** line.
- Passing both the old and the new name raises `TypeError`.
- Calls that don't use an old name pass straight through, positional arguments included, without a warning.
- The decorated function keeps its `__name__` and docstring.

```js
// Node's version: warn once, keep the old option working
function fetch(url, options = {}) {
  if ("maxRetries" in options) {
    process.emitWarning("maxRetries is deprecated, use retries", "DeprecationWarning");
    options = { ...options, retries: options.maxRetries };
  }
  // ...
}
```

```python starter
import functools
import warnings


def renamed(**old_to_new):
    ...
```

```python solution
import functools
import warnings


def renamed(**old_to_new):
    def decorator(fn):
        @functools.wraps(fn)
        def wrapper(*args, **kwargs):
            for old, new in old_to_new.items():
                if old not in kwargs:
                    continue
                if new in kwargs:
                    raise TypeError(f"{fn.__name__}() got both {old!r} and {new!r}; pass only {new!r}")
                warnings.warn(
                    f"{fn.__name__}(): {old!r} is deprecated, use {new!r}",
                    DeprecationWarning,
                    stacklevel=2,
                )
                kwargs[new] = kwargs.pop(old)
            return fn(*args, **kwargs)

        return wrapper

    return decorator
```

```python tests
import warnings

def build():
    @renamed(max_retries="retries", wait="backoff")
    def fetch(url, *, retries=3, backoff=1.0):
        """Fetch a URL, retrying on failure."""
        return (url, retries, backoff)

    return fetch

def call(fn, *args, **kwargs):
    """Call fn and return (result, the warnings it emitted)."""
    with warnings.catch_warnings(record=True) as caught:
        warnings.simplefilter("always")
        result = fn(*args, **kwargs)
    return result, caught

@test("the new name works, without a warning")
def _():
    result, caught = call(build(), "/orders", retries=5)
    eq(result, ("/orders", 5, 1.0))
    eq(len(caught), 0, "no warning expected for the new name")

@test("the old name still works")
def _():
    result, caught = call(build(), "/orders", max_retries=5)
    eq(result, ("/orders", 5, 1.0))

@test("the old name emits a DeprecationWarning naming both")
def _():
    _, caught = call(build(), "/orders", max_retries=5)
    eq(len(caught), 1, "expected exactly one warning")
    check(issubclass(caught[0].category, DeprecationWarning), "warn with DeprecationWarning")
    message = str(caught[0].message)
    check("max_retries" in message and "retries" in message.replace("max_retries", ""),
          f"mention both the old and the new name, got: {message}")

@test("the warning points at the caller's line")
def _():
    _, caught = call(build(), "/orders", max_retries=5)
    eq(caught[0].filename, "tests.py", "use stacklevel=2 so the warning blames the caller, not your wrapper")

@test("several renames at once")
def _():
    result, caught = call(build(), "/orders", max_retries=1, wait=0.5)
    eq(result, ("/orders", 1, 0.5))
    eq(len(caught), 2)

@test("passing both names raises TypeError")
def _():
    raises(TypeError, build(), "/orders", max_retries=1, retries=2)

@test("other calls pass straight through")
def _():
    result, caught = call(build(), "/orders")
    eq(result, ("/orders", 3, 1.0))
    eq(len(caught), 0)

@test("keeps the function's name and docstring")
def _():
    fetch = build()
    eq(fetch.__name__, "fetch")
    eq(fetch.__doc__, "Fetch a URL, retrying on failure.")
```

```hint
Three layers: `renamed(**old_to_new)` returns a decorator, the decorator takes `fn` and returns a `wrapper(*args, **kwargs)`, and the wrapper rewrites `kwargs` before calling `fn`. Put `@functools.wraps(fn)` on the wrapper.
```

```hint
`kwargs[new] = kwargs.pop(old)` moves a value to its new name. Check `if new in kwargs` first, and raise `TypeError` if the caller passed both.
```

```hint
`stacklevel=1` blames the `warnings.warn` line in your wrapper. The caller is one frame further out: `stacklevel=2`.
```
:::

:::challenge id=api-error-hierarchy title="Errors worth catching" difficulty=hard
Design the exceptions for a settings loader, then write `read_port(settings, *, key="port")`, which reads `settings[key]` (a string, as from an `.env` file) and returns it as an `int`.

- `SettingsError(Exception)` is the base class for everything the loader raises.
- `MissingSettingError` is raised when the key is missing. It's also a `KeyError`, has a `.key` attribute, and `str(err)` is exactly `missing setting 'port'`.
- `InvalidSettingError` is raised when the value isn't an integer from 1 to 65535. It's also a `ValueError`, has `.key`, `.value` (the raw string) and `.reason` attributes, and `str(err)` is `port='http': not an integer` or `port='70000': must be between 1 and 65535`. When `int()` fails, chain its `ValueError` as the cause.
- Both exceptions survive `pickle` and `copy.copy()` with their type, attributes and message intact.

The starter is the design a JavaScript habit produces, with the message built in the constructor as in `super(message)`. It fails most of the spec. Fix it.

```text
read_port({"port": "8080"})    ->  8080
read_port({})                  ->  MissingSettingError: missing setting 'port'
read_port({"port": "http"})    ->  InvalidSettingError: port='http': not an integer
```

```js
class SettingsError extends Error {}

class InvalidSettingError extends SettingsError {
  constructor(key, value, reason, options) {
    super(`${key}=${JSON.stringify(value)}: ${reason}`, options);   // options: { cause }
    Object.assign(this, { key, value, reason });
  }
}
```

```python starter
class SettingsError(Exception):
    """Base class for every error the settings loader raises."""


class MissingSettingError(SettingsError):
    def __init__(self, key):
        super().__init__(f"missing setting {key!r}")
        self.key = key


class InvalidSettingError(SettingsError):
    def __init__(self, key, value, reason):
        super().__init__(f"{key}={value!r}: {reason}")
        self.key = key
        self.value = value
        self.reason = reason


def read_port(settings, *, key="port"):
    return int(settings[key])
```

```python solution
class SettingsError(Exception):
    """Base class for every error the settings loader raises."""


class MissingSettingError(SettingsError, KeyError):
    def __init__(self, key):
        super().__init__(key)              # args == (key,), so pickle can rebuild it
        self.key = key

    def __str__(self):                     # KeyError's own __str__ would add quotes
        return f"missing setting {self.key!r}"


class InvalidSettingError(SettingsError, ValueError):
    def __init__(self, key, value, reason):
        super().__init__(key, value, reason)
        self.key = key
        self.value = value
        self.reason = reason

    def __str__(self):
        return f"{self.key}={self.value!r}: {self.reason}"


def read_port(settings, *, key="port"):
    if key not in settings:
        raise MissingSettingError(key)
    raw = settings[key]
    try:
        port = int(raw)
    except ValueError as err:
        raise InvalidSettingError(key, raw, "not an integer") from err
    if not 1 <= port <= 65535:
        raise InvalidSettingError(key, raw, "must be between 1 and 65535")
    return port
```

```python tests
import copy
import pickle

@test("returns the port as an int")
def _():
    eq(read_port({"port": "8080"}), 8080)
    eq(read_port({"admin_port": "9000"}, key="admin_port"), 9000)
    eq(read_port({"port": "1"}), 1)
    eq(read_port({"port": "65535"}), 65535)

@test("the hierarchy: one base, plus the matching built-in")
def _():
    check(issubclass(SettingsError, Exception), "SettingsError should subclass Exception")
    check(issubclass(MissingSettingError, SettingsError) and issubclass(MissingSettingError, KeyError),
          "MissingSettingError should be both a SettingsError and a KeyError")
    check(issubclass(InvalidSettingError, SettingsError) and issubclass(InvalidSettingError, ValueError),
          "InvalidSettingError should be both a SettingsError and a ValueError")

@test("a missing setting can be caught three ways")
def _():
    raises(MissingSettingError, read_port, {})
    raises(SettingsError, read_port, {})
    raises(KeyError, read_port, {})

@test("a missing setting carries its key and a clean message")
def _():
    err = raises(MissingSettingError, read_port, {"host": "db"}, key="admin_port")
    eq(err.key, "admin_port")
    eq(str(err), "missing setting 'admin_port'")

@test("a non-number is invalid, chained from int()'s error")
def _():
    err = raises(InvalidSettingError, read_port, {"port": "http"})
    check(isinstance(err, ValueError) and isinstance(err, SettingsError), "it should be a ValueError and a SettingsError")
    eq((err.key, err.value, err.reason), ("port", "http", "not an integer"))
    eq(str(err), "port='http': not an integer")
    check(type(err.__cause__) is ValueError, "raise ... from the ValueError that int() raised")

@test("an out-of-range port is invalid")
def _():
    for raw in ("0", "70000", "-1"):
        err = raises(InvalidSettingError, read_port, {"port": raw})
        eq(err.reason, "must be between 1 and 65535")
    eq(str(raises(InvalidSettingError, read_port, {"port": "70000"})), "port='70000': must be between 1 and 65535")

@test("the errors survive pickle and copy")
def _():
    for err in (MissingSettingError("port"), InvalidSettingError("port", "http", "not an integer")):
        for clone in (pickle.loads(pickle.dumps(err)), copy.copy(err)):
            eq(type(clone), type(err))
            eq(str(clone), str(err))
            eq(clone.key, err.key)
```

```hint
Add the built-in as a second base class: `class MissingSettingError(SettingsError, KeyError)`. Then `str(err)` starts showing quotes, because `KeyError.__str__` prints its argument's repr. Define your own `__str__`.
```

```hint
Pickling and `copy.copy()` rebuild an exception as `type(err)(*err.args)`. If `__init__` takes `(key, value, reason)`, then `args` must be those three values: pass them to `super().__init__()` and build the message in `__str__` instead.
```

```hint
In `read_port`, wrap only the `int(raw)` call in `try`/`except ValueError as err`, and `raise InvalidSettingError(...) from err`. Check the range after the conversion succeeds.
```
:::
