import { defineConfig } from 'vitest/config';

// Project Pages URL: https://jakobreichelt.github.io/HOW-EUROPE-WORKS/
const githubPagesBase = '/HOW-EUROPE-WORKS/';

export default defineConfig({
  // Keep local `npm run dev` at `/`; only rebase assets when CI builds for Pages.
  base: process.env.GITHUB_ACTIONS ? githubPagesBase : '/',
  build: {
    // p5 alone is about 1 MB minified.
    chunkSizeWarningLimit: 1200,
  },
  test: {
    include: ['tests/**/*.test.ts'],
    environment: 'node',
  },
});

