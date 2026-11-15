/// <reference types="vite/client" />
// @vitest-environment edge-runtime

import { afterEach, beforeEach, describe, expect, test, vi } from 'vite-plus/test';

import { assetPublishingFaction } from '../src/shared/factions/fixtures/assetPublishingFaction';
import { api } from './_generated/api';
import { variantsFixture } from './factionVariants.test.fixture';

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

const firstPage = { numItems: 8, cursor: null };

/** House Atreides with a second variant, and a stranger's one-variant Faction made after it. */
async function twoFactions() {
  const fixture = await variantsFixture();
  const { stranger, addVariant, settle } = fixture;
  const variant = await addVariant('Kwisatz Haderach');
  const other = await stranger.mutation(api.factions.create, {
    data: { ...assetPublishingFaction, name: 'Spacing Guild' },
    group_id: null,
  });
  await settle();
  return { ...fixture, variant, other };
}

describe('the Factions a Nexus card may link (#2921)', () => {
  test('one row per Faction, newest first, with its maintainers and its variant count', async () => {
    const { t, familyId, factionGroupMember } = await twoFactions();
    await factionGroupMember();

    const { page, isDone } = await t.query(api.factionFamilies.nexusChoices, { q: '', paginationOpts: firstPage });

    expect(isDone).toBe(true);
    expect(page).toEqual([
      expect.objectContaining({ name: 'Spacing Guild', owner: 'Stranger', group: null, variantCount: 1 }),
      expect.objectContaining({
        id: familyId,
        slug: 'atreides',
        name: assetPublishingFaction.name,
        emblem: assetPublishingFaction.emblem,
        background: assetPublishingFaction.background,
        owner: 'Faction author',
        group: 'Faction keepers',
        variantCount: 2,
      }),
    ]);
  });

  test('a search finds a Faction by a variant’s name, and the list pages', async () => {
    const { t, familyId } = await twoFactions();

    const searched = await t.query(api.factionFamilies.nexusChoices, { q: 'Kwisatz', paginationOpts: firstPage });
    expect(searched.page.map((row) => row.id)).toEqual([familyId]);

    const first = await t.query(api.factionFamilies.nexusChoices, {
      q: '',
      paginationOpts: { numItems: 1, cursor: null },
    });
    expect(first.page.map((row) => row.name)).toEqual(['Spacing Guild']);
    const rest = await t.query(api.factionFamilies.nexusChoices, {
      q: '',
      paginationOpts: { numItems: 1, cursor: first.continueCursor },
    });
    expect(rest.page.map((row) => row.id)).toEqual([familyId]);
  });

  test('a Faction deleted with its last variant is not offered', async () => {
    const { t, owner, root, variant, settle } = await twoFactions();
    await owner.mutation(api.factions.softDelete, { id: root._id });
    await owner.mutation(api.factions.softDelete, { id: variant.id });
    await settle();

    const { page } = await t.query(api.factionFamilies.nexusChoices, { q: '', paginationOpts: firstPage });
    expect(page.map((row) => row.name)).toEqual(['Spacing Guild']);
  });
});

describe('the Faction a Nexus card’s link leads to (#2921)', () => {
  test('a Faction’s id answers with the Faction, and so does a variant’s, on a card the move has not reached yet', async () => {
    const { t, familyId, variant } = await twoFactions();

    const linked = expect.objectContaining({ id: familyId, slug: 'atreides', variantCount: 2 });
    expect(await t.query(api.factionFamilies.nexusLink, { id: familyId })).toEqual(linked);
    expect(await t.query(api.factionFamilies.nexusLink, { id: variant.id })).toEqual(linked);
  });

  test('a deleted variant, a Faction with no live variant and an unknown id lead nowhere', async () => {
    const { t, owner, root, variant, familyId } = await twoFactions();
    await owner.mutation(api.factions.softDelete, { id: variant.id });
    expect(await t.query(api.factionFamilies.nexusLink, { id: variant.id })).toBeNull();

    await owner.mutation(api.factions.softDelete, { id: root._id });
    expect(await t.query(api.factionFamilies.nexusLink, { id: familyId })).toBeNull();
    expect(await t.query(api.factionFamilies.nexusLink, { id: 'atreides' })).toBeNull();
  });
});
