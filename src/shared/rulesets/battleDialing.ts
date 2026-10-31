import { z } from 'zod';

/**
 * How a ruleset's battle wheels count troops and spice.
 * - `advanced`: spice dialing.
 * A troop fights at full strength when one spice supports it and at its unsupported strength (usually half) without;
 * the dial can show halves.
 * - `basic`: no spice in battle.
 * Every dialed troop fights at full strength.
 * - `gf92`: GF9 2.0.
 * Troops fight at full strength;
 * spice buys a flat bonus, +1 for 2 spice, +2 for 4 or +3 for 8, each only once the dial reaches that spice.
 * - `kiss`: KISS simple dialing.
 * Troops fight at full strength and the first 2 troops dialed are free;
 * each further troop costs 1 spice.
 * The dial never passes 20.
 * Factions whose troops need no spice to fight (Fremen) dial for free under every mechanism that charges spice.
 * A ruleset that has not chosen reads as `advanced`, how every game counted battles before rulesets chose.
 */
export const BATTLE_DIALING = ['advanced', 'basic', 'gf92', 'kiss'] as const;
export const battleDialingSchema = z.enum(BATTLE_DIALING);
export type BattleDialing = z.infer<typeof battleDialingSchema>;
export const DEFAULT_BATTLE_DIALING: BattleDialing = 'advanced';

/** Each mechanism's name and its rule in a few short lines, one thought each, for the ruleset editor and the Battle plan window's help. */
export const BATTLE_DIALING_OPTIONS: Readonly<Record<BattleDialing, { label: string; description: string }>> = {
  advanced: {
    label: 'Advanced',
    description: 'Spice dialing: a troop fights at full strength with 1 spice, at half strength without.',
  },
  basic: {
    label: 'Basic',
    description: 'No spice in battle: every troop dialed fights at full strength.',
  },
  gf92: {
    label: 'GF9 2.0',
    description:
      'Troops fight at full strength.\nSpice strength: 2 spice adds +1, 4 adds +2, 8 adds +3, once the dial reaches it.',
  },
  kiss: {
    label: 'KISS',
    description:
      'Troops fight at full strength.\nThe first 2 troops are free; each further troop costs 1 spice.\nThe dial stops at 20.',
  },
};

/** The ruleset's choice, or the default where a ruleset has not chosen. */
export function battleDialingOf(value: BattleDialing | null | undefined): BattleDialing {
  return value ?? DEFAULT_BATTLE_DIALING;
}
