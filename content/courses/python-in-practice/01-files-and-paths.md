---
title: Files & Paths
part: Files & Data
summary: pathlib, shutil and tempfile in place of Node's path and fs, from joining paths to atomic writes.
minutes: 35
---

In Node, a path is a string. The `path` module takes strings apart and the `fs` module takes strings to the disk. In Python, a path is an **object**: `pathlib.Path` joins with `/`, knows its own name, suffix and parent, and carries most filesystem operations as methods. One import replaces `path`, most of `fs` and your glob package, while `shutil` handles whole trees and `tempfile` handles scratch space.

The core course covered `open()`, file modes and `with` in [Context Managers](lesson:context-managers#reading-and-writing-files). This lesson covers the rest of the filesystem. The sandbox has an in-memory filesystem, so every demo creates the files it needs and you can rerun them as often as you like.

## Paths are objects, not strings

:::compare
```js
import path from "node:path";

const report = path.join("reports", "2024", "q3.csv");
path.basename(report);              // "q3.csv"
path.extname(report);               // ".csv"
path.basename(report, ".csv");      // "q3"
path.dirname(report);               // "reports/2024"
report.split(path.sep);             // ["reports", "2024", "q3.csv"]
```
```python
from pathlib import Path

report = Path("reports") / "2024" / "q3.csv"
report.name                         # "q3.csv"
report.suffix                       # ".csv"
report.stem                         # "q3"
report.parent                       # Path("reports/2024")
report.parts                        # ("reports", "2024", "q3.csv")
```
:::

`Path` overloads `/` (through `__truediv__`, see [Dunder Methods](lesson:dunder-methods)), so joining reads like the path itself. Only one operand has to be a `Path`, and `Path("reports", "2024")` joins its arguments too. On Windows you get a `WindowsPath` that prints with backslashes. The sandbox, like Linux and macOS, gives you a `PosixPath`. Code written against `Path` runs on both.

None of these properties touch the disk. The `with_*` methods return a new path with one piece swapped, which replaces most of the string surgery you'd do in JS:

```python run
from pathlib import Path

backup = Path("backups/2024/site.tar.gz")
print(backup.name, backup.stem, backup.suffix, backup.suffixes)
print(list(backup.parents))
print(backup.with_name("db.sql"))
print(backup.with_suffix(".zip"))     # only the last suffix changes
print(backup.with_stem("blog"))       # the stem is "site.tar"
print(repr(Path("Makefile").suffix))  # no suffix: an empty string
```

:::quiz output
What does this print?

```python
from pathlib import Path
print(Path("exports/users.backup.json").stem)
```

- [ ] `users`
- [x] `users.backup`
- [ ] `users.backup.json`
- [ ] `exports/users.backup`

`stem` is the name minus its **last** suffix, like `path.basename(p, path.extname(p))`. `suffixes` lists all of them (`['.backup', '.json']`), and `name.partition(".")[0]` gives you everything before the first dot.
:::

:::gotcha A `Path` is not a `str`
`"backup-" + report` raises `TypeError`, and `report.endswith(".csv")` raises `AttributeError`. Either convert at the edge with `str(report)` or an f-string, or stay in path-land with `report.with_name(f"backup-{report.name}")` and `report.suffix == ".csv"`. You rarely need the conversion: `open()`, `shutil`, `os`, `subprocess` and most libraries accept any path-like object.
:::

### An absolute segment wins

`Path("uploads") / "/etc/passwd"` is `/etc/passwd`. Joining an absolute path throws away everything before it, which is how `path.resolve()` behaves, not `path.join()` (that gives `uploads/etc/passwd`). It matters as soon as part of a path comes from a user. Resolve the result and check that it's still inside the folder you meant:

```python run
from pathlib import Path

UPLOADS = Path("uploads").resolve()

def upload_path(filename):
    target = (UPLOADS / filename).resolve()
    if not target.is_relative_to(UPLOADS):      # 3.9+
        raise ValueError(f"{filename!r} escapes the upload folder")
    return target

print(upload_path("avatar.png").relative_to(UPLOADS))
for filename in ["/etc/passwd", "../../etc/passwd"]:
    try:
        upload_path(filename)
    except ValueError as err:
        print(err)
```

## Absolute paths: `cwd`, `resolve` and `relative_to`

:::compare
```js
process.cwd();                                    // "/home/ada/shop"
path.resolve("data/users.json");                  // absolute
path.join(import.meta.dirname, "templates");      // next to this module
path.relative("/srv/app", "/srv/app/static/logo.png");
path.relative("/srv/app/static", "/srv/app/media");   // "../media"
path.normalize("a/b/../c");                       // "a/c"
os.homedir();
```
```python
Path.cwd()                                        # PosixPath('/home/ada/shop')
Path("data/users.json").resolve()                 # absolute
Path(__file__).parent / "templates"               # next to this module
Path("/srv/app/static/logo.png").relative_to("/srv/app")
Path("/srv/app/media").relative_to("/srv/app/static", walk_up=True)
Path("a/b/../c").resolve()                        # absolute, ".." collapsed
Path.home()
```
:::

In both languages a relative path is relative to the **current working directory**, not to the script. A script that opens `Path("config.toml")` works from its own folder and fails from anywhere else. Anchor files that ship with your code to the module instead: `Path(__file__).parent` is Python's `import.meta.dirname`.

`resolve()` makes a path absolute, collapses `..` and follows symlinks, so it's `path.resolve()` and `fs.realpathSync()` in one, except that the path doesn't have to exist (`absolute()` only prepends the cwd). `relative_to()` goes the other way and raises `ValueError` when the path isn't inside the base. Pass `walk_up=True` (3.12+) to get `path.relative()`'s `../` behaviour.

```python run
from pathlib import Path

print(Path.cwd())                         # the sandbox's working directory
config = Path("settings/../config.toml")
print(config)                             # no normalising without the disk
print(config.resolve())
print(config.resolve().relative_to(Path.cwd()))
print(Path("/srv/app/media").relative_to("/srv/app/static", walk_up=True))
try:
    Path("/srv/app/media").relative_to("/srv/app/static")
except ValueError as err:
    print(err)
```

:::gotcha `..` survives until you resolve
`path.join("a/b", "../c")` normalises to `a/c` as pure string manipulation. `Path("a/b") / "../c"` stays `a/b/../c`, because `b` might be a symlink, and then `..` leads somewhere else entirely. Only `resolve()`, which asks the filesystem, collapses `..` (`os.path.normpath` does the lexical version if you really want it). Until then `Path("a/b/../c") == Path("a/c")` is `False`.
:::

:::quiz output
What does this print?

```python
from pathlib import Path
print(Path("docs") / "guide" / ".." / "api.md")
```

- [ ] `docs/api.md`
- [x] `docs/guide/../api.md`
- [ ] `docs/guide/api.md`
- [ ] `ValueError`

Pure path operations are lexical, and they keep `..` because only the filesystem knows where it leads. Call `.resolve()` for the absolute, normalised path.
:::

:::deep Paths for another operating system
`Path` is the concrete class for the OS you're running on. The **pure** classes do the string work for any OS without touching a disk, like Node's `path.win32` and `path.posix`. They're handy when a Linux server parses paths that came from Windows clients:

```python run
from pathlib import PurePosixPath, PureWindowsPath

uploaded = PureWindowsPath(r"C:\Users\Ada\Pictures\Cat.JPG")
print(uploaded.name, uploaded.suffix.lower(), uploaded.drive)
print(uploaded.as_posix())
print(PureWindowsPath("C:/Users/Ada") == PureWindowsPath("c:/users/ada"))
print(PurePosixPath("/home/Ada") == PurePosixPath("/home/ada"))
```

Windows paths compare case-insensitively and POSIX paths don't. `as_posix()` gives the forward-slash form, which is what URLs and config files want.
:::

## Reading and writing

:::compare
```js
const text = fs.readFileSync("notes.md", "utf8");
fs.writeFileSync("notes.md", text.toUpperCase());
const logo = fs.readFileSync("logo.png");           // a Buffer
fs.writeFileSync("logo-copy.png", logo);
```
```python
text = Path("notes.md").read_text(encoding="utf-8")
Path("notes.md").write_text(text.upper(), encoding="utf-8")
logo = Path("logo.png").read_bytes()                # bytes
Path("logo-copy.png").write_bytes(logo)
```
:::

`read_text`, `write_text`, `read_bytes` and `write_bytes` open, read or write, and close in one call, like `readFileSync` and `writeFileSync`. `path.open()` is `open(path)`, for appending, streaming or writing in pieces, with Node's flags as modes: `"r"`, `"w"` (which empties the file the moment it opens), `"a"`, `"x"` (create, or raise `FileExistsError`), plus `"b"` for bytes. [Context Managers](lesson:context-managers#reading-and-writing-files) has the full mode table and the reason you always pass `encoding="utf-8"`. Two things that lesson skipped bite in real projects: newlines and big files.

### Newline translation

Node hands you the bytes that are in the file. Python's text mode translates line endings in both directions:

- **Reading** turns `\r\n` and a lone `\r` into `\n`, so `split("\n")` and `rstrip("\n")` work on files from any OS.
- **Writing** turns every `\n` into `os.linesep`, which is `\n` on Linux and macOS but `\r\n` on Windows.

That's usually what you want. The exceptions are files that must be byte-identical on every OS (generated code, lockfiles, test fixtures in git) and formats that manage line endings themselves, like CSV. The `newline` argument controls the translation: `newline="\n"` always writes LF, and `newline=""` switches translation off in both directions. `open()` and `write_text()` accept it, and so does `read_text()` since 3.13.

```python run
from pathlib import Path

notes = Path("windows-notes.txt")
notes.write_bytes(b"first\r\nsecond\r\nthird\n")      # saved by a Windows editor

print(repr(notes.read_text(encoding="utf-8")))         # translated to \n
with notes.open(encoding="utf-8", newline="") as f:
    print(list(f))                                      # left alone

# What a plain write_text() does on Windows, simulated:
notes.write_text("a\nb\n", encoding="utf-8", newline="\r\n")
print(notes.read_bytes())
notes.write_text("a\nb\n", encoding="utf-8", newline="\n")   # LF on every OS
print(notes.read_bytes())
```

### Big files: stream instead of slurping

:::compare
```js
const rl = readline.createInterface({ input: fs.createReadStream("access.log") });
let errors = 0;
for await (const line of rl) if (line.endsWith(" 500")) errors++;

const hash = crypto.createHash("sha256");
for await (const chunk of fs.createReadStream("backup.tar")) hash.update(chunk);
```
```python
with open("access.log", encoding="utf-8") as log:
    errors = sum(line.rstrip("\n").endswith(" 500") for line in log)

digest = hashlib.sha256()
with open("backup.tar", "rb") as f:
    while chunk := f.read(64 * 1024):
        digest.update(chunk)
```
:::

`read_text()` loads the whole file into one string, which is fine for a config file and wrong for a 4 GB log. Iterating a text file yields one line at a time, so memory stays flat however big the file is. For binary data, read fixed-size chunks: the walrus operator turns the "read until empty" loop into one line, because `f.read()` returns `b""` at the end of the file.

```python run
import hashlib
from pathlib import Path

log = Path("access.log")
with log.open("w", encoding="utf-8") as f:
    for i in range(20_000):
        status = 500 if i % 1000 == 0 else 200
        f.write(f"10.0.0.{i % 256} GET /items/{i} {status}\n")

with log.open(encoding="utf-8") as f:                 # one line in memory at a time
    errors = sum(line.rstrip("\n").endswith(" 500") for line in f)
print(f"{errors} errors in {log.stat().st_size:,} bytes")

with log.open("rb") as f:
    print(hashlib.file_digest(f, "sha256").hexdigest()[:16])   # 3.11+: the chunk loop, built in
```

:::tip Files that aren't plain UTF-8
`encoding="utf-8-sig"` reads UTF-8 that starts with a byte-order mark, which Excel and some Windows tools write, and drops the mark. `errors="replace"` turns undecodable bytes into `�` instead of raising `UnicodeDecodeError`, which is handy for log files of uncertain origin.
:::

## Checking, creating and deleting

:::compare
```js
fs.existsSync("out");
fs.statSync("out").isDirectory();
fs.mkdirSync("out/reports", { recursive: true });
fs.writeFileSync("app.lock", "", { flag: "wx" });   // fail if it exists
fs.renameSync("draft.md", "post.md");
fs.rmSync("old.log", { force: true });
fs.rmdirSync("empty-dir");
```
```python
Path("out").exists()
Path("out").is_dir()                                 # also is_file()
Path("out/reports").mkdir(parents=True, exist_ok=True)
Path("app.lock").touch(exist_ok=False)               # FileExistsError if it exists
Path("draft.md").replace("post.md")
Path("old.log").unlink(missing_ok=True)
Path("empty-dir").rmdir()
```
:::

The method names come from POSIX (`unlink`, `rmdir`, `touch`), and the flags map onto Node's options, with one catch. `recursive: true` both creates missing parents and tolerates a folder that already exists, while Python splits that into two flags: `parents=True` creates the parents, and only `exist_ok=True` stops `mkdir` from raising `FileExistsError` on the second run. You almost always want both. `missing_ok=True` is `unlink`'s `force: true`, and `rmdir()` only removes empty directories. Whole trees are `shutil`'s job, [further down](#copying-moving-and-deleting-trees-shutil).

:::gotcha `rename` vs `replace`
On Linux and macOS, `rename()` silently overwrites an existing target. On Windows it raises `FileExistsError`. `replace()` overwrites on every OS, atomically within one filesystem. Use `replace()` unless refusing to overwrite is the point. Both return the new `Path`.
:::

### Errors are classes, not codes

:::compare
```js
try {
  config = fs.readFileSync("settings.json", "utf8");
} catch (err) {
  if (err.code === "ENOENT") config = DEFAULTS;
  else if (err.code === "EACCES") console.error("permission denied");
  else throw err;
}
```
```python
try:
    config = Path("settings.json").read_text(encoding="utf-8")
except FileNotFoundError:
    config = DEFAULTS
except PermissionError:
    print("permission denied")
```
:::

Python maps the common `errno` codes onto subclasses of `OSError`, so you catch the situation by name instead of comparing strings. Anything you don't name propagates, which is the `else throw err` you'd otherwise have to remember.

| Node `err.code` | Python exception |
| --- | --- |
| `ENOENT` | `FileNotFoundError` |
| `EEXIST` | `FileExistsError` |
| `EISDIR` | `IsADirectoryError` |
| `ENOTDIR` | `NotADirectoryError` |
| `EACCES`, `EPERM` | `PermissionError` |
| anything else, such as `ENOTEMPTY` | `OSError`, with `err.errno` set |

Each one carries `.filename` and `.errno`, and `errno.errorcode` turns the number back into the familiar name:

```python run
import errno
import shutil
from pathlib import Path

shutil.rmtree("inbox", ignore_errors=True)        # a clean slate on every run
inbox = Path("inbox")
inbox.mkdir()
(inbox / "todo.txt").write_text("reply to Ada\n", encoding="utf-8")

def attempt(action):
    try:
        action()
    except OSError as err:
        code = errno.errorcode[err.errno]
        print(f"{type(err).__name__:<17} {code:<9} {Path(err.filename).name}")

attempt(inbox.mkdir)                               # exists already
attempt((inbox / "missing.txt").unlink)            # nothing to delete
attempt(inbox.rmdir)                               # not empty
inbox.mkdir(exist_ok=True)                         # idempotent: no error
(inbox / "missing.txt").unlink(missing_ok=True)    # likewise
```

:::gotcha Don't check, then act
`if not path.exists(): path.write_text(...)` has a race. Another process can create the file between the check and the write, and you overwrite its work. That's "look before you leap" (LBYL). Python's habit is EAFP: just do it, and catch the specific error ([Errors & Exceptions](lesson:exceptions#eafp-ask-forgiveness-not-permission)). To create something *exclusively*, open with mode `"x"`, or call `touch(exist_ok=False)` or a plain `mkdir()`, and catch `FileExistsError`.
:::

:::quiz output
What does this print?

```python
from pathlib import Path

Path("quiz-reports").mkdir(exist_ok=True)
try:
    Path("quiz-reports").mkdir()
    print("created")
except OSError as err:
    print(type(err).__name__)
```

- [ ] `created`
- [x] `FileExistsError`
- [ ] `OSError`
- [ ] `IsADirectoryError`

The first call makes sure the folder exists, and the second has no `exist_ok=True`, so it raises. `except OSError` catches it because `FileExistsError` is a subclass, and `type(err).__name__` still names the specific class.
:::

### Metadata with `stat()`

:::compare
```js
const st = fs.statSync("report.txt");
st.size;                  // bytes
st.mtimeMs;               // MILLISECONDS since the epoch
st.mtime;                 // a Date
```
```python
st = Path("report.txt").stat()
st.st_size                # bytes
st.st_mtime               # SECONDS since the epoch, as a float
datetime.fromtimestamp(st.st_mtime, tz=timezone.utc)
```
:::

`stat()` returns an `os.stat_result` with POSIX field names. Like every timestamp in Python, `st_mtime` counts seconds, so Node's `mtimeMs` is `st_mtime * 1000` (and `st_mtime_ns` holds the exact integer nanoseconds). `os.utime()` sets the timestamps, which is how a test fakes an old file. [Dates, Times & Durations](lesson:dates-and-times) covers turning timestamps into dates.

```python run
import os
from datetime import datetime, timezone
from pathlib import Path

report = Path("report.txt")
report.write_text("Q3 revenue: up\n", encoding="utf-8")
os.utime(report, (1_700_000_000, 1_700_000_000))     # (atime, mtime), in seconds

st = report.stat()
print(st.st_size, "bytes")
print(st.st_mtime, datetime.fromtimestamp(st.st_mtime, tz=timezone.utc))
```

## Listing directories: `iterdir`, `glob` and `rglob`

:::compare
```js
fs.readdirSync("src");                                    // names
fs.readdirSync("src", { withFileTypes: true })
  .filter((entry) => entry.isFile());
fs.readdirSync("src", { recursive: true });               // Node 20+
fs.globSync("src/**/*.ts");                               // Node 22+, or fast-glob
```
```python
list(Path("src").iterdir())                               # Path objects
[p for p in Path("src").iterdir()
 if p.is_file()]
list(Path("src").rglob("*"))                              # everything, recursively
list(Path("src").glob("**/*.py"))
```
:::

`iterdir()` yields `Path` objects that are already joined to their parent, so there's no `path.join(dir, name)` step, in whatever order the filesystem returns them. `glob()` matches a pattern relative to the path: `*` and `?` within one segment, `[abc]` for character sets, and `**` for any number of directories. `rglob(pattern)` is shorthand for `glob("**/" + pattern)`. All three are lazy, so wrap them in `sorted()` when order matters, which in tests and output it usually does.

```python run
import tempfile
from pathlib import Path

root = Path(tempfile.mkdtemp())        # a fresh, empty folder for this run
for name in ["app.py", "pkg/__init__.py", "pkg/models.py", "tests/test_app.py",
             "README.md", ".env", ".git/config"]:
    (root / name).parent.mkdir(parents=True, exist_ok=True)
    (root / name).write_text("", encoding="utf-8")

def show(paths):
    return sorted(p.relative_to(root).as_posix() for p in paths)

print(show(root.iterdir()))
print(show(root.glob("*.py")))
print(show(root.rglob("*.py")))
print(show(p for p in root.rglob("*") if p.is_dir()))
```

:::gotcha `*` matches dotfiles, and directories
Shell globs and fast-glob skip hidden files unless you ask for them. pathlib's `*` matches `.env` and `.git` like any other name, and every pattern matches directories as well as files. Filter explicitly, with `p.is_file()` and a check like `not any(part.startswith(".") for part in p.relative_to(root).parts)`.
:::

:::quiz output
What does this print?

```python
import tempfile
from pathlib import Path

root = Path(tempfile.mkdtemp())
for name in ["app.py", ".env", "README.md"]:
    (root / name).touch()
print(len(list(root.glob("*"))))
```

- [ ] `2`
- [x] `3`
- [ ] `1`

pathlib doesn't treat names that start with `.` specially, so `*` matches `.env` too. The functions in the `glob` module do skip hidden files, unless you pass `include_hidden=True` (3.11+).
:::

:::note The `glob` module
`glob.glob("src/**/*.py", recursive=True)` returns strings instead of paths. Leave out `recursive=True` and `**` acts like `*`, one level deep. Prefer `Path.glob`, and use the module when you want strings, its `root_dir=` argument or its dotfile-skipping default.
:::

:::tip Case sensitivity
Patterns follow the platform's rules by default, which typically means case-sensitive on Linux and macOS and case-insensitive on Windows. `glob("*.jpg", case_sensitive=False)` (3.12+) matches `.JPG` everywhere. To test a path against a pattern without touching the filesystem, use `path.full_match("src/**/*.py")` (3.13+).
:::

## Walking a tree: `os.walk` and `Path.walk`

:::compare
```js
function* walk(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === "node_modules") continue;      // prune
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) yield* walk(full);
    else yield full;
  }
}
```
```python
def walk(top):
    for dirpath, dirnames, filenames in os.walk(top):
        dirnames[:] = [d for d in dirnames if d != "node_modules"]   # prune
        for name in filenames:
            yield os.path.join(dirpath, name)
```
:::

`os.walk(top)` yields one `(dirpath, dirnames, filenames)` tuple per directory. It goes top-down by default and hasn't descended yet when it hands you `dirnames`, so **removing names from that list prunes the walk**: it never enters `node_modules`, `.git` or `.venv` at all. With `topdown=False` the tuples come bottom-up, children before parents, which suits deleting a tree. `Path.walk()` (3.12+) is the same walk with a `Path` as `dirpath`, and there the keyword is spelled `top_down`.

Use `rglob` to find files, and `walk` when you need to prune or to do something per directory:

```python run
import tempfile
from pathlib import Path

root = Path(tempfile.mkdtemp())
for name, size in [("src/app.js", 1200), ("src/util.js", 300), ("docs/guide.md", 800),
                   ("node_modules/left-pad/index.js", 50_000), (".git/HEAD", 20)]:
    (root / name).parent.mkdir(parents=True, exist_ok=True)
    (root / name).write_bytes(b"x" * size)

SKIP = {"node_modules", ".git"}
for dirpath, dirnames, filenames in root.walk():
    dirnames[:] = sorted(d for d in dirnames if d not in SKIP)   # prune, and fix the order
    size = sum((dirpath / name).stat().st_size for name in filenames)
    print(f"{dirpath.relative_to(root).as_posix():<5} {size:>6,} bytes  {sorted(filenames)}")
```

:::gotcha Prune with slice assignment
`dirnames = [d for d in dirnames if d not in SKIP]` rebinds your local name to a new list, while `os.walk` keeps walking its own. It's the same mistake as reassigning a function parameter in JS and expecting the caller to see it. Mutate the list you were given, with `dirnames[:] = ...` or `dirnames.remove(name)`.
:::

## Copying, moving and deleting trees: `shutil`

:::compare
```js
fs.copyFileSync("a.txt", "b.txt");
fs.cpSync("site", "backup/site", { recursive: true });
fs.cpSync("site", "dist", { recursive: true,
  filter: (src) => !src.endsWith(".map") });
fs.renameSync("build", "/mnt/archive/build");    // EXDEV across disks
fs.rmSync("dist", { recursive: true, force: true });
```
```python
shutil.copy2("a.txt", "b.txt")                   # copy() skips the timestamps
shutil.copytree("site", "backup/site")
shutil.copytree("site", "dist",
                ignore=shutil.ignore_patterns("*.map"))
shutil.move("build", "/mnt/archive/build")       # copies + deletes if it must
shutil.rmtree("dist", ignore_errors=True)
```
:::

`shutil` ("shell utilities") does what `cp`, `mv` and `rm -rf` do:

- `copy(src, dst)` copies the data and the permission bits, and `copy2` keeps the timestamps too. If `dst` is a directory, the file lands inside it. Neither one creates missing parent directories.
- `copytree(src, dst)` copies a whole tree. `ignore=shutil.ignore_patterns("__pycache__", "*.pyc")` skips matching names at every level.
- `move(src, dst)` renames when it can and falls back to copy-and-delete across filesystems, where `os.rename`, like `fs.renameSync`, fails.
- `rmtree(path)` is `rm -rf`: no trash, no undo. `ignore_errors=True` also makes it quiet when the path is missing.

Python 3.14 adds the same operations to `Path` itself: `src.copy(dst)`, `src.copy_into(folder)`, `src.move(dst)` and `src.move_into(folder)`, each returning the new path.

```python run
import shutil
import tempfile
from pathlib import Path

root = Path(tempfile.mkdtemp())
site = root / "site"
for name in ["index.html", "css/main.css", "css/main.css.map", "js/app.js", "js/__pycache__/app.pyc"]:
    (site / name).parent.mkdir(parents=True, exist_ok=True)
    (site / name).write_text(f"/* {name} */", encoding="utf-8")

def files(folder):
    return sorted(p.relative_to(folder).as_posix() for p in folder.rglob("*") if p.is_file())

dist = shutil.copytree(site, root / "dist", ignore=shutil.ignore_patterns("*.map", "__pycache__"))
print("dist:  ", files(dist))

(root / "archive").mkdir()
moved = shutil.move(dist, root / "archive")              # into an existing folder
print("moved: ", Path(moved).relative_to(root))

saved = (site / "index.html").copy_into(root / "archive")   # 3.14+
print("saved: ", saved.relative_to(root))

shutil.rmtree(site)
print("left:  ", files(root))
```

:::gotcha `copytree` refuses an existing destination
`shutil.copytree("site", "dist")` raises `FileExistsError` when `dist` exists, even an empty one, so the second run of a build script fails. Pass `dirs_exist_ok=True` to merge into it, or `rmtree` it first for a clean build.
:::

## Temporary files and atomic writes

:::compare
```js
const dir = fs.mkdtempSync(path.join(os.tmpdir(), "build-"));
try {
  fs.writeFileSync(path.join(dir, "bundle.js"), code);
} finally {
  fs.rmSync(dir, { recursive: true, force: true });
}
```
```python
with tempfile.TemporaryDirectory(prefix="build-") as tmp:
    (Path(tmp) / "bundle.js").write_text(code, encoding="utf-8")
# the folder and everything in it is gone here
```
:::

`tempfile` creates files and folders with unpredictable names, securely (no other process can claim the name first), in the system's temp directory or wherever `dir=` says:

| Function | Gives you | Cleaned up |
| --- | --- | --- |
| `TemporaryDirectory()` | a folder path (a `str`) | when the `with` block ends |
| `NamedTemporaryFile()` | an open file with a `.name` | when it closes (3.12+: `delete_on_close=False` waits for the `with`) |
| `TemporaryFile()` | an open file without a name | when it closes |
| `mkdtemp()`, `mkstemp()` | a folder path, or an `(fd, path)` pair | by you |

Tests are the classic use. Give each test its own folder, as the demos in this lesson do with `mkdtemp()`. pytest's `tmp_path` fixture is the same idea packaged up ([Testing](lesson:testing-with-python)).

### Atomic writes, properly

[Context Managers](lesson:context-managers#cm-atomic-write) built an `atomic_write` that writes to `path + ".tmp"` and then calls `os.replace()`, so readers only ever see the old file or the new one. A production version adds three details:

1. The temp file lives in the **same directory** as the target. `os.replace()` only works within one filesystem (across two it raises `OSError`), and `/tmp` is often a different one.
2. `tempfile` picks its name, so two processes saving the same file can't collide on a single `.tmp` name.
3. `flush()` plus `os.fsync()` before the rename, so a power cut can't leave the new name pointing at data that never reached the disk.

```python run
import os
import tempfile
from pathlib import Path

def write_atomic(path, text):
    path = Path(path)
    fd, tmp = tempfile.mkstemp(dir=path.parent, prefix=f".{path.name}.", suffix=".tmp")
    try:
        with open(fd, "w", encoding="utf-8") as f:      # open() accepts a file descriptor
            f.write(text)
            f.flush()
            os.fsync(f.fileno())
        os.replace(tmp, path)
    except BaseException:
        Path(tmp).unlink(missing_ok=True)
        raise

settings = Path("settings.json")
write_atomic(settings, '{"theme": "dark"}')
try:
    write_atomic(settings, None)                  # f.write(None) raises: a simulated crash
except TypeError as err:
    print("failed:", err)
print(settings.read_text(encoding="utf-8"))       # the old content survived
print(sorted(Path().glob(".settings.json.*")))    # and no temp file was left behind
```

## Cheat sheet

| JavaScript (Node) | Python | Notes |
| --- | --- | --- |
| `path.join(a, b)` | `Path(a) / b` | an absolute `b` replaces `a` |
| `path.basename(p)` | `p.name` | |
| `path.extname(p)` | `p.suffix` | `p.suffixes` for `.tar.gz` |
| `path.basename(p, ext)` | `p.stem` | drops the last suffix only |
| `path.dirname(p)` | `p.parent` | `p.parents` for all ancestors |
| `path.resolve(p)` | `Path(p).resolve()` | also follows symlinks |
| `path.relative(from, to)` | `Path(to).relative_to(from)` | `walk_up=True` for `../` (3.12+) |
| `path.win32`, `path.posix` | `PureWindowsPath`, `PurePosixPath` | |
| `import.meta.dirname` | `Path(__file__).parent` | |
| `process.cwd()`, `os.homedir()` | `Path.cwd()`, `Path.home()` | |
| `fs.readFileSync(p, "utf8")` | `p.read_text(encoding="utf-8")` | `\r\n` arrives as `\n` |
| `fs.readFileSync(p)` | `p.read_bytes()` | `bytes`, not a `Buffer` |
| `fs.writeFileSync(p, s)` | `p.write_text(s, encoding="utf-8")` | `newline="\n"` for LF everywhere |
| `readline` over a stream | `for line in f:` | lines keep their `"\n"` |
| `fs.existsSync(p)` | `p.exists()` | prefer EAFP to check-then-act |
| `fs.mkdirSync(p, { recursive: true })` | `p.mkdir(parents=True, exist_ok=True)` | |
| `fs.rmSync(p, { force: true })` | `p.unlink(missing_ok=True)` | |
| `fs.renameSync(a, b)` | `Path(a).replace(b)` | `rename()` won't overwrite on Windows |
| `err.code === "ENOENT"` | `except FileNotFoundError:` | all `OSError` subclasses |
| `fs.statSync(p).mtimeMs` | `p.stat().st_mtime` | seconds, not milliseconds |
| `fs.readdirSync(d)` | `d.iterdir()` | `Path` objects, arbitrary order |
| `fs.globSync("**/*.js")` | `d.glob("**/*.py")`, `d.rglob("*.py")` | `*` matches dotfiles |
| recursive `readdir` + skip | `os.walk()`, `Path.walk()` | prune with `dirnames[:] = ...` |
| `fs.cpSync(a, b, { recursive: true })` | `shutil.copytree(a, b)` | `dirs_exist_ok=True` to merge |
| `fs.rmSync(d, { recursive: true })` | `shutil.rmtree(d)` | no undo |
| `fs.mkdtempSync(prefix)` | `tempfile.TemporaryDirectory()` | deleted when the `with` ends |
| write-file-atomic | `mkstemp(dir=...)` + `os.replace()` | same directory as the target |

## Challenges

:::challenge id=files-find-sources title="Find the source files" difficulty=easy
Write `find_sources(root, suffix)` that returns every **file** under `root`, at any depth, whose suffix matches `suffix` (like `".py"`), ignoring case, so `Main.PY` counts.

- Return the paths **relative to `root`** as sorted strings with forward slashes, like `"pkg/models.py"`.
- Skip hidden entries: anything whose relative path has a part starting with `"."`, such as `.venv/lib/site.py`, `.git/hooks/pre-commit.py` or `src/.scratch.py`.
- Directories don't count, even when their names match.
- `root` may be a `str` or a `Path`.

Use `pathlib`, not `os.path`.

```js
function findSources(root, suffix) {
  return fs.readdirSync(root, { recursive: true, withFileTypes: true })
    .filter((e) => e.isFile() && path.extname(e.name).toLowerCase() === suffix.toLowerCase())
    .map((e) => path.relative(root, path.join(e.parentPath, e.name)).split(path.sep).join("/"))
    .filter((rel) => !rel.split("/").some((part) => part.startsWith(".")))
    .sort();
}
```

```python starter
from pathlib import Path

def find_sources(root, suffix):
    ...
```

```python solution
from pathlib import Path

def find_sources(root, suffix):
    root = Path(root)
    found = []
    for path in root.rglob("*"):
        rel = path.relative_to(root)
        if any(part.startswith(".") for part in rel.parts):
            continue
        if path.is_file() and path.suffix.lower() == suffix.lower():
            found.append(rel.as_posix())
    return sorted(found)
```

```python tests
import tempfile
from pathlib import Path

def make_tree(*names):
    root = Path(tempfile.mkdtemp())
    for name in names:
        path = root / name
        if name.endswith("/"):
            path.mkdir(parents=True, exist_ok=True)
        else:
            path.parent.mkdir(parents=True, exist_ok=True)
            path.write_text("", encoding="utf-8")
    return root

@test("finds matching files at every depth")
def _():
    root = make_tree("app.py", "pkg/models.py", "pkg/sub/deep.py", "README.md")
    eq(find_sources(root, ".py"), ["app.py", "pkg/models.py", "pkg/sub/deep.py"])

@test("returns sorted strings with forward slashes, relative to root")
def _():
    result = find_sources(make_tree("b.py", "a/z.py", "a/b.py"), ".py")
    eq(result, ["a/b.py", "a/z.py", "b.py"])
    check(all(type(p) is str for p in result), "return strings, for example with .as_posix()")

@test("matches the suffix case-insensitively")
def _():
    root = make_tree("Main.PY", "util.Py", "notes.txt")
    eq(find_sources(root, ".py"), ["Main.PY", "util.Py"])
    eq(find_sources(root, ".PY"), ["Main.PY", "util.Py"])

@test("directories with matching names don't count")
def _():
    root = make_tree("tools.py/", "tools.py/run.sh", "real.py")
    eq(find_sources(root, ".py"), ["real.py"])

@test("skips hidden files and everything inside hidden folders")
def _():
    root = make_tree(".venv/lib/site.py", ".git/hooks/pre-commit.py", "src/.scratch.py", "src/app.py")
    eq(find_sources(root, ".py"), ["src/app.py"])

@test("returns [] when nothing matches")
def _():
    eq(find_sources(make_tree("README.md"), ".py"), [])

@test("accepts the root as a string")
def _():
    root = make_tree("app.py")
    eq(find_sources(str(root), ".py"), ["app.py"])

@test("uses pathlib rather than os.path")
def _():
    check("os.path" not in source, "use Path methods (rglob, relative_to, as_posix) instead of os.path")
```

```hint
`Path(root).rglob("*")` yields every file and directory below `root`. `path.is_file()` filters out the directories.
```

```hint
`rel = path.relative_to(root)` gives the relative path. `rel.parts` is a tuple of its segments, so `any(part.startswith(".") for part in rel.parts)` spots hidden entries, and `rel.as_posix()` turns it into a forward-slash string.
```
:::

:::challenge id=files-rotate-logs title="Rotate log files" difficulty=medium
Long-running services rotate their logs, so that `app.log` never grows forever. Write `rotate(path, keep)`, a tiny `logrotate`:

- every existing `app.log.N` becomes `app.log.{N+1}`,
- `app.log` becomes `app.log.1`,
- anything that would end up past `app.log.{keep}` is deleted,
- and a new, empty `app.log` is created.

```text
before (keep=2):  app.log  app.log.1  app.log.2
after:            app.log  app.log.1  app.log.2
                  (empty)  (was app.log)  (was app.log.1; the old .2 is gone)
```

Missing files anywhere in the chain are fine, including `app.log` itself. Only touch `app.log` and `app.log.1` to `app.log.{keep}`. Raise `ValueError` if `keep` is less than 1. `path` may be a `str` or a `Path`.

```js
function rotate(file, keep) {
  if (keep < 1) throw new RangeError("keep must be at least 1");
  fs.rmSync(`${file}.${keep}`, { force: true });
  for (let n = keep - 1; n >= 1; n--) {
    if (fs.existsSync(`${file}.${n}`)) fs.renameSync(`${file}.${n}`, `${file}.${n + 1}`);
  }
  if (fs.existsSync(file)) fs.renameSync(file, `${file}.1`);
  fs.writeFileSync(file, "");
}
```

```python starter
from pathlib import Path

def rotate(path, keep):
    ...
```

```python solution
from contextlib import suppress
from pathlib import Path

def rotate(path, keep):
    if keep < 1:
        raise ValueError("keep must be at least 1")
    path = Path(path)

    def numbered(n):
        return path.with_name(f"{path.name}.{n}")

    numbered(keep).unlink(missing_ok=True)
    for n in range(keep - 1, 0, -1):            # oldest first, so nothing gets clobbered
        with suppress(FileNotFoundError):
            numbered(n).replace(numbered(n + 1))
    with suppress(FileNotFoundError):
        path.replace(numbered(1))
    path.touch()
```

```python tests
import tempfile
from pathlib import Path

def fresh_log(content="current"):
    log = Path(tempfile.mkdtemp()) / "app.log"
    log.write_text(content, encoding="utf-8")
    return log

def numbered(log, n):
    return log.with_name(f"{log.name}.{n}")

def read(path):
    return path.read_text(encoding="utf-8")

def names(log):
    return sorted(p.name for p in log.parent.iterdir())

@test("moves app.log to app.log.1 and starts an empty app.log")
def _():
    log = fresh_log("day 1")
    rotate(log, 3)
    eq(names(log), ["app.log", "app.log.1"])
    eq(read(numbered(log, 1)), "day 1")
    eq(read(log), "")

@test("shifts every older file up by one")
def _():
    log = fresh_log("day 1")
    for day in (2, 3):
        rotate(log, 3)
        log.write_text(f"day {day}", encoding="utf-8")
    rotate(log, 3)
    eq([read(numbered(log, n)) for n in (1, 2, 3)], ["day 3", "day 2", "day 1"])

@test("deletes whatever would be pushed past keep")
def _():
    log = fresh_log("day 1")
    for day in range(2, 6):
        rotate(log, 2)
        log.write_text(f"day {day}", encoding="utf-8")
    eq(names(log), ["app.log", "app.log.1", "app.log.2"])
    eq([read(log), read(numbered(log, 1)), read(numbered(log, 2))], ["day 5", "day 4", "day 3"])

@test("gaps in the numbering are fine")
def _():
    log = fresh_log("now")
    numbered(log, 1).write_text("recent", encoding="utf-8")
    numbered(log, 3).write_text("oldest", encoding="utf-8")
    rotate(log, 3)
    eq(names(log), ["app.log", "app.log.1", "app.log.2"])
    eq([read(numbered(log, 1)), read(numbered(log, 2))], ["now", "recent"])

@test("works when app.log doesn't exist yet")
def _():
    log = Path(tempfile.mkdtemp()) / "app.log"
    rotate(log, 2)
    eq(names(log), ["app.log"])
    eq(read(log), "")

@test("leaves other files alone")
def _():
    log = fresh_log("now")
    (log.parent / "app.log.bak").write_text("keep me", encoding="utf-8")
    (log.parent / "other.log").write_text("me too", encoding="utf-8")
    rotate(log, 1)
    eq(names(log), ["app.log", "app.log.1", "app.log.bak", "other.log"])
    eq(read(log.parent / "app.log.bak"), "keep me")

@test("accepts a string path")
def _():
    log = fresh_log("now")
    rotate(str(log), 1)
    eq(read(numbered(log, 1)), "now")

@test("keep must be at least 1")
def _():
    raises(ValueError, rotate, fresh_log(), 0)
```

```hint
Build the numbered names with `path.with_name(f"{path.name}.{n}")`. Careful: `with_suffix(".1")` would *replace* `.log` and give you `app.1`.
```

```hint
Work from the oldest file to the newest. Delete `app.log.{keep}` first, then move `keep - 1` to `keep`, ..., `1` to `2`, and finally `app.log` to `app.log.1`. Going the other way overwrites files you still need.
```

```hint
`unlink(missing_ok=True)` deletes quietly, `replace()` renames and overwrites, and `with contextlib.suppress(FileNotFoundError):` skips a rename whose source is missing. `path.touch()` creates the new, empty log.
```
:::

:::challenge id=files-dir-sizes title="Disk usage report" difficulty=hard
Write `dir_sizes(root, skip=())`, a small `du`. It returns a dict mapping **every directory** under `root`, including `root` itself, to the total size in bytes of all the files inside it at any depth.

- Keys are paths relative to `root` with forward slashes, and `"."` for `root`.
- Directories whose **name** is in `skip` aren't entered at all, at any depth. They don't appear in the result and their files don't count.
- Empty directories appear with a total of `0`.

```text
proj/
  README.md                       100 bytes
  src/app.py                      300 bytes
  src/lib/util.py                  50 bytes
  node_modules/left-pad/index.js 9000 bytes

dir_sizes("proj", skip={"node_modules"})
{".": 450, "src": 350, "src/lib": 50}
```

Walk the tree once with `os.walk()` or `Path.walk()`, pruning as you go, rather than recursing yourself.

```js
function dirSizes(root, skip = new Set()) {
  const totals = {};
  function visit(dir) {
    let total = 0;
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        if (!skip.has(entry.name)) total += visit(full);
      } else {
        total += fs.statSync(full).size;
      }
    }
    totals[path.relative(root, dir).split(path.sep).join("/") || "."] = total;
    return total;
  }
  visit(root);
  return totals;
}
```

```python starter
from pathlib import Path

def dir_sizes(root, skip=()):
    ...
```

```python solution
from pathlib import Path

def dir_sizes(root, skip=()):
    root = Path(root)
    totals = {}
    for dirpath, dirnames, filenames in root.walk():
        dirnames[:] = [d for d in dirnames if d not in skip]   # prune before descending
        own = sum((dirpath / name).stat().st_size for name in filenames)
        rel = dirpath.relative_to(root)
        for folder in (rel, *rel.parents):                     # this folder and every ancestor
            key = folder.as_posix()
            totals[key] = totals.get(key, 0) + own
    return totals
```

```python tests
import tempfile
from pathlib import Path

def make_tree(files, dirs=()):
    root = Path(tempfile.mkdtemp())
    for name in dirs:
        (root / name).mkdir(parents=True, exist_ok=True)
    for name, size in files.items():
        (root / name).parent.mkdir(parents=True, exist_ok=True)
        (root / name).write_bytes(b"x" * size)
    return root

PROJECT = {
    "README.md": 100,
    "src/app.py": 300,
    "src/lib/util.py": 50,
    "node_modules/left-pad/index.js": 9000,
}

@test("totals include everything below each directory")
def _():
    sizes = dir_sizes(make_tree(PROJECT))
    eq(sizes["src/lib"], 50)
    eq(sizes["src"], 350)
    eq(sizes["."], 9450)

@test("every directory appears, keyed by its relative path")
def _():
    eq(sorted(dir_sizes(make_tree(PROJECT))), [".", "node_modules", "node_modules/left-pad", "src", "src/lib"])

@test("skipped directories aren't entered or counted")
def _():
    eq(dir_sizes(make_tree(PROJECT), skip={"node_modules"}), {".": 450, "src": 350, "src/lib": 50})

@test("skip applies at any depth")
def _():
    root = make_tree({"web/main.js": 10, "web/node_modules/react/index.js": 5000})
    eq(dir_sizes(root, skip={"node_modules"}), {".": 10, "web": 10})

@test("empty directories count as 0")
def _():
    root = make_tree({"a.txt": 7}, dirs=["empty", "nested/also-empty"])
    eq(dir_sizes(root), {".": 7, "empty": 0, "nested": 0, "nested/also-empty": 0})

@test("accepts the root as a string")
def _():
    root = make_tree({"a.txt": 3})
    eq(dir_sizes(str(root)), {".": 3})

@test("walks the tree with os.walk or Path.walk")
def _():
    requires_call("walk", "use os.walk() or Path.walk(), and prune by editing dirnames in place")
```

```hint
`Path(root).walk()` (or `os.walk(root)`) visits each directory top-down. Assign to `dirnames[:]` to prune before it descends.
```

```hint
A directory's own size is the sum of `(dirpath / name).stat().st_size` over its `filenames`. Add that number to the directory **and** to every ancestor: `rel.parents` lists them, ending with `Path(".")`.
```

```hint
`rel.as_posix()` produces keys like `"src/lib"`, and `Path(".").as_posix()` is `"."`. Adding `0` for a directory with no files still creates its key.
```
:::
