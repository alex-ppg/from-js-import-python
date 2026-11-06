import { challenges, parts, type ChallengeRef } from '../content.ts';
import { h, icon, plural } from '../lib/dom.ts';
import { progress } from '../lib/progress.ts';
import { lessonHref } from '../lib/router.ts';

type StatusFilter = 'all' | 'todo' | 'solved';
type DifficultyFilter = 'all' | 'easy' | 'medium' | 'hard';

export function renderPractice(main: HTMLElement): () => void {
  let status: StatusFilter = 'all';
  let difficulty: DifficultyFilter = 'all';

  const isSolved = (c: ChallengeRef) => !!progress.challenge(c.id).solved;
  const matches = (c: ChallengeRef) =>
    (status === 'all' || (status === 'solved') === isSolved(c)) && (difficulty === 'all' || c.difficulty === difficulty);

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
    const by = (d: string) => challenges.filter((c) => c.difficulty === d);
    const cell = (label: string, set: ChallengeRef[]) =>
      h('div', { class: 'stat' }, h('span', { class: 'stat-value' }, `${set.filter(isSolved).length}/${set.length}`), h('span', { class: 'stat-label' }, label));
    stats.replaceChildren(cell('Solved', challenges), cell('Easy', by('easy')), cell('Medium', by('medium')), cell('Hard', by('hard')));
  };

  const renderList = () => {
    const groups = parts
      .map((part) => {
        const lessonsWithMatches = part.lessons
          .map((lesson) => ({ lesson, items: challenges.filter((c) => c.lesson.slug === lesson.slug && matches(c)) }))
          .filter((g) => g.items.length);
        if (!lessonsWithMatches.length) return null;
        return h(
          'section',
          { class: 'practice-part' },
          h('h2', { class: 'part-title' }, h('span', { class: 'part-num' }, `Part ${part.index}`), part.name),
          ...lessonsWithMatches.map(({ lesson, items }) =>
            h(
              'div',
              { class: 'practice-lesson' },
              h('h3', null, h('a', { href: lessonHref(lesson.slug) }, `${String(lesson.order).padStart(2, '0')} · ${lesson.title}`)),
              h(
                'ul',
                { class: 'challenge-rows' },
                ...items.map((c) =>
                  h(
                    'li',
                    null,
                    h(
                      'a',
                      { class: `challenge-row${isSolved(c) ? ' is-solved' : ''}`, href: lessonHref(lesson.slug, c.id) },
                      h('span', { class: 'challenge-row-status', html: icon(isSolved(c) ? 'done' : 'circle', 16) }),
                      h('span', { class: 'challenge-row-title' }, c.title),
                      h('span', { class: `difficulty difficulty-${c.difficulty}` }, c.difficulty),
                    ),
                  ),
                ),
              ),
            ),
          ),
        );
      })
      .filter((group): group is HTMLElement => group !== null);
    list.replaceChildren(...(groups.length ? groups : [h('p', { class: 'empty' }, status === 'todo' ? 'Nothing left to solve here. Nice work.' : 'No challenges match these filters.')]));
  };

  const surprise = h('button', {
    type: 'button',
    class: 'btn',
    html: `${icon('shuffle', 16)}<span>Surprise me</span>`,
    onclick: () => {
      const pool = challenges.filter((c) => !isSolved(c));
      const pick = (pool.length ? pool : challenges)[Math.floor(Math.random() * (pool.length || challenges.length))];
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
        h('p', { class: 'page-lede' }, `${plural(challenges.length, 'challenge')}, each one checked by real tests running on Python 3.14 in your browser. Most start from the JavaScript you would write and ask for the Pythonic version.`),
        stats,
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
