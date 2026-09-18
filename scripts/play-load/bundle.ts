import path from 'node:path';

import { build } from 'esbuild';

const entry = path.resolve(import.meta.dirname, 'run.mjs');
const runnerBundle = path.resolve(import.meta.dirname, 'run.bundle.mjs');

/**
 * The coordinator runs under Node, whose type stripping resolves no extensionless TypeScript import.
 * Bundling the runner and the shared modules it reaches keeps the runtime and lets the modules keep their imports.
 * Dependencies stay external, and the bundle sits beside the runner so its relative paths resolve unchanged.
 */
export async function bundleRunner() {
  await build({
    entryPoints: [entry],
    outfile: runnerBundle,
    bundle: true,
    platform: 'node',
    format: 'esm',
    target: 'node22',
    packages: 'external',
    logLevel: 'silent',
  });
  return runnerBundle;
}

if (process.argv[1] && path.resolve(process.argv[1]) === new URL(import.meta.url).pathname) {
  console.log(await bundleRunner());
}
