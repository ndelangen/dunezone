import { isBattleLeader } from '@shared/play/battle';
import type { TablePiece } from '@shared/play/model';

/** How a hand sorts its pieces for reading: Treachery cards, then leaders, then each other card back by the word printed on it, then everything else. */
export type HandGroup = Readonly<{ key: string; label: string; pieces: TablePiece[] }>;

export function handGroups(pieces: readonly TablePiece[]): HandGroup[] {
  const groups = new Map<string, { label: string; pieces: TablePiece[] }>();
  const add = (key: string, label: string, piece: TablePiece) => {
    const group = groups.get(key) ?? { label, pieces: [] };
    group.pieces.push(piece);
    groups.set(key, group);
  };
  for (const piece of pieces) {
    if (isBattleLeader(piece)) {
      add('leaders', 'Leaders', piece);
    } else if (piece.kind === 'card') {
      const back = piece.items[0]?.artwork?.backName ?? 'Cards';
      add(`card:${back}`, back, piece);
    } else {
      add('other', 'Tokens', piece);
    }
  }
  const RANK: Record<string, number> = { 'card:Treachery': 0, leaders: 1, other: 3 };
  const order = (key: string) => RANK[key] ?? 2;
  return [...groups.entries()]
    .sort(([a], [b]) => order(a) - order(b) || a.localeCompare(b))
    .map(([key, group]) => ({ key, ...group }));
}
