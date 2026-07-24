import { useDndContext } from '@dnd-kit/core';
import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import type { CSSProperties } from 'react';

/**
 * Editor-domain drag behavior without owning the surrounding Mantine presentation.
 * Each collection composes its own Paper, actions, and accessible handle directly.
 */
export function useFactionSortableItem(id: string) {
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

  const style: CSSProperties = {
    position: 'relative',
    zIndex: isDragging ? 3 : undefined,
    opacity: isDragging ? 0.62 : undefined,
    outline: isOver && !isDragging ? '2px dashed var(--mantine-color-dune-6)' : undefined,
    outlineOffset: isOver && !isDragging ? 3 : undefined,
    transform: shouldApplyMotion ? CSS.Transform.toString(transform) : undefined,
    transition: shouldApplyMotion ? transition : undefined,
  };

  return {
    setNodeRef,
    style,
    handle: {
      ref: setActivatorNodeRef,
      attributes,
      listeners,
    },
  };
}
