// Learner progress (visited/completed lessons, solved challenges, drafts,
// quiz answers), persisted per browser in localStorage.

import { readJSON, writeJSON } from './storage.ts';

export interface LessonProgress {
  visited?: number;
  completed?: number;
}

export interface ChallengeProgress {
  solved?: number;
  draft?: string;
  hints?: number;
}

export interface QuizProgress {
  choice: number;
  correct: boolean;
}

/** Leitner-box state for a reference flashcard (box 1 = new or missed, 5 = mastered). */
export interface CardProgress {
  box: number;
  seen: number;
  last: number;
}

export const MAX_BOX = 5;

interface Data {
  lessons: Record<string, LessonProgress>;
  challenges: Record<string, ChallengeProgress>;
  quizzes: Record<string, QuizProgress>;
  cards: Record<string, CardProgress>;
}

const KEY = 'fjip:progress:v1';

function load(): Data {
  const stored = readJSON<Partial<Data>>(KEY, {});
  return {
    lessons: stored.lessons ?? {},
    challenges: stored.challenges ?? {},
    quizzes: stored.quizzes ?? {},
    cards: stored.cards ?? {},
  };
}

class ProgressStore {
  private data = load();
  private listeners = new Set<() => void>();
  private timer: number | undefined;

  constructor() {
    window.addEventListener('storage', (event) => {
      if (event.key !== KEY) return;
      this.data = load();
      this.notify();
    });
    window.addEventListener('pagehide', () => this.flush());
  }

  lesson(slug: string): LessonProgress {
    return this.data.lessons[slug] ?? {};
  }

  challenge(id: string): ChallengeProgress {
    return this.data.challenges[id] ?? {};
  }

  quiz(key: string): QuizProgress | undefined {
    return this.data.quizzes[key];
  }

  visit(slug: string): void {
    const lesson = (this.data.lessons[slug] ??= {});
    if (lesson.visited) return;
    lesson.visited = Date.now();
    this.commit();
  }

  setCompleted(slug: string, completed: boolean): void {
    const lesson = (this.data.lessons[slug] ??= {});
    if (completed) lesson.completed = Date.now();
    else delete lesson.completed;
    this.commit();
  }

  saveDraft(id: string, code: string | null): void {
    const challenge = (this.data.challenges[id] ??= {});
    if (code === null) delete challenge.draft;
    else challenge.draft = code;
    this.commit(false);
  }

  markSolved(id: string): void {
    const challenge = (this.data.challenges[id] ??= {});
    if (challenge.solved) return;
    challenge.solved = Date.now();
    this.commit();
  }

  setHints(id: string, shown: number): void {
    (this.data.challenges[id] ??= {}).hints = shown;
    this.commit(false);
  }

  answerQuiz(key: string, choice: number, correct: boolean): void {
    this.data.quizzes[key] = { choice, correct };
    this.commit();
  }

  card(id: string): CardProgress | undefined {
    return this.data.cards[id];
  }

  /** Leitner step: a known card moves up a box, a missed one goes back to box 1. */
  gradeCard(id: string, knewIt: boolean): void {
    const card = this.data.cards[id] ?? { box: 1, seen: 0, last: 0 };
    card.box = knewIt ? Math.min(MAX_BOX, card.box + 1) : 1;
    card.seen++;
    card.last = Date.now();
    this.data.cards[id] = card;
    this.commit();
  }

  reset(): void {
    this.data = { lessons: {}, challenges: {}, quizzes: {}, cards: {} };
    this.commit();
    this.flush();
  }

  subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private commit(notify = true): void {
    window.clearTimeout(this.timer);
    this.timer = window.setTimeout(() => this.flush(), 200);
    if (notify) this.notify();
  }

  private flush(): void {
    window.clearTimeout(this.timer);
    writeJSON(KEY, this.data);
  }

  private notify(): void {
    for (const listener of this.listeners) listener();
  }
}

export const progress = new ProgressStore();
