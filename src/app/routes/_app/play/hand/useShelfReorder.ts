import type { TablePiece } from '@shared/play/model';
import { useState } from 'react';
import type { DragEvent } from 'react';

import type { HandGroup } from './handGroups';
import { dragFromHand } from './useHandActions';

type Insert = Readonly<{ targetId: string; side: 'before' | 'after' }>;

/** Where a dragged piece would land beside a target: in front of it over its first half, behind it over the second. */
function sideOf(event: DragEvent<HTMLElement>): Insert['side'] {
  const box = event.currentTarget.getBoundingClientRect();
  return event.clientX < box.left + box.width / 2 ? 'before' : 'after';
}

/**
 * The hand's own order, by drag and drop: a piece dragged over another of its shelf opens a gap there, and dropping it moves it into that gap.
 * The same native drag carries the piece onto the table, so dragging out still plays it.
 */
export function useShelfReorder(
  groups: readonly HandGroup[],
  reorder: (piece: TablePiece, before: string | null) => void,
  enabled: boolean
) {
  const [dragged, setDragged] = useState<TablePiece>();
  const [insert, setInsert] = useState<Insert>();
  const shelfOf = (piece: TablePiece) => groups.find((group) => group.pieces.some((other) => other.id === piece.id));

  /*
   * The piece the dragged one lands in front of, or null for the end of its shelf, which the hand's end keeps;
   * undefined when it would not move.
   */
  const landing = (target: TablePiece, side: Insert['side']) => {
    const shelf = shelfOf(target)!.pieces;
    const rest = shelf.filter((piece) => piece.id !== dragged!.id);
    const at = rest.findIndex((piece) => piece.id === target.id) + (side === 'after' ? 1 : 0);
    const before = rest[at]?.id ?? null;
    const now = shelf[shelf.findIndex((piece) => piece.id === dragged!.id) + 1]?.id ?? null;
    return before === now ? undefined : before;
  };

  const handlers = (piece: TablePiece) => {
    const sameShelf = () => dragged !== undefined && dragged.id !== piece.id && shelfOf(dragged) === shelfOf(piece);
    return {
      onDragStart: (event: DragEvent<HTMLElement>) => {
        dragFromHand(piece)(event);
        setDragged(piece);
      },
      onDragEnd: () => {
        setDragged(undefined);
        setInsert(undefined);
      },
      onDragOver: (event: DragEvent<HTMLElement>) => {
        if (!enabled || !sameShelf()) {
          return;
        }
        event.preventDefault();
        event.dataTransfer.dropEffect = 'move';
        const side = sideOf(event);
        if (insert?.targetId !== piece.id || insert.side !== side) {
          setInsert(landing(piece, side) === undefined ? undefined : { targetId: piece.id, side });
        }
      },
      onDragLeave: () => {
        if (insert?.targetId === piece.id) {
          setInsert(undefined);
        }
      },
      onDrop: (event: DragEvent<HTMLElement>) => {
        if (!enabled || !sameShelf()) {
          return;
        }
        event.preventDefault();
        const before = landing(piece, sideOf(event));
        if (before !== undefined) {
          reorder(dragged!, before);
        }
        setDragged(undefined);
        setInsert(undefined);
      },
    };
  };

  return {
    handlers,
    /** The side of this piece a gap opens on while another is dragged over it. */
    gap: (piece: TablePiece) => (insert?.targetId === piece.id ? insert.side : undefined),
    dragging: (piece: TablePiece) => dragged?.id === piece.id,
  };
}
