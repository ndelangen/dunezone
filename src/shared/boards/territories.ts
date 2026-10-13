import { derive } from './geometry';
import type { Board, Point } from './schema';

/* Definitions retained by a game are immutable; geometry follows that lifetime. */
const cache = new WeakMap<Board, ReturnType<typeof derive>>();
export function boardTerritories(board: Board) {
  let result = cache.get(board);
  if (!result) {
    result = derive(board);
    if (
      !result.faces.length ||
      result.unrecoveredSegments ||
      result.faces.some((face) => !board.properties[face.key])
    ) {
      throw new Error('The saved board has unusable territory geometry');
    }
    cache.set(board, result);
  }
  return result.faces;
}

function inside([x, y]: Point, ring: Point[]) {
  let contained = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const a = ring[i],
      b = ring[j];
    if (a[1] > y !== b[1] > y && x < ((b[0] - a[0]) * (y - a[1])) / (b[1] - a[1]) + a[0]) {
      contained = !contained;
    }
  }
  return contained;
}

/** Ring parity excludes enclosed territories from their surrounding territory. */
export function boardTerritoryAt(board: Board, point: Point) {
  const face = boardTerritories(board).find(
    (face) => face.rings.reduce((count, ring) => count + Number(inside(point, ring)), 0) % 2 === 1
  );
  return face ? board.properties[face.key] : undefined;
}
