/// <reference types="vite/client" />
// @vitest-environment edge-runtime

import migrationsTest from '@convex-dev/migrations/test';
import { describe, expect, test } from 'vite-plus/test';

import { api, internal } from './_generated/api';
import { DUPLICATE_MERGES } from './factionMergeMigrations';
import { variantsFixture } from './factionVariants.test.fixture';

/** Production's GF9 Atreides and its Dreamrules duplicate, each its own Faction, at the addresses the merge lists. */
async function duplicatesFixture() {
  const f = await variantsFixture();
  migrationsTest.register(f.t);
  const duplicate = await f.stranger.mutation(api.factions.create, {
    data: await f.data(f.root._id),
    group_id: null,
  });
  await f.t.run(async (ctx) => {
    await ctx.db.patch('factions', f.root._id, { slug: 'atreides-gf9' });
    await ctx.db.patch('factions', duplicate._id, { slug: 'house-atreides-dreamrules', variant_name: 'Dreamrules' });
  });
  const duplicateFamilyId = (await f.row(duplicate._id)).family_id;
  const migrate = () => f.t.mutation(internal.factionMergeMigrations.faction_duplicates_merge_v1, {});
  return { ...f, duplicate, duplicateFamilyId, migrate };
}

describe('merging production’s duplicate factions (#2915)', () => {
  test('lists each moving variant under a GF9 variant that does not move itself', () => {
    const moving = new Set(Object.keys(DUPLICATE_MERGES));
    expect(Object.values(DUPLICATE_MERGES).filter((parent) => moving.has(parent))).toEqual([]);
    expect(moving.size).toBe(22);
  });

  test('moves the listed variant under its GF9 variant and retires its Faction; a replay changes nothing', async () => {
    const f = await duplicatesFixture();
    await f.migrate();
    await f.t.finishAllScheduledFunctions(() => {});

    const moved = await f.row(f.duplicate._id);
    expect(moved).toMatchObject({ family_id: f.familyId, parent_id: f.root._id, variant_name: 'Dreamrules' });
    expect(moved.slug).not.toBe('house-atreides-dreamrules');
    const retired = await f.t.run(async (ctx) => await ctx.db.get('faction_families', f.duplicateFamilyId));
    expect(retired).toMatchObject({ is_deleted: true, merged_into: f.familyId });

    await f.t.mutation(internal.factionMergeMigrations.faction_duplicates_merge_v1, { reset: true });
    await f.t.finishAllScheduledFunctions(() => {});
    expect(await f.row(f.duplicate._id)).toEqual(moved);
  });
});
