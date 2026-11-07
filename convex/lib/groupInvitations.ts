import type { Infer } from 'convex/values';

import type { Doc, Id } from '../_generated/dataModel';
import type { MutationCtx, QueryCtx } from '../types';
import { accountStateOf, isPublicProfile, optionalActiveUserId } from './accountLifecycle';
import { liveGroupOrNull } from './collaborativeAccess';
import type {
  groupInvitationValidator,
  pickableProfileValidator,
  viewerInvitationValidator,
} from './collaborativeAccessValidators';
import { profileSummaryReader } from './profileSummary';

type AnyCtx = QueryCtx | MutationCtx;

export type GroupInvitation = Infer<typeof groupInvitationValidator>;
export type ViewerInvitation = Infer<typeof viewerInvitationValidator>;
export type PickableProfile = Infer<typeof pickableProfileValidator>;

/** How many open invitations one person or one Group is shown; a list on a page, capped like every other. */
const INVITATION_LIST_LIMIT = 200;

/**
 * A person as a picker offers them: a live account with a public profile, or null.
 * The same test `members.addMember` applies, so a picker never offers someone the mutation would refuse.
 */
export async function pickableProfile(ctx: AnyCtx, profile: Doc<'profiles'>): Promise<PickableProfile | null> {
  if (!isPublicProfile(profile) || !profile.username) {
    return null;
  }
  const user = await ctx.db.get('users', profile.user_id);
  if (!user || accountStateOf(user) !== 'active' || user.merged_into_user_id) {
    return null;
  }
  return {
    profileId: profile._id,
    userId: profile.user_id,
    slug: profile.slug,
    username: profile.username,
    avatarUrl: profile.avatar?.url ?? profile.avatar_url,
  };
}

/** `pickableProfile` by user id, for a candidate found through a membership row rather than a profile row. */
export async function pickableProfileForUser(ctx: AnyCtx, userId: Id<'users'>): Promise<PickableProfile | null> {
  const profile = await ctx.db
    .query('profiles')
    .withIndex('by_user_id', (q) => q.eq('user_id', userId))
    .unique();
  return profile ? await pickableProfile(ctx, profile) : null;
}

/**
 * The invitations waiting on the viewer, newest first: the Groups that asked them in, and who asked.
 * Empty for a signed-out or inactive viewer, with no read;
 * a deleted Group's invitation is not offered, since accepting it would admit the viewer to nothing.
 */
export async function loadViewerInvitations(ctx: QueryCtx): Promise<ViewerInvitation[]> {
  const viewerId = await optionalActiveUserId(ctx);
  if (!viewerId) {
    return [];
  }
  const rows = await ctx.db
    .query('group_members')
    .withIndex('by_user_status', (q) => q.eq('user_id', viewerId).eq('status', 'invited'))
    .order('desc')
    .take(INVITATION_LIST_LIMIT);
  const summaryOf = profileSummaryReader(ctx);
  const invitations: ViewerInvitation[] = [];
  for (const row of rows) {
    const group = liveGroupOrNull(await ctx.db.get('groups', row.group_id));
    if (!group) {
      continue;
    }
    invitations.push({
      membershipId: row._id,
      group: { id: group._id, name: group.name, slug: group.slug },
      invitedBy: row.approved_by ? await summaryOf(row.approved_by) : null,
      invitedAt: row.requested_at,
    });
  }
  return invitations;
}

/**
 * The invitations a Group has open, newest first, for its active members.
 * The caller has already checked the viewer may see them;
 * this reads them, dropping anyone whose profile is no longer public.
 */
export async function loadGroupInvitations(ctx: QueryCtx, group: Doc<'groups'>): Promise<GroupInvitation[]> {
  const rows = await ctx.db
    .query('group_members')
    .withIndex('by_group_status', (q) => q.eq('group_id', group._id).eq('status', 'invited'))
    .order('desc')
    .take(INVITATION_LIST_LIMIT);
  const summaryOf = profileSummaryReader(ctx);
  const invitations: GroupInvitation[] = [];
  for (const row of rows) {
    const user = await summaryOf(row.user_id);
    if (!user) {
      continue;
    }
    invitations.push({
      membershipId: row._id,
      user,
      invitedBy: row.approved_by ? await summaryOf(row.approved_by) : null,
      invitedAt: row.requested_at,
    });
  }
  return invitations;
}
