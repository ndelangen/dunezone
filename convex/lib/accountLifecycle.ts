import { getAuthUserId, getAuthSessionId } from '@convex-dev/auth/server';

import type { Doc, Id } from '../_generated/dataModel';
import type { MutationCtx, QueryCtx } from '../_generated/server';
import { sessionDeadline } from './authSessionLifecycle';

export const ACCOUNT_STATES = ['active', 'merge_pending', 'deletion_pending', 'deleted'] as const;

export type AccountState = (typeof ACCOUNT_STATES)[number];

type AnyCtx = QueryCtx | MutationCtx;

export function accountStateOf(row: Pick<Doc<'users'> | Doc<'profiles'>, 'account_state'>): AccountState {
  return row.account_state ?? 'active';
}

export function isActiveProfile(profile: Pick<Doc<'profiles'>, 'account_state'>): boolean {
  return accountStateOf(profile) === 'active';
}

/** Raw identity is reserved for lifecycle diagnostics that pending/deleted sessions must still observe. */
export async function lifecycleUserId(ctx: AnyCtx): Promise<Id<'users'> | null> {
  return await getAuthUserId(ctx);
}

/** Pending account operations may retry only while their stored session remains valid. */
export async function authenticatedLifecycleUser(ctx: AnyCtx): Promise<Doc<'users'> | null> {
  const userId = await getAuthUserId(ctx);
  const sessionId = await getAuthSessionId(ctx);
  if (!userId || !sessionId) {
    return null;
  }
  const [user, session] = await Promise.all([ctx.db.get(userId), ctx.db.get(sessionId)]);
  if (!user || session?.userId !== userId || session._creationTime <= (user.auth_sessions_revoked_through ?? -1)) {
    return null;
  }
  /* Mutations enforce the clock; queries observe the scheduled session removal. */
  if ('scheduler' in ctx && (await sessionDeadline(ctx, session)) <= Date.now()) {
    return null;
  }
  return user;
}

/** Anonymous and inactive sessions both project as public viewers. */
export async function optionalActiveUserId(ctx: AnyCtx): Promise<Id<'users'> | null> {
  const sessionId = await getAuthSessionId(ctx);
  if (sessionId) {
    const user = await authenticatedLifecycleUser(ctx);
    return user && accountStateOf(user) === 'active' ? user._id : null;
  }
  const userId = await getAuthUserId(ctx);
  const user = userId ? await ctx.db.get(userId) : null;
  return user && accountStateOf(user) === 'active' && user.auth_sessions_revoked_through === undefined
    ? user._id
    : null;
}
