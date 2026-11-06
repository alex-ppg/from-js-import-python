// Build-time rendering: parsed lessons -> HTML strings + structured data for
// the interactive widgets. Code is highlighted with Shiki (dual light/dark
// themes) so no highlighter ships to the browser for static snippets.

import MarkdownIt from 'markdown-it';
import type { Env, RendererRule } from 'markdown-it';
import { createHighlighter, type Highlighter } from 'shiki';
import {
  ContentError,
  createSlugger,
  parseChallenge,
  parseFrontmatter,
  parseInfo,
  parseQuiz,
  splitContainers,
  splitFences,
  type ContainerSegment,
  type Fence,
  type FenceInfo,
  type ParsedLesson,
  type ReferenceSpec,
  type Segment,
} from './parse.ts';
import { PARTS } from './parts.ts';
import type {
  ChallengeData,
  CompiledBody,
  CompiledLesson,
  CompiledReference,
  PlaygroundData,
  QuizData,
  ReferenceEntry,
  TocEntry,
} from './types.ts';

const THEMES = { light: 'github-light-default', dark: 'github-dark-default' } as const;

const SHIKI_LANG: Record<string, string> = {
  js: 'javascript',
  ts: 'typescript',
  python: 'python',
  bash: 'shellscript',
  json: 'json',
  toml: 'toml',
  html: 'html',
  css: 'css',
  diff: 'diff',
  ini: 'ini',
  yaml: 'yaml',
  sql: 'sql',
};

const LABEL: Record<string, string> = {
  js: 'JavaScript',
  ts: 'TypeScript',
  python: 'Python',
  bash: 'Terminal',
  json: 'JSON',
  toml: 'TOML',
  html: 'HTML',
  css: 'CSS',
  diff: 'Diff',
  ini: 'INI',
  yaml: 'YAML',
  sql: 'SQL',
  text: 'Text',
  output: 'Output',
};

const CALLOUT_TITLE: Record<string, string> = {
  note: 'Note',
  tip: 'Tip',
  gotcha: 'JS habit alert',
  pythonic: 'Pythonic upgrade',
  deep: 'Under the hood',
};

interface RenderEnv extends Env {
  slug: string;
  file: string;
  toc: boolean;
  slugger: (text: string) => string;
  headings: TocEntry[];
  pendingAnchor: string | null;
  playgrounds: PlaygroundData[];
}

export function escapeHtml(text: string): string {
  return text.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
}

function plainText(inlineMarkdown: string): string {
  // Keep underscores: in headings they're nearly always identifiers (`__main__`).
  return inlineMarkdown.replace(/`([^`]*)`/g, '$1').replace(/\*\*?([^*]+)\*\*?/g, '$1').trim();
}

export interface Renderer {
  renderLesson(parsed: ParsedLesson): CompiledLesson;
  /** A free-standing Markdown page (e.g. content/home.md). */
  renderPage(src: string, file: string): CompiledBody;
  renderReference(specs: ReferenceSpec[]): CompiledReference;
}

export async function createRenderer(): Promise<Renderer> {
  const highlighter: Highlighter = await createHighlighter({
    themes: Object.values(THEMES),
    langs: Object.values(SHIKI_LANG),
  });

  const highlight = (code: string, lang: string): string =>
    highlighter.codeToHtml(code, { lang: SHIKI_LANG[lang] ?? 'text', themes: THEMES, defaultColor: false });

  interface FigureOptions {
    label?: string;
    bare?: boolean;
  }

  const figure = (code: string, info: Pick<FenceInfo, 'lang' | 'attrs'>, opts: FigureOptions = {}): string => {
    const lang = info.lang;
    // Plain text blocks (examples, diagrams) don't need a "TEXT" header.
    if (lang === 'text' && !info.attrs.title && !opts.label) opts = { ...opts, bare: true };
    const label = opts.label ?? LABEL[lang] ?? lang.toUpperCase();
    const title = info.attrs.title ? `<span class="code-title">${escapeHtml(info.attrs.title)}</span>` : '';
    const copy = '<button class="code-copy" type="button" data-copy aria-label="Copy code"></button>';
    const head = opts.bare
      ? copy
      : `<figcaption class="code-head"><span class="code-lang">${escapeHtml(label)}</span>${title}${copy}</figcaption>`;
    return `<figure class="code${opts.bare ? ' code-bare' : ''}" data-lang="${escapeHtml(lang)}">${head}${highlight(code, lang)}</figure>`;
  };

  const renderFence = (fence: Pick<Fence, 'lang' | 'flags' | 'attrs' | 'code'>, env: RenderEnv): string => {
    if (fence.lang === 'python' && fence.flags.includes('run')) {
      const index = env.playgrounds.push({ code: fence.code, raises: fence.flags.includes('raises') }) - 1;
      return `<div class="pg" data-pg="${index}">${figure(fence.code, fence, { label: 'Python' })}</div>\n`;
    }
    return figure(fence.code, fence) + '\n';
  };

  const md = new MarkdownIt({ html: true, typographer: true, linkify: false });

  const fenceRule: RendererRule = (tokens, idx, _options, env) => {
    const token = tokens[idx]!;
    return renderFence({ ...parseInfo(token.info), code: token.content.replace(/\n$/, '') }, env as RenderEnv);
  };
  md.renderer.rules.fence = fenceRule;

  md.renderer.rules.heading_open = (tokens, idx, options, envArg, self) => {
    const env = envArg as RenderEnv;
    const token = tokens[idx]!;
    const level = Number(token.tag.slice(1));
    if (env.toc && (level === 2 || level === 3)) {
      const content = tokens[idx + 1]?.content ?? '';
      const id = env.slugger(content);
      token.attrSet('id', id);
      env.headings.push({ id, level, text: plainText(content), html: md.renderInline(content) });
      env.pendingAnchor = id;
    }
    return self.renderToken(tokens, idx, options);
  };

  md.renderer.rules.heading_close = (tokens, idx, options, envArg, self) => {
    const env = envArg as RenderEnv;
    let anchor = '';
    if (env.pendingAnchor) {
      anchor = `<a class="heading-anchor" href="#/learn/${env.slug}/${env.pendingAnchor}" aria-label="Link to this section">#</a>`;
      env.pendingAnchor = null;
    }
    return anchor + self.renderToken(tokens, idx, options);
  };

  md.renderer.rules.link_open = (tokens, idx, options, envArg, self) => {
    const env = envArg as RenderEnv;
    const token = tokens[idx]!;
    const href = String(token.attrGet('href') ?? '');
    if (href.startsWith('lesson:')) {
      const [slug, anchor] = href.slice('lesson:'.length).split('#');
      token.attrSet('href', `#/learn/${slug}${anchor ? `/${anchor}` : ''}`);
    } else if (href.startsWith('#') && !href.startsWith('#/')) {
      // Same-page anchors would otherwise be read as routes by the hash router.
      token.attrSet('href', `#/learn/${env.slug}/${href.slice(1)}`);
    } else if (/^https?:\/\//.test(href)) {
      token.attrSet('target', '_blank');
      token.attrSet('rel', 'noopener noreferrer');
    }
    return self.renderToken(tokens, idx, options);
  };

  md.renderer.rules.table_open = () => '<div class="table-wrap"><table>\n';
  md.renderer.rules.table_close = () => '</table></div>\n';

  const newEnv = (slug: string, file: string): RenderEnv => ({
    slug,
    file,
    toc: false,
    slugger: createSlugger(),
    headings: [],
    pendingAnchor: null,
    playgrounds: [],
  });

  const render = (markdown: string, env: RenderEnv, toc = false): string => {
    const previous = env.toc;
    env.toc = toc;
    const html = md.render(markdown, env);
    env.toc = previous;
    return html;
  };

  const renderCompare = (seg: ContainerSegment, env: RenderEnv): string => {
    const panels: string[] = [];
    const notes: string[] = [];
    for (const part of splitFences(seg.body, seg.bodyLine, env.file)) {
      if (part.kind === 'fence') panels.push(renderFence(part.fence, env));
      else if (part.text.trim()) notes.push(part.text);
    }
    if (panels.length < 2) throw new ContentError(':::compare needs at least two code fences', env.file, seg.line);
    const caption = seg.args ? `<div class="compare-caption">${md.renderInline(seg.args)}</div>` : '';
    const noteHtml = notes.length ? `<div class="compare-notes">${render(notes.join('\n\n'), env)}</div>` : '';
    return `<div class="compare">${caption}<div class="compare-grid" style="--panels:${panels.length}">${panels.join('')}</div>${noteHtml}</div>\n`;
  };

  const renderCallout = (seg: ContainerSegment, env: RenderEnv): string => {
    const title = md.renderInline(seg.args || CALLOUT_TITLE[seg.name]!);
    const body = render(seg.body, env);
    if (seg.name === 'deep') {
      return `<details class="callout callout-deep"><summary class="callout-title">${title}</summary><div class="callout-body">${body}</div></details>\n`;
    }
    return `<aside class="callout callout-${seg.name}"><div class="callout-title">${title}</div><div class="callout-body">${body}</div></aside>\n`;
  };

  const renderBody = (segments: Segment[], env: RenderEnv): CompiledBody & { words: number } => {
    const quizzes: QuizData[] = [];
    const challenges: ChallengeData[] = [];
    let html = '';
    let words = 0;

    for (const seg of segments) {
      if (seg.kind === 'markdown') {
        words += seg.text.split(/\s+/).length;
        html += render(seg.text, env, true);
        continue;
      }
      words += seg.body.split(/\s+/).length;
      switch (seg.name) {
        case 'compare':
          html += renderCompare(seg, env);
          break;
        case 'quiz': {
          const quiz = parseQuiz(seg, env.file);
          const index = quizzes.length;
          quizzes.push({
            optionsHtml: quiz.options.map((o) => md.renderInline(o.text)),
            correct: quiz.options.findIndex((o) => o.correct),
            explanationHtml: quiz.explanation ? render(quiz.explanation, env) : '',
            code: quiz.code?.code ?? null,
          });
          html += `<div class="quiz" data-quiz="${index}"><div class="quiz-question">${render(quiz.question, env)}</div></div>\n`;
          break;
        }
        case 'challenge': {
          const c = parseChallenge(seg, env.file);
          challenges.push({
            id: c.id,
            title: c.title,
            difficulty: c.difficulty,
            descriptionHtml: render(c.description, env),
            jsHtml: c.js ? figure(c.js.code, c.js, { label: 'JavaScript version' }) : null,
            starter: c.starter.code,
            solution: c.solution.code,
            solutionHtml: figure(c.solution.code, c.solution, { label: 'Reference solution' }),
            tests: c.tests.code,
            testsHtml: figure(c.tests.code, c.tests, { label: 'Tests' }),
            hintsHtml: c.hints.map((h) => render(h, env)),
          });
          html += `<section class="challenge" id="challenge-${c.id}" data-challenge="${c.id}" aria-label="Challenge: ${escapeHtml(c.title)}"></section>\n`;
          break;
        }
        default:
          html += renderCallout(seg, env);
      }
    }
    return { html, playgrounds: env.playgrounds, quizzes, challenges, words };
  };

  return {
    renderLesson(parsed) {
      const fm = parsed.frontmatter;
      if (!fm.title) throw new ContentError('frontmatter needs a title', parsed.file, 1);
      if (!fm.part || !(PARTS as readonly string[]).includes(fm.part)) {
        throw new ContentError(`frontmatter "part" must be one of: ${PARTS.join(', ')}`, parsed.file, 1);
      }
      if (!fm.summary) throw new ContentError('frontmatter needs a summary', parsed.file, 1);

      const env = newEnv(parsed.slug, parsed.file);
      const { words, ...body } = renderBody(parsed.segments, env);
      const minutes = Number(fm.minutes) || Math.max(5, Math.round(words / 180 + body.challenges.length * 4));
      return {
        meta: {
          slug: parsed.slug,
          fileName: parsed.file.split(/[\\/]/).pop() ?? parsed.file,
          order: parsed.order,
          title: fm.title,
          part: fm.part,
          summary: fm.summary,
          minutes,
          toc: env.headings,
          challenges: body.challenges.map(({ id, title, difficulty }) => ({ id, title, difficulty })),
          quizCount: body.quizzes.length,
          playgroundCount: body.playgrounds.length,
        },
        ...body,
      };
    },

    renderPage(src, file) {
      const text = src.replace(/\r\n?/g, '\n');
      const { body, bodyLine } = parseFrontmatter(text);
      const { words: _words, ...compiled } = renderBody(splitContainers(body, bodyLine, file), newEnv('page', file));
      return compiled;
    },

    renderReference(specs) {
      const env = newEnv('reference', 'content/reference.md');
      const categories: string[] = [];
      const entries: ReferenceEntry[] = specs.map((spec) => {
        if (!categories.includes(spec.category)) categories.push(spec.category);
        const [jsSide, ...pySide] = spec.fences;
        if (!jsSide || !pySide.length) {
          throw new ContentError(`reference entry "${spec.title}" needs a JS fence followed by Python fence(s)`, env.file, spec.line);
        }
        const haystack = [spec.category, spec.title, ...spec.fences.map((f) => f.code), spec.note].join('\n');
        return {
          id: env.slugger(`${spec.category} ${spec.title}`),
          category: spec.category,
          title: md.renderInline(spec.title),
          jsHtml: figure(jsSide.code, jsSide, { bare: true }),
          pyHtml: pySide.map((f) => figure(f.code, f, { bare: true })).join(''),
          noteHtml: spec.note ? render(spec.note, env) : '',
          js: jsSide.code,
          py: pySide[0]!.code,
          text: haystack.toLowerCase(),
        };
      });
      return { categories, entries };
    },
  };
}
