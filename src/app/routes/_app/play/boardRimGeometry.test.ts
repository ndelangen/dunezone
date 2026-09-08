import { describe, expect, test } from 'vitest';

import { createBoardRimShape } from './boardRimGeometry';
import { BOARD_RIM_RADIUS } from './tableGeometry';
import { PLAYER_RING_RADIUS, PLAYER_STATION_RADIUS, tableSeatAngles, TABLE_SEAT_COUNTS } from './tableSettings';

describe('unified board rim', () => {
  for (const seatCount of TABLE_SEAT_COUNTS) {
    test(`builds one continuous rim and player-collar outline for ${seatCount} seats`, () => {
      const shape = createBoardRimShape(seatCount);
      const points = shape.getPoints(64);
      const radii = points.map((point) => Math.hypot(point.x, point.y));

      expect(shape.holes).toHaveLength(0);
      expect(points.every((point) => Number.isFinite(point.x) && Number.isFinite(point.y))).toBe(true);
      expect(Math.min(...radii)).toBeCloseTo(BOARD_RIM_RADIUS, 6);
      expect(Math.max(...radii)).toBeCloseTo(PLAYER_RING_RADIUS + PLAYER_STATION_RADIUS, 6);

      for (const angle of tableSeatAngles(seatCount)) {
        const outwardExtent = Math.max(...points.map((point) => point.x * Math.cos(angle) + point.y * Math.sin(angle)));
        expect(outwardExtent).toBeCloseTo(PLAYER_RING_RADIUS + PLAYER_STATION_RADIUS, 6);
      }
    });
  }
});
