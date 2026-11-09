import { defineConfig } from 'vite';
import { contentPlugin } from './plugins/content/vite.ts';

export default defineConfig({
  // Relative asset URLs + hash routing: the build works from any static host
  // path (GitHub Pages project sites included) without extra configuration.
  base: './',
  plugins: [contentPlugin()],
  worker: { format: 'es' },
  build: {
    target: 'es2022',
    // The reference chunk is ~1.7 MB of pre-highlighted HTML (410 entries) but
    // ~170 kB gzipped, since Shiki's inline styles compress extremely well. It
    // loads only for the reference, flashcards and search.
    chunkSizeWarningLimit: 2000,
  },
});
