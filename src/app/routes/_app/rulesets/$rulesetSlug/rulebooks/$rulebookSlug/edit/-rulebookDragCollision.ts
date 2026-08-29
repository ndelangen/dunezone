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

export function pointerInsertionSlot(slots: DroppableContainer[], rows: DroppableContainer[], pointerY: number) {
  const orderedRows = rows
    .flatMap((container) => {
      const data = container.data.current as VerticalInsertionData | undefined;
      const node = container.node.current;
      if (data?.kind !== 'block' || !(node instanceof HTMLElement)) {
        return [];
      }
      return [{ blockId: data.blockId, rect: node.getBoundingClientRect() }];
    })
    .sort((left, right) => left.rect.top - right.rect.top);
  const followingRow = orderedRows.find(({ rect }) => pointerY < rect.top + rect.height / 2);
  const targetRow = followingRow ?? orderedRows.at(-1);
  if (!targetRow) {
    return null;
  }
  const side = followingRow ? 'before' : 'after';
  return (
    slots.find((container) => {
      const data = container.data.current as VerticalInsertionData | undefined;
      return data?.kind === 'slot' && data.targetBlockId === targetRow.blockId && data.side === side;
    }) ?? null
  );
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
