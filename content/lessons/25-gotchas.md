---
title: "Gotchas: A Field Guide for JS Brains"
part: Advanced Python
summary: A rapid-fire quiz on the traps where JavaScript intuition gives the wrong answer, and the fix for each.
minutes: 30
---

Every trap on this page is a place where JavaScript intuition produces a confident, wrong answer. Each one is a quiz you can run, followed by a short explanation, the fix, and a link to the lesson that covers it properly. Answer before you peek: the ones you miss are where your next bug was coming from.

The traps are grouped by topic, and the cheat sheet at the end lists every one with its fix. The challenges are real bugs to repair.

:::tip Let the tools catch them
Several of these traps have linter rules. Ruff flags `== None` (`E711`) and `is` against a literal (`F632`) out of the box, and its opt-in bugbear and builtins rule sets add mutable default arguments (`B006`), closures that capture a loop variable (`B023`) and shadowed builtins (`A001`). Type checkers such as mypy and pyright report a coroutine that's called and never awaited.
:::

## Numbers and operators

Arithmetic reads the same in both languages, which is exactly how these slip through code review.

### `++count`

:::quiz output
What does this print?

```python
count = 5
++count
print(count)
```

- [ ] `6`
- [x] `5`
- [ ] `SyntaxError`
- [ ] `TypeError`

Python has no increment operator. `count++` is a `SyntaxError`, but `++count` parses as `+(+count)`: two unary pluses that evaluate to `5` and change nothing. Write `count += 1`, and loop with `for i in range(n)` instead of counting by hand. See [Numbers & Math](lesson:numbers-and-math).
:::

### `round(2.5)`

:::quiz output
What does this print?

```python
print(round(2.5), round(3.5))
```

- [ ] `3 4`
- [x] `2 4`
- [ ] `2 3`
- [ ] `3 3`

`round` uses banker's rounding: an exact half goes to the nearest **even** integer, so `2.5` becomes `2` and `3.5` becomes `4`. `Math.round` always rounds halves up, and `math.floor(x + 0.5)` mimics it. For money, use `decimal.Decimal` with an explicit rounding mode. See [Numbers & Math](lesson:numbers-and-math).
:::

### Negative `//` and `%`

:::quiz output
What does this print?

```python
print(-7 // 2, -7 % 3)
```

- [ ] `-3 -1`
- [x] `-4 2`
- [ ] `-3.5 -1`
- [ ] `-4 -1`

`//` is floor division, so `-7 // 2` is `-4`, not the `-3` you'd get from `Math.trunc(-7 / 2)`. `%` takes the sign of the divisor, so `-7 % 3` is `2` where JS says `-1`. The upside is that `i % len(xs)` is always a valid index, even for a negative `i`. When you need JS's remainder, `math.fmod(-7, 3)` returns `-1.0`. See [Numbers & Math](lesson:numbers-and-math).
:::

### `int("42px")`

:::quiz output
What happens?

```python
print(int("42px"))
```

- [ ] `42`
- [ ] `NaN`
- [ ] `None`
- [x] `ValueError`

`parseInt("42px")` reads digits until it hits something else and returns `42`. `int()` accepts the whole string (surrounding whitespace aside) or raises `ValueError`. So does `int("3.5")`, while `int(3.9)` truncates a float to `3`. If you really want the leading digits, extract them explicitly, for instance with a regex. See [Numbers & Math](lesson:numbers-and-math).
:::

### `"1" + 1`

:::quiz output
What happens?

```python
print("1" + 1)
```

- [ ] `11`
- [ ] `2`
- [ ] `"11"`
- [x] `TypeError`

Python is dynamically but **strongly** typed: it never converts between `str` and `int` behind your back. Say which one you mean, `"1" + str(1)` or `int("1") + 1`, or format with an f-string. See [Variables, Types & Scope](lesson:variables-and-scope).
:::

## Truthiness and equality

Conditions and comparisons look familiar, and that's the problem.

### The truthiness of `[]`, `{}` and NaN

:::quiz output
What does this print?

```python
print(bool([]), bool({}), bool(float("nan")))
```

- [ ] `True True False`
- [x] `False False True`
- [ ] `False False False`
- [ ] `True True True`

It's the exact opposite of JS, where `[]` and `{}` are truthy and `NaN` is falsy. Every empty container (`[]`, `{}`, `set()`, `""`, `()`) is falsy in Python, so `if items:` means "if items isn't empty". NaN is a non-zero float, so it's truthy; test for it with `math.isnan`. See [Truthiness & Equality](lesson:truthiness-and-equality).
:::

### `x or default`

:::quiz output
What does this print?

```python
def set_volume(level=None):
    return level or 50

print(set_volume(0))
```

- [ ] `0`
- [x] `50`
- [ ] `None`
- [ ] `False`

There's no `??` in Python. `or` returns its right operand whenever the left one is falsy, and `0`, `""`, `[]` and `False` are all falsy, so a deliberate `0` turns into `50`. JS's `||` has the same flaw, which is why `??` was added. Spell out the `None` check: `50 if level is None else level`. See [Truthiness & Equality](lesson:truthiness-and-equality).
:::

### `==` versus `is`

:::quiz output
What does this print?

```python
a = [1, 2]
b = [1, 2]
print(a == b, a is b)
```

- [ ] `False False`
- [x] `True False`
- [ ] `True True`
- [ ] `False True`

`==` compares contents, deeply for containers, so two equal lists are `==` where two JS arrays wouldn't be. `is` asks whether both names point at the same object, which is what `===` does for objects. Use `is` for singletons (`if user is None`) and nothing else: CPython caches small integers and some strings, so `is` on numbers or strings can pass your tests and then fail in production. See [Truthiness & Equality](lesson:truthiness-and-equality).
:::

### `True` and `1` as dict keys

:::quiz output
What does this print?

```python
print({1: "a", True: "b"})
```

- [ ] `{1: 'a', True: 'b'}`
- [x] `{1: 'b'}`
- [ ] `{True: 'b'}`
- [ ] `TypeError`

`bool` is a subclass of `int`: `True == 1`, and they hash the same, so they're one key. The dict keeps the first key object it saw (`1`) with the last value (`"b"`), and `1.0` would collide too. A JS object would have stringified them into two keys, `"1"` and `"true"`. See [Dicts](lesson:dicts).
:::

## Literals that aren't what they look like

Three pieces of syntax that build something other than what they appear to.

### Empty braces

:::quiz output
What does this print?

```python
tags = {}
print(type(tags).__name__)
```

- [ ] `set`
- [x] `dict`
- [ ] `object`
- [ ] `NoneType`

Braces with `key: value` pairs make a dict and braces with bare items make a set, so empty braces had to pick one, and dicts had them first. An empty set is `set()`. Here, `tags.add("new")` would fail with `AttributeError`. See [Sets](lesson:sets).
:::

### `("admin")`

:::quiz output
What does this print?

```python
roles = ("admin")
print(len(roles))
```

- [ ] `1`
- [x] `5`
- [ ] `0`
- [ ] `TypeError`

Parentheses only group; the **comma** makes a tuple. `("admin")` is just the string `"admin"`, five characters long, and looping over it yields letters. Write `("admin",)`, or use a list. See [Tuples & Destructuring](lesson:tuples-and-unpacking).
:::

### `[[0] * 3] * 3`

:::quiz output
What does this print?

```python
grid = [[0] * 3] * 3
grid[0][0] = 1
print(grid)
```

- [ ] `[[1, 0, 0], [0, 0, 0], [0, 0, 0]]`
- [x] `[[1, 0, 0], [1, 0, 0], [1, 0, 0]]`
- [ ] `[[1, 1, 1], [0, 0, 0], [0, 0, 0]]`
- [ ] `[[1, 0, 0]]`

`*` repeats references, so all three rows are the same list, exactly like `new Array(3).fill([])`. Build each row separately: `[[0] * 3 for _ in range(3)]`. See [Lists](lesson:lists#creating-lists).
:::

## Lists and strings

Familiar method names, different contracts.

### What `sort()` returns

:::quiz output
What does this print?

```python
scores = [3, 1, 2]
result = scores.sort()
print(result, scores)
```

- [ ] `[1, 2, 3] [3, 1, 2]`
- [x] `None [1, 2, 3]`
- [ ] `[1, 2, 3] [1, 2, 3]`
- [ ] `None [3, 1, 2]`

Methods that mutate (`sort`, `reverse`, `append`, `extend`, `insert`, `clear`) return `None`, so they can't be chained, and assigning the result loses your list. `sorted(scores)` returns a new list, like `toSorted`. See [Lists](lesson:lists#sorting-and-reversing).
:::

### `a += [x]` versus `a = a + [x]`

:::quiz output
What does this print?

```python
a = [1]
b = a
a += [2]
a = a + [3]
print(b)
```

- [ ] `[1]`
- [x] `[1, 2]`
- [ ] `[1, 2, 3]`
- [ ] `[1, 3]`

`a` and `b` start as two names for one list. On a list, `+=` extends **in place**, so `b` sees the `2`. `a = a + [3]` builds a new list and rebinds only `a`, so `b` never sees the `3`. On immutable types (numbers, strings, tuples), `+=` always rebinds. See [Variables, Types & Scope](lesson:variables-and-scope).
:::

### `split()` versus `split(" ")`

:::quiz output
What does this print?

```python
print("a  b".split(" "), "a  b".split())
```

- [ ] `['a', 'b'] ['a', 'b']`
- [x] `['a', '', 'b'] ['a', 'b']`
- [ ] `['a', '', 'b'] ['a', '', 'b']`
- [ ] `['a  b'] ['a', 'b']`

With a separator, `split` cuts at every occurrence and keeps the empty strings between doubled separators, just like JS. With no argument, it splits on runs of any whitespace and drops the empty strings: the `trim().split(/\s+/)` idiom, built in. See [Strings](lesson:strings).
:::

### `str.replace`

:::quiz output
What does this print?

```python
print("a-b-c".replace("-", "+"))
```

- [ ] `a+b-c`
- [x] `a+b+c`
- [ ] `a-b-c`
- [ ] `TypeError`

JS's `"a-b-c".replace("-", "+")` changes only the first match and needs `replaceAll` or a `/g` regex for the rest. Python's `str.replace` replaces them all; pass a count, `replace("-", "+", 1)`, to stop after the first. See [Strings](lesson:strings).
:::

## Iteration

Two traps in everyday loops.

### Reading an iterator twice

:::quiz output
What does this print?

```python
squares = map(lambda n: n * n, [1, 2, 3])
print(4 in squares, 4 in squares)
```

- [ ] `True True`
- [x] `True False`
- [ ] `False False`
- [ ] `TypeError`

`map`, `filter`, `zip`, `enumerate`, `reversed` and generator expressions return one-shot iterators, not arrays. `in` consumes items until it finds a match: the first check eats `1` and `4`, and the second starts at `9`, runs out and says `False`. Call `list()` on anything you need to read twice. See [Iterators & Generators](lesson:iterators-and-generators).
:::

### Deleting keys while looping over a dict

:::quiz output
What happens?

```python
stock = {"apple": 0, "pear": 3}
for name in stock:
    if stock[name] == 0:
        del stock[name]
print(stock)
```

- [ ] `{'pear': 3}`
- [ ] `{'apple': 0, 'pear': 3}`
- [ ] `KeyError`
- [x] `RuntimeError`

JS happily lets you `delete` keys inside `for...in`. Python raises `RuntimeError: dictionary changed size during iteration`. Loop over a snapshot of the keys, `for name in list(stock):`, or build a new dict with a comprehension. Lists don't raise, but removing items from a list you're looping over silently skips elements, so build a new list there too. See [Dicts](lesson:dicts) and [Control Flow](lesson:control-flow).
:::

## Scope

Where a name lives, and when Python decides.

### A loop variable after the loop

:::quiz output
What does this print?

```python
for i in range(3):
    pass
print(i)
```

- [ ] `NameError`
- [x] `2`
- [ ] `3`
- [ ] `None`

Python has no block scope. `for`, `if`, `while` and `with` don't create one, so `i` survives the loop holding its last value: that's `var` behaviour, and there's no `let`. (It's `2`, not the `3` a JS `var` counter ends on, because `range(3)` never produces `3`.) Functions, classes, modules and comprehensions are what create scopes. See [Variables, Types & Scope](lesson:variables-and-scope).
:::

### Updating a global from a function

:::quiz output
What happens?

```python
count = 0

def increment():
    count += 1
    return count

print(increment())
```

- [ ] `1`
- [ ] `0`
- [ ] `NameError`
- [x] `UnboundLocalError`

Assigning to a name anywhere in a function, `+=` included, makes it local to the **whole** function, decided before the function runs. So `count += 1` tries to read a local `count` that has no value yet. A JS closure would just update the outer variable. Declare `global count` (`nonlocal count` in a nested function), or better, pass the value in and return the new one. `UnboundLocalError` is a subclass of `NameError`. See [Variables, Types & Scope](lesson:variables-and-scope).
:::

### A variable called `list`

:::quiz output
What happens?

```python
list = [1, 2, 3]
print(list("abc"))
```

- [ ] `['a', 'b', 'c']`
- [ ] `[1, 2, 3]`
- [ ] `NameError`
- [x] `TypeError`

`list`, `dict`, `id`, `type`, `sum`, `max`, `input` and `filter` are ordinary names in the builtins scope, not reserved words. Assigning to one hides the builtin for the rest of the module, so `list("abc")` calls your list: `TypeError: 'list' object is not callable`. Choose another name (`items`, `user_id`, `total`). See [Variables, Types & Scope](lesson:variables-and-scope).
:::

## Functions

Two bugs that stay hidden until a function runs a second time, or runs later.

### A list as a default argument

:::quiz output
What does this print?

```python
def add_tag(tag, tags=[]):
    tags.append(tag)
    return tags

add_tag("a")
print(add_tag("b"))
```

- [ ] `['b']`
- [x] `['a', 'b']`
- [ ] `['a']`
- [ ] `TypeError`

JS evaluates a default parameter on every call. Python evaluates it **once**, when the `def` runs, so every call that omits `tags` shares a single list. Use `None` as the default and create the list inside: `if tags is None: tags = []`. See [Functions](lesson:functions).
:::

### Lambdas created in a loop

:::quiz output
What does this print?

```python
handlers = [lambda: i for i in range(3)]
print([h() for h in handlers])
```

- [ ] `[0, 1, 2]`
- [x] `[2, 2, 2]`
- [ ] `[3, 3, 3]`
- [ ] `[None, None, None]`

Each lambda looks `i` up when it's **called**, and by then the loop has finished with `i == 2`. It's the old `var`-in-a-loop bug, and Python has no `let` to fix it. Bind the current value when the function is created: a default argument (`lambda i=i: i`), `functools.partial`, or a small factory function. See [Functions](lesson:functions).
:::

## Classes

Two places where a JavaScript class does work that Python leaves to you.

### A list in the class body

:::quiz output
What does this print?

```python
class Cart:
    items = []

    def add(self, item):
        self.items.append(item)

a, b = Cart(), Cart()
a.add("apple")
print(b.items)
```

- [ ] `[]`
- [x] `['apple']`
- [ ] `AttributeError`
- [ ] `None`

`items = []` in the class body creates **one** list on the class, shared by every instance, like an array on a prototype. A JS class field (`items = [];`) runs once per instance; a Python class attribute doesn't. Give each instance its own state in `__init__`: `self.items = []`. See [Classes](lesson:classes).
:::

### A method without `self`

:::quiz output
What happens?

```python
class Counter:
    def __init__(self):
        self.count = 0

    def increment():
        self.count += 1

Counter().increment()
```

- [ ] Nothing: `count` becomes `1`
- [ ] `NameError`
- [ ] `AttributeError`
- [x] `TypeError`

Python passes the instance explicitly as the first argument, so `Counter().increment()` calls `increment` with one argument, and a method declared with none fails: `TypeError: Counter.increment() takes 0 positional arguments but 1 was given`. There's no implicit `this`. Write `def increment(self):` and reach attributes through `self.count`; a bare `count` would be a local variable. See [Classes](lesson:classes).
:::

## Async

The same keywords, a different execution model.

### An async call without `await`

:::quiz output
What does this print?

```python
import asyncio

async def save():
    print("saving")

async def main():
    save()
    print("done")

asyncio.run(main())
```

- [ ] `saving`, then `done`
- [x] `done`
- [ ] `done`, then `saving`
- [ ] `TypeError`

Calling an async function in JS starts it immediately and hands back a promise. In Python, the call only creates a coroutine object, and the body runs when you `await` it or schedule it with `asyncio.create_task`. So `save()` never runs, and the only sign is a `RuntimeWarning: coroutine 'save' was never awaited` on stderr. See [Async/Await & asyncio](lesson:async).
:::

## Cheat sheet

| JS habit | What Python does | Do this instead |
| --- | --- | --- |
| `count++`, `++count` | `SyntaxError`, a silent no-op | `count += 1` |
| `Math.round(2.5)` is `3` | `round(2.5)` is `2` | `math.floor(x + 0.5)`, or `Decimal` |
| `-7 % 3` is `-1` | `-7 % 3` is `2`, `-7 // 2` is `-4` | `math.fmod` for JS's remainder |
| `parseInt("42px")` | `int("42px")` raises `ValueError` | extract the digits explicitly |
| `"1" + 1` is `"11"` | `TypeError` | `str()` or `int()` first |
| `[]` and `{}` are truthy | empty containers are falsy | `if items:` |
| `NaN` is falsy | `nan` is truthy | `math.isnan(x)` |
| `x ?? fallback` | `x or fallback` eats `0` and `""` | `fallback if x is None else x` |
| `===` for identity | `==` compares values | `is` only for `None` and singletons |
| `{1: "a", true: "b"}` has two keys | `True` and `1` are one key | don't mix `bool` and `int` keys |
| `{}` for an empty set | `{}` is a dict | `set()` |
| `("admin")` | a string, not a tuple | `("admin",)` |
| `new Array(3).fill([])` | `[[0] * 3] * 3` shares rows | `[[0] * 3 for _ in range(3)]` |
| `xs.sort()` returns the array | `sort()` returns `None` | `sorted(xs)` |
| `a += b` means `a = a + b` | on a list, `+=` mutates in place | `a = a + b` for a new list |
| `s.split(" ")` | keeps empty strings | `s.split()` |
| `s.replace(a, b)` changes one | `replace` changes all | `s.replace(a, b, 1)` |
| arrays can be re-read | iterators run dry | `list(iterator)` |
| `delete` inside `for...in` | `RuntimeError` | `for key in list(d):` |
| `let` scopes to the block | loop variables leak | a function or a comprehension |
| functions can assign outer variables | `UnboundLocalError` | `global`/`nonlocal`, or return the value |
| `list`, `id`, `type` as names | shadows the builtin | `items`, `user_id`, `kind` |
| defaults evaluated per call | evaluated once | default to `None` |
| `let` in loops binds per iteration | closures see the last value | `lambda i=i: ...` |
| class fields are per instance | class attributes are shared | assign in `__init__` |
| implicit `this` | explicit `self` | `def method(self):` |
| async calls start right away | coroutines wait for `await` | `await`, or `asyncio.create_task` |

## Challenges

:::challenge id=gotcha-fix-cart title="Fix: carts that leak" difficulty=easy
`add_item(item, cart)` appends an item to a cart and returns the cart. When no cart is passed, it should start a **new** empty cart, but customers keep finding each other's items in theirs.

Fix the function. Mind the second trap: a caller who passes their own empty cart must get **that** list back, filled in, not a different one.

```js
function addItem(item, cart = []) {
  cart.push(item);
  return cart;
}
```

```python starter
def add_item(item, cart=[]):
    cart.append(item)
    return cart
```

```python solution
def add_item(item, cart=None):
    if cart is None:
        cart = []
    cart.append(item)
    return cart
```

```python tests
@test("each call without a cart starts a fresh one")
def _():
    eq(add_item("tea"), ["tea"])
    eq(add_item("pie"), ["pie"])

@test("calls without a cart don't share a list")
def _():
    first = add_item("mug")
    second = add_item("lamp")
    check(first is not second, "two customers got the same list")

@test("appends to a cart you pass in, and returns it")
def _():
    cart = ["mug"]
    result = add_item("tea", cart)
    eq(cart, ["mug", "tea"])
    check(result is cart, "return the same list you were given")

@test("an empty cart you pass in is used, not replaced")
def _():
    cart = []
    add_item("tea", cart)
    eq(cart, ["tea"], "`cart or []` swaps an empty cart for a new list")
```

```hint
The default `[]` is created once, when the `def` runs, and every call that omits `cart` shares it.
```

```hint
Default to `None` and create the list inside the function. Test with `if cart is None:`, not `cart = cart or []`, because an empty list is falsy too.
```
:::

:::challenge id=gotcha-fix-report title="Fix: the report that can't count" difficulty=medium
`summarize(orders)` reports on the **paid** orders: how many there are, their total, and the average order value (`0` when there are none). The total comes out right, but the count is always `0`.

Fix it. `orders` can be any iterable, including a generator streaming rows from a database, so it may only be read once.

```js
function summarize(orders) {
  const paid = orders.filter((o) => o.status === "paid");
  const total = paid.reduce((sum, o) => sum + o.total, 0);
  const count = paid.length;
  return { count, total, average: count ? total / count : 0 };
}
```

```python starter
def summarize(orders):
    paid = filter(lambda o: o["status"] == "paid", orders)
    total = sum(o["total"] for o in paid)
    count = len(list(paid))
    return {"count": count, "total": total, "average": total / count if count else 0}
```

```python solution
def summarize(orders):
    paid = [o["total"] for o in orders if o["status"] == "paid"]
    total = sum(paid)
    count = len(paid)
    return {"count": count, "total": total, "average": total / count if count else 0}
```

```python tests
ORDERS = [
    {"id": 1, "status": "paid", "total": 120},
    {"id": 2, "status": "refunded", "total": 35},
    {"id": 3, "status": "paid", "total": 80},
]

@test("counts the paid orders")
def _():
    eq(summarize(ORDERS)["count"], 2)

@test("totals the paid orders")
def _():
    eq(summarize(ORDERS)["total"], 200)

@test("averages the paid orders")
def _():
    eq(summarize(ORDERS)["average"], 100)

@test("no paid orders gives zeros, not a ZeroDivisionError")
def _():
    eq(summarize([{"id": 9, "status": "open", "total": 50}]), {"count": 0, "total": 0, "average": 0})
    eq(summarize([]), {"count": 0, "total": 0, "average": 0})

@test("works with a one-shot generator")
def _():
    eq(summarize(o for o in ORDERS), {"count": 2, "total": 200, "average": 100})
```

```hint
`filter()` returns an iterator, not a list. Once `sum` has walked through it, there's nothing left for `len(list(paid))` to count.
```

```hint
Materialize the paid orders once, with a list comprehension, then use the list as often as you like.
```
:::

:::challenge id=gotcha-fix-handlers title="Fix: every button says the same thing" difficulty=medium
`make_handlers(buttons)` builds a click handler for each button name and returns a dict that maps each name to its handler. Calling a handler, with no arguments, should return `"clicked <name>"`. Instead, every handler reports the last button.

Fix it so that each handler remembers its own button.

```js
// Fine in JS: `const` gives every iteration its own `name`.
function makeHandlers(buttons) {
  const handlers = {};
  for (const name of buttons) {
    handlers[name] = () => `clicked ${name}`;
  }
  return handlers;
}
```

```python starter
def make_handlers(buttons):
    handlers = {}
    for name in buttons:
        handlers[name] = lambda: f"clicked {name}"
    return handlers
```

```python solution
def make_handler(name):
    return lambda: f"clicked {name}"

def make_handlers(buttons):
    return {name: make_handler(name) for name in buttons}
```

```python tests
@test("each handler reports its own button")
def _():
    handlers = make_handlers(["save", "cancel", "delete"])
    eq(handlers["save"](), "clicked save")
    eq(handlers["cancel"](), "clicked cancel")
    eq(handlers["delete"](), "clicked delete")

@test("keeps the buttons in order")
def _():
    eq(list(make_handlers(["save", "cancel"])), ["save", "cancel"])

@test("works with any iterable of names")
def _():
    handlers = make_handlers(name for name in ["ok", "help"])
    eq(handlers["ok"](), "clicked ok")

@test("no buttons, no handlers")
def _():
    eq(make_handlers([]), {})
```

```hint
The lambda doesn't store `name`'s value. It looks the variable up when it's called, and by then the loop has finished.
```

```hint
Give each handler its own variable. A factory function does it cleanly: `def make_handler(name): return lambda: f"clicked {name}"`. A default argument, `lambda name=name: ...`, also works.
```
:::

:::challenge id=gotcha-fix-prune title="Fix: prune empty values" difficulty=hard
`prune(data)` cleans a config dict **in place** before it's saved: it removes every key whose value is `None`, an empty string, an empty list or an empty dict. It recurses into nested dicts, and a nested dict that ends up empty is removed too. `0` and `False` are real settings and must stay. It returns the same dict.

The direct port of the JS crashes, and even once it stops crashing, it throws away real settings. Fix both bugs.

```js
function prune(data) {
  for (const key in data) {
    const value = data[key];
    if (value && typeof value === "object" && !Array.isArray(value)) prune(value);
    const empty = value === null || value === "" ||
      (typeof value === "object" && Object.keys(value).length === 0);
    if (empty) delete data[key];
  }
  return data;
}
```

```python starter
def prune(data):
    for key in data:
        value = data[key]
        if isinstance(value, dict):
            prune(value)
        if not value:
            del data[key]
    return data
```

```python solution
def prune(data):
    for key, value in list(data.items()):
        if isinstance(value, dict):
            prune(value)
        if value is None or value in ("", [], {}):
            del data[key]
    return data
```

```python tests
@test("removes None and empty strings")
def _():
    eq(prune({"name": "api", "region": None, "prefix": ""}), {"name": "api"})

@test("removes empty lists and dicts")
def _():
    eq(prune({"tags": [], "meta": {}, "ports": [80]}), {"ports": [80]})

@test("keeps 0 and False")
def _():
    eq(prune({"retries": 0, "debug": False, "proxy": None}), {"retries": 0, "debug": False})

@test("prunes nested dicts")
def _():
    eq(prune({"db": {"host": "localhost", "password": None}}), {"db": {"host": "localhost"}})

@test("removes nested dicts that end up empty")
def _():
    eq(prune({"cache": {"url": None, "ttl": ""}, "port": 8080}), {"port": 8080})

@test("modifies the dict in place and returns it")
def _():
    config = {"a": None, "b": 2}
    result = prune(config)
    eq(config, {"b": 2})
    check(result is config, "return the same dict you were given")
```

```hint
Deleting keys from a dict while a `for` loop walks it raises `RuntimeError`. Loop over a snapshot instead: `list(data.items())`.
```

```hint
`not value` is also true for `0` and `False`. Test for the four empty cases explicitly.
```

```hint
`value is None or value in ("", [], {})` works because `in` compares with `==`, and `0 == ""`, `0 == []` and `0 == {}` are all `False`. Recurse before the emptiness check, so a nested dict that empties out gets removed.
```
:::
