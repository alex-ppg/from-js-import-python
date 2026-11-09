---
title: CSV, JSON & Config Files
part: Files & Data
summary: csv dialects and DictWriter, json hooks and number precision, TOML, INI and env config, base64 and struct.
minutes: 40
---

Node gets JSON for free and reaches for npm for everything else: csv-parse, smol-toml, ini, dotenv. Python ships nearly all of it in the standard library. `json` and `tomllib` read with `load(file)` and `loads(text)` (the `s` is for "string"), `json` writes with `dump` and `dumps`, and `csv` wraps any file in a `reader` or a `writer`.

What changes from format to format is the typing, and that's where JavaScript habits mislead. CSV hands you strings and nothing else. JSON maps onto Python types, with integers that never lose precision. TOML gives you real `datetime` objects, and INI gives you strings again, plus typed getters. The basics are in the core course, in [Dicts](lesson:dicts#json) and [Batteries Included](lesson:standard-library#data-formats-json-csv-and-sqlite3). This lesson is about the options and the edge cases.

## CSV: readers, writers and `newline=""`

:::compare
```js
import { parse } from "csv-parse/sync";
import { stringify } from "csv-stringify/sync";

const rows = parse(text);                         // arrays of strings
const out = stringify([["id", "name"], [1, "Smith, Jane"]]);
```
```python
import csv
import io

rows = list(csv.reader(io.StringIO(text)))        # lists of strings
out = io.StringIO()
csv.writer(out).writerows([["id", "name"], [1, "Smith, Jane"]])
```
:::

`csv.reader` wraps anything that yields lines: an open file, an `io.StringIO`, even a plain list of strings. It yields one list of strings per row, lazily, so it streams files of any size. `csv.writer` takes a file-like object and quotes only the fields that need it (those containing the delimiter, a quote or a line break). It accepts numbers and writes `None` as an empty field. Two defaults to know: rows end with `\r\n`, the RFC 4180 and Excel convention, and every value you read back is a `str`.

```python run
import csv
import io

out = io.StringIO()
writer = csv.writer(out)
writer.writerow(["id", "name", "note"])
writer.writerow([1, "Smith, Jane", 'said "hi"'])
writer.writerow([2, "Li Wei", "line one\nline two"])
writer.writerow([3, None, 4.5])
print(repr(out.getvalue()))

for row in csv.reader(io.StringIO(out.getvalue())):
    print(row)
```

### Open CSV files with `newline=""`

When you open a CSV **file**, pass `newline=""`. The csv module handles line endings itself, and text mode's newline translation ([Files & Paths](lesson:files-and-paths)) gets in its way in both directions. Reading, a quoted field can contain a line break that must arrive untouched. Writing on Windows, text mode turns every `\n` into `\r\n`, so the writer's `\r\n` comes out as `\r\r\n`, which Excel shows as a blank line between rows. The sandbox isn't Windows, but `newline="\r\n"` simulates it:

```python run
import csv
from pathlib import Path

rows = [["sku", "qty"], ["A1", 3], ["B2", 5]]

with open("export.csv", "w", encoding="utf-8", newline="") as f:       # correct
    csv.writer(f).writerows(rows)
print(Path("export.csv").read_bytes())

with open("export.csv", "w", encoding="utf-8", newline="\r\n") as f:   # Windows, without newline=""
    csv.writer(f).writerows(rows)
print(Path("export.csv").read_bytes())
```

:::gotcha Every field is a string
`int(row[1])`, `Decimal(row["price"])` and `date.fromisoformat(row["day"])` are your job, and csv has no `cast: true`. Forget one and nothing crashes: `max()` and `sorted()` happily compare strings, so `"9"` beats `"10"`. Convert at the boundary, as soon as a row is read.
:::

:::quiz output
What does this print?

```python
import csv
rows = list(csv.reader(["qty", "10", "9", "100"]))
print(max(row[0] for row in rows[1:]))
```

- [ ] `100`
- [x] `9`
- [ ] `10`

The values are the strings `"10"`, `"9"` and `"100"`, and strings compare character by character, so `"9"` is the largest. `max(int(row[0]) for row in rows[1:])` gives `100`.
:::

## `DictReader` and `DictWriter`

:::compare
```js
const records = parse(text, { columns: true, cast: true });   // objects keyed by header
const csv = stringify(records, { header: true, columns: ["sku", "total"] });
```
```python
records = list(csv.DictReader(f))                 # dicts keyed by the header row
writer = csv.DictWriter(out, fieldnames=["sku", "total"])
writer.writeheader()
writer.writerows(records)
```
:::

`DictReader` treats the first row as field names (pass `fieldnames=` for a file without a header) and yields one dict per row. Rows that don't fit the header don't raise. A short row fills its missing keys with `restval`, which defaults to `None`, and the surplus of a long row goes into a list under the key `restkey`, which also defaults to `None`, so you get the odd key `None`. `DictWriter` needs `fieldnames` up front, writes `restval` (default `""`) for missing keys, and raises `ValueError` for a key it doesn't know unless you pass `extrasaction="ignore"`.

Typing the rows as you read them, into a dataclass, keeps the strings at the edge of the program:

```python run
import csv
import io
from dataclasses import dataclass
from decimal import Decimal

@dataclass
class Order:
    sku: str
    qty: int
    price: Decimal

text = "sku,qty,price\nA1,3,9.99\nB2,1,24.50\nC3,2\n"
rows = list(csv.DictReader(io.StringIO(text)))
print(rows[-1])                                    # a short row: price is None

orders = [Order(r["sku"], int(r["qty"]), Decimal(r["price"])) for r in rows if r["price"]]
print(orders)

out = io.StringIO()
writer = csv.DictWriter(out, fieldnames=["sku", "total"], extrasaction="ignore", lineterminator="\n")
writer.writeheader()
writer.writerows({"sku": o.sku, "total": o.qty * o.price, "note": "dropped"} for o in orders)
print(out.getvalue())
```

:::gotcha Excel's byte-order mark
Excel's "CSV UTF-8" export starts with a byte-order mark, U+FEFF. Read as plain UTF-8, it sticks to the first header, so `row["name"]` raises `KeyError` because the key is really `"\ufeffname"`. Open the file with `encoding="utf-8-sig"`, which drops the mark if there is one and reads ordinary UTF-8 otherwise. (csv-parse has `bom: true` for the same job.)
:::

```python run
import csv
from pathlib import Path

Path("contacts.csv").write_bytes("\ufeffname,email\nAda,ada@example.com\n".encode("utf-8"))

with open("contacts.csv", encoding="utf-8", newline="") as f:
    print(next(csv.DictReader(f)))
with open("contacts.csv", encoding="utf-8-sig", newline="") as f:
    print(next(csv.DictReader(f)))
```

:::quiz output
What does this print?

```python
import csv
import io

rows = list(csv.DictReader(io.StringIO("sku,qty\nA1,3\nB2\n")))
print(rows[1])
```

- [ ] `{'sku': 'B2'}`
- [ ] `{'sku': 'B2', 'qty': ''}`
- [x] `{'sku': 'B2', 'qty': None}`
- [ ] `ValueError`

A short row isn't an error. Every missing field gets `restval`, which defaults to `None`, so check for it before converting: `int(None)` raises `TypeError`.
:::

## Dialects, delimiters and quoting

:::compare
```js
parse(tsv, { delimiter: "\t" });
parse(text, { delimiter: ";", quote: "'" });
stringify(rows, { quoted: true });
```
```python
csv.reader(f, delimiter="\t")                # or dialect="excel-tab"
csv.reader(f, delimiter=";", quotechar="'")
csv.writer(f, quoting=csv.QUOTE_ALL)
```
:::

Every format option is a keyword argument: `delimiter`, `quotechar`, `escapechar`, `doublequote`, `skipinitialspace`, `lineterminator` and `quoting`. A **dialect** bundles them under a name. `"excel"` (the default), `"excel-tab"` and `"unix"` (which ends rows with `\n` and quotes every field) are built in, `csv.register_dialect()` adds your own, and `csv.Sniffer().sniff(sample)` guesses one from a sample of the data.

`quoting` decides which fields the writer quotes, and for some settings it also makes the reader convert values:

| Constant | The writer quotes | The reader returns |
| --- | --- | --- |
| `QUOTE_MINIMAL` (default) | only fields that need it | strings |
| `QUOTE_ALL` | every field | strings |
| `QUOTE_NONNUMERIC` | every non-number | `float` for every unquoted field |
| `QUOTE_STRINGS` (3.12+) | every `str` | like `QUOTE_NONNUMERIC`, but `None` for an unquoted empty field |
| `QUOTE_NOTNULL` (3.12+) | everything but `None` | strings, but `None` for an unquoted empty field |
| `QUOTE_NONE` | nothing (special characters need an `escapechar`) | quotes get no special treatment |

The two 3.12 additions finally let the csv module round-trip the difference between `None` and `""`. The playground reads a typical export from a German Excel, which uses `;` because the comma is the decimal separator, then round-trips a `None` with `QUOTE_NOTNULL`:

```python run
import csv
import io
from decimal import Decimal

export = 'Kunde;Betrag\n"Müller; Söhne";1.234,50\nSchmidt;99,90\n'
dialect = csv.Sniffer().sniff(export)
print(repr(dialect.delimiter))
for row in csv.DictReader(io.StringIO(export), dialect=dialect):
    amount = Decimal(row["Betrag"].replace(".", "").replace(",", "."))
    print(row["Kunde"], amount)

out = io.StringIO()
csv.writer(out, quoting=csv.QUOTE_NOTNULL, lineterminator="\n").writerows([["Ada", None, ""]])
print(out.getvalue().strip(), list(csv.reader(io.StringIO(out.getvalue()), quoting=csv.QUOTE_NOTNULL)))
```

## JSON: the options that matter

:::compare
```js
JSON.stringify(order);                       // '{"id":7,"tags":["gift"]}'
JSON.stringify(order, null, 2);
stringify(order);                            // npm json-stable-stringify: sorted keys
JSON.stringify({ city: "Zürich" });          // '{"city":"Zürich"}'
JSON.stringify({ score: NaN });              // '{"score":null}'
```
```python
json.dumps(order)                            # '{"id": 7, "tags": ["gift"]}'
json.dumps(order, indent=2)
json.dumps(order, sort_keys=True)            # sorted at every level
json.dumps({"city": "Zürich"})               # '{"city": "Z\u00fcrich"}'
json.dumps({"score": float("nan")})          # '{"score": NaN}', which isn't JSON
```
:::

Python's defaults differ from `JSON.stringify` in three ways that show up in diffs, signatures and cache keys:

1. **Spacing.** `dumps` puts a space after every `,` and `:`. `separators=(",", ":")` gives you JavaScript's compact form.
2. **Escaping.** `ensure_ascii=True`, the default, escapes every non-ASCII character as `\uXXXX`. That's valid JSON, but bigger and unreadable. Pass `ensure_ascii=False` and write the result as UTF-8.
3. **NaN and infinity** come out as `NaN` and `Infinity`. Neither is valid JSON, `JSON.parse` rejects both, and `JSON.stringify` writes `null` instead. `allow_nan=False` makes `dumps` raise `ValueError` rather than produce them.

`sort_keys=True` sorts the keys of every nested object, which takes a package or a hand-written replacer in JavaScript, and gives stable output for diffs and hashing. `indent` takes a number or a string such as `"\t"`. And `dump(obj, f)` and `load(f)` work directly on open files.

```python run
import hashlib
import json

order = {"id": 7, "customer": {"name": "Zoë", "city": "Zürich"}, "tags": ["gift"]}

print(json.dumps(order))
print(json.dumps(order, separators=(",", ":"), ensure_ascii=False))   # what JSON.stringify gives
canonical = json.dumps(order, sort_keys=True, separators=(",", ":"), ensure_ascii=False)
print(hashlib.sha256(canonical.encode()).hexdigest()[:12])            # a stable cache key

print(json.dumps({"score": float("nan")}))
try:
    json.dumps({"score": float("nan")}, allow_nan=False)
except ValueError as err:
    print(err)
```

:::quiz output
What does this print?

```python
import json
print(json.dumps({"a": [1, 2]}))
```

- [ ] `{"a":[1,2]}`
- [x] `{"a": [1, 2]}`
- [ ] `{'a': [1, 2]}`

`json.dumps` separates items with `", "` and keys from values with `": "`. Code that compares or hashes JSON produced by both languages needs `separators=(",", ":")` on the Python side. (`{'a': [1, 2]}` is the dict's `repr`, not JSON.)
:::

### JSON Lines

A `.jsonl` file holds one JSON document per line, which makes it appendable and streamable: logs, exports, and datasets too big to load at once. Write each record with `json.dumps(record) + "\n"`, never with `indent`, and read it back line by line:

```python run
import json

events = [{"type": "signup", "user": "ada"}, {"type": "purchase", "user": "ada", "total": 42.5}]
with open("events.jsonl", "w", encoding="utf-8") as f:
    for event in events:
        f.write(json.dumps(event) + "\n")

with open("events.jsonl", encoding="utf-8") as f:
    records = [json.loads(line) for line in f if line.strip()]
print([r for r in records if r["type"] == "purchase"])
```

## Custom types: `default=` and `object_hook`

:::compare
```js
JSON.stringify(order, (key, value) => (value instanceof Set ? [...value] : value));
// Dates serialise themselves, through Date.prototype.toJSON()
JSON.parse(text, (key, value) => (key.endsWith("At") ? new Date(value) : value));
```
```python
json.dumps(order, default=encode)            # called only for types json can't handle
# no toJSON(): dates, sets, Decimals and dataclasses all go through default
json.loads(text, object_hook=decode)         # called with every decoded object, as a dict
```
:::

`json.dumps` calls `default` for each object it doesn't know how to serialize. The function returns something it *does* know, which is encoded in the object's place, or raises `TypeError`. What it returns can contain further unknown objects, and those come back to `default` in turn. There's no `toJSON()` protocol, so `datetime`, `date`, `Decimal`, `set`, dataclasses and plain `Enum` members all go through `default` (a `StrEnum` or `IntEnum` already encodes as its value). Subclassing `json.JSONEncoder` and passing `cls=` is an older spelling of the same thing.

```python run
import json
from dataclasses import asdict, dataclass, field, is_dataclass
from datetime import date, datetime, timezone
from decimal import Decimal

@dataclass
class Order:
    id: int
    placed_at: datetime
    total: Decimal
    tags: set[str] = field(default_factory=set)

def to_json(obj):
    match obj:
        case date():                       # datetime is a subclass of date
            return obj.isoformat()
        case Decimal():
            return str(obj)                # a string keeps every digit
        case set() | frozenset():
            return sorted(obj)             # sorted, so the output is stable
        case _ if is_dataclass(obj):
            return asdict(obj)             # nested dates and Decimals come back here
    raise TypeError(f"Object of type {type(obj).__name__} is not JSON serializable")

placed = datetime(2026, 11, 10, 9, 30, tzinfo=timezone.utc)
print(json.dumps(Order(7, placed, Decimal("19.99"), {"rush", "gift"}), default=to_json))
try:
    json.dumps({"callback": print}, default=to_json)
except TypeError as err:
    print(err)
```

:::gotcha `default=str` hides bugs
`default=str` makes *everything* serializable, including things you never meant to send. A set becomes the string `"{'a', 'b'}"` instead of an array, `bytes` become `"b'...'"`, and a mock or a database connection becomes its `repr`. Handle the types you expect, and raise `TypeError` for the rest, so the surprise shows up in your tests rather than in a client.
:::

On the way in, `object_hook` receives every decoded JSON object as a dict, innermost first, and whatever it returns replaces that dict. It's coarser than JavaScript's reviver, which sees every key and value separately: you decide what to do from the dict's contents. `object_pairs_hook` receives the raw list of `(key, value)` pairs instead, which is how you catch duplicate keys. Both languages otherwise keep the last duplicate without a word.

```python run
import json
from datetime import datetime

def decode(obj):
    for key, value in obj.items():
        if key.endswith("_at") and isinstance(value, str):
            obj[key] = datetime.fromisoformat(value)     # accepts "Z" since 3.11
    return obj

text = '{"id": 7, "placed_at": "2026-11-10T09:30:00Z", "items": [{"sku": "A1", "shipped_at": null}]}'
order = json.loads(text, object_hook=decode)
print(repr(order["placed_at"]), order["items"])

def no_duplicates(pairs):
    keys = [key for key, _ in pairs]
    if len(keys) != len(set(keys)):
        raise ValueError(f"duplicate keys: {keys}")
    return dict(pairs)

print(json.loads('{"role": "user", "role": "admin"}'))      # the last one wins, silently
try:
    json.loads('{"role": "user", "role": "admin"}', object_pairs_hook=no_duplicates)
except ValueError as err:
    print(err)
```

## Parse errors and number precision

:::compare
```js
try {
  JSON.parse('{"sku": "A1", "qty": 3,}');
} catch (err) {
  err.message;                          // wording and position vary by engine
}
JSON.parse("[12345678901234567890]");   // [12345678901234567000]: rounded
JSON.stringify(1.0);                    // "1"
```
```python
try:
    json.loads('{"sku": "A1", "qty": 3,}')
except json.JSONDecodeError as err:
    err.msg, err.lineno, err.colno      # structured, and it's a ValueError

json.loads("[12345678901234567890]")    # [12345678901234567890]: exact
json.dumps(1.0)                         # "1.0"
```
:::

`JSONDecodeError` is a subclass of `ValueError` that carries `msg`, `pos` (an index into the document), `lineno` and `colno`, so a tool can point at the exact line of a broken config file.

Numbers differ from JavaScript in both directions:

- JSON integers become Python `int`s, which are arbitrary-precision, so 64-bit IDs and big counters arrive exactly. Send the same numbers to a browser, though, and `JSON.parse` rounds anything beyond `Number.MAX_SAFE_INTEGER` (2^53 - 1). APIs that serve JavaScript clients send big IDs as strings for that reason.
- Floats are IEEE doubles in both languages, but Python keeps `1` and `1.0` apart, so `json.dumps(1.0)` is `"1.0"`, and large floats come out as `1e+16` where JavaScript writes `10000000000000000`.
- For money, `parse_float=Decimal` reads every decimal exactly. `Decimal` doesn't serialize on the way out, and converting it to `float` throws away the precision you wanted, so encode it as a string with `default`.

```python run
import json
from decimal import Decimal

config = """{
  "name": "shop-api",
  "port": 8080,
  "debug": true,
}"""
try:
    json.loads(config)
except json.JSONDecodeError as err:
    print(f"config.json:{err.lineno}:{err.colno}: {err.msg}")
    print(config.splitlines()[err.lineno - 1])

big_id = json.loads('{"id": 1234567890123456789}')["id"]
print(big_id, big_id + 1)                         # exact: no MAX_SAFE_INTEGER
print(json.dumps([1, 1.0, 1e16, 0.1 + 0.2]))
price = json.loads('{"price": 19.99}', parse_float=Decimal)["price"]
print(repr(price), price * 3)
```

:::quiz output
What does this print?

```python
import json
print(json.loads("[9007199254740993]")[0] + 1)
```

- [x] `9007199254740994`
- [ ] `9007199254740992`
- [ ] `9007199254740993`
- [ ] `9.007199254740994e+15`

The JSON integer becomes an exact Python `int`. In JavaScript, `9007199254740993` isn't representable as a double, so `JSON.parse` rounds it to `9007199254740992`, and adding `1` rounds straight back to `9007199254740992`.
:::

## Config files: TOML and INI

### TOML with `tomllib`

:::compare
```js
import { parse } from "smol-toml";        // npm

const config = parse(fs.readFileSync("config.toml", "utf8"));
config.server.port;                       // 8080
```
```python
import tomllib                            # 3.11+, in the stdlib

with open("config.toml", "rb") as f:      # binary mode
    config = tomllib.load(f)
config["server"]["port"]                  # 8080
```
:::

TOML is the format of `pyproject.toml`, Python's `package.json` ([Modules & Tooling](lesson:modules-and-tooling#pyproject-toml)), and of most new Python tools' configuration. Unlike JSON it allows comments, and unlike INI it has types: strings, integers, floats, booleans, arrays, tables (nested dicts), arrays of tables (`[[jobs]]`), and real **dates and datetimes**, which `tomllib` returns as `date` and `datetime` objects. `tomllib.loads(text)` parses a string. The module is read-only. To write TOML you need a package such as `tomli-w`, or `tomlkit`, which also preserves comments and formatting.

:::gotcha `tomllib.load` wants a binary file
TOML is always UTF-8, so `tomllib` decodes the bytes itself, and a file opened in text mode raises `TypeError: File must be opened in binary mode`. Open with `"rb"`, or read the text yourself and call `tomllib.loads()`.
:::

```python run
import tomllib

DOC = """
[server]
host = "0.0.0.0"
port = 8080
debug = false                  # comments are allowed

[database]
url = "postgres://localhost/shop"
pool = { min = 1, max = 10 }

[[jobs]]
name = "nightly-report"
next_run = 2026-11-11T03:00:00Z

[[jobs]]
name = "cleanup"
next_run = 2026-11-12T04:30:00Z
"""
config = tomllib.loads(DOC)
print(config["server"], config["database"]["pool"]["max"])
for job in config["jobs"]:
    print(job["name"], repr(job["next_run"]))
try:
    tomllib.loads("port = 8080\nport = 9090")
except tomllib.TOMLDecodeError as err:     # 3.14 adds err.lineno and err.colno
    print(err)
```

### INI with `configparser`

:::compare
```js
import ini from "ini";                     // npm

const cfg = ini.parse(fs.readFileSync("app.ini", "utf8"));
Number(cfg.database.port);                 // values are strings
```
```python
import configparser

cfg = configparser.ConfigParser()
cfg.read("app.ini", encoding="utf-8")
cfg.getint("database", "port")             # strings, with typed getters
```
:::

INI files live on in `setup.cfg`, `tox.ini`, `.flake8`, `mypy.ini` and plenty of older applications. `configparser` reads them into sections of **string** values. The typed getters `getint`, `getfloat` and `getboolean` convert for you (`getboolean` accepts `yes`/`no`, `on`/`off`, `true`/`false` and `1`/`0`, in any case), and all of them take `fallback=` for a default. Keys in the `[DEFAULT]` section show up in every other section. Keys are case-insensitive, because they're lowercased as they're read. `read()` silently skips files that don't exist and returns the list of files it did read, which suits a chain of optional config locations and also hides typos in file names.

:::gotcha `%` in a value
`ConfigParser` interpolates `%(name)s` references by default, so reading a password like `50%off` raises `InterpolationSyntaxError`. Use `ConfigParser(interpolation=None)` unless you want the feature, or write `%%` for a literal percent sign.
:::

```python run
import configparser

INI = """
[DEFAULT]
base_dir = /srv/shop
log_level = info

[database]
Host = db.internal
port = 5432
ssl = yes
dump_dir = %(base_dir)s/dumps

[smtp]
password = 50%off
"""
cfg = configparser.ConfigParser()
cfg.read_string(INI)
db = cfg["database"]
print(cfg.sections(), db["host"], db["dump_dir"], db["log_level"])
print(db.getint("port"), db.getboolean("ssl"), db.getint("timeout", fallback=30))
try:
    cfg["smtp"]["password"]
except configparser.InterpolationSyntaxError as err:
    print(type(err).__name__)

raw = configparser.ConfigParser(interpolation=None)
raw.read_string(INI)
print(raw["smtp"]["password"])
```

## Configuration from the environment

:::compare
```js
import "dotenv/config";                          // or node --env-file=.env (20.6+)

const port = Number(process.env.PORT ?? "8080");
const debug = process.env.DEBUG === "true";
const dbUrl = process.env.DATABASE_URL;          // undefined if missing
```
```python
# No .env loading in the stdlib: python-dotenv, or let the platform set the variables

port = int(os.environ.get("PORT", "8080"))
debug = os.environ.get("DEBUG", "").lower() in {"1", "true", "yes", "on"}
db_url = os.environ["DATABASE_URL"]              # KeyError if missing: fail fast
```
:::

`os.environ` is a mapping of strings to strings. `os.environ["X"]` raises `KeyError` for a missing variable, `.get()` takes a default, and assigning to it changes the environment that child processes inherit. Everything arrives as a string, so parse it once at startup into a typed, frozen object, and fail with a message that lists *every* problem rather than only the first.

Make the loader take the mapping as a parameter, `environ=os.environ`, and tests can pass a plain dict instead of patching the real environment. The usual precedence (defaults, then a config file, then the environment) is exactly what `collections.ChainMap` expresses ([Dicts](lesson:dicts#chainmap-layered-lookups)). The pydantic-settings package wraps the whole pattern in a class, much like envalid or a zod schema over `process.env`.

```python run
import os
from collections import ChainMap
from dataclasses import dataclass

DEFAULTS = {"PORT": "8080", "DEBUG": "false"}
BOOLEANS = {"1": True, "true": True, "yes": True, "on": True,
            "0": False, "false": False, "no": False, "off": False}

@dataclass(frozen=True)
class Settings:
    port: int
    debug: bool
    database_url: str

def load_settings(environ=os.environ):
    env = ChainMap(environ, DEFAULTS)              # the environment wins over the defaults
    errors = []
    if "DATABASE_URL" not in env:
        errors.append("DATABASE_URL is required")
    if not env["PORT"].isdecimal():
        errors.append(f"PORT must be a number, got {env['PORT']!r}")
    if env["DEBUG"].lower() not in BOOLEANS:
        errors.append(f"DEBUG must be true or false, got {env['DEBUG']!r}")
    if errors:
        raise ValueError("; ".join(errors))
    return Settings(int(env["PORT"]), BOOLEANS[env["DEBUG"].lower()], env["DATABASE_URL"])

print(load_settings({"DATABASE_URL": "postgres://localhost/shop", "DEBUG": "False"}))
try:
    load_settings({"PORT": "80a", "DEBUG": "maybe"})
except ValueError as err:
    print(err)
```

:::gotcha `bool("false")` is `True`
`bool(os.environ.get("DEBUG"))` is `True` for `DEBUG=false` and `DEBUG=0`, because every non-empty string is truthy. It's the same trap as `Boolean("false")` in JavaScript. Compare against explicit spellings, as `BOOLEANS` does above, and reject anything else.
:::

## Binary data: `base64`, `binascii` and `struct`

:::compare
```js
Buffer.from("héllo").toString("base64");         // "aMOpbGxv"
Buffer.from("aMOpbGxv", "base64").toString();    // "héllo"
Buffer.from(payload).toString("base64url");      // URL-safe, no padding
Buffer.from([0, 255]).toString("hex");           // "00ff"
const view = new DataView(buf.buffer);
const count = view.getUint16(0, true);           // little-endian uint16 at offset 0
const temperature = view.getFloat32(2, true);
```
```python
base64.b64encode("héllo".encode()).decode()      # "aMOpbGxv"
base64.b64decode("aMOpbGxv").decode()            # "héllo"
base64.urlsafe_b64encode(payload).rstrip(b"=")    # URL-safe; drop the padding yourself
bytes([0, 255]).hex()                             # "00ff"

count, temperature = struct.unpack_from("<Hf", buf, 0)
# "<" little-endian, H uint16, f float32: the whole layout in one string
```
:::

### base64 and hex

`base64` works on bytes in both directions: turn text into bytes with `.encode()` first, and `.decode("ascii")` the result when you need a `str`. `urlsafe_b64encode` uses `-` and `_` instead of `+` and `/`, but unlike Node's `"base64url"` it keeps the `=` padding. Strip it for JWTs and URLs, and put it back before decoding with `"=" * (-len(s) % 4)`: Python's `%` never returns a negative number, so that's always 0 to 3 characters. `bytes.hex()` and `bytes.fromhex()` cover hex, both with an optional separator, and `binascii.crc32()` computes checksums.

:::gotcha `b64decode` skips junk by default
Characters outside the base64 alphabet are silently discarded, so `base64.b64decode("aGk=!!")` happily returns `b'hi'`. Pass `validate=True` for input you don't trust, and it raises `binascii.Error`, a subclass of `ValueError`, as it also does for bad padding.
:::

```python run
import base64
import binascii
import json

payload = json.dumps({"sub": "42", "name": "Zoë"}, ensure_ascii=False).encode()
segment = base64.urlsafe_b64encode(payload).rstrip(b"=").decode("ascii")
print(segment)                                     # what a JWT segment looks like

print(base64.b64decode("aGk=!!"))                  # the junk is dropped
try:
    base64.b64decode("aGk=!!", validate=True)
except binascii.Error as err:
    print("validate=True:", err)
print(b"\x00\xffhi".hex(" "), bytes.fromhex("00 ff 68 69"), hex(binascii.crc32(b"hello")))
```

### Binary records with `struct`

`struct` converts between Python values and packed binary records, which is `DataView`'s job, except that you describe the whole layout once in a format string instead of making one call per field. The first character sets the byte order: `<` little-endian, `>` or `!` big-endian (network order), `=` the machine's own order without padding. Then comes one code per field:

| Code | C type | Size | `DataView` method |
| --- | --- | --- | --- |
| `b`, `B` | int8, uint8 | 1 | `getInt8`, `getUint8` |
| `h`, `H` | int16, uint16 | 2 | `getInt16`, `getUint16` |
| `i`, `I` | int32, uint32 | 4 | `getInt32`, `getUint32` |
| `q`, `Q` | int64, uint64 | 8 | `getBigInt64`, `getBigUint64` |
| `e`, `f`, `d` | float16, float32, float64 | 2, 4, 8 | `getFloat16` (ES2025), `getFloat32`, `getFloat64` |
| `?` | bool | 1 | |
| `4s` | 4 raw bytes | 4 | `new Uint8Array(buffer, offset, 4)` |

`pack()` returns bytes and `unpack()` returns a tuple. `unpack_from(buf, offset)` reads at an offset without slicing, `iter_unpack()` walks a run of equal-sized records, and `struct.Struct(fmt)` compiles a format once and tells you its `.size`. For a single integer of any size, `int.from_bytes(b, "little")` and `n.to_bytes(4, "big")` are simpler.

:::gotcha Always state the byte order
Without a byte-order character, `struct` uses the machine's byte order **and its alignment rules**, inserting padding the way a C compiler would, so `"HI"` is 8 bytes, not 6. File formats and network protocols have no hidden padding, so start every format with `<`, `>` or `!`. (`DataView` defaults to big-endian; `struct` defaults to whatever the machine does.)
:::

```python run
import struct

# Every PNG starts with an 8-byte signature, then its IHDR chunk: big-endian
png = b"\x89PNG\r\n\x1a\n" + struct.pack(">I4sII", 13, b"IHDR", 640, 480)
length, chunk_type, width, height = struct.unpack_from(">I4sII", png, 8)
print(png[:8] == b"\x89PNG\r\n\x1a\n", length, chunk_type, width, height)

PIXEL = struct.Struct("<BBB")              # one RGB pixel: three unsigned bytes
image = bytes.fromhex("ff8800 0088ff 222222")
print(PIXEL.size, [f"#{r:02x}{g:02x}{b:02x}" for r, g, b in PIXEL.iter_unpack(image)])

print(int.from_bytes(b"\x01\x00", "little"), (513).to_bytes(2, "big"))
```

:::quiz output
What does this print?

```python
import struct
print(struct.calcsize("HI"), struct.calcsize("<HI"))
```

- [ ] `6 6`
- [x] `8 6`
- [ ] `6 8`
- [ ] `8 8`

Without a prefix, `struct` aligns the 4-byte `I` to a 4-byte boundary, which inserts two bytes of padding after the 2-byte `H`. With `<` there's no alignment, so the record is exactly 2 + 4 bytes.
:::

## Cheat sheet

| JavaScript | Python | Notes |
| --- | --- | --- |
| csv-parse `parse(text)` | `csv.reader(io.StringIO(text))` | rows of strings |
| `parse(text, { columns: true })` | `csv.DictReader(f)` | no `cast`: convert yourself |
| csv-stringify `stringify(rows)` | `csv.writer(f).writerows(rows)` | rows end with `\r\n` |
| `{ delimiter: ";" }` | `delimiter=";"` | or a dialect, or `csv.Sniffer` |
| `{ bom: true }` | `encoding="utf-8-sig"` | Excel's UTF-8 exports |
| opening a CSV file | `open(path, newline="")` | always, for reading and writing |
| `JSON.stringify(x)` | `json.dumps(x, separators=(",", ":"))` | Python adds spaces by default |
| `JSON.stringify(x, null, 2)` | `json.dumps(x, indent=2)` | |
| json-stable-stringify | `json.dumps(x, sort_keys=True)` | sorts every level |
| non-ASCII as-is | `json.dumps(x, ensure_ascii=False)` | the default writes `\uXXXX` |
| `NaN` becomes `null` | `allow_nan=False` raises | the default writes invalid `NaN` |
| `toJSON()`, a replacer | `default=fn` | called only for unknown types |
| a reviver | `object_hook=fn` | called with each decoded dict |
| `err.message` | `err.lineno`, `err.colno`, `err.msg` | `JSONDecodeError` is a `ValueError` |
| big ints lose precision | exact `int` | send big IDs to JS as strings |
| one JSON document per line | `json.loads(line)` per line | JSON Lines |
| smol-toml `parse` | `tomllib.load(f)` | binary mode, read-only, 3.11+ |
| ini `parse` | `configparser.ConfigParser()` | strings, plus `getint`/`getboolean` |
| `process.env.X` | `os.environ.get("X")` | `os.environ["X"]` raises `KeyError` |
| dotenv | `python-dotenv` | not in the stdlib |
| `Buffer.from(s).toString("base64")` | `base64.b64encode(s.encode())` | bytes in, bytes out |
| `toString("base64url")` | `urlsafe_b64encode(b).rstrip(b"=")` | Python keeps the padding |
| `buf.toString("hex")` | `b.hex()` | `bytes.fromhex()` goes back |
| `view.getUint16(offset, true)` | `struct.unpack_from("<H", b, offset)` | always give a byte order |

## Challenges

:::challenge id=formats-jwt-claims title="Peek inside a JWT" difficulty=easy
A JSON Web Token is three base64url segments joined by dots, `header.payload.signature`. Each segment is URL-safe base64 **without padding**, and the header and payload decode to JSON objects. Write `jwt_claims(token)` that returns the payload, the token's "claims", as a dict.

- Don't verify the signature: that needs the key and a library such as PyJWT. Ignore the header and the signature entirely, and accept an empty signature.
- Raise `ValueError` if the token doesn't have exactly three segments, if the payload isn't valid base64 or JSON, or if it decodes to anything other than a JSON object.

```text
jwt_claims("eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiI0MiJ9.c2lnbmF0dXJl")
{'sub': '42'}
```

```js
function jwtClaims(token) {
  const parts = token.split(".");
  if (parts.length !== 3) throw new Error(`expected 3 segments, got ${parts.length}`);
  const claims = JSON.parse(Buffer.from(parts[1], "base64url").toString("utf8"));
  if (claims === null || typeof claims !== "object" || Array.isArray(claims)) {
    throw new Error("the payload must be a JSON object");
  }
  return claims;
}
```

```python starter
import base64
import json

def jwt_claims(token):
    ...
```

```python solution
import base64
import json

def jwt_claims(token):
    parts = token.split(".")
    if len(parts) != 3:
        raise ValueError(f"expected 3 segments, got {len(parts)}")
    payload = parts[1]
    claims = json.loads(base64.urlsafe_b64decode(payload + "=" * (-len(payload) % 4)))
    if not isinstance(claims, dict):
        raise ValueError("the payload must be a JSON object")
    return claims
```

```python tests
import base64
import json

def segment(obj):
    data = json.dumps(obj, separators=(",", ":"), ensure_ascii=False).encode()
    return base64.urlsafe_b64encode(data).rstrip(b"=").decode("ascii")

def token(payload, signature="c2lnbmF0dXJl"):
    return f"{segment({'alg': 'HS256', 'typ': 'JWT'})}.{segment(payload)}.{signature}"

@test("returns the payload as a dict")
def _():
    eq(jwt_claims("eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiI0MiJ9.c2lnbmF0dXJl"), {"sub": "42"})
    eq(jwt_claims(token({"sub": "42", "admin": False, "exp": 1767225600})),
       {"sub": "42", "admin": False, "exp": 1767225600})

@test("restores whatever padding the payload needs")
def _():
    for sub in ["4", "42", "421", "4210"]:
        eq(jwt_claims(token({"sub": sub})), {"sub": sub})

@test("decodes the URL-safe alphabet")
def _():
    payload = {"q": "???>>>~~~"}
    check("-" in segment(payload) and "_" in segment(payload), "this payload should need - and _")
    eq(jwt_claims(token(payload)), payload)

@test("handles non-ASCII text")
def _():
    eq(jwt_claims(token({"name": "Zoë", "city": "Zürich"})), {"name": "Zoë", "city": "Zürich"})

@test("ignores the signature, even an empty one")
def _():
    eq(jwt_claims(token({"sub": "42"}, signature="")), {"sub": "42"})

@test("needs exactly three segments")
def _():
    for bad in ["", "abc", "a.b", "a.b.c.d"]:
        raises(ValueError, jwt_claims, bad)

@test("rejects payloads that aren't base64-encoded JSON objects")
def _():
    raises(ValueError, jwt_claims, "x.not-json.y")
    raises(ValueError, jwt_claims, "x.a.y")
    raises(ValueError, jwt_claims, f"x.{segment([1, 2])}.y")
    raises(ValueError, jwt_claims, f"x.{segment('just a string')}.y")
```

```hint
`token.split(".")` gives the segments, and the payload is the middle one.
```

```hint
`base64.urlsafe_b64decode()` needs the padding back: add `"=" * (-len(segment) % 4)`. `json.loads()` accepts the resulting bytes directly.
```

```hint
`binascii.Error`, `UnicodeDecodeError` and `json.JSONDecodeError` are all subclasses of `ValueError`, so most malformed tokens raise it for you. `isinstance(claims, dict)` covers the last case.
```
:::

:::challenge id=formats-excel-csv title="Convert an Excel export" difficulty=medium
Finance sends you CSV files exported by a German Excel. Write `convert_export(data)` that takes the file's **bytes** and returns standard CSV **text**.

The input:

- is UTF-8 with a byte-order mark, and uses `;` as the delimiter and `\r\n` line endings,
- has an `amount` column written with a decimal comma and `.` thousands separators, like `1.234,50`,
- and a `date` column written as `DD.MM.YYYY`.

The output:

- uses `,` as the delimiter and `\n` line endings, quoting fields only where needed,
- writes amounts with a decimal point and no thousands separator, keeping the digits exactly as given (`1234.50`, not `1234.5`),
- writes dates as ISO 8601, `YYYY-MM-DD`,
- and keeps every other column as it is, with the columns in their original order. Empty amounts and dates stay empty.

```text
input:   \ufeffcustomer;amount;date;note
         "Müller; Söhne";1.234,50;03.11.2026;rush
         Schmidt;99,90;04.11.2026;"says ""hi"""

output:  customer,amount,date,note
         Müller; Söhne,1234.50,2026-11-03,rush
         Schmidt,99.90,2026-11-04,"says ""hi"""
```

```js
import { parse } from "csv-parse/sync";
import { stringify } from "csv-stringify/sync";

function convertExport(buffer) {
  const rows = parse(buffer, { bom: true, delimiter: ";", columns: true });
  for (const row of rows) {
    if (row.amount) row.amount = row.amount.replaceAll(".", "").replace(",", ".");
    if (row.date) row.date = row.date.split(".").reverse().join("-");
  }
  return stringify(rows, { header: true });
}
```

```python starter
import csv
import io

def convert_export(data):
    ...
```

```python solution
import csv
import io
from datetime import datetime

def convert_export(data):
    reader = csv.DictReader(io.StringIO(data.decode("utf-8-sig")), delimiter=";")
    out = io.StringIO()
    writer = csv.DictWriter(out, fieldnames=reader.fieldnames, lineterminator="\n")
    writer.writeheader()
    for row in reader:
        if row["amount"]:
            row["amount"] = row["amount"].replace(".", "").replace(",", ".")
        if row["date"]:
            row["date"] = datetime.strptime(row["date"], "%d.%m.%Y").date().isoformat()
        writer.writerow(row)
    return out.getvalue()
```

```python tests
import csv
import io

EXPORT = (
    "\ufeffcustomer;amount;date;note\r\n"
    '"Müller; Söhne";1.234,50;03.11.2026;rush\r\n'
    'Schmidt;99,90;04.11.2026;"says ""hi"""\r\n'
).encode("utf-8")

def rows_of(text):
    return list(csv.DictReader(io.StringIO(text)))

@test("drops the byte-order mark and switches to commas")
def _():
    eq(convert_export(EXPORT).split("\n")[0], "customer,amount,date,note")

@test("amounts get a decimal point, keeping every digit")
def _():
    eq([r["amount"] for r in rows_of(convert_export(EXPORT))], ["1234.50", "99.90"])

@test("dates become ISO 8601")
def _():
    eq([r["date"] for r in rows_of(convert_export(EXPORT))], ["2026-11-03", "2026-11-04"])

@test("produces exactly this CSV")
def _():
    eq(convert_export(EXPORT),
       "customer,amount,date,note\n"
       "Müller; Söhne,1234.50,2026-11-03,rush\n"
       'Schmidt,99.90,2026-11-04,"says ""hi"""\n')

@test("quotes commas, and keeps line breaks inside quoted fields")
def _():
    data = ('\ufeffcustomer;amount;date;note\r\n'
            '"Smith, Jane";5,00;01.02.2026;"line one\r\nline two"\r\n').encode("utf-8")
    eq(list(csv.reader(io.StringIO(convert_export(data))))[1],
       ["Smith, Jane", "5.00", "2026-02-01", "line one\r\nline two"])

@test("empty amounts and dates stay empty")
def _():
    data = "\ufeffcustomer;amount;date;note\r\nNobody;;;\r\n".encode("utf-8")
    eq(convert_export(data), "customer,amount,date,note\nNobody,,,\n")

@test("other columns and the column order are kept")
def _():
    data = "\ufeffdate;sku;amount\r\n31.12.2025;A-1;-7,25\r\n".encode("utf-8")
    eq(convert_export(data), "date,sku,amount\n2025-12-31,A-1,-7.25\n")
```

```hint
`data.decode("utf-8-sig")` removes the byte-order mark. Wrap the text in `io.StringIO` and read it with `csv.DictReader(..., delimiter=";")`, which also copes with the `\r\n` line endings and the quoted line breaks.
```

```hint
Write into another `io.StringIO` with `csv.DictWriter(out, fieldnames=reader.fieldnames, lineterminator="\n")`, so the columns keep their order, and return `out.getvalue()`.
```

```hint
Treat the amount as text: remove the `.` separators, then turn the `,` into a `.`. Going through `float` would print `1234.5`. `datetime.strptime(s, "%d.%m.%Y").date().isoformat()` reformats a date.
```
:::

:::challenge id=formats-tagged-json title="Round-trip custom types" difficulty=medium
JSON has no dates, decimals or sets. Write `dumps(obj)` and `loads(text)` that carry them through JSON by **tagging** them as single-key objects:

| Python value | JSON |
| --- | --- |
| `datetime` | `{"$datetime": "2026-11-10T09:30:00+00:00"}`, from `isoformat()` |
| `date` | `{"$date": "2026-11-10"}` |
| `Decimal` | `{"$decimal": "19.99"}` |
| `set` | `{"$set": [...]}`, with the items sorted |

- Everything JSON supports natively is written as usual, with `json.dumps`'s default formatting. Any other type raises `TypeError`.
- `loads` turns tagged objects back into the right types at any depth. A tagged object has **exactly one key**, which is one of the four tags. Any other object is left as it is.
- So `loads(dumps(value)) == value` for any mix of these types inside dicts and lists.

Use `json.dumps(default=...)` and `json.loads(object_hook=...)` rather than walking the data yourself.

```js
const dumps = (value) =>
  JSON.stringify(value, function (key, v) {
    const raw = this[key];                // the value before Date#toJSON ran
    if (raw instanceof Date) return { $datetime: raw.toISOString() };
    if (raw instanceof Set) return { $set: [...raw].sort() };
    return v;
  });

const loads = (text) =>
  JSON.parse(text, (key, v) => {
    if (v && typeof v === "object" && Object.keys(v).length === 1) {
      if ("$datetime" in v) return new Date(v.$datetime);
      if ("$set" in v) return new Set(v.$set);
    }
    return v;
  });
```

```python starter
import json
from datetime import date, datetime
from decimal import Decimal

def dumps(obj):
    return json.dumps(obj)

def loads(text):
    return json.loads(text)
```

```python solution
import json
from datetime import date, datetime
from decimal import Decimal

def _encode(obj):
    match obj:
        case datetime():                    # first: a datetime is also a date
            return {"$datetime": obj.isoformat()}
        case date():
            return {"$date": obj.isoformat()}
        case Decimal():
            return {"$decimal": str(obj)}
        case set() | frozenset():
            return {"$set": sorted(obj)}
    raise TypeError(f"Object of type {type(obj).__name__} is not JSON serializable")

DECODERS = {
    "$datetime": datetime.fromisoformat,
    "$date": date.fromisoformat,
    "$decimal": Decimal,
    "$set": set,
}

def _decode(obj):
    if len(obj) == 1:
        [(key, value)] = obj.items()
        if key in DECODERS:
            return DECODERS[key](value)
    return obj

def dumps(obj):
    return json.dumps(obj, default=_encode)

def loads(text):
    return json.loads(text, object_hook=_decode)
```

```python tests
import json
from datetime import date, datetime, timedelta, timezone
from decimal import Decimal

WHEN = datetime(2026, 11, 10, 9, 30, tzinfo=timezone.utc)

@test("tags each type as described")
def _():
    eq(json.loads(dumps(WHEN)), {"$datetime": "2026-11-10T09:30:00+00:00"})
    eq(json.loads(dumps(date(2026, 11, 10))), {"$date": "2026-11-10"})
    eq(json.loads(dumps(Decimal("19.99"))), {"$decimal": "19.99"})
    eq(json.loads(dumps({"b", "c", "a"})), {"$set": ["a", "b", "c"]})

@test("plain JSON values are written as usual")
def _():
    eq(dumps({"id": 7, "tags": ["x"], "paid": True, "note": None}),
       '{"id": 7, "tags": ["x"], "paid": true, "note": null}')

@test("round-trips nested values")
def _():
    order = {
        "id": 7, "placed": WHEN, "ship_by": date(2026, 11, 12), "total": Decimal("19.99"),
        "items": [{"sku": "A1", "price": Decimal("9.995")}], "tags": {"gift", "rush"},
    }
    eq(loads(dumps(order)), order)

@test("datetimes stay datetimes, with their offset")
def _():
    eastern = WHEN.astimezone(timezone(timedelta(hours=-5)))
    back = loads(dumps([WHEN, eastern]))
    check(all(type(x) is datetime for x in back), "datetime is a subclass of date, so check for it first")
    eq(back, [WHEN, eastern])
    eq(back[1].utcoffset(), timedelta(hours=-5))

@test("Decimal keeps every digit")
def _():
    eq(loads(dumps(Decimal("0.10000000000000000001"))), Decimal("0.10000000000000000001"))

@test("objects that merely contain a tag are left alone")
def _():
    eq(loads('{"$date": "2026-11-10", "note": "not a tag"}'), {"$date": "2026-11-10", "note": "not a tag"})
    eq(loads('{"price": "$5"}'), {"price": "$5"})

@test("unknown types raise TypeError")
def _():
    raises(TypeError, dumps, {"callback": print})
    raises(TypeError, dumps, b"raw bytes")

@test("uses json's hooks")
def _():
    keywords = {k.arg for node in ast.walk(tree) if isinstance(node, ast.Call) for k in node.keywords}
    check("default" in keywords or "cls" in keywords, "pass default=... to json.dumps")
    check("object_hook" in keywords, "pass object_hook=... to json.loads")
```

```hint
`json.dumps(obj, default=fn)` calls `fn` only for objects it can't serialize. Return the tagged dict, and `json` encodes that dict as usual. Raise `TypeError` for anything else, as `json` itself would.
```

```hint
Check for `datetime` before `date`: every `datetime` is also an instance of `date`, so the other order turns datetimes into dates.
```

```hint
`json.loads(text, object_hook=fn)` calls `fn` with every decoded object, innermost first. If the dict has exactly one key and it's a known tag, return the converted value, otherwise the dict itself. `datetime.fromisoformat`, `date.fromisoformat`, `Decimal` and `set` do the converting.
```
:::

:::challenge id=formats-sensor-log title="Decode a binary sensor log" difficulty=hard
A weather station uploads its readings in a compact binary format. Write `decode(data)`, which returns a list of `Reading` objects, and `encode(readings)`, which produces the bytes again. Everything is **little-endian**, with no padding anywhere.

```text
header (8 bytes):   magic b"WXLG" | version: uint16, always 1 | record count: uint16
record (9 bytes):   timestamp: uint32 | temperature: int16, in hundredths of a degree | humidity: uint8 | station: uint16
```

`Reading.temperature` is in degrees, so the stored `2150` becomes `21.5` and `-340` becomes `-3.4`.

- `decode` raises `ValueError` if the data is shorter than a header, if the magic or the version is wrong, or if the length doesn't match the record count exactly (truncated data or trailing bytes).
- `encode` writes version 1 and rounds temperatures to the nearest hundredth. `struct` raises `struct.error`, which is **not** a `ValueError`, for a value that doesn't fit its field. Turn it into a `ValueError`.

```js
function decode(buf) {
  if (buf.length < 8 || buf.subarray(0, 4).toString("latin1") !== "WXLG") throw new Error("not a weather log");
  const view = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
  if (view.getUint16(4, true) !== 1) throw new Error("unsupported version");
  const count = view.getUint16(6, true);
  if (buf.length !== 8 + count * 9) throw new Error("length doesn't match the record count");
  const readings = [];
  for (let offset = 8; offset < buf.length; offset += 9) {
    readings.push({
      timestamp: view.getUint32(offset, true),
      temperature: view.getInt16(offset + 4, true) / 100,
      humidity: view.getUint8(offset + 6),
      station: view.getUint16(offset + 7, true),
    });
  }
  return readings;
}
```

```python starter
import struct
from dataclasses import dataclass

@dataclass(frozen=True)
class Reading:
    timestamp: int        # seconds since the epoch
    temperature: float    # degrees Celsius
    humidity: int         # percent
    station: int

def decode(data):
    ...

def encode(readings):
    ...
```

```python solution
import struct
from dataclasses import dataclass

@dataclass(frozen=True)
class Reading:
    timestamp: int        # seconds since the epoch
    temperature: float    # degrees Celsius
    humidity: int         # percent
    station: int

MAGIC = b"WXLG"
HEADER = struct.Struct("<4sHH")      # magic, version, record count
RECORD = struct.Struct("<IhBH")      # timestamp, hundredths of a degree, humidity, station

def decode(data):
    if len(data) < HEADER.size:
        raise ValueError("too short to be a weather log")
    magic, version, count = HEADER.unpack_from(data)
    if magic != MAGIC:
        raise ValueError(f"not a weather log: {magic!r}")
    if version != 1:
        raise ValueError(f"unsupported version {version}")
    if len(data) != HEADER.size + count * RECORD.size:
        raise ValueError(f"{count} records need {HEADER.size + count * RECORD.size} bytes, got {len(data)}")
    return [
        Reading(timestamp, hundredths / 100, humidity, station)
        for timestamp, hundredths, humidity, station in RECORD.iter_unpack(data[HEADER.size:])
    ]

def encode(readings):
    try:
        records = b"".join(
            RECORD.pack(r.timestamp, round(r.temperature * 100), r.humidity, r.station)
            for r in readings
        )
        return HEADER.pack(MAGIC, 1, len(readings)) + records
    except struct.error as err:
        raise ValueError(f"value out of range: {err}") from err
```

```python tests
import struct

def build(records, magic=b"WXLG", version=1, count=None):
    header = struct.pack("<4sHH", magic, version, len(records) if count is None else count)
    return header + b"".join(struct.pack("<IhBH", *record) for record in records)

RECORDS = [(1_762_765_200, 2150, 48, 7), (1_762_765_260, -340, 91, 7), (1_762_765_320, 0, 100, 12)]

@test("decodes every record")
def _():
    eq(decode(build(RECORDS)), [
        Reading(1_762_765_200, 21.5, 48, 7),
        Reading(1_762_765_260, -3.4, 91, 7),
        Reading(1_762_765_320, 0.0, 100, 12),
    ])

@test("an empty log is just the header")
def _():
    eq(decode(build([])), [])
    eq(encode([]), b"WXLG\x01\x00\x00\x00")

@test("encode reproduces the original bytes")
def _():
    data = build(RECORDS)
    eq(len(encode(decode(data))), 8 + 3 * 9, "records are 9 bytes: no padding")
    eq(encode(decode(data)), data)

@test("decode(encode(readings)) gives the readings back")
def _():
    readings = [Reading(1_700_000_000, -12.75, 5, 65535), Reading(0, 327.67, 0, 0)]
    eq(decode(encode(readings)), readings)

@test("rejects data that isn't a weather log")
def _():
    raises(ValueError, decode, b"")
    raises(ValueError, decode, b"WXL")
    raises(ValueError, decode, build(RECORDS, magic=b"PNG\x00"))

@test("rejects other versions")
def _():
    raises(ValueError, decode, build(RECORDS, version=2))

@test("rejects truncated data and trailing bytes")
def _():
    data = build(RECORDS)
    raises(ValueError, decode, data[:-1])
    raises(ValueError, decode, data + b"\x00")
    raises(ValueError, decode, build(RECORDS, count=4))

@test("encode raises ValueError for values that don't fit")
def _():
    raises(ValueError, encode, [Reading(0, 400.0, 50, 1)])      # 40000 doesn't fit an int16
    raises(ValueError, encode, [Reading(0, 20.0, 256, 1)])      # humidity is a uint8
```

```hint
Describe the layout with two `struct.Struct` objects, `"<4sHH"` for the header and `"<IhBH"` for a record, and check that the record's `.size` is 9. Without the `<`, native alignment pads it to 10.
```

```hint
Validate in order: is there a whole header, then the magic, the version, and finally whether `len(data) == HEADER.size + count * RECORD.size`. After that, `RECORD.iter_unpack(data[HEADER.size:])` yields one tuple per record.
```

```hint
Encode with `round(r.temperature * 100)`, so `21.5` becomes `2150`. Wrap the packing in `try` / `except struct.error as err:` and `raise ValueError(...) from err`.
```
:::
