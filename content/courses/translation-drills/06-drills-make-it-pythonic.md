---
title: "Drills: Make It Pythonic"
part: Refactoring
summary: Ten working but JavaScript-flavoured functions to refactor into the Python a reviewer would approve.
minutes: 45
---

Every starter on this page already works. It's the Python that JavaScript muscle memory produces: index loops, flags and `break`, strings grown with `+=`, "does this key exist yet?" checks, and files opened and closed by hand. The behaviour tests pass from the start. What fails are the style checks, which read your code's syntax tree. Refactor until those pass too, without changing what the code does. Each challenge links to the lesson that teaches its idiom.

## The mappings

| JavaScript habit | Pythonic Python |
| --- | --- |
| `for i in range(len(xs)):` then `xs[i]` | `for x in xs:` |
| one index to walk two lists | `zip(a, b)`, and `enumerate(..., start=1)` for numbering |
| `result = []`, then `append()` in a loop | a list or dict comprehension |
| `f = open(...)` ... `f.close()` | `with open(...) as f:` |
| `if key not in d: d[key] = []` | `d.get(key, default)` and `defaultdict(list)` |
| `x = pair[0]`, a swap through `temp` | `a, b = pair`, `a, b = b, a`, `first, *rest = xs` |
| a flag variable plus `break` | `any(...)` and `all(...)` |
| `s += sep + piece` | `sep.join(pieces)` |
| `if "k" in d and isinstance(...)` | `try:` ... `except KeyError:` |
| `"Total: " + str(n)` | `f"Total: {n}"` |

## Challenges

:::challenge id=drill-pythonic-loop-items title="Loop over items, not indexes" difficulty=easy
`longest_name(users)` returns the longest `"name"` in a list of user dicts. The first one wins a tie, and an empty list gives `""`.

It works, but it walks the indexes the way a `for (let i = 0; ...)` loop does. Loop over the users themselves. For a stretch, the whole body fits in a single `max()` call, with `key=len` and `default=""`.

Refresher: [Most index loops don't need an index](lesson:control-flow#most-index-loops-don-t-need-an-index) and [`min` and `max` with `key` and `default`](lesson:map-filter-reduce#min-and-max-with-key-and-default).

```python starter
def longest_name(users):
    longest = ""
    for i in range(len(users)):
        name = users[i]["name"]
        if len(name) > len(longest):
            longest = name
    return longest
```

```python solution
def longest_name(users):
    return max((user["name"] for user in users), key=len, default="")
```

```python tests
def range_len_calls():
    return [
        node for node in ast.walk(tree)
        if isinstance(node, ast.Call) and getattr(node.func, "id", None) == "range"
        and any(isinstance(arg, ast.Call) and getattr(arg.func, "id", None) == "len" for arg in node.args)
    ]

@test("returns the longest name")
def _():
    eq(longest_name([{"name": "Ada"}, {"name": "Margaret"}, {"name": "Linus"}]), "Margaret")

@test("the first name wins a tie")
def _():
    eq(longest_name([{"name": "Grace"}, {"name": "Linus"}, {"name": "Guido"}]), "Grace")

@test("an empty list gives an empty string")
def _():
    eq(longest_name([]), "")

@test("loops over the users, not their indexes")
def _():
    check(not range_len_calls(), "drop range(len(users)): loop over users directly")
    check(
        not any(isinstance(node, ast.Subscript) and getattr(node.value, "id", None) == "users" for node in ast.walk(tree)),
        "no users[i]: the loop hands you each user",
    )
```

```hint
`for user in users:` gives you each dict directly, so `users[i]` becomes `user`.
```

```hint
`max(iterable, key=len, default="")` returns the first longest item, and `default` covers the empty case. Feed it a generator expression of the names.
```
:::

:::challenge id=drill-pythonic-fstrings title="f-strings, not concatenation" difficulty=easy
`receipt_line(name, qty, unit_price)` formats one line of a receipt: the name left-aligned in 12 columns, then `x` and the quantity right-aligned in 3, then `$` and the line total, with two decimals, right-aligned in 8:

```text
receipt_line("Coffee", 2, 3.5)  ->  'Coffee       x  2  $    7.00'
```

It's written the way a `padEnd`/`padStart` chain gets ported: `+`, `str()`, `ljust()` and `rjust()`. Rewrite it as a single f-string, and let the format-spec mini-language do the padding and the decimals: `{name:<12}`, `{qty:>3}`, `{total:>8.2f}`.

Refresher: [Template literals → f-strings](lesson:strings#template-literals-f-strings) and [The format-spec mini-language](lesson:strings#the-format-spec-mini-language).

```python starter
def receipt_line(name, qty, unit_price):
    total = qty * unit_price
    return name.ljust(12) + " x" + str(qty).rjust(3) + "  $" + format(total, ".2f").rjust(8)
```

```python solution
def receipt_line(name, qty, unit_price):
    return f"{name:<12} x{qty:>3}  ${qty * unit_price:>8.2f}"
```

```python tests
def calls_named(*names):
    return [
        node for node in ast.walk(tree)
        if isinstance(node, ast.Call)
        and (getattr(node.func, "id", None) in names or getattr(node.func, "attr", None) in names)
    ]

@test("formats a receipt line")
def _():
    eq(receipt_line("Coffee", 2, 3.5), "Coffee       x  2  $    7.00")

@test("rounds the total to two decimals")
def _():
    eq(receipt_line("Bagel", 3, 1.333), "Bagel        x  3  $    4.00")

@test("a long name or a big total pushes the columns instead of being cut")
def _():
    eq(receipt_line("Espresso machine", 1, 1249.99), "Espresso machine x  1  $ 1249.99")

@test("builds the line with one f-string")
def _():
    requires_syntax(ast.JoinedStr, "build the line with an f-string")
    check(
        not any(isinstance(node, ast.BinOp) and isinstance(node.op, ast.Add) for node in ast.walk(tree)),
        "no + between strings: put every piece inside the f-string",
    )
    check(not calls_named("str", "format", "ljust", "rjust"), "the format spec does the work: {qty:>3}, {total:>8.2f}")
```

```hint
Inside the braces, `<` aligns left, `>` aligns right, and the number after it is the width: `f"{name:<12}"` is `name.ljust(12)`.
```

```hint
Combine the width with a precision for floats: `{total:>8.2f}`. The expression can go right into the braces, as in `{qty * unit_price:>8.2f}`.
```
:::

:::challenge id=drill-pythonic-join title="Build strings with join()" difficulty=easy
`query_string(params)` turns a dict into `key=value` pairs joined by `&`. It skips `None` values but keeps falsy ones like `0` and `""`, and it doesn't URL-encode anything: the caller does that.

The loop grows the string with `+=` and a manual "do I need a separator yet?" check. Generate the pairs instead and hand them to `"&".join(...)` once, looping over `.items()` to get each key and its value together.

Refresher: [join and split](lesson:lists#join-and-split) and [Iterating: keys, values, items](lesson:dicts#iterating-keys-values-items).

```python starter
def query_string(params):
    query = ""
    for key in params:
        value = params[key]
        if value is None:
            continue
        if query != "":
            query += "&"
        query += f"{key}={value}"
    return query
```

```python solution
def query_string(params):
    return "&".join(f"{key}={value}" for key, value in params.items() if value is not None)
```

```python tests
@test("joins key=value pairs with &")
def _():
    eq(query_string({"q": "python", "page": 2}), "q=python&page=2")

@test("skips None but keeps 0 and empty strings")
def _():
    eq(query_string({"q": "", "page": 0, "sort": None, "limit": 20}), "q=&page=0&limit=20")

@test("nothing to send gives an empty string")
def _():
    eq(query_string({}), "")
    eq(query_string({"sort": None}), "")

@test("values aren't URL-encoded")
def _():
    eq(query_string({"q": "a b&c"}), "q=a b&c")

@test("joins once instead of growing a string")
def _():
    requires_call("join", "collect the pairs and call '&'.join(...) once")
    forbids_syntax(ast.AugAssign, "no += on a string: let join() place the separators")
    requires_call("items", "loop over params.items() to get each key and value together")
```

```hint
`"&".join(...)` puts the separator only *between* items, so the "first one?" check disappears.
```

```hint
A generator expression with a filter feeds it directly: `"&".join(f"{key}={value}" for key, value in params.items() if value is not None)`.
```
:::

:::challenge id=drill-pythonic-with-open title="Files belong in with" difficulty=easy
`count_errors(path)` counts the lines of a log file that start with `"ERROR"`.

It opens and closes the file by hand, like an `fs.openSync()` and `fs.closeSync()` pair, so an exception between the two would leak the file handle. And `readlines()`, like `read()`, loads the whole file into memory first. Open the file in a `with` block and iterate over the file object itself, which yields one line at a time.

Refresher: [`with` replaces try/finally](lesson:context-managers#with-replaces-try-finally) and [Reading and writing files](lesson:context-managers#reading-and-writing-files).

```python starter
def count_errors(path):
    log = open(path, encoding="utf-8")
    lines = log.readlines()
    log.close()
    count = 0
    for line in lines:
        if line.startswith("ERROR"):
            count += 1
    return count
```

```python solution
def count_errors(path):
    with open(path, encoding="utf-8") as log:
        return sum(1 for line in log if line.startswith("ERROR"))
```

```python tests
from pathlib import Path

def calls_named(*names):
    return [
        node for node in ast.walk(tree)
        if isinstance(node, ast.Call)
        and (getattr(node.func, "id", None) in names or getattr(node.func, "attr", None) in names)
    ]

def write_log(name, text):
    Path(name).write_text(text, encoding="utf-8")
    return name

@test("counts the lines that start with ERROR")
def _():
    path = write_log("drill_app.log", "INFO started\nERROR disk full\nWARN slow\nERROR timeout\n")
    eq(count_errors(path), 2)

@test("ERROR anywhere else in a line doesn't count")
def _():
    path = write_log("drill_mixed.log", "INFO no ERROR here\nerror in lowercase\nERROR the real one")
    eq(count_errors(path), 1)

@test("an empty log has no errors")
def _():
    eq(count_errors(write_log("drill_empty.log", "")), 0)

@test("a missing file raises FileNotFoundError")
def _():
    raises(FileNotFoundError, count_errors, "drill_missing.log")

@test("opens the file with `with`")
def _():
    requires_syntax(ast.With, "open the file in a with block, so it's closed even if something fails")
    forbids_call("close", "the with block closes the file for you")

@test("iterates over the file instead of reading it all at once")
def _():
    check(
        not calls_named("readlines", "read", "read_text"),
        "loop over the file object itself: it yields one line at a time instead of loading the whole file",
    )
```

```hint
`with open(path, encoding="utf-8") as log:` closes the file when the block ends, however it ends, including a `return` from inside it.
```

```hint
A file object is an iterator over its lines: `sum(1 for line in log if line.startswith("ERROR"))` counts them without building a list.
```
:::

:::challenge id=drill-pythonic-enumerate-zip title="enumerate() and zip()" difficulty=medium
Two functions written with C-style index loops:

- `scoreboard(names, scores)` returns lines like `"1. Ada: 42"`, numbered from 1.
- `changed_positions(before, after)` returns the indexes where two lists of the same length differ.

Replace the indexes with `zip` and `enumerate`. `zip` pairs the lists up item by item, `enumerate` supplies the position, and `enumerate(..., start=1)` counts from 1, so there's no `i + 1` to write. Both functions then fit in a list comprehension.

Refresher: [Index plus value: `enumerate`](lesson:control-flow#index-plus-value-enumerate) and [Two arrays at once: `zip`](lesson:control-flow#two-arrays-at-once-zip).

```python starter
def scoreboard(names, scores):
    lines = []
    for i in range(len(names)):
        lines.append(f"{i + 1}. {names[i]}: {scores[i]}")
    return lines

def changed_positions(before, after):
    positions = []
    for i in range(len(before)):
        if before[i] != after[i]:
            positions.append(i)
    return positions
```

```python solution
def scoreboard(names, scores):
    return [f"{rank}. {name}: {score}" for rank, (name, score) in enumerate(zip(names, scores), start=1)]

def changed_positions(before, after):
    return [i for i, (old, new) in enumerate(zip(before, after)) if old != new]
```

```python tests
def calls_named(*names):
    return [
        node for node in ast.walk(tree)
        if isinstance(node, ast.Call)
        and (getattr(node.func, "id", None) in names or getattr(node.func, "attr", None) in names)
    ]

def range_len_calls():
    return [
        call for call in calls_named("range")
        if any(isinstance(arg, ast.Call) and getattr(arg.func, "id", None) == "len" for arg in call.args)
    ]

@test("scoreboard numbers the lines from 1")
def _():
    eq(scoreboard(["Ada", "Grace", "Linus"], [42, 37, 29]), ["1. Ada: 42", "2. Grace: 37", "3. Linus: 29"])

@test("an empty scoreboard has no lines")
def _():
    eq(scoreboard([], []), [])

@test("changed_positions finds every difference")
def _():
    eq(changed_positions(["a", "b", "c", "d"], ["a", "x", "c", "y"]), [1, 3])

@test("identical lists have no changed positions")
def _():
    eq(changed_positions([1, 2, 3], [1, 2, 3]), [])

@test("uses zip and enumerate instead of indexes")
def _():
    check(not range_len_calls(), "no range(len(...)): enumerate() gives you the position")
    requires_call("zip", "pair the lists up with zip()")
    requires_call("enumerate", "number the items with enumerate()")

@test("counts from 1 with enumerate's start")
def _():
    check(
        any(len(call.args) == 2 or any(kw.arg == "start" for kw in call.keywords) for call in calls_named("enumerate")),
        "enumerate(..., start=1) counts from 1, so you don't need i + 1",
    )
```

```hint
`zip(names, scores)` yields `(name, score)` pairs, and `enumerate` wraps each one with its position: `for rank, (name, score) in enumerate(zip(names, scores), start=1)`.
```

```hint
The same pattern finds the differences, with a filter clause: `[i for i, (old, new) in enumerate(zip(before, after)) if old != new]`.
```
:::

:::challenge id=drill-pythonic-comprehensions title="Comprehensions, not append loops" difficulty=medium
Two functions that build their results with loops and `append()`, the way `forEach` plus `push` does:

- `order_lines(orders)` flattens the orders into `(order_id, sku, qty)` tuples, skipping items with a quantity of 0.
- `skus_by_order(orders)` maps each order id to the list of its SKUs.

Rewrite them as a list comprehension and a dict comprehension. A comprehension's `for` clauses come in the same order as the nested loops they replace, outermost first.

Refresher: [`flat` and `flatMap`: multiple `for` clauses](lesson:map-filter-reduce#flat-and-flatmap-multiple-for-clauses) and [Dict and set comprehensions](lesson:map-filter-reduce#dict-and-set-comprehensions).

```python starter
def order_lines(orders):
    lines = []
    for order in orders:
        for item in order["items"]:
            if item["qty"] > 0:
                lines.append((order["id"], item["sku"], item["qty"]))
    return lines

def skus_by_order(orders):
    result = {}
    for order in orders:
        skus = []
        for item in order["items"]:
            skus.append(item["sku"])
        result[order["id"]] = skus
    return result
```

```python solution
def order_lines(orders):
    return [
        (order["id"], item["sku"], item["qty"])
        for order in orders
        for item in order["items"]
        if item["qty"] > 0
    ]

def skus_by_order(orders):
    return {order["id"]: [item["sku"] for item in order["items"]] for order in orders}
```

```python tests
ORDERS = [
    {"id": 101, "items": [{"sku": "MUG", "qty": 2}, {"sku": "TEE", "qty": 0}]},
    {"id": 102, "items": []},
    {"id": 103, "items": [{"sku": "CAP", "qty": 1}, {"sku": "MUG", "qty": 1}]},
]

@test("order_lines flattens the items, in order")
def _():
    eq(order_lines(ORDERS), [(101, "MUG", 2), (103, "CAP", 1), (103, "MUG", 1)])

@test("order_lines skips zero quantities, and no orders gives no lines")
def _():
    eq(order_lines([{"id": 1, "items": [{"sku": "TEE", "qty": 0}]}]), [])
    eq(order_lines([]), [])

@test("skus_by_order maps every order, even an empty one")
def _():
    eq(skus_by_order(ORDERS), {101: ["MUG", "TEE"], 102: [], 103: ["CAP", "MUG"]})

@test("uses comprehensions instead of append loops")
def _():
    forbids_call("append", "no append(): a comprehension builds the list for you")
    forbids_syntax(ast.For, "no for statements: use a comprehension's for clauses")
    requires_syntax(ast.ListComp, "write order_lines as a list comprehension")
    requires_syntax(ast.DictComp, "write skus_by_order as a dict comprehension")
```

```hint
Read the nested loops top to bottom and write the clauses in that order: `[... for order in orders for item in order["items"] if item["qty"] > 0]`. The expression that was in `append()` goes first.
```

```hint
A dict comprehension's value can itself be a list comprehension: `{order["id"]: [item["sku"] for item in order["items"]] for order in orders}`.
```
:::

:::challenge id=drill-pythonic-any-all title="any() and all(), not flags" difficulty=medium
`can_checkout(cart)` decides whether a cart can be checked out: it needs at least one item with a quantity above 0, and no item may ask for more than its stock.

It's written with flag variables and `break`, the way you'd hand-roll `some()` and `every()`. Replace both loops with `any()` and `all()` over generator expressions.

Keep the generators lazy. Like the `break`s, `any()` and `all()` stop at the first item that settles the answer, and a test checks for that. Square brackets around the condition would build the whole list first. And `all()` of nothing is `True`, just like `[].every(...)`.

Refresher: [`find`, `findIndex`, `some` and `every`](lesson:map-filter-reduce#find-findindex-some-and-every) and [Conditional expressions, `any` and `all`](lesson:truthiness-and-equality#conditional-expressions-any-and-all).

```python starter
def can_checkout(cart):
    has_items = False
    for item in cart["items"]:
        if item["qty"] > 0:
            has_items = True
            break
    in_stock = True
    for item in cart["items"]:
        if item["qty"] > item["stock"]:
            in_stock = False
            break
    return has_items and in_stock
```

```python solution
def can_checkout(cart):
    items = cart["items"]
    return any(item["qty"] > 0 for item in items) and all(item["qty"] <= item["stock"] for item in items)
```

```python tests
def item(qty, stock):
    return {"qty": qty, "stock": stock}

@test("a normal cart can check out")
def _():
    eq(can_checkout({"items": [item(1, 5), item(2, 2)]}), True)

@test("an item over its stock blocks checkout")
def _():
    eq(can_checkout({"items": [item(1, 5), item(3, 2)]}), False)

@test("an empty cart, or one with only zero quantities, can't check out")
def _():
    eq(can_checkout({"items": []}), False)
    eq(can_checkout({"items": [item(0, 5), item(0, 1)]}), False)

@test("stops checking at the first item over its stock")
def _():
    unchecked = {"qty": 1}   # no "stock" key: reading it would raise KeyError
    eq(can_checkout({"items": [item(1, 5), item(9, 2), unchecked]}), False)

@test("uses any() and all() instead of flag loops")
def _():
    requires_call("any", "any() replaces the has_items loop")
    requires_call("all", "all() replaces the in_stock loop")
    forbids_syntax((ast.For, ast.Break), "no for/break loops: any() and all() stop early on their own")
```

```hint
"At least one item has a quantity above 0" is `any(item["qty"] > 0 for item in items)`.
```

```hint
"No item asks for more than its stock" is "every item fits": `all(item["qty"] <= item["stock"] for item in items)`. Join the two with `and`.
```
:::

:::challenge id=drill-pythonic-unpacking title="Unpack instead of indexing" difficulty=medium
Two functions that index into sequences the way you'd write `pair[0]` and `parts.slice(1)` in JavaScript, plus a three-line swap through a temporary variable:

- `normalize_ranges(ranges)` returns a list of `(start, end)` tuples, each in ascending order.
- `split_command(line)` splits a command line on whitespace into `(program, args)`, where `args` is the list of everything after the program.

Unpack instead: `for start, end in ranges`, swap with `start, end = end, start`, and take the head and the rest with `program, *args = line.split()`.

Refresher: [Unpacking: destructuring without brackets](lesson:tuples-and-unpacking#unpacking-destructuring-without-brackets) and [Star unpacking: a rest element anywhere](lesson:tuples-and-unpacking#star-unpacking-a-rest-element-anywhere).

```python starter
def normalize_ranges(ranges):
    result = []
    for r in ranges:
        start = r[0]
        end = r[1]
        if start > end:
            temp = start
            start = end
            end = temp
        result.append((start, end))
    return result

def split_command(line):
    parts = line.split()
    program = parts[0]
    args = parts[1:]
    return program, args
```

```python solution
def normalize_ranges(ranges):
    result = []
    for start, end in ranges:
        if start > end:
            start, end = end, start
        result.append((start, end))
    return result

def split_command(line):
    program, *args = line.split()
    return program, args
```

```python tests
def literal_indexing():
    """Subscripts like r[0] or parts[1:] (but not type hints like list[int])."""
    return [
        node for node in ast.walk(tree)
        if isinstance(node, ast.Subscript)
        and (
            isinstance(node.slice, ast.Slice)
            or (isinstance(node.slice, ast.Constant) and isinstance(node.slice.value, int))
        )
    ]

@test("normalize_ranges puts each pair in ascending order")
def _():
    eq(normalize_ranges([(1, 5), (9, 3), (4, 4)]), [(1, 5), (3, 9), (4, 4)])

@test("normalize_ranges accepts lists as pairs and returns tuples")
def _():
    eq(normalize_ranges([[10, 2]]), [(2, 10)])
    eq(normalize_ranges([]), [])

@test("split_command separates the program from its arguments")
def _():
    eq(split_command("git commit -m fix"), ("git", ["commit", "-m", "fix"]))

@test("split_command handles no arguments and extra whitespace")
def _():
    eq(split_command("ls"), ("ls", []))
    eq(split_command("  grep   -n  TODO  "), ("grep", ["-n", "TODO"]))

@test("unpacks instead of indexing")
def _():
    check(not literal_indexing(), "no r[0], parts[0] or parts[1:]: unpack into names instead")
    temps = {
        node.id for node in ast.walk(tree)
        if isinstance(node, ast.Name) and isinstance(node.ctx, ast.Store) and node.id in ("temp", "tmp")
    }
    check(not temps, "swap with start, end = end, start: no temporary variable needed")
    requires_syntax(ast.Starred, "program, *args = line.split() takes the head and the rest")
```

```hint
A `for` loop can unpack each pair as it goes: `for start, end in ranges:`. Tuple assignment evaluates the whole right side before assigning, which is why `start, end = end, start` swaps safely.
```

```hint
A starred name collects whatever is left over, as a list: `program, *args = "ls".split()` gives `args == []`.
```
:::

:::challenge id=drill-pythonic-defaultdict title="get() and defaultdict" difficulty=hard
`tag_report(posts)` groups blog posts by tag. It returns two dicts: one maps each tag to the titles of its posts, and the other maps each tag to the total views of those posts. Posts without a `"tags"` key are skipped, and a post without `"views"` counts as 0 views. Both dicts list the tags in order of first appearance.

The code is full of JavaScript's "does the key exist yet?" dance: `"tags" in post`, `if tag not in titles: titles[tag] = []`, and so on. Let `dict.get()` handle the optional keys and `collections.defaultdict` handle each tag's first appearance. Then convert the results back to plain dicts before returning them, so that a caller's typo raises `KeyError` instead of quietly returning `[]`.

Refresher: [Reading values: brackets, `get` and `in`](lesson:dicts#reading-values-brackets-get-and-in) and [`defaultdict`: no more create-it-if-it's-missing](lesson:dicts#defaultdict-no-more-create-it-if-it-s-missing).

```python starter
def tag_report(posts):
    titles = {}
    views = {}
    for post in posts:
        if "tags" in post:
            tags = post["tags"]
        else:
            tags = []
        if "views" in post:
            post_views = post["views"]
        else:
            post_views = 0
        for tag in tags:
            if tag not in titles:
                titles[tag] = []
            titles[tag].append(post["title"])
            if tag in views:
                views[tag] = views[tag] + post_views
            else:
                views[tag] = post_views
    return titles, views
```

```python solution
from collections import defaultdict

def tag_report(posts):
    titles = defaultdict(list)
    views = defaultdict(int)
    for post in posts:
        for tag in post.get("tags", []):
            titles[tag].append(post["title"])
            views[tag] += post.get("views", 0)
    return dict(titles), dict(views)
```

```python tests
def calls_named(*names):
    return [
        node for node in ast.walk(tree)
        if isinstance(node, ast.Call)
        and (getattr(node.func, "id", None) in names or getattr(node.func, "attr", None) in names)
    ]

POSTS = [
    {"title": "Async in Python", "tags": ["python", "async"], "views": 120},
    {"title": "Release notes", "views": 40},
    {"title": "Typing tips", "tags": ["python", "typing"], "views": 75},
    {"title": "Draft", "tags": ["async"]},
]

@test("groups titles by tag, in order of first appearance")
def _():
    titles, views = tag_report(POSTS)
    eq(titles, {"python": ["Async in Python", "Typing tips"], "async": ["Async in Python", "Draft"], "typing": ["Typing tips"]})
    eq(list(titles), ["python", "async", "typing"])

@test("totals the views per tag, counting missing views as 0")
def _():
    titles, views = tag_report(POSTS)
    eq(views, {"python": 195, "async": 120, "typing": 75})
    eq(list(views), ["python", "async", "typing"])

@test("posts without tags are skipped, and no posts gives empty reports")
def _():
    eq(tag_report([{"title": "Untagged", "views": 3}]), ({}, {}))
    eq(tag_report([]), ({}, {}))

@test("returns plain dicts, so an unknown tag raises KeyError")
def _():
    titles, views = tag_report(POSTS)
    raises(KeyError, lambda: titles["rust"])
    raises(KeyError, lambda: views["rust"])

@test("lets get() and defaultdict handle the missing keys")
def _():
    membership = [
        node for node in ast.walk(tree)
        if isinstance(node, ast.Compare) and any(isinstance(op, (ast.In, ast.NotIn)) for op in node.ops)
    ]
    check(not membership, "no `in` / `not in` key checks: use post.get(key, default) and defaultdict")
    requires_call("get", "read the optional keys with post.get(key, default)")
    check(calls_named("defaultdict", "Counter", "setdefault"), "let collections.defaultdict create each tag's entry")
```

```hint
`post.get("tags", [])` returns the tags, or an empty list to loop over when the key is missing. The same trick gives `post.get("views", 0)`.
```

```hint
`defaultdict(list)` creates an empty list the first time you touch a key, so `titles[tag].append(...)` just works. `defaultdict(int)` starts each total at 0, ready for `+=`.
```

```hint
`dict(titles)` copies a `defaultdict` into a plain `dict`, keeping the key order.
```
:::

:::challenge id=drill-pythonic-eafp title="Ask forgiveness, not permission" difficulty=hard
Two functions in "look before you leap" style, where every access is guarded by a check, much like JavaScript's optional chaining and `typeof` guards:

- `get_port(config)` returns `config["server"]["port"]` as an `int`. It returns `8080` when the port is missing or isn't a number, or when `config["server"]` isn't a dict.
- `read_counter(path)` returns the integer stored in a text file, or `0` when the file doesn't exist or doesn't hold an integer.

Python prefers EAFP, "easier to ask forgiveness than permission": just do the thing, and catch exactly the exceptions that mean "use the default", and nothing broader, with `try`/`except` or `contextlib.suppress`. The result is shorter, and the checks it replaces are easy to get subtly wrong. `str.isdigit()` isn't the same test as "`int()` can parse this": it rejects `"-3"` and accepts `"²"`, which `int()` refuses. For files, EAFP is also more correct, because another process can delete the file between an `exists()` check and the `open()`.

Refresher: [EAFP: ask forgiveness, not permission](lesson:exceptions#eafp-ask-forgiveness-not-permission) and [Catch what you can handle](lesson:exceptions#catch-what-you-can-handle).

```python starter
import os

def get_port(config):
    if "server" in config and isinstance(config["server"], dict):
        server = config["server"]
        if "port" in server:
            port = server["port"]
            if isinstance(port, int):
                return port
            if isinstance(port, str) and port.isdigit():
                return int(port)
    return 8080

def read_counter(path):
    if not os.path.exists(path):
        return 0
    with open(path, encoding="utf-8") as file:
        text = file.read().strip()
    if text.isdigit():
        return int(text)
    return 0
```

```python solution
def get_port(config):
    try:
        return int(config["server"]["port"])
    except (KeyError, TypeError, ValueError):
        return 8080

def read_counter(path):
    try:
        with open(path, encoding="utf-8") as file:
            return int(file.read())
    except (FileNotFoundError, ValueError):
        return 0
```

```python tests
from pathlib import Path

def calls_named(*names):
    return [
        node for node in ast.walk(tree)
        if isinstance(node, ast.Call)
        and (getattr(node.func, "id", None) in names or getattr(node.func, "attr", None) in names)
    ]

def names_in(node):
    return {name.id for name in ast.walk(node) if isinstance(name, ast.Name)}

@test("get_port reads an int or a numeric string")
def _():
    eq(get_port({"server": {"port": 9000}}), 9000)
    eq(get_port({"server": {"port": "9000"}}), 9000)

@test("get_port falls back to 8080 when anything is missing or malformed")
def _():
    configs = [
        {},
        {"server": {}},
        {"server": None},
        {"server": "localhost:9000"},
        {"server": {"port": "http"}},
        {"server": {"port": None}},
    ]
    for config in configs:
        eq(get_port(config), 8080, f"for {config!r}")

@test("read_counter reads the number in the file")
def _():
    Path("drill_counter.txt").write_text("42\n", encoding="utf-8")
    eq(read_counter("drill_counter.txt"), 42)

@test("read_counter gives 0 for a missing file or one without an integer")
def _():
    eq(read_counter("drill_no_such_counter.txt"), 0)
    for text in ["", "lots", "3.5"]:
        Path("drill_counter_bad.txt").write_text(text, encoding="utf-8")
        eq(read_counter("drill_counter_bad.txt"), 0, f"for the contents {text!r}")

@test("asks forgiveness instead of permission")
def _():
    check(
        any(isinstance(node, ast.Try) for node in ast.walk(tree)) or calls_named("suppress"),
        "wrap the lookups and the parsing in try/except (or contextlib.suppress)",
    )
    forbids_call("isinstance", "no type checks: let the lookups and int() raise")
    forbids_call("isdigit", "isdigit() isn't what int() accepts: call int() and catch ValueError")
    forbids_call("exists", "an exists() check races with open(): catch FileNotFoundError instead")
    membership = [
        node for node in ast.walk(tree)
        if isinstance(node, ast.Compare) and any(isinstance(op, (ast.In, ast.NotIn)) for op in node.ops)
    ]
    check(not membership, "no `in` checks before the lookups: catch KeyError instead")

@test("catches specific exceptions only")
def _():
    too_broad = {"Exception", "BaseException"}
    for handler in (node for node in ast.walk(tree) if isinstance(node, ast.ExceptHandler)):
        check(handler.type is not None, "a bare except: hides real bugs")
        check(not names_in(handler.type) & too_broad, "name the exceptions that mean 'use the default', not Exception")
    for call in calls_named("suppress"):
        check(not set().union(*map(names_in, call.args)) & too_broad, "suppress the specific exceptions, not Exception")
```

```hint
Write the happy path as if nothing can go wrong, `return int(config["server"]["port"])`, then work out what each failure raises: a missing key raises `KeyError`, indexing `None` or a string with `"port"` raises `TypeError`, and `int("http")` raises `ValueError`.
```

```hint
`except (KeyError, TypeError, ValueError):` catches several types at once. For the file, put the `with open(...)` block inside the `try` and catch `(FileNotFoundError, ValueError)`.
```
:::
