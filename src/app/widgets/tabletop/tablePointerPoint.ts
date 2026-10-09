function rectangleContainsPoint(bounds: DOMRect, x: number, y: number) {
  return x >= bounds.left && x <= bounds.right && y >= bounds.top && y <= bounds.bottom;
}

function coveredBy(selector: string, x: number, y: number) {
  for (const element of document.querySelectorAll<HTMLElement>(selector)) {
    if (element.hidden || element.getClientRects().length === 0) {
      continue;
    }
    if (rectangleContainsPoint(element.getBoundingClientRect(), x, y)) {
      return true;
    }
  }
  return false;
}

export function isPublicTablePoint(canvas: HTMLCanvasElement, x: number, y: number): boolean {
  if (!rectangleContainsPoint(canvas.getBoundingClientRect(), x, y)) {
    return false;
  }
  /* Pointer capture and inert overlays can both bypass normal DOM hit testing. */
  return !coveredBy('[data-private-hand]', x, y);
}

/**
 * Whether a resting pointer shows as a cursor to the other players.
 * Chrome drawn over the scene, such as the header, lets the pointer through to the canvas, so hit testing alone would publish a point the player cannot see (#1665).
 * A drag still follows the pointer under it.
 */
export function isCursorTablePoint(canvas: HTMLCanvasElement, x: number, y: number): boolean {
  return isPublicTablePoint(canvas, x, y) && !coveredBy('[data-hides-cursor]', x, y);
}
