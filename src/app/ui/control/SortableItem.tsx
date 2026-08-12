import { useDndContext } from '@dnd-kit/core';
import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import clsx from 'clsx';
import type { ReactNode } from 'react';

import styles from './SortableDnd.module.css';
import type { SortableHandleProps } from './SortableReorderHandle';

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
  const {
    attributes,
    listeners,
    setActivatorNodeRef,
    setNodeRef,
    transform,
    transition,
    isDragging,
    isOver,
  } = useSortable({ id });
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
