// Courses live in content/courses/<id>/, each with a course.json and
// NN-slug.md lessons. Shared by the Vite plugin and scripts/validate.ts.

import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { ContentError } from './parse.ts';

export const COURSES_DIR = 'content/courses';
export const LESSON_FILE = /^\d+-[a-z0-9-]+\.md$/;

export interface CourseConfig {
  id: string;
  title: string;
  summary: string;
  level: string;
  icon: string;
  order: number;
  parts: string[];
}

export interface CourseOnDisk extends CourseConfig {
  /** Absolute directory of the course. */
  dir: string;
  /** Lesson file names, sorted. */
  lessonFiles: string[];
}

export function readCourseConfig(dir: string, id: string): CourseConfig {
  const file = join(dir, 'course.json');
  let raw: Record<string, unknown>;
  try {
    raw = JSON.parse(readFileSync(file, 'utf8')) as Record<string, unknown>;
  } catch (error) {
    throw new ContentError(`invalid course.json: ${(error as Error).message}`, `${COURSES_DIR}/${id}/course.json`, 1);
  }
  const text = (key: string) => {
    const value = raw[key];
    if (typeof value !== 'string' || !value.trim()) {
      throw new ContentError(`course.json needs a non-empty "${key}"`, `${COURSES_DIR}/${id}/course.json`, 1);
    }
    return value;
  };
  const parts = raw.parts;
  if (!Array.isArray(parts) || !parts.length || !parts.every((p) => typeof p === 'string' && p.trim())) {
    throw new ContentError('course.json needs "parts": a non-empty list of part names', `${COURSES_DIR}/${id}/course.json`, 1);
  }
  return {
    id,
    title: text('title'),
    summary: text('summary'),
    level: text('level'),
    icon: typeof raw.icon === 'string' ? raw.icon : 'book',
    order: typeof raw.order === 'number' ? raw.order : 99,
    parts: parts as string[],
  };
}

/** Every course under `root`, in display order. */
export function listCourses(root: string): CourseOnDisk[] {
  const base = join(root, COURSES_DIR);
  if (!existsSync(base)) return [];
  return readdirSync(base, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && /^[a-z0-9-]+$/.test(entry.name) && existsSync(join(base, entry.name, 'course.json')))
    .map((entry) => {
      const dir = join(base, entry.name);
      return {
        ...readCourseConfig(dir, entry.name),
        dir,
        lessonFiles: readdirSync(dir).filter((f) => LESSON_FILE.test(f)).sort(),
      };
    })
    .sort((a, b) => a.order - b.order || a.id.localeCompare(b.id));
}

/** The course id for a lesson path such as `.../content/courses/<id>/07-lists.md`. */
export function courseIdOf(file: string): string | null {
  const m = /content[\\/]courses[\\/]([a-z0-9-]+)[\\/][^\\/]+\.md$/.exec(file);
  return m ? m[1]! : null;
}
