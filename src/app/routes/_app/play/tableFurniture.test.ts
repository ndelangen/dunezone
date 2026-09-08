import { ExtrudeGeometry, PerspectiveCamera, Vector3 } from 'three';
import { describe, expect, test } from 'vitest';

import { cameraPoseFor } from './playView';
import {
  BOTTOM_SHELF_POSITION,
  BOTTOM_SHELF_SIZE,
  CARD_BAY_PLACEMENT_ANCHORS,
  cardBaySlotPositions,
  CARD_SLOT_GAP,
  CARD_SLOT_OUTER_SIZE,
  FURNITURE_SURFACE_Y,
  placementAnchorAtPosition,
  placementAnchorForPose,
  sideShelfPosition,
  SIDE_SHELF_CENTER_X,
  SIDE_SHELF_SIZE,
} from './tableFurnitureLayout';
import {
  CARD_DEPTH,
  CARD_FOOTPRINT_HALF_X,
  CARD_FOOTPRINT_HALF_Z,
  CARD_WIDTH,
  TABLE_VISIBLE_RADIUS,
} from './tableGeometry';
import {
  createTablePlateShape,
  createTablePlateLayers,
  tablePlateBounds,
  TABLE_PLATE_BOUNDS,
  TABLE_PLATE_CORNER_RADIUS,
  TABLE_PLATE_JOINS,
  TABLE_PLATE_THICKNESS,
  TRACKER_SCALLOP_BORDER,
  TRACKER_WELL_DEPTH,
  TRACKER_WELL_FLOOR_OVERLAP,
  trackerScallopRadius,
  trackerWellRadius,
} from './tablePlateGeometry';
import { trackerArcSlots } from './tableTrackers';

type Point2D = Readonly<{ x: number; y: number }>;

function sideOfSegment(start: Point2D, end: Point2D, point: Point2D): number {
  return (end.x - start.x) * (point.y - start.y) - (end.y - start.y) * (point.x - start.x);
}

function segmentsCross(firstStart: Point2D, firstEnd: Point2D, secondStart: Point2D, secondEnd: Point2D): boolean {
  const firstSide = sideOfSegment(firstStart, firstEnd, secondStart);
  const secondSide = sideOfSegment(firstStart, firstEnd, secondEnd);
  const thirdSide = sideOfSegment(secondStart, secondEnd, firstStart);
  const fourthSide = sideOfSegment(secondStart, secondEnd, firstEnd);
  return firstSide * secondSide < -1e-12 && thirdSide * fourthSide < -1e-12;
}

function contourCrossesItself(contour: readonly Point2D[]): boolean {
  for (let firstIndex = 0; firstIndex < contour.length; firstIndex += 1) {
    const firstEndIndex = (firstIndex + 1) % contour.length;
    for (let secondIndex = firstIndex + 2; secondIndex < contour.length; secondIndex += 1) {
      const secondEndIndex = (secondIndex + 1) % contour.length;
      if (firstIndex === 0 && secondEndIndex === 0) {
        continue;
      }
      if (segmentsCross(contour[firstIndex], contour[firstEndIndex], contour[secondIndex], contour[secondEndIndex])) {
        return true;
      }
    }
  }
  return false;
}

function contourContainsPoint(contour: readonly Point2D[], point: Point2D): boolean {
  let inside = false;
  for (let index = 0, previous = contour.length - 1; index < contour.length; previous = index, index += 1) {
    const currentPoint = contour[index];
    const previousPoint = contour[previous];
    const crossesRay =
      currentPoint.y > point.y !== previousPoint.y > point.y &&
      point.x <
        ((previousPoint.x - currentPoint.x) * (point.y - currentPoint.y)) / (previousPoint.y - currentPoint.y) +
          currentPoint.x;
    if (crossesRay) {
      inside = !inside;
    }
  }
  return inside;
}

function contourTurnAt(contour: readonly Point2D[], index: number): number {
  const previous = contour[(index - 1 + contour.length) % contour.length];
  const current = contour[index];
  const next = contour[(index + 1) % contour.length];
  const incoming = [current.x - previous.x, current.y - previous.y] as const;
  const outgoing = [next.x - current.x, next.y - current.y] as const;
  const incomingLength = Math.hypot(...incoming);
  const outgoingLength = Math.hypot(...outgoing);
  if (incomingLength === 0 || outgoingLength === 0) {
    return 0;
  }
  const cosine = (incoming[0] * outgoing[0] + incoming[1] * outgoing[1]) / (incomingLength * outgoingLength);
  return Math.acos(Math.max(-1, Math.min(1, cosine)));
}

function sharpestContourTurnNear(contour: readonly Point2D[], target: Point2D, searchRadius: number): number {
  return Math.max(
    ...contour.map((point, index) =>
      Math.hypot(point.x - target.x, point.y - target.y) <= searchRadius ? contourTurnAt(contour, index) : 0
    )
  );
}

describe('table furniture', () => {
  test("uses the rulebook's five-slot pattern on each side", () => {
    const left = cardBaySlotPositions('left');
    const right = cardBaySlotPositions('right');
    const rowCounts = (slots: typeof left) => {
      const counts = new Map<number, number>();
      for (const [, , z] of slots) {
        counts.set(z, (counts.get(z) ?? 0) + 1);
      }
      return [...counts.entries()].sort(([leftZ], [rightZ]) => leftZ - rightZ).map(([, count]) => count);
    };

    expect(left).toHaveLength(5);
    expect(right).toHaveLength(5);
    expect(new Set(left.map(([x, , z]) => `${x}:${z}`)).size).toBe(5);
    expect(new Set(right.map(([x, , z]) => `${x}:${z}`)).size).toBe(5);
    expect(rowCounts(left)).toEqual([2, 2, 1]);
    expect(rowCounts(right)).toEqual([1, 2, 2]);
    const leftShelf = sideShelfPosition('left');
    expect(sideShelfPosition('right')).toEqual([-leftShelf[0], leftShelf[1], leftShelf[2]]);
  });

  test('defines ten stable card-placement anchors from the rendered wells', () => {
    expect(CARD_BAY_PLACEMENT_ANCHORS).toHaveLength(10);
    expect(new Set(CARD_BAY_PLACEMENT_ANCHORS.map((anchor) => anchor.id)).size).toBe(10);

    for (const anchor of CARD_BAY_PLACEMENT_ANCHORS) {
      expect(anchor.id).toMatch(/^card-bay-(left|right)-[1-5]$/);
      expect(anchor.acceptedKinds).toEqual(['card']);
      expect(anchor.orientation).toBe(0);
      expect(anchor.position[1]).toBe(FURNITURE_SURFACE_Y);
      expect(
        placementAnchorAtPosition({ kind: 'card' }, [anchor.position[0] + 0.1, 0.38, anchor.position[2] - 0.1])?.id
      ).toBe(anchor.id);
      expect(placementAnchorForPose({ kind: 'card', orientation: 0 }, anchor.position)?.id).toBe(anchor.id);
    }

    expect(placementAnchorAtPosition({ kind: 'force' }, CARD_BAY_PLACEMENT_ANCHORS[0].position)).toBeNull();
    expect(placementAnchorAtPosition({ kind: 'card' }, [0, 0.38, 0])).toBeNull();
    expect(
      placementAnchorForPose({ kind: 'card', orientation: Math.PI / 12 }, CARD_BAY_PLACEMENT_ANCHORS[0].position)
    ).toBeNull();
  });

  test('leaves clearance between cards snapped into neighboring wells', () => {
    for (let firstIndex = 0; firstIndex < CARD_BAY_PLACEMENT_ANCHORS.length; firstIndex += 1) {
      for (let secondIndex = firstIndex + 1; secondIndex < CARD_BAY_PLACEMENT_ANCHORS.length; secondIndex += 1) {
        const first = CARD_BAY_PLACEMENT_ANCHORS[firstIndex];
        const second = CARD_BAY_PLACEMENT_ANCHORS[secondIndex];
        const separatedOnX = Math.abs(first.position[0] - second.position[0]) >= CARD_FOOTPRINT_HALF_X * 2;
        const separatedOnZ = Math.abs(first.position[2] - second.position[2]) >= CARD_FOOTPRINT_HALF_Z * 2;
        expect(separatedOnX || separatedOnZ).toBe(true);
      }
    }
  });

  test('keeps a card-sized opening and a consistent gap between slots', () => {
    const slots = cardBaySlotPositions('right');
    const middleRow = slots.filter(([, , z]) => z === 0).sort(([leftX], [rightX]) => leftX - rightX);
    const innerColumn = slots.filter(([x]) => x === 5.72).sort(([, , leftZ], [, , rightZ]) => leftZ - rightZ);

    expect(CARD_SLOT_OUTER_SIZE).toEqual({
      width: CARD_WIDTH + 0.12,
      depth: CARD_DEPTH + 0.12,
    });
    expect((middleRow[1]?.[0] ?? 0) - (middleRow[0]?.[0] ?? 0) - CARD_WIDTH).toBeCloseTo(CARD_SLOT_GAP);
    expect((innerColumn[1]?.[2] ?? 0) - (innerColumn[0]?.[2] ?? 0) - CARD_DEPTH).toBeCloseTo(CARD_SLOT_GAP);
  });

  test('keeps every card well inside its supporting shelf', () => {
    for (const side of ['left', 'right'] as const) {
      const shelf = sideShelfPosition(side);
      for (const slot of cardBaySlotPositions(side)) {
        expect(Math.abs(slot[0] - shelf[0]) + CARD_SLOT_OUTER_SIZE.width / 2).toBeLessThanOrEqual(
          SIDE_SHELF_SIZE[0] / 2
        );
        expect(Math.abs(slot[2] - shelf[2]) + CARD_SLOT_OUTER_SIZE.depth / 2).toBeLessThanOrEqual(
          SIDE_SHELF_SIZE[2] / 2
        );
      }
    }
  });

  test('frames every side shelf and card well in each supported layout', () => {
    for (const aspectRatio of [1, 0.75, 390 / 844]) {
      for (const side of ['left', 'right'] as const) {
        const pose = cameraPoseFor(side, aspectRatio);
        const camera = new PerspectiveCamera(42, aspectRatio, 0.1, 100);
        camera.position.set(...pose.position);
        camera.lookAt(...pose.target);
        camera.updateMatrixWorld();
        camera.updateProjectionMatrix();
        const shelf = sideShelfPosition(side);
        const points = [
          ...cardBaySlotPositions(side).flatMap(([x, y, z]) =>
            [-1, 1].flatMap((xDirection) =>
              [-1, 1].map(
                (zDirection) =>
                  [
                    x + (xDirection * CARD_SLOT_OUTER_SIZE.width) / 2,
                    y,
                    z + (zDirection * CARD_SLOT_OUTER_SIZE.depth) / 2,
                  ] as const
              )
            )
          ),
          ...[-1, 1].flatMap((xDirection) =>
            [-1, 1].map(
              (zDirection) =>
                [
                  shelf[0] + (xDirection * SIDE_SHELF_SIZE[0]) / 2,
                  FURNITURE_SURFACE_Y,
                  shelf[2] + (zDirection * SIDE_SHELF_SIZE[2]) / 2,
                ] as const
            )
          ),
        ];

        for (const point of points) {
          const projected = new Vector3(...point).project(camera);
          expect(Math.abs(projected.x)).toBeLessThanOrEqual(0.93);
          expect(Math.abs(projected.y)).toBeLessThanOrEqual(0.93);
        }
      }
    }
  });

  test('frames the complete Tanks shelf in each supported layout', () => {
    for (const aspectRatio of [1, 0.75, 390 / 844]) {
      const pose = cameraPoseFor('bottom', aspectRatio);
      const camera = new PerspectiveCamera(42, aspectRatio, 0.1, 100);
      camera.position.set(...pose.position);
      camera.lookAt(...pose.target);
      camera.updateMatrixWorld();
      camera.updateProjectionMatrix();

      for (const xDirection of [-1, 1]) {
        for (const zDirection of [-1, 1]) {
          const projected = new Vector3(
            BOTTOM_SHELF_POSITION[0] + (xDirection * BOTTOM_SHELF_SIZE[0]) / 2,
            FURNITURE_SURFACE_Y,
            BOTTOM_SHELF_POSITION[2] + (zDirection * BOTTOM_SHELF_SIZE[2]) / 2
          ).project(camera);
          expect(Math.abs(projected.x)).toBeLessThanOrEqual(0.92);
          expect(Math.abs(projected.y)).toBeLessThanOrEqual(0.92);
        }
      }
    }
  });

  test('builds one carved plate across the tracker crown and all three shelves', () => {
    const trackerSlots = trackerArcSlots(9);
    const shape = createTablePlateShape(trackerSlots);
    const bounds = tablePlateBounds(trackerSlots);
    const geometry = new ExtrudeGeometry(shape, {
      bevelEnabled: false,
      curveSegments: 48,
      depth: TABLE_PLATE_THICKNESS,
      steps: 1,
    });
    geometry.rotateX(Math.PI / 2);
    geometry.translate(0, FURNITURE_SURFACE_Y, 0);
    geometry.computeBoundingBox();

    expect(shape.holes).toHaveLength(trackerSlots.length);
    expect(geometry.boundingBox?.min.x).toBeCloseTo(bounds.minX);
    expect(geometry.boundingBox?.max.x).toBeCloseTo(bounds.maxX);
    expect(geometry.boundingBox?.min.z).toBeCloseTo(bounds.minZ);
    expect(geometry.boundingBox?.max.z).toBeCloseTo(bounds.maxZ);
    expect(geometry.boundingBox?.min.y).toBeCloseTo(FURNITURE_SURFACE_Y - TABLE_PLATE_THICKNESS);
    expect(geometry.boundingBox?.max.y).toBeCloseTo(FURNITURE_SURFACE_Y);

    const sideShelfInnerX = SIDE_SHELF_CENTER_X - SIDE_SHELF_SIZE[0] / 2;
    const bottomShelfInnerZ = BOTTOM_SHELF_POSITION[2] - BOTTOM_SHELF_SIZE[2] / 2;
    expect(TABLE_PLATE_JOINS.sideX).toBeLessThan(sideShelfInnerX);
    expect(TABLE_PLATE_JOINS.bottomZ).toBeLessThan(bottomShelfInnerZ);
  });

  test.each([0, 9, 20])(
    'wraps the full upper plate with a slightly larger lower plate in a %i-phase layout',
    (phaseCount) => {
      const layers = createTablePlateLayers(trackerArcSlots(phaseCount));
      const upperContour = layers.upper.shape.getPoints(96);
      const lowerContour = layers.lower.shape.getPoints(96);

      expect(lowerContour).toEqual(upperContour);
      expect(layers.lower.shape.holes).toHaveLength(0);
      expect(layers.lower.outlineScale).toBeGreaterThan(layers.upper.outlineScale);
      const expandedLowerContour = lowerContour.map((point) => ({
        x: point.x * layers.lower.outlineScale,
        y: point.y * layers.lower.outlineScale,
      }));
      upperContour.forEach((point) => {
        const upperRadius = Math.hypot(point.x, point.y) * layers.upper.outlineScale;
        const lowerRadius = Math.hypot(point.x, point.y) * layers.lower.outlineScale;
        expect(lowerRadius).toBeGreaterThan(upperRadius);
        expect(contourContainsPoint(expandedLowerContour, point)).toBe(true);
      });

      const upperBottom = layers.upper.surfaceY - layers.upper.thickness;
      const lowerBottom = layers.lower.surfaceY - layers.lower.thickness;
      expect(layers.lower.surfaceY).toBeLessThan(layers.upper.surfaceY);
      expect(layers.lower.surfaceY).toBeGreaterThan(upperBottom);
      expect(lowerBottom).toBeLessThan(upperBottom);
    }
  );

  test.each([0, 1, 9, 12, 30])(
    'cuts a recessed well and matching scallop for every slot in a %i-phase layout',
    (phaseCount) => {
      const trackerSlots = trackerArcSlots(phaseCount);
      const shape = createTablePlateShape(trackerSlots);
      const contour = shape.extractPoints(1).shape;
      const geometry = new ExtrudeGeometry(shape, {
        bevelEnabled: false,
        curveSegments: 48,
        depth: TABLE_PLATE_THICKNESS,
        steps: 1,
      });

      expect(shape.holes).toHaveLength(trackerSlots.length);
      trackerSlots.forEach((slot, index) => {
        const holePoints = shape.holes[index].getPoints(96);
        const xs = holePoints.map(({ x }) => x);
        const zs = holePoints.map(({ y }) => y);
        const minX = Math.min(...xs);
        const maxX = Math.max(...xs);
        const minZ = Math.min(...zs);
        const maxZ = Math.max(...zs);
        expect((minX + maxX) / 2).toBeCloseTo(slot.position[0]);
        expect((minZ + maxZ) / 2).toBeCloseTo(slot.position[2]);
        expect((maxX - minX) / 2).toBeCloseTo(trackerWellRadius(slot));
        expect((maxZ - minZ) / 2).toBeCloseTo(trackerWellRadius(slot));

        const radialX = slot.position[0] / slot.arcRadius;
        const radialZ = slot.position[2] / slot.arcRadius;
        const scallopRadius = trackerScallopRadius(slot);
        const expectedOuterPoint = {
          x: slot.position[0] + radialX * scallopRadius,
          z: slot.position[2] + radialZ * scallopRadius,
        };
        const nearestContourPoint = Math.min(
          ...contour.map(({ x, y }) => Math.hypot(x - expectedOuterPoint.x, y - expectedOuterPoint.z))
        );
        expect(nearestContourPoint).toBeLessThan(0.04);
      });

      const positions = geometry.getAttribute('position');
      expect(Array.from(positions.array).every(Number.isFinite)).toBe(true);
    }
  );

  test('keeps the well floors inside the single slab', () => {
    expect(TRACKER_SCALLOP_BORDER).toBeGreaterThan(0);
    expect(TRACKER_WELL_DEPTH).toBeGreaterThan(0);
    expect(TRACKER_WELL_DEPTH).toBeLessThan(TABLE_PLATE_THICKNESS);
    expect(TRACKER_WELL_FLOOR_OVERLAP).toBeGreaterThan(0);
  });

  test.each([0, 1, 9, 11, 12, 13, 18, 20, 30])(
    'keeps the %i-phase crown connected and free of crossed edges',
    (phaseCount) => {
      const slots = trackerArcSlots(phaseCount);
      const contour = createTablePlateShape(slots).extractPoints(1).shape;

      expect(contourCrossesItself(contour)).toBe(false);
      slots.forEach((slot) => {
        expect(
          contourContainsPoint(contour, {
            x: slot.position[0],
            y: slot.position[2],
          })
        ).toBe(true);
      });
    }
  );

  test.each([0, 1, 9, 20, 30])('rounds both tracker-crown shoulders in a %i-phase layout', (phaseCount) => {
    const slots = trackerArcSlots(phaseCount);
    const bounds = slots.map((slot) => {
      const centerAngle = slot.angle < 0 ? slot.angle + Math.PI * 2 : slot.angle;
      const halfExtent = Math.asin(trackerScallopRadius(slot) / slot.arcRadius);
      return [centerAngle - halfExtent, centerAngle + halfExtent] as const;
    });
    const shoulderAngles = [Math.min(...bounds.map(([lower]) => lower)), Math.max(...bounds.map(([, upper]) => upper))];
    const contour = createTablePlateShape(slots).getPoints(96);

    shoulderAngles.forEach((angle) => {
      const shoulder = {
        x: Math.cos(angle) * TABLE_VISIBLE_RADIUS,
        y: Math.sin(angle) * TABLE_VISIBLE_RADIUS,
      };
      expect(sharpestContourTurnNear(contour, shoulder, 0.45)).toBeLessThan(Math.PI / 6);
    });
  });

  test('rounds every exposed shelf corner', () => {
    const points = createTablePlateShape().getPoints(48);
    const sideHalfDepth = SIDE_SHELF_SIZE[2] / 2;
    const squareCorners = [
      [TABLE_PLATE_BOUNDS.minX, -sideHalfDepth],
      [TABLE_PLATE_BOUNDS.minX, sideHalfDepth],
      [TABLE_PLATE_BOUNDS.maxX, -sideHalfDepth],
      [TABLE_PLATE_BOUNDS.maxX, sideHalfDepth],
      [-BOTTOM_SHELF_SIZE[0] / 2, TABLE_PLATE_BOUNDS.maxZ],
      [BOTTOM_SHELF_SIZE[0] / 2, TABLE_PLATE_BOUNDS.maxZ],
    ] as const;

    expect(TABLE_PLATE_CORNER_RADIUS).toBeGreaterThan(0);
    squareCorners.forEach(([cornerX, cornerZ]) => {
      const nearestPoint = Math.min(...points.map(({ x, y }) => Math.hypot(x - cornerX, y - cornerZ)));
      expect(nearestPoint).toBeGreaterThan(0.08);
    });
  });
});
