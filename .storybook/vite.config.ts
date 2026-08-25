import viteReact from '@vitejs/plugin-react';
import { defineConfig } from 'vite';
import type { Plugin } from 'vite';

import {
  convexWorkerAliases,
  convexWorkerBuildPlugins,
  convexWorkerOptimizeDeps,
  convexWorkerOxc,
  convexWorkerServePlugins,
} from './worker-async-transform.ts';

/*
 * Only the URLs `verify:images` actually validates, which is narrower than the warning.
 * Vite reports the same way for a relative miss like `./missing.woff2`, and nothing checks those, so a filter on the message alone would bury a genuine broken reference (CodeRabbit, PR #614).
 */
const DEFERRED_ASSET_WARNING =
  /^\s*(?:\/(?:image|web|font)\/\S*|\/dice\.svg) referenced in [\s\S]*didn't resolve at build time/;

/**
 * Drops Vite's "didn't resolve at build time" warning for root-absolute asset URLs.
 * It fires once per asset, around 80 lines a build, and each one describes a deliberate arrangement rather than a problem: `publicDir` is false here and `staticDirs` mounts `public/` only in DEVELOPMENT, so these URLs are meant to survive the build untouched and resolve at runtime from whatever serves them.
 * This hides a message, so it is only honest while something else proves the files are there: `bun run verify:images` walks every `/image/`, `/web/`, `/font/` and `/dice.svg` reference in `src/` and fails when one is missing.
 * Keep the two in step.
 * A prefix silenced here has to be a prefix that check walks, or a typo in an asset URL becomes a runtime 404 nobody was told about.
 * Patches the resolved logger rather than passing `customLogger`, because supplying one replaces the logger Storybook installs and strips its formatting from every other message too.
 */
function quietDeferredAssetWarnings(): Plugin {
  return {
    name: 'dunezone:quiet-deferred-asset-warnings',
    configResolved(config) {
      /* `warnOnce` is the one that carries this message; `warn` is patched too so a future Vite can move it without the noise silently returning. */
      for (const method of ['warn', 'warnOnce'] as const) {
        const passThrough = config.logger[method].bind(config.logger);
        config.logger[method] = (message, options) => {
          if (DEFERRED_ASSET_WARNING.test(message)) {
            return;
          }
          passThrough(message, options);
        };
      }
    },
  };
}

export default defineConfig({
  build: {
    assetsDir: 'public',
    target: 'es2020',
  },
  define: {
    /**
     * Never copy a developer or production deployment URL into the public catalogue.
     * The global manual mock ignores this inert value when app database modules load.
     */
    'import.meta.env.VITE_CONVEX_URL': JSON.stringify('https://storybook.invalid'),
  },
  publicDir: false,
  /*
   * Keep Storybook on a modern target. The worker-only transform lowers async
   * functions without making Convex BigInt values invalid.
   */
  oxc: convexWorkerOxc,
  optimizeDeps: convexWorkerOptimizeDeps,
  resolve: {
    // Keep Storybook path resolution aligned with the app config.
    ...({ tsconfigPaths: true } as Record<string, unknown>),
    alias: convexWorkerAliases,
  },
  plugins: [...convexWorkerServePlugins(), viteReact(), quietDeferredAssetWarnings()],
  worker: {
    format: 'es',
    plugins: convexWorkerBuildPlugins,
  },
});
