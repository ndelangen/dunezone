import type { TablePiece } from '@shared/play/model';
import type { GameSnapshot } from '@shared/play/protocol';
import { rosterFactionIds } from '@shared/play/protocol';

import { playingSnapshot } from './product.stories.fixture';

/* Every card of a piece marked as peeked at by these factions, in the order they peeked. */
function peekedBy(piece: TablePiece, factionIds: readonly string[]): TablePiece {
  return { ...piece, items: piece.items.map((item) => ({ ...item, peekedBy: [...factionIds] })) };
}

/* The table with `marks` applied to the pieces they name, each taking the snapshot's revision. */
function withPeeks(snapshot: GameSnapshot, marks: Readonly<Record<string, readonly string[]>>): GameSnapshot {
  const pieces = snapshot.table.pieces.map((piece) => (marks[piece.id] ? peekedBy(piece, marks[piece.id]) : piece));
  return { ...snapshot, table: { ...snapshot.table, pieces } };
}

/** The loose Treachery card turned face down, so it has something to peek at. */
function looseCardFaceDown(snapshot: GameSnapshot): GameSnapshot {
  const pieces = snapshot.table.pieces.map((piece) =>
    piece.id === 'treachery-card-loose'
      ? { ...piece, items: piece.items.map((item) => ({ ...item, faceUp: false })) }
      : piece
  );
  return { ...snapshot, table: { ...snapshot.table, pieces } };
}

/** Mid-play: seat 1's faction looked through the Treachery deck, and seat 3's faction peeked at the loose Treachery card. */
export function onePeekerSnapshot(snapshot = playingSnapshot()): GameSnapshot {
  const [first, , third] = rosterFactionIds(snapshot.roster);
  return withPeeks(looseCardFaceDown(snapshot), {
    'treachery-deck': [first!],
    'treachery-card-loose': [third!],
  });
}

/** Mid-play: four factions looked through the Treachery deck, two peeked at the loose card, and every faction looked through the Traitor deck. */
export function manyPeekersSnapshot(snapshot = playingSnapshot()): GameSnapshot {
  const factions = rosterFactionIds(snapshot.roster);
  return withPeeks(looseCardFaceDown(snapshot), {
    'treachery-deck': factions.slice(0, 4),
    'treachery-card-loose': factions.slice(1, 3),
    'remaining-traitors': factions,
  });
}
