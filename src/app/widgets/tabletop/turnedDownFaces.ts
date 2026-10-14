import type { TablePiece } from '@shared/play/model';
import { useMemo, useReducer } from 'react';

type Artwork = NonNullable<TablePiece['items'][number]['artwork']>;

/** The piece with each card's known artwork put back where a hidden copy left its front out. */
function withKnownFronts(piece: TablePiece, fronts: ReadonlyMap<string, Artwork>): TablePiece {
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
  const [memory, remember] = useReducer(
    (current: { revision: number; shown: TablePiece; fronts: Map<string, Artwork> }, shown: TablePiece) => ({
      revision: shown.flipRevision ?? 0,
      shown,
      fronts:
        (shown.flipRevision ?? 0) !== current.revision
          ? frontsOf(withKnownFronts(current.shown, current.fronts))
          : current.fronts,
    }),
    piece,
    (shown) => ({ revision: shown.flipRevision ?? 0, shown, fronts: new Map<string, Artwork>() })
  );
  if (memory.shown !== piece) {
    remember(piece);
  }
  const fronts = memory.fronts;
  return useMemo(() => withKnownFronts(piece, fronts), [piece, fronts]);
}
