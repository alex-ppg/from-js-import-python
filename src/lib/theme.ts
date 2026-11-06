// Light/dark theme: follows the OS until the learner picks one explicitly.
// index.html applies the stored choice before first paint to avoid a flash.

import { readString, writeString } from './storage.ts';

const KEY = 'fjip:theme';
const media = window.matchMedia('(prefers-color-scheme: dark)');
const listeners = new Set<(theme: 'light' | 'dark') => void>();

export function currentTheme(): 'light' | 'dark' {
  return document.documentElement.dataset.theme === 'dark' ? 'dark' : 'light';
}

function apply(theme: 'light' | 'dark'): void {
  document.documentElement.dataset.theme = theme;
  document.documentElement.style.colorScheme = theme;
  for (const listener of listeners) listener(theme);
}

export function initTheme(): void {
  const stored = readString(KEY);
  apply(stored === 'light' || stored === 'dark' ? stored : media.matches ? 'dark' : 'light');
  media.addEventListener('change', (event) => {
    if (!readString(KEY)) apply(event.matches ? 'dark' : 'light');
  });
}

export function toggleTheme(): void {
  const next = currentTheme() === 'dark' ? 'light' : 'dark';
  // Picking the OS theme again means "follow the OS" from now on.
  writeString(KEY, next === (media.matches ? 'dark' : 'light') ? null : next);
  apply(next);
}

export function onThemeChange(listener: (theme: 'light' | 'dark') => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}
