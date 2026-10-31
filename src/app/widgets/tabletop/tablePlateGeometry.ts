import { isOnTwoBoardTable, SECOND_BOARD_PLACEMENT, twoBoardTableOutline } from '@shared/play/boardLayout';
import type { TableLayout } from '@shared/play/boardLayout';
import type { Vector3Tuple } from '@shared/play/model';
import { supplyReserveReach } from '@shared/play/setupLayout';
import {
  BOTTOM_SHELF_POSITION,
  BOTTOM_SHELF_SIZE,
  FURNITURE_SURFACE_Y,
  SIDE_SHELF_CENTER_X,
  SIDE_SHELF_SIZE,
} from '@shared/play/tableFurnitureLayout';
import {
  BOARD_RIM_RADIUS,
  BOARD_RIM_SURFACE_Y,
  surfacePointOnRay,
  TABLE_VISIBLE_RADIUS,
} from '@shared/play/tableGeometry';
import {
  DEFAULT_TABLE_SEAT_COUNT,
  PLAYER_RING_RADIUS,
  PLAYER_STATION_RADIUS,
  tableSeatAngles,
} from '@shared/play/tableSettings';
import type { TableSeatCount } from '@shared/play/tableSettings';
import { TRACKER_DISC_CONTENT_Y } from '@shared/play/tableTrackers';
import type { TrackerArcSlot } from '@shared/play/tableTrackers';
import { Shape } from 'three';

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

function appendCircleBoundary(points: Vector3Tuple[], center: Vector3Tuple, radius: number, sampleCount: number) {
  for (let sample = 0; sample < sampleCount; sample += 1) {
    const angle = (sample / sampleCount) * Math.PI * 2;
    points.push([center[0] + Math.cos(angle) * radius, center[1], center[2] + Math.sin(angle) * radius]);
  }
}

/** How high the battle beacon hovers over its tracker slot; the map view keeps that height over every slot in frame, so the raised beacon is never cut off. */
export const TRACKER_BEACON_HEIGHT = 0.6;
/* The hovering beacon's grab handle reaches this far above the beacon, so the frame keeps its top edge in view as well. */
const TRACKER_BEACON_HANDLE_REACH = 0.5;

export function mapViewFramingPoints(
  slots: readonly TrackerArcSlot[],
  seatCount: TableSeatCount = DEFAULT_TABLE_SEAT_COUNT,
  troopKinds?: number,
  layout: TableLayout = 'one-board'
): Vector3Tuple[] {
  const points: Vector3Tuple[] = [];
  /* The second board's rim, so the map view takes in both of a two-board game's boards. */
  if (layout === 'two-boards') {
    const { x, z } = SECOND_BOARD_PLACEMENT;
    appendCircleBoundary(points, [x, BOARD_RIM_SURFACE_Y, z], BOARD_RIM_RADIUS, 96);
  }
  const reserveReach = supplyReserveReach(troopKinds);
  appendCircleBoundary(points, [0, BOARD_RIM_SURFACE_Y, 0], BOARD_RIM_RADIUS, 96);
  tableSeatAngles(seatCount).forEach((angle) => {
    appendCircleBoundary(
      points,
      [Math.cos(angle) * PLAYER_RING_RADIUS, BOARD_RIM_SURFACE_Y + 0.001, Math.sin(angle) * PLAYER_RING_RADIUS],
      PLAYER_STATION_RADIUS,
      48
    );
    /* The troop reserves right behind each faction token, so the view never cuts a seat's supply off at the canvas's edge. */
    appendCircleBoundary(
      points,
      [Math.cos(angle) * reserveReach.radius, BOARD_RIM_SURFACE_Y + 0.001, Math.sin(angle) * reserveReach.radius],
      reserveReach.halfWidth,
      48
    );
  });
  slots.forEach((slot) => {
    appendCircleBoundary(points, slot.position, trackerScallopRadius(slot), 48);
    appendCircleBoundary(points, [slot.position[0], TRACKER_DISC_CONTENT_Y, slot.position[2]], slot.radius, 48);
    appendCircleBoundary(
      points,
      [
        slot.position[0],
        TRACKER_DISC_CONTENT_Y + TRACKER_BEACON_HEIGHT + TRACKER_BEACON_HANDLE_REACH,
        slot.position[2],
      ],
      slot.radius,
      48
    );
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

type TablePlateLayers = Readonly<{
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

/*
 * The two-board table: one piece drawn from its traced outline at the main plate's heights. The base below reaches a
 *little wider, as the main base does.
 */
const TWO_BOARD_PLATE_BASE_SPREAD = 0.1;

function twoBoardPlateShape(spread: number): Shape {
  const shape = new Shape();
  twoBoardTableOutline(spread).forEach(([x, z], index) => (index === 0 ? shape.moveTo(x, z) : shape.lineTo(x, z)));
  shape.closePath();
  return shape;
}

export function createTwoBoardTablePlateLayers(): TablePlateLayers {
  return {
    upper: {
      shape: twoBoardPlateShape(0),
      outlineScale: 1,
      surfaceY: FURNITURE_SURFACE_Y,
      thickness: TABLE_PLATE_THICKNESS,
    },
    lower: {
      shape: twoBoardPlateShape(TWO_BOARD_PLATE_BASE_SPREAD),
      outlineScale: 1,
      surfaceY: FURNITURE_SURFACE_Y - TABLE_PLATE_THICKNESS + TABLE_BASE_OVERLAP,
      thickness: TABLE_BASE_THICKNESS,
    },
  };
}

/** The drawn table plate's edge as [x, z] corners: the round top, the shelves with their rounded corners, and the tracker crown. */
type TablePlateOutline = readonly (readonly [x: number, z: number])[];

export function tablePlateOutline(slots: readonly TrackerArcSlot[] = []): TablePlateOutline {
  /* The shape is drawn flat with its y along the table's z. */
  return createTablePlateShape(slots)
    .getPoints(24)
    .map((point) => [point.x, point.y] as const);
}

/** Whether a point lies over the plate, counting the crossings of a line from it along +x with the outline's edges. */
function tablePlateContains(outline: TablePlateOutline, [x, , z]: Vector3Tuple): boolean {
  let inside = false;
  for (let index = 0, previous = outline.length - 1; index < outline.length; previous = index++) {
    const [ax, az] = outline[index]!;
    const [bx, bz] = outline[previous]!;
    if (az > z !== bz > z && x < ax + ((z - az) * (bx - ax)) / (bz - az)) {
      inside = !inside;
    }
  }
  return inside;
}

/** Where a ray from the camera meets the board, its rim or the table plate; past the plate's drawn edge there is no surface. */
export function tableSurfacePointOnRay(
  origin: Vector3Tuple,
  direction: Vector3Tuple,
  outline: TablePlateOutline,
  layout: TableLayout = 'one-board'
): Vector3Tuple | null {
  const point = surfacePointOnRay(origin, direction, layout);
  if (!point) {
    return null;
  }
  const onTable = layout === 'two-boards' ? isOnTwoBoardTable(point[0], point[2]) : tablePlateContains(outline, point);
  return onTable ? point : null;
}
