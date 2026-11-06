---
title: Arrays → Lists
part: Collections
summary: Indexing, slicing, and every Array method you reach for, translated to Python's list.
minutes: 35
---

A Python `list` is the closest thing to a JavaScript array: ordered, mutable, growable, and happy to hold mixed types. Most of your instincts transfer. The differences are small but they bite. Methods that mutate return `None`, so you can't chain them. Reading past the end raises an error instead of handing you `undefined`. And Python has a slicing syntax that replaces half a dozen Array methods.

The functional trio (`map`, `filter`, `reduce`) gets its own lesson, [map, filter, reduce → Comprehensions](lesson:map-filter-reduce). This one covers everything else you do with arrays.

## Creating lists

:::compare
```js
const empty = [];
const nums = [1, 2, 3];
const mixed = [1, "two", [3], null];

const squares = Array.from({ length: 5 }, (_, i) => i * i);
const zeros = new Array(3).fill(0);
const letters = [..."abc"];
const fromSet = Array.from(new Set([1, 1, 2]));
```
```python
empty = []
nums = [1, 2, 3]
mixed = [1, "two", [3], None]

squares = [i * i for i in range(5)]
zeros = [0] * 3
letters = list("abc")
from_set = list({1, 1, 2})
```
:::

`list(iterable)` is the Python version of `Array.from(iterable)`: it accepts anything you can loop over, including strings, sets, dict keys, generators and `range` objects. The `[i * i for i in range(5)]` form is a **list comprehension**. You'll use it constantly, and the next lesson covers it in depth.

```python run
squares = [i * i for i in range(5)]
letters = list("abc")
print(squares)
print(letters)
print(list(range(2, 10, 3)))   # range(start, stop, step), stop is exclusive
```

:::gotcha `[[0] * 3] * 3` shares one row
`*` repeats *references*, just like `new Array(3).fill([])` in JavaScript hands every slot the same array. For a grid, build each row separately with a comprehension.
:::

```python run
grid = [[0] * 3] * 3       # three references to ONE row
grid[0][0] = 99
print(grid)

grid = [[0] * 3 for _ in range(3)]   # three independent rows
grid[0][0] = 99
print(grid)
```

## Length, indexing and negative indices

:::compare
```js
const xs = ["a", "b", "c", "d"];

xs.length;              // 4
xs[0];                  // "a"
xs[xs.length - 1];      // "d"
xs.at(-1);              // "d"
xs.at(-2);              // "c"
xs[10];                 // undefined
```
```python
xs = ["a", "b", "c", "d"]

len(xs)                 # 4
xs[0]                   # "a"
xs[len(xs) - 1]         # "d"  (nobody writes this)
xs[-1]                  # "d"
xs[-2]                  # "c"
xs[10]                  # IndexError!
```
:::

There's no `.length` property. `len()` is a built-in function that works on anything with a size: strings, dicts, sets, tuples, ranges, and your own classes once they define `__len__` (see [Dunder Methods](lesson:dunder-methods)). Negative indices count from the end, the way `.at()` does in JS, and they work with plain square brackets.

:::gotcha Out of range is an error, not `undefined`
`xs[10]` raises `IndexError`. Python fails loudly where JavaScript returns `undefined` and lets the bug wander off. If "no element" is a valid outcome, check first: `xs[-1] if xs else None`. An empty list is falsy, so `if xs:` means "if xs is non-empty".
:::

```python run raises
xs = ["a", "b", "c"]
print(xs[-1])
print(xs[-1] if xs else None)
print(xs[3])
```

## Slicing: `slice()` with superpowers

Slicing is the most useful syntax JavaScript doesn't have. `xs[start:stop:step]` returns a **new list**. Every part is optional, `stop` is exclusive (as in `slice()`), negative numbers count from the end, and out-of-range bounds are clamped rather than raising.

:::compare
```js
const xs = [0, 1, 2, 3, 4, 5];

xs.slice(1, 4);          // [1, 2, 3]
xs.slice(2);             // [2, 3, 4, 5]
xs.slice(0, 2);          // [0, 1]
xs.slice(-2);            // [4, 5]
xs.slice();              // shallow copy
[...xs].reverse();       // [5, 4, 3, 2, 1, 0]
xs.filter((_, i) => i % 2 === 0); // [0, 2, 4]
```
```python
xs = [0, 1, 2, 3, 4, 5]

xs[1:4]                  # [1, 2, 3]
xs[2:]                   # [2, 3, 4, 5]
xs[:2]                   # [0, 1]
xs[-2:]                  # [4, 5]
xs[:]                    # shallow copy
xs[::-1]                 # [5, 4, 3, 2, 1, 0]
xs[::2]                  # [0, 2, 4]
```
:::

```python run
xs = [0, 1, 2, 3, 4, 5]
print(xs[1:-1])      # drop the first and last
print(xs[::-2])      # every second item, backwards
print(xs[4:100])     # out-of-range stops are clamped
print(xs[5:1])       # start after stop -> empty
```

:::quiz output
What does this print?

```python
nums = [10, 20, 30, 40, 50, 60]
print(nums[1:-1:2])
```

- [ ] `[20, 40, 60]`
- [x] `[20, 40]`
- [ ] `[10, 30, 50]`
- [ ] `[20, 30, 40, 50]`

Start at index 1 (`20`), stop *before* index -1 (`60`), take every second item: `20`, then `40`.
:::

:::pythonic One syntax for every sequence
Slicing works the same on strings and tuples. `"hello"[::-1]` reverses a string, and `"hello"[1:3]` is `"el"`. In JS that's `[..."hello"].reverse().join("")` and `"hello".slice(1, 3)`.
:::

Slices can also appear on the left of `=`, which replaces that region in place. That's how Python handles `splice`.

```python run
xs = [0, 1, 2, 3, 4, 5]
xs[1:3] = ["a", "b", "c"]   # replace two items with three
print(xs)
xs[:0] = ["start"]          # insert at the front
print(xs)
```

:::deep Slices are objects
`xs[1:5:2]` is sugar for `xs[slice(1, 5, 2)]`. You can store a `slice` in a variable and reuse it (`HEADER = slice(0, 3)`, then `row[HEADER]`). Your own classes receive it in `__getitem__`, which is how libraries like NumPy implement fancy indexing.
:::

## Adding and removing: push, pop, shift, unshift, splice

:::compare
```js
const xs = [1, 2, 3];

xs.push(4);                 // [1, 2, 3, 4]
xs.push(5, 6);              // [1, 2, 3, 4, 5, 6]
xs.pop();                   // returns 6
xs.shift();                 // returns 1
xs.unshift(0);              // [0, 2, 3, 4, 5]
xs.splice(1, 2);            // removes 2 items at index 1
xs.splice(1, 0, "a", "b");  // inserts at index 1
xs.length = 0;              // clear
```
```python
xs = [1, 2, 3]

xs.append(4)                # [1, 2, 3, 4]
xs.extend([5, 6])           # [1, 2, 3, 4, 5, 6]
xs.pop()                    # returns 6
xs.pop(0)                   # returns 1
xs.insert(0, 0)             # [0, 2, 3, 4, 5]
del xs[1:3]                 # removes 2 items at index 1
xs[1:1] = ["a", "b"]        # inserts at index 1
xs.clear()                  # clear
```
:::

A few extra list methods have no direct JS equivalent:

- `xs.remove(value)` deletes the **first item equal to** `value` (and raises `ValueError` if there isn't one).
- `del xs[i]` deletes by index. `del` is a statement, not a method, and it also works on slices and dict keys.
- `xs += [7, 8]` extends in place, same as `extend`.

:::gotcha Mutating methods return `None`
`append`, `extend`, `insert`, `sort`, `reverse` and `clear` all modify the list and return `None`. This is deliberate: in Python, a method either changes an object or returns a new one, never both. So `ys = xs.append(1)` sets `ys` to `None`, and `xs.sort().reverse()` raises `AttributeError`.
:::

:::quiz output
What does this print?

```python
nums = [3, 1, 2]
result = nums.append(4)
print(result)
```

- [ ] `[3, 1, 2, 4]`
- [x] `None`
- [ ] `4`
- [ ] `[3, 1, 2]`

`append` mutates `nums` and returns `None`. If you want a new list instead, use `nums + [4]` or `[*nums, 4]`.
:::

:::gotcha `append` vs `extend`
`xs.append([5, 6])` adds **one** item, a nested list. `xs.extend([5, 6])` adds each element. JS's `push(...items)` corresponds to `extend`.
:::

:::tip Need a queue? Use `deque`
`xs.pop(0)` and `xs.insert(0, x)` are O(n) because every element shifts, the same as `shift`/`unshift` on a large JS array. For queues, use `collections.deque`, which has O(1) `append`, `appendleft`, `pop` and `popleft`.
:::

```python run
from collections import deque

queue = deque(["a", "b"])
queue.append("c")          # enqueue at the back
queue.appendleft("z")      # or at the front
print(queue.popleft())     # dequeue from the front -> "z"
print(queue)

recent = deque(maxlen=3)   # a bounded buffer: old items fall off
for n in range(6):
    recent.append(n)
print(list(recent))
```

## Searching: includes, indexOf, count

:::compare
```js
const xs = ["a", "b", "c", "b"];

xs.includes("b");            // true
!xs.includes("z");           // true
xs.indexOf("b");             // 1
xs.indexOf("z");             // -1
xs.lastIndexOf("b");         // 3
xs.filter(x => x === "b").length; // 2
```
```python
xs = ["a", "b", "c", "b"]

"b" in xs                    # True
"z" not in xs                # True
xs.index("b")                # 1
xs.index("z")                # ValueError!
len(xs) - 1 - xs[::-1].index("b")  # 3
xs.count("b")                # 2
```
:::

`in` and `not in` are operators, and they read like English. They work on every container: substrings in strings, keys in dicts, members of sets.

:::gotcha `index()` raises instead of returning -1
There's no `-1` sentinel. Check membership first: `xs.index(v) if v in xs else -1`. Or reach for `next(...)` with a default, covered with `find` in [the next lesson](lesson:map-filter-reduce).
:::

:::note `in` compares by value
`in`, `index` and `count` use `==`, and `==` compares lists by content. So `[1, 2] in [[1, 2], [3]]` is `True`. In JS, `[[1, 2]].includes([1, 2])` is `false` because arrays compare by reference. See [Truthiness & Equality](lesson:truthiness-and-equality).
:::

```python run
pairs = [[1, 2], [3, 4]]
print([1, 2] in pairs)          # value equality
print([1, 2] == [1, 2])         # True: same contents
print([1, 2] is [1, 2])         # False: two different objects
```

## Combining and spreading

:::compare
```js
const a = [1, 2];
const b = [3, 4];

a.concat(b);           // [1, 2, 3, 4]
[...a, ...b];          // [1, 2, 3, 4]
[0, ...a, 9];          // [0, 1, 2, 9]
Array(3).fill("ab");   // ["ab", "ab", "ab"]
Math.max(...a);        // 2
fn(...a);              // spread into arguments
```
```python
a = [1, 2]
b = [3, 4]

a + b                  # [1, 2, 3, 4]
[*a, *b]               # [1, 2, 3, 4]
[0, *a, 9]             # [0, 1, 2, 9]
["ab"] * 3             # ["ab", "ab", "ab"]
max(a)                 # 2: max() takes an iterable
fn(*a)                 # spread into arguments
```
:::

`*` inside a list literal or a call is Python's spread operator. `max`, `min` and `sum` take the iterable directly, so there's no spreading into them at all.

:::pythonic Destructure with a star
The same star works on the left-hand side: `first, *rest = xs` and `*init, last = xs`. That's array destructuring with a rest element, and you can put the star in the middle too. It's covered in [Tuples & Destructuring](lesson:tuples-and-unpacking).
:::

```python run
first, *rest = [10, 20, 30, 40]
*init, last = [10, 20, 30, 40]
print(first, rest)
print(init, last)
```

## Sorting and reversing

:::compare
```js
const xs = [10, 9, 1];
xs.sort();                       // [1, 10, 9]  (!) strings by default
xs.sort((a, b) => a - b);        // [1, 9, 10]
const ys = xs.toSorted((a, b) => b - a); // new array, descending

users.sort((a, b) => a.age - b.age);
users.sort((a, b) =>
  a.last.localeCompare(b.last) || a.first.localeCompare(b.first));

xs.reverse();                    // in place
const rev = xs.toReversed();     // new array
```
```python
xs = [10, 9, 1]
xs.sort()                        # [1, 9, 10]  compares numbers as numbers
ys = sorted(xs, reverse=True)    # new list, descending

users.sort(key=lambda u: u["age"])
users.sort(key=lambda u: (u["last"], u["first"]))

xs.reverse()                     # in place
rev = xs[::-1]                   # new list (or list(reversed(xs)))
```
:::

Three things to notice:

1. **Python compares values natively.** Numbers sort as numbers and strings sort by code point. There's no stringly-typed default to work around.
2. **`key=` replaces the comparator.** You give a function that turns each element into the thing to sort by, and Python computes it once per element. It's shorter, faster, and harder to get wrong than `(a, b) => ...`.
3. **`sorted()` vs `.sort()`.** `sorted(iterable)` returns a new list from *any* iterable (like `toSorted`). `.sort()` sorts a list in place and returns `None`. Both are stable.

To sort by several fields, return a tuple from `key`. Tuples compare item by item, which gives you the `||` chain for free. Negating a number flips one field to descending:

```python run
players = [
    {"name": "Ada", "score": 92},
    {"name": "Linus", "score": 87},
    {"name": "Grace", "score": 92},
    {"name": "Guido", "score": 75},
]

by_score = sorted(players, key=lambda p: (-p["score"], p["name"]))
for p in by_score:
    print(f"{p['score']:>3}  {p['name']}")
```

:::quiz output
What does this print?

```python
print(sorted(["banana", "Cherry", "apple"]))
```

- [ ] `['apple', 'banana', 'Cherry']`
- [x] `['Cherry', 'apple', 'banana']`
- [ ] `['banana', 'Cherry', 'apple']`

Strings sort by code point, and uppercase letters come before lowercase ones. For case-insensitive ordering use `sorted(words, key=str.lower)`. You can pass a method as the key function directly.
:::

:::pythonic Key functions you don't have to write
`key=str.lower`, `key=len` and `key=abs` pass existing functions directly. For dicts and objects, `operator.itemgetter("age")` and `operator.attrgetter("age")` replace `lambda u: u["age"]` and `lambda u: u.age`. Both accept several names: `itemgetter("last", "first")`.
:::

:::gotcha Mixed types don't sort
`sorted([3, "a", 1])` raises `TypeError: '<' not supported between instances of 'str' and 'int'`. JavaScript would quietly coerce everything to strings. Python makes you decide what the order should be.
:::

## join and split

:::compare
```js
const words = ["fast", "safe", "fun"];

words.join(", ");          // "fast, safe, fun"
words.join("");            // "fastsafefun"
[1, 2, 3].join("-");       // "1-2-3" (implicit toString)

"a,b,,c".split(",");       // ["a", "b", "", "c"]
"  lots   of  space ".trim().split(/\s+/);
[..."hey"];                // ["h", "e", "y"]
```
```python
words = ["fast", "safe", "fun"]

", ".join(words)           # "fast, safe, fun"
"".join(words)             # "fastsafefun"
"-".join(str(n) for n in [1, 2, 3])  # "1-2-3"

"a,b,,c".split(",")        # ["a", "b", "", "c"]
"  lots   of  space ".split()
list("hey")                # ["h", "e", "y"]
```
:::

`join` is a method on the **separator string** and takes any iterable of strings. It looks backwards at first, but it means `join` works on lists, tuples, generators, sets and dict keys without every container needing its own `join` method.

Calling `split()` with **no arguments** splits on runs of whitespace and drops empty strings, which is the `trim().split(/\s+/)` idiom built in.

:::gotcha `join` won't stringify for you
`", ".join([1, 2, 3])` raises `TypeError: sequence item 0: expected str instance, int found`. Convert explicitly with a generator expression, `", ".join(str(n) for n in nums)`, or with `map`: `", ".join(map(str, nums))`.
:::

```python run
nums = [3, 1, 4, 1, 5]
print(", ".join(map(str, nums)))
print(" | ".join(f"#{n}" for n in nums))
print("a  b\tc\n d".split())
print("2024-06-01".split("-", maxsplit=1))
```

:::quiz output
What does this print?

```python
print("-".join("abc"))
```

- [x] `a-b-c`
- [ ] `abc`
- [ ] `-abc-`
- [ ] `TypeError`

A string is an iterable of one-character strings, so `join` puts the separator between the characters.
:::

## Copying: shallow and deep

:::compare
```js
const copy1 = [...xs];
const copy2 = xs.slice();
const copy3 = Array.from(xs);
const deep = structuredClone(nested);
```
```python
copy1 = xs.copy()
copy2 = xs[:]
copy3 = list(xs)
import copy
deep = copy.deepcopy(nested)
```
:::

Assignment never copies, in either language: `ys = xs` gives you a second name for the same list. All three shallow copies make a new outer list whose items are the same objects. Use `copy.deepcopy` when nested data must be independent.

:::quiz output
What does this print?

```python
a = [1, [2, 3]]
b = a.copy()
b[0] = 100
b[1].append(4)
print(a)
```

- [ ] `[1, [2, 3]]`
- [x] `[1, [2, 3, 4]]`
- [ ] `[100, [2, 3, 4]]`
- [ ] `[100, [2, 3]]`

`b` is a new outer list, so reassigning `b[0]` doesn't touch `a`. But `b[1]` and `a[1]` are the *same* inner list, so `append` shows up through both.
:::

## Iterating

The full story is in [Control Flow & Loops](lesson:control-flow). The short version:

:::compare
```js
for (const x of xs) console.log(x);

xs.forEach((x, i) => console.log(i, x));

for (let i = 0; i < xs.length; i++) {
  console.log(i, xs[i]);
}

for (let i = 0; i < a.length; i++) {
  console.log(a[i], b[i]);
}
```
```python
for x in xs:
    print(x)

for i, x in enumerate(xs):
    print(i, x)

for i in range(len(xs)):    # works, but prefer enumerate
    print(i, xs[i])


for x, y in zip(a, b):
    print(x, y)
```
:::

:::gotcha Don't remove items while looping over the same list
Deleting from a list while you iterate over it skips elements, just as in JS. Build a new list instead (`xs = [x for x in xs if keep(x)]`), or loop over a copy: `for x in xs[:]:`.
:::

## Cheat sheet

| JavaScript | Python | Notes |
| --- | --- | --- |
| `xs.length` | `len(xs)` | built-in function |
| `xs.at(-1)` | `xs[-1]` | raises `IndexError` if empty |
| `xs.slice(a, b)` | `xs[a:b]` | also `xs[::step]` |
| `xs.push(x)` | `xs.append(x)` | returns `None` |
| `xs.push(...ys)` | `xs.extend(ys)` | or `xs += ys` |
| `xs.pop()` | `xs.pop()` | |
| `xs.shift()` | `xs.pop(0)` | O(n); use `deque.popleft()` |
| `xs.unshift(x)` | `xs.insert(0, x)` | O(n); use `deque.appendleft()` |
| `xs.splice(i, n)` | `del xs[i:i+n]` | |
| `xs.splice(i, 0, ...ys)` | `xs[i:i] = ys` | |
| `xs.includes(x)` | `x in xs` | value equality |
| `xs.indexOf(x)` | `xs.index(x)` | raises `ValueError` if missing |
| `xs.concat(ys)` | `xs + ys` | or `[*xs, *ys]` |
| `xs.join(", ")` | `", ".join(xs)` | items must be strings |
| `xs.sort((a, b) => a - b)` | `xs.sort()` | in place, returns `None` |
| `xs.toSorted(cmp)` | `sorted(xs, key=...)` | any iterable |
| `xs.toReversed()` | `xs[::-1]` | or `list(reversed(xs))` |
| `[...xs]` | `xs.copy()` | shallow |
| `structuredClone(xs)` | `copy.deepcopy(xs)` | |
| `Array.isArray(x)` | `isinstance(x, list)` | |
| `Array.from(it)` | `list(it)` | |
| `new Array(n).fill(v)` | `[v] * n` | careful with mutable `v` |

## Challenges

:::challenge id=last-or-none title="Last or nothing" difficulty=easy
Write `last(xs)` that returns the last element of a list, or `None` if the list is empty.

Do it **without calling `len()`**. An empty list is falsy, so you can test it directly.

```js
const last = (xs) => xs.at(-1) ?? null;
```

```python starter
def last(xs):
    # your code here
    pass
```

```python solution
def last(xs):
    return xs[-1] if xs else None
```

```python tests
@test("returns the last element")
def _():
    eq(last([1, 2, 3]), 3)
    eq(last(["only"]), "only")

@test("returns None for an empty list")
def _():
    eq(last([]), None)

@test("works when the last element is falsy")
def _():
    eq(last([1, 0]), 0)
    eq(last(["a", ""]), "")

@test("doesn't call len()")
def _():
    forbids_call("len", "you don't need len(): `if xs:` checks for emptiness")
```

```hint
`xs[-1]` is the last element, but it raises `IndexError` on an empty list.
```

```hint
Python's conditional expression is `a if condition else b`. An empty list is falsy.
```
:::

:::challenge id=rotate-list title="Rotate a list" difficulty=medium
Write `rotate(xs, k)` that returns a **new** list rotated right by `k` steps. A negative `k` rotates left, and `k` can be larger than the list.

```
rotate([1, 2, 3, 4, 5], 2)   ->  [4, 5, 1, 2, 3]
rotate([1, 2, 3, 4, 5], -1)  ->  [2, 3, 4, 5, 1]
rotate([1, 2, 3], 7)         ->  [3, 1, 2]
```

Use slicing, with no loops. Python's `%` always returns a result with the sign of the divisor (`-1 % 5 == 4`), which removes the `((k % n) + n) % n` dance you'd need in JavaScript.

```js
function rotate(xs, k) {
  if (xs.length === 0) return [];
  const n = ((k % xs.length) + xs.length) % xs.length;
  return [...xs.slice(xs.length - n), ...xs.slice(0, xs.length - n)];
}
```

```python starter
def rotate(xs, k):
    ...
```

```python solution
def rotate(xs, k):
    if not xs:
        return []
    k %= len(xs)
    return xs[-k:] + xs[:-k]   # k == 0 works too: xs[0:] + xs[:0]
```

```python tests
@test("rotates right")
def _():
    eq(rotate([1, 2, 3, 4, 5], 2), [4, 5, 1, 2, 3])

@test("rotates left with a negative k")
def _():
    eq(rotate([1, 2, 3, 4, 5], -1), [2, 3, 4, 5, 1])

@test("handles k larger than the list")
def _():
    eq(rotate([1, 2, 3], 7), [3, 1, 2])

@test("k = 0 and k = len return a copy")
def _():
    xs = [1, 2, 3]
    eq(rotate(xs, 0), [1, 2, 3])
    eq(rotate(xs, 3), [1, 2, 3])
    check(rotate(xs, 0) is not xs, "return a new list, not the same object")

@test("empty list")
def _():
    eq(rotate([], 3), [])

@test("doesn't mutate the input")
def _():
    xs = [1, 2, 3, 4]
    rotate(xs, 1)
    eq(xs, [1, 2, 3, 4], "the original list changed")

@test("uses slicing, not loops")
def _():
    requires_syntax(ast.Slice, "solve it with slices like xs[-k:]")
    forbids_syntax((ast.For, ast.While), "no loops needed")
```

```hint
Normalize first: `k %= len(xs)` turns `7` into `1` (for length 3) and `-1` into `len(xs) - 1`.
```

```hint
Rotating right by `k` means the last `k` items move to the front: `xs[-k:] + xs[:-k]`. What does `xs[-0:]` give you when `k` is 0?
```
:::

:::challenge id=leaderboard title="Leaderboard" difficulty=medium
Write `top_players(players, n)` that takes a list of `{"name": str, "score": int}` dicts and returns the **names** of the top `n` players. Sort by highest score first and break ties alphabetically by name.

Use a `key=` function. Don't write a comparator.

```js
function topPlayers(players, n) {
  return players
    .toSorted((a, b) => b.score - a.score || a.name.localeCompare(b.name))
    .slice(0, n)
    .map((p) => p.name);
}
```

```python starter
def top_players(players, n):
    ...
```

```python solution
def top_players(players, n):
    ranked = sorted(players, key=lambda p: (-p["score"], p["name"]))
    return [p["name"] for p in ranked[:n]]
```

```python tests
PLAYERS = [
    {"name": "Linus", "score": 87},
    {"name": "Grace", "score": 92},
    {"name": "Ada", "score": 92},
    {"name": "Guido", "score": 75},
    {"name": "Brendan", "score": 87},
]

@test("sorts by score, descending")
def _():
    check(top_players(PLAYERS, 2)[0] in ("Ada", "Grace"), "the first player should have the top score")
    check(top_players(PLAYERS, 5)[-1] == "Guido", "the lowest score should come last")

@test("breaks ties by name")
def _():
    eq(top_players(PLAYERS, 4), ["Ada", "Grace", "Brendan", "Linus"])

@test("n larger than the list returns everyone")
def _():
    eq(len(top_players(PLAYERS, 10)), 5)

@test("doesn't reorder the input list")
def _():
    players = [dict(p) for p in PLAYERS]
    top_players(players, 2)
    eq([p["name"] for p in players], [p["name"] for p in PLAYERS])

@test("uses a key function")
def _():
    check(
        any(isinstance(node, ast.keyword) and node.arg == "key" for node in ast.walk(tree)),
        "pass key=... to sorted() or .sort()",
    )
```

```hint
Tuples compare item by item, so `key=lambda p: (a, b)` sorts by `a`, then by `b`.
```

```hint
To sort one field in descending order, negate it: `-p["score"]`.
```
:::

:::challenge id=chunk-list title="Chunk it" difficulty=hard
Write `chunk(xs, size)` that splits a list into consecutive chunks of length `size`, like lodash's `_.chunk`. The last chunk may be shorter. Return a list of lists, and raise `ValueError` if `size` is less than 1.

Try to write the body as a single list comprehension over `range(start, stop, step)`.

```js
function chunk(xs, size) {
  if (size < 1) throw new RangeError("size must be >= 1");
  const out = [];
  for (let i = 0; i < xs.length; i += size) out.push(xs.slice(i, i + size));
  return out;
}
```

```python starter
def chunk(xs, size):
    ...
```

```python solution
def chunk(xs, size):
    if size < 1:
        raise ValueError("size must be >= 1")
    return [xs[i:i + size] for i in range(0, len(xs), size)]
```

```python tests
@test("even split")
def _():
    eq(chunk([1, 2, 3, 4], 2), [[1, 2], [3, 4]])

@test("last chunk can be shorter")
def _():
    eq(chunk([1, 2, 3, 4, 5], 2), [[1, 2], [3, 4], [5]])

@test("size larger than the list")
def _():
    eq(chunk([1, 2], 5), [[1, 2]])

@test("empty list gives no chunks")
def _():
    eq(chunk([], 3), [])

@test("chunks are lists")
def _():
    eq(all(type(c) is list for c in chunk(list(range(7)), 3)), True)

@test("size < 1 raises ValueError")
def _():
    raises(ValueError, chunk, [1, 2, 3], 0)
```

```hint
`range(0, len(xs), size)` yields the start index of every chunk: 0, size, 2*size, ...
```

```hint
Each chunk is `xs[i:i + size]`. Slices clamp at the end, so the last one is just shorter.
```

```hint
Python 3.12 added `itertools.batched(xs, size)`, which yields tuples. `[list(b) for b in batched(xs, size)]` works too.
```
:::
