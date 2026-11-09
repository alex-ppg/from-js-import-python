import { courseCard } from '../components/cards.ts';
import { challenges, courses, lessons, quizTotal } from '../content.ts';
import { h, plural } from '../lib/dom.ts';
import { progress } from '../lib/progress.ts';

export function renderCourses(main: HTMLElement): () => void {
  const grid = h('div', { class: 'course-grid' });
  const stats = h('div', { class: 'practice-stats' });

  const render = () => {
    grid.replaceChildren(...courses.map(courseCard));
    const completed = lessons.filter((l) => progress.lesson(l.slug).completed).length;
    const solved = challenges.filter((c) => progress.challenge(c.id).solved).length;
    const cell = (value: string, label: string) =>
      h('div', { class: 'stat' }, h('span', { class: 'stat-value' }, value), h('span', { class: 'stat-label' }, label));
    stats.replaceChildren(
      cell(String(courses.length), 'Courses'),
      cell(`${completed}/${lessons.length}`, 'Lessons completed'),
      cell(`${solved}/${challenges.length}`, 'Challenges solved'),
      cell(String(quizTotal), 'Quizzes'),
    );
  };
  render();

  main.replaceChildren(
    h(
      'div',
      { class: 'page page-courses' },
      h(
        'header',
        { class: 'page-header' },
        h('p', { class: 'eyebrow' }, 'Courses'),
        h('h1', null, 'Pick your path'),
        h(
          'p',
          { class: 'page-lede' },
          `${plural(courses.length, 'course')}, ${plural(lessons.length, 'lesson')} and ${plural(challenges.length, 'coding challenge')}. Start with the core course, then go practical, go deep, or go practise. Every snippet runs real Python in your browser.`,
        ),
        stats,
      ),
      grid,
    ),
  );
  return progress.subscribe(render);
}
