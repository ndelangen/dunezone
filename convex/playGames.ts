import { zodToConvex } from 'convex-helpers/server/zod4';
import { ConvexError, v } from 'convex/values';
import type { Infer } from 'convex/values';
import type { z } from 'zod';

import { publishedHref } from '../src/shared/asset-publishing/publicationTargets';
import type { playCreateGameRequestSchema } from '../src/shared/play/admission';
import { playGameAccessSchema, playGameAddressAccessSchema } from '../src/shared/play/admission';
import {
  playGeneratedGameRequestSchema,
  playNamedGameOutcomeSchema,
  playNamedGameRequestSchema,
} from '../src/shared/play/gameCreation';
import { normalizePlayGameSlug, playGameNameSchema, PLAY_RESERVED_GAME_ADDRESSES } from '../src/shared/play/gameNames';
import { isGeneratedPlayGameName } from '../src/shared/play/generatedGameNames';
import { lastTurnSchema } from '../src/shared/play/lastTurn';
import { playCreateGameOutcomeSchema } from '../src/shared/play/seatLimit';
import { RULESET_ASSET_SLOT_ORDER } from '../src/shared/rulesets/assetSlots';
import { api, internal } from './_generated/api';
import type { Doc, Id } from './_generated/dataModel';
import { action } from './_generated/server';
import type { MutationCtx, QueryCtx } from './_generated/server';
import { containerSummary } from './assets';
import { internalMutation, mutation, viewerQuery } from './functions';
import { assetDisplayName } from './lib/assetInput';
import { admitsPlayers, currentPlaySession, isRealGame, livePlaySession } from './lib/playAuthorization';
import { playGameAddressAvailable } from './lib/playGameAddresses';
import { hasLocalPlayGameProfanity } from './lib/playGameNameChecks';
import { checkPlayGameName, PLAY_NAME_CHECK_MODEL, playNameCheckSchema } from './lib/playGameNameProvider';
import { createPendingGame } from './lib/playProvisioningSchedule';
import { playCreateQuota, playNameCheckCapacity, playRateLimiter } from './lib/playRateLimits';
import { atPlaySeatLimit } from './lib/playSeats';
import type { BoardReadCache } from './lib/rulesetBoard';
import { rulesetBoard, rulesetHasBoard } from './lib/rulesetBoard';

/*
 * Real games: any active signed-in player may create and enter one. The lobby is unlisted rather
 * than gated: nothing in the app links to /play until the public-release decision (#1094).
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
async function rulesetObjection(ctx: QueryCtx, rulesetId: Id<'rulesets'>, boardAvailable?: boolean) {
  if (!(boardAvailable ?? (await rulesetBoard(ctx, rulesetId)))) {
    return 'No usable board is linked.';
  }
  for (const [slot, label] of [
    ['treachery', 'treachery deck'],
    ['spice', 'spice deck'],
  ] as const) {
    const deck = await requiredDeck(ctx, rulesetId, slot);
    if (!deck) {
      return `No ${label} is linked.`;
    }
    if (!(await deckHasMembers(ctx, deck))) {
      return `The ${label} is empty.`;
    }
  }
  return null;
}

/* One slot row and one asset row per required deck, so a listing of two hundred rulesets stays within a query's reads. */
async function requiredDeck(ctx: QueryCtx, rulesetId: Id<'rulesets'>, slot: 'treachery' | 'spice') {
  const row = await ctx.db
    .query('ruleset_asset_slots')
    .withIndex('by_ruleset_slot', (q) => q.eq('ruleset_id', rulesetId).eq('slot', slot))
    .first();
  const asset = row ? await ctx.db.get(row.asset_id) : null;
  return asset && !asset.is_deleted ? asset._id : null;
}

const RULESET_CHOICE_LIMIT = 200;

const rulesetPreviewValidator = v.object({
  rulesetId: v.id('rulesets'),
  packed: v.array(
    v.object({
      slot: v.string(),
      name: v.string(),
      count: v.number(),
      truncated: v.boolean(),
      face: v.union(v.string(), v.null()),
      faceType: v.string(),
    })
  ),
  factions: v.array(v.object({ id: v.id('factions'), name: v.string(), token: v.string(), own: v.boolean() })),
});

const PREVIEW_FACTION_LIMIT = 50;
/* Each container reads its members to skip deleted ones, so the manifest stops after this many to keep the page's one query inside its read budget. */
const PREVIEW_CONTAINER_LIMIT = 8;
const FACTION_LINK_SCAN = 10;

/*
 * What a ruleset puts on the table, for the create page's manifest: its decks and token bundles in slot order, with counts and one face each,
 * then its factions, marked `own` when no other ruleset links them.
 */
async function rulesetPreview(ctx: QueryCtx, rulesetId: Id<'rulesets'>) {
  return { rulesetId, packed: await packedFor(ctx, rulesetId), factions: await factionsFor(ctx, rulesetId) };
}

/* The decks and token bundles in slot order, each with its count and one face; a deleted asset is left out. Slots are read in order, so the required decks always come first. */
async function packedFor(ctx: QueryCtx, rulesetId: Id<'rulesets'>) {
  const packed = [];
  for (const slot of RULESET_ASSET_SLOT_ORDER) {
    const rows = await ctx.db
      .query('ruleset_asset_slots')
      .withIndex('by_ruleset_slot', (q) => q.eq('ruleset_id', rulesetId).eq('slot', slot))
      .take(PREVIEW_CONTAINER_LIMIT - packed.length);
    for (const row of rows) {
      const asset = await ctx.db.get(row.asset_id);
      if (slot === 'board' && asset && !asset.is_deleted) {
        const publication = await ctx.db
          .query('publication_assets')
          .withIndex('by_asset_type_and_asset_id', (q) => q.eq('asset_type', 'board').eq('asset_id', asset._id))
          .unique();
        packed.push({
          slot,
          name: assetDisplayName(asset),
          count: 1,
          truncated: false,
          face: publication ? publishedHref('board', asset._id, publication.cache_token) : null,
          faceType: 'board',
        });
        continue;
      }
      const summary = asset && !asset.is_deleted ? await containerSummary(ctx, asset) : null;
      if (summary) {
        packed.push({ slot, ...summary });
      }
    }
    if (packed.length >= PREVIEW_CONTAINER_LIMIT) {
      break;
    }
  }
  return packed;
}

/* The linked factions, the ones no other ruleset links first. */
async function factionsFor(ctx: QueryCtx, rulesetId: Id<'rulesets'>) {
  const links = await ctx.db
    .query('ruleset_factions')
    .withIndex('by_ruleset', (q) => q.eq('ruleset_id', rulesetId))
    .take(PREVIEW_FACTION_LIMIT);
  const factions = [];
  for (const link of links) {
    const faction = await ctx.db.get(link.faction_id);
    if (faction && !faction.is_deleted) {
      factions.push(await factionLine(ctx, faction));
    }
  }
  return factions.sort((a, b) => Number(b.own) - Number(a.own));
}

/*
 * A faction is the ruleset's own when no other live ruleset links it; a deleted ruleset's leftover link does not count.
 * A scan that stops at its bound before settling it calls the faction shared, never own.
 */
async function factionLine(ctx: QueryCtx, faction: Doc<'factions'>) {
  const links = await ctx.db
    .query('ruleset_factions')
    .withIndex('by_faction', (q) => q.eq('faction_id', faction._id))
    .take(FACTION_LINK_SCAN);
  const rulesets = new Set<string>();
  for (const link of links) {
    const ruleset = await ctx.db.get(link.ruleset_id);
    if (ruleset && !ruleset.is_deleted) {
      rulesets.add(ruleset._id);
    }
  }
  return {
    id: faction._id,
    name: typeof faction.data?.name === 'string' ? faction.data.name : faction.slug,
    token: publishedHref('faction-token', faction._id, faction.updated_at),
    own: rulesets.size <= 1 && links.length < FACTION_LINK_SCAN,
  };
}

/**
 * The rulesets a signed-in player may start a game with, each with the directory's objection when it has one.
 * With `rulesetId`, also what that ruleset puts on the table, so the page reads its manifest through this one query.
 */
export const creatable = viewerQuery({
  args: { rulesetId: v.optional(v.id('rulesets')) },
  returns: v.union(
    v.object({ access: v.literal('unauthenticated') }),
    v.object({
      access: v.literal('allowed'),
      rulesets: v.array(
        v.object({
          id: v.id('rulesets'),
          slug: v.string(),
          name: v.string(),
          objection: v.union(v.string(), v.null()),
          selectable: v.boolean(),
        })
      ),
      preview: v.union(rulesetPreviewValidator, v.null()),
    })
  ),
  handler: async (ctx, { rulesetId }) => {
    if (!(await currentPlaySession(ctx))) {
      return { access: 'unauthenticated' as const };
    }
    const rows = await ctx.db
      .query('rulesets')
      .withIndex('by_deleted_name', (q) => q.eq('is_deleted', false))
      .take(RULESET_CHOICE_LIMIT);
    const rulesets = [];
    const boards: BoardReadCache = new Map();
    for (const row of rows) {
      const selectable = await rulesetHasBoard(ctx, row._id, boards);
      rulesets.push({
        id: row._id,
        slug: row.slug,
        name: row.name,
        objection: await rulesetObjection(ctx, row._id, selectable),
        selectable,
      });
    }
    const chosen = rulesetId === undefined ? undefined : rows.find((row) => row._id === rulesetId);
    return { access: 'allowed' as const, rulesets, preview: chosen ? await rulesetPreview(ctx, chosen._id) : null };
  },
});

/** A read-only hint; creation still allocates its address in its own transaction. */
export const nameAvailability = viewerQuery({
  args: { name: v.string() },
  returns: v.union(v.null(), v.object({ base: v.string(), duplicate: v.boolean() })),
  handler: async (ctx, { name }) => {
    if (!(await currentPlaySession(ctx))) {
      return null;
    }
    const parsed = playGameNameSchema.safeParse(name);
    if (!parsed.success) {
      return null;
    }
    const base = normalizePlayGameSlug(parsed.data);
    return { base, duplicate: !(await playGameAddressAvailable(ctx, base)) };
  },
});

/**
 * Creates a real game: a pending directory record with its fixed ruleset, minimum count and creator, and the provisioning requests that ask the game Worker to initialize it.
 * The creator takes the first seat when the Worker initializes, and that seat counts against the seat limit from creation;
 * nothing here grants them more.
 */
/* A generated name skips the provider check: it is one of the server's own phrases, and anything else is drawn afresh. */
export const createGame = mutation({
  args: zodToConvex(playGeneratedGameRequestSchema),
  returns: zodToConvex(playCreateGameOutcomeSchema),
  handler: async (ctx, { generatedName, ...settings }) =>
    await createAuthorizedGame(
      ctx,
      settings,
      generatedName !== undefined && isGeneratedPlayGameName(generatedName) ? generatedName : undefined
    ),
});

/** The current page creates generated games through the same bounded conflict recovery as custom games. */
export const createGeneratedGame = action({
  args: zodToConvex(playGeneratedGameRequestSchema),
  returns: zodToConvex(playCreateGameOutcomeSchema),
  handler: async (ctx, args): Promise<z.infer<typeof playCreateGameOutcomeSchema>> =>
    await recoverCreationConflict(() => ctx.runMutation(api.playGames.createGame, args)),
});

type NamedGameContract = z.infer<typeof playNamedGameOutcomeSchema>;
type NamedGameOutcome =
  | Extract<NamedGameContract, { ok: false }>
  | (Extract<NamedGameContract, { ok: true }> & { gameId: Id<'play_games'> });
const preparationValidator = v.union(
  zodToConvex(playNamedGameOutcomeSchema.options[1]),
  v.object({ ok: v.literal(true), name: v.string(), base: v.string(), checkProvider: v.boolean() })
);
type PreparedName = Infer<typeof preparationValidator>;

/** Authentication, ordinary validation and local refusals precede any paid request. */
export const prepareNamedGame = internalMutation({
  args: zodToConvex(playNamedGameRequestSchema),
  returns: preparationValidator,
  handler: async (ctx, args): Promise<PreparedName> => {
    const eligible = await gameCreationEligibility(ctx, args);
    if (!eligible.ok) {
      return eligible;
    }
    const parsed = playGameNameSchema.safeParse(args.name);
    if (!parsed.success) {
      return { ok: false, reason: 'invalid_name' };
    }
    const name = parsed.data;
    const base = normalizePlayGameSlug(name);
    if (hasLocalPlayGameProfanity(name) || hasLocalPlayGameProfanity(base)) {
      return { ok: false, reason: 'profanity_detected' };
    }
    if (!(await playRateLimiter.check(ctx, 'playCreatePerAccount', { key: eligible.userId })).ok) {
      return { ok: false, reason: 'rate_limited' };
    }
    const capacity = await playNameCheckCapacity(ctx, eligible.userId);
    if (capacity === 'rate_limited') {
      return { ok: false, reason: 'rate_limited' };
    }
    return { ok: true, name, base, checkProvider: capacity === 'checked' };
  },
});

/** A supplied name is classified once at submission; clients cannot supply a check result. */
export const createGameWithName = action({
  args: zodToConvex(playNamedGameRequestSchema),
  returns: zodToConvex(playNamedGameOutcomeSchema),
  handler: async (ctx, args): Promise<NamedGameOutcome> => {
    const prepared: PreparedName = await recoverCreationConflict(() =>
      ctx.runMutation(internal.playGames.prepareNamedGame, args)
    );
    if (!prepared.ok) {
      return prepared;
    }
    const check = prepared.checkProvider
      ? await checkPlayGameName(prepared.name, prepared.base)
      : { outcome: 'check_unavailable' as const, reason: 'rate_limit' as const };
    return await recoverCreationConflict(() =>
      ctx.runMutation(internal.playGames.createNamedGame, {
        rulesetId: args.rulesetId,
        minimumPlayers: args.minimumPlayers,
        lastTurn: args.lastTurn,
        name: prepared.name,
        base: prepared.base,
        check,
      })
    );
  },
});

/**
 * OCC rejects an uncommitted transaction, so only its complete platform conflict sentence permits another attempt.
 * The action syscall strips the platform error code.
 * Application ConvexErrors are excluded.
 * Unknown failures, including a lost response after commit, are never replayed.
 * Provider calls stay outside this recovery and each attempt rechecks authorization, seats and quota.
 * Three total attempts bound recovery when conflicts persist.
 */
async function recoverCreationConflict<Result>(commit: () => Promise<Result>, attempt = 0): Promise<Result> {
  try {
    return await commit();
  } catch (error) {
    const conflict =
      error instanceof Error &&
      !(error instanceof ConvexError) &&
      /^Documents read from or written to the "[A-Za-z]\w*" table changed while this mutation was being run and on every subsequent retry\./.test(
        error.message
      );
    if (!conflict || attempt >= 2) {
      throw error;
    }
    const jitter = (crypto.getRandomValues(new Uint8Array(1))[0]! / 256) * 200;
    await new Promise((resolve) => setTimeout(resolve, (attempt + 1) * 200 + jitter));
    return await recoverCreationConflict(commit, attempt + 1);
  }
}

/** Only the server action supplies the exact checked wording and its derived outcome. */
export const createNamedGame = internalMutation({
  args: {
    ...zodToConvex(playNamedGameRequestSchema).fields,
    base: v.string(),
    check: zodToConvex(playNameCheckSchema),
  },
  returns: zodToConvex(playNamedGameOutcomeSchema),
  handler: async (ctx, args): Promise<NamedGameOutcome> => {
    const parsed = playGameNameSchema.safeParse(args.name);
    if (!parsed.success || parsed.data !== args.name || normalizePlayGameSlug(parsed.data) !== args.base) {
      return { ok: false, reason: 'invalid_name' };
    }
    if (
      args.check.outcome === 'profanity_detected' ||
      hasLocalPlayGameProfanity(args.name) ||
      hasLocalPlayGameProfanity(args.base)
    ) {
      return { ok: false, reason: 'profanity_detected' };
    }
    const result = await createAuthorizedGame(ctx, args, args.name);
    if (!result.ok) {
      return result;
    }
    const game = await ctx.db.get('play_games', result.gameId);
    if (!game?.name || !game.slug) {
      throw new Error('A newly created game must have its checked name and allocated address');
    }
    if (args.check.outcome === 'check_unavailable') {
      console.info({
        event: 'play_name_check_unavailable_accepted',
        model: PLAY_NAME_CHECK_MODEL,
        reason: args.check.reason,
      });
    }
    return { ...result, name: game.name, slug: game.slug, moderation: args.check.outcome };
  },
});

/** The same current session, readiness and seat checks run before spending and again when committing. */
async function gameCreationEligibility(ctx: MutationCtx, args: z.infer<typeof playCreateGameRequestSchema>) {
  /* The Convex validator keeps only the type, so the turn's whole-number range is enforced here, before any budget is spent. */
  lastTurnSchema.optional().parse(args.lastTurn);
  const session = await livePlaySession(ctx);
  if (!session) {
    return { ok: false as const, reason: 'not_authorized' as const };
  }
  const rulesetId = ctx.db.normalizeId('rulesets', args.rulesetId);
  const ruleset = rulesetId ? await ctx.db.get('rulesets', rulesetId) : null;
  if (!ruleset || ruleset.is_deleted || (await rulesetObjection(ctx, ruleset._id)) !== null) {
    return { ok: false as const, reason: 'unavailable' as const };
  }
  if (await atPlaySeatLimit(ctx, session.userId)) {
    return { ok: false as const, reason: 'seat_limit' as const };
  }
  return { ok: true as const, userId: session.userId, rulesetId: ruleset._id };
}

/** Authorization, ruleset readiness, seats, quota, allocation and scheduling share one transaction. */
export async function createAuthorizedGame(
  ctx: MutationCtx,
  args: z.infer<typeof playCreateGameRequestSchema>,
  name?: string,
  accept?: (slug: string) => boolean
) {
  const eligible = await gameCreationEligibility(ctx, args);
  if (!eligible.ok) {
    return eligible;
  }
  /* The creator holds the new game's first seat, so a player at the seat limit is refused before the hourly budget is spent. */
  const limited = await playCreateQuota(ctx, eligible.userId);
  if (limited) {
    return limited;
  }
  const gameId = await createPendingGame(
    ctx,
    {
      ruleset_id: eligible.rulesetId,
      minimum_players: args.minimumPlayers,
      last_turn: args.lastTurn,
      creator_id: eligible.userId,
      name,
    },
    accept
  );
  return { ok: true as const, gameId };
}

/** What a game page learns before it opens a socket: any signed-in player may enter a game that admits players, and an unknown id or the closed hosted fixture reads as not found. */
export const getGame = viewerQuery({
  args: { gameId: v.string() },
  returns: zodToConvex(playGameAccessSchema),
  handler: async (ctx, args) => {
    const session = await currentPlaySession(ctx);
    if (!session) {
      return { status: 'sign_in_required' as const };
    }
    const id = ctx.db.normalizeId('play_games', args.gameId);
    const game = id ? await ctx.db.get(id) : null;
    if (!game || !admitsPlayers(game)) {
      return { status: 'not_found' as const };
    }
    return await gameAccess(ctx, game);
  },
});

/** Resolves a friendly address or legacy ID without granting access or changing the game's identity. */
export const getGameByAddress = viewerQuery({
  args: { address: v.string() },
  returns: zodToConvex(playGameAddressAccessSchema),
  handler: async (ctx, { address }) => {
    if (!(await currentPlaySession(ctx))) {
      return { status: 'sign_in_required' as const };
    }
    if ((PLAY_RESERVED_GAME_ADDRESSES as readonly string[]).includes(address)) {
      return { status: 'not_found' as const };
    }
    /* Every token the old resolver accepts stays in its namespace, even when its game no longer exists. */
    const id = ctx.db.normalizeId('play_games', address);
    const game = id
      ? await ctx.db.get(id)
      : await ctx.db
          .query('play_games')
          /* Stored addresses are lowercase, so a hand-typed or auto-capitalised link still finds its game; the page then moves to the stored spelling. */
          .withIndex('by_slug', (q) => q.eq('slug', address.toLowerCase()))
          .unique();
    if (!game || !admitsPlayers(game)) {
      return { status: 'not_found' as const };
    }
    const access = await gameAccess(ctx, game);
    return {
      ...access,
      gameId: game._id,
      name: game.name ?? ('name' in access ? access.name : 'Game'),
      slug: game.slug ?? null,
    };
  },
});

/** What an admitted viewer learns about the game in its current state. */
async function gameAccess(ctx: QueryCtx, game: Doc<'play_games'>) {
  switch (game.state) {
    case 'pending':
      return { status: 'preparing' as const };
    case 'expired':
      return { status: 'unavailable' as const, ...(game.provision_error ? { reason: game.provision_error } : {}) };
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
