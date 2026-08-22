import { defineConfig, devices } from '@playwright/test';

const port = 4175;

export default defineConfig({
  testDir: './e2e',
  testMatch: /rulebook-text-links-prototype\.spec\.ts/,
  outputDir: 'test-results/rulebook-text-links',
  timeout: 45_000,
  expect: { timeout: 10_000 },
  fullyParallel: false,
  workers: 1,
  reporter: [['list'], ['html', { open: 'never', outputFolder: 'playwright-report/rulebook-text-links' }]],
  use: {
    baseURL: `http://127.0.0.1:${port}`,
    headless: true,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: {
    command: `VITE_CONVEX_URL=https://quiet-otter-123.convex.cloud bunx vite dev --host 127.0.0.1 --port ${port}`,
    url: `http://127.0.0.1:${port}/__rulebook-text-links-prototype`,
    reuseExistingServer: false,
    timeout: 120_000,
  },
});
