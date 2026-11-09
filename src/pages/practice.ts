import { challenges, courses, partsOf, type ChallengeRef } from '../content.ts';
import { h, icon, plural } from '../lib/dom.ts';
import { progress } from '../lib/progress.ts';
import { courseHref, lessonHref } from '../lib/router.ts';

type StatusFilter = 'all' | 'todo' | 'solved';
type DifficultyFilter = 'all' | 'easy' | 'medium' | 'hard';

export function renderPractice(main: HTMLElement): () => void {
  let status: StatusFilter = 'all';
  let difficulty: DifficultyFilter = 'all';
  let course = 'all';

  const isSolved = (c: ChallengeRef) => !!progress.challenge(c.id).solved;
  const inScope = (c: ChallengeRef) => course === 'all' || c.lesson.course === course;
  const matches = (c: ChallengeRef) =>
    inScope(c) &&
    (status === 'all' || (status === 'solved') === isSolved(c)) &&
    (difficulty === 'all' || c.difficulty === difficulty);

  const chipGroup = <T extends string>(label: string, values: Array<[T, string]>, get: () => T, set: (value: T) => void) => {
    const group = h('div', { class: 'chips', role: 'radiogroup', 'aria-label': label });
    const render = () =>
      group.replaceChildren(
        ...values.map(([value, text]) =>
          h('button', {
            type: 'button',
            class: `chip${get() === value ? ' is-active' : ''}`,
            role: 'radio',
            'aria-checked': String(get() === value),
            onclick: () => {
              set(value);
              render();
              renderStats();
              renderList();
            },
          }, text),
        ),
      );
    render();
    return group;
  };

  const stats = h('div', { class: 'practice-stats' });
  const list = h('div', { class: 'practice-groups' });

  const renderStats = () => {
    const scoped = challenges.filter(inScope);
    const by = (d: string) => scoped.filter((c) => c.difficulty === d);
    const cell = (label: string, set: ChallengeRef[]) =>
      h('div', { class: 'stat' }, h('span', { class: 'stat-value' }, `${set.filter(isSolved).length}/${set.length}`), h('span', { class: 'stat-label' }, label));
    stats.replaceChildren(cell('Solved', scoped), cell('Easy', by('easy')), cell('Medium', by('medium')), cell('Hard', by('hard')));
  };

  const renderList = () => {
    const sections: HTMLElement[] = [];
    for (const c of courses) {
      if (course !== 'all' && c.id !== course) continue;
      const blocks: HTMLElement[] = [];
      const parts = partsOf(c.id);
      for (const part of parts) {
        const groups = part.lessons
          .map((lesson) => ({ lesson, items: challenges.filter((ch) => ch.lesson.slug === lesson.slug && matches(ch)) }))
          .filter((g) => g.items.length);
        if (!groups.length) continue;
        blocks.push(
          h(
            'div',
            { class: 'practice-part' },
            parts.length > 1 ? h('h3', { class: 'practice-part-title' }, part.name) : null,
            ...groups.map(({ lesson, items }) =>
              h(
                'div',
                { class: 'practice-lesson' },
                h('h4', null, h('a', { href: lessonHref(lesson.slug) }, `${String(lesson.order).padStart(2, '0')} · ${lesson.title}`)),
                h(
                  'ul',
                  { class: 'challenge-rows' },
                  ...items.map((ch) =>
                    h(
                      'li',
                      null,
                      h(
                        'a',
                        { class: `challenge-row${isSolved(ch) ? ' is-solved' : ''}`, href: lessonHref(lesson.slug, ch.id) },
                        h('span', { class: 'challenge-row-status', html: icon(isSolved(ch) ? 'done' : 'circle', 16) }),
                        h('span', { class: 'challenge-row-title' }, ch.title),
                        h('span', { class: `difficulty difficulty-${ch.difficulty}` }, ch.difficulty),
                      ),
                    ),
                  ),
                ),
              ),
            ),
          ),
        );
      }
      if (!blocks.length) continue;
      sections.push(
        h(
          'section',
          { class: 'practice-course' },
          h('h2', { class: 'practice-course-title' }, h('a', { href: courseHref(c.id), html: `${icon(c.icon, 18)}<span>${c.title}</span>` })),
          ...blocks,
        ),
      );
    }
    list.replaceChildren(...(sections.length ? sections : [h('p', { class: 'empty' }, status === 'todo' ? 'Nothing left to solve here. Nice work.' : 'No challenges match these filters.')]));
  };

  const surprise = h('button', {
    type: 'button',
    class: 'btn',
    html: `${icon('shuffle', 16)}<span>Surprise me</span>`,
    onclick: () => {
      const scoped = challenges.filter((c) => matches(c));
      const pool = scoped.filter((c) => !isSolved(c));
      const from = pool.length ? pool : scoped.length ? scoped : challenges;
      const pick = from[Math.floor(Math.random() * from.length)];
      if (pick) location.hash = lessonHref(pick.lesson.slug, pick.id);
    },
  });

  main.replaceChildren(
    h(
      'div',
      { class: 'page page-practice' },
      h(
        'header',
        { class: 'page-header' },
        h('p', { class: 'eyebrow' }, 'Practice'),
        h('h1', null, 'Coding challenges'),
        h('p', { class: 'page-lede' }, `${plural(challenges.length, 'challenge')} across ${plural(courses.length, 'course')}, each one checked by real tests running on Python 3.14 in your browser.`),
        stats,
        h(
          'div',
          { class: 'filters' },
          chipGroup<string>('Course', [['all', 'All courses'], ...courses.map((c): [string, string] => [c.id, c.title])], () => course, (v) => (course = v)),
        ),
        h(
          'div',
          { class: 'filters' },
          chipGroup<StatusFilter>('Status', [['all', 'All'], ['todo', 'To do'], ['solved', 'Solved']], () => status, (v) => (status = v)),
          chipGroup<DifficultyFilter>('Difficulty', [['all', 'Any level'], ['easy', 'Easy'], ['medium', 'Medium'], ['hard', 'Hard']], () => difficulty, (v) => (difficulty = v)),
          h('span', { class: 'spacer' }),
          surprise,
        ),
      ),
      list,
    ),
  );
  renderStats();
  renderList();
  const unsubscribe = progress.subscribe(() => {
    renderStats();
    renderList();
  });
  return unsubscribe;
}
