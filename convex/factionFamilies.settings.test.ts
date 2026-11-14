/// <reference types="vite/client" />
// @vitest-environment edge-runtime

import { afterEach, beforeEach, describe, expect, test, vi } from 'vite-plus/test';

import { assetPublishingFaction } from '../src/shared/factions/fixtures/assetPublishingFaction';
import { api } from './_generated/api';
import { variantsFixture } from './factionVariants.test.fixture';

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

describe('a faction’s variant order, default and deletion (#2928)', () => {
  test('the switcher lists live variants in variant order, the default first, each with its address', async () => {
    const { t, owner, root, addVariant, familyId } = await variantsFixture();
    const first = await addVariant('First');
    const second = await addVariant('Second');
    const third = await addVariant('Third');
    const gone = await addVariant('Gone');
    await owner.mutation(api.factions.softDelete, { id: gone.id });
    const switcher = () => t.query(api.factionVariants.switcher, { faction_id: first.id });

    await owner.mutation(api.factionFamilies.setVariantOrder, {
      family_id: familyId,
      variant_ids: [third.id, root._id, first.id],
    });
    expect((await switcher())?.variants.map((variant) => variant.name)).toEqual([
      'Original',
      'Third',
      'First',
      'Second',
    ]);

    await owner.mutation(api.factionFamilies.setDefaultVariant, { family_id: familyId, variant_id: second.id });
    expect(await switcher()).toMatchObject({
      familySlug: 'atreides',
      isOpen: false,
      defaultVariantId: second.id,
      variants: [
        { _id: second.id, name: 'Second', slug: 'atreides-second' },
        { _id: third.id, name: 'Third', slug: 'atreides-third' },
        { _id: root._id, name: 'Original', slug: root.slug },
        { _id: first.id, name: 'First', slug: 'atreides-first' },
      ],
    });
    /* The faction's own address leads to its default variant. */
    expect((await t.query(api.factions.pageBySlug, { slug: 'atreides' })).faction._id).toBe(second.id);
  });

  test('the switcher gives each variant the live rulesets it is linked to, with their cover thumbs', async () => {
    const { t, root, addVariant } = await variantsFixture();
    const dreamrules = await addVariant('Dreamrules');
    const unlinked = await addVariant('Unlinked');
    const ownerId = (await t.run(async (ctx) => await ctx.db.get(root._id)))!.owner_id;
    const ruleset = (name: string, cover: { image_cover: string | null; is_deleted?: boolean }) =>
      t.run(
        async (ctx) =>
          await ctx.db.insert('rulesets', {
            name,
            slug: name.toLowerCase().replaceAll(' ', '-'),
            about: '',
            created_at: '2026-11-13T00:00:00.000Z',
            updated_at: '2026-11-13T00:00:00.000Z',
            owner_id: ownerId,
            group_id: null,
            is_deleted: false,
            ...cover,
          })
      );
    const base = await ruleset('Base game', { image_cover: 'https://covers.example/base.webp' });
    const house = await ruleset('House rules', { image_cover: null });
    const retired = await ruleset('Retired rules', { image_cover: null, is_deleted: true });
    await t.run(async (ctx) => {
      await ctx.db.insert('ruleset_factions', { ruleset_id: base, faction_id: root._id, position: 0 });
      await ctx.db.insert('ruleset_factions', { ruleset_id: house, faction_id: dreamrules.id, position: 0 });
      await ctx.db.insert('ruleset_factions', { ruleset_id: base, faction_id: dreamrules.id, position: 1 });
      await ctx.db.insert('ruleset_factions', { ruleset_id: retired, faction_id: dreamrules.id, position: 0 });
    });

    /* Every variant's page gets the same answer, whichever one asks. */
    const switcher = await t.query(api.factionVariants.switcher, { faction_id: unlinked.id });
    expect(switcher?.variants.map((variant) => [variant.name, variant.rulesets])).toEqual([
      [
        'Original',
        [{ id: base, name: 'Base game', slug: 'base-game', coverThumbUrl: 'https://covers.example/base.webp' }],
      ],
      [
        'Dreamrules',
        [
          { id: house, name: 'House rules', slug: 'house-rules', coverThumbUrl: null },
          { id: base, name: 'Base game', slug: 'base-game', coverThumbUrl: 'https://covers.example/base.webp' },
        ],
      ],
      ['Unlinked', []],
    ]);
  });

  test('the order and the default name only this faction’s variants, and the default only a live one', async () => {
    const { owner, root, addVariant, familyId } = await variantsFixture();
    const gone = await addVariant('Gone');
    await owner.mutation(api.factions.softDelete, { id: gone.id });
    const other = await owner.mutation(api.factions.create, {
      data: { ...assetPublishingFaction, name: 'Harkonnen' },
      group_id: null,
    });

    await expect(
      owner.mutation(api.factionFamilies.setVariantOrder, { family_id: familyId, variant_ids: [root._id, root._id] })
    ).rejects.toThrow('twice');
    await expect(
      owner.mutation(api.factionFamilies.setVariantOrder, { family_id: familyId, variant_ids: [other._id] })
    ).rejects.toThrow('another faction');
    await expect(
      owner.mutation(api.factionFamilies.setDefaultVariant, { family_id: familyId, variant_id: gone.id })
    ).rejects.toThrow('not a live variant');
    await expect(
      owner.mutation(api.factionFamilies.setDefaultVariant, { family_id: familyId, variant_id: other._id })
    ).rejects.toThrow('not a live variant');
  });

  test('deleting the default variant makes the next one in variant order the default, in the same transaction', async () => {
    const { t, owner, root, addVariant, familyId, family } = await variantsFixture();
    const older = await addVariant('Older');
    const preferred = await addVariant('Preferred');
    await owner.mutation(api.factionFamilies.setVariantOrder, {
      family_id: familyId,
      variant_ids: [preferred.id, older.id],
    });

    await owner.mutation(api.factions.softDelete, { id: root._id });

    expect(await family()).toMatchObject({ default_variant_id: preferred.id, is_deleted: false });
    expect(await t.query(api.formerAddresses.resolve, { address: { kind: 'faction', slug: 'atreides' } })).toBe(
      '/factions/atreides-preferred'
    );
  });

  test('only the faction’s owner deletes it, and only once it holds no live variant', async () => {
    const { owner, stranger, root, familyId, family, factionGroupMember } = await variantsFixture();
    await owner.mutation(api.factionFamilies.setOpen, { family_id: familyId, is_open: true });
    const theirs = await stranger.mutation(api.factionVariants.create, {
      faction_id: root._id,
      name: 'Theirs',
      group_id: null,
    });
    const member = await factionGroupMember();

    await expect(owner.mutation(api.factionFamilies.remove, { family_id: familyId })).rejects.toThrow(
      'before deleting the faction'
    );
    /* The owner deleting their own variant leaves the faction to the variant still live in it. */
    await owner.mutation(api.factions.softDelete, { id: root._id });
    expect(await family()).toMatchObject({ is_deleted: false, default_variant_id: theirs.id });
    /* Someone else deleting the last live variant leaves the faction for its owner to delete. */
    await stranger.mutation(api.factions.softDelete, { id: theirs.id });
    expect((await family()).is_deleted).toBe(false);

    await expect(member.mutation(api.factionFamilies.remove, { family_id: familyId })).rejects.toThrow(
      'Not authorized'
    );
    await owner.mutation(api.factionFamilies.remove, { family_id: familyId });
    expect((await family()).is_deleted).toBe(true);
  });

  test('the owner deleting the faction’s last live variant deletes the faction with it', async () => {
    const { owner, root, family } = await variantsFixture();
    await owner.mutation(api.factions.softDelete, { id: root._id });
    expect((await family()).is_deleted).toBe(true);
  });
  test('a drag that changes which variant comes first sets the order and the default together', async () => {
    const { t, owner, stranger, root, addVariant, familyId, family } = await variantsFixture();
    const first = await addVariant('First');
    const second = await addVariant('Second');
    const gone = await addVariant('Gone');
    await owner.mutation(api.factions.softDelete, { id: gone.id });

    await owner.mutation(api.factionFamilies.setVariantOrder, {
      family_id: familyId,
      variant_ids: [second.id, root._id, first.id],
      default_variant_id: second.id,
    });
    expect((await family()).default_variant_id).toBe(second.id);
    const switcher = await t.query(api.factionVariants.switcher, { faction_id: root._id });
    expect(switcher?.variants.map((variant) => variant.name)).toEqual(['Second', 'Original', 'First']);

    /* A default that is refused leaves the order as it was. */
    await expect(
      owner.mutation(api.factionFamilies.setVariantOrder, {
        family_id: familyId,
        variant_ids: [first.id, second.id, root._id],
        default_variant_id: gone.id,
      })
    ).rejects.toThrow('not a live variant');
    expect((await family()).variant_order).toEqual([second.id, root._id, first.id]);
    await expect(
      stranger.mutation(api.factionFamilies.setVariantOrder, {
        family_id: familyId,
        variant_ids: [first.id],
        default_variant_id: first.id,
      })
    ).rejects.toThrow('Not authorized');
  });

  test('a new default takes the faction’s shared fields before the faction mirrors it, so a save still being pushed is kept', async () => {
    const { owner, root, addVariant, data, save, settle, family, familyId } = await variantsFixture();
    const sibling = await addVariant('Homebrew');
    await save(root._id, { ...(await data(root._id)), themeColor: '#123456' });
    /* The push has not reached the sibling when it becomes the default. */
    await owner.mutation(api.factionFamilies.setDefaultVariant, { family_id: familyId, variant_id: sibling.id });
    expect((await family()).data?.themeColor).toBe('#123456');
    await settle();
    expect((await family()).data?.themeColor).toBe('#123456');
    expect((await data(root._id)).themeColor).toBe('#123456');
    expect((await data(sibling.id)).themeColor).toBe('#123456');
  });

  test('the switcher names each variant’s parent and owner', async () => {
    const { t, root, addVariant } = await variantsFixture();
    await addVariant('Child', root._id);
    const switcher = await t.query(api.factionVariants.switcher, { faction_id: root._id });
    expect(switcher?.variants.map((variant) => [variant.name, variant.parentId])).toEqual([
      ['Original', null],
      ['Child', root._id],
    ]);
    const owner = (await t.run(
      async (ctx) =>
        await ctx.db
          .query('profiles')
          .withIndex('by_user_id', (q) => q.eq('user_id', root.owner_id))
          .unique()
    ))!;
    expect(switcher?.variants.map((variant) => variant.ownerName)).toEqual([owner.username, owner.username]);
  });
});

describe('deleting a variant and its faction in one hold (#2928)', () => {
  test('the owner deletes the last variant and the faction goes with it', async () => {
    const { owner, root, row, family } = await variantsFixture();
    await owner.mutation(api.factions.softDelete, { id: root._id, and_faction: true });
    expect((await row(root._id)).is_deleted).toBe(true);
    expect((await family()).is_deleted).toBe(true);
  });

  test('someone else deletes the last variant and the faction stays, empty', async () => {
    const { owner, stranger, root, row, familyId, family } = await variantsFixture();
    await owner.mutation(api.factionFamilies.setOpen, { family_id: familyId, is_open: true });
    const theirs = await stranger.mutation(api.factionVariants.create, {
      faction_id: root._id,
      name: 'Theirs',
      group_id: null,
    });
    await owner.mutation(api.factions.softDelete, { id: root._id });

    /* Asking for the faction too is refused outright, and their variant stays. */
    await expect(stranger.mutation(api.factions.softDelete, { id: theirs.id, and_faction: true })).rejects.toThrow(
      'Not authorized'
    );
    expect((await row(theirs.id)).is_deleted).toBe(false);

    await stranger.mutation(api.factions.softDelete, { id: theirs.id });
    expect((await row(theirs.id)).is_deleted).toBe(true);
    expect((await family()).is_deleted).toBe(false);
  });

  test('it is refused while other live variants remain, and deletes nothing', async () => {
    const { owner, root, row, addVariant, family } = await variantsFixture();
    const other = await addVariant('Other');

    await expect(owner.mutation(api.factions.softDelete, { id: root._id, and_faction: true })).rejects.toThrow(
      'other variants'
    );
    expect((await row(root._id)).is_deleted).toBe(false);
    expect((await family()).is_deleted).toBe(false);

    /* A deleted sibling no longer counts. */
    await owner.mutation(api.factions.softDelete, { id: other.id });
    await owner.mutation(api.factions.softDelete, { id: root._id, and_faction: true });
    expect((await family()).is_deleted).toBe(true);
  });
});
