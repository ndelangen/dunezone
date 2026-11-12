import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { describe, expect, test } from 'vite-plus/test';

import type { ReusableJob } from './lib/ci-job-inputs';
import { JOB_INPUTS, NO_JOB_READS, jobKey, jobReads, parseLsTree } from './lib/ci-job-inputs';
import { importedFiles } from './lib/import-graph';
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
/* The root configuration every Vitest run loads, the narrow game job's included. */
const ROOT_CONFIGURATION = ['vite.config.ts', 'coverage-denominator.ts', 'browser-launch-tests.ts'];
const ENTRY_POINTS: Record<ReusableJob, () => string[]> = {
  game_release: () => [...tracked(/^workers\/game\/.*\.ts$/u), ...ROOT_CONFIGURATION],
  publisher_release: () => [
    ...tracked(/^workers\/publisher\/.*\.ts$/u),
    ...APPLICATION,
    'src/app/print/capture/publisher-entry.tsx',
    'src/app/print/rulebookHtmlRuntime.ts',
  ],
  storybook: () => [
    ...tracked(/^src\/.*\.stories\.tsx?$/u),
    ...tracked(/^\.storybook\/(?!.*\.test\.).*\.tsx?$/u),
    'vitest.storybook.config.ts',
  ],
  e2e_docker: () => [
    ...tracked(/^e2e\/.*\.ts$/u),
    'playwright.config.ts',
    ...APPLICATION,
    ...tracked(/^convex\/(?!_generated\/).*\.ts$/u).filter((file) => !file.includes('.test.')),
  ],
  generate_and_build: () => [
    ...APPLICATION,
    'scripts/generate.ts',
    'scripts/generate-palette.ts',
    'scripts/generate-images.ts',
    'scripts/generate-vectors.ts',
    'scripts/generate-objs.ts',
    'scripts/verify-images.ts',
    'scripts/verify-vectors.ts',
    'scripts/test-local-convex-isolation.ts',
  ],
  /* It excludes nothing but what no job reads, so the script tests stand in for the suite. */
  test: () => [...tracked(/^scripts\/.*\.test\.ts$/u), ...ROOT_CONFIGURATION],
  browser_checks: () => [
    ...tracked(/^tools\/svg-authoring\/e2e\/.*\.ts$/u),
    'browser-launch-tests.ts',
    'vitest.browser-launch.config.ts',
    'scripts/verify-storybook-publication.ts',
  ],
};

const JOBS = Object.keys(JOB_INPUTS) as ReusableJob[];

/* Files each job must read, and files it must not, across the lists in scripts/lib/ci-job-inputs.ts. */
const SAMPLES: Record<ReusableJob, { reads: string[]; skips: string[] }> = {
  game_release: {
    reads: [
      'workers/game/session.test.ts',
      'src/shared/assetIds.ts',
      'bun.lock',
      '.nvmrc',
      '.github/workflows/reusable-verify.yml',
      'src/app/routes/_app/play/product.stories.fixture/factions.json',
    ],
    skips: ['src/app/ui/control/Button.tsx', '.github/workflows/deploy-main.yml', 'workers/game/README.md'],
  },
  publisher_release: {
    reads: ['src/app/ui/control/Button.tsx', 'media/image/planet/earth.png', 'workers/game/room.ts'],
    skips: ['src/app/ui/control/Button.stories.tsx', 'workers/game/room.test.ts'],
  },
  storybook: {
    reads: ['src/app/ui/control/Button.stories.tsx', 'convex/schema.ts', 'workers/game/session.ts'],
    skips: [
      'convex/rulebooks.test.ts',
      'e2e/profile-edit.spec.ts',
      'tools/svg-authoring/src/App.tsx',
      'docs/deployment.md',
    ],
  },
  e2e_docker: {
    reads: ['src/app/ui/control/Button.tsx', 'some-new-root-file.json'],
    skips: [
      'src/app/ui/control/Button.stories.tsx',
      'src/app/ui/control/Button.test.tsx',
      'convex/rulebooks.test.ts',
      'workers/publisher/index.ts',
    ],
  },
  generate_and_build: {
    reads: ['src/app/ui/control/Button.tsx', 'media/vector/icon/drup.svg', 'docker-compose.convex-local.yml'],
    skips: ['src/app/ui/control/Button.stories.tsx', 'convex/rulebooks.test.ts', 'e2e/profile-edit.spec.ts'],
  },
  test: {
    reads: [
      'src/app/ui/control/Button.test.tsx',
      'e2e/shards.json',
      '.storybook/preview.tsx',
      'some-new-root-file.json',
    ],
    skips: ['docs/deployment.md', 'AGENTS.md', 'skills-lock.json', '.agents/skills/wayfinder/agents/openai.yaml'],
  },
  browser_checks: {
    reads: [
      'src/app/ui/control/Button.stories.tsx',
      'tools/svg-authoring/src/App.tsx',
      'scripts/bidding-voice.browser.test.ts',
    ],
    skips: ['.claude/skills/wayfinder', '.vscode/settings.json', 'renovate.json', 'docs/adr/0001-example.md'],
  },
};

/* Lint-only checks and configurations that name an excluded path to leave it out, which is not a read. */
const NAMES_WITHOUT_READING = new Set([
  'scripts/assert-no-ai-tells.ts',
  'scripts/lib/ci-job-inputs.ts',
  'scripts/ci-job-inputs.test.ts',
  'vite.config.ts',
  'stryker.config.json',
  '.github/workflows/code-health.yml',
]);

describe('the verify jobs a pull request run can reuse', () => {
  test.each(JOBS)(
    '%s reads every file its entry points import',
    async (job) => {
      /* Absolute urls name files under public/ the pages load at run time. */
      const files = await importedFiles(root, ENTRY_POINTS[job](), /^\//, 'test-results/ci-job-inputs');
      expect(files.length).toBeGreaterThan(10);
      const unread = files.filter((file) => !jobReads(job, file));
      expect(unread, `files ${job} imports that scripts/lib/ci-job-inputs.ts leaves out`).toEqual([]);
    },
    60_000
  );

  test.each(
    JOBS.flatMap((job) => [
      ...SAMPLES[job].reads.map((file) => [job, file, true] as const),
      ...SAMPLES[job].skips.map((file) => [job, file, false] as const),
    ])
  )('%s reads %s: %s', (job, file, reads) => {
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
    expect(jobKey('publisher_release', files)).not.toBe(key);
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
      const [steps, record = ''] = definition.split('uses: ./.github/actions/record-pass');
      const uploaded = [...steps.matchAll(/\n {10}files: (coverage\/\S+)\n/gu)].map((match) => match[1]);
      for (const report of uploaded) {
        expect(record, `${job} records ${report}`).toContain(report);
      }
    }
    expect(workflow).toContain('actions: read');
  });

  /*
   * A path no job reads may still be named in code that opens it. Prose aside, the excluded paths are specific enough to search for,
   * so every tracked script, configuration and workflow that names one must be a lint check or a file that only leaves it out.
   */
  test('nothing a reused job runs names a path no job reads', () => {
    /* A path starts a string or follows a slash, so a property such as `style.cursor` does not count as naming `.cursor`. */
    const named = NO_JOB_READS.filter((glob) => !glob.includes('*.md') && glob !== 'docs/**').map((glob) => {
      const path = glob.replace(/\/\*\*$/u, '');
      return { path, pattern: new RegExp(`(?<=^|[\\s'"\`/])${path.replaceAll('.', '\\.')}(?![\\w-])`, 'u') };
    });
    /* The excluded files themselves may name each other: no reused job reads them. */
    const code = tracked(/\.(ts|tsx|js|mjs|cjs|sh|json|ya?ml|toml)$/u).filter(
      (file) => JOBS.some((job) => jobReads(job, file)) && !NAMES_WITHOUT_READING.has(file)
    );
    const offenders = code.flatMap((file) => {
      const text = readFileSync(resolve(root, file), 'utf8');
      return named.filter(({ pattern }) => pattern.test(text)).map(({ path }) => `${file} names ${path}`);
    });
    expect(offenders, 'a file that reads one of these must be listed in its job, not in NO_JOB_READS').toEqual([]);
  });
});
