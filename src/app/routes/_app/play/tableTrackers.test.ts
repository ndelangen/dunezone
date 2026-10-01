import type { Vector3Tuple } from '@shared/play/model';
import {
  BOARD_RADIUS,
  BOARD_RIM_RADIUS,
  BOARD_RIM_SURFACE_Y,
  BOARD_SURFACE_Y,
  TABLE_VISIBLE_RADIUS,
} from '@shared/play/tableGeometry';
import {
  DEFAULT_TABLE_SEAT_COUNT,
  PLAYER_RING_RADIUS,
  PLAYER_STATION_RADIUS,
  tableSeatAngles,
  TABLE_SEAT_COUNTS,
} from '@shared/play/tableSettings';
import type { TableSeatCount } from '@shared/play/tableSettings';
import {
  PHASE_TRACKER_SCALE,
  PHASE_TRACKER_RADIUS,
  TRACKER_ARC_CENTER_ANGLE,
  TRACKER_ARC_MAX_SPAN,
  TRACKER_ARC_RADIUS,
  TRACKER_EDGE_GAP,
  TRACKER_DISC_CONTENT_Y,
  trackerArcSlots,
  TURN_TRACKER_SCALE,
  TURN_TRACKER_RADIUS,
} from '@shared/play/tableTrackers';
import type { TrackerArcSlot } from '@shared/play/tableTrackers';
import { Vector3 } from 'three';
import { describe, expect, test } from 'vitest';

import { PHASE_DISC_COLOR } from './phaseSymbolLayout';
import {
  cameraPoseFor,
  MAP_VIEW_BOTTOM_LIMIT,
  MAP_VIEW_HORIZONTAL_LIMIT,
  MAP_VIEW_TOP_LIMIT,
  tableCamera,
} from './playView';
import { mapViewFramingPoints, TRACKER_SCALLOP_BORDER } from './tablePlateGeometry';
import { SPICE_DISC_COLOR, TRACKER_DISC_ACTIVE_COLOR, trackerDiscColor } from './tableTrackers';

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
    ...slots.flatMap((slot) => [
      ...circleBoundary(slot.position, slot.radius + TRACKER_SCALLOP_BORDER, 120),
      ...circleBoundary([slot.position[0], TRACKER_DISC_CONTENT_Y, slot.position[2]], slot.radius, 120),
    ]),
  ];
}

/*
 * Each sweep holds at the bounds of every regime of the function under test and at one case inside each, sized to rules rather than to a permutation matrix (ADR-0002, #1590).
 * Phases: 0 is the function's floor, since a turn always has the standard nine and the scene passes no slots at all when there is no progress.
 * From 1 to 8 the composed discs keep their full size, 9 is the standard layout the function returns early, from 10 the discs shrink and keep the edge gap, and from 23 they give up the gap; a test below pins those bounds.
 * 30 is where the retired sweep ended and the longest layout proved here; no cap bounds a composed turn, and a test below checks 200 for size alone.
 * Framing proves 0, 9 and 30: a composed turn refits its discs into the span the standard nine cover, so its extent is the standard's, and 30 stands for every composed count with the smallest discs.
 * Seats: the fewest and the most the table seats, with the default between them; tableSettings.test.ts holds that the list is ascending and that the default lies strictly inside it.
 * Aspect ratios: the widest desktop, a square, and the narrowest phone.
 */
const PHASE_COUNTS = [0, 1, 8, 9, 10, 22, 23, 30] as const;
const FRAMED_PHASE_COUNTS = [0, 9, 30] as const;
const SEAT_COUNTS = [
  TABLE_SEAT_COUNTS[0],
  DEFAULT_TABLE_SEAT_COUNT,
  TABLE_SEAT_COUNTS[TABLE_SEAT_COUNTS.length - 1],
] as const;
const ASPECT_RATIOS = [16 / 9, 1, 390 / 844] as const;

const MAP_FRAMING_CASES = SEAT_COUNTS.flatMap((seatCount) =>
  FRAMED_PHASE_COUNTS.flatMap((phaseCount) =>
    ASPECT_RATIOS.map((aspectRatio) => [seatCount, phaseCount, aspectRatio] as const)
  )
);

describe('table trackers', () => {
  test('keeps full-size phase discs through nine, shrinks them with the edge gap from ten, and gives up the gap from twenty-three', () => {
    const gapBetween = (slots: readonly TrackerArcSlot[]) =>
      distance(slots[2].position, slots[3].position) - slots[2].radius - slots[3].radius;
    expect(trackerArcSlots(8)[2].radius).toBe(PHASE_TRACKER_RADIUS);
    expect(trackerArcSlots(10)[2].radius).toBeLessThan(PHASE_TRACKER_RADIUS);
    expect(gapBetween(trackerArcSlots(22))).toBeCloseTo(TRACKER_EDGE_GAP);
    expect(gapBetween(trackerArcSlots(23))).toBeLessThan(TRACKER_EDGE_GAP);
  });

  test.each(PHASE_COUNTS)(
    'pins the spice supply and turn tracker and fits %i phase trackers in the standard arc',
    (phaseCount) => {
      const standard = trackerArcSlots(9);
      const slots = trackerArcSlots(phaseCount);
      const arcRadius = slots[0].arcRadius;
      const lowerBound = Math.min(...slots.map((slot) => slot.angle - Math.asin(slot.radius / arcRadius)));
      const upperBound = Math.max(...slots.map((slot) => slot.angle + Math.asin(slot.radius / arcRadius)));

      expect(slots).toHaveLength(phaseCount + 2);
      expect(slots[0].kind).toBe('spice');
      expect(slots[1].kind).toBe('turn');
      expect(slots[0].phaseIndex).toBeNull();
      expect(slots[1].phaseIndex).toBeNull();
      /* A composed turn never moves the spice supply or the turn disc (#1138). */
      expect(slots.slice(0, 2)).toEqual(standard.slice(0, 2));
      expect(slots.slice(2).map((slot) => slot.phaseIndex)).toEqual(
        Array.from({ length: phaseCount }, (_, index) => index)
      );
      expect(upperBound - lowerBound).toBeLessThanOrEqual(TRACKER_ARC_MAX_SPAN + 1e-10);
      expect(lowerBound).toBeGreaterThan(-Math.PI);
      expect(upperBound).toBeLessThan(0);
    }
  );

  test('centers the standard nine-phase arc above the board', () => {
    const slots = trackerArcSlots(9);
    const arcRadius = slots[0].arcRadius;
    const lowerBound = Math.min(...slots.map((slot) => slot.angle - Math.asin(slot.radius / arcRadius)));
    const upperBound = Math.max(...slots.map((slot) => slot.angle + Math.asin(slot.radius / arcRadius)));
    expect((lowerBound + upperBound) / 2).toBeCloseTo(TRACKER_ARC_CENTER_ANGLE);
    slots.slice(1).forEach((slot, index) => {
      expect(distance(slots[index].position, slot.position)).toBeCloseTo(
        slots[index].radius + TRACKER_EDGE_GAP + slot.radius
      );
    });
  });

  test.each(PHASE_COUNTS)('keeps the %i-phase arc separated', (phaseCount) => {
    const slots = trackerArcSlots(phaseCount);

    slots.forEach((slot) => {
      expect(Math.hypot(slot.position[0], slot.position[2])).toBeCloseTo(slot.arcRadius);
      expect(slot.arcRadius).toBeGreaterThanOrEqual(TRACKER_ARC_RADIUS);
      expect(slot.radius).toBeGreaterThan(0);
    });
    slots.slice(1).forEach((slot, index) => {
      expect(slot.angle).toBeGreaterThan(slots[index].angle);
    });
    slots.forEach((slot, index) => {
      slots.slice(index + 1).forEach((other) => {
        expect(distance(slot.position, other.position)).toBeGreaterThanOrEqual(slot.radius + other.radius);
      });
    });
  });

  test('keeps dynamic tracker arcs clear of every player station', () => {
    PHASE_COUNTS.forEach((phaseCount) => {
      const slots = trackerArcSlots(phaseCount);
      expect(slots.every((slot) => slot.position[2] + slot.radius < 0)).toBe(true);

      /* Every seat layout, since each is its own rule and the check costs nothing. */
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
    });
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
      const camera = tableCamera(pose, aspectRatio);

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

  test('matches the spice supply and phase disc sizes beside the larger turn disc', () => {
    const slots = trackerArcSlots(1);
    expect(TURN_TRACKER_SCALE).toBe(4);
    expect(PHASE_TRACKER_SCALE).toBe(2);
    expect(slots[0].radius).toBe(PHASE_TRACKER_RADIUS);
    expect(slots[1].radius).toBe(TURN_TRACKER_RADIUS);
    expect(slots[2].radius).toBe(PHASE_TRACKER_RADIUS);
    expect(PHASE_TRACKER_RADIUS).toBe(0.26);
    expect(TURN_TRACKER_RADIUS).toBe(0.76);
    expect(TRACKER_EDGE_GAP).toBe(0.045);
  });

  test('keeps every disc of a very long turn a positive size', () => {
    const slots = trackerArcSlots(200);
    expect(slots.slice(2).every((slot) => slot.radius > 0)).toBe(true);
  });

  test('highlights one phase and keeps the spice supply muted', () => {
    const slots = trackerArcSlots(9);
    const colors = slots.map((slot) => trackerDiscColor(slot, 5));

    expect(colors[0]).toBe(SPICE_DISC_COLOR);
    expect(colors[1]).toBe(PHASE_DISC_COLOR);
    expect(colors.filter((color) => color === TRACKER_DISC_ACTIVE_COLOR)).toHaveLength(1);
    expect(colors[7]).toBe(TRACKER_DISC_ACTIVE_COLOR);
    expect(colors.filter((color) => color === PHASE_DISC_COLOR)).toHaveLength(9);
    expect(slots.slice(1).every((slot) => trackerDiscColor(slot, -1) === PHASE_DISC_COLOR)).toBe(true);
    expect(trackerDiscColor(slots[0], -1)).toBe(SPICE_DISC_COLOR);
  });
});
