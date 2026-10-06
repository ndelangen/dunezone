import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { build } from 'esbuild';
import { describe, expect, test } from 'vitest';

import { browserLaunchTests } from '../browser-launch-tests';
import type { ReusableJob } from './lib/ci-job-inputs';
import { JOB_INPUTS, jobKey, jobReads, parseLsTree } from './lib/ci-job-inputs';
import { byCodeUnit } from './lib/storybook-shards';
import { verifyJob } from './lib/verify-workflow';

const root = resolve(import.meta.dirname, '..');

/** Tracked files whose paths match, as repository paths. */
function tracked(pattern: RegExp): string[] {
  return execFileSync('git', ['ls-files'], { cwd: root, encoding: 'utf8' })
    .split('\n')
    .filter((file) => pattern.test(file));
}

/*
 * What each job imports from: its suites, its entry points and the configurations its tools load.
 * The application's own entry is the router, whose generated route tree names every page.
 */
const APPLICATION = ['src/app/router.tsx', 'vite.config.ts'];
const ENTRY_POINTS: Record<ReusableJob, () => string[]> = {
  game_release: () => tracked(/^workers\/game\/.*\.ts$/u),
  tool_e2e: () => [
    ...tracked(/^tools\/svg-authoring\/.*\.tsx?$/u),
    ...browserLaunchTests,
    'browser-launch-tests.ts',
    'vitest.browser-launch.config.ts',
  ],
  local_convex_isolation: () => ['scripts/test-local-convex-isolation.ts'],
  publisher_release: () => [
    ...tracked(/^workers\/publisher\/.*\.ts$/u),
    ...APPLICATION,
    'src/app/print/capture/publisher-entry.tsx',
    'src/app/print/rulebookHtmlRuntime.ts',
  ],
  storybook: () => [
    ...tracked(/^src\/.*\.stories\.tsx?$/u),
    ...tracked(/^\.storybook\/.*\.tsx?$/u),
    'vitest.storybook.config.ts',
  ],
  e2e_docker: () => [
    ...tracked(/^e2e\/.*\.ts$/u),
    'playwright.config.ts',
    ...APPLICATION,
    ...tracked(/^convex\/(?!_generated\/).*\.ts$/u).filter((file) => !file.includes('.test.')),
  ],
};

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

/** Every repository file the entry points import, transitively, as esbuild resolves them. */
async function importedFiles(entries: readonly string[]): Promise<string[]> {
  const result = await build({
    absWorkingDir: root,
    entryPoints: entries.map((entry) => resolve(root, entry)),
    bundle: true,
    write: false,
    outdir: resolve(root, 'test-results/ci-job-inputs'),
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
          /* Absolute urls name files under public/ the pages load at run time. */
          bundler.onResolve({ filter: /^\// }, (args) => (args.kind === 'entry-point' ? null : { external: true }));
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

const JOBS = Object.keys(JOB_INPUTS) as ReusableJob[];

describe('the verify jobs a pull request run can reuse', () => {
  test.each(JOBS)(
    '%s reads every file its entry points import',
    async (job) => {
      const files = await importedFiles(ENTRY_POINTS[job]());
      expect(files.length).toBeGreaterThan(10);
      const unread = files.filter((file) => !jobReads(job, file));
      expect(unread, `files ${job} imports that scripts/lib/ci-job-inputs.ts leaves out`).toEqual([]);
    },
    60_000
  );

  test.each([
    ['game_release', 'workers/game/session.ts', true],
    ['game_release', 'workers/game/session.test.ts', true],
    ['game_release', 'src/shared/assetIds.ts', true],
    ['game_release', 'src/app/ui/control/Button.tsx', false],
    ['game_release', 'bun.lock', true],
    ['game_release', '.github/workflows/reusable-verify.yml', true],
    ['game_release', '.github/workflows/deploy-main.yml', false],
    ['game_release', 'workers/game/README.md', false],
    ['tool_e2e', 'tools/svg-authoring/src/App.tsx', true],
    ['tool_e2e', 'scripts/play-load/browsers.test.mjs', true],
    ['tool_e2e', 'workers/game/session.ts', false],
    ['local_convex_isolation', 'convex/schema.ts', true],
    ['local_convex_isolation', 'convex/rulebooks.test.ts', false],
    ['local_convex_isolation', 'workers/publisher/index.ts', false],
    ['publisher_release', 'src/app/ui/control/Button.tsx', true],
    ['publisher_release', 'media/image/planet/earth.png', true],
    ['publisher_release', 'src/app/ui/control/Button.stories.tsx', false],
    ['publisher_release', 'workers/game/session.ts', false],
    ['publisher_release', 'workers/publisher/index.test.ts', true],
    ['storybook', 'src/app/ui/control/Button.stories.tsx', true],
    ['storybook', 'convex/schema.ts', true],
    ['storybook', 'workers/game/session.ts', true],
    ['storybook', 'convex/rulebooks.test.ts', false],
    ['storybook', 'e2e/profile-edit.spec.ts', false],
    ['storybook', 'tools/svg-authoring/src/App.tsx', false],
    ['storybook', 'docs/deployment.md', false],
    ['e2e_docker', 'e2e/profile-edit.spec.ts', true],
    ['e2e_docker', 'src/app/ui/control/Button.tsx', true],
    ['e2e_docker', 'src/app/ui/control/Button.stories.tsx', false],
    ['e2e_docker', 'src/app/ui/control/Button.test.tsx', false],
    ['e2e_docker', 'convex/rulebooks.test.ts', false],
    ['e2e_docker', 'workers/publisher/index.ts', false],
    ['e2e_docker', 'some-new-root-file.json', true],
  ] as const)('%s reads %s: %s', (job, file, reads) => {
    expect(jobReads(job, file)).toBe(reads);
  });

  test("a job's key changes with a file it reads, and with no other", () => {
    const files = [
      { path: 'workers/game/session.ts', blob: 'a'.repeat(40) },
      { path: 'src/app/ui/control/Button.tsx', blob: 'b'.repeat(40) },
    ];
    const key = jobKey('game_release', files);
    expect(jobKey('game_release', [...files].reverse())).toBe(key);
    expect(jobKey('game_release', [files[0], { ...files[1], blob: 'c'.repeat(40) }])).toBe(key);
    expect(jobKey('game_release', [{ ...files[0], blob: 'c'.repeat(40) }, files[1]])).not.toBe(key);
    expect(jobKey('tool_e2e', files)).not.toBe(key);
  });

  test('the tree listing yields each path with its blob, spaces and all', () => {
    const listing = `100644 blob ${'a'.repeat(40)}\tworkers/game/a file.ts\u0000100755 blob ${'b'.repeat(40)}\tscripts/x.sh\u0000`;
    expect(parseLsTree(listing)).toEqual([
      { path: 'workers/game/a file.ts', blob: 'a'.repeat(40) },
      { path: 'scripts/x.sh', blob: 'b'.repeat(40) },
    ]);
  });

  test.each(JOBS)('%s looks for an earlier pass and records its own', (job) => {
    const definition = verifyJob(job, root);
    expect(definition).toContain('uses: ./.github/actions/prior-pass');
    expect(definition).toContain(`job: ${job}\n`);
    expect(definition).toContain('uses: ./.github/actions/record-pass');
  });

  test('the record keeps each coverage report the job uploads', () => {
    const workflow = readFileSync(resolve(root, '.github/workflows/reusable-verify.yml'), 'utf8');
    for (const job of JOBS) {
      const definition = verifyJob(job, root);
      const uploaded = [...definition.matchAll(/\n {10}files: (coverage\/\S+)\n/gu)].map((match) => match[1]);
      for (const report of uploaded) {
        expect(definition, `${job} records ${report}`).toMatch(new RegExp(`files: \\|[^]*\\n {12}${report}\\n`, 'u'));
      }
    }
    expect(workflow).toContain('actions: read');
  });
});
