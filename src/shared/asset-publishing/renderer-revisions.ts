import { CARD_FRONT_PUBLICATION_REVISIONS } from '../assets/cardFrontPresets';
import { SPICE_BOARD_REVISION } from '../assets/schema';
import {
  CUSTOM_CARD_ASSET_TYPE,
  LEADER_SKILL_ASSET_TYPE,
  NEXUS_CARD_ASSET_TYPE,
  HOMEWORLD_CARD_ASSET_TYPE,
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
  /* Revision 2 fits complete Traitor titles, owner subtitles and Alliance titles. */
  'faction-traitor': 2,
  'faction-alliance': 2,
  // 9: formatted text replaces Markdown while setup and revival stay inline (wayfinder #669).
  // 10: the PDF is titled after its faction rather than the capture page, since search engines show that title.
  /* Revision 11 uses the faction's section name, defaulting to Faction Special Karama (#2271). */
  [FACTION_SHEET_ASSET_TYPE]: 11,
  /* The next revisions settle complete card titles against their loaded fonts before capture. */
  // 1: cards join the pipeline (wayfinder #516). Activating this is also the backfill for cards that predate it.
  [TREACHERY_CARD_ASSET_TYPE]: CARD_FRONT_PUBLICATION_REVISIONS[TREACHERY_CARD_ASSET_TYPE] + 1,
  // 1: spice cards join the pipeline with their editor (#1229).
  /* Revision 3 retains linked boards and fits complete Spice titles. */
  [SPICE_CARD_ASSET_TYPE]: SPICE_BOARD_REVISION + 1,
  /* Revision 3 retains the decal window and fits complete Custom Card titles. */
  [CUSTOM_CARD_ASSET_TYPE]: 3,
  /* Revision 4 captures the shared Leader Skill front preset. */
  [LEADER_SKILL_ASSET_TYPE]: CARD_FRONT_PUBLICATION_REVISIONS[LEADER_SKILL_ASSET_TYPE] + 1,
  /* Revision 4 captures the shared Nexus front preset while retaining its faction symbol. */
  [HOMEWORLD_CARD_ASSET_TYPE]: CARD_FRONT_PUBLICATION_REVISIONS[HOMEWORLD_CARD_ASSET_TYPE] + 1,
  [NEXUS_CARD_ASSET_TYPE]: CARD_FRONT_PUBLICATION_REVISIONS[NEXUS_CARD_ASSET_TYPE] + 1,
  /* Revision 4 captures the shared Stronghold front preset and restores icon texture contrast. */
  [STRONGHOLD_CARD_ASSET_TYPE]: CARD_FRONT_PUBLICATION_REVISIONS[STRONGHOLD_CARD_ASSET_TYPE] + 1,
  /* Revision 4 captures the shared Storm front preset. */
  [STORM_CARD_ASSET_TYPE]: CARD_FRONT_PUBLICATION_REVISIONS[STORM_CARD_ASSET_TYPE] + 1,
  /* Revision 5 retains clipped back emblems and fits complete back labels. */
  [DECK_ASSET_TYPE]: 5,
  /* Revision 7 fits complete back labels while keeping saved designs. */
  'cardback-preset': 7,
  /*
   * 1: token faces join the pipeline (wayfinder #547). Activating these is also the backfill for tokens that predate them.
   * One entry per shape rather than one per face, because both faces of a shape are drawn by one renderer, so bumping a front without its back is not a thing that can be meant.
   */
  /* Revision 2 regenerates both faces with their measured parts. */
  'token-disc': 2,
  'token-tech': 2,
  'token-plate': 2,
  'token-pointer': 2,
  [RECTANGLE_TOKEN_ASSET_TYPE]: 2,
  // 1: immutable Edition first pages join the publication pipeline (wayfinder #935).
  [RULEBOOK_FIRST_PAGE_ASSET_TYPE]: 1,
} as const;
