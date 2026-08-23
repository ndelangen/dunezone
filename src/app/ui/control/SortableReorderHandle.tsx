import type { useSortable } from '@dnd-kit/sortable';
import { Tooltip } from '@mantine/core';
import clsx from 'clsx';
import { GripVertical } from 'lucide-react';

import styles from './SortableDnd.module.css';

export type SortableHandleProps = Pick<
  ReturnType<typeof useSortable>,
  'setActivatorNodeRef' | 'attributes' | 'listeners'
>;

/**
 * The grip a reader drags to reorder one row.
 *
 * Callers own the row and the words;
 * this owns the glyph, the hit area and the wiring that makes the button the drag activator rather than the whole row.
 * `label` is both the tooltip and the accessible name, because a bare grip glyph names nothing on its own.
 *
 * It exists because a handle is the only part of a sortable row that must be a button, and every list that grew one had picked its own glyph and its own hit area.
 */
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
