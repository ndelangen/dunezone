import type { Id } from '../_generated/dataModel';
import type { QueryCtx } from '../types';
import { assetDisplayName } from './assetInput';

/** Bounds one ruleset's slot contents. Slots are curated by hand, so this is a ceiling on nonsense rather than a paging limit. */
const RULESET_SLOT_LIMIT = 200;

/**
 * The assets a ruleset has slotted, by slot.
 *
 * A soft-deleted asset is filtered here rather than having its row removed, which is the same bargain `listPublicRulesetFactions` makes: the slot row survives, the slot presents empty, and undeleting the asset restores it.
 * Reads `by_ruleset` only.
 * Two readers: the ruleset detail page, and the capture a game makes of a ruleset's supply.
 */
export async function listRulesetAssetSlots(ctx: QueryCtx, rulesetId: Id<'rulesets'>) {
  const rows = await ctx.db
    .query('ruleset_asset_slots')
    .withIndex('by_ruleset', (q) => q.eq('ruleset_id', rulesetId))
    .take(RULESET_SLOT_LIMIT);

  const entries = [];
  for (const row of rows) {
    const asset = await ctx.db.get('assets', row.asset_id);
    if (asset && !asset.is_deleted) {
      entries.push({
        slot: row.slot,
        asset: {
          id: asset._id,
          type: asset.type,
          slug: asset.slug,
          name: assetDisplayName(asset),
        },
      });
    }
  }
  return entries;
}
