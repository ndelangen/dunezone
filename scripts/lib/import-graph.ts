/*
 * The repository files a set of entry points imports, transitively, as esbuild resolves them.
 * The contract tests that hold a hand-kept file list to the code (`scripts/hosted-play-closure.test.ts`, `scripts/ci-job-inputs.test.ts`) walk the graph through here.
 */
import { basename, dirname, resolve } from 'node:path';

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
  '.mp4',
  '.glb',
  '.hdr',
  '.wasm',
  '.html',
];

/**
 * Every repository file the entry points import, in code-unit order, with the repository files that import it.
 * `outside` names the imports the graph stops at: an absolute url, for instance, names a file under public/ a page loads at run time.
 */
export async function importGraph(
  root: string,
  entries: readonly string[],
  outside: RegExp,
  outdir: string
): Promise<Map<string, string[]>> {
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
    /*
     * Only the metafile is read. Without splitting esbuild printed a complete bundle for every entry, and the
     * story job's thousand entries each repeated the same modules, which ran the contract test past its 60 s.
     */
    splitting: true,
    logLevel: 'silent',
    tsconfig: resolve(root, 'tsconfig.json'),
    /* The publisher Worker imports its rulebook renderer through a Vite alias; the graph follows it to the runtime source. */
    alias: { 'rulebook-html-renderer-runtime': './src/app/print/rulebookHtmlRuntime.ts' },
    loader: Object.fromEntries(ASSET_EXTENSIONS.map((extension) => [extension, 'empty'])),
    plugins: [
      {
        name: 'vite-worker-url',
        setup(bundler) {
          bundler.onLoad({ filter: /\.[cm]?[jt]sx?$/, namespace: 'file' }, (args) => {
            const query = new URLSearchParams(args.suffix.slice(1));
            if (!query.has('worker') || !query.has('url')) {
              return null;
            }
            /* The import supplies a URL, but the affected-job graph must still walk the worker's code. */
            return {
              contents: `import ${JSON.stringify(`./${basename(args.path)}`)}; export default '';`,
              loader: 'js',
              resolveDir: dirname(args.path),
            };
          });
        },
      },
      {
        name: 'outside-the-graph',
        setup(bundler) {
          bundler.onResolve({ filter: outside }, (args) => (args.kind === 'entry-point' ? null : { external: true }));
        },
      },
    ],
  });
  /* A stylesheet imported with `?inline` is the same file. */
  const repositoryFile = (file: string) => {
    const [path] = file.split('?');
    return path.startsWith('node_modules/') || path.includes(':') ? undefined : path;
  };
  const graph = new Map<string, Set<string>>();
  for (const [input, { imports }] of Object.entries(result.metafile.inputs)) {
    const file = repositoryFile(input);
    if (file === undefined) {
      continue;
    }
    graph.set(file, graph.get(file) ?? new Set());
    /* An external import is one the graph stops at, not a file it reads. */
    for (const { path, external } of imports) {
      const imported = external ? undefined : repositoryFile(path);
      /* The URL module and the worker body are one repository file, without a synthetic self-import. */
      if (imported !== undefined && imported !== file) {
        graph.set(imported, (graph.get(imported) ?? new Set()).add(file));
      }
    }
  }
  return new Map([...graph.keys()].sort(byCodeUnit).map((file) => [file, [...graph.get(file)!].sort(byCodeUnit)]));
}

/** Every repository file the entry points import, in code-unit order; see `importGraph`. */
export async function importedFiles(
  root: string,
  entries: readonly string[],
  outside: RegExp,
  outdir: string
): Promise<string[]> {
  return [...(await importGraph(root, entries, outside, outdir)).keys()];
}
