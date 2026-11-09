---
title: Strings & f-strings
part: Foundations
summary: Template literals become f-strings, tagged templates become t-strings, and String methods get new names.
minutes: 40
---

A Python `str` is an immutable sequence of Unicode code points, close enough to a JavaScript string that most code ports line by line. The syntax is where you'll stumble first. There are no backtick strings, so template literals become **f-strings**, and tagged templates become **t-strings** (new in 3.14). After that it's mostly vocabulary, plus a few traps: `replace` replaces every match, `strip("abc")` strips *characters* rather than a prefix, `len()` counts code points instead of UTF-16 units, and regular expressions live in the `re` module instead of the syntax.

## Quotes, escapes and raw strings

:::compare
```js
const a = 'single';
const b = "double";
const c = `template ${a}`;
const multi = `line one
line two`;
const path = String.raw`C:\new\table`;
const grin = "\u{1F600}";
```
```python
a = 'single'
b = "double"
c = f"template {a}"
multi = """line one
line two"""
path = r"C:\new\table"
grin = "\U0001F600"        # or "\N{GRINNING FACE}"
```
:::

Single and double quotes are interchangeable, as in JS; ruff and black normalize to double. Triple quotes (`"""` or `'''`) span lines and keep the newlines, so they replace multi-line template literals, and they're how docstrings are written (see [First Contact](lesson:first-contact)). A raw string, `r"..."`, turns backslash escapes off like `String.raw`, which is what you want for regexes and Windows paths.

The escapes are the familiar ones (`\n`, `\t`, `\\`, `\xNN`, `\uNNNN`), minus the braced `\u{...}` form. Astral characters take eight hex digits, `\U0001F600`, or their Unicode name, `\N{GRINNING FACE}`.

```python run
print("It's" == 'It\'s')            # same string, different quoting
print("tab:\there", r"raw:\there")
print("\N{EM DASH} \U0001F600 \u00e9")

query = (
    "SELECT name, email "
    "FROM users "                   # adjacent literals are joined
    "WHERE active"
)
print(query)
```

:::gotcha A missing comma glues strings together
Adjacent string literals are concatenated at compile time. That's handy inside parentheses, as above, but it also means a forgotten comma silently merges two list items: `["red" "green", "blue"]` is `['redgreen', 'blue']`. JavaScript would give you a SyntaxError.
:::

:::gotcha Unknown escapes keep their backslash
In JS, `"\d"` is just `"d"`. Python keeps the backslash, so `"\d"` is two characters, and since 3.12 the compiler warns: `SyntaxWarning: "\d" is an invalid escape sequence`. Write regexes as raw strings, `r"\d+"`. One limit: a raw string can't end in a single backslash, so `r"C:\temp\"` is a SyntaxError.
:::

## Template literals → f-strings

:::compare
```js
const user = { name: "Ada", langs: ["en", "fr"] };
const total = 1234.5;

`Hello, ${user.name}!`;
`${user.langs.length} languages`;
`Total: ${total.toFixed(2)}`;
`${user.name.toUpperCase()} speaks ${user.langs.join(", ")}`;
`Admin: ${user.admin ?? false}`;
```
```python
user = {"name": "Ada", "langs": ["en", "fr"]}
total = 1234.5

f"Hello, {user['name']}!"
f"{len(user['langs'])} languages"
f"Total: {total:.2f}"
f"{user["name"].upper()} speaks {", ".join(user["langs"])}"
f"Admin: {user.get('admin', False)}"
```
:::

Put an `f` before the opening quote and every `{expression}` is evaluated and formatted on the spot, just like `${}`. Any expression works: calls, indexing, arithmetic, conditional expressions. A `:` starts a **format spec**, which replaces `toFixed`, `padStart` and friends (next section), and `{{`/`}}` produce literal braces.

Since 3.12 the expression can reuse the outer quote character (`f"{user["name"]}"`), contain backslashes, and span lines with comments. Older Pythons need alternating quotes, `f"{user['name']}"`, which is still what most existing code does.

Two flags are worth memorizing:

- `f"{expr=}"` prints the expression's source, `=`, and its value. It's the fastest debug print there is, Python's `console.log({ expr })`.
- `!r` formats with `repr()` instead of `str()`, so strings keep their quotes and stray whitespace shows. (`!s` and `!a`, an ASCII-only repr, also exist.)

```python run
items = ["apple", "kiwi"]
price = 3.5
qty = 3

print(f"{len(items)} items, first is {items[0]!r}")
print(f"{qty * price=}")              # debug: expression=value
print(f"{qty * price = :.2f}")        # spaces and a format spec work too
print(f"{'several' if qty > 1 else 'one'} of them")
print(f"{{braces}} and {qty}")
print(f"{"\n".join(items)}")          # 3.12+: same quotes, backslashes
```

:::gotcha `${}` and the missing `f`
Muscle memory produces `f"Total: ${price}"`, which doesn't fail: the `$` is an ordinary character, so you get `Total: $5`. Forgetting the prefix doesn't fail either, because `"Hello {name}"` is a perfectly good string that happens to contain braces. Both bugs are silent, so read your output.
:::

:::quiz output
What does this print?

```python
price = 5
print(f"Total: ${price}")
```

- [ ] `Total: 5`
- [x] `Total: $5`
- [ ] `Total: ${price}`
- [ ] `SyntaxError`

Only the braces are special in an f-string. The dollar sign is printed as is.
:::

:::note Interpolation isn't `String(x)`
`${value}` calls `String(value)`. `{value}` calls `format(value, "")`, which for most objects means `str(value)`. So `None` renders as `None`, a list as `[1, 2]` rather than `1,2`, and an object without a `__str__` as `<__main__.User object at 0x...>` rather than `[object Object]`. Classes control this with `__str__` and `__format__` (see [Dunder Methods](lesson:dunder-methods)).
:::

## The format-spec mini-language

:::compare
```js
total.toFixed(2);                    // "1234.50"
total.toLocaleString("en-US");       // "1,234.5"
String(7).padStart(3, "0");          // "007"
name.padEnd(10);                     // "Ada       "
name.padStart(10);                   // "       Ada"
`${(0.256 * 100).toFixed(1)}%`;      // "25.6%"
(255).toString(16);                  // "ff"
```
```python
f"{total:.2f}"                       # '1234.50'
f"{total:,}"                         # '1,234.5'
f"{7:03}"                            # '007'
f"{name:<10}"                        # 'Ada       '
f"{name:>10}"                        # '       Ada'
f"{0.256:.1%}"                       # '25.6%'
f"{255:x}"                           # 'ff'
```
:::

Everything after the colon follows one compact grammar, shared by f-strings, `str.format()` and the `format()` built-in:

```text
[[fill]align][sign][#][0][width][grouping][.precision][type]
```

So `f"{price:*>10,.2f}"` reads: fill with `*`, align right, width 10, comma separators, two decimals, fixed-point. You rarely need more than three pieces at once.

| Piece | Examples | Meaning |
| --- | --- | --- |
| align | `<` `>` `^` `=` | left, right, center, pad between sign and digits |
| fill | `*^9`, `.<20` | any character, placed before the align |
| sign | `+`, a space | always show a sign, or a space for positives |
| width | `10`, `010` | minimum width; a leading `0` zero-pads numbers |
| grouping | `,` `_` | thousands separators |
| precision | `.2f`, `.3` | digits for numbers, **maximum length** for strings |
| type | `f` `e` `%` `d` `x` `b` | fixed, exponent, percent, int, hex, binary |

Numbers align right by default and strings align left. Width and precision can be nested fields, `f"{value:>{width}.{digits}f}"`, and types can bring their own spec language: `datetime` takes strftime codes, so `f"{now:%Y-%m-%d %H:%M}"` just works. Rounding, exponents and the other numeric corners are in [Numbers & Math](lesson:numbers-and-math).

```python run
rows = [("Espresso", 2, 3.2), ("Oat milk latte", 1, 4.75), ("Croissant", 12, 2.1)]

for name, qty, price in rows:
    print(f"{name:<16}{qty:>3} x {price:>5.2f} = {qty * price:>7,.2f}")
total = sum(qty * price for _, qty, price in rows)
print(f"{'TOTAL':<16}{total:>21,.2f}")

print(f"[{'centered':^14}] [{'stars':*^11}] [{42:+}] [{0.075:.1%}]")
print(f"[{'truncated to five':.5}] [{-42:06}] [{255:#x}] [{5:08b}]")
```

:::gotcha `True` and `None` in a format spec
`bool` is a subclass of `int`, so once a spec is present, `int` formatting takes over: `f"{True:>6}"` is `'     1'`. `None` has no spec language at all, so `f"{None:>6}"` raises `TypeError`. Add `!s` to format the string form instead: `f"{flag!s:>6}"` gives `'  True'`.
:::

## Tagged templates → t-strings (3.14)

:::compare
```js
const html = (strings, ...values) =>
  strings.reduce((out, text, i) =>
    out + escapeHtml(String(values[i - 1])) + text);

const comment = "<script>alert(1)</script>";
html`<p>${comment}</p>`;
```
```python
def html(template: Template) -> str:
    return "".join(
        escape(str(part.value)) if isinstance(part, Interpolation) else part
        for part in template
    )

comment = "<script>alert(1)</script>"
html(t"<p>{comment}</p>")
```
:::

A t-string looks like an f-string with a `t` prefix, but it doesn't produce a `str`. It evaluates to a `string.templatelib.Template` that keeps the literal text and the evaluated values **separate**, so a function can decide how to combine them: escape HTML, turn values into SQL parameters, emit structured logs. That's the job of JavaScript's tagged templates (`html`, `sql`, `css`, `gql`...). The values are evaluated eagerly, where the t-string is written; only the combining is deferred.

Three differences from JS:

- **There's no tag syntax.** `html(t"...")` is an ordinary call with a `Template` argument, so any function can process any template, and templates can be stored and passed around before they're rendered.
- **You get more than the values.** Iterating a `Template` yields its non-empty literal strings and `Interpolation` objects, in order. Each `Interpolation` has the `.value`, the source text in `.expression`, the `.conversion` (`"r"`, `"s"`, `"a"` or `None`) and the `.format_spec`. Like JS's `strings` array, `template.strings` always has one more item than `template.interpolations`.
- **A template is not a string.** `str(template)` is only its repr, and `template + "text"` raises `TypeError`. Nothing is rendered until a function renders it, which is the point: once an f-string has run, there's no telling which parts were data.

t-strings need Python 3.14 or newer.

```python run
name = "Ada"
balance = 1234.5
template = t"Hi {name!r}, you owe {balance:,.2f}"

print(type(template).__name__)
print(template.strings)
for item in template.interpolations:
    print(item.expression, item.value, item.conversion, item.format_spec)
```

A complete renderer honours the conversion and the format spec too. `string.templatelib.convert()` applies `!r`/`!s`/`!a`, and the `format()` built-in applies the spec:

```python run
from html import escape
from string.templatelib import Template, Interpolation, convert

def html(template: Template) -> str:
    out = []
    for part in template:
        if isinstance(part, Interpolation):
            value = convert(part.value, part.conversion)
            part = escape(format(value, part.format_spec))
        out.append(part)
    return "".join(out)

comment = "<img src=x onerror=alert(1)>"
price = 9.5
print(html(t"<p>{comment}</p><b>{price:.2f}</b>"))
print(f"<p>{comment}</p>")      # an f-string can't be made safe afterwards
```

:::note Not to be confused with `string.Template`
The much older `string.Template` class does `$name` substitution for templates supplied at runtime: `Template("Hi $name").substitute(name="Ada")`. It's unrelated to t-strings, which live in `string.templatelib`.
:::

## Recognising `str.format()` and `%`

f-strings are the modern default, but two older styles fill existing code and libraries. `str.format` uses the same format specs, and it's still the right tool when the template is **data** that exists before the values do: `LINE.format(**row)` or `LINE.format_map(row)`. The `%` style is the oldest. You'll mostly meet it in `logging`, where `log.info("user %s logged in", user_id)` passes the arguments separately so the message is only formatted if it's actually emitted.

```python run
name, count = "Ada", 1234
print("Hello, {}! You have {:,} messages.".format(name, count))
print("Hello, {name}! You have {count} messages.".format(name=name, count=count))
print("Hello, %s! You have %d messages." % (name, count))
```

## The String method map

Most `String.prototype` methods have a direct equivalent under a different name. The rows in bold behave differently enough to cause bugs.

| JavaScript | Python | Notes |
| --- | --- | --- |
| `s.length` | `len(s)` | counts code points |
| `s[i]`, `s.at(-1)` | `s[i]`, `s[-1]` | `IndexError` when out of range |
| `s.slice(1, 4)` | `s[1:4]` | full [slicing](lesson:lists#slicing-slice-with-superpowers); `s[::-1]` reverses |
| `s.includes(sub)` | `sub in s` | |
| `s.indexOf(sub)` | `s.find(sub)` | `-1` if missing; `s.index(sub)` raises |
| `s.startsWith(p)` | `s.startswith(p)` | `p` can be a tuple of options; same for `endswith` |
| **`s.trim()`** | `s.strip()` | **an argument is a set of characters** |
| `s.replace(/^v/, "")` | `s.removeprefix("v")` | also `removesuffix` (3.9+) |
| **`s.replace(a, b)`** | `s.replace(a, b, 1)` | **Python replaces all by default** |
| `s.replaceAll(a, b)` | `s.replace(a, b)` | |
| `s.padStart(5, "0")` | `s.rjust(5, "0")` | or `s.zfill(5)`, which respects a sign |
| `s.padEnd(10)` | `s.ljust(10)` | also `s.center(10)` |
| `s.split(",")` | `s.split(",")` | `s.split()` splits on whitespace runs |
| **`s.split(",", 2)`** | `s.split(",")[:2]` | **Python's `maxsplit` keeps the rest** |
| `s.split(/\r?\n/)` | `s.splitlines()` | no trailing `""` |
| `[...s]` | `list(s)` | `s.split("")` raises `ValueError` |
| `arr.join(", ")` | `", ".join(arr)` | see [join and split](lesson:lists#join-and-split) |
| `s.toUpperCase()` | `s.upper()` | also `title()`, `capitalize()` |
| `s.toLowerCase()` | `s.lower()` | `s.casefold()` for comparisons |
| `s.repeat(3)` | `s * 3` | |
| `s.split(sub).length - 1` | `s.count(sub)` | non-overlapping |
| `/^\d+$/.test(s)` | `s.isdecimal()` | also `isalpha`, `isalnum`, `isspace`... |

:::gotcha A straight port of `replace` changes behaviour
With a string pattern, JS's `replace` changes only the first occurrence and Python's changes all of them: `"banana".replace("a", "o")` is `'bonono'`. Often that's what the JS author meant anyway, but code that relied on "first only" breaks. Pass the count to keep JS semantics: `s.replace(old, new, 1)` (or `count=1`, accepted as a keyword since 3.13).
:::

### Trimming strips characters, not prefixes

`strip`, `lstrip` and `rstrip` take an optional argument, but it's a **set of characters** to remove from the ends, not a substring. To remove an exact prefix or suffix, use `removeprefix` and `removesuffix` (3.9+), which remove it once if it's there and otherwise return the string unchanged.

```python run
url = "https://shop.example/cart"
print(url.lstrip("https://"))         # strips h, t, p, s, : and / characters
print(url.removeprefix("https://"))   # removes the exact prefix
print("v2.1.0".removeprefix("v"), "report.csv".removesuffix(".csv"))
print("--==title==--".strip("-="))    # a set of characters, from both ends
print("42".zfill(5), "-42".zfill(5), "7".rjust(3, "0"))
```

:::quiz output
What does this print?

```python
print("shopping.example".lstrip("https://"))
```

- [ ] `shopping.example`
- [x] `opping.example`
- [ ] `pping.example`
- [ ] `ValueError`

`lstrip` removes leading characters for as long as they're in the set `{h, t, p, s, :, /}`: `s` and `h` go, and `o` stops it. There was no `https://` to begin with. `removeprefix` is the method you meant.
:::

### Splitting and partitioning

`split()` mostly works as in JS, and with no argument it splits on runs of whitespace ([covered with lists](lesson:lists#join-and-split)). The difference is the second argument. JavaScript's `limit` truncates the result, while Python's `maxsplit` stops splitting and **keeps the remainder** in the last item. For the very common "split once" job there's `partition`, which always returns a 3-tuple and never raises.

```python run
print("a,b,c,d".split(",", 2))                # ['a', 'b', 'c,d']; JS gives ['a', 'b']

header = "Content-Type: text/html; charset=utf-8"
name, _, value = header.partition(": ")       # (before, separator, after)
print(name, "|", value)
print("no equals sign".partition("="))        # separator missing: (s, '', '')
print("archive.tar.gz".rpartition("."))       # partition from the right
print("one\r\ntwo\nthree\n".splitlines())
```

### Searching and testing

`in` replaces `includes`, and `find` replaces `indexOf`, `-1` and all, while `index` is the variant that raises `ValueError`. `startswith` and `endswith` accept a tuple, which turns `s.startsWith("http://") || s.startsWith("https://")` into one call.

The `is*` methods test every character and return `False` for an empty string. They're Unicode-aware, which surprises people: `"²".isdigit()` is `True`, yet `int("²")` raises `ValueError`. To check that `int()` will accept a string of digits, use `isdecimal()`.

```python run
url = "https://example.com/report.pdf"
print("example" in url, url.find("report"), url.find("missing"))
print(url.startswith(("http://", "https://")), url.endswith((".pdf", ".docx")))
print("mississippi".count("ss"))
print("42".isdecimal(), "4.2".isdecimal(), "²".isdigit(), "²".isdecimal())
print("".isspace(), not "  ".strip())          # use `not s.strip()` for "blank"
```

## Immutability and building strings

:::compare
```js
let s = "hello";
s[0] = "H";       // ignored (TypeError in strict mode)
s = "H" + s.slice(1);

let csv = "";
for (const row of rows) csv += row.join(",") + "\n";
```
```python
s = "hello"
s[0] = "H"        # TypeError: 'str' object does not support item assignment
s = "H" + s[1:]

lines = [",".join(row) for row in rows]
csv = "\n".join(lines) + "\n"
```
:::

Strings are immutable in both languages, and Python is louder about it. Every method that seems to modify a string returns a new one.

Building a big string with `+=` in a loop can be quadratic, because each step may copy everything built so far. CPython sometimes optimizes the copy away, but that's an implementation detail, not a promise. The idiom is to collect the pieces in a list (or a generator expression) and call `"".join` once. When pieces are written from many places, `io.StringIO` works as a string builder with a `.write()` method.

```python run
rows = [["id", "name"], ["1", "Ada"], ["2", "Grace"]]
print("\n".join(",".join(row) for row in rows))

title = "hello"
print(title.capitalize(), title)      # a new string; title is unchanged
```

## Length, code points and Unicode

:::compare
```js
"héllo".length;              // 5
"😀".length;                 // 2  (UTF-16 code units)
"😀".charCodeAt(0);          // 55357  (half a surrogate pair)
"😀".codePointAt(0);         // 128512
String.fromCodePoint(128512);
```
```python
len("héllo")                 # 5
len("😀")                    # 1  (code points)
# no surrogate halves to trip over
ord("😀")                    # 128512
chr(128512)
```
:::

A Python string is a sequence of Unicode code points, and `len()`, indexing, slicing and iteration all work per code point. Astral characters such as emoji are never split into surrogate halves, so `s[::-1]` and `s[:10]` can't leave half a character behind the way `split("").reverse()` can in JS.

What Python doesn't understand out of the box is **grapheme clusters**, the characters a human sees. A thumbs-up with a skin tone is two code points, and a family emoji built with zero-width joiners is five. JavaScript has `Intl.Segmenter` for this; Python's standard library has no equivalent, so use the third-party `regex` package (its `\X` matches one grapheme) when it matters. And the same visible text can be different code points: `"é"` is one precomposed code point or an `e` plus a combining accent, and the two compare unequal until you normalize them, exactly as with `String.prototype.normalize`.

```python run
import unicodedata

for text in ["héllo", "😀", "👍🏽", "👨‍👩‍👧"]:
    utf16_units = len(text.encode("utf-16-le")) // 2
    print(f"len={len(text)}  JS length={utf16_units}  {text!r}")

composed, decomposed = "café", "cafe\u0301"
print(composed == decomposed, len(composed), len(decomposed))
print(unicodedata.normalize("NFC", decomposed) == composed)
print(ord("A"), chr(97), [ord(c) for c in "hi"])
```

:::quiz output
What does this print?

```python
print(len("👍🏽"))
```

- [ ] `1`
- [x] `2`
- [ ] `4`

The thumbs-up and the skin-tone modifier are two separate code points. JavaScript reports 4 (two surrogate pairs), and a human would say 1.
:::

## `str()` vs `repr()`, and comparing strings

:::compare
```js
String("hi");                // "hi"
JSON.stringify("hi");        // '"hi"'
String(null);                // "null"
String([1, "a"]);            // "1,a"
```
```python
str("hi")                    # 'hi'
repr("hi")                   # "'hi'"
str(None)                    # 'None'
str([1, "a"])                # "[1, 'a']"
```
:::

Every object has two text forms. `str(x)` is the readable one, used by `print()` and f-strings. `repr(x)` is the unambiguous, developer-facing one, usually valid Python source for built-in types, which is why strings get quotes. Containers always show their items' `repr`, so `print(["a"])` shows quotes too. When you log user input, `!r` makes empty strings and trailing spaces visible. Classes control both forms with `__str__` and `__repr__` (see [Dunder Methods](lesson:dunder-methods)).

Comparison works the way you'd hope. `==` compares contents, and there's no `===` because there's no coercion to opt out of (more in [Truthiness & Equality](lesson:truthiness-and-equality)). `<`, `>` and `sorted()` order strings by code point, like JS's `<`, so uppercase sorts before lowercase and `"10" < "9"`. For caseless matching use `casefold()`, which also folds characters like `ß` that `lower()` leaves alone, and sort with `key=str.casefold` where you'd reach for `localeCompare`.

```python run
name = "Ada "
print(name, "|", repr(name))          # repr reveals the trailing space
print(f"user={name!r}")

print("apple" < "banana", "Zebra" < "apple", "10" < "9")
print(sorted(["banana", "Apple", "cherry"], key=str.casefold))
print("STRASSE".casefold() == "straße".casefold(), "Straße".lower())
```

## Regular expressions: `re` vs `RegExp`

:::compare
```js
const date = /(\d{4})-(\d{2})-(\d{2})/;

date.test(s);                       // boolean
s.match(date);                      // first match or null
s.match(/\d+/g);                    // all matches, as strings
[...s.matchAll(/(\d+)/g)];          // all match objects
s.replace(/\s+/g, " ");             // replace all
s.split(/[,;]\s*/);
```
```python
date = re.compile(r"(\d{4})-(\d{2})-(\d{2})")

date.search(s) is not None          # boolean
date.search(s)                      # first Match or None
re.findall(r"\d+", s)               # all matches, as strings
list(re.finditer(r"(\d+)", s))      # all Match objects
re.sub(r"\s+", " ", s)              # replace all
re.split(r"[,;]\s*", s)
```
:::

Python has no regex literal. Patterns are ordinary strings (raw strings, so `\d` survives) passed to functions in the `re` module, or compiled with `re.compile()` into a `Pattern` with the same methods. The module-level functions cache compiled patterns, so `re.compile` is about naming and reuse more than speed.

There's no `g` flag, because "global" is a choice of function: `search` finds the first match, `findall` and `finditer` find them all, and `sub` replaces them all unless you pass `count=1`. Patterns are also stateless. There's no `lastIndex`, so the classic JS bug where a `/g` regex's `.test()` alternates between `true` and `false` can't happen.

### `search`, `match` and `fullmatch`

| Python | Matches | JS equivalent |
| --- | --- | --- |
| `re.search(p, s)` | anywhere in `s` | `p.exec(s)`, or `s.match(p)` without `g` |
| `re.match(p, s)` | only at the **start** | `/^p/` |
| `re.fullmatch(p, s)` | the **whole** string | `/^p$/` |

All three return a `Match` object or `None`. A match is truthy, so the standard shape is `if m := re.search(...):`, with the walrus operator from [Control Flow](lesson:control-flow). Read groups with `m[1]` or `m.group(1)`, the whole match with `m[0]`, and positions with `m.start()`, `m.end()` and `m.span()`.

:::gotcha `re.match` is not `String.prototype.match`
JavaScript's `s.match(re)` searches the whole string. Python's `re.match` only matches at the beginning, so `re.match(r"\d+", "order 66")` is `None`. Use `re.search` unless you mean "starts with". For validation, prefer `fullmatch` over `^...$`: Python's `$` also matches just before a trailing newline, so `re.match(r"^\d+$", "123\n")` succeeds.
:::

```python run
import re

line = "2026-11-06 ERROR [db] connection timeout after 30s"
print(re.search(r"\d+s", line))           # anywhere
print(re.match(r"ERROR", line))           # only at the start: None
print(re.fullmatch(r"\d{4}-\d{2}-\d{2}", "2026-11-06") is not None)

if m := re.search(r"\[(\w+)\] (.*)", line):
    print(m[1], "|", m[2], "|", m.span(1))

print(bool(re.match(r"^\d+$", "123\n")), bool(re.fullmatch(r"\d+", "123\n")))
```

### Named groups and `findall`

Named groups are spelled `(?P<name>...)`, and Python's `re` rejects JavaScript's `(?<name>...)` form. Read one with `m["name"]`, or get them all as a dict with `m.groupdict()`. Careful with the names: JS's `match.groups` is the object of named groups, but Python's `m.groups()` is a method returning a tuple of *every* group.

`findall` changes shape with the pattern. With no groups it returns the matched strings, with one group that group's strings, and with several groups a list of tuples. When you need positions or names, use `finditer`, which yields `Match` objects.

```python run
import re

log = "GET /users 200 12ms\nPOST /login 401 8ms\nGET /orders 500 31ms"
request = re.compile(r"(?P<method>[A-Z]+) (?P<path>\S+) (?P<status>\d{3})")

for m in request.finditer(log):
    print(m["method"], m["path"], int(m["status"]), m.groupdict())

print(re.findall(r"\d{3}", log))                # no groups: whole matches
print(re.findall(r"(\w+) (\S+) 5\d\d", log))    # groups: tuples of groups
```

:::quiz output
What does this print?

```python
import re
print(re.findall(r"(\d+)-(\d+)", "10-20, 30-40"))
```

- [ ] `['10-20', '30-40']`
- [x] `[('10', '20'), ('30', '40')]`
- [ ] `['10', '20', '30', '40']`

With two capture groups, each result is a tuple of the groups rather than the whole match. Use non-capturing groups, `(?:\d+)`, to get whole matches back, or `finditer` to get `Match` objects.
:::

### Replacing with `sub`

:::compare
```js
s.replace(/(\w+)@(\w+)\.com/g, "$2: $1");
s.replace(/(?<user>\w+)@/g, "$<user> at ");
s.replace(/\d+/g, (m) => String(Number(m) * 2));
```
```python
re.sub(r"(\w+)@(\w+)\.com", r"\2: \1", s)
re.sub(r"(?P<user>\w+)@", r"\g<user> at ", s)
re.sub(r"\d+", lambda m: str(int(m[0]) * 2), s)
```
:::

Backreferences in the replacement are `\1` and `\g<name>` rather than `$1` and `$<name>`, one more reason to use raw strings. A replacement function receives a single `Match` object, not JavaScript's `(match, p1, p2, offset, string)` argument list, and it must return a `str`.

```python run
import re

def to_snake(name: str) -> str:
    return re.sub(r"([a-z0-9])([A-Z])", r"\1_\2", name).lower()

print([to_snake(key) for key in ["userId", "createdAt", "isAdmin"]])

prices = "apple 3, pear 10, fig 7"
print(re.sub(r"\d+", lambda m: f"{int(m[0]) * 1.2:.2f}", prices))
```

### Flags

| JS | Python | Notes |
| --- | --- | --- |
| `i` | `re.IGNORECASE` (`re.I`) | |
| `m` | `re.MULTILINE` (`re.M`) | `^` and `$` match at every line |
| `s` | `re.DOTALL` (`re.S`) | `.` matches newlines |
| `g` | (none) | pick `findall`, `finditer` or `sub` |
| `y` | `pattern.match(s, pos)` | match exactly at `pos` |
| `u` | (always on) | `re.ASCII` turns it off |
| | `re.VERBOSE` (`re.X`) | whitespace and `#` comments in the pattern |

Combine flags with `|`, as in `re.I | re.M`, or put them inline at the start of the pattern: `(?i)error`. `re.VERBOSE` has no JS counterpart and makes long patterns readable:

```python run
import re

phone = re.compile(r"""
    \(? (?P<area>\d{3}) \)?        # area code, optional parentheses
    [\s.-]?                        # optional separator
    (?P<line>\d{3}[\s.-]?\d{4})
""", re.VERBOSE)

print(phone.search("Call (555) 123-4567 today").groupdict())
print(re.findall(r"^error.*", "error: disk\nok\nERROR: net", re.I | re.M))
print(re.fullmatch(r"\d+", "٣٤"), re.fullmatch(r"\d+", "٣٤", re.ASCII))
```

:::gotcha `\d` matches more than 0-9
For `str` patterns, `\d`, `\w` and `\s` are Unicode-aware, so `\d+` matches the Arabic-Indic digits `"٣٤"` above. In JavaScript, `\d` is always `[0-9]`. When you mean ASCII, write `[0-9]` or pass `re.ASCII`.
:::

## Bytes vs str

:::compare
```js
const bytes = new TextEncoder().encode("héllo");
bytes.length;                           // 6
new TextDecoder().decode(bytes);        // "héllo"
bytes[0];                               // 104
```
```python
data = "héllo".encode()                 # b'h\xc3\xa9llo'
len(data)                               # 6
data.decode()                           # 'héllo'
data[0]                                 # 104
```
:::

`str` is text and `bytes` is an immutable sequence of integers from 0 to 255: a read-only `Uint8Array`, with `bytearray` as the mutable version. `encode()` and `decode()` default to UTF-8, and bytes literals are written `b"..."` with only ASCII characters and escapes inside.

The two types never mix: `b"a" + "b"` raises `TypeError`, and `b"a" == "a"` is simply `False`. Bytes come from binary files (`open(path, "rb")`), sockets, hashes and base64. Decode them at the edges of your program and work with `str` in between.

```python run raises
data = "naïve 😀".encode()
print(data, len(data), list(data[:3]))
print(data.decode())
print(b"caf\xe9".decode("utf-8", errors="replace"))   # invalid bytes become U+FFFD
print(bytes.fromhex("4869"), b"Hi".hex())
b"Hi " + "there"                                      # TypeError: can't concat str to bytes
```

## Cheat sheet

| JavaScript | Python | Notes |
| --- | --- | --- |
| `` `Hi ${name}` `` | `f"Hi {name}"` | `f"""..."""` for multi-line |
| `` html`<p>${x}</p>` `` | `html(t"<p>{x}</p>")` | 3.14+, `string.templatelib` |
| `String.raw` | `r"..."` | |
| `n.toFixed(2)` | `f"{n:.2f}"` | |
| `s.padStart(8)` | `f"{s:>8}"` | or `s.rjust(8)` |
| `console.log({ x })` | `print(f"{x=}")` | |
| `s.length` | `len(s)` | code points, not UTF-16 units |
| `s.includes(x)` | `x in s` | |
| `s.indexOf(x)` | `s.find(x)` | `s.index(x)` raises |
| `s.trim()` | `s.strip()` | an argument is a set of characters |
| `s.replace(/^v/, "")` | `s.removeprefix("v")` | 3.9+ |
| `s.replace(a, b)` | `s.replace(a, b, 1)` | without the count it replaces all |
| `s.split(sep, n)` | `s.split(sep)[:n]` | `maxsplit` keeps the rest |
| `s.toLowerCase()` | `s.lower()` | `casefold()` to compare |
| `s.codePointAt(0)` | `ord(s[0])` | `chr(n)` goes back |
| `String(x)` / `JSON.stringify(s)` | `str(x)` / `repr(s)` | |
| `/p/.test(s)` | `re.search(r"p", s)` | `Match` or `None` |
| `s.match(/p/g)` | `re.findall(r"p", s)` | tuples if `p` has groups |
| `s.matchAll(/p/g)` | `re.finditer(r"p", s)` | |
| `s.replace(/p/g, fn)` | `re.sub(r"p", fn, s)` | `fn` receives a `Match` |
| `(?<name>...)` | `(?P<name>...)` | `m["name"]`, `m.groupdict()` |
| `TextEncoder` / `TextDecoder` | `s.encode()` / `b.decode()` | UTF-8 by default |

## Challenges

:::challenge id=fstr-receipt-line title="Receipt line" difficulty=easy
Write `receipt_line(item, qty, price)` that returns one 30-character line of a receipt:

- the item name, left-aligned in 16 columns and **truncated** to 16 characters if it's longer,
- the quantity, right-aligned in 4 columns,
- the line total (`qty * price`), right-aligned in 10 columns, with thousands separators and two decimals.

```text
receipt_line("Coffee beans", 2, 14.5)                ->  'Coffee beans       2     29.00'
receipt_line("Extra-large oat milk latte", 1, 6.2)   ->  'Extra-large oat    1      6.20'
receipt_line("Laptop", 1, 1499)                      ->  'Laptop             1  1,499.00'
```

Build it with a single f-string. Format specs can pad, align, truncate and group digits, so you need neither `ljust`/`rjust` nor slicing.

```js
function receiptLine(item, qty, price) {
  const total = (qty * price).toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
  return item.slice(0, 16).padEnd(16) + String(qty).padStart(4) + total.padStart(10);
}
```

```python starter
def receipt_line(item, qty, price):
    ...
```

```python solution
def receipt_line(item, qty, price):
    return f"{item:<16.16}{qty:>4}{qty * price:>10,.2f}"
```

```python tests
@test("pads the name and right-aligns the numbers")
def _():
    eq(receipt_line("Coffee beans", 2, 14.5), "Coffee beans       2     29.00")

@test("truncates long names to 16 characters")
def _():
    eq(receipt_line("Extra-large oat milk latte", 1, 6.2), "Extra-large oat    1      6.20")

@test("adds thousands separators and two decimals")
def _():
    eq(receipt_line("Laptop", 1, 1499), "Laptop             1  1,499.00")

@test("always returns exactly 30 characters")
def _():
    for args in [("A", 1, 1), ("Exactly sixteen!", 10, 0.5), ("Server rack", 3, 2500.0)]:
        eq(len(receipt_line(*args)), 30, f"receipt_line{args!r}")

@test("uses an f-string")
def _():
    requires_syntax(ast.JoinedStr, "build the line with an f-string and format specs")
```

```hint
`{item:<16}` pads to 16 columns. On a string, a precision is a maximum length: `f"{'abcdef':.3}"` is `'abc'`.
```

```hint
Combine width and precision for the name, `{item:<16.16}`. For the total, `,` adds separators and `.2f` gives two decimals: `{qty * price:>10,.2f}`.
```
:::

:::challenge id=re-fill-placeholders title="Fill the placeholders" difficulty=medium
Write `fill(template, values)` that replaces every `{name}` placeholder in `template` with `str(values[name])`. Names are runs of word characters (`\w+`).

- Placeholders whose name isn't a key of `values` stay exactly as they are.
- Falsy values like `0`, `""` and `False` are real values and must be substituted.

```text
fill("Hi {name}, you have {count} new {kind}", {"name": "Ada", "count": 0})
'Hi Ada, you have 0 new {kind}'
```

Use `re.sub` with a replacement function.

```js
const fill = (template, values) =>
  template.replace(/\{(\w+)\}/g, (match, name) =>
    name in values ? String(values[name]) : match);
```

```python starter
import re

def fill(template, values):
    ...
```

```python solution
import re

def fill(template, values):
    def replace(m: re.Match) -> str:
        name = m[1]
        return str(values[name]) if name in values else m[0]

    return re.sub(r"\{(\w+)\}", replace, template)
```

```python tests
@test("replaces every known placeholder")
def _():
    eq(fill("Hi {name}!", {"name": "Ada"}), "Hi Ada!")
    eq(fill("{x} + {x} = {y}", {"x": 2, "y": 4}), "2 + 2 = 4")

@test("leaves unknown placeholders alone")
def _():
    eq(fill("Hi {name}, {missing}", {"name": "Ada"}), "Hi Ada, {missing}")

@test("substitutes falsy values")
def _():
    eq(fill("{count}|{label}|{flag}", {"count": 0, "label": "", "flag": False}), "0||False")

@test("converts values with str()")
def _():
    eq(fill("{items} at {price}", {"items": [1, 2], "price": 9.5}), "[1, 2] at 9.5")

@test("text without placeholders is unchanged")
def _():
    eq(fill("no placeholders here", {"a": 1}), "no placeholders here")
    eq(fill("", {}), "")

@test("uses re.sub")
def _():
    requires_call("sub", "replace the placeholders with re.sub(pattern, function, template)")
```

```hint
The pattern is `r"\{(\w+)\}"`. `re.sub` accepts a function in place of the replacement string, and calls it with a `Match` for each placeholder: `m[1]` is the name and `m[0]` is the whole `{name}`.
```

```hint
Avoid `values.get(name) or m[0]`, which throws away `0` and `""`. Check membership with `name in values`.
```
:::

:::challenge id=tstr-sql-query title="Injection-proof SQL with t-strings" difficulty=hard
Write `sql(query)` that takes a **t-string** and returns a `(text, params)` tuple ready for a database driver. Each interpolation becomes a `?` placeholder in `text`, and its value is appended to the `params` list.

```text
name = "Robert'); DROP TABLE students;--"
sql(t"SELECT * FROM students WHERE name = {name} AND year >= {2024}")
('SELECT * FROM students WHERE name = ? AND year >= ?', ["Robert'); DROP TABLE students;--", 2024])
```

Two more rules:

- **Fragments compose.** When an interpolated value is itself a `Template`, inline its SQL text and add its params in order, recursively.
- **Plain strings are rejected.** If `query` isn't a `Template` (say someone typed `f"..."` instead of `t"..."`), raise `TypeError`.

This needs Python 3.14. `Template` and `Interpolation` live in `string.templatelib`.

```js
// A JS tag function receives the pieces directly.
function sql(strings, ...values) {
  return { text: strings.join("?"), params: values };
}
sql`SELECT * FROM students WHERE name = ${name}`;
```

```python starter
from string.templatelib import Interpolation, Template

def sql(query):
    ...
```

```python solution
from string.templatelib import Template

def sql(query: Template) -> tuple[str, list]:
    if not isinstance(query, Template):
        raise TypeError(f"sql() needs a t-string, got {type(query).__name__}")
    text, params = [], []
    for part in query:
        if isinstance(part, str):
            text.append(part)
        elif isinstance(part.value, Template):
            fragment_text, fragment_params = sql(part.value)
            text.append(fragment_text)
            params.extend(fragment_params)
        else:
            text.append("?")
            params.append(part.value)
    return "".join(text), params
```

```python tests
@test("interpolations become ? placeholders, values become params")
def _():
    name = "Robert'); DROP TABLE students;--"
    text, params = sql(t"SELECT * FROM students WHERE name = {name}")
    eq(text, "SELECT * FROM students WHERE name = ?")
    eq(params, [name])

@test("keeps params in order, including falsy ones")
def _():
    low, high, active = 0, 10, False
    eq(
        sql(t"WHERE n BETWEEN {low} AND {high} AND active = {active}"),
        ("WHERE n BETWEEN ? AND ? AND active = ?", [0, 10, False]),
    )

@test("a query without interpolations has no params")
def _():
    eq(sql(t"SELECT 1"), ("SELECT 1", []))

@test("inlines nested Template fragments")
def _():
    min_age, country, limit = 18, "FR", 5
    where = t"age >= {min_age} AND country = {country}"
    eq(
        sql(t"SELECT * FROM users WHERE {where} LIMIT {limit}"),
        ("SELECT * FROM users WHERE age >= ? AND country = ? LIMIT ?", [18, "FR", 5]),
    )

@test("rejects plain strings")
def _():
    name = "Ada"
    raises(TypeError, sql, f"SELECT * FROM users WHERE name = '{name}'")
```

```hint
Without fragments, `"?".join(query.strings)` and `list(query.values)` would already be enough. Fragments need a loop: iterating a `Template` yields `str` pieces and `Interpolation` objects in order.
```

```hint
When an interpolation's `part.value` is a `Template`, call `sql(part.value)` recursively and splice its text and params into yours.
```
:::
