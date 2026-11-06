// Ctrl/Cmd+K command palette: fuzzy-ish search over lessons, sections,
// challenges, pages and (lazily loaded) reference entries.

import { challenges, lessons, loadReference } from '../content.ts';
import { escapeHtml, h, icon } from '../lib/dom.ts';
import { lessonHref } from '../lib/router.ts';

type Kind = 'page' | 'lesson' | 'section' | 'challenge' | 'reference';

interface Item {
  kind: Kind;
  title: string;
  subtitle: string;
  href: string;
  /** Lower-cased title, for ranking. */
  key: string;
  /** Lower-cased searchable text. */
  haystack: string;
  code?: { js: string; py: string };
}

const KIND_LABEL: Record<Kind, string> = {
  page: 'Page',
  lesson: 'Lesson',
  section: 'Section',
  challenge: 'Challenge',
  reference: 'JS → Py',
};
const KIND_BOOST: Record<Kind, number> = { page: 2, lesson: 3, challenge: 1.5, section: 1, reference: 1.2 };

const stripTags = (html: string) => html.replace(/<[^>]+>/g, '').replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)));

function baseItems(): Item[] {
  const items: Item[] = [
    { kind: 'page', title: 'Home', subtitle: 'Curriculum overview and progress', href: '#/' },
    { kind: 'page', title: 'Practice', subtitle: 'Every challenge in one place', href: '#/practice' },
    { kind: 'page', title: 'Reference', subtitle: 'JS → Python lookup table', href: '#/reference' },
    { kind: 'page', title: 'Playground', subtitle: 'A scratchpad that runs Python', href: '#/playground' },
  ].map((item) => ({ ...(item as Omit<Item, 'key' | 'haystack'>), key: item.title.toLowerCase(), haystack: `${item.title} ${item.subtitle}`.toLowerCase() }));

  for (const lesson of lessons) {
    items.push({
      kind: 'lesson',
      title: lesson.title,
      subtitle: `${String(lesson.order).padStart(2, '0')} · ${lesson.part}`,
      href: lessonHref(lesson.slug),
      key: lesson.title.toLowerCase(),
      haystack: `${lesson.title} ${lesson.summary} ${lesson.slug}`.toLowerCase(),
    });
    for (const entry of lesson.toc) {
      items.push({
        kind: 'section',
        title: entry.text,
        subtitle: lesson.title,
        href: lessonHref(lesson.slug, entry.id),
        key: entry.text.toLowerCase(),
        haystack: `${entry.text} ${lesson.title}`.toLowerCase(),
      });
    }
  }
  for (const challenge of challenges) {
    items.push({
      kind: 'challenge',
      title: challenge.title,
      subtitle: `${challenge.lesson.title} · ${challenge.difficulty}`,
      href: lessonHref(challenge.lesson.slug, challenge.id),
      key: challenge.title.toLowerCase(),
      haystack: `${challenge.title} ${challenge.id} ${challenge.lesson.title} challenge`.toLowerCase(),
    });
  }
  return items;
}

function score(item: Item, terms: string[]): number {
  let total = 0;
  for (const term of terms) {
    const at = item.key.indexOf(term);
    if (at === 0) total += 12;
    else if (at > 0) total += /[a-z0-9]/.test(item.key[at - 1]!) ? 5 : 9;
    else if (item.haystack.includes(term)) total += 2;
    else return 0;
  }
  return total * KIND_BOOST[item.kind] - item.key.length / 200;
}

let dialog: HTMLDialogElement | null = null;
let items: Item[] = [];
let referenceLoaded = false;

function ensureDialog(): HTMLDialogElement {
  if (dialog) return dialog;
  items = baseItems();

  const input = h('input', {
    class: 'palette-input',
    type: 'search',
    placeholder: 'Search lessons, challenges, and JS → Python translations…',
    'aria-label': 'Search',
    autocomplete: 'off',
    spellcheck: 'false',
  });
  const list = h('ul', { class: 'palette-results', role: 'listbox', id: 'palette-results' });
  const footer = h('div', { class: 'palette-footer', html: '<span><kbd>↑</kbd><kbd>↓</kbd> navigate</span><span><kbd>Enter</kbd> open</span><span><kbd>Esc</kbd> close</span>' });
  dialog = h(
    'dialog',
    { class: 'palette', 'aria-label': 'Search' },
    h('div', { class: 'palette-box' }, h('div', { class: 'palette-search', html: icon('search', 18) }, input), list, footer),
  );
  input.setAttribute('aria-controls', 'palette-results');

  let results: Item[] = [];
  let selected = 0;

  const render = () => {
    const query = input.value.trim().toLowerCase();
    const terms = query.split(/\s+/).filter(Boolean);
    results = terms.length
      ? items
          .map((item) => ({ item, s: score(item, terms) }))
          .filter((r) => r.s > 0)
          .sort((a, b) => b.s - a.s)
          .slice(0, 40)
          .map((r) => r.item)
      : items.filter((item) => item.kind === 'page' || item.kind === 'lesson').slice(0, 12);
    selected = Math.min(selected, Math.max(0, results.length - 1));
    list.replaceChildren(
      ...results.map((item, i) => {
        const code = item.code
          ? `<span class="palette-code"><code>${escapeHtml(item.code.js.split('\n')[0]!)}</code><span class="palette-arrow">→</span><code>${escapeHtml(item.code.py.split('\n')[0]!)}</code></span>`
          : '';
        return h('li', {
          role: 'option',
          class: `palette-item${i === selected ? ' is-selected' : ''}`,
          'aria-selected': String(i === selected),
          'data-index': String(i),
          html: `<span class="palette-kind kind-${item.kind}">${KIND_LABEL[item.kind]}</span><span class="palette-main"><span class="palette-title">${escapeHtml(item.title)}</span><span class="palette-sub">${escapeHtml(item.subtitle)}</span>${code}</span>`,
        });
      }),
    );
    if (!results.length) list.append(h('li', { class: 'palette-empty' }, query ? `Nothing matches “${input.value.trim()}”.` : ''));
    list.querySelector('.is-selected')?.scrollIntoView({ block: 'nearest' });
  };

  const open = (index: number) => {
    const item = results[index];
    if (!item) return;
    dialog!.close();
    location.hash = item.href;
  };

  input.addEventListener('input', () => {
    selected = 0;
    render();
  });
  input.addEventListener('keydown', (event) => {
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      const step = event.key === 'ArrowDown' ? 1 : -1;
      selected = (selected + step + results.length) % Math.max(1, results.length);
      render();
    } else if (event.key === 'Enter') {
      event.preventDefault();
      open(selected);
    }
  });
  list.addEventListener('click', (event) => {
    const li = (event.target as HTMLElement).closest<HTMLElement>('[data-index]');
    if (li) open(Number(li.dataset.index));
  });
  list.addEventListener('mousemove', (event) => {
    const li = (event.target as HTMLElement).closest<HTMLElement>('[data-index]');
    if (!li || Number(li.dataset.index) === selected) return;
    selected = Number(li.dataset.index);
    list.querySelectorAll('.palette-item').forEach((el, i) => {
      el.classList.toggle('is-selected', i === selected);
      el.setAttribute('aria-selected', String(i === selected));
    });
  });
  dialog.addEventListener('click', (event) => {
    // A click on the dialog element itself (not its box) is a click on the backdrop.
    if (event.target === event.currentTarget) (event.currentTarget as HTMLDialogElement).close();
  });
  dialog.addEventListener('close', () => {
    input.value = '';
    selected = 0;
  });

  (dialog as HTMLDialogElement & { render?: () => void }).render = render;
  document.body.append(dialog);
  return dialog;
}

export function openPalette(): void {
  const el = ensureDialog() as HTMLDialogElement & { render?: () => void };
  if (el.open) return;
  el.showModal();
  el.render?.();
  el.querySelector('input')?.focus();
  if (!referenceLoaded) {
    referenceLoaded = true;
    loadReference()
      .then((reference) => {
        for (const entry of reference.entries) {
          const title = stripTags(entry.title);
          items.push({
            kind: 'reference',
            title,
            subtitle: entry.category,
            href: `#/reference/${entry.id}`,
            key: title.toLowerCase(),
            haystack: entry.text,
            code: { js: entry.js, py: entry.py },
          });
        }
        if (el.open) el.render?.();
      })
      .catch(() => {
        referenceLoaded = false;
      });
  }
}

export function initPalette(): void {
  window.addEventListener('keydown', (event) => {
    const target = event.target instanceof Element ? event.target : null;
    const typing = !!target?.closest('input, textarea, select, [contenteditable="true"], .cm-editor');
    if ((event.key === 'k' || event.key === 'K') && (event.metaKey || event.ctrlKey)) {
      event.preventDefault();
      openPalette();
    } else if (event.key === '/' && !typing && !event.metaKey && !event.ctrlKey && !event.altKey) {
      event.preventDefault();
      openPalette();
    }
  });
}
