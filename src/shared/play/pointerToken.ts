import { POINTER_TIP_RATIO } from '../assets/tokenOutline';
import type { TablePiece, Vector3Tuple } from './model';

/*
 * A pointer token: a flat teardrop plate that carries what stands on it, as the Ixians' HMS does.
 * Troops set down on it ride it, so moving the plate moves them, and taking one off leaves it behind.
 * Nothing records who rides: a piece rides while its centre lies over the plate, so every page and the game Worker agree from positions alone.
 */

/** The catalogue type a pointer token's items carry, the one thing that makes a piece a plate. */
export const POINTER_TOKEN_TYPE = 'token-pointer';
/** The round end's radius, centred on the plate's position: room for about two troop stacks side by side. */
export const POINTER_BODY_RADIUS = 0.42;
/** How far the point reaches from the round end's centre, along the plate's own forward (-z), in the catalogue face's proportions. */
export const POINTER_TIP = POINTER_BODY_RADIUS * POINTER_TIP_RATIO;
/** How thick the plate is: what stands on it stands this much higher. */
export const POINTER_HEIGHT = 0.05;
/* Enough points that the edge reads as round where a troop rests against it. */
const POINTER_ARC_SEGMENTS = 24;

export function isPointerToken(piece: Partial<Pick<TablePiece, 'items'>> | null | undefined): boolean {
  return piece?.items?.[0]?.artwork?.type === POINTER_TOKEN_TYPE;
}

/** A point across the table as [x, z]. */
export type PlanePoint = [x: number, z: number];

/**
 * The plate's outline in its own frame, as [x, z] around its round end's centre: the point first, then the round end.
 * Convex, so it serves as the plate's footprint too.
 */
export const POINTER_OUTLINE: readonly PlanePoint[] = (() => {
  const tangent = Math.acos(POINTER_BODY_RADIUS / POINTER_TIP);
  const points: PlanePoint[] = [[0, -POINTER_TIP]];
  for (let step = 0; step <= POINTER_ARC_SEGMENTS; step += 1) {
    const angle = tangent + ((Math.PI * 2 - tangent * 2) * step) / POINTER_ARC_SEGMENTS;
    points.push([POINTER_BODY_RADIUS * Math.sin(angle), -POINTER_BODY_RADIUS * Math.cos(angle)]);
  }
  return points;
})();

/** A point in a piece's own frame, placed on the table at its pose: the turn a scene gives a group with `rotation-y`. */
export function fromPieceFrame([x, z]: PlanePoint, position: Readonly<Vector3Tuple>, orientation: number): PlanePoint {
  const cosine = Math.cos(orientation);
  const sine = Math.sin(orientation);
  return [position[0] + x * cosine + z * sine, position[2] - x * sine + z * cosine];
}

/** A table point in a piece's own frame: the inverse of `fromPieceFrame`. */
function toPieceFrame(
  point: Readonly<Vector3Tuple>,
  position: Readonly<Vector3Tuple>,
  orientation: number
): PlanePoint {
  const x = point[0] - position[0];
  const z = point[2] - position[2];
  const cosine = Math.cos(orientation);
  const sine = Math.sin(orientation);
  return [x * cosine - z * sine, x * sine + z * cosine];
}

/** Whether a table point lies over the plate as it rests at its pose. */
export function pointerCovers(
  plate: Pick<TablePiece, 'position' | 'orientation'>,
  point: Readonly<Vector3Tuple>
): boolean {
  const [x, z] = toPieceFrame(point, plate.position, plate.orientation);
  /* The outline is convex, so a point inside lies on the same side of every edge. */
  let side = 0;
  for (let index = 0; index < POINTER_OUTLINE.length; index += 1) {
    const [ax, az] = POINTER_OUTLINE[index]!;
    const [bx, bz] = POINTER_OUTLINE[(index + 1) % POINTER_OUTLINE.length]!;
    const cross = (bx - ax) * (z - az) - (bz - az) * (x - ax);
    if (cross !== 0) {
      if (side !== 0 && Math.sign(cross) !== side) {
        return false;
      }
      side = Math.sign(cross);
    }
  }
  return true;
}

/** How far a table point lies from the plate as it rests at its pose: zero over the plate, else the gap to its nearest edge. */
export function pointerDistanceTo(
  plate: Pick<TablePiece, 'position' | 'orientation'>,
  point: Readonly<Vector3Tuple>
): number {
  if (pointerCovers(plate, point)) {
    return 0;
  }
  const [x, z] = toPieceFrame(point, plate.position, plate.orientation);
  return Math.min(
    ...POINTER_OUTLINE.map(([ax, az], index) => {
      const [bx, bz] = POINTER_OUTLINE[(index + 1) % POINTER_OUTLINE.length]!;
      const length = (bx - ax) ** 2 + (bz - az) ** 2;
      const along = Math.max(0, Math.min(1, ((x - ax) * (bx - ax) + (z - az) * (bz - az)) / length));
      return Math.hypot(x - (ax + along * (bx - ax)), z - (az + along * (bz - az)));
    })
  );
}
