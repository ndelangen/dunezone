import type { Doc, Id } from '../_generated/dataModel';
import type { QueryCtx } from '../types';

/** A listing uses the board's name and publication address, never its geometry. */
function boardListing(row: Doc<'board_readiness'>): Doc<'assets'> | null {
  if (
    row.name === undefined ||
    row.slug === undefined ||
    row.owner_id === undefined ||
    row.group_id === undefined ||
    row.created_at === undefined ||
    row.updated_at === undefined ||
    row.is_deleted === undefined ||
    row.asset_creation_time === undefined
  ) {
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

/** The catalogue selects membership; optional board summaries only reduce the bytes per selected asset. */
export async function listAssetListingRows(ctx: QueryCtx, type: string, limit: number): Promise<Doc<'assets'>[]> {
  if (type === 'board') {
    /* Resolve a bounded set before sorting by source creation time, as the original asset index did. */
    const entries = await ctx.db
      .query('catalogue_entries')
      .withIndex('by_kind_partition_created', (q) => q.eq('kind', 'asset').eq('partition', 'board'))
      .take(1025);
    if (entries.length > 0 && entries.length <= 1024) {
      const boards = [];
      for (const entry of entries) {
        const id = ctx.db.normalizeId('assets', entry.source_id);
        const board = id ? await readBoardListing(ctx, id) : null;
        if (board && board.type === 'board' && !board.is_deleted) {
          boards.push(board);
        }
      }
      return boards.sort((a, b) => b._creationTime - a._creationTime).slice(0, limit);
    }
  }
  return await ctx.db
    .query('assets')
    .withIndex('by_type_deleted', (q) => q.eq('type', type).eq('is_deleted', false))
    .order('desc')
    .take(limit);
}
