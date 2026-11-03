import { isFactionToken } from './factionToken';
import type { TablePiece, Vector3Tuple } from './model';
import type { TableRoster } from './schema';
import { SPICE_FOOTPRINT_RADIUS } from './spice';
import type { PointerRay } from './tableGeometry';
import {
  FACTION_TOKEN_SCALE,
  planarDistance,
  pointOnRayAtHeight,
  stackTopHeight,
  TROOP_FOOTPRINT_RADIUS,
} from './tableGeometry';
import { distanceToSegment, TABLE_PLAY_RADIUS } from './tablePhysics';
import { tableSeatAngles } from './tableSettings';

const FACTION_TOKEN_RADIUS = TROOP_FOOTPRINT_RADIUS * FACTION_TOKEN_SCALE;
/* How far apart setup deals a faction's troop reserves along their arc (setupLayout.ts). */
const RESERVE_SPACING = 0.4;
/* The outermost spot a spice stack still stands wholly on the table. */
const TABLE_EDGE_RADIUS = TABLE_PLAY_RADIUS - SPICE_FOOTPRINT_RADIUS - 0.005;

/** Whether `position` lies over the token of a faction, and which; the token a carry is held over. */
export function factionTokenUnder(pieces: readonly TablePiece[], position: Readonly<Vector3Tuple>) {
  return factionOfToken(factionTokenPieceUnder(pieces, position));
}

/** The faction token whose footprint `position` lies over, read on the table's x and z. */
export function factionTokenPieceUnder(pieces: readonly TablePiece[], position: Readonly<Vector3Tuple>) {
  return pieces.find(
    (piece) => isFactionToken(piece) && planarDistance(piece.position, position) <= FACTION_TOKEN_RADIUS
  );
}

/** The faction a faction token stands for. */
export function factionOfToken(token: TablePiece | undefined) {
  return token?.stackKey?.slice('faction-token:'.length);
}

/* Where a ray meets `height`, or its origin when the origin stands past that height along the ray, so a segment of it never starts behind the camera. */
function rayPointAt({ origin, direction }: PointerRay, height: number): Vector3Tuple | null {
  return pointOnRayAtHeight(origin, direction, height) ?? (Math.abs(direction[1]) < Number.EPSILON ? null : origin);
}

/**
 * The faction token a ray from the camera passes through, face or side, the nearest one when it passes through two.
 * A carried piece rides on the pointer's ray, so this is the token the held piece is seen over, from any camera angle.
 */
export function factionTokenOnRay(pieces: readonly TablePiece[], ray: PointerRay) {
  let nearest: { token: TablePiece; distance: number } | undefined;
  for (const token of pieces) {
    if (!isFactionToken(token)) {
      continue;
    }
    const top = rayPointAt(ray, token.position[1] + stackTopHeight(token));
    const bottom = rayPointAt(ray, token.position[1]);
    const centre = [token.position[0], token.position[2]] as const;
    if (
      !top ||
      !bottom ||
      distanceToSegment([...centre], [top[0], top[2]], [bottom[0], bottom[2]]) > FACTION_TOKEN_RADIUS
    ) {
      continue;
    }
    const distance = Math.hypot(top[0] - ray.origin[0], top[1] - ray.origin[1], top[2] - ray.origin[2]);
    if (!nearest || distance < nearest.distance) {
      nearest = { token, distance };
    }
  }
  return nearest?.token;
}

/** How many troop kinds a faction was dealt, counted by its reserve stacks wherever they are now. */
function troopKindsOf(pieces: readonly TablePiece[], factionId: string) {
  const prefix = `troops:${factionId}:`;
  return new Set(pieces.flatMap((piece) => (piece.stackKey?.startsWith(prefix) ? [piece.stackKey] : []))).size;
}

/* A point `radius` from the board's centre, `offset` along the ring from `angle` (counter-clockwise positive). */
function along(angle: number, radius: number, offset: number): Vector3Tuple {
  const turned = angle + offset / radius;
  return [Math.cos(turned) * radius, 0, Math.sin(turned) * radius];
}

/** The angle a faction's station stands at, as its seat fixed it. */
function seatAngleOf(roster: TableRoster | undefined, factionId: string) {
  const seat = roster?.seats.find((entry) => entry.faction?.id === factionId);
  return roster && seat ? tableSeatAngles(roster.seatCount)[seat.position] : undefined;
}

/**
 * Where `factionId`'s bribe pile stands, or undefined for a faction with no seat.
 * It stands behind the faction's troop reserves at the table's edge, tucked in a gap between two of them.
 */
export function bribePilePosition(
  pieces: readonly TablePiece[],
  roster: TableRoster | undefined,
  factionId: string
): Vector3Tuple | undefined {
  const angle = seatAngleOf(roster, factionId);
  if (angle === undefined) {
    return undefined;
  }
  const kinds = Math.max(1, troopKindsOf(pieces, factionId));
  /* An odd count has a reserve dead centre, so the pile takes the gap beside it; an even count leaves the centre free. */
  return along(angle, TABLE_EDGE_RADIUS, kinds % 2 === 1 ? RESERVE_SPACING / 2 : 0);
}
