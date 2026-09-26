// import { devtools } from '@tanstack/devtools-vite';
import os from 'node:os';
import { fileURLToPath } from 'node:url';

import { tanstackStart } from '@tanstack/react-start/plugin/vite';
import viteReact from '@vitejs/plugin-react';
import type { PluginOption } from 'vite';
import { configDefaults, defineConfig } from 'vitest/config';

import { coverageExclude, coverageInclude } from './coverage-denominator.ts';
import { reactCompiler } from './scripts/lib/reactCompiler.ts';

/**
 * Codecov's bundle-report normalizer wildcards from the first `-` to the next `.`, so a dash or dot inside a base name either collapses distinct files into one normalized name (lato-latin-300-normal -> lato-*) or leaves the hash un-wildcarded (floating-ui.react-dom-<hash>).
 * Keep the hash as the only dash-delimited segment.
 */
const codecovSafeName = (name: string) => name.replace(/[-.]/g, '_');

/**
 * Under Vitest each route's component stays in its route module instead of a lazy split chunk.
 * A split chunk loads on first render, so the page's module graph would be transformed inside the first test's timeout.
 * A route no test renders never loads its chunk, so its component lines would drop out of the coverage denominator.
 * The reference-file plugin writes the lazy import, so the run fails when that name is not found.
 */
function withoutRouteSplittingInVitest(plugins: PluginOption[]): PluginOption[] {
  if (!process.env.VITEST) {
    return plugins;
  }
  const removed: string[] = [];
  const strip = (options: PluginOption[]): PluginOption[] =>
    options.flatMap((option) => {
      if (Array.isArray(option)) {
        return [strip(option)];
      }
      if (option && 'name' in option && option.name.startsWith('tanstack-router:code-splitter:')) {
        removed.push(option.name);
        return [];
      }
      return [option];
    });
  const kept = strip(plugins);
  if (!removed.includes('tanstack-router:code-splitter:compile-reference-file')) {
    throw new Error('No tanstack-router:code-splitter:compile-reference-file plugin to remove under Vitest.');
  }
  return kept;
}

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
    alias: {
      'rulebook-html-renderer-runtime': fileURLToPath(
        new URL('./src/app/print/rulebookHtmlRuntime.ts', import.meta.url)
      ),
    },
  },
  plugins: withoutRouteSplittingInVitest([
    // devtools(),
    tanstackStart({
      srcDirectory: './src/app',
      router: {
        /**
         * A route file is `index.tsx`, or its last dot-segment is `route` (`create.route.tsx`, `edit/route.tsx`).
         * Every other source file under `routes/` is a co-located module and is never scanned, so it needs no `-` prefix.
         */
        routeFileIgnorePattern: String.raw`^(?!(index|__root)\.[jt]sx?$|(.*\.)?route\.[jt]sx?$).*\.[jt]sx?$`,
      },
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
    reactCompiler(),
  ]),
});

export default config;
