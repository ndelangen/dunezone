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
});
