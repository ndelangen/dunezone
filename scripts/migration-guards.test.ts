import { describe, expect, test } from 'vitest';

import { convexTransportFailure } from './migration-guards';

/* The CLI output of the 2026-09-02 production deploy that hung five minutes, and of a function that refused, without the CLI's leading glyph. */
const FETCH_FAILED = [
  'Convex run migrations:assertReadyForNarrow failed',
  'Ignoring `--prod`, `--preview-name`, or `--deployment-name` flags and using deployment from CONVEX_DEPLOY_KEY',
  'Failed to run function "migrations:assertReadyForNarrow":',
  'TypeError: fetch failed',
].join('\n');
const NOT_READY = [
  'Convex run migrations:assertReadyForNarrow failed',
  'Failed to run function "migrations:assertReadyForNarrow":',
  'Uncaught Error: Narrow blocked: required migrations are incomplete. widen-slugs(inProgress, isDone=false)',
].join('\n');

describe('convexTransportFailure', () => {
  test('names the transport line of a failed call and leaves a refusing function to fail closed', () => {
    expect(convexTransportFailure(FETCH_FAILED)).toBe('TypeError: fetch failed');
    expect(convexTransportFailure(NOT_READY)).toBeNull();
  });
});
