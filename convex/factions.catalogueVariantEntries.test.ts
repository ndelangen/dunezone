/// <reference types="vite/client" />
// @vitest-environment edge-runtime

import { afterEach, beforeEach, describe, expect, test, vi } from 'vite-plus/test';

import { api, internal } from './_generated/api';
import type { Id } from './_generated/dataModel';
import { variantsFixture } from './factionVariants.test.fixture';

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

describe('a variant’s catalogue entries name its faction (#2929)', () => {
  test('every list a variant is in carries its faction, and its name is searchable', async () => {
    const { t, root, addVariant, familyId } = await variantsFixture();
    const dreamrules = await addVariant('Dreamrules');
    const entries = (id: Id<'factions'>) =>
      t.run(
        async (ctx) =>
          await ctx.db
            .query('catalogue_entries')
            .withIndex('by_kind_source', (q) => q.eq('kind', 'faction').eq('source_id', id))
            .collect()
      );

    for (const id of [root._id, dreamrules.id]) {
      const rows = await entries(id);
      expect(rows.length).toBeGreaterThan(0);
      expect(rows.every((row) => row.family_id === familyId)).toBe(true);
    }
    expect((await entries(dreamrules.id))[0]!.search_text.split('\n')).toContain('Dreamrules');
    const byFamily = await t.run(
      async (ctx) =>
        await ctx.db
          .query('catalogue_entries')
          .withIndex('by_kind_family', (q) => q.eq('kind', 'faction').eq('family_id', familyId).eq('partition', 'all'))
          .collect()
    );
    expect(byFamily.map((row) => row.source_id).sort()).toEqual([root._id, dreamrules.id].sort());
  });

  test('an evicted variant’s entries move to its new faction', async () => {
    const { t, owner, addVariant, familyId } = await variantsFixture();
    const leaving = await addVariant('Leaving');
    const { family_id: newFamilyId } = await owner.mutation(api.factionVariants.evict, { faction_id: leaving.id });
    const rows = await t.run(
      async (ctx) =>
        await ctx.db
          .query('catalogue_entries')
          .withIndex('by_kind_source', (q) => q.eq('kind', 'faction').eq('source_id', leaving.id))
          .collect()
    );
    expect(newFamilyId).not.toBe(familyId);
    expect(rows.every((row) => row.family_id === newFamilyId)).toBe(true);
  });

  test('the backfill marks entries written before variants had a faction, and its check then passes', async () => {
    const { t, root } = await variantsFixture();
    await t.run(async (ctx) => {
      const rows = await ctx.db
        .query('catalogue_entries')
        .withIndex('by_kind_source', (q) => q.eq('kind', 'faction').eq('source_id', root._id))
        .collect();
      for (const row of rows) {
        const { _id, _creationTime, family_id: _familyId, ...rest } = row;
        await ctx.db.replace(_id, rest);
      }
    });
    const ready = () =>
      t.query(internal.migrations.assertReadyForNarrow, {
        required: ['catalogue_entries_factions_family_verify_v1'],
      });
    await t.mutation(internal.catalogueMigrations.catalogue_entries_factions_family_verify_v1, {});
    await t.finishAllScheduledFunctions(() => undefined);
    await expect(ready()).rejects.toThrow(/catalogue_entries_factions_family_verify_v1\(failed/);

    await t.mutation(internal.catalogueMigrations.catalogue_entries_factions_family_v1, {});
    await t.mutation(internal.catalogueMigrations.catalogue_entries_factions_family_verify_v1, {});
    await t.finishAllScheduledFunctions(() => undefined);
    await expect(ready()).resolves.toMatchObject({ ok: true });
    const rows = await t.run(
      async (ctx) =>
        await ctx.db
          .query('catalogue_entries')
          .withIndex('by_kind_source', (q) => q.eq('kind', 'faction').eq('source_id', root._id))
          .collect()
    );
    expect(rows.every((row) => row.family_id !== undefined)).toBe(true);
  });
});
