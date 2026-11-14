/// <reference types="vite/client" />
// @vitest-environment edge-runtime

import { afterEach, beforeEach, describe, expect, test, vi } from 'vite-plus/test';

import { api } from './_generated/api';
import { variantsFixture } from './factionVariants.test.fixture';

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

describe('open factions (#2928)', () => {
  test('a non-owner can add a variant to an open faction and not to a closed one', async () => {
    const { owner, stranger, root, row, familyId } = await variantsFixture();
    const addOwnVariant = (name: string) =>
      stranger.mutation(api.factionVariants.create, {
        faction_id: root._id,
        name,
        parent_id: root._id,
        group_id: null,
      });
    await expect(addOwnVariant('Mine')).rejects.toThrow('Not authorized');

    await owner.mutation(api.factionFamilies.setOpen, { family_id: familyId, is_open: true });
    /* The switcher tells everyone the faction is open and names the parents on offer, which is all the create form needs. */
    expect(await stranger.query(api.factionVariants.switcher, { faction_id: root._id })).toMatchObject({
      isOpen: true,
      variants: [{ _id: root._id, name: 'Original' }],
    });
    const mine = await addOwnVariant('Mine');
    expect(await row(mine.id)).toMatchObject({ family_id: familyId, parent_id: root._id, variant_name: 'Mine' });
    expect((await row(mine.id)).owner_id).not.toBe(root.owner_id);

    await owner.mutation(api.factionFamilies.setOpen, { family_id: familyId, is_open: false });
    await expect(addOwnVariant('Another')).rejects.toThrow('Not authorized');
    /* Closing keeps the variants already in it. */
    expect(await row(mine.id)).toMatchObject({ family_id: familyId, is_deleted: false });
  });

  test('the faction’s owner and its Group change its settings; a variant’s own owner and a stranger cannot', async () => {
    const { owner, stranger, root, familyId, family, factionGroupMember } = await variantsFixture();
    await owner.mutation(api.factionFamilies.setOpen, { family_id: familyId, is_open: true });
    const theirs = await stranger.mutation(api.factionVariants.create, {
      faction_id: root._id,
      name: 'Theirs',
      group_id: null,
    });

    await expect(
      stranger.mutation(api.factionFamilies.setOpen, { family_id: familyId, is_open: false })
    ).rejects.toThrow('Not authorized');
    await expect(
      stranger.mutation(api.factionFamilies.setDefaultVariant, { family_id: familyId, variant_id: theirs.id })
    ).rejects.toThrow('Not authorized');
    await expect(
      stranger.mutation(api.factionFamilies.setVariantOrder, { family_id: familyId, variant_ids: [theirs.id] })
    ).rejects.toThrow('Not authorized');
    await expect(stranger.mutation(api.factionVariants.evict, { faction_id: theirs.id })).rejects.toThrow(
      'Not authorized'
    );

    const member = await factionGroupMember();
    await member.mutation(api.factionFamilies.setVariantOrder, { family_id: familyId, variant_ids: [theirs.id] });
    await member.mutation(api.factionFamilies.setDefaultVariant, { family_id: familyId, variant_id: theirs.id });
    await member.mutation(api.factionFamilies.setOpen, { family_id: familyId, is_open: false });
    /* Choosing another variant as the default never hands the faction to that variant's owner. */
    expect(await family()).toMatchObject({
      owner_id: root.owner_id,
      default_variant_id: theirs.id,
      variant_order: [theirs.id],
      is_open: false,
    });
  });
});
