---
title: Control Flow & Loops
part: Foundations
summary: if/elif, one for loop for everything, range/enumerate/zip instead of index loops, for...else, := and match.
minutes: 35
---

Python's control flow has fewer moving parts than JavaScript's. There is exactly one `for` loop, and it always iterates over something, like `for...of`. The C-style `for (init; test; update)` loop doesn't exist, and neither do `++`, `do...while` or labeled `break`. Their jobs go to three built-ins, `range()`, `enumerate()` and `zip()`, and to two features JavaScript doesn't have: an `else` clause on loops, and (since 3.10) a `match` statement that does what you wanted `switch` to do.

## `if`, `elif`, `else`

:::compare
```js
if (score >= 90) {
  grade = "A";
} else if (score >= 80) {
  grade = "B";
} else {
  grade = "C";
}

const status = active ? "on" : "off";
if (debug) {}            // an empty block
```
```python
if score >= 90:
    grade = "A"
elif score >= 80:
    grade = "B"
else:
    grade = "C"


status = "on" if active else "off"
if debug:
    pass                 # an empty block
```
:::

No parentheses around the condition, a colon, and an indented block; `else if` is spelled `elif`. The condition can be any value and is judged by truthiness, where empty containers count as false ([Truthiness & Equality](lesson:truthiness-and-equality) has the rules and the conditional expression). A block can't be empty, so `pass` is the do-nothing placeholder (`...` works too, and is common in stubs). There's no `switch` statement; `match` fills that role, further down.

```python run
for score in (95, 85, 40):
    if score >= 90:
        print(score, "A")
    elif score >= 80:
        print(score, "B")
    else:
        print(score, "C")
print("on" if [] else "off")       # an empty list is falsy
```

## `for...of` → `for x in`

:::compare
```js
for (const user of users) {
  console.log(user.name);
}
for (const ch of "héllo") {}
for (const key in config) {}        // keys, inherited ones included
for (const [key, value] of Object.entries(config)) {}
for (const value of Object.values(config)) {}
for (const line of text.split("\n")) {}
```
```python
for user in users:
    print(user["name"])

for ch in "héllo": ...
for key in config: ...              # iterating a dict yields its keys
for key, value in config.items(): ...
for value in config.values(): ...
for line in text.splitlines(): ...
```
:::

Python's `for` is always `for...of`: it asks the object for an iterator and walks it. Lists, tuples, strings (one character at a time), sets, dict keys, open files (one line at a time), `range` objects and generators all work, and your own classes can join in ([Iterators & Generators](lesson:iterators-and-generators)). Iterating a dict yields its keys in insertion order, `.items()` gives key/value pairs like `Object.entries`, and `.values()` gives the values ([Dicts](lesson:dicts)).

:::gotcha `for x in xs` gives you items, not indices
JavaScript's `for...in` over an array yields the index strings `"0"`, `"1"`, ... Python's `for i in xs` yields the elements themselves. When you need positions, ask for them with `enumerate`, below.
:::

:::gotcha Rebinding the loop variable doesn't change the list
`for price in prices: price *= 2` rebinds the name `price` to a new number and leaves the list alone, just as reassigning `x` inside `for (let x of xs)` would. Build a new list with a comprehension, or write back through the index with `enumerate`.
:::

```python run
prices = [10, 20, 30]
for price in prices:
    price *= 2                    # rebinds the name only
print(prices, price)

for i, price in enumerate(prices):
    prices[i] = price * 2         # writes back through the index
print(prices)
```

Printing `price` after the first loop works because Python has no block scope: the loop variable outlives the loop and keeps its last value ([Variables, Types & Scope](lesson:variables-and-scope)).

## C-style loops → `range()`

The three-part JS loop is really a counter, and Python turns the counter into an object. `range(stop)` counts from 0 up to, but **not including**, `stop`. `range(start, stop)` picks the starting point, and `range(start, stop, step)` sets the step, which can be negative.

:::compare
```js
for (let i = 0; i < 5; i++) {}          // 0 1 2 3 4
for (let i = 1; i <= 5; i++) {}         // 1 2 3 4 5
for (let i = 0; i < 10; i += 2) {}      // 0 2 4 6 8
for (let i = 5; i > 0; i--) {}          // 5 4 3 2 1
for (let i = n - 1; i >= 0; i--) {}     // n-1 down to 0
for (let i = 10; i >= 0; i -= 5) {}     // 10 5 0
```
```python
for i in range(5): ...                  # 0 1 2 3 4
for i in range(1, 6): ...               # 1 2 3 4 5
for i in range(0, 10, 2): ...           # 0 2 4 6 8
for i in range(5, 0, -1): ...           # 5 4 3 2 1
for i in reversed(range(n)): ...        # n-1 down to 0
for i in range(10, -1, -5): ...         # 10 5 0
```
:::

The translation rules:

- **`stop` is exclusive.** `i < n` becomes `range(n)`, and `i <= n` becomes `range(..., n + 1)`.
- **Counting down needs a negative step and a stop one past the end.** `range(5, 0, -1)` stops before reaching 0, so to include 0 you write `range(n - 1, -1, -1)`. That off-by-one is why `reversed(range(n))` is the readable spelling.
- **A range in the wrong direction is just empty.** `range(5, 0)` yields nothing; it doesn't raise and it doesn't count down.
- **Integers only.** `range(0, 1, 0.1)` raises `TypeError`. For a float step, loop over integers and scale: `i / 10`.

A `range` is a lazy, immutable sequence: `range(10**9)` never builds a billion-item list, yet it supports `len()`, indexing, slicing and a constant-time `in` for integers.

```python run
print(list(range(5)), list(range(1, 6)), list(range(0, 10, 3)))
print(list(range(5, 0, -1)), list(range(4, -1, -1)), list(reversed(range(5))))
print(list(range(5, 0)))                # wrong direction: empty, not an error

r = range(0, 100, 7)
print(len(r), r[3], r[-1], 49 in r, r[:3])
print([i / 10 for i in range(5)])       # float steps: scale an int
```

:::quiz output
What does this print?

```python
print(list(range(10, 0, -3)))
```

- [ ] `[10, 7, 4, 1, -2]`
- [x] `[10, 7, 4, 1]`
- [ ] `[9, 6, 3, 0]`
- [ ] `[]`

It starts at 10 and steps by -3 for as long as the value stays above the exclusive stop, 0. `-2` would be past it.
:::

### Most index loops don't need an index

In JS, the counter loop is often a way to *reach* the items. In Python you iterate the items directly, and the patterns that needed `i` each have a dedicated tool:

:::compare Index loops and what replaces them
```js
for (let i = 0; i < xs.length; i++) use(xs[i]);
for (let i = 0; i < xs.length; i++) use(i, xs[i]);
for (let i = xs.length - 1; i >= 0; i--) use(xs[i]);
for (let i = 0; i < a.length; i++) use(a[i], b[i]);
for (let i = 1; i < xs.length; i++) use(xs[i - 1], xs[i]);
for (let i = 0; i < xs.length; i += 2) use(xs[i]);
for (let i = 0; i < 3; i++) retry();
for (;;) poll();
```
```python
for x in xs: use(x)
for i, x in enumerate(xs): use(i, x)
for x in reversed(xs): use(x)
for x, y in zip(a, b): use(x, y)
for prev, cur in pairwise(xs): use(prev, cur)    # itertools, 3.10+
for x in xs[::2]: use(x)
for _ in range(3): retry()
while True: poll()
```
:::

`_` is the conventional name for a value you don't use. `itertools.pairwise` yields overlapping pairs; on older Pythons, `zip(xs, xs[1:])` does the same. Nested index loops over pairs, `for (i...) for (j = i + 1...)`, become `itertools.combinations(xs, 2)` when you only need the items. More of `itertools` is in [Iterators & Generators](lesson:iterators-and-generators).

```python run
from itertools import combinations, pairwise

temps = [12, 15, 11, 18]
print([later - earlier for earlier, later in pairwise(temps)])    # daily change
print(list(reversed(temps)), temps[::2])
print(list(combinations(["Ada", "Grace", "Linus"], 2)))           # every pairing
```

The loops that are left, the ones that skip ahead, scan with two pointers or step by a non-constant amount, become `while` loops (below).

## Index plus value: `enumerate()`

:::compare
```js
names.forEach((name, i) => {
  console.log(i, name);
});
for (const [i, name] of names.entries()) {}
for (let i = 0; i < names.length; i++) {
  console.log(`${i + 1}. ${names[i]}`);
}
```
```python
for i, name in enumerate(names):
    print(i, name)

for i, name in enumerate(names): ...
for n, name in enumerate(names, start=1):
    print(f"{n}. {name}")
```
:::

`enumerate(iterable, start=0)` yields `(index, item)` pairs, and the `for` unpacks each pair into two names. It works on any iterable, not just lists, so it replaces `forEach((x, i) => ...)`, `.entries()` and most `for (let i...)` loops. `start=1` gives human-friendly numbering without `i + 1` everywhere. Writing `for i in range(len(xs)):` and then `xs[i]` works, but linters flag it and reviewers will ask for `enumerate`.

```python run
names = ["Ada", "Grace", "Linus"]
for n, name in enumerate(names, start=1):
    print(f"{n}. {name}")

print(list(enumerate("abc")))

scores = {"Ada": 92, "Grace": 95}
for rank, (name, score) in enumerate(scores.items(), start=1):
    print(rank, name, score)
```

The last loop unpacks a nested pair, `rank, (name, score)`, the same destructuring you'd write in JS as `[rank, [name, score]]`. [Tuples & Destructuring](lesson:tuples-and-unpacking) covers those patterns.

## Two arrays at once: `zip()`

:::compare
```js
for (let i = 0; i < names.length; i++) {
  console.log(names[i], scores[i]);
}
// different lengths: scores[i] is undefined
const pairs = names.map((n, i) => [n, scores[i]]);
const lookup = Object.fromEntries(names.map((n, i) => [n, scores[i]]));
```
```python
for name, score in zip(names, scores):
    print(name, score)

# different lengths: zip stops at the shortest
pairs = list(zip(names, scores))
lookup = dict(zip(names, scores))
```
:::

`zip(a, b, ...)` walks any number of iterables in lockstep and yields tuples. It stops at the end of the **shortest** input, silently, so a length mismatch that would show up as `undefined` in JS just vanishes. Pass `strict=True` (3.10+) to turn a mismatch into a `ValueError`, or use `itertools.zip_longest(..., fillvalue=...)` to pad the short side. `dict(zip(keys, values))` is the `Object.fromEntries` idiom, and `zip(*rows)` transposes a grid ([Tuples & Destructuring](lesson:tuples-and-unpacking)).

```python run raises
from itertools import zip_longest

names = ["Ada", "Grace", "Linus"]
scores = [92, 95]

print(list(zip(names, scores)))                         # Linus is silently dropped
print(list(zip_longest(names, scores, fillvalue=0)))
print(dict(zip(names, [92, 95, 87])))
for name, score in zip(names, scores, strict=True):    # raises at the end
    print(name, score)
```

:::tip Reach for `strict=True`
When two sequences are *supposed* to line up (columns and values, expected and actual results), a silent truncation hides a real bug. `zip(..., strict=True)` costs nothing and fails loudly at the first mismatch. ruff's B905 rule nudges you to make the choice explicit.
:::

## What happened to `i++`?

:::compare
```js
for (let i = 0; i < n; i++) {}   // i++ or ++i: same here
const token = tokens[pos++];     // read, then advance

const id = nextId++;
while (retries--) attempt();
if (temp < 0) frozen++;
```
```python
for i in range(n): ...           # range does the counting
token = tokens[pos]              # read...
pos += 1                         # ...then advance, as a statement
id_ = next(ids)                  # ids = itertools.count(1)
for _ in range(retries): attempt()
frozen = sum(1 for t in temps if t < 0)
```
:::

Python has no `++` or `--` operators. [Numbers & Math](lesson:numbers-and-math) has the full story, including the nasty part: `++i` is valid Python that silently does nothing. In loops, the counter mostly disappears instead of being translated. `range` does the counting, `enumerate` numbers items, `sum(1 for ...)` or `len()` counts matches, and `itertools.count()` replaces a `nextId++` that hands out ids. The prefix-versus-postfix question disappears with it: in a JS loop header `i++` and `++i` are interchangeable anyway, and in Python there's no header.

When you do keep a counter by hand, remember that `i += 1` is a **statement**, not an expression. JS code that increments in the middle of an expression (`xs[i++]`, `while (n--)`, `out[k++] = v`) becomes two steps: use the current value, then update it on its own line. The last challenge below is exactly that translation.

## `while`, and the missing `do...while`

:::compare
```js
while (queue.length) {
  handle(queue.shift());
}

do {
  answer = ask();
} while (!valid(answer));

for (let lo = 0, hi = xs.length - 1; lo < hi; lo++, hi--) {
  [xs[lo], xs[hi]] = [xs[hi], xs[lo]];
}
```
```python
while queue:
    handle(queue.popleft())

while True:
    answer = ask()
    if valid(answer):
        break

lo, hi = 0, len(xs) - 1
while lo < hi:
    xs[lo], xs[hi] = xs[hi], xs[lo]
    lo, hi = lo + 1, hi - 1
```
:::

`while` works as in JS, with the condition judged by truthiness, so `while queue:` runs until the queue is empty. There's no `do...while`. The idiom is `while True:` with the exit test at the bottom, which guarantees that the body runs at least once. Loops with several counters become `while` loops with a tuple assignment such as `lo, hi = lo + 1, hi - 1`, which updates both at once.

:::gotcha Assigning to a `for` variable doesn't skip iterations
In a JS `for` loop, `i += 1` inside the body changes what the next iteration sees. In Python, `for i in range(n)` takes the next value from the range no matter what you did to `i`. Loops that skip ahead, scan with two pointers, or step by a non-constant amount (`i *= 2`) are `while` loops.
:::

```python run
for i in range(3):
    i += 10                         # no effect on the next iteration
    print(i, end=" ")
print()

args = ["build", "-o", "app.js", "--watch"]
i = 0
while i < len(args):                # skipping ahead needs while
    if args[i] == "-o":
        print("output:", args[i + 1])
        i += 2
        continue
    print("arg:", args[i])
    i += 1

n, steps = 27, 0
while True:                         # do...while: the body runs at least once
    n = n // 2 if n % 2 == 0 else 3 * n + 1
    steps += 1
    if n == 1:
        break
print("Collatz steps for 27:", steps)
```

:::pythonic Skip ahead with an iterator
An explicit iterator lets a plain `for` consume extra items: with `it = iter(args)` and `for arg in it:`, calling `next(it)` inside the body takes the flag's value. The loop and your `next()` call share one iterator, so the value is never seen as an argument of its own.
:::

## `break`, `continue`, and no labels

:::compare
```js
let found = null;
outer:
for (const row of grid) {
  for (const cell of row) {
    if (cell.id === target) {
      found = cell;
      break outer;
    }
  }
}
```
```python
def find_cell(grid, target):
    for row in grid:
        for cell in row:
            if cell["id"] == target:
                return cell
    return None

found = find_cell(grid, target)
```
:::

`break` and `continue` behave as in JS and apply to the innermost loop. There are no labels, so leaving nested loops early takes a different shape:

1. **Return from a function.** Usually the cleanest option: move the search into a function, and `return` exits every loop at once.
2. **Flatten the loops.** `itertools.product(range(rows), range(cols))` turns two nested loops into one, so a single `break` is enough.
3. **Use a flag**, exactly as you would in JS without labels.
4. **Use `for...else`**, from the next section, when you can't extract a function.

```python run
from itertools import product

grid = [[3, 8, 1], [9, 4, 7], [5, 2, 6]]
target = 4

for r, c in product(range(len(grid)), range(len(grid[0]))):
    if grid[r][c] == target:
        print(f"found {target} at row {r}, col {c}")
        break                       # one break leaves the "nested" loop
```

## `for...else` and `while...else`

:::compare
```js
let found = false;
for (const n of numbers) {
  if (n % 7 === 0) {
    console.log("first multiple of 7:", n);
    found = true;
    break;
  }
}
if (!found) console.log("no multiple of 7");
```
```python
for n in numbers:
    if n % 7 == 0:
        print("first multiple of 7:", n)
        break
else:
    print("no multiple of 7")
```
:::

A loop's `else` block runs when the loop finishes **without hitting `break`**: the iterable ran out, or the `while` condition became false. That makes it the "not found" branch of a search, and it replaces the `found` flag entirely. The name is unfortunate, so read `else` as "no break". If the loop body never runs at all (an empty list, say), the `else` still runs; a `return` or an exception skips it.

```python run
def first_multiple(numbers, k):
    for n in numbers:
        if n % k == 0:
            print(f"first multiple of {k}: {n}")
            break
    else:
        print(f"no multiple of {k}")

first_multiple([3, 14, 21], 7)
first_multiple([3, 5, 11], 7)
first_multiple([], 7)                # nothing to loop over: else runs

responses = iter(["timeout", "timeout", "timeout"])
attempt = 0
while attempt < 3:
    attempt += 1
    if next(responses) == "ok":
        print("succeeded on attempt", attempt)
        break
else:
    print("gave up after", attempt, "attempts")
```

:::quiz output
What does this print?

```python
for n in [1, 2, 3]:
    if n > 5:
        break
else:
    n = 0
print(n)
```

- [ ] `3`
- [x] `0`
- [ ] `5`
- [ ] `NameError`

The loop never breaks, so the `else` block runs and sets `n` to 0. Without the `else`, `n` would still be `3`, the last value it was bound to.
:::

:::deep `for...else` as a labeled break
The `else` clause can emulate `break outer` in nested loops:

```python
for row in grid:
    for cell in row:
        if cell == target:
            break           # leave the inner loop
    else:
        continue            # the inner loop didn't break: next row
    break                   # the inner loop broke: leave the outer one too
```

It works, and you'll meet it in the wild, but most reviewers find a function with `return` easier to follow.
:::

## The walrus operator `:=`

:::compare
```js
let line;
while ((line = reader.readLine()) !== null) {
  handle(line);
}

let m;
if ((m = /(\d+) items/.exec(text))) {
  console.log(m[1]);
}
```
```python
while (line := reader.readline()):
    handle(line)

if m := re.search(r"(\d+) items", text):
    print(m[1])
```
:::

In JavaScript, assignment is an expression, so `if (m = f())` is legal, and `if (x = 5)` is a classic typo. In Python, `=` is a statement and `if m = f():` is a `SyntaxError`. The walrus operator `:=` (3.8+) is the deliberate, visible version: it assigns a name and evaluates to the value, so you can test a value and keep it. Its natural homes are `while` loops that read until a sentinel and `if` statements around a regex match or a lookup that may return `None`. ([map, filter, reduce → Comprehensions](lesson:map-filter-reduce) shows it inside comprehensions.)

```python run
import io
import re

stream = io.StringIO("alpha\nbeta\n\ngamma\n")
while (line := stream.readline()):       # "" at the end stops the loop
    print(repr(line))

for text in ["order 66: 3 items", "no count here"]:
    if m := re.search(r"(\d+) items", text):
        print("items:", m[1])

items = list(range(15))
if (n := len(items)) > 10:
    print(f"too many items ({n})")
```

:::gotcha Parenthesize the walrus
`:=` binds more loosely than comparisons, so `if n := len(items) > 10:` assigns the **boolean** `len(items) > 10` to `n`. Write `if (n := len(items)) > 10:`. The same goes for `is not None`: `while (item := queue.get()) is not None:`. And it can't stand alone as a statement: `x := 5` is a `SyntaxError`, because plain `=` does that job.
:::

:::quiz output
What does this print?

```python
items = ["a", "b", "c"]
if n := len(items) > 2:
    print(n)
```

- [ ] `3`
- [x] `True`
- [ ] `2`
- [ ] `SyntaxError`

Without parentheses, `len(items) > 2` is evaluated first and `n` gets the boolean `True`. `(n := len(items)) > 2` would bind `3`.
:::

## `match`: a `switch` without fall-through

:::compare
```js
switch (command) {
  case "start":
  case "run":
    start();
    break;
  case "stop":
    stop();
    break;
  default:
    console.log(`unknown: ${command}`);
}
```
```python
match command:
    case "start" | "run":
        start()

    case "stop":
        stop()

    case _:
        print(f"unknown: {command}")
```
:::

`match` (3.10+) tries each `case` in order, runs the first one that matches, and leaves. There is no fall-through and no `break`; alternatives that share a body are combined with `|`. `case _:` is the default, since `_` matches anything. If nothing matches and there's no `case _:`, nothing happens, like a `switch` without `default`. Literal patterns compare with `==` (and `None`, `True` and `False` with `is`).

That's only the `switch`-shaped corner of `match`. It also destructures sequences, dicts and objects, binds variables and takes `if` guards, all of which is covered in [Structural Pattern Matching](lesson:pattern-matching).

```python run
def http_status(code: int) -> str:
    match code:
        case 200 | 201 | 204:
            return "ok"
        case 301 | 302 | 308:
            return "redirect"
        case 404:
            return "not found"
        case _:
            return "error"

print([http_status(code) for code in (200, 302, 404, 500)])

RED = "red"
color = "blue"
match color:
    case RED:                    # a capture pattern, not a comparison!
        print("matched, and now RED is", repr(RED))
```

:::gotcha A bare name captures instead of comparing
`case RED:` doesn't test `color == RED`. A bare name is a **capture pattern**: it matches anything and binds the subject to that name, as the playground shows. Python rejects it with a `SyntaxError` when it would make later cases unreachable, but as the last case it silently swallows everything. Match constants through a dotted name (`Color.RED`, `settings.MODE`) or write the literal.
:::

:::gotcha `break` inside a `case` leaves the loop
In JS, `break` inside a `switch` exits the `switch`. Python's cases never need it, so a `break` inside a `case` block exits the enclosing **loop**. A ported `case "skip": break` stops the whole loop rather than moving on to the next item; use `continue` for that.
:::

:::tip Dict dispatch
When every branch just maps a value to a result or to a function, a dict beats both `switch` and `match`: `handlers = {"start": start, "stop": stop}`, then `handlers.get(command, unknown)()`. It's the same object-lookup trick you'd use in JS.
:::

## Mutating a collection while looping

:::compare
```js
const nums = [1, 2, 2, 3];
nums.forEach((n, i) => {
  if (n === 2) nums.splice(i, 1);   // skips the second 2
});

const kept = nums.filter((n) => n !== 2);
for (const key of Object.keys(prices)) {
  if (prices[key] > 100) delete prices[key];
}
```
```python
nums = [1, 2, 2, 3]
for n in nums:
    if n == 2:
        nums.remove(n)              # skips the second 2


kept = [n for n in nums if n != 2]
for key in list(prices):            # loop over a copy of the keys
    if prices[key] > 100:
        del prices[key]
```
:::

A list iterator walks by position. Removing an item shifts everything after it one place left, so the loop skips the next element, exactly like `splice` inside `forEach`. Appending while you iterate keeps the loop going, possibly forever. Dicts and sets are stricter than JS objects: changing their **size** mid-loop raises `RuntimeError: dictionary changed size during iteration` (changing the values of existing keys is fine; see [Dicts](lesson:dicts)).

The fixes:

- **Build a new list** with a comprehension, `[x for x in xs if keep(x)]`. Assign it back with `xs[:] = ...` if other code holds a reference to the same list.
- **Loop over a copy**: `for x in xs[:]:` for a list, `for key in list(d):` for a dict.
- **Walk backwards** when you must delete by index in place: `for i in reversed(range(len(xs))):`.

:::quiz output
What does this print?

```python
nums = [2, 2, 3]
for n in nums:
    if n == 2:
        nums.remove(n)
print(nums)
```

- [ ] `[3]`
- [x] `[2, 3]`
- [ ] `[2, 2, 3]`
- [ ] `RuntimeError`

The first pass removes the item at index 0, and the second 2 slides into its place. The iterator moves on to index 1, which now holds `3`, so the second 2 is never examined. Lists don't detect this; only dicts and sets raise `RuntimeError`.
:::

```python run
nums = [1, 2, 2, 3, 2]
alias = nums
nums[:] = [n for n in nums if n != 2]    # rebuild, in place
print(alias)                             # every reference sees the result

stock = {"tea": 0, "pie": 3, "jam": 0}
for item in list(stock):                 # copy the keys first
    if stock[item] == 0:
        del stock[item]
print(stock)
```

## Cheat sheet

| JavaScript | Python | Notes |
| --- | --- | --- |
| `else if` | `elif` | |
| `cond ? a : b` | `a if cond else b` | |
| `{}` (empty block) | `pass` | or `...` |
| `for (const x of xs)` | `for x in xs:` | any iterable |
| `for (const k in obj)` | `for k in d:` | iterating a dict yields keys |
| `Object.entries(obj)` | `d.items()` | `for k, v in d.items():` |
| `for (let i = 0; i < n; i++)` | `for i in range(n):` | `stop` is exclusive |
| `i <= n` | `range(start, n + 1)` | |
| `i += 2` | `range(start, stop, 2)` | integers only |
| `for (let i = n - 1; i >= 0; i--)` | `for i in reversed(range(n)):` | or `range(n - 1, -1, -1)` |
| `xs.forEach((x, i) => ...)` | `for i, x in enumerate(xs):` | `start=1` to count from 1 |
| `a[i]` and `b[i]` together | `for x, y in zip(a, b):` | `strict=True` checks lengths |
| `xs[i - 1]`, `xs[i]` | `for prev, cur in pairwise(xs):` | `itertools`, 3.10+ |
| `i++`, `i--` | `i += 1`, `i -= 1` | statements, not expressions |
| `nextId++` | `next(ids)` | `ids = itertools.count(1)` |
| `do {...} while (cond)` | `while True: ... if not cond: break` | |
| `break outer` | `return` from a function | or `itertools.product` |
| a `found` flag | `for ... else:` | `else` means "no `break`" |
| `if ((m = re.exec(s)))` | `if m := re.search(p, s):` | 3.8+ |
| `switch` / `default:` | `match` / `case _:` | 3.10+, no fall-through |
| `case "a": case "b":` | `case "a" \| "b":` | |
| `splice` inside a loop | `xs[:] = [x for x in xs if keep(x)]` | or loop over a copy |

## Challenges

:::challenge id=loop-diff-lines title="Diff two versions" difficulty=easy
Write `diff_lines(before, after)` that compares two lists of lines and returns a description of every line that changed, in order, numbered from 1:

```text
diff_lines(["a", "b", "c"], ["a", "x", "c"])  ->  ["line 2: 'b' -> 'x'"]
```

Format each entry as `f"line {n}: {old!r} -> {new!r}"`. The two lists must have the same length: raise `ValueError` if they don't.

Use `enumerate` and `zip`, with no index arithmetic and no `range()`.

```js
function diffLines(before, after) {
  if (before.length !== after.length) throw new RangeError("length mismatch");
  const changes = [];
  for (let i = 0; i < before.length; i++) {
    if (before[i] !== after[i]) {
      changes.push(`line ${i + 1}: '${before[i]}' -> '${after[i]}'`);
    }
  }
  return changes;
}
```

```python starter
def diff_lines(before, after):
    ...
```

```python solution
def diff_lines(before, after):
    return [
        f"line {n}: {old!r} -> {new!r}"
        for n, (old, new) in enumerate(zip(before, after, strict=True), start=1)
        if old != new
    ]
```

```python tests
@test("reports changed lines, numbered from 1")
def _():
    eq(diff_lines(["a", "b", "c"], ["a", "x", "c"]), ["line 2: 'b' -> 'x'"])
    eq(
        diff_lines(["x = 1", "y = 2"], ["x = 10", "y = 20"]),
        ["line 1: 'x = 1' -> 'x = 10'", "line 2: 'y = 2' -> 'y = 20'"],
    )

@test("identical or empty inputs have no changes")
def _():
    eq(diff_lines(["same"], ["same"]), [])
    eq(diff_lines([], []), [])

@test("a blank line counts as a change")
def _():
    eq(diff_lines(["keep", "text"], ["keep", ""]), ["line 2: 'text' -> ''"])

@test("different lengths raise ValueError")
def _():
    raises(ValueError, diff_lines, ["a", "b"], ["a"])
    raises(ValueError, diff_lines, ["a"], ["a", "b"])

@test("uses enumerate and zip, not range")
def _():
    requires_call("enumerate", "number the lines with enumerate(..., start=1)")
    requires_call("zip", "walk both lists at once with zip()")
    forbids_call("range", "no index loops: let enumerate and zip do the counting")
```

```hint
`zip(before, after)` gives you `(old, new)` pairs, and `enumerate(..., start=1)` numbers them: `for n, (old, new) in enumerate(zip(before, after), start=1):`.
```

```hint
`zip(..., strict=True)` raises `ValueError` when the lengths differ, so you don't need a separate length check.
```
:::

:::challenge id=loop-find-seats title="Find adjacent seats" difficulty=medium
A seating chart is a list of rows, and each row is a list of booleans where `True` means the seat is taken. Write `find_seats(rows, party)` that returns `(row, seat)`, the 0-based position of the **first** run of `party` adjacent free seats, scanning rows from the top and seats from the left. Return `None` if no row has room.

```text
X, _ = True, False
rows = [[X, _, X, _, _],
        [_, _, X, _, _, _]]
find_seats(rows, 2)  ->  (0, 3)
find_seats(rows, 3)  ->  (1, 3)
find_seats(rows, 4)  ->  None
```

JavaScript would reach for a labeled `break`. Python has none, so stop the search some other way.

```js
function findSeats(rows, party) {
  let result = null;
  outer: for (let r = 0; r < rows.length; r++) {
    let run = 0;
    for (let s = 0; s < rows[r].length; s++) {
      run = rows[r][s] ? 0 : run + 1;
      if (run === party) {
        result = [r, s - party + 1];
        break outer;
      }
    }
  }
  return result;
}
```

```python starter
def find_seats(rows, party):
    ...
```

```python solution
def find_seats(rows, party):
    for r, row in enumerate(rows):
        run = 0
        for s, taken in enumerate(row):
            run = 0 if taken else run + 1
            if run == party:
                return r, s - party + 1
    return None
```

```python tests
X, _ = True, False
ROWS = [
    [X, _, X, _, _],
    [_, _, X, _, _, _],
    [_, _, _, _],
]

@test("finds the first fit, scanning row by row")
def _():
    eq(find_seats(ROWS, 2), (0, 3))
    eq(find_seats(ROWS, 3), (1, 3))
    eq(find_seats(ROWS, 4), (2, 0))

@test("seats must be adjacent")
def _():
    eq(find_seats([[_, X, _, X, _]], 2), None)

@test("a party of one takes the first free seat")
def _():
    eq(find_seats(ROWS, 1), (0, 1))

@test("returns None when nothing fits")
def _():
    eq(find_seats(ROWS, 5), None)
    eq(find_seats([], 1), None)
    eq(find_seats([[X, X]], 1), None)
```

```hint
Put the nested loops in the function and `return` the moment you find a fit: `return` leaves both loops at once. Falling off the end of the loops means nothing fitted.
```

```hint
Keep a running count of consecutive free seats in the current row, resetting it to 0 at every taken seat and at the start of each row. When the count reaches `party`, the run started at `s - party + 1`.
```
:::

:::challenge id=loop-merge-sorted title="Merge two sorted lists" difficulty=medium
Write `merge_sorted(a, b)` that merges two already-sorted lists into one new sorted list, in a single pass, the way merge sort does. When items are equal, take the one from `a` first.

Don't call `sorted()` or `.sort()`, and don't import `heapq`: walk both lists with two indices in a `while` loop.

```text
merge_sorted([1, 4, 9], [2, 3, 10, 11])  ->  [1, 2, 3, 4, 9, 10, 11]
```

```js
function mergeSorted(a, b) {
  const merged = [];
  let i = 0, j = 0;
  while (i < a.length && j < b.length) {
    merged.push(a[i] <= b[j] ? a[i++] : b[j++]);
  }
  return [...merged, ...a.slice(i), ...b.slice(j)];
}
```

```python starter
def merge_sorted(a, b):
    merged = []
    i = j = 0
    # your loop here
    return merged
```

```python solution
def merge_sorted(a, b):
    merged = []
    i = j = 0
    while i < len(a) and j < len(b):
        if a[i] <= b[j]:
            merged.append(a[i])
            i += 1
        else:
            merged.append(b[j])
            j += 1
    merged.extend(a[i:])        # at most one of these is non-empty
    merged.extend(b[j:])
    return merged
```

```python tests
@test("interleaves two sorted lists")
def _():
    eq(merge_sorted([1, 4, 9], [2, 3, 10, 11]), [1, 2, 3, 4, 9, 10, 11])

@test("handles empty inputs")
def _():
    eq(merge_sorted([], [1, 2]), [1, 2])
    eq(merge_sorted([1, 2], []), [1, 2])
    eq(merge_sorted([], []), [])

@test("keeps duplicates")
def _():
    eq(merge_sorted([1, 2, 2], [2, 3]), [1, 2, 2, 2, 3])

@test("takes equal items from a first")
def _():
    result = merge_sorted([1, 2], [1.0, 2.0])
    eq([type(x).__name__ for x in result], ["int", "float", "int", "float"])

@test("doesn't modify the inputs")
def _():
    a, b = [1, 3], [2, 4]
    merge_sorted(a, b)
    eq((a, b), ([1, 3], [2, 4]), "an input list changed")

@test("merges by hand")
def _():
    forbids_call("sorted", "merge in one pass instead of re-sorting")
    forbids_call("sort", "merge in one pass instead of re-sorting")
    forbids_import("heapq", "write the loop yourself")
    requires_syntax(ast.While, "walk both lists with a while loop")
```

```hint
Loop `while i < len(a) and j < len(b):`. Each time round, append the smaller of `a[i]` and `b[j]` (use `<=` so ties go to `a`), then advance that list's index with `i += 1` or `j += 1` on its own line.
```

```hint
When the loop ends, one list may still have items left, and they're already sorted. `merged.extend(a[i:])` and `merged.extend(b[j:])` append the leftovers.
```
:::
