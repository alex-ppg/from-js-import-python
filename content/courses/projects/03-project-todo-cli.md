---
title: Build a Todo CLI
part: Apps & Data
summary: A dataclass model, JSON persistence, argparse subcommands, sorting, table output and a testable main().
minutes: 90
---

A command-line todo list is the "hello, world" of real applications. It needs a data model, persistence, argument parsing, some sorting and formatting, and an entry point that ties them together and reports failures through exit statuses. You'd build it in Node from a class, `JSON.stringify`, `fs`, commander or yargs, and `padEnd`. Each of those has a Python counterpart that's shorter or harder to misuse.

The design choice that matters most is that `main()` takes its arguments as a list and *returns* an exit status instead of exiting. That's what makes the whole CLI testable from inside Python: no subprocess, no real terminal, just `main(["add", "Buy milk"])`. Everything here runs against the browser's in-memory filesystem.

## What you'll build

By the end of step 6, `main(argv)` is a complete CLI with four commands, `add`, `done`, `list` and `remove`, and a `--file` option that says where the tasks live. Here it replays a short session:

```python
for command in [
    "add Renew passport --priority high --due 2026-11-20",
    "add Buy oat milk",
    "add Book dentist -p low --due 2026-12-01",
    "done 2",
    "list",
    "list --all",
    "remove 7",
    "add Water plants --due someday",
]:
    print(f"$ todo {command}")
    status = main(["--file", "demo-tasks.json", *shlex.split(command)])
    if status:
        print(f"[exit status {status}]")
    print()
```

It prints this, with the error messages, which go to stderr, shown in line:

```output
$ todo add Renew passport --priority high --due 2026-11-20
Added #1: Renew passport

$ todo add Buy oat milk
Added #2: Buy oat milk

$ todo add Book dentist -p low --due 2026-12-01
Added #3: Book dentist

$ todo done 2
Completed #2: Buy oat milk

$ todo list
ID  PRIORITY  DUE         TASK
 1  high      2026-11-20  [ ] Renew passport
 3  low       2026-12-01  [ ] Book dentist

$ todo list --all
ID  PRIORITY  DUE         TASK
 1  high      2026-11-20  [ ] Renew passport
 3  low       2026-12-01  [ ] Book dentist
 2  normal    -           [x] Buy oat milk

$ todo remove 7
todo: no task with id 7
[exit status 1]

$ todo add Water plants --due someday
usage: todo add [-h] [-p {high,normal,low}] [--due DUE] title [title ...]
todo add: error: argument --due: invalid date 'someday' (use YYYY-MM-DD)
[exit status 2]
```

`shlex.split()` splits a command line the way a shell does, quotes included, which is how the demo turns each string into an argument list.

:::deep Spoiler: run the finished CLI
This is the whole program you'll write, piece by piece, in the steps below. Open it to try your own commands first: edit the list at the bottom and run it again.

```python run
import argparse
import json
import sys
from collections.abc import Iterable, Iterator
from dataclasses import asdict, dataclass
from datetime import date
from pathlib import Path

PRIORITIES = ("high", "normal", "low")  # most urgent first


@dataclass
class Task:
    id: int
    title: str
    priority: str = "normal"
    due: date | None = None
    done: bool = False

    def __post_init__(self):
        """Reject a blank title or an unknown priority with ValueError."""
        if not self.title.strip():
            raise ValueError("a task needs a title")
        if self.priority not in PRIORITIES:
            raise ValueError(f"unknown priority {self.priority!r}")

    def to_dict(self) -> dict:
        """A JSON-ready dict of the fields, with the due date as an ISO string."""
        return asdict(self) | {"due": self.due.isoformat() if self.due else None}

    @classmethod
    def from_dict(cls, data: dict) -> "Task":
        """The inverse of to_dict(). Missing optional fields get their defaults."""
        due = data.get("due")
        return cls(**(data | {"due": date.fromisoformat(due) if due else None}))


class TaskNotFoundError(LookupError):
    def __init__(self, task_id: int):
        super().__init__(f"no task with id {task_id}")
        self.task_id = task_id


class TaskStore:
    """Tasks kept in memory, and saved to a JSON file after every change."""

    def __init__(self, path: str | Path):
        """Load the tasks saved at path into self.tasks, a dict from id to Task."""
        self.path = Path(path)
        try:
            data = json.loads(self.path.read_text(encoding="utf-8"))
        except FileNotFoundError:
            data = []
        self.tasks: dict[int, Task] = {item["id"]: Task.from_dict(item) for item in data}

    def __iter__(self) -> Iterator[Task]:
        return iter(self.tasks.values())

    def __len__(self) -> int:
        return len(self.tasks)

    def save(self) -> None:
        """Write every task to the file, as a JSON list."""
        data = [task.to_dict() for task in self]
        self.path.write_text(json.dumps(data, indent=2), encoding="utf-8")

    def get(self, task_id: int) -> Task:
        """The task with this id. Raises TaskNotFoundError if there isn't one."""
        try:
            return self.tasks[task_id]
        except KeyError:
            raise TaskNotFoundError(task_id) from None

    def add(self, title: str, priority: str = "normal", due: date | None = None) -> Task:
        """Create a task with the next id, save, and return it."""
        task = Task(max(self.tasks, default=0) + 1, title, priority, due)
        self.tasks[task.id] = task
        self.save()
        return task

    def complete(self, task_id: int) -> Task:
        """Mark a task as done, save, and return it."""
        task = self.get(task_id)
        task.done = True
        self.save()
        return task

    def remove(self, task_id: int) -> Task:
        """Delete a task, save, and return it."""
        task = self.get(task_id)
        del self.tasks[task_id]
        self.save()
        return task


def iso_date(text: str) -> date:
    """An argparse type: parse YYYY-MM-DD, or raise argparse.ArgumentTypeError."""
    try:
        return date.fromisoformat(text)
    except ValueError:
        raise argparse.ArgumentTypeError(f"invalid date {text!r} (use YYYY-MM-DD)") from None


def build_parser() -> argparse.ArgumentParser:
    """The parser for: todo [--file FILE] {add,done,list,remove} ..."""
    parser = argparse.ArgumentParser(prog="todo", description="A todo list in a JSON file.")
    parser.add_argument("--file", default="tasks.json", help="where tasks are kept (default: %(default)s)")
    commands = parser.add_subparsers(dest="command", required=True)

    add = commands.add_parser("add", help="add a task")
    add.add_argument("title", nargs="+", help="what needs doing")
    add.add_argument("-p", "--priority", choices=PRIORITIES, default="normal")
    add.add_argument("--due", type=iso_date, help="due date, YYYY-MM-DD")

    done = commands.add_parser("done", help="mark a task as done")
    done.add_argument("id", type=int)

    show = commands.add_parser("list", help="show open tasks")
    show.add_argument("-a", "--all", action="store_true", help="include finished tasks")

    remove = commands.add_parser("remove", help="delete a task")
    remove.add_argument("id", type=int)
    return parser


def sort_key(task: Task) -> tuple:
    """Open before done, then by priority, then by due date with undated last, then by id."""
    return (task.done, PRIORITIES.index(task.priority), task.due is None, task.due, task.id)


def visible_tasks(tasks: Iterable[Task], *, show_all: bool = False) -> list[Task]:
    """The tasks to list, most urgent first. Finished tasks only appear with show_all."""
    return sorted((task for task in tasks if show_all or not task.done), key=sort_key)


COLUMNS = ("ID", "PRIORITY", "DUE", "TASK")


def format_table(tasks: Iterable[Task]) -> str:
    """The tasks as a plain-text table under a COLUMNS header."""
    rows = [COLUMNS]
    for task in tasks:
        due = task.due.isoformat() if task.due else "-"
        rows.append((str(task.id), task.priority, due, f"[{'x' if task.done else ' '}] {task.title}"))
    widths = [max(map(len, column)) for column in zip(*rows)]
    lines = []
    for row in rows:
        cells = [f"{cell:{align}{width}}" for cell, align, width in zip(row, "><<<", widths)]
        lines.append("  ".join(cells).rstrip())
    return "\n".join(lines)


def main(argv: list[str] | None = None) -> int:
    """Run the todo command line and return its exit status."""
    parser = build_parser()
    try:
        args = parser.parse_args(argv)
    except SystemExit as exc:  # --help, or a usage error that argparse has already reported
        return exc.code
    store = TaskStore(args.file)
    try:
        match args.command:
            case "add":
                task = store.add(" ".join(args.title), args.priority, args.due)
                print(f"Added #{task.id}: {task.title}")
            case "done":
                task = store.complete(args.id)
                print(f"Completed #{task.id}: {task.title}")
            case "remove":
                task = store.remove(args.id)
                print(f"Removed #{task.id}: {task.title}")
            case "list":
                tasks = visible_tasks(store, show_all=args.all)
                print(format_table(tasks) if tasks else "Nothing to do.")
    except (TaskNotFoundError, ValueError) as err:
        print(f"todo: {err}", file=sys.stderr)
        return 1
    return 0


# ---- try it --------------------------------------------------------------

import contextlib
import shlex

Path("demo-tasks.json").unlink(missing_ok=True)  # start from an empty list on every run

with contextlib.redirect_stderr(sys.stdout):      # show error messages in line
    for command in [
        "add Renew passport --priority high --due 2026-11-20",
        "add Buy oat milk",
        "add Book dentist -p low --due 2026-12-01",
        "done 2",
        "list",
        "list --all",
        "remove 7",
        "add Water plants --due someday",
    ]:
        print(f"$ todo {command}")
        status = main(["--file", "demo-tasks.json", *shlex.split(command)])
        if status:
            print(f"[exit status {status}]")
        print()
```
:::

## How the pieces fit

```text
argv: ["add", "Pay", "rent", "-p", "high"]
    │  build_parser().parse_args(argv)                                step 3
    ▼
Namespace(file='tasks.json', command='add', title=['Pay', 'rent'], priority='high', due=None)
    │  main(): match args.command                                     step 6
    ▼
TaskStore("tasks.json")  ⇄  tasks.json                                step 2
    │  add(), complete(), remove()       Task.to_dict(), from_dict()  step 1
    ▼
visible_tasks()  →  format_table()  →  print()                        steps 4, 5
```

| Step | You write | The Python it leans on |
| --- | --- | --- |
| 1 | `Task` validation and JSON conversion | `__post_init__`, `asdict()`, ISO dates, `dict \| dict` ([Dataclasses](lesson:dataclasses-and-enums#asdict-and-json)) |
| 2 | `TaskStore` | `pathlib`, EAFP with `FileNotFoundError`, a custom `LookupError` ([Errors](lesson:exceptions#eafp-ask-forgiveness-not-permission)) |
| 3 | `build_parser()` | `argparse` subcommands and `type=` functions ([Command-Line Tools](lesson:command-line-tools)) |
| 4 | `visible_tasks()` | `sorted()` with a tuple key, `None` sorted last ([Ordering](lesson:truthiness-and-equality#ordering-no-mixing-types)) |
| 5 | `format_table()` | format specs with computed widths, `zip(*rows)` ([Format specs](lesson:strings#the-format-spec-mini-language)) |
| 6 | `main(argv) -> int` | `match` on a command, stdout vs stderr, exit statuses |

Every step's starter contains the reference solution of all the earlier steps, so you can start at any step. Each step's tests focus on the piece you add.

## Step 1: Tasks and JSON

A task is a record: an id, a title, a priority, an optional due date and a done flag. That's a dataclass ([Dataclasses](lesson:dataclasses-and-enums#dataclass-a-class-from-its-fields)), and the starter declares its fields. Your job is the two things a dataclass doesn't do for you: validating a new task, and getting it in and out of JSON.

:::compare Dates in JSON
```js
JSON.stringify({ due: new Date("2026-12-01") });
// '{"due":"2026-12-01T00:00:00.000Z"}', via Date's toJSON()

const task = JSON.parse(text);
task.due;   // a string again: JSON has no dates
```
```python
json.dumps({"due": date(2026, 12, 1)})
# TypeError: Object of type date is not JSON serializable

task = json.loads(text)
task["due"]  # a str, as in JavaScript
```
:::

JavaScript quietly converts a `Date` through its `toJSON()` method. Python's `json` module only handles dicts, lists and tuples, strings, numbers, booleans and `None`, and raises `TypeError` for anything else, which keeps the conversion explicit and in one place. `to_dict()` turns a task into JSON-ready data: `dataclasses.asdict()` builds the dict, and `date.isoformat()` replaces the date with a string. `from_dict()` reverses that with `date.fromisoformat()`.

```python run
import json
from datetime import date

due = date(2026, 12, 1)
print(due.isoformat(), date.fromisoformat("2026-12-01") == due)
try:
    json.dumps({"due": due})
except TypeError as err:
    print("TypeError:", err)
print(json.dumps({"due": due.isoformat(), "done": False, "tags": None}))
```

Three more idioms do the rest of the work:

- **`dict | dict`** (3.9+) returns a new dict in which the right-hand keys win, like `{ ...data, due }` in JavaScript. `asdict(self) | {"due": ...}` overrides one field without touching the others ([Adding, updating and removing](lesson:dicts#adding-updating-and-removing)).
- **`@classmethod`** makes `from_dict()` an alternative constructor, called as `Task.from_dict(data)`, the role a static `fromJSON()` factory plays in JavaScript ([Class methods](lesson:classes#class-methods-and-static-methods)). Inside it, `cls(**fields)` spreads a dict into keyword arguments, so missing optional keys simply get their defaults.
- **`__post_init__`** runs at the end of the generated `__init__`, which makes it the place to reject bad data. Both `Task(...)` and `from_dict()` go through it ([Validation](lesson:dataclasses-and-enums#validation-with-post-init)).

:::gotcha Months start at 1
`date(2026, 12, 1)` is the first of December. JavaScript's `new Date(2026, 12, 1)` is January 2027, because its months count from 0. ISO strings like `"2026-12-01"` read the same way in both languages, which is one more reason to store dates as ISO strings. See [Dates](lesson:standard-library#datetime-dates-without-the-footguns).
:::

:::quiz output
What does this print?

```python
import json
print(json.dumps({"done": False, "due": None}))
```

- [x] `{"done": false, "due": null}`
- [ ] `{"done": False, "due": None}`
- [ ] `{'done': False, 'due': None}`

`json.dumps` writes JSON, not Python: `False` becomes `false` and `None` becomes `null`. The other two options are Python reprs, which is what `print(data)` would show.
:::

:::challenge id=todo-step-1 title="Step 1: Validate tasks and convert them to JSON" difficulty=easy
The starter declares `Task`'s fields. Write its three methods:

- `__post_init__()` raises `ValueError` if the title is empty or only whitespace, or if `priority` isn't one of `PRIORITIES`.
- `to_dict()` returns a dict of all five fields, ready for `json.dumps()`: the due date becomes an ISO string like `"2026-12-01"`, or stays `None`.
- `Task.from_dict(data)` is a classmethod that turns such a dict back into an equal `Task`. Missing optional keys get their defaults, and `data` itself must not change.

```text
>>> Task(1, "Pay rent", "high", date(2026, 12, 1)).to_dict()
{'id': 1, 'title': 'Pay rent', 'priority': 'high', 'due': '2026-12-01', 'done': False}
>>> Task.from_dict({"id": 2, "title": "Call mum"})
Task(id=2, title='Call mum', priority='normal', due=None, done=False)
```

```js
// The JavaScript version
class Task {
  toJSON() {
    return { ...this, due: this.due?.toISOString().slice(0, 10) ?? null };
  }
  static fromJSON(data) {
    return Object.assign(new Task(), data, { due: data.due ? new Date(data.due) : null });
  }
}
```

```python starter
from dataclasses import asdict, dataclass
from datetime import date

PRIORITIES = ("high", "normal", "low")  # most urgent first


@dataclass
class Task:
    id: int
    title: str
    priority: str = "normal"
    due: date | None = None
    done: bool = False

    def __post_init__(self):
        """Reject a blank title or an unknown priority with ValueError."""
        ...

    def to_dict(self) -> dict:
        """A JSON-ready dict of the fields, with the due date as an ISO string."""
        ...

    @classmethod
    def from_dict(cls, data: dict) -> "Task":
        """The inverse of to_dict(). Missing optional fields get their defaults."""
        ...
```

```python solution
from dataclasses import asdict, dataclass
from datetime import date

PRIORITIES = ("high", "normal", "low")  # most urgent first


@dataclass
class Task:
    id: int
    title: str
    priority: str = "normal"
    due: date | None = None
    done: bool = False

    def __post_init__(self):
        """Reject a blank title or an unknown priority with ValueError."""
        if not self.title.strip():
            raise ValueError("a task needs a title")
        if self.priority not in PRIORITIES:
            raise ValueError(f"unknown priority {self.priority!r}")

    def to_dict(self) -> dict:
        """A JSON-ready dict of the fields, with the due date as an ISO string."""
        return asdict(self) | {"due": self.due.isoformat() if self.due else None}

    @classmethod
    def from_dict(cls, data: dict) -> "Task":
        """The inverse of to_dict(). Missing optional fields get their defaults."""
        due = data.get("due")
        return cls(**(data | {"due": date.fromisoformat(due) if due else None}))
```

```python tests
import json
from datetime import date

@test("defaults")
def _():
    task = Task(1, "Buy milk")
    eq((task.priority, task.due, task.done), ("normal", None, False))

@test("to_dict() turns the due date into an ISO string")
def _():
    eq(Task(1, "Pay rent", "high", date(2026, 12, 1)).to_dict(),
       {"id": 1, "title": "Pay rent", "priority": "high", "due": "2026-12-01", "done": False})

@test("to_dict() keeps a missing due date as None")
def _():
    eq(Task(2, "Call mum").to_dict()["due"], None)

@test("to_dict() output survives a JSON round trip")
def _():
    data = Task(3, "Renew passport", "high", date(2026, 11, 20), done=True).to_dict()
    eq(json.loads(json.dumps(data)), data)

@test("from_dict() reverses to_dict()")
def _():
    for task in [Task(1, "Pay rent", "high", date(2026, 12, 1)), Task(2, "Call mum", done=True)]:
        eq(Task.from_dict(task.to_dict()), task)

@test("from_dict() fills in missing optional fields")
def _():
    eq(Task.from_dict({"id": 4, "title": "Water plants"}), Task(4, "Water plants"))

@test("from_dict() doesn't modify its argument")
def _():
    data = {"id": 5, "title": "Book dentist", "due": "2026-12-03"}
    Task.from_dict(data)
    eq(data, {"id": 5, "title": "Book dentist", "due": "2026-12-03"})

@test("blank titles and unknown priorities raise ValueError")
def _():
    raises(ValueError, Task, 1, "Ship it", "urgent")
    raises(ValueError, Task, 1, "   ")
    raises(ValueError, Task.from_dict, {"id": 1, "title": "Ship it", "priority": "asap"})
```

```hint
`__post_init__` is two `if` checks: `not self.title.strip()` and `self.priority not in PRIORITIES`.
```

```hint
`to_dict()` is `asdict(self) | {"due": ...}`, with a conditional expression for the date: `self.due.isoformat() if self.due else None`.
```

```hint
In `from_dict()`, compute the date with `date.fromisoformat(due) if due else None`, where `due = data.get("due")`, then `return cls(**(data | {"due": ...}))`. The `|` builds a new dict, so `data` is untouched.
```
:::

## Step 2: Saving to a file

`TaskStore` keeps the tasks in a dict from id to `Task`, loads them from a JSON file when it's created, and saves them after every change. Reading a file that may not exist yet is the classic first problem:

:::compare Load JSON, or start empty
```js
import { readFileSync, writeFileSync } from "node:fs";

let data;
try {
  data = JSON.parse(readFileSync(path, "utf8"));
} catch (err) {
  if (err.code !== "ENOENT") throw err;
  data = [];
}
writeFileSync(path, JSON.stringify(data, null, 2));
```
```python
from pathlib import Path


try:
    data = json.loads(Path(path).read_text(encoding="utf-8"))
except FileNotFoundError:
    data = []


Path(path).write_text(json.dumps(data, indent=2), encoding="utf-8")
```
:::

Python's exceptions are typed, so instead of comparing `err.code` to `"ENOENT"` you catch `FileNotFoundError`, and every other failure (no permission, a corrupt file) still propagates. Trying first and handling the failure is EAFP, the idiomatic alternative to checking `path.exists()` first, which also leaves a gap between the check and the read ([EAFP](lesson:exceptions#eafp-ask-forgiveness-not-permission)). Always pass `encoding="utf-8"`: without it, Python 3.14 uses the platform's preferred encoding, which on Windows isn't always UTF-8 ([Files](lesson:context-managers#reading-and-writing-files)).

```python run
import json
import tempfile
from pathlib import Path

path = Path(tempfile.mkdtemp()) / "tasks.json"
try:
    data = json.loads(path.read_text(encoding="utf-8"))
except FileNotFoundError:
    data = []
print("loaded:", data)

data.append({"id": 1, "title": "Buy milk"})
path.write_text(json.dumps(data, indent=2), encoding="utf-8")
print(path.read_text(encoding="utf-8"))
```

The rest of the design:

- **A dict keyed by id.** Lookups are `self.tasks[task_id]`, and since dicts keep insertion order, iterating gives the tasks in the order they were added. The next id is `max(self.tasks, default=0) + 1`: iterating a dict yields its keys, and `default=` covers the empty store.
- **A collection protocol.** The provided `__iter__` and `__len__` let a store work with `for`, `list()`, `len()` and `sorted()` like a built-in container ([Container protocols](lesson:dunder-methods#container-protocols)).
- **A domain error.** The provided `TaskNotFoundError` subclasses `LookupError`, the built-in base of `KeyError` and `IndexError`, and carries the `task_id`. Translate the dict's `KeyError` into it with `raise ... from None`, so callers deal with "no such task" rather than with how the store happens to look tasks up.

:::tip A crash mid-write
`write_text()` truncates the file before writing, so a crash halfway through leaves a broken file. Production code writes to a temporary file in the same directory and then `os.replace()`s it over the original, which is atomic. [Context Managers](lesson:context-managers#cm-atomic-write) builds that as a challenge.
:::

:::challenge id=todo-step-2 title="Step 2: Persist tasks in a JSON file" difficulty=medium
Write `TaskStore`'s methods. Keep the tasks in `self.tasks`, a dict from id to `Task`, which the provided `__iter__` and `__len__` rely on.

- `TaskStore(path)` loads the tasks that `save()` wrote to `path`. A missing file means no tasks yet, and opening a store doesn't create the file.
- `save()` writes every task to the file as a JSON list of `to_dict()`s, in id order.
- `get(task_id)` returns the task or raises `TaskNotFoundError(task_id)`.
- `add(title, priority="normal", due=None)` creates a task whose id is one more than the highest id so far (1 for an empty store), saves, and returns it.
- `complete(task_id)` and `remove(task_id)` mark the task done or delete it, save, and return it. Both raise `TaskNotFoundError` for unknown ids.

```text
>>> store = TaskStore("tasks.json")
>>> store.add("Pay rent", "high", date(2026, 12, 1))
Task(id=1, title='Pay rent', priority='high', due=datetime.date(2026, 12, 1), done=False)
>>> print(Path("tasks.json").read_text())
[
  {
    "id": 1,
    "title": "Pay rent",
    ...
```

```python starter
import json
from collections.abc import Iterator
from dataclasses import asdict, dataclass
from datetime import date
from pathlib import Path

PRIORITIES = ("high", "normal", "low")  # most urgent first


@dataclass
class Task:
    id: int
    title: str
    priority: str = "normal"
    due: date | None = None
    done: bool = False

    def __post_init__(self):
        """Reject a blank title or an unknown priority with ValueError."""
        if not self.title.strip():
            raise ValueError("a task needs a title")
        if self.priority not in PRIORITIES:
            raise ValueError(f"unknown priority {self.priority!r}")

    def to_dict(self) -> dict:
        """A JSON-ready dict of the fields, with the due date as an ISO string."""
        return asdict(self) | {"due": self.due.isoformat() if self.due else None}

    @classmethod
    def from_dict(cls, data: dict) -> "Task":
        """The inverse of to_dict(). Missing optional fields get their defaults."""
        due = data.get("due")
        return cls(**(data | {"due": date.fromisoformat(due) if due else None}))


class TaskNotFoundError(LookupError):
    def __init__(self, task_id: int):
        super().__init__(f"no task with id {task_id}")
        self.task_id = task_id


class TaskStore:
    """Tasks kept in memory, and saved to a JSON file after every change."""

    def __init__(self, path: str | Path):
        """Load the tasks saved at path into self.tasks, a dict from id to Task."""
        self.path = Path(path)
        self.tasks: dict[int, Task] = {}
        ...

    def __iter__(self) -> Iterator[Task]:
        return iter(self.tasks.values())

    def __len__(self) -> int:
        return len(self.tasks)

    def save(self) -> None:
        """Write every task to the file, as a JSON list."""
        ...

    def get(self, task_id: int) -> Task:
        """The task with this id. Raises TaskNotFoundError if there isn't one."""
        ...

    def add(self, title: str, priority: str = "normal", due: date | None = None) -> Task:
        """Create a task with the next id, save, and return it."""
        ...

    def complete(self, task_id: int) -> Task:
        """Mark a task as done, save, and return it."""
        ...

    def remove(self, task_id: int) -> Task:
        """Delete a task, save, and return it."""
        ...
```

```python solution
import json
from collections.abc import Iterator
from dataclasses import asdict, dataclass
from datetime import date
from pathlib import Path

PRIORITIES = ("high", "normal", "low")  # most urgent first


@dataclass
class Task:
    id: int
    title: str
    priority: str = "normal"
    due: date | None = None
    done: bool = False

    def __post_init__(self):
        """Reject a blank title or an unknown priority with ValueError."""
        if not self.title.strip():
            raise ValueError("a task needs a title")
        if self.priority not in PRIORITIES:
            raise ValueError(f"unknown priority {self.priority!r}")

    def to_dict(self) -> dict:
        """A JSON-ready dict of the fields, with the due date as an ISO string."""
        return asdict(self) | {"due": self.due.isoformat() if self.due else None}

    @classmethod
    def from_dict(cls, data: dict) -> "Task":
        """The inverse of to_dict(). Missing optional fields get their defaults."""
        due = data.get("due")
        return cls(**(data | {"due": date.fromisoformat(due) if due else None}))


class TaskNotFoundError(LookupError):
    def __init__(self, task_id: int):
        super().__init__(f"no task with id {task_id}")
        self.task_id = task_id


class TaskStore:
    """Tasks kept in memory, and saved to a JSON file after every change."""

    def __init__(self, path: str | Path):
        """Load the tasks saved at path into self.tasks, a dict from id to Task."""
        self.path = Path(path)
        try:
            data = json.loads(self.path.read_text(encoding="utf-8"))
        except FileNotFoundError:
            data = []
        self.tasks: dict[int, Task] = {item["id"]: Task.from_dict(item) for item in data}

    def __iter__(self) -> Iterator[Task]:
        return iter(self.tasks.values())

    def __len__(self) -> int:
        return len(self.tasks)

    def save(self) -> None:
        """Write every task to the file, as a JSON list."""
        data = [task.to_dict() for task in self]
        self.path.write_text(json.dumps(data, indent=2), encoding="utf-8")

    def get(self, task_id: int) -> Task:
        """The task with this id. Raises TaskNotFoundError if there isn't one."""
        try:
            return self.tasks[task_id]
        except KeyError:
            raise TaskNotFoundError(task_id) from None

    def add(self, title: str, priority: str = "normal", due: date | None = None) -> Task:
        """Create a task with the next id, save, and return it."""
        task = Task(max(self.tasks, default=0) + 1, title, priority, due)
        self.tasks[task.id] = task
        self.save()
        return task

    def complete(self, task_id: int) -> Task:
        """Mark a task as done, save, and return it."""
        task = self.get(task_id)
        task.done = True
        self.save()
        return task

    def remove(self, task_id: int) -> Task:
        """Delete a task, save, and return it."""
        task = self.get(task_id)
        del self.tasks[task_id]
        self.save()
        return task
```

```python tests
import json
import tempfile
from datetime import date
from pathlib import Path

def fresh_path():
    return Path(tempfile.mkdtemp()) / "tasks.json"

@test("a store over a missing file is empty, and doesn't create the file")
def _():
    path = fresh_path()
    store = TaskStore(path)
    eq((len(store), list(store)), (0, []))
    check(not path.exists(), "just opening a store shouldn't write anything")

@test("add() assigns increasing ids and returns the task")
def _():
    store = TaskStore(fresh_path())
    eq(store.add("Buy milk"), Task(1, "Buy milk"))
    eq(store.add("Pay rent", "high", date(2026, 12, 1)), Task(2, "Pay rent", "high", date(2026, 12, 1)))

@test("every change is saved as JSON straight away")
def _():
    path = fresh_path()
    TaskStore(path).add("Buy milk", due=date(2026, 11, 20))
    eq(json.loads(path.read_text(encoding="utf-8")),
       [{"id": 1, "title": "Buy milk", "priority": "normal", "due": "2026-11-20", "done": False}])

@test("a new store loads what an earlier one saved")
def _():
    path = fresh_path()
    store = TaskStore(path)
    store.add("Buy milk")
    store.add("Pay rent", "high", date(2026, 12, 1))
    eq(list(TaskStore(path)), list(store))

@test("complete() marks a task as done and saves")
def _():
    path = fresh_path()
    store = TaskStore(path)
    store.add("Buy milk")
    eq(store.complete(1).done, True)
    eq(TaskStore(path).get(1).done, True)

@test("remove() deletes a task and saves")
def _():
    path = fresh_path()
    store = TaskStore(path)
    for title in ["a", "b", "c"]:
        store.add(title)
    eq(store.remove(2).title, "b")
    eq([task.id for task in TaskStore(path)], [1, 3])

@test("a new id comes after the highest existing one")
def _():
    store = TaskStore(fresh_path())
    for title in ["a", "b", "c"]:
        store.add(title)
    store.remove(2)
    eq(store.add("d").id, 4)

@test("unknown ids raise TaskNotFoundError")
def _():
    store = TaskStore(fresh_path())
    store.add("Buy milk")
    for method in (store.get, store.complete, store.remove):
        eq(raises(TaskNotFoundError, method, 99).task_id, 99)
    eq(len(store), 1)
```

```hint
In `__init__`, read the file inside `try`/`except FileNotFoundError`, falling back to an empty list, then build `self.tasks` with a dict comprehension: `{item["id"]: Task.from_dict(item) for item in data}`.
```

```hint
`save()` is `self.path.write_text(json.dumps([task.to_dict() for task in self], indent=2), encoding="utf-8")`. Iterating `self` works because of the provided `__iter__`.
```

```hint
`get()` is EAFP too: `try: return self.tasks[task_id]` and `except KeyError: raise TaskNotFoundError(task_id) from None`. Then `complete()` and `remove()` start with `task = self.get(task_id)`.
```
:::

## Step 3: Parsing the command line

`argparse` is Python's commander or yargs, in the standard library. You declare arguments and options, it parses `sys.argv`, generates `--help`, and rejects bad input with a usage message. Subcommands, like `git commit` and `git push`, come from `add_subparsers()`. Here's the shape on a small CLI of its own:

:::compare Subcommands
```js
// commander
program.option("-v, --verbose");
program
  .command("greet <name...>")
  .option("--times <n>", "how many times", "1");


program.parse(process.argv);
```
```python
parser = argparse.ArgumentParser(prog="hello")
parser.add_argument("-v", "--verbose", action="store_true")
commands = parser.add_subparsers(dest="command", required=True)
greet = commands.add_parser("greet")
greet.add_argument("name", nargs="+")
greet.add_argument("--times", type=int, default=1)

args = parser.parse_args()          # or parse_args(["greet", "Ada"])
```
:::

```python run
import argparse

parser = argparse.ArgumentParser(prog="hello")
parser.add_argument("-v", "--verbose", action="store_true")
commands = parser.add_subparsers(dest="command", required=True)
greet = commands.add_parser("greet", help="say hello")
greet.add_argument("name", nargs="+")
greet.add_argument("--times", type=int, default=1)

print(parser.parse_args(["greet", "Ada", "Lovelace", "--times", "2"]))
print(parser.parse_args(["-v", "greet", "Grace"]))
try:
    parser.parse_args(["greet", "Ada", "--times", "twice"])
except SystemExit as exc:
    print("exit status", exc.code)
```

What to notice:

- `parse_args()` with no argument reads `sys.argv[1:]`. Passing a list is how you test a parser, and how `main(argv)` will call it.
- The result is a `Namespace`, read with attribute access. Option names become attributes with dashes turned into underscores, so `--max-items` arrives as `args.max_items`, and `dest="command"` stores which subcommand ran.
- `type=` takes any function from a string to a value: `int`, `float`, or your own. If it raises `ValueError`, argparse reports "invalid ... value". If it raises `argparse.ArgumentTypeError`, argparse reports your message instead.
- Bad input prints the usage to stderr and raises `SystemExit(2)`, and `--help` prints the help to stdout and raises `SystemExit(0)`. `SystemExit` is an exception like any other, so tests, and `main()` in step 6, can catch it.

:::quiz output
What does this print?

```python
import argparse
parser = argparse.ArgumentParser()
parser.add_argument("--max-items", type=int, default=10)
print(parser.parse_args(["--max-items", "5"]).max_items * 2)
```

- [x] `10`
- [ ] `55`
- [ ] `AttributeError`

`type=int` converts `"5"` to `5` before your code sees it, and the `-` in `--max-items` becomes `_` in the attribute name.
:::

:::challenge id=todo-step-3 title="Step 3: Parse the command line" difficulty=medium
Write `iso_date(text)`, which returns a `date` from `"YYYY-MM-DD"` or raises `argparse.ArgumentTypeError` with a message that mentions `YYYY-MM-DD`, and `build_parser()`, which returns an `ArgumentParser` with `prog="todo"` for this command line:

```text
todo [--file FILE] add TITLE... [-p/--priority {high,normal,low}] [--due YYYY-MM-DD]
todo [--file FILE] done ID
todo [--file FILE] list [-a/--all]
todo [--file FILE] remove ID
```

- `--file` defaults to `tasks.json`, and the subcommand name lands in `args.command`.
- `add` takes one or more words as its title (a list, `args.title`). `--priority` defaults to `"normal"`, and `--due` uses `iso_date` and defaults to `None`.
- `done` and `remove` take an integer `args.id`. `list` has a `--all` flag, `args.all`.

```text
>>> build_parser().parse_args(["add", "Pay", "rent", "-p", "high"])
Namespace(file='tasks.json', command='add', title=['Pay', 'rent'], priority='high', due=None)
```

```python starter
import argparse
import json
from collections.abc import Iterator
from dataclasses import asdict, dataclass
from datetime import date
from pathlib import Path

PRIORITIES = ("high", "normal", "low")  # most urgent first


@dataclass
class Task:
    id: int
    title: str
    priority: str = "normal"
    due: date | None = None
    done: bool = False

    def __post_init__(self):
        """Reject a blank title or an unknown priority with ValueError."""
        if not self.title.strip():
            raise ValueError("a task needs a title")
        if self.priority not in PRIORITIES:
            raise ValueError(f"unknown priority {self.priority!r}")

    def to_dict(self) -> dict:
        """A JSON-ready dict of the fields, with the due date as an ISO string."""
        return asdict(self) | {"due": self.due.isoformat() if self.due else None}

    @classmethod
    def from_dict(cls, data: dict) -> "Task":
        """The inverse of to_dict(). Missing optional fields get their defaults."""
        due = data.get("due")
        return cls(**(data | {"due": date.fromisoformat(due) if due else None}))


class TaskNotFoundError(LookupError):
    def __init__(self, task_id: int):
        super().__init__(f"no task with id {task_id}")
        self.task_id = task_id


class TaskStore:
    """Tasks kept in memory, and saved to a JSON file after every change."""

    def __init__(self, path: str | Path):
        """Load the tasks saved at path into self.tasks, a dict from id to Task."""
        self.path = Path(path)
        try:
            data = json.loads(self.path.read_text(encoding="utf-8"))
        except FileNotFoundError:
            data = []
        self.tasks: dict[int, Task] = {item["id"]: Task.from_dict(item) for item in data}

    def __iter__(self) -> Iterator[Task]:
        return iter(self.tasks.values())

    def __len__(self) -> int:
        return len(self.tasks)

    def save(self) -> None:
        """Write every task to the file, as a JSON list."""
        data = [task.to_dict() for task in self]
        self.path.write_text(json.dumps(data, indent=2), encoding="utf-8")

    def get(self, task_id: int) -> Task:
        """The task with this id. Raises TaskNotFoundError if there isn't one."""
        try:
            return self.tasks[task_id]
        except KeyError:
            raise TaskNotFoundError(task_id) from None

    def add(self, title: str, priority: str = "normal", due: date | None = None) -> Task:
        """Create a task with the next id, save, and return it."""
        task = Task(max(self.tasks, default=0) + 1, title, priority, due)
        self.tasks[task.id] = task
        self.save()
        return task

    def complete(self, task_id: int) -> Task:
        """Mark a task as done, save, and return it."""
        task = self.get(task_id)
        task.done = True
        self.save()
        return task

    def remove(self, task_id: int) -> Task:
        """Delete a task, save, and return it."""
        task = self.get(task_id)
        del self.tasks[task_id]
        self.save()
        return task


def iso_date(text: str) -> date:
    """An argparse type: parse YYYY-MM-DD, or raise argparse.ArgumentTypeError."""
    ...


def build_parser() -> argparse.ArgumentParser:
    """The parser for: todo [--file FILE] {add,done,list,remove} ..."""
    ...
```

```python solution
import argparse
import json
from collections.abc import Iterator
from dataclasses import asdict, dataclass
from datetime import date
from pathlib import Path

PRIORITIES = ("high", "normal", "low")  # most urgent first


@dataclass
class Task:
    id: int
    title: str
    priority: str = "normal"
    due: date | None = None
    done: bool = False

    def __post_init__(self):
        """Reject a blank title or an unknown priority with ValueError."""
        if not self.title.strip():
            raise ValueError("a task needs a title")
        if self.priority not in PRIORITIES:
            raise ValueError(f"unknown priority {self.priority!r}")

    def to_dict(self) -> dict:
        """A JSON-ready dict of the fields, with the due date as an ISO string."""
        return asdict(self) | {"due": self.due.isoformat() if self.due else None}

    @classmethod
    def from_dict(cls, data: dict) -> "Task":
        """The inverse of to_dict(). Missing optional fields get their defaults."""
        due = data.get("due")
        return cls(**(data | {"due": date.fromisoformat(due) if due else None}))


class TaskNotFoundError(LookupError):
    def __init__(self, task_id: int):
        super().__init__(f"no task with id {task_id}")
        self.task_id = task_id


class TaskStore:
    """Tasks kept in memory, and saved to a JSON file after every change."""

    def __init__(self, path: str | Path):
        """Load the tasks saved at path into self.tasks, a dict from id to Task."""
        self.path = Path(path)
        try:
            data = json.loads(self.path.read_text(encoding="utf-8"))
        except FileNotFoundError:
            data = []
        self.tasks: dict[int, Task] = {item["id"]: Task.from_dict(item) for item in data}

    def __iter__(self) -> Iterator[Task]:
        return iter(self.tasks.values())

    def __len__(self) -> int:
        return len(self.tasks)

    def save(self) -> None:
        """Write every task to the file, as a JSON list."""
        data = [task.to_dict() for task in self]
        self.path.write_text(json.dumps(data, indent=2), encoding="utf-8")

    def get(self, task_id: int) -> Task:
        """The task with this id. Raises TaskNotFoundError if there isn't one."""
        try:
            return self.tasks[task_id]
        except KeyError:
            raise TaskNotFoundError(task_id) from None

    def add(self, title: str, priority: str = "normal", due: date | None = None) -> Task:
        """Create a task with the next id, save, and return it."""
        task = Task(max(self.tasks, default=0) + 1, title, priority, due)
        self.tasks[task.id] = task
        self.save()
        return task

    def complete(self, task_id: int) -> Task:
        """Mark a task as done, save, and return it."""
        task = self.get(task_id)
        task.done = True
        self.save()
        return task

    def remove(self, task_id: int) -> Task:
        """Delete a task, save, and return it."""
        task = self.get(task_id)
        del self.tasks[task_id]
        self.save()
        return task


def iso_date(text: str) -> date:
    """An argparse type: parse YYYY-MM-DD, or raise argparse.ArgumentTypeError."""
    try:
        return date.fromisoformat(text)
    except ValueError:
        raise argparse.ArgumentTypeError(f"invalid date {text!r} (use YYYY-MM-DD)") from None


def build_parser() -> argparse.ArgumentParser:
    """The parser for: todo [--file FILE] {add,done,list,remove} ..."""
    parser = argparse.ArgumentParser(prog="todo", description="A todo list in a JSON file.")
    parser.add_argument("--file", default="tasks.json", help="where tasks are kept (default: %(default)s)")
    commands = parser.add_subparsers(dest="command", required=True)

    add = commands.add_parser("add", help="add a task")
    add.add_argument("title", nargs="+", help="what needs doing")
    add.add_argument("-p", "--priority", choices=PRIORITIES, default="normal")
    add.add_argument("--due", type=iso_date, help="due date, YYYY-MM-DD")

    done = commands.add_parser("done", help="mark a task as done")
    done.add_argument("id", type=int)

    show = commands.add_parser("list", help="show open tasks")
    show.add_argument("-a", "--all", action="store_true", help="include finished tasks")

    remove = commands.add_parser("remove", help="delete a task")
    remove.add_argument("id", type=int)
    return parser
```

```python tests
import argparse
import contextlib
import io
from datetime import date

def parse(*argv):
    return build_parser().parse_args(list(argv))

def rejected(*argv):
    """Exit status and stderr output for a command line argparse refuses."""
    err = io.StringIO()
    with contextlib.redirect_stderr(err):
        exc = raises(SystemExit, build_parser().parse_args, list(argv))
    return exc.code, err.getvalue()

@test("add takes a title of one or more words")
def _():
    args = parse("add", "Buy", "oat", "milk")
    eq((args.command, args.title, args.priority, args.due), ("add", ["Buy", "oat", "milk"], "normal", None))

@test("add accepts --priority (or -p) and --due")
def _():
    args = parse("add", "Pay rent", "-p", "high", "--due", "2026-12-01")
    eq((args.title, args.priority, args.due), (["Pay rent"], "high", date(2026, 12, 1)))
    eq(parse("add", "x", "--priority", "low").priority, "low")

@test("done and remove take an integer id")
def _():
    eq((parse("done", "3").command, parse("done", "3").id), ("done", 3))
    eq((parse("remove", "12").command, parse("remove", "12").id), ("remove", 12))

@test("list takes --all (or -a)")
def _():
    eq(parse("list").all, False)
    eq(parse("list", "--all").all, True)
    eq(parse("list", "-a").all, True)

@test("--file comes before the command, and defaults to tasks.json")
def _():
    eq(parse("list").file, "tasks.json")
    eq(parse("--file", "work.json", "list").file, "work.json")

@test("iso_date() parses ISO dates and rejects anything else")
def _():
    eq(iso_date("2026-11-20"), date(2026, 11, 20))
    raises(argparse.ArgumentTypeError, iso_date, "20th of November")

@test("usage errors exit with status 2")
def _():
    for argv in [[], ["fly"], ["add"], ["add", "x", "-p", "urgent"], ["done", "three"], ["list", "--bogus"]]:
        eq(rejected(*argv)[0], 2, f"exit status for {argv}")

@test("a bad --due explains the format")
def _():
    status, message = rejected("add", "x", "--due", "tomorrow")
    eq(status, 2)
    check("YYYY-MM-DD" in message, f"mention YYYY-MM-DD in the error, got {message!r}")

@test("--help prints the usage and exits with status 0")
def _():
    out = io.StringIO()
    with contextlib.redirect_stdout(out):
        exc = raises(SystemExit, build_parser().parse_args, ["--help"])
    eq(exc.code, 0)
    check(out.getvalue().startswith("usage: todo"), "pass prog='todo' so the usage names the command")
```

```hint
`iso_date()` wraps `date.fromisoformat(text)` in a `try` and turns its `ValueError` into `raise argparse.ArgumentTypeError(f"invalid date {text!r} (use YYYY-MM-DD)") from None`.
```

```hint
Start with `parser = argparse.ArgumentParser(prog="todo")`, add `--file` with `default="tasks.json"`, then `commands = parser.add_subparsers(dest="command", required=True)`.
```

```hint
Each subcommand is `commands.add_parser("add")` and so on, with its own `add_argument()` calls: `nargs="+"` for the title, `choices=PRIORITIES` and `default="normal"` for the priority, `type=iso_date` for `--due`, `type=int` for ids and `action="store_true"` for `--all`.
```
:::

## Step 4: Filtering and sorting

`list` shows the open tasks, most urgent first: by priority, then by due date with undated tasks last, then by id. `list --all` adds the finished tasks after the open ones. In JavaScript that's a comparator chained with `||`. In Python it's a key function that returns a tuple, since tuples compare item by item ([Sorting](lesson:lists#sorting-and-reversing)):

:::compare Sort by several keys
```js
events.toSorted((a, b) =>
  a.cancelled - b.cancelled ||
  (a.starts === null) - (b.starts === null) ||
  a.starts - b.starts ||
  a.title.localeCompare(b.title));
```
```python
sorted(events, key=lambda e: (
    e.cancelled,
    e.starts is None,
    e.starts,
    e.title,
))
```
:::

Each item of the key does one job:

- **Booleans sort `False` first**, because `False < True`. A `done` flag as the first item puts open tasks before finished ones.
- **`(due is None, due)` puts missing dates last.** Dated tasks get `False` and sort first. Two keys only get as far as comparing `None` with `None` when both are undated, and then they're equal, so `None < date` is never evaluated. That's the trick from [Ordering: no mixing types](lesson:truthiness-and-equality#ordering-no-mixing-types).
- **An order that isn't alphabetical** comes from a position in a sequence: `PRIORITIES.index(task.priority)` is 0 for `"high"`. `"high" < "low" < "normal"` alphabetically, which isn't what anyone wants.

```python run
from datetime import date

dues = [date(2026, 12, 1), None, date(2026, 11, 3), None]
print(sorted(dues, key=lambda d: (d is None, d)))
print(sorted([True, False, True]))
print(("high", "normal", "low").index("low"))
try:
    sorted(dues)
except TypeError as err:
    print("TypeError:", err)
```

`show_all` is **keyword-only**: the `*` in `visible_tasks(tasks, *, show_all=False)` means a caller has to write `show_all=True`, which reads better than a bare `True` and rules out mixing up the arguments ([Keyword arguments](lesson:functions#keyword-arguments-replace-options-objects)).

:::challenge id=todo-step-4 title="Step 4: Pick and order the tasks to show" difficulty=easy
Write `sort_key(task)` and `visible_tasks(tasks, *, show_all=False)`:

- `visible_tasks()` takes any iterable of tasks and returns a new list. It leaves out finished tasks unless `show_all=True`.
- Open tasks come before finished ones. Within each group, order by priority (high, normal, low), then by due date, earliest first and undated last, then by id.
- `show_all` can only be passed by keyword.

```text
>>> [t.id for t in visible_tasks(TASKS)]          # with the tasks from the tests
[4, 2, 6, 8, 7, 5, 1]
```

```python starter
import argparse
import json
from collections.abc import Iterable, Iterator
from dataclasses import asdict, dataclass
from datetime import date
from pathlib import Path

PRIORITIES = ("high", "normal", "low")  # most urgent first


@dataclass
class Task:
    id: int
    title: str
    priority: str = "normal"
    due: date | None = None
    done: bool = False

    def __post_init__(self):
        """Reject a blank title or an unknown priority with ValueError."""
        if not self.title.strip():
            raise ValueError("a task needs a title")
        if self.priority not in PRIORITIES:
            raise ValueError(f"unknown priority {self.priority!r}")

    def to_dict(self) -> dict:
        """A JSON-ready dict of the fields, with the due date as an ISO string."""
        return asdict(self) | {"due": self.due.isoformat() if self.due else None}

    @classmethod
    def from_dict(cls, data: dict) -> "Task":
        """The inverse of to_dict(). Missing optional fields get their defaults."""
        due = data.get("due")
        return cls(**(data | {"due": date.fromisoformat(due) if due else None}))


class TaskNotFoundError(LookupError):
    def __init__(self, task_id: int):
        super().__init__(f"no task with id {task_id}")
        self.task_id = task_id


class TaskStore:
    """Tasks kept in memory, and saved to a JSON file after every change."""

    def __init__(self, path: str | Path):
        """Load the tasks saved at path into self.tasks, a dict from id to Task."""
        self.path = Path(path)
        try:
            data = json.loads(self.path.read_text(encoding="utf-8"))
        except FileNotFoundError:
            data = []
        self.tasks: dict[int, Task] = {item["id"]: Task.from_dict(item) for item in data}

    def __iter__(self) -> Iterator[Task]:
        return iter(self.tasks.values())

    def __len__(self) -> int:
        return len(self.tasks)

    def save(self) -> None:
        """Write every task to the file, as a JSON list."""
        data = [task.to_dict() for task in self]
        self.path.write_text(json.dumps(data, indent=2), encoding="utf-8")

    def get(self, task_id: int) -> Task:
        """The task with this id. Raises TaskNotFoundError if there isn't one."""
        try:
            return self.tasks[task_id]
        except KeyError:
            raise TaskNotFoundError(task_id) from None

    def add(self, title: str, priority: str = "normal", due: date | None = None) -> Task:
        """Create a task with the next id, save, and return it."""
        task = Task(max(self.tasks, default=0) + 1, title, priority, due)
        self.tasks[task.id] = task
        self.save()
        return task

    def complete(self, task_id: int) -> Task:
        """Mark a task as done, save, and return it."""
        task = self.get(task_id)
        task.done = True
        self.save()
        return task

    def remove(self, task_id: int) -> Task:
        """Delete a task, save, and return it."""
        task = self.get(task_id)
        del self.tasks[task_id]
        self.save()
        return task


def iso_date(text: str) -> date:
    """An argparse type: parse YYYY-MM-DD, or raise argparse.ArgumentTypeError."""
    try:
        return date.fromisoformat(text)
    except ValueError:
        raise argparse.ArgumentTypeError(f"invalid date {text!r} (use YYYY-MM-DD)") from None


def build_parser() -> argparse.ArgumentParser:
    """The parser for: todo [--file FILE] {add,done,list,remove} ..."""
    parser = argparse.ArgumentParser(prog="todo", description="A todo list in a JSON file.")
    parser.add_argument("--file", default="tasks.json", help="where tasks are kept (default: %(default)s)")
    commands = parser.add_subparsers(dest="command", required=True)

    add = commands.add_parser("add", help="add a task")
    add.add_argument("title", nargs="+", help="what needs doing")
    add.add_argument("-p", "--priority", choices=PRIORITIES, default="normal")
    add.add_argument("--due", type=iso_date, help="due date, YYYY-MM-DD")

    done = commands.add_parser("done", help="mark a task as done")
    done.add_argument("id", type=int)

    show = commands.add_parser("list", help="show open tasks")
    show.add_argument("-a", "--all", action="store_true", help="include finished tasks")

    remove = commands.add_parser("remove", help="delete a task")
    remove.add_argument("id", type=int)
    return parser


def sort_key(task: Task) -> tuple:
    """Open before done, then by priority, then by due date with undated last, then by id."""
    ...


def visible_tasks(tasks: Iterable[Task], *, show_all: bool = False) -> list[Task]:
    """The tasks to list, most urgent first. Finished tasks only appear with show_all."""
    ...
```

```python solution
import argparse
import json
from collections.abc import Iterable, Iterator
from dataclasses import asdict, dataclass
from datetime import date
from pathlib import Path

PRIORITIES = ("high", "normal", "low")  # most urgent first


@dataclass
class Task:
    id: int
    title: str
    priority: str = "normal"
    due: date | None = None
    done: bool = False

    def __post_init__(self):
        """Reject a blank title or an unknown priority with ValueError."""
        if not self.title.strip():
            raise ValueError("a task needs a title")
        if self.priority not in PRIORITIES:
            raise ValueError(f"unknown priority {self.priority!r}")

    def to_dict(self) -> dict:
        """A JSON-ready dict of the fields, with the due date as an ISO string."""
        return asdict(self) | {"due": self.due.isoformat() if self.due else None}

    @classmethod
    def from_dict(cls, data: dict) -> "Task":
        """The inverse of to_dict(). Missing optional fields get their defaults."""
        due = data.get("due")
        return cls(**(data | {"due": date.fromisoformat(due) if due else None}))


class TaskNotFoundError(LookupError):
    def __init__(self, task_id: int):
        super().__init__(f"no task with id {task_id}")
        self.task_id = task_id


class TaskStore:
    """Tasks kept in memory, and saved to a JSON file after every change."""

    def __init__(self, path: str | Path):
        """Load the tasks saved at path into self.tasks, a dict from id to Task."""
        self.path = Path(path)
        try:
            data = json.loads(self.path.read_text(encoding="utf-8"))
        except FileNotFoundError:
            data = []
        self.tasks: dict[int, Task] = {item["id"]: Task.from_dict(item) for item in data}

    def __iter__(self) -> Iterator[Task]:
        return iter(self.tasks.values())

    def __len__(self) -> int:
        return len(self.tasks)

    def save(self) -> None:
        """Write every task to the file, as a JSON list."""
        data = [task.to_dict() for task in self]
        self.path.write_text(json.dumps(data, indent=2), encoding="utf-8")

    def get(self, task_id: int) -> Task:
        """The task with this id. Raises TaskNotFoundError if there isn't one."""
        try:
            return self.tasks[task_id]
        except KeyError:
            raise TaskNotFoundError(task_id) from None

    def add(self, title: str, priority: str = "normal", due: date | None = None) -> Task:
        """Create a task with the next id, save, and return it."""
        task = Task(max(self.tasks, default=0) + 1, title, priority, due)
        self.tasks[task.id] = task
        self.save()
        return task

    def complete(self, task_id: int) -> Task:
        """Mark a task as done, save, and return it."""
        task = self.get(task_id)
        task.done = True
        self.save()
        return task

    def remove(self, task_id: int) -> Task:
        """Delete a task, save, and return it."""
        task = self.get(task_id)
        del self.tasks[task_id]
        self.save()
        return task


def iso_date(text: str) -> date:
    """An argparse type: parse YYYY-MM-DD, or raise argparse.ArgumentTypeError."""
    try:
        return date.fromisoformat(text)
    except ValueError:
        raise argparse.ArgumentTypeError(f"invalid date {text!r} (use YYYY-MM-DD)") from None


def build_parser() -> argparse.ArgumentParser:
    """The parser for: todo [--file FILE] {add,done,list,remove} ..."""
    parser = argparse.ArgumentParser(prog="todo", description="A todo list in a JSON file.")
    parser.add_argument("--file", default="tasks.json", help="where tasks are kept (default: %(default)s)")
    commands = parser.add_subparsers(dest="command", required=True)

    add = commands.add_parser("add", help="add a task")
    add.add_argument("title", nargs="+", help="what needs doing")
    add.add_argument("-p", "--priority", choices=PRIORITIES, default="normal")
    add.add_argument("--due", type=iso_date, help="due date, YYYY-MM-DD")

    done = commands.add_parser("done", help="mark a task as done")
    done.add_argument("id", type=int)

    show = commands.add_parser("list", help="show open tasks")
    show.add_argument("-a", "--all", action="store_true", help="include finished tasks")

    remove = commands.add_parser("remove", help="delete a task")
    remove.add_argument("id", type=int)
    return parser


def sort_key(task: Task) -> tuple:
    """Open before done, then by priority, then by due date with undated last, then by id."""
    return (task.done, PRIORITIES.index(task.priority), task.due is None, task.due, task.id)


def visible_tasks(tasks: Iterable[Task], *, show_all: bool = False) -> list[Task]:
    """The tasks to list, most urgent first. Finished tasks only appear with show_all."""
    return sorted((task for task in tasks if show_all or not task.done), key=sort_key)
```

```python tests
from datetime import date

TASKS = [
    Task(1, "Water plants", "low"),
    Task(2, "Renew passport", "high", date(2026, 11, 20)),
    Task(3, "Buy milk", done=True),
    Task(4, "Pay rent", "high", date(2026, 11, 3)),
    Task(5, "Call mum"),
    Task(6, "File taxes", "high"),
    Task(7, "Book dentist", due=date(2026, 12, 1)),
    Task(8, "Fix bike", "high"),
]

def ids(tasks):
    return [task.id for task in tasks]

@test("leaves out finished tasks")
def _():
    check(3 not in ids(visible_tasks(TASKS)), "task 3 is done and shouldn't be listed")
    eq(len(visible_tasks(TASKS)), 7)

@test("orders by priority, then due date with undated last, then id")
def _():
    eq(ids(visible_tasks(TASKS)), [4, 2, 6, 8, 7, 5, 1])

@test("ties go to the lower id, whatever the input order")
def _():
    eq(ids(visible_tasks(reversed(TASKS))), [4, 2, 6, 8, 7, 5, 1])

@test("show_all adds the finished tasks after the open ones")
def _():
    eq(ids(visible_tasks(TASKS, show_all=True)), [4, 2, 6, 8, 7, 5, 1, 3])

@test("show_all is keyword-only")
def _():
    raises(TypeError, visible_tasks, TASKS, True)

@test("accepts any iterable of tasks")
def _():
    eq(ids(visible_tasks(task for task in TASKS)), [4, 2, 6, 8, 7, 5, 1])

@test("returns a new list and leaves the input alone")
def _():
    tasks = list(TASKS)
    result = visible_tasks(tasks, show_all=True)
    check(result is not tasks, "return a new list")
    eq(ids(tasks), [1, 2, 3, 4, 5, 6, 7, 8])

@test("no tasks, no rows")
def _():
    eq(visible_tasks([]), [])
```

```hint
`sort_key()` returns a tuple: `(task.done, PRIORITIES.index(task.priority), task.due is None, task.due, task.id)`.
```

```hint
`visible_tasks()` is one `sorted()` call over a generator expression that filters with `if show_all or not task.done`, with `key=sort_key`.
```
:::

## Step 5: A text table

`list` prints the tasks as an aligned table. Each column is as wide as its widest cell, the `ID` column is right-aligned, and no line ends in spaces:

```text
ID  PRIORITY  DUE         TASK
 1  high      2026-11-20  [ ] Renew passport
10  low       2026-12-01  [ ] Book dentist
 2  normal    -           [x] Buy oat milk
```

Format specs do the padding ([The format-spec mini-language](lesson:strings#the-format-spec-mini-language)). `<` and `>` align a value left or right within a width, and the width can itself be a replacement field, so it can come from a variable:

:::compare Padding to a width
```js
"7".padStart(3);               // "  7"
"high".padEnd(8);              // "high    "
"x".padEnd(width) + "|";       // the width from a variable
```
```python
f"{'7':>3}"                    # '  7'
f"{'high':<8}"                 # 'high    '
f"{'x':<{width}}|"             # the width from a variable
```
:::

To get each column's width, transpose the rows. `zip(*rows)` turns a list of rows into one tuple per column ([Transpose with `zip(*rows)`](lesson:tuples-and-unpacking#transpose-with-zip-rows)). The alignment can come from a variable too, so `zip()` can hand out a cell, an alignment character and a width together:

```python run
rows = [("ID", "PRIORITY"), ("7", "high"), ("12", "normal")]
columns = list(zip(*rows))
print(columns)
widths = [max(len(cell) for cell in column) for column in columns]
print(widths)
for cell, align, width in zip(("7", "high"), "><", widths):
    print(f"[{cell:{align}{width}}]")
```

:::gotcha Don't loop over the tasks twice
`format_table()` accepts any iterable, and a generator can only be read once. If you loop over `tasks` once to measure the widths and again to print the rows, the second loop sees nothing. Turn the tasks into rows of strings first, then work with that list ([The exhaustion trap](lesson:iterators-and-generators#lazy-builtins-and-the-exhaustion-trap)).
:::

:::challenge id=todo-step-5 title="Step 5: Format a table" difficulty=medium
Write `format_table(tasks)`, which returns the table as one string, with lines joined by `"\n"` and no trailing newline:

- The first row is the `COLUMNS` header (provided), and then there's one row per task, in the order given.
- The cells are the id, the priority, the due date as `YYYY-MM-DD` or `-`, and the title prefixed with `[x] ` if the task is done or `[ ] ` if not.
- Each column is as wide as its widest cell, header included. Columns are separated by two spaces. The `ID` column is right-aligned and the others are left-aligned.
- No line ends with spaces. With no tasks, the table is just the header.

```python starter
import argparse
import json
from collections.abc import Iterable, Iterator
from dataclasses import asdict, dataclass
from datetime import date
from pathlib import Path

PRIORITIES = ("high", "normal", "low")  # most urgent first


@dataclass
class Task:
    id: int
    title: str
    priority: str = "normal"
    due: date | None = None
    done: bool = False

    def __post_init__(self):
        """Reject a blank title or an unknown priority with ValueError."""
        if not self.title.strip():
            raise ValueError("a task needs a title")
        if self.priority not in PRIORITIES:
            raise ValueError(f"unknown priority {self.priority!r}")

    def to_dict(self) -> dict:
        """A JSON-ready dict of the fields, with the due date as an ISO string."""
        return asdict(self) | {"due": self.due.isoformat() if self.due else None}

    @classmethod
    def from_dict(cls, data: dict) -> "Task":
        """The inverse of to_dict(). Missing optional fields get their defaults."""
        due = data.get("due")
        return cls(**(data | {"due": date.fromisoformat(due) if due else None}))


class TaskNotFoundError(LookupError):
    def __init__(self, task_id: int):
        super().__init__(f"no task with id {task_id}")
        self.task_id = task_id


class TaskStore:
    """Tasks kept in memory, and saved to a JSON file after every change."""

    def __init__(self, path: str | Path):
        """Load the tasks saved at path into self.tasks, a dict from id to Task."""
        self.path = Path(path)
        try:
            data = json.loads(self.path.read_text(encoding="utf-8"))
        except FileNotFoundError:
            data = []
        self.tasks: dict[int, Task] = {item["id"]: Task.from_dict(item) for item in data}

    def __iter__(self) -> Iterator[Task]:
        return iter(self.tasks.values())

    def __len__(self) -> int:
        return len(self.tasks)

    def save(self) -> None:
        """Write every task to the file, as a JSON list."""
        data = [task.to_dict() for task in self]
        self.path.write_text(json.dumps(data, indent=2), encoding="utf-8")

    def get(self, task_id: int) -> Task:
        """The task with this id. Raises TaskNotFoundError if there isn't one."""
        try:
            return self.tasks[task_id]
        except KeyError:
            raise TaskNotFoundError(task_id) from None

    def add(self, title: str, priority: str = "normal", due: date | None = None) -> Task:
        """Create a task with the next id, save, and return it."""
        task = Task(max(self.tasks, default=0) + 1, title, priority, due)
        self.tasks[task.id] = task
        self.save()
        return task

    def complete(self, task_id: int) -> Task:
        """Mark a task as done, save, and return it."""
        task = self.get(task_id)
        task.done = True
        self.save()
        return task

    def remove(self, task_id: int) -> Task:
        """Delete a task, save, and return it."""
        task = self.get(task_id)
        del self.tasks[task_id]
        self.save()
        return task


def iso_date(text: str) -> date:
    """An argparse type: parse YYYY-MM-DD, or raise argparse.ArgumentTypeError."""
    try:
        return date.fromisoformat(text)
    except ValueError:
        raise argparse.ArgumentTypeError(f"invalid date {text!r} (use YYYY-MM-DD)") from None


def build_parser() -> argparse.ArgumentParser:
    """The parser for: todo [--file FILE] {add,done,list,remove} ..."""
    parser = argparse.ArgumentParser(prog="todo", description="A todo list in a JSON file.")
    parser.add_argument("--file", default="tasks.json", help="where tasks are kept (default: %(default)s)")
    commands = parser.add_subparsers(dest="command", required=True)

    add = commands.add_parser("add", help="add a task")
    add.add_argument("title", nargs="+", help="what needs doing")
    add.add_argument("-p", "--priority", choices=PRIORITIES, default="normal")
    add.add_argument("--due", type=iso_date, help="due date, YYYY-MM-DD")

    done = commands.add_parser("done", help="mark a task as done")
    done.add_argument("id", type=int)

    show = commands.add_parser("list", help="show open tasks")
    show.add_argument("-a", "--all", action="store_true", help="include finished tasks")

    remove = commands.add_parser("remove", help="delete a task")
    remove.add_argument("id", type=int)
    return parser


def sort_key(task: Task) -> tuple:
    """Open before done, then by priority, then by due date with undated last, then by id."""
    return (task.done, PRIORITIES.index(task.priority), task.due is None, task.due, task.id)


def visible_tasks(tasks: Iterable[Task], *, show_all: bool = False) -> list[Task]:
    """The tasks to list, most urgent first. Finished tasks only appear with show_all."""
    return sorted((task for task in tasks if show_all or not task.done), key=sort_key)


COLUMNS = ("ID", "PRIORITY", "DUE", "TASK")


def format_table(tasks: Iterable[Task]) -> str:
    """The tasks as a plain-text table under a COLUMNS header."""
    ...
```

```python solution
import argparse
import json
from collections.abc import Iterable, Iterator
from dataclasses import asdict, dataclass
from datetime import date
from pathlib import Path

PRIORITIES = ("high", "normal", "low")  # most urgent first


@dataclass
class Task:
    id: int
    title: str
    priority: str = "normal"
    due: date | None = None
    done: bool = False

    def __post_init__(self):
        """Reject a blank title or an unknown priority with ValueError."""
        if not self.title.strip():
            raise ValueError("a task needs a title")
        if self.priority not in PRIORITIES:
            raise ValueError(f"unknown priority {self.priority!r}")

    def to_dict(self) -> dict:
        """A JSON-ready dict of the fields, with the due date as an ISO string."""
        return asdict(self) | {"due": self.due.isoformat() if self.due else None}

    @classmethod
    def from_dict(cls, data: dict) -> "Task":
        """The inverse of to_dict(). Missing optional fields get their defaults."""
        due = data.get("due")
        return cls(**(data | {"due": date.fromisoformat(due) if due else None}))


class TaskNotFoundError(LookupError):
    def __init__(self, task_id: int):
        super().__init__(f"no task with id {task_id}")
        self.task_id = task_id


class TaskStore:
    """Tasks kept in memory, and saved to a JSON file after every change."""

    def __init__(self, path: str | Path):
        """Load the tasks saved at path into self.tasks, a dict from id to Task."""
        self.path = Path(path)
        try:
            data = json.loads(self.path.read_text(encoding="utf-8"))
        except FileNotFoundError:
            data = []
        self.tasks: dict[int, Task] = {item["id"]: Task.from_dict(item) for item in data}

    def __iter__(self) -> Iterator[Task]:
        return iter(self.tasks.values())

    def __len__(self) -> int:
        return len(self.tasks)

    def save(self) -> None:
        """Write every task to the file, as a JSON list."""
        data = [task.to_dict() for task in self]
        self.path.write_text(json.dumps(data, indent=2), encoding="utf-8")

    def get(self, task_id: int) -> Task:
        """The task with this id. Raises TaskNotFoundError if there isn't one."""
        try:
            return self.tasks[task_id]
        except KeyError:
            raise TaskNotFoundError(task_id) from None

    def add(self, title: str, priority: str = "normal", due: date | None = None) -> Task:
        """Create a task with the next id, save, and return it."""
        task = Task(max(self.tasks, default=0) + 1, title, priority, due)
        self.tasks[task.id] = task
        self.save()
        return task

    def complete(self, task_id: int) -> Task:
        """Mark a task as done, save, and return it."""
        task = self.get(task_id)
        task.done = True
        self.save()
        return task

    def remove(self, task_id: int) -> Task:
        """Delete a task, save, and return it."""
        task = self.get(task_id)
        del self.tasks[task_id]
        self.save()
        return task


def iso_date(text: str) -> date:
    """An argparse type: parse YYYY-MM-DD, or raise argparse.ArgumentTypeError."""
    try:
        return date.fromisoformat(text)
    except ValueError:
        raise argparse.ArgumentTypeError(f"invalid date {text!r} (use YYYY-MM-DD)") from None


def build_parser() -> argparse.ArgumentParser:
    """The parser for: todo [--file FILE] {add,done,list,remove} ..."""
    parser = argparse.ArgumentParser(prog="todo", description="A todo list in a JSON file.")
    parser.add_argument("--file", default="tasks.json", help="where tasks are kept (default: %(default)s)")
    commands = parser.add_subparsers(dest="command", required=True)

    add = commands.add_parser("add", help="add a task")
    add.add_argument("title", nargs="+", help="what needs doing")
    add.add_argument("-p", "--priority", choices=PRIORITIES, default="normal")
    add.add_argument("--due", type=iso_date, help="due date, YYYY-MM-DD")

    done = commands.add_parser("done", help="mark a task as done")
    done.add_argument("id", type=int)

    show = commands.add_parser("list", help="show open tasks")
    show.add_argument("-a", "--all", action="store_true", help="include finished tasks")

    remove = commands.add_parser("remove", help="delete a task")
    remove.add_argument("id", type=int)
    return parser


def sort_key(task: Task) -> tuple:
    """Open before done, then by priority, then by due date with undated last, then by id."""
    return (task.done, PRIORITIES.index(task.priority), task.due is None, task.due, task.id)


def visible_tasks(tasks: Iterable[Task], *, show_all: bool = False) -> list[Task]:
    """The tasks to list, most urgent first. Finished tasks only appear with show_all."""
    return sorted((task for task in tasks if show_all or not task.done), key=sort_key)


COLUMNS = ("ID", "PRIORITY", "DUE", "TASK")


def format_table(tasks: Iterable[Task]) -> str:
    """The tasks as a plain-text table under a COLUMNS header."""
    rows = [COLUMNS]
    for task in tasks:
        due = task.due.isoformat() if task.due else "-"
        rows.append((str(task.id), task.priority, due, f"[{'x' if task.done else ' '}] {task.title}"))
    widths = [max(map(len, column)) for column in zip(*rows)]
    lines = []
    for row in rows:
        cells = [f"{cell:{align}{width}}" for cell, align, width in zip(row, "><<<", widths)]
        lines.append("  ".join(cells).rstrip())
    return "\n".join(lines)
```

```python tests
from datetime import date

@test("a header row, then one row per task")
def _():
    eq(format_table([Task(1, "Buy milk")]),
       "ID  PRIORITY  DUE  TASK\n"
       " 1  normal    -    [ ] Buy milk")

@test("columns line up, and ids are right-aligned")
def _():
    tasks = [
        Task(2, "Renew passport", "high", date(2026, 11, 20)),
        Task(10, "Book dentist", "low", date(2026, 12, 1)),
        Task(3, "Buy milk", done=True),
    ]
    eq(format_table(tasks), "\n".join([
        "ID  PRIORITY  DUE         TASK",
        " 2  high      2026-11-20  [ ] Renew passport",
        "10  low       2026-12-01  [ ] Book dentist",
        " 3  normal    -           [x] Buy milk",
    ]))

@test("a wide id widens its column")
def _():
    eq(format_table([Task(100, "Clean up")]).splitlines()[0], " ID  PRIORITY  DUE  TASK")

@test("no line ends in spaces")
def _():
    table = format_table([Task(1, "a"), Task(22, "a longer title", "high")])
    check(all(line == line.rstrip() for line in table.splitlines()), "strip the padding at the end of each line")

@test("no tasks, just the header")
def _():
    eq(format_table([]), "ID  PRIORITY  DUE  TASK")

@test("reads its input only once, so a generator works")
def _():
    tasks = [Task(1, "Buy milk"), Task(2, "Pay rent", "high")]
    eq(format_table(task for task in tasks), format_table(tasks))
```

```hint
Build `rows = [COLUMNS]`, then append one tuple of four strings per task, with `task.due.isoformat() if task.due else "-"` for the date.
```

```hint
`widths = [max(map(len, column)) for column in zip(*rows)]` measures every column in one line.
```

```hint
Format each row with `f"{cell:{align}{width}}"` for each cell, using `">"` for the first column and `"<"` for the rest. Then `"  ".join(...)` the cells and `.rstrip()` the line.
```
:::

## Step 6: The entry point

`main(argv)` ties everything together. It parses the arguments, opens the store, dispatches on `args.command` with `match`, prints the result and returns an exit status. By Unix convention that's `0` for success, `1` for an error the tool reports itself (an unknown id, say) and `2` for a usage error, which is what argparse uses.

Returning the status instead of calling `sys.exit()` is what keeps `main()` testable. The script's last lines do the exiting, the same job `process.exitCode` does in Node:

:::compare The entry point
```js
// todo.js
function main(argv) {
  // ...
  return 0;
}

process.exitCode = main(process.argv.slice(2));
```
```python
# todo.py
def main(argv: list[str] | None = None) -> int:
    ...
    return 0


if __name__ == "__main__":
    sys.exit(main())
```
:::

With no argument, `parse_args(None)` reads `sys.argv[1:]`, so the script needs nothing else ([`__name__` and `python -m`](lesson:modules-and-tooling#name-and-python-m)). Results go to stdout with `print()`, and errors go to stderr with `print(..., file=sys.stderr)`, Python's `console.error()`. Then a user can pipe the output somewhere and still see the errors.

Usage errors need a `try`. By the time argparse raises `SystemExit`, it has already printed the usage and the error, so `main()` only has to catch the exception and return its `code`. In a test, `output_of(main, [...])` captures what `main()` prints, and `contextlib.redirect_stderr` captures the errors:

```python run
import argparse
import contextlib
import io

parser = argparse.ArgumentParser(prog="greet")
parser.add_argument("name")

def main(argv):
    try:
        args = parser.parse_args(argv)
    except SystemExit as exc:
        return exc.code
    print(f"Hello, {args.name}!")
    return 0

out, err = io.StringIO(), io.StringIO()
with contextlib.redirect_stdout(out), contextlib.redirect_stderr(err):
    statuses = [main(["Ada"]), main([])]
print(statuses)
print(repr(out.getvalue()))
print(err.getvalue())
```

:::note Why not `exit_on_error=False`?
Since Python 3.9, `ArgumentParser(exit_on_error=False)` raises `argparse.ArgumentError` for some mistakes instead of exiting. Subparsers don't inherit the setting, though, and `--help` exits regardless, so catching `SystemExit` around `parse_args()` remains the dependable way to keep a `main()` from exiting.
:::

:::challenge id=todo-step-6 title="Step 6: Write main()" difficulty=medium
Write `main(argv=None)`, which runs one command and returns its exit status:

- `add` prints `Added #<id>: <title>`, joining the title's words with spaces.
- `done` prints `Completed #<id>: <title>`, and `remove` prints `Removed #<id>: <title>`.
- `list` prints `format_table()` of the visible tasks, including finished ones with `--all`, or `Nothing to do.` if there are none.
- The store lives at `args.file`. Successful commands return `0`.
- A `TaskNotFoundError` or a `ValueError` (such as a blank title) prints `todo: <message>` to **stderr** and returns `1`.
- Usage errors and `--help` return argparse's status, `2` or `0`, without opening the store.

```text
>>> main(["--file", "work.json", "add", "Pay", "rent", "-p", "high"])
Added #1: Pay rent
0
>>> main(["--file", "work.json", "done", "9"])
todo: no task with id 9
1
```

```python starter
import argparse
import json
import sys
from collections.abc import Iterable, Iterator
from dataclasses import asdict, dataclass
from datetime import date
from pathlib import Path

PRIORITIES = ("high", "normal", "low")  # most urgent first


@dataclass
class Task:
    id: int
    title: str
    priority: str = "normal"
    due: date | None = None
    done: bool = False

    def __post_init__(self):
        """Reject a blank title or an unknown priority with ValueError."""
        if not self.title.strip():
            raise ValueError("a task needs a title")
        if self.priority not in PRIORITIES:
            raise ValueError(f"unknown priority {self.priority!r}")

    def to_dict(self) -> dict:
        """A JSON-ready dict of the fields, with the due date as an ISO string."""
        return asdict(self) | {"due": self.due.isoformat() if self.due else None}

    @classmethod
    def from_dict(cls, data: dict) -> "Task":
        """The inverse of to_dict(). Missing optional fields get their defaults."""
        due = data.get("due")
        return cls(**(data | {"due": date.fromisoformat(due) if due else None}))


class TaskNotFoundError(LookupError):
    def __init__(self, task_id: int):
        super().__init__(f"no task with id {task_id}")
        self.task_id = task_id


class TaskStore:
    """Tasks kept in memory, and saved to a JSON file after every change."""

    def __init__(self, path: str | Path):
        """Load the tasks saved at path into self.tasks, a dict from id to Task."""
        self.path = Path(path)
        try:
            data = json.loads(self.path.read_text(encoding="utf-8"))
        except FileNotFoundError:
            data = []
        self.tasks: dict[int, Task] = {item["id"]: Task.from_dict(item) for item in data}

    def __iter__(self) -> Iterator[Task]:
        return iter(self.tasks.values())

    def __len__(self) -> int:
        return len(self.tasks)

    def save(self) -> None:
        """Write every task to the file, as a JSON list."""
        data = [task.to_dict() for task in self]
        self.path.write_text(json.dumps(data, indent=2), encoding="utf-8")

    def get(self, task_id: int) -> Task:
        """The task with this id. Raises TaskNotFoundError if there isn't one."""
        try:
            return self.tasks[task_id]
        except KeyError:
            raise TaskNotFoundError(task_id) from None

    def add(self, title: str, priority: str = "normal", due: date | None = None) -> Task:
        """Create a task with the next id, save, and return it."""
        task = Task(max(self.tasks, default=0) + 1, title, priority, due)
        self.tasks[task.id] = task
        self.save()
        return task

    def complete(self, task_id: int) -> Task:
        """Mark a task as done, save, and return it."""
        task = self.get(task_id)
        task.done = True
        self.save()
        return task

    def remove(self, task_id: int) -> Task:
        """Delete a task, save, and return it."""
        task = self.get(task_id)
        del self.tasks[task_id]
        self.save()
        return task


def iso_date(text: str) -> date:
    """An argparse type: parse YYYY-MM-DD, or raise argparse.ArgumentTypeError."""
    try:
        return date.fromisoformat(text)
    except ValueError:
        raise argparse.ArgumentTypeError(f"invalid date {text!r} (use YYYY-MM-DD)") from None


def build_parser() -> argparse.ArgumentParser:
    """The parser for: todo [--file FILE] {add,done,list,remove} ..."""
    parser = argparse.ArgumentParser(prog="todo", description="A todo list in a JSON file.")
    parser.add_argument("--file", default="tasks.json", help="where tasks are kept (default: %(default)s)")
    commands = parser.add_subparsers(dest="command", required=True)

    add = commands.add_parser("add", help="add a task")
    add.add_argument("title", nargs="+", help="what needs doing")
    add.add_argument("-p", "--priority", choices=PRIORITIES, default="normal")
    add.add_argument("--due", type=iso_date, help="due date, YYYY-MM-DD")

    done = commands.add_parser("done", help="mark a task as done")
    done.add_argument("id", type=int)

    show = commands.add_parser("list", help="show open tasks")
    show.add_argument("-a", "--all", action="store_true", help="include finished tasks")

    remove = commands.add_parser("remove", help="delete a task")
    remove.add_argument("id", type=int)
    return parser


def sort_key(task: Task) -> tuple:
    """Open before done, then by priority, then by due date with undated last, then by id."""
    return (task.done, PRIORITIES.index(task.priority), task.due is None, task.due, task.id)


def visible_tasks(tasks: Iterable[Task], *, show_all: bool = False) -> list[Task]:
    """The tasks to list, most urgent first. Finished tasks only appear with show_all."""
    return sorted((task for task in tasks if show_all or not task.done), key=sort_key)


COLUMNS = ("ID", "PRIORITY", "DUE", "TASK")


def format_table(tasks: Iterable[Task]) -> str:
    """The tasks as a plain-text table under a COLUMNS header."""
    rows = [COLUMNS]
    for task in tasks:
        due = task.due.isoformat() if task.due else "-"
        rows.append((str(task.id), task.priority, due, f"[{'x' if task.done else ' '}] {task.title}"))
    widths = [max(map(len, column)) for column in zip(*rows)]
    lines = []
    for row in rows:
        cells = [f"{cell:{align}{width}}" for cell, align, width in zip(row, "><<<", widths)]
        lines.append("  ".join(cells).rstrip())
    return "\n".join(lines)


def main(argv: list[str] | None = None) -> int:
    """Run the todo command line and return its exit status."""
    ...
```

```python solution
import argparse
import json
import sys
from collections.abc import Iterable, Iterator
from dataclasses import asdict, dataclass
from datetime import date
from pathlib import Path

PRIORITIES = ("high", "normal", "low")  # most urgent first


@dataclass
class Task:
    id: int
    title: str
    priority: str = "normal"
    due: date | None = None
    done: bool = False

    def __post_init__(self):
        """Reject a blank title or an unknown priority with ValueError."""
        if not self.title.strip():
            raise ValueError("a task needs a title")
        if self.priority not in PRIORITIES:
            raise ValueError(f"unknown priority {self.priority!r}")

    def to_dict(self) -> dict:
        """A JSON-ready dict of the fields, with the due date as an ISO string."""
        return asdict(self) | {"due": self.due.isoformat() if self.due else None}

    @classmethod
    def from_dict(cls, data: dict) -> "Task":
        """The inverse of to_dict(). Missing optional fields get their defaults."""
        due = data.get("due")
        return cls(**(data | {"due": date.fromisoformat(due) if due else None}))


class TaskNotFoundError(LookupError):
    def __init__(self, task_id: int):
        super().__init__(f"no task with id {task_id}")
        self.task_id = task_id


class TaskStore:
    """Tasks kept in memory, and saved to a JSON file after every change."""

    def __init__(self, path: str | Path):
        """Load the tasks saved at path into self.tasks, a dict from id to Task."""
        self.path = Path(path)
        try:
            data = json.loads(self.path.read_text(encoding="utf-8"))
        except FileNotFoundError:
            data = []
        self.tasks: dict[int, Task] = {item["id"]: Task.from_dict(item) for item in data}

    def __iter__(self) -> Iterator[Task]:
        return iter(self.tasks.values())

    def __len__(self) -> int:
        return len(self.tasks)

    def save(self) -> None:
        """Write every task to the file, as a JSON list."""
        data = [task.to_dict() for task in self]
        self.path.write_text(json.dumps(data, indent=2), encoding="utf-8")

    def get(self, task_id: int) -> Task:
        """The task with this id. Raises TaskNotFoundError if there isn't one."""
        try:
            return self.tasks[task_id]
        except KeyError:
            raise TaskNotFoundError(task_id) from None

    def add(self, title: str, priority: str = "normal", due: date | None = None) -> Task:
        """Create a task with the next id, save, and return it."""
        task = Task(max(self.tasks, default=0) + 1, title, priority, due)
        self.tasks[task.id] = task
        self.save()
        return task

    def complete(self, task_id: int) -> Task:
        """Mark a task as done, save, and return it."""
        task = self.get(task_id)
        task.done = True
        self.save()
        return task

    def remove(self, task_id: int) -> Task:
        """Delete a task, save, and return it."""
        task = self.get(task_id)
        del self.tasks[task_id]
        self.save()
        return task


def iso_date(text: str) -> date:
    """An argparse type: parse YYYY-MM-DD, or raise argparse.ArgumentTypeError."""
    try:
        return date.fromisoformat(text)
    except ValueError:
        raise argparse.ArgumentTypeError(f"invalid date {text!r} (use YYYY-MM-DD)") from None


def build_parser() -> argparse.ArgumentParser:
    """The parser for: todo [--file FILE] {add,done,list,remove} ..."""
    parser = argparse.ArgumentParser(prog="todo", description="A todo list in a JSON file.")
    parser.add_argument("--file", default="tasks.json", help="where tasks are kept (default: %(default)s)")
    commands = parser.add_subparsers(dest="command", required=True)

    add = commands.add_parser("add", help="add a task")
    add.add_argument("title", nargs="+", help="what needs doing")
    add.add_argument("-p", "--priority", choices=PRIORITIES, default="normal")
    add.add_argument("--due", type=iso_date, help="due date, YYYY-MM-DD")

    done = commands.add_parser("done", help="mark a task as done")
    done.add_argument("id", type=int)

    show = commands.add_parser("list", help="show open tasks")
    show.add_argument("-a", "--all", action="store_true", help="include finished tasks")

    remove = commands.add_parser("remove", help="delete a task")
    remove.add_argument("id", type=int)
    return parser


def sort_key(task: Task) -> tuple:
    """Open before done, then by priority, then by due date with undated last, then by id."""
    return (task.done, PRIORITIES.index(task.priority), task.due is None, task.due, task.id)


def visible_tasks(tasks: Iterable[Task], *, show_all: bool = False) -> list[Task]:
    """The tasks to list, most urgent first. Finished tasks only appear with show_all."""
    return sorted((task for task in tasks if show_all or not task.done), key=sort_key)


COLUMNS = ("ID", "PRIORITY", "DUE", "TASK")


def format_table(tasks: Iterable[Task]) -> str:
    """The tasks as a plain-text table under a COLUMNS header."""
    rows = [COLUMNS]
    for task in tasks:
        due = task.due.isoformat() if task.due else "-"
        rows.append((str(task.id), task.priority, due, f"[{'x' if task.done else ' '}] {task.title}"))
    widths = [max(map(len, column)) for column in zip(*rows)]
    lines = []
    for row in rows:
        cells = [f"{cell:{align}{width}}" for cell, align, width in zip(row, "><<<", widths)]
        lines.append("  ".join(cells).rstrip())
    return "\n".join(lines)


def main(argv: list[str] | None = None) -> int:
    """Run the todo command line and return its exit status."""
    parser = build_parser()
    try:
        args = parser.parse_args(argv)
    except SystemExit as exc:  # --help, or a usage error that argparse has already reported
        return exc.code
    store = TaskStore(args.file)
    try:
        match args.command:
            case "add":
                task = store.add(" ".join(args.title), args.priority, args.due)
                print(f"Added #{task.id}: {task.title}")
            case "done":
                task = store.complete(args.id)
                print(f"Completed #{task.id}: {task.title}")
            case "remove":
                task = store.remove(args.id)
                print(f"Removed #{task.id}: {task.title}")
            case "list":
                tasks = visible_tasks(store, show_all=args.all)
                print(format_table(tasks) if tasks else "Nothing to do.")
    except (TaskNotFoundError, ValueError) as err:
        print(f"todo: {err}", file=sys.stderr)
        return 1
    return 0
```

```python tests
import contextlib
import io
import json
import tempfile
from pathlib import Path

def fresh_path():
    return str(Path(tempfile.mkdtemp()) / "tasks.json")

def run(path, *args):
    """main() against a task file: (exit status, stdout, stderr)."""
    out, err = io.StringIO(), io.StringIO()
    with contextlib.redirect_stdout(out), contextlib.redirect_stderr(err):
        status = main(["--file", path, *args])
    return status, out.getvalue(), err.getvalue()

@test("add prints a confirmation")
def _():
    eq(output_of(main, ["--file", fresh_path(), "add", "Buy", "oat", "milk"]), "Added #1: Buy oat milk\n")

@test("successful commands return 0")
def _():
    path = fresh_path()
    eq(run(path, "add", "Buy milk")[0], 0)
    eq(run(path, "list")[0], 0)

@test("list prints the open tasks as a table, most urgent first")
def _():
    path = fresh_path()
    run(path, "add", "Buy milk")
    run(path, "add", "Pay rent", "-p", "high", "--due", "2026-12-01")
    eq(output_of(main, ["--file", path, "list"]),
       "ID  PRIORITY  DUE         TASK\n"
       " 2  high      2026-12-01  [ ] Pay rent\n"
       " 1  normal    -           [ ] Buy milk\n")

@test("done and remove report what they changed")
def _():
    path = fresh_path()
    run(path, "add", "Buy milk")
    run(path, "add", "Pay rent")
    eq(run(path, "done", "1")[1], "Completed #1: Buy milk\n")
    eq(run(path, "remove", "2")[1], "Removed #2: Pay rent\n")

@test("list --all includes finished tasks")
def _():
    path = fresh_path()
    run(path, "add", "Buy milk")
    run(path, "done", "1")
    eq(run(path, "list")[1], "Nothing to do.\n")
    eq(run(path, "list", "--all")[1], "ID  PRIORITY  DUE  TASK\n 1  normal    -    [x] Buy milk\n")

@test("an unknown id prints an error to stderr and returns 1")
def _():
    status, out, err = run(fresh_path(), "done", "7")
    eq((status, out, err), (1, "", "todo: no task with id 7\n"))

@test("a blank title returns 1 too")
def _():
    status, out, err = run(fresh_path(), "add", "   ")
    eq(status, 1)
    check(err.startswith("todo: "), f"report the problem on stderr, got {err!r}")

@test("usage errors return 2 and --help returns 0, without touching the file")
def _():
    path = fresh_path()
    status, out, err = run(path, "fly")
    eq(status, 2)
    check("usage: todo" in err, "argparse prints the usage on stderr")
    status, out, err = run(path, "--help")
    eq(status, 0)
    check("usage: todo" in out, "--help prints the usage on stdout")
    check(not Path(path).exists(), "usage errors and --help shouldn't create the task file")

@test("a whole session, saved between runs")
def _():
    path = fresh_path()
    for args in [
        ["add", "Renew", "passport", "--priority", "high", "--due", "2026-11-20"],
        ["add", "Buy oat milk"],
        ["add", "Book dentist", "-p", "low", "--due", "2026-12-01"],
        ["done", "2"],
    ]:
        eq(run(path, *args)[0], 0, f"exit status for {args}")
    eq(run(path, "list", "--all")[1], "\n".join([
        "ID  PRIORITY  DUE         TASK",
        " 1  high      2026-11-20  [ ] Renew passport",
        " 3  low       2026-12-01  [ ] Book dentist",
        " 2  normal    -           [x] Buy oat milk",
    ]) + "\n")
    saved = json.loads(Path(path).read_text(encoding="utf-8"))
    eq([(task["id"], task["done"]) for task in saved], [(1, False), (2, True), (3, False)])
```

```hint
Start with `try: args = build_parser().parse_args(argv)` and `except SystemExit as exc: return exc.code`. Only after that, open `TaskStore(args.file)`.
```

```hint
`match args.command:` with one `case` per command. For `add`, the title is `" ".join(args.title)`. For `list`, `tasks = visible_tasks(store, show_all=args.all)`, then print the table or `Nothing to do.`.
```

```hint
Wrap the `match` in `try` and catch `(TaskNotFoundError, ValueError) as err`: `print(f"todo: {err}", file=sys.stderr)` and `return 1`. Fall through to `return 0`.
```
:::

## Where to take it next

- **An `edit` command.** `todo edit 3 --due 2026-12-24` maps neatly onto `dataclasses.replace(task, due=...)`, with `__post_init__` validating the result.
- **Overdue tasks.** Highlight tasks whose due date has passed. To keep the tests deterministic, don't call `date.today()` inside the logic: pass `today` in as a parameter, and let `main()` supply the real one ([Dates & Times](lesson:dates-and-times)).
- **A real command.** In a project's `pyproject.toml`, `[project.scripts]` with `todo = "todo:main"` makes installing the package create a `todo` executable. The generated launcher calls `sys.exit(main())`, which is one more reason for `main()` to return its status ([pyproject.toml](lesson:modules-and-tooling#pyproject-toml)).
- **Richer CLIs.** click and typer build parsers from decorators and type hints, and add colours and prompts. [Command-Line Tools](lesson:command-line-tools) compares them with argparse.

## Cheat sheet

| JavaScript | Python | Notes |
| --- | --- | --- |
| `JSON.stringify(date)` (via `toJSON`) | `date.isoformat()` | `json.dumps` refuses dates |
| `new Date("2026-12-01")` | `date.fromisoformat("2026-12-01")` | months run from 1 to 12 |
| `{ ...data, due }` | `data \| {"due": due}` | 3.9+; builds a new dict |
| `static fromJSON(data)` | `@classmethod` `from_dict(cls, data)` | an alternative constructor |
| `err.code === "ENOENT"` | `except FileNotFoundError:` | exceptions are typed |
| `fs.readFileSync(path, "utf8")` | `Path(path).read_text(encoding="utf-8")` | always pass the encoding |
| commander or yargs | `argparse` | `parse_args(list)` in tests |
| `.command("add <title...>")` | `add_argument("title", nargs="+")` | a list of words |
| a comparator chained with `\|\|` | `key=lambda t: (t.done, rank, t.id)` | tuples compare item by item |
| nulls last | `(x is None, x)` in the key | never compares `None` with a value |
| `s.padStart(n)`, `s.padEnd(n)` | `f"{s:>{n}}"`, `f"{s:<{n}}"` | the width can be a variable |
| `console.error(msg)` | `print(msg, file=sys.stderr)` | |
| `process.exitCode = main(argv)` | `sys.exit(main())` | `main()` returns the status |
