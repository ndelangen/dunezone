// @vitest-environment edge-runtime

import type { MigrationResult } from '@convex-dev/migrations';
import { expect, test } from 'vite-plus/test';

import { api, internal } from './_generated/api';
import { catalogueFactionData, seedCatalogue } from './factions.catalogue.test.fixture';
import { factionTest } from './factions.test.fixture';
import { applicationTriggers } from './lib/applicationTriggers';

const BATCH = { cursor: null, dryRun: false, oneBatchOnly: true, batchSize: 100 };

async function fixture() {
  const t = factionTest();
  const rulesets = Array.from({ length: 8 }, (_, index) => ({ slug: `rules-${index}`, name: `Rules ${index}` }));
  const {
    factionIds: [id],
  } = await seedCatalogue(t, [{ name: 'Budget faction', rulesets: rulesets.map((ruleset) => ruleset.slug) }], rulesets);
  const data = catalogueFactionData({ name: 'Budget faction' });
  await t.run((ctx) =>
    ctx.db.patch('factions', id!, {
      data: { ...data, rules: { ...data.rules, startText: 'x'.repeat(220 * 1024) } },
    })
  );
  const source = await t.run((ctx) => ctx.db.get('factions', id!));
  return { t, id: id!, source };
}

test('catalogue repair and verification stay below 512 KiB for a source in ten lists', async () => {
  const { t, id, source } = await fixture();
  const entries = await t.run((ctx) =>
    ctx.db
      .query('catalogue_entries')
      .withIndex('by_kind_source', (q) => q.eq('kind', 'faction').eq('source_id', id))
      .collect()
  );
  expect(entries).toHaveLength(10);
  for (const migration of [
    internal.migrations.catalogue_entries_prune_v1,
    internal.migrations.catalogue_entries_verify_v1,
  ]) {
    await expect(
      t.run((ctx) =>
        ctx.runMutation(migration, BATCH, {
          transactionLimits: { bytesRead: 512 * 1024 },
        })
      )
    ).resolves.toMatchObject({ isDone: true });
  }
  expect(await t.run((ctx) => ctx.db.get('factions', id))).toEqual(source);
});

test('one source check still detects another list drifting and repairs a missing first entry', async () => {
  const { t, id, source } = await fixture();
  const entries = await t.run((ctx) =>
    ctx.db
      .query('catalogue_entries')
      .withIndex('by_kind_source', (q) => q.eq('kind', 'faction').eq('source_id', id))
      .collect()
  );
  await t.run((ctx) => ctx.db.patch('catalogue_entries', entries.at(-1)!._id, { slug: 'stale' }));
  await expect(t.mutation(internal.migrations.catalogue_entries_verify_v1, BATCH)).rejects.toThrow(/stale/);
  await t.run((raw) => applicationTriggers.wrapDB(raw).db.delete('catalogue_entries', entries[0]!._id));
  let cursor: string | null = null;
  for (;;) {
    const result: MigrationResult = await t.mutation(internal.migrations.catalogue_entries_prune_v1, {
      ...BATCH,
      batchSize: 1,
      cursor,
    });
    if (result.isDone) {
      break;
    }
    cursor = result.continueCursor;
  }
  await expect(t.mutation(internal.migrations.catalogue_entries_verify_v1, BATCH)).resolves.toMatchObject({
    isDone: true,
  });
  await expect(t.query(internal.catalogueMaintenance.catalogueDrift, { kind: 'faction' })).resolves.toMatchObject({
    missing: [],
    stale: [],
    duplicated: [],
    unordered: [],
    orphaned: [],
  });
  expect((await t.query(api.factions.catalogue, { ruleset: 'rules-0' })).cards.map((row) => row._id)).toEqual([id]);
  expect(await t.run((ctx) => ctx.db.get('factions', id))).toEqual(source);
});
