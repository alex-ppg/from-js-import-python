import { lessonCard } from '../components/cards.ts';
import { courseMeta, courses, partsOf, quizTotal, type CourseMeta } from '../content.ts';
import { continueLesson, courseStats, meter } from '../layout/shell.ts';
import { h, icon, plural } from '../lib/dom.ts';
import { progress } from '../lib/progress.ts';
import { courseHref, lessonHref } from '../lib/router.ts';

export function renderCourse(main: HTMLElement, id: string): (() => void) | null {
  const course = courseMeta(id);
  if (!course) return null;

  const header = h('header', { class: 'course-hero' });
  const curriculum = h('div', { class: 'course-curriculum' });

  const render = () => {
    const stats = courseStats(course);
    const next = continueLesson(course.id);
    const quizzes = partsOf(course.id).reduce((sum, part) => sum + part.lessons.reduce((s, l) => s + l.quizCount, 0), 0);
    header.replaceChildren(
      h('div', { class: 'course-hero-icon', html: icon(course.icon, 28) }),
      h('p', { class: 'eyebrow' }, course.level),
      h('h1', null, course.title),
      h('p', { class: 'page-lede' }, course.summary),
      h(
        'div',
        { class: 'course-hero-facts' },
        h('span', null, plural(stats.lessons, 'lesson')),
        h('span', null, plural(stats.challenges, 'challenge')),
        h('span', null, plural(quizzes, 'quiz', 'quizzes')),
      ),
      h(
        'div',
        { class: 'course-hero-actions' },
        next
          ? h('a', { class: 'btn btn-primary btn-lg', href: lessonHref(next.slug), html: `<span>${stats.started ? 'Continue' : 'Start the course'}</span>${icon('arrow', 18)}` })
          : h('span', { class: 'empty' }, 'Lessons for this course are on their way.'),
      ),
      ...(stats.lessons
        ? [h('div', { class: 'course-hero-meters' }, meter('Lessons completed', stats.completed, stats.lessons), meter('Challenges solved', stats.solved, stats.challenges))]
        : []),
    );

    const parts = partsOf(course.id);
    curriculum.replaceChildren(
      ...parts.map((part) =>
        h(
          'section',
          { class: 'part' },
          parts.length > 1 ? h('h2', { class: 'part-title' }, h('span', { class: 'part-num' }, `Part ${part.index}`), part.name) : null,
          h('div', { class: 'lesson-grid' }, ...part.lessons.map(lessonCard)),
        ),
      ),
    );
  };
  render();

  const others = courses.filter((c: CourseMeta) => c.id !== course.id);
  main.replaceChildren(
    h(
      'div',
      { class: 'page page-course' },
      header,
      curriculum,
      others.length
        ? h(
            'footer',
            { class: 'course-others' },
            h('h2', null, 'Other courses'),
            h(
              'div',
              { class: 'course-chips' },
              ...others.map((c) => h('a', { class: 'chip-link', href: courseHref(c.id), html: `${icon(c.icon, 15)}<span>${c.title}</span>` })),
            ),
            h('p', { class: 'course-others-note' }, `${plural(quizTotal, 'quiz', 'quizzes')} across the site feed the `, h('a', { href: '#/review/quiz' }, 'quiz review'), '.'),
          )
        : null,
    ),
  );
  return progress.subscribe(render);
}
