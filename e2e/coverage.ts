/*
 * Chromium V8 coverage for the e2e suite, opt-in via E2E_COVERAGE=1. Each test
 * collects V8 entries and feeds them to monocart-coverage-reports, which
 * persists raw data to the shared outputDir cache across Playwright workers;
 * global-teardown.ts generates the final lcov report.
 * @see docs/research/combined-coverage-codecov.md §4 (recipe validated on
 * branch prototype/combined-coverage)
 */
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';

import { test as base, expect } from '@playwright/test';
import type { BrowserContext, BrowserContextOptions, Page } from '@playwright/test';
import MCR from 'monocart-coverage-reports';
import type { CoverageReportOptions } from 'monocart-coverage-reports';

export const coverageEnabled = process.env.E2E_COVERAGE === '1';

/**
 * V8 collection costs the long specs real headroom in CI: faction-lifecycle ran 78s of its 90s budget on a green coverage run and over it on a slower runner.
 * Coverage runs get 1.5x.
 */
export const longSpecTimeoutMs = coverageEnabled ? 135_000 : 90_000;

export const mcrOptions: CoverageReportOptions = {
  name: 'e2e coverage',
  outputDir: 'coverage/e2e',
  reports: [['lcovonly'], ['console-summary']],
  /*
   * Built chunks are served under /public/ (vite build.assetsDir) and map back to src/ via their
   * sourcemaps; the /src/ arm keeps dev-server runs working (transform-in-place module URLs).
   * Everything else — dep bundles, vite client internals — is not ours to count.
   */
  entryFilter: (entry) => entry.url.includes('/src/') || /\/public\/[^?]*\.js$/.test(entry.url.split('?')[0] ?? ''),
  /*
   * Two shapes arrive here. Built chunks: filePath is the sourcemap-resolved repo path
   * ("src/app/..."), info.distFile the chunk. Dev modules: filePath is a bare filename
   * ("AppRoot.tsx"), info.distFile the served repo path. Whichever candidate contains src/ wins.
   */
  sourcePath: (filePath, info) => {
    for (const candidate of [filePath, (info as { distFile?: string } | undefined)?.distFile]) {
      const i = candidate?.indexOf('src/') ?? -1;
      if (i >= 0 && candidate) {
        return candidate.slice(i);
      }
    }
    return filePath;
  },
  /*
   * The on-disk check drops dependency sourcemaps whose sources also start with src/ (e.g.
   * lucide-react ships src/utils/*.mjs) and synthetic modules (route-split virtuals, unmapped
   * chunks) that have no repo file.
   */
  sourceFilter: (sourcePath) => sourcePath.startsWith('src/') && existsSync(resolve(sourcePath)),
};

/**
 * The animation project asserts per-frame samples and runs isolated;
 * V8 precise coverage adds in-page overhead it cannot afford.
 */
const shouldCollect = () => coverageEnabled && test.info().project.name !== 'animation';

const startCollecting = (page: Page) => page.coverage.startJSCoverage({ resetOnNavigation: false });

/**
 * Collection must happen while the page's CDP session is alive — after the context closes, the coverage is unrecoverable.
 */
async function collectInto(page: Page): Promise<void> {
  const entries = await page.coverage.stopJSCoverage();
  await MCR(mcrOptions).add(entries);
}

/**
 * Factory fixture: coverage-aware replacement for `browser.newContext()` + `context.newPage()` in multi-user specs.
 * Prefer closing via the returned `close`;
 * any page still open when the test ends — including when it fails mid-test — is collected and closed by the fixture teardown, so coverage is never silently dropped.
 */
type NewUserPage = (options: BrowserContextOptions) => Promise<{
  page: Page;
  close: () => Promise<void>;
}>;

interface OpenedPage {
  page: Page;
  context: BrowserContext;
  collect: boolean;
  closed: boolean;
}

export const test = base.extend<{ newUserPage: NewUserPage }>({
  page: async ({ page }, use) => {
    const collect = shouldCollect();
    if (collect) {
      await startCollecting(page);
    }
    await use(page);
    if (collect) {
      await collectInto(page);
    }
  },
  newUserPage: async ({ browser }, use) => {
    const opened: OpenedPage[] = [];
    await use(async (options) => {
      const context = await browser.newContext(options);
      const page = await context.newPage();
      const collect = shouldCollect();
      if (collect) {
        await startCollecting(page);
      }
      const entry: OpenedPage = { page, context, collect, closed: false };
      opened.push(entry);
      return {
        page,
        close: async () => {
          entry.closed = true;
          try {
            if (collect) {
              await collectInto(page);
            }
          } finally {
            await context.close();
          }
        },
      };
    });
    for (const entry of opened) {
      if (entry.closed) {
        continue;
      }
      try {
        if (entry.collect) {
          await collectInto(entry.page);
        }
      } finally {
        await entry.context.close();
      }
    }
  },
});

export { expect };
