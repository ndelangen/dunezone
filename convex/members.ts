import { v } from 'convex/values';

import type { Id } from './_generated/dataModel';
import { query } from './_generated/server';
import type { MutationCtx, QueryCtx } from './_generated/server';
import { mutation } from './functions';
import {
  requireGroupCapability,
  requireLegacyGroupOwner,
  requireLegacyMembershipManager,
  requireMembershipRequest,
} from './lib/collaborativeAccess';
import {
  groupMemberValidator,
  membershipCommandAcknowledgementValidator,
} from './lib/collaborativeAccessValidators';
import { listByUserActiveWithGroupsData } from './lib/memberGroups';
import { requireAuthUserId } from './lib/policy';
import { nowIso } from './lib/utils';

const statusValidator = v.union(v.literal('pending'), v.literal('active'), v.literal('removed'));

function commandAcknowledgement(membership: Awaited<ReturnType<typeof requireMembership>>) {
  return { membershipId: membership._id, status: membership.status };
}

async function getMembership(
  ctx: QueryCtx | MutationCtx,
  groupId: Id<'groups'>,
  userId: Id<'users'>
) {
  return await ctx.db
    .query('group_members')
    .withIndex('by_group_user', (q) => q.eq('group_id', groupId).eq('user_id', userId))
    .unique();
}

async function requireMembership(ctx: MutationCtx, membershipId: Id<'group_members'>) {
  const membership = await ctx.db.get('group_members', membershipId);
  if (!membership) {
    throw new Error('Group member not found');
  }
  return membership;
}

async function approveRequestHandler(ctx: MutationCtx, membershipId: Id<'group_members'>) {
  const membership = await requireMembership(ctx, membershipId);
  const access = await requireGroupCapability(ctx, membership.group_id, 'addMember');
  return await approveMembership(ctx, membership, access.viewerId as Id<'users'>);
}

async function approveMembership(
  ctx: MutationCtx,
  membership: Awaited<ReturnType<typeof requireMembership>>,
  actorId: Id<'users'>
) {
  if (membership.status !== 'pending') {
    throw new Error('Membership is not pending approval');
  }
  await ctx.db.patch(membership._id, {
    status: 'active',
    approved_by: actorId,
    approved_at: nowIso(),
  });
  return await requireMembership(ctx, membership._id);
}

async function rejectRequestHandler(ctx: MutationCtx, membershipId: Id<'group_members'>) {
  const membership = await requireMembership(ctx, membershipId);
  await requireGroupCapability(ctx, membership.group_id, 'addMember');
  return await rejectMembership(ctx, membership);
}

async function rejectMembership(
  ctx: MutationCtx,
  membership: Awaited<ReturnType<typeof requireMembership>>
) {
  if (membership.status !== 'pending') {
    throw new Error('Membership is not pending approval');
  }
  await ctx.db.patch(membership._id, {
    status: 'removed',
    approved_by: null,
    approved_at: null,
  });
  return await requireMembership(ctx, membership._id);
}

async function removeMemberHandler(ctx: MutationCtx, membershipId: Id<'group_members'>) {
  const membership = await requireMembership(ctx, membershipId);
  const access = await requireGroupCapability(ctx, membership.group_id, 'delete');
  return await removeMembership(ctx, membership, access.subject.created_by);
}

async function removeMembership(
  ctx: MutationCtx,
  membership: Awaited<ReturnType<typeof requireMembership>>,
  ownerId: Id<'users'>
) {
  if (membership.user_id === ownerId) {
    throw new Error('Cannot remove the group owner');
  }
  if (membership.status !== 'active') {
    throw new Error('Can only remove active members');
  }
  await ctx.db.patch(membership._id, {
    status: 'removed',
    approved_by: null,
    approved_at: null,
  });
  return await requireMembership(ctx, membership._id);
}

async function addMemberHandler(
  ctx: MutationCtx,
  args: { groupId: Id<'groups'>; userId: Id<'users'> }
) {
  const actorId = await requireAuthUserId(ctx);
  await requireGroupCapability(ctx, args.groupId, 'addMember');

  const existing = await getMembership(ctx, args.groupId, args.userId);
  if (existing) {
    await ctx.db.patch(existing._id, {
      status: 'active',
      approved_by: actorId,
      approved_at: nowIso(),
    });
    return await requireMembership(ctx, existing._id);
  }

  const membershipId = await ctx.db.insert('group_members', {
    group_id: args.groupId,
    user_id: args.userId,
    status: 'active',
    requested_at: nowIso(),
    approved_by: actorId,
    approved_at: nowIso(),
  });
  return await requireMembership(ctx, membershipId);
}

export const listByUserActiveWithGroups = query({
  args: { user_id: v.id('users') },
  handler: async (ctx, args) => listByUserActiveWithGroupsData(ctx, args.user_id),
});

export const listByGroup = query({
  args: { group_id: v.id('groups') },
  handler: async (ctx, args) => {
    return await ctx.db
      .query('group_members')
      .withIndex('by_group', (q) => q.eq('group_id', args.group_id))
      .take(500);
  },
});

export const listByGroupAndStatus = query({
  args: { group_id: v.id('groups'), status: statusValidator },
  handler: async (ctx, args) => {
    return await ctx.db
      .query('group_members')
      .withIndex('by_group_status', (q) =>
        q.eq('group_id', args.group_id).eq('status', args.status)
      )
      .take(500);
  },
});

export const get = query({
  args: { group_id: v.id('groups'), user_id: v.id('users') },
  handler: async (ctx, args) => {
    const row = await getMembership(ctx, args.group_id, args.user_id);
    if (!row) {
      throw new Error('Group member not found');
    }
    return row;
  },
});

export const request = mutation({
  args: { group_id: v.id('groups') },
  returns: groupMemberValidator,
  handler: async (ctx, args) => {
    const access = await requireMembershipRequest(ctx, args.group_id);
    const userId = access.viewerId as Id<'users'>;
    const existing = access.viewerMembership;
    if (existing) {
      if (existing.status === 'pending' || existing.status === 'active') {
        return existing;
      }
      await ctx.db.patch(existing._id, {
        status: 'pending',
        approved_at: null,
        approved_by: null,
      });
      const updated = await ctx.db.get(existing._id);
      if (!updated) {
        throw new Error('Failed to update membership');
      }
      return updated;
    }

    const _id = await ctx.db.insert('group_members', {
      group_id: args.group_id,
      user_id: userId,
      status: 'pending',
      requested_at: nowIso(),
      approved_at: null,
      approved_by: null,
    });
    const created = await ctx.db.get(_id);
    if (!created) {
      throw new Error('Failed to request group membership');
    }
    return created;
  },
});

export const approveRequest = mutation({
  args: { membershipId: v.id('group_members') },
  returns: membershipCommandAcknowledgementValidator,
  handler: async (ctx, args) =>
    commandAcknowledgement(await approveRequestHandler(ctx, args.membershipId)),
});

export const approve = mutation({
  args: {
    group_id: v.id('groups'),
    user_id: v.id('users'),
  },
  returns: groupMemberValidator,
  handler: async (ctx, args) => {
    const access = await requireLegacyMembershipManager(ctx, args.group_id);
    const row = await getMembership(ctx, args.group_id, args.user_id);
    if (!row) {
      throw new Error('Failed to approve group member');
    }
    return await approveMembership(ctx, row, access.viewerId as Id<'users'>);
  },
});

export const rejectRequest = mutation({
  args: { membershipId: v.id('group_members') },
  returns: membershipCommandAcknowledgementValidator,
  handler: async (ctx, args) =>
    commandAcknowledgement(await rejectRequestHandler(ctx, args.membershipId)),
});

export const reject = mutation({
  args: {
    group_id: v.id('groups'),
    user_id: v.id('users'),
  },
  returns: groupMemberValidator,
  handler: async (ctx, args) => {
    await requireLegacyMembershipManager(ctx, args.group_id);
    const row = await getMembership(ctx, args.group_id, args.user_id);
    if (!row) {
      throw new Error('Failed to reject group member');
    }
    return await rejectMembership(ctx, row);
  },
});

export const removeMember = mutation({
  args: { membershipId: v.id('group_members') },
  returns: membershipCommandAcknowledgementValidator,
  handler: async (ctx, args) =>
    commandAcknowledgement(await removeMemberHandler(ctx, args.membershipId)),
});

export const remove = mutation({
  args: {
    group_id: v.id('groups'),
    user_id: v.id('users'),
  },
  returns: v.object({ groupId: v.id('groups'), userId: v.id('users') }),
  handler: async (ctx, args) => {
    const access = await requireLegacyGroupOwner(ctx, args.group_id);
    const row = await getMembership(ctx, args.group_id, args.user_id);
    if (!row) {
      throw new Error('Failed to remove group member');
    }
    await removeMembership(ctx, row, access.subject.created_by);
    return { groupId: args.group_id, userId: args.user_id };
  },
});

export const addMember = mutation({
  args: {
    groupId: v.id('groups'),
    userId: v.id('users'),
  },
  returns: membershipCommandAcknowledgementValidator,
  handler: async (ctx, args) => commandAcknowledgement(await addMemberHandler(ctx, args)),
});

export const add = mutation({
  args: {
    group_id: v.id('groups'),
    user_id: v.id('users'),
  },
  returns: groupMemberValidator,
  handler: async (ctx, args) =>
    await addMemberHandler(ctx, { groupId: args.group_id, userId: args.user_id }),
});
