import { zodToConvex } from 'convex-helpers/server/zod4';
import { v } from 'convex/values';

import {
  PLAY_FIXTURE_KEY,
  playConfirmationSchema,
  playPendingProvisionSchema,
  playProvisionFailureSchema,
  playProvisionRequestSchema,
  playProvisioningValidationSchema,
} from '../src/shared/play/admission';
import { internal } from './_generated/api';
import type { Doc } from './_generated/dataModel';
import { internalAction, internalQuery } from './_generated/server';
import type { MutationCtx } from './_generated/server';
import { internalMutation, mutation } from './functions';
import { authenticatedPlayRequest } from './lib/playAuthorization';
import { createPendingGame } from './lib/playProvisioningSchedule';
import { playRateLimiter } from './lib/playRateLimits';
import { postPlayService } from './lib/playService';
import { isSyntheticBackend, requireSyntheticBackend } from './lib/playSynthetic';

function syntheticProfile(loadProfile: NonNullable<Doc<'play_games'>['load_profile']>) {
  requireSyntheticBackend();
  return { loadProfile };
}

async function createPendingFixture(ctx: MutationCtx) {
  const gameId = await createPendingGame(ctx, { fixture_key: PLAY_FIXTURE_KEY });
  return { gameId, state: 'pending' as const };
}

/** What the game Worker initializes a real game with: its fixed ruleset and minimum, and the creator who takes the first seat. */
/* What the Worker provisions: the fixture, or a real game's ruleset, count and creator. A row that is neither is refused. */
async function provisionShape(ctx: MutationCtx, game: Doc<'play_games'>) {
  if (game.fixture_key !== undefined) {
    return { fixtureKey: PLAY_FIXTURE_KEY, ...(game.load_profile ? syntheticProfile(game.load_profile) : {}) } as const;
  }
  const { ruleset_id: rulesetId, minimum_players: minimumPlayers, creator_id: creatorId } = game;
  if (rulesetId === undefined || minimumPlayers === undefined || creatorId === undefined) {
    return null;
  }
  const profile = await ctx.db
    .query('profiles')
    .withIndex('by_user_id', (q) => q.eq('user_id', creatorId))
    .unique();
  return {
    game: {
      rulesetId,
      minimumPlayers,
      creator: { userId: creatorId, displayName: profile?.username?.slice(0, 256) || 'Player' },
    },
    /* Only an isolated development backend may retain provisional catalogue content. */
    ...(isSyntheticBackend() ? { provisional: true } : {}),
  } as const;
}

function matchesProvisionAttempt(game: Doc<'play_games'> | null, attemptId: string): game is Doc<'play_games'> {
  return game?.attempt_id === attemptId;
}

async function authenticatedProvisionAttempt(
  ctx: MutationCtx,
  input: ReturnType<typeof playProvisionRequestSchema.parse>
) {
  const request = await authenticatedPlayRequest(ctx, input, playProvisionRequestSchema);
  if (!request || !matchesProvisionAttempt(request.game, request.args.attemptId)) {
    return null;
  }
  return request.game;
}

function isPendingProvision(game: Doc<'play_games'>) {
  return game.state === 'pending' && Date.now() < game.provision_expires_at;
}

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
    return await createPendingFixture(ctx);
  },
});

export const provisioningRequest = internalQuery({
  args: { gameId: v.id('play_games') },
  returns: zodToConvex(playPendingProvisionSchema.nullable()),
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
    if (request && Date.now() < request.expiresAt) {
      try {
        await postPlayService(request.gameId, 'provision', {
          gameId: request.gameId,
          secret: request.secret,
          attemptId: request.attemptId,
        });
      } catch {
        // Scheduled retries retain the same identity; no credential or request body enters diagnostics.
      }
    }
    return null;
  },
});

export const validateProvisioning = mutation({
  args: zodToConvex(playProvisionRequestSchema),
  returns: zodToConvex(playProvisioningValidationSchema),
  handler: async (ctx, args) => {
    const game = await authenticatedProvisionAttempt(ctx, args);
    if (!game || !isPendingProvision(game)) {
      return { ok: false as const };
    }
    if (!(await playRateLimiter.limit(ctx, 'playProvisionValidation', { key: game._id })).ok) {
      return { ok: false as const };
    }
    const shape = await provisionShape(ctx, game);
    if (!shape) {
      return { ok: false as const };
    }
    return {
      ok: true as const,
      gameId: game._id,
      attemptId: game.attempt_id,
      expiresAt: game.provision_expires_at,
      ...shape,
    };
  },
});

export const confirmProvisioning = mutation({
  args: zodToConvex(playProvisionRequestSchema),
  returns: zodToConvex(playConfirmationSchema),
  handler: async (ctx, args) => {
    const game = await authenticatedProvisionAttempt(ctx, args);
    if (!game || game.state === 'expired') {
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

/** A catalogue refusal ends only its authenticated pending attempt and keeps the reason for the game page. */
export const failProvisioning = mutation({
  args: zodToConvex(playProvisionFailureSchema),
  returns: zodToConvex(playConfirmationSchema),
  handler: async (ctx, args) => {
    const parsed = playProvisionFailureSchema.safeParse(args);
    if (!parsed.success) {
      return { ok: false };
    }
    const { reason, ...credentials } = parsed.data;
    const game = await authenticatedProvisionAttempt(ctx, credentials);
    if (!game || !isPendingProvision(game)) {
      return { ok: false };
    }
    await ctx.db.patch(game._id, { state: 'expired', provision_error: reason });
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
