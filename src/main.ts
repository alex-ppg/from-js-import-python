import '@fontsource-variable/inter';
import '@fontsource-variable/jetbrains-mono';
import './styles/tokens.css';
import './styles/base.css';
import './styles/layout.css';
import './styles/prose.css';
import './styles/components.css';
import './styles/pages.css';

import { initPalette } from './components/palette.ts';
import { SITE_NAME } from './config.ts';
import { lessonMeta } from './content.ts';
import { createShell } from './layout/shell.ts';
import { copyText, h, icon } from './lib/dom.ts';
import { currentRoute, type Route } from './lib/router.ts';
import { initTheme } from './lib/theme.ts';
import { renderHome } from './pages/home.ts';
import { renderLesson, type LessonView } from './pages/lesson.ts';
import { renderPlaygroundPage } from './pages/playground.ts';
import { renderPractice } from './pages/practice.ts';
import { renderReference, type ReferenceView } from './pages/reference.ts';

initTheme();
const shell = createShell(document.getElementById('app')!);
initPalette();

type View = LessonView | ReferenceView | { kind: 'other'; cleanup(): void };

let view: View | null = null;
let generation = 0;

function notFound(main: HTMLElement): View {
  main.replaceChildren(
    h(
      'div',
      { class: 'page page-notfound' },
      h('p', { class: 'eyebrow' }, '404'),
      h('h1', null, 'NameError: page is not defined'),
      h('p', { class: 'page-lede' }, 'That page does not exist (yet). Try the search, or head back to the curriculum.'),
      h('a', { class: 'btn btn-primary', href: '#/', html: `<span>Back to home</span>${icon('arrow', 16)}` }),
    ),
  );
  document.title = `Not found · ${SITE_NAME}`;
  return { kind: 'other', cleanup() {} };
}

async function render(route: Route): Promise<void> {
  shell.closeDrawer();

  // Same-page navigations: scroll within the lesson, or refine the reference search.
  if (route.name === 'lesson' && view?.kind === 'lesson' && view.slug === route.slug) {
    view.scrollTo(route.anchor, true);
    return;
  }
  if (route.name === 'reference' && view?.kind === 'reference') {
    view.update(route);
    return;
  }

  const current = ++generation;
  const isCurrent = () => current === generation;
  view?.cleanup();
  view = null;
  const main = shell.main;

  switch (route.name) {
    case 'home':
      shell.setLayout('wide');
      shell.setActive('home');
      document.title = `${SITE_NAME}: Python for JavaScript developers`;
      view = { kind: 'other', cleanup: renderHome(main) };
      window.scrollTo({ top: 0 });
      break;
    case 'lesson': {
      const meta = lessonMeta(route.slug);
      if (!meta) {
        shell.setLayout('wide');
        shell.setActive(null);
        view = notFound(main);
        break;
      }
      shell.setLayout('docs');
      shell.setActive('learn', route.slug);
      document.title = `${meta.title} · ${SITE_NAME}`;
      window.scrollTo({ top: 0 });
      const lesson = await renderLesson(main, route.slug, isCurrent);
      if (!isCurrent()) {
        lesson?.cleanup();
        return;
      }
      if (!lesson) {
        view = notFound(main);
        break;
      }
      view = lesson;
      if (route.anchor) requestAnimationFrame(() => lesson.scrollTo(route.anchor));
      break;
    }
    case 'practice':
      shell.setLayout('wide');
      shell.setActive('practice');
      document.title = `Practice · ${SITE_NAME}`;
      view = { kind: 'other', cleanup: renderPractice(main) };
      window.scrollTo({ top: 0 });
      break;
    case 'reference': {
      shell.setLayout('wide');
      shell.setActive('reference');
      document.title = `JS → Python reference · ${SITE_NAME}`;
      window.scrollTo({ top: 0 });
      const reference = await renderReference(main, route, isCurrent);
      if (!isCurrent()) {
        reference?.cleanup();
        return;
      }
      view = reference;
      break;
    }
    case 'playground':
      shell.setLayout('wide');
      shell.setActive('playground');
      document.title = `Playground · ${SITE_NAME}`;
      view = { kind: 'other', cleanup: renderPlaygroundPage(main, route.code) };
      window.scrollTo({ top: 0 });
      break;
    default:
      shell.setLayout('wide');
      shell.setActive(null);
      view = notFound(main);
  }
  main.focus({ preventScroll: true });
}

window.addEventListener('hashchange', () => void render(currentRoute()));
void render(currentRoute());

// Copy buttons on every static code block (rendered at build time).
document.addEventListener('click', async (event) => {
  const button = (event.target as HTMLElement).closest<HTMLButtonElement>('[data-copy]');
  if (!button) return;
  const code = button.closest('figure')?.querySelector('pre')?.textContent ?? '';
  if (await copyText(code)) {
    button.dataset.copied = '';
    window.setTimeout(() => delete button.dataset.copied, 1400);
  }
});
