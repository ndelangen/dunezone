import { zodToConvex } from 'convex-helpers/server/zod4';
import { v } from 'convex/values';

import {
  playCreateGameRequestSchema,
  playCreateGameResultSchema,
  playGameAccessSchema,
} from '../src/shared/play/admission';
import type { Doc, Id } from './_generated/dataModel';
import { query } from './_generated/server';
import type { QueryCtx } from './_generated/server';
import { mutation } from './functions';
import { currentPlaySession, isAdministrator, isRealGame, mayEnterGame } from './lib/playAuthorization';
import { createPendingGame } from './lib/playProvisioningSchedule';
import { listRulesetAssetSlots } from './lib/rulesetSlots';

/*
 * Real games: Administrator-only creation and access until the public-release decision changes
 * that.
 * Convex holds the directory record and its credentials; the game Worker owns everything the game
 * does from provisioning on.
 */

const DECK_CARD = 'deck-card';

/** Whether a deck has at least one member; the full readiness check is the game Worker's capture at provisioning. */
async function deckHasMembers(ctx: QueryCtx, assetId: Id<'assets'>) {
  const relation = await ctx.db
    .query('asset_relations')
    .withIndex('by_from_kind', (q) => q.eq('from_asset_id', assetId).eq('kind', DECK_CARD))
    .first();
  return relation !== null;
}

/**
 * Why a ruleset cannot start a game yet, from what the directory can see: both required decks must be slotted and hold at least one card.
 * Null when nothing here objects;
 * the Worker's capture still decides completeness.
 */
async function rulesetObjection(ctx: QueryCtx, rulesetId: Id<'rulesets'>) {
  const slots = await listRulesetAssetSlots(ctx, rulesetId);
  for (const [slot, label] of [
    ['treachery', 'treachery deck'],
    ['spice', 'spice deck'],
  ] as const) {
    const deck = slots.find((entry) => entry.slot === slot);
    if (!deck) {
      return `No ${label} is linked.`;
    }
    if (!(await deckHasMembers(ctx, deck.asset.id))) {
      return `The ${label} is empty.`;
    }
  }
  return null;
}

const RULESET_CHOICE_LIMIT = 200;

const accessValidator = v.union(v.literal('unauthenticated'), v.literal('not_authorized'), v.literal('admin'));

async function creationAccess(ctx: QueryCtx) {
  const session = await currentPlaySession(ctx);
  if (!session) {
    return 'unauthenticated' as const;
  }
  return (await isAdministrator(ctx, session.userId)) ? ('admin' as const) : ('not_authorized' as const);
}

/** Whether the viewer may create a game: two reads, for a page that only decides whether to offer the link. */
export const access = query({
  args: {},
  returns: accessValidator,
  handler: creationAccess,
});

/** The rulesets an Administrator may start a game with, each with the directory's objection when it has one. */
export const creatable = query({
  args: {},
  returns: v.union(
    v.object({ access: v.literal('unauthenticated') }),
    v.object({ access: v.literal('not_authorized') }),
    v.object({
      access: v.literal('admin'),
      rulesets: v.array(
        v.object({
          id: v.id('rulesets'),
          slug: v.string(),
          name: v.string(),
          objection: v.union(v.string(), v.null()),
        })
      ),
    })
  ),
  handler: async (ctx) => {
    const access = await creationAccess(ctx);
    if (access !== 'admin') {
      return { access };
    }
    const rows = await ctx.db
      .query('rulesets')
      .withIndex('by_deleted_name', (q) => q.eq('is_deleted', false))
      .take(RULESET_CHOICE_LIMIT);
    const rulesets = [];
    for (const row of rows) {
      rulesets.push({ id: row._id, slug: row.slug, name: row.name, objection: await rulesetObjection(ctx, row._id) });
    }
    return { access: 'admin' as const, rulesets };
  },
});

/**
 * Creates a real game: a pending directory record with its fixed ruleset, minimum count and creator, and the provisioning requests that ask the game Worker to initialize it.
 * The creator takes the first seat when the Worker initializes;
 * nothing here grants them more.
 */
export const createGame = mutation({
  args: zodToConvex(playCreateGameRequestSchema),
  returns: zodToConvex(playCreateGameResultSchema),
  handler: async (ctx, args) => {
    const session = await currentPlaySession(ctx);
    if (!session || !(await isAdministrator(ctx, session.userId))) {
      return { ok: false as const, reason: 'not_authorized' as const };
    }
    const rulesetId = ctx.db.normalizeId('rulesets', args.rulesetId);
    const ruleset = rulesetId ? await ctx.db.get('rulesets', rulesetId) : null;
    if (!ruleset || ruleset.is_deleted || (await rulesetObjection(ctx, ruleset._id)) !== null) {
      return { ok: false as const, reason: 'unavailable' as const };
    }
    const gameId = await createPendingGame(ctx, {
      ruleset_id: ruleset._id,
      minimum_players: args.minimumPlayers,
      creator_id: session.userId,
    });
    return { ok: true as const, gameId };
  },
});

/**
 * What a game page learns before it opens a socket.
 * A game the viewer may not enter reads as not found whether it exists or not, so a guessed id learns nothing;
 * the fixture keeps its signed-in access.
 */
export const getGame = query({
  args: { gameId: v.string() },
  returns: zodToConvex(playGameAccessSchema),
  handler: async (ctx, args) => {
    const session = await currentPlaySession(ctx);
    if (!session) {
      return { status: 'sign_in_required' as const };
    }
    const id = ctx.db.normalizeId('play_games', args.gameId);
    const game = id ? await ctx.db.get(id) : null;
    if (!game || !(await mayEnterGame(ctx, game, session.userId))) {
      return { status: 'not_found' as const };
    }
    return await gameAccess(ctx, game);
  },
});

/** What an admitted viewer learns about the game in its current state. */
async function gameAccess(ctx: QueryCtx, game: Doc<'play_games'>) {
  switch (game.state) {
    case 'pending':
      return { status: 'preparing' as const };
    case 'expired':
      return { status: 'unavailable' as const };
    case 'ready': {
      const ruleset = game.ruleset_id ? await ctx.db.get('rulesets', game.ruleset_id) : null;
      return readyGame(game, ruleset);
    }
  }
}

function readyGame(game: Doc<'play_games'>, ruleset: Doc<'rulesets'> | null) {
  return {
    status: 'ready' as const,
    gameId: game._id,
    name: isRealGame(game) ? (ruleset?.name ?? 'Game') : 'Hosted fixture',
    ruleset: ruleset ? { slug: ruleset.slug, name: ruleset.name } : null,
    minimumPlayers: game.minimum_players ?? null,
  };
}
