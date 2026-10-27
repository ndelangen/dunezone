import { ASSET_TYPES } from '@shared/assets/types';
import { isSpawnType, SPAWN_TYPES } from '@shared/play/captureTypes';
import type { SpawnType } from '@shared/play/captureTypes';
import type { TablePiece } from '@shared/play/model';

/**
 * One shelf of the shared table inventory: every piece of one catalogue type, which stays on its shelf however many there are.
 * The Bundles shelf only adds: a bundle's tokens land on their own types' shelves, so it never holds a piece.
 */
export type InventoryRow = Readonly<{
  key: string;
  label: string;
  pieces: TablePiece[];
  /** How many items the shelf holds, counting every item of every stack. */
  count: number;
  /** The catalogue type that adds to this shelf; null for the pieces of no spawnable type. */
  spawnType: SpawnType | null;
  /** Whether pieces sit on the shelf, false for one that only adds to others. */
  holdsPieces: boolean;
}>;

/* A card came in a deck; a token is of its own type. A bundle's tokens land on their own types' shelves. */
function spawnTypeOf(piece: TablePiece): SpawnType | null {
  if (piece.kind === 'card') {
    return 'deck';
  }
  const type = piece.items[0]?.artwork?.type;
  return type && isSpawnType(type) ? type : null;
}

/* A shelf as the window lists it. */
function shelf(key: string, label: string, pieces: TablePiece[], spawnType: SpawnType | null): InventoryRow {
  return {
    key,
    label,
    pieces,
    count: pieces.reduce((count, piece) => count + piece.items.length, 0),
    spawnType,
    holdsPieces: spawnType !== 'bundle',
  };
}

/**
 * The shared table inventory as shelves: one for every type the catalogue can add, in the catalogue's order, each kept when it is empty so its own + can add the first;
 * then any pieces of no spawnable type.
 */
export function inventoryRows(pieces: readonly TablePiece[]): InventoryRow[] {
  const byType = new Map<SpawnType | null, TablePiece[]>();
  for (const piece of pieces) {
    const type = spawnTypeOf(piece);
    byType.set(type, [...(byType.get(type) ?? []), piece]);
  }
  const other = byType.get(null) ?? [];
  return [
    ...SPAWN_TYPES.map((type) => shelf(type, ASSET_TYPES[type].label, byType.get(type) ?? [], type)),
    ...(other.length ? [shelf('other', 'Other pieces', other, null)] : []),
  ];
}
