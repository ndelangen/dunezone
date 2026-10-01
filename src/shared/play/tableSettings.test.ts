import { describe, expect, test } from 'vitest';

import {
  DEFAULT_TABLE_SEAT_COUNT,
  tableSeatAngles,
  tableSeatSectorIndices,
  TABLE_SEAT_COUNTS,
  TABLE_SECTOR_COUNT,
} from './tableSettings';
import type { TableSeatCount } from './tableSettings';

const layouts = [
  {
    seatCount: 4,
    clockwiseSectorIndices: [13, 0, 4, 9],
    sectorGaps: [4, 5, 4, 5],
  },
  {
    seatCount: 5,
    clockwiseSectorIndices: [13, 17, 2, 6, 9],
    sectorGaps: [4, 3, 4, 3, 4],
  },
  {
    seatCount: 6,
    clockwiseSectorIndices: [13, 16, 1, 4, 7, 10],
    sectorGaps: [3, 3, 3, 3, 3, 3],
  },
] satisfies Array<{
  seatCount: TableSeatCount;
  clockwiseSectorIndices: number[];
  sectorGaps: number[];
}>;

function reverseSeatOrder(sectorIndices: number[]): number[] {
  return [sectorIndices[0], ...sectorIndices.slice(1).reverse()];
}

function counterclockwiseSectorGaps(sectorIndices: number[]): number[] {
  return sectorIndices.map((sectorIndex, index) => {
    const nextSectorIndex = sectorIndices[(index + 1) % sectorIndices.length];
    return (sectorIndex - nextSectorIndex + TABLE_SECTOR_COUNT) % TABLE_SECTOR_COUNT;
  });
}

describe('table seating', () => {
  test.each(layouts)(
    'centers $seatCount seats in the most even counterclockwise layout',
    ({ seatCount, clockwiseSectorIndices, sectorGaps }) => {
      const actualSectorIndices = tableSeatSectorIndices(seatCount);
      const expectedSectorIndices = reverseSeatOrder(clockwiseSectorIndices);

      expect(actualSectorIndices).toEqual(expectedSectorIndices);
      expect(counterclockwiseSectorGaps(actualSectorIndices)).toEqual(sectorGaps);
      expect(Math.max(...sectorGaps) - Math.min(...sectorGaps)).toBeLessThanOrEqual(1);
    }
  );

  test.each(layouts)(
    'keeps every $seatCount-seat station on a sector center',
    ({ seatCount, clockwiseSectorIndices }) => {
      const sectorIndices = reverseSeatOrder(clockwiseSectorIndices);
      const sectorAngle = (Math.PI * 2) / TABLE_SECTOR_COUNT;

      tableSeatAngles(seatCount).forEach((angle, index) => {
        const sectorPosition = angle / sectorAngle;

        expect(Math.floor(sectorPosition)).toBe(sectorIndices[index]);
        expect(sectorPosition - Math.floor(sectorPosition)).toBeCloseTo(0.5);
      });
    }
  );
});

describe('every accepted seat count', () => {
  /* The roster limit, the result and directory pages, the create route and the tracker sweep read the ends of this list as the fewest and the most. */
  test('is listed in ascending order, so the ends of the list are the fewest and the most', () => {
    expect([...TABLE_SEAT_COUNTS].sort((left, right) => left - right)).toEqual([...TABLE_SEAT_COUNTS]);
  });

  test('seats the default count strictly between the fewest and the most', () => {
    expect(DEFAULT_TABLE_SEAT_COUNT).toBeGreaterThan(TABLE_SEAT_COUNTS[0]);
    expect(DEFAULT_TABLE_SEAT_COUNT).toBeLessThan(TABLE_SEAT_COUNTS[TABLE_SEAT_COUNTS.length - 1]);
  });

  test.each(TABLE_SEAT_COUNTS)('seats %s players in distinct sectors with near-even gaps', (seatCount) => {
    const sectorIndices = tableSeatSectorIndices(seatCount);

    expect(sectorIndices).toHaveLength(seatCount);
    expect(new Set(sectorIndices).size).toBe(seatCount);
    expect(sectorIndices.every((index) => index >= 0 && index < TABLE_SECTOR_COUNT)).toBe(true);
    const gaps = counterclockwiseSectorGaps(sectorIndices);
    expect(Math.max(...gaps) - Math.min(...gaps)).toBeLessThanOrEqual(1);
  });
});
