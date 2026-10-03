import { zodToConvex } from 'convex-helpers/server/zod4';

import { CanonicalFactionStoredSchema } from '../src/shared/factions/schema';
import {
  playDirectorySummarySchema,
  playLobbySchema,
  playPublishSummaryRequestSchema,
  playPublishSummaryResultSchema,
} from '../src/shared/play/directory';
import type { PlayDirectorySummary } from '../src/shared/play/directory';
import type { Doc, Id } from './_generated/dataModel';
import { query } from './_generated/server';
import type { QueryCtx } from './_generated/server';
import { mutation } from './functions';
import { isActiveProfile } from './lib/accountLifecycle';
import { authenticatedPlayRequest, currentPlaySession, isRealGame } from './lib/playAuthorization';

/*
 * The directory: what the lobby may know about each game. The game Worker publishes a summary
 * with a sequence it assigns; Convex keeps the newest and acknowledges every delivery, so a
 * duplicate or delayed one has no effect. Player names are never stored here: the listing reads
 * them from current profiles, so a delayed summary cannot republish a deleted account's name.
 */

const ONGOING_STAGES = ['drafting', 'swapping', 'setup', 'play'] as const;
/* Per stage, in creation order, before the sort by activity: enough for an unlisted beta directory today. */
const LOBBY_LIMIT = 100;

export const publishSummary = mutation({
  args: zodToConvex(playPublishSummaryRequestSchema),
  returns: zodToConvex(playPublishSummaryResultSchema),
  handler: async (ctx, input) => {
    const request = await authenticatedPlayRequest(ctx, input, playPublishSummaryRequestSchema);
    if (!request || request.game.state !== 'ready' || !isRealGame(request.game)) {
      return { ok: false as const };
    }
    const { game, args } = request;
    const held = game.directory_sequence ?? 0;
    if (args.sequence <= held) {
      return { ok: true as const, sequence: held };
    }
    await ctx.db.patch(game._id, {
      directory_sequence: args.sequence,
      directory_stage: args.summary.stage,
      directory: args.summary,
    });
    return { ok: true as const, sequence: args.sequence };
  },
});

type Seat = PlayDirectorySummary['seats'][number];
/* One read per faction per listing: the same faction often sits at many tables. */
type TokenMemo = Map<string, ReturnType<typeof factionToken>>;

/** The faction's token as the catalogue draws it today, or null when its row is gone or no longer parses. */
async function factionToken(ctx: QueryCtx, factionId: string) {
  const id = ctx.db.normalizeId('factions', factionId);
  const row = id ? await ctx.db.get('factions', id) : null;
  if (!row || row.is_deleted) {
    return null;
  }
  const parsed = CanonicalFactionStoredSchema.safeParse(row.data);
  return parsed.success ? { logo: parsed.data.logo, background: parsed.data.background } : null;
}

/** Who a seat holds, by current account: a deleted or unknown account leaves the seat unnamed. */
async function seatedPlayer(ctx: QueryCtx, seat: Seat, viewerId: Id<'users'>, tokens: TokenMemo) {
  const userId = ctx.db.normalizeId('users', seat.userId);
  const profile = userId
    ? await ctx.db
        .query('profiles')
        .withIndex('by_user_id', (q) => q.eq('user_id', userId))
        .unique()
    : null;
  if (!profile || !isActiveProfile(profile)) {
    return null;
  }
  const faction = seat.faction;
  if (faction && !tokens.has(faction.id)) {
    tokens.set(faction.id, factionToken(ctx, faction.id));
  }
  return {
    displayName: profile.username || 'Player',
    avatarUrl: profile.avatar?.url ?? profile.avatar_url,
    viewer: userId === viewerId,
    faction: faction && { name: faction.name, color: faction.color, token: await tokens.get(faction.id)! },
  };
}

async function lobbyEntry(ctx: QueryCtx, game: Doc<'play_games'>, viewerId: Id<'users'>, tokens: TokenMemo) {
  const parsed = playDirectorySummarySchema.safeParse(game.directory);
  if (!parsed.success) {
    return null;
  }
  const summary = parsed.data;
  const ruleset = game.ruleset_id ? await ctx.db.get('rulesets', game.ruleset_id) : null;
  const seated = [];
  for (const seat of summary.seats) {
    const player = await seatedPlayer(ctx, seat, viewerId, tokens);
    if (player) {
      seated.push(player);
    }
  }
  return {
    gameId: game._id,
    name: ruleset?.name ?? 'Game',
    stage: summary.stage,
    seatsFilled: seated.length,
    seatCount: summary.seatCount,
    viewerSeated: seated.some((player) => player.viewer),
    players: seated,
    phase: summary.phase,
    lastActivityAt: summary.lastActivityAt,
    result: namedResult(summary),
  };
}

/** The declared result with the names the game gave its winning factions. */
function namedResult(summary: PlayDirectorySummary) {
  return summary.result && { kind: summary.result.kind, factions: summary.result.factions.map(({ name }) => name) };
}

async function gamesInStage(ctx: QueryCtx, stage: PlayDirectorySummary['stage']) {
  return await ctx.db
    .query('play_games')
    .withIndex('by_directory_stage', (q) => q.eq('directory_stage', stage))
    .take(LOBBY_LIMIT);
}

/**
 * The lobby's ongoing and past lists.
 * Any active signed-in player sees every listed game.
 */
export const listGames = query({
  args: {},
  returns: zodToConvex(playLobbySchema),
  handler: async (ctx) => {
    const session = await currentPlaySession(ctx);
    if (!session) {
      return { status: 'sign_in_required' as const };
    }
    const tokens: TokenMemo = new Map();
    const listed = async (stages: readonly PlayDirectorySummary['stage'][]) => {
      const rows = (await Promise.all(stages.map((stage) => gamesInStage(ctx, stage)))).flat();
      const entries = [];
      for (const game of rows) {
        const entry =
          game.state === 'ready' && game.directory ? await lobbyEntry(ctx, game, session.userId, tokens) : null;
        if (entry) {
          entries.push(entry);
        }
      }
      return entries.sort((a, b) => b.lastActivityAt - a.lastActivityAt);
    };
    return {
      status: 'ready' as const,
      ongoing: await listed(ONGOING_STAGES),
      past: await listed(['finished']),
    };
  },
});
