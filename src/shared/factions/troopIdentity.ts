import { z } from 'zod';

import { createFactionMemberId } from './memberIdentity';

/**
 * Troop types keep their own identity (#1227), like leaders: it lives on the troop, so renames and reorders keep it, and a deleted then re-added troop gets a new one.
 * Names and positions never identify a troop.
 */
export const FactionTroopIdSchema = z.uuid();

type FactionTroop = { troopId?: string };
type TroopRoster = { troops: FactionTroop[] };
type IdentifiedTroops<T extends TroopRoster> = Omit<T, 'troops'> & {
  troops: Array<T['troops'][number] & { troopId: string }>;
};

export function createFactionTroopId(): string {
  return createFactionMemberId();
}

export function factionTroopsHaveIds(data: TroopRoster): boolean {
  return data.troops.every((troop) => troop.troopId !== undefined);
}

export function assertUniqueFactionTroopIds(data: TroopRoster): void {
  const seen = new Set<string>();
  for (const troop of data.troops) {
    if (troop.troopId === undefined) {
      continue;
    }
    if (seen.has(troop.troopId)) {
      throw new Error('Faction troop IDs must be unique within the faction.');
    }
    seen.add(troop.troopId);
  }
}

/** Assign missing identities once, preserving identified troops through round trips. */
export function ensureFactionTroopIds<T extends TroopRoster>(data: T): IdentifiedTroops<T> {
  assertUniqueFactionTroopIds(data);
  const seen = new Set(data.troops.flatMap((troop) => (troop.troopId ? [troop.troopId] : [])));
  const troops = data.troops.map((troop) => {
    if (troop.troopId) {
      return { ...troop, troopId: troop.troopId };
    }
    for (let attempt = 0; attempt < 128; attempt += 1) {
      const troopId = createFactionTroopId();
      if (!seen.has(troopId)) {
        seen.add(troopId);
        return { ...troop, troopId };
      }
    }
    throw new Error('Could not allocate a unique faction troop identity.');
  });
  return { ...data, troops };
}

/** Copying another faction replaces its troops, even when names or images happen to match. */
export function renewFactionTroopIds<T extends TroopRoster>(data: T): IdentifiedTroops<T> {
  return ensureFactionTroopIds({
    ...data,
    troops: data.troops.map(({ troopId: _troopId, ...troop }) => troop),
  }) as IdentifiedTroops<T>;
}
