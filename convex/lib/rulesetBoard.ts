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
  return slot ? await boardCapture(ctx, slot.asset_id, cache) : null;
}

/** The second board a game on the two-board table captures; none when the slot is empty or its board is unusable. */
export async function rulesetSecondBoard(
  ctx: QueryCtx,
  rulesetId: Id<'rulesets'>,
  cache: BoardReadCache = new Map()
): Promise<BoardCapture | null> {
  const slot = await ctx.db
    .query('ruleset_asset_slots')
    .withIndex('by_ruleset_slot', (q) => q.eq('ruleset_id', rulesetId).eq('slot', 'secondBoard'))
    .first();
  return slot ? await boardCapture(ctx, slot.asset_id, cache) : null;
}

async function boardCapture(ctx: QueryCtx, assetId: Id<'assets'>, cache: BoardReadCache): Promise<BoardCapture | null> {
  if (cache.has(assetId)) {
    return cache.get(assetId)!;
  }
  const asset = await ctx.db.get('assets', assetId);
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
  cache.set(assetId, result);
  return result;
}

/** During the widen migration, unindexed legacy boards still use the authoritative read. */
export async function rulesetHasBoard(ctx: QueryCtx, rulesetId: Id<'rulesets'>, cache: BoardReadCache) {
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
  return readiness ? readiness.usable : Boolean(await rulesetBoard(ctx, rulesetId, cache));
}
