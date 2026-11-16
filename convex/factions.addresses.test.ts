/// <reference types="vite/client" />
// @vitest-environment edge-runtime

import { describe, expect, test, vi } from 'vite-plus/test';

import { assetPublishingFaction } from '../src/shared/factions/fixtures/assetPublishingFaction';
import { api, internal } from './_generated/api';
import type { Id } from './_generated/dataModel';
import { applicationTest } from './application.test.fixture';
import { syncFactionFamily } from './lib/factionFamilies';

const STAMP = '2026-01-01T00:00:00.000Z';

async function addressesFixture() {
  const t = applicationTest();
  const ownerId = await t.run(async (ctx) => await ctx.db.insert('users', { name: 'Faction author' }));
  const owner = t.withIdentity({ subject: ownerId });
  await owner.mutation(api.profiles.bootstrapCurrent, {});
  const create = (name: string) =>
    owner.mutation(api.factions.create, { data: { ...assetPublishingFaction, name }, group_id: null });
  const rename = (id: Id<'factions'>, name: string) =>
    owner.mutation(api.factions.update, { id, data: { ...assetPublishingFaction, name } });
  const resolve = (slug: string) => t.query(api.formerAddresses.resolve, { address: { kind: 'faction', slug } });
  const page = async (slug: string) => (await t.query(api.factions.pageBySlug, { slug })).faction;
  const familySlug = (id: Id<'factions'>) =>
    t.run(async (ctx) => {
      const faction = await ctx.db.get(id);
      return (faction?.family_id && (await ctx.db.get(faction.family_id))?.slug) ?? null;
    });
  return { t, ownerId, owner, create, rename, resolve, page, familySlug };
}

describe('faction and variant addresses (#2909)', () => {
  test('a new faction holds its plain address, and its variant answers under it', async () => {
    const { create, page, resolve, familySlug } = await addressesFixture();
    const faction = await create('House Atreides');

    expect(await familySlug(faction._id)).toBe('house-atreides');
    expect(faction.slug).toBe('house-atreides-original');
    /* The faction's own address shows its default variant, and a page moves there itself, so it is no former address. */
    expect((await page('house-atreides'))._id).toBe(faction._id);
    expect((await page('house-atreides-original'))._id).toBe(faction._id);
    await expect(resolve('house-atreides')).resolves.toBe('/factions/house-atreides-original');
  });

  test('faction and variant addresses share one namespace, whichever comes first', async () => {
    const { create, familySlug } = await addressesFixture();
    const atreides = await create('Atreides');
    const lookalike = await create('Atreides Original');
    expect(await familySlug(lookalike._id)).toBe('atreides-original-1');
    expect(lookalike.slug).toBe('atreides-original-1-original');

    const { create: createElsewhere, familySlug: familySlugElsewhere } = await addressesFixture();
    const first = await createElsewhere('Fremen Original');
    const second = await createElsewhere('Fremen');
    expect(await familySlugElsewhere(first._id)).toBe('fremen-original');
    expect(await familySlugElsewhere(second._id)).toBe('fremen');
    expect(second.slug).toBe('fremen-original-1');
    expect(atreides.slug).toBe('atreides-original');
  });

  test('renaming the faction moves both addresses, and every earlier one follows', async () => {
    const { create, rename, resolve, familySlug } = await addressesFixture();
    const faction = await create('Atreides');
    const renamed = await rename(faction._id, 'Corrino');

    expect(await familySlug(faction._id)).toBe('corrino');
    expect(renamed.slug).toBe('corrino-original');
    await expect(resolve('atreides')).resolves.toBe('/factions/corrino-original');
    await expect(resolve('atreides-original')).resolves.toBe('/factions/corrino-original');
    await expect(resolve('corrino')).resolves.toBe('/factions/corrino-original');

    /* A save that keeps the name keeps both addresses. */
    await expect(rename(faction._id, 'CORRINO!')).resolves.toMatchObject({ slug: 'corrino-original' });
    expect(await familySlug(faction._id)).toBe('corrino');
  });

  test('a deleted faction leads nowhere from its own address', async () => {
    const { t, owner, create, resolve } = await addressesFixture();
    const faction = await create('Harkonnen');
    await owner.mutation(api.factions.softDelete, { id: faction._id });

    await expect(resolve('harkonnen')).resolves.toBeNull();
    await expect(t.query(api.factions.pageBySlug, { slug: 'harkonnen' })).rejects.toThrow('not found');
  });

  test('the migration moves a variant off its faction’s address, once, and the verify step proves it', async () => {
    const { t, ownerId, page } = await addressesFixture();
    /* A row as slice 2 left it: a family of its own that holds the same address. */
    const id = await t.run(async (ctx) => {
      const factionId = await ctx.db.insert('factions', {
        owner_id: ownerId,
        group_id: null,
        data: { ...assetPublishingFaction, name: 'Ix' },
        slug: 'ix',
        created_at: STAMP,
        updated_at: STAMP,
        is_deleted: false,
      });
      await syncFactionFamily(ctx, factionId, await ctx.db.get(factionId));
      await ctx.db.patch(factionId, { slug: 'ix' });
      return factionId;
    });
    const migrate = async (ids: string[]) => {
      vi.useFakeTimers();
      await t.mutation(internal.migrations.runRequired, { ids });
      await t.finishAllScheduledFunctions(vi.runAllTimers, 100);
      vi.useRealTimers();
      return await t.query(internal.migrations.assertReadyForNarrow, { required: ids });
    };
    /* The verify step alone refuses a variant still at its faction's address. */
    await expect(migrate(['faction_variant_addresses_verify_v1'])).rejects.toThrow(
      /faction_variant_addresses_verify_v1\(failed/
    );

    const ids = ['faction_variant_addresses_v1', 'faction_variant_addresses_verify_v1'];
    await expect(migrate(ids)).resolves.toMatchObject({ ok: true });
    const moved = await t.run(async (ctx) => await ctx.db.get(id));
    expect(moved?.slug).toBe('ix-original');
    expect((await page('ix'))._id).toBe(id);

    await migrate(ids);
    expect(await t.run(async (ctx) => await ctx.db.get(id))).toEqual(moved);
  });
});
