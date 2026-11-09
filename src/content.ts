// Typed access to the compiled curriculum (see plugins/content/vite.ts).

import { courses as allCourses, lessons as allLessons, loaders } from 'virtual:lessons';
import type {
  ChallengeSummary,
  CompiledLesson,
  CompiledReference,
  CourseMeta,
  LessonMeta,
} from '../plugins/content/types.ts';

export type { ChallengeData, CompiledBody, CompiledLesson, CourseMeta, LessonMeta, QuizData, ReferenceEntry } from '../plugins/content/types.ts';

export const courses: CourseMeta[] = [...allCourses].sort((a, b) => a.order - b.order);
const courseRank = new Map(courses.map((course, i) => [course.id, i]));
const courseById = new Map(courses.map((course) => [course.id, course]));

/** Every lesson, grouped by course (in course order) and then by lesson order. */
export const lessons: LessonMeta[] = [...allLessons].sort(
  (a, b) => (courseRank.get(a.course) ?? 99) - (courseRank.get(b.course) ?? 99) || a.order - b.order,
);
const bySlug = new Map(lessons.map((lesson) => [lesson.slug, lesson]));

/** The first course is the core course ("start here"). */
export const coreCourse: CourseMeta | undefined = courses[0];

export function courseMeta(id: string): CourseMeta | undefined {
  return courseById.get(id);
}

export function lessonMeta(slug: string): LessonMeta | undefined {
  return bySlug.get(slug);
}

export function lessonsOf(courseId: string): LessonMeta[] {
  return lessons.filter((lesson) => lesson.course === courseId);
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

const partsCache = new Map<string, Part[]>();

export function partsOf(courseId: string): Part[] {
  let parts = partsCache.get(courseId);
  if (!parts) {
    const course = courseById.get(courseId);
    const own = lessonsOf(courseId);
    parts = (course?.parts ?? [])
      .map((name, index) => ({ name, index: index + 1, lessons: own.filter((lesson) => lesson.part === name) }))
      .filter((part) => part.lessons.length > 0);
    partsCache.set(courseId, parts);
  }
  return parts;
}

export function partOf(lesson: LessonMeta): Part | undefined {
  return partsOf(lesson.course).find((part) => part.name === lesson.part);
}

/** Previous/next lesson within the same course. */
export function neighbours(slug: string): { prev?: LessonMeta; next?: LessonMeta } {
  const lesson = bySlug.get(slug);
  if (!lesson) return {};
  const own = lessonsOf(lesson.course);
  const index = own.findIndex((l) => l.slug === slug);
  return { prev: own[index - 1], next: own[index + 1] };
}

export interface ChallengeRef extends ChallengeSummary {
  lesson: LessonMeta;
}

export const challenges: ChallengeRef[] = lessons.flatMap((lesson) =>
  lesson.challenges.map((challenge) => ({ ...challenge, lesson })),
);

export function challengesOf(courseId: string): ChallengeRef[] {
  return challenges.filter((challenge) => challenge.lesson.course === courseId);
}

export const quizTotal = lessons.reduce((sum, lesson) => sum + lesson.quizCount, 0);

// A glob (rather than a plain import) so a checkout without the reference
// file still builds.
const referenceModule = Object.values(import.meta.glob<{ default: CompiledReference }>('../content/reference.md'))[0];
let referencePromise: Promise<CompiledReference> | null = null;

export function loadReference(): Promise<CompiledReference> {
  if (!referenceModule) return Promise.reject(new Error('content/reference.md is missing'));
  referencePromise ??= referenceModule().then((m) => m.default);
  return referencePromise;
}
