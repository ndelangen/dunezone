import { getAuthSessionId, getAuthUserId } from '@convex-dev/auth/server';

import type { Id } from '../_generated/dataModel';
import type { QueryCtx } from '../_generated/server';
import { accountStateOf } from './accountLifecycle';

const encoder = new TextEncoder();

export function playCredential(): string {
  return Array.from(crypto.getRandomValues(new Uint8Array(32)), (byte) => byte.toString(16).padStart(2, '0')).join('');
}

export async function playCredentialDigest(value: string): Promise<string> {
  const bytes = new Uint8Array(await crypto.subtle.digest('SHA-256', encoder.encode(value)));
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
}

/** Hash both values before a full-width comparison, including the unknown-game path. */
export async function authenticatedPlayGame(ctx: QueryCtx, gameId: string, secret: string) {
  const id = ctx.db.normalizeId('play_games', gameId);
  const game = id ? await ctx.db.get(id) : null;
  const [expected, actual] = await Promise.all([
    playCredentialDigest(game?.secret ?? '0'.repeat(64)),
    playCredentialDigest(secret),
  ]);
  let difference = 0;
  for (let index = 0; index < expected.length; index += 1) {
    difference |= expected.charCodeAt(index) ^ actual.charCodeAt(index);
  }
  return game && difference === 0 ? game : null;
}

/**
 * Auth 0.0.94's newest unused refresh branch bounds inactivity;
 * the session bounds total lifetime.
 * This read does not extend either deadline.
 * Callers enforce the returned deadline against their clock.
 */
export async function playSessionAuthorization(ctx: QueryCtx, userId: Id<'users'>, sessionId: Id<'authSessions'>) {
  const [user, session] = await Promise.all([ctx.db.get(userId), ctx.db.get(sessionId)]);
  if (!user || user.isAnonymous || accountStateOf(user) !== 'active' || session?.userId !== userId) {
    return { allowed: false, authExpiresAt: 0, sessionExpiresAt: 0 };
  }
  const refresh = await ctx.db
    .query('authRefreshTokens')
    .withIndex('by_sessionId_and_firstUsedTime', (q) => q.eq('sessionId', sessionId).eq('firstUsedTime', undefined))
    .order('desc')
    .first();
  return {
    allowed: refresh !== null,
    authExpiresAt: refresh ? Math.min(session.expirationTime, refresh.expirationTime) : 0,
    sessionExpiresAt: session.expirationTime,
  };
}

export async function currentPlaySession(ctx: QueryCtx) {
  const [rawUserId, rawSessionId] = await Promise.all([getAuthUserId(ctx), getAuthSessionId(ctx)]);
  const userId = rawUserId ? ctx.db.normalizeId('users', rawUserId) : null;
  const sessionId = rawSessionId ? ctx.db.normalizeId('authSessions', rawSessionId) : null;
  if (!userId || !sessionId) {
    return null;
  }
  const authorization = await playSessionAuthorization(ctx, userId, sessionId);
  return authorization.allowed ? { userId, sessionId, ...authorization } : null;
}
