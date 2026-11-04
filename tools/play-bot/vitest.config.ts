import { defineConfig } from 'vite-plus';

/* The bot prototype's demo runs the real game Worker under Miniflare, which needs Node, so it goes through Vitest. */
export default defineConfig({
  test: {
    root: new URL('../..', import.meta.url).pathname,
    include: ['tools/play-bot/**/*.demo.ts'],
    testTimeout: 0,
    hookTimeout: 120_000,
  },
});
