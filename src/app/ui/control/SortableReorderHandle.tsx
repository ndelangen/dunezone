import type { useSortable } from '@dnd-kit/sortable';
import { Tooltip } from '@mantine/core';
import clsx from 'clsx';
import { GripVertical } from 'lucide-react';

import styles from './SortableDnd.module.css';

export type SortableHandleProps = Pick<
  ReturnType<typeof useSortable>,
  'setActivatorNodeRef' | 'attributes' | 'listeners'
>;

export function SortableReorderHandle({
  label,
  className,
  setActivatorNodeRef,
  attributes,
  listeners,
}: {
  label: string;
  className?: string;
  setActivatorNodeRef?: SortableHandleProps['setActivatorNodeRef'];
  attributes?: SortableHandleProps['attributes'];
  listeners?: SortableHandleProps['listeners'];
}) {
  return (
    <Tooltip label={label} position="left">
      <button
        type="button"
        className={clsx(styles.reorderHandle, className)}
        aria-label={label}
        ref={setActivatorNodeRef}
        {...attributes}
        {...listeners}
      >
        <GripVertical size={16} aria-hidden />
      </button>
    </Tooltip>
  );
}
