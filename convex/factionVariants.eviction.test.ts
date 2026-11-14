/// <reference types="vite/client" />
// @vitest-environment edge-runtime

import { afterEach, beforeEach, describe, expect, test, vi } from 'vite-plus/test';

import { api } from './_generated/api';
import type { Id } from './_generated/dataModel';
import { variantsFixture, withStartText } from './factionVariants.test.fixture';

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

/**
 * The original variant with two branches below it: the stranger's Dreamrules with its child and grandchild, and the owner's Homebrew.
 * The child keeps one field of its own;
 * the grandchild follows its parent in everything.
 */
async function branchesFixture() {
  const fixture = await variantsFixture();
  const { owner, stranger, root, addVariant, data, save, settle, familyId } = fixture;
  await owner.mutation(api.factionFamilies.setOpen, { family_id: familyId, is_open: true });
  const dreamrules = await stranger.mutation(api.factionVariants.create, {
    faction_id: root._id,
    name: 'Dreamrules',
    parent_id: root._id,
    group_id: null,
  });
  const child = await addVariant('Dream child', dreamrules.id);
  const grandchild = await addVariant('Dream grandchild', child.id);
  const homebrew = await addVariant('Homebrew', root._id);
  await save(root._id, withStartText(await data(root._id), 'Start on Caladan.'));
  await settle();
  return { ...fixture, dreamrules, child, grandchild, homebrew };
}

describe('evicting a variant into a faction of its own (#2928, #2911)', () => {
  test('after eviction, no parent link crosses factions and the evicted branch renders unchanged', async () => {
    const { t, owner, root, row, family, familyId, settle, dreamrules, child, grandchild, homebrew } =
      await branchesFixture();
    const branch = [dreamrules.id, child.id, grandchild.id];
    const before = await Promise.all(branch.map(async (id) => (await row(id)).data));
    const formerSlugs = await Promise.all(branch.map(async (id) => (await row(id)).slug));
    const oldShared = (await family()).data;

    const evicted = await owner.mutation(api.factionVariants.evict, { faction_id: dreamrules.id });
    await settle();

    const rows = await t.run(async (ctx) => await ctx.db.query('factions').collect());
    for (const variant of rows.filter((candidate) => candidate.parent_id)) {
      expect((await row(variant.parent_id!)).family_id).toBe(variant.family_id);
    }
    expect(await Promise.all(branch.map(async (id) => (await row(id)).data))).toEqual(before);
    for (const id of branch) {
      expect((await row(id)).family_id).toBe(evicted.family_id);
    }
    expect((await row(homebrew.id)).family_id).toBe(familyId);

    const moved = await row(dreamrules.id);
    expect(moved.parent_id).toBeUndefined();
    expect(moved.inherited).toBeUndefined();
    expect((await row(child.id)).parent_id).toBe(dreamrules.id);
    expect(await family(evicted.family_id)).toMatchObject({
      slug: 'atreides-1',
      data: oldShared,
      owner_id: moved.owner_id,
      group_id: moved.group_id,
      default_variant_id: dreamrules.id,
      is_open: false,
      is_deleted: false,
    });
    expect(evicted.slug).toBe('atreides-1-dreamrules');
    expect(await family()).toMatchObject({ default_variant_id: root._id });

    /* Every old address leads to the variant's new one. */
    for (const [index, slug] of formerSlugs.entries()) {
      expect(await t.query(api.formerAddresses.resolve, { address: { kind: 'faction', slug } })).toBe(
        `/factions/${(await row(branch[index]!)).slug}`
      );
    }
    const switcher = await t.query(api.factionVariants.switcher, { faction_id: child.id });
    expect(switcher?.variants.map((variant) => variant._id)).toEqual(branch);
  });

  test('a branch still arriving after its evicted variant is deleted keeps the new faction, with a live default', async () => {
    const { t, owner, stranger, settle, row, dreamrules, child, grandchild } = await branchesFixture();
    const evicted = await owner.mutation(api.factionVariants.evict, { faction_id: dreamrules.id });
    /* Its owner deletes the evicted variant, the new faction's only one so far, and the faction goes with it. */
    await stranger.mutation(api.factions.softDelete, { id: dreamrules.id });
    const newFamily = () => t.run(async (ctx) => (await ctx.db.get(evicted.family_id))!);
    expect((await newFamily()).is_deleted).toBe(true);

    await settle();
    expect(await newFamily()).toMatchObject({ is_deleted: false, default_variant_id: child.id });
    expect((await row(child.id)).family_id).toBe(evicted.family_id);
    expect((await row(grandchild.id)).family_id).toBe(evicted.family_id);
  });

  test('the old parent’s later saves no longer reach the evicted variant', async () => {
    const { owner, root, data, save, settle, dreamrules, grandchild } = await branchesFixture();
    await owner.mutation(api.factionVariants.evict, { faction_id: dreamrules.id });
    await settle();

    await save(root._id, withStartText(await data(root._id), 'Start in Arrakeen.'));
    await settle();

    expect((await data(dreamrules.id)).rules.startText).toBe('Start on Caladan.');
    expect((await data(grandchild.id)).rules.startText).toBe('Start on Caladan.');
  });

  test('a branch holding the default variant cannot be evicted until another variant is the default', async () => {
    const { owner, familyId, dreamrules, grandchild, homebrew } = await branchesFixture();
    await owner.mutation(api.factionFamilies.setDefaultVariant, { family_id: familyId, variant_id: grandchild.id });

    await expect(owner.mutation(api.factionVariants.evict, { faction_id: dreamrules.id })).rejects.toThrow(
      'Make another variant the default first'
    );
    await owner.mutation(api.factionFamilies.setDefaultVariant, { family_id: familyId, variant_id: homebrew.id });
    await expect(owner.mutation(api.factionVariants.evict, { faction_id: dreamrules.id })).resolves.toMatchObject({
      slug: 'atreides-1-dreamrules',
    });
  });

  test('a ruleset link to an evicted variant stays', async () => {
    const { t, owner, dreamrules } = await branchesFixture();
    const linkId = await t.run(async (ctx) => {
      const rulesetId = await ctx.db.insert('rulesets', {
        name: 'Dream rules',
        slug: 'dream-rules',
        about: '',
        created_at: '2026-11-13T00:00:00.000Z',
        updated_at: '2026-11-13T00:00:00.000Z',
        owner_id: (await ctx.db.get(dreamrules.id))!.owner_id,
        group_id: null,
        is_deleted: false,
        image_cover: null,
      });
      return await ctx.db.insert('ruleset_factions', { ruleset_id: rulesetId, faction_id: dreamrules.id, position: 0 });
    });
    await owner.mutation(api.factionVariants.evict, { faction_id: dreamrules.id });
    expect(await t.run(async (ctx) => (await ctx.db.get(linkId))?.faction_id)).toBe(dreamrules.id as Id<'factions'>);
  });
});
