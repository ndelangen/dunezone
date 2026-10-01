/*
 * The script tests that launch Chromium, named once for both Vitest configs (#1590, item 6).
 * `vite.config.ts` keeps them out of `bun run test`, so the unit job installs no browser, and `vitest.browser-launch.config.ts` runs exactly these in the `tool_e2e` job, which installs Chromium for the authoring tool's own end-to-end tests.
 * A test added here runs where a browser is; a browser-launching test left out fails in the unit job, which has none.
 */
export const browserLaunchTests = [
  'scripts/lib/synthetic-accounts.test.mjs',
  'scripts/play-load/browsers.test.mjs',
  'scripts/verify-hosted-cursor.test.mjs',
];
