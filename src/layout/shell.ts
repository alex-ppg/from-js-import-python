// App chrome: top bar, the current course's curriculum sidebar (a drawer on
// small screens), the Python runtime status pill, theme toggle and search.

import { challengesOf, coreCourse, courseMeta, courses, lessonMeta, lessonsOf, partsOf, type CourseMeta, type LessonMeta } from '../content.ts';
import { openPalette } from '../components/palette.ts';
import { REPO_URL } from '../config.ts';
import { h, icon } from '../lib/dom.ts';
import { progress } from '../lib/progress.ts';
import { courseHref, lessonHref } from '../lib/router.ts';
import { currentTheme, onThemeChange, toggleTheme } from '../lib/theme.ts';
import { python, type RuntimeState } from '../python/client.ts';

export type NavKey = 'home' | 'courses' | 'practice' | 'review' | 'reference' | 'playground' | null;

export interface Shell {
  main: HTMLElement;
  setLayout(layout: 'docs' | 'wide'): void;
  /** Highlight a nav item and point the sidebar at a lesson's (or a course's) curriculum. */
  setActive(nav: NavKey, focus?: { lesson?: string; course?: string }): void;
  closeDrawer(): void;
}

/** The first lesson of a course not yet marked complete. */
export function continueLesson(courseId = coreCourse?.id ?? ''): LessonMeta | undefined {
  const own = lessonsOf(courseId);
  return own.find((lesson) => !progress.lesson(lesson.slug).completed) ?? own[0];
}

export function lessonStatus(lesson: LessonMeta): 'done' | 'started' | 'new' {
  const state = progress.lesson(lesson.slug);
  if (state.completed) return 'done';
  if (state.visited || lesson.challenges.some((c) => progress.challenge(c.id).solved)) return 'started';
  return 'new';
}

export function solvedCount(lesson: LessonMeta): number {
  return lesson.challenges.filter((c) => progress.challenge(c.id).solved).length;
}

export interface CourseStats {
  lessons: number;
  completed: number;
  challenges: number;
  solved: number;
  started: boolean;
}

export function courseStats(course: CourseMeta): CourseStats {
  const own = lessonsOf(course.id);
  const ownChallenges = challengesOf(course.id);
  return {
    lessons: own.length,
    completed: own.filter((l) => progress.lesson(l.slug).completed).length,
    challenges: ownChallenges.length,
    solved: ownChallenges.filter((c) => progress.challenge(c.id).solved).length,
    started: own.some((l) => lessonStatus(l) !== 'new'),
  };
}

const STATUS_ICON = { done: 'done', started: 'half', new: 'circle' } as const;

export function brandMarkup(): string {
  return '<span class="tk-kw">from</span> <span class="tk-mod">js</span> <span class="tk-kw">import</span> <span class="tk-mod">python</span>';
}

export function meter(label: string, value: number, total: number): HTMLElement {
  return h(
    'div',
    { class: 'meter' },
    h('div', { class: 'meter-row' }, h('span', null, label), h('span', { class: 'meter-value' }, `${value}/${total}`)),
    h(
      'div',
      { class: 'meter-track', role: 'progressbar', 'aria-label': label, 'aria-valuemin': '0', 'aria-valuemax': String(total), 'aria-valuenow': String(value) },
      h('div', { class: 'meter-fill', style: `width:${total ? (value / total) * 100 : 0}%` }),
    ),
  );
}

export function createShell(root: HTMLElement): Shell {
  let currentSlug: string | null = null;
  let currentCourse: string = coreCourse?.id ?? '';

  // ---- top bar -----------------------------------------------------------
  const menuButton = h('button', {
    type: 'button',
    class: 'icon-btn menu-btn',
    'aria-label': 'Open navigation',
    'aria-controls': 'sidebar',
    'aria-expanded': 'false',
    html: icon('menu', 20),
    onclick: () => setDrawer(root.dataset.drawer !== 'open'),
  });

  const navLinks = {
    courses: h('a', { class: 'topnav-link', href: '#/courses' }, 'Courses'),
    practice: h('a', { class: 'topnav-link', href: '#/practice' }, 'Practice'),
    review: h('a', { class: 'topnav-link', href: '#/review' }, 'Review'),
    reference: h('a', { class: 'topnav-link', href: '#/reference' }, 'Reference'),
    playground: h('a', { class: 'topnav-link', href: '#/playground' }, 'Playground'),
  };

  const searchButton = h('button', {
    type: 'button',
    class: 'search-btn',
    'aria-label': 'Search (Ctrl+K)',
    html: `${icon('search', 16)}<span class="search-label">Search</span><kbd class="search-kbd">${/Mac|iPhone|iPad/.test(navigator.platform) ? '⌘' : 'Ctrl'} K</kbd>`,
    onclick: () => openPalette(),
  });

  const pill = h('button', { type: 'button', class: 'py-pill' });
  const renderPill = (state: RuntimeState) => {
    pill.dataset.state = state.state;
    const text = {
      idle: 'Python',
      loading: 'Loading Python…',
      ready: state.state === 'ready' ? `Python ${state.python}` : '',
      running: 'Running…',
      error: 'Python unavailable',
    }[state.state];
    const tip = {
      idle: 'Python (Pyodide) loads when you first run code. Click to load it now.',
      loading: state.state === 'loading' ? state.detail : '',
      ready: 'Python is running in your browser via Pyodide (WebAssembly). Click to open the playground.',
      running: 'Executing your code…',
      error: state.state === 'error' ? `${state.message}. Click to retry.` : '',
    }[state.state];
    pill.innerHTML = `<span class="py-dot"></span><span class="py-text">${text}</span>`;
    pill.title = tip;
    pill.setAttribute('aria-label', tip);
  };
  python.subscribe(renderPill);
  pill.addEventListener('click', () => {
    const { state } = python.state;
    if (state === 'idle') python.warmup();
    else if (state === 'error') python.restart();
    else if (state === 'ready') location.hash = '#/playground';
  });

  const themeButton = h('button', { type: 'button', class: 'icon-btn', onclick: () => toggleTheme() });
  const renderTheme = () => {
    const dark = currentTheme() === 'dark';
    themeButton.innerHTML = icon(dark ? 'sun' : 'moon', 18);
    themeButton.setAttribute('aria-label', dark ? 'Switch to light theme' : 'Switch to dark theme');
    themeButton.title = themeButton.getAttribute('aria-label')!;
  };
  renderTheme();
  onThemeChange(renderTheme);

  const topbar = h(
    'header',
    { class: 'topbar' },
    menuButton,
    h('a', { class: 'brand', href: '#/', 'aria-label': 'from js import python: home', html: `<span class="brand-text">${brandMarkup()}</span>` }),
    h('nav', { class: 'topnav', 'aria-label': 'Main' }, ...Object.values(navLinks)),
    h('span', { class: 'topbar-spacer' }),
    searchButton,
    pill,
    themeButton,
    h('a', { class: 'icon-btn gh-link', href: REPO_URL, target: '_blank', rel: 'noopener noreferrer', 'aria-label': 'Source on GitHub', title: 'Source on GitHub', html: icon('github', 18) }),
  );

  // ---- sidebar -------------------------------------------------------------
  const sidebar = h('aside', { class: 'sidebar', id: 'sidebar', 'aria-label': 'Curriculum' });
  const renderSidebar = () => {
    const course = courseMeta(currentCourse) ?? coreCourse;
    if (!course) {
      sidebar.replaceChildren();
      return;
    }
    const stats = courseStats(course);

    const mobileNav = h(
      'nav',
      { class: 'sidebar-pages', 'aria-label': 'Pages' },
      h('a', { href: '#/', html: `${icon('book')}<span>Home</span>` }),
      h('a', { href: '#/courses', html: `${icon('list')}<span>Courses</span>` }),
      h('a', { href: '#/practice', html: `${icon('target')}<span>Practice</span>` }),
      h('a', { href: '#/review', html: `${icon('sparkle')}<span>Review</span>` }),
      h('a', { href: '#/reference', html: `${icon('code')}<span>Reference</span>` }),
      h('a', { href: '#/playground', html: `${icon('terminal')}<span>Playground</span>` }),
    );

    const switcher = h(
      'details',
      { class: 'course-switcher' },
      h(
        'summary',
        null,
        h('span', { class: 'course-switcher-icon', html: icon(course.icon, 16) }),
        h('span', { class: 'course-switcher-text' }, h('span', { class: 'course-switcher-label' }, 'Course'), h('span', { class: 'course-switcher-title' }, course.title)),
      ),
      h(
        'ul',
        { class: 'course-switcher-list' },
        ...courses.map((c) =>
          h(
            'li',
            null,
            h('a', { href: courseHref(c.id), class: c.id === course.id ? 'is-current' : '', html: `${icon(c.icon, 15)}<span>${c.title}</span>` }),
          ),
        ),
      ),
    );

    const nav = h('nav', { class: 'sidebar-nav', 'aria-label': `${course.title} lessons` });
    for (const part of partsOf(course.id)) {
      const list = h('ol', { class: 'side-list' });
      for (const lesson of part.lessons) {
        const status = lessonStatus(lesson);
        const solvedHere = solvedCount(lesson);
        const total = lesson.challenges.length;
        list.append(
          h(
            'li',
            null,
            h(
              'a',
              {
                class: `side-link status-${status}${lesson.slug === currentSlug ? ' is-current' : ''}`,
                href: lessonHref(lesson.slug),
                'aria-current': lesson.slug === currentSlug ? 'page' : null,
              },
              h('span', { class: 'side-status', html: icon(STATUS_ICON[status], 15), title: status === 'done' ? 'Completed' : status === 'started' ? 'In progress' : 'Not started' }),
              h('span', { class: 'side-num' }, String(lesson.order).padStart(2, '0')),
              h('span', { class: 'side-title' }, lesson.title),
              total ? h('span', { class: `side-count${solvedHere === total ? ' is-complete' : ''}`, title: `${solvedHere} of ${total} challenges solved` }, `${solvedHere}/${total}`) : null,
            ),
          ),
        );
      }
      const showPart = partsOf(course.id).length > 1;
      nav.append(
        h(
          'section',
          { class: 'side-part' },
          showPart ? h('h2', { class: 'side-part-title' }, h('span', { class: 'side-part-num' }, String(part.index)), part.name) : null,
          list,
        ),
      );
    }

    sidebar.replaceChildren(
      mobileNav,
      switcher,
      h(
        'div',
        { class: 'sidebar-progress' },
        h('a', { class: 'sidebar-course-link', href: courseHref(course.id), html: `<span>Course overview</span>${icon('right', 14)}` }),
        meter('Lessons completed', stats.completed, stats.lessons),
        meter('Challenges solved', stats.solved, stats.challenges),
      ),
      nav,
    );
    sidebar.querySelector('.is-current')?.scrollIntoView({ block: 'nearest' });
  };
  renderSidebar();
  progress.subscribe(renderSidebar);

  const overlay = h('div', { class: 'drawer-overlay', onclick: () => setDrawer(false) });
  const main = h('main', { class: 'main', id: 'main', tabindex: '-1' });
  const body = h('div', { class: 'body' }, sidebar, overlay, main);

  const setDrawer = (open: boolean) => {
    root.dataset.drawer = open ? 'open' : 'closed';
    menuButton.setAttribute('aria-expanded', String(open));
    if (open) sidebar.querySelector<HTMLElement>('a')?.focus();
  };
  window.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && root.dataset.drawer === 'open') setDrawer(false);
  });

  const skip = h('a', {
    class: 'skip-link',
    href: '#/',
    onclick: (event: MouseEvent) => {
      event.preventDefault();
      main.focus();
    },
  }, 'Skip to content');

  root.replaceChildren(skip, topbar, body);
  root.dataset.drawer = 'closed';

  return {
    main,
    setLayout(layout) {
      root.dataset.layout = layout;
    },
    setActive(nav, focus = {}) {
      for (const [key, link] of Object.entries(navLinks)) {
        const active = key === nav;
        link.classList.toggle('is-active', active);
        if (active) link.setAttribute('aria-current', 'page');
        else link.removeAttribute('aria-current');
      }
      const lesson = focus.lesson ? lessonMeta(focus.lesson) : undefined;
      const nextSlug = lesson?.slug ?? null;
      const nextCourse = lesson?.course ?? focus.course ?? currentCourse;
      if (nextSlug !== currentSlug || nextCourse !== currentCourse) {
        currentSlug = nextSlug;
        currentCourse = nextCourse;
        renderSidebar();
      }
    },
    closeDrawer: () => setDrawer(false),
  };
}
