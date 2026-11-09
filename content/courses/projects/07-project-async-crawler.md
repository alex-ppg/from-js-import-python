---
title: Build an Async Web Crawler
part: Systems
summary: A polite, retrying crawler built from asyncio queues, semaphores and timeouts, tested on a fake web.
minutes: 80
---

A web crawler is the textbook asyncio program. It spends nearly all of its time waiting on the network, and the interesting decisions are about coordination: what to fetch next, how many requests to run at once, and what to do when a server is slow or flaky. In Node you'd assemble that from `fetch`, `p-limit` and a hand-rolled queue. Python's standard library has every part: `asyncio.Queue` and worker tasks, `Semaphore` and `asyncio.timeout`, plus `html.parser` and `urllib.parse` for the HTML and URL work.

The sandbox has no network, and tests shouldn't depend on one anyway, so you'll crawl a fake web: a dict of pages with failures you can program. It answers instantly, it fails exactly when you tell it to, and the same crawl gives the same result every time.

## What you'll build

By the end you'll have `crawl_site()`. It crawls breadth-first from a start URL down to a depth limit, keeps several fetches in flight without ever sending more than two at a time to one host, retries pages that fail, gives up on pages that hang, and reports what it found. Here it is on a small tea shop whose About page fails twice before answering, whose blog feed never answers at all, and which links to a page that doesn't exist. The demo is at the top of the code; everything under it is what you'll write. Press **Run**.

```python run
import asyncio
from collections import Counter, defaultdict
from collections.abc import Awaitable, Callable
from dataclasses import dataclass, field
from html.parser import HTMLParser
from urllib.parse import urldefrag, urljoin, urlsplit


SITE = {
    "https://shop.test/": """
        <h1>Tea Shop</h1>
        <a href="/products">Products</a> <a href="/about">About us</a>
        <a href="https://blog.test/">Blog</a>""",
    "https://shop.test/products": """
        <a href="/products/kettle">Kettle</a> <a href="/products/teapot">Teapot</a>""",
    "https://shop.test/products/kettle": '<a href="/products">All products</a>',
    "https://shop.test/products/teapot": '<a href="/products/teacups">Matching cups</a>',
    "https://shop.test/about": '<a href="mailto:hello@shop.test">Email us</a>',
    "https://blog.test/": '<a href="/posts/green-tea">Green tea</a> <a href="/feed">Feed</a>',
    "https://blog.test/posts/green-tea": '<a href="https://shop.test/products/teapot#buy">Buy</a>',
    "https://blog.test/feed": "<rss>...</rss>",
}


async def main():
    web = FakeWeb(SITE, flaky={"https://shop.test/about": 2}, slow={"https://blog.test/feed"})
    result = await crawl_site("https://shop.test/", web.fetch, max_depth=3, timeout=0.05)
    print(result.summary())
    retries = len(web.requests) - len(set(web.requests))
    print(f"{len(web.requests)} requests, {retries} of them retries")


# Everything below is what you'll build, one step at a time.


# --- Step 1: a fake web -------------------------------------------------------


class PageNotFoundError(LookupError):
    """The fake web's 404."""

    def __init__(self, url: str):
        super().__init__(f"404 Not Found: {url}")
        self.url = url


@dataclass
class FakeWeb:
    """An in-memory web for tests: `pages` maps each URL to its HTML."""

    pages: dict[str, str]
    flaky: dict[str, int] = field(default_factory=dict)  # URL -> requests that fail first
    slow: set[str] = field(default_factory=set)          # URLs that never answer
    requests: list[str] = field(default_factory=list)    # every URL requested, in order

    async def fetch(self, url: str) -> str:
        self.requests.append(url)
        attempt = self.requests.count(url)   # read it now: other tasks run during an await
        if url in self.slow:
            await asyncio.sleep(3600)        # hang until a timeout cancels us
        await asyncio.sleep(0)               # "network latency": let other tasks run
        if attempt <= self.flaky.get(url, 0):
            raise ConnectionError(f"connection reset: {url}")
        try:
            return self.pages[url]
        except KeyError:
            raise PageNotFoundError(url) from None


# --- Step 2: extracting links -------------------------------------------------


class LinkParser(HTMLParser):
    """Collects the href of every <a> tag it sees."""

    def __init__(self):
        super().__init__()
        self.hrefs: list[str] = []

    def handle_starttag(self, tag, attrs):
        href = dict(attrs).get("href")
        if tag == "a" and href:
            self.hrefs.append(href)


def extract_links(html: str, base_url: str) -> list[str]:
    """Absolute http(s) URLs that `html` links to, in page order, without duplicates."""
    parser = LinkParser()
    parser.feed(html)
    parser.close()
    urls = (urldefrag(urljoin(base_url, href)).url for href in parser.hrefs)
    return list(dict.fromkeys(url for url in urls if urlsplit(url).scheme in ("http", "https")))


# --- Step 3: the crawl loop ---------------------------------------------------


type Fetch = Callable[[str], Awaitable[str]]   # any async function from a URL to its HTML


def plural(count: int, noun: str) -> str:
    return f"{count} {noun}" if count == 1 else f"{count} {noun}s"


@dataclass
class CrawlResult:
    depths: dict[str, int] = field(default_factory=dict)        # URL -> depth, pages fetched
    errors: dict[str, Exception] = field(default_factory=dict)  # URL -> why its fetch failed

    def summary(self) -> str:
        lines = [f"crawled {plural(len(self.depths), 'page')}, {plural(len(self.errors), 'error')}"]
        for depth, count in sorted(Counter(self.depths.values()).items()):
            lines.append(f"  depth {depth}: {plural(count, 'page')}")
        for url, error in sorted(self.errors.items()):
            lines.append(f"  {type(error).__name__}: {url}")
        return "\n".join(lines)


async def crawl(start: str, fetch: Fetch, *, max_depth: int = 2, workers: int = 4) -> CrawlResult:
    """Breadth-first crawl from `start`, following links up to `max_depth` clicks away."""
    if workers < 1:
        raise ValueError("crawl() needs at least one worker")
    result = CrawlResult()
    seen = {start}
    queue = asyncio.Queue()
    queue.put_nowait((start, 0))

    async def worker():
        while True:
            try:
                url, depth = await queue.get()
            except asyncio.QueueShutDown:
                return
            try:
                html = await fetch(url)
            except Exception as error:
                result.errors[url] = error
            else:
                result.depths[url] = depth
                if depth < max_depth:
                    for link in extract_links(html, url):
                        if link not in seen:
                            seen.add(link)
                            queue.put_nowait((link, depth + 1))
            finally:
                queue.task_done()

    async with asyncio.TaskGroup() as tg:
        for _ in range(workers):
            tg.create_task(worker())
        await queue.join()        # every queued URL has been processed...
        queue.shutdown()          # ...so wake the idle workers and let them return
    return result


# --- Step 4: politeness -------------------------------------------------------


class PoliteFetcher:
    """Wraps a fetch function: at most `per_host` requests in flight to any one host."""

    def __init__(self, fetch: Fetch, per_host: int = 2):
        if per_host < 1:
            raise ValueError("per_host must be at least 1")
        self.fetch = fetch
        self.slots = defaultdict(lambda: asyncio.Semaphore(per_host))

    async def __call__(self, url: str) -> str:
        async with self.slots[urlsplit(url).netloc]:
            return await self.fetch(url)


# --- Step 5: retries and timeouts ---------------------------------------------


TRANSIENT_ERRORS = (ConnectionError, TimeoutError)


def with_retries(fetch: Fetch, *, attempts: int = 3, timeout: float = 1.0) -> Fetch:
    """Wraps a fetch function: each attempt gets `timeout` seconds; transient errors retry."""
    if attempts < 1:
        raise ValueError("attempts must be at least 1")

    async def fetch_with_retries(url: str) -> str:
        for attempt in range(1, attempts + 1):
            try:
                async with asyncio.timeout(timeout):
                    return await fetch(url)
            except TRANSIENT_ERRORS:
                if attempt == attempts:
                    raise

    return fetch_with_retries


# --- Step 6: the whole crawler ------------------------------------------------


async def crawl_site(
    start: str,
    fetch: Fetch,
    *,
    max_depth: int = 2,
    workers: int = 4,
    per_host: int = 2,
    attempts: int = 3,
    timeout: float = 1.0,
) -> CrawlResult:
    """The whole stack: retries and timeouts inside a per-host politeness limit."""
    patient = with_retries(fetch, attempts=attempts, timeout=timeout)
    polite = PoliteFetcher(patient, per_host=per_host)
    return await crawl(start, polite, max_depth=max_depth, workers=workers)


asyncio.run(main())
```

```output
crawled 7 pages, 2 errors
  depth 0: 1 page
  depth 1: 3 pages
  depth 2: 3 pages
  TimeoutError: https://blog.test/feed
  PageNotFoundError: https://shop.test/products/teacups
13 requests, 4 of them retries
```

Nine URLs took thirteen requests. The About page answered on its third attempt. The feed used up all three of its attempts, timing out after 0.05 seconds each. The broken teacups link was tried exactly once, because a 404 won't fix itself.

## How the pieces fit

Every piece speaks one interface, the **fetch function**: an async function that takes a URL and returns its HTML. `FakeWeb.fetch` is one. `with_retries()` and `PoliteFetcher` each wrap a fetch function and hand back another one with an extra behaviour, the way you'd wrap `fetch` in middleware in JavaScript. `crawl()` only ever calls `await fetch(url)`, so it neither knows nor cares how many layers sit underneath.

```text
crawl_site(start, web.fetch)                                 step 6
├── crawl(start, fetch)        queue, workers, dedupe        step 3
│   └── extract_links(html)    html.parser, urljoin          step 2
└── fetch = PoliteFetcher(     a Semaphore per host          step 4
        with_retries(          timeouts and retries          step 5
            web.fetch))        the fake web                  step 1
```

| Step | You build | The Python it exercises |
| --- | --- | --- |
| 1 | `FakeWeb`, the test double | `@dataclass` with `default_factory`, custom exceptions, `asyncio.sleep(0)` |
| 2 | `extract_links()` | `html.parser.HTMLParser`, `urllib.parse`, order-preserving dedupe |
| 3 | `crawl()` | `asyncio.Queue`, worker tasks in a `TaskGroup`, `join()` and `shutdown()` |
| 4 | `PoliteFetcher` | `asyncio.Semaphore`, `defaultdict`, callable objects |
| 5 | `with_retries()` | `asyncio.timeout`, closures, exception tuples, bare `raise` |
| 6 | `summary()` and `crawl_site()` | `Counter`, stacking wrappers in the right order |

Each step's starter holds the finished code of every earlier step, so you can start anywhere, and its tests target only the new piece. Step 6 runs the whole stack. Have [Async/Await & asyncio](lesson:async) fresh in your mind: this project leans on tasks, `TaskGroup`, timeouts and cancellation throughout.

## Step 1: A fake web

The crawler's only contact with the outside world is `await fetch(url)`, so a fake only has to get that one call right, failures included. `FakeWeb` is a dataclass holding a dict of pages plus three knobs:

- `flaky` maps a URL to the number of requests that fail with `ConnectionError` before it starts answering.
- `slow` is a set of URLs that never answer, so only a timeout gets you out.
- `requests` logs every URL requested, in order, for the tests to inspect.

All three are mutable, so each one needs `field(default_factory=...)`. A plain `= {}` default would be a single dict shared by every instance, and dataclasses refuse it with a `ValueError` ([Dataclasses](lesson:dataclasses-and-enums#defaults-and-field)).

For latency, `fetch` awaits `asyncio.sleep(0)`. A zero-second sleep starts no timer: it suspends the coroutine for one trip around the event loop, so every other ready task gets a turn first. That's all a fake needs to exercise real concurrency. It costs nothing, so a test can make a thousand requests in milliseconds, in the same order every time.

:::compare Simulated latency
```js
async function fakeRequest(name, log) {
  log.push(`${name} sent`);
  await new Promise((resolve) => setTimeout(resolve, 0));
  log.push(`${name} answered`);
}

const log = [];
await Promise.all([fakeRequest("a", log), fakeRequest("b", log)]);
console.log(log);
```
```python run
import asyncio

async def fake_request(name, log):
    log.append(f"{name} sent")
    await asyncio.sleep(0)
    log.append(f"{name} answered")

async def main():
    log = []
    await asyncio.gather(fake_request("a", log), fake_request("b", log))
    print(log)

asyncio.run(main())
```
:::

A server that never answers is just a very long sleep: `await asyncio.sleep(3600)`. Nothing in a test will wait an hour, because a timeout cancels the sleep the moment it fires, exactly as it would cancel a real request ([Cancellation](lesson:async#cancellation-an-abortcontroller-in-every-task)).

:::tip Count requests, don't decrement the config
A dataclass keeps the dict you pass in, not a copy, so `self.flaky[url] -= 1` would quietly edit the caller's configuration. Work out the attempt number from the `requests` log instead, and read it before the first `await`: while `fetch` sleeps, other tasks can request the same URL and move the count.
:::

To turn the dict's `KeyError` into your own error, raise inside the `except` with `from None`. That hides the `KeyError` from the traceback, which would otherwise print "During handling of the above exception, another exception occurred" ([Re-raising and chaining](lesson:exceptions#re-raising-and-chaining)).

:::challenge id=crawler-step-1 title="Step 1: A fake web" difficulty=easy
Write the fake web.

- `PageNotFoundError(url)` subclasses `LookupError`, keeps the URL in `.url`, and has the message `404 Not Found: <url>`.
- `FakeWeb` is a dataclass with `pages` (URL → HTML) and three optional fields that start empty for every instance: `flaky` (a dict of URL → number of failing requests), `slow` (a set of URLs) and `requests` (a list).
- `async def fetch(self, url)` appends `url` to `requests` first, whatever happens next. Then:
  - a slow URL awaits `asyncio.sleep(3600)`, which only a timeout will interrupt;
  - every URL awaits `asyncio.sleep(0)` once: that's the simulated latency;
  - a flaky URL raises `ConnectionError` for its first `flaky[url]` requests;
  - an unknown URL raises `PageNotFoundError`;
  - anything else returns the page's HTML.

Don't modify the `flaky` dict: it belongs to the caller.

```js
class PageNotFoundError extends Error {
  constructor(url) {
    super(`404 Not Found: ${url}`);
    this.url = url;
  }
}

class FakeWeb {
  constructor(pages, { flaky = {}, slow = new Set() } = {}) {
    Object.assign(this, { pages, flaky, slow, requests: [] });
  }

  async fetch(url) {
    this.requests.push(url);
    const attempt = this.requests.filter((u) => u === url).length;
    if (this.slow.has(url)) await new Promise((resolve) => setTimeout(resolve, 3_600_000));
    await new Promise((resolve) => setTimeout(resolve, 0));
    if (attempt <= (this.flaky[url] ?? 0)) throw new Error(`connection reset: ${url}`);
    if (!(url in this.pages)) throw new PageNotFoundError(url);
    return this.pages[url];
  }
}
```

```python starter
import asyncio
from dataclasses import dataclass, field


# --- Step 1: a fake web -------------------------------------------------------


class PageNotFoundError(LookupError):
    """The fake web's 404: remembers which URL was missing."""


@dataclass
class FakeWeb:
    """An in-memory web for tests: `pages` maps each URL to its HTML."""

    pages: dict[str, str]
    # TODO: add flaky, slow and requests

    async def fetch(self, url: str) -> str:
        ...
```

```python solution
import asyncio
from dataclasses import dataclass, field


# --- Step 1: a fake web -------------------------------------------------------


class PageNotFoundError(LookupError):
    """The fake web's 404."""

    def __init__(self, url: str):
        super().__init__(f"404 Not Found: {url}")
        self.url = url


@dataclass
class FakeWeb:
    """An in-memory web for tests: `pages` maps each URL to its HTML."""

    pages: dict[str, str]
    flaky: dict[str, int] = field(default_factory=dict)  # URL -> requests that fail first
    slow: set[str] = field(default_factory=set)          # URLs that never answer
    requests: list[str] = field(default_factory=list)    # every URL requested, in order

    async def fetch(self, url: str) -> str:
        self.requests.append(url)
        attempt = self.requests.count(url)   # read it now: other tasks run during an await
        if url in self.slow:
            await asyncio.sleep(3600)        # hang until a timeout cancels us
        await asyncio.sleep(0)               # "network latency": let other tasks run
        if attempt <= self.flaky.get(url, 0):
            raise ConnectionError(f"connection reset: {url}")
        try:
            return self.pages[url]
        except KeyError:
            raise PageNotFoundError(url) from None
```

```python tests
import asyncio

PAGES = {"https://shop.test/": "<h1>Home</h1>", "https://shop.test/about": "<p>About</p>"}

async def finish(coro, seconds=0.5):
    """Await coro, but fail the test instead of hanging if it never finishes."""
    try:
        async with asyncio.timeout(seconds) as guard:
            return await coro
    except TimeoutError:
        if guard.expired():
            check(False, f"still running after {seconds}s: is something waiting forever?")
        raise

@test("fetch returns the page's HTML")
async def _():
    web = FakeWeb(PAGES)
    eq(await finish(web.fetch("https://shop.test/about")), "<p>About</p>")

@test("fetch lets other tasks run before it answers")
async def _():
    web = FakeWeb(PAGES)
    log = []

    async def other():
        log.append("other task ran")

    task = asyncio.create_task(other())
    await finish(web.fetch("https://shop.test/"))
    eq(log, ["other task ran"], "fetch should await asyncio.sleep(0) before it returns")
    await task

@test("an unknown URL raises PageNotFoundError, a LookupError")
async def _():
    web = FakeWeb(PAGES)
    with raises(PageNotFoundError) as ctx:
        await finish(web.fetch("https://shop.test/missing"))
    check(isinstance(ctx.exception, LookupError), "PageNotFoundError should subclass LookupError")
    eq(ctx.exception.url, "https://shop.test/missing")
    eq(str(ctx.exception), "404 Not Found: https://shop.test/missing")

@test("requests records every URL asked for, in order")
async def _():
    web = FakeWeb(PAGES)
    await finish(web.fetch("https://shop.test/"))
    with raises(PageNotFoundError):
        await finish(web.fetch("https://shop.test/missing"))
    await finish(web.fetch("https://shop.test/"))
    eq(web.requests, ["https://shop.test/", "https://shop.test/missing", "https://shop.test/"])

@test("a flaky URL raises ConnectionError for its first N requests")
async def _():
    url = "https://shop.test/about"
    web = FakeWeb(PAGES, flaky={url: 2})
    for _ in range(2):
        with raises(ConnectionError):
            await finish(web.fetch(url))
    eq(await finish(web.fetch(url)), "<p>About</p>")
    eq(await finish(web.fetch(url)), "<p>About</p>")

@test("the flaky dict you pass in isn't modified")
async def _():
    url = "https://shop.test/about"
    flaky = {url: 1}
    web = FakeWeb(PAGES, flaky=flaky)
    with raises(ConnectionError):
        await finish(web.fetch(url))
    eq(flaky, {url: 1}, "FakeWeb holds the caller's dict: count earlier requests instead")

@test("a slow URL never answers")
async def _():
    url = "https://shop.test/"
    web = FakeWeb(PAGES, slow={url})
    with raises(TimeoutError):
        async with asyncio.timeout(0.01):
            await web.fetch(url)
    eq(web.requests, [url], "the request still counts")

@test("each FakeWeb starts with its own empty flaky, slow and requests")
def _():
    first, second = FakeWeb(PAGES), FakeWeb(PAGES)
    eq((first.flaky, first.slow, first.requests), ({}, set(), []))
    first.requests.append("https://shop.test/")
    eq(second.requests, [], "two FakeWebs share one list: use field(default_factory=list)")
```

```hint
`flaky: dict[str, int] = field(default_factory=dict)` gives every instance its own dict. Do the same with `set` and `list` for `slow` and `requests`.
```

```hint
Right after appending, `attempt = self.requests.count(url)` is 1 for the first request to that URL. The request fails while `attempt <= self.flaky.get(url, 0)`.
```

```hint
`try: return self.pages[url]` and then `except KeyError: raise PageNotFoundError(url) from None`. For the exception itself, pass the message to `super().__init__()` and store `self.url = url`.
```
:::

## Step 2: Extracting links

Each fetched page has to become the list of URLs to visit next. That's two jobs: finding the `href` of every `<a>` tag, and turning each one into an absolute URL that the crawler can fetch and compare.

### Parsing HTML without a DOM

The standard library has no `DOMParser` and no `querySelectorAll`. What it has is `html.parser.HTMLParser`, an event-driven tokenizer that's closer to a SAX parser than to the DOM: you subclass it, override the `handle_*` methods for the events you care about, and `feed()` it text. Links only need `handle_starttag(tag, attrs)`. Tag and attribute names arrive lowercased, and `attrs` is a list of `(name, value)` pairs with the quotes stripped and entities such as `&amp;` decoded. An attribute without a value comes through as `None`.

```python run
from html.parser import HTMLParser

class TagPrinter(HTMLParser):
    def handle_starttag(self, tag, attrs):
        print(tag, attrs)

TagPrinter().feed("<P>Try our <A HREF='/teas?sort=new&amp;page=2' class=nav>teas</A> <input disabled></P>")
```

For serious scraping, the third-party BeautifulSoup is Python's cheerio, with a tree to walk and CSS selectors. Pulling links out of a page doesn't need it.

:::gotcha A regex is not an HTML parser
Without a DOM at hand, it's tempting to grab links with `re.findall(r'<a href="([^"]*)"', html)`. That regex misses `<A HREF='/teas'>`, misses an `href` that isn't the first attribute, and leaves `&amp;` encoded in query strings. `HTMLParser` handles all three for free.
:::

:::quiz output
What does this print?

```python
from html.parser import HTMLParser

class Links(HTMLParser):
    def handle_starttag(self, tag, attrs):
        print(tag, dict(attrs).get("href"))

Links().feed('<A HREF="/teas?type=green&amp;page=2">Teas</A>')
```

- [ ] `A /teas?type=green&amp;page=2`
- [ ] `a /teas?type=green&amp;page=2`
- [x] `a /teas?type=green&page=2`
- [ ] `a None`

The parser lowercases tag and attribute names, so `dict(attrs)` has an `"href"` key, and it decodes entities in attribute values, so `&amp;` arrives as `&`. Both are things a regex would leave for you to handle.
:::

### Resolving URLs

:::compare
```js
const page = "https://shop.test/products/kettle";

new URL("/about", page).href;     // "https://shop.test/about"
new URL("reviews", page).href;    // "https://shop.test/products/reviews"
new URL("#specs", page).href;     // ".../products/kettle#specs"

const url = new URL("https://shop.test/about#team");
url.hash = "";
url.href;                         // "https://shop.test/about"
url.protocol;                     // "https:"
url.host;                         // "shop.test"
```
```python
page = "https://shop.test/products/kettle"

urljoin(page, "/about")           # 'https://shop.test/about'
urljoin(page, "reviews")          # 'https://shop.test/products/reviews'
urljoin(page, "#specs")           # '.../products/kettle#specs'

url = "https://shop.test/about#team"

urldefrag(url).url                # 'https://shop.test/about'
urlsplit(url).scheme              # 'https'
urlsplit(url).netloc              # 'shop.test'
```
:::

`urllib.parse.urljoin(base, href)` resolves a link the way `new URL(href, base)` does, including the rule that surprises everyone: a relative path replaces the base's last segment, so `reviews` on the page `/products/kettle` means `/products/reviews`. Always resolve against the URL of the page the link came from. `urldefrag()` splits off the `#fragment`, and `urlsplit()` gives the parsed parts: `.scheme` has no trailing colon, unlike `url.protocol`, and `.netloc` is the host and port, like `url.host`.

```python run
from urllib.parse import urldefrag, urljoin, urlsplit

page = "https://shop.test/products/kettle"
for href in ["/about", "reviews", "../teapot", "?sort=price", "#specs", "//cdn.test/k.png", "mailto:hi@shop.test"]:
    print(f"{href:20} {urljoin(page, href)}")

print(urldefrag("https://shop.test/about#team").url)
print(urlsplit("https://shop.test:8443/cart?id=7").netloc)
```

:::gotcha `urljoin` resolves, it doesn't normalise
`new URL()` normalises as it parses: `new URL("HTTPS://Shop.TEST").href` is `"https://shop.test/"`, lowercased and with the root path added. `urljoin` only resolves. It lowercases the scheme and leaves everything else alone, so `urljoin(page, "HTTPS://Shop.TEST")` is `'https://Shop.TEST'`, a different dict key from `'https://shop.test/'`. A production crawler normalises URLs before deduplicating them. The fake web here spells every URL one way, so this project can skip that.
:::

Last comes the dedupe. JavaScript's `[...new Set(urls)]` keeps the original order, but a Python `set` doesn't, so the order-preserving version is `list(dict.fromkeys(urls))` ([Sets](lesson:sets#dedupe-keeping-order)).

:::challenge id=crawler-step-2 title="Step 2: Extracting links" difficulty=medium
Write `extract_links(html, base_url)`, returning the absolute URLs the page links to:

- only the `href` of `<a>` tags, skipping any `<a>` whose href is missing or empty;
- each one resolved against `base_url` with `urljoin`, minus its `#fragment`;
- only `http` and `https` URLs, so no `mailto:`, `javascript:` or `tel:`;
- no duplicates, in the order they first appear.

The starter has a `LinkParser(HTMLParser)` that collects hrefs into `self.hrefs`. Fill in its `handle_starttag`, then use it in `extract_links`. Call `parser.close()` after `parser.feed(html)` so it flushes anything still buffered.

```js
function extractLinks(html, baseUrl) {
  const doc = new DOMParser().parseFromString(html, "text/html");
  const urls = [];
  for (const a of doc.querySelectorAll("a[href]")) {
    if (!a.getAttribute("href")) continue;
    const url = new URL(a.getAttribute("href"), baseUrl);
    url.hash = "";
    if (url.protocol === "http:" || url.protocol === "https:") urls.push(url.href);
  }
  return [...new Set(urls)];
}
```

```python starter
import asyncio
from dataclasses import dataclass, field
from html.parser import HTMLParser
from urllib.parse import urldefrag, urljoin, urlsplit


# --- Step 1: a fake web -------------------------------------------------------


class PageNotFoundError(LookupError):
    """The fake web's 404."""

    def __init__(self, url: str):
        super().__init__(f"404 Not Found: {url}")
        self.url = url


@dataclass
class FakeWeb:
    """An in-memory web for tests: `pages` maps each URL to its HTML."""

    pages: dict[str, str]
    flaky: dict[str, int] = field(default_factory=dict)  # URL -> requests that fail first
    slow: set[str] = field(default_factory=set)          # URLs that never answer
    requests: list[str] = field(default_factory=list)    # every URL requested, in order

    async def fetch(self, url: str) -> str:
        self.requests.append(url)
        attempt = self.requests.count(url)   # read it now: other tasks run during an await
        if url in self.slow:
            await asyncio.sleep(3600)        # hang until a timeout cancels us
        await asyncio.sleep(0)               # "network latency": let other tasks run
        if attempt <= self.flaky.get(url, 0):
            raise ConnectionError(f"connection reset: {url}")
        try:
            return self.pages[url]
        except KeyError:
            raise PageNotFoundError(url) from None


# --- Step 2: extracting links -------------------------------------------------


class LinkParser(HTMLParser):
    """Collects the href of every <a> tag it sees."""

    def __init__(self):
        super().__init__()
        self.hrefs: list[str] = []

    def handle_starttag(self, tag, attrs):
        ...


def extract_links(html: str, base_url: str) -> list[str]:
    """Absolute http(s) URLs that `html` links to, in page order, without duplicates."""
    ...
```

```python solution
import asyncio
from dataclasses import dataclass, field
from html.parser import HTMLParser
from urllib.parse import urldefrag, urljoin, urlsplit


# --- Step 1: a fake web -------------------------------------------------------


class PageNotFoundError(LookupError):
    """The fake web's 404."""

    def __init__(self, url: str):
        super().__init__(f"404 Not Found: {url}")
        self.url = url


@dataclass
class FakeWeb:
    """An in-memory web for tests: `pages` maps each URL to its HTML."""

    pages: dict[str, str]
    flaky: dict[str, int] = field(default_factory=dict)  # URL -> requests that fail first
    slow: set[str] = field(default_factory=set)          # URLs that never answer
    requests: list[str] = field(default_factory=list)    # every URL requested, in order

    async def fetch(self, url: str) -> str:
        self.requests.append(url)
        attempt = self.requests.count(url)   # read it now: other tasks run during an await
        if url in self.slow:
            await asyncio.sleep(3600)        # hang until a timeout cancels us
        await asyncio.sleep(0)               # "network latency": let other tasks run
        if attempt <= self.flaky.get(url, 0):
            raise ConnectionError(f"connection reset: {url}")
        try:
            return self.pages[url]
        except KeyError:
            raise PageNotFoundError(url) from None


# --- Step 2: extracting links -------------------------------------------------


class LinkParser(HTMLParser):
    """Collects the href of every <a> tag it sees."""

    def __init__(self):
        super().__init__()
        self.hrefs: list[str] = []

    def handle_starttag(self, tag, attrs):
        href = dict(attrs).get("href")
        if tag == "a" and href:
            self.hrefs.append(href)


def extract_links(html: str, base_url: str) -> list[str]:
    """Absolute http(s) URLs that `html` links to, in page order, without duplicates."""
    parser = LinkParser()
    parser.feed(html)
    parser.close()
    urls = (urldefrag(urljoin(base_url, href)).url for href in parser.hrefs)
    return list(dict.fromkeys(url for url in urls if urlsplit(url).scheme in ("http", "https")))
```

```python tests
PAGE = "https://shop.test/products"

@test("resolves relative links against the page's URL")
def _():
    html = '<a href="/about">About</a> <a href="/products/kettle">Kettle</a> <a href="?page=2">Next</a>'
    eq(extract_links(html, PAGE), [
        "https://shop.test/about",
        "https://shop.test/products/kettle",
        "https://shop.test/products?page=2",
    ])

@test("keeps absolute links, including ones to other hosts")
def _():
    html = '<a href="https://blog.test/posts/1">Post</a> <a href="//cdn.test/logo.svg">Logo</a>'
    eq(extract_links(html, PAGE), ["https://blog.test/posts/1", "https://cdn.test/logo.svg"])

@test("drops #fragments, then duplicates, keeping first-seen order")
def _():
    html = '<a href="/b">B</a> <a href="/a#top">A</a> <a href="/b">B again</a> <a href="/a">A again</a>'
    eq(extract_links(html, PAGE), ["https://shop.test/b", "https://shop.test/a"])

@test("skips mailto:, javascript: and tel: links")
def _():
    html = (
        '<a href="mailto:hi@shop.test">Mail</a> <a href="javascript:void(0)">Menu</a> '
        '<a href="tel:+15550100">Call</a> <a href="/contact">Contact</a>'
    )
    eq(extract_links(html, PAGE), ["https://shop.test/contact"])

@test("only <a> tags with a non-empty href count")
def _():
    html = (
        '<link href="/style.css"> <img src="/cat.png"> <a name="top">Anchor</a> '
        '<a href="">Empty</a> <a class="nav" href="/cart">Cart</a>'
    )
    eq(extract_links(html, PAGE), ["https://shop.test/cart"])

@test("copes with real-world HTML: uppercase, any quoting, entities")
def _():
    html = "<A HREF='/Teas'>Teas</A> <a href=/sale>Sale</a> <a href=\"/search?q=green&amp;page=2\">Find</a>"
    eq(extract_links(html, PAGE), [
        "https://shop.test/Teas",
        "https://shop.test/sale",
        "https://shop.test/search?q=green&page=2",
    ])

@test("a page without links gives an empty list")
def _():
    eq(extract_links("<p>Nothing to see here</p>", PAGE), [])
    eq(extract_links("", PAGE), [])
```

```hint
In `handle_starttag`, `dict(attrs).get("href")` turns the attribute pairs into a dict and gives `None` when there's no href. Check `tag == "a"` as well: `<link href>` isn't a link to crawl.
```

```hint
`urldefrag(urljoin(base_url, href)).url` resolves a link and drops its fragment. `urlsplit(url).scheme in ("http", "https")` filters out the rest.
```

```hint
`list(dict.fromkeys(urls))` removes duplicates and keeps first-seen order. A generator expression can feed it directly.
```
:::

## Step 3: The crawl loop

A crawl is a breadth-first search where visiting a node costs a network round trip, so you want several visits in flight at once. The standard asyncio shape for that is a **worker pool**: the frontier lives in an `asyncio.Queue` of `(url, depth)` pairs, and a fixed number of worker tasks loop forever, each one taking a pair, fetching the page and putting newly found links back on the same queue.

| Job | JavaScript | Python |
| --- | --- | --- |
| A frontier that workers can wait on | an array plus promise resolvers you manage | `asyncio.Queue`: `await queue.get()` sleeps until an item arrives |
| Knowing when the crawl is finished | an in-flight counter you maintain | `queue.task_done()` for each item, then `await queue.join()` |
| Telling idle workers to stop | a flag, or one poison pill per worker | `queue.shutdown()` (3.13+): blocked `get()` calls raise `QueueShutDown` |
| Running the workers and waiting for them | `Promise.all(workers)` | `async with asyncio.TaskGroup() as tg:` |

Finishing is the subtle part. The queue can be empty while a worker is still mid-page and about to add ten more links, so "the queue is empty" doesn't mean "done". `join()` does: it returns once `task_done()` has been called for every item that was ever put on the queue. After that, `shutdown()` makes the `get()` calls that idle workers are blocked in raise `QueueShutDown`, the workers return, and the `TaskGroup` block exits with nothing left running. Here's the pattern on its own, with work that creates more work:

```python run
import asyncio

async def worker(name, queue):
    while True:
        try:
            n = await queue.get()
        except asyncio.QueueShutDown:
            return
        try:
            await asyncio.sleep(0)
            print(f"{name} took {n}")
            if n < 4:
                queue.put_nowait(2 * n)        # work that creates more work
                queue.put_nowait(2 * n + 1)
        finally:
            queue.task_done()

async def main():
    queue = asyncio.Queue()
    queue.put_nowait(1)
    async with asyncio.TaskGroup() as tg:
        for name in ("w1", "w2"):
            tg.create_task(worker(name, queue))
        await queue.join()                     # every item has been processed...
        queue.shutdown()                       # ...so release the idle workers
    print("done, and no tasks left running")

asyncio.run(main())
```

:::gotcha `task_done()` belongs in a `finally`
Every `get()` needs exactly one matching `task_done()`, including when processing the item fails. Skip one and `join()` waits forever, with no error to tell you why.
:::

:::quiz output
What does this print?

```python
import asyncio

async def main():
    queue = asyncio.Queue()
    queue.put_nowait("https://shop.test/")
    queue.get_nowait()
    try:
        async with asyncio.timeout(0.05):
            await queue.join()
        print("joined")
    except TimeoutError:
        print("still waiting")

asyncio.run(main())
```

- [ ] `joined`
- [x] `still waiting`
- [ ] `QueueEmpty`

The queue is empty, but `join()` doesn't count items: it waits until `task_done()` has been called once for every item ever put. Nobody called it, so without the timeout this would wait forever.
:::

`except Exception` is the right net around the fetch itself. Any failure, from a 404 to whatever a real HTTP client raises, should be recorded against its URL so the crawl carries on. It doesn't catch `CancelledError`, which is a `BaseException`, so timeouts and the `TaskGroup` can still stop a worker.

:::tip Mark URLs as seen when you queue them
Add a URL to the `seen` set when you put it on the queue, not when a worker fetches it ([Sets](lesson:sets#seen-sets-in-loops)). Two pages can link to the same URL before either link has been fetched, and checking at fetch time would queue it twice. Marking at queue time also gives each page its shortest depth, since breadth-first order reaches a page by its shortest path first.
:::

:::deep Breadth-first, mostly
With several workers, pages finish in whatever order the network allows. If one depth-1 page is slow, the children of its siblings can be processed before it finishes, and a URL that both pages link to is first seen through the longer path. Real crawlers live with that. In this step's tests every page takes the same single loop iteration, so pages finish in the order they started and depths come out exact.
:::

The starter also names the interface the rest of the project passes around: `type Fetch = Callable[[str], Awaitable[str]]`, using the 3.12+ alias syntax from [Type Hints](lesson:type-hints#generics-and-type-aliases).

:::challenge id=crawler-step-3 title="Step 3: The crawl loop" difficulty=hard
Write `async def crawl(start, fetch, *, max_depth=2, workers=4)`, returning a `CrawlResult`:

- Put `(start, 0)` on an `asyncio.Queue` and start `workers` worker tasks in a `TaskGroup`.
- Each worker loops: take a `(url, depth)` pair and `await fetch(url)`. On success, record `result.depths[url] = depth`, and if `depth < max_depth`, queue every link from `extract_links(html, url)` that hasn't been seen yet, at `depth + 1`. If the fetch raises, store the exception in `result.errors[url]` and carry on.
- Mark URLs as seen when you queue them, so no URL is fetched twice.
- Finish with `await queue.join()` and `queue.shutdown()`, so `crawl()` returns with no tasks left running.
- `workers < 1` raises `ValueError`: with nobody to empty the queue, `join()` would wait forever.

The JavaScript version below has the classic worker-pool bug that `join()` exists to prevent: the idle workers quit as soon as the queue is momentarily empty, so one worker ends up doing everything.

```js
async function crawl(start, fetchPage, { maxDepth = 2, workers = 4 } = {}) {
  const result = { depths: new Map(), errors: new Map() };
  const seen = new Set([start]);
  const queue = [[start, 0]];

  async function worker() {
    while (queue.length) {             // bug: quits while others still add links
      const [url, depth] = queue.shift();
      try {
        const html = await fetchPage(url);
        result.depths.set(url, depth);
        if (depth >= maxDepth) continue;
        for (const link of extractLinks(html, url)) {
          if (!seen.has(link)) {
            seen.add(link);
            queue.push([link, depth + 1]);
          }
        }
      } catch (err) {
        result.errors.set(url, err);
      }
    }
  }

  await Promise.all(Array.from({ length: workers }, worker));
  return result;
}
```

```python starter
import asyncio
from collections.abc import Awaitable, Callable
from dataclasses import dataclass, field
from html.parser import HTMLParser
from urllib.parse import urldefrag, urljoin, urlsplit


# --- Step 1: a fake web -------------------------------------------------------


class PageNotFoundError(LookupError):
    """The fake web's 404."""

    def __init__(self, url: str):
        super().__init__(f"404 Not Found: {url}")
        self.url = url


@dataclass
class FakeWeb:
    """An in-memory web for tests: `pages` maps each URL to its HTML."""

    pages: dict[str, str]
    flaky: dict[str, int] = field(default_factory=dict)  # URL -> requests that fail first
    slow: set[str] = field(default_factory=set)          # URLs that never answer
    requests: list[str] = field(default_factory=list)    # every URL requested, in order

    async def fetch(self, url: str) -> str:
        self.requests.append(url)
        attempt = self.requests.count(url)   # read it now: other tasks run during an await
        if url in self.slow:
            await asyncio.sleep(3600)        # hang until a timeout cancels us
        await asyncio.sleep(0)               # "network latency": let other tasks run
        if attempt <= self.flaky.get(url, 0):
            raise ConnectionError(f"connection reset: {url}")
        try:
            return self.pages[url]
        except KeyError:
            raise PageNotFoundError(url) from None


# --- Step 2: extracting links -------------------------------------------------


class LinkParser(HTMLParser):
    """Collects the href of every <a> tag it sees."""

    def __init__(self):
        super().__init__()
        self.hrefs: list[str] = []

    def handle_starttag(self, tag, attrs):
        href = dict(attrs).get("href")
        if tag == "a" and href:
            self.hrefs.append(href)


def extract_links(html: str, base_url: str) -> list[str]:
    """Absolute http(s) URLs that `html` links to, in page order, without duplicates."""
    parser = LinkParser()
    parser.feed(html)
    parser.close()
    urls = (urldefrag(urljoin(base_url, href)).url for href in parser.hrefs)
    return list(dict.fromkeys(url for url in urls if urlsplit(url).scheme in ("http", "https")))


# --- Step 3: the crawl loop ---------------------------------------------------


type Fetch = Callable[[str], Awaitable[str]]   # any async function from a URL to its HTML


@dataclass
class CrawlResult:
    depths: dict[str, int] = field(default_factory=dict)        # URL -> depth, pages fetched
    errors: dict[str, Exception] = field(default_factory=dict)  # URL -> why its fetch failed


async def crawl(start: str, fetch: Fetch, *, max_depth: int = 2, workers: int = 4) -> CrawlResult:
    """Breadth-first crawl from `start`, following links up to `max_depth` clicks away."""
    ...
```

```python solution
import asyncio
from collections.abc import Awaitable, Callable
from dataclasses import dataclass, field
from html.parser import HTMLParser
from urllib.parse import urldefrag, urljoin, urlsplit


# --- Step 1: a fake web -------------------------------------------------------


class PageNotFoundError(LookupError):
    """The fake web's 404."""

    def __init__(self, url: str):
        super().__init__(f"404 Not Found: {url}")
        self.url = url


@dataclass
class FakeWeb:
    """An in-memory web for tests: `pages` maps each URL to its HTML."""

    pages: dict[str, str]
    flaky: dict[str, int] = field(default_factory=dict)  # URL -> requests that fail first
    slow: set[str] = field(default_factory=set)          # URLs that never answer
    requests: list[str] = field(default_factory=list)    # every URL requested, in order

    async def fetch(self, url: str) -> str:
        self.requests.append(url)
        attempt = self.requests.count(url)   # read it now: other tasks run during an await
        if url in self.slow:
            await asyncio.sleep(3600)        # hang until a timeout cancels us
        await asyncio.sleep(0)               # "network latency": let other tasks run
        if attempt <= self.flaky.get(url, 0):
            raise ConnectionError(f"connection reset: {url}")
        try:
            return self.pages[url]
        except KeyError:
            raise PageNotFoundError(url) from None


# --- Step 2: extracting links -------------------------------------------------


class LinkParser(HTMLParser):
    """Collects the href of every <a> tag it sees."""

    def __init__(self):
        super().__init__()
        self.hrefs: list[str] = []

    def handle_starttag(self, tag, attrs):
        href = dict(attrs).get("href")
        if tag == "a" and href:
            self.hrefs.append(href)


def extract_links(html: str, base_url: str) -> list[str]:
    """Absolute http(s) URLs that `html` links to, in page order, without duplicates."""
    parser = LinkParser()
    parser.feed(html)
    parser.close()
    urls = (urldefrag(urljoin(base_url, href)).url for href in parser.hrefs)
    return list(dict.fromkeys(url for url in urls if urlsplit(url).scheme in ("http", "https")))


# --- Step 3: the crawl loop ---------------------------------------------------


type Fetch = Callable[[str], Awaitable[str]]   # any async function from a URL to its HTML


@dataclass
class CrawlResult:
    depths: dict[str, int] = field(default_factory=dict)        # URL -> depth, pages fetched
    errors: dict[str, Exception] = field(default_factory=dict)  # URL -> why its fetch failed


async def crawl(start: str, fetch: Fetch, *, max_depth: int = 2, workers: int = 4) -> CrawlResult:
    """Breadth-first crawl from `start`, following links up to `max_depth` clicks away."""
    if workers < 1:
        raise ValueError("crawl() needs at least one worker")
    result = CrawlResult()
    seen = {start}
    queue = asyncio.Queue()
    queue.put_nowait((start, 0))

    async def worker():
        while True:
            try:
                url, depth = await queue.get()
            except asyncio.QueueShutDown:
                return
            try:
                html = await fetch(url)
            except Exception as error:
                result.errors[url] = error
            else:
                result.depths[url] = depth
                if depth < max_depth:
                    for link in extract_links(html, url):
                        if link not in seen:
                            seen.add(link)
                            queue.put_nowait((link, depth + 1))
            finally:
                queue.task_done()

    async with asyncio.TaskGroup() as tg:
        for _ in range(workers):
            tg.create_task(worker())
        await queue.join()        # every queued URL has been processed...
        queue.shutdown()          # ...so wake the idle workers and let them return
    return result
```

```python tests
import asyncio

START = "https://shop.test/"
SITE = {
    START: '<a href="/products">Products</a> <a href="/about">About</a>',
    "https://shop.test/products": '<a href="/products/kettle">Kettle</a> <a href="/">Home</a>',
    "https://shop.test/about": '<a href="/">Home</a> <a href="/products/kettle">Best seller</a>',
    "https://shop.test/products/kettle": '<a href="/products">Back</a> <a href="/kettle/reviews">Reviews</a>',
    "https://shop.test/kettle/reviews": "<p>Five stars</p>",
}

async def finish(coro, seconds=0.5):
    """Await coro, but fail the test instead of hanging if it never finishes."""
    try:
        async with asyncio.timeout(seconds) as guard:
            return await coro
    except TimeoutError:
        if guard.expired():
            check(False, f"still running after {seconds}s: is something waiting forever?")
        raise

@test("crawls every page reachable from start")
async def _():
    result = await finish(crawl(START, FakeWeb(SITE).fetch, max_depth=5))
    eq(sorted(result.depths), sorted(SITE))
    eq(result.errors, {})

@test("records each page's depth: the fewest clicks from start")
async def _():
    result = await finish(crawl(START, FakeWeb(SITE).fetch, max_depth=5))
    eq(result.depths, {
        START: 0,
        "https://shop.test/products": 1,
        "https://shop.test/about": 1,
        "https://shop.test/products/kettle": 2,
        "https://shop.test/kettle/reviews": 3,
    })

@test("fetches pages at max_depth, but doesn't follow their links")
async def _():
    web = FakeWeb(SITE)
    result = await finish(crawl(START, web.fetch, max_depth=2))
    eq(max(result.depths.values()), 2)
    check("https://shop.test/kettle/reviews" not in web.requests, "reviews is 3 clicks away: don't fetch it")
    web = FakeWeb(SITE)
    await finish(crawl(START, web.fetch, max_depth=0))
    eq(web.requests, [START], "max_depth=0 fetches only the start page")

@test("fetches each URL once, despite cycles and repeated links")
async def _():
    web = FakeWeb(SITE)
    await finish(crawl(START, web.fetch, max_depth=5))
    eq(sorted(web.requests), sorted(SITE))

@test("records failed fetches and keeps crawling")
async def _():
    site = {**SITE, "https://shop.test/about": '<a href="/careers">Jobs</a> <a href="/">Home</a>'}
    result = await finish(crawl(START, FakeWeb(site).fetch, max_depth=5))
    eq(list(result.errors), ["https://shop.test/careers"])
    check(
        isinstance(result.errors["https://shop.test/careers"], PageNotFoundError),
        "store the exception the fetch raised",
    )
    check("https://shop.test/kettle/reviews" in result.depths, "one broken link shouldn't stop the crawl")

@test("runs up to `workers` fetches at once")
async def _():
    site = {START: "".join(f'<a href="/p/{n}">{n}</a>' for n in range(8))}
    site |= {f"https://shop.test/p/{n}": "<p>A product</p>" for n in range(8)}
    web = FakeWeb(site)
    stats = {"active": 0, "peak": 0}

    async def tracked(url):
        stats["active"] += 1
        stats["peak"] = max(stats["peak"], stats["active"])
        try:
            return await web.fetch(url)
        finally:
            stats["active"] -= 1

    result = await finish(crawl(START, tracked, workers=3))
    eq(len(result.depths), 9)
    eq(stats["peak"], 3, "peak number of fetches in flight")

@test("returns with no worker tasks left running")
async def _():
    before = asyncio.all_tasks()
    await finish(crawl(START, FakeWeb(SITE).fetch, workers=3))
    eq(len(asyncio.all_tasks() - before), 0, "tasks still running after crawl() returned")

@test("a start page that fails gives no pages and one error")
async def _():
    result = await finish(crawl("https://nowhere.test/", FakeWeb(SITE).fetch))
    eq(result.depths, {})
    eq(list(result.errors), ["https://nowhere.test/"])

@test("workers < 1 raises ValueError instead of hanging")
async def _():
    with raises(ValueError):
        await finish(crawl(START, FakeWeb(SITE).fetch, workers=0))

@test("the frontier is an asyncio.Queue")
def _():
    requires_call("Queue", "keep the URLs to visit in an asyncio.Queue that the workers pull from")
```

```hint
Define the worker as a nested `async def` so it can use `queue`, `seen` and `result` from `crawl`'s scope, and start each one with `tg.create_task(worker())` inside `async with asyncio.TaskGroup() as tg:`.
```

```hint
A worker is `while True:`, then `try: url, depth = await queue.get()` with `except asyncio.QueueShutDown: return`, then a `try`/`except Exception`/`else`/`finally` around the fetch, with `queue.task_done()` in the `finally`.
```

```hint
After starting the workers, still inside the `async with` block: `await queue.join()`, then `queue.shutdown()`.
```
:::

## Step 4: Politeness

Four workers means four requests at once, and if they all hit one small server, that's rude. Real crawlers cap the requests in flight per host (Scrapy calls the setting `CONCURRENT_REQUESTS_PER_DOMAIN`). The worker count can't do that, because it caps the total rather than the total per host. One `asyncio.Semaphore` per host can, and you met `Semaphore` as Python's `p-limit` in [Async/Await](lesson:async#limiting-concurrency-semaphore-and-queue).

Two idioms keep `PoliteFetcher` short:

- `defaultdict(lambda: asyncio.Semaphore(per_host))` creates each host's semaphore the first time the host shows up, the get-or-create dance you'd write around a `Map` in JS ([defaultdict](lesson:dicts#defaultdict-no-more-create-it-if-it-s-missing)). The host comes from `urlsplit(url).netloc`.
- A class with `__call__` can be called like a function ([callable objects](lesson:dunder-methods#truthiness-and-callables)), so a `PoliteFetcher` instance *is* a fetch function and `crawl(start, PoliteFetcher(web.fetch))` just works. Make it `async def __call__`, and calling the instance returns a coroutine, exactly like calling an `async def` function.

:::quiz output
What does this print?

```python
import asyncio
from collections import defaultdict

slots = defaultdict(lambda: asyncio.Semaphore(2))
print(slots["shop.test"] is slots["shop.test"], len(slots))
```

- [x] `True 1`
- [ ] `False 2`
- [ ] `True 0`

The factory runs only for a key that's missing. The first lookup creates `shop.test`'s semaphore and stores it, and the second gets the same object back, so every request to a host shares one set of slots.
:::

:::gotcha `acquire()` by hand leaks a slot on every error
`await sem.acquire()` followed later by `sem.release()` reads like a JS semaphore library, and it leaks: when the fetch raises, the `release()` never runs, and after `per_host` failures that host is blocked forever. `async with sem:` releases on every way out of the block, exceptions and cancellation included.
:::

:::challenge id=crawler-step-4 title="Step 4: Politeness" difficulty=medium
Write `PoliteFetcher(fetch, per_host=2)`, a callable that wraps a fetch function:

- `await polite(url)` returns whatever `await fetch(url)` returns, and lets its exceptions through.
- At most `per_host` calls for the same host (`urlsplit(url).netloc`) are in flight at once. Calls for different hosts never wait for each other.
- A call that raises gives its slot back.
- `per_host < 1` raises `ValueError`: a `Semaphore(0)` would block every call forever.

JavaScript can't make an object callable, so the JS version needs a `.fetch()` method. Python's `__call__` lets the instance stand in for the function itself.

```js
import pLimit from "p-limit";

class PoliteFetcher {
  constructor(fetchPage, perHost = 2) {
    if (perHost < 1) throw new RangeError("perHost must be at least 1");
    Object.assign(this, { fetchPage, perHost, limits: new Map() });
  }

  fetch(url) {
    const host = new URL(url).host;
    if (!this.limits.has(host)) this.limits.set(host, pLimit(this.perHost));
    return this.limits.get(host)(() => this.fetchPage(url));
  }
}
```

```python starter
import asyncio
from collections import defaultdict
from collections.abc import Awaitable, Callable
from dataclasses import dataclass, field
from html.parser import HTMLParser
from urllib.parse import urldefrag, urljoin, urlsplit


# --- Step 1: a fake web -------------------------------------------------------


class PageNotFoundError(LookupError):
    """The fake web's 404."""

    def __init__(self, url: str):
        super().__init__(f"404 Not Found: {url}")
        self.url = url


@dataclass
class FakeWeb:
    """An in-memory web for tests: `pages` maps each URL to its HTML."""

    pages: dict[str, str]
    flaky: dict[str, int] = field(default_factory=dict)  # URL -> requests that fail first
    slow: set[str] = field(default_factory=set)          # URLs that never answer
    requests: list[str] = field(default_factory=list)    # every URL requested, in order

    async def fetch(self, url: str) -> str:
        self.requests.append(url)
        attempt = self.requests.count(url)   # read it now: other tasks run during an await
        if url in self.slow:
            await asyncio.sleep(3600)        # hang until a timeout cancels us
        await asyncio.sleep(0)               # "network latency": let other tasks run
        if attempt <= self.flaky.get(url, 0):
            raise ConnectionError(f"connection reset: {url}")
        try:
            return self.pages[url]
        except KeyError:
            raise PageNotFoundError(url) from None


# --- Step 2: extracting links -------------------------------------------------


class LinkParser(HTMLParser):
    """Collects the href of every <a> tag it sees."""

    def __init__(self):
        super().__init__()
        self.hrefs: list[str] = []

    def handle_starttag(self, tag, attrs):
        href = dict(attrs).get("href")
        if tag == "a" and href:
            self.hrefs.append(href)


def extract_links(html: str, base_url: str) -> list[str]:
    """Absolute http(s) URLs that `html` links to, in page order, without duplicates."""
    parser = LinkParser()
    parser.feed(html)
    parser.close()
    urls = (urldefrag(urljoin(base_url, href)).url for href in parser.hrefs)
    return list(dict.fromkeys(url for url in urls if urlsplit(url).scheme in ("http", "https")))


# --- Step 3: the crawl loop ---------------------------------------------------


type Fetch = Callable[[str], Awaitable[str]]   # any async function from a URL to its HTML


@dataclass
class CrawlResult:
    depths: dict[str, int] = field(default_factory=dict)        # URL -> depth, pages fetched
    errors: dict[str, Exception] = field(default_factory=dict)  # URL -> why its fetch failed


async def crawl(start: str, fetch: Fetch, *, max_depth: int = 2, workers: int = 4) -> CrawlResult:
    """Breadth-first crawl from `start`, following links up to `max_depth` clicks away."""
    if workers < 1:
        raise ValueError("crawl() needs at least one worker")
    result = CrawlResult()
    seen = {start}
    queue = asyncio.Queue()
    queue.put_nowait((start, 0))

    async def worker():
        while True:
            try:
                url, depth = await queue.get()
            except asyncio.QueueShutDown:
                return
            try:
                html = await fetch(url)
            except Exception as error:
                result.errors[url] = error
            else:
                result.depths[url] = depth
                if depth < max_depth:
                    for link in extract_links(html, url):
                        if link not in seen:
                            seen.add(link)
                            queue.put_nowait((link, depth + 1))
            finally:
                queue.task_done()

    async with asyncio.TaskGroup() as tg:
        for _ in range(workers):
            tg.create_task(worker())
        await queue.join()        # every queued URL has been processed...
        queue.shutdown()          # ...so wake the idle workers and let them return
    return result


# --- Step 4: politeness -------------------------------------------------------


class PoliteFetcher:
    """Wraps a fetch function: at most `per_host` requests in flight to any one host."""

    def __init__(self, fetch: Fetch, per_host: int = 2):
        ...

    async def __call__(self, url: str) -> str:
        ...
```

```python solution
import asyncio
from collections import defaultdict
from collections.abc import Awaitable, Callable
from dataclasses import dataclass, field
from html.parser import HTMLParser
from urllib.parse import urldefrag, urljoin, urlsplit


# --- Step 1: a fake web -------------------------------------------------------


class PageNotFoundError(LookupError):
    """The fake web's 404."""

    def __init__(self, url: str):
        super().__init__(f"404 Not Found: {url}")
        self.url = url


@dataclass
class FakeWeb:
    """An in-memory web for tests: `pages` maps each URL to its HTML."""

    pages: dict[str, str]
    flaky: dict[str, int] = field(default_factory=dict)  # URL -> requests that fail first
    slow: set[str] = field(default_factory=set)          # URLs that never answer
    requests: list[str] = field(default_factory=list)    # every URL requested, in order

    async def fetch(self, url: str) -> str:
        self.requests.append(url)
        attempt = self.requests.count(url)   # read it now: other tasks run during an await
        if url in self.slow:
            await asyncio.sleep(3600)        # hang until a timeout cancels us
        await asyncio.sleep(0)               # "network latency": let other tasks run
        if attempt <= self.flaky.get(url, 0):
            raise ConnectionError(f"connection reset: {url}")
        try:
            return self.pages[url]
        except KeyError:
            raise PageNotFoundError(url) from None


# --- Step 2: extracting links -------------------------------------------------


class LinkParser(HTMLParser):
    """Collects the href of every <a> tag it sees."""

    def __init__(self):
        super().__init__()
        self.hrefs: list[str] = []

    def handle_starttag(self, tag, attrs):
        href = dict(attrs).get("href")
        if tag == "a" and href:
            self.hrefs.append(href)


def extract_links(html: str, base_url: str) -> list[str]:
    """Absolute http(s) URLs that `html` links to, in page order, without duplicates."""
    parser = LinkParser()
    parser.feed(html)
    parser.close()
    urls = (urldefrag(urljoin(base_url, href)).url for href in parser.hrefs)
    return list(dict.fromkeys(url for url in urls if urlsplit(url).scheme in ("http", "https")))


# --- Step 3: the crawl loop ---------------------------------------------------


type Fetch = Callable[[str], Awaitable[str]]   # any async function from a URL to its HTML


@dataclass
class CrawlResult:
    depths: dict[str, int] = field(default_factory=dict)        # URL -> depth, pages fetched
    errors: dict[str, Exception] = field(default_factory=dict)  # URL -> why its fetch failed


async def crawl(start: str, fetch: Fetch, *, max_depth: int = 2, workers: int = 4) -> CrawlResult:
    """Breadth-first crawl from `start`, following links up to `max_depth` clicks away."""
    if workers < 1:
        raise ValueError("crawl() needs at least one worker")
    result = CrawlResult()
    seen = {start}
    queue = asyncio.Queue()
    queue.put_nowait((start, 0))

    async def worker():
        while True:
            try:
                url, depth = await queue.get()
            except asyncio.QueueShutDown:
                return
            try:
                html = await fetch(url)
            except Exception as error:
                result.errors[url] = error
            else:
                result.depths[url] = depth
                if depth < max_depth:
                    for link in extract_links(html, url):
                        if link not in seen:
                            seen.add(link)
                            queue.put_nowait((link, depth + 1))
            finally:
                queue.task_done()

    async with asyncio.TaskGroup() as tg:
        for _ in range(workers):
            tg.create_task(worker())
        await queue.join()        # every queued URL has been processed...
        queue.shutdown()          # ...so wake the idle workers and let them return
    return result


# --- Step 4: politeness -------------------------------------------------------


class PoliteFetcher:
    """Wraps a fetch function: at most `per_host` requests in flight to any one host."""

    def __init__(self, fetch: Fetch, per_host: int = 2):
        if per_host < 1:
            raise ValueError("per_host must be at least 1")
        self.fetch = fetch
        self.slots = defaultdict(lambda: asyncio.Semaphore(per_host))

    async def __call__(self, url: str) -> str:
        async with self.slots[urlsplit(url).netloc]:
            return await self.fetch(url)
```

```python tests
import asyncio
from collections import Counter
from urllib.parse import urlsplit

def tracked_fetch(failing=()):
    """A fake fetch that records the peak number of requests in flight, per host and overall."""
    stats = {"active": Counter(), "peak": Counter(), "total": 0, "total_peak": 0}

    async def fetch(url):
        host = urlsplit(url).netloc
        stats["active"][host] += 1
        stats["peak"][host] = max(stats["peak"][host], stats["active"][host])
        stats["total"] += 1
        stats["total_peak"] = max(stats["total_peak"], stats["total"])
        try:
            for _ in range(3):
                await asyncio.sleep(0)
            if url in failing:
                raise ConnectionError(f"connection reset: {url}")
            return f"<p>{url}</p>"
        finally:
            stats["active"][host] -= 1
            stats["total"] -= 1

    return fetch, stats

async def finish(coro, seconds=0.5):
    """Await coro, but fail the test instead of hanging if it never finishes."""
    try:
        async with asyncio.timeout(seconds) as guard:
            return await coro
    except TimeoutError:
        if guard.expired():
            check(False, f"still running after {seconds}s: is something waiting forever?")
        raise

@test("returns whatever the wrapped fetch returns")
async def _():
    fetch, stats = tracked_fetch()
    polite = PoliteFetcher(fetch, per_host=2)
    eq(await finish(polite("https://shop.test/a")), "<p>https://shop.test/a</p>")

@test("lets the wrapped fetch's errors through")
async def _():
    fetch, stats = tracked_fetch(failing={"https://shop.test/a"})
    polite = PoliteFetcher(fetch, per_host=2)
    with raises(ConnectionError):
        await finish(polite("https://shop.test/a"))

@test("never has more than per_host requests in flight to one host")
async def _():
    fetch, stats = tracked_fetch()
    polite = PoliteFetcher(fetch, per_host=2)
    urls = [f"https://shop.test/p/{n}" for n in range(6)]
    pages = await finish(asyncio.gather(*(polite(url) for url in urls)))
    eq(len(pages), 6)
    eq(stats["peak"]["shop.test"], 2, "peak requests in flight to shop.test")

@test("different hosts don't wait for each other")
async def _():
    fetch, stats = tracked_fetch()
    polite = PoliteFetcher(fetch, per_host=1)
    urls = [f"https://{host}.test/{n}" for host in ("shop", "blog", "docs") for n in range(3)]
    await finish(asyncio.gather(*(polite(url) for url in urls)))
    eq(dict(stats["peak"]), {"shop.test": 1, "blog.test": 1, "docs.test": 1})
    eq(stats["total_peak"], 3, "each host's first request should run at the same time")

@test("a request that fails gives its slot back")
async def _():
    fetch, stats = tracked_fetch(failing={"https://shop.test/a"})
    polite = PoliteFetcher(fetch, per_host=1)
    first, second = await finish(
        asyncio.gather(polite("https://shop.test/a"), polite("https://shop.test/b"), return_exceptions=True)
    )
    check(isinstance(first, ConnectionError), "the first request should fail")
    eq(second, "<p>https://shop.test/b</p>")

@test("per_host < 1 raises ValueError")
def _():
    fetch, stats = tracked_fetch()
    raises(ValueError, PoliteFetcher, fetch, per_host=0)

@test("plugs straight into crawl()")
async def _():
    site = {
        "https://shop.test/": '<a href="/a">A</a> <a href="/b">B</a> <a href="https://blog.test/">Blog</a>',
        "https://shop.test/a": "", "https://shop.test/b": "", "https://blog.test/": "",
    }
    web = FakeWeb(site)
    result = await finish(crawl("https://shop.test/", PoliteFetcher(web.fetch, per_host=1)))
    eq(sorted(result.depths), sorted(site))

@test("uses asyncio.Semaphore")
def _():
    requires_call("Semaphore", "give each host an asyncio.Semaphore(per_host)")
```

```hint
In `__init__`, validate `per_host`, keep `fetch`, and create `self.slots = defaultdict(lambda: asyncio.Semaphore(per_host))`.
```

```hint
`async def __call__(self, url):` then `async with self.slots[urlsplit(url).netloc]:` and `return await self.fetch(url)` inside the block.
```
:::

## Step 5: Retries and timeouts

Not every failure deserves the same response. A reset connection or a timeout is **transient**: the same request might work a moment later. A 404 is **permanent**, and asking again just wastes a request. `with_retries()` wraps a fetch function so that each attempt gets its own deadline, transient errors are retried up to a limit, and everything else propagates at once.

Python makes the classification one line, since `except (ConnectionError, TimeoutError):` catches either type where JS needs an `instanceof` chain or a check on `err.name`. The timeout needs no help from the fetch function either. In JS you'd pass an `AbortSignal` into `fetch()` and rely on it being honoured; `asyncio.timeout()` cancels whatever is being awaited inside its block ([Timeouts and races](lesson:async#timeouts-and-races)).

:::gotcha Catch `TimeoutError` outside the `async with`
Inside an `asyncio.timeout()` block, a timeout doesn't arrive as `TimeoutError`. The awaited call gets `CancelledError`, and the context manager converts it into `TimeoutError` on the way out of the block. An `except TimeoutError:` *inside* the block never fires, so the `try` has to wrap the whole `async with`.
:::

```python run
import asyncio

async def main():
    try:
        async with asyncio.timeout(0.01):
            try:
                await asyncio.sleep(1)
            except TimeoutError:
                print("never printed")
            except asyncio.CancelledError:
                print("inside the block: CancelledError")
                raise                          # always let it continue
    except TimeoutError:
        print("outside the block: TimeoutError")

asyncio.run(main())
```

On the last attempt, a bare `raise` re-raises the error you just caught with its traceback intact. The core course's [retry challenge](lesson:exceptions#exc-retry) collected every failure into an `ExceptionGroup`; for a crawler's report, the last error is the one worth keeping.

:::tip Back off in production
Real retry loops sleep between attempts, doubling the delay each time and adding some randomness, so that a struggling server isn't hammered by every client at once. [HTTP & JSON APIs](lesson:http-and-apis) builds one with an injectable `sleep`. Retrying immediately keeps this project's tests instant.
:::

:::challenge id=crawler-step-5 title="Step 5: Retries and timeouts" difficulty=medium
Write `with_retries(fetch, *, attempts=3, timeout=1.0)`. It returns a new fetch function that:

- runs `await fetch(url)` inside `asyncio.timeout(timeout)`, so each attempt gets a deadline of its own;
- retries on `ConnectionError` and `TimeoutError` (the starter names them `TRANSIENT_ERRORS`), making at most `attempts` calls in total;
- re-raises the last error once the attempts run out;
- lets every other exception, such as `PageNotFoundError`, through at once.

`with_retries()` itself raises `ValueError` if `attempts` is less than 1.

```js
function withRetries(fetchPage, { attempts = 3, timeout = 1000 } = {}) {
  if (attempts < 1) throw new RangeError("attempts must be at least 1");
  return async (url) => {
    for (let attempt = 1; ; attempt++) {
      try {
        return await fetchPage(url, { signal: AbortSignal.timeout(timeout) });
      } catch (err) {
        const transient = err.name === "TimeoutError" || err instanceof TypeError; // TypeError: network failure
        if (!transient || attempt === attempts) throw err;
      }
    }
  };
}
```

```python starter
import asyncio
from collections import defaultdict
from collections.abc import Awaitable, Callable
from dataclasses import dataclass, field
from html.parser import HTMLParser
from urllib.parse import urldefrag, urljoin, urlsplit


# --- Step 1: a fake web -------------------------------------------------------


class PageNotFoundError(LookupError):
    """The fake web's 404."""

    def __init__(self, url: str):
        super().__init__(f"404 Not Found: {url}")
        self.url = url


@dataclass
class FakeWeb:
    """An in-memory web for tests: `pages` maps each URL to its HTML."""

    pages: dict[str, str]
    flaky: dict[str, int] = field(default_factory=dict)  # URL -> requests that fail first
    slow: set[str] = field(default_factory=set)          # URLs that never answer
    requests: list[str] = field(default_factory=list)    # every URL requested, in order

    async def fetch(self, url: str) -> str:
        self.requests.append(url)
        attempt = self.requests.count(url)   # read it now: other tasks run during an await
        if url in self.slow:
            await asyncio.sleep(3600)        # hang until a timeout cancels us
        await asyncio.sleep(0)               # "network latency": let other tasks run
        if attempt <= self.flaky.get(url, 0):
            raise ConnectionError(f"connection reset: {url}")
        try:
            return self.pages[url]
        except KeyError:
            raise PageNotFoundError(url) from None


# --- Step 2: extracting links -------------------------------------------------


class LinkParser(HTMLParser):
    """Collects the href of every <a> tag it sees."""

    def __init__(self):
        super().__init__()
        self.hrefs: list[str] = []

    def handle_starttag(self, tag, attrs):
        href = dict(attrs).get("href")
        if tag == "a" and href:
            self.hrefs.append(href)


def extract_links(html: str, base_url: str) -> list[str]:
    """Absolute http(s) URLs that `html` links to, in page order, without duplicates."""
    parser = LinkParser()
    parser.feed(html)
    parser.close()
    urls = (urldefrag(urljoin(base_url, href)).url for href in parser.hrefs)
    return list(dict.fromkeys(url for url in urls if urlsplit(url).scheme in ("http", "https")))


# --- Step 3: the crawl loop ---------------------------------------------------


type Fetch = Callable[[str], Awaitable[str]]   # any async function from a URL to its HTML


@dataclass
class CrawlResult:
    depths: dict[str, int] = field(default_factory=dict)        # URL -> depth, pages fetched
    errors: dict[str, Exception] = field(default_factory=dict)  # URL -> why its fetch failed


async def crawl(start: str, fetch: Fetch, *, max_depth: int = 2, workers: int = 4) -> CrawlResult:
    """Breadth-first crawl from `start`, following links up to `max_depth` clicks away."""
    if workers < 1:
        raise ValueError("crawl() needs at least one worker")
    result = CrawlResult()
    seen = {start}
    queue = asyncio.Queue()
    queue.put_nowait((start, 0))

    async def worker():
        while True:
            try:
                url, depth = await queue.get()
            except asyncio.QueueShutDown:
                return
            try:
                html = await fetch(url)
            except Exception as error:
                result.errors[url] = error
            else:
                result.depths[url] = depth
                if depth < max_depth:
                    for link in extract_links(html, url):
                        if link not in seen:
                            seen.add(link)
                            queue.put_nowait((link, depth + 1))
            finally:
                queue.task_done()

    async with asyncio.TaskGroup() as tg:
        for _ in range(workers):
            tg.create_task(worker())
        await queue.join()        # every queued URL has been processed...
        queue.shutdown()          # ...so wake the idle workers and let them return
    return result


# --- Step 4: politeness -------------------------------------------------------


class PoliteFetcher:
    """Wraps a fetch function: at most `per_host` requests in flight to any one host."""

    def __init__(self, fetch: Fetch, per_host: int = 2):
        if per_host < 1:
            raise ValueError("per_host must be at least 1")
        self.fetch = fetch
        self.slots = defaultdict(lambda: asyncio.Semaphore(per_host))

    async def __call__(self, url: str) -> str:
        async with self.slots[urlsplit(url).netloc]:
            return await self.fetch(url)


# --- Step 5: retries and timeouts ---------------------------------------------


TRANSIENT_ERRORS = (ConnectionError, TimeoutError)


def with_retries(fetch: Fetch, *, attempts: int = 3, timeout: float = 1.0) -> Fetch:
    """Wraps a fetch function: each attempt gets `timeout` seconds; transient errors retry."""
    ...
```

```python solution
import asyncio
from collections import defaultdict
from collections.abc import Awaitable, Callable
from dataclasses import dataclass, field
from html.parser import HTMLParser
from urllib.parse import urldefrag, urljoin, urlsplit


# --- Step 1: a fake web -------------------------------------------------------


class PageNotFoundError(LookupError):
    """The fake web's 404."""

    def __init__(self, url: str):
        super().__init__(f"404 Not Found: {url}")
        self.url = url


@dataclass
class FakeWeb:
    """An in-memory web for tests: `pages` maps each URL to its HTML."""

    pages: dict[str, str]
    flaky: dict[str, int] = field(default_factory=dict)  # URL -> requests that fail first
    slow: set[str] = field(default_factory=set)          # URLs that never answer
    requests: list[str] = field(default_factory=list)    # every URL requested, in order

    async def fetch(self, url: str) -> str:
        self.requests.append(url)
        attempt = self.requests.count(url)   # read it now: other tasks run during an await
        if url in self.slow:
            await asyncio.sleep(3600)        # hang until a timeout cancels us
        await asyncio.sleep(0)               # "network latency": let other tasks run
        if attempt <= self.flaky.get(url, 0):
            raise ConnectionError(f"connection reset: {url}")
        try:
            return self.pages[url]
        except KeyError:
            raise PageNotFoundError(url) from None


# --- Step 2: extracting links -------------------------------------------------


class LinkParser(HTMLParser):
    """Collects the href of every <a> tag it sees."""

    def __init__(self):
        super().__init__()
        self.hrefs: list[str] = []

    def handle_starttag(self, tag, attrs):
        href = dict(attrs).get("href")
        if tag == "a" and href:
            self.hrefs.append(href)


def extract_links(html: str, base_url: str) -> list[str]:
    """Absolute http(s) URLs that `html` links to, in page order, without duplicates."""
    parser = LinkParser()
    parser.feed(html)
    parser.close()
    urls = (urldefrag(urljoin(base_url, href)).url for href in parser.hrefs)
    return list(dict.fromkeys(url for url in urls if urlsplit(url).scheme in ("http", "https")))


# --- Step 3: the crawl loop ---------------------------------------------------


type Fetch = Callable[[str], Awaitable[str]]   # any async function from a URL to its HTML


@dataclass
class CrawlResult:
    depths: dict[str, int] = field(default_factory=dict)        # URL -> depth, pages fetched
    errors: dict[str, Exception] = field(default_factory=dict)  # URL -> why its fetch failed


async def crawl(start: str, fetch: Fetch, *, max_depth: int = 2, workers: int = 4) -> CrawlResult:
    """Breadth-first crawl from `start`, following links up to `max_depth` clicks away."""
    if workers < 1:
        raise ValueError("crawl() needs at least one worker")
    result = CrawlResult()
    seen = {start}
    queue = asyncio.Queue()
    queue.put_nowait((start, 0))

    async def worker():
        while True:
            try:
                url, depth = await queue.get()
            except asyncio.QueueShutDown:
                return
            try:
                html = await fetch(url)
            except Exception as error:
                result.errors[url] = error
            else:
                result.depths[url] = depth
                if depth < max_depth:
                    for link in extract_links(html, url):
                        if link not in seen:
                            seen.add(link)
                            queue.put_nowait((link, depth + 1))
            finally:
                queue.task_done()

    async with asyncio.TaskGroup() as tg:
        for _ in range(workers):
            tg.create_task(worker())
        await queue.join()        # every queued URL has been processed...
        queue.shutdown()          # ...so wake the idle workers and let them return
    return result


# --- Step 4: politeness -------------------------------------------------------


class PoliteFetcher:
    """Wraps a fetch function: at most `per_host` requests in flight to any one host."""

    def __init__(self, fetch: Fetch, per_host: int = 2):
        if per_host < 1:
            raise ValueError("per_host must be at least 1")
        self.fetch = fetch
        self.slots = defaultdict(lambda: asyncio.Semaphore(per_host))

    async def __call__(self, url: str) -> str:
        async with self.slots[urlsplit(url).netloc]:
            return await self.fetch(url)


# --- Step 5: retries and timeouts ---------------------------------------------


TRANSIENT_ERRORS = (ConnectionError, TimeoutError)


def with_retries(fetch: Fetch, *, attempts: int = 3, timeout: float = 1.0) -> Fetch:
    """Wraps a fetch function: each attempt gets `timeout` seconds; transient errors retry."""
    if attempts < 1:
        raise ValueError("attempts must be at least 1")

    async def fetch_with_retries(url: str) -> str:
        for attempt in range(1, attempts + 1):
            try:
                async with asyncio.timeout(timeout):
                    return await fetch(url)
            except TRANSIENT_ERRORS:
                if attempt == attempts:
                    raise

    return fetch_with_retries
```

```python tests
import asyncio

URL = "https://shop.test/"
PAGES = {URL: "<h1>Home</h1>"}

async def finish(coro, seconds=0.5):
    """Await coro, but fail the test instead of hanging if it never finishes."""
    try:
        async with asyncio.timeout(seconds) as guard:
            return await coro
    except TimeoutError:
        if guard.expired():
            check(False, f"still running after {seconds}s: is something waiting forever?")
        raise

@test("returns the page when the first attempt works")
async def _():
    web = FakeWeb(PAGES)
    fetch = with_retries(web.fetch, attempts=3, timeout=1)
    eq(await finish(fetch(URL)), "<h1>Home</h1>")
    eq(web.requests, [URL], "one request is enough")

@test("retries a flaky page until it answers")
async def _():
    web = FakeWeb(PAGES, flaky={URL: 2})
    fetch = with_retries(web.fetch, attempts=3, timeout=1)
    eq(await finish(fetch(URL)), "<h1>Home</h1>")
    eq(len(web.requests), 3)

@test("gives up after `attempts` tries and re-raises the last error")
async def _():
    web = FakeWeb(PAGES, flaky={URL: 5})
    fetch = with_retries(web.fetch, attempts=3, timeout=1)
    with raises(ConnectionError):
        await finish(fetch(URL))
    eq(len(web.requests), 3)

@test("doesn't retry a 404: it won't fix itself")
async def _():
    web = FakeWeb(PAGES)
    fetch = with_retries(web.fetch, attempts=3, timeout=1)
    with raises(PageNotFoundError):
        await finish(fetch("https://shop.test/missing"))
    eq(len(web.requests), 1)

@test("raises TimeoutError for a page that never answers")
async def _():
    web = FakeWeb(PAGES, slow={URL})
    fetch = with_retries(web.fetch, attempts=2, timeout=0.01)
    with raises(TimeoutError):
        await finish(fetch(URL))
    eq(len(web.requests), 2, "a timeout is transient: it gets retried")

@test("each attempt gets its own timeout")
async def _():
    calls = []

    async def stuck_once(url):
        calls.append(url)
        if len(calls) == 1:
            await asyncio.sleep(3600)   # the first attempt hangs, the second answers
        return "<h1>Home</h1>"

    fetch = with_retries(stuck_once, attempts=2, timeout=0.01)
    eq(await finish(fetch(URL)), "<h1>Home</h1>")
    eq(len(calls), 2)

@test("attempts < 1 raises ValueError")
def _():
    raises(ValueError, with_retries, FakeWeb(PAGES).fetch, attempts=0)
```

```hint
`with_retries` is a factory: define `async def fetch_with_retries(url):` inside it and return that function. It closes over `fetch`, `attempts` and `timeout` ([Closures](lesson:functions#closures-and-nonlocal)).
```

```hint
Loop with `for attempt in range(1, attempts + 1):`. Inside it, put a `try:` around `async with asyncio.timeout(timeout): return await fetch(url)`, followed by `except TRANSIENT_ERRORS:`.
```

```hint
In the `except` block, `if attempt == attempts: raise`. Otherwise do nothing, and the loop makes the next attempt.
```
:::

## Step 6: The whole crawler

Every piece exists now, and `crawl_site()` stacks them. The order of the layers matters, because there are two ways to combine the wrappers:

```python
PoliteFetcher(with_retries(fetch))   # wait for a slot, then make up to 3 attempts
with_retries(PoliteFetcher(fetch))   # every attempt waits for a slot, with its clock running
```

In the second stack, each attempt's timeout starts *before* the semaphore. Put a page that never answers on a host with one slot, and every other page on that host queues behind it with its own timeout running, so they can time out without ever reaching the server. With the semaphore on the outside, the timeout only measures the server. It's the same reasoning you'd apply to Express middleware or to [stacked decorators](lesson:decorators#stacking-decorators): an outer layer sees everything the inner layers do, their waiting included.

The report is a few lines of formatting. `Counter(self.depths.values())` counts the pages at each depth ([Counter](lesson:dicts#counter-counting-in-one-line)), sorting its items puts the depths in order, and sorting the errors by URL makes the output the same whatever order the workers finished in.

:::challenge id=crawler-step-6 title="Step 6: The whole crawler" difficulty=medium
Finish the crawler.

**`CrawlResult.summary()`** returns lines joined with `"\n"`, like this:

```text
crawled 7 pages, 2 errors
  depth 0: 1 page
  depth 1: 3 pages
  depth 2: 3 pages
  TimeoutError: https://blog.test/feed
  PageNotFoundError: https://shop.test/products/teacups
```

The first line counts `depths` and `errors`. Then come the pages per depth, in depth order, and then one line per error, sorted by URL, with the exception's class name. Every line after the first is indented by two spaces. A count of exactly 1 uses "page" or "error"; every other count, zero included, uses "pages" or "errors".

**`async def crawl_site(start, fetch, *, max_depth=2, workers=4, per_host=2, attempts=3, timeout=1.0)`** wraps `fetch` in `with_retries()` and a `PoliteFetcher`, in the order that stops a hung page from starving its neighbours, and returns the result of running `crawl()` with it.

```js
function summary({ depths, errors }) {
  const plural = (n, noun) => `${n} ${noun}${n === 1 ? "" : "s"}`;
  const perDepth = Map.groupBy(depths.values(), (depth) => depth);
  return [
    `crawled ${plural(depths.size, "page")}, ${plural(errors.size, "error")}`,
    ...[...perDepth].sort(([a], [b]) => a - b)
      .map(([depth, pages]) => `  depth ${depth}: ${plural(pages.length, "page")}`),
    ...[...errors].sort(([a], [b]) => (a < b ? -1 : 1))
      .map(([url, err]) => `  ${err.constructor.name}: ${url}`),
  ].join("\n");
}

async function crawlSite(start, fetchPage, { maxDepth = 2, workers = 4, perHost = 2, attempts = 3, timeout = 1000 } = {}) {
  const polite = new PoliteFetcher(withRetries(fetchPage, { attempts, timeout }), perHost);
  return crawl(start, (url) => polite.fetch(url), { maxDepth, workers });
}
```

```python starter
import asyncio
from collections import Counter, defaultdict
from collections.abc import Awaitable, Callable
from dataclasses import dataclass, field
from html.parser import HTMLParser
from urllib.parse import urldefrag, urljoin, urlsplit


# --- Step 1: a fake web -------------------------------------------------------


class PageNotFoundError(LookupError):
    """The fake web's 404."""

    def __init__(self, url: str):
        super().__init__(f"404 Not Found: {url}")
        self.url = url


@dataclass
class FakeWeb:
    """An in-memory web for tests: `pages` maps each URL to its HTML."""

    pages: dict[str, str]
    flaky: dict[str, int] = field(default_factory=dict)  # URL -> requests that fail first
    slow: set[str] = field(default_factory=set)          # URLs that never answer
    requests: list[str] = field(default_factory=list)    # every URL requested, in order

    async def fetch(self, url: str) -> str:
        self.requests.append(url)
        attempt = self.requests.count(url)   # read it now: other tasks run during an await
        if url in self.slow:
            await asyncio.sleep(3600)        # hang until a timeout cancels us
        await asyncio.sleep(0)               # "network latency": let other tasks run
        if attempt <= self.flaky.get(url, 0):
            raise ConnectionError(f"connection reset: {url}")
        try:
            return self.pages[url]
        except KeyError:
            raise PageNotFoundError(url) from None


# --- Step 2: extracting links -------------------------------------------------


class LinkParser(HTMLParser):
    """Collects the href of every <a> tag it sees."""

    def __init__(self):
        super().__init__()
        self.hrefs: list[str] = []

    def handle_starttag(self, tag, attrs):
        href = dict(attrs).get("href")
        if tag == "a" and href:
            self.hrefs.append(href)


def extract_links(html: str, base_url: str) -> list[str]:
    """Absolute http(s) URLs that `html` links to, in page order, without duplicates."""
    parser = LinkParser()
    parser.feed(html)
    parser.close()
    urls = (urldefrag(urljoin(base_url, href)).url for href in parser.hrefs)
    return list(dict.fromkeys(url for url in urls if urlsplit(url).scheme in ("http", "https")))


# --- Step 3: the crawl loop ---------------------------------------------------


type Fetch = Callable[[str], Awaitable[str]]   # any async function from a URL to its HTML


@dataclass
class CrawlResult:
    depths: dict[str, int] = field(default_factory=dict)        # URL -> depth, pages fetched
    errors: dict[str, Exception] = field(default_factory=dict)  # URL -> why its fetch failed

    def summary(self) -> str:
        ...


async def crawl(start: str, fetch: Fetch, *, max_depth: int = 2, workers: int = 4) -> CrawlResult:
    """Breadth-first crawl from `start`, following links up to `max_depth` clicks away."""
    if workers < 1:
        raise ValueError("crawl() needs at least one worker")
    result = CrawlResult()
    seen = {start}
    queue = asyncio.Queue()
    queue.put_nowait((start, 0))

    async def worker():
        while True:
            try:
                url, depth = await queue.get()
            except asyncio.QueueShutDown:
                return
            try:
                html = await fetch(url)
            except Exception as error:
                result.errors[url] = error
            else:
                result.depths[url] = depth
                if depth < max_depth:
                    for link in extract_links(html, url):
                        if link not in seen:
                            seen.add(link)
                            queue.put_nowait((link, depth + 1))
            finally:
                queue.task_done()

    async with asyncio.TaskGroup() as tg:
        for _ in range(workers):
            tg.create_task(worker())
        await queue.join()        # every queued URL has been processed...
        queue.shutdown()          # ...so wake the idle workers and let them return
    return result


# --- Step 4: politeness -------------------------------------------------------


class PoliteFetcher:
    """Wraps a fetch function: at most `per_host` requests in flight to any one host."""

    def __init__(self, fetch: Fetch, per_host: int = 2):
        if per_host < 1:
            raise ValueError("per_host must be at least 1")
        self.fetch = fetch
        self.slots = defaultdict(lambda: asyncio.Semaphore(per_host))

    async def __call__(self, url: str) -> str:
        async with self.slots[urlsplit(url).netloc]:
            return await self.fetch(url)


# --- Step 5: retries and timeouts ---------------------------------------------


TRANSIENT_ERRORS = (ConnectionError, TimeoutError)


def with_retries(fetch: Fetch, *, attempts: int = 3, timeout: float = 1.0) -> Fetch:
    """Wraps a fetch function: each attempt gets `timeout` seconds; transient errors retry."""
    if attempts < 1:
        raise ValueError("attempts must be at least 1")

    async def fetch_with_retries(url: str) -> str:
        for attempt in range(1, attempts + 1):
            try:
                async with asyncio.timeout(timeout):
                    return await fetch(url)
            except TRANSIENT_ERRORS:
                if attempt == attempts:
                    raise

    return fetch_with_retries


# --- Step 6: the whole crawler ------------------------------------------------


async def crawl_site(
    start: str,
    fetch: Fetch,
    *,
    max_depth: int = 2,
    workers: int = 4,
    per_host: int = 2,
    attempts: int = 3,
    timeout: float = 1.0,
) -> CrawlResult:
    """The whole stack: retries and timeouts inside a per-host politeness limit."""
    ...
```

```python solution
import asyncio
from collections import Counter, defaultdict
from collections.abc import Awaitable, Callable
from dataclasses import dataclass, field
from html.parser import HTMLParser
from urllib.parse import urldefrag, urljoin, urlsplit


# --- Step 1: a fake web -------------------------------------------------------


class PageNotFoundError(LookupError):
    """The fake web's 404."""

    def __init__(self, url: str):
        super().__init__(f"404 Not Found: {url}")
        self.url = url


@dataclass
class FakeWeb:
    """An in-memory web for tests: `pages` maps each URL to its HTML."""

    pages: dict[str, str]
    flaky: dict[str, int] = field(default_factory=dict)  # URL -> requests that fail first
    slow: set[str] = field(default_factory=set)          # URLs that never answer
    requests: list[str] = field(default_factory=list)    # every URL requested, in order

    async def fetch(self, url: str) -> str:
        self.requests.append(url)
        attempt = self.requests.count(url)   # read it now: other tasks run during an await
        if url in self.slow:
            await asyncio.sleep(3600)        # hang until a timeout cancels us
        await asyncio.sleep(0)               # "network latency": let other tasks run
        if attempt <= self.flaky.get(url, 0):
            raise ConnectionError(f"connection reset: {url}")
        try:
            return self.pages[url]
        except KeyError:
            raise PageNotFoundError(url) from None


# --- Step 2: extracting links -------------------------------------------------


class LinkParser(HTMLParser):
    """Collects the href of every <a> tag it sees."""

    def __init__(self):
        super().__init__()
        self.hrefs: list[str] = []

    def handle_starttag(self, tag, attrs):
        href = dict(attrs).get("href")
        if tag == "a" and href:
            self.hrefs.append(href)


def extract_links(html: str, base_url: str) -> list[str]:
    """Absolute http(s) URLs that `html` links to, in page order, without duplicates."""
    parser = LinkParser()
    parser.feed(html)
    parser.close()
    urls = (urldefrag(urljoin(base_url, href)).url for href in parser.hrefs)
    return list(dict.fromkeys(url for url in urls if urlsplit(url).scheme in ("http", "https")))


# --- Step 3: the crawl loop ---------------------------------------------------


type Fetch = Callable[[str], Awaitable[str]]   # any async function from a URL to its HTML


def plural(count: int, noun: str) -> str:
    return f"{count} {noun}" if count == 1 else f"{count} {noun}s"


@dataclass
class CrawlResult:
    depths: dict[str, int] = field(default_factory=dict)        # URL -> depth, pages fetched
    errors: dict[str, Exception] = field(default_factory=dict)  # URL -> why its fetch failed

    def summary(self) -> str:
        lines = [f"crawled {plural(len(self.depths), 'page')}, {plural(len(self.errors), 'error')}"]
        for depth, count in sorted(Counter(self.depths.values()).items()):
            lines.append(f"  depth {depth}: {plural(count, 'page')}")
        for url, error in sorted(self.errors.items()):
            lines.append(f"  {type(error).__name__}: {url}")
        return "\n".join(lines)


async def crawl(start: str, fetch: Fetch, *, max_depth: int = 2, workers: int = 4) -> CrawlResult:
    """Breadth-first crawl from `start`, following links up to `max_depth` clicks away."""
    if workers < 1:
        raise ValueError("crawl() needs at least one worker")
    result = CrawlResult()
    seen = {start}
    queue = asyncio.Queue()
    queue.put_nowait((start, 0))

    async def worker():
        while True:
            try:
                url, depth = await queue.get()
            except asyncio.QueueShutDown:
                return
            try:
                html = await fetch(url)
            except Exception as error:
                result.errors[url] = error
            else:
                result.depths[url] = depth
                if depth < max_depth:
                    for link in extract_links(html, url):
                        if link not in seen:
                            seen.add(link)
                            queue.put_nowait((link, depth + 1))
            finally:
                queue.task_done()

    async with asyncio.TaskGroup() as tg:
        for _ in range(workers):
            tg.create_task(worker())
        await queue.join()        # every queued URL has been processed...
        queue.shutdown()          # ...so wake the idle workers and let them return
    return result


# --- Step 4: politeness -------------------------------------------------------


class PoliteFetcher:
    """Wraps a fetch function: at most `per_host` requests in flight to any one host."""

    def __init__(self, fetch: Fetch, per_host: int = 2):
        if per_host < 1:
            raise ValueError("per_host must be at least 1")
        self.fetch = fetch
        self.slots = defaultdict(lambda: asyncio.Semaphore(per_host))

    async def __call__(self, url: str) -> str:
        async with self.slots[urlsplit(url).netloc]:
            return await self.fetch(url)


# --- Step 5: retries and timeouts ---------------------------------------------


TRANSIENT_ERRORS = (ConnectionError, TimeoutError)


def with_retries(fetch: Fetch, *, attempts: int = 3, timeout: float = 1.0) -> Fetch:
    """Wraps a fetch function: each attempt gets `timeout` seconds; transient errors retry."""
    if attempts < 1:
        raise ValueError("attempts must be at least 1")

    async def fetch_with_retries(url: str) -> str:
        for attempt in range(1, attempts + 1):
            try:
                async with asyncio.timeout(timeout):
                    return await fetch(url)
            except TRANSIENT_ERRORS:
                if attempt == attempts:
                    raise

    return fetch_with_retries


# --- Step 6: the whole crawler ------------------------------------------------


async def crawl_site(
    start: str,
    fetch: Fetch,
    *,
    max_depth: int = 2,
    workers: int = 4,
    per_host: int = 2,
    attempts: int = 3,
    timeout: float = 1.0,
) -> CrawlResult:
    """The whole stack: retries and timeouts inside a per-host politeness limit."""
    patient = with_retries(fetch, attempts=attempts, timeout=timeout)
    polite = PoliteFetcher(patient, per_host=per_host)
    return await crawl(start, polite, max_depth=max_depth, workers=workers)
```

```python tests
import asyncio
from collections import Counter
from urllib.parse import urlsplit

START = "https://shop.test/"
SITE = {
    START: '<a href="/products">Products</a> <a href="/about">About</a> <a href="https://blog.test/">Blog</a>',
    "https://shop.test/products": '<a href="/products/kettle">Kettle</a> <a href="/products/teapot">Teapot</a>',
    "https://shop.test/products/kettle": '<a href="/products">All products</a>',
    "https://shop.test/products/teapot": '<a href="/products/teacups">Matching cups</a>',
    "https://shop.test/about": '<a href="mailto:hello@shop.test">Email us</a>',
    "https://blog.test/": '<a href="/posts/green-tea">Green tea</a> <a href="/feed">Feed</a>',
    "https://blog.test/posts/green-tea": '<a href="https://shop.test/products/teapot#buy">Buy</a>',
    "https://blog.test/feed": "<rss>...</rss>",
}
FLAKY, SLOW, BROKEN = "https://shop.test/about", "https://blog.test/feed", "https://shop.test/products/teacups"

async def finish(coro, seconds=0.5):
    """Await coro, but fail the test instead of hanging if it never finishes."""
    try:
        async with asyncio.timeout(seconds) as guard:
            return await coro
    except TimeoutError:
        if guard.expired():
            check(False, f"still running after {seconds}s: is something waiting forever?")
        raise

@test("summary() counts pages and errors, then pages per depth")
def _():
    result = CrawlResult(depths={"https://a.test/": 0, "https://a.test/x": 1, "https://a.test/y": 1})
    eq(result.summary(), "crawled 3 pages, 0 errors\n  depth 0: 1 page\n  depth 1: 2 pages")

@test("summary() lists errors last, sorted by URL, with their type")
def _():
    result = CrawlResult(
        depths={"https://a.test/": 0},
        errors={"https://b.test/": TimeoutError(), "https://a.test/gone": PageNotFoundError("https://a.test/gone")},
    )
    eq(result.summary().splitlines(), [
        "crawled 1 page, 2 errors",
        "  depth 0: 1 page",
        "  PageNotFoundError: https://a.test/gone",
        "  TimeoutError: https://b.test/",
    ])

@test("crawl_site() retries flaky pages and times out slow ones")
async def _():
    web = FakeWeb(SITE, flaky={FLAKY: 2}, slow={SLOW})
    result = await finish(crawl_site(START, web.fetch, attempts=3, timeout=0.02))
    eq(result.depths.get(FLAKY), 1, "the flaky page answers on its third attempt")
    eq(web.requests.count(FLAKY), 3)
    check(isinstance(result.errors.get(SLOW), TimeoutError), "the slow page should fail with TimeoutError")
    eq(web.requests.count(SLOW), 3)

@test("crawl_site() passes max_depth on, and tries broken links once")
async def _():
    web = FakeWeb(SITE)
    result = await finish(crawl_site(START, web.fetch, max_depth=3))
    check(isinstance(result.errors.get(BROKEN), PageNotFoundError), "teacups is 3 clicks away, and missing")
    eq(web.requests.count(BROKEN), 1)
    web = FakeWeb(SITE)
    result = await finish(crawl_site(START, web.fetch, max_depth=1))
    eq(max(result.depths.values()), 1)

@test("crawl_site() keeps to per_host requests per host")
async def _():
    web = FakeWeb(SITE)
    stats = {"active": Counter(), "peak": Counter()}

    async def tracked(url):
        host = urlsplit(url).netloc
        stats["active"][host] += 1
        stats["peak"][host] = max(stats["peak"][host], stats["active"][host])
        try:
            return await web.fetch(url)
        finally:
            stats["active"][host] -= 1

    result = await finish(crawl_site(START, tracked, max_depth=3, workers=8, per_host=1))
    eq(len(result.depths), 8)
    eq(dict(stats["peak"]), {"shop.test": 1, "blog.test": 1})

@test("a page that hangs doesn't make its neighbours time out")
async def _():
    site = {
        "https://a.test/": '<a href="/slow">1</a> <a href="/one">2</a> <a href="/two">3</a>',
        "https://a.test/slow": "", "https://a.test/one": "", "https://a.test/two": "",
    }
    web = FakeWeb(site, slow={"https://a.test/slow"})
    result = await finish(crawl_site("https://a.test/", web.fetch, per_host=1, attempts=2, timeout=0.02))
    eq(list(result.errors), ["https://a.test/slow"], "only the slow page should fail")
    eq(sorted(result.depths), ["https://a.test/", "https://a.test/one", "https://a.test/two"])

@test("the whole stack, end to end")
async def _():
    web = FakeWeb(SITE, flaky={FLAKY: 2}, slow={SLOW})
    result = await finish(crawl_site(START, web.fetch, max_depth=3, timeout=0.02))
    eq(result.summary().splitlines(), [
        "crawled 7 pages, 2 errors",
        "  depth 0: 1 page",
        "  depth 1: 3 pages",
        "  depth 2: 3 pages",
        "  TimeoutError: https://blog.test/feed",
        "  PageNotFoundError: https://shop.test/products/teacups",
    ])
    eq(len(web.requests), 13, "9 URLs, plus 2 retries each for the flaky and the slow page")
```

```hint
`Counter(self.depths.values())` maps each depth to its number of pages, and `sorted(counter.items())` walks the depths in order. A two-line `plural(count, noun)` helper keeps the f-strings readable.
```

```hint
`type(error).__name__` is the exception's class name, and `sorted(self.errors.items())` gives the `(url, error)` pairs in URL order.
```

```hint
Build the stack from the inside out: `PoliteFetcher(with_retries(fetch, attempts=attempts, timeout=timeout), per_host=per_host)`.
```
:::

## Where to take it next

The finished crawler is around 130 lines of code, and the design holds up for real use. Some directions to take it:

- **Real HTTP.** Swap the fake for `httpx.AsyncClient` (third-party, so it can't run here), translating its errors into the ones the stack expects:

  ```python
  import httpx

  async def main():
      async with httpx.AsyncClient(follow_redirects=True, timeout=10) as client:

          async def fetch(url: str) -> str:
              try:
                  response = await client.get(url)
              except httpx.TransportError as error:   # timeouts, resets, DNS failures
                  raise ConnectionError(str(error)) from error
              if response.status_code == 404:
                  raise PageNotFoundError(url)
              response.raise_for_status()
              return response.text

          result = await crawl_site("https://example.com/", fetch, max_depth=2)
      print(result.summary())
  ```

- **robots.txt.** The standard library parses it: `urllib.robotparser.RobotFileParser` answers `can_fetch(user_agent, url)`.
- **Smarter retries.** Exponential backoff with jitter, and honouring `Retry-After` headers.
- **URL normalisation.** Lowercase the host, drop default ports and sort query parameters, so that `HTTPS://Shop.test:443/?b=2&a=1` and `https://shop.test/?a=1&b=2` count as one page.
- **Results as they arrive.** Turn `crawl()` into an async generator that yields each page as it's fetched, for progress bars and early exits ([`async for`](lesson:async#async-for-and-async-with)).

## Cheat sheet

| JavaScript | Python | Notes |
| --- | --- | --- |
| `await new Promise((r) => setTimeout(r, 0))` | `await asyncio.sleep(0)` | one trip round the loop, no timer |
| `DOMParser` / cheerio | `html.parser.HTMLParser` | event-driven; BeautifulSoup for trees and selectors |
| `new URL(href, base).href` | `urljoin(base, href)` | resolves but doesn't normalise |
| `url.hash = ""` | `urldefrag(url).url` | |
| `url.protocol`, `url.host` | `urlsplit(url).scheme`, `.netloc` | no colon on the scheme |
| `[...new Set(urls)]` | `list(dict.fromkeys(urls))` | a `set` doesn't keep order |
| a queue plus promise resolvers | `asyncio.Queue` | `await get()` sleeps until there's an item |
| an in-flight counter | `task_done()` + `await queue.join()` | `task_done()` in a `finally` |
| poison pills | `queue.shutdown()` | 3.13+; `get()` raises `QueueShutDown` |
| `Promise.all(workers)` | `async with asyncio.TaskGroup() as tg:` | a crashed worker cancels the rest |
| `p-limit` per key in a `Map` | `defaultdict(lambda: asyncio.Semaphore(n))` | `async with sem:` |
| a function with state attached | a class with `async def __call__` | instances are callable |
| `AbortSignal.timeout(ms)` | `async with asyncio.timeout(seconds):` | catch `TimeoutError` outside the block |
| `err instanceof A \|\| err instanceof B` | `except (A, B):` | a tuple of types |
| `throw err` | bare `raise` | keeps the original traceback |
