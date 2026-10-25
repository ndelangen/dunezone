import type { Doc, Id } from '../_generated/dataModel';
import type { QueryCtx } from '../types';

/** Every optional listing field must be present before the source read can be skipped. */
function hasListingFields(row: Doc<'board_readiness'>): row is Required<Doc<'board_readiness'>> {
  return [
    row.name,
    row.slug,
    row.owner_id,
    row.group_id,
    row.created_at,
    row.updated_at,
    row.is_deleted,
    row.asset_creation_time,
  ].every((value) => value !== undefined);
}

/** A listing uses the board's name and publication address, never its geometry. */
function boardListing(row: Doc<'board_readiness'>): Doc<'assets'> | null {
  if (!hasListingFields(row)) {
    return null;
  }
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

/** Missing or incomplete summaries retain the authoritative asset read during recovery. */
export async function readBoardListing(ctx: QueryCtx, id: Id<'assets'>) {
  const summary = await ctx.db
    .query('board_readiness')
    .withIndex('by_asset', (q) => q.eq('asset_id', id))
    .unique();
  return (summary && boardListing(summary)) || (await ctx.db.get('assets', id));
}

/** Completed backfills make the summary index authoritative; recovery retains the original bounded source read. */
export async function listAssetListingRows(ctx: QueryCtx, type: string, limit: number): Promise<Doc<'assets'>[]> {
  if (type === 'board') {
    const backfill = await ctx.db
      .query('migration_runs')
      .withIndex('by_migration_id', (q) => q.eq('migration_id', 'board_readiness_listing_v1'))
      .unique();
    if (backfill?.state === 'success' && backfill.is_done) {
      const summaries = await ctx.db
        .query('board_readiness')
        .withIndex('by_deleted_created', (q) => q.eq('is_deleted', false))
        .order('desc')
        .take(limit);
      const boards = [];
      for (const summary of summaries) {
        const board = boardListing(summary) || (await ctx.db.get('assets', summary.asset_id));
        if (board && board.type === 'board' && !board.is_deleted) {
          boards.push(board);
        }
      }
      return boards;
    }
  }
  return await ctx.db
    .query('assets')
    .withIndex('by_type_deleted', (q) => q.eq('type', type).eq('is_deleted', false))
    .order('desc')
    .take(limit);
}
