---
title: Build an Expression Calculator
part: Interpreters & Text
summary: A regex tokenizer, a recursive-descent parser and a match-based evaluator, plus variables and caret errors.
minutes: 90
---

You'll build a small language: a calculator that reads lines like `area = pi * r ^ 2`, remembers variables from one line to the next, and reports mistakes with a caret under the offending column. Inside, it's the three-stage pipeline every interpreter has, from Babel to CPython: a tokenizer, a parser and an evaluator.

If you've written a parser in JavaScript, the architecture will feel familiar. The Python is what's new: `re` tells you which alternative of a pattern matched, dataclasses give syntax trees equality and a readable repr for free, `match` replaces `switch (node.type)`, and exceptions carry error positions instead of `{ ok: false }` objects.

## What you'll build

By the end of step 6, `evaluate_lines()` runs a whole session. Each line is tokenized, parsed into a tree and evaluated against one shared set of variables, with `pi`, `e` and `tau` predefined. A line that fails produces a report pointing at the problem, and the session carries on:

```python
session = """
# Lines starting with # are comments
r = 2.5
area = pi * r ^ 2
-2 ^ 2 + 2 ^ 3 ^ 2
2 ^ 100
area / (r - 2.5)
3 * (r + 1
4 $ 2
radius * 2
"""

for report in evaluate_lines(session):
    print(report)
```

It prints one report per line:

```output
r = 2.5
area = 19.634954084936208
508
1267650600228229401496703205376
area / (r - 2.5)
     ^ division by zero
3 * (r + 1
          ^ expected ')', found end of input
4 $ 2
  ^ unexpected character '$'
radius * 2
^ unknown variable 'radius'
```

The arithmetic is Python's, and the calculator leans on it rather than reimplementing it: integers never overflow, `/` is always true division, and `%` takes the sign of the divisor.

:::deep Spoiler: run the finished calculator
This is the whole program you'll write, piece by piece, in the steps below. Open it to try your own lines first: edit the session at the bottom and run it again.

```python run
import math
import operator
import re
from dataclasses import dataclass, field


class CalcError(Exception):
    """Base class for everything the calculator rejects."""

    def __init__(self, message: str, pos: int):
        super().__init__(message)
        self.pos = pos  # 0-based column of the offending input


class ParseError(CalcError):
    """The input isn't a valid expression."""


@dataclass(frozen=True)
class Token:
    kind: str  # "NUMBER", "NAME", "OP" or "EOF"
    text: str
    pos: int


TOKEN_RE = re.compile(r"""
    (?P<NUMBER> [0-9]+ (?:\.[0-9]*)? | \.[0-9]+ )
  | (?P<NAME>   [A-Za-z_][A-Za-z0-9_]* )
  | (?P<OP>     [-+*/%^()=] )
  | (?P<SPACE>  \s+ )
  | (?P<ERROR>  . )
""", re.VERBOSE)


def tokenize(source: str) -> list[Token]:
    """Split source into tokens, ending with an EOF token."""
    tokens = []
    for m in TOKEN_RE.finditer(source):
        kind = m.lastgroup
        if kind == "SPACE":
            continue
        if kind == "ERROR":
            raise ParseError(f"unexpected character {m[0]!r}", m.start())
        tokens.append(Token(kind, m[0], m.start()))
    tokens.append(Token("EOF", "", len(source)))
    return tokens


def position():
    """A `pos` field: keyword-only, and ignored by == and repr()."""
    return field(default=0, kw_only=True, compare=False, repr=False)


type Node = Num | Name | UnaryOp | BinOp | Assign


@dataclass(frozen=True)
class Num:
    value: int | float
    pos: int = position()


@dataclass(frozen=True)
class Name:
    id: str
    pos: int = position()


@dataclass(frozen=True)
class UnaryOp:
    op: str
    operand: Node
    pos: int = position()


@dataclass(frozen=True)
class BinOp:
    op: str
    left: Node
    right: Node
    pos: int = position()


@dataclass(frozen=True)
class Assign:
    name: str
    value: Node
    pos: int = position()


def describe(token: Token) -> str:
    """How a token reads in an error message."""
    return "end of input" if token.kind == "EOF" else repr(token.text)


class Parser:
    def __init__(self, tokens: list[Token]):
        self.tokens = tokens
        self.i = 0

    def peek(self, ahead: int = 0) -> Token:
        """Look at a token without consuming it. Past the end, EOF repeats."""
        return self.tokens[min(self.i + ahead, len(self.tokens) - 1)]

    def advance(self) -> Token:
        """Consume the current token and return it."""
        token = self.peek()
        self.i += 1
        return token

    def expect(self, text: str) -> Token:
        """Consume a token with exactly this text, or raise ParseError."""
        token = self.peek()
        if token.text != text:
            raise ParseError(f"expected {text!r}, found {describe(token)}", token.pos)
        return self.advance()

    def parse(self) -> Node:
        """Parse all the tokens. Anything left over is an error."""
        node = self.statement()
        token = self.peek()
        if token.kind != "EOF":
            raise ParseError(f"unexpected {describe(token)}", token.pos)
        return node

    def statement(self) -> Node:
        """statement := NAME "=" expression | expression"""
        if self.peek().kind == "NAME" and self.peek(1).text == "=":
            name = self.advance()
            self.advance()  # the "="
            return Assign(name.text, self.expression(), pos=name.pos)
        return self.expression()

    def expression(self) -> Node:
        """expression := term (("+" | "-") term)*"""
        node = self.term()
        while self.peek().text in ("+", "-"):
            op = self.advance()
            node = BinOp(op.text, node, self.term(), pos=op.pos)
        return node

    def term(self) -> Node:
        """term := unary (("*" | "/" | "%") unary)*"""
        node = self.unary()
        while self.peek().text in ("*", "/", "%"):
            op = self.advance()
            node = BinOp(op.text, node, self.unary(), pos=op.pos)
        return node

    def unary(self) -> Node:
        """unary := ("-" | "+") unary | power"""
        if self.peek().text in ("-", "+"):
            op = self.advance()
            return UnaryOp(op.text, self.unary(), pos=op.pos)
        return self.power()

    def power(self) -> Node:
        """power := atom ("^" unary)?"""
        base = self.atom()
        if self.peek().text == "^":
            op = self.advance()
            return BinOp("^", base, self.unary(), pos=op.pos)
        return base

    def atom(self) -> Node:
        """atom := NUMBER | NAME | "(" expression ")" """
        token = self.advance()
        if token.kind == "NUMBER":
            value = float(token.text) if "." in token.text else int(token.text)
            return Num(value, pos=token.pos)
        if token.kind == "NAME":
            return Name(token.text, pos=token.pos)
        if token.text == "(":
            node = self.expression()
            self.expect(")")
            return node
        raise ParseError(f"unexpected {describe(token)}", token.pos)


def parse(source: str) -> Node:
    """Parse one line of calculator input into an AST."""
    return Parser(tokenize(source)).parse()


class EvalError(CalcError):
    """The input parsed, but it can't be evaluated."""


OPERATORS = {
    "+": operator.add,
    "-": operator.sub,
    "*": operator.mul,
    "/": operator.truediv,
    "%": operator.mod,
    "^": operator.pow,
}


def evaluate(node: Node, env: dict[str, int | float]) -> int | float:
    """Compute the value of a tree, looking variables up in env."""
    match node:
        case Num(value):
            return value
        case Name(name) if name in env:
            return env[name]
        case Name(name):
            raise EvalError(f"unknown variable {name!r}", node.pos)
        case UnaryOp("-", operand):
            return -evaluate(operand, env)
        case UnaryOp("+", operand):
            return evaluate(operand, env)
        case BinOp(op, left, right):
            a, b = evaluate(left, env), evaluate(right, env)
            try:
                result = OPERATORS[op](a, b)
            except ZeroDivisionError:
                raise EvalError("division by zero", node.pos) from None
            except OverflowError:
                raise EvalError("number too large", node.pos) from None
            if isinstance(result, complex):
                raise EvalError("result is a complex number", node.pos)
            return result
        case Assign(name, value):
            env[name] = evaluate(value, env)
            return env[name]
    raise TypeError(f"not a node: {node!r}")


CONSTANTS = {"pi": math.pi, "e": math.e, "tau": math.tau}


def evaluate_lines(text: str) -> list[str]:
    """Run every line of text in one shared environment, collecting a report per line."""
    env = dict(CONSTANTS)
    reports = []
    for line in text.splitlines():
        if not line.strip() or line.lstrip().startswith("#"):
            continue
        try:
            tree = parse(line)
            value = evaluate(tree, env)
        except CalcError as err:
            reports.append(f"{line}\n{' ' * err.pos}^ {err}")
        else:
            reports.append(f"{tree.name} = {value}" if isinstance(tree, Assign) else str(value))
    return reports


# ---- try it --------------------------------------------------------------

session = """
# Lines starting with # are comments
r = 2.5
area = pi * r ^ 2
-2 ^ 2 + 2 ^ 3 ^ 2
2 ^ 100
area / (r - 2.5)
3 * (r + 1
4 $ 2
radius * 2
"""

for report in evaluate_lines(session):
    print(report)
```
:::

## How the pieces fit

Each stage is a function of the previous stage's output:

```text
"area = pi * r ^ 2"
    │  tokenize()                                            step 1
    ▼
NAME 'area'  OP '='  NAME 'pi'  OP '*'  NAME 'r'  OP '^'  NUMBER '2'  EOF
    │  parse()                                               steps 2, 3, 5
    ▼
Assign("area", BinOp("*", Name("pi"), BinOp("^", Name("r"), Num(2))))
    │  evaluate(tree, env)                                   steps 4, 5
    ▼
19.634954084936208           env now also holds r and area
```

- `tokenize()` turns text into a flat list of `Token`s. Whitespace disappears here, and every token remembers its column.
- `parse()` turns the tokens into a tree of frozen dataclasses, one class per kind of node. The shape of the tree encodes precedence: in `1 + 2 * 3`, the `*` node is the right child of the `+` node.
- `evaluate()` walks the tree with `match`, reading and writing variables in an `env` dict.
- `evaluate_lines()` drives all three for every line of a session.

Errors travel as exceptions. Everything the calculator rejects raises a `CalcError` with a `pos` attribute. The tokenizer and the parser raise its `ParseError` subclass and the evaluator raises `EvalError`. That's the one-base-exception pattern from [Errors & Exceptions](lesson:exceptions#custom-exceptions): a caller can catch every calculator error with one `except`, or just one stage's.

| Step | You write | The Python it leans on |
| --- | --- | --- |
| 1 | `tokenize()` | named groups, `finditer`, `m.lastgroup` ([Strings](lesson:strings#named-groups-and-findall)) |
| 2 | the parser for `+ - * / %` and parentheses | `field()` options, loops for left associativity ([Dataclasses](lesson:dataclasses-and-enums#defaults-and-field)) |
| 3 | unary minus and `^` | recursion for right associativity |
| 4 | `evaluate()` | class patterns and guards, the `operator` module, `raise ... from None` ([Pattern Matching](lesson:pattern-matching#class-patterns)) |
| 5 | assignment | two-token lookahead, a mutable `env` dict |
| 6 | `evaluate_lines()` | `try`/`except`/`else`, copying a dict |

Every step's starter contains the reference solution of all the earlier steps, so you can start at any step. Each step's tests focus on the piece you add.

## Step 1: Tokens

A tokenizer (or lexer) walks the input once and chops it into the smallest meaningful pieces: `rate * (x + 2.5)` becomes `rate`, `*`, `(`, `x`, `+`, `2.5` and `)`. A single regular expression can do the whole job. Write an alternation with one **named group** per kind of token, and at each position the regex tries the alternatives from left to right. Each match then tells you which group won.

:::compare Which alternative matched?
```js
const re = /(?<NUMBER>\d+)|(?<WORD>[a-z]+)|(?<OTHER>\S)/g;

for (const m of "3 apples + 12 pears".matchAll(re)) {
  const kind = Object.keys(m.groups).find((k) => m.groups[k] !== undefined);
  console.log(kind, m[0], m.index);
}
```
```python
pattern = re.compile(r"(?P<NUMBER>\d+)|(?P<WORD>[a-z]+)|(?P<OTHER>\S)")

for m in pattern.finditer("3 apples + 12 pears"):
    kind = m.lastgroup
    print(kind, m[0], m.start())
```
:::

`m.lastgroup` is the name of the last group that matched. When each alternative is wrapped in its own named group, that's the alternative that won, so there's no hunting through the groups for the one that isn't `undefined`. `finditer` plays the role of `matchAll` without the `g` flag or a `lastIndex`, and `m.start()` replaces `m.index`.

Two details matter for a tokenizer. First, alternation is **ordered**: the regex takes the first alternative that matches, not the longest one (see the quiz below). Second, `finditer` **skips** any text that no alternative matches, without a word. Leave `OTHER` out of the pattern above and the `+` simply vanishes:

```python run
import re

words_and_numbers = re.compile(r"(?P<NUMBER>\d+)|(?P<WORD>[a-z]+)")
print([(m.lastgroup, m[0]) for m in words_and_numbers.finditer("3 apples + 12 pears")])

with_catch_all = re.compile(r"(?P<NUMBER>\d+)|(?P<WORD>[a-z]+)|(?P<OTHER>\S)")
print([(m.lastgroup, m[0]) for m in with_catch_all.finditer("3 apples + 12 pears")])
```

A tokenizer must never drop input, so the calculator's pattern ends with a catch-all, `(?P<ERROR>.)`, that turns anything unexpected into an error. `re.VERBOSE` keeps the full pattern readable: it ignores whitespace in the pattern and treats `#` as the start of a comment, so each kind of token gets its own commented line.

:::quiz output
What does this print?

```python
import re
m = re.match(r"(?P<NUM>\d+)|(?P<NAME>\w+)", "42abc")
print(m.lastgroup, m[0])
```

- [x] `NUM 42`
- [ ] `NAME 42abc`
- [ ] `NAME 42`

The first alternative that matches wins, even though `\w+` would have matched more. Alternation is ordered in JavaScript too. Put specific alternatives before general ones, and the catch-all last.
:::

Tokens are frozen dataclasses: `Token(kind, text, pos)`. A token is a value, so two tokens with the same fields are equal (handy in tests), and freezing it means no later stage can change another stage's data ([Frozen dataclasses](lesson:dataclasses-and-enums#frozen-dataclasses)). The list always ends with a sentinel, `Token("EOF", "", len(source))`. The parser can then always ask for "the next token" without bounds checks, and an error at the very end of the input still has a column to point at.

:::note Digits, not `\d`
The reference solution spells digits `[0-9]`. In Python, `\d` also matches digits from other scripts, such as `٣`, and `float()` happily accepts them. JavaScript's `\d` is ASCII-only. See [the `\d` gotcha](lesson:strings#flags).
:::

:::challenge id=calc-step-1 title="Step 1: Tokenize the input" difficulty=easy
Fill in `TOKEN_RE` and write `tokenize(source)`, which returns a list of `Token`s:

- `NUMBER` for integers and decimals: `42`, `3.14`, `2.` and `.5`.
- `NAME` for identifiers: letters, digits and underscores, not starting with a digit.
- `OP` for each of `+ - * / % ^ ( ) =`, one token per character.
- Whitespace produces no tokens.
- The list always ends with `Token("EOF", "", len(source))`.
- `pos` is the token's 0-based column in `source`.

Any other character raises `ParseError` (provided, along with `CalcError` and `Token`) with the character in the message and its column as `pos`.

```text
>>> tokenize("rate * (x + 2.5)")
[Token(kind='NAME', text='rate', pos=0), Token(kind='OP', text='*', pos=5),
 Token(kind='OP', text='(', pos=7), Token(kind='NAME', text='x', pos=8),
 Token(kind='OP', text='+', pos=10), Token(kind='NUMBER', text='2.5', pos=12),
 Token(kind='OP', text=')', pos=15), Token(kind='EOF', text='', pos=16)]
```

```js
// The JavaScript version, with matchAll and named groups
function tokenize(source) {
  const tokens = [];
  for (const m of source.matchAll(TOKEN_RE)) {
    const kind = Object.keys(m.groups).find((k) => m.groups[k] !== undefined);
    if (kind === "SPACE") continue;
    if (kind === "ERROR") throw new ParseError(`unexpected character '${m[0]}'`, m.index);
    tokens.push({ kind, text: m[0], pos: m.index });
  }
  tokens.push({ kind: "EOF", text: "", pos: source.length });
  return tokens;
}
```

```python starter
import re
from dataclasses import dataclass


class CalcError(Exception):
    """Base class for everything the calculator rejects."""

    def __init__(self, message: str, pos: int):
        super().__init__(message)
        self.pos = pos  # 0-based column of the offending input


class ParseError(CalcError):
    """The input isn't a valid expression."""


@dataclass(frozen=True)
class Token:
    kind: str  # "NUMBER", "NAME", "OP" or "EOF"
    text: str
    pos: int


TOKEN_RE = re.compile(r"""
    (?P<NUMBER> ... )   # 42, 3.14, .5
  | (?P<NAME>   ... )   # x, rate, total_2
  | (?P<OP>     ... )   # one of + - * / % ^ ( ) =
  | (?P<SPACE>  ... )   # skipped
  | (?P<ERROR>  ... )   # any other single character
""", re.VERBOSE)


def tokenize(source: str) -> list[Token]:
    """Split source into tokens, ending with an EOF token."""
    ...
```

```python solution
import re
from dataclasses import dataclass


class CalcError(Exception):
    """Base class for everything the calculator rejects."""

    def __init__(self, message: str, pos: int):
        super().__init__(message)
        self.pos = pos  # 0-based column of the offending input


class ParseError(CalcError):
    """The input isn't a valid expression."""


@dataclass(frozen=True)
class Token:
    kind: str  # "NUMBER", "NAME", "OP" or "EOF"
    text: str
    pos: int


TOKEN_RE = re.compile(r"""
    (?P<NUMBER> [0-9]+ (?:\.[0-9]*)? | \.[0-9]+ )
  | (?P<NAME>   [A-Za-z_][A-Za-z0-9_]* )
  | (?P<OP>     [-+*/%^()=] )
  | (?P<SPACE>  \s+ )
  | (?P<ERROR>  . )
""", re.VERBOSE)


def tokenize(source: str) -> list[Token]:
    """Split source into tokens, ending with an EOF token."""
    tokens = []
    for m in TOKEN_RE.finditer(source):
        kind = m.lastgroup
        if kind == "SPACE":
            continue
        if kind == "ERROR":
            raise ParseError(f"unexpected character {m[0]!r}", m.start())
        tokens.append(Token(kind, m[0], m.start()))
    tokens.append(Token("EOF", "", len(source)))
    return tokens
```

```python tests
@test("splits names, operators and numbers")
def _():
    eq(tokenize("rate * (x + 2.5)"), [
        Token("NAME", "rate", 0), Token("OP", "*", 5), Token("OP", "(", 7),
        Token("NAME", "x", 8), Token("OP", "+", 10), Token("NUMBER", "2.5", 12),
        Token("OP", ")", 15), Token("EOF", "", 16),
    ])

@test("doesn't need spaces")
def _():
    eq([t.text for t in tokenize("2*(3+4)^2")], ["2", "*", "(", "3", "+", "4", ")", "^", "2", ""])

@test("every operator is its own OP token")
def _():
    eq([(t.kind, t.text) for t in tokenize("+-*/%^()=")][:-1], [("OP", c) for c in "+-*/%^()="])

@test("integers and decimals are single NUMBER tokens")
def _():
    for text in ["7", "42", "3.14", "2.", ".5"]:
        eq(tokenize(text), [Token("NUMBER", text, 0), Token("EOF", "", len(text))], f"tokenizing {text!r}")

@test("names can hold digits and underscores, but don't start with a digit")
def _():
    eq([(t.kind, t.text) for t in tokenize("total_2 2x")][:-1],
       [("NAME", "total_2"), ("NUMBER", "2"), ("NAME", "x")])

@test("positions are columns in the original string")
def _():
    eq([t.pos for t in tokenize("  12 *   x ")], [2, 5, 9, 11])

@test("empty input is just EOF")
def _():
    eq(tokenize(""), [Token("EOF", "", 0)])
    eq(tokenize("   "), [Token("EOF", "", 3)])

@test("an unexpected character raises ParseError at its column")
def _():
    err = raises(ParseError, tokenize, "2 $ 3")
    eq(err.pos, 2)
    check("'$'" in str(err), f"quote the character in the message, got {str(err)!r}")
```

```hint
Each `...` in the starter's pattern becomes one alternative: digits with an optional fraction for `NUMBER`, a character class of operators for `OP`, `\s+` for `SPACE`, and a single `.` for `ERROR`. Keep `ERROR` last.
```

```hint
Loop with `for m in TOKEN_RE.finditer(source):`. `m.lastgroup` is the kind, `m[0]` the text and `m.start()` the column. Skip `SPACE`, raise on `ERROR`, and append the EOF token after the loop.
```

```hint
A number pattern that accepts `42`, `3.14`, `2.` and `.5`: `[0-9]+ (?:\.[0-9]*)? | \.[0-9]+`. The spaces are fine under `re.VERBOSE`.
```
:::

## Step 2: A parser with precedence

A recursive-descent parser has one method per precedence level, and each method gets its operands by calling the method one level tighter. The call chain itself encodes precedence. Here's the grammar for this step, loosest level first:

```text
expression := term (("+" | "-") term)*
term       := atom (("*" | "/" | "%") atom)*
atom       := NUMBER | NAME | "(" expression ")"
```

Read `*` as "repeated zero or more times", as in a regex. `expression` parses a `term`, then keeps folding `+ term` or `- term` onto the tree it has so far. That loop is what makes `8 - 3 - 2` mean `(8 - 3) - 2`: each new operator becomes the root, with everything parsed so far as its left child. Precedence falls out of the calls. `term` never consumes a `+`, so `1 + 2 * 3` can only group as `1 + (2 * 3)`. Parentheses work because `atom` calls back up to `expression`.

The tree's nodes are frozen dataclasses, `Num`, `Name` and `BinOp` for now. `type Node = Num | Name | BinOp` (3.12+) names the union for annotations, and it gains a member in steps 3 and 5. Every node records the column it came from, because the evaluator will need it for error messages. Positions would make trees awkward to compare in tests, though, which is a problem JavaScript test suites know well:

:::compare Comparing trees, positions aside
```js
// ESTree-style nodes carry start/end, so tests match a subset
expect(parse("1 + 2")).toMatchObject({
  type: "BinOp", op: "+",
  left: { type: "Num", value: 1 },
  right: { type: "Num", value: 2 },
});
```
```python
# == compares fields, and pos has opted out of the comparison
assert parse("1 + 2") == BinOp("+", Num(1), Num(2))
```
:::

`pos` is declared with `field(default=0, kw_only=True, compare=False, repr=False)`. It's set by keyword (`Num(2, pos=4)`), ignored by `==` and the generated hash, and left out of the repr. The starter's `position()` helper just saves writing that out on every node class.

```python run
from dataclasses import dataclass, field

def position():
    return field(default=0, kw_only=True, compare=False, repr=False)

@dataclass(frozen=True)
class Num:
    value: int | float
    pos: int = position()

a, b = Num(42, pos=0), Num(42, pos=17)
print(a, a == b, (a.pos, b.pos))
print(Num.__match_args__)      # keyword-only fields aren't positional, even in match
print(len({a, b}))             # frozen, so hashable, and equal: one set member
```

The starter also provides the parser's plumbing. `peek(ahead=0)` looks at a token without consuming it, `advance()` consumes one and returns it, and `expect(text)` consumes a token with that exact text or raises `ParseError`. The token list ends with EOF, and `peek()` keeps returning EOF past the end, so no method needs a bounds check.

:::gotcha `in "+-"` is a substring test
`self.peek().text in "+-"` looks like a membership test, but `in` on a string checks for a *substring*, and the empty string is a substring of every string. The EOF token's text is `""`, so the loop would treat the end of the input as an operator. Test membership against a tuple instead: `in ("+", "-")`. (JavaScript's `"+-".includes("")` is `true` as well.)
:::

:::quiz output
What does this print?

```python
print("" in "+-", "" in ("+", "-"))
```

- [ ] `False False`
- [x] `True False`
- [ ] `True True`

On a string, `in` looks for a substring, and `""` occurs in every string. On a tuple, it compares elements with `==`.
:::

:::challenge id=calc-step-2 title="Step 2: Parse with precedence" difficulty=medium
Write the four `Parser` methods in the starter. The node classes, the `peek`/`advance`/`expect` plumbing and the module-level `parse(source)` are provided.

- `atom()`: a `NUMBER` becomes `Num`, with an `int` value for integer literals and a `float` for literals with a `.`. A `NAME` becomes `Name`. A `(` parses a whole expression, then expects `)`.
- `term()` and `expression()` follow the grammar above. Operators of equal precedence group from left to right.
- `parse()` parses an expression and then checks that only EOF is left.
- Every node gets its token's column as `pos`. For a `BinOp`, that's the operator's column.
- Anything unexpected raises `ParseError` at the offending token's column. Use `describe(token)` to name it in the message.

```text
>>> parse("8 - 3 * x")
BinOp(op='-', left=Num(value=8), right=BinOp(op='*', left=Num(value=3), right=Name(id='x')))
>>> parse("(1 + 2")
ParseError: expected ')', found end of input     # with pos == 6
```

```python starter
import re
from dataclasses import dataclass, field


class CalcError(Exception):
    """Base class for everything the calculator rejects."""

    def __init__(self, message: str, pos: int):
        super().__init__(message)
        self.pos = pos  # 0-based column of the offending input


class ParseError(CalcError):
    """The input isn't a valid expression."""


@dataclass(frozen=True)
class Token:
    kind: str  # "NUMBER", "NAME", "OP" or "EOF"
    text: str
    pos: int


TOKEN_RE = re.compile(r"""
    (?P<NUMBER> [0-9]+ (?:\.[0-9]*)? | \.[0-9]+ )
  | (?P<NAME>   [A-Za-z_][A-Za-z0-9_]* )
  | (?P<OP>     [-+*/%^()=] )
  | (?P<SPACE>  \s+ )
  | (?P<ERROR>  . )
""", re.VERBOSE)


def tokenize(source: str) -> list[Token]:
    """Split source into tokens, ending with an EOF token."""
    tokens = []
    for m in TOKEN_RE.finditer(source):
        kind = m.lastgroup
        if kind == "SPACE":
            continue
        if kind == "ERROR":
            raise ParseError(f"unexpected character {m[0]!r}", m.start())
        tokens.append(Token(kind, m[0], m.start()))
    tokens.append(Token("EOF", "", len(source)))
    return tokens


def position():
    """A `pos` field: keyword-only, and ignored by == and repr()."""
    return field(default=0, kw_only=True, compare=False, repr=False)


type Node = Num | Name | BinOp


@dataclass(frozen=True)
class Num:
    value: int | float
    pos: int = position()


@dataclass(frozen=True)
class Name:
    id: str
    pos: int = position()


@dataclass(frozen=True)
class BinOp:
    op: str
    left: Node
    right: Node
    pos: int = position()


def describe(token: Token) -> str:
    """How a token reads in an error message."""
    return "end of input" if token.kind == "EOF" else repr(token.text)


class Parser:
    def __init__(self, tokens: list[Token]):
        self.tokens = tokens
        self.i = 0

    def peek(self, ahead: int = 0) -> Token:
        """Look at a token without consuming it. Past the end, EOF repeats."""
        return self.tokens[min(self.i + ahead, len(self.tokens) - 1)]

    def advance(self) -> Token:
        """Consume the current token and return it."""
        token = self.peek()
        self.i += 1
        return token

    def expect(self, text: str) -> Token:
        """Consume a token with exactly this text, or raise ParseError."""
        token = self.peek()
        if token.text != text:
            raise ParseError(f"expected {text!r}, found {describe(token)}", token.pos)
        return self.advance()

    def parse(self) -> Node:
        """Parse all the tokens. Anything left over is an error."""
        ...

    def expression(self) -> Node:
        """expression := term (("+" | "-") term)*"""
        ...

    def term(self) -> Node:
        """term := atom (("*" | "/" | "%") atom)*"""
        ...

    def atom(self) -> Node:
        """atom := NUMBER | NAME | "(" expression ")" """
        ...


def parse(source: str) -> Node:
    """Parse one line of calculator input into an AST."""
    return Parser(tokenize(source)).parse()
```

```python solution
import re
from dataclasses import dataclass, field


class CalcError(Exception):
    """Base class for everything the calculator rejects."""

    def __init__(self, message: str, pos: int):
        super().__init__(message)
        self.pos = pos  # 0-based column of the offending input


class ParseError(CalcError):
    """The input isn't a valid expression."""


@dataclass(frozen=True)
class Token:
    kind: str  # "NUMBER", "NAME", "OP" or "EOF"
    text: str
    pos: int


TOKEN_RE = re.compile(r"""
    (?P<NUMBER> [0-9]+ (?:\.[0-9]*)? | \.[0-9]+ )
  | (?P<NAME>   [A-Za-z_][A-Za-z0-9_]* )
  | (?P<OP>     [-+*/%^()=] )
  | (?P<SPACE>  \s+ )
  | (?P<ERROR>  . )
""", re.VERBOSE)


def tokenize(source: str) -> list[Token]:
    """Split source into tokens, ending with an EOF token."""
    tokens = []
    for m in TOKEN_RE.finditer(source):
        kind = m.lastgroup
        if kind == "SPACE":
            continue
        if kind == "ERROR":
            raise ParseError(f"unexpected character {m[0]!r}", m.start())
        tokens.append(Token(kind, m[0], m.start()))
    tokens.append(Token("EOF", "", len(source)))
    return tokens


def position():
    """A `pos` field: keyword-only, and ignored by == and repr()."""
    return field(default=0, kw_only=True, compare=False, repr=False)


type Node = Num | Name | BinOp


@dataclass(frozen=True)
class Num:
    value: int | float
    pos: int = position()


@dataclass(frozen=True)
class Name:
    id: str
    pos: int = position()


@dataclass(frozen=True)
class BinOp:
    op: str
    left: Node
    right: Node
    pos: int = position()


def describe(token: Token) -> str:
    """How a token reads in an error message."""
    return "end of input" if token.kind == "EOF" else repr(token.text)


class Parser:
    def __init__(self, tokens: list[Token]):
        self.tokens = tokens
        self.i = 0

    def peek(self, ahead: int = 0) -> Token:
        """Look at a token without consuming it. Past the end, EOF repeats."""
        return self.tokens[min(self.i + ahead, len(self.tokens) - 1)]

    def advance(self) -> Token:
        """Consume the current token and return it."""
        token = self.peek()
        self.i += 1
        return token

    def expect(self, text: str) -> Token:
        """Consume a token with exactly this text, or raise ParseError."""
        token = self.peek()
        if token.text != text:
            raise ParseError(f"expected {text!r}, found {describe(token)}", token.pos)
        return self.advance()

    def parse(self) -> Node:
        """Parse all the tokens. Anything left over is an error."""
        node = self.expression()
        token = self.peek()
        if token.kind != "EOF":
            raise ParseError(f"unexpected {describe(token)}", token.pos)
        return node

    def expression(self) -> Node:
        """expression := term (("+" | "-") term)*"""
        node = self.term()
        while self.peek().text in ("+", "-"):
            op = self.advance()
            node = BinOp(op.text, node, self.term(), pos=op.pos)
        return node

    def term(self) -> Node:
        """term := atom (("*" | "/" | "%") atom)*"""
        node = self.atom()
        while self.peek().text in ("*", "/", "%"):
            op = self.advance()
            node = BinOp(op.text, node, self.atom(), pos=op.pos)
        return node

    def atom(self) -> Node:
        """atom := NUMBER | NAME | "(" expression ")" """
        token = self.advance()
        if token.kind == "NUMBER":
            value = float(token.text) if "." in token.text else int(token.text)
            return Num(value, pos=token.pos)
        if token.kind == "NAME":
            return Name(token.text, pos=token.pos)
        if token.text == "(":
            node = self.expression()
            self.expect(")")
            return node
        raise ParseError(f"unexpected {describe(token)}", token.pos)


def parse(source: str) -> Node:
    """Parse one line of calculator input into an AST."""
    return Parser(tokenize(source)).parse()
```

```python tests
@test("numbers and names")
def _():
    eq(parse("42"), Num(42))
    eq(parse("2.5"), Num(2.5))
    eq(parse("rate"), Name("rate"))

@test("integer literals stay ints")
def _():
    check(type(parse("42").value) is int, "42 should become the int 42, not 42.0")
    check(type(parse("4.0").value) is float, "4.0 should become a float")

@test("* / and % bind tighter than + and -")
def _():
    eq(parse("1 + 2 * 3"), BinOp("+", Num(1), BinOp("*", Num(2), Num(3))))
    eq(parse("1 * 2 - 3 % 4"), BinOp("-", BinOp("*", Num(1), Num(2)), BinOp("%", Num(3), Num(4))))

@test("equal precedence groups left to right")
def _():
    eq(parse("8 - 3 - 2"), BinOp("-", BinOp("-", Num(8), Num(3)), Num(2)))
    eq(parse("8 / 4 * 2"), BinOp("*", BinOp("/", Num(8), Num(4)), Num(2)))

@test("parentheses override precedence")
def _():
    eq(parse("(1 + 2) * 3"), BinOp("*", BinOp("+", Num(1), Num(2)), Num(3)))
    eq(parse("((x))"), Name("x"))

@test("nodes record their columns")
def _():
    tree = parse("a + b * c")
    eq((tree.pos, tree.left.pos, tree.right.pos, tree.right.right.pos), (2, 0, 6, 8))

@test("syntax errors raise ParseError at the offending token")
def _():
    for source, pos in [("1 +", 3), ("1 + * 2", 4), ("(1 + 2", 6), ("1 2", 2), ("", 0), (")", 0)]:
        eq(raises(ParseError, parse, source).pos, pos, f"position for {source!r}")

@test("a missing ) says what was expected")
def _():
    err = raises(ParseError, parse, "(1 + 2")
    check("')'" in str(err), f"mention the missing ')', got {str(err)!r}")
```

```hint
Start with `atom()`: `advance()` one token and decide by its `kind`, or by its `text` for `(`. In the `(` case, parse `self.expression()` and then call `self.expect(")")`. Anything else is an error: `raise ParseError(f"unexpected {describe(token)}", token.pos)`.
```

```hint
`term()` and `expression()` have the same shape: parse one operand, then `while self.peek().text in (...)`, consume the operator, parse the next operand and fold: `node = BinOp(op.text, node, right, pos=op.pos)`.
```

```hint
`parse()` is `node = self.expression()`, then a check that `self.peek().kind == "EOF"`. If it isn't, that leftover token is the error.
```
:::

## Step 3: Unary minus and powers

Two new precedence levels slot in between `term` and `atom`:

```text
term  := unary (("*" | "/" | "%") unary)*
unary := ("-" | "+") unary | power
power := atom ("^" unary)?
```

`unary` handles any number of signs by calling itself, so `--1` is a minus applied to `-1`. `power` is the interesting one. Exponentiation groups to the **right**: `2 ^ 3 ^ 2` is `2 ^ 9`, not `8 ^ 2`. So instead of a loop, `power` parses its exponent by recursing: after a `^` it calls `unary()`, which reaches `power()` again, which takes the next `^`. Because the exponent is a `unary`, `2 ^ -1` works too. And because `power` sits *below* `unary`, `-2 ^ 2` means `-(2 ^ 2)`, the convention of both mathematics and Python. JavaScript refuses to choose:

:::compare Unary minus meets exponentiation
```js
-2 ** 2;       // SyntaxError: parenthesize the unary minus
(-2) ** 2;     // 4
-(2 ** 2);     // -4
2 ** 3 ** 2;   // 512: right-associative
2 ** -1;       // 0.5
```
```python
-2 ** 2        # -4: ** binds tighter than unary minus
(-2) ** 2      # 4
-(2 ** 2)      # -4
2 ** 3 ** 2    # 512: right-associative
2 ** -1        # 0.5
```
:::

Python's own parser builds the same shapes you're about to build, and the `ast` module shows them to you:

```python run
import ast

for source in ["-2 ** 2", "2 ** 3 ** 2", "2 ** -1"]:
    print(f"{source:12} {ast.dump(ast.parse(source, mode='eval').body)}")
```

:::quiz output
What does this print?

```python
print(-3 ** 2)
```

- [ ] `9`
- [x] `-9`
- [ ] `SyntaxError`

`**` binds tighter than the unary minus on its left, so this is `-(3 ** 2)`. JavaScript makes the same expression a `SyntaxError` to force you to say which one you meant.
:::

:::deep How deep can the nesting go?
Every pair of parentheses costs five nested calls (`expression`, `term`, `unary`, `power`, `atom`), and Python's default recursion limit is 1000 frames, so roughly 200 levels of nesting raise `RecursionError`. Production parsers set an explicit limit instead: CPython's tokenizer refuses more than 200 nested parentheses with `SyntaxError: too many nested parentheses`.
:::

:::challenge id=calc-step-3 title="Step 3: Unary minus and powers" difficulty=medium
Add `unary()` and `power()` to the parser, and make `term()` use `unary()` for its operands, so that:

- `-x` and `+x` parse to `UnaryOp` nodes (provided). Signs can repeat: `--1`.
- `^` binds tighter than `*` and than a unary minus, and groups from right to left.
- An exponent can carry a sign: `2 ^ -1`.
- New nodes get the column of their operator as `pos`.

```text
>>> parse("-2 ^ 2")
UnaryOp(op='-', operand=BinOp(op='^', left=Num(value=2), right=Num(value=2)))
>>> parse("2 ^ 3 ^ 2")
BinOp(op='^', left=Num(value=2), right=BinOp(op='^', left=Num(value=3), right=Num(value=2)))
```

```python starter
import re
from dataclasses import dataclass, field


class CalcError(Exception):
    """Base class for everything the calculator rejects."""

    def __init__(self, message: str, pos: int):
        super().__init__(message)
        self.pos = pos  # 0-based column of the offending input


class ParseError(CalcError):
    """The input isn't a valid expression."""


@dataclass(frozen=True)
class Token:
    kind: str  # "NUMBER", "NAME", "OP" or "EOF"
    text: str
    pos: int


TOKEN_RE = re.compile(r"""
    (?P<NUMBER> [0-9]+ (?:\.[0-9]*)? | \.[0-9]+ )
  | (?P<NAME>   [A-Za-z_][A-Za-z0-9_]* )
  | (?P<OP>     [-+*/%^()=] )
  | (?P<SPACE>  \s+ )
  | (?P<ERROR>  . )
""", re.VERBOSE)


def tokenize(source: str) -> list[Token]:
    """Split source into tokens, ending with an EOF token."""
    tokens = []
    for m in TOKEN_RE.finditer(source):
        kind = m.lastgroup
        if kind == "SPACE":
            continue
        if kind == "ERROR":
            raise ParseError(f"unexpected character {m[0]!r}", m.start())
        tokens.append(Token(kind, m[0], m.start()))
    tokens.append(Token("EOF", "", len(source)))
    return tokens


def position():
    """A `pos` field: keyword-only, and ignored by == and repr()."""
    return field(default=0, kw_only=True, compare=False, repr=False)


type Node = Num | Name | UnaryOp | BinOp


@dataclass(frozen=True)
class Num:
    value: int | float
    pos: int = position()


@dataclass(frozen=True)
class Name:
    id: str
    pos: int = position()


@dataclass(frozen=True)
class UnaryOp:
    op: str
    operand: Node
    pos: int = position()


@dataclass(frozen=True)
class BinOp:
    op: str
    left: Node
    right: Node
    pos: int = position()


def describe(token: Token) -> str:
    """How a token reads in an error message."""
    return "end of input" if token.kind == "EOF" else repr(token.text)


class Parser:
    def __init__(self, tokens: list[Token]):
        self.tokens = tokens
        self.i = 0

    def peek(self, ahead: int = 0) -> Token:
        """Look at a token without consuming it. Past the end, EOF repeats."""
        return self.tokens[min(self.i + ahead, len(self.tokens) - 1)]

    def advance(self) -> Token:
        """Consume the current token and return it."""
        token = self.peek()
        self.i += 1
        return token

    def expect(self, text: str) -> Token:
        """Consume a token with exactly this text, or raise ParseError."""
        token = self.peek()
        if token.text != text:
            raise ParseError(f"expected {text!r}, found {describe(token)}", token.pos)
        return self.advance()

    def parse(self) -> Node:
        """Parse all the tokens. Anything left over is an error."""
        node = self.expression()
        token = self.peek()
        if token.kind != "EOF":
            raise ParseError(f"unexpected {describe(token)}", token.pos)
        return node

    def expression(self) -> Node:
        """expression := term (("+" | "-") term)*"""
        node = self.term()
        while self.peek().text in ("+", "-"):
            op = self.advance()
            node = BinOp(op.text, node, self.term(), pos=op.pos)
        return node

    def term(self) -> Node:
        """term := atom (("*" | "/" | "%") atom)*"""
        # TODO (step 3): the operands are unary() now, not atom()
        node = self.atom()
        while self.peek().text in ("*", "/", "%"):
            op = self.advance()
            node = BinOp(op.text, node, self.atom(), pos=op.pos)
        return node

    def unary(self) -> Node:
        """unary := ("-" | "+") unary | power"""
        ...

    def power(self) -> Node:
        """power := atom ("^" unary)?"""
        ...

    def atom(self) -> Node:
        """atom := NUMBER | NAME | "(" expression ")" """
        token = self.advance()
        if token.kind == "NUMBER":
            value = float(token.text) if "." in token.text else int(token.text)
            return Num(value, pos=token.pos)
        if token.kind == "NAME":
            return Name(token.text, pos=token.pos)
        if token.text == "(":
            node = self.expression()
            self.expect(")")
            return node
        raise ParseError(f"unexpected {describe(token)}", token.pos)


def parse(source: str) -> Node:
    """Parse one line of calculator input into an AST."""
    return Parser(tokenize(source)).parse()
```

```python solution
import re
from dataclasses import dataclass, field


class CalcError(Exception):
    """Base class for everything the calculator rejects."""

    def __init__(self, message: str, pos: int):
        super().__init__(message)
        self.pos = pos  # 0-based column of the offending input


class ParseError(CalcError):
    """The input isn't a valid expression."""


@dataclass(frozen=True)
class Token:
    kind: str  # "NUMBER", "NAME", "OP" or "EOF"
    text: str
    pos: int


TOKEN_RE = re.compile(r"""
    (?P<NUMBER> [0-9]+ (?:\.[0-9]*)? | \.[0-9]+ )
  | (?P<NAME>   [A-Za-z_][A-Za-z0-9_]* )
  | (?P<OP>     [-+*/%^()=] )
  | (?P<SPACE>  \s+ )
  | (?P<ERROR>  . )
""", re.VERBOSE)


def tokenize(source: str) -> list[Token]:
    """Split source into tokens, ending with an EOF token."""
    tokens = []
    for m in TOKEN_RE.finditer(source):
        kind = m.lastgroup
        if kind == "SPACE":
            continue
        if kind == "ERROR":
            raise ParseError(f"unexpected character {m[0]!r}", m.start())
        tokens.append(Token(kind, m[0], m.start()))
    tokens.append(Token("EOF", "", len(source)))
    return tokens


def position():
    """A `pos` field: keyword-only, and ignored by == and repr()."""
    return field(default=0, kw_only=True, compare=False, repr=False)


type Node = Num | Name | UnaryOp | BinOp


@dataclass(frozen=True)
class Num:
    value: int | float
    pos: int = position()


@dataclass(frozen=True)
class Name:
    id: str
    pos: int = position()


@dataclass(frozen=True)
class UnaryOp:
    op: str
    operand: Node
    pos: int = position()


@dataclass(frozen=True)
class BinOp:
    op: str
    left: Node
    right: Node
    pos: int = position()


def describe(token: Token) -> str:
    """How a token reads in an error message."""
    return "end of input" if token.kind == "EOF" else repr(token.text)


class Parser:
    def __init__(self, tokens: list[Token]):
        self.tokens = tokens
        self.i = 0

    def peek(self, ahead: int = 0) -> Token:
        """Look at a token without consuming it. Past the end, EOF repeats."""
        return self.tokens[min(self.i + ahead, len(self.tokens) - 1)]

    def advance(self) -> Token:
        """Consume the current token and return it."""
        token = self.peek()
        self.i += 1
        return token

    def expect(self, text: str) -> Token:
        """Consume a token with exactly this text, or raise ParseError."""
        token = self.peek()
        if token.text != text:
            raise ParseError(f"expected {text!r}, found {describe(token)}", token.pos)
        return self.advance()

    def parse(self) -> Node:
        """Parse all the tokens. Anything left over is an error."""
        node = self.expression()
        token = self.peek()
        if token.kind != "EOF":
            raise ParseError(f"unexpected {describe(token)}", token.pos)
        return node

    def expression(self) -> Node:
        """expression := term (("+" | "-") term)*"""
        node = self.term()
        while self.peek().text in ("+", "-"):
            op = self.advance()
            node = BinOp(op.text, node, self.term(), pos=op.pos)
        return node

    def term(self) -> Node:
        """term := unary (("*" | "/" | "%") unary)*"""
        node = self.unary()
        while self.peek().text in ("*", "/", "%"):
            op = self.advance()
            node = BinOp(op.text, node, self.unary(), pos=op.pos)
        return node

    def unary(self) -> Node:
        """unary := ("-" | "+") unary | power"""
        if self.peek().text in ("-", "+"):
            op = self.advance()
            return UnaryOp(op.text, self.unary(), pos=op.pos)
        return self.power()

    def power(self) -> Node:
        """power := atom ("^" unary)?"""
        base = self.atom()
        if self.peek().text == "^":
            op = self.advance()
            return BinOp("^", base, self.unary(), pos=op.pos)
        return base

    def atom(self) -> Node:
        """atom := NUMBER | NAME | "(" expression ")" """
        token = self.advance()
        if token.kind == "NUMBER":
            value = float(token.text) if "." in token.text else int(token.text)
            return Num(value, pos=token.pos)
        if token.kind == "NAME":
            return Name(token.text, pos=token.pos)
        if token.text == "(":
            node = self.expression()
            self.expect(")")
            return node
        raise ParseError(f"unexpected {describe(token)}", token.pos)


def parse(source: str) -> Node:
    """Parse one line of calculator input into an AST."""
    return Parser(tokenize(source)).parse()
```

```python tests
@test("unary minus and plus")
def _():
    eq(parse("-x"), UnaryOp("-", Name("x")))
    eq(parse("+3"), UnaryOp("+", Num(3)))
    eq(parse("--1"), UnaryOp("-", UnaryOp("-", Num(1))))

@test("unary minus binds tighter than * and +")
def _():
    eq(parse("-2 * 3"), BinOp("*", UnaryOp("-", Num(2)), Num(3)))
    eq(parse("1 - -2"), BinOp("-", Num(1), UnaryOp("-", Num(2))))

@test("^ binds tighter than * and unary minus")
def _():
    eq(parse("2 * 3 ^ 2"), BinOp("*", Num(2), BinOp("^", Num(3), Num(2))))
    eq(parse("-2 ^ 2"), UnaryOp("-", BinOp("^", Num(2), Num(2))))

@test("^ groups right to left")
def _():
    eq(parse("2 ^ 3 ^ 2"), BinOp("^", Num(2), BinOp("^", Num(3), Num(2))))

@test("an exponent can be negative")
def _():
    eq(parse("2 ^ -1"), BinOp("^", Num(2), UnaryOp("-", Num(1))))

@test("parentheses still group")
def _():
    eq(parse("(-2) ^ 2"), BinOp("^", UnaryOp("-", Num(2)), Num(2)))

@test("new nodes record their operator's column")
def _():
    eq(parse(" -1").pos, 1)
    eq(parse("2 ^ 3").pos, 2)

@test("dangling operators are still ParseErrors")
def _():
    for source, pos in [("-", 1), ("2 ^", 3), ("2 ^ * 3", 4)]:
        eq(raises(ParseError, parse, source).pos, pos, f"position for {source!r}")
```

```hint
`unary()`: if `self.peek().text` is `-` or `+`, consume it and return `UnaryOp(op.text, self.unary(), pos=op.pos)`. Otherwise return `self.power()`.
```

```hint
`power()`: parse `base = self.atom()`. If a `^` follows, consume it and parse the exponent with `self.unary()`, not `self.atom()`. That one call gives you both `2 ^ -1` and right associativity.
```

```hint
Don't forget `term()`: both of its operand calls change from `self.atom()` to `self.unary()`.
```
:::

## Step 4: Evaluating the tree

Evaluation is a recursive walk: a number is itself, a name is a lookup, and an operator evaluates its children and combines the results. JavaScript would `switch (node.type)`. Python uses `match` with class patterns, which check a node's class and unpack its fields in one step. [Pattern Matching](lesson:pattern-matching#nested-patterns-an-expression-evaluator) builds a small version of this evaluator; this one adds the error handling a real one needs.

Three features carry most of the weight:

- **Class patterns.** `case BinOp(op, left, right):` matches any `BinOp` and binds its fields by position, through the `__match_args__` that `@dataclass` generates. `pos` is keyword-only, so it isn't in that tuple, and it's still there as `node.pos` when you need it.
- **Guards.** `case Name(name) if name in env:` matches only when the condition holds. A plain `case Name(name):` underneath it catches the unknown variables.
- **A dispatch table.** `OPERATORS` (provided) maps each operator to a function from the `operator` module, where `operator.add(a, b)` is `a + b`, so a single `case` handles all six binary operators ([The `operator` module](lesson:decorators#the-operator-module)).

The calculator inherits Python's arithmetic, including the places where it disagrees with JavaScript:

:::compare Edge cases of arithmetic
```js
1 / 0;          // Infinity
10 ** 400;      // Infinity
(-8) ** 0.5;    // NaN
2 ** 100;       // 1.2676506002282294e+30, a float
-7 % 3;         // -1
```
```python
1 / 0           # ZeroDivisionError
10.0 ** 400     # OverflowError (the int 10 ** 400 is exact)
(-8) ** 0.5     # a complex number, roughly 2.828j
2 ** 100        # 1267650600228229401496703205376, exactly
-7 % 3          # 2
```
:::

Where JavaScript returns `Infinity` or `NaN`, Python raises, or hands you a `complex`. The evaluator turns each of these into an `EvalError` that points at the operator. Catch the specific built-in exception, then `raise EvalError(...) from None`. `from None` drops the original exception from the traceback, because how the calculator computes a power is its own business ([Re-raising and chaining](lesson:exceptions#re-raising-and-chaining)).

```python run
import operator

OPERATORS = {"/": operator.truediv, "^": operator.pow}

for a, op, b in [(7, "/", 2), (2, "^", 100), (1, "/", 0), (10.0, "^", 400), (-8, "^", 0.5)]:
    try:
        print(f"{a} {op} {b} = {OPERATORS[op](a, b)!r}")
    except (ZeroDivisionError, OverflowError) as err:
        print(f"{a} {op} {b} raises {type(err).__name__}")
```

:::quiz output
What does this print?

```python
print(type((-8) ** (1 / 3)).__name__)
```

- [ ] `float`
- [x] `complex`
- [ ] `ValueError`

A negative number raised to a fractional power has no real result, so Python returns the principal complex root. JavaScript returns `NaN`, and `math.pow(-8, 1 / 3)` raises `ValueError`. The calculator checks for a `complex` result and reports an error instead.
:::

:::challenge id=calc-step-4 title="Step 4: Evaluate with match" difficulty=medium
Write `evaluate(node, env)`, which returns the value of a tree. `env` is a dict of variable values. Use `match`:

- `Num` evaluates to its value, and `Name` to `env[name]`. An unknown name raises `EvalError` (provided) with the quoted name in the message, at the name's column.
- `UnaryOp` negates its operand, or leaves it alone for `+`.
- `BinOp` evaluates both sides and applies `OPERATORS[op]`. A `ZeroDivisionError` becomes `EvalError("division by zero", ...)`, an `OverflowError` becomes `EvalError("number too large", ...)`, and a `complex` result raises `EvalError("result is a complex number", ...)`, all at the operator's column.
- Python's own exceptions must not escape for those cases.

```text
>>> evaluate(parse("price * (1 + rate)"), {"price": 50, "rate": 0.2})
60.0
>>> evaluate(parse("1 / (2 - 2)"), {})
EvalError: division by zero     # with pos == 2
```

```python starter
import operator
import re
from dataclasses import dataclass, field


class CalcError(Exception):
    """Base class for everything the calculator rejects."""

    def __init__(self, message: str, pos: int):
        super().__init__(message)
        self.pos = pos  # 0-based column of the offending input


class ParseError(CalcError):
    """The input isn't a valid expression."""


@dataclass(frozen=True)
class Token:
    kind: str  # "NUMBER", "NAME", "OP" or "EOF"
    text: str
    pos: int


TOKEN_RE = re.compile(r"""
    (?P<NUMBER> [0-9]+ (?:\.[0-9]*)? | \.[0-9]+ )
  | (?P<NAME>   [A-Za-z_][A-Za-z0-9_]* )
  | (?P<OP>     [-+*/%^()=] )
  | (?P<SPACE>  \s+ )
  | (?P<ERROR>  . )
""", re.VERBOSE)


def tokenize(source: str) -> list[Token]:
    """Split source into tokens, ending with an EOF token."""
    tokens = []
    for m in TOKEN_RE.finditer(source):
        kind = m.lastgroup
        if kind == "SPACE":
            continue
        if kind == "ERROR":
            raise ParseError(f"unexpected character {m[0]!r}", m.start())
        tokens.append(Token(kind, m[0], m.start()))
    tokens.append(Token("EOF", "", len(source)))
    return tokens


def position():
    """A `pos` field: keyword-only, and ignored by == and repr()."""
    return field(default=0, kw_only=True, compare=False, repr=False)


type Node = Num | Name | UnaryOp | BinOp


@dataclass(frozen=True)
class Num:
    value: int | float
    pos: int = position()


@dataclass(frozen=True)
class Name:
    id: str
    pos: int = position()


@dataclass(frozen=True)
class UnaryOp:
    op: str
    operand: Node
    pos: int = position()


@dataclass(frozen=True)
class BinOp:
    op: str
    left: Node
    right: Node
    pos: int = position()


def describe(token: Token) -> str:
    """How a token reads in an error message."""
    return "end of input" if token.kind == "EOF" else repr(token.text)


class Parser:
    def __init__(self, tokens: list[Token]):
        self.tokens = tokens
        self.i = 0

    def peek(self, ahead: int = 0) -> Token:
        """Look at a token without consuming it. Past the end, EOF repeats."""
        return self.tokens[min(self.i + ahead, len(self.tokens) - 1)]

    def advance(self) -> Token:
        """Consume the current token and return it."""
        token = self.peek()
        self.i += 1
        return token

    def expect(self, text: str) -> Token:
        """Consume a token with exactly this text, or raise ParseError."""
        token = self.peek()
        if token.text != text:
            raise ParseError(f"expected {text!r}, found {describe(token)}", token.pos)
        return self.advance()

    def parse(self) -> Node:
        """Parse all the tokens. Anything left over is an error."""
        node = self.expression()
        token = self.peek()
        if token.kind != "EOF":
            raise ParseError(f"unexpected {describe(token)}", token.pos)
        return node

    def expression(self) -> Node:
        """expression := term (("+" | "-") term)*"""
        node = self.term()
        while self.peek().text in ("+", "-"):
            op = self.advance()
            node = BinOp(op.text, node, self.term(), pos=op.pos)
        return node

    def term(self) -> Node:
        """term := unary (("*" | "/" | "%") unary)*"""
        node = self.unary()
        while self.peek().text in ("*", "/", "%"):
            op = self.advance()
            node = BinOp(op.text, node, self.unary(), pos=op.pos)
        return node

    def unary(self) -> Node:
        """unary := ("-" | "+") unary | power"""
        if self.peek().text in ("-", "+"):
            op = self.advance()
            return UnaryOp(op.text, self.unary(), pos=op.pos)
        return self.power()

    def power(self) -> Node:
        """power := atom ("^" unary)?"""
        base = self.atom()
        if self.peek().text == "^":
            op = self.advance()
            return BinOp("^", base, self.unary(), pos=op.pos)
        return base

    def atom(self) -> Node:
        """atom := NUMBER | NAME | "(" expression ")" """
        token = self.advance()
        if token.kind == "NUMBER":
            value = float(token.text) if "." in token.text else int(token.text)
            return Num(value, pos=token.pos)
        if token.kind == "NAME":
            return Name(token.text, pos=token.pos)
        if token.text == "(":
            node = self.expression()
            self.expect(")")
            return node
        raise ParseError(f"unexpected {describe(token)}", token.pos)


def parse(source: str) -> Node:
    """Parse one line of calculator input into an AST."""
    return Parser(tokenize(source)).parse()


class EvalError(CalcError):
    """The input parsed, but it can't be evaluated."""


OPERATORS = {
    "+": operator.add,
    "-": operator.sub,
    "*": operator.mul,
    "/": operator.truediv,
    "%": operator.mod,
    "^": operator.pow,
}


def evaluate(node: Node, env: dict[str, int | float]) -> int | float:
    """Compute the value of a tree, looking variables up in env."""
    ...
```

```python solution
import operator
import re
from dataclasses import dataclass, field


class CalcError(Exception):
    """Base class for everything the calculator rejects."""

    def __init__(self, message: str, pos: int):
        super().__init__(message)
        self.pos = pos  # 0-based column of the offending input


class ParseError(CalcError):
    """The input isn't a valid expression."""


@dataclass(frozen=True)
class Token:
    kind: str  # "NUMBER", "NAME", "OP" or "EOF"
    text: str
    pos: int


TOKEN_RE = re.compile(r"""
    (?P<NUMBER> [0-9]+ (?:\.[0-9]*)? | \.[0-9]+ )
  | (?P<NAME>   [A-Za-z_][A-Za-z0-9_]* )
  | (?P<OP>     [-+*/%^()=] )
  | (?P<SPACE>  \s+ )
  | (?P<ERROR>  . )
""", re.VERBOSE)


def tokenize(source: str) -> list[Token]:
    """Split source into tokens, ending with an EOF token."""
    tokens = []
    for m in TOKEN_RE.finditer(source):
        kind = m.lastgroup
        if kind == "SPACE":
            continue
        if kind == "ERROR":
            raise ParseError(f"unexpected character {m[0]!r}", m.start())
        tokens.append(Token(kind, m[0], m.start()))
    tokens.append(Token("EOF", "", len(source)))
    return tokens


def position():
    """A `pos` field: keyword-only, and ignored by == and repr()."""
    return field(default=0, kw_only=True, compare=False, repr=False)


type Node = Num | Name | UnaryOp | BinOp


@dataclass(frozen=True)
class Num:
    value: int | float
    pos: int = position()


@dataclass(frozen=True)
class Name:
    id: str
    pos: int = position()


@dataclass(frozen=True)
class UnaryOp:
    op: str
    operand: Node
    pos: int = position()


@dataclass(frozen=True)
class BinOp:
    op: str
    left: Node
    right: Node
    pos: int = position()


def describe(token: Token) -> str:
    """How a token reads in an error message."""
    return "end of input" if token.kind == "EOF" else repr(token.text)


class Parser:
    def __init__(self, tokens: list[Token]):
        self.tokens = tokens
        self.i = 0

    def peek(self, ahead: int = 0) -> Token:
        """Look at a token without consuming it. Past the end, EOF repeats."""
        return self.tokens[min(self.i + ahead, len(self.tokens) - 1)]

    def advance(self) -> Token:
        """Consume the current token and return it."""
        token = self.peek()
        self.i += 1
        return token

    def expect(self, text: str) -> Token:
        """Consume a token with exactly this text, or raise ParseError."""
        token = self.peek()
        if token.text != text:
            raise ParseError(f"expected {text!r}, found {describe(token)}", token.pos)
        return self.advance()

    def parse(self) -> Node:
        """Parse all the tokens. Anything left over is an error."""
        node = self.expression()
        token = self.peek()
        if token.kind != "EOF":
            raise ParseError(f"unexpected {describe(token)}", token.pos)
        return node

    def expression(self) -> Node:
        """expression := term (("+" | "-") term)*"""
        node = self.term()
        while self.peek().text in ("+", "-"):
            op = self.advance()
            node = BinOp(op.text, node, self.term(), pos=op.pos)
        return node

    def term(self) -> Node:
        """term := unary (("*" | "/" | "%") unary)*"""
        node = self.unary()
        while self.peek().text in ("*", "/", "%"):
            op = self.advance()
            node = BinOp(op.text, node, self.unary(), pos=op.pos)
        return node

    def unary(self) -> Node:
        """unary := ("-" | "+") unary | power"""
        if self.peek().text in ("-", "+"):
            op = self.advance()
            return UnaryOp(op.text, self.unary(), pos=op.pos)
        return self.power()

    def power(self) -> Node:
        """power := atom ("^" unary)?"""
        base = self.atom()
        if self.peek().text == "^":
            op = self.advance()
            return BinOp("^", base, self.unary(), pos=op.pos)
        return base

    def atom(self) -> Node:
        """atom := NUMBER | NAME | "(" expression ")" """
        token = self.advance()
        if token.kind == "NUMBER":
            value = float(token.text) if "." in token.text else int(token.text)
            return Num(value, pos=token.pos)
        if token.kind == "NAME":
            return Name(token.text, pos=token.pos)
        if token.text == "(":
            node = self.expression()
            self.expect(")")
            return node
        raise ParseError(f"unexpected {describe(token)}", token.pos)


def parse(source: str) -> Node:
    """Parse one line of calculator input into an AST."""
    return Parser(tokenize(source)).parse()


class EvalError(CalcError):
    """The input parsed, but it can't be evaluated."""


OPERATORS = {
    "+": operator.add,
    "-": operator.sub,
    "*": operator.mul,
    "/": operator.truediv,
    "%": operator.mod,
    "^": operator.pow,
}


def evaluate(node: Node, env: dict[str, int | float]) -> int | float:
    """Compute the value of a tree, looking variables up in env."""
    match node:
        case Num(value):
            return value
        case Name(name) if name in env:
            return env[name]
        case Name(name):
            raise EvalError(f"unknown variable {name!r}", node.pos)
        case UnaryOp("-", operand):
            return -evaluate(operand, env)
        case UnaryOp("+", operand):
            return evaluate(operand, env)
        case BinOp(op, left, right):
            a, b = evaluate(left, env), evaluate(right, env)
            try:
                result = OPERATORS[op](a, b)
            except ZeroDivisionError:
                raise EvalError("division by zero", node.pos) from None
            except OverflowError:
                raise EvalError("number too large", node.pos) from None
            if isinstance(result, complex):
                raise EvalError("result is a complex number", node.pos)
            return result
    raise TypeError(f"not a node: {node!r}")
```

```python tests
def calc(source, **env):
    return evaluate(parse(source), env)

@test("numbers and arithmetic")
def _():
    eq(evaluate(Num(7), {}), 7)
    eq(evaluate(BinOp("+", Num(1), BinOp("*", Num(2), Num(3))), {}), 7)
    eq(calc("(1 + 2) * 3 - 4"), 5)

@test("follows Python's arithmetic")
def _():
    eq(calc("7 / 2"), 3.5)
    eq(calc("-7 % 3"), 2)
    eq(calc("2 ^ 3 ^ 2"), 512)
    eq(calc("2 ^ -1"), 0.5)
    eq(calc("-2 ^ 2"), -4)
    eq(calc("+5"), 5)

@test("integer arithmetic stays exact")
def _():
    eq(calc("2 ^ 100"), 2 ** 100)
    check(type(calc("6 * 7")) is int, "6 * 7 should be the int 42")

@test("variables come from env")
def _():
    eq(calc("price * (1 + rate)", price=50, rate=0.2), 60.0)
    eq(calc("-x", x=3), -3)

@test("an unknown variable raises EvalError at the name")
def _():
    err = raises(EvalError, calc, "1 + rate")
    eq(err.pos, 4)
    check("'rate'" in str(err), f"quote the name in the message, got {str(err)!r}")

@test("division by zero raises EvalError at the operator")
def _():
    eq(raises(EvalError, calc, "1 / (2 - 2)").pos, 2)
    eq(raises(EvalError, calc, "5 % 0").pos, 2)
    eq(raises(EvalError, calc, "0 ^ -1").pos, 2)

@test("overflow and complex results raise EvalError at the operator")
def _():
    eq(raises(EvalError, calc, "10.0 ^ 400").pos, 5)
    eq(raises(EvalError, calc, "(-8) ^ 0.5").pos, 5)

@test("evaluate() dispatches with match")
def _():
    fn = next((n for n in ast.walk(tree) if isinstance(n, ast.FunctionDef) and n.name == "evaluate"), None)
    check(fn is not None and any(isinstance(n, ast.Match) for n in ast.walk(fn)),
          "use match/case inside evaluate() to dispatch on the type of node")
```

```hint
One `case` per node class: `case Num(value):`, `case UnaryOp("-", operand):`, `case BinOp(op, left, right):` and so on. A literal like `"-"` in a sub-pattern compares, while a bare name captures.
```

```hint
For names, a guard keeps it to two cases: `case Name(name) if name in env:` returns the value, and `case Name(name):` below it raises `EvalError(f"unknown variable {name!r}", node.pos)`.
```

```hint
In the `BinOp` case, evaluate both sides first, then call `OPERATORS[op](a, b)` inside a `try`. Translate with `except ZeroDivisionError: raise EvalError("division by zero", node.pos) from None`, then check `isinstance(result, complex)` before returning.
```
:::

## Step 5: Variables and assignment

So far, `env` has been read-only. Assignment adds one rule on top of the grammar:

```text
statement := NAME "=" expression | expression
```

As in Python, assignment is a **statement**. It can only start a line, and it can't be nested inside an expression. That's a deliberate difference from JavaScript, where `=` is an expression and `if (x = 0)` is a classic bug. Python's expression form of assignment is the walrus, `:=`, from [Control Flow](lesson:control-flow#the-walrus-operator), and this calculator doesn't need one.

:::compare Assignment: expression or statement?
```js
let x;
const y = (x = 3) + 1;          // 4: = is an expression
if ((x = nextValue())) {        // legal, and easy to misread
  console.log(x);
}
```
```python nocheck
y = (x = 3) + 1                 # SyntaxError: = is a statement
if (x := next_value()):         # the walrus is the expression form
    print(x)
```
:::

Deciding which rule applies takes **two tokens of lookahead**: a line is an assignment only if it starts with a `NAME` followed by `=`. That's what `peek(1)` is for. Every other line falls through to `expression()`, so `x + 1` still works, and `2 = x` fails the usual way, on a leftover `=`.

The evaluator needs one more `case`. Evaluate the right-hand side first, then store it, so that an assignment whose value raises leaves the old binding alone. `env` is an ordinary dict, and the caller's dict is the one that changes, just as when a JavaScript function mutates an object it was passed.

:::challenge id=calc-step-5 title="Step 5: Assignment" difficulty=medium
Add assignment:

- Write `Parser.statement()` for the rule above, building an `Assign(name, value)` node (provided) with the name's column as `pos`.
- Make `Parser.parse()` start from `statement()`.
- Add a `case` for `Assign` to `evaluate()`: store the value in `env` and return it.

Only a bare name can be assigned to, and only at the start of a line. Everything else that contains `=` is a `ParseError`.

```text
>>> env = {}
>>> evaluate(parse("total = 2 * 3"), env)
6
>>> env
{'total': 6}
```

```python starter
import operator
import re
from dataclasses import dataclass, field


class CalcError(Exception):
    """Base class for everything the calculator rejects."""

    def __init__(self, message: str, pos: int):
        super().__init__(message)
        self.pos = pos  # 0-based column of the offending input


class ParseError(CalcError):
    """The input isn't a valid expression."""


@dataclass(frozen=True)
class Token:
    kind: str  # "NUMBER", "NAME", "OP" or "EOF"
    text: str
    pos: int


TOKEN_RE = re.compile(r"""
    (?P<NUMBER> [0-9]+ (?:\.[0-9]*)? | \.[0-9]+ )
  | (?P<NAME>   [A-Za-z_][A-Za-z0-9_]* )
  | (?P<OP>     [-+*/%^()=] )
  | (?P<SPACE>  \s+ )
  | (?P<ERROR>  . )
""", re.VERBOSE)


def tokenize(source: str) -> list[Token]:
    """Split source into tokens, ending with an EOF token."""
    tokens = []
    for m in TOKEN_RE.finditer(source):
        kind = m.lastgroup
        if kind == "SPACE":
            continue
        if kind == "ERROR":
            raise ParseError(f"unexpected character {m[0]!r}", m.start())
        tokens.append(Token(kind, m[0], m.start()))
    tokens.append(Token("EOF", "", len(source)))
    return tokens


def position():
    """A `pos` field: keyword-only, and ignored by == and repr()."""
    return field(default=0, kw_only=True, compare=False, repr=False)


type Node = Num | Name | UnaryOp | BinOp | Assign


@dataclass(frozen=True)
class Num:
    value: int | float
    pos: int = position()


@dataclass(frozen=True)
class Name:
    id: str
    pos: int = position()


@dataclass(frozen=True)
class UnaryOp:
    op: str
    operand: Node
    pos: int = position()


@dataclass(frozen=True)
class BinOp:
    op: str
    left: Node
    right: Node
    pos: int = position()


@dataclass(frozen=True)
class Assign:
    name: str
    value: Node
    pos: int = position()


def describe(token: Token) -> str:
    """How a token reads in an error message."""
    return "end of input" if token.kind == "EOF" else repr(token.text)


class Parser:
    def __init__(self, tokens: list[Token]):
        self.tokens = tokens
        self.i = 0

    def peek(self, ahead: int = 0) -> Token:
        """Look at a token without consuming it. Past the end, EOF repeats."""
        return self.tokens[min(self.i + ahead, len(self.tokens) - 1)]

    def advance(self) -> Token:
        """Consume the current token and return it."""
        token = self.peek()
        self.i += 1
        return token

    def expect(self, text: str) -> Token:
        """Consume a token with exactly this text, or raise ParseError."""
        token = self.peek()
        if token.text != text:
            raise ParseError(f"expected {text!r}, found {describe(token)}", token.pos)
        return self.advance()

    def parse(self) -> Node:
        """Parse all the tokens. Anything left over is an error."""
        # TODO (step 5): start from self.statement() instead
        node = self.expression()
        token = self.peek()
        if token.kind != "EOF":
            raise ParseError(f"unexpected {describe(token)}", token.pos)
        return node

    def statement(self) -> Node:
        """statement := NAME "=" expression | expression"""
        ...

    def expression(self) -> Node:
        """expression := term (("+" | "-") term)*"""
        node = self.term()
        while self.peek().text in ("+", "-"):
            op = self.advance()
            node = BinOp(op.text, node, self.term(), pos=op.pos)
        return node

    def term(self) -> Node:
        """term := unary (("*" | "/" | "%") unary)*"""
        node = self.unary()
        while self.peek().text in ("*", "/", "%"):
            op = self.advance()
            node = BinOp(op.text, node, self.unary(), pos=op.pos)
        return node

    def unary(self) -> Node:
        """unary := ("-" | "+") unary | power"""
        if self.peek().text in ("-", "+"):
            op = self.advance()
            return UnaryOp(op.text, self.unary(), pos=op.pos)
        return self.power()

    def power(self) -> Node:
        """power := atom ("^" unary)?"""
        base = self.atom()
        if self.peek().text == "^":
            op = self.advance()
            return BinOp("^", base, self.unary(), pos=op.pos)
        return base

    def atom(self) -> Node:
        """atom := NUMBER | NAME | "(" expression ")" """
        token = self.advance()
        if token.kind == "NUMBER":
            value = float(token.text) if "." in token.text else int(token.text)
            return Num(value, pos=token.pos)
        if token.kind == "NAME":
            return Name(token.text, pos=token.pos)
        if token.text == "(":
            node = self.expression()
            self.expect(")")
            return node
        raise ParseError(f"unexpected {describe(token)}", token.pos)


def parse(source: str) -> Node:
    """Parse one line of calculator input into an AST."""
    return Parser(tokenize(source)).parse()


class EvalError(CalcError):
    """The input parsed, but it can't be evaluated."""


OPERATORS = {
    "+": operator.add,
    "-": operator.sub,
    "*": operator.mul,
    "/": operator.truediv,
    "%": operator.mod,
    "^": operator.pow,
}


def evaluate(node: Node, env: dict[str, int | float]) -> int | float:
    """Compute the value of a tree, looking variables up in env."""
    match node:
        case Num(value):
            return value
        case Name(name) if name in env:
            return env[name]
        case Name(name):
            raise EvalError(f"unknown variable {name!r}", node.pos)
        case UnaryOp("-", operand):
            return -evaluate(operand, env)
        case UnaryOp("+", operand):
            return evaluate(operand, env)
        case BinOp(op, left, right):
            a, b = evaluate(left, env), evaluate(right, env)
            try:
                result = OPERATORS[op](a, b)
            except ZeroDivisionError:
                raise EvalError("division by zero", node.pos) from None
            except OverflowError:
                raise EvalError("number too large", node.pos) from None
            if isinstance(result, complex):
                raise EvalError("result is a complex number", node.pos)
            return result
        # TODO (step 5): a case for Assign
    raise TypeError(f"not a node: {node!r}")
```

```python solution
import operator
import re
from dataclasses import dataclass, field


class CalcError(Exception):
    """Base class for everything the calculator rejects."""

    def __init__(self, message: str, pos: int):
        super().__init__(message)
        self.pos = pos  # 0-based column of the offending input


class ParseError(CalcError):
    """The input isn't a valid expression."""


@dataclass(frozen=True)
class Token:
    kind: str  # "NUMBER", "NAME", "OP" or "EOF"
    text: str
    pos: int


TOKEN_RE = re.compile(r"""
    (?P<NUMBER> [0-9]+ (?:\.[0-9]*)? | \.[0-9]+ )
  | (?P<NAME>   [A-Za-z_][A-Za-z0-9_]* )
  | (?P<OP>     [-+*/%^()=] )
  | (?P<SPACE>  \s+ )
  | (?P<ERROR>  . )
""", re.VERBOSE)


def tokenize(source: str) -> list[Token]:
    """Split source into tokens, ending with an EOF token."""
    tokens = []
    for m in TOKEN_RE.finditer(source):
        kind = m.lastgroup
        if kind == "SPACE":
            continue
        if kind == "ERROR":
            raise ParseError(f"unexpected character {m[0]!r}", m.start())
        tokens.append(Token(kind, m[0], m.start()))
    tokens.append(Token("EOF", "", len(source)))
    return tokens


def position():
    """A `pos` field: keyword-only, and ignored by == and repr()."""
    return field(default=0, kw_only=True, compare=False, repr=False)


type Node = Num | Name | UnaryOp | BinOp | Assign


@dataclass(frozen=True)
class Num:
    value: int | float
    pos: int = position()


@dataclass(frozen=True)
class Name:
    id: str
    pos: int = position()


@dataclass(frozen=True)
class UnaryOp:
    op: str
    operand: Node
    pos: int = position()


@dataclass(frozen=True)
class BinOp:
    op: str
    left: Node
    right: Node
    pos: int = position()


@dataclass(frozen=True)
class Assign:
    name: str
    value: Node
    pos: int = position()


def describe(token: Token) -> str:
    """How a token reads in an error message."""
    return "end of input" if token.kind == "EOF" else repr(token.text)


class Parser:
    def __init__(self, tokens: list[Token]):
        self.tokens = tokens
        self.i = 0

    def peek(self, ahead: int = 0) -> Token:
        """Look at a token without consuming it. Past the end, EOF repeats."""
        return self.tokens[min(self.i + ahead, len(self.tokens) - 1)]

    def advance(self) -> Token:
        """Consume the current token and return it."""
        token = self.peek()
        self.i += 1
        return token

    def expect(self, text: str) -> Token:
        """Consume a token with exactly this text, or raise ParseError."""
        token = self.peek()
        if token.text != text:
            raise ParseError(f"expected {text!r}, found {describe(token)}", token.pos)
        return self.advance()

    def parse(self) -> Node:
        """Parse all the tokens. Anything left over is an error."""
        node = self.statement()
        token = self.peek()
        if token.kind != "EOF":
            raise ParseError(f"unexpected {describe(token)}", token.pos)
        return node

    def statement(self) -> Node:
        """statement := NAME "=" expression | expression"""
        if self.peek().kind == "NAME" and self.peek(1).text == "=":
            name = self.advance()
            self.advance()  # the "="
            return Assign(name.text, self.expression(), pos=name.pos)
        return self.expression()

    def expression(self) -> Node:
        """expression := term (("+" | "-") term)*"""
        node = self.term()
        while self.peek().text in ("+", "-"):
            op = self.advance()
            node = BinOp(op.text, node, self.term(), pos=op.pos)
        return node

    def term(self) -> Node:
        """term := unary (("*" | "/" | "%") unary)*"""
        node = self.unary()
        while self.peek().text in ("*", "/", "%"):
            op = self.advance()
            node = BinOp(op.text, node, self.unary(), pos=op.pos)
        return node

    def unary(self) -> Node:
        """unary := ("-" | "+") unary | power"""
        if self.peek().text in ("-", "+"):
            op = self.advance()
            return UnaryOp(op.text, self.unary(), pos=op.pos)
        return self.power()

    def power(self) -> Node:
        """power := atom ("^" unary)?"""
        base = self.atom()
        if self.peek().text == "^":
            op = self.advance()
            return BinOp("^", base, self.unary(), pos=op.pos)
        return base

    def atom(self) -> Node:
        """atom := NUMBER | NAME | "(" expression ")" """
        token = self.advance()
        if token.kind == "NUMBER":
            value = float(token.text) if "." in token.text else int(token.text)
            return Num(value, pos=token.pos)
        if token.kind == "NAME":
            return Name(token.text, pos=token.pos)
        if token.text == "(":
            node = self.expression()
            self.expect(")")
            return node
        raise ParseError(f"unexpected {describe(token)}", token.pos)


def parse(source: str) -> Node:
    """Parse one line of calculator input into an AST."""
    return Parser(tokenize(source)).parse()


class EvalError(CalcError):
    """The input parsed, but it can't be evaluated."""


OPERATORS = {
    "+": operator.add,
    "-": operator.sub,
    "*": operator.mul,
    "/": operator.truediv,
    "%": operator.mod,
    "^": operator.pow,
}


def evaluate(node: Node, env: dict[str, int | float]) -> int | float:
    """Compute the value of a tree, looking variables up in env."""
    match node:
        case Num(value):
            return value
        case Name(name) if name in env:
            return env[name]
        case Name(name):
            raise EvalError(f"unknown variable {name!r}", node.pos)
        case UnaryOp("-", operand):
            return -evaluate(operand, env)
        case UnaryOp("+", operand):
            return evaluate(operand, env)
        case BinOp(op, left, right):
            a, b = evaluate(left, env), evaluate(right, env)
            try:
                result = OPERATORS[op](a, b)
            except ZeroDivisionError:
                raise EvalError("division by zero", node.pos) from None
            except OverflowError:
                raise EvalError("number too large", node.pos) from None
            if isinstance(result, complex):
                raise EvalError("result is a complex number", node.pos)
            return result
        case Assign(name, value):
            env[name] = evaluate(value, env)
            return env[name]
    raise TypeError(f"not a node: {node!r}")
```

```python tests
@test("parses assignments")
def _():
    eq(parse("x = 1 + 2"), Assign("x", BinOp("+", Num(1), Num(2))))
    eq(parse("total=x"), Assign("total", Name("x")))

@test("a name without = is still an expression")
def _():
    eq(parse("x"), Name("x"))
    eq(parse("x + 1"), BinOp("+", Name("x"), Num(1)))

@test("only a bare name at the start can be assigned to")
def _():
    for source, pos in [("2 = x", 2), ("x + 1 = 2", 6), ("(x) = 2", 4), ("x = y = 1", 6), ("x =", 3)]:
        eq(raises(ParseError, parse, source).pos, pos, f"position for {source!r}")

@test("assignment stores the value and returns it")
def _():
    env = {}
    eq(evaluate(parse("x = 2 * 3"), env), 6)
    eq(env, {"x": 6})

@test("later lines see earlier variables")
def _():
    env = {}
    for line in ["price = 50", "rate = 0.2", "total = price * (1 + rate)"]:
        evaluate(parse(line), env)
    eq(env["total"], 60.0)

@test("the right-hand side can use the old value")
def _():
    env = {"n": 1}
    evaluate(parse("n = n + 1"), env)
    eq(env, {"n": 2})

@test("a failed assignment leaves env alone")
def _():
    env = {"x": 1}
    raises(EvalError, evaluate, parse("x = 1 / 0"), env)
    raises(EvalError, evaluate, parse("y = missing"), env)
    eq(env, {"x": 1})
```

```hint
The lookahead is `self.peek().kind == "NAME" and self.peek(1).text == "="`. If it holds, consume both tokens and parse the value with `self.expression()`. Otherwise just `return self.expression()`.
```

```hint
In `evaluate()`, the new case is `case Assign(name, value):`. Compute `evaluate(value, env)` before you touch `env`, then store it and return it.
```
:::

## Step 6: Running a session

`evaluate_lines(text)` is the driver. It splits the text into lines, skips blank lines and `#` comments, and runs each remaining line through `parse()` and `evaluate()` against one shared `env`. Two design points:

- **One handler for every stage.** `ParseError` and `EvalError` share the `CalcError` base, so a single `except CalcError` catches both. A genuine bug, such as a `TypeError` from a mistake in `evaluate()`, still crashes loudly instead of being reported as the user's error. The success path goes in an `else:` block, which runs only if the `try` block raised nothing, so the `try` wraps only the code whose errors you mean to catch.
- **The report points.** The error knows its column, so the report is the line, then `" " * err.pos + "^ " + message` underneath it.

:::compare Catch your own errors, let bugs through
```js
try {
  value = evaluate(parse(line), env);
} catch (err) {
  if (!(err instanceof CalcError)) throw err;   // not ours: rethrow
  reports.push(pointAt(line, err));
  continue;
}
reports.push(String(value));
```
```python
try:
    value = evaluate(parse(line), env)
except CalcError as err:          # anything else propagates by itself
    reports.append(point_at(line, err))
else:
    reports.append(str(value))
```
:::

Python's own `SyntaxError` carries its position the same way, as the offending `text` and a 1-based `offset`:

```python run
try:
    compile("total = (price * 2", "<input>", "exec")
except SyntaxError as err:
    print(err.text.rstrip())
    print(" " * (err.offset - 1) + "^", err.msg)
```

:::gotcha `env = CONSTANTS` doesn't copy
Assignment never copies. If each session started with `env = CONSTANTS`, a session that runs `pi = 3` would change `pi` for every session after it. Start from a copy: `dict(CONSTANTS)` or `{**CONSTANTS}`. See [Mutability and aliasing](lesson:variables-and-scope#mutability-and-aliasing).
:::

:::quiz output
What does this print?

```python
CONSTANTS = {"pi": 3.14159}
env = CONSTANTS
env["pi"] = 3
print(CONSTANTS["pi"])
```

- [ ] `3.14159`
- [x] `3`
- [ ] `KeyError`

`env` and `CONSTANTS` are two names for one dict, so the write is visible through both.
:::

:::pythonic Layered scopes with `ChainMap`
`collections.ChainMap({}, CONSTANTS)` reads through to the constants but writes only to the first dict, much like an object created with `Object.create(constants)` in JavaScript. A session could then list the user's own variables as `env.maps[0]`. See [ChainMap](lesson:dicts#chainmap-layered-lookups).
:::

:::challenge id=calc-step-6 title="Step 6: Evaluate a whole session" difficulty=medium
Write `evaluate_lines(text)`, which returns a list with one report string per line that has something to run:

- Skip blank lines and lines whose first non-space character is `#`.
- All lines share one environment, which starts as a copy of `CONSTANTS` (provided). Each call starts fresh, and `CONSTANTS` itself never changes.
- An assignment reports `name = value`, and an expression reports `str(value)`.
- A `CalcError` from any stage reports the line, a newline, and then a caret under the error's column, followed by a space and the message. The lines after it still run.

```text
>>> evaluate_lines("r = 2\npi * r ^ 2\nr / 0")
['r = 2', '12.566370614359172', 'r / 0\n  ^ division by zero']
```

```python starter
import math
import operator
import re
from dataclasses import dataclass, field


class CalcError(Exception):
    """Base class for everything the calculator rejects."""

    def __init__(self, message: str, pos: int):
        super().__init__(message)
        self.pos = pos  # 0-based column of the offending input


class ParseError(CalcError):
    """The input isn't a valid expression."""


@dataclass(frozen=True)
class Token:
    kind: str  # "NUMBER", "NAME", "OP" or "EOF"
    text: str
    pos: int


TOKEN_RE = re.compile(r"""
    (?P<NUMBER> [0-9]+ (?:\.[0-9]*)? | \.[0-9]+ )
  | (?P<NAME>   [A-Za-z_][A-Za-z0-9_]* )
  | (?P<OP>     [-+*/%^()=] )
  | (?P<SPACE>  \s+ )
  | (?P<ERROR>  . )
""", re.VERBOSE)


def tokenize(source: str) -> list[Token]:
    """Split source into tokens, ending with an EOF token."""
    tokens = []
    for m in TOKEN_RE.finditer(source):
        kind = m.lastgroup
        if kind == "SPACE":
            continue
        if kind == "ERROR":
            raise ParseError(f"unexpected character {m[0]!r}", m.start())
        tokens.append(Token(kind, m[0], m.start()))
    tokens.append(Token("EOF", "", len(source)))
    return tokens


def position():
    """A `pos` field: keyword-only, and ignored by == and repr()."""
    return field(default=0, kw_only=True, compare=False, repr=False)


type Node = Num | Name | UnaryOp | BinOp | Assign


@dataclass(frozen=True)
class Num:
    value: int | float
    pos: int = position()


@dataclass(frozen=True)
class Name:
    id: str
    pos: int = position()


@dataclass(frozen=True)
class UnaryOp:
    op: str
    operand: Node
    pos: int = position()


@dataclass(frozen=True)
class BinOp:
    op: str
    left: Node
    right: Node
    pos: int = position()


@dataclass(frozen=True)
class Assign:
    name: str
    value: Node
    pos: int = position()


def describe(token: Token) -> str:
    """How a token reads in an error message."""
    return "end of input" if token.kind == "EOF" else repr(token.text)


class Parser:
    def __init__(self, tokens: list[Token]):
        self.tokens = tokens
        self.i = 0

    def peek(self, ahead: int = 0) -> Token:
        """Look at a token without consuming it. Past the end, EOF repeats."""
        return self.tokens[min(self.i + ahead, len(self.tokens) - 1)]

    def advance(self) -> Token:
        """Consume the current token and return it."""
        token = self.peek()
        self.i += 1
        return token

    def expect(self, text: str) -> Token:
        """Consume a token with exactly this text, or raise ParseError."""
        token = self.peek()
        if token.text != text:
            raise ParseError(f"expected {text!r}, found {describe(token)}", token.pos)
        return self.advance()

    def parse(self) -> Node:
        """Parse all the tokens. Anything left over is an error."""
        node = self.statement()
        token = self.peek()
        if token.kind != "EOF":
            raise ParseError(f"unexpected {describe(token)}", token.pos)
        return node

    def statement(self) -> Node:
        """statement := NAME "=" expression | expression"""
        if self.peek().kind == "NAME" and self.peek(1).text == "=":
            name = self.advance()
            self.advance()  # the "="
            return Assign(name.text, self.expression(), pos=name.pos)
        return self.expression()

    def expression(self) -> Node:
        """expression := term (("+" | "-") term)*"""
        node = self.term()
        while self.peek().text in ("+", "-"):
            op = self.advance()
            node = BinOp(op.text, node, self.term(), pos=op.pos)
        return node

    def term(self) -> Node:
        """term := unary (("*" | "/" | "%") unary)*"""
        node = self.unary()
        while self.peek().text in ("*", "/", "%"):
            op = self.advance()
            node = BinOp(op.text, node, self.unary(), pos=op.pos)
        return node

    def unary(self) -> Node:
        """unary := ("-" | "+") unary | power"""
        if self.peek().text in ("-", "+"):
            op = self.advance()
            return UnaryOp(op.text, self.unary(), pos=op.pos)
        return self.power()

    def power(self) -> Node:
        """power := atom ("^" unary)?"""
        base = self.atom()
        if self.peek().text == "^":
            op = self.advance()
            return BinOp("^", base, self.unary(), pos=op.pos)
        return base

    def atom(self) -> Node:
        """atom := NUMBER | NAME | "(" expression ")" """
        token = self.advance()
        if token.kind == "NUMBER":
            value = float(token.text) if "." in token.text else int(token.text)
            return Num(value, pos=token.pos)
        if token.kind == "NAME":
            return Name(token.text, pos=token.pos)
        if token.text == "(":
            node = self.expression()
            self.expect(")")
            return node
        raise ParseError(f"unexpected {describe(token)}", token.pos)


def parse(source: str) -> Node:
    """Parse one line of calculator input into an AST."""
    return Parser(tokenize(source)).parse()


class EvalError(CalcError):
    """The input parsed, but it can't be evaluated."""


OPERATORS = {
    "+": operator.add,
    "-": operator.sub,
    "*": operator.mul,
    "/": operator.truediv,
    "%": operator.mod,
    "^": operator.pow,
}


def evaluate(node: Node, env: dict[str, int | float]) -> int | float:
    """Compute the value of a tree, looking variables up in env."""
    match node:
        case Num(value):
            return value
        case Name(name) if name in env:
            return env[name]
        case Name(name):
            raise EvalError(f"unknown variable {name!r}", node.pos)
        case UnaryOp("-", operand):
            return -evaluate(operand, env)
        case UnaryOp("+", operand):
            return evaluate(operand, env)
        case BinOp(op, left, right):
            a, b = evaluate(left, env), evaluate(right, env)
            try:
                result = OPERATORS[op](a, b)
            except ZeroDivisionError:
                raise EvalError("division by zero", node.pos) from None
            except OverflowError:
                raise EvalError("number too large", node.pos) from None
            if isinstance(result, complex):
                raise EvalError("result is a complex number", node.pos)
            return result
        case Assign(name, value):
            env[name] = evaluate(value, env)
            return env[name]
    raise TypeError(f"not a node: {node!r}")


CONSTANTS = {"pi": math.pi, "e": math.e, "tau": math.tau}


def evaluate_lines(text: str) -> list[str]:
    """Run every line of text in one shared environment, collecting a report per line."""
    ...
```

```python solution
import math
import operator
import re
from dataclasses import dataclass, field


class CalcError(Exception):
    """Base class for everything the calculator rejects."""

    def __init__(self, message: str, pos: int):
        super().__init__(message)
        self.pos = pos  # 0-based column of the offending input


class ParseError(CalcError):
    """The input isn't a valid expression."""


@dataclass(frozen=True)
class Token:
    kind: str  # "NUMBER", "NAME", "OP" or "EOF"
    text: str
    pos: int


TOKEN_RE = re.compile(r"""
    (?P<NUMBER> [0-9]+ (?:\.[0-9]*)? | \.[0-9]+ )
  | (?P<NAME>   [A-Za-z_][A-Za-z0-9_]* )
  | (?P<OP>     [-+*/%^()=] )
  | (?P<SPACE>  \s+ )
  | (?P<ERROR>  . )
""", re.VERBOSE)


def tokenize(source: str) -> list[Token]:
    """Split source into tokens, ending with an EOF token."""
    tokens = []
    for m in TOKEN_RE.finditer(source):
        kind = m.lastgroup
        if kind == "SPACE":
            continue
        if kind == "ERROR":
            raise ParseError(f"unexpected character {m[0]!r}", m.start())
        tokens.append(Token(kind, m[0], m.start()))
    tokens.append(Token("EOF", "", len(source)))
    return tokens


def position():
    """A `pos` field: keyword-only, and ignored by == and repr()."""
    return field(default=0, kw_only=True, compare=False, repr=False)


type Node = Num | Name | UnaryOp | BinOp | Assign


@dataclass(frozen=True)
class Num:
    value: int | float
    pos: int = position()


@dataclass(frozen=True)
class Name:
    id: str
    pos: int = position()


@dataclass(frozen=True)
class UnaryOp:
    op: str
    operand: Node
    pos: int = position()


@dataclass(frozen=True)
class BinOp:
    op: str
    left: Node
    right: Node
    pos: int = position()


@dataclass(frozen=True)
class Assign:
    name: str
    value: Node
    pos: int = position()


def describe(token: Token) -> str:
    """How a token reads in an error message."""
    return "end of input" if token.kind == "EOF" else repr(token.text)


class Parser:
    def __init__(self, tokens: list[Token]):
        self.tokens = tokens
        self.i = 0

    def peek(self, ahead: int = 0) -> Token:
        """Look at a token without consuming it. Past the end, EOF repeats."""
        return self.tokens[min(self.i + ahead, len(self.tokens) - 1)]

    def advance(self) -> Token:
        """Consume the current token and return it."""
        token = self.peek()
        self.i += 1
        return token

    def expect(self, text: str) -> Token:
        """Consume a token with exactly this text, or raise ParseError."""
        token = self.peek()
        if token.text != text:
            raise ParseError(f"expected {text!r}, found {describe(token)}", token.pos)
        return self.advance()

    def parse(self) -> Node:
        """Parse all the tokens. Anything left over is an error."""
        node = self.statement()
        token = self.peek()
        if token.kind != "EOF":
            raise ParseError(f"unexpected {describe(token)}", token.pos)
        return node

    def statement(self) -> Node:
        """statement := NAME "=" expression | expression"""
        if self.peek().kind == "NAME" and self.peek(1).text == "=":
            name = self.advance()
            self.advance()  # the "="
            return Assign(name.text, self.expression(), pos=name.pos)
        return self.expression()

    def expression(self) -> Node:
        """expression := term (("+" | "-") term)*"""
        node = self.term()
        while self.peek().text in ("+", "-"):
            op = self.advance()
            node = BinOp(op.text, node, self.term(), pos=op.pos)
        return node

    def term(self) -> Node:
        """term := unary (("*" | "/" | "%") unary)*"""
        node = self.unary()
        while self.peek().text in ("*", "/", "%"):
            op = self.advance()
            node = BinOp(op.text, node, self.unary(), pos=op.pos)
        return node

    def unary(self) -> Node:
        """unary := ("-" | "+") unary | power"""
        if self.peek().text in ("-", "+"):
            op = self.advance()
            return UnaryOp(op.text, self.unary(), pos=op.pos)
        return self.power()

    def power(self) -> Node:
        """power := atom ("^" unary)?"""
        base = self.atom()
        if self.peek().text == "^":
            op = self.advance()
            return BinOp("^", base, self.unary(), pos=op.pos)
        return base

    def atom(self) -> Node:
        """atom := NUMBER | NAME | "(" expression ")" """
        token = self.advance()
        if token.kind == "NUMBER":
            value = float(token.text) if "." in token.text else int(token.text)
            return Num(value, pos=token.pos)
        if token.kind == "NAME":
            return Name(token.text, pos=token.pos)
        if token.text == "(":
            node = self.expression()
            self.expect(")")
            return node
        raise ParseError(f"unexpected {describe(token)}", token.pos)


def parse(source: str) -> Node:
    """Parse one line of calculator input into an AST."""
    return Parser(tokenize(source)).parse()


class EvalError(CalcError):
    """The input parsed, but it can't be evaluated."""


OPERATORS = {
    "+": operator.add,
    "-": operator.sub,
    "*": operator.mul,
    "/": operator.truediv,
    "%": operator.mod,
    "^": operator.pow,
}


def evaluate(node: Node, env: dict[str, int | float]) -> int | float:
    """Compute the value of a tree, looking variables up in env."""
    match node:
        case Num(value):
            return value
        case Name(name) if name in env:
            return env[name]
        case Name(name):
            raise EvalError(f"unknown variable {name!r}", node.pos)
        case UnaryOp("-", operand):
            return -evaluate(operand, env)
        case UnaryOp("+", operand):
            return evaluate(operand, env)
        case BinOp(op, left, right):
            a, b = evaluate(left, env), evaluate(right, env)
            try:
                result = OPERATORS[op](a, b)
            except ZeroDivisionError:
                raise EvalError("division by zero", node.pos) from None
            except OverflowError:
                raise EvalError("number too large", node.pos) from None
            if isinstance(result, complex):
                raise EvalError("result is a complex number", node.pos)
            return result
        case Assign(name, value):
            env[name] = evaluate(value, env)
            return env[name]
    raise TypeError(f"not a node: {node!r}")


CONSTANTS = {"pi": math.pi, "e": math.e, "tau": math.tau}


def evaluate_lines(text: str) -> list[str]:
    """Run every line of text in one shared environment, collecting a report per line."""
    env = dict(CONSTANTS)
    reports = []
    for line in text.splitlines():
        if not line.strip() or line.lstrip().startswith("#"):
            continue
        try:
            tree = parse(line)
            value = evaluate(tree, env)
        except CalcError as err:
            reports.append(f"{line}\n{' ' * err.pos}^ {err}")
        else:
            reports.append(f"{tree.name} = {value}" if isinstance(tree, Assign) else str(value))
    return reports
```

```python tests
import math

@test("assignments and expressions share one environment")
def _():
    eq(evaluate_lines("a = 2\nb = a * 3\na + b"), ["a = 2", "b = 6", "8"])

@test("blank lines and comments produce no reports")
def _():
    eq(evaluate_lines("\n# setup\nx = 1\n\n   # an indented comment\nx + 1\n"), ["x = 1", "2"])

@test("pi, e and tau are predefined")
def _():
    eq(evaluate_lines("pi\ne\ntau"), [str(math.pi), str(math.e), str(math.tau)])

@test("an error points at its column, and the session carries on")
def _():
    eq(evaluate_lines("1 / 0\n2 + 2"), ["1 / 0\n  ^ division by zero", "4"])

@test("errors from every stage are reported")
def _():
    eq(evaluate_lines("4 $ 2"), ["4 $ 2\n  ^ unexpected character '$'"])
    eq(evaluate_lines("2 * (3 + 4"), ["2 * (3 + 4\n          ^ expected ')', found end of input"])
    eq(evaluate_lines("radius * 2"), ["radius * 2\n^ unknown variable 'radius'"])

@test("a failed assignment keeps the old value")
def _():
    eq(evaluate_lines("x = 1\nx = 1 / 0\nx"), ["x = 1", "x = 1 / 0\n      ^ division by zero", "1"])

@test("each call starts a fresh session")
def _():
    evaluate_lines("y = 5")
    eq(evaluate_lines("y"), ["y\n^ unknown variable 'y'"])

@test("assigning to a constant doesn't change CONSTANTS")
def _():
    eq(evaluate_lines("pi = 3\npi"), ["pi = 3", "3"])
    eq(evaluate_lines("pi"), [str(math.pi)])
    eq(CONSTANTS["pi"], math.pi)

@test("a whole session")
def _():
    session = """
r = 2.5
area = pi * r ^ 2
-2 ^ 2 + 2 ^ 3 ^ 2
area / (r - 2.5)
2 ^ 100
"""
    eq(evaluate_lines(session), [
        "r = 2.5",
        "area = 19.634954084936208",
        "508",
        "area / (r - 2.5)\n     ^ division by zero",
        "1267650600228229401496703205376",
    ])
```

```hint
Start each call with `env = dict(CONSTANTS)`, then loop over `text.splitlines()`. `line.strip()` is empty for blank lines, and `line.lstrip().startswith("#")` spots comments.
```

```hint
Put `tree = parse(line)` and `value = evaluate(tree, env)` in one `try`, catch `CalcError`, and append the success report in the `else:` block.
```

```hint
The error report is `f"{line}\n{' ' * err.pos}^ {err}"`. For the success report, `isinstance(tree, Assign)` tells you whether to write `f"{tree.name} = {value}"` or `str(value)`.
```
:::

## Where to take it next

The pipeline is easy to extend, because each feature touches each stage in a predictable way: maybe a token, then a grammar rule and a node class, then a `case`.

- **Functions.** In `atom()`, a `NAME` followed by `(` starts a call. Parse comma-separated arguments into a `Call(name, args)` node and evaluate it against a table like `{"sqrt": math.sqrt, "max": max}`.
- **Exact decimals.** Turn `NUMBER` tokens into `Fraction` or `Decimal` values, and `0.1 + 0.2` becomes exactly `0.3` ([Numbers & Math](lesson:numbers-and-math#0-1-0-2-decimal-and-fraction)).
- **Comparisons.** Add `<`, `==` and friends as a new, loosest precedence level, plus a conditional expression.
- **A REPL.** `input()` isn't available in the browser sandbox, but on your machine the whole interactive loop is a few lines:

```python
def repl() -> None:
    env = dict(CONSTANTS)
    while True:
        try:
            line = input("calc> ")
        except EOFError:                        # Ctrl-D ends the session
            break
        try:
            print(evaluate(parse(line), env))
        except CalcError as err:
            print(" " * (err.pos + len("calc> ")) + f"^ {err}")
```

## Cheat sheet

| JavaScript | Python | Notes |
| --- | --- | --- |
| `/(?<NUM>\d+)/` | `r"(?P<NUM>\d+)"` | `re` rejects the JS spelling of named groups |
| find the group that isn't `undefined` | `m.lastgroup` | one named group per alternative |
| `s.matchAll(re)`, `m.index` | `pattern.finditer(s)`, `m.start()` | no `g` flag; unmatched text is skipped silently |
| a class per AST node | `@dataclass(frozen=True)` per node | `==`, `repr()` and `hash()` come generated |
| `toMatchObject()` to ignore positions | `field(compare=False)` on `pos` | then plain `==` compares trees |
| `switch (node.type)` | `match node:` / `case BinOp(op, left, right):` | 3.10+; positional via `__match_args__` |
| `if` inside a `case` | `case Name(name) if name in env:` | a guard |
| `{ "+": (a, b) => a + b }` | `{"+": operator.add}` | the `operator` module |
| `1 / 0` is `Infinity` | `ZeroDivisionError` | translate with `raise EvalError(...) from None` |
| `(-8) ** 0.5` is `NaN` | a `complex` result | check `isinstance(result, complex)` |
| `-2 ** 2` is a SyntaxError | `-2 ** 2 == -4` | `**` binds tighter than unary minus |
| `catch (e) { if (!(e instanceof X)) throw e; }` | `except X:` | plus `else:` for the success path |
| `{ ...CONSTANTS }` | `dict(CONSTANTS)` | or layer with `ChainMap({}, CONSTANTS)` |
