// Vite plugin: compiles content/lessons/*.md and content/reference.md into
// JS modules, and serves `virtual:lessons` (metadata for every lesson plus a
// lazy loader per lesson, so each lesson becomes its own chunk).

import { readdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { normalizePath, type Plugin } from 'vite';
import { parseLesson, parseReference } from './parse.ts';
import { createRenderer, type Renderer } from './render.ts';
import type { CompiledLesson, LessonMeta } from './types.ts';

const VIRTUAL_ID = 'virtual:lessons';
const RESOLVED_ID = '\0' + VIRTUAL_ID;
const LESSON_FILE = /^\d+-[a-z0-9-]+\.md$/;

export function contentPlugin(): Plugin {
  let root = process.cwd();
  let isBuild = false;
  let renderer: Promise<Renderer> | undefined;
  const cache = new Map<string, { src: string; compiled: CompiledLesson }>();

  const getRenderer = () => (renderer ??= createRenderer());
  const lessonsDir = () => normalizePath(resolve(root, 'content/lessons'));

  async function compileLesson(file: string, src = readFileSync(file, 'utf8')): Promise<CompiledLesson> {
    const hit = cache.get(file);
    if (hit && hit.src === src) return hit.compiled;
    const compiled = (await getRenderer()).renderLesson(parseLesson(src, file));
    cache.set(file, { src, compiled });
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
      // Edits to existing lessons are tracked via addWatchFile below; adding or
      // removing a lesson file changes the manifest itself.
      const onAddOrRemove = (file: string) => {
        const path = normalizePath(file);
        if (!path.startsWith(`${lessonsDir()}/`) || !LESSON_FILE.test(path.split('/').pop()!)) return;
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
      const dir = lessonsDir();
      const metas: LessonMeta[] = [];
      const loaders: string[] = [];
      for (const name of readdirSync(dir).filter((f) => LESSON_FILE.test(f)).sort()) {
        const file = `${dir}/${name}`;
        this.addWatchFile(file);
        try {
          const { meta } = await compileLesson(file);
          metas.push(meta);
          loaders.push(`  ${JSON.stringify(meta.slug)}: () => import(${JSON.stringify(`/content/lessons/${name}`)})`);
        } catch (error) {
          // During `vite dev` a broken lesson shouldn't take the whole site down.
          if (isBuild) throw error;
          this.warn(`skipping ${name}: ${(error as Error).message}`);
        }
      }
      return `export const lessons = ${JSON.stringify(metas)};\nexport const loaders = {\n${loaders.join(',\n')}\n};\n`;
    },

    async transform(src, id) {
      const path = normalizePath(id.split('?')[0]!);
      if (!path.endsWith('.md')) return undefined;
      if (path === normalizePath(resolve(root, 'content/reference.md'))) {
        const compiled = (await getRenderer()).renderReference(parseReference(src, path));
        return { code: `export default ${JSON.stringify(compiled)};`, map: null };
      }
      if (path.startsWith(`${lessonsDir()}/`)) {
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
