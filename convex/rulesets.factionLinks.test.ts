/// <reference types="vite/client" />
// @vitest-environment edge-runtime

import { describe, expect, test } from 'vite-plus/test';

import { assetPublishingFaction } from '../src/shared/factions/fixtures/assetPublishingFaction';
import { api } from './_generated/api';
import { applicationTest } from './application.test.fixture';
import { syncSeededFactionCards } from './factions.test.fixture';

const DESCRIPTION = 'A house ruleset used to prove faction links attach and detach under the right permissions.';

function linkTest() {
  const t = applicationTest();
  return t;
}

/**
 * An owner with a group, an active member of that group, and an outsider, plus a ruleset assigned to the group and a faction to link.
 * The permission the mutations enforce is the ruleset's `edit`: its owner, or an active member of its maintaining group.
 */
async function linkFixture({ cards = true }: { cards?: boolean } = {}) {
  const t = linkTest();
  const ids = await t.run(async (ctx) => {
    const ownerId = await ctx.db.insert('users', { name: 'Ruleset owner' });
    const memberId = await ctx.db.insert('users', { name: 'Group member' });
    const outsiderId = await ctx.db.insert('users', { name: 'Outsider' });
    const groupId = await ctx.db.insert('groups', {
      name: 'Linkers',
      slug: 'linkers',
      created_at: '2026-01-01T00:00:00.000Z',
      created_by: ownerId,
      is_deleted: false,
    });
    for (const userId of [ownerId, memberId]) {
      await ctx.db.insert('group_members', {
        group_id: groupId,
        user_id: userId,
        status: 'active',
        requested_at: '2026-01-01T00:00:00.000Z',
        approved_at: '2026-01-01T00:00:00.000Z',
        approved_by: ownerId,
      });
    }
    const factionId = await ctx.db.insert('factions', {
      owner_id: ownerId,
      data: assetPublishingFaction,
      slug: 'linkable-faction',
      created_at: '2026-01-01T00:00:00.000Z',
      updated_at: '2026-01-01T00:00:00.000Z',
      is_deleted: false,
      group_id: null,
    });
    return { ownerId, memberId, outsiderId, groupId, factionId };
  });
  if (cards) {
    await t.run(syncSeededFactionCards);
  }

  const owner = t.withIdentity({ subject: ids.ownerId });
  const ruleset = await owner.mutation(api.rulesets.create, {
    name: 'LinkableRuleset',
    about: DESCRIPTION,
    group_id: ids.groupId,
    image_cover: null,
  });

  return {
    t,
    ids,
    owner,
    member: t.withIdentity({ subject: ids.memberId }),
    outsider: t.withIdentity({ subject: ids.outsiderId }),
    ruleset,
  };
}

const linkedSlugs = async (t: Awaited<ReturnType<typeof linkFixture>>['t'], slug: string) => {
  const page = await t.query(api.rulesets.detailPage, { slug });
  return (page?.factions ?? []).map((faction) => faction.slug);
};

describe('ruleset faction links', () => {
  test('attaching the same faction twice leaves one link', async () => {
    const { t, ids, owner, ruleset } = await linkFixture();

    await owner.mutation(api.rulesets.addFaction, { ruleset_id: ruleset._id, faction_id: ids.factionId });
    await owner.mutation(api.rulesets.addFaction, { ruleset_id: ruleset._id, faction_id: ids.factionId });

    await expect(linkedSlugs(t, ruleset.slug)).resolves.toEqual(['linkable-faction']);
  });

  test('an active member of the maintaining group may attach and detach', async () => {
    const { t, ids, member, ruleset } = await linkFixture();

    await member.mutation(api.rulesets.addFaction, { ruleset_id: ruleset._id, faction_id: ids.factionId });
    await expect(linkedSlugs(t, ruleset.slug)).resolves.toEqual(['linkable-faction']);

    await member.mutation(api.rulesets.removeFaction, { ruleset_id: ruleset._id, faction_id: ids.factionId });
    await expect(linkedSlugs(t, ruleset.slug)).resolves.toEqual([]);
  });

  test('someone outside the group may do neither', async () => {
    const { ids, owner, outsider, ruleset } = await linkFixture();

    await expect(
      outsider.mutation(api.rulesets.addFaction, { ruleset_id: ruleset._id, faction_id: ids.factionId })
    ).rejects.toThrow('Not authorized');

    await owner.mutation(api.rulesets.addFaction, { ruleset_id: ruleset._id, faction_id: ids.factionId });
    await expect(
      outsider.mutation(api.rulesets.removeFaction, { ruleset_id: ruleset._id, faction_id: ids.factionId })
    ).rejects.toThrow('Not authorized');
  });

  test('the same faction can belong to more than one ruleset', async () => {
    const { t, ids, owner, ruleset } = await linkFixture();
    const second = await owner.mutation(api.rulesets.create, {
      name: 'SecondLinkableRuleset',
      about: DESCRIPTION,
      group_id: ids.groupId,
      image_cover: null,
    });

    await owner.mutation(api.rulesets.addFaction, { ruleset_id: ruleset._id, faction_id: ids.factionId });
    await owner.mutation(api.rulesets.addFaction, { ruleset_id: second._id, faction_id: ids.factionId });

    await expect(linkedSlugs(t, ruleset.slug)).resolves.toEqual(['linkable-faction']);
    await expect(linkedSlugs(t, second.slug)).resolves.toEqual(['linkable-faction']);
  });

  test('the page draws a linked faction from its card', async () => {
    const { t, ids, owner, ruleset } = await linkFixture();
    await owner.mutation(api.rulesets.addFaction, { ruleset_id: ruleset._id, faction_id: ids.factionId });
    await t.run(async (ctx) => {
      const card = await ctx.db
        .query('faction_cards')
        .withIndex('by_faction', (q) => q.eq('faction_id', ids.factionId))
        .unique();
      await ctx.db.patch('faction_cards', card!._id, { data: { ...card!.data, name: 'From the card' } });
    });

    const page = await t.query(api.rulesets.detailPage, { slug: ruleset.slug });

    expect(page?.factions.map((faction) => faction.data.name)).toEqual(['From the card']);
  });

  test('a soft-deleted card drops its faction from the page', async () => {
    const { t, ids, owner, ruleset } = await linkFixture();
    await owner.mutation(api.rulesets.addFaction, { ruleset_id: ruleset._id, faction_id: ids.factionId });
    await t.run(async (ctx) => {
      const card = await ctx.db
        .query('faction_cards')
        .withIndex('by_faction', (q) => q.eq('faction_id', ids.factionId))
        .unique();
      await ctx.db.patch('faction_cards', card!._id, { is_deleted: true });
    });

    await expect(linkedSlugs(t, ruleset.slug)).resolves.toEqual([]);
  });

  test('a linked faction the card backfill has not reached is read from the faction', async () => {
    const { t, ids, owner, ruleset } = await linkFixture({ cards: false });

    await owner.mutation(api.rulesets.addFaction, { ruleset_id: ruleset._id, faction_id: ids.factionId });

    await expect(linkedSlugs(t, ruleset.slug)).resolves.toEqual(['linkable-faction']);
  });
});
