/// <reference types="vite/client" />
// @vitest-environment edge-runtime

import { describe, expect, test } from 'vitest';

import { compareCodeUnits } from '../src/shared/compareText';
import { api, internal } from './_generated/api';
import { CATALOGUE_STAMP, catalogueFactionData } from './factions.catalogue.test.fixture';
import { factionTest } from './factions.test.fixture';

const ids = [
  'catalogue_entries_factions_v1',
  'catalogue_entries_prune_v1',
  'catalogue_entries_verify_v1',
  'catalogue_entries_verify_v2',
];

/* Rows written through the raw database, as an import writes them: no trigger runs, so the catalogue starts out of step. */
async function unmaintained() {
  const t = factionTest();
  const seeded = await t.run(async (ctx) => {
    const ownerId = await ctx.db.insert('users', { name: 'Raw owner' });
    const owned = { owner_id: ownerId, group_id: null, created_at: CATALOGUE_STAMP, updated_at: CATALOGUE_STAMP };
    const rulesetId = await ctx.db.insert('rulesets', {
      ...owned,
      name: 'Classic',
      slug: 'classic',
      about: '',
      is_deleted: false,
      image_cover: null,
    });
    const live = await ctx.db.insert('factions', {
      ...owned,
      slug: 'atreides',
      is_deleted: false,
      data: catalogueFactionData({ name: 'Atreides', complexity: 0.4 }),
    });
    const renamed = await ctx.db.insert('factions', {
      ...owned,
      slug: 'fremen',
      is_deleted: false,
      data: catalogueFactionData({ name: 'Fremen' }),
    });
    const deleted = await ctx.db.insert('factions', {
      ...owned,
      slug: 'gone',
      is_deleted: true,
      data: catalogueFactionData({ name: 'Gone' }),
    });
    await ctx.db.insert('ruleset_factions', { ruleset_id: rulesetId, faction_id: live });
    const entry = (sourceId: string, name: string, kind = 'faction') =>
      ctx.db.insert('catalogue_entries', {
        kind,
        source_id: sourceId,
        partition: 'all',
        slug: name,
        search_text: name,
        name_key: name,
        created_at: 0,
        updated_at: 0,
        edited_at: 0,
        complexity: 0,
        complexity_score: 0,
        facets: [],
      });
    /* A stale entry, its duplicate, one for a deleted faction and one of a kind nothing defines. */
    await entry(renamed, 'old name');
    await entry(renamed, 'old name');
    await entry(deleted, 'gone');
    await entry('nothing', 'unknown', 'retired-kind');
    return { live, renamed, rulesetId };
  });
  return { t, ...seeded };
}

describe('catalogue entries backfill', () => {
  test('one repair removes every duplicate, however many there are', async () => {
    const { t, live } = await unmaintained();
    await t.run(async (ctx) => {
      for (let copy = 0; copy < 12; copy += 1) {
        await ctx.db.insert('catalogue_entries', {
          kind: 'faction',
          source_id: live,
          partition: 'all',
          slug: 'copy',
          search_text: 'copy',
          name_key: 'copy',
          created_at: 0,
          updated_at: 0,
          edited_at: 0,
          complexity: 0,
          complexity_score: 0,
          facets: [],
        });
      }
    });
    await t.mutation(internal.migrations.catalogue_entries_factions_v1, {});
    await t.finishAllScheduledFunctions(() => undefined);
    const copies = await t.run(async (ctx) =>
      (await ctx.db.query('catalogue_entries').collect()).filter(
        (entry) => entry.source_id === live && entry.partition === 'all'
      )
    );
    expect(copies).toHaveLength(1);
  });

  test('an empty catalogue passes the entry-side check but not the source-side one', async () => {
    const { t } = await unmaintained();
    await t.run(async (ctx) => {
      for (const entry of await ctx.db.query('catalogue_entries').collect()) {
        await ctx.db.delete(entry._id);
      }
    });
    await t.mutation(internal.migrations.catalogue_entries_verify_v1, {});
    await t.mutation(internal.migrations.catalogue_entries_verify_v2, {});
    await t.finishAllScheduledFunctions(() => undefined);
    await expect(
      t.query(internal.migrations.assertReadyForNarrow, { required: ['catalogue_entries_verify_v1'] })
    ).resolves.toMatchObject({ ok: true });
    await expect(
      t.query(internal.migrations.assertReadyForNarrow, { required: ['catalogue_entries_verify_v2'] })
    ).rejects.toThrow(/catalogue_entries_verify_v2\(failed/);
  });

  test('verification refuses a catalogue that has drifted from its sources', async () => {
    const { t } = await unmaintained();
    await expect(t.query(internal.migrations.catalogueDrift, { kind: 'faction' })).resolves.toMatchObject({
      missing: [expect.any(String)],
      stale: [expect.any(String)],
      duplicated: [expect.any(String)],
      orphaned: [expect.any(String)],
    });

    await t.mutation(internal.migrations.catalogue_entries_verify_v1, {});
    await expect(
      t.query(internal.migrations.assertReadyForNarrow, { required: ['catalogue_entries_verify_v1'] })
    ).rejects.toThrow(/catalogue_entries_verify_v1\(failed/);
  });

  test('rebuilds one exact entry per live faction per list, removes the rest, and replays without change', async () => {
    const { t, live, renamed, rulesetId } = await unmaintained();

    /* The page draws its cards from `faction_cards`, which raw rows skip as well. */
    await t.mutation(internal.migrations.runRequired, { ids: [...ids, 'faction_cards_v1'] });
    await t.finishAllScheduledFunctions(() => undefined);
    await expect(t.query(internal.migrations.assertReadyForNarrow, { required: ids })).resolves.toMatchObject({
      ok: true,
    });
    const rebuilt = await t.run((ctx) => ctx.db.query('catalogue_entries').collect());
    const byList = (left: unknown[], right: unknown[]) =>
      compareCodeUnits(`${String(left[0])} ${String(left[1])}`, `${String(right[0])} ${String(right[1])}`);
    expect(
      rebuilt.map((entry) => [entry.source_id, entry.partition, entry.name_key, entry.facets]).sort(byList)
    ).toEqual(
      [
        [live, 'all', 'atreides', [rulesetId]],
        [live, rulesetId, 'atreides', [rulesetId]],
        [renamed, 'all', 'fremen', []],
      ].sort(byList)
    );
    await expect(t.query(internal.migrations.catalogueDrift, { kind: 'faction' })).resolves.toMatchObject({
      missing: [],
      stale: [],
      duplicated: [],
      unordered: [],
      orphaned: [],
    });
    expect((await t.query(api.factions.catalogue, { ruleset: 'classic' })).cards.map((card) => card._id)).toEqual([
      live,
    ]);

    await t.mutation(internal.migrations.catalogue_entries_factions_v1, { reset: true });
    await t.mutation(internal.migrations.catalogue_entries_prune_v1, { reset: true });
    await t.mutation(internal.migrations.catalogue_entries_verify_v1, { reset: true });
    await t.finishAllScheduledFunctions(() => undefined);
    expect(await t.run((ctx) => ctx.db.query('catalogue_entries').collect())).toEqual(rebuilt);
  });
});
