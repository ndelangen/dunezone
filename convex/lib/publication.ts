import { FACTION_SHEET_ASSET_TYPE, factionSheetAssetDataSchema } from '../../src/shared/asset-publishing/publication';
import type { FactionSheetAssetData } from '../../src/shared/asset-publishing/publication';
import type { Id } from '../_generated/dataModel';
import type { MutationCtx, QueryCtx } from '../_generated/server';

type PublicationReadCtx = Pick<QueryCtx, 'db'> | Pick<MutationCtx, 'db'>;

export function factionSheetAssetData(
  factionId: Id<'factions'>,
  slug: string,
  faction: unknown
): FactionSheetAssetData {
  return factionSheetAssetDataSchema.parse({
    factionId,
    slug,
    faction,
  });
}

export async function publicationJobsForAsset(ctx: PublicationReadCtx, assetType: string, assetId: string) {
  return await ctx.db
    .query('publication_jobs')
    .withIndex('by_asset_type_and_asset_id', (q) => q.eq('asset_type', assetType).eq('asset_id', assetId))
    .take(4);
}

/**
 * Uniform save/scan enqueue behavior.
 * Pending work is coalesced, failed work is replaced, and an in-progress job may retain one pending successor.
 */
export async function enqueuePublicationJob(
  ctx: MutationCtx,
  input: {
    assetType: typeof FACTION_SHEET_ASSET_TYPE;
    assetId: string;
    assetData: FactionSheetAssetData;
    now?: number;
  }
) {
  const assetData = factionSheetAssetDataSchema.parse(input.assetData);
  const now = input.now ?? Date.now();
  const jobs = await publicationJobsForAsset(ctx, input.assetType, input.assetId);
  const pending = jobs.find((job) => job.status === 'pending');
  const errors = jobs.filter((job) => job.status === 'error');

  for (const job of errors) {
    await ctx.db.delete(job._id);
  }

  if (pending) {
    await ctx.db.patch(pending._id, {
      asset_data: assetData,
      attempt_counter: 0,
      expires_at: undefined,
      error: undefined,
      updated_at: now,
    });
    return pending._id;
  }

  return await ctx.db.insert('publication_jobs', {
    asset_type: input.assetType,
    asset_id: input.assetId,
    asset_data: assetData,
    status: 'pending',
    attempt_counter: 0,
    created_at: now,
    updated_at: now,
  });
}

export async function enqueueFactionSheetPublication(
  ctx: MutationCtx,
  faction: {
    _id: Id<'factions'>;
    slug: string;
    data: unknown;
  },
  now?: number
) {
  return await enqueuePublicationJob(ctx, {
    assetType: FACTION_SHEET_ASSET_TYPE,
    assetId: faction._id,
    assetData: factionSheetAssetData(faction._id, faction.slug, faction.data),
    now,
  });
}

export async function publicationSettings(ctx: PublicationReadCtx) {
  const settings = await ctx.db
    .query('admin_settings')
    .withIndex('by_key', (q) => q.eq('key', 'publication'))
    .take(2);
  if (settings.length > 1) {
    throw new Error('Publication invariant violated: duplicate admin settings');
  }
  return settings[0] ?? null;
}
