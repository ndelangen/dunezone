import { v } from 'convex/values';

import {
  DECK_ASSET_TYPE,
  FACTION_SHEET_ASSET_TYPE,
  RECTANGLE_TOKEN_ASSET_TYPE,
  RULEBOOK_FIRST_PAGE_ASSET_TYPE,
  TREACHERY_CARD_ASSET_TYPE,
} from '../src/shared/asset-publishing/publication';
import { internal } from './_generated/api';
import { internalMutation } from './functions';
import { enqueueAssetPublication, enqueueFactionSheetPublication } from './lib/publication';
import { enqueueRulebookFirstPagePublication } from './lib/rulebookPublication';
import type { MutationCtx } from './types';

const REGENERATION_BATCH_SIZE = 50;

type ScanPage = { enqueued: number; scanned: number; isDone: boolean; continueCursor: string };

function scanResult(
  page: { page: readonly unknown[]; isDone: boolean; continueCursor: string },
  enqueued: number
): ScanPage {
  return {
    enqueued,
    scanned: page.page.length,
    isDone: page.isDone,
    continueCursor: page.continueCursor,
  };
}

async function scanFactionSheets(ctx: MutationCtx, cursor: string | null) {
  const page = await ctx.db
    .query('factions')
    .withIndex('by_deleted', (q) => q.eq('is_deleted', false))
    .paginate({ cursor, numItems: REGENERATION_BATCH_SIZE });
  for (const faction of page.page) {
    await enqueueFactionSheetPublication(ctx, faction);
  }
  return scanResult(page, page.page.length);
}

async function scanAssets(ctx: MutationCtx, assetType: string, cursor: string | null) {
  const page = await ctx.db
    .query('assets')
    .withIndex('by_type_deleted', (q) => q.eq('type', assetType).eq('is_deleted', false))
    .paginate({ cursor, numItems: REGENERATION_BATCH_SIZE });
  for (const asset of page.page) {
    await enqueueAssetPublication(ctx, asset);
  }
  return scanResult(page, page.page.length);
}

async function scanRulebookFirstPages(ctx: MutationCtx, cursor: string | null) {
  const page = await ctx.db
    .query('rulebooks')
    .withIndex('by_is_deleted', (q) => q.eq('is_deleted', false))
    .paginate({ cursor, numItems: REGENERATION_BATCH_SIZE });
  let enqueued = 0;
  for (const rulebook of page.page) {
    const edition = await ctx.db
      .query('rulebook_editions')
      .withIndex('by_rulebook_and_edition_number', (q) =>
        q.eq('rulebook_id', rulebook._id).eq('edition_number', rulebook.current_edition_number)
      )
      .unique();
    if (edition) {
      const result = await enqueueRulebookFirstPagePublication(ctx, edition);
      if (result.enqueued) {
        enqueued += 1;
      } else {
        /*
         * One unrenderable Edition must not take the scan down with it.
         * The batch is one transaction and the cursor continuation is scheduled after this loop, so a throw here would
         * roll back every enqueue in the page and silently end the backfill for every row after it.
         */
        console.warn(
          JSON.stringify({
            event: 'rulebook_first_page_skipped',
            rulebookId: rulebook._id,
            editionId: edition._id,
            reason: result.skipped,
          })
        );
      }
    }
  }
  return scanResult(page, enqueued);
}

/**
 * One page of the type's live rows, enqueued.
 *
 * Each branch owns its table and its index, because "every live thing of this type" is a different query per type and there is no shared row shape to abstract over.
 * Scanning is also the backfill: a type whose revision moves from absent to 1 enqueues every row that predates the capture path existing, so nothing needs a separate migration to get its first publication.
 */
async function scanPage(ctx: MutationCtx, assetType: string, cursor: string | null): Promise<ScanPage> {
  switch (assetType) {
    case FACTION_SHEET_ASSET_TYPE:
      return await scanFactionSheets(ctx, cursor);
    /*
     * Both asset types scan identically, because the branch reads `assetType` rather than a literal and every publishable Asset lives in one table under its own type.
     * A new publishable Asset type joins this list rather than copying the body.
     */
    case TREACHERY_CARD_ASSET_TYPE:
    case DECK_ASSET_TYPE:
    case 'token-disc':
    case 'token-tech':
    case 'token-plate':
    case RECTANGLE_TOKEN_ASSET_TYPE:
      return await scanAssets(ctx, assetType, cursor);
    case RULEBOOK_FIRST_PAGE_ASSET_TYPE:
      return await scanRulebookFirstPages(ctx, cursor);
    default:
      throw new Error(`Unsupported Publication asset type: ${assetType}`);
  }
}

export const scan = internalMutation({
  args: {
    assetType: v.string(),
    cursor: v.union(v.string(), v.null()),
    scanned: v.number(),
    enqueued: v.number(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    if (args.cursor === null) {
      console.log(
        JSON.stringify({
          event: 'publication_regeneration_scan',
          assetType: args.assetType,
          result: 'started',
        })
      );
    }

    const page = await scanPage(ctx, args.assetType, args.cursor);

    const scanned = args.scanned + page.scanned;
    const enqueued = args.enqueued + page.enqueued;
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
