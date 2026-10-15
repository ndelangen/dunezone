import { isFactionToken } from './factionToken';
import { nearestZone } from './model';
import type { TablePiece, Vector3Tuple } from './model';
import { fromPieceFrame, POINTER_HEIGHT, pointerCovers, isPointerToken } from './pointerToken';
import { CARRIED_BASE_Y, restingPositionAt } from './tableGeometry';
import { isCollisionFreePosition } from './tablePhysics';

type Pose = Pick<TablePiece, 'position' | 'orientation'>;

/** The pieces riding a plate where it rests: every piece on the table whose centre lies over it, other plates aside. */
export function pointerRiders(pieces: readonly TablePiece[], plate: TablePiece): TablePiece[] {
  if (!isPointerToken(plate) || plate.inventory || plate.battleOverlay) {
    return [];
  }
  return pieces.filter((piece) => piece.id !== plate.id && canRide(piece) && pointerCovers(plate, piece.position));
}

/*
 * Only troops, cards and tokens standing loose on the table ride: a locked piece, or one another player is carrying, stays where it is.
 * Markers and faction tokens keep to their own places on the table, and a plate never rides another.
 */
function canRide(piece: TablePiece): boolean {
  return (
    !piece.inventory &&
    !piece.battleOverlay &&
    !piece.locked &&
    piece.kind !== 'marker' &&
    piece.items.length > 0 &&
    !isPointerToken(piece) &&
    !isFactionToken(piece)
  );
}

/** Where a rider ends up when its plate goes from one pose to another: it keeps its place and its angle on the plate. */
function riderPose(rider: TablePiece, from: Pose, to: Pose): Pose {
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
  if (!plate || !isPointerToken(moved)) {
    return pieces;
  }
  const riders = new Set(pointerRiders(pieces, plate));
  if (!riders.size) {
    return pieces;
  }
  return pieces.map((piece) => (riders.has(piece) ? carriedRider(piece, riderPose(piece, plate, moved)) : piece));
}

/* A rider set down at its new pose takes the zone it now stands in, as any piece moved there would. */
function carriedRider(rider: TablePiece, pose: Pose): TablePiece {
  return { ...rider, ...pose, zoneId: nearestZone(pose.position)?.id ?? null };
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
  const plate = isPointerToken(moving) ? pieces.find((piece) => piece.id === moving.id) : undefined;
  const riders = plate ? pointerRiders(pieces, plate) : [];
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

/** Every piece riding one of `plateIds` where it rests in `rested`, by its id, to the id of the plate it rides. */
export function ridersOf(rested: readonly TablePiece[], plateIds: ReadonlySet<string>): Map<string, string> {
  return new Map(
    rested
      .filter((piece) => plateIds.has(piece.id))
      .flatMap((plate) => pointerRiders(rested, plate).map((rider): [string, string] => [rider.id, plate.id]))
  );
}

/**
 * The pieces as a page shows them: whatever rides a plate that is being carried or turned moves with it, and everything resting on a plate stands on its top.
 * `rested` is the table as the room holds it, which says who rides.
 */
export function piecesOnPlates(shown: TablePiece[], rested: readonly TablePiece[]): TablePiece[] {
  const plates = shown.filter((piece) => isPointerToken(piece) && !piece.inventory);
  if (!plates.length) {
    return shown;
  }
  const restedById = new Map(rested.map((piece) => [piece.id, piece]));
  const carried = new Map(plates.flatMap((plate) => ridersShownOn(plate, restedById.get(plate.id), rested)));
  /* A plate that has not moved holds up whatever stands on it, riders or not, such as a locked troop. */
  const still = plates.filter((plate) => samePlace(plate, restedById.get(plate.id)));
  return shown.map((piece) => {
    const resting = restedById.get(piece.id);
    /* A rider someone has picked up is wherever their hand is, not on the plate. */
    if (!samePlace(piece, resting)) {
      return piece;
    }
    const riding = carried.get(piece.id);
    if (riding) {
      /* A rider turned on its own keeps that turn on top of the plate's. */
      return {
        ...piece,
        position: riding.position,
        orientation: riding.orientation + piece.orientation - resting!.orientation,
      };
    }
    return isPointerToken(piece) ? piece : standingOn(piece, still);
  });
}

/* A piece resting where a still plate lies, raised onto its top. */
function standingOn(piece: TablePiece, plates: readonly TablePiece[]): TablePiece {
  const plate = plates.find((candidate) => pointerCovers(candidate, piece.position));
  const top = plate ? plate.position[1] + POINTER_HEIGHT : piece.position[1];
  return top > piece.position[1] ? { ...piece, position: [piece.position[0], top, piece.position[2]] } : piece;
}

/* Each rider's pose on a plate as shown, by its id: carried with the plate and standing on its top. */
function ridersShownOn(plate: TablePiece, resting: TablePiece | undefined, rested: readonly TablePiece[]) {
  return (resting ? pointerRiders(rested, resting) : []).map((rider): [string, Pose] => {
    const pose = riderPose(rider, resting!, plate);
    return [
      rider.id,
      {
        orientation: pose.orientation,
        position: [pose.position[0], plate.position[1] + POINTER_HEIGHT, pose.position[2]],
      },
    ];
  });
}

/*
 * Whether a piece is shown where it rests rather than in someone's hand.
 * A turn in place keeps it on its plate, even where the turn settles it a little higher or lower on the board's rim.
 */
function samePlace(piece: TablePiece, rested: TablePiece | undefined): boolean {
  return (
    !!rested &&
    piece.position[0] === rested.position[0] &&
    piece.position[2] === rested.position[2] &&
    piece.position[1] < CARRIED_BASE_Y
  );
}
