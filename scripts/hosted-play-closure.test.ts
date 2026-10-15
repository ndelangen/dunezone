import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

import { describe, expect, test } from 'vitest';

import {
  UNOBSERVED_IMPORTS,
  decideHostedPlay,
  globToRegExp,
  onlyAddsArt,
  reachesHostedPlay,
} from './lib/hosted-play-closure';
import { importGraph } from './lib/import-graph';

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
  'scripts/play-load/run.ts',
  'vite.config.ts',
  'workers/publisher/vite.config.ts',
  'workers/publisher/rulebook-html-renderer.vite.config.ts',
  'src/app/print/capture/publisher-entry.tsx',
  'src/app/print/rulebookHtmlRuntime.ts',
  'scripts/assemble-publisher-assets.ts',
  'scripts/verify-rulebook-html-runtime.ts',
  'scripts/workerd-exit-record.ts',
  ...scriptsNamed(/^(?:generate|verify-hosted-)/u),
];
describe('the hosted play closure', () => {
  test('covers every file the play pages, the Workers and the launcher import', async () => {
    /* Absolute urls name files under public/ the pages load at run time, a directory the closure names whole, and the route tree names every page, not the ones a flow visits. */
    const graph = await importGraph(root, ENTRY_POINTS, /^\/|routeTree\.gen$/, 'test-results/hosted-play-closure');
    const files = [...graph.keys()];
    expect(files.length).toBeGreaterThan(200);
    const outside = files.filter((file) => !reachesHostedPlay(file) && !Object.hasOwn(UNOBSERVED_IMPORTS, file));
    expect(outside, 'files the hosted flows exercise that no closure glob names').toEqual([]);
    /* An unobserved file stays unobserved only while the files that read it are the ones its entry names. */
    for (const [file, { importers }] of Object.entries(UNOBSERVED_IMPORTS)) {
      expect(graph.get(file), `${file} is no longer imported by the flows' code; drop its entry`).toBeDefined();
      expect(graph.get(file), `the files in the flows' import graph that import ${file}`).toEqual(importers);
    }
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
    ['scripts/verify-hosted-results.ts', true],
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
    ['scripts/workerd-exit-record.ts', true],
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
    ['src/shared/recordlessPublicPages.ts', true],
    ['src/shared/blogPostSlugs.ts', false],
    ['workers/publisher/renderer-manifest.generated.ts', false],
    ['workers/publisher/renderer-manifest-build.ts', true],
    ['media/raster.lock.json', true],
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
    expect(decideHostedPlay(['.nvmrc'])).toMatchObject({ run: true, reaching: ['.nvmrc'] });
  });

  /* PR #2217's files: a blog post with new pictures, which no flow can see. */
  const blogPost = [
    'media/raster.lock.json',
    'src/shared/media/map.generated.ts',
    'src/shared/blogPostSlugs.ts',
    'workers/publisher/renderer-manifest.generated.ts',
    'src/app/routes/_app/blog/posts.ts',
    'src/app/routes/_app/blog/posts/tabletop-simulator.tsx',
    'src/app/routes/_app/media/media-index.json',
    'src/app/routes/site.stories.tsx',
  ];
  const art = ['media/raster.lock.json', 'src/shared/media/map.generated.ts'];

  test('a blog post with new art skips the shards, unless the art files changed more than new art', () => {
    expect(decideHostedPlay(blogPost, new Set(art))).toMatchObject({ run: false, reaching: [] });
    expect(decideHostedPlay(blogPost, new Set([art[0]]))).toMatchObject({ run: true, reaching: [art[1]] });
    expect(decideHostedPlay(blogPost)).toMatchObject({ run: true, reaching: art });
  });

  const entry = {
    sha256: 'a'.repeat(64),
    bytes: 1,
    width: 1,
    height: 1,
    format: 'png',
    isOpaque: true,
    color: '#000000',
  };

  test.each([
    ['a new original', { '/a.png': entry }, { '/a.png': entry, '/b.png': entry }, true],
    ['nothing new', { '/a.png': entry }, { '/a.png': entry }, true],
    [
      'a changed original',
      { '/a.png': entry },
      { '/a.png': { ...entry, sha256: 'b'.repeat(64) }, '/b.png': entry },
      false,
    ],
    ['a field added to an original', { '/a.png': entry }, { '/a.png': { ...entry, extra: 1 } }, false],
    ['a removed original', { '/a.png': entry, '/b.png': entry }, { '/a.png': entry }, false],
    ['a version that could not be read', { '/a.png': entry }, undefined, false],
  ])('the raster lock with %s only adds art: %s', (_, before, after, expected) => {
    expect(onlyAddsArt('media/raster.lock.json', before, after)).toBe(expected);
  });

  const map = {
    MEDIA_RECIPES: { 'image/card': { small: '78b25dffe3', large: '6a76de3578' } },
    MEDIA_CANONICAL_RECIPES: { 'image/card': { jpeg: '0123456789' } },
    MEDIA_MAP: { '/image/card/a.jpg': ['0123456789abcdef0123', '#000000'] },
  };

  test.each([
    [
      'a new entry',
      { ...map, MEDIA_MAP: { ...map.MEDIA_MAP, '/web/b.jpg': ['1123456789abcdef0123', '#ffffff'] } },
      true,
    ],
    ['a changed entry', { ...map, MEDIA_MAP: { '/image/card/a.jpg': ['1123456789abcdef0123', '#000000'] } }, false],
    ['a removed entry', { ...map, MEDIA_MAP: {} }, false],
    [
      'a new recipe',
      { ...map, MEDIA_RECIPES: { ...map.MEDIA_RECIPES, 'web/blog': { small: '0', large: '1' } } },
      false,
    ],
    ['a changed canonical recipe', { ...map, MEDIA_CANONICAL_RECIPES: {} }, false],
    ['a new export', { ...map, OTHER: {} }, false],
  ])('the media map with %s only adds art: %s', (_, after, expected) => {
    expect(onlyAddsArt('src/shared/media/map.generated.ts', map, after)).toBe(expected);
  });

  test('no other file can only add art', () => {
    expect(onlyAddsArt('src/shared/stockAssetCollections.json', {}, { a: 1 })).toBe(false);
  });

  test('globs match whole paths, with ** across directories and * within one', () => {
    expect(globToRegExp('convex/**').test('convex/lib/playSynthetic.ts')).toBe(true);
    expect(globToRegExp('scripts/verify-hosted-*').test('scripts/verify-hosted-decks.ts')).toBe(true);
    expect(globToRegExp('scripts/verify-hosted-*').test('scripts/verify-hosted/decks.mjs')).toBe(false);
    expect(globToRegExp('**/*.test.*').test('workers/game/session.test.ts')).toBe(true);
    expect(globToRegExp('package.json').test('workers/game/package.json')).toBe(false);
  });

  /* The committed map, and the same map with one more entry, as the action leaves them for the script. */
  const committedMap = readFileSync(resolve(root, 'src/shared/media/map.generated.ts'), 'utf8');
  const grownMap = committedMap.replace(
    /(export const MEDIA_MAP[^{]*\{\n)/u,
    "$1  '/web/new-art.jpg': ['0123456789abcdef0123', '#000000'],\n"
  );

  test.each([
    ['docs/deployment.md\nmedia/vector/icon/drup.svg\n', undefined, 'false'],
    ['docs/deployment.md\nworkers/game/index.ts\n', undefined, 'true'],
    ['src/shared/media/map.generated.ts\n', undefined, 'true'],
    ['src/shared/media/map.generated.ts\n', [committedMap, grownMap], 'false'],
    ['src/shared/media/map.generated.ts\n', [grownMap, committedMap], 'true'],
    ['', undefined, 'true'],
  ])('the script writes the decision for %j to the job outputs: run=%s', (list, versions, run) => {
    const directory = mkdtempSync(join(tmpdir(), 'hosted-play-closure-'));
    const env = {
      ...process.env,
      GITHUB_OUTPUT: join(directory, 'output'),
      GITHUB_STEP_SUMMARY: join(directory, 'summary.md'),
      ART_BEFORE: join(directory, 'before'),
      ART_AFTER: join(directory, 'after'),
    };
    if (versions !== undefined) {
      for (const [side, source] of [
        [env.ART_BEFORE, versions[0]],
        [env.ART_AFTER, versions[1]],
      ]) {
        mkdirSync(join(side, 'src/shared/media'), { recursive: true });
        writeFileSync(join(side, 'src/shared/media/map.generated.ts'), source);
      }
    }
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
