declare module 'virtual:lessons' {
  import type { CompiledLesson, CourseMeta, LessonMeta } from '../plugins/content/types.ts';

  /** Every course, in display order. */
  export const courses: CourseMeta[];
  /** Every lesson's metadata (each knows its course). */
  export const lessons: LessonMeta[];
  /** Lazy loader per lesson slug (each lesson is its own chunk). */
  export const loaders: Record<string, () => Promise<{ default: CompiledLesson }>>;
}

declare module '*.md' {
  const compiled: unknown;
  export default compiled;
}
