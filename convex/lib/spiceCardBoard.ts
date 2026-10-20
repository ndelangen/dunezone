import { ConvexError } from 'convex/values';
import type { z } from 'zod';

import { SpiceAsset } from '../../src/shared/assets/schema';
import type { CustomCardTokens, SpiceBoardLink } from '../../src/shared/assets/schema';
import { spiceBoardTokenIds } from '../../src/shared/assets/spiceCardReferences';
import { parseBoardData } from '../../src/shared/assets/validation';
import { BOARD_MAX_TOKENS } from '../../src/shared/boards/markup';
import type { Board } from '../../src/shared/boards/schema';
import type { Doc, Id } from '../_generated/dataModel';
import type { MutationCtx, QueryCtx } from '../types';
import { resolveCustomCardTokens } from './customCardTokens';

/*
 * A Spice card linked to a board Asset depends on that board and on its placed tokens.
 * Reverse rows index both, so saving either one redraws the cards that use it (#1973).
 */
export const SPICE_CARD_BOARD_RELATION = 'spice-card-board';
export const SPICE_CARD_TOKEN_RELATION = 'spice-card-token';
export const SPICE_CARD_RELATIONS = [SPICE_CARD_BOARD_RELATION, SPICE_CARD_TOKEN_RELATION] as const;
export type SpiceCardRelation = (typeof SPICE_CARD_RELATIONS)[number];

/* The resolved board rides in the publication payload beside the card and its tokens. */
const MAX_PAYLOAD_BYTES = 786_432;

export function spiceCardBoardLink(data: unknown): z.infer<typeof SpiceBoardLink> | undefined {
  const parsed = SpiceAsset.safeParse(data);
  return parsed.success ? parsed.data.board : undefined;
}

/** Repeated instances of one token share one read and one reverse row. */
export function spiceCardTokenIds(data: unknown): string[] {
  return spiceBoardTokenIds(spiceCardBoardLink(data));
}

const isLiveBoard = (row: Doc<'assets'> | null): row is Doc<'assets'> =>
  row !== null && !row.is_deleted && row.type === 'board';

/** The live board behind an ID, or null when it is gone, not a board, or no longer draws. */
export async function readLinkedBoard(ctx: Pick<QueryCtx, 'db'>, raw: string): Promise<Board | null> {
  const id = ctx.db.normalizeId('assets', raw);
  const row = id ? await ctx.db.get('assets', id) : null;
  if (!isLiveBoard(row)) {
    return null;
  }
  try {
    return parseBoardData(row.data).board;
  } catch {
    return null;
  }
}

export type SpiceCardBoardResolution = {
  board: Board | null;
  tokens: z.infer<typeof CustomCardTokens>;
  error: string | null;
};

/** What a linked card draws: its board and token fronts, with missing ones left null so the card can say so. */
export async function resolveSpiceCardBoard(
  ctx: Pick<QueryCtx, 'db'>,
  boardId: string | undefined,
  tokenIds: readonly string[]
): Promise<SpiceCardBoardResolution> {
  if (tokenIds.length > BOARD_MAX_TOKENS + 1) {
    throw new ConvexError('Too many linked tokens');
  }
  const board = boardId ? await readLinkedBoard(ctx, boardId) : null;
  const { tokens, error } = tokenIds.length
    ? await resolveCustomCardTokens(ctx, tokenIds)
    : { tokens: {}, error: null };
  return { board, tokens, error };
}

export function spiceCardPublicationError(data: unknown, resolved: SpiceCardBoardResolution) {
  return (
    resolved.error ??
    (new TextEncoder().encode(JSON.stringify({ card: data, board: resolved.board, tokens: resolved.tokens })).length >
    MAX_PAYLOAD_BYTES
      ? 'The card, its board and its tokens are too large to publish. Simplify the board or remove tokens.'
      : null)
  );
}

/** The first link problem of a card: a payload too large, a new board that is gone, or a new token that is. */
function linkError(
  data: unknown,
  previous: unknown,
  { asset_id }: z.infer<typeof SpiceBoardLink>,
  resolved: SpiceCardBoardResolution
) {
  const publication = spiceCardPublicationError(data, resolved);
  if (publication) {
    return publication;
  }
  if (!resolved.board && spiceCardBoardLink(previous)?.asset_id !== asset_id) {
    return 'Choose an available board for this card';
  }
  const carried = new Set(spiceCardTokenIds(previous));
  return spiceCardTokenIds(data).some((id) => !resolved.tokens[id] && !carried.has(id))
    ? 'Choose an available token asset for every placed token'
    : null;
}

/** A new link must resolve; a board or token the card already used may have been deleted since, and stays as it is. */
export async function validateSpiceCardBoard(ctx: MutationCtx, data: unknown, previous?: unknown) {
  const link = spiceCardBoardLink(data);
  if (!link) {
    return;
  }
  const tokenIds = spiceCardTokenIds(data);
  const error = linkError(data, previous, link, await resolveSpiceCardBoard(ctx, link.asset_id, tokenIds));
  if (error) {
    throw new ConvexError(error);
  }
}

async function syncRelation(ctx: MutationCtx, cardId: Id<'assets'>, kind: SpiceCardRelation, wanted: Set<string>) {
  const current = await ctx.db
    .query('asset_relations')
    .withIndex('by_from_kind', (q) => q.eq('from_asset_id', cardId).eq('kind', kind))
    .take(BOARD_MAX_TOKENS + 2);
  const kept = new Set<string>(current.map((relation) => relation.to_asset_id));
  const stale = current.filter((relation) => !wanted.has(relation.to_asset_id));
  const added = [...wanted]
    .filter((raw) => !kept.has(raw))
    .map((raw) => ctx.db.normalizeId('assets', raw))
    .filter((id): id is Id<'assets'> => id !== null);
  await Promise.all(stale.map((relation) => ctx.db.delete(relation._id)));
  await Promise.all(
    added.map((id) => ctx.db.insert('asset_relations', { from_asset_id: cardId, to_asset_id: id, kind, count: 1 }))
  );
}

/** The card's data owns the link; reverse rows only index its current board and tokens. */
export async function syncSpiceCardRelations(ctx: MutationCtx, cardId: Id<'assets'>, data: unknown) {
  const link = spiceCardBoardLink(data);
  await syncRelation(ctx, cardId, SPICE_CARD_BOARD_RELATION, new Set(link ? [link.asset_id] : []));
  await syncRelation(ctx, cardId, SPICE_CARD_TOKEN_RELATION, new Set(spiceCardTokenIds(data)));
}

/** Whether the card still draws this dependency, checked again before each redraw. */
export function spiceCardDependsOn(data: unknown, kind: SpiceCardRelation, dependencyId: string) {
  return kind === SPICE_CARD_BOARD_RELATION
    ? spiceCardBoardLink(data)?.asset_id === dependencyId
    : spiceCardTokenIds(data).includes(dependencyId);
}
