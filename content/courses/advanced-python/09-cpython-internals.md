---
title: CPython Internals: Memory & Execution
part: Runtime & Concurrency
summary: Refcounting, cycles, weakrefs, object sizes, bytecode, the GIL, and the WebAssembly build running this page.
minutes: 40
---

V8 hides its machinery. A tracing garbage collector frees objects whenever it decides to, and a stack of JIT tiers decides how your code actually runs. CPython is simpler and far more visible. Every object carries a reference count and is freed the moment that count reaches zero. A separate collector cleans up reference cycles. Functions compile to bytecode that an adaptive interpreter specialises as it runs. And on the default build, a global lock lets only one thread execute that bytecode at a time.

Knowing the machine explains a lot of Python folklore: why files close themselves, why `is` lies about numbers, what `__slots__` actually saves, and why threads don't speed up pure-Python loops. Everything here runs on Pyodide, which is CPython 3.14 compiled to WebAssembly. A few numbers differ from your laptop's, and [the last section](#this-page-runs-cpython-on-webassembly) explains why.

## Reference counting: objects die on time

:::compare
```js
const registry = new FinalizationRegistry((name) => {
  console.log(`${name} collected`);   // later, or never
});

let log = openLog("app.log");
registry.register(log, "app.log");
log = null;
console.log("dropped");               // always printed first
```
```python run
class LogFile:
    def __init__(self, name):
        self.name = name

    def __del__(self):
        print(f"{self.name} collected")

log = LogFile("app.log")
log = None            # the count hits zero: freed right here
print("dropped")
```
:::

Every CPython object starts with two fields: a reference count and a pointer to its type. Binding a name, storing the object in a list or passing it to a function adds a reference. Rebinding the name, removing it from the list or returning from the function drops one. When the count reaches zero, CPython frees the object on the spot and runs its `__del__` method, if it has one. A JavaScript engine traces reachability every so often instead, so you never know when, or whether, a `FinalizationRegistry` callback will fire.

That's why `open("notes.txt").read()` doesn't leak a file handle in CPython, and why memory comes back steadily instead of in collector pauses. `sys.getrefcount()` lets you watch the count move:

```python run
import sys

class Cart:
    pass

cart = Cart()
before = sys.getrefcount(cart)
carts = [cart, cart, cart]       # three more references
alias = cart                     # and one more
print(sys.getrefcount(cart) - before)
del carts                        # the list dies and releases its three
print(sys.getrefcount(cart) - before)
print(sys.getrefcount(None))     # immortal: a huge, fixed number
```

:::gotcha Read refcounts as differences
`getrefcount` traditionally reports one more than you'd expect, because its own argument is a reference. In 3.14 that's no longer reliable: the interpreter skips reference-count updates it can prove are unnecessary, so the same call can print 1 inside a function and 2 at module level. Compare counts with each other and ignore the absolute numbers.
:::

:::deep Immortal objects
Since 3.12 (PEP 683), objects such as `None`, `True`, `False`, the small integers and the empty tuple are *immortal*. Their count is pinned to a huge value and never changes, so code that touches `None` in every function call never writes to its memory. That avoids cache-line traffic between cores, simplifies the free-threaded build, and stops pre-fork servers' shared memory pages from being copied just because a child process read `None`. 3.14 adds `sys._is_immortal(obj)` to check.
:::

:::gotcha `__del__` is not a destructor you can plan around
CPython calls `__del__` when the count hits zero, but objects in a reference cycle wait for the cycle collector, exceptions raised inside `__del__` are printed and ignored, and PyPy, which uses a tracing collector like V8's, runs it whenever its collector gets around to it. Close resources with `with` (see [Context Managers](lesson:context-managers)), and use `weakref.finalize` ([below](#weak-references)) for "when this object goes away" hooks.
:::

:::quiz output
What does this print?

```python
class Temp:
    def __init__(self, name):
        self.name = name

    def __del__(self):
        print(f"del {self.name}", end=" ")

a = Temp("a")
b = a
del a
print("after-a", end=" ")
b = Temp("b")
del b
print("end")
```

- [ ] `del a after-a del b end`
- [x] `after-a del a del b end`
- [ ] `after-a end`
- [ ] `after-a del b end`

`del a` removes one of two references, so nothing is freed yet. Rebinding `b` drops the last reference to the first object, which is freed immediately, before the next line runs. `del b` then frees the second one.
:::

## Cycles and the garbage collector

:::compare
```js
const team = { name: "core" };
const lead = { name: "Ada", team };
team.lead = lead;              // a cycle

// Once nothing else points at them, mark-and-sweep
// finds both unreachable and frees them together.
```
```python
team = {"name": "core"}
lead = {"name": "Ada", "team": team}
team["lead"] = lead            # a cycle

# Each keeps the other's count at 1, so only the
# cycle collector (the gc module) can free them.
```
:::

Reference counting has one blind spot: in a cycle, every member keeps the next one's count above zero, long after the rest of the program has forgotten the lot. Cycles are common: parent pointers in trees, doubly linked lists, a callback stored on the object it closes over. So CPython also runs a cycle collector, exposed as the `gc` module. It only tracks *containers*, the objects that can hold references (lists, dicts, instances, functions). Ints and strings can't form cycles and are never tracked. When enough new containers have been allocated, the collector looks for groups of objects that are only reachable from each other, and frees them.

```python run
import gc

class Node:
    def __init__(self, name):
        self.name = name
        self.peer = None

    def __del__(self):
        print(f"freed {self.name}")

solo = Node("solo")
del solo                     # the count hits zero: freed at once

a, b = Node("a"), Node("b")
a.peer, b.peer = b, a        # a cycle
del a, b
print("cycle unreachable, not freed yet")
gc.collect()                 # run the collector now
print("after gc.collect()")
```

Since 3.4 (PEP 442), cycles whose members define `__del__` are collected like any other. Before that, they were parked in `gc.garbage` and leaked.

:::tip Weak back-pointers avoid the collector entirely
Make the back-pointer weak (a child's link to its parent, an observer's link to its subject) and there's no cycle: the whole structure dies by reference counting alone, deterministically, with no collector pass. `gc.collect()` returns the number of unreachable objects it found, and tests call it to make cleanup deterministic, as this lesson's challenges do.
:::

:::quiz output
What does this print?

```python
import gc
import weakref

class Node:
    pass

gc.disable()                 # pause automatic collection
a, b = Node(), Node()
a.peer, b.peer = b, a
probe = weakref.ref(a)
del a, b
print(probe() is None, end=" ")
gc.collect()                 # explicit collection still works
print(probe() is None)
gc.enable()
```

- [ ] `True True`
- [x] `False True`
- [ ] `False False`
- [ ] `True False`

The cycle keeps both counts at 1, so deleting the names frees nothing and the weak reference still resolves. `gc.collect()` finds the unreachable pair and frees it. `gc.disable()` only stops *automatic* collections, and it's here so that one can't sneak in between the two prints.
:::

:::note A 3.14 detour
3.14.0 through 3.14.4 shipped a new *incremental* collector with only two generations, young and old, to shorten pauses. After reports of significant memory pressure in production, 3.14.5 reverted to the generational collector from 3.13. This page's Pyodide is 3.14.2, so `gc.get_threshold()` here returns `(2000, 10, 0)`, where the last value means nothing. Treat the generations and thresholds as tuning knobs, not as behaviour to depend on.
:::

## Weak references

:::compare
```js
const cache = new Map();                 // id -> WeakRef
function getReport(id) {
  const hit = cache.get(id)?.deref();
  if (hit) return hit;
  const report = buildReport(id);
  cache.set(id, new WeakRef(report));    // dead entries pile up
  return report;
}
```
```python
import weakref

cache = weakref.WeakValueDictionary()    # id -> report, held weakly

def get_report(report_id):
    report = cache.get(report_id)
    if report is None:
        report = cache[report_id] = build_report(report_id)
    return report                         # dead entries remove themselves
```
:::

A weak reference points at an object without keeping it alive. `weakref.ref(obj)` is `new WeakRef(obj)`, and calling the ref is `deref()`: you get the object back, or `None` once it's gone. You rarely hold raw refs, though, because the weak containers do the bookkeeping. `WeakValueDictionary` suits caches and registries: an entry disappears when its value dies, so there are no stale `WeakRef`s to sweep out of a `Map`. `WeakKeyDictionary` is [the `WeakMap` equivalent](lesson:dicts#weakmap-weakkeydictionary) for attaching data to objects you don't own, and `WeakSet` is exactly what it sounds like.

The bigger difference is timing. A JS `WeakRef` target survives at least until the current job finishes, and nothing says when it's collected after that. A `FinalizationRegistry` callback may never run at all. In CPython, an object outside any cycle dies the moment its last strong reference goes, and its weak references die with it. `weakref.finalize(obj, fn, *args)` calls `fn(*args)` at most once: when `obj` is collected, or at interpreter exit if `obj` is still alive (unless you set `atexit=False`).

```python run
import weakref

class Report:
    def __init__(self, title):
        self.title = title

report = Report("Q3 revenue")
ref = weakref.ref(report)
done = weakref.finalize(report, print, "finalizer: report released")
print(ref().title, done.alive)

del report                 # the last strong reference
print(ref(), done.alive)
```

:::gotcha Not everything can be weakly referenced
`weakref.ref([])` raises `TypeError: cannot create weak reference to 'list' object`, and so do `dict`, `tuple`, `int`, `str`, `bytes` and `None`. Instances of your own classes work, and so do sets, functions and classes. Subclasses of `list` and `dict` work too, but subclasses of `int` and `tuple` don't. A class with `__slots__` needs `"__weakref__"` among its slots. JavaScript refuses primitives as `WeakRef` targets, but every JS object qualifies, so this list catches people out.
:::

:::gotcha `weakref.ref(obj.method)` dies instantly
Every `obj.method` access builds a fresh bound-method object (see [Attribute Lookup](lesson:attribute-lookup)), so a weak reference to one is dead as soon as the expression finishes. `weakref.WeakMethod` holds the instance and the function separately and rebuilds the bound method on demand. Event libraries that hold receivers weakly, such as blinker and Django's signals, rely on it.
:::

```python run
import weakref

class Cart:
    def on_change(self, event):
        print("cart saw", event)

cart = Cart()
plain = weakref.ref(cart.on_change)
method = weakref.WeakMethod(cart.on_change)
print(plain())                  # None: that bound method was temporary
method()("item added")          # rebuilt on demand
del cart
print(method())                 # None once the cart itself is gone
```

## How big is an object?

:::compare
```js
// No per-object API: take a heap snapshot in DevTools,
// or compare process.memoryUsage() before and after.
const before = process.memoryUsage().heapUsed;
const rows = Array.from({ length: 10_000 }, (_, id) => ({ id }));
console.log(process.memoryUsage().heapUsed - before);
```
```python
import sys
import tracemalloc

sys.getsizeof([1, 2, 3])               # one object, shallow
tracemalloc.start()
rows = [{"id": n} for n in range(10_000)]
print(tracemalloc.get_traced_memory())  # (current, peak) in bytes
tracemalloc.stop()
```
:::

`sys.getsizeof(obj)` is the size of one object: its header, its own storage, and the collector's bookkeeping. It doesn't follow references, so a list's size is a header plus one pointer per slot, whatever those pointers lead to. That matters more than it would in JS, because every Python value is a separate heap object. V8 stores small integers inside the pointer itself and keeps arrays of doubles unboxed. A CPython list of 1,000 floats is 1,000 pointers to 1,000 float objects, unless you use the `array` module, which stores raw machine values:

```python run
import sys
from array import array

readings = [float(n) for n in range(1_000)]
packed = array("d", readings)          # "d": C doubles, like Float64Array

shallow = sys.getsizeof(readings)
boxed = shallow + sum(sys.getsizeof(r) for r in readings)
print(f"list alone:      {shallow:,} bytes")
print(f"list + floats:   {boxed:,} bytes")
print(f"array('d'):      {sys.getsizeof(packed):,} bytes")
print(packed[10], packed.itemsize, packed.typecode)
```

`array.array` takes a typecode (`"b"`/`"B"` for 8-bit ints, `"i"`/`"I"` for C `int`s, `"q"`/`"Q"` for 64-bit ints, `"f"` and `"d"` for floats) and behaves like a list that refuses other types. It's the standard library's answer to typed arrays. For number crunching, NumPy goes much further.

:::note Sizes here are 32-bit sizes
Pyodide is a wasm32 build. Pointers are 4 bytes instead of 8, so every size on this page is smaller than on 64-bit desktop CPython: `sys.getsizeof(1)` is 16 here and 28 on your laptop, and an empty list is 28 here and 56 there. The ratios carry over; the absolute numbers don't.
:::

:::quiz output
What does this print?

```python
import sys

one_int = [1]
one_huge_str = ["x" * 100_000]
print(sys.getsizeof(one_int) == sys.getsizeof(one_huge_str))
```

- [x] `True`
- [ ] `False`

Both lists hold exactly one pointer, and `getsizeof` doesn't follow it. The 100 KB string is a separate object with its own size. To measure a whole structure, walk it yourself (the second challenge) or use `tracemalloc`.
:::

## `__slots__`: smaller instances

:::compare
```js
// V8 gives objects built the same way a shared hidden class,
// so each instance only stores its field values.
class Point {
  constructor(x, y) {
    this.x = x;
    this.y = y;
  }
}
```
```python
class Point:
    __slots__ = ("x", "y")      # fixed fields, no per-instance __dict__

    def __init__(self, x, y):
        self.x = x
        self.y = y
```
:::

The basics are in [Classes](lesson:classes#slots-a-fixed-set-of-attributes): slots replace the instance `__dict__` with fixed storage, and assigning an undeclared attribute raises `AttributeError`. Under the hood, each name in `__slots__` becomes a descriptor on the class that reads and writes a fixed offset inside the object ([Descriptors](lesson:descriptors) shows the mechanism).

How much do slots save today? Less than old blog posts promise. Since 3.11, CPython stores a plain instance's attribute values compactly, shares one key table among all instances of the class, and only builds a real `__dict__` when something asks for it, such as `vars(obj)` or `obj.__dict__`. `sys.getsizeof` reports the same size for both kinds of instance, so measure allocations with `tracemalloc` instead:

```python run
import sys
import tracemalloc

class Point:
    def __init__(self, x, y):
        self.x, self.y = x, y

class SlottedPoint:
    __slots__ = ("x", "y")

    def __init__(self, x, y):
        self.x, self.y = x, y

def bytes_each(cls, n=10_000):
    tracemalloc.start()
    points = [cls(1, 2) for _ in range(n)]
    used = tracemalloc.get_traced_memory()[0]
    tracemalloc.stop()
    return used // n

print(sys.getsizeof(Point(1, 2)), sys.getsizeof(SlottedPoint(1, 2)))   # same
print("plain:  ", bytes_each(Point), "bytes each")
print("slotted:", bytes_each(SlottedPoint), "bytes each")
```

Calling `vars()` on every plain instance would make each one bigger still, because it materialises the dict. Slots pay off when you hold millions of small objects: tree nodes, parsed records, points in a geometry engine.

:::pythonic Let dataclasses write the slots
`@dataclass(slots=True)` (3.10+) generates `__slots__` from the fields (see [Dataclasses](lesson:dataclasses-and-enums#kw-only-order-and-slots)). Add `weakref_slot=True` (3.11+) if instances must support weak references. `functools.cached_property` needs an instance `__dict__`, so it can't be combined with slots.
:::

## Small ints, interning and why `is` lies

:::compare
```js
const a = 1000;
const b = Number("1000");
a === b;                       // true: numbers are values

const key = ["order", "_id"].join("");
key === "order_id";            // true: strings compare by content
```
```python
a = 1000
b = int("1000")
a is b                         # False: two separate int objects

key = "".join(["order", "_id"])
key == "order_id"              # True
key is "order_id"              # False, plus a SyntaxWarning
```
:::

[Truthiness & Equality](lesson:truthiness-and-equality#is-compares-identity) gave the rule: `is` checks identity, so never use it on numbers or strings. Here's the machinery that makes `is` *look* like it works, right up until it doesn't:

- **The small-int cache.** CPython creates the integers from -5 to 256 once, at startup, as immortal objects. Every operation that produces one of those values returns the cached object. Outside that range, each result is a new object.
- **Constant merging.** The compiler stores literals in the code object (`fn.__code__.co_consts`) and merges equal constants within one compilation, so two `1000` literals in the same file are a single object. Type the same two lines into the REPL, which compiles each line separately, and you get two objects.
- **String interning.** String literals that look like identifiers, such as `"order_id"`, are interned at compile time, and so are variable and attribute names, so equal ones share an object. Strings built at runtime aren't interned unless you call `sys.intern()`.

```python run
import sys

a = 1000
b = 1000
print(a is b, a is int("1000"))            # one merged constant vs a runtime int

print(int("256") is int("256"))            # cached: -5 to 256
print(int("257") is int("257"))            # not cached

literal = "order_id"
built = "".join(["order", "_id"])
print(literal == built, literal is built)  # equal, but different objects
print(literal is sys.intern(built))        # intern() returns the canonical copy
```

:::quiz output
What does this print?

```python
x = 300
y = 299 + 1
z = int("300")
print(x is y, x is z)
```

- [ ] `True True`
- [x] `True False`
- [ ] `False False`
- [ ] `False True`

The compiler folds `299 + 1` into the constant `300` and merges it with the other `300`, so `x` and `y` are one object. `int("300")` runs at runtime, and 300 is outside the small-int cache, so it builds a new object. None of this is guaranteed by the language, which is exactly why `==` is the only safe comparison.
:::

:::tip `sys.intern` for repeated values
When you load millions of records that repeat a handful of strings (country codes, status names, column headers read from a file), `sys.intern(value)` makes every occurrence share one object. That saves memory, and dict lookups with interned keys usually succeed on the identity check before comparing characters.
:::

## Binary data: `bytearray` and `memoryview`

:::compare
```js
const packet = new Uint8Array([0x48, 0x49, 0x21]);
const header = packet.subarray(0, 2);  // a view, no copy
header[0] = 0x68;                       // writes through to packet
const copy = packet.slice(0, 2);        // a copy
const words = new Uint32Array(buffer);  // reinterpret the bytes
```
```python
packet = bytearray(b"HI!")
header = memoryview(packet)[0:2]        # a view, no copy
header[0] = 0x68                        # writes through to packet
copy = packet[0:2]                      # a copy (a new bytearray)
words = memoryview(buffer).cast("I")    # reinterpret the bytes
```
:::

`bytes` is immutable and `bytearray` is its mutable twin, roughly a `Uint8Array` (see [Bytes vs str](lesson:strings#bytes-vs-str)). The trap is slicing: in Python, slicing `bytes` or a `bytearray` **copies**, like JS's `slice()`. The zero-copy `subarray()` equivalent is a `memoryview`, a window onto any object that exposes its memory through the *buffer protocol*: `bytes`, `bytearray`, `array.array`, `mmap`, NumPy arrays. Slicing a memoryview gives another view of the same memory, `.cast()` reinterprets it like a `DataView` or a typed-array constructor over an `ArrayBuffer`, and `.tobytes()` copies out when you need to. Parsers and network code use views to pick a large buffer apart without copying it.

```python run
packet = bytearray(b"\x01\x00\x00\x00\x2a\x00\x00\x00hello")
view = memoryview(packet)

header = view[:8]                       # no copy
print(header.cast("I").tolist())        # two native-endian uint32s
body = view[8:]
body[0] = ord("H")                      # write through the view
print(packet[8:], header.obj is packet)

try:
    packet.extend(b"!")                 # can't resize while views exist
except BufferError as exc:
    print("BufferError:", exc)
for v in (header, body, view):
    v.release()
packet.extend(b"!")                     # fine once they're released
print(packet[8:])
```

:::gotcha A view pins its buffer
While any memoryview of a `bytearray` is alive, operations that would resize it (`append`, `extend`, deleting a slice) raise `BufferError`, because the memory can't move under the view. Release views when you're done with `view.release()`, or scope them with `with memoryview(buf) as view:`. JS has the mirror-image problem: transferring an `ArrayBuffer` detaches every view onto it.
:::

:::quiz output
What does this print?

```python
data = bytearray(b"order")
copy = data[1:3]
view = memoryview(data)[1:3]
data[1] = ord("R")
print(bytes(copy), bytes(view))
```

- [ ] `b'rd' b'rd'`
- [x] `b'rd' b'Rd'`
- [ ] `b'Rd' b'Rd'`
- [ ] `b'Rd' b'rd'`

Slicing the `bytearray` copied two bytes before the change. The memoryview slice still looks at `data`'s memory, so it sees the new `R`.
:::

## Bytecode and the specialising interpreter

:::compare
```js
// V8: source -> Ignition bytecode -> hot functions are compiled
// by Sparkplug, Maglev and TurboFan, with inline caches keyed
// on object shapes, and deoptimised when a guess goes wrong.
function total(prices) {
  let t = 0;
  for (const p of prices) t += p;
  return t;
}
```
```python
# CPython: source -> bytecode in a code object -> the eval loop
# rewrites hot instructions into type-specialised versions with
# inline caches, and falls back when a guess goes wrong.
def total(prices):
    t = 0
    for p in prices:
        t += p
    return t
```
:::

Each `def` compiles its body to a **code object** (`total.__code__`): bytecode for a stack machine, plus the constants and names it uses. The interpreter is a loop that executes those instructions one at a time. Since 3.11 (PEP 659) it's also *adaptive*: after a function has run a few times, the interpreter rewrites generic instructions in place into specialised ones that bet on the types it has seen. `BINARY_OP_ADD_INT` adds two ints with no dispatch, `LOAD_ATTR_INSTANCE_VALUE` reads an attribute from a known slot, and `FOR_ITER_LIST` steps through a list directly. Each specialised instruction starts with a cheap guard. When the bet fails, it takes the generic path, and after enough misses it specialises again for the new types. It's V8's inline caching, done inside an interpreter, and the same advice applies: type-stable code runs fastest.

```python run
import dis

def total(prices):
    t = 0
    for p in prices:
        t += p
    return t

def hot_ops(fn):
    """The loop's instructions, as the interpreter currently runs them."""
    return [i.opname for i in dis.get_instructions(fn, adaptive=True)
            if i.opname.startswith(("FOR_ITER", "BINARY_OP", "JUMP_BACKWARD"))]

dis.dis(total)                   # the generic bytecode
print("cold:        ", hot_ops(total))
for _ in range(100):
    total([1, 2, 3])
print("after ints:  ", hot_ops(total))
for _ in range(100):
    total([0.5, 1.5])
print("after floats:", hot_ops(total))
```

:::quiz
A hot function has been specialised for `int` arguments, and then a caller starts passing `float`s. What happens?

- [ ] It raises `TypeError`, because the specialised instruction only handles ints
- [ ] It keeps running the int-specialised instructions, more slowly
- [x] The instructions' type guards fail, they take the generic path, and the interpreter soon re-specialises them for floats
- [ ] CPython recompiles the whole module from source

Specialisation never changes behaviour, only speed. A failed guard costs a little, and repeated misses trigger re-specialisation, which is what the playground's `after floats` line shows.
:::

:::gotcha Bytecode is an implementation detail
Opcodes change in every release. 3.14 added `LOAD_FAST_BORROW` and `LOAD_SMALL_INT`, which 3.13's `dis` has never heard of, so tools that read bytecode pin a Python version. For anything durable, work with the AST instead (see [Introspection & the ast Module](lesson:introspection-and-ast)).
:::

### The experimental JIT

3.13 added an experimental just-in-time compiler (PEP 744). When a loop gets hot, which CPython detects with counters on its backward jumps, the specialised instructions along that path are translated into machine code by stitching together templates prepared when CPython was built ("copy-and-patch"). The official Windows and macOS installers for 3.14 include it, switched off. Set `PYTHON_JIT=1` to try it, but the 3.14 release notes put its effect at anywhere from 10% slower to 20% faster depending on the workload, and advise against production use. Free-threaded builds don't support it.

```bash
PYTHON_JIT=1 python app.py
python -c "import sys; print(sys._jit.is_available(), sys._jit.is_enabled())"
```

`sys._jit` (3.14) reports whether the build supports the JIT and whether it's switched on. This page's build has no JIT, which is why the loop's backward jump specialised to `JUMP_BACKWARD_NO_JIT` in the playground above.

### `__pycache__` and `.pyc` files

:::compare
```bash
# Node 22.1+: opt in to V8's on-disk compile cache
NODE_COMPILE_CACHE=.cache node app.js
```
```bash
# Python: imported modules are cached automatically
python app.py
ls __pycache__/        # orders.cpython-314.pyc  db.cpython-314.pyc
```
:::

The first time a module is imported, Python compiles it and writes the code object to `__pycache__/<module>.<tag>.pyc`. Later imports read a small header first: a *magic number* identifying the bytecode format, plus the source file's modification time and size (or, optionally, a hash). If those still match, Python skips compiling. The tag (`cpython-314`) lets several Python versions share a directory, and since the magic number changes whenever the bytecode does, `.pyc` files never run on another version. They aren't obfuscation either: `marshal.loads()` turns one back into a code object, and `dis` prints its bytecode.

```python run
import importlib
import importlib.util
import os
import sys
from pathlib import Path

Path("pricing.py").write_text("RATE = 0.2\n", encoding="utf-8")
importlib.invalidate_caches()
sys.modules.pop("pricing", None)

saved = sys.dont_write_bytecode
sys.dont_write_bytecode = False          # Pyodide turns caching off by default
try:
    import pricing
finally:
    sys.dont_write_bytecode = saved

cached = importlib.util.cache_from_source("pricing.py")
print(cached, cached.removeprefix("__pycache__/") in os.listdir("__pycache__"))
print(Path(cached).read_bytes()[:4] == importlib.util.MAGIC_NUMBER)
```

:::tip Working with `.pyc` files
Only imported modules are cached. The script you run directly is compiled every time, which is one more reason to keep it a thin entry point. Add `__pycache__/` to `.gitignore`. Set `PYTHONDONTWRITEBYTECODE=1` (or run `python -B`) to stop writing caches, which is common in containers with read-only filesystems, and run `python -m compileall src/` to precompile while building the image.
:::

## The GIL and free-threaded builds

:::compare
```js
// Node: one JavaScript thread per isolate. Parallel JS
// means worker_threads, each with its own separate heap.
const { Worker } = require("node:worker_threads");
new Worker("./resize.js", { workerData: { path } });
```
```python
# CPython: real OS threads sharing one heap, but on the
# default build only the thread holding the GIL runs bytecode.
import threading

threading.Thread(target=resize, args=(path,)).start()
```
:::

The **Global Interpreter Lock** is a mutex that a thread must hold to execute Python bytecode. It exists because reference counts and much of the interpreter's internal state aren't safe to update from several threads at once, and one big lock was simpler and faster for single-threaded code than thousands of small ones. A waiting thread asks for the lock, and the running one hands it over at the next safe point once its time slice is up (`sys.getswitchinterval()`, 5 ms by default). Threads also drop the GIL while they block on I/O, and C extensions such as NumPy, `zlib` and `hashlib` drop it during long computations. So on the default build, threads overlap *waiting*, not pure-Python *computing*.

**Free-threaded builds** remove the GIL (PEP 703). They were experimental in 3.13 (`python3.13t`), and 3.14 made them officially supported but still optional (PEP 779): you install a separate `python3.14t`. Without the lock, CPython relies on *biased* reference counting (plain increments for the thread that owns an object, atomic ones for every other thread), per-object locks inside `dict`, `list` and `set`, and a thread-safe memory allocator. The costs: the 3.14 release notes put single-threaded code at roughly 5–10% slower, and C extensions must declare that they support free-threading, or importing one re-enables the GIL with a warning.

```python
import sys
import sysconfig

sysconfig.get_config_var("Py_GIL_DISABLED") == 1   # a free-threaded build?
sys._is_gil_enabled()                               # is the GIL on right now?
```

:::gotcha The GIL doesn't make your code thread-safe
It protects CPython's internals, not your invariants. `count += 1` is a read, an add and a write, and nothing promises they happen as one step. On the free-threaded build, two threads can run them at the same moment, and on the default build any blocking call between a read and its write lets another thread in. Lock shared state, or don't share it. [Concurrency Models](lesson:concurrency-models) covers threads, processes, asyncio and how to choose between them.
:::

## This page runs CPython on WebAssembly

The Python in these playgrounds is **Pyodide**: CPython's own C source compiled with Emscripten to a roughly 10 MB WebAssembly binary, plus the standard library in a zip, running in a Web Worker in your browser (and in Node, for this site's content checks). It's the real interpreter, with the same refcounting, cycle collector, bytecode, specialisation and GIL you've seen above. Since 3.14, Emscripten is an officially supported CPython platform (tier 3, PEP 776). The differences come from the platform:

- **It's 32-bit.** Pointers are 4 bytes and `sys.maxsize` is `2**31 - 1`, so every `sys.getsizeof` result is smaller than on desktop.
- **No threads or processes.** `threading.Thread.start()` raises `RuntimeError: can't start new thread`, so the GIL never has anyone to hand over to. `subprocess.run()` raises `OSError` ("emscripten does not support processes"), so `multiprocessing` is out too, and importing `concurrent.interpreters` fails because its C module isn't built.
- **No JIT**, and `sys.dont_write_bytecode` is `True`, so nothing is cached unless you ask (as the `__pycache__` playground did).
- **asyncio runs on Pyodide's `WebLoop`**, which schedules everything through the browser's own event loop.

```python run
import platform
import struct
import sys

print(sys.version.split()[0], sys.platform, platform.machine())
print("pointer size:", struct.calcsize("P"), "bytes")
print("sys.maxsize == 2**31 - 1:", sys.maxsize == 2**31 - 1)
print("GIL enabled:", sys._is_gil_enabled())
print("JIT available:", sys._jit.is_available())
print("writes .pyc files:", not sys.dont_write_bytecode)
```

Pyodide can also call straight into JavaScript through its `js` module. That reaches outside the sandbox (the network, the devtools console), so this one is static:

```python
import js                          # Pyodide's view of globalThis

js.console.log("hello from CPython")
response = await js.fetch("/api/orders")
orders = (await response.json()).to_py()   # a JS object -> a Python dict
```

:::deep Two memory managers in one tab
When JavaScript holds a Python object, it holds a `PyProxy`, and the proxy owns a reference count on the Python side. V8's collector has no idea that count exists, so Pyodide asks JavaScript code to call `proxy.destroy()` when it's done, and only uses a `FinalizationRegistry` as a backstop, with all the timing caveats from [Weak references](#weak-references). This site's own harness sidesteps the problem: every run hands its results to JavaScript as a plain JSON string, so there are no per-run proxies to destroy.
:::

## Cheat sheet

| JavaScript | Python | Notes |
| --- | --- | --- |
| tracing GC | refcounting + the `gc` cycle collector | most objects are freed the moment they're unreachable |
| (no API) | `sys.getrefcount(obj)` | compare counts; 3.14 may report lower |
| `new WeakRef(obj)` / `ref.deref()` | `weakref.ref(obj)` / `ref()` | a dead ref returns `None` |
| `FinalizationRegistry` | `weakref.finalize(obj, fn, *args)` | runs at most once; at exit if still alive |
| `WeakMap` | `weakref.WeakKeyDictionary()` | attach data to objects you don't own |
| `Map` of `WeakRef`s | `weakref.WeakValueDictionary()` | caches and identity maps |
| `WeakSet` | `weakref.WeakSet()` | |
| (none needed) | `weakref.WeakMethod(obj.method)` | bound methods are temporary |
| heap snapshot | `sys.getsizeof(obj)`, `tracemalloc` | shallow size vs every allocation |
| hidden classes | `__slots__`, `@dataclass(slots=True)` | smaller instances, fixed attributes |
| `Float64Array` | `array.array("d")` | unboxed machine values |
| `Uint8Array` | `bytearray` | `bytes` is the immutable version |
| `subarray()`, `DataView` | `memoryview(buf)[a:b]`, `.cast("I")` | zero-copy; slicing `bytes` copies |
| `a === b` on numbers | `a == b` | never `is`: small ints are cached |
| Ignition bytecode | `dis.dis(fn)`, `fn.__code__` | opcodes change every release |
| inline caches | specialising interpreter (3.11+) | `dis.dis(fn, adaptive=True)` |
| TurboFan | experimental JIT (3.13+) | `PYTHON_JIT=1`; not for production |
| V8 compile cache | `__pycache__/*.pyc` | imported modules only |
| one JS thread per isolate | the GIL | one thread runs bytecode at a time |
| `worker_threads` | processes, or `python3.14t` threads | see [Concurrency Models](lesson:concurrency-models) |

## Challenges

:::challenge id=cpy-chunk-views title="Zero-copy chunks" difficulty=easy
Write `chunks(data, size)` that splits a `bytes` or `bytearray` object into consecutive chunks of `size` bytes (the last one may be shorter) **without copying anything**. Return a list of `memoryview` objects that all look at the original buffer, the way `subarray()` does in JS. Raise `ValueError` if `size` is less than 1.

```text
[bytes(c) for c in chunks(b"abcdefgh", 3)]  ->  [b'abc', b'def', b'gh']
```

```js
function chunks(buf, size) {
  if (size < 1) throw new RangeError("size must be >= 1");
  const out = [];
  for (let i = 0; i < buf.length; i += size) out.push(buf.subarray(i, i + size));
  return out;
}
```

```python starter
def chunks(data, size):
    ...
```

```python solution
def chunks(data, size):
    if size < 1:
        raise ValueError("size must be at least 1")
    view = memoryview(data)
    return [view[i:i + size] for i in range(0, len(view), size)]
```

```python tests
@test("splits into chunks of size bytes")
def _():
    eq([bytes(c) for c in chunks(b"abcdefgh", 3)], [b"abc", b"def", b"gh"])

@test("returns memoryviews of the original buffer, not copies")
def _():
    data = b"abcdefgh"
    parts = chunks(data, 4)
    check(all(isinstance(p, memoryview) for p in parts), "each chunk should be a memoryview")
    check(all(p.obj is data for p in parts), "slice one memoryview of data: slicing data itself copies")

@test("writes to a chunk land in a bytearray")
def _():
    buf = bytearray(b"aaaabbbb")
    parts = chunks(buf, 4)
    parts[1][0] = ord("B")
    eq(bytes(buf), b"aaaaBbbb")

@test("a size larger than the data gives one chunk")
def _():
    eq([bytes(c) for c in chunks(b"hi", 10)], [b"hi"])

@test("an empty buffer gives no chunks")
def _():
    eq(chunks(b"", 3), [])

@test("a size below 1 raises ValueError")
def _():
    raises(ValueError, chunks, b"abc", 0)
```

```hint
`data[i:i + size]` copies. Wrap the buffer once with `memoryview(data)` and slice the view instead.
```

```hint
`range(0, len(view), size)` yields the start of every chunk, and slices clamp at the end, so the last chunk is just shorter.
```
:::

:::challenge id=cpy-deep-sizeof title="Deep size" difficulty=medium
`sys.getsizeof` is shallow. Write `deep_sizeof(obj)` that returns the total `sys.getsizeof` of `obj` **plus everything reachable from it** through lists, tuples, sets, frozensets and dicts (both keys and values).

- Count every object **once**, even when it's shared or part of a cycle.
- Treat anything else (numbers, strings, your own class instances) as a leaf: count its own size and don't look inside.

The tests compute the expected totals with `sys.getsizeof` themselves, so they pass on 32-bit and 64-bit builds alike.

```python starter
import sys

def deep_sizeof(obj):
    ...
```

```python solution
import sys

def deep_sizeof(obj):
    seen = set()            # ids are unique while every object is alive, as here
    stack = [obj]
    total = 0
    while stack:
        current = stack.pop()
        if id(current) in seen:
            continue
        seen.add(id(current))
        total += sys.getsizeof(current)
        if isinstance(current, dict):
            stack.extend(current.keys())
            stack.extend(current.values())
        elif isinstance(current, (list, tuple, set, frozenset)):
            stack.extend(current)
    return total
```

```python tests
import sys

S = sys.getsizeof

@test("a leaf is just its own size")
def _():
    eq(deep_sizeof(12345), S(12345))
    eq(deep_sizeof("hello"), S("hello"))

@test("adds a flat list and its items")
def _():
    prices = [1.5, 2.5, 3.5]
    eq(deep_sizeof(prices), S(prices) + S(prices[0]) + S(prices[1]) + S(prices[2]))

@test("follows dict keys and values into nested containers")
def _():
    qty = [3, 4]
    order = {"sku": "A1", "qty": qty}
    expected = S(order) + S("sku") + S("A1") + S("qty") + S(qty) + S(3) + S(4)
    eq(deep_sizeof(order), expected)

@test("counts a shared object once")
def _():
    row = [7, 8]
    table = [row, row, row]
    eq(deep_sizeof(table), S(table) + S(row) + S(7) + S(8))

@test("survives a cycle")
def _():
    node = {"name": "loop"}
    node["self"] = node
    eq(deep_sizeof(node), S(node) + S("name") + S("loop") + S("self"))

@test("tuples, sets and frozensets are containers too")
def _():
    tags = frozenset({"new", "sale"})
    codes = {99}
    record = (tags, codes)
    expected = S(record) + S(tags) + S("new") + S("sale") + S(codes) + S(99)
    eq(deep_sizeof(record), expected)

@test("doesn't look inside other objects")
def _():
    class Box:
        def __init__(self):
            self.items = [1, 2, 3]
    box = Box()
    wrapper = [box]
    eq(deep_sizeof(wrapper), S(wrapper) + S(box))
```

```hint
Keep a stack of objects still to visit and a `seen` set. Pop one, skip it if you've seen it, otherwise add its size and push its children.
```

```hint
Track `id(obj)`, not the objects themselves: lists and dicts aren't hashable. Ids are only unique among objects alive at the same time, which holds here because everything stays reachable from `obj`.
```

```hint
A dict's children are its keys and its values: `stack.extend(d.keys())` and `stack.extend(d.values())`.
```
:::

:::challenge id=cpy-identity-map title="An identity map" difficulty=medium
ORMs such as SQLAlchemy keep an *identity map*: while your code holds the object for row 7, loading row 7 again returns that same object, so two parts of the program never disagree about its state. Once nobody holds it, the map forgets it. Write `IdentityMap(loader, keep_recent=0)`:

- `get(key)` returns the object for `key`, calling `loader(key)` only when no live object for that key exists.
- The map itself must not keep objects alive, except for the next point.
- The results of the last `keep_recent` calls to `get()` stay alive even if nobody else holds them, so hot objects survive brief gaps between uses.
- `len(identity_map)` is the number of live objects in the map.

The tests call `gc.collect()` before checking what was freed.

```python starter
class IdentityMap:
    def __init__(self, loader, keep_recent=0):
        self.loader = loader
        self.cache = {}

    def get(self, key):
        if key not in self.cache:
            self.cache[key] = self.loader(key)
        return self.cache[key]

    def __len__(self):
        return len(self.cache)
```

```python solution
import weakref
from collections import deque

class IdentityMap:
    def __init__(self, loader, keep_recent=0):
        self._loader = loader
        self._alive = weakref.WeakValueDictionary()
        self._recent = deque(maxlen=keep_recent)   # strong refs to recent results

    def get(self, key):
        obj = self._alive.get(key)       # hold it in a local before testing it
        if obj is None:
            obj = self._loader(key)
            self._alive[key] = obj
        self._recent.append(obj)         # a maxlen=0 deque keeps nothing
        return obj

    def __len__(self):
        return len(self._alive)
```

```python tests
import gc
import weakref

class Customer:
    def __init__(self, customer_id):
        self.customer_id = customer_id

def counting_loader():
    calls = []
    def load(customer_id):
        calls.append(customer_id)
        return Customer(customer_id)
    return load, calls

@test("returns the same object while someone holds it")
def _():
    load, calls = counting_loader()
    customers = IdentityMap(load)
    first = customers.get(7)
    again = customers.get(7)
    check(first is again, "two get(7) calls should return the very same object")
    eq(calls, [7], "the loader should run once")

@test("different keys load different objects")
def _():
    load, calls = counting_loader()
    customers = IdentityMap(load)
    ada, linus = customers.get(1), customers.get(2)
    eq((ada.customer_id, linus.customer_id), (1, 2))
    eq(len(customers), 2)

@test("doesn't keep objects alive by itself")
def _():
    load, calls = counting_loader()
    customers = IdentityMap(load)
    probe = weakref.ref(customers.get(7))
    gc.collect()
    check(probe() is None, "the map holds a strong reference: use a WeakValueDictionary")
    eq(len(customers), 0)

@test("reloads an object after everyone let it go")
def _():
    load, calls = counting_loader()
    customers = IdentityMap(load)
    first = customers.get(7)
    del first
    gc.collect()
    customers.get(7)
    eq(calls, [7, 7])

@test("keep_recent keeps the last results alive")
def _():
    load, calls = counting_loader()
    customers = IdentityMap(load, keep_recent=2)
    for key in (1, 2, 3):
        customers.get(key)              # nobody else holds these
    gc.collect()
    eq(len(customers), 2, "the results of the last 2 calls should still be alive")
    customers.get(3)
    customers.get(1)
    eq(calls, [1, 2, 3, 1], "3 was still alive; 1 had to be reloaded")
```

```hint
`weakref.WeakValueDictionary` drops an entry by itself when its value dies. That's the whole "forget objects nobody holds" requirement.
```

```hint
Read with `obj = self._alive.get(key)` and test `obj is None`. Checking `key in self._alive` and then indexing can fail if the object dies between the two steps.
```

```hint
`collections.deque(maxlen=keep_recent)` holds strong references to the most recent results and drops the oldest automatically. With `maxlen=0` it keeps nothing, so you don't need a special case.
```
:::

:::challenge id=cpy-weak-signal title="A signal that doesn't leak" difficulty=hard
Event emitters leak when every subscriber stays reachable from the emitter forever (JS shows this as `MaxListenersExceededWarning`). Write a `Signal` class that holds its receivers **weakly**, so subscribing never keeps an object alive:

- `connect(receiver)` registers a callable. Hold plain functions with `weakref.ref` and bound methods with `weakref.WeakMethod`, since a plain ref to `obj.method` dies at once.
- `connect(receiver, weak=False)` holds the receiver strongly instead, for lambdas and other throwaway callables.
- `emit(*args, **kwargs)` calls every live receiver with those arguments, in the order they were connected, and returns how many it called. Dead receivers are skipped and dropped.
- `len(signal)` is the number of live receivers.

```js
class Signal {
  #receivers = new Set();
  connect(fn) { this.#receivers.add(fn); }   // keeps every subscriber alive
  emit(...args) {
    for (const fn of this.#receivers) fn(...args);
    return this.#receivers.size;
  }
}
```

```python starter
class Signal:
    def __init__(self):
        self.receivers = []

    def connect(self, receiver, weak=True):
        self.receivers.append(receiver)

    def emit(self, *args, **kwargs):
        for receiver in self.receivers:
            receiver(*args, **kwargs)
        return len(self.receivers)

    def __len__(self):
        return len(self.receivers)
```

```python solution
import inspect
import weakref

class Signal:
    def __init__(self):
        self._refs = []                        # callables that return a receiver or None

    def connect(self, receiver, weak=True):
        if not weak:
            ref = lambda: receiver             # a "reference" that never dies
        elif inspect.ismethod(receiver):
            ref = weakref.WeakMethod(receiver)
        else:
            ref = weakref.ref(receiver)
        self._refs.append(ref)

    def _live(self):
        pairs = [(ref, ref()) for ref in self._refs]
        self._refs = [ref for ref, receiver in pairs if receiver is not None]
        return [receiver for _, receiver in pairs if receiver is not None]

    def emit(self, *args, **kwargs):
        receivers = self._live()
        for receiver in receivers:
            receiver(*args, **kwargs)
        return len(receivers)

    def __len__(self):
        return len(self._live())
```

```python tests
import gc
import weakref

class Cart:
    def __init__(self):
        self.events = []

    def on_change(self, event):
        self.events.append(event)

@test("calls a function receiver with the arguments")
def _():
    seen = []
    def receiver(*args, **kwargs):
        seen.append((args, kwargs))
    signal = Signal()
    signal.connect(receiver)
    eq(signal.emit("saved", sku="A1"), 1)
    eq(seen, [(("saved",), {"sku": "A1"})])

@test("keeps calling a bound method while its object lives")
def _():
    signal = Signal()
    cart = Cart()
    signal.connect(cart.on_change)
    gc.collect()
    signal.emit("item added")
    eq(cart.events, ["item added"], "a weakref.ref to cart.on_change dies at once: use WeakMethod")

@test("doesn't keep subscribers alive")
def _():
    signal = Signal()
    cart = Cart()
    probe = weakref.ref(cart)
    signal.connect(cart.on_change)
    del cart
    gc.collect()
    check(probe() is None, "the signal is keeping the Cart alive")

@test("drops receivers whose object or function is gone")
def _():
    signal = Signal()
    cart = Cart()
    def make_receiver():
        def receiver(event):
            pass
        return receiver
    receiver = make_receiver()
    signal.connect(cart.on_change)
    signal.connect(receiver)
    eq(len(signal), 2)
    del cart, receiver
    gc.collect()
    eq(signal.emit("ping"), 0)
    eq(len(signal), 0)

@test("weak=False keeps a lambda connected")
def _():
    seen = []
    signal = Signal()
    signal.connect(lambda event: seen.append(event), weak=False)
    gc.collect()
    eq(signal.emit("x"), 1)
    eq(seen, ["x"])

@test("calls receivers in connection order")
def _():
    calls = []
    def first(event):
        calls.append("first")
    def second(event):
        calls.append("second")
    signal = Signal()
    signal.connect(first)
    signal.connect(second)
    signal.emit("go")
    eq(calls, ["first", "second"])
```

```hint
Store a list of zero-argument callables that each return the receiver or `None`. `weakref.ref` and `WeakMethod` objects already behave like that.
```

```hint
`inspect.ismethod(receiver)` is true for bound methods. For `weak=False`, a closure works as a reference that never dies: `lambda: receiver`.
```

```hint
In `emit`, dereference every ref once, keep only the refs whose target is still alive, then call the live receivers. Holding them in a local list also stops one from dying halfway through the loop.
```
:::
