/// <reference types="vite/client" />
// @vitest-environment edge-runtime

import aggregateTest from '@convex-dev/aggregate/test';
import { convexTest } from 'convex-test';
import { describe, expect, test } from 'vitest';

import { assetPublishingFaction } from '../src/shared/factions/fixtures/assetPublishingFaction';
import { api } from './_generated/api';
import schema from './schema';

const modules = import.meta.glob('./**/*.ts');
const DESCRIPTION = 'A test ruleset with a description long enough to satisfy the fifty character floor.';

async function defaultGroupFixture() {
  const t = convexTest(schema, modules);
  aggregateTest.register(t, 'statistics');
  aggregateTest.register(t, 'profileActivity');
  aggregateTest.register(t, 'profileDiscovery');
  const ids = await t.run(async (ctx) => {
    const ownerId = await ctx.db.insert('users', { name: 'Default Group Owner' });
    const memberId = await ctx.db.insert('users', { name: 'Default Group Member' });
    const groupId = await ctx.db.insert('groups', {
      name: 'Default Group',
      slug: 'default-group',
      created_at: '2026-08-20T00:00:00.000Z',
      created_by: ownerId,
      is_deleted: false,
    });
    const memberProfileId = await ctx.db.insert('profiles', {
      user_id: memberId,
      username: 'DefaultGroupMember',
      avatar_url: 'https://example.com/member.png',
      slug: 'default-group-member',
      created_at: '2026-08-20T00:00:00.000Z',
      updated_at: '2026-08-20T00:00:00.000Z',
    });
    await ctx.db.insert('group_members', {
      group_id: groupId,
      user_id: ownerId,
      status: 'active',
      requested_at: '2026-08-20T00:00:00.000Z',
      approved_at: '2026-08-20T00:00:00.000Z',
      approved_by: ownerId,
    });
    const membershipId = await ctx.db.insert('group_members', {
      group_id: groupId,
      user_id: memberId,
      status: 'active',
      requested_at: '2026-08-20T00:00:00.000Z',
      approved_at: '2026-08-20T00:00:00.000Z',
      approved_by: ownerId,
    });
    return { ownerId, memberId, groupId, memberProfileId, membershipId };
  });
  return { t, ids, owner: t.withIdentity({ subject: ids.ownerId }), member: t.withIdentity({ subject: ids.memberId }) };
}

async function selectDefaultGroup(
  member: Awaited<ReturnType<typeof defaultGroupFixture>>['member'],
  groupId: Awaited<ReturnType<typeof defaultGroupFixture>>['ids']['groupId']
) {
  return await member.mutation(api.profiles.updateCurrent, {
    username: 'DefaultGroupMember',
    avatar_url: 'https://example.com/member.png',
    default_group_id: groupId,
  });
}

describe('default Group preference', () => {
  test('projects legacy-missing and explicitly cleared preferences as no default', async () => {
    const { t, ids, member } = await defaultGroupFixture();

    const legacyProfile = await t.run(async (ctx) => await ctx.db.get('profiles', ids.memberProfileId));
    expect(legacyProfile).not.toHaveProperty('default_group_id');
    await expect(member.query(api.profiles.current, {})).resolves.toMatchObject({
      default_group_id: null,
      default_group_options: [{ id: ids.groupId, name: 'Default Group' }],
    });

    await expect(
      member.mutation(api.profiles.updateCurrent, {
        username: 'DefaultGroupMember',
        avatar_url: 'https://example.com/member.png',
        default_group_id: null,
      })
    ).resolves.toMatchObject({
      profile: { default_group_id: null },
      default_group_unavailable: false,
    });
  });

  test('projects active memberships and applies the selected default to new rulesets and factions', async () => {
    const { member, ids } = await defaultGroupFixture();
    await expect(selectDefaultGroup(member, ids.groupId)).resolves.toMatchObject({
      profile: { default_group_id: ids.groupId },
      default_group_unavailable: false,
    });
    await expect(member.query(api.profiles.current, {})).resolves.toMatchObject({
      default_group_id: ids.groupId,
      default_group_options: [{ id: ids.groupId, name: 'Default Group' }],
    });

    await expect(
      member.mutation(api.rulesets.create, {
        name: 'DefaultGroupRuleset',
        description: DESCRIPTION,
        image_cover: null,
      })
    ).resolves.toMatchObject({ group_id: ids.groupId, default_group_unavailable: false });
    await expect(
      member.mutation(api.factions.create, {
        data: { ...assetPublishingFaction, name: 'Default Group Faction' },
      })
    ).resolves.toMatchObject({ group_id: ids.groupId, default_group_unavailable: false });
  });

  test('keeps a soft-deleted preference stored, projects it as none, and saves new creations ungrouped', async () => {
    const { t, ids, owner, member } = await defaultGroupFixture();
    await selectDefaultGroup(member, ids.groupId);
    await owner.mutation(api.groups.softDelete, { id: ids.groupId });

    await expect(t.run(async (ctx) => await ctx.db.get('profiles', ids.memberProfileId))).resolves.toMatchObject({
      default_group_id: ids.groupId,
    });
    await expect(member.query(api.profiles.current, {})).resolves.toMatchObject({
      default_group_id: null,
      default_group_options: [],
    });
    await expect(
      member.mutation(api.rulesets.create, {
        name: 'SoftDeletedDefaultRuleset',
        description: DESCRIPTION,
        image_cover: null,
      })
    ).resolves.toMatchObject({ group_id: null, default_group_unavailable: true });
    await expect(
      member.mutation(api.factions.create, {
        data: { ...assetPublishingFaction, name: 'Soft Deleted Default Faction' },
      })
    ).resolves.toMatchObject({ group_id: null, default_group_unavailable: true });
    await expect(
      member.mutation(api.rulesets.create, {
        name: 'ExplicitDeletedGroupRuleset',
        description: DESCRIPTION,
        image_cover: null,
        group_id: ids.groupId,
      })
    ).rejects.toThrow('not found');
  });

  test('clears the stored preference when the active membership is removed', async () => {
    const { t, ids, owner, member } = await defaultGroupFixture();
    await selectDefaultGroup(member, ids.groupId);
    await owner.mutation(api.members.removeMember, { membershipId: ids.membershipId });

    const profile = await t.run(async (ctx) => await ctx.db.get('profiles', ids.memberProfileId));
    expect(profile).toMatchObject({ default_group_id: null });
    await expect(member.query(api.profiles.current, {})).resolves.toMatchObject({
      default_group_id: null,
      default_group_options: [],
    });
  });
});
