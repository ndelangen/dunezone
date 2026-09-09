import type { TablePiece, Vector3Tuple } from './model';
import { isSpicePiece } from './spice';
import { isSpiceSupplyPosition } from './spiceSupply';
import { CARRIED_BASE_Y, pointOnRayAtHeight } from './tableGeometry';
import { TRACKER_DISC_TOP_Y } from './tableTrackers';

export function pointOnPieceDragRay(
  piece: TablePiece,
  origin: Vector3Tuple,
  direction: Vector3Tuple
): Vector3Tuple | null {
  if (isSpicePiece(piece)) {
    const supplyPoint = pointOnRayAtHeight(origin, direction, TRACKER_DISC_TOP_Y + 0.015);
    if (supplyPoint && isSpiceSupplyPosition(supplyPoint)) {
      return supplyPoint;
    }
  }
  return pointOnRayAtHeight(origin, direction, CARRIED_BASE_Y);
}
