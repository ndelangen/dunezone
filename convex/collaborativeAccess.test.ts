/// <reference types="vite/client" />
// @vitest-environment edge-runtime

import aggregateTest from '@convex-dev/aggregate/test';
import { convexTest } from 'convex-test';
import { describe, expect, test } from 'vitest';

import { assetPublishingFaction } from '../src/game/fixtures/assetPublishingFaction';
import { api } from './_generated/api';
import schema from './schema';

const modules = import.meta.glob('./**/*.ts');
const now = '2026-08-05T00:00:00.000Z';

async function groupAccessFixture() {
  const t = convexTest(schema, modules);
  aggregateTest.register(t, 'statistics');
  aggregateTest.register(t, 'profileDiscovery');
  const ids = await t.run(async (ctx) => {
    const ownerId = await ctx.db.insert('users', { name: 'Group owner' });
    const assetOwnerId = await ctx.db.insert('users', { name: 'Asset owner' });
    const activeId = await ctx.db.insert('users', { name: 'Active member' });
    const pendingId = await ctx.db.insert('users', { name: 'Pending member' });
    const removedId = await ctx.db.insert('users', { name: 'Removed member' });
    const groupId = await ctx.db.insert('groups', {
      name: 'Dune Designers',
      slug: 'dune-designers',
      created_at: now,
      created_by: ownerId,
    });
    for (const [userId, username, slug] of [
      [ownerId, 'Group owner', 'group-owner'],
      [assetOwnerId, 'Asset owner', 'asset-owner'],
      [activeId, 'Active member', 'active-member'],
      [pendingId, 'Pending member', 'pending-member'],
      [removedId, 'Removed member', 'removed-member'],
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
    const membershipIds = {
      owner: await ctx.db.insert('group_members', {
        group_id: groupId,
        user_id: ownerId,
        status: 'active',
        requested_at: now,
        approved_at: now,
        approved_by: ownerId,
      }),
      active: await ctx.db.insert('group_members', {
        group_id: groupId,
        user_id: activeId,
        status: 'active',
        requested_at: now,
        approved_at: now,
        approved_by: ownerId,
      }),
      pending: await ctx.db.insert('group_members', {
        group_id: groupId,
        user_id: pendingId,
        status: 'pending',
        requested_at: now,
        approved_at: null,
        approved_by: null,
      }),
      removed: await ctx.db.insert('group_members', {
        group_id: groupId,
        user_id: removedId,
        status: 'removed',
        requested_at: now,
        approved_at: null,
        approved_by: null,
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
    await ctx.db.insert('ruleset_factions', {
      ruleset_id: rulesetId,
      faction_id: factionId,
    });
    return {
      ownerId,
      assetOwnerId,
      activeId,
      pendingId,
      removedId,
      groupId,
      membershipIds,
      factionId,
      rulesetId,
    };
  });
  return { t, ids };
}

describe('collaborative access public projections', () => {
  test('public Group access distinguishes anonymous, none, pending, active, and removed', async () => {
    const { t, ids } = await groupAccessFixture();
    const outsiderId = await t.run(async (ctx) => {
      const userId = await ctx.db.insert('users', { name: 'Outsider' });
      await ctx.db.insert('profiles', {
        user_id: userId,
        username: 'Outsider',
        avatar_url: null,
        slug: 'outsider',
        created_at: now,
        updated_at: now,
      });
      return userId;
    });

    const queryAs = async (userId?: typeof outsiderId) =>
      userId
        ? await t
            .withIdentity({ subject: userId })
            .query(api.groups.detailBySlug, { slug: 'dune-designers' })
        : await t.query(api.groups.detailBySlug, { slug: 'dune-designers' });

    expect((await queryAs()).viewerAccess.viewer).toEqual({ kind: 'anonymous' });
    expect((await queryAs(outsiderId)).viewerAccess.viewer).toEqual({
      kind: 'authenticated',
      membership: 'none',
    });
    expect((await queryAs(ids.pendingId)).viewerAccess.viewer).toEqual({
      kind: 'authenticated',
      membership: 'pending',
    });
    expect((await queryAs(ids.activeId)).viewerAccess.viewer).toEqual({
      kind: 'authenticated',
      membership: 'active',
    });
    expect((await queryAs(ids.removedId)).viewerAccess.viewer).toEqual({
      kind: 'authenticated',
      membership: 'none',
    });
  });

  test('Group detail adds trusted viewer access and roster without changing legacy rows', async () => {
    const { t, ids } = await groupAccessFixture();
    const owner = t.withIdentity({ subject: ids.ownerId });

    const page = await owner.query(api.groups.detailBySlug, { slug: 'dune-designers' });

    expect(page.viewerAccess).toEqual({
      kind: 'group',
      viewer: { kind: 'authenticated', membership: 'active' },
      capabilities: {
        requestMembership: false,
        rename: true,
        delete: true,
        addMember: true,
      },
    });
    expect(page.roster).toEqual([
      expect.objectContaining({
        membershipId: ids.membershipIds.owner,
        status: 'active',
        capabilities: { approve: false, reject: false, remove: false },
      }),
      expect.objectContaining({
        membershipId: ids.membershipIds.active,
        status: 'active',
        capabilities: { approve: false, reject: false, remove: true },
      }),
      expect.objectContaining({
        membershipId: ids.membershipIds.pending,
        status: 'pending',
        capabilities: { approve: true, reject: true, remove: false },
      }),
    ]);
    expect(page.members).toHaveLength(4);
    expect(page.profiles).toHaveLength(4);
  });

  test('faction and ruleset pages project parity with their rename policy difference', async () => {
    const { t, ids } = await groupAccessFixture();
    const member = t.withIdentity({ subject: ids.activeId });

    const factionPage = await member.query(api.factions.getBySlug, {
      slug: 'collaborative-faction',
    });
    const rulesetPage = await member.query(api.rulesets.detailPageBySlug, {
      slug: 'collaborative-ruleset',
    });

    expect(factionPage.viewerAccess).toMatchObject({
      kind: 'faction',
      viewer: { kind: 'authenticated', membership: 'active' },
      capabilities: { edit: true, rename: true, changeGroup: false, delete: false },
    });
    expect(rulesetPage?.viewerAccess).toMatchObject({
      kind: 'ruleset',
      viewer: { kind: 'authenticated', membership: 'active' },
      capabilities: { edit: true, rename: false, changeGroup: false, delete: false },
    });
    expect(factionPage.assignableGroups).toEqual([
      { id: ids.groupId, name: 'Dune Designers', slug: 'dune-designers' },
    ]);
    expect(rulesetPage?.assignableGroups).toEqual(factionPage.assignableGroups);
    expect(factionPage.rulesets).toEqual([
      { id: ids.rulesetId, name: 'Collaborative Ruleset', slug: 'collaborative-ruleset' },
    ]);

    expect(factionPage.memberships).toHaveLength(1);
    expect(factionPage.groupAccess?.members).toHaveLength(4);
    expect(rulesetPage?.canEditRuleset).toBe(true);
    expect(rulesetPage?.groupAccess?.members).toHaveLength(4);
    expect(rulesetPage?.viewerAssignableMemberships).toHaveLength(1);
  });

  test('faction and ruleset public access cover every actor role symmetrically', async () => {
    const { t, ids } = await groupAccessFixture();
    const outsiderId = await t.run((ctx) => ctx.db.insert('users', { name: 'Asset outsider' }));
    const cases = [
      {
        label: 'anonymous',
        userId: null,
        viewer: { kind: 'anonymous' },
        faction: {
          requestMembership: false,
          edit: false,
          rename: false,
          changeGroup: false,
          delete: false,
        },
        ruleset: {
          requestMembership: false,
          edit: false,
          rename: false,
          changeGroup: false,
          delete: false,
        },
      },
      {
        label: 'authenticated none',
        userId: outsiderId,
        viewer: { kind: 'authenticated', membership: 'none' },
        faction: {
          requestMembership: true,
          edit: false,
          rename: false,
          changeGroup: false,
          delete: false,
        },
        ruleset: {
          requestMembership: true,
          edit: false,
          rename: false,
          changeGroup: false,
          delete: false,
        },
      },
      {
        label: 'pending',
        userId: ids.pendingId,
        viewer: { kind: 'authenticated', membership: 'pending' },
        faction: {
          requestMembership: false,
          edit: false,
          rename: false,
          changeGroup: false,
          delete: false,
        },
        ruleset: {
          requestMembership: false,
          edit: false,
          rename: false,
          changeGroup: false,
          delete: false,
        },
      },
      {
        label: 'removed',
        userId: ids.removedId,
        viewer: { kind: 'authenticated', membership: 'none' },
        faction: {
          requestMembership: true,
          edit: false,
          rename: false,
          changeGroup: false,
          delete: false,
        },
        ruleset: {
          requestMembership: true,
          edit: false,
          rename: false,
          changeGroup: false,
          delete: false,
        },
      },
      {
        label: 'Group owner',
        userId: ids.ownerId,
        viewer: { kind: 'authenticated', membership: 'active' },
        faction: {
          requestMembership: false,
          edit: true,
          rename: true,
          changeGroup: false,
          delete: false,
        },
        ruleset: {
          requestMembership: false,
          edit: true,
          rename: false,
          changeGroup: false,
          delete: false,
        },
      },
      {
        label: 'distinct asset owner',
        userId: ids.assetOwnerId,
        viewer: { kind: 'authenticated', membership: 'none' },
        faction: {
          requestMembership: true,
          edit: true,
          rename: true,
          changeGroup: true,
          delete: true,
        },
        ruleset: {
          requestMembership: true,
          edit: true,
          rename: true,
          changeGroup: true,
          delete: true,
        },
      },
    ] as const;

    for (const actor of cases) {
      const client = actor.userId ? t.withIdentity({ subject: actor.userId }) : t;
      const faction = await client.query(api.factions.getBySlug, {
        slug: 'collaborative-faction',
      });
      const ruleset = await client.query(api.rulesets.getBySlug, {
        slug: 'collaborative-ruleset',
      });
      expect(faction.viewerAccess.viewer, actor.label).toEqual(actor.viewer);
      expect(ruleset.viewerAccess.viewer, actor.label).toEqual(actor.viewer);
      expect(faction.viewerAccess.capabilities, actor.label).toEqual(actor.faction);
      expect(ruleset.viewerAccess.capabilities, actor.label).toEqual(actor.ruleset);
    }
  });

  test('profile detail adds safe Group summaries without removing legacy membership transport', async () => {
    const { t, ids } = await groupAccessFixture();

    const profilePage = await t.query(api.profiles.getBySlug, { slug: 'active-member' });

    expect(profilePage.groupSummaries).toEqual([
      { id: ids.groupId, name: 'Dune Designers', slug: 'dune-designers' },
    ]);
    expect(profilePage.memberships).toHaveLength(1);
    expect(profilePage.groups).toHaveLength(1);
    expect(profilePage.memberships[0]).toMatchObject({
      group_id: ids.groupId,
      user_id: ids.activeId,
      status: 'active',
    });
  });

  test('ownership and active membership remain distinct trusted facts', async () => {
    const { t, ids } = await groupAccessFixture();
    await t.run(async (ctx) => {
      await ctx.db.delete(ids.membershipIds.owner);
    });

    const page = await t.withIdentity({ subject: ids.ownerId }).query(api.groups.detailBySlug, {
      slug: 'dune-designers',
    });
    expect(page.viewerAccess).toMatchObject({
      viewer: { kind: 'authenticated', membership: 'none' },
      capabilities: { rename: true, delete: true, addMember: false },
    });

    const assetOwnerPage = await t
      .withIdentity({ subject: ids.assetOwnerId })
      .query(api.factions.getBySlug, { slug: 'collaborative-faction' });
    expect(assetOwnerPage.viewerAccess).toMatchObject({
      viewer: { kind: 'authenticated', membership: 'none' },
      capabilities: { edit: true, rename: true, changeGroup: true, delete: true },
    });
  });

  test('soft-deleted rulesets do not regain owner edit access', async () => {
    const { t, ids } = await groupAccessFixture();
    await t.run(async (ctx) => {
      await ctx.db.patch(ids.rulesetId, { is_deleted: true });
    });

    await expect(
      t.withIdentity({ subject: ids.assetOwnerId }).query(api.rulesets.canEdit, {
        ruleset_id: ids.rulesetId,
      })
    ).resolves.toBe(false);
  });

  test('duplicate membership pairs fail the trusted lookup instead of becoming order-dependent', async () => {
    const { t, ids } = await groupAccessFixture();
    await t.run(async (ctx) => {
      await ctx.db.insert('group_members', {
        group_id: ids.groupId,
        user_id: ids.activeId,
        status: 'active',
        requested_at: `${now}-duplicate`,
        approved_at: now,
        approved_by: ids.ownerId,
      });
    });

    const active = t.withIdentity({ subject: ids.activeId });
    await expect(
      active.query(api.factions.getBySlug, { slug: 'collaborative-faction' })
    ).rejects.toThrow();
    await expect(
      active.query(api.groups.detailBySlug, { slug: 'dune-designers' })
    ).rejects.toThrow();
  });

  test('trusted membership authority is independent of capped presentation collections', async () => {
    const { t, ids } = await groupAccessFixture();
    const capped = await t.run(async (ctx) => {
      const viewerId = await ctx.db.insert('users', { name: 'Late active viewer' });
      const fillerId = await ctx.db.insert('users', { name: 'Roster filler' });
      for (const [userId, slug] of [
        [viewerId, 'late-active-viewer'],
        [fillerId, 'roster-filler'],
      ] as const) {
        await ctx.db.insert('profiles', {
          user_id: userId,
          username: slug,
          avatar_url: null,
          slug,
          created_at: now,
          updated_at: now,
        });
      }
      const distractionGroupId = await ctx.db.insert('groups', {
        name: 'Membership history',
        slug: 'membership-history',
        created_at: now,
        created_by: ids.ownerId,
      });
      for (let index = 0; index < 500; index += 1) {
        await ctx.db.insert('group_members', {
          group_id: distractionGroupId,
          user_id: viewerId,
          status: 'removed',
          requested_at: `${now}-${index}`,
          approved_at: null,
          approved_by: null,
        });
        await ctx.db.insert('group_members', {
          group_id: ids.groupId,
          user_id: fillerId,
          status: 'removed',
          requested_at: `${now}-${index}`,
          approved_at: null,
          approved_by: null,
        });
      }
      for (let index = 0; index < 501; index += 1) {
        const groupId = await ctx.db.insert('groups', {
          name: `Active history ${index}`,
          slug: `active-history-${index}`,
          created_at: now,
          created_by: ids.ownerId,
        });
        await ctx.db.insert('group_members', {
          group_id: groupId,
          user_id: viewerId,
          status: 'active',
          requested_at: `${now}-active-${index}`,
          approved_at: now,
          approved_by: ids.ownerId,
        });
      }
      const membershipId = await ctx.db.insert('group_members', {
        group_id: ids.groupId,
        user_id: viewerId,
        status: 'active',
        requested_at: now,
        approved_at: now,
        approved_by: ids.ownerId,
      });
      return { viewerId, membershipId };
    });

    const viewer = t.withIdentity({ subject: capped.viewerId });
    const faction = await viewer.query(api.factions.getBySlug, {
      slug: 'collaborative-faction',
    });
    const ruleset = await viewer.query(api.rulesets.detailPageBySlug, {
      slug: 'collaborative-ruleset',
    });
    const group = await viewer.query(api.groups.detailBySlug, { slug: 'dune-designers' });

    expect(faction.viewerAccess).toMatchObject({
      viewer: { kind: 'authenticated', membership: 'active' },
      capabilities: { edit: true, rename: true },
    });
    expect(group.viewerAccess).toMatchObject({
      viewer: { kind: 'authenticated', membership: 'active' },
      capabilities: { addMember: true },
    });
    expect(ruleset?.viewerAccess.viewer).toEqual({
      kind: 'authenticated',
      membership: 'active',
    });
    expect(faction.memberships).toHaveLength(500);
    expect(faction.groups).toHaveLength(501);
    expect(faction.assignableGroups).toHaveLength(200);
    expect(ruleset?.viewerAssignableMemberships).toHaveLength(200);
    expect(ruleset?.assignableGroups).toHaveLength(200);
    expect(group.roster.some((entry) => entry.membershipId === capped.membershipId)).toBe(false);
  });
});

describe('collaborative access moderation commands', () => {
  test('legacy soft-delete commands remain idempotent while deleted projections deny access', async () => {
    const { t, ids } = await groupAccessFixture();
    const assetOwner = t.withIdentity({ subject: ids.assetOwnerId });

    await expect(assetOwner.mutation(api.factions.softDelete, { id: ids.factionId })).resolves.toBe(
      null
    );
    await expect(assetOwner.mutation(api.factions.softDelete, { id: ids.factionId })).resolves.toBe(
      null
    );
    await expect(assetOwner.mutation(api.rulesets.softDelete, { id: ids.rulesetId })).resolves.toBe(
      null
    );
    await expect(assetOwner.mutation(api.rulesets.softDelete, { id: ids.rulesetId })).resolves.toBe(
      null
    );
    await expect(
      assetOwner.query(api.rulesets.canEdit, { ruleset_id: ids.rulesetId })
    ).resolves.toBe(false);
  });

  test('request is authoritative, idempotent, and reactivates the same removed row', async () => {
    const { t, ids } = await groupAccessFixture();
    const pending = t.withIdentity({ subject: ids.pendingId });
    const active = t.withIdentity({ subject: ids.activeId });
    const removed = t.withIdentity({ subject: ids.removedId });

    await expect(
      pending.mutation(api.members.request, { group_id: ids.groupId })
    ).resolves.toMatchObject({
      _id: ids.membershipIds.pending,
      status: 'pending',
    });
    await expect(
      active.mutation(api.members.request, { group_id: ids.groupId })
    ).resolves.toMatchObject({
      _id: ids.membershipIds.active,
      status: 'active',
    });
    await expect(
      removed.mutation(api.members.request, { group_id: ids.groupId })
    ).resolves.toMatchObject({
      _id: ids.membershipIds.removed,
      status: 'pending',
    });
    await expect(
      removed.mutation(api.members.request, { group_id: ids.groupId })
    ).resolves.toMatchObject({
      _id: ids.membershipIds.removed,
      status: 'pending',
    });
  });

  test('canonical membership-id commands and exact legacy pair shims share one policy path', async () => {
    const { t, ids } = await groupAccessFixture();
    const owner = t.withIdentity({ subject: ids.ownerId });

    const approved = await owner.mutation(api.members.approveRequest, {
      membershipId: ids.membershipIds.pending,
    });
    expect(approved).toEqual({ membershipId: ids.membershipIds.pending, status: 'active' });
    await expect(
      t.run((ctx) => ctx.db.get('group_members', ids.membershipIds.pending))
    ).resolves.toMatchObject({ status: 'active', approved_by: ids.ownerId });

    const rejectedId = await t.run(async (ctx) => {
      const userId = await ctx.db.insert('users', { name: 'Second requester' });
      return await ctx.db.insert('group_members', {
        group_id: ids.groupId,
        user_id: userId,
        status: 'pending',
        requested_at: now,
        approved_at: null,
        approved_by: null,
      });
    });
    const rejected = await owner.mutation(api.members.rejectRequest, {
      membershipId: rejectedId,
    });
    expect(rejected).toEqual({ membershipId: rejectedId, status: 'removed' });

    const removed = await owner.mutation(api.members.removeMember, {
      membershipId: ids.membershipIds.active,
    });
    expect(removed).toEqual({ membershipId: ids.membershipIds.active, status: 'removed' });

    const legacyApproved = await owner
      .mutation(api.members.approve, {
        group_id: ids.groupId,
        user_id: ids.removedId,
      })
      .catch((error) => error);
    expect(String(legacyApproved)).toContain('Membership is not pending approval');

    await expect(
      t.withIdentity({ subject: ids.removedId }).mutation(api.members.rejectRequest, {
        membershipId: ids.membershipIds.pending,
      })
    ).rejects.toThrow('Not authorized');
  });

  test('canonical membership-id commands authenticate before existing or missing row lookup', async () => {
    const { t, ids } = await groupAccessFixture();
    const missingMembershipId = await t.run(async (ctx) => {
      const membershipId = await ctx.db.insert('group_members', {
        group_id: ids.groupId,
        user_id: ids.assetOwnerId,
        status: 'pending',
        requested_at: now,
        approved_at: null,
        approved_by: null,
      });
      await ctx.db.delete(membershipId);
      return membershipId;
    });

    await expect(
      t.mutation(api.members.approveRequest, { membershipId: ids.membershipIds.pending })
    ).rejects.toThrow('Not authenticated');
    await expect(
      t.mutation(api.members.approveRequest, { membershipId: missingMembershipId })
    ).rejects.toThrow('Not authenticated');
    await expect(
      t.mutation(api.members.rejectRequest, { membershipId: ids.membershipIds.pending })
    ).rejects.toThrow('Not authenticated');
    await expect(
      t.mutation(api.members.rejectRequest, { membershipId: missingMembershipId })
    ).rejects.toThrow('Not authenticated');
    await expect(
      t.mutation(api.members.removeMember, { membershipId: ids.membershipIds.active })
    ).rejects.toThrow('Not authenticated');
    await expect(
      t.mutation(api.members.removeMember, { membershipId: missingMembershipId })
    ).rejects.toThrow('Not authenticated');
  });

  test('faction command guards preserve collaborator rename but owner-only reassignment and delete', async () => {
    const { t, ids } = await groupAccessFixture();
    const member = t.withIdentity({ subject: ids.activeId });

    const updated = await member.mutation(api.factions.update, {
      id: ids.factionId,
      data: { ...structuredClone(assetPublishingFaction), name: 'Member Renamed Faction' },
    });
    expect(updated).toMatchObject({ slug: 'member-renamed-faction' });

    await expect(
      member.mutation(api.factions.setGroup, { id: ids.factionId, group_id: null })
    ).rejects.toThrow('Not authorized');
    await expect(member.mutation(api.factions.softDelete, { id: ids.factionId })).rejects.toThrow(
      'Not authorized'
    );
  });

  test('add, owner-removal denial, and reassignment target eligibility are authoritative', async () => {
    const { t, ids } = await groupAccessFixture();
    const member = t.withIdentity({ subject: ids.activeId });
    const groupOwner = t.withIdentity({ subject: ids.ownerId });
    const assetOwner = t.withIdentity({ subject: ids.assetOwnerId });

    await expect(
      groupOwner.mutation(api.members.removeMember, {
        membershipId: ids.membershipIds.owner,
      })
    ).rejects.toThrow('Cannot remove the group owner');

    await assetOwner.mutation(api.factions.setGroup, { id: ids.factionId, group_id: null });
    await assetOwner.mutation(api.rulesets.update, {
      id: ids.rulesetId,
      name: 'CollaborativeRuleset',
      group_id: null,
    });
    await expect(
      assetOwner.mutation(api.factions.setGroup, { id: ids.factionId, group_id: ids.groupId })
    ).rejects.toThrow('Not authorized for group');
    await expect(
      assetOwner.mutation(api.rulesets.update, {
        id: ids.rulesetId,
        name: 'CollaborativeRuleset',
        group_id: ids.groupId,
      })
    ).rejects.toThrow('Not authorized for group');

    const added = await member.mutation(api.members.addMember, {
      groupId: ids.groupId,
      userId: ids.assetOwnerId,
    });
    expect(added).toMatchObject({ status: 'active' });
    await expect(
      assetOwner.mutation(api.factions.setGroup, { id: ids.factionId, group_id: ids.groupId })
    ).resolves.toMatchObject({ group_id: ids.groupId });
    await expect(
      assetOwner.mutation(api.rulesets.update, {
        id: ids.rulesetId,
        name: 'CollaborativeRuleset',
        group_id: ids.groupId,
      })
    ).resolves.toMatchObject({ group_id: ids.groupId });
  });

  test('legacy pair shims authorize before revealing whether the target pair exists', async () => {
    const { t, ids } = await groupAccessFixture();
    const { nonexistentUserId, missingGroupId } = await t.run(async (ctx) => {
      const userId = await ctx.db.insert('users', { name: 'Nobody' });
      const groupId = await ctx.db.insert('groups', {
        name: 'Deleted transport target',
        slug: 'deleted-transport-target',
        created_at: now,
        created_by: ids.ownerId,
      });
      await ctx.db.delete(groupId);
      return { nonexistentUserId: userId, missingGroupId: groupId };
    });

    await expect(
      t.mutation(api.members.approve, {
        group_id: ids.groupId,
        user_id: nonexistentUserId,
      })
    ).rejects.toThrow('Not authenticated');
    await expect(
      t.withIdentity({ subject: ids.removedId }).mutation(api.members.approve, {
        group_id: ids.groupId,
        user_id: nonexistentUserId,
      })
    ).rejects.toThrow('Not authorized');
    await expect(
      t.withIdentity({ subject: ids.ownerId }).mutation(api.members.approve, {
        group_id: missingGroupId,
        user_id: nonexistentUserId,
      })
    ).rejects.toThrow('Not authorized');
    await expect(
      t.withIdentity({ subject: ids.ownerId }).mutation(api.members.remove, {
        group_id: missingGroupId,
        user_id: nonexistentUserId,
      })
    ).rejects.toThrow('Group not found');
    await expect(
      t.withIdentity({ subject: ids.ownerId }).mutation(api.members.request, {
        group_id: missingGroupId,
      })
    ).rejects.toThrow('Group not found');
  });
});
