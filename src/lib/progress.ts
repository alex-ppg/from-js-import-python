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

interface Data {
  lessons: Record<string, LessonProgress>;
  challenges: Record<string, ChallengeProgress>;
  quizzes: Record<string, QuizProgress>;
}

const KEY = 'fjip:progress:v1';

function load(): Data {
  const stored = readJSON<Partial<Data>>(KEY, {});
  return {
    lessons: stored.lessons ?? {},
    challenges: stored.challenges ?? {},
    quizzes: stored.quizzes ?? {},
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

  reset(): void {
    this.data = { lessons: {}, challenges: {}, quizzes: {} };
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
