import { fileURLToPath } from 'node:url';

import { parseSync, transformWithOxc } from 'vite';
import type { Plugin } from 'vite';

const SCRIPT_FILE = /\.[cm]?[jt]sx?$/;
const WORKER_PACKAGE_PATHS = [
  '/node_modules/@auth/core/',
  '/node_modules/@convex-dev/aggregate/',
  '/node_modules/@convex-dev/auth/',
  '/node_modules/@convex-dev/migrations/',
  '/node_modules/@oslojs/',
  '/node_modules/@panva/hkdf/',
  '/node_modules/cookie/',
  '/node_modules/convex/',
  '/node_modules/convex-helpers/',
  '/node_modules/convex-test/',
  '/node_modules/jose/',
  '/node_modules/lucia/',
  '/node_modules/oauth4webapi/',
  '/node_modules/preact/',
  '/node_modules/preact-render-to-string/',
  '/node_modules/unicode-segmenter/',
  '/node_modules/zod/',
];

function containsNativeAsync(value: unknown, seen = new Set<object>()): boolean {
  if (!value || typeof value !== 'object') {
    return false;
  }
  if (seen.has(value)) {
    return false;
  }
  seen.add(value);
  const node = value as Record<string, unknown>;
  if (node.type === 'AwaitExpression' || node.async === true) {
    return true;
  }
  return Object.values(node).some((child) => containsNativeAsync(child, seen));
}

function assertNoNativeAsync(code: string, filename: string) {
  const { program } = parseSync(filename, code, { lang: 'js', sourceType: 'module' });
  if (containsNativeAsync(program)) {
    throw new Error(`The Convex Storybook worker retained native async syntax in ${filename}.`);
  }
}

export const convexWorkerOxc = { target: 'es2020' } as const;

export const convexWorkerOptimizeDeps = {
  /* PROTOTYPE: Optimized dependencies bypass Vite's Oxc transform and retain native await.
     Keep the complete Convex server closure on the transform path. */
  exclude: [
    '@auth/core',
    '@auth/core/providers/discord',
    '@auth/core/providers/google',
    '@convex-dev/aggregate',
    '@convex-dev/auth/providers/Password',
    '@convex-dev/auth/server',
    '@convex-dev/migrations',
    'convex/server',
    'convex/values',
    'convex-helpers',
    'convex-helpers/server/customFunctions',
    'convex-helpers/server/triggers',
    'convex-helpers/server/zod4',
    'convex-helpers/validators',
    'convex-test',
  ],
  include: ['@auth/core > cookie', 'zone.js'],
};

export const convexWorkerAliases = {
  'node:async_hooks': fileURLToPath(new URL('./async-hooks.ts', import.meta.url)),
};

function isolateConvexTestStorageUrls(): Plugin {
  return {
    name: 'dunezone:isolate-convex-test-storage-urls',
    enforce: 'pre',
    transform(code, id) {
      if (!id.includes('/convex-test/dist/index.js')) {
        return;
      }
      return code
        .replaceAll('https://some-deployment.convex.cloud', 'https://storybook.invalid')
        .replaceAll('https://some.convex.site', 'https://storybook.invalid');
    },
  };
}

/**
 * PROTOTYPE: lowers every async function that can enter the Convex worker.
 * Storybook itself keeps a modern target so Convex BigInt values remain valid.
 */
function lowerConvexWorkerAsync({
  serveOnly = false,
  verifyBundle = false,
}: { serveOnly?: boolean; verifyBundle?: boolean } = {}): Plugin {
  return {
    name: 'dunezone:lower-convex-worker-async',
    apply: serveOnly ? 'serve' : undefined,
    enforce: 'pre',
    async transform(code, id) {
      const filename = id.split('?', 1)[0];
      const belongsToWorkerClosure =
        filename.includes('/convex/') ||
        filename.includes('/src/shared/') ||
        filename.endsWith('/src/app/db/core/convexTest.worker.ts') ||
        WORKER_PACKAGE_PATHS.some((packagePath) => filename.includes(packagePath));
      if (!belongsToWorkerClosure || !SCRIPT_FILE.test(filename)) {
        return;
      }
      const result = await transformWithOxc(code, filename, { target: 'es2016' });
      assertNoNativeAsync(result.code, filename);
      return { code: result.code, map: result.map };
    },
    generateBundle(_options, bundle) {
      if (!verifyBundle) {
        return;
      }
      for (const [filename, output] of Object.entries(bundle)) {
        if (output.type === 'chunk') {
          try {
            assertNoNativeAsync(output.code, filename);
          } catch (error) {
            const modules = Object.keys(output.modules).join(', ');
            throw new Error(`${error instanceof Error ? error.message : String(error)} Sources: ${modules}`);
          }
        }
      }
    },
  };
}

export function convexWorkerServePlugins(): Plugin[] {
  return [lowerConvexWorkerAsync({ serveOnly: true })];
}

export function convexWorkerBuildPlugins(): Plugin[] {
  return [lowerConvexWorkerAsync({ verifyBundle: true }), isolateConvexTestStorageUrls()];
}
