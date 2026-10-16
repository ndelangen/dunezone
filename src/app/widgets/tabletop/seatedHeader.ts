import type { ScreenRect } from './playView';

/* The seated play shell's header around a table element, which lies over the canvas's top; none outside a seated table. */
export function seatedHeaderOf(element: Element): HTMLElement | null {
  return element.closest('.dune-play-shell')?.querySelector<HTMLElement>('.seated-header') ?? null;
}

/* The room, in pixels, the map view leaves between the board and a chip floating over it. */
const OVERLAY_MARGIN_PX = 8;

/* What floats over a seated table's canvas: the header's chips and the camera dial. */
export function tableOverlaysOf(canvas: Element): HTMLElement[] {
  const shell = canvas.closest('.dune-play-shell');
  return shell ? [...shell.querySelectorAll<HTMLElement>('.seated-header .seated-chip, .seated-camera')] : [];
}

/**
 * The chips and dial over the canvas, as rectangles in its normalised device coordinates with a margin around each, so the map view frames the board around them.
 * One wholly off the canvas, or not drawn, frames nothing.
 */
export function tableOverlayRects(canvas: Element): ScreenRect[] {
  const bounds = canvas.getBoundingClientRect();
  if (bounds.width <= 0 || bounds.height <= 0) {
    return [];
  }
  return tableOverlaysOf(canvas).flatMap((overlay) => {
    const rect = overlay.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) {
      return [];
    }
    const left = Math.max(bounds.left, rect.left - OVERLAY_MARGIN_PX);
    const right = Math.min(bounds.right, rect.right + OVERLAY_MARGIN_PX);
    const top = Math.max(bounds.top, rect.top - OVERLAY_MARGIN_PX);
    const bottom = Math.min(bounds.bottom, rect.bottom + OVERLAY_MARGIN_PX);
    if (left >= right || top >= bottom) {
      return [];
    }
    return [
      {
        left: ((left - bounds.left) / bounds.width) * 2 - 1,
        right: ((right - bounds.left) / bounds.width) * 2 - 1,
        top: 1 - ((top - bounds.top) / bounds.height) * 2,
        bottom: 1 - ((bottom - bounds.top) / bounds.height) * 2,
      },
    ];
  });
}
