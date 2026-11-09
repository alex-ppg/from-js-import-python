// Vite plugin: compiles content/courses/<course>/*.md lessons and
// content/*.md pages into JS modules, and serves `virtual:lessons`: every
// course and lesson's metadata plus a lazy loader per lesson (so each lesson
// is its own chunk).

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { normalizePath, type Plugin } from 'vite';
import { COURSES_DIR, courseIdOf, LESSON_FILE, listCourses, type CourseConfig } from './courses.ts';
import { parseLesson, parseReference } from './parse.ts';
import { createRenderer, type Renderer } from './render.ts';
import type { CompiledLesson, CourseMeta, LessonMeta } from './types.ts';

const VIRTUAL_ID = 'virtual:lessons';
const RESOLVED_ID = '\0' + VIRTUAL_ID;

export function contentPlugin(): Plugin {
  let root = process.cwd();
  let isBuild = false;
  let renderer: Promise<Renderer> | undefined;
  const cache = new Map<string, { src: string; course: string; compiled: CompiledLesson }>();
  let courseConfigs = new Map<string, CourseConfig>();

  const getRenderer = () => (renderer ??= createRenderer());
  const coursesDir = () => normalizePath(resolve(root, COURSES_DIR));

  const courseFor = (file: string): CourseConfig => {
    const id = courseIdOf(file);
    let course = id ? courseConfigs.get(id) : undefined;
    if (!course) {
      courseConfigs = new Map(listCourses(root).map((c) => [c.id, c]));
      course = id ? courseConfigs.get(id) : undefined;
    }
    if (!course) throw new Error(`${file}: lessons must live in ${COURSES_DIR}/<course>/ next to a course.json`);
    return course;
  };

  async function compileLesson(file: string, src = readFileSync(file, 'utf8')): Promise<CompiledLesson> {
    const course = courseFor(file);
    const key = JSON.stringify(course);
    const hit = cache.get(file);
    if (hit && hit.src === src && hit.course === key) return hit.compiled;
    const compiled = (await getRenderer()).renderLesson(parseLesson(src, file), course);
    cache.set(file, { src, course: key, compiled });
    return compiled;
  }

  return {
    name: 'fjip-content',
    enforce: 'pre',

    configResolved(config) {
      root = config.root;
      isBuild = config.command === 'build';
    },

    configureServer(server) {
      // Edits to existing lessons and course.json files are tracked with
      // addWatchFile below; adding or removing a lesson changes the manifest.
      const onAddOrRemove = (file: string) => {
        const path = normalizePath(file);
        const name = path.split('/').pop()!;
        if (!path.startsWith(`${coursesDir()}/`) || !(LESSON_FILE.test(name) || name === 'course.json')) return;
        courseConfigs = new Map();
        const mod = server.moduleGraph.getModuleById(RESOLVED_ID);
        if (mod) server.moduleGraph.invalidateModule(mod);
        server.ws.send({ type: 'full-reload' });
      };
      server.watcher.on('add', onAddOrRemove);
      server.watcher.on('unlink', onAddOrRemove);
    },

    resolveId(id) {
      return id === VIRTUAL_ID ? RESOLVED_ID : undefined;
    },

    async load(id) {
      if (id !== RESOLVED_ID) return undefined;
      const courses = listCourses(root);
      courseConfigs = new Map(courses.map((c) => [c.id, c]));
      const courseMetas: CourseMeta[] = [];
      const lessonMetas: LessonMeta[] = [];
      const loaders: string[] = [];
      for (const course of courses) {
        this.addWatchFile(normalizePath(resolve(course.dir, 'course.json')));
        const slugs: string[] = [];
        for (const name of course.lessonFiles) {
          const file = normalizePath(resolve(course.dir, name));
          this.addWatchFile(file);
          try {
            const { meta } = await compileLesson(file);
            slugs.push(meta.slug);
            lessonMetas.push(meta);
            loaders.push(`  ${JSON.stringify(meta.slug)}: () => import(${JSON.stringify(`/${COURSES_DIR}/${course.id}/${name}`)})`);
          } catch (error) {
            // During `vite dev` a broken lesson shouldn't take the whole site down.
            if (isBuild) throw error;
            this.warn(`skipping ${course.id}/${name}: ${(error as Error).message}`);
          }
        }
        const { dir: _dir, lessonFiles: _files, ...config } = course;
        courseMetas.push({ ...config, lessons: slugs });
      }
      return [
        `export const courses = ${JSON.stringify(courseMetas)};`,
        `export const lessons = ${JSON.stringify(lessonMetas)};`,
        `export const loaders = {\n${loaders.join(',\n')}\n};`,
        '',
      ].join('\n');
    },

    async transform(src, id) {
      const path = normalizePath(id.split('?')[0]!);
      if (!path.endsWith('.md')) return undefined;
      if (path === normalizePath(resolve(root, 'content/reference.md'))) {
        const compiled = (await getRenderer()).renderReference(parseReference(src, path));
        return { code: `export default ${JSON.stringify(compiled)};`, map: null };
      }
      if (path.startsWith(`${coursesDir()}/`)) {
        const compiled = await compileLesson(path, src);
        return { code: `export default ${JSON.stringify(compiled)};`, map: null };
      }
      if (path.startsWith(`${normalizePath(resolve(root, 'content'))}/`)) {
        const compiled = (await getRenderer()).renderPage(src, path);
        return { code: `export default ${JSON.stringify(compiled)};`, map: null };
      }
      return undefined;
    },
  };
}
