/*
 * The repository files a set of entry points imports, transitively, as esbuild resolves them.
 * The contract tests that hold a hand-kept file list to the code (`scripts/hosted-play-closure.test.ts`, `scripts/ci-job-inputs.test.ts`) walk the graph through here.
 */
import { resolve } from 'node:path';

import { build } from 'esbuild';

import { byCodeUnit } from './storybook-shards';

/* Assets the bundler would otherwise try to read; their bytes are not code. */
const ASSET_EXTENSIONS = [
  '.css',
  '.png',
  '.jpg',
  '.webp',
  '.svg',
  '.gif',
  '.woff',
  '.woff2',
  '.ttf',
  '.mp3',
  '.glb',
  '.hdr',
  '.wasm',
  '.html',
];

/**
 * Every repository file the entry points import, in code-unit order.
 * `outside` names the imports the graph stops at: an absolute url, for instance, names a file under public/ a page loads at run time.
 */
export async function importedFiles(
  root: string,
  entries: readonly string[],
  outside: RegExp,
  outdir: string
): Promise<string[]> {
  const result = await build({
    absWorkingDir: root,
    entryPoints: entries.map((entry) => resolve(root, entry)),
    bundle: true,
    write: false,
    outdir: resolve(root, outdir),
    metafile: true,
    packages: 'external',
    platform: 'neutral',
    format: 'esm',
    logLevel: 'silent',
    tsconfig: resolve(root, 'tsconfig.json'),
    /* The publisher Worker imports its rulebook renderer through a Vite alias; the graph follows it to the runtime source. */
    alias: { 'rulebook-html-renderer-runtime': './src/app/print/rulebookHtmlRuntime.ts' },
    loader: Object.fromEntries(ASSET_EXTENSIONS.map((extension) => [extension, 'empty'])),
    plugins: [
      {
        name: 'outside-the-graph',
        setup(bundler) {
          bundler.onResolve({ filter: outside }, (args) => (args.kind === 'entry-point' ? null : { external: true }));
        },
      },
    ],
  });
  /* A stylesheet imported with `?inline` is the same file. */
  const files = Object.keys(result.metafile.inputs).map((file) => file.replace(/\?.*$/u, ''));
  return [...new Set(files)]
    .filter((file) => !file.startsWith('node_modules/') && !file.includes(':'))
    .sort(byCodeUnit);
}
