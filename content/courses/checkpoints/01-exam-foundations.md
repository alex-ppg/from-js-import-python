---
title: "Exam: Foundations"
part: Core Course Exams
summary: Predict the output, then solve challenges that mix scope, numbers, strings, truthiness and loops.
minutes: 50
---

This exam covers the Foundations part of the core course: [First Contact](lesson:first-contact), [Variables, Types & Scope](lesson:variables-and-scope), [Numbers & Math](lesson:numbers-and-math), [Strings & f-strings](lesson:strings), [Truthiness & Equality](lesson:truthiness-and-equality) and [Control Flow & Loops](lesson:control-flow). Each question is a snippet: decide what it prints, or which exception it raises, before you read the options, because the wrong ones are what JavaScript intuition picks. All the answers have been checked against real Python 3.14, each section ends with a pointer to the lesson that owns its topic, and the final challenges combine several lessons at once.

## Syntax and shape

:::quiz output
What happens?

```python
def finish(done):
    if done:
        return "ok"
    return null


print(finish(True))
```

- [x] `ok`
- [ ] `None`
- [ ] `NameError`
- [ ] `SyntaxError`

`null` isn't a Python keyword, just a name nobody defined, and Python looks names up when a line runs, not when the file is compiled. The line with `null` never runs, so `finish(True)` returns `"ok"`; only `finish(False)` would raise `NameError: name 'null' is not defined`. Write `None`, and let a linter catch undefined names before they ship (ruff's `F821`).
:::

:::quiz output
What happens when this file runs?

```python
print("start")
if True:
    # TODO
print("done")
```

- [ ] `start`, then `done`
- [ ] `start`, then an `IndentationError`
- [x] `IndentationError`
- [ ] `done`

Comments are stripped before parsing, so the `if` has an empty block, which is a syntax error. Python compiles the whole file before it runs any of it, so the error comes first and not even `start` is printed. A block with nothing in it yet needs `pass` (or `...`).
:::

:::quiz output
What does this print?

```python
items = ["mug", "tea"]
print(items, *items, sep=" | ")
```

- [ ] `mug,tea | mug | tea`
- [x] `['mug', 'tea'] | mug | tea`
- [ ] `['mug', 'tea'] mug tea`
- [ ] `[mug, tea] | mug | tea`

`print` converts each argument with `str()`, and a list's `str()` shows its items' `repr()`, quotes included; JS's `${items}` would have given you `mug,tea`. `*items` spreads the list into two more arguments, and `sep` goes between every pair of arguments.
:::

Review: [First Contact](lesson:first-contact), especially [indentation](lesson:first-contact#indentation-is-syntax) and [`print()`](lesson:first-contact#print-vs-console-log).

## Names, types and scope

:::quiz output
What does this print?

```python
def add_a(cart):
    cart += ["a"]


def add_b(cart):
    cart = cart + ["b"]


mine = []
add_a(mine)
add_b(mine)
print(mine)
```

- [ ] `[]`
- [x] `['a']`
- [ ] `['a', 'b']`
- [ ] `['b']`

A parameter is a new name for the caller's object, as in JS. On a list, `+=` extends that object in place, so the caller sees `"a"`. `cart = cart + ["b"]` builds a new list and rebinds only the local name, so `"b"` never reaches `mine`.
:::

:::quiz output
What happens?

```python
theme = "dark"


def render(dark_mode):
    if not dark_mode:
        theme = "light"
    return theme


print(render(True))
```

- [ ] `dark`
- [ ] `light`
- [ ] `None`
- [x] `UnboundLocalError`

An assignment anywhere in a function makes that name local to the **whole** function, and Python decides that when it compiles the function, not when the line runs. With `dark_mode=True` the assignment is skipped, so `return theme` reads a local that never got a value. In JS, a `let theme` inside the `if` would be scoped to that block, and `return theme` would read the outer one. Give the local its own name, or return the value directly: `return theme if dark_mode else "light"`.
:::

:::quiz output
What happens?

```python
try:
    port = int("8O8O")
except ValueError as err:
    message = "bad port"
print(message, err)
```

- [ ] `bad port`, then the error message
- [ ] `bad port None`
- [x] `NameError`
- [ ] `UnboundLocalError`

Blocks don't create scopes, so `message` survives the `except` block like any other assignment. The one exception is the `as` target: Python deletes `err` when the `except` block ends, because the exception holds a reference to the stack frame and keeping it alive would create a reference cycle. Copy it to another name inside the block if you need it afterwards.
:::

Review: [Variables, Types & Scope](lesson:variables-and-scope), especially [aliasing](lesson:variables-and-scope#mutability-and-aliasing), [block scope](lesson:variables-and-scope#no-block-scope) and [`UnboundLocalError`](lesson:variables-and-scope#global-nonlocal-and-unboundlocalerror).

## Numbers

:::quiz output
What does this print?

```python
print(7 / 7, 7 // 2.0, -7 // 2)
```

- [ ] `1 3 -3`
- [ ] `1.0 3.5 -3.5`
- [x] `1.0 3.0 -4`
- [ ] `1 3.0 -4`

`/` is true division and always returns a float, even when it divides exactly. `//` is floor division: with a float operand the result is a whole-valued float, and it rounds toward negative infinity, so `-7 // 2` is `-4` where `Math.trunc(-7 / 2)` gives `-3`.
:::

:::quiz output
What does this print?

```python
import math

print(int(-3.7), math.floor(-3.7), round(-3.5))
```

- [x] `-3 -4 -4`
- [ ] `-4 -4 -3`
- [ ] `-3 -4 -3`
- [ ] `-4 -4 -4`

`int()` truncates toward zero, like `Math.trunc`. `math.floor` goes toward negative infinity. `round()` sends an exact tie to the even neighbour, which between `-4` and `-3` is `-4`; JS's `Math.round(-3.5)` is `-3`, because its ties go toward +∞.
:::

:::quiz output
What happens?

```python
quantities = ["3", " 4 ", "5.0"]
print(sum(int(q) for q in quantities))
```

- [ ] `12`
- [ ] `7`
- [x] `ValueError`
- [ ] `TypeError`

`int()` forgives surrounding whitespace, so `" 4 "` parses, but it only accepts integer syntax: `"5.0"` raises `ValueError` where `parseInt` would have read `5`. If the input may contain a decimal point, go through `float()` and decide explicitly what `"5.5"` should mean.
:::

Review: [Numbers & Math](lesson:numbers-and-math), especially [division](lesson:numbers-and-math#division-and-divmod), [rounding](lesson:numbers-and-math#rounding-round-floor-ceil-trunc) and [strict parsing](lesson:numbers-and-math#parsing-strict-int-and-float).

## Strings

:::quiz output
What does this print?

```python
print("analytics.csv".rstrip(".csv"))
```

- [ ] `analytics`
- [x] `analyti`
- [ ] `analytics.`
- [ ] `ValueError`

`rstrip` takes a **set of characters**, not a suffix. It removes trailing `.`, `c`, `s` and `v` characters for as long as it finds them, so it eats the `cs` of `analytics` too. `"analytics.csv".removesuffix(".csv")` removes the exact suffix, once.
:::

:::quiz output
What does this print?

```python
print("token=abc==".split("=", 1))
```

- [ ] `['token']`
- [x] `['token', 'abc==']`
- [ ] `['token', 'abc', '', '']`
- [ ] `['token', 'abc']`

JavaScript's second argument is a limit that truncates the result, so `"token=abc==".split("=", 1)` is `["token"]`. Python's is `maxsplit`: it makes at most one cut and keeps the rest of the string, `==` and all, in the last item. `partition("=")` is the other tool for splitting once.
:::

:::quiz output
What does this print?

```python
import re

line = "order 66 shipped"
print(re.match(r"\d+", line), re.search(r"\d+", line)[0])
```

- [ ] `66 66`
- [x] `None 66`
- [ ] `None None`
- [ ] `TypeError`

`re.match` only matches at the **start** of the string, so it finds nothing here and returns `None`. `re.search` scans the whole string, which is what JS's `line.match(/\d+/)` does. When the whole string has to match, use `re.fullmatch`.
:::

:::quiz output
What does this print?

```python
colors = [
    "red",
    "green"
    "blue",
]
print(len(colors), colors[-1])
```

- [ ] `3 blue`
- [x] `2 greenblue`
- [ ] `2 blue`
- [ ] `SyntaxError`

Adjacent string literals are joined at compile time, so the missing comma silently merges `"green"` and `"blue"` into a single item, where JavaScript would reject the list with a SyntaxError. The rule is handy for wrapping a long string over several lines inside parentheses, and a trap everywhere else.
:::

Review: [Strings & f-strings](lesson:strings), especially [the method map](lesson:strings#the-string-method-map) and [regular expressions](lesson:strings#regular-expressions-re-vs-regexp).

## Truthiness and equality

:::quiz output
What does this print?

```python
items = []
print(items == False, not items, items is None)
```

- [ ] `True True False`
- [x] `False True False`
- [ ] `True True True`
- [ ] `False False False`

Falsy doesn't mean equal to `False`. `==` never coerces, so a list never equals a bool, where JS says `[] == false` is `true`. `not items` asks about truthiness, and an empty list is falsy. `items is None` is `False` because an empty list is still a list. They're three different questions: is it `False`, is it empty, is it missing?
:::

:::quiz output
What does this print?

```python
settings = {"retries": 0, "proxy": None}
retries = settings.get("retries", 3)
proxy = settings.get("proxy", "direct")
timeout = settings.get("timeout") or 30
print(retries, proxy, timeout)
```

- [ ] `3 direct 30`
- [x] `0 None 30`
- [ ] `0 direct 30`
- [ ] `3 None 30`

`.get(key, default)` falls back only when the key is **missing**, so a stored `0` or `None` comes back as it is. That's unlike `??`, which would have replaced the `null` too. `or` replaces any falsy value: right for the missing `timeout`, but it would also have turned the deliberate `0` retries into a default.
:::

:::quiz output
What does this print?

```python
print([10] < [9], "10" < "9", (1, 2) < (1, 2, 0))
```

- [ ] `True True True`
- [x] `False True True`
- [ ] `False False True`
- [ ] `TypeError`

Sequences compare item by item. `[10] < [9]` compares `10 < 9`, so it's `False`, while JS turns both arrays into strings and says `true`. Strings compare character by character too, and `"1"` comes before `"9"`, so `"10" < "9"` is `True` in both languages. When one sequence is a prefix of the other, the shorter one is smaller.
:::

Review: [Truthiness & Equality](lesson:truthiness-and-equality), especially [falsy values](lesson:truthiness-and-equality#booleans-and-falsy-values), [the `??` replacements](lesson:truthiness-and-equality#no-and-no) and [ordering](lesson:truthiness-and-equality#ordering-no-mixing-types).

## Control flow

:::quiz output
What happens?

```python
NOT_FOUND = 404
status = 200

match status:
    case NOT_FOUND:
        print("missing", NOT_FOUND)
```

- [ ] Nothing
- [ ] `missing 404`
- [x] `missing 200`
- [ ] `SyntaxError`

A bare name in a `case` is a **capture pattern**: it matches anything and binds the subject to that name, so `NOT_FOUND` is now `200`. As the only case, Python accepts it silently; with more cases after it, it would be a `SyntaxError`, because they could never match. Compare against constants through a dotted name, such as `HTTPStatus.NOT_FOUND`, or write the literal.
:::

:::quiz output
What does this print?

```python
for i in range(5):
    if i == 1:
        i += 2
    print(i, end=" ")
```

- [ ] `0 3 4`
- [x] `0 3 2 3 4`
- [ ] `0 3 4 5 6`
- [ ] `0 1 2 3 4`

A `for` loop takes the next value from the `range` no matter what the body did to `i`, so rebinding it only changes what this one iteration prints. A JS `for (let i...)` loop would skip ahead. In Python, loops that jump forward are `while` loops with their own counter.
:::

:::quiz output
What does this print?

```python
def find_admin(users):
    for user in users:
        if user["admin"]:
            break
    else:
        return "no admin"
    return user["name"]


print(find_admin([]), find_admin([{"name": "Ada", "admin": True}]))
```

- [x] `no admin Ada`
- [ ] `None Ada`
- [ ] `NameError`
- [ ] `no admin no admin`

A loop's `else` runs when the loop finishes without a `break`, and that includes a loop whose body never ran, so the empty list returns `"no admin"`. A `break` skips the `else`, and `user` is still bound afterwards, because loop variables outlive their loop.
:::

Review: [Control Flow & Loops](lesson:control-flow), especially [`match`](lesson:control-flow#match-a-switch-without-fall-through), [`while` loops](lesson:control-flow#while-and-the-missing-do-while) and [`for...else`](lesson:control-flow#for-else-and-while-else).

## Final challenges

Each challenge draws on several lessons from this part. They're ordered from easy to hard.

:::challenge id=exam-ticket-numbers title="Fix the ticket counter" difficulty=easy
`make_ticket_counter(prefix, start=1, width=4)` returns a function that hands out ticket labels: the prefix, a dash, and the next number, zero-padded to `width` digits. Every counter counts on its own, and numbers that outgrow the width simply get longer.

```text
next_bug = make_ticket_counter("BUG")
next_bug()                                        ->  "BUG-0001"
next_bug()                                        ->  "BUG-0002"
make_ticket_counter("OPS", start=998, width=3)()  ->  "OPS-998"
```

The starter is a line-by-line port of the JavaScript, and it hands out the same label forever. Fix it.

```js
function makeTicketCounter(prefix, start = 1, width = 4) {
  let count = start - 1;
  return () => {
    ++count;
    return `${prefix}-${String(count).padStart(width, "0")}`;
  };
}
```

```python starter
def make_ticket_counter(prefix, start=1, width=4):
    count = start - 1

    def next_ticket():
        ++count
        return f"{prefix}-{str(count).rjust(width, '0')}"

    return next_ticket
```

```python solution
def make_ticket_counter(prefix, start=1, width=4):
    count = start - 1

    def next_ticket():
        nonlocal count
        count += 1
        return f"{prefix}-{count:0{width}}"

    return next_ticket
```

```python tests
@test("counts up from 1 by default")
def _():
    next_bug = make_ticket_counter("BUG")
    eq([next_bug(), next_bug(), next_bug()], ["BUG-0001", "BUG-0002", "BUG-0003"])

@test("start and width are configurable")
def _():
    next_ops = make_ticket_counter("OPS", start=998, width=3)
    eq([next_ops(), next_ops()], ["OPS-998", "OPS-999"])

@test("numbers that outgrow the width get longer")
def _():
    next_ops = make_ticket_counter("OPS", start=999, width=3)
    next_ops()
    eq(next_ops(), "OPS-1000")

@test("each counter counts on its own")
def _():
    bugs, docs = make_ticket_counter("BUG"), make_ticket_counter("DOC")
    bugs()
    bugs()
    eq(docs(), "DOC-0001", "a new counter should start from its own start")
    eq(bugs(), "BUG-0003")
```

```hint
`++count` is two unary pluses: it computes `count` and throws the result away. Python spells an increment `count += 1`.
```

```hint
`count += 1` assigns to `count`, which makes it local to `next_ticket`, so the first call raises `UnboundLocalError`. Declare `nonlocal count` at the top of `next_ticket`.
```

```hint
A format spec can do the padding, and its width can be a nested field: `f"{count:0{width}}"`.
```
:::

:::challenge id=exam-duration-format title="Format a duration" difficulty=easy
Write `format_duration(seconds)` that turns a number of seconds into a compact label:

- under a minute, the seconds alone: `"45s"`,
- under an hour, the minutes and then the seconds, padded to two digits: `"3m 05s"`,
- otherwise the hours, then the minutes and seconds, both padded to two digits: `"2h 03m 04s"`. Hours keep counting past 24.

`seconds` must be an `int`. Raise `ValueError` if it's negative, and `TypeError` for anything that isn't an int, including `True` and `90.0` (a float, whatever `Number.isInteger` says).

```text
format_duration(45)     ->  "45s"
format_duration(185)    ->  "3m 05s"
format_duration(7384)   ->  "2h 03m 04s"
```

```js
function formatDuration(seconds) {
  if (!Number.isInteger(seconds)) throw new TypeError("seconds must be an integer");
  if (seconds < 0) throw new RangeError("seconds must not be negative");
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  const pad = (n) => String(n).padStart(2, "0");
  if (h) return `${h}h ${pad(m)}m ${pad(s)}s`;
  if (m) return `${m}m ${pad(s)}s`;
  return `${s}s`;
}
```

```python starter
def format_duration(seconds):
    ...
```

```python solution
def format_duration(seconds):
    if isinstance(seconds, bool) or not isinstance(seconds, int):
        raise TypeError(f"seconds must be an int, not {type(seconds).__name__}")
    if seconds < 0:
        raise ValueError("seconds must not be negative")
    minutes, secs = divmod(seconds, 60)
    hours, minutes = divmod(minutes, 60)
    if hours:
        return f"{hours}h {minutes:02}m {secs:02}s"
    if minutes:
        return f"{minutes}m {secs:02}s"
    return f"{secs}s"
```

```python tests
@test("under a minute: the seconds alone")
def _():
    eq(format_duration(45), "45s")
    eq(format_duration(0), "0s")

@test("under an hour: minutes, then seconds padded to two digits")
def _():
    eq(format_duration(185), "3m 05s")
    eq(format_duration(600), "10m 00s")

@test("an hour or more: hours, then padded minutes and seconds")
def _():
    eq(format_duration(7384), "2h 03m 04s")
    eq(format_duration(3600), "1h 00m 00s")

@test("hours keep counting past a day")
def _():
    eq(format_duration(90061), "25h 01m 01s")

@test("negative durations raise ValueError")
def _():
    raises(ValueError, format_duration, -1)

@test("anything but an int raises TypeError, booleans included")
def _():
    raises(TypeError, format_duration, 90.0)
    raises(TypeError, format_duration, "90")
    raises(TypeError, format_duration, True)
```

```hint
`divmod(seconds, 60)` returns `(minutes, seconds)` in one step. Apply it again to the minutes to get the hours.
```

```hint
`f"{n:02}"` pads a number to two digits with zeros.
```

```hint
`bool` is a subclass of `int`, so `isinstance(True, int)` is `True`. Rule booleans out before you accept an int.
```
:::

:::challenge id=exam-version-compare title="Compare version strings" difficulty=medium
Write `compare_versions(a, b)` that compares two version strings and returns `-1` if `a` is older, `0` if they're the same version and `1` if `a` is newer, like a comparator.

- Versions are whole numbers separated by dots, compared numerically, part by part: `"3.10"` is newer than `"3.9"`.
- Missing trailing parts count as zero, so `"1.2"` and `"1.2.0"` are the same version.
- A leading `v` and surrounding whitespace are ignored.
- A part that isn't made only of digits (`"1.x"`, `"1..2"`, `"1.-2"`, `"1. 2"`) raises `ValueError`, and so does an empty version.

```text
compare_versions("3.10", "3.9")    ->   1
compare_versions("v1.2", "1.2.0")  ->   0
compare_versions("1.4.2", "1.10")  ->  -1
```

```js
function compareVersions(a, b) {
  const parse = (v) =>
    v.trim().replace(/^v/, "").split(".").map((part) => {
      if (!/^\d+$/.test(part)) throw new RangeError(`invalid version: ${v}`);
      return Number(part);
    });
  const left = parse(a);
  const right = parse(b);
  for (let i = 0; i < Math.max(left.length, right.length); i++) {
    const diff = (left[i] ?? 0) - (right[i] ?? 0);
    if (diff) return Math.sign(diff);
  }
  return 0;
}
```

```python starter
def compare_versions(a, b):
    ...
```

```python solution
def parse_version(text):
    parts = text.strip().removeprefix("v").split(".")
    if not all(part.isdecimal() for part in parts):
        raise ValueError(f"invalid version: {text!r}")
    return [int(part) for part in parts]


def compare_versions(a, b):
    left, right = parse_version(a), parse_version(b)
    width = max(len(left), len(right))
    left += [0] * (width - len(left))
    right += [0] * (width - len(right))
    return (left > right) - (left < right)
```

```python tests
@test("compares parts as numbers, not strings")
def _():
    eq(compare_versions("3.10", "3.9"), 1)
    eq(compare_versions("3.9", "3.10"), -1)

@test("the same version gives 0")
def _():
    eq(compare_versions("2.0.1", "2.0.1"), 0)

@test("missing parts count as zero")
def _():
    eq(compare_versions("1.2", "1.2.0"), 0)
    eq(compare_versions("1.2", "1.2.1"), -1)
    eq(compare_versions("1.4.2", "1.10"), -1)

@test("ignores a leading v and surrounding whitespace")
def _():
    eq(compare_versions(" v1.4 ", "1.4"), 0)
    eq(compare_versions("v2", "v10"), -1)

@test("returns exactly -1, 0 or 1")
def _():
    eq(compare_versions("10.0", "2.0"), 1)
    eq(compare_versions("1.0", "1.7"), -1)

@test("parts that aren't plain digits raise ValueError")
def _():
    for bad in ["1.x", "1..2", "1.-2", "", "v", "1. 2"]:
        raises(ValueError, compare_versions, bad, "1.0")
```

```hint
Parse each version into a list of ints first. `str.isdecimal()` tells you whether a part is all digits, and it's `False` for an empty string.
```

```hint
Pad the shorter list with zeros (`[0] * n` builds the padding), then compare the two lists directly: lists compare item by item, and these items are numbers.
```

```hint
`(left > right) - (left < right)` turns two comparisons into `-1`, `0` or `1`, because `True` is `1` and `False` is `0`.
```
:::

:::challenge id=exam-pocket-calculator title="A pocket calculator" difficulty=medium
Write `calculate(expression)` that evaluates a single operation written as `number operator number`, with whitespace between the three parts, using Python's own arithmetic:

```text
calculate("3 + 4")      ->  7
calculate("-7 // 2")    ->  -4
calculate("7.5 / 2")    ->  3.75
calculate("2 ** 100")   ->  1267650600228229401496703205376
```

- The operators are `+`, `-`, `*`, `/`, `//`, `%` and `**`, with Python's semantics: `/` always returns a float, and `//` and `%` floor.
- A number in integer syntax becomes an `int`. Anything else that `float()` accepts, such as `"7.5"` or `"1e3"`, becomes a `float`.
- Anything malformed raises `ValueError`: the wrong number of parts, an unknown operator, or a part that isn't a number. Division by zero raises `ZeroDivisionError`, as it does in Python.

A `match` statement is a natural way to pick the operator.

```js
function calculate(expression) {
  const parts = expression.trim().split(/\s+/);
  if (parts.length !== 3) throw new SyntaxError(`expected "a op b": ${expression}`);
  const [a, op, b] = [Number(parts[0]), parts[1], Number(parts[2])];
  if (Number.isNaN(a) || Number.isNaN(b)) throw new SyntaxError("not a number");
  switch (op) {
    case "+": return a + b;
    case "-": return a - b;
    case "*": return a * b;
    case "/": return a / b;
    case "//": return Math.floor(a / b);
    case "%": return ((a % b) + b) % b;
    case "**": return a ** b;
    default: throw new SyntaxError(`unknown operator: ${op}`);
  }
}
```

```python starter
def calculate(expression):
    ...
```

```python solution
def to_number(token):
    try:
        return int(token)
    except ValueError:
        return float(token)  # raises ValueError for anything that isn't a number


def calculate(expression):
    left, op, right = expression.split()  # ValueError unless exactly three parts
    a, b = to_number(left), to_number(right)
    match op:
        case "+":
            return a + b
        case "-":
            return a - b
        case "*":
            return a * b
        case "/":
            return a / b
        case "//":
            return a // b
        case "%":
            return a % b
        case "**":
            return a**b
        case _:
            raise ValueError(f"unknown operator: {op!r}")
```

```python tests
@test("adds, subtracts and multiplies ints")
def _():
    eq(calculate("3 + 4"), 7)
    eq(calculate("10 - 15"), -5)
    eq(calculate("6 * 7"), 42)

@test("/ always returns a float")
def _():
    result = calculate("6 / 3")
    eq(result, 2.0)
    check(type(result) is float, "6 / 3 is 2.0 in Python, not 2")

@test("// and % floor, like Python's operators")
def _():
    eq(calculate("-7 // 2"), -4)
    eq(calculate("-7 % 3"), 2)

@test("** stays exact for big ints")
def _():
    eq(calculate("2 ** 100"), 2**100)

@test("integer tokens become ints, other numbers become floats")
def _():
    check(type(calculate("2 * 3")) is int, "2 * 3 should be the int 6")
    eq(calculate("7.5 / 2"), 3.75)
    eq(calculate("1e3 + 1"), 1001.0)

@test("extra whitespace is fine")
def _():
    eq(calculate("  3   +   4 "), 7)

@test("malformed expressions raise ValueError")
def _():
    for bad in ["3 +", "3 + 4 + 5", "3 +4", "", "three + 4", "3 + 4px", "3 ^ 4", "3 === 3"]:
        raises(ValueError, calculate, bad)

@test("division by zero raises ZeroDivisionError")
def _():
    raises(ZeroDivisionError, calculate, "1 / 0")
    raises(ZeroDivisionError, calculate, "5 % 0")
```

```hint
`left, op, right = expression.split()` raises `ValueError` on its own unless there are exactly three parts: unpacking is strict.
```

```hint
Try `int(token)` first, and fall back to `float(token)` when that raises `ValueError`. `float()` raises `ValueError` too, for anything that isn't a number.
```

```hint
Give `match op:` one `case` per operator and finish with a `case _:` that raises. Python's operators already have exactly the semantics you need. (A dict that maps each operator to a function works too.)
```
:::

:::challenge id=exam-duration-parse title="Parse a duration" difficulty=hard
Write `parse_duration(text)`, the inverse of a duration formatter: it turns strings like `"1h 30m"`, `"45s"` or `"2h5m10s"` into a whole number of seconds.

- The units are `h`, `m` and `s`, in that order, each at most once, with or without spaces between the parts. Units can be upper or lower case, and surrounding whitespace is ignored.
- Amounts are whole numbers, and `"0s"` is a valid duration.
- Anything else raises `ValueError`: an empty string, a number without a unit, an unknown unit, units out of order or repeated, or a decimal amount.

```text
parse_duration("1h 30m")    ->  5400
parse_duration("2h5m10s")   ->  7510
parse_duration(" 45S ")     ->  45
parse_duration("30m 1h")    ->  ValueError
```

```js
function parseDuration(text) {
  const m = /^(?:(\d+)h)?\s*(?:(\d+)m)?\s*(?:(\d+)s)?$/i.exec(text.trim());
  if (!m || !(m[1] || m[2] || m[3])) throw new RangeError(`not a duration: ${text}`);
  const [h, min, s] = m.slice(1).map((amount) => Number(amount ?? 0));
  return h * 3600 + min * 60 + s;
}
```

```python starter
import re


def parse_duration(text):
    ...
```

```python solution
import re

DURATION = re.compile(
    r"(?:(?P<hours>\d+)h)?\s*(?:(?P<minutes>\d+)m)?\s*(?:(?P<seconds>\d+)s)?",
    re.IGNORECASE,
)


def parse_duration(text):
    m = DURATION.fullmatch(text.strip())
    if m is None or not any(m.groups()):
        raise ValueError(f"not a duration: {text!r}")
    hours, minutes, seconds = (int(amount or 0) for amount in m.groups())
    return hours * 3600 + minutes * 60 + seconds
```

```python tests
@test("single units")
def _():
    eq(parse_duration("45s"), 45)
    eq(parse_duration("2m"), 120)
    eq(parse_duration("1h"), 3600)

@test("combined units, with or without spaces")
def _():
    eq(parse_duration("1h 30m"), 5400)
    eq(parse_duration("2h5m10s"), 7510)
    eq(parse_duration("1h 1s"), 3601)

@test("ignores case and surrounding whitespace")
def _():
    eq(parse_duration("  1H 30M "), 5400)
    eq(parse_duration(" 45S "), 45)

@test("zero is a valid duration")
def _():
    eq(parse_duration("0s"), 0)
    eq(parse_duration("0h 0m"), 0)

@test("returns an int")
def _():
    check(type(parse_duration("90s")) is int, "return a whole number of seconds")

@test("rejects text that isn't a duration")
def _():
    for bad in ["", "   ", "90", "1x", "h", "1.5h", "30m 1h", "1h 1h", "1h30"]:
        raises(ValueError, parse_duration, bad)
```

```hint
One regex with three optional groups does it: `(?:(?P<hours>\d+)h)?`, the same for minutes and seconds, and `\s*` between them. Use `fullmatch`, so nothing else can sneak in, and `re.IGNORECASE` for the case.
```

```hint
When every part is optional, the empty string matches too, so check that at least one group matched. `any(m.groups())` works: an unmatched group is `None`, and a matched one is a non-empty string, which is truthy even when it's `"0"`.
```

```hint
`int(amount or 0)` turns an unmatched group into `0`.
```
:::
