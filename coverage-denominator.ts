/*
 * Single authority for the coverage denominator, imported by vite.config.ts
 * (unit/publisher flags) and vitest.storybook.config.ts (storybook flag).
 * @see https://github.com/ndelangen/dunezone/issues/301 (decision)
 * @see docs/research/combined-coverage-codecov.md §8 (corrections)
 */
import { coverageConfigDefaults } from 'vitest/config';

/**
 * Extension-scoped rather than bare globs: bare `src/**` pulled non-code files (local publisher
 * dist output, tsconfig.json) into the denominator. A new source extension (.js, .mts) must be
 * added here to be counted.
 */
export const coverageIncludeSrc = 'src/**/*.{ts,tsx}';

export const coverageInclude = [coverageIncludeSrc, 'convex/**/*.ts', 'workers/**/*.ts'];

export const coverageExclude = [
  ...coverageConfigDefaults.exclude,
  // Vitest 4 only auto-excludes the current run's own test glob, so the
  // storybook run (tests = *.stories.*) counted every *.test.* file as an
  // uncovered source file. Exclude test files from every flag explicitly.
  '**/*.{test,spec}.{ts,tsx}',
  // Local publisher build output (gitignored, but present on dev machines).
  'workers/publisher/dist/**',
  '**/*.stories.{ts,tsx}',
  'src/game/fixtures/**',
  'convex/_generated/**',
  '**/*.gen.ts',
  '**/*.generated.ts',
  '**/*.d.ts',
];
