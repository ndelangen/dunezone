import { describe, expect, test } from 'vitest';

import { tableSeatAngles, tableSeatSectorIndices, TABLE_SECTOR_COUNT } from './tableSettings';
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
