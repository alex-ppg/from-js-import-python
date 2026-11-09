// A coding challenge: description, optional JS version beside the learner's
// Python editor, tests run in Pyodide, progressive hints, and the reference
// solution. Drafts and solved state persist in localStorage.

import type { ChallengeData } from '../../plugins/content/types.ts';
import { createEditor } from '../editor/editor.ts';
import { escapeHtml, h, icon, plural } from '../lib/dom.ts';
import { progress } from '../lib/progress.ts';
import { python, type RunOutcome } from '../python/client.ts';
import type { TestResult } from '../python/types.ts';
import { ConsoleView } from './output.ts';
import { createRunControls, pendingStatus } from './run-button.ts';

const DIFFICULTY_LABEL = { easy: 'Easy', medium: 'Medium', hard: 'Hard' } as const;

export interface ChallengeContext {
  onSolved?: (id: string) => void;
}

/** A button that needs a second click within a few seconds to act. */
function confirmButton(label: string, confirmLabel: string, iconName: string, action: () => void): HTMLButtonElement {
  let armed = 0;
  const button = h('button', { type: 'button', class: 'btn btn-ghost' });
  const render = (text: string) => (button.innerHTML = `${icon(iconName, 15)}<span>${text}</span>`);
  render(label);
  button.addEventListener('click', () => {
    if (armed) {
      window.clearTimeout(armed);
      armed = 0;
      render(label);
      button.classList.remove('is-armed');
      action();
      return;
    }
    render(confirmLabel);
    button.classList.add('is-armed');
    armed = window.setTimeout(() => {
      armed = 0;
      render(label);
      button.classList.remove('is-armed');
    }, 3500);
  });
  return button;
}

export function mountChallenge(host: HTMLElement, data: ChallengeData, context: ChallengeContext = {}): () => void {
  const saved = progress.challenge(data.id);
  let solved = !!saved.solved;
  let hintsShown = Math.min(saved.hints ?? 0, data.hintsHtml.length);
  let saveTimer: number | undefined;
  // Test results streamed during the current run, and the test in progress.
  let streamed: TestResult[] = [];
  let runningTest: string | null = null;

  // ---- header & description -------------------------------------------
  const solvedBadge = h('span', { class: 'ch-solved', html: `${icon('check', 14)}<span>Solved</span>` });
  const head = h(
    'header',
    { class: 'ch-head' },
    h(
      'div',
      { class: 'ch-kicker' },
      h('span', { class: 'ch-kind', html: `${icon('target', 14)}<span>Challenge</span>` }),
      h('span', { class: `difficulty difficulty-${data.difficulty}` }, DIFFICULTY_LABEL[data.difficulty]),
      solvedBadge,
    ),
    h('h3', { class: 'ch-title' }, data.title),
  );
  const description = h('div', { class: 'ch-desc', html: data.descriptionHtml });

  // ---- editor ----------------------------------------------------------
  const editorHost = h('div', { class: 'ch-editor' });
  const resetButton = confirmButton('Reset', 'Discard my code?', 'reset', () => {
    editor.setValue(data.starter);
    progress.saveDraft(data.id, null);
    editor.focus();
  });
  resetButton.classList.add('btn-sm');
  const editorPanel = h(
    'div',
    { class: 'ch-editor-panel' },
    h('div', { class: 'code-head' }, h('span', { class: 'code-lang' }, 'Python'), h('span', { class: 'pg-badge' }, 'your solution'), h('span', { class: 'pg-actions' }, resetButton)),
    editorHost,
  );
  const work = h('div', { class: `ch-work${data.jsHtml ? ' has-js' : ''}` });
  if (data.jsHtml) work.append(h('div', { class: 'ch-js', html: data.jsHtml }));
  work.append(editorPanel);

  // ---- results ---------------------------------------------------------
  const consoleView = new ConsoleView('Your program output');
  const consoleSection = h('div', { class: 'ch-console', hidden: true }, h('div', { class: 'ch-section-label' }, 'Output'), consoleView.el);
  const summary = h('div', { class: 'ch-summary', 'aria-live': 'polite' });
  const testList = h('ol', { class: 'ch-tests' });
  const results = h('div', { class: 'ch-results', hidden: true }, summary, testList, consoleSection);

  // ---- hints, tests & solution -------------------------------------------
  const hints = h('ol', { class: 'ch-hints' });
  const reveal = h('div', { class: 'ch-reveal', hidden: true });
  const hintButton = h('button', { type: 'button', class: 'btn btn-ghost', onclick: () => showHint() });
  const renderHintButton = () => {
    const total = data.hintsHtml.length;
    hintButton.hidden = total === 0;
    hintButton.disabled = hintsShown >= total;
    hintButton.innerHTML = `${icon('bulb', 15)}<span>${hintsShown >= total ? 'No more hints' : `Hint ${hintsShown + 1}/${total}`}</span>`;
  };
  const renderHints = () => {
    hints.replaceChildren(...data.hintsHtml.slice(0, hintsShown).map((html) => h('li', { class: 'ch-hint', html })));
    hints.hidden = hintsShown === 0;
    renderHintButton();
  };
  const showHint = () => {
    if (hintsShown >= data.hintsHtml.length) return;
    hintsShown++;
    progress.setHints(data.id, hintsShown);
    renderHints();
  };

  let revealed: 'tests' | 'solution' | null = null;
  const showReveal = (what: 'tests' | 'solution') => {
    if (revealed === what) {
      revealed = null;
      reveal.hidden = true;
      return;
    }
    revealed = what;
    reveal.hidden = false;
    if (what === 'tests') {
      reveal.innerHTML = data.testsHtml;
      return;
    }
    const load = h('button', {
      type: 'button',
      class: 'btn btn-sm',
      html: `${icon('copy', 14)}<span>Load into editor</span>`,
      onclick: () => {
        editor.setValue(data.solution);
        editor.focus();
      },
    });
    reveal.replaceChildren(h('div', { html: data.solutionHtml }), h('div', { class: 'ch-reveal-actions' }, load));
  };
  const testsButton = h('button', {
    type: 'button',
    class: 'btn btn-ghost',
    html: `${icon('flask', 15)}<span>Tests</span>`,
    onclick: () => showReveal('tests'),
  });
  const solutionButton = confirmButton('Solution', 'Show the solution?', 'eye', () => showReveal('solution'));

  // ---- running -----------------------------------------------------------
  const runTests = createRunControls('Run tests', () => void execute(true));
  const runOnly = createRunControls('Run', () => void execute(false), false);

  const execute = async (withTests: boolean) => {
    const controls = withTests ? runTests : runOnly;
    const other = withTests ? runOnly : runTests;
    other.button.disabled = true;
    results.hidden = false;
    consoleView.clear();
    consoleSection.hidden = true;
    testList.replaceChildren();
    editor.setErrorLine(null);
    summary.className = 'ch-summary is-pending';
    summary.textContent = withTests ? 'Running tests…' : 'Running…';
    controls.setRunning(true);
    controls.setStatus(pendingStatus(), 'busy');
    streamed = [];
    runningTest = null;

    const outcome = await python.run({
      code: editor.getValue(),
      tests: withTests ? data.tests : null,
      onStart: () => controls.setStatus('Running…', 'busy'),
      onTest: (event) => {
        if (event.event === 'start') {
          runningTest = event.name;
          summary.textContent = `Running “${event.name}”…`;
          return;
        }
        runningTest = null;
        streamed.push(event.result);
        testList.append(renderTest(event.result));
      },
      onStdout: (text) => {
        consoleSection.hidden = false;
        consoleView.write(text, 'out');
      },
      onStderr: (text) => {
        consoleSection.hidden = false;
        consoleView.write(text, 'err');
      },
      onInfo: (text) => {
        consoleSection.hidden = false;
        consoleView.write(`${text}\n`, 'info');
      },
    });

    controls.setRunning(false);
    controls.setStatus('');
    other.button.disabled = false;
    editor.setErrorLine(outcome.error?.line ?? null);
    if (withTests) renderTestOutcome(outcome);
    else renderRunOutcome(outcome);
  };

  const renderRunOutcome = (outcome: RunOutcome) => {
    const { label, ok } = consoleView.finish(outcome);
    consoleSection.hidden = false;
    summary.className = `ch-summary ${ok ? 'is-info' : 'is-fail'}`;
    summary.innerHTML = ok
      ? `${icon('terminal', 16)}<span>Ran in ${escapeHtml(label)}. Press <strong>Run tests</strong> to check your solution.</span>`
      : `${icon('x', 16)}<span>${escapeHtml(label)}</span>`;
  };

  const renderTestOutcome = (outcome: RunOutcome) => {
    if (outcome.timedOut || outcome.stopped || outcome.error) {
      consoleSection.hidden = false;
      consoleView.finish(outcome, { quietValue: true });
      summary.className = 'ch-summary is-fail';
      // Tests stream in as they finish, so a timeout can say where it hung.
      const done = streamed.length ? ` ${streamed.filter((t) => t.passed).length} of ${plural(streamed.length, 'finished test')} passed first.` : '';
      const why = outcome.timedOut
        ? runningTest
          ? `The test <strong>“${escapeHtml(runningTest)}”</strong> was still running after 10 seconds: an infinite loop, or an algorithm that's too slow for its input?${done}`
          : 'Your code took longer than 10 seconds. Is there an infinite loop?'
        : outcome.stopped
          ? `Stopped.${done}`
          : `Your code raised <code>${escapeHtml(outcome.error!.type)}</code> before the tests could run.`;
      summary.innerHTML = `${icon('x', 16)}<span>${why}</span>`;
      return;
    }
    if (outcome.testsError) {
      summary.className = 'ch-summary is-fail';
      summary.innerHTML = `${icon('x', 16)}<span>The tests couldn't load: <code>${escapeHtml(outcome.testsError.type)}: ${escapeHtml(outcome.testsError.message)}</code>. Did you rename or remove something the challenge asks for?</span>`;
      return;
    }
    const tests = outcome.tests ?? [];
    const passed = tests.filter((t) => t.passed).length;
    testList.replaceChildren(...tests.map(renderTest));
    const all = tests.length > 0 && passed === tests.length;
    summary.className = `ch-summary ${all ? 'is-pass' : 'is-fail'}`;
    summary.innerHTML = all
      ? `${icon('check', 16)}<span><strong>All ${plural(tests.length, 'test')} passed.</strong> ${solved ? 'Still solved.' : 'Challenge solved!'}</span>`
      : `${icon('x', 16)}<span>${passed} of ${plural(tests.length, 'test')} passed.</span>`;
    if (all && !solved) {
      solved = true;
      progress.markSolved(data.id);
      host.classList.add('is-solved', 'just-solved');
      window.setTimeout(() => host.classList.remove('just-solved'), 1600);
      context.onSolved?.(data.id);
    }
  };

  const renderTest = (test: TestResult) => {
    const item = h(
      'li',
      { class: `ch-test ${test.passed ? 'is-pass' : 'is-fail'}` },
      h('span', { class: 'ch-test-icon', html: icon(test.passed ? 'check' : 'x', 14) }),
      h('span', { class: 'ch-test-name' }, test.name),
    );
    if (!test.passed && test.message) item.append(h('div', { class: 'ch-test-message' }, test.message));
    if (test.output) item.append(h('details', { class: 'ch-test-detail' }, h('summary', null, 'Printed output'), h('pre', null, test.output)));
    if (test.traceback) item.append(h('details', { class: 'ch-test-detail' }, h('summary', null, 'Traceback'), h('pre', null, test.traceback)));
    return item;
  };

  const editor = createEditor({
    parent: editorHost,
    doc: saved.draft ?? data.starter,
    label: `Your solution to ${data.title}`,
    onRun: () => void execute(true),
    onChange: (value) => {
      window.clearTimeout(saveTimer);
      saveTimer = window.setTimeout(() => progress.saveDraft(data.id, value === data.starter ? null : value), 400);
    },
  });

  const toolbar = h(
    'div',
    { class: 'ch-toolbar' },
    runTests.button,
    runOnly.button,
    runTests.status,
    h('span', { class: 'spacer' }),
    hintButton,
    testsButton,
    solutionButton,
  );

  renderHints();
  host.classList.toggle('is-solved', solved);
  host.replaceChildren(head, description, work, toolbar, hints, results, reveal);
  host.classList.add('is-live');

  return () => {
    window.clearTimeout(saveTimer);
    if (editor.getValue() !== data.starter) progress.saveDraft(data.id, editor.getValue());
    editor.destroy();
  };
}
