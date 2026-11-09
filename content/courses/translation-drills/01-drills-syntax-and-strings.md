---
title: "Drills: Syntax & Strings"
part: Warm-up
summary: Port template literals, string methods, number formats, ??, switch, typeof and parseInt to Python.
minutes: 45
---

Ten warm-up drills. Each one is a few lines of everyday JavaScript: a template literal, a string cleanup, a `switch`, a `parseInt` guard. Port it to the Python a reviewer would approve. The tests pin down the behaviour, especially where the two languages disagree: `0` and `""` versus `None`, Python's strict `int()`, Unicode-aware string methods and `%` on negative numbers. Every drill links to the lesson that teaches its idiom, in case you want a refresher first.

## The mappings

| JavaScript | Python |
| --- | --- |
| `` `Hi ${name}` `` | `f"Hi {name}"` |
| `cond ? a : b` | `a if cond else b` |
| `s.trim()`, `s.toLowerCase()` | `s.strip()`, `s.lower()` |
| `s.trim().split(/\s+/)` | `s.split()` |
| `s.includes(x)`, `s.startsWith(x)` | `x in s`, `s.startswith(x)` (a tuple of prefixes works too) |
| `s.slice(-4)` | `s[-4:]` |
| `s.padStart(8, "*")` | `s.rjust(8, "*")` or `f"{s:*>8}"` |
| `s.replaceAll(a, b)` | `s.replace(a, b)` |
| `n.toFixed(2)`, `n.toLocaleString()` | `f"{n:.2f}"`, `f"{n:,}"` |
| `a ?? b` | `a if a is not None else b` |
| `switch` / `case` / `default` | `match` / `case` / `case _:` |
| `typeof x === "string"` | `isinstance(x, str)` |
| `parseInt(s, 10)` plus an `isNaN` check | `int(s)` inside `try` / `except ValueError` |
| `s.charCodeAt(i)`, `String.fromCharCode(n)` | `ord(ch)`, `chr(n)` |

## Challenges

:::challenge id=drill-str-progress-label title="Progress label" difficulty=easy
Write `progress_label(done: int, total: int) -> str` that formats a task counter like the JavaScript version.

```text
progress_label(3, 4)  ->  '3/4 tasks (75%)'
progress_label(1, 1)  ->  '1/1 task (100%)'
progress_label(0, 0)  ->  '0/0 tasks (0%)'
```

Use an f-string. The `%` format type multiplies by 100 and appends the percent sign, so it replaces both `* 100` and `toFixed(0)`. Keep the guard for zero tasks: `0 / 0` is `NaN` in JavaScript, but Python raises `ZeroDivisionError`.

One difference the tests steer around: format specs round exact ties to even (`f"{1/8:.0%}"` is `'12%'`), where `toFixed` rounds them up (`"13"`).

Refresher: [the format-spec mini-language](lesson:strings#the-format-spec-mini-language) and [conditional expressions](lesson:truthiness-and-equality#conditional-expressions-any-and-all).

```js
function progressLabel(done, total) {
  const pct = total === 0 ? 0 : (done / total) * 100;
  return `${done}/${total} task${total === 1 ? "" : "s"} (${pct.toFixed(0)}%)`;
}
```

```python starter
def progress_label(done: int, total: int) -> str:
    ...
```

```python solution
def progress_label(done: int, total: int) -> str:
    ratio = done / total if total else 0
    plural = "" if total == 1 else "s"
    return f"{done}/{total} task{plural} ({ratio:.0%})"
```

```python tests
@test("formats the count and the percentage")
def _():
    eq(progress_label(3, 4), "3/4 tasks (75%)")
    eq(progress_label(2, 3), "2/3 tasks (67%)")
    eq(progress_label(10, 10), "10/10 tasks (100%)")

@test("one task is singular")
def _():
    eq(progress_label(1, 1), "1/1 task (100%)")
    eq(progress_label(0, 1), "0/1 task (0%)")

@test("zero tasks is 0%, not a ZeroDivisionError")
def _():
    eq(progress_label(0, 0), "0/0 tasks (0%)")

@test("uses an f-string")
def _():
    requires_syntax(ast.JoinedStr, "build the label with an f-string, Python's template literal")
```

```hint
`f"{0.75:.0%}"` is `'75%'`.
```

```hint
Guard the division with a conditional expression, `done / total if total else 0`, and pick the plural ending the same way.
```
:::

:::challenge id=drill-str-initials title="Initials" difficulty=easy
Write `initials(full_name: str) -> str` that returns the first letter of each word, uppercased.

```text
initials("ada lovelace")                 ->  'AL'
initials("  grace   brewster  hopper ")  ->  'GBH'
initials("")                             ->  ''
```

`str.split()` with **no arguments** splits on runs of any whitespace and ignores leading and trailing whitespace, so it does the `trim()` and the regex in one call. The JavaScript version crashes on a blank name (`"".split(/\s+/)` is `[""]`, and `""[0]` is `undefined`). Yours should return `""`.

Refresher: [join and split](lesson:lists#join-and-split).

```js
function initials(fullName) {
  return fullName
    .trim()
    .split(/\s+/)
    .map((word) => word[0].toUpperCase())
    .join("");
}
```

```python starter
def initials(full_name: str) -> str:
    ...
```

```python solution
def initials(full_name: str) -> str:
    return "".join(word[0].upper() for word in full_name.split())
```

```python tests
@test("first letter of each word, uppercased")
def _():
    eq(initials("ada lovelace"), "AL")
    eq(initials("Grace Hopper"), "GH")

@test("runs of spaces, tabs and newlines count as one separator")
def _():
    eq(initials("  grace   brewster  hopper "), "GBH")
    eq(initials("linus\ttorvalds\n"), "LT")

@test("a blank name gives an empty string")
def _():
    eq(initials(""), "")
    eq(initials("   "), "")

@test("no regex needed")
def _():
    forbids_import("re", "split() with no arguments already splits on any run of whitespace")
```

```hint
Compare `" a  b ".split()`, which is `['a', 'b']`, with `" a  b ".split(" ")`, which is `['', 'a', '', 'b', '']`.
```

```hint
`"".join(...)` takes a generator expression: `"".join(word[0] for word in words)`.
```
:::

:::challenge id=drill-str-mask-card title="Mask a card number" difficulty=easy
Write `mask_card(number: str) -> str` that removes spaces and dashes, then replaces every digit except the last four with `*`.

```text
mask_card("4242 4242 4242 4242")  ->  '************4242'
mask_card("3714-496353-98431")    ->  '***********8431'
mask_card("123")                  ->  '123'
```

`replaceAll` is plain `replace` in Python, because `str.replace` always replaces every occurrence. (JavaScript's `replace` with a string pattern replaces only the first.) `padStart` is `rjust`, and `slice(-4)` is `[-4:]`. Neither language truncates when padding, so numbers of four digits or fewer come back unmasked.

Refresher: [the String method map](lesson:strings#the-string-method-map) and [slicing](lesson:lists#slicing-slice-with-superpowers).

```js
function maskCard(number) {
  const digits = number.replaceAll(" ", "").replaceAll("-", "");
  return digits.slice(-4).padStart(digits.length, "*");
}
```

```python starter
def mask_card(number: str) -> str:
    ...
```

```python solution
def mask_card(number: str) -> str:
    digits = number.replace(" ", "").replace("-", "")
    return digits[-4:].rjust(len(digits), "*")
```

```python tests
@test("masks everything but the last four digits")
def _():
    eq(mask_card("4242424242424242"), "************4242")

@test("removes every space and dash, not just the first")
def _():
    eq(mask_card("4242 4242 4242 4242"), "************4242")
    eq(mask_card("5555-5555-5555-4444"), "************4444")
    eq(mask_card("3714 496353-98431"), "***********8431")

@test("four digits or fewer are left alone")
def _():
    eq(mask_card("1234"), "1234")
    eq(mask_card("12"), "12")
    eq(mask_card(""), "")
```

```hint
`digits[-4:]` is the last four characters, or the whole string if it's shorter.
```

```hint
`"4242".rjust(8, "*")` is `'****4242'`, and `rjust` never truncates.
```
:::

:::challenge id=drill-str-nullish-defaults title="Defaults with ??" difficulty=easy
Write `request_options(options: dict) -> dict` that returns the four settings below. Each one falls back to its default when the key is missing **or** holds `None`, exactly like `??`. Keys you don't recognise are dropped, and `options` itself isn't modified.

| Key | Default |
| --- | --- |
| `retries` | `3` |
| `timeout` | `30` |
| `cache` | `True` |
| `label` | `"request"` |

The trap is `or`. It's `||`, not `??`, so it also throws away `0`, `False` and `""`, and the tests use all three.

Refresher: [No `??` and no `?.`](lesson:truthiness-and-equality#no-and-no).

```js
function requestOptions(options) {
  return {
    retries: options.retries ?? 3,
    timeout: options.timeout ?? 30,
    cache: options.cache ?? true,
    label: options.label ?? "request",
  };
}
```

```python starter
def request_options(options: dict) -> dict:
    ...
```

```python solution
def request_options(options: dict) -> dict:
    defaults = {"retries": 3, "timeout": 30, "cache": True, "label": "request"}
    return {
        key: default if options.get(key) is None else options[key]
        for key, default in defaults.items()
    }
```

```python tests
DEFAULTS = {"retries": 3, "timeout": 30, "cache": True, "label": "request"}

@test("an empty dict gets every default")
def _():
    eq(request_options({}), DEFAULTS)

@test("given values win")
def _():
    eq(
        request_options({"retries": 5, "label": "sync"}),
        {"retries": 5, "timeout": 30, "cache": True, "label": "sync"},
    )

@test("None counts as missing, like null with ??")
def _():
    eq(request_options({"timeout": None, "cache": None}), DEFAULTS)

@test("0, False and empty strings are real values")
def _():
    eq(
        request_options({"retries": 0, "timeout": 0, "cache": False, "label": ""}),
        {"retries": 0, "timeout": 0, "cache": False, "label": ""},
    )

@test("unknown keys are dropped and the input is left alone")
def _():
    options = {"retries": 1, "debug": True}
    eq(request_options(options), {"retries": 1, "timeout": 30, "cache": True, "label": "request"})
    eq(options, {"retries": 1, "debug": True})
```

```hint
`a ?? b` is `a if a is not None else b`, and `options.get(key)` is `None` both when the key is missing and when it holds `None`.
```

```hint
A dict comprehension over a dict of defaults builds all four keys at once.
```
:::

:::challenge id=drill-str-normalize-url title="Normalize a URL" difficulty=medium
Write `normalize_url(raw: str) -> str` that:

1. trims surrounding whitespace and lowercases everything,
2. raises `ValueError` if a space is left inside,
3. adds `https://` unless the URL already starts with `http://` or `https://`,
4. drops **one** trailing slash.

```text
normalize_url("  Example.com/Docs/ ")   ->  'https://example.com/docs'
normalize_url("http://localhost:8000")  ->  'http://localhost:8000'
normalize_url("https://example.com//")  ->  'https://example.com/'
```

`includes` is the `in` operator, and `startswith` accepts a tuple of prefixes. For the slash, avoid `rstrip("/")`: the `strip` family takes a *set of characters* and removes all of them, so it would eat both slashes. `removesuffix` (3.9+) removes exactly one copy of a suffix. A generic `throw new Error` for bad input becomes `raise ValueError`.

Refresher: [Trimming strips characters, not prefixes](lesson:strings#trimming-strips-characters-not-prefixes).

```js
function normalizeUrl(raw) {
  let url = raw.trim().toLowerCase();
  if (url.includes(" ")) throw new Error(`invalid URL: ${raw}`);
  if (!url.startsWith("http://") && !url.startsWith("https://")) {
    url = `https://${url}`;
  }
  return url.endsWith("/") ? url.slice(0, -1) : url;
}
```

```python starter
def normalize_url(raw: str) -> str:
    ...
```

```python solution
def normalize_url(raw: str) -> str:
    url = raw.strip().lower()
    if " " in url:
        raise ValueError(f"invalid URL: {raw!r}")
    if not url.startswith(("http://", "https://")):
        url = f"https://{url}"
    return url.removesuffix("/")
```

```python tests
@test("adds https:// when there's no scheme")
def _():
    eq(normalize_url("example.com"), "https://example.com")

@test("keeps an existing http:// or https://")
def _():
    eq(normalize_url("http://localhost:8000"), "http://localhost:8000")
    eq(normalize_url("https://example.com"), "https://example.com")

@test("trims and lowercases first")
def _():
    eq(normalize_url("  HTTPS://Example.COM/Docs \n"), "https://example.com/docs")

@test("removes exactly one trailing slash")
def _():
    eq(normalize_url("example.com/docs/"), "https://example.com/docs")
    eq(normalize_url("https://example.com//"), "https://example.com/")

@test("a space inside the URL raises ValueError")
def _():
    raises(ValueError, normalize_url, "example.com/my docs")
```

```hint
`url.startswith(("http://", "https://"))` is true if either prefix matches.
```

```hint
`"a//".rstrip("/")` is `'a'`, while `"a//".removesuffix("/")` is `'a/'`.
```
:::

:::challenge id=drill-str-status-text title="switch → match" difficulty=medium
Write `status_text(code: int) -> str` with a `match` statement, mapping HTTP status codes the way the JavaScript version does.

```text
status_text(204)  ->  'OK'
status_text(403)  ->  'Denied'
status_text(418)  ->  'Client Error'
status_text(503)  ->  'Server Error'
```

Stacked `case` labels that fall through to shared code become a single `case` with `|`. `default` becomes `case _:`, and the range checks become guards (`case _ if ...:`), tried top to bottom. There's no `break`, because `match` never falls through.

Refresher: [`match`: a `switch` without fall-through](lesson:control-flow#match-a-switch-without-fall-through).

```js
function statusText(code) {
  switch (code) {
    case 200:
    case 204:
      return "OK";
    case 301:
    case 302:
      return "Redirect";
    case 401:
    case 403:
      return "Denied";
    case 404:
      return "Not Found";
    default:
      if (code >= 500 && code <= 599) return "Server Error";
      if (code >= 400 && code <= 499) return "Client Error";
      return "Unknown";
  }
}
```

```python starter
def status_text(code: int) -> str:
    ...
```

```python solution
def status_text(code: int) -> str:
    match code:
        case 200 | 204:
            return "OK"
        case 301 | 302:
            return "Redirect"
        case 401 | 403:
            return "Denied"
        case 404:
            return "Not Found"
        case _ if 500 <= code <= 599:
            return "Server Error"
        case _ if 400 <= code <= 499:
            return "Client Error"
        case _:
            return "Unknown"
```

```python tests
@test("grouped codes share a result")
def _():
    eq([status_text(code) for code in (200, 204)], ["OK", "OK"])
    eq([status_text(code) for code in (301, 302)], ["Redirect", "Redirect"])
    eq([status_text(code) for code in (401, 403)], ["Denied", "Denied"])

@test("404 has its own case")
def _():
    eq(status_text(404), "Not Found")

@test("other 4xx and 5xx codes fall back to their range")
def _():
    eq(status_text(400), "Client Error")
    eq(status_text(418), "Client Error")
    eq(status_text(500), "Server Error")
    eq(status_text(599), "Server Error")

@test("everything else is unknown")
def _():
    eq(status_text(201), "Unknown")
    eq(status_text(399), "Unknown")
    eq(status_text(600), "Unknown")

@test("uses match")
def _():
    requires_syntax(ast.Match, "translate the switch into a match statement")
```

```hint
`case 200 | 204:` matches either value.
```

```hint
A guard adds a condition to a pattern: `case _ if 500 <= code <= 599:`. The bare `case _:` must come last: anywhere else it's a `SyntaxError`, because it would make the cases after it unreachable.
```
:::

:::challenge id=drill-str-format-cell title="typeof → isinstance" difficulty=medium
Write `format_cell(value) -> str` that renders a value for a text report:

| Value | Shown as |
| --- | --- |
| `None` | `-` |
| a `bool` | `yes` or `no` |
| an `int` | with thousands separators: `1,234,567` |
| a `float` | two decimals, with separators: `1,234.50` |
| a `str` | trimmed, or `-` if it's blank |
| a `list` or `tuple` | each item formatted, joined with `", "` |
| anything else | `str(value)` |

Two differences from `typeof`. Python has separate `int` and `float` types where JavaScript has one `number`, so `3.0` is a float here and shows as `3.00`. And `bool` is a subclass of `int`, so `isinstance(True, int)` is `True`: check for `bool` first. For the blank string, `||` really does mean "any falsy string", so `or` is the right translation this time.

Refresher: [Built-in types, `type()` and `isinstance()`](lesson:variables-and-scope#built-in-types-type-and-isinstance).

```js
function formatCell(value) {
  if (value === null || value === undefined) return "-";
  if (typeof value === "boolean") return value ? "yes" : "no";
  if (typeof value === "number") {
    return Number.isInteger(value)
      ? value.toLocaleString("en-US")
      : value.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }
  if (typeof value === "string") return value.trim() || "-";
  if (Array.isArray(value)) return value.map(formatCell).join(", ");
  return String(value);
}
```

```python starter
def format_cell(value) -> str:
    ...
```

```python solution
def format_cell(value) -> str:
    if value is None:
        return "-"
    if isinstance(value, bool):
        return "yes" if value else "no"
    if isinstance(value, int):
        return f"{value:,}"
    if isinstance(value, float):
        return f"{value:,.2f}"
    if isinstance(value, str):
        return value.strip() or "-"
    if isinstance(value, (list, tuple)):
        return ", ".join(format_cell(item) for item in value)
    return str(value)
```

```python tests
@test("None is a dash")
def _():
    eq(format_cell(None), "-")

@test("booleans say yes or no")
def _():
    eq(format_cell(True), "yes")
    eq(format_cell(False), "no")

@test("ints get thousands separators, and 0 is a number")
def _():
    eq(format_cell(1234567), "1,234,567")
    eq(format_cell(0), "0")
    eq(format_cell(-42), "-42")

@test("floats always get two decimals")
def _():
    eq(format_cell(1234.5), "1,234.50")
    eq(format_cell(3.0), "3.00")
    eq(format_cell(2 / 3), "0.67")

@test("strings are trimmed, and blank ones become a dash")
def _():
    eq(format_cell("  Ada "), "Ada")
    eq(format_cell("   "), "-")
    eq(format_cell(""), "-")

@test("lists and tuples format each item")
def _():
    eq(format_cell([7, None, True, " x "]), "7, -, yes, x")
    eq(format_cell((2.5, "ok")), "2.50, ok")
    eq(format_cell([]), "")

@test("anything else uses str()")
def _():
    eq(format_cell({"id": 1}), "{'id': 1}")

@test("isinstance(), not type() comparisons")
def _():
    forbids_call("type", "isinstance() is the typeof/instanceof check, and it understands subclasses")
```

```hint
`isinstance(value, (list, tuple))` checks several types at once.
```

```hint
Order matters: test for `bool` before `int`. A `match` with class patterns (`case bool():`, `case int():`) works too, with the same ordering rule.
```
:::

:::challenge id=drill-str-parse-address title="parseInt → try/except" difficulty=medium
Write `parse_address(addr: str, default_port: int = 80) -> tuple[str, int] | None` that splits `"host:port"` into a `(host, port)` tuple. Surrounding whitespace is ignored, and with no colon you get `default_port`. Return `None` for anything invalid: an empty host, a port that isn't a whole number from 1 to 65535, or more than one colon.

```text
parse_address("example.com:8080")  ->  ('example.com', 8080)
parse_address(" localhost ")       ->  ('localhost', 80)
parse_address("db:5432x")          ->  None
parse_address("db:80:81")          ->  None
```

The JavaScript version has two bugs that the Python port fixes for free. `parseInt` reads digits until it meets something else, so it accepts `"5432x"` as `5432`, while Python's `int()` is strict and raises `ValueError` for anything that isn't a whole number. And array destructuring silently drops extra pieces, which `partition` (or strict tuple unpacking) won't. Let `int()` do the validating, inside a `try`.

Refresher: [Parsing: strict `int()` and `float()`](lesson:numbers-and-math#parsing-strict-int-and-float) and [EAFP](lesson:exceptions#eafp-ask-forgiveness-not-permission).

```js
function parseAddress(addr, defaultPort = 80) {
  const [host, rawPort] = addr.trim().split(":");
  if (!host) return null;
  if (rawPort === undefined) return [host, defaultPort];
  const port = Number.parseInt(rawPort, 10);
  if (Number.isNaN(port) || port < 1 || port > 65535) return null;
  return [host, port];
}
```

```python starter
def parse_address(addr: str, default_port: int = 80) -> tuple[str, int] | None:
    ...
```

```python solution
def parse_address(addr: str, default_port: int = 80) -> tuple[str, int] | None:
    host, colon, raw_port = addr.strip().partition(":")
    if not host:
        return None
    if not colon:
        return host, default_port
    try:
        port = int(raw_port)
    except ValueError:
        return None
    return (host, port) if 1 <= port <= 65535 else None
```

```python tests
@test("splits host and port")
def _():
    eq(parse_address("example.com:8080"), ("example.com", 8080))
    eq(parse_address("10.0.0.7:22"), ("10.0.0.7", 22))

@test("no colon means the default port")
def _():
    eq(parse_address("localhost"), ("localhost", 80))
    eq(parse_address("localhost", default_port=3000), ("localhost", 3000))

@test("surrounding whitespace is ignored")
def _():
    eq(parse_address("  db.internal:5432\n"), ("db.internal", 5432))

@test("the port must be a whole number, unlike with parseInt")
def _():
    eq(parse_address("db:5432x"), None)
    eq(parse_address("db:54.32"), None)
    eq(parse_address("db:"), None)

@test("the port must be between 1 and 65535")
def _():
    eq(parse_address("db:65535"), ("db", 65535))
    eq(parse_address("db:0"), None)
    eq(parse_address("db:65536"), None)
    eq(parse_address("db:-1"), None)

@test("an empty host or a second colon is invalid")
def _():
    eq(parse_address(":8080"), None)
    eq(parse_address("db:80:81"), None)

@test("lets int() do the validation")
def _():
    requires_syntax(ast.Try, "wrap int() in try/except ValueError instead of checking the digits yourself")
```

```hint
`"db:5432".partition(":")` is `('db', ':', '5432')`. Without a colon, the separator comes back empty: `('db', '', '')`.
```

```hint
`int("5432x")` raises `ValueError`: catch it and return `None`. A chained comparison checks the range: `1 <= port <= 65535`.
```
:::

:::challenge id=drill-str-caesar title="Caesar cipher" difficulty=hard
Write `caesar(text: str, shift: int) -> str` that moves each ASCII letter `shift` places along the alphabet, wrapping around and keeping its case. Everything else (digits, punctuation, spaces, accented and non-Latin letters) passes through unchanged. `shift` can be negative or bigger than 26.

```text
caesar("Hello, World!", 3)  ->  'Khoor, Zruog!'
caesar("abc", -1)           ->  'zab'
caesar("Café", 1)           ->  'Dbgé'
```

Three JavaScript habits to drop:

- The index loop over `text.charCodeAt(i)` becomes a loop over the characters themselves, with `ord()` and `chr()`.
- The `((x % 26) + 26) % 26` dance goes away. Python's `%` takes the sign of the divisor, so `-1 % 26` is already `25`.
- Don't swap the code-point range checks for `ch.islower()` or `ch.isupper()`. Those understand Unicode, so they're `True` for `"é"` and `"Ω"`. Compare the characters directly instead: `"a" <= ch <= "z"`.

Refresher: [Length, code points and Unicode](lesson:strings#length-code-points-and-unicode) and [Division: `/`, `//`, `%` and `divmod`](lesson:numbers-and-math#division-and-divmod).

```js
function caesar(text, shift) {
  let out = "";
  for (let i = 0; i < text.length; i++) {
    const code = text.charCodeAt(i);
    if (code >= 97 && code <= 122) {
      out += String.fromCharCode(((((code - 97 + shift) % 26) + 26) % 26) + 97);
    } else if (code >= 65 && code <= 90) {
      out += String.fromCharCode(((((code - 65 + shift) % 26) + 26) % 26) + 65);
    } else {
      out += text[i];
    }
  }
  return out;
}
```

```python starter
def caesar(text: str, shift: int) -> str:
    ...
```

```python solution
def caesar(text: str, shift: int) -> str:
    out = []
    for ch in text:
        if "a" <= ch <= "z":
            ch = chr((ord(ch) - ord("a") + shift) % 26 + ord("a"))
        elif "A" <= ch <= "Z":
            ch = chr((ord(ch) - ord("A") + shift) % 26 + ord("A"))
        out.append(ch)
    return "".join(out)
```

```python tests
@test("shifts letters and keeps their case")
def _():
    eq(caesar("Hello, World!", 3), "Khoor, Zruog!")

@test("wraps around the end of the alphabet")
def _():
    eq(caesar("xyz XYZ", 3), "abc ABC")

@test("negative shifts go backwards")
def _():
    eq(caesar("abc ABC", -1), "zab ZAB")
    eq(caesar(caesar("Round trip!", 11), -11), "Round trip!")

@test("shifts bigger than 26 wrap too")
def _():
    eq(caesar("abc", 27), "bcd")
    eq(caesar("abc", -53), "zab")

@test("accented and non-Latin letters pass through")
def _():
    eq(caesar("Café 2024", 1), "Dbgé 2024")
    eq(caesar("Ωmega", 1), "Ωnfhb")

@test("no index loop")
def _():
    forbids_call("range", "loop over the characters themselves (or use str.translate); you don't need indices")
```

```hint
`ord("a")` is `97` and `chr(97)` is `"a"`. `(ord(ch) - ord("a") + shift) % 26` is always in `0..25`, even when `shift` is negative.
```

```hint
Build the result in a list and `"".join()` it at the end, the idiomatic way to assemble a string piece by piece.
```

```hint
For a one-pass version, `str.maketrans(ascii_lowercase, ascii_lowercase[k:] + ascii_lowercase[:k])` (with `ascii_lowercase` from the `string` module) builds a translation table, and `text.translate(table)` applies it.
```
:::

:::challenge id=drill-str-render-table title="Render a text table" difficulty=hard
Write `render_table(headers: list[str], rows: list[list]) -> str` that lays the rows out in aligned columns, like the JavaScript version:

- each column is as wide as its widest cell, header included, and cells show as `str(cell)` (so `True`, where JavaScript prints `true`);
- numbers (`int` and `float`, but not `bool`) are right-aligned and everything else is left-aligned, headers included, keeping the padding even at the end of a line;
- cells are joined with `" | "`, and a rule of dashes joined with `"-+-"` goes under the headers.

```text
render_table(["item", "qty", "price"], [["apple", 3, 1.25], ["kiwi", 12, 0.5]])

item  | qty | price
------+-----+------
apple |   3 |  1.25
kiwi  |  12 |   0.5
```

The JavaScript reaches for indices everywhere: `row[i]`, `widths[i]`. In Python, `zip(headers, *rows)` hands you the columns, and `zip(cells, widths)` pairs each cell with its width. Format specs can take the width from a variable: `f"{text:<{width}}"`.

Refresher: [Transpose with `zip(*rows)`](lesson:tuples-and-unpacking#transpose-with-zip-rows) and [the format-spec mini-language](lesson:strings#the-format-spec-mini-language).

```js
function renderTable(headers, rows) {
  const widths = headers.map((header, i) =>
    Math.max(header.length, ...rows.map((row) => String(row[i]).length)),
  );
  const line = (cells) =>
    cells
      .map((cell, i) =>
        typeof cell === "number"
          ? String(cell).padStart(widths[i])
          : String(cell).padEnd(widths[i]),
      )
      .join(" | ");
  const rule = widths.map((width) => "-".repeat(width)).join("-+-");
  return [line(headers), rule, ...rows.map(line)].join("\n");
}
```

```python starter
def render_table(headers: list[str], rows: list[list]) -> str:
    ...
```

```python solution
def is_number(cell) -> bool:
    return isinstance(cell, (int, float)) and not isinstance(cell, bool)


def render_table(headers: list[str], rows: list[list]) -> str:
    widths = [max(len(str(cell)) for cell in column) for column in zip(headers, *rows)]

    def line(cells) -> str:
        return " | ".join(
            f"{str(cell):>{width}}" if is_number(cell) else f"{str(cell):<{width}}"
            for cell, width in zip(cells, widths)
        )

    rule = "-+-".join("-" * width for width in widths)
    return "\n".join([line(headers), rule, *map(line, rows)])
```

```python tests
@test("header, rule, then one line per row")
def _():
    eq(render_table(["item", "qty", "price"], [["apple", 3, 1.25], ["kiwi", 12, 0.5]]).split("\n"), [
        "item  | qty | price",
        "------+-----+------",
        "apple |   3 |  1.25",
        "kiwi  |  12 |   0.5",
    ])

@test("text stays left-aligned and padded, even in the last column")
def _():
    eq(render_table(["qty", "item"], [[3, "apple"], [12, "kiwi"]]).split("\n"), [
        "qty | item ",
        "----+------",
        "  3 | apple",
        " 12 | kiwi ",
    ])

@test("a header can be the widest cell")
def _():
    eq(render_table(["description", "n"], [["tea", 1]]).split("\n"), [
        "description | n",
        "------------+--",
        "tea         | 1",
    ])

@test("booleans are text, not numbers")
def _():
    eq(render_table(["user", "active"], [["ada", True], ["bob", False]]).split("\n"), [
        "user | active",
        "-----+-------",
        "ada  | True  ",
        "bob  | False ",
    ])

@test("no rows: just the header and the rule")
def _():
    eq(render_table(["a", "bb"], []).split("\n"), ["a | bb", "--+---"])

@test("columns come from zip, not indices")
def _():
    forbids_call("range", "zip(headers, *rows) gives you the columns, and zip(cells, widths) pairs them up")
```

```hint
`zip(headers, *rows)` yields one tuple per column: the header, then that column's cells. `max(len(str(cell)) for cell in column)` is the column's width.
```

```hint
Convert to `str` before padding: `f"{str(cell):<{width}}"`. A format spec applied to a `bool` formats it as an int, so `f"{True:<5}"` is `'1    '`.
```
:::
