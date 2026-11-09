---
title: Stacks, Queues & Heaps
part: Structures
summary: Lists as stacks, monotonic stacks, min-stacks, RPN, deque windows, top-k, k-way merges and running medians.
minutes: 45
---

Stacks, queues and heaps all answer the question *which item do I handle next?*, with three different policies: the newest, the oldest, or the smallest. JavaScript ships one of them (an array works as a stack). Python's standard library has all three, with the right complexities: `list`, `collections.deque` and `heapq`. Interview problems rarely name the structure, so this lesson is about recognising the shape: "the most recent unmatched thing" is a stack, "the next bigger value" is a monotonic stack, and "the k best so far" is a heap.

The operations and their costs are in [Python's Algorithm Toolkit](lesson:algorithm-toolkit).

## Stacks are lists

:::compare
```js
const stack = [];
stack.push("a");
stack.push("b");
stack.at(-1);          // "b" (peek)
stack.pop();           // "b"
stack.pop();           // "a"
stack.pop();           // undefined
stack.length === 0;    // true
```
```python
stack = []
stack.append("a")
stack.append("b")
stack[-1]              # "b" (peek)
stack.pop()            # "b"
stack.pop()            # "a"
stack.pop()            # IndexError!
not stack              # True
```
:::

The end of a list is cheap: `append` and `pop()` are amortised O(1), and `stack[-1]` peeks. An empty list is falsy, so `while stack:` and `if stack and stack[-1] == x` read naturally. The difference from JS is the empty case: popping or peeking an empty stack raises `IndexError` instead of returning `undefined`, which is nearly always the bug you wanted to hear about. Work at the *end* of the list, because `pop(0)` and `insert(0, x)` are O(n).

The shape to recognise is *the most recent unfinished thing*: an open bracket waiting for its partner, a tag waiting to close, an edit waiting to be undone. Each new item either cancels the top of the stack or goes on top of it. Every item is pushed once and popped at most once, so the whole pass is O(n) time and O(n) space.

```python run
def collapse(text):
    """Repeatedly delete adjacent equal pairs: 'abbaca' -> 'ca'."""
    stack = []
    for ch in text:
        if stack and stack[-1] == ch:
            stack.pop()              # ch cancels the character before it
        else:
            stack.append(ch)
    return "".join(stack)

print(collapse("abbaca"), repr(collapse("aabb")), collapse("abc"))
```

:::gotcha Guard every `pop()`
JS code often leans on `stack.pop()` returning `undefined` for an empty stack. Ported as is, the same check raises `IndexError` in Python. Test first, and let `or` short-circuit: `if not stack or stack.pop() != expected: return False` never pops an empty stack, so a stray closer like `")("` gives `False` instead of a crash. That's the [first challenge](#algo-brackets-balanced).
:::

## Evaluating RPN expressions

In reverse Polish notation (postfix), operators follow their operands: `3 4 + 2 *` means `(3 + 4) * 2`. There are no parentheses and no precedence rules, because a stack resolves everything. Push each number. On an operator, pop the right operand, then the left one, apply the operator, and push the result. A well-formed expression leaves exactly one number behind. That's O(n) time and O(n) space.

:::compare
```js
const OPS = {
  "+": (a, b) => a + b,
  "-": (a, b) => a - b,
  "*": (a, b) => a * b,
};
const b = stack.pop(), a = stack.pop();
stack.push(OPS[token](a, b));
```
```python
import operator

OPS = {"+": operator.add, "-": operator.sub, "*": operator.mul}


right, left = stack.pop(), stack.pop()
stack.append(OPS[token](left, right))
```
:::

A dict from symbol to function replaces a `switch`, and the `operator` module already has the functions (see [The `operator` module](lesson:decorators#the-operator-module)). Division is where the JS habit bites. Most RPN problems want integer division that truncates toward zero, like `Math.trunc(a / b)`. Python's `//` floors toward negative infinity instead, and `int(a / b)` goes through a float, which loses digits on big integers.

```python run
print(7 // 2, -7 // 2)           # 3 -4: floor division rounds down
print(int(7 / 2), int(-7 / 2))   # 3 -3: truncates toward zero, like Math.trunc
print(int(10**17 / 3))           # the float lost the last digit
print(10**17 // 3)               # exact

def trunc_div(a, b):
    """Integer division that truncates toward zero, exactly."""
    q = abs(a) // abs(b)
    return q if (a < 0) == (b < 0) else -q

print(trunc_div(-7, 2), trunc_div(10**17, 3))
```

:::quiz output
What does this print?

```python
import operator

stack = [7, 2]
stack.append(operator.sub(stack.pop(), stack.pop()))
print(stack)
```

- [ ] `[5]`
- [x] `[-5]`
- [ ] `[7, 2, 5]`

Arguments are evaluated left to right, so the first `pop()` returns `2` (the top) and the second returns `7`, giving `2 - 7`. Pop into named variables first, as in `right, left = stack.pop(), stack.pop()`, and the order stays visible.
:::

## Queues and time windows with `deque`

:::compare
```js
// Requests in the last 5 minutes: filter on every call, O(n) each time
const recent = hits.filter((t) => t > now - 300).length;
```
```python
# Pop expired hits off the front: O(1) amortised per call
while hits and hits[0] <= now - 300:
    hits.popleft()
```
:::

For first in, first out, use `collections.deque`: `append` and `popleft` are both O(1), while `list.pop(0)` shifts every remaining element. [The toolkit](lesson:algorithm-toolkit) covers BFS queues and `maxlen` buffers. The other queue pattern interviews love is the **time window**: keep events in arrival order and, before answering, pop everything that has fallen out of the window from the front. Each event is appended once and popped at most once, so n calls cost O(n) in total, even though a single call may pop many items.

```python run
from collections import deque

class HitCounter:
    """Counts the hits in the last `window` seconds."""

    def __init__(self, window=300):
        self.window = window
        self.hits = deque()                # timestamps, oldest first

    def hit(self, t):
        self.hits.append(t)

    def count(self, t):
        while self.hits and self.hits[0] <= t - self.window:
            self.hits.popleft()            # expired, and it can never count again
        return len(self.hits)

counter = HitCounter()
for t in (1, 2, 3, 300):
    counter.hit(t)
print(counter.count(300), counter.count(301), counter.count(302))
```

:::note `queue.Queue` is for threads
Searching for "python queue" leads to the `queue` module. `queue.Queue` is a thread-safe, blocking queue for producer/consumer code, with locking overhead and a `put`/`get` API, and `asyncio.Queue` is its async twin. For algorithms, `deque` is the queue.
:::

## Monotonic stacks: the next greater element

:::compare
```js
// For each item, scan ahead for something bigger: O(n²)
const nextGreater = (nums) =>
  nums.map((x, i) => {
    for (let j = i + 1; j < nums.length; j++) {
      if (nums[j] > x) return nums[j];
    }
    return -1;
  });




```
```python run
def next_greater(nums):
    """For each item, the next item to its right that is bigger, or -1."""
    result = [-1] * len(nums)
    stack = []                         # indices still waiting for an answer
    for i, x in enumerate(nums):
        while stack and nums[stack[-1]] < x:
            result[stack.pop()] = x    # x is what they were waiting for
        stack.append(i)
    return result

print(next_greater([2, 1, 2, 4, 3]))
print(next_greater([5, 4, 3]), next_greater([]))
```
:::

The stack holds the indices that haven't found their answer yet, and their values never increase from bottom to top: it's a **monotonic stack**. A new value pops every smaller value off the top, because it's the next greater element for all of them, and then waits on the stack itself. The `while` inside the `for` looks quadratic, but each index is pushed once and popped at most once, so the total work is O(n), with O(n) space.

Flip the comparison for "next smaller", iterate from the right for "previous greater", and keep indices whenever the answer is a distance rather than a value. That last variant is the [fourth challenge](#algo-daily-temperatures).

:::quiz output
What does this print?

```python
stack = []
for x in [3, 1, 4, 1, 5]:
    while stack and stack[-1] < x:
        stack.pop()
    stack.append(x)
print(stack)
```

- [x] `[5]`
- [ ] `[3, 4, 5]`
- [ ] `[1, 1]`
- [ ] `[5, 4, 3]`

The `4` pops `1` and `3`, and the `5` pops `1` and `4`. Whatever survives never increases from bottom to top, and here only the maximum is left.
:::

## A stack with an O(1) minimum

:::compare
```js
// O(n) on every call
const lowest = Math.min(...stack);
```
```python
# O(1): every entry remembers the minimum beneath it
value, lowest = stack[-1]
```
:::

A classic design question asks for `push`, `pop`, `top` and `minimum`, all in O(1). Scanning for the minimum is O(n), and a single `self.min` field breaks as soon as you pop the minimum. The trick is to store, next to every value, the minimum of the stack *at the moment it was pushed*, so popping restores the previous minimum for free. Every operation is O(1), and the space is O(n).

```python run
class MinStack:
    def __init__(self):
        self._items = []                   # (value, minimum so far) pairs

    def push(self, value):
        lowest = min(value, self._items[-1][1]) if self._items else value
        self._items.append((value, lowest))

    def pop(self):
        return self._items.pop()[0]        # IndexError when empty, like list.pop

    def top(self):
        return self._items[-1][0]

    def minimum(self):
        return self._items[-1][1]

    def __len__(self):
        return len(self._items)            # also makes `if stack:` work

stack = MinStack()
for price in [5, 2, 7, 2]:
    stack.push(price)
print(stack.minimum(), len(stack))
stack.pop()
stack.pop()
print(stack.top(), stack.minimum())        # the first 2 is still there
stack.pop()
print(stack.top(), stack.minimum())
```

Duplicate minimums need no special case, because each copy carries its own pair. A method named `min` would work too, since methods don't see names defined in the class body and `push` would still call the builtin, but `minimum` spares the reader from wondering.

## Top k with a bounded heap

:::compare
```js
// Re-sort on every arrival: O(k log k) each time
top.push(latency);
top.sort((a, b) => b - a);
top.length = Math.min(top.length, 3);
```
```python
# A size-k min-heap: O(log k) per arrival
if len(top) < 3:
    heapq.heappush(top, latency)
else:
    heapq.heappushpop(top, latency)
```
:::

`heapq.nlargest(k, items)` is the one-liner when you have all the items at once. When they arrive over time, or you need the current k-th best at any moment, keep the heap yourself. A **min-heap of size k** holds the k largest items seen so far, and its root is the smallest of them: the bar a newcomer has to clear. `heappushpop` pushes the newcomer and pops the smallest in one O(log k) step, and a newcomer that doesn't clear the bar comes straight back out without touching the heap. That's O(n log k) time for n items, and O(k) memory however long the stream is.

```python run
import heapq

def slowest(requests, k):
    """The k slowest (ms, path) pairs in a stream, slowest first."""
    top = []                                     # min-heap of the k slowest so far
    for path, ms in requests:
        if len(top) < k:
            heapq.heappush(top, (ms, path))
        else:
            heapq.heappushpop(top, (ms, path))   # it must beat top[0] to stay
    return sorted(top, reverse=True)

stream = iter([("/login", 120), ("/search", 340), ("/cart", 95), ("/pay", 410), ("/home", 30)])
print(slowest(stream, 3))
```

Ties need a decision. `nlargest`, `nsmallest` and `Counter.most_common` all break them by input order, so the first one seen wins. When a problem wants another rule, alphabetical for instance, put it in the key: `heapq.nsmallest(k, counts, key=lambda tag: (-counts[tag], tag))` ranks by count descending, then by tag ascending. That's the [second challenge](#algo-trending-tags).

:::quiz output
What does this print?

```python
import heapq

top = [1, 2, 3]                  # a min-heap of the 3 largest seen so far
for x in [10, 0, 7, 5]:
    heapq.heappushpop(top, x)
print(top[0])
```

- [ ] `3`
- [x] `5`
- [ ] `10`
- [ ] `0`

The root of a size-k min-heap of the largest items is the k-th largest. Of everything seen (1, 2, 3, 10, 0, 7 and 5) the three largest are 10, 7 and 5, so the root is 5. The 0 never entered the heap: `heappushpop` handed it straight back.
:::

## Merging sorted streams with `heapq.merge`

:::compare
```js
// Concatenate and re-sort: O(N log N), all of it in memory
const merged = [...web, ...api, ...jobs]
  .sort((a, b) => a.ts - b.ts);
```
```python
# A lazy k-way merge: O(N log k), one item per input in memory
merged = heapq.merge(web, api, jobs, key=lambda e: e.ts)

```
:::

`heapq.merge` combines inputs that are **already sorted** into one sorted iterator. It keeps one item from each input in a heap and always yields the smallest, so merging N items from k inputs costs O(N log k) time and O(k) extra memory. It's lazy: the inputs can be generators or open files, and nothing is read until you ask for the next item. It's also stable, so equal keys come out in the order the inputs were passed. `key=` and `reverse=` work as they do in `sorted`.

```python run
import heapq

web = [(1, "web", "GET /"), (4, "web", "GET /cart"), (9, "web", "POST /pay")]
api = [(2, "api", "auth ok"), (4, "api", "price lookup")]
jobs = iter([(3, "job", "email sent"), (10, "job", "report built")])   # any iterable

for ts, source, message in heapq.merge(web, api, jobs, key=lambda e: e[0]):
    print(ts, source, message)
```

:::quiz output
What does this print?

```python
import heapq

print(list(heapq.merge([1, 4, 9], [2, 3], [10, 0])))
```

- [ ] `[0, 1, 2, 3, 4, 9, 10]`
- [x] `[1, 2, 3, 4, 9, 10, 0]`
- [ ] `ValueError`

`merge` never checks its inputs. `[10, 0]` isn't sorted, so the `0` comes out last, behind the `10` that was in front of it.
:::

:::tip Merging k sorted linked lists
"Merge k sorted lists" is the same k-way merge done by hand: push each list's head as `(node.val, i, node)`, where the index `i` breaks ties because nodes don't compare, then repeatedly pop the smallest and push its successor. For Python lists or iterators, `heapq.merge` is the whole answer. Linked lists themselves are in [Linked Lists & Trees](lesson:linked-lists-and-trees).
:::

## Running median with two heaps

To report the median after every new number, split the numbers into two halves: the smaller half in a **max-heap** and the larger half in a **min-heap**, with equal sizes or one extra in the lower half. The median is then the top of the lower half, or the mean of both tops. An insert pushes onto one heap and moves at most one item across, so it's O(log n), and reading the median is O(1). The JS habit, re-sorting the array on every insert, costs O(n log n) per number.

```text
stream:          5  15  1  3
low (max-heap):  3, 1          high (min-heap):  5, 15
median:          (3 + 5) / 2 = 4.0
```

Before 3.14, `heapq`'s public functions only build min-heaps, so the lower half is stored negated. Python 3.14 adds `heappush_max`, `heappop_max`, `heappushpop_max`, `heapreplace_max` and `heapify_max`, which keep a plain list in max-heap order:

```python run
import heapq

low = []                                  # a max-heap, with the 3.14 functions
for x in [5, 1, 8, 3]:
    heapq.heappush_max(low, x)
print(low[0], heapq.heappop_max(low))     # the largest sits at index 0

legacy = []                               # before 3.14: negate going in and coming out
for x in [5, 1, 8, 3]:
    heapq.heappush(legacy, -x)
print(-legacy[0], -heapq.heappop(legacy))
```

Wiring the two heaps together is the [last challenge](#algo-running-median).

## Cheat sheet

| JavaScript | Python | Notes |
| --- | --- | --- |
| `stack.push(x)` | `stack.append(x)` | amortised O(1) |
| `stack.pop()` | `stack.pop()` | raises `IndexError` when empty |
| `stack.at(-1)` | `stack[-1]` | peek; raises when empty |
| `stack.length === 0` | `not stack` | empty lists are falsy |
| `switch (op)` | `OPS[op](left, right)` | a dict of `operator` functions |
| `Math.trunc(a / b)` | `int(a / b)` for small numbers | exact: `abs(a) // abs(b)`, then fix the sign |
| `queue.shift()` | `queue.popleft()` | `collections.deque`, O(1) |
| `hits.filter((t) => t > now - w)` | pop expired items off the front | O(1) amortised per call |
| nested "scan ahead" loops | a monotonic stack | O(n) in total |
| `Math.min(...stack)` | `(value, min_so_far)` pairs | O(1) |
| re-sort and slice on every arrival | size-k min-heap with `heappushpop` | O(log k) per item |
| concatenate and sort sorted arrays | `heapq.merge(*inputs, key=...)` | lazy, O(N log k), stable |
| a max-heap package | `heappush_max`, `heappop_max` (3.14) | or push `-x` |

## Challenges

:::challenge id=algo-brackets-balanced title="Balanced brackets" difficulty=easy
Write `is_balanced(text)` that returns `True` if every `(`, `[` and `{` in `text` is closed by the matching bracket, in the right order. Every other character is ignored.

```text
is_balanced("f(a[0], {k: v})")  ->  True
is_balanced("([)]")             ->  False
is_balanced("(()")              ->  False
is_balanced(")(")               ->  False
is_balanced("")                 ->  True
```

The JavaScript version gets away with popping an empty stack, because `pop()` returns `undefined`. Python's raises `IndexError`.

```js
function isBalanced(text) {
  const pairs = { ")": "(", "]": "[", "}": "{" };
  const stack = [];
  for (const ch of text) {
    if ("([{".includes(ch)) stack.push(ch);
    else if (ch in pairs && stack.pop() !== pairs[ch]) return false;
  }
  return stack.length === 0;
}
```

```python starter
def is_balanced(text):
    ...
```

```python solution
PAIRS = {")": "(", "]": "[", "}": "{"}


def is_balanced(text):
    stack = []
    for ch in text:
        if ch in "([{":
            stack.append(ch)
        elif ch in PAIRS:
            if not stack or stack.pop() != PAIRS[ch]:
                return False
    return not stack
```

```python tests
@test("balanced text")
def _():
    eq(is_balanced("f(a[0], {k: v})"), True)
    eq(is_balanced("()[]{}"), True)
    eq(is_balanced("{[()()]}"), True)

@test("closed in the wrong order")
def _():
    eq(is_balanced("([)]"), False)
    eq(is_balanced("{(})"), False)

@test("mismatched kinds")
def _():
    eq(is_balanced("(]"), False)
    eq(is_balanced("{)"), False)

@test("brackets left open")
def _():
    eq(is_balanced("(()"), False)
    eq(is_balanced("[[["), False)

@test("a closer with nothing open returns False instead of raising")
def _():
    eq(is_balanced(")("), False)
    eq(is_balanced("]"), False)
    eq(is_balanced("())"), False)

@test("empty text and text without brackets")
def _():
    eq(is_balanced(""), True)
    eq(is_balanced("no brackets here"), True)

@test("other characters are ignored")
def _():
    eq(is_balanced("print('(' + x)"), False)
    eq(is_balanced("if (a < b) { return [a, b]; }"), True)

@test("returns a real bool")
def _():
    check(is_balanced("()") is True and is_balanced("(") is False, "return True or False, not a list or None")

@test("deep nesting")
def _():
    eq(is_balanced("(" * 20_000 + ")" * 20_000), True)
    eq(is_balanced("[" * 20_000 + "]" * 19_999), False)
```

```hint
Push openers. On a closer, the top of the stack must be its partner: a dict like `{")": "(", "]": "[", "}": "{"}` maps each closer to the opener it needs.
```

```hint
Check that the stack isn't empty before popping: `if not stack or stack.pop() != PAIRS[ch]: return False`.
```

```hint
At the end, every opener must have been closed, so the stack must be empty. `return not stack` turns that into a bool.
```
:::

:::challenge id=algo-trending-tags title="Trending tags" difficulty=easy
Write `trending(tags, k)` that returns the `k` most frequent tags in a list, most frequent first. Ties go **alphabetically**. If there are fewer than `k` distinct tags, return them all, ranked the same way. `k` is never negative.

```text
trending(["py", "js", "py", "go", "js", "py"], 2)       ->  ["py", "js"]
trending(["vue", "react", "react", "vue", "svelte"], 2)  ->  ["react", "vue"]
```

`Counter.most_common()` breaks ties by first appearance, not alphabetically, so it gets the second example wrong. Count with a `Counter`, then rank with `heapq.nsmallest` (or `nlargest`) and a key that encodes both rules.

```js
function trending(tags, k) {
  const counts = new Map();
  for (const tag of tags) counts.set(tag, (counts.get(tag) ?? 0) + 1);
  return [...counts.keys()]
    .sort((a, b) => counts.get(b) - counts.get(a) || (a < b ? -1 : 1))
    .slice(0, k);
}
```

```python starter
def trending(tags, k):
    ...
```

```python solution
import heapq
from collections import Counter


def trending(tags, k):
    counts = Counter(tags)
    return heapq.nsmallest(k, counts, key=lambda tag: (-counts[tag], tag))
```

```python tests
@test("the most frequent tags, most frequent first")
def _():
    eq(trending(["py", "js", "py", "go", "js", "py"], 2), ["py", "js"])
    eq(trending(["py", "js", "py", "go", "js", "py"], 1), ["py"])

@test("ties go alphabetically, not by first appearance")
def _():
    eq(trending(["vue", "react", "react", "vue", "svelte"], 2), ["react", "vue"])

@test("ties at the cut-off")
def _():
    eq(trending(["b", "a", "c", "a"], 2), ["a", "b"])
    eq(trending(["z", "y", "x"], 2), ["x", "y"])

@test("k larger than the number of distinct tags")
def _():
    eq(trending(["x", "y", "x"], 5), ["x", "y"])

@test("k = 0 and no tags")
def _():
    eq(trending(["a", "b"], 0), [])
    eq(trending([], 3), [])

@test("tags are case-sensitive")
def _():
    eq(trending(["Py", "py", "py"], 2), ["py", "Py"])

@test("returns a list of tags")
def _():
    result = trending(["a", "b", "a"], 2)
    check(isinstance(result, list), "return a list")
    eq(result, ["a", "b"])

@test("doesn't modify the input")
def _():
    tags = ["b", "a", "b"]
    trending(tags, 1)
    eq(tags, ["b", "a", "b"], "the input list changed")
```

```hint
`Counter(tags)` counts everything in one pass. Iterating over a `Counter` gives you its keys, the distinct tags.
```

```hint
Rank with a key tuple: `(-counts[tag], tag)` sorts by count descending, then by tag ascending. The smallest keys are the ones you want.
```

```hint
`heapq.nsmallest(k, counts, key=...)` returns the `k` tags with the smallest keys, in order. It returns `[]` for `k = 0` and everything when `k` is bigger than the number of tags.
```
:::

:::challenge id=algo-eval-rpn title="Evaluate RPN" difficulty=medium
Write `eval_rpn(tokens)` that evaluates an expression in reverse Polish notation, given as a list of string tokens. Tokens are integers (possibly negative, like `"-3"`) and the operators `+`, `-`, `*` and `/`.

- Division truncates toward zero, like `Math.trunc(a / b)` in JS: `"-7 2 /"` gives `-3`, not `-4`. It must also stay exact for big integers, so avoid floats.
- Dividing by zero raises `ZeroDivisionError`.
- A malformed expression raises `ValueError`: an operator without two operands, numbers left over at the end, or no tokens at all.

```text
eval_rpn(["2", "1", "+", "3", "*"])   ->  9      (2 + 1) * 3
eval_rpn(["4", "13", "5", "/", "+"])  ->  6      4 + 13 / 5
eval_rpn(["-7", "2", "/"])            ->  -3
```

```js
const OPS = {
  "+": (a, b) => a + b,
  "-": (a, b) => a - b,
  "*": (a, b) => a * b,
  "/": (a, b) => Math.trunc(a / b),
};

function evalRPN(tokens) {
  const stack = [];
  for (const token of tokens) {
    if (token in OPS) {
      if (stack.length < 2) throw new Error(`${token} needs two operands`);
      const b = stack.pop(), a = stack.pop();
      stack.push(OPS[token](a, b));
    } else {
      stack.push(Number(token));
    }
  }
  if (stack.length !== 1) throw new Error("malformed expression");
  return stack[0];
}
```

```python starter
def eval_rpn(tokens):
    ...
```

```python solution
import operator


def trunc_div(a, b):
    """Integer division that truncates toward zero, exactly."""
    q = abs(a) // abs(b)          # ZeroDivisionError when b == 0
    return q if (a < 0) == (b < 0) else -q


OPS = {"+": operator.add, "-": operator.sub, "*": operator.mul, "/": trunc_div}


def eval_rpn(tokens):
    stack = []
    for token in tokens:
        if token in OPS:
            if len(stack) < 2:
                raise ValueError(f"{token!r} needs two operands")
            right, left = stack.pop(), stack.pop()
            stack.append(OPS[token](left, right))
        else:
            stack.append(int(token))
    if len(stack) != 1:
        raise ValueError("malformed expression")
    return stack[0]
```

```python tests
@test("the examples")
def _():
    eq(eval_rpn(["2", "1", "+", "3", "*"]), 9)
    eq(eval_rpn(["4", "13", "5", "/", "+"]), 6)

@test("a longer expression")
def _():
    tokens = ["10", "6", "9", "3", "+", "-11", "*", "/", "*", "17", "+", "5", "+"]
    eq(eval_rpn(tokens), 22)

@test("the left operand is the one pushed first")
def _():
    eq(eval_rpn(["7", "2", "-"]), 5)
    eq(eval_rpn(["7", "2", "/"]), 3)

@test("negative numbers are numbers, not operators")
def _():
    eq(eval_rpn(["-3", "4", "+"]), 1)
    eq(eval_rpn(["3", "-4", "*"]), -12)

@test("division truncates toward zero")
def _():
    eq(eval_rpn(["-7", "2", "/"]), -3)
    eq(eval_rpn(["7", "-2", "/"]), -3)
    eq(eval_rpn(["-7", "-2", "/"]), 3)
    eq(eval_rpn(["1", "3", "/"]), 0)

@test("division stays exact for big integers")
def _():
    eq(eval_rpn(["100000000000000000001", "1", "/"]), 100000000000000000001)
    eq(eval_rpn(["-100000000000000000001", "10", "/"]), -10000000000000000000)

@test("a single number")
def _():
    eq(eval_rpn(["42"]), 42)
    eq(eval_rpn(["-5"]), -5)

@test("an operator without two operands raises ValueError")
def _():
    raises(ValueError, eval_rpn, ["+"])
    raises(ValueError, eval_rpn, ["1", "+"])

@test("leftover numbers or no tokens raise ValueError")
def _():
    raises(ValueError, eval_rpn, ["1", "2"])
    raises(ValueError, eval_rpn, [])

@test("dividing by zero raises ZeroDivisionError")
def _():
    raises(ZeroDivisionError, eval_rpn, ["1", "0", "/"])

@test("returns an int")
def _():
    check(type(eval_rpn(["6", "3", "/"])) is int, "return an int, not a float")
```

```hint
Push `int(token)` for numbers. Check whether a token is an operator with `token in OPS` rather than by its first character: `"-3"` starts with `-` but is a number.
```

```hint
On an operator, pop the right operand first: `right, left = stack.pop(), stack.pop()`. Raise `ValueError` if fewer than two are available, and again at the end unless exactly one number is left.
```

```hint
For truncating division, divide the absolute values with `//`, then make the result negative when exactly one operand is negative. `int(a / b)` passes the small cases but loses digits on big integers.
```
:::

:::challenge id=algo-daily-temperatures title="Days until warmer" difficulty=medium
Write `days_until_warmer(temps)` that returns, for each day, how many days you'd wait for a **strictly** warmer temperature, or `0` if no warmer day comes.

```text
days_until_warmer([73, 74, 75, 71, 69, 72, 76, 73])  ->  [1, 1, 4, 2, 1, 1, 0, 0]
```

The brute force below scans ahead from every day, which is O(n²) on a long cold spell. Use a monotonic stack of the days still waiting for a warmer one, for O(n) in total.

```js
// Brute force: scan ahead from every day
const daysUntilWarmer = (temps) =>
  temps.map((t, i) => {
    for (let j = i + 1; j < temps.length; j++) if (temps[j] > t) return j - i;
    return 0;
  });
```

```python starter
def days_until_warmer(temps):
    ...
```

```python solution
def days_until_warmer(temps):
    waits = [0] * len(temps)
    waiting = []                         # indices of colder days, temps never rising
    for day, temp in enumerate(temps):
        while waiting and temps[waiting[-1]] < temp:
            earlier = waiting.pop()
            waits[earlier] = day - earlier
        waiting.append(day)
    return waits
```

```python tests
@test("the example")
def _():
    eq(days_until_warmer([73, 74, 75, 71, 69, 72, 76, 73]), [1, 1, 4, 2, 1, 1, 0, 0])

@test("no days and a single day")
def _():
    eq(days_until_warmer([]), [])
    eq(days_until_warmer([50]), [0])

@test("rising temperatures")
def _():
    eq(days_until_warmer([30, 40, 50, 60]), [1, 1, 1, 0])

@test("falling temperatures never get warmer")
def _():
    eq(days_until_warmer([60, 50, 40, 30]), [0, 0, 0, 0])

@test("an equal temperature isn't warmer")
def _():
    eq(days_until_warmer([70, 70, 71]), [2, 1, 0])
    eq(days_until_warmer([5, 5, 5]), [0, 0, 0])

@test("negative and fractional temperatures")
def _():
    eq(days_until_warmer([-5, -10, -3]), [2, 1, 0])
    eq(days_until_warmer([20.5, 20.4, 21.0]), [2, 1, 0])

@test("doesn't modify the input")
def _():
    temps = [73, 74, 75, 71]
    days_until_warmer(temps)
    eq(temps, [73, 74, 75, 71], "the input list changed")

@test("a 100,000-day cold spell in well under a second")
def _():
    n = 100_000
    temps = list(range(n, 0, -1)) + [n + 1]          # colder every day, then a heatwave
    eq(days_until_warmer(temps), [n - day for day in range(n)] + [0])
```

```hint
Keep a stack of the *indices* of days that haven't seen a warmer day yet. Their temperatures never rise from the bottom of the stack to the top.
```

```hint
When a new day is warmer than the day on top of the stack, it's the answer for that day: pop it and record the distance `today - earlier`. Keep popping while the new day is still warmer.
```

```hint
Days still on the stack at the end never got warmer, so they keep the `0` you started with: `waits = [0] * len(temps)`.
```
:::

:::challenge id=algo-running-median title="Running median" difficulty=hard
Write a class `RunningMedian` for a stream of numbers:

- `add(x)` records a number in O(log n).
- `median()` returns the median of the numbers so far in O(1): the middle one for an odd count, or the mean of the two middle ones for an even count. It raises `ValueError` before anything has been added.
- `len()` returns how many numbers have been added.

```text
rm = RunningMedian()
rm.add(5)      rm.median()  ->  5
rm.add(15)     rm.median()  ->  10.0
rm.add(1)      rm.median()  ->  5
rm.add(3)      rm.median()  ->  4.0
```

Keep two heaps: a max-heap with the smaller half and a min-heap with the larger half, balanced so the lower half has the same size or one more. The 3.14 functions `heappush_max`, `heappop_max` and `heappushpop_max` handle the max-heap, or you can store negated numbers in a plain `heapq` heap.

```js
// Re-sorting on every call: O(n log n) per median
class RunningMedian {
  #xs = [];
  add(x) { this.#xs.push(x); }
  median() {
    if (!this.#xs.length) throw new RangeError("no numbers yet");
    const s = this.#xs.toSorted((a, b) => a - b), mid = s.length >> 1;
    return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
  }
  get length() { return this.#xs.length; }
}
```

```python starter
class RunningMedian:
    def add(self, x):
        ...

    def median(self):
        ...
```

```python solution
import heapq


class RunningMedian:
    def __init__(self):
        self._low = []     # max-heap of the smaller half (the 3.14 *_max functions)
        self._high = []    # min-heap of the larger half

    def add(self, x):
        # Route x through the lower half, so the largest of low ∪ {x} moves up...
        heapq.heappush(self._high, heapq.heappushpop_max(self._low, x))
        # ...then give one back if the upper half got bigger.
        if len(self._high) > len(self._low):
            heapq.heappush_max(self._low, heapq.heappop(self._high))

    def median(self):
        if not self._low:
            raise ValueError("median() of an empty stream")
        if len(self._low) > len(self._high):
            return self._low[0]
        return (self._low[0] + self._high[0]) / 2

    def __len__(self):
        return len(self._low) + len(self._high)
```

```python tests
import statistics

def _medians(numbers):
    rm = RunningMedian()
    result = []
    for x in numbers:
        rm.add(x)
        result.append(rm.median())
    return result

@test("the median of one number is that number")
def _():
    eq(_medians([7]), [7])

@test("the example stream")
def _():
    eq(_medians([5, 15, 1, 3]), [5, 10, 5, 4])

@test("an even count averages the two middle numbers")
def _():
    eq(_medians([1, 2]), [1, 1.5])
    eq(_medians([2, 1, 4, 3]), [2, 1.5, 2, 2.5])

@test("duplicates")
def _():
    eq(_medians([2, 2, 2, 2]), [2, 2, 2, 2])
    eq(_medians([1, 1, 5, 5]), [1, 1, 1, 3])

@test("negative numbers and floats")
def _():
    eq(_medians([-1, -5, -3]), [-1, -3, -3])
    eq(_medians([1.5, 2.5]), [1.5, 2.0])

@test("works for ascending and descending streams")
def _():
    eq(_medians([1, 2, 3, 4, 5]), [1, 1.5, 2, 2.5, 3])
    eq(_medians([5, 4, 3, 2, 1]), [5, 4.5, 4, 3.5, 3])

@test("median() before any add raises ValueError")
def _():
    raises(ValueError, RunningMedian().median)

@test("median() doesn't consume anything")
def _():
    rm = RunningMedian()
    for x in [3, 1, 2]:
        rm.add(x)
    eq(rm.median(), 2)
    eq(rm.median(), 2)
    eq(len(rm), 3)

@test("len() counts the numbers added")
def _():
    rm = RunningMedian()
    eq(len(rm), 0)
    for x in [4, 4, 1]:
        rm.add(x)
    eq(len(rm), 3)

@test("30,000 numbers with a median after each one, in well under a second")
def _():
    n = 30_000
    stream = [(i * 7919) % n for i in range(n)]       # 0 .. n - 1, shuffled
    rm = RunningMedian()
    for count, x in enumerate(stream, start=1):
        rm.add(x)
        median = rm.median()
        if count in (1, 2, 999, 1_000, n):
            eq(median, statistics.median(stream[:count]), f"median after {count} numbers")

@test("keeps the halves in heaps")
def _():
    requires_import("heapq", "use two heapq heaps: a sorted list with insort costs O(n) per add")
```

```hint
Keep `low` (a max-heap of the smaller half) and `high` (a min-heap of the larger half). The median only ever needs `low[0]` and `high[0]`.
```

```hint
A simple way to insert: push `x` into `low`, move `low`'s largest into `high`, and if `high` is now bigger than `low`, move `high`'s smallest back. `heapq.heappushpop_max(low, x)` does the first two steps at once.
```

```hint
With `len(low) == len(high)` or `len(low) == len(high) + 1` always true, an odd count's median is `low[0]` and an even count's is `(low[0] + high[0]) / 2`.
```
:::
