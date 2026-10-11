import type { TablePiece } from '@shared/play/model';
import { useMemo, useRef } from 'react';

type Artwork = NonNullable<TablePiece['items'][number]['artwork']>;

/** The piece with each card's known artwork put back where a hidden copy left its front out. */
export function withKnownFronts(piece: TablePiece, fronts: ReadonlyMap<string, Artwork>): TablePiece {
  const knownFront = (item: TablePiece['items'][number]) =>
    item.artwork && !item.artwork.front ? fronts.get(item.id) : undefined;
  if (!piece.items.some(knownFront)) {
    return piece;
  }
  return {
    ...piece,
    items: piece.items.map((item) => {
      const known = knownFront(item);
      return known ? { ...item, artwork: known } : item;
    }),
  };
}

function frontsOf(piece: TablePiece) {
  return new Map(piece.items.flatMap((item) => (item.artwork?.front ? [[item.id, item.artwork] as const] : [])));
}

/**
 * A card turned face down arrives without its front, but the turn still shows that front on the card's underside until it lies flat.
 * This keeps the fronts the piece showed before its latest flip, so the turn draws the card's own face instead of a blank one.
 * Only fronts this page was already shown are kept, and the next flip replaces them.
 */
export function useTurnedDownFaces(piece: TablePiece): TablePiece {
  const memory = useRef({ revision: piece.flipRevision ?? 0, shown: piece, fronts: new Map<string, Artwork>() });
  const current = memory.current;
  const revision = piece.flipRevision ?? 0;
  if (current.shown !== piece) {
    if (revision !== current.revision) {
      current.fronts = frontsOf(withKnownFronts(current.shown, current.fronts));
      current.revision = revision;
    }
    current.shown = piece;
  }
  const fronts = current.fronts;
  return useMemo(() => withKnownFronts(piece, fronts), [piece, fronts]);
}
