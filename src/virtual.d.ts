declare module 'virtual:lessons' {
  import type { CompiledLesson, LessonMeta } from '../plugins/content/types.ts';

  /** Every lesson's metadata, in curriculum order. */
  export const lessons: LessonMeta[];
  /** Lazy loader per lesson slug (each lesson is its own chunk). */
  export const loaders: Record<string, () => Promise<{ default: CompiledLesson }>>;
}

declare module '*.md' {
  const compiled: unknown;
  export default compiled;
}
