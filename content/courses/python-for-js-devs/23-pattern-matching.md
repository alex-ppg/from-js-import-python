---
title: Structural Pattern Matching
part: Advanced Python
summary: match/case is not switch. Destructure lists, dicts and objects in one step, with guards and captures.
minutes: 35
---

`match`/`case` (3.10+) looks like `switch`, and for plain values it behaves like a better one: no fall-through, no `break`, alternatives with `|`. But its real job is **destructuring with tests attached**. A `case` describes the *shape* of a value (a two-item list, a dict with a `"type"` key, a `Point` whose `x` is `0`) and binds names to the parts it pulls out. Think of JS destructuring and TypeScript's discriminated-union narrowing fused into one statement.

One rule matters more than any other: in a pattern, **a bare name captures**. `case RED:` doesn't compare against your constant. It assigns to it.

## From `switch` to `match`

:::compare
```js
function describe(status) {
  switch (status) {
    case 200:
      return "ok";
    case 301:
    case 302:
      return "redirect";
    case 404:
      return "not found";
    default:
      return "unexpected";
  }
}
```
```python
def describe(status):
    match status:
        case 200:
            return "ok"
        case 301 | 302:
            return "redirect"

        case 404:
            return "not found"
        case _:
            return "unexpected"


```
:::

For literals, `match` is a tidier `switch`: cases are tried top to bottom, the first match wins, nothing falls through, `|` combines alternatives, and `_` is the wildcard that matches anything. [Control Flow](lesson:control-flow) covers that switch-shaped corner. This lesson is about everything else, but two details of the basics deserve a closer look first.

`match` is a statement like `if`, not an expression. When no case matches, **nothing happens**: no error and no implicit default. A variable that only some of the cases assign is the classic way this bites:

```python run raises
def label(status):
    match status:
        case 200 | 201 | 204:
            text = "success"
        case 404:
            text = "not found"
    return text            # nothing matched 500, so text was never assigned

print(label(201))
print(label(500))
```

Add a `case _:` whenever falling through would be a bug.

:::note Literals compare with `==`, singletons with `is`
A literal pattern such as `case 1:` succeeds when `subject == 1`, so it also matches `1.0` and `True`. That's looser than `switch`, which uses `===`. The three singletons are the exception: `case None:`, `case True:` and `case False:` compare with `is`.
:::

:::quiz output
What does this print?

```python
def kind(x):
    match x:
        case 1:
            return "one"
        case True:
            return "true"
    return "neither"

print(kind(True))
```

- [x] `one`
- [ ] `true`
- [ ] `neither`

`True == 1`, and `case 1:` comes first. Swap the two cases and `kind(True)` returns `"true"`, because `case True:` checks identity, while `kind(1)` still returns `"one"`.
:::

## Bare names capture

:::compare
```js
const RED = "red";

switch (color) {
  case RED: // compares: color === RED
    stop();
    break;
}
```
```python
RED = "red"

match color:
    case RED:      # binds: RED = color, always matches!
        stop()


```
:::

This is the trap that [Control Flow](lesson:control-flow) previewed. In a pattern, a bare name is a **capture pattern**: it matches any value and binds it to that name. `case RED:` doesn't compare `color` with your constant. It assigns `color` to `RED` and succeeds every time. Python refuses to compile a capture that would make the cases after it unreachable:

```python run raises
RED = "red"
GREEN = "green"

def describe(color):
    match color:
        case RED:
            return "stop"
        case GREEN:
            return "go"
```

As the **last** case, though, a capture compiles and silently matches everything. At module level it overwrites your constant, and inside a function it creates a local variable with the same name.

:::gotcha Bare names bind, dotted names compare
Python compares against a name only when it's **dotted**, as in `Color.RED`, `HTTPStatus.OK` or `settings.MODE`. Keep the constants you match on in an `Enum` (see [Enums](lesson:dataclasses-and-enums)), a class or a module, or test a bare constant with a guard: `case c if c == RED:`.
:::

```python run
from enum import Enum

class Color(Enum):
    RED = "red"
    GREEN = "green"

def describe(color):
    match color:
        case Color.RED:            # dotted: compared with ==
            return "stop"
        case Color.GREEN:
            return "go"
        case _:
            return "unknown"

print(describe(Color.RED), describe(Color.GREEN), describe("red"))
```

:::quiz output
What does this print?

```python
LIMIT = 10

def check(n):
    match n:
        case 0:
            return "zero"
        case LIMIT:
            return "limit"

print(check(3))
```

- [ ] `None`
- [x] `limit`
- [ ] `zero`
- [ ] `SyntaxError`

`case LIMIT:` is a capture pattern. It's the last case, so it compiles, matches `3`, and binds a local variable named `LIMIT`. There's no `SyntaxError` because no case follows it.
:::

## Sequence patterns

:::compare
```js
const [cmd, ...args] = line.trim().split(/\s+/);

if (cmd === "go" && args.length === 1) {
  move(args[0]);
} else if (cmd === "take" && args.length >= 1) {
  take(args);
} else if (cmd === "quit" && args.length === 0) {
  quit();
} else {
  unknown(line);
}
```
```python
match line.split():
    case ["go", direction]:
        move(direction)

    case ["take", item, *more]:
        take([item, *more])

    case ["quit"]:
        quit()

    case _:
        unknown(line)
```
:::

A sequence pattern matches a list or tuple (any sequence, in fact) **of exactly that length**, compares the literal items, and binds the names. `*name` collects the remaining items into a list. It can sit anywhere in the pattern, but only once. JS destructuring hands you `undefined` for missing items; a sequence pattern that's the wrong length simply doesn't match, so the length checks come for free. `[]` matches only an empty sequence, `[*_]` matches any sequence, and square brackets and parentheses mean the same thing in a pattern.

Command parsing is the classic use:

```python run
def run(line):
    match line.lower().split():
        case []:
            return "say something"
        case ["go", direction]:
            return f"you walk {direction}"
        case ["take", item, *more]:
            return f"you take {', '.join([item, *more])}"
        case ["quit" | "exit"]:
            return "bye"
        case [verb, *_]:
            return f"I don't know how to {verb}"

for line in ["go north", "Take lamp key", "take", "exit", ""]:
    print(f"{line!r:16} -> {run(line)}")
```

`"take"` on its own falls through to the last case, because `["take", item, *more]` needs at least two words.

:::gotcha Strings don't match sequence patterns
`str`, `bytes` and `bytearray` are sequences, but sequence patterns deliberately skip them, so `case [first, *rest]:` never matches `"abc"`. Neither do sets, dicts or generators, which aren't sequences. Use `list(text)` as the subject if you really want to match characters.
:::

:::quiz output
What does this print?

```python
match (1, 2, 3):
    case [first, *rest]:
        print(type(rest).__name__, rest)
```

- [ ] `tuple (2, 3)`
- [x] `list [2, 3]`
- [ ] `tuple [2, 3]`

A list pattern matches a tuple too, because brackets don't constrain the type. A star capture always builds a `list`, whatever the subject's type.
:::

## Mapping patterns

:::compare
```js
function handle(event) {
  if (event.type === "click" && Array.isArray(event.pos)) {
    const [x, y] = event.pos;
    return `click at ${x},${y}`;
  }
  if (event.type === "key") {
    const { type, ...rest } = event;
    return `key ${JSON.stringify(rest)}`;
  }
  return "ignored";
}
```
```python
def handle(event):
    match event:
        case {"type": "click", "pos": [x, y]}:
            return f"click at {x},{y}"


        case {"type": "key", **rest}:
            return f"key {rest}"


        case _:
            return "ignored"

```
:::

A mapping pattern matches any dict (any `Mapping`, in fact) that has **at least** the listed keys, with values that match their sub-patterns. Extra keys are ignored, which is exactly what you want for JSON payloads that grow new fields over time. `**rest` collects the keys you didn't mention into a new dict. Keys must be literals or dotted names, while values can be any pattern.

That makes Redux-style reducers over dict actions read like a table of cases:

```python run
def todos(state, action):
    match action:
        case {"type": "add", "text": text}:
            return [*state, {"text": text, "done": False}]
        case {"type": "remove", "index": index}:
            return state[:index] + state[index + 1:]
        case {"type": "clear"}:
            return []
        case _:
            return state                 # unknown action: same state

state = []
for action in [
    {"type": "add", "text": "write lesson"},
    {"type": "add", "text": "ship it", "meta": {"from": "cli"}},   # extra key: fine
    {"type": "remove", "index": 0},
    {"type": "undo"},
]:
    state = todos(state, action)
    print(state)
```

:::gotcha `{}` means "any mapping", not "empty"
Because extra keys are ignored, `case {}:` matches **every** dict, including non-empty ones. Test for an empty dict with a guard (`case {} if not data:`) or a plain `if`.
:::

Patterns nest to any depth, so one `case` can check the shape of a whole JSON document and pull out the pieces you need. That's a compact way to validate API responses, with a final catch-all for anything unexpected:

```python run
import json

def summarize(body):
    match json.loads(body):
        case {"status": "ok", "data": {"users": [first, *others]}}:
            return f"{first['name']} and {len(others)} more"
        case {"status": "ok", "data": {"users": []}}:
            return "no users"
        case {"status": "error", "error": {"message": message}}:
            return f"failed: {message}"
        case other:
            raise ValueError(f"unexpected response: {other!r}")

print(summarize('{"status": "ok", "data": {"users": [{"name": "Ada"}, {"name": "Linus"}]}}'))
print(summarize('{"status": "ok", "data": {"users": []}}'))
print(summarize('{"status": "error", "error": {"message": "rate limited", "code": 429}}'))
```

## Class patterns

:::compare
```ts
function describe(p: Point): string {
  if (p.x === 0 && p.y === 0) return "origin";
  if (p.x === 0) return `on the y axis at ${p.y}`;
  if (p.y === 0) return `on the x axis at ${p.x}`;
  return `at ${p.x},${p.y}`;
}
```
```python
def describe(p: Point) -> str:
    match p:
        case Point(x=0, y=0):
            return "origin"
        case Point(x=0, y=y):
            return f"on the y axis at {y}"
        case Point(x=x, y=0):
            return f"on the x axis at {x}"
        case Point(x=x, y=y):
            return f"at {x},{y}"
```
:::

`Point(x=0, y=y)` means: `isinstance(subject, Point)`, then `subject.x` matches `0`, then bind `subject.y` to `y`. The parentheses don't call or construct anything. They hold sub-patterns for attributes, and `Point()` with nothing inside is a plain `isinstance` check.

Positional sub-patterns, as in `Point(0, y)`, need the class to say which attribute each position refers to. That's the `__match_args__` tuple, which `@dataclass` and `NamedTuple` generate from the field order. A plain class without one raises `TypeError: Point() accepts 0 positional sub-patterns (2 given)`.

```python run
from dataclasses import dataclass

@dataclass
class Point:
    x: float
    y: float

def describe(p):
    match p:
        case Point(0, 0):              # positional, via __match_args__
            return "origin"
        case Point(x=0, y=y):          # keyword
            return f"on the y axis at {y}"
        case Point():                  # just an isinstance check
            return f"somewhere: {p}"
        case _:
            return "not a point"

print(Point.__match_args__)
for value in [Point(0, 0), Point(0, 5), Point(3, 4), (0, 0)]:
    print(describe(value))
```

Built-in types work as class patterns too. For `bool`, `bytearray`, `bytes`, `dict`, `float`, `frozenset`, `int`, `list`, `set`, `str` and `tuple`, a single positional sub-pattern matches the whole subject, so `case str(name):` checks the type and binds the value in one go:

```python run
def kind(value):
    match value:
        case bool():                       # before int(): True is an int
            return "bool"
        case int(n) | float(n):
            return f"number {n}"
        case str(s):
            return f"string of length {len(s)}"
        case None:
            return "null"
        case [*items]:
            return f"list of {len(items)}"
        case dict():
            return "object"

for value in [True, 3, 2.5, "hi", None, [1, 2], {"a": 1}]:
    print(repr(value), "->", kind(value))
```

:::gotcha Check `bool` before `int`
`bool` is a subclass of `int`, so `case int():` happily matches `True` and `False`. When both matter, put `case bool():` first. The same ordering rule applies to any class hierarchy: specific subclasses before their parents.
:::

## Guards and `as`

:::compare
```js
function review(order) {
  switch (true) {
    case order.total > 1000:
      return "manual review";
    case order.items.length === 0:
      return "empty order";
    default:
      return "auto-approve";
  }
}
```
```python
def review(order):
    match order:
        case {"total": total} if total > 1000:
            return "manual review"
        case {"items": []}:
            return "empty order"
        case _:
            return "auto-approve"


```
:::

A **guard**, an `if condition` after the pattern, is checked only once the pattern has matched, and it can use the names the pattern just bound. If the guard is false, matching moves on to the next case. It replaces the `switch (true)` idiom. **`as`** binds whatever a sub-pattern matched, which is most useful with alternatives and class patterns: `case ("png" | "jpg") as ext:` or `case [Point() as start, *_]:`.

```python run
def route(request):
    match request:
        case {"method": ("GET" | "HEAD") as method, "path": path} if path.startswith("/static/"):
            return f"{method} static file {path}"
        case {"method": "GET", "path": "/"}:
            return "home page"
        case {"method": ("POST" | "PUT") as method, "body": dict() as body}:
            return f"{method} with {len(body)} fields"
        case {"method": method}:
            return f"405: {method} not allowed"

print(route({"method": "HEAD", "path": "/static/app.css"}))
print(route({"method": "GET", "path": "/"}))
print(route({"method": "PUT", "path": "/users/1", "body": {"name": "Ada"}}))
print(route({"method": "DELETE", "path": "/users/1"}))
```

:::gotcha Captures outlive the `match`
Names bound by the case that matched stay bound after the `match` statement ends, like a loop variable (Python has [no block scope](lesson:variables-and-scope)). A pattern that matched but whose guard failed also leaves its names bound. Only read capture variables inside the case that matched.
:::

Every alternative in an `|` must bind the same names, so `case [x] | [x, _]:` is fine and `case [x] | [y]:` is a `SyntaxError`.

## Nested patterns: an expression evaluator

Expression trees are where nesting shines. TypeScript models them as a discriminated union: object types tagged with a literal `kind`, narrowed by `switch (e.kind)`. In Python the usual model is a union of small dataclasses, where **the class is the tag**, and one class pattern narrows the type and unpacks the fields in a single step.

:::compare
```ts
type Expr =
  | { kind: "num"; value: number }
  | { kind: "var"; name: string }
  | { kind: "binop"; op: string; left: Expr; right: Expr };

function evaluate(e: Expr, env: Record<string, number>): number {
  switch (e.kind) {
    case "num":
      return e.value;
    case "var":
      return env[e.name];
    case "binop": {
      const isZero = (x: Expr) => x.kind === "num" && x.value === 0;
      if (e.op === "*" && (isZero(e.left) || isZero(e.right))) return 0;
      const left = evaluate(e.left, env);
      const right = evaluate(e.right, env);
      if (e.op === "+") return left + right;
      if (e.op === "*") return left * right;
      throw new Error(`unknown operator ${e.op}`);
    }
  }
}

// (x + 2) * y
const expr: Expr = {
  kind: "binop", op: "*",
  left: { kind: "binop", op: "+", left: { kind: "var", name: "x" },
          right: { kind: "num", value: 2 } },
  right: { kind: "var", name: "y" },
};
console.log(evaluate(expr, { x: 3, y: 10 }));
```
```python run
from dataclasses import dataclass

type Expr = Num | Var | BinOp

@dataclass
class Num:
    value: float

@dataclass
class Var:
    name: str

@dataclass
class BinOp:
    op: str
    left: Expr
    right: Expr

def evaluate(expr: Expr, env: dict[str, float]) -> float:
    match expr:
        case Num(value):
            return value
        case Var(name):
            return env[name]
        case BinOp("*", Num(0), _) | BinOp("*", _, Num(0)):
            return 0                    # never evaluates the other side
        case BinOp("+", left, right):
            return evaluate(left, env) + evaluate(right, env)
        case BinOp("*", left, right):
            return evaluate(left, env) * evaluate(right, env)
        case BinOp(op, _, _):
            raise ValueError(f"unknown operator {op!r}")

expr = BinOp("*", BinOp("+", Var("x"), Num(2)), Var("y"))
print(evaluate(expr, {"x": 3, "y": 10}))
print(evaluate(BinOp("*", Num(0), Var("unset")), {}))
```
:::

`BinOp("*", Num(0), _)` reads as "a multiplication whose left operand is the number zero": a literal, a nested class pattern and a wildcard in one expression. Try adding a `case BinOp("-", left, right):`, or feed it an unknown operator.

Type checkers understand `match`. They narrow the subject inside each case, and an `assert_never` in a final wildcard case turns a forgotten variant into a type error, the job `const _exhaustive: never = e` does in TypeScript. At runtime, `assert_never` raises if it's ever reached ([Type Hints](lesson:type-hints) has the details):

```python
from typing import assert_never

def evaluate(expr: Expr, env: dict[str, float]) -> float:
    match expr:
        case Num(value):
            return value
        case Var(name):
            return env[name]
        case BinOp(op, left, right):
            return apply(op, evaluate(left, env), evaluate(right, env))
        case _:
            assert_never(expr)   # a checker error if a variant is unhandled
```

:::pythonic Dispatch on shape, not on tags
JS code often adds a `kind` or `type` field just so a `switch` has something to look at. With class patterns the type is the tag, and with mapping patterns you can dispatch on whichever keys a payload happens to have. Reach for `match` when the decision depends on structure. For a decision about a single value, `if`/`elif` or a dict lookup is often still the clearer choice.
:::

## Compared with the TC39 proposal

:::compare
```js
// TC39 pattern matching (Stage 1, syntax still evolving)
const message = match (res) {
  when { status: 200, let body }: render(body);
  when { status: 301 or 302, let location }: redirect(location);
  default: fail(res);
};
```
```python
match res:
    case {"status": 200, "body": body}:
        message = render(body)
    case {"status": 301 | 302, "location": location}:
        message = redirect(location)
    case _:
        message = fail(res)
```
:::

JavaScript may get pattern matching one day: the TC39 proposal has sat at Stage 1 for years. The ideas are close to Python's, with three differences worth knowing:

- The proposal's `match` is an **expression** that produces a value. Python's is a statement, so you assign or `return` inside each case.
- The proposal makes bindings explicit with `let`, the reverse of Python, where bare names bind and dotted names compare.
- A proposal `match` with no matching arm throws a `TypeError`. Python's silently does nothing, so add a `case _:` whenever falling through would be a bug.

## Cheat sheet

| JavaScript / TypeScript | Python | Notes |
| --- | --- | --- |
| `switch (x) { case 1: ... }` | `match x:` then `case 1:` | 3.10+; no fall-through, no `break` |
| `case 1: case 2:` | `case 1 \| 2:` | |
| `default:` | `case _:` | without it, no match means nothing happens |
| `case RED:` (a constant) | `case Color.RED:` | bare names capture; dotted names compare |
| `const [a, b] = xs` plus a length check | `case [a, b]:` | exact length; lists and tuples alike |
| `const [first, ...rest] = xs` | `case [first, *rest]:` | `rest` is always a list |
| `const { type, ...rest } = obj` | `case {"type": t, **rest}:` | extra keys are ignored |
| `if (obj.type === "click")` | `case {"type": "click"}:` | |
| `x instanceof Point` | `case Point():` | |
| check `p.x === 0`, read `p.y` | `case Point(x=0, y=y):` | positional needs `__match_args__` |
| `typeof x === "string"` | `case str(s):` | binds the whole value |
| `switch (true)` with conditions | `case pattern if condition:` | a guard |
| no equivalent | `case ("png" \| "jpg") as ext:` | `as` binds a sub-pattern |
| `const _: never = x` | `case _: assert_never(x)` | exhaustiveness via a type checker |
| TC39 `match (x) { when ... }` | `match x:` | Python's is a statement |

## Challenges

:::challenge id=match-parse-command title="Parse a command" difficulty=easy
Write `parse_command(text)` for a text adventure. Lower-case the input, split it into words, and `match` on the list:

| Input | Result |
| --- | --- |
| `"go <direction>"`, exactly two words | `("move", direction)` |
| `"north"`, `"south"`, `"east"` or `"west"` on its own | `("move", that word)` |
| `"take"` followed by one or more items | `("take", [item, ...])` |
| `"take"` on its own | `("error", "take what?")` |
| `"quit"` or `"exit"` | `("quit",)` |
| anything else, including an empty string | `("unknown", text)`, with the original text |

```js
function parseCommand(text) {
  const words = text.toLowerCase().split(/\s+/).filter(Boolean);
  const [verb, ...args] = words;
  if (verb === "go" && args.length === 1) return ["move", args[0]];
  if (words.length === 1 && ["north", "south", "east", "west"].includes(verb)) return ["move", verb];
  if (verb === "take") return args.length ? ["take", args] : ["error", "take what?"];
  if (words.length === 1 && (verb === "quit" || verb === "exit")) return ["quit"];
  return ["unknown", text];
}
```

```python starter
def parse_command(text):
    ...
```

```python solution
def parse_command(text):
    match text.lower().split():
        case ["go", direction]:
            return ("move", direction)
        case [("north" | "south" | "east" | "west") as direction]:
            return ("move", direction)
        case ["take"]:
            return ("error", "take what?")
        case ["take", *items]:
            return ("take", items)
        case ["quit" | "exit"]:
            return ("quit",)
        case _:
            return ("unknown", text)
```

```python tests
@test("go <direction> moves")
def _():
    eq(parse_command("go north"), ("move", "north"))
    eq(parse_command("GO  West"), ("move", "west"))

@test("a bare direction moves too")
def _():
    eq(parse_command("south"), ("move", "south"))
    eq(parse_command("East"), ("move", "east"))

@test("take collects one or more items into a list")
def _():
    eq(parse_command("take lamp"), ("take", ["lamp"]))
    eq(parse_command("take lamp rusty key"), ("take", ["lamp", "rusty", "key"]))

@test("take on its own is an error")
def _():
    eq(parse_command("take"), ("error", "take what?"))

@test("quit and exit both quit")
def _():
    eq(parse_command("quit"), ("quit",))
    eq(parse_command("Exit"), ("quit",))

@test("anything else is unknown, with the original text")
def _():
    eq(parse_command("go"), ("unknown", "go"))
    eq(parse_command("go north now"), ("unknown", "go north now"))
    eq(parse_command("Dance wildly"), ("unknown", "Dance wildly"))
    eq(parse_command("quit now"), ("unknown", "quit now"))
    eq(parse_command(""), ("unknown", ""))

@test("uses a match statement with sequence patterns")
def _():
    requires_syntax(ast.MatchSequence, "match on text.lower().split() with list patterns")
```

```hint
`text.lower().split()` gives you a list of words, which sequence patterns can match by length and content: `case ["go", direction]:`.
```

```hint
Alternatives can be combined with `as` to keep the matched word: `case [("north" | "south" | "east" | "west") as direction]:`.
```

```hint
Order matters: put `case ["take"]:` before `case ["take", *items]:`, because `*items` also matches an empty rest.
```
:::

:::challenge id=match-cart-reducer title="A cart reducer" difficulty=medium
Write a Redux-style reducer `cart_reducer(state, action)`. The state is a dict like `{"items": {"tea": 2}, "coupon": None}`, mapping SKUs to quantities. Handle these actions with mapping patterns:

| Action | Effect |
| --- | --- |
| `{"type": "add", "sku": str, "qty": int}` | add `qty` to that SKU, if `qty` is a positive `int` |
| `{"type": "remove", "sku": str}` | drop the SKU (an unknown SKU changes nothing) |
| `{"type": "apply_coupon", "code": str}` | set `"coupon"` to the code |
| `{"type": "clear"}` | `{"items": {}, "coupon": None}` |

As in Redux, never mutate `state`: return a new dict. Actions may carry extra keys, which you should ignore. Any other action, including a malformed one (a missing field, a `qty` that isn't a positive `int`, an unknown `type`), returns the **same** `state` object unchanged.

```js
function cartReducer(state, action) {
  switch (action.type) {
    case "add": {
      if (!Number.isInteger(action.qty) || action.qty <= 0) return state;
      const qty = (state.items[action.sku] ?? 0) + action.qty;
      return { ...state, items: { ...state.items, [action.sku]: qty } };
    }
    case "remove": {
      const { [action.sku]: _, ...items } = state.items;
      return { ...state, items };
    }
    // ...apply_coupon and clear
    default:
      return state;
  }
}
```

```python starter
def cart_reducer(state, action):
    ...
```

```python solution
def cart_reducer(state, action):
    items = state["items"]
    match action:
        case {"type": "add", "sku": str(sku), "qty": int(qty)} if qty > 0:
            return {**state, "items": {**items, sku: items.get(sku, 0) + qty}}
        case {"type": "remove", "sku": str(sku)}:
            return {**state, "items": {k: v for k, v in items.items() if k != sku}}
        case {"type": "apply_coupon", "code": str(code)}:
            return {**state, "coupon": code}
        case {"type": "clear"}:
            return {"items": {}, "coupon": None}
        case _:
            return state
```

```python tests
def empty_cart():
    return {"items": {}, "coupon": None}

@test("add puts a new SKU in the cart")
def _():
    eq(cart_reducer(empty_cart(), {"type": "add", "sku": "tea", "qty": 2}), {"items": {"tea": 2}, "coupon": None})

@test("add increases the quantity of an existing SKU")
def _():
    state = {"items": {"tea": 2}, "coupon": None}
    eq(cart_reducer(state, {"type": "add", "sku": "tea", "qty": 3})["items"], {"tea": 5})

@test("remove drops the SKU and ignores unknown SKUs")
def _():
    state = {"items": {"tea": 2, "mug": 1}, "coupon": None}
    eq(cart_reducer(state, {"type": "remove", "sku": "tea"})["items"], {"mug": 1})
    eq(cart_reducer(state, {"type": "remove", "sku": "jam"})["items"], {"tea": 2, "mug": 1})

@test("apply_coupon sets the code and keeps the items")
def _():
    state = {"items": {"tea": 2}, "coupon": None}
    eq(cart_reducer(state, {"type": "apply_coupon", "code": "SPRING10"}), {"items": {"tea": 2}, "coupon": "SPRING10"})

@test("clear empties the cart and the coupon")
def _():
    state = {"items": {"tea": 2}, "coupon": "SPRING10"}
    eq(cart_reducer(state, {"type": "clear"}), {"items": {}, "coupon": None})

@test("extra keys in an action are ignored")
def _():
    action = {"type": "add", "sku": "tea", "qty": 1, "source": "homepage"}
    eq(cart_reducer(empty_cart(), action)["items"], {"tea": 1})

@test("malformed and unknown actions return the same state object")
def _():
    state = {"items": {"tea": 2}, "coupon": None}
    for action in [
        {"type": "add", "sku": "tea"},               # no qty
        {"type": "add", "sku": "tea", "qty": "3"},   # qty isn't an int
        {"type": "add", "sku": "tea", "qty": 0},     # qty isn't positive
        {"type": "apply_coupon"},                    # no code
        {"type": "checkout"},                        # unknown type
        {"sku": "tea"},                              # no type at all
    ]:
        check(cart_reducer(state, action) is state, f"{action} should return the same state")

@test("never mutates the previous state")
def _():
    state = {"items": {"tea": 2}, "coupon": None}
    cart_reducer(state, {"type": "add", "sku": "tea", "qty": 1})
    cart_reducer(state, {"type": "remove", "sku": "tea"})
    cart_reducer(state, {"type": "apply_coupon", "code": "X"})
    eq(state, {"items": {"tea": 2}, "coupon": None})

@test("uses mapping patterns")
def _():
    requires_syntax(ast.MatchMapping, 'match on the action dict, e.g. case {"type": "add", ...}:')
```

```hint
A mapping pattern only needs the keys you list, so `case {"type": "clear"}:` matches no matter what else the action carries.
```

```hint
Class patterns check value types inside a mapping pattern: `"qty": int(qty)` matches only an `int` and binds it. Add a guard for the sign: `... if qty > 0`.
```

```hint
Build new dicts with unpacking, `{**state, "items": {**items, sku: new_qty}}`, and let `case _:` return `state` itself.
```
:::

:::challenge id=match-simplify title="Simplify an expression" difficulty=hard
The starter defines a small expression tree: `Num(value)`, `Var(name)`, `Add(left, right)` and `Mul(left, right)`, all frozen dataclasses. Write `simplify(expr)` that returns an equivalent, simpler tree using these rules:

| Rule | Example |
| --- | --- |
| fold constants | `Add(Num(2), Num(3))` → `Num(5)`, and the same for `Mul` |
| adding zero | `Add(e, Num(0))` and `Add(Num(0), e)` → `e` |
| multiplying by one | `Mul(e, Num(1))` and `Mul(Num(1), e)` → `e` |
| multiplying by zero | `Mul(e, Num(0))` and `Mul(Num(0), e)` → `Num(0)` |

Simplify the children **first**, then apply the rules to the node, so that `Add(Mul(x, Num(0)), y)` becomes `y`. Anything no rule covers, such as `Add(x, y)` or a lone `Var`, comes back unchanged (with simplified children).

```js
function simplify(e) {
  if (e.kind !== "add" && e.kind !== "mul") return e;
  const left = simplify(e.left);
  const right = simplify(e.right);
  const isNum = (x, v) => x.kind === "num" && (v === undefined || x.value === v);
  if (isNum(left) && isNum(right)) {
    return { kind: "num", value: e.kind === "add" ? left.value + right.value : left.value * right.value };
  }
  // ...and six more if statements for the identity rules
  return { ...e, left, right };
}
```

```python starter
from dataclasses import dataclass

type Expr = Num | Var | Add | Mul


@dataclass(frozen=True)
class Num:
    value: int


@dataclass(frozen=True)
class Var:
    name: str


@dataclass(frozen=True)
class Add:
    left: Expr
    right: Expr


@dataclass(frozen=True)
class Mul:
    left: Expr
    right: Expr


def simplify(expr: Expr) -> Expr:
    ...
```

```python solution
from dataclasses import dataclass

type Expr = Num | Var | Add | Mul


@dataclass(frozen=True)
class Num:
    value: int


@dataclass(frozen=True)
class Var:
    name: str


@dataclass(frozen=True)
class Add:
    left: Expr
    right: Expr


@dataclass(frozen=True)
class Mul:
    left: Expr
    right: Expr


def simplify(expr: Expr) -> Expr:
    match expr:
        case Add(left, right):
            left, right = simplify(left), simplify(right)
            match left, right:
                case Num(a), Num(b):
                    return Num(a + b)
                case (Num(0), other) | (other, Num(0)):
                    return other
            return Add(left, right)
        case Mul(left, right):
            left, right = simplify(left), simplify(right)
            match left, right:
                case Num(a), Num(b):
                    return Num(a * b)
                case (Num(0), _) | (_, Num(0)):
                    return Num(0)
                case (Num(1), other) | (other, Num(1)):
                    return other
            return Mul(left, right)
        case _:
            return expr
```

```python tests
x, y = Var("x"), Var("y")

@test("folds constants")
def _():
    eq(simplify(Add(Num(2), Num(3))), Num(5))
    eq(simplify(Mul(Num(4), Num(5))), Num(20))

@test("x + 0 and 0 + x are x")
def _():
    eq(simplify(Add(x, Num(0))), x)
    eq(simplify(Add(Num(0), x)), x)

@test("x * 1 and 1 * x are x")
def _():
    eq(simplify(Mul(x, Num(1))), x)
    eq(simplify(Mul(Num(1), x)), x)

@test("anything times 0 is 0")
def _():
    eq(simplify(Mul(Add(x, y), Num(0))), Num(0))
    eq(simplify(Mul(Num(0), y)), Num(0))

@test("simplifies the children first, then the node")
def _():
    eq(simplify(Add(Mul(x, Num(0)), y)), y)                  # (x*0) + y
    eq(simplify(Mul(Add(Num(0), Num(1)), y)), y)             # (0+1) * y
    eq(simplify(Add(Mul(x, Num(1)), Mul(Num(2), Num(3)))), Add(x, Num(6)))

@test("leaves what it can't simplify alone")
def _():
    eq(simplify(Add(x, y)), Add(x, y))
    eq(simplify(Mul(Num(3), x)), Mul(Num(3), x))
    eq(simplify(x), x)
    eq(simplify(Num(7)), Num(7))

@test("uses class patterns")
def _():
    requires_syntax(ast.MatchClass, "match on the node classes, e.g. case Add(left, right):")
```

```hint
Start with `case Add(left, right):` and `case Mul(left, right):`, recursively simplify both children, and return everything else unchanged with `case _:`.
```

```hint
After simplifying the children, match on both of them at once: `match left, right:` makes a tuple subject, so `case Num(a), Num(b):` folds constants.
```

```hint
Combine the two orders of an identity rule with `|` and parentheses: `case (Num(0), other) | (other, Num(0)):`. Both alternatives bind the same name, which `|` requires.
```
:::
