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
   * One worker everywhere.
   * CI runs the suite as shards, each a machine of its own (e2e/shards.json), because three files at once on one machine cost every test 2.5 times its uncontended time and put the longest at 87% of its kill (#1050).
   * Tests within a file stay ordered.
   */
  workers: 1,
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
        /* Transitions off for the journeys: a click waits for its target to stop moving, and nothing a journey proves needs the movement. The animation project above keeps motion because the hero's transition is what it asserts. Measured at no timing effect on #1050 and passing 30 of 30 three times. */
        reducedMotion: 'reduce',
      },
    },
  ],
});
