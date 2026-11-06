import { loadReference, type ReferenceEntry } from '../content.ts';
import { h } from '../lib/dom.ts';
import type { Route } from '../lib/router.ts';

export interface ReferenceView {
  kind: 'reference';
  update(route: Extract<Route, { name: 'reference' }>): void;
  cleanup(): void;
}

export async function renderReference(main: HTMLElement, route: Extract<Route, { name: 'reference' }>, isCurrent: () => boolean): Promise<ReferenceView | null> {
  const input = h('input', {
    class: 'ref-search',
    type: 'search',
    placeholder: 'Search: map, padStart, Promise.all, ?., typeof…',
    'aria-label': 'Search the reference',
    autocomplete: 'off',
    spellcheck: 'false',
  });
  input.value = route.query;
  const chips = h('div', { class: 'chips ref-chips', role: 'radiogroup', 'aria-label': 'Category' });
  const count = h('p', { class: 'ref-count', 'aria-live': 'polite' });
  const body = h('div', { class: 'ref-body' }, h('div', { class: 'skeleton skeleton-demo' }));

  main.replaceChildren(
    h(
      'div',
      { class: 'page page-reference' },
      h(
        'header',
        { class: 'page-header' },
        h('p', { class: 'eyebrow' }, 'Reference'),
        h('h1', null, 'JS → Python, at a glance'),
        h('p', { class: 'page-lede' }, 'A searchable Rosetta stone. Look up the JavaScript you would write and get the idiomatic Python, plus the catch. Press / anywhere to search the whole site.'),
        h('div', { class: 'ref-controls' }, input, count),
        chips,
      ),
      body,
    ),
  );

  let reference;
  try {
    reference = await loadReference();
  } catch {
    body.replaceChildren(h('p', { class: 'empty' }, 'The reference could not be loaded.'));
    return { kind: 'reference', update() {}, cleanup() {} };
  }
  if (!isCurrent()) return null;

  let category = 'All';
  const entryEls = new Map<string, HTMLElement>();
  const sections: Array<{ el: HTMLElement; category: string; entries: Array<{ entry: ReferenceEntry; el: HTMLElement }> }> = [];

  body.replaceChildren();
  for (const name of reference.categories) {
    const section = h('section', { class: 'ref-section' }, h('h2', { class: 'ref-category' }, name));
    const items: Array<{ entry: ReferenceEntry; el: HTMLElement }> = [];
    for (const entry of reference.entries.filter((e) => e.category === name)) {
      const el = h(
        'article',
        { class: 'ref-entry', id: `ref-${entry.id}` },
        h('h3', { class: 'ref-title' }, h('a', { href: `#/reference/${entry.id}`, html: entry.title })),
        h(
          'div',
          { class: 'ref-grid' },
          h('div', { class: 'ref-side ref-js' }, h('span', { class: 'ref-side-label' }, 'JavaScript'), h('div', { html: entry.jsHtml })),
          h('div', { class: 'ref-side ref-py' }, h('span', { class: 'ref-side-label' }, 'Python'), h('div', { html: entry.pyHtml })),
        ),
        entry.noteHtml ? h('div', { class: 'ref-note', html: entry.noteHtml }) : null,
      );
      entryEls.set(entry.id, el);
      items.push({ entry, el });
      section.append(el);
    }
    sections.push({ el: section, category: name, entries: items });
    body.append(section);
  }
  body.append(h('p', { class: 'empty', hidden: true, id: 'ref-empty' }, 'No entries match. Try a shorter query or another category.'));

  const renderChips = () =>
    chips.replaceChildren(
      ...['All', ...reference.categories].map((name) =>
        h('button', {
          type: 'button',
          role: 'radio',
          'aria-checked': String(name === category),
          class: `chip${name === category ? ' is-active' : ''}`,
          onclick: () => {
            category = name;
            renderChips();
            filter();
          },
        }, name),
      ),
    );

  const filter = () => {
    const terms = input.value.trim().toLowerCase().split(/\s+/).filter(Boolean);
    let shown = 0;
    for (const section of sections) {
      let sectionShown = 0;
      for (const { entry, el } of section.entries) {
        const visible = (category === 'All' || section.category === category) && terms.every((t) => entry.text.includes(t));
        el.hidden = !visible;
        if (visible) sectionShown++;
      }
      section.el.hidden = sectionShown === 0;
      shown += sectionShown;
    }
    count.textContent = `${shown} of ${reference.entries.length} entries`;
    body.querySelector<HTMLElement>('#ref-empty')!.hidden = shown > 0;
  };

  let syncTimer: number | undefined;
  input.addEventListener('input', () => {
    filter();
    window.clearTimeout(syncTimer);
    syncTimer = window.setTimeout(() => {
      const q = input.value.trim();
      history.replaceState(null, '', q ? `#/reference?q=${encodeURIComponent(q)}` : '#/reference');
    }, 300);
  });

  const focusEntry = (id: string | null) => {
    if (!id) return;
    const el = entryEls.get(id);
    if (!el) return;
    if (el.hidden) {
      input.value = '';
      category = 'All';
      renderChips();
      filter();
    }
    el.scrollIntoView({ block: 'start' });
    el.classList.remove('flash-target');
    void el.offsetWidth;
    el.classList.add('flash-target');
  };

  renderChips();
  filter();
  if (route.entry) focusEntry(route.entry);
  else if (!route.query) input.focus({ preventScroll: true });

  return {
    kind: 'reference',
    update(next) {
      if (next.entry) focusEntry(next.entry);
      else if (next.query !== input.value) {
        input.value = next.query;
        filter();
      }
    },
    cleanup() {
      window.clearTimeout(syncTimer);
    },
  };
}
