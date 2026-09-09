export const TABLE_SEAT_COUNTS = [4, 5, 6] as const;

export const TABLE_SECTOR_COUNT = 18;
const FIRST_TABLE_SEAT_SECTOR_INDEX = 13;
export const PLAYER_RING_RADIUS = 4.69;
export const PLAYER_STATION_RADIUS = 0.34;

export type TableSeatCount = (typeof TABLE_SEAT_COUNTS)[number];

export const DEFAULT_TABLE_SEAT_COUNT: TableSeatCount = 6;

export function isTableSeatCount(value: number): value is TableSeatCount {
  return TABLE_SEAT_COUNTS.includes(value as TableSeatCount);
}

export function tableSectorCenterAngle(sectorIndex: number): number {
  return ((sectorIndex + 0.5) / TABLE_SECTOR_COUNT) * Math.PI * 2;
}

export function tableSeatSectorIndices(seatCount: TableSeatCount): number[] {
  return Array.from({ length: seatCount }, (_, seatIndex) => {
    const reversedSeatIndex = (seatCount - seatIndex) % seatCount;
    const sectorOffset = Math.round((reversedSeatIndex * TABLE_SECTOR_COUNT) / seatCount);
    return (FIRST_TABLE_SEAT_SECTOR_INDEX + sectorOffset) % TABLE_SECTOR_COUNT;
  });
}

export function tableSeatAngles(seatCount: TableSeatCount): number[] {
  return tableSeatSectorIndices(seatCount).map(tableSectorCenterAngle);
}
