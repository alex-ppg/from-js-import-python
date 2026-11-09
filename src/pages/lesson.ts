import { hydrate } from '../components/hydrate.ts';
import { REPO_URL } from '../config.ts';
import { courseMeta, lessonMeta, loadLesson, neighbours, partOf, partsOf, type LessonMeta } from '../content.ts';
import { h, icon, plural, whenIdle } from '../lib/dom.ts';
import { progress } from '../lib/progress.ts';
import { courseHref, lessonHref } from '../lib/router.ts';
import { python } from '../python/client.ts';

export interface LessonView {
  kind: 'lesson';
  slug: string;
  meta: LessonMeta;
  scrollTo(anchor: string | null, smooth?: boolean): void;
  cleanup(): void;
}

function skeleton(): HTMLElement {
  return h(
    'div',
    { class: 'lesson-layout is-loading', 'aria-busy': 'true' },
    h('article', { class: 'lesson' }, h('div', { class: 'skeleton skeleton-title' }), ...Array.from({ length: 6 }, () => h('div', { class: 'skeleton skeleton-line' }))),
  );
}

function tocList(meta: LessonMeta, className: string): HTMLOListElement {
  return h(
    'ol',
    { class: className },
    ...meta.toc.map((entry) =>
      h('li', { class: `toc-l${entry.level}` }, h('a', { href: lessonHref(meta.slug, entry.id), 'data-id': entry.id, html: entry.html })),
    ),
  );
}

export async function renderLesson(main: HTMLElement, slug: string, isCurrent: () => boolean): Promise<LessonView | null> {
  const meta = lessonMeta(slug);
  if (!meta) return null;
  main.replaceChildren(skeleton());
  const compiled = await loadLesson(slug);
  if (!compiled || !isCurrent()) return null;

  progress.visit(slug);
  const part = partOf(meta);
  const course = courseMeta(meta.course);
  const multiPart = partsOf(meta.course).length > 1;
  const { prev, next } = neighbours(slug);

  // ---- header ----------------------------------------------------------------
  const facts = [
    `${icon('clock', 15)}<span>${meta.minutes} min</span>`,
    meta.challenges.length ? `${icon('target', 15)}<span>${plural(meta.challenges.length, 'challenge')}</span>` : '',
    meta.quizCount ? `${icon('sparkle', 15)}<span>${plural(meta.quizCount, 'quiz', 'quizzes')}</span>` : '',
    meta.playgroundCount ? `${icon('play', 15)}<span>${plural(meta.playgroundCount, 'live snippet')}</span>` : '',
  ].filter(Boolean);
  const header = h(
    'header',
    { class: 'lesson-header' },
    h(
      'div',
      { class: 'lesson-kicker' },
      h(
        'span',
        { class: 'lesson-kicker-path' },
        course ? h('a', { href: courseHref(course.id) }, course.title) : null,
        multiPart ? h('span', null, ` · Part ${part?.index ?? ''}: ${meta.part}`) : null,
      ),
      h('span', { class: 'lesson-number' }, `Lesson ${meta.order}`),
    ),
    h('h1', { class: 'lesson-title' }, meta.title),
    h('p', { class: 'lesson-summary' }, meta.summary),
    h('div', { class: 'lesson-facts', html: facts.map((f) => `<span class="fact">${f}</span>`).join('') }),
    meta.toc.length ? h('details', { class: 'toc-inline' }, h('summary', null, 'On this page'), tocList(meta, 'toc-list')) : null,
  );

  // ---- body ------------------------------------------------------------------
  const content = h('div', { class: 'prose lesson-body', html: compiled.html });

  // ---- footer ----------------------------------------------------------------
  const completeButton = h('button', { type: 'button', class: 'btn' });
  const completeNote = h('p', { class: 'complete-note' });
  const renderComplete = () => {
    const done = !!progress.lesson(slug).completed;
    const solved = meta.challenges.filter((c) => progress.challenge(c.id).solved).length;
    const answers = Array.from({ length: meta.quizCount }, (_, i) => progress.quiz(`${slug}:${i}`)).filter((a) => a !== undefined);
    const right = answers.filter((a) => a.correct).length;
    completeButton.className = `btn ${done ? 'btn-success' : 'btn-primary'}`;
    completeButton.innerHTML = done ? `${icon('check', 16)}<span>Completed</span>` : `${icon('check', 16)}<span>Mark lesson as complete</span>`;
    completeButton.setAttribute('aria-pressed', String(done));
    const facts = [
      meta.challenges.length ? `${solved} of ${plural(meta.challenges.length, 'challenge')} solved` : '',
      meta.quizCount ? `${right} of ${plural(meta.quizCount, 'quiz', 'quizzes')} answered correctly` : '',
    ].filter(Boolean);
    completeNote.textContent = [facts.length ? `${facts.join(' · ')}.` : '', done ? 'Click the button again to mark as not done.' : ''].filter(Boolean).join(' ');
  };
  completeButton.addEventListener('click', () => progress.setCompleted(slug, !progress.lesson(slug).completed));
  renderComplete();
  const unsubscribe = progress.subscribe(renderComplete);

  const pagerLink = (lesson: LessonMeta | undefined, direction: 'prev' | 'next') =>
    lesson
      ? h(
          'a',
          { class: `pager-link pager-${direction}`, href: lessonHref(lesson.slug), rel: direction },
          h('span', { class: 'pager-label', html: direction === 'prev' ? `${icon('left', 14)}<span>Previous</span>` : `<span>Next</span>${icon('right', 14)}` }),
          h('span', { class: 'pager-title' }, lesson.title),
        )
      : h('span');

  const footer = h(
    'footer',
    { class: 'lesson-footer' },
    h('div', { class: 'complete-card' }, h('div', null, h('h2', { class: 'complete-title' }, 'Finished this lesson?'), completeNote), completeButton),
    h('nav', { class: 'pager', 'aria-label': 'Lesson navigation' }, pagerLink(prev, 'prev'), pagerLink(next, 'next')),
    h('p', { class: 'lesson-edit' }, h('a', { href: `${REPO_URL}/blob/main/content/courses/${meta.course}/${meta.fileName}`, target: '_blank', rel: 'noopener noreferrer', html: `${icon('code', 14)}<span>Suggest an edit on GitHub</span>` })),
  );

  const article = h('article', { class: 'lesson' }, header, content, footer);
  const toc = meta.toc.length
    ? h('aside', { class: 'toc', 'aria-label': 'On this page' }, h('div', { class: 'toc-title' }, 'On this page'), tocList(meta, 'toc-list'))
    : null;
  main.replaceChildren(h('div', { class: 'lesson-layout' }, article, toc));

  const hydration = hydrate(content, compiled, {
    quizKey: (index) => `${slug}:${index}`,
    onSolved: () => {
      if (meta.challenges.every((c) => progress.challenge(c.id).solved)) progress.setCompleted(slug, true);
    },
  });

  // ---- scroll spy ------------------------------------------------------------
  const tocLinks = new Map<string, HTMLAnchorElement[]>();
  main.querySelectorAll<HTMLAnchorElement>('.toc-list a[data-id]').forEach((a) => {
    tocLinks.set(a.dataset.id!, [...(tocLinks.get(a.dataset.id!) ?? []), a]);
  });
  const headings = [...content.querySelectorAll<HTMLElement>('h2[id], h3[id]')];
  const visible = new Set<Element>();
  const spy = new IntersectionObserver(
    (entries) => {
      for (const entry of entries) {
        if (entry.isIntersecting) visible.add(entry.target);
        else visible.delete(entry.target);
      }
      // The active section is the last heading above the reading line.
      const line = 120;
      let active: HTMLElement | undefined;
      for (const heading of headings) {
        if (heading.getBoundingClientRect().top <= line) active = heading;
        else break;
      }
      active ??= headings[0];
      main.querySelectorAll('.toc-list a.is-active').forEach((a) => a.classList.remove('is-active'));
      for (const link of tocLinks.get(active?.id ?? '') ?? []) {
        link.classList.add('is-active');
        if (link.closest('.toc')) link.scrollIntoView({ block: 'nearest' });
      }
    },
    { rootMargin: '-100px 0px -40% 0px', threshold: [0, 1] },
  );
  headings.forEach((heading) => spy.observe(heading));

  if (compiled.playgrounds.length || compiled.challenges.length) whenIdle(() => python.warmup(), 2500);

  const scrollTo = (anchor: string | null, smooth = false) => {
    if (!anchor) {
      window.scrollTo({ top: 0 });
      return;
    }
    const target = content.querySelector<HTMLElement>(`#${CSS.escape(anchor)}`) ?? content.querySelector<HTMLElement>(`#challenge-${CSS.escape(anchor)}`);
    if (!target) return;
    hydration.ensure(target);
    target.scrollIntoView({ behavior: smooth ? 'smooth' : 'auto', block: 'start' });
    if (!smooth) {
      // Editors mounting above the target can still nudge it; settle once more.
      window.setTimeout(() => {
        const offset = target.getBoundingClientRect().top - (parseFloat(getComputedStyle(target).scrollMarginTop) || 0);
        if (Math.abs(offset) > 4) target.scrollIntoView({ block: 'start' });
      }, 120);
    }
    target.classList.remove('flash-target');
    void target.offsetWidth;
    target.classList.add('flash-target');
    main.querySelector<HTMLDetailsElement>('.toc-inline')?.removeAttribute('open');
  };

  return {
    kind: 'lesson',
    slug,
    meta,
    scrollTo,
    cleanup() {
      unsubscribe();
      spy.disconnect();
      hydration.destroy();
    },
  };
}
