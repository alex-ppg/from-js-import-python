---
title: Tuples & Destructuring
part: Collections
summary: Immutable tuples, the trailing-comma trap, and destructuring with stars, nesting and zip(*rows).
minutes: 30
---

A tuple is a list that can't change: an ordered, fixed-length, immutable sequence. TypeScript has tuple *types* like `[string, number]` that vanish at runtime. Python's tuple is a real type that enforces its immutability, and because it can't change it can be **hashed**, so it works as a dict key or a set member. Its constant companion is **unpacking**, Python's array destructuring. It's stricter than JavaScript's, and it turns up everywhere: swaps, loops, multiple return values, function calls.

One mental-model shift up front: **the comma makes the tuple**. The parentheses are usually just there for readability.

## Tuples: fixed and immutable

:::compare
```js
const point = [3, 4];                // TS: [number, number]
const frozen = Object.freeze([3, 4]);

point[0];                            // 3
point.length;                        // 2
point.slice(1);                      // [4]
frozen[0] = 99;                      // ignored, or TypeError in strict mode
frozen.push(5);                      // TypeError
```
```python
point = (3, 4)
frozen = (3, 4)                      # immutable already

point[0]                             # 3
len(point)                           # 2
point[1:]                            # (4,)
frozen[0] = 99                       # TypeError
frozen.append(5)                     # AttributeError: no append
```
:::

Everything that *reads* a list works on a tuple: indexing, negative indices, slicing (which returns a tuple), `len`, `in`, iteration, and `+` or `*` to build new tuples. Everything that *writes* is missing. There's no `append`, `pop`, `sort` or item assignment, and the only two methods are `count` and `index`.

```python run
point = (3, 4)
print(point[-1], point[::-1], len(point))
print(point + (5,), point * 2)
print(sorted((3, 1, 2)))            # sorted() always returns a list
print(tuple([1, 2]), tuple("abc"))  # tuple(iterable), like list()
```

:::gotcha Immutable is shallow
A tuple fixes *which objects* it holds, not what happens inside them, exactly like `Object.freeze`. A list stored in a tuple is still a perfectly mutable list. (It also makes that tuple unhashable, as you'll see below.)
:::

```python run raises
order = ("ord-17", ["apple", "kiwi"])
order[1].append("mango")      # the list inside is still a list
print(order)
order[1] = []                 # TypeError: the tuple's slots are fixed
```

:::deep `t[1] += [x]` raises *and* succeeds
With the tuple above, `order[1] += ["fig"]` raises `TypeError`, yet the list grows anyway. Augmented assignment on a list first extends it in place (which works), then stores the result back into `order[1]` (which fails). It's a famous corner of the language. Call `order[1].extend(...)` and the surprise goes away.
:::

### The comma makes the tuple

:::compare
```js
const one = [1];
const empty = [];
const grouped = (1 + 2) * 3;          // parentheses group
const pair = [1, 2];
```
```python
one = (1,)                            # or just: one = 1,
empty = ()
grouped = (1 + 2) * 3                 # parentheses group
pair = 1, 2                           # parentheses optional
```
:::

Parentheses only group. `(1)` is the integer `1`, and it's the trailing comma that turns `(1,)` into a one-element tuple. The empty tuple `()` is the only tuple without a comma. You'll still write parentheses most of the time, and they're required where a bare comma would mean something else: `f((1, 2))` passes one tuple, while `f(1, 2)` passes two arguments.

:::gotcha A stray comma makes a tuple
End a line with a comma out of habit, as in `total = price * qty,`, and you've written a valid statement that binds `total` to the one-element tuple `(price * qty,)`. Nothing fails on that line. The error, usually a `TypeError`, arrives later and far from the cause.
:::

:::quiz output
What does this print?

```python
sizes = ("small")
print(len(sizes))
```

- [ ] `1`
- [x] `5`
- [ ] `TypeError`

Without a trailing comma, `("small")` is just the string `"small"` in parentheses, and `len` counts its five characters. `("small",)` is a one-element tuple.
:::

## Tuple or list?

| | `list` | `tuple` |
| --- | --- | --- |
| Mutable | yes | no |
| Typical contents | many items of the same kind | a few fields of different kinds |
| Length | changes over time | fixed by what it represents |
| Hashable (dict key, set member) | no | yes, if its items are |
| TypeScript analogue | `T[]` | `[string, number]` |

The rule of thumb Python developers use: a list is a **collection** (`[order1, order2, ...]`, any length, all the same kind of thing) and a tuple is a **record** (`("Ada", 36)`, a fixed shape where each position means something). That's why functions return tuples, `dict.items()` yields `(key, value)` tuples, and a list of tuples is the default shape for rows of data.

If you're tempted to `append` to it or sort it, it's a list. If the positions have names in your head, it's a tuple, and once there are more than two or three of them it wants to be a NamedTuple (at the end of this lesson) or a dataclass.

### Hashable, so tuples can be keys

:::compare
```js
const cells = new Map();
cells.set("B,1", "Score");            // build a string key by hand
cells.get(["B", 1].join(","));        // "Score"

const origin = new Map([[[0, 0], "origin"]]);
origin.get([0, 0]);                   // undefined: arrays key by identity
```
```python
cells = {}
cells[("B", 1)] = "Score"             # the tuple is the key
cells[("B", 1)]                       # "Score"

origin = {(0, 0): "origin"}
origin[(0, 0)]                        # "origin": tuples key by value
```
:::

Because a tuple can't change, Python can hash it, and anything hashable can be a dict key or a set member. Two tuples with equal contents are the same key. A JS `Map` keys arrays by identity, which is why everyone ends up building `"x,y"` strings. In Python the tuple *is* the composite key, and you can even drop the parentheses inside brackets: `cells["B", 1]`. [Dicts](lesson:dicts) covers keys in depth.

Hashability is all or nothing: a tuple is hashable only if everything inside it is.

```python run raises
cells = {("A", 1): "Name", ("B", 1): "Score"}
print(cells["B", 1])                 # same as cells[("B", 1)]
print(("A", 1) in cells)

visited = {(0, 0), (0, 1)}           # a set of coordinates
print((0, 1) in visited)

cells[("A", [1, 2])] = "?"           # a list inside: unhashable
```

## Unpacking: destructuring without brackets

:::compare
```js
const [x, y] = [3, 4];
const [first, , third] = ["a", "b", "c"];
let a = 1, b = 2;
[a, b] = [b, a];                      // swap
const [head, ...tail] = [1, 2, 3, 4];
const [name, [lat, lon]] = ["Lisbon", [38.7, -9.1]];
```
```python
x, y = (3, 4)
first, _, third = ["a", "b", "c"]
a, b = 1, 2
a, b = b, a                           # swap
head, *tail = [1, 2, 3, 4]
name, (lat, lon) = ("Lisbon", (38.7, -9.1))
```
:::

Any assignment target can be a comma-separated pattern, with no brackets and no `const`. The right-hand side can be any iterable: a tuple, a list, a string, a generator, a `range`. The swap works because the right side is evaluated completely before anything is assigned. Patterns nest to any depth, mirroring the shape of the data.

`_` is the conventional name for "I don't need this one". It isn't syntax, just an ordinary variable, so it really does get assigned (and holds whatever was assigned to it last).

:::pythonic Unpack instead of indexing
`host, port = address` reads better than `host = address[0]` and `port = address[1]`, and it checks the shape for free: a three-element `address` raises instead of silently dropping a field. Python reviewers will suggest unpacking whenever you index a fixed-shape tuple with constant positions.
:::

### Star unpacking: a rest element anywhere

:::compare
```js
const [head, ...tail] = [1, 2, 3, 4];  // rest must come last
const init = xs.slice(0, -1);
const last = xs.at(-1);
const [cmd, ...args] = "git commit -m wip".split(" ");
```
```python
head, *tail = [1, 2, 3, 4]
*init, last = xs                       # the star can go first...
first, *middle, last = xs              # ...or in the middle
cmd, *args = "git commit -m wip".split()
```
:::

JavaScript's rest element has to be last. Python's starred target can sit anywhere in the pattern, as long as there's only one. It collects whatever is left over, possibly nothing, and it is **always a list**, whatever type you unpacked.

```python run
head, *tail = (1, 2, 3)            # unpacking a tuple...
print(head, tail)                  # ...still gives a list
first, *middle, last = "python"
print(first, middle, last)
*init, last = [42]
print(init, last)                  # the star can collect nothing
cmd, *args = "git commit -m wip".split()
print(cmd, args)
```

:::quiz output
What does this print?

```python
first, *rest = "hi"
print(first, rest)
```

- [ ] `h i`
- [x] `h ['i']`
- [ ] `h ('i',)`
- [ ] `ValueError`

A string unpacks into its characters, and the starred name is always a list, even when only one item (or none) is left over.
:::

## Unpacking is strict

:::compare
```js
const [a, b] = [1];               // b is undefined
const [c, d] = [1, 2, 3];         // the 3 is ignored
const [e = 0] = [];               // default value
const [f, g] = 5;                 // TypeError: 5 is not iterable
```
```python
a, b = [1]                        # ValueError: not enough values
c, d = [1, 2, 3]                  # ValueError: too many values
e = xs[0] if xs else 0            # no defaults in patterns
f, g = 5                          # TypeError: cannot unpack int
```
:::

A pattern is a claim about the shape of the data, and a wrong claim is an error, not an `undefined`. That's usually what you want: a CSV row with a missing column fails on the line that unpacks it, instead of three functions later. When the length genuinely varies, say so with a star (`first, *rest = row` accepts one or more items) or use slicing, which clamps instead of raising.

```python run raises
row = "Ada,Lovelace,1815".split(",")
first, last, born = row                  # exactly three fields: fine
print(first, born)

name, email = "Grace Hopper".split(",")  # one field, two names
```

:::tip Make the shape fixed, then unpack
`str.partition(sep)` always returns exactly three parts, so unpacking it never fails: `key, _, value = "debug".partition("=")` gives `"debug"` and an empty `value` when there's no `=`. A star handles "at least one": `host, *port = address.split(":")`.
:::

:::quiz output
What does this print?

```python
point = {"x": 3, "y": 4}
x, y = point
print(x)
```

- [ ] `3`
- [x] `x`
- [ ] `('x', 3)`
- [ ] `ValueError`

Iterating a dict yields its keys, so unpacking one does too: `x` is the string `"x"`. Unpack `point.values()` for the values, or better, read them by key, which is the next section. (Sets unpack too, but in no promised order, so don't.)
:::

## No object destructuring

:::compare
```js
const { name, age } = user;
const { name: userName } = user;          // rename
const { role = "guest" } = user;          // default
const { password, ...safe } = user;       // rest
```
```python
name, age = user["name"], user["age"]
user_name = user["name"]
role = user.get("role", "guest")
safe = {k: v for k, v in user.items() if k != "password"}
```
:::

Python has no `{ ... }` pattern for dicts or objects in assignments. The idiomatic replacement is plain and explicit: read the keys you need (or the attributes, `user.name`, for objects). Two tools help when that gets repetitive.

`operator.itemgetter("name", "age")` builds a function that returns a tuple of those values, ready to unpack, and it doubles as a `key=` function for [sorting](lesson:lists#sorting-and-reversing). `operator.attrgetter` does the same for attributes. And `match` statements have **mapping patterns** that destructure and check the shape at the same time. They get a full lesson in [Structural Pattern Matching](lesson:pattern-matching); here's a taste:

```python run
from operator import itemgetter

user = {"name": "Ada", "age": 36, "role": "admin", "password": "hunter2"}

name, age = itemgetter("name", "age")(user)
print(name, age)

match user:
    case {"name": name, "role": "admin", **rest}:
        print(f"admin {name}, other fields: {sorted(rest)}")
    case {"name": name}:
        print(f"regular user {name}")
```

:::note Options objects become keyword arguments
The JS habit `function connect({ host, retries = 3 })` becomes keyword arguments in Python, `def connect(*, host, retries=3)`, called as `connect(host="db")`. You can spread a dict into them with `connect(**options)`. That's all in [Functions](lesson:functions).
:::

## Unpacking in for loops

:::compare
```js
for (const [name, score] of Object.entries(scores)) {
  console.log(name, score);
}
for (const [i, [name, score]] of Object.entries(scores).entries()) {
  console.log(i, name, score);
}
for (const [[x, y], label] of points) {}
```
```python
for name, score in scores.items():
    print(name, score)

for i, (name, score) in enumerate(scores.items()):
    print(i, name, score)


for (x, y), label in points: ...
```
:::

A `for` target is an assignment target, so every pattern from the previous sections works there too, including nesting and stars. The workhorse is `for key, value in d.items()`. When you combine it with `enumerate` or `zip`, which yield tuples of their own, parenthesize the inner pair. [Control Flow](lesson:control-flow) covers `enumerate` and `zip` themselves.

```python run
scores = {"Ada": 92, "Linus": 87, "Grace": 95}
for n, (name, score) in enumerate(scores.items(), start=1):
    print(f"{n}. {name:<6} {score}")

segments = [((0, 0), (3, 4)), ((1, 1), (4, 5))]
for (x1, y1), (x2, y2) in segments:
    print(f"dx={x2 - x1} dy={y2 - y1}")

print([f"{name}={score}" for name, score in scores.items()])
```

:::gotcha No destructuring in parameters
JavaScript lets you destructure right in a parameter list, as in `pairs.map(([name, score]) => ...)`. Python 3 doesn't: `lambda (name, score): ...` and `def f((a, b)):` are `SyntaxError`s. Unpack in a comprehension's `for` clause instead (`[f"{name}: {score}" for name, score in pairs]`), unpack on the first line of a `def`, or index inside a key function (`key=lambda pair: pair[1]`, or `itemgetter(1)`).
:::

:::quiz output
What does this print?

```python
data = [(1, (2, 3)), (4, (5, 6))]
print(sum(b for a, (b, c) in data))
```

- [ ] `21`
- [ ] `9`
- [x] `7`
- [ ] `ValueError`

Each item unpacks as `a, (b, c)`, so `b` is `2` and then `5`. Patterns work in comprehensions and generator expressions just as they do in `for` loops.
:::

## Returning multiple values

:::compare
```js
function minMax(nums) {
  return [Math.min(...nums), Math.max(...nums)];
}
const [lo, hi] = minMax([3, 1, 4]);
const result = minMax([3, 1, 4]);         // an array
```
```python
def min_max(nums):
    return min(nums), max(nums)


lo, hi = min_max([3, 1, 4])
result = min_max([3, 1, 4])               # a tuple: (1, 4)
```
:::

`return a, b` returns one value, a tuple, and the caller unpacks it. It's the JS "return an array" trick minus the brackets, and the standard library does it everywhere: `divmod(200, 60)` returns `(3, 20)`, `str.partition` returns three parts, and `dict.items()` yields pairs.

```python run
def split_name(full_name):
    first, _, last = full_name.partition(" ")
    return first, last

first, last = split_name("Grace Hopper")
print(first, last)

minutes, seconds = divmod(200, 60)
print(f"{minutes}m {seconds}s")

print(split_name("Ada"))            # one value: a tuple
```

:::tip Past two or three values, give them names
Positional results make every caller remember what slot 2 means. Once a function returns more than two or three values, or the tuple travels far from where it was made, return a NamedTuple or a dataclass so callers can write `stats.mean` instead of `stats[2]`.
:::

## Spreading with `*`

:::compare
```js
const merged = [...a, ...b];
const withEnds = [0, ...a, 9];
const letters = [..."abc"];
const unique = new Set([...a, ...b]);
console.log(...names);
fn(...args);
```
```python
merged = [*a, *b]
with_ends = (0, *a, 9)               # a tuple, this time
letters = [*"abc"]
unique = {*a, *b}                    # a set
print(*names)
fn(*args)
```
:::

A `*` inside a list, tuple or set display, or in a function call, is Python's spread operator. It accepts any iterable (lists, tuples, strings, ranges, generators, dict keys), and you can use as many as you like in one expression. The dict version is `**`, which spreads key/value pairs into a dict literal (`{**defaults, **overrides}`, in [Dicts](lesson:dicts)) or into keyword arguments (in [Functions](lesson:functions)).

```python run
evens = range(0, 10, 2)
odds = (1, 3, 5)
print([*evens, *odds])
print(*odds)                      # three separate arguments
print(*odds, sep=" < ")
print(*"spread", sep="|")

bounds = (2, 10, 3)
print(list(range(*bounds)))       # range(2, 10, 3)
```

:::pythonic `print(*items, sep=...)` beats a join for output
`print(*rows, sep="\n")` prints one item per line, and unlike `"\n".join(rows)` it converts each item with `str()`, so the items don't have to be strings.
:::

### Transpose with `zip(*rows)`

:::compare
```js
const rows = [[1, 2, 3], [4, 5, 6]];
const cols = rows[0].map((_, i) => rows.map((r) => r[i]));
// [[1, 4], [2, 5], [3, 6]]

const pairs = [["Ada", 92], ["Linus", 87]];
const names = pairs.map(([n]) => n);
const scores = pairs.map(([, s]) => s);
```
```python
rows = [[1, 2, 3], [4, 5, 6]]
cols = list(zip(*rows))
# [(1, 4), (2, 5), (3, 6)]

pairs = [("Ada", 92), ("Linus", 87)]
names, scores = zip(*pairs)
# names == ("Ada", "Linus"), scores == (92, 87)
```
:::

`zip(a, b, c)` yields the first items of each argument, then the second items, and so on. Spreading a list of rows into `zip` passes one argument per row, so it walks down the columns: a transpose in one call. Applied to a list of pairs, the same trick "unzips" them into separate sequences.

```python run raises
grid = [
    [1, 2, 3],
    [4, 5, 6],
    [7, 8, 9],
]
print([list(col) for col in zip(*grid)])   # lists instead of tuples

ragged = [[1, 2, 3], [4, 5]]
print(list(zip(*ragged)))                  # the 3 silently disappears
print(list(zip(*ragged, strict=True)))     # 3.10+: raise instead
```

:::gotcha Unzipping nothing
`names, scores = zip(*pairs)` raises `ValueError` when `pairs` is empty. `zip()` with no arguments yields nothing at all, not two empty tuples, so there's nothing to unpack. Guard it with `if pairs:`, or build the two sequences with comprehensions.
:::

## Comparing tuples

:::compare
```js
[1, 2] < [1, 3];          // true, but only because "1,2" < "1,3"
[10, 0] < [9, 0];         // true (!): "10,0" < "9,0" as strings
"3.10" > "3.9";           // false: string comparison
```
```python
(1, 2) < (1, 3)           # True: 1 == 1, then 2 < 3
(10, 0) < (9, 0)          # False: 10 > 9 decides it
"3.10" > "3.9"            # False: strings compare characters
```
:::

JavaScript compares arrays by converting them to strings. Python compares tuples (and lists) **lexicographically**: it compares the first items, moves on to the second items only if those are equal, and so on. The first difference decides, and if one tuple runs out first, the shorter one is smaller. It's dictionary order, for any comparable items.

That makes a tuple the answer whenever you need a multi-field ordering: sort keys like `key=lambda u: (u["last"], u["first"])` (see [Lists](lesson:lists#sorting-and-reversing)), version checks such as `sys.version_info >= (3, 12)`, and `max` or `min` over records.

```python run
import sys

print((1, 2, 3) < (1, 2, 4))     # decided by the last item
print((1, 2) < (1, 2, 0))        # a prefix is smaller
print(sys.version_info >= (3, 10))

releases = [(3, 9, 18), (3, 12, 1), (3, 10, 13)]
print(max(releases))
print(sorted(releases))
```

:::gotcha Same type, not just same items
`(1, 2) == [1, 2]` is `False`: a tuple never equals a list, even with identical contents. And ordering only fails when it actually reaches a mismatched pair: `(1, "a") < (2, 0)` is `True` (settled by `1 < 2`), but `(1, "a") < (1, 0)` raises `TypeError`.
:::

:::quiz output
What does this print?

```python
print(sorted([(2, "b"), (1, "z"), (2, "a")]))
```

- [x] `[(1, 'z'), (2, 'a'), (2, 'b')]`
- [ ] `[(1, 'z'), (2, 'b'), (2, 'a')]`
- [ ] `[(2, 'a'), (2, 'b'), (1, 'z')]`
- [ ] `TypeError`

The first items decide, so `(1, 'z')` comes first. The two tuples starting with `2` tie on the first item and are ordered by the second, `'a'` before `'b'`.
:::

## NamedTuple: a teaser

:::compare
```ts
type Point = { readonly x: number; readonly y: number };


const p: Point = { x: 3, y: 4 };
p.x;                                  // 3
const { x, y } = p;
const moved = { ...p, x: 10 };
```
```python
from typing import NamedTuple

class Point(NamedTuple):
    x: float
    y: float

p = Point(3, 4)
p.x                                   # 3
x, y = p                              # still a tuple
moved = p._replace(x=10)
```
:::

A `NamedTuple` is a tuple whose positions also have names. You get attribute access and a readable `repr`, and you keep everything a tuple does: immutability, indexing, unpacking, hashing and lexicographic comparison. It even compares equal to a plain tuple with the same items. It's the natural upgrade for a function that returns three values, and the standard library uses it too: `urllib.parse.urlparse()` returns one.

```python run
from typing import NamedTuple

class Point(NamedTuple):
    x: float
    y: float

p = Point(3, 4)
print(p, p.x, p[1])
print(p == (3, 4), {p: "here"})
print(p._replace(x=10), p._asdict())

from urllib.parse import urlparse
url = urlparse("https://example.com:8080/docs?page=2")
print(url.hostname, url.port, url.query)
```

Defaults, methods, and when to pick a NamedTuple over a dataclass or a dict are covered in [Dataclasses, NamedTuples & Enums](lesson:dataclasses-and-enums).

## Cheat sheet

| JavaScript | Python | Notes |
| --- | --- | --- |
| `[3, 4]` (TS `[number, number]`) | `(3, 4)` | immutable, hashable |
| `[x]` | `(x,)` | the comma makes the tuple |
| `Object.freeze([...xs])` | `tuple(xs)` | shallow, like `freeze` |
| `const [a, b] = xs` | `a, b = xs` | lengths must match |
| `[a, b] = [b, a]` | `a, b = b, a` | |
| `const [, b] = xs` | `_, b = xs` | `_` is an ordinary name |
| `const [h, ...t] = xs` | `h, *t = xs` | `t` is always a list |
| (no equivalent) | `*init, last = xs` | one star, anywhere |
| `const [a, [b, c]] = xs` | `a, (b, c) = xs` | |
| `const [a = 0] = xs` | `a = xs[0] if xs else 0` | no defaults in patterns |
| `const { a, b } = obj` | `a, b = d["a"], d["b"]` | or `itemgetter("a", "b")(d)` |
| `for (const [k, v] of Object.entries(o))` | `for k, v in d.items():` | |
| `return [a, b]` | `return a, b` | returns a tuple |
| `[...a, ...b]` | `[*a, *b]` | also `(*a, *b)` and `{*a, *b}` |
| `fn(...args)` | `fn(*args)` | |
| `console.log(...xs)` | `print(*xs)` | |
| `rows[0].map((_, i) => rows.map((r) => r[i]))` | `list(zip(*rows))` | `strict=True` for ragged rows |
| comparator chains with `\|\|` | tuple keys | lexicographic comparison |

## Challenges

:::challenge id=tup-head-tail title="Head and tail" difficulty=easy
Write `head_tail(items)` that returns a tuple `(first, rest)`: the first item, and a **list** of everything after it. For an empty sequence, return `(None, [])`.

Use star unpacking rather than indexing or slicing.

```text
head_tail([1, 2, 3])   ->  (1, [2, 3])
head_tail("abc")       ->  ("a", ["b", "c"])
head_tail(())          ->  (None, [])
```

```js
function headTail(items) {
  const [first = null, ...rest] = items;
  return [first, rest];
}
```

```python starter
def head_tail(items):
    ...
```

```python solution
def head_tail(items):
    if not items:
        return None, []
    first, *rest = items
    return first, rest
```

```python tests
@test("splits a list")
def _():
    eq(head_tail([1, 2, 3]), (1, [2, 3]))
    eq(head_tail(["only"]), ("only", []))

@test("works on any sequence, and rest is always a list")
def _():
    eq(head_tail("abc"), ("a", ["b", "c"]))
    eq(head_tail((7, 8)), (7, [8]))

@test("empty input gives (None, [])")
def _():
    eq(head_tail([]), (None, []))
    eq(head_tail(""), (None, []))

@test("a falsy first item is still returned")
def _():
    eq(head_tail([0, 1]), (0, [1]))

@test("returns a tuple")
def _():
    check(type(head_tail([1, 2])) is tuple, "return first, rest (a tuple), not a list")

@test("uses star unpacking")
def _():
    requires_syntax(ast.Starred, "unpack with a starred target: first, *rest = items")
    forbids_syntax(ast.Slice, "no slicing needed: let the star collect the rest")
```

```hint
`first, *rest = items` puts everything after the first item into a list called `rest`.
```

```hint
Unpacking an empty sequence raises `ValueError`, so check `if not items:` first.
```
:::

:::challenge id=tup-rotate-grid title="Rotate a grid" difficulty=medium
Write `rotate_clockwise(grid)` that returns a **new** grid, a list of lists, turned 90° clockwise. The grid is a list of rows and may be rectangular. If the rows don't all have the same length, raise `ValueError`.

```text
rotate_clockwise([[1, 2, 3],     ->  [[4, 1],
                  [4, 5, 6]])         [5, 2],
                                      [6, 3]]
```

No index loops: a slice and `zip(*...)` can do the whole job.

```js
function rotateClockwise(grid) {
  if (grid.some((row) => row.length !== grid[0].length)) {
    throw new RangeError("ragged grid");
  }
  const rows = grid.length;
  const cols = rows ? grid[0].length : 0;
  return Array.from({ length: cols }, (_, c) =>
    Array.from({ length: rows }, (_, r) => grid[rows - 1 - r][c]),
  );
}
```

```python starter
def rotate_clockwise(grid):
    ...
```

```python solution
def rotate_clockwise(grid):
    # Reverse the rows, then read off the columns: the bottom row becomes the first column.
    return [list(row) for row in zip(*grid[::-1], strict=True)]
```

```python tests
@test("rotates a square")
def _():
    eq(rotate_clockwise([[1, 2], [3, 4]]), [[3, 1], [4, 2]])

@test("rotates a rectangle")
def _():
    eq(rotate_clockwise([[1, 2, 3], [4, 5, 6]]), [[4, 1], [5, 2], [6, 3]])

@test("a single row becomes a column")
def _():
    eq(rotate_clockwise([["a", "b", "c"]]), [["a"], ["b"], ["c"]])

@test("four rotations give back the original")
def _():
    grid = [[1, 2, 3], [4, 5, 6]]
    result = grid
    for _ in range(4):
        result = rotate_clockwise(result)
    eq(result, grid)

@test("returns lists, not tuples")
def _():
    check(all(type(row) is list for row in rotate_clockwise([[1, 2], [3, 4]])), "convert each row with list(...)")

@test("an empty grid gives []")
def _():
    eq(rotate_clockwise([]), [])

@test("ragged rows raise ValueError")
def _():
    raises(ValueError, rotate_clockwise, [[1, 2, 3], [4, 5]])
    raises(ValueError, rotate_clockwise, [[1], [2, 3]])

@test("doesn't modify the input")
def _():
    grid = [[1, 2], [3, 4]]
    rotate_clockwise(grid)
    eq(grid, [[1, 2], [3, 4]], "the input grid was modified")

@test("no index loops")
def _():
    requires_call("zip", "spread the rows into zip(*...)")
    forbids_call("range", "no index loops needed: zip walks the columns for you")
```

```hint
`zip(*grid)` transposes: its first tuple is the first column, read from top to bottom.
```

```hint
A clockwise turn is a transpose of the grid with its rows in reverse order, so the bottom row ends up as the first column. `grid[::-1]` reverses the rows without touching the input.
```

```hint
`zip(..., strict=True)` (3.10+) raises `ValueError` when the rows have different lengths.
```
:::

:::challenge id=tup-merge-intervals title="Merge intervals" difficulty=hard
Write `merge_intervals(intervals)` that takes a list of `(start, end)` tuples and returns a new list in which overlapping intervals are merged, sorted by start. Intervals that merely touch, like `(1, 3)` and `(3, 5)`, count as overlapping.

```text
merge_intervals([(8, 10), (1, 3), (2, 6), (9, 12)])  ->  [(1, 6), (8, 12)]
merge_intervals([(1, 3), (3, 5)])                    ->  [(1, 5)]
merge_intervals([(1, 10), (2, 3)])                   ->  [(1, 10)]
```

Lean on tuples: `sorted()` already orders them by start (then by end), and unpacking reads better than `interval[0]`.

```js
function mergeIntervals(intervals) {
  const sorted = intervals.toSorted((a, b) => a[0] - b[0] || a[1] - b[1]);
  const merged = [];
  for (const [start, end] of sorted) {
    const last = merged.at(-1);
    if (last && start <= last[1]) last[1] = Math.max(last[1], end);
    else merged.push([start, end]);
  }
  return merged;
}
```

```python starter
def merge_intervals(intervals):
    ...
```

```python solution
def merge_intervals(intervals):
    merged = []
    for start, end in sorted(intervals):
        if merged and start <= merged[-1][1]:
            last_start, last_end = merged[-1]
            merged[-1] = (last_start, max(last_end, end))  # replace: tuples are immutable
        else:
            merged.append((start, end))
    return merged
```

```python tests
@test("merges overlapping intervals")
def _():
    eq(merge_intervals([(1, 3), (2, 6), (8, 10), (9, 12)]), [(1, 6), (8, 12)])

@test("sorts unsorted input by start")
def _():
    eq(merge_intervals([(8, 10), (1, 3), (2, 6)]), [(1, 6), (8, 10)])

@test("touching intervals merge")
def _():
    eq(merge_intervals([(1, 3), (3, 5)]), [(1, 5)])

@test("contained intervals disappear into their container")
def _():
    eq(merge_intervals([(1, 10), (2, 3), (4, 5)]), [(1, 10)])

@test("disjoint intervals stay separate")
def _():
    eq(merge_intervals([(5, 6), (1, 2)]), [(1, 2), (5, 6)])

@test("empty input gives an empty list")
def _():
    eq(merge_intervals([]), [])

@test("returns tuples")
def _():
    result = merge_intervals([(1, 4), (2, 3), (6, 7)])
    check(all(type(i) is tuple for i in result), "each merged interval should be a (start, end) tuple")

@test("doesn't change the input list")
def _():
    intervals = [(3, 4), (1, 2), (2, 3)]
    merge_intervals(intervals)
    eq(intervals, [(3, 4), (1, 2), (2, 3)], "the input was modified; sort a copy with sorted()")
```

```hint
`sorted(intervals)` sorts the tuples by start, breaking ties by end, because tuples compare item by item. It also leaves the input alone.
```

```hint
Walk the sorted intervals with `for start, end in ...` and build a `merged` list. If `start` is at most the end of the last merged interval, the two overlap.
```

```hint
A tuple can't be changed in place, so replace the last one instead: `merged[-1] = (last_start, max(last_end, end))`.
```
:::
