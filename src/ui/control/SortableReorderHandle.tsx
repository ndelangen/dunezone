import type { useSortable } from '@dnd-kit/sortable';
import clsx from 'clsx';
import { GripVertical } from 'lucide-react';

import { FormTooltip } from './FormTooltip';
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
    <FormTooltip content={label} side="left" align="center" collisionPadding={12}>
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
    </FormTooltip>
  );
}
