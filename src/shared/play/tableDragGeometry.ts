import type { TablePiece, Vector3Tuple } from './model';
import { isSpicePiece } from './spice';
import { isSpiceBankPosition } from './spiceBank';
import { CARRIED_BASE_Y, pointOnRayAtHeight } from './tableGeometry';
import { TRACKER_DISC_TOP_Y } from './tableTrackers';

export function pointOnPieceDragRay(
  piece: TablePiece,
  origin: Vector3Tuple,
  direction: Vector3Tuple
): Vector3Tuple | null {
  if (isSpicePiece(piece)) {
    const spiceBankPoint = pointOnRayAtHeight(origin, direction, TRACKER_DISC_TOP_Y + 0.015);
    if (spiceBankPoint && isSpiceBankPosition(spiceBankPoint)) {
      return spiceBankPoint;
    }
  }
  return pointOnRayAtHeight(origin, direction, CARRIED_BASE_Y);
}
