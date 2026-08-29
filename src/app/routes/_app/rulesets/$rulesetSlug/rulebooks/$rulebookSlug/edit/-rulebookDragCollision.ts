import type { Collision } from '@dnd-kit/core';

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
