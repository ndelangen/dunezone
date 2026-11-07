/// <reference types="vite/client" />
// @vitest-environment edge-runtime

import { describe, expect, test } from 'vite-plus/test';

import { api } from './_generated/api';
import type { Id } from './_generated/dataModel';
import { applicationTest } from './application.test.fixture';

const now = '2026-11-07T00:00:00.000Z';

async function seedPerson(t: ReturnType<typeof applicationTest>, slug: string) {
  return await t.run(async (ctx) => {
    const userId = await ctx.db.insert('users', { name: slug });
    const profileId = await ctx.db.insert('profiles', {
      user_id: userId,
      username: slug,
      avatar_url: null,
      account_state: 'active',
      slug,
      created_at: now,
      updated_at: now,
    });
    return { userId, profileId };
  });
}

async function membershipOf(t: ReturnType<typeof applicationTest>, groupId: Id<'groups'>, userId: Id<'users'>) {
  return await t.run(async (ctx) =>
    ctx.db
      .query('group_members')
      .withIndex('by_group_user', (q) => q.eq('group_id', groupId).eq('user_id', userId))
      .unique()
  );
}

/** An owner with a Group, one active member, and two people outside it. */
async function invitationFixture() {
  const t = applicationTest();
  const owner = await seedPerson(t, 'owner');
  const member = await seedPerson(t, 'member');
  const guest = await seedPerson(t, 'guest');
  const bystander = await seedPerson(t, 'bystander');
  const groupId = await t.run(async (ctx) => {
    const groupId = await ctx.db.insert('groups', {
      name: 'Sietch Tabr',
      slug: 'sietch-tabr',
      created_at: now,
      created_by: owner.userId,
      is_deleted: false,
    });
    for (const userId of [owner.userId, member.userId]) {
      await ctx.db.insert('group_members', {
        group_id: groupId,
        user_id: userId,
        status: 'active',
        requested_at: now,
        approved_at: now,
        approved_by: owner.userId,
      });
    }
    return groupId;
  });
  return {
    t,
    groupId,
    owner,
    member,
    guest,
    bystander,
    asOwner: t.withIdentity({ subject: owner.userId }),
    asMember: t.withIdentity({ subject: member.userId }),
    asGuest: t.withIdentity({ subject: guest.userId }),
    asBystander: t.withIdentity({ subject: bystander.userId }),
  };
}

describe('Group invitations', () => {
  test('adding someone sends an invitation that grants nothing until they accept', async () => {
    const { t, groupId, member, guest, asMember, asGuest, asBystander } = await invitationFixture();

    const ack = await asMember.mutation(api.members.addMember, { groupId, userId: guest.userId });
    expect(ack.status).toBe('invited');
    await expect(membershipOf(t, groupId, guest.userId)).resolves.toMatchObject({
      status: 'invited',
      approved_by: member.userId,
      approved_at: null,
    });

    /* To the rules, and to every bundle, the invited person is still a stranger. */
    await expect(asGuest.query(api.groups.viewerMembership, { groupId })).resolves.toBe('none');
    await expect(asGuest.query(api.groups.viewerAssignableGroups, {})).resolves.toEqual([]);
    await expect(asGuest.query(api.profiles.defaultGroupPreference, {})).resolves.toMatchObject({
      default_group_options: [],
    });
    await expect(asGuest.mutation(api.members.addMember, { groupId, userId: member.userId })).rejects.toThrow(
      'Not authorized'
    );

    /* Neither the public roster nor the person's profile names the Group. */
    const page = await t.query(api.groups.detailPage, { slug: 'sietch-tabr' });
    expect(page.roster.map((row) => row.user.slug).sort()).toEqual(['member', 'owner']);
    await expect(t.query(api.profiles.pageBySlug, { slug: 'guest' })).resolves.toMatchObject({ groupSummaries: [] });

    /* The invitation is the invited person's to see, and the Group's active members'; nobody else's. */
    await expect(asGuest.query(api.members.viewerInvitations, {})).resolves.toMatchObject([
      { group: { id: groupId, slug: 'sietch-tabr' }, invitedBy: { slug: 'member' } },
    ]);
    await expect(asMember.query(api.members.groupInvitations, { groupId })).resolves.toMatchObject([
      { user: { slug: 'guest' }, invitedBy: { slug: 'member' } },
    ]);
    await expect(asGuest.query(api.members.groupInvitations, { groupId })).resolves.toEqual([]);
    await expect(asBystander.query(api.members.groupInvitations, { groupId })).resolves.toEqual([]);
    await expect(t.query(api.members.groupInvitations, { groupId })).resolves.toEqual([]);

    /* Inviting again changes nothing. */
    await expect(asMember.mutation(api.members.addMember, { groupId, userId: guest.userId })).resolves.toMatchObject({
      membershipId: ack.membershipId,
      status: 'invited',
    });
  });

  test('accepting makes the invited person an active member; only they may accept', async () => {
    const { t, groupId, member, guest, asMember, asGuest, asBystander } = await invitationFixture();
    await asMember.mutation(api.members.addMember, { groupId, userId: guest.userId });

    await expect(asBystander.mutation(api.members.acceptInvite, { group_id: groupId })).rejects.toThrow(
      'Membership not found'
    );
    await expect(asMember.mutation(api.members.acceptInvite, { group_id: groupId })).rejects.toThrow(
      'No invitation to accept'
    );

    await expect(asGuest.mutation(api.members.acceptInvite, { group_id: groupId })).resolves.toMatchObject({
      status: 'active',
    });
    await expect(membershipOf(t, groupId, guest.userId)).resolves.toMatchObject({
      status: 'active',
      approved_by: member.userId,
    });
    await expect(asGuest.query(api.groups.viewerMembership, { groupId })).resolves.toBe('active');
    await expect(asGuest.query(api.members.viewerInvitations, {})).resolves.toEqual([]);
    const page = await t.query(api.groups.detailPage, { slug: 'sietch-tabr' });
    expect(page.roster.map((row) => row.user.slug).sort()).toEqual(['guest', 'member', 'owner']);
    await expect(t.query(api.profiles.pageBySlug, { slug: 'guest' })).resolves.toMatchObject({
      groupSummaries: [{ slug: 'sietch-tabr' }],
    });
  });

  test('asking to join a Group that already invited you accepts the invitation', async () => {
    const { groupId, guest, asMember, asGuest } = await invitationFixture();
    await asMember.mutation(api.members.addMember, { groupId, userId: guest.userId });
    await expect(asGuest.mutation(api.members.request, { group_id: groupId })).resolves.toMatchObject({
      status: 'active',
    });
  });

  test('declining removes the invitation and leaves the person open to another', async () => {
    const { t, groupId, guest, asMember, asGuest } = await invitationFixture();
    await asMember.mutation(api.members.addMember, { groupId, userId: guest.userId });

    await expect(asGuest.mutation(api.members.declineInvite, { group_id: groupId })).resolves.toMatchObject({
      status: 'removed',
    });
    await expect(asGuest.query(api.members.viewerInvitations, {})).resolves.toEqual([]);
    await expect(asMember.query(api.members.groupInvitations, { groupId })).resolves.toEqual([]);
    await expect(asGuest.mutation(api.members.declineInvite, { group_id: groupId })).rejects.toThrow(
      'No invitation to decline'
    );

    await expect(asMember.mutation(api.members.addMember, { groupId, userId: guest.userId })).resolves.toMatchObject({
      status: 'invited',
    });
    await expect(membershipOf(t, groupId, guest.userId)).resolves.toMatchObject({ status: 'invited' });
  });

  test('the Group takes an invitation back the way it declines a request', async () => {
    const { groupId, guest, asMember, asGuest, asBystander } = await invitationFixture();
    const { membershipId } = await asMember.mutation(api.members.addMember, { groupId, userId: guest.userId });
    await expect(asBystander.mutation(api.members.rejectRequest, { membershipId })).rejects.toThrow('Not authorized');
    await expect(asMember.mutation(api.members.rejectRequest, { membershipId })).resolves.toMatchObject({
      status: 'removed',
    });
    await expect(asGuest.query(api.members.viewerInvitations, {})).resolves.toEqual([]);
  });

  test('adding someone who already asked approves their request', async () => {
    const { t, groupId, member, guest, asMember, asGuest } = await invitationFixture();
    const pending = await asGuest.mutation(api.members.request, { group_id: groupId });
    expect(pending.status).toBe('pending');
    await expect(asMember.mutation(api.members.addMember, { groupId, userId: guest.userId })).resolves.toMatchObject({
      membershipId: pending._id,
      status: 'active',
    });
    await expect(membershipOf(t, groupId, guest.userId)).resolves.toMatchObject({
      status: 'active',
      approved_by: member.userId,
    });
  });

  test('a requester withdraws their own pending request, and nobody else can', async () => {
    const { t, groupId, guest, asGuest, asBystander, asOwner } = await invitationFixture();
    await asGuest.mutation(api.members.request, { group_id: groupId });
    await expect(asBystander.mutation(api.members.withdrawRequest, { group_id: groupId })).rejects.toThrow(
      'Membership not found'
    );
    await expect(asOwner.mutation(api.members.withdrawRequest, { group_id: groupId })).rejects.toThrow(
      'No pending request to withdraw'
    );
    await expect(asGuest.mutation(api.members.withdrawRequest, { group_id: groupId })).resolves.toMatchObject({
      status: 'removed',
    });
    await expect(membershipOf(t, groupId, guest.userId)).resolves.toMatchObject({ status: 'removed' });
    const page = await t.query(api.groups.detailPage, { slug: 'sietch-tabr' });
    expect(page.roster.map((row) => row.user.slug).sort()).toEqual(['member', 'owner']);
    await expect(asGuest.query(api.groups.viewerMembership, { groupId })).resolves.toBe('none');
  });

  test('an active member leaves and loses the Group as their default; the owner cannot leave', async () => {
    const { t, groupId, member, asMember, asOwner, asGuest } = await invitationFixture();
    await t.run(async (ctx) => ctx.db.patch('profiles', member.profileId, { default_group_id: groupId }));
    await expect(asMember.query(api.profiles.defaultGroupPreference, {})).resolves.toMatchObject({
      default_group_id: groupId,
    });

    await expect(asOwner.mutation(api.members.leave, { group_id: groupId })).rejects.toThrow(
      'The group owner cannot leave the group'
    );
    await expect(asGuest.mutation(api.members.leave, { group_id: groupId })).rejects.toThrow('Membership not found');

    await expect(asMember.mutation(api.members.leave, { group_id: groupId })).resolves.toMatchObject({
      status: 'removed',
    });
    await expect(membershipOf(t, groupId, member.userId)).resolves.toMatchObject({ status: 'removed' });
    await expect(asMember.query(api.groups.viewerMembership, { groupId })).resolves.toBe('none');
    await expect(asMember.query(api.profiles.defaultGroupPreference, {})).resolves.toMatchObject({
      default_group_id: null,
      default_group_options: [],
    });
    /* Having left, they may ask to come back. */
    await expect(asMember.mutation(api.members.request, { group_id: groupId })).resolves.toMatchObject({
      status: 'pending',
    });
  });

  test('the invite picker offers people with no open membership, and only to active members', async () => {
    const { groupId, guest, asMember, asGuest, asBystander } = await invitationFixture();
    const paginationOpts = { cursor: null, numItems: 20 };
    const before = await asMember.query(api.members.inviteCandidates, { groupId, search: '', paginationOpts });
    expect(before.page.map((row) => row.slug).sort()).toEqual(['bystander', 'guest']);

    await asMember.mutation(api.members.addMember, { groupId, userId: guest.userId });
    const afterInvite = await asMember.query(api.members.inviteCandidates, { groupId, search: '', paginationOpts });
    expect(afterInvite.page.map((row) => row.slug)).toEqual(['bystander']);

    await asGuest.mutation(api.members.declineInvite, { group_id: groupId });
    const afterDecline = await asMember.query(api.members.inviteCandidates, { groupId, search: 'gu', paginationOpts });
    expect(afterDecline.page.map((row) => row.slug)).toEqual(['guest']);

    await expect(
      asBystander.query(api.members.inviteCandidates, { groupId, search: '', paginationOpts })
    ).resolves.toMatchObject({ page: [], isDone: true });
  });
});
