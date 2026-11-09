// The content pipeline end to end: course discovery and the build-time
// renderer (markdown-it + Shiki) on a real lesson.

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { before, describe, test } from 'node:test';
import { courseIdOf, listCourses } from '../plugins/content/courses.ts';
import { parseLesson, parseReference } from '../plugins/content/parse.ts';
import { createRenderer, type Renderer } from '../plugins/content/render.ts';

const ROOT = resolve(import.meta.dirname, '..');

describe('courses', () => {
  const courses = listCourses(ROOT);

  test('are discovered in order, each with a valid course.json', () => {
    assert.ok(courses.length >= 1);
    assert.equal(courses[0]!.id, 'python-for-js-devs');
    for (const course of courses) {
      assert.ok(course.title && course.summary && course.level, `${course.id} metadata`);
      assert.ok(course.parts.length > 0, `${course.id} parts`);
    }
    assert.deepEqual(courses.map((c) => c.order), [...courses.map((c) => c.order)].sort((a, b) => a - b));
  });

  test('the core course has all 25 lessons', () => {
    assert.equal(courses[0]!.lessonFiles.length, 25);
  });

  test('lesson slugs are unique across courses', () => {
    const seen = new Map<string, string>();
    for (const course of courses) {
      for (const name of course.lessonFiles) {
        const slug = name.replace(/^\d+-/, '').replace(/\.md$/, '');
        assert.ok(!seen.has(slug), `${slug} is in both ${seen.get(slug)} and ${course.id}`);
        seen.set(slug, course.id);
      }
    }
  });

  test('courseIdOf reads the course from a lesson path', () => {
    assert.equal(courseIdOf('/x/content/courses/algorithms/01-a.md'), 'algorithms');
    assert.equal(courseIdOf('C:\\x\\content\\courses\\projects\\02-b.md'), 'projects');
    assert.equal(courseIdOf('/x/content/reference.md'), null);
  });
});

describe('renderer', () => {
  let renderer: Renderer;
  before(async () => {
    renderer = await createRenderer();
  });

  test('renders a real lesson into HTML plus widget data', () => {
    const file = resolve(ROOT, 'content/courses/python-for-js-devs/07-lists.md');
    const compiled = renderer.renderLesson(parseLesson(readFileSync(file, 'utf8'), file), { id: 'python-for-js-devs', parts: ['Collections'] });
    assert.equal(compiled.meta.slug, 'lists');
    assert.equal(compiled.meta.course, 'python-for-js-devs');
    assert.equal(compiled.challenges.length, 4);
    assert.equal(compiled.quizzes.length, compiled.meta.quizCount);
    assert.ok(compiled.quizzes.every((q) => q.questionHtml.length > 0 && q.correct >= 0));
    assert.equal(compiled.playgrounds.length, compiled.meta.playgroundCount);
    assert.match(compiled.html, /class="compare"/);
    assert.match(compiled.html, /class="shiki/);
    assert.match(compiled.html, /data-challenge="rotate-list"/);
    assert.ok(compiled.meta.toc.some((t) => t.id === 'slicing-slice-with-superpowers'));
  });

  test('rejects a part that is not in the course', () => {
    const file = resolve(ROOT, 'content/courses/python-for-js-devs/07-lists.md');
    assert.throws(() => renderer.renderLesson(parseLesson(readFileSync(file, 'utf8'), file), { id: 'x', parts: ['Other'] }), /part/);
  });

  test('rewrites lesson: links and same-page anchors into hash routes', () => {
    const page = renderer.renderPage('[a](lesson:dicts#get) [b](#below) [c](https://example.com)', 'content/x.md');
    assert.match(page.html, /href="#\/learn\/dicts\/get"/);
    assert.match(page.html, /href="#\/learn\/page\/below"/);
    assert.match(page.html, /target="_blank"/);
  });

  test('renders the reference into searchable entries', () => {
    const file = resolve(ROOT, 'content/reference.md');
    const reference = renderer.renderReference(parseReference(readFileSync(file, 'utf8'), file));
    assert.ok(reference.entries.length >= 200);
    assert.ok(reference.categories.length >= 10);
    const ids = new Set(reference.entries.map((e) => e.id));
    assert.equal(ids.size, reference.entries.length, 'entry ids are unique');
    assert.ok(reference.entries.every((e) => e.js && e.py && e.text === e.text.toLowerCase()));
  });
});
