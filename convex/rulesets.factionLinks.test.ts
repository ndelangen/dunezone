/// <reference types="vite/client" />
// @vitest-environment edge-runtime

import aggregateTest from '@convex-dev/aggregate/test';
import { convexTest } from 'convex-test';
import { describe, expect, test } from 'vitest';

import { assetPublishingFaction } from '../src/shared/factions/fixtures/assetPublishingFaction';
import { api } from './_generated/api';
import schema from './schema';

const modules = import.meta.glob('./**/*.ts');

const DESCRIPTION = 'A house ruleset used to prove faction links attach and detach under the right permissions.';

function linkTest() {
  const t = convexTest(schema, modules);
  aggregateTest.register(t, 'statistics');
  aggregateTest.register(t, 'profileActivity');
  aggregateTest.register(t, 'profileDiscovery');
  return t;
}

/**
 * An owner with a group, an active member of that group, and an outsider, plus a ruleset assigned to the group and a faction to link.
 * The permission the mutations enforce is the ruleset's `edit`: its owner, or an active member of its maintaining group.
 */
async function linkFixture() {
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

  const owner = t.withIdentity({ subject: ids.ownerId });
  const ruleset = await owner.mutation(api.rulesets.create, {
    name: 'LinkableRuleset',
    description: DESCRIPTION,
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
  const page = await t.query(api.rulesets.detailPageBySlug, { slug });
  return (page?.factions ?? []).map((faction) => faction.slug);
};

describe('ruleset faction links', () => {
  test('the owner attaches a faction and the page lists it', async () => {
    const { t, ids, owner, ruleset } = await linkFixture();

    await owner.mutation(api.rulesets.addFaction, { ruleset_id: ruleset._id, faction_id: ids.factionId });

    await expect(linkedSlugs(t, ruleset.slug)).resolves.toEqual(['linkable-faction']);
  });

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
      description: DESCRIPTION,
      group_id: ids.groupId,
      image_cover: null,
    });

    await owner.mutation(api.rulesets.addFaction, { ruleset_id: ruleset._id, faction_id: ids.factionId });
    await owner.mutation(api.rulesets.addFaction, { ruleset_id: second._id, faction_id: ids.factionId });

    await expect(linkedSlugs(t, ruleset.slug)).resolves.toEqual(['linkable-faction']);
    await expect(linkedSlugs(t, second.slug)).resolves.toEqual(['linkable-faction']);
  });
});
