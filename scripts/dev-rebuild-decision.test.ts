import { describe, expect, test } from 'vitest';

import { decide, needsDataRebuild } from './dev-rebuild-decision';

describe('dev rebuild trigger', () => {
  test('rebuilds when the schema or a migration changed', () => {
    expect(needsDataRebuild(['convex/schema.ts'])).toBe(true);
    expect(needsDataRebuild(['convex/migrations.ts'])).toBe(true);
    expect(needsDataRebuild(['convex/migrationsTemplate.ts'])).toBe(true);
    expect(needsDataRebuild(['convex/migration-guards.json'])).toBe(true);
    expect(needsDataRebuild(['src/app/routes/_app/index.tsx', 'convex/schema.ts'])).toBe(true);
  });

  test('keeps dev data for changes that cannot invalidate it', () => {
    expect(needsDataRebuild([])).toBe(false);
    expect(needsDataRebuild(['convex/factions.ts', 'docs/README.md'])).toBe(false);
    expect(needsDataRebuild(['convex/migrations.groupsSoftDelete.test.ts'])).toBe(false);
  });

  test('rebuilds whenever the change range cannot be trusted', () => {
    expect(decide('any-base', 'HEAD', true).rebuild).toBe(true);
    expect(decide('', 'HEAD', false).rebuild).toBe(true);
    expect(decide('0000000000000000000000000000000000000000', 'HEAD', false).rebuild).toBe(true);
  });
});
