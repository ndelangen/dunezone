import { defaultGroupUnavailableRouteNoticeCode } from '../../src/shared/routeNotices';
import type { Doc, Id } from '../_generated/dataModel';
import type { MutationCtx } from '../_generated/server';
import type { QueryCtx } from '../types';
import { liveGroupOrNull, requireAssignableGroup } from './collaborativeAccess';
import { nowIso } from './utils';

type ProfilePreferenceCtx = QueryCtx | MutationCtx;

export type DefaultGroupOption = {
  id: Id<'groups'>;
  name: string;
  slug: string;
};

async function activeMembership(ctx: ProfilePreferenceCtx, userId: Id<'users'>, groupId: Id<'groups'>) {
  return await ctx.db
    .query('group_members')
    .withIndex('by_group_user', (q) => q.eq('group_id', groupId).eq('user_id', userId))
    .unique();
}

export async function loadDefaultGroupPreferenceProjection(
  ctx: ProfilePreferenceCtx,
  profile: Doc<'profiles'>
): Promise<{ default_group_id: Id<'groups'> | null; default_group_options: DefaultGroupOption[] }> {
  const memberships = await ctx.db
    .query('group_members')
    .withIndex('by_user_status', (q) => q.eq('user_id', profile.user_id).eq('status', 'active'))
    .take(500);
  const groups = await Promise.all(memberships.map((membership) => ctx.db.get('groups', membership.group_id)));
  const defaultGroupOptions = groups.flatMap((group) => {
    const live = liveGroupOrNull(group);
    return live ? [{ id: live._id, name: live.name, slug: live.slug }] : [];
  });
  const defaultGroupIds = new Set(defaultGroupOptions.map((group) => group.id));

  return {
    default_group_id:
      profile.default_group_id && defaultGroupIds.has(profile.default_group_id) ? profile.default_group_id : null,
    default_group_options: defaultGroupOptions,
  };
}

export async function canSetDefaultGroup(
  ctx: MutationCtx,
  userId: Id<'users'>,
  groupId: Id<'groups'>
): Promise<boolean> {
  const group = liveGroupOrNull(await ctx.db.get('groups', groupId));
  if (!group) {
    return false;
  }
  return (await activeMembership(ctx, userId, groupId))?.status === 'active';
}

export async function resolveDefaultGroupForCreation(ctx: MutationCtx, userId: Id<'users'>) {
  const profile = await ctx.db
    .query('profiles')
    .withIndex('by_user_id', (q) => q.eq('user_id', userId))
    .unique();
  const groupId = profile?.default_group_id;
  if (!groupId) {
    return { group_id: null, route_notice: null };
  }
  try {
    await requireAssignableGroup(ctx, groupId);
  } catch {
    return { group_id: null, route_notice: defaultGroupUnavailableRouteNoticeCode };
  }
  return { group_id: groupId, route_notice: null };
}

/** Every creation independently authorizes an explicit Group or rechecks the saved default. */
export async function resolveGroupAssignmentForCreation(
  ctx: MutationCtx,
  userId: Id<'users'>,
  explicitGroupId: Id<'groups'> | null | undefined
) {
  if (explicitGroupId === undefined) {
    return await resolveDefaultGroupForCreation(ctx, userId);
  }
  if (explicitGroupId) {
    await requireAssignableGroup(ctx, explicitGroupId);
  }
  return { group_id: explicitGroupId, route_notice: null };
}

export async function clearDefaultGroupForRemovedMembership(
  ctx: MutationCtx,
  userId: Id<'users'>,
  groupId: Id<'groups'>
) {
  const profile = await ctx.db
    .query('profiles')
    .withIndex('by_user_id', (q) => q.eq('user_id', userId))
    .unique();
  if (!profile || profile.default_group_id !== groupId) {
    return;
  }
  await ctx.db.patch(profile._id, {
    default_group_id: null,
    updated_at: nowIso(),
  });
}
