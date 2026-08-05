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
  workers: 1,
  globalSetup: './e2e/global-setup.ts',
  reporter: [['list'], ['html', { open: 'never', outputFolder: 'playwright-report' }]],
  use: {
    baseURL: baseUrl,
    headless: process.env.PLAYWRIGHT_HEADLESS === 'true',
    trace: 'on',
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
