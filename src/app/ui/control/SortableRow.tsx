import { closestCenter, DndContext, DragOverlay, PointerSensor, useSensor, useSensors } from '@dnd-kit/core';
import type { CollisionDetection, DragEndEvent, DragStartEvent } from '@dnd-kit/core';
import { rectSortingStrategy, SortableContext, useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { useEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { createPortal } from 'react-dom';

import { useMotionAllowed } from '@app/styles/motion';

import styles from './SortableRow.module.css';

type Point = Readonly<{ x: number; y: number }>;

/* Within the row, give or take a little slack at its edges, so a drag along its last piece still counts as inside. */
function within(row: HTMLElement | null, point: Point | undefined) {
  if (!row || !point) {
    return false;
  }
  const box = row.getBoundingClientRect();
  const slack = 16;
  return (
    point.x >= box.left - slack &&
    point.x <= box.right + slack &&
    point.y >= box.top - slack &&
    point.y <= box.bottom + slack
  );
}

/**
 * A wrapping row of pieces the player puts in their own order by dragging one along it.
 * The lifted piece follows the pointer, and the others slide aside to show where it lands.
 * A drag starts only after the pointer moves a little, so clicks and right-clicks on a piece stay its own.
 * Let go outside the row, the pieces settle back and `onDropOutside` gets the piece and the point, for a drop onto something else, such as the table.
 */
export function SortableRow<T extends { id: string }>({
  items,
  disabled = false,
  className,
  label,
  onMove,
  onDropOutside,
  children,
}: {
  items: readonly T[];
  disabled?: boolean;
  className?: string;
  label?: string;
  /** Moves an item in front of another, or to the end with null. */
  onMove: (item: T, before: string | null) => void;
  onDropOutside?: (item: T, point: Point) => void;
  children: (item: T) => ReactNode;
}) {
  const motion = useMotionAllowed();
  const row = useRef<HTMLDivElement>(null);
  const [active, setActive] = useState<T>();
  const [outside, setOutside] = useState(false);
  /*
   * Where the pointer is in the viewport, read from the pointer itself while a drag lasts:
   * dnd-kit's own delta also counts any scroll since the drag began, which would land a drop beside the point let go.
   */
  const pointer = useRef<Point>(undefined);
  const dragging = active !== undefined;
  useEffect(() => {
    if (!dragging) {
      return;
    }
    const track = (event: PointerEvent) => {
      pointer.current = { x: event.clientX, y: event.clientY };
    };
    window.addEventListener('pointermove', track, { capture: true });
    return () => window.removeEventListener('pointermove', track, { capture: true });
  }, [dragging]);
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }));
  const ids = items.map((item) => item.id);
  /* Over the row the nearest piece takes the drop; anywhere else nothing does, so the row settles back. */
  const collision: CollisionDetection = (args) =>
    args.pointerCoordinates && within(row.current, args.pointerCoordinates) ? closestCenter(args) : [];
  const reset = () => {
    setActive(undefined);
    setOutside(false);
  };
  const onDragStart = ({ active: start, activatorEvent }: DragStartEvent) => {
    pointer.current =
      activatorEvent instanceof PointerEvent ? { x: activatorEvent.clientX, y: activatorEvent.clientY } : undefined;
    setActive(items.find((item) => item.id === start.id));
  };
  const onDragMove = () => {
    const away = !within(row.current, pointer.current);
    if (away !== outside) {
      setOutside(away);
    }
  };
  const onDragEnd = (event: DragEndEvent) => {
    reset();
    const item = items.find((candidate) => candidate.id === event.active.id);
    if (!item) {
      return;
    }
    const point = pointer.current;
    if (!event.over) {
      if (point && !within(row.current, point)) {
        onDropOutside?.(item, point);
      }
      return;
    }
    const from = ids.indexOf(item.id);
    const to = ids.indexOf(String(event.over.id));
    if (to < 0 || from === to) {
      return;
    }
    /* Moving right it lands behind the piece it is over, moving left in front of it. */
    const rest = ids.filter((id) => id !== item.id);
    const at = rest.indexOf(String(event.over.id)) + (to > from ? 1 : 0);
    onMove(item, rest[at] ?? null);
  };
  return (
    <DndContext
      sensors={sensors}
      collisionDetection={collision}
      onDragStart={onDragStart}
      onDragMove={onDragMove}
      onDragEnd={onDragEnd}
      onDragCancel={reset}
    >
      <SortableContext items={ids} strategy={rectSortingStrategy} disabled={disabled}>
        <div ref={row} className={className} aria-label={label}>
          {items.map((item) => (
            <SortableTile key={item.id} id={item.id} motion={motion}>
              {children(item)}
            </SortableTile>
          ))}
        </div>
      </SortableContext>
      {createPortal(
        <DragOverlay
          className={outside ? `${styles.lifted} ${styles.away}` : styles.lifted}
          dropAnimation={motion && !outside ? undefined : null}
        >
          {active ? (
            <div aria-hidden inert>
              {children(active)}
            </div>
          ) : null}
        </DragOverlay>,
        document.body
      )}
    </DndContext>
  );
}

function SortableTile({ id, motion, children }: { id: string; motion: boolean; children: ReactNode }) {
  const { listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id,
    transition: motion ? undefined : null,
  });
  /* The browser's own drag of an image inside would take the pointer away from this one, so it never starts. */
  return (
    <div
      ref={setNodeRef}
      className={styles.tile}
      data-dragging={isDragging || undefined}
      style={{ transform: CSS.Translate.toString(transform), transition }}
      {...listeners}
      onDragStart={(event) => event.preventDefault()}
    >
      {children}
    </div>
  );
}
