// Course and lesson cards shared by the home, courses and course pages.

import type { CourseMeta, LessonMeta } from '../content.ts';
import { courseStats, lessonStatus, solvedCount } from '../layout/shell.ts';
import { h, icon, plural } from '../lib/dom.ts';
import { courseHref, lessonHref } from '../lib/router.ts';

export function courseCard(course: CourseMeta): HTMLAnchorElement {
  const stats = courseStats(course);
  const done = stats.lessons > 0 && stats.completed === stats.lessons;
  const percent = stats.lessons ? Math.round((stats.completed / stats.lessons) * 100) : 0;
  return h(
    'a',
    { class: `course-card${stats.started ? ' is-started' : ''}${done ? ' is-done' : ''}`, href: courseHref(course.id) },
    h(
      'span',
      { class: 'course-card-head' },
      h('span', { class: 'course-card-icon', html: icon(course.icon, 22) }),
      h('span', { class: 'course-card-level' }, course.level),
    ),
    h('span', { class: 'course-card-title' }, course.title),
    h('span', { class: 'course-card-summary' }, course.summary),
    h(
      'span',
      { class: 'course-card-meta' },
      h('span', null, plural(stats.lessons, 'lesson')),
      h('span', null, plural(stats.challenges, 'challenge')),
      stats.started ? h('span', { class: 'course-card-percent' }, done ? 'Complete' : `${percent}% done`) : null,
    ),
    h('span', { class: 'course-card-track', 'aria-hidden': 'true' }, h('span', { class: 'course-card-fill', style: `width:${percent}%` })),
  );
}

export function lessonCard(lesson: LessonMeta): HTMLAnchorElement {
  const status = lessonStatus(lesson);
  const solved = solvedCount(lesson);
  return h(
    'a',
    { class: `lesson-card status-${status}`, href: lessonHref(lesson.slug) },
    h('span', { class: 'lesson-card-num' }, String(lesson.order).padStart(2, '0')),
    h('span', { class: 'lesson-card-title' }, lesson.title),
    h('span', { class: 'lesson-card-summary' }, lesson.summary),
    h(
      'span',
      { class: 'lesson-card-meta' },
      h('span', { html: `${icon('clock', 13)} ${lesson.minutes} min` }),
      lesson.challenges.length ? h('span', { html: `${icon('target', 13)} ${solved}/${lesson.challenges.length}` }) : null,
      lesson.quizCount ? h('span', { html: `${icon('sparkle', 13)} ${lesson.quizCount}` }) : null,
      status === 'done'
        ? h('span', { class: 'lesson-card-done', html: `${icon('check', 13)} Done` })
        : status === 'started'
          ? h('span', { class: 'lesson-card-started' }, 'In progress')
          : null,
    ),
  );
}
