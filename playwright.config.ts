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
  // Spec files run in parallel workers; tests within a file stay ordered.
  // Every spec file carries its own auth session (see global-setup), which is
  // what makes cross-file parallelism safe under Convex Auth token rotation.
  workers: process.env.CI ? 3 : 1,
  globalSetup: './e2e/global-setup.ts',
  reporter: [['list'], ['html', { open: 'never', outputFolder: 'playwright-report' }]],
  use: {
    baseURL: baseUrl,
    headless: process.env.PLAYWRIGHT_HEADLESS === 'true',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
  },
  projects: [
    {
      name: 'userA',
      use: {
        ...devices['Desktop Chrome'],
        storageState: '.playwright/user-a.json',
      },
    },
  ],
});
