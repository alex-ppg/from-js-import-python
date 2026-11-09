---
title: Functions, Arrows & Lambdas
part: Functions & Iteration
summary: Every JS function form mapped to def and lambda, plus keyword arguments, defaults and closures.
minutes: 40
---

JavaScript has half a dozen ways to write a function: declarations, function expressions, arrows with an expression body, arrows with a block body, methods, and the IIFE pattern on top. Python has two. `def` is a statement that holds any body, and `lambda` is an expression that holds exactly one expression. Every JS form maps onto one of them, and this lesson maps all of them.

The bigger shift is at the call site. Python checks every call against the signature (a missing argument is a `TypeError`, not `undefined`), lets callers pass any parameter by name, and evaluates default values **once**, when the function is defined. That last rule is behind Python's most famous trap.

## `def` replaces declarations, expressions and block arrows

:::compare
```js
function add(a, b) {
  return a + b;
}

const subtract = function (a, b) {
  return a - b;
};

const multiply = (a, b) => {
  return a * b;
};

const divide = (a, b) => a / b;
```
```python
def add(a, b):
    return a + b


def subtract(a, b):
    return a - b


def multiply(a, b):
    return a * b


def divide(a, b):
    return a / b
```
:::

All four become `def`. There's no expression form of `def`: it's a **statement** that creates a function object and binds it to a name, which is what `const subtract = function () {}` does. The body is the indented block after the colon, and an empty body needs a placeholder (`pass` or `...`). A function that runs off the end, or hits a bare `return`, returns `None`, Python's stand-in for `undefined`.

```python run
def log_total(prices):
    print(f"total: {sum(prices)}")      # no return statement


result = log_total([3, 4])
print(result)
print(type(log_total))
```

:::gotcha Expression arrows return implicitly, `def` never does
`(n) => n * 2` returns its value without saying so, and `lambda` does too. A `def` doesn't. Expanding a one-line arrow into a `def` and forgetting the `return` is the classic porting bug, and Python stays silent about it: the caller just receives `None`.
:::

## `lambda` is the expression arrow, for inline use

:::compare
```js
const byAge = users.toSorted((a, b) => a.age - b.age);
const names = users.map((u) => u.name);
const makeUser = (name) => ({ name, active: true });
const add = (a, b) => a + b;
```
```python
by_age = sorted(users, key=lambda u: u["age"])
names = [u["name"] for u in users]
make_user = lambda name: {"name": name, "active": True}
add = lambda a, b: a + b       # legal, but PEP 8 says: use def
```
:::

`lambda params: expression` is an arrow with an expression body: no parentheses around the parameters, no `return`, no braces. The body is **one expression** whose value is returned, which rules out statements (assignments, `if` blocks, loops, `try`, `raise`) and annotations. A conditional expression is fine (`lambda n: "even" if n % 2 == 0 else "odd"`), and returning a dict needs no wrapping parentheses because a lambda body can never be a block.

The second line has no lambda at all. Comprehensions replace most `map` and `filter` callbacks ([Comprehensions](lesson:map-filter-reduce)), so `lambda` mostly lives in `key=` arguments and other small callbacks passed straight into a call.

:::gotcha Don't give a lambda a name
`add = lambda a, b: a + b` runs, but PEP 8 says to use `def` for anything you bind to a name, and ruff flags it (rule E731). Every lambda's `__name__` is `"<lambda>"`, which is all a traceback can tell you about it, while a `def` gets a real name plus room for a docstring and annotations, for the price of one extra line. The JS habit of `const add = (a, b) => a + b` doesn't carry over: **if it has a name, it's a `def`**.
:::

### Multi-line callbacks: name them first

:::compare
```js
const order = JSON.parse(text, (key, value) => {
  if (key.endsWith("At") && typeof value === "string") {
    return new Date(value);
  }
  return value;
});
```
```python
def revive(obj):
    for key, value in obj.items():
        if key.endswith("_at") and isinstance(value, str):
            obj[key] = datetime.fromisoformat(value)
    return obj


order = json.loads(text, object_hook=revive)
```
:::

Python has no multi-line anonymous functions, by design. When a callback needs statements, give it a name with `def` right before the call and pass the name. It reads top to bottom, it can be tested on its own, and it shows up by name in tracebacks. A `def` nested inside another function is completely normal Python: it's a closure, exactly like an inner arrow.

Notice the signature too. `json.loads` calls `object_hook` once per decoded JSON object with **one** argument, the dict, where JS calls the reviver with a `(key, value)` pair for every property. Python callbacks receive exactly what the caller documents, [no more and no less](lesson:functions#calls-are-checked-against-the-signature).

### Choosing between `def` and `lambda`

- **`def` is the default.** Anything with a name, a docstring, statements, or logic worth testing.
- **`lambda` only inline**, for one expression passed straight into a call: `sorted(..., key=...)`, `max(..., key=...)`, `defaultdict(lambda: "n/a")`.
- **A nested `def`** for any callback that needs more than one expression.
- **No new function at all** when one already exists. JS wraps callbacks to control their arguments (`.map((s) => parseInt(s, 10))`), but Python passes exactly the documented arguments, so `map(int, strings)` and `key=str.casefold` need no wrapper. If you catch yourself writing `lambda x: f(x)`, write `f`. For attribute and item access, see [the `operator` module](lesson:decorators).

## IIFEs, methods and the rest of the zoo

:::compare
```js
const config = (() => {
  const env = process.env.APP_ENV ?? "dev";
  if (env === "prod") return { debug: false, workers: 8 };
  return { debug: true, workers: 1 };
})();
```
```python
def load_config():
    env = os.environ.get("APP_ENV", "dev")
    if env == "prod":
        return {"debug": False, "workers": 8}
    return {"debug": True, "workers": 1}


config = load_config()
```
:::

Python has no IIFEs because it has nothing for them to fix. Each file is a module with its own namespace, so there's no shared global scope to protect. When a value takes statements to compute, write a named function and call it: the name documents what it computes, and you can test it. Short cases don't even need that, since Python has no `const` and a name can simply be assigned in each branch of an `if`. An `(async () => { ... })()` wrapper around top-level awaits becomes `asyncio.run(main())` ([Async](lesson:async)).

:::compare
```js
class Ticker {
  count = 0;
  tick() {
    this.count++;
  }
  start(clock) {
    clock.every(1000, () => this.tick());  // arrow keeps `this`
    // clock.every(1000, this.tick);       // bug: `this` is lost
  }
}
```
```python
class Ticker:
    def __init__(self):
        self.count = 0

    def tick(self):
        self.count += 1

    def start(self, clock):
        clock.every(1, self.tick)          # a bound method: just works
```
:::

A method is a plain `def` inside a `class`, and its first parameter, `self` by convention, receives the instance explicitly. There's no `this` keyword, so there's nothing for a callback to lose: `self.tick` evaluates to a **bound method** that remembers its instance, ready to pass anywhere without `.bind(this)` or an arrow wrapper. The arrow's signature feature, lexical `this`, has no Python counterpart because nothing needs it. Classes, getters and static methods are covered in [Classes & Objects](lesson:classes).

### The whole zoo at a glance

| JavaScript | Python | Notes |
| --- | --- | --- |
| `function save(user) { ... }` | `def save(user): ...` | a statement, not hoisted |
| `const save = function (user) { ... }` | `def save(user): ...` | `def` has no expression form |
| `const save = (user) => { ... }` | `def save(user): ...` | block body → `def` |
| `const double = (n) => n * 2` | `def double(n): return n * 2` | named → `def`, even one-liners |
| `xs.map((n) => n * 2)` | `[n * 2 for n in xs]` | comprehensions replace most callbacks |
| `xs.sort((a, b) => a.age - b.age)` | `xs.sort(key=lambda u: u.age)` | inline expression → `lambda` |
| `() => ({ ok: true })` | `lambda: {"ok": True}` | no parentheses needed |
| `(a) => (b) => a + b` | `lambda a: lambda b: a + b` | legal; nested `def`s read better |
| `(() => { ... })()` | a named function you call | modules are already scoped |
| `(async () => { ... })()` | `asyncio.run(main())` | see [Async](lesson:async) |
| `{ greet() { ... } }` | `def greet(self): ...` in a `class` | explicit `self`, no `this` |
| `get total() { ... }` | `@property` | see [Classes](lesson:classes) |
| `static create() { ... }` | `@staticmethod` / `@classmethod` | see [Classes](lesson:classes) |
| `function* ids() { ... }` | `def ids():` containing `yield` | see [Generators](lesson:iterators-and-generators) |
| `async function load() { ... }` | `async def load():` | see [Async](lesson:async) |
| `function f(a, b = 1)` | `def f(a, b=1):` | defaults are evaluated once! |
| `function f(...rest)` | `def f(*rest):` | a tuple |
| `function f({ a, b = 2 })` | `def f(*, a, b=2):` | keyword-only parameters |
| `arguments` | `*args, **kwargs` | nothing implicit |
| `fn.call(obj, a)` / `fn.apply(obj, xs)` | `fn(a)` / `fn(*xs)` | no `this` to pass |
| `fn.bind(null, a)` | `functools.partial(fn, a)` | see [Decorators](lesson:decorators) |

## No hoisting: `def` runs when it's reached

:::compare
```js
console.log(total([1, 2, 3]));   // 6: declarations are hoisted

function total(xs) {
  return xs.reduce((a, b) => a + b, 0);
}
```
```python
print(total([1, 2, 3]))          # NameError: name 'total' is not defined


def total(xs):
    return sum(xs)
```
:::

`def` is an ordinary statement, executed top to bottom like an assignment, and until execution reaches it the name doesn't exist. That's how `const total = () => ...` behaves in JS, not how `function` declarations do.

What matters is when a call *runs*. A function body looks names up each time it executes, so a function can call a helper defined further down the file, provided both `def`s have run before the first call. That's why Python scripts define everything first and call the entry point at the very bottom:

```python run
def main():
    print(summarize([42.5, 17.0, 8.25]))     # defined below, and that's fine


def summarize(amounts):
    return f"{len(amounts)} orders, {sum(amounts):.2f} total"


main()                                       # by now both defs have run
```

Being a statement also means a `def` can sit inside an `if`, a loop or another function, and a second `def` with the same name simply rebinds it. There's no overloading by argument count.

:::quiz output
What happens?

```python
def greet():
    return "hi"


def greet(name):
    return f"hi {name}"


print(greet())
```

- [ ] `hi`
- [ ] `hi None`
- [x] `TypeError`
- [ ] `SyntaxError`

The second `def` replaces the first, so `greet` now requires `name`. For dispatch on argument *types*, see `functools.singledispatch` in [Decorators](lesson:decorators).
:::

### Functions are objects

Functions are first-class objects, exactly as in JS: store them in variables, lists and dicts, pass them in, return them, hang attributes on them. A dict of functions is the idiomatic replacement for a `switch` that dispatches on a string. `fn.name` becomes `fn.__name__`, `fn.length` becomes `inspect.signature(fn)`, and `callable(x)` tells you whether something can be called.

```python run
import inspect


def calculate(a, op, b):
    return OPERATIONS[op](a, b)


OPERATIONS = {"+": lambda a, b: a + b, "*": lambda a, b: a * b}

print(calculate(6, "*", 7))
print(calculate.__name__, inspect.signature(calculate))
print(callable(calculate), callable(OPERATIONS))
```

## Calls are checked against the signature

:::compare
```js
function area(width, height) {
  return width * height;
}

["1", "2", "3"].map(parseInt);   // [1, NaN, NaN]
area(3);                         // NaN: height is undefined
```
```python run raises
def area(width, height):
    return width * height


print(list(map(int, ["1", "2", "3"])))   # [1, 2, 3]
print(area(3))                           # TypeError: missing 'height'
```
:::

Python matches every call against the signature before the body runs. A missing argument, an extra one (JS ignores `area(3, 4, 5)`'s third argument; Python says *takes 2 positional arguments but 3 were given*), or a keyword the function doesn't have is a `TypeError` that names the function. It's raised at the call that's wrong, rather than as an `undefined` that surfaces three functions later. To make a parameter optional, give it a default.

The `parseInt` trap can't happen either: `map` calls `int` with exactly one argument. The flip side is that a callback must accept exactly what its caller passes. `sorted` calls `key` with one item, `json.loads` passes `object_hook` one dict, and `re.sub` hands its replacement function one `Match` object. No index or array tags along.

## Keyword arguments replace options objects

:::compare
```js
function connect(host, { port = 5432, timeout = 10, ssl = true } = {}) {
  // ...
}

connect("db.local", { timeout: 30 });
connect("db.local", { ssl: false, port: 6543 });
```
```python
def connect(host, *, port=5432, timeout=10, ssl=True):
    ...


connect("db.local", timeout=30)
connect("db.local", ssl=False, port=6543)
```
:::

Any parameter can be passed by name, in any order, and Python matches it up. That makes the options object unnecessary: callers get named, defaulted, self-documenting arguments, and the function gets plain parameters with no destructuring. Positional arguments must come first (`connect(timeout=30, "db.local")` is a `SyntaxError`), and passing one parameter both ways raises `TypeError: ... got multiple values for argument`.

The bare `*` makes everything after it **keyword-only**. Without it, `connect("db.local", 6543, 5, False)` would be legal and leave every reader guessing. A `/` does the opposite: parameters before it are **positional-only**, so callers can't use their names and you can rename them freely. That's why `help(len)` shows `len(obj, /)`; you'll read `/` in the standard library more often than you'll write it.

```python run raises
def resize(image, /, width, height, *, keep_ratio=True):
    return f"{image}: {width}x{height}, keep_ratio={keep_ratio}"


print(resize("cat.png", 640, 480))
print(resize("cat.png", height=480, width=640, keep_ratio=False))
print(resize("cat.png", 640, 480, False))
```

:::tip Make boolean flags keyword-only
`export(rows, False)` is a mystery at the call site, while `export(rows, include_header=False)` explains itself. Declaring `def export(rows, *, include_header=True)` makes the readable version the only version.
:::

### `*args`, `**kwargs` and spreading

:::compare
```js
function log(level, ...messages) {
  console.log(`[${level}]`, ...messages);
}

function tag(name, attrs = {}) {
  const pairs = Object.entries(attrs).map(([k, v]) => `${k}="${v}"`);
  return `<${name} ${pairs.join(" ")}>`;
}

log("warn", ...problems);
tag("a", { ...defaults, href: "/" });
```
```python
def log(level, *messages):
    print(f"[{level}]", *messages)


def tag(name, **attrs):
    pairs = [f'{k}="{v}"' for k, v in attrs.items()]
    return f"<{name} {' '.join(pairs)}>"


log("warn", *problems)
tag("a", **defaults, href="/")
```
:::

In a signature, `*messages` collects extra positional arguments into a **tuple** (a rest parameter) and `**attrs` collects extra keyword arguments into a **dict**, in call order, so callers fill your options bag with plain keyword syntax. The names `args` and `kwargs` are only a convention; the stars do the work. There's no implicit `arguments` object, so a function that wants everything asks for `*args, **kwargs`, which is exactly how wrappers forward calls ([Decorators](lesson:decorators)).

At a call site the stars spread: `*iterable` into positional arguments and `**mapping` into keyword arguments, mixed freely with ordinary ones. A spread dict's keys must name real parameters (or land in a `**kwargs`), exactly like typed-out keywords. Spreading inside list and dict literals is covered in [Tuples & Destructuring](lesson:tuples-and-unpacking).

:::gotcha Later keys don't win
In a JS object spread, `{ ...defaults, href: "/" }` quietly overrides. If `defaults` already contains `href`, the Python call `tag("a", **defaults, href="/")` raises `TypeError: ... got multiple values for keyword argument 'href'`. Merge first, then spread: `tag("a", **(defaults | {"href": "/"}))`.
:::

:::quiz output
What does this print?

```python
def f(a, *rest, b=0, **opts):
    print(a, rest, b, opts)


f(1, 2, 3, b=4, c=5)
```

- [ ] `1 [2, 3] 4 {'c': 5}`
- [x] `1 (2, 3) 4 {'c': 5}`
- [ ] `1 (2, 3, 4) 0 {'c': 5}`
- [ ] `TypeError`

`rest` is a tuple, not a list. Everything after `*rest` is keyword-only, so `b=4` binds `b`, and the unknown keyword `c` lands in `opts`. The full order, when you need every kind at once, is `def f(pos_only, /, normal, *args, kw_only, **kwargs)`.
:::

## Defaults are evaluated once

:::compare
```js
function addTag(tag, tags = []) {
  tags.push(tag);
  return tags;
}

addTag("a");   // ["a"]
addTag("b");   // ["b"]: a fresh [] on every call
```
```python run
def add_tag(tag, tags=[]):
    tags.append(tag)
    return tags


print(add_tag("a"))
print(add_tag("b"))            # the SAME list on every call
print(add_tag.__defaults__)    # it lives on the function
```
:::

JavaScript evaluates a default expression on every call that needs it. Python evaluates it **once, when the `def` statement runs**, and stores the resulting object on the function. Every call that omits `tags` gets that same list, so mutations pile up across calls. Immutable defaults such as `0`, `""`, `None` and tuples are safe, because nothing can change them in place. The trap is mutable ones: lists, dicts, sets and other objects.

:::pythonic The `None` sentinel
Default to `None` and build the fresh object inside the body. Every Python reviewer expects this shape:

```python
def add_tag(tag, tags=None):
    if tags is None:
        tags = []
    tags.append(tag)
    return tags
```

Resist the shortcut `tags = tags or []`. It also replaces an **empty list the caller passed in**, so `add_tag("a", my_tags)` silently leaves `my_tags` untouched whenever it starts out empty. (If `None` is itself a meaningful argument, use a private sentinel: `_MISSING = object()`, then `if tags is _MISSING:`.)
:::

:::gotcha It isn't only lists
Any default you *compute* is computed once. `def log(message, when=datetime.now())` stamps every message with the moment the module was imported. A default also can't refer to an earlier parameter: in `def scale(x, factor=x / 2)` the `x` is looked up when the `def` runs, so it's a `NameError`, or worse, silently a *global* `x`. JS allows both. In Python, default to `None` and compute the value in the body.
:::

:::quiz output
What does this print?

```python
def bump(n, total=0):
    total += n
    return total


bump(5)
print(bump(1))
```

- [x] `1`
- [ ] `6`
- [ ] `0`
- [ ] `TypeError`

Only *mutation* leaks between calls. `total += n` on an int rebinds the local name to a new int and leaves the default `0` alone, so every call starts from zero.
:::

## Closures and `nonlocal`

:::compare
```js
function makeCounter(start = 0) {
  let count = start;
  return () => {
    count += 1;
    return count;
  };
}

const a = makeCounter();
const b = makeCounter(100);
console.log(a(), a(), b());   // 1 2 101
```
```python run
def make_counter(start=0):
    count = start

    def increment():
        nonlocal count
        count += 1
        return count

    return increment


a = make_counter()
b = make_counter(100)
print(a(), a(), b())          # each call has its own count
```
:::

Closures work exactly as in JS: an inner function captures the enclosing function's *variables* (not snapshots of their values) and keeps them alive after the outer function returns. Reading a captured variable needs nothing special. **Rebinding** one does. Any assignment to a name inside a function, `+=` included, makes that name local to the function, so without the `nonlocal count` line, `count += 1` reads a local `count` that has no value yet and raises `UnboundLocalError`. `nonlocal` declares that the name belongs to the enclosing function.

Mutating a captured object isn't rebinding, so `cache[key] = value` or `items.append(x)` needs no declaration. The scope rules behind all this (LEGB, `global`, and more on `UnboundLocalError`) live in [Variables, Types & Scope](lesson:variables-and-scope).

:::pythonic Outgrowing a closure
A closure over one or two variables is idiomatic Python. Once the state grows, or needs several operations, a small class reads better than a bundle of `nonlocal` declarations. And for the plain counter above, the standard library already has one: `ids = itertools.count(1)`, then `next(ids)`.
:::

## Late-binding closures in loops

:::compare
```js
const handlers = [];
for (var i = 0; i < 3; i++) handlers.push(() => i);
handlers.map((h) => h());   // [3, 3, 3]: var shares one i

const fixed = [];
for (let i = 0; i < 3; i++) fixed.push(() => i);
fixed.map((h) => h());      // [0, 1, 2]: let makes one i per pass
```
```python run
handlers = []
for i in range(3):
    handlers.append(lambda: i)
print([h() for h in handlers])   # always like var

fixed = []
for i in range(3):
    fixed.append(lambda i=i: i)
print([h() for h in fixed])      # the default captures i now
```
:::

A closure looks up a variable's value when the inner function *runs*, not when it's created. A Python `for` loop doesn't create a new scope per iteration (Python has no block scope at all), so every lambda above shares one `i`, and by the time you call them it holds its last value. It's JavaScript's `var` bug, and there's no `let` to fix it. Comprehensions behave the same way: `[lambda: i for i in range(3)]` also gives `[2, 2, 2]`.

The fix is to capture the value at creation time. A default argument does exactly that, because defaults are evaluated once, when the `lambda` or `def` runs: the previous section's trap is this section's tool. It does turn the value into a parameter a caller could override, so for callbacks you hand to other code, prefer a small factory function (each call gets its own scope) or `functools.partial`, which binds its arguments immediately ([Decorators](lesson:decorators)).

:::quiz output
What does this print?

```python
scalers = {}
for n in [1, 2, 3]:
    scalers[n] = lambda x: x * n

print(scalers[1](10))
```

- [ ] `10`
- [x] `30`
- [ ] `NameError`
- [ ] `[10, 20, 30]`

All three lambdas read the same `n`, and after the loop it's `3`. Write `lambda x, n=n: x * n` to capture each value.
:::

## Recursion: a low limit and no tail calls

:::compare
```js
function sumTo(n) {
  return n === 0 ? 0 : n + sumTo(n - 1);
}

sumTo(5000);     // fine
sumTo(100000);   // RangeError: Maximum call stack size exceeded
```
```python run raises
def sum_to(n):
    return 0 if n == 0 else n + sum_to(n - 1)


print(sum_to(500))     # fine
print(sum_to(5000))    # RecursionError
```
:::

CPython caps the call depth at 1,000 frames by default (`sys.getrecursionlimit()`), far shallower than a JS engine's stack, and going past it raises `RecursionError`. There's no tail-call optimisation either, and there won't be: Guido van Rossum rejected it, mainly because it erases frames from tracebacks. (JS's proper tail calls are in the ES2015 spec, but only Safari ships them.)

`sys.setrecursionlimit()` can raise the cap, but that only moves the cliff. The robust fix is a loop, or an explicit stack when you're walking a tree, which [the last challenge](lesson:functions#fn-flatten-deep) has you write. Recursion stays idiomatic for naturally shallow structures: nested JSON, directory trees, divide-and-conquer.

:::tip Memoising a recursive function
For recursive functions that recompute the same subproblems (Fibonacci, counting paths), `@functools.cache` stores each result and turns exponential time into linear. It doesn't make recursion any deeper, though. See [Decorators](lesson:decorators).
:::

## Docstrings, `help()` and annotations

:::compare
```js
/**
 * Return the initials of a full name.
 * @param {string} name - e.g. "Ada Lovelace"
 * @param {string} [sep="."] - put after each initial
 */
function initials(name, sep = ".") {
  return name.split(/\s+/).map((p) => p[0].toUpperCase() + sep).join("");
}
```
```python
def initials(name: str, sep: str = ".") -> str:
    """Return the initials of a full name.

    Args:
        name: e.g. "Ada Lovelace"
        sep: put after each initial
    """
    return "".join(part[0].upper() + sep for part in name.split())
```
:::

A string literal as the first statement of a function is its **docstring**. Unlike a JSDoc comment, it's kept at runtime as `__doc__`, and `help()`, IDEs and documentation generators all read it. The convention (PEP 257) is triple double quotes, a one-line summary, a blank line, then details. The `Args:` layout is Google style; NumPy and reStructuredText styles exist too, so pick one per project.

The `: str` and `-> str` parts are **annotations**, Python's equivalent of TypeScript types. Like TS types, nothing checks them when the function is called: `initials(42)` gets past the signature and fails inside the body. Checkers such as mypy and pyright read them, and [Type Hints](lesson:type-hints) covers them in depth.

```python run
def initials(name: str, sep: str = ".") -> str:
    """Return the initials of a full name."""
    return "".join(part[0].upper() + sep for part in name.split())


print(initials("grace brewster hopper"))
help(initials)
print(initials.__annotations__)
```

## Cheat sheet

| JavaScript | Python | Notes |
| --- | --- | --- |
| `function f(a) { return a; }` | `def f(a): return a` | not hoisted |
| `const f = (a) => a * 2` | `def f(a): return a * 2` | don't assign lambdas |
| `xs.sort((a, b) => a.n - b.n)` | `xs.sort(key=lambda x: x.n)` | `lambda`: one expression |
| `(e) => { ... }` passed inline | nested `def`, pass its name | no multi-line lambdas |
| `(() => { ... })()` | a named function, or plain code | modules have their own scope |
| `fn.bind(this)` / arrow for `this` | `self.method` | bound methods |
| no `return` → `undefined` | no `return` → `None` | |
| `f(a = [])` (fresh per call) | `def f(a=None)` + `if a is None:` | defaults are evaluated once |
| `f(x, { timeout: 5 })` | `f(x, timeout=5)` | keyword arguments |
| `({ a, b }) =>` | `def f(*, a, b)` | keyword-only |
| `function f(...rest)` | `def f(*args)` | a tuple |
| options bag | `**kwargs` | a dict, in call order |
| `f(...xs)` / `f({ ...opts })` | `f(*xs)` / `f(**opts)` | duplicate keywords raise |
| missing argument → `undefined` | `TypeError` | so is an extra one |
| `fn.name` / `fn.length` | `fn.__name__` / `inspect.signature(fn)` | |
| `let` in a loop for closures | `lambda i=i: ...` or a factory | late binding |
| assigning a captured `let` | `nonlocal name` | |
| `RangeError` (call stack) | `RecursionError` (~1000 deep) | no tail calls |
| JSDoc | docstring + annotations | `help(fn)` |

## Challenges

:::challenge id=fn-tally-default title="A tally that doesn't leak" difficulty=easy
`tally(words, counts)` adds one to `counts[word]` for every word and returns the dict. When `counts` is omitted it should start from a **fresh** empty dict on every call, but the starter has the JavaScript-shaped bug: calls without `counts` share one dict. Fix it.

When the caller does pass a dict, including an empty one, update *that* dict and return it.

```js
function tally(words, counts = {}) {
  for (const word of words) counts[word] = (counts[word] ?? 0) + 1;
  return counts;
}
```

```python starter
def tally(words, counts={}):
    for word in words:
        counts[word] = counts.get(word, 0) + 1
    return counts
```

```python solution
def tally(words, counts=None):
    if counts is None:
        counts = {}
    for word in words:
        counts[word] = counts.get(word, 0) + 1
    return counts
```

```python tests
@test("counts words")
def _():
    eq(tally(["a", "b", "a"]), {"a": 2, "b": 1})

@test("calls without counts don't share a dict")
def _():
    first = tally(["x"])
    second = tally(["y"])
    eq(second, {"y": 1}, "the second call saw words from an earlier call")
    check(first is not second, "each call should create its own dict")

@test("updates and returns the dict you pass in")
def _():
    mine = {"a": 5}
    check(tally(["a", "c"], mine) is mine, "return the same dict you were given")
    eq(mine, {"a": 6, "c": 1})

@test("an empty dict you pass in is used, not replaced")
def _():
    mine = {}
    tally(["z"], mine)
    eq(mine, {"z": 1}, "`counts or {}` replaces an empty dict: test `is None` instead")
```

```hint
The default `{}` is created once, when `def` runs, and every call that omits `counts` shares it.
```

```hint
Default to `None`, then create the dict inside the body: `if counts is None: counts = {}`.
```
:::

:::challenge id=fn-build-url title="URL builder" difficulty=medium
Write `build_url` so it accepts a host, then any number of path segments, then keyword arguments for the query string:

```text
build_url("example.com")                        -> "https://example.com"
build_url("example.com", "api", "users", 42)    -> "https://example.com/api/users/42"
build_url("example.com", "find", q="py", page=2) -> "https://example.com/find?q=py&page=2"
build_url("localhost:8000", secure=False)       -> "http://localhost:8000"
```

Segments are joined with `/` and can be numbers. Query parameters keep the caller's order. `secure` defaults to `True`, picks `https` or `http`, never appears in the query string, and must be **keyword-only** so it can't be mistaken for a segment. The tests only use URL-safe values, so there's nothing to escape.

```js
function buildUrl(host, segments = [], { secure = true, query = {} } = {}) {
  const path = segments.map((s) => `/${s}`).join("");
  const qs = Object.entries(query).map(([k, v]) => `${k}=${v}`).join("&");
  return `${secure ? "https" : "http"}://${host}${path}${qs ? "?" + qs : ""}`;
}
```

```python starter
def build_url(host):
    ...
```

```python solution
def build_url(host, *segments, secure=True, **query):
    url = f"{'https' if secure else 'http'}://{host}"
    url += "".join(f"/{segment}" for segment in segments)
    if query:
        url += "?" + "&".join(f"{key}={value}" for key, value in query.items())
    return url
```

```python tests
import inspect

@test("host only")
def _():
    eq(build_url("example.com"), "https://example.com")

@test("extra positional arguments become path segments, numbers too")
def _():
    eq(build_url("example.com", "api", "users", 42), "https://example.com/api/users/42")

@test("keyword arguments become the query string, in call order")
def _():
    eq(build_url("example.com", "find", q="py", page=2), "https://example.com/find?q=py&page=2")
    eq(build_url("example.com", page=2, q="py"), "https://example.com?page=2&q=py")

@test("secure=False switches to http and stays out of the query")
def _():
    eq(build_url("localhost:8000", "health", secure=False), "http://localhost:8000/health")
    eq(build_url("example.com", secure=True, page=1), "https://example.com?page=1")

@test("secure is keyword-only")
def _():
    param = inspect.signature(build_url).parameters.get("secure")
    check(param is not None, "build_url needs a `secure` parameter")
    check(
        param.kind is inspect.Parameter.KEYWORD_ONLY,
        "declare `secure` after *segments so it can only be passed by name",
    )
```

```hint
`*segments` collects the extra positional arguments into a tuple, and `**query` collects the extra keyword arguments into a dict that keeps the caller's order.
```

```hint
A parameter declared after `*segments` can only be passed by keyword: `def build_url(host, *segments, secure=True, **query)`.
```
:::

:::challenge id=fn-running-average title="Running average" difficulty=medium
Write `make_averager()`, which returns a function. Each call to that function records one number and returns the average of **every number that averager has seen so far**:

```text
avg = make_averager()
avg(10)  ->  10.0
avg(20)  ->  15.0
avg(0)   ->  10.0
```

Keep the state in the closure, a running total and a count, and update it with `nonlocal`. Separate averagers must not share state.

```js
function makeAverager() {
  let total = 0, count = 0;
  return (value) => (total += value) / ++count;
}
```

```python starter
def make_averager():
    ...
```

```python solution
def make_averager():
    total = 0
    count = 0

    def add(value):
        nonlocal total, count
        total += value
        count += 1
        return total / count

    return add
```

```python tests
@test("averages everything seen so far")
def _():
    avg = make_averager()
    eq(avg(10), 10.0)
    eq(avg(20), 15.0)
    eq(avg(0), 10.0)

@test("averagers are independent")
def _():
    first = make_averager()
    second = make_averager()
    first(100)
    eq(second(1), 1.0, "a new averager shouldn't see another averager's numbers")
    eq(first(0), 50.0)

@test("keeps its state with nonlocal")
def _():
    requires_syntax(ast.Nonlocal, "rebind the running total and count with `nonlocal`")
```

```hint
Set `total` and `count` to zero in `make_averager`, then define a nested function that updates them and returns `total / count`.
```

```hint
Assigning to `total` inside the inner function makes it local to that function, unless you first declare `nonlocal total, count`.
```
:::

:::challenge id=fn-flatten-deep title="Flatten without blowing the stack" difficulty=hard
Write `flatten(items)` that returns a new flat list of every non-list value in an arbitrarily nested list, in order, like JavaScript's `arr.flat(Infinity)`. Only `list` counts as nesting: strings, tuples and dicts are values.

```text
flatten([1, [2, [3, [4]], 5], []])  ->  [1, 2, 3, 4, 5]
```

The starter is the recursive version you'd write first. It's correct, and it dies on deep input: the last test nests 2,000 levels deep, twice the default recursion limit, and there are no tail calls to save you. Rewrite it with a loop and an explicit stack.

```js
const flatten = (items) => items.flat(Infinity);
```

```python starter
def flatten(items):
    result = []
    for item in items:
        if isinstance(item, list):
            result.extend(flatten(item))
        else:
            result.append(item)
    return result
```

```python solution
def flatten(items):
    result = []
    stack = list(reversed(items))
    while stack:
        item = stack.pop()
        if isinstance(item, list):
            stack.extend(reversed(item))   # reversed, so pop() keeps the order
        else:
            result.append(item)
    return result
```

```python tests
@test("flattens nested lists in order")
def _():
    eq(flatten([1, [2, [3, [4]], 5], []]), [1, 2, 3, 4, 5])

@test("empty lists disappear and falsy values stay")
def _():
    eq(flatten([[], [[0]], [[], [None, ""]]]), [0, None, ""])

@test("strings, tuples and dicts are values")
def _():
    eq(flatten(["ab", ("c", "d"), [{"k": 1}]]), ["ab", ("c", "d"), {"k": 1}])

@test("returns a new list and leaves the input alone")
def _():
    items = [1, [2, [3]]]
    check(flatten(items) is not items, "return a new list")
    eq(items, [1, [2, [3]]], "the input changed")

@test("handles 2,000 levels of nesting")
def _():
    deep = ["bottom"]
    for _ in range(2_000):
        deep = [deep]
    eq(flatten(deep), ["bottom"])
```

```hint
Keep your own stack of items still to visit. Pop one: if it's a list, push its children; otherwise append it to the result. Loop until the stack is empty.
```

```hint
A stack pops from the end, so push children in reverse (`stack.extend(reversed(item))`) to visit them in their original order.
```
:::
