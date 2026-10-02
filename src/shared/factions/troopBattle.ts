import type { z } from 'zod';

import type { TroopBattle } from './schema';

type BattleValues = z.infer<typeof TroopBattle>;
export type AuthoredFace = { name: string; capable?: boolean; combat?: BattleValues };
export type AuthoredTroop<Face extends AuthoredFace> = Face & { back?: Face };

type TroopSide = 'front' | 'back';

/**
 * One authored troop face as a battle plan reads it (#1062).
 * `combat`, named after the stored key (the glossary term is battle), is null when the author has not entered the face's values;
 * nothing substitutes a default strength.
 */
export type TroopFaceBattle<Face extends AuthoredFace = AuthoredFace> = {
  id: string;
  troopIndex: number;
  side: TroopSide;
  face: Face;
  capable: boolean;
  combat: Required<BattleValues> | null;
};

/**
 * A face's identity within one faction definition.
 * The position indexes the frozen definition a retained game reads, so catalogue edits and reorders never reach the face a plan names.
 */
function troopFaceId(troopIndex: number, side: TroopSide): string {
  return `troop-${troopIndex}-${side}`;
}

/* An editor draft can hold one strength while the author is still entering the other; that face has no values yet. */
export function completeBattle(values: BattleValues | undefined): Required<BattleValues> | null {
  if (typeof values?.strength !== 'number' || typeof values.supportedStrength !== 'number') {
    return null;
  }
  return { ...values, supportCost: values.supportCost ?? 1 };
}

function resolve<Face extends AuthoredFace>(face: Face, troopIndex: number, side: TroopSide): TroopFaceBattle<Face> {
  return {
    id: troopFaceId(troopIndex, side),
    troopIndex,
    side,
    face,
    capable: face.capable ?? true,
    combat: completeBattle(face.combat),
  };
}

/**
 * Every distinct troop face in authored order.
 * An authored face without a capability flag can fight.
 * An authored back keeps its own flag and values, even when they are missing.
 * A troop without an authored back has one face: its reverse inherits the front's capability and values, so it plays as the front does and needs no section of its own.
 */
export function troopBattleFaces<Face extends AuthoredFace>(troops: readonly AuthoredTroop<Face>[]) {
  return troops.flatMap((troop, index) => [
    resolve<Face>(troop, index, 'front'),
    ...(troop.back ? [resolve(troop.back, index, 'back')] : []),
  ]);
}

/** A face that can fight but has no authored values: the gap authoring warns about and a capture names. */
export function lacksBattleValues(face: TroopFaceBattle): boolean {
  return face.capable && face.combat === null;
}
