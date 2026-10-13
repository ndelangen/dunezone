import { CARD_FRONT_PUBLICATION_REVISIONS } from '../assets/cardFrontPresets';
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
  /* Revision 6 captures the shared front preset for each Treachery category. */
  // 1: cards join the pipeline (wayfinder #516). Activating this is also the backfill for cards that predate it.
  [TREACHERY_CARD_ASSET_TYPE]: CARD_FRONT_PUBLICATION_REVISIONS[TREACHERY_CARD_ASSET_TYPE],
  // 1: spice cards join the pipeline with their editor (#1229).
  [SPICE_CARD_ASSET_TYPE]: 1,
  /* Revision 2 supports a movable decal window without changing existing layouts. */
  [CUSTOM_CARD_ASSET_TYPE]: 2,
  /* Revision 4 captures the shared Leader Skill front preset. */
  [LEADER_SKILL_ASSET_TYPE]: CARD_FRONT_PUBLICATION_REVISIONS[LEADER_SKILL_ASSET_TYPE],
  /* Revision 4 captures the shared Nexus front preset while retaining its faction symbol. */
  [NEXUS_CARD_ASSET_TYPE]: CARD_FRONT_PUBLICATION_REVISIONS[NEXUS_CARD_ASSET_TYPE],
  /* Revision 4 captures the shared Stronghold front preset and restores icon texture contrast. */
  [STRONGHOLD_CARD_ASSET_TYPE]: CARD_FRONT_PUBLICATION_REVISIONS[STRONGHOLD_CARD_ASSET_TYPE],
  /* Revision 4 captures the shared Storm front preset. */
  [STORM_CARD_ASSET_TYPE]: CARD_FRONT_PUBLICATION_REVISIONS[STORM_CARD_ASSET_TYPE],
  /* Revision 4 clips back emblems inside the gold disc beneath the frame. */
  [DECK_ASSET_TYPE]: 4,
  /* Revision 6 clips back emblems inside the gold disc beneath the frame; saved designs are kept. */
  'cardback-preset': 6,
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
