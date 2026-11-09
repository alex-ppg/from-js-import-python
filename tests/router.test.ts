import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { courseHref, decodeCode, encodeCode, lessonHref, parseHash } from '../src/lib/router.ts';

describe('parseHash', () => {
  const cases: Array<[string, ReturnType<typeof parseHash>]> = [
    ['', { name: 'home' }],
    ['#/', { name: 'home' }],
    ['#/courses', { name: 'courses' }],
    ['#/course/algorithms', { name: 'course', id: 'algorithms' }],
    ['#/course', { name: 'courses' }],
    ['#/learn', { name: 'courses' }],
    ['#/learn/lists', { name: 'lesson', slug: 'lists', anchor: null }],
    ['#/learn/lists/slicing', { name: 'lesson', slug: 'lists', anchor: 'slicing' }],
    ['#/practice', { name: 'practice' }],
    ['#/review', { name: 'review', mode: 'hub' }],
    ['#/review/quiz', { name: 'review', mode: 'quiz' }],
    ['#/review/flashcards', { name: 'review', mode: 'flashcards' }],
    ['#/review/nope', { name: 'notfound' }],
    ['#/reference', { name: 'reference', entry: null, query: '' }],
    ['#/reference/arrays-map?q=map%20filter', { name: 'reference', entry: 'arrays-map', query: 'map filter' }],
    ['#/playground?code=abc', { name: 'playground', code: 'abc' }],
    ['#/nowhere', { name: 'notfound' }],
  ];
  for (const [hash, expected] of cases) {
    test(JSON.stringify(hash), () => assert.deepEqual(parseHash(hash), expected));
  }

  test('decodes percent-encoded segments and survives malformed ones', () => {
    assert.deepEqual(parseHash('#/learn/a%20b'), { name: 'lesson', slug: 'a b', anchor: null });
    assert.deepEqual(parseHash('#/learn/%E0%A4%A'), { name: 'lesson', slug: '%E0%A4%A', anchor: null });
  });
});

describe('hrefs', () => {
  test('lesson and course links', () => {
    assert.equal(lessonHref('lists'), '#/learn/lists');
    assert.equal(lessonHref('lists', 'slicing'), '#/learn/lists/slicing');
    assert.equal(courseHref('algorithms'), '#/course/algorithms');
  });
});

describe('playground share codes', () => {
  test('round-trip arbitrary Unicode source as URL-safe base64', () => {
    const source = 'print(f"{\'héllo\'!r} → 🐍")\nxs = [i ** 2 for i in range(10)]  # ~+/=\n';
    const encoded = encodeCode(source);
    assert.match(encoded, /^[A-Za-z0-9_-]+$/);
    assert.equal(decodeCode(encoded), source);
  });

  test('garbage decodes to null instead of throwing', () => {
    assert.equal(decodeCode('%%%'), null);
  });
});
