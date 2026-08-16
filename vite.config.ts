// import { devtools } from '@tanstack/devtools-vite';
import os from 'node:os';

import { tanstackStart } from '@tanstack/react-start/plugin/vite';
import viteReact from '@vitejs/plugin-react';
import { configDefaults, defineConfig } from 'vitest/config';

import { coverageExclude, coverageInclude } from './coverage-denominator';

/**
 * Codecov's bundle-report normalizer wildcards from the first `-` to the next `.`, so a dash or dot inside a base name either collapses distinct files into one normalized name (lato-latin-300-normal -> lato-*) or leaves the hash un-wildcarded (floating-ui.react-dom-<hash>).
 * Keep the hash as the only dash-delimited segment.
 */
const codecovSafeName = (name: string) => name.replace(/[-.]/g, '_');

const config = defineConfig({
  test: {
    exclude: [...configDefaults.exclude, 'e2e/**', '.claude/**', 'tools/**'],
    coverage: {
      provider: 'v8',
      reporter: ['text-summary', 'lcov'],
      /** Whole-codebase denominator; anything not listed (scripts/, e2e/, docs/, .storybook/) is out by omission. */
      include: coverageInclude,
      exclude: coverageExclude,
    },
  },
  build: {
    assetsDir: 'public', // will make your static assets appear under /public/
  },
  environments: {
    /**
     * Client-only: server chunk names never reach Codecov and TanStack Start owns the server entry layout.
     * These mirror
     * Vite's defaults (`<assetsDir>/[name]-[hash]...`) with the base name sanitized.
     */
    client: {
      build: {
        rollupOptions: {
          output: {
            entryFileNames: ({ name }) => `public/${codecovSafeName(name)}-[hash].js`,
            chunkFileNames: ({ name }) => `public/${codecovSafeName(name)}-[hash].js`,
            assetFileNames: (asset) => {
              const original = asset.names[0] ?? 'asset';
              const dot = original.lastIndexOf('.');
              const base = dot === -1 ? original : original.slice(0, dot);
              const ext = dot === -1 ? '' : original.slice(dot);
              return `public/${codecovSafeName(base)}-[hash]${ext}`;
            },
          },
        },
      },
    },
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
      /**
       * The Worker release assembly consumes `dist/client`.
       * Prerender must run or there is no SPA shell;
       * do not crawl the authenticated app.
       */
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
