import type { AssetCatalogueSort } from '../../src/shared/assets/catalogueSearch';
import type { Id } from '../_generated/dataModel';
import type { QueryCtx } from '../_generated/server';
import { assetDisplayName } from './assetInput';
import { catalogueEditedAt, catalogueNameKey, catalogueSearchText, catalogueTimestamp } from './catalogueEntryShape';
import type { CatalogueKind } from './catalogueEntryShape';
import type { CatalogueDirection, CatalogueSort } from './catalogueOrder';
import { profileSummary } from './profileSummary';

/** A reader's sort as the aggregate orders it: names A to Z, dates newest first. */
export function assetCatalogueOrderOf(sort: AssetCatalogueSort | undefined): {
  sort: CatalogueSort;
  direction: CatalogueDirection;
} {
  switch (sort) {
    case 'name':
      return { sort: 'name', direction: 'asc' };
    case 'updated':
      return { sort: 'updated', direction: 'desc' };
    case 'newest':
    case undefined:
      return { sort: 'created', direction: 'desc' };
  }
}

/**
 * The asset kind of `catalogue_entries`: one entry per live asset, faceted by its type, so each `/assets/{type}` page is one list.
 * The owner's name is searchable as well as the asset's, so a reader can find their own work;
 * a rename reaches the entries through `reconcileOwnerAssets`.
 */
export const assetCatalogueKind: CatalogueKind = {
  sorts: ['name', 'created', 'updated'],
  expected: async (ctx, sourceId) => {
    const assetId = ctx.db.normalizeId('assets', sourceId);
    const asset = assetId ? await ctx.db.get('assets', assetId) : null;
    if (!asset || asset.is_deleted) {
      return null;
    }
    const name = assetDisplayName(asset);
    const owner = await profileSummary(ctx, asset.owner_id);
    return {
      kind: 'asset',
      source_id: asset._id,
      slug: asset.slug,
      search_text: catalogueSearchText([name, owner?.username ?? '']),
      name_key: catalogueNameKey(name),
      created_at: catalogueTimestamp(asset.created_at),
      updated_at: catalogueTimestamp(asset.updated_at),
      edited_at: catalogueEditedAt(asset.created_at, asset.updated_at),
      complexity: 0,
      complexity_score: 0,
      facets: [asset.type],
    };
  },
  listedSourceIds: async (ctx, limit) => {
    const rows = await ctx.db
      .query('assets')
      .withIndex('by_deleted', (q) => q.eq('is_deleted', false))
      .take(limit);
    return rows.map((row) => row._id);
  },
};

/** One owner's live assets, a page at a time, for the walk that carries a rename into their entries. */
export async function ownerAssetPage(ctx: QueryCtx, ownerId: Id<'users'>, cursor: string | null, numItems: number) {
  return await ctx.db
    .query('assets')
    .withIndex('by_owner_deleted', (q) => q.eq('owner_id', ownerId).eq('is_deleted', false))
    .paginate({ cursor, numItems });
}
