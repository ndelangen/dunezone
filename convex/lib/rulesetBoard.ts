import { parseBoardData } from '../../src/shared/assets/validation';
import type { BoardCapture } from '../../src/shared/play/capture';
import type { Id } from '../_generated/dataModel';
import type { QueryCtx } from '../types';

export type BoardReadCache = Map<Id<'assets'>, BoardCapture | null>;

/** One saved definition supplies both eligibility and the game capture. */
export async function rulesetBoard(
  ctx: QueryCtx,
  rulesetId: Id<'rulesets'>,
  cache: BoardReadCache = new Map()
): Promise<BoardCapture | null> {
  const slot = await ctx.db
    .query('ruleset_asset_slots')
    .withIndex('by_ruleset_slot', (q) => q.eq('ruleset_id', rulesetId).eq('slot', 'board'))
    .first();
  if (slot && cache.has(slot.asset_id)) {
    return cache.get(slot.asset_id)!;
  }
  const asset = slot ? await ctx.db.get('assets', slot.asset_id) : null;
  if (!asset || asset.is_deleted || asset.type !== 'board') {
    return null;
  }
  let result: BoardCapture | null = null;
  try {
    const parsed = parseBoardData(asset.data);
    result = { asset: { id: asset._id, slug: asset.slug, name: parsed.name }, definition: parsed.board };
  } catch {
    /* Invalid legacy data cannot become a new game's board. */
  }
  cache.set(asset._id, result);
  return result;
}
