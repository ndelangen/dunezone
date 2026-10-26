/*
 * The catalogue types a game can bring to the table.
 * They live apart from inventory.ts and import nothing, because the faction schema reads them and so reaches the publisher's capture bundle:
 * anything this module imported would change Renderer identity with every Play edit and recapture every published sheet.
 */

export const SPAWN_TYPES = [
  'deck',
  'bundle',
  'token-disc',
  'token-leader',
  'token-tech',
  'token-plate',
  'token-pointer',
  'token-enhance',
] as const;
export type SpawnType = (typeof SPAWN_TYPES)[number];

export function isSpawnType(type: string): type is SpawnType {
  return (SPAWN_TYPES as readonly string[]).includes(type);
}

/**
 * Every type a game can capture: the spawnable types and single cards.
 * A single card is captured for setup (a faction's Extras) but not offered by the in-play spawn picker, where the newest list would fill with cards.
 * It wears the back of the deck that holds it.
 */
export const CAPTURE_TYPES = [
  'card-treachery',
  'card-spice',
  'card-custom',
  'card-leaderability',
  'card-storm',
  'card-stronghold',
  'card-homeworld',
  'card-nexus',
  ...SPAWN_TYPES,
] as const;
