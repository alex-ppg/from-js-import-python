import { courseCard } from '../components/cards.ts';
import { hydrate } from '../components/hydrate.ts';
import { REPO_URL } from '../config.ts';
import { challenges, coreCourse, courses, lessons, quizTotal, type CompiledBody } from '../content.ts';
import { brandMarkup, continueLesson, lessonStatus } from '../layout/shell.ts';
import { h, icon, plural } from '../lib/dom.ts';
import { progress } from '../lib/progress.ts';
import { lessonHref } from '../lib/router.ts';

export function renderHome(main: HTMLElement): () => void {
  const cleanups: Array<() => void> = [];

  const startHref = () => {
    const next = continueLesson();
    return next ? lessonHref(next.slug) : '#/courses';
  };
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
        'You already know how to program. These courses map the JavaScript in your head onto idiomatic Python: side-by-side translations, the traps your JS instincts walk into, and the syntax shortcuts that make Python a joy. Then they take you further, into real-world tooling, deep internals, algorithms and guided projects.',
      ),
      h(
        'div',
        { class: 'hero-actions' },
        startButton,
        h('a', { class: 'btn btn-lg', href: '#/courses', html: `${icon('list', 18)}<span>Browse courses</span>` }),
      ),
      h(
        'ul',
        { class: 'hero-facts' },
        h('li', null, h('strong', null, String(courses.length)), ' courses'),
        h('li', null, h('strong', null, String(lessons.length)), ' lessons'),
        h('li', null, h('strong', null, String(challenges.length)), ' coding challenges'),
        h('li', null, h('strong', null, String(quizTotal)), ' quizzes'),
        h('li', null, h('strong', null, 'Python 3.14'), ' in your browser'),
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
      ['sparkle', 'Review that sticks', 'The quiz review resurfaces questions you missed, and the flashcards drill the JS → Python reference with spaced repetition. Progress is saved in your browser.'],
    ].map(([iconName, title, text]) =>
      h('article', { class: 'feature' }, h('div', { class: 'feature-icon', html: icon(iconName!, 22) }), h('h3', null, title), h('p', { html: text!.replace(/`([^`]+)`/g, '<code>$1</code>') })),
    ),
  );

  const courseSection = h('section', { class: 'curriculum' });
  const renderCourses = () => {
    const done = lessons.filter((l) => progress.lesson(l.slug).completed).length;
    const solved = challenges.filter((c) => progress.challenge(c.id).solved).length;
    courseSection.replaceChildren(
      h(
        'div',
        { class: 'section-head' },
        h('h2', null, 'Courses'),
        h(
          'p',
          null,
          `Start with ${coreCourse ? `“${coreCourse.title}”` : 'the core course'}, then pick a direction. Progress is saved in this browser: ${done} of ${plural(lessons.length, 'lesson')} completed, ${solved} of ${challenges.length} challenges solved.`,
        ),
      ),
      h('div', { class: 'course-grid' }, ...courses.map(courseCard)),
    );
  };
  renderCourses();

  const resetButton = h('button', {
    type: 'button',
    class: 'link-btn',
    onclick: () => {
      if (window.confirm('Reset all progress, saved solutions, quiz answers and flashcards in this browser?')) progress.reset();
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

  main.replaceChildren(h('div', { class: 'home' }, hero, demoSection, features, courseSection, footer));

  cleanups.push(
    progress.subscribe(() => {
      renderStart();
      renderCourses();
    }),
  );
  return () => cleanups.forEach((cleanup) => cleanup());
}
