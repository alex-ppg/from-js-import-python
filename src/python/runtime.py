"""
fjip runtime: executes learner code (and challenge tests) inside Pyodide.

The web worker (src/python/worker.ts) and the content validator
(scripts/validate.ts) both load this module once per interpreter and drive it
through `run_json`, which always returns a JSON string so the JavaScript side
never has to manage PyProxy lifetimes.

Behaviour worth knowing:
  * Every run gets a brand-new `__main__` module, so runs never leak state.
  * Like a REPL/notebook, the value of a trailing expression is reported.
  * Top-level `await` works, and a top-level `asyncio.run(coro)` is rewritten
    to `await coro` (the browser already owns the event loop).
  * Tracebacks are trimmed to the learner's own frames.
"""

from __future__ import annotations

import ast
import builtins
import contextlib
import copy
import inspect
import io
import json
import linecache
import math
import sys
import time
import traceback
import types

USER_FILE = "main.py"
TESTS_FILE = "tests.py"
_HARNESS_FILE = __file__
_FLAGS = ast.PyCF_ALLOW_TOP_LEVEL_AWAIT
_NO_VALUE = object()


# --------------------------------------------------------------------------
# Small helpers
# --------------------------------------------------------------------------


def _short(value: object, limit: int = 400) -> str:
    try:
        text = repr(value)
    except Exception as exc:  # a broken __repr__ shouldn't crash the harness
        text = f"<unrepresentable {type(value).__name__}: {exc}>"
    return text if len(text) <= limit else text[:limit] + "…"


def _register_source(filename: str, source: str) -> None:
    """Make tracebacks (and inspect.getsource) able to show source lines."""
    lines = source.splitlines(keepends=True)
    linecache.cache[filename] = (len(source), None, lines, filename)


def _input_unavailable(prompt: object = "") -> str:
    raise OSError(
        "input() isn't available in the browser sandbox; "
        "assign the value you want to test to a variable instead."
    )


builtins.input = _input_unavailable


class _Tee(io.TextIOBase):
    """Write to the live stream (shown to the learner) and to a capture buffer."""

    def __init__(self, live, capture: io.StringIO) -> None:
        self._live = live
        self._capture = capture

    def write(self, text: str) -> int:
        self._live.write(text)
        self._capture.write(text)
        return len(text)

    def flush(self) -> None:
        self._live.flush()

    def isatty(self) -> bool:
        return False

    @property
    def encoding(self) -> str:
        return "utf-8"


class _TopLevelAsyncioRun(ast.NodeTransformer):
    """Rewrite module-level `asyncio.run(coro)` into `await coro`."""

    def _skip(self, node):
        return node

    visit_FunctionDef = visit_AsyncFunctionDef = visit_Lambda = visit_ClassDef = _skip

    def visit_Call(self, node: ast.Call):
        self.generic_visit(node)
        func = node.func
        if (
            isinstance(func, ast.Attribute)
            and func.attr == "run"
            and isinstance(func.value, ast.Name)
            and func.value.id == "asyncio"
            and len(node.args) == 1
            and not node.keywords
        ):
            return ast.copy_location(ast.Await(value=node.args[0]), node)
        return node


def _parse(source: str, filename: str) -> ast.Module:
    return compile(
        source, filename, "exec", flags=ast.PyCF_ONLY_AST | _FLAGS, dont_inherit=True
    )


def _compile_user(tree: ast.Module, show_last: bool):
    """Compile an already-parsed module (mutates `tree`; pass a copy)."""
    tree = ast.fix_missing_locations(_TopLevelAsyncioRun().visit(tree))
    last = None
    if show_last and tree.body and isinstance(tree.body[-1], ast.Expr):
        last_stmt = tree.body.pop()
        last = compile(
            ast.Expression(body=last_stmt.value),
            USER_FILE,
            "eval",
            flags=_FLAGS,
            dont_inherit=True,
        )
    body = compile(tree, USER_FILE, "exec", flags=_FLAGS, dont_inherit=True)
    return body, last


class _Escaped(Exception):
    """Carries a StopIteration out of a coroutine unchanged (see _evaluate)."""

    def __init__(self, original: BaseException) -> None:
        super().__init__(original)
        self.original = original


async def _evaluate(code: types.CodeType, namespace: dict):
    # PEP 479 turns a StopIteration escaping a coroutine into
    # "RuntimeError: coroutine raised StopIteration". Learner code runs inside
    # this coroutine only so that top-level await works, so smuggle the real
    # exception out; run() unwraps it (it must not be re-raised from inside a
    # coroutine, or the conversion happens all over again).
    try:
        result = eval(code, namespace)
        if code.co_flags & inspect.CO_COROUTINE:
            result = await result
        return result
    except StopIteration as exc:
        raise _Escaped(exc) from None


def _unwrap(exc: BaseException) -> BaseException:
    return exc.original if isinstance(exc, _Escaped) else exc


def _fresh_main() -> dict:
    module = types.ModuleType("__main__")
    module.__file__ = USER_FILE
    sys.modules["__main__"] = module
    return module.__dict__


# --------------------------------------------------------------------------
# Error formatting
# --------------------------------------------------------------------------


def _innermost_line(exc: BaseException, filenames: tuple[str, ...]):
    found = None
    tb = exc.__traceback__
    while tb is not None:
        filename = tb.tb_frame.f_code.co_filename
        if filename in filenames:
            found = (filename, tb.tb_lineno)
        tb = tb.tb_next
    return found


def _format_error(exc: BaseException) -> dict:
    if isinstance(exc, SyntaxError) and exc.filename in (USER_FILE, TESTS_FILE):
        text = "".join(traceback.format_exception_only(type(exc), exc))
        line = exc.lineno if exc.filename == USER_FILE else None
        return {
            "type": type(exc).__name__,
            "message": exc.msg,
            "traceback": text,
            "line": line,
        }

    tb = exc.__traceback__
    while tb is not None and tb.tb_frame.f_code.co_filename == _HARNESS_FILE:
        tb = tb.tb_next
    text = "".join(traceback.format_exception(type(exc), exc, tb))
    where = _innermost_line(exc, (USER_FILE,))
    return {
        "type": type(exc).__name__,
        "message": str(exc),
        "traceback": text,
        "line": where[1] if where else None,
    }


# --------------------------------------------------------------------------
# Test API (available inside challenge test code)
# --------------------------------------------------------------------------


class CheckFailed(AssertionError):
    """Raised by the check helpers; its message is shown to the learner."""


def _join(msg: str | None, detail: str) -> str:
    return f"{msg}: {detail}" if msg else detail


def _build_test_api(source: str, tree: ast.Module | None, stdout: str):
    registered: list[tuple[str, object]] = []

    def test(name=None):
        """Register a test: `@test("does the thing")` above a function."""
        if callable(name):
            registered.append((name.__name__, name))
            return name

        def decorator(fn):
            registered.append((name or fn.__name__, fn))
            return fn

        return decorator

    def eq(actual, expected, msg: str | None = None) -> None:
        """Assert `actual == expected`."""
        if actual != expected:
            raise CheckFailed(
                _join(msg, f"expected {_short(expected)}, got {_short(actual)}")
            )

    def approx(actual, expected, tol: float = 1e-9, msg: str | None = None) -> None:
        """Assert two numbers are equal within `tol` (relative or absolute)."""
        if not math.isclose(actual, expected, rel_tol=tol, abs_tol=tol):
            raise CheckFailed(
                _join(msg, f"expected ≈{_short(expected)}, got {_short(actual)}")
            )

    def check(condition, msg: str = "check failed") -> None:
        """Assert that `condition` is truthy."""
        if not condition:
            raise CheckFailed(msg)

    class _Raises:
        def __init__(self, exc_type):
            self.exc_type = exc_type
            self.exception = None

        def __enter__(self):
            return self

        def __exit__(self, exc_type, exc, tb):
            if exc_type is None:
                raise CheckFailed(
                    f"expected {self.exc_type.__name__} to be raised, but nothing was raised"
                )
            if issubclass(exc_type, self.exc_type):
                self.exception = exc
                return True
            raise CheckFailed(
                f"expected {self.exc_type.__name__}, but {exc_type.__name__} was raised: {exc}"
            )

    def raises(exc_type, fn=_NO_VALUE, *args, **kwargs):
        """`raises(KeyError, fn, *args)` or `with raises(KeyError): ...`."""
        ctx = _Raises(exc_type)
        if fn is _NO_VALUE:
            return ctx
        if not callable(fn):
            # Usually `raises(E, f(x))` instead of `raises(E, f, x)`: f(x) ran
            # (and returned) before raises() could watch it.
            raise CheckFailed(
                f"expected {exc_type.__name__} to be raised, but the call returned {_short(fn)}"
            )
        with ctx:
            fn(*args, **kwargs)
        return ctx.exception

    def output_of(fn, *args, **kwargs) -> str:
        """Call `fn` and return everything it printed."""
        buffer = io.StringIO()
        with contextlib.redirect_stdout(buffer):
            fn(*args, **kwargs)
        return buffer.getvalue()

    nodes = list(ast.walk(tree)) if tree is not None else []

    def _scope(within: str | None) -> list:
        """All nodes, or just those inside the function/class named `within`.

        Scoping matters when the starter already contains code (e.g. earlier
        steps of a project) that would satisfy a module-wide check.
        """
        if within is None:
            return nodes
        for node in nodes:
            if isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef, ast.ClassDef)) and node.name == within:
                return list(ast.walk(node))
        raise CheckFailed(f"couldn't find a function or class named {within!r}")

    def _has(node_type, within: str | None) -> bool:
        return any(isinstance(node, node_type) for node in _scope(within))

    def requires_syntax(node_type, msg: str, within: str | None = None) -> None:
        """Fail unless the code (or the def/class named `within`) contains a `node_type` node."""
        if not _has(node_type, within):
            raise CheckFailed(msg)

    def forbids_syntax(node_type, msg: str, within: str | None = None) -> None:
        """Fail if the code (or the def/class named `within`) contains a `node_type` node."""
        if _has(node_type, within):
            raise CheckFailed(msg)

    def _called_names(within: str | None) -> set[str]:
        names = set()
        for node in _scope(within):
            if isinstance(node, ast.Call):
                if isinstance(node.func, ast.Name):
                    names.add(node.func.id)
                elif isinstance(node.func, ast.Attribute):
                    names.add(node.func.attr)
        return names

    def requires_call(name: str, msg: str | None = None, within: str | None = None) -> None:
        """Fail unless the learner calls a function or method called `name`."""
        if name not in _called_names(within):
            raise CheckFailed(msg or f"your code should call {name}()")

    def forbids_call(name: str, msg: str | None = None, within: str | None = None) -> None:
        """Fail if the learner calls a function or method called `name`."""
        if name in _called_names(within):
            raise CheckFailed(msg or f"try solving this without calling {name}()")

    def _imported() -> set[str]:
        mods = set()
        for node in nodes:
            if isinstance(node, ast.Import):
                mods.update(alias.name for alias in node.names)
            elif isinstance(node, ast.ImportFrom) and node.module:
                mods.add(node.module)
        return mods

    def requires_import(module: str, msg: str | None = None) -> None:
        if module not in _imported():
            raise CheckFailed(msg or f"your code should import {module}")

    def forbids_import(module: str, msg: str | None = None) -> None:
        if module in _imported():
            raise CheckFailed(msg or f"try solving this without importing {module}")

    api = {
        "test": test,
        "eq": eq,
        "approx": approx,
        "check": check,
        "raises": raises,
        "output_of": output_of,
        "requires_syntax": requires_syntax,
        "forbids_syntax": forbids_syntax,
        "requires_call": requires_call,
        "forbids_call": forbids_call,
        "requires_import": requires_import,
        "forbids_import": forbids_import,
        "CheckFailed": CheckFailed,
        "ast": ast,
        "source": source,
        "tree": tree,
        "stdout": stdout,
    }
    return api, registered


def _failure_message(exc: BaseException) -> tuple[str, str | None]:
    """Return (message, traceback-or-None) for a failed test."""
    if isinstance(exc, CheckFailed):
        return str(exc), None
    if isinstance(exc, AssertionError):
        if str(exc):
            return str(exc), None
        where = _innermost_line(exc, (TESTS_FILE, USER_FILE))
        if where:
            code = linecache.getline(where[0], where[1]).strip()
            return f"assertion failed: {code}", None
        return "assertion failed", None
    tb = exc.__traceback__
    while tb is not None and tb.tb_frame.f_code.co_filename in (_HARNESS_FILE, TESTS_FILE):
        tb = tb.tb_next
    text = "".join(traceback.format_exception(type(exc), exc, tb))
    return f"{type(exc).__name__}: {exc}", text


_test_reporter = None

# In the validator a KeyboardInterrupt means "the watchdog timed this run
# out", so it aborts everything. The browser has no interrupt buffer, so there
# a KeyboardInterrupt can only come from the learner's own code (simulating
# Ctrl+C in a CLI exercise, say) and is reported like any other exception.
_interrupt_aborts = True


def set_interrupt_aborts(aborts: bool) -> None:
    global _interrupt_aborts
    _interrupt_aborts = bool(aborts)


def set_test_reporter(reporter) -> None:
    """Install a callable that receives a JSON event per test (start/done).

    The browser worker streams these to the page, so a run that times out
    part-way still shows which tests finished and which one hung.
    """
    global _test_reporter
    _test_reporter = reporter if callable(reporter) else None  # JS null arrives as jsnull


def _report(event: str, **payload) -> None:
    if _test_reporter is None:
        return
    try:
        _test_reporter(json.dumps({"event": event, **payload}))
    except Exception:  # noqa: BLE001 - reporting must never break a run
        pass


async def _run_tests(tests_source: str, user_ns: dict, source: str, tree, stdout: str):
    _register_source(TESTS_FILE, tests_source)
    api, registered = _build_test_api(source, tree, stdout)
    test_ns = dict(user_ns)
    test_ns.update(api)
    test_ns["__name__"] = "__tests__"
    code = compile(tests_source, TESTS_FILE, "exec", flags=_FLAGS, dont_inherit=True)
    await _evaluate(code, test_ns)

    results = []
    for name, fn in registered:
        _report("start", name=name)
        buffer = io.StringIO()
        started = time.perf_counter()
        entry = {"name": name, "passed": False, "message": None, "traceback": None}
        try:
            with contextlib.redirect_stdout(buffer):
                outcome = fn()
                if inspect.isawaitable(outcome):
                    await outcome
            entry["passed"] = True
        except KeyboardInterrupt as exc:
            if _interrupt_aborts:
                raise
            entry["message"], entry["traceback"] = _failure_message(exc)
        except BaseException as exc:  # noqa: BLE001 - every failure is reported
            entry["message"], entry["traceback"] = _failure_message(exc)
        entry["output"] = buffer.getvalue()
        entry["durationMs"] = round((time.perf_counter() - started) * 1000, 2)
        results.append(entry)
        _report("done", result=entry)
    return results


# --------------------------------------------------------------------------
# Entry points
# --------------------------------------------------------------------------


async def run(source: str, tests: str | None = None, show_last: bool = True) -> dict:
    # JS `null` arrives as pyodide.ffi.jsnull rather than None, so anything
    # that isn't a string means "no tests".
    if not isinstance(tests, str):
        tests = None
    show_last = bool(show_last)
    started = time.perf_counter()
    result: dict = {
        "ok": True,
        "error": None,
        "value": None,
        "exitCode": None,
        "tests": None,
        "testsError": None,
    }
    _register_source(USER_FILE, source)
    namespace = _fresh_main()
    capture = io.StringIO()
    tree = None

    try:
        # Parse once: re-parsing would print parser SyntaxWarnings twice. The
        # pristine tree is kept for the tests' AST checks.
        tree = _parse(source, USER_FILE)
        body, last = _compile_user(copy.deepcopy(tree), show_last and tests is None)
        with contextlib.redirect_stdout(_Tee(sys.stdout, capture)):
            await _evaluate(body, namespace)
            if last is not None:
                value = await _evaluate(last, namespace)
                if value is not None:
                    result["value"] = _short(value, 5000)
    except SystemExit as exc:
        result["exitCode"] = exc.code if isinstance(exc.code, int) else (0 if exc.code is None else 1)
        if exc.code not in (None, 0):
            print(exc.code if not isinstance(exc.code, int) else f"exit code {exc.code}", file=sys.stderr)
    except KeyboardInterrupt as exc:
        result["ok"] = False
        result["error"] = (
            {
                "type": "KeyboardInterrupt",
                "message": "execution interrupted",
                "traceback": "KeyboardInterrupt: execution interrupted\n",
                "line": None,
            }
            if _interrupt_aborts
            else _format_error(exc)
        )
    except BaseException as exc:  # noqa: BLE001 - report everything to the learner
        result["ok"] = False
        result["error"] = _format_error(_unwrap(exc))
    finally:
        sys.stdout.flush()
        sys.stderr.flush()

    if tests is not None and result["ok"]:
        try:
            result["tests"] = await _run_tests(tests, namespace, source, tree, capture.getvalue())
        except KeyboardInterrupt:
            result["ok"] = False
            result["error"] = {
                "type": "KeyboardInterrupt",
                "message": "execution interrupted",
                "traceback": "KeyboardInterrupt: execution interrupted\n",
                "line": None,
            }
        except BaseException as exc:  # noqa: BLE001
            result["testsError"] = _format_error(_unwrap(exc))

    result["durationMs"] = round((time.perf_counter() - started) * 1000, 2)
    return result


async def run_json(source: str, tests: str | None = None, show_last: bool = True) -> str:
    return json.dumps(await run(source, tests, show_last))


def missing_imports_json(source: str) -> str:
    """Top-level modules `source` imports that aren't importable yet.

    Lets the worker skip Pyodide's own import scan (which re-parses the code
    and would print compile-time SyntaxWarnings a second time) for the usual
    stdlib-only snippets. `zoneinfo` needs the separate `tzdata` package.
    """
    import importlib.util
    import warnings

    try:
        with warnings.catch_warnings():
            warnings.simplefilter("ignore")
            tree = ast.parse(source)
    except SyntaxError:
        return "[]"
    names = set()
    for node in ast.walk(tree):
        if isinstance(node, ast.Import):
            names.update(alias.name.split(".")[0] for alias in node.names)
        elif isinstance(node, ast.ImportFrom) and node.module and not node.level:
            names.add(node.module.split(".")[0])
    if "zoneinfo" in names:
        names.add("tzdata")
    missing = set()
    for name in names:
        if name in sys.stdlib_module_names:
            continue
        try:
            if importlib.util.find_spec(name) is None:
                missing.add(name)
        except (ImportError, ValueError):
            missing.add(name)
    return json.dumps(sorted(missing))


def check_syntax_json(source: str) -> str:
    """Parse-only check used by the content validator for static snippets."""
    try:
        _parse(source, USER_FILE)
        return "null"
    except SyntaxError as exc:
        return json.dumps(
            {"type": type(exc).__name__, "message": exc.msg, "line": exc.lineno}
        )


try:
    sys.stdout.reconfigure(line_buffering=True)
    sys.stderr.reconfigure(line_buffering=True)
except (AttributeError, ValueError):
    pass
