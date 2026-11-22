/// <reference types="vite/client" />
// @vitest-environment edge-runtime

import { afterEach, beforeEach, describe, expect, test, vi } from 'vite-plus/test';

import { assetPublishingFaction } from '../src/shared/factions/fixtures/assetPublishingFaction';
import { api } from './_generated/api';
import { variantsFixture } from './factionVariants.test.fixture';

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

/** An open Faction whose owner deleted their own variant, and whose last one the stranger who added it then deleted. */
async function emptiedFaction() {
  const fixture = await variantsFixture();
  const { owner, stranger, root, familyId } = fixture;
  await owner.mutation(api.factionFamilies.setOpen, { family_id: familyId, is_open: true });
  const theirs = await stranger.mutation(api.factionVariants.create, {
    faction_id: root._id,
    name: 'Theirs',
    group_id: null,
  });
  await owner.mutation(api.factions.softDelete, { id: root._id });
  await stranger.mutation(api.factions.softDelete, { id: theirs.id });
  return fixture;
}

describe('a faction left without a live variant, on its owner’s profile (#2928)', () => {
  test('its owner is told of it, with what a row draws', async () => {
    const { owner, familyId } = await emptiedFaction();

    expect(await owner.query(api.factionFamilies.ownEmpty, {})).toEqual([
      {
        id: familyId,
        slug: 'atreides',
        data: {
          name: assetPublishingFaction.name,
          emblem: assetPublishingFaction.emblem,
          background: assetPublishingFaction.background,
        },
      },
    ]);
  });

  test('nobody else is: not another member, a member of its Group, or a signed-out visitor', async () => {
    const { t, stranger, factionGroupMember } = await emptiedFaction();
    const member = await factionGroupMember();

    expect(await stranger.query(api.factionFamilies.ownEmpty, {})).toEqual([]);
    expect(await member.query(api.factionFamilies.ownEmpty, {})).toEqual([]);
    expect(await t.query(api.factionFamilies.ownEmpty, {})).toEqual([]);
  });

  test('the profile page itself names it to nobody, its owner included', async () => {
    const { t, owner } = await emptiedFaction();
    const slug = (await owner.query(api.profiles.session, {})).profile!.slug;

    const page = await t.query(api.profiles.pageBySlug, { slug });
    expect(page.factionPreview).toEqual([]);
    expect(page.factionCount).toBe(0);
    expect(JSON.stringify(page)).not.toContain(assetPublishingFaction.name);
  });

  test('a faction with a live variant is not listed, whichever variant is its default', async () => {
    const { owner, root, addVariant } = await variantsFixture();
    expect(await owner.query(api.factionFamilies.ownEmpty, {})).toEqual([]);

    await addVariant('Second');
    await owner.mutation(api.factions.softDelete, { id: root._id });
    expect(await owner.query(api.factionFamilies.ownEmpty, {})).toEqual([]);
  });

  test('deleting the faction takes it off the list', async () => {
    const { owner, familyId } = await emptiedFaction();
    expect(await owner.query(api.factionFamilies.ownEmpty, {})).toHaveLength(1);

    await owner.mutation(api.factionFamilies.remove, { family_id: familyId });
    expect(await owner.query(api.factionFamilies.ownEmpty, {})).toEqual([]);
  });
});
