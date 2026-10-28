/*
 * The script tests that launch Chromium, named once for both Vitest configs (#1590, item 6).
 * `vite.config.ts` keeps them out of `bun run test`, so the unit job installs no browser, and `vitest.browser-launch.config.ts` runs exactly these in the `browser_checks` job, which installs Chromium for the authoring tool's own end-to-end tests.
 * A test added here runs where a browser is; a browser-launching test left out fails in the unit job, which has none.
 */
export const browserLaunchTests = [
  'src/app/print/capture/captureSettle.browser.test.ts',
  'scripts/application-security.browser.test.ts',
  'scripts/faction-editor-readiness.browser.test.ts',
  'scripts/storybook-publication-images.test.ts',
  '.storybook/storyImagesWorker.test.ts',
  '.storybook/storyViewport.browser.test.ts',
  'src/app/routes/faqDetail.stories.fixture.browser.test.ts',
  'workers/storybook/media-transfer.browser.test.ts',
  'scripts/lib/synthetic-accounts.test.ts',
  'scripts/play-load/browsers.test.ts',
  'scripts/verify-hosted-cursor.test.ts',
];
