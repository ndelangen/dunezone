/** The ten-tooth outline shared by tech-token faces and document illustrations. */
export const GEAR_CLIP = (() => {
  const steps = 20;
  const points: string[] = [];
  for (let i = 0; i < steps; i++) {
    const angle = (i / steps) * 2 * Math.PI;
    const next = ((i + 0.72) / steps) * 2 * Math.PI;
    const r = i % 2 === 0 ? 50 : 41;
    points.push(`${50 + r * Math.cos(angle)}% ${50 + r * Math.sin(angle)}%`);
    points.push(`${50 + r * Math.cos(next)}% ${50 + r * Math.sin(next)}%`);
  }
  return `polygon(${points.join(', ')})`;
})();

/**
 * The outline a token is shown in.
 * Every published token face is an opaque square or rectangle (a JPEG holds no mask), so the shape is never in the image: the place that shows it cuts it, and this is the one answer to which cut.
 */
export type TokenShape = 'round' | 'gear' | 'square' | 'rectangle' | 'pointer';

/**
 * A pointer token is a teardrop: a round end with a point.
 * Its point reaches this many round-end radii from the round end's centre.
 * The table's HMS plate keeps the same proportions, so the art cut here is the art on the plate.
 */
export const POINTER_TIP_RATIO = 1.95;

/** The teardrop cut through a square face: the point at the top centre, the round end filling the bottom. */
export const POINTER_CLIP = (() => {
  const height = 1 + POINTER_TIP_RATIO;
  const radius = 100 / height;
  const centre = 100 - radius;
  const tangent = Math.acos(1 / POINTER_TIP_RATIO);
  const steps = 32;
  const points = ['50% 0%'];
  for (let step = 0; step <= steps; step += 1) {
    const angle = tangent + ((Math.PI * 2 - tangent * 2) * step) / steps;
    points.push(`${50 + radius * Math.sin(angle)}% ${centre - radius * Math.cos(angle)}%`);
  }
  return `polygon(${points.join(', ')})`;
})();

/** An enhance token is wider than it is tall; every other token shape is square. */
const RECTANGLE_TOKEN_ASPECT = 0.62;

/** The height of a token shape as a multiple of its width. */
export function tokenShapeAspect(shape: TokenShape): number {
  return shape === 'rectangle' ? RECTANGLE_TOKEN_ASPECT : 1;
}

/** A token's shape from its asset, publication or table artwork type; null for anything that is not a token, such as a card. */
const SHAPE_OF_TYPE: Readonly<Record<string, TokenShape>> = {
  'token-disc': 'round',
  troop: 'round',
  'faction-token': 'round',
  'faction-leader': 'round',
  'faction-troop': 'round',
  'token-tech': 'gear',
  'token-plate': 'square',
  'token-pointer': 'pointer',
  'token-enhance': 'rectangle',
};

export function tokenShapeOfType(type: string | undefined): TokenShape | null {
  return (type !== undefined && Object.hasOwn(SHAPE_OF_TYPE, type) ? SHAPE_OF_TYPE[type] : undefined) ?? null;
}

/** The cut for a shape, as CSS: a radius where one draws it, a clip path for the gear a radius cannot. */
export function tokenOutline(shape: TokenShape): { radius?: string; clipPath?: string } {
  switch (shape) {
    case 'round':
      return { radius: '50%' };
    case 'gear':
      return { clipPath: GEAR_CLIP };
    case 'pointer':
      return { clipPath: POINTER_CLIP };
    case 'square':
    case 'rectangle':
      return { radius: '8px' };
  }
}
