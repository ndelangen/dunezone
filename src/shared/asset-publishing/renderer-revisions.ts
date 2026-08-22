import {
  DECK_ASSET_TYPE,
  FACTION_SHEET_ASSET_TYPE,
  RECTANGLE_TOKEN_ASSET_TYPE,
  TREACHERY_CARD_ASSET_TYPE,
} from './publication';

/**
 * Increasing a number invalidates every eligible asset of that type.
 * It never selects a historical Renderer implementation.
 */
export const CHECKED_IN_RENDERER_REVISIONS = {
  // 8: vector train (wayfinder #294), normalized spaces, unclipped halos, retuned decals.
  [FACTION_SHEET_ASSET_TYPE]: 8,
  // 1: cards join the pipeline (wayfinder #516). Activating this is also the backfill for cards that predate it.
  [TREACHERY_CARD_ASSET_TYPE]: 1,
  // 1: deck cardbacks join the pipeline (wayfinder #546). Activating this is also the backfill for decks that predate it.
  [DECK_ASSET_TYPE]: 1,
  /*
   * 1: token faces join the pipeline (wayfinder #547). Activating these is also the backfill for tokens that predate them.
   * One entry per shape rather than one per face, because both faces of a shape are drawn by one renderer, so bumping a front without its back is not a thing that can be meant.
   */
  'token-disc': 1,
  'token-tech': 1,
  'token-plate': 1,
  [RECTANGLE_TOKEN_ASSET_TYPE]: 1,
} as const;
