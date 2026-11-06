---
title: Reference
---

## Basics & syntax

### `console.log()`: print
```js
console.log("total:", total);
console.error("disk almost full");
process.stdout.write("no newline");
```
```python
print("total:", total)
print("disk almost full", file=sys.stderr)  # import sys first
print("no newline", end="")
```
```python
print(f"{total=}")  # total=42
```
`print()` joins its arguments with a space (`sep=`) and ends with a newline (`end=`), and `f"{x=}"` prints the expression next to its value. See [First Contact](lesson:first-contact).

### `console.warn()` / `console.info()`: logging
```js
console.error("payment failed:", err);
console.warn("deprecated option");
console.info("server started");
```
```python
import logging
logging.basicConfig(level=logging.INFO)
logging.error("payment failed: %s", err)
logging.info("server started")
```
Without `basicConfig`, the root logger shows only `WARNING` and above, so `logging.info()` prints nothing. In a module, log through `log = logging.getLogger(__name__)`.

### `//` comments and `/** JSDoc */`
```js
// a comment
/** Returns the user's display name. */
function displayName(user) {}
```
```python
# a comment
def display_name(user):
    """Return the user's display name."""
```
There are no block comments. A docstring is the string literal at the top of a function, class or module, and `help(display_name)` shows it.

### `let` / `const`: declare a variable
```js
let count = 0;
const MAX_RETRIES = 3;
```
```python
count = 0
MAX_RETRIES = 3  # a constant by convention only
```
```python
from typing import Final
MAX_RETRIES: Final = 3  # type checkers reject reassignment
```
Assignment creates the name: there's no declaration keyword, nothing stops reassignment at runtime, and blocks don't create a scope. See [Variables, Types & Scope](lesson:variables-and-scope).

### `null` / `undefined`: `None`
```js
let user = null;
if (user === null || user === undefined) {}
if (user == null) {}
```
```python
user = None
if user is None:
    ...
```
One value covers both, and you test it with `is None`. Missing dict keys and attributes raise `KeyError` and `AttributeError` instead of producing `undefined`.

### `&&` / `||` / `!` and `true` / `false`
```js
if (isAdmin && !isBanned || isOwner) {}
const name = input || "guest";
```
```python
if is_admin and not is_banned or is_owner:
    ...
name = user_input or "guest"
```
`True`, `False` and `None` are capitalised, and `and`/`or` return one of their operands, like `&&`/`||`. `not` binds more loosely than `==`, so `not a == b` means `not (a == b)`.

### `typeof` / `instanceof` / `Array.isArray()`
```js
typeof name === "string"
user instanceof Admin
Array.isArray(items)
typeof callback === "function"
```
```python
isinstance(name, str)
isinstance(user, Admin)
isinstance(items, list)
callable(callback)
```
```python
type(user).__name__  # "Admin"; type(user) is Admin excludes subclasses
```
`isinstance` also takes a tuple: `isinstance(n, (int, float))`. `bool` is a subclass of `int`, so `isinstance(True, int)` is `True`.

### `===` / `!==`: equality
```js
a === b
_.isEqual(xs, ys)  // deep comparison
objA === objB      // same reference?
```
```python
a == b
xs == ys        # compares contents, recursively
obj_a is obj_b  # same object?
```
`==` compares values, recursing into lists, dicts, sets and tuples, and never turns strings into numbers: `1 == "1"` is `False`, though `1 == 1.0 == True`. Keep `is` for identity, as in `x is None` ([Truthiness & Equality](lesson:truthiness-and-equality)).

### `cond ? a : b`: ternary
```js
const label = count === 1 ? "item" : "items";
```
```python
label = "item" if count == 1 else "items"
```
The condition sits in the middle, and only the chosen branch is evaluated.

### `a ?? b`: nullish coalescing
```js
const port = userPort ?? 8080;
```
```python
port = user_port if user_port is not None else 8080
```
```python
port = user_port or 8080  # also replaces 0, "" and []
```
There's no `??` operator. `or` is the popular shortcut, but like `||` it replaces every falsy value; for dict keys, use `.get(key, default)`.

### `obj?.a?.b`: optional chaining
```js
const city = data?.user?.address?.city;
const zip = user?.address?.zip;
```
```python
city = data.get("user", {}).get("address", {}).get("city")
```
```python
zip_code = user.address.zip if user and user.address else None
```
There's no `?.`. Chained `.get(key, {})` copes with missing keys in parsed JSON but raises `AttributeError` when a key is present with a `None` value.

### `if (!items.length)`: truthiness
```js
if (items.length === 0) return;
if (!name) return;  // "", null, undefined, 0, NaN
const hasItems = !!items.length;
_.isEmpty(obj)
```
```python
if not items:
    return
has_items = bool(items)
is_empty = not obj
```
Empty containers (`[]`, `{}`, `set()`, `""`), `0` and `None` are falsy and `NaN` is truthy, so `[]`, `{}` and `NaN` behave the opposite way from JS. Your own classes control truthiness with `__bool__` or `__len__`.

### `debugger`: breakpoint
```js
debugger;
```
```python
breakpoint()
```
Opens the `pdb` debugger on that line (`n` next, `s` step in, `c` continue, `p expr` print). Setting `PYTHONBREAKPOINT=0` disables every call.

### `a <= x && x <= b`: chained comparison
```js
if (0 <= score && score <= 100) {}
_.inRange(n, 0, 10);  // 0 <= n < 10
```
```python
if 0 <= score <= 100:
    ...
in_range = 0 <= n < 10
```
`a < b < c` means `a < b and b < c`, evaluating `b` once. In JS, `0 <= x <= 100` is always `true`; in Python it does what it says.

## Numbers & math

### `i++` / `i--`
```js
i++;
count--;
```
```python
i += 1
count -= 1
```
`i++` is a `SyntaxError`, and `++i` parses as `+(+i)` and silently does nothing. Most counters disappear anyway with `range` and `enumerate` ([Control Flow](lesson:control-flow)).

### `/` and `Math.floor(a / b)`: division
```js
7 / 2              // 3.5
Math.floor(7 / 2)  // 3
Math.trunc(-7 / 2) // -3
```
```python
7 / 2        # 3.5: / always returns a float
7 // 2       # 3: floor division
int(-7 / 2)  # -3: truncates toward zero
```
`//` rounds toward negative infinity, so `-7 // 2` is `-4`, not `-3`. Dividing by zero raises `ZeroDivisionError` instead of returning `Infinity` ([Numbers & Math](lesson:numbers-and-math)).

### `%`: remainder and modulo
```js
-7 % 3             // -1
((i % n) + n) % n  // wrap a negative index
```
```python
-7 % 3                # 2: takes the sign of the divisor
math.fmod(-7, 3)      # -1.0: the JS-style remainder
q, r = divmod(-7, 3)  # (-3, 2)
```
Because the result follows the divisor, `i % n` is always a valid index for a positive `n`, with no wrapping dance.

### `Math.round()` / `floor()` / `ceil()` / `trunc()`
```js
Math.round(2.5)   // 3
Math.round(-2.5)  // -2
Math.floor(-2.5); Math.ceil(2.1); Math.trunc(-2.5);
```
```python
round(2.5)  # 2: ties go to the even neighbour
round(3.5)  # 4
math.floor(-2.5), math.ceil(2.1), math.trunc(-2.5)  # -3, 3, -2
```
```python
math.floor(x + 0.5)  # JS-style: ties round toward +infinity
```
`round()` is banker's rounding, and like the `math` functions it returns an `int` when called without `ndigits`. For money, use `Decimal` with `ROUND_HALF_UP`.

### `toFixed(2)`: format decimals
```js
(3.14159).toFixed(2)  // "3.14"
(0.125).toFixed(2)    // "0.13"
```
```python
f"{3.14159:.2f}"  # '3.14'
f"{0.125:.2f}"    # '0.12': exact ties round to even
```
```python
round(3.14159, 2)  # 3.14, a float rather than a string
```
Format specs round the exact binary value half to even, so they can disagree with `toFixed` on ties such as `0.125` or `2.5`. `f"{x:,.2f}"` adds thousands separators as well.

### `Math.max(...xs)` / `Math.min()`
```js
Math.max(...prices)
Math.min(a, b)
Math.max()  // -Infinity
```
```python
max(prices)
min(a, b)
max(prices, default=0)  # max([]) raises ValueError
```
`max` and `min` take an iterable or several arguments, plus a `key=` function: `max(users, key=lambda u: u["age"])` returns the oldest user.

### `Math.*`: the `math` module
```js
Math.abs(-3); Math.sqrt(16); Math.PI;
Math.log(x); Math.log2(x); Math.hypot(3, 4);
2 ** 10;
```
```python
import math
abs(-3), math.sqrt(16), math.pi
math.log(x), math.log2(x), math.hypot(3, 4)  # math.log(x, base) too
2 ** 10, pow(2, 10, 1000)  # pow takes an optional modulus
```
Domain errors raise `ValueError` instead of returning `NaN` (`math.sqrt(-1)`, `math.log(0)`). `-2 ** 2` is `-4` because `**` binds tighter than unary minus, where JS refuses to parse it.

### `parseInt()` / `Number()`: parse a number
```js
parseInt("42px")  // 42
Number("3.5")     // 3.5
Number("abc")     // NaN
```
```python
int("42")     # 42
float("3.5")  # 3.5
int("42px")   # ValueError, as are int("3.5") and float("abc")
```
Parsing is strict but tolerates surrounding whitespace and underscores (`int(" 1_000 ")` is `1000`). Wrap user input in `try`/`except ValueError`, or pull digits out with `re.match(r"\d+", s)` for `parseInt`-style leniency.

### `parseInt(s, 16)` / `n.toString(2)`: other bases
```js
parseInt("ff", 16)  // 255
(255).toString(2)   // "11111111"
(255).toString(16)  // "ff"
```
```python
int("ff", 16)  # 255; int("0xff", 0) reads the prefix
f"{255:b}"     # '11111111'
f"{255:x}"     # 'ff'; hex(255) is '0xff'
```
`bin()`, `oct()` and `hex()` add a `0b`/`0o`/`0x` prefix and format specs don't. Literals look the same as in JS: `0xff`, `0b1010`, `0o755`, `1_000_000`.

### `Number.MAX_SAFE_INTEGER` / `BigInt`
```js
2 ** 53 + 1  // 9007199254740992: precision lost
2n ** 64n    // BigInt
```
```python
2 ** 53 + 1  # 9007199254740993, exact
2 ** 64      # 18446744073709551616: every int is a bignum
```
`int` has arbitrary precision, so there's no `BigInt` and no `n` suffix, while `float` is the same 64-bit double as a JS `number`. Converting an int with more than 4300 digits to `str` raises `ValueError` unless you raise the limit with `sys.set_int_max_str_digits()`.

### `NaN` / `Infinity` / `Number.isNaN()`
```js
Infinity; -Infinity; NaN;
Number.isNaN(x);
Number.isFinite(x);
```
```python
math.inf, -math.inf, math.nan  # or float("inf"), float("nan")
math.isnan(x)
math.isfinite(x)
```
Few operations produce these, because `1 / 0` raises `ZeroDivisionError` and `int("x")` raises `ValueError`. As in JS, `NaN` never equals itself, but unlike JS it is truthy.

### `0.1 + 0.2 === 0.3`: float comparison
```js
0.1 + 0.2 === 0.3  // false
Math.abs(a - b) < Number.EPSILON
```
```python
math.isclose(0.1 + 0.2, 0.3)  # True; pass abs_tol= when comparing with 0
```
```python
from decimal import Decimal
Decimal("0.1") + Decimal("0.2") == Decimal("0.3")  # True
```
Same IEEE doubles, same surprise. Build `Decimal`s from strings, since `Decimal(0.1)` captures the float's binary error; `fractions.Fraction` gives exact rationals.

### `toLocaleString()`: thousands separators and percentages
```js
(1234567.891).toLocaleString("en-US")  // "1,234,567.891"
(0.256).toLocaleString("en-US", { style: "percent" })  // "26%"
```
```python
f"{1234567.891:,}"     # '1,234,567.891'
f"{1234567.891:,.2f}"  # '1,234,567.89'
f"{0.256:.0%}"         # '26%'
```
`,` and `_` group digits with that exact character whatever the locale. For localised output, use the `locale` module or the third-party Babel.

### `Math.random()` / `_.sample()` / `_.shuffle()`
```js
Math.random()                      // [0, 1)
Math.floor(Math.random() * 6) + 1  // 1..6
_.sample(deck); _.shuffle(deck);
```
```python
random.random()       # [0.0, 1.0)
random.randint(1, 6)  # 1..6: both ends included
random.choice(deck)
random.shuffle(deck)  # in place, returns None
```
`random.sample(deck, k)` picks without replacement (`random.sample(deck, len(deck))` is a shuffled copy, like `_.shuffle`), and `random.choices(deck, k=5)` picks with replacement. Use the `secrets` module for tokens and passwords.

## Strings

### `` `Hello ${name}` ``: template literals
```js
`Hello ${name}, you have ${count} new messages`
`Total: ${price.toFixed(2)}`
```
```python
f"Hello {name}, you have {count} new messages"
f"Total: {price:.2f}"
```
After the `:` comes a format spec (`{n:>8}`, `{n:,}`, `{ratio:.1%}`), `{x!r}` uses `repr()` and `{x=}` prints `x=` plus the value. Reusing the outer quote character inside the braces needs 3.12+ ([Strings & f-strings](lesson:strings)).

### Multi-line strings
```js
const sql = `
  SELECT name
  FROM users`;
```
```python
sql = """
SELECT name
FROM users"""
```
```python
from textwrap import dedent
sql = dedent("""\
    SELECT name
    FROM users""")
```
Triple-quoted strings keep newlines and indentation exactly, and `dedent` strips the common indent (the backslash after the opening quotes skips the first newline). Add an `f` prefix to interpolate.

### `s.length` / `s[i]` / `s.at(-1)`
```js
s.length  // "😀".length is 2
s[0]
s.at(-1)
s[99]  // undefined
```
```python
len(s)  # len("😀") is 1
s[0]
s[-1]
s[99]  # IndexError; s[99:100] returns "" instead
```
`len()` counts code points rather than UTF-16 units, though emoji built from several code points (flags, families) still count as several. A character is just a one-character string.

### `slice()` / `substring()` / reverse a string
```js
s.slice(1, 4)
s.slice(-3)
[...s].reverse().join("")
```
```python
s[1:4]
s[-3:]
s[::-1]
```
Slices are `[start:stop:step]` with an exclusive stop, and out-of-range bounds are clamped rather than raising. Reversing works on code points, so combining marks and multi-code-point emoji come apart, just as in JS.

### `includes()` / `indexOf()` / `startsWith()`
```js
email.includes("@")
email.indexOf("@")  // -1 if missing
url.startsWith("https://")
file.endsWith(".png") || file.endsWith(".jpg")
```
```python
"@" in email
email.find("@")  # -1 if missing; email.index("@") raises ValueError
url.startswith("https://")
file.endswith((".png", ".jpg"))  # a tuple means "any of these"
```
`rfind` is `lastIndexOf` and `s.count(sub)` counts occurrences. The "any of" argument must be a tuple; a list raises `TypeError`.

### `trim()` / remove a prefix or suffix
```js
s.trim()
s.trimStart(); s.trimEnd();
url.replace(/^https:\/\//, "")
name.endsWith(".txt") ? name.slice(0, -4) : name
```
```python
s.strip()
s.lstrip(), s.rstrip()
url.removeprefix("https://")  # 3.9+
name.removesuffix(".txt")
```
Given an argument, `strip` removes any of those *characters*, not a substring: `"report.txt".rstrip(".txt")` is `"repor"`. `removeprefix` and `removesuffix` remove an exact affix and leave the string unchanged when it's absent.

### `padStart()` / `padEnd()`
```js
String(7).padStart(3, "0")  // "007"
"Total".padEnd(10, ".")
"-".repeat(20)
```
```python
str(7).zfill(3)  # '007'; "-7".zfill(3) is '-07'
"Total".ljust(10, ".")
"-" * 20
```
```python
f"{7:03}"          # '007'
f"{'Total':.<10}"  # fill ".", align left, width 10
```
`rjust`, `ljust` and `center` take a single fill character, whereas JS repeats a whole pad string. `*` repeats any sequence, so it also replaces `repeat()`.

### `toUpperCase()` / `toLowerCase()`
```js
s.toUpperCase()
s.toLowerCase()
s[0].toUpperCase() + s.slice(1)
```
```python
s.upper()
s.lower()
s[:1].upper() + s[1:]  # safe on an empty string
```
`s.capitalize()` and `s.title()` also lowercase everything else (`"iPhone".capitalize()` is `"Iphone"`). Compare case-insensitively with `a.casefold() == b.casefold()`.

### `replace()` / `replaceAll()`
```js
s.replaceAll("-", "_")
s.replace("-", "_")  // first match only
```
```python
s.replace("-", "_")     # every occurrence
s.replace("-", "_", 1)  # first occurrence only
```
Python's `replace` is JS's `replaceAll` unless you pass a count (accepted as `count=1` in 3.13+). Use `re.sub` for patterns.

### `split()` / split lines
```js
"a,b,c".split(",")     // ["a", "b", "c"]
"a,b,c".split(",", 2)  // ["a", "b"]
"  a  b ".trim().split(/\s+/)
text.split(/\r?\n/)
```
```python
"a,b,c".split(",")     # ['a', 'b', 'c']
"a,b,c".split(",", 1)  # ['a', 'b,c']
"  a  b ".split()      # ['a', 'b']
text.splitlines()
```
JS's `limit` truncates the result, but Python's `maxsplit` stops splitting and keeps the rest. `split("")` raises `ValueError` (use `list(s)`), and `splitlines()` handles `\r\n` without leaving a trailing empty string.

### `const [k, v] = s.split("=")`: split once
```js
const [key, value] = line.split("=");
```
```python
key, _, value = line.partition("=")
```
```python
key, value = line.split("=", 1)  # ValueError if there's no "="
```
`partition` always returns three parts, with the last two empty when the separator is missing, so it never raises. `rpartition` splits at the last occurrence.

### `arr.join(", ")`
```js
names.join(", ")
[1, 2, 3].join("-")
```
```python
", ".join(names)
"-".join(map(str, [1, 2, 3]))
```
`join` is a method of the separator and accepts any iterable of strings; anything else raises `TypeError`, so convert first ([Lists](lesson:lists)).

### `charCodeAt()` / `String.fromCharCode()`
```js
"A".charCodeAt(0)        // 65
String.fromCharCode(65)  // "A"
"😀".codePointAt(0)      // 128512
```
```python
ord("A")   # 65
chr(65)    # 'A'
ord("😀")  # 128512
```
`ord` and `chr` work on whole code points, like `codePointAt` and `String.fromCodePoint`, so an emoji is one character rather than a surrogate pair.

### `localeCompare()`: sort strings
```js
names.sort((a, b) => a.localeCompare(b))
names.sort((a, b) => a.localeCompare(b, undefined, { sensitivity: "base" }))
```
```python
names.sort()                  # by code point: "Zoe" before "adam"
names.sort(key=str.casefold)  # case-insensitive
```
```python
import locale
locale.setlocale(locale.LC_COLLATE, "")
names.sort(key=locale.strxfrm)
```
Plain comparison uses code points, so uppercase sorts before lowercase and accented letters after `z`. Real locale-aware collation needs `locale.strxfrm` (a process-wide setting) or the third-party PyICU.

### `String(x)` / `JSON.stringify(s)`: `str()` vs `repr()`
```js
String(42)
`${user}`
JSON.stringify("hi")  // '"hi"'
"Total: " + 5         // "Total: 5"
```
```python
str(42)
f"{user}"
repr("hi")          # "'hi'": the developer-facing form
"Total: " + str(5)  # "Total: " + 5 raises TypeError
```
`str()` is for display and `repr()` for debugging, and containers show their items' `repr`. `str(None)` is `'None'`, not `'null'`.

### `/^\d+$/.test(s)`: character checks
```js
/^\d+$/.test(s)
/^[a-z]+$/i.test(s)
/^\s*$/.test(s)
```
```python
s.isdigit()
s.isalpha()
not s.strip()  # blank: empty or whitespace only
```
`isdigit()` and `isalpha()` accept any Unicode digit or letter (`"²".isdigit()` is `True`) and return `False` for `""`. Neither accepts signs or decimal points, so validate numbers with `int()` inside a `try`.

### Tagged templates: t-strings
```js
html`<p>${comment}</p>`
```
```python
template = t"<p>{comment}</p>"  # 3.14+: a Template, not a str
page = render_html(template)    # your function escapes each value
```
A t-string (3.14+) keeps the literal parts and the interpolated values apart (`template.strings`, `template.values`), which is exactly what a tag function receives in JS ([Strings & f-strings](lesson:strings)).

## Arrays → lists

### `arr.length` / `arr.length = 0`
```js
items.length
items.length = 0;  // clear
items.length = 3;  // truncate
```
```python
len(items)
items.clear()
del items[3:]
```
`len()` is a builtin that works on every sized container. Writing `items = []` instead rebinds the name and leaves other references to the old list untouched ([Lists](lesson:lists)).

### `arr.at(-1)`: last element
```js
items.at(-1)
items[items.length - 1]
items[99]  // undefined
```
```python
items[-1]
items[-1] if items else None  # safe on an empty list
items[99]  # IndexError
```
Negative indices count from the end, but reading past either end raises `IndexError` instead of returning `undefined`.

### `push()` / `pop()`
```js
items.push(x);
items.push(...more);
const last = items.pop();
```
```python
items.append(x)
items.extend(more)  # or items += more
last = items.pop()
```
`append` returns `None` rather than the new length, and `append(more)` would add the whole list as a single element. `pop()` on an empty list raises `IndexError`.

### `shift()` / `unshift()`
```js
const first = queue.shift();
queue.unshift(x);
```
```python
first = queue.pop(0)
queue.insert(0, x)
```
```python
from collections import deque
queue = deque(jobs)  # O(1) popleft() and appendleft()
```
`pop(0)` and `insert(0, x)` shift every element along, so use a `deque` for real queues.

### `splice()`
```js
items.splice(i, 2);            // remove 2 at i
items.splice(i, 0, "a", "b");  // insert at i
items.splice(i, 1, "z");       // replace 1 at i
```
```python
del items[i:i + 2]
items[i:i] = ["a", "b"]
items[i:i + 1] = ["z"]
```
Slice assignment grows or shrinks the list in place. `splice` returns the removed items; in Python, read `items[i:i + 2]` before deleting.

### `slice()`
```js
items.slice(1, 3)
items.slice(-2)
items.filter((_, i) => i % 2 === 0)
```
```python
items[1:3]
items[-2:]
items[::2]  # every other item
```
Same exclusive stop as `slice()`, plus a step: `items[::-1]` is a reversed copy and `items[:]` a shallow copy.

### `includes()` / `indexOf()`
```js
tags.includes("new")
tags.indexOf("new")  // -1 if missing
```
```python
"new" in tags
tags.index("new")  # ValueError if missing
```
```python
tags.index("new") if "new" in tags else -1
```
Membership uses `==`, so `[1, 2] in [[1, 2]]` is `True`. Every `in` on a list is a linear scan, so convert to a `set` for repeated lookups.

### `concat()` / `[...a, ...b]`
```js
a.concat(b)
[...a, ...b, extra]
```
```python
a + b
[*a, *b, extra]
```
`+` needs two lists (`[1] + (2,)` raises `TypeError`), while `[*a, *b]` accepts any iterables.

### `sort()`
```js
nums.sort((a, b) => a - b);
[10, 9, 1].sort();  // [1, 10, 9]: compares as strings!
```
```python
nums.sort()             # in place, returns None
ordered = sorted(nums)  # a new list from any iterable
```
Numbers sort as numbers and both sorts are stable, but mixed types such as `[3, "a"]` raise `TypeError`. `ordered = nums.sort()` sets `ordered` to `None`.

### `sort((a, b) => ...)` / `_.sortBy()`: sort by a field
```js
users.sort((a, b) => a.age - b.age);
users.sort((a, b) => b.score - a.score || a.name.localeCompare(b.name));
_.sortBy(users, ["last", "first"]);
```
```python
users.sort(key=lambda u: u["age"])
users.sort(key=lambda u: (-u["score"], u["name"]))
sorted(users, key=itemgetter("last", "first"))  # from operator
```
`key=` maps each item to the value to sort by; tuples compare element by element, and negating a number flips that field. Add `reverse=True` for descending order, or wrap a two-argument comparator in `functools.cmp_to_key`.

### `toSorted()` / `toReversed()` / `reverse()`
```js
const ordered = items.toSorted();
const backwards = items.toReversed();
items.reverse();
```
```python
ordered = sorted(items)
backwards = items[::-1]  # or list(reversed(items))
items.reverse()          # in place, returns None
```
`reversed()` returns a lazy iterator, not a list.

### `Array.from()` / `fill()`: build a list
```js
Array.from({ length: 5 }, (_, i) => i * i)
new Array(3).fill(0)
Array.from("abc")
```
```python
[i * i for i in range(5)]
[0] * 3
list("abc")
```
`[[]] * 3` repeats one inner list three times, just like `fill([])`; build independent rows with `[[] for _ in range(3)]`.

### `[...arr]` / `arr.slice()`: copy
```js
const snapshot = [...items];
const snapshot2 = items.slice();
```
```python
snapshot = items.copy()
snapshot2 = items[:]  # or list(items)
```
All of these are shallow: nested lists stay shared. Use `copy.deepcopy` for a fully independent copy.

### Remove an item by value
```js
items.splice(items.indexOf(x), 1);
items = items.filter((v) => v !== x);
```
```python
items.remove(x)  # first match only; ValueError if missing
items = [v for v in items if v != x]
```
When `indexOf` returns -1, the JS version deletes the *last* item; `remove` raises instead.

## map / filter / reduce & friends

### `map()`
```js
const names = users.map((u) => u.name);
const labels = items.map((item, i) => `${i + 1}. ${item}`);
```
```python
names = [u["name"] for u in users]
labels = [f"{i}. {item}" for i, item in enumerate(items, start=1)]
```
```python
ids = list(map(int, raw_ids))  # pass an existing function directly
```
Comprehensions are the idiom. `map()` returns a lazy, single-use iterator, so wrap it in `list()` when you need a list ([Comprehensions](lesson:map-filter-reduce)).

### `filter()` / `filter().map()`
```js
const adults = users.filter((u) => u.age >= 18);
const emails = users.filter((u) => u.active).map((u) => u.email);
```
```python
adults = [u for u in users if u["age"] >= 18]
emails = [u["email"] for u in users if u["active"]]
```
```python
adults = list(filter(is_adult, users))
```
The trailing `if` filters. To transform conditionally instead, put a conditional expression up front: `[x if x > 0 else 0 for x in nums]`.

### `filter(Boolean)` / map then drop nulls
```js
values.filter(Boolean)
inputs.map(parse).filter((x) => x != null)
```
```python
[v for v in values if v]
[y for x in inputs if (y := parse(x)) is not None]
```
Falsy isn't the same set as in JS: empty containers are falsy and `NaN` is truthy. The walrus `:=` (3.8+) names `parse(x)` so it runs once per item.

### `reduce()` to sum
```js
prices.reduce((sum, p) => sum + p, 0)
cart.reduce((sum, item) => sum + item.price * item.qty, 0)
```
```python
sum(prices)
sum(item["price"] * item["qty"] for item in cart)
```
A generator expression passed to `sum` needs no extra brackets. `math.prod` multiplies, and `math.fsum` adds floats without accumulating rounding error.

### `reduce()` in general
```js
const state = actions.reduce(reducer, initialState);
```
```python
from functools import reduce
state = reduce(reducer, actions, initial_state)
```
`reduce` lives in `functools`, takes the function first, and calls it with just `(acc, item)`, never an index. A plain loop or a builtin like `sum`, `max`, `any` or `Counter` usually reads better.

### `find()` / `findIndex()` / `findLast()`
```js
users.find((u) => u.id === userId)       // undefined if none
users.findIndex((u) => u.id === userId)  // -1 if none
users.findLast((u) => u.active)
```
```python
next((u for u in users if u["id"] == user_id), None)
next((i for i, u in enumerate(users) if u["id"] == user_id), -1)
next((u for u in reversed(users) if u["active"]), None)
```
`next()` takes the first item the generator produces and stops there. Without the default it raises `StopIteration` when nothing matches.

### `some()` / `every()` / count matches
```js
users.some((u) => u.admin)
users.every((u) => u.verified)
users.filter((u) => u.active).length
```
```python
any(u["admin"] for u in users)
all(u["verified"] for u in users)
sum(u["active"] for u in users)  # True counts as 1
```
Pass a generator, not a list, so `any`/`all` stop at the first decisive item; as in JS, `all([])` is `True` and `any([])` is `False`. Summing booleans works because `bool` is a subclass of `int`.

### `forEach()`
```js
users.forEach((u) => sendEmail(u));
```
```python
for u in users:
    send_email(u)
```
Don't build a comprehension just for its side effects. Unlike `forEach`, a loop supports `break`, `continue` and `return`.

### `flat()` / `flatMap()`
```js
matrix.flat()
users.flatMap((u) => u.tags)
```
```python
[x for row in matrix for x in row]
[tag for u in users for tag in u["tags"]]
```
```python
from itertools import chain
list(chain.from_iterable(matrix))
```
The `for` clauses read in nested-loop order, outer first. For `flat(Infinity)`, see `_.flattenDeep()`.

### `Object.groupBy()` / `_.groupBy()`
```js
Object.groupBy(orders, (o) => o.status)
```
```python
from collections import defaultdict
by_status = defaultdict(list)
for o in orders:
    by_status[o["status"]].append(o)
```
```python
from itertools import groupby
key = itemgetter("status")
groups = {k: list(g) for k, g in groupby(sorted(orders, key=key), key=key)}
```
`itertools.groupby` only groups *consecutive* items, so sort by the same key first. Reading a missing key from a `defaultdict` inserts it, so test membership with `in`.

### `_.maxBy()` / `_.minBy()`
```js
users.reduce((a, b) => (b.age > a.age ? b : a))
_.minBy(users, "age")
```
```python
max(users, key=lambda u: u["age"])
min(users, key=lambda u: u["age"], default=None)
```
`key=` chooses what to compare but the item itself comes back, the first one on ties. Without `default=`, an empty input raises `ValueError`.

### `zip()`: pair up two arrays
```js
names.map((name, i) => [name, scores[i]])
Object.fromEntries(names.map((n, i) => [n, scores[i]]))
```
```python
list(zip(names, scores))
dict(zip(names, scores))
```
```python
zip(names, scores, strict=True)  # 3.10+: ValueError on a length mismatch
```
`zip` is lazy and silently stops at the shortest input; `itertools.zip_longest` pads instead.

## Objects & Maps → dicts

### `{ key: value }`: object literal
```js
const user = { name: "Ada", age: 36 };
const field = "role";
const extra = { [field]: "admin", name };
```
```python
user = {"name": "Ada", "age": 36}
field = "role"
extra = {field: "admin", "name": name}
```
```python
user = dict(name="Ada", age=36)
```
Keys are expressions, so `{name: "Ada"}` uses the *value* of a variable called `name` (or raises `NameError`). There's no shorthand either: `{name}` builds a set ([Dicts](lesson:dicts)).

### `obj.key` / `"key" in obj`: read a key
```js
user.name
user["first-name"]
user.missing  // undefined
"email" in user
```
```python
user["name"]
user["first-name"]
user["missing"]  # KeyError
"email" in user
```
Dicts have no dot access and missing keys raise `KeyError`, so use `.get()` when absence is normal (or a dataclass or `types.SimpleNamespace` if you want attributes). `in` checks keys, never values.

### `obj.key ?? fallback` / `??=`: `.get()` and `setdefault()`
```js
const theme = prefs.theme ?? "light";
const color = prefs.color;  // undefined if missing
prefs.theme ??= "light";
```
```python
theme = prefs.get("theme", "light")
color = prefs.get("color")  # None if missing
prefs.setdefault("theme", "light")
```
The fallback applies only when the key is missing, not when it maps to `None`. `setdefault` returns the value either way, so `groups.setdefault(key, []).append(item)` is a one-line accumulator.

### Set and `delete` a key
```js
user.email = "ada@example.com";
delete user.email;
```
```python
user["email"] = "ada@example.com"
del user["email"]        # KeyError if missing
user.pop("email", None)  # returns the value; no error if missing
```
Adding or deleting keys while looping over the dict raises `RuntimeError`, so iterate over `list(user)` when you need to change it.

### `Object.keys()` / `values()` / `entries()`
```js
Object.keys(user)
Object.values(user)
Object.entries(user)
Object.keys(user).length
```
```python
list(user)  # the keys
list(user.values())
list(user.items())
len(user)
```
`keys()`, `values()` and `items()` return live views. Loop over them directly (`for key, value in user.items():`) and call `list()` only when you need a real list.

### `Object.fromEntries()`
```js
Object.fromEntries([["a", 1], ["b", 2]])
Object.fromEntries(keys.map((k, i) => [k, values[i]]))
```
```python
dict([("a", 1), ("b", 2)])
dict(zip(keys, values))
```
```python
{k: v for k, v in pairs}
```
`dict()` accepts any iterable of pairs. `dict.fromkeys(keys, 0)` gives every key the same value, which is a trap with a mutable value such as `[]`.

### Map or filter an object: `_.mapValues()` / `_.invert()`
```js
Object.fromEntries(Object.entries(prices).map(([k, v]) => [k, v * 1.2]))
Object.fromEntries(Object.entries(user).filter(([, v]) => v != null))
_.invert(codes)
```
```python
{k: v * 1.2 for k, v in prices.items()}
{k: v for k, v in user.items() if v is not None}
{v: k for k, v in codes.items()}
```
Dict comprehensions replace the whole `entries()` round trip.

### `new Map()`: a dict already is one
```js
const visits = new Map();
visits.set(page, 1);
visits.get(page);
visits.has(page); visits.size;
```
```python
visits = {}
visits[page] = 1
visits.get(page)
page in visits, len(visits)
```
A dict keeps insertion order and accepts any hashable key (strings, numbers, tuples, frozen dataclasses), so it covers `Map`. Keys match by `==` and hash, so `1`, `1.0` and `True` are the same key.

### Composite keys: `` map.set(`${x},${y}`, v) ``
```js
grid.set(`${x},${y}`, "wall");
grid.get(`${x},${y}`);
```
```python
grid[(x, y)] = "wall"
grid[x, y]  # the parentheses are optional
```
Tuples are hashable, so they make natural multi-part keys. Lists aren't, and using one as a key raises `TypeError`.

### Number keys and key order
```js
const obj = {};
obj[1] = "a";
obj["1"];  // "a": keys become strings
Object.keys({ b: 0, 2: 0, a: 0, 1: 0 });  // ["1", "2", "b", "a"]
```
```python
d = {1: "a"}
d["1"]  # KeyError: 1 and "1" are different keys
list({"b": 0, 2: 0, "a": 0, 1: 0})  # ['b', 2, 'a', 1]
```
Keys keep their type and their insertion order, whereas JS objects stringify keys and move integer-like ones to the front.

### Count occurrences / `_.countBy()`
```js
for (const w of words) counts[w] = (counts[w] || 0) + 1;
_.countBy(users, "role")
```
```python
from collections import Counter
counts = Counter(words)
counts.most_common(3)
Counter(u["role"] for u in users)
```
```python
counts[w] = counts.get(w, 0) + 1
```
A `Counter` is a dict that returns `0` for missing keys (without inserting them) and supports `+`, `-` and `most_common()`.

### Sort an object by value
```js
Object.entries(scores).sort(([, a], [, b]) => b - a)
```
```python
sorted(scores.items(), key=lambda kv: kv[1], reverse=True)
```
```python
sorted(scores, key=scores.get, reverse=True)  # keys only
```
Wrap the result in `dict(...)` to get a dict back in that order.

### `structuredClone()` / `_.cloneDeep()`
```js
const deep = structuredClone(state);
const shallow = { ...state };
```
```python
import copy
deep = copy.deepcopy(state)
shallow = state.copy()  # or dict(state), {**state}
```
`deepcopy` copies any object graph, including class instances and cycles, not just JSON-like data.

### `Object.freeze()`
```js
const config = Object.freeze({ debug: false });
```
```python
from types import MappingProxyType
config = MappingProxyType({"debug": False})
```
```python
@dataclass(frozen=True)
class Config:
    debug: bool = False
```
A `MappingProxyType` is a read-only *view*, so changes to the dict behind it still show through, and assigning to a frozen dataclass field raises `FrozenInstanceError`. Both are shallow, like `freeze`.

## Sets

### `new Set()`
```js
const tags = new Set(["a", "b"]);
const empty = new Set();
```
```python
tags = {"a", "b"}
empty = set()  # {} is an empty dict
```
```python
tags = set(tag_list)
```
Python sets are unordered (iteration order isn't insertion order, unlike JS), and members must be hashable ([Sets](lesson:sets)).

### `add()` / `has()` / `delete()` / `size`
```js
tags.add("c");
tags.has("c");
tags.delete("c");
tags.size;
```
```python
tags.add("c")
"c" in tags
tags.discard("c")  # tags.remove("c") raises KeyError if missing
len(tags)
```
`in` on a set is a constant-time hash lookup, so build one when you test membership repeatedly.

### `[...new Set(arr)]` / `_.uniq()`: dedupe
```js
[...new Set(items)]
_.uniq(items)
```
```python
list(dict.fromkeys(items))  # keeps first-seen order
```
```python
list(set(items))  # order not preserved
```
Both need hashable items; to dedupe dicts, key them by a field (see `_.uniqBy()`).

### `union()` / `intersection()` / `difference()`
```js
a.union(b)
a.intersection(b)
a.difference(b)
a.symmetricDifference(b)
```
```python
a | b
a & b
a - b
a ^ b
```
```python
a.union(tag_list)  # the method forms accept any iterable
```
The operators need sets on both sides. `|=`, `&=`, `-=` and `^=` update the left set in place.

### `isSubsetOf()` / `isSupersetOf()` / `isDisjointFrom()`
```js
a.isSubsetOf(b)
a.isSupersetOf(b)
a.isDisjointFrom(b)
```
```python
a <= b  # a < b for a proper subset
a >= b
a.isdisjoint(b)
```
`issubset()` and `issuperset()` are the method spellings, and like `isdisjoint()` they accept any iterable.

### `new Set(arr.map(fn))`: set comprehension
```js
new Set(users.map((u) => u.country))
```
```python
{u["country"] for u in users}
```
Same braces as a dict comprehension, without the `key: value` pair.

### Sets of pairs or objects
```js
const seen = new Set();
seen.add([1, 2]);
seen.has([1, 2]);  // false: compared by reference
```
```python
seen = set()
seen.add((1, 2))
(1, 2) in seen  # True: compared by value
```
Lists, dicts and sets are unhashable (`TypeError`), so store tuples or `frozenset`s. A `frozenset` is an immutable set that can itself be a set member or a dict key.

## Destructuring & spread

### `const [a, b] = arr`
```js
const [lat, lng] = coords;
const [x, y] = [1, 2, 3];  // 3 is ignored
```
```python
lat, lng = coords
x, y = [1, 2, 3]  # ValueError: too many values to unpack
```
The counts must match: Python raises `ValueError` where JS ignores extras or fills in `undefined` ([Tuples & Destructuring](lesson:tuples-and-unpacking)).

### `const [first, ...rest] = arr`
```js
const [first, ...rest] = queue;
const [, second] = row;
```
```python
first, *rest = queue
*init, last = queue
_, second, *_ = row
```
The starred name always receives a list (possibly empty) and can sit anywhere, so `*init, last` has no JS equivalent. `_` is just a conventional throwaway name.

### `[a, b] = [b, a]`: swap
```js
[a, b] = [b, a];
```
```python
a, b = b, a
```
The right side is built as a tuple first, so any number of names can rotate at once: `a, b, c = c, a, b`.

### Nested destructuring and loops
```js
const [[x1, y1], [x2, y2]] = segment;
pairs.forEach(([name, score], i) => {});
```
```python
(x1, y1), (x2, y2) = segment
for i, (name, score) in enumerate(pairs):
    ...
```
Patterns nest to any depth, and each level must match its shape exactly.

### `const { name, age } = user`
```js
const { name, age } = user;
const { role = "member" } = user;
```
```python
name, age = user["name"], user["age"]
role = user.get("role", "member")
```
```python
match user:
    case {"name": str(name), "age": int(age)}:
        print(name, age)
```
There's no object destructuring; `operator.itemgetter("name", "age")(user)` returns a tuple, and a `match` mapping pattern (3.10+) destructures while checking the shape. See [Pattern Matching](lesson:pattern-matching).

### `const { password, ...rest } = user`
```js
const { password, ...safeUser } = user;
```
```python
safe_user = {k: v for k, v in user.items() if k != "password"}
```
```python
safe_user = dict(user)
password = safe_user.pop("password")
```
The second form also hands you the removed value, like the destructured `password`.

### `{ ...a, ...b }` / `Object.assign()`: merge
```js
const merged = { ...defaults, ...options };
const updated = { ...task, done: true };
Object.assign(settings, overrides);
```
```python
merged = defaults | options  # 3.9+
updated = {**task, "done": True}
settings |= overrides  # in place, like settings.update(overrides)
```
```python
updated = dataclasses.replace(task, done=True)  # for dataclass instances
```
Later keys win and every form is shallow. `update()` returns `None`, so never assign its result; `copy.replace()` (3.13+) generalises `dataclasses.replace()`.

### `fn(...args)`: spread into a call
```js
fn(...args)
console.log(...items)
Math.max(...nums)
```
```python
fn(*args)
print(*items)
max(nums)  # takes the iterable directly
```
```python
fn(**options)  # dict -> keyword arguments
```
`*` spreads any iterable into positional arguments and `**` spreads a dict into keyword arguments.

### Return several values
```js
function bounds(xs) { return [Math.min(...xs), Math.max(...xs)]; }
const [lo, hi] = bounds(xs);
```
```python
def bounds(xs):
    return min(xs), max(xs)
lo, hi = bounds(xs)
```
`return a, b` returns a tuple, which you unpack at the call site. Beyond two or three fields, return a `NamedTuple` or a dataclass.

## Control flow

### `if` / `else if` / `else`
```js
if (score >= 90) grade = "A";
else if (score >= 80) grade = "B";
```
```python
if score >= 90:
    grade = "A"
elif score >= 80:
    grade = "B"
```
It's `elif`, a colon and an indented block, with no parentheses or braces. `else:` works as in JS.

### `switch` → `match`
```js
switch (command) {
  case "stop": case "quit": stop(); break;
  default: unknown(command);
}
```
```python
match command:
    case "stop" | "quit": stop()
    case _: unknown(command)
```
Cases (3.10+) never fall through, `case _:` is the default, and a bare name such as `case other:` *captures* any value instead of comparing. Before 3.10, a dict of functions (`handlers[command]()`) was the usual stand-in ([Pattern Matching](lesson:pattern-matching)).

### `for...of`
```js
for (const order of orders) {
  process(order);
}
```
```python
for order in orders:
    process(order)
```
Don't add or remove items from a list while looping over it: iterate over a copy (`orders[:]`) or build a new list.

### `for (let i = 0; i < n; i++)`
```js
for (let i = 0; i < n; i++) {}
for (let i = 10; i > 0; i -= 2) {}
for (let i = xs.length - 1; i >= 0; i--) {}
```
```python
for i in range(n):
    ...
for i in range(10, 0, -2):
    ...
```
```python
for x in reversed(xs):
    ...
```
`range(start, stop, step)` excludes `stop`, just like `i < n`. When you only need the items, loop over them directly instead of indexing.

### `forEach((x, i) => ...)`: index and value
```js
items.forEach((item, i) => console.log(i, item));
for (const [i, item] of items.entries()) {}
```
```python
for i, item in enumerate(items):
    print(i, item)
```
```python
for rank, item in enumerate(items, start=1):
    print(f"{rank}. {item}")
```
`enumerate` yields `(index, item)` pairs and beats `range(len(items))`.

### `for...in` / `Object.entries()` loops
```js
for (const key in obj) {}
for (const [key, value] of Object.entries(obj)) {}
```
```python
for key in obj:
    ...
for key, value in obj.items():
    ...
```
Looping over a dict yields its keys, with no inherited properties to filter out. Over a list, `for x in xs` yields values, not the index strings that JS's `for...in` gives.

### `do...while`
```js
do {
  line = read();
} while (line !== "");
```
```python
while True:
    line = read()
    if line == "":
        break
```
There's no `do...while`, so `while True` plus `break` is the idiom.

### `while ((x = next()) !== null)`: assign in a condition
```js
while ((chunk = stream.read()) !== null) process(chunk);
if ((m = /\d+/.exec(s))) use(m[0]);
```
```python
while (chunk := stream.read()) is not None:
    process(chunk)
if m := re.search(r"\d+", s):
    use(m[0])
```
`=` is a statement, so `if (x = f())` is a `SyntaxError`; the walrus `:=` (3.8+) is the expression form.

### `break outer` / found flag: `for...else`
```js
let found = false;
for (const u of users) if (u.admin) { found = true; break; }
if (!found) createAdmin();
```
```python
for u in users:
    if u["admin"]: break
else:
    create_admin()
```
```python
if not any(u["admin"] for u in users):
    create_admin()
```
A loop's `else` runs only if the loop finished without `break`. There's no labeled `break`: move nested loops into a function and `return`.

### Block scope
```js
for (let i = 0; i < 3; i++) {}
console.log(i);  // ReferenceError
```
```python
for i in range(3):
    pass
print(i)  # 2: the loop variable outlives the loop
```
Only functions, classes, modules and comprehensions create scopes, so names assigned inside `if`, `for`, `while` and `with` blocks stay visible afterwards ([Variables, Types & Scope](lesson:variables-and-scope)).

## Functions

### `function` → `def`
```js
function add(a, b) {
  return a + b;
}
```
```python
def add(a, b):
    return a + b
```
A function without `return` returns `None`. `def` is a statement that runs when reached, so there's no hoisting: calling a function above its definition at module level raises `NameError` ([Functions](lesson:functions)).

### Arrow functions → `lambda`
```js
const double = (x) => x * 2;
items.sort((a, b) => a.price - b.price);
```
```python
def double(x):
    return x * 2
items.sort(key=lambda item: item["price"])
```
A `lambda` holds a single expression, with no statements or annotations. Use it inline for `key=` and callbacks, and give anything with a name a `def`.

### Default parameters
```js
function greet(name, greeting = "Hello") {}
greet();  // name is undefined
```
```python
def greet(name, greeting="Hello"):
    ...
greet()  # TypeError: missing 1 required positional argument: 'name'
```
Missing arguments raise `TypeError` instead of becoming `undefined` (so do extra ones, which JS ignores). Defaults are evaluated once, when `def` runs, which matters for mutable defaults.

### `function f(items = [])`: mutable defaults
```js
function addTag(tag, tags = []) {
  tags.push(tag);
  return tags;
}
```
```python
def add_tag(tag, tags=None):
    tags = [] if tags is None else tags
    tags.append(tag)
    return tags
```
With `tags=[]`, every call would share, and keep growing, the *same* list. Use `None` as the sentinel for any mutable default.

### `...args`: rest parameters
```js
function total(...nums) {
  return nums.reduce((a, b) => a + b, 0);
}
```
```python
def total(*nums):
    return sum(nums)
```
`nums` arrives as a tuple, and the call site spreads with `total(*prices)`.

### Options object → keyword arguments
```js
function connect(host, { port = 5432, ssl = false } = {}) {}
connect("db", { ssl: true });
```
```python
def connect(host, *, port=5432, ssl=False):
    ...
connect("db", ssl=True)
```
Parameters after a bare `*` are keyword-only, and a misspelled name raises `TypeError` instead of being silently ignored. A `/` makes the parameters before it positional-only.

### `**kwargs`: arbitrary named options
```js
function tag(name, attrs = {}) {}
tag("a", { href: "/", target: "_blank" });
```
```python
def tag(name, **attrs):
    ...
tag("a", href="/", target="_blank")
```
`attrs` arrives as a dict, and `tag("a", **attrs)` spreads one back in. Names that aren't identifiers, like `data-id`, can only be passed by unpacking: `tag("div", **{"data-id": "7"})`.

### Reassign an outer variable: `nonlocal` / `global`
```js
let total = 0;
function add(n) { total += n; }
```
```python
def add(n):
    global total  # nonlocal for an enclosing function's variable
    total += n
```
Reading an outer variable just works, but assigning to it makes the name local to the whole function, so `total += n` alone raises `UnboundLocalError`. Mutating an object (`items.append(x)`) needs no declaration.

### Closures in a loop: late binding
```js
const fns = [];
for (let i = 0; i < 3; i++) fns.push(() => i);
fns.map((f) => f());  // [0, 1, 2]
```
```python
fns = [lambda: i for i in range(3)]
[f() for f in fns]  # [2, 2, 2]
```
```python
fns = [lambda i=i: i for i in range(3)]  # [0, 1, 2]
```
Closures capture variables, not values, and Python loops don't create a fresh binding per iteration the way `let` does. A default argument (or `functools.partial`) freezes the current value.

### `fn.bind(null, x)`: partial application
```js
const logError = log.bind(null, "ERROR");
```
```python
from functools import partial
log_error = partial(log, "ERROR")
```
`partial` can fix keyword arguments too: `partial(round, ndigits=2)`. Methods never need `.bind(this)`, because `obj.method` is already bound.

### Decorators: wrapping a function
```js
const fetchUser = withRetry(fetchUserRaw, { times: 3 });
```
```python
@retry(times=3)
def fetch_user(user_id):
    ...
```
`@retry(times=3)` above a `def` is shorthand for `fetch_user = retry(times=3)(fetch_user)`. In your own wrappers, use `functools.wraps` to keep the name and docstring ([Decorators](lesson:decorators)).

## Classes & objects

### `class` and `constructor`
```js
class User {
  constructor(name) { this.name = name; }
}
const ada = new User("Ada");
```
```python
class User:
    def __init__(self, name):
        self.name = name
ada = User("Ada")
```
`__init__` receives the new instance explicitly as `self`, and attributes come into existence when you assign them. There's no `new`: call the class ([Classes](lesson:classes)).

### Methods and `this`
```js
greet() { return `Hi, ${this.name}`; }
button.onclick = this.greet.bind(this);
```
```python
def greet(self):
    return f"Hi, {self.name}"

button.on_click(self.greet)  # already bound: no .bind() needed
```
Every method lists `self` first and must write `self.name`, since a bare `name` means a local or global variable. A method looked up on an instance remembers that instance, so it works as a callback as is.

### Class fields and `static` properties
```js
class Cart {
  static count = 0;
  items = [];
}
```
```python
class Cart:
    count = 0  # class attribute, shared
    def __init__(self):
        self.items = []  # one list per instance
```
A mutable value in the class body (`items = []`) is one object shared by every instance, unlike a JS class field. Create per-instance state in `__init__`, or use a dataclass with `field(default_factory=list)`.

### `static` methods and alternative constructors
```js
class User {
  static fromJSON(text) { return new User(JSON.parse(text).name); }
}
```
```python
class User:
    @classmethod
    def from_json(cls, text):
        return cls(json.loads(text)["name"])
```
A `@classmethod` receives the class as `cls`, so subclasses construct their own type. `@staticmethod` is a plain function namespaced in the class.

### `get` / `set` accessors → `@property`
```js
get fullName() { return `${this.first} ${this.last}`; }
set fullName(v) { [this.first, this.last] = v.split(" "); }
```
```python
@property
def full_name(self):
    return f"{self.first} {self.last}"
```
```python
@full_name.setter
def full_name(self, value):
    self.first, self.last = value.split(" ")
```
Properties read like attributes (`user.full_name`), so a plain attribute can become a property later without touching callers. `functools.cached_property` computes the value once per instance.

### `#private` fields
```js
class Account {
  #balance = 0;
}
```
```python
class Account:
    def __init__(self):
        self._balance = 0  # internal by convention
```
Nothing is enforced: a leading underscore means "internal, don't touch". A double underscore (`self.__balance`) is renamed to `_Account__balance`, which prevents clashes in subclasses but isn't security.

### `extends` and `super()`
```js
class Admin extends User {
  constructor(name, level) { super(name); this.level = level; }
}
```
```python
class Admin(User):
    def __init__(self, name, level):
        super().__init__(name)
        self.level = level
```
`super()` takes no arguments inside a method, and a subclass without its own `__init__` inherits the parent's. Multiple inheritance (`class C(A, B)`) is resolved by the method resolution order.

### `toString()` → `__repr__` / `__str__`
```js
toString() { return `User(${this.name})`; }
```
```python
def __repr__(self):
    return f"User(name={self.name!r})"
```
The REPL, debuggers and containers (`print([user])`) use `__repr__`, while `print(user)` and `str()` use `__str__`, which falls back to `__repr__`. Define `__repr__` first ([Dunder Methods](lesson:dunder-methods)).

### Data classes
```js
class Point {
  constructor(x, y) { this.x = x; this.y = y; }
}
```
```python
@dataclass  # from dataclasses import dataclass
class Point:
    x: float
    y: float
```
`@dataclass` generates `__init__`, `__repr__` and value-based `__eq__`; `frozen=True` makes instances immutable and hashable. Mutable defaults need `field(default_factory=list)` ([Dataclasses & Enums](lesson:dataclasses-and-enums)).

### Abstract classes
```js
class Shape {
  area() { throw new Error("not implemented"); }
}
```
```python
from abc import ABC, abstractmethod
class Shape(ABC):
    @abstractmethod
    def area(self) -> float: ...
```
Instantiating a class that still has abstract methods raises `TypeError`. For TS-style structural interfaces, use `typing.Protocol`.

### `obj[name]`: dynamic attributes
```js
user[field]
user[field] = value;
field in user
```
```python
getattr(user, field)  # getattr(user, field, None) for a default
setattr(user, field, value)
hasattr(user, field)
```
Square brackets mean indexing (`__getitem__`), a separate protocol from attributes. `vars(user)` returns the instance's attribute dict.

## Errors

### `throw new Error()` → `raise`
```js
throw new Error("Invalid email");
throw new RangeError("age must be positive");
```
```python
raise ValueError("Invalid email")
raise ValueError("age must be positive")
```
Raise a specific built-in exception (`ValueError`, `TypeError`, `KeyError`) or your own subclass, without `new` ([Errors & Exceptions](lesson:exceptions)).

### `try` / `catch` / `finally`
```js
try { config = JSON.parse(text); }
catch (err) { console.error(err.message); }
finally { file.close(); }
```
```python
try:
    config = json.loads(text)
except ValueError as err:
    print(err)
```
Catch the narrowest type you expect, because a bare `except:` also traps `KeyboardInterrupt` and `SystemExit`. `finally:` works as in JS, and an `else:` block runs only if nothing was raised.

### Catch specific error types
```js
catch (err) {
  if (err instanceof TypeError || err instanceof RangeError) report(err);
  else throw err;
}
```
```python
try:
    process(row)
except (TypeError, ValueError) as err:
    report(err)
```
Unmatched exceptions propagate on their own, so there's no `else throw`, and a bare `raise` inside `except` re-raises the current one. 3.14 also accepts `except TypeError, ValueError:` without parentheses when there's no `as`.

### Custom error classes
```js
class NotFoundError extends Error {
  constructor(id) { super(`No user ${id}`); this.id = id; }
}
```
```python
class NotFoundError(Exception):
    def __init__(self, user_id):
        super().__init__(f"No user {user_id}")
        self.user_id = user_id
```
Subclass `Exception`, never `BaseException`. Without extra fields, `class NotFoundError(LookupError): pass` is enough.

### `new Error(msg, { cause })` → `raise ... from`
```js
throw new Error("Config failed", { cause: err });
```
```python
raise ConfigError("Config failed") from err
```
The original lands on `__cause__` and both tracebacks are printed. `from None` hides it, and without `from` Python still links it as `__context__`.

### `err.message` / `err.name` / `err.stack`
```js
err.message
err.name
err.stack
```
```python
str(err)
type(err).__name__
traceback.format_exc()  # inside an except block
```
`err.args` holds the constructor arguments. In a handler, `logging.exception("msg")` logs your message plus the traceback.

### `catch {}`: ignore an error
```js
try { fs.unlinkSync(path); } catch {}
```
```python
from contextlib import suppress
with suppress(FileNotFoundError):
    os.remove(path)
```
Always name the exception you expect to ignore. For this particular case, `Path(path).unlink(missing_ok=True)` does it directly.

### `AggregateError` → `ExceptionGroup`
```js
throw new AggregateError(errors, "Several uploads failed");
```
```python
raise ExceptionGroup("Several uploads failed", errors)
```
```python
try:
    upload_all()
except* ValueError as group:
    print(group.exceptions)
```
Both need 3.11+. `except*` handles the matching sub-exceptions and re-raises the rest, and `asyncio.TaskGroup` raises these groups.

### `console.assert()` → `assert`
```js
console.assert(total >= 0, "negative total");
```
```python
assert total >= 0, "negative total"
```
A failing `assert` raises `AssertionError` where `console.assert` only logs. `python -O` strips asserts entirely, so never use them to validate input.

### JS error types → Python
```js
ReferenceError  // undefinedName
TypeError       // null.name, undefined()
RangeError      // new Array(-1)
SyntaxError     // JSON.parse("{")
```
```python
NameError       # undefined_name
AttributeError  # None.name (calling None is a TypeError)
ValueError      # int("x"); lookups raise IndexError and KeyError
json.JSONDecodeError  # json.loads("{"), a ValueError subclass
```
Many operations that quietly give `undefined` or `NaN` in JS raise in Python: missing keys and attributes, out-of-range indexes, failed conversions and division by zero.

### `using` / `try...finally` cleanup → `with`
```js
const file = await fs.open(path);
try { text = await file.readFile("utf8"); }
finally { await file.close(); }
```
```python
with open(path, encoding="utf-8") as f:
    text = f.read()
```
`with` runs the object's exit hook even when an exception escapes, like JS's `using` and `Symbol.dispose`. Write your own with `@contextlib.contextmanager` ([Context Managers](lesson:context-managers)).

## Iterators & generators

### `function*` / `yield`
```js
function* countdown(n) {
  while (n > 0) yield n--;
}
```
```python
def countdown(n):
    while n > 0:
        yield n
        n -= 1
```
Calling a generator function returns a lazy generator that runs nothing until you iterate it with `for`, `list()` or `next()` ([Iterators & Generators](lesson:iterators-and-generators)).

### `[Symbol.iterator]()` → `__iter__`
```js
class Playlist {
  *[Symbol.iterator]() { yield* this.songs; }
}
```
```python
class Playlist:
    def __iter__(self):
        yield from self.songs
```
A generator `__iter__` is the easiest way to make a class iterable, and `yield from` is `yield*`.

### `it.next()` → `next(it)`
```js
const it = items[Symbol.iterator]();
const { value, done } = it.next();
```
```python
it = iter(items)
value = next(it)        # raises StopIteration when exhausted
value = next(it, None)  # returns the default instead
```
There's no `{ value, done }` wrapper: exhaustion is signalled by `StopIteration`, which `for` loops handle for you.

### `iterator.take(n)` / `.drop(n)`
```js
ids().take(5).toArray()
lines.values().drop(1)
```
```python
from itertools import count, islice
list(islice(count(1), 5))  # [1, 2, 3, 4, 5]
islice(lines, 1, None)
```
`islice(it, start, stop, step)` works on any iterable but rejects negative values. `itertools.count`, `cycle` and `repeat` produce infinite iterators.

### Iterator helpers → generator expressions
```js
lines.values().filter((l) => l.trim()).map((l) => l.toUpperCase())
```
```python
(line.upper() for line in lines if line.strip())
```
Parentheses make a lazy generator expression: nothing runs until a consumer such as `for`, `list()`, `sum()` or `"".join()` pulls values.

### Iterating twice: exhaustion
```js
const doubled = nums.map((n) => n * 2);  // an array: reusable
```
```python
doubled = map(lambda n: n * 2, nums)
list(doubled)  # [2, 4, 6]
list(doubled)  # []: already exhausted
```
`map`, `filter`, `zip`, `reversed`, generators and open files are single-use iterators. Materialise one with `list()` if you need two passes.

### Running totals: `accumulate()`
```js
let total = 0;
const running = sales.map((x) => (total += x));
```
```python
from itertools import accumulate
running = list(accumulate(sales))
```
Pass a function for other running folds (`accumulate(prices, max)`) and `initial=` to seed the sequence.

### Adjacent pairs: `pairwise()`
```js
readings.slice(1).map((r, i) => r - readings[i])
```
```python
from itertools import pairwise
[b - a for a, b in pairwise(readings)]  # 3.10+
```
`pairwise` yields overlapping `(previous, current)` tuples lazily, with no index arithmetic.

### Nested loops: `product()` / `combinations()`
```js
for (const size of sizes) for (const color of colors) variants.push([size, color]);
```
```python
from itertools import product
variants = list(product(sizes, colors))
```
```python
from itertools import combinations
matchups = list(combinations(players, 2))  # every pair, order ignored
```
`permutations(players, 2)` gives ordered pairs instead. All three return lazy iterators of tuples.

## Async

### `async function` / `await`
```js
async function getUser(id) {
  const res = await fetch(`/api/users/${id}`);
  return res.json();
}
```
```python
async def get_user(user_id):
    response = await client.get(f"/api/users/{user_id}")
    return response.json()
```
Calling `get_user(1)` returns a coroutine that does nothing until it's awaited or scheduled, whereas a JS promise starts at once. A forgotten `await` shows up as a "coroutine was never awaited" warning ([Async/Await](lesson:async)).

### Run async code: `asyncio.run()`
```js
await main();  // top-level await in an ES module
```
```python
import asyncio
asyncio.run(main())
```
There's no ambient event loop: `asyncio.run()` creates one, runs the coroutine to completion and closes it. Call it once, at your program's entry point.

### `await new Promise((r) => setTimeout(r, ms))`: sleep
```js
await new Promise((resolve) => setTimeout(resolve, 500));
```
```python
await asyncio.sleep(0.5)  # seconds, not milliseconds
```
```python
time.sleep(0.5)  # sync code only: blocks the whole thread
```
Inside a coroutine, `time.sleep` freezes every other task on the loop, so always `await asyncio.sleep()` there.

### `setTimeout()` / `setInterval()`
```js
const id = setTimeout(save, 1000);
clearTimeout(id);
setInterval(poll, 5000);
```
```python
loop = asyncio.get_running_loop()
handle = loop.call_later(1.0, save)
handle.cancel()
```
```python
async def every(seconds, fn):
    while True:
        fn()
        await asyncio.sleep(seconds)
```
Timers need a running event loop and take seconds. For an interval, start `every(5, poll)` with `asyncio.create_task()` and cancel the task to stop it.

### `Promise.all()` / `Promise.allSettled()`
```js
const [user, posts] = await Promise.all([getUser(id), getPosts(id)]);
const results = await Promise.allSettled(jobs);
```
```python
user, posts = await asyncio.gather(get_user(uid), get_posts(uid))
results = await asyncio.gather(*jobs, return_exceptions=True)
```
```python
async with asyncio.TaskGroup() as tg:  # 3.11+
    user_task = tg.create_task(get_user(uid))
    posts_task = tg.create_task(get_posts(uid))
```
`gather` returns results in argument order, and `return_exceptions=True` puts exceptions in the list instead of raising. Without it, one failure raises but leaves the others running, whereas a `TaskGroup` cancels its remaining tasks.

### `Promise.race()` / `Promise.any()`
```js
const first = await Promise.race([fetchA(), fetchB()]);
```
```python
done, pending = await asyncio.wait(tasks, return_when=asyncio.FIRST_COMPLETED)
for task in pending:
    task.cancel()
first = done.pop().result()
```
`asyncio.wait` takes tasks (wrap coroutines with `create_task`), and the losers keep running until you cancel them. For `Promise.any`, loop over `asyncio.as_completed()` and return the first result that doesn't raise.

### Timeouts: `AbortSignal.timeout()`
```js
await fetch(url, { signal: AbortSignal.timeout(5000) });
```
```python
async with asyncio.timeout(5):  # 3.11+
    data = await fetch(url)
```
```python
data = await asyncio.wait_for(fetch(url), timeout=5)
```
Both cancel the work and raise `TimeoutError` when the time runs out.

### Background tasks and `AbortController`
```js
sendAnalytics(event);  // starts immediately, not awaited
const controller = new AbortController();
controller.abort();
```
```python
task = asyncio.create_task(send_analytics(event))
task.cancel()  # raises CancelledError inside the coroutine
```
A bare `send_analytics(event)` call would never run, so schedule it with `create_task` and keep a reference, because the loop holds tasks only weakly. Cancellation arrives as `CancelledError` at the coroutine's next `await`.

### `for await` / async generators
```js
async function* pages() { yield await fetchPage(1); }
for await (const page of pages()) {}
```
```python
async def pages():
    yield await fetch_page(1)
async for page in pages():
    ...
```
`async with` is the matching form for async context managers such as database sessions and HTTP clients.

### Limit concurrency (`p-limit`)
```js
const limit = pLimit(5);
await Promise.all(urls.map((u) => limit(() => fetch(u))));
```
```python
sem = asyncio.Semaphore(5)
async def fetch_limited(url):
    async with sem:
        return await fetch(url)
```
Then `await asyncio.gather(*(fetch_limited(u) for u in urls))` runs them all with at most five inside the `async with` at once.

### Blocking work: `worker_threads`
```js
const worker = new Worker("./resize.js", { workerData: file });
worker.on("message", (result) => save(result));
```
```python
result = await asyncio.to_thread(resize_image, file)
```
`to_thread` runs a blocking call in a thread so the event loop keeps serving other tasks. On the standard (GIL) build, threads don't run Python code in parallel, so CPU-heavy work belongs in `concurrent.futures.ProcessPoolExecutor`.

## Modules & tooling

### `import { x } from "./mod.js"`
```js
import { slugify, parseDate } from "./utils.js";
import * as utils from "./utils.js";
import { readFile as read } from "node:fs/promises";
```
```python
from utils import slugify, parse_date
import utils
from json import loads as parse_json
```
Module names have no extension or `./` and resolve through `sys.path` (the script's directory first), and inside a package you use relative imports such as `from .utils import slugify`. A module runs once and is cached in `sys.modules` ([Modules & Tooling](lesson:modules-and-tooling)).

### `export` / `export default`
```js
export function slugify(s) {}
export default class Client {}
```
```python
def slugify(text): ...  # every top-level name is importable
__all__ = ["slugify", "Client"]  # limits `from utils import *`
```
There are no export statements and no default export: importers name what they want. A leading underscore marks a name as private by convention.

### `import.meta.main` / `require.main === module`
```js
if (import.meta.main) main();
if (require.main === module) main();
```
```python
if __name__ == "__main__":
    main()
```
`__name__` is `"__main__"` only in the module Python was started with (`python app.py` or `python -m app`); imported modules see their own name.

### `npm install` / `npm ci`
```bash
npm install express
npm install --save-dev vitest
npm ci
```
```bash
uv add httpx
uv add --dev pytest
uv sync
```
```bash
python -m pip install httpx
python -m pip install -r requirements.txt
```
`uv add` records the dependency in `pyproject.toml` and `uv.lock`, and `uv sync` makes `.venv` match the lockfile exactly, like `npm ci`. Plain `pip` installs into whichever environment is active.

### `package.json` → `pyproject.toml`
```json
{ "name": "billing", "version": "1.0.0",
  "dependencies": { "express": "^4.19.0" } }
```
```toml
[project]
name = "billing"
version = "1.0.0"
dependencies = ["httpx>=0.27"]
```
`requires-python = ">=3.12"` plays the role of `engines` and `[project.scripts]` the role of `bin`. Tool settings live in the same file under `[tool.ruff]`, `[tool.mypy]` and so on.

### `node_modules` → a virtual environment
```bash
npm install  # creates ./node_modules
```
```bash
uv venv  # or: python -m venv .venv
source .venv/bin/activate  # Windows: .venv\Scripts\activate
```
Without a virtual environment, `pip` installs into the global interpreter. `uv sync` and `uv run` create and use `.venv` automatically, with no activation step.

### `npx` → `uvx`
```bash
npx prettier --check .
npm run test
```
```bash
uvx ruff format --check .
uv run pytest
```
```bash
pipx run ruff format --check .
```
`uvx` and `pipx run` run a tool from a cached, isolated environment without adding it to the project. `pyproject.toml` has no npm-style `scripts` table, so use `uv run` to execute any command inside the project's environment.

### ESLint + Prettier → Ruff
```bash
npx eslint . --fix
npx prettier --write .
```
```bash
ruff check . --fix
ruff format .
```
Ruff replaces flake8, isort and Black in one fast tool, configured under `[tool.ruff]` in `pyproject.toml`.

### Jest / Vitest → pytest
```js
test("parses ages", () => {
  expect(parseAge("42")).toBe(42);
  expect(() => parseAge("abc")).toThrow(RangeError);
});
```
```python
def test_parses_ages():
    assert parse_age("42") == 42
    with pytest.raises(ValueError):
        parse_age("abc")
```
pytest (third-party) collects `test_*.py` files and `test_*` functions, and rewrites plain `assert` to show both sides on failure. Run it with `uv run pytest`, filtering with `-k ages`.

### `process.env`
```js
const apiKey = process.env.API_KEY;
const port = Number(process.env.PORT ?? 3000);
```
```python
import os
api_key = os.environ["API_KEY"]  # KeyError if unset
port = int(os.environ.get("PORT", "3000"))
```
Values are always strings, and `os.getenv("X")` returns `None` when the variable is unset. For `.env` files, use the third-party `python-dotenv`.

### `process.argv` / `process.exit()`
```js
const [, , inputPath] = process.argv;
process.exit(1);
```
```python
import sys
input_path = sys.argv[1]  # argv[0] is the script
sys.exit(1)
```
```python
parser = argparse.ArgumentParser()
parser.add_argument("input_path")
args = parser.parse_args()
```
`argparse` generates `--help` and usage errors for you. `sys.exit()` raises `SystemExit`, so `finally` blocks still run, and `sys.exit("message")` prints the message to stderr and exits with status 1.

### `child_process` → `subprocess`
```js
const sha = execSync("git rev-parse HEAD").toString().trim();
```
```python
result = subprocess.run(["git", "rev-parse", "HEAD"],
                        capture_output=True, text=True, check=True)
sha = result.stdout.strip()
```
A list of arguments skips the shell, so there's no quoting or injection risk, and `check=True` raises `CalledProcessError` on a non-zero exit code.

## Dates & time

### `new Date()` / `Date.now()`
```js
new Date()
Date.now()  // milliseconds since the epoch
```
```python
from datetime import datetime, UTC
datetime.now(UTC)  # timezone-aware; datetime.UTC is 3.11+
time.time()        # seconds since the epoch, as a float
```
`datetime.now()` without a time zone returns a *naive* local time, and mixing naive and aware datetimes in `<` or `-` raises `TypeError`, so prefer aware UTC values ([Batteries Included](lesson:standard-library)).

### `new Date(2024, 0, 15)`: build a date
```js
new Date(2024, 0, 15)  // January: months are 0-based
new Date(2024, 1, 30)  // rolls over to March 1
```
```python
datetime(2024, 1, 15)  # January: months are 1-based
date(2024, 2, 30)      # ValueError: no rollover
```
A `date` holds just a calendar day, and a `datetime` adds the time.

### Parse an ISO 8601 string
```js
new Date("2024-01-15T10:30:00Z")
new Date("2024-01-15")
```
```python
datetime.fromisoformat("2024-01-15T10:30:00Z")  # "Z" needs 3.11+
date.fromisoformat("2024-01-15")
```
A string without an offset gives a naive datetime. Before 3.11, `fromisoformat` only accepted the exact format that `isoformat()` produces.

### `toISOString()`
```js
new Date().toISOString()  // "2024-01-15T10:30:00.000Z"
```
```python
datetime.now(UTC).isoformat()  # '2024-01-15T10:30:00.123456+00:00'
```
```python
datetime.now(UTC).isoformat(timespec="milliseconds").replace("+00:00", "Z")
```
`isoformat()` writes `+00:00` rather than `Z`, includes microseconds only when they're non-zero, and leaves the offset out entirely for naive datetimes.

### `getFullYear()` / `getMonth()` / `getDay()`
```js
d.getFullYear(); d.getMonth();  // 0-11
d.getDate(); d.getDay();        // 0 = Sunday
d.getHours(); d.getMinutes();
```
```python
d.year, d.month     # 1-12
d.day, d.weekday()  # 0 = Monday; isoweekday() gives 1-7
d.hour, d.minute
```
`year`, `month`, `day` and the time fields are attributes, not methods, and `weekday()` counts from Monday rather than Sunday.

### Add or subtract time
```js
d.setDate(d.getDate() + 7);
new Date(d.getTime() + 90 * 60 * 1000)
```
```python
d + timedelta(days=7)
d + timedelta(minutes=90)
```
Datetimes are immutable, so arithmetic returns a new object. `timedelta` has no months or years: use `d.replace(year=d.year + 1)` (which raises on 29 February) or the third-party `dateutil.relativedelta`.

### Difference and comparison
```js
const days = (end - start) / 86_400_000;
a.getTime() === b.getTime()
```
```python
delta = end - start  # a timedelta
delta.days, delta.total_seconds()
a == b  # compares values
```
`delta.seconds` is only the seconds *component* (0 to 86399), not the total, so use `total_seconds()`. Datetimes compare and sort by value, while `===` on two JS `Date`s compares references.

### Format and parse: `strftime()` / `strptime()`
```js
format(d, "yyyy-MM-dd HH:mm")  // date-fns
parse("15/01/2024", "dd/MM/yyyy", new Date())
```
```python
d.strftime("%Y-%m-%d %H:%M")
datetime.strptime("15/01/2024", "%d/%m/%Y")
```
```python
f"{d:%d %b %Y}"  # '15 Jan 2024'
```
`strptime` raises `ValueError` unless the string matches the format exactly. Month and day names (`%b`, `%A`) follow the current locale.

### Unix timestamps
```js
new Date(1705314600000)
d.getTime()  // milliseconds
```
```python
datetime.fromtimestamp(1705314600, UTC)
d.timestamp()  # seconds, as a float
```
Python timestamps are seconds where JS uses milliseconds, so divide or multiply by 1000 when crossing over. Without a time zone argument, `fromtimestamp` returns naive local time.

### Time zones
```js
d.toLocaleString("en-US", { timeZone: "America/New_York" })
```
```python
from zoneinfo import ZoneInfo
d.astimezone(ZoneInfo("America/New_York"))
```
`zoneinfo` (3.9+) reads the system's time zone database, so on Windows install the `tzdata` package. The in-browser playground has no time zone data.

### `performance.now()` / `console.time()`
```js
const t0 = performance.now();
work();
console.log(`${performance.now() - t0} ms`);
```
```python
t0 = time.perf_counter()
work()
print(f"{time.perf_counter() - t0:.3f} s")
```
`perf_counter()` is monotonic and high-resolution, made for durations; keep `time.time()` for wall-clock timestamps. `python -m timeit` benchmarks small snippets.

## Regular expressions

### `/re/.test(s)`
```js
/^\d{5}$/.test(zip)
/error/i.test(line)
```
```python
re.fullmatch(r"\d{5}", zip_code)  # a Match object or None
re.search(r"error", line, re.IGNORECASE)
```
`re.search` matches anywhere, `re.match` only at the start and `re.fullmatch` the whole string; wrap the result in `bool()` for a real `True`/`False`. Write patterns as raw strings (`r"..."`) so backslashes survive.

### `^...$` and a trailing newline
```js
/^\d+$/.test("123\n")  // false
```
```python
re.search(r"^\d+$", "123\n")   # matches: $ also matches before a final \n
re.fullmatch(r"\d+", "123\n")  # None
```
To anchor at the true end of the string, use `fullmatch` or `\Z`.

### `s.match(re)` / `re.exec(s)`: capture groups
```js
const m = s.match(/(\d{4})-(\d{2})/);
const [, year, month] = m;
m.index
```
```python
m = re.search(r"(\d{4})-(\d{2})", s)
if m:
    year, month = m.groups()  # or m[1], m[2]; m.start() is the index
```
No match returns `None`, as JS returns `null`, so check before indexing. `m[0]` (or `m.group()`) is the whole match.

### `s.match(/.../g)` → `re.findall()`
```js
text.match(/#\w+/g)  // null when nothing matches
```
```python
re.findall(r"#\w+", text)  # [] when nothing matches
```
With one capture group, `findall` returns that group's text, and with several it returns tuples of groups, never the whole match. Use `finditer` when you need both.

### `matchAll()` → `re.finditer()`
```js
for (const m of text.matchAll(/(\w+)=(\d+)/g)) {
  console.log(m[1], m[2], m.index);
}
```
```python
for m in re.finditer(r"(\w+)=(\d+)", text):
    print(m[1], m[2], m.start())
```
`finditer` yields `Match` objects lazily, and needs no `g` flag.

### `replace(/.../g)` → `re.sub()`
```js
s.replace(/\s+/g, " ")
s.replace(/(\w+)@(\w+)/, "$2 at $1")
s.replace(/\d+/g, (n) => n * 2)
```
```python
re.sub(r"\s+", " ", s)  # replaces every match
re.sub(r"(\w+)@(\w+)", r"\2 at \1", s, count=1)
re.sub(r"\d+", lambda m: str(int(m[0]) * 2), s)
```
`re.sub` is global by default (`count=1` replaces only the first match), and backreferences are `\1` or `\g<name>` instead of `$1`. A replacement function receives a `Match` and must return a `str`.

### Named groups: `(?<name>...)`
```js
const { year } = s.match(/(?<year>\d{4})/).groups;
```
```python
m = re.search(r"(?P<year>\d{4})", s)
m["year"], m.groupdict()
```
Python spells it `(?P<name>...)`, and the JS form `(?<name>...)` is a `re.error`. Refer back to a named group with `(?P=name)`.

### Flags: `/i`, `/m`, `/s`
```js
/^total/im
/a.b/s
```
```python
re.compile(r"^total", re.IGNORECASE | re.MULTILINE)
re.compile(r"(?s)a.b")  # inline flags
```
There's no `g` flag, because each function decides how many matches it finds. `\d` and `\w` match any Unicode digit or letter (`"٣"` is a `\d`), so add `re.ASCII` for JS's `[0-9]` behaviour.

### `RegExp.escape()`: escape user input
```js
new RegExp(RegExp.escape(term), "i")
```
```python
re.compile(re.escape(term), re.IGNORECASE)
```
Escape any user-provided text before embedding it in a pattern. The module-level functions cache compiled patterns, so `re.compile` is mostly for naming and reuse.

### Lookbehind
```js
/(?<=\$)\d+/
/(?<=\$\s*)\d+/  // variable-width: fine in JS
```
```python
re.search(r"(?<=\$)\d+", text)
```
```python
re.search(r"\$\s*(\d+)", text)[1]  # a capture group instead
```
Python lookbehinds must be fixed-width, so `(?<=\$\s*)` raises `re.error`. The third-party `regex` module lifts that limit.

## JSON & data

### `JSON.parse()`
```js
const data = JSON.parse(text);
```
```python
import json
data = json.loads(text)
```
```python
with open("data.json", encoding="utf-8") as f:
    data = json.load(f)
```
Objects become dicts, arrays lists, `null` `None` and `true` `True`. Invalid JSON raises `json.JSONDecodeError`, a `ValueError` subclass ([Dicts](lesson:dicts)).

### `JSON.stringify()`
```js
JSON.stringify(data)
JSON.stringify(data, null, 2)
```
```python
json.dumps(data)
json.dumps(data, indent=2)
```
```python
json.dumps(data, separators=(",", ":"), ensure_ascii=False)  # compact, raw "é"
```
By default the output puts a space after `,` and `:` (unlike JS) and escapes non-ASCII characters as `\u00e9`. `sort_keys=True` makes the output stable.

### `toJSON()`: dates and sets in JSON
```js
JSON.stringify({ at: new Date(), tags: new Set(["a"]) })
// '{"at":"2024-...Z","tags":{}}'
```
```python
json.dumps(payload, default=str)  # fallback for unknown types
```
```python
json.dumps(asdict(order))  # dataclass -> dict first
```
Python raises `TypeError` for anything it can't serialise (datetimes, sets, dataclasses) instead of silently writing `{}` or dropping `undefined`. The `default=` function is called for each unsupported object.

### Read and write files: `fs.readFileSync()`
```js
const text = fs.readFileSync("notes.txt", "utf8");
fs.writeFileSync("out.txt", text);
fs.appendFileSync("log.txt", line + "\n");
```
```python
text = Path("notes.txt").read_text(encoding="utf-8")
Path("out.txt").write_text(text, encoding="utf-8")
```
```python
with open("log.txt", "a", encoding="utf-8") as f:
    f.write(line + "\n")
```
Always pass `encoding="utf-8"`, because the default depends on the platform and often isn't UTF-8 on Windows. Mode `"w"` truncates, `"a"` appends, `"x"` fails if the file exists, and adding `"b"` reads or writes bytes.

### Read a file line by line
```js
const rl = readline.createInterface({ input: fs.createReadStream(path) });
for await (const line of rl) {}
```
```python
with open(path, encoding="utf-8") as f:
    for line in f:  # lazy: one line at a time
        handle(line.rstrip("\n"))
```
Each line keeps its trailing `"\n"`. For small files, `Path(path).read_text(encoding="utf-8").splitlines()` is fine.

### `path.join()` / `basename()` / `__dirname`
```js
path.join(__dirname, "data", "users.json")
path.basename(p); path.extname(p); path.dirname(p);
```
```python
Path(__file__).parent / "data" / "users.json"
p.name, p.suffix, p.parent  # p.stem is the name without the suffix
```
`pathlib.Path` objects join with `/` and work on every OS, and `str(p)` gives the string back. `Path(__file__).resolve().parent` is the absolute equivalent of `__dirname`.

### `existsSync()` / `mkdirSync()` / `readdirSync()`
```js
fs.existsSync(p)
fs.mkdirSync(dir, { recursive: true });
fs.readdirSync(dir).filter((f) => f.endsWith(".md"))
```
```python
p.exists()  # also is_file() and is_dir()
out_dir.mkdir(parents=True, exist_ok=True)
sorted(docs_dir.glob("*.md"))  # rglob() searches recursively
```
`glob()` and `iterdir()` yield `Path` objects in arbitrary order, so sort them when the order matters.

### CSV
```js
Papa.parse(text, { header: true }).data  // papaparse
```
```python
import csv
with open("users.csv", newline="", encoding="utf-8") as f:
    rows = list(csv.DictReader(f))
```
Every value arrives as a string, so convert types yourself, and open CSV files with `newline=""` as the `csv` docs require. `csv.DictWriter` writes rows back out.

### `URL` / `URLSearchParams` / `encodeURIComponent()`
```js
const url = new URL("https://shop.dev/search?q=shoes&page=2");
url.searchParams.get("page");
new URLSearchParams({ q: "red shoes" }).toString();
encodeURIComponent("a b&c/d")
```
```python
url = urlparse("https://shop.dev/search?q=shoes&page=2")
parse_qs(url.query)["page"][0]  # values are lists: keys can repeat
urlencode({"q": "red shoes"})   # 'q=red+shoes'
quote("a b&c/d", safe="")       # 'a%20b%26c%2Fd'
```
All four functions live in `urllib.parse`. `quote` leaves `/` unescaped unless you pass `safe=""`, and `url.scheme`, `url.netloc` and `url.path` hold the other parts.

### Base64: `btoa()` / `atob()`
```js
btoa("hello")     // "aGVsbG8="
atob("aGVsbG8=")
Buffer.from(bytes).toString("base64")
```
```python
import base64
base64.b64encode(b"hello").decode("ascii")  # 'aGVsbG8='
base64.b64decode("aGVsbG8=")  # b'hello'
```
Base64 works on bytes, so encode text first (`text.encode()`) and decode the result if you want a `str`. `urlsafe_b64encode` uses `-` and `_` instead of `+` and `/`.

### `TextEncoder` / `Buffer`: bytes and str
```js
new TextEncoder().encode("héllo")  // Uint8Array
new TextDecoder().decode(bytes)
```
```python
data = "héllo".encode("utf-8")  # b'h\xc3\xa9llo'
text = data.decode("utf-8")
```
`bytes` and `str` never mix (`b"a" + "b"` raises `TypeError`), and `len(data)` counts bytes. `bytes` is immutable, and `bytearray` is the mutable, `Uint8Array`-like version.

### `crypto`: UUIDs, tokens and hashes
```js
crypto.randomUUID()
crypto.getRandomValues(new Uint8Array(16))
crypto.createHash("sha256").update(text).digest("hex")
```
```python
str(uuid.uuid4())
secrets.token_hex(16)  # also token_bytes() and token_urlsafe()
hashlib.sha256(text.encode()).hexdigest()
```
Use `secrets`, never `random`, for anything security-sensitive. `uuid.uuid7()` (3.14+) makes time-ordered IDs that sort well as database keys.

### `fetch()`
```js
const res = await fetch("https://api.example.com/users");
if (!res.ok) throw new Error(res.statusText);
const users = await res.json();
```
```python
response = httpx.get("https://api.example.com/users")  # pip install httpx
response.raise_for_status()
users = response.json()
```
```python
from urllib.request import urlopen
with urlopen("https://api.example.com/users") as res:
    users = json.load(res)
```
httpx and requests are third-party, and httpx also has an `AsyncClient` for `await`. The stdlib `urlopen` raises `HTTPError` for 4xx and 5xx responses, unlike `fetch`.

## TypeScript → type hints

### Annotate variables
```ts
let count: number = 0;
let price: number = 9.99;
let name: string = "Ada";
let active: boolean = true;
```
```python
count: int = 0
price: float = 9.99  # an int is accepted where a float is expected
name: str = "Ada"
active: bool = True
```
Annotations aren't enforced at runtime (`count: int = "zero"` runs fine); a checker such as mypy or pyright reports the mismatch ([Type Hints](lesson:type-hints)).

### Function signatures
```ts
function greet(name: string, times: number = 1): string {}
function log(msg: string): void {}
```
```python
def greet(name: str, times: int = 1) -> str: ...
def log(msg: str) -> None: ...
```
The return type follows `->`, and `void` becomes `None`. Checkers treat unannotated parameters as `Any`.

### `T[]` / tuples / `Record<K, V>`
```ts
string[]
[number, string]
Record<string, number>
ReadonlyArray<string>
```
```python
list[str]
tuple[int, str]  # tuple[int, ...] for any length
dict[str, int]
Sequence[str]    # from collections.abc
```
Use the builtin generics (3.9+) rather than the legacy `typing.List` and `typing.Dict`. For parameters, `Sequence` and `Mapping` from `collections.abc` accept more types and signal that you won't mutate them.

### `T | null` and optional parameters
```ts
function find(id: string): User | null {}
function greet(name?: string) {}
```
```python
def find(user_id: str) -> User | None: ...
def greet(name: str | None = None): ...
```
`X | None` (3.10+) replaces `Optional[X]`. There's no separate `undefined`, and an optional parameter still needs a default value.

### Unions, literal types and `type` aliases
```ts
type Id = string | number;
type Method = "GET" | "POST";
```
```python
type Id = str | int  # 3.12+
type Method = Literal["GET", "POST"]  # from typing import Literal
```
```python
Id: TypeAlias = str | int  # before 3.12
```
Checkers narrow unions in `isinstance` checks and `match` statements, like TS control-flow narrowing. For exhaustiveness, end with `case _: assert_never(value)` (3.11+).

### `interface` for data → `TypedDict`
```ts
interface User {
  name: string;
  email?: string;
}
```
```python
class User(TypedDict):
    name: str
    email: NotRequired[str]
```
A `TypedDict` describes the shape of a plain dict, such as parsed JSON, and at runtime it's just a `dict`. `total=False` makes every key optional (like `Partial<T>`), and `ReadOnly[...]` (3.13+) marks keys read-only.

### `interface` for behaviour → `Protocol`
```ts
interface Closable { close(): void; }
function shutdown(resource: Closable) { resource.close(); }
```
```python
class Closable(Protocol):
    def close(self) -> None: ...
def shutdown(resource: Closable) -> None:
    resource.close()
```
Protocols are structural, like TS interfaces: any object with a matching `close()` qualifies without inheriting from it. Ordinary classes and ABCs are nominal.

### Generics: `<T>`
```ts
function first<T>(items: T[]): T | undefined {}
class Box<T> { constructor(public value: T) {} }
```
```python
def first[T](items: list[T]) -> T | None: ...
class Box[T]:
    def __init__(self, value: T) -> None:
        self.value = value
```
```python
T = TypeVar("T")  # before 3.12
def first(items: list[T]) -> T | None: ...
```
The bracket syntax needs 3.12+. Bounds and constraints go after a colon: `[T: Comparable]`, `[T: (str, bytes)]`.

### Function types
```ts
type Handler = (event: Event) => void;
type Fetcher = () => Promise<string>;
```
```python
from collections.abc import Awaitable, Callable
type Handler = Callable[[Event], None]
type Fetcher = Callable[[], Awaitable[str]]
```
`Callable[..., R]` accepts any arguments. To preserve a wrapped function's exact signature in a decorator, use `ParamSpec`.

### `any` / `unknown` / `never`
```ts
let data: any;
let input: unknown;
function fail(msg: string): never { throw new Error(msg); }
```
```python
data: Any
user_input: object  # like unknown: narrow before use
def fail(msg: str) -> Never: ...
```
`Any` switches checking off, while `object` accepts everything but allows almost nothing until you narrow it. `Never` is 3.11+ (`NoReturn` before), and all three come from `typing` except `object`.

### `as` casts, `!` and `x is T` guards
```ts
const el = document.getElementById("app") as HTMLDivElement;
user!.name
function isString(x: unknown): x is string {}
```
```python
el = cast(Element, find_element("app"))  # from typing import cast
assert user is not None  # narrows like user!
def is_str(x: object) -> TypeIs[str]: ...
```
`cast` does nothing at runtime; it only tells the checker what to believe. `TypeIs` (3.13+) is the `x is T` return type, though plain `isinstance` checks already narrow.

### `enum`
```ts
enum Status { Active = "active", Banned = "banned" }
```
```python
class Status(StrEnum):  # from enum import StrEnum; 3.11+
    ACTIVE = "active"
    BANNED = "banned"
```
Members are singletons: look one up with `Status("active")`, iterate with `for s in Status`, and compare with `is` or `==`. A `StrEnum` member also equals its string value ([Dataclasses & Enums](lesson:dataclasses-and-enums)).

### zod → pydantic
```ts
const User = z.object({ name: z.string(), age: z.number().int() });
const user = User.parse(JSON.parse(raw));
```
```python
class User(BaseModel):  # pip install pydantic
    name: str
    age: int
user = User.model_validate_json(raw)
```
pydantic validates at runtime from your annotations and raises `ValidationError`. By default it coerces compatible input such as `"36"` to `36`; strict mode refuses that.

### `tsc --noEmit` → mypy / pyright
```bash
npx tsc --noEmit
```
```bash
uvx mypy src/
uvx pyright
```
Python never checks annotations itself, so run a checker in CI the way you run `tsc`. `reveal_type(expr)` makes the checker print an expression's inferred type.

## Lodash-style utilities

### `_.chunk()`
```js
_.chunk(items, 3)
```
```python
from itertools import batched
list(batched(items, 3))  # 3.12+: yields tuples
```
```python
[items[i:i + 3] for i in range(0, len(items), 3)]
```
Both keep a shorter final chunk, as lodash does.

### `_.keyBy()`
```js
_.keyBy(users, "id")
```
```python
{u["id"]: u for u in users}
```
Later duplicates win, as in lodash.

### `_.uniqBy()`
```js
_.uniqBy(users, "email")
```
```python
first_by_email = {}
for u in users:
    first_by_email.setdefault(u["email"], u)
unique = list(first_by_email.values())
```
This keeps the first user per email, in their original order. The one-liner `list({u["email"]: u for u in users}.values())` keeps the *last* duplicate instead.

### `_.pick()` / `_.omit()`
```js
_.pick(user, ["id", "name"])
_.omit(user, ["password", "token"])
```
```python
{k: user[k] for k in ("id", "name") if k in user}
{k: v for k, v in user.items() if k not in {"password", "token"}}
```
Both build new dicts and leave `user` untouched.

### `_.get()`: deep get with a default
```js
_.get(data, "user.address.city", "unknown")
```
```python
try:
    city = data["user"]["address"]["city"]
except (KeyError, IndexError, TypeError):
    city = "unknown"
```
`TypeError` covers a `None` (or another non-container) somewhere along the path. For dict-only paths, chained `.get(key, {})` also works.

### `_.zip()` / `_.unzip()`
```js
_.zip(names, ages)
_.unzip(pairs)
```
```python
list(zip(names, ages))
names, ages = zip(*pairs)
```
```python
from itertools import zip_longest
list(zip_longest(names, ages))  # pads with None
```
`zip` stops at the shortest input, while `_.zip` pads with `undefined`, which is what `zip_longest` does.

### `_.flattenDeep()`
```js
_.flattenDeep([1, [2, [3, [4]]]])
```
```python
def flatten(items):
    for x in items:
        yield from flatten(x) if isinstance(x, list) else [x]
```
Call `list(flatten(nested))`. For a single level, see `flat()`.

### `_.partition()`
```js
const [active, inactive] = _.partition(users, (u) => u.active);
```
```python
active, inactive = [], []
for u in users:
    (active if u["active"] else inactive).append(u)
```
One pass over the data; two comprehensions are fine too when the list is small.

### `_.sum()` / `_.mean()` / `_.sumBy()`
```js
_.sum(scores); _.mean(scores);
_.sumBy(items, "price");
```
```python
sum(scores), statistics.mean(scores), statistics.median(scores)
sum(item["price"] for item in items)
```
`statistics.mean([])` raises `StatisticsError` where lodash returns `NaN`. `statistics.fmean` is faster for floats.

### `_.memoize()` / `_.once()`
```js
const fib = _.memoize((n) => (n < 2 ? n : fib(n - 1) + fib(n - 2)));
```
```python
from functools import cache
@cache
def fib(n):
    return n if n < 2 else fib(n - 1) + fib(n - 2)
```
Arguments must be hashable, `@lru_cache(maxsize=256)` bounds the cache, and `@cache` on a zero-argument function behaves like `_.once`.

### `_.camelCase()` / `_.snakeCase()`
```js
_.snakeCase("userId")   // "user_id"
_.camelCase("user_id")  // "userId"
```
```python
re.sub(r"(?<!^)(?=[A-Z])", "_", "userId").lower()  # 'user_id'
```
```python
first, *rest = "user_id".split("_")
first + "".join(word.title() for word in rest)  # 'userId'
```
These are minimal versions: lodash also handles spaces, dashes and acronyms such as `"HTTPServer"`.

### `_.take()` / `_.takeRight()` / `_.drop()`
```js
_.take(items, n)
_.takeRight(items, n)
_.drop(items, n)
```
```python
items[:n]
items[-n:] if n else []
items[n:]
```
`items[-n:]` on its own returns the *whole* list when `n` is 0, because `-0 == 0`.
