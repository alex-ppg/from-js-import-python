// The Python harness (src/python/runtime.py) on the real Pyodide build the
// site uses: REPL-style values, fresh namespaces, top-level await, error
// formatting and the challenge test API.

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { before, describe, test } from 'node:test';
import { loadPyodide } from 'pyodide';

interface Harness {
  run_json(code: string, tests: string | null, showLast: boolean): Promise<string>;
  check_syntax_json(code: string): string;
  missing_imports_json(code: string): string;
}

interface Result {
  ok: boolean;
  error: { type: string; message: string; traceback: string; line: number | null } | null;
  value: string | null;
  exitCode: number | null;
  tests: Array<{ name: string; passed: boolean; message: string | null; output: string }> | null;
  testsError: { type: string; message: string } | null;
}

let harness: Harness;
let stdout = '';

before(async () => {
  const pyodide = await loadPyodide();
  const decoder = new TextDecoder();
  pyodide.setStdout({ write: (buf: Uint8Array) => ((stdout += decoder.decode(buf)), buf.length) });
  pyodide.setStderr({ write: (buf: Uint8Array) => buf.length });
  pyodide.FS.mkdirTree('/fjip');
  pyodide.FS.writeFile('/fjip/fjip_runtime.py', readFileSync(resolve(import.meta.dirname, '../src/python/runtime.py'), 'utf8'));
  pyodide.runPython("import sys; sys.path.insert(0, '/fjip')");
  harness = pyodide.pyimport('fjip_runtime') as Harness;
});

async function run(code: string, tests: string | null = null): Promise<Result & { stdout: string }> {
  stdout = '';
  const result = JSON.parse(await harness.run_json(code, tests, true)) as Result;
  return { ...result, stdout };
}

describe('running code', () => {
  test('reports the trailing expression like a REPL', async () => {
    const r = await run('xs = [3, 1, 2]\nsorted(xs)');
    assert.equal(r.ok, true);
    assert.equal(r.value, '[1, 2, 3]');
  });

  test('a trailing None (e.g. print) shows no value', async () => {
    const r = await run('print("hi")');
    assert.equal(r.value, null);
    assert.equal(r.stdout, 'hi\n');
  });

  test('every run gets a fresh __main__', async () => {
    await run('leaked = 1');
    const r = await run('leaked');
    assert.equal(r.error?.type, 'NameError');
    assert.equal((await run('__name__')).value, "'__main__'");
  });

  test('top-level await and asyncio.run() both work', async () => {
    const code = 'import asyncio\nasync def f():\n    await asyncio.sleep(0)\n    return 7\n';
    assert.equal((await run(`${code}await f()`)).value, '7');
    assert.equal((await run(`${code}print(asyncio.run(f()))`)).stdout, '7\n');
  });

  test('sys.exit is a clean exit with a code', async () => {
    const r = await run('import sys\nprint("bye")\nsys.exit(3)');
    assert.equal(r.ok, true);
    assert.equal(r.exitCode, 3);
  });

  test('input() explains itself instead of hanging', async () => {
    const r = await run('input("name? ")');
    assert.equal(r.error?.type, 'OSError');
    assert.match(r.error!.message, /browser sandbox/);
  });
});

describe('errors', () => {
  test('tracebacks are trimmed to the learner’s code and point at the line', async () => {
    const r = await run('def f(d):\n    return d["missing"]\n\nf({})');
    assert.equal(r.error?.type, 'KeyError');
    assert.equal(r.error?.line, 2);
    assert.match(r.error!.traceback, /File "main.py", line 2, in f/);
    assert.doesNotMatch(r.error!.traceback, /fjip_runtime/);
  });

  test('syntax errors carry their line', async () => {
    const r = await run('x = 1\ny = (\n');
    assert.equal(r.error?.type, 'SyntaxError');
    assert.equal(r.error?.line, 2);
  });

  test('StopIteration is reported as itself, not as a coroutine RuntimeError', async () => {
    const r = await run('it = iter([])\nnext(it)');
    assert.equal(r.error?.type, 'StopIteration');
    assert.equal(r.error?.line, 2);
  });
});

describe('the challenge test API', () => {
  const solution = 'def double(xs):\n    return [x * 2 for x in xs]\nprint("loaded")\n';

  test('eq reports expected vs actual', async () => {
    const r = await run(solution, '@test("doubles")\ndef _():\n    eq(double([1]), [2])\n\n@test("wrong on purpose")\ndef _():\n    eq(double([1]), [3])\n');
    assert.deepEqual(r.tests!.map((t) => t.passed), [true, false]);
    assert.equal(r.tests![1]!.message, 'expected [3], got [2]');
  });

  test('syntax and call checks inspect the learner’s source', async () => {
    const tests = [
      '@test\ndef uses_comprehension():\n    requires_syntax(ast.ListComp, "comprehension please")',
      '@test\ndef no_loops():\n    forbids_syntax(ast.For, "no for loops")',
      '@test\ndef no_len():\n    forbids_call("len")',
      '@test\ndef must_sort():\n    requires_call("sorted", "sort it")',
    ].join('\n\n');
    const r = await run(solution, tests);
    assert.deepEqual(r.tests!.map((t) => [t.name, t.passed]), [['uses_comprehension', true], ['no_loops', true], ['no_len', true], ['must_sort', false]]);
    assert.equal(r.tests![3]!.message, 'sort it');
  });

  test('raises, output_of and stdout', async () => {
    const code = 'def boom():\n    raise ValueError("no")\ndef greet():\n    print("hey")\nprint("module output")\n';
    const tests = [
      '@test\ndef raises_value_error():\n    raises(ValueError, boom)',
      '@test\ndef context_manager_form():\n    with raises(KeyError):\n        {}["x"]',
      '@test\ndef captures_output():\n    eq(output_of(greet), "hey\\n")',
      '@test\ndef sees_module_stdout():\n    eq(stdout, "module output\\n")',
      '@test\ndef misuse_is_caught():\n    raises(ValueError, greet())',
    ].join('\n\n');
    const r = await run(code, tests);
    assert.deepEqual(r.tests!.map((t) => t.passed), [true, true, true, true, false]);
    assert.match(r.tests![4]!.message!, /but the call returned None/);
  });

  test('bare asserts show the failing line; exceptions show their type', async () => {
    const r = await run('x = 1', '@test\ndef a():\n    assert x == 2\n\n@test\ndef b():\n    {}["k"]');
    assert.equal(r.tests![0]!.message, 'assertion failed: assert x == 2');
    assert.equal(r.tests![1]!.message, "KeyError: 'k'");
  });

  test('async tests are awaited', async () => {
    const r = await run('import asyncio\nasync def f():\n    await asyncio.sleep(0)\n    return 1', '@test\nasync def awaits():\n    eq(await f(), 1)');
    assert.equal(r.tests![0]!.passed, true);
  });

  test('tests are skipped when the learner’s code fails, and broken tests are reported', async () => {
    const failed = await run('raise RuntimeError("nope")', '@test\ndef t():\n    pass');
    assert.equal(failed.ok, false);
    assert.equal(failed.tests, null);
    // (Careful: "this is not python" is valid Python, an `is not` comparison.)
    const broken = await run('x = 1', 'def (:\n');
    assert.equal(broken.testsError?.type, 'SyntaxError');
  });

  test('printing inside tests is captured per test, not streamed', async () => {
    const r = await run('', '@test\ndef chatty():\n    print("inside")');
    assert.equal(r.tests![0]!.output, 'inside\n');
    assert.equal(r.stdout, '');
  });
});

describe('helpers for the worker and validator', () => {
  test('check_syntax_json', () => {
    assert.equal(harness.check_syntax_json('x = 1'), 'null');
    const error = JSON.parse(harness.check_syntax_json('def f(:\n    pass')) as { type: string; line: number };
    assert.equal(error.type, 'SyntaxError');
    assert.equal(error.line, 1);
  });

  test('missing_imports_json skips the stdlib and maps zoneinfo to tzdata', () => {
    const missing = JSON.parse(harness.missing_imports_json('import json, numpy as np\nfrom zoneinfo import ZoneInfo\nfrom . import local')) as string[];
    assert.deepEqual(missing, ['numpy', 'tzdata']);
  });
});
