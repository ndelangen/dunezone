import type { Triggers } from 'convex-helpers/server/triggers';

import { parseBoardData } from '../../src/shared/assets/validation';
import type { DataModel, Doc, Id } from '../_generated/dataModel';
import type { MutationCtx } from '../_generated/server';

/** Eligibility is derived at the asset write, in the same transaction as the board. */
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
  let usable = false;
  if (!asset.is_deleted) {
    try {
      parseBoardData(asset.data);
      usable = true;
    } catch {
      /* Invalid legacy definitions remain unavailable until the author repairs them. */
    }
  }
  if (previous) {
    if (previous.usable !== usable) {
      await ctx.db.patch(previous._id, { usable });
    }
  } else {
    await ctx.db.insert('board_readiness', { asset_id: id, usable });
  }
}

export function registerBoardReadinessTriggers(triggers: Triggers<DataModel, MutationCtx>) {
  triggers.register('assets', async (ctx, change) => {
    if (change.oldDoc?.type === 'board' || change.newDoc?.type === 'board') {
      await syncBoardReadiness(ctx, change.id, change.newDoc);
    }
  });
}
