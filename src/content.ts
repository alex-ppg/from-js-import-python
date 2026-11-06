// Typed access to the compiled curriculum (see plugins/content/vite.ts).

import { lessons as allLessons, loaders } from 'virtual:lessons';
import { PARTS } from '../plugins/content/parts.ts';
import type {
  ChallengeSummary,
  CompiledLesson,
  CompiledReference,
  LessonMeta,
} from '../plugins/content/types.ts';

export type { ChallengeData, CompiledBody, CompiledLesson, LessonMeta, QuizData, ReferenceEntry } from '../plugins/content/types.ts';

export const lessons: LessonMeta[] = [...allLessons].sort((a, b) => a.order - b.order);

const bySlug = new Map(lessons.map((lesson) => [lesson.slug, lesson]));

export function lessonMeta(slug: string): LessonMeta | undefined {
  return bySlug.get(slug);
}

export async function loadLesson(slug: string): Promise<CompiledLesson | null> {
  const loader = loaders[slug];
  return loader ? (await loader()).default : null;
}

export interface Part {
  name: string;
  index: number;
  lessons: LessonMeta[];
}

export const parts: Part[] = PARTS.map((name, index) => ({
  name,
  index: index + 1,
  lessons: lessons.filter((lesson) => lesson.part === name),
})).filter((part) => part.lessons.length > 0);

export function partOf(lesson: LessonMeta): Part | undefined {
  return parts.find((part) => part.name === lesson.part);
}

export function neighbours(slug: string): { prev?: LessonMeta; next?: LessonMeta } {
  const index = lessons.findIndex((lesson) => lesson.slug === slug);
  return { prev: lessons[index - 1], next: index === -1 ? undefined : lessons[index + 1] };
}

export interface ChallengeRef extends ChallengeSummary {
  lesson: LessonMeta;
}

export const challenges: ChallengeRef[] = lessons.flatMap((lesson) =>
  lesson.challenges.map((challenge) => ({ ...challenge, lesson })),
);

// A glob (rather than a plain import) so a checkout without the reference
// file still builds.
const referenceModule = Object.values(import.meta.glob<{ default: CompiledReference }>('../content/reference.md'))[0];
let referencePromise: Promise<CompiledReference> | null = null;

export function loadReference(): Promise<CompiledReference> {
  if (!referenceModule) return Promise.reject(new Error('content/reference.md is missing'));
  referencePromise ??= referenceModule().then((m) => m.default);
  return referencePromise;
}
