// Review: a quiz session drawn from every lesson (missed and unanswered
// questions first) and Leitner-box flashcards built from the reference.

import { mountQuiz } from '../components/quiz.ts';
import { courseMeta, courses, lessons, loadLesson, loadReference, type LessonMeta, type QuizData, type ReferenceEntry } from '../content.ts';
import { h, icon, plural } from '../lib/dom.ts';
import { MAX_BOX, progress } from '../lib/progress.ts';
import type { ReviewMode } from '../lib/router.ts';
import { lessonHref } from '../lib/router.ts';

const SESSION_QUIZZES = 10;
const SESSION_CARDS = 20;

export function renderReview(main: HTMLElement, mode: ReviewMode): () => void {
  if (mode === 'quiz') return renderQuizReview(main);
  if (mode === 'flashcards') return renderFlashcards(main);
  return renderHub(main);
}

function pageHeader(title: string, lede: string, back = true): HTMLElement {
  return h(
    'header',
    { class: 'page-header' },
    back ? h('a', { class: 'back-link', href: '#/review', html: `${icon('left', 14)}<span>Review</span>` }) : h('p', { class: 'eyebrow' }, 'Review'),
    h('h1', null, title),
    h('p', { class: 'page-lede' }, lede),
  );
}

// ---- hub -------------------------------------------------------------------

function quizKeys(filter: (lesson: LessonMeta) => boolean = () => true) {
  return lessons.filter(filter).flatMap((lesson) => Array.from({ length: lesson.quizCount }, (_, index) => ({ lesson, index, key: `${lesson.slug}:${index}` })));
}

function renderHub(main: HTMLElement): () => void {
  const all = quizKeys();
  const answered = all.filter((q) => progress.quiz(q.key));
  const correct = answered.filter((q) => progress.quiz(q.key)?.correct);
  const missed = answered.length - correct.length;

  const cards = h('div', { class: 'cards-count' }, 'Loading flashcards…');
  loadReference()
    .then((reference) => {
      const known = reference.entries.filter((e) => (progress.card(e.id)?.box ?? 0) >= MAX_BOX).length;
      const seen = reference.entries.filter((e) => progress.card(e.id)).length;
      cards.textContent = `${reference.entries.length} cards · ${seen} seen · ${known} mastered`;
    })
    .catch(() => (cards.textContent = 'The reference could not be loaded.'));

  main.replaceChildren(
    h(
      'div',
      { class: 'page page-review' },
      pageHeader('Make it stick', 'Short, spaced sessions beat rereading. Quizzes come from every lesson, and the ones you missed or skipped come back first. Flashcards drill the JS → Python reference.', false),
      h(
        'div',
        { class: 'review-modes' },
        h(
          'a',
          { class: 'review-mode', href: '#/review/quiz' },
          h('span', { class: 'feature-icon', html: icon('sparkle', 22) }),
          h('span', { class: 'review-mode-title' }, 'Quiz review'),
          h('span', { class: 'review-mode-text' }, `${SESSION_QUIZZES} questions per session, drawn from ${plural(all.length, 'quiz', 'quizzes')} across ${plural(courses.length, 'course')}. Missed and unanswered questions come first.`),
          h('span', { class: 'review-mode-stats' }, `${answered.length} answered · ${correct.length} correct · ${missed} to revisit`),
          h('span', { class: 'btn btn-primary', html: `<span>Start a review</span>${icon('arrow', 16)}` }),
        ),
        h(
          'a',
          { class: 'review-mode', href: '#/review/flashcards' },
          h('span', { class: 'feature-icon', html: icon('list', 22) }),
          h('span', { class: 'review-mode-title' }, 'Flashcards'),
          h('span', { class: 'review-mode-text' }, `See the JavaScript, recall the Python. Cards you know move up a box and come back less often; misses go back to box 1. ${SESSION_CARDS} cards per session.`),
          h('span', { class: 'review-mode-stats' }, cards),
          h('span', { class: 'btn btn-primary', html: `<span>Study flashcards</span>${icon('arrow', 16)}` }),
        ),
      ),
    ),
  );
  return () => {};
}

// ---- quiz review --------------------------------------------------------------

interface SessionQuiz {
  lesson: LessonMeta;
  index: number;
  key: string;
  data: QuizData;
}

function renderQuizReview(main: HTMLElement): () => void {
  let course = 'all';
  let scope: 'visited' | 'all' = lessons.some((l) => progress.lesson(l.slug).visited) ? 'visited' : 'all';
  let cancelled = false;
  let keyHandler: ((event: KeyboardEvent) => void) | null = null;

  const body = h('div', { class: 'review-body' });

  const pool = () =>
    quizKeys((lesson) => (course === 'all' || lesson.course === course) && (scope === 'all' || !!progress.lesson(lesson.slug).visited));

  const chip = (label: string, active: boolean, onclick: () => void) =>
    h('button', { type: 'button', class: `chip${active ? ' is-active' : ''}`, role: 'radio', 'aria-checked': String(active), onclick }, label);

  const renderSetup = () => {
    const available = pool();
    const missed = available.filter((q) => progress.quiz(q.key)?.correct === false).length;
    const fresh = available.filter((q) => !progress.quiz(q.key)).length;
    const start = h('button', {
      type: 'button',
      class: 'btn btn-primary btn-lg',
      disabled: available.length === 0,
      html: `${icon('play', 16)}<span>Start ${Math.min(SESSION_QUIZZES, available.length)} questions</span>`,
      onclick: () => void startSession(),
    });
    body.replaceChildren(
      h(
        'div',
        { class: 'review-setup' },
        h(
          'div',
          { class: 'filters' },
          h(
            'div',
            { class: 'chips', role: 'radiogroup', 'aria-label': 'Course' },
            chip('All courses', course === 'all', () => ((course = 'all'), renderSetup())),
            ...courses.map((c) => chip(c.title, course === c.id, () => ((course = c.id), renderSetup()))),
          ),
        ),
        h(
          'div',
          { class: 'filters' },
          h('div', { class: 'chips', role: 'radiogroup', 'aria-label': 'Scope' }, chip("Lessons I've opened", scope === 'visited', () => ((scope = 'visited'), renderSetup())), chip('Everything', scope === 'all', () => ((scope = 'all'), renderSetup()))),
        ),
        h(
          'p',
          { class: 'review-pool' },
          available.length
            ? `${plural(available.length, 'quiz', 'quizzes')} in scope: ${missed} missed before, ${fresh} never answered.`
            : scope === 'visited'
              ? "You haven't opened any lessons in this scope yet. Switch to “Everything”, or open a lesson first."
              : 'No quizzes in this scope yet.',
        ),
        start,
      ),
    );
  };

  const startSession = async () => {
    // Priority: missed (0), never answered (1), answered correctly (2), with a random tiebreak.
    const ranked = pool()
      .map((q) => {
        const saved = progress.quiz(q.key);
        return { q, rank: (saved ? (saved.correct ? 2 : 0) : 1) + Math.random() };
      })
      .sort((a, b) => a.rank - b.rank)
      .slice(0, SESSION_QUIZZES)
      .map((r) => r.q);
    // Shuffle the chosen set so lessons interleave.
    for (let i = ranked.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [ranked[i], ranked[j]] = [ranked[j]!, ranked[i]!];
    }
    body.replaceChildren(h('div', { class: 'skeleton skeleton-demo' }));
    const compiled = new Map<string, Awaited<ReturnType<typeof loadLesson>>>();
    await Promise.all([...new Set(ranked.map((q) => q.lesson.slug))].map(async (slug) => compiled.set(slug, await loadLesson(slug))));
    if (cancelled) return;
    const session: SessionQuiz[] = ranked.flatMap((q) => {
      const data = compiled.get(q.lesson.slug)?.quizzes[q.index];
      return data ? [{ ...q, data }] : [];
    });
    runSession(session);
  };

  const runSession = (session: SessionQuiz[]) => {
    let position = 0;
    const results: boolean[] = [];

    const showQuestion = () => {
      const item = session[position]!;
      let answered = false;
      const next = h('button', {
        type: 'button',
        class: 'btn btn-primary',
        disabled: true,
        html: position === session.length - 1 ? `<span>See results</span>${icon('arrow', 16)}` : `<span>Next question</span>${icon('arrow', 16)}`,
        onclick: () => advance(),
      });
      const advance = () => {
        if (!answered) return;
        position++;
        if (position < session.length) showQuestion();
        else showSummary();
      };
      keyHandler = (event: KeyboardEvent) => {
        const target = event.target instanceof Element ? event.target : null;
        if (event.key === 'Enter' && answered && !target?.closest('.cm-editor, input, textarea')) {
          event.preventDefault();
          advance();
        }
      };
      const score = h('span', { class: 'review-score' }, `${results.filter(Boolean).length} correct`);
      const host = h('div', { class: 'quiz' }, h('div', { class: 'quiz-question', html: item.data.questionHtml }));
      mountQuiz(host, item.data, item.key, {
        fresh: true,
        onAnswer: (correct) => {
          if (answered) return;
          answered = true;
          results.push(correct);
          next.disabled = false;
          score.textContent = `${results.filter(Boolean).length} correct`;
          next.focus();
        },
      });
      const owner = courseMeta(item.lesson.course);
      body.replaceChildren(
        h(
          'div',
          { class: 'review-session' },
          h(
            'div',
            { class: 'review-progress' },
            h('span', null, `Question ${position + 1} of ${session.length}`),
            score,
            h('div', { class: 'meter-track' }, h('div', { class: 'meter-fill', style: `width:${(position / session.length) * 100}%` })),
          ),
          h('p', { class: 'review-source' }, 'From ', h('a', { href: lessonHref(item.lesson.slug) }, item.lesson.title), owner ? ` · ${owner.title}` : ''),
          host,
          h('div', { class: 'review-actions' }, next),
        ),
      );
    };

    const showSummary = () => {
      keyHandler = null;
      const right = results.filter(Boolean).length;
      const missed = session.filter((_, i) => !results[i]);
      const lessonsToRevisit = [...new Map(missed.map((m) => [m.lesson.slug, m.lesson])).values()];
      body.replaceChildren(
        h(
          'div',
          { class: 'review-summary' },
          h('div', { class: `review-result ${right === session.length ? 'is-perfect' : ''}` }, h('span', { class: 'review-result-score' }, `${right}/${session.length}`), h('span', null, right === session.length ? 'Perfect session.' : right >= session.length * 0.7 ? 'Solid. A few to revisit.' : 'Worth another pass.')),
          lessonsToRevisit.length
            ? h(
                'div',
                { class: 'review-revisit' },
                h('h2', null, 'Revisit'),
                h('ul', null, ...lessonsToRevisit.map((lesson) => h('li', null, h('a', { href: lessonHref(lesson.slug) }, lesson.title), ` · ${courseMeta(lesson.course)?.title ?? ''}`))),
              )
            : null,
          h(
            'div',
            { class: 'review-actions' },
            h('button', { type: 'button', class: 'btn btn-primary', html: `${icon('reset', 16)}<span>Another session</span>`, onclick: () => void startSession() }),
            h('button', { type: 'button', class: 'btn', onclick: () => renderSetup() }, 'Change scope'),
          ),
        ),
      );
    };

    showQuestion();
  };

  const onKey = (event: KeyboardEvent) => keyHandler?.(event);
  window.addEventListener('keydown', onKey);

  main.replaceChildren(
    h('div', { class: 'page page-review' }, pageHeader('Quiz review', `${SESSION_QUIZZES} questions per session. Missed and unanswered questions come first. Press Enter for the next one.`), body),
  );
  renderSetup();
  return () => {
    cancelled = true;
    window.removeEventListener('keydown', onKey);
  };
}

// ---- flashcards -----------------------------------------------------------------

function renderFlashcards(main: HTMLElement): () => void {
  let category = 'All';
  let cancelled = false;
  let onKey: ((event: KeyboardEvent) => void) | null = null;
  const body = h('div', { class: 'review-body' }, h('div', { class: 'skeleton skeleton-demo' }));

  main.replaceChildren(
    h(
      'div',
      { class: 'page page-review' },
      pageHeader('Flashcards', 'See the JavaScript, recall the Python, then check. Space flips the card; 1 means "again" and 2 means "got it".'),
      body,
    ),
  );

  const listener = (event: KeyboardEvent) => onKey?.(event);
  window.addEventListener('keydown', listener);

  loadReference()
    .then((reference) => {
      if (cancelled) return;
      const entries = reference.entries;

      const boxCounts = (scoped: ReferenceEntry[]) => {
        const counts = Array.from({ length: MAX_BOX + 1 }, () => 0);
        for (const e of scoped) counts[progress.card(e.id)?.box ?? 0]!++;
        return counts;
      };

      const renderSetup = () => {
        onKey = null;
        const scoped = entries.filter((e) => category === 'All' || e.category === category);
        const counts = boxCounts(scoped);
        body.replaceChildren(
          h(
            'div',
            { class: 'review-setup' },
            h(
              'div',
              { class: 'chips', role: 'radiogroup', 'aria-label': 'Category' },
              ...['All', ...reference.categories].map((name) =>
                h('button', { type: 'button', class: `chip${name === category ? ' is-active' : ''}`, role: 'radio', 'aria-checked': String(name === category), onclick: () => ((category = name), renderSetup()) }, name),
              ),
            ),
            h(
              'div',
              { class: 'leitner' },
              ...counts.map((count, box) =>
                h('div', { class: `leitner-box box-${box}` }, h('span', { class: 'leitner-count' }, String(count)), h('span', { class: 'leitner-label' }, box === 0 ? 'New' : box === MAX_BOX ? 'Mastered' : `Box ${box}`)),
              ),
            ),
            h('button', { type: 'button', class: 'btn btn-primary btn-lg', disabled: scoped.length === 0, html: `${icon('play', 16)}<span>Study ${Math.min(SESSION_CARDS, scoped.length)} cards</span>`, onclick: () => study(scoped) }),
          ),
        );
      };

      const study = (scoped: ReferenceEntry[]) => {
        // Lowest box first (missed and new cards), least recently seen first, random tiebreak.
        const deck = scoped
          .map((e) => {
            const card = progress.card(e.id);
            return { e, rank: (card?.box ?? 0.5) * 1e13 + (card?.last ?? 0) + Math.random() * 1e6 };
          })
          .sort((a, b) => a.rank - b.rank)
          .slice(0, SESSION_CARDS)
          .map((r) => r.e);
        let position = 0;
        let knew = 0;

        const show = () => {
          const entry = deck[position]!;
          let flipped = false;
          const back = h('div', { class: 'flashcard-back', hidden: true }, h('span', { class: 'ref-side-label' }, 'Python'), h('div', { html: entry.pyHtml }), entry.noteHtml ? h('div', { class: 'ref-note', html: entry.noteHtml }) : null);
          const flip = h('button', { type: 'button', class: 'btn btn-primary', html: `${icon('eye', 16)}<span>Show the Python</span><kbd>Space</kbd>`, onclick: () => doFlip() });
          const again = h('button', { type: 'button', class: 'btn', hidden: true, html: `${icon('reset', 16)}<span>Again</span><kbd>1</kbd>`, onclick: () => grade(false) });
          const gotIt = h('button', { type: 'button', class: 'btn btn-success', hidden: true, html: `${icon('check', 16)}<span>Got it</span><kbd>2</kbd>`, onclick: () => grade(true) });
          const doFlip = () => {
            if (flipped) return;
            flipped = true;
            back.hidden = false;
            flip.hidden = true;
            again.hidden = false;
            gotIt.hidden = false;
            gotIt.focus();
          };
          const grade = (knewIt: boolean) => {
            if (!flipped) return;
            progress.gradeCard(entry.id, knewIt);
            if (knewIt) knew++;
            position++;
            if (position < deck.length) show();
            else done();
          };
          onKey = (event) => {
            const target = event.target instanceof Element ? event.target : null;
            if (target?.closest('input, textarea, .cm-editor')) return;
            if (event.key === ' ' || event.key === 'Enter') {
              event.preventDefault();
              if (!flipped) doFlip();
              else if (event.key === 'Enter') grade(true);
            } else if (flipped && event.key === '1') grade(false);
            else if (flipped && event.key === '2') grade(true);
          };
          const box = progress.card(entry.id)?.box ?? 0;
          body.replaceChildren(
            h(
              'div',
              { class: 'review-session' },
              h(
                'div',
                { class: 'review-progress' },
                h('span', null, `Card ${position + 1} of ${deck.length}`),
                h('span', { class: 'review-score' }, `${knew} known`),
                h('div', { class: 'meter-track' }, h('div', { class: 'meter-fill', style: `width:${(position / deck.length) * 100}%` })),
              ),
              h(
                'article',
                { class: 'flashcard' },
                h('div', { class: 'flashcard-meta' }, h('span', null, entry.category), h('span', { class: 'flashcard-box' }, box ? `Box ${box}` : 'New')),
                h('h2', { class: 'flashcard-title', html: entry.title }),
                h('div', { class: 'flashcard-front' }, h('span', { class: 'ref-side-label ref-js-label' }, 'JavaScript'), h('div', { html: entry.jsHtml })),
                back,
              ),
              h('div', { class: 'review-actions' }, flip, again, gotIt),
            ),
          );
          flip.focus();
        };

        const done = () => {
          onKey = null;
          body.replaceChildren(
            h(
              'div',
              { class: 'review-summary' },
              h('div', { class: 'review-result' }, h('span', { class: 'review-result-score' }, `${knew}/${deck.length}`), h('span', null, 'cards known this session')),
              h(
                'div',
                { class: 'review-actions' },
                h('button', { type: 'button', class: 'btn btn-primary', html: `${icon('reset', 16)}<span>Another session</span>`, onclick: () => study(entries.filter((e) => category === 'All' || e.category === category)) }),
                h('button', { type: 'button', class: 'btn', onclick: () => renderSetup() }, 'Change deck'),
                h('a', { class: 'btn btn-ghost', href: '#/reference' }, 'Open the reference'),
              ),
            ),
          );
        };

        if (deck.length) show();
      };

      renderSetup();
    })
    .catch(() => {
      body.replaceChildren(h('p', { class: 'empty' }, 'The reference could not be loaded.'));
    });

  return () => {
    cancelled = true;
    window.removeEventListener('keydown', listener);
  };
}

export function reviewTitle(mode: ReviewMode): string {
  return mode === 'quiz' ? 'Quiz review' : mode === 'flashcards' ? 'Flashcards' : 'Review';
}
