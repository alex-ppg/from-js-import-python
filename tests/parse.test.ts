import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import {
  ContentError,
  createSlugger,
  parseChallenge,
  parseFrontmatter,
  parseInfo,
  parseLesson,
  parseQuiz,
  scanLessonLinks,
  slugify,
  splitContainers,
  splitFences,
  type ContainerSegment,
} from '../plugins/content/parse.ts';

const FILE = 'content/courses/test/01-sample.md';
const fence = '```';

function container(src: string): ContainerSegment {
  const [seg] = splitContainers(src, 1, FILE);
  assert.equal(seg?.kind, 'container');
  return seg as ContainerSegment;
}

describe('parseInfo', () => {
  test('splits language, flags and attributes', () => {
    assert.deepEqual(parseInfo('python run title="config file.py" nocheck'), {
      lang: 'python',
      flags: ['run', 'nocheck'],
      attrs: { title: 'config file.py' },
    });
  });

  test('normalises language aliases', () => {
    assert.equal(parseInfo('py').lang, 'python');
    assert.equal(parseInfo('JavaScript').lang, 'js');
    assert.equal(parseInfo('sh').lang, 'bash');
    assert.equal(parseInfo('').lang, 'text');
  });
});

describe('parseFrontmatter', () => {
  test('reports the line where the body starts', () => {
    const { data, body, bodyLine } = parseFrontmatter('---\ntitle: "Hi"\npart: X\n---\nbody\n');
    assert.deepEqual(data, { title: 'Hi', part: 'X' });
    assert.equal(body, 'body\n');
    assert.equal(bodyLine, 5);
  });

  test('a file without frontmatter is all body', () => {
    assert.deepEqual(parseFrontmatter('# nothing'), { data: {}, body: '# nothing', bodyLine: 1 });
  });
});

describe('splitContainers', () => {
  test('separates markdown from containers and tracks lines', () => {
    const segs = splitContainers(`intro\n\n:::tip Title here\nbody\n:::\n\noutro`, 10, FILE);
    assert.deepEqual(
      segs.map((s) => [s.kind, s.line]),
      [['markdown', 10], ['container', 12], ['markdown', 15]],
    );
    const tip = segs[1] as ContainerSegment;
    assert.equal(tip.name, 'tip');
    assert.equal(tip.args, 'Title here');
    assert.equal(tip.body, 'body');
  });

  test('":::" inside a code fence is just code', () => {
    const segs = splitContainers(`${fence}python\nxs[::2]\n:::\n${fence}`, 1, FILE);
    assert.equal(segs.length, 1);
    assert.equal(segs[0]!.kind, 'markdown');
  });

  test('rejects nested and unclosed containers with a line number', () => {
    assert.throws(() => splitContainers(':::note\n:::tip\n:::\n:::', 1, FILE), (e: unknown) => e instanceof ContentError && e.line === 2);
    assert.throws(() => splitContainers('a\n:::note\nnever closed', 1, FILE), (e: unknown) => e instanceof ContentError && e.line === 2);
    assert.throws(() => splitContainers('stray\n:::', 1, FILE), ContentError);
  });
});

describe('splitFences', () => {
  test('returns prose and fences in order, with fence lines', () => {
    const parts = splitFences(`text\n${fence}js\nlet a\n${fence}\nmore`, 5, FILE);
    assert.deepEqual(
      parts.map((p) => (p.kind === 'text' ? ['text', p.line] : ['fence', p.fence.lang, p.fence.code, p.fence.line])),
      [['text', 5], ['fence', 'js', 'let a', 6], ['text', 9]],
    );
  });

  test('supports longer fences around code that contains backticks', () => {
    const [part] = splitFences('````md\n```js\nx\n```\n````', 1, FILE);
    assert.equal(part?.kind === 'fence' ? part.fence.code : null, '```js\nx\n```');
  });
});

describe('slugs and links', () => {
  test('slugify strips code, markup and punctuation', () => {
    assert.equal(slugify('Slicing: `slice()` with superpowers'), 'slicing-slice-with-superpowers');
    assert.equal(slugify('`__main__` & friends'), 'main-friends');
    assert.equal(slugify('!!!'), 'section');
  });

  test('the slugger de-duplicates in document order', () => {
    const slug = createSlugger();
    assert.deepEqual([slug('Gotcha'), slug('Gotcha'), slug('Other'), slug('Gotcha')], ['gotcha', 'gotcha-2', 'other', 'gotcha-3']);
  });

  test('scanLessonLinks finds lesson: links and same-page anchors', () => {
    const links = scanLessonLinks('see [a](lesson:dicts) and [b](lesson:lists#slicing)\nand [c](#below)', 3, 'self');
    assert.deepEqual(links, [
      { slug: 'dicts', anchor: null, line: 3 },
      { slug: 'lists', anchor: 'slicing', line: 3 },
      { slug: 'self', anchor: 'below', line: 4 },
    ]);
  });
});

describe('quizzes', () => {
  const quiz = (body: string, args = '') => parseQuiz(container(`:::quiz ${args}\n${body}\n:::`), FILE);

  test('parses question, options, explanation and code', () => {
    const q = quiz(`What prints?\n\n${fence}python\nprint(1)\n${fence}\n\n- [ ] \`0\`\n- [x] \`1\`\n\nBecause.`, 'output');
    assert.equal(q.options.length, 2);
    assert.equal(q.options.findIndex((o) => o.correct), 1);
    assert.equal(q.code?.code, 'print(1)');
    assert.equal(q.explanation, 'Because.');
    assert.equal(q.output, true);
  });

  test('needs exactly one correct, contiguous option list', () => {
    assert.throws(() => quiz('Q?\n- [x] a\n- [x] b'), /exactly one correct/);
    assert.throws(() => quiz('Q?\n- [ ] a\n- [ ] b'), /exactly one correct/);
    assert.throws(() => quiz('Q?\n- [x] a\n\nmid\n- [ ] b'), /contiguous/);
    assert.throws(() => quiz('Q?\n- [x] a\n- [ ] b', 'output'), /needs a python fence/);
  });
});

describe('challenges', () => {
  const challenge = (attrs: string, body: string) => parseChallenge(container(`:::challenge ${attrs}\n${body}\n:::`), FILE);
  const roles = `${fence}python starter\npass\n${fence}\n${fence}python solution\nx = 1\n${fence}\n${fence}python tests\n@test\ndef t(): eq(x, 1)\n${fence}`;

  test('assigns fences by role and keeps examples in the description', () => {
    const c = challenge('id=demo-one title="Demo" difficulty=hard', `Do it.\n\n${fence}text\nexample\n${fence}\n\n${fence}js\nconst x = 1;\n${fence}\n${roles}\n${fence}hint\nTry harder.\n${fence}`);
    assert.equal(c.id, 'demo-one');
    assert.equal(c.difficulty, 'hard');
    assert.equal(c.js?.code, 'const x = 1;');
    assert.equal(c.solution.code, 'x = 1');
    assert.deepEqual(c.hints, ['Try harder.']);
    assert.match(c.description, /example/);
  });

  test('validates ids, difficulty and required fences', () => {
    assert.throws(() => challenge('id=Bad_Id title="x"', roles), /kebab-case/);
    assert.throws(() => challenge('id=ok title="x" difficulty=extreme', roles), /difficulty/);
    assert.throws(() => challenge('id=ok', roles), /needs title/);
    assert.throws(() => challenge('id=ok title="x"', `Desc.\n${fence}python starter\npass\n${fence}`), /missing its "solution"/);
  });
});

describe('parseLesson', () => {
  test('collects headings, links, python fences and widgets', () => {
    const src = [
      '---',
      'title: Sample',
      'part: One',
      'summary: S.',
      '---',
      'Intro [x](lesson:other).',
      '',
      '## First section',
      '',
      `${fence}python run`,
      'print(1)',
      fence,
      '',
      '## First section',
      '',
      ':::compare',
      `${fence}js`,
      'a',
      fence,
      `${fence}python`,
      'a',
      fence,
      ':::',
    ].join('\n');
    const lesson = parseLesson(src, FILE);
    assert.equal(lesson.slug, 'sample');
    assert.equal(lesson.order, 1);
    assert.deepEqual(lesson.headings.map((h) => h.id), ['first-section', 'first-section-2']);
    assert.deepEqual(lesson.links.map((l) => l.slug), ['other']);
    assert.equal(lesson.pythonFences.length, 2);
    assert.ok(lesson.pythonFences[0]!.flags.includes('run'));
  });

  test('rejects unknown containers and one-sided comparisons', () => {
    const head = '---\ntitle: T\npart: P\nsummary: S\n---\n';
    assert.throws(() => parseLesson(`${head}:::wat\nx\n:::`, FILE), /unknown container/);
    assert.throws(() => parseLesson(`${head}:::compare\n${fence}js\nx\n${fence}\n:::`, FILE), /at least two code fences/);
  });

  test('requires NN-slug.md file names', () => {
    assert.throws(() => parseLesson('x', 'content/courses/test/no-number.md'), /NN-slug\.md/);
  });
});
