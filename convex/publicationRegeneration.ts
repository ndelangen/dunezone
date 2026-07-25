import { v } from 'convex/values';

import { FACTION_SHEET_ASSET_TYPE } from '../src/shared/asset-publishing/publication';
import { internal } from './_generated/api';
import { internalMutation } from './_generated/server';
import { enqueueFactionSheetPublication } from './lib/publication';

const REGENERATION_BATCH_SIZE = 50;

export const scan = internalMutation({
  args: {
    assetType: v.string(),
    cursor: v.union(v.string(), v.null()),
    scanned: v.number(),
    enqueued: v.number(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    if (args.assetType !== FACTION_SHEET_ASSET_TYPE) {
      throw new Error(`Unsupported Publication asset type: ${args.assetType}`);
    }
    if (args.cursor === null) {
      console.log(
        JSON.stringify({
          event: 'publication_regeneration_scan',
          assetType: args.assetType,
          result: 'started',
        })
      );
    }

    const page = await ctx.db
      .query('factions')
      .withIndex('by_deleted', (q) => q.eq('is_deleted', false))
      .paginate({ cursor: args.cursor, numItems: REGENERATION_BATCH_SIZE });
    for (const faction of page.page) {
      await enqueueFactionSheetPublication(ctx, faction);
    }

    const scanned = args.scanned + page.page.length;
    const enqueued = args.enqueued + page.page.length;
    if (!page.isDone) {
      await ctx.scheduler.runAfter(0, internal.publicationRegeneration.scan, {
        assetType: args.assetType,
        cursor: page.continueCursor,
        scanned,
        enqueued,
      });
    } else {
      console.log(
        JSON.stringify({
          event: 'publication_regeneration_scan',
          assetType: args.assetType,
          result: 'completed',
          scanned,
          enqueued,
        })
      );
    }
    return null;
  },
});
