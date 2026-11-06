// App chrome: top bar, curriculum sidebar (a drawer on small screens), the
// Python runtime status pill, theme toggle and search entry point.

import { challenges, lessons, parts, type LessonMeta } from '../content.ts';
import { openPalette } from '../components/palette.ts';
import { REPO_URL } from '../config.ts';
import { h, icon } from '../lib/dom.ts';
import { progress } from '../lib/progress.ts';
import { lessonHref } from '../lib/router.ts';
import { currentTheme, onThemeChange, toggleTheme } from '../lib/theme.ts';
import { python, type RuntimeState } from '../python/client.ts';

export type NavKey = 'home' | 'learn' | 'practice' | 'reference' | 'playground' | null;

export interface Shell {
  main: HTMLElement;
  setLayout(layout: 'docs' | 'wide'): void;
  setActive(nav: NavKey, lessonSlug?: string | null): void;
  closeDrawer(): void;
}

/** The first lesson not yet marked complete (where "Learn" should take you). */
export function continueLesson(): LessonMeta | undefined {
  return lessons.find((lesson) => !progress.lesson(lesson.slug).completed) ?? lessons[0];
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

const STATUS_ICON = { done: 'done', started: 'half', new: 'circle' } as const;

export function brandMarkup(): string {
  return '<span class="tk-kw">from</span> <span class="tk-mod">js</span> <span class="tk-kw">import</span> <span class="tk-mod">python</span>';
}

export function createShell(root: HTMLElement): Shell {
  let currentSlug: string | null = null;

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
    learn: h('a', { class: 'topnav-link', href: '#/' }, 'Learn'),
    practice: h('a', { class: 'topnav-link', href: '#/practice' }, 'Practice'),
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
    const done = lessons.filter((l) => progress.lesson(l.slug).completed).length;
    const solved = challenges.filter((c) => progress.challenge(c.id).solved).length;
    const bar = (label: string, value: number, total: number) =>
      h(
        'div',
        { class: 'meter' },
        h('div', { class: 'meter-row' }, h('span', null, label), h('span', { class: 'meter-value' }, `${value}/${total}`)),
        h('div', { class: 'meter-track', role: 'progressbar', 'aria-label': label, 'aria-valuemin': '0', 'aria-valuemax': String(total), 'aria-valuenow': String(value) }, h('div', { class: 'meter-fill', style: `width:${total ? (value / total) * 100 : 0}%` })),
      );

    const mobileNav = h(
      'nav',
      { class: 'sidebar-pages', 'aria-label': 'Pages' },
      h('a', { href: '#/', html: `${icon('book')}<span>Home</span>` }),
      h('a', { href: '#/practice', html: `${icon('target')}<span>Practice</span>` }),
      h('a', { href: '#/reference', html: `${icon('list')}<span>Reference</span>` }),
      h('a', { href: '#/playground', html: `${icon('terminal')}<span>Playground</span>` }),
    );

    const nav = h('nav', { class: 'sidebar-nav', 'aria-label': 'Lessons' });
    for (const part of parts) {
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
      nav.append(h('section', { class: 'side-part' }, h('h2', { class: 'side-part-title' }, h('span', { class: 'side-part-num' }, String(part.index)), part.name), list));
    }

    sidebar.replaceChildren(
      mobileNav,
      h('div', { class: 'sidebar-progress' }, bar('Lessons completed', done, lessons.length), bar('Challenges solved', solved, challenges.length)),
      nav,
    );
    sidebar.querySelector('.is-current')?.scrollIntoView({ block: 'nearest' });
  };
  renderSidebar();
  progress.subscribe(() => {
    renderSidebar();
    navLinks.learn.href = continueLesson() ? lessonHref(continueLesson()!.slug) : '#/';
  });
  navLinks.learn.href = continueLesson() ? lessonHref(continueLesson()!.slug) : '#/';

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
    setActive(nav, lessonSlug = null) {
      for (const [key, link] of Object.entries(navLinks)) {
        const active = key === nav;
        link.classList.toggle('is-active', active);
        if (active) link.setAttribute('aria-current', 'page');
        else link.removeAttribute('aria-current');
      }
      if (lessonSlug !== currentSlug) {
        currentSlug = lessonSlug;
        renderSidebar();
      }
    },
    closeDrawer: () => setDrawer(false),
  };
}
