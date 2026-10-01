import { describe, expect, test } from 'vitest';

import { decide, needsDataRebuild } from './dev-rebuild-decision';

describe('dev rebuild trigger', () => {
  test('rebuilds when the schema or a migration changed', () => {
    expect(needsDataRebuild(['convex/schema.ts'])).toBe(true);
    expect(needsDataRebuild(['convex/migrations.ts'])).toBe(true);
    expect(needsDataRebuild(['convex/migrationsTemplate.ts'])).toBe(true);
    expect(needsDataRebuild(['convex/migration-guards.json'])).toBe(true);
    expect(needsDataRebuild(['convex/migrations/backfillFactionSlugs.ts'])).toBe(true);
    expect(needsDataRebuild(['src/app/routes/_app/index.tsx', 'convex/schema.ts'])).toBe(true);
  });

  test('rebuilds when what the snapshot keeps, or how it is made, loaded or checked, changed', () => {
    for (const file of [
      'scripts/lib/snapshot-policy.ts',
      'scripts/lib/snapshot-anonymiser.ts',
      'scripts/snapshot-anonymise.ts',
      'scripts/anonymised-snapshot.ts',
      'convex/lib/provisioningContract.ts',
      'convex/provisioningChecks.ts',
      '.github/workflows/dev-rebuild.yml',
    ]) {
      expect(needsDataRebuild([file])).toBe(true);
    }
  });

  test('keeps dev data for changes that cannot invalidate it', () => {
    expect(needsDataRebuild([])).toBe(false);
    expect(needsDataRebuild(['convex/factions.ts', 'docs/README.md'])).toBe(false);
    expect(needsDataRebuild(['convex/migrations.groupsSoftDelete.test.ts'])).toBe(false);
    expect(needsDataRebuild(['convex/migrations/backfillFactionSlugs.test.ts'])).toBe(false);
    expect(
      needsDataRebuild([
        'scripts/lib/snapshot-anonymiser.test.ts',
        'scripts/local-snapshot.ts',
        '.github/workflows/anonymised-snapshot.yml',
      ])
    ).toBe(false);
  });

  test('rebuilds whenever the change range cannot be trusted', () => {
    expect(decide('any-base', 'HEAD', true).rebuild).toBe(true);
    expect(decide('', 'HEAD', false).rebuild).toBe(true);
    expect(decide('0000000000000000000000000000000000000000', 'HEAD', false).rebuild).toBe(true);
  });
});
