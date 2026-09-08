import type { TablePiece, Vector3Tuple } from './model';
import { placementAnchorForPose } from './tableFurnitureLayout';
import {
  CARD_FOOTPRINT_HALF_X,
  CARD_FOOTPRINT_HALF_Z,
  FORCE_FOOTPRINT_RADIUS,
  MARKER_FOOTPRINT_RADIUS,
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

type Footprint = CircleFootprint | BoxFootprint;

export const TABLE_PLAY_RADIUS = 5.55;
const SEARCH_STEP = 0.08;
const SEARCH_RING_COUNT = 96;
const SEARCH_DIRECTIONS = 32;

function footprintFor(piece: TablePiece): Footprint {
  if (piece.kind === 'card') {
    return {
      shape: 'box',
      halfX: CARD_FOOTPRINT_HALF_X,
      halfZ: CARD_FOOTPRINT_HALF_Z,
    };
  }
  return {
    shape: 'circle',
    radius: piece.kind === 'marker' ? MARKER_FOOTPRINT_RADIUS : FORCE_FOOTPRINT_RADIUS,
  };
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
  box: BoxFootprint,
  boxCenter: Vector2,
  boxOrientation: number
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

function boxOverlapsBox(
  a: BoxFootprint,
  aCenter: Vector2,
  aOrientation: number,
  b: BoxFootprint,
  bCenter: Vector2,
  bOrientation: number
): boolean {
  const delta = subtract(bCenter, aCenter);
  const axes = [...boxAxes(aOrientation), ...boxAxes(bOrientation)];
  return axes.every((axis) => {
    const centerDistance = Math.abs(dot(delta, axis));
    const reach = boxProjectionRadius(a, aOrientation, axis) + boxProjectionRadius(b, bOrientation, axis);
    return centerDistance < reach;
  });
}

export function piecesOverlapAt(
  a: TablePiece,
  aPosition: Vector3Tuple,
  b: TablePiece,
  bPosition: Vector3Tuple = b.position
): boolean {
  const aFootprint = footprintFor(a);
  const bFootprint = footprintFor(b);
  const aCenter = centerOf(aPosition);
  const bCenter = centerOf(bPosition);

  if (aFootprint.shape === 'circle' && bFootprint.shape === 'circle') {
    return circleOverlapsCircle(aFootprint, aCenter, bFootprint, bCenter);
  }
  if (aFootprint.shape === 'circle' && bFootprint.shape === 'box') {
    return circleOverlapsBox(aFootprint, aCenter, bFootprint, bCenter, b.orientation);
  }
  if (aFootprint.shape === 'box' && bFootprint.shape === 'circle') {
    return circleOverlapsBox(bFootprint, bCenter, aFootprint, aCenter, a.orientation);
  }
  if (aFootprint.shape === 'box' && bFootprint.shape === 'box') {
    return boxOverlapsBox(aFootprint, aCenter, a.orientation, bFootprint, bCenter, b.orientation);
  }
  return false;
}

export function piecesCanStack(a: TablePiece, b: TablePiece): boolean {
  return a.kind === b.kind && a.stackKey !== null && a.stackKey === b.stackKey;
}

export function piecesTouchForStack(source: TablePiece, position: Vector3Tuple, target: TablePiece): boolean {
  if (!piecesCanStack(source, target)) {
    return false;
  }
  const distance = Math.hypot(position[0] - target.position[0], position[2] - target.position[2]);
  const magneticRange = source.kind === 'card' ? 0.95 : 0.36;
  return distance <= magneticRange || piecesOverlapAt(source, position, target);
}

function footprintTableRadius(piece: TablePiece): number {
  const footprint = footprintFor(piece);
  if (footprint.shape === 'circle') {
    return footprint.radius;
  }
  return Math.hypot(footprint.halfX, footprint.halfZ);
}

export function clampPositionToTable(piece: TablePiece, position: Vector3Tuple): Vector3Tuple {
  if (placementAnchorForPose(piece, position)) {
    return [...position];
  }
  const maxCenterRadius = TABLE_PLAY_RADIUS - footprintTableRadius(piece);
  const distanceFromCenter = Math.hypot(position[0], position[2]);
  if (distanceFromCenter <= maxCenterRadius) {
    return [...position];
  }
  const scale = maxCenterRadius / distanceFromCenter;
  return [position[0] * scale, position[1], position[2] * scale];
}

function isSupportedPosition(piece: TablePiece, position: Vector3Tuple): boolean {
  return (
    placementAnchorForPose(piece, position) !== null ||
    Math.hypot(position[0], position[2]) + footprintTableRadius(piece) <= TABLE_PLAY_RADIUS
  );
}

export function isOverlapFreePosition(
  movingPiece: TablePiece,
  position: Vector3Tuple,
  obstacles: TablePiece[]
): boolean {
  return obstacles.every(
    (obstacle) => obstacle.items.length === 0 || !piecesOverlapAt(movingPiece, position, obstacle)
  );
}

export function isCollisionFreePosition(
  movingPiece: TablePiece,
  position: Vector3Tuple,
  obstacles: TablePiece[]
): boolean {
  return isSupportedPosition(movingPiece, position) && isOverlapFreePosition(movingPiece, position, obstacles);
}

function searchAngleFor(pieceId: string): number {
  const seed = [...pieceId].reduce((sum, character, index) => sum + character.charCodeAt(0) * (index + 1), 0);
  return ((seed % SEARCH_DIRECTIONS) / SEARCH_DIRECTIONS) * Math.PI * 2;
}

export function nearestCollisionFreePosition(
  movingPiece: TablePiece,
  requestedPosition: Vector3Tuple,
  obstacles: TablePiece[]
): Vector3Tuple | null {
  if (isCollisionFreePosition(movingPiece, requestedPosition, obstacles)) {
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
      if (isCollisionFreePosition(movingPiece, candidate, obstacles)) {
        return candidate;
      }
    }
  }

  return null;
}
