import { getAuthUserId, getAuthSessionId } from '@convex-dev/auth/server';
import { ConvexError } from 'convex/values';

import type { Doc, Id } from '../_generated/dataModel';
import type { MutationCtx, QueryCtx } from '../_generated/server';
import { sessionDeadline } from './authSessionLifecycle';

export const ACCOUNT_STATES = ['active', 'merge_pending', 'deletion_pending', 'deleted', 'banned'] as const;

export type AccountState = (typeof ACCOUNT_STATES)[number];

type AnyCtx = QueryCtx | MutationCtx;

function assertNotBanned(user: Doc<'users'> | null) {
  if (user?.account_state === 'banned') {
    throw new ConvexError('You have been banned');
  }
}

/** A banned identity is refused even if its client still has a signed token. */
export async function requireNotBanned(ctx: AnyCtx) {
  const rawUserId = await getAuthUserId(ctx);
  const userId = rawUserId ? ctx.db.normalizeId('users', rawUserId) : null;
  const user = userId ? await ctx.db.get(userId) : null;
  assertNotBanned(user);
}

export function accountStateOf(row: Pick<Doc<'users'> | Doc<'profiles'>, 'account_state'>): AccountState {
  return row.account_state ?? 'active';
}

export function isActiveProfile(profile: Pick<Doc<'profiles'>, 'account_state'>): boolean {
  return accountStateOf(profile) === 'active';
}

/** A profile with its own public page: active, and not folded into another by a merge. */
export function isPublicProfile(profile: Pick<Doc<'profiles'>, 'account_state' | 'merged_into_profile_id'>): boolean {
  return isActiveProfile(profile) && !profile.merged_into_profile_id;
}

/** Raw identity is reserved for lifecycle diagnostics, including the banned-session envelope. */
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

/** Banned callers are refused; other inactive sessions project as public viewers. */
export async function optionalActiveUserId(ctx: AnyCtx): Promise<Id<'users'> | null> {
  const sessionId = await getAuthSessionId(ctx);
  if (sessionId) {
    const user = await authenticatedLifecycleUser(ctx);
    assertNotBanned(user);
    return user && accountStateOf(user) === 'active' ? user._id : null;
  }
  const userId = await getAuthUserId(ctx);
  const user = userId ? await ctx.db.get(userId) : null;
  assertNotBanned(user);
  return user && accountStateOf(user) === 'active' && user.auth_sessions_revoked_through === undefined
    ? user._id
    : null;
}
