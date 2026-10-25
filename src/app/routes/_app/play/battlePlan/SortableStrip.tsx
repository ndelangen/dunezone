import { closestCenter, DndContext, PointerSensor, useSensor, useSensors } from '@dnd-kit/core';
import type { DragEndEvent } from '@dnd-kit/core';
import { arrayMove, horizontalListSortingStrategy, SortableContext, useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import type { TablePiece } from '@shared/play/model';
import type { ReactNode } from 'react';
import { useState } from 'react';

import styles from './LedgerPlan.module.css';
import { arranged, seated } from './planView';

/**
 * A row of plan pieces the player lays out by dragging.
 * The order is theirs: choosing a piece leaves it in place, and the chosen ones go into the plan, and onto the wheel, in this order.
 * A drag starts only after the pointer moves a little, so a plain click still toggles the piece.
 */
export function SortableStrip({
  pieces,
  chosen,
  locked,
  onChoose,
  children,
}: {
  pieces: readonly TablePiece[];
  chosen: readonly string[];
  locked: boolean;
  onChoose: (ids: string[]) => void;
  children: (piece: TablePiece, order: readonly string[]) => ReactNode;
}) {
  const ids = pieces.map((piece) => piece.id);
  const [placed, setPlaced] = useState(() => seated(ids, chosen));
  /* When the plan's order changes elsewhere, or a reorder is refused, the strip takes the plan's order again. */
  const [seen, setSeen] = useState(chosen.join());
  if (seen !== chosen.join()) {
    setSeen(chosen.join());
    const shown = arranged(placed, ids).filter((id) => chosen.includes(id));
    if (shown.join() !== chosen.filter((id) => ids.includes(id)).join()) {
      setPlaced(seated(arranged(placed, ids), chosen));
    }
  }
  const order = arranged(placed, ids);
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }));
  const onDragEnd = ({ active, over }: DragEndEvent) => {
    if (!over || active.id === over.id) {
      return;
    }
    const next = arrayMove(order, order.indexOf(String(active.id)), order.indexOf(String(over.id)));
    setPlaced(next);
    const reordered = next.filter((id) => chosen.includes(id));
    if (reordered.join() !== chosen.join()) {
      onChoose(reordered);
    }
  };
  return (
    <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
      <SortableContext items={order} strategy={horizontalListSortingStrategy}>
        {order.map((id) => (
          <SortablePiece key={id} id={id} locked={locked}>
            {children(
              pieces.find((piece) => piece.id === id)!,
              order
            )}
          </SortablePiece>
        ))}
      </SortableContext>
    </DndContext>
  );
}

function SortablePiece({ id, locked, children }: { id: string; locked: boolean; children: ReactNode }) {
  const { listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id, disabled: locked });
  return (
    <div
      ref={setNodeRef}
      className={styles.sortable}
      data-dragging={isDragging || undefined}
      style={{ transform: CSS.Translate.toString(transform), transition }}
      {...listeners}
    >
      {children}
    </div>
  );
}
