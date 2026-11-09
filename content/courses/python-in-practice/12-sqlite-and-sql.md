---
title: SQL with sqlite3
part: Services & Storage
summary: better-sqlite3 becomes sqlite3, with safe parameters, named rows, transactions you commit, constraints and dates.
minutes: 40
---

SQLite ships inside Python: `import sqlite3` gives you a complete SQL database with no server and nothing to install. The module follows the **DB-API** (PEP 249), the interface nearly every Python SQL driver implements, so connections, cursors, `execute` and `fetchall` look the same whether you're talking to SQLite, Postgres through psycopg, or MySQL. Much of what you learn here carries over.

If you've used better-sqlite3, the calls map almost one to one, with two differences that matter: rows come back as **tuples**, and writes happen inside a **transaction you have to commit**. Nearly every example uses an in-memory database, `sqlite3.connect(":memory:")`, which vanishes when the connection closes, so each playground starts from scratch.

## Connecting and running statements

:::compare
```js
import Database from "better-sqlite3";

const db = new Database(":memory:");
db.exec(`
  CREATE TABLE users (id INTEGER PRIMARY KEY, name TEXT NOT NULL, plan TEXT);
`);
const insert = db.prepare("INSERT INTO users (name, plan) VALUES (?, ?)");
insert.run("Ada", "pro");
for (const [name, plan] of rows) insert.run(name, plan);
```
```python
import sqlite3

conn = sqlite3.connect(":memory:")
conn.executescript("""
    CREATE TABLE users (id INTEGER PRIMARY KEY, name TEXT NOT NULL, plan TEXT);
""")
insert = "INSERT INTO users (name, plan) VALUES (?, ?)"
conn.execute(insert, ("Ada", "pro"))
conn.executemany(insert, rows)
```
:::

`connect()` opens a database (a file path, or `":memory:"`) and returns a connection. `conn.execute(sql, params)` runs one statement and returns a **cursor**, the object you read results from. There's no `prepare` step: the module compiles each SQL string once and caches it, so reusing the same string is about as cheap as reusing a prepared statement. `executemany` runs one statement per parameter tuple, and `executescript` runs several semicolon-separated statements without parameters, like `db.exec`.

`conn.execute` is a shortcut. The DB-API spelling, which you'll see in older code and in other drivers, creates the cursor first: `cur = conn.cursor()`, then `cur.execute(...)`.

```python run
import sqlite3

conn = sqlite3.connect(":memory:")
conn.executescript("""
    CREATE TABLE users (id INTEGER PRIMARY KEY, name TEXT NOT NULL, plan TEXT);
    CREATE INDEX users_by_plan ON users (plan);
""")
conn.execute("INSERT INTO users (name, plan) VALUES (?, ?)", ("Ada", "pro"))
conn.executemany(
    "INSERT INTO users (name, plan) VALUES (?, ?)",
    [("Linus", "free"), ("Grace", "pro"), ("Guido", None)],
)
print(conn.execute("SELECT id, name, plan FROM users ORDER BY id").fetchall())
print(sqlite3.sqlite_version)
```

:::note Which SQLite you get
`sqlite3.sqlite_version` is the version of the SQLite library Python is linked against, and newer SQL features depend on it: `RETURNING` needs 3.35, `STRICT` tables 3.37, the `->>` JSON operator 3.38. This sandbox has 3.39. The python.org installers bundle a recent SQLite, while Linux builds use whatever the system provides.
:::

## Fetching rows

:::compare
```js
db.prepare("SELECT * FROM users WHERE id = ?").get(1);     // an object or undefined
db.prepare("SELECT * FROM users").all();                    // an array of objects
for (const user of db.prepare("SELECT * FROM users").iterate()) {}
db.prepare("SELECT name FROM users").pluck().all();         // ["Ada", ...]
```
```python
conn.execute("SELECT * FROM users WHERE id = ?", (1,)).fetchone()   # a tuple or None
conn.execute("SELECT * FROM users").fetchall()                      # a list of tuples
for user in conn.execute("SELECT * FROM users"): ...
[name for (name,) in conn.execute("SELECT name FROM users")]        # ["Ada", ...]
```
:::

A cursor is an iterator over the result rows. `fetchone()` takes the next row, or `None` when there are no more. `fetchall()` collects the rest into a list, `fetchmany(n)` takes a batch, and a `for` loop streams the rows without building a list at all. Each row is a **tuple** by default, so unpacking does the work: `for name, plan in conn.execute(...)`, and `(name,)` for one-column results.

:::pythonic Feed the cursor to the builtins
A cursor is an iterator of tuples, so it plugs straight into Python's own tools: `dict(conn.execute("SELECT id, name FROM users"))` builds a lookup table, a comprehension with `(name,)` plucks a column, and `next(cursor, None)` takes the first row or a default.
:::

```python run
import sqlite3

conn = sqlite3.connect(":memory:")
conn.execute("CREATE TABLE users (id INTEGER PRIMARY KEY, name TEXT, plan TEXT)")
conn.executemany("INSERT INTO users (name, plan) VALUES (?, ?)",
                 [("Ada", "pro"), ("Linus", "free"), ("Grace", "pro")])

print(conn.execute("SELECT name, plan FROM users WHERE id = ?", (2,)).fetchone())
print(conn.execute("SELECT name, plan FROM users WHERE id = ?", (99,)).fetchone())

for name, plan in conn.execute("SELECT name, plan FROM users ORDER BY name"):
    print(f"{name:<6} {plan}")

names = [name for (name,) in conn.execute("SELECT name FROM users")]
plans = dict(conn.execute("SELECT name, plan FROM users"))
print(names, plans)
```

:::tip Check for a missing row
`fetchone()` returns `None` when nothing matches, so `cur.fetchone()[0]` on a lookup raises `TypeError: 'NoneType' object is not subscriptable` the first time the row isn't there. Aggregates such as `SELECT count(*)` always return a row, so they're safe. The walrus keeps the check short: `if (row := cur.fetchone()) is not None:`.
:::

:::quiz output
What does this print?

```python
import sqlite3

conn = sqlite3.connect(":memory:")
conn.execute("CREATE TABLE scores (n INTEGER)")
conn.executemany("INSERT INTO scores VALUES (?)", [(1,), (2,), (3,)])
cur = conn.execute("SELECT n FROM scores ORDER BY n")
first = cur.fetchone()
print(first, cur.fetchall())
```

- [ ] `1 [2, 3]`
- [x] `(1,) [(2,), (3,)]`
- [ ] `(1,) [(1,), (2,), (3,)]`
- [ ] `[1] [[2], [3]]`

Rows are tuples, even with a single column, and a cursor only moves forward: `fetchall()` returns the rows that `fetchone()` hasn't taken yet.
:::

## Parameters, never f-strings

:::compare
```js
// ? placeholders take positional values, @name ones take an object
db.prepare("SELECT * FROM users WHERE plan = ? AND name LIKE ?").all(plan, pattern);
db.prepare("SELECT * FROM users WHERE plan = @plan").all({ plan });
```
```python
# ? placeholders take a tuple, :name ones take a dict
conn.execute("SELECT * FROM users WHERE plan = ? AND name LIKE ?", (plan, pattern))
conn.execute("SELECT * FROM users WHERE plan = :plan", {"plan": plan})
```
:::

Values are sent to SQLite separately from the SQL text, so nothing in them can change what the statement means. Pass a tuple (or a list) for `?` placeholders and a dict for `:name` ones. Mixing them up is an error: named placeholders with a sequence raised a `DeprecationWarning` from 3.12, and raise `ProgrammingError` since 3.14. An f-string, on the other hand, pastes the value into the SQL itself, which is the injection bug you know from template literals:

```python run
import sqlite3

conn = sqlite3.connect(":memory:")
conn.execute("CREATE TABLE users (name TEXT, is_admin INTEGER)")
conn.executemany("INSERT INTO users VALUES (?, ?)", [("ada", 1), ("bob", 0)])

name = "nobody' OR '1'='1"
unsafe = conn.execute(f"SELECT name FROM users WHERE name = '{name}'").fetchall()
safe = conn.execute("SELECT name FROM users WHERE name = ?", (name,)).fetchall()
print("f-string:   ", unsafe)       # every row: the input rewrote the WHERE clause
print("placeholder:", safe)         # no rows: the input is just a string
print(conn.execute("SELECT name FROM users WHERE is_admin = :admin", {"admin": 1}).fetchall())
```

:::quiz output
What does this print?

```python
import sqlite3

conn = sqlite3.connect(":memory:")
conn.execute("CREATE TABLE users (name TEXT)")
rows = conn.execute("SELECT * FROM users WHERE name = ?", ("ada")).fetchall()
print(rows)
```

- [ ] `[]`
- [ ] `[('ada',)]`
- [x] `ProgrammingError`
- [ ] `TypeError`

`("ada")` is just a string in parentheses, not a tuple, and a string is a sequence of characters, so sqlite3 sees three parameters for one placeholder: `Incorrect number of bindings supplied`. A one-element tuple needs its comma, `("ada",)` ([Tuples](lesson:tuples-and-unpacking)).
:::

Placeholders stand for **values** only. Three cases need care:

- **Identifiers and keywords.** Table names, column names and `ASC`/`DESC` can't be parameters. When they must be dynamic, check them against an allowlist (`if column not in {"name", "created_at"}: raise ValueError(column)`) and only then format them into the SQL.
- **`IN` lists.** One placeholder per value: build the markers with `", ".join("?" * len(ids))` and format them into the SQL. That f-string only ever inserts question marks, never data.
- **`LIKE` patterns.** `%` and `_` inside the user's text are wildcards. Escape them, and declare the escape character with `ESCAPE`.

```python run
import sqlite3

conn = sqlite3.connect(":memory:")
conn.execute("CREATE TABLE products (id INTEGER PRIMARY KEY, name TEXT)")
conn.executemany("INSERT INTO products (name) VALUES (?)",
                 [("100% cotton tee",), ("1000 piece puzzle",), ("snake_case mug",), ("snakes and ladders",)])

ids = [1, 3, 4]
markers = ", ".join("?" * len(ids))                   # "?, ?, ?"
print(conn.execute(f"SELECT name FROM products WHERE id IN ({markers})", ids).fetchall())

def contains(text):
    escaped = text.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_")
    return f"%{escaped}%"

for term in ("100%", "snake_"):
    raw = conn.execute("SELECT name FROM products WHERE name LIKE ?", (f"%{term}%",)).fetchall()
    exact = conn.execute("SELECT name FROM products WHERE name LIKE ? ESCAPE '\\'", (contains(term),)).fetchall()
    print(f"{term!r:<9} raw: {raw}\n{'':<9} escaped: {exact}")
```

:::note Placeholder styles differ between drivers
`sqlite3.paramstyle` is `"qmark"`. psycopg, the Postgres driver, uses `%s` and `%(name)s` instead. The DB-API leaves the style to each driver, so placeholders are the one thing that doesn't port between them. ORMs and query builders hide the difference.
:::

## Rows with names: `sqlite3.Row`

:::compare
```js
const user = db.prepare("SELECT id, name FROM users WHERE id = ?").get(1);
user.name;                     // better-sqlite3 returns objects by default

db.prepare("SELECT id, name FROM users").raw().all();   // arrays on request
```
```python
conn.row_factory = sqlite3.Row
user = conn.execute("SELECT id, name FROM users WHERE id = ?", (1,)).fetchone()
user["name"]                   # tuples by default; Row adds access by name

conn.row_factory = None        # back to plain tuples
```
:::

Tuples are fast and unpack nicely, but `row[3]` is unreadable a few lines later. Set `row_factory = sqlite3.Row` on the connection, or on a single cursor, and every row supports `row["name"]` (case-insensitively), indexing, unpacking, `.keys()` and `dict(row)`. A row factory can also be your own function: it receives the cursor and the raw tuple for each row and returns whatever you like, such as a dataclass.

```python run
import sqlite3
from dataclasses import dataclass

conn = sqlite3.connect(":memory:")
conn.execute("CREATE TABLE users (id INTEGER PRIMARY KEY, name TEXT, plan TEXT)")
conn.executemany("INSERT INTO users (name, plan) VALUES (?, ?)", [("Ada", "pro"), ("Linus", "free")])

conn.row_factory = sqlite3.Row
row = conn.execute("SELECT id, name, plan FROM users WHERE name = ?", ("Ada",)).fetchone()
print(row["name"], row["PLAN"], row[0], row.keys())
print(row, dict(row))

@dataclass
class User:
    id: int
    name: str
    plan: str

cursor = conn.cursor()
cursor.row_factory = lambda cursor, values: User(*values)
print(cursor.execute("SELECT id, name, plan FROM users ORDER BY id").fetchall())
```

:::gotcha A `Row` prints as `<sqlite3.Row object at 0x...>`
`sqlite3.Row` has no readable repr, so printing or logging one tells you nothing, and it doesn't compare equal to a tuple or a dict. Convert at the edge with `dict(row)` or `tuple(row)`. If you want plain dicts everywhere, write a factory that zips the column names from `cursor.description` with the values: `{col[0]: value for col, value in zip(cursor.description, row)}`.
:::

## Transactions: nothing is saved until you commit

:::compare
```js
// better-sqlite3 commits every statement as it runs...
db.prepare("UPDATE accounts SET balance = balance - ? WHERE id = ?").run(30, "ada");

// ...unless you wrap the work in a transaction function
const transfer = db.transaction((from, to, amount) => {
  debit.run(amount, from);
  credit.run(amount, to);
});
transfer("ada", "bob", 30);    // BEGIN ... COMMIT, or ROLLBACK if it throws
```
```python
# sqlite3 opens a transaction before the first INSERT/UPDATE/DELETE...
conn.execute("UPDATE accounts SET balance = balance - ? WHERE id = ?", (30, "ada"))
conn.commit()                  # ...and nothing is saved until you commit

def transfer(conn, source, target, amount):
    with conn:                 # commit on success, roll back on an exception
        conn.execute(DEBIT, (amount, source))
        conn.execute(CREDIT, (amount, target))

transfer(conn, "ada", "bob", 30)
```
:::

:::gotcha Writes aren't saved until you commit
better-sqlite3 and `node:sqlite` run in autocommit mode: each statement is saved the moment it runs. Python's sqlite3, by default, quietly issues a `BEGIN` before the first `INSERT`, `UPDATE`, `DELETE` or `REPLACE`, and the transaction stays open until you call `conn.commit()`. Close the connection, or let the process exit, without committing, and SQLite rolls the changes back.
:::

`conn.in_transaction` tells you whether a transaction is open. `executescript` is the odd one out: it commits any open transaction before it runs. This playground uses a file in the sandbox's in-memory filesystem, so it can close the connection and look again:

```python run
import os
import sqlite3

conn = sqlite3.connect("shop.db")                  # a real file, so it can be reopened
conn.execute("CREATE TABLE IF NOT EXISTS orders (id INTEGER PRIMARY KEY, total INTEGER)")
conn.execute("DELETE FROM orders")
conn.commit()

conn.execute("INSERT INTO orders (total) VALUES (?)", (4_200,))
print("in a transaction?", conn.in_transaction)
conn.close()                                       # no commit()...

conn = sqlite3.connect("shop.db")
print("rows after reopening:", conn.execute("SELECT count(*) FROM orders").fetchone()[0])
with conn:                                         # commits when the block ends
    conn.execute("INSERT INTO orders (total) VALUES (?)", (4_200,))
print("rows now:", conn.execute("SELECT count(*) FROM orders").fetchone()[0])
conn.close()
os.remove("shop.db")
```

`with conn:` is the idiomatic way to commit. The connection's context manager commits when the block finishes and rolls back if it raises, so a group of statements is all-or-nothing, like `db.transaction(fn)`. It does **not** close the connection ([Context Managers](lesson:context-managers#context-managers-you-already-use)). Combined with a `CHECK` constraint, that makes a transfer safe:

```python run
import sqlite3

conn = sqlite3.connect(":memory:")
conn.execute("CREATE TABLE accounts (id TEXT PRIMARY KEY, balance INTEGER NOT NULL CHECK (balance >= 0))")
with conn:
    conn.executemany("INSERT INTO accounts VALUES (?, ?)", [("ada", 100), ("bob", 20)])

def transfer(source, target, amount):
    with conn:
        conn.execute("UPDATE accounts SET balance = balance + ? WHERE id = ?", (amount, target))
        conn.execute("UPDATE accounts SET balance = balance - ? WHERE id = ?", (amount, source))

transfer("ada", "bob", 30)
try:
    transfer("bob", "ada", 500)             # the second UPDATE breaks the CHECK
except sqlite3.IntegrityError as exc:
    print("rolled back:", exc)
print(conn.execute("SELECT id, balance FROM accounts ORDER BY id").fetchall())
```

The failed transfer had already credited Ada 500 when the debit hit the constraint, and the rollback undid that first `UPDATE` too.

:::quiz output
What does this print?

```python
import sqlite3

conn = sqlite3.connect(":memory:")
conn.execute("CREATE TABLE events (name TEXT)")
conn.execute("INSERT INTO events VALUES ('signup')")
conn.rollback()
print(conn.execute("SELECT count(*) FROM events").fetchone()[0])
```

- [x] `0`
- [ ] `1`
- [ ] `OperationalError`

The `INSERT` silently opened a transaction, so `rollback()` discards it. The table survives because sqlite3 doesn't open transactions for `CREATE TABLE`. In better-sqlite3 the insert would have been committed on the spot, leaving nothing to roll back.
:::

:::tip `autocommit=False`, the modern setting (3.12+)
3.12 added an `autocommit` parameter. `sqlite3.connect(path, autocommit=False)` gives the DB-API's behaviour: a transaction is always open, `commit()` and `rollback()` start the next one, and `close()` rolls back anything uncommitted. The docs recommend it for new code. `autocommit=True` is better-sqlite3's behaviour, where you write `BEGIN` yourself. The default is still the legacy implicit mode described above, so existing code keeps working.
:::

## Schema and constraints

:::compare
```js
await knex.schema.createTable("users", (t) => {
  t.increments("id");
  t.string("email").notNullable().unique();
});
await knex.schema.createTable("orders", (t) => {
  t.increments("id");
  t.integer("user_id").notNullable().references("users.id");
  t.integer("total_cents").notNullable().checkPositive();
});
```
```python
conn.executescript("""
    CREATE TABLE users (
        id    INTEGER PRIMARY KEY,
        email TEXT NOT NULL UNIQUE
    );
    CREATE TABLE orders (
        id          INTEGER PRIMARY KEY,
        user_id     INTEGER NOT NULL REFERENCES users (id),
        total_cents INTEGER NOT NULL CHECK (total_cents > 0)
    );
""")
```
:::

With sqlite3 you write the DDL yourself, usually in a schema string or a folder of migration files. Constraints are the database enforcing your invariants, whichever code path writes the data. A column declared `INTEGER PRIMARY KEY` becomes an alias for SQLite's row id, so inserting without an id assigns the next one, like `increments()`. `NOT NULL`, `UNIQUE`, `CHECK` and `REFERENCES` all work, and a violation raises `sqlite3.IntegrityError` with the constraint in the message:

```python run
import sqlite3

conn = sqlite3.connect(":memory:")
conn.execute("PRAGMA foreign_keys = ON")            # per connection, right after connecting
conn.executescript("""
    CREATE TABLE users (id INTEGER PRIMARY KEY, email TEXT NOT NULL UNIQUE);
    CREATE TABLE orders (
        id INTEGER PRIMARY KEY,
        user_id INTEGER NOT NULL REFERENCES users (id),
        total_cents INTEGER NOT NULL CHECK (total_cents > 0)
    );
""")
conn.execute("INSERT INTO users (email) VALUES ('ada@example.com')")
attempts = [
    ("INSERT INTO users (email) VALUES (?)", ("ada@example.com",)),
    ("INSERT INTO orders (user_id, total_cents) VALUES (?, ?)", (99, 500)),
    ("INSERT INTO orders (user_id, total_cents) VALUES (?, ?)", (1, -5)),
    ("INSERT INTO users (email) VALUES (?)", (None,)),
]
for sql, params in attempts:
    try:
        conn.execute(sql, params)
    except sqlite3.IntegrityError as exc:
        print("IntegrityError:", exc)
```

:::gotcha Foreign keys are off by default
For backwards compatibility, SQLite ignores `REFERENCES` constraints unless the connection has run `PRAGMA foreign_keys = ON`, and nothing warns you: orphan rows simply go in. Run the pragma on every new connection, outside a transaction, because inside one it silently does nothing. That includes `autocommit=False` connections, which are always inside a transaction: connect with `autocommit=True`, run the pragma, then set `conn.autocommit = False`.
:::

:::gotcha Column types are suggestions
A declared column type is only a preference, which SQLite calls *type affinity*. It converts `'42'` to `42` for an `INTEGER` column and happily stores `'high'` as text right next to it. Declare the table `STRICT` (SQLite 3.37+) and it rejects the wrong types the way Postgres would.
:::

```python run
import sqlite3

conn = sqlite3.connect(":memory:")
conn.execute("CREATE TABLE readings (sensor TEXT, value INTEGER)")
conn.execute("INSERT INTO readings VALUES ('a', 'high'), ('b', '42')")
print(conn.execute("SELECT sensor, value, typeof(value) FROM readings").fetchall())

conn.execute("CREATE TABLE strict_readings (sensor TEXT, value INTEGER) STRICT")
try:
    conn.execute("INSERT INTO strict_readings VALUES ('a', 'high')")
except sqlite3.IntegrityError as exc:
    print("STRICT:", exc)
```

## `lastrowid`, `rowcount` and `RETURNING`

:::compare
```js
const info = db.prepare("INSERT INTO users (email) VALUES (?)").run(email);
info.lastInsertRowid;          // the new id
info.changes;                  // how many rows changed
```
```python
cur = conn.execute("INSERT INTO users (email) VALUES (?)", (email,))
cur.lastrowid                  # the new id
cur.rowcount                   # how many rows changed
```
:::

After an `INSERT`, `cursor.lastrowid` holds the new row's id. After an `INSERT`, `UPDATE` or `DELETE`, `cursor.rowcount` says how many rows changed, which is how you tell "updated" from "no such row". With SQLite 3.35 or later, `RETURNING` hands back any columns you ask for in the same statement, which also covers upserts (`INSERT ... ON CONFLICT ... DO UPDATE`) and bulk updates:

```python run
import sqlite3

conn = sqlite3.connect(":memory:")
conn.execute("CREATE TABLE users (id INTEGER PRIMARY KEY, email TEXT UNIQUE, visits INTEGER DEFAULT 1)")

cursor = conn.execute("INSERT INTO users (email) VALUES (?)", ("ada@example.com",))
print("new id:", cursor.lastrowid)

cursor = conn.execute("UPDATE users SET visits = visits + 1 WHERE email = ?", ("nobody@example.com",))
print("rows updated:", cursor.rowcount)

upsert = """
    INSERT INTO users (email) VALUES (?)
    ON CONFLICT (email) DO UPDATE SET visits = visits + 1
    RETURNING id, email, visits
"""
for email in ["ada@example.com", "grace@example.com", "ada@example.com"]:
    print(conn.execute(upsert, (email,)).fetchone())
```

:::quiz output
What does this print?

```python
import sqlite3

conn = sqlite3.connect(":memory:")
conn.execute("CREATE TABLE tags (id INTEGER PRIMARY KEY, name TEXT)")
cur = conn.executemany("INSERT INTO tags (name) VALUES (?)", [("bug",), ("ui",)])
print(cur.lastrowid, cur.rowcount)
```

- [ ] `2 2`
- [ ] `1 2`
- [x] `None 2`
- [ ] `2 1`

`rowcount` adds up the rows changed by every statement `executemany` ran, but `lastrowid` is only set by `execute()`. Insert one row at a time when you need the ids, or use `RETURNING id`.
:::

## Joins and aggregates

:::compare
```js
const report = await knex("customers as c")
  .leftJoin("orders as o", "o.customer_id", "c.id")
  .groupBy("c.id")
  .select("c.name")
  .count("o.id as orders")
  .sum("o.total_cents as revenue")
  .orderBy("revenue", "desc");
```
```python
report = conn.execute("""
    SELECT c.name, COUNT(o.id) AS orders, COALESCE(SUM(o.total_cents), 0) AS revenue
    FROM customers AS c
    LEFT JOIN orders AS o ON o.customer_id = c.id
    GROUP BY c.id
    ORDER BY revenue DESC
""").fetchall()
```
:::

The standard library has no query builder, and for most work you don't miss one: write the SQL in a triple-quoted string, keep the values in placeholders, and let the database do the joining, grouping and sorting it's built for. Fetching every row into Python and aggregating with loops is the slow way round. SQLite has the usual toolkit: inner and outer joins, `GROUP BY` with `HAVING`, `COUNT`, `SUM`, `AVG`, `MIN` and `MAX`, subqueries and CTEs, window functions and JSON functions.

```python run
import sqlite3

conn = sqlite3.connect(":memory:")
conn.executescript("""
    CREATE TABLE customers (id INTEGER PRIMARY KEY, name TEXT NOT NULL);
    CREATE TABLE orders (id INTEGER PRIMARY KEY, customer_id INTEGER, total_cents INTEGER);
    INSERT INTO customers (name) VALUES ('Ada'), ('Grace'), ('Linus');
    INSERT INTO orders (customer_id, total_cents) VALUES (1, 1200), (1, 800), (2, 4500);
""")
report = conn.execute("""
    SELECT c.name, COUNT(o.id) AS orders, COALESCE(SUM(o.total_cents), 0) AS revenue
    FROM customers AS c
    LEFT JOIN orders AS o ON o.customer_id = c.id
    GROUP BY c.id
    ORDER BY revenue DESC, c.name
""")
for name, orders, revenue in report:
    print(f"{name:<6} {orders} orders  ${revenue / 100:>6.2f}")
```

:::tip Two LEFT JOIN details
Count a column from the joined table, `COUNT(o.id)`, not `COUNT(*)`: a customer without orders still produces one row, padded with `NULL`s, and `COUNT(*)` would count it. And `SUM` over no rows is `NULL`, which arrives in Python as `None`, hence the `COALESCE(..., 0)`.
:::

## Dates, decimals and other types

:::compare
```js
// better-sqlite3 binds numbers, strings, bigints, buffers and null
const due = new Date("2024-06-14");
db.prepare("INSERT INTO tasks (due) VALUES (?)").run(due.toISOString().slice(0, 10));
const back = new Date(db.prepare("SELECT due FROM tasks").pluck().get());
```
```python
# sqlite3 binds None, int, float, str and bytes
due = date(2024, 6, 14)
conn.execute("INSERT INTO tasks (due) VALUES (?)", (due.isoformat(),))
back = date.fromisoformat(conn.execute("SELECT due FROM tasks").fetchone()[0])
```
:::

SQLite has five storage classes, and sqlite3 maps them directly: `None` and `NULL`, `int` and `INTEGER`, `float` and `REAL`, `str` and `TEXT`, `bytes` and `BLOB`. `bool` is a subclass of `int`, so `True` goes in as `1` and comes back as `1`, not `True`. Other types need an adapter: without one, binding a `Decimal`, a `dict` or an instance of your own class raises `ProgrammingError`, so store money as integer cents.

Dates have no storage class at all. sqlite3 used to convert `date` and `datetime` objects to ISO strings behind your back, but those **default adapters and converters were deprecated in 3.12**: they still work, but each use triggers a `DeprecationWarning`. Either convert at the boundary yourself, with `isoformat()` going in and `date.fromisoformat()` coming out as above, or register your own adapters and converters once at start-up. A converter runs for every column whose declared type matches its name, once you connect with `detect_types=sqlite3.PARSE_DECLTYPES`:

```python run
import sqlite3
from datetime import date, datetime, timezone

sqlite3.register_adapter(date, date.isoformat)                 # Python -> SQLite
sqlite3.register_adapter(datetime, datetime.isoformat)
sqlite3.register_converter("date", lambda raw: date.fromisoformat(raw.decode()))   # SQLite -> Python
sqlite3.register_converter("timestamp", lambda raw: datetime.fromisoformat(raw.decode()))

conn = sqlite3.connect(":memory:", detect_types=sqlite3.PARSE_DECLTYPES)
conn.execute("CREATE TABLE tasks (title TEXT, due date, created timestamp, done INTEGER)")
created = datetime(2024, 6, 1, 9, 30, tzinfo=timezone.utc)
conn.execute("INSERT INTO tasks VALUES (?, ?, ?, ?)", ("Ship", date(2024, 6, 14), created, True))

print(conn.execute("SELECT title, due, created, done FROM tasks").fetchone())
print(conn.execute("SELECT typeof(due), due < '2024-07-01' FROM tasks").fetchone())
```

Adapters and converters are global: they apply to every connection in the process (in this sandbox, they even outlive the run), so register them in one place at start-up rather than inside a library function.

:::tip ISO 8601 text sorts like time
Store timestamps as ISO 8601 text in UTC, or as integer Unix seconds. ISO strings in one consistent format compare and sort chronologically as plain text, so `WHERE due < ?` and `ORDER BY created` work without any conversion, and SQLite's own `date()`, `datetime()` and `strftime()` functions understand them. Mixed offsets break the ordering, so convert to UTC first ([Dates & Times](lesson:dates-and-times)).
:::

## ORMs and query builders

:::compare
```js
// Prisma
const pros = await prisma.user.findMany({
  where: { plan: "pro" },
  orderBy: { name: "asc" },
});
await prisma.user.create({ data: { name: "Ada", plan: "pro" } });
```
```python
# SQLAlchemy 2.0
with Session(engine) as session:
    pros = session.scalars(
        select(User).where(User.plan == "pro").order_by(User.name)
    ).all()
    session.add(User(name="Ada", plan="pro"))
    session.commit()
```
:::

Python's standard is **SQLAlchemy**, in two layers. Core is a query builder and connection pool that works across databases, roughly knex. The ORM maps classes to tables, roughly Prisma or TypeORM, and in 2.0 the column types come from type hints:

```python
from sqlalchemy import String, create_engine, select
from sqlalchemy.orm import DeclarativeBase, Mapped, Session, mapped_column

class Base(DeclarativeBase):
    pass

class User(Base):
    __tablename__ = "users"
    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(String(100))
    plan: Mapped[str] = mapped_column(default="free")

engine = create_engine("sqlite:///shop.db")        # or "postgresql+psycopg://..."
Base.metadata.create_all(engine)
```

Migrations come from **Alembic**, the counterpart of `prisma migrate` or knex migrations. **SQLModel**, by FastAPI's author, layers pydantic models on top of SQLAlchemy, and Django ships its own ORM. For Postgres without an ORM, use **psycopg**. sqlite3 itself is synchronous, so in async code reach for `aiosqlite`, `asyncpg` or SQLAlchemy's asyncio support ([Async](lesson:async#blocking-code-and-the-sync-ecosystem)). And for scripts, CLIs, tests and small services, plain sqlite3 with hand-written SQL is a perfectly respectable choice.

## Cheat sheet

| better-sqlite3 | sqlite3 | Notes |
| --- | --- | --- |
| `new Database(":memory:")` | `sqlite3.connect(":memory:")` | or a file path |
| `db.exec(sql)` | `conn.executescript(sql)` | several statements, no parameters |
| `db.prepare(sql).run(a, b)` | `conn.execute(sql, (a, b))` | statements are cached for you |
| `.run({ name })` with `@name` | `conn.execute(sql, {"name": name})` with `:name` | a dict for named placeholders |
| a loop of `.run()` calls | `conn.executemany(sql, rows)` | |
| `.get()` | `cur.fetchone()` | `None` when there's no row |
| `.all()` | `cur.fetchall()` | tuples unless you set `row_factory` |
| `.iterate()` | `for row in cur:` | |
| `.pluck().all()` | `[value for (value,) in cur]` | |
| objects by default | `conn.row_factory = sqlite3.Row` | `row["name"]`, `dict(row)` |
| `info.lastInsertRowid` | `cur.lastrowid` | not set by `executemany` |
| `info.changes` | `cur.rowcount` | `-1` for a `SELECT` |
| autocommit | `conn.commit()` | writes wait for a commit |
| `db.transaction(fn)` | `with conn:` | commits or rolls back; doesn't close |
| `db.pragma("foreign_keys = ON")` | `conn.execute("PRAGMA foreign_keys = ON")` | off by default, per connection |
| `date.toISOString()` | `d.isoformat()`, or a registered adapter | default adapters deprecated in 3.12 |
| Prisma, knex | SQLAlchemy ORM and Core | Alembic for migrations |

## Challenges

:::challenge id=sql-top-customers title="Top customers" difficulty=easy
Write `top_customers(conn, limit)` that returns `(name, total_cents)` tuples for the customers with the highest order totals: biggest total first, ties broken by name, at most `limit` of them. Customers without orders don't appear.

The tables look like this:

```text
customers (id INTEGER PRIMARY KEY, name TEXT)
orders    (id INTEGER PRIMARY KEY, customer_id INTEGER, total_cents INTEGER)
```

Do the work in SQL, with `GROUP BY`, and pass `limit` as a parameter rather than formatting it into the query.

```js
// The habit to break: fetch everything, then aggregate in application code
function topCustomers(db, limit) {
  const totals = new Map();
  const rows = db.prepare(
    "SELECT c.name, o.total_cents FROM customers c JOIN orders o ON o.customer_id = c.id",
  ).all();
  for (const { name, total_cents } of rows) totals.set(name, (totals.get(name) ?? 0) + total_cents);
  return [...totals].sort(([a, x], [b, y]) => y - x || a.localeCompare(b)).slice(0, limit);
}
```

```python starter
import sqlite3

def top_customers(conn, limit):
    ...
```

```python solution
import sqlite3

def top_customers(conn, limit):
    return conn.execute(
        """
        SELECT c.name, SUM(o.total_cents) AS total
        FROM customers AS c
        JOIN orders AS o ON o.customer_id = c.id
        GROUP BY c.id
        ORDER BY total DESC, c.name
        LIMIT ?
        """,
        (limit,),
    ).fetchall()
```

```python tests
import sqlite3

SCHEMA = """
    CREATE TABLE customers (id INTEGER PRIMARY KEY, name TEXT NOT NULL);
    CREATE TABLE orders (
        id INTEGER PRIMARY KEY,
        customer_id INTEGER NOT NULL REFERENCES customers (id),
        total_cents INTEGER NOT NULL
    );
"""

def shop():
    conn = sqlite3.connect(":memory:")
    conn.executescript(SCHEMA + """
        INSERT INTO customers (id, name) VALUES (1, 'Ada'), (2, 'Grace'), (3, 'Linus'), (4, 'Guido');
        INSERT INTO orders (customer_id, total_cents) VALUES
            (1, 1200), (1, 800), (2, 2000), (3, 500), (2, 150), (1, 50);
    """)
    return conn

@test("sums each customer's orders, biggest first")
def _():
    eq(top_customers(shop(), 3), [("Grace", 2150), ("Ada", 2050), ("Linus", 500)])

@test("respects the limit")
def _():
    eq(top_customers(shop(), 1), [("Grace", 2150)])

@test("leaves out customers without orders")
def _():
    names = [name for name, _ in top_customers(shop(), 10)]
    eq(names, ["Grace", "Ada", "Linus"])

@test("breaks ties by name")
def _():
    conn = shop()
    conn.execute("INSERT INTO orders (customer_id, total_cents) VALUES (4, 2150)")
    eq(top_customers(conn, 2), [("Grace", 2150), ("Guido", 2150)])

@test("returns a list of plain tuples")
def _():
    rows = top_customers(shop(), 2)
    check(isinstance(rows, list), "return a list, such as the result of fetchall()")
    eq([type(row) for row in rows], [tuple, tuple])

@test("an empty shop gives an empty list")
def _():
    conn = sqlite3.connect(":memory:")
    conn.executescript(SCHEMA)
    eq(top_customers(conn, 5), [])

@test("groups in SQL and binds the limit")
def _():
    check("GROUP BY" in source.upper(), "let the database do the grouping: use GROUP BY")
    forbids_syntax(ast.JoinedStr, "bind the limit with a ? placeholder, not an f-string")
```

```hint
Join `orders` to `customers`, `GROUP BY c.id`, and select `c.name` with `SUM(o.total_cents)`. A plain (inner) `JOIN` already drops customers who have no orders.
```

```hint
`ORDER BY total DESC, c.name` sorts by the total, then by name. End the query with `LIMIT ?` and pass `(limit,)`: note the comma.
```

```hint
`fetchall()` returns a list of tuples, which is exactly the shape the tests want.
```
:::

:::challenge id=sql-search-products title="Safe product search" difficulty=medium
Write `search_products(conn, *, text=None, max_price=None, tags=())` for a `products (id, name, price_cents, tag)` table. It returns the names of the matching products, sorted by name. Each filter is optional, and every filter that's given must match:

- `text`: the name contains it, ignoring case. A `%` or `_` in `text` is a literal character, not a wildcard.
- `max_price`: `price_cents` is at most this. `0` is a real limit.
- `tags`: the product's `tag` is one of these. An empty collection means no tag filter.

Every value must reach SQLite as a parameter: the tests try to inject SQL through both `text` and `tags`.

```js
function searchProducts(db, { text, maxPrice, tags = [] } = {}) {
  const where = [];
  const params = [];
  if (text != null) { where.push("name LIKE ? ESCAPE '\\'"); params.push(`%${escapeLike(text)}%`); }
  if (maxPrice != null) { where.push("price_cents <= ?"); params.push(maxPrice); }
  if (tags.length) { where.push(`tag IN (${tags.map(() => "?").join(", ")})`); params.push(...tags); }
  const filter = where.length ? `WHERE ${where.join(" AND ")}` : "";
  return db.prepare(`SELECT name FROM products ${filter} ORDER BY name`).pluck().all(...params);
}
```

```python starter
import sqlite3

def search_products(conn, *, text=None, max_price=None, tags=()):
    ...
```

```python solution
import sqlite3

def search_products(conn, *, text=None, max_price=None, tags=()):
    conditions, params = [], []
    if text is not None:
        escaped = text.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_")
        conditions.append("name LIKE ? ESCAPE '\\'")
        params.append(f"%{escaped}%")
    if max_price is not None:
        conditions.append("price_cents <= ?")
        params.append(max_price)
    tags = list(tags)
    if tags:
        conditions.append(f"tag IN ({', '.join('?' * len(tags))})")   # only "?" markers
        params.extend(tags)
    where = f"WHERE {' AND '.join(conditions)}" if conditions else ""
    rows = conn.execute(f"SELECT name FROM products {where} ORDER BY name", params)
    return [name for (name,) in rows]
```

```python tests
import sqlite3

def catalog():
    conn = sqlite3.connect(":memory:")
    conn.execute("""
        CREATE TABLE products (
            id INTEGER PRIMARY KEY, name TEXT NOT NULL,
            price_cents INTEGER NOT NULL, tag TEXT NOT NULL
        )
    """)
    conn.executemany("INSERT INTO products (name, price_cents, tag) VALUES (?, ?, ?)", [
        ("100% cotton tee", 1500, "clothing"),
        ("1000 piece puzzle", 2500, "toys"),
        ("Snake_case mug", 1200, "kitchen"),
        ("Snakes and ladders", 1800, "toys"),
        ("Cotton tote bag", 900, "accessories"),
        ("Espresso cup", 600, "kitchen"),
    ])
    return conn

EVERYTHING = ["100% cotton tee", "1000 piece puzzle", "Cotton tote bag",
              "Espresso cup", "Snake_case mug", "Snakes and ladders"]

@test("no filters returns every name, sorted")
def _():
    eq(search_products(catalog()), EVERYTHING)

@test("text matches part of the name, ignoring case")
def _():
    eq(search_products(catalog(), text="COTTON"), ["100% cotton tee", "Cotton tote bag"])

@test("% and _ in the text are literal characters")
def _():
    eq(search_products(catalog(), text="100%"), ["100% cotton tee"])
    eq(search_products(catalog(), text="snake_"), ["Snake_case mug"])

@test("max_price is inclusive")
def _():
    eq(search_products(catalog(), max_price=1200), ["Cotton tote bag", "Espresso cup", "Snake_case mug"])

@test("a max_price of 0 still filters")
def _():
    eq(search_products(catalog(), max_price=0), [])

@test("tags match any of the given tags")
def _():
    eq(search_products(catalog(), tags=["toys", "kitchen"]),
       ["1000 piece puzzle", "Espresso cup", "Snake_case mug", "Snakes and ladders"])

@test("no tags means no tag filter")
def _():
    eq(search_products(catalog(), tags=[]), EVERYTHING)

@test("filters combine with AND")
def _():
    eq(search_products(catalog(), text="o", max_price=1000, tags=("kitchen", "clothing")), ["Espresso cup"])

@test("input can't inject SQL")
def _():
    conn = catalog()
    eq(search_products(conn, text="' OR '1'='1"), [])
    eq(search_products(conn, tags=["toys') OR ('1'='1"]), [])
    eq(len(search_products(conn)), 6, "the products table should be untouched")
```

```hint
Build two lists as you go: SQL fragments such as `"price_cents <= ?"`, and the matching values. Join the fragments with `" AND "` after a `WHERE` (only if there are any), and pass the list of values to `execute`.
```

```hint
Test the optional filters with `is not None`, not truthiness, or `max_price=0` disappears. For tags, generate one marker per tag with `", ".join("?" * len(tags))`: that f-string only ever inserts question marks.
```

```hint
Escape backslashes first, then `%` and `_`, each with a backslash, wrap the result in `%...%`, and write `name LIKE ? ESCAPE '\'` in the SQL (`'\\'` inside a normal Python string). SQLite's `LIKE` already ignores ASCII case.
```
:::

:::challenge id=sql-transfer title="An atomic transfer" difficulty=medium
Write `transfer(conn, source, target, amount)` that moves `amount` cents between two rows of `accounts (id TEXT PRIMARY KEY, balance INTEGER CHECK (balance >= 0))`, **all or nothing**:

- `amount` must be a positive integer. Otherwise raise `ValueError` without touching the database.
- An account that doesn't exist raises `UnknownAccount`.
- If the source can't cover the amount, raise `InsufficientFunds`. The table's `CHECK` constraint already refuses a negative balance with `sqlite3.IntegrityError`, so you can translate that error rather than reading the balance first.
- After a failure, no balance has changed and no transaction is left open. After a success, the change is committed.

The starter is what a better-sqlite3 habit produces. It works on the happy path, but an unknown target account loses the money.

```js
const transfer = db.transaction((source, target, amount) => {
  if (!Number.isInteger(amount) || amount <= 0) throw new RangeError("bad amount");
  for (const [id, change] of [[source, -amount], [target, amount]]) {
    const { changes } = updateBalance.run(change, id);
    if (changes === 0) throw new UnknownAccount(id);   // rolls back the whole function
  }
});
```

```python starter
import sqlite3

class TransferError(Exception):
    pass

class InsufficientFunds(TransferError):
    pass

class UnknownAccount(TransferError):
    pass

def transfer(conn, source, target, amount):
    conn.execute("UPDATE accounts SET balance = balance - ? WHERE id = ?", (amount, source))
    conn.execute("UPDATE accounts SET balance = balance + ? WHERE id = ?", (amount, target))
    conn.commit()
```

```python solution
import sqlite3

class TransferError(Exception):
    pass

class InsufficientFunds(TransferError):
    pass

class UnknownAccount(TransferError):
    pass

def transfer(conn, source, target, amount):
    if not isinstance(amount, int) or amount <= 0:
        raise ValueError(f"amount must be a positive number of cents, got {amount!r}")
    try:
        with conn:                                   # one transaction: all or nothing
            for account, change in ((source, -amount), (target, amount)):
                cursor = conn.execute(
                    "UPDATE accounts SET balance = balance + ? WHERE id = ?", (change, account)
                )
                if cursor.rowcount == 0:
                    raise UnknownAccount(account)
    except sqlite3.IntegrityError as exc:            # the CHECK (balance >= 0) constraint
        raise InsufficientFunds(f"{source} can't cover {amount}") from exc
```

```python tests
import sqlite3

def bank():
    conn = sqlite3.connect(":memory:")
    conn.execute("CREATE TABLE accounts (id TEXT PRIMARY KEY, balance INTEGER NOT NULL CHECK (balance >= 0))")
    conn.executemany("INSERT INTO accounts VALUES (?, ?)", [("ada", 100), ("bob", 50)])
    conn.commit()
    return conn

def balances(conn):
    return dict(conn.execute("SELECT id, balance FROM accounts"))

@test("moves money between accounts")
def _():
    conn = bank()
    transfer(conn, "ada", "bob", 30)
    eq(balances(conn), {"ada": 70, "bob": 80})

@test("commits the transfer")
def _():
    conn = bank()
    transfer(conn, "ada", "bob", 30)
    check(not conn.in_transaction, "the transfer should be committed, not left open")
    conn.rollback()
    eq(balances(conn), {"ada": 70, "bob": 80})

@test("can empty an account exactly")
def _():
    conn = bank()
    transfer(conn, "bob", "ada", 50)
    eq(balances(conn), {"ada": 150, "bob": 0})

@test("an overdraft raises InsufficientFunds and changes nothing")
def _():
    conn = bank()
    raises(InsufficientFunds, transfer, conn, "bob", "ada", 51)
    eq(balances(conn), {"ada": 100, "bob": 50})

@test("an unknown source raises UnknownAccount")
def _():
    conn = bank()
    raises(UnknownAccount, transfer, conn, "eve", "ada", 10)
    eq(balances(conn), {"ada": 100, "bob": 50})

@test("an unknown target undoes the debit")
def _():
    conn = bank()
    raises(UnknownAccount, transfer, conn, "ada", "eve", 10)
    eq(balances(conn), {"ada": 100, "bob": 50})

@test("leaves no transaction open after a failure")
def _():
    conn = bank()
    raises(UnknownAccount, transfer, conn, "ada", "eve", 10)
    check(not conn.in_transaction, "a failed transfer should be rolled back")
    raises(InsufficientFunds, transfer, conn, "bob", "ada", 500)
    check(not conn.in_transaction, "a failed transfer should be rolled back")

@test("amounts must be positive")
def _():
    conn = bank()
    for amount in (0, -20):
        raises(ValueError, transfer, conn, "ada", "bob", amount)
    eq(balances(conn), {"ada": 100, "bob": 50})
```

```hint
Put both UPDATEs inside `with conn:`. If anything in the block raises, the connection rolls back everything the block did, including an UPDATE that already succeeded.
```

```hint
`cursor.rowcount` is the number of rows an UPDATE changed, and `0` means there's no such account. Raise `UnknownAccount` *inside* the `with` block, so the rollback happens.
```

```hint
Wrap the `with` block in `try:` / `except sqlite3.IntegrityError as exc:` and `raise InsufficientFunds(...) from exc`. By the time the error reaches your `except`, `with conn:` has already rolled back.
```
:::

:::challenge id=sql-task-repo title="A task repository" difficulty=hard
Finish `TaskRepo`, a small repository that stores `Task` records over a connection someone else owns:

- `TaskRepo(conn)` creates the `tasks` table if it's missing (the starter does this).
- `add(title, due)` inserts a task that isn't done and returns it as a `Task` with its new `id`.
- `get(task_id)` returns the `Task`, or `None` if there's no such id.
- `complete(task_id)` marks the task done and returns `True`, or `False` if there's no such task.
- `due_by(day)` returns the tasks that aren't done and are due on or before `day`, ordered by due date, then by id.

Store `due` as ISO 8601 text such as `"2024-06-14"`, and convert at the boundary yourself: pass strings to SQLite and build `date` objects from what comes back. The deprecated default date adapters aren't allowed (one test switches them off), so `Task.due` must come back as a `date` and `Task.done` as a `bool`. Don't change the connection's `row_factory`, because other code shares the connection, and commit each change.

```js
class TaskRepo {
  constructor(db) { this.db = db; db.exec(SCHEMA); }
  add(title, due) {
    const { lastInsertRowid } = this.db
      .prepare("INSERT INTO tasks (title, due) VALUES (?, ?)")
      .run(title, due.toISOString().slice(0, 10));
    return { id: Number(lastInsertRowid), title, due, done: false };
  }
  // get(), complete() and dueBy() follow the same pattern
}
```

```python starter
import sqlite3
from dataclasses import dataclass
from datetime import date

SCHEMA = """
    CREATE TABLE IF NOT EXISTS tasks (
        id    INTEGER PRIMARY KEY,
        title TEXT NOT NULL,
        due   TEXT NOT NULL,
        done  INTEGER NOT NULL DEFAULT 0
    )
"""

@dataclass(frozen=True)
class Task:
    id: int
    title: str
    due: date
    done: bool = False

class TaskRepo:
    def __init__(self, conn):
        self.conn = conn
        self.conn.execute(SCHEMA)

    def add(self, title, due):
        ...

    def get(self, task_id):
        ...

    def complete(self, task_id):
        ...

    def due_by(self, day):
        ...
```

```python solution
import sqlite3
from dataclasses import dataclass
from datetime import date

SCHEMA = """
    CREATE TABLE IF NOT EXISTS tasks (
        id    INTEGER PRIMARY KEY,
        title TEXT NOT NULL,
        due   TEXT NOT NULL,
        done  INTEGER NOT NULL DEFAULT 0
    )
"""

@dataclass(frozen=True)
class Task:
    id: int
    title: str
    due: date
    done: bool = False

def _to_task(cursor, row):
    task_id, title, due, done = row
    return Task(task_id, title, date.fromisoformat(due), bool(done))

class TaskRepo:
    def __init__(self, conn):
        self.conn = conn
        self.conn.execute(SCHEMA)

    def _query(self, sql, params=()):
        cursor = self.conn.cursor()
        cursor.row_factory = _to_task          # this cursor only, not the shared connection
        return cursor.execute(sql, params)

    def add(self, title, due):
        with self.conn:
            cursor = self.conn.execute(
                "INSERT INTO tasks (title, due) VALUES (?, ?)", (title, due.isoformat())
            )
        return Task(cursor.lastrowid, title, due)

    def get(self, task_id):
        return self._query(
            "SELECT id, title, due, done FROM tasks WHERE id = ?", (task_id,)
        ).fetchone()

    def complete(self, task_id):
        with self.conn:
            cursor = self.conn.execute("UPDATE tasks SET done = 1 WHERE id = ?", (task_id,))
        return cursor.rowcount == 1

    def due_by(self, day):
        return self._query(
            "SELECT id, title, due, done FROM tasks WHERE NOT done AND due <= ? ORDER BY due, id",
            (day.isoformat(),),
        ).fetchall()
```

```python tests
import sqlite3
from datetime import date, datetime

def repo():
    return TaskRepo(sqlite3.connect(":memory:"))

def without_date_adapters(fn):
    """Run fn with no date adapter registered, so passing a date object to SQLite fails."""
    saved = {key: sqlite3.adapters.pop(key) for key in list(sqlite3.adapters) if key[0] in (date, datetime)}
    try:
        return fn()
    finally:
        sqlite3.adapters.update(saved)

@test("add() returns the new task with its id")
def _():
    tasks = repo()
    first = tasks.add("Write tests", date(2024, 6, 14))
    second = tasks.add("Ship it", date(2024, 6, 20))
    eq(first, Task(1, "Write tests", date(2024, 6, 14), False))
    eq(second.id, 2)

@test("get() round-trips a task with a real date and bool")
def _():
    tasks = repo()
    task_id = tasks.add("Write tests", date(2024, 6, 14)).id
    task = tasks.get(task_id)
    eq(task, Task(task_id, "Write tests", date(2024, 6, 14), False))
    check(type(task.due) is date, f"due should be a date, got {type(task.due).__name__}")
    check(type(task.done) is bool, f"done should be a bool, got {type(task.done).__name__}")

@test("get() returns None for an unknown id")
def _():
    eq(repo().get(42), None)

@test("complete() marks a task done and reports whether it existed")
def _():
    tasks = repo()
    task_id = tasks.add("Write tests", date(2024, 6, 14)).id
    eq(tasks.complete(task_id), True)
    eq(tasks.get(task_id).done, True)
    eq(tasks.complete(999), False)

@test("due_by() lists open tasks due on or before a day, soonest first")
def _():
    tasks = repo()
    tasks.add("later", date(2024, 7, 1))
    tasks.add("second", date(2024, 6, 14))
    tasks.add("first", date(2024, 6, 10))
    finished = tasks.add("finished", date(2024, 6, 1)).id
    tasks.add("also second", date(2024, 6, 14))
    tasks.complete(finished)
    eq([t.title for t in tasks.due_by(date(2024, 6, 14))], ["first", "second", "also second"])
    eq(tasks.due_by(date(2024, 6, 9)), [])

@test("compares dates across months and years")
def _():
    tasks = repo()
    tasks.add("december", date(2024, 12, 2))
    tasks.add("february", date(2025, 2, 1))
    tasks.add("october", date(2024, 10, 30))
    eq([t.title for t in tasks.due_by(date(2025, 1, 1))], ["october", "december"])

@test("stores due dates as ISO 8601 text")
def _():
    conn = sqlite3.connect(":memory:")
    TaskRepo(conn).add("Write tests", date(2024, 6, 4))
    cursor = conn.cursor()
    cursor.row_factory = None
    eq(cursor.execute("SELECT due, typeof(due) FROM tasks").fetchone(), ("2024-06-04", "text"))

@test("converts dates itself instead of relying on sqlite3's adapters")
def _():
    def scenario():
        tasks = repo()
        tasks.add("Write tests", date(2024, 6, 14))
        return [t.title for t in tasks.due_by(date(2024, 6, 30))]
    eq(without_date_adapters(scenario), ["Write tests"])

@test("commits its changes")
def _():
    conn = sqlite3.connect(":memory:")
    tasks = TaskRepo(conn)
    task_id = tasks.add("Write tests", date(2024, 6, 14)).id
    tasks.complete(task_id)
    conn.rollback()
    eq(tasks.get(task_id).done, True)

@test("leaves the connection's row_factory alone")
def _():
    conn = sqlite3.connect(":memory:")
    tasks = TaskRepo(conn)
    tasks.add("Write tests", date(2024, 6, 14))
    tasks.get(1)
    tasks.due_by(date(2024, 6, 30))
    eq(conn.row_factory, None, "set row_factory on your own cursor instead")
```

```hint
`due.isoformat()` turns a date into `"2024-06-14"`, and `date.fromisoformat(text)` turns it back. ISO dates in one format compare correctly as text, so `due <= ?` works in SQL with `day.isoformat()` as the parameter.
```

```hint
A row factory is any function `(cursor, row) -> object`. Create a cursor with `self.conn.cursor()`, set *its* `row_factory` to a function that builds a `Task` (with `date.fromisoformat` and `bool`), and the shared connection stays untouched.
```

```hint
After the INSERT, `cursor.lastrowid` is the new id. After the UPDATE, `cursor.rowcount` is `1` or `0`. Wrap each write in `with self.conn:` so it commits.
```
:::
