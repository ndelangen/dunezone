import type { TablePiece } from '@shared/play/model';
import { useEffect, useState } from 'react';

import type { TableProjection, TableSession } from '../../../../db/tabletop/TableSession';

type Move = Readonly<{ pieceId: string; before: string | null }>;

/** The pieces in the room's stored order; the ones it does not name yet follow in the order given. */
function inOrder(pieces: readonly TablePiece[], order: readonly string[]) {
  const rank = (piece: TablePiece, index: number) =>
    order.includes(piece.id) ? order.indexOf(piece.id) : order.length + index;
  return pieces
    .map((piece, index) => ({ piece, rank: rank(piece, index) }))
    .sort((a, b) => a.rank - b.rank)
    .map(({ piece }) => piece);
}

/** The pieces with one moved to just before another, or to the end with null, as the room orders them. */
function movedBefore(pieces: readonly TablePiece[], move: Move) {
  const piece = pieces.find((candidate) => candidate.id === move.pieceId);
  if (!piece) {
    return [...pieces];
  }
  const rest = pieces.filter((candidate) => candidate !== piece);
  const at = move.before ? rest.findIndex((candidate) => candidate.id === move.before) : -1;
  rest.splice(at < 0 ? rest.length : at, 0, piece);
  return rest;
}

/**
 * The player's own order of what they hold: the plain hand and the pieces they put in a battle plan, which the room stores.
 * Every window that lists them sorts them here and reorders through here, so the Hand & spice shelves and the Battle plan window always agree.
 * Pass the pieces the window lists;
 * the side-table's pieces have no place in it.
 * A move shows at once, in its new place, until the room answers it.
 */
export function useHandOrder(client: TableSession, table: TableProjection, pieces: readonly TablePiece[]) {
  const [moving, setMoving] = useState<Move & { commandId: string }>();
  useEffect(() => {
    if (!moving) {
      return;
    }
    const stop = client.subscribe(() =>
      setMoving((current) => (current && client.awaiting(current.commandId) ? current : undefined))
    );
    return () => {
      stop();
    };
  }, [client, moving]);
  const ordered = inOrder(pieces, table.snapshot.handOrder ?? []);
  return {
    /** The pieces, in the player's order. */
    pieces: moving && client.awaiting(moving.commandId) ? movedBefore(ordered, moving) : ordered,
    /** Moves a piece to just before another, or to the end with null. */
    reorder: (piece: TablePiece, before: string | null) => {
      const commandId = client.command({ kind: 'hand-order', pieceId: piece.id, before });
      if (commandId) {
        setMoving({ pieceId: piece.id, before, commandId });
      }
    },
  };
}
