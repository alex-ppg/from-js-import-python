---
title: Build Caches & Rate Limiters
part: Systems
summary: An LRU cache, a memoizing decorator, a TTL cache and two rate limiters, all on injectable clocks.
minutes: 75
---

Caching and rate limiting are the two halves of being a good API citizen: don't ask twice for what you already know, and don't ask too fast for what you don't. Both are small data-structure problems with time in them, and the standard library has the right structures for each. `OrderedDict`'s `move_to_end()` and `popitem(last=False)` make an LRU cache a handful of lines, and `deque` drops old timestamps from the front in O(1).

Time is the hard part to test. A cache or a limiter that reads the system clock can only be tested by sleeping, which is slow and flaky. So everything here takes an **injectable clock**: any zero-argument function that returns seconds. Production code gets `time.monotonic`. Tests get a `FakeClock` that only moves when told to, so an hour-long scenario runs in microseconds and never flakes.

## What you'll build

The finished piece is a `CachedClient` that sits in front of a slow, metered API. It answers from a TTL cache when it can, and spends a token from a token bucket only on a real request. Along the way you'll build `@lru`, your own `functools.lru_cache`. The demo is at the top of the code, and everything under it is what you'll write. Press **Run**.

```python run
import time
from collections import OrderedDict, deque
from collections.abc import Callable
from dataclasses import dataclass
from functools import wraps
from typing import NamedTuple, Protocol


def main():
    clock = FakeClock()
    backend_calls = []

    def fetch_user(path, **params):           # stands in for a slow, metered API
        backend_calls.append(path)
        return {"path": path, **params}

    client = CachedClient(
        fetch_user,
        cache=TTLCache(ttl=30, clock=clock),
        limiter=TokenBucket(rate=1, capacity=2, clock=clock),
    )

    def get(path):
        before = len(backend_calls)
        try:
            client.get(path)
            outcome = "fetched" if len(backend_calls) > before else "from cache"
        except RateLimitError as error:
            outcome = f"rate limited, retry in {error.retry_after:.1f}s"
        print(f"t={clock():>4.1f}s  GET {path:<9} {outcome}")

    get("/users/1")
    get("/users/1")
    get("/users/2")
    get("/users/3")
    clock.advance(1)
    get("/users/3")
    clock.advance(30)
    get("/users/1")
    print(client.stats)

    @lru(maxsize=2)
    def slugify(title):
        return "-".join(title.lower().split())

    for title in ["Hello World", "Rate Limits", "Hello World", "LRU Caches", "Rate Limits"]:
        slugify(title)
    print(slugify.cache_info())


# Everything below is what you'll build, one step at a time.


# --- Step 1: an LRU cache -----------------------------------------------------


class LRUCache:
    """A mapping that keeps at most `maxsize` keys, evicting the least recently used."""

    def __init__(self, maxsize: int = 128):
        if maxsize < 1:
            raise ValueError("maxsize must be at least 1")
        self.maxsize = maxsize
        self._data = OrderedDict()          # least recently used first

    def __getitem__(self, key):
        value = self._data[key]             # KeyError if missing, like a dict
        self._data.move_to_end(key)         # reading counts as a use
        return value

    def __setitem__(self, key, value):
        self._data[key] = value
        self._data.move_to_end(key)
        if len(self._data) > self.maxsize:
            self._data.popitem(last=False)  # evict the least recently used

    def __delitem__(self, key):
        del self._data[key]

    def __contains__(self, key):
        return key in self._data            # peeking doesn't count as a use

    def __len__(self):
        return len(self._data)

    def __iter__(self):
        return iter(self._data)             # least to most recently used

    def get(self, key, default=None):
        try:
            return self[key]
        except KeyError:
            return default

    def clear(self):
        self._data.clear()


# --- Step 2: the @lru decorator -----------------------------------------------


class CacheInfo(NamedTuple):
    hits: int
    misses: int
    maxsize: int
    currsize: int


_MISSING = object()   # a default that no real value can be: compare it with `is`


def make_key(args: tuple, kwargs: dict) -> tuple:
    """A hashable key for one call. Keyword order doesn't matter."""
    return (args, tuple(sorted(kwargs.items())))


def lru(maxsize: int = 128):
    """Memoize a function in an LRUCache, with functools-style statistics."""

    def decorator(fn):
        cache = LRUCache(maxsize)
        hits = misses = 0

        @wraps(fn)
        def wrapper(*args, **kwargs):
            nonlocal hits, misses
            key = make_key(args, kwargs)
            result = cache.get(key, _MISSING)
            if result is _MISSING:
                misses += 1
                result = cache[key] = fn(*args, **kwargs)
            else:
                hits += 1
            return result

        def cache_info():
            return CacheInfo(hits, misses, maxsize, len(cache))

        def cache_clear():
            nonlocal hits, misses
            cache.clear()
            hits = misses = 0

        wrapper.cache_info = cache_info
        wrapper.cache_clear = cache_clear
        return wrapper

    return decorator


# --- Step 3: a TTL cache ------------------------------------------------------


class FakeClock:
    """A clock for tests: time only moves when you call advance()."""

    def __init__(self, start: float = 0.0):
        self.now = start

    def __call__(self) -> float:
        return self.now

    def advance(self, seconds: float) -> None:
        self.now += seconds


class TTLCache:
    """A cache whose entries expire `ttl` seconds after they're set."""

    def __init__(self, ttl: float, clock: Callable[[], float] = time.monotonic):
        if ttl <= 0:
            raise ValueError("ttl must be positive")
        self.ttl = ttl
        self.clock = clock
        self._data = OrderedDict()            # key -> (expires_at, value), soonest first

    def _expire(self) -> None:
        """Drop expired entries: with one ttl for all, they're always at the front."""
        now = self.clock()
        while self._data:
            expires_at, _ = next(iter(self._data.values()))
            if expires_at > now:
                break
            self._data.popitem(last=False)

    def __setitem__(self, key, value):
        self._data[key] = (self.clock() + self.ttl, value)
        self._data.move_to_end(key)           # a reset key now expires last

    def get(self, key, default=None):
        self._expire()
        if key in self._data:
            return self._data[key][1]
        return default

    def __contains__(self, key):
        self._expire()
        return key in self._data

    def __len__(self):
        self._expire()
        return len(self._data)


# --- Step 4: a token bucket ---------------------------------------------------


class TokenBucket:
    """Allows bursts of up to `capacity` calls, refilling at `rate` tokens per second."""

    def __init__(self, rate: float, capacity: int, clock: Callable[[], float] = time.monotonic):
        if rate <= 0 or capacity < 1:
            raise ValueError("rate must be positive and capacity at least 1")
        self.rate = rate
        self.capacity = capacity
        self.clock = clock
        self.tokens = capacity                # start full
        self.updated = clock()

    def _refill(self) -> None:
        now = self.clock()
        self.tokens = min(self.capacity, self.tokens + (now - self.updated) * self.rate)
        self.updated = now

    def try_acquire(self, tokens: int = 1) -> bool:
        if tokens > self.capacity:
            raise ValueError(f"the bucket only holds {self.capacity} tokens")
        self._refill()
        if self.tokens < tokens:
            return False
        self.tokens -= tokens
        return True

    def retry_after(self, tokens: int = 1) -> float:
        """Seconds until `tokens` tokens are available: 0.0 if they already are."""
        self._refill()
        return max(0.0, (tokens - self.tokens) / self.rate)


# --- Step 5: a sliding window -------------------------------------------------


class SlidingWindowLimiter:
    """Allows at most `limit` calls in any `window` seconds."""

    def __init__(self, limit: int, window: float, clock: Callable[[], float] = time.monotonic):
        if limit < 1 or window <= 0:
            raise ValueError("limit must be at least 1 and window positive")
        self.limit = limit
        self.window = window
        self.clock = clock
        self.calls: deque[float] = deque()    # when the counted calls happened, oldest first

    def _forget_old(self, now: float) -> None:
        while self.calls and self.calls[0] + self.window <= now:
            self.calls.popleft()

    def try_acquire(self) -> bool:
        now = self.clock()
        self._forget_old(now)
        if len(self.calls) >= self.limit:
            return False
        self.calls.append(now)
        return True

    def retry_after(self) -> float:
        """Seconds until a call would be allowed: 0.0 if one would be now."""
        now = self.clock()
        self._forget_old(now)
        if len(self.calls) < self.limit:
            return 0.0
        return self.calls[0] + self.window - now


# --- Step 6: the client -------------------------------------------------------


class RateLimitError(Exception):
    """Raised instead of calling the backend when the limiter says no."""

    def __init__(self, path: str, retry_after: float):
        super().__init__(f"rate limited: retry {path} in {retry_after:.2f}s")
        self.path = path
        self.retry_after = retry_after


class RateLimiter(Protocol):
    """What CachedClient needs from a limiter. TokenBucket and SlidingWindowLimiter both fit."""

    def try_acquire(self) -> bool: ...

    def retry_after(self) -> float: ...


@dataclass
class ClientStats:
    hits: int = 0
    misses: int = 0
    limited: int = 0


class CachedClient:
    """Answers from the cache when it can, and calls `fetch` only when the limiter allows."""

    def __init__(self, fetch: Callable[..., object], *, cache, limiter: RateLimiter):
        self.fetch = fetch
        self.cache = cache
        self.limiter = limiter
        self.stats = ClientStats()

    def get(self, path: str, **params):
        key = make_key((path,), params)
        value = self.cache.get(key, _MISSING)
        if value is not _MISSING:
            self.stats.hits += 1
            return value
        if not self.limiter.try_acquire():
            self.stats.limited += 1
            raise RateLimitError(path, self.limiter.retry_after())
        self.stats.misses += 1
        value = self.cache[key] = self.fetch(path, **params)
        return value


main()
```

```output
t= 0.0s  GET /users/1  fetched
t= 0.0s  GET /users/1  from cache
t= 0.0s  GET /users/2  fetched
t= 0.0s  GET /users/3  rate limited, retry in 1.0s
t= 1.0s  GET /users/3  fetched
t=31.0s  GET /users/1  fetched
ClientStats(hits=1, misses=4, limited=1)
CacheInfo(hits=1, misses=4, maxsize=2, currsize=2)
```

Six requests, four backend calls. The repeated `/users/1` came from the cache and cost nothing. `/users/3` found the bucket empty and was told when to come back, and a second later a token had dripped back in. By t=31, the first answer for `/users/1` had outlived its 30-second TTL, so it went to the backend again. None of that took any real time: the clock is fake.

## How the pieces fit

```text
CachedClient.get(path, **params)                          step 6
├── make_key(...)                a hashable key per call  step 2
├── cache.get(key)               TTLCache or LRUCache     steps 3 and 1
└── on a miss:
    ├── limiter.try_acquire()    TokenBucket or           step 4
    │                            SlidingWindowLimiter     step 5
    └── fetch(path, **params)    the real backend

@lru(maxsize)                    memoize any function     step 2
└── LRUCache                     an OrderedDict inside    step 1
```

`CachedClient` doesn't care which cache or limiter it gets, as long as they have the right methods. Any cache with `get(key, default)` and `cache[key] = value` will do, and any limiter with `try_acquire()` and `retry_after()`. Python calls that duck typing, and step 6 writes the limiter's half down as a `Protocol`.

| Step | You build | The Python it exercises |
| --- | --- | --- |
| 1 | `LRUCache` | `OrderedDict.move_to_end()` and `popitem(last=False)`, container dunders |
| 2 | `@lru` and `cache_info()` | decorator factories, `functools.wraps`, `nonlocal`, `NamedTuple`, sentinels |
| 3 | `TTLCache` | injectable clocks, lazy expiry, an `OrderedDict` ordered by time |
| 4 | `TokenBucket` | refill-on-demand arithmetic instead of timers |
| 5 | `SlidingWindowLimiter` | a `deque` as a log of timestamps |
| 6 | `CachedClient` | composition, `Protocol` interfaces, duck typing |

Each step's starter holds the finished code of every earlier step, so you can start anywhere, and its tests target only the new piece. Step 6 exercises the lot. Nothing here is async: with the clock injected, nothing ever needs to wait.

## Step 1: An LRU cache

A least-recently-used cache keeps the `maxsize` entries you touched most recently and evicts the stalest one when a new entry won't fit. That needs a mapping that also remembers an order and can, in O(1), move a key to the back and drop the one at the front. In JS you'd lean on `Map`'s insertion order. `collections.OrderedDict` has both moves built in.

:::compare
```js
const cache = new Map();

// mark "a" as just used: delete it, then re-insert it
const value = cache.get("a");
cache.delete("a");
cache.set("a", value);

// evict the least recently used entry
cache.delete(cache.keys().next().value);
```
```python
cache = OrderedDict()

# mark "a" as just used
cache.move_to_end("a")



# evict the least recently used entry
cache.popitem(last=False)
```
:::

Plain dicts keep insertion order too ([Dicts](lesson:dicts#order-insertion-order-no-surprises)), but they have no `move_to_end()`, and their `popitem()` only removes the newest item. `move_to_end(key)` moves a key to the end (`last=False` moves it to the front instead), and `popitem(last=False)` removes and returns the first item rather than the last.

```python run
from collections import OrderedDict

recent = OrderedDict.fromkeys(["home", "pricing", "docs"])
recent.move_to_end("home")            # just visited
print(list(recent))
print(recent.popitem(last=False))     # the least recently visited
print(list(recent))
```

Note what plain assignment does to an existing key, though:

:::quiz output
What does this print?

```python
from collections import OrderedDict

cache = OrderedDict(a=1, b=2)
cache["a"] = 10
print(list(cache))
```

- [x] `['a', 'b']`
- [ ] `['b', 'a']`
- [ ] `['b', 'a', 'a']`

Assigning to an existing key replaces the value and keeps the key's position, in an `OrderedDict`, a plain dict and a JS `Map` alike. That's why `__setitem__` needs its own `move_to_end()` call.
:::

Wrap the `OrderedDict` in a class of your own and give that class the dunder methods that make it feel like a dict: `cache[key]`, `cache[key] = value`, `del cache[key]`, `key in cache`, `len(cache)` and iteration ([Container protocols](lesson:dunder-methods#container-protocols)).

:::gotcha Don't subclass `OrderedDict` to change how it reads
Subclassing and overriding `__getitem__` looks like a shortcut, but the built-in mapping methods don't all route through your override. `get()` and `pop()` read the storage directly, so `cache.get(key)` would skip the recency bookkeeping without a word. Keeping the `OrderedDict` in an attribute means every read goes through code you wrote. (When you do want to subclass, `collections.UserDict` is built for it.)
:::

:::deep Why `__iter__` matters here
A class that defines `__getitem__` but not `__iter__` is still iterable: `for key in cache` falls back to the old sequence protocol and calls `cache[0]`, `cache[1]`, and so on until something raises `IndexError`. On a cache, that's a `KeyError: 0` on the first step. Defining `__iter__` gives iteration its proper meaning, here the keys from least to most recently used.
:::

:::challenge id=cache-step-1 title="Step 1: An LRU cache" difficulty=easy
Write `LRUCache(maxsize=128)`:

- `cache[key] = value` stores a value and makes the key the most recently used. If the cache then holds more than `maxsize` keys, it evicts the least recently used one. Updating an existing key refreshes it and doesn't grow the cache.
- `cache[key]` returns the value and makes the key the most recently used. A missing key raises `KeyError`, like a dict.
- `cache.get(key, default=None)` does the same, but returns `default` for a missing key. Cached values can be falsy (`0`, `None`, `""`), so check for the key, not the value.
- `key in cache` only peeks: it doesn't count as a use.
- `del cache[key]`, `len(cache)` and `cache.clear()` work as on a dict, and iterating yields the keys from least to most recently used.
- `maxsize < 1` raises `ValueError`.

Keep the entries in an `OrderedDict` and use its `move_to_end()` and `popitem(last=False)`.

```js
class LRUCache {
  #data = new Map(); // least recently used first

  constructor(maxsize = 128) {
    if (maxsize < 1) throw new RangeError("maxsize must be at least 1");
    this.maxsize = maxsize;
  }

  get(key, fallback = undefined) {
    if (!this.#data.has(key)) return fallback;
    const value = this.#data.get(key);
    this.#data.delete(key);
    this.#data.set(key, value); // now the most recently used
    return value;
  }

  set(key, value) {
    this.#data.delete(key);
    this.#data.set(key, value);
    if (this.#data.size > this.maxsize) this.#data.delete(this.#data.keys().next().value);
  }

  has(key) { return this.#data.has(key); }
  delete(key) { return this.#data.delete(key); }
  clear() { this.#data.clear(); }
  get size() { return this.#data.size; }
  [Symbol.iterator]() { return this.#data.keys(); }
}
```

```python starter
from collections import OrderedDict


# --- Step 1: an LRU cache -----------------------------------------------------


class LRUCache:
    """A mapping that keeps at most `maxsize` keys, evicting the least recently used."""

    def __init__(self, maxsize: int = 128):
        ...

    def __getitem__(self, key):
        ...

    def __setitem__(self, key, value):
        ...

    def __delitem__(self, key):
        ...

    def __contains__(self, key):
        ...

    def __len__(self):
        ...

    def __iter__(self):
        ...

    def get(self, key, default=None):
        ...

    def clear(self):
        ...
```

```python solution
from collections import OrderedDict


# --- Step 1: an LRU cache -----------------------------------------------------


class LRUCache:
    """A mapping that keeps at most `maxsize` keys, evicting the least recently used."""

    def __init__(self, maxsize: int = 128):
        if maxsize < 1:
            raise ValueError("maxsize must be at least 1")
        self.maxsize = maxsize
        self._data = OrderedDict()          # least recently used first

    def __getitem__(self, key):
        value = self._data[key]             # KeyError if missing, like a dict
        self._data.move_to_end(key)         # reading counts as a use
        return value

    def __setitem__(self, key, value):
        self._data[key] = value
        self._data.move_to_end(key)
        if len(self._data) > self.maxsize:
            self._data.popitem(last=False)  # evict the least recently used

    def __delitem__(self, key):
        del self._data[key]

    def __contains__(self, key):
        return key in self._data            # peeking doesn't count as a use

    def __len__(self):
        return len(self._data)

    def __iter__(self):
        return iter(self._data)             # least to most recently used

    def get(self, key, default=None):
        try:
            return self[key]
        except KeyError:
            return default

    def clear(self):
        self._data.clear()
```

```python tests
@test("stores and returns values, like a dict")
def _():
    cache = LRUCache(maxsize=3)
    cache["a"] = 1
    cache["b"] = 2
    eq(cache["a"], 1)
    eq(cache.get("b"), 2)
    eq(len(cache), 2)

@test("a missing key: [] raises KeyError, get() returns the default")
def _():
    cache = LRUCache(maxsize=2)
    with raises(KeyError):
        cache["nope"]
    eq(cache.get("nope"), None)
    eq(cache.get("nope", "fallback"), "fallback")

@test("falsy values are cached like any other")
def _():
    cache = LRUCache(maxsize=3)
    cache["zero"] = 0
    cache["none"] = None
    eq(cache.get("zero", "missing"), 0)
    eq(cache.get("none", "missing"), None)

@test("evicts the least recently used key when full")
def _():
    cache = LRUCache(maxsize=2)
    cache["a"] = 1
    cache["b"] = 2
    cache["c"] = 3
    check("a" not in cache, "a was the least recently used, so it should be gone")
    eq(list(cache), ["b", "c"])

@test("reading a key makes it the most recently used")
def _():
    cache = LRUCache(maxsize=2)
    cache["a"] = 1
    cache["b"] = 2
    cache["a"]
    cache["c"] = 3
    eq(list(cache), ["a", "c"], "reading a should have saved it from eviction")
    cache.get("a")
    cache["d"] = 4
    eq(list(cache), ["a", "d"], "get() counts as a use too")

@test("updating a key refreshes it and doesn't grow the cache")
def _():
    cache = LRUCache(maxsize=2)
    cache["a"] = 1
    cache["b"] = 2
    cache["a"] = 10
    cache["c"] = 3
    eq(list(cache), ["a", "c"])
    eq(cache["a"], 10)

@test("`in` peeks without counting as a use")
def _():
    cache = LRUCache(maxsize=2)
    cache["a"] = 1
    cache["b"] = 2
    check("a" in cache, "a is in the cache")
    cache["c"] = 3
    eq(list(cache), ["b", "c"], "checking `in` shouldn't save a from eviction")

@test("del and clear() remove entries")
def _():
    cache = LRUCache(maxsize=3)
    cache["a"] = 1
    cache["b"] = 2
    del cache["a"]
    eq(list(cache), ["b"])
    with raises(KeyError):
        del cache["a"]
    cache.clear()
    eq(len(cache), 0)

@test("maxsize < 1 raises ValueError")
def _():
    raises(ValueError, LRUCache, 0)

@test("built on OrderedDict.move_to_end()")
def _():
    requires_call("move_to_end", "OrderedDict.move_to_end(key) marks a key as the most recently used")
```

```hint
Create `self._data = OrderedDict()` in `__init__`. Reading is `value = self._data[key]`, which raises `KeyError` for you, followed by `self._data.move_to_end(key)`.
```

```hint
In `__setitem__`: assign, call `move_to_end(key)`, then `if len(self._data) > self.maxsize: self._data.popitem(last=False)`.
```

```hint
`get` can lean on `__getitem__`: `try: return self[key]` and `except KeyError: return default`. `__iter__` can simply return `iter(self._data)`.
```
:::

## Step 2: The `@lru` decorator

With a cache class in hand, memoization is one decorator away. The core course built `memoize` on a plain dict ([lodash's memoize](lesson:decorators#deco-memoize-key)); this version adds a size limit and the statistics that [`functools.lru_cache`](lesson:decorators#functools-cache-and-lru-cache) reports. It's a decorator factory, so it has three layers: `lru(maxsize)` returns a decorator, which wraps the function ([Decorators with arguments](lesson:decorators#decorators-with-arguments)).

Each call needs a hashable key. Hand-rolled JavaScript memoizers often key on `JSON.stringify(args)`. Python can use the arguments themselves, because tuples of hashable values are hashable ([Tuples as keys](lesson:tuples-and-unpacking#hashable-so-tuples-can-be-keys)). `(args, tuple(sorted(kwargs.items())))` covers positional and keyword arguments, and sorting means `f(a=1, b=2)` and `f(b=2, a=1)` share an entry. An unhashable argument, such as a list, raises `TypeError` the moment the key is hashed, which is exactly what `functools.lru_cache` does.

The statistics live in the decorator's closure. The wrapper reassigns `hits` and `misses`, so it declares them `nonlocal` ([Closures](lesson:functions#closures-and-nonlocal)), and `cache_info()` and `cache_clear()` are attached to the wrapper as plain attributes, because functions are objects ([Functions are objects](lesson:functions#functions-are-objects)). `cache_info()` returns a `NamedTuple`, the same shape `functools` uses:

```python run
from typing import NamedTuple

class CacheInfo(NamedTuple):
    hits: int
    misses: int
    maxsize: int
    currsize: int

info = CacheInfo(hits=3, misses=1, maxsize=128, currsize=1)
print(info)
print(info.hits, info == (3, 1, 128, 1))   # named, and still a tuple
hits, misses, *_ = info
print(f"hit rate {hits / (hits + misses):.0%}")
```

:::compare A "not found" that no value can fake
```js
const MISSING = Symbol("missing");

const cached = cache.has(key) ? cache.get(key) : MISSING;
if (cached !== MISSING) return cached;
```
```python
_MISSING = object()

cached = cache.get(key, _MISSING)
if cached is not _MISSING:
    return cached
```
:::

A fresh `object()` is Python's `Symbol()`: unique, and equal only to itself, so compare it with `is` ([`is` compares identity](lesson:truthiness-and-equality#is-compares-identity)). Pass it as `get()`'s default, and "not cached" can never be confused with "cached `None`".

:::gotcha `cache.get(key) or compute()` recomputes falsy results
That's JavaScript's `||` default, with the same flaw: every result that's `0`, `""`, `[]` or `None` looks like a miss and runs the function again. Test against a sentinel with `is`. No real result can be the same object as a private `object()`.
:::

:::quiz output
What does this print?

```python
prices = {"tea": 0}
print(prices.get("tea") or "look it up")
```

- [ ] `0`
- [x] `look it up`
- [ ] `None`

`get()` found the key and returned `0`, and `or` threw it away because `0` is falsy. A cache written this way recomputes every falsy answer.
:::

:::tip Support a bare `@lru` too
`functools.lru_cache` also works without parentheses. Supporting both forms takes one check at the top of the factory: `if callable(maxsize): return lru()(maxsize)`.
:::

:::challenge id=cache-step-2 title="Step 2: The @lru decorator" difficulty=medium
Write `make_key(args, kwargs)` and the decorator factory `lru(maxsize=128)`:

- `make_key` returns `(args, tuple(sorted(kwargs.items())))`, a hashable key that ignores keyword order.
- A function decorated with `@lru(maxsize)` runs once per distinct call. Later calls with the same arguments return the stored result, even a falsy one: use the `_MISSING` sentinel from the starter.
- Results live in an `LRUCache(maxsize)`, one per decorated function.
- `wrapper.cache_info()` returns a `CacheInfo(hits, misses, maxsize, currsize)`, and `wrapper.cache_clear()` empties the cache and resets both counters.
- The wrapper keeps the function's `__name__` and `__doc__`.
- Unhashable arguments raise `TypeError`, like `functools.lru_cache`. Hashing the key does that for you.

```js
function lru(maxsize = 128) {
  return (fn) => {
    const cache = new LRUCache(maxsize);
    const MISSING = Symbol("missing");
    let hits = 0;
    let misses = 0;

    function wrapper(...args) {
      const key = JSON.stringify(args);
      let result = cache.get(key, MISSING);
      if (result === MISSING) {
        misses++;
        result = fn(...args);
        cache.set(key, result);
      } else {
        hits++;
      }
      return result;
    }

    wrapper.cacheInfo = () => ({ hits, misses, maxsize, currsize: cache.size });
    wrapper.cacheClear = () => { cache.clear(); hits = misses = 0; };
    return wrapper;
  };
}
```

```python starter
from collections import OrderedDict
from functools import wraps
from typing import NamedTuple


# --- Step 1: an LRU cache -----------------------------------------------------


class LRUCache:
    """A mapping that keeps at most `maxsize` keys, evicting the least recently used."""

    def __init__(self, maxsize: int = 128):
        if maxsize < 1:
            raise ValueError("maxsize must be at least 1")
        self.maxsize = maxsize
        self._data = OrderedDict()          # least recently used first

    def __getitem__(self, key):
        value = self._data[key]             # KeyError if missing, like a dict
        self._data.move_to_end(key)         # reading counts as a use
        return value

    def __setitem__(self, key, value):
        self._data[key] = value
        self._data.move_to_end(key)
        if len(self._data) > self.maxsize:
            self._data.popitem(last=False)  # evict the least recently used

    def __delitem__(self, key):
        del self._data[key]

    def __contains__(self, key):
        return key in self._data            # peeking doesn't count as a use

    def __len__(self):
        return len(self._data)

    def __iter__(self):
        return iter(self._data)             # least to most recently used

    def get(self, key, default=None):
        try:
            return self[key]
        except KeyError:
            return default

    def clear(self):
        self._data.clear()


# --- Step 2: the @lru decorator -----------------------------------------------


class CacheInfo(NamedTuple):
    hits: int
    misses: int
    maxsize: int
    currsize: int


_MISSING = object()   # a default that no real value can be: compare it with `is`


def make_key(args: tuple, kwargs: dict) -> tuple:
    """A hashable key for one call. Keyword order doesn't matter."""
    ...


def lru(maxsize: int = 128):
    """Memoize a function in an LRUCache, with functools-style statistics."""
    ...
```

```python solution
from collections import OrderedDict
from functools import wraps
from typing import NamedTuple


# --- Step 1: an LRU cache -----------------------------------------------------


class LRUCache:
    """A mapping that keeps at most `maxsize` keys, evicting the least recently used."""

    def __init__(self, maxsize: int = 128):
        if maxsize < 1:
            raise ValueError("maxsize must be at least 1")
        self.maxsize = maxsize
        self._data = OrderedDict()          # least recently used first

    def __getitem__(self, key):
        value = self._data[key]             # KeyError if missing, like a dict
        self._data.move_to_end(key)         # reading counts as a use
        return value

    def __setitem__(self, key, value):
        self._data[key] = value
        self._data.move_to_end(key)
        if len(self._data) > self.maxsize:
            self._data.popitem(last=False)  # evict the least recently used

    def __delitem__(self, key):
        del self._data[key]

    def __contains__(self, key):
        return key in self._data            # peeking doesn't count as a use

    def __len__(self):
        return len(self._data)

    def __iter__(self):
        return iter(self._data)             # least to most recently used

    def get(self, key, default=None):
        try:
            return self[key]
        except KeyError:
            return default

    def clear(self):
        self._data.clear()


# --- Step 2: the @lru decorator -----------------------------------------------


class CacheInfo(NamedTuple):
    hits: int
    misses: int
    maxsize: int
    currsize: int


_MISSING = object()   # a default that no real value can be: compare it with `is`


def make_key(args: tuple, kwargs: dict) -> tuple:
    """A hashable key for one call. Keyword order doesn't matter."""
    return (args, tuple(sorted(kwargs.items())))


def lru(maxsize: int = 128):
    """Memoize a function in an LRUCache, with functools-style statistics."""

    def decorator(fn):
        cache = LRUCache(maxsize)
        hits = misses = 0

        @wraps(fn)
        def wrapper(*args, **kwargs):
            nonlocal hits, misses
            key = make_key(args, kwargs)
            result = cache.get(key, _MISSING)
            if result is _MISSING:
                misses += 1
                result = cache[key] = fn(*args, **kwargs)
            else:
                hits += 1
            return result

        def cache_info():
            return CacheInfo(hits, misses, maxsize, len(cache))

        def cache_clear():
            nonlocal hits, misses
            cache.clear()
            hits = misses = 0

        wrapper.cache_info = cache_info
        wrapper.cache_clear = cache_clear
        return wrapper

    return decorator
```

```python tests
def counted(fn):
    """Wrap fn so a test can count how often the real body runs."""
    calls = []

    def body(*args, **kwargs):
        calls.append(args)
        return fn(*args, **kwargs)

    return body, calls

@test("make_key() builds the same hashable key whatever the keyword order")
def _():
    key = make_key((1, "a"), {"b": 2, "c": 3})
    eq(key, make_key((1, "a"), {"c": 3, "b": 2}))
    check(key != make_key((1, "a"), {"b": 2}), "different keywords, different key")
    hash(key)

@test("runs the function once per distinct call")
def _():
    square, calls = counted(lambda n: n * n)
    cached = lru(maxsize=8)(square)
    eq([cached(3), cached(3), cached(4), cached(3)], [9, 9, 16, 9])
    eq(len(calls), 2)

@test("keyword arguments are part of the call, in any order")
def _():
    price, calls = counted(lambda amount, currency="USD", places=2: f"{amount:.{places}f} {currency}")
    cached = lru()(price)
    eq(cached(5, currency="EUR", places=1), "5.0 EUR")
    eq(cached(5, places=1, currency="EUR"), "5.0 EUR")
    eq(cached(5), "5.00 USD")
    eq(len(calls), 2, "the same keywords in a different order are the same call")

@test("evicts the least recently used result past maxsize")
def _():
    square, calls = counted(lambda n: n * n)
    cached = lru(maxsize=2)(square)
    for n in [1, 2, 1, 3, 1, 2]:
        cached(n)
    eq(calls, [(1,), (2,), (3,), (2,)], "2 was evicted when 3 arrived, so it ran again")

@test("falsy results are cached too")
def _():
    find, calls = counted(lambda name: None)
    cached = lru()(find)
    cached("ada")
    cached("ada")
    eq(len(calls), 1, "None is a result: compare with a sentinel, not truthiness")

@test("cache_info() reports hits, misses, maxsize and currsize")
def _():
    square, calls = counted(lambda n: n * n)
    cached = lru(maxsize=2)(square)
    for n in [1, 2, 1, 3, 1]:
        cached(n)
    info = cached.cache_info()
    eq(type(info).__name__, "CacheInfo")
    eq((info.hits, info.misses, info.maxsize, info.currsize), (2, 3, 2, 2))

@test("cache_clear() empties the cache and resets the stats")
def _():
    square, calls = counted(lambda n: n * n)
    cached = lru(maxsize=4)(square)
    cached(1)
    cached(1)
    cached.cache_clear()
    eq(tuple(cached.cache_info()), (0, 0, 4, 0))
    cached(1)
    eq(len(calls), 2, "after cache_clear() the function runs again")

@test("each decorated function gets its own cache")
def _():
    double = lru()(lambda n: n * 2)
    triple = lru()(lambda n: n * 3)
    eq((double(5), triple(5)), (10, 15))
    eq(double.cache_info().currsize, 1)

@test("keeps the function's name and docstring")
def _():
    @lru(maxsize=4)
    def fib(n):
        """The nth Fibonacci number."""
        return n if n < 2 else fib(n - 1) + fib(n - 2)

    eq(fib(30), 832040)
    eq(fib.__name__, "fib")
    eq(fib.__doc__, "The nth Fibonacci number.")

@test("unhashable arguments raise TypeError, like functools.lru_cache")
def _():
    total = lru()(lambda items: sum(items))
    raises(TypeError, total, [1, 2, 3])

@test("stores results in your LRUCache")
def _():
    requires_call("LRUCache", "keep each function's results in an LRUCache(maxsize)")
```

```hint
Three layers: `def lru(maxsize=128):` returns `def decorator(fn):`, which returns `@wraps(fn) def wrapper(*args, **kwargs):`. Create the `LRUCache` and the counters inside `decorator`, so that every decorated function gets its own.
```

```hint
In `wrapper`: `result = cache.get(key, _MISSING)`. If `result is _MISSING`, count a miss, call `fn`, and store the result; otherwise count a hit. Reassigning the counters needs `nonlocal hits, misses`.
```

```hint
Define `cache_info()` and `cache_clear()` as nested functions and attach them with `wrapper.cache_info = cache_info`. They read the counters when they're called, so the numbers are always current. `cache_clear` reassigns them, so it needs `nonlocal` too.
```
:::

## Step 3: A TTL cache with an injectable clock

Some answers go stale: a user's profile, an exchange rate, a feature flag. A TTL (time-to-live) cache forgets each entry a fixed number of seconds after it was set. The cache is the easy part. The clock is what makes it testable.

:::compare Faking time in a test
```js
// the test runner patches the global clock
jest.useFakeTimers();
const cache = new TTLCache({ ttl: 10_000 });
cache.set("user:1", "Ada");
jest.advanceTimersByTime(10_000);
cache.get("user:1"); // undefined
```
```python
# the code asks for a clock, and the test passes one in
clock = FakeClock()
cache = TTLCache(ttl=10, clock=clock)
cache["user:1"] = "Ada"
clock.advance(10)
cache.get("user:1")  # None
```
:::

JavaScript test runners fake time by patching the global clock. Python can do that too, with `unittest.mock.patch("time.monotonic")`, but the cleaner habit is to inject the clock: take it as a parameter that defaults to `time.monotonic`. Production code never notices, and a test passes a fake. Pass the function itself, `clock=time.monotonic`, not a reading of it: `clock=time.monotonic()` would store one float as the default, and calling it later raises `TypeError`.

:::quiz output
What does this print?

```python
import time

def stamp(now=time.monotonic()):
    return now

first = stamp()
time.sleep(0.01)
print(stamp() == first)
```

- [x] `True`
- [ ] `False`
- [ ] `TypeError`

A default value is computed once, when `def` runs ([Defaults are evaluated once](lesson:functions#defaults-are-evaluated-once)), so every call gets the same reading. Defaulting to the function, `now=time.monotonic`, and calling it inside the body gives a fresh reading each time.
:::

The starter provides `FakeClock`, a callable object (`__call__` again) whose time moves only when you call `advance()`. Anything that accepts `time.monotonic` accepts a `FakeClock`.

:::gotcha `time.time()` is the wrong clock for durations
`time.time()` is wall-clock time, like `Date.now()`, and NTP corrections or a changed system clock can move it backwards or make it jump. For "how long has this lived?", use `time.monotonic()`, Python's `performance.now()`, which only ever moves forwards. Both count in float seconds, not milliseconds.
:::

As for storage, keep `(expires_at, value)` pairs in an `OrderedDict`. Every entry gets the same TTL, so the order in which keys were set is also the order in which they expire, and all the expired entries sit at the front. Before each read, pop entries off the front until the first one is still live; the cleanup never has to scan the rest. Setting a key again has to move it to the back with `move_to_end()`, because assigning to an existing key keeps its old position, in a dict as in a JS `Map`.

The third-party cachetools package has a production `TTLCache` that also bounds its size and evicts by recency, which is this step and step 1 combined.

:::challenge id=cache-step-3 title="Step 3: A TTL cache" difficulty=medium
Write `TTLCache(ttl, clock=time.monotonic)`:

- `cache[key] = value` stores a value that expires `ttl` seconds later, by `clock()`. Setting a key again restarts its TTL.
- `cache.get(key, default=None)` returns the value, or `default` if the key is missing or has expired. An entry set at time `t` is live while `clock() < t + ttl`, and gone from `t + ttl` on.
- `key in cache` and `len(cache)` count live entries only.
- Expired entries are removed, not just hidden.
- `ttl <= 0` raises `ValueError`.

Keep the entries in an `OrderedDict`, oldest first, so that the expired ones are always at the front. The starter includes `FakeClock`, which the tests use.

```js
class TTLCache {
  #data = new Map(); // key -> [expiresAt, value], soonest to expire first

  constructor(ttl, clock = () => performance.now() / 1000) {
    if (ttl <= 0) throw new RangeError("ttl must be positive");
    Object.assign(this, { ttl, clock });
  }

  #expire() {
    const now = this.clock();
    for (const [key, [expiresAt]] of this.#data) {
      if (expiresAt > now) break;
      this.#data.delete(key);
    }
  }

  set(key, value) {
    this.#data.delete(key); // re-inserting moves it to the back
    this.#data.set(key, [this.clock() + this.ttl, value]);
  }

  get(key, fallback = undefined) {
    this.#expire();
    return this.#data.has(key) ? this.#data.get(key)[1] : fallback;
  }

  has(key) { this.#expire(); return this.#data.has(key); }
  get size() { this.#expire(); return this.#data.size; }
}
```

```python starter
import time
from collections import OrderedDict
from collections.abc import Callable
from functools import wraps
from typing import NamedTuple


# --- Step 1: an LRU cache -----------------------------------------------------


class LRUCache:
    """A mapping that keeps at most `maxsize` keys, evicting the least recently used."""

    def __init__(self, maxsize: int = 128):
        if maxsize < 1:
            raise ValueError("maxsize must be at least 1")
        self.maxsize = maxsize
        self._data = OrderedDict()          # least recently used first

    def __getitem__(self, key):
        value = self._data[key]             # KeyError if missing, like a dict
        self._data.move_to_end(key)         # reading counts as a use
        return value

    def __setitem__(self, key, value):
        self._data[key] = value
        self._data.move_to_end(key)
        if len(self._data) > self.maxsize:
            self._data.popitem(last=False)  # evict the least recently used

    def __delitem__(self, key):
        del self._data[key]

    def __contains__(self, key):
        return key in self._data            # peeking doesn't count as a use

    def __len__(self):
        return len(self._data)

    def __iter__(self):
        return iter(self._data)             # least to most recently used

    def get(self, key, default=None):
        try:
            return self[key]
        except KeyError:
            return default

    def clear(self):
        self._data.clear()


# --- Step 2: the @lru decorator -----------------------------------------------


class CacheInfo(NamedTuple):
    hits: int
    misses: int
    maxsize: int
    currsize: int


_MISSING = object()   # a default that no real value can be: compare it with `is`


def make_key(args: tuple, kwargs: dict) -> tuple:
    """A hashable key for one call. Keyword order doesn't matter."""
    return (args, tuple(sorted(kwargs.items())))


def lru(maxsize: int = 128):
    """Memoize a function in an LRUCache, with functools-style statistics."""

    def decorator(fn):
        cache = LRUCache(maxsize)
        hits = misses = 0

        @wraps(fn)
        def wrapper(*args, **kwargs):
            nonlocal hits, misses
            key = make_key(args, kwargs)
            result = cache.get(key, _MISSING)
            if result is _MISSING:
                misses += 1
                result = cache[key] = fn(*args, **kwargs)
            else:
                hits += 1
            return result

        def cache_info():
            return CacheInfo(hits, misses, maxsize, len(cache))

        def cache_clear():
            nonlocal hits, misses
            cache.clear()
            hits = misses = 0

        wrapper.cache_info = cache_info
        wrapper.cache_clear = cache_clear
        return wrapper

    return decorator


# --- Step 3: a TTL cache ------------------------------------------------------


class FakeClock:
    """A clock for tests: time only moves when you call advance()."""

    def __init__(self, start: float = 0.0):
        self.now = start

    def __call__(self) -> float:
        return self.now

    def advance(self, seconds: float) -> None:
        self.now += seconds


class TTLCache:
    """A cache whose entries expire `ttl` seconds after they're set."""

    def __init__(self, ttl: float, clock: Callable[[], float] = time.monotonic):
        ...

    def __setitem__(self, key, value):
        ...

    def get(self, key, default=None):
        ...

    def __contains__(self, key):
        ...

    def __len__(self):
        ...
```

```python solution
import time
from collections import OrderedDict
from collections.abc import Callable
from functools import wraps
from typing import NamedTuple


# --- Step 1: an LRU cache -----------------------------------------------------


class LRUCache:
    """A mapping that keeps at most `maxsize` keys, evicting the least recently used."""

    def __init__(self, maxsize: int = 128):
        if maxsize < 1:
            raise ValueError("maxsize must be at least 1")
        self.maxsize = maxsize
        self._data = OrderedDict()          # least recently used first

    def __getitem__(self, key):
        value = self._data[key]             # KeyError if missing, like a dict
        self._data.move_to_end(key)         # reading counts as a use
        return value

    def __setitem__(self, key, value):
        self._data[key] = value
        self._data.move_to_end(key)
        if len(self._data) > self.maxsize:
            self._data.popitem(last=False)  # evict the least recently used

    def __delitem__(self, key):
        del self._data[key]

    def __contains__(self, key):
        return key in self._data            # peeking doesn't count as a use

    def __len__(self):
        return len(self._data)

    def __iter__(self):
        return iter(self._data)             # least to most recently used

    def get(self, key, default=None):
        try:
            return self[key]
        except KeyError:
            return default

    def clear(self):
        self._data.clear()


# --- Step 2: the @lru decorator -----------------------------------------------


class CacheInfo(NamedTuple):
    hits: int
    misses: int
    maxsize: int
    currsize: int


_MISSING = object()   # a default that no real value can be: compare it with `is`


def make_key(args: tuple, kwargs: dict) -> tuple:
    """A hashable key for one call. Keyword order doesn't matter."""
    return (args, tuple(sorted(kwargs.items())))


def lru(maxsize: int = 128):
    """Memoize a function in an LRUCache, with functools-style statistics."""

    def decorator(fn):
        cache = LRUCache(maxsize)
        hits = misses = 0

        @wraps(fn)
        def wrapper(*args, **kwargs):
            nonlocal hits, misses
            key = make_key(args, kwargs)
            result = cache.get(key, _MISSING)
            if result is _MISSING:
                misses += 1
                result = cache[key] = fn(*args, **kwargs)
            else:
                hits += 1
            return result

        def cache_info():
            return CacheInfo(hits, misses, maxsize, len(cache))

        def cache_clear():
            nonlocal hits, misses
            cache.clear()
            hits = misses = 0

        wrapper.cache_info = cache_info
        wrapper.cache_clear = cache_clear
        return wrapper

    return decorator


# --- Step 3: a TTL cache ------------------------------------------------------


class FakeClock:
    """A clock for tests: time only moves when you call advance()."""

    def __init__(self, start: float = 0.0):
        self.now = start

    def __call__(self) -> float:
        return self.now

    def advance(self, seconds: float) -> None:
        self.now += seconds


class TTLCache:
    """A cache whose entries expire `ttl` seconds after they're set."""

    def __init__(self, ttl: float, clock: Callable[[], float] = time.monotonic):
        if ttl <= 0:
            raise ValueError("ttl must be positive")
        self.ttl = ttl
        self.clock = clock
        self._data = OrderedDict()            # key -> (expires_at, value), soonest first

    def _expire(self) -> None:
        """Drop expired entries: with one ttl for all, they're always at the front."""
        now = self.clock()
        while self._data:
            expires_at, _ = next(iter(self._data.values()))
            if expires_at > now:
                break
            self._data.popitem(last=False)

    def __setitem__(self, key, value):
        self._data[key] = (self.clock() + self.ttl, value)
        self._data.move_to_end(key)           # a reset key now expires last

    def get(self, key, default=None):
        self._expire()
        if key in self._data:
            return self._data[key][1]
        return default

    def __contains__(self, key):
        self._expire()
        return key in self._data

    def __len__(self):
        self._expire()
        return len(self._data)
```

```python tests
import inspect
import time

@test("returns a value until its ttl runs out")
def _():
    clock = FakeClock()
    cache = TTLCache(ttl=10, clock=clock)
    cache["user:1"] = "Ada"
    clock.advance(9.5)
    eq(cache.get("user:1"), "Ada")
    clock.advance(0.5)
    eq(cache.get("user:1"), None, "set at t=0 with ttl=10, so it's gone at t=10")

@test("get() returns the default for missing and expired keys")
def _():
    clock = FakeClock()
    cache = TTLCache(ttl=5, clock=clock)
    eq(cache.get("nope", "fallback"), "fallback")
    cache["k"] = "v"
    clock.advance(5)
    eq(cache.get("k", "fallback"), "fallback")

@test("falsy values are cached like any other")
def _():
    clock = FakeClock()
    cache = TTLCache(ttl=5, clock=clock)
    cache["zero"] = 0
    cache["empty"] = []
    eq(cache.get("zero", "missing"), 0)
    eq(cache.get("empty", "missing"), [])

@test("setting a key again restarts its ttl")
def _():
    clock = FakeClock()
    cache = TTLCache(ttl=10, clock=clock)
    cache["a"] = 1
    clock.advance(8)
    cache["a"] = 2
    clock.advance(8)
    eq(cache.get("a"), 2, "reset at t=8, so it lives until t=18")

@test("keys behind a reset key still expire on time")
def _():
    clock = FakeClock()
    cache = TTLCache(ttl=10, clock=clock)
    cache["a"] = 1             # expires at t=10
    clock.advance(1)
    cache["b"] = 2             # expires at t=11
    clock.advance(1)
    cache["a"] = 3             # reset: now expires at t=12
    clock.advance(9.5)         # t=11.5
    eq(cache.get("b"), None, "b expired at t=11")
    eq(cache.get("a"), 3)

@test("`in` and len() count only live entries")
def _():
    clock = FakeClock()
    cache = TTLCache(ttl=10, clock=clock)
    cache["a"] = 1
    cache["b"] = 2
    clock.advance(5)
    cache["c"] = 3
    eq(len(cache), 3)
    clock.advance(5)           # t=10: a and b expire
    check("a" not in cache, "a expired at t=10")
    check("c" in cache, "c lives until t=15")
    eq(len(cache), 1)

@test("the clock defaults to time.monotonic")
def _():
    cache = TTLCache(ttl=60)
    cache["k"] = "v"
    eq(cache.get("k"), "v")
    eq(inspect.signature(TTLCache).parameters["clock"].default, time.monotonic)

@test("ttl must be positive")
def _():
    raises(ValueError, TTLCache, 0)
    raises(ValueError, TTLCache, -1)
```

```hint
Store `self._data[key] = (self.clock() + self.ttl, value)`, then call `self._data.move_to_end(key)` so a reset key goes to the back.
```

```hint
Write an `_expire()` helper with a `while self._data:` loop. Read the oldest entry with `next(iter(self._data.values()))`, stop if its `expires_at` is still in the future, and otherwise `self._data.popitem(last=False)`.
```

```hint
Call `_expire()` at the top of `get`, `__contains__` and `__len__`. Once it has run, every entry left in `self._data` is live.
```
:::

## Step 4: A token bucket

Rate limits come in two classic shapes. A **token bucket** allows bursts: the bucket holds up to `capacity` tokens, each call spends one, and tokens drip back in at `rate` per second. A client that has been quiet can fire off `capacity` requests at once, then settles down to `rate` a second. Tolerating short bursts is why it's such a common choice for API limits.

The trick is to never run a timer. A `setInterval` that adds tokens is the tempting JS version, and it's a background job to start, stop and test. Instead, the bucket remembers when it last refilled, and every call tops it up by `elapsed * rate`, capped at `capacity`. With the clock injected, that arithmetic is the whole implementation, and it's exactly testable.

`retry_after()` turns the same arithmetic around: the seconds until enough tokens will be there, `(tokens - self.tokens) / rate`, or `0.0` when there already are. It's what an API sends in a `Retry-After` header, and what the client in step 6 passes on to its callers.

:::tip Pick test numbers that floats can represent
Token counts are floats, and `0.1 + 0.2` isn't `0.3` in Python either ([Numbers & Math](lesson:numbers-and-math#0-1-0-2-decimal-and-fraction)). Rates and clock steps built from powers of two, such as 2 tokens a second and steps of 0.25 seconds, add up exactly, so the tests can compare with `==`. For any other values, compare with `math.isclose()`, or `approx()` in these tests.
:::

:::challenge id=cache-step-4 title="Step 4: A token bucket" difficulty=medium
Write `TokenBucket(rate, capacity, clock=time.monotonic)`:

- The bucket starts full, with `capacity` tokens. It gains `rate` tokens for every second of `clock()` time, fractions included, and never holds more than `capacity`.
- `try_acquire(tokens=1)` spends `tokens` and returns `True` if there are enough. Otherwise it returns `False` and spends nothing. Asking for more than `capacity` raises `ValueError`, since that could never succeed.
- `retry_after(tokens=1)` returns the seconds until `tokens` tokens are available, or `0.0` if they already are.
- `rate <= 0` or `capacity < 1` raises `ValueError`.

No timers: work out the refill from the time elapsed since the last update.

```js
class TokenBucket {
  constructor(rate, capacity, clock = () => performance.now() / 1000) {
    if (rate <= 0 || capacity < 1) throw new RangeError("bad rate or capacity");
    Object.assign(this, { rate, capacity, clock, tokens: capacity, updated: clock() });
  }

  #refill() {
    const now = this.clock();
    this.tokens = Math.min(this.capacity, this.tokens + (now - this.updated) * this.rate);
    this.updated = now;
  }

  tryAcquire(tokens = 1) {
    if (tokens > this.capacity) throw new RangeError("more tokens than the bucket holds");
    this.#refill();
    if (this.tokens < tokens) return false;
    this.tokens -= tokens;
    return true;
  }

  retryAfter(tokens = 1) {
    this.#refill();
    return Math.max(0, (tokens - this.tokens) / this.rate);
  }
}
```

```python starter
import time
from collections import OrderedDict
from collections.abc import Callable
from functools import wraps
from typing import NamedTuple


# --- Step 1: an LRU cache -----------------------------------------------------


class LRUCache:
    """A mapping that keeps at most `maxsize` keys, evicting the least recently used."""

    def __init__(self, maxsize: int = 128):
        if maxsize < 1:
            raise ValueError("maxsize must be at least 1")
        self.maxsize = maxsize
        self._data = OrderedDict()          # least recently used first

    def __getitem__(self, key):
        value = self._data[key]             # KeyError if missing, like a dict
        self._data.move_to_end(key)         # reading counts as a use
        return value

    def __setitem__(self, key, value):
        self._data[key] = value
        self._data.move_to_end(key)
        if len(self._data) > self.maxsize:
            self._data.popitem(last=False)  # evict the least recently used

    def __delitem__(self, key):
        del self._data[key]

    def __contains__(self, key):
        return key in self._data            # peeking doesn't count as a use

    def __len__(self):
        return len(self._data)

    def __iter__(self):
        return iter(self._data)             # least to most recently used

    def get(self, key, default=None):
        try:
            return self[key]
        except KeyError:
            return default

    def clear(self):
        self._data.clear()


# --- Step 2: the @lru decorator -----------------------------------------------


class CacheInfo(NamedTuple):
    hits: int
    misses: int
    maxsize: int
    currsize: int


_MISSING = object()   # a default that no real value can be: compare it with `is`


def make_key(args: tuple, kwargs: dict) -> tuple:
    """A hashable key for one call. Keyword order doesn't matter."""
    return (args, tuple(sorted(kwargs.items())))


def lru(maxsize: int = 128):
    """Memoize a function in an LRUCache, with functools-style statistics."""

    def decorator(fn):
        cache = LRUCache(maxsize)
        hits = misses = 0

        @wraps(fn)
        def wrapper(*args, **kwargs):
            nonlocal hits, misses
            key = make_key(args, kwargs)
            result = cache.get(key, _MISSING)
            if result is _MISSING:
                misses += 1
                result = cache[key] = fn(*args, **kwargs)
            else:
                hits += 1
            return result

        def cache_info():
            return CacheInfo(hits, misses, maxsize, len(cache))

        def cache_clear():
            nonlocal hits, misses
            cache.clear()
            hits = misses = 0

        wrapper.cache_info = cache_info
        wrapper.cache_clear = cache_clear
        return wrapper

    return decorator


# --- Step 3: a TTL cache ------------------------------------------------------


class FakeClock:
    """A clock for tests: time only moves when you call advance()."""

    def __init__(self, start: float = 0.0):
        self.now = start

    def __call__(self) -> float:
        return self.now

    def advance(self, seconds: float) -> None:
        self.now += seconds


class TTLCache:
    """A cache whose entries expire `ttl` seconds after they're set."""

    def __init__(self, ttl: float, clock: Callable[[], float] = time.monotonic):
        if ttl <= 0:
            raise ValueError("ttl must be positive")
        self.ttl = ttl
        self.clock = clock
        self._data = OrderedDict()            # key -> (expires_at, value), soonest first

    def _expire(self) -> None:
        """Drop expired entries: with one ttl for all, they're always at the front."""
        now = self.clock()
        while self._data:
            expires_at, _ = next(iter(self._data.values()))
            if expires_at > now:
                break
            self._data.popitem(last=False)

    def __setitem__(self, key, value):
        self._data[key] = (self.clock() + self.ttl, value)
        self._data.move_to_end(key)           # a reset key now expires last

    def get(self, key, default=None):
        self._expire()
        if key in self._data:
            return self._data[key][1]
        return default

    def __contains__(self, key):
        self._expire()
        return key in self._data

    def __len__(self):
        self._expire()
        return len(self._data)


# --- Step 4: a token bucket ---------------------------------------------------


class TokenBucket:
    """Allows bursts of up to `capacity` calls, refilling at `rate` tokens per second."""

    def __init__(self, rate: float, capacity: int, clock: Callable[[], float] = time.monotonic):
        ...

    def try_acquire(self, tokens: int = 1) -> bool:
        ...

    def retry_after(self, tokens: int = 1) -> float:
        """Seconds until `tokens` tokens are available: 0.0 if they already are."""
        ...
```

```python solution
import time
from collections import OrderedDict
from collections.abc import Callable
from functools import wraps
from typing import NamedTuple


# --- Step 1: an LRU cache -----------------------------------------------------


class LRUCache:
    """A mapping that keeps at most `maxsize` keys, evicting the least recently used."""

    def __init__(self, maxsize: int = 128):
        if maxsize < 1:
            raise ValueError("maxsize must be at least 1")
        self.maxsize = maxsize
        self._data = OrderedDict()          # least recently used first

    def __getitem__(self, key):
        value = self._data[key]             # KeyError if missing, like a dict
        self._data.move_to_end(key)         # reading counts as a use
        return value

    def __setitem__(self, key, value):
        self._data[key] = value
        self._data.move_to_end(key)
        if len(self._data) > self.maxsize:
            self._data.popitem(last=False)  # evict the least recently used

    def __delitem__(self, key):
        del self._data[key]

    def __contains__(self, key):
        return key in self._data            # peeking doesn't count as a use

    def __len__(self):
        return len(self._data)

    def __iter__(self):
        return iter(self._data)             # least to most recently used

    def get(self, key, default=None):
        try:
            return self[key]
        except KeyError:
            return default

    def clear(self):
        self._data.clear()


# --- Step 2: the @lru decorator -----------------------------------------------


class CacheInfo(NamedTuple):
    hits: int
    misses: int
    maxsize: int
    currsize: int


_MISSING = object()   # a default that no real value can be: compare it with `is`


def make_key(args: tuple, kwargs: dict) -> tuple:
    """A hashable key for one call. Keyword order doesn't matter."""
    return (args, tuple(sorted(kwargs.items())))


def lru(maxsize: int = 128):
    """Memoize a function in an LRUCache, with functools-style statistics."""

    def decorator(fn):
        cache = LRUCache(maxsize)
        hits = misses = 0

        @wraps(fn)
        def wrapper(*args, **kwargs):
            nonlocal hits, misses
            key = make_key(args, kwargs)
            result = cache.get(key, _MISSING)
            if result is _MISSING:
                misses += 1
                result = cache[key] = fn(*args, **kwargs)
            else:
                hits += 1
            return result

        def cache_info():
            return CacheInfo(hits, misses, maxsize, len(cache))

        def cache_clear():
            nonlocal hits, misses
            cache.clear()
            hits = misses = 0

        wrapper.cache_info = cache_info
        wrapper.cache_clear = cache_clear
        return wrapper

    return decorator


# --- Step 3: a TTL cache ------------------------------------------------------


class FakeClock:
    """A clock for tests: time only moves when you call advance()."""

    def __init__(self, start: float = 0.0):
        self.now = start

    def __call__(self) -> float:
        return self.now

    def advance(self, seconds: float) -> None:
        self.now += seconds


class TTLCache:
    """A cache whose entries expire `ttl` seconds after they're set."""

    def __init__(self, ttl: float, clock: Callable[[], float] = time.monotonic):
        if ttl <= 0:
            raise ValueError("ttl must be positive")
        self.ttl = ttl
        self.clock = clock
        self._data = OrderedDict()            # key -> (expires_at, value), soonest first

    def _expire(self) -> None:
        """Drop expired entries: with one ttl for all, they're always at the front."""
        now = self.clock()
        while self._data:
            expires_at, _ = next(iter(self._data.values()))
            if expires_at > now:
                break
            self._data.popitem(last=False)

    def __setitem__(self, key, value):
        self._data[key] = (self.clock() + self.ttl, value)
        self._data.move_to_end(key)           # a reset key now expires last

    def get(self, key, default=None):
        self._expire()
        if key in self._data:
            return self._data[key][1]
        return default

    def __contains__(self, key):
        self._expire()
        return key in self._data

    def __len__(self):
        self._expire()
        return len(self._data)


# --- Step 4: a token bucket ---------------------------------------------------


class TokenBucket:
    """Allows bursts of up to `capacity` calls, refilling at `rate` tokens per second."""

    def __init__(self, rate: float, capacity: int, clock: Callable[[], float] = time.monotonic):
        if rate <= 0 or capacity < 1:
            raise ValueError("rate must be positive and capacity at least 1")
        self.rate = rate
        self.capacity = capacity
        self.clock = clock
        self.tokens = capacity                # start full
        self.updated = clock()

    def _refill(self) -> None:
        now = self.clock()
        self.tokens = min(self.capacity, self.tokens + (now - self.updated) * self.rate)
        self.updated = now

    def try_acquire(self, tokens: int = 1) -> bool:
        if tokens > self.capacity:
            raise ValueError(f"the bucket only holds {self.capacity} tokens")
        self._refill()
        if self.tokens < tokens:
            return False
        self.tokens -= tokens
        return True

    def retry_after(self, tokens: int = 1) -> float:
        """Seconds until `tokens` tokens are available: 0.0 if they already are."""
        self._refill()
        return max(0.0, (tokens - self.tokens) / self.rate)
```

```python tests
import inspect
import time

@test("starts full: allows `capacity` calls at once, then refuses")
def _():
    bucket = TokenBucket(rate=1, capacity=3, clock=FakeClock())
    eq([bucket.try_acquire() for _ in range(4)], [True, True, True, False])

@test("refills at `rate` tokens per second")
def _():
    clock = FakeClock()
    bucket = TokenBucket(rate=2, capacity=2, clock=clock)
    bucket.try_acquire()
    bucket.try_acquire()
    check(not bucket.try_acquire(), "the bucket should be empty")
    clock.advance(0.5)           # 2 tokens a second for half a second: 1 token
    eq([bucket.try_acquire(), bucket.try_acquire()], [True, False])

@test("fractions of a token add up")
def _():
    clock = FakeClock()
    bucket = TokenBucket(rate=1, capacity=1, clock=clock)
    bucket.try_acquire()
    clock.advance(0.25)
    check(not bucket.try_acquire(), "a quarter of a token isn't enough")
    clock.advance(0.75)
    check(bucket.try_acquire(), "0.25 + 0.75 makes a whole token")

@test("never holds more than `capacity` tokens")
def _():
    clock = FakeClock()
    bucket = TokenBucket(rate=1, capacity=2, clock=clock)
    clock.advance(3600)
    eq([bucket.try_acquire() for _ in range(3)], [True, True, False])

@test("try_acquire(n) takes n tokens at once, or none")
def _():
    bucket = TokenBucket(rate=1, capacity=5, clock=FakeClock())
    check(bucket.try_acquire(3), "3 of the 5 tokens")
    check(not bucket.try_acquire(3), "only 2 left")
    check(bucket.try_acquire(2), "the refused call shouldn't have spent anything")

@test("asking for more than `capacity` raises ValueError")
def _():
    bucket = TokenBucket(rate=1, capacity=2, clock=FakeClock())
    raises(ValueError, bucket.try_acquire, 3)

@test("retry_after() says how long until a token is available")
def _():
    clock = FakeClock()
    bucket = TokenBucket(rate=2, capacity=1, clock=clock)
    eq(bucket.retry_after(), 0.0)
    bucket.try_acquire()
    approx(bucket.retry_after(), 0.5)
    clock.advance(0.25)
    approx(bucket.retry_after(), 0.25)
    clock.advance(0.25)
    eq(bucket.retry_after(), 0.0)

@test("retry_after(n) waits for n tokens")
def _():
    clock = FakeClock()
    bucket = TokenBucket(rate=4, capacity=4, clock=clock)
    bucket.try_acquire(4)
    approx(bucket.retry_after(2), 0.5)
    clock.advance(0.25)
    approx(bucket.retry_after(2), 0.25)

@test("rate and capacity are validated")
def _():
    raises(ValueError, TokenBucket, 0, 1)
    raises(ValueError, TokenBucket, 1, 0)

@test("the clock defaults to time.monotonic")
def _():
    check(TokenBucket(rate=1, capacity=1).try_acquire(), "a new bucket starts full")
    eq(inspect.signature(TokenBucket).parameters["clock"].default, time.monotonic)
```

```hint
In `__init__`, after validating, store `self.tokens = capacity` and `self.updated = clock()`.
```

```hint
A `_refill()` helper does the bookkeeping: `now = self.clock()`, add `(now - self.updated) * self.rate` tokens, cap the total with `min(self.capacity, ...)`, then set `self.updated = now`.
```

```hint
Both `try_acquire` and `retry_after` start by calling `_refill()`. After that, `retry_after` is `max(0.0, (tokens - self.tokens) / self.rate)`.
```
:::

## Step 5: A sliding-window limiter

Some APIs forbid bursts instead: "at most 100 requests in any 60 seconds". The naive version, a counter that resets on the minute, has a hole at the boundary. A hundred requests at 0:59 and a hundred more at 1:00 is two hundred in two seconds, and a fixed window allows all of them. A **sliding window log** closes the hole by remembering when each allowed call happened, and counting only the calls within the last `window` seconds.

The log is a queue of timestamps: new calls join at the back, and old ones leave from the front. That's a job for `collections.deque`, whose `popleft()` is O(1) where `list.pop(0)` shifts every remaining element ([Lists](lesson:lists#adding-and-removing-push-pop-shift-unshift-splice)).

```python run
from collections import deque

calls = deque([0.0, 2.5, 4.0, 9.0])     # when recent calls happened
now, window = 13.0, 10.0
while calls and calls[0] + window <= now:
    calls.popleft()                     # this one has left the window
print(list(calls), len(calls), "calls in the last 10 seconds")
```

`SlidingWindowLimiter` has the same two methods as `TokenBucket`, `try_acquire()` and `retry_after()`, and that shared shape is all the client in step 6 relies on.

:::deep Memory versus precision
A log costs one timestamp per allowed call, up to `limit` of them. When limits run into the thousands, production limiters often switch to a sliding window *counter*: they keep counts for the current and previous fixed windows, and weight the previous one by how much of it still overlaps the sliding window. It's approximate, but O(1) in memory.
:::

:::challenge id=cache-step-5 title="Step 5: A sliding-window limiter" difficulty=medium
Write `SlidingWindowLimiter(limit, window, clock=time.monotonic)`:

- `try_acquire()` returns `True` and records the call if fewer than `limit` calls were allowed in the last `window` seconds. Otherwise it returns `False`, and the refused call isn't recorded.
- A call made at time `t` counts while `clock() < t + window`.
- `retry_after()` returns the seconds until the oldest counted call leaves the window, or `0.0` if a call would be allowed now.
- Keep the times of the counted calls in a `deque` called `calls`, oldest first, and drop the ones that have left the window, so memory stays bounded.
- `limit < 1` or `window <= 0` raises `ValueError`.

```js
class SlidingWindowLimiter {
  constructor(limit, window, clock = () => performance.now() / 1000) {
    if (limit < 1 || window <= 0) throw new RangeError("bad limit or window");
    Object.assign(this, { limit, window, clock, calls: [] });
  }

  #forgetOld(now) {
    while (this.calls.length && this.calls[0] + this.window <= now) this.calls.shift();
  }

  tryAcquire() {
    const now = this.clock();
    this.#forgetOld(now);
    if (this.calls.length >= this.limit) return false;
    this.calls.push(now);
    return true;
  }

  retryAfter() {
    const now = this.clock();
    this.#forgetOld(now);
    return this.calls.length < this.limit ? 0 : this.calls[0] + this.window - now;
  }
}
```

```python starter
import time
from collections import OrderedDict, deque
from collections.abc import Callable
from functools import wraps
from typing import NamedTuple


# --- Step 1: an LRU cache -----------------------------------------------------


class LRUCache:
    """A mapping that keeps at most `maxsize` keys, evicting the least recently used."""

    def __init__(self, maxsize: int = 128):
        if maxsize < 1:
            raise ValueError("maxsize must be at least 1")
        self.maxsize = maxsize
        self._data = OrderedDict()          # least recently used first

    def __getitem__(self, key):
        value = self._data[key]             # KeyError if missing, like a dict
        self._data.move_to_end(key)         # reading counts as a use
        return value

    def __setitem__(self, key, value):
        self._data[key] = value
        self._data.move_to_end(key)
        if len(self._data) > self.maxsize:
            self._data.popitem(last=False)  # evict the least recently used

    def __delitem__(self, key):
        del self._data[key]

    def __contains__(self, key):
        return key in self._data            # peeking doesn't count as a use

    def __len__(self):
        return len(self._data)

    def __iter__(self):
        return iter(self._data)             # least to most recently used

    def get(self, key, default=None):
        try:
            return self[key]
        except KeyError:
            return default

    def clear(self):
        self._data.clear()


# --- Step 2: the @lru decorator -----------------------------------------------


class CacheInfo(NamedTuple):
    hits: int
    misses: int
    maxsize: int
    currsize: int


_MISSING = object()   # a default that no real value can be: compare it with `is`


def make_key(args: tuple, kwargs: dict) -> tuple:
    """A hashable key for one call. Keyword order doesn't matter."""
    return (args, tuple(sorted(kwargs.items())))


def lru(maxsize: int = 128):
    """Memoize a function in an LRUCache, with functools-style statistics."""

    def decorator(fn):
        cache = LRUCache(maxsize)
        hits = misses = 0

        @wraps(fn)
        def wrapper(*args, **kwargs):
            nonlocal hits, misses
            key = make_key(args, kwargs)
            result = cache.get(key, _MISSING)
            if result is _MISSING:
                misses += 1
                result = cache[key] = fn(*args, **kwargs)
            else:
                hits += 1
            return result

        def cache_info():
            return CacheInfo(hits, misses, maxsize, len(cache))

        def cache_clear():
            nonlocal hits, misses
            cache.clear()
            hits = misses = 0

        wrapper.cache_info = cache_info
        wrapper.cache_clear = cache_clear
        return wrapper

    return decorator


# --- Step 3: a TTL cache ------------------------------------------------------


class FakeClock:
    """A clock for tests: time only moves when you call advance()."""

    def __init__(self, start: float = 0.0):
        self.now = start

    def __call__(self) -> float:
        return self.now

    def advance(self, seconds: float) -> None:
        self.now += seconds


class TTLCache:
    """A cache whose entries expire `ttl` seconds after they're set."""

    def __init__(self, ttl: float, clock: Callable[[], float] = time.monotonic):
        if ttl <= 0:
            raise ValueError("ttl must be positive")
        self.ttl = ttl
        self.clock = clock
        self._data = OrderedDict()            # key -> (expires_at, value), soonest first

    def _expire(self) -> None:
        """Drop expired entries: with one ttl for all, they're always at the front."""
        now = self.clock()
        while self._data:
            expires_at, _ = next(iter(self._data.values()))
            if expires_at > now:
                break
            self._data.popitem(last=False)

    def __setitem__(self, key, value):
        self._data[key] = (self.clock() + self.ttl, value)
        self._data.move_to_end(key)           # a reset key now expires last

    def get(self, key, default=None):
        self._expire()
        if key in self._data:
            return self._data[key][1]
        return default

    def __contains__(self, key):
        self._expire()
        return key in self._data

    def __len__(self):
        self._expire()
        return len(self._data)


# --- Step 4: a token bucket ---------------------------------------------------


class TokenBucket:
    """Allows bursts of up to `capacity` calls, refilling at `rate` tokens per second."""

    def __init__(self, rate: float, capacity: int, clock: Callable[[], float] = time.monotonic):
        if rate <= 0 or capacity < 1:
            raise ValueError("rate must be positive and capacity at least 1")
        self.rate = rate
        self.capacity = capacity
        self.clock = clock
        self.tokens = capacity                # start full
        self.updated = clock()

    def _refill(self) -> None:
        now = self.clock()
        self.tokens = min(self.capacity, self.tokens + (now - self.updated) * self.rate)
        self.updated = now

    def try_acquire(self, tokens: int = 1) -> bool:
        if tokens > self.capacity:
            raise ValueError(f"the bucket only holds {self.capacity} tokens")
        self._refill()
        if self.tokens < tokens:
            return False
        self.tokens -= tokens
        return True

    def retry_after(self, tokens: int = 1) -> float:
        """Seconds until `tokens` tokens are available: 0.0 if they already are."""
        self._refill()
        return max(0.0, (tokens - self.tokens) / self.rate)


# --- Step 5: a sliding window -------------------------------------------------


class SlidingWindowLimiter:
    """Allows at most `limit` calls in any `window` seconds."""

    def __init__(self, limit: int, window: float, clock: Callable[[], float] = time.monotonic):
        ...

    def try_acquire(self) -> bool:
        ...

    def retry_after(self) -> float:
        """Seconds until a call would be allowed: 0.0 if one would be now."""
        ...
```

```python solution
import time
from collections import OrderedDict, deque
from collections.abc import Callable
from functools import wraps
from typing import NamedTuple


# --- Step 1: an LRU cache -----------------------------------------------------


class LRUCache:
    """A mapping that keeps at most `maxsize` keys, evicting the least recently used."""

    def __init__(self, maxsize: int = 128):
        if maxsize < 1:
            raise ValueError("maxsize must be at least 1")
        self.maxsize = maxsize
        self._data = OrderedDict()          # least recently used first

    def __getitem__(self, key):
        value = self._data[key]             # KeyError if missing, like a dict
        self._data.move_to_end(key)         # reading counts as a use
        return value

    def __setitem__(self, key, value):
        self._data[key] = value
        self._data.move_to_end(key)
        if len(self._data) > self.maxsize:
            self._data.popitem(last=False)  # evict the least recently used

    def __delitem__(self, key):
        del self._data[key]

    def __contains__(self, key):
        return key in self._data            # peeking doesn't count as a use

    def __len__(self):
        return len(self._data)

    def __iter__(self):
        return iter(self._data)             # least to most recently used

    def get(self, key, default=None):
        try:
            return self[key]
        except KeyError:
            return default

    def clear(self):
        self._data.clear()


# --- Step 2: the @lru decorator -----------------------------------------------


class CacheInfo(NamedTuple):
    hits: int
    misses: int
    maxsize: int
    currsize: int


_MISSING = object()   # a default that no real value can be: compare it with `is`


def make_key(args: tuple, kwargs: dict) -> tuple:
    """A hashable key for one call. Keyword order doesn't matter."""
    return (args, tuple(sorted(kwargs.items())))


def lru(maxsize: int = 128):
    """Memoize a function in an LRUCache, with functools-style statistics."""

    def decorator(fn):
        cache = LRUCache(maxsize)
        hits = misses = 0

        @wraps(fn)
        def wrapper(*args, **kwargs):
            nonlocal hits, misses
            key = make_key(args, kwargs)
            result = cache.get(key, _MISSING)
            if result is _MISSING:
                misses += 1
                result = cache[key] = fn(*args, **kwargs)
            else:
                hits += 1
            return result

        def cache_info():
            return CacheInfo(hits, misses, maxsize, len(cache))

        def cache_clear():
            nonlocal hits, misses
            cache.clear()
            hits = misses = 0

        wrapper.cache_info = cache_info
        wrapper.cache_clear = cache_clear
        return wrapper

    return decorator


# --- Step 3: a TTL cache ------------------------------------------------------


class FakeClock:
    """A clock for tests: time only moves when you call advance()."""

    def __init__(self, start: float = 0.0):
        self.now = start

    def __call__(self) -> float:
        return self.now

    def advance(self, seconds: float) -> None:
        self.now += seconds


class TTLCache:
    """A cache whose entries expire `ttl` seconds after they're set."""

    def __init__(self, ttl: float, clock: Callable[[], float] = time.monotonic):
        if ttl <= 0:
            raise ValueError("ttl must be positive")
        self.ttl = ttl
        self.clock = clock
        self._data = OrderedDict()            # key -> (expires_at, value), soonest first

    def _expire(self) -> None:
        """Drop expired entries: with one ttl for all, they're always at the front."""
        now = self.clock()
        while self._data:
            expires_at, _ = next(iter(self._data.values()))
            if expires_at > now:
                break
            self._data.popitem(last=False)

    def __setitem__(self, key, value):
        self._data[key] = (self.clock() + self.ttl, value)
        self._data.move_to_end(key)           # a reset key now expires last

    def get(self, key, default=None):
        self._expire()
        if key in self._data:
            return self._data[key][1]
        return default

    def __contains__(self, key):
        self._expire()
        return key in self._data

    def __len__(self):
        self._expire()
        return len(self._data)


# --- Step 4: a token bucket ---------------------------------------------------


class TokenBucket:
    """Allows bursts of up to `capacity` calls, refilling at `rate` tokens per second."""

    def __init__(self, rate: float, capacity: int, clock: Callable[[], float] = time.monotonic):
        if rate <= 0 or capacity < 1:
            raise ValueError("rate must be positive and capacity at least 1")
        self.rate = rate
        self.capacity = capacity
        self.clock = clock
        self.tokens = capacity                # start full
        self.updated = clock()

    def _refill(self) -> None:
        now = self.clock()
        self.tokens = min(self.capacity, self.tokens + (now - self.updated) * self.rate)
        self.updated = now

    def try_acquire(self, tokens: int = 1) -> bool:
        if tokens > self.capacity:
            raise ValueError(f"the bucket only holds {self.capacity} tokens")
        self._refill()
        if self.tokens < tokens:
            return False
        self.tokens -= tokens
        return True

    def retry_after(self, tokens: int = 1) -> float:
        """Seconds until `tokens` tokens are available: 0.0 if they already are."""
        self._refill()
        return max(0.0, (tokens - self.tokens) / self.rate)


# --- Step 5: a sliding window -------------------------------------------------


class SlidingWindowLimiter:
    """Allows at most `limit` calls in any `window` seconds."""

    def __init__(self, limit: int, window: float, clock: Callable[[], float] = time.monotonic):
        if limit < 1 or window <= 0:
            raise ValueError("limit must be at least 1 and window positive")
        self.limit = limit
        self.window = window
        self.clock = clock
        self.calls: deque[float] = deque()    # when the counted calls happened, oldest first

    def _forget_old(self, now: float) -> None:
        while self.calls and self.calls[0] + self.window <= now:
            self.calls.popleft()

    def try_acquire(self) -> bool:
        now = self.clock()
        self._forget_old(now)
        if len(self.calls) >= self.limit:
            return False
        self.calls.append(now)
        return True

    def retry_after(self) -> float:
        """Seconds until a call would be allowed: 0.0 if one would be now."""
        now = self.clock()
        self._forget_old(now)
        if len(self.calls) < self.limit:
            return 0.0
        return self.calls[0] + self.window - now
```

```python tests
@test("allows `limit` calls in a window, then refuses")
def _():
    limiter = SlidingWindowLimiter(limit=3, window=10, clock=FakeClock())
    eq([limiter.try_acquire() for _ in range(4)], [True, True, True, False])

@test("a call stops counting `window` seconds after it was made")
def _():
    clock = FakeClock()
    limiter = SlidingWindowLimiter(limit=1, window=10, clock=clock)
    limiter.try_acquire()
    clock.advance(9.5)
    check(not limiter.try_acquire(), "the t=0 call still counts at t=9.5")
    clock.advance(0.5)
    check(limiter.try_acquire(), "at t=10 the t=0 call has left the window")

@test("the window slides: old calls leave one at a time")
def _():
    clock = FakeClock()
    limiter = SlidingWindowLimiter(limit=2, window=10, clock=clock)
    limiter.try_acquire()        # t=0
    clock.advance(4)
    limiter.try_acquire()        # t=4
    clock.advance(6)             # t=10: the t=0 call leaves
    eq([limiter.try_acquire(), limiter.try_acquire()], [True, False])
    clock.advance(4)             # t=14: the t=4 call leaves
    eq([limiter.try_acquire(), limiter.try_acquire()], [True, False])

@test("no burst at a window boundary, unlike a fixed window")
def _():
    clock = FakeClock(start=8)
    limiter = SlidingWindowLimiter(limit=2, window=10, clock=clock)
    eq([limiter.try_acquire(), limiter.try_acquire()], [True, True])
    clock.advance(4)             # t=12: a fixed 0-10 window would have reset at t=10
    check(not limiter.try_acquire(), "both calls from t=8 are within the last 10 seconds")

@test("refused calls don't count")
def _():
    clock = FakeClock()
    limiter = SlidingWindowLimiter(limit=1, window=10, clock=clock)
    limiter.try_acquire()        # t=0
    for _ in range(5):
        clock.advance(1)
        limiter.try_acquire()    # refused at t=1 to t=5
    clock.advance(5)             # t=10
    check(limiter.try_acquire(), "only allowed calls should be remembered")

@test("retry_after() says when the oldest call leaves the window")
def _():
    clock = FakeClock()
    limiter = SlidingWindowLimiter(limit=2, window=10, clock=clock)
    eq(limiter.retry_after(), 0.0)
    limiter.try_acquire()        # t=0
    clock.advance(3)
    limiter.try_acquire()        # t=3
    clock.advance(1)             # t=4
    eq(limiter.retry_after(), 6.0)
    clock.advance(6)             # t=10: the t=0 call has left
    eq(limiter.retry_after(), 0.0)

@test("forgets calls that have left the window")
def _():
    clock = FakeClock()
    limiter = SlidingWindowLimiter(limit=3, window=1, clock=clock)
    for _ in range(1000):
        limiter.try_acquire()
        clock.advance(0.25)
    check(len(limiter.calls) <= 3, "calls should only hold timestamps still inside the window")

@test("limit and window are validated")
def _():
    raises(ValueError, SlidingWindowLimiter, 0, 10)
    raises(ValueError, SlidingWindowLimiter, 1, 0)

@test("keeps the timestamps in a deque")
def _():
    requires_call("popleft", "drop the oldest timestamp with deque.popleft(), which is O(1)")
```

```hint
Create `self.calls = deque()` in `__init__`. A helper drops old calls: `while self.calls and self.calls[0] + self.window <= now: self.calls.popleft()`.
```

```hint
In `try_acquire`, read the clock once, drop the old calls, then compare `len(self.calls)` with `self.limit`. Append `now` only when the call is allowed.
```

```hint
`retry_after` drops the old calls too. It returns `0.0` when there's room, and `self.calls[0] + self.window - now` when there isn't.
```
:::

## Step 6: A cached, rate-limited client

Now for the client in front of the rate-limited API. The order of its checks is the whole design:

1. Build the key from the path and parameters with `make_key()` from step 2.
2. Ask the cache. A hit returns at once and costs nothing: no backend call and no token.
3. On a miss, ask the limiter. If it refuses, raise `RateLimitError` carrying `retry_after()`, so the caller can decide whether to wait, show stale data or give up.
4. Otherwise call the backend, store the result and return it.

Ask the limiter first and every cache hit would burn a token for an answer you already had. The crawler project runs into the same rule from the other side ([Build an Async Web Crawler](lesson:project-async-crawler)): the order of the layers decides what each one sees.

`CachedClient` never checks which classes it was given. Any cache with `get(key, default)` and item assignment fits, so `TTLCache` and `LRUCache` both work, and any limiter with `try_acquire()` and `retry_after()`. TypeScript would write the limiter's contract as an interface. Python's equivalent is a `Protocol`: a structural type that mypy and pyright check without either limiter inheriting from it ([Interfaces: Protocol](lesson:type-hints#interfaces-protocol)). At runtime, it's duck typing either way.

:::compare A contract nobody has to sign
```ts
interface RateLimiter {
  tryAcquire(): boolean;
  retryAfter(): number;
}

// TokenBucket never says "implements RateLimiter"
const limiter: RateLimiter = new TokenBucket(1, 2);
```
```python
class RateLimiter(Protocol):
    def try_acquire(self) -> bool: ...

    def retry_after(self) -> float: ...


# TokenBucket never inherits from RateLimiter
limiter: RateLimiter = TokenBucket(1, 2)
```
:::

:::challenge id=cache-step-6 title="Step 6: A cached, rate-limited client" difficulty=hard
Write the client. The starter provides `RateLimiter` and the `ClientStats` dataclass.

- `RateLimitError(path, retry_after)` is an `Exception` with `.path` and `.retry_after` attributes.
- `CachedClient(fetch, *, cache, limiter)` keeps its counters in `self.stats`, a fresh `ClientStats()`.
- `client.get(path, **params)` builds the key with `make_key((path,), params)`, then:
  - if the cache has the key, counts a hit and returns the cached value, falsy values included;
  - otherwise, if `limiter.try_acquire()` refuses, counts a refusal in `stats.limited` and raises `RateLimitError(path, limiter.retry_after())`;
  - otherwise counts a miss, calls `fetch(path, **params)`, stores the result in the cache and returns it.
- If `fetch` raises, the error propagates and nothing is cached.

```js
class RateLimitError extends Error {
  constructor(path, retryAfter) {
    super(`rate limited: retry ${path} in ${retryAfter.toFixed(2)}s`);
    Object.assign(this, { path, retryAfter });
  }
}

class CachedClient {
  static #MISSING = Symbol("missing");

  constructor(fetchFn, { cache, limiter }) {
    Object.assign(this, { fetchFn, cache, limiter, stats: { hits: 0, misses: 0, limited: 0 } });
  }

  get(path, params = {}) {
    const key = JSON.stringify([path, Object.entries(params).sort()]);
    const cached = this.cache.get(key, CachedClient.#MISSING);
    if (cached !== CachedClient.#MISSING) {
      this.stats.hits++;
      return cached;
    }
    if (!this.limiter.tryAcquire()) {
      this.stats.limited++;
      throw new RateLimitError(path, this.limiter.retryAfter());
    }
    this.stats.misses++;
    const value = this.fetchFn(path, params);
    this.cache.set(key, value);
    return value;
  }
}
```

```python starter
import time
from collections import OrderedDict, deque
from collections.abc import Callable
from dataclasses import dataclass
from functools import wraps
from typing import NamedTuple, Protocol


# --- Step 1: an LRU cache -----------------------------------------------------


class LRUCache:
    """A mapping that keeps at most `maxsize` keys, evicting the least recently used."""

    def __init__(self, maxsize: int = 128):
        if maxsize < 1:
            raise ValueError("maxsize must be at least 1")
        self.maxsize = maxsize
        self._data = OrderedDict()          # least recently used first

    def __getitem__(self, key):
        value = self._data[key]             # KeyError if missing, like a dict
        self._data.move_to_end(key)         # reading counts as a use
        return value

    def __setitem__(self, key, value):
        self._data[key] = value
        self._data.move_to_end(key)
        if len(self._data) > self.maxsize:
            self._data.popitem(last=False)  # evict the least recently used

    def __delitem__(self, key):
        del self._data[key]

    def __contains__(self, key):
        return key in self._data            # peeking doesn't count as a use

    def __len__(self):
        return len(self._data)

    def __iter__(self):
        return iter(self._data)             # least to most recently used

    def get(self, key, default=None):
        try:
            return self[key]
        except KeyError:
            return default

    def clear(self):
        self._data.clear()


# --- Step 2: the @lru decorator -----------------------------------------------


class CacheInfo(NamedTuple):
    hits: int
    misses: int
    maxsize: int
    currsize: int


_MISSING = object()   # a default that no real value can be: compare it with `is`


def make_key(args: tuple, kwargs: dict) -> tuple:
    """A hashable key for one call. Keyword order doesn't matter."""
    return (args, tuple(sorted(kwargs.items())))


def lru(maxsize: int = 128):
    """Memoize a function in an LRUCache, with functools-style statistics."""

    def decorator(fn):
        cache = LRUCache(maxsize)
        hits = misses = 0

        @wraps(fn)
        def wrapper(*args, **kwargs):
            nonlocal hits, misses
            key = make_key(args, kwargs)
            result = cache.get(key, _MISSING)
            if result is _MISSING:
                misses += 1
                result = cache[key] = fn(*args, **kwargs)
            else:
                hits += 1
            return result

        def cache_info():
            return CacheInfo(hits, misses, maxsize, len(cache))

        def cache_clear():
            nonlocal hits, misses
            cache.clear()
            hits = misses = 0

        wrapper.cache_info = cache_info
        wrapper.cache_clear = cache_clear
        return wrapper

    return decorator


# --- Step 3: a TTL cache ------------------------------------------------------


class FakeClock:
    """A clock for tests: time only moves when you call advance()."""

    def __init__(self, start: float = 0.0):
        self.now = start

    def __call__(self) -> float:
        return self.now

    def advance(self, seconds: float) -> None:
        self.now += seconds


class TTLCache:
    """A cache whose entries expire `ttl` seconds after they're set."""

    def __init__(self, ttl: float, clock: Callable[[], float] = time.monotonic):
        if ttl <= 0:
            raise ValueError("ttl must be positive")
        self.ttl = ttl
        self.clock = clock
        self._data = OrderedDict()            # key -> (expires_at, value), soonest first

    def _expire(self) -> None:
        """Drop expired entries: with one ttl for all, they're always at the front."""
        now = self.clock()
        while self._data:
            expires_at, _ = next(iter(self._data.values()))
            if expires_at > now:
                break
            self._data.popitem(last=False)

    def __setitem__(self, key, value):
        self._data[key] = (self.clock() + self.ttl, value)
        self._data.move_to_end(key)           # a reset key now expires last

    def get(self, key, default=None):
        self._expire()
        if key in self._data:
            return self._data[key][1]
        return default

    def __contains__(self, key):
        self._expire()
        return key in self._data

    def __len__(self):
        self._expire()
        return len(self._data)


# --- Step 4: a token bucket ---------------------------------------------------


class TokenBucket:
    """Allows bursts of up to `capacity` calls, refilling at `rate` tokens per second."""

    def __init__(self, rate: float, capacity: int, clock: Callable[[], float] = time.monotonic):
        if rate <= 0 or capacity < 1:
            raise ValueError("rate must be positive and capacity at least 1")
        self.rate = rate
        self.capacity = capacity
        self.clock = clock
        self.tokens = capacity                # start full
        self.updated = clock()

    def _refill(self) -> None:
        now = self.clock()
        self.tokens = min(self.capacity, self.tokens + (now - self.updated) * self.rate)
        self.updated = now

    def try_acquire(self, tokens: int = 1) -> bool:
        if tokens > self.capacity:
            raise ValueError(f"the bucket only holds {self.capacity} tokens")
        self._refill()
        if self.tokens < tokens:
            return False
        self.tokens -= tokens
        return True

    def retry_after(self, tokens: int = 1) -> float:
        """Seconds until `tokens` tokens are available: 0.0 if they already are."""
        self._refill()
        return max(0.0, (tokens - self.tokens) / self.rate)


# --- Step 5: a sliding window -------------------------------------------------


class SlidingWindowLimiter:
    """Allows at most `limit` calls in any `window` seconds."""

    def __init__(self, limit: int, window: float, clock: Callable[[], float] = time.monotonic):
        if limit < 1 or window <= 0:
            raise ValueError("limit must be at least 1 and window positive")
        self.limit = limit
        self.window = window
        self.clock = clock
        self.calls: deque[float] = deque()    # when the counted calls happened, oldest first

    def _forget_old(self, now: float) -> None:
        while self.calls and self.calls[0] + self.window <= now:
            self.calls.popleft()

    def try_acquire(self) -> bool:
        now = self.clock()
        self._forget_old(now)
        if len(self.calls) >= self.limit:
            return False
        self.calls.append(now)
        return True

    def retry_after(self) -> float:
        """Seconds until a call would be allowed: 0.0 if one would be now."""
        now = self.clock()
        self._forget_old(now)
        if len(self.calls) < self.limit:
            return 0.0
        return self.calls[0] + self.window - now


# --- Step 6: the client -------------------------------------------------------


class RateLimitError(Exception):
    """Raised instead of calling the backend when the limiter says no."""

    def __init__(self, path: str, retry_after: float):
        ...


class RateLimiter(Protocol):
    """What CachedClient needs from a limiter. TokenBucket and SlidingWindowLimiter both fit."""

    def try_acquire(self) -> bool: ...

    def retry_after(self) -> float: ...


@dataclass
class ClientStats:
    hits: int = 0
    misses: int = 0
    limited: int = 0


class CachedClient:
    """Answers from the cache when it can, and calls `fetch` only when the limiter allows."""

    def __init__(self, fetch: Callable[..., object], *, cache, limiter: RateLimiter):
        ...

    def get(self, path: str, **params):
        ...
```

```python solution
import time
from collections import OrderedDict, deque
from collections.abc import Callable
from dataclasses import dataclass
from functools import wraps
from typing import NamedTuple, Protocol


# --- Step 1: an LRU cache -----------------------------------------------------


class LRUCache:
    """A mapping that keeps at most `maxsize` keys, evicting the least recently used."""

    def __init__(self, maxsize: int = 128):
        if maxsize < 1:
            raise ValueError("maxsize must be at least 1")
        self.maxsize = maxsize
        self._data = OrderedDict()          # least recently used first

    def __getitem__(self, key):
        value = self._data[key]             # KeyError if missing, like a dict
        self._data.move_to_end(key)         # reading counts as a use
        return value

    def __setitem__(self, key, value):
        self._data[key] = value
        self._data.move_to_end(key)
        if len(self._data) > self.maxsize:
            self._data.popitem(last=False)  # evict the least recently used

    def __delitem__(self, key):
        del self._data[key]

    def __contains__(self, key):
        return key in self._data            # peeking doesn't count as a use

    def __len__(self):
        return len(self._data)

    def __iter__(self):
        return iter(self._data)             # least to most recently used

    def get(self, key, default=None):
        try:
            return self[key]
        except KeyError:
            return default

    def clear(self):
        self._data.clear()


# --- Step 2: the @lru decorator -----------------------------------------------


class CacheInfo(NamedTuple):
    hits: int
    misses: int
    maxsize: int
    currsize: int


_MISSING = object()   # a default that no real value can be: compare it with `is`


def make_key(args: tuple, kwargs: dict) -> tuple:
    """A hashable key for one call. Keyword order doesn't matter."""
    return (args, tuple(sorted(kwargs.items())))


def lru(maxsize: int = 128):
    """Memoize a function in an LRUCache, with functools-style statistics."""

    def decorator(fn):
        cache = LRUCache(maxsize)
        hits = misses = 0

        @wraps(fn)
        def wrapper(*args, **kwargs):
            nonlocal hits, misses
            key = make_key(args, kwargs)
            result = cache.get(key, _MISSING)
            if result is _MISSING:
                misses += 1
                result = cache[key] = fn(*args, **kwargs)
            else:
                hits += 1
            return result

        def cache_info():
            return CacheInfo(hits, misses, maxsize, len(cache))

        def cache_clear():
            nonlocal hits, misses
            cache.clear()
            hits = misses = 0

        wrapper.cache_info = cache_info
        wrapper.cache_clear = cache_clear
        return wrapper

    return decorator


# --- Step 3: a TTL cache ------------------------------------------------------


class FakeClock:
    """A clock for tests: time only moves when you call advance()."""

    def __init__(self, start: float = 0.0):
        self.now = start

    def __call__(self) -> float:
        return self.now

    def advance(self, seconds: float) -> None:
        self.now += seconds


class TTLCache:
    """A cache whose entries expire `ttl` seconds after they're set."""

    def __init__(self, ttl: float, clock: Callable[[], float] = time.monotonic):
        if ttl <= 0:
            raise ValueError("ttl must be positive")
        self.ttl = ttl
        self.clock = clock
        self._data = OrderedDict()            # key -> (expires_at, value), soonest first

    def _expire(self) -> None:
        """Drop expired entries: with one ttl for all, they're always at the front."""
        now = self.clock()
        while self._data:
            expires_at, _ = next(iter(self._data.values()))
            if expires_at > now:
                break
            self._data.popitem(last=False)

    def __setitem__(self, key, value):
        self._data[key] = (self.clock() + self.ttl, value)
        self._data.move_to_end(key)           # a reset key now expires last

    def get(self, key, default=None):
        self._expire()
        if key in self._data:
            return self._data[key][1]
        return default

    def __contains__(self, key):
        self._expire()
        return key in self._data

    def __len__(self):
        self._expire()
        return len(self._data)


# --- Step 4: a token bucket ---------------------------------------------------


class TokenBucket:
    """Allows bursts of up to `capacity` calls, refilling at `rate` tokens per second."""

    def __init__(self, rate: float, capacity: int, clock: Callable[[], float] = time.monotonic):
        if rate <= 0 or capacity < 1:
            raise ValueError("rate must be positive and capacity at least 1")
        self.rate = rate
        self.capacity = capacity
        self.clock = clock
        self.tokens = capacity                # start full
        self.updated = clock()

    def _refill(self) -> None:
        now = self.clock()
        self.tokens = min(self.capacity, self.tokens + (now - self.updated) * self.rate)
        self.updated = now

    def try_acquire(self, tokens: int = 1) -> bool:
        if tokens > self.capacity:
            raise ValueError(f"the bucket only holds {self.capacity} tokens")
        self._refill()
        if self.tokens < tokens:
            return False
        self.tokens -= tokens
        return True

    def retry_after(self, tokens: int = 1) -> float:
        """Seconds until `tokens` tokens are available: 0.0 if they already are."""
        self._refill()
        return max(0.0, (tokens - self.tokens) / self.rate)


# --- Step 5: a sliding window -------------------------------------------------


class SlidingWindowLimiter:
    """Allows at most `limit` calls in any `window` seconds."""

    def __init__(self, limit: int, window: float, clock: Callable[[], float] = time.monotonic):
        if limit < 1 or window <= 0:
            raise ValueError("limit must be at least 1 and window positive")
        self.limit = limit
        self.window = window
        self.clock = clock
        self.calls: deque[float] = deque()    # when the counted calls happened, oldest first

    def _forget_old(self, now: float) -> None:
        while self.calls and self.calls[0] + self.window <= now:
            self.calls.popleft()

    def try_acquire(self) -> bool:
        now = self.clock()
        self._forget_old(now)
        if len(self.calls) >= self.limit:
            return False
        self.calls.append(now)
        return True

    def retry_after(self) -> float:
        """Seconds until a call would be allowed: 0.0 if one would be now."""
        now = self.clock()
        self._forget_old(now)
        if len(self.calls) < self.limit:
            return 0.0
        return self.calls[0] + self.window - now


# --- Step 6: the client -------------------------------------------------------


class RateLimitError(Exception):
    """Raised instead of calling the backend when the limiter says no."""

    def __init__(self, path: str, retry_after: float):
        super().__init__(f"rate limited: retry {path} in {retry_after:.2f}s")
        self.path = path
        self.retry_after = retry_after


class RateLimiter(Protocol):
    """What CachedClient needs from a limiter. TokenBucket and SlidingWindowLimiter both fit."""

    def try_acquire(self) -> bool: ...

    def retry_after(self) -> float: ...


@dataclass
class ClientStats:
    hits: int = 0
    misses: int = 0
    limited: int = 0


class CachedClient:
    """Answers from the cache when it can, and calls `fetch` only when the limiter allows."""

    def __init__(self, fetch: Callable[..., object], *, cache, limiter: RateLimiter):
        self.fetch = fetch
        self.cache = cache
        self.limiter = limiter
        self.stats = ClientStats()

    def get(self, path: str, **params):
        key = make_key((path,), params)
        value = self.cache.get(key, _MISSING)
        if value is not _MISSING:
            self.stats.hits += 1
            return value
        if not self.limiter.try_acquire():
            self.stats.limited += 1
            raise RateLimitError(path, self.limiter.retry_after())
        self.stats.misses += 1
        value = self.cache[key] = self.fetch(path, **params)
        return value
```

```python tests
def make_client(make_limiter=None, ttl=30):
    """A client over a fake API that records its calls, all on one FakeClock."""
    clock, calls = FakeClock(), []

    def fetch(path, **params):
        calls.append((path, params))
        return {"path": path, **params}

    limiter = make_limiter(clock) if make_limiter else TokenBucket(rate=1, capacity=2, clock=clock)
    client = CachedClient(fetch, cache=TTLCache(ttl=ttl, clock=clock), limiter=limiter)
    return client, clock, calls

@test("a miss calls the backend once, then the cache answers")
def _():
    client, clock, calls = make_client()
    eq(client.get("/users/1"), {"path": "/users/1"})
    eq(client.get("/users/1"), {"path": "/users/1"})
    eq(calls, [("/users/1", {})])

@test("parameters are part of the key, in any order")
def _():
    client, clock, calls = make_client()
    eq(client.get("/search", q="tea", page=2), {"path": "/search", "q": "tea", "page": 2})
    client.get("/search", page=2, q="tea")
    client.get("/search", q="tea", page=3)
    eq(calls, [("/search", {"q": "tea", "page": 2}), ("/search", {"q": "tea", "page": 3})])

@test("cache hits don't spend tokens")
def _():
    client, clock, calls = make_client()        # a bucket of 2 tokens
    client.get("/a")
    for _ in range(10):
        client.get("/a")
    client.get("/b")
    eq(len(calls), 2, "two misses fit in a bucket of 2, however many hits come between")

@test("when the limiter refuses, raises RateLimitError and skips the backend")
def _():
    client, clock, calls = make_client()
    client.get("/a")
    client.get("/b")
    with raises(RateLimitError) as ctx:
        client.get("/c")
    eq(ctx.exception.path, "/c")
    approx(ctx.exception.retry_after, 1.0)
    eq(len(calls), 2, "a refused request mustn't reach the backend")

@test("tokens come back with time")
def _():
    client, clock, calls = make_client()
    client.get("/a")
    client.get("/b")
    clock.advance(1)
    eq(client.get("/c"), {"path": "/c"})

@test("expired entries are fetched again")
def _():
    client, clock, calls = make_client(ttl=30)
    client.get("/a")
    clock.advance(29)
    client.get("/a")
    clock.advance(1)
    client.get("/a")
    eq(len(calls), 2, "fresh at t=29, expired at t=30")

@test("takes any limiter with try_acquire() and retry_after()")
def _():
    client, clock, calls = make_client(lambda clock: SlidingWindowLimiter(limit=1, window=10, clock=clock))
    client.get("/a")
    with raises(RateLimitError) as ctx:
        client.get("/b")
    approx(ctx.exception.retry_after, 10.0)
    clock.advance(10)
    client.get("/b")
    eq(len(calls), 2)

@test("takes any cache with get() and item assignment")
def _():
    clock, calls = FakeClock(), []

    def fetch(path, **params):
        calls.append(path)
        return path.upper()

    client = CachedClient(fetch, cache=LRUCache(maxsize=1), limiter=TokenBucket(rate=1, capacity=9, clock=clock))
    for path in ["/a", "/a", "/b", "/a"]:
        client.get(path)
    eq(calls, ["/a", "/b", "/a"], "with maxsize=1, fetching /b evicts /a")

@test("falsy results are cached too")
def _():
    clock, calls = FakeClock(), []

    def fetch(path, **params):
        calls.append(path)
        return []

    client = CachedClient(fetch, cache=TTLCache(ttl=30, clock=clock), limiter=TokenBucket(rate=1, capacity=9, clock=clock))
    client.get("/empty")
    client.get("/empty")
    eq(len(calls), 1, "an empty list is still an answer")

@test("backend errors propagate, and nothing is cached")
def _():
    clock, calls = FakeClock(), []

    def flaky(path, **params):
        calls.append(path)
        if len(calls) == 1:
            raise ConnectionError("connection reset")
        return "ok"

    client = CachedClient(flaky, cache=TTLCache(ttl=30, clock=clock), limiter=TokenBucket(rate=1, capacity=9, clock=clock))
    raises(ConnectionError, client.get, "/a")
    eq(client.get("/a"), "ok")
    eq(len(calls), 2)

@test("stats count hits, misses and refusals")
def _():
    client, clock, calls = make_client()
    client.get("/a")
    client.get("/a")
    client.get("/b")
    with raises(RateLimitError):
        client.get("/c")
    eq(client.stats, ClientStats(hits=1, misses=2, limited=1))

@test("the whole stack, end to end")
def _():
    client, clock, calls = make_client()
    outcomes = []
    for advance, path in [(0, "/users/1"), (0, "/users/1"), (0, "/users/2"), (0, "/users/3"),
                          (1, "/users/3"), (30, "/users/1")]:
        clock.advance(advance)
        before = len(calls)
        try:
            client.get(path)
            outcomes.append("fetched" if len(calls) > before else "cached")
        except RateLimitError:
            outcomes.append("limited")
    eq(outcomes, ["fetched", "cached", "fetched", "limited", "fetched", "fetched"])
    eq(client.stats, ClientStats(hits=1, misses=4, limited=1))
```

```hint
`value = self.cache.get(key, _MISSING)`, then `if value is not _MISSING:` it's a hit. The sentinel from step 2 keeps falsy results cacheable.
```

```hint
On a miss, `if not self.limiter.try_acquire():` bump `self.stats.limited` and `raise RateLimitError(path, self.limiter.retry_after())`.
```

```hint
Otherwise, `value = self.cache[key] = self.fetch(path, **params)` stores the result and keeps it in one line. Python evaluates the right-hand side once, then assigns it to each target from left to right.
```
:::

## Where to take it next

- **Waiting instead of refusing.** An `async def acquire()` that awaits `asyncio.sleep(self.retry_after())` until a token is free turns a refusal into a wait. Inject the sleep as well as the clock, and a fake `sleep` that advances a `FakeClock` keeps the tests instant.
- **Per-user limits.** One bucket per API key, kept in a `defaultdict`, or in an `LRUCache` of buckets so that idle users don't pile up in memory.
- **Stale-while-revalidate.** When the limiter refuses, serve the expired value instead of raising, and refresh it once tokens come back.
- **Thundering herds.** When a popular entry expires, every caller misses at once. In async code, keep one in-flight `Task` per key and let every caller await the same one.
- **Sharing limits across processes.** Each process has its own memory, so once several workers must share one limit, the counters move to Redis or similar.

## Cheat sheet

| JavaScript | Python | Notes |
| --- | --- | --- |
| `map.delete(k); map.set(k, v)` | `od.move_to_end(k)` | O(1); `last=False` moves it to the front |
| `map.delete(map.keys().next().value)` | `od.popitem(last=False)` | removes the oldest item |
| `get`/`set`/`has`/`size` methods | `__getitem__`, `__setitem__`, `__contains__`, `__len__` | so `cache[k]`, `k in cache` and `len(cache)` work |
| `[Symbol.iterator]()` | `__iter__` | without it, iteration falls back to `cache[0]`, `cache[1]`, ... |
| `JSON.stringify(args)` as a key | `(args, tuple(sorted(kwargs.items())))` | tuples of hashables are hashable |
| `Symbol("missing")` | `_MISSING = object()` | compare with `is` |
| `fn.cacheInfo = () => ...` | `wrapper.cache_info = cache_info` | functions take attributes |
| `{ hits, misses }` | `CacheInfo(NamedTuple)` | named fields, still a tuple |
| reassigning a closure's `let` | `nonlocal hits` | needed to rebind an enclosing variable |
| `jest.useFakeTimers()` | a `clock=time.monotonic` parameter | tests pass a `FakeClock` |
| `performance.now()` | `time.monotonic()` | float seconds, never goes backwards |
| `Date.now()` | `time.time()` | wall clock: can jump |
| `arr.shift()` | `deque.popleft()` | O(1) instead of O(n) |
| `interface RateLimiter` | `class RateLimiter(Protocol)` | structural; checked by mypy and pyright |
