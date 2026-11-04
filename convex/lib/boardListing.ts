import type { Doc, Id } from '../_generated/dataModel';
import type { QueryCtx } from '../types';

/** A listing uses the board's name and publication address, never its geometry. */
function boardListing(row: Doc<'board_readiness'>): Doc<'assets'> {
  return {
    _id: row.asset_id,
    _creationTime: row.asset_creation_time,
    type: 'board',
    data: { name: row.name },
    slug: row.slug,
    owner_id: row.owner_id,
    group_id: row.group_id,
    created_at: row.created_at,
    updated_at: row.updated_at,
    is_deleted: row.is_deleted,
  };
}

/** A board reads from its summary; any other asset has none and reads in full. */
export async function readBoardListing(ctx: QueryCtx, id: Id<'assets'>) {
  const summary = await ctx.db
    .query('board_readiness')
    .withIndex('by_asset', (q) => q.eq('asset_id', id))
    .unique();
  return summary ? boardListing(summary) : await ctx.db.get('assets', id);
}

/** Boards list from their summaries, so the page never reads a board's geometry; other types list their rows. */
export async function listAssetListingRows(ctx: QueryCtx, type: string, limit: number): Promise<Doc<'assets'>[]> {
  if (type === 'board') {
    const summaries = await ctx.db
      .query('board_readiness')
      .withIndex('by_deleted_created', (q) => q.eq('is_deleted', false))
      .order('desc')
      .take(limit);
    return summaries.map(boardListing);
  }
  return await ctx.db
    .query('assets')
    .withIndex('by_type_deleted', (q) => q.eq('type', type).eq('is_deleted', false))
    .order('desc')
    .take(limit);
}
