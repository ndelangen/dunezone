import { describe, expect, test } from 'vitest';

import {
  DEFAULT_STORM_SECTOR_INDEX,
  moveStormCounterclockwise,
  nearestStormRotation,
  normalizeStormSectorIndex,
  STORM_MARKER_BASE_CENTER_V,
  STORM_MARKER_INNER_X,
  STORM_MARKER_OUTER_X,
  STORM_MARKER_RADIAL_DEPTH,
  STORM_MARKER_TANGENTIAL_WIDTH,
  STORM_MARKER_VISIBLE_BASE_FRACTION,
  STORM_SECTOR_ANGLE,
  STORM_SECTOR_FILL_OPACITY,
  STORM_SECTOR_OUTLINE_OPACITY,
  STORM_TRANSITION_MS,
  stormRotationForSector,
  stormTransitionProgress,
} from './stormSector';
import { BOARD_RADIUS, BOARD_RIM_RADIUS, TABLE_VISIBLE_RADIUS } from './tableGeometry';
import { TABLE_SECTOR_COUNT } from './tableSettings';

describe('storm sector', () => {
  test('uses a visible glass tint and restrained outline', () => {
    expect(STORM_SECTOR_FILL_OPACITY).toBe(0.28);
    expect(STORM_SECTOR_OUTLINE_OPACITY).toBe(0.3);
  });

  test('preserves the former marker position as sector 6', () => {
    expect(DEFAULT_STORM_SECTOR_INDEX).toBe(5);
    expect(-stormRotationForSector(DEFAULT_STORM_SECTOR_INDEX)).toBeCloseTo((110 * Math.PI) / 180, 8);
  });

  test('normalizes signed and oversized sector indices', () => {
    expect(normalizeStormSectorIndex(-1)).toBe(17);
    expect(normalizeStormSectorIndex(18)).toBe(0);
    expect(normalizeStormSectorIndex(39)).toBe(3);
  });

  test('advances counterclockwise and wraps around sector 1', () => {
    expect(moveStormCounterclockwise(5)).toBe(4);
    expect(moveStormCounterclockwise(0)).toBe(17);
    expect(moveStormCounterclockwise(17, -1)).toBe(0);
  });

  test('centers all 18 equal-width sectors between their boundary lines', () => {
    for (let index = 0; index < TABLE_SECTOR_COUNT; index += 1) {
      const centerAngle = -stormRotationForSector(index);
      expect(centerAngle).toBeCloseTo((index + 0.5) * STORM_SECTOR_ANGLE, 8);
      expect(STORM_SECTOR_ANGLE).toBeCloseTo((20 * Math.PI) / 180, 8);
    }
  });

  test('aligns the visible marker with the map sector and overlaps the table', () => {
    const mapSectorWidth = 2 * BOARD_RADIUS * Math.sin(STORM_SECTOR_ANGLE / 2);
    const visibleMarkerWidth = STORM_MARKER_TANGENTIAL_WIDTH * STORM_MARKER_VISIBLE_BASE_FRACTION;
    const visibleBaseCenterX = STORM_MARKER_INNER_X + STORM_MARKER_RADIAL_DEPTH * STORM_MARKER_BASE_CENTER_V;
    const outerCornerRadius = Math.hypot(STORM_MARKER_OUTER_X, STORM_MARKER_TANGENTIAL_WIDTH / 2);

    expect(visibleMarkerWidth).toBeCloseTo(mapSectorWidth, 8);
    expect(visibleBaseCenterX).toBeCloseTo(BOARD_RADIUS, 8);
    expect(STORM_MARKER_OUTER_X).toBeGreaterThan(BOARD_RIM_RADIUS);
    expect(outerCornerRadius).toBeLessThan(TABLE_VISIBLE_RADIUS);
    expect(STORM_MARKER_RADIAL_DEPTH).toBeLessThan(1);
  });

  test('uses the adjacent 20-degree path in both wrap directions', () => {
    const sectorOneRotation = stormRotationForSector(0);
    const sectorEighteenRotation = stormRotationForSector(17);

    expect(nearestStormRotation(sectorOneRotation, 17) - sectorOneRotation).toBeCloseTo(STORM_SECTOR_ANGLE, 8);
    expect(nearestStormRotation(sectorEighteenRotation, 0) - sectorEighteenRotation).toBeCloseTo(
      -STORM_SECTOR_ANGLE,
      8
    );
  });

  test('eases monotonically between exact transition endpoints', () => {
    expect(stormTransitionProgress(-1)).toBe(0);
    expect(stormTransitionProgress(0)).toBe(0);
    expect(stormTransitionProgress(STORM_TRANSITION_MS / 2)).toBe(0.5);
    expect(stormTransitionProgress(STORM_TRANSITION_MS)).toBe(1);
    expect(stormTransitionProgress(STORM_TRANSITION_MS + 1)).toBe(1);

    const samples = Array.from({ length: 11 }, (_, index) =>
      stormTransitionProgress((STORM_TRANSITION_MS * index) / 10)
    );
    expect(samples.every((sample, index) => index === 0 || sample >= samples[index - 1])).toBe(true);
  });
});
