import { useDndContext } from '@dnd-kit/core';
import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import clsx from 'clsx';
import type { ReactNode } from 'react';

import styles from './SortableDnd.module.css';
import type { SortableHandleProps } from './SortableReorderHandle';

/**
 * One row of a sortable list, and the motion it takes while the list is being reordered.
 *
 * Callers own what the row contains and render it through `children`, which receives the props the drag handle needs.
 * That is a render prop rather than a slot because the handle's position is the caller's business: some rows lead with it, some trail it, and this never sees the row's layout.
 * Transform and transition are applied only while a drag is in progress, so a settled list carries no motion styles at all.
 *
 * `as` exists because a row inside a `ul` must be an `li`, and the same row elsewhere must not be.
 */
export function SortableItem({
  as = 'div',
  id,
  className,
  children,
}: {
  as?: 'div' | 'li';
  id: string;
  className?: string;
  children: (args: SortableHandleProps) => ReactNode;
}) {
  const { attributes, listeners, setActivatorNodeRef, setNodeRef, transform, transition, isDragging, isOver } =
    useSortable({ id });
  const { active } = useDndContext();
  const shouldApplyMotion = active != null || isDragging;

  const style = {
    transform: shouldApplyMotion ? CSS.Transform.toString(transform) : undefined,
    transition: shouldApplyMotion ? transition : undefined,
  };

  const itemClassName = clsx(
    className,
    isDragging && styles.itemDragging,
    isOver && !isDragging && styles.itemDropTarget
  );

  const body = children({ setActivatorNodeRef, attributes, listeners });

  if (as === 'li') {
    return (
      <li ref={setNodeRef} style={style} className={itemClassName}>
        {body}
      </li>
    );
  }

  return (
    <div ref={setNodeRef} style={style} className={itemClassName}>
      {body}
    </div>
  );
}
