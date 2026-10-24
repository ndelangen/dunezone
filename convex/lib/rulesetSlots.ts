import { RULESET_ASSET_SLOTS } from '../../src/shared/rulesets/assetSlots';
import type { Id } from '../_generated/dataModel';
import type { QueryCtx } from '../types';
import { assetDisplayName } from './assetInput';
import { readBoardListing } from './boardListing';

/** Bounds one many-asset slot's contents. The many-asset slots are curated by hand, so this is a ceiling on nonsense rather than a paging limit. */
export const SLOT_CONTENTS_LIMIT = 100;

/* Every slot at its capacity, so a full ruleset's newest row is still read. */
const RULESET_SLOT_LIMIT = Object.values(RULESET_ASSET_SLOTS).reduce(
  (total, rule) => total + (rule.single ? 1 : SLOT_CONTENTS_LIMIT),
  0
);

/**
 * The assets a ruleset has slotted, by slot.
 *
 * A soft-deleted asset is filtered here rather than having its row removed, which is the same bargain `listPublicRulesetFactions` makes: the slot row survives, the slot presents empty, and undeleting the asset restores it.
 * Reads `by_ruleset` only.
 * Read by the capture a game makes of a ruleset's supply;
 * the ruleset detail page uses `readRulesetAssetSlots`, which includes its publication fields.
 */
export async function listRulesetAssetSlots(ctx: QueryCtx, rulesetId: Id<'rulesets'>, options: SlotReadOptions = {}) {
  return (await readRulesetAssetSlots(ctx, rulesetId, options)).map(({ slot, asset }) => ({ slot, asset }));
}

/** The slot entries and their presentation fields, with board geometry excluded when its summary is available. */
export async function readRulesetAssetSlots(
  ctx: QueryCtx,
  rulesetId: Id<'rulesets'>,
  { skipBoard = false }: SlotReadOptions = {}
) {
  const rows = await ctx.db
    .query('ruleset_asset_slots')
    .withIndex('by_ruleset', (q) => q.eq('ruleset_id', rulesetId))
    .take(RULESET_SLOT_LIMIT);

  const entries = [];
  for (const row of rows) {
    /* A board row is the whole board definition, hundreds of kilobytes; a caller that resolves the board its own way skips it. */
    if (skipBoard && row.slot === 'board') {
      continue;
    }
    const asset =
      row.slot === 'board' ? await readBoardListing(ctx, row.asset_id) : await ctx.db.get('assets', row.asset_id);
    if (asset && !asset.is_deleted) {
      entries.push({
        slot: row.slot,
        asset: {
          id: asset._id,
          type: asset.type,
          slug: asset.slug,
          name: assetDisplayName(asset),
        },
        doc: asset,
      });
    }
  }
  return entries;
}

type SlotReadOptions = { skipBoard?: boolean };
