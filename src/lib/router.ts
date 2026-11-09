// Hash routing keeps the build host-agnostic (GitHub Pages, any static host,
// even a sub-folder) with no server-side fallback rules.
//
//   #/                         home
//   #/courses                  every course
//   #/course/<id>              one course's curriculum
//   #/learn/<slug>[/<anchor>]  lesson, optionally scrolled to a heading/challenge
//   #/practice                 every challenge
//   #/review[/quiz|/flashcards] spaced review of quizzes and reference cards
//   #/reference[/<entry>]?q=   JS -> Python lookup table
//   #/playground?code=         scratchpad (code is base64url-encoded)

export type ReviewMode = 'hub' | 'quiz' | 'flashcards';

export type Route =
  | { name: 'home' }
  | { name: 'courses' }
  | { name: 'course'; id: string }
  | { name: 'lesson'; slug: string; anchor: string | null }
  | { name: 'practice' }
  | { name: 'review'; mode: ReviewMode }
  | { name: 'reference'; entry: string | null; query: string }
  | { name: 'playground'; code: string | null }
  | { name: 'notfound' };

export function parseHash(hash: string): Route {
  const raw = hash.replace(/^#/, '');
  const queryAt = raw.indexOf('?');
  const path = queryAt === -1 ? raw : raw.slice(0, queryAt);
  const params = new URLSearchParams(queryAt === -1 ? '' : raw.slice(queryAt + 1));
  const segments = path.split('/').filter(Boolean).map((s) => {
    try {
      return decodeURIComponent(s);
    } catch {
      return s;
    }
  });

  switch (segments[0]) {
    case undefined:
      return { name: 'home' };
    case 'learn':
      return segments[1] ? { name: 'lesson', slug: segments[1], anchor: segments[2] ?? null } : { name: 'courses' };
    case 'courses':
      return { name: 'courses' };
    case 'course':
      return segments[1] ? { name: 'course', id: segments[1] } : { name: 'courses' };
    case 'practice':
      return { name: 'practice' };
    case 'review': {
      const mode = segments[1] ?? 'hub';
      return mode === 'quiz' || mode === 'flashcards' || mode === 'hub' ? { name: 'review', mode } : { name: 'notfound' };
    }
    case 'reference':
      return { name: 'reference', entry: segments[1] ?? null, query: params.get('q') ?? '' };
    case 'playground':
      return { name: 'playground', code: params.get('code') };
    default:
      return { name: 'notfound' };
  }
}

export function currentRoute(): Route {
  return parseHash(location.hash);
}

export function navigate(hash: string, { replace = false } = {}): void {
  const target = hash.startsWith('#') ? hash : `#${hash}`;
  if (replace) {
    history.replaceState(null, '', target);
    window.dispatchEvent(new HashChangeEvent('hashchange'));
  } else {
    location.hash = target;
  }
}

export function lessonHref(slug: string, anchor?: string | null): string {
  return `#/learn/${slug}${anchor ? `/${anchor}` : ''}`;
}

export function courseHref(id: string): string {
  return `#/course/${id}`;
}

// base64url for sharing playground code in the URL.
export function encodeCode(code: string): string {
  const bytes = new TextEncoder().encode(code);
  let binary = '';
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export function decodeCode(encoded: string): string | null {
  try {
    const binary = atob(encoded.replace(/-/g, '+').replace(/_/g, '/'));
    return new TextDecoder().decode(Uint8Array.from(binary, (c) => c.charCodeAt(0)));
  } catch {
    return null;
  }
}
