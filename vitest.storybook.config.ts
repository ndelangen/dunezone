/*
 * Runs every story as a Vitest browser-mode test in Chromium via
 * @storybook/addon-vitest. Coverage is opt-in (--coverage) and uploads as the
 * `storybook` Codecov flag. Validated on branch prototype/combined-coverage.
 * @see docs/research/combined-coverage-codecov.md §3
 */
import { fileURLToPath } from 'node:url';

import { storybookTest } from '@storybook/addon-vitest/vitest-plugin';
import viteReact from '@vitejs/plugin-react';
import { playwright } from '@vitest/browser-playwright';
import { defineConfig } from 'vitest/config';

import { coverageExclude, coverageIncludeSrc } from './coverage-denominator.ts';

export default defineConfig({
  /**
   * Mirrors .storybook/vite.config.ts, because the addon does not load the custom builder viteConfigPath on its own.
   * Without the react plugin every story fails on CJS interop (react-dom flushSync).
   */
  define: {
    'import.meta.env.VITE_CONVEX_URL': JSON.stringify('storybook-disconnected'),
  },
  /**
   * Only `scripts/` imports these two modules, so the story-file scan never crawls them, and the v8 coverage pass over untested `src/` files discovers `svgpath` and `three` after the last test.
   * That forces a re-optimize mid-run, and Vite reloads a browser test that has already started:
   * "Vite unexpectedly reloaded a test", which is a flake, not a warning.
   * Scanning them up front means the optimizer already holds them by the time coverage walks the file.
   * Entries rather than `include`, so Vite keeps following their imports and a new transitive dependency cannot reintroduce the reload without anyone noticing.
   */
  optimizeDeps: {
    entries: ['src/shared/svgToObj.ts', 'src/shared/vectorNormalize.ts'],
    /*
     * The page spike loads Convex's server modules inside a worker after the
     * first story starts. Pre-bundle that closure so Vite does not reload the
     * browser suite when it discovers the modules mid-run.
     */
    include: [
      '@convex-dev/aggregate',
      '@convex-dev/auth/server',
      '@convex-dev/auth/providers/Password',
      '@auth/core/providers/discord',
      '@auth/core/providers/google',
      'convex-helpers/server/customFunctions',
      'convex-helpers/server/triggers',
      'convex-helpers/server/zod4',
      'convex-helpers/validators',
      'convex-test',
      'convex/values',
      'crypto-js/sha256',
    ],
  },
  resolve: {
    /* Typings in the current Vite package lag behind docs/runtime support
       (same cast as .storybook/vite.config.ts). */
    ...({ tsconfigPaths: true } as Record<string, unknown>),
    alias: {
      'node:async_hooks': fileURLToPath(new URL('./.storybook/async-hooks.ts', import.meta.url)),
    },
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
