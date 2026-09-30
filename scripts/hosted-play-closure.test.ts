import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { build } from 'esbuild';
import { describe, expect, test } from 'vitest';

import { decideHostedPlay, globToRegExp, reachesHostedPlay } from './lib/hosted-play-closure';
import { byCodeUnit } from './lib/storybook-shards';

const root = resolve(import.meta.dirname, '..');

/*
 * What the hosted play flows exercise: the pages a flow visits, both Workers, and the launcher with its driver.
 * Their import graph is the closure's ground truth; the globs must cover every file in it.
 */
const ENTRY_POINTS = [
  'src/app/router.tsx',
  'src/app/routes/__root.tsx',
  'src/app/routes/_app/route.tsx',
  'src/app/routes/_app/auth/index.tsx',
  'src/app/routes/_app/auth/login.route.tsx',
  'src/app/routes/_app/play/route.tsx',
  'src/app/routes/_app/play/index.tsx',
  'src/app/routes/_app/play/create.route.tsx',
  'src/app/routes/_app/play/$gameId.route.tsx',
  'workers/game/index.ts',
  'workers/publisher/index.ts',
  'scripts/verify-hosted-play-stack.ts',
  'scripts/verify-hosted-play-browser.mjs',
  'scripts/play-local.ts',
];
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
];

/** Every repository file the entry points import, transitively, as esbuild resolves them. */
async function importedFiles(): Promise<string[]> {
  const result = await build({
    absWorkingDir: root,
    entryPoints: ENTRY_POINTS.map((entry) => resolve(root, entry)),
    bundle: true,
    write: false,
    outdir: resolve(root, 'test-results/hosted-play-closure'),
    metafile: true,
    packages: 'external',
    platform: 'neutral',
    format: 'esm',
    logLevel: 'silent',
    tsconfig: resolve(root, 'tsconfig.json'),
    loader: Object.fromEntries(ASSET_EXTENSIONS.map((extension) => [extension, 'empty'])),
    plugins: [
      {
        name: 'outside-the-graph',
        setup(bundler) {
          /* Absolute urls name files under public/, which the closure lists by directory, and the route tree names every page, not the ones a flow visits. */
          bundler.onResolve({ filter: /^\/|routeTree\.gen$/ }, (args) =>
            args.kind === 'entry-point' ? null : { external: true }
          );
        },
      },
    ],
  });
  return Object.keys(result.metafile.inputs)
    .filter((file) => !file.startsWith('node_modules/') && !file.includes(':'))
    .sort(byCodeUnit);
}

describe('the hosted play closure', () => {
  test('covers every file the play pages, the Workers and the launcher import', async () => {
    const files = await importedFiles();
    expect(files.length).toBeGreaterThan(200);
    const outside = files.filter((file) => !reachesHostedPlay(file));
    expect(outside, 'files the hosted flows exercise that no closure glob names').toEqual([]);
  }, 60_000);

  test.each([
    ['docs/technical/play-hosted.md', false],
    ['media/image/planet/earth.png', false],
    ['src/app/widgets/faction-editor/FactionFormSectionPlanets.tsx', false],
    ['src/app/routes/_app/rulesets/index.tsx', false],
    ['workers/game/session.test.ts', false],
    ['src/app/routes/_app/play/GameTable.stories.tsx', false],
    ['workers/game/session.ts', true],
    ['convex/playAdmission.ts', true],
    ['src/shared/assetIds.ts', true],
    ['src/app/ui/control/Button.tsx', true],
    ['scripts/verify-hosted-results.mjs', true],
    ['.github/workflows/reusable-verify.yml', true],
    ['.github/workflows/deploy-main.yml', false],
    ['.github/actions/hosted-play-summary/action.yml', true],
    ['bun.lock', true],
    ['patches/@react-three%2Ffiber@10.0.0-alpha.4.patch', true],
    ['convex.json', true],
    ['convex/rulebooks.test.ts', false],
    ['convex/_generated/ai/guidelines.md', false],
    ['scripts/generate-images.ts', true],
    ['src/app/routes/_app/play/$gameId.route.tsx', true],
    ['workers/game/a file.ts', true],
    ['AGENTS.md', false],
    ['.oxlintrc.json', false],
  ])('%s reaches the flows: %s', (file, reaches) => {
    expect(reachesHostedPlay(file)).toBe(reaches);
  });

  test('a diff outside the closure skips the shards, one inside runs them, and no diff at all runs them', () => {
    expect(decideHostedPlay(['docs/deployment.md', 'media/vector/icon/spice.svg'])).toMatchObject({
      run: false,
      reaching: [],
    });
    expect(decideHostedPlay(['docs/deployment.md', 'workers/game/index.ts'])).toMatchObject({
      run: true,
      reaching: ['workers/game/index.ts'],
    });
    expect(decideHostedPlay([])).toMatchObject({ run: true });
  });

  test('globs match whole paths, with ** across directories and * within one', () => {
    expect(globToRegExp('convex/**').test('convex/lib/playSynthetic.ts')).toBe(true);
    expect(globToRegExp('scripts/verify-hosted-*').test('scripts/verify-hosted-decks.mjs')).toBe(true);
    expect(globToRegExp('scripts/verify-hosted-*').test('scripts/verify-hosted/decks.mjs')).toBe(false);
    expect(globToRegExp('**/*.test.*').test('workers/game/session.test.ts')).toBe(true);
    expect(globToRegExp('package.json').test('workers/game/package.json')).toBe(false);
  });

  test('the verify workflow lets the closure job gate both hosted play jobs', () => {
    const workflow = readFileSync(resolve(root, '.github/workflows/reusable-verify.yml'), 'utf8');
    expect(workflow).toContain('\n  play_closure:\n');
    expect(workflow).toContain('bun scripts/hosted-play-closure.ts < changed-files.txt');
    for (const job of ['hosted_play', 'hosted_play_webgpu']) {
      const start = workflow.indexOf(`\n  ${job}:\n`);
      expect(start, `reusable-verify.yml has no ${job} job`).toBeGreaterThan(0);
      const body = workflow.slice(start, workflow.indexOf('\n    steps:', start));
      expect(body).toContain('needs: play_closure');
      expect(body).toContain("if: needs.play_closure.outputs.run == 'true'");
    }
  });
});
