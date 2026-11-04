import type { Vector3Tuple } from '@shared/play/model';

/** Where a ping's edge marker sits on the canvas, in pixels from its top left, and the angle it points at the ping, clockwise from the right. */
export type PingEdgePlacement = Readonly<{ x: number; y: number; angle: number }>;

/** How far in from each canvas edge something reaches, in pixels. */
export type PingEdgeInsets = Readonly<{ top: number; right: number; bottom: number; left: number }>;

/**
 * Where the edge marker of a ping out of view sits, on the line from the centre towards the ping.
 * `view` is the ping in camera space (the camera looks down negative z) and `ndc` its projection.
 * `chrome` is what the page draws over the canvas edges: a ping under it is out of view too.
 * The marker stays `clearance` pixels inside the chrome, so its arrow clears it;
 * a ping the view shows needs no marker.
 * A ping behind the camera projects through the centre to the wrong side, so its direction comes from camera space instead.
 */
export function pingEdgePlacement(
  view: Vector3Tuple,
  ndc: readonly [number, number],
  size: Readonly<{ width: number; height: number }>,
  chrome: PingEdgeInsets,
  clearance: number
): PingEdgePlacement | null {
  const halfWidth = size.width / 2;
  const halfHeight = size.height / 2;
  const inFront = view[2] < 0;
  if (inFront) {
    const x = halfWidth + ndc[0] * halfWidth;
    const y = halfHeight - ndc[1] * halfHeight;
    if (x >= chrome.left && x <= size.width - chrome.right && y >= chrome.top && y <= size.height - chrome.bottom) {
      return null;
    }
  }
  /* The direction from the centre, in pixels with y up. */
  let dx = inFront ? ndc[0] * halfWidth : view[0];
  let dy = inFront ? ndc[1] * halfHeight : view[1];
  if (dx === 0 && dy === 0) {
    /* Straight behind the camera: towards the viewer's own side of the table. */
    dy = -1;
  }
  const angle = Math.atan2(-dy, dx);
  const reachX = Math.max(halfWidth - clearance - (dx > 0 ? chrome.right : chrome.left), 0);
  const reachY = Math.max(halfHeight - clearance - (dy > 0 ? chrome.top : chrome.bottom), 0);
  const scale = Math.min(dx === 0 ? Infinity : reachX / Math.abs(dx), dy === 0 ? Infinity : reachY / Math.abs(dy));
  return { x: halfWidth + dx * scale, y: halfHeight - dy * scale, angle };
}
