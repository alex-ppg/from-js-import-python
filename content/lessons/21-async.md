---
title: Async/Await & asyncio
part: Advanced Python
summary: Same keywords, lazier semantics. Coroutines, tasks, gather, TaskGroup, timeouts and cancellation.
minutes: 40
---

`async def` and `await` read exactly like their JavaScript counterparts, and the model underneath is familiar too: one thread, one event loop, and code only gives up control at an `await`. The difference that trips everyone up is **when work starts**. Calling a JS async function starts it immediately and hands you a promise. Calling a Python `async def` hands you a **coroutine object that does nothing at all** until something awaits it or wraps it in a task.

The rest follows from that. You start the event loop yourself with `asyncio.run`, you ask for concurrency explicitly with tasks, and every task can be cancelled without threading an `AbortSignal` through your code.

## Coroutines are lazy

:::compare
```js
async function fetchUser(id) {
  console.log(`fetching ${id}`);
  return { id };
}

async function main() {
  const pending = fetchUser(1); // logs "fetching 1" now
  const user = await pending;
}
```
```python
async def fetch_user(user_id):
    print(f"fetching {user_id}")
    return {"id": user_id}


async def main():
    pending = fetch_user(1)    # prints nothing
    user = await pending       # runs it: "fetching 1"
```
:::

JavaScript runs an async function synchronously up to its first `await`, so the work is under way before you ever look at the promise. A Python coroutine is closer to a paused generator (see [Iterators & Generators](lesson:iterators-and-generators)): calling `fetch_user(1)` builds the frame and stops before the first line. `await` drives it to completion and evaluates to its return value.

```python run
import asyncio

async def fetch_user(user_id):
    print(f"fetching {user_id}")
    return {"id": user_id}

async def main():
    pending = fetch_user(1)
    print("created:", pending)
    user = await pending
    print("awaited:", user)

asyncio.run(main())
```

:::gotcha A missing `await` means the work never happens
Forget `await` in JS and the function still runs. You just hold a promise where you expected a value. Forget it in Python and **nothing runs at all**: you hold a coroutine object, and when it's garbage-collected Python prints `RuntimeWarning: coroutine '...' was never awaited`. Treat that warning as an error. Delete the `await` in the playground above to see it. Type checkers flag unused coroutines too (see [Type Hints](lesson:type-hints)).
:::

:::quiz output
What does this print?

```python
import asyncio

log = []

async def greet():
    log.append("greet")

async def main():
    coro = greet()
    log.append("main")
    await coro

asyncio.run(main())
print(log)
```

- [ ] `['greet', 'main']`
- [x] `['main', 'greet']`
- [ ] `['main']`

Creating the coroutine runs none of its body, so `"main"` is logged first. The equivalent JavaScript logs `greet` first, because an async function runs synchronously until its first `await`.
:::

A coroutine can also be awaited only **once** (a second `await` raises `RuntimeError`). A task, covered below, can be awaited any number of times, like a promise.

## Running the event loop

:::compare
```js
// main.mjs: the loop is already running
async function main() {
  const config = await loadConfig();
  await startServer(config);
}

await main(); // top-level await in an ES module
```
```python
# main.py: you start the loop yourself
import asyncio

async def main():
    config = await load_config()
    await start_server(config)

if __name__ == "__main__":
    asyncio.run(main())
```
:::

Node and browsers start an event loop before your first line runs. A Python program is synchronous until it calls `asyncio.run(coro)`, which creates an event loop, runs the coroutine to completion, cancels any tasks still pending, closes the loop, and returns the coroutine's result. Call it once at the entry point and stay in async code from there.

`await` is only legal inside `async def`, so a script with a top-level `await` fails with `SyntaxError: 'await' outside function`. Top-level `await` does work in Jupyter, in the asyncio REPL (`python -m asyncio`), and in this site's playgrounds, which run their own loop. The playgrounds also accept `asyncio.run(main())`, so you can write normal scripts here.

:::gotcha No `.then()` escape hatch
A sync function can't `await`, the same "function colour" split you know from JS. JS lets sync code call an async function and attach `.then()`. Python has no equivalent: a coroutine needs a running loop, so sync code gets a result out of async code with `asyncio.run(...)`, which blocks until the coroutine finishes. Calling it while a loop is already running, from inside async code or in Jupyter, raises `RuntimeError: asyncio.run() cannot be called from a running event loop`.
:::

### Sleeping: seconds, and never `time.sleep`

:::compare
```js
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function poll() {
  await sleep(500); // milliseconds
}
```
```python
import asyncio


async def poll():
    await asyncio.sleep(0.5)   # seconds, as a float
```
:::

Every duration in `asyncio` (and in `time`) is in **seconds**. `asyncio.sleep(500)` waits more than eight minutes. `await asyncio.sleep(0)` yields to the loop once without waiting, which lets other ready tasks run.

:::gotcha `time.sleep` freezes every task
`time.sleep(1)` inside a coroutine is the moral equivalent of a `while (Date.now() < end) {}` busy-wait in JS: the thread blocks, so the loop can't run anything else. The same goes for any blocking call, such as `requests.get` or a slow computation. See [the last section](lesson:async#blocking-code-and-the-sync-ecosystem) for the way out.
:::

```python run
import asyncio
import time

async def heartbeat():
    for _ in range(3):
        print(f"beat at {time.perf_counter() - start:.2f}s")
        await asyncio.sleep(0.03)

async def crunch():
    time.sleep(0.1)            # blocks the whole loop
    print(f"crunch done at {time.perf_counter() - start:.2f}s")

async def main():
    await asyncio.gather(heartbeat(), crunch())   # run both at once

start = time.perf_counter()
asyncio.run(main())
```

The second beat arrives late because `crunch` held the thread. Change `time.sleep(0.1)` to `await asyncio.sleep(0.1)` and the beats stay on schedule. (`gather` is `Promise.all`, covered below.)

## Tasks start the work

:::compare
```js
async function loadDashboard() {
  const userP = fetchUser(1);     // both start now
  const ordersP = fetchOrders(1);
  const user = await userP;
  const orders = await ordersP;
  return { user, orders };
}
```
```python
async def load_dashboard():
    user_t = asyncio.create_task(fetch_user(1))      # both scheduled
    orders_t = asyncio.create_task(fetch_orders(1))
    user = await user_t
    orders = await orders_t
    return {"user": user, "orders": orders}
```
:::

`asyncio.create_task(coro)` wraps a coroutine in a `Task` and schedules it on the loop. It starts at the next opportunity, meaning the next time the current coroutine awaits something, and runs whether or not anyone is waiting for it. That's the JS promise behaviour, but opt-in. A task also has things a promise lacks: `.done()`, `.result()` and `.cancel()`.

The JS reflex of awaiting coroutines one after another quietly serialises them:

```python run
import asyncio
import time

async def fetch(resource):
    await asyncio.sleep(0.1)          # pretend network call
    return f"{resource} data"

async def main():
    start = time.perf_counter()
    users = await fetch("users")      # one after the other
    orders = await fetch("orders")
    print(f"awaited in turn: {time.perf_counter() - start:.1f}s")

    start = time.perf_counter()
    users_t = asyncio.create_task(fetch("users"))
    orders_t = asyncio.create_task(fetch("orders"))
    users, orders = await users_t, await orders_t
    print(f"as tasks:        {time.perf_counter() - start:.1f}s")

asyncio.run(main())
```

:::quiz output
What does this print?

```python
import asyncio

log = []

async def job():
    log.append("job")

async def main():
    task = asyncio.create_task(job())
    log.append("main")
    await task

asyncio.run(main())
print(log)
```

- [ ] `['job', 'main']`
- [x] `['main', 'job']`
- [ ] `['main']`

`create_task` schedules `job`, but it can only start once `main` hands control back to the loop, which happens at `await task`. In JS, calling `job()` would run its body immediately, so `job` would come first.
:::

:::gotcha Fire-and-forget needs a reference
The event loop holds only a **weak** reference to each task, so a task you create and drop can be garbage-collected before it finishes. And a forgotten task that raises doesn't crash anything: Python just logs `Task exception was never retrieved`. (Node, by contrast, exits on an unhandled rejection.) Keep every task in a variable you await, put background jobs in a set, or let a `TaskGroup` own them (see below).
:::

```python
background_tasks = set()

def fire_and_forget(coro):
    task = asyncio.create_task(coro)
    background_tasks.add(task)                        # keep it alive
    task.add_done_callback(background_tasks.discard)  # forget it when done
```

:::deep `new Promise(...)` is a `Future`, and eager tasks exist
A promise you resolve by hand maps to an `asyncio.Future`, Python's `Promise.withResolvers()`. It's how you adapt a callback API: create one with `loop.create_future()`, resolve it from the callback with `fut.set_result(value)` (or `set_exception`), and `await fut`. Tasks are futures that drive a coroutine, which is why both have `.result()` and `.done()`.

```python
async def next_click(button):
    future = asyncio.get_running_loop().create_future()
    button.on_click(future.set_result)   # the callback resolves it
    return await future
```

Python 3.12 also added `asyncio.eager_task_factory`. After `loop.set_task_factory(asyncio.eager_task_factory)`, `create_task` runs the coroutine synchronously until it first suspends, just like calling a JS async function. It's an optimisation for coroutines that often finish without waiting, such as cache hits, and the default stays lazy.
:::

## gather: `Promise.all` and `allSettled`

:::compare
```js
const [user, orders] = await Promise.all([
  fetchUser(1),
  fetchOrders(1),
]);

const results = await Promise.allSettled(requests);
// [{ status: "fulfilled", value }, { status: "rejected", reason }]
```
```python
user, orders = await asyncio.gather(
    fetch_user(1),
    fetch_orders(1),
)

results = await asyncio.gather(*requests, return_exceptions=True)
# [value, KeyError(...), ...]
```
:::

`gather` wraps each coroutine in a task, runs them concurrently, and returns a list of results **in argument order**, whatever order they finish in. If one raises, `gather` raises that exception. With `return_exceptions=True`, exceptions come back as items in the result list instead, which is `allSettled` without the `{status, value}` wrapper: you tell outcomes apart with `isinstance(result, Exception)`.

```python run
import asyncio

PRICES = {"A1": 9.99, "C3": 4.50}

async def fetch_price(sku, delay):
    await asyncio.sleep(delay)
    return PRICES[sku]                       # KeyError for unknown SKUs

async def main():
    skus = ["A1", "B2", "C3"]
    results = await asyncio.gather(
        *(fetch_price(sku, 0.03 - 0.01 * n) for n, sku in enumerate(skus)),
        return_exceptions=True,
    )
    for sku, result in zip(skus, results):
        print(sku, "->", repr(result))

asyncio.run(main())
```

Remove `return_exceptions=True` and the call raises `KeyError: 'B2'` instead. As with `Promise.all`, the other awaitables keep running in the background after one fails. If "one fails, stop everything" is what you want, use a `TaskGroup`.

:::gotcha `gather` takes arguments, not an array
`Promise.all([a, b])` takes an array. `asyncio.gather(a, b)` takes the awaitables as separate arguments, so spread a list with `gather(*tasks)`. Passing the list itself fails with a confusing `TypeError` about an unhashable `list`.
:::

## TaskGroup: structured concurrency

:::compare
```js
async function load() {
  const controller = new AbortController();
  const { signal } = controller;
  try {
    return await Promise.all([
      fetchUser(1, { signal }),
      fetchOrders(1, { signal }),
    ]);
  } catch (err) {
    controller.abort(); // stop the survivors by hand
    throw err;
  }
}
```
```python
async def load():
    async with asyncio.TaskGroup() as tg:
        user = tg.create_task(fetch_user(1))
        orders = tg.create_task(fetch_orders(1))
    # here: both finished, or both were stopped
    return user.result(), orders.result()
```
:::

A `TaskGroup` (3.11+) is an `async with` block that owns every task created through it. The block doesn't exit until all of them have finished. If any task raises, the group cancels the others, waits for them to wind down, and raises an `ExceptionGroup` holding every error. No task outlives the block, which is what *structured concurrency* means. JavaScript has no built-in equivalent, so you assemble one from `Promise.all` and an `AbortController`.

```python run
import asyncio

async def fetch(name, delay, fail=False):
    try:
        await asyncio.sleep(delay)
    except asyncio.CancelledError:
        print(f"{name}: cancelled")
        raise
    if fail:
        raise ConnectionError(f"{name} is down")
    return f"{name} ok"

async def main():
    try:
        async with asyncio.TaskGroup() as tg:
            tg.create_task(fetch("users", 0.2))
            tg.create_task(fetch("orders", 0.01, fail=True))
    except* ConnectionError as group:
        print("failed:", group.exceptions)

asyncio.run(main())
```

Errors come out wrapped in an `ExceptionGroup`, so a plain `except ConnectionError:` won't match. `except*` (3.11+) picks matching exceptions out of the group, and [Errors & Exceptions](lesson:exceptions) covers groups in depth.

:::pythonic Prefer `TaskGroup` in new code
A `TaskGroup` can't leak tasks, cancels siblings on failure, and reports every error rather than just the first. Keep `gather` for "run these and give me a list", and for `return_exceptions=True`, which has no `TaskGroup` equivalent.
:::

:::quiz output
What does this print?

```python
import asyncio

async def ok():
    await asyncio.sleep(0.01)
    return "ok"

async def boom():
    raise ValueError("boom")

async def main():
    try:
        async with asyncio.TaskGroup() as tg:
            first = tg.create_task(ok())
            tg.create_task(boom())
    except* ValueError:
        pass
    print(first.cancelled())

asyncio.run(main())
```

- [x] `True`
- [ ] `False`
- [ ] `ok`
- [ ] `ExceptionGroup`

`boom` fails on its first step, while `ok` is still sleeping, so the group cancels `ok`. The `except*` clause handles the group, and `first.cancelled()` reports what happened to the sibling.
:::

## Timeouts and races

:::compare
```js
// give up after 2 seconds
const page = await fetchPage(url, {
  signal: AbortSignal.timeout(2000),
});

// first to settle wins (the loser keeps running)
const config = await Promise.race([fromCache(), fromNetwork()]);
```
```python
# give up after 2 seconds
async with asyncio.timeout(2):
    page = await fetch_page(url)


# first to finish wins (cancel the loser yourself)
done, pending = await asyncio.wait(tasks, return_when=asyncio.FIRST_COMPLETED)
```
:::

`asyncio.timeout(seconds)` (3.11+) is an async context manager. If the block is still running when time is up, it cancels whatever the block is awaiting and raises `TimeoutError`, the built-in exception (`asyncio.TimeoutError` is an alias). Nothing has to accept a signal parameter, because cancellation reaches any `await`. `asyncio.wait_for(aw, timeout)` is the older function form of the same thing.

```python run
import asyncio

async def slow_query():
    try:
        await asyncio.sleep(1)
        return ["row"]
    finally:
        print("query stopped")       # runs when the timeout cancels it

async def main():
    try:
        async with asyncio.timeout(0.05):
            rows = await slow_query()
    except TimeoutError:
        rows = []
    print(f"{rows=}")

    try:
        await asyncio.wait_for(slow_query(), timeout=0.05)
    except TimeoutError:
        print("wait_for gave up too")

asyncio.run(main())
```

For a race, `asyncio.wait(tasks, return_when=asyncio.FIRST_COMPLETED)` returns as soon as one task finishes. Unlike `Promise.race`, you then get the chance to stop the losers:

```python
done, pending = await asyncio.wait(tasks, return_when=asyncio.FIRST_COMPLETED)
for task in pending:
    task.cancel()                   # stop the losers
winner = done.pop().result()
```

:::gotcha `asyncio.wait` wants tasks and returns sets
`asyncio.wait` takes tasks, not coroutines (passing coroutines is a `TypeError` since 3.11), and returns two **sets** of tasks, `(done, pending)`, rather than a value. Results come from `task.result()`, and anything in `pending` keeps running until you cancel it.
:::

To handle results in the order they finish, which is handy for progress output, loop over `asyncio.as_completed`. Each item it yields is an awaitable for the next result to arrive. In 3.13+ you can also write `async for task in asyncio.as_completed(tasks)` and get the original task objects back.

```python run
import asyncio

async def download(name, delay):
    await asyncio.sleep(delay)
    return name

async def main():
    jobs = [download("big.iso", 0.03), download("small.txt", 0.01), download("mid.zip", 0.02)]
    for next_done in asyncio.as_completed(jobs):
        print("finished:", await next_done)

asyncio.run(main())
```

## Cancellation: an AbortController in every task

:::compare
```js
const controller = new AbortController();
const job = download(url, { signal: controller.signal });

controller.abort(); // only works if download() checks the signal
try {
  await job;
} catch (err) {
  if (err.name !== "AbortError") throw err;
}
```
```python
job = asyncio.create_task(download(url))


job.cancel()        # works wherever download() is awaiting
try:
    await job
except asyncio.CancelledError:
    pass
```
:::

`task.cancel()` asks a task to stop. The next time the task is suspended at an `await` (it usually already is), the loop raises `asyncio.CancelledError` at that exact point. The error unwinds the coroutine like any other exception, so `finally` blocks and `async with` exits run their cleanup, and awaiting the task afterwards raises `CancelledError`. Every task can be cancelled without cooperation from the code it runs, so the chore of passing a signal through every function disappears. The one limit is the same as in JS: code that never awaits can't be interrupted.

```python run
import asyncio

async def download(name):
    print(f"{name}: started")
    try:
        await asyncio.sleep(1)
        print(f"{name}: finished")
    finally:
        print(f"{name}: closing the connection")

async def main():
    job = asyncio.create_task(download("report.pdf"))
    await asyncio.sleep(0.02)
    job.cancel()
    try:
        await job
    except asyncio.CancelledError:
        print(f"main: cancelled={job.cancelled()}")

asyncio.run(main())
```

:::gotcha Don't swallow `CancelledError`
`CancelledError` inherits from `BaseException`, not `Exception`, so `except Exception:` lets it through. A bare `except:` or an `except BaseException:` catches it, and if you don't re-raise, the task carries on as if nothing happened. That breaks `TaskGroup`, `asyncio.timeout` and anyone waiting for the task to stop. Catch it only to clean up, then `raise`.
:::

:::quiz output
What does this print?

```python
import asyncio

async def job():
    try:
        await asyncio.sleep(1)
    except Exception:
        return "caught"
    return "finished"

async def main():
    task = asyncio.create_task(job())
    await asyncio.sleep(0)
    task.cancel()
    try:
        print(await task)
    except asyncio.CancelledError:
        print("cancelled")

asyncio.run(main())
```

- [ ] `caught`
- [ ] `finished`
- [x] `cancelled`
- [ ] `None`

`CancelledError` is a `BaseException`, so `except Exception` doesn't catch it. It propagates out of `job`, the task ends up cancelled, and `await task` re-raises it in `main`.
:::

## `async for` and `async with`

:::compare
```js
async function* paginate(url) {
  for (let page = 1; page <= 3; page++) {
    yield await fetchPage(url, page);
  }
}

for await (const page of paginate("/orders")) {
  console.log(page);
}
const pages = await Array.fromAsync(paginate("/orders"));
```
```python
async def paginate(url):
    for page in range(1, 4):
        yield await fetch_page(url, page)



async for page in paginate("/orders"):
    print(page)


pages = [page async for page in paginate("/orders")]
```
:::

An `async def` that contains `yield` is an **async generator**, Python's `async function*`. `async for` drives it and awaits each step. Async comprehensions (`[x async for x in ...]`) replace `Array.fromAsync`, and they accept `if` filters and extra `for` clauses like any comprehension. Like `await`, both only work inside `async def` (or a playground).

```python run
import asyncio

async def fetch_page(n):
    await asyncio.sleep(0.01)
    return [f"order-{n}{i}" for i in range(2)]

async def paginate(pages):
    for n in range(1, pages + 1):
        yield await fetch_page(n)

async def main():
    async for page in paginate(3):
        print(page)
    orders = [order async for page in paginate(2) for order in page]
    print(orders)

asyncio.run(main())
```

`async with` is the async flavour of `with` (see [Context Managers](lesson:context-managers)): it awaits `__aenter__` on the way in and `__aexit__` on the way out, so setup and teardown can do I/O. It's the counterpart of JS's `await using` and `Symbol.asyncDispose`. You've already used two, `TaskGroup` and `asyncio.timeout`. The quickest way to write your own is `@contextlib.asynccontextmanager`:

```python run
import asyncio
from contextlib import asynccontextmanager

@asynccontextmanager
async def connect(dsn):
    print(f"connecting to {dsn}")
    await asyncio.sleep(0.01)
    try:
        yield {"dsn": dsn}
    finally:
        await asyncio.sleep(0.01)      # async cleanup
        print("connection closed")

async def main():
    async with connect("postgres://localhost/shop") as conn:
        print("querying", conn["dsn"])

asyncio.run(main())
```

To hold a variable number of them open at once, say one connection per shard, use `contextlib.AsyncExitStack`, the async twin of `ExitStack`. Each `await stack.enter_async_context(cm)` enters one, and they all close in reverse order when the stack's own `async with` block ends.

## Limiting concurrency: Semaphore and Queue

:::compare
```js
import pLimit from "p-limit";

const limit = pLimit(3);

const pages = await Promise.all(
  urls.map((url) => limit(() => fetchPage(url))),
);
```
```python
limit = asyncio.Semaphore(3)

async def fetch_limited(url):
    async with limit:            # at most 3 inside at once
        return await fetch_page(url)

pages = await asyncio.gather(*(fetch_limited(u) for u in urls))
```
:::

Starting 10,000 requests at once is as bad an idea in Python as it is in JS. `asyncio.Semaphore(n)` is the standard library's `p-limit`: `async with sem:` waits until one of the `n` slots is free, and releases the slot on the way out, even if the body raises.

```python run
import asyncio

active = peak = 0

async def fetch_page(url, limit):
    global active, peak
    async with limit:
        active += 1
        peak = max(peak, active)
        await asyncio.sleep(0.01)
        active -= 1
        return f"<html>{url}</html>"

async def main():
    limit = asyncio.Semaphore(3)
    urls = [f"/products/{n}" for n in range(10)]
    pages = await asyncio.gather(*(fetch_page(url, limit) for url in urls))
    print(len(pages), "pages, at most", peak, "at a time")

asyncio.run(main())
```

For a producer/consumer pipeline, `asyncio.Queue` is an async FIFO: `await queue.get()` waits for an item, and `await queue.put(item)` waits for room when the queue has a `maxsize`. A fixed pool of worker tasks pulling from a queue is the other classic way to bound concurrency. `queue.shutdown()` (3.13+) tells the workers that no more items are coming. On older versions, put one sentinel such as `None` on the queue per worker.

```python run
import asyncio

async def worker(name, queue, sent):
    try:
        while True:
            email = await queue.get()
            await asyncio.sleep(0.01)          # pretend to send it
            sent.append(f"{name} -> {email}")
    except asyncio.QueueShutDown:              # shut down and drained
        pass

async def main():
    queue, sent = asyncio.Queue(), []
    async with asyncio.TaskGroup() as tg:
        for n in range(2):
            tg.create_task(worker(f"worker{n}", queue, sent))
        for email in ["ada@example.com", "linus@example.com", "grace@example.com"]:
            await queue.put(email)
        queue.shutdown()
    print(*sent, sep="\n")

asyncio.run(main())
```

:::tip Locks still matter across `await`
`asyncio.Lock`, `Event` and `Condition` round out the toolkit. Nothing interrupts you between two `await`s, but a read-modify-write that spans an `await` can interleave with another task, just as in JS.
:::

## Blocking code and the sync ecosystem

:::compare
```js
// fetch is async in every runtime
const res = await fetch("https://api.example.com/users");
const users = await res.json();
```
```python
import httpx   # third-party, async-capable

async with httpx.AsyncClient() as client:
    res = await client.get("https://api.example.com/users")
    users = res.json()
```
:::

JavaScript's I/O APIs are async to the core. Python grew up synchronous: `open()`, `sqlite3`, `subprocess` and `requests`, the most popular HTTP library, all block. Call any of them from a coroutine and every task on the loop freezes, the `time.sleep` problem again. In async code, reach for async libraries: `httpx` or `aiohttp` for HTTP, `asyncpg` or SQLAlchemy's asyncio mode for databases. If a library's functions aren't `async def`, they block.

CPU-heavy work blocks the loop too, as it does in Node. When you have no async alternative, push blocking calls onto a worker thread with `asyncio.to_thread` (3.9+). On the standard build, the GIL stops threads from running Python code in parallel, so CPU-bound work goes to a process pool, Python's closest thing to a `Worker`. Threads and processes aren't available in this sandbox, so this one is static:

```python
import asyncio
from concurrent.futures import ProcessPoolExecutor

import requests

async def main():
    # blocking I/O: run it on a worker thread
    res = await asyncio.to_thread(requests.get, "https://api.example.com/users")

    # CPU-bound: run it in another process
    loop = asyncio.get_running_loop()
    with ProcessPoolExecutor() as pool:
        digest = await loop.run_in_executor(pool, expensive_hash, res.content)
```

Async is opt-in in Python. Plenty of services stay synchronous (most Django and Flask apps, scripts, data pipelines), so use it when overlapping network waits is the point.

## Cheat sheet

| JavaScript | Python | Notes |
| --- | --- | --- |
| `async function f() {}` | `async def f():` | calling it returns a coroutine; nothing runs yet |
| `await p` | `await aw` | only inside `async def` (playgrounds and REPLs excepted) |
| top-level `await main()` | `asyncio.run(main())` | once, at the entry point |
| `await new Promise(r => setTimeout(r, ms))` | `await asyncio.sleep(seconds)` | seconds; never `time.sleep` |
| `setTimeout(fn, ms)` | `loop.call_later(seconds, fn)` | |
| `const p = f()` (starts now) | `task = asyncio.create_task(f())` | keep a reference |
| `Promise.all([a, b])` | `await asyncio.gather(a, b)` | separate arguments; ordered results |
| `Promise.allSettled(ps)` | `gather(*aws, return_exceptions=True)` | exceptions come back as values |
| `Promise.race(ps)` | `asyncio.wait(tasks, return_when=FIRST_COMPLETED)` | returns `(done, pending)`; cancel `pending` |
| `Promise.any(ps)` | loop over `asyncio.as_completed(...)` | no built-in |
| `AbortSignal.timeout(ms)` | `async with asyncio.timeout(seconds):` | 3.11+; raises `TimeoutError` |
| `controller.abort()` | `task.cancel()` | raises `CancelledError` inside the task |
| `Promise.all` + `AbortController` | `async with asyncio.TaskGroup() as tg:` | 3.11+; errors arrive as an `ExceptionGroup` |
| `Promise.withResolvers()` | `loop.create_future()` | `fut.set_result(value)` |
| `for await (const x of it)` | `async for x in it:` | |
| `async function*` | `async def` with `yield` | an async generator |
| `Array.fromAsync(it)` | `[x async for x in it]` | |
| `await using x = ...` | `async with ... as x:` | `@asynccontextmanager` |
| `p-limit` | `asyncio.Semaphore(n)` | `async with sem:` |
| `Worker` | `ProcessPoolExecutor` | `asyncio.to_thread` for blocking I/O |

## Challenges

:::challenge id=async-fetch-all title="Fetch them all" difficulty=easy
Write `async def fetch_all(fetch, ids)` that calls the async function `fetch(id)` for every id **concurrently** and returns a list of the results in the same order as `ids`.

The tests pass in a fake `fetch` that records how many calls are in flight at once, so awaiting one call after another won't pass.

```js
const fetchAll = (fetch, ids) => Promise.all(ids.map((id) => fetch(id)));
```

```python starter
import asyncio

async def fetch_all(fetch, ids):
    ...
```

```python solution
import asyncio

async def fetch_all(fetch, ids):
    return await asyncio.gather(*(fetch(user_id) for user_id in ids))
```

```python tests
import asyncio

def tracked_fetch(delays=None):
    """A fake fetch that records the peak number of calls in flight."""
    delays = delays or {}
    stats = {"active": 0, "peak": 0, "calls": 0}

    async def fetch(user_id):
        stats["calls"] += 1
        stats["active"] += 1
        stats["peak"] = max(stats["peak"], stats["active"])
        await asyncio.sleep(delays.get(user_id, 0))
        stats["active"] -= 1
        return {"id": user_id}

    return fetch, stats

@test("returns one result per id, in input order")
async def _():
    fetch, stats = tracked_fetch()
    eq(await fetch_all(fetch, [3, 1, 2]), [{"id": 3}, {"id": 1}, {"id": 2}])

@test("keeps input order when later ids finish first")
async def _():
    fetch, stats = tracked_fetch({1: 0.03, 2: 0.01})
    eq(await fetch_all(fetch, [1, 2, 3]), [{"id": 1}, {"id": 2}, {"id": 3}])

@test("runs the fetches concurrently, not one at a time")
async def _():
    fetch, stats = tracked_fetch()
    await fetch_all(fetch, [1, 2, 3, 4])
    eq(stats["peak"], 4, "peak number of fetches in flight")

@test("calls fetch exactly once per id")
async def _():
    fetch, stats = tracked_fetch()
    await fetch_all(fetch, [1, 2, 3])
    eq(stats["calls"], 3)

@test("an empty list gives an empty list")
async def _():
    fetch, stats = tracked_fetch()
    eq(await fetch_all(fetch, []), [])
```

```hint
`asyncio.gather(a, b, c)` runs awaitables concurrently and returns their results as a list, in argument order.
```

```hint
`gather` takes separate arguments, not a list. Spread a generator expression into it: `asyncio.gather(*(fetch(i) for i in ids))`.
```
:::

:::challenge id=async-map-limited title="Concurrency limit" difficulty=medium
Write `async def map_limited(fn, items, limit)` that awaits `fn(item)` for every item and returns the results in input order, with **at most `limit` calls in flight** at any moment.

Start the next call as soon as any slot frees up, like `p-limit` does. Processing fixed batches of `limit` items, where one slow item holds up the whole batch, doesn't count. Raise `ValueError` if `limit` is less than 1.

```js
import pLimit from "p-limit";

async function mapLimited(fn, items, limit) {
  const run = pLimit(limit);
  return Promise.all(items.map((item) => run(() => fn(item))));
}
```

```python starter
import asyncio

async def map_limited(fn, items, limit):
    ...
```

```python solution
import asyncio

async def map_limited(fn, items, limit):
    if limit < 1:
        raise ValueError("limit must be at least 1")
    slots = asyncio.Semaphore(limit)

    async def call(item):
        async with slots:
            return await fn(item)

    return await asyncio.gather(*(call(item) for item in items))
```

```python tests
import asyncio

def tracked(delays=None):
    """A fake async fn that records concurrency and start/end events."""
    delays = delays or {}
    stats = {"active": 0, "peak": 0, "events": []}

    async def fn(item):
        stats["active"] += 1
        stats["peak"] = max(stats["peak"], stats["active"])
        stats["events"].append(f"start {item}")
        await asyncio.sleep(delays.get(item, 0))
        stats["events"].append(f"end {item}")
        stats["active"] -= 1
        return item * 10

    return fn, stats

async def finish(coro):
    try:
        async with asyncio.timeout(2):
            return await coro
    except TimeoutError:
        check(False, "still running after 2 seconds: is something waiting forever?")

@test("returns results in input order")
async def _():
    fn, stats = tracked({1: 0.02})
    eq(await finish(map_limited(fn, [1, 2, 3, 4], 2)), [10, 20, 30, 40])

@test("never has more than limit calls in flight")
async def _():
    fn, stats = tracked()
    await finish(map_limited(fn, list(range(10)), 3))
    eq(stats["peak"], 3, "peak calls in flight")

@test("starts the next item as soon as a slot frees up")
async def _():
    fn, stats = tracked({1: 0.05})   # item 1 is slow
    await finish(map_limited(fn, [1, 2, 3, 4], 2))
    events = stats["events"]
    check(
        events.index("start 4") < events.index("end 1"),
        "items 3 and 4 shouldn't wait for slow item 1 (no fixed batches)",
    )

@test("a limit above the number of items runs them all at once")
async def _():
    fn, stats = tracked()
    eq(await finish(map_limited(fn, [1, 2], 10)), [10, 20])
    eq(stats["peak"], 2)

@test("an empty list gives an empty list")
async def _():
    fn, stats = tracked()
    eq(await finish(map_limited(fn, [], 3)), [])

@test("a limit below 1 raises ValueError")
async def _():
    fn, stats = tracked()
    with raises(ValueError):
        await finish(map_limited(fn, [1, 2], 0))
```

```hint
`asyncio.Semaphore(limit)` hands out `limit` slots. `async with sem:` waits for a free slot and gives it back on the way out.
```

```hint
Wrap each call in a small inner `async def` that does `async with sem: return await fn(item)`, then `gather` all of the wrapped calls. The semaphore does the queueing for you.
```

```hint
Check `limit < 1` first: `asyncio.Semaphore(0)` is legal, and every call would wait for a slot forever.
```
:::

:::challenge id=async-first-success title="Promise.any" difficulty=hard
Write `async def first_success(coros)`, Python's `Promise.any`. It runs a list of coroutines concurrently and returns the result of the first one to **succeed**.

- A failure doesn't count as long as another coroutine might still succeed.
- As soon as there's a winner, cancel everything still running. `Promise.any` can't do that.
- If every coroutine fails, raise an `ExceptionGroup` (Python's `AggregateError`) containing all of the errors.
- If `coros` is empty, raise `ValueError`.

```js
async function firstSuccess(promises) {
  return Promise.any(promises); // AggregateError if all fail; losers keep running
}
```

```python starter
import asyncio

async def first_success(coros):
    ...
```

```python solution
import asyncio

async def first_success(coros):
    if not coros:
        raise ValueError("first_success() needs at least one coroutine")
    tasks = [asyncio.create_task(coro) for coro in coros]
    errors = []
    try:
        for next_done in asyncio.as_completed(tasks):
            try:
                return await next_done
            except Exception as exc:
                errors.append(exc)
    finally:
        for task in tasks:
            task.cancel()   # a no-op for tasks that already finished
    raise ExceptionGroup("every attempt failed", errors)
```

```python tests
import asyncio

async def attempt(name, delay, log, fail=False):
    try:
        await asyncio.sleep(delay)
    except asyncio.CancelledError:
        log.append(f"{name} cancelled")
        raise
    if fail:
        raise ConnectionError(f"{name} is down")
    return name

async def finish(coro):
    try:
        async with asyncio.timeout(2):
            return await coro
    except TimeoutError:
        check(False, "still running after 2 seconds: is something waiting forever?")

@test("returns the fastest success")
async def _():
    log = []
    result = await finish(first_success([attempt("slow", 0.05, log), attempt("fast", 0.01, log)]))
    eq(result, "fast")

@test("skips failures while another attempt can still succeed")
async def _():
    log = []
    result = await finish(first_success([
        attempt("broken", 0.01, log, fail=True),
        attempt("backup", 0.02, log),
    ]))
    eq(result, "backup")

@test("cancels the attempts still running once there's a winner")
async def _():
    log = []
    await finish(first_success([
        attempt("fast", 0.01, log),
        attempt("slow", 0.2, log),
        attempt("slower", 0.3, log),
    ]))
    await asyncio.sleep(0)   # let the cancellations land
    eq(sorted(log), ["slow cancelled", "slower cancelled"])

@test("raises an ExceptionGroup with every error when all fail")
async def _():
    log = []
    with raises(ExceptionGroup) as ctx:
        await finish(first_success([
            attempt("a", 0.01, log, fail=True),
            attempt("b", 0.02, log, fail=True),
        ]))
    eq(sorted(str(e) for e in ctx.exception.exceptions), ["a is down", "b is down"])

@test("an empty list raises ValueError")
async def _():
    with raises(ValueError):
        await first_success([])
```

```hint
Wrap the coroutines in tasks, then loop over `asyncio.as_completed(tasks)`. Each item it yields is an awaitable for the next task to finish: awaiting it returns that task's result or raises its exception.
```

```hint
Catch `Exception` around each `await` and collect the errors in a list. Do the cancelling in a `finally` so it runs whether you return a winner or not. Calling `cancel()` on a finished task does nothing.
```

```hint
When the loop ends without a winner, `raise ExceptionGroup("every attempt failed", errors)`.
```
:::
