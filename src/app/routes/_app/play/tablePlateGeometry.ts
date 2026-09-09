import { Shape } from 'three';

import type { Vector3Tuple } from './model';
import {
  BOTTOM_SHELF_POSITION,
  BOTTOM_SHELF_SIZE,
  FURNITURE_SURFACE_Y,
  SIDE_SHELF_CENTER_X,
  SIDE_SHELF_SIZE,
} from './tableFurnitureLayout';
import { BOARD_RIM_RADIUS, BOARD_RIM_SURFACE_Y, TABLE_VISIBLE_RADIUS } from './tableGeometry';
import { DEFAULT_TABLE_SEAT_COUNT, PLAYER_RING_RADIUS, PLAYER_STATION_RADIUS, tableSeatAngles } from './tableSettings';
import type { TableSeatCount } from './tableSettings';
import { TRACKER_DISC_CONTENT_Y } from './tableTrackers';
import type { TrackerArcSlot } from './tableTrackers';

export const TABLE_PLATE_CORNER_RADIUS = 0.32;
const TABLE_PLATE_JOIN_RADIUS = 0.18;
export const TABLE_PLATE_THICKNESS = SIDE_SHELF_SIZE[1];
const TABLE_BASE_OUTLINE_SCALE = 1.022;
const TABLE_BASE_THICKNESS = 0.58;
const TABLE_BASE_OVERLAP = 0.055;
export const TRACKER_SCALLOP_BORDER = 0.16;

export const TABLE_PLATE_BOUNDS = {
  minX: -(SIDE_SHELF_CENTER_X + SIDE_SHELF_SIZE[0] / 2),
  maxX: SIDE_SHELF_CENTER_X + SIDE_SHELF_SIZE[0] / 2,
  minZ: -TABLE_VISIBLE_RADIUS,
  maxZ: BOTTOM_SHELF_POSITION[2] + BOTTOM_SHELF_SIZE[2] / 2,
} as const;

export const TABLE_PLATE_JOINS = {
  sideX: Math.sqrt(TABLE_VISIBLE_RADIUS * TABLE_VISIBLE_RADIUS - (SIDE_SHELF_SIZE[2] / 2) * (SIDE_SHELF_SIZE[2] / 2)),
  bottomZ: Math.sqrt(
    TABLE_VISIBLE_RADIUS * TABLE_VISIBLE_RADIUS - (BOTTOM_SHELF_SIZE[0] / 2) * (BOTTOM_SHELF_SIZE[0] / 2)
  ),
} as const;

function pointOnCircle(angle: number): [x: number, z: number] {
  return [Math.cos(angle) * TABLE_VISIBLE_RADIUS, Math.sin(angle) * TABLE_VISIBLE_RADIUS];
}

export function trackerScallopRadius(slot: TrackerArcSlot): number {
  return slot.radius + TRACKER_SCALLOP_BORDER;
}

export function tablePlateBounds(slots: readonly TrackerArcSlot[]) {
  return slots.reduce(
    (bounds, slot) => {
      const radius = trackerScallopRadius(slot);
      return {
        minX: Math.min(bounds.minX, slot.position[0] - radius),
        maxX: Math.max(bounds.maxX, slot.position[0] + radius),
        minZ: Math.min(bounds.minZ, slot.position[2] - radius),
        maxZ: Math.max(bounds.maxZ, slot.position[2] + radius),
      };
    },
    { ...TABLE_PLATE_BOUNDS }
  );
}

function appendCircleBoundary(points: Vector3Tuple[], center: Vector3Tuple, radius: number, sampleCount: number) {
  for (let sample = 0; sample < sampleCount; sample += 1) {
    const angle = (sample / sampleCount) * Math.PI * 2;
    points.push([center[0] + Math.cos(angle) * radius, center[1], center[2] + Math.sin(angle) * radius]);
  }
}

export function mapViewFramingPoints(
  slots: readonly TrackerArcSlot[],
  seatCount: TableSeatCount = DEFAULT_TABLE_SEAT_COUNT
): Vector3Tuple[] {
  const points: Vector3Tuple[] = [];
  appendCircleBoundary(points, [0, BOARD_RIM_SURFACE_Y, 0], BOARD_RIM_RADIUS, 96);
  tableSeatAngles(seatCount).forEach((angle) => {
    appendCircleBoundary(
      points,
      [Math.cos(angle) * PLAYER_RING_RADIUS, BOARD_RIM_SURFACE_Y + 0.001, Math.sin(angle) * PLAYER_RING_RADIUS],
      PLAYER_STATION_RADIUS,
      48
    );
  });
  slots.forEach((slot) => {
    appendCircleBoundary(points, slot.position, trackerScallopRadius(slot), 48);
    appendCircleBoundary(points, [slot.position[0], TRACKER_DISC_CONTENT_Y, slot.position[2]], slot.radius, 48);
  });
  return points;
}

function normalizedCrownAngle(angle: number): number {
  return angle < 0 ? angle + Math.PI * 2 : angle;
}

function trackerAngularBounds(slot: TrackerArcSlot): [number, number] {
  const centerAngle = normalizedCrownAngle(slot.angle);
  const halfExtent = Math.asin(trackerScallopRadius(slot) / slot.arcRadius);
  return [centerAngle - halfExtent, centerAngle + halfExtent];
}

function crownRadiusAt(angle: number, slots: readonly TrackerArcSlot[]): number {
  const directionX = Math.cos(angle);
  const directionZ = Math.sin(angle);
  let radius = TABLE_VISIBLE_RADIUS;

  for (const slot of slots) {
    const centerX = slot.position[0];
    const centerZ = slot.position[2];
    const projection = centerX * directionX + centerZ * directionZ;
    const perpendicularDistanceSquared = centerX * centerX + centerZ * centerZ - projection * projection;
    const scallopRadius = trackerScallopRadius(slot);
    const discriminant = scallopRadius * scallopRadius - perpendicularDistanceSquared;

    if (discriminant >= 0) {
      radius = Math.max(radius, projection + Math.sqrt(discriminant));
    }
  }

  return radius;
}

function trackerTangentPoint(angle: number, slot: TrackerArcSlot): [x: number, z: number] {
  const scallopRadius = trackerScallopRadius(slot);
  const radius = Math.sqrt(slot.arcRadius * slot.arcRadius - scallopRadius * scallopRadius);
  return [Math.cos(angle) * radius, Math.sin(angle) * radius];
}

function appendTrackerCrown(
  shape: Shape,
  slots: readonly TrackerArcSlot[],
  leftResumeAngle: number,
  rightResumeAngle: number
) {
  const [firstTracker, ...remainingTrackers] = slots.map((slot) => ({
    bounds: trackerAngularBounds(slot),
    slot,
  }));
  if (!firstTracker) {
    shape.absarc(0, 0, TABLE_VISIBLE_RADIUS, leftResumeAngle, rightResumeAngle, false);
    return;
  }

  const leftTracker = remainingTrackers.reduce(
    (leftmost, tracker) => (tracker.bounds[0] < leftmost.bounds[0] ? tracker : leftmost),
    firstTracker
  );
  const rightTracker = remainingTrackers.reduce(
    (rightmost, tracker) => (tracker.bounds[1] > rightmost.bounds[1] ? tracker : rightmost),
    firstTracker
  );
  const startAngle = leftTracker.bounds[0];
  const endAngle = rightTracker.bounds[1];
  const joinAngle = TABLE_PLATE_JOIN_RADIUS / TABLE_VISIBLE_RADIUS;
  const leftJoinStartAngle = startAngle - joinAngle;
  const rightJoinEndAngle = endAngle + joinAngle;

  shape.absarc(0, 0, TABLE_VISIBLE_RADIUS, leftResumeAngle, leftJoinStartAngle, false);
  shape.quadraticCurveTo(...pointOnCircle(startAngle), ...trackerTangentPoint(startAngle, leftTracker.slot));

  const sampleCount = Math.max(192, Math.ceil((endAngle - startAngle) * 96), slots.length * 28);

  for (let index = 1; index < sampleCount; index += 1) {
    const angle = startAngle + ((endAngle - startAngle) * index) / sampleCount;
    const radius = crownRadiusAt(angle, slots);
    shape.lineTo(Math.cos(angle) * radius, Math.sin(angle) * radius);
  }

  shape.lineTo(...trackerTangentPoint(endAngle, rightTracker.slot));
  shape.quadraticCurveTo(...pointOnCircle(endAngle), ...pointOnCircle(rightJoinEndAngle));
  shape.absarc(0, 0, TABLE_VISIBLE_RADIUS, rightJoinEndAngle, rightResumeAngle, false);
}

export function createRoundedRectangleShape(width: number, depth: number, requestedRadius: number): Shape {
  const halfWidth = width / 2;
  const halfDepth = depth / 2;
  const radius = Math.max(0, Math.min(requestedRadius, halfWidth, halfDepth));
  const shape = new Shape();

  shape.moveTo(-halfWidth + radius, -halfDepth);
  shape.lineTo(halfWidth - radius, -halfDepth);
  shape.absarc(halfWidth - radius, -halfDepth + radius, radius, -Math.PI / 2, 0, false);
  shape.lineTo(halfWidth, halfDepth - radius);
  shape.absarc(halfWidth - radius, halfDepth - radius, radius, 0, Math.PI / 2, false);
  shape.lineTo(-halfWidth + radius, halfDepth);
  shape.absarc(-halfWidth + radius, halfDepth - radius, radius, Math.PI / 2, Math.PI, false);
  shape.lineTo(-halfWidth, -halfDepth + radius);
  shape.absarc(-halfWidth + radius, -halfDepth + radius, radius, Math.PI, (Math.PI * 3) / 2, false);
  shape.closePath();

  return shape;
}

export function createTablePlateShape(slots: readonly TrackerArcSlot[] = []): Shape {
  const radius = TABLE_VISIBLE_RADIUS;
  const sideHalfDepth = SIDE_SHELF_SIZE[2] / 2;
  const sideOuterX = TABLE_PLATE_BOUNDS.maxX;
  const sideJoinX = TABLE_PLATE_JOINS.sideX;
  const bottomHalfWidth = BOTTOM_SHELF_SIZE[0] / 2;
  const bottomOuterZ = TABLE_PLATE_BOUNDS.maxZ;
  const bottomJoinZ = TABLE_PLATE_JOINS.bottomZ;
  const sideAngle = Math.asin(sideHalfDepth / radius);
  const bottomAngle = Math.atan2(bottomJoinZ, bottomHalfWidth);
  const joinAngle = TABLE_PLATE_JOIN_RADIUS / radius;
  const cornerRadius = TABLE_PLATE_CORNER_RADIUS;
  const shape = new Shape();

  const rightSideResume = pointOnCircle(-sideAngle - joinAngle);
  shape.moveTo(...rightSideResume);
  shape.quadraticCurveTo(sideJoinX, -sideHalfDepth, sideJoinX + TABLE_PLATE_JOIN_RADIUS, -sideHalfDepth);
  shape.lineTo(sideOuterX - cornerRadius, -sideHalfDepth);
  shape.absarc(sideOuterX - cornerRadius, -sideHalfDepth + cornerRadius, cornerRadius, -Math.PI / 2, 0, false);
  shape.lineTo(sideOuterX, sideHalfDepth - cornerRadius);
  shape.absarc(sideOuterX - cornerRadius, sideHalfDepth - cornerRadius, cornerRadius, 0, Math.PI / 2, false);
  shape.lineTo(sideJoinX + TABLE_PLATE_JOIN_RADIUS, sideHalfDepth);
  const rightSideLowerResume = pointOnCircle(sideAngle + joinAngle);
  shape.quadraticCurveTo(sideJoinX, sideHalfDepth, ...rightSideLowerResume);

  shape.absarc(0, 0, radius, sideAngle + joinAngle, bottomAngle - joinAngle, false);
  shape.quadraticCurveTo(bottomHalfWidth, bottomJoinZ, bottomHalfWidth, bottomJoinZ + TABLE_PLATE_JOIN_RADIUS);
  shape.lineTo(bottomHalfWidth, bottomOuterZ - cornerRadius);
  shape.absarc(bottomHalfWidth - cornerRadius, bottomOuterZ - cornerRadius, cornerRadius, 0, Math.PI / 2, false);
  shape.lineTo(-bottomHalfWidth + cornerRadius, bottomOuterZ);
  shape.absarc(-bottomHalfWidth + cornerRadius, bottomOuterZ - cornerRadius, cornerRadius, Math.PI / 2, Math.PI, false);
  shape.lineTo(-bottomHalfWidth, bottomJoinZ + TABLE_PLATE_JOIN_RADIUS);
  const leftBottomResume = pointOnCircle(Math.PI - bottomAngle + joinAngle);
  shape.quadraticCurveTo(-bottomHalfWidth, bottomJoinZ, ...leftBottomResume);

  shape.absarc(0, 0, radius, Math.PI - bottomAngle + joinAngle, Math.PI - sideAngle - joinAngle, false);
  shape.quadraticCurveTo(-sideJoinX, sideHalfDepth, -sideJoinX - TABLE_PLATE_JOIN_RADIUS, sideHalfDepth);
  shape.lineTo(-sideOuterX + cornerRadius, sideHalfDepth);
  shape.absarc(-sideOuterX + cornerRadius, sideHalfDepth - cornerRadius, cornerRadius, Math.PI / 2, Math.PI, false);
  shape.lineTo(-sideOuterX, -sideHalfDepth + cornerRadius);
  shape.absarc(
    -sideOuterX + cornerRadius,
    -sideHalfDepth + cornerRadius,
    cornerRadius,
    Math.PI,
    (Math.PI * 3) / 2,
    false
  );
  shape.lineTo(-sideJoinX - TABLE_PLATE_JOIN_RADIUS, -sideHalfDepth);
  const leftSideResumeAngle = Math.PI + sideAngle + joinAngle;
  const rightSideResumeAngle = Math.PI * 2 - sideAngle - joinAngle;
  const leftSideResume = pointOnCircle(leftSideResumeAngle);
  shape.quadraticCurveTo(-sideJoinX, -sideHalfDepth, ...leftSideResume);
  appendTrackerCrown(shape, slots, leftSideResumeAngle, rightSideResumeAngle);
  shape.closePath();

  return shape;
}

type TablePlateLayer = Readonly<{
  shape: Shape;
  outlineScale: number;
  surfaceY: number;
  thickness: number;
}>;

export type TablePlateLayers = Readonly<{
  upper: TablePlateLayer;
  lower: TablePlateLayer;
}>;

export function createTablePlateLayers(slots: readonly TrackerArcSlot[] = []): TablePlateLayers {
  const upperShape = createTablePlateShape(slots);
  const lowerShape = upperShape.clone();

  return {
    upper: {
      shape: upperShape,
      outlineScale: 1,
      surfaceY: FURNITURE_SURFACE_Y,
      thickness: TABLE_PLATE_THICKNESS,
    },
    lower: {
      shape: lowerShape,
      outlineScale: TABLE_BASE_OUTLINE_SCALE,
      surfaceY: FURNITURE_SURFACE_Y - TABLE_PLATE_THICKNESS + TABLE_BASE_OVERLAP,
      thickness: TABLE_BASE_THICKNESS,
    },
  };
}
