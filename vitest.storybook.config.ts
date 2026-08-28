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

import {
  convexWorkerAliases,
  convexWorkerBuildPlugins,
  convexWorkerOptimizeDeps,
  convexWorkerOxc,
  convexWorkerServePlugins,
} from './.storybook/worker-async-transform.ts';
import { coverageExclude, coverageIncludeSrc } from './coverage-denominator.ts';

export default defineConfig({
  oxc: convexWorkerOxc,
  /**
   * Mirrors .storybook/vite.config.ts, because the addon does not load the custom builder viteConfigPath on its own.
   * Without the react plugin every story fails on CJS interop (react-dom flushSync).
   */
  define: {
    'import.meta.env.VITE_CONVEX_URL': JSON.stringify('https://storybook.invalid'),
  },
  /**
   * Only `scripts/` imports these two modules, so the story-file scan never crawls them, and the v8 coverage pass over untested `src/` files discovers `svgpath` and `three` after the last test.
   * That forces a re-optimize mid-run, and Vite reloads a browser test that has already started:
   * "Vite unexpectedly reloaded a test", which is a flake, not a warning.
   * Scanning them up front means the optimizer already holds them by the time coverage walks the file.
   * Entries rather than `include`, so Vite keeps following their imports and a new transitive dependency cannot reintroduce the reload without anyone noticing.
   */
  optimizeDeps: {
    ...convexWorkerOptimizeDeps,
    entries: ['src/shared/svgToObj.ts', 'src/shared/vectorNormalize.ts'],
    include: [...convexWorkerOptimizeDeps.include, '@mantine/hooks', 'crypto-js/sha256'],
  },
  resolve: {
    /* Typings in the current Vite package lag behind docs/runtime support
       (same cast as .storybook/vite.config.ts). */
    ...({ tsconfigPaths: true } as Record<string, unknown>),
    alias: convexWorkerAliases,
  },
  plugins: [...convexWorkerServePlugins(), viteReact(), storybookTest({ configDir: '.storybook' })],
  worker: {
    format: 'es',
    plugins: convexWorkerBuildPlugins,
  },
  test: {
    name: 'storybook',
    /*
     * Sized for the browser-local Convex conformance story, which starts and retires 21 workers and costs 48 to 54 seconds in a full run against 4 seconds alone.
     * At 45_000 that story was inside the kill by itself and outside it in a suite, and its own assertion carried the same 45_000, so the kill and the report fell due together and a failure could not say what it was waiting for.
     * The next slowest story here takes 21 seconds, so this is the heavy one's headroom rather than a budget the rest spend.
     */
    testTimeout: 120_000,
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
