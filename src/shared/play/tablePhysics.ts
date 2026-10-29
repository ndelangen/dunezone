import { isOnExtraTable, nearestOnExtraTable } from './boardLayout';
import type { TablePiece, Vector3Tuple } from './model';
import { fromPieceFrame, POINTER_OUTLINE, isPointerToken } from './pointerToken';
import type { PlanePoint } from './pointerToken';
import { BOTTOM_SHELF_POSITION, BOTTOM_SHELF_SIZE, placementAnchorForPose } from './tableFurnitureLayout';
import {
  CARD_FOOTPRINT_HALF_X,
  CARD_FOOTPRINT_HALF_Z,
  circleFootprintRadius,
  nearestBy,
  planarDistance,
  TROOP_FOOTPRINT_RADIUS,
  troopScale,
  tokenBoxRatio,
} from './tableGeometry';

/**
 * Deterministic 2D footprints keep resting tabletop objects separate while matching pieces still form stacks.
 */

type Vector2 = [x: number, z: number];

type CircleFootprint = {
  shape: 'circle';
  radius: number;
};

type BoxFootprint = {
  shape: 'box';
  halfX: number;
  halfZ: number;
};

/* A convex outline in the piece's own frame, as [x, z]: the HMS plate's teardrop. */
type PolygonFootprint = {
  shape: 'polygon';
  points: readonly PlanePoint[];
};

type Footprint = CircleFootprint | BoxFootprint | PolygonFootprint;

type BoxPose = {
  footprint: BoxFootprint;
  center: Vector2;
  orientation: number;
};

export const TABLE_PLAY_RADIUS = 5.55;
/*
 * The Tleilaxu Tanks shelf below the board takes any piece. Its play area starts inside the round table, where
 * the shelf joins it, so a piece can slide from the table onto the shelf without a gap between the two areas.
 */
export const TANKS_PLAY_AREA = {
  minX: BOTTOM_SHELF_POSITION[0] - BOTTOM_SHELF_SIZE[0] / 2,
  maxX: BOTTOM_SHELF_POSITION[0] + BOTTOM_SHELF_SIZE[0] / 2,
  minZ: 4.6,
  maxZ: BOTTOM_SHELF_POSITION[2] + BOTTOM_SHELF_SIZE[2] / 2,
} as const;
const SEARCH_STEP = 0.08;
const SEARCH_RING_COUNT = 96;
const SEARCH_DIRECTIONS = 32;

function footprintFor(piece: TablePiece): Footprint {
  if (isPointerToken(piece)) {
    return { shape: 'polygon', points: POINTER_OUTLINE };
  }
  if (piece.kind === 'card') {
    return {
      shape: 'box',
      halfX: CARD_FOOTPRINT_HALF_X,
      halfZ: CARD_FOOTPRINT_HALF_Z,
    };
  }
  const ratio = tokenBoxRatio(piece);
  if (ratio !== null) {
    const halfX = TROOP_FOOTPRINT_RADIUS * troopScale(piece);
    return { shape: 'box', halfX, halfZ: halfX * ratio };
  }
  return { shape: 'circle', radius: circleFootprintRadius(piece) };
}

function centerOf(position: Vector3Tuple): Vector2 {
  return [position[0], position[2]];
}

function subtract(a: Vector2, b: Vector2): Vector2 {
  return [a[0] - b[0], a[1] - b[1]];
}

function dot(a: Vector2, b: Vector2): number {
  return a[0] * b[0] + a[1] * b[1];
}

function boxAxes(orientation: number): [Vector2, Vector2] {
  const cosine = Math.cos(orientation);
  const sine = Math.sin(orientation);
  return [
    [cosine, -sine],
    [sine, cosine],
  ];
}

function circleOverlapsCircle(a: CircleFootprint, aCenter: Vector2, b: CircleFootprint, bCenter: Vector2): boolean {
  const distance = Math.hypot(aCenter[0] - bCenter[0], aCenter[1] - bCenter[1]);
  return distance < a.radius + b.radius;
}

function circleOverlapsBox(
  circle: CircleFootprint,
  circleCenter: Vector2,
  { footprint: box, center: boxCenter, orientation: boxOrientation }: BoxPose
): boolean {
  const [xAxis, zAxis] = boxAxes(boxOrientation);
  const delta = subtract(circleCenter, boxCenter);
  const localX = dot(delta, xAxis);
  const localZ = dot(delta, zAxis);
  const closestX = Math.max(-box.halfX, Math.min(box.halfX, localX));
  const closestZ = Math.max(-box.halfZ, Math.min(box.halfZ, localZ));
  return Math.hypot(localX - closestX, localZ - closestZ) < circle.radius;
}

function boxProjectionRadius(box: BoxFootprint, orientation: number, axis: Vector2): number {
  const [xAxis, zAxis] = boxAxes(orientation);
  return box.halfX * Math.abs(dot(xAxis, axis)) + box.halfZ * Math.abs(dot(zAxis, axis));
}

function boxOverlapsBox(a: BoxPose, b: BoxPose): boolean {
  const delta = subtract(b.center, a.center);
  const axes = [...boxAxes(a.orientation), ...boxAxes(b.orientation)];
  return axes.every((axis) => {
    const centerDistance = Math.abs(dot(delta, axis));
    const reach =
      boxProjectionRadius(a.footprint, a.orientation, axis) + boxProjectionRadius(b.footprint, b.orientation, axis);
    return centerDistance < reach;
  });
}

/* A box or a convex outline as its corners across the table. */
function worldOutline(footprint: BoxFootprint | PolygonFootprint, position: Vector3Tuple, orientation: number) {
  const points: readonly PlanePoint[] =
    footprint.shape === 'polygon'
      ? footprint.points
      : [
          [-footprint.halfX, -footprint.halfZ],
          [footprint.halfX, -footprint.halfZ],
          [footprint.halfX, footprint.halfZ],
          [-footprint.halfX, footprint.halfZ],
        ];
  return points.map((point) => fromPieceFrame(point, position, orientation));
}

function edgeNormals(points: readonly Vector2[]): Vector2[] {
  return points.map((point, index) => {
    const next = points[(index + 1) % points.length]!;
    return [next[1] - point[1], point[0] - next[0]];
  });
}

function projectionRange(points: readonly Vector2[], axis: Vector2): [number, number] {
  let min = Infinity;
  let max = -Infinity;
  for (const point of points) {
    const projected = dot(point, axis);
    min = Math.min(min, projected);
    max = Math.max(max, projected);
  }
  return [min, max];
}

/* Two convex outlines overlap unless some edge's normal separates them. */
function outlineOverlapsOutline(a: readonly Vector2[], b: readonly Vector2[]): boolean {
  return [...edgeNormals(a), ...edgeNormals(b)].every((axis) => {
    const [aMin, aMax] = projectionRange(a, axis);
    const [bMin, bMax] = projectionRange(b, axis);
    return aMin < bMax && bMin < aMax;
  });
}

function distanceToSegment(point: Vector2, start: Vector2, end: Vector2): number {
  const segment = subtract(end, start);
  const length = dot(segment, segment);
  const along = length === 0 ? 0 : Math.max(0, Math.min(1, dot(subtract(point, start), segment) / length));
  return Math.hypot(point[0] - start[0] - segment[0] * along, point[1] - start[1] - segment[1] * along);
}

function outlineContains(points: readonly Vector2[], point: Vector2): boolean {
  let side = 0;
  for (let index = 0; index < points.length; index += 1) {
    const start = points[index]!;
    const end = points[(index + 1) % points.length]!;
    const cross = (end[0] - start[0]) * (point[1] - start[1]) - (end[1] - start[1]) * (point[0] - start[0]);
    if (cross !== 0) {
      if (side !== 0 && Math.sign(cross) !== side) {
        return false;
      }
      side = Math.sign(cross);
    }
  }
  return true;
}

function circleOverlapsOutline(circle: CircleFootprint, center: Vector2, points: readonly Vector2[]): boolean {
  return (
    outlineContains(points, center) ||
    points.some(
      (point, index) => distanceToSegment(center, point, points[(index + 1) % points.length]!) < circle.radius
    )
  );
}

/* A pair where either side is an outline: boxes join it as their four corners. */
function overlapWithOutline(
  aFootprint: Footprint,
  aPosition: Vector3Tuple,
  aOrientation: number,
  bFootprint: Footprint,
  bPosition: Vector3Tuple,
  bOrientation: number
): boolean {
  if (aFootprint.shape === 'circle') {
    return circleOverlapsOutline(
      aFootprint,
      centerOf(aPosition),
      worldOutline(bFootprint as BoxFootprint | PolygonFootprint, bPosition, bOrientation)
    );
  }
  if (bFootprint.shape === 'circle') {
    return circleOverlapsOutline(bFootprint, centerOf(bPosition), worldOutline(aFootprint, aPosition, aOrientation));
  }
  return outlineOverlapsOutline(
    worldOutline(aFootprint, aPosition, aOrientation),
    worldOutline(bFootprint, bPosition, bOrientation)
  );
}

export function piecesOverlapAt(
  a: TablePiece,
  aPosition: Vector3Tuple,
  b: TablePiece,
  bPosition: Vector3Tuple = b.position
): boolean {
  const aFootprint = footprintFor(a);
  const bFootprint = footprintFor(b);
  if (aFootprint.shape === 'polygon' || bFootprint.shape === 'polygon') {
    return overlapWithOutline(aFootprint, aPosition, a.orientation, bFootprint, bPosition, b.orientation);
  }
  const aCenter = centerOf(aPosition);
  const bCenter = centerOf(bPosition);

  if (aFootprint.shape === 'circle') {
    if (bFootprint.shape === 'circle') {
      return circleOverlapsCircle(aFootprint, aCenter, bFootprint, bCenter);
    }
    return circleOverlapsBox(aFootprint, aCenter, {
      footprint: bFootprint,
      center: bCenter,
      orientation: b.orientation,
    });
  }
  const aBox = { footprint: aFootprint, center: aCenter, orientation: a.orientation };
  if (bFootprint.shape === 'circle') {
    return circleOverlapsBox(bFootprint, bCenter, aBox);
  }
  return boxOverlapsBox(aBox, { footprint: bFootprint, center: bCenter, orientation: b.orientation });
}

/**
 * Troops and markers stack by their key.
 * Cards with one back belong together, whichever deck they were spawned from, and cards with different backs never do.
 * That is what lets two factions' Traitor decks combine and keeps Traitor and Treachery cards apart.
 * A back is its publication address and the word printed on it.
 * Only cards with no back at all fall back to the key.
 */
export function piecesCanStack(a: TablePiece, b: TablePiece): boolean {
  if (a.kind !== b.kind || isPointerToken(a)) {
    return false;
  }
  const sameKey = a.stackKey !== null && a.stackKey === b.stackKey;
  if (a.kind !== 'card') {
    return sameKey;
  }
  const items = [...a.items, ...b.items];
  if (items.every((item) => !item.artwork)) {
    return sameKey;
  }
  const back = a.items[0]?.artwork;
  return (
    a.items.length > 0 &&
    b.items.length > 0 &&
    items.every((item) => item.artwork?.back === back?.back && item.artwork?.backName === back?.backName)
  );
}

export function piecesTouchForStack(source: TablePiece, position: Vector3Tuple, target: TablePiece): boolean {
  if (!piecesCanStack(source, target)) {
    return false;
  }
  const distance = planarDistance(position, target.position);
  const magneticRange = source.kind === 'card' ? 0.95 : 0.36;
  return distance <= magneticRange || piecesOverlapAt(source, position, target);
}

function footprintTableRadius(piece: TablePiece): number {
  const footprint = footprintFor(piece);
  if (footprint.shape === 'circle') {
    return footprint.radius;
  }
  if (footprint.shape === 'polygon') {
    return Math.max(...footprint.points.map(([x, z]) => Math.hypot(x, z)));
  }
  return Math.hypot(footprint.halfX, footprint.halfZ);
}

function isOnRoundTable(piece: TablePiece, position: Vector3Tuple): boolean {
  return Math.hypot(position[0], position[2]) + footprintTableRadius(piece) <= TABLE_PLAY_RADIUS;
}

function isOnTanksShelf(piece: TablePiece, position: Vector3Tuple): boolean {
  const reach = footprintTableRadius(piece);
  return (
    position[0] - reach >= TANKS_PLAY_AREA.minX &&
    position[0] + reach <= TANKS_PLAY_AREA.maxX &&
    position[2] - reach >= TANKS_PLAY_AREA.minZ &&
    position[2] + reach <= TANKS_PLAY_AREA.maxZ
  );
}

const JOIN_SAMPLE_COUNT = 32;

function isPointOnTabletop(x: number, z: number, extraBoards: number): boolean {
  return (
    Math.hypot(x, z) <= TABLE_PLAY_RADIUS ||
    (x >= TANKS_PLAY_AREA.minX &&
      x <= TANKS_PLAY_AREA.maxX &&
      z >= TANKS_PLAY_AREA.minZ &&
      z <= TANKS_PLAY_AREA.maxZ) ||
    isOnExtraTable(extraBoards, x, z)
  );
}

/*
 * A piece may straddle a join, between the round table and the Tanks shelf or onto the table round an extra board,
 * when its whole reach lies on one part or another.
 */
function isAcrossTableJoin(piece: TablePiece, position: Vector3Tuple, extraBoards: number): boolean {
  const reach = footprintTableRadius(piece);
  for (let sample = 0; sample < JOIN_SAMPLE_COUNT; sample += 1) {
    const angle = (sample / JOIN_SAMPLE_COUNT) * Math.PI * 2;
    if (!isPointOnTabletop(position[0] + Math.cos(angle) * reach, position[2] + Math.sin(angle) * reach, extraBoards)) {
      return false;
    }
  }
  return true;
}

function clampToRoundTable(piece: TablePiece, position: Vector3Tuple): Vector3Tuple {
  const maxCenterRadius = TABLE_PLAY_RADIUS - footprintTableRadius(piece);
  const distanceFromCenter = Math.hypot(position[0], position[2]);
  if (distanceFromCenter <= maxCenterRadius) {
    return [...position];
  }
  const scale = maxCenterRadius / distanceFromCenter;
  return [position[0] * scale, position[1], position[2] * scale];
}

function clampToTanksShelf(piece: TablePiece, position: Vector3Tuple): Vector3Tuple {
  const reach = footprintTableRadius(piece);
  const clamp = (value: number, min: number, max: number) => Math.min(Math.max(value, min), max);
  return [
    clamp(position[0], TANKS_PLAY_AREA.minX + reach, TANKS_PLAY_AREA.maxX - reach),
    position[1],
    clamp(position[2], TANKS_PLAY_AREA.minZ + reach, TANKS_PLAY_AREA.maxZ - reach),
  ];
}

/* The spot nearest `position`, toward the middle, where the piece lies wholly on the table the extra boards add. */
function clampToExtraTable(piece: TablePiece, position: Vector3Tuple, extraBoards: number): Vector3Tuple[] {
  if (extraBoards === 0) {
    return [];
  }
  const [x, z] = nearestOnExtraTable(extraBoards, position[0], position[2], footprintTableRadius(piece));
  return [[x, position[1], z]];
}

export function clampPositionToTable(piece: TablePiece, position: Vector3Tuple, extraBoards = 0): Vector3Tuple {
  if (isSupportedPosition(piece, position, extraBoards)) {
    return [...position];
  }
  const candidates = [
    clampToRoundTable(piece, position),
    clampToTanksShelf(piece, position),
    ...clampToExtraTable(piece, position, extraBoards),
  ];
  return nearestBy(candidates, (candidate) => planarDistance(candidate, position)) ?? candidates[0]!;
}

function isSupportedPosition(piece: TablePiece, position: Vector3Tuple, extraBoards: number): boolean {
  return (
    placementAnchorForPose(piece, position) !== null ||
    isOnRoundTable(piece, position) ||
    isOnTanksShelf(piece, position) ||
    isAcrossTableJoin(piece, position, extraBoards)
  );
}

export function isOverlapFreePosition(
  movingPiece: TablePiece,
  position: Vector3Tuple,
  obstacles: TablePiece[]
): boolean {
  /* Pieces stand on an HMS plate rather than beside it, so a plate is in the way only of another plate. */
  const plateMoving = isPointerToken(movingPiece);
  return obstacles.every(
    (obstacle) =>
      !!obstacle.inventory ||
      obstacle.items.length === 0 ||
      (isPointerToken(obstacle) && !plateMoving) ||
      !piecesOverlapAt(movingPiece, position, obstacle)
  );
}

export function isCollisionFreePosition(
  movingPiece: TablePiece,
  position: Vector3Tuple,
  obstacles: TablePiece[],
  extraBoards = 0
): boolean {
  return (
    isSupportedPosition(movingPiece, position, extraBoards) && isOverlapFreePosition(movingPiece, position, obstacles)
  );
}

function searchAngleFor(pieceId: string): number {
  /* Preserve the leading UTF-16 unit used to place existing piece IDs. */
  const seed = Array.from(pieceId).reduce((sum, character, index) => sum + character.charCodeAt(0) * (index + 1), 0);
  return ((seed % SEARCH_DIRECTIONS) / SEARCH_DIRECTIONS) * Math.PI * 2;
}

/**
 * The free spot nearest the requested one, searched in rings outward.
 * `fits` adds a condition of the caller's own, such as room for what rides the moving piece.
 */
export function nearestCollisionFreePosition(
  movingPiece: TablePiece,
  requestedPosition: Vector3Tuple,
  obstacles: TablePiece[],
  fits: (position: Vector3Tuple) => boolean = () => true,
  extraBoards = 0
): Vector3Tuple | null {
  const free = (position: Vector3Tuple) =>
    isCollisionFreePosition(movingPiece, position, obstacles, extraBoards) && fits(position);
  if (free(requestedPosition)) {
    return [...requestedPosition];
  }

  const firstAngle = searchAngleFor(movingPiece.id);
  for (let ring = 1; ring <= SEARCH_RING_COUNT; ring += 1) {
    const radius = ring * SEARCH_STEP;
    for (let direction = 0; direction < SEARCH_DIRECTIONS; direction += 1) {
      const angle = firstAngle + (direction / SEARCH_DIRECTIONS) * Math.PI * 2;
      const candidate: Vector3Tuple = [
        requestedPosition[0] + Math.cos(angle) * radius,
        requestedPosition[1],
        requestedPosition[2] + Math.sin(angle) * radius,
      ];
      if (free(candidate)) {
        return candidate;
      }
    }
  }

  return null;
}
