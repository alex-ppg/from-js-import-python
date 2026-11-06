---
title: Higher-Order Functions & Decorators
part: Functions & Iteration
summary: Functions that wrap functions, the @ syntax that applies them, and the functools and operator toolbox.
minutes: 40
---

Higher-order functions work exactly as they do in JavaScript: functions are values, so you pass them in and return them out. Python adds one piece of syntax on top. `@timed` on the line above a `def` means `f = timed(f)`, and that's the entire mechanism. It has been in the language since Python 2.4 (2004), so unlike TC39 decorators it's everywhere: web routes, caching, CLI commands, test fixtures, properties.

This lesson builds decorators from scratch, then tours the ready-made ones in `functools`, plus `partial` and the `operator` module, which remove most of the little lambdas you'd otherwise write.

## Higher-order functions work like JS

:::compare
```js
function withLogging(fn) {
  return function (...args) {
    console.log(`calling ${fn.name} with`, args);
    return fn(...args);
  };
}

function add(a, b) {
  return a + b;
}

const loggedAdd = withLogging(add);
console.log(loggedAdd(2, 3));
```
```python run
def with_logging(fn):
    def wrapper(*args):
        print(f"calling {fn.__name__} with {args}")
        return fn(*args)

    return wrapper


def add(a, b):
    return a + b


logged_add = with_logging(add)
print(logged_add(2, 3))
```
:::

Same idea, same shape: a function takes a function, defines an inner function that closes over it, and returns the inner one. `*args` plays the part of `...args` ([Functions](lesson:functions#args-kwargs-and-spreading)), and the closure captures `fn` exactly as JS's does. The built-in HOFs (`sorted` and `max` with `key=`, `map`, `filter`) take functions too ([Comprehensions](lesson:map-filter-reduce)). The wrapper-returning shape is the one to remember, because it's every decorator.

## `@decorator` is just `f = decorator(f)`

:::compare
```js
// Plain functions can't be decorated in JS: wrap by hand
const fetchUser = withLogging(function fetchUser(id) {
  return db.users.get(id);
});
```
```python
@with_logging
def fetch_user(user_id):
    return db.users.get(user_id)

# exactly the same as writing, after the def:
# fetch_user = with_logging(fetch_user)
```
:::

The `@` line evaluates the expression after it, calls the result with the freshly defined function, and binds whatever **that returns** to the function's name. Nothing more. The decorator runs **once, when the `def` runs**, which for a module-level function means at import time. Only the wrapper it returns runs on every call.

Because it's ordinary rebinding, a decorator may return anything: a wrapper (the usual case), the original function untouched (registration decorators), or a different kind of object entirely (`@property` returns a descriptor).

:::quiz output
What does this print?

```python
calls = []


def register(fn):
    calls.append(fn.__name__)
    return fn


@register
def setup():
    calls.append("setup ran")


print(calls)
```

- [ ] `[]`
- [x] `['setup']`
- [ ] `['setup', 'setup ran']`
- [ ] `['setup ran']`

Decorating runs `register(setup)` immediately, which records the name. The body of `setup` only runs when something calls it, and nothing did.
:::

## Writing a well-behaved decorator

:::compare
```js
function timed(fn) {
  return function (...args) {
    const start = performance.now();
    const result = fn.apply(this, args);
    const ms = performance.now() - start;
    console.log(`${fn.name} took ${ms.toFixed(1)} ms`);
    return result;
  };
}
```
```python
def timed(fn):
    @functools.wraps(fn)
    def wrapper(*args, **kwargs):
        start = time.perf_counter()
        result = fn(*args, **kwargs)
        ms = (time.perf_counter() - start) * 1000
        print(f"{fn.__name__} took {ms:.1f} ms")
        return result

    return wrapper
```
:::

Three details make this a decorator you'd ship:

1. **`*args, **kwargs`** accepts any signature and forwards it untouched. A JS wrapper gets away with `...args` because JS has no keyword arguments; a Python wrapper that forgets `**kwargs` breaks every keyword call. There's no `this` to forward with `.apply`, either: a method's `self` arrives as the first positional argument, so `*args` carries it along.
2. **`return result`.** Forget it and every decorated function returns `None`.
3. **`@functools.wraps(fn)`** copies the wrapped function's name, qualified name, module, docstring and annotations onto the wrapper, merges its attribute dict, and sets `wrapper.__wrapped__ = fn`. Without it, every decorated function calls itself `wrapper` in tracebacks, logs and `help()`.

```python run
import functools
import time


def timed(fn):
    @functools.wraps(fn)
    def wrapper(*args, **kwargs):
        start = time.perf_counter()
        result = fn(*args, **kwargs)
        ms = (time.perf_counter() - start) * 1000
        print(f"{fn.__name__} took {ms:.1f} ms")
        return result

    return wrapper


@timed
def total(prices, *, discount=0):
    """Sum the prices, minus a discount."""
    return sum(prices) - discount


print(total([10, 20, 30], discount=5))
print(total.__name__, "|", total.__doc__)   # now delete the @functools.wraps line
```

:::gotcha The two missing returns
A decorator has two `return`s and both matter. Drop `return result` and the decorated function always returns `None`. Drop `return wrapper` and the decorator itself returns `None`, so the *name* becomes `None` and the first call fails with `TypeError: 'NoneType' object is not callable`.
:::

:::tip `__wrapped__` and typed decorators
Thanks to `__wrapped__`, `inspect.signature(total)` reports the original signature, and a test can call `total.__wrapped__(...)` to exercise the raw function without the wrapper. To keep the exact signature visible to type checkers, annotate the decorator with a `ParamSpec` ([Type Hints](lesson:type-hints)).
:::

## Stacking decorators

:::compare
```js
// Manual composition: the innermost wrapper is applied first
const handler = withAuth(withLogging(rawHandler));
```
```python
@with_auth          # applied second: the outermost wrapper
@with_logging       # applied first: it wraps the original
def handler(request): ...

# same as: handler = with_auth(with_logging(handler))
```
:::

Decorators apply **bottom-up**: the one nearest the `def` wraps the function first, and each line above wraps the result. At call time the order flips. The outermost wrapper runs first and calls inward, like middleware, so put the decorator that must see every call (authentication, a timer for the whole thing) on top.

:::quiz output
What does this print?

```python
def bold(fn):
    return lambda: f"<b>{fn()}</b>"


def italic(fn):
    return lambda: f"<i>{fn()}</i>"


@bold
@italic
def hello():
    return "hi"


print(hello())
```

- [x] `<b><i>hi</i></b>`
- [ ] `<i><b>hi</b></i>`
- [ ] `<b>hi</b>`
- [ ] `TypeError`

`italic` wraps `hello` first, then `bold` wraps the result. Calling `hello()` enters `bold`'s wrapper, which calls `italic`'s, which calls the original.
:::

## Decorators with arguments

:::compare
```js
function retry({ times = 3 } = {}) {
  return (fn) => (...args) => {
    for (let attempt = 1; ; attempt++) {
      try {
        return fn(...args);
      } catch (err) {
        if (attempt >= times) throw err;
      }
    }
  };
}

const fetchUser = retry({ times: 5 })(rawFetchUser);
```
```python
def retry(times=3):
    def decorator(fn):
        @functools.wraps(fn)
        def wrapper(*args, **kwargs):
            for attempt in range(1, times + 1):
                try:
                    return fn(*args, **kwargs)
                except Exception:
                    if attempt == times:
                        raise

        return wrapper

    return decorator


@retry(times=5)
def fetch_user(user_id): ...
```
:::

`@retry(times=5)` happens in two steps: `retry(times=5)` runs first and returns a decorator, then that decorator is applied to the function. So a decorator that takes arguments is a **decorator factory**, three functions deep. Each layer has one job: the outer one captures the configuration, the middle one captures the function, and the innermost runs on every call. Any expression can follow the `@`, so `@app.route("/users")` and `@handlers[event]` are fine too.

:::gotcha `@retry` is not `@retry()`
With a factory, the parentheses are mandatory even when every argument has a default. Bare `@retry` calls `retry(fetch_user)`, so `times` is the *function* and `fetch_user` becomes the middle `decorator`. Nothing fails at definition time: `fetch_user(42)` quietly returns a wrapper function instead of a user, and the real error surfaces somewhere else entirely. [The last challenge](lesson:decorators#deco-command-registry) builds a decorator that accepts both spellings.
:::

:::pythonic Registration decorators
A decorator doesn't have to wrap anything. Recording the function somewhere and returning it unchanged is how Flask's `@app.route("/")` and the standard library's `@atexit.register` work:

```python run
HANDLERS = {}


def on(event):
    def register(fn):
        HANDLERS[event] = fn
        return fn

    return register


@on("signup")
def send_welcome(user):
    return f"Welcome, {user}!"


print(HANDLERS["signup"]("ada"), send_welcome("bob"))
```
:::

## Classes as decorators, decorators for classes

:::compare
```js
// JS objects can't be called, so state rides on the wrapper function
function countCalls(fn) {
  const wrapper = (...args) => {
    wrapper.calls += 1;
    return fn(...args);
  };
  wrapper.calls = 0;
  return wrapper;
}
```
```python run
import functools


class CountCalls:
    def __init__(self, fn):
        functools.update_wrapper(self, fn)
        self.fn = fn
        self.calls = 0

    def __call__(self, *args, **kwargs):
        self.calls += 1
        return self.fn(*args, **kwargs)


@CountCalls
def ping(host):
    return f"pong from {host}"


ping("a")
ping("b")
print(ping.calls, ping.__name__, type(ping).__name__)
```
:::

Any callable can be a decorator, including a class. `@CountCalls` calls `CountCalls(ping)`, so the name `ping` now refers to an instance, and `__call__` makes that instance callable ([Dunder Methods](lesson:dunder-methods)). State lives in ordinary attributes, and the class can offer extra methods, such as a `reset()`. `functools.update_wrapper(self, fn)` is the non-decorator spelling of `@wraps`. For a counter or two, a function attribute on the wrapper, as on the JS side, works just as well in Python.

:::gotcha Class-based decorators break methods
A function looked up on an instance binds `self` automatically; that's what makes `obj.method()` work. A `CountCalls` instance doesn't, so on a method, `obj.method(x)` calls it without `obj` and fails with a missing-argument `TypeError`. Use function-based decorators for anything that might decorate a method.
:::

:::compare
```ts
function register(target: Function, context: ClassDecoratorContext) {
  exporters.set(String(context.name), target);
}

@register
class CsvExporter {}
```
```python
def register(cls):
    EXPORTERS[cls.__name__] = cls
    return cls


@register
class CsvExporter: ...
```
:::

Decorating a class works the same way: `@register class X` means `X = register(X)`. The decorator receives the class object and returns it, possibly modified, or a replacement. The most famous one is `@dataclass`, which reads the class's annotations and writes `__init__`, `__repr__` and `__eq__` for you ([Dataclasses](lesson:dataclasses-and-enums)). Here's a tiny version of that idea:

```python run
def with_repr(cls):
    def __repr__(self):
        fields = ", ".join(f"{k}={v!r}" for k, v in vars(self).items())
        return f"{cls.__name__}({fields})"

    cls.__repr__ = __repr__         # add a method to the class
    return cls


@with_repr
class Point:
    def __init__(self, x, y):
        self.x, self.y = x, y


print(Point(1, 2))
```

## Decorators from the standard library

### `functools.cache` and `lru_cache`

:::compare
```js
function memoize(fn) {
  const cache = new Map();
  return (n) => {
    if (!cache.has(n)) cache.set(n, fn(n));
    return cache.get(n);
  };
}

const fib = memoize((n) => (n < 2 ? n : fib(n - 1) + fib(n - 2)));
```
```python
from functools import cache


@cache
def fib(n):
    return n if n < 2 else fib(n - 1) + fib(n - 2)
```
:::

`@cache` memoizes on all the arguments, positional and keyword, in an unbounded dict. `@lru_cache(maxsize=256)` is the bounded version that evicts the least recently used entry (a bare `@lru_cache` keeps 128). Both add `cache_info()` and `cache_clear()`. Because the arguments become dict keys, they must be **hashable**: numbers, strings, tuples and frozensets are fine, while a list or dict argument raises `TypeError: unhashable type` before your function even runs.

```python run
from functools import cache, lru_cache


@cache
def fib(n):
    return n if n < 2 else fib(n - 1) + fib(n - 2)


print(fib(90))                # instant: each n is computed once
print(fib.cache_info())


@lru_cache(maxsize=2)
def lookup(sku):
    print(f"  fetching {sku}")
    return sku.lower()


for sku in ["A1", "B2", "A1", "C3", "B2"]:
    lookup(sku)
print(lookup.cache_info())
```

:::tip Don't cache methods with `@cache`
On a method, `@cache` puts `self` into every key and keeps each instance alive as long as the cache lives, which is usually forever. For a per-instance computed value, use `functools.cached_property` ([Classes](lesson:classes)).
:::

### `property`, `staticmethod` and `classmethod`

:::compare
```js
class User {
  get fullName() {
    return `${this.first} ${this.last}`;
  }

  static fromDict(data) {
    return new User(data.first, data.last);
  }
}
```
```python
class User:
    @property
    def full_name(self):
        return f"{self.first} {self.last}"

    @classmethod
    def from_dict(cls, data):
        return cls(data["first"], data["last"])
```
:::

These are decorators too, built into the language. `@property` turns a method into a computed attribute (JS's `get`), `@classmethod` passes the class in as `cls` (the idiom for alternative constructors), and `@staticmethod` passes nothing at all. Each is an ordinary callable that takes the function and returns a descriptor object, so the language needs no special keywords for them. [Classes & Objects](lesson:classes) covers them properly.

### `singledispatch`: overloading by type

:::compare
```js
function describe(value) {
  if (typeof value === "number") return `number ${value}`;
  if (value instanceof Date) return `date ${value.toDateString()}`;
  return `something: ${value}`;
}
```
```python
@singledispatch
def describe(value):
    return f"something: {value!r}"


@describe.register
def _(value: int | float):
    return f"number {value}"
```
:::

A second `def` with the same name replaces the first, so Python has no overloading. `functools.singledispatch` gives you dispatch on the **type of the first argument** instead. Decorate the fallback, then register an implementation per type with `@describe.register`, which reads the type from the parameter's annotation (union annotations need 3.11+), or pass the type explicitly: `@describe.register(date)`. Dispatch follows inheritance, so registering `int` also catches `bool`, and other modules can register their own types without editing yours. For methods, use `functools.singledispatchmethod`.

```python run
from datetime import date
from functools import singledispatch


@singledispatch
def describe(value):
    return f"something: {value!r}"


@describe.register
def _(value: int | float):
    return f"number {value}"


@describe.register(date)
def _(value):
    return f"date {value:%d %b %Y}"


for item in [42, 2.5, date(2024, 6, 1), None, True]:
    print(describe(item))
```

## `partial` and `operator`: fewer lambdas

### `functools.partial` ≈ `bind`

:::compare
```js
function power(base, exponent) {
  return base ** exponent;
}

const square = (x) => power(x, 2);
const powerOfTwo = power.bind(null, 2);

console.log(square(5), powerOfTwo(10));   // 25 1024
```
```python run
from functools import partial


def power(base, exponent):
    return base ** exponent


square = partial(power, exponent=2)
power_of_two = partial(power, 2)

print(square(5), power_of_two(10))
print(square(5, exponent=3))       # keywords can be overridden
print(square.func.__name__, square.args, square.keywords)
```
:::

`partial(fn, *args, **kwargs)` returns a callable with some arguments filled in, like `bind` without the `this` argument. Positional arguments fill from the left, keyword arguments fill any parameter by name, and callers can still override the keywords. The result is introspectable through `.func`, `.args` and `.keywords`. Python 3.14 adds `functools.Placeholder` to leave a positional slot open, so `partial(power, Placeholder, 3)` is a cube function.

:::pythonic `partial` binds now
Unlike a lambda, `partial` evaluates its arguments when you create it. That makes it a clean fix for [late-binding closures in loops](lesson:functions#late-binding-closures-in-loops): `[partial(notify, user) for user in users]` captures each user.
:::

:::quiz output
What does this print?

```python
from functools import partial


def greet(greeting, name, punct="!"):
    return f"{greeting}, {name}{punct}"


hello = partial(greet, "Hello", punct="?")
print(hello("Ada"), hello("Bob", punct="."))
```

- [ ] `Hello, Ada! Hello, Bob!`
- [x] `Hello, Ada? Hello, Bob.`
- [ ] `Hello, Ada? Hello, Bob?`
- [ ] `TypeError`

`"Hello"` fills `greeting`, the call's first argument fills `name`, and a keyword passed at call time overrides the one stored in the partial.
:::

### The `operator` module

:::compare
```js
const product = prices.reduce((a, b) => a * b, 1);
const byPrice = items.toSorted((a, b) => a.price - b.price);
const best = users.reduce((a, b) => (b.score > a.score ? b : a));
```
```python
product = reduce(operator.mul, prices, 1)   # or math.prod(prices)
by_price = sorted(items, key=itemgetter("price"))
best = max(users, key=attrgetter("score"))
```
:::

`operator` has a named function for every operator (`add`, `mul`, `neg`, `contains`, `getitem`, ...), plus three factories that build small accessor functions:

- `itemgetter("price")` is `lambda x: x["price"]`. With several keys, `itemgetter("last", "first")` returns a tuple, ready to be a sort key.
- `attrgetter("name")` is `lambda x: x.name`, and dotted paths work: `attrgetter("address.city")`.
- `methodcaller("replace", "-", "")` is `lambda x: x.replace("-", "")`.

They read as a description of the data rather than as code, and unlike lambdas they can be pickled. Python 3.14 adds `operator.is_none` and `is_not_none` for filters. For a plain transformation, though, a comprehension such as `[s.strip() for s in lines]` is usually clearer than any `map` ([Comprehensions](lesson:map-filter-reduce)).

```python run
from operator import attrgetter, itemgetter, methodcaller
from types import SimpleNamespace

orders = [
    {"id": 3, "customer": "ada", "total": 25},
    {"id": 1, "customer": "linus", "total": 40},
    {"id": 2, "customer": "ada", "total": 15},
]
print([o["id"] for o in sorted(orders, key=itemgetter("customer", "total"))])
print(itemgetter("id", "total")(orders[0]))

user = SimpleNamespace(name="Ada", address=SimpleNamespace(city="London"))
print(attrgetter("address.city")(user))
print(list(map(methodcaller("strip", "-"), ["--a--", "-b-"])))
```

## Compared with TC39 and TypeScript decorators

| | Python | TC39 / TypeScript 5+ |
| --- | --- | --- |
| Status | in the language since 2.4 (2004) | Stage 3 proposal (2022), in TypeScript since 5.0 (2023) |
| What can be decorated | any function, method or class | classes and class members only |
| What the decorator receives | the function or class itself | the value plus a `context` object (`kind`, `name`, `addInitializer`, ...) |
| What it returns | anything; it's bound to the name | a replacement (method, class, field initializer) or `undefined` |
| Arguments | a factory: `@retry(times=3)` | a factory: `@retry({ times: 3 })` |
| Application order | bottom-up | bottom-up |
| Parameter decorators | none | only in legacy `experimentalDecorators` |

If you've used Angular or NestJS, you've used TypeScript's legacy `experimentalDecorators`, whose `(target, key, descriptor)` signature differs again. Python's model is the simplest of the three: a decorator is any callable, applied once at definition time, and its return value replaces the name.

## Cheat sheet

| JavaScript | Python | Notes |
| --- | --- | --- |
| `const g = wrap(f)` | `@wrap` above `def f` | `f = wrap(f)` |
| `(...args) => fn(...args)` | `def wrapper(*args, **kwargs)` | forward both |
| copying `fn.name` by hand | `@functools.wraps(fn)` | also sets `__wrapped__` |
| `retry({ times: 3 })(fn)` | `@retry(times=3)` | a decorator factory |
| `a(b(f))` | `@a` above `@b` | applied bottom-up |
| state on the wrapper function | a class with `__call__` | not for methods |
| `@register class X {}` (TS) | `@register` above `class X:` | `X = register(X)` |
| hand-rolled memo `Map` | `@functools.cache` | arguments must be hashable |
| an LRU cache library | `@functools.lru_cache(maxsize=n)` | `cache_info()`, `cache_clear()` |
| `get x()` / `static m()` | `@property` / `@staticmethod` / `@classmethod` | |
| `typeof` / `instanceof` chain | `@functools.singledispatch` | dispatch on the first argument |
| `fn.bind(null, a)` | `functools.partial(fn, a)` | binds keywords too |
| `(a, b) => a * b` | `operator.mul` | one per operator |
| `(o) => o.price` / `(o) => o["price"]` | `attrgetter("price")` / `itemgetter("price")` | several names → tuple |
| `(s) => s.trim()` | `methodcaller("strip")` | |

## Challenges

:::challenge id=deco-log-calls title="Log every call" difficulty=easy
Write a decorator `log_calls` that prints one line per call, `name(arguments) -> result`, and returns the result unchanged. Show arguments with `repr()`, positional ones first, then keyword ones as `key=value`:

```text
add(2, 3) -> 5
greet('Ada', punct='?') -> 'Hello, Ada?'
```

Use `functools.wraps`, so the decorated function keeps its name and docstring.

```js
function logCalls(fn) {
  return function (...args) {
    const result = fn(...args);
    const shown = args.map((a) => JSON.stringify(a)).join(", ");
    console.log(`${fn.name}(${shown}) -> ${JSON.stringify(result)}`);
    return result;
  };
}
```

```python starter
import functools


def log_calls(fn):
    ...
```

```python solution
import functools


def log_calls(fn):
    @functools.wraps(fn)
    def wrapper(*args, **kwargs):
        parts = [repr(arg) for arg in args]
        parts += [f"{key}={value!r}" for key, value in kwargs.items()]
        result = fn(*args, **kwargs)
        print(f"{fn.__name__}({', '.join(parts)}) -> {result!r}")
        return result

    return wrapper
```

```python tests
def add(a, b):
    """Add two numbers."""
    return a + b


def greet(name, punct="!"):
    return f"Hello, {name}{punct}"


@test("returns the original result")
def _():
    eq(log_calls(add)(2, 3), 5)

@test("prints name(args) -> result")
def _():
    eq(output_of(log_calls(add), 2, 3), "add(2, 3) -> 5\n")

@test("shows keyword arguments as key=value, using repr()")
def _():
    eq(output_of(log_calls(greet), "Ada", punct="?"), "greet('Ada', punct='?') -> 'Hello, Ada?'\n")

@test("works with no arguments")
def _():
    def ping():
        return None

    eq(output_of(log_calls(ping)), "ping() -> None\n")

@test("keeps the name and docstring")
def _():
    logged = log_calls(add)
    eq(logged.__name__, "add")
    eq(logged.__doc__, "Add two numbers.")
```

```hint
Inside the wrapper, build a list of `repr(arg)` for the positional arguments, then `f"{key}={value!r}"` for each keyword argument, and join them with `", "`.
```

```hint
Call the original with `fn(*args, **kwargs)`, print the line, then return the result. Put `@functools.wraps(fn)` on the wrapper.
```
:::

:::challenge id=deco-memoize-key title="lodash's memoize" difficulty=medium
Write a decorator factory `memoize(key=None)`, Python's take on lodash's `_.memoize(fn, resolver)`:

- The decorated function runs once per distinct cache key. Later calls with the same key return the stored result, even when that result is falsy.
- With `key=None`, the cache key is built from all the arguments, positional and keyword.
- With a `key` function, the cache key is `key(*args, **kwargs)`. That's how you memoize a function whose arguments are unhashable, like dicts.
- The decorated function gets a `cache_clear()` method, and keeps its name and docstring.

```python
@memoize(key=lambda user: user["id"])
def load_profile(user): ...
```

```js
const loadProfile = _.memoize((user) => fetchProfile(user.id), (user) => user.id);
```

```python starter
import functools


def memoize(key=None):
    ...
```

```python solution
import functools


def memoize(key=None):
    def decorator(fn):
        cache = {}

        @functools.wraps(fn)
        def wrapper(*args, **kwargs):
            if key is None:
                cache_key = (args, tuple(sorted(kwargs.items())))
            else:
                cache_key = key(*args, **kwargs)
            if cache_key not in cache:
                cache[cache_key] = fn(*args, **kwargs)
            return cache[cache_key]

        wrapper.cache_clear = cache.clear
        return wrapper

    return decorator
```

```python tests
def recorder(fn):
    """Wrap fn so a test can count how often the real body ran."""
    calls = []

    def body(*args, **kwargs):
        calls.append(args)
        return fn(*args, **kwargs)

    return body, calls


@test("runs once per distinct argument")
def _():
    square, calls = recorder(lambda n: n * n)
    cached = memoize()(square)
    eq([cached(3), cached(3), cached(4)], [9, 9, 16])
    eq(len(calls), 2, "square(3) should only run once")

@test("keyword arguments are part of the default key")
def _():
    price, calls = recorder(lambda amount, currency="USD": f"{amount} {currency}")
    cached = memoize()(price)
    eq([cached(5, currency="EUR"), cached(5), cached(5, currency="EUR")], ["5 EUR", "5 USD", "5 EUR"])
    eq(len(calls), 2)

@test("a key function decides what counts as the same call")
def _():
    load, calls = recorder(lambda user: f"profile {user['id']}")
    cached = memoize(key=lambda user: user["id"])(load)
    eq(cached({"id": 1, "name": "Ada"}), "profile 1")
    eq(cached({"id": 1, "name": "Ada L."}), "profile 1")
    eq(len(calls), 1, "dicts aren't hashable, but their ids are")

@test("falsy results are cached too")
def _():
    find, calls = recorder(lambda name: None)
    cached = memoize()(find)
    cached("x")
    cached("x")
    eq(len(calls), 1, "None is still a cached result: test `in`, not truthiness")

@test("cache_clear() forgets everything")
def _():
    double, calls = recorder(lambda n: n * 2)
    cached = memoize()(double)
    cached(1)
    cached.cache_clear()
    cached(1)
    eq(len(calls), 2, "after cache_clear() the body should run again")

@test("works as @memoize() and keeps the name and docstring")
def _():
    @memoize()
    def area(w, h):
        """Rectangle area."""
        return w * h

    eq(area(2, 3), 6)
    eq((area.__name__, area.__doc__), ("area", "Rectangle area."))
```

```hint
Same three layers as `retry`: `memoize(key)` returns `decorator`, and `decorator(fn)` creates the cache dict and returns `wrapper`, so each decorated function gets its own cache.
```

```hint
Build the default key from hashable pieces: `(args, tuple(sorted(kwargs.items())))`.
```

```hint
Check `if cache_key not in cache:` so `None` and other falsy results still count as cached. `wrapper.cache_clear = cache.clear` attaches the method.
```
:::

:::challenge id=deco-command-registry title="With or without parentheses" difficulty=hard
Write a decorator `command` that registers functions in the `COMMANDS` dict and works in all three spellings:

```python
@command                     # registered as "greet"
def greet(name): ...

@command(name="ls")          # registered as "ls"
def list_files(): ...

@command()                   # parentheses, no arguments: registered as "status"
def status(): ...
```

`name` is always passed by keyword and defaults to the function's `__name__`. The decorator must return the original function unchanged, not a wrapper. Registering a second command under a name that's already taken raises `ValueError`.

The starter handles the bare form only. Extend it.

```python starter
COMMANDS = {}


def command(fn):
    COMMANDS[fn.__name__] = fn
    return fn
```

```python solution
COMMANDS = {}


def command(fn=None, *, name=None):
    def register(func):
        key = name or func.__name__
        if key in COMMANDS:
            raise ValueError(f"command {key!r} is already registered")
        COMMANDS[key] = func
        return func

    if fn is None:          # called with arguments: @command(...) or @command()
        return register
    return register(fn)     # used bare: @command
```

```python tests
def greet(name):
    return f"hi {name}"


def deploy():
    return "deployed"


@test("bare @command registers the function under its own name")
def _():
    COMMANDS.clear()
    check(command(greet) is greet, "return the function itself, not a wrapper")
    check(COMMANDS.get("greet") is greet, "COMMANDS['greet'] should be the function")

@test("@command(name=...) registers under the given name")
def _():
    COMMANDS.clear()
    check(command(name="ship")(deploy) is deploy, "return the function itself, not a wrapper")
    eq(list(COMMANDS), ["ship"])

@test("@command() with empty parentheses uses the function's name")
def _():
    COMMANDS.clear()
    command()(deploy)
    eq(list(COMMANDS), ["deploy"])

@test("all three spellings work with the @ syntax")
def _():
    COMMANDS.clear()

    @command
    def status():
        return "ok"

    @command(name="ls")
    def list_files():
        return []

    @command()
    def whoami():
        return "ada"

    eq(sorted(COMMANDS), ["ls", "status", "whoami"])
    eq((status(), list_files(), whoami()), ("ok", [], "ada"))

@test("a duplicate name raises ValueError")
def _():
    COMMANDS.clear()
    command(name="dup")(greet)
    raises(ValueError, command(name="dup"), deploy)
```

```hint
`@command` calls `command(greet)`. `@command(name="ls")` calls `command(name="ls")` first, and whatever *that* returns is then applied to the function.
```

```hint
Make the function optional: `def command(fn=None, *, name=None)`. If `fn` is `None`, you were called with arguments, so return a decorator.
```

```hint
Put the registration logic in an inner `register(func)`, then either return it (factory form) or call it right away (bare form).
```
:::
