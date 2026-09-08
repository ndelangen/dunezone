import type { TablePiece } from './model';
import {
  CARD_WIDTH,
  FORCE_BOTTOM_RADIUS,
  FORCE_FACE_RADIUS,
  FORCE_TOP_RADIUS,
  pieceLabelHeight,
  stackTopHeight,
  visibleLayerCount,
} from './tableGeometry';

export const CARD_LAYER_STAGGER = 0.012;
export const PIECE_FLIP_DURATION_MS = 520;

const FLIP_CLEARANCE = 0.06;

export function stackLayerItemIndex(
  itemCount: number,
  shownLayers: number,
  layerIndex: number,
  flipRevision = 0
): number {
  if (shownLayers <= 1) {
    return 0;
  }
  const sample = (index: number) => Math.round((index * (itemCount - 1)) / (shownLayers - 1));
  // Mirror the same sampled items when the canonical stack reverses.
  return flipRevision % 2 === 0 ? sample(layerIndex) : itemCount - 1 - sample(shownLayers - 1 - layerIndex);
}

export type PieceFlipMotion = {
  fromRevision: number;
  targetRevision: number;
  startedAt: number | null;
};

export type PieceFlipFrame = {
  rotationZ: number;
  lift: number;
  pivotY: number;
  labelY: number;
  shadowScale: number;
  active: boolean;
};

export function createPieceFlipMotion(revision: number): PieceFlipMotion {
  return {
    fromRevision: revision,
    targetRevision: revision,
    startedAt: null,
  };
}

export function retargetPieceFlipMotion(motion: PieceFlipMotion, revision: number, nowMs: number): PieceFlipMotion {
  if (revision === motion.targetRevision) {
    return motion;
  }

  const active = motion.startedAt !== null && nowMs - motion.startedAt < PIECE_FLIP_DURATION_MS;
  if (active || revision !== motion.targetRevision + 1) {
    // Commands block repeated flips. Unexpected snapshots settle to their canonical pose.
    return createPieceFlipMotion(revision);
  }

  return {
    fromRevision: motion.targetRevision,
    targetRevision: revision,
    startedAt: nowMs,
  };
}

export function canAnimatePieceChange(previous: TablePiece, next: TablePiece): boolean {
  const previousRevision = previous.flipRevision ?? 0;
  const nextRevision = next.flipRevision ?? 0;
  if (
    previous.id !== next.id ||
    previous.kind !== next.kind ||
    previous.items.length === 0 ||
    previous.items.length !== next.items.length ||
    !Number.isSafeInteger(previousRevision) ||
    !Number.isSafeInteger(nextRevision) ||
    previousRevision < 0 ||
    nextRevision < previousRevision ||
    nextRevision > previousRevision + 1
  ) {
    return false;
  }

  const reversed = (nextRevision - previousRevision) % 2 === 1;
  return next.items.every((item, index) => {
    const previousItem = previous.items[reversed ? previous.items.length - 1 - index : index];
    return item.id === previousItem.id && item.faceUp === (reversed ? !previousItem.faceUp : previousItem.faceUp);
  });
}

function pieceHalfWidth(piece: TablePiece): number {
  if (piece.kind === 'card') {
    return (CARD_WIDTH + (visibleLayerCount(piece) - 1) * CARD_LAYER_STAGGER) / 2;
  }
  return Math.max(FORCE_BOTTOM_RADIUS, FORCE_TOP_RADIUS, FORCE_FACE_RADIUS);
}

export function pieceFlipFrame(motion: PieceFlipMotion, piece: TablePiece, nowMs: number): PieceFlipFrame {
  const height = stackTopHeight(piece);
  const idle: PieceFlipFrame = {
    rotationZ: 0,
    lift: 0,
    pivotY: height / 2,
    labelY: pieceLabelHeight(piece),
    shadowScale: 1,
    active: false,
  };
  if (
    piece.kind === 'marker' ||
    piece.items.length === 0 ||
    motion.startedAt === null ||
    motion.targetRevision !== motion.fromRevision + 1
  ) {
    return idle;
  }

  const fraction = Math.max(0, nowMs - motion.startedAt) / PIECE_FLIP_DURATION_MS;
  if (fraction >= 1) {
    return idle;
  }

  const easedFraction = fraction * fraction * (3 - 2 * fraction);
  const halfWidth = pieceHalfWidth(piece);
  const lift = (halfWidth + FLIP_CLEARANCE) * Math.sin(Math.PI * easedFraction);
  const rotationZ = (easedFraction - 1) * Math.PI;
  const pivotY = height / 2 + lift;
  const rotatedHalfHeight = halfWidth * Math.abs(Math.sin(rotationZ)) + (height / 2) * Math.abs(Math.cos(rotationZ));

  return {
    rotationZ,
    lift,
    pivotY,
    labelY: pivotY + rotatedHalfHeight + pieceLabelHeight(piece) - height,
    shadowScale: 1 + lift * 0.35,
    active: true,
  };
}
