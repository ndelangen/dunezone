import type { TablePiece, Vector3Tuple } from './model';

/*
 * The HMS: a flat teardrop plate that carries what stands on it.
 * Troops set down on it ride it, so moving the plate moves them, and taking one off leaves it behind.
 * Nothing records who rides: a piece rides while its centre lies over the plate, so every page and the game Worker agree from positions alone.
 */

/** The stack key every HMS carries; it never stacks, whoever owns it. */
export const HMS_STACK_KEY = 'hms';
/** The round end's radius, centred on the plate's position: room for about four troop stacks. */
export const HMS_BODY_RADIUS = 0.62;
/** How far the point reaches from the round end's centre, along the plate's own forward (-z). */
export const HMS_TIP = 1.2;
/** How thick the plate is: what stands on it stands this much higher. */
export const HMS_HEIGHT = 0.05;
/* Enough points that the edge reads as round where a troop rests against it. */
const HMS_ARC_SEGMENTS = 24;

type HmsIdentity = Partial<Pick<TablePiece, 'kind' | 'stackKey'>>;

export function isHmsPiece(piece: HmsIdentity | null | undefined): boolean {
  return piece?.kind === 'marker' && piece.stackKey === HMS_STACK_KEY;
}

/** A point across the table as [x, z]. */
export type PlanePoint = [x: number, z: number];

/**
 * The plate's outline in its own frame, as [x, z] around its round end's centre: the point first, then the round end.
 * Convex, so it serves as the plate's footprint too.
 */
export const HMS_OUTLINE: readonly PlanePoint[] = (() => {
  const tangent = Math.acos(HMS_BODY_RADIUS / HMS_TIP);
  const points: PlanePoint[] = [[0, -HMS_TIP]];
  for (let step = 0; step <= HMS_ARC_SEGMENTS; step += 1) {
    const angle = tangent + ((Math.PI * 2 - tangent * 2) * step) / HMS_ARC_SEGMENTS;
    points.push([HMS_BODY_RADIUS * Math.sin(angle), -HMS_BODY_RADIUS * Math.cos(angle)]);
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
export function hmsCovers(plate: Pick<TablePiece, 'position' | 'orientation'>, point: Readonly<Vector3Tuple>): boolean {
  const [x, z] = toPieceFrame(point, plate.position, plate.orientation);
  /* The outline is convex, so a point inside lies on the same side of every edge. */
  let side = 0;
  for (let index = 0; index < HMS_OUTLINE.length; index += 1) {
    const [ax, az] = HMS_OUTLINE[index]!;
    const [bx, bz] = HMS_OUTLINE[(index + 1) % HMS_OUTLINE.length]!;
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
