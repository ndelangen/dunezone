/*
 * The private side-table's zoom: the wheel brings a card's track up close, about the point under the pointer,
 * as the Alt close-up zooms (Norbert, 2026-10-26: the Kwisatz Haderach tracker is unreadable at table size).
 * A zoomed view shows part of what the unzoomed view shows, never more, so a piece is never laid where zooming out cannot show it.
 */

/** The closest the side-table zooms in. */
export const HIDDEN_ZONE_MAX_ZOOM = 4;

/** How far the side-table is zoomed in, and the table-unit point at the view's top left corner. */
export type HiddenZoneZoom = Readonly<{ by: number; x: number; y: number }>;

export const UNZOOMED: HiddenZoneZoom = { by: 1, x: 0, y: 0 };

type Size = Readonly<{ width: number; height: number }>;

const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));

/** `zoom` kept inside what the unzoomed view of `size` shows at `scale` pixels per table unit, as a resized window needs. */
export function fitZoom(zoom: HiddenZoneZoom, scale: number, size: Size): HiddenZoneZoom {
  if (!(scale > 0) || zoom.by <= 1) {
    return UNZOOMED;
  }
  const zoomed = scale * zoom.by;
  return {
    by: zoom.by,
    x: clamp(zoom.x, 0, size.width / scale - size.width / zoomed),
    y: clamp(zoom.y, 0, size.height / scale - size.height / zoomed),
  };
}

/** Zooms by `factor` about `at`, a point in the view's pixels, which stays over the same spot of the side-table; `view` is the unzoomed view's scale and size. */
export function zoomAbout(
  zoom: HiddenZoneZoom,
  factor: number,
  at: Readonly<{ x: number; y: number }>,
  { scale, ...size }: Size & Readonly<{ scale: number }>
): HiddenZoneZoom {
  const from = fitZoom(zoom, scale, size);
  const by = clamp(from.by * factor, 1, HIDDEN_ZONE_MAX_ZOOM);
  const before = scale * from.by;
  const after = scale * by;
  return fitZoom(
    { by, x: from.x + at.x / before - at.x / after, y: from.y + at.y / before - at.y / after },
    scale,
    size
  );
}

/** How much one wheel step zooms: a notch of a mouse wheel is about 100 pixels of delta, a fifth more or less. */
export const wheelFactor = (deltaY: number) => Math.exp(-deltaY * 0.0018);
