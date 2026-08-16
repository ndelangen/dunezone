/*
 * Runs every story as a Vitest browser-mode test in Chromium via
 * @storybook/addon-vitest. Coverage is opt-in (--coverage) and uploads as the
 * `storybook` Codecov flag. Validated on branch prototype/combined-coverage.
 * @see docs/research/combined-coverage-codecov.md §3
 */
import { storybookTest } from '@storybook/addon-vitest/vitest-plugin';
import viteReact from '@vitejs/plugin-react';
import { playwright } from '@vitest/browser-playwright';
import { defineConfig } from 'vitest/config';

import { coverageExclude, coverageIncludeSrc } from './coverage-denominator';

export default defineConfig({
  /**
   * Mirrors .storybook/vite.config.ts — the addon does not load the custom builder viteConfigPath on its own; without the react plugin every story fails on CJS interop (react-dom flushSync).
   */
  define: {
    'import.meta.env.VITE_CONVEX_URL': JSON.stringify('storybook-disconnected'),
  },
  resolve: {
    /* Typings in the current Vite package lag behind docs/runtime support
       (same cast as .storybook/vite.config.ts). */
    ...({ tsconfigPaths: true } as Record<string, unknown>),
  },
  plugins: [viteReact(), storybookTest({ configDir: '.storybook' })],
  test: {
    name: 'storybook',
    browser: {
      enabled: true,
      provider: playwright(),
      headless: true,
      instances: [{ browser: 'chromium' }],
    },
    setupFiles: ['.storybook/vitest.setup.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text-summary', 'lcov'],
      reportsDirectory: 'coverage/storybook',
      // Stories only exercise src; suite-scoped like the publisher flag.
      include: [coverageIncludeSrc],
      exclude: coverageExclude,
    },
  },
});
