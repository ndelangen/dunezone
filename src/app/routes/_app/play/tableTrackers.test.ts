import { PerspectiveCamera, Vector3 } from 'three';
import { describe, expect, test } from 'vitest';

import type { Vector3Tuple } from './model';
import { PHASE_DISC_COLOR } from './phaseSymbolLayout';
import {
  cameraPoseFor,
  MAP_VIEW_BOTTOM_LIMIT,
  MAP_VIEW_HORIZONTAL_LIMIT,
  MAP_VIEW_TOP_LIMIT,
  TABLE_CAMERA_FIELD_OF_VIEW,
} from './playView';
import {
  BOARD_RADIUS,
  BOARD_RIM_RADIUS,
  BOARD_RIM_SURFACE_Y,
  BOARD_SURFACE_Y,
  TABLE_VISIBLE_RADIUS,
} from './tableGeometry';
import { mapViewFramingPoints, TRACKER_SCALLOP_BORDER } from './tablePlateGeometry';
import { PLAYER_RING_RADIUS, PLAYER_STATION_RADIUS, tableSeatAngles, TABLE_SEAT_COUNTS } from './tableSettings';
import type { TableSeatCount } from './tableSettings';
import {
  PHASE_TRACKER_SCALE,
  PHASE_TRACKER_RADIUS,
  TRACKER_ARC_CENTER_ANGLE,
  TRACKER_ARC_MAX_SPAN,
  TRACKER_ARC_RADIUS,
  TRACKER_EDGE_GAP,
  TRACKER_WELL_ACTIVE_COLOR,
  TRACKER_WELL_INACTIVE_COLOR,
  trackerArcSlots,
  trackerWellColor,
  TURN_TRACKER_SCALE,
  TURN_TRACKER_RADIUS,
} from './tableTrackers';
import type { TrackerArcSlot } from './tableTrackers';

function distance(left: readonly [number, number, number], right: readonly [number, number, number]): number {
  return Math.hypot(left[0] - right[0], left[2] - right[2]);
}

function circleBoundary(center: Vector3Tuple, radius: number, sampleCount: number): Vector3Tuple[] {
  return Array.from({ length: sampleCount }, (_, sample) => {
    const angle = (sample / sampleCount) * Math.PI * 2;
    return [center[0] + Math.cos(angle) * radius, center[1], center[2] + Math.sin(angle) * radius];
  });
}

function independentlySampledMapBoundary(slots: readonly TrackerArcSlot[], seatCount: TableSeatCount): Vector3Tuple[] {
  return [
    ...circleBoundary([0, BOARD_SURFACE_Y, 0], BOARD_RADIUS, 360),
    ...circleBoundary([0, BOARD_RIM_SURFACE_Y, 0], BOARD_RIM_RADIUS, 360),
    ...tableSeatAngles(seatCount).flatMap((angle) =>
      circleBoundary(
        [Math.cos(angle) * PLAYER_RING_RADIUS, BOARD_RIM_SURFACE_Y + 0.001, Math.sin(angle) * PLAYER_RING_RADIUS],
        PLAYER_STATION_RADIUS,
        120
      )
    ),
    ...slots.flatMap((slot) => circleBoundary(slot.position, slot.radius + TRACKER_SCALLOP_BORDER, 120)),
  ];
}

const MAP_FRAMING_CASES = TABLE_SEAT_COUNTS.flatMap((seatCount) =>
  [0, 1, 9, 12, 18, 24, 30].flatMap((phaseCount) =>
    [16 / 9, 1, 3 / 4, 390 / 844].map((aspectRatio) => [seatCount, phaseCount, aspectRatio] as const)
  )
);

describe('table trackers', () => {
  test.each(Array.from({ length: 30 }, (_, index) => index + 1))(
    'centers the turn tracker and %i phase trackers above the board',
    (phaseCount) => {
      const slots = trackerArcSlots(phaseCount);
      const arcRadius = slots[0].arcRadius;
      const lowerBound = Math.min(...slots.map((slot) => slot.angle - Math.asin(slot.radius / arcRadius)));
      const upperBound = Math.max(...slots.map((slot) => slot.angle + Math.asin(slot.radius / arcRadius)));

      expect(slots).toHaveLength(phaseCount + 1);
      expect(slots[0].kind).toBe('turn');
      expect(slots.slice(1).map((slot) => slot.phaseIndex)).toEqual(
        Array.from({ length: phaseCount }, (_, index) => index)
      );
      expect((lowerBound + upperBound) / 2).toBeCloseTo(TRACKER_ARC_CENTER_ANGLE);
      expect(upperBound - lowerBound).toBeLessThanOrEqual(TRACKER_ARC_MAX_SPAN + 1e-10);
      expect(lowerBound).toBeGreaterThan(-Math.PI);
      expect(upperBound).toBeLessThan(0);
    }
  );

  test.each(Array.from({ length: 30 }, (_, index) => index + 1))('keeps the %i-phase arc separated', (phaseCount) => {
    const slots = trackerArcSlots(phaseCount);

    slots.forEach((slot) => {
      expect(Math.hypot(slot.position[0], slot.position[2])).toBeCloseTo(slot.arcRadius);
      expect(slot.arcRadius).toBeGreaterThanOrEqual(TRACKER_ARC_RADIUS);
    });
    slots.slice(1).forEach((slot, index) => {
      const previous = slots[index];
      expect(distance(previous.position, slot.position)).toBeCloseTo(previous.radius + TRACKER_EDGE_GAP + slot.radius);
      expect(slot.angle).toBeGreaterThan(previous.angle);
    });
  });

  test('keeps dynamic tracker arcs clear of every player station', () => {
    for (let phaseCount = 1; phaseCount <= 30; phaseCount += 1) {
      const slots = trackerArcSlots(phaseCount);
      expect(slots.every((slot) => slot.position[2] + slot.radius < 0)).toBe(true);

      TABLE_SEAT_COUNTS.forEach((seatCount) => {
        tableSeatAngles(seatCount).forEach((seatAngle) => {
          const seatPosition: [number, number, number] = [
            Math.cos(seatAngle) * PLAYER_RING_RADIUS,
            0,
            Math.sin(seatAngle) * PLAYER_RING_RADIUS,
          ];

          slots.forEach((slot) => {
            expect(distance(seatPosition, slot.position)).toBeGreaterThan(PLAYER_STATION_RADIUS + slot.radius);
          });
        });
      });
    }
  });

  test('keeps the standard tracker arc seated across the round plate edge', () => {
    const slots = trackerArcSlots(9);
    expect(slots.every((slot) => slot.arcRadius - slot.radius - TRACKER_SCALLOP_BORDER < TABLE_VISIBLE_RADIUS)).toBe(
      true
    );
  });

  test.each(MAP_FRAMING_CASES)(
    'frames %i seats, the territory map, and a %i-phase arc at aspect ratio %f',
    (seatCount, phaseCount, aspectRatio) => {
      const slots = trackerArcSlots(phaseCount);
      const pose = cameraPoseFor('map', aspectRatio, mapViewFramingPoints(slots, seatCount));
      const camera = new PerspectiveCamera(TABLE_CAMERA_FIELD_OF_VIEW, aspectRatio, 0.1, 100);
      camera.position.set(...pose.position);
      camera.lookAt(...pose.target);
      camera.updateMatrixWorld();
      camera.updateProjectionMatrix();

      independentlySampledMapBoundary(slots, seatCount).forEach((point) => {
        const projected = new Vector3(...point).project(camera);
        expect(Math.abs(projected.x)).toBeLessThanOrEqual(MAP_VIEW_HORIZONTAL_LIMIT + 0.0005);
        expect(projected.y).toBeLessThanOrEqual(MAP_VIEW_TOP_LIMIT + 0.0005);
        expect(projected.y).toBeGreaterThanOrEqual(-MAP_VIEW_BOTTOM_LIMIT - 0.0005);
      });
    }
  );

  test('rejects an invalid phase count', () => {
    expect(() => trackerArcSlots(-1)).toThrow();
    expect(() => trackerArcSlots(2.5)).toThrow();
  });

  test('keeps the turn well large and halves the phase wells', () => {
    expect(TURN_TRACKER_SCALE).toBe(4);
    expect(PHASE_TRACKER_SCALE).toBe(2);
    expect(trackerArcSlots(1)[1].radius).toBe(PHASE_TRACKER_RADIUS);
    expect(PHASE_TRACKER_RADIUS).toBe(0.26);
    expect(TURN_TRACKER_RADIUS).toBe(0.76);
    expect(TRACKER_EDGE_GAP).toBe(0.045);
  });

  test('gives cream phase discs one active accent and leaves the turn well unchanged', () => {
    const slots = trackerArcSlots(9);
    const colors = slots.map((slot) => trackerWellColor(slot, 5));

    expect(colors[0]).toBe(TRACKER_WELL_INACTIVE_COLOR);
    expect(colors.filter((color) => color === TRACKER_WELL_ACTIVE_COLOR)).toHaveLength(1);
    expect(colors[6]).toBe(TRACKER_WELL_ACTIVE_COLOR);
    expect(colors.filter((color) => color === PHASE_DISC_COLOR)).toHaveLength(8);
    expect(slots.slice(1).every((slot) => trackerWellColor(slot, -1) === PHASE_DISC_COLOR)).toBe(true);
  });
});
