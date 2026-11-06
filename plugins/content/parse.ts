// Structural parsing of lesson/reference Markdown. Pure string processing with
// no dependencies, so scripts/validate.ts can share it with the Vite plugin.
//
// On top of CommonMark (rendered later by markdown-it) lessons use:
//   * `:::name args` ... `:::` containers (no nesting), and
//   * fence info strings with flags/attributes: ```python run title="x.py"
// See AUTHORING.md for the full format.

import type { Difficulty } from './types.ts';

export class ContentError extends Error {
  readonly file: string;
  readonly line: number;

  constructor(message: string, file: string, line: number) {
    super(`${file}:${line}: ${message}`);
    this.name = 'ContentError';
    this.file = file;
    this.line = line;
  }
}

// --------------------------------------------------------------------------
// Fences and info strings
// --------------------------------------------------------------------------

export interface FenceInfo {
  lang: string;
  flags: string[];
  attrs: Record<string, string>;
}

export interface Fence extends FenceInfo {
  code: string;
  /** The raw info string, e.g. `python run title="x.py"`. */
  info: string;
  /** 1-based line of the opening fence in the source file. */
  line: number;
}

/** Turn a fence back into Markdown source. */
export function fenceToMarkdown(fence: Fence): string {
  const longest = Math.max(2, ...[...fence.code.matchAll(/`+/g)].map((m) => m[0].length));
  const marker = '`'.repeat(longest + 1);
  return `${marker}${fence.info}\n${fence.code}\n${marker}`;
}

const LANG_ALIASES: Record<string, string> = {
  py: 'python',
  python3: 'python',
  javascript: 'js',
  mjs: 'js',
  jsx: 'js',
  typescript: 'ts',
  tsx: 'ts',
  sh: 'bash',
  shell: 'bash',
  console: 'bash',
  terminal: 'bash',
  zsh: 'bash',
  powershell: 'bash',
  txt: 'text',
  plaintext: 'text',
  '': 'text',
};

export function normalizeLang(lang: string): string {
  const lower = lang.toLowerCase();
  return LANG_ALIASES[lower] ?? lower;
}

const TOKEN = /([A-Za-z_][\w-]*)=(?:"([^"]*)"|'([^']*)'|(\S+))|"([^"]*)"|(\S+)/g;

/** Parse `key=value key="quoted value" bareflag` into attrs + flags. */
export function parseAttrs(input: string): { flags: string[]; attrs: Record<string, string> } {
  const flags: string[] = [];
  const attrs: Record<string, string> = {};
  for (const m of input.matchAll(TOKEN)) {
    if (m[1] !== undefined) attrs[m[1]] = m[2] ?? m[3] ?? m[4] ?? '';
    else flags.push(m[5] ?? m[6] ?? '');
  }
  return { flags, attrs };
}

export function parseInfo(info: string): FenceInfo {
  const trimmed = info.trim();
  const space = trimmed.search(/\s/);
  const rawLang = space === -1 ? trimmed : trimmed.slice(0, space);
  const rest = space === -1 ? '' : trimmed.slice(space + 1);
  return { lang: normalizeLang(rawLang), ...parseAttrs(rest) };
}

const FENCE_OPEN = /^( {0,3})(`{3,}|~{3,})(.*)$/;

interface OpenFence {
  char: string;
  length: number;
}

function openFence(line: string): (OpenFence & { info: string }) | null {
  const m = FENCE_OPEN.exec(line);
  if (!m) return null;
  const marker = m[2]!;
  const info = m[3] ?? '';
  if (marker[0] === '`' && info.includes('`')) return null;
  return { char: marker[0]!, length: marker.length, info };
}

function closesFence(line: string, fence: OpenFence): boolean {
  const m = /^ {0,3}(`{3,}|~{3,})\s*$/.exec(line);
  return !!m && m[1]![0] === fence.char && m[1]!.length >= fence.length;
}

export type BodyPart = { kind: 'text'; text: string; line: number } | { kind: 'fence'; fence: Fence };

/**
 * Split a Markdown chunk into prose and fenced code blocks, preserving order.
 * `firstLine` is the 1-based file line of the chunk's first line.
 */
export function splitFences(text: string, firstLine: number, file: string): BodyPart[] {
  const lines = text.split('\n');
  const parts: BodyPart[] = [];
  let prose: string[] = [];
  let proseLine = firstLine;
  const flushProse = () => {
    if (prose.length) parts.push({ kind: 'text', text: prose.join('\n'), line: proseLine });
    prose = [];
  };
  for (let i = 0; i < lines.length; i++) {
    const open = openFence(lines[i]!);
    if (!open) {
      if (!prose.length) proseLine = firstLine + i;
      prose.push(lines[i]!);
      continue;
    }
    const start = i;
    const code: string[] = [];
    i++;
    while (i < lines.length && !closesFence(lines[i]!, open)) code.push(lines[i++]!);
    if (i >= lines.length) throw new ContentError('unclosed code fence', file, firstLine + start);
    flushProse();
    const indent = /^ */.exec(lines[start]!)![0].length;
    parts.push({
      kind: 'fence',
      fence: {
        ...parseInfo(open.info),
        code: code.map((l) => l.slice(Math.min(indent, /^ */.exec(l)![0].length))).join('\n'),
        info: open.info.trim(),
        line: firstLine + start,
      },
    });
  }
  flushProse();
  return parts;
}

// --------------------------------------------------------------------------
// Frontmatter and containers
// --------------------------------------------------------------------------

export interface Frontmatter {
  data: Record<string, string>;
  body: string;
  /** 1-based file line where `body` starts. */
  bodyLine: number;
}

export function parseFrontmatter(src: string): Frontmatter {
  const m = /^---\n([\s\S]*?)\n---\n?/.exec(src);
  if (!m) return { data: {}, body: src, bodyLine: 1 };
  const data: Record<string, string> = {};
  for (const line of m[1]!.split('\n')) {
    const kv = /^([A-Za-z_][\w-]*):\s*(.*)$/.exec(line);
    if (!kv) continue;
    let value = kv[2]!.trim();
    if (/^(["']).*\1$/.test(value)) value = value.slice(1, -1);
    data[kv[1]!] = value;
  }
  return { data, body: src.slice(m[0].length), bodyLine: m[0].split('\n').length };
}

export interface MarkdownSegment {
  kind: 'markdown';
  text: string;
  line: number;
}

export interface ContainerSegment {
  kind: 'container';
  name: string;
  args: string;
  flags: string[];
  attrs: Record<string, string>;
  body: string;
  /** Line of the `:::name` opener. */
  line: number;
  /** Line of the body's first line. */
  bodyLine: number;
}

export type Segment = MarkdownSegment | ContainerSegment;

const CONTAINER_OPEN = /^:::([a-z][\w-]*)(?:\s+(.*))?$/;
const CONTAINER_CLOSE = /^:::\s*$/;

/** Split a document body into Markdown runs and `:::` containers. */
export function splitContainers(body: string, firstLine: number, file: string): Segment[] {
  const lines = body.split('\n');
  const segments: Segment[] = [];
  let buffer: string[] = [];
  let bufferLine = firstLine;
  let fence: OpenFence | null = null;

  const flush = () => {
    if (buffer.some((l) => l.trim())) segments.push({ kind: 'markdown', text: buffer.join('\n'), line: bufferLine });
    buffer = [];
  };

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!;
    if (fence) {
      buffer.push(line);
      if (closesFence(line, fence)) fence = null;
      continue;
    }
    const open = openFence(line);
    if (open) {
      fence = open;
      buffer.push(line);
      continue;
    }
    const container = CONTAINER_OPEN.exec(line);
    if (!container) {
      if (CONTAINER_CLOSE.test(line)) throw new ContentError('stray ":::" without an opening container', file, firstLine + i);
      buffer.push(line);
      continue;
    }

    flush();
    const start = i;
    const inner: string[] = [];
    let innerFence: OpenFence | null = null;
    i++;
    for (; i < lines.length; i++) {
      const l = lines[i]!;
      if (innerFence) {
        inner.push(l);
        if (closesFence(l, innerFence)) innerFence = null;
        continue;
      }
      const f = openFence(l);
      if (f) {
        innerFence = f;
        inner.push(l);
        continue;
      }
      if (CONTAINER_CLOSE.test(l)) break;
      if (CONTAINER_OPEN.test(l)) {
        throw new ContentError(`containers can't be nested (found "${l}" inside :::${container[1]})`, file, firstLine + i);
      }
      inner.push(l);
    }
    if (i >= lines.length) throw new ContentError(`unclosed :::${container[1]}`, file, firstLine + start);
    const args = (container[2] ?? '').trim();
    segments.push({
      kind: 'container',
      name: container[1]!,
      args,
      ...parseAttrs(args),
      body: inner.join('\n'),
      line: firstLine + start,
      bodyLine: firstLine + start + 1,
    });
    bufferLine = firstLine + i + 1;
  }
  if (fence) throw new ContentError('unclosed code fence', file, firstLine + lines.length - 1);
  flush();
  return segments;
}

// --------------------------------------------------------------------------
// Headings, slugs and links
// --------------------------------------------------------------------------

export function slugify(text: string): string {
  const slug = text
    .toLowerCase()
    .replace(/`([^`]*)`/g, '$1')
    .replace(/<[^>]+>/g, '')
    .replace(/&[a-z]+;/g, '')
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return slug || 'section';
}

/** Returns a function producing unique slugs in document order. */
export function createSlugger(): (text: string) => string {
  const seen = new Map<string, number>();
  return (text) => {
    const base = slugify(text);
    const count = seen.get(base) ?? 0;
    seen.set(base, count + 1);
    return count ? `${base}-${count + 1}` : base;
  };
}

export interface Heading {
  level: 2 | 3;
  text: string;
  id: string;
  line: number;
}

const HEADING = /^(#{2,3})[ \t]+(.+?)(?:[ \t]+#+)?[ \t]*$/;

/** ATX h2/h3 headings outside code fences, in order. */
export function scanHeadings(markdown: string, firstLine: number, file: string, slugger: (t: string) => string): Heading[] {
  const headings: Heading[] = [];
  for (const part of splitFences(markdown, firstLine, file)) {
    if (part.kind !== 'text') continue;
    part.text.split('\n').forEach((line, offset) => {
      const m = HEADING.exec(line);
      if (m) {
        const text = m[2]!.trim();
        headings.push({ level: m[1]!.length as 2 | 3, text, id: slugger(text), line: part.line + offset });
      }
    });
  }
  return headings;
}

export interface LessonLink {
  slug: string;
  anchor: string | null;
  line: number;
}

/**
 * Collect `[text](lesson:slug#anchor)` links, plus same-page `[text](#anchor)`
 * links when `selfSlug` is given (the renderer turns those into lesson routes).
 */
export function scanLessonLinks(markdown: string, firstLine: number, selfSlug?: string): LessonLink[] {
  const links: LessonLink[] = [];
  markdown.split('\n').forEach((line, offset) => {
    for (const m of line.matchAll(/\]\(lesson:([a-z0-9-]+)(?:#([a-z0-9-]+))?\)/g)) {
      links.push({ slug: m[1]!, anchor: m[2] ?? null, line: firstLine + offset });
    }
    if (!selfSlug) return;
    for (const m of line.matchAll(/\]\(#([^)\s/]+)\)/g)) {
      links.push({ slug: selfSlug, anchor: m[1]!, line: firstLine + offset });
    }
  });
  return links;
}

// --------------------------------------------------------------------------
// Challenges and quizzes
// --------------------------------------------------------------------------

export interface ChallengeSpec {
  id: string;
  title: string;
  difficulty: Difficulty;
  description: string;
  js: Fence | null;
  starter: Fence;
  solution: Fence;
  tests: Fence;
  hints: string[];
  line: number;
}

const DIFFICULTIES: Difficulty[] = ['easy', 'medium', 'hard'];

export function parseChallenge(seg: ContainerSegment, file: string): ChallengeSpec {
  const { id, title } = seg.attrs;
  const difficulty = (seg.attrs.difficulty ?? 'easy') as Difficulty;
  if (!id || !/^[a-z0-9][a-z0-9-]*$/.test(id)) {
    throw new ContentError('challenge needs id=kebab-case-id', file, seg.line);
  }
  if (!title) throw new ContentError(`challenge "${id}" needs title="..."`, file, seg.line);
  if (!DIFFICULTIES.includes(difficulty)) {
    throw new ContentError(`challenge "${id}": difficulty must be easy, medium or hard`, file, seg.line);
  }

  let js: Fence | null = null;
  const roles: Partial<Record<'starter' | 'solution' | 'tests', Fence>> = {};
  const hints: string[] = [];
  const prose: string[] = [];

  for (const part of splitFences(seg.body, seg.bodyLine, file)) {
    if (part.kind === 'text') {
      prose.push(part.text);
      continue;
    }
    const f = part.fence;
    const role = f.lang === 'python'
      ? f.flags.find((r): r is 'starter' | 'solution' | 'tests' => r === 'starter' || r === 'solution' || r === 'tests')
      : undefined;
    if (f.lang === 'js' || f.lang === 'ts') {
      if (js) throw new ContentError(`challenge "${id}" has more than one JS fence`, file, f.line);
      js = f;
    } else if (role) {
      if (roles[role]) throw new ContentError(`challenge "${id}" has two "${role}" fences`, file, f.line);
      roles[role] = f;
    } else if (f.lang === 'hint') {
      hints.push(f.code);
    } else {
      // Any other fence (examples, expected output, ...) belongs to the description.
      prose.push(fenceToMarkdown(f));
    }
  }

  for (const role of ['starter', 'solution', 'tests'] as const) {
    if (!roles[role]) throw new ContentError(`challenge "${id}" is missing its "${role}" fence`, file, seg.line);
  }
  const description = prose.join('\n').trim();
  if (!description) throw new ContentError(`challenge "${id}" needs a description`, file, seg.line);

  return {
    id,
    title,
    difficulty,
    description,
    js,
    starter: roles.starter!,
    solution: roles.solution!,
    tests: roles.tests!,
    hints,
    line: seg.line,
  };
}

export interface QuizSpec {
  question: string;
  questionLine: number;
  options: Array<{ text: string; correct: boolean }>;
  explanation: string;
  explanationLine: number;
  /** First python fence in the question, if any. */
  code: Fence | null;
  /** `:::quiz output` — the correct option must equal the code's stdout. */
  output: boolean;
  line: number;
}

const OPTION = /^[-*][ \t]+\[([ xX])\][ \t]+(.+)$/;

export function parseQuiz(seg: ContainerSegment, file: string): QuizSpec {
  const lines = seg.body.split('\n');
  let fence: OpenFence | null = null;
  let first = -1;
  let last = -1;
  const options: QuizSpec['options'] = [];
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!;
    if (fence) {
      if (closesFence(line, fence)) fence = null;
      continue;
    }
    const open = openFence(line);
    if (open) {
      fence = open;
      continue;
    }
    const m = OPTION.exec(line);
    if (m) {
      if (last !== -1 && last !== i - 1) {
        throw new ContentError('quiz options must form a single contiguous list', file, seg.bodyLine + i);
      }
      if (first === -1) first = i;
      last = i;
      options.push({ text: m[2]!.trim(), correct: m[1] !== ' ' });
    }
  }
  if (options.length < 2) throw new ContentError('quiz needs at least two "- [ ]" options', file, seg.line);
  const correct = options.filter((o) => o.correct).length;
  if (correct !== 1) throw new ContentError(`quiz needs exactly one correct "- [x]" option (found ${correct})`, file, seg.line);

  const question = lines.slice(0, first).join('\n').trim();
  if (!question) throw new ContentError('quiz needs a question before its options', file, seg.line);
  const code =
    splitFences(lines.slice(0, first).join('\n'), seg.bodyLine, file)
      .map((p) => (p.kind === 'fence' ? p.fence : null))
      .find((f): f is Fence => !!f && f.lang === 'python') ?? null;
  const output = seg.flags.includes('output');
  if (output && !code) throw new ContentError('":::quiz output" needs a python fence in the question', file, seg.line);

  return {
    question,
    questionLine: seg.bodyLine,
    options,
    explanation: lines.slice(last + 1).join('\n').trim(),
    explanationLine: seg.bodyLine + last + 1,
    code,
    output,
    line: seg.line,
  };
}

// --------------------------------------------------------------------------
// Lessons
// --------------------------------------------------------------------------

export const CALLOUTS = ['note', 'tip', 'gotcha', 'pythonic', 'deep'] as const;
const CONTAINERS = new Set<string>([...CALLOUTS, 'compare', 'quiz', 'challenge']);

export interface ParsedLesson {
  file: string;
  slug: string;
  order: number;
  frontmatter: Record<string, string>;
  segments: Segment[];
  challenges: ChallengeSpec[];
  quizzes: QuizSpec[];
  /** Every python fence outside challenges/quizzes (playgrounds and static snippets). */
  pythonFences: Fence[];
  headings: Heading[];
  links: LessonLink[];
}

export function lessonFileInfo(file: string): { slug: string; order: number } {
  const name = file.split(/[\\/]/).pop() ?? file;
  const m = /^(\d+)-(.+)\.md$/.exec(name);
  if (!m) throw new ContentError('lesson files must be named NN-slug.md', file, 1);
  return { order: Number(m[1]), slug: m[2]! };
}

export function parseLesson(src: string, file: string): ParsedLesson {
  const text = src.replace(/\r\n?/g, '\n');
  const { data, body, bodyLine } = parseFrontmatter(text);
  const info = lessonFileInfo(file);
  const slug = data.slug || info.slug;
  const segments = splitContainers(body, bodyLine, file);
  const challenges: ChallengeSpec[] = [];
  const quizzes: QuizSpec[] = [];
  const pythonFences: Fence[] = [];
  const links: LessonLink[] = [];
  const slugger = createSlugger();
  const headings: Heading[] = [];

  for (const seg of segments) {
    if (seg.kind === 'markdown') {
      headings.push(...scanHeadings(seg.text, seg.line, file, slugger));
      links.push(...scanLessonLinks(seg.text, seg.line, slug));
      for (const part of splitFences(seg.text, seg.line, file)) {
        if (part.kind === 'fence' && part.fence.lang === 'python') pythonFences.push(part.fence);
      }
      continue;
    }
    if (!CONTAINERS.has(seg.name)) throw new ContentError(`unknown container ":::${seg.name}"`, file, seg.line);
    links.push(...scanLessonLinks(seg.body, seg.bodyLine, slug));
    if (seg.name === 'challenge') challenges.push(parseChallenge(seg, file));
    else if (seg.name === 'quiz') quizzes.push(parseQuiz(seg, file));
    else {
      const fences = splitFences(seg.body, seg.bodyLine, file).flatMap((p) => (p.kind === 'fence' ? [p.fence] : []));
      if (seg.name === 'compare' && fences.length < 2) {
        throw new ContentError(':::compare needs at least two code fences (JS first, then Python)', file, seg.line);
      }
      pythonFences.push(...fences.filter((f) => f.lang === 'python'));
    }
  }

  return {
    file,
    slug,
    order: info.order,
    frontmatter: data,
    segments,
    challenges,
    quizzes,
    pythonFences,
    headings,
    links,
  };
}

// --------------------------------------------------------------------------
// Reference (content/reference.md)
// --------------------------------------------------------------------------

export interface ReferenceSpec {
  category: string;
  title: string;
  fences: Fence[];
  note: string;
  line: number;
}

export function parseReference(src: string, file: string): ReferenceSpec[] {
  const text = src.replace(/\r\n?/g, '\n');
  const { body, bodyLine } = parseFrontmatter(text);
  const entries: ReferenceSpec[] = [];
  let category = '';
  let current: { title: string; line: number; lines: string[]; startLine: number } | null = null;

  const finish = () => {
    if (!current) return;
    const fences: Fence[] = [];
    const prose: string[] = [];
    for (const part of splitFences(current.lines.join('\n'), current.startLine, file)) {
      if (part.kind === 'fence') fences.push(part.fence);
      else prose.push(part.text);
    }
    if (!fences.length) throw new ContentError(`reference entry "${current.title}" has no code`, file, current.line);
    entries.push({ category, title: current.title, fences, note: prose.join('\n').trim(), line: current.line });
    current = null;
  };

  const lines = body.split('\n');
  let fence: OpenFence | null = null;
  lines.forEach((line, i) => {
    const lineNo = bodyLine + i;
    if (fence) {
      if (closesFence(line, fence)) fence = null;
      current?.lines.push(line);
      return;
    }
    const open = openFence(line);
    if (open) {
      fence = open;
      if (!current) throw new ContentError('code outside of a "###" reference entry', file, lineNo);
      current.lines.push(line);
      return;
    }
    const h = /^(#{2,3})[ \t]+(.+?)[ \t]*$/.exec(line);
    if (h) {
      finish();
      if (h[1] === '##') category = h[2]!;
      else {
        if (!category) throw new ContentError('reference entry before any "##" category', file, lineNo);
        current = { title: h[2]!, line: lineNo, lines: [], startLine: lineNo + 1 };
      }
      return;
    }
    current?.lines.push(line);
  });
  finish();
  return entries;
}
