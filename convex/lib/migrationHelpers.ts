import { withSupportNames } from '../../src/shared/factions/schema';

/* Helpers the data migrations in `convex/migrations.ts` share; the migrations themselves stay there so their ids stay put. */

type StoredTroopFace = { combat?: unknown; back?: StoredTroopFace };

function hasLegacySupportNames(combat: unknown): boolean {
  return typeof combat === 'object' && combat !== null && ('fundedStrength' in combat || 'fundingCost' in combat);
}

export function troopHasLegacySupportNames(troop: unknown): boolean {
  const face = troop as StoredTroopFace | null;
  return hasLegacySupportNames(face?.combat) || hasLegacySupportNames(face?.back?.combat);
}

/** A face with its `combat` renamed, if it has one; every other field stays as stored. */
function faceWithSupportNames(face: StoredTroopFace): StoredTroopFace {
  return face.combat === undefined ? face : { ...face, combat: withSupportNames(face.combat) };
}

/* Only `combat` is rewritten, on the front and on an authored back; every other troop field stays as stored. */
export function troopWithSupportNames(troop: unknown): unknown {
  if (typeof troop !== 'object' || troop === null) {
    return troop;
  }
  const face = faceWithSupportNames(troop as StoredTroopFace);
  const back = face.back && typeof face.back === 'object' ? faceWithSupportNames(face.back) : face.back;
  return back === face.back ? face : { ...face, back };
}
