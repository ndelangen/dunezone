/** Half the battle callout's height (a 180px side, the 38px actions and the surface padding), plus a small gap. */
const CALLOUT_HALF_HEIGHT = 140;

/**
 * The battle callout's vertical centre in canvas pixels: on the far side of the middle from the territory it points at, about 250px away, and never so high that the seated header, which lies over the top of the canvas, covers its top edge.
 */
export function battleCapsuleY(anchorY: number, height: number, topInset: number): number {
  const verticalMidpoint = height / 2;
  if (anchorY < verticalMidpoint) {
    return Math.max(verticalMidpoint + 1, Math.min(height - 150, anchorY + 250));
  }
  const highest = Math.max(160, topInset + CALLOUT_HALF_HEIGHT);
  return Math.max(highest, Math.min(verticalMidpoint - 1, anchorY - 250));
}

/** How far the seated header reaches down over the top of the table canvas, in pixels. */
export function headerInset(canvas: HTMLCanvasElement): number {
  const header = canvas.closest('.dune-play-shell')?.querySelector<HTMLElement>('.seated-header');
  if (!header) {
    return 0;
  }
  return Math.max(0, header.getBoundingClientRect().bottom - canvas.getBoundingClientRect().top);
}
