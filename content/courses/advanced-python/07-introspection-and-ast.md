---
title: Introspection & the ast Module
part: Types & Metaprogramming
summary: Read signatures, members, source and bytecode at runtime, then parse, lint and rewrite Python with ast.
minutes: 50
---

In JavaScript, code that reads code comes from npm: acorn and Babel parse it, ESLint lints it, recast prints it back, and at runtime you get `fn.length`, `fn.name` and `fn.toString()`. Python ships the whole toolchain in the standard library. `inspect` asks live objects for their signatures, members and source. `ast` hands you the compiler's own parser and a tree you can analyse and rewrite, `dis` shows the bytecode the interpreter actually runs, and `importlib` loads code by name.

The mental shift: Python's parser, compiler and import system aren't sealed inside the engine. They're library functions you can call. pytest's fixtures and assertion messages, FastAPI's request parsing, the `__init__` that `@dataclass` writes for you and every plugin system you'll install are built from the parts in this lesson.

## Signatures are objects

:::compare
```js
function sendInvoice(customer, amount, { currency = "EUR", draft = false } = {}) {
  // ...
}

sendInvoice.length;      // 2: the parameters before the first default
sendInvoice.name;        // "sendInvoice"
sendInvoice.toString();  // source text: parse it yourself for names
```
```python
def send_invoice(customer, amount, *, currency="EUR", draft=False):
    ...


sig = inspect.signature(send_invoice)
list(sig.parameters)           # ['customer', 'amount', 'currency', 'draft']
sig.parameters["draft"].kind   # KEYWORD_ONLY, and .default is False
```
:::

JavaScript exposes little more than `fn.length`. Angular 1's dependency injection famously recovered parameter names by regex-parsing `fn.toString()`, and broke the moment a minifier renamed them. Python hands you the signature as an object. `inspect.signature(fn)` returns a `Signature` whose `parameters` is an ordered mapping of `Parameter` objects, each with a `name`, a `kind`, a `default` and an `annotation`. The sentinel `Parameter.empty` means "none". The five kinds are the five ways to declare a parameter:

| Kind | Declared as |
| --- | --- |
| `POSITIONAL_ONLY` | before `/` |
| `POSITIONAL_OR_KEYWORD` | a plain parameter |
| `VAR_POSITIONAL` | `*args` |
| `KEYWORD_ONLY` | after `*` or `*args` |
| `VAR_KEYWORD` | `**kwargs` |

```python run
import inspect

def resize(image, /, width, height=None, *sizes, keep_ratio=True, **options):
    ...

for param in inspect.signature(resize).parameters.values():
    default = "-" if param.default is param.empty else repr(param.default)
    print(f"{param.name:<11} {param.kind.name:<22} {default}")

print(inspect.signature(sorted))     # most builtins have one too
```

A few builtins with several call forms, such as `max` and `int`, have no signature and raise `ValueError`.

Annotations land in `param.annotation`. Since 3.14 evaluates annotations lazily, `inspect.signature` evaluates them when you call it, so an annotation naming something that doesn't exist yet raises `NameError`; pass `annotation_format=annotationlib.Format.FORWARDREF` (3.14+) to get placeholders instead. [Type Hints](lesson:type-hints#annotations-at-runtime) covers `typing.get_type_hints`, and [Advanced Typing](lesson:typing-in-depth) covers `annotationlib`.

### Binding a call without making it

`sig.bind(*args, **kwargs)` applies the interpreter's argument-matching rules without calling anything. It returns a `BoundArguments` whose `.arguments` dict maps each supplied parameter to its value, however the caller spelled the call, or it raises the `TypeError` the real call would raise. `apply_defaults()` fills in the rest. That's how a task queue can reject a bad call when it's enqueued instead of an hour later in a worker, and how a cache can treat `price(10, 3)` and `price(qty=3, base=10)` as one key.

```python run
import inspect

def price(base, qty=1, *, discount=0.0):
    return base * qty * (1 - discount)

sig = inspect.signature(price)
for args, kwargs in [((10, 3), {}), ((10,), {"qty": 3}), ((), {"qty": 3, "base": 10})]:
    bound = sig.bind(*args, **kwargs)
    bound.apply_defaults()
    print(bound.arguments)        # one canonical shape for three spellings

try:
    sig.bind(10, 3, 0.5)          # discount is keyword-only
except TypeError as err:
    print("TypeError:", err)
```

:::quiz output
What does this print?

```python
import inspect

def resize(image, width, height=None, *, keep_ratio=True):
    ...

bound = inspect.signature(resize).bind("cat.png", 640, keep_ratio=False)
print(bound.arguments)
```

- [ ] `{'image': 'cat.png', 'width': 640, 'height': None, 'keep_ratio': False}`
- [x] `{'image': 'cat.png', 'width': 640, 'keep_ratio': False}`
- [ ] `('cat.png', 640, False)`
- [ ] `TypeError`

`.arguments` holds only what the call supplied. `height` has a default, so the call is valid, but it only appears after `bound.apply_defaults()`.
:::

:::tip Signatures see through decorators
`functools.wraps` sets `__wrapped__`, and `inspect.signature` follows it, so a decorated function reports the original's parameters instead of the wrapper's `(*args, **kwargs)` ([Decorators](lesson:decorators#writing-a-well-behaved-decorator)). Pass `follow_wrapped=False` to see the wrapper itself, or call `inspect.unwrap(fn)` for the innermost function. Code that generates functions can go one step further and assign `fn.__signature__` (often built with `sig.replace(parameters=...)`), which `inspect.signature` then reports as is.
:::

## Members, docs and source

:::compare
```js
Object.getOwnPropertyNames(Cart.prototype); // ["constructor", "add", "total"]
typeof cart.add === "function";             // true
Cart.prototype.add.toString();              // its source text
```
```python
inspect.getmembers(Cart, inspect.isfunction)  # [('add', <function ...>), ...]
inspect.ismethod(cart.add)                    # True: a bound method
inspect.getsource(Cart.add)                   # its source, read from the file
```
:::

`inspect.getmembers(obj, predicate)` returns `(name, value)` pairs sorted by name, inherited members included, keeping the ones the predicate accepts. The predicates draw finer lines than `typeof` does:

| Predicate | True for |
| --- | --- |
| `isfunction` | functions and lambdas written in Python |
| `ismethod` | bound methods, like `cart.add` |
| `isbuiltin` | functions implemented in C, like `len` |
| `isroutine` | any kind of function or method |
| `isclass`, `ismodule` | classes and modules |
| `isgeneratorfunction`, `iscoroutinefunction`, `isasyncgenfunction` | a `def` with `yield`, an `async def`, an `async def` with `yield` |
| `isabstract` | classes with abstract methods left unimplemented |
| `isawaitable` | anything `await` accepts: coroutines, tasks, futures |

`getdoc()` dedents a docstring, and for a method or property without one it inherits the docstring of the base-class member it overrides. `getsource()` returns the code as written, decorators included. `getfile()` and `getmodule()` say where an object was defined. Together they're most of `help()`:

```python run
import inspect

class Cart:
    """A shopping cart."""

    def add(self, sku: str, qty: int = 1) -> None:
        """Add qty units of a product."""

    def total(self, *, currency: str = "EUR") -> float:
        """Sum the lines in the given currency."""

    def _reprice(self): ...

print(inspect.getdoc(Cart))
for name, method in inspect.getmembers(Cart, inspect.isfunction):
    if not name.startswith("_"):
        summary = (inspect.getdoc(method) or "").partition("\n")[0]
        print(f"  {name}{inspect.signature(method)}: {summary}")
print(inspect.getsource(Cart.total))
```

:::gotcha `getsource` needs a source file
Source is read from the file the code was loaded from, through `linecache` (these playgrounds register their code the same way). A function created by `exec()` from a string has no file, so `getsource` raises `OSError`, and a C builtin like `len` raises `TypeError`. Applications shipped as bytecode only have no source at all. Treat source access as best effort, like `fn.toString()` after a bundler has been at it.
:::

### Looking without touching: `getattr_static`

`getattr()` runs code: properties, descriptors and `__getattr__` all fire on access. A tool that must not trigger side effects (a debugger displaying an object, a documentation generator, a linter importing your module) wants `inspect.getattr_static`, which follows the same lookup order but returns the raw object it finds instead of invoking it. That lookup order is the subject of [How Attribute Lookup Works](lesson:attribute-lookup).

```python run
import inspect

class Report:
    @property
    def rows(self):
        print("...running a slow query")
        return [("ada", 3), ("grace", 5)]

report = Report()
print(inspect.getattr_static(report, "rows"))   # the property itself: no query
print(len(report.rows))                         # normal access runs it
```

:::deep Frames: who called me?
Every running function has a frame object holding its code (`f_code`), current line (`f_lineno`), locals (`f_locals`) and caller (`f_back`):

```python run
import inspect

def audit(action):
    caller = inspect.currentframe().f_back
    print(f"{action!r} from {caller.f_code.co_name}(), line {caller.f_lineno}")

def checkout():
    audit("charge card")

checkout()
```

This is how `logging` fills in `%(funcName)s`, and how `warnings.warn(..., stacklevel=2)` blames the caller's line rather than its own ([Designing Pythonic APIs](lesson:pythonic-api-design) puts that to work). In JavaScript you'd parse the string in `new Error().stack`. `inspect.stack()` collects every frame along with source context, which makes it slow, so keep it out of hot paths. Don't hold on to frames either: a frame keeps all of its locals alive.
:::

## Parsing code into a tree

:::compare
```js
import { parse } from "acorn";

const tree = parse("total = price * (1 + rate)", { ecmaVersion: "latest" });
tree.body[0].expression.type;     // "AssignmentExpression"
JSON.stringify(tree, null, 2);    // ESTree, as JSON
```
```python
import ast

tree = ast.parse("total = price * (1 + rate)")
type(tree.body[0]).__name__       # 'Assign': a statement
print(ast.dump(tree, indent=2))   # node objects, not JSON
```
:::

`ast.parse` is the parser the compiler itself uses, so the tree always matches the interpreter you're running: there's no parser version to keep in step with the language, and no plugin for new syntax. Each node is an instance of a class in the `ast` module. Its children live in the fields listed by `_fields`, and its position in `lineno`, `col_offset`, `end_lineno` and `end_col_offset`. A `Name` also records whether it's read (`ctx=Load()`), assigned (`Store()`) or deleted (`Del()`).

Python's grammar keeps statements and expressions strictly apart, and the tree shows it. Assignment is an `Assign` statement, where ESTree has an `AssignmentExpression` wrapped in an `ExpressionStatement`. `ast.parse(text, mode="eval")` parses a single expression into an `ast.Expression` and rejects statements outright.

```python run
import ast

source = "total = price * (1 + rate)"
tree = ast.parse(source)
print(ast.dump(tree, indent=2))

assign = tree.body[0]
print(assign._fields)                                 # the child fields
print(assign.value.lineno, assign.value.col_offset)   # where `price * ...` starts
print(ast.get_source_segment(source, assign.value.right))
```

:::gotcha The tree follows the interpreter version
Node classes change between releases. `ast.Num` and `ast.Str`, deprecated aliases of `ast.Constant` since 3.8, are gone in 3.14. 3.12 added nodes for type parameters and `type` aliases, and 3.14 added `TemplateStr` for t-strings. Match on `ast.Constant` and the current classes, and test a tool on every Python version it supports. In JavaScript terms, your runtime *is* your parser version.
:::

:::tip An AST explorer in your terminal
`python -m ast app.py` prints the tree of a whole file (3.9+). `ast.get_source_segment(source, node)`, used above, recovers the exact text of any node, which is what you want in an error message.
:::

:::quiz output
What does this print?

```python
import ast

node = ast.parse("0 < price <= limit", mode="eval").body
print(type(node).__name__, len(node.ops))
```

- [ ] `BoolOp 2`
- [x] `Compare 2`
- [ ] `Compare 1`
- [ ] `BinOp 2`

A chained comparison is a single `Compare` node holding a list of operators (`[Lt(), LtE()]`) and a list of comparators (`price`, `limit`). It isn't rewritten into `0 < price and price <= limit`, a `BoolOp`, which is also why `price` is evaluated only once.
:::

## Visiting nodes: a mini linter

:::compare
```js
// An ESLint rule
export default {
  create(context) {
    return {
      CallExpression(node) {
        if (node.callee.name === "eval") {
          context.report({ node, message: "no eval" });
        }
      },
    };
  },
};
```
```python
# A NodeVisitor
class NoEval(ast.NodeVisitor):
    def __init__(self):
        self.problems = []

    def visit_Call(self, node):
        if isinstance(node.func, ast.Name) and node.func.id == "eval":
            self.problems.append((node.lineno, "no eval"))
        self.generic_visit(node)
```
:::

For a flat search, `ast.walk(tree)` yields every node in the tree (in no guaranteed order), and a loop with `isinstance` is a complete lint rule. When structure matters, subclass `ast.NodeVisitor`. Its `visit(node)` calls the method named `visit_` plus the node's class name (`visit_Call`, `visit_FunctionDef`), falling back to `generic_visit`, which visits the node's children. It's the shape of an ESLint rule without the plugin system. And because it only parses, linting a file is safe even when importing it wouldn't be.

```python run
import ast

source = '''
def checkout(cart, user, coupon, currency, region, notify):
    print("checking out", cart)
    return eval(coupon)
'''

class Lint(ast.NodeVisitor):
    def visit_FunctionDef(self, node):
        if len(node.args.args) > 5:
            print(f"line {node.lineno}: {node.name}() takes {len(node.args.args)} arguments")
        self.generic_visit(node)          # keep walking into the body

    def visit_Call(self, node):
        match node.func:
            case ast.Name(id="print" | "eval" as name):
                print(f"line {node.lineno}: call to {name}()")
        self.generic_visit(node)

Lint().visit(ast.parse(source))
```

:::pythonic Match on nodes
AST classes define `__match_args__`, so a class pattern can mirror the tree you're looking for: `case ast.Call(func=ast.Attribute(value=ast.Name(id="os"), attr="system")):` finds every `os.system(...)` call. The `visit_Call` above uses one to accept two names at once. Patterns are covered in [Structural Pattern Matching](lesson:pattern-matching#class-patterns).
:::

:::gotcha Forgetting `generic_visit`
A `visit_X` method *replaces* the default traversal for that node. If it doesn't call `self.generic_visit(node)`, nothing underneath gets visited: not the calls nested in its arguments, not the methods inside a class, not the body of a `def`. ESLint walks the whole tree for you. `NodeVisitor` only goes where you send it.
:::

:::quiz output
What does this print?

```python
import ast

class CountCalls(ast.NodeVisitor):
    def __init__(self):
        self.count = 0

    def visit_Call(self, node):
        self.count += 1

counter = CountCalls()
counter.visit(ast.parse("print(len(items), sum(prices))"))
print(counter.count)
```

- [x] `1`
- [ ] `2`
- [ ] `3`
- [ ] `0`

The outer `print(...)` call is visited, but `visit_Call` never calls `self.generic_visit(node)`, so the `len()` and `sum()` calls inside its arguments are never reached. Add that line and the count is 3.
:::

## Rewriting code: transform, unparse, compile

:::compare
```js
// A Babel plugin: console.log(...) -> logger.debug(...)
export default ({ types: t }) => ({
  visitor: {
    CallExpression(path) {
      if (path.get("callee").matchesPattern("console.log")) {
        path.node.callee = t.memberExpression(t.identifier("logger"), t.identifier("debug"));
      }
    },
  },
});
```
```python
# A NodeTransformer: print(...) -> logger.debug(...)
class PrintToLogger(ast.NodeTransformer):
    def visit_Call(self, node):
        self.generic_visit(node)
        if isinstance(node.func, ast.Name) and node.func.id == "print":
            node.func = ast.Attribute(ast.Name("logger"), "debug")
        return node
```
:::

A `NodeTransformer` is a visitor whose return values matter. Return the node to keep it, a different node to replace it, `None` to delete it (statements only), or a list to splice in several statements. Since 3.13, omitted list fields default to `[]` and an omitted `ctx` to `Load()`, so `ast.Attribute(ast.Name("logger"), "debug")` is a complete node.

Two more steps turn a tree back into running code. New nodes have no line numbers, and `compile()` refuses them (`TypeError: required field "lineno" missing from stmt`), so call `ast.fix_missing_locations(tree)` on the result, or `ast.copy_location(new, old)` as you build each node. Then `compile(tree, filename, "exec")` accepts the tree directly, and `exec()` runs the code object. Here's a transformer that does what pytest does to your test files:

```python run raises
import ast

source = """
prices = [10, 15]
assert sum(prices) == 30
"""

class ExplainAsserts(ast.NodeTransformer):
    """Like pytest: give `assert a == b` a message showing both values."""
    def visit_Assert(self, node):
        if node.msg is None and isinstance(node.test, ast.Compare):
            text = ast.Constant(ast.unparse(node.test))
            node.msg = ast.Call(ast.Name("explain"), [text, node.test.left, *node.test.comparators])
        return node

def explain(text, *values):
    return f"{text} failed, values: {values}"

tree = ast.fix_missing_locations(ExplainAsserts().visit(ast.parse(source)))
print(ast.unparse(tree))
exec(compile(tree, "<checks>", "exec"), {"explain": explain})
```

pytest really works this way. An import hook rewrites the `assert` statements in your test modules before they're compiled, keeping intermediate values in temporary variables so nothing is evaluated twice (the version above evaluates `sum(prices)` twice). That's why the same `assert` explains itself under pytest and fails with a bare `AssertionError` everywhere else.

:::gotcha `ast.unparse` is not a formatter
`ast.unparse(tree)` (3.9+) generates valid, normalised source: comments are gone, and spacing, quotes and parentheses are its own choice. That's fine for generated code and for showing a transformation, but running it over a file people maintain throws away their comments and formatting. Refactoring tools use a concrete syntax tree that keeps every comment and space: LibCST plays the role that recast and jscodeshift play in JavaScript.
:::

:::quiz output
What does this print?

```python
import ast

print(ast.unparse(ast.parse("total = (price  *  qty)   # before tax")))
```

- [ ] `total = (price  *  qty)   # before tax`
- [ ] `total = (price * qty)`
- [x] `total = price * qty`
- [ ] `total = price * qty  # before tax`

The tree holds no comments, no whitespace and no redundant parentheses, so `unparse` regenerates the text from scratch.
:::

## Bytecode with `dis`

:::compare
```js
// V8 compiles to bytecode too, but you need engine flags to see it:
//   node --print-bytecode --print-bytecode-filter=addTax app.js
function addTax(price, rate) {
  return price * (1 + rate);
}
```
```python
import dis

def add_tax(price, rate):
    return price * (1 + rate)

dis.dis(add_tax)   # LOAD_FAST_BORROW price, LOAD_SMALL_INT 1, ...
```
:::

CPython compiles every function to bytecode for a stack-based virtual machine and stores it on `fn.__code__`, together with the names it uses: `co_varnames` for locals (parameters first), `co_names` for globals and attributes, `co_consts` for constants. `dis.dis(fn)` prints a readable listing, and `dis.get_instructions(fn)` yields `Instruction` objects you can analyse in code. The instruction set changes in every release (`LOAD_SMALL_INT` and `LOAD_FAST_BORROW` are recent additions), so never build production logic on specific opcodes. Use `dis` to answer questions the source can't answer directly:

```python run
import dis

count = 0

def bump():
    count += 1          # an assignment anywhere makes `count` local

dis.dis(bump)           # LOAD_FAST_CHECK: read a local that may be unbound

TAX = 0.2

def total(prices):
    return round(sum(prices) * (1 + TAX), 2)

print([ins.argval for ins in dis.get_instructions(total) if ins.opname == "LOAD_GLOBAL"])
```

The first listing explains `UnboundLocalError` ([Variables, Types & Scope](lesson:variables-and-scope#global-nonlocal-and-unboundlocalerror)). Because `bump` assigns to `count` somewhere, the compiler made `count` local for the whole function, so the first instruction reads a local that was never set. Nothing is decided at runtime; the decision was compiled in. The second lists the globals `total` reads, without running it.

:::quiz output
What does this print?

```python
import dis

def seconds_per_day():
    return 60 * 60 * 24

print([ins.argval for ins in dis.get_instructions(seconds_per_day) if ins.opname == "LOAD_CONST"])
```

- [ ] `[60, 60, 24]`
- [x] `[86400]`
- [ ] `[60, 3600, 86400]`
- [ ] `[]`

The compiler folded `60 * 60 * 24` into a single constant, so the multiplications happen once, at compile time, and the function just loads `86400`. Constant folding is a classic optimisation, and the last challenge has you build it on the AST.
:::

:::deep Bytecode that rewrites itself
Since 3.11, CPython's *specialising adaptive interpreter* watches instructions as they run and swaps in versions specialised for the types it actually sees, such as a `BINARY_OP_ADD_INT` that only adds ints. `dis.dis(fn, adaptive=True)` shows the specialised forms once a function has warmed up. That machinery, the experimental JIT and the rest of the runtime are covered in [CPython Internals](lesson:cpython-internals).
:::

## `eval`, `exec` and `compile`

:::compare
```js
eval("2 + 3");                       // 5
eval("var total = 2 + 3");           // statements work too
const withTax = new Function("amount", "rate", "return amount * (1 + rate)");
```
```python
eval("2 + 3")                        # 5: a single expression only
exec("total = 2 + 3", namespace)     # statements; returns None
with_tax = eval("lambda amount, rate: amount * (1 + rate)")
```
:::

Python splits JavaScript's `eval` in two. `eval()` takes a single expression and returns its value, so `eval("x = 1")` is a `SyntaxError`. `exec()` runs any statements and returns `None`, so results come back through the namespace dict you hand it. `compile(source, filename, mode)` turns source, or an AST, into a reusable code object in mode `"eval"`, `"exec"` or `"single"` (the REPL's mode, which echoes expression values). Always pass an explicit globals dict: without one, the code runs in the caller's namespace, and at module level it can read and rebind every global.

The standard library uses these on purpose. `dataclasses` writes the source of your `__init__` and `exec`s it, `namedtuple` builds its `__new__` with `eval`, and template engines such as Jinja compile templates to Python code. The rule is the same as in JavaScript: generating code from strings you control is a technique, and evaluating strings someone else controls is a vulnerability.

```python run
namespace = {"rate": 0.2}
print(eval("100 * (1 + rate)", namespace))      # an expression: returns its value

exec("def with_tax(amount):\n    return round(amount * (1 + rate), 2)", namespace)
print(namespace["with_tax"](50))                # the def ran inside namespace
print(sorted(namespace))                        # exec added __builtins__ too

formula = compile("price * qty", "<formula>", "eval")   # parse once...
for price, qty in [(12, 3), (5, 2)]:
    print(eval(formula, {"price": price, "qty": qty}))  # ...evaluate many times
```

:::gotcha Python has no in-process sandbox
Stripping the builtins with `eval(text, {"__builtins__": {}})` blocks `open` and `__import__`, but every object leads back to `object`, and `object` knows every class that has been loaded:

```python run
classes = eval("().__class__.__base__.__subclasses__()", {"__builtins__": {}})
print(len(classes), "classes reachable with no builtins at all")
print([cls.__name__ for cls in classes if cls.__name__ in ("BuiltinImporter", "FileLoader")])
```

The import machinery is in that list, and through it the whole standard library. Untrusted code needs operating-system isolation: a locked-down subprocess, a container, or WebAssembly, which is how this page runs Python safely inside your browser.
:::

## Safe evaluation: `literal_eval` and whitelists

:::compare
```js
JSON.parse('{"sizes": [38, 40], "price": 9.5}');   // data only, never code
```
```python
ast.literal_eval("{'sizes': (38, 40), 'price': 9.5}")   # Python literals only
```
:::

`ast.literal_eval` parses a string and accepts nothing but literal syntax: strings, bytes, numbers, tuples, lists, dicts, sets, `True`, `False`, `None`, `...` and `set()`, plus a sign on a number and complex literals like `1+2j`. A name, a call or an attribute raises `ValueError` before anything is evaluated. Use it to read back `repr()` output or Python-literal settings. Keep JSON for data exchange, because the syntaxes differ: `true` and `null` versus `True` and `None`, and JSON has no tuples, sets or single-quoted strings.

```python run
import ast

for text in ["[1, 2.5, 'three']", "{'retries': 3, 'hosts': ('a', 'b')}", "-7", "set()",
             "true", "max(1, 2)", "__import__('os').getcwd()"]:
    try:
        print(f"{text:<38} -> {ast.literal_eval(text)!r}")
    except ValueError:
        print(f"{text:<38} -> ValueError")
```

:::quiz output
What does this print?

```python
import ast

print(ast.literal_eval("1 + 2"))
```

- [ ] `3`
- [ ] `'1 + 2'`
- [x] `ValueError`
- [ ] `SyntaxError`

Arithmetic isn't a literal. The only operators `literal_eval` accepts are a sign on a number and the `+` or `-` that joins the parts of a complex literal such as `1+2j`, so `1 + 2` is a "malformed node". That's the point: if it evaluated arithmetic, `9 ** 9 ** 9` would hang your server.
:::

:::gotcha Safe from code execution, not from big inputs
The documentation warns that large or deeply nested input can still raise `MemoryError` or `RecursionError`, and can even crash the interpreter by exhausting the compiler's stack. Cap the length of untrusted input before you parse it.
:::

### Beyond literals: whitelist the tree

When users need real formulas (spreadsheet cells, pricing rules, feature-flag conditions), don't reach for `eval` with a filtered namespace. Parse in `"eval"` mode and evaluate the tree yourself, accepting only the node types you list. Everything else fails, because the only code that runs is yours:

```python run raises
import ast
import operator

OPERATORS = {ast.Add: operator.add, ast.Sub: operator.sub,
             ast.Mult: operator.mul, ast.Div: operator.truediv}

def evaluate(formula, variables):
    def value_of(node):
        match node:
            case ast.Constant(value=int() | float() as number):
                return number
            case ast.Name(id=name) if name in variables:
                return variables[name]
            case ast.BinOp(left, op, right) if type(op) in OPERATORS:
                return OPERATORS[type(op)](value_of(left), value_of(right))
        raise ValueError(f"not allowed: {ast.unparse(node)}")
    return value_of(ast.parse(formula, mode="eval").body)

print(evaluate("price * qty - discount", {"price": 12, "qty": 3, "discount": 5}))
print(evaluate("price.__class__", {"price": 12}))
```

## Loading code by name: `importlib` and plugins

:::compare
```js
// every file in ./plugins is a plugin
for (const file of await readdir(new URL("./plugins", import.meta.url))) {
  const plugin = await import(`./plugins/${file}`);
  plugin.setup(app);
}

// an installed dependency's version
const { version } = require("left-pad/package.json");
```
```python
# every module in the plugins package is a plugin
for info in pkgutil.iter_modules(plugins.__path__):
    plugin = importlib.import_module(f"plugins.{info.name}")
    plugin.setup(app)


# an installed distribution's version
version = importlib.metadata.version("httpx")
```
:::

[Modules, Packages & Tooling](lesson:modules-and-tooling#import-styles) covered `importlib.import_module` (a synchronous `import()`) and `importlib.reload`, and its [entry-point challenge](lesson:modules-and-tooling#mod-load-entry-point) resolved `"module:attr"` strings. A plugin system adds *discovery*, and Python offers three levels of it:

1. **A package as a plugin folder.** `pkgutil.iter_modules(package.__path__)` lists the modules in a package without importing them, so you can filter by name before any plugin code runs.
2. **Entry points.** Installed distributions declare plugins in their packaging metadata, under a group name you choose. `importlib.metadata.entry_points(group=...)` finds them across every installed package, and nothing is imported until you call `ep.load()`. pytest plugins (the `pytest11` group), Flask's `flask.commands` and every `[project.scripts]` console script work this way.
3. **Registration on import.** A plugin applies your decorator or subclasses your base class, and `__init_subclass__` records it ([Classes as Objects & Metaclasses](lesson:metaclasses)). Something still has to import the plugin, so this pairs with one of the first two.

```python run
import importlib
import pkgutil
import shutil
import sys
from pathlib import Path

FILES = {
    "__init__.py": "",
    "discounts.py": "def setup(app):\n    app.append('discounts')\n",
    "shipping.py": "def setup(app):\n    app.append('shipping')\n",
    "_helpers.py": "raise RuntimeError('a private module got imported')\n",
}
shutil.rmtree("shop_plugins", ignore_errors=True)
Path("shop_plugins").mkdir()
for filename, code in FILES.items():
    Path("shop_plugins", filename).write_text(code, encoding="utf-8")
importlib.invalidate_caches()
for name in [m for m in sys.modules if m.partition(".")[0] == "shop_plugins"]:
    del sys.modules[name]

import shop_plugins

app = []
for info in pkgutil.iter_modules(shop_plugins.__path__):
    if not info.name.startswith("_"):              # filter *before* importing
        importlib.import_module(f"shop_plugins.{info.name}").setup(app)
print(app)
```

Entry points are declared by the plugin's own `pyproject.toml`, much like a field in `package.json` that your host package knows to look for:

```toml title="pyproject.toml"
[project]
name = "acme-shipping"
version = "1.2.0"

[project.entry-points."shop.carriers"]
ups = "acme_shipping:Ups"
```

`pip install` turns that into a `.dist-info` folder next to the code. This playground writes one by hand and then discovers it like any installed plugin:

```python run
import importlib
import importlib.metadata
import sys
from pathlib import Path

# What `pip install acme-shipping` leaves in site-packages:
Path("acme_shipping.py").write_text("class Ups:\n    carrier = 'UPS'\n", encoding="utf-8")
dist_info = Path("acme_shipping-1.2.0.dist-info")
dist_info.mkdir(exist_ok=True)
metadata = "Metadata-Version: 2.1\nName: acme-shipping\nVersion: 1.2.0\n"
(dist_info / "METADATA").write_text(metadata, encoding="utf-8")
(dist_info / "entry_points.txt").write_text("[shop.carriers]\nups = acme_shipping:Ups\n", encoding="utf-8")
importlib.invalidate_caches()
sys.modules.pop("acme_shipping", None)

print(importlib.metadata.version("acme-shipping"))
for ep in importlib.metadata.entry_points(group="shop.carriers"):
    print(ep.name, "=", ep.value, "->", ep.load().carrier)   # load() imports now
```

`importlib.metadata.version()` raises `PackageNotFoundError` for a distribution that isn't installed, which makes it the standard way to ask "is the optional dependency there, and which version?"

:::gotcha Importing is executing
Discovery is cheap and safe. `import_module()` and `ep.load()` aren't: they run the plugin's top-level code with your program's privileges. `iter_modules()` and `entry_points()` let you filter by name first, but a plugin system is a code-execution system, so load only what the user installed or configured.
:::

:::tip Two more `importlib` tools
`importlib.resources.files("shop_plugins") / "rates.json"` locates a data file shipped inside a package, even when the package lives in a zip archive, where `__file__` paths don't work (≈ `new URL("./rates.json", import.meta.url)`). To import a file by path, even one called `cleanup-job.py` that isn't a valid module name, use `spec = importlib.util.spec_from_file_location("cleanup_job", path)`, then `module = importlib.util.module_from_spec(spec)` and `spec.loader.exec_module(module)`.
:::

## Cheat sheet

| JavaScript | Python | Notes |
| --- | --- | --- |
| `fn.length` | `inspect.signature(fn).parameters` | names, kinds, defaults, annotations |
| `fn.name` | `fn.__name__`, `fn.__qualname__` | `__qualname__` includes the class |
| `fn.toString()` | `inspect.getsource(fn)` | reads the source file |
| (no equivalent) | `sig.bind(*args, **kwargs)` | check a call without making it |
| `Object.getOwnPropertyNames(C.prototype)` | `inspect.getmembers(C, predicate)` | sorted, inherited included |
| `typeof x === "function"` | `callable(x)`, `inspect.isfunction(x)` | many finer predicates |
| `Object.getOwnPropertyDescriptor(o, k)` | `inspect.getattr_static(o, k)` | no property or `__getattr__` call |
| `new Error().stack` | `inspect.currentframe()`, `inspect.stack()` | frames are objects |
| `acorn.parse(code)` | `ast.parse(code)` | the compiler's own parser |
| AST explorer | `ast.dump(tree, indent=2)`, `python -m ast` | |
| an ESLint rule | `ast.NodeVisitor` | call `generic_visit` to descend |
| a Babel plugin | `ast.NodeTransformer` | return the replacement node |
| `@babel/generator` | `ast.unparse(tree)` | drops comments and formatting |
| recast, jscodeshift | LibCST (third-party) | keeps formatting |
| `node --print-bytecode` | `dis.dis(fn)` | changes every release |
| `eval(code)` | `eval(expr, ns)` or `exec(stmts, ns)` | never on untrusted input |
| `new Function(args, body)` | `exec("def ...", ns)`, `compile()` | |
| `JSON.parse(text)` | `ast.literal_eval(text)` | Python literals only |
| `await import(name)` | `importlib.import_module(name)` | synchronous |
| `readdir` + `import()` | `pkgutil.iter_modules(pkg.__path__)` | lists without importing |
| a dependency's `package.json` version | `importlib.metadata.version(name)` | `PackageNotFoundError` if absent |
| plugin fields in `package.json` | `importlib.metadata.entry_points(group=...)` | declared in `pyproject.toml` |

## Challenges

:::challenge id=introspect-inject title="Inject what it asks for" difficulty=easy
Plugin hooks and test fixtures call your function with only the arguments it declares: pytest looks at a test's parameter names to decide which fixtures to pass. Write `inject(fn, available)`, where `available` is a dict of named values, that calls `fn` and returns its result:

- If `fn` accepts `**kwargs`, pass everything in `available` as keyword arguments.
- Otherwise, pass only the entries whose names match parameters that can be passed by keyword (`POSITIONAL_OR_KEYWORD` or `KEYWORD_ONLY`). A `*args` parameter is never filled by name.
- Parameters that aren't in `available` keep their defaults. If a required one is missing, let the call raise its `TypeError`.

Use `inspect.signature`. You can assume `fn` has no positional-only parameters.

```text
def handler(user, db): ...
inject(handler, {"db": "DB", "user": "ada", "config": {}})   ->  handler(user="ada", db="DB")
```

```js
// Roughly what Angular 1's injector did: parse the source for names
function inject(fn, available) {
  const params = fn.toString().match(/\(([^)]*)\)/)[1];
  const names = params.split(",").map((s) => s.trim()).filter(Boolean);
  return fn(...names.map((name) => available[name]));
}
```

```python starter
import inspect


def inject(fn, available):
    ...
```

```python solution
import inspect

BY_NAME = (inspect.Parameter.POSITIONAL_OR_KEYWORD, inspect.Parameter.KEYWORD_ONLY)


def inject(fn, available):
    params = inspect.signature(fn).parameters.values()
    if any(p.kind is inspect.Parameter.VAR_KEYWORD for p in params):
        return fn(**available)
    wanted = {p.name for p in params if p.kind in BY_NAME}
    return fn(**{name: value for name, value in available.items() if name in wanted})
```

```python tests
import functools

@test("passes only the parameters fn declares")
def _():
    def handler(user, db):
        return (user, db)

    eq(inject(handler, {"db": "DB", "user": "ada", "config": {}}), ("ada", "DB"))

@test("keyword-only parameters are injected too")
def _():
    def report(rows, *, fmt):
        return f"{len(rows)} rows as {fmt}"

    eq(inject(report, {"fmt": "csv", "rows": [1, 2], "user": "ada"}), "2 rows as csv")

@test("parameters that aren't available keep their defaults")
def _():
    def greet(name, greeting="Hello"):
        return f"{greeting}, {name}"

    eq(inject(greet, {"name": "Ada"}), "Hello, Ada")
    eq(inject(greet, {"name": "Ada", "greeting": "Hi"}), "Hi, Ada")

@test("falsy values are still passed")
def _():
    def configure(retries=3, label="default", debug=True):
        return (retries, label, debug)

    eq(inject(configure, {"retries": 0, "label": "", "debug": False}), (0, "", False))

@test("a missing required parameter raises TypeError")
def _():
    def handler(user, db):
        return (user, db)

    raises(TypeError, inject, handler, {"user": "ada"})

@test("a function with **kwargs receives everything")
def _():
    def log(message, **fields):
        return (message, fields)

    eq(inject(log, {"message": "hi", "user": "ada", "ip": "10.0.0.1"}), ("hi", {"user": "ada", "ip": "10.0.0.1"}))

@test("*args can't be filled by name")
def _():
    def collect(*args, sep=","):
        return (args, sep)

    eq(inject(collect, {"args": (1, 2), "sep": ";"}), ((), ";"))

@test("bound methods and lambdas work")
def _():
    class Service:
        def handle(self, db):
            return f"{type(self).__name__} using {db}"

    eq(inject(Service().handle, {"db": "postgres", "user": "ada"}), "Service using postgres")
    eq(inject(lambda db: db * 2, {"db": 21, "user": "ada"}), 42)

@test("sees through functools.wraps wrappers")
def _():
    def traced(fn):
        @functools.wraps(fn)
        def wrapper(*args, **kwargs):
            return fn(*args, **kwargs)
        return wrapper

    @traced
    def handler(user):
        return user

    eq(inject(handler, {"user": "ada", "db": "DB"}), "ada")

@test("reads the signature with inspect")
def _():
    requires_call("signature", "use inspect.signature(fn) to find the parameters")
```

```hint
`inspect.signature(fn).parameters.values()` gives you `Parameter` objects. Compare each `param.kind` with `inspect.Parameter.VAR_KEYWORD` and the other kinds.
```

```hint
Build the keyword arguments with a dict comprehension over `available.items()`, then call `fn(**kwargs)`. You don't need to check for missing required parameters: Python raises the `TypeError` for you.
```
:::

:::challenge id=introspect-discover-plugins title="Discover plugins" difficulty=medium
Write `discover(package_name)` for a plugin system where every module in a package is a plugin, and each plugin defines a `setup(app)` function. Return a dict mapping each plugin's short module name (`"discounts"`, not `"shop_ext.discounts"`) to its `setup` function, with the names in sorted order.

- Import the package with `importlib.import_module`, and list its direct submodules (subpackages included) with `pkgutil.iter_modules`.
- Skip modules whose name starts with `_`, **without importing them**: importing runs their code.
- Skip modules that have no callable `setup`.
- Import plugins under their full dotted name, so they land in `sys.modules` as `package_name.plugin`.
- A missing package raises `ModuleNotFoundError`, which `import_module` already does.

```text
shop_ext/
    __init__.py
    discounts.py     def setup(app): ...
    shipping.py      def setup(app): ...
    _helpers.py      (private: never imported)
    notes.py         (no setup: skipped)

discover("shop_ext")  ->  {"discounts": <function setup>, "shipping": <function setup>}
```

```python starter
import importlib
import pkgutil


def discover(package_name):
    ...
```

```python solution
import importlib
import pkgutil


def discover(package_name):
    package = importlib.import_module(package_name)
    plugins = {}
    for info in pkgutil.iter_modules(package.__path__):
        if info.name.startswith("_"):
            continue                      # skip before importing: importing runs code
        module = importlib.import_module(f"{package_name}.{info.name}")
        setup = getattr(module, "setup", None)
        if callable(setup):
            plugins[info.name] = setup
    return dict(sorted(plugins.items()))
```

```python tests
import importlib
import shutil
import sys
from pathlib import Path

def make_package(name, files):
    """Write a fresh package to the in-memory filesystem and forget any cached copy."""
    shutil.rmtree(name, ignore_errors=True)
    for relative, code in {"__init__.py": "", **files}.items():
        path = Path(name, relative)
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(code, encoding="utf-8")
    importlib.invalidate_caches()
    for module in list(sys.modules):
        if module == name or module.startswith(name + "."):
            del sys.modules[module]

SETUP = "def setup(app):\n    app.append(__name__)\n"

@test("maps each plugin's name to its setup function")
def _():
    make_package("fjip_ext_basic", {"discounts.py": SETUP, "shipping.py": SETUP})
    plugins = discover("fjip_ext_basic")
    eq(sorted(plugins), ["discounts", "shipping"])
    check(plugins["discounts"] is sys.modules["fjip_ext_basic.discounts"].setup,
          "the values should be the modules' setup functions, imported as package.module")

@test("names come back sorted")
def _():
    make_package("fjip_ext_order", {"zoning.py": SETUP, "alerts.py": SETUP, "mailer.py": SETUP})
    eq(list(discover("fjip_ext_order")), ["alerts", "mailer", "zoning"])

@test("skips private modules without importing them")
def _():
    make_package("fjip_ext_private", {
        "audit.py": SETUP,
        "_helpers.py": SETUP,
        "_broken.py": "raise RuntimeError('private modules must not be imported')\n",
    })
    eq(list(discover("fjip_ext_private")), ["audit"])

@test("skips modules without a callable setup")
def _():
    make_package("fjip_ext_partial", {
        "reports.py": SETUP,
        "notes.py": "TITLE = 'no setup here'\n",
        "fake.py": "setup = 'not callable'\n",
    })
    eq(list(discover("fjip_ext_partial")), ["reports"])

@test("subpackages can be plugins too")
def _():
    make_package("fjip_ext_nested", {"payments/__init__.py": SETUP, "tax.py": SETUP})
    eq(list(discover("fjip_ext_nested")), ["payments", "tax"])

@test("the setup functions work")
def _():
    make_package("fjip_ext_run", {"alpha.py": SETUP, "beta.py": SETUP})
    app = []
    for setup in discover("fjip_ext_run").values():
        setup(app)
    eq(app, ["fjip_ext_run.alpha", "fjip_ext_run.beta"])

@test("an empty package has no plugins")
def _():
    make_package("fjip_ext_empty", {})
    eq(discover("fjip_ext_empty"), {})

@test("a missing package raises ModuleNotFoundError")
def _():
    raises(ModuleNotFoundError, discover, "fjip_no_such_package")
```

```hint
`importlib.import_module(package_name)` gives you the package object, and its `__path__` is exactly what `pkgutil.iter_modules()` wants.
```

```hint
Each `ModuleInfo` that `iter_modules` yields has a `.name`, the short name like `"discounts"`. Check for the underscore first, then import `f"{package_name}.{info.name}"`.
```

```hint
`getattr(module, "setup", None)` returns `None` when there's no `setup`, and `callable()` rejects both that and a non-function `setup`. `dict(sorted(plugins.items()))` sorts by name.
```
:::

:::challenge id=introspect-mini-linter title="A mini linter" difficulty=medium
Write `lint(source)` that parses Python source, **without running it**, and returns a sorted list of `(line, code)` tuples, one per problem:

| Code | Problem | Line to report |
| --- | --- | --- |
| `"mutable-default"` | a list, dict or set literal (`[]`, `{}`, `{1}`) used as a parameter default in a `def` or `async def`, positional or keyword-only | where the default value starts |
| `"bare-except"` | an `except:` clause with no exception type | the `except` line |
| `"none-compare"` | `== None` or `!= None`, with `None` on either side | the comparison's line |

`x is None`, `except ValueError:` and immutable defaults such as `()`, `""`, `0`, `None` and `frozenset()` are all fine. Problems inside classes and nested functions count too.

```text
lint("def add(item, items=[]):\n    return items == None\n")
->  [(1, "mutable-default"), (2, "none-compare")]
```

```js
// ESLint's no-eq-null rule, roughly: the JS cousin of "none-compare"
export default {
  create(context) {
    return {
      BinaryExpression(node) {
        const isNull = (n) => n.type === "Literal" && n.value === null;
        if (["==", "!="].includes(node.operator) && (isNull(node.left) || isNull(node.right))) {
          context.report({ node, message: "use === null" });
        }
      },
    };
  },
};
```

```python starter
import ast


def lint(source):
    tree = ast.parse(source)
    problems = []
    ...
    return problems
```

```python solution
import ast

MUTABLE_LITERALS = (ast.List, ast.Dict, ast.Set)


def is_none(node):
    return isinstance(node, ast.Constant) and node.value is None


class Linter(ast.NodeVisitor):
    def __init__(self):
        self.problems = []

    def report(self, node, code):
        self.problems.append((node.lineno, code))

    def visit_FunctionDef(self, node):
        # kw_defaults holds None for keyword-only parameters without a default
        for default in [*node.args.defaults, *node.args.kw_defaults]:
            if isinstance(default, MUTABLE_LITERALS):
                self.report(default, "mutable-default")
        self.generic_visit(node)

    visit_AsyncFunctionDef = visit_FunctionDef

    def visit_ExceptHandler(self, node):
        if node.type is None:
            self.report(node, "bare-except")
        self.generic_visit(node)

    def visit_Compare(self, node):
        operands = [node.left, *node.comparators]
        for op, left, right in zip(node.ops, operands, operands[1:]):
            if isinstance(op, (ast.Eq, ast.NotEq)) and (is_none(left) or is_none(right)):
                self.report(node, "none-compare")
        self.generic_visit(node)


def lint(source):
    linter = Linter()
    linter.visit(ast.parse(source))
    return sorted(linter.problems)
```

```python tests
@test("clean code has no problems")
def _():
    eq(lint("def greet(name, greeting='hi', *, loud=False):\n    return name is None\n"), [])

@test("flags list, dict and set literals as defaults")
def _():
    eq(lint("def add(item, items=[]):\n    pass\n"), [(1, "mutable-default")])
    eq(lint("def cache(key, store={}):\n    pass\n"), [(1, "mutable-default")])
    eq(lint("def tag(name, seen={'x'}):\n    pass\n"), [(1, "mutable-default")])

@test("keyword-only defaults and async functions count too")
def _():
    eq(lint("def f(*, opts={}):\n    pass\n"), [(1, "mutable-default")])
    eq(lint("async def fetch(url, headers={}):\n    pass\n"), [(1, "mutable-default")])

@test("immutable defaults are fine")
def _():
    eq(lint("def f(a=(), b='', c=0, d=None, e=frozenset(), *, g=None, h):\n    pass\n"), [])

@test("flags bare except, but not except with a type")
def _():
    source = "try:\n    run()\nexcept ValueError:\n    pass\nexcept:\n    pass\n"
    eq(lint(source), [(5, "bare-except")])

@test("flags == None and != None, but not is None")
def _():
    eq(lint("if user == None:\n    pass\n"), [(1, "none-compare")])
    eq(lint("ok = None != result\n"), [(1, "none-compare")])
    eq(lint("if user is None or count == 0:\n    pass\n"), [])

@test("reports lines in order, including nested code")
def _():
    source = '''
class Repo:
    def find(self, key, cache={}):
        try:
            return cache[key]
        except:
            return None

def outer():
    def inner(value):
        return value == None
    return inner
'''
    eq(lint(source), [(3, "mutable-default"), (6, "bare-except"), (11, "none-compare")])

@test("a multi-line default is reported where the default starts")
def _():
    source = "def plot(\n    data,\n    style={\n        'color': 'red',\n    },\n):\n    pass\n"
    eq(lint(source), [(3, "mutable-default")])

@test("parses the code without running it")
def _():
    source = "print('side effect!')\nraise SystemExit('this ran')\n"
    eq(output_of(lint, source), "", "lint() printed something: did it run the code?")
    eq(lint(source), [])
```

```hint
A function's defaults live in `node.args.defaults` (positional) and `node.args.kw_defaults` (keyword-only, with `None` for keyword-only parameters that have no default). Each default is itself a node with a `lineno`.
```

```hint
An `ast.ExceptHandler` whose `type is None` is a bare `except:`. A comparison is an `ast.Compare` with a `left` operand, a list of `ops` and a list of `comparators`; pair them up with `zip`.
```

```hint
End every `visit_` method with `self.generic_visit(node)`, or the methods inside a class and the functions inside a function are never checked. `visit_AsyncFunctionDef = visit_FunctionDef` reuses one method for `async def`.
```
:::

:::challenge id=introspect-fold-constants title="Constant folding" difficulty=hard
CPython's compiler pre-computes arithmetic on constants, as the `dis` quiz showed. Build the same optimisation on the AST: write `fold(source)` that returns the source, via `ast.unparse`, with every constant-only arithmetic expression replaced by its value.

- Fold a binary operation when both operands are `int` or `float` constants, after their own sub-expressions have been folded. Support `+`, `-`, `*`, `/`, `//`, `%` and `**`.
- Fold unary `-` and `+` applied to an `int` or `float` constant.
- Only numbers: leave strings, lists and everything else alone, even `'-' * 40`.
- If computing the value raises (`1 / 0`, `10.0 ** 400`), leave that expression unchanged, so the program still fails at runtime as it would have.
- Don't reorder anything. `price + 1 + 2` means `(price + 1) + 2`, which has no constant-only part.

Use an `ast.NodeTransformer`. (A real compiler also refuses to fold results that would be huge, like `2 ** 100_000`. You don't need to.)

```text
fold("timeout = 60 * 60 * 24")   ->  "timeout = 86400"
fold("area = width * (2 + 3)")   ->  "area = width * 5"
fold("delta = -(2 ** 3) + x")    ->  "delta = -8 + x"
fold("ratio = 1 / 0")            ->  "ratio = 1 / 0"
fold("total = price + 1 + 2")    ->  "total = price + 1 + 2"
```

```python starter
import ast


class ConstantFolder(ast.NodeTransformer):
    ...


def fold(source):
    ...
```

```python solution
import ast
import operator

BINARY = {
    ast.Add: operator.add,
    ast.Sub: operator.sub,
    ast.Mult: operator.mul,
    ast.Div: operator.truediv,
    ast.FloorDiv: operator.floordiv,
    ast.Mod: operator.mod,
    ast.Pow: operator.pow,
}
UNARY = {ast.UAdd: operator.pos, ast.USub: operator.neg}


def is_number(node):
    return isinstance(node, ast.Constant) and type(node.value) in (int, float)


class ConstantFolder(ast.NodeTransformer):
    def visit_BinOp(self, node):
        self.generic_visit(node)               # fold the operands first
        op = BINARY.get(type(node.op))
        if op is None or not (is_number(node.left) and is_number(node.right)):
            return node
        try:
            value = op(node.left.value, node.right.value)
        except ArithmeticError:                # 1 / 0, 10.0 ** 400: leave for runtime
            return node
        return ast.copy_location(ast.Constant(value), node)

    def visit_UnaryOp(self, node):
        self.generic_visit(node)
        op = UNARY.get(type(node.op))
        if op is None or not is_number(node.operand):
            return node
        return ast.copy_location(ast.Constant(op(node.operand.value)), node)


def fold(source):
    return ast.unparse(ConstantFolder().visit(ast.parse(source)))
```

```python tests
@test("folds a chain of constants")
def _():
    eq(fold("timeout = 60 * 60 * 24"), "timeout = 86400")

@test("folds constant sub-expressions next to variables")
def _():
    eq(fold("area = width * (2 + 3)"), "area = width * 5")
    eq(fold("total = price + (1 + 2)"), "total = price + 3")

@test("doesn't reorder: (price + 1) + 2 has no constant-only part")
def _():
    eq(fold("total = price + 1 + 2"), "total = price + 1 + 2")

@test("handles every arithmetic operator")
def _():
    eq(fold("x = 7 // 2 % 3"), "x = 0")
    eq(fold("ratio = 1 / 4"), "ratio = 0.25")
    eq(fold("big = 2 ** 10 - 24"), "big = 1000")

@test("folds unary minus and plus")
def _():
    eq(fold("delta = -(2 ** 3) + offset"), "delta = -8 + offset")
    eq(fold("n = +5 - -5"), "n = 10")

@test("leaves operations that would raise for runtime")
def _():
    eq(fold("ratio = 1 / 0"), "ratio = 1 / 0")
    eq(fold("huge = 10.0 ** 400"), "huge = 10.0 ** 400")

@test("only folds numbers")
def _():
    eq(fold("line = '-' * 40"), "line = '-' * 40")
    eq(fold("names = ['a'] + ['b']"), "names = ['a'] + ['b']")

@test("folds everywhere: inside functions, calls and conditions")
def _():
    source = "def wait():\n    if retries > 2 * 3:\n        sleep(0.5 * 4)\n"
    eq(fold(source), "def wait():\n    if retries > 6:\n        sleep(2.0)")

@test("the folded program computes the same values")
def _():
    program = "a = 3 * (4 + 5) - 2 ** 5\nb = (a + 2 * 3) / (10 - 6)\nc = -(7 % 4) * a\n"
    before, after = {}, {}
    exec(program, before)
    exec(fold(program), after)
    eq({k: after[k] for k in "abc"}, {k: before[k] for k in "abc"})

@test("uses a NodeTransformer")
def _():
    check("NodeTransformer" in source, "subclass ast.NodeTransformer and return replacement nodes")
```

```hint
Call `self.generic_visit(node)` *first* in `visit_BinOp`. It transforms the children, so by the time you look at `node.left` and `node.right`, a nested `(2 + 3)` has already become `Constant(5)`.
```

```hint
Map node types to functions, `{ast.Add: operator.add, ...}`, and look them up with `type(node.op)`. `type(value) in (int, float)` keeps strings and lists out.
```

```hint
Return `ast.copy_location(ast.Constant(value), node)` to replace a node, or `node` to keep it. `except ArithmeticError` covers both `ZeroDivisionError` and `OverflowError`.
```
:::
