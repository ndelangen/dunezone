import { parseBoardData } from '../../src/shared/assets/validation';
import type { BoardCapture } from '../../src/shared/play/capture';
import type { Id } from '../_generated/dataModel';
import type { QueryCtx } from '../types';

/** One saved definition supplies both eligibility and the game capture. */
export async function rulesetBoard(ctx: QueryCtx, rulesetId: Id<'rulesets'>): Promise<BoardCapture | null> {
  const slot = await ctx.db
    .query('ruleset_asset_slots')
    .withIndex('by_ruleset_slot', (q) => q.eq('ruleset_id', rulesetId).eq('slot', 'board'))
    .first();
  const asset = slot ? await ctx.db.get('assets', slot.asset_id) : null;
  if (!asset || asset.is_deleted || asset.type !== 'board') {
    return null;
  }
  try {
    const parsed = parseBoardData(asset.data);
    return { asset: { id: asset._id, slug: asset.slug, name: parsed.name }, definition: parsed.board };
  } catch {
    /* Invalid legacy data cannot become a new game's board. */
    return null;
  }
}

/** Whether the ruleset's board slot holds a usable board, read from its small readiness row rather than the definition. */
export async function rulesetHasBoard(ctx: QueryCtx, rulesetId: Id<'rulesets'>) {
  const slot = await ctx.db
    .query('ruleset_asset_slots')
    .withIndex('by_ruleset_slot', (q) => q.eq('ruleset_id', rulesetId).eq('slot', 'board'))
    .first();
  if (!slot) {
    return false;
  }
  const readiness = await ctx.db
    .query('board_readiness')
    .withIndex('by_asset', (q) => q.eq('asset_id', slot.asset_id))
    .unique();
  return readiness?.usable ?? false;
}
