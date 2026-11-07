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

/**
 * How far the play shell's chrome reaches in over a canvas's edges, in pixels: the header's chips from the top, and the chat bar from the bottom.
 * The camera dial is left out, as it covers only its corner: `tableCornerRects` gives it.
 * A table outside the play shell has none.
 */
export function tableChromeInsets(canvas: Element) {
  const bounds = canvas.getBoundingClientRect();
  const shell = canvas.closest('.dune-play-shell');
  const top = [...(shell?.querySelectorAll('.seated-header .seated-chip') ?? [])].reduce((reach, chip) => {
    const rect = chip.getBoundingClientRect();
    return rect.width > 0 && rect.height > 0 ? Math.max(reach, rect.bottom - bounds.top) : reach;
  }, 0);
  const bar = shell?.querySelector('[data-compass-bar]')?.getBoundingClientRect();
  const bottom = bar && bar.width > 0 && bar.height > 0 ? Math.max(bounds.bottom - bar.top, 0) : 0;
  return { top: Math.max(top, 0), right: 0, bottom, left: 0 };
}

/** What the play shell draws over a corner of a canvas, the camera dial, as rectangles in pixels from the canvas's top left. */
export function tableCornerRects(canvas: Element) {
  const bounds = canvas.getBoundingClientRect();
  const shell = canvas.closest('.dune-play-shell');
  return [...(shell?.querySelectorAll('.seated-camera') ?? [])].flatMap((dial) => {
    const rect = dial.getBoundingClientRect();
    return rect.width > 0 && rect.height > 0
      ? [
          {
            left: rect.left - bounds.left,
            top: rect.top - bounds.top,
            right: rect.right - bounds.left,
            bottom: rect.bottom - bounds.top,
          },
        ]
      : [];
  });
}

/**
 * Calls `onChange` whenever the canvas or the chrome over it resizes, such as a window resize or a header that wraps, so what was measured from them can be measured again.
 * Returns what stops watching.
 */
export function watchTableChrome(canvas: Element, onChange: () => void): () => void {
  if (typeof ResizeObserver === 'undefined') {
    return () => {};
  }
  const shell = canvas.closest('.dune-play-shell');
  const chrome = shell ? [...shell.querySelectorAll('.seated-header, .seated-camera, [data-compass-bar]')] : [];
  /* An observer also reports each element once as it starts watching, which measures again harmlessly. */
  const observer = new ResizeObserver(() => onChange());
  for (const element of [canvas, ...chrome]) {
    observer.observe(element);
  }
  return () => observer.disconnect();
}
