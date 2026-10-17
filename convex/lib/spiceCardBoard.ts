import { ConvexError } from 'convex/values';
import type { z } from 'zod';

import { SpiceAsset, SPICE_MAX_TOKENS } from '../../src/shared/assets/schema';
import type { CustomCardTokens, SpiceBoardLink } from '../../src/shared/assets/schema';
import { parseBoardData } from '../../src/shared/assets/validation';
import type { Board } from '../../src/shared/boards/schema';
import { compareCodeUnits } from '../../src/shared/compareText';
import type { Id } from '../_generated/dataModel';
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
  const link = spiceCardBoardLink(data);
  return link ? [...new Set(link.tokens.map((token) => token.asset_id))].sort(compareCodeUnits) : [];
}

/** The live board behind an ID, or null when it is gone, not a board, or no longer draws. */
export async function readLinkedBoard(ctx: Pick<QueryCtx, 'db'>, raw: string): Promise<Board | null> {
  const id = ctx.db.normalizeId('assets', raw);
  const row = id ? await ctx.db.get('assets', id) : null;
  if (!row || row.is_deleted || row.type !== 'board') {
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
  if (tokenIds.length > SPICE_MAX_TOKENS) {
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

/** A new link must resolve; a board or token the card already used may have been deleted since, and stays as it is. */
export async function validateSpiceCardBoard(ctx: MutationCtx, data: unknown, previous?: unknown) {
  const link = spiceCardBoardLink(data);
  if (!link) {
    return;
  }
  const before = spiceCardBoardLink(previous);
  const tokenIds = spiceCardTokenIds(data);
  const resolved = await resolveSpiceCardBoard(ctx, link.asset_id, tokenIds);
  const error = spiceCardPublicationError(data, resolved);
  if (error) {
    throw new ConvexError(error);
  }
  if (!resolved.board && before?.asset_id !== link.asset_id) {
    throw new ConvexError('Choose an available board for this card');
  }
  const carried = new Set(spiceCardTokenIds(previous));
  if (tokenIds.some((id) => !resolved.tokens[id] && !carried.has(id))) {
    throw new ConvexError('Choose an available token asset for every placed token');
  }
}

async function syncRelation(ctx: MutationCtx, cardId: Id<'assets'>, kind: SpiceCardRelation, wanted: Set<string>) {
  const current = await ctx.db
    .query('asset_relations')
    .withIndex('by_from_kind', (q) => q.eq('from_asset_id', cardId).eq('kind', kind))
    .take(SPICE_MAX_TOKENS + 1);
  for (const relation of current) {
    if (!wanted.delete(relation.to_asset_id)) {
      await ctx.db.delete(relation._id);
    }
  }
  for (const raw of wanted) {
    const id = ctx.db.normalizeId('assets', raw);
    if (id) {
      await ctx.db.insert('asset_relations', { from_asset_id: cardId, to_asset_id: id, kind, count: 1 });
    }
  }
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
