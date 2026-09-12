import { zodToConvex } from 'convex-helpers/server/zod4';
import { v } from 'convex/values';

import { PLAY_FIXTURE_KEY, PLAY_PROVISION_TIMEOUT_MS } from '../src/shared/play/admission';
import { loadProfileSchema } from '../src/shared/play/loadFixture';
import { internal } from './_generated/api';
import type { Id } from './_generated/dataModel';
import type { MutationCtx } from './_generated/server';
import { internalMutation } from './functions';
import { newestUnusedPlayRefresh, playCredential } from './lib/playAuthorization';
import { requireSyntheticBackend } from './lib/playSynthetic';

function requireShortExpiry(expiresInMs: number) {
  const withinTestWindow = expiresInMs >= 0 && expiresInMs <= 30_000;
  if (!Number.isInteger(expiresInMs) || !withinTestWindow) {
    throw new Error('Test expiry must be within thirty seconds');
  }
}

async function syntheticExpiryTarget(ctx: MutationCtx, sessionId: Id<'authSessions'>, kind: 'total' | 'inactivity') {
  const session = await ctx.db.get(sessionId);
  if (!session) {
    throw new Error('Synthetic session not found');
  }
  await requireSyntheticUser(ctx, session.userId);
  if (kind === 'total') {
    return session;
  }
  const refresh = await newestUnusedPlayRefresh(ctx, sessionId);
  if (!refresh) {
    throw new Error('Synthetic refresh token not found');
  }
  return refresh;
}

function isLocalFixtureKey(key: string) {
  return key === PLAY_FIXTURE_KEY || /^synthetic-[a-f0-9]{64}$/.test(key);
}

async function requireSyntheticUser(ctx: MutationCtx, userId: Id<'users'>) {
  const user = await ctx.db.get(userId);
  if (!user?.email?.endsWith('@example.invalid')) {
    throw new Error('Play test controls only accept synthetic accounts');
  }
  return user;
}

/** Real Auth signs the account in; this control changes only the synthetic account's Administrator flag. */
export const setAdministrator = internalMutation({
  args: { userId: v.id('users'), enabled: v.boolean() },
  returns: v.null(),
  handler: async (ctx, args) => {
    requireSyntheticBackend();
    await requireSyntheticUser(ctx, args.userId);
    await ctx.db.patch(args.userId, { isAdmin: args.enabled });
    return null;
  },
});

/** Shrinks a real Auth lifetime for bounded expiry tests; it cannot create or renew a session. */
export const shortenSession = internalMutation({
  args: {
    sessionId: v.id('authSessions'),
    kind: v.union(v.literal('total'), v.literal('inactivity')),
    expiresInMs: v.number(),
  },
  returns: v.object({ expiresAt: v.number() }),
  handler: async (ctx, args) => {
    requireSyntheticBackend();
    requireShortExpiry(args.expiresInMs);
    const target = await syntheticExpiryTarget(ctx, args.sessionId, args.kind);
    const expiresAt = Math.min(target.expirationTime, Date.now() + args.expiresInMs);
    await ctx.db.patch(target._id, { expirationTime: expiresAt });
    return { expiresAt };
  },
});

/** Test-only games use separate directory keys and DO IDs; they never replace the public singleton fixture. */
export const createFixture = internalMutation({
  args: { loadProfile: v.optional(zodToConvex(loadProfileSchema)) },
  returns: v.object({ gameId: v.id('play_games'), secret: v.string(), attemptId: v.string(), expiresAt: v.number() }),
  handler: async (ctx, args) => {
    requireSyntheticBackend();
    const secret = playCredential();
    const attemptId = playCredential();
    const expiresAt = Date.now() + PLAY_PROVISION_TIMEOUT_MS;
    const gameId = await ctx.db.insert('play_games', {
      fixture_key: `synthetic-${playCredential()}`,
      ...(args.loadProfile ? { load_profile: args.loadProfile } : {}),
      state: 'pending',
      secret,
      attempt_id: attemptId,
      provision_expires_at: expiresAt,
      created_at: Date.now(),
    });
    await ctx.scheduler.runAt(expiresAt, internal.playProvisioning.expireProvisioning, { gameId });
    return { gameId, secret, attemptId, expiresAt };
  },
});

/** Retains the old fixture and its game data while allowing a fresh local directory entry. */
export const retireFixture = internalMutation({
  args: { gameId: v.id('play_games') },
  returns: v.null(),
  handler: async (ctx, args) => {
    requireSyntheticBackend();
    const game = await ctx.db.get(args.gameId);
    if (!game || !isLocalFixtureKey(game.fixture_key)) {
      throw new Error('Play test controls only retire a canonical or synthetic fixture');
    }
    if (game.state !== 'expired') {
      await ctx.db.patch(game._id, { state: 'expired' });
    }
    return null;
  },
});
