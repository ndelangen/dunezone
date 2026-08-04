import { getAuthUserId } from '@convex-dev/auth/server';

import type { Id } from '../_generated/dataModel';
import type { MutationCtx, QueryCtx } from '../_generated/server';

type AnyCtx = QueryCtx | MutationCtx;

export async function requireAuthUserId(ctx: AnyCtx) {
  const userId = await getAuthUserId(ctx);
  if (!userId) {
    throw new Error('Not authenticated');
  }
  return userId;
}

export async function requireAdminUserId(ctx: AnyCtx) {
  const userId = await requireAuthUserId(ctx);
  const user = await ctx.db.get('users', userId);
  if (!user?.isAdmin) {
    throw new Error('Not authorized');
  }
  return userId;
}

export async function isActiveGroupMember(ctx: AnyCtx, groupId: Id<'groups'>, userId: Id<'users'>) {
  const membership = await ctx.db
    .query('group_members')
    .withIndex('by_group_user', (q) => q.eq('group_id', groupId).eq('user_id', userId))
    .unique();
  return membership?.status === 'active';
}

export async function canAccessRuleset(
  ctx: AnyCtx,
  ruleset: {
    owner_id: Id<'users'>;
    group_id: Id<'groups'> | null;
    is_deleted?: boolean;
  },
  userId: Id<'users'>
) {
  if (ruleset.is_deleted) {
    return false;
  }
  if (ruleset.owner_id === userId) {
    return true;
  }
  if (!ruleset.group_id) {
    return false;
  }
  return await isActiveGroupMember(ctx, ruleset.group_id, userId);
}
