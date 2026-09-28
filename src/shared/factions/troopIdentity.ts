import { z } from 'zod';

import { assertUniqueIds, createComponentId, uniqueIdAllocator } from './componentIds';

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

export const createFactionTroopId = createComponentId;

export function factionTroopsHaveIds(data: TroopRoster): boolean {
  return data.troops.every((troop) => troop.troopId !== undefined);
}

export function assertUniqueFactionTroopIds(data: TroopRoster): void {
  assertUniqueIds(
    data.troops.map((troop) => troop.troopId),
    'Faction troop IDs must be unique within the faction.'
  );
}

/** Assign missing identities once, preserving identified troops through round trips. */
export function ensureFactionTroopIds<T extends TroopRoster>(data: T): IdentifiedTroops<T> {
  assertUniqueFactionTroopIds(data);
  const allocate = uniqueIdAllocator(
    data.troops.map((troop) => troop.troopId),
    'Could not allocate a unique faction troop identity.'
  );
  return { ...data, troops: data.troops.map((troop) => ({ ...troop, troopId: troop.troopId || allocate() })) };
}

/** Copying another faction replaces its troops, even when names or images happen to match. */
export function renewFactionTroopIds<T extends TroopRoster>(data: T): IdentifiedTroops<T> {
  return ensureFactionTroopIds({
    ...data,
    troops: data.troops.map(({ troopId: _troopId, ...troop }) => troop),
  }) as IdentifiedTroops<T>;
}
