---
title: Logging & Debugging
part: Tools & Automation
summary: console.log grows up: named loggers, handlers and JSON logs, then pdb, tracebacks and warnings.
minutes: 40
---

In Node, logging starts as `console.log` and graduates to pino or winston once the app matters. Python ships the graduate in the standard library: `logging` has levels, named loggers, pluggable outputs and formatters, and every serious library already logs through it. The shift is in who does what. **Modules only ask for a logger by name. The application decides, once, at startup, what gets recorded and where it goes.**

[Batteries Included](lesson:standard-library#logging) showed the basics. This lesson goes deeper, then covers what to reach for when logs aren't enough: `breakpoint()`, tracebacks as data, and warnings.

## `console.log` → `logging`

:::compare
```js
import pino from "pino";

const log = pino({ level: "info" });

log.debug("cache miss");          // dropped: below info
log.info("server started");
log.warn("disk at 91%");
log.error("payment failed");
log.fatal("cannot bind port 80");
```
```python
import logging

log = logging.getLogger(__name__)
logging.basicConfig(level=logging.INFO)   # once, at startup

log.debug("cache miss")           # dropped: below INFO
log.info("server started")
log.warning("disk at 91%")
log.error("payment failed")
log.critical("cannot bind port 80")
```
:::

`logging.getLogger(name)` doesn't construct anything you own. It fetches the logger with that name from a process-wide registry, creating it on first use, so every `getLogger("shop.cart")` returns the same object. Passing `__name__` names the logger after the module's dotted import path, which gives you a tree of loggers that mirrors your packages ([more on that below](#the-logger-tree-and-propagation)). `basicConfig` sets up the **root** logger, the ancestor of all of them: a handler that writes to stderr, a format, and the level you pass.

Levels are integers. A logger without a level of its own uses its nearest ancestor's, and the root starts at `WARNING`. That's why `log.info(...)` prints nothing until something configures logging, the most common "where did my logs go?" in Python.

| console | pino / winston | logging | Value |
| --- | --- | --- | --- |
| `console.debug` | `debug` | `log.debug` | 10 |
| `console.info`, `console.log` | `info` | `log.info` | 20 |
| `console.warn` | `warn` | `log.warning` | 30 |
| `console.error` | `error` | `log.error` | 40 |
| | `fatal` (pino) | `log.critical` | 50 |

```python run
import logging

logging.basicConfig(
    level=logging.INFO,
    format="%(levelname)-8s %(name)s: %(message)s",
    force=True,   # replace any earlier configuration (see the note below)
)
log = logging.getLogger("shop.checkout")

log.debug("basket: %s", ["tea", "scones"])   # below INFO: dropped
log.info("order %s placed", 1042)
log.warning("stock low for %s", "tea")
print(logging.getLevelName(log.getEffectiveLevel()))
```

:::pythonic One line per module
In Node you'd create a logger in `logger.js` and import that instance everywhere. In Python, every module starts with the same line, `log = logging.getLogger(__name__)`, and nothing else: no shared instance to import, no logger passed through constructors. The registry hands each module its own named logger, and the configuration in `main()` reaches all of them.
:::

:::note Logging state outlives a run
Logging configuration is process-wide state, and the playground keeps one interpreter alive between runs, like a notebook. The snippets here reset it with `force=True` or by clearing a logger's handlers, so you can run them in any order. Log lines go to stderr unless a snippet sends them to `sys.stdout`.
:::

:::gotcha `logging.info()` configures logging behind your back
The module-level shortcuts, `logging.debug()` through `logging.critical()`, log to the root logger, and if the root has no handlers yet they call `basicConfig()` for you with the defaults. Your own `basicConfig(level=logging.DEBUG)` afterwards is a silent no-op, because `basicConfig` does nothing once the root has a handler. Configure first, log through named loggers, and pass `force=True` when you really do mean to reconfigure.
:::

:::tip `warn` is `warning`
`log.warn()` still works, but it's a deprecated alias, and ruff flags it as `G010`. Write `log.warning()`.
:::

## Pass arguments, don't pre-format

:::compare
```js
// pino also takes printf-style arguments
log.debug("loaded %d items for %s", items.length, user.id);

// built even when debug is disabled
log.debug(`loaded ${items.length} items for ${user.id}`);
```
```python
log.debug("loaded %d items for %s", len(items), user.id)


# built even when DEBUG is disabled
log.debug(f"loaded {len(items)} items for {user.id}")
```
:::

A logging call doesn't produce a string. It produces a `LogRecord` that keeps the template (`record.msg`) and the values (`record.args`) apart, and only a handler that actually emits the record merges them with `%` formatting, through `record.getMessage()`. With `%s` placeholders, a disabled `debug()` call costs almost nothing, error trackers such as Sentry can group events by the unmerged template, and a value whose `__str__` raises produces a `--- Logging error ---` report on stderr instead of crashing the request. An f-string throws all of that away, which is why ruff's `G004` flags f-strings in logging calls.

The arguments are lazy, but the expressions you write to compute them aren't. Guard expensive work with `isEnabledFor`:

```python run
import logging

logging.basicConfig(level=logging.INFO, force=True)
log = logging.getLogger("shop.lazy")

class Basket:
    def __str__(self):
        print("  ...rendering the basket (slow!)")
        return "Basket(42 items)"

log.debug("basket: %s", Basket())    # DEBUG is off: never rendered
log.debug(f"basket: {Basket()}")     # rendered, then thrown away

if log.isEnabledFor(logging.DEBUG):  # for work beyond formatting
    log.debug("checksum: %s", sum(range(100_000)))
```

:::gotcha `style="{"` doesn't change the call site
`logging.Formatter("{levelname} {message}", style="{")` lets the *format string* use `{}` fields, but message arguments are always merged with `%`. So `log.info("order {} placed", 1042)` doesn't raise at the call. The handler prints a `--- Logging error ---` report on stderr (`TypeError: not all arguments converted during string formatting`) instead of your message. Keep `%s` in log calls.
:::

:::quiz output
What does this print?

```python
import logging

calls = []

class Order:
    def __repr__(self):
        calls.append("repr")
        return "Order(1042)"

logging.basicConfig(level=logging.WARNING, force=True)
log = logging.getLogger("quiz.lazy")
log.debug("placing %r", Order())
log.debug(f"placing {Order()!r}")
print(len(calls))
```

- [ ] `0`
- [x] `1`
- [ ] `2`

Both records are below `WARNING`, so neither is emitted. The `%r` argument was stored unformatted and dropped with its record, but the f-string called `repr()` before `debug()` even ran.
:::

## Handlers and formatters

:::compare
```js
const log = winston.createLogger({
  level: "debug",
  transports: [
    new winston.transports.Console({
      level: "info",
      format: winston.format.simple(),
    }),
    new winston.transports.File({
      filename: "errors.log",
      level: "error",
    }),
  ],
});
```
```python
log = logging.getLogger("shop")
log.setLevel(logging.DEBUG)


console = logging.StreamHandler()      # stderr
console.setLevel(logging.INFO)
console.setFormatter(logging.Formatter("%(levelname)s %(message)s"))

errors = logging.FileHandler("errors.log", encoding="utf-8")
errors.setLevel(logging.ERROR)

log.addHandler(console)
log.addHandler(errors)
```
:::

A winston transport is a **handler**, and a winston format is a **formatter** attached to a handler. As in winston, levels exist at both layers: the logger's level decides whether a record is created at all, then each handler applies its own, so one record can reach the console but not the error file. The standard library ships the usual destinations in `logging` and `logging.handlers`: `StreamHandler`, `FileHandler`, `RotatingFileHandler` and `TimedRotatingFileHandler` (≈ winston-daily-rotate-file), `SysLogHandler`, `SMTPHandler`, `NullHandler`, and `QueueHandler`, which hands records to a `QueueListener` that does the slow I/O on a background thread.

`basicConfig(handlers=[...])` attaches ready-made handlers to the root logger, which keeps this demo safe to re-run:

```python run
import io
import logging
from pathlib import Path

screen = io.StringIO()
console = logging.StreamHandler(screen)
console.setLevel(logging.INFO)
console.setFormatter(logging.Formatter("%(levelname)-7s %(message)s"))

errors = logging.FileHandler("errors.log", mode="w", encoding="utf-8")
errors.setLevel(logging.ERROR)
errors.setFormatter(logging.Formatter("%(name)s, line %(lineno)d: %(message)s"))

logging.basicConfig(level=logging.DEBUG, handlers=[console, errors], force=True)
log = logging.getLogger("shop.payments")

log.debug("cache warmed")                     # below both handlers' levels
log.info("order %s placed", 1042)
log.error("card declined for order %s", 1042)
print(screen.getvalue(), end="")
print("errors.log:", Path("errors.log").read_text(encoding="utf-8"), end="")
```

The format string pulls fields from the record:

| Field | Example | Notes |
| --- | --- | --- |
| `%(asctime)s` | `2026-11-10 09:30:00,123` | shape it with `datefmt=` |
| `%(levelname)s` | `WARNING` | `%(levelname)-8s` pads to 8 characters |
| `%(name)s` | `shop.payments` | the logger's name |
| `%(message)s` | `order 1042 placed` | `msg` merged with `args` |
| `%(module)s`, `%(funcName)s`, `%(lineno)d` | `payments`, `charge`, `42` | where the call happened |
| `%(process)d`, `%(threadName)s`, `%(taskName)s` | `4242`, `MainThread`, `Task-3` | `taskName` is the asyncio task (3.12+) |

## Logging exceptions

:::compare
```js
try {
  await chargeCard(order);
} catch (err) {
  log.error({ err }, "payment failed");   // pino serialises err.stack
  throw err;
}
```
```python
try:
    charge_card(order)
except PaymentError:
    log.exception("payment failed")       # ERROR plus the traceback
    raise
```
:::

`log.exception(msg)` is `log.error(msg, exc_info=True)`. It belongs inside an `except` block, where it picks up the exception being handled and appends the full traceback to the record. Any level can carry a traceback: pass `exc_info=True`, or `exc_info=err` to hand over a specific exception. `stack_info=True` attaches the current call stack even without an exception, like `console.trace()`.

```python run
import logging

logging.basicConfig(level=logging.INFO, format="%(levelname)s %(message)s", force=True)
log = logging.getLogger("shop.import")

total = 0
for raw in ["3", "4O2", "7"]:
    try:
        total += int(raw)
    except ValueError:
        log.exception("skipping row %r", raw)
print("total:", total)
```

:::gotcha `log.error(err)` loses the traceback
Passing the exception as the message logs `str(err)` and nothing else: no type and no traceback. For a `KeyError` that's just `'sku'`. Use `log.exception("...")` inside the `except` block, or `exc_info=err` elsewhere. And log an exception once, where you handle it. Logging and re-raising at every layer prints the same traceback five times.
:::

## Context: `extra`, adapters and filters

:::compare
```js
const reqLog = log.child({ requestId: "r-81" });

reqLog.info("cart loaded");
// {"level":30,"requestId":"r-81","msg":"cart loaded"}
```
```python
req_log = logging.LoggerAdapter(log, {"request_id": "r-81"})

req_log.info("cart loaded")
# the record gains a request_id attribute; a formatter can show it
```
:::

Every key in `extra={...}` becomes an attribute of the `LogRecord`, so a format string can print it as `%(request_id)s` and a JSON formatter can serialise it. A `LoggerAdapter` wraps a logger and adds the same `extra` to every call, the closest thing to pino's `child()`. Two rules apply to `extra` fields. Keys can't collide with built-in record attributes: `extra={"name": "ada"}` raises `KeyError: "Attempt to overwrite 'name' in LogRecord"` at the call. And a format string that mentions a field breaks on records that lack it, unless the formatter has `defaults=` (3.10+):

```python run
import logging
import sys

handler = logging.StreamHandler(sys.stdout)
handler.setFormatter(logging.Formatter(
    "%(levelname)s [%(request_id)s] %(message)s", defaults={"request_id": "-"}
))
logging.basicConfig(level=logging.INFO, handlers=[handler], force=True)
log = logging.getLogger("shop.api")

log.info("startup")                                     # falls back to the default
log.info("cart loaded", extra={"request_id": "r-81"})
req_log = logging.LoggerAdapter(log, {"request_id": "r-82"})
req_log.warning("coupon %s expired", "SPRING")
req_log.info("checkout", extra={"request_id": "ignored!"})
```

:::gotcha An adapter's `extra` beats the call's
By default `LoggerAdapter` *replaces* the `extra` of each individual call with its own, as the last line above shows. Since 3.13, `LoggerAdapter(log, {...}, merge_extra=True)` merges the two, and the call's keys win.
:::

### Filters

A filter is the other hook: a callable (or a `logging.Filter` subclass) that receives each record and returns a false value to drop it. It may modify the record on the way through, and since 3.12 it may return a replacement record instead. That's where you add context the call site doesn't have, or redact secrets before they reach a file. A filter on a **handler** sees every record that reaches the handler, including ones propagated from child loggers. A filter on a **logger** sees only records logged on that exact logger, not ones propagating up from its children, so handlers are usually the right place.

Request ids are the classic case, kept in a `contextvars.ContextVar`, Python's `AsyncLocalStorage`:

```python run
import contextvars
import logging
import sys

request_id = contextvars.ContextVar("request_id", default="-")

def add_request_id(record):
    record.request_id = request_id.get()
    return True                        # keep every record

handler = logging.StreamHandler(sys.stdout)
handler.addFilter(add_request_id)
handler.setFormatter(logging.Formatter("[%(request_id)s] %(message)s"))
logging.basicConfig(level=logging.INFO, handlers=[handler], force=True)

log = logging.getLogger("shop.api")
log.info("startup")
request_id.set("r-81")                 # middleware would do this per request
log.info("cart loaded")
```

## The logger tree and propagation

:::compare
```js
// DEBUG=shop:db node app.js
import createDebug from "debug";

const debug = createDebug("shop:db");
debug("query took %dms", 12);
```
```python
import logging

log = logging.getLogger("shop.db")   # parent "shop", then the root
log.debug("query took %dms", 12)

# in main(): turn up one subtree, quiet a chatty library
logging.getLogger("shop.db").setLevel(logging.DEBUG)
logging.getLogger("urllib3").setLevel(logging.WARNING)
```
:::

Dots in logger names build a tree, much like the `debug` package's `shop:db` namespaces, and `__name__` makes it mirror your packages. The tree is how you tune noise: a level set on `shop.db` also applies to `shop.db.pool`, unless that logger sets its own. Each record then **propagates** up the tree. It's handed to the handlers of the logger it was logged on, then to its parent's, and so on up to the root.

The detail that surprises everyone: only the *originating* logger's level is checked. Once a record gets past it, every ancestor's handlers receive it, whatever level those ancestor loggers have. Only the handlers' own levels and filters can still drop it.

```python run
import logging
import sys

logging.basicConfig(level=logging.WARNING, stream=sys.stdout, force=True,
                    format="%(name)s %(levelname)s: %(message)s")
shop = logging.getLogger("tree.shop")
db = logging.getLogger("tree.shop.db")
db.setLevel(logging.DEBUG)                 # turn up one subtree

print(db.parent.name, logging.getLevelName(shop.getEffectiveLevel()))
db.debug("query took %dms", 12)            # passes db's level, reaches the root's handler
shop.info("cart cached")                   # shop inherits WARNING from the root: dropped
```

:::gotcha Duplicate lines
If a child logger has a handler and the root has one too, every record from the child is written twice, once by each, because of propagation. Attach handlers to the root only, which is what `basicConfig` and `dictConfig` do, or set `propagate = False` on a logger that owns its handlers. The other way to double your output is calling `addHandler` again on a logger that already has one: a `get_logger()` helper called from every module, a notebook cell run twice, or a test that configures logging in `setUp`.
:::

:::tip Libraries get a `NullHandler` and nothing else
A library calls `logging.getLogger(__name__)`, logs, and never configures. The convention is one line in the package's `__init__.py`, `logging.getLogger(__name__).addHandler(logging.NullHandler())`, which stops Python's last-resort handler from printing the library's warnings when the application hasn't set up logging. Levels, formats and destinations are the application's decisions.
:::

:::quiz output
What does this print?

```python
import logging
import sys

logging.basicConfig(level=logging.ERROR, stream=sys.stdout, format="%(message)s", force=True)
db = logging.getLogger("warehouse.db")
db.setLevel(logging.INFO)
db.info("slow query")
```

- [x] `slow query`
- [ ] Nothing, because the root logger's level is `ERROR`
- [ ] `INFO:warehouse.db:slow query`
- [ ] `ValueError`

`db`'s own level, `INFO`, lets the record through, and propagation hands it to the root's handler without checking the root *logger's* level. Handler levels are what filter propagated records: `logging.getLogger().handlers[0].setLevel(logging.ERROR)` would have dropped it.
:::

## `dictConfig` and JSON logs

:::compare
```js
const log = winston.createLogger({
  level: process.env.LOG_LEVEL ?? "info",
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.json(),
  ),
  transports: [new winston.transports.Console()],
});
```
```python
logging.config.dictConfig({
    "version": 1,
    "disable_existing_loggers": False,
    "formatters": {"plain": {"format": "%(levelname)s %(name)s: %(message)s"}},
    "handlers": {"console": {"class": "logging.StreamHandler", "formatter": "plain"}},
    "loggers": {"shop.db": {"level": "WARNING"}},
    "root": {"level": os.environ.get("LOG_LEVEL", "INFO"), "handlers": ["console"]},
})
```
:::

`logging.config.dictConfig` takes the whole setup as data: formatters, filters and handlers by name, then the loggers that use them. Projects keep that dict in a module, or load it from TOML, YAML or JSON, and apply it once in `main()`. Strings such as `"logging.StreamHandler"` are import paths, `"ext://sys.stdout"` refers to an existing object, and a `"()"` key supplies a factory, which is how you plug in a formatter class of your own.

:::gotcha `disable_existing_loggers` defaults to `True`
`dictConfig`, like the older INI-based `fileConfig`, **disables every logger that already exists**, unless the config names it or one of its ancestors. Modules create their logger at import time, usually before `main()` configures anything, so with the default their records silently vanish. Always write `"disable_existing_loggers": False`.
:::

pino writes JSON lines out of the box. In Python you write a small formatter, or reach for `python-json-logger` or `structlog`:

```python run
import json
import logging.config

class JsonFormatter(logging.Formatter):
    def format(self, record):
        entry = {"level": record.levelname, "logger": record.name, "msg": record.getMessage()}
        if record.exc_info:
            entry["exc"] = self.formatException(record.exc_info)
        return json.dumps(entry)

logging.config.dictConfig({
    "version": 1,
    "disable_existing_loggers": False,
    "formatters": {"json": {"()": JsonFormatter}},
    "handlers": {"stdout": {"class": "logging.StreamHandler", "formatter": "json",
                            "stream": "ext://sys.stdout"}},
    "loggers": {"shop.audit": {"level": "WARNING"}},
    "root": {"level": "INFO", "handlers": ["stdout"]},
})
log = logging.getLogger("shop.api")
log.info("order %s placed", 1042)
logging.getLogger("shop.audit").info("login ok")     # below shop.audit's level
try:
    {}["sku"]
except KeyError:
    log.exception("lookup failed")
```

:::tip Beyond the standard library
`structlog` adds pino-style bound context and JSON rendering, and can sit on top of `logging`. `rich` provides a `RichHandler` for colourful console output. Both plug into the same logger tree, so everything above still applies.
:::

## `breakpoint()` and pdb

:::compare
```js
function applyDiscount(cart) {
  debugger;          // pauses when DevTools or --inspect is attached
  return cart.total * 0.9;
}

// node --inspect-brk app.js
```
```python
def apply_discount(cart):
    breakpoint()     # always stops, in pdb, right in the terminal
    return cart.total * 0.9


# python -m pdb app.py
```
:::

`breakpoint()` (3.7+) calls `sys.breakpointhook()`, which starts **pdb**, the standard library's debugger, at that line. Unlike `debugger;` it doesn't wait for a client to attach: the program stops and your terminal becomes a debugger prompt with the paused frame's variables in scope. `PYTHONBREAKPOINT=0` turns every `breakpoint()` into a no-op, and `PYTHONBREAKPOINT=ipdb.set_trace` swaps in another debugger. IDE debuggers, such as VS Code's debugpy, stop on `breakpoint()` too. The sandbox has no interactive terminal, so the pdb examples are static: try them in a local `python`.

| pdb | DevTools | What it does |
| --- | --- | --- |
| `n` (next) | Step over | run the current line |
| `s` (step) | Step into | stop inside the next call |
| `r` (return) | Step out | run until the current function returns |
| `c` (continue) | Resume | run to the next breakpoint |
| `unt` (until) | | run until a later line, e.g. past the end of a loop |
| `l`, `ll` | Sources panel | list code around the line, or the whole function |
| `p expr`, `pp expr` | Console, hover | print or pretty-print an expression |
| `w` (where) | Call stack | show the stack |
| `u`, `d` | select a frame | move up or down the stack |
| `b app.py:42`, `b 42, qty > 10` | gutter click | set a breakpoint, optionally with a condition |
| `display expr` | Watch | re-print the expression whenever it changes |
| `interact` | Console | a full REPL in the current frame |
| `q` | stop | quit |

```bash
python -m pdb app.py            # start under pdb; after `c`, a crash stops at the failing line
python -i app.py                # after a crash, stay in the REPL: import pdb; pdb.pm()
python -m pdb -p 12345          # 3.14+: attach to a running process
PYTHONBREAKPOINT=0 python app.py
```

:::gotcha Your variable is called `c`
At the `(Pdb)` prompt a bare word is tried as a command first, so `c` continues, `n` steps and `l` lists, even when your code has a variable with that name. Print it with `p c`, or prefix a statement with `!` to run it as Python: `!c = 0`.
:::

:::tip Don't commit the breakpoint
ruff's `T100` flags `breakpoint()`, `pdb.set_trace()` and `import pdb`, so a forgotten one fails CI instead of freezing a server.
:::

### Quick looks: `f"{x=}"` and `pprint`

Most debugging is still printing, and Python has two upgrades on `console.log`.

:::compare
```js
console.log({ total, user });        // { total: 15, user: 'ada' }
console.dir(order, { depth: null });
console.log(util.inspect(order, { depth: 0 }));
```
```python
print(f"{total=} {user=}")           # total=15.0 user='ada'
pprint.pp(order)
pprint.pp(order, depth=1)
```
:::

A trailing `=` in an f-string prints the expression's text, then its value. The value uses `repr()` by default, hence the quotes around strings. Add a format spec (`{total=:.2f}`) or a conversion (`{user=!s}`) to change that, and any spaces around the `=` are kept. `pprint.pp` wraps nested data at `width` characters (80 by default) and keeps dicts in insertion order. `pprint.pformat` returns the text as a string, ready to pass to a log call, but it sorts dict keys unless you add `sort_dicts=False`.

```python run
from pprint import pp

order = {"id": 1042, "user": "ada", "meta": {"source": "web", "coupon": None},
         "lines": [{"sku": "TEA-01", "qty": 2, "price": 4.5},
                   {"sku": "SCN-12", "qty": 6, "price": 1.25}]}
total = sum(line["qty"] * line["price"] for line in order["lines"])

print(f"{total=}")
print(f"{total = :.2f}")
print(f"{order['user']=} {len(order['lines'])=}")
pp(order, width=60)
pp(order, depth=1)
```

:::quiz output
What does this print?

```python
user = "ada"
print(f"{user=}")
```

- [ ] `user=ada`
- [x] `user='ada'`
- [ ] `ada`
- [ ] `{'user': 'ada'}`

With `=`, the value is shown with `repr()` unless you add a conversion or a format spec: `f"{user=!s}"` prints `user=ada`.
:::

## Tracebacks as data

:::compare
```js
try {
  loadConfig();
} catch (err) {
  err.stack;      // one big string
  err.cause;      // set by new Error(msg, { cause })
  report(err.stack.split("\n").slice(1, 4));
}
```
```python
try:
    load_config()
except Exception as err:
    traceback.format_exception(err)   # list of strings, causes included
    err.__cause__                     # set by raise ... from err
    report(traceback.extract_tb(err.__traceback__)[-3:])
```
:::

A Python exception carries its traceback as an object, `err.__traceback__`, and the `traceback` module turns it into text or data. `format_exc()` works inside an `except` block, `print_exception(err)` and `format_exception(err)` work anywhere (3.10+ accept the exception alone), and `format_exception_only(err)` gives just the final line, plus any notes. `extract_tb(tb)` returns `FrameSummary` objects with `filename`, `lineno`, `name` and `line` attributes, so there's no stack string to parse.

```python run
import traceback

def load_port(config):
    try:
        return int(config["port"])
    except KeyError as err:
        raise RuntimeError("config has no port") from err

try:
    load_port({"host": "localhost"})
except RuntimeError as exc:
    for frame in traceback.extract_tb(exc.__traceback__):
        print(f"{frame.filename}:{frame.lineno} in {frame.name}: {frame.line}")
    print(traceback.format_exception_only(exc))
    print(repr(exc.__cause__))
```

### Reading chained tracebacks

When one exception leads to another, Python prints every exception in the chain, oldest first, separated by one of two sentences:

- **"The above exception was the direct cause of the following exception:"** Someone wrote `raise New(...) from err`. Read it as "caused by".
- **"During handling of the above exception, another exception occurred:"** An `except` or `finally` block raised a new exception without `from`. Often that's a bug in the error handling itself, and the first block is still the real problem.

Either way, the **last** block is the exception that propagated, the one an outer `except` sees. That's the reverse of Node, which prints the outer error first and nests its `[cause]` underneath. `raise ... from None` hides the earlier block (see [Errors & Exceptions](lesson:exceptions#re-raising-and-chaining)).

```python run raises
def parse_qty(raw):
    try:
        return int(raw)
    except ValueError:
        return int(raw.removesuffix("pcs"))   # the fallback fails too

parse_qty("4O2pcs")
```

:::quiz
A traceback has two blocks separated by "During handling of the above exception, another exception occurred:". The first block ends in `KeyError: 'port'` and the second in a `TypeError`. What happened?

- [x] An `except KeyError` block raised a `TypeError` while handling the missing key
- [ ] The code ran `raise TypeError(...) from err`
- [ ] Two unrelated errors happened, and Python printed them in a random order
- [ ] The `KeyError` is the exception that reached the caller

"During handling" means a new exception escaped an `except` (or `finally`) block, and the original became its `__context__`. `raise ... from` prints "direct cause" instead. Either way, the last block propagated, so the caller sees the `TypeError`.
:::

### Uncaught exceptions: `sys.excepthook`

`process.on("uncaughtException")` becomes `sys.excepthook`, which Python calls with the exception's type, value and traceback just before an unhandled exception ends the program. Unlike the Node handler, it doesn't keep the process alive. Routing it into logging puts crashes in the same place as everything else:

```python
import logging
import sys

log = logging.getLogger("app")

def log_uncaught(exc_type, exc, tb):
    if issubclass(exc_type, KeyboardInterrupt):
        sys.__excepthook__(exc_type, exc, tb)    # let Ctrl+C print as usual
        return
    log.critical("uncaught exception", exc_info=(exc_type, exc, tb))

sys.excepthook = log_uncaught
```

Threads have their own hook, `threading.excepthook`, and asyncio uses `loop.set_exception_handler()`. The playground reports errors itself and never calls the hook, so try this one locally.

## Warnings

:::compare
```js
import { deprecate } from "node:util";

export const oldTotal = deprecate(
  (prices) => total(prices),
  "oldTotal() is deprecated; use total()",
);

// node --throw-deprecation app.js   -> errors
// node --no-deprecation app.js      -> silence
```
```python
import warnings


def old_total(prices):
    warnings.warn("old_total() is deprecated; use total()",
                  DeprecationWarning, stacklevel=2)
    return total(prices)


# python -W error::DeprecationWarning app.py
# python -W ignore::DeprecationWarning app.py
```
:::

A warning reports code that works but shouldn't be relied on. `warnings.warn` prints it to stderr with the file and line it blames, by default only once per location. The category decides who sees it. `UserWarning` (the default) and `FutureWarning` are shown by default. `DeprecationWarning` is aimed at developers and stays hidden unless the line it blames is in `__main__`, meaning your script rather than a library. `stacklevel=2` blames the *caller* of `old_total` instead of the line inside it, which is what moves a library's warning into your code, where you can see it. Writing deprecations of your own, including `@warnings.deprecated` (3.13+), is covered in [Designing Pythonic APIs](lesson:pythonic-api-design).

```python run
import importlib
import sys
from pathlib import Path

Path("pricing.py").write_text('''
import warnings

def old_total(prices):
    warnings.warn("old_total() is deprecated", DeprecationWarning)
    return sum(prices)

def old_tax(amount):
    warnings.warn("old_tax() is deprecated", DeprecationWarning, stacklevel=2)
    return amount * 0.2
''', encoding="utf-8")
sys.modules.pop("pricing", None)
importlib.invalidate_caches()
import pricing

print(pricing.old_total([1, 2]))   # blamed on pricing.py, a library: hidden
print(pricing.old_tax(10))         # blamed on this line, in __main__: shown
```

You choose what happens to warnings with filters:

- On the command line, `-W error::DeprecationWarning` turns them into exceptions and `-W ignore::DeprecationWarning` silences them. `PYTHONWARNINGS` takes the same syntax.
- `python -X dev` (development mode) shows `DeprecationWarning` and `ResourceWarning` everywhere and switches on extra runtime checks.
- unittest and pytest show deprecations while tests run, and pytest's `filterwarnings = ["error"]` setting turns any warning into a test failure.
- In code, `warnings.filterwarnings(...)` changes the filters for the whole process, while `with warnings.catch_warnings():` scopes the change to a block.
- `logging.captureWarnings(True)` routes warnings into the `py.warnings` logger, so they end up wherever your logs go.

```python run
import warnings

def legacy_rate():
    warnings.warn("legacy_rate() is deprecated", DeprecationWarning, stacklevel=2)
    return 0.2

with warnings.catch_warnings(record=True) as caught:
    warnings.simplefilter("always")          # record every call, not just the first
    legacy_rate()
    legacy_rate()
print([f"{w.category.__name__}: {w.message}" for w in caught])

with warnings.catch_warnings(action="error"):   # 3.11+: warnings raise
    try:
        legacy_rate()
    except DeprecationWarning as err:
        print("raised:", err)
```

:::gotcha Nobody sees your library's deprecations
Outside `__main__`, a `DeprecationWarning` is invisible by default. The app that imports your library shows nothing, and neither does the app that imports *that*. Deprecations surface under test runners, under `-X dev` and with `-W`. Run CI with warnings as errors, so you hear about a deprecation before the removal does.
:::

:::quiz output
What does this print?

```python
import warnings

with warnings.catch_warnings(record=True) as caught:
    warnings.simplefilter("default")
    for _ in range(3):
        warnings.warn("old API", DeprecationWarning)
print(len(caught))
```

- [x] `1`
- [ ] `3`
- [ ] `0`

The `"default"` action shows a warning once per location, meaning module and line number, and all three calls come from the same line. `"always"` would record three, and `"ignore"` none.
:::

## Cheat sheet

| JavaScript | Python | Notes |
| --- | --- | --- |
| `pino()`, `winston.createLogger()` | `log = logging.getLogger(__name__)` | one per module, from a registry |
| `{ level: "info" }` | `logging.basicConfig(level=logging.INFO)` | once, in `main()`; the root starts at `WARNING` |
| `log.warn(msg)` | `log.warning(msg)` | `warn` is a deprecated alias |
| `log.fatal(msg)` | `log.critical(msg)` | |
| `` log.debug(`n=${n}`) `` | `log.debug("n=%s", n)` | lazy; f-strings are eager |
| `log.error({ err }, msg)` | `log.exception(msg)` | inside `except`; adds the traceback |
| `log.child({ reqId })` | `LoggerAdapter(log, {"req_id": ...})` | or `extra={...}` per call |
| transports | handlers | `StreamHandler`, `FileHandler`, `RotatingFileHandler` |
| formats | `logging.Formatter("%(levelname)s %(message)s")` | `defaults=` for optional fields |
| `DEBUG=shop:db` | `getLogger("shop.db").setLevel(logging.DEBUG)` | levels per subtree |
| logger config object | `logging.config.dictConfig({...})` | set `disable_existing_loggers: False` |
| pino's JSON lines | a `Formatter` subclass, or structlog | |
| `debugger;` | `breakpoint()` | pdb; `PYTHONBREAKPOINT=0` disables it |
| `node --inspect-brk app.js` | `python -m pdb app.py` | `-p PID` attaches (3.14+) |
| `console.log({ x })` | `print(f"{x=}")` | shows `repr()` |
| `console.dir(obj, { depth })` | `pprint.pp(obj, depth=...)` | `pformat` returns a string |
| `err.stack` | `traceback.format_exception(err)` | `extract_tb` for frame objects |
| `new Error(msg, { cause })` | `raise Error(msg) from err` | cause printed first |
| `process.on("uncaughtException")` | `sys.excepthook` | doesn't keep the process alive |
| `util.deprecate(fn, msg)` | `warnings.warn(msg, DeprecationWarning, stacklevel=2)` | `@warnings.deprecated` (3.13+) |
| `--throw-deprecation` | `-W error::DeprecationWarning` | or pytest's `filterwarnings` |

## Challenges

:::challenge id=logging-counting-handler title="Count the records" difficulty=easy
Write `CountingHandler`, a subclass of `logging.Handler`, that counts the records it handles per level name. Its `counts` attribute maps level names to counts, like `{"INFO": 2, "ERROR": 1}`, and starts out empty.

- Override `emit(record)`. Logging calls it only for records that have passed the handler's level and filters.
- Accept the same `level` argument as `logging.Handler`, so `CountingHandler(level=logging.WARNING)` ignores `INFO` records.
- Every handler keeps its own counts, and it prints nothing.

A handler like this is handy in tests: attach it, run the code, then assert on what was logged.

```js
import Transport from "winston-transport";

class CountingTransport extends Transport {
  counts = {};
  log(info, callback) {
    this.counts[info.level] = (this.counts[info.level] ?? 0) + 1;
    callback();
  }
}
```

```python starter
import logging


class CountingHandler(logging.Handler):
    ...
```

```python solution
import logging
from collections import Counter


class CountingHandler(logging.Handler):
    def __init__(self, level=logging.NOTSET):
        super().__init__(level)
        self.counts = Counter()

    def emit(self, record):
        self.counts[record.levelname] += 1
```

```python tests
import contextlib
import io
import logging


@contextlib.contextmanager
def logger_with(handler, name):
    log = logging.getLogger(f"tests.counting.{name}")
    log.setLevel(logging.DEBUG)
    log.propagate = False
    log.addHandler(handler)
    try:
        yield log
    finally:
        log.removeHandler(handler)


@test("starts with empty counts")
def _():
    eq(dict(CountingHandler().counts), {})


@test("counts records per level name")
def _():
    handler = CountingHandler()
    with logger_with(handler, "levels") as log:
        log.info("one")
        log.info("two")
        log.error("three")
    eq(dict(handler.counts), {"INFO": 2, "ERROR": 1})


@test("respects the handler's own level")
def _():
    handler = CountingHandler(level=logging.WARNING)
    with logger_with(handler, "level") as log:
        log.debug("dropped")
        log.info("dropped")
        log.warning("kept")
        log.critical("kept")
    eq(dict(handler.counts), {"WARNING": 1, "CRITICAL": 1})


@test("each handler keeps its own counts")
def _():
    first, second = CountingHandler(), CountingHandler()
    with logger_with(first, "first") as log:
        log.info("only the first handler sees this")
    eq(dict(second.counts), {}, "a dict created in the class body is shared by every instance")


@test("prints nothing")
def _():
    out, err = io.StringIO(), io.StringIO()
    handler = CountingHandler()
    with (
        contextlib.redirect_stdout(out),
        contextlib.redirect_stderr(err),
        logger_with(handler, "quiet") as log,
    ):
        log.warning("shh")
    eq(out.getvalue() + err.getvalue(), "", "emit() should count, not print")
```

```hint
`logging.Handler.__init__` takes the level. Call `super().__init__(level)` first, then create your counts.
```

```hint
Create `self.counts` inside `__init__`, not in the class body: a class attribute is one dict shared by every handler. `collections.Counter` turns the increment into one line.
```

```hint
`emit` receives a `LogRecord`, and `record.levelname` is the name to count.
```
:::

:::challenge id=logging-log-calls title="A call-logging decorator" difficulty=medium
Write a decorator factory `log_calls(logger)`. Every call of a decorated function logs two DEBUG records through `logger`:

- before the call, `calling add(2, 3)`: the function's name, then the arguments as you'd type them, with `repr()` for each value and keyword arguments as `key=value`;
- after it, `add returned 5`, with the result's `repr()`.

If the function raises, log `add failed` with `logger.exception()` (ERROR, plus the traceback) and re-raise the original exception.

```text
@log_calls(log)
def add(a, b):
    return a + b

add(2, 3)      # DEBUG calling add(2, 3)
               # DEBUG add returned 5
add(2, b=3)    # DEBUG calling add(2, b=3)
```

Two logging idioms are part of the spec:

- Pass values as logging arguments, `logger.debug("calling %s(%s)", ...)`, never pre-formatted strings. The tests look at `record.args`.
- When DEBUG is disabled, don't build the argument text at all. Calling `repr()` on a large argument is exactly the work lazy logging is meant to save, so check `logger.isEnabledFor(logging.DEBUG)` first.

Keep the decorated function's name and docstring.

```js
const logCalls = (log) => (fn) => function (...args) {
  log.debug(`calling ${fn.name}(${args.map((a) => JSON.stringify(a)).join(", ")})`);
  try {
    const result = fn.apply(this, args);
    log.debug(`${fn.name} returned ${JSON.stringify(result)}`);
    return result;
  } catch (err) {
    log.error({ err }, `${fn.name} failed`);
    throw err;
  }
};
```

```python starter
import functools
import logging


def log_calls(logger):
    def decorator(fn):
        ...

    return decorator
```

```python solution
import functools
import logging


def log_calls(logger):
    def decorator(fn):
        @functools.wraps(fn)
        def wrapper(*args, **kwargs):
            if logger.isEnabledFor(logging.DEBUG):
                rendered = [repr(arg) for arg in args]
                rendered += [f"{key}={value!r}" for key, value in kwargs.items()]
                logger.debug("calling %s(%s)", fn.__name__, ", ".join(rendered))
            try:
                result = fn(*args, **kwargs)
            except Exception:
                logger.exception("%s failed", fn.__name__)
                raise
            logger.debug("%s returned %r", fn.__name__, result)
            return result

        return wrapper

    return decorator
```

```python tests
import logging


class ListHandler(logging.Handler):
    def __init__(self):
        super().__init__()
        self.records = []

    def emit(self, record):
        self.records.append(record)


def make_logger(name, level=logging.DEBUG):
    log = logging.getLogger(f"tests.log_calls.{name}")
    log.setLevel(level)
    log.propagate = False
    log.handlers.clear()
    handler = ListHandler()
    log.addHandler(handler)
    return log, handler.records


@test("returns the function's result")
def _():
    log, _records = make_logger("result")

    @log_calls(log)
    def add(a, b):
        return a + b

    eq(add(2, 3), 5)


@test("logs the call and the result at DEBUG")
def _():
    log, records = make_logger("messages")

    @log_calls(log)
    def add(a, b):
        return a + b

    add(2, 3)
    eq([r.getMessage() for r in records], ["calling add(2, 3)", "add returned 5"])
    eq([r.levelname for r in records], ["DEBUG", "DEBUG"])


@test("renders values with repr() and keywords as key=value")
def _():
    log, records = make_logger("kwargs")

    @log_calls(log)
    def greet(name, punctuation="!"):
        return f"Hello, {name}{punctuation}"

    greet("ada", punctuation="?")
    eq(records[0].getMessage(), "calling greet('ada', punctuation='?')")
    eq(records[1].getMessage(), "greet returned 'Hello, ada?'")


@test("handles a call without arguments")
def _():
    log, records = make_logger("no_args")

    @log_calls(log)
    def ping():
        return None

    ping()
    eq([r.getMessage() for r in records], ["calling ping()", "ping returned None"])


@test("logs failures with the traceback and re-raises")
def _():
    log, records = make_logger("failure")

    @log_calls(log)
    def ratio(a, b):
        return a / b

    raises(ZeroDivisionError, ratio, 1, 0)
    check(records, "nothing was logged")
    eq(records[-1].getMessage(), "ratio failed")
    eq(records[-1].levelname, "ERROR")
    check(
        records[-1].exc_info and records[-1].exc_info[0] is ZeroDivisionError,
        "use logger.exception() so the record carries the traceback",
    )


@test("passes values as logging arguments, not pre-formatted strings")
def _():
    log, records = make_logger("lazy")

    @log_calls(log)
    def add(a, b):
        return a + b

    add(2, 3)
    check(
        records and all(r.args for r in records),
        "write logger.debug('calling %s(%s)', name, text), not logger.debug(f'...')",
    )


@test("doesn't render arguments when DEBUG is disabled")
def _():
    log, records = make_logger("disabled", level=logging.INFO)
    renders = []

    class Spy:
        def __repr__(self):
            renders.append(1)
            return "Spy()"

    @log_calls(log)
    def identity(x):
        return x

    spy = Spy()
    check(identity(spy) is spy, "return the function's result unchanged")
    eq(records, [], "nothing should be logged at INFO")
    eq(len(renders), 0, "check logger.isEnabledFor(logging.DEBUG) before building the argument text")


@test("keeps the function's name and docstring")
def _():
    log, _records = make_logger("wraps")

    @log_calls(log)
    def add(a, b):
        """Add two numbers."""
        return a + b

    eq(add.__name__, "add")
    eq(add.__doc__, "Add two numbers.")
```

```hint
It's three functions deep: `log_calls(logger)` returns `decorator(fn)`, which returns `wrapper(*args, **kwargs)`. Put `@functools.wraps(fn)` on the wrapper.
```

```hint
Build the argument text from `repr(arg)` for each positional argument and `f"{key}={value!r}"` for each keyword argument, joined with `", "`, and only inside `if logger.isEnabledFor(logging.DEBUG):`. The result can go straight in as an argument, `logger.debug("%s returned %r", fn.__name__, result)`, because `%r` is only rendered if the record is emitted.
```

```hint
Wrap the call in `try`/`except Exception:`, call `logger.exception("%s failed", fn.__name__)`, then re-raise with a bare `raise`.
```
:::

:::challenge id=logging-json-formatter title="JSON lines, pino-style" difficulty=hard
Write `JsonFormatter`, a `logging.Formatter` subclass whose `format(record)` returns **one line** of JSON with these keys, in this order:

1. `"level"`: the level name;
2. `"logger"`: the logger's name;
3. `"message"`: the message merged with its arguments;
4. every field passed with `extra=`, meaning any attribute that a plain `LogRecord` doesn't have;
5. `"exc"`: the formatted traceback, only when the record carries exception info.

Write values that JSON can't represent, such as dates and `Decimal`s, as `str(value)`.

```text
log.info("order %s placed", 1042, extra={"user": "ada"})
{"level": "INFO", "logger": "shop", "message": "order 1042 placed", "user": "ada"}
```

A real formatter would add a timestamp from `record.created`. Leave it out so the tests stay deterministic. One more detail: a record may already have passed through another handler's formatter, which leaves `message` and `asctime` attributes on it. Those aren't extras.

```js
// What pino does for every record
function toJsonLine({ level, name, msg, err, ...extra }) {
  return JSON.stringify({
    level, logger: name, message: msg, ...extra,
    ...(err && { exc: err.stack }),
  });
}
```

```python starter
import json
import logging


class JsonFormatter(logging.Formatter):
    def format(self, record):
        return json.dumps({"level": record.levelname, "message": record.msg})
```

```python solution
import json
import logging

# Attributes every LogRecord has, plus the two that Formatter.format() adds.
STANDARD_ATTRS = set(vars(logging.makeLogRecord({}))) | {"message", "asctime"}


class JsonFormatter(logging.Formatter):
    def format(self, record):
        extras = {k: v for k, v in vars(record).items() if k not in STANDARD_ATTRS}
        entry = {
            "level": record.levelname,
            "logger": record.name,
            "message": record.getMessage(),
            **extras,
        }
        if record.exc_info:
            entry["exc"] = self.formatException(record.exc_info)
        return json.dumps(entry, default=str)
```

```python tests
import io
import json
import logging
from datetime import date
from decimal import Decimal


def capture(emit):
    """Run emit(log) with a JsonFormatter handler attached and return the output lines."""
    stream = io.StringIO()
    handler = logging.StreamHandler(stream)
    handler.setFormatter(JsonFormatter())
    log = logging.getLogger("tests.json.shop")
    log.setLevel(logging.DEBUG)
    log.propagate = False
    log.addHandler(handler)
    try:
        emit(log)
    finally:
        log.removeHandler(handler)
    return stream.getvalue().splitlines()


@test("writes level, logger and message")
def _():
    lines = capture(lambda log: log.warning("disk almost full"))
    eq(json.loads(lines[0]), {"level": "WARNING", "logger": "tests.json.shop", "message": "disk almost full"})


@test("merges the message with its arguments")
def _():
    lines = capture(lambda log: log.info("order %s placed by %s", 1042, "ada"))
    eq(json.loads(lines[0])["message"], "order 1042 placed by ada")


@test("adds extra fields after the standard keys")
def _():
    lines = capture(lambda log: log.info("login", extra={"user": "ada", "attempt": 2}))
    entry = json.loads(lines[0])
    eq(entry, {"level": "INFO", "logger": "tests.json.shop", "message": "login", "user": "ada", "attempt": 2})
    eq(list(entry), ["level", "logger", "message", "user", "attempt"], "key order")


@test("writes values JSON can't represent with str()")
def _():
    lines = capture(lambda log: log.info("invoice", extra={"due": date(2030, 1, 31), "amount": Decimal("9.99")}))
    entry = json.loads(lines[0])
    eq(entry["due"], "2030-01-31")
    eq(entry["amount"], "9.99")


@test("adds the traceback under \"exc\" when there is one")
def _():
    def emit(log):
        try:
            1 / 0
        except ZeroDivisionError:
            log.exception("ratio failed")

    entry = json.loads(capture(emit)[0])
    eq(list(entry), ["level", "logger", "message", "exc"])
    check(entry["exc"].startswith("Traceback (most recent call last):"), "use self.formatException(record.exc_info)")
    check(entry["exc"].endswith("ZeroDivisionError: division by zero"), "the traceback should end with the exception line")


@test("leaves out \"exc\" when there's no exception")
def _():
    entry = json.loads(capture(lambda log: log.error("plain error"))[0])
    check("exc" not in entry, "only add \"exc\" when record.exc_info is set")


@test("writes one line per record, even with a traceback")
def _():
    def emit(log):
        try:
            {}["sku"]
        except KeyError:
            log.exception("lookup failed")
        log.info("next")

    eq(len(capture(emit)), 2, "json.dumps escapes the newlines inside strings, so keep it on one line")


@test("ignores attributes that other formatters leave behind")
def _():
    record = logging.makeLogRecord(
        {"name": "shop", "levelname": "INFO", "levelno": logging.INFO, "msg": "hi %s", "args": ("ada",)}
    )
    logging.Formatter("%(asctime)s %(message)s").format(record)   # sets record.asctime and record.message
    eq(json.loads(JsonFormatter().format(record)), {"level": "INFO", "logger": "shop", "message": "hi ada"})
```

```hint
`record.getMessage()` merges `record.msg` with `record.args`. `record.msg` on its own is the unformatted template.
```

```hint
Extras are plain attributes on the record. Collect the names a blank record has with `set(vars(logging.makeLogRecord({})))`, add `"message"` and `"asctime"`, and keep every item of `vars(record)` whose key isn't in that set. Don't type the list out by hand: it changes between versions (3.12 added `taskName`).
```

```hint
`self.formatException(record.exc_info)` renders the traceback, and `json.dumps(entry, default=str)` takes care of dates and decimals.
```
:::
