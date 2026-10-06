/*
 * The files each verify job reads, so a pull request run can reuse the result of an earlier run that checked the same inputs.
 * A job's key is a hash of the git blob of every tracked file in its inputs. When an earlier run on this repository already passed the job with that key, `.github/actions/prior-pass` restores what that run recorded (its coverage report, if the job collects one) and the job skips its own work; the coverage upload then sends the same report again under the same flag, so every flag still reaches Codecov on every run.
 * Narrow jobs name what they read. `scripts/ci-job-inputs.test.ts` holds those lists to the import graph of the job's entry points, so a file the job imports from outside them fails the unit job.
 * Broad jobs read nearly the whole tree, so they name what they cannot read instead: a file outside every list counts, and the test holds each exclusion to the job's import graph.
 * A file a job reads without importing (a config, a fixture loaded by path, an `import.meta.glob`) must be listed by hand; a broad job reads it by default.
 */
import { createHash } from 'node:crypto';

import { globToRegExp } from './hosted-play-closure';

/** Raised when the key's meaning changes, so no earlier record matches a key computed another way. */
const KEY_VERSION = 'ci-job-inputs-v1';

/* What every job reads: its own definition, the shared actions, the dependency graph and the root configuration Vitest and the TypeScript projects load. */
const EVERY_JOB: readonly string[] = [
  '.github/workflows/ci-pr.yml',
  '.github/workflows/reusable-verify.yml',
  '.github/actions/**',
  'package.json',
  'bun.lock',
  'bunfig.toml',
  'patches/**',
  'tsconfig.json',
  'vite.config.ts',
  'coverage-denominator.ts',
  'browser-launch-tests.ts',
  'scripts/lib/reactCompiler.ts',
  'scripts/lib/threeRendererStack.ts',
  'scripts/ci-job-key.ts',
  'scripts/lib/ci-job-inputs.ts',
  'scripts/lib/hosted-play-closure.ts',
];

/** Prose that no job's checks read; the lint job, which does read it, is never reused. */
const NO_JOB_READS: readonly string[] = ['**/*.md', 'docs/**'];

/* Tests and stories outside a job's own suite, which it neither runs nor imports. */
const OTHER_SUITES: readonly string[] = ['**/*.test.*', '**/*.spec.*'];

interface JobInputs {
  /** Globs a file must match to count, besides those every job reads. */
  readonly include: readonly string[];
  /** Globs that take a file back out of `include`. */
  readonly exclude: readonly string[];
}

export const JOB_INPUTS = {
  /* The game Worker's types, typecheck, tests, dry run and startup check. */
  game_release: {
    include: ['workers/game/**', 'src/shared/**', 'convex/_generated/**'],
    exclude: [],
  },
  /* The authoring tool's own tests and the script tests that launch Chromium. */
  tool_e2e: {
    include: [
      'tools/**',
      'src/shared/**',
      'scripts/lib/**',
      'scripts/play-load/**',
      'scripts/verify-hosted-cursor*',
      'vitest.browser-launch.config.ts',
    ],
    exclude: [],
  },
  /* Two local launches side by side: the launcher, the provisioning it runs and the Convex project it pushes. */
  local_convex_isolation: {
    include: [
      'scripts/**',
      'convex/**',
      'convex.json',
      'docker-compose.convex-local.yml',
      'src/shared/**',
      'src/app/**',
    ],
    exclude: OTHER_SUITES,
  },
  /* Builds the whole application for the publisher's assets, so everything counts but what no build or publisher check reads. */
  publisher_release: {
    include: ['**'],
    exclude: [
      'tools/**',
      'e2e/**',
      'infra/**',
      'workers/game/**',
      '.storybook/**',
      '**/*.stories.*',
      'vitest.storybook.config.ts',
      'playwright.config.ts',
      'src/**/*.test.*',
      'convex/**/*.test.*',
      'scripts/**/*.test.*',
    ],
  },
  /* Every story renders against the in-browser Convex, which globs the whole backend, so only the other suites and the other Workers stay out. */
  storybook: {
    include: ['**'],
    exclude: ['tools/**', 'e2e/**', 'infra/**', 'workers/publisher/**', 'playwright.config.ts', ...OTHER_SUITES],
  },
  /* The production build against a local backend: everything but stories, the other Workers and the other suites. */
  e2e_docker: {
    include: ['**'],
    exclude: [
      'tools/**',
      'infra/**',
      'workers/publisher/**',
      '.storybook/**',
      '**/*.stories.*',
      'vitest.storybook.config.ts',
      'src/**/*.test.*',
      'convex/**/*.test.*',
      'scripts/**/*.test.*',
      'workers/**/*.test.*',
    ],
  },
} as const satisfies Record<string, JobInputs>;

export type ReusableJob = keyof typeof JOB_INPUTS;

export function isReusableJob(job: string): job is ReusableJob {
  return Object.hasOwn(JOB_INPUTS, job);
}

/** A glob as a test over a repository path. */
function matcher(glob: string): (file: string) => boolean {
  const pattern = globToRegExp(glob);
  return (file) => pattern.test(file);
}

const never = NO_JOB_READS.map(matcher);
const every = EVERY_JOB.map(matcher);
const compiled = Object.fromEntries(
  Object.entries(JOB_INPUTS).map(([job, inputs]) => [
    job,
    { include: inputs.include.map(matcher), exclude: inputs.exclude.map(matcher) },
  ])
) as Record<ReusableJob, { include: ((file: string) => boolean)[]; exclude: ((file: string) => boolean)[] }>;

/** Whether a change to this file can change what the job does. */
export function jobReads(job: ReusableJob, file: string): boolean {
  if (never.some((matches) => matches(file))) {
    return false;
  }
  if (every.some((matches) => matches(file))) {
    return true;
  }
  const { include, exclude } = compiled[job];
  return include.some((matches) => matches(file)) && !exclude.some((matches) => matches(file));
}

/** One tracked file as `git ls-tree -r` prints it: its path and its blob. */
export interface TrackedFile {
  readonly path: string;
  readonly blob: string;
}

/** The job's key: the hash of the blob and path of every tracked file it reads, in path order. */
export function jobKey(job: ReusableJob, files: readonly TrackedFile[]): string {
  const hash = createHash('sha256');
  hash.update(`${KEY_VERSION}\n${job}\n`);
  for (const file of [...files].sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0))) {
    if (jobReads(job, file.path)) {
      hash.update(`${file.blob} ${file.path}\n`);
    }
  }
  return hash.digest('hex');
}

/** The entries of `git ls-tree -r -z`, which separates them with NUL and puts a tab before each path. */
export function parseLsTree(output: string): TrackedFile[] {
  return output
    .split('\0')
    .filter((entry) => entry.length > 0)
    .map((entry) => {
      const tab = entry.indexOf('\t');
      const [, , blob] = entry.slice(0, tab).split(' ');
      return { path: entry.slice(tab + 1), blob };
    });
}
