import { getAuthSessionId } from '@convex-dev/auth/server';
import { ConvexError } from 'convex/values';

import { RECENT_SIGN_IN_REQUIRED } from '../../src/shared/authDestination';
import type { MutationCtx, QueryCtx } from '../_generated/server';
import { optionalActiveUserId } from './accountLifecycle';

type AnyCtx = QueryCtx | MutationCtx;

export async function requireAuthUserId(ctx: AnyCtx) {
  const userId = await optionalActiveUserId(ctx);
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

/** How long after signing in a session may still change sign-in methods or delete the account. */
export const RECENT_SIGN_IN_MS = 10 * 60_000;

/**
 * Refuses unless this session signed in within the last few minutes, so a stolen or forgotten session cannot add a sign-in method, remove one, or delete the account.
 * Refreshing a session keeps its creation time, so only a real sign-in counts.
 * Call it after the caller's own authentication check.
 */
export async function requireRecentSignIn(ctx: MutationCtx) {
  const sessionId = await getAuthSessionId(ctx);
  const session = sessionId ? await ctx.db.get(sessionId) : null;
  if (!session || session._creationTime < Date.now() - RECENT_SIGN_IN_MS) {
    throw new ConvexError(RECENT_SIGN_IN_REQUIRED);
  }
}
