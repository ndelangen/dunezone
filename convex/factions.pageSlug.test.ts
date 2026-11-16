/// <reference types="vite/client" />
// @vitest-environment edge-runtime

import { expect, test } from 'vite-plus/test';

import { assetPublishingFaction } from '../src/shared/factions/fixtures/assetPublishingFaction';
import { api } from './_generated/api';
import { applicationTest } from './application.test.fixture';
import { insertFactionRow } from './factionRows.test.fixture';
import { variantsFixture } from './factionVariants.test.fixture';

test('a Play seat finds a live faction page by the id it carries, and nothing for a deleted or unknown faction', async () => {
  const t = applicationTest();
  const now = '2026-10-11T09:30:00.000Z';
  const { live, deleted } = await t.run(async (ctx) => {
    const ownerId = await ctx.db.insert('users', {});
    const row = (slug: string, is_deleted: boolean) => ({
      owner_id: ownerId,
      data: { ...assetPublishingFaction, name: slug },
      slug,
      created_at: now,
      updated_at: now,
      is_deleted,
      group_id: null,
    });
    return {
      live: await insertFactionRow(ctx, row('atreides', false)),
      deleted: await insertFactionRow(ctx, row('old-atreides', true)),
    };
  });

  await expect(t.query(api.factions.pageSlug, { id: live })).resolves.toBe('atreides-original');
  await expect(t.query(api.factions.pageSlug, { id: deleted })).resolves.toBeNull();
  /* The local fixtures seat factions under plain names, which are no faction id at all. */
  await expect(t.query(api.factions.pageSlug, { id: 'harkonnen' })).resolves.toBeNull();
});

test('a Nexus card’s link finds its own address, whether it names a whole Faction or one variant (#2921)', async () => {
  const { t, owner, root, addVariant, familyId } = await variantsFixture();
  const variant = await addVariant('Kwisatz Haderach');

  await expect(t.query(api.factions.pageSlug, { id: familyId })).resolves.toBe('atreides');
  await expect(t.query(api.factions.pageSlug, { id: variant.id })).resolves.toBe(variant.slug);

  /* A Faction left with no live variant has no page to lead to. */
  await owner.mutation(api.factions.softDelete, { id: root._id });
  await owner.mutation(api.factions.softDelete, { id: variant.id });
  await expect(t.query(api.factions.pageSlug, { id: familyId })).resolves.toBeNull();
});
