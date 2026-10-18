import type { Triggers } from 'convex-helpers/server/triggers';

import { parseBoardData } from '../../src/shared/assets/validation';
import type { DataModel, Doc, Id } from '../_generated/dataModel';
import type { MutationCtx } from '../_generated/server';
import { assetDisplayName } from './assetInput';
import { canonicalJson } from './canonicalJson';

/**
 * Eligibility and the listing fields are derived at the asset write, in the same transaction as the board.
 * Rerunning it on an unchanged board writes nothing.
 */
export async function syncBoardReadiness(ctx: MutationCtx, id: Id<'assets'>, asset: Doc<'assets'> | null) {
  const previous = await ctx.db
    .query('board_readiness')
    .withIndex('by_asset', (q) => q.eq('asset_id', id))
    .unique();
  if (asset?.type !== 'board') {
    if (previous) {
      await ctx.db.delete(previous._id);
    }
    return;
  }
  const fields = boardReadinessFields(asset);
  if (!previous) {
    await ctx.db.insert('board_readiness', fields);
    return;
  }
  const { _id, _creationTime, ...stored } = previous;
  if (canonicalJson(stored) !== canonicalJson(fields)) {
    await ctx.db.replace(_id, fields);
  }
}

function boardReadinessFields(asset: Doc<'assets'>) {
  return {
    asset_id: asset._id,
    usable: boardIsUsable(asset),
    name: assetDisplayName(asset),
    slug: asset.slug,
    owner_id: asset.owner_id,
    group_id: asset.group_id,
    created_at: asset.created_at,
    updated_at: asset.updated_at,
    is_deleted: asset.is_deleted,
    asset_creation_time: asset._creationTime,
  };
}

function boardIsUsable(asset: Doc<'assets'>) {
  if (asset.is_deleted) {
    return false;
  }
  try {
    parseBoardData(asset.data);
    return true;
  } catch {
    /* Invalid legacy definitions remain unavailable until the author repairs them. */
    return false;
  }
}

export function registerBoardReadinessTriggers(triggers: Triggers<DataModel, MutationCtx>) {
  triggers.register('assets', async (ctx, change) => {
    if (change.oldDoc?.type === 'board' || change.newDoc?.type === 'board') {
      await syncBoardReadiness(ctx, change.id, change.newDoc);
    }
  });
}
