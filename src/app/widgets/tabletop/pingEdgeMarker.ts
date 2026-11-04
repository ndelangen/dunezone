import type { Vector3Tuple } from '@shared/play/model';

/** Where a ping's edge marker sits on the canvas, in pixels from its top left, and the angle it points at the ping, clockwise from the right. */
export type PingEdgePlacement = Readonly<{ x: number; y: number; angle: number }>;

/** How far in from each canvas edge a marker stays, in pixels: clear of the chrome that floats over the table there. */
export type PingEdgeInsets = Readonly<{ top: number; right: number; bottom: number; left: number }>;

/**
 * Where the edge marker of a ping out of view sits: just inside the canvas edge, on the line from the centre towards the ping.
 * `view` is the ping in camera space (the camera looks down negative z) and `ndc` its projection;
 * a ping the view shows needs no marker.
 * A ping behind the camera projects through the centre to the wrong side, so its direction comes from camera space instead.
 */
export function pingEdgePlacement(
  view: Vector3Tuple,
  ndc: readonly [number, number],
  size: Readonly<{ width: number; height: number }>,
  insets: PingEdgeInsets
): PingEdgePlacement | null {
  const inFront = view[2] < 0;
  if (inFront && Math.abs(ndc[0]) <= 1 && Math.abs(ndc[1]) <= 1) {
    return null;
  }
  const halfWidth = size.width / 2;
  const halfHeight = size.height / 2;
  /* The direction from the centre, in pixels with y up. */
  let dx = inFront ? ndc[0] * halfWidth : view[0];
  let dy = inFront ? ndc[1] * halfHeight : view[1];
  if (dx === 0 && dy === 0) {
    /* Straight behind the camera: towards the viewer's own side of the table. */
    dy = -1;
  }
  const reachX = Math.max(halfWidth - (dx > 0 ? insets.right : insets.left), 0);
  const reachY = Math.max(halfHeight - (dy > 0 ? insets.top : insets.bottom), 0);
  const scale = Math.min(dx === 0 ? Infinity : reachX / Math.abs(dx), dy === 0 ? Infinity : reachY / Math.abs(dy));
  dx *= scale;
  dy *= scale;
  return { x: halfWidth + dx, y: halfHeight - dy, angle: Math.atan2(-dy, dx) };
}
