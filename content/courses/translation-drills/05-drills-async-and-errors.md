---
title: "Drills: Async & Errors"
part: Async & Errors
summary: Ten reps on promises, timeouts, retries, async iteration, custom errors, causes and exception groups.
minutes: 50
---

Ten reps on the async and error-handling code that every JavaScript service is full of. The keywords barely change: `async`, `await`, `try` and `finally` all carry over. The semantics are what move. A Python coroutine doesn't start until something awaits it, `asyncio` counts in seconds, cancellation is an exception you mustn't swallow, and an `except` clause names what it can handle instead of catching everything and sorting it out with `instanceof`. Every async test runs under a one-second `asyncio.timeout` guard, and the sleeps are either injected or zero-length, so nothing waits for real.

## The mappings

| JavaScript | Python |
| --- | --- |
| calling an `async function` starts it | calling an `async def` only creates a coroutine: `await` it |
| `await Promise.all([a, b])` | `await asyncio.gather(a, b)` |
| `Promise.allSettled(promises)` | `asyncio.gather(*aws, return_exceptions=True)` |
| `Promise.race` against a timer | `async with asyncio.timeout(seconds):` (3.11+) |
| `new Promise((r) => setTimeout(r, ms))` | `await asyncio.sleep(seconds)` |
| `async function*` with `yield*` | `async def` with `yield` in a loop |
| `for await (const x of items)` | `async for x in items:` |
| `catch (err) { if (!(err instanceof E)) throw err; }` | `except E:` |
| `class E extends Error` | `class E(Exception):` |
| `new E(msg, { cause: err })` | `raise E(msg) from err` |
| `new AggregateError(errors, msg)` | `ExceptionGroup(msg, errors)`, caught with `except*` |

## Challenges

:::challenge id=drill-async-place-order title="Await every call" difficulty=easy
Write `async def place_order(cart, *, charge, audit)`. Both `charge(amount)` and `audit(message)` are async functions. In order:

1. audit `"checkout started"`,
2. charge `cart["total"]`, which returns a receipt dict like `{"id": "r-1", "amount": 25}`,
3. audit `"charged <amount>"`, using the receipt's amount,
4. return the receipt's `"id"`.

The JavaScript gets away without awaiting `audit()`, because calling an async function in JavaScript starts running it. Calling one in Python only creates a coroutine object, and nothing in its body runs until it's awaited. A forgotten `await` means the audit line is never written, and the only complaint is a `RuntimeWarning` when the abandoned coroutine is garbage collected.

Refresher: [Coroutines are lazy](lesson:async#coroutines-are-lazy).

```js
async function placeOrder(cart, { charge, audit }) {
  audit("checkout started"); // not awaited, but it still runs
  const receipt = await charge(cart.total);
  audit(`charged ${receipt.amount}`);
  return receipt.id;
}
```

```python starter
async def place_order(cart, *, charge, audit):
    ...
```

```python solution
async def place_order(cart, *, charge, audit):
    await audit("checkout started")
    receipt = await charge(cart["total"])
    await audit(f"charged {receipt['amount']}")
    return receipt["id"]
```

```python tests
import asyncio
import inspect

def services():
    """Fake async services that record what actually ran, in order."""
    events = []

    async def charge(amount):
        await asyncio.sleep(0)
        events.append(f"charge {amount}")
        return {"id": "r-1", "amount": amount}

    async def audit(message):
        await asyncio.sleep(0)
        events.append(f"audit {message}")

    return events, charge, audit

async def finish(coro):
    """Await coro, but fail instead of hanging if it's still running after 1 second."""
    deadline = asyncio.timeout(1)
    try:
        async with deadline:
            return await coro
    except TimeoutError:
        if not deadline.expired():
            raise
        check(False, "still running after 1 second: is something waiting forever?")

@test("place_order is an async function")
def _():
    check(inspect.iscoroutinefunction(place_order), "define it with async def")

@test("returns the receipt id")
async def _():
    events, charge, audit = services()
    eq(await finish(place_order({"total": 25}, charge=charge, audit=audit)), "r-1")

@test("charges the cart total")
async def _():
    events, charge, audit = services()
    await finish(place_order({"total": 99.5}, charge=charge, audit=audit))
    check("charge 99.5" in events, f"expected a charge of 99.5, but the events were {events}")

@test("both audit lines actually run, in order")
async def _():
    events, charge, audit = services()
    await finish(place_order({"total": 25}, charge=charge, audit=audit))
    eq(events, ["audit checkout started", "charge 25", "audit charged 25"])
```

```hint
Every call to `charge` or `audit` needs an `await` in front of it. Without one, you get a coroutine object back and its body never runs.
```

```hint
The receipt is a dict, so it's `receipt["amount"]` and `receipt["id"]`, not attribute access. Inside an f-string with double quotes, use single quotes for the key: `f"charged {receipt['amount']}"`.
```
:::

:::challenge id=drill-async-dashboard title="Promise.all with destructuring" difficulty=easy
Write `async def load_dashboard(api, user_id)`. `api` has three async methods, `get_user(user_id)`, `get_orders(user_id)` and `get_alerts(user_id)`. Run all three **concurrently**, then return:

```text
{"name": <the user's name>, "order_count": <number of orders>, "unread": <alerts whose "read" is False>}
```

`asyncio.gather` is `Promise.all`. It takes the awaitables as separate arguments, not a list, and returns their results in argument order, so they unpack straight into three names. If one call fails, its exception propagates out of `gather`, just as the first rejection rejects `Promise.all`. (A `TaskGroup` also runs them concurrently, but it reports failures wrapped in an `ExceptionGroup`, which is a different contract.)

Refresher: [`gather`: `Promise.all` and `allSettled`](lesson:async#gather-promise-all-and-allsettled).

```js
async function loadDashboard(api, userId) {
  const [user, orders, alerts] = await Promise.all([
    api.getUser(userId),
    api.getOrders(userId),
    api.getAlerts(userId),
  ]);
  return {
    name: user.name,
    orderCount: orders.length,
    unread: alerts.filter((alert) => !alert.read).length,
  };
}
```

```python starter
import asyncio

async def load_dashboard(api, user_id):
    ...
```

```python solution
import asyncio

async def load_dashboard(api, user_id):
    user, orders, alerts = await asyncio.gather(
        api.get_user(user_id),
        api.get_orders(user_id),
        api.get_alerts(user_id),
    )
    return {
        "name": user["name"],
        "order_count": len(orders),
        "unread": sum(1 for alert in alerts if not alert["read"]),
    }
```

```python tests
import asyncio

class FakeApi:
    """Async methods that record their calls and how many are in flight at once."""

    def __init__(self, fail=None):
        self.fail = fail
        self.calls = []
        self.active = 0
        self.peak = 0

    async def _call(self, name, user_id, result):
        self.calls.append((name, user_id))
        self.active += 1
        self.peak = max(self.peak, self.active)
        await asyncio.sleep(0)
        self.active -= 1
        if name == self.fail:
            raise ConnectionError(f"the {name} service is down")
        return result

    async def get_user(self, user_id):
        return await self._call("user", user_id, {"id": user_id, "name": "Ada"})

    async def get_orders(self, user_id):
        return await self._call("orders", user_id, [{"id": 1}, {"id": 2}, {"id": 3}])

    async def get_alerts(self, user_id):
        return await self._call("alerts", user_id, [{"read": True}, {"read": False}, {"read": False}])

async def finish(coro):
    """Await coro, but fail instead of hanging if it's still running after 1 second."""
    deadline = asyncio.timeout(1)
    try:
        async with deadline:
            return await coro
    except TimeoutError:
        if not deadline.expired():
            raise
        check(False, "still running after 1 second: is something waiting forever?")

@test("builds the dashboard")
async def _():
    eq(await finish(load_dashboard(FakeApi(), 7)), {"name": "Ada", "order_count": 3, "unread": 2})

@test("asks about the right user")
async def _():
    api = FakeApi()
    await finish(load_dashboard(api, 7))
    eq(sorted(api.calls), [("alerts", 7), ("orders", 7), ("user", 7)])

@test("runs the three calls concurrently")
async def _():
    api = FakeApi()
    await finish(load_dashboard(api, 7))
    eq(api.peak, 3, "peak number of calls in flight")

@test("a failing call fails the whole dashboard with its own error")
async def _():
    with raises(ConnectionError):
        await finish(load_dashboard(FakeApi(fail="orders"), 7))
```

```hint
`user, orders, alerts = await asyncio.gather(api.get_user(user_id), api.get_orders(user_id), api.get_alerts(user_id))`. Awaiting the three calls one after another would also give the right dashboard, but only one call would ever be in flight.
```

```hint
Count the unread alerts with a generator expression: `sum(1 for alert in alerts if not alert["read"])`.
```
:::

:::challenge id=drill-err-load-settings title="try / catch / finally" difficulty=easy
Write `load_settings(open_file, path)`. `open_file(path)` returns a file-like object with `read()` and `close()` methods.

- Return the file's contents parsed as JSON.
- A file that isn't valid JSON, including an empty one, counts as empty settings: return `{}`.
- Any other error propagates unchanged.
- Close the file in every case.

JavaScript's `catch` takes everything, so the code sorts errors out with `instanceof` and rethrows the rest. In Python, name the exception you can handle in the `except` clause and everything else propagates by itself. `JSON.parse` throws `SyntaxError`, and `json.loads` raises `json.JSONDecodeError`, a subclass of `ValueError`.

Refresher: [`try`/`except`/`else`/`finally`](lesson:exceptions#try-except-else-finally) and [Catch what you can handle](lesson:exceptions#catch-what-you-can-handle).

```js
function loadSettings(openFile, path) {
  const file = openFile(path);
  try {
    return JSON.parse(file.read());
  } catch (err) {
    if (err instanceof SyntaxError) return {};
    throw err;
  } finally {
    file.close();
  }
}
```

```python starter
import json

def load_settings(open_file, path):
    ...
```

```python solution
import json

def load_settings(open_file, path):
    file = open_file(path)
    try:
        return json.loads(file.read())
    except json.JSONDecodeError:
        return {}
    finally:
        file.close()
```

```python tests
class FakeFile:
    def __init__(self, text="", error=None):
        self.text = text
        self.error = error
        self.closed = False

    def read(self):
        if self.error is not None:
            raise self.error
        return self.text

    def close(self):
        self.closed = True

def opener(file):
    """An open_file() that hands out `file` and records the paths it was asked for."""
    def open_file(path):
        open_file.paths.append(path)
        return file
    open_file.paths = []
    return open_file

@test("returns the parsed settings")
def _():
    open_file = opener(FakeFile('{"theme": "dark", "font_size": 14}'))
    eq(load_settings(open_file, "settings.json"), {"theme": "dark", "font_size": 14})
    eq(open_file.paths, ["settings.json"])

@test("a corrupt or empty file counts as empty settings")
def _():
    for text in ["{oops", ""]:
        eq(load_settings(opener(FakeFile(text)), "settings.json"), {}, f"for the contents {text!r}")

@test("closes the file after success and after bad JSON")
def _():
    good, bad = FakeFile("{}"), FakeFile("{oops")
    load_settings(opener(good), "a.json")
    load_settings(opener(bad), "b.json")
    check(good.closed and bad.closed, "close the file in a finally block")

@test("other errors propagate unchanged, and the file still closes")
def _():
    locked = PermissionError("settings.json is locked")
    file = FakeFile(error=locked)
    check(raises(PermissionError, load_settings, opener(file), "settings.json") is locked, "let the original error through")
    check(file.closed, "close the file even when reading fails")

@test("catches only the JSON error")
def _():
    handlers = [node for node in ast.walk(tree) if isinstance(node, ast.ExceptHandler)]
    check(handlers, "use try/except around the parsing")
    for handler in handlers:
        check(handler.type is not None, "a bare except: catches everything, even KeyboardInterrupt")
        names = {node.id for node in ast.walk(handler.type) if isinstance(node, ast.Name)}
        check(not names & {"Exception", "BaseException"}, "catch json.JSONDecodeError (or ValueError), not every Exception")
```

```hint
The JavaScript shape carries over: `try` around the read and parse, `except json.JSONDecodeError:` returning `{}`, and `finally:` closing the file. A `return` inside `try` still runs the `finally` block on the way out.
```

```hint
There's no rethrow to write. An exception that doesn't match any `except` clause keeps propagating after `finally` runs.
```
:::

:::challenge id=drill-err-http-error title="Custom Error subclass" difficulty=easy
Translate `HttpError` and `check_response(response)`:

- `HttpError(status, url)` is an `Exception` subclass. Its message, `str(err)`, is `"HTTP <status> for <url>"`, and it keeps `status` and `url` as attributes.
- `err.retryable` is a read-only property: `True` for status 429 and for any 5xx status.
- `check_response(response)` returns the response dict itself when its `"status"` is below 400, and raises `HttpError` otherwise.

Pass the message to `super().__init__()`, the way `super(message)` sets `error.message`, so it ends up in `err.args` and in tracebacks. There's no `this.name` to set: Python reports the class name on its own.

Refresher: [Custom exceptions](lesson:exceptions#custom-exceptions) and [Properties instead of get and set](lesson:classes#properties-instead-of-get-and-set).

```js
class HttpError extends Error {
  constructor(status, url) {
    super(`HTTP ${status} for ${url}`);
    this.name = "HttpError";
    this.status = status;
    this.url = url;
  }
  get retryable() {
    return this.status === 429 || this.status >= 500;
  }
}

function checkResponse(response) {
  if (response.status >= 400) throw new HttpError(response.status, response.url);
  return response;
}
```

```python starter
class HttpError(Exception):
    ...

def check_response(response):
    ...
```

```python solution
class HttpError(Exception):
    def __init__(self, status, url):
        super().__init__(f"HTTP {status} for {url}")
        self.status = status
        self.url = url

    @property
    def retryable(self):
        return self.status == 429 or self.status >= 500

def check_response(response):
    if response["status"] >= 400:
        raise HttpError(response["status"], response["url"])
    return response
```

```python tests
@test("the message names the status and the URL")
def _():
    eq(str(HttpError(404, "/users/7")), "HTTP 404 for /users/7")

@test("keeps status and url as attributes")
def _():
    err = HttpError(503, "/health")
    eq((err.status, err.url), (503, "/health"))

@test("passes the message to Exception.__init__")
def _():
    eq(HttpError(404, "/users/7").args, ("HTTP 404 for /users/7",))

@test("except Exception catches it, and it reports its own class name")
def _():
    try:
        raise HttpError(500, "/")
    except Exception as err:
        eq(type(err).__name__, "HttpError")

@test("retryable is True for 429 and 5xx")
def _():
    eq([HttpError(status, "/").retryable for status in (429, 500, 503, 599)], [True] * 4)
    eq([HttpError(status, "/").retryable for status in (400, 404, 418)], [False] * 3)

@test("retryable is a read-only property")
def _():
    check(isinstance(vars(HttpError).get("retryable"), property), "define retryable with @property")
    raises(AttributeError, setattr, HttpError(500, "/"), "retryable", False)

@test("check_response passes successful responses through")
def _():
    response = {"status": 200, "url": "/users/7", "body": "{}"}
    check(check_response(response) is response, "return the same response dict")
    eq(check_response({"status": 304, "url": "/cached"})["status"], 304)

@test("check_response raises HttpError from 400 up")
def _():
    err = raises(HttpError, check_response, {"status": 400, "url": "/orders"})
    eq((err.status, err.url), (400, "/orders"))
```

```hint
In `__init__`, call `super().__init__(f"HTTP {status} for {url}")` first, then store `self.status` and `self.url`.
```

```hint
A `@property` with no setter is read-only, so assigning to it raises `AttributeError`. A JavaScript getter without a setter ignores the assignment in sloppy mode and throws a `TypeError` in strict mode.
```
:::

:::challenge id=drill-async-check-hosts title="Promise.allSettled" difficulty=medium
Write `async def check_hosts(hosts, ping)`. `ping(host)` is an async function that returns a latency in milliseconds, or raises. Ping every host concurrently and return a tuple `(up, down)` of two dicts:

- `up` maps each host that answered to its latency.
- `down` maps each host that failed to its error message, `str(err)`.

Both dicts follow the order of `hosts`, and one failure mustn't stop or hide the others. That's `Promise.allSettled`, and in Python it's `gather(..., return_exceptions=True)`: failures come back as exception objects, in their place in the results list, instead of being raised.

Refresher: [`gather`: `Promise.all` and `allSettled`](lesson:async#gather-promise-all-and-allsettled).

```js
async function checkHosts(hosts, ping) {
  const results = await Promise.allSettled(hosts.map((host) => ping(host)));
  const up = {};
  const down = {};
  results.forEach((result, i) => {
    if (result.status === "fulfilled") up[hosts[i]] = result.value;
    else down[hosts[i]] = result.reason.message;
  });
  return { up, down };
}
```

```python starter
import asyncio

async def check_hosts(hosts, ping):
    ...
```

```python solution
import asyncio

async def check_hosts(hosts, ping):
    results = await asyncio.gather(*(ping(host) for host in hosts), return_exceptions=True)
    up, down = {}, {}
    for host, result in zip(hosts, results):
        if isinstance(result, Exception):
            down[host] = str(result)
        else:
            up[host] = result
    return up, down
```

```python tests
import asyncio

def fake_ping(outcomes):
    """ping(host) returns or raises outcomes[host], and records concurrency."""
    stats = {"pinged": [], "active": 0, "peak": 0}

    async def ping(host):
        stats["pinged"].append(host)
        stats["active"] += 1
        stats["peak"] = max(stats["peak"], stats["active"])
        await asyncio.sleep(0)
        stats["active"] -= 1
        outcome = outcomes[host]
        if isinstance(outcome, Exception):
            raise outcome
        return outcome

    return ping, stats

async def finish(coro):
    """Await coro, but fail instead of hanging if it's still running after 1 second."""
    deadline = asyncio.timeout(1)
    try:
        async with deadline:
            return await coro
    except TimeoutError:
        if not deadline.expired():
            raise
        check(False, "still running after 1 second: is something waiting forever?")

OUTCOMES = {
    "api.example.com": 12,
    "db.example.com": ConnectionError("connection refused"),
    "cdn.example.com": 31,
    "mail.example.com": TimeoutError("no reply after 2s"),
}

@test("splits the hosts into up and down")
async def _():
    ping, stats = fake_ping(OUTCOMES)
    up, down = await finish(check_hosts(list(OUTCOMES), ping))
    eq(up, {"api.example.com": 12, "cdn.example.com": 31})
    eq(down, {"db.example.com": "connection refused", "mail.example.com": "no reply after 2s"})

@test("both dicts follow the order of hosts")
async def _():
    ping, stats = fake_ping(OUTCOMES)
    hosts = ["mail.example.com", "cdn.example.com", "db.example.com", "api.example.com"]
    up, down = await finish(check_hosts(hosts, ping))
    eq(list(up), ["cdn.example.com", "api.example.com"])
    eq(list(down), ["mail.example.com", "db.example.com"])

@test("pings every host, concurrently")
async def _():
    ping, stats = fake_ping(OUTCOMES)
    await finish(check_hosts(list(OUTCOMES), ping))
    eq(sorted(stats["pinged"]), sorted(OUTCOMES))
    eq(stats["peak"], 4, "peak number of pings in flight")

@test("everything down, or nothing to check")
async def _():
    ping, stats = fake_ping({"a": OSError("unreachable"), "b": OSError("unreachable")})
    eq(await finish(check_hosts(["a", "b"], ping)), ({}, {"a": "unreachable", "b": "unreachable"}))
    eq(await finish(check_hosts([], ping)), ({}, {}))

@test("uses gather(..., return_exceptions=True)")
def _():
    check(
        any(isinstance(node, ast.keyword) and node.arg == "return_exceptions" for node in ast.walk(tree)),
        "pass return_exceptions=True so failures come back as values",
    )
```

```hint
`await asyncio.gather(*(ping(host) for host in hosts), return_exceptions=True)` returns one result per host, in order. Each result is either a latency or the exception that ping raised.
```

```hint
Walk `zip(hosts, results)` and sort each pair into `up` or `down` with `isinstance(result, Exception)`. Dicts keep insertion order, so following `hosts` keeps both dicts in order.
```
:::

:::challenge id=drill-async-with-timeout title="Race against a timer" difficulty=medium
Write `async def with_timeout(aw, seconds, fallback=None)`. Await `aw` and return its result, or return `fallback` if it hasn't finished within `seconds`.

- `asyncio.timeout` (3.11+) and `asyncio.wait_for` **cancel** the slow operation when time runs out, where `Promise.race` leaves the loser running. The tests check that it was cancelled.
- `asyncio` measures time in seconds, not milliseconds.
- Errors raised by `aw` itself propagate unchanged.
- A falsy result such as `0` or `None` is still a result, not a timeout.

Refresher: [Timeouts and races](lesson:async#timeouts-and-races).

```js
function withTimeout(promise, ms, fallback = null) {
  let timer;
  const timeout = new Promise((resolve) => {
    timer = setTimeout(() => resolve(fallback), ms);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}
```

```python starter
import asyncio

async def with_timeout(aw, seconds, fallback=None):
    ...
```

```python solution
import asyncio

async def with_timeout(aw, seconds, fallback=None):
    try:
        async with asyncio.timeout(seconds):
            return await aw
    except TimeoutError:
        return fallback
```

```python tests
import asyncio

async def stuck(log):
    """Never finishes on its own, and logs it if it gets cancelled."""
    try:
        await asyncio.Event().wait()
    except asyncio.CancelledError:
        log.append("cancelled")
        raise

async def quick(value):
    await asyncio.sleep(0)
    return value

async def finish(coro):
    """Await coro, but fail instead of hanging if it's still running after 1 second."""
    deadline = asyncio.timeout(1)
    try:
        async with deadline:
            return await coro
    except TimeoutError:
        if not deadline.expired():
            check(False, "a TimeoutError escaped from with_timeout: return the fallback instead")
        check(False, "still running after 1 second: the timeout never fired")

@test("returns the result when it arrives in time")
async def _():
    eq(await finish(with_timeout(quick({"rows": 3}), 1)), {"rows": 3})

@test("returns the fallback when time runs out")
async def _():
    eq(await finish(with_timeout(stuck([]), 0.01, fallback="cached")), "cached")

@test("the fallback defaults to None")
async def _():
    eq(await finish(with_timeout(stuck([]), 0.01)), None)

@test("cancels the slow operation, which Promise.race can't do")
async def _():
    log = []
    await finish(with_timeout(stuck(log), 0.01))
    await asyncio.sleep(0)   # let a pending cancellation land
    eq(log, ["cancelled"])

@test("errors from the operation propagate")
async def _():
    async def broken():
        await asyncio.sleep(0)
        raise ValueError("bad payload")

    with raises(ValueError):
        await finish(with_timeout(broken(), 1, fallback="cached"))

@test("a falsy result is not a timeout")
async def _():
    eq(await finish(with_timeout(quick(0), 1, fallback=-1)), 0)
    eq(await finish(with_timeout(quick(None), 1, fallback="cached")), None)
```

```hint
`async with asyncio.timeout(seconds):` around `return await aw` cancels the await when time runs out and raises `TimeoutError` at the end of the block.
```

```hint
Wrap the whole `async with` in `try` / `except TimeoutError:` and return `fallback` there. Any other exception isn't caught, so it propagates as it should.
```
:::

:::challenge id=drill-async-paginate title="for await and async generators" difficulty=medium
Translate both functions:

- `paginate(fetch_page)` is an **async generator** that yields every item, page after page. `fetch_page(page)` is an async function that takes page numbers starting from 1 and returns a list, and the first empty page ends the iteration. Fetch each page only when the consumer gets to it.
- `async def take(items, n)` returns a list of the first `n` items of any async iterable, using `async for`, and stops pulling as soon as it has them. `take(items, 0)` returns `[]` without pulling anything.

Python has no async `yield*`: `yield from` is a `SyntaxError` inside an async generator, so loop over the page and `yield` each item. The walrus operator turns "fetch until a page comes back empty" into the loop condition.

Refresher: [`async for` and `async with`](lesson:async#async-for-and-async-with) and [The walrus operator](lesson:control-flow#the-walrus-operator).

```js
async function* paginate(fetchPage) {
  for (let page = 1; ; page++) {
    const items = await fetchPage(page);
    if (items.length === 0) return;
    yield* items;
  }
}

async function take(items, n) {
  const taken = [];
  if (n <= 0) return taken;
  for await (const item of items) {
    taken.push(item);
    if (taken.length === n) break;
  }
  return taken;
}
```

```python starter
async def paginate(fetch_page):
    ...

async def take(items, n):
    ...
```

```python solution
async def paginate(fetch_page):
    page = 1
    while items := await fetch_page(page):
        for item in items:
            yield item
        page += 1

async def take(items, n):
    taken = []
    if n <= 0:
        return taken
    async for item in items:
        taken.append(item)
        if len(taken) == n:
            break
    return taken
```

```python tests
import asyncio
import inspect

def pages(*batches):
    """fetch_page(n) returns batches[n - 1], or [] past the end, and records each call."""
    fetched = []

    async def fetch_page(page):
        fetched.append(page)
        await asyncio.sleep(0)
        return list(batches[page - 1]) if page <= len(batches) else []

    return fetch_page, fetched

async def finish(coro):
    """Await coro, but fail instead of hanging if it's still running after 1 second."""
    deadline = asyncio.timeout(1)
    try:
        async with deadline:
            return await coro
    except TimeoutError:
        if not deadline.expired():
            raise
        check(False, "still running after 1 second: is something waiting forever?")

async def collect(items):
    return [item async for item in items]

@test("paginate is an async generator")
def _():
    check(inspect.isasyncgenfunction(paginate), "paginate needs both async def and yield")

@test("yields every item, page after page")
async def _():
    fetch_page, fetched = pages(["ada", "grace"], ["linus"])
    eq(await finish(collect(paginate(fetch_page))), ["ada", "grace", "linus"])

@test("the first empty page ends the iteration")
async def _():
    fetch_page, fetched = pages(["ada"], [], ["never"])
    eq(await finish(collect(paginate(fetch_page))), ["ada"])
    eq(fetched, [1, 2])

@test("take stops pulling once it has n items")
async def _():
    fetch_page, fetched = pages(["a", "b"], ["c", "d"], ["e"])
    eq(await finish(take(paginate(fetch_page), 3)), ["a", "b", "c"])
    eq(fetched, [1, 2], "a page was fetched after take() already had its items")

@test("take returns everything when there are fewer than n items")
async def _():
    fetch_page, fetched = pages(["a"], ["b"])
    eq(await finish(take(paginate(fetch_page), 10)), ["a", "b"])

@test("take(items, 0) pulls nothing")
async def _():
    fetch_page, fetched = pages(["a"])
    eq(await finish(take(paginate(fetch_page), 0)), [])
    eq(fetched, [])

@test("take works with any async iterable")
async def _():
    async def countdown():
        for n in (3, 2, 1):
            await asyncio.sleep(0)
            yield n

    eq(await finish(take(countdown(), 2)), [3, 2])
```

```hint
An `async def` containing `yield` is an async generator. `while items := await fetch_page(page):` keeps going while the page is non-empty, because an empty list is falsy.
```

```hint
In `take`, check `n <= 0` before the loop, then `break` out of the `async for` as soon as `len(taken) == n`. Breaking early is what stops the generator from fetching another page.
```
:::

:::challenge id=drill-err-fetch-json title="Error cause to raise from" difficulty=medium
Write `FetchError` and `async def get_json(fetch, url)`:

- `FetchError(url)` is an `Exception` subclass whose message is `"could not fetch <url>"`. It keeps `url` as an attribute.
- `get_json` awaits `fetch(url)`, which returns a dict like `{"status": 200, "body": "..."}`, and returns the body parsed as JSON.
- A network failure and a body that isn't valid JSON both become a `FetchError`, chained to the original error with `raise ... from err`. That sets `__cause__`, Python's `{ cause }`. Network failures are `OSError`s, a family that includes `ConnectionError` and, perhaps surprisingly, `TimeoutError`.
- Anything else, like a `TypeError` from a bug, propagates unchanged instead of hiding inside a `FetchError`.

Without `from`, Python still records the original error, as `__context__`, but the traceback then says "During handling of the above exception, another exception occurred", which reads like a second bug. `from err` says "this was caused by that".

Refresher: [Re-raising and chaining](lesson:exceptions#re-raising-and-chaining).

```js
class FetchError extends Error {
  constructor(url, options) {
    super(`could not fetch ${url}`, options);
    this.url = url;
  }
}

async function getJSON(fetch, url) {
  let response;
  try {
    response = await fetch(url);
  } catch (err) {
    throw new FetchError(url, { cause: err });
  }
  try {
    return JSON.parse(response.body);
  } catch (err) {
    throw new FetchError(url, { cause: err });
  }
}
```

```python starter
import json

class FetchError(Exception):
    ...

async def get_json(fetch, url):
    ...
```

```python solution
import json

class FetchError(Exception):
    def __init__(self, url):
        super().__init__(f"could not fetch {url}")
        self.url = url

async def get_json(fetch, url):
    try:
        response = await fetch(url)
    except OSError as err:
        raise FetchError(url) from err
    try:
        return json.loads(response["body"])
    except json.JSONDecodeError as err:
        raise FetchError(url) from err
```

```python tests
import asyncio
import json

def fake_fetch(response=None, error=None):
    async def fetch(url):
        await asyncio.sleep(0)
        if error is not None:
            raise error
        return response
    return fetch

async def finish(coro):
    """Await coro, but fail instead of hanging if it's still running after 1 second."""
    deadline = asyncio.timeout(1)
    try:
        async with deadline:
            return await coro
    except TimeoutError:
        if not deadline.expired():
            raise
        check(False, "still running after 1 second: is something waiting forever?")

@test("returns the parsed JSON body")
async def _():
    fetch = fake_fetch({"status": 200, "body": '{"id": 7, "tags": ["admin"]}'})
    eq(await finish(get_json(fetch, "/users/7")), {"id": 7, "tags": ["admin"]})

@test("FetchError carries a message and the URL")
def _():
    err = FetchError("/users/7")
    check(isinstance(err, Exception), "FetchError should subclass Exception")
    eq((str(err), err.url), ("could not fetch /users/7", "/users/7"))

@test("a network error becomes a FetchError caused by it")
async def _():
    reset = ConnectionResetError("connection reset by peer")
    with raises(FetchError) as ctx:
        await finish(get_json(fake_fetch(error=reset), "/users/7"))
    eq(ctx.exception.url, "/users/7")
    check(ctx.exception.__cause__ is reset, "chain the original error: raise FetchError(url) from err")

@test("a timeout counts as a network error")
async def _():
    timeout = TimeoutError("read timed out")
    with raises(FetchError) as ctx:
        await finish(get_json(fake_fetch(error=timeout), "/slow"))
    check(ctx.exception.__cause__ is timeout, "TimeoutError is an OSError: wrap it like the others")

@test("invalid JSON becomes a FetchError caused by the JSONDecodeError")
async def _():
    with raises(FetchError) as ctx:
        await finish(get_json(fake_fetch({"status": 200, "body": "<html>oops</html>"}), "/page"))
    check(isinstance(ctx.exception.__cause__, json.JSONDecodeError), "chain the JSONDecodeError with from")

@test("other errors are bugs, and propagate unchanged")
async def _():
    bug = TypeError("fetch() got an unexpected keyword argument 'timeout'")
    with raises(TypeError) as ctx:
        await finish(get_json(fake_fetch(error=bug), "/users/7"))
    check(ctx.exception is bug, "don't wrap errors you didn't expect")
```

```hint
Use two separate `try` blocks, one around `await fetch(url)` and one around `json.loads(response["body"])`, so each catches only its own failure: `except OSError as err:` and `except json.JSONDecodeError as err:`.
```

```hint
Inside each `except`, `raise FetchError(url) from err`. Python sets `__cause__` to `err`, and the traceback shows both errors, joined by "The above exception was the direct cause of the following exception".
```
:::

:::challenge id=drill-async-retry-backoff title="Retry with exponential backoff" difficulty=hard
Write `async def retry(fn, *, attempts=3, base_delay=0.1, sleep=asyncio.sleep)`. It awaits `fn()` and returns the first successful result. After attempt `n` fails, it waits `base_delay * 2 ** (n - 1)` seconds (0.1, then 0.2, then 0.4, ...) and tries again, up to `attempts` calls in total.

- Delays are in **seconds**: `asyncio.sleep` takes seconds where `setTimeout` takes milliseconds.
- `sleep` is injectable, so tests never wait for real. Wait by awaiting `sleep(delay)`.
- When the last attempt fails, re-raise its exception unchanged, without sleeping first.
- Never retry a cancellation. `asyncio.CancelledError` derives from `BaseException`, not `Exception`, precisely so that `except Exception` lets it through, while a bare `except:` would swallow it and keep retrying.
- The options are keyword-only.

Refresher: [Sleeping: seconds, and never `time.sleep`](lesson:async#sleeping-seconds-and-never-time-sleep), [Cancellation](lesson:async#cancellation-an-abortcontroller-in-every-task) and [Re-raising and chaining](lesson:exceptions#re-raising-and-chaining).

```js
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function retry(fn, { attempts = 3, baseDelay = 100, wait = sleep } = {}) {
  for (let attempt = 1; ; attempt++) {
    try {
      return await fn();
    } catch (err) {
      if (attempt >= attempts) throw err;
      await wait(baseDelay * 2 ** (attempt - 1));
    }
  }
}
```

```python starter
import asyncio

async def retry(fn, *, attempts=3, base_delay=0.1, sleep=asyncio.sleep):
    ...
```

```python solution
import asyncio

async def retry(fn, *, attempts=3, base_delay=0.1, sleep=asyncio.sleep):
    for attempt in range(1, attempts + 1):
        try:
            return await fn()
        except Exception:
            if attempt == attempts:
                raise
            await sleep(base_delay * 2 ** (attempt - 1))
```

```python tests
import asyncio
import inspect

def flaky(*outcomes):
    """An async fn whose calls raise or return the next outcome in turn."""
    calls = []

    async def fn():
        calls.append(len(calls) + 1)
        await asyncio.sleep(0)
        outcome = outcomes[len(calls) - 1]
        if isinstance(outcome, BaseException):
            raise outcome
        return outcome

    return fn, calls

def fake_sleep():
    """An async sleep that records each delay instead of waiting."""
    delays = []

    async def sleep(seconds):
        delays.append(seconds)

    return sleep, delays

async def finish(coro):
    """Await coro, but fail instead of hanging if it's still running after 1 second."""
    deadline = asyncio.timeout(1)
    try:
        async with deadline:
            return await coro
    except TimeoutError:
        if not deadline.expired():
            raise
        check(False, "still running after 1 second: is something waiting forever?")

@test("returns the first successful result")
async def _():
    fn, calls = flaky(ConnectionError("down"), {"id": 7})
    sleep, delays = fake_sleep()
    eq(await finish(retry(fn, sleep=sleep)), {"id": 7})
    eq(len(calls), 2)

@test("doesn't sleep when the first attempt succeeds")
async def _():
    fn, calls = flaky("ok")
    sleep, delays = fake_sleep()
    eq(await finish(retry(fn, sleep=sleep)), "ok")
    eq(delays, [])

@test("backs off exponentially, in seconds")
async def _():
    fn, calls = flaky(ConnectionError(), TimeoutError(), "ok")
    sleep, delays = fake_sleep()
    await finish(retry(fn, sleep=sleep))
    eq(delays, [0.1, 0.2])

@test("re-raises the last error unchanged, without a final sleep")
async def _():
    last = ConnectionError("still down")
    fn, calls = flaky(ConnectionError("down"), ConnectionError("down"), last)
    sleep, delays = fake_sleep()
    with raises(ConnectionError) as ctx:
        await finish(retry(fn, sleep=sleep))
    check(ctx.exception is last, "re-raise the original exception with a bare raise")
    eq(len(calls), 3)
    eq(delays, [0.1, 0.2], "don't sleep after the last attempt")

@test("respects attempts and base_delay")
async def _():
    fn, calls = flaky(*[ValueError("nope")] * 4, "ok")
    sleep, delays = fake_sleep()
    eq(await finish(retry(fn, attempts=5, base_delay=1, sleep=sleep)), "ok")
    eq(delays, [1, 2, 4, 8])

@test("attempts=1 means a single try")
async def _():
    fn, calls = flaky(ValueError("nope"), "ok")
    sleep, delays = fake_sleep()
    with raises(ValueError):
        await finish(retry(fn, attempts=1, sleep=sleep))
    eq((len(calls), delays), (1, []))

@test("never retries a cancellation")
async def _():
    fn, calls = flaky(asyncio.CancelledError(), "ok")
    sleep, delays = fake_sleep()
    with raises(asyncio.CancelledError):
        await finish(retry(fn, sleep=sleep))
    eq(len(calls), 1, "a CancelledError means stop now: catch Exception, not everything")

@test("sleeps with asyncio.sleep by default, and the options are keyword-only")
def _():
    eq(inspect.signature(retry).parameters["sleep"].default, asyncio.sleep)
    raises(TypeError, retry, lambda: None, 5)
```

```hint
Loop with `for attempt in range(1, attempts + 1):` and `return await fn()` inside a `try`. Python has no `for (;;)` with a manual counter, and doesn't need one here.
```

```hint
In `except Exception:`, check `if attempt == attempts: raise` before sleeping. A bare `raise` re-raises the exception being handled, unchanged.
```

```hint
The delay for attempt `n` is `base_delay * 2 ** (n - 1)`, and `**` binds tighter than `*`. Await the injected `sleep(delay)`, never `time.sleep`, which would block the whole event loop.
```
:::

:::challenge id=drill-err-signup-group title="AggregateError to ExceptionGroup" difficulty=hard
Translate the validator and its caller:

- `ValidationError(field, message)` is a `ValueError` subclass with a `field` attribute. `str(err)` is just the message.
- `validate_signup(form)` checks every field and reports **all** the problems at once, in this order: `username` (required, and not blank), `age` (an `int` of at least 13) and `email` (must contain `"@"`). Missing keys and `None` values are problems, not crashes. If there are problems, it raises `ExceptionGroup("invalid signup", errors)`. Otherwise it returns the form.
- `signup_errors(form)` returns `{field: message}` for every problem, or `{}` for a valid form. Catch the group with `except* ValidationError`, which lets unrelated errors through untouched.

Three spots don't translate literally. `form.age >= 13` coerces `"36"` into a number, but in Python `"36" >= 13` raises `TypeError`, so check the type first. `new AggregateError([])` is fine, but an `ExceptionGroup` needs at least one exception. And `return` isn't allowed inside an `except*` block, so assign the result there and return it afterwards.

Refresher: [Exception groups and notes](lesson:exceptions#exception-groups-and-notes) and [Custom exceptions](lesson:exceptions#custom-exceptions).

```js
class ValidationError extends Error {
  constructor(field, message) {
    super(message);
    this.field = field;
  }
}

function validateSignup(form) {
  const errors = [];
  if (!form.username?.trim()) errors.push(new ValidationError("username", "is required"));
  if (!(form.age >= 13)) errors.push(new ValidationError("age", "must be 13 or older"));
  if (!form.email?.includes("@")) errors.push(new ValidationError("email", "is not an email address"));
  if (errors.length > 0) throw new AggregateError(errors, "invalid signup");
  return form;
}

function signupErrors(form) {
  try {
    validateSignup(form);
    return {};
  } catch (err) {
    if (!(err instanceof AggregateError)) throw err;
    return Object.fromEntries(err.errors.map((e) => [e.field, e.message]));
  }
}
```

```python starter
class ValidationError(ValueError):
    ...

def validate_signup(form):
    ...

def signup_errors(form):
    ...
```

```python solution
class ValidationError(ValueError):
    def __init__(self, field, message):
        super().__init__(message)
        self.field = field

def validate_signup(form):
    errors = []
    if not (form.get("username") or "").strip():
        errors.append(ValidationError("username", "is required"))
    age = form.get("age")
    if not (isinstance(age, int) and age >= 13):
        errors.append(ValidationError("age", "must be 13 or older"))
    if "@" not in (form.get("email") or ""):
        errors.append(ValidationError("email", "is not an email address"))
    if errors:
        raise ExceptionGroup("invalid signup", errors)
    return form

def signup_errors(form):
    problems = {}
    try:
        validate_signup(form)
    except* ValidationError as group:
        problems = {err.field: str(err) for err in group.exceptions}
    return problems
```

```python tests
VALID = {"username": "ada", "age": 36, "email": "ada@example.com"}

def fields(group):
    return [err.field for err in group.exceptions]

class BrokenForm(dict):
    """A form whose every lookup fails, like one backed by a dead database."""

    def _fail(self, *args, **kwargs):
        raise RuntimeError("form backend unavailable")

    get = __getitem__ = __contains__ = _fail

@test("ValidationError is a ValueError with a field")
def _():
    err = ValidationError("age", "must be 13 or older")
    check(isinstance(err, ValueError), "subclass ValueError")
    eq((err.field, str(err)), ("age", "must be 13 or older"))

@test("a valid form is returned unchanged")
def _():
    form = dict(VALID)
    check(validate_signup(form) is form, "return the form itself")

@test("reports every problem in one ExceptionGroup, in order")
def _():
    group = raises(ExceptionGroup, validate_signup, {"username": "  ", "age": 9, "email": "ada"})
    eq(str(group), "invalid signup (3 sub-exceptions)")
    eq(fields(group), ["username", "age", "email"])
    check(all(isinstance(err, ValidationError) for err in group.exceptions), "the group should hold ValidationErrors")

@test("missing and None fields are problems, not crashes")
def _():
    eq(fields(raises(ExceptionGroup, validate_signup, {})), ["username", "age", "email"])
    eq(fields(raises(ExceptionGroup, validate_signup, {"username": None, "age": None, "email": None})), ["username", "age", "email"])

@test("no coercion: a numeric string isn't an age")
def _():
    eq(fields(raises(ExceptionGroup, validate_signup, {**VALID, "age": "36"})), ["age"])

@test("a single problem still raises a group")
def _():
    group = raises(ExceptionGroup, validate_signup, {**VALID, "age": 12})
    eq(str(group), "invalid signup (1 sub-exception)")
    eq(str(group.exceptions[0]), "must be 13 or older")

@test("signup_errors maps each field to its message")
def _():
    eq(
        signup_errors({"username": "ada", "age": 12, "email": "ada"}),
        {"age": "must be 13 or older", "email": "is not an email address"},
    )

@test("signup_errors returns {} for a valid form")
def _():
    eq(signup_errors(dict(VALID)), {})

@test("signup_errors lets unrelated errors through")
def _():
    raises(RuntimeError, signup_errors, BrokenForm())

@test("signup_errors catches the group with except*")
def _():
    requires_syntax(ast.TryStar, "use try / except* ValidationError")
```

```hint
Collect the errors in a list, then `if errors: raise ExceptionGroup("invalid signup", errors)`. For missing or `None` text, `(form.get("email") or "")` gives you a string to test.
```

```hint
For the age, `isinstance(age, int) and age >= 13`. The `and` short-circuits, so the comparison only runs on ints.
```

```hint
`except* ValidationError as group:` binds an `ExceptionGroup` holding just the matching errors in `group.exceptions`. Build the dict there, assign it to a variable declared before the `try`, and return that variable after the `try` statement.
```
:::
