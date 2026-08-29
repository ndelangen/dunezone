import type { Collision, DragMoveEvent, DroppableContainer } from '@dnd-kit/core';
import { useCallback, useLayoutEffect, useRef } from 'react';

export function collisionsWithPointerY(collisions: Collision[], pointerY: number | null) {
  if (pointerY === null) {
    return collisions;
  }
  return collisions.map((collision) => ({
    ...collision,
    data: { ...collision.data, pointerY },
  }));
}

export function collisionPointerY(collisions: Collision[] | null) {
  const pointerY = collisions?.[0]?.data?.pointerY;
  return typeof pointerY === 'number' ? pointerY : null;
}

type VerticalInsertionData =
  | Readonly<{ kind: 'block'; blockId: string }>
  | Readonly<{ kind: 'slot'; targetBlockId: string; side: 'before' | 'after' }>;

function orderedVerticalRows(rows: DroppableContainer[]) {
  return rows
    .flatMap((container) => {
      const data = container.data.current as VerticalInsertionData | undefined;
      const node = container.node.current;
      if (data?.kind !== 'block' || !(node instanceof HTMLElement)) {
        return [];
      }
      return [{ blockId: data.blockId, rect: node.getBoundingClientRect() }];
    })
    .sort((left, right) => left.rect.top - right.rect.top);
}

function insertionSlotForRow(
  slots: DroppableContainer[],
  targetBlockId: string,
  side: Extract<VerticalInsertionData, { kind: 'slot' }>['side']
) {
  return (
    slots.find((container) => {
      const data = container.data.current as VerticalInsertionData | undefined;
      return data?.kind === 'slot' && data.targetBlockId === targetBlockId && data.side === side;
    }) ?? null
  );
}

export function pointerInsertionSlot(slots: DroppableContainer[], rows: DroppableContainer[], pointerY: number) {
  const orderedRows = orderedVerticalRows(rows);
  const followingRow = orderedRows.find(({ rect }) => pointerY < rect.top + rect.height / 2);
  const targetRow = followingRow ?? orderedRows.at(-1);
  if (!targetRow) {
    return null;
  }
  return insertionSlotForRow(slots, targetRow.blockId, followingRow ? 'before' : 'after');
}

export function useCoalescedDragPosition(handler: (event: DragMoveEvent) => void) {
  const handlerRef = useRef(handler);
  const pendingEvent = useRef<DragMoveEvent | null>(null);
  const animationFrame = useRef<number | null>(null);

  useLayoutEffect(() => {
    handlerRef.current = handler;
  }, [handler]);

  const cancel = useCallback(() => {
    if (animationFrame.current !== null) {
      cancelAnimationFrame(animationFrame.current);
    }
    animationFrame.current = null;
    pendingEvent.current = null;
  }, []);

  const flush = useCallback(() => {
    if (animationFrame.current !== null) {
      cancelAnimationFrame(animationFrame.current);
      animationFrame.current = null;
    }
    const latestEvent = pendingEvent.current;
    pendingEvent.current = null;
    if (latestEvent) {
      handlerRef.current(latestEvent);
    }
  }, []);

  const schedule = useCallback(
    (event: DragMoveEvent) => {
      pendingEvent.current = event;
      if (animationFrame.current !== null) {
        return;
      }
      animationFrame.current = requestAnimationFrame(() => {
        animationFrame.current = null;
        flush();
      });
    },
    [flush]
  );

  useLayoutEffect(() => cancel, [cancel]);

  return { schedule, flush, cancel };
}
