import type { Collision, DragMoveEvent } from '@dnd-kit/core';
import { useCallback, useEffect, useRef } from 'react';

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

export function useCoalescedDragPosition(handler: (event: DragMoveEvent) => void) {
  const handlerRef = useRef(handler);
  const pendingEvent = useRef<DragMoveEvent | null>(null);
  const animationFrame = useRef<number | null>(null);
  handlerRef.current = handler;

  const cancel = useCallback(() => {
    if (animationFrame.current !== null) {
      cancelAnimationFrame(animationFrame.current);
    }
    animationFrame.current = null;
    pendingEvent.current = null;
  }, []);

  const schedule = useCallback((event: DragMoveEvent) => {
    pendingEvent.current = event;
    if (animationFrame.current !== null) {
      return;
    }
    animationFrame.current = requestAnimationFrame(() => {
      animationFrame.current = null;
      const latestEvent = pendingEvent.current;
      pendingEvent.current = null;
      if (latestEvent) {
        handlerRef.current(latestEvent);
      }
    });
  }, []);

  useEffect(() => cancel, [cancel]);

  return { schedule, cancel };
}
