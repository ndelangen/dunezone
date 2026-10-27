import { ASSET_TYPES, isAssetType } from '@shared/assets/types';
import type { TablePiece } from '@shared/play/model';
import { isTechToken } from '@shared/play/techToken';

/** One row of the shared table inventory: every piece of one type, which stays on its row however many there are. */
export type InventoryRow = Readonly<{
  key: string;
  label: string;
  pieces: TablePiece[];
  /** How many items the row holds, counting every item of every stack. */
  count: number;
  /** Whether the row holds tech tokens, which a player can draw from at random. */
  techTokens: boolean;
}>;

/* A card is grouped by the word printed on its back, as a hand groups it; a token by its asset type. */
function rowOf(piece: TablePiece): { key: string; label: string } {
  const artwork = piece.items[0]?.artwork;
  if (piece.kind === 'card') {
    const back = artwork?.backName ?? 'Cards';
    return { key: `card:${back}`, label: back };
  }
  const type = artwork?.type;
  return type && isAssetType(type)
    ? { key: `type:${type}`, label: ASSET_TYPES[type].label }
    : { key: 'other', label: 'Other pieces' };
}

const TECH_ROW = { key: 'type:token-tech', label: ASSET_TYPES['token-tech'].label };

/**
 * The shared table inventory as rows: cards by their back first, then tokens by their type, each in name order.
 * While the game has tech tokens, their row stays even once every one is drawn, so its draw stays in place, turned off.
 */
export function inventoryRows(pieces: readonly TablePiece[], techTokensInGame = false): InventoryRow[] {
  const rows = new Map<string, { label: string; pieces: TablePiece[] }>();
  if (techTokensInGame) {
    rows.set(TECH_ROW.key, { label: TECH_ROW.label, pieces: [] });
  }
  for (const piece of pieces) {
    const { key, label } = rowOf(piece);
    const row = rows.get(key) ?? { label, pieces: [] };
    row.pieces.push(piece);
    rows.set(key, row);
  }
  const rank = (key: string) => (key.startsWith('card:') ? 0 : key === 'other' ? 2 : 1);
  return [...rows.entries()]
    .sort(([a, x], [b, y]) => rank(a) - rank(b) || x.label.localeCompare(y.label))
    .map(([key, row]) => ({
      key,
      label: row.label,
      pieces: row.pieces,
      count: row.pieces.reduce((count, piece) => count + piece.items.length, 0),
      techTokens: key === TECH_ROW.key || row.pieces.some(isTechToken),
    }));
}
