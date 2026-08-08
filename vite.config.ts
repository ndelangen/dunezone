// import { devtools } from '@tanstack/devtools-vite';
import os from 'node:os';

import { tanstackStart } from '@tanstack/react-start/plugin/vite';
import viteReact from '@vitejs/plugin-react';
import { configDefaults, coverageConfigDefaults, defineConfig } from 'vitest/config';

const config = defineConfig({
  test: {
    exclude: [...configDefaults.exclude, 'e2e/**', '.claude/**'],
    coverage: {
      provider: 'v8',
      reporter: ['text-summary', 'lcov'],
      // Whole-codebase denominator; anything not listed (scripts/, e2e/,
      // docs/, .storybook/) is out by omission. Decided in
      // https://github.com/ndelangen/dunezone/issues/301
      include: ['src/**/*.{ts,tsx}', 'convex/**/*.ts', 'workers/**/*.ts'],
      exclude: [
        ...coverageConfigDefaults.exclude,
        // Local publisher build output (gitignored, but present on dev machines).
        'workers/publisher/dist/**',
        '**/*.stories.tsx',
        'src/game/fixtures/**',
        'convex/_generated/**',
        '**/*.gen.ts',
        '**/*.generated.ts',
        '**/*.d.ts',
      ],
    },
  },
  build: {
    assetsDir: 'public', // will make your static assets appear under /public/
  },
  publicDir: 'public',
  // Typings in the current Vite package lag behind docs/runtime support.
  resolve: {
    ...({ tsconfigPaths: true } as Record<string, unknown>),
  },
  plugins: [
    // devtools(),
    tanstackStart({
      srcDirectory: './src/app',
      // The Worker release assembly consumes `dist/client`. Prerender must run or there is no SPA
      // shell; do not crawl the authenticated app.
      prerender: {
        concurrency: Math.max(1, os.cpus().length),
        crawlLinks: false,
      },
      spa: {
        enabled: true,
        prerender: {
          headers: {
            Connection: 'close',
          },
        },
      },
    }),
    viteReact(),
  ],
});

export default config;
