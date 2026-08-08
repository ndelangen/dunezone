// PROTOTYPE — throwaway config for the combined-coverage experiment.
// Runs only the coverage smoke spec against a bare `vite dev` (no Convex
// backend, no auth global-setup). See docs/research/combined-coverage-codecov.md.
import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: '.',
  testMatch: /coverage-smoke\.prototype\.spec\.ts/,
  outputDir: '../test-results/playwright-prototype',
  timeout: 60_000,
  workers: 1,
  reporter: [['list']],
  use: {
    baseURL: 'http://localhost:6001',
    ...devices['Desktop Chrome'],
    headless: true,
  },
  webServer: {
    command: 'npx vite dev --port 6001 --strictPort',
    cwd: '..',
    url: 'http://localhost:6001',
    reuseExistingServer: true,
    timeout: 60_000,
    env: {
      VITE_CONVEX_URL: 'https://example.convex.cloud',
    },
  },
});
