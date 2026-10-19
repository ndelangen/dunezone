import type { Id } from '../_generated/dataModel';
import type { MutationCtx, QueryCtx } from '../types';
import { isActiveProfile } from './accountLifecycle';
import { memoised } from './memoised';

/** Public profile chip shape for FAQ and group member lists. */
export async function profileSummary(ctx: QueryCtx | MutationCtx, userId: Id<'users'>) {
  const profile = await ctx.db
    .query('profiles')
    .withIndex('by_user_id', (q) => q.eq('user_id', userId))
    .unique();
  if (!profile || !isActiveProfile(profile)) {
    return null;
  }
  return {
    id: profile._id,
    slug: profile.slug,
    username: profile.username ?? null,
    /* The stored rendition when it exists, the external URL until its rehost callback lands. */
    avatar_url: profile.avatar?.url ?? profile.avatar_url ?? null,
  };
}

/** `profileSummary` that reads each profile once across one request's lists, where the same person recurs. */
export function profileSummaryReader(ctx: QueryCtx | MutationCtx) {
  return memoised((userId: Id<'users'>) => profileSummary(ctx, userId));
}
