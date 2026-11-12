// @vitest-environment edge-runtime

import { describe, expect, test, vi } from 'vite-plus/test';

import { ensureFactionComponentIds } from '../src/shared/factions/componentIdentity';
import { assetPublishingFaction as legacyFaction } from '../src/shared/factions/fixtures/assetPublishingFaction';
import { api, internal } from './_generated/api';
import type { Id } from './_generated/dataModel';
import { applicationTest } from './application.test.fixture';
import { assertFactionFamily } from './lib/factionFamilies';

const assetPublishingFaction = ensureFactionComponentIds(legacyFaction);
const STAMP = '2026-01-01T00:00:00.000Z';
const SHARED = {
  name: assetPublishingFaction.name,
  emblem: assetPublishingFaction.emblem,
  background: assetPublishingFaction.background,
  themeColor: assetPublishingFaction.themeColor,
  colors: assetPublishingFaction.colors,
};

async function familiesFixture() {
  const t = applicationTest();
  const ownerId = await t.run(async (ctx) => await ctx.db.insert('users', { name: 'Faction author' }));
  const owner = t.withIdentity({ subject: ownerId });
  /* A row as production holds it before the migration: written straight to the database, so no trigger gives it a family. */
  const legacyRow = (slug: string, is_deleted = false) =>
    t.run(
      async (ctx) =>
        await ctx.db.insert('factions', {
          owner_id: ownerId,
          group_id: null,
          data: { ...assetPublishingFaction, name: slug },
          slug,
          created_at: STAMP,
          updated_at: STAMP,
          is_deleted,
        })
    );
  const ruleset = (name: string, is_deleted = false) =>
    t.run(
      async (ctx) =>
        await ctx.db.insert('rulesets', {
          name,
          slug: name.toLowerCase().replaceAll(' ', '-'),
          about: '',
          created_at: STAMP,
          updated_at: STAMP,
          owner_id: ownerId,
          group_id: null,
          is_deleted,
          image_cover: null,
        })
    );
  const link = (rulesetId: Id<'rulesets'>, factionId: Id<'factions'>) =>
    t.run(
      async (ctx) =>
        await ctx.db.insert('ruleset_factions', { ruleset_id: rulesetId, faction_id: factionId, position: 0 })
    );
  const variant = (id: Id<'factions'>) => t.run(async (ctx) => await ctx.db.get(id));
  const familyOf = (id: Id<'factions'>) =>
    t.run(async (ctx) => {
      const faction = await ctx.db.get(id);
      return faction?.family_id ? await ctx.db.get(faction.family_id) : null;
    });
  const migrate = async () => {
    vi.useFakeTimers();
    const ids = ['faction_families_v1', 'faction_families_verify_v1'];
    await t.mutation(internal.migrations.runRequired, { ids });
    await t.finishAllScheduledFunctions(vi.runAllTimers, 100);
    vi.useRealTimers();
    return await t.query(internal.migrations.assertReadyForNarrow, { required: ids });
  };
  return { t, ownerId, owner, legacyRow, ruleset, link, variant, familyOf, migrate };
}

describe('Faction families', () => {
  test('a new faction is the single, default variant of a closed family that mirrors it', async () => {
    const { owner, ownerId, variant, familyOf } = await familiesFixture();
    const faction = await owner.mutation(api.factions.create, { data: assetPublishingFaction, group_id: null });

    expect(await variant(faction._id)).toMatchObject({ variant_name: 'Original', variant_slug: 'original' });
    expect(await familyOf(faction._id)).toMatchObject({
      slug: faction.slug,
      data: SHARED,
      owner_id: ownerId,
      group_id: null,
      default_variant_id: faction._id,
      is_open: false,
      is_deleted: false,
    });
  });

  test('the migration gives every row a family, deleted rows included, named after its first live ruleset', async () => {
    const { legacyRow, ruleset, link, variant, familyOf, migrate } = await familiesFixture();
    const linked = await legacyRow('linked');
    const unlinked = await legacyRow('unlinked');
    const blank = await legacyRow('blank');
    await link(await ruleset('  '), blank);
    const deleted = await legacyRow('deleted', true);
    await link(await ruleset('Retired rules', true), linked);
    await link(await ruleset('Advanced Dune'), linked);
    await link(await ruleset('House rules'), linked);

    await expect(migrate()).resolves.toMatchObject({ ok: true });

    expect(await variant(linked)).toMatchObject({ variant_name: 'Advanced Dune', variant_slug: 'advanced-dune' });
    expect(await variant(unlinked)).toMatchObject({ variant_name: 'Original' });
    expect(await variant(blank)).toMatchObject({ variant_name: 'Original', variant_slug: 'original' });
    expect(await familyOf(deleted)).toMatchObject({ is_deleted: true, default_variant_id: deleted });
    expect(await familyOf(linked)).toMatchObject({ slug: 'linked', data: { ...SHARED, name: 'linked' } });
  });

  test('rerunning the migration changes nothing', async () => {
    const { legacyRow, variant, familyOf, migrate } = await familiesFixture();
    const id = await legacyRow('stable');
    await migrate();
    const before = [await variant(id), await familyOf(id)];

    await migrate();

    expect([await variant(id), await familyOf(id)]).toEqual(before);
  });

  test('the verify step refuses a faction without a family', async () => {
    const { t, legacyRow } = await familiesFixture();
    const id = await legacyRow('orphan');
    await expect(t.run(async (ctx) => await assertFactionFamily(ctx, (await ctx.db.get(id))!))).rejects.toThrow(
      /has no family/
    );
  });

  test('edits and deletion of the variant reach its family, and a later ruleset link keeps the variant name', async () => {
    const { owner, ruleset, link, variant, familyOf } = await familiesFixture();
    const faction = await owner.mutation(api.factions.create, { data: assetPublishingFaction, group_id: null });
    await link(await ruleset('Advanced Dune'), faction._id);

    await owner.mutation(api.factions.update, {
      id: faction._id,
      data: { ...assetPublishingFaction, name: 'Renamed house', themeColor: '#123456' },
    });
    expect(await familyOf(faction._id)).toMatchObject({
      slug: 'renamed-house',
      data: { name: 'Renamed house', themeColor: '#123456' },
    });
    expect(await variant(faction._id)).toMatchObject({ variant_name: 'Original' });

    await owner.mutation(api.factions.softDelete, { id: faction._id });
    expect(await familyOf(faction._id)).toMatchObject({ is_deleted: true });
  });
});
