import { DECK_ASSET_TYPE, FACTION_SHEET_ASSET_TYPE, TREACHERY_CARD_ASSET_TYPE } from './publication';

/**
 * Increasing a number invalidates every eligible asset of that type.
 * It never selects a historical Renderer implementation.
 */
export const CHECKED_IN_RENDERER_REVISIONS = {
  // 8: vector train (wayfinder #294) — normalized spaces, unclipped halos, retuned decals.
  [FACTION_SHEET_ASSET_TYPE]: 8,
  // 1: cards join the pipeline (wayfinder #516). Activating this is also the backfill for cards that predate it.
  [TREACHERY_CARD_ASSET_TYPE]: 1,
  // 1: deck cardbacks join the pipeline (wayfinder #546). Activating this is also the backfill for decks that predate it.
  [DECK_ASSET_TYPE]: 1,
} as const;
