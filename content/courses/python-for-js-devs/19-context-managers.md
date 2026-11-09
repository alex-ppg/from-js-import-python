---
title: Context Managers & with
part: Robust Code
summary: with blocks guarantee cleanup. Files, locks and temporary state, plus writing managers of your own.
minutes: 30
---

`with` is Python's `try`/`finally` packaged as a protocol. Any object with `__enter__` and `__exit__` methods can guard a block of code, and Python guarantees that `__exit__` runs however the block ends. JavaScript only recently grew the same idea, with `using` declarations and `Symbol.dispose`. Python has had it since 2006, so the whole standard library speaks it: files, locks, transactions, temporary directories, mocks. The habit to build is simple: if something must be closed, released or restored, acquire it in a `with`.

## `with` replaces `try`/`finally`

:::compare
```js
const fd = fs.openSync("orders.csv", "r");
try {
  const text = fs.readFileSync(fd, "utf8");
  console.log(text.length);
} finally {
  fs.closeSync(fd);
}
```
```python
with open("orders.csv", encoding="utf-8") as f:
    text = f.read()
    print(len(text))
```
With explicit resource management, the JavaScript shrinks to `using file = openFile("orders.csv")`, and the file's `[Symbol.dispose]()` runs when the enclosing block exits.
:::

`with EXPR as NAME:` evaluates `EXPR` to get a **context manager**, calls its `__enter__()` and binds the return value to `NAME`. When the block finishes, whether it falls off the end, hits `return` or `break`, or raises, Python calls the manager's `__exit__()`. A file's `__exit__` closes it, so you never call `close()` yourself.

```python run
from pathlib import Path

Path("orders.csv").write_text("id,total\n1,9.99\n2,24.50\n", encoding="utf-8")

with open("orders.csv", encoding="utf-8") as f:
    header = f.readline().strip()
    print("header:", header)
    print("closed inside the block?", f.closed)

print("closed after the block?", f.closed)
```

:::deep What `with` does, spelled out
Roughly this, minus some care around looking up the methods:

```python
manager = open("orders.csv", encoding="utf-8")
f = manager.__enter__()
try:
    text = f.read()
except BaseException as exc:
    if not manager.__exit__(type(exc), exc, exc.__traceback__):
        raise
else:
    manager.__exit__(None, None, None)
```

`__exit__` always runs, it sees the exception if there was one, and a truthy return value swallows that exception.
:::

:::gotcha The name outlives the block
There's no block scope, so `f` is still bound after the `with` ends. The file it names is closed, though, and using it raises `ValueError: I/O operation on closed file.`
:::

:::quiz output
What does this print?

```python
with open("app.log", "w", encoding="utf-8") as log:
    log.write("started\n")
log.write("done\n")
```

- [ ] Nothing: both lines are written
- [ ] `NameError`
- [x] `ValueError`
- [ ] `AttributeError`

`log` is still bound, but the `with` block closed the file. Writing to a closed file raises `ValueError`.
:::

## Reading and writing files

:::compare
```js
import fs from "node:fs";

const text = fs.readFileSync("notes.md", "utf8");
fs.writeFileSync("notes.md", text + "- ship it\n");
fs.appendFileSync("app.log", "started\n");

const config = JSON.parse(fs.readFileSync("config.json", "utf8"));
const logo = fs.readFileSync("logo.png");          // Buffer
```
```python
from pathlib import Path

text = Path("notes.md").read_text(encoding="utf-8")
Path("notes.md").write_text(text + "- ship it\n", encoding="utf-8")
with open("app.log", "a", encoding="utf-8") as log:
    log.write("started\n")
config = json.loads(Path("config.json").read_text(encoding="utf-8"))
logo = Path("logo.png").read_bytes()               # bytes
```
:::

`Path.read_text()` and `Path.write_text()` are the one-shot helpers, like `readFileSync` and `writeFileSync`, and they open and close the file for you. Reach for `open()` in a `with` when you append, stream, or write in pieces. The mode string is close to Node's flags:

| Mode | Meaning | Node |
| --- | --- | --- |
| `"r"` | read text (the default) | `"r"` |
| `"w"` | write, **emptying the file first** | `"w"` |
| `"a"` | append, creating the file if needed | `"a"` |
| `"x"` | create, or raise `FileExistsError` if it exists | `"wx"` |
| `"r+"` | read and write, without truncating | `"r+"` |
| `"rb"`, `"wb"` | binary: `bytes` in and out, no encoding | a `Buffer` |

:::gotcha Always pass `encoding="utf-8"`
In text mode, Python decodes with the platform's preferred encoding unless you say otherwise, and on many Windows machines that's still a legacy code page such as cp1252. Code that passes CI on Linux garbles `"café"` on a colleague's laptop. Pass the encoding every time, until UTF-8 becomes the default (PEP 686, planned for Python 3.15). Running with `-X warn_default_encoding` makes Python flag every call that forgot.
:::

A file object is also an iterator over its lines, read lazily as you loop, which replaces Node's `readline.createInterface` plus `for await`. Each line keeps its trailing `"\n"`.

```python run
from pathlib import Path

Path("access.log").write_text(
    "200 GET /\n404 GET /favicon.ico\n500 POST /checkout\n200 GET /cart\n",
    encoding="utf-8",
)

errors = []
with open("access.log", encoding="utf-8") as log:
    for line_no, line in enumerate(log, start=1):     # one line at a time
        status, method, path = line.split()
        if status.startswith(("4", "5")):
            errors.append(f"line {line_no}: {status} {path}")
print(errors)
```

:::quiz output
What does this print?

```python
from pathlib import Path

Path("todo.txt").write_text("buy milk\nship it\n", encoding="utf-8")
with open("todo.txt", encoding="utf-8") as f:
    first = next(f)
print(repr(first))
```

- [ ] `'buy milk'`
- [x] `'buy milk\n'`
- [ ] `['buy milk', 'ship it']`
- [ ] `'b'`

Iterating a file yields whole lines, newline included. Strip it with `line.rstrip("\n")`, or read everything with `f.read().splitlines()`.
:::

:::gotcha Mode `"w"` empties the file the moment it opens
Truncation happens in `open()`, before your first write. Opening a file you're still reading in `"w"` mode destroys its contents, so `with open(p) as src, open(p, "w") as dst:` reads back an empty string. Read everything first, or write to a new file and rename it over the old one (the last challenge builds exactly that).
:::

## Writing a context manager class

:::compare
```js
class Timer {
  constructor(label) {
    this.label = label;
    this.start = performance.now();
  }

  [Symbol.dispose]() {
    const ms = performance.now() - this.start;
    console.log(`${this.label}: ${ms.toFixed(1)} ms`);
  }
}

{
  using timer = new Timer("report");
  buildReport();
}
```
```python
class Timer:
    def __init__(self, label):
        self.label = label

    def __enter__(self):
        self.start = time.perf_counter()
        return self

    def __exit__(self, exc_type, exc, tb):
        ms = (time.perf_counter() - self.start) * 1000
        print(f"{self.label}: {ms:.1f} ms")


with Timer("report") as timer:
    build_report()
```
:::

- `__enter__` runs as the block starts, and its return value is what `as` binds. That's often `self`, but it can be anything.
- `__exit__` receives three arguments: the exception's type, the exception itself and its traceback, or three `None`s if the block finished cleanly. This is the big difference from `[Symbol.dispose]()`, which takes no arguments. A Python manager knows **whether the block failed**, so it can commit on success and roll back on error.
- If `__exit__` returns a truthy value, the exception is **swallowed**. Return `None` (just fall off the end) to let it propagate.

```python run raises
class Transaction:
    def __init__(self, ledger):
        self.ledger = ledger

    def __enter__(self):
        self.pending = []
        return self.pending                     # what `as` binds

    def __exit__(self, exc_type, exc, tb):
        if exc_type is None:
            self.ledger.extend(self.pending)    # commit
        else:
            print(f"rolled back: {exc!r}")      # and let it propagate

ledger = []
with Transaction(ledger) as tx:
    tx.extend([("alice", -30), ("bob", 30)])
print(ledger)

with Transaction(ledger) as tx:
    tx.append(("alice", -500))
    raise ValueError("insufficient funds")
```

:::quiz output
What does this print?

```python
class Quiet:
    def __enter__(self):
        return self

    def __exit__(self, exc_type, exc, tb):
        return exc_type is ZeroDivisionError

with Quiet():
    print("a", end=" ")
    1 / 0
    print("b", end=" ")
print("c")
```

- [ ] `a b c`
- [x] `a c`
- [ ] `a`, then a `ZeroDivisionError`
- [ ] `c`

The exception ends the block at `1 / 0`, so `b` never prints. `__exit__` returns `True` for a `ZeroDivisionError`, which swallows it, and execution continues after the `with`.
:::

:::gotcha Don't return a truthy value by accident
`return self.cleanup()` passes along whatever `cleanup()` returns, and if that happens to be truthy, every exception from the block silently disappears. Suppressing is a deliberate feature (`contextlib.suppress` is built on it), never a side effect.
:::

## `@contextmanager`: a generator does the work

:::compare
```js
function withTimer(label, fn) {
  const start = performance.now();
  try {
    return fn();
  } finally {
    console.log(`${label}: ${performance.now() - start} ms`);
  }
}

withTimer("report", () => buildReport());
```
```python
@contextmanager
def timed(label):
    start = time.perf_counter()
    try:
        yield
    finally:
        print(f"{label}: {time.perf_counter() - start} s")


with timed("report"):
    build_report()
```
:::

Most managers are a few lines of setup and teardown, and a whole class is overkill. `@contextlib.contextmanager` turns a generator function into a manager: the code before `yield` is `__enter__`, the yielded value is what `as` binds, and the code after it is `__exit__`. It's the JavaScript "around" callback turned inside out. Instead of receiving the block as `fn`, the generator pauses at `yield` while the block runs. You only need `yield` as "run the block now" here; generators get their own lesson in [Iterators & Generators](lesson:iterators-and-generators).

```python run
import time
from contextlib import contextmanager

@contextmanager
def timed(label):
    start = time.perf_counter()
    try:
        yield
    finally:
        print(f"{label}: {(time.perf_counter() - start) * 1000:.1f} ms")

with timed("sum"):
    total = sum(range(1_000_000))
print(total)
```

:::gotcha The `try`/`finally` around `yield` isn't optional
If the block raises, the exception is re-raised inside the generator, at the `yield`. Without `try`/`finally`, the cleanup after it never runs.
:::

```python run
from contextlib import contextmanager

@contextmanager
def html_list():
    print("<ul>")
    yield
    print("</ul>")                  # skipped when the block raises

try:
    with html_list():
        print("  <li>one</li>")
        raise RuntimeError("render failed")
except RuntimeError as err:
    print("caught:", err)          # ...and the <ul> was never closed
```

:::pythonic Generator managers double as decorators
A manager made with `@contextmanager` can also decorate a function, and each call then runs inside a fresh `with`. Writing `@timed("nightly report")` above `def build_report():` times every call.
:::

## Several managers in one `with`

:::compare
```js
{
  using src = openForReading("orders.csv");
  using dst = openForWriting("orders.json");
  convert(src, dst);
} // dst is disposed first, then src
```
```python
with (
    open("orders.csv", encoding="utf-8") as src,
    open("orders.json", "w", encoding="utf-8") as dst,
):
    convert(src, dst)
# dst is closed first, then src
```
:::

Comma-separated managers enter left to right and exit in reverse order, exactly like stacked `using` declarations. If a later manager fails to enter, the ones already entered are still exited. The parenthesised, multi-line form (with a trailing comma) is official syntax since Python 3.10. On a single line, you can drop the parentheses.

:::quiz output
What does this print?

```python
from contextlib import contextmanager

@contextmanager
def tag(name):
    print(f"<{name}>", end="")
    yield
    print(f"</{name}>", end="")

with tag("b"), tag("i"):
    print("hi", end="")
```

- [ ] `<b><i>hi</b></i>`
- [x] `<b><i>hi</i></b>`
- [ ] `<i><b>hi</b></i>`
- [ ] `<b></b><i>hi</i>`

`tag("b")` enters first and exits last. Managers unwind like a stack, so the tags nest correctly.
:::

## The `contextlib` toolbox

| Helper | What it does | The JavaScript habit it replaces |
| --- | --- | --- |
| `suppress(*types)` | swallows the listed exceptions | `try { ... } catch {}` |
| `redirect_stdout(f)` | sends `print()` output to a file-like object | stubbing `console.log` in a test |
| `closing(obj)` | calls `obj.close()` on exit | `finally { obj.close() }` |
| `nullcontext(value)` | does nothing, and `as` gets `value` | an `if` around the whole block |
| `chdir(path)` (3.11+) | changes the working directory, then restores it | `process.chdir()` and back |
| `ExitStack()` | any number of managers and callbacks | `DisposableStack` |

`suppress` is the EAFP shortcut from [Errors & Exceptions](lesson:exceptions), and it's just a manager whose `__exit__` returns `True` for the listed types. `redirect_stdout` is how you capture the output of code that prints:

```python run
import io
from contextlib import redirect_stdout, suppress

def noisy_report():
    print("Generating report...")
    print("Total: 42")

buffer = io.StringIO()
with redirect_stdout(buffer):
    noisy_report()
print("captured:", buffer.getvalue().splitlines())

sessions = {}
with suppress(KeyError):
    del sessions["user:42"]
print("missing key ignored")
```

`nullcontext` stands in when a resource is optional. Here, `export` must close a file it opened, but it must never close `sys.stdout`:

```python run
import sys
from contextlib import nullcontext
from pathlib import Path

def export(rows, path=None):
    target = open(path, "w", encoding="utf-8") if path else nullcontext(sys.stdout)
    with target as out:
        for row in rows:
            print(*row, sep=",", file=out)

rows = [("sku", "qty"), ("A1", 3)]
export(rows)
export(rows, "export.csv")
print(Path("export.csv").read_text(encoding="utf-8"))
```

:::note `chdir` changes the whole process
The working directory is process-wide state. `contextlib.chdir` restores it on exit, but other threads or async tasks see the change while the block runs, so keep it to scripts and tests.
:::

## `ExitStack`: any number of resources

:::compare
```js
using stack = new DisposableStack();
const files = paths.map((p) => stack.use(openFile(p)));
stack.defer(() => console.log("all closed"));
merge(files);
```
```python
with ExitStack() as stack:
    files = [stack.enter_context(open(p, encoding="utf-8")) for p in paths]
    stack.callback(print, "all closed")
    merge(files)
```
:::

A `with` statement fixes the number of managers when you write it. `ExitStack` accepts them at runtime: `enter_context(cm)` enters a manager and schedules its exit, `callback(fn, *args)` schedules any cleanup function (like `defer`), and everything unwinds in reverse order when the stack's own block ends. `stack.pop_all()` moves the pending cleanups onto a fresh stack (like `move()`), which lets a function hand its open resources to the caller, but only once all of them opened successfully.

```python run
from contextlib import ExitStack
from pathlib import Path

paths = [Path(f"shard-{i}.txt") for i in range(3)]
for i, path in enumerate(paths):
    path.write_text(f"record {i}\n", encoding="utf-8")

with ExitStack() as stack:
    files = [stack.enter_context(p.open(encoding="utf-8")) for p in paths]
    stack.callback(print, "closing", len(files), "files")
    merged = [line.strip() for f in files for line in f]
print(merged)
print(all(f.closed for f in files))
```

## Context managers you already use

| Manager | What `__exit__` does |
| --- | --- |
| `open()`, `Path.open()` | flushes and closes the file |
| `threading.Lock()` | releases the lock |
| `tempfile.TemporaryDirectory()` | deletes the directory and everything in it |
| `decimal.localcontext()` | restores the previous precision and rounding |
| `unittest.mock.patch(...)` | undoes the monkeypatch |
| `zipfile.ZipFile(...)` | closes the archive |
| `subprocess.Popen(...)` | closes the pipes and waits for the process |
| `sqlite3.connect(...)` | commits or rolls back the transaction, **and leaves the connection open** |
| `pytest.raises(SomeError)` | fails the test unless the block raised (see [Modules & Tooling](lesson:modules-and-tooling)) |

:::gotcha `with sqlite3.connect()` doesn't close the connection
The connection's context manager scopes a **transaction**: commit if the block succeeds, roll back if it raises. The connection stays open afterwards. To close it as well, wrap it in `contextlib.closing()`.
:::

```python run raises
import sqlite3
from contextlib import closing

with sqlite3.connect(":memory:") as conn:
    conn.execute("CREATE TABLE orders (id INTEGER, total REAL)")
    conn.execute("INSERT INTO orders VALUES (1, 9.99)")
print(conn.execute("SELECT count(*) FROM orders").fetchone())   # still open

with closing(sqlite3.connect(":memory:")) as conn:
    conn.execute("SELECT 1")
conn.execute("SELECT 1")    # this one really is closed
```

## `async with`

:::compare
```js
{
  await using conn = await pool.connect();  // [Symbol.asyncDispose]
  await conn.query("SELECT 1");
}
```
```python
async with pool.acquire() as conn:         # __aenter__ / __aexit__
    await conn.fetch("SELECT 1")
```
:::

`async with` is the same protocol with awaitable `__aenter__` and `__aexit__` methods, so setup and teardown can do I/O. `@asynccontextmanager` and `AsyncExitStack` are the async twins of the helpers above. Both are covered with the event loop in [Async/Await & asyncio](lesson:async).

## Cheat sheet

| JavaScript | Python | Notes |
| --- | --- | --- |
| `finally { res.close() }` | `with res:` | `__exit__` always runs |
| `using res = acquire()` | `with acquire() as res:` | `as` binds what `__enter__` returns |
| `await using res = ...` | `async with ... as res:` | `__aenter__` / `__aexit__` |
| `[Symbol.dispose]()` | `__exit__(self, exc_type, exc, tb)` | sees the exception; truthy return suppresses it |
| `fs.readFileSync(p, "utf8")` | `Path(p).read_text(encoding="utf-8")` | |
| `fs.writeFileSync(p, s)` | `Path(p).write_text(s, encoding="utf-8")` | |
| `fs.appendFileSync(p, s)` | `open(p, "a", encoding="utf-8")` | in a `with`, then `f.write(s)` |
| `fs.openSync(p, "wx")` | `open(p, "x")` | `FileExistsError` if it exists |
| `for await (const line of rl)` | `for line in f:` | lines keep their `"\n"` |
| around-callback `withX(fn)` | `@contextmanager` + `yield` | wrap the `yield` in `try`/`finally` |
| several `using` lines | `with (a() as x, b() as y):` | exits in reverse order (3.10+) |
| `DisposableStack` | `ExitStack` | `enter_context`, `callback`, `pop_all` |
| `try { ... } catch {}` | `with suppress(SomeError):` | |
| stubbing `console.log` | `with redirect_stdout(buffer):` | |
| `process.chdir()` and back | `with chdir(path):` | 3.11+ |

## Challenges

:::challenge id=cm-log-file title="Append and read back" difficulty=easy
Write two small file helpers:

- `append_line(path, line)` appends `line` plus a newline to the file at `path`, creating the file if needed.
- `read_lines(path)` returns the file's lines without their newline characters, or `[]` if the file doesn't exist.

Open files in a `with` block, and pass `encoding="utf-8"` every time.

```python starter
def append_line(path, line):
    ...


def read_lines(path):
    ...
```

```python solution
def append_line(path, line):
    with open(path, "a", encoding="utf-8") as f:
        f.write(f"{line}\n")


def read_lines(path):
    try:
        with open(path, encoding="utf-8") as f:
            return f.read().splitlines()
    except FileNotFoundError:
        return []
```

```python tests
from pathlib import Path

def fresh(name):
    Path(name).unlink(missing_ok=True)
    return name

@test("append_line creates the file")
def _():
    path = fresh("cm-log-a.txt")
    append_line(path, "started")
    eq(Path(path).read_text(encoding="utf-8"), "started\n")

@test("append_line appends instead of overwriting")
def _():
    path = fresh("cm-log-b.txt")
    append_line(path, "one")
    append_line(path, "two")
    eq(Path(path).read_text(encoding="utf-8"), "one\ntwo\n")

@test("read_lines drops newlines and keeps blank lines")
def _():
    path = fresh("cm-log-c.txt")
    Path(path).write_text("a\nb b\n\nc", encoding="utf-8")
    eq(read_lines(path), ["a", "b b", "", "c"])

@test("read_lines returns [] for a missing file")
def _():
    eq(read_lines(fresh("cm-log-missing.txt")), [])

@test("round-trips non-ASCII text")
def _():
    path = fresh("cm-log-d.txt")
    append_line(path, "café ☕")
    eq(read_lines(path), ["café ☕"])

@test("opens files in a with block, with an explicit encoding")
def _():
    requires_syntax(ast.With, "open the file in a `with` block")
    opens = [
        node for node in ast.walk(tree)
        if isinstance(node, ast.Call) and getattr(node.func, "id", None) == "open"
    ]
    check(
        all(any(k.arg == "encoding" for k in call.keywords) for call in opens),
        'pass encoding="utf-8" to every open() call',
    )
```

```hint
Mode `"a"` appends, and it creates the file if it's missing.
```

```hint
`str.splitlines()` drops the line endings. For the missing file, catch `FileNotFoundError` around the `with`.
```
:::

:::challenge id=cm-expect-raises title="Build pytest.raises" difficulty=medium
Test frameworks need a way to say "this block must raise". Write a class `expect` that works like `pytest.raises` (and like this site's own `raises` helper):

```text
with expect(ValueError) as caught:
    int("nope")
caught.exception      # the ValueError instance
```

- If the block raises `exc_type` or a subclass of it, suppress the exception and store it on `.exception`.
- If the block raises anything else, let it propagate.
- If the block raises nothing, raise `AssertionError(f"expected {exc_type.__name__}")`.

Write it as a class with `__enter__` and `__exit__`, not with `@contextmanager`. The lowercase name follows the standard library's lead: `suppress`, `closing` and `redirect_stdout` are classes too.

```js
function expectToThrow(ErrorType, fn) {
  try {
    fn();
  } catch (err) {
    if (err instanceof ErrorType) return err;
    throw err;
  }
  throw new assert.AssertionError({ message: `expected ${ErrorType.name}` });
}
```

```python starter
class expect:
    def __init__(self, exc_type):
        self.exc_type = exc_type
        self.exception = None

    def __enter__(self):
        return self

    def __exit__(self, exc_type, exc, tb):
        ...
```

```python solution
class expect:
    def __init__(self, exc_type):
        self.exc_type = exc_type
        self.exception = None

    def __enter__(self):
        return self

    def __exit__(self, exc_type, exc, tb):
        if exc_type is None:
            raise AssertionError(f"expected {self.exc_type.__name__}")
        if issubclass(exc_type, self.exc_type):
            self.exception = exc
            return True
        return False
```

```python tests
@test("suppresses the expected exception")
def _():
    with expect(ValueError):
        int("nope")

@test("stores the exception on .exception")
def _():
    with expect(KeyError) as caught:
        {}["sku"]
    check(isinstance(caught.exception, KeyError), "caught.exception should hold the KeyError")
    eq(caught.exception.args, ("sku",))

@test("subclasses count")
def _():
    with expect(LookupError):
        [][0]

@test("other exceptions propagate")
def _():
    with raises(TypeError):
        with expect(ValueError):
            "1" + 1

@test("raises AssertionError when nothing is raised")
def _():
    with raises(AssertionError) as outer:
        with expect(ValueError):
            pass
    check("ValueError" in str(outer.exception), "the message should name the expected type")

@test("is a class")
def _():
    check(isinstance(expect, type), "write `class expect:` with __enter__ and __exit__")
```

```hint
`__exit__` receives `(exc_type, exc, tb)`, and all three are `None` when the block didn't raise.
```

```hint
`issubclass(exc_type, self.exc_type)` handles subclasses. Return `True` to suppress the exception, `False` to let it propagate.
```

```hint
An exception raised inside `__exit__` becomes the outcome of the whole `with` statement, which is how the "nothing was raised" case fails.
```
:::

:::challenge id=cm-atomic-write title="Atomic file writes" difficulty=hard
A crash halfway through `open(path, "w")` leaves a truncated file behind. Write `atomic_write(path)`, a context manager for crash-safe writes, like npm's `write-file-atomic`:

```text
with atomic_write("settings.json") as f:
    f.write('{"theme": "dark"}')
```

- Yield a UTF-8 text file opened on a temporary file next to the target, named `path + ".tmp"`.
- If the block succeeds, close the temp file, then move it over the target with `os.replace()`, which overwrites in one atomic step.
- If the block raises, close and delete the temp file, leave the target untouched, and let the exception propagate.

Readers then only ever see the old content or the new content, never half of it. The starter is the naive version.

```python starter
import os
from contextlib import contextmanager


@contextmanager
def atomic_write(path):
    with open(path, "w", encoding="utf-8") as f:
        yield f
```

```python solution
import os
from contextlib import contextmanager
from pathlib import Path


@contextmanager
def atomic_write(path):
    tmp = Path(f"{path}.tmp")
    try:
        with tmp.open("w", encoding="utf-8") as f:
            yield f
    except BaseException:
        tmp.unlink(missing_ok=True)
        raise
    os.replace(tmp, path)
```

```python tests
from pathlib import Path

def reset(name, content=None):
    for p in (Path(name), Path(f"{name}.tmp")):
        p.unlink(missing_ok=True)
    if content is not None:
        Path(name).write_text(content, encoding="utf-8")
    return name

def read(name):
    return Path(name).read_text(encoding="utf-8")

@test("writes the file when the block succeeds")
def _():
    path = reset("cm-atomic-1.json", "old")
    with atomic_write(path) as f:
        f.write('{"theme": "dark"}')
    eq(read(path), '{"theme": "dark"}')

@test("the target is untouched until the block finishes")
def _():
    path = reset("cm-atomic-2.json", "old")
    with atomic_write(path) as f:
        f.write("new")
        f.flush()
        eq(read(path), "old", "write to the .tmp file, not the target")
    eq(read(path), "new")

@test("leaves the target untouched when the block raises")
def _():
    path = reset("cm-atomic-3.json", "old")
    with raises(RuntimeError):
        with atomic_write(path) as f:
            f.write("half-writ")
            raise RuntimeError("disk full")
    eq(read(path), "old")
    new_path = reset("cm-atomic-4.json")
    with raises(KeyError):
        with atomic_write(new_path):
            raise KeyError("theme")
    check(not Path(new_path).exists(), "a failed first write shouldn't create the target")

@test("no .tmp file is left behind")
def _():
    path = reset("cm-atomic-5.json")
    with atomic_write(path) as f:
        f.write("ok")
    check(not Path(f"{path}.tmp").exists(), "the .tmp file should be gone after success")
    with raises(ValueError):
        with atomic_write(path):
            raise ValueError("nope")
    check(not Path(f"{path}.tmp").exists(), "delete the .tmp file after a failure")

@test("writes UTF-8 and closes the file")
def _():
    path = reset("cm-atomic-6.txt")
    with atomic_write(path) as f:
        f.write("naïve café")
    eq(Path(path).read_bytes(), "naïve café".encode("utf-8"))
    check(f.closed, "close the temp file before moving it")
```

```hint
Open the temp file in an inner `with` and `yield` inside it, so it's closed on both paths.
```

```hint
Wrap that in `try` / `except BaseException:` that deletes the temp file and re-raises with a bare `raise`. Catching `BaseException` is fine here because you always re-raise.
```

```hint
Call `os.replace(tmp, path)` after the `try`, so it only runs when the block succeeded.
```
:::
