import { paginationOptsValidator, paginationResultValidator } from 'convex/server';
import { v } from 'convex/values';

import type { Doc, Id } from './_generated/dataModel';
import type { MutationCtx } from './_generated/server';
import { mutation, viewerQuery } from './functions';
import { optionalActiveUserId } from './lib/accountLifecycle';
import { liveGroupOrNull, requireGroupCapability, requireMembershipRequest } from './lib/collaborativeAccess';
import {
  groupInvitationValidator,
  groupMemberValidator,
  membershipCommandAcknowledgementValidator,
  pickableProfileValidator,
  viewerInvitationValidator,
} from './lib/collaborativeAccessValidators';
import { clearDefaultGroupForRemovedMembership } from './lib/defaultGroupPreference';
import {
  loadGroupInvitations,
  loadViewerInvitations,
  pickableProfile,
  pickableProfileForUser,
} from './lib/groupInvitations';
import { requireAuthUserId } from './lib/policy';
import { nowIso, slugify } from './lib/utils';

function commandAcknowledgement(membership: Awaited<ReturnType<typeof requireMembership>>) {
  return { membershipId: membership._id, status: membership.status };
}

async function getMembership(ctx: MutationCtx, groupId: Id<'groups'>, userId: Id<'users'>) {
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

/** The viewer's own row for a live Group, for the commands only the person themself may run. The message stays vague on purpose. */
async function requireOwnMembership(ctx: MutationCtx, groupId: Id<'groups'>) {
  const viewerId = await requireAuthUserId(ctx);
  const group = liveGroupOrNull(await ctx.db.get('groups', groupId));
  if (!group) {
    throw new Error('Group not found');
  }
  const membership = await getMembership(ctx, groupId, viewerId);
  if (!membership) {
    throw new Error('Membership not found');
  }
  return { group, membership };
}

async function approveRequestHandler(ctx: MutationCtx, membershipId: Id<'group_members'>) {
  await requireAuthUserId(ctx);
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
  await requireAuthUserId(ctx);
  const membership = await requireMembership(ctx, membershipId);
  await requireGroupCapability(ctx, membership.group_id, 'addMember');
  return await rejectMembership(ctx, membership);
}

/** Declines a request, or takes back an invitation the Group sent: both are the Group's side of an unsettled membership. */
async function rejectMembership(ctx: MutationCtx, membership: Awaited<ReturnType<typeof requireMembership>>) {
  if (membership.status !== 'pending' && membership.status !== 'invited') {
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
  await requireAuthUserId(ctx);
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
  await clearDefaultGroupForRemovedMembership(ctx, membership.user_id, membership.group_id);
  return await requireMembership(ctx, membership._id);
}

/** The person agrees: the row becomes active, keeping the inviter as the one who approved it from the Group's side. */
async function activateInvitation(ctx: MutationCtx, membership: Doc<'group_members'>) {
  await ctx.db.patch(membership._id, { status: 'active', approved_at: nowIso() });
  return await requireMembership(ctx, membership._id);
}

/**
 * Adding someone sends them an invitation;
 * nobody joins a Group without agreeing to (Norbert, 2026-11-07).
 * The one exception is a person who already asked: their pending request is approved, since both sides have then agreed.
 */
async function addMemberHandler(ctx: MutationCtx, args: { groupId: Id<'groups'>; userId: Id<'users'> }) {
  const actorId = await requireAuthUserId(ctx);
  await requireGroupCapability(ctx, args.groupId, 'addMember');
  /* The id is caller-supplied: a roster row for an account with no public profile would break the Group page for every viewer. */
  if (!(await pickableProfileForUser(ctx, args.userId))) {
    throw new Error('User not found');
  }

  const existing = await getMembership(ctx, args.groupId, args.userId);
  if (existing) {
    if (existing.status === 'pending') {
      return await approveMembership(ctx, existing, actorId);
    }
    if (existing.status === 'active' || existing.status === 'invited') {
      return existing;
    }
    await ctx.db.patch(existing._id, {
      status: 'invited',
      requested_at: nowIso(),
      approved_by: actorId,
      approved_at: null,
    });
    return await requireMembership(ctx, existing._id);
  }

  const membershipId = await ctx.db.insert('group_members', {
    group_id: args.groupId,
    user_id: args.userId,
    status: 'invited',
    requested_at: nowIso(),
    approved_by: actorId,
    approved_at: null,
  });
  return await requireMembership(ctx, membershipId);
}

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
      /* Asking to join a Group that already asked for you is the other half of the same agreement. */
      if (existing.status === 'invited') {
        return await activateInvitation(ctx, existing);
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

/** The viewer takes back their own pending request. */
export const withdrawRequest = mutation({
  args: { group_id: v.id('groups') },
  returns: membershipCommandAcknowledgementValidator,
  handler: async (ctx, args) => {
    const { membership } = await requireOwnMembership(ctx, args.group_id);
    if (membership.status !== 'pending') {
      throw new Error('No pending request to withdraw');
    }
    await ctx.db.patch(membership._id, { status: 'removed', approved_by: null, approved_at: null });
    return commandAcknowledgement(await requireMembership(ctx, membership._id));
  },
});

/** The invited person agrees to join. */
export const acceptInvite = mutation({
  args: { group_id: v.id('groups') },
  returns: membershipCommandAcknowledgementValidator,
  handler: async (ctx, args) => {
    const { membership } = await requireOwnMembership(ctx, args.group_id);
    if (membership.status !== 'invited') {
      throw new Error('No invitation to accept');
    }
    return commandAcknowledgement(await activateInvitation(ctx, membership));
  },
});

/** The invited person declines; the Group may invite them again later. */
export const declineInvite = mutation({
  args: { group_id: v.id('groups') },
  returns: membershipCommandAcknowledgementValidator,
  handler: async (ctx, args) => {
    const { membership } = await requireOwnMembership(ctx, args.group_id);
    if (membership.status !== 'invited') {
      throw new Error('No invitation to decline');
    }
    await ctx.db.patch(membership._id, { status: 'removed', approved_by: null, approved_at: null });
    return commandAcknowledgement(await requireMembership(ctx, membership._id));
  },
});

/** An active member leaves on their own. The owner cannot: a Group always has its owner, and ownership moves only through account deletion. */
export const leave = mutation({
  args: { group_id: v.id('groups') },
  returns: membershipCommandAcknowledgementValidator,
  handler: async (ctx, args) => {
    const { group, membership } = await requireOwnMembership(ctx, args.group_id);
    if (membership.status !== 'active') {
      throw new Error('Not a member of this group');
    }
    if (membership.user_id === group.created_by) {
      throw new Error('The group owner cannot leave the group');
    }
    await ctx.db.patch(membership._id, { status: 'removed', approved_by: null, approved_at: null });
    await clearDefaultGroupForRemovedMembership(ctx, membership.user_id, membership.group_id);
    return commandAcknowledgement(await requireMembership(ctx, membership._id));
  },
});

export const approveRequest = mutation({
  args: { membershipId: v.id('group_members') },
  returns: membershipCommandAcknowledgementValidator,
  handler: async (ctx, args) => commandAcknowledgement(await approveRequestHandler(ctx, args.membershipId)),
});

export const rejectRequest = mutation({
  args: { membershipId: v.id('group_members') },
  returns: membershipCommandAcknowledgementValidator,
  handler: async (ctx, args) => commandAcknowledgement(await rejectRequestHandler(ctx, args.membershipId)),
});

export const removeMember = mutation({
  args: { membershipId: v.id('group_members') },
  returns: membershipCommandAcknowledgementValidator,
  handler: async (ctx, args) => commandAcknowledgement(await removeMemberHandler(ctx, args.membershipId)),
});

export const addMember = mutation({
  args: {
    groupId: v.id('groups'),
    userId: v.id('users'),
  },
  returns: membershipCommandAcknowledgementValidator,
  handler: async (ctx, args) => commandAcknowledgement(await addMemberHandler(ctx, args)),
});

/** The invitations waiting on the viewer: their own, so their profile page and each Group page can offer to accept or decline. */
export const viewerInvitations = viewerQuery({
  args: {},
  returns: v.array(viewerInvitationValidator),
  handler: async (ctx) => await loadViewerInvitations(ctx),
});

/** The invitations a Group has open. Only its active members see them; everyone else gets an empty list, since the invited have not agreed to be named with the Group. */
export const groupInvitations = viewerQuery({
  args: { groupId: v.id('groups') },
  returns: v.array(groupInvitationValidator),
  handler: async (ctx, args) => {
    const viewerId = await optionalActiveUserId(ctx);
    const group = liveGroupOrNull(await ctx.db.get('groups', args.groupId));
    if (!viewerId || !group) {
      return [];
    }
    const membership = await ctx.db
      .query('group_members')
      .withIndex('by_group_user', (q) => q.eq('group_id', group._id).eq('user_id', viewerId))
      .unique();
    if (membership?.status !== 'active') {
      return [];
    }
    return await loadGroupInvitations(ctx, group);
  },
});

/**
 * The people an active member may invite, by slug prefix, paged: public profiles with no open membership of the Group.
 * Someone removed earlier, or who declined, may be invited again.
 * The picker mounts this lazily, so a Group page never reads the profile table on its own account.
 */
export const inviteCandidates = viewerQuery({
  args: { groupId: v.id('groups'), search: v.string(), paginationOpts: paginationOptsValidator },
  returns: paginationResultValidator(pickableProfileValidator),
  handler: async (ctx, args) => {
    const viewerId = await optionalActiveUserId(ctx);
    const group = liveGroupOrNull(await ctx.db.get('groups', args.groupId));
    const membership =
      viewerId && group
        ? await ctx.db
            .query('group_members')
            .withIndex('by_group_user', (q) => q.eq('group_id', group._id).eq('user_id', viewerId))
            .unique()
        : null;
    if (!group || membership?.status !== 'active') {
      return { page: [], isDone: true, continueCursor: '' };
    }
    const searchSlug = slugify(args.search);
    const result = searchSlug
      ? await ctx.db
          .query('profiles')
          .withIndex('by_slug', (q) => q.gte('slug', searchSlug).lt('slug', `${searchSlug}￿`))
          .paginate(args.paginationOpts)
      : await ctx.db
          .query('profiles')
          .withIndex('by_account_state_username', (q) => q.eq('account_state', 'active'))
          .paginate(args.paginationOpts);
    const page = [];
    for (const profile of result.page) {
      const candidate = await pickableProfile(ctx, profile);
      if (!candidate) {
        continue;
      }
      const existing = await ctx.db
        .query('group_members')
        .withIndex('by_group_user', (q) => q.eq('group_id', group._id).eq('user_id', candidate.userId))
        .unique();
      if (existing && existing.status !== 'removed') {
        continue;
      }
      page.push(candidate);
    }
    return { ...result, page };
  },
});
