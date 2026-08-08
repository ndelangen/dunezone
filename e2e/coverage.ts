// Chromium V8 coverage for the e2e suite, opt-in via E2E_COVERAGE=1.
// Design: docs/research/combined-coverage-codecov.md §4; recipe validated on
// branch prototype/combined-coverage. Each test collects V8 entries and feeds
// them to monocart-coverage-reports, which persists raw data to the shared
// outputDir cache across Playwright workers; global-teardown.ts generates the
// final lcov report.
import { test as base, expect } from '@playwright/test';
import type { Browser, BrowserContextOptions, Page } from '@playwright/test';
import MCR from 'monocart-coverage-reports';
import type { CoverageReportOptions } from 'monocart-coverage-reports';

export const coverageEnabled = process.env.E2E_COVERAGE === '1';

export const mcrOptions: CoverageReportOptions = {
  name: 'e2e coverage',
  outputDir: 'coverage/e2e',
  reports: [['lcovonly'], ['console-summary']],
  // Only modules served from the app's /src tree; dev-server dep bundles and
  // vite client internals are not ours to count.
  entryFilter: (entry) => entry.url.includes('/src/'),
  // Vite dev inline sourcemaps carry bare filenames ("AppShell.tsx");
  // info.distFile holds the served path, which IS the repo path for
  // transform-in-place dev modules. Remap first, then filter.
  sourcePath: (filePath, info) => {
    const served = (info as { distFile?: string } | undefined)?.distFile ?? filePath;
    const i = served.indexOf('src/');
    return i >= 0 ? served.slice(i) : served;
  },
  sourceFilter: (sourcePath) => sourcePath.startsWith('src/'),
};

const shouldCollect = () => coverageEnabled && test.info().project.name !== 'animation';

/**
 * Coverage-aware replacement for `browser.newContext()` + `context.newPage()`. The returned `close`
 * collects the page's V8 coverage (when enabled) before closing the context — after close the CDP
 * session is gone and coverage is unrecoverable, so always close through it.
 */
export async function newCoveredPage(
  browser: Browser,
  options: BrowserContextOptions
): Promise<{ page: Page; close: () => Promise<void> }> {
  const context = await browser.newContext(options);
  const page = await context.newPage();
  const collect = shouldCollect();
  if (collect) {
    await page.coverage.startJSCoverage({ resetOnNavigation: false });
  }
  return {
    page,
    close: async () => {
      if (collect) {
        const entries = await page.coverage.stopJSCoverage();
        await MCR(mcrOptions).add(entries);
      }
      await context.close();
    },
  };
}

export const test = base.extend({
  page: async ({ page }, use) => {
    // The animation project asserts per-frame samples and runs isolated;
    // V8 precise coverage adds in-page overhead it cannot afford.
    const collect = shouldCollect();
    if (collect) {
      await page.coverage.startJSCoverage({ resetOnNavigation: false });
    }
    await use(page);
    if (collect) {
      const entries = await page.coverage.stopJSCoverage();
      await MCR(mcrOptions).add(entries);
    }
  },
});

export { expect };
