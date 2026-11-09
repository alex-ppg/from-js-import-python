---
title: Text Processing & Regular Expressions
part: Files & Data
summary: re in depth (verbose patterns, lookarounds, tokenizers, sub callbacks) plus translate, textwrap and difflib.
minutes: 40
---

The core course introduced `re` in [Strings & f-strings](lesson:strings#regular-expressions-re-vs-regexp): patterns are raw strings, `search` isn't `match`, named groups are `(?P<name>...)`, and there's no `g` flag. This lesson goes from "I can write a regex" to "I can parse this log file". It covers compiled patterns, verbose patterns with comments, lookarounds and Python's fixed-width lookbehind, tokenizers built on `finditer`, and replacement callbacks.

It also covers the tools that save you from writing a regex at all. `str.translate` rewrites characters in one pass, `textwrap` formats paragraphs, `string.Template` fills user-supplied templates safely, `difflib` does "did you mean?" and diffs, and `unicodedata` makes `"cafe\u0301"` equal `"café"`.

## Pattern objects and the `RegExp` map

:::compare
```js
const DURATION = /(\d+)(ms|s)\b/g;

DURATION.test(line);                     // careful: /g makes test() stateful
line.match(/(\d+)(ms|s)\b/);             // the first match
[...line.matchAll(DURATION)];            // every match
line.replaceAll(DURATION, (m, n, unit) => (unit === "s" ? `${n * 1000}ms` : m));
line.split(/\s*\|\s*/);
```
```python
DURATION = re.compile(r"(\d+)(ms|s)\b")

DURATION.search(line) is not None        # no hidden state
DURATION.search(line)                    # the first Match, or None
list(DURATION.finditer(line))            # every Match
DURATION.sub(lambda m: f"{int(m[1]) * 1000}ms" if m[2] == "s" else m[0], line)
re.split(r"\s*\|\s*", line)
```
:::

`re.compile()` turns a pattern string into a `Pattern` object, with the same methods as the module-level functions minus the pattern argument. Compile at module level into an `UPPER_CASE` constant when a pattern is reused or deserves a name. The `re` module caches the patterns its functions compile, so this is about readability more than speed.

Pattern methods also take `pos` and `endpos`, which restrict the search to a window of the string without copying it. `pattern.match(text, pos)` must match exactly at `pos`, which is the sticky flag without the mutable `lastIndex`:

| JavaScript | Python | Notes |
| --- | --- | --- |
| `re.test(s)` | `p.search(s) is not None` | a `Match` is truthy, so `if p.search(s):` works |
| `re.exec(s)`, `s.match(re)` | `p.search(s)` | `None` where JS gives `null` |
| `s.match(/.../g)` | `p.findall(s)` | strings, or tuples when there are groups |
| `s.matchAll(re)` | `p.finditer(s)` | a lazy iterator of `Match` objects |
| `s.replaceAll(re, fn)` | `p.sub(fn, s)` | replaces every match unless `count=1` |
| `s.split(re)` | `p.split(s)` | `maxsplit=` keeps the remainder |
| `/y` and `lastIndex` | `p.match(s, pos)` | no state stored on the pattern |
| `/d` and `m.indices` | `m.span(group)` | always available |
| `re.source`, `re.flags` | `p.pattern`, `p.flags` | |
| `RegExp.escape(s)` | `re.escape(s)` | |
| `/v` set notation | none | the third-party `regex` package has it |

The flags themselves (`re.I`, `re.M`, `re.S`, `re.A`) are in the [core lesson's flag table](lesson:strings#flags).

```python run
import re

DURATION = re.compile(r"(\d+)(ms|s)\b")
line = "db=12ms cache=3ms render=2s total=2015ms"

print(DURATION.pattern, DURATION.groups)
print([m[0] for m in DURATION.finditer(line)])
print(DURATION.sub(lambda m: f"{int(m[1]) * 1000}ms" if m[2] == "s" else m[0], line))

print(DURATION.search(line, 8))       # start looking at index 8
print(DURATION.match(line, 3))        # sticky: must match exactly at index 3
print(DURATION.match(line, 2))        # index 2 is "=", so no match there

query = "1.5x (beta)"                 # user input, to be found literally
print(re.findall(query, "1.5x (beta) vs 105x beta"))              # as a pattern: wrong
print(re.findall(re.escape(query), "1.5x (beta) vs 105x beta"))   # escaped: literal
```

:::gotcha Pass `count` and `flags` by keyword
The signature is `re.sub(pattern, repl, string, count=0, flags=0)`, so a fourth positional argument is the **count**. `re.sub("a", "o", text, re.IGNORECASE)` means "replace at most 2 matches", because `re.IGNORECASE` is the integer `2`, and the match stays case-sensitive. `re.subn` has the same signature, and `re.split(pattern, string, maxsplit=0, flags=0)` has the same trap with `maxsplit`. (`re.search` and `re.findall` take `flags` third, so they're safe.) Python 3.13 deprecated passing these positionally, so you'll now see a `DeprecationWarning`, but older versions run the bug silently. Always write `flags=re.I`.
:::

:::quiz output
What does this print?

```python
import re
print(re.sub("A", "o", "banana", re.IGNORECASE))
```

- [ ] `bonono`
- [x] `banana`
- [ ] `bonona`
- [ ] `TypeError`

The fourth positional parameter is `count`, so `re.IGNORECASE` (the integer `2`) became "replace at most two". The pattern `"A"` stayed case-sensitive and matched nothing. Python 3.13+ also prints a `DeprecationWarning`. `flags=re.IGNORECASE` gives `bonono`.
:::

## Verbose patterns and inline flags

:::compare
```js
// No x flag: long patterns get assembled from commented pieces
const ACCESS = new RegExp(
  String.raw`^(?<ip>\S+) \S+ \S+ ` +            // client, identity, user
  String.raw`\[(?<when>[^\]]+)\] ` +             // timestamp
  String.raw`"(?<method>[A-Z]+) (?<path>\S+) [^"]*" ` +
  String.raw`(?<status>\d{3}) (?<size>\d+|-)`
);
```
```python
ACCESS = re.compile(r"""
    ^(?P<ip>\S+) \s \S+ \s \S+ \s       # client, identity, user
    \[(?P<when>[^\]]+)\] \s             # timestamp
    "(?P<method>[A-Z]+) \s (?P<path>\S+) [^"]*" \s
    (?P<status>\d{3}) \s (?P<size>\d+|-)
""", re.VERBOSE)
```
:::

`re.VERBOSE` (`re.X`) ignores whitespace in the pattern and treats `#` up to the end of the line as a comment, so you can lay a pattern out like code and annotate each piece. A triple-quoted raw string holds it comfortably. The price is that a space or `#` you actually want to match has to be escaped (`\ `, `\#`), written as `\s`, or put in a character class (`[ ]`), because whitespace inside a class is kept.

```python run
import re

ACCESS = re.compile(r"""
    ^(?P<ip>\S+) \s \S+ \s \S+ \s        # client, identity, user
    \[(?P<when>[^\]]+)\] \s              # timestamp
    "(?P<method>[A-Z]+) \s (?P<path>\S+) [^"]*" \s
    (?P<status>\d{3}) \s (?P<size>\d+|-) # "-" means no body
""", re.VERBOSE)

line = '203.0.113.9 - - [10/Nov/2026:13:55:36 +0000] "GET /cart?id=7 HTTP/1.1" 200 512'
if m := ACCESS.match(line):
    print(m.groupdict())
    size = 0 if m["size"] == "-" else int(m["size"])
    print(m["method"], m["path"], int(m["status"]), size)
```

Flags can also live inside the pattern, which helps when the pattern comes from a config file and you can't pass arguments. `(?i)` or `(?x)` at the **very start** applies to the whole pattern (anywhere else has been an error since 3.11), and `(?i:...)` applies a flag to one group only, like the `(?i:...)` modifiers JavaScript added in ES2025.

```python run
import re

print(re.findall(r"(?i)error", "Error ERROR error"))
print(re.findall(r"(?i:error) [a-z]+", "ERROR db Error net error IO"))   # only "error" ignores case
try:
    re.compile(r"level=(?i)error")
except re.error as err:            # re.PatternError since 3.13; the old name still works
    print(err)
```

:::quiz output
What does this print?

```python
import re
print(re.fullmatch("New York", "New York", re.VERBOSE))
```

- [ ] `<re.Match object; span=(0, 8), match='New York'>`
- [x] `None`
- [ ] `PatternError`

Verbose mode drops the space from the pattern, which becomes `NewYork` and no longer matches. Write `New\ York`, `New[ ]York` or `New\sYork`.
:::

## Groups: named, non-capturing and backreferences

:::compare
```js
const DATE = /(?<year>\d{4})-(?<month>\d{2})-(?<day>\d{2})/;
s.match(DATE).groups.year;
"2024-06-01".replace(DATE, "$<day>/$<month>/$<year>");
/(?:https?|ftp):\/\/(\S+)/;                      // non-capturing
/(?<quote>["']).*?\k<quote>/;                    // backreference
"room 101".replace(/\d+/, "<$&>");               // the whole match
```
```python
DATE = re.compile(r"(?P<year>\d{4})-(?P<month>\d{2})-(?P<day>\d{2})")
DATE.search(s)["year"]
DATE.sub(r"\g<day>/\g<month>/\g<year>", "2024-06-01")
re.compile(r"(?:https?|ftp)://(\S+)")             # non-capturing
re.compile(r"""(?P<quote>["']).*?(?P=quote)""")   # backreference
re.sub(r"\d+", r"<\g<0>>", "room 101")            # the whole match
```
:::

Named groups carry a `P`, as in `(?P<name>...)`, which marks them as one of Python's own extensions to the Perl syntax. Python 3.14 still rejects the JavaScript spellings `(?<name>...)` and `\k<name>`. Non-capturing `(?:...)` is identical. To refer back to a group inside the pattern, write `(?P=name)` or `\1`. In a replacement string it's `\g<name>`, `\g<1>`, or `\g<0>` for the whole match (JS's `$&`). `\g<1>` also removes an ambiguity: `\10` means group 10, while `\g<1>0` means group 1 followed by a literal `0`.

A group that didn't take part in the match is `None`, where JS gives `undefined`. `m.groupdict(default="")` fills the gaps, and `m.lastgroup` names the last group that matched, which [the tokenizer below](#scanning-with-finditer) puts to work.

```python run
import re

QUOTED = re.compile(r"""(?P<quote>["']) (?P<text>.*?) (?P=quote)""", re.VERBOSE)
print([m["text"] for m in QUOTED.finditer("""say "it's fine" or 'say "no"'""")])

VERSION = re.compile(r"v(?P<major>\d+)(?:\.(?P<minor>\d+))?(?:\.(?P<patch>\d+))?")
m = VERSION.fullmatch("v3.14")
print(m.groupdict())
print(m.groupdict(default="0"))

print(re.sub(r"\d+", r"<\g<0>>", "room 101, floor 3"))
print(re.sub(r"(\d+)", r"\g<1>0", "5 apples"))      # group 1, then a literal 0
```

:::quiz output
What does this print?

```python
import re
m = re.search(r"(\d+)(?:px)?(em)?", "width: 40px")
print(m.groups())
```

- [ ] `('40', 'px', None)`
- [x] `('40', None)`
- [ ] `('40', '')`
- [ ] `('40',)`

`(?:px)` doesn't capture, so only two groups exist. The optional `(em)` didn't take part in the match, so it's `None`, not an empty string. `m.groups(default="")` would substitute `''`.
:::

## Lookarounds and quantifiers

:::compare
```js
/\d+(?=px)/;                // followed by px
/\d+(?!px)/;                // not followed by px
/(?<=\$)\d+(\.\d\d)?/;      // preceded by $
/(?<!-)\$\d+/;              // not preceded by -
/(?<=\$\s*)\d+/;            // variable-width lookbehind: fine in JS
```
```python
r"\d+(?=px)"
r"\d+(?!px)"
r"(?<=\$)\d+(\.\d\d)?"
r"(?<!-)\$\d+"
r"(?<=\$\s*)\d+"            # PatternError: look-behind requires fixed-width pattern
```
:::

Lookaheads and lookbehinds are zero-width assertions: they check what's around the current position without consuming it. The syntax is the same in both languages, with one difference that bites. **A Python lookbehind must have a fixed width.** There's no `*`, `+`, `?` or `{m,n}` inside one, and the alternatives of an alternation must all be the same length: `(?<=USD|EUR)` works and `(?<=US|EURO)` doesn't. The workarounds are to capture the prefix and read the group instead, to split the alternatives into separate lookbehinds (`(?:(?<=US)|(?<=EURO))`), or to use the third-party `regex` package.

Zero-width matches are also how you split *between* characters without losing any:

```python run
import re

prices = "Total: $42.50, tax $3, shipping €5, discount -$10"
print(re.findall(r"(?<=\$)\d+(?:\.\d\d)?", prices))
print(re.findall(r"(?<!-)\$(\d+(?:\.\d\d)?)", prices))   # skip the negative amount
print(re.split(r"(?<=[a-z])(?=[A-Z])", "parseJsonResponse"))

STRONG = re.compile(r"(?=.*\d)(?=.*[a-z])(?=.*[A-Z]).{10,}")   # every lookahead must hold
print([bool(STRONG.fullmatch(pw)) for pw in ["hunter2", "Tr0ub4dor&3", "correcthorse"]])

try:
    re.compile(r"(?<=\$\s*)\d+")
except re.error as err:
    print(err)
```

### Lazy, possessive and atomic

Greedy and lazy quantifiers (`*?`, `+?`, `??`) work exactly as in JavaScript. Python 3.11 added two things JavaScript doesn't have: **possessive quantifiers** (`*+`, `++`, `?+`, `{m,n}+`) and **atomic groups** (`(?>...)`). Both match as much as they can and then refuse to give any of it back, so the engine can't backtrack into them. That changes what matches, and it's a defence against runaway backtracking.

```python run
import re

html = '<a href="/one">One</a> <a href="/two">Two</a>'
print(re.findall(r'href="(.*)"', html))      # greedy: runs to the last quote
print(re.findall(r'href="(.*?)"', html))     # lazy: stops at the first
print(re.findall(r'href="([^"]*)"', html))   # a negated class: clearest of the three

print(re.fullmatch(r"\d+0", "1000"))         # \d+ gives one 0 back so that 0 can match
print(re.fullmatch(r"\d++0", "1000"))        # possessive (3.11+): it won't
```

:::deep Catastrophic backtracking
A pattern like `(\w+)*@`, run against a long string with no `@` in it, makes a backtracking engine try every way of dividing the word characters between the `+` and the `*`. The work grows exponentially with the length of the input. JavaScript's engines backtrack the same way, and Python's `re` has no timeout. The defences are the same in both languages: avoid nested quantifiers over the same characters, prefer negated classes such as `[^"]*` to `.*?`, and cap the length of untrusted input. Python adds possessive and atomic forms, `(?>\w+)*@`, which leave nothing to backtrack into.
:::

## Scanning with `finditer`

:::compare
```js
const TOKEN = /(?<num>\d+(?:\.\d+)?)|(?<name>[A-Za-z_]\w*)|(?<op>\*\*|[-+*\/()])|(?<ws>\s+)|(?<bad>.)/g;
for (const m of source.matchAll(TOKEN)) {
  const [kind, text] = Object.entries(m.groups).find(([, v]) => v !== undefined);
  if (kind === "bad") throw new SyntaxError(`unexpected ${text} at ${m.index}`);
  if (kind !== "ws") tokens.push([kind, text]);
}
```
```python
TOKEN = re.compile(r"(?P<num>\d+(?:\.\d+)?)|(?P<name>[A-Za-z_]\w*)|(?P<op>\*\*|[-+*/()])|(?P<ws>\s+)|(?P<bad>.)")
for m in TOKEN.finditer(source):
    kind, text = m.lastgroup, m[0]
    if kind == "bad":
        raise SyntaxError(f"unexpected {text!r} at {m.start()}")
    if kind != "ws":
        tokens.append((kind, text))
```
:::

`finditer` yields `Match` objects lazily, so it handles huge strings, and every match knows where it is: `m.start()`, `m.end()` and `m.span(group)`, with no `d` flag needed. That makes it the engine of the classic `re` tokenizer:

1. One alternation of named groups, one per token kind. Earlier alternatives win, so put longer operators (`**`) before shorter ones (`*`).
2. `m.lastgroup` says which alternative matched, so there's no hunting through the groups the way the JS version does.
3. A catch-all `(?P<ERROR>.)` at the end, so a character nothing else accepts is reported instead of silently skipped.

`match` on `m.lastgroup` reads well ([Pattern Matching](lesson:pattern-matching)):

```python run
import re

TOKEN = re.compile(r"""
    (?P<NUMBER> \d+(?:\.\d+)? )
  | (?P<NAME>   [A-Za-z_]\w* )
  | (?P<OP>     \*\*|[-+*/()] )        # longer operators first
  | (?P<SPACE>  \s+ )
  | (?P<ERROR>  . )                    # anything else is a mistake
""", re.VERBOSE)

def tokenize(source):
    for m in TOKEN.finditer(source):
        match m.lastgroup:
            case "NUMBER":
                yield ("NUMBER", float(m[0]), m.start())
            case "SPACE":
                continue
            case "ERROR":
                raise SyntaxError(f"unexpected {m[0]!r} at column {m.start()}")
            case kind:
                yield (kind, m[0], m.start())

print(list(tokenize("price * 1.2 ** qty")))
try:
    list(tokenize("price $ 2"))
except SyntaxError as err:
    print(err)
```

:::tip `lastgroup` and nested groups
`lastgroup` names the group that *closed* last, so when a named group wraps other named groups, it's the outer one that counts. Name each alternative as a whole, `(?P<filter>(?P<key>\w+):(?P<value>\S+))`, and `lastgroup` is `"filter"` no matter which inner groups matched.
:::

## Replacing and splitting

:::compare
```js
template.replaceAll(/\{(\w+)\}/g, (match, key) => (key in values ? values[key] : match));
text.replace(/\s+/g, " ");
"3 + 4 - 10".split(/\s*([+-])\s*/);         // ["3", "+", "4", "-", "10"]
"red, green;blue".split(/[,;]\s*/, 1);      // ["red"]: truncated
```
```python
re.sub(r"\{(\w+)\}", lambda m: values.get(m[1], m[0]), template)
re.sub(r"\s+", " ", text)
re.split(r"\s*([+-])\s*", "3 + 4 - 10")     # ['3', '+', '4', '-', '10']
re.split(r"[,;]\s*", "red, green;blue", maxsplit=1)   # ['red', 'green;blue']
```
:::

A replacement function receives one `Match` and must return a `str`, where JavaScript's callback gets `(match, p1, p2, ..., offset, string, groups)`. `re.subn()` returns the new string together with the number of replacements. `re.split()` keeps captured separators in the result, as JavaScript does, while `maxsplit` keeps the remainder in the last item instead of dropping it, just like `str.split`.

```python run
import re

template = "Hi {name}, your {plan} plan renews on {date}."
values = {"name": "Ada", "plan": "Pro"}
print(re.sub(r"\{(\w+)\}", lambda m: values.get(m[1], m[0]), template))

text, count = re.subn(r"\s+", " ", "too   many \t spaces\n here")
print(repr(text), count)

print(re.split(r"\s*([+-])\s*", "3 + 4 - 10"))
print(re.split(r"[,;]\s*", "red, green;blue", maxsplit=1))
```

:::gotcha A replacement string is a template
In a replacement *string*, `re` processes backslashes: `\1` and `\g<name>` insert groups, and `\n` becomes a newline. Insert arbitrary text that way, such as a Windows path or something a user typed, and you get `PatternError: bad escape \U`, or silently different output. Pass a function to insert text literally. (JavaScript has the same problem with `$&` and `$1` in replacement strings.)
:::

```python run
import re

folder = r"C:\Users\ada\new"
try:
    re.sub("FOLDER", folder, "cd FOLDER")
except re.error as err:
    print("as a template:", err)
print("as literal text:", re.sub("FOLDER", lambda m: folder, "cd FOLDER"))
```

:::quiz output
What does this print?

```python
import re
print(re.split(r"(,)", "a,b,c", maxsplit=1))
```

- [ ] `['a', 'b,c']`
- [x] `['a', ',', 'b,c']`
- [ ] `['a', ',', 'b', ',', 'c']`
- [ ] `['a', ',']`

The capturing group puts each separator in the result, and `maxsplit=1` stops after the first split while keeping the rest of the string in the last item.
:::

## Parsing structured text

:::compare
```js
const [key, ...rest] = header.split(":");     // "Host: example.com:8080"
const value = rest.join(":").trim();

const args = cmd.match(/"[^"]*"|\S+/g);       // hand-rolled quoting

const m = line.match(LINE);
if (!m) errors.push(lineNo);
```
```python
key, _, value = header.partition(":")         # splits once, never raises
value = value.strip()

args = shlex.split(cmd)                       # real shell quoting rules

m = LINE.fullmatch(line)                      # the whole line, or None
if not m:
    errors.append(line_no)
```
:::

Before you write a regex, walk down the ladder:

1. **String methods.** `partition` splits once and always returns three parts, `split` with `maxsplit` keeps the rest, and `startswith` takes a tuple. They're faster and clearer than any pattern.
2. **`shlex.split`** for command lines, or anything else that quotes like a shell.
3. **`re` with `fullmatch`**, one pattern per line format. `fullmatch` rejects a line that only partly fits, where `search` would accept it.
4. **A real parser** for a real format: `csv`, `json`, `tomllib` ([Data Formats](lesson:data-formats)) and `html.parser`. A regex that parses JSON or CSV works until the first escaped quote.

```python run
import shlex

raw = "Host: example.com:8080\nContent-Type: text/html; charset=utf-8\nX-Retry: 3"
headers = {}
for line in raw.splitlines():
    name, _, value = line.partition(":")
    headers[name.strip().casefold()] = value.strip()
print(headers)

print(shlex.split("""deploy --tag "v1.2 beta" --note='hot fix' prod"""))
print(shlex.join(["git", "commit", "-m", "fix: handle empty input"]))   # the reverse, safely quoted
```

:::gotcha `shlex` follows shell rules
`shlex.split` treats a backslash as an escape and both kinds of quote as grouping, exactly as a POSIX shell does. That's right for command lines and wrong for formats with their own rules: `shlex.split(r"path=C:\temp\app.log")` gives `['path=C:tempapp.log']`.
:::

For a line-oriented format, keep the line numbers and collect the lines that don't parse instead of crashing on the first one:

```python run
import re
from dataclasses import dataclass

LINE = re.compile(r"""
    (?P<ts>\S+) \s+
    (?P<level>DEBUG|INFO|WARN|ERROR) \s+
    \[(?P<component>[\w.-]+)\] \s+
    (?P<message>.+)
""", re.VERBOSE)

@dataclass
class Entry:
    line_no: int
    level: str
    component: str
    message: str

LOG = """\
2026-11-10T09:15:02Z INFO  [api] started on :8080
2026-11-10T09:15:09Z WARN  [billing] retry 2/5 for invoice 8812
this line is garbage
2026-11-10T09:15:11Z ERROR [billing] invoice 8812 failed: card declined
"""

entries, bad_lines = [], []
for line_no, line in enumerate(LOG.splitlines(), start=1):
    if m := LINE.fullmatch(line):
        entries.append(Entry(line_no, m["level"], m["component"], m["message"]))
    else:
        bad_lines.append(line_no)

print([e.level for e in entries], "unparsed lines:", bad_lines)
print(*(e for e in entries if e.level == "ERROR"), sep="\n")
```

## Beyond regex: `translate`, `textwrap` and `Template`

### `str.translate`: character-for-character edits

:::compare
```js
text.replace(/[‘’]/g, "'").replace(/[“”]/g, '"').replace(/\u00a0/g, " ");
phone.replace(/[ ()-]/g, "");
```
```python
SMART = str.maketrans({"‘": "'", "’": "'", "“": '"', "”": '"', "\u00a0": " "})
text.translate(SMART)
phone.translate(str.maketrans("", "", " ()-"))
```
:::

`str.maketrans()` builds a translation table once, and `translate()` applies it in a single pass over the string, with no regex engine involved. The table comes in three shapes: a dict mapping characters to strings (or to `None`, which deletes them), two equal-length strings mapped position by position, and an optional third string of characters to delete. It's the tool for normalising typographic quotes and stripping punctuation, especially in a hot loop.

```python run
import string

SMART = str.maketrans({"‘": "'", "’": "'", "“": '"', "”": '"', "\u00a0": " ", "…": "..."})
print("“Don’t panic”\u00a0- it’s fine…".translate(SMART))

print("+1 (555) 123-4567".translate(str.maketrans("", "", " ()-")))
NO_PUNCTUATION = str.maketrans("", "", string.punctuation)
print("Hello, world! (again)".translate(NO_PUNCTUATION))
print("2024/06/01".translate(str.maketrans("/", "-")))
```

### `textwrap`: paragraphs for terminals and emails

:::compare
```js
import wrap from "word-wrap";        // npm: there's no built-in

wrap(note, { width: 38, indent: "  " });
```
```python
import textwrap

textwrap.fill(note, width=38, initial_indent="  ", subsequent_indent="  ")
```
:::

`textwrap.wrap()` returns a list of lines and `fill()` joins them into one string. Both break at whitespace, and they only split a word that's longer than the whole width. `initial_indent` and `subsequent_indent` produce bullets and hanging indents, `max_lines` caps the output, and `shorten()` collapses whitespace and truncates at a word boundary with a `placeholder`. `indent()` prefixes every non-blank line, unless you pass a predicate, and `dedent()`, from [Batteries Included](lesson:standard-library#small-modules-worth-knowing), strips the common indentation from triple-quoted strings.

```python run
import textwrap

note = ("Deploys are frozen from Friday 18:00 until Monday 08:00. "
        "Hotfixes need approval from the on-call lead and a rollback plan.")
print(textwrap.fill(note, width=38, initial_indent="- ", subsequent_indent="  "))
print(textwrap.shorten(note, width=40, placeholder=" [...]"))
print(textwrap.indent("Sounds good.\n\nShip it.", "> ", lambda line: True))
```

### `string.Template`: templates that are data

:::compare
```js
// Template literals are code. For a template stored as data,
// you hand-roll a replace() or install a template engine:
tpl.replace(/\$\{(\w+)\}/g, (_, key) => values[key]);
```
```python
from string import Template

Template("Hi $name, you have ${count}x credit").substitute(name="Ada", count=3)
```
:::

An f-string is code, evaluated where it's written. When the template is **data**, typed by a user or stored in a config file or a database, use `string.Template`. It understands `$name` and `${name}`, and `$$` is a literal dollar sign. `substitute()` raises `KeyError` for a missing value and `safe_substitute()` leaves the placeholder in place. It does nothing but look up names: no expressions, no attribute access, no indexing, which is exactly the property you want in a template a stranger wrote. For templates you write yourself, see t-strings ([Strings & f-strings](lesson:strings#tagged-templates-t-strings-3-14)) or a full engine such as Jinja2.

:::gotcha `str.format` on a user's template leaks data
Format fields can reach attributes and indexes, so a user-editable "Hi {user.name}" email template can also say `{user.password_hash}`, and `.format(user=user)` happily fills it in. `Template` only does flat name lookups, so pass it exactly the values you mean to expose.
:::

```python run
from dataclasses import dataclass
from string import Template

@dataclass
class User:
    name: str
    password_hash: str

ada = User("Ada", "pbkdf2:sha256:600000$...")
typed_by_user = "Hi {user.name}! (psst: {user.password_hash})"
print(typed_by_user.format(user=ada))                # str.format reaches attributes

email = Template("Hi $name, your $plan plan costs $$${price}/month.")
print(email.substitute(name=ada.name, plan="Pro", price=12))
print(email.get_identifiers())                       # 3.11+: handy for validation
try:
    email.substitute(name=ada.name)
except KeyError as err:
    print("missing:", err)
print(Template("Hi $name, re: $subject").safe_substitute(name=ada.name))
```

## `difflib`: fuzzy matches and diffs

:::compare
```js
import { closest } from "fastest-levenshtein";   // npm
import { createTwoFilesPatch } from "diff";       // npm

closest(typo, COMMANDS);
createTwoFilesPatch("old.ini", "new.ini", oldText, newText);
```
```python
import difflib


difflib.get_close_matches(typo, COMMANDS, n=1)
difflib.unified_diff(old.splitlines(keepends=True), new.splitlines(keepends=True),
                     fromfile="old.ini", tofile="new.ini")
```
:::

`get_close_matches(word, possibilities, n=3, cutoff=0.6)` returns up to `n` candidates that score at least `cutoff`, best first, which is a CLI's "did you mean?" in one call. The score is `SequenceMatcher(None, a, b).ratio()`, a similarity from 0 to 1 based on the longest matching blocks, not a Levenshtein edit distance.

`unified_diff(a, b, fromfile, tofile, n=3)` takes two **lists of lines** and yields the lines of a git-style patch. Keep the line endings with `splitlines(keepends=True)`, or pass `lineterm=""` if your lines don't have them. Python 3.14 raises `TypeError` when you pass plain strings, and older versions silently diffed them character by character. `ndiff()` gives a more detailed, human-oriented diff, and `HtmlDiff` renders a side-by-side table.

```python run
import difflib

COMMANDS = ["status", "commit", "checkout", "cherry-pick", "rebase"]
for typo in ["chekout", "comit", "xyzzy"]:
    print(typo, "->", difflib.get_close_matches(typo, COMMANDS, n=1))

print(round(difflib.SequenceMatcher(None, "kitten", "sitting").ratio(), 3))

old = "host = localhost\nport = 8080\ndebug = false\n"
new = "host = localhost\nport = 9090\ndebug = false\nworkers = 4\n"
diff = difflib.unified_diff(old.splitlines(keepends=True), new.splitlines(keepends=True),
                            fromfile="old.ini", tofile="new.ini")
print("".join(diff), end="")
```

## Unicode normalisation and `casefold`

:::compare
```js
"cafe\u0301" === "café";                            // false: two spellings
"cafe\u0301".normalize("NFC") === "café";           // true
"ﬁle".normalize("NFKC");                            // "file"
"Straße".toLowerCase() === "strasse";               // false
a.localeCompare(b, undefined, { sensitivity: "base" }) === 0;   // accent- and case-blind
```
```python
"cafe\u0301" == "café"                               # False: two spellings
unicodedata.normalize("NFC", "cafe\u0301") == "café"  # True
unicodedata.normalize("NFKC", "ﬁle")                 # "file"
"Straße".casefold() == "strasse"                     # True
fold(a) == fold(b)                                   # build it yourself, below
```
:::

The same visible text can be different code points ([Strings](lesson:strings#length-code-points-and-unicode) showed the `é` case), so normalise text where it enters your system. `unicodedata.normalize()` has four forms. NFC composes (`é` becomes one code point) and NFD decomposes (`e` plus a combining accent). The **K** forms also replace *compatibility* characters, such as the `ﬁ` ligature, full-width letters, superscripts and circled digits, with their plain equivalents. That loses information, so use NFKC for search keys and identifiers, and NFC for text you store.

For comparing without case, `casefold()` is `lower()` designed for the job: it also turns `ß` into `ss` and `ﬁ` into `fi`. There's no `localeCompare` with `sensitivity: "base"`, but a decent accent- and case-blind key is three steps: decompose with NFKD, drop the combining marks, casefold. It isn't transliteration, though. `Ł` is a letter in its own right, not an `L` with an accent, so it survives, and locale rules such as Turkish dotted and dotless `i` need a locale-aware library like PyICU.

```python run
import unicodedata

def fold(text):
    decomposed = unicodedata.normalize("NFKD", text)
    stripped = "".join(c for c in decomposed if not unicodedata.combining(c))
    return stripped.casefold()

print(fold("Crème Brûlée"), fold("ﬁancé"), fold("STRASSE") == fold("Straße"))
print(fold("Łódź"))                              # Ł has no decomposition

for form in ["NFC", "NFD", "NFKC"]:
    print(form, ascii(unicodedata.normalize(form, "café ﬁ ²")))
```

:::gotcha `re.IGNORECASE` doesn't casefold
Case-insensitive regexes compare one character at a time, so `re.fullmatch("strasse", "Straße", re.I)` is `None`: no single character of `"strasse"` matches `ß`. When that matters, casefold the text (and a literal pattern) before matching.
:::

:::quiz output
What does this print?

```python
print("Straße".lower() == "STRASSE".lower(), "Straße".casefold() == "STRASSE".casefold())
```

- [ ] `True True`
- [x] `False True`
- [ ] `False False`
- [ ] `True False`

`lower()` leaves `ß` alone, so it compares `straße` with `strasse`. `casefold()` maps `ß` to `ss`, which is the point of it: use `casefold()` whenever you compare strings without regard to case.
:::

## Cheat sheet

| JavaScript | Python | Notes |
| --- | --- | --- |
| `/\d+/g` | `re.compile(r"\d+")` | raw string, no `g` flag |
| `re.test(s)` | `p.search(s) is not None` | `Match` objects are truthy |
| `s.matchAll(re)` | `p.finditer(s)` | lazy; `m.start()`, `m.span()` |
| `s.replaceAll(re, fn)` | `p.sub(fn, s)` | `fn` receives one `Match` |
| `"$&"`, `"$1"`, `"$<name>"` | `r"\g<0>"`, `r"\1"`, `r"\g<name>"` | a function inserts text literally |
| `s.split(re, n)` | `p.split(s, maxsplit=n)` | keeps the remainder |
| `/y` and `lastIndex` | `p.match(s, pos)` | |
| `(?<name>...)`, `\k<name>` | `(?P<name>...)`, `(?P=name)` | JS spellings are a `PatternError` |
| no `x` flag | `re.VERBOSE` | escape literal spaces and `#` |
| `(?i:...)` | `(?i:...)` | a global `(?i)` only at the start |
| variable-width `(?<=...)` | fixed-width only | or the `regex` package |
| no possessive quantifiers | `a++`, `(?>...)` | 3.11+ |
| `re.sub(p, r, s, re.I)` | `re.sub(p, r, s, flags=re.I)` | a 4th positional is the count |
| `RegExp.escape(s)` | `re.escape(s)` | |
| `split(":")` and rejoin | `s.partition(":")` | splits once, never raises |
| hand-rolled arg quoting | `shlex.split(s)` | shell rules, backslashes included |
| chained `.replace()` per character | `s.translate(str.maketrans(...))` | one pass |
| word-wrap | `textwrap.fill(s, width=...)` | `shorten`, `indent`, `dedent` |
| a user-supplied template | `string.Template(s).substitute(...)` | no attribute access |
| fastest-levenshtein `closest` | `difflib.get_close_matches(w, words)` | a similarity ratio |
| `createTwoFilesPatch` | `difflib.unified_diff(a_lines, b_lines)` | lists of lines |
| `s.normalize("NFC")` | `unicodedata.normalize("NFC", s)` | NFKC for search keys |
| `localeCompare` with `sensitivity: "base"` | NFKD, drop combining marks, `casefold()` | no locale rules |

## Challenges

:::challenge id=text-slugify title="Slugify a title" difficulty=easy
Write `slugify(title)` that turns a title into a URL slug:

1. Decompose with NFKD and drop the combining marks, so `"Crème"` becomes `"Creme"` and `"ﬁle"` becomes `"file"`.
2. Then casefold, so `"Straße"` becomes `"strasse"`. The order matters, because decomposing can create capitals: NFKD turns `"№"` into `"No"`.
3. Replace every run of characters other than `a`-`z` and `0`-`9` with a single `-`, and strip `-` from both ends.
4. If nothing is left, return `"untitled"`.

```text
slugify("Crème Brûlée à la carte")  ->  "creme-brulee-a-la-carte"
slugify("Python 3.14 is out!")      ->  "python-3-14-is-out"
slugify("日本語")                    ->  "untitled"
```

This simple version drops scripts that don't decompose to ASCII, like the Japanese example. The JavaScript below is close to what this site uses for its own heading anchors.

```js
const slugify = (title) =>
  title.normalize("NFKD").replace(/[\u0300-\u036f]/g, "").toLowerCase()
    .replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") || "untitled";
```

```python starter
import re
import unicodedata

def slugify(title):
    ...
```

```python solution
import re
import unicodedata

def slugify(title):
    decomposed = unicodedata.normalize("NFKD", title)
    plain = "".join(c for c in decomposed if not unicodedata.combining(c)).casefold()
    return re.sub(r"[^a-z0-9]+", "-", plain).strip("-") or "untitled"
```

```python tests
@test("lowercases and joins words with dashes")
def _():
    eq(slugify("Hello, World!"), "hello-world")

@test("drops accents")
def _():
    eq(slugify("Crème Brûlée à la carte"), "creme-brulee-a-la-carte")

@test("casefolds, so ß becomes ss")
def _():
    eq(slugify("Straße"), "strasse")

@test("replaces compatibility characters like ligatures and full-width letters")
def _():
    eq(slugify("ﬁle № 5"), "file-no-5")
    eq(slugify("ＦＵＬＬ width"), "full-width")

@test("collapses runs of separators and trims the ends")
def _():
    eq(slugify("  --Multiple   spaces & symbols--  "), "multiple-spaces-symbols")
    eq(slugify("Python 3.14 is out!"), "python-3-14-is-out")

@test("returns 'untitled' when nothing is left")
def _():
    eq(slugify("日本語"), "untitled")
    eq(slugify("!!!"), "untitled")
    eq(slugify(""), "untitled")
```

```hint
`unicodedata.normalize("NFKD", title)` splits `é` into `e` plus a combining accent, and `unicodedata.combining(c)` is non-zero for the accent. Keep the characters where it's `0`.
```

```hint
After `casefold()`, `re.sub(r"[^a-z0-9]+", "-", text)` turns each run of other characters into one dash. `.strip("-")` trims the ends, and `or "untitled"` handles the empty result.
```
:::

:::challenge id=text-logfmt title="Parse logfmt" difficulty=medium
[logfmt](https://brandur.org/logfmt) is the `key=value` log format used by Heroku, Grafana Loki and many Go services. Write `parse_logfmt(line)` that parses one line into a dict of strings:

- Pairs are `key=value`, separated by whitespace. Keys are made of letters, digits, `_`, `.` and `-`.
- A value is either **double-quoted**, which can contain spaces and `=` and loses its quotes, or **bare**: a run of non-whitespace characters, kept exactly as written, backslashes included.
- `key=` with nothing after it, and `key=""`, both mean an empty string.
- Words without an `=` are ignored, and when a key repeats, the last value wins.

```text
parse_logfmt('level=warn msg="disk almost full" pct=91 user=')
{'level': 'warn', 'msg': 'disk almost full', 'pct': '91', 'user': ''}
```

```js
function parseLogfmt(line) {
  const fields = {};
  for (const m of line.matchAll(/([\w.-]+)=(?:"([^"]*)"|(\S*))/g)) {
    fields[m[1]] = m[2] ?? m[3];
  }
  return fields;
}
```

```python starter
import re

def parse_logfmt(line):
    ...
```

```python solution
import re

PAIR = re.compile(r"""
    (?P<key>[\w.-]+) =
    (?: "(?P<quoted>[^"]*)"     # a quoted value: may hold spaces and =
      | (?P<bare>\S*) )         # or a bare one: possibly empty
""", re.VERBOSE)

def parse_logfmt(line):
    return {
        m["key"]: m["quoted"] if m["quoted"] is not None else m["bare"]
        for m in PAIR.finditer(line)
    }
```

```python tests
@test("parses bare values")
def _():
    eq(parse_logfmt("level=info status=200 path=/api/users"),
       {"level": "info", "status": "200", "path": "/api/users"})

@test("quoted values keep spaces and = signs, and lose their quotes")
def _():
    eq(parse_logfmt('msg="disk almost full" query="a=1 b=2"'),
       {"msg": "disk almost full", "query": "a=1 b=2"})

@test("empty values, quoted or not, are empty strings")
def _():
    eq(parse_logfmt('user= note="" level=debug'), {"user": "", "note": "", "level": "debug"})

@test("bare values keep their backslashes")
def _():
    eq(parse_logfmt(r"file=C:\logs\app.log retries=3"), {"file": r"C:\logs\app.log", "retries": "3"})

@test("keys may contain dots and dashes")
def _():
    eq(parse_logfmt("http.method=GET trace-id=abc123"), {"http.method": "GET", "trace-id": "abc123"})

@test("words without = are ignored, and the last repeated key wins")
def _():
    eq(parse_logfmt("oops level=info level=warn ok"), {"level": "warn"})

@test("a blank line gives an empty dict")
def _():
    eq(parse_logfmt(""), {})
    eq(parse_logfmt("   "), {})
```

```hint
One pattern with an alternation does it: `([\w.-]+)=(?:"([^"]*)"|(\S*))`. Named groups make the rest readable. `finditer` skips the whitespace and the stray words for you.
```

```hint
Exactly one of the two value groups takes part in each match, and the other is `None`. Careful: `m["quoted"] or m["bare"]` turns `key=""` into `None`, because `""` is falsy. Test with `is not None`.
```

```hint
`shlex.split` looks tempting, but it applies shell rules and eats the backslashes in `C:\logs\app.log`.
```
:::

:::challenge id=text-snake-case title="camelCase to snake_case" difficulty=medium
Write `to_snake(name)` that converts a camelCase or PascalCase identifier to snake_case, keeping **acronyms** together:

```text
userName            ->  user_name
parseHTTPResponse   ->  parse_http_response
XMLParser           ->  xml_parser
userID              ->  user_id
v2Api               ->  v2_api
already_snake       ->  already_snake
```

There's a word boundary wherever a lowercase letter or digit is followed by an uppercase letter, and wherever an uppercase letter is followed by an uppercase letter **and then a lowercase one** (the `P|R` in `HTTPResponse`). Use lookarounds, so that the pattern matches the empty boundary itself, and insert `_` there. Then lowercase the result.

```js
// The usual one-liner gets acronyms wrong: "parse_httpresponse"
const toSnake = (name) => name.replace(/([a-z0-9])([A-Z])/g, "$1_$2").toLowerCase();
```

```python starter
import re

def to_snake(name):
    return re.sub(r"([a-z0-9])([A-Z])", r"\1_\2", name).lower()
```

```python solution
import re

BOUNDARY = re.compile(r"""
    (?<=[a-z0-9])(?=[A-Z])       # lower or digit, then upper: userName, v2Api
  | (?<=[A-Z])(?=[A-Z][a-z])     # the end of an acronym: HTTP|Response
""", re.VERBOSE)

def to_snake(name):
    return BOUNDARY.sub("_", name).lower()
```

```python tests
@test("splits where lowercase meets uppercase")
def _():
    eq(to_snake("userName"), "user_name")
    eq(to_snake("createdAtUtc"), "created_at_utc")

@test("PascalCase works too")
def _():
    eq(to_snake("HttpServer"), "http_server")

@test("keeps acronyms together")
def _():
    eq(to_snake("parseHTTPResponse"), "parse_http_response")
    eq(to_snake("XMLParser"), "xml_parser")
    eq(to_snake("IOError"), "io_error")

@test("an acronym at the end stays whole")
def _():
    eq(to_snake("userID"), "user_id")
    eq(to_snake("ID"), "id")

@test("handles digits")
def _():
    eq(to_snake("v2Api"), "v2_api")
    eq(to_snake("base64Encode"), "base64_encode")

@test("leaves snake_case and single words alone")
def _():
    eq(to_snake("already_snake"), "already_snake")
    eq(to_snake("name"), "name")
    eq(to_snake(""), "")

@test("matches the boundaries with lookarounds")
def _():
    check(any(op in source for op in ("(?=", "(?<=", "(?!", "(?<!")),
          "use a lookahead (?=...) or lookbehind (?<=...) to match the boundary between words")
```

```hint
A zero-width match is a position between two characters. `(?<=[a-z0-9])(?=[A-Z])` matches the spot between `r` and `N` in `userName`, and `re.sub` inserts `_` there without consuming either letter.
```

```hint
Acronyms need a second alternative: an uppercase letter behind you, and an uppercase letter followed by a lowercase one ahead of you. That's `(?<=[A-Z])(?=[A-Z][a-z])`, the spot between `P` and `R` in `HTTPResponse`.
```
:::

:::challenge id=text-search-query title="Parse a search query" difficulty=hard
Write `parse_query(query)` for a GitHub-style search box. It returns a tuple `(terms, filters)`:

- A bare word is a search term: `crash`.
- A double-quoted phrase is a single term, without its quotes: `"on startup"` gives `on startup`.
- `key:value` is a filter, returned as the tuple `(key, value, False)`. The key is word characters. The value is either double-quoted (`author:"Ada Lovelace"`) or a bare run of non-whitespace characters other than `"`, and it may contain colons (`url:https://example.com`).
- A leading `-` negates a filter: `-label:wontfix` gives `("label", "wontfix", True)`.
- Terms and filters each keep their order of appearance, and any whitespace separates tokens.
- A `"` without a partner, anywhere, raises `ValueError` with a message that includes the 0-based index of that quote.

```text
parse_query('is:open author:"Ada Lovelace" -label:wontfix crash "on startup"')
(['crash', 'on startup'],
 [('is', 'open', False), ('author', 'Ada Lovelace', False), ('label', 'wontfix', True)])
```

Build it as a tokenizer: one verbose pattern with an alternative per kind of token, `finditer`, and `m.lastgroup`.

```js
function parseQuery(query) {
  const TOKEN = /(?<filter>(?<neg>-)?(?<key>\w+):(?:"(?<quoted>[^"]*)"|(?<value>[^\s"]+)))|"(?<phrase>[^"]*)"|(?<word>[^\s"]+)|(?<stray>")/g;
  const terms = [], filters = [];
  for (const m of query.matchAll(TOKEN)) {
    const g = m.groups;
    if (g.filter) filters.push([g.key, g.quoted ?? g.value, g.neg !== undefined]);
    else if (g.phrase !== undefined) terms.push(g.phrase);
    else if (g.word) terms.push(g.word);
    else throw new SyntaxError(`unmatched quote at index ${m.index}`);
  }
  return [terms, filters];
}
```

```python starter
import re

def parse_query(query):
    terms, filters = [], []
    return terms, filters
```

```python solution
import re

TOKEN = re.compile(r"""
    (?P<filter> (?P<neg>-)? (?P<key>\w+) :
        (?: "(?P<quoted>[^"]*)" | (?P<value>[^\s"]+) ) )
  | "(?P<phrase>[^"]*)"
  | (?P<word>[^\s"]+)
  | (?P<stray>")                  # a quote that no alternative above could close
""", re.VERBOSE)

def parse_query(query):
    terms, filters = [], []
    for m in TOKEN.finditer(query):
        match m.lastgroup:
            case "filter":
                value = m["quoted"] if m["quoted"] is not None else m["value"]
                filters.append((m["key"], value, m["neg"] is not None))
            case "phrase" | "word":
                terms.append(m[m.lastgroup])
            case "stray":
                raise ValueError(f"unmatched quote at index {m.start()}")
    return terms, filters
```

```python tests
import re

@test("bare words are terms")
def _():
    eq(parse_query("crash on startup"), (["crash", "on", "startup"], []))

@test("a quoted phrase is one term, without its quotes")
def _():
    eq(parse_query('"on startup" crash'), (["on startup", "crash"], []))

@test("key:value pairs are filters")
def _():
    eq(parse_query("is:open label:bug"), ([], [("is", "open", False), ("label", "bug", False)]))

@test("filter values can be quoted")
def _():
    eq(parse_query('author:"Ada Lovelace"'), ([], [("author", "Ada Lovelace", False)]))

@test("a leading - negates a filter")
def _():
    eq(parse_query("-label:wontfix"), ([], [("label", "wontfix", True)]))

@test("filter values may contain colons")
def _():
    eq(parse_query("url:https://example.com/a"), ([], [("url", "https://example.com/a", False)]))

@test("everything together, in order")
def _():
    query = 'is:open author:"Ada Lovelace" -label:wontfix crash "on startup"'
    eq(parse_query(query), (
        ["crash", "on startup"],
        [("is", "open", False), ("author", "Ada Lovelace", False), ("label", "wontfix", True)],
    ))

@test("any whitespace separates tokens")
def _():
    eq(parse_query("  crash\tis:open\n\n  "), (["crash"], [("is", "open", False)]))
    eq(parse_query(""), ([], []))

@test("an unmatched quote raises ValueError with its index")
def _():
    err = raises(ValueError, parse_query, 'crash "on startup')
    check(re.search(r"\b6\b", str(err)), f"the message should include the index 6, got {str(err)!r}")
    err = raises(ValueError, parse_query, 'is:open author:"Ada')
    check(re.search(r"\b15\b", str(err)), f"the message should include the index 15, got {str(err)!r}")
```

```hint
Order the alternatives from most to least specific: filter, then quoted phrase, then bare word, and finally a lone `"`, so that a quote nobody could close gets reported. `finditer` skips the whitespace for you, because no alternative matches it.
```

```hint
Wrap the whole filter alternative in `(?P<filter>...)`. `m.lastgroup` names the group that closed last, so it reports `"filter"` whichever inner groups matched, and `match m.lastgroup:` dispatches on the kind of token.
```

```hint
For the filter value, use `"(?P<quoted>[^"]*)"|(?P<value>[^\s"]+)` and pick with `is not None`. Excluding `"` from bare values is what makes `author:"Ada` fail as a filter, fall through to a bare word plus a stray quote, and raise.
```
:::
