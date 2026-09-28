import type { z } from 'zod';

import type { TroopCombat } from './schema';

type CombatValues = z.infer<typeof TroopCombat>;
export type AuthoredFace = { name: string; capable?: boolean; combat?: CombatValues };
export type AuthoredTroop<Face extends AuthoredFace> = Face & { back?: Face };

type TroopSide = 'front' | 'back';

/**
 * One authored troop face as a battle plan reads it (#1062).
 * `combat` is null when the author has not entered the face's values;
 * nothing substitutes a default strength.
 */
export type TroopFaceCombat<Face extends AuthoredFace = AuthoredFace> = {
  id: string;
  troopIndex: number;
  side: TroopSide;
  face: Face;
  capable: boolean;
  combat: Required<CombatValues> | null;
};

/**
 * A face's identity within one faction definition.
 * The position is the identity the game's troop stacks already use (`troops:<faction>:<index>`), and a retained game reads a frozen definition, so catalogue edits and reorders never reach the face a plan names.
 */
function troopFaceId(troopIndex: number, side: TroopSide): string {
  return `troop-${troopIndex}-${side}`;
}

/* An editor draft can hold one strength while the author is still entering the other; that face has no values yet. */
export function completeCombat(combat: CombatValues | undefined): Required<CombatValues> | null {
  if (typeof combat?.strength !== 'number' || typeof combat.fundedStrength !== 'number') {
    return null;
  }
  return { ...combat, fundingCost: combat.fundingCost ?? 1 };
}

function resolve<Face extends AuthoredFace>(face: Face, troopIndex: number, side: TroopSide): TroopFaceCombat<Face> {
  return {
    id: troopFaceId(troopIndex, side),
    troopIndex,
    side,
    face,
    capable: face.capable ?? true,
    combat: completeCombat(face.combat),
  };
}

/**
 * Every distinct troop face in authored order.
 * An authored face without a capability flag can fight.
 * An authored back keeps its own flag and values, even when they are missing.
 * A troop without an authored back has one face: its reverse inherits the front's capability and values, so it plays as the front does and needs no section of its own.
 */
export function troopCombatFaces<Face extends AuthoredFace>(troops: readonly AuthoredTroop<Face>[]) {
  return troops.flatMap((troop, index) => [
    resolve<Face>(troop, index, 'front'),
    ...(troop.back ? [resolve(troop.back, index, 'back')] : []),
  ]);
}

/** A face that can fight but has no authored values: the gap authoring warns about and a capture names. */
export function lacksCombatValues(face: TroopFaceCombat): boolean {
  return face.capable && face.combat === null;
}
