// Multiple-choice "what does this print?" checks. The answer is remembered,
// and quizzes with code can be run to see the real output.

import type { QuizData } from '../../plugins/content/types.ts';
import { h, icon } from '../lib/dom.ts';
import { progress } from '../lib/progress.ts';
import { python } from '../python/client.ts';
import { ConsoleView } from './output.ts';
import { createRunControls, pendingStatus } from './run-button.ts';

const LETTERS = 'ABCDEFGH';

export function mountQuiz(host: HTMLElement, data: QuizData, key: string): () => void {
  const options = h('div', { class: 'quiz-options', role: 'group', 'aria-label': 'Answers' });
  const feedback = h('div', { class: 'quiz-feedback', hidden: true, 'aria-live': 'polite' });
  const buttons: HTMLButtonElement[] = [];

  const reveal = (choice: number, animate: boolean) => {
    const correct = choice === data.correct;
    buttons.forEach((button, i) => {
      button.disabled = true;
      button.classList.toggle('is-correct', i === data.correct);
      button.classList.toggle('is-wrong', i === choice && !correct);
      button.classList.toggle('is-chosen', i === choice);
    });
    feedback.hidden = false;
    feedback.className = `quiz-feedback ${correct ? 'is-correct' : 'is-wrong'}`;
    feedback.innerHTML = `<div class="quiz-verdict">${icon(correct ? 'check' : 'x', 16)}<span>${correct ? 'Correct.' : 'Not quite.'}</span></div>${data.explanationHtml}`;
    host.classList.add('is-answered');
    if (animate && !correct) host.classList.add('shake');
    if (runRow) runRow.hidden = false;
  };

  data.optionsHtml.forEach((html, i) => {
    const button = h('button', {
      type: 'button',
      class: 'quiz-option',
      html: `<span class="quiz-letter">${LETTERS[i]}</span><span class="quiz-text">${html}</span>`,
      onclick: () => {
        progress.answerQuiz(key, i, i === data.correct);
        reveal(i, true);
      },
    });
    buttons.push(button);
    options.append(button);
  });

  let runRow: HTMLElement | null = null;
  if (data.code) {
    const consoleView = new ConsoleView('Quiz output');
    consoleView.el.hidden = true;
    const controls = createRunControls('Run it', async () => {
      consoleView.el.hidden = false;
      consoleView.clear();
      controls.setRunning(true);
      controls.setStatus(pendingStatus(), 'busy');
      const outcome = await python.run({
        code: data.code!,
        onStart: () => controls.setStatus('Running…', 'busy'),
        onStdout: (text) => consoleView.write(text, 'out'),
        onStderr: (text) => consoleView.write(text, 'err'),
      });
      controls.setRunning(false);
      const { label, ok } = consoleView.finish(outcome);
      controls.setStatus(label, ok ? 'ok' : '');
    }, false);
    runRow = h('div', { class: 'quiz-run', hidden: true }, h('div', { class: 'quiz-run-bar' }, controls.button, controls.status), consoleView.el);
  }

  const reset = h('button', {
    type: 'button',
    class: 'link-btn quiz-retry',
    onclick: () => {
      buttons.forEach((button) => {
        button.disabled = false;
        button.classList.remove('is-correct', 'is-wrong', 'is-chosen');
      });
      feedback.hidden = true;
      host.classList.remove('is-answered', 'shake');
      if (runRow) runRow.hidden = true;
    },
  }, 'Try again');

  host.prepend(h('div', { class: 'quiz-label' }, h('span', { html: icon('sparkle', 14) }), 'Quick check'));
  host.append(options, feedback, h('div', { class: 'quiz-footer' }, reset), ...(runRow ? [runRow] : []));
  host.addEventListener('animationend', () => host.classList.remove('shake'));

  const saved = progress.quiz(key);
  if (saved && saved.choice < buttons.length) reveal(saved.choice, false);
  return () => {};
}
