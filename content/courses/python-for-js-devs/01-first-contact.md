---
title: "First Contact: Syntax & Shape"
part: Foundations
summary: One program in both languages, then indentation, print(), naming, running scripts and the keyword map.
minutes: 30
---

Python looks like pseudo-code because the syntax gets out of the way: no braces, no semicolons, no parentheses around conditions, no `let`. The one shift that matters on day one is that **whitespace is syntax**. Indentation isn't a style choice that a formatter tidies up later; it *is* the block structure. Everything else in this lesson is vocabulary: printing, naming, running a file, poking at objects, and a keyword-by-keyword map from JavaScript.

## The same program, twice

:::compare A small order summary in both languages. Run the Python side.
```js
// Summarise an order.
const TAX_RATE = 0.2;

/** Total price including tax. */
function orderTotal(items) {
  let subtotal = 0;
  for (const item of items) {
    subtotal += item.price * item.qty;
  }
  return subtotal * (1 + TAX_RATE);
}

const items = [{ price: 9.5, qty: 2 }, { price: 3, qty: 1 }];
const total = orderTotal(items);
if (total > 20 && items.length > 1) {
  console.log(`Big order: ${total.toFixed(2)}`);
} else if (total === 0) {
  console.log("Empty order");
} else {
  console.log("Total:", total);
}
```
```python run
# Summarise an order.
TAX_RATE = 0.2


def order_total(items):
    """Total price including tax."""
    subtotal = 0
    for item in items:
        subtotal += item["price"] * item["qty"]
    return subtotal * (1 + TAX_RATE)


items = [{"price": 9.5, "qty": 2}, {"price": 3, "qty": 1}]
total = order_total(items)
if total > 20 and len(items) > 1:
    print(f"Big order: {total:.2f}")
elif total == 0:
    print("Empty order")
else:
    print("Total:", total)
```
:::

Line by line, the differences you'll meet everywhere:

1. **A colon opens a block and indentation defines it.** No braces, and no semicolons at line ends.
2. **No declarations.** `subtotal = 0` creates the name. There's no `let`, `const` or `var` ([Variables, Types & Scope](lesson:variables-and-scope)).
3. **`snake_case`** for functions and variables. Constants are `UPPER_CASE`, as in JS.
4. **`#` comments and a docstring** instead of `//` and JSDoc, and two blank lines around top-level functions (PEP 8).
5. **Conditions need no parentheses.** `&&` is spelled `and`, `else if` is `elif`, and `===` is just `==`.
6. **Dict keys use brackets**, `item["price"]`, because there's no dot access on dicts ([Dicts](lesson:dicts)). Length is the `len()` function ([Lists](lesson:lists)).
7. **f-strings** replace template literals ([Strings & f-strings](lesson:strings)), and `print` replaces `console.log`.

## Indentation is syntax

:::compare
```js
if (user.isAdmin) {
  grantAccess(user);
  log("granted");
}
log("done");               // always runs

if (ready) start();        // braces optional for one statement
```
```python
if user.is_admin:
    grant_access(user)
    log("granted")
log("done")                # always runs: the dedent ended the block

if ready: start()          # legal, but PEP 8 says don't
```
:::

A line ending in a colon (`if`, `elif`, `else`, `for`, `while`, `def`, `class`, `try`, `except`, `with`, `match`) starts a block, and every statement in the block must be indented by the same amount. Dedenting ends it. What you see is what runs: the classic bug where a second line *looks* guarded by an `if` but isn't (Apple's `goto fail`) can't be written in Python.

The convention is **four spaces** per level. Any consistent amount works, but mixing tabs and spaces in one block raises `TabError`, and an indent that doesn't line up with any outer level raises `IndentationError`. Both are raised at compile time, so nothing in the file runs.

```python run raises
def greet(name):
print(f"Hello, {name}")
```

### Empty blocks need `pass`

:::compare
```js
function todo() {}

if (debug) {
  // nothing yet
}

class AppError extends Error {}
```
```python
def todo():
    pass

if debug:
    pass  # a comment alone isn't a statement

class AppError(Exception):
    pass
```
:::

A block can't be empty, and comments don't count because the parser never sees them. `pass` is the statement that does nothing. You'll also see `...` (the `Ellipsis` literal) as a placeholder body, especially in stubs and type definitions: `def todo(): ...`.

:::gotcha A block holding only a comment is a syntax error
`if debug:` followed by nothing but `# TODO` is an `IndentationError: expected an indented block`. Comments are stripped before parsing, so the block is empty. Add `pass` until you write the real code.
:::

### Line breaks end statements

:::compare
```js
const total = price * quantity
  + shipping;              // ASI keeps going: the next line starts with +

const user = {
  name: "Ada",
  roles: ["admin", "dev"], // trailing commas welcome
};
```
```python
total = (price * quantity
         + shipping)       # open brackets carry the line

user = {
    "name": "Ada",
    "roles": ["admin", "dev"],  # trailing commas welcome
}
```
:::

Python's rule is simpler than automatic semicolon insertion: **a newline ends the statement unless a bracket is still open**. Inside `()`, `[]` or `{}` you can break lines anywhere, with no marker, which is called implicit line continuation. That's why long conditions and expressions are wrapped in parentheses. A trailing backslash also continues a line, but PEP 8 prefers brackets (a stray space after the backslash breaks it). Semicolons are legal for putting two statements on one line and are never needed; a trailing one gives away a JS habit.

:::quiz output
What does this print?

```python
base = 10
bonus = 5
total = base
+ bonus
print(total)
```

- [ ] `15`
- [x] `10`
- [ ] `SyntaxError`
- [ ] `IndentationError`

The first newline ends the assignment, so `total` is `10`. The next line, `+ bonus`, is a separate and perfectly valid statement: unary plus applied to `bonus`, computed and thrown away. Wrap the expression in parentheses to continue it.
:::

## Comments and docstrings

:::compare
```js
// A line comment
/* A block
   comment */

/**
 * Convert Celsius to Fahrenheit.
 * @param {number} celsius
 * @returns {number}
 */
function toFahrenheit(celsius) {
  return (celsius * 9) / 5 + 32;
}
```
```python
# A line comment
# Python has no block comments,
# just one # per line


def to_fahrenheit(celsius: float) -> float:
    """Convert Celsius to Fahrenheit.

    The first line is a one-sentence summary. Types live in
    the signature, so the docstring describes behaviour.
    """
    return celsius * 9 / 5 + 32
```
:::

`#` comments run to the end of the line. There's no block-comment syntax; editors toggle `#` over a selection.

A **docstring** is a string literal placed as the first statement of a module, function or class. Unlike a JSDoc comment it isn't thrown away: Python stores it on the object as `__doc__`, and `help()`, IDEs and documentation generators all read it. By convention (PEP 257) it uses triple double quotes, opens with a one-line summary, and continues after a blank line. Types go in the signature as annotations, which tools check much like TypeScript ([Type Hints](lesson:type-hints)), so the docstring doesn't need `@param {number}` lines.

```python run
def to_fahrenheit(celsius: float) -> float:
    """Convert Celsius to Fahrenheit."""
    return celsius * 9 / 5 + 32


print(to_fahrenheit(100))
print(to_fahrenheit.__doc__)
help(to_fahrenheit)
```

:::tip Triple-quoted strings aren't comments
You'll see `"""..."""` used to comment out a chunk of code. It works because a bare string expression is evaluated and discarded, but it's still code: it must be a valid string, and if it's the first statement in a function it silently becomes the docstring. Use `#`.
:::

## `print()` vs `console.log`

:::compare
```js
console.log("Total:", 42);            // Total: 42
console.log(["mug", "tea"].join(", "));
console.log(["a", 1], { k: true });   // [ 'a', 1 ] { k: true }
process.stdout.write("no newline");
console.log({ user });                // { user: 'ada' }
console.error("oops");
```
```python
print("Total:", 42)                   # Total: 42
print("mug", "tea", sep=", ")         # mug, tea
print(["a", 1], {"k": True})          # ['a', 1] {'k': True}
print("no newline", end="")
print(f"{user=}")                     # user='ada'
print("oops", file=sys.stderr)        # after `import sys`
```
:::

`print(*objects, sep=" ", end="\n", file=None, flush=False)` converts each argument with `str()`, joins them with `sep`, adds `end`, and writes the result to `file` (standard output unless you pass another stream). So multiple arguments behave like `console.log`'s, and `sep` and `end` cover what you'd otherwise do with `join` or `process.stdout.write`. Containers display their contents with `repr()`, which is why the strings inside a list keep their quotes. `print` has no `%s`/`%d` substitution and no `console.table`; format with f-strings instead, and reach for the `logging` module in real applications ([Batteries Included](lesson:standard-library)).

`f"{expr=}"` (3.8+) is the debugging shortcut that `console.log({ user })` approximates: it prints the expression's source text, an `=`, and the value's `repr()`. Spaces around the `=` are kept, any expression works, and a format spec still applies: `f"{price=:.2f}"` prints `price=3.14`.

```python run
import sys

user, cart = "ada", ["mug", "tea"]
print("User:", user, "items:", len(cart))
print(*cart, sep=" | ")              # spread a list into arguments
print("Loading", end="")
print("...", "done")
print(f"{user=} {cart = } {len(cart) * 2=}")
print("this one goes to stderr", file=sys.stderr)
```

:::quiz output
What does this print?

```python
print("a", "b", sep="-", end="!")
print("c")
```

- [x] `a-b!c`
- [ ] `a-b-!c`
- [ ] `a b!c`
- [ ] `ab-!c`

`sep` goes *between* the arguments and `end` replaces the trailing newline, so the second `print` carries on from the `!` on the same line.
:::

## Names, PEP 8 and formatters

:::compare
```js
const MAX_RETRIES = 3;
let retryCount = 0;

function fetchUserProfile(userId) {}
class HttpClient {}
const isReady = true;
```
```python
MAX_RETRIES = 3
retry_count = 0

def fetch_user_profile(user_id): ...
class HttpClient: ...
is_ready = True
```
:::

PEP 8 is Python's style guide, and unlike the competing JS style guides, practically everyone follows it. The naming half fits in a table:

| What | JavaScript habit | Python (PEP 8) |
| --- | --- | --- |
| variables, functions, methods, parameters | `camelCase` | `snake_case` |
| classes, exceptions, type aliases | `PascalCase` | `PascalCase` |
| constants | `UPPER_SNAKE` | `UPPER_SNAKE` (a convention, not enforced) |
| files | `user-service.js`, `userService.js` | `user_service.py` (a file name must be a valid identifier to be importable) |
| private members | `#field` | `_field` by convention ([Classes & Objects](lesson:classes)) |
| protocol hooks | `Symbol.iterator`, `toString()` | `__iter__`, `__str__` ([Dunder Methods](lesson:dunder-methods)) |
| clashing with a keyword | `klass`, `clazz` | trailing underscore: `class_`, `type_` |

The layout half (four-space indents, two blank lines around top-level definitions, spaces around operators, import order) is a formatter's job. **ruff** is the de facto tool: `ruff format` is a Black-compatible formatter (Python's prettier) and `ruff check` is a fast linter (Python's eslint, with hundreds of rules ported from older tools). Both default to 88-character lines rather than PEP 8's 79.

```bash
uvx ruff format .          # like: npx prettier --write .
uvx ruff check --fix .     # like: npx eslint --fix .
```

`uvx` runs a tool without installing it, much like `npx`. Setting up a project, a virtual environment and `pyproject.toml` is covered in [Modules, Packages & Tooling](lesson:modules-and-tooling).

:::pythonic Let the tools decide
Python code reviews rarely argue about quotes, commas or wrapping, because everyone runs the same formatter. Format on save, lint in CI, and spend the review on names and structure. Configuration lives in `pyproject.toml` under `[tool.ruff]`.
:::

## Running Python: the REPL, scripts and `__main__`

:::compare
```bash title="Node"
node                          # REPL
node app.js                   # run a script
node -e 'console.log(1 + 1)'  # run a snippet
node app.js --verbose         # process.argv.slice(2)
```
```bash title="Python"
python                        # REPL (python3 on macOS/Linux, py on Windows)
python app.py                 # run a script
python -c 'print(1 + 1)'      # run a snippet
python app.py --verbose       # sys.argv[1:]
```
:::

The REPL prints `>>>` for a new statement and `...` for a continuation. It echoes the value of each expression (and keeps the last one in `_`), so it doubles as a calculator and an API explorer. Since 3.13 it supports multi-line editing, colour, and plain `exit` without parentheses; 3.14 adds syntax highlighting. `python -i app.py` runs a script and then drops you into the REPL with its variables still alive, which is handy for poking at a crash.

Command-line arguments live in `sys.argv`. Unlike `process.argv`, there's no interpreter path at the front: `sys.argv[0]` is the script, so the arguments start at `sys.argv[1]`. For real CLIs, `argparse` does the parsing ([Batteries Included](lesson:standard-library)).

:::compare `import.meta.main` and the main guard
```js
// report.js
export function buildReport(rows) { /* ... */ }

// true only when this file is the entry point
// (Deno, Bun and recent Node versions)
if (import.meta.main) {
  console.log(buildReport(loadRows()));
}
```
```python
# report.py
def build_report(rows): ...


# True only when this file is run directly
if __name__ == "__main__":
    print(build_report(load_rows()))
```
:::

Every `.py` file is a module, and importing it runs its top-level code, as with an ES module. Python sets each module's global `__name__` to its import name (`"report"`) when it's imported, and to `"__main__"` when the file is executed directly. The guard therefore lets one file act as both a library and a script: imports get the functions, and running it does the work. The usual shape is a `main()` function called under the guard.

```python run
def main():
    print("doing the work")


print(f"{__name__=}")        # this playground runs as __main__
if __name__ == "__main__":
    main()
```

:::quiz
You run `python report.py`, and `report.py` contains `import utils`. Inside `utils.py`, what is `__name__`?

- [ ] `"__main__"`
- [x] `"utils"`
- [ ] `"report"`
- [ ] `None`

Only the file you execute is `__main__`. Every imported module sees its own import name, so code under a `__main__` guard in `utils.py` doesn't run. Packages, `python -m` and the import system are covered in [Modules, Packages & Tooling](lesson:modules-and-tooling).
:::

## Everything is an object: `type()`, `dir()`, `help()`

:::compare
```js
typeof 42;                    // "number"
typeof "hi";                  // "string"
typeof null;                  // "object" (a famous mistake)
(42).toFixed(1);              // primitives borrow methods by boxing
Object.getOwnPropertyNames(String.prototype);
// documentation: open MDN
```
```python
type(42)                      # <class 'int'>
type("hi")                    # <class 'str'>
type(None)                    # <class 'NoneType'>
(42).bit_length()             # 6: ints are real objects
dir(str)                      # every attribute and method name
help(str.split)               # the docs, right in your REPL
```
:::

Python has no primitives. Numbers, strings, `None`, functions, classes and modules are all objects with a type, attributes and methods, so there's no boxing and no `typeof null` weirdness. `type(x)` returns the **class itself**, not a string: you can print it, compare it (`type(x) is int`) or read its `__name__`. To *check* a type in real code, use `isinstance()`, covered in [Variables, Types & Scope](lesson:variables-and-scope).

`dir(x)` lists an object's attribute names, including the double-underscore ones that make operators and builtins work ([Dunder Methods](lesson:dunder-methods)). `help(x)` renders its docstring and signature. Together they're the fastest way to learn an unfamiliar API without leaving the terminal.

```python run
def greet(name):
    """Return a friendly greeting."""
    return f"Hello, {name}!"


print(type(42), type(None), type(greet), type(type))
print(greet.__name__, "|", greet.__doc__)   # functions have attributes
print((255).bit_length(), "hello".upper(), (2.5).is_integer())
print([name for name in dir(42) if not name.startswith("_")])
help(len)
```

:::note Even classes and modules are values
`type(type)` is `<class 'type'>`. Classes are objects created by `type`, functions are instances of `function`, and an imported module is an object whose attributes are its top-level names. All of them can be stored in lists, passed to functions and returned from them. That uniformity is why decorators, plugin registries and "just pass the class" APIs feel natural in Python.
:::

## Keyword Rosetta stone

| JavaScript | Python | Notes |
| --- | --- | --- |
| `null`, `undefined` | `None` | one "nothing" value; [Variables, Types & Scope](lesson:variables-and-scope) |
| `true`, `false` | `True`, `False` | capitalised |
| `&&`, `\|\|`, `!` | `and`, `or`, `not` | words, not symbols; [Truthiness & Equality](lesson:truthiness-and-equality) |
| `===`, `!==` | `==`, `!=` | no coercion to guard against; `is` tests identity |
| `else if` | `elif` | |
| `cond ? a : b` | `a if cond else b` | |
| `switch` / `case` | `match` / `case` | 3.10+, no fall-through; [Control Flow & Loops](lesson:control-flow) |
| `for (const x of xs)` | `for x in xs:` | |
| `for (let i = 0; i < n; i++)` | `for i in range(n):` | there's no `++`; [Numbers & Math](lesson:numbers-and-math) |
| `do { } while (c)` | (none) | `while True:` plus `break` |
| `function f() {}` | `def f():` | [Functions](lesson:functions) |
| `(x) => x * 2` | `lambda x: x * 2` | a single expression only |
| `class A extends B {}` | `class A(B):` | [Classes & Objects](lesson:classes) |
| `new User()` | `User()` | there's no `new` |
| `this` | `self` | an explicit first parameter |
| `super.save()` | `super().save()` | |
| `throw new Error(msg)` | `raise ValueError(msg)` | [Errors & Exceptions](lesson:exceptions) |
| `try {} catch (e) {} finally {}` | `try:` / `except ValueError as e:` / `finally:` | plus an optional `else:` |
| `typeof x`, `x instanceof C` | `type(x)`, `isinstance(x, C)` | |
| `"k" in obj` | `"k" in d` | `in` works on every container |
| `delete obj.k` | `del d["k"]` | `del` also unbinds plain names |
| `import { x } from "./mod.js"` | `from mod import x` | [Modules, Packages & Tooling](lesson:modules-and-tooling) |
| `export` | (none) | every top-level name is importable |
| `const`, `let`, `var` | (none) | just assign |
| `async`, `await`, `yield` | `async`, `await`, `yield` | same words, different model; [Async/Await](lesson:async) |
| `debugger` | `breakpoint()` | a builtin function, not a keyword |
| `with (obj)` | `with` | unrelated: Python's `with` manages resources; [Context Managers](lesson:context-managers) |

```python run
import keyword

print(len(keyword.kwlist), "keywords:", " ".join(keyword.kwlist))
print("soft keywords:", keyword.softkwlist)
```

:::note Soft keywords
`match`, `case`, `type` and `_` are **soft keywords**: they act as keywords only where the grammar expects them, so older code that uses `match` or `type` as an ordinary variable name keeps working. The 35 hard keywords can never be used as names.
:::

:::gotcha `True`, `False` and `None` are capitalised
`true`, `false`, `null` and `undefined` aren't Python at all. They're just undefined names, so `if done == true:` raises `NameError: name 'true' is not defined`, and only when that line runs. (Python suggests `'True'` in the error message, which helps.)
:::

## Cheat sheet

| JavaScript | Python | Notes |
| --- | --- | --- |
| `{ ... }` blocks | `:` plus indentation | four spaces per level |
| `;` | newline | legal, never needed |
| `// comment` | `# comment` | no block comments |
| `/** JSDoc */` | `"""docstring"""` | first statement; stored in `__doc__` |
| `{}` (empty block) | `pass` | or `...` |
| multi-line expression | wrap it in `( )` | brackets continue lines |
| `console.log(a, b)` | `print(a, b)` | `sep=`, `end=` |
| `process.stdout.write(s)` | `print(s, end="")` | |
| `console.error(x)` | `print(x, file=sys.stderr)` | |
| `console.log({ x })` | `print(f"{x=}")` | 3.8+ |
| `camelCase` | `snake_case` | `PascalCase` for classes |
| prettier, eslint | `ruff format`, `ruff check` | or black |
| `node app.js` | `python app.py` | `python3` on macOS/Linux |
| `process.argv.slice(2)` | `sys.argv[1:]` | |
| `import.meta.main` | `if __name__ == "__main__":` | |
| `typeof x` | `type(x)` | returns the class |
| reading MDN | `help(x)`, `dir(x)` | in the REPL |

## Challenges

:::challenge id=fc-shipping-cost title="Translate a function" difficulty=easy
Translate this JavaScript into Python as `shipping_cost(weight_kg, express)`. It returns `None` for a weight of zero or less, `50` for express parcels over 10 kg, `25` for other express parcels, and `10` for everything else.

```js
function shippingCost(weightKg, express) {
  if (weightKg <= 0) {
    return null;
  } else if (express && weightKg > 10) {
    return 50;
  } else if (express) {
    return 25;
  }
  return 10;
}
```

```python starter
def shipping_cost(weight_kg, express):
    ...
```

```python solution
def shipping_cost(weight_kg, express):
    if weight_kg <= 0:
        return None
    elif express and weight_kg > 10:
        return 50
    elif express:
        return 25
    return 10
```

```python tests
@test("standard shipping is 10 at any weight")
def _():
    eq(shipping_cost(1, False), 10)
    eq(shipping_cost(80, False), 10)

@test("express is 25 up to 10 kg")
def _():
    eq(shipping_cost(2.5, True), 25)
    eq(shipping_cost(10, True), 25)

@test("express over 10 kg is 50")
def _():
    eq(shipping_cost(10.5, True), 50)

@test("a weight of zero or less returns None")
def _():
    eq(shipping_cost(0, True), None)
    eq(shipping_cost(-3, False), None)

@test("combines the conditions with `and`")
def _():
    check(
        any(isinstance(node, ast.BoolOp) and isinstance(node.op, ast.And) for node in ast.walk(tree)),
        "&& is spelled `and` in Python",
    )
```

```hint
`null` is `None`, `&&` is `and`, and `else if` is `elif`. Every `if`, `elif` and `else` line ends with a colon.
```

```hint
Drop the braces and parentheses, and indent each branch body by four spaces.
```
:::

:::challenge id=fc-describe title="What is this thing?" difficulty=easy
Write `describe(value)` that returns the name of the value's type, a colon and a space, then the value's `repr()`:

```text
describe(42)       ->  "int: 42"
describe("42")     ->  "str: '42'"
describe(None)     ->  "NoneType: None"
describe([1, "a"]) ->  "list: [1, 'a']"
describe(int)      ->  "type: <class 'int'>"
```

`type(value)` gives you the class, and every class has a `__name__`. `repr()` is the developer-facing form, with quotes around strings.

```js
const describe = (value) => `${typeof value}: ${JSON.stringify(value)}`;
```

```python starter
def describe(value):
    ...
```

```python solution
def describe(value):
    return f"{type(value).__name__}: {value!r}"
```

```python tests
@test("numbers")
def _():
    eq(describe(42), "int: 42")
    eq(describe(3.0), "float: 3.0")

@test("strings show their quotes")
def _():
    eq(describe("42"), "str: '42'")
    eq(describe(""), "str: ''")

@test("None and booleans are objects too")
def _():
    eq(describe(None), "NoneType: None")
    eq(describe(True), "bool: True")

@test("containers")
def _():
    eq(describe([1, "a"]), "list: [1, 'a']")
    eq(describe({"k": None}), "dict: {'k': None}")

@test("functions and classes are values")
def _():
    eq(describe(len), "builtin_function_or_method: <built-in function len>")
    eq(describe(int), "type: <class 'int'>")
```

```hint
`type("hi")` is the class `str`, and `str.__name__` is the string `"str"`.
```

```hint
Inside an f-string, `{value!r}` inserts `repr(value)`. Put it together: `f"{type(value).__name__}: {value!r}"`.
```
:::

:::challenge id=fc-script-shape title="Give it a script's shape" difficulty=medium
Turn this file into a well-formed script:

1. Start the file with a **module docstring**.
2. Write `main()`, with its own docstring, that prints this report built from `ORDERS`. Use `print`'s `sep` argument rather than joining strings yourself, and show prices with two decimals.
3. Call `main()` **only** when the file is run directly, not when it's imported.

```output
item | qty | price
mug | 2 | 9.50
tea | 1 | 4.25
```

```js
// report.js
const ORDERS = [["mug", 2, 9.5], ["tea", 1, 4.25]];

function main() {
  console.log(["item", "qty", "price"].join(" | "));
  for (const [item, qty, price] of ORDERS) {
    console.log([item, qty, price.toFixed(2)].join(" | "));
  }
}

if (import.meta.main) main();
```

```python starter
ORDERS = [("mug", 2, 9.5), ("tea", 1, 4.25)]


def main():
    ...
```

```python solution
"""Print a small order report."""

ORDERS = [("mug", 2, 9.5), ("tea", 1, 4.25)]


def main():
    """Print one line per order, separated by pipes."""
    print("item", "qty", "price", sep=" | ")
    for item, qty, price in ORDERS:
        print(item, qty, f"{price:.2f}", sep=" | ")


if __name__ == "__main__":
    main()
```

```python tests
REPORT = "item | qty | price\nmug | 2 | 9.50\ntea | 1 | 4.25\n"

@test("main() prints the report")
def _():
    eq(output_of(main), REPORT)

@test("running the file as a script prints the report once")
def _():
    eq(stdout, REPORT)

@test("importing the file prints nothing")
def _():
    printed = output_of(exec, source, {"__name__": "report"})
    eq(printed, "", "code outside the __main__ guard ran on import")

@test("the module has a docstring")
def _():
    check(ast.get_docstring(tree), 'start the file with a """docstring"""')

@test("main() has a docstring")
def _():
    check(main.__doc__, "the first statement inside main() should be a docstring")

@test("uses print's sep argument")
def _():
    check(
        any(isinstance(node, ast.keyword) and node.arg == "sep" for node in ast.walk(tree)),
        'pass sep=" | " to print()',
    )
```

```hint
A docstring is just a string literal as the very first statement: `"""Print a small order report."""` at the top of the file, and another as the first line inside `main()`.
```

```hint
`print("item", "qty", "price", sep=" | ")` prints the header. In the loop, `f"{price:.2f}"` formats the price.
```

```hint
Put the call at the bottom, indented under `if __name__ == "__main__":`.
```
:::
