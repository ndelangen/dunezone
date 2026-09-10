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

import { pageStylesheetStaysWithItsStory } from './.storybook/pageStylesheet.ts';
import {
  convexWorkerAliases,
  convexWorkerBuildPlugins,
  convexWorkerOptimizeDeps,
  convexWorkerOxc,
  convexWorkerServePlugins,
} from './.storybook/worker-async-transform.ts';
import { coverageExclude, coverageIncludeSrc } from './coverage-denominator.ts';
import { reactCompiler } from './scripts/lib/reactCompiler.ts';

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
    /* A targeted page story still imports the complete router. Scan it before opening the browser. */
    entries: ['src/app/routeTree.gen.ts', 'src/shared/svgToObj.ts', 'src/shared/vectorNormalize.ts'],
    include: [
      ...convexWorkerOptimizeDeps.include,
      '@mantine/hooks',
      /* Prebundle imports discovered by full page stories before Chromium starts testing. */
      '@convex-dev/auth/react',
      '@radix-ui/react-select',
      '@radix-ui/react-tabs',
      '@tanstack/react-form',
      'fuse.js',
      'react-icons/fa6',
      'react-icons/si',
      'storybook/internal/core-events',
      'three/examples/jsm/loaders/SVGLoader.js',
      'crypto-js/sha256',
      /* The lazy Play route must not trigger a dependency reload during a story. */
      '@react-three/drei/webgpu',
      '@react-three/fiber/webgpu',
      'three',
    ],
  },
  resolve: {
    /* Typings in the current Vite package lag behind docs/runtime support
       (same cast as .storybook/vite.config.ts). */
    ...({ tsconfigPaths: true } as Record<string, unknown>),
    alias: convexWorkerAliases,
  },
  plugins: [
    ...convexWorkerServePlugins(),
    pageStylesheetStaysWithItsStory(),
    viteReact(),
    reactCompiler(),
    storybookTest({ configDir: '.storybook' }),
  ],
  worker: {
    format: 'es',
    plugins: convexWorkerBuildPlugins,
  },
  test: {
    name: 'storybook',
    attachmentsDir: './test-results/storybook-attachments',
    /*
     * Every story file used to run in a fresh iframe, and the suite paid for that twice.
     * The preview annotations, Mantine styles and the Convex mock were imported again for every file, which Vitest's summary counted as 140 s of setup and 83 s of import across 126 files on the 4-vCPU runner.
     * The iframe itself was torn down and recreated between files, which no summary line reports.
     * With one iframe per browser session the module graph survives across the files that session runs.
     * Measured locally at the runner's three sessions, the suite went from 88 s to 52 s with coverage on, and 590 of 590 stories passed on four runs.
     * What a story leaves on the document now reaches the next file: the preview's beforeEach resets the color scheme and the motion override, and a story that needs a clean document cleans it itself.
     * A stylesheet a module imports for its side effect stays in the document head for the rest of the session, which is why the page stories carry the document stylesheet per story instead of importing it (see .storybook/pageStylesheet.ts).
     */
    isolate: false,
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
      screenshotFailures: true,
      screenshotDirectory: './test-results/storybook-screenshots',
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
