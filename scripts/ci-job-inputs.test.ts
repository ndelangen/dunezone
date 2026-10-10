import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { describe, expect, test } from 'vitest';

import type { ReusableJob } from './lib/ci-job-inputs';
import { JOB_INPUTS, jobKey, jobReads, parseLsTree } from './lib/ci-job-inputs';
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
const ENTRY_POINTS: Record<ReusableJob, () => string[]> = {
  game_release: () => tracked(/^workers\/game\/.*\.ts$/u),
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
};

const JOBS = Object.keys(JOB_INPUTS) as ReusableJob[];

/* Files each job must read, and files it must not, across the lists in scripts/lib/ci-job-inputs.ts. */
const SAMPLES: Record<ReusableJob, { reads: string[]; skips: string[] }> = {
  game_release: {
    reads: [
      'workers/game/session.ts',
      'workers/game/session.test.ts',
      'src/shared/assetIds.ts',
      'bun.lock',
      '.github/workflows/reusable-verify.yml',
    ],
    skips: ['src/app/ui/control/Button.tsx', '.github/workflows/deploy-main.yml', 'workers/game/README.md'],
  },
  publisher_release: {
    reads: ['src/app/ui/control/Button.tsx', 'media/image/planet/earth.png', 'workers/publisher/index.test.ts'],
    skips: ['src/app/ui/control/Button.stories.tsx', 'workers/game/session.ts'],
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
    reads: ['e2e/profile-edit.spec.ts', 'src/app/ui/control/Button.tsx', 'some-new-root-file.json'],
    skips: [
      'src/app/ui/control/Button.stories.tsx',
      'src/app/ui/control/Button.test.tsx',
      'convex/rulebooks.test.ts',
      'workers/publisher/index.ts',
    ],
  },
};

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
      expect(uploaded.length, `${job} uploads coverage`).toBeGreaterThan(0);
      for (const report of uploaded) {
        expect(record, `${job} records ${report}`).toContain(report);
      }
    }
    expect(workflow).toContain('actions: read');
  });
});
