// Turn compiled HTML placeholders into live widgets. Quizzes and challenges
// mount eagerly (few per page, and challenge placeholders are much shorter
// than the real thing, so lazy mounting would shift anchors); playgrounds
// mount as they approach the viewport.

import type { CompiledBody } from '../../plugins/content/types.ts';
import { mountChallenge, type ChallengeContext } from './challenge.ts';
import { mountPlayground } from './playground.ts';
import { mountQuiz } from './quiz.ts';

export interface Hydration {
  /** Mount an element now (e.g. an anchor target we're about to scroll to). */
  ensure(element: Element): void;
  destroy(): void;
}

export function hydrate(root: HTMLElement, body: CompiledBody, options: { quizKey: (index: number) => string } & ChallengeContext): Hydration {
  const cleanups: Array<() => void> = [];
  const mounted = new WeakSet<Element>();

  const mount = (element: Element) => {
    if (mounted.has(element)) return;
    mounted.add(element);
    const el = element as HTMLElement;
    if (el.dataset.pg !== undefined) {
      const data = body.playgrounds[Number(el.dataset.pg)];
      if (data) cleanups.push(mountPlayground(el, data));
    } else if (el.dataset.quiz !== undefined) {
      const index = Number(el.dataset.quiz);
      const data = body.quizzes[index];
      if (data) cleanups.push(mountQuiz(el, data, options.quizKey(index)));
    } else if (el.dataset.challenge !== undefined) {
      const data = body.challenges.find((c) => c.id === el.dataset.challenge);
      if (data) cleanups.push(mountChallenge(el, data, options));
    }
  };

  const observer = new IntersectionObserver(
    (entries) => {
      for (const entry of entries) {
        if (!entry.isIntersecting) continue;
        observer.unobserve(entry.target);
        mount(entry.target);
      }
    },
    { rootMargin: '800px 0px' },
  );

  root.querySelectorAll('.quiz[data-quiz], .challenge[data-challenge]').forEach(mount);
  root.querySelectorAll('.pg[data-pg]').forEach((el) => observer.observe(el));

  return {
    ensure(element) {
      element.querySelectorAll('.pg[data-pg]').forEach(mount);
      if (element.matches('.pg[data-pg]')) mount(element);
    },
    destroy() {
      observer.disconnect();
      for (const cleanup of cleanups) cleanup();
    },
  };
}
