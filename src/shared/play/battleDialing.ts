import type { BattleDialing } from '../rulesets/battleDialing';
import type { BattleFace, BattlePlanInput } from './battle';

/**
 * The arithmetic of the dialing mechanisms where every troop fights at full strength (Basic, GF9 2.0 and KISS).
 * Advanced spice dialing supports troops one by one and lives with the plan's support allocation instead.
 * The Worker and the Battle plan window both count with these, so the window shows what the room will accept.
 */

/** GF9 2.0 spice strength: spending the spice adds the bonus, once the dialed troop strength reaches that spice. */
export const SPICE_STRENGTH_TIERS = [
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

/**
 * Whether the faction's troops never pay spice to fight: every face that fights costs nothing to support (Fremen).
 * Under GF9 2.0 that is the Battle Edge, free spice strength;
 * under KISS, free dialing of any number of troops.
 */
export function dialsFree(faces: readonly BattleFace[]) {
  const capable = faces.filter((face) => face.capable);
  return capable.length > 0 && capable.every((face) => face.supportCost === 0);
}

export function troopCount(troops: Troops) {
  return troops.reduce((total, troop) => total + troop.undialed + troop.dialed, 0);
}

/** The dialed strength with every troop at full strength: its supported strength, which needs no spice here. */
export function flatStrength(troops: Troops, faces: readonly BattleFace[]) {
  return troops.reduce((total, troop) => {
    const face = faces.find((candidate) => candidate.id === troop.faceId);
    return total + (troop.undialed + troop.dialed) * (face?.supportedStrength ?? 0);
  }, 0);
}

/** The spice amounts GF9 2.0 lets a plan spend on spice strength at this dial, none first. A free faction spends none. */
export function spiceStrengthChoices(dial: number, free: boolean): number[] {
  return free ? [0] : [0, ...SPICE_STRENGTH_TIERS.filter((tier) => dial >= tier.spice).map((tier) => tier.spice)];
}

/** The spice strength a GF9 2.0 plan adds: the tier its spice buys, or for a free faction the highest its dial reaches. */
export function spiceStrength(dial: number, spice: number, free: boolean) {
  const reached = SPICE_STRENGTH_TIERS.filter((tier) => dial >= tier.spice);
  if (free) {
    return reached.at(-1)?.bonus ?? 0;
  }
  return reached.find((tier) => tier.spice === spice)?.bonus ?? 0;
}

/** The spice a KISS dial costs: one for each troop past the free ones, none for a free faction. */
export function kissSpice(troops: number, free: boolean) {
  return free ? 0 : Math.max(0, troops - KISS_FREE_TROOPS);
}
