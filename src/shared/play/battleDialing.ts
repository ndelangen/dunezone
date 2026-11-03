import type { BattleDialing } from '../rulesets/battleDialing';
import type { BattleFace, BattlePlanInput } from './battle';

/**
 * The arithmetic of the dialing mechanisms where every troop fights at full strength (Basic, GF9 2.0 and KISS).
 * Advanced spice dialing supports troops one by one and lives with the plan's support allocation instead.
 * The Worker and the Battle plan window both count with these, so the window shows what the room will accept.
 */

/** GF9 2.0 spice strength: spending the spice adds the bonus, once the dialed troop strength reaches that spice. */
const SPICE_STRENGTH_TIERS = [
  { spice: 2, bonus: 1 },
  { spice: 4, bonus: 2 },
  { spice: 8, bonus: 3 },
] as const;

/** KISS: the troops dialed for free before each further one costs a spice. */
export const KISS_FREE_TROOPS = 2;
/** KISS: the dial never shows more than this, elite troops included. */
export const KISS_DIAL_CAP = 20;

type Troops = BattlePlanInput['troops'];

/** Whether the mechanism counts every troop at full strength, with no per-troop support to choose. */
export function dialsFlat(dialing: BattleDialing) {
  return dialing !== 'advanced';
}

/** What one troop of this face costs to dial: its support cost, which is 0 for a troop that fights for free (Fremen Fedaykin and troops, say). */
function troopCost(faceId: string, faces: readonly BattleFace[]) {
  return faces.find((face) => face.id === faceId)?.supportCost ?? 0;
}

/**
 * Whether the dialed troops never pay spice to fight: there are some, and every one has a dial cost of 0.
 * Under GF9 2.0 that dial takes its spice strength for free.
 */
export function dialsFree(troops: Troops, faces: readonly BattleFace[]) {
  const dialed = troops.filter((troop) => troop.undialed + troop.dialed > 0);
  return dialed.length > 0 && dialed.every((troop) => troopCost(troop.faceId, faces) === 0);
}

/** The dialed strength with every troop at full strength: its supported strength, which needs no spice here. */
export function flatStrength(troops: Troops, faces: readonly BattleFace[]) {
  return troops.reduce((total, troop) => {
    const face = faces.find((candidate) => candidate.id === troop.faceId);
    return total + (troop.undialed + troop.dialed) * (face?.supportedStrength ?? 0);
  }, 0);
}

/** The spice amounts GF9 2.0 lets a plan spend on spice strength at this dial, none first. A dial of troops that cost nothing spends none. */
export function spiceStrengthChoices(dial: number, free: boolean): number[] {
  return free ? [0] : [0, ...SPICE_STRENGTH_TIERS.filter((tier) => dial >= tier.spice).map((tier) => tier.spice)];
}

/** The spice strength a GF9 2.0 plan adds: the tier its spice buys, or for a dial of troops that cost nothing the highest it reaches. */
export function spiceStrength(dial: number, spice: number, free: boolean) {
  const reached = SPICE_STRENGTH_TIERS.filter((tier) => dial >= tier.spice);
  if (free) {
    return reached.at(-1)?.bonus ?? 0;
  }
  return reached.find((tier) => tier.spice === spice)?.bonus ?? 0;
}

/**
 * The spice a KISS dial costs: each troop its own dial cost, except the first 2 troops, which are free.
 * The free ones are the dearest, so a troop that costs nothing never uses up a free place.
 */
export function kissSpice(troops: Troops, faces: readonly BattleFace[]) {
  /* Per face rather than per troop, dearest first, so a declaration of any size costs one pass over its faces. */
  const byCost = troops
    .map((troop) => ({ count: troop.undialed + troop.dialed, cost: troopCost(troop.faceId, faces) }))
    .sort((a, b) => b.cost - a.cost);
  let freePlaces = KISS_FREE_TROOPS;
  let spice = 0;
  for (const { count, cost } of byCost) {
    const free = Math.min(freePlaces, count);
    freePlaces -= free;
    spice += (count - free) * cost;
  }
  return spice;
}
