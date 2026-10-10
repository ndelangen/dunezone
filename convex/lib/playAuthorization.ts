import { getAuthSessionId } from '@convex-dev/auth/server';
import type { z } from 'zod';

import type { playProvisionRequestSchema } from '../../src/shared/play/admission';
import type { Doc, Id } from '../_generated/dataModel';
import type { QueryCtx } from '../_generated/server';
import { canonicalAccount } from './accountIdentity';
import { accountStateOf, optionalActiveUserId } from './accountLifecycle';
import { newestUnusedRefresh } from './authSessionLifecycle';

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
    difference |= expected.codePointAt(index)! ^ actual.codePointAt(index)!;
  }
  return game && difference === 0 ? game : null;
}

type GameCredentials = Pick<ReturnType<typeof playProvisionRequestSchema.parse>, 'gameId' | 'secret'>;

export async function authenticatedPlayRequest<Args extends GameCredentials>(
  ctx: QueryCtx,
  input: unknown,
  schema: z.ZodType<Args>
) {
  const parsed = schema.safeParse(input);
  if (!parsed.success) {
    return null;
  }
  const args = parsed.data;
  const game = await authenticatedPlayGame(ctx, args.gameId, args.secret);
  return game ? { game, args } : null;
}

function isActivePlayer(user: Doc<'users'> | null) {
  if (!user || user.isAnonymous) {
    return false;
  }
  return accountStateOf(user) === 'active';
}

/**
 * The newest unused refresh branch bounds inactivity;
 * the session bounds total lifetime.
 * This read does not extend either deadline.
 * Callers enforce the returned deadline against their clock.
 */
export async function playSessionAuthorization(ctx: QueryCtx, userId: Id<'users'>, sessionId: Id<'authSessions'>) {
  const [user, session] = await Promise.all([canonicalAccount(ctx, userId), ctx.db.get(sessionId)]);
  if (
    !user ||
    !session ||
    !isActivePlayer(user) ||
    session.userId !== user._id ||
    session._creationTime <= (user.auth_sessions_revoked_through ?? -1)
  ) {
    return { allowed: false, authExpiresAt: 0, sessionExpiresAt: 0 };
  }
  const refresh = await newestUnusedRefresh(ctx, sessionId);
  return {
    allowed: refresh !== null,
    authExpiresAt: refresh ? Math.min(session.expirationTime, refresh.expirationTime) : 0,
    sessionExpiresAt: session.expirationTime,
  };
}

/** A real game plays a ruleset; the hosted fixture does not. */
export function isRealGame(game: Pick<Doc<'play_games'>, 'ruleset_id'>) {
  return game.ruleset_id !== undefined;
}

const SYNTHETIC_FIXTURE_KEY = /^synthetic-[a-f0-9]{64}$/;

/** The key `playTesting:createFixture` gives each test game: a fresh credential, so no two share a key. */
export function syntheticFixtureKey() {
  return `synthetic-${playCredential()}`;
}

export function isSyntheticFixtureKey(key: string | undefined) {
  return key !== undefined && SYNTHETIC_FIXTURE_KEY.test(key);
}

/**
 * Whether players may enter a game: a real game, or a test game that `playTesting:createFixture` made on an isolated backend for the load runner or the protocol verifier.
 * The hosted fixture admits nobody (#1323): its game page reads as not found, no ticket is issued or redeemed for it, and the live authorization denies its registrations.
 * Its Worker-authenticated account reconciliation and deletion acknowledgements keep answering, so deletion bookkeeping for its stored room still settles.
 * The rule reads only the row, so every backend answers the same way.
 */
export function admitsPlayers(game: Pick<Doc<'play_games'>, 'ruleset_id' | 'fixture_key'>) {
  return isRealGame(game) || isSyntheticFixtureKey(game.fixture_key);
}

export async function currentPlaySession(ctx: QueryCtx) {
  const [rawUserId, rawSessionId] = await Promise.all([optionalActiveUserId(ctx), getAuthSessionId(ctx)]);
  const userId = rawUserId ? ctx.db.normalizeId('users', rawUserId) : null;
  const sessionId = rawSessionId ? ctx.db.normalizeId('authSessions', rawSessionId) : null;
  if (!userId || !sessionId) {
    return null;
  }
  const authorization = await playSessionAuthorization(ctx, userId, sessionId);
  return authorization.allowed ? { userId, sessionId, ...authorization } : null;
}

/** The session a Play mutation may act for: refused past its idle or total deadline, which only a mutation may read the clock for. */
export async function livePlaySession(ctx: QueryCtx) {
  const session = await currentPlaySession(ctx);
  return session && Date.now() < session.authExpiresAt ? session : null;
}
