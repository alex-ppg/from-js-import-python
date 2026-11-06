// Shapes shared by the content compiler (build time) and the app (runtime).

export type Difficulty = 'easy' | 'medium' | 'hard';

export interface TocEntry {
  id: string;
  level: 2 | 3;
  /** Plain text, used for search. */
  text: string;
  /** Inline HTML (keeps `code` spans), used for display. */
  html: string;
}

export interface ChallengeSummary {
  id: string;
  title: string;
  difficulty: Difficulty;
}

export interface LessonMeta {
  slug: string;
  /** Source file name, e.g. `07-lists.md`. */
  fileName: string;
  order: number;
  title: string;
  part: string;
  summary: string;
  minutes: number;
  toc: TocEntry[];
  challenges: ChallengeSummary[];
  quizCount: number;
  playgroundCount: number;
}

export interface PlaygroundData {
  code: string;
  /** The snippet is expected to raise (it demonstrates an error). */
  raises: boolean;
}

export interface QuizData {
  optionsHtml: string[];
  correct: number;
  explanationHtml: string;
  /** Python source the learner can run to check their answer. */
  code: string | null;
}

export interface ChallengeData extends ChallengeSummary {
  descriptionHtml: string;
  jsHtml: string | null;
  starter: string;
  solution: string;
  solutionHtml: string;
  tests: string;
  testsHtml: string;
  hintsHtml: string[];
}

/** Rendered Markdown body plus the data its interactive widgets need. */
export interface CompiledBody {
  html: string;
  playgrounds: PlaygroundData[];
  quizzes: QuizData[];
  challenges: ChallengeData[];
}

export interface CompiledLesson extends CompiledBody {
  meta: LessonMeta;
}

export interface ReferenceEntry {
  id: string;
  category: string;
  /** Inline HTML. */
  title: string;
  jsHtml: string;
  pyHtml: string;
  noteHtml: string;
  /** Plain source of the JS side and of the first Python alternative. */
  js: string;
  py: string;
  /** Lower-cased haystack for search. */
  text: string;
}

export interface CompiledReference {
  categories: string[];
  entries: ReferenceEntry[];
}
