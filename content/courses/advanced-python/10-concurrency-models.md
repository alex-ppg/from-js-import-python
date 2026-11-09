---
title: Concurrency Models: Threads, Processes & asyncio
part: Runtime & Concurrency
summary: The GIL, threads, process pools, asyncio cancellation and backpressure, contextvars and free-threading.
minutes: 45
---

Node gives you one concurrency model and a couple of escape hatches. Your JavaScript runs on a single thread around an event loop, libuv's thread pool quietly handles blocking file, DNS and crypto work, and `worker_threads` or `cluster` take over when you need more cores. Python's standard library ships three general-purpose models (threads, processes and asyncio), plus subinterpreters as of 3.14, and lets you mix them. Which one fits comes down to one question: does your workload spend its time *waiting* or *computing*?

[Async/Await & asyncio](lesson:async) covered the asyncio basics. This lesson covers the other models, the machinery underneath asyncio, the parts of asyncio that matter in production (cancellation, `shield`, backpressure and context variables), and how to choose. The sandbox can't start threads or processes, so those examples are static, but all the asyncio code runs.

## Waiting vs computing

:::compare
```js
// Node: your JS is single-threaded. Waits overlap for free,
// but computing blocks everything until it's finished.
const pages = await Promise.all(urls.map((url) => fetch(url)));
const key = crypto.pbkdf2Sync(password, salt, 600_000, 64, "sha512");
```
```python
# Python: choose a model per workload.
with ThreadPoolExecutor() as pool:            # overlap blocking waits
    pages = list(pool.map(download, urls))

with ProcessPoolExecutor() as pool:           # use every core for CPU work
    digests = list(pool.map(hash_file, paths))
```
:::

I/O-bound work spends its time waiting on sockets, disks and databases, and it speeds up when the waits overlap. CPU-bound work spends its time executing instructions, and it only speeds up when it runs on several cores at once. Node overlaps waits on one thread by design and sends CPU work to workers.

In Python, the GIL shapes the choice ([CPython Internals](lesson:cpython-internals) covers the mechanism). On the default build only one thread at a time executes Python bytecode, but a thread releases the lock whenever it blocks on I/O, and C extensions release it during heavy native work. So:

- **Threads** overlap waiting, even when the libraries you call are synchronous.
- **Processes** run Python in parallel, each with its own interpreter and GIL, at the price of copying data between them.
- **asyncio** overlaps waiting on a single thread, with far less overhead per task than a thread, but only through libraries written for it.
- **Free-threaded builds** (3.13t and 3.14t) let threads compute in parallel too.

asyncio makes the difference easy to see, because a single thread is exactly what the GIL gives pure-Python threads:

```python run
import asyncio
import time

async def wait(seconds):
    await asyncio.sleep(seconds)          # waiting: the loop runs others meanwhile

async def compute(n):
    while n:                              # computing: nothing else runs meanwhile
        n -= 1

async def timed(label, jobs):
    start = time.perf_counter()
    await asyncio.gather(*jobs)
    print(f"{label}: {time.perf_counter() - start:.2f}s")

async def main():
    await timed("1 wait    ", [wait(0.05)])
    await timed("4 waits   ", [wait(0.05) for _ in range(4)])
    await timed("1 compute ", [compute(1_000_000)])
    await timed("4 computes", [compute(1_000_000) for _ in range(4)])

asyncio.run(main())
```

Four waits take as long as one. Four computations take four times as long, and four threads on the default build would do no better.

| | Threads | Processes | asyncio |
| --- | --- | --- | --- |
| Overlaps I/O waits | yes | yes | yes, with async libraries |
| Runs Python code in parallel | only on free-threaded builds | yes | no |
| Shares memory | everything | nothing by default: data is pickled | everything, on one thread |
| Switches between tasks | anywhere, preemptively | not applicable | only at an `await` |
| Cost of one more | an OS thread | a whole interpreter | a small Python object |
| Node analogue | libuv's pool, `worker_threads` | `cluster`, `child_process` | the event loop |

## Threads: one heap, real races

:::compare
```js
// worker_threads: a separate heap, so you pass messages
const { Worker } = require("node:worker_threads");
const worker = new Worker("./thumbnail.js", { workerData: { path } });
worker.on("message", (thumb) => thumbs.set(path, thumb));
worker.on("error", reportError);
```
```python
# threading: one heap, so threads share every object
import threading

def make_thumbnail(path, thumbs):
    thumbs[path] = render(path)        # writes straight into shared state

thumbs = {}
worker = threading.Thread(target=make_thumbnail, args=(path, thumbs))
worker.start()
worker.join()                          # wait for it to finish
```
:::

A Python thread is an OS thread inside the same interpreter. It sees every module, global and object the main thread sees, so there's no `postMessage`, no structured clone and no `SharedArrayBuffer`: everything is already shared. That's convenient, and it's the source of every threading bug. `start()` launches the thread and `join()` waits for it to exit. A thread has no return value and no rejection either: an exception inside `target` is printed by `threading.excepthook`, the thread ends, and `join()` returns normally. To get results and errors back, use an executor ([next section](#concurrent-futures-pools-and-futures)).

Shared state needs locks because Python statements aren't atomic. Here's what `hits += 1` compiles to:

```python run
import dis

hits = 0

def record_hit():
    global hits
    hits += 1

dis.dis(record_hit)
```

Load the global, load 1, add, store: four steps, and nothing makes them one unit. Whether another thread actually slips in between depends on the build. The default build only switches threads at certain instructions, so this exact race can pass every test you write. Any blocking call between a read and its write makes interleaving near-certain, and on the free-threaded build both threads run at the same moment. Lock every read-modify-write of shared state:

```python
import threading
import time

class Account:
    def __init__(self):
        self.balance = 0
        self.lock = threading.Lock()

    def deposit(self, amount):
        with self.lock:                     # one thread at a time in here
            current = self.balance
            time.sleep(0)                   # stand-in for I/O: releases the GIL
            self.balance = current + amount

def deposit_many(account, times):
    for _ in range(times):
        account.deposit(1)

account = Account()
threads = [threading.Thread(target=deposit_many, args=(account, 2_000)) for _ in range(4)]
for t in threads:
    t.start()
for t in threads:
    t.join()
print(account.balance)                      # 8000; without the lock, far less
```

The rest of the toolbox:

- **`threading.Lock`** is a mutex: `with lock:` acquires it and always releases it. An `RLock` can be re-acquired by the thread that already holds it.
- **`threading.Event`** is a flag threads can wait on (`event.wait(timeout)`, `event.set()`), the usual way to ask a worker to stop.
- **`queue.Queue`** is a thread-safe FIFO and the best way to hand work between threads. `put()` and `get()` block, `maxsize` adds backpressure, and 3.13's `shutdown()` tells the consumers that no more work is coming.
- **`threading.local()`** gives each thread its own attributes. `Condition`, `Semaphore` and `Barrier` round out the set.

```python
import queue
import threading

jobs = queue.Queue(maxsize=100)       # put() blocks when full

def worker():
    while True:
        try:
            path = jobs.get()
        except queue.ShutDown:        # 3.13+: shut down and drained
            return
        resize(path)

threads = [threading.Thread(target=worker) for _ in range(4)]
for t in threads:
    t.start()
for path in paths:
    jobs.put(path)
jobs.shutdown()                       # workers exit once the queue is empty
for t in threads:
    t.join()
```

:::gotcha Daemon threads die mid-sentence
A thread started with `daemon=True` doesn't keep the program alive, which sounds handy for background work. At exit it's stopped abruptly: its `finally` blocks may never run, and open files and database transactions can be left half-done. Give long-running workers a `threading.Event` to check, set it at shutdown, and `join()` them.
:::

:::quiz
On the default (GIL) build, several threads run one of these lines at the same time. Which one can lose updates?

- [ ] `cache[key] = value`
- [ ] `results.append(item)`
- [x] `counts[word] = counts.get(word, 0) + 1`
- [ ] `jobs.put(item)` on a `queue.Queue`

A single operation on a built-in container, such as one `append` or one `d[k] = v` with ordinary keys, is atomic in CPython: the GIL guarantees it on the default build, and per-object locks do on the free-threaded build. `queue.Queue` has its own lock. The counter line is a read followed by a separate write, and another thread can update `counts[word]` in between, so one increment overwrites the other.
:::

## `concurrent.futures`: pools and futures

:::compare
```js
import pMap from "p-map";

// a pool of 8 concurrent jobs, results in input order
const sizes = await pMap(urls, fetchSize, { concurrency: 8 });
```
```python
from concurrent.futures import ThreadPoolExecutor


# a pool of 8 worker threads, results in input order
with ThreadPoolExecutor(max_workers=8) as pool:
    sizes = list(pool.map(fetch_size, urls))
```
:::

`concurrent.futures` puts one interface, `Executor`, over every pool. `submit(fn, *args, **kwargs)` schedules a call and returns a `Future`. `map(fn, *iterables)` returns results in input order and re-raises a call's exception when iteration reaches its result. `shutdown(wait=True, cancel_futures=False)` stops accepting work, and a `with` block calls it for you, waiting for everything to finish. `ThreadPoolExecutor`, `ProcessPoolExecutor` and 3.14's `InterpreterPoolExecutor` all implement it, so switching models is a one-line change. A thread pool defaults to `min(32, (os.process_cpu_count() or 1) + 4)` workers (3.13+), and a process pool to one per CPU.

A `concurrent.futures.Future` is the blocking cousin of a promise. `result(timeout=None)` waits, blocking the calling thread, and then returns the value or re-raises the exception. `exception()` returns the exception instead, `done()` and `running()` report state, `add_done_callback(fn)` is `.then()`, and `cancel()` only succeeds if the call hasn't started yet. `as_completed(futures)` yields futures as they finish, and `wait(futures, return_when=FIRST_COMPLETED)` returns `(done, not_done)` sets.

```python
from concurrent.futures import ThreadPoolExecutor, as_completed

with ThreadPoolExecutor(max_workers=8) as pool:
    futures = {pool.submit(fetch_size, url): url for url in urls}
    for future in as_completed(futures):      # in completion order
        url = futures[future]
        try:
            print(url, future.result())
        except OSError as exc:
            print(url, "failed:", exc)
```

The pools need threads, but a `Future` on its own doesn't, so you can poke at the API here. Executors create futures and their workers call `set_result()` or `set_exception()`; this playground plays the worker:

```python run raises
from concurrent.futures import Future

future = Future()
future.add_done_callback(lambda f: print("callback got", f.result()))
print(future.done())
future.set_result(1024)                 # what a worker does when the call returns
print(future.done(), future.result())

failed = Future()
failed.set_exception(ValueError("bad SKU"))
print(repr(failed.exception()))
failed.result()                         # re-raises the ValueError
```

:::gotcha `map` submits everything at once
`pool.map(fn, items)` collects the whole iterable and submits every call immediately, even if you only consume the first result, so a huge or infinite iterable is a problem. 3.14 adds `buffersize=` to cap how many submitted calls can be waiting for you to collect their results. Errors wait, too: an exception surfaces only when iteration reaches that item, so consume the results inside the `with` block and catch errors where you iterate.
:::

:::tip Bridges to asyncio
`await asyncio.to_thread(fn, *args)` runs a blocking function on a worker thread without blocking the event loop. `await loop.run_in_executor(pool, fn, *args)` does the same for any executor, including a process pool, and `asyncio.wrap_future(f)` turns a `concurrent.futures.Future` into something you can `await`.
:::

## Processes: parallel by copying

:::compare
```js
// child_process.fork: a separate process, messages over IPC
import { fork } from "node:child_process";

const child = fork("./resize.js");
child.send({ path });                    // serialised to the child
child.on("message", (thumb) => save(thumb));
```
```python
from concurrent.futures import ProcessPoolExecutor

def resize(path):                        # top level: workers import it by name
    ...

if __name__ == "__main__":               # required: workers re-import this file
    with ProcessPoolExecutor() as pool:
        thumbs = list(pool.map(resize, paths, chunksize=16))
```
:::

Each worker in a process pool is a separate Python process with its own interpreter and its own GIL, so CPU-bound Python runs in parallel on any build. The cost is that everything crossing the boundary is **pickled**: the function (by its importable name), its arguments and its result. It's structured clone with stricter rules. Lambdas, nested functions and open connections can't be pickled, and functions must live at the top level of an importable module. Pickling and process start-up both cost time, so give each call a decent chunk of work, and pass `chunksize=` to `map` to batch many small items per round trip.

```python run raises
import pickle

def apply_discount(order):                  # top level: pickled as a reference
    return order["total"] * 0.9

print(len(pickle.dumps(apply_discount)), "bytes")
pickle.dumps(lambda order: order["total"] * 0.9)
```

How workers start depends on the *start method*. `spawn` launches a fresh interpreter that imports your main module, and is the default on Windows and macOS. `fork` copies the parent process, which is fast but unsafe if the parent has threads. `forkserver` forks workers from a clean server process, and since 3.14 it's the default on Linux and the other Unix platforms except macOS, replacing `fork`. To share state between processes, use `multiprocessing.Queue`, a `Manager`, or `multiprocessing.shared_memory` for raw buffers.

:::gotcha Forgetting `if __name__ == "__main__":`
Under `spawn` and `forkserver`, each worker imports your main module to find the function it should run. Without the guard, that import runs your pool-creating code again inside the worker. `multiprocessing` stops the recursion with a `RuntimeError` about starting a new process before the current one has finished its bootstrapping phase, and the parent's pool fails with `BrokenProcessPool`. Keep everything with side effects under the guard.
:::

### Subinterpreters (3.14)

3.14 adds a third option between threads and processes. `concurrent.interpreters` (PEP 734) exposes multiple interpreters inside one process, and `concurrent.futures.InterpreterPoolExecutor` runs one per worker thread. Each interpreter has its own GIL and its own modules and objects, so CPU-bound code runs in parallel without spawning processes. The isolation is still process-like: calls, arguments and results are pickled, mutable objects can't be shared, and many third-party C extensions don't support subinterpreters yet. Pyodide doesn't include them, so this is static:

```python
from concurrent.futures import InterpreterPoolExecutor

with InterpreterPoolExecutor(max_workers=4) as pool:
    digests = list(pool.map(hash_chunk, chunks))
```

## Inside asyncio: a loop you could write

:::compare
```js
// An async function is a state machine. When the promise
// it awaits settles, the engine resumes it from the
// microtask queue.
async function poll(url) {
  const res = await fetch(url);
  return res.status;
}
```
```python
# A coroutine is a suspended frame. When the future it's
# waiting on completes, its Task resumes it by calling
# coro.send().
async def poll(url):
    res = await client.get(url)
    return res.status_code
```
:::

Coroutines use the generator protocol (see [Generators in Depth](lesson:generators-in-depth)): `coro.send(None)` runs a coroutine until it suspends, and finishing raises `StopIteration` carrying the return value. That's all a Task does to its coroutine:

```python run
async def checkout():
    return "receipt-17"

coro = checkout()
try:
    coro.send(None)              # what a Task does: run to the next suspension
except StopIteration as done:    # ...which, here, is the end
    print("returned:", done.value)
```

With that, an event loop fits in twenty lines. `types.coroutine` turns a generator into something `async def` code can `await`, so `sleep()` below suspends its caller by yielding a delay up through the `await` chain to the loop. The loop keeps a heap of `(wake_time, coroutine)` pairs and a fake clock, so it runs instantly:

```python run
import heapq
import types

clock = 0.0

@types.coroutine
def sleep(seconds):
    yield seconds                  # hand the delay to the loop and pause

async def ticker(name, interval, ticks):
    for _ in range(ticks):
        await sleep(interval)
        print(f"{clock:.1f}s  {name}")

def run(*coros):
    global clock
    timers = [(0.0, n, coro) for n, coro in enumerate(coros)]
    count = len(timers)
    while timers:
        clock, _, coro = heapq.heappop(timers)
        try:
            delay = coro.send(None)          # resume until its next await
        except StopIteration:
            continue                          # the coroutine returned
        count += 1                            # tie-breaker: first come, first served
        heapq.heappush(timers, (clock + delay, count, coro))

run(ticker("fast", 0.5, 3), ticker("slow", 1.0, 2))
```

asyncio adds one layer. When a coroutine awaits something that isn't ready, the chain of `await`s ends in a `Future` yielded up to the Task, which registers a done-callback on that future and goes dormant. The loop itself only ever runs callbacks: the ready queue (`call_soon`), timers (`call_later`), and I/O readiness from the operating system (`selectors`, or IOCP on Windows). When the future completes, its callback schedules the Task's next step, which resumes the coroutine with `send()`, and the `await` that was waiting picks up the future's result. Nothing is preempted. A task runs until it awaits something that isn't ready, which is why one blocking call freezes every task, and also why code between two `await`s never interleaves with other tasks.

:::quiz output
What does this print?

```python
import asyncio

async def main():
    loop = asyncio.get_running_loop()
    log = []
    loop.call_soon(log.append, "callback")
    task = asyncio.create_task(asyncio.sleep(0, "task"))
    log.append("main")
    log.append(await task)
    print(log)

asyncio.run(main())
```

- [ ] `['callback', 'task', 'main']`
- [x] `['main', 'callback', 'task']`
- [ ] `['main', 'task', 'callback']`
- [ ] `['callback', 'main', 'task']`

`call_soon` and `create_task` only queue work, so `main` keeps running until it awaits. Then the loop works through its ready queue in order: the callback, then the task's first step. `asyncio.sleep(0, "task")` yields once and returns its second argument, which `main` receives last.
:::

:::note This page's loop is the browser's
On desktop, `asyncio.run` creates a selector-based loop (a proactor loop on Windows). Pyodide swaps in its `WebLoop`, which hands callbacks and timers to the browser's own event loop. Ordinary code can't tell the difference, but the relative order of callbacks scheduled for the same instant can differ from CPython's, so never depend on it.
:::

:::deep Who's waiting on whom? (3.14)
3.14 can print a running program's await graph. `asyncio.print_call_graph()` prints the current task, its coroutine stack and the tasks awaiting it, and `asyncio.capture_call_graph()` returns the same information as data. From a terminal, `python -m asyncio ps <PID>` lists every task in a running process and `python -m asyncio pstree <PID>` draws the tree, which is the fastest way to find out what a stuck service is waiting for.
:::

## Cancellation in depth

:::compare
```js
const controller = new AbortController();
const saving = saveOrder(order, { signal: controller.signal });
controller.abort("client went away");
try {
  await saving;
} catch (err) {
  console.log(controller.signal.reason);   // "client went away"
}
```
```python
saving = asyncio.create_task(save_order(order))
await asyncio.sleep(0)                     # let it start
saving.cancel("client went away")
try:
    await saving
except asyncio.CancelledError as exc:
    print(exc.args)                        # ('client went away',)
```
:::

[The async lesson](lesson:async#cancellation-an-abortcontroller-in-every-task) covered the basics: `task.cancel()` throws `CancelledError` into the task at its current `await`, and you must re-raise it. Production code needs four more facts:

1. **It's a request, delivered later.** `cancel()` returns `True` if the task was still running, and the error arrives the next time the loop runs that task. `cancel(msg)` attaches a reason, which reaches whoever awaits the task.
2. **Cleanup can await.** An `except CancelledError:` or `finally:` block can `await`, to roll back a transaction or close a connection, before re-raising.
3. **A task cancelled before it starts never runs**, so none of its code executes, cleanup included.
4. **Cancellations are counted.** `task.cancelling()` returns the number of pending cancel requests, and `task.uncancel()` withdraws one. `asyncio.timeout` and `TaskGroup` use the pair to tell their own cancellation apart from one aimed at the whole task, which is how they nest. Your code should almost never call `uncancel()`.

```python run
import asyncio

async def save_order(order_id):
    try:
        await asyncio.sleep(1)                 # the slow write
    except asyncio.CancelledError as exc:
        print(f"rolling back {order_id}: {exc.args[0]}")
        await asyncio.sleep(0.01)              # cleanup may await
        raise                                  # always re-raise
    return "saved"

async def main():
    task = asyncio.create_task(save_order("A-17"))
    await asyncio.sleep(0.01)
    task.cancel("client went away")
    try:
        await task
    except asyncio.CancelledError as exc:
        print("caller sees:", exc.args, "| cancelled:", task.cancelled())

asyncio.run(main())
```

:::quiz output
What does this print?

```python
import asyncio

async def job():
    try:
        await asyncio.sleep(1)
    finally:
        print("cleanup", end=" ")

async def main():
    task = asyncio.create_task(job())
    await asyncio.sleep(0)
    print(task.cancel(), end=" ")
    try:
        await task
    except asyncio.CancelledError:
        print(task.cancel())

asyncio.run(main())
```

- [x] `True cleanup False`
- [ ] `cleanup True False`
- [ ] `True cleanup True`
- [ ] `True False`

`cancel()` returns `True` because the task is suspended in `sleep`. The `CancelledError` lands there, so the `finally` block prints `cleanup` as the task unwinds. Once the task is done, `cancel()` has nothing to do and returns `False`.
:::

### Timeouts are cancellations

`asyncio.timeout()` has no interruption mechanism of its own. When the deadline passes, it cancels the current task, catches the resulting `CancelledError` as it leaves the `async with` block, and raises `TimeoutError` in its place. So code inside the block sees `CancelledError`, and only code outside it can catch `TimeoutError`. Timeouts nest: an inner one firing doesn't disturb the outer one. The deadline can also move: `cm.reschedule(when)` takes an absolute `loop.time()` value, `asyncio.timeout(None)` starts with no deadline at all, and `asyncio.timeout_at(when)` takes an absolute deadline from the start.

```python run
import asyncio

async def main():
    loop = asyncio.get_running_loop()
    async with asyncio.timeout(2):                      # the overall budget
        try:
            async with asyncio.timeout(0.02):           # one attempt's budget
                await asyncio.sleep(1)
        except TimeoutError:
            print("attempt timed out; the overall budget is still running")

        async with asyncio.timeout(0.1) as cm:
            await asyncio.sleep(0.01)
            cm.reschedule(loop.time() + 0.5)            # progress: extend it
            await asyncio.sleep(0.15)
            print("survived past the original deadline; expired:", cm.expired())

asyncio.run(main())
```

:::quiz output
What does this print?

```python
import asyncio

async def main():
    try:
        async with asyncio.timeout(0.01):
            try:
                await asyncio.sleep(1)
            except asyncio.CancelledError:
                print("inside: CancelledError", end=" | ")
                raise
    except TimeoutError:
        print("outside: TimeoutError")

asyncio.run(main())
```

- [ ] `inside: TimeoutError | outside: TimeoutError`
- [x] `inside: CancelledError | outside: TimeoutError`
- [ ] `inside: CancelledError | outside: CancelledError`
- [ ] `outside: TimeoutError`

The deadline cancels the task, so the code being interrupted sees an ordinary `CancelledError` and must re-raise it. The `timeout` block recognises its own cancellation on the way out and converts it into `TimeoutError`.
:::

### `shield`: finish what you started

Some work must not stop halfway, such as charging a card or committing a write, even if the request that started it is cancelled. `asyncio.shield(aw)` protects the awaitable from cancellations aimed at the caller. The caller still gets `CancelledError` and unwinds, while the shielded task keeps running in the background. JavaScript has no equivalent, because nothing in JS cancels a promise in the first place.

```python run
import asyncio

background = set()

async def charge_card(order_id):
    await asyncio.sleep(0.05)                  # must not stop halfway
    print(f"charged {order_id}")

async def checkout(order_id):
    payment = asyncio.create_task(charge_card(order_id))
    background.add(payment)                    # keep a strong reference
    payment.add_done_callback(background.discard)
    try:
        await asyncio.shield(payment)
    except asyncio.CancelledError:
        print("checkout cancelled; payment still running:", not payment.done())
        raise

async def main():
    request = asyncio.create_task(checkout("A-17"))
    await asyncio.sleep(0.01)
    request.cancel()
    try:
        await request
    except asyncio.CancelledError:
        print("request cancelled")
    await asyncio.gather(*background)          # let shielded work finish

asyncio.run(main())
```

:::gotcha `shield` protects the task, not the program
The event loop only holds weak references to tasks, so keep your own reference to the shielded task (the `background` set above) or it can be garbage-collected mid-flight. And `asyncio.run()` cancels every task still pending when `main()` returns, shielded or not, so await shielded work before shutting down. (This sandbox's browser loop doesn't cancel leftover tasks, so desktop CPython is stricter here.)
:::

### TaskGroup: one failure cancels the rest

[TaskGroup](lesson:async#taskgroup-structured-concurrency) is cancellation used as a policy. The exact rules:

- When a task fails with anything other than `CancelledError`, the group cancels its other tasks, and also cancels the body of the `async with` block if it's still running. That `CancelledError` interrupts the body's current `await` but doesn't escape the block.
- Once every task has finished, the failures are raised together as an `ExceptionGroup` (see [Exception groups](lesson:exceptions#exception-groups-and-notes)). If the body itself raises, it's treated the same way.
- `KeyboardInterrupt` and `SystemExit` are re-raised as themselves, not wrapped.
- Once the group has finished, or while it's shutting down, `create_task()` raises `RuntimeError`.

```python run
import asyncio

async def step(name, delay, fail=False):
    try:
        await asyncio.sleep(delay)
    except asyncio.CancelledError:
        print(f"{name}: cancelled")
        raise
    if fail:
        raise ValueError(f"{name} failed")
    print(f"{name}: done")

async def main():
    try:
        async with asyncio.TaskGroup() as tg:
            tg.create_task(step("charge", 0.01, fail=True))
            tg.create_task(step("email", 0.3))
            await step("body", 0.5)            # the body is cancelled too
    except* ValueError as group:
        print("raised:", group.exceptions)

asyncio.run(main())
```

There's no `tg.cancel()`. To stop a group on purpose, the documented recipe is a task that raises a private exception, which you then catch with `except*`:

```python
class Shutdown(Exception):
    """Raised on purpose to stop a TaskGroup."""

async def stop_when(event):
    await event.wait()
    raise Shutdown

try:
    async with asyncio.TaskGroup() as tg:
        tg.create_task(serve_forever())
        tg.create_task(stop_when(shutdown_requested))
except* Shutdown:
    pass                          # every task has been cancelled and awaited
```

## Backpressure: bounded queues

:::compare
```js
// Node streams: write() returns false once the buffer passes
// highWaterMark; wait for "drain" before writing more.
for (const row of rows) {
  if (!out.write(serialize(row))) {
    await once(out, "drain");
  }
}
```
```python
# asyncio: a bounded queue makes put() wait while it's full.
queue = asyncio.Queue(maxsize=100)

for row in rows:
    await queue.put(row)      # suspends until a consumer makes room
```
:::

An unbounded buffer between a fast producer and a slow consumer is a memory leak with extra steps. Node streams push back with `highWaterMark` and the `drain` event. asyncio uses a bounded `asyncio.Queue(maxsize=n)`: `await queue.put(item)` waits while the queue is full, so the producer runs at the consumer's pace, and `get()` waits while it's empty. `put_nowait()` raises `asyncio.QueueFull` instead of waiting, which is how you shed load rather than queue it. `task_done()` plus `await queue.join()` waits until every item has been processed, and `shutdown()` (3.13+) tells consumers that nothing more is coming.

```python run
import asyncio

async def producer(queue, log):
    for n in range(1, 7):
        await queue.put(n)                     # waits while the queue is full
        log.append(f"put {n} (size {queue.qsize()})")
    queue.shutdown()                           # 3.13+: no more items

async def consumer(queue, log):
    try:
        while True:
            n = await queue.get()
            await asyncio.sleep(0.01)          # a slow consumer
            log.append(f"    got {n}")
    except asyncio.QueueShutDown:              # shut down and drained
        pass

async def main():
    queue, log = asyncio.Queue(maxsize=2), []
    async with asyncio.TaskGroup() as tg:
        tg.create_task(producer(queue, log))
        tg.create_task(consumer(queue, log))
    print(*log, sep="\n")

asyncio.run(main())
```

The producer fills the queue, then moves only as fast as the consumer drains it. A semaphore solves a different problem: [`Semaphore(n)`](lesson:async#limiting-concurrency-semaphore-and-queue) caps how many calls run at once, while a bounded queue caps how much work piles up between two stages. Use `BoundedSemaphore` when releasing more often than you acquired would be a bug, since it raises `ValueError` instead of silently raising the limit.

:::quiz output
What does this print?

```python
import asyncio

queue = asyncio.Queue()
for n in range(1000):
    queue.put_nowait(n)
print(queue.full(), queue.qsize())
```

- [ ] `True 1000`
- [x] `False 1000`
- [ ] `QueueFull`
- [ ] `True 0`

`maxsize` defaults to `0`, which means *unbounded*, so the queue is never full and `put_nowait` never raises. `asyncio.Queue(0)` gives you no backpressure at all.
:::

## Context variables: `AsyncLocalStorage` for Python

:::compare
```js
import { AsyncLocalStorage } from "node:async_hooks";
const requestId = new AsyncLocalStorage();

function log(msg) {
  console.log(`[${requestId.getStore() ?? "-"}] ${msg}`);
}

app.use((req, res, next) => requestId.run(req.id, next));
```
```python
from contextvars import ContextVar

request_id = ContextVar("request_id", default="-")

def log(msg):
    print(f"[{request_id.get()}] {msg}")


async def middleware(request, call_next):
    with request_id.set(request.id):     # 3.14+; older: set() and reset(token)
        return await call_next(request)
```
:::

A `ContextVar` is a key into the *current context*, a mapping that asyncio switches as it runs different tasks. `var.get()` reads the value, falling back to the default. `var.set(value)` changes it in the current context and returns a `Token`, and `var.reset(token)` restores the previous value. In 3.14 the token is also a context manager, so `with var.set(value):` resets on the way out. Every Task runs in a **copy** of the context taken when the task was created, so a value set inside a task never leaks out to the code that started it, and concurrent requests can't see each other's values. That's the guarantee `AsyncLocalStorage` gives you in Node.

`threading.local()`, the classic per-thread storage, can't do this job, because every task runs on the same thread:

```python run
import asyncio
import threading
from contextvars import ContextVar

local = threading.local()
current_user = ContextVar("current_user")

async def handle(user, delay):
    local.user = user
    current_user.set(user)
    await asyncio.sleep(delay)
    print(f"{user}: threading.local says {local.user!r}, ContextVar says {current_user.get()!r}")

async def main():
    await asyncio.gather(handle("ada", 0.02), handle("linus", 0.01))

asyncio.run(main())
```

:::quiz output
What does this print?

```python
import asyncio
from contextvars import ContextVar

user = ContextVar("user", default="anonymous")

async def login(name):
    user.set(name)

async def main():
    await asyncio.create_task(login("ada"))
    await login("linus")
    print(user.get())

asyncio.run(main())
```

- [ ] `anonymous`
- [ ] `ada`
- [x] `linus`
- [ ] `LookupError`

The task ran in a copy of `main`'s context, so its `set("ada")` vanished with the task. But `await login("linus")` is a plain call: the coroutine runs in `main`'s own context, so its `set()` sticks. Awaiting directly shares your context; only tasks get a copy. Code that sets a variable for someone else must reset it.
:::

Outside asyncio, `contextvars.copy_context()` snapshots the current context and `ctx.run(fn, *args)` runs a function inside it, which is how you carry values into callbacks. `asyncio.to_thread()` copies the context into its worker thread for you, but `loop.run_in_executor()` doesn't, so wrap the call with `ctx.run` there. Plain threads start with an *empty* context on the default build. 3.14 adds `threading.Thread(context=...)` to choose, and on free-threaded builds new threads inherit a copy of the starting thread's context by default (`sys.flags.thread_inherit_context`).

:::gotcha Create context variables at module level
The docs are explicit: create each `ContextVar` once, at module level, never inside functions or closures. Contexts hold strong references to every variable set in them, so a variable created per call is never garbage-collected.
:::

## Free-threaded Python

:::compare
```js
// JS shares memory between workers only as raw bytes,
// coordinated with Atomics.
const counts = new Int32Array(new SharedArrayBuffer(4 * 26));
Atomics.add(counts, letterIndex, 1);     // safe from any worker
```
```python
# python3.14t: threads share real objects and run in parallel,
# so compound updates still need a lock.
import threading

counts = {}
lock = threading.Lock()

def tally(words):
    for word in words:
        with lock:
            counts[word] = counts.get(word, 0) + 1
```
:::

On a free-threaded build (`python3.14t`, see [CPython Internals](lesson:cpython-internals)), threads execute Python bytecode in parallel. CPU-bound thread pools finally scale with your cores, and you get `worker_threads`-style parallelism with none of the copying. What changes for your code:

- **Correct threaded code stays correct.** Built-in containers protect their own internals with per-object locks, so a single `append`, `d[k] = v` or `s.add(x)` is still safe, and your locks work exactly as before.
- **Races you got away with get likelier.** A read-modify-write such as `counts[word] = counts.get(word, 0) + 1` is two operations, and with real parallelism another thread really will land between them. Sharing one iterator between threads isn't safe either.
- **Extensions must opt in.** Importing a C extension that hasn't declared free-threading support turns the GIL back on, with a warning. `PYTHON_GIL=0` forces it off anyway, at your own risk, and `sys._is_gil_enabled()` tells you what you ended up with.
- **Single-threaded code pays a little**: roughly 5–10% in 3.14, according to the release notes. Free-threaded builds don't support the JIT.

asyncio gained first-class free-threading support in 3.14 too, so separate event loops in separate threads run in parallel. Pyodide is a GIL build with no threads, so everything in this section is static.

:::tip Free-threading rewards the same design
Threads that hand work to each other through a `queue.Queue` and keep their own state to themselves were already the safe design. Free-threading makes that design faster. It doesn't make shared mutable state any safer.
:::

## Choosing a model

| Workload | Reach for | Node analogue | Why |
| --- | --- | --- | --- |
| Thousands of concurrent network waits: servers, crawlers, websockets | asyncio | the event loop | tasks are cheap; needs async libraries all the way down |
| Blocking I/O through sync libraries (requests, boto3, database drivers) | `ThreadPoolExecutor`, or `asyncio.to_thread` from async code | libuv's thread pool | the GIL is released while they wait |
| CPU-bound pure Python | `ProcessPoolExecutor` (or 3.14's `InterpreterPoolExecutor`) | `cluster`, `child_process`, `worker_threads` | a GIL per worker; data is pickled |
| CPU-bound work over big shared data | a free-threaded build plus threads | `worker_threads` + `SharedArrayBuffer` | real parallelism, no copying; check your extensions |
| Number crunching | NumPy, Polars and friends | native addons, WebAssembly | vectorised native code that releases the GIL |
| A mix of the above | asyncio, offloading with `to_thread` and `run_in_executor` | an event loop plus workers | one loop owns the I/O |

The models compose. A typical service runs one asyncio loop and pushes the parts that don't fit onto pools:

```python
import asyncio
from concurrent.futures import ProcessPoolExecutor

async def handle_upload(upload, pool):
    raw = await upload.read()                                      # async I/O
    loop = asyncio.get_running_loop()
    thumb = await loop.run_in_executor(pool, make_thumbnail, raw)  # CPU: a worker process
    await asyncio.to_thread(legacy_storage.save, thumb)            # sync I/O: a thread
    return thumb

async def main():
    with ProcessPoolExecutor() as pool:
        await serve(lambda upload: handle_upload(upload, pool))
```

## Cheat sheet

| JavaScript / Node | Python | Notes |
| --- | --- | --- |
| `new Worker(file)` | `threading.Thread(target=fn).start()` | shares the whole heap |
| `worker.on("exit")` | `thread.join()` | no return value; errors go to stderr |
| `postMessage` between workers | `queue.Queue` | thread-safe; `maxsize` for backpressure |
| `Atomics` / a mutex | `threading.Lock`, `with lock:` | lock every read-modify-write |
| `p-map` with `concurrency` | `ThreadPoolExecutor(n).map(fn, xs)` | results in input order |
| `Promise` | `concurrent.futures.Future` | `.result()` blocks; `.add_done_callback()` |
| settle-order iteration | `as_completed(futures)` | |
| `cluster`, `child_process.fork` | `ProcessPoolExecutor` | needs the `__main__` guard |
| structured clone | `pickle` | no lambdas or nested functions |
| libuv thread pool | `await asyncio.to_thread(fn, *args)` | copies context variables |
| `controller.abort(reason)` | `task.cancel(msg)` | `CancelledError` carries `msg` |
| `AbortSignal.timeout(ms)` | `async with asyncio.timeout(s):` | `TimeoutError` outside the block |
| (none) | `asyncio.shield(task)` | the inner task survives; keep a reference |
| `highWaterMark` + `drain` | `asyncio.Queue(maxsize)` | `await put()` waits; `0` is unbounded |
| `AsyncLocalStorage` | `contextvars.ContextVar` | each task gets a copy of the context |
| `als.run(store, fn)` | `with var.set(value):` | 3.14+; older: `reset(token)` |
| `SharedArrayBuffer` + `Atomics` | free-threaded `python3.14t` | shared objects, real parallelism |

## Challenges

:::challenge id=conc-request-context title="Request IDs in every log line" difficulty=easy
Every log line a request produces should carry its request ID, across `await`s and with many requests in flight, which is what `AsyncLocalStorage` gives you in Node. Using the module-level `request_id` context variable:

- `log(message)` returns the line `"[<id>] <message>"` for the current request ID (`-` outside any request).
- `async def handle(rid, work)` makes `rid` the current request ID while it awaits `work()`, returns `work()`'s result, and restores the previous ID afterwards, even if `work()` raises.

The tests run several `handle` calls concurrently, and also await `handle` directly, where nothing copies the context for you.

```js
import { AsyncLocalStorage } from "node:async_hooks";
const requestId = new AsyncLocalStorage();

const log = (message) => `[${requestId.getStore() ?? "-"}] ${message}`;
const handle = (rid, work) => requestId.run(rid, work);
```

```python starter
from contextvars import ContextVar

request_id = ContextVar("request_id", default="-")

def log(message):
    ...

async def handle(rid, work):
    ...
```

```python solution
from contextvars import ContextVar

request_id = ContextVar("request_id", default="-")

def log(message):
    return f"[{request_id.get()}] {message}"

async def handle(rid, work):
    with request_id.set(rid):          # 3.14+: the token resets on exit
        return await work()
```

```python tests
import asyncio

async def finish(coro):
    try:
        async with asyncio.timeout(2):
            return await coro
    except TimeoutError:
        check(False, "still running after 2 seconds: is something waiting forever?")

@test("log uses '-' outside any request")
def _():
    eq(log("booting"), "[-] booting")

@test("log inside handle carries the request id")
async def _():
    async def work():
        return log("loading cart")
    eq(await finish(handle("r1", work)), "[r1] loading cart")

@test("concurrent requests keep their own ids across awaits")
async def _():
    lines = []
    def make_work(delay):
        async def work():
            lines.append(log("start"))
            await asyncio.sleep(delay)
            lines.append(log("end"))
        return work
    await finish(asyncio.gather(
        handle("r1", make_work(0.01)),          # starts first, finishes first
        handle("r2", make_work(0.03)),
        handle("r3", make_work(0.02)),
    ))
    eq(sorted(lines), ["[r1] end", "[r1] start", "[r2] end", "[r2] start", "[r3] end", "[r3] start"])

@test("restores the previous id when awaited directly")
async def _():
    async def work():
        return log("inside")
    await finish(handle("r2", work))
    eq(log("after"), "[-] after", "awaiting handle() directly shares your context: reset the variable")

@test("nested handles restore the outer id")
async def _():
    async def inner():
        return log("inner")
    async def outer():
        first = await handle("inner-id", inner)
        return first, log("outer")
    eq(await finish(handle("outer-id", outer)), ("[inner-id] inner", "[outer-id] outer"))

@test("restores the id even when work raises")
async def _():
    async def broken():
        raise ValueError("card declined")
    with raises(ValueError):
        await finish(handle("r3", broken))
    eq(log("after"), "[-] after")
```

```hint
`request_id.get()` returns the current value, or the default `"-"`.
```

```hint
`token = request_id.set(rid)` changes the value and returns a token; `request_id.reset(token)` puts the old value back. Do the reset in a `finally` so it also runs when `work()` raises.
```

```hint
In 3.14 the token is a context manager: `with request_id.set(rid): return await work()` does the set and the reset for you.
```
:::

:::challenge id=conc-no-overselling title="No overselling" difficulty=medium
This inventory service oversells under load. Two concurrent reservations both see the last unit in stock, both `await` the database write, and both succeed. Fix `reserve(sku, qty)` so that:

- concurrent reservations never take more stock than exists,
- reservations for **different** SKUs still run concurrently (one lock for the whole shop would serialise every checkout),
- a failed `save` leaves the stock untouched and lets the error propagate.

`save(sku, qty)` is the slow database write. The tests inject a fake one that records how many writes overlap.

```python starter
import asyncio

class Inventory:
    def __init__(self, stock, save):
        self.stock = dict(stock)
        self.save = save                    # async: persists a reservation

    async def reserve(self, sku, qty):
        available = self.stock.get(sku, 0)
        if available < qty:
            return False
        await self.save(sku, qty)           # other reservations run here
        self.stock[sku] = available - qty
        return True
```

```python solution
import asyncio
from collections import defaultdict

class Inventory:
    def __init__(self, stock, save):
        self.stock = dict(stock)
        self.save = save
        self._locks = defaultdict(asyncio.Lock)     # one lock per SKU

    async def reserve(self, sku, qty):
        async with self._locks[sku]:
            available = self.stock.get(sku, 0)
            if available < qty:
                return False
            await self.save(sku, qty)
            self.stock[sku] = available - qty
            return True
```

```python tests
import asyncio

def fake_db(fail_for=()):
    stats = {"active": 0, "peak": 0, "saved": []}

    async def save(sku, qty):
        stats["active"] += 1
        stats["peak"] = max(stats["peak"], stats["active"])
        try:
            await asyncio.sleep(0.01)
            if sku in fail_for:
                raise ConnectionError(f"database down for {sku}")
            stats["saved"].append((sku, qty))
        finally:
            stats["active"] -= 1

    return save, stats

async def finish(coro):
    try:
        async with asyncio.timeout(2):
            return await coro
    except TimeoutError:
        check(False, "still running after 2 seconds: is a lock never released?")

@test("never sells more than the stock")
async def _():
    save, stats = fake_db()
    shop = Inventory({"A1": 3}, save)
    results = await finish(asyncio.gather(*(shop.reserve("A1", 1) for _ in range(5))))
    eq(sorted(results), [False, False, True, True, True])
    eq(shop.stock["A1"], 0)

@test("multi-unit reservations add up")
async def _():
    save, stats = fake_db()
    shop = Inventory({"B2": 10}, save)
    results = await finish(asyncio.gather(*(shop.reserve("B2", 4) for _ in range(3))))
    eq(results.count(True), 2)
    eq(shop.stock["B2"], 2)

@test("refuses unknown SKUs and oversized orders without saving")
async def _():
    save, stats = fake_db()
    shop = Inventory({"A1": 3}, save)
    eq(await finish(shop.reserve("ZZ", 1)), False)
    eq(await finish(shop.reserve("A1", 4)), False)
    eq(shop.stock, {"A1": 3})
    eq(stats["saved"], [], "a refused reservation shouldn't touch the database")

@test("different SKUs don't wait for each other")
async def _():
    save, stats = fake_db()
    shop = Inventory({"A1": 5, "B2": 5}, save)
    await finish(asyncio.gather(shop.reserve("A1", 1), shop.reserve("B2", 1)))
    eq(stats["peak"], 2, "saves for different SKUs should overlap: lock per SKU, not per shop")

@test("a failed save leaves the stock alone")
async def _():
    save, stats = fake_db(fail_for={"A1"})
    shop = Inventory({"A1": 3}, save)
    with raises(ConnectionError):
        await finish(shop.reserve("A1", 1))
    eq(shop.stock["A1"], 3)

@test("a SKU isn't stuck after a failed save")
async def _():
    attempts = []
    async def flaky_save(sku, qty):
        attempts.append(sku)
        await asyncio.sleep(0)
        if len(attempts) == 1:
            raise ConnectionError("blip")
    shop = Inventory({"A1": 3}, flaky_save)
    with raises(ConnectionError):
        await finish(shop.reserve("A1", 1))
    eq(await finish(shop.reserve("A1", 1)), True)
    eq(shop.stock["A1"], 2)
```

```hint
Between two `await`s nothing else runs, but `await self.save(...)` sits between the stock check and the update, so another reservation can check the same stale number.
```

```hint
Give each SKU its own `asyncio.Lock` and hold it from the check to the update: `defaultdict(asyncio.Lock)` creates them on first use, and `async with` releases the lock even when `save` raises.
```

```hint
There's a lock-free fix too: claim the stock *before* the `await` (no other task can run in between), and give it back in an `except` block if `save` fails.
```
:::

:::challenge id=conc-inline-executor title="An executor for tests" difficulty=medium
Code that accepts an `Executor` is much easier to test if you can hand it one that runs every call immediately, in the calling thread, with no pool at all. (This sandbox has no threads, so it's also the only executor that works here.) Write `InlineExecutor`, a subclass of `concurrent.futures.Executor`:

- `submit(fn, /, *args, **kwargs)` calls `fn` right away and returns a `concurrent.futures.Future` that's already done. It holds the result, or the exception if the call raised: `submit` itself must not raise it.
- After `shutdown()`, `submit` raises `RuntimeError`, like the real pools.

The base class builds `map()` and the `with` statement on top of `submit` and `shutdown`, so you get those for free.

```python starter
from concurrent.futures import Executor, Future

class InlineExecutor(Executor):
    def submit(self, fn, /, *args, **kwargs):
        ...

    def shutdown(self, wait=True, *, cancel_futures=False):
        ...
```

```python solution
from concurrent.futures import Executor, Future

class InlineExecutor(Executor):
    def __init__(self):
        self._shutdown = False

    def submit(self, fn, /, *args, **kwargs):
        if self._shutdown:
            raise RuntimeError("cannot schedule new futures after shutdown")
        future = Future()
        try:
            result = fn(*args, **kwargs)
        except BaseException as exc:          # the real pools capture everything
            future.set_exception(exc)
        else:
            future.set_result(result)
        return future

    def shutdown(self, wait=True, *, cancel_futures=False):
        self._shutdown = True
```

```python tests
from concurrent.futures import Executor, Future, as_completed

@test("submit returns a finished Future holding the result")
def _():
    ex = InlineExecutor()
    future = ex.submit(pow, 2, 10)
    check(isinstance(future, Future), "submit() should return a concurrent.futures.Future")
    check(future.done(), "the call should already have run")
    eq(future.result(), 1024)

@test("passes keyword arguments through")
def _():
    eq(InlineExecutor().submit(sorted, [3, 1, 2], reverse=True).result(), [3, 2, 1])

@test("stores an exception in the Future instead of raising it")
def _():
    future = InlineExecutor().submit(int, "42px")
    check(isinstance(future.exception(), ValueError), "future.exception() should be the ValueError")
    raises(ValueError, future.result)

@test("map works, in input order")
def _():
    ex = InlineExecutor()
    eq(list(ex.map(str.upper, ["ada", "linus"])), ["ADA", "LINUS"])
    eq(list(ex.map(pow, [2, 3], [5, 2])), [32, 9])

@test("works with as_completed")
def _():
    ex = InlineExecutor()
    futures = [ex.submit(len, word) for word in ["a", "bb", "ccc"]]
    eq(sorted(f.result() for f in as_completed(futures)), [1, 2, 3])

@test("submit after shutdown raises RuntimeError")
def _():
    ex = InlineExecutor()
    ex.shutdown()
    raises(RuntimeError, ex.submit, abs, -5)

@test("leaving a with block shuts it down")
def _():
    with InlineExecutor() as ex:
        eq(ex.submit(abs, -5).result(), 5)
    raises(RuntimeError, ex.submit, abs, -5)

@test("is a real Executor")
def _():
    check(issubclass(InlineExecutor, Executor), "subclass concurrent.futures.Executor")
```

```hint
Create a bare `Future()`, call the function, then complete the future with `future.set_result(value)` or, in an `except` block, `future.set_exception(exc)`.
```

```hint
Keep a `_shutdown` flag: set it in `shutdown()` and check it at the top of `submit()`. `Executor.__exit__` calls `self.shutdown(wait=True)`, so the `with` statement works once `shutdown` does.
```
:::

:::challenge id=conc-bounded-pipeline title="A pipeline with backpressure" difficulty=hard
Write `async def pipeline(items, process, *, workers=3, maxsize=2)`, the classic producer/consumer shape:

- A producer pulls from the iterable `items`, which may be huge or lazy, and feeds a queue that holds at most `maxsize` items, so it can never race far ahead of the workers.
- `workers` worker tasks take items off the queue and `await process(item)`, so at most `workers` calls run at once.
- Return the results **in input order**.
- If any `process` call raises, stop everything and let the error out as the `ExceptionGroup` a `TaskGroup` raises.
- Raise `ValueError` if `workers` or `maxsize` is less than 1.

```js
import pMap from "p-map";

// p-map pulls items lazily and keeps at most `concurrency` calls in flight
const results = await pMap(items, process, { concurrency: 3 });
```

```python starter
import asyncio

async def pipeline(items, process, *, workers=3, maxsize=2):
    ...
```

```python solution
import asyncio

async def pipeline(items, process, *, workers=3, maxsize=2):
    if workers < 1 or maxsize < 1:
        raise ValueError("workers and maxsize must be at least 1")
    queue = asyncio.Queue(maxsize)
    results = {}

    async def produce():
        for index, item in enumerate(items):
            await queue.put((index, item))      # waits while the queue is full
        queue.shutdown()                        # 3.13+: workers stop once it's drained

    async def work():
        while True:
            try:
                index, item = await queue.get()
            except asyncio.QueueShutDown:
                return
            results[index] = await process(item)

    async with asyncio.TaskGroup() as tg:
        tg.create_task(produce())
        for _ in range(workers):
            tg.create_task(work())
    return [results[index] for index in range(len(results))]
```

```python tests
import asyncio

def tracked(delays=None, fail_on=None):
    """A lazy source and a fake process() that record what happened."""
    delays = delays or {}
    stats = {"active": 0, "peak": 0, "started": [], "pulled": 0, "done": 0, "max_ahead": 0}

    def source(n):
        for item in range(n):
            stats["pulled"] += 1
            stats["max_ahead"] = max(stats["max_ahead"], stats["pulled"] - stats["done"])
            yield item

    async def process(item):
        stats["active"] += 1
        stats["peak"] = max(stats["peak"], stats["active"])
        stats["started"].append(item)
        try:
            await asyncio.sleep(delays.get(item, 0.001))
            if item == fail_on:
                raise ValueError(f"bad item {item}")
            return item * 10
        finally:
            stats["active"] -= 1
            stats["done"] += 1

    return source, process, stats

async def finish(coro):
    try:
        async with asyncio.timeout(2):
            return await coro
    except TimeoutError:
        check(False, "still running after 2 seconds: do the workers know when to stop?")

@test("returns results in input order")
async def _():
    source, process, stats = tracked(delays={0: 0.02, 1: 0.01})
    eq(await finish(pipeline(source(6), process)), [0, 10, 20, 30, 40, 50])

@test("runs up to `workers` calls at once, never more")
async def _():
    source, process, stats = tracked()
    await finish(pipeline(source(20), process, workers=4, maxsize=2))
    eq(stats["peak"], 4)

@test("pulls items lazily: the source never gets far ahead")
async def _():
    source, process, stats = tracked()
    results = await finish(pipeline(source(30), process, workers=2, maxsize=3))
    eq(len(results or []), 30, "every item should be processed")
    check(
        stats["max_ahead"] <= 3 + 2 + 1,
        f"the source got {stats['max_ahead']} items ahead of the workers: "
        "is the queue bounded, and do you pull one item at a time?",
    )

@test("accepts any iterable")
async def _():
    async def double(word):
        await asyncio.sleep(0)
        return word * 2
    eq(await finish(pipeline(["a", "b", "c"], double, workers=2)), ["aa", "bb", "cc"])

@test("an empty input gives an empty list")
async def _():
    source, process, stats = tracked()
    eq(await finish(pipeline(source(0), process)), [])

@test("a failing call stops the pipeline with an ExceptionGroup")
async def _():
    source, process, stats = tracked(fail_on=2)
    with raises(ExceptionGroup) as ctx:
        await finish(pipeline(source(50), process, workers=1, maxsize=1))
    eq([type(e) for e in ctx.exception.exceptions], [ValueError])
    check(len(stats["started"]) < 50, "the remaining items shouldn't start once a call has failed")

@test("workers or maxsize below 1 raise ValueError")
async def _():
    source, process, stats = tracked()
    with raises(ValueError):
        await finish(pipeline(source(3), process, workers=0))
    with raises(ValueError):
        await finish(pipeline(source(3), process, maxsize=0))
```

```hint
`asyncio.Queue(maxsize)` makes `await queue.put()` wait while the queue is full. That's the backpressure: the producer can't pull its next item until a worker makes room. Check the arguments first, because `asyncio.Queue(0)` is legal and unbounded.
```

```hint
Run one producer task and `workers` worker tasks in an `asyncio.TaskGroup`. When the producer has queued everything, `queue.shutdown()` (3.13+) makes `get()` raise `asyncio.QueueShutDown` once the queue is empty, which tells each worker to return.
```

```hint
Send `(index, item)` pairs through the queue and store each result in a dict under its index. After the group exits, build the list with `[results[i] for i in range(len(results))]`.
```
:::
