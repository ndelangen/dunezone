import { fromPieceFrame, HMS_HEIGHT, hmsCovers, isHmsPiece } from './hms';
import type { TablePiece, Vector3Tuple } from './model';
import { restingPositionAt } from './tableGeometry';
import { isCollisionFreePosition } from './tablePhysics';

type Pose = Pick<TablePiece, 'position' | 'orientation'>;

/** The pieces riding a plate where it rests: every piece on the table whose centre lies over it, other plates aside. */
export function hmsRiders(pieces: readonly TablePiece[], plate: TablePiece): TablePiece[] {
  if (!isHmsPiece(plate) || plate.inventory) {
    return [];
  }
  return pieces.filter(
    (piece) =>
      piece.id !== plate.id &&
      !piece.inventory &&
      !piece.battleOverlay &&
      piece.items.length > 0 &&
      !isHmsPiece(piece) &&
      hmsCovers(plate, piece.position)
  );
}

/** Where a rider ends up when its plate goes from one pose to another: it keeps its place and its angle on the plate. */
export function riderPose(rider: TablePiece, from: Pose, to: Pose): Pose {
  const turn = to.orientation - from.orientation;
  /* The rider's offset in the plate's own frame, put back down at the plate's new pose. */
  const cosine = Math.cos(from.orientation);
  const sine = Math.sin(from.orientation);
  const x = rider.position[0] - from.position[0];
  const z = rider.position[2] - from.position[2];
  const [nextX, nextZ] = fromPieceFrame([x * cosine - z * sine, x * sine + z * cosine], to.position, to.orientation);
  const orientation = rider.orientation + turn;
  return { position: restingPositionAt([nextX, 0, nextZ], { ...rider, orientation }), orientation };
}

/** The table with every piece riding `plate` (as it rests in `pieces`) carried to the plate's new pose. */
export function withRidersCarried(pieces: TablePiece[], moved: TablePiece): TablePiece[] {
  const plate = pieces.find((piece) => piece.id === moved.id);
  if (!plate || !isHmsPiece(moved)) {
    return pieces;
  }
  const riders = new Set(hmsRiders(pieces, plate));
  if (!riders.size) {
    return pieces;
  }
  return pieces.map((piece) => (riders.has(piece) ? { ...piece, ...riderPose(piece, plate, moved) } : piece));
}

/**
 * What a piece set down or turned must keep clear of, and what else must fit where it lands.
 * A plate's riders are never in its way, and each must find room where the plate takes it.
 */
export function placementRules(
  pieces: readonly TablePiece[],
  moving: TablePiece,
  obstacles: TablePiece[]
): { obstacles: TablePiece[]; fits: (position: Vector3Tuple, orientation?: number) => boolean } {
  const plate = isHmsPiece(moving) ? pieces.find((piece) => piece.id === moving.id) : undefined;
  const riders = plate ? hmsRiders(pieces, plate) : [];
  if (!plate || !riders.length) {
    return { obstacles, fits: () => true };
  }
  const riderIds = new Set(riders.map((rider) => rider.id));
  const clear = obstacles.filter((obstacle) => !riderIds.has(obstacle.id));
  return {
    obstacles: clear,
    fits: (position, orientation = moving.orientation) =>
      riders.every((rider) => {
        const pose = riderPose(rider, plate, { position, orientation });
        return isCollisionFreePosition({ ...rider, orientation: pose.orientation }, pose.position, clear);
      }),
  };
}

/**
 * The pieces as a page shows them: whatever rides a plate that is being carried or turned moves with it, and everything resting on a plate stands on its top.
 * `rested` is the table as the room holds it, which says who rides.
 */
export function piecesOnPlates(shown: TablePiece[], rested: readonly TablePiece[]): TablePiece[] {
  const plates = shown.filter((piece) => isHmsPiece(piece) && !piece.inventory);
  if (!plates.length) {
    return shown;
  }
  const restedById = new Map(rested.map((piece) => [piece.id, piece]));
  const carried = new Map(plates.flatMap((plate) => ridersShownOn(plate, restedById.get(plate.id), rested)));
  return shown.map((piece) => {
    const riding = carried.get(piece.id);
    /* A rider someone has picked up is wherever their hand is, not on the plate. */
    return riding && samePlace(piece, restedById.get(piece.id)) ? { ...piece, ...riding } : piece;
  });
}

/* Each rider's pose on a plate as shown, by its id: carried with the plate and standing on its top. */
function ridersShownOn(plate: TablePiece, resting: TablePiece | undefined, rested: readonly TablePiece[]) {
  return (resting ? hmsRiders(rested, resting) : []).map((rider): [string, Pose] => {
    const pose = riderPose(rider, resting!, plate);
    return [
      rider.id,
      { orientation: pose.orientation, position: [pose.position[0], plate.position[1] + HMS_HEIGHT, pose.position[2]] },
    ];
  });
}

function samePlace(piece: TablePiece, rested: TablePiece | undefined): boolean {
  return (
    !!rested &&
    piece.position[0] === rested.position[0] &&
    piece.position[2] === rested.position[2] &&
    piece.orientation === rested.orientation
  );
}
