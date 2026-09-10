import {
  DECK_ASSET_TYPE,
  FACTION_SHEET_ASSET_TYPE,
  RECTANGLE_TOKEN_ASSET_TYPE,
  RULEBOOK_FIRST_PAGE_ASSET_TYPE,
  TREACHERY_CARD_ASSET_TYPE,
} from './publication';

/**
 * Increasing a number invalidates every eligible asset of that type.
 * It never selects a historical Renderer implementation.
 */
export const CHECKED_IN_RENDERER_REVISIONS = {
  /* Revision 2 records measured part metadata for existing Leader publications. */
  'faction-leader': 2,
  // 9: formatted text replaces Markdown while setup and revival stay inline (wayfinder #669).
  [FACTION_SHEET_ASSET_TYPE]: 9,
  /* Revision 2 regenerates Card image-and-geometry envelopes. */
  // 1: cards join the pipeline (wayfinder #516). Activating this is also the backfill for cards that predate it.
  [TREACHERY_CARD_ASSET_TYPE]: 2,
  // 1: deck cardbacks join the pipeline (wayfinder #546). Activating this is also the backfill for decks that predate it.
  [DECK_ASSET_TYPE]: 1,
  /*
   * 1: token faces join the pipeline (wayfinder #547). Activating these is also the backfill for tokens that predate them.
   * One entry per shape rather than one per face, because both faces of a shape are drawn by one renderer, so bumping a front without its back is not a thing that can be meant.
   */
  /* Revision 2 regenerates both faces with their measured parts. */
  'token-disc': 2,
  'token-tech': 2,
  'token-plate': 2,
  [RECTANGLE_TOKEN_ASSET_TYPE]: 2,
  // 1: immutable Edition first pages join the publication pipeline (wayfinder #935).
  [RULEBOOK_FIRST_PAGE_ASSET_TYPE]: 1,
} as const;
