/*
 * The Vitest run of the script tests that launch Chromium: `bun run test:browser-launch`.
 * They drive Playwright against local stand-in servers and need none of the app's plugins, so the config is the list alone; `vite.config.ts` excludes the same files from the unit run.
 */
import { defineConfig } from 'vitest/config';

import { browserLaunchTests } from './browser-launch-tests.ts';

export default defineConfig({
  test: {
    include: browserLaunchTests,
  },
});
