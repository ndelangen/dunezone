/// <reference types="vite/client" />
// @vitest-environment edge-runtime

import { describe, expect, test } from 'vitest';

import { api, internal } from './_generated/api';
import { CATALOGUE_STAMP, catalogueFactionData } from './factions.catalogue.test.fixture';
import { factionTest } from './factions.test.fixture';

const ids = ['catalogue_entries_factions_v1', 'catalogue_entries_prune_v1', 'catalogue_entries_verify_v1'];

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
        slug: name,
        search_text: name,
        name_key: name,
        created_at: 0,
        updated_at: 0,
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

  test('rebuilds one exact entry per live faction, removes the rest, and replays without change', async () => {
    const { t, live, renamed, rulesetId } = await unmaintained();

    await t.mutation(internal.migrations.runRequired, { ids });
    await t.finishAllScheduledFunctions(() => undefined);
    await expect(t.query(internal.migrations.assertReadyForNarrow, { required: ids })).resolves.toMatchObject({
      ok: true,
    });
    const rebuilt = await t.run((ctx) => ctx.db.query('catalogue_entries').collect());
    expect(rebuilt.map((entry) => [entry.source_id, entry.name_key, entry.facets]).sort()).toEqual(
      [
        [live, 'atreides', [rulesetId]],
        [renamed, 'fremen', []],
      ].sort()
    );
    await expect(t.query(internal.migrations.catalogueDrift, { kind: 'faction' })).resolves.toMatchObject({
      missing: [],
      stale: [],
      duplicated: [],
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
