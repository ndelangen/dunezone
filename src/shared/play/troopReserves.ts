import type { TablePiece, Vector3Tuple } from './model';
import type { TableRoster } from './schema';
import { factionSupplyLayout, seatAngleOf } from './setupLayout';

/** One troop kind's reserve: the stack key setup dealt it under and the spot setup laid it out on. */
export type TroopReserveSpot = Readonly<{ stackKey: string; position: Vector3Tuple }>;

const TROOP_RESERVE_KEY = /^troops:([^:]+):/;

/** The faction a troop stack was dealt to, read off its stack key; undefined for anything that is not a dealt troop. */
export function troopFactionOf(piece: Pick<TablePiece, 'kind' | 'stackKey'> | null | undefined) {
  return piece?.kind === 'force' ? TROOP_RESERVE_KEY.exec(piece.stackKey ?? '')?.[1] : undefined;
}

/**
 * The troop kinds a faction was dealt, in the order setup laid them out.
 * `dealt` is that order, read from the faction's capture.
 * Without it the kinds stand in the order the table first lists them, which is the order setup dealt them in while each reserve keeps a pile;
 * a kind on the table the capture does not name follows the dealt ones.
 */
export function troopReserveKeys(pieces: readonly TablePiece[], factionId: string, dealt: readonly string[] = []) {
  const onTable = new Set(pieces.flatMap((piece) => (troopFactionOf(piece) === factionId ? [piece.stackKey!] : [])));
  return [...new Set([...dealt, ...onTable])];
}

/**
 * Where each of a faction's troop reserves stands, as setup laid them out behind its seat, in the order of `keys`.
 * Undefined for a faction with no seat.
 */
export function troopReserveSpots(
  roster: TableRoster | undefined,
  factionId: string,
  keys: readonly string[]
): TroopReserveSpot[] | undefined {
  const angle = seatAngleOf(roster, factionId);
  if (angle === undefined || keys.length === 0) {
    return undefined;
  }
  const { reserves } = factionSupplyLayout(angle, keys.length);
  return keys.map((stackKey, index) => ({ stackKey, position: reserves[index]! }));
}
