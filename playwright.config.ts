import { defineConfig, devices } from '@playwright/test';

const baseUrl = process.env.PLAYWRIGHT_BASE_URL ?? 'http://localhost:6001';

export default defineConfig({
  testDir: './e2e',
  outputDir: 'test-results/playwright',
  timeout: 45_000,
  expect: {
    timeout: 10_000,
  },
  fullyParallel: false,
  /**
   * Spec files run in parallel workers;
   * tests within a file stay ordered.
   * Every spec file carries its own auth session
   * (see global-setup), which is what makes cross-file parallelism safe under Convex Auth token rotation.
   */
  workers: process.env.CI ? 3 : 1,
  globalSetup: './e2e/global-setup.ts',
  // Generates the e2e lcov report when E2E_COVERAGE=1 (no-op otherwise).
  globalTeardown: './e2e/global-teardown.ts',
  reporter: [
    ['list'],
    ['html', { open: 'never', outputFolder: 'playwright-report' }],
    // Consumed by Codecov Test Analytics in CI; harmless locally.
    ['junit', { outputFile: 'test-results/playwright.junit.xml' }],
  ],
  use: {
    baseURL: baseUrl,
    headless: process.env.PLAYWRIGHT_HEADLESS === 'true',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
  },
  projects: [
    /* Runs alone, before everything else: this spec asserts on per-frame
       animation samples, which starve when parallel workers compete for CPU. */
    {
      name: 'animation',
      testMatch: /page-header-transition\.spec\.ts/,
      use: {
        ...devices['Desktop Chrome'],
      },
    },
    {
      name: 'userA',
      testIgnore: /page-header-transition\.spec\.ts/,
      dependencies: ['animation'],
      use: {
        ...devices['Desktop Chrome'],
        storageState: '.playwright/user-a.json',
      },
    },
  ],
});
