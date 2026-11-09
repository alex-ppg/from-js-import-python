---
title: Build a Markdown-to-HTML Converter
part: Interpreters & Text
summary: Escaping, inline spans with re.sub callbacks, a line-based state machine and a streaming generator pipeline.
minutes: 90
---

Markdown is a good first text format to implement: small enough to finish in an afternoon, messy enough to need real techniques. You'll write a converter for its everyday subset (headings, paragraphs, emphasis, code, links, lists, quotes and fenced code) in about 120 lines.

The work splits in two. **Inline** formatting, inside a single line, is a job for regular expressions: one `re.sub` call with a callback that builds the HTML for each span. **Block** structure, deciding which lines form a paragraph, a list or a code block, is a job for a line-by-line state machine. You'll write it as a generator, so HTML streams out while the input is still being read.

## What you'll build

By the end of step 6, `render(markdown)` turns a document into HTML:

````python
DOC = """\
# Release notes

Version **2.0** is *finally* out. Details are in the
[changelog](https://example.com/changes?v=2&lang=en).

## Highlights

- Faster `render()` calls
- Safer output: <script> tags are escaped
- Quotes can hold **any** Markdown

> **Upgrading?** Two steps:
>
> 1. Update the package
> 2. Run the tests

```python
print("<b>not bold</b>")
```
"""

print(render(DOC))
````

It prints:

```html
<h1>Release notes</h1>
<p>Version <strong>2.0</strong> is <em>finally</em> out. Details are in the <a href="https://example.com/changes?v=2&amp;lang=en">changelog</a>.</p>
<h2>Highlights</h2>
<ul>
<li>Faster <code>render()</code> calls</li>
<li>Safer output: &lt;script&gt; tags are escaped</li>
<li>Quotes can hold <strong>any</strong> Markdown</li>
</ul>
<blockquote>
<p><strong>Upgrading?</strong> Two steps:</p>
<ol>
<li>Update the package</li>
<li>Run the tests</li>
</ol>
</blockquote>
<pre><code class="language-python">print("&lt;b&gt;not bold&lt;/b&gt;")</code></pre>
```

:::deep Spoiler: run the finished converter
This is the whole converter you'll write, piece by piece, in the steps below. Open it to try your own Markdown first: edit the document at the bottom and run it again.

````python run
import html
import re
from collections.abc import Iterable, Iterator
from dataclasses import dataclass, field


def escape(text: str) -> str:
    """Escape &, < and > so text displays literally between HTML tags."""
    return html.escape(text, quote=False)


INLINE = re.compile(r"""
    `(?P<code>[^`]+)`                              # `code`
  | \*\*(?P<strong>\S.*?)(?<=\S)\*\*               # **strong**
  | \*(?P<em>[^\s*][^*]*)(?<=[^\s*])\*             # *em*
  | \[(?P<label>[^\]]+)\]\((?P<href>[^)\s]+)\)     # [label](href)
""", re.VERBOSE)


def inline(text: str) -> str:
    """Render the inline Markdown in one line of text."""
    return render_spans(escape(text))


def render_spans(escaped: str) -> str:
    """Render the spans in text that's already escaped, nested ones included."""
    return INLINE.sub(render_span, escaped)


def render_span(m: re.Match[str]) -> str:
    """The HTML for one match of INLINE."""
    if m["code"] is not None:
        return f"<code>{m['code']}</code>"
    if m["strong"] is not None:
        return f"<strong>{render_spans(m['strong'])}</strong>"
    if m["em"] is not None:
        return f"<em>{render_spans(m['em'])}</em>"
    href = m["href"].replace('"', "&quot;")  # attribute values need quotes escaped too
    return f'<a href="{href}">{render_spans(m["label"])}</a>'


def classify(line: str) -> tuple[str, str]:
    """Return (kind, content) for one line of Markdown.

    kind is "blank", "fence", "h1" to "h6", "ul", "ol", "blockquote" or "p".
    """
    if not line.strip():
        return "blank", ""
    if line.startswith("```"):
        return "fence", line[3:].strip()
    if m := re.match(r"(#{1,6})\s+(.*)", line):
        return f"h{len(m[1])}", m[2].strip()
    if m := re.match(r"[-*+]\s+(.*)", line):
        return "ul", m[1].strip()
    if m := re.match(r"\d+[.)]\s+(.*)", line):
        return "ol", m[1].strip()
    if line.startswith(">"):
        return "blockquote", line[1:].removeprefix(" ")
    return "p", line.strip()


@dataclass
class Block:
    kind: str  # the HTML tag: p, h1 to h6, ul, ol, blockquote or pre
    lines: list[str] = field(default_factory=list)
    lang: str = ""  # fenced code only


def parse_blocks(lines: Iterable[str]) -> Iterator[Block]:
    """Group lines into blocks, yielding each block as soon as it's complete."""
    block = None
    for line in lines:
        if block is not None and block.kind == "pre":
            if line.startswith("```"):  # the closing fence
                yield block
                block = None
            else:
                block.lines.append(line)
            continue
        kind, text = classify(line)
        if block is not None and block.kind == kind:
            block.lines.append(text)  # the line continues the current block
            continue
        if block is not None:
            yield block
            block = None
        match kind:
            case "blank":
                pass
            case "fence":
                block = Block("pre", lang=text)
            case "h1" | "h2" | "h3" | "h4" | "h5" | "h6":
                yield Block(kind, [text])
            case _:
                block = Block(kind, [text])
    if block is not None:
        yield block


def render_block(block: Block) -> str:
    """Render one block as HTML."""
    match block:
        case Block("pre", lines, lang):
            attr = f' class="language-{html.escape(lang)}"' if lang else ""
            code = escape("\n".join(lines))
            return f"<pre><code{attr}>{code}</code></pre>"
        case Block("ul" | "ol" as tag, items):
            body = "".join(f"<li>{inline(item)}</li>\n" for item in items)
            return f"<{tag}>\n{body}</{tag}>"
        case Block("blockquote", lines):
            inner = "\n".join(render_lines(lines))
            return f"<blockquote>\n{inner}\n</blockquote>"
        case Block(tag, lines):  # p and h1 to h6
            return f"<{tag}>{inline(' '.join(lines))}</{tag}>"


def render_lines(lines: Iterable[str]) -> Iterator[str]:
    """Render Markdown lines (with or without line endings) to HTML, one block at a time."""
    stripped = (line.rstrip("\n") for line in lines)
    for block in parse_blocks(stripped):
        yield render_block(block)


def render(markdown: str) -> str:
    """Convert a Markdown document to HTML."""
    return "\n".join(render_lines(markdown.splitlines()))


# ---- try it --------------------------------------------------------------

DOC = """\
# Release notes

Version **2.0** is *finally* out. Details are in the
[changelog](https://example.com/changes?v=2&lang=en).

## Highlights

- Faster `render()` calls
- Safer output: <script> tags are escaped
- Quotes can hold **any** Markdown

> **Upgrading?** Two steps:
>
> 1. Update the package
> 2. Run the tests

```python
print("<b>not bold</b>")
```
"""

print(render(DOC))
````
:::

Real Markdown, as specified by CommonMark, has many more rules: nested lists, "lazy" continuation lines, backslash escapes, and pages of precedence rules for `*`. That's why production renderers run to thousands of lines. This one keeps a single, simple rule per construct.

| Markdown | HTML |
| --- | --- |
| `# Title` to `###### Title` | `<h1>` to `<h6>` |
| consecutive lines of text | one `<p>`, lines joined with spaces |
| `- item`, `* item` or `+ item` | `<ul>` with one `<li>` per item |
| `1. item` or `1) item` | `<ol>` with one `<li>` per item |
| `> quoted` | `<blockquote>`, its content rendered as Markdown |
| a fence of three backticks, with an optional language | `<pre><code>`, content kept verbatim |
| `` `code` ``, `**strong**`, `*em*`, `[label](url)` | `<code>`, `<strong>`, `<em>`, `<a href="url">` |

Everything else, raw HTML included, is escaped and shown as text.

## How the pieces fit

```text
markdown text  (or any iterable of lines: a list, an open file)
    │
    │  classify(line)    "## Install" → ("h2", "Install")                step 3
    ▼
parse_blocks()           lines → Block("h2", ["Install"]), ...           step 4
    │                    a generator: each block leaves once complete
    ▼
render_block()           Block → "<h2>Install</h2>"                      step 5
    │                    text goes through inline():                     steps 1, 2
    │                    "**hi** <you>" → "<strong>hi</strong> &lt;you&gt;"
    ▼
render_lines()           one chunk of HTML per block, lazily             step 6
render()                 "\n".join(...) of those chunks
```

| Step | You write | The Python it leans on |
| --- | --- | --- |
| 1 | `escape()`, and `inline()` for code spans and links | `html.escape`, `re.sub` with a function ([Strings](lesson:strings#replacing-with-sub)) |
| 2 | strong, emphasis and nested spans | lazy quantifiers, recursion through a callback |
| 3 | `classify()` | `re.match` with the walrus, `str.removeprefix` ([Control Flow](lesson:control-flow#the-walrus-operator)) |
| 4 | `parse_blocks()` | a generator as a state machine ([Iterators & Generators](lesson:iterators-and-generators#generator-functions-yield-function)) |
| 5 | `render_block()` | class patterns with literals, `\|` and `as` ([Pattern Matching](lesson:pattern-matching#class-patterns)) |
| 6 | `render_lines()`, `render()` and blockquotes | generator pipelines, files as iterables of lines ([Iterators & Generators](lesson:iterators-and-generators#lazy-pipelines-and-the-es2025-iterator-helpers)) |

Every step's starter contains the reference solution of all the earlier steps, so you can start at any step. Each step's tests focus on the piece you add.

## Step 1: Escaping, code and links

Every piece of text that lands in the HTML must be escaped, or a `<` in the input becomes a tag in the output. Python ships the function for it. JavaScript doesn't, outside the DOM, so JS projects tend to grow their own chain of replacements:

:::compare Escaping HTML
```js
const escapeHtml = (text) =>
  text.replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;");
```
```python
import html

html.escape(text, quote=False)    # & < >
html.escape(text)                 # & < > " ', for attribute values
```
:::

The order matters if you write it by hand: `&` has to go first, or the `&` of every `&lt;` gets escaped again. The `quote` flag picks the context. Text between tags only needs `&`, `<` and `>`, while an attribute value also needs its quote characters escaped.

```python run
import html

def escape_in_wrong_order(text):
    return text.replace("<", "&lt;").replace(">", "&gt;").replace("&", "&amp;")

print(escape_in_wrong_order("a < b"))           # the & of &lt; got escaped again
print(html.escape("a < b & 'c'", quote=False))
print(html.escape('say "hi"'))                  # quote=True is the default
```

Spans are a job for `re.sub` with a function as the replacement. The function is called once per match and returns the replacement text, as in JavaScript:

:::compare A replacement function
```js
text.replace(/`([^`]+)`/g, (match, code) => `<code>${code}</code>`);
```
```python
re.sub(r"`([^`]+)`", lambda m: f"<code>{m[1]}</code>", text)
```
:::

Python passes the function a single `Match` object instead of JavaScript's `(match, p1, p2, ..., offset, string)` argument list, and `re.sub` replaces every match without needing a `g` flag ([Replacing with `sub`](lesson:strings#replacing-with-sub)). The converter uses one combined pattern, `INLINE`, with an alternative per kind of span, and one callback, `render_span()`, that checks which group matched. Every span is then found in a single left-to-right pass, and once a code span has matched, its contents are never looked at again, so `` `**literal**` `` stays literal.

`inline()` escapes the whole line **first** and runs the pattern over the escaped text. Escaping doesn't touch any of Markdown's punctuation (`` ` ``, `*`, `[`, `]`, `(` and `)`), so the pattern still matches, and every character of text in the output is escaped exactly once, inside a span or not. The one gap is attribute values: an `href` also needs its `"` escaped, so the link branch of the callback does that itself.

:::gotcha Escaping isn't sanitizing
`[click](javascript:alert(1))` still renders as a working `javascript:` link. Escaping stops injected tags, not dangerous URLs. A renderer for untrusted input also needs an allowlist of URL schemes, such as `http`, `https` and `mailto`.
:::

:::challenge id=md-step-1 title="Step 1: Escape text, render code and links" difficulty=easy
Write the first version of the inline renderer:

- `escape(text)` escapes `&`, `<` and `>`, and leaves quotes alone.
- `INLINE` matches two kinds of span, each in a named group: a **code span**, `` `code` ``, which is one or more characters other than a backtick between backticks, and a **link**, `[label](href)`, where the label can't contain `]` and the href can't contain `)` or whitespace.
- `inline(text)` escapes the text, then replaces every span using `render_span()`.
- `render_span(m)` returns `<code>...</code>` for a code span and `<a href="...">label</a>` for a link, with any `"` in the href escaped as `&quot;`.

Anything that doesn't form a complete span stays as escaped text.

```text
>>> inline("run `pip install` & see [the docs](https://docs.python.org/3/)")
'run <code>pip install</code> &amp; see <a href="https://docs.python.org/3/">the docs</a>'
```

```python starter
import html
import re


def escape(text: str) -> str:
    """Escape &, < and > so text displays literally between HTML tags."""
    ...


INLINE = re.compile(r"""
    `(?P<code> ... )`                           # `code`
  | \[(?P<label> ... )\]\((?P<href> ... )\)     # [label](href)
""", re.VERBOSE)


def inline(text: str) -> str:
    """Render the inline Markdown in one line of text."""
    ...


def render_span(m: re.Match[str]) -> str:
    """The HTML for one match of INLINE."""
    ...
```

```python solution
import html
import re


def escape(text: str) -> str:
    """Escape &, < and > so text displays literally between HTML tags."""
    return html.escape(text, quote=False)


INLINE = re.compile(r"""
    `(?P<code>[^`]+)`                              # `code`
  | \[(?P<label>[^\]]+)\]\((?P<href>[^)\s]+)\)     # [label](href)
""", re.VERBOSE)


def inline(text: str) -> str:
    """Render the inline Markdown in one line of text."""
    return INLINE.sub(render_span, escape(text))


def render_span(m: re.Match[str]) -> str:
    """The HTML for one match of INLINE."""
    if m["code"] is not None:
        return f"<code>{m['code']}</code>"
    href = m["href"].replace('"', "&quot;")  # attribute values need quotes escaped too
    return f'<a href="{href}">{m["label"]}</a>'
```

```python tests
@test("escape() escapes &, < and >")
def _():
    eq(escape("<b>Fish & Chips</b>"), "&lt;b&gt;Fish &amp; Chips&lt;/b&gt;")

@test("escape() leaves quotes alone")
def _():
    eq(escape('She said "hi", it\'s fine'), 'She said "hi", it\'s fine')

@test("plain text comes back escaped")
def _():
    eq(inline("just text"), "just text")
    eq(inline("1 < 2 && 3 > 2"), "1 &lt; 2 &amp;&amp; 3 &gt; 2")

@test("code spans")
def _():
    eq(inline("run `pip install` first"), "run <code>pip install</code> first")
    eq(inline("`a` and `b`"), "<code>a</code> and <code>b</code>")

@test("code spans are escaped, and otherwise literal")
def _():
    eq(inline("`<div>`"), "<code>&lt;div&gt;</code>")
    eq(inline("`[not](a-link)`"), "<code>[not](a-link)</code>")

@test("links")
def _():
    eq(inline("see [the docs](https://docs.python.org/3/)"),
       'see <a href="https://docs.python.org/3/">the docs</a>')

@test("link labels and URLs are escaped")
def _():
    eq(inline("[Q&A](/search?q=a&page=2)"), '<a href="/search?q=a&amp;page=2">Q&amp;A</a>')
    eq(inline('[x](/say"hi")'), '<a href="/say&quot;hi&quot;">x</a>')

@test("incomplete spans stay as text")
def _():
    eq(inline("a ` b"), "a ` b")
    eq(inline("[label] (url)"), "[label] (url)")
    eq(inline("[label](has space)"), "[label](has space)")
```

```hint
`escape()` is one call: `html.escape(text, quote=False)`.
```

```hint
The pattern's two alternatives are `` `(?P<code>[^`]+)` `` and `\[(?P<label>[^\]]+)\]\((?P<href>[^)\s]+)\)`. Then `inline()` is `INLINE.sub(render_span, escape(text))`.
```

```hint
In `render_span()`, `m["code"]` is `None` unless the code alternative matched. If it's not a code span, it's a link: read `m["label"]` and `m["href"]`, and `.replace('"', "&quot;")` the href.
```
:::

## Step 2: Strong, emphasis and nesting

Two more alternatives join `INLINE`: `**strong**` and `*em*`. They take more care than code spans, for three reasons.

**Greed.** `+` and `*` are greedy in Python regexes, exactly as in JavaScript ones: `\*(.+)\*` on `*a* and *b*` runs from the first star to the *last*. A lazy quantifier, `+?` or `*?`, matches as little as it can. The replacement syntax is the only difference: `\1` where JavaScript writes `$1`.

:::compare Greedy and lazy
```js
"*a* and *b*".replace(/\*(.+)\*/g, "<em>$1</em>");    // "<em>a* and *b</em>"
"*a* and *b*".replace(/\*(.+?)\*/g, "<em>$1</em>");   // "<em>a</em> and <em>b</em>"
```
```python
re.sub(r"\*(.+)\*", r"<em>\1</em>", "*a* and *b*")    # '<em>a* and *b</em>'
re.sub(r"\*(.+?)\*", r"<em>\1</em>", "*a* and *b*")   # '<em>a</em> and <em>b</em>'
```
:::

**Flanking.** `2 * 3 * 4` contains no emphasis, because its stars don't touch any words. Requiring the content to start and end with a non-space character captures that rule well enough. The start is easy: begin the group with `\S`. For the end, a **lookbehind**, `(?<=\S)`, checks the character just before the closing marker without consuming it. For `*em*`, ruling out `*` inside the content as well keeps a lone star from pairing up with half of a `**`:

```python run
import re

loose = re.compile(r"\*(.+?)\*")
hugging = re.compile(r"\*([^\s*][^*]*)(?<=[^\s*])\*")

for text in ["*a* and *b*", "2 * 3 * 4", "*one word*", "*trailing *"]:
    before, after = loose.sub(r"<em>\1</em>", text), hugging.sub(r"<em>\1</em>", text)
    print(f"{text!r:14} {before!r:30} {after!r}")
```

**Nesting.** `**really *very* bold**` has a span inside a span. The callback handles that by running the same substitution over each span's content. The content has already been escaped, so the recursion must not escape it again. That's why `inline()` splits into `escape()`, run once, and a `render_spans()` helper that `render_span()` calls on the inner text. The recursion is only as deep as the spans are nested.

Put the strong alternative before the em one. At a `**`, the alternatives are tried in order, and a looser em pattern could otherwise claim the first star.

:::quiz output
What does this print?

```python
import re
print(re.sub(r"\*\*(.+)\*\*", r"[\1]", "**a** and **b**"))
```

- [ ] `[a] and [b]`
- [x] `[a** and **b]`
- [ ] `**a** and **b**`

`.+` is greedy: it runs to the end of the string and backs off only as far as the last `**`. With `.+?`, the result would be `[a] and [b]`.
:::

:::challenge id=md-step-2 title="Step 2: Strong, emphasis and nested spans" difficulty=medium
Extend the inline renderer:

- `**strong**` renders as `<strong>` and `*em*` as `<em>`.
- The content of either must start and end with a non-space character, so `2 * 3 * 4` and `** spaced **` stay as they are. The content of `*em*` can't contain `*`.
- The content of strong, em and link labels can hold other spans, which are rendered too. Code spans stay literal.
- Unclosed markers stay as text, and everything is still escaped exactly once.

```text
>>> inline("**really *very* bold** and [*docs*](/help)")
'<strong>really <em>very</em> bold</strong> and <a href="/help"><em>docs</em></a>'
```

```python starter
import html
import re


def escape(text: str) -> str:
    """Escape &, < and > so text displays literally between HTML tags."""
    return html.escape(text, quote=False)


INLINE = re.compile(r"""
    `(?P<code>[^`]+)`                              # `code`
    # TODO (step 2): alternatives for **strong** and *em*
  | \[(?P<label>[^\]]+)\]\((?P<href>[^)\s]+)\)     # [label](href)
""", re.VERBOSE)


def inline(text: str) -> str:
    """Render the inline Markdown in one line of text."""
    return INLINE.sub(render_span, escape(text))


def render_span(m: re.Match[str]) -> str:
    """The HTML for one match of INLINE."""
    if m["code"] is not None:
        return f"<code>{m['code']}</code>"
    # TODO (step 2): strong and em, with any spans inside them rendered too
    href = m["href"].replace('"', "&quot;")  # attribute values need quotes escaped too
    return f'<a href="{href}">{m["label"]}</a>'
```

```python solution
import html
import re


def escape(text: str) -> str:
    """Escape &, < and > so text displays literally between HTML tags."""
    return html.escape(text, quote=False)


INLINE = re.compile(r"""
    `(?P<code>[^`]+)`                              # `code`
  | \*\*(?P<strong>\S.*?)(?<=\S)\*\*               # **strong**
  | \*(?P<em>[^\s*][^*]*)(?<=[^\s*])\*             # *em*
  | \[(?P<label>[^\]]+)\]\((?P<href>[^)\s]+)\)     # [label](href)
""", re.VERBOSE)


def inline(text: str) -> str:
    """Render the inline Markdown in one line of text."""
    return render_spans(escape(text))


def render_spans(escaped: str) -> str:
    """Render the spans in text that's already escaped, nested ones included."""
    return INLINE.sub(render_span, escaped)


def render_span(m: re.Match[str]) -> str:
    """The HTML for one match of INLINE."""
    if m["code"] is not None:
        return f"<code>{m['code']}</code>"
    if m["strong"] is not None:
        return f"<strong>{render_spans(m['strong'])}</strong>"
    if m["em"] is not None:
        return f"<em>{render_spans(m['em'])}</em>"
    href = m["href"].replace('"', "&quot;")  # attribute values need quotes escaped too
    return f'<a href="{href}">{render_spans(m["label"])}</a>'
```

```python tests
@test("strong and emphasis")
def _():
    eq(inline("**bold** move"), "<strong>bold</strong> move")
    eq(inline("an *emphatic* claim"), "an <em>emphatic</em> claim")

@test("several spans on one line")
def _():
    eq(inline("*a*, **b** and `c`"), "<em>a</em>, <strong>b</strong> and <code>c</code>")
    eq(inline("**a** then **b**"), "<strong>a</strong> then <strong>b</strong>")

@test("emphasis inside strong")
def _():
    eq(inline("**really *very* bold**"), "<strong>really <em>very</em> bold</strong>")

@test("spans inside link labels")
def _():
    eq(inline("[**PEP 8**](https://peps.python.org/pep-0008/)"),
       '<a href="https://peps.python.org/pep-0008/"><strong>PEP 8</strong></a>')

@test("code inside emphasis and strong")
def _():
    eq(inline("*use `uv`*"), "<em>use <code>uv</code></em>")
    eq(inline("**`git push --force`**"), "<strong><code>git push --force</code></strong>")

@test("code spans stay literal")
def _():
    eq(inline("`**not bold**`"), "<code>**not bold**</code>")

@test("markers must touch the text")
def _():
    eq(inline("2 * 3 * 4"), "2 * 3 * 4")
    eq(inline("** spaced **"), "** spaced **")

@test("unclosed markers stay as text")
def _():
    eq(inline("**almost"), "**almost")
    eq(inline("a *b"), "a *b")

@test("text inside spans is escaped exactly once")
def _():
    eq(inline("**<b> & co**"), "<strong>&lt;b&gt; &amp; co</strong>")
```

```hint
Add `\*\*(?P<strong>\S.*?)(?<=\S)\*\*` before the em alternative. `\S` makes the content start on a non-space, the lazy `.*?` stops at the first `**` that can close it, and the lookbehind `(?<=\S)` checks that the content ends on a non-space.
```

```hint
For em, also keep stars out of the content: `\*(?P<em>[^\s*][^*]*)(?<=[^\s*])\*`.
```

```hint
Move the `INLINE.sub(render_span, ...)` call into a `render_spans(escaped)` helper, have `inline()` call it on `escape(text)`, and call it again from `render_span()` on `m["strong"]`, `m["em"]` and `m["label"]`.
```
:::

## Step 3: Classifying lines

Block structure is decided line by line, and the first question to ask about a line is what kind it is. `classify()` answers with a `(kind, content)` tuple. The kind is the HTML tag the line contributes to, or one of two markers, `"blank"` and `"fence"`. The content is the line without its Markdown prefix:

```text
"## Install"          ->  ("h2", "Install")
"- milk"              ->  ("ul", "milk")
"3. Bake"             ->  ("ol", "Bake")
"> quoted *text*"     ->  ("blockquote", "quoted *text*")
"```python"           ->  ("fence", "python")
"   "                 ->  ("blank", "")
"  Just some text."   ->  ("p", "Just some text.")
```

Each check is a regex anchored at the start of the line, and the walrus operator tests a match and keeps it in one step, which JavaScript does with an assignment inside the `if`:

:::compare Test a pattern and keep the match
```js
let m;
if ((m = line.match(/^(\w+): (.*)$/))) {
  headers[m[1].toLowerCase()] = m[2];
} else if (line.startsWith("#")) {
  comments.push(line.slice(1).trimStart());
}
```
```python
if m := re.match(r"(\w+): (.*)", line):
    headers[m[1].lower()] = m[2]
elif line.startswith("#"):
    comments.append(line[1:].lstrip())
```
:::

`re.match` only matches at the **start** of the string, which is exactly what a line prefix needs. That's the opposite of JavaScript's `line.match(re)`, which searches the whole line unless the pattern starts with `^`. Reach for `re.search` out of JS habit and `"Use # for headings"` turns into a heading ([`search`, `match` and `fullmatch`](lesson:strings#search-match-and-fullmatch)).

One subtlety: `* eggs` is a bullet, but `*Note:* hot` is a paragraph that happens to start with emphasis. Requiring whitespace after the marker tells them apart, and it does the same job for headings, since `#hashtag` isn't one.

:::quiz output
What does this print?

```python
print(repr("##Title".strip("#")), repr("##Title".removeprefix("#")))
```

- [ ] `'Title' 'Title'`
- [x] `'Title' '#Title'`
- [ ] `'#Title' '#Title'`

`strip("#")` removes every `#` from both ends, while `removeprefix("#")` removes the prefix once, if it's there. Blockquotes need the second kind: `> > nested` loses its first `>` and keeps the rest for the nested quote. See [Trimming strips characters, not prefixes](lesson:strings#trimming-strips-characters-not-prefixes).
:::

:::challenge id=md-step-3 title="Step 3: Classify each line" difficulty=easy
Write `classify(line)`, which returns a `(kind, content)` tuple. Check for these, in this order:

| Line | kind | content |
| --- | --- | --- |
| empty, or only whitespace | `"blank"` | `""` |
| starts with three backticks | `"fence"` | the rest of the line, stripped (the language) |
| 1 to 6 `#`, then whitespace | `"h1"` to `"h6"` | the rest, stripped |
| `-`, `*` or `+`, then whitespace | `"ul"` | the rest, stripped |
| digits, then `.` or `)`, then whitespace | `"ol"` | the rest, stripped |
| starts with `>` | `"blockquote"` | the rest, minus at most one leading space |
| anything else | `"p"` | the whole line, stripped |

Markers only count at the very start of the line.

```python starter
import html
import re


def escape(text: str) -> str:
    """Escape &, < and > so text displays literally between HTML tags."""
    return html.escape(text, quote=False)


INLINE = re.compile(r"""
    `(?P<code>[^`]+)`                              # `code`
  | \*\*(?P<strong>\S.*?)(?<=\S)\*\*               # **strong**
  | \*(?P<em>[^\s*][^*]*)(?<=[^\s*])\*             # *em*
  | \[(?P<label>[^\]]+)\]\((?P<href>[^)\s]+)\)     # [label](href)
""", re.VERBOSE)


def inline(text: str) -> str:
    """Render the inline Markdown in one line of text."""
    return render_spans(escape(text))


def render_spans(escaped: str) -> str:
    """Render the spans in text that's already escaped, nested ones included."""
    return INLINE.sub(render_span, escaped)


def render_span(m: re.Match[str]) -> str:
    """The HTML for one match of INLINE."""
    if m["code"] is not None:
        return f"<code>{m['code']}</code>"
    if m["strong"] is not None:
        return f"<strong>{render_spans(m['strong'])}</strong>"
    if m["em"] is not None:
        return f"<em>{render_spans(m['em'])}</em>"
    href = m["href"].replace('"', "&quot;")  # attribute values need quotes escaped too
    return f'<a href="{href}">{render_spans(m["label"])}</a>'


def classify(line: str) -> tuple[str, str]:
    """Return (kind, content) for one line of Markdown.

    kind is "blank", "fence", "h1" to "h6", "ul", "ol", "blockquote" or "p".
    """
    ...
```

```python solution
import html
import re


def escape(text: str) -> str:
    """Escape &, < and > so text displays literally between HTML tags."""
    return html.escape(text, quote=False)


INLINE = re.compile(r"""
    `(?P<code>[^`]+)`                              # `code`
  | \*\*(?P<strong>\S.*?)(?<=\S)\*\*               # **strong**
  | \*(?P<em>[^\s*][^*]*)(?<=[^\s*])\*             # *em*
  | \[(?P<label>[^\]]+)\]\((?P<href>[^)\s]+)\)     # [label](href)
""", re.VERBOSE)


def inline(text: str) -> str:
    """Render the inline Markdown in one line of text."""
    return render_spans(escape(text))


def render_spans(escaped: str) -> str:
    """Render the spans in text that's already escaped, nested ones included."""
    return INLINE.sub(render_span, escaped)


def render_span(m: re.Match[str]) -> str:
    """The HTML for one match of INLINE."""
    if m["code"] is not None:
        return f"<code>{m['code']}</code>"
    if m["strong"] is not None:
        return f"<strong>{render_spans(m['strong'])}</strong>"
    if m["em"] is not None:
        return f"<em>{render_spans(m['em'])}</em>"
    href = m["href"].replace('"', "&quot;")  # attribute values need quotes escaped too
    return f'<a href="{href}">{render_spans(m["label"])}</a>'


def classify(line: str) -> tuple[str, str]:
    """Return (kind, content) for one line of Markdown.

    kind is "blank", "fence", "h1" to "h6", "ul", "ol", "blockquote" or "p".
    """
    if not line.strip():
        return "blank", ""
    if line.startswith("```"):
        return "fence", line[3:].strip()
    if m := re.match(r"(#{1,6})\s+(.*)", line):
        return f"h{len(m[1])}", m[2].strip()
    if m := re.match(r"[-*+]\s+(.*)", line):
        return "ul", m[1].strip()
    if m := re.match(r"\d+[.)]\s+(.*)", line):
        return "ol", m[1].strip()
    if line.startswith(">"):
        return "blockquote", line[1:].removeprefix(" ")
    return "p", line.strip()
```

````python tests
@test("blank lines")
def _():
    eq(classify(""), ("blank", ""))
    eq(classify("   "), ("blank", ""))

@test("headings from h1 to h6")
def _():
    eq(classify("# Title"), ("h1", "Title"))
    eq(classify("###   Deeper  "), ("h3", "Deeper"))
    eq(classify("###### Six"), ("h6", "Six"))

@test("almost-headings are paragraphs")
def _():
    eq(classify("#hashtag"), ("p", "#hashtag"))
    eq(classify("####### Seven"), ("p", "####### Seven"))

@test("bullet items, with -, * or +")
def _():
    eq(classify("- milk"), ("ul", "milk"))
    eq(classify("* eggs"), ("ul", "eggs"))
    eq(classify("+ flour"), ("ul", "flour"))

@test("numbered items, with . or )")
def _():
    eq(classify("1. Preheat"), ("ol", "Preheat"))
    eq(classify("10) Serve"), ("ol", "Serve"))

@test("emphasis at the start of a line isn't a bullet")
def _():
    eq(classify("*Note:* hot"), ("p", "*Note:* hot"))
    eq(classify("**Bold** start"), ("p", "**Bold** start"))

@test("markers only count at the start of the line")
def _():
    eq(classify("Use # for headings"), ("p", "Use # for headings"))
    eq(classify("Tip: - is a bullet"), ("p", "Tip: - is a bullet"))
    eq(classify("A > B"), ("p", "A > B"))

@test("blockquotes keep their inner Markdown")
def _():
    eq(classify("> # Quoted heading"), ("blockquote", "# Quoted heading"))
    eq(classify(">tight"), ("blockquote", "tight"))
    eq(classify(">"), ("blockquote", ""))
    eq(classify("> > nested"), ("blockquote", "> nested"))
    eq(classify(">   indented code"), ("blockquote", "  indented code"))

@test("code fences, with an optional language")
def _():
    eq(classify("```"), ("fence", ""))
    eq(classify("```python"), ("fence", "python"))

@test("anything else is paragraph text, stripped")
def _():
    eq(classify("  Just some text.  "), ("p", "Just some text."))
````

```hint
`if not line.strip():` catches blank lines. `line.startswith("```")` catches fences, and `line[3:].strip()` is the language.
```

```hint
`re.match` anchors at the start, so `if m := re.match(r"(#{1,6})\s+(.*)", line):` matches headings, and `len(m[1])` is the level. Lists are similar, with `[-*+]` and `\d+[.)]` as the markers.
```

```hint
For quotes, `line[1:].removeprefix(" ")` drops the `>` and at most one space.
```
:::

## Step 4: A state machine that yields blocks

Classifying lines one at a time isn't enough: a paragraph is a *run* of text lines, a list is a run of items, and inside a code fence nothing is classified at all. `parse_blocks()` groups lines into `Block`s with a small state machine. Its state is the block it's currently collecting, or `None`.

In JavaScript you'd push each finished block onto an array and return the array. `parse_blocks()` is a generator instead: it `yield`s each block the moment it's complete, so a caller can render the first block before the last line has been read. A caller who wants a list writes `list(parse_blocks(lines))`, and a caller streaming a huge file never holds more than one block. A paragraphs-only version shows the shape:

:::compare A generator that groups lines
```js
function* paragraphs(lines) {
  let current = [];
  for (const line of lines) {
    if (line.trim()) {
      current.push(line);
    } else if (current.length) {
      yield current.join(" ");
      current = [];
    }
  }
  if (current.length) yield current.join(" ");
}
```
```python
def paragraphs(lines):
    current = []
    for line in lines:
        if line.strip():
            current.append(line)
        elif current:
            yield " ".join(current)
            current = []

    if current:
        yield " ".join(current)
```
:::

As in JavaScript, calling a generator function runs none of its body. The work happens one `yield` at a time, as the consumer asks for values, and the input is read only as far as the next block needs. Watch the reads interleave with the output:

```python run
def paragraphs(lines):
    current = []
    for line in lines:
        if line.strip():
            current.append(line)
        elif current:
            yield " ".join(current)
            current = []
    if current:
        yield " ".join(current)

def noisy(lines):
    for line in lines:
        print(f"  read {line!r}")
        yield line

blocks = paragraphs(noisy(["one", "two", "", "three"]))
print("first:", next(blocks))
print("rest:", list(blocks))
```

:::quiz output
What does this print?

```python
log = []

def blocks():
    log.append("started")
    yield "first block"

gen = blocks()
print(log)
```

- [x] `[]`
- [ ] `['started']`
- [ ] `['started', 'first block']`

Calling a generator function only creates the generator. Its body starts running at the first `next()`, so nothing has been logged yet. That's also why a generator that raises does so on iteration, not when you call it.
:::

The full state machine follows a handful of rules:

- Inside a fence, every line is code, kept exactly as written, until a closing fence.
- A line of the same kind as the current block (`p`, `ul`, `ol` or `blockquote`) continues it.
- Any other line first ends the current block, which is yielded. Then the line starts something new: a blank line starts nothing, a heading is a complete one-line block and is yielded at once, a fence opens a `pre` block, and anything else opens a block of its own kind.
- At the end of the input, whatever is still open is yielded. An unclosed fence runs to the end.

`Block` is provided: a dataclass with the `kind`, its `lines` and, for code, a `lang`. Its `lines` field uses `field(default_factory=list)`, so every block gets its own list ([Defaults and `field()`](lesson:dataclasses-and-enums#defaults-and-field)).

:::challenge id=md-step-4 title="Step 4: Group lines into blocks" difficulty=medium
Write `parse_blocks(lines)`, a generator that takes any iterable of lines (without line endings) and yields `Block`s according to the rules above:

- Text lines collect into one `Block("p", [...])`, list items into `Block("ul", ...)` or `Block("ol", ...)`, and quote lines into `Block("blockquote", ...)`. The lines hold the content from `classify()`.
- A heading becomes `Block("h1", ["Title"])` and is yielded as soon as its line is read.
- A fence collects the following lines verbatim into `Block("pre", lines, lang=...)`, until a line that starts with three backticks.
- Blank lines end blocks and produce nothing.

```text
>>> list(parse_blocks(["# Shopping", "Buy:", "- milk", "- eggs"]))
[Block(kind='h1', lines=['Shopping'], lang=''), Block(kind='p', lines=['Buy:'], lang=''),
 Block(kind='ul', lines=['milk', 'eggs'], lang='')]
```

```python starter
import html
import re
from collections.abc import Iterable, Iterator
from dataclasses import dataclass, field


def escape(text: str) -> str:
    """Escape &, < and > so text displays literally between HTML tags."""
    return html.escape(text, quote=False)


INLINE = re.compile(r"""
    `(?P<code>[^`]+)`                              # `code`
  | \*\*(?P<strong>\S.*?)(?<=\S)\*\*               # **strong**
  | \*(?P<em>[^\s*][^*]*)(?<=[^\s*])\*             # *em*
  | \[(?P<label>[^\]]+)\]\((?P<href>[^)\s]+)\)     # [label](href)
""", re.VERBOSE)


def inline(text: str) -> str:
    """Render the inline Markdown in one line of text."""
    return render_spans(escape(text))


def render_spans(escaped: str) -> str:
    """Render the spans in text that's already escaped, nested ones included."""
    return INLINE.sub(render_span, escaped)


def render_span(m: re.Match[str]) -> str:
    """The HTML for one match of INLINE."""
    if m["code"] is not None:
        return f"<code>{m['code']}</code>"
    if m["strong"] is not None:
        return f"<strong>{render_spans(m['strong'])}</strong>"
    if m["em"] is not None:
        return f"<em>{render_spans(m['em'])}</em>"
    href = m["href"].replace('"', "&quot;")  # attribute values need quotes escaped too
    return f'<a href="{href}">{render_spans(m["label"])}</a>'


def classify(line: str) -> tuple[str, str]:
    """Return (kind, content) for one line of Markdown.

    kind is "blank", "fence", "h1" to "h6", "ul", "ol", "blockquote" or "p".
    """
    if not line.strip():
        return "blank", ""
    if line.startswith("```"):
        return "fence", line[3:].strip()
    if m := re.match(r"(#{1,6})\s+(.*)", line):
        return f"h{len(m[1])}", m[2].strip()
    if m := re.match(r"[-*+]\s+(.*)", line):
        return "ul", m[1].strip()
    if m := re.match(r"\d+[.)]\s+(.*)", line):
        return "ol", m[1].strip()
    if line.startswith(">"):
        return "blockquote", line[1:].removeprefix(" ")
    return "p", line.strip()


@dataclass
class Block:
    kind: str  # the HTML tag: p, h1 to h6, ul, ol, blockquote or pre
    lines: list[str] = field(default_factory=list)
    lang: str = ""  # fenced code only


def parse_blocks(lines: Iterable[str]) -> Iterator[Block]:
    """Group lines into blocks, yielding each block as soon as it's complete."""
    ...
```

```python solution
import html
import re
from collections.abc import Iterable, Iterator
from dataclasses import dataclass, field


def escape(text: str) -> str:
    """Escape &, < and > so text displays literally between HTML tags."""
    return html.escape(text, quote=False)


INLINE = re.compile(r"""
    `(?P<code>[^`]+)`                              # `code`
  | \*\*(?P<strong>\S.*?)(?<=\S)\*\*               # **strong**
  | \*(?P<em>[^\s*][^*]*)(?<=[^\s*])\*             # *em*
  | \[(?P<label>[^\]]+)\]\((?P<href>[^)\s]+)\)     # [label](href)
""", re.VERBOSE)


def inline(text: str) -> str:
    """Render the inline Markdown in one line of text."""
    return render_spans(escape(text))


def render_spans(escaped: str) -> str:
    """Render the spans in text that's already escaped, nested ones included."""
    return INLINE.sub(render_span, escaped)


def render_span(m: re.Match[str]) -> str:
    """The HTML for one match of INLINE."""
    if m["code"] is not None:
        return f"<code>{m['code']}</code>"
    if m["strong"] is not None:
        return f"<strong>{render_spans(m['strong'])}</strong>"
    if m["em"] is not None:
        return f"<em>{render_spans(m['em'])}</em>"
    href = m["href"].replace('"', "&quot;")  # attribute values need quotes escaped too
    return f'<a href="{href}">{render_spans(m["label"])}</a>'


def classify(line: str) -> tuple[str, str]:
    """Return (kind, content) for one line of Markdown.

    kind is "blank", "fence", "h1" to "h6", "ul", "ol", "blockquote" or "p".
    """
    if not line.strip():
        return "blank", ""
    if line.startswith("```"):
        return "fence", line[3:].strip()
    if m := re.match(r"(#{1,6})\s+(.*)", line):
        return f"h{len(m[1])}", m[2].strip()
    if m := re.match(r"[-*+]\s+(.*)", line):
        return "ul", m[1].strip()
    if m := re.match(r"\d+[.)]\s+(.*)", line):
        return "ol", m[1].strip()
    if line.startswith(">"):
        return "blockquote", line[1:].removeprefix(" ")
    return "p", line.strip()


@dataclass
class Block:
    kind: str  # the HTML tag: p, h1 to h6, ul, ol, blockquote or pre
    lines: list[str] = field(default_factory=list)
    lang: str = ""  # fenced code only


def parse_blocks(lines: Iterable[str]) -> Iterator[Block]:
    """Group lines into blocks, yielding each block as soon as it's complete."""
    block = None
    for line in lines:
        if block is not None and block.kind == "pre":
            if line.startswith("```"):  # the closing fence
                yield block
                block = None
            else:
                block.lines.append(line)
            continue
        kind, text = classify(line)
        if block is not None and block.kind == kind:
            block.lines.append(text)  # the line continues the current block
            continue
        if block is not None:
            yield block
            block = None
        match kind:
            case "blank":
                pass
            case "fence":
                block = Block("pre", lang=text)
            case "h1" | "h2" | "h3" | "h4" | "h5" | "h6":
                yield Block(kind, [text])
            case _:
                block = Block(kind, [text])
    if block is not None:
        yield block
```

````python tests
def blocks(text):
    return list(parse_blocks(text.splitlines()))

@test("consecutive text lines form one paragraph, and blank lines separate")
def _():
    eq(blocks("one\ntwo\n\nthree"), [Block("p", ["one", "two"]), Block("p", ["three"])])

@test("headings are one-line blocks that interrupt paragraphs")
def _():
    eq(blocks("intro\n# Title\nmore"), [Block("p", ["intro"]), Block("h1", ["Title"]), Block("p", ["more"])])

@test("consecutive items form one list")
def _():
    eq(blocks("- a\n- b\n1. c\n2. d"), [Block("ul", ["a", "b"]), Block("ol", ["c", "d"])])

@test("a list right after a paragraph is a new block")
def _():
    eq(blocks("Buy:\n- milk"), [Block("p", ["Buy:"]), Block("ul", ["milk"])])

@test("quote lines are collected without their >")
def _():
    eq(blocks("> # Hi\n> there\n>\n> - item"), [Block("blockquote", ["# Hi", "there", "", "- item"])])

@test("fenced code keeps its lines verbatim")
def _():
    lines = ["```python", "# not a heading", "", "    x = 1  ", "- not a list", "```", "after"]
    eq(list(parse_blocks(lines)), [
        Block("pre", ["# not a heading", "", "    x = 1  ", "- not a list"], lang="python"),
        Block("p", ["after"]),
    ])

@test("an unclosed fence runs to the end")
def _():
    eq(blocks("```\ncode\n\nmore code"), [Block("pre", ["code", "", "more code"])])

@test("no lines, no blocks")
def _():
    eq(blocks(""), [])
    eq(blocks("\n\n"), [])

@test("yields each block as soon as it's complete")
def _():
    source = iter(["# Title", "body"])
    out = parse_blocks(source)
    eq(next(out), Block("h1", ["Title"]))
    eq(next(source, None), "body", "the heading should arrive before the next line is read")
````

```hint
Keep the block being collected in a variable, `block = None` to start. At the top of the loop, handle fenced code first: if `block` is a `pre` block, a line that starts with three backticks yields it and resets `block`, and any other line is appended unchanged.
```

```hint
Otherwise `kind, text = classify(line)`. If `block` has the same kind, append `text` and `continue`. If not, `yield block` (when there is one) before deciding what the new line starts.
```

```hint
A `match kind:` with `case "blank":`, `case "fence":` and `case "h1" | "h2" | ...:` reads well for the last decision. After the loop, yield the block that's still open.
```
:::

## Step 5: Rendering blocks

Each block becomes one chunk of HTML: inline formatting for text, escaping alone for code. A `match` statement with class patterns dispatches on the block's kind and unpacks its fields at the same time. A literal sub-pattern compares, `|` offers alternatives, and `as` captures whichever alternative matched:

:::compare Dispatch on a field, bind the rest
```js
switch (event.type) {
  case "keydown":
  case "keyup":
    return `${event.type} ${event.key}`;
  case "click":
    return `click at ${event.x},${event.y}`;
}
```
```python
match event:
    case Key("keydown" | "keyup" as kind, key):
        return f"{kind} {key}"

    case Click(x, y):
        return f"click at {x},{y}"
```
:::

`Block` is a dataclass, so `case Block("pre", lines, lang):` matches positionally through the generated `__match_args__`, just like the classes in [Pattern Matching](lesson:pattern-matching#class-patterns). Order the cases from specific to general: paragraphs and headings share one shape, `<tag>text</tag>`, so a final `case Block(tag, lines):` can handle all seven of them.

:::tip Build the string, then format it
`"".join(f"<li>{inline(item)}</li>\n" for item in items)` builds the list body in one expression. Code that needs a `"\n".join(...)` inside an f-string's braces only works from Python 3.12, which allows backslashes there. For older versions, join into a variable first.
:::

:::challenge id=md-step-5 title="Step 5: Render each block" difficulty=medium
Write `render_block(block)` with `match`, returning:

- For `p` and `h1` to `h6`: `<p>...</p>` and so on, with the lines joined by single spaces and rendered with `inline()`.
- For `ul` and `ol`: the opening tag, then one `<li>...</li>` per item, each on its own line, then the closing tag. Items go through `inline()`.
- For `pre`: `<pre><code>...</code></pre>`, with the lines joined by newlines and escaped but not formatted. With a language, the `code` tag gets `class="language-..."`.

Blockquotes come in step 6.

```text
>>> print(render_block(Block("ul", ["milk", "**eggs**"])))
<ul>
<li>milk</li>
<li><strong>eggs</strong></li>
</ul>
```

```python starter
import html
import re
from collections.abc import Iterable, Iterator
from dataclasses import dataclass, field


def escape(text: str) -> str:
    """Escape &, < and > so text displays literally between HTML tags."""
    return html.escape(text, quote=False)


INLINE = re.compile(r"""
    `(?P<code>[^`]+)`                              # `code`
  | \*\*(?P<strong>\S.*?)(?<=\S)\*\*               # **strong**
  | \*(?P<em>[^\s*][^*]*)(?<=[^\s*])\*             # *em*
  | \[(?P<label>[^\]]+)\]\((?P<href>[^)\s]+)\)     # [label](href)
""", re.VERBOSE)


def inline(text: str) -> str:
    """Render the inline Markdown in one line of text."""
    return render_spans(escape(text))


def render_spans(escaped: str) -> str:
    """Render the spans in text that's already escaped, nested ones included."""
    return INLINE.sub(render_span, escaped)


def render_span(m: re.Match[str]) -> str:
    """The HTML for one match of INLINE."""
    if m["code"] is not None:
        return f"<code>{m['code']}</code>"
    if m["strong"] is not None:
        return f"<strong>{render_spans(m['strong'])}</strong>"
    if m["em"] is not None:
        return f"<em>{render_spans(m['em'])}</em>"
    href = m["href"].replace('"', "&quot;")  # attribute values need quotes escaped too
    return f'<a href="{href}">{render_spans(m["label"])}</a>'


def classify(line: str) -> tuple[str, str]:
    """Return (kind, content) for one line of Markdown.

    kind is "blank", "fence", "h1" to "h6", "ul", "ol", "blockquote" or "p".
    """
    if not line.strip():
        return "blank", ""
    if line.startswith("```"):
        return "fence", line[3:].strip()
    if m := re.match(r"(#{1,6})\s+(.*)", line):
        return f"h{len(m[1])}", m[2].strip()
    if m := re.match(r"[-*+]\s+(.*)", line):
        return "ul", m[1].strip()
    if m := re.match(r"\d+[.)]\s+(.*)", line):
        return "ol", m[1].strip()
    if line.startswith(">"):
        return "blockquote", line[1:].removeprefix(" ")
    return "p", line.strip()


@dataclass
class Block:
    kind: str  # the HTML tag: p, h1 to h6, ul, ol, blockquote or pre
    lines: list[str] = field(default_factory=list)
    lang: str = ""  # fenced code only


def parse_blocks(lines: Iterable[str]) -> Iterator[Block]:
    """Group lines into blocks, yielding each block as soon as it's complete."""
    block = None
    for line in lines:
        if block is not None and block.kind == "pre":
            if line.startswith("```"):  # the closing fence
                yield block
                block = None
            else:
                block.lines.append(line)
            continue
        kind, text = classify(line)
        if block is not None and block.kind == kind:
            block.lines.append(text)  # the line continues the current block
            continue
        if block is not None:
            yield block
            block = None
        match kind:
            case "blank":
                pass
            case "fence":
                block = Block("pre", lang=text)
            case "h1" | "h2" | "h3" | "h4" | "h5" | "h6":
                yield Block(kind, [text])
            case _:
                block = Block(kind, [text])
    if block is not None:
        yield block


def render_block(block: Block) -> str:
    """Render one block as HTML."""
    ...
```

```python solution
import html
import re
from collections.abc import Iterable, Iterator
from dataclasses import dataclass, field


def escape(text: str) -> str:
    """Escape &, < and > so text displays literally between HTML tags."""
    return html.escape(text, quote=False)


INLINE = re.compile(r"""
    `(?P<code>[^`]+)`                              # `code`
  | \*\*(?P<strong>\S.*?)(?<=\S)\*\*               # **strong**
  | \*(?P<em>[^\s*][^*]*)(?<=[^\s*])\*             # *em*
  | \[(?P<label>[^\]]+)\]\((?P<href>[^)\s]+)\)     # [label](href)
""", re.VERBOSE)


def inline(text: str) -> str:
    """Render the inline Markdown in one line of text."""
    return render_spans(escape(text))


def render_spans(escaped: str) -> str:
    """Render the spans in text that's already escaped, nested ones included."""
    return INLINE.sub(render_span, escaped)


def render_span(m: re.Match[str]) -> str:
    """The HTML for one match of INLINE."""
    if m["code"] is not None:
        return f"<code>{m['code']}</code>"
    if m["strong"] is not None:
        return f"<strong>{render_spans(m['strong'])}</strong>"
    if m["em"] is not None:
        return f"<em>{render_spans(m['em'])}</em>"
    href = m["href"].replace('"', "&quot;")  # attribute values need quotes escaped too
    return f'<a href="{href}">{render_spans(m["label"])}</a>'


def classify(line: str) -> tuple[str, str]:
    """Return (kind, content) for one line of Markdown.

    kind is "blank", "fence", "h1" to "h6", "ul", "ol", "blockquote" or "p".
    """
    if not line.strip():
        return "blank", ""
    if line.startswith("```"):
        return "fence", line[3:].strip()
    if m := re.match(r"(#{1,6})\s+(.*)", line):
        return f"h{len(m[1])}", m[2].strip()
    if m := re.match(r"[-*+]\s+(.*)", line):
        return "ul", m[1].strip()
    if m := re.match(r"\d+[.)]\s+(.*)", line):
        return "ol", m[1].strip()
    if line.startswith(">"):
        return "blockquote", line[1:].removeprefix(" ")
    return "p", line.strip()


@dataclass
class Block:
    kind: str  # the HTML tag: p, h1 to h6, ul, ol, blockquote or pre
    lines: list[str] = field(default_factory=list)
    lang: str = ""  # fenced code only


def parse_blocks(lines: Iterable[str]) -> Iterator[Block]:
    """Group lines into blocks, yielding each block as soon as it's complete."""
    block = None
    for line in lines:
        if block is not None and block.kind == "pre":
            if line.startswith("```"):  # the closing fence
                yield block
                block = None
            else:
                block.lines.append(line)
            continue
        kind, text = classify(line)
        if block is not None and block.kind == kind:
            block.lines.append(text)  # the line continues the current block
            continue
        if block is not None:
            yield block
            block = None
        match kind:
            case "blank":
                pass
            case "fence":
                block = Block("pre", lang=text)
            case "h1" | "h2" | "h3" | "h4" | "h5" | "h6":
                yield Block(kind, [text])
            case _:
                block = Block(kind, [text])
    if block is not None:
        yield block


def render_block(block: Block) -> str:
    """Render one block as HTML."""
    match block:
        case Block("pre", lines, lang):
            attr = f' class="language-{html.escape(lang)}"' if lang else ""
            code = escape("\n".join(lines))
            return f"<pre><code{attr}>{code}</code></pre>"
        case Block("ul" | "ol" as tag, items):
            body = "".join(f"<li>{inline(item)}</li>\n" for item in items)
            return f"<{tag}>\n{body}</{tag}>"
        case Block(tag, lines):  # p and h1 to h6
            return f"<{tag}>{inline(' '.join(lines))}</{tag}>"
```

```python tests
@test("paragraph lines are joined with spaces and formatted")
def _():
    eq(render_block(Block("p", ["Hello", "*world*"])), "<p>Hello <em>world</em></p>")

@test("headings")
def _():
    eq(render_block(Block("h1", ["Title"])), "<h1>Title</h1>")
    eq(render_block(Block("h3", ["`code` & more"])), "<h3><code>code</code> &amp; more</h3>")

@test("lists put one item per line")
def _():
    eq(render_block(Block("ul", ["milk", "**eggs**"])), "<ul>\n<li>milk</li>\n<li><strong>eggs</strong></li>\n</ul>")
    eq(render_block(Block("ol", ["one"])), "<ol>\n<li>one</li>\n</ol>")

@test("code is escaped, not formatted")
def _():
    eq(render_block(Block("pre", ["if a < b:", "    print('*hi*')"])),
       "<pre><code>if a &lt; b:\n    print('*hi*')</code></pre>")

@test("code with a language gets a class")
def _():
    eq(render_block(Block("pre", ["x = 1"], lang="python")), '<pre><code class="language-python">x = 1</code></pre>')

@test("render_block() dispatches with match")
def _():
    fn = next((n for n in ast.walk(tree) if isinstance(n, ast.FunctionDef) and n.name == "render_block"), None)
    check(fn is not None and any(isinstance(n, ast.Match) for n in ast.walk(fn)),
          "use match/case inside render_block()")
```

```hint
Start with `case Block("pre", lines, lang):`. Build the optional attribute with a conditional expression, `f' class="language-{lang}"' if lang else ""`, and `escape("\n".join(lines))` the code.
```

```hint
For lists, `case Block("ul" | "ol" as tag, items):` binds the tag. The body is `"".join(f"<li>{inline(item)}</li>\n" for item in items)`, between `f"<{tag}>\n"` and `f"</{tag}>"`.
```

```hint
Last, `case Block(tag, lines):` covers paragraphs and headings: `f"<{tag}>{inline(' '.join(lines))}</{tag}>"`.
```
:::

## Step 6: The pipeline, and quotes inside quotes

`render_lines()` connects the stages: it strips line endings, feeds the lines to `parse_blocks()` and renders each block as it arrives. It accepts any iterable of lines, and an open file is one: iterating a text file yields its lines one at a time, each with its `"\n"` still attached. Every stage is lazy, so a whole file streams through, with one line coming in, at most one block in memory and one chunk of HTML going out. `render()` is then a one-liner for strings.

:::compare Reading a file line by line
```js
import { createReadStream } from "node:fs";
import { createInterface } from "node:readline";

const lines = createInterface({ input: createReadStream("notes.md") });
for await (const line of lines) {
  console.log(line);          // newline already removed
}
```
```python
with open("notes.md", encoding="utf-8") as f:
    for line in f:
        print(line.rstrip("\n"))  # the newline is still attached
```
:::

Generator expressions chain into lazy pipelines, the job ES2025's iterator helpers (`.map()` and `.filter()` on an iterator) do in JavaScript: nothing runs until the last stage asks for a value ([Lazy pipelines](lesson:iterators-and-generators#lazy-pipelines-and-the-es2025-iterator-helpers)):

```python run
from pathlib import Path

Path("notes.md").write_text("# Notes\n\nfirst\n    indented\n", encoding="utf-8")

with open("notes.md", encoding="utf-8") as f:
    stripped = (line.rstrip("\n") for line in f)
    numbered = (f"{i:>2} | {line}" for i, line in enumerate(stripped, start=1))
    for row in numbered:
        print(row)
```

:::gotcha Strip the newline, not the whitespace
`line.strip()` would also eat the indentation of code inside fences. `line.rstrip("\n")` removes only the line ending. Opening the file in text mode has already turned Windows `"\r\n"` endings into `"\n"`.
:::

Blockquotes are where the pipeline pays off. A quote's lines, minus their `>`, are a Markdown document of their own, so `render_block()` renders them by feeding them back into `render_lines()`. Quotes can then hold headings, lists, code and other quotes with no extra code, and the recursion goes exactly as deep as the quotes are nested.

:::challenge id=md-step-6 title="Step 6: Stream a whole document" difficulty=medium
Finish the converter:

- `render_lines(lines)` takes any iterable of lines, with or without a trailing `"\n"`, and lazily yields one chunk of HTML per block.
- `render(markdown)` converts a string, joining the chunks with newlines.
- `render_block()` gets a `blockquote` case: `<blockquote>`, a newline, the quote's lines rendered as a document, a newline, `</blockquote>`.

```text
>>> print(render("> ## Note\n> Read *this*."))
<blockquote>
<h2>Note</h2>
<p>Read <em>this</em>.</p>
</blockquote>
```

```python starter
import html
import re
from collections.abc import Iterable, Iterator
from dataclasses import dataclass, field


def escape(text: str) -> str:
    """Escape &, < and > so text displays literally between HTML tags."""
    return html.escape(text, quote=False)


INLINE = re.compile(r"""
    `(?P<code>[^`]+)`                              # `code`
  | \*\*(?P<strong>\S.*?)(?<=\S)\*\*               # **strong**
  | \*(?P<em>[^\s*][^*]*)(?<=[^\s*])\*             # *em*
  | \[(?P<label>[^\]]+)\]\((?P<href>[^)\s]+)\)     # [label](href)
""", re.VERBOSE)


def inline(text: str) -> str:
    """Render the inline Markdown in one line of text."""
    return render_spans(escape(text))


def render_spans(escaped: str) -> str:
    """Render the spans in text that's already escaped, nested ones included."""
    return INLINE.sub(render_span, escaped)


def render_span(m: re.Match[str]) -> str:
    """The HTML for one match of INLINE."""
    if m["code"] is not None:
        return f"<code>{m['code']}</code>"
    if m["strong"] is not None:
        return f"<strong>{render_spans(m['strong'])}</strong>"
    if m["em"] is not None:
        return f"<em>{render_spans(m['em'])}</em>"
    href = m["href"].replace('"', "&quot;")  # attribute values need quotes escaped too
    return f'<a href="{href}">{render_spans(m["label"])}</a>'


def classify(line: str) -> tuple[str, str]:
    """Return (kind, content) for one line of Markdown.

    kind is "blank", "fence", "h1" to "h6", "ul", "ol", "blockquote" or "p".
    """
    if not line.strip():
        return "blank", ""
    if line.startswith("```"):
        return "fence", line[3:].strip()
    if m := re.match(r"(#{1,6})\s+(.*)", line):
        return f"h{len(m[1])}", m[2].strip()
    if m := re.match(r"[-*+]\s+(.*)", line):
        return "ul", m[1].strip()
    if m := re.match(r"\d+[.)]\s+(.*)", line):
        return "ol", m[1].strip()
    if line.startswith(">"):
        return "blockquote", line[1:].removeprefix(" ")
    return "p", line.strip()


@dataclass
class Block:
    kind: str  # the HTML tag: p, h1 to h6, ul, ol, blockquote or pre
    lines: list[str] = field(default_factory=list)
    lang: str = ""  # fenced code only


def parse_blocks(lines: Iterable[str]) -> Iterator[Block]:
    """Group lines into blocks, yielding each block as soon as it's complete."""
    block = None
    for line in lines:
        if block is not None and block.kind == "pre":
            if line.startswith("```"):  # the closing fence
                yield block
                block = None
            else:
                block.lines.append(line)
            continue
        kind, text = classify(line)
        if block is not None and block.kind == kind:
            block.lines.append(text)  # the line continues the current block
            continue
        if block is not None:
            yield block
            block = None
        match kind:
            case "blank":
                pass
            case "fence":
                block = Block("pre", lang=text)
            case "h1" | "h2" | "h3" | "h4" | "h5" | "h6":
                yield Block(kind, [text])
            case _:
                block = Block(kind, [text])
    if block is not None:
        yield block


def render_block(block: Block) -> str:
    """Render one block as HTML."""
    match block:
        case Block("pre", lines, lang):
            attr = f' class="language-{html.escape(lang)}"' if lang else ""
            code = escape("\n".join(lines))
            return f"<pre><code{attr}>{code}</code></pre>"
        case Block("ul" | "ol" as tag, items):
            body = "".join(f"<li>{inline(item)}</li>\n" for item in items)
            return f"<{tag}>\n{body}</{tag}>"
        # TODO (step 6): blockquotes
        case Block(tag, lines):  # p and h1 to h6
            return f"<{tag}>{inline(' '.join(lines))}</{tag}>"


def render_lines(lines: Iterable[str]) -> Iterator[str]:
    """Render Markdown lines (with or without line endings) to HTML, one block at a time."""
    ...


def render(markdown: str) -> str:
    """Convert a Markdown document to HTML."""
    ...
```

```python solution
import html
import re
from collections.abc import Iterable, Iterator
from dataclasses import dataclass, field


def escape(text: str) -> str:
    """Escape &, < and > so text displays literally between HTML tags."""
    return html.escape(text, quote=False)


INLINE = re.compile(r"""
    `(?P<code>[^`]+)`                              # `code`
  | \*\*(?P<strong>\S.*?)(?<=\S)\*\*               # **strong**
  | \*(?P<em>[^\s*][^*]*)(?<=[^\s*])\*             # *em*
  | \[(?P<label>[^\]]+)\]\((?P<href>[^)\s]+)\)     # [label](href)
""", re.VERBOSE)


def inline(text: str) -> str:
    """Render the inline Markdown in one line of text."""
    return render_spans(escape(text))


def render_spans(escaped: str) -> str:
    """Render the spans in text that's already escaped, nested ones included."""
    return INLINE.sub(render_span, escaped)


def render_span(m: re.Match[str]) -> str:
    """The HTML for one match of INLINE."""
    if m["code"] is not None:
        return f"<code>{m['code']}</code>"
    if m["strong"] is not None:
        return f"<strong>{render_spans(m['strong'])}</strong>"
    if m["em"] is not None:
        return f"<em>{render_spans(m['em'])}</em>"
    href = m["href"].replace('"', "&quot;")  # attribute values need quotes escaped too
    return f'<a href="{href}">{render_spans(m["label"])}</a>'


def classify(line: str) -> tuple[str, str]:
    """Return (kind, content) for one line of Markdown.

    kind is "blank", "fence", "h1" to "h6", "ul", "ol", "blockquote" or "p".
    """
    if not line.strip():
        return "blank", ""
    if line.startswith("```"):
        return "fence", line[3:].strip()
    if m := re.match(r"(#{1,6})\s+(.*)", line):
        return f"h{len(m[1])}", m[2].strip()
    if m := re.match(r"[-*+]\s+(.*)", line):
        return "ul", m[1].strip()
    if m := re.match(r"\d+[.)]\s+(.*)", line):
        return "ol", m[1].strip()
    if line.startswith(">"):
        return "blockquote", line[1:].removeprefix(" ")
    return "p", line.strip()


@dataclass
class Block:
    kind: str  # the HTML tag: p, h1 to h6, ul, ol, blockquote or pre
    lines: list[str] = field(default_factory=list)
    lang: str = ""  # fenced code only


def parse_blocks(lines: Iterable[str]) -> Iterator[Block]:
    """Group lines into blocks, yielding each block as soon as it's complete."""
    block = None
    for line in lines:
        if block is not None and block.kind == "pre":
            if line.startswith("```"):  # the closing fence
                yield block
                block = None
            else:
                block.lines.append(line)
            continue
        kind, text = classify(line)
        if block is not None and block.kind == kind:
            block.lines.append(text)  # the line continues the current block
            continue
        if block is not None:
            yield block
            block = None
        match kind:
            case "blank":
                pass
            case "fence":
                block = Block("pre", lang=text)
            case "h1" | "h2" | "h3" | "h4" | "h5" | "h6":
                yield Block(kind, [text])
            case _:
                block = Block(kind, [text])
    if block is not None:
        yield block


def render_block(block: Block) -> str:
    """Render one block as HTML."""
    match block:
        case Block("pre", lines, lang):
            attr = f' class="language-{html.escape(lang)}"' if lang else ""
            code = escape("\n".join(lines))
            return f"<pre><code{attr}>{code}</code></pre>"
        case Block("ul" | "ol" as tag, items):
            body = "".join(f"<li>{inline(item)}</li>\n" for item in items)
            return f"<{tag}>\n{body}</{tag}>"
        case Block("blockquote", lines):
            inner = "\n".join(render_lines(lines))
            return f"<blockquote>\n{inner}\n</blockquote>"
        case Block(tag, lines):  # p and h1 to h6
            return f"<{tag}>{inline(' '.join(lines))}</{tag}>"


def render_lines(lines: Iterable[str]) -> Iterator[str]:
    """Render Markdown lines (with or without line endings) to HTML, one block at a time."""
    stripped = (line.rstrip("\n") for line in lines)
    for block in parse_blocks(stripped):
        yield render_block(block)


def render(markdown: str) -> str:
    """Convert a Markdown document to HTML."""
    return "\n".join(render_lines(markdown.splitlines()))
```

````python tests
import tempfile
from pathlib import Path

@test("render() joins one chunk of HTML per block")
def _():
    eq(render("# Title\n\nSome *text*.\n\n- one\n- two"),
       "<h1>Title</h1>\n<p>Some <em>text</em>.</p>\n<ul>\n<li>one</li>\n<li>two</li>\n</ul>")

@test("an empty document renders as an empty string")
def _():
    eq(render(""), "")
    eq(render("\n\n"), "")

@test("render_lines() accepts lines that still have their newlines")
def _():
    eq(list(render_lines(["# Hi\n", "\n", "text\n"])), ["<h1>Hi</h1>", "<p>text</p>"])

@test("render_lines() streams an open file, keeping code indentation")
def _():
    path = Path(tempfile.mkdtemp()) / "notes.md"
    path.write_text("# Notes\n\n```\n  indented\n```\n", encoding="utf-8")
    with open(path, encoding="utf-8") as f:
        eq(list(render_lines(f)), ["<h1>Notes</h1>", "<pre><code>  indented</code></pre>"])

@test("render_lines() is lazy")
def _():
    source = iter(["# One", "# Two"])
    chunks = render_lines(source)
    eq(next(chunks), "<h1>One</h1>")
    eq(next(source, None), "# Two", "render the first block before reading the next line")

@test("blockquotes render their content as Markdown")
def _():
    eq(render("> ## Note\n> Read *this*."), "<blockquote>\n<h2>Note</h2>\n<p>Read <em>this</em>.</p>\n</blockquote>")

@test("quotes nest")
def _():
    eq(render("> outer\n>\n> > inner"),
       "<blockquote>\n<p>outer</p>\n<blockquote>\n<p>inner</p>\n</blockquote>\n</blockquote>")

@test("quotes can hold lists and code")
def _():
    eq(render("> - a\n> ```\n> x < y\n> ```"),
       "<blockquote>\n<ul>\n<li>a</li>\n</ul>\n<pre><code>x &lt; y</code></pre>\n</blockquote>")

@test("raw HTML is escaped everywhere")
def _():
    eq(render("<script>alert(1)</script>"), "<p>&lt;script&gt;alert(1)&lt;/script&gt;</p>")

@test("a whole document")
def _():
    doc = """\
# Pancakes

Serves *four*. See [the original](https://example.com/?a=1&b=2).

1. Whisk
2. **Rest** the batter

> Tip: use `butter`.

```text
<flour> + <milk>
```
"""
    eq(render(doc), "\n".join([
        "<h1>Pancakes</h1>",
        '<p>Serves <em>four</em>. See <a href="https://example.com/?a=1&amp;b=2">the original</a>.</p>',
        "<ol>\n<li>Whisk</li>\n<li><strong>Rest</strong> the batter</li>\n</ol>",
        "<blockquote>\n<p>Tip: use <code>butter</code>.</p>\n</blockquote>",
        '<pre><code class="language-text">&lt;flour&gt; + &lt;milk&gt;</code></pre>',
    ]))
````

```hint
`render_lines()` can be three lines: a generator expression that does `line.rstrip("\n")` for each line, then `for block in parse_blocks(stripped): yield render_block(block)`.
```

```hint
`render(markdown)` is `"\n".join(render_lines(markdown.splitlines()))`.
```

```hint
The new case goes before the catch-all `case Block(tag, lines):`. Render its lines with `"\n".join(render_lines(lines))` and wrap them as `f"<blockquote>\n{inner}\n</blockquote>"`.
```
:::

## Where to take it next

- **Nested lists.** Track indentation in `classify()` and keep a stack of open lists in `parse_blocks()`.
- **Backslash escapes.** Add an alternative to `INLINE` for `\*` and friends, whose replacement is the character itself.
- **Heading anchors.** Slugify each heading's text into an `id` attribute, and collect the headings for a table of contents.
- **The real thing.** Compare your output with a CommonMark-compliant library such as `markdown-it-py`, a Python port of the markdown-it parser that's popular in JavaScript. The CommonMark spec itself ships with hundreds of input and output examples, a ready-made test suite for your own converter.

## Cheat sheet

| JavaScript | Python | Notes |
| --- | --- | --- |
| a hand-rolled `escapeHtml()` | `html.escape(text, quote=False)` | the default, `quote=True`, is for attribute values |
| `s.replace(re, (m, g1) => ...)` | `re.sub(pattern, func, s)` | `func` gets one `Match`; every match is replaced |
| `$1`, `$<name>` in a replacement | `\1`, `\g<name>` | use raw strings |
| `.+?`, `(?<=\S)` | `.+?`, `(?<=\S)` | lazy quantifiers and lookbehinds look the same |
| `if ((m = line.match(re)))` | `if m := re.match(pattern, line):` | `re.match` only matches at the start |
| `s.replace(/^ /, "")` | `s.removeprefix(" ")` | 3.9+; `lstrip()` would remove every space |
| `function*` and `yield` | `def` and `yield` | lazy in both languages |
| `case "ul": case "ol":` | `case Block("ul" \| "ol" as tag, items):` | no fall-through; `as` binds the match |
| `for await (const line of rl)` | `for line in file:` | synchronous, and the `"\n"` stays on |
| `lines.values().map(f)` | `(f(line) for line in lines)` | generator expressions chain lazily |
