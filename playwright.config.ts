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
    /* Its own project because it needs a signed-out browser and real motion. Nothing depends on
       it: it used to gate the suite so it ran alone before three workers started, and once the
       suite was sharded one worker per machine that gate cost a third of the suite per starved
       sample, three draws per run (#1052). It is listed in one shard like any other file. */
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
      use: {
        ...devices['Desktop Chrome'],
        storageState: '.playwright/user-a.json',
        /* Transitions off for the journeys: a click waits for its target to stop moving, and nothing a journey proves needs the movement. The animation project above keeps motion because the hero's transition is what it asserts. A bare `reducedMotion` key under `use` is not a test option in this Playwright and is silently ignored, which is how a measurement round on #1050 measured nothing; `contextOptions` is the spelling the runner applies. */
        contextOptions: { reducedMotion: 'reduce' },
      },
    },
  ],
});
