import { zodToConvex } from 'convex-helpers/server/zod4';

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
import { authenticatedPlayRequest, currentPlaySession, isAdministrator, isRealGame } from './lib/playAuthorization';

/*
 * The directory: what the lobby may know about each game. The game Worker publishes a summary
 * with a sequence it assigns; Convex keeps the newest and acknowledges every delivery, so a
 * duplicate or delayed one has no effect. Player names are never stored here: the listing reads
 * them from current profiles, so a delayed summary cannot republish a deleted account's name.
 */

const ONGOING_STAGES = ['drafting', 'swapping', 'setup', 'play'] as const;
/* Per stage, in creation order, before the sort by activity: enough for an Administrator-only directory today. */
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

/** Who a seat holds, by current account: a deleted or unknown account leaves the seat unnamed. */
async function seatedPlayer(ctx: QueryCtx, seat: PlayDirectorySummary['seats'][number]) {
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
  return { userId, displayName: profile.username || 'Player', faction: seat.faction?.name ?? null };
}

async function lobbyEntry(ctx: QueryCtx, game: Doc<'play_games'>, viewerId: Id<'users'>) {
  const parsed = playDirectorySummarySchema.safeParse(game.directory);
  if (!parsed.success) {
    return null;
  }
  const summary = parsed.data;
  const ruleset = game.ruleset_id ? await ctx.db.get('rulesets', game.ruleset_id) : null;
  const seated = [];
  for (const seat of summary.seats) {
    const player = await seatedPlayer(ctx, seat);
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
    viewerSeated: seated.some((player) => player.userId === viewerId),
    players: seated.map(({ displayName, faction }) => ({ displayName, faction })),
    phase: summary.phase,
    lastActivityAt: summary.lastActivityAt,
    result: namedResult(summary),
  };
}

/** The declared result with its factions named from the seats that hold them; an unknown id stays an id. */
function namedResult(summary: PlayDirectorySummary) {
  if (!summary.result) {
    return null;
  }
  const names = new Map(summary.seats.flatMap((seat) => (seat.faction ? [[seat.faction.id, seat.faction.name]] : [])));
  return { kind: summary.result.kind, factions: summary.result.factionIds.map((id) => names.get(id) ?? id) };
}

async function gamesInStage(ctx: QueryCtx, stage: PlayDirectorySummary['stage']) {
  return await ctx.db
    .query('play_games')
    .withIndex('by_directory_stage', (q) => q.eq('directory_stage', stage))
    .take(LOBBY_LIMIT);
}

/**
 * The lobby's ongoing and past lists.
 * Real games are Administrator-only, so everyone else sees no listing.
 * The ready listing also says whether the viewer may create a game.
 */
export const listGames = query({
  args: {},
  returns: zodToConvex(playLobbySchema),
  handler: async (ctx) => {
    const session = await currentPlaySession(ctx);
    if (!session) {
      return { status: 'sign_in_required' as const };
    }
    const isAdmin = await isAdministrator(ctx, session.userId);
    if (!isAdmin) {
      return { status: 'not_authorized' as const };
    }
    const listed = async (stages: readonly PlayDirectorySummary['stage'][]) => {
      const rows = (await Promise.all(stages.map((stage) => gamesInStage(ctx, stage)))).flat();
      const entries = [];
      for (const game of rows) {
        const entry = game.state === 'ready' && game.directory ? await lobbyEntry(ctx, game, session.userId) : null;
        if (entry) {
          entries.push(entry);
        }
      }
      return entries.sort((a, b) => b.lastActivityAt - a.lastActivityAt);
    };
    return {
      status: 'ready' as const,
      canCreate: isAdmin,
      ongoing: await listed(ONGOING_STAGES),
      past: await listed(['finished']),
    };
  },
});
