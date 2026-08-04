import { v } from 'convex/values';

import type { Id } from './_generated/dataModel';
import { mutation, query } from './_generated/server';
import type { MutationCtx, QueryCtx } from './_generated/server';
import { listByUserActiveWithGroupsData } from './lib/memberGroups';
import { isActiveGroupMember, requireAuthUserId } from './lib/policy';
import { nowIso } from './lib/utils';

const statusValidator = v.union(v.literal('pending'), v.literal('active'), v.literal('removed'));

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

async function loadGroup(ctx: QueryCtx | MutationCtx, groupId: Id<'groups'>) {
  return await ctx.db.get(groupId);
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
  handler: async (ctx, args) => {
    const userId = await requireAuthUserId(ctx);
    const group = await loadGroup(ctx, args.group_id);
    if (!group) {
      throw new Error('Group not found');
    }

    const existing = await getMembership(ctx, args.group_id, userId);
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

export const approve = mutation({
  args: {
    group_id: v.id('groups'),
    user_id: v.id('users'),
  },
  handler: async (ctx, args) => {
    const actorId = await requireAuthUserId(ctx);
    const canManage = await isActiveGroupMember(ctx, args.group_id, actorId);
    if (!canManage) {
      throw new Error('Not authorized');
    }

    const row = await getMembership(ctx, args.group_id, args.user_id);
    if (!row) {
      throw new Error('Failed to approve group member');
    }
    if (row.status !== 'pending') {
      throw new Error('Membership is not pending approval');
    }
    await ctx.db.patch(row._id, {
      status: 'active',
      approved_by: actorId,
      approved_at: nowIso(),
    });
    const updated = await ctx.db.get(row._id);
    if (!updated) {
      throw new Error('Failed to approve group member');
    }
    return updated;
  },
});

export const reject = mutation({
  args: {
    group_id: v.id('groups'),
    user_id: v.id('users'),
  },
  handler: async (ctx, args) => {
    const actorId = await requireAuthUserId(ctx);
    const canManage = await isActiveGroupMember(ctx, args.group_id, actorId);
    if (!canManage) {
      throw new Error('Not authorized');
    }

    const row = await getMembership(ctx, args.group_id, args.user_id);
    if (!row) {
      throw new Error('Failed to reject group member');
    }
    if (row.status !== 'pending') {
      throw new Error('Membership is not pending approval');
    }
    await ctx.db.patch(row._id, {
      status: 'removed',
      approved_by: null,
      approved_at: null,
    });
    const updated = await ctx.db.get(row._id);
    if (!updated) {
      throw new Error('Failed to reject group member');
    }
    return updated;
  },
});

export const remove = mutation({
  args: {
    group_id: v.id('groups'),
    user_id: v.id('users'),
  },
  handler: async (ctx, args) => {
    const actorId = await requireAuthUserId(ctx);
    const group = await loadGroup(ctx, args.group_id);
    if (!group) {
      throw new Error('Group not found');
    }
    if (group.created_by !== actorId) {
      throw new Error('Not authorized');
    }
    if (args.user_id === group.created_by) {
      throw new Error('Cannot remove the group owner');
    }

    const row = await getMembership(ctx, args.group_id, args.user_id);
    if (!row) {
      throw new Error('Failed to remove group member');
    }
    if (row.status !== 'active') {
      throw new Error('Can only remove active members');
    }
    await ctx.db.patch(row._id, {
      status: 'removed',
      approved_by: null,
      approved_at: null,
    });
    return { groupId: args.group_id, userId: args.user_id };
  },
});

export const add = mutation({
  args: {
    group_id: v.id('groups'),
    user_id: v.id('users'),
  },
  handler: async (ctx, args) => {
    const actorId = await requireAuthUserId(ctx);
    const canManage = await isActiveGroupMember(ctx, args.group_id, actorId);
    if (!canManage) {
      throw new Error('Not authorized');
    }

    const existing = await getMembership(ctx, args.group_id, args.user_id);
    if (existing) {
      await ctx.db.patch(existing._id, {
        status: 'active',
        approved_by: actorId,
        approved_at: nowIso(),
      });
      const updated = await ctx.db.get(existing._id);
      if (!updated) {
        throw new Error('Failed to add group member');
      }
      return updated;
    }

    const _id = await ctx.db.insert('group_members', {
      group_id: args.group_id,
      user_id: args.user_id,
      status: 'active',
      requested_at: nowIso(),
      approved_by: actorId,
      approved_at: nowIso(),
    });
    const created = await ctx.db.get(_id);
    if (!created) {
      throw new Error('Failed to add group member');
    }
    return created;
  },
});
