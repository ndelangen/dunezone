import { BOARD_RADIUS } from './tableGeometry';
import { tableSectorCenterAngle, TABLE_SECTOR_COUNT } from './tableSettings';

export const DEFAULT_STORM_SECTOR_INDEX = 5;
export const STORM_SECTOR_ANGLE = (Math.PI * 2) / TABLE_SECTOR_COUNT;
export const STORM_SECTOR_FILL_OPACITY = 0.28;
export const STORM_SECTOR_OUTLINE_OPACITY = 0.3;
export const STORM_TRANSITION_MS = 400;
const STORM_MARKER_ASPECT_RATIO = 1910 / 956;
// These values follow the PNG's transparent inner edge where it meets the map.
export const STORM_MARKER_VISIBLE_BASE_FRACTION = 0.844;
export const STORM_MARKER_BASE_CENTER_V = 0.152;
export const STORM_MARKER_TANGENTIAL_WIDTH =
  (2 * BOARD_RADIUS * Math.sin(STORM_SECTOR_ANGLE / 2)) / STORM_MARKER_VISIBLE_BASE_FRACTION;
export const STORM_MARKER_RADIAL_DEPTH = STORM_MARKER_TANGENTIAL_WIDTH / STORM_MARKER_ASPECT_RATIO;
export const STORM_MARKER_INNER_X = BOARD_RADIUS - STORM_MARKER_RADIAL_DEPTH * STORM_MARKER_BASE_CENTER_V;
export const STORM_MARKER_OUTER_X = STORM_MARKER_INNER_X + STORM_MARKER_RADIAL_DEPTH;

export function normalizeStormSectorIndex(sectorIndex: number): number {
  const integerIndex = Math.trunc(sectorIndex);
  return ((integerIndex % TABLE_SECTOR_COUNT) + TABLE_SECTOR_COUNT) % TABLE_SECTOR_COUNT;
}

export function moveStormCounterclockwise(sectorIndex: number, distance = 1): number {
  return normalizeStormSectorIndex(sectorIndex - Math.trunc(distance));
}

export function stormRotationForSector(sectorIndex: number): number {
  return -tableSectorCenterAngle(normalizeStormSectorIndex(sectorIndex));
}

export function nearestStormRotation(currentRotation: number, sectorIndex: number): number {
  const normalizedTarget = stormRotationForSector(sectorIndex);
  const shortestDelta = Math.atan2(
    Math.sin(normalizedTarget - currentRotation),
    Math.cos(normalizedTarget - currentRotation)
  );
  return currentRotation + shortestDelta;
}

export function stormTransitionProgress(elapsedMs: number): number {
  const progress = Math.max(0, Math.min(1, elapsedMs / STORM_TRANSITION_MS));
  return progress * progress * (3 - 2 * progress);
}
