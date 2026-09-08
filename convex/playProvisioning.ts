import { zodToConvex } from 'convex-helpers/server/zod4';
import { v } from 'convex/values';

import {
  PLAY_FIXTURE_KEY,
  PLAY_PROVISION_TIMEOUT_MS,
  playConfirmationSchema,
  playProvisionRequestSchema,
  playProvisioningValidationSchema,
} from '../src/shared/play/admission';
import { internal } from './_generated/api';
import { internalAction, internalQuery } from './_generated/server';
import { internalMutation, mutation } from './functions';
import { authenticatedPlayGame, playCredential } from './lib/playAuthorization';
import { playRateLimiter } from './lib/playRateLimits';
import { postPlayService } from './lib/playService';

/** Operator-only Stage B singleton. Browser users cannot create games. */
export const beginFixtureProvision = internalMutation({
  args: {},
  returns: v.object({ gameId: v.id('play_games'), state: v.union(v.literal('ready'), v.literal('pending')) }),
  handler: async (ctx) => {
    const ready = await ctx.db
      .query('play_games')
      .withIndex('by_fixture_key_state', (q) => q.eq('fixture_key', PLAY_FIXTURE_KEY).eq('state', 'ready'))
      .unique();
    if (ready) {
      return { gameId: ready._id, state: 'ready' as const };
    }
    const pending = await ctx.db
      .query('play_games')
      .withIndex('by_fixture_key_state', (q) => q.eq('fixture_key', PLAY_FIXTURE_KEY).eq('state', 'pending'))
      .unique();
    if (pending && Date.now() < pending.provision_expires_at) {
      return { gameId: pending._id, state: 'pending' as const };
    }
    if (pending) {
      await ctx.db.patch(pending._id, { state: 'expired' });
    }
    const expiresAt = Date.now() + PLAY_PROVISION_TIMEOUT_MS;
    const gameId = await ctx.db.insert('play_games', {
      fixture_key: PLAY_FIXTURE_KEY,
      state: 'pending',
      secret: playCredential(),
      attempt_id: playCredential(),
      provision_expires_at: expiresAt,
      created_at: Date.now(),
    });
    for (const delay of [0, 10_000, 20_000, 40_000]) {
      await ctx.scheduler.runAfter(delay, internal.playProvisioning.requestProvision, { gameId });
    }
    await ctx.scheduler.runAt(expiresAt, internal.playProvisioning.expireProvisioning, { gameId });
    return { gameId, state: 'pending' as const };
  },
});

export const provisioningRequest = internalQuery({
  args: { gameId: v.id('play_games') },
  returns: v.union(
    v.null(),
    v.object({ gameId: v.string(), secret: v.string(), attemptId: v.string(), expiresAt: v.number() })
  ),
  handler: async (ctx, args) => {
    const game = await ctx.db.get(args.gameId);
    return game?.state === 'pending'
      ? { gameId: game._id, secret: game.secret, attemptId: game.attempt_id, expiresAt: game.provision_expires_at }
      : null;
  },
});

export const requestProvision = internalAction({
  args: { gameId: v.id('play_games') },
  returns: v.null(),
  handler: async (ctx, args) => {
    const request = await ctx.runQuery(internal.playProvisioning.provisioningRequest, args);
    if (!request || Date.now() >= request.expiresAt) {
      return null;
    }
    try {
      await postPlayService(request.gameId, 'provision', {
        gameId: request.gameId,
        secret: request.secret,
        attemptId: request.attemptId,
      });
    } catch {
      // Scheduled retries retain the same identity; no credential or request body enters diagnostics.
    }
    return null;
  },
});

export const validateProvisioning = mutation({
  args: zodToConvex(playProvisionRequestSchema),
  returns: zodToConvex(playProvisioningValidationSchema),
  handler: async (ctx, args) => {
    if (!(await playRateLimiter.limit(ctx, 'playProvisionValidation')).ok) {
      return { ok: false as const };
    }
    if (!playProvisionRequestSchema.safeParse(args).success) {
      return { ok: false as const };
    }
    const game = await authenticatedPlayGame(ctx, args.gameId, args.secret);
    if (game?.state !== 'pending' || game.attempt_id !== args.attemptId || Date.now() >= game.provision_expires_at) {
      return { ok: false as const };
    }
    return {
      ok: true as const,
      gameId: game._id,
      attemptId: game.attempt_id,
      fixtureKey: PLAY_FIXTURE_KEY,
      expiresAt: game.provision_expires_at,
    } as const;
  },
});

export const confirmProvisioning = mutation({
  args: zodToConvex(playProvisionRequestSchema),
  returns: zodToConvex(playConfirmationSchema),
  handler: async (ctx, args) => {
    if (!playProvisionRequestSchema.safeParse(args).success) {
      return { ok: false };
    }
    const game = await authenticatedPlayGame(ctx, args.gameId, args.secret);
    if (!game || game.attempt_id !== args.attemptId || game.state === 'expired') {
      return { ok: false };
    }
    if (game.state === 'ready') {
      return { ok: true };
    }
    if (Date.now() >= game.provision_expires_at) {
      return { ok: false };
    }
    await ctx.db.patch(game._id, { state: 'ready', confirmed_at: Date.now() });
    return { ok: true };
  },
});

export const expireProvisioning = internalMutation({
  args: { gameId: v.id('play_games') },
  returns: v.null(),
  handler: async (ctx, args) => {
    const game = await ctx.db.get(args.gameId);
    if (game?.state === 'pending' && Date.now() >= game.provision_expires_at) {
      await ctx.db.patch(game._id, { state: 'expired' });
    }
    return null;
  },
});
