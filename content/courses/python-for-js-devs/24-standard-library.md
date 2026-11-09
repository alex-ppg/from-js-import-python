---
title: Batteries Included
part: Advanced Python
summary: The npm packages you won't need, from dates, paths and CSV to hashes, URLs and logging, all in the stdlib.
minutes: 35
---

Node ships a lean runtime and leaves the batteries to npm. Python goes the other way. Its standard library covers dates, paths, CSV, SQLite, hashing, UUIDs, URL parsing, argument parsing, logging and a good deal more, with nothing to install. So the first question changes from "which package?" to "which module?".

This lesson maps your usual npm dependencies to stdlib modules, then gives each one a quick runnable tour. The goal is recognition, not mastery: know what's in the box, then reach for the docs.

## The npm → stdlib map

| You'd reach for | Python stdlib | Notes |
| --- | --- | --- |
| lodash | `itertools`, `functools`, `collections`, `operator` | much of lodash is language syntax ([Comprehensions](lesson:map-filter-reduce)) |
| date-fns, dayjs | `datetime`, `zoneinfo` | months are 1-based |
| uuid, `crypto.randomUUID()` | `uuid` | `uuid7()` in 3.14 |
| `crypto` | `hashlib`, `hmac`, `secrets` | everything works on bytes |
| `path`, `fs` | `pathlib`, `shutil` | |
| `process.argv`, commander | `sys.argv`, `argparse` | |
| `child_process` | `subprocess` | |
| `URL`, `querystring` | `urllib.parse` | |
| dotenv | `os.environ` | loading `.env` files needs `python-dotenv` |
| csv-parse | `csv` | |
| better-sqlite3 | `sqlite3` | |
| `btoa`, `Buffer` base64 | `base64` | bytes in, bytes out |
| winston, pino | `logging` | |
| `util.inspect` | `pprint` | |
| `structuredClone` | `copy.deepcopy` | |
| `performance.now()` | `time.perf_counter()` | seconds, not milliseconds |
| a priority-queue package | `heapq` | |
| simple-statistics | `statistics` | |
| diff, leven | `difflib` | |

## `collections`: containers with batteries

:::compare
```js
const counts = {};
for (const w of words) counts[w] = (counts[w] ?? 0) + 1;

recent.push(item);                    // a bounded buffer
if (recent.length > 5) recent.shift();

const settings = { ...defaults, ...fromEnv, ...fromCli };
```
```python
from collections import ChainMap, Counter, deque

counts = Counter(words)

recent = deque(maxlen=5)
recent.append(item)                   # old items fall off the front

settings = ChainMap(from_cli, from_env, defaults)
```
:::

`collections` holds the containers you'd otherwise hand-roll. `Counter` counts anything iterable and supports arithmetic, `defaultdict` fills in missing keys, `deque` is O(1) at both ends (with an optional `maxlen`), `OrderedDict` adds `move_to_end` and `popitem(last=False)` for LRU caches, `namedtuple` makes lightweight records, and `ChainMap` layers dicts so a lookup tries each in turn without copying anything. [Dicts](lesson:dicts) and [Lists](lesson:lists) go deeper on the first three.

```python run
from collections import ChainMap, Counter, OrderedDict

stock = Counter(tea=3, pie=1)
sold = Counter(tea=1, cake=2)
print(stock - sold)               # counts at or below zero disappear
print((stock + sold).most_common(1))

cache = OrderedDict(a=1, b=2, c=3)
cache.move_to_end("a")            # "a" was just used
cache.popitem(last=False)         # evict the least recently used: "b"
print(list(cache))

settings = ChainMap({"theme": "dark"}, {"theme": "light", "lang": "en"})
print(settings["theme"], settings["lang"])
```

## `datetime`: dates without the footguns

:::compare
```js
const d = new Date(2024, 0, 31);   // January: months are 0-based
d.getMonth();                      // 0
new Date(2024, 1, 30);             // silently becomes March 1
new Date(2024, 5, 2).getDay();     // 0: Sunday is day 0
Date.now();                        // milliseconds since the epoch
```
```python
from datetime import date
import time

d = date(2024, 1, 31)              # January: months are 1-based
d.month                            # 1
date(2024, 2, 30)                  # ValueError
date(2024, 6, 2).weekday()         # 6: Monday is day 0
time.time()                        # seconds since the epoch, a float
```
:::

`datetime` has a type per job: `date` (a calendar day), `time` (a time of day), `datetime` (both) and `timedelta` (a duration). Months run from 1 to 12, impossible dates raise `ValueError` instead of rolling over, and every object is immutable: `d.replace(day=1)` returns a new date where JS's `setDate` would mutate.

:::quiz output
June 2, 2024 was a Sunday. What does this print?

```python
from datetime import date
print(date(2024, 6, 2).weekday())
```

- [ ] `0`
- [x] `6`
- [ ] `7`
- [ ] `1`

`weekday()` counts from Monday as `0`, so Sunday is `6`. `isoweekday()` counts Monday as `1` and Sunday as `7`. Neither matches JS's `getDay()`, where Sunday is `0`, so double-check any weekday logic you port.
:::

### Durations with `timedelta`

Subtracting two dates or datetimes gives a `timedelta`, and adding one moves a date, which replaces all the `24 * 60 * 60 * 1000` arithmetic. A `timedelta` stores days, seconds and microseconds; read it back with `.days` or `.total_seconds()`. It has no `months=` argument, because "a month later" needs a policy (January 31 plus a month is what?). The third-party `python-dateutil` package's `relativedelta` provides one.

```python run
from datetime import date, datetime, timedelta

print(date(2024, 2, 27) + timedelta(days=3))     # knows about leap years
print(date(2024, 12, 25) - date(2024, 12, 1))
print((date(2024, 12, 25) - date(2024, 12, 1)).days)

shift = datetime(2024, 6, 1, 22, 30) - datetime(2024, 6, 1, 9, 0)
print(shift, shift.total_seconds() / 3600, "hours")
print(timedelta(hours=-1))                       # normalised: -1 day + 23 hours
```

:::quiz output
What does this print?

```python
from datetime import date
print(date(2024, 3, 1) - date(2024, 2, 1))
```

- [ ] `28 days, 0:00:00`
- [x] `29 days, 0:00:00`
- [ ] `1 month`
- [ ] `29`

2024 is a leap year, so February has 29 days. Subtracting dates gives a `timedelta`, which prints as days plus a `hours:minutes:seconds` part. Use `.days` when you want the bare number.
:::

### Parsing and formatting

:::compare
```js
const d = new Date("2024-06-01T12:30:00Z");
d.toISOString();                 // "2024-06-01T12:30:00.000Z"
d.toLocaleDateString("en-GB");   // "01/06/2024"
// anything fancier: date-fns format()
```
```python
d = datetime.fromisoformat("2024-06-01T12:30:00Z")
d.isoformat()                    # "2024-06-01T12:30:00+00:00"
d.strftime("%d/%m/%Y")           # "01/06/2024"
f"{d:%b %d, %Y}"                 # "Jun 01, 2024"
```
:::

`fromisoformat` parses ISO 8601, including the `Z` suffix (3.11+). `strptime(text, format)` parses anything else, and `strftime(format)` formats. Note that `isoformat()` writes UTC as `+00:00`, not `Z`. If an API insists on `Z`, format it yourself with `strftime("%Y-%m-%dT%H:%M:%SZ")`.

:::pythonic Dates format inside f-strings
Whatever follows the colon in an f-string is handed to the object's `__format__`, and dates accept `strftime` codes there: `f"Due {due:%a %d %b}"`. That covers most of what you'd install date-fns' `format()` for.
:::

```python run
from datetime import datetime

shipped = datetime.fromisoformat("2024-06-01T12:30:00+02:00")
print(shipped, shipped.tzinfo)
print(f"Shipped {shipped:%A %d %B at %H:%M}")
print(datetime.strptime("01/06/2024 14:05", "%d/%m/%Y %H:%M"))
```

### Aware and naive datetimes

A JS `Date` is always an instant: UTC inside, local time on display. A Python `datetime` is either **aware**, carrying a `tzinfo` that pins it to an instant, or **naive**, a wall-clock reading with no zone at all. `datetime.now()` and `datetime(2024, 6, 1, 12)` are naive. Mixing the two raises `TypeError` for ordering and subtraction, which is Python refusing to guess. The rule that saves you: create aware UTC datetimes with `datetime.now(timezone.utc)`, store and compute in UTC, and convert to local time only for display.

```python run raises
from datetime import datetime, timezone

aware = datetime(2024, 6, 1, 12, 0, tzinfo=timezone.utc)
naive = datetime(2024, 6, 1, 12, 0)
print(aware.tzinfo, naive.tzinfo)
print(aware == naive)      # False: an aware and a naive datetime are never equal
print(aware < naive)       # TypeError: can't compare offset-naive and offset-aware
```

:::gotcha `utcnow()` is a trap
`datetime.utcnow()` returns a **naive** datetime holding the UTC wall time, so nothing records that it's UTC, and `.astimezone()` will later assume it's local. It's deprecated since 3.12. Use `datetime.now(timezone.utc)`.
:::

Named time zones with daylight saving rules come from `zoneinfo` (3.9+). It needs a time zone database: Linux and macOS have one, but on Windows you `pip install tzdata`, and this sandbox has none, so the snippet is static:

```python
from datetime import datetime
from zoneinfo import ZoneInfo

meeting = datetime(2024, 3, 31, 9, 0, tzinfo=ZoneInfo("Europe/Paris"))
print(meeting.isoformat())                               # 2024-03-31T09:00:00+02:00
print(meeting.astimezone(ZoneInfo("America/New_York")))  # 2024-03-31 03:00:00-04:00
```

## Files and paths: `pathlib` and `shutil`

:::compare
```js
const file = path.join(import.meta.dirname, "data", "users.json");
fs.mkdirSync(path.dirname(file), { recursive: true });
fs.writeFileSync(file, "[]", "utf8");
const text = fs.readFileSync(file, "utf8");
path.extname(file);                        // ".json"
fs.readdirSync(dataDir).filter((f) => f.endsWith(".json"));
fs.rmSync(dataDir, { recursive: true });
```
```python
file = Path(__file__).parent / "data" / "users.json"
file.parent.mkdir(parents=True, exist_ok=True)
file.write_text("[]", encoding="utf-8")
text = file.read_text(encoding="utf-8")
file.suffix                                # ".json"
list(data_dir.glob("*.json"))
shutil.rmtree(data_dir)
```
:::

A `Path` object replaces both `path` and most of `fs`. The `/` operator joins segments, `.name`, `.stem`, `.suffix` and `.parent` replace `basename`, `extname` and `dirname`, and the everyday file operations are methods. `shutil` does the bulk work: `copy`, `copytree`, `move`, `rmtree` and `make_archive`. Opening files with `open()` and `with` is covered in [Context Managers](lesson:context-managers).

```python run
from pathlib import Path
import shutil

root = Path("demo")
(root / "data").mkdir(parents=True, exist_ok=True)
config = root / "data" / "config.json"
config.write_text('{"debug": true}', encoding="utf-8")

print(config.name, config.stem, config.suffix, config.parent)
print(config.with_suffix(".bak"))
print(config.read_text(encoding="utf-8"))
print(sorted(str(p) for p in root.rglob("*")))
shutil.rmtree(root)
print(root.exists())
```

:::tip Always pass `encoding="utf-8"`
Without it, `read_text`, `write_text` and `open` use the platform's preferred encoding, which on Windows may not be UTF-8. Your code works on your Mac and corrupts accents on a colleague's laptop.
:::

## Data formats: `json`, `csv` and `sqlite3`

:::compare
```js
JSON.stringify(data, null, 2);
JSON.parse(text);

line.split(",");             // CSV the naive way: breaks on "Smith, Jane"

db.prepare("SELECT name FROM users WHERE plan = ?").all(plan);
```
```python
json.dumps(data, indent=2)
json.loads(text)

next(csv.reader([line]))     # the csv module understands quoting

db.execute("SELECT name FROM users WHERE plan = ?", (plan,)).fetchall()
```
:::

`json` maps objects to dicts and `null`, `true` and `false` to `None`, `True` and `False` ([Dicts](lesson:dicts) has the details). Two surprises: `json.dumps` raises `TypeError` on types it doesn't know, like `datetime` (pass `default=str`, or a function), and it escapes non-ASCII characters unless you pass `ensure_ascii=False`.

```python run
import json
from datetime import datetime, timezone

event = {"city": "Zürich", "at": datetime(2024, 6, 1, tzinfo=timezone.utc), "notes": None}
print(json.dumps(event, default=str))         # str() anything json doesn't know
print(json.dumps(event, default=str, ensure_ascii=False))
print(json.loads('{"ok": true, "notes": null}'))
```

Never parse CSV with `split(",")`. Quoted fields can hold commas, doubled quotes and even newlines. `csv.reader` yields a list per row, `csv.DictReader` yields a dict per row keyed by the header, and `csv.writer` adds quotes where needed. They work on files and, through `io.StringIO`, on strings. When you open a CSV file, pass `newline=""` so the module can handle line endings itself.

```python run
import csv
import io

text = 'name,city,total\n"Smith, Jane",Paris,120\nLi Wei,"New York, NY",80\n'
print(text.splitlines()[1].split(","))       # the naive way: wrong

for row in csv.DictReader(io.StringIO(text)):
    print(row["name"], "|", row["city"], "|", int(row["total"]))

out = io.StringIO()
csv.writer(out).writerow(["Ada", 'said "hi", then left'])
print(out.getvalue())
```

`sqlite3` is a complete embedded SQL database in the stdlib. `":memory:"` gives you a throwaway one, which is handy for tests and for this playground:

```python run
import sqlite3

db = sqlite3.connect(":memory:")
db.execute("CREATE TABLE users (id INTEGER PRIMARY KEY, name TEXT, plan TEXT)")
db.executemany(
    "INSERT INTO users (name, plan) VALUES (?, ?)",
    [("Ada", "pro"), ("Linus", "free"), ("Grace", "pro")],
)
rows = db.execute("SELECT name FROM users WHERE plan = ? ORDER BY name", ("pro",))
print([name for (name,) in rows])
```

:::gotcha Placeholders, never f-strings
`?` placeholders let SQLite handle the quoting. Building SQL with an f-string is an injection bug, exactly as it is with template literals in JS. Note the one-element tuple `("pro",)`: the trailing comma is what makes it a tuple ([Tuples & Destructuring](lesson:tuples-and-unpacking)).
:::

## Randomness, IDs, hashes and base64

:::compare
```js
Math.random();
crypto.randomUUID();
crypto.randomBytes(16).toString("hex");
crypto.createHash("sha256").update(text).digest("hex");
crypto.createHmac("sha256", key).update(body).digest("hex");
btoa("hi");                                // "aGk="
```
```python
random.random()
str(uuid.uuid4())
secrets.token_hex(16)
hashlib.sha256(text.encode()).hexdigest()
hmac.new(key, body, "sha256").hexdigest()
base64.b64encode(b"hi")                    # b'aGk='
```
:::

There are two random modules for two jobs. `random` is a seedable pseudo-random generator for simulations, games and tests (`random.seed(42)` makes a run repeatable), and [Numbers & Math](lesson:numbers-and-math) covers it. `secrets` draws from the operating system's cryptographic source, so use it for tokens, passwords and reset links. It's the `Math.random()` versus `crypto.getRandomValues()` split again.

Hashing, HMAC and base64 all work on **bytes**, not strings. Encode text with `.encode()` (UTF-8 by default) and decode results with `.decode()`. Where `btoa` chokes on anything outside Latin-1, Python makes the encoding explicit. To verify a webhook signature, compare with `hmac.compare_digest`, which takes constant time, rather than `==`. For IDs, `uuid.uuid4()` is random like `crypto.randomUUID()`, and 3.14's `uuid.uuid7()` starts with a timestamp, so new IDs sort in creation order and index well in databases.

```python run
import base64, hashlib, hmac, random, secrets, uuid

rng = random.Random(42)                   # a seeded generator: same picks every run
print(rng.choice(["rock", "paper", "scissors"]), rng.sample(range(1, 50), 3))
print(uuid.uuid4())
print(uuid.uuid7())                       # 3.14+: time-ordered
print(secrets.token_urlsafe(16))          # for reset links and API keys

body = '{"event": "paid"}'.encode()
expected = hmac.new(b"webhook-secret", body, "sha256").hexdigest()
received = expected                       # pretend it came from a header
print(hmac.compare_digest(expected, received))
print(hashlib.sha256("héllo".encode()).hexdigest()[:16])
print(base64.b64encode("héllo".encode()).decode("ascii"))
```

:::quiz output
What does this print?

```python
import base64
print(base64.b64encode(b"hi"))
```

- [ ] `aGk=`
- [x] `b'aGk='`
- [ ] `TypeError`
- [ ] `"aGk="`

`b64encode` takes bytes and returns bytes, and printing a `bytes` object shows its `b'...'` repr. Call `.decode("ascii")` for a `str`. Passing a `str` in, as you would with `btoa`, raises `TypeError`.
:::

:::gotcha `random.shuffle` returns `None`
Like `list.sort`, `random.shuffle(cards)` works in place and returns `None`, so `cards = random.shuffle(cards)` throws your deck away. Use `random.sample(cards, k=len(cards))` for a shuffled copy.
:::

## URLs: `urllib.parse`

:::compare
```js
const url = new URL("https://shop.example.com/search?q=red+shoes&tag=a&tag=b");
url.hostname;                         // "shop.example.com"
url.searchParams.get("q");            // "red shoes"
url.searchParams.getAll("tag");       // ["a", "b"]
new URLSearchParams({ q: "red shoes", page: 2 }).toString();
encodeURIComponent("a b/c");          // "a%20b%2Fc"
new URL("42", "https://api.example.com/v1/users/").href;
```
```python
url = urlsplit("https://shop.example.com/search?q=red+shoes&tag=a&tag=b")
url.hostname                          # "shop.example.com"
parse_qs(url.query)["q"]              # ["red shoes"]: always a list
parse_qs(url.query)["tag"]            # ["a", "b"]
urlencode({"q": "red shoes", "page": 2})
quote("a b/c", safe="")               # "a%20b%2Fc"
urljoin("https://api.example.com/v1/users/", "42")
```
:::

`urlsplit` breaks a URL into `scheme`, `netloc`, `path`, `query` and `fragment`, plus conveniences like `hostname` and `port`. The result is a named tuple, so `parts._replace(query=...)` and `urlunsplit` put it back together. `parse_qs` decodes a query string into a dict of **lists**, because any key can repeat, and `parse_qsl` gives `(key, value)` pairs instead. `urlencode` goes the other way and, like `URLSearchParams`, encodes spaces as `+`. `quote` is the closest match for `encodeURIComponent`, but it leaves `/` alone unless you pass `safe=""`.

```python run
from urllib.parse import parse_qs, urlencode, urlsplit, urlunsplit

parts = urlsplit("https://shop.example.com:8443/search?q=red+shoes&tag=a&tag=b#results")
print(parts.hostname, parts.port, parts.path, parts.fragment)
print(parse_qs(parts.query))
print(urlencode({"tag": ["a", "b"]}))               # oops: the list's repr
print(urlencode({"tag": ["a", "b"]}, doseq=True))   # one pair per item
print(urlunsplit(parts._replace(query=urlencode({"q": "boots", "page": 2}))))
```

:::quiz output
What does this print?

```python
from urllib.parse import parse_qs
print(parse_qs("page=2&tag=a&tag=b"))
```

- [ ] `{'page': '2', 'tag': 'b'}`
- [ ] `{'page': 2, 'tag': ['a', 'b']}`
- [x] `{'page': ['2'], 'tag': ['a', 'b']}`
- [ ] `{'page': '2', 'tag': ['a', 'b']}`

Every value is a list of strings, even when the key appears once, and nothing is converted to a number. Read single values with `parse_qs(q)["page"][0]`, or use `dict(parse_qsl(q))` when you know keys don't repeat.
:::

## Scripts, processes and logs

:::compare
```js
process.argv.slice(2);                     // ["prod", "--dry-run"]
process.env.API_URL ?? "http://localhost";
execFileSync("git", ["status"], { encoding: "utf8" });
performance.now();                         // milliseconds
console.warn("disk almost full");
```
```python
sys.argv[1:]                               # ["prod", "--dry-run"]
os.environ.get("API_URL", "http://localhost")
subprocess.run(["git", "status"], capture_output=True, text=True, check=True).stdout
time.perf_counter()                        # seconds, as a float
log.warning("disk almost full")
```
:::

`sys.argv[0]` is the script itself, so the arguments are `sys.argv[1:]` (Node puts the `node` binary first, hence `slice(2)`). Past a couple of flags, `argparse` replaces commander and yargs, and generates `--help` for you. `os.environ` is a dict-like view of the environment: `os.environ["KEY"]` raises `KeyError` when the variable is missing and `.get()` takes a default. There's no built-in `.env` loader (`python-dotenv` is the usual package). `subprocess.run` launches programs; pass the command as a list, and `check=True` raises if it exits non-zero. The sandbox can't start processes, so that line stays static.

```python run
import argparse

parser = argparse.ArgumentParser(prog="deploy", description="Ship a build.")
parser.add_argument("env", choices=["staging", "prod"])
parser.add_argument("--tag", default="latest")
parser.add_argument("-n", "--dry-run", action="store_true")

args = parser.parse_args(["prod", "--tag", "v1.2", "-n"])   # in a script: parse_args()
print(args)
print(args.env, args.tag, args.dry_run)
parser.print_help()
```

### `logging`

`logging` is the stdlib's pino. Each module asks for a named logger with `logging.getLogger(__name__)`, and the application configures levels, formats and destinations once at startup, typically with `logging.basicConfig`. Libraries only ever call `getLogger`. Pass values as arguments, `log.info("order %s placed", order_id)`, instead of pre-formatting an f-string: the message is only built if the level is enabled, and log tools can group entries by their template. Inside an `except` block, `log.exception(...)` logs at `ERROR` and appends the traceback.

```python run
import logging

logging.basicConfig(
    level=logging.INFO,
    format="%(levelname)-7s %(name)s: %(message)s",
    force=True,              # replace any earlier config (handy in notebooks)
)
log = logging.getLogger("checkout")

log.debug("not shown: below INFO")
log.info("order %s placed by %s", 1042, "ada")
log.warning("stock low for %s", "tea")
try:
    1 / 0
except ZeroDivisionError:
    log.exception("payment failed")
```

## Small modules worth knowing

:::compare
```js
// No priority queue in JS: re-sort, or install one
queue.push(task);
queue.sort((a, b) => a.priority - b.priority);
const next = queue.shift();
```
```python
import heapq

heapq.heappush(queue, (task.priority, task.name))
next_task = heapq.heappop(queue)   # O(log n), smallest first

```
:::

`heapq` turns a plain list into a min-heap: `heappush` and `heappop` are O(log n), and `queue[0]` is always the smallest item. Push tuples to order by priority. Ties fall through to the next field, so make sure it's comparable. `heapq.nlargest(n, items, key=...)` and `nsmallest` take a top-N without sorting everything, and 3.14 adds max-heap functions (`heappush_max`, `heappop_max`, ...). `bisect` does binary search on sorted sequences, which makes it the neat way to map a value onto ranges. `statistics` covers `mean`, `median`, `mode`, `stdev` and `quantiles`.

```python run
import bisect
import heapq
import statistics

queue = []
heapq.heappush(queue, (2, "write tests"))
heapq.heappush(queue, (1, "fix prod"))
heapq.heappush(queue, (3, "refactor"))
print(heapq.heappop(queue))                 # the smallest priority comes out first

scores = [72, 45, 90, 38, 66]
print(heapq.nlargest(2, scores))
print(["FDCBA"[bisect.bisect((60, 70, 80, 90), s)] for s in scores])   # letter grades
print(statistics.mean(scores), statistics.median(scores))
```

For text, `textwrap.dedent` strips the common indentation from a triple-quoted string so it can be indented along with your code, and `shorten` and `fill` truncate and wrap. `pprint.pp` prints nested data with sensible line breaks, the Python take on `util.inspect`. `difflib.get_close_matches` gives you "did you mean...?" in one call, and `difflib.unified_diff` produces a `git diff`-style patch.

```python run
import difflib
import textwrap
from pprint import pp

usage = textwrap.dedent("""\
    Usage: deploy [options]
      --dry-run   print the plan only
""")
print(usage)
print(textwrap.shorten("The quick brown fox jumps over the lazy dog", width=25))
pp({"service": "checkout", "replicas": 3, "env": {"DEBUG": "0", "REGION": "eu-west-1"}}, width=50)
print(difflib.get_close_matches("chekout", ["status", "commit", "checkout"], n=1))
```

## Beyond the stdlib

Some third-party packages are so standard that you should know them by name. Install them into a virtual environment with pip or uv ([Modules & Tooling](lesson:modules-and-tooling)).

| npm habit | PyPI package | What it does |
| --- | --- | --- |
| axios, `fetch` | `requests`, `httpx` | HTTP clients; `httpx` also does async |
| zod | `pydantic` | validation and parsing driven by type hints |
| Express, Fastify | `FastAPI`, `Flask`, `Django` | web frameworks |
| commander, yargs | `typer`, `click` | CLIs; `typer` builds them from type hints |
| chalk, ora, cli-table | `rich` | colour, tables, progress bars, readable tracebacks |
| jest, vitest | `pytest` | testing |
| luxon (month maths) | `python-dateutil` | `relativedelta`, lenient parsing |
| dotenv | `python-dotenv` | load `.env` files |
| nothing quite like it | `numpy`, `pandas` | fast arrays and dataframes |

```python
import httpx                       # pip install httpx pydantic
from pydantic import BaseModel

class User(BaseModel):
    id: int
    email: str

response = httpx.get("https://api.example.com/users/1", timeout=10)
response.raise_for_status()        # like fetch, a 404 doesn't raise on its own
user = User.model_validate(response.json())
```

## Cheat sheet

| JavaScript | Python | Notes |
| --- | --- | --- |
| `new Date(2024, 0, 31)` | `date(2024, 1, 31)` | months are 1-based |
| `Date.now()` | `time.time()` | seconds, as a float |
| `new Date(iso)` | `datetime.fromisoformat(iso)` | `Z` accepted (3.11+) |
| `d.toISOString()` | `d.isoformat()` | `+00:00`, not `Z` |
| `d.getDay()` | `d.weekday()` | Monday is `0` |
| `new Date()` | `datetime.now(timezone.utc)` | aware; plain `now()` is naive |
| `path.join(a, b)` | `Path(a) / b` | |
| `fs.readFileSync(p, "utf8")` | `Path(p).read_text(encoding="utf-8")` | |
| `fs.mkdirSync(d, { recursive: true })` | `Path(d).mkdir(parents=True, exist_ok=True)` | |
| `JSON.stringify(x, null, 2)` | `json.dumps(x, indent=2)` | `default=str` for dates |
| `crypto.randomUUID()` | `str(uuid.uuid4())` | `uuid7()` in 3.14 |
| `crypto.randomBytes(16).toString("hex")` | `secrets.token_hex(16)` | |
| `createHash("sha256")` | `hashlib.sha256(data).hexdigest()` | `data` must be bytes |
| `btoa(s)` | `base64.b64encode(s.encode()).decode()` | bytes in, bytes out |
| `new URL(u).searchParams` | `parse_qs(urlsplit(u).query)` | values are lists |
| `encodeURIComponent(s)` | `quote(s, safe="")` | |
| `process.argv.slice(2)` | `sys.argv[1:]` | `argparse` for real CLIs |
| `process.env.X` | `os.environ.get("X")` | `os.environ["X"]` raises |
| `execFileSync(cmd, args)` | `subprocess.run([cmd, *args], check=True)` | |
| `performance.now()` | `time.perf_counter()` | seconds |
| `structuredClone(x)` | `copy.deepcopy(x)` | |

## Challenges

:::challenge id=stdlib-days-until title="Days until" difficulty=easy
Write `days_until(iso_date, today)` that returns the number of days from `today` (a `date`) to the date in `iso_date`, a `"YYYY-MM-DD"` string. Dates in the past give a negative number, and an impossible date such as `"2024-02-30"` should raise `ValueError`.

```js
function daysUntil(isoDate, today) {
  // new Date("2024-12-25") is UTC midnight, so mind the time zone...
  return Math.round((new Date(isoDate) - today) / 86_400_000);
}
```

```python starter
from datetime import date

def days_until(iso_date, today):
    ...
```

```python solution
from datetime import date

def days_until(iso_date, today):
    return (date.fromisoformat(iso_date) - today).days
```

```python tests
from datetime import date

@test("counts the days ahead")
def _():
    eq(days_until("2024-12-25", date(2024, 12, 1)), 24)

@test("the same day is 0")
def _():
    eq(days_until("2024-06-01", date(2024, 6, 1)), 0)

@test("past dates are negative")
def _():
    eq(days_until("2024-01-01", date(2024, 1, 31)), -30)

@test("handles leap days and new year")
def _():
    eq(days_until("2024-03-01", date(2024, 2, 28)), 2)
    eq(days_until("2025-01-01", date(2024, 12, 31)), 1)

@test("returns an int")
def _():
    check(type(days_until("2024-12-25", date(2024, 12, 1))) is int, "return a whole number of days, not a timedelta")

@test("impossible dates raise ValueError")
def _():
    raises(ValueError, days_until, "2024-02-30", date(2024, 1, 1))
```

```hint
`date.fromisoformat("2024-12-25")` parses the string, and it raises `ValueError` for dates that don't exist.
```

```hint
Subtracting two dates gives a `timedelta`. Its `.days` attribute is the whole number of days.
```
:::

:::challenge id=stdlib-csv-totals title="CSV totals" difficulty=medium
Write `totals_by_customer(csv_text)` that takes CSV text with a header row and returns a dict mapping each customer to their total quantity, as an `int`, with customers in order of first appearance.

The header names the columns `customer`, `item` and `qty`, but not necessarily in that order. Customer names may contain commas or quotes, so they arrive quoted, and the file may use Windows line endings.

```text
customer,item,qty
"Smith, Jane",tea,2
Li Wei,pie,1
"Smith, Jane",cake,3
```

```js
function totalsByCustomer(csvText) {
  const [, ...lines] = csvText.trim().split("\n");
  const totals = {};
  for (const line of lines) {
    const [customer, , qty] = line.split(",");   // breaks on "Smith, Jane"
    totals[customer] = (totals[customer] ?? 0) + Number(qty);
  }
  return totals;
}
```

```python starter
import csv
import io

def totals_by_customer(csv_text):
    ...
```

```python solution
import csv
import io
from collections import Counter

def totals_by_customer(csv_text):
    totals = Counter()
    for row in csv.DictReader(io.StringIO(csv_text)):
        totals[row["customer"]] += int(row["qty"])
    return dict(totals)
```

```python tests
ORDERS = 'customer,item,qty\n"Smith, Jane",tea,2\nLi Wei,pie,1\n"Smith, Jane",cake,3\n'

@test("sums the quantities per customer")
def _():
    eq(totals_by_customer(ORDERS), {"Smith, Jane": 5, "Li Wei": 1})

@test("keeps customers in order of first appearance")
def _():
    eq(list(totals_by_customer(ORDERS)), ["Smith, Jane", "Li Wei"])

@test("handles quotes inside quoted fields")
def _():
    text = 'customer,item,qty\n"Ada ""The Countess"" Lovelace",pie,4\n'
    eq(totals_by_customer(text), {'Ada "The Countess" Lovelace': 4})

@test("finds the columns by their header names")
def _():
    text = 'qty,customer,item\n2,Grace,tea\n5,Grace,cake\n'
    eq(totals_by_customer(text), {"Grace": 7})

@test("handles Windows line endings")
def _():
    eq(totals_by_customer("customer,item,qty\r\nLinus,tea,2\r\nLinus,pie,1\r\n"), {"Linus": 3})

@test("a header with no rows gives an empty dict")
def _():
    eq(totals_by_customer("customer,item,qty\n"), {})

@test("totals are ints")
def _():
    check(all(type(v) is int for v in totals_by_customer(ORDERS).values()), "convert qty with int()")
```

```hint
`csv.DictReader(io.StringIO(csv_text))` reads a string as if it were a file and yields one dict per row, keyed by the header.
```

```hint
Every CSV value is a string. Convert with `int(row["qty"])` before adding.
```

```hint
A `Counter()` (or `defaultdict(int)`) starts every customer at `0`, and it remembers insertion order. Return `dict(totals)`.
```
:::

:::challenge id=stdlib-with-params title="Add query parameters" difficulty=medium
Write `with_params(url, params)` that returns `url` with the parameters in the dict `params` merged into its query string, like setting values on `URLSearchParams`:

- A parameter that already exists gets its new value **in place**. New parameters go at the end.
- A value of `None` removes the parameter. When no parameters are left, there's no `?` at all.
- Values are converted with `str()`, and everything is encoded the way `urlencode` does it (spaces become `+`).
- Keep everything else: scheme, host, port, path, fragment, and existing parameters, even those with an empty value like `debug=`.

You can assume each parameter appears at most once.

```text
with_params("https://shop.example.com/search?q=boots&page=1", {"page": 2, "sort": "price"})
  ->  "https://shop.example.com/search?q=boots&page=2&sort=price"
```

```js
function withParams(url, params) {
  const u = new URL(url);
  for (const [key, value] of Object.entries(params)) {
    if (value === null) u.searchParams.delete(key);
    else u.searchParams.set(key, String(value));
  }
  return u.toString();
}
```

```python starter
from urllib.parse import parse_qsl, urlencode, urlsplit, urlunsplit

def with_params(url, params):
    ...
```

```python solution
from urllib.parse import parse_qsl, urlencode, urlsplit, urlunsplit

def with_params(url, params):
    parts = urlsplit(url)
    query = dict(parse_qsl(parts.query, keep_blank_values=True))
    for key, value in params.items():
        if value is None:
            query.pop(key, None)
        else:
            query[key] = str(value)
    return urlunsplit(parts._replace(query=urlencode(query)))
```

```python tests
BASE = "https://shop.example.com/search?q=boots&page=1"

@test("adds parameters to a URL without a query")
def _():
    eq(with_params("https://shop.example.com/search", {"q": "boots"}), "https://shop.example.com/search?q=boots")

@test("appends new parameters after the existing ones")
def _():
    eq(with_params(BASE, {"sort": "price"}), BASE + "&sort=price")

@test("replaces an existing parameter in place")
def _():
    eq(with_params(BASE, {"page": 2}), "https://shop.example.com/search?q=boots&page=2")

@test("None removes a parameter")
def _():
    eq(with_params(BASE, {"page": None}), "https://shop.example.com/search?q=boots")
    eq(with_params(BASE, {"page": None, "q": None}), "https://shop.example.com/search")

@test("encodes spaces and special characters")
def _():
    eq(with_params("https://x.io/s", {"q": "red shoes & socks"}), "https://x.io/s?q=red+shoes+%26+socks")

@test("keeps the port and the fragment")
def _():
    eq(with_params("https://x.io:8443/s?q=a#top", {"page": 2}), "https://x.io:8443/s?q=a&page=2#top")

@test("keeps existing parameters with empty values")
def _():
    eq(with_params("https://x.io/s?debug=&q=a", {"page": 1}), "https://x.io/s?debug=&q=a&page=1")
```

```hint
`urlsplit(url)` gives you a named tuple. `dict(parse_qsl(parts.query))` turns the query into an ordered dict you can update.
```

```hint
Updating an existing dict key keeps its position, and `query.pop(key, None)` removes a key without failing when it's absent.
```

```hint
`parse_qsl` silently drops `debug=` unless you pass `keep_blank_values=True`. To rebuild, use `urlunsplit(parts._replace(query=urlencode(query)))`.
```
:::

:::challenge id=stdlib-utc-timeline title="UTC timeline" difficulty=hard
Events arrive from several systems with ISO 8601 timestamps: some end in `Z`, some carry an offset like `+02:00`, and some legacy ones have no offset at all, which you should treat as UTC.

Write `utc_timeline(events)` that takes a list of `(name, timestamp)` pairs and returns them in chronological order as `(name, utc)` pairs, where `utc` is formatted like `"2024-06-01T10:30:00Z"`. Events at the same instant keep their input order. An unparseable timestamp should raise `ValueError`.

```text
utc_timeline([("deploy", "2024-06-01T12:30:00+02:00"), ("alert", "2024-06-01T10:00:00Z")])
  ->  [("alert", "2024-06-01T10:00:00Z"), ("deploy", "2024-06-01T10:30:00Z")]
```

```js
// Sorting the strings works... until the offsets differ.
const timeline = (events) =>
  events.toSorted(([, a], [, b]) => a.localeCompare(b));
```

```python starter
from datetime import datetime, timezone

def utc_timeline(events):
    return sorted(events, key=lambda event: event[1])
```

```python solution
from datetime import datetime, timezone

def to_utc(timestamp):
    moment = datetime.fromisoformat(timestamp)
    if moment.tzinfo is None:
        moment = moment.replace(tzinfo=timezone.utc)
    return moment.astimezone(timezone.utc)

def utc_timeline(events):
    converted = [(name, to_utc(timestamp)) for name, timestamp in events]
    converted.sort(key=lambda event: event[1])
    return [(name, moment.strftime("%Y-%m-%dT%H:%M:%SZ")) for name, moment in converted]
```

```python tests
@test("converts offsets to UTC")
def _():
    eq(utc_timeline([("deploy", "2024-06-01T12:30:00+02:00")]), [("deploy", "2024-06-01T10:30:00Z")])

@test("accepts the Z suffix")
def _():
    eq(utc_timeline([("alert", "2024-06-01T10:30:00Z")]), [("alert", "2024-06-01T10:30:00Z")])

@test("treats timestamps without an offset as UTC")
def _():
    eq(utc_timeline([("legacy", "2024-06-01T10:30:00")]), [("legacy", "2024-06-01T10:30:00Z")])

@test("sorts chronologically, not alphabetically")
def _():
    events = [("london", "2024-06-01T01:00:00+01:00"), ("tokyo", "2024-06-01T08:00:00+09:00")]
    eq(utc_timeline(events), [("tokyo", "2024-05-31T23:00:00Z"), ("london", "2024-06-01T00:00:00Z")])

@test("mixes naive and aware timestamps without a TypeError")
def _():
    events = [("b", "2024-06-01T10:00:00"), ("a", "2024-06-01T09:00:00Z"), ("c", "2024-06-01T13:00:00+02:00")]
    eq([name for name, _ in utc_timeline(events)], ["a", "b", "c"])

@test("events at the same instant keep their input order")
def _():
    events = [("second", "2024-06-01T10:00:00Z"), ("first", "2024-06-01T12:00:00+02:00")]
    eq([name for name, _ in utc_timeline(events)], ["second", "first"])

@test("no events, empty timeline")
def _():
    eq(utc_timeline([]), [])

@test("unparseable timestamps raise ValueError")
def _():
    raises(ValueError, utc_timeline, [("oops", "yesterday at noon")])
```

```hint
`datetime.fromisoformat` handles `Z` and offsets. A timestamp without an offset comes back naive, with `tzinfo` set to `None`.
```

```hint
Make every value aware before comparing: `moment.replace(tzinfo=timezone.utc)` for the naive ones, then `.astimezone(timezone.utc)` for all of them.
```

```hint
Sort with a `key=` that returns the datetime: Python's sort is stable, so ties keep their order. `isoformat()` writes `+00:00`, so format with `strftime("%Y-%m-%dT%H:%M:%SZ")`.
```
:::
