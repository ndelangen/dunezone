import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

import { describe, expect, test } from 'vitest';

import { decideHostedPlay, globToRegExp, reachesHostedPlay } from './lib/hosted-play-closure';
import { importedFiles } from './lib/import-graph';

const root = resolve(import.meta.dirname, '..');

/** The scripts whose names match, as repository paths; their tests are not run by anything. */
function scriptsNamed(pattern: RegExp): string[] {
  return readdirSync(resolve(root, 'scripts'))
    .filter((name) => pattern.test(name) && !name.includes('.test.'))
    .map((name) => `scripts/${name}`);
}

/*
 * What the hosted play flows exercise: the pages a flow visits, both Workers, the launcher with its driver and every flow, and what the launcher runs as subprocesses when it builds the publisher's assets: the Vite builds with their configurations and entry pages, the generators, the asset assembly, the rulebook runtime check, the exit recorder and the load tooling.
 * The globs must cover every file their import graph reaches.
 */
const ENTRY_POINTS = [
  'src/app/router.tsx',
  'src/app/routes/start.ts',
  'src/app/routes/__root.tsx',
  'src/app/routes/_app/route.tsx',
  'src/app/routes/_app/index.tsx',
  'src/app/routes/_app/auth/index.tsx',
  'src/app/routes/_app/auth/login.route.tsx',
  'src/app/routes/_app/play/route.tsx',
  'src/app/routes/_app/play/index.tsx',
  'src/app/routes/_app/play/create.route.tsx',
  'src/app/routes/_app/play/$gameId.route.tsx',
  'workers/game/index.ts',
  'workers/game/load-entry.ts',
  'workers/publisher/index.ts',
  'scripts/play-local.ts',
  'scripts/play-load/run.mjs',
  'vite.config.ts',
  'workers/publisher/vite.config.ts',
  'workers/publisher/rulebook-html-renderer.vite.config.ts',
  'src/app/print/capture/publisher-entry.tsx',
  'src/app/print/rulebookHtmlRuntime.ts',
  'scripts/assemble-publisher-assets.ts',
  'scripts/verify-rulebook-html-runtime.ts',
  'scripts/workerd-exit-record.mjs',
  ...scriptsNamed(/^(?:generate|verify-hosted-)/u),
];
describe('the hosted play closure', () => {
  test('covers every file the play pages, the Workers and the launcher import', async () => {
    /* Absolute urls name files under public/ the pages load at run time, a directory the closure names whole, and the route tree names every page, not the ones a flow visits. */
    const files = await importedFiles(root, ENTRY_POINTS, /^\/|routeTree\.gen$/, 'test-results/hosted-play-closure');
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
    ['src/app/routes/_app/homepage/ConnectedTable.tsx', true],
    ['src/app/routes/_app/index.module.css', true],
    ['src/app/widgets/tabletop/TabletopScene.tsx', true],
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
    ['scripts/assemble-publisher-assets.ts', true],
    ['scripts/workerd-exit-record.mjs', true],
    ['src/app/print/rulebookHtmlRuntime.ts', true],
    ['publisher-capture.html', true],
    ['src/app/routes/_app/play/$gameId.route.tsx', true],
    ['workers/game/a file.ts', true],
    ['AGENTS.md', false],
    ['.oxlintrc.json', false],
    ['public/web/no-deck-back.svg', true],
    ['media/vector/icon/spice.svg', true],
    ['public/page/map.svg', true],
    ['src/game/rulebook/RulebookRenderer.tsx', true],
    ['src/game/rulebook/RulebookRenderer.stories.tsx', false],
    ['scripts/lib/reactCompiler.ts', true],
    ['scripts/lib/storybook-shards.ts', false],
    ['coverage-denominator.ts', true],
  ])('%s reaches the flows: %s', (file, reaches) => {
    expect(reachesHostedPlay(file)).toBe(reaches);
  });

  test('a diff outside the closure skips the shards, one inside runs them, and no diff at all runs them', () => {
    expect(decideHostedPlay(['docs/deployment.md', 'media/vector/icon/drup.svg'])).toMatchObject({
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

  test.each([
    ['docs/deployment.md\nmedia/vector/icon/drup.svg\n', 'false'],
    ['docs/deployment.md\nworkers/game/index.ts\n', 'true'],
    ['', 'true'],
  ])('the script writes the decision for %j to the job outputs: run=%s', (list, run) => {
    const directory = mkdtempSync(join(tmpdir(), 'hosted-play-closure-'));
    const env = {
      ...process.env,
      GITHUB_OUTPUT: join(directory, 'output'),
      GITHUB_STEP_SUMMARY: join(directory, 'summary.md'),
    };
    const printed = execFileSync('bun', [resolve(root, 'scripts/hosted-play-closure.ts')], {
      input: list,
      env,
      cwd: root,
    });
    expect(JSON.parse(printed.toString())).toMatchObject({ run: run === 'true' });
    expect(readFileSync(env.GITHUB_OUTPUT, 'utf8')).toBe(`run=${run}\n`);
    expect(readFileSync(env.GITHUB_STEP_SUMMARY, 'utf8')).toContain(
      `### Hosted play shards ${run === 'true' ? 'run' : 'skipped'}`
    );
  });
});
