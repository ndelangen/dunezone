// PROTOTYPE — throwaway config for the combined-coverage experiment.
// Runs stories as Vitest browser-mode tests via @storybook/addon-vitest.
// See docs/research/combined-coverage-codecov.md.
import { storybookTest } from '@storybook/addon-vitest/vitest-plugin';
import viteReact from '@vitejs/plugin-react';
import { playwright } from '@vitest/browser-playwright';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  // Mirrors .storybook/vite.config.ts (the addon does not load the custom
  // builder viteConfigPath on its own).
  define: {
    'import.meta.env.VITE_CONVEX_URL': JSON.stringify('storybook-disconnected'),
  },
  resolve: {
    ...({ tsconfigPaths: true } as Record<string, unknown>),
  },
  plugins: [viteReact(), storybookTest({ configDir: '.storybook' })],
  test: {
    name: 'storybook',
    browser: {
      enabled: true,
      provider: playwright(),
      headless: true,
      instances: [{ browser: 'chromium' }],
    },
    setupFiles: ['.storybook/vitest.setup.prototype.ts'],
    coverage: {
      enabled: true,
      provider: 'v8',
      reporter: ['lcov', 'text-summary'],
      reportsDirectory: 'coverage/storybook',
    },
  },
});
