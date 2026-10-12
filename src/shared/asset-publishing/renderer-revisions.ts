import {
  CUSTOM_CARD_ASSET_TYPE,
  LEADER_SKILL_ASSET_TYPE,
  NEXUS_CARD_ASSET_TYPE,
  STORM_CARD_ASSET_TYPE,
  DECK_ASSET_TYPE,
  FACTION_SHEET_ASSET_TYPE,
  RECTANGLE_TOKEN_ASSET_TYPE,
  RULEBOOK_FIRST_PAGE_ASSET_TYPE,
  SPICE_CARD_ASSET_TYPE,
  STRONGHOLD_CARD_ASSET_TYPE,
  TREACHERY_CARD_ASSET_TYPE,
} from './publication';

/**
 * Increasing a number invalidates every eligible asset of that type.
 * It never selects a historical Renderer implementation.
 */
export const CHECKED_IN_RENDERER_REVISIONS = {
  board: 1,
  /* Revision 2 records measured part metadata for existing Leader publications. */
  'faction-leader': 2,
  /* The first activation publishes tokens for existing factions; revision 2 adds the blocked `.back` face (#1228). */
  'faction-token': 2,
  /* The first activation publishes every identified troop's front, and its back where one is authored (#1228). */
  'faction-troop': 1,
  /* The first activations publish a traitor front per identified supporting leader, and one alliance front per faction (#1228). */
  'faction-traitor': 1,
  'faction-alliance': 1,
  // 9: formatted text replaces Markdown while setup and revival stay inline (wayfinder #669).
  [FACTION_SHEET_ASSET_TYPE]: 9,
  /* Revision 4 keeps authored symbols at their chosen size, even when moved within the disc. */
  // 1: cards join the pipeline (wayfinder #516). Activating this is also the backfill for cards that predate it.
  [TREACHERY_CARD_ASSET_TYPE]: 4,
  // 1: spice cards join the pipeline with their editor (#1229).
  [SPICE_CARD_ASSET_TYPE]: 1,
  [CUSTOM_CARD_ASSET_TYPE]: 1,
  /* Revision 2 fits illustrations to their painted bounds in the leader skill window. */
  [LEADER_SKILL_ASSET_TYPE]: 2,
  [NEXUS_CARD_ASSET_TYPE]: 1,
  /* Revision 2 uses the supplied palace emblem and supports original raster illustrations. */
  [STRONGHOLD_CARD_ASSET_TYPE]: 2,
  /* Revision 2 removes the extra symbol ring and matches the scanned movement and corner numeral. */
  [STORM_CARD_ASSET_TYPE]: 2,
  /* Revision 2 retains multicolor back emblems and supports the original Storm label size. */
  [DECK_ASSET_TYPE]: 2,
  /* Revision 4 updates the Stronghold emblem and original Storm back label; saved designs are kept. */
  'cardback-preset': 4,
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
