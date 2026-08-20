import {
  DECK_ASSET_TYPE,
  FACTION_SHEET_ASSET_TYPE,
  factionSheetAssetDataSchema,
  parsePublicationAssetData,
  TREACHERY_CARD_ASSET_TYPE,
} from '../../src/shared/asset-publishing/publication';
import type { FactionSheetAssetData } from '../../src/shared/asset-publishing/publication';
import type { PublicationAssetType } from '../../src/shared/asset-publishing/publicationTargets';
import { DeckAsset } from '../../src/shared/assets/schema';
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
    assetType: PublicationAssetType;
    assetId: string;
    assetData: unknown;
    now?: number;
  }
) {
  const assetData = parsePublicationAssetData(input.assetType, input.assetData);
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

/**
 * Schedules an Asset's own publication, if its type has one yet.
 *
 * A type with no branch here publishes nothing at all, which is deliberate rather than an omission: decks publish their Cardback and tokens publish per face, and both need a capture renderer before a job would have anything to draw.
 * Returning null keeps a save working for those types instead of failing it over work that has not landed.
 *
 * Known and accepted for cards: `about` lives inside `data` and reaches no face, so an About-only edit schedules a capture that produces byte-identical output, and the fresh cache token cold-caches it (wayfinder #521).
 * The fix, if that ever costs enough to matter, is to compare `data` minus `about` here rather than enqueueing unconditionally.
 * Not done now, because a treachery card has one publication and About edits are rare.
 * Decks do not have the problem: their payload is the Cardback alone, so a rename or an About edit still enqueues but cannot change what the capture draws.
 */
export async function enqueueAssetPublication(
  ctx: MutationCtx,
  asset: {
    _id: Id<'assets'>;
    type: string;
    slug: string;
    data: unknown;
  },
  now?: number
) {
  switch (asset.type) {
    case TREACHERY_CARD_ASSET_TYPE:
      return await enqueuePublicationJob(ctx, {
        assetType: TREACHERY_CARD_ASSET_TYPE,
        assetId: asset._id,
        assetData: { assetId: asset._id, slug: asset.slug, card: asset.data },
        now,
      });
    /*
     * The Cardback is lifted out of the stored deck here rather than carried whole, so the payload is exactly the publication's input.
     * `parseAssetDataForWrite` already validated this row on the way in, so the parse is a total function rather than a guard.
     */
    case DECK_ASSET_TYPE:
      return await enqueuePublicationJob(ctx, {
        assetType: DECK_ASSET_TYPE,
        assetId: asset._id,
        assetData: { assetId: asset._id, slug: asset.slug, cardback: DeckAsset.parse(asset.data).cardback },
        now,
      });
    default:
      return null;
  }
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
