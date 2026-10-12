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
export type TokenShape = 'round' | 'gear' | 'square' | 'rectangle';

/** An enhance token is wider than it is tall; every other token shape is square. */
const RECTANGLE_TOKEN_ASPECT = 0.62;

/** The height of a token shape as a multiple of its width. */
export function tokenShapeAspect(shape: TokenShape): number {
  return shape === 'rectangle' ? RECTANGLE_TOKEN_ASPECT : 1;
}

/** A token's shape from its asset, publication or table artwork type; null for anything that is not a token, such as a card. */
export function tokenShapeOfType(type: string | undefined): TokenShape | null {
  switch (type) {
    case 'token-disc':
    case 'troop':
    case 'faction-token':
    case 'faction-leader':
    case 'faction-troop':
      return 'round';
    case 'token-tech':
      return 'gear';
    case 'token-plate':
      return 'square';
    case 'token-enhance':
      return 'rectangle';
    default:
      return null;
  }
}

/** The cut for a shape, as CSS: a radius where one draws it, a clip path for the gear a radius cannot. */
export function tokenOutline(shape: TokenShape): { radius?: string; clipPath?: string } {
  switch (shape) {
    case 'round':
      return { radius: '50%' };
    case 'gear':
      return { clipPath: GEAR_CLIP };
    case 'square':
    case 'rectangle':
      return { radius: '8px' };
  }
}
