// Content validator: parses every lesson and executes its Python with the
// exact Pyodide build + harness the browser uses.
//
//   npm run validate                        # everything
//   npm run validate -- 07-lists dicts      # lessons whose path contains "07-lists" or "dicts"
//   npm run validate -- algorithms          # a whole course (paths include the course id)
//   npm run validate -- --no-run            # structure/link checks only (fast)
//
// Checks: course.json files, frontmatter (the part must belong to the
// lesson's course), unique slugs/challenge ids across all courses, `lesson:`
// links, every `python run` playground runs (or raises, if flagged `raises`),
// every other python fence parses (unless flagged `nocheck`), `:::quiz
// output` answers match real stdout, challenge solutions pass their tests and
// starters don't.

import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { Worker } from 'node:worker_threads';
import { loadPyodide } from 'pyodide';
import { COURSES_DIR, listCourses, type CourseOnDisk } from '../plugins/content/courses.ts';
import { ContentError, parseLesson, parseReference, scanLessonLinks, type Fence, type ParsedLesson } from '../plugins/content/parse.ts';

const ROOT = resolve(import.meta.dirname, '..');
const REFERENCE_FILE = resolve(ROOT, 'content/reference.md');
const TIMEOUT_MS = 10_000;

const args = process.argv.slice(2);
const noRun = args.includes('--no-run');
const filters = args.filter((a) => !a.startsWith('--'));

const color = process.stdout.isTTY && !process.env.NO_COLOR;
const paint = (code: number) => (s: string) => (color ? `\x1b[${code}m${s}\x1b[0m` : s);
const red = paint(31);
const green = paint(32);
const yellow = paint(33);
const dim = paint(2);
const bold = paint(1);

interface Issue {
  file: string;
  line: number;
  message: string;
  level: 'error' | 'warning';
}
const issues: Issue[] = [];
const error = (file: string, line: number, message: string) => issues.push({ file, line, message, level: 'error' });
const warn = (file: string, line: number, message: string) => issues.push({ file, line, message, level: 'warning' });

// --------------------------------------------------------------------------
// Parse everything (always; link checks need the full set)
// --------------------------------------------------------------------------

let courses: CourseOnDisk[] = [];
try {
  courses = listCourses(ROOT);
} catch (e) {
  if (!(e instanceof ContentError)) throw e;
  console.error(red(e.message));
  process.exit(1);
}

const lessonPaths = courses.flatMap((course) => course.lessonFiles.map((name) => `${COURSES_DIR}/${course.id}/${name}`));
const courseOf = new Map<string, CourseOnDisk>(
  courses.flatMap((course) => course.lessonFiles.map((name) => [`${COURSES_DIR}/${course.id}/${name}`, course] as const)),
);
// Invisible or combining characters are almost always accidents (a tool
// turning "﻿" into a real BOM, say) and are invisible on review. In code,
// write them as escapes.
const SUSPICIOUS = /[﻿​-‍⁠ ̀-ͯ]/g;
const EMOJI_BEFORE = /\p{Extended_Pictographic}\p{Emoji_Modifier}?$/u;
const EMOJI_AFTER = /^\p{Extended_Pictographic}/u;
function checkCharacters(file: string, source: string): void {
  source.split(/\r?\n/).forEach((text, i) => {
    for (const m of text.matchAll(SUSPICIOUS)) {
      const at = m.index!;
      // A zero-width joiner between two emoji is part of one emoji (👨‍👩‍👧).
      if (m[0] === '‍' && EMOJI_BEFORE.test(text.slice(0, at)) && EMOJI_AFTER.test(text.slice(at + 1))) continue;
      const code = m[0].codePointAt(0)!.toString(16).toUpperCase().padStart(4, '0');
      warn(file, i + 1, `invisible or combining character U+${code} at column ${m.index! + 1}; write it as an escape (e.g. "\\u${code}") if it's intended`);
    }
  });
}

const parsed: ParsedLesson[] = [];
for (const path of lessonPaths) {
  try {
    const source = readFileSync(resolve(ROOT, path), 'utf8');
    checkCharacters(path, source);
    parsed.push(parseLesson(source, path));
  } catch (e) {
    if (e instanceof ContentError) error(e.file, e.line, e.message.replace(`${e.file}:${e.line}: `, ''));
    else throw e;
  }
}

// Filters select by path (course id or file name), so a selected lesson that
// failed to parse still gets its errors reported.
const isSelected = new Set(lessonPaths.filter((p) => !filters.length || filters.some((f) => p.includes(f))));
const selected = parsed.filter((l) => isSelected.has(l.file));

const bySlug = new Map<string, ParsedLesson>();
const challengeOwner = new Map<string, { file: string; line: number }>();
for (const lesson of parsed) {
  if (bySlug.has(lesson.slug)) error(lesson.file, 1, `duplicate slug "${lesson.slug}"`);
  bySlug.set(lesson.slug, lesson);
  for (const c of lesson.challenges) {
    const owner = challengeOwner.get(c.id);
    if (owner) {
      // Report on both files so validating either one surfaces the clash.
      error(lesson.file, c.line, `challenge id "${c.id}" is also used in ${owner.file}`);
      error(owner.file, owner.line, `challenge id "${c.id}" is also used in ${lesson.file}`);
    }
    challengeOwner.set(c.id, { file: lesson.file, line: c.line });
  }
}

for (const lesson of selected) {
  const fm = lesson.frontmatter;
  const parts = courseOf.get(lesson.file)?.parts ?? [];
  if (!fm.title) error(lesson.file, 1, 'frontmatter: missing title');
  if (!fm.summary) error(lesson.file, 1, 'frontmatter: missing summary');
  if (!fm.part || !parts.includes(fm.part)) {
    error(lesson.file, 1, `frontmatter: part must be one of this course's parts: ${parts.map((p) => `"${p}"`).join(', ')}`);
  }
  if (fm.minutes && !/^\d+$/.test(fm.minutes)) error(lesson.file, 1, 'frontmatter: minutes must be a whole number');
  if (!lesson.challenges.length) warn(lesson.file, 1, 'lesson has no challenges');
  for (const link of lesson.links) {
    const target = bySlug.get(link.slug);
    if (!target) {
      // Lessons may be written in parallel; a missing target is only a warning.
      warn(lesson.file, link.line, `link to unknown lesson "lesson:${link.slug}"`);
      continue;
    }
    if (link.anchor) {
      const anchors = new Set([...target.headings.map((h) => h.id), ...target.challenges.map((c) => c.id)]);
      if (!anchors.has(link.anchor)) {
        error(lesson.file, link.line, `"lesson:${link.slug}#${link.anchor}": no heading or challenge with that id in ${target.file}`);
      }
    }
  }
}

let referenceFences: Fence[] = [];
const wantsReference = !filters.length || filters.some((f) => 'reference'.includes(f));
if (wantsReference && existsSync(REFERENCE_FILE)) {
  try {
    const source = readFileSync(REFERENCE_FILE, 'utf8');
    checkCharacters('content/reference.md', source);
    for (const link of scanLessonLinks(source.replace(/\r\n?/g, '\n'), 1)) {
      const target = bySlug.get(link.slug);
      if (!target) warn('content/reference.md', link.line, `link to unknown lesson "lesson:${link.slug}"`);
      else if (link.anchor && !target.headings.some((h) => h.id === link.anchor) && !target.challenges.some((c) => c.id === link.anchor)) {
        error('content/reference.md', link.line, `"lesson:${link.slug}#${link.anchor}": no heading or challenge with that id`);
      }
    }
    const entries = parseReference(source, 'content/reference.md');
    referenceFences = entries.flatMap((e) => e.fences.filter((f) => f.lang === 'python'));
    const seen = new Set<string>();
    for (const e of entries) {
      const key = `${e.category}/${e.title}`;
      if (seen.has(key)) warn('content/reference.md', e.line, `duplicate reference entry "${key}"`);
      seen.add(key);
      if (e.fences.length < 2) error('content/reference.md', e.line, `entry "${e.title}" needs a JS fence followed by Python fence(s)`);
    }
  } catch (e) {
    if (e instanceof ContentError) error(e.file, e.line, e.message.replace(`${e.file}:${e.line}: `, ''));
    else throw e;
  }
}

// --------------------------------------------------------------------------
// Execute
// --------------------------------------------------------------------------

interface PyError {
  type: string;
  message: string;
  traceback: string;
  line: number | null;
}
interface TestResult {
  name: string;
  passed: boolean;
  message: string | null;
}
interface RunResult {
  ok: boolean;
  error: PyError | null;
  value: string | null;
  tests: TestResult[] | null;
  testsError: PyError | null;
}

interface Harness {
  run_json(code: string, tests: string | null, showLast: boolean): Promise<string>;
  check_syntax_json(code: string): string;
}

const stats = { snippets: 0, runs: 0, quizzes: 0, challenges: 0 };

async function main() {
  if (noRun) return;
  const started = Date.now();
  let stdout = '';
  let stderr = '';
  const decoder = new TextDecoder();

  // Infinite-loop guard: a watchdog thread raises KeyboardInterrupt inside
  // Python via Pyodide's interrupt buffer, even while this thread is busy.
  const interrupt = new Uint8Array(new SharedArrayBuffer(1));
  const watchdog = new Worker(
    `const { parentPort, workerData } = require('node:worker_threads');
     const flag = new Uint8Array(workerData);
     let timer;
     parentPort.on('message', (ms) => { clearTimeout(timer); if (ms > 0) timer = setTimeout(() => { flag[0] = 2; }, ms); });`,
    { eval: true, workerData: interrupt.buffer },
  );
  watchdog.unref();

  const runtimeSource = readFileSync(resolve(ROOT, 'src/python/runtime.py'), 'utf8');
  // Fresh interpreter + harness. Called again if a snippet crashes Pyodide
  // itself (e.g. a wasm stack overflow from deep recursion through C code).
  const boot = async () => {
    const pyodide = await loadPyodide();
    pyodide.setStdout({ write: (buf: Uint8Array) => ((stdout += decoder.decode(buf)), buf.length) });
    pyodide.setStderr({ write: (buf: Uint8Array) => ((stderr += decoder.decode(buf)), buf.length) });
    pyodide.setStdin({ error: true }); // as in the browser worker
    pyodide.setInterruptBuffer(interrupt);
    pyodide.FS.mkdirTree('/fjip');
    pyodide.FS.writeFile('/fjip/fjip_runtime.py', runtimeSource);
    pyodide.runPython("import sys; sys.path.insert(0, '/fjip')");
    return { pyodide, harness: pyodide.pyimport('fjip_runtime') as Harness };
  };
  let { pyodide, harness } = await boot();
  const version = pyodide.runPython('import sys; sys.version.split()[0]') as string;
  console.log(dim(`Pyodide ${pyodide.version} · Python ${version} · loaded in ${Date.now() - started} ms\n`));

  // A fatal Pyodide error surfaces as an uncaught exception from an event-loop
  // callback rather than as a rejection of the running call, so route it to
  // whichever execution is in flight.
  let onCrash: ((error: unknown) => void) | null = null;
  const onUncaught = (error: unknown) => {
    if (error && typeof error === 'object' && 'pyodide_fatal_error' in error && onCrash) {
      onCrash(error);
      return;
    }
    console.error(error);
    process.exit(1);
  };
  process.on('uncaughtException', onUncaught);
  process.on('unhandledRejection', onUncaught);

  const crashed = (error: unknown) => {
    const message = `crashed the Python runtime (${error instanceof Error ? error.message : String(error)}); deep recursion through C code?`;
    const result: RunResult = { ok: false, error: { type: 'Crash', message, traceback: message, line: null }, value: null, tests: null, testsError: null };
    return { result, stdout, stderr };
  };

  const execute = async (code: string, tests: string | null = null) => {
    try {
      return await executeOnce(code, tests);
    } catch (error) {
      ({ pyodide, harness } = await boot());
      return crashed(error);
    }
  };

  const executeOnce = async (code: string, tests: string | null) => {
    stdout = '';
    stderr = '';
    interrupt[0] = 0;
    watchdog.postMessage(TIMEOUT_MS);
    // The interrupt only fires while Python bytecode runs; an `await` that
    // never completes leaves Python idle, so race it against a plain timer.
    let timer: ReturnType<typeof setTimeout> | undefined;
    const hung = new Promise<null>((resolve) => (timer = setTimeout(() => resolve(null), TIMEOUT_MS + 2000)));
    const crash = new Promise<never>((_, reject) => (onCrash = reject));
    try {
      const json = await Promise.race([harness.run_json(code, tests, true), hung, crash]);
      if (json === null) {
        const message = `didn't finish within ${TIMEOUT_MS / 1000}s (an await that never completes?)`;
        const result: RunResult = { ok: false, error: { type: 'Timeout', message, traceback: message, line: null }, value: null, tests: null, testsError: null };
        return { result, stdout, stderr };
      }
      const result = JSON.parse(json) as RunResult;
      if (result.error?.type === 'KeyboardInterrupt') {
        result.error.message = `timed out after ${TIMEOUT_MS / 1000}s (infinite loop?)`;
      }
      return { result, stdout, stderr };
    } finally {
      onCrash = null;
      clearTimeout(timer);
      watchdog.postMessage(0);
    }
  };

  const syntaxError = (code: string) =>
    JSON.parse(harness.check_syntax_json(code)) as { type: string; message: string; line: number } | null;

  const describe = (e: PyError) => `${e.type}: ${e.message}${e.line ? ` (snippet line ${e.line})` : ''}`;

  for (const lesson of selected) {
    for (const fence of lesson.pythonFences) {
      stats.snippets++;
      if (fence.flags.includes('run')) {
        stats.runs++;
        const { result } = await execute(fence.code);
        const raises = fence.flags.includes('raises');
        if (raises && result.ok) error(lesson.file, fence.line, 'playground is flagged `raises` but ran without an exception');
        if (!raises && !result.ok && result.error) error(lesson.file, fence.line, `playground raised ${describe(result.error)}`);
      } else if (!fence.flags.includes('nocheck')) {
        const err = syntaxError(fence.code);
        if (err) error(lesson.file, fence.line + err.line, `${err.type}: ${err.message} (add \`nocheck\` if intentional)`);
      }
    }

    for (const quiz of lesson.quizzes) {
      stats.quizzes++;
      if (!quiz.code) continue;
      if (!quiz.output) {
        if (!quiz.code.flags.includes('nocheck')) {
          const err = syntaxError(quiz.code.code);
          if (err) error(lesson.file, quiz.code.line + err.line, `quiz code: ${err.type}: ${err.message}`);
        }
        continue;
      }
      const { result, stdout: out } = await execute(quiz.code.code);
      const answer = quiz.options.find((o) => o.correct)!.text;
      const expected = /^`[^`]*`$/.test(answer) ? answer.slice(1, -1) : answer;
      if (result.ok) {
        if (out.trim() !== expected.trim()) {
          error(lesson.file, quiz.line, `quiz answer ${JSON.stringify(expected)} doesn't match actual output ${JSON.stringify(out.trim())}`);
        }
      } else if (!result.error || !expected.trim().startsWith(result.error.type)) {
        error(lesson.file, quiz.line, `quiz code raised ${result.error ? describe(result.error) : 'an error'}, but the answer is ${JSON.stringify(expected)}`);
      }
    }

    for (const c of lesson.challenges) {
      stats.challenges++;
      const where = `challenge "${c.id}"`;
      const solved = await execute(c.solution.code, c.tests.code);
      if (!solved.result.ok && solved.result.error) {
        error(lesson.file, c.solution.line, `${where}: solution raised ${describe(solved.result.error)}`);
      } else if (solved.result.testsError) {
        error(lesson.file, c.tests.line, `${where}: tests failed to load: ${describe(solved.result.testsError)}`);
      } else if (!solved.result.tests?.length) {
        error(lesson.file, c.tests.line, `${where}: no tests registered (use @test("..."))`);
      } else {
        for (const t of solved.result.tests.filter((t) => !t.passed)) {
          error(lesson.file, c.solution.line, `${where}: solution fails test "${t.name}": ${t.message}`);
        }
      }

      const starterSyntax = syntaxError(c.starter.code);
      if (starterSyntax) {
        error(lesson.file, c.starter.line + starterSyntax.line, `${where}: starter has a ${starterSyntax.type}: ${starterSyntax.message}`);
        continue;
      }
      const starter = await execute(c.starter.code, c.tests.code);
      if (starter.result.ok && starter.result.tests?.length && starter.result.tests.every((t) => t.passed)) {
        warn(lesson.file, c.starter.line, `${where}: the starter code already passes every test`);
      }
    }
  }

  for (const fence of referenceFences) {
    if (fence.flags.includes('nocheck')) continue;
    stats.snippets++;
    const err = syntaxError(fence.code);
    if (err) error('content/reference.md', fence.line + err.line, `${err.type}: ${err.message} (add \`nocheck\` if intentional)`);
  }

  await watchdog.terminate();
}

await main();

// --------------------------------------------------------------------------
// Report
// --------------------------------------------------------------------------

// With filters, only report on the selected files (other lessons may be mid-edit).
const reported = issues.filter(
  (i) => !filters.length || isSelected.has(i.file) || (wantsReference && i.file === 'content/reference.md'),
);
const byFile = new Map<string, Issue[]>();
for (const issue of reported) byFile.set(issue.file, [...(byFile.get(issue.file) ?? []), issue]);

for (const lesson of selected) {
  const own = byFile.get(lesson.file) ?? [];
  const errors = own.filter((i) => i.level === 'error').length;
  const mark = errors ? red('✗') : own.length ? yellow('!') : green('✓');
  const counts = dim(`${lesson.challenges.length} challenges · ${lesson.quizzes.length} quizzes · ${lesson.pythonFences.length} python snippets`);
  console.log(`${mark} ${bold(lesson.file)}  ${counts}`);
}
for (const [file, list] of byFile) {
  console.log(`\n${bold(file)}`);
  for (const i of list.sort((a, b) => a.line - b.line)) {
    const tag = i.level === 'error' ? red('error') : yellow('warn ');
    console.log(`  ${tag} ${dim(`line ${String(i.line).padStart(4)}`)}  ${i.message}`);
  }
}

const errorCount = reported.filter((i) => i.level === 'error').length;
const warningCount = reported.length - errorCount;
const summary = noRun
  ? `${selected.length} lessons parsed`
  : `${selected.length} lessons · ${stats.snippets} snippets (${stats.runs} executed) · ${stats.quizzes} quizzes · ${stats.challenges} challenges`;
console.log(`\n${summary} — ${errorCount ? red(`${errorCount} errors`) : green('0 errors')}, ${warningCount ? yellow(`${warningCount} warnings`) : '0 warnings'}`);
process.exit(errorCount ? 1 : 0);
