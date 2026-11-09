---
title: Command-Line Tools
part: Tools & Automation
summary: commander → argparse: options, subcommands and help, plus exit codes, stdio, env vars and subprocess.
minutes: 40
---

Node hands you `process.argv` and leaves the rest to npm: commander or yargs for parsing, chalk for colour, execa for child processes. Python ships a complete argument parser, `argparse`, with type conversion, validation, generated `--help`, subcommands and proper usage errors, plus `sys`, `os`, `shlex` and `subprocess` for everything around it. The habit worth adopting from the first script: write the CLI as a `main(argv)` function that **returns an exit code**. `parse_args` accepts a list, so the whole tool can be tested by calling a function, with no child process in sight.

## `sys.argv` vs `process.argv`

:::compare
```js
// node deploy.js prod --dry-run
process.argv;          // ["/usr/bin/node", "/app/deploy.js", "prod", "--dry-run"]
process.argv.slice(2); // ["prod", "--dry-run"]
if (require.main === module) main();
```
```python
# python deploy.py prod --dry-run
sys.argv               # ["deploy.py", "prod", "--dry-run"]
sys.argv[1:]           # ["prod", "--dry-run"]
if __name__ == "__main__":
    sys.exit(main())
```
:::

`sys.argv[0]` is the script as it was invoked, so the arguments start at index 1 (Node puts its own binary first, hence `slice(2)`). Every element is a string, as in Node. For a single positional argument `sys.argv` is fine. Past that, `argparse` replaces commander, yargs and Node's own `util.parseArgs`. This is the shape to copy:

```python title="deploy.py"
import argparse
import sys

def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(prog="deploy", description="Ship a build.")
    parser.add_argument("env", choices=["staging", "prod"])
    parser.add_argument("--dry-run", action="store_true")
    args = parser.parse_args(argv)          # None means "read sys.argv[1:]"
    print(f"deploying to {args.env}{' (dry run)' if args.dry_run else ''}")
    return 0

if __name__ == "__main__":
    sys.exit(main())
```

From a shell, `main()` parses the real command line. A test calls `main(["prod", "--dry-run"])` and checks the return value. The `if __name__ == "__main__":` guard ([`__name__` and `python -m`](lesson:modules-and-tooling#name-and-python-m)) keeps an import of the module from running the tool, and handing the result to `sys.exit` turns it into the process's exit status.

```python run
import argparse
import sys

def main(argv=None):
    parser = argparse.ArgumentParser(prog="deploy", description="Ship a build.")
    parser.add_argument("env", choices=["staging", "prod"])
    parser.add_argument("--dry-run", action="store_true")
    args = parser.parse_args(argv)
    print(f"deploying to {args.env}{' (dry run)' if args.dry_run else ''}")
    return 0

print(sys.argv)                       # this sandbox has no command line
print(main(["prod", "--dry-run"]))    # exactly how a test drives it
```

## argparse: positionals and options

:::compare
```js
import { program } from "commander";

program.name("resize").description("Resize images.")
  .argument("<paths...>", "images to resize")
  .requiredOption("-w, --width <px>", "target width in pixels", Number)
  .option("--format <fmt>", "output format", "png")
  .option("-q, --quiet", "print nothing");
program.parse();
const opts = program.opts();   // { width: 800, format: "png", quiet: true }
```
```python
import argparse

parser = argparse.ArgumentParser(prog="resize", description="Resize images.")
parser.add_argument("paths", nargs="+", help="images to resize")
parser.add_argument("-w", "--width", type=int, required=True, help="target width in pixels")
parser.add_argument("--format", default="png", help="output format")
parser.add_argument("-q", "--quiet", action="store_true", help="print nothing")
args = parser.parse_args()
args.width, args.format, args.quiet   # 800, "png", True
```
:::

Each `add_argument` declares one argument. A bare name is a positional, and a name that starts with `-` is an option, optionally with a short and a long spelling. The keyword arguments do the rest:

- `type=` is any one-argument callable that converts the string: `int`, `float`, `pathlib.Path`, or your own function.
- `default=` applies when an option is absent; without one, absent options are `None`.
- `required=True` makes an option mandatory. Positionals already are, unless `nargs` says otherwise.
- `help=` feeds the generated `--help`.

`parse_args` returns an `argparse.Namespace` that you read by attribute. Dashes in option names become underscores (`--dry-run` is `args.dry_run`), and `vars(args)` turns the namespace into a plain dict.

```python run
import argparse

parser = argparse.ArgumentParser(prog="resize", description="Resize images.")
parser.add_argument("paths", nargs="+", help="images to resize")
parser.add_argument("-w", "--width", type=int, required=True, help="target width in pixels")
parser.add_argument("--format", default="png", help="output format")
parser.add_argument("-q", "--quiet", action="store_true", help="print nothing")

args = parser.parse_args(["cat.png", "dog.png", "-w", "800", "-q"])
print(args)
print(args.paths, args.width + 1, args.format, args.quiet)
print(vars(args))
```

:::gotcha Bad values never reach your code
`Number("abc")` is `NaN`, and commander passes it straight through to your action. `type=int` calls `int("abc")`, catches the `ValueError`, and stops with a usage error before `parse_args` returns. Missing required arguments and unknown options stop parsing the same way. Don't re-validate what argparse has already checked; do validate what it can't, such as rules that involve several arguments.
:::

## Flags, choices and repeated values

:::compare
```js
program
  .option("-v, --verbose", "more output", (_, n) => n + 1, 0)   // -vvv
  .addOption(new Option("--level <level>").choices(["debug", "info"]))
  .option("--tag <tag>", "repeatable", (tag, all) => [...all, tag], [])
  .option("--no-color", "disable colour");
```
```python
parser.add_argument("-v", "--verbose", action="count", default=0)
parser.add_argument("--level", choices=["debug", "info"], default="info")
parser.add_argument("--tag", action="append", default=[])
parser.add_argument("--color", action=argparse.BooleanOptionalAction, default=True)
```
:::

`action=` says what an option does when it appears, and `nargs=` says how many values it consumes:

| You want | argparse | You get |
| --- | --- | --- |
| a boolean flag | `action="store_true"` | `False` unless the flag is given |
| `--color` and `--no-color` | `action=argparse.BooleanOptionalAction` | 3.9+ |
| `-vvv` verbosity | `action="count", default=0` | `3` |
| a repeatable option | `action="append"` | a list |
| one of a fixed set | `choices=[...]` | anything else is a usage error |
| an optional positional | `nargs="?"` | `default` when absent |
| any number / at least one | `nargs="*"` / `nargs="+"` | a list |
| exactly two values | `nargs=2` | a list of two |
| `--level` alone means `info` | `nargs="?", const="info"` | `default` when absent |

```python run
import argparse

parser = argparse.ArgumentParser(prog="logs")
parser.add_argument("files", nargs="*", default=["-"])
parser.add_argument("-v", "--verbose", action="count", default=0)
parser.add_argument("--level", choices=["debug", "info", "error"], default="info")
parser.add_argument("--tag", action="append", default=[])
parser.add_argument("--color", action=argparse.BooleanOptionalAction, default=True)
parser.add_argument("--size", nargs=2, type=int, metavar=("W", "H"))

print(parser.parse_args([]))
print(parser.parse_args(["app.log", "-vv", "--tag", "api", "--tag", "db", "--no-color"]))
print(parser.parse_args(["--size", "800", "600", "--level", "error"]))
```

:::quiz output
What does this print?

```python
import argparse
parser = argparse.ArgumentParser(prog="serve")
parser.add_argument("--debug", type=bool, default=False)
print(parser.parse_args(["--debug", "False"]).debug)
```

- [ ] `False`
- [x] `True`
- [ ] `'False'`
- [ ] `ValueError`

`type=` just calls the function on the string, and `bool("False")` is `True`, because every non-empty string is truthy. There is no such thing as a boolean `type`. Use `action="store_true"` for a flag, or `BooleanOptionalAction` when you want both `--debug` and `--no-debug`.
:::

:::quiz output
What does this print?

```python
import argparse
parser = argparse.ArgumentParser(prog="build")
parser.add_argument("--verbose", action="store_true")
print(parser.parse_args(["--verb"]).verbose)
```

- [x] `True`
- [ ] `False`
- [ ] `SystemExit`
- [ ] `AttributeError`

argparse accepts any unambiguous prefix of a long option, so `--verb` means `--verbose`. Handy at a prompt, but scripts that rely on a prefix break the day you add `--verbatim`, because the prefix becomes ambiguous. Pass `allow_abbrev=False` for tools that other scripts call.
:::

:::gotcha `append` adds to a non-empty default
With `action="append", default=["base"]`, passing `--tag x` gives `["base", "x"]`, not `["x"]`: the values are appended to the default. Use `default=[]` (or `None`) and add your defaults after parsing, when the user supplied nothing.
:::

### Mutually exclusive options

:::compare
```js
program
  .addOption(new Option("--json").conflicts("csv"))
  .addOption(new Option("--csv"));
```
```python
fmt = parser.add_mutually_exclusive_group(required=True)
fmt.add_argument("--json", action="store_true")
fmt.add_argument("--csv", action="store_true")
```
:::

`add_mutually_exclusive_group()` enforces "at most one of these", or "exactly one" with `required=True`, and shows the rule in the usage line as `(--json | --csv)`. Its cousin `add_argument_group("output")` is purely cosmetic: it gives a block of options its own heading in `--help`.

```python run
import argparse

parser = argparse.ArgumentParser(prog="report")
output = parser.add_argument_group("output")
output.add_argument("--out", help="write here")
fmt = parser.add_mutually_exclusive_group(required=True)
fmt.add_argument("--json", action="store_true")
fmt.add_argument("--csv", action="store_true")
parser.print_help()
print(parser.parse_args(["--csv"]))
parser.parse_args(["--json", "--csv"])     # a usage error: exit status 2
```

## Help text and usage errors

:::compare
```js
// commander builds --help, and reports bad input:
//   error: option '-w, --width <px>' argument missing
program.error("cannot deploy on a Friday", { exitCode: 2 });
```
```python
# argparse builds -h/--help, and reports bad input:
#   resize: error: argument -w/--width: expected one argument
parser.error("cannot deploy on a Friday")     # usage + message, exit status 2
```
:::

Every parser gets `-h`/`--help` for free, assembled from `prog`, `description`, `epilog` and each argument's `help`. Help strings can interpolate `%(default)s`, `%(choices)s` and `%(prog)s`. Invalid input, whether a missing argument, a failed `type=` conversion or a value outside `choices`, prints the usage line and an error to **stderr** and exits with status 2, the Unix convention for usage errors. `parser.error(msg)` does the same for checks of your own. A custom `type=` function reports a bad value by raising `argparse.ArgumentTypeError` with a readable message.

```python run
import argparse

def positive_int(text):
    value = int(text)
    if value <= 0:
        raise argparse.ArgumentTypeError(f"{value} is not a positive integer")
    return value

parser = argparse.ArgumentParser(prog="resize", description="Resize images.",
                                 epilog="Example: resize -w 800 photo.png")
parser.add_argument("paths", nargs="+", help="images to resize")
parser.add_argument("-w", "--width", type=positive_int, required=True, help="target width in pixels")
parser.add_argument("--format", choices=["png", "jpg"], default="png", help="output format (default: %(default)s)")
parser.print_help()
parser.parse_args(["photo.png", "-w", "-5"])    # usage error on stderr, exit status 2
```

The sandbox reports the exit status where a shell would set `$?`. Python 3.14 adds two conveniences: help and usage text are coloured when they go to a terminal (`color=False` turns that off), and `suggest_on_error=True` adds "maybe you meant" hints for mistyped choices and subcommands. For an interactive tool that parses commands typed at a prompt, `exit_on_error=False` (3.9+) makes the parser raise `argparse.ArgumentError` instead of exiting.

## Subcommands

:::compare
```js
program.command("add <title>")
  .option("-p, --priority <n>", "1 is urgent", Number, 3)
  .action((title, opts) => addTask(title, opts.priority));
program.command("done <id>")
  .action((id) => completeTask(Number(id)));
program.parse();
```
```python
commands = parser.add_subparsers(dest="command", required=True)
add = commands.add_parser("add", help="add a task")
add.add_argument("title")
add.add_argument("-p", "--priority", type=int, default=3, help="1 is urgent")
add.set_defaults(handler=add_task)
done = commands.add_parser("done", help="mark a task done")
done.add_argument("id", type=int)
done.set_defaults(handler=complete_task)
args = parser.parse_args()
args.handler(args)
```
:::

`add_subparsers()` gives you `git`-style commands. Each `add_parser` returns an ordinary parser with its own arguments and its own `--help`. `dest="command"` records which command was chosen, and `required=True` turns a missing command into a usage error rather than an empty `Namespace`. The dispatch idiom is `set_defaults(handler=...)`: each subparser stores its own function in the namespace, so `main` ends with `args.handler(args)` instead of an `if`/`elif` ladder. The [Todo CLI project](lesson:project-todo-cli) builds a complete tool this way.

```python run
import argparse

def add_task(args):
    print(f"added {args.title!r} with priority {args.priority}")

def complete_task(args):
    print(f"completed task {args.id}")

parser = argparse.ArgumentParser(prog="todo")
commands = parser.add_subparsers(dest="command", required=True)
add = commands.add_parser("add", help="add a task")
add.add_argument("title")
add.add_argument("-p", "--priority", type=int, default=3)
add.set_defaults(handler=add_task)
done = commands.add_parser("done", help="mark a task done")
done.add_argument("id", type=int)
done.set_defaults(handler=complete_task)

for argv in (["add", "write docs", "-p", "1"], ["done", "7"]):
    args = parser.parse_args(argv)
    args.handler(args)
parser.print_help()
```

## Exit codes and `SystemExit`

:::compare
```js
process.exit(2);               // stops right here: finally blocks are skipped
console.error("no config"); process.exit(1);
process.exitCode = 1;          // set it, and let the program wind down
```
```python
sys.exit(2)                    # raises SystemExit(2): finally blocks still run
sys.exit("no config")          # prints the message to stderr, exit status 1
sys.exit(main())               # main() returns the status: the usual idiom
```
:::

`sys.exit(code)` doesn't stop the process on the spot. It raises `SystemExit`, which unwinds the stack like any other exception, so `finally` blocks and `with` statements clean up on the way out, and when it reaches the top the interpreter exits with that status. `None` and `0` mean success, an `int` is the status, and anything else, usually a message string, is printed to stderr with status 1. `os._exit(n)` is the abrupt version that skips all cleanup; it exists for child processes after a fork, not for CLIs.

`SystemExit` inherits from `BaseException`, not `Exception`, so an `except Exception:` handler doesn't swallow an exit ([the exception hierarchy](lesson:exceptions#catch-what-you-can-handle)). Tests can still catch it explicitly and inspect `.code`.

```python run
import sys

def main():
    try:
        sys.exit("config file not found")
    finally:
        print("cleanup still runs")

try:
    main()
except SystemExit as exc:
    print(f"SystemExit with code {exc.code!r}")
    print(isinstance(exc, Exception), isinstance(exc, BaseException))
```

| Status | Meaning |
| --- | --- |
| `0` | success |
| `1` | general failure: an uncaught exception (after printing the traceback) or `sys.exit("message")` |
| `2` | usage error: what argparse uses |
| `130` | interrupted with Ctrl-C, on Unix (128 + `SIGINT`) |

:::quiz output
What does this print?

```python
import sys
try:
    sys.exit(3)
except Exception:
    print("caught")
except SystemExit as exc:
    print("exit", exc.code)
```

- [ ] `caught`
- [x] `exit 3`
- [ ] nothing: the program exits first
- [ ] `exit None`

`sys.exit(3)` raises `SystemExit(3)`, and because `SystemExit` isn't an `Exception`, the first handler doesn't match and the second one does. That's deliberate: catch-all handlers in library code shouldn't be able to cancel an exit or a Ctrl-C.
:::

## stdin, stdout and stderr

:::compare
```js
process.stdout.write("no newline");
console.error("warning: disk almost full");          // stderr
const rl = readline.createInterface({ input: process.stdin });
for await (const line of rl) handle(line);
process.stdout.isTTY;                                // a human watching?
```
```python
sys.stdout.write("no newline")                       # or print(..., end="")
print("warning: disk almost full", file=sys.stderr)
for line in sys.stdin:
    handle(line.rstrip("\n"))
sys.stdout.isatty()
```
:::

Data goes to stdout and diagnostics to stderr, so a pipeline like `tool | jq` stays clean: `print(..., file=sys.stderr)` is `console.error`. Reading stdin is synchronous. `for line in sys.stdin` streams it line by line, each line keeping its `"\n"`, and `sys.stdin.read()` slurps the lot. `isatty()` tells you whether a person is watching, which is how tools decide on colours and progress bars.

For testability, take the streams as parameters and let the script pass `sys.stdin` and `sys.stdout`. `io.StringIO` stands in for any text stream, and this sandbox has no terminal attached, so the demo passes one where a script would pass `sys.stdin`:

```python run
import io
import sys

def count_words(stdin, stdout):
    total = sum(len(line.split()) for line in stdin)
    print(total, file=stdout)

fake_in = io.StringIO("the quick brown fox\njumps over\n\nthe lazy dog\n")
fake_out = io.StringIO()
count_words(fake_in, fake_out)
print(repr(fake_out.getvalue()))
count_words(io.StringIO("hello world"), sys.stdout)   # a real stream works the same
```

:::gotcha Piped output is buffered
When stdout is a terminal, Python flushes it line by line. When it's a pipe or a file, it's buffered in blocks, so progress messages show up late, all at once, or out of order relative to stderr. Pass `flush=True` to `print`, run with `python -u`, or set `PYTHONUNBUFFERED=1`.
:::

:::tip Files or stdin, like `cat`
`fileinput.input()` iterates over the lines of every file named in `sys.argv[1:]`, or over stdin when there are none, and treats `-` as stdin: the convention `cat`, `grep` and `sort` follow. Older code uses `type=argparse.FileType("r")` to open files during parsing; it's deprecated in 3.14, so take a path (`type=pathlib.Path`) and open it yourself in a `with` block.
:::

## Environment variables and configuration

:::compare
```js
process.env.API_URL ?? "http://localhost:8000";
process.env.WORKERS = 4;           // silently becomes "4"
const debug = process.env.DEBUG === "1";
```
```python
os.environ.get("API_URL", "http://localhost:8000")
os.environ["WORKERS"] = "4"        # an int raises TypeError
debug = os.environ.get("DEBUG") == "1"
```
:::

`os.environ` is a mutable mapping from strings to strings. A missing variable raises `KeyError` with `[]` and returns the default with `.get()` (`os.getenv` is the same lookup as a function). Values are always strings, and assigning anything else raises `TypeError` instead of coercing. Changes apply to the current process and to any child process it starts afterwards. There's no built-in `.env` loader; `python-dotenv` is the usual package.

The common precedence rule is **flag, then environment variable, then default**. The testable way to implement it is to pass the environment into the function that reads it, the way `main` takes `argv`: production passes `os.environ`, tests pass a plain dict. When a test does need the real environment changed, `unittest.mock.patch.dict` changes it and restores it afterwards.

```python run
import os
from unittest import mock

def settings(environ=os.environ):
    return {
        "api_url": environ.get("APP_API_URL", "http://localhost:8000"),
        "workers": int(environ.get("APP_WORKERS", "2")),
        "debug": environ.get("APP_DEBUG", "").lower() in {"1", "true", "yes"},
    }

print(settings())
print(settings({"APP_WORKERS": "8", "APP_DEBUG": "True"}))      # inject a dict
with mock.patch.dict(os.environ, {"APP_API_URL": "https://api.example.com"}):
    print(settings()["api_url"])                                # or patch the real one
```

:::gotcha `"false"` is truthy
Every environment variable is a string, and every non-empty string is truthy, so `if os.environ.get("DEBUG"):` is on for `DEBUG=0` and `DEBUG=false` too. JavaScript has the same trap with `if (process.env.DEBUG)`. Compare against an explicit set of spellings, and decide what an unrecognised value should do.
:::

## `shlex` and `subprocess`

:::compare
```js
import { exec, execFileSync } from "node:child_process";
execFileSync("git", ["log", "--oneline", "-5"], { encoding: "utf8" });
// exec() runs a shell: an injection risk with user input
exec(`grep ${pattern} notes.txt`);
```
```python
import subprocess
subprocess.run(["git", "log", "--oneline", "-5"], capture_output=True, text=True, check=True).stdout
# shell=True runs a shell: the same injection risk
subprocess.run(f"grep {pattern} notes.txt", shell=True)
```
:::

`subprocess.run` is the one function to learn. Pass the command as a **list**, so no shell is involved and nothing needs quoting. `capture_output=True` collects stdout and stderr, `text=True` decodes them to `str` instead of `bytes`, `check=True` raises `CalledProcessError` on a non-zero exit status, and `timeout=` stops a child that hangs. `shell=True` hands a string to the system shell and brings back every injection bug that `exec` has. The sandbox can't start processes, so this stays static:

```python
import subprocess
import sys

result = subprocess.run(
    ["git", "status", "--porcelain"],
    capture_output=True, text=True, check=True, timeout=10,
)
changed = [line[3:] for line in result.stdout.splitlines()]
try:
    subprocess.run(["git", "push"], check=True)
except subprocess.CalledProcessError as exc:
    print(f"git push failed with status {exc.returncode}", file=sys.stderr)
```

When a command arrives as a single string, from a config file or a `--exec` option, `shlex.split` turns it into a list the way a POSIX shell would, honouring quotes. `shlex.quote` goes the other way when you really must build a shell string, and `shlex.join` (3.8+) quotes a whole list.

```python run
import shlex

print(shlex.split('git commit -m "fix: handle empty input" --author="Ada L"'))
print("a  'b c'".split(), shlex.split("a  'b c'"))
print(shlex.quote("my file.txt"), shlex.quote("it's"))
print(shlex.join(["grep", "-r", "TODO list", "src/"]))
```

:::quiz output
What does this print?

```python
import shlex
print(len(shlex.split('cp "My Documents/a.txt" backup/')))
```

- [ ] `2`
- [x] `3`
- [ ] `4`
- [ ] `ValueError`

The quotes keep `My Documents/a.txt` together as one argument and are removed, exactly as a shell would do it: `['cp', 'My Documents/a.txt', 'backup/']`. `str.split()` would give four pieces with the quote characters still attached. `shlex` follows POSIX shell rules, not those of Windows' `cmd.exe`.
:::

## Shipping it: entry points, click and typer

:::compare
```json
{
  "name": "resize-tool",
  "bin": { "resize": "./dist/cli.js" }
}
```
```toml
[project]
name = "resize-tool"

[project.scripts]
resize = "resize_tool.cli:main"
```
:::

`[project.scripts]` is `"bin"`. Installing the package with `pip install .`, `uv tool install .` or `pipx install .` generates a `resize` executable that imports `resize_tool.cli` and calls `sys.exit(main())`. That's the contract: `main` takes no required arguments, reads `sys.argv` through `parse_args()`, and returns the exit status. During development, `uv run resize ...` runs it inside the project's environment, and `python -m resize_tool` works once the package has a `__main__.py`. [Modules & Tooling](lesson:modules-and-tooling#pyproject-toml) covers the rest of `pyproject.toml`.

click and typer are the popular third-party frameworks, roughly where commander and yargs sit on npm. click builds a CLI from decorators; typer builds one from type hints, on top of click. Both add coloured help, prompts, nested command groups and shell completion. argparse covers everything in this lesson with no dependency, which matters for a script you'll copy onto a server.

```python
import click

@click.command()
@click.argument("paths", nargs=-1, required=True)
@click.option("-w", "--width", type=int, required=True, help="Target width in pixels.")
@click.option("-q", "--quiet", is_flag=True, help="Print nothing.")
def resize(paths, width, quiet):
    """Resize images."""
    for path in paths:
        if not quiet:
            click.echo(f"resizing {path} to {width}px")

if __name__ == "__main__":
    resize()
```

```python
from pathlib import Path
from typing import Annotated

import typer

def resize(
    paths: list[Path],
    width: Annotated[int, typer.Option("--width", "-w", help="Target width in pixels.")],
    quiet: bool = False,                    # becomes --quiet / --no-quiet
):
    """Resize images."""
    for path in paths:
        if not quiet:
            print(f"resizing {path} to {width}px")

if __name__ == "__main__":
    typer.run(resize)
```

## Cheat sheet

| JavaScript | Python | Notes |
| --- | --- | --- |
| `process.argv.slice(2)` | `sys.argv[1:]` | `sys.argv[0]` is the script |
| `require.main === module` | `if __name__ == "__main__":` | |
| `new Command("resize")` | `argparse.ArgumentParser(prog="resize")` | stdlib |
| `.argument("<file>")` | `add_argument("file")` | positional |
| `.option("-w, --width <px>", "", Number)` | `add_argument("-w", "--width", type=int)` | bad values exit with 2 |
| `.requiredOption(...)` | `add_argument(..., required=True)` | |
| `.option("-q, --quiet")` | `action="store_true"` | never `type=bool` |
| `--color` / `--no-color` | `action=argparse.BooleanOptionalAction` | 3.9+ |
| `.choices([...])` | `choices=[...]` | |
| `<files...>` | `nargs="+"` or `nargs="*"` | a list |
| `.command("add")` | `add_subparsers().add_parser("add")` | `set_defaults(handler=...)` |
| `.conflicts("csv")` | `add_mutually_exclusive_group()` | |
| `program.error(msg)` | `parser.error(msg)` | exit status 2 |
| `process.exit(1)` | `sys.exit(1)` | raises `SystemExit`; cleanup runs |
| `console.error(msg)` | `print(msg, file=sys.stderr)` | |
| `process.stdout.isTTY` | `sys.stdout.isatty()` | |
| `readline` over stdin | `for line in sys.stdin:` | synchronous |
| `process.env.X ?? d` | `os.environ.get("X", d)` | values are strings |
| `execFileSync(cmd, args)` | `subprocess.run([cmd, *args], check=True)` | a list, not a shell string |
| shell-style splitting | `shlex.split(s)` | POSIX rules |
| `"bin"` in package.json | `[project.scripts]` | runs `sys.exit(main())` |

## Challenges

:::challenge id=cli-build-parser title="A parser for thumbnail" difficulty=easy
Write `build_parser()` that returns an `argparse.ArgumentParser` with `prog="thumbnail"` (return the parser, not parsed arguments). It accepts:

- one or more positional `images`,
- `-s`/`--size`, an `int` with default `256`,
- `--format`, one of `png`, `jpeg` or `webp`, with default `png`,
- `-o`/`--output-dir`, with default `"thumbs"` (it lands in `args.output_dir`),
- `-f`/`--force`, a flag that defaults to `False`,
- `-v`/`--verbose`, which can be repeated: `-vv` gives `2`, and the default is `0`.

Anything invalid must be a usage error, which argparse already reports with exit status 2.

```js
const program = new Command("thumbnail")
  .argument("<images...>")
  .option("-s, --size <px>", "longest side in pixels", Number, 256)
  .addOption(new Option("--format <fmt>").choices(["png", "jpeg", "webp"]).default("png"))
  .option("-o, --output-dir <dir>", "where to write", "thumbs")
  .option("-f, --force", "overwrite existing files")
  .option("-v, --verbose", "repeat for more", (_, n) => n + 1, 0);
```

```python starter
import argparse

def build_parser():
    parser = argparse.ArgumentParser(prog="thumbnail")
    # add the arguments here
    return parser
```

```python solution
import argparse

def build_parser():
    parser = argparse.ArgumentParser(prog="thumbnail", description="Make thumbnails of images.")
    parser.add_argument("images", nargs="+", help="image files to shrink")
    parser.add_argument("-s", "--size", type=int, default=256, help="longest side in pixels")
    parser.add_argument("--format", choices=["png", "jpeg", "webp"], default="png")
    parser.add_argument("-o", "--output-dir", default="thumbs", help="where to write")
    parser.add_argument("-f", "--force", action="store_true", help="overwrite existing files")
    parser.add_argument("-v", "--verbose", action="count", default=0, help="repeat for more output")
    return parser
```

```python tests
import argparse
import io
from contextlib import redirect_stderr

def usage_error(argv):
    """Parse argv expecting a usage error; return (exit status, stderr)."""
    with redirect_stderr(io.StringIO()) as err:
        exc = raises(SystemExit, build_parser().parse_args, argv)
    return exc.code, err.getvalue()

@test("returns an ArgumentParser called thumbnail")
def _():
    parser = build_parser()
    check(isinstance(parser, argparse.ArgumentParser), "return the parser itself, not the parsed arguments")
    eq(parser.prog, "thumbnail")

@test("the defaults")
def _():
    args = build_parser().parse_args(["cat.png"])
    eq(args.images, ["cat.png"])
    eq((args.size, args.format, args.output_dir, args.force, args.verbose), (256, "png", "thumbs", False, 0))

@test("several images and every short option")
def _():
    args = build_parser().parse_args(["a.png", "b.png", "-s", "128", "--format", "webp", "-o", "out", "-f", "-vv"])
    eq(args.images, ["a.png", "b.png"])
    eq((args.size, args.format, args.output_dir, args.force, args.verbose), (128, "webp", "out", True, 2))

@test("the long option names work too")
def _():
    args = build_parser().parse_args(["--size", "64", "--output-dir", "x", "--force", "--verbose", "a.png"])
    eq((args.size, args.output_dir, args.force, args.verbose), (64, "x", True, 1))

@test("the size is converted to an int")
def _():
    check(type(build_parser().parse_args(["a.png", "-s", "99"]).size) is int, "use type=int")

@test("bad input is a usage error with exit status 2")
def _():
    for argv in ([], ["a.png", "--format", "gif"], ["a.png", "--size", "big"]):
        status, err = usage_error(argv)
        eq(status, 2, f"exit status for {argv}")
        check("usage: thumbnail" in err, "argparse prints the usage line to stderr")
```

```hint
Positionals have no dashes: `add_argument("images", nargs="+")` collects one or more values into a list.
```

```hint
Give options both spellings, short first: `add_argument("-o", "--output-dir", default="thumbs")`. The dash in the long name becomes an underscore in `args`.
```

```hint
`action="store_true"` makes a flag, `action="count", default=0` counts repeats, and `choices=[...]` rejects anything else.
```
:::

:::challenge id=cli-run-main title="From outcome to exit status" difficulty=medium
A CLI's entry point should turn whatever happens inside `main` into an exit status, with a friendly message instead of a traceback. Write `run(main, argv)` that calls `main(argv)` and returns the status as an `int`:

- `main` returns normally: `None` means `0`, and an `int` is the status.
- `main` raises `SystemExit` (from `sys.exit()` or from argparse): read its `code` with the same rules, except that a non-int code, usually a message, is printed to stderr and gives status `1`.
- `KeyboardInterrupt` (Ctrl-C): print `interrupted` to stderr and return `130`.
- Any other exception: print `error: <message>` to stderr, with no traceback, and return `1`.

Print to `sys.stderr` when you need it, not to a stream captured at import time, so tests can redirect it.

```js
async function run(main, argv) {
  try {
    return (await main(argv)) ?? 0;
  } catch (err) {
    console.error(`error: ${err.message}`);
    return 1;
  }
}
process.on("SIGINT", () => process.exit(130));
```

```python starter
import sys

def run(main, argv):
    ...
```

```python solution
import sys

def run(main, argv):
    try:
        status = main(argv)
    except SystemExit as exc:
        status = exc.code
    except KeyboardInterrupt:
        print("interrupted", file=sys.stderr)
        return 130
    except Exception as exc:
        print(f"error: {exc}", file=sys.stderr)
        return 1
    if status is None:
        return 0
    if isinstance(status, int):
        return status
    print(status, file=sys.stderr)
    return 1
```

```python tests
import argparse
import io
import sys
from contextlib import redirect_stderr

def outcome(main, argv=()):
    """Return (status, stderr) for run(main, argv)."""
    with redirect_stderr(io.StringIO()) as err:
        status = run(main, list(argv))
    return status, err.getvalue()

@test("passes argv through and returns main's status")
def _():
    eq(outcome(lambda argv: len(argv), ["a", "b"])[0], 2)

@test("None means success")
def _():
    eq(outcome(lambda argv: None), (0, ""))

@test("sys.exit codes become the status")
def _():
    def fail(argv):
        sys.exit(3)
    def done(argv):
        sys.exit()
    eq(outcome(fail), (3, ""))
    eq(outcome(done), (0, ""))

@test("a sys.exit message goes to stderr with status 1")
def _():
    def main(argv):
        sys.exit("config file not found")
    status, err = outcome(main)
    eq(status, 1)
    eq(err.strip(), "config file not found")

@test("argparse usage errors keep status 2")
def _():
    def main(argv):
        parser = argparse.ArgumentParser(prog="tool")
        parser.add_argument("--count", type=int)
        parser.parse_args(argv)
    eq(outcome(main, ["--count", "many"])[0], 2)

@test("other exceptions print one error line, with no traceback")
def _():
    def main(argv):
        raise FileNotFoundError("settings.toml is missing")
    status, err = outcome(main)
    eq(status, 1)
    eq(err.strip(), "error: settings.toml is missing")

@test("Ctrl-C gives status 130")
def _():
    def main(argv):
        raise KeyboardInterrupt
    try:
        status, err = outcome(main)
    except KeyboardInterrupt:
        raise CheckFailed("run() let KeyboardInterrupt escape: catch it and return 130") from None
    eq(status, 130)
    check("interrupted" in err, "tell the user why the tool stopped")
```

```hint
`SystemExit` and `KeyboardInterrupt` derive from `BaseException`, not `Exception`, so each needs its own `except` clause. Order doesn't matter between them and `except Exception`, because the three never overlap.
```

```hint
Treat a `SystemExit` code exactly like a return value: put both in one `status` variable, then decide once. `None` gives `0`, an `int` is returned as is, and anything else is printed to stderr with status `1`.
```

```hint
`print(..., file=sys.stderr)` looks `sys.stderr` up at call time, which is what lets the tests capture it.
```
:::

:::challenge id=cli-env-config title="Flags beat environment beats defaults" difficulty=medium
Write `load_config(argv, environ)` for a server's CLI. It returns a dict with three settings, each taken from a command-line flag if given, else from an environment variable, else from a default:

| Setting | Flag | Variable | Default |
| --- | --- | --- | --- |
| `host` | `--host` | `APP_HOST` | `"127.0.0.1"` |
| `port` | `--port` | `APP_PORT` | `8000` |
| `debug` | `--debug` / `--no-debug` | `APP_DEBUG` | `False` |

- `port` is always an `int`, and a malformed `APP_PORT` raises `ValueError`.
- `APP_DEBUG` understands `1`, `true`, `yes` and `on` as true and `0`, `false`, `no`, `off` and the empty string as false, ignoring case and surrounding whitespace. Anything else raises `ValueError`.
- An explicit `--no-debug` must win over `APP_DEBUG=1`.
- Read variables from `environ` (a mapping) only, never from `os.environ`, so tests can pass a plain dict.

```js
function loadConfig(argv, env) {
  const { values } = parseArgs({ args: argv, options: {
    host: { type: "string" }, port: { type: "string" }, debug: { type: "boolean" },
  } });
  return {
    host: values.host ?? env.APP_HOST ?? "127.0.0.1",
    port: Number(values.port ?? env.APP_PORT ?? 8000),
    debug: values.debug ?? ["1", "true", "yes", "on"].includes((env.APP_DEBUG ?? "").toLowerCase()),
  };
}
```

```python starter
import argparse

def load_config(argv, environ):
    ...
```

```python solution
import argparse

TRUTHY = {"1", "true", "yes", "on"}
FALSY = {"0", "false", "no", "off", ""}

def parse_bool(text):
    value = text.strip().lower()
    if value in TRUTHY:
        return True
    if value in FALSY:
        return False
    raise ValueError(f"not a boolean: {text!r}")

def load_config(argv, environ):
    parser = argparse.ArgumentParser(prog="serve")
    parser.add_argument("--host")
    parser.add_argument("--port", type=int)
    parser.add_argument("--debug", action=argparse.BooleanOptionalAction)
    args = parser.parse_args(argv)
    return {
        "host": args.host if args.host is not None else environ.get("APP_HOST", "127.0.0.1"),
        "port": args.port if args.port is not None else int(environ.get("APP_PORT", "8000")),
        "debug": args.debug if args.debug is not None else parse_bool(environ.get("APP_DEBUG", "")),
    }
```

```python tests
@test("defaults when nothing is set")
def _():
    eq(load_config([], {}), {"host": "127.0.0.1", "port": 8000, "debug": False})

@test("the environment overrides the defaults")
def _():
    env = {"APP_HOST": "0.0.0.0", "APP_PORT": "9000", "APP_DEBUG": "true"}
    eq(load_config([], env), {"host": "0.0.0.0", "port": 9000, "debug": True})

@test("flags override the environment")
def _():
    env = {"APP_HOST": "0.0.0.0", "APP_PORT": "9000", "APP_DEBUG": "1"}
    argv = ["--host", "example.test", "--port", "7000", "--no-debug"]
    eq(load_config(argv, env), {"host": "example.test", "port": 7000, "debug": False})

@test("--debug turns debugging on")
def _():
    eq(load_config(["--debug"], {"APP_DEBUG": "0"})["debug"], True)

@test("the port is always an int")
def _():
    check(type(load_config([], {"APP_PORT": "9000"})["port"]) is int, "convert APP_PORT with int()")
    check(type(load_config(["--port", "7000"], {})["port"]) is int, "use type=int for --port")

@test("boolean spellings from the environment")
def _():
    for text in ("1", "true", "TRUE", "Yes", "on", " true "):
        eq(load_config([], {"APP_DEBUG": text})["debug"], True, f"APP_DEBUG={text!r}")
    for text in ("0", "false", "False", "no", "OFF", ""):
        eq(load_config([], {"APP_DEBUG": text})["debug"], False, f"APP_DEBUG={text!r}")

@test("an unrecognised boolean raises ValueError")
def _():
    raises(ValueError, load_config, [], {"APP_DEBUG": "maybe"})

@test("a malformed APP_PORT raises ValueError")
def _():
    raises(ValueError, load_config, [], {"APP_PORT": "eighty"})

@test("reads only the environ it is given")
def _():
    import os
    from unittest import mock
    with mock.patch.dict(os.environ, {"APP_PORT": "1234", "APP_DEBUG": "1"}):
        eq(load_config([], {}), {"host": "127.0.0.1", "port": 8000, "debug": False}, "use the environ argument, not os.environ")
```

```hint
Leave every option's default as `None`. Then `args.port is None` means "not given on the command line", and you can fall back to the environment. A truthiness test such as `args.debug or ...` would let `APP_DEBUG=1` beat an explicit `--no-debug`.
```

```hint
`action=argparse.BooleanOptionalAction` gives you `--debug` and `--no-debug` in one argument: `True`, `False`, or `None` when neither appears.
```

```hint
Write a small `parse_bool(text)`: `text.strip().lower()`, then check it against a set of true spellings and a set of false ones, and raise `ValueError` for anything else.
```
:::

:::challenge id=cli-kv-tool title="A key-value store CLI" difficulty=hard
Build `main(argv, store)` for `kv`, a tiny key-value tool with subcommands. `store` is a dict that `main` reads and modifies, so tests can inspect it.

| Command | Behaviour |
| --- | --- |
| `set KEY VALUE` | stores the value, prints nothing |
| `get KEY` | prints the value |
| `delete KEY` | removes the key, prints nothing |
| `list [--prefix P] [--keys \| --values]` | prints `key=value` lines sorted by key, only keys starting with `P`; `--keys` prints only the keys and `--values` only the values, and the two can't be combined |

`main` returns `0` on success. For `get` or `delete` of a missing key, it prints `kv: no such key: KEY` to stderr and returns `1`. Usage errors (no command, an unknown command, missing arguments, `--keys` with `--values`) are argparse's job: let it print the usage and exit with status 2.

```js
function main(argv, store) {
  const program = new Command("kv").exitOverride();
  let status = 0;
  program.command("set <key> <value>").action((key, value) => { store[key] = value; });
  program.command("get <key>").action((key) => {
    if (key in store) console.log(store[key]);
    else { console.error(`kv: no such key: ${key}`); status = 1; }
  });
  // ...delete and list
  program.parse(argv, { from: "user" });
  return status;
}
```

```python starter
import argparse
import sys

def main(argv, store):
    ...
```

```python solution
import argparse
import sys

def missing(key):
    print(f"kv: no such key: {key}", file=sys.stderr)
    return 1

def cmd_set(args, store):
    store[args.key] = args.value
    return 0

def cmd_get(args, store):
    if args.key not in store:
        return missing(args.key)
    print(store[args.key])
    return 0

def cmd_delete(args, store):
    if args.key not in store:
        return missing(args.key)
    del store[args.key]
    return 0

def cmd_list(args, store):
    for key in sorted(k for k in store if k.startswith(args.prefix)):
        if args.keys:
            print(key)
        elif args.values:
            print(store[key])
        else:
            print(f"{key}={store[key]}")
    return 0

def build_parser():
    parser = argparse.ArgumentParser(prog="kv", description="A tiny key-value store.")
    commands = parser.add_subparsers(dest="command", required=True)

    set_cmd = commands.add_parser("set", help="store a value")
    set_cmd.add_argument("key")
    set_cmd.add_argument("value")
    set_cmd.set_defaults(handler=cmd_set)

    get_cmd = commands.add_parser("get", help="print a value")
    get_cmd.add_argument("key")
    get_cmd.set_defaults(handler=cmd_get)

    delete_cmd = commands.add_parser("delete", help="remove a key")
    delete_cmd.add_argument("key")
    delete_cmd.set_defaults(handler=cmd_delete)

    list_cmd = commands.add_parser("list", help="print the stored entries")
    list_cmd.add_argument("--prefix", default="")
    only = list_cmd.add_mutually_exclusive_group()
    only.add_argument("--keys", action="store_true", help="print only the keys")
    only.add_argument("--values", action="store_true", help="print only the values")
    list_cmd.set_defaults(handler=cmd_list)
    return parser

def main(argv, store):
    args = build_parser().parse_args(argv)
    return args.handler(args, store)
```

```python tests
import io
from contextlib import redirect_stderr, redirect_stdout

def call(argv, store):
    """Run main and return (status, stdout, stderr)."""
    out, err = io.StringIO(), io.StringIO()
    with redirect_stdout(out), redirect_stderr(err):
        status = main(argv, store)
    return status, out.getvalue(), err.getvalue()

def usage_status(argv):
    with redirect_stdout(io.StringIO()), redirect_stderr(io.StringIO()):
        return raises(SystemExit, main, argv, {}).code

@test("set stores a value and prints nothing")
def _():
    store = {}
    eq(call(["set", "region", "eu-west-1"], store), (0, "", ""))
    eq(store, {"region": "eu-west-1"})

@test("get prints the value")
def _():
    eq(call(["get", "region"], {"region": "eu-west-1"}), (0, "eu-west-1\n", ""))

@test("a missing key is reported on stderr with status 1")
def _():
    status, out, err = call(["get", "nope"], {})
    eq((status, out), (1, ""))
    eq(err.strip(), "kv: no such key: nope")

@test("delete removes a key, and fails for a missing one")
def _():
    store = {"a": "1", "b": "2"}
    eq(call(["delete", "a"], store), (0, "", ""))
    eq(store, {"b": "2"})
    eq(call(["delete", "a"], store)[0], 1)

@test("list prints key=value lines sorted by key")
def _():
    store = {"zone": "b", "app": "web", "env": "prod"}
    eq(call(["list"], store), (0, "app=web\nenv=prod\nzone=b\n", ""))

@test("list filters by prefix and can print only keys or only values")
def _():
    store = {"db.port": "5432", "cache.ttl": "60", "db.host": "10.0.0.1"}
    eq(call(["list", "--prefix", "db."], store)[1], "db.host=10.0.0.1\ndb.port=5432\n")
    eq(call(["list", "--keys"], store)[1], "cache.ttl\ndb.host\ndb.port\n")
    eq(call(["list", "--prefix", "db.", "--values"], store)[1], "10.0.0.1\n5432\n")

@test("an empty listing prints nothing")
def _():
    eq(call(["list", "--prefix", "x"], {"a": "1"}), (0, "", ""))

@test("values may contain spaces and equals signs")
def _():
    store = {}
    call(["set", "greeting", "hello = world"], store)
    eq(call(["get", "greeting"], store)[1], "hello = world\n")

@test("usage errors exit with status 2")
def _():
    eq(usage_status([]), 2)
    eq(usage_status(["fetch", "a"]), 2)
    eq(usage_status(["set", "only-a-key"]), 2)
    eq(usage_status(["list", "--keys", "--values"]), 2)
```

```hint
Start with `parser.add_subparsers(dest="command", required=True)` and one `add_parser` per command. Give each subparser its handler with `set_defaults(handler=cmd_get)`, so `main` is just `args = parser.parse_args(argv)` and `return args.handler(args, store)`.
```

```hint
`--keys` and `--values` belong in `list_cmd.add_mutually_exclusive_group()`, each with `action="store_true"`. argparse then rejects the pair on its own.
```

```hint
Report a missing key with `print(f"kv: no such key: {key}", file=sys.stderr)` and `return 1`. Usage errors need no code at all: argparse raises `SystemExit(2)` for you.
```
:::
