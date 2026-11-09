---
title: HTTP & JSON APIs
part: Services & Storage
summary: fetch and axios become requests and httpx, plus safe URLs, retries, pagination and API clients you can test.
minutes: 40
---

Python has no `fetch` built in. The standard library's `urllib.request` can make requests, but nearly everyone installs **requests** (synchronous, the long-standing default) or **httpx** (almost the same API, plus async support and HTTP/2). Their API maps closely onto fetch and axios, and the first section is a translation table.

The rest of the lesson is about what you build around the client: URLs that survive a space or a slash, status codes with names, retries that back off, pagination that streams, and API clients you can test without a network. That last part matters here, because the sandbox has no network. Every runnable example talks to a **fake transport**, which is exactly the technique you'd use in a test suite.

## fetch and axios → requests and httpx

:::compare
```js
const params = new URLSearchParams({ plan: "pro", page: "2" });
const res = await fetch(`https://api.example.com/users?${params}`, {
  headers: { Authorization: `Bearer ${token}` },
  signal: AbortSignal.timeout(10_000),
});
if (!res.ok) throw new Error(`HTTP ${res.status}`);
const users = await res.json();

await fetch("https://api.example.com/users", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ name: "Ada" }),
});
```
```python
import requests                      # pip install requests

res = requests.get("https://api.example.com/users",
                   params={"plan": "pro", "page": 2},
                   headers={"Authorization": f"Bearer {token}"},
                   timeout=10)
res.raise_for_status()
users = res.json()

requests.post("https://api.example.com/users",
              json={"name": "Ada"},
              timeout=10)
```
:::

The shapes match. `params=` builds and encodes the query string, `json=` serialises the body and sets `Content-Type`, and `.json()` parses the response. What's missing is `await`: `requests.get` blocks until the response arrives. That's the normal style for scripts, CLIs and most Python web backends, and it's why async code needs a different client (see below). httpx copies the requests API almost exactly, so everything here applies to both.

| fetch / axios | requests | httpx |
| --- | --- | --- |
| `res.status` | `res.status_code` | `res.status_code` |
| `res.ok` (200 to 299) | `res.ok` (anything below 400) | `res.is_success` (200 to 299) |
| `await res.json()` | `res.json()` | `res.json()` |
| `await res.text()` | `res.text` | `res.text` |
| `await res.arrayBuffer()` | `res.content` (bytes) | `res.content` |
| `res.headers.get("content-type")` | `res.headers["content-type"]` | `res.headers["content-type"]` |
| `body: JSON.stringify(data)` | `json=data` | `json=data` |
| a `URLSearchParams` query | `params={...}` | `params={...}` |
| `signal: AbortSignal.timeout(10_000)` | `timeout=10` | `timeout=10` |
| axios rejecting on 4xx/5xx | `res.raise_for_status()` | `res.raise_for_status()` |
| `axios.create({ baseURL })` | `requests.Session()` | `httpx.Client(base_url=...)` |

Header lookups are case-insensitive in both libraries, as they are on a fetch `Headers` object.

:::gotcha Timeouts are seconds, and requests has no default
`timeout=10` means ten seconds, not ten milliseconds. Worse, requests has **no default timeout**: without one, a server that accepts the connection and never answers hangs your program forever. Pass `timeout=` on every call. httpx defaults to 5 seconds.
:::

:::gotcha A 404 isn't an exception
Like fetch, requests and httpx hand back 4xx and 5xx responses without raising, which is the opposite of axios. Call `res.raise_for_status()`, which raises `requests.HTTPError` (or `httpx.HTTPStatusError`) for any 4xx or 5xx status, or check `res.status_code` yourself. Network failures do raise: `requests.ConnectionError` and `requests.Timeout` share the base class `requests.RequestException`, and httpx's connection, timeout and status errors all derive from `httpx.HTTPError`.
:::

### Sessions and clients

:::compare
```js
const api = axios.create({
  baseURL: "https://api.example.com/v1",
  headers: { Authorization: `Bearer ${token}` },
  timeout: 10_000,
});
const { data: me } = await api.get("/me");
```
```python
with httpx.Client(
    base_url="https://api.example.com/v1",
    headers={"Authorization": f"Bearer {token}"},
    timeout=10,
) as api:
    me = api.get("/me").json()
```
:::

A requests `Session` or an httpx `Client` is the `axios.create` equivalent: shared headers, cookies and settings, plus a **connection pool**, so repeated calls to the same host skip the TCP and TLS handshakes. Create one for the life of your program rather than one per request, and close it when you're done, which `with` does for you. httpx's `Client` takes a `base_url`; a requests `Session` doesn't, so you build full URLs yourself.

### Async requests with `httpx.AsyncClient`

```python
import asyncio
import httpx

async def fetch_users(ids):
    async with httpx.AsyncClient(base_url="https://api.example.com", timeout=10) as client:
        responses = await asyncio.gather(*(client.get(f"/users/{i}") for i in ids))
    return [response.json() for response in responses]

users = asyncio.run(fetch_users([1, 2, 3]))
```

That's `Promise.all(ids.map((id) => api.get(...)))`. requests has no async mode, and calling it from a coroutine blocks the whole event loop ([Async](lesson:async#blocking-code-and-the-sync-ecosystem)), so use httpx or aiohttp in async code and cap the concurrency with a semaphore ([Limiting concurrency](lesson:async#limiting-concurrency-semaphore-and-queue)).

### The standard library's `urllib.request`

```python
import json
import urllib.request

request = urllib.request.Request(
    "https://api.example.com/users",
    data=json.dumps({"name": "Ada"}).encode(),
    headers={"Content-Type": "application/json"},
    method="POST",
)
with urllib.request.urlopen(request, timeout=10) as response:
    user = json.load(response)
```

No dependencies, more ceremony: you encode the body yourself, and unlike fetch, `urlopen` **raises** `urllib.error.HTTPError` for 4xx and 5xx responses. The exception doubles as the response, with `.code`, `.headers` and `.read()`. It's fine for a zero-dependency script. For anything bigger, install httpx.

## Building URLs that don't break

:::compare
```js
const url = new URL(
  `users/${encodeURIComponent(login)}/repos`,
  "https://api.example.com/v1/",
);
url.searchParams.set("fork", false);       // "fork=false"
url.searchParams.set("q", "red shoes");    // "q=red+shoes"
```
```python
from urllib.parse import quote, urlencode, urljoin

url = urljoin(
    "https://api.example.com/v1/",
    f"users/{quote(login, safe='')}/repos",
)
url += "?" + urlencode({"fork": "false", "q": "red shoes"})
```
:::

[Batteries Included](lesson:standard-library#urls-urllib-parse) introduced `urllib.parse`. API code runs into its sharp edges:

- `quote(s)` leaves `/` alone (its `safe` parameter defaults to `"/"`). That's right for a whole path and wrong for a single segment: a login or file name containing `/` silently becomes two segments. For a segment, `quote(s, safe="")` is `encodeURIComponent`.
- `urlencode` calls `str()` on every value, so `True` arrives as `True` (most APIs expect `true`) and `None` as the text `None`. Convert booleans and drop the `None`s before encoding. List values need `doseq=True`. requests' `params=` also sends `True`, though it drops `None`; httpx sends `true`.
- Like `URLSearchParams`, `urlencode` writes spaces as `+`. Pass `quote_via=quote` if an API wants `%20`.
- `urljoin(base, ref)` resolves like `new URL(ref, base)`: without a trailing slash on the base, its last segment is replaced, and a path starting with `/` replaces the whole path. A reference that starts with `//` or a scheme replaces the host too, so never `urljoin` user input onto your API's base URL.

```python run
from urllib.parse import quote, urlencode, urljoin

login = "ada/lovelace & co"
print(quote(login))                         # "/" survives: two path segments!
print(quote(login, safe=""))                # like encodeURIComponent

print(urlencode({"fork": False, "topic": None, "q": "red shoes"}))
print(urlencode({"q": "red shoes"}, quote_via=quote))

print(urljoin("https://api.example.com/v1", "users"))      # v1 is replaced
print(urljoin("https://api.example.com/v1/", "users"))     # appended
print(urljoin("https://api.example.com/v1/", "/users"))    # from the root
print(urljoin("https://api.example.com/v1/", "//evil.example/x"))
```

:::quiz output
What does this print?

```python
from urllib.parse import urlencode
print(urlencode({"draft": True, "page": 2}))
```

- [ ] `draft=true&page=2`
- [x] `draft=True&page=2`
- [ ] `draft=1&page=2`
- [ ] `TypeError`

`urlencode` turns each value into text with `str()`, and `str(True)` is `"True"`. JavaScript's `String(true)` is `"true"`, which is what most APIs expect, so convert booleans yourself before encoding.
:::

## Status codes with names: `http.HTTPStatus`

:::compare
```js
if (res.status === 429) {
  await sleep(1_000);
}
res.statusText;           // "Too Many Requests" (empty over HTTP/2)
```
```python
from http import HTTPStatus

if res.status_code == HTTPStatus.TOO_MANY_REQUESTS:
    time.sleep(1)
HTTPStatus(res.status_code).phrase   # "Too Many Requests", always
```
:::

`HTTPStatus` is an `IntEnum` of the registered status codes. Its members compare equal to plain ints, so you can test `res.status_code` against them directly and gain readability without converting anything ([IntEnum](lesson:dataclasses-and-enums#auto-strenum-and-intenum)). Each member has a `.phrase` and a `.description`, and 3.12 added the category checks `is_informational`, `is_success`, `is_redirection`, `is_client_error` and `is_server_error`. Because they're dotted names, members also work as `case` patterns ([Pattern Matching](lesson:pattern-matching)). `HTTPStatus(code)` raises `ValueError` for a code it doesn't know, such as Cloudflare's 520, so guard it when the number comes from outside.

```python run
from http import HTTPStatus

status = HTTPStatus(429)
print(status, status.name, status.phrase)
print(status == 429, status.is_client_error, HTTPStatus(503).is_server_error)

def describe(code):
    match code:
        case HTTPStatus.OK | HTTPStatus.CREATED:
            return "fine"
        case HTTPStatus.TOO_MANY_REQUESTS:
            return "slow down"
        case _ if 500 <= code < 600:
            return "their fault"
        case _:
            return HTTPStatus(code).phrase

print([describe(code) for code in (200, 201, 429, 503, 404)])
```

:::quiz output
What does this print?

```python
from http import HTTPStatus
print(HTTPStatus.NOT_FOUND, HTTPStatus.NOT_FOUND.phrase)
```

- [ ] `HTTPStatus.NOT_FOUND Not Found`
- [x] `404 Not Found`
- [ ] `NOT_FOUND Not Found`
- [ ] `<HTTPStatus.NOT_FOUND: 404> Not Found`

Since 3.11, `str()` and `format()` of an `IntEnum` member give the plain number, so members drop into f-strings and log lines as `404`. The `repr()` still shows `<HTTPStatus.NOT_FOUND: 404>`, and `.name` gives `"NOT_FOUND"`.
:::

## Testable clients: inject the transport

:::compare
```js
// Many SDKs take the fetch to use, so tests can pass a fake
const client = new TodoClient({ token, fetch: fakeFetch });

class TodoClient {
  constructor({ token, fetch = globalThis.fetch }) { /* ... */ }
}
```
```python
# The client takes the transport to use, so tests can pass a fake
client = TodoClient(fake_transport, token=token)

class TodoClient:
    def __init__(self, transport, token): ...
```
:::

Scattering `requests.get` calls through a codebase ties every caller to the network and to one API's HTTP details. The fix is the one SDK authors use: a client class whose methods speak your domain (`create(title)` returns a dict or a dataclass, failures become your exceptions), with the network behind a single seam. Model a request and a response as small [frozen dataclasses](lesson:dataclasses-and-enums#frozen-dataclasses), and make the **transport** a plain callable from `Request` to `Response` that the client receives in its constructor. Production passes one that calls httpx. Tests pass a fake that records what was sent and returns canned answers: no patching, no network, no flakiness.

```python run
import json
from dataclasses import dataclass, field

@dataclass(frozen=True)
class Request:
    method: str
    url: str
    headers: dict[str, str] = field(default_factory=dict)
    body: bytes | None = None

@dataclass(frozen=True)
class Response:
    status: int
    headers: dict[str, str] = field(default_factory=dict)
    body: bytes = b""

    def json(self):
        return json.loads(self.body)

class TodoClient:
    def __init__(self, transport, token, base_url="https://api.example.com"):
        self.transport = transport              # any callable: Request -> Response
        self.base_url = base_url
        self.headers = {"authorization": f"Bearer {token}"}

    def create(self, title):
        headers = {**self.headers, "content-type": "application/json"}
        body = json.dumps({"title": title}).encode()
        return self.transport(Request("POST", f"{self.base_url}/todos", headers, body)).json()

sent = []
def fake_transport(request):                    # records the request, answers like the API
    sent.append(request)
    return Response(201, body=json.dumps({"id": 7, **json.loads(request.body)}).encode())

client = TodoClient(fake_transport, token="t0k3n")
print(client.create("Ship the HTTP lesson"))
print(sent[0].method, sent[0].url, sent[0].headers)
```

Bodies are bytes on the wire, so the model keeps them as bytes and decodes JSON at the edge. HTTP header names are case-insensitive; with plain dicts, the simplest convention is to store them lowercase. The production transport is a few lines:

```python
import os
from collections.abc import Callable

import httpx

type Transport = Callable[[Request], Response]       # 3.12+

def httpx_transport(request: Request) -> Response:
    reply = httpx.request(request.method, request.url, headers=request.headers,
                          content=request.body, timeout=10)
    headers = {name.lower(): value for name, value in reply.headers.items()}
    return Response(reply.status_code, headers, reply.content)

client = TodoClient(httpx_transport, token=os.environ["TODO_TOKEN"])
```

:::tip Libraries that fake the network
httpx has this seam built in: `httpx.Client(transport=httpx.MockTransport(handler))` sends every request to your `handler(request)`, which returns an `httpx.Response`. **respx** (for httpx) and **responses** (for requests) are Python's nock and msw: they intercept requests by URL pattern. [Testing](lesson:testing-with-python) covers `unittest.mock` for everything else.
:::

## Retries with exponential backoff

:::compare
```js
async function getWithRetries(url) {
  for (let attempt = 0; ; attempt++) {
    const res = await fetch(url);
    if (!RETRYABLE.has(res.status) || attempt === 3) return res;
    await new Promise((resolve) => setTimeout(resolve, 500 * 2 ** attempt));
  }
}
```
```python
def get_with_retries(request):
    for attempt in range(4):
        response = send(request)
        if response.status not in RETRYABLE or attempt == 3:
            return response
        time.sleep(0.5 * 2 ** attempt)
```
:::

Transient failures are routine at scale: a deploy restarts a server, a load balancer sheds traffic, a rate limit kicks in. Retry them with **exponential backoff**, waiting 0.5 s, then 1, 2, 4..., so a struggling server gets room to recover. Three rules keep retries from making things worse:

- **Retry only what can succeed next time:** connection errors, timeouts, `429 Too Many Requests` and the 5xx statuses that signal a temporary problem (`502`, `503`, `504`, and often `500`). A `400` or a `404` will fail again.
- **Retry only idempotent requests** (GET, PUT, DELETE) unless the API supports idempotency keys. A `POST /payments` that timed out may have succeeded.
- **Add jitter.** If a thousand clients back off on the same schedule, they all come back at the same instant. "Full jitter" sleeps a random time between zero and the backoff, `sleep(random.uniform(0, delay))`, and a `Retry-After` header from the server beats any schedule.

The trick that makes retry logic testable is the same as for the transport: **inject `sleep`**. Pass `sleep=delays.append` and a test runs instantly and can assert the exact schedule.

```python run
from dataclasses import dataclass, field

@dataclass
class Response:
    status: int
    headers: dict = field(default_factory=dict)

RETRYABLE = {429, 500, 502, 503, 504}

def with_retries(send, *, attempts=4, base_delay=0.5, sleep):
    for attempt in range(attempts):
        response = send()
        if response.status not in RETRYABLE or attempt == attempts - 1:
            return response
        sleep(base_delay * 2 ** attempt)

replies = iter([Response(503), Response(502), Response(200)])
delays = []
response = with_retries(lambda: next(replies), sleep=delays.append)
print(response.status, delays)
```

:::gotcha `requests.ConnectionError` isn't a `ConnectionError`
The built-in `ConnectionError` is what raw sockets raise, and the challenge below uses it. requests defines its own `requests.ConnectionError`, which is **not** a subclass of the built-in one, so `except ConnectionError:` lets it through. With requests, catch `requests.ConnectionError` and `requests.Timeout`. With httpx, catch `httpx.TransportError`.
:::

In production code, the **tenacity** package is the p-retry of Python, and requests can retry at the transport level through urllib3's `Retry` class mounted on a `Session`:

```python
import httpx
from tenacity import retry, retry_if_exception_type, stop_after_attempt, wait_random_exponential

@retry(
    retry=retry_if_exception_type(httpx.TransportError),     # network failures only
    wait=wait_random_exponential(multiplier=0.5, max=30),    # backoff with full jitter
    stop=stop_after_attempt(4),
)
def fetch_report(client, report_id):
    response = client.get(f"/reports/{report_id}")
    response.raise_for_status()
    return response.json()
```

:::quiz
Each of these requests times out before any response arrives. Which one is risky to retry automatically?

- [ ] `GET /orders/42`
- [ ] `PUT /orders/42` with the complete order
- [ ] `DELETE /orders/42`
- [x] `POST /orders`

GET, PUT and DELETE are idempotent: sending them twice leaves the server in the same state as sending them once. A POST that timed out may have created the order just before the connection dropped, so a blind retry can create a second one. APIs that need safe POST retries accept an `Idempotency-Key` header, a convention popularised by Stripe.
:::

## Pagination with generators

:::compare
```js
async function* allOrders(url) {
  while (url) {
    const page = await (await fetch(url)).json();
    yield* page.items;
    url = page.next;
  }
}

for await (const order of allOrders("/orders?page=1")) { /* ... */ }
```
```python
def all_orders(url):
    while url:
        page = get_json(url)
        yield from page["items"]
        url = page["next"]

for order in all_orders("/orders?page=1"): ...
```
:::

A paginated endpoint is a lazy sequence, and a generator is the natural way to expose one ([Generators](lesson:iterators-and-generators#laziness-and-infinite-generators)). Callers iterate over orders and never see pages. Because a generator only runs when asked for its next value, page 3 is fetched only if the loop gets that far: `break` early, or take the first N with `itertools.islice`, and the remaining requests never happen. This is the sync twin of the JS async generator. With httpx's `AsyncClient` you'd write `async def` plus `yield` and consume it with `async for` ([Async](lesson:async#async-for-and-async-with)).

```python run
from itertools import islice

PAGES = {
    "/orders?page=1": {"items": ["A1", "A2", "A3"], "next": "/orders?page=2"},
    "/orders?page=2": {"items": ["B1", "B2", "B3"], "next": "/orders?page=3"},
    "/orders?page=3": {"items": ["C1"], "next": None},
}
fetched = []

def get_json(url):                     # the fake transport
    fetched.append(url)
    return PAGES[url]

def iter_orders(url="/orders?page=1"):
    while url:
        page = get_json(url)
        yield from page["items"]
        url = page["next"]

print(list(islice(iter_orders(), 4)))
print(fetched)
```

:::pythonic Return an iterator, not a list
A client method that collects every page into a list makes callers wait for, and hold, the entire result set. Yield items instead, and let the caller choose: `list(client.orders())` for everything, `next(...)` for the first match, `islice` for a preview.
:::

:::quiz output
What does this print?

```python
fetched = []

def pages():
    for n in (1, 2, 3):
        fetched.append(n)
        yield [n * 10, n * 10 + 1]

def items():
    for page in pages():
        yield from page

first = next(items())
print(first, fetched)
```

- [x] `10 [1]`
- [ ] `10 [1, 2, 3]`
- [ ] `10 []`
- [ ] `[10, 11] [1]`

Generators run only as far as the next `yield`. Asking for the first item runs `pages()` up to its first `yield`, which appends `1`. Pages 2 and 3 are never "fetched".
:::

## Rate limits and the `Link` header

:::compare
```js
// Link: <https://api.example.com/issues?page=3>; rel="next", <...>; rel="last"
const LINK = /<([^>]*)>\s*;\s*rel="([^"]*)"/g;
const matches = res.headers.get("link").matchAll(LINK);
const links = Object.fromEntries([...matches].map(([, url, rel]) => [rel, url]));
const wait = Number(res.headers.get("retry-after") ?? 1);
```
```python
# Link: <https://api.example.com/issues?page=3>; rel="next", <...>; rel="last"
LINK = re.compile(r'<([^>]*)>\s*;\s*rel="([^"]*)"')
matches = LINK.findall(res.headers["link"])            # [(url, rel), ...]
links = {rel: url for url, rel in matches}
wait = int(res.headers.get("retry-after", 1))
```
:::

Many APIs, GitHub's among them, put pagination in a `Link` header instead of the body. requests and httpx parse it for you into `res.links` (`res.links["next"]["url"]`). With a raw transport, `re.findall` returns one `(url, rel)` tuple per link, and a dict comprehension flips them into `{rel: url}`. To read a value back out of one of those URLs, such as the page count in the `last` link, take it apart with `urlsplit` and `parse_qs`.

Rate-limited APIs answer `429 Too Many Requests` with a `Retry-After` header that holds either a number of seconds or an HTTP date, which `email.utils.parsedate_to_datetime` parses. Many also report your remaining budget on every response, in headers such as `X-RateLimit-Remaining` and `X-RateLimit-Reset` (a Unix timestamp on GitHub), so a well-behaved client can slow down before it gets rejected.

```python run
import re
from datetime import datetime, timezone
from email.utils import parsedate_to_datetime
from urllib.parse import parse_qs, urlsplit

LINK = re.compile(r'<([^>]*)>\s*;\s*rel="([^"]*)"')

def parse_links(header):
    return {rel: url for url, rel in LINK.findall(header)}

header = ('<https://api.example.com/issues?page=3&per_page=50>; rel="next", '
          '<https://api.example.com/issues?page=9&per_page=50>; rel="last"')
links = parse_links(header)
print(links["next"], links.get("prev"))
print("pages:", parse_qs(urlsplit(links["last"]).query)["page"][0])

def retry_after(value, now):
    if value.isdigit():
        return int(value)
    return max(0.0, (parsedate_to_datetime(value) - now).total_seconds())

now = datetime(2024, 6, 1, 12, 0, tzinfo=timezone.utc)
print(retry_after("120", now), retry_after("Sat, 01 Jun 2024 12:00:30 GMT", now))
```

:::tip Inject the clock too
`retry_after` takes `now` as an argument instead of calling `datetime.now()` itself, for the same reason the retry loop takes `sleep`: a test can pin the time and get the same answer on every run ([Dates & Times](lesson:dates-and-times)).
:::

## Serving APIs: FastAPI and Flask vs Express

:::compare
```js
import express from "express";

const app = express();
app.use(express.json());

app.get("/todos/:id", (req, res) => {
  const todo = todos.get(Number(req.params.id));
  if (!todo) return res.status(404).json({ error: "not found" });
  res.json(todo);
});

app.post("/todos", (req, res) => {
  if (typeof req.body.title !== "string") return res.status(422).end();
  res.status(201).json(addTodo(req.body.title));
});

app.listen(8000);
```
```python
from fastapi import FastAPI, HTTPException
from pydantic import BaseModel

app = FastAPI()

class NewTodo(BaseModel):
    title: str

@app.get("/todos/{todo_id}")
def get_todo(todo_id: int) -> dict:
    if todo_id not in TODOS:
        raise HTTPException(status_code=404, detail="not found")
    return TODOS[todo_id]

@app.post("/todos", status_code=201)
def create_todo(todo: NewTodo) -> dict:
    return add_todo(todo.title)

# run it: uvicorn main:app --reload
```
:::

FastAPI reads your type hints. `todo_id: int` is parsed from the path and rejected with a `422` if it isn't a number, and the `NewTodo` pydantic model validates the JSON body, so the hand-written `typeof` checks disappear ([pydantic ≈ zod](lesson:type-hints#runtime-validation-pydantic-zod)). Returning a dict sends JSON, and interactive OpenAPI docs appear at `/docs` for free. Handlers can be plain `def` (FastAPI runs them in a thread pool) or `async def` (they run on the event loop, so they must never block). An ASGI server such as uvicorn runs the app, much as Node's `http` module sits under Express.

```python
from flask import Flask, abort, request

app = Flask(__name__)

@app.get("/todos/<int:todo_id>")
def get_todo(todo_id):
    if todo_id not in TODOS:
        abort(404)
    return TODOS[todo_id]                  # a dict becomes a JSON response

@app.post("/todos")
def create_todo():
    return add_todo(request.get_json()["title"]), 201

# run it: flask --app main run --debug
```

Flask is the older, smaller, synchronous option, and closer to Express in spirit: decorators register routes, `request` is a context-local global, and validation is up to you. Flask apps speak WSGI and run under a server such as gunicorn in production. Django, usually with Django REST Framework, is the batteries-included choice, closer to NestJS. And for serving a folder of static files during development, `python -m http.server 8000` is `npx serve`.

## Cheat sheet

| JavaScript | Python | Notes |
| --- | --- | --- |
| `await fetch(url)` | `httpx.get(url)`, `requests.get(url, timeout=10)` | blocking; always set a timeout |
| `await res.json()` | `res.json()` | |
| `res.ok` | `res.is_success` (httpx), `res.ok` (requests) | requests' `ok` means "below 400" |
| axios rejecting on errors | `res.raise_for_status()` | 4xx and 5xx don't raise by default |
| `axios.create({ baseURL })` | `httpx.Client(base_url=...)` | reuse it: connection pooling |
| `Promise.all(urls.map(fetch))` | `await asyncio.gather(*(client.get(u) for u in urls))` | with `httpx.AsyncClient` |
| `encodeURIComponent(s)` | `quote(s, safe="")` | plain `quote(s)` keeps `/` |
| `new URLSearchParams(p)` | `urlencode(p, doseq=True)` | `True` becomes `"True"`: convert first |
| `new URL(path, base)` | `urljoin(base, path)` | mind the trailing slash |
| `res.status === 404` | `res.status_code == HTTPStatus.NOT_FOUND` | an `IntEnum` |
| an injectable `fetch` | a transport callable, `Request -> Response` | pass a fake in tests |
| p-retry | a loop with an injected `sleep`, or tenacity | backoff plus jitter |
| `async function*` over pages | a generator with `yield from` | lazy: unused pages aren't fetched |
| parse-link-header | `res.links`, or `re.findall` | |
| Express | FastAPI (ASGI), Flask (WSGI) | |

## Challenges

:::challenge id=http-api-url title="Build an API URL" difficulty=easy
Write `api_url(base, *segments, **params)` that builds a request URL:

- Each path segment is converted with `str()`, percent-encoded **including** any `/`, and joined to `base` with exactly one `/`, whether or not `base` ends with one.
- Query parameters keep their order. `None` values are left out, booleans become `true` and `false`, a list repeats its key, and everything is encoded the way `urlencode` does it (spaces become `+`).
- When no parameters are left, there's no `?` at all.

```text
api_url("https://api.example.com/v1/", "users", "ada lovelace", "repos", sort="stars", fork=False, topic=None)
  ->  "https://api.example.com/v1/users/ada%20lovelace/repos?sort=stars&fork=false"
```

```js
function apiUrl(base, segments, params = {}) {
  const path = segments.map((s) => "/" + encodeURIComponent(String(s))).join("");
  const url = new URL(base.replace(/\/+$/, "") + path);
  for (const [key, value] of Object.entries(params)) {
    if (value === null || value === undefined) continue;
    for (const v of [value].flat()) url.searchParams.append(key, String(v));
  }
  return url.href;
}
```

```python starter
from urllib.parse import quote, urlencode

def api_url(base, *segments, **params):
    ...
```

```python solution
from urllib.parse import quote, urlencode

def api_url(base, *segments, **params):
    url = base.rstrip("/")
    for segment in segments:
        url += "/" + quote(str(segment), safe="")
    query = {
        key: str(value).lower() if isinstance(value, bool) else value
        for key, value in params.items()
        if value is not None
    }
    return f"{url}?{urlencode(query, doseq=True)}" if query else url
```

```python tests
BASE = "https://api.example.com/v1"

@test("joins the base and the path segments")
def _():
    eq(api_url(BASE, "users", "ada", "repos"), "https://api.example.com/v1/users/ada/repos")

@test("a trailing slash on the base doesn't double up")
def _():
    eq(api_url(BASE + "/", "users"), "https://api.example.com/v1/users")

@test("encodes each segment, slashes included")
def _():
    eq(api_url(BASE, "files", "reports/2024 Q1.pdf"), "https://api.example.com/v1/files/reports%2F2024%20Q1.pdf")

@test("segments can be numbers")
def _():
    eq(api_url(BASE, "users", 42), "https://api.example.com/v1/users/42")

@test("adds query parameters in order, encoded like urlencode")
def _():
    eq(api_url(BASE, "search", q="red shoes & socks", page=2), "https://api.example.com/v1/search?q=red+shoes+%26+socks&page=2")

@test("leaves out None parameters")
def _():
    eq(api_url(BASE, "search", q="boots", sort=None), "https://api.example.com/v1/search?q=boots")
    eq(api_url(BASE, "search", sort=None), "https://api.example.com/v1/search")

@test("sends booleans as true and false")
def _():
    eq(api_url(BASE, "repos", fork=False, archived=True), "https://api.example.com/v1/repos?fork=false&archived=true")

@test("0 and empty strings are real values")
def _():
    eq(api_url(BASE, "items", offset=0, q=""), "https://api.example.com/v1/items?offset=0&q=")

@test("a list value repeats the key")
def _():
    eq(api_url(BASE, "issues", label=["bug", "ui"]), "https://api.example.com/v1/issues?label=bug&label=ui")

@test("no segments: just the base")
def _():
    eq(api_url(BASE + "/"), "https://api.example.com/v1")
    eq(api_url(BASE, page=1), "https://api.example.com/v1?page=1")
```

```hint
`quote(str(segment), safe="")` encodes a segment the way `encodeURIComponent` does. Strip trailing slashes from the base with `base.rstrip("/")` and add one `/` before each segment.
```

```hint
Filter the parameters with `if value is not None`, not `if value`: `0` and `""` are real values. Check for booleans with `isinstance(value, bool)` and turn them into `"true"` or `"false"`.
```

```hint
`urlencode(query, doseq=True)` repeats the key for each item of a list. Only add `"?" + ...` when the filtered dict isn't empty.
```
:::

:::challenge id=http-retry title="Retry with backoff" difficulty=medium
Write `send_with_retries(send, request, *, attempts=4, base_delay=0.5, sleep=time.sleep)`:

- Call `send(request)`. It returns a response with `.status` (an int) and `.headers` (a dict with lowercase names), or raises `ConnectionError` when the network fails.
- Retry when the status is in `RETRYABLE` or when `send` raises `ConnectionError`. Return any other response at once, success or not.
- Before retry number *n* (counting from 0), call `sleep(base_delay * 2 ** n)`: 0.5, 1, then 2 seconds by default. If the response had a `retry-after` header, sleep that many seconds instead (it holds a whole number).
- Make at most `attempts` calls in total. When they're used up, return the last response or re-raise the last `ConnectionError`. Never sleep after the final attempt.

The tests pass a fake `send` and a `sleep` that just records its argument, so they run instantly.

```js
async function sendWithRetries(send, request, { attempts = 4, baseDelay = 0.5, sleep } = {}) {
  for (let attempt = 0; ; attempt++) {
    const last = attempt === attempts - 1;
    let delay = baseDelay * 2 ** attempt;
    try {
      const res = await send(request);
      if (!RETRYABLE.has(res.status) || last) return res;
      if (res.headers["retry-after"]) delay = Number(res.headers["retry-after"]);
    } catch (err) {
      if (last) throw err;
    }
    await sleep(delay);
  }
}
```

```python starter
import time

RETRYABLE = {429, 500, 502, 503, 504}

def send_with_retries(send, request, *, attempts=4, base_delay=0.5, sleep=time.sleep):
    return send(request)
```

```python solution
import time

RETRYABLE = {429, 500, 502, 503, 504}

def send_with_retries(send, request, *, attempts=4, base_delay=0.5, sleep=time.sleep):
    for attempt in range(attempts):
        final = attempt == attempts - 1
        delay = base_delay * 2 ** attempt
        try:
            response = send(request)
        except ConnectionError:
            if final:
                raise
        else:
            if response.status not in RETRYABLE or final:
                return response
            if "retry-after" in response.headers:
                delay = int(response.headers["retry-after"])
        sleep(delay)
```

```python tests
from dataclasses import dataclass, field

@dataclass
class FakeResponse:
    status: int
    headers: dict = field(default_factory=dict)

def scripted(*outcomes):
    """A fake send(): returns (or raises) each outcome in turn and records the requests."""
    queue, calls = list(outcomes), []
    def send(request):
        calls.append(request)
        outcome = queue.pop(0)
        if isinstance(outcome, Exception):
            raise outcome
        return outcome
    return send, calls

@test("returns a success at once, without sleeping")
def _():
    send, calls = scripted(FakeResponse(200))
    delays = []
    eq(send_with_retries(send, "GET /", sleep=delays.append).status, 200)
    eq((len(calls), delays), (1, []))

@test("retries a 503, then returns the success")
def _():
    send, calls = scripted(FakeResponse(503), FakeResponse(200))
    delays = []
    eq(send_with_retries(send, "GET /", sleep=delays.append).status, 200)
    eq(delays, [0.5])

@test("backs off exponentially")
def _():
    send, calls = scripted(FakeResponse(502), FakeResponse(503), FakeResponse(504), FakeResponse(200))
    delays = []
    send_with_retries(send, "GET /", sleep=delays.append)
    eq(delays, [0.5, 1.0, 2.0])

@test("gives up after `attempts` calls and returns the last response")
def _():
    send, calls = scripted(*[FakeResponse(503)] * 5)
    delays = []
    response = send_with_retries(send, "GET /", attempts=3, sleep=delays.append)
    eq((response.status, len(calls)), (503, 3))
    eq(delays, [0.5, 1.0], "never sleep after the final attempt")

@test("doesn't retry other statuses")
def _():
    for status in (400, 401, 404, 422):
        send, calls = scripted(FakeResponse(status), FakeResponse(200))
        eq(send_with_retries(send, "GET /", sleep=lambda seconds: None).status, status)
        eq(len(calls), 1, f"a {status} should be returned, not retried")

@test("honours a retry-after header")
def _():
    send, calls = scripted(FakeResponse(429, {"retry-after": "3"}), FakeResponse(200))
    delays = []
    send_with_retries(send, "GET /", sleep=delays.append)
    eq(delays, [3])

@test("retries connection errors, and re-raises the last one")
def _():
    send, calls = scripted(ConnectionError("reset"), FakeResponse(200))
    eq(send_with_retries(send, "GET /", sleep=lambda seconds: None).status, 200)
    send, calls = scripted(*[ConnectionError(f"try {i}") for i in range(4)])
    error = raises(ConnectionError, send_with_retries, send, "GET /", sleep=lambda seconds: None)
    eq((str(error), len(calls)), ("try 3", 4))

@test("sends the same request each time and scales with base_delay")
def _():
    send, calls = scripted(FakeResponse(500), FakeResponse(500), FakeResponse(200))
    delays = []
    send_with_retries(send, {"url": "/x"}, base_delay=2, sleep=delays.append)
    eq(calls, [{"url": "/x"}] * 3)
    eq(delays, [2, 4])
```

```hint
Loop with `for attempt in range(attempts):` and work out `final = attempt == attempts - 1` up front. Return (or re-raise) on the final attempt instead of sleeping.
```

```hint
`try: response = send(request)` / `except ConnectionError:` / `else:` keeps the two failure kinds apart. A bare `raise` inside the `except` block re-raises the current error unchanged.
```

```hint
Compute the default `delay = base_delay * 2 ** attempt`, overwrite it with `int(response.headers["retry-after"])` when that header is present, then call `sleep(delay)` at the bottom of the loop.
```
:::

:::challenge id=http-paginate title="Follow the Link header" difficulty=medium
Write a generator `iter_items(get, url)` that yields every item of a paginated collection:

- `get(url)` performs a GET and returns a response with `.status`, `.headers` (a dict with lowercase names) and `.json()`, which returns the page's items as a list.
- Yield the items in order, then follow the URL marked `rel="next"` in the `link` header. Stop when a page has no `next` link, or no `link` header at all. Other rels (`prev`, `first`, `last`) can appear in any order.
- Be lazy: don't fetch a page until the consumer asks for one of its items.
- A non-2xx response raises `PageError`.

```text
link: <https://api.example.com/orders?page=2>; rel="next", <https://api.example.com/orders?page=5>; rel="last"
```

```js
async function* iterItems(get, url) {
  while (url) {
    const res = await get(url);
    if (res.status < 200 || res.status > 299) throw new PageError(url);
    yield* await res.json();
    const links = [...(res.headers.link ?? "").matchAll(/<([^>]*)>\s*;\s*rel="([^"]*)"/g)];
    url = links.find(([, , rel]) => rel === "next")?.[1];
  }
}
```

```python starter
import re

class PageError(Exception):
    """A page came back with a non-2xx status."""

def iter_items(get, url):
    ...
```

```python solution
import re

LINK = re.compile(r'<([^>]*)>\s*;\s*rel="([^"]*)"')

class PageError(Exception):
    """A page came back with a non-2xx status."""

def next_url(link_header):
    links = {rel: url for url, rel in LINK.findall(link_header)}
    return links.get("next")

def iter_items(get, url):
    while url:
        response = get(url)
        if not 200 <= response.status < 300:
            raise PageError(f"GET {url} returned {response.status}")
        yield from response.json()
        url = next_url(response.headers.get("link", ""))
```

```python tests
from dataclasses import dataclass, field
from itertools import islice

@dataclass
class FakeResponse:
    status: int
    items: list = field(default_factory=list)
    headers: dict = field(default_factory=dict)

    def json(self):
        return self.items

def link(**rels):
    return ", ".join(f'<{url}>; rel="{rel}"' for rel, url in rels.items())

def fake_api(pages):
    """A fake get(url) over {url: FakeResponse}, plus the list of URLs it fetched."""
    fetched = []
    def get(url):
        fetched.append(url)
        return pages[url]
    return get, fetched

THREE_PAGES = {
    "/orders": FakeResponse(200, [1, 2], {"link": link(next="/orders?page=2", last="/orders?page=3")}),
    "/orders?page=2": FakeResponse(200, [3, 4], {"link": link(prev="/orders", next="/orders?page=3")}),
    "/orders?page=3": FakeResponse(200, [5], {"link": link(first="/orders", prev="/orders?page=2")}),
}

@test("a single page without a link header")
def _():
    get, fetched = fake_api({"/tags": FakeResponse(200, ["bug", "ui"])})
    eq(list(iter_items(get, "/tags")), ["bug", "ui"])

@test("follows rel=next across pages, in order")
def _():
    get, fetched = fake_api(THREE_PAGES)
    eq(list(iter_items(get, "/orders")), [1, 2, 3, 4, 5])
    eq(fetched, ["/orders", "/orders?page=2", "/orders?page=3"])

@test("is lazy: fetches a page only when its items are needed")
def _():
    get, fetched = fake_api(THREE_PAGES)
    items = iter_items(get, "/orders")
    eq(fetched, [], "nothing should be fetched before the first item is requested")
    eq(list(islice(items, 3)), [1, 2, 3])
    eq(fetched, ["/orders", "/orders?page=2"])

@test("ignores the other rels, whatever their order")
def _():
    pages = {
        "/p1": FakeResponse(200, [1], {"link": link(last="/p9", next="/p2")}),
        "/p2": FakeResponse(200, [2], {"link": link(first="/p1", last="/p9")}),
    }
    get, fetched = fake_api(pages)
    eq(list(iter_items(get, "/p1")), [1, 2])

@test("an empty page with a next link keeps going")
def _():
    pages = {
        "/p1": FakeResponse(200, [], {"link": link(next="/p2")}),
        "/p2": FakeResponse(200, ["late"]),
    }
    get, fetched = fake_api(pages)
    eq(list(iter_items(get, "/p1")), ["late"])

@test("a failing page raises PageError")
def _():
    pages = {
        "/p1": FakeResponse(200, [1], {"link": link(next="/p2")}),
        "/p2": FakeResponse(503),
    }
    get, fetched = fake_api(pages)
    items = iter_items(get, "/p1")
    eq(next(items), 1)
    raises(PageError, next, items)
```

```hint
A function containing `yield` is a generator: calling it runs nothing until the first `next()`. Loop `while url:`, fetch the page, then `yield from response.json()`.
```

```hint
`re.findall(r'<([^>]*)>\s*;\s*rel="([^"]*)"', header)` returns `(url, rel)` tuples. Turn them into `{rel: url}` and `.get("next")`, which gives `None` and ends the loop when there's no next page.
```

```hint
A missing header is `response.headers.get("link", "")`, and `findall` on an empty string returns `[]`. Check `200 <= response.status < 300` before yielding anything.
```
:::

:::challenge id=http-todo-client title="A testable API client" difficulty=hard
Finish `TodoClient`, a small client for a JSON API. The constructor receives a **transport**: a callable that takes a `Request` and returns a `Response` (both defined in the starter). The tests pass a fake that records every request.

- Every request carries the headers `authorization: Bearer <token>` and `accept: application/json`, with lowercase names. `base_url` may end with a slash.
- `get(todo_id)` sends `GET {base_url}/todos/{todo_id}` and returns the decoded JSON.
- `create(title, *, tags=())` sends `POST {base_url}/todos` with the JSON body `{"title": ..., "tags": [...]}`, encoded as UTF-8 bytes, plus a `content-type: application/json` header. It returns the decoded JSON of the reply.
- `delete(todo_id)` sends `DELETE {base_url}/todos/{todo_id}` and returns `None`. The server answers `204` with an empty body.
- Any status of 400 or more raises `ApiError(status, message)`, or `NotFound` for a 404. The message is the `"error"` field when the body is a JSON object that has one. Otherwise it's the standard reason phrase, such as `"Service Unavailable"`.

```js
class TodoClient {
  constructor(transport, baseUrl, token) { /* ... */ }
  async get(id) { return this.#send("GET", `/todos/${id}`); }
  async create(title, { tags = [] } = {}) { return this.#send("POST", "/todos", { title, tags }); }
  async delete(id) { await this.#send("DELETE", `/todos/${id}`); }
}
```

```python starter
import json
from dataclasses import dataclass, field
from http import HTTPStatus

@dataclass(frozen=True)
class Request:
    method: str
    url: str
    headers: dict[str, str] = field(default_factory=dict)
    body: bytes | None = None

@dataclass(frozen=True)
class Response:
    status: int
    body: bytes = b""

class ApiError(Exception):
    def __init__(self, status, message):
        super().__init__(f"{status} {message}")
        self.status = status
        self.message = message

class NotFound(ApiError):
    pass

class TodoClient:
    def __init__(self, transport, base_url, token):
        ...

    def get(self, todo_id):
        ...

    def create(self, title, *, tags=()):
        ...

    def delete(self, todo_id):
        ...
```

```python solution
import json
from dataclasses import dataclass, field
from http import HTTPStatus

@dataclass(frozen=True)
class Request:
    method: str
    url: str
    headers: dict[str, str] = field(default_factory=dict)
    body: bytes | None = None

@dataclass(frozen=True)
class Response:
    status: int
    body: bytes = b""

class ApiError(Exception):
    def __init__(self, status, message):
        super().__init__(f"{status} {message}")
        self.status = status
        self.message = message

class NotFound(ApiError):
    pass

class TodoClient:
    def __init__(self, transport, base_url, token):
        self.transport = transport
        self.base_url = base_url.rstrip("/")
        self.headers = {"authorization": f"Bearer {token}", "accept": "application/json"}

    def get(self, todo_id):
        return self._send("GET", f"/todos/{todo_id}")

    def create(self, title, *, tags=()):
        return self._send("POST", "/todos", {"title": title, "tags": list(tags)})

    def delete(self, todo_id):
        self._send("DELETE", f"/todos/{todo_id}")

    def _send(self, method, path, payload=None):
        headers, body = dict(self.headers), None
        if payload is not None:
            headers["content-type"] = "application/json"
            body = json.dumps(payload).encode("utf-8")
        response = self.transport(Request(method, self.base_url + path, headers, body))
        if response.status >= 400:
            raise _error_for(response)
        return json.loads(response.body) if response.body else None

def _error_for(response):
    try:
        message = json.loads(response.body)["error"]
    except (ValueError, KeyError, TypeError):   # not JSON, no "error" key, or not an object
        message = HTTPStatus(response.status).phrase
    error_type = NotFound if response.status == HTTPStatus.NOT_FOUND else ApiError
    return error_type(response.status, message)
```

```python tests
import json

class FakeServer:
    """A recording transport that answers with the given responses, in order."""
    def __init__(self, *responses):
        self.responses = list(responses)
        self.requests = []

    def __call__(self, request):
        self.requests.append(request)
        return self.responses.pop(0)

def reply(payload, status=200):
    return Response(status, json.dumps(payload).encode())

def client_for(server, base_url="https://api.example.com"):
    return TodoClient(server, base_url, token="s3cret")

@test("get() sends an authenticated GET and returns the JSON")
def _():
    server = FakeServer(reply({"id": 7, "title": "Ship it"}))
    eq(client_for(server).get(7), {"id": 7, "title": "Ship it"})
    request = server.requests[0]
    eq((request.method, request.url), ("GET", "https://api.example.com/todos/7"))
    eq(request.headers.get("authorization"), "Bearer s3cret")
    eq(request.headers.get("accept"), "application/json")

@test("a trailing slash on base_url doesn't double up")
def _():
    server = FakeServer(reply({"id": 1}))
    client_for(server, "https://api.example.com/v2/").get(1)
    eq(server.requests[0].url, "https://api.example.com/v2/todos/1")

@test("create() POSTs a JSON body as bytes")
def _():
    server = FakeServer(reply({"id": 8, "title": "Write tests", "tags": ["dev"]}, status=201))
    eq(client_for(server).create("Write tests", tags=("dev",)), {"id": 8, "title": "Write tests", "tags": ["dev"]})
    request = server.requests[0]
    eq((request.method, request.url), ("POST", "https://api.example.com/todos"))
    eq(request.headers.get("content-type"), "application/json")
    eq(request.headers.get("authorization"), "Bearer s3cret")
    check(isinstance(request.body, bytes), "the body should be bytes: encode the JSON text")
    eq(json.loads(request.body), {"title": "Write tests", "tags": ["dev"]})

@test("create() without tags sends an empty list")
def _():
    server = FakeServer(reply({"id": 9}, status=201))
    client_for(server).create("Crème brûlée")
    eq(json.loads(server.requests[0].body), {"title": "Crème brûlée", "tags": []})

@test("delete() sends a DELETE and returns None for a 204")
def _():
    server = FakeServer(Response(204))
    eq(client_for(server).delete(3), None)
    eq((server.requests[0].method, server.requests[0].url), ("DELETE", "https://api.example.com/todos/3"))

@test("a 404 raises NotFound, an ApiError, with the server's message")
def _():
    server = FakeServer(Response(404, b'{"error": "todo 99 not found"}'))
    error = raises(NotFound, client_for(server).get, 99)
    check(isinstance(error, ApiError), "NotFound should be a subclass of ApiError")
    eq((error.status, error.message), (404, "todo 99 not found"))

@test("other errors raise ApiError with their status")
def _():
    server = FakeServer(Response(422, b'{"error": "title is required"}'))
    error = raises(ApiError, client_for(server).create, "")
    check(not isinstance(error, NotFound), "only a 404 is NotFound")
    eq((error.status, error.message), (422, "title is required"))

@test("falls back to the reason phrase when there's no JSON error message")
def _():
    for body in (b"<html>Bad gateway</html>", b"", b'["oops"]', b'{"detail": "busy"}'):
        server = FakeServer(Response(503, body))
        error = raises(ApiError, client_for(server).get, 1)
        eq(error.message, "Service Unavailable", f"for the body {body!r}")
```

```hint
Put the shared work in one private method, say `_send(method, path, payload=None)`: build the headers and the body, call `self.transport(Request(...))`, check the status, and decode the reply. The three public methods become one-liners.
```

```hint
`json.dumps(payload).encode("utf-8")` gives the body bytes. An empty reply body (the `204`) has nothing to decode, so return `None` for it.
```

```hint
For the error message, try `json.loads(response.body)["error"]` and catch `ValueError` (not JSON), `KeyError` (no `"error"` field) and `TypeError` (JSON that isn't an object). Fall back to `HTTPStatus(response.status).phrase`, and pick `NotFound` or `ApiError` by the status.
```
:::
