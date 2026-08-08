// PROTOTYPE — throwaway spec for the combined-coverage experiment.
// Validates: Chromium V8 coverage API -> monocart-coverage-reports -> lcov
// with repo-relative source paths, against the vite-dev-served app.
// See docs/research/combined-coverage-codecov.md.
import { test } from '@playwright/test';
import MCR from 'monocart-coverage-reports';

test('collect V8 coverage across app routes', async ({ page }) => {
  await page.coverage.startJSCoverage({ resetOnNavigation: false });

  // Without a backend the routes render their loading/error states; the
  // point is that the route modules load and execute in the browser.
  for (const route of ['/', '/factions', '/rulesets', '/privacy']) {
    await page.goto(route, { waitUntil: 'networkidle' }).catch(() => {});
    await page.waitForTimeout(500);
  }

  const entries = await page.coverage.stopJSCoverage();
  console.log(`V8 coverage entries collected: ${entries.length}`);
  const mcr = MCR({
    name: 'e2e prototype coverage',
    outputDir: 'coverage/e2e',
    reports: [['lcovonly'], ['console-summary']],
    entryFilter: (entry: { url: string }) => entry.url.includes('localhost:6001/src/'),
    // Vite dev inline sourcemaps carry bare filenames ("AppShell.tsx");
    // info.distFile holds the served path, which IS the repo path for
    // transform-in-place dev modules. Remap first, then filter.
    sourcePath: (filePath: string, info?: { distFile?: string }) =>
      (info?.distFile ?? filePath).replace(/^localhost-6001\//, ''),
    sourceFilter: (sourcePath: string) => sourcePath.startsWith('src/'),
  });
  await mcr.add(entries);
  await mcr.generate();
});
