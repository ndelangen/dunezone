/// <reference types="vite/client" />
// @vitest-environment edge-runtime

import aggregateTest from '@convex-dev/aggregate/test';
import { convexTest } from 'convex-test';
import { describe, expect, test } from 'vitest';

import { assetPublishingFaction } from '../src/game/fixtures/assetPublishingFaction';
import { api } from './_generated/api';
import schema from './schema';

const modules = import.meta.glob('./**/*.ts');
const now = '2026-08-09T00:00:00.000Z';

async function softDeletionFixture() {
  const t = convexTest(schema, modules);
  aggregateTest.register(t, 'statistics');
  aggregateTest.register(t, 'profileActivity');
  aggregateTest.register(t, 'profileDiscovery');
  const ids = await t.run(async (ctx) => {
    const ownerId = await ctx.db.insert('users', { name: 'Group owner' });
    const memberId = await ctx.db.insert('users', { name: 'Active member' });
    const assetOwnerId = await ctx.db.insert('users', { name: 'Asset owner' });
    const outsiderId = await ctx.db.insert('users', { name: 'Outsider' });
    for (const [userId, username, slug] of [
      [ownerId, 'Group owner', 'group-owner'],
      [memberId, 'Active member', 'active-member'],
      [assetOwnerId, 'Asset owner', 'asset-owner'],
      [outsiderId, 'Outsider', 'outsider'],
    ] as const) {
      await ctx.db.insert('profiles', {
        user_id: userId,
        username,
        avatar_url: null,
        slug,
        created_at: now,
        updated_at: now,
      });
    }
    const groupId = await ctx.db.insert('groups', {
      name: 'DuneDesigners',
      slug: 'dunedesigners',
      created_at: now,
      created_by: ownerId,
      is_deleted: false,
    });
    const membershipIds = {
      owner: await ctx.db.insert('group_members', {
        group_id: groupId,
        user_id: ownerId,
        status: 'active',
        requested_at: now,
        approved_at: now,
        approved_by: ownerId,
      }),
      member: await ctx.db.insert('group_members', {
        group_id: groupId,
        user_id: memberId,
        status: 'active',
        requested_at: now,
        approved_at: now,
        approved_by: ownerId,
      }),
    };
    const factionId = await ctx.db.insert('factions', {
      owner_id: assetOwnerId,
      data: { ...structuredClone(assetPublishingFaction), name: 'Collaborative Faction' },
      slug: 'collaborative-faction',
      created_at: now,
      updated_at: now,
      is_deleted: false,
      group_id: groupId,
    });
    const rulesetId = await ctx.db.insert('rulesets', {
      name: 'Collaborative Ruleset',
      slug: 'collaborative-ruleset',
      created_at: now,
      updated_at: now,
      owner_id: assetOwnerId,
      group_id: groupId,
      is_deleted: false,
      image_cover: null,
    });
    return {
      ownerId,
      memberId,
      assetOwnerId,
      outsiderId,
      groupId,
      membershipIds,
      factionId,
      rulesetId,
    };
  });
  return { t, ids };
}

describe('Group soft deletion lifecycle', () => {
  test('owner soft deletion preserves the Group row, memberships, and asset associations', async () => {
    const { t, ids } = await softDeletionFixture();

    await t.withIdentity({ subject: ids.ownerId }).mutation(api.groups.softDelete, {
      id: ids.groupId,
    });

    await t.run(async (ctx) => {
      const group = await ctx.db.get('groups', ids.groupId);
      expect(group?.is_deleted).toBe(true);
      expect(group?.name).toBe('DuneDesigners');
      const ownerMembership = await ctx.db.get('group_members', ids.membershipIds.owner);
      const memberMembership = await ctx.db.get('group_members', ids.membershipIds.member);
      expect(ownerMembership?.status).toBe('active');
      expect(memberMembership?.status).toBe('active');
      const faction = await ctx.db.get('factions', ids.factionId);
      const ruleset = await ctx.db.get('rulesets', ids.rulesetId);
      expect(faction?.group_id).toBe(ids.groupId);
      expect(ruleset?.group_id).toBe(ids.groupId);
    });
  });

  test('only the Group owner may soft delete', async () => {
    const { t, ids } = await softDeletionFixture();

    await expect(
      t.withIdentity({ subject: ids.memberId }).mutation(api.groups.softDelete, {
        id: ids.groupId,
      })
    ).rejects.toThrow('Not authorized');
  });

  test('a deleted Group behaves as not found for every Group mutation', async () => {
    const { t, ids } = await softDeletionFixture();
    const owner = t.withIdentity({ subject: ids.ownerId });
    await owner.mutation(api.groups.softDelete, { id: ids.groupId });

    await expect(
      owner.mutation(api.groups.update, { id: ids.groupId, name: 'RenamedDesigners' })
    ).rejects.toThrow('not found');
    await expect(owner.mutation(api.groups.softDelete, { id: ids.groupId })).rejects.toThrow(
      'not found'
    );
    await expect(
      t.withIdentity({ subject: ids.outsiderId }).mutation(api.members.request, {
        group_id: ids.groupId,
      })
    ).rejects.toThrow('Group not found');
    await expect(
      owner.mutation(api.members.addMember, { groupId: ids.groupId, userId: ids.outsiderId })
    ).rejects.toThrow('not found');
  });

  test('membership in a deleted Group grants no collaborative authority over assets', async () => {
    const { t, ids } = await softDeletionFixture();
    await t.withIdentity({ subject: ids.ownerId }).mutation(api.groups.softDelete, {
      id: ids.groupId,
    });

    const member = t.withIdentity({ subject: ids.memberId });
    await expect(
      member.mutation(api.factions.update, {
        id: ids.factionId,
        data: { ...structuredClone(assetPublishingFaction), name: 'Collaborative Faction' },
      })
    ).rejects.toThrow('Not authorized');

    const faction = await member.query(api.factions.getBySlug, { slug: 'collaborative-faction' });
    expect(faction.viewerAccess.assignedGroup).toBeNull();
    expect(faction.viewerAccess.capabilities.edit).toBe(false);
  });

  test('the asset owner may unassign or reassign while the former Group is deleted', async () => {
    const { t, ids } = await softDeletionFixture();
    const owner = t.withIdentity({ subject: ids.ownerId });
    await owner.mutation(api.groups.softDelete, { id: ids.groupId });

    const assetOwner = t.withIdentity({ subject: ids.assetOwnerId });
    const unassigned = await assetOwner.mutation(api.factions.setGroup, {
      id: ids.factionId,
      group_id: null,
    });
    expect(unassigned.group_id).toBeNull();

    const nextGroup = await owner.mutation(api.groups.create, { name: 'NextDesigners' });
    await t.run(async (ctx) => {
      await ctx.db.insert('group_members', {
        group_id: nextGroup._id,
        user_id: ids.assetOwnerId,
        status: 'active',
        requested_at: now,
        approved_at: now,
        approved_by: ids.ownerId,
      });
    });
    const reassigned = await assetOwner.mutation(api.factions.setGroup, {
      id: ids.factionId,
      group_id: nextGroup._id,
    });
    expect(reassigned.group_id).toBe(nextGroup._id);
  });

  test('assignment to a deleted Group behaves as not found', async () => {
    const { t, ids } = await softDeletionFixture();
    await t.withIdentity({ subject: ids.ownerId }).mutation(api.groups.softDelete, {
      id: ids.groupId,
    });

    const assetOwner = t.withIdentity({ subject: ids.assetOwnerId });
    await expect(
      assetOwner.mutation(api.factions.setGroup, { id: ids.factionId, group_id: ids.groupId })
    ).rejects.toThrow('not found');
    await expect(
      assetOwner.mutation(api.rulesets.create, {
        name: 'OrphanRuleset',
        group_id: ids.groupId,
        image_cover: null,
      })
    ).rejects.toThrow('not found');
  });

  test('a deleted Group keeps its name and slug reserved', async () => {
    const { t, ids } = await softDeletionFixture();
    const owner = t.withIdentity({ subject: ids.ownerId });
    await owner.mutation(api.groups.softDelete, { id: ids.groupId });

    await expect(owner.mutation(api.groups.create, { name: 'DuneDesigners' })).rejects.toThrow(
      'Group name already exists'
    );
    const shadow = await owner.mutation(api.groups.create, { name: 'DUNEDESIGNERS' });
    expect(shadow.slug).toBe('dunedesigners-2');
  });

  test('dangling references from historical hard deletions project to null', async () => {
    const { t, ids } = await softDeletionFixture();
    await t.run(async (ctx) => {
      await ctx.db.delete(ids.groupId);
    });

    const assetOwner = t.withIdentity({ subject: ids.assetOwnerId });
    const faction = await assetOwner.query(api.factions.getBySlug, {
      slug: 'collaborative-faction',
    });
    expect(faction.viewerAccess.assignedGroup).toBeNull();
    expect(faction.viewerAccess.capabilities).toMatchObject({
      edit: true,
      changeGroup: true,
      delete: true,
    });
  });

  test('a deleted Group exposes no capabilities on its detail page', async () => {
    const { t, ids } = await softDeletionFixture();
    await t.withIdentity({ subject: ids.ownerId }).mutation(api.groups.softDelete, {
      id: ids.groupId,
    });

    const page = await t.withIdentity({ subject: ids.ownerId }).query(api.groups.detailBySlug, {
      slug: 'dunedesigners',
    });
    expect(Object.values(page.viewerAccess.capabilities).some(Boolean)).toBe(false);
  });
});
