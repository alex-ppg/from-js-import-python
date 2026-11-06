import { hydrate } from '../components/hydrate.ts';
import { REPO_URL } from '../config.ts';
import { challenges, lessons, parts, type CompiledBody } from '../content.ts';
import { brandMarkup, continueLesson, lessonStatus, solvedCount } from '../layout/shell.ts';
import { h, icon, plural } from '../lib/dom.ts';
import { progress } from '../lib/progress.ts';
import { lessonHref } from '../lib/router.ts';

export function renderHome(main: HTMLElement): () => void {
  const cleanups: Array<() => void> = [];

  const startHref = () => (continueLesson() ? lessonHref(continueLesson()!.slug) : '#/');
  const started = () => lessons.some((l) => lessonStatus(l) !== 'new');

  const startButton = h('a', { class: 'btn btn-primary btn-lg', href: startHref() });
  const renderStart = () => {
    startButton.href = startHref();
    startButton.innerHTML = `<span>${started() ? 'Continue learning' : 'Start learning'}</span>${icon('arrow', 18)}`;
  };
  renderStart();

  const demo = h('div', { class: 'hero-demo' }, h('div', { class: 'skeleton skeleton-demo' }));
  import('../../content/home.md')
    .then(({ default: body }) => {
      const compiled = body as CompiledBody;
      demo.innerHTML = compiled.html;
      const hydration = hydrate(demo, compiled, { quizKey: (i) => `home:${i}` });
      cleanups.push(() => hydration.destroy());
    })
    .catch(() => demo.remove());

  const hero = h(
    'section',
    { class: 'hero' },
    h(
      'div',
      { class: 'hero-copy' },
      h('p', { class: 'eyebrow' }, 'Python for JavaScript developers'),
      h('h1', { class: 'hero-title', html: `<code>${brandMarkup()}</code>` }),
      h(
        'p',
        { class: 'hero-lede' },
        'You already know how to program. This course maps the JavaScript in your head onto idiomatic Python: side-by-side translations, the traps your JS instincts walk into, and the syntax shortcuts that make Python a joy.',
      ),
      h('div', { class: 'hero-actions' }, startButton, h('a', { class: 'btn btn-lg', href: '#/reference', html: `${icon('list', 18)}<span>JS → Python reference</span>` })),
      h(
        'ul',
        { class: 'hero-facts' },
        h('li', null, h('strong', null, String(lessons.length)), ' lessons'),
        h('li', null, h('strong', null, String(challenges.length)), ' coding challenges'),
        h('li', null, h('strong', null, 'Python 3.14'), ' running in your browser'),
      ),
    ),
  );

  const demoSection = h(
    'section',
    { class: 'home-demo' },
    h('div', { class: 'section-head' }, h('h2', null, 'Every concept, side by side'), h('p', null, 'The JavaScript you would write on the left, idiomatic Python on the right. The Python is live: edit it and press Run (or Ctrl/Cmd + Enter).')),
    demo,
  );

  const features = h(
    'section',
    { class: 'features' },
    ...[
      ['code', 'Translations, not tutorials', 'Each lesson starts from the JS you know: `map`/`reduce`, `i++`, arrow functions, `?.`, classes, promises. Then it shows the Python a reviewer would approve.'],
      ['terminal', 'Real Python, zero setup', 'Snippets and challenges run on CPython 3.14 compiled to WebAssembly (Pyodide), inside a web worker. Nothing to install, and your code never leaves the browser.'],
      ['target', 'Challenges that check your work', 'Tests run against your solution and also check idioms: "use a comprehension", "no index loops". Hints are revealed one at a time, and the solution is there when you need it.'],
    ].map(([iconName, title, text]) =>
      h('article', { class: 'feature' }, h('div', { class: 'feature-icon', html: icon(iconName!, 22) }), h('h3', null, title), h('p', { html: text!.replace(/`([^`]+)`/g, '<code>$1</code>') })),
    ),
  );

  const curriculum = h('section', { class: 'curriculum' });
  const renderCurriculum = () => {
    const done = lessons.filter((l) => progress.lesson(l.slug).completed).length;
    const solved = challenges.filter((c) => progress.challenge(c.id).solved).length;
    curriculum.replaceChildren(
      h(
        'div',
        { class: 'section-head' },
        h('h2', null, 'The curriculum'),
        h('p', null, `${plural(lessons.length, 'lesson')} in ${plural(parts.length, 'part')}. Your progress is saved in this browser: ${done} of ${lessons.length} lessons completed, ${solved} of ${challenges.length} challenges solved.`),
      ),
      ...parts.map((part) =>
        h(
          'div',
          { class: 'part' },
          h('h3', { class: 'part-title' }, h('span', { class: 'part-num' }, `Part ${part.index}`), part.name),
          h(
            'div',
            { class: 'lesson-grid' },
            ...part.lessons.map((lesson) => {
              const status = lessonStatus(lesson);
              const solvedHere = solvedCount(lesson);
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
                  lesson.challenges.length ? h('span', { html: `${icon('target', 13)} ${solvedHere}/${lesson.challenges.length}` }) : null,
                  status === 'done' ? h('span', { class: 'lesson-card-done', html: `${icon('check', 13)} Done` }) : status === 'started' ? h('span', { class: 'lesson-card-started' }, 'In progress') : null,
                ),
              );
            }),
          ),
        ),
      ),
    );
  };
  renderCurriculum();

  const resetButton = h('button', {
    type: 'button',
    class: 'link-btn',
    onclick: () => {
      if (window.confirm('Reset all progress, saved solutions and quiz answers in this browser?')) progress.reset();
    },
  }, 'Reset progress');

  const footer = h(
    'footer',
    { class: 'home-footer' },
    h(
      'p',
      { html: `Built with <a href="https://pyodide.org" target="_blank" rel="noopener noreferrer">Pyodide</a>, <a href="https://codemirror.net" target="_blank" rel="noopener noreferrer">CodeMirror</a> and <a href="https://shiki.style" target="_blank" rel="noopener noreferrer">Shiki</a>. <a href="${REPO_URL}" target="_blank" rel="noopener noreferrer">Source on GitHub</a>.` },
    ),
    resetButton,
  );

  main.replaceChildren(h('div', { class: 'home' }, hero, demoSection, features, curriculum, footer));

  cleanups.push(
    progress.subscribe(() => {
      renderStart();
      renderCurriculum();
    }),
  );
  return () => cleanups.forEach((cleanup) => cleanup());
}
