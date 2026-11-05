import { isBattleLeader } from './battle';
import { topItemFaceUp } from './model';
import type { TablePiece, Vector3Tuple } from './model';
import { fromPieceFrame, POINTER_OUTLINE, isPointerToken, pointerCovers } from './pointerToken';
import type { PlanePoint } from './pointerToken';
import { placementAnchorForPose } from './tableFurnitureLayout';
import {
  CARD_FOOTPRINT_HALF_X,
  CARD_FOOTPRINT_HALF_Z,
  circleFootprintRadius,
  isLeaderPiece,
  planarDistance,
  TROOP_BOTTOM_RADIUS,
  TROOP_FOOTPRINT_RADIUS,
  troopScale,
  tokenBoxRatio,
} from './tableGeometry';
import { isInTanks, isOnBottomShelf, nearestBottomShelfEdge, TANKS_PAD } from './tanksShelf';

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

/** How far a piece's footprint reaches from its centre at most: its radius when round, its corners' distance otherwise. */
export function footprintReach(piece: TablePiece): number {
  const footprint = footprintFor(piece);
  if (footprint.shape === 'circle') {
    return footprint.radius;
  }
  if (footprint.shape === 'box') {
    return Math.hypot(footprint.halfX, footprint.halfZ);
  }
  return Math.max(...footprint.points.map(([x, z]) => Math.hypot(x, z)));
}

/** A piece's footprint outline across the table at `position`, corner by corner; undefined for a round one. */
export function footprintOutline(piece: TablePiece, position: Vector3Tuple = piece.position): Vector2[] | undefined {
  const footprint = footprintFor(piece);
  return footprint.shape === 'circle' ? undefined : worldOutline(footprint, position, piece.orientation);
}

/** Whether a piece rests on a round footprint: a troop, leader or spice stack, or a round marker. */
export function hasRoundFootprint(piece: TablePiece): boolean {
  return footprintFor(piece).shape === 'circle';
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

/** A token that may fight as a leader, lying face down: a hidden leader, which no other token may join or be joined by. */
function isHiddenLeader(piece: TablePiece): boolean {
  return isBattleLeader(piece) && !topItemFaceUp(piece);
}

/**
 * Troops and markers stack by their key.
 * A face-down token that may fight as a leader never stacks, so that which leader it is cannot be told by what it stacks with.
 * Cards with one back belong together, whichever deck they were spawned from, and cards with different backs never do.
 * That is what lets two factions' Traitor decks combine and keeps Traitor and Treachery cards apart.
 * A back is its publication address and the word printed on it.
 * Only cards with no back at all fall back to the key.
 */
export function piecesCanStack(a: TablePiece, b: TablePiece): boolean {
  if (a.kind !== b.kind || isPointerToken(a) || isHiddenLeader(a) || isHiddenLeader(b)) {
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

/** Whether `piece` at `position` stands wholly on the round table, off the Tanks shelf. */
export function isOnRoundTable(piece: TablePiece, position: Vector3Tuple): boolean {
  return Math.hypot(position[0], position[2]) + footprintTableRadius(piece) <= TABLE_PLAY_RADIUS;
}

const PLATE_SAMPLE_COUNT = 32;

function isPointOnTabletop(x: number, z: number): boolean {
  return Math.hypot(x, z) <= TABLE_PLAY_RADIUS || isOnBottomShelf(x, z);
}

/**
 * Whether a piece's whole reach lies over the round table or the bottom shelf, which takes any piece.
 * The shelf joins the round table, so a piece may also straddle the join.
 */
function isOnPlate(piece: TablePiece, position: Vector3Tuple): boolean {
  const reach = footprintTableRadius(piece);
  if (Math.hypot(position[0], position[2]) + reach <= TABLE_PLAY_RADIUS) {
    return true;
  }
  if (!isPointOnTabletop(position[0], position[2])) {
    return false;
  }
  for (let sample = 0; sample < PLATE_SAMPLE_COUNT; sample += 1) {
    const angle = (sample / PLATE_SAMPLE_COUNT) * Math.PI * 2;
    if (!isPointOnTabletop(position[0] + Math.cos(angle) * reach, position[2] + Math.sin(angle) * reach)) {
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

/* Where a drop off the shelf's far edges heads when it cannot step straight in: the middle of the Tanks pad. */
const SHELF_HEART: readonly [number, number] = [0, (TANKS_PAD.innerRadius + TANKS_PAD.outerRadius) / 2];
const SHELF_CLAMP_STEP = 0.02;

/** The nearest place on the bottom shelf where the piece's whole reach fits: a step in from the nearest point of its edge. */
function clampToBottomShelf(piece: TablePiece, position: Vector3Tuple): Vector3Tuple {
  const reach = footprintTableRadius(piece);
  const { point, inward } = nearestBottomShelfEdge(position[0], position[2]);
  const stepped: Vector3Tuple = [
    point[0] + inward[0] * (reach + 1e-6),
    position[1],
    point[1] + inward[1] * (reach + 1e-6),
  ];
  if (isOnPlate(piece, stepped)) {
    return stepped;
  }
  /* Into a corner the edge's own direction leads out again, so walk toward the pad's middle until the piece fits. */
  const toHeart = Math.hypot(SHELF_HEART[0] - point[0], SHELF_HEART[1] - point[1]);
  for (let travelled = SHELF_CLAMP_STEP; travelled < toHeart; travelled += SHELF_CLAMP_STEP) {
    const t = travelled / toHeart;
    const candidate: Vector3Tuple = [
      point[0] + (SHELF_HEART[0] - point[0]) * t,
      position[1],
      point[1] + (SHELF_HEART[1] - point[1]) * t,
    ];
    if (isOnPlate(piece, candidate)) {
      return candidate;
    }
  }
  return [SHELF_HEART[0], position[1], SHELF_HEART[1]];
}

export function clampPositionToTable(piece: TablePiece, position: Vector3Tuple): Vector3Tuple {
  if (isSupportedPosition(piece, position)) {
    return [...position];
  }
  const onTable = clampToRoundTable(piece, position);
  const onTanks = clampToBottomShelf(piece, position);
  const distance = (candidate: Vector3Tuple) => planarDistance(candidate, position);
  return distance(onTanks) < distance(onTable) ? onTanks : onTable;
}

function isSupportedPosition(piece: TablePiece, position: Vector3Tuple): boolean {
  return (
    placementAnchorForPose(piece, position) !== null || isOnRoundTable(piece, position) || isOnPlate(piece, position)
  );
}

/*
 * Leader discs in the Tanks may overlap a little, the way discs tossed into a pile do (#2675): one leader keeps this far from another's centre,
 * against the 0.7 their footprints alone would keep. A leader that lands overlapping others rests a hair above them.
 * Everywhere else, on the board, in wells and on plates, leaders keep their whole footprint apart.
 */
export const LEADER_SPACING = 0.54;
const LEADER_OVERLAP_LIFT = 0.004;

export function isOverlapFreePosition(
  movingPiece: TablePiece,
  position: Vector3Tuple,
  obstacles: TablePiece[]
): boolean {
  /* Pieces stand on an HMS plate rather than beside it, so a plate is in the way only of another plate. */
  const plateMoving = isPointerToken(movingPiece);
  const leaderMoving = isLeaderPiece(movingPiece);
  const plates = obstacles.filter((obstacle) => isPointerToken(obstacle) && !obstacle.inventory);
  /* A plate lifts its riders to one height, so leaders on a plate keep their whole footprint apart even in the Tanks. */
  const inPile = (point: Vector3Tuple) => isInTanks(point) && !plates.some((plate) => pointerCovers(plate, point));
  return obstacles.every(
    (obstacle) =>
      !!obstacle.inventory ||
      obstacle.items.length === 0 ||
      (isPointerToken(obstacle) && !plateMoving) ||
      (leaderMoving && isLeaderPiece(obstacle) && inPile(position) && inPile(obstacle.position)
        ? planarDistance(position, obstacle.position) >= LEADER_SPACING
        : !piecesOverlapAt(movingPiece, position, obstacle))
  );
}

/**
 * Where a leader rests among the leaders it lands across: just above the highest of them, so the newest disc lies on top and two faces never share a height.
 * Any other piece rests where it is.
 */
export function restingAmongLeaders(
  piece: TablePiece,
  position: Vector3Tuple,
  others: readonly TablePiece[]
): Vector3Tuple {
  if (!isLeaderPiece(piece)) {
    return position;
  }
  /* Drawn discs touch at their bases' width, a little inside the footprint a leader keeps from other pieces. */
  const width = 2 * TROOP_BOTTOM_RADIUS * troopScale(piece);
  const below = others.filter(
    (other) => other.id !== piece.id && isLeaderPiece(other) && planarDistance(position, other.position) < width
  );
  if (below.length === 0) {
    return position;
  }
  const top = Math.max(...below.map((other) => other.position[1]));
  return [position[0], Math.max(position[1], top + LEADER_OVERLAP_LIFT), position[2]];
}

export function isCollisionFreePosition(
  movingPiece: TablePiece,
  position: Vector3Tuple,
  obstacles: TablePiece[]
): boolean {
  return isSupportedPosition(movingPiece, position) && isOverlapFreePosition(movingPiece, position, obstacles);
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
  fits: (position: Vector3Tuple) => boolean = () => true
): Vector3Tuple | null {
  const free = (position: Vector3Tuple) => isCollisionFreePosition(movingPiece, position, obstacles) && fits(position);
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
