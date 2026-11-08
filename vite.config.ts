import os from 'node:os';
import { fileURLToPath } from 'node:url';

import { tanstackStart } from '@tanstack/react-start/plugin/vite';
import viteReact from '@vitejs/plugin-react';
import type { PluginOption, UserConfig } from 'vite-plus';
import { configDefaults, defineConfig } from 'vite-plus';

import {
  convexWorkerAliases,
  convexWorkerBuildPlugins,
  convexWorkerOptimizeDeps,
  convexWorkerServePlugins,
} from './.storybook/worker-async-transform.ts';
import { browserLaunchTests } from './browser-launch-tests.ts';
import { coverageExclude, coverageInclude } from './coverage-denominator.ts';
import { browserBundleBudgets, THREE_BUILD } from './scripts/lib/browserBundleBudgets.ts';
import { readJsonc } from './scripts/lib/jsonc.ts';
import { reactCompiler } from './scripts/lib/reactCompiler.ts';
import { threeRendererStackAliases, threeRendererStackTreeShaking } from './scripts/lib/threeRendererStack.ts';
import { unsyncedMediaPreview } from './scripts/lib/unsyncedMediaPreview.ts';

/**
 * Codecov's bundle-report normalizer wildcards from the first `-` to the next `.`, so a dash or dot inside a base name either collapses distinct files into one normalized name (lato-latin-300-normal -> lato-*) or leaves the hash un-wildcarded (floating-ui.react-dom-<hash>).
 * Keep the hash as the only dash-delimited segment.
 */
const codecovSafeName = (name: string) => name.replace(/[-.]/g, '_');

/* Server HTML and browser hydration must name imported assets identically. */
const publicAssetFileName = ({ names }: { names: readonly string[] }) => {
  const original = names[0] ?? 'asset';
  const dot = original.lastIndexOf('.');
  const base = dot === -1 ? original : original.slice(0, dot);
  const ext = dot === -1 ? '' : original.slice(dot);
  return `public/${codecovSafeName(base)}-[hash]${ext}`;
};

/**
 * Under Vitest each route's component stays in its route module instead of a lazy split chunk.
 * A split chunk loads on first render, so the page's module graph would be transformed inside the first test's timeout.
 * A route no test renders never loads its chunk, so its component lines would drop out of the coverage denominator.
 * The reference-file plugin writes the lazy import, so the run fails when that name is not found.
 */
/*
 * A creator tutorial runs the site's own Convex functions over an in-memory database in a Web Worker, as page stories do (src/app/db/sandbox).
 * That worker's code reads Node's AsyncLocalStorage, which resolves to the Zone.js slice in the browser only:
 * the server build keeps Node's own, which TanStack Start needs.
 */
function sandboxAsyncHooksInBrowser(): PluginOption {
  const slice = convexWorkerAliases['node:async_hooks'];
  return {
    name: 'dunezone:sandbox-async-hooks-in-browser',
    enforce: 'pre',
    resolveId(source) {
      if (source === 'node:async_hooks' && this.environment.config.consumer === 'client') {
        return slice;
      }
    },
  };
}

/**
 * The `ssr` environment's side-effect rule below drops unused Mantine imports from Rolldown 1.3.0 on.
 * The Rolldown inside vite-plus (1.2.14 in vite-plus 1.3.0, still 1.2.16 in vite-plus 1.5.0) ignores that rule for an external import that another chunk also uses and leaves a bare `import "@mantine/core"`, so this blanks exactly that line in server chunks.
 * The line stays (empty) so source maps keep their positions.
 * When a server build has no such line, the plugin warns that it can be deleted.
 */
function unusedMantineImportOnServer(): PluginOption {
  const bareImport = /^import "@mantine\/core";$/mu;
  return {
    name: 'dunezone:unused-mantine-import-on-server',
    applyToEnvironment: (environment) => environment.name === 'ssr',
    /* Rolldown writes a chunk's external imports after `renderChunk`, so the finished chunk is edited here. */
    generateBundle(_options, bundle) {
      let stripped = false;
      for (const output of Object.values(bundle)) {
        if (output.type === 'chunk' && bareImport.test(output.code)) {
          output.code = output.code.replace(bareImport, '');
          stripped = true;
        }
      }
      if (!stripped) {
        this.warn('No bare `import "@mantine/core"` left in the server build: delete unusedMantineImportOnServer.');
      }
    },
  };
}

/*
 * Vite's build report, which vite-plus logs as one message whose first line is an emitted file and its size, such as `dist/client/index.html  0.17 kB`.
 * If a later Vite logs it differently, the regex stops matching and the report prints again.
 */
const BUILD_REPORT_FILE_LINE = /^\S*dist\/\S+\s+[\d,.]+ kB/u;

/**
 * In CI, Vite's report of every emitted file (about 1,400 lines a build, 2,800 per deploy) is left out of the log.
 * The bundle budgets still print and fail on any oversized client chunk, and the build's `dist/` holds the files.
 * Their gzip sizes are then never shown, so CI skips computing them too (`reportCompressedSize` below).
 */
function quietBuildReportInCi(): PluginOption {
  return {
    name: 'dunezone:quiet-build-report-in-ci',
    apply: () => Boolean(process.env.CI),
    configResolved(config) {
      const passThrough = config.logger.info.bind(config.logger);
      config.logger.info = (message, options) => {
        if (BUILD_REPORT_FILE_LINE.test(message.trim())) {
          return;
        }
        passThrough(message, options);
      };
    },
  };
}

/* The same worker lowers every async function it can run, in development; the worker build lowers them below. */
function sandboxWorkerAsyncInDevelopment(): PluginOption {
  return convexWorkerServePlugins().map((plugin) => ({
    ...plugin,
    applyToEnvironment: (environment: { config: { consumer: string } }) => environment.config.consumer === 'client',
  }));
}

/*
 * The tutorial runs the game Worker's table in the browser, so in the client build that table's Node crypto imports
 * resolve to a Web Crypto slice. Nothing else is redirected: the server build and the tests keep Node's own.
 */
function gameTableCryptoInBrowser(): PluginOption {
  const slice = fileURLToPath(new URL('./src/app/routes/_app/tutorial/table/nodeCrypto.ts', import.meta.url));
  return {
    name: 'dunezone:game-table-crypto-in-browser',
    enforce: 'pre',
    resolveId(source, importer) {
      if (
        source === 'node:crypto' &&
        importer?.includes('/workers/game/') &&
        this.environment.config.consumer === 'client'
      ) {
        return slice;
      }
    },
  };
}

/*
 * App modules whose top level only declares: schemas, data helpers and UI components.
 * Rolldown keeps a module whose top level calls a function (such as `z.object()`) even when nothing uses its exports, so every page carried every domain's schemas through the route definitions.
 * Marked side-effect free, an unused one drops out; once any of its exports is used it keeps its statements, including the static-property and registry assignments under `src/app/ui`.
 * Styles keep their side effects: the pattern matches TypeScript only, and never a dependency's own `src/` folder.
 */
const APP_MODULES_WITHOUT_SIDE_EFFECTS = /^(?!.*\/node_modules\/).*\/src\/(?:shared|app\/db|app\/ui)\/[^?]*\.tsx?$/u;

/* Mantine's JavaScript entry; its package.json marks only CSS as having side effects. */
const MANTINE_JS = /^@mantine\/core$/u;

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
  /* Oxfmt and Oxlint keep their own config files, which scripts and docs read; Vite+ takes them from here. */
  fmt: readJsonc(fileURLToPath(new URL('./.oxfmtrc.json', import.meta.url))) as UserConfig['fmt'],
  lint: readJsonc(fileURLToPath(new URL('./.oxlintrc.json', import.meta.url))) as UserConfig['lint'],
  server: {
    proxy: process.env.PLAY_WORKER_URL ? { '/__play': { target: process.env.PLAY_WORKER_URL, ws: true } } : undefined,
  },
  test: {
    /* Standalone HTML exports need the compiled CSS Module classes and declarations, as they have no browser module loader. */
    css: { include: [/\.module\.css(?:\?.*)?$/, /\.css\?inline$/], modules: { classNameStrategy: 'scoped' } },
    /* The script tests that launch Chromium run through vitest.browser-launch.config.ts, where a browser is installed. */
    exclude: [...configDefaults.exclude, 'e2e/**', '.claude/**', 'tools/**', ...browserLaunchTests],
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
    /* browserBundleBudgets fails any client chunk over its budget, so Vite's 500 kB advisory only repeats it. */
    chunkSizeWarningLimit: Number.POSITIVE_INFINITY,
    /* CI hides the per-file report (quietBuildReportInCi), so it skips gzipping every file just to size it. */
    reportCompressedSize: !process.env.CI,
    rollupOptions: {
      /* The per-build plugin timing report printed on every build and every CI run; profile locally instead. */
      checks: { bundlerTimings: false },
      onLog(level, log, handler) {
        /* linkedom's vendored worker build uses direct eval; the published reader only calls its parseHTML. */
        if (log.code === 'EVAL' && log.id?.includes('/linkedom/')) {
          return;
        }
        handler(level, log);
      },
      output: { assetFileNames: publicAssetFileName },
    },
  },
  environments: {
    /*
     * Mantine's JavaScript has no side effects (its package.json lists only CSS), so an import of it whose bindings
     * all went unused is dropped. Without this, the server router chunk keeps a bare `import "@mantine/core"`, which
     * Wrangler's bundler drops with a warning on every build and dry run.
     */
    ssr: {
      build: {
        rollupOptions: {
          treeshake: { moduleSideEffects: [{ test: MANTINE_JS, external: true, sideEffects: false }] },
        },
      },
    },
    /**
     * Client-only: server chunk names never reach Codecov and TanStack Start owns the server entry layout.
     * These mirror
     * Vite's defaults (`<assetsDir>/[name]-[hash]...`) with the base name sanitized.
     */
    client: {
      build: {
        rollupOptions: {
          treeshake: { moduleSideEffects: [{ test: APP_MODULES_WITHOUT_SIDE_EFFECTS, sideEffects: false }] },
          output: {
            codeSplitting: {
              groups: [
                { name: 'lucide', test: /\/lucide-react\//u, maxSize: 500_000, entriesAware: true },
                /* Three's three builds share one vendor chunk, the shape the bundle budget recognises, whichever renderer modules import them. */
                { name: 'three', test: THREE_BUILD },
                { name: 'media-index', test: /\/src\/app\/routes\/_app\/media\/media-index\.json$/u },
              ],
            },
            entryFileNames: ({ name }) => `public/${codecovSafeName(name)}-[hash].js`,
            chunkFileNames: ({ name }) => `public/${codecovSafeName(name)}-[hash].js`,
          },
        },
      },
    },
  },
  publicDir: 'public',
  /* The sandbox worker's bundle, lowered and checked for native async, with no storage URL of a real deployment. */
  worker: {
    format: 'es',
    plugins: () => [...convexWorkerBuildPlugins(), sandboxAsyncHooksInBrowser()],
    /* The same file names as the client's chunks, which the Worker's asset manifest holds to one pattern. */
    rolldownOptions: {
      /*
       * convex-test takes lazy import.meta.glob loaders, and the Convex worker also imports those modules statically,
       * so every loader reported as an ineffective dynamic import. That worker is one bundle either way. This option
       * covers every browser worker bundle; today that is the Convex worker and its protocol probe, and a new worker
       * that relies on dynamic imports for splitting should check its chunks by hand (onLog/onwarn here never see
       * these warnings).
       */
      checks: { bundlerTimings: false, ineffectiveDynamicImport: false },
      output: {
        entryFileNames: ({ name }) => `public/${codecovSafeName(name)}-[hash].js`,
        chunkFileNames: ({ name }) => `public/${codecovSafeName(name)}-[hash].js`,
        assetFileNames: publicAssetFileName,
      },
    },
  },
  /* The dev server's prebundled fiber and drei run the same code as the build. */
  optimizeDeps: {
    /* The sandbox worker's packages stay on the transform path that lowers their async functions. */
    exclude: convexWorkerOptimizeDeps.exclude,
    include: convexWorkerOptimizeDeps.include,
    rolldownOptions: { plugins: [threeRendererStackTreeShaking()] },
  },
  resolve: {
    tsconfigPaths: true,
    alias: [
      {
        find: 'application-ssr-runtime',
        replacement: fileURLToPath(
          new URL('./node_modules/@tanstack/react-start/dist/default-entry/esm/server.js', import.meta.url)
        ),
      },
      {
        find: 'rulebook-html-renderer-runtime',
        replacement: fileURLToPath(new URL('./src/app/print/rulebookHtmlRuntime.ts', import.meta.url)),
      },
      ...threeRendererStackAliases,
    ],
  },
  plugins: withoutRouteSplittingInVitest([
    unsyncedMediaPreview(fileURLToPath(new URL('.', import.meta.url))),
    gameTableCryptoInBrowser(),
    sandboxAsyncHooksInBrowser(),
    sandboxWorkerAsyncInDevelopment(),
    unusedMantineImportOnServer(),
    quietBuildReportInCi(),
    tanstackStart({
      srcDirectory: './src/app',
      start: { entry: './routes/start.ts' },
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
    browserBundleBudgets(),
    viteReact(),
    reactCompiler(),
    threeRendererStackTreeShaking(),
  ]),
});

export default config;
