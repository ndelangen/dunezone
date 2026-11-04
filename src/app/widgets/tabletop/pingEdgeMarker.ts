import type { Vector3Tuple } from '@shared/play/model';

/** Where a ping's edge marker sits on the canvas, in pixels from its top left, and the angle it points at the ping, clockwise from the right. */
export type PingEdgePlacement = Readonly<{ x: number; y: number; angle: number }>;

/** A rectangle on the canvas, in pixels from its top left. */
export type PixelRect = Readonly<{ left: number; top: number; right: number; bottom: number }>;

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
  clearance: number,
  avoid: readonly PixelRect[] = []
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
  const room = {
    left: Math.min(chrome.left + clearance, halfWidth),
    top: Math.min(chrome.top + clearance, halfHeight),
    right: Math.max(size.width - chrome.right - clearance, halfWidth),
    bottom: Math.max(size.height - chrome.bottom - clearance, halfHeight),
  };
  const [x, y] = avoid.reduce((point, rect) => stepAside(point, rect, clearance, room), [
    halfWidth + dx * scale,
    halfHeight - dy * scale,
  ] as [number, number]);
  return { x, y, angle };
}

/*
 * A marker that would sit under something drawn over a corner, such as the camera dial, moves the shortest way out from under it,
 * `clearance` pixels clear, while staying in the room the edges leave; it keeps pointing the way it did.
 */
function stepAside(point: [number, number], rect: PixelRect, clearance: number, room: PixelRect): [number, number] {
  const [x, y] = point;
  const clear = grow(rect, clearance);
  if (!strictlyInside(point, clear)) {
    return point;
  }
  const candidates: [number, number][] = [
    [clear.left, y],
    [clear.right, y],
    [x, clear.top],
    [x, clear.bottom],
  ];
  const distance = (candidate: [number, number]) => Math.hypot(candidate[0] - x, candidate[1] - y);
  return candidates
    .filter((candidate) => insideOrOn(candidate, room))
    .reduce((best, candidate) => (best === point || distance(candidate) < distance(best) ? candidate : best), point);
}

/* A rectangle grown by `by` pixels on every side. */
function grow(rect: PixelRect, by: number): PixelRect {
  return { left: rect.left - by, top: rect.top - by, right: rect.right + by, bottom: rect.bottom + by };
}

function strictlyInside([x, y]: readonly [number, number], rect: PixelRect) {
  return between(x, rect.left, rect.right, false) && between(y, rect.top, rect.bottom, false);
}

function insideOrOn([x, y]: readonly [number, number], rect: PixelRect) {
  return between(x, rect.left, rect.right, true) && between(y, rect.top, rect.bottom, true);
}

function between(value: number, low: number, high: number, inclusive: boolean) {
  return inclusive ? value >= low && value <= high : value > low && value < high;
}
