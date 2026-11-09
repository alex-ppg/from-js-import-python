---
title: Functional Programming in Python
part: Functions & Generators
summary: Closures down to the cell, functools and operator in depth, composition, currying and immutability vs Ramda.
minutes: 45
---

Ramda and lodash/fp make JavaScript feel like a functional language: everything curried, data last, `pipe` everywhere. Python never went that far. It has no auto-currying, no pipe operator, no persistent collections and no tail calls, and in 2005 Guido van Rossum proposed dropping `lambda`, `map`, `filter` and `reduce` altogether (only `reduce` actually moved, into `functools`). What Python offers instead is a small, sharp toolkit: functions you can open up and inspect, `functools` and `operator` for the jobs that keep recurring, and immutable types that double as dict keys.

The mental shift: in Python, functional programming is a set of tools you reach for at specific seams (key functions, dispatch tables, caches, callbacks), not a style for the whole program. Comprehensions and generators cover the rest. The core course introduced [`partial`, `operator` and `@cache`](lesson:decorators). This lesson opens each of them up, and you'll build small versions of several.

## Closures under the hood: cells

:::compare
```js
function makeCounter() {
  let count = 0;

  function increment() {
    count += 1;
    return count;
  }

  function peek() {
    return count;
  }

  return [increment, peek];
}

const [increment, peek] = makeCounter();
increment();
increment();
console.log(peek());   // 2: both share one binding
// and JS has no API to look inside a closure
```
```python run
def make_counter():
    count = 0

    def increment():
        nonlocal count
        count += 1
        return count

    def peek():
        return count

    return increment, peek


increment, peek = make_counter()
increment()
increment()
print(peek())                                     # 2: both share one cell
print(increment.__code__.co_freevars, increment.__closure__)
print(increment.__closure__[0] is peek.__closure__[0])
```
:::

The semantics match JavaScript's ([Functions](lesson:functions#closures-and-nonlocal) has the basics). The difference is that Python lets you look. When the compiler sees an inner function use a variable of its enclosing function, it stores that variable in a **cell**: a tiny box shared by the outer function and every inner function that uses it. The outer function's code object lists those names in `co_cellvars`, each inner function's in `co_freevars`, and the function object carries the boxes themselves in `__closure__`, a tuple of `cell` objects in the same order (or `None` for a function that closes over nothing). Reading `count` in `peek` reads the box, and `nonlocal count` makes `count += 1` write to it.

Late binding falls straight out of this. A closure holds the cell, never a snapshot of the value, and a `for` loop rebinds the same variable on every pass, so every function created in the loop shares one cell. The default-argument fix from [the core lesson](lesson:functions#late-binding-closures-in-loops) works because a default is evaluated once, when the function is created, and stored in its `__defaults__` tuple. There's no cell at all:

```python run
def make_handlers():
    handlers = []
    for i in range(3):
        handlers.append(lambda: i)
    return handlers


handlers = make_handlers()
print([h() for h in handlers])                                    # [2, 2, 2]
print(handlers[0].__closure__[0] is handlers[2].__closure__[0])   # one cell

fixed = [lambda i=i: i for i in range(3)]
print([f() for f in fixed], fixed[1].__closure__, fixed[1].__defaults__)
```

:::quiz output
What does this print?

```python
def make_pricer(rate, currency):
    label = currency.upper()

    def price(amount):
        return f"{amount * rate:.2f} {label}"

    return price


print(make_pricer(1.2, "eur").__code__.co_freevars)
```

- [x] `('label', 'rate')`
- [ ] `('currency', 'label', 'rate')`
- [ ] `('amount', 'label', 'rate')`
- [ ] `()`

Only the names the inner function actually uses become free variables, so `currency` gets no cell and `price` doesn't keep it alive. The inner function's own parameter, `amount`, is an ordinary local. CPython lists free variables in alphabetical order.
:::

:::deep Cells are real objects
`cell_contents` is writable, so assigning to it changes the variable for every closure sharing that cell, and `types.CellType(value)` creates a cell from scratch. `inspect.getclosurevars(fn)` summarises what a function depends on: its nonlocals, the globals and builtins it names, and the names it couldn't resolve. Debuggers and hot-reloaders use these hooks; application code shouldn't.

A cell can also be empty. Call an inner function before the enclosing function has assigned the variable and you get `NameError: cannot access free variable 'x' where it is not associated with a value in enclosing scope`, Python's version of the temporal dead zone.
:::

## Partial application and currying

:::compare
```js
import * as R from "ramda";

const greet = R.curry((greeting, name, punct) => `${greeting}, ${name}${punct}`);

const hello = greet("Hello");             // fill from the left
const toAda = greet(R.__, "Ada", "!");    // R.__ leaves a slot open

hello("Ada", "?");                        // "Hello, Ada?"
toAda("Hi");                              // "Hi, Ada!"
```
```python
from functools import Placeholder, partial

def greet(greeting, name, punct):
    return f"{greeting}, {name}{punct}"

hello = partial(greet, "Hello")                    # fill from the left
to_ada = partial(greet, Placeholder, "Ada", "!")   # 3.14+: an open slot

hello("Ada", "?")                                  # 'Hello, Ada?'
to_ada("Hi")                                       # 'Hi, Ada!'
```
:::

A `partial` object stores three things, `func`, `args` and `keywords`, and calling it runs `func(*args, *call_args, **(keywords | call_keywords))`, so keywords given at call time win ([the basics](lesson:decorators#functools-partial-bind) are in the core course). Wrapping a partial in another partial doesn't stack two layers: the constructor flattens them into one. Python 3.14 added `functools.Placeholder`, the counterpart of Ramda's `R.__`. It reserves a positional slot that the next call fills, left to right. It can't be passed as a keyword or be the last positional argument (`partial(f, 1, Placeholder)` raises `TypeError`), and a call with too few arguments to fill every slot raises `TypeError` too.

The whole mechanism fits in five lines. The `/` makes `func` positional-only, so a keyword argument that happens to be called `func` still reaches the wrapped function:

```python run
from functools import partial


def power(base, exponent):
    return base ** exponent


nested = partial(partial(power, 3), exponent=4)
print(nested.func.__name__, nested.args, nested.keywords, nested())   # flattened


class Partial:
    def __init__(self, func, /, *args, **keywords):
        self.func, self.args, self.keywords = func, args, keywords

    def __call__(self, /, *args, **keywords):
        return self.func(*self.args, *args, **(self.keywords | keywords))


cube = Partial(power, exponent=3)
print(cube(2), cube(2, exponent=5))
```

:::gotcha A `partial` stored on a class binds `self` in the wrong place
Functions turn into bound methods when you look them up on an instance ([Descriptors](lesson:descriptors) shows how). Since **3.14**, `partial` objects do too, but the instance lands *after* the arguments the partial already holds. Before 3.14 they didn't bind at all, and 3.13 warns that the change is coming. Either way, `sms = partial(send, "sms")` in a class body doesn't do what it looks like. Use `functools.partialmethod`, which puts `self` first, or wrap the partial in `staticmethod()` to keep the old, non-binding behaviour.
:::

```python run
from functools import partial, partialmethod


class Notifier:
    def __repr__(self):
        return "Notifier()"

    def send(self, channel, message):
        return f"[{channel}] {message} (self={self!r})"

    email = partialmethod(send, "email")     # self first, then "email"
    sms = partial(send, "sms")               # 3.14: "sms" first, then self!


notifier = Notifier()
print(notifier.email("hello"))
print(notifier.sms("hello"))
```

### Currying needs a signature

:::compare
```js
const add3 = R.curry((a, b, c) => a + b + c);

add3(1)(2)(3);                 // 6
add3(1, 2)(3);                 // 6
((a, b = 0) => {}).length;     // 1: R.curry reads fn.length
```
```python
add3 = curry(lambda a, b, c: a + b + c)    # no curry() in the stdlib

add3(1)(2)(3)                  # 6
add3(1, 2)(3)                  # 6
inspect.signature(lambda a, b=0: None)     # <Signature (a, b=0)>
```
:::

Ramda can curry any function because JavaScript reports its arity: `fn.length` counts the parameters before the first default. Python's richer counterpart is `inspect.signature(fn)`, which describes every parameter: its name, its default, and its **kind** (positional-only, positional-or-keyword, `*args`, keyword-only or `**kwargs`). The standard library doesn't ship a `curry`, and idiomatic Python rarely wants one. Keyword arguments and `partial` cover the same ground with better errors: a curried function called with too few arguments hands back another function instead of raising. When you do want currying, the signature tells you everything you need, and [the second challenge](#fp-curry) builds it.

```python run
import inspect


def send(to, subject, body="", *attachments, urgent=False, **headers):
    ...


for name, param in inspect.signature(send).parameters.items():
    variadic = param.kind in (param.VAR_POSITIONAL, param.VAR_KEYWORD)
    required = param.default is param.empty and not variadic
    print(f"{name:12} {param.kind.name:22} required={required}")
```

## Composition and pipelines

:::compare
```js
import { pipe } from "ramda";       // lodash/fp: flow

const slugify = pipe(
  (s) => s.trim(),
  (s) => s.toLowerCase(),
  (s) => s.replaceAll(" ", "-"),
);

slugify("  Hello World ");          // "hello-world"
```
```python
def pipe(*fns):
    return lambda value: reduce(lambda acc, fn: fn(acc), fns, value)

slugify = pipe(
    str.strip,
    str.lower,
    methodcaller("replace", " ", "-"),
)

slugify("  Hello World ")           # 'hello-world'
```
:::

Python has no `|>` (JavaScript's pipeline proposal hasn't landed either) and no `compose` in the standard library, but [`reduce`](lesson:map-filter-reduce#when-reduce-is-the-right-tool) writes one in a line: it threads the value through the functions, each result feeding the next. `compose` is the same pipeline with the functions reversed.

Two Python features make point-free code pleasant. **Unbound methods are functions**: `str.strip` is `(s) => s.trim()`, already written, and `methodcaller` covers methods that need arguments. And the classic higher-order builtins take the function first and the data last, Ramda-style, so `partial(map, str.upper)` is `R.map(R.toUpper)`.

```python run
from functools import partial, reduce
from operator import methodcaller


def pipe(*fns):
    return lambda value: reduce(lambda acc, fn: fn(acc), fns, value)


def compose(*fns):
    return pipe(*reversed(fns))


slugify = pipe(str.strip, str.lower, methodcaller("replace", " ", "-"))
print([slugify(title) for title in ["  Intro ", "Deep Dive"]])

title_case = pipe(str.split, partial(map, str.capitalize), " ".join)
print(title_case("the quick brown fox"))
print(compose(len, str.strip)("  padded  "))
```

:::pythonic Prefer a named function to a clever pipeline
`def slugify(title): return title.strip().lower().replace(" ", "-")` is shorter than the pipeline above and gives a better traceback. Composition earns its keep when the steps are *data*: transformations listed in configuration, or contributed by plugins. For pipelines over sequences, generator stages beat composed functions, as [Iterators & Generators](lesson:iterators-and-generators#lazy-pipelines-and-the-es2025-iterator-helpers) shows.
:::

:::deep A `|` pipe operator in five lines
Operator overloading can fake `|>`. When the left operand doesn't know how to `|` with the right one, Python asks the right operand's `__ror__`:

```python run
class Pipe:
    def __init__(self, fn, *args, **kwargs):
        self.fn, self.args, self.kwargs = fn, args, kwargs

    def __ror__(self, value):
        return self.fn(value, *self.args, **self.kwargs)


print("  Hello World " | Pipe(str.strip) | Pipe(str.lower) | Pipe(str.split, "o"))
print([3, 1, 2] | Pipe(sorted, reverse=True) | Pipe(sum))
```

It's a fun trick, but it breaks on any left operand whose `__or__` accepts arbitrary objects, and your reviewers won't expect it. Keep it out of production code.
:::

## The `operator` module as a function library

:::compare
```js
R.add(2, 3);                         // 5
R.prop("name")(user);                // user.name
R.props(["id", "name"])(user);       // [user.id, user.name]
R.path(["address", "city"])(user);   // user.address.city
R.invoker(1, "split")(",")(csv);     // csv.split(",")
R.includes("ada", names);            // names.includes("ada")
```
```python
operator.add(2, 3)                   # 5
itemgetter("name")(user)             # user["name"]
itemgetter("id", "name")(user)       # (user["id"], user["name"])
attrgetter("address.city")(account)  # account.address.city
methodcaller("split", ",")(csv)      # csv.split(",")
operator.contains(names, "ada")      # "ada" in names
```
:::

`operator` has a function for every operator in the language. They're written in C, so they're faster than the equivalent lambdas, and they pickle and print usefully (`operator.itemgetter('name')` rather than `<lambda>`). The core course covered [the three getter factories](lesson:decorators#the-operator-module). These are the plain functions worth knowing:

| Expression | `operator` function | Notes |
| --- | --- | --- |
| `a + b`, `a * b`, `a // b`, `a ** b` | `add`, `mul`, `floordiv`, `pow` | and `sub`, `truediv`, `mod` |
| `-a`, `not a`, `bool(a)` | `neg`, `not_`, `truth` | a trailing `_` where the name is a keyword |
| `a == b`, `a < b` | `eq`, `lt` | and `ne`, `le`, `gt`, `ge` |
| `a & b`, `a \| b`, `a ^ b` | `and_`, `or_`, `xor` | bitwise, and set and dict operators: not boolean `and`/`or` |
| `b in a` | `contains(a, b)` | the container comes **first** |
| `a[b]`, `a[b] = c`, `del a[b]` | `getitem`, `setitem`, `delitem` | |
| `a is b`, `a is None` | `is_`, `is_none` | `is_none` and `is_not_none` are 3.14+ |
| `f(*args, **kwargs)` | `call(f, *args, **kwargs)` | 3.11+ |
| `a += b` | `iadd(a, b)` | returns the result, mutating `a` if it's mutable |

The boolean `and` and `or` have no function versions, because they short-circuit and a function receives its arguments already evaluated. Their non-short-circuiting cousins `and_` and `or_` are more useful than they look: folded with `reduce`, they merge dicts and intersect sets.

```python run
import operator
from functools import reduce
from operator import itemgetter

defaults = {"theme": "light", "lang": "en"}
team = {"theme": "dark"}
user = {"lang": "fr"}
print(reduce(operator.or_, [defaults, team, user]))          # dict merge, last wins
print(reduce(operator.and_, [{1, 2, 3}, {2, 3}, {3, 4}]))     # set intersection

row = {"id": 7, "name": "Ada", "role": "admin"}
for fields in (["id", "name"], ["name"]):
    print(itemgetter(*fields)(row))                          # a tuple, then a scalar!

print(list(filter(operator.is_not_none, [0, None, "", 7])))   # 3.14+
```

:::gotcha `itemgetter` returns a tuple only for two or more keys
`itemgetter("id", "name")` returns a tuple, but `itemgetter("id")` returns the bare value. Build one from a configurable list, `itemgetter(*fields)`, and your code works until someone configures a single field, when every row suddenly becomes a scalar instead of a 1-tuple. When the number of keys varies, write `lambda row: tuple(row[f] for f in fields)`.
:::

## `singledispatch` in depth

:::compare
```js
// Extending behaviour for types you don't own:
// patch a prototype, or key a Map by constructor
const serializers = new Map([
  [Date, (d) => d.toISOString()],
  [Set, (s) => [...s]],
]);

function toJSONValue(value) {
  const serialize = serializers.get(value?.constructor);
  return serialize ? serialize(value) : value;   // subclasses miss
}
```
```python
@singledispatch
def to_json_value(value):
    return value                    # the fallback, registered for object


@to_json_value.register
def _(value: datetime):
    return value.isoformat()


@to_json_value.register
def _(value: set | frozenset):
    return sorted(value)            # subclasses use the nearest base
```
:::

`@singledispatch` turns a function into a **generic function**: the decorated body becomes the fallback, registered for `object`, and each `register` adds an implementation for a class ([the basics](lesson:decorators#singledispatch-overloading-by-type)). On each call it takes the class of the first argument and walks its MRO to the nearest class that has an implementation, so a subclass of `datetime` gets the `datetime` version, and `bool` gets `int`'s unless you register `bool` too. Abstract base classes count: register `collections.abc.Mapping` and you've covered `dict`, `OrderedDict`, `MappingProxyType` and every class registered as a mapping. The result of each lookup is cached per class, and `register` clears the cache, so implementations can be added at any time, from any module, for types neither module owns. That's open extension without patching prototypes.

`register(cls, func)` also works as a plain call, handy for one-liners. `.registry` is a read-only view of every registration, and `.dispatch(cls)` tells you which implementation a class would get:

```python run
from collections.abc import Mapping, Sequence
from functools import singledispatch


@singledispatch
def to_json(value):
    raise TypeError(f"can't serialise {type(value).__name__}")


to_json.register(bool, lambda v: "true" if v else "false")   # else True -> int's str()
to_json.register(int, str)
to_json.register(str, lambda v: f'"{v}"')
to_json.register(Sequence, lambda v: "[" + ", ".join(map(to_json, v)) + "]")
to_json.register(
    Mapping, lambda v: "{" + ", ".join(f"{to_json(k)}: {to_json(x)}" for k, x in v.items()) + "}"
)

print(to_json({"ids": (1, 2), "admin": True, "tags": ["x"]}))
print(to_json.dispatch(tuple) is to_json.registry[Sequence])
print(type(to_json.registry).__name__, len(to_json.registry))
```

:::gotcha `str` is a `Sequence`
Register `collections.abc.Sequence` without registering `str`, and strings dispatch to the sequence implementation. That iterates a string into one-character strings, each of which is a sequence of itself, and you recurse until `RecursionError`. `bytes` springs the same trap. Register the concrete types alongside the ABC: dispatch always prefers the class nearest the argument's own.
:::

:::quiz output
What does this print?

```python
from functools import singledispatch


@singledispatch
def label(value):
    return "other"


@label.register
def _(value: int):
    return "int"


@label.register
def _(value: str):
    return "str"


print(label(True), label(3.0), label("3"))
```

- [ ] `other other str`
- [x] `int other str`
- [ ] `int int str`
- [ ] `TypeError`

`bool` is a subclass of `int`, so `True` finds the `int` implementation on its MRO. `float` isn't related to `int` at all, so `3.0` falls back to `object`.
:::

On a method, plain `singledispatch` would dispatch on `self`, which is always the same class. `functools.singledispatchmethod` dispatches on the first argument *after* `self` (or `cls`), and it can wrap a `@classmethod`:

```python run
from functools import singledispatchmethod


class Formatter:
    def __init__(self, places):
        self.places = places

    @singledispatchmethod
    def format(self, value):
        return str(value)

    @format.register
    def _(self, value: float):
        return f"{value:.{self.places}f}"

    @format.register
    def _(self, value: list):
        return ", ".join(self.format(item) for item in value)


print(Formatter(places=2).format([1, 2.5, "n/a"]))
```

[The last challenge](#fp-type-dispatch) builds `singledispatch` from scratch.

## Caching and its pitfalls

:::compare
```js
const area = _.memoize((w, h) => w * h);

area(2, 3);    // 6
area(2, 10);   // 6 (!): the key is the first argument only
```
```python
@cache
def area(w, h):
    return w * h

area(2, 3)     # 6
area(2, 10)    # 20: the key is every argument
```
:::

lodash's `memoize` keys on the first argument unless you pass a resolver, and Ramda's `memoizeWith` makes you write the key function. `functools.cache` and `lru_cache` build the key from **all** the arguments, positional and keyword, exactly as they were passed, and look it up in a dict ([the basics](lesson:decorators#functools-cache-and-lru-cache): hashable arguments, `cache_info()`, eviction). Building the key from the call rather than from the parameters has consequences:

- **The spelling is part of the key.** `area(2, 3)`, `area(2, h=3)`, `area(w=2, h=3)` and `area(h=3, w=2)` are four separate entries, each computed once.
- **Equal values usually share an entry.** It's a dict lookup, and `2`, `2.0` and `True` are equal with equal hashes, so `area(2.0, 3)` is a *hit* that returns the `int` stored by `area(2, 3)`. The docs only promise "usually": to save space, CPython stores a lone `int` or `str` argument without its tuple, so `f(1)` and `f(1.0)` do get separate entries. When the type matters, pass `typed=True`.
- **Results are shared, not copied.** Every caller receives the same object, so mutating a cached list changes the answer for everyone after you.
- **Unhashable arguments fail before your code runs.** A list or dict argument raises `TypeError: unhashable type: 'list'`. Convert at the boundary (`tuple(ids)`), or memoize with a key function of your own, as in [the core challenge](lesson:decorators#deco-memoize-key).
- **Hashable doesn't mean immutable.** A class without `__eq__` hashes by identity, so mutating an instance doesn't change its key, and the cache keeps serving the old answer.

```python run
from functools import lru_cache


@lru_cache(maxsize=None)
def area(w, h=1):
    print(f"  computing {w} x {h}")
    return w * h


area(2, 3), area(2, h=3), area(w=2, h=3), area(h=3, w=2)
print(area.cache_info())        # four spellings, four entries
print(area(2.0, 3))             # a hit: the int 6, not 6.0
print(area.cache_parameters())
```

```python run
from functools import cache


@cache
def default_roles(plan):
    return ["viewer"] if plan == "free" else ["viewer", "editor"]


roles = default_roles("free")
roles.append("admin")                # mutates the cached list
print(default_roles("free"))         # every later caller sees 'admin'


class Cart:
    def __init__(self):
        self.items = []


@cache
def item_count(cart):
    return len(cart.items)


cart = Cart()
print(item_count(cart))
cart.items.append("tea")
print(item_count(cart))              # stale: same object, same key
```

:::gotcha Return immutable values from cached functions
A cached function should return tuples, frozensets, strings, numbers or frozen dataclasses. If it has to build something mutable, keep the cached function private and have the public one return a copy, or callers will eventually corrupt the cache for each other. And `__wrapped__` reaches the uncached original, which is handy in tests.
:::

:::quiz output
What does this print?

```python
from functools import cache

calls = 0


@cache
def area(w, h):
    global calls
    calls += 1
    return w * h


area(2, 3)
area(2, h=3)
area(w=2, h=3)
area(2, 3)
print(calls)
```

- [ ] `1`
- [ ] `2`
- [x] `3`
- [ ] `4`

The key is built from the call, so `area(2, 3)`, `area(2, h=3)` and `area(w=2, h=3)` are three different keys and the body runs three times. Only the repeated `area(2, 3)` is a hit. The docs say distinct spellings *may* get separate entries, so don't depend on either outcome: call a cached function one consistent way, or cache a private helper and give the public function the flexible signature.
:::

:::tip Deep recursion through `@cache`
Every call to a cached function passes through the cache's C wrapper, so cached recursion uses native stack on every level. In the browser, that crashes the interpreter outright, somewhere between 600 and 800 calls deep, instead of raising `RecursionError`. Keep cached recursion to a few hundred levels, and for anything deeper, warm the cache bottom-up (`for n in range(target): fib(n)`) or write the loop.
:::

## `wraps`, `__wrapped__` and honest signatures

:::compare
```js
function logged(fn) {
  const wrapper = (...args) => fn(...args);
  Object.defineProperty(wrapper, "name", { value: fn.name });
  wrapper.original = fn;      // a hand-rolled __wrapped__
  return wrapper;
}
```
```python
def logged(fn):
    @functools.wraps(fn)
    def wrapper(*args, **kwargs):
        return fn(*args, **kwargs)

    return wrapper            # wrapper.__wrapped__ is fn
```
:::

`functools.wraps(fn)` is itself a `partial`: `partial(update_wrapper, wrapped=fn, ...)`. `update_wrapper` copies the attributes listed in `functools.WRAPPER_ASSIGNMENTS`, which in 3.14 are `__module__`, `__name__`, `__qualname__`, `__doc__`, `__annotate__` and `__type_params__` (annotations now travel as the lazy `__annotate__` function). Then it **merges** the wrapped function's `__dict__` into the wrapper's and sets `wrapper.__wrapped__ = fn`. `inspect.unwrap()` follows that chain down to the innermost function, and `inspect.signature()` follows it too, which is why a decorated function still reports its real parameters.

The `__dict__` merge is a one-time copy. An attribute one decorator keeps on its wrapper, a call counter say, shows up on every outer wrapper too, but as a snapshot that goes stale:

```python run
import functools
import inspect


def counted(fn):
    @functools.wraps(fn)
    def wrapper(*args, **kwargs):
        wrapper.calls += 1
        return fn(*args, **kwargs)

    wrapper.calls = 0
    return wrapper


def logged(fn):
    @functools.wraps(fn)
    def wrapper(*args, **kwargs):
        return fn(*args, **kwargs)

    return wrapper


@logged
@counted
def ping():
    return "pong"


ping(), ping()
print(ping.calls, ping.__wrapped__.calls)        # 0 2: the outer copy is stale
print(inspect.unwrap(ping) is ping.__wrapped__.__wrapped__)
```

:::gotcha `wraps` makes `inspect.signature` report the *wrapped* function's parameters
That's right for a pass-through wrapper and wrong for one that injects or removes arguments. pytest fixtures, FastAPI, typer and click all read `inspect.signature`, so they'd see parameters callers can't actually pass. Set `wrapper.__signature__` to the truth: `inspect.signature` stops unwrapping at the first function that has one.
:::

```python run
import functools
import inspect


def with_user(fn):
    @functools.wraps(fn)
    def wrapper(*args, **kwargs):
        return fn("ada", *args, **kwargs)        # supplies the first argument

    signature = inspect.signature(fn)
    wrapper.__signature__ = signature.replace(parameters=list(signature.parameters.values())[1:])
    return wrapper


@with_user
def greet(user, greeting="Hello"):
    return f"{greeting}, {user}"


print(greet("Hi"))
print(inspect.signature(greet), inspect.signature(greet.__wrapped__))
```

The same change, described to a type checker, is `Concatenate` from [Advanced Typing](lesson:typing-in-depth).

## Ordering: `total_ordering` and `cmp_to_key`

:::compare
```js
const byCityDescThenName = R.sortWith([
  R.descend(R.prop("city")),
  R.ascend(R.prop("name")),
]);

byCityDescThenName(users);
```
```python
def by_city_desc_then_name(users):
    by_name = sorted(users, key=itemgetter("name"))
    return sorted(by_name, key=itemgetter("city"), reverse=True)


# a string can't be negated, so sort twice
by_city_desc_then_name(users)
```
:::

Negating a key flips one field of a tuple key to descending ([Lists](lesson:lists#sorting-and-reversing)), but only numbers can be negated. For strings, dates and everything else, lean on stability. Python's sort is stable, and `reverse=True` keeps it stable, so sort by the *least* significant field first and the most significant last: each pass leaves ties in the order the previous pass produced. The extra passes are cheap, because the sort is adaptive and fast on partly ordered input.

`cmp_to_key` is for comparisons that won't reduce to a key: a comparator a caller hands you, or one you're porting from JavaScript verbatim. It works because sorting only ever asks one question, `a < b`. `cmp_to_key(cmp)` returns a callable that wraps each element in an object whose `__lt__` calls `cmp(a, b) < 0`. Here's that idea, complete. (`(a > b) - (a < b)` is the idiom for the `cmp()` builtin that Python 3 removed.)

```python run
def cmp_to_key(cmp):
    class Key:
        __slots__ = ("obj",)

        def __init__(self, obj):
            self.obj = obj

        def __lt__(self, other):                 # sorted() only ever calls <
            return cmp(self.obj, other.obj) < 0

    return Key


def by_length_then_alpha(a, b):                  # a JS comparator, ported as-is
    return (len(a) - len(b)) or (a > b) - (a < b)


print(sorted(["pear", "fig", "apple", "kiwi"], key=cmp_to_key(by_length_then_alpha)))
```

`@total_ordering` ([Dunder Methods](lesson:dunder-methods#ordering-with-total-ordering)) goes the other way: from `__eq__` plus one ordering method, it writes the other three. Each generated method is a small Python function that calls yours (`a <= b` becomes `a < b or a == b`) and passes `NotImplemented` through, so mixed-type comparisons still raise `TypeError`. The price is an extra call on every *derived* comparison, which the docs flag as slower. If the method you wrote is `__lt__`, sorting isn't affected, since sorts only call `__lt__`.

:::quiz output
What does this print?

```python
from functools import total_ordering


@total_ordering
class Price:
    def __init__(self, cents):
        self.cents = cents

    def __eq__(self, other):
        return self.cents == other.cents

    def __lt__(self, other):
        return self.cents < other.cents


print(sorted(name for name in vars(Price) if name in {"__le__", "__gt__", "__ge__", "__ne__"}))
```

- [x] `['__ge__', '__gt__', '__le__']`
- [ ] `['__ge__', '__gt__', '__le__', '__ne__']`
- [ ] `['__le__']`
- [ ] `[]`

`total_ordering` adds the three missing ordering methods and never touches `__ne__`: the default `object.__ne__` already inverts whatever `__eq__` returns.
:::

## Immutability

:::compare
```js
const config = Object.freeze({ retries: 3, hosts: ["a"] });
config.retries = 5;       // ignored (TypeError in strict mode)
config.hosts.push("b");   // fine: freeze is shallow

const view = new Proxy(settings, { set: () => false });   // read-only view
```
```python
config = MappingProxyType({"retries": 3, "hosts": ("a",)})
config["retries"] = 5     # TypeError: no item assignment
# a tuple has no append: pick immutable types all the way down

view = MappingProxyType(settings)                          # read-only view
```
:::

Python's immutable building blocks are the ones you know: `tuple` instead of `list`, `frozenset` instead of `set`, `str` and `bytes`, and [frozen dataclasses](lesson:dataclasses-and-enums#frozen-dataclasses) or `NamedTuple` for records. All of them are shallow, exactly like `Object.freeze`: a tuple holding a list can't be reassigned, but the list inside can still grow.

There's no built-in frozen dict in 3.14. The closest thing is `types.MappingProxyType`, a read-only **live view** of a dict: no assignment, no `del`, no `update()`, but changes made through the original dict show through. CPython hands out class namespaces this way (`SomeClass.__dict__` is a mapping proxy, so changes to a class have to go through `setattr()`), and `singledispatch` exposes `.registry` the same way. The idiom: keep the dict private and hand out the proxy.

```python run
from types import MappingProxyType

_settings = {"theme": "dark", "retries": 3}
settings = MappingProxyType(_settings)          # hand this out

try:
    settings["theme"] = "light"
except TypeError as err:
    print("TypeError:", err)

_settings["theme"] = "light"                    # the owner can still write...
print(settings["theme"])                        # ...and the view sees it
print(settings | {"retries": 5})                # | builds a new, ordinary dict
print(type(int.__dict__).__name__)
```

For deep immutability, convert all the way down. `match` keeps the recursive walk short:

```python run
from types import MappingProxyType


def freeze(value):
    match value:
        case dict():
            return MappingProxyType({key: freeze(item) for key, item in value.items()})
        case list() | tuple():
            return tuple(freeze(item) for item in value)
        case set() | frozenset():
            return frozenset(value)
        case _:
            return value


config = freeze({"db": {"hosts": ["a", "b"]}, "flags": {"beta"}})
print(config["db"]["hosts"], config["flags"])
try:
    config["db"]["hosts"].append("c")
except AttributeError as err:
    print("AttributeError:", err)
```

:::quiz output
What does this print?

```python
from types import MappingProxyType

prices = {"tea": 3}
view = MappingProxyType(prices)
snapshot = dict(view)
prices["tea"] = 4
print(view["tea"], snapshot["tea"])
```

- [x] `4 3`
- [ ] `3 3`
- [ ] `4 4`
- [ ] `TypeError`

A mapping proxy is a live window onto `prices`, so it sees the update. `dict(view)` copied the contents at that moment, so the snapshot keeps the old price.
:::

Updating immutable data means building a new value. The spellings map closely onto the spread idioms:

| Update | JavaScript | Python |
| --- | --- | --- |
| set a key | `{ ...d, [k]: v }` | `d \| {k: v}` |
| drop a key | `const { [k]: _, ...rest } = d` | `{key: v for key, v in d.items() if key != k}` |
| append | `[...xs, x]` | `(*xs, x)` for a tuple |
| replace item `i` | `xs.with(i, x)` | `xs[:i] + (x,) + xs[i + 1:]` |
| change a field | `{ ...user, age: 37 }` | `replace(user, age=37)` |
| add to a set | `new Set([...s, x])` | `s \| {x}` |

Each of these copies the whole collection: there's no structural sharing as in Immutable.js. The third-party `pyrsistent` package provides persistent collections, but most Python code simply copies.

:::pythonic Immutable values make good keys
Hashability is where immutability pays off in Python: a tuple, a frozenset or a frozen dataclass can be a dict key, a set member, or an argument to a `@cache`d function. A config frozen with `MappingProxyType` can't: hashing a mapping proxy hashes the dict underneath, and dicts aren't hashable. For a hashable snapshot of a dict, use `frozenset(d.items())`, as long as the values are hashable too.
:::

## Why there are no tail calls

:::compare
```js
// ES2015 specified proper tail calls; only Safari ships them
function gcd(a, b) {
  return b === 0 ? a : gcd(b, a % b);
}

gcd(1071, 462);   // 21
```
```python
def gcd(a, b):
    while b:                     # the tail call becomes a loop:
        a, b = b, a % b          # rebind the parameters, go round again
    return a

gcd(1071, 462)    # 21
```
:::

A tail call is a call whose result is returned unchanged, so the caller's frame could be discarded before it runs. Python never does that, by design. Guido van Rossum's argument was that dropping frames ruins tracebacks, and that once code depended on it, every Python implementation would be forced to provide it. There's a practical obstacle too: the `gcd` inside `gcd` is a global name looked up at call time, which a decorator or a test's mock can rebind, so the compiler can't even know the call is recursive. The [core lesson](lesson:functions#recursion-a-low-limit-and-no-tail-calls) covers the 1,000-frame limit. This section is about what to do instead.

Converting tail recursion into a loop is mechanical: the recursive call's arguments become a tuple assignment to the parameters, and the base case becomes the loop's exit condition. Mutual recursion, where `is_even` calls `is_odd` calls `is_even`, doesn't fold into one loop as neatly. A **trampoline** handles it: each function returns a zero-argument callable (a *thunk*) describing its next step instead of making the call, and a driver loop keeps calling thunks until it gets a real value. The stack stays flat however many steps it takes.

```python run
def trampoline(fn, *args):
    result = fn(*args)
    while callable(result):          # bounce until we get a real value
        result = result()
    return result


def is_even(n):
    return True if n == 0 else (lambda: is_odd(n - 1))


def is_odd(n):
    return False if n == 0 else (lambda: is_even(n - 1))


print(trampoline(is_even, 100_001))  # 100,001 steps on a flat stack
```

The catch is that the final value can't itself be callable, or the driver would call it. Libraries wrap thunks in a dedicated class and test with `isinstance` instead.

:::deep Raising the limit is safer than it used to be
Since 3.11, a call from Python code to a Python function doesn't consume C stack: the interpreter sets up the new frame and jumps into it. So for pure-Python recursion, `sys.setrecursionlimit()` mostly costs memory now. Recursion that passes through C code (a `functools.cache` wrapper, `str.join` over a generator, the `__repr__` of a deeply nested structure) still uses native stack on every level, and in this sandbox running out of it kills the interpreter rather than raising `RecursionError`. A loop has neither problem.
:::

## Cheat sheet

| JavaScript (Ramda, lodash) | Python | Notes |
| --- | --- | --- |
| a closure's hidden scope | `fn.__closure__`, `cell.cell_contents` | one cell per captured variable |
| `fn.bind(null, a)`, `R.partial(fn, [a])` | `partial(fn, a)` | nested partials flatten |
| `R.__` | `functools.Placeholder` | 3.14+ |
| partially applying a method | `partialmethod(method, a)` | a bare `partial` binds `self` late (3.14) |
| `R.curry(fn)` | build it with `inspect.signature` | or just use `partial` |
| `fn.length` | `inspect.signature(fn).parameters` | names, kinds, defaults |
| `R.pipe(f, g)`, `_.flow` | `reduce(lambda acc, fn: fn(acc), fns, x)` | no `\|>` operator |
| `R.compose(f, g)`, `_.flowRight` | the same over `reversed(fns)` | |
| `(s) => s.trim()` | `str.strip` | unbound methods are functions |
| `R.prop("a")`, `R.props(["a", "b"])` | `itemgetter("a")`, `itemgetter("a", "b")` | one key gives a scalar |
| `R.path(["a", "b"])` | `attrgetter("a.b")`, `reduce(getitem, path, data)` | |
| `R.invoker(1, "split")(",")` | `methodcaller("split", ",")` | |
| `R.includes(x, xs)` | `operator.contains(xs, x)` | container first |
| a type-keyed `Map` of handlers | `@singledispatch` | follows the MRO and ABCs |
| `_.memoize(fn)` | `@cache`, `@lru_cache(maxsize=n)` | keys on every argument, as passed |
| `R.sortWith([descend(...), ascend(...)])` | stable sorts, least significant first | or `cmp_to_key` |
| `xs.sort(comparator)` | `sorted(xs, key=cmp_to_key(cmp))` | |
| `Object.freeze(obj)` | tuple, frozenset, frozen dataclass | all shallow |
| a read-only `Proxy` | `MappingProxyType(d)` | a live view |
| proper tail calls (Safari) | a loop, or a trampoline | no TCO, by design |

## Challenges

:::challenge id=fp-pipe-compose title="pipe and compose" difficulty=easy
Write `pipe(*fns)` and `compose(*fns)`, Python's versions of Ramda's `R.pipe` and `R.compose` (lodash/fp's `flow` and `flowRight`):

- `pipe(f, g, h)(x)` is `h(g(f(x)))`: left to right.
- `compose(f, g, h)(x)` is `f(g(h(x)))`: right to left.
- The first function to run receives **all** the arguments, positional and keyword, so `pipe(max, str)(3, 9, 4)` is `"9"`. Every later function receives the previous result.
- With no functions, both return a function that hands back its single argument unchanged.
- Building a pipeline calls nothing. Thread the value through the functions with `functools.reduce`.

```js
const pipe = (first = (x) => x, ...rest) => (...args) =>
  rest.reduce((acc, fn) => fn(acc), first(...args));
const compose = (...fns) => pipe(...fns.reverse());
```

```python starter
from functools import reduce


def pipe(*fns):
    ...


def compose(*fns):
    ...
```

```python solution
from functools import reduce


def identity(value):
    return value


def pipe(*fns):
    if not fns:
        return identity
    first, *rest = fns

    def piped(*args, **kwargs):
        return reduce(lambda acc, fn: fn(acc), rest, first(*args, **kwargs))

    return piped


def compose(*fns):
    return pipe(*reversed(fns))
```

```python tests
def double(n):
    return n * 2


def inc(n):
    return n + 1


@test("pipe runs left to right")
def _():
    eq(pipe(double, inc)(5), 11)
    eq(pipe(str.strip, str.upper, len)("  hey "), 3)

@test("compose runs right to left")
def _():
    eq(compose(double, inc)(5), 12)
    eq(compose(len, str.strip)("  hey "), 3)

@test("the first function receives every argument")
def _():
    eq(pipe(max, str)(3, 9, 4), "9")
    eq(compose(str, max)(3, 9, 4), "9")
    eq(pipe(sorted, tuple)([3, 1, 2], reverse=True), (3, 2, 1))

@test("a single function behaves like itself")
def _():
    eq(pipe(double)(4), 8)
    eq(compose(double)(4), 8)

@test("no functions gives the identity")
def _():
    eq(pipe()("x"), "x")
    eq(compose()(42), 42)

@test("building a pipeline calls nothing")
def _():
    calls = []

    def spy(n):
        calls.append(n)
        return n

    piped = pipe(spy, spy)
    eq(calls, [], "pipe() should only build the function")
    eq(piped(1), 1)
    eq(calls, [1, 1])

@test("pipelines are reusable")
def _():
    shout = pipe(str.upper, lambda s: s + "!")
    eq([shout("a"), shout("b")], ["A!", "B!"])

@test("uses functools.reduce")
def _():
    requires_call("reduce", "thread the value through the functions with functools.reduce")
```

```hint
`reduce(lambda acc, fn: fn(acc), fns, value)` applies each function to the result of the previous one, starting from `value`.
```

```hint
The first function is special because it gets all the arguments: split it off with `first, *rest = fns`, call `first(*args, **kwargs)`, and reduce the rest over that result.
```

```hint
`compose` is `pipe` with the functions in reverse order: `pipe(*reversed(fns))`.
```
:::

:::challenge id=fp-curry title="Curry with a signature" difficulty=medium
Write `curry(fn)`, Python's `R.curry`. The curried function collects **positional** arguments across calls and calls `fn` as soon as it has at least as many as `fn` has **required positional parameters**: positional parameters with no default, counted with `inspect.signature`.

```text
add3 = curry(lambda a, b, c: a + b + c)
add3(1)(2)(3)    ->  6
add3(1, 2)(3)    ->  6
add3(1)(2, 3)    ->  6
add3()(1, 2, 3)  ->  6
```

- Every partial application is independent and reusable: `add_one = add3(1)` can be called again and again.
- Parameters with defaults, `*args` and keyword-only parameters don't count towards the arity, but extra positional arguments pass through. With `def greet(greeting, name, punct="!")`, `curry(greet)("Hi")("Ada")` is `"Hi, Ada!"` and `curry(greet)("Hi")("Ada", "?")` is `"Hi, Ada?"`.
- A function with no required parameters runs on the first call.
- The curried function keeps `fn`'s `__name__` and `__doc__`.

```js
const curry = (fn) => {
  const curried = (...args) =>
    args.length >= fn.length ? fn(...args) : (...more) => curried(...args, ...more);
  return curried;
};
```

```python starter
import functools
import inspect


def curry(fn):
    ...
```

```python solution
import functools
import inspect


def curry(fn):
    arity = sum(
        1
        for param in inspect.signature(fn).parameters.values()
        if param.kind in (param.POSITIONAL_ONLY, param.POSITIONAL_OR_KEYWORD)
        and param.default is param.empty
    )

    @functools.wraps(fn)
    def curried(*args):
        if len(args) >= arity:
            return fn(*args)
        return functools.partial(curried, *args)

    return curried
```

```python tests
def add3(a, b, c):
    """Add three numbers."""
    return a + b + c


def greet(greeting, name, punct="!"):
    return f"{greeting}, {name}{punct}"


@test("one argument at a time")
def _():
    eq(curry(add3)(1)(2)(3), 6)

@test("any grouping of arguments")
def _():
    curried = curry(add3)
    eq(curried(1, 2)(3), 6)
    eq(curried(1)(2, 3), 6)
    eq(curried(1, 2, 3), 6)
    eq(curried()(1, 2, 3), 6)

@test("partial applications are independent and reusable")
def _():
    add_one = curry(add3)(1)
    eq(add_one(2)(3), 6)
    eq(add_one(10)(20), 31)
    add_one_two = add_one(2)
    eq([add_one_two(3), add_one_two(4)], [6, 7])

@test("the arity comes from the signature")
def _():
    eq(curry(lambda a, b, c, d: a * b * c * d)(1)(2)(3)(4), 24)
    eq(curry(lambda a, b: a - b)(10)(3), 7)

@test("parameters with defaults are optional, but extra arguments pass through")
def _():
    eq(curry(greet)("Hi")("Ada"), "Hi, Ada!")
    eq(curry(greet)("Hi")("Ada", "?"), "Hi, Ada?")

@test("keyword-only parameters and *args don't count")
def _():
    def tag(name, *children, sep=""):
        return f"<{name}>{sep.join(children)}</{name}>"

    def scale(x, y, *, factor=2):
        return x * factor, y * factor

    eq(curry(tag)("p"), "<p></p>")
    eq(curry(scale)(1)(2), (2, 4))

@test("a function with no required parameters runs on the first call")
def _():
    eq(curry(lambda: "ready")(), "ready")

@test("keeps the name and docstring")
def _():
    curried = curry(add3)
    eq((curried.__name__, curried.__doc__), ("add3", "Add three numbers."))
```

```hint
`inspect.signature(fn).parameters.values()` gives `Parameter` objects. Count those whose `kind` is `POSITIONAL_ONLY` or `POSITIONAL_OR_KEYWORD` and whose `default is param.empty`.
```

```hint
The curried function checks `len(args) >= arity`. If there are enough, call `fn(*args)`; otherwise return something that remembers `args` and waits for more.
```

```hint
`functools.partial(curried, *args)` is exactly "remember these and wait for more". It builds a fresh object on every call, so partial applications can never share state, which is the bug a shared list of collected arguments would give you.
```
:::

:::challenge id=fp-sort-by title="Sort with mixed directions" difficulty=medium
Write `sort_by(records, *fields)`, which sorts a list of dicts by several fields, like Ramda's `sortWith`. A field name sorts ascending, and a leading `-` sorts that field descending, so `sort_by(users, "-city", "name")` sorts by city from Z to A, then by name from A to Z.

The values may be strings, dates or anything else that supports `<`, so negating them isn't an option. Return a new list and leave the input alone. Records that tie on every field keep their original order.

```text
users = [
    {"name": "cy", "city": "London"},
    {"name": "bob", "city": "Paris"},
    {"name": "ada", "city": "London"},
]
sort_by(users, "-city", "name")  ->  bob, then ada, cy
```

```js
const sortBy = (records, ...fields) =>
  R.sortWith(
    fields.map((f) => (f.startsWith("-") ? R.descend(R.prop(f.slice(1))) : R.ascend(R.prop(f)))),
    records,
  );
```

```python starter
from operator import itemgetter


def sort_by(records, *fields):
    ...
```

```python solution
from operator import itemgetter


def sort_by(records, *fields):
    result = list(records)
    for field in reversed(fields):          # least significant field first
        name = field.removeprefix("-")
        result.sort(key=itemgetter(name), reverse=field.startswith("-"))
    return result
```

```python tests
from datetime import date

USERS = [
    {"name": "cy", "city": "London", "joined": date(2023, 5, 1)},
    {"name": "dee", "city": "Paris", "joined": date(2021, 1, 9)},
    {"name": "ada", "city": "London", "joined": date(2022, 3, 4)},
    {"name": "bob", "city": "Paris", "joined": date(2021, 1, 9)},
]


def names(rows):
    return [row["name"] for row in rows]


@test("sorts by one field, ascending")
def _():
    eq(names(sort_by(USERS, "name")), ["ada", "bob", "cy", "dee"])

@test("a leading '-' sorts descending, even for strings")
def _():
    eq(names(sort_by(USERS, "-name")), ["dee", "cy", "bob", "ada"])

@test("mixes directions across fields")
def _():
    eq(names(sort_by(USERS, "-city", "name")), ["bob", "dee", "ada", "cy"])
    eq(names(sort_by(USERS, "city", "-name")), ["cy", "ada", "dee", "bob"])

@test("works with dates, newest first")
def _():
    eq(names(sort_by(USERS, "-joined", "name")), ["cy", "ada", "bob", "dee"])

@test("records that tie on every field keep their original order")
def _():
    eq(names(sort_by(USERS, "-joined")), ["cy", "ada", "dee", "bob"])
    eq(names(sort_by(USERS, "city")), ["cy", "ada", "dee", "bob"])

@test("no fields returns a copy in the original order")
def _():
    result = sort_by(USERS)
    eq(names(result), ["cy", "dee", "ada", "bob"])
    check(result is not USERS, "return a new list")

@test("doesn't modify the input")
def _():
    rows = list(USERS)
    sort_by(rows, "-city", "name")
    eq(names(rows), ["cy", "dee", "ada", "bob"])
```

```hint
Python's sort is stable, and `reverse=True` keeps it stable: records with equal keys stay in their current order.
```

```hint
Sort once per field, starting with the *least* significant one (the last field) and finishing with the most significant. Each pass reorders by its own field and leaves ties in the order the previous pass produced.
```

```hint
`field.removeprefix("-")`, `field.startswith("-")` and `key=itemgetter(name)` give you each pass. Porting a comparator with `functools.cmp_to_key` works too.
```
:::

:::challenge id=fp-type-dispatch title="Build singledispatch" difficulty=hard
Build `dispatch`, a small `functools.singledispatch`. Decorating a function makes it the **fallback** and returns a dispatcher that picks an implementation by the type of its **first** argument:

```python
@dispatch
def describe(value):
    return "something"

@describe.register(int)
def _(value):
    return f"int {value}"

@describe.register
def _(value: list):
    return f"list of {len(value)}"
```

- A call walks `type(first_argument).__mro__` in order and uses the first class with an implementation. The fallback is registered for `object`, so it catches everything else. Extra positional and keyword arguments pass through.
- `register(cls)` returns a decorator that records the function and returns it **unchanged**, so registrations stack and `_` can be reused as a name. Used bare, `@describe.register` takes the class from the annotation on the function's first parameter.
- `describe.dispatch(cls)` returns the implementation that would handle `cls`.
- `describe.registry` is a **read-only, live** view of the class-to-implementation mapping: it shows later registrations without being rebuilt.
- The dispatcher keeps the fallback's `__name__` and `__doc__`.
- Don't use `functools.singledispatch`.

```python starter
import functools
import inspect
from types import MappingProxyType
from typing import get_type_hints


def dispatch(fallback):
    ...
```

```python solution
import functools
import inspect
from types import MappingProxyType
from typing import get_type_hints


def dispatch(fallback):
    implementations = {object: fallback}

    def resolve(cls):
        return next(implementations[klass] for klass in cls.__mro__ if klass in implementations)

    def register(cls):
        if not isinstance(cls, type):           # bare @register: we were handed the function
            impl = cls
            first = next(iter(inspect.signature(impl).parameters))
            implementations[get_type_hints(impl)[first]] = impl
            return impl

        def decorator(impl):
            implementations[cls] = impl
            return impl

        return decorator

    @functools.wraps(fallback)
    def dispatcher(arg, /, *args, **kwargs):
        return resolve(type(arg))(arg, *args, **kwargs)

    dispatcher.register = register
    dispatcher.dispatch = resolve
    dispatcher.registry = MappingProxyType(implementations)
    return dispatcher
```

```python tests
class Animal: ...


class Dog(Animal): ...


class Puppy(Dog): ...


def build():
    @dispatch
    def describe(value, *rest, **options):
        """Describe a value."""
        return "something"

    @describe.register(Animal)
    def _(value, *rest, **options):
        return "animal"

    @describe.register(Dog)
    def _(value, *rest, **options):
        return "dog"

    @describe.register(int)
    def _(value, *rest, **options):
        return f"int {value}"

    return describe


@test("unregistered types use the fallback")
def _():
    describe = build()
    eq(describe("text"), "something")
    eq(describe(None), "something")

@test("dispatches on the exact type")
def _():
    describe = build()
    eq(describe(Animal()), "animal")
    eq(describe(Dog()), "dog")
    eq(describe(7), "int 7")

@test("subclasses use the nearest registered base")
def _():
    describe = build()
    eq(describe(Puppy()), "dog")
    eq(describe(True), "int True", "bool is a subclass of int")

@test("register returns the function, so registrations stack")
def _():
    describe = build()

    def number(value):
        return "number"

    check(describe.register(float)(number) is number, "register(cls)(fn) should return fn itself")
    describe.register(complex)(describe.register(float)(number))
    eq((describe(1.5), describe(2j)), ("number", "number"))

@test("bare @register reads the first parameter's annotation")
def _():
    describe = build()

    @describe.register
    def _(value: list, *rest):
        return f"list of {len(value)}"

    eq(describe([1, 2]), "list of 2")

@test("passes extra arguments through")
def _():
    @dispatch
    def fmt(value, width=0, *, fill=" "):
        return str(value).rjust(width, fill)

    @fmt.register(float)
    def _(value, width=0, *, fill=" "):
        return f"{value:.1f}".rjust(width, fill)

    eq(fmt(2.5, 6, fill="*"), "***2.5")
    eq(fmt("ab", 4), "  ab")

@test("dispatch(cls) reports the implementation")
def _():
    describe = build()
    eq(describe.dispatch(Puppy)(None), "dog")
    check(describe.dispatch(str) is describe.registry[object], "str should fall back to the object implementation")

@test("registry is a read-only, live view")
def _():
    describe = build()
    registry = describe.registry
    eq(set(registry), {object, Animal, Dog, int})
    with raises(TypeError):
        registry[str] = len
    describe.register(str)(len)
    check(str in registry, "the same view should show later registrations")

@test("keeps the fallback's name and docstring")
def _():
    describe = build()
    eq((describe.__name__, describe.__doc__), ("describe", "Describe a value."))

@test("doesn't use functools.singledispatch")
def _():
    used = any(
        (isinstance(node, ast.Name) and node.id == "singledispatch")
        or (isinstance(node, ast.Attribute) and node.attr == "singledispatch")
        or (isinstance(node, ast.alias) and node.name == "singledispatch")
        for node in ast.walk(tree)
    )
    check(not used, "build the registry yourself instead of wrapping functools.singledispatch")
```

```hint
Keep a dict `{object: fallback}` inside `dispatch`. On each call, walk `type(arg).__mro__` and use the first class that's in the dict. `object` ends every MRO, so the walk always finds something.
```

```hint
`register(cls)` returns a decorator that stores the function and returns it. In the bare form, `register` receives the function itself (test `isinstance(cls, type)`), and the first name in `inspect.signature(fn).parameters` looked up in `get_type_hints(fn)` gives you the class.
```

```hint
Functions accept attributes: `dispatcher.register = register` and `dispatcher.dispatch = resolve`. `MappingProxyType(implementations)` is a read-only view that stays in sync with the dict, with no copying.
```
:::
