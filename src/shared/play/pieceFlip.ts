import type { TablePiece } from './model';
import { isPointerToken, POINTER_BODY_RADIUS } from './pointerToken';
import {
  CARD_WIDTH,
  TROOP_BOTTOM_RADIUS,
  TROOP_TOP_RADIUS,
  troopScale,
  pieceLabelHeight,
  stackTopHeight,
  visibleLayerCount,
} from './tableGeometry';

export const CARD_LAYER_STAGGER = 0.012;
export const PIECE_FLIP_DURATION_MS = 520;
/** How long a flip waits, still showing its old face, for the art of the face it turns up before it turns anyway. */
export const PIECE_FLIP_HOLD_MS = 1200;

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
  /* Mirror the same sampled items when the canonical stack reverses. */
  return flipRevision % 2 === 0 ? sample(layerIndex) : itemCount - 1 - sample(shownLayers - 1 - layerIndex);
}

/**
 * How a turn-over feels: the pose a piece takes while it waits for its face (the room's answer, then the face's art), and how long the turn itself takes.
 * Prototypes for #2989;
 * `today` is the table's own flip, which waits without moving.
 */
export type PieceFlipStyle = Readonly<{
  /** Lift while waiting, as a share of the flip's own highest lift. */
  waitLift: number;
  /** How far the piece turns while waiting, in radians, up to standing on its edge. */
  waitTurn: number;
  /** A slow rock about the turn while waiting, in radians. */
  wobble: number;
  /** A slow bob in height while waiting, as a share of the flip's highest lift. */
  bob: number;
  /** How long the piece takes to reach its waiting pose. */
  waitRampMs: number;
  /** How long the turn itself takes once the face is in. */
  turnMs: number;
}>;

export const PIECE_FLIP_STYLES = {
  today: { waitLift: 0, waitTurn: 0, wobble: 0, bob: 0, waitRampMs: 0, turnMs: PIECE_FLIP_DURATION_MS },
  lift: { waitLift: 1, waitTurn: 0, wobble: 0, bob: 0.12, waitRampMs: 140, turnMs: PIECE_FLIP_DURATION_MS },
  edge: { waitLift: 1, waitTurn: Math.PI / 2, wobble: 0, bob: 0, waitRampMs: 200, turnMs: 340 },
  tease: { waitLift: 0.55, waitTurn: 0.42, wobble: 0.07, bob: 0, waitRampMs: 160, turnMs: PIECE_FLIP_DURATION_MS },
  snap: { waitLift: 0.4, waitTurn: 0, wobble: 0, bob: 0, waitRampMs: 90, turnMs: 280 },
} as const satisfies Record<string, PieceFlipStyle>;

export type PieceFlipStyleName = keyof typeof PIECE_FLIP_STYLES;

/** The pose a turn starts from: lift as a share of the flip's highest lift, and the turn already made. */
type FlipPose = Readonly<{ lift: number; turn: number }>;

export type PieceFlipMotion = {
  fromRevision: number;
  targetRevision: number;
  startedAt: number | null;
  /** When a flip began waiting for the art of the face it turns up; it shows the old face until then. */
  heldSince: number | null;
  /** When the piece began its waiting pose: this page's flip went out, or the flip began holding for its face. */
  waitingSince?: number;
  /** The waiting pose the turn started from. */
  from?: FlipPose;
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
    heldSince: null,
  };
}

const easeOut = (fraction: number) => 1 - (1 - fraction) * (1 - fraction);

/** The pose a piece holds while waiting, `waitedMs` after it began. */
export function waitingPose(style: PieceFlipStyle, waitedMs: number): FlipPose {
  const ramp = style.waitRampMs > 0 ? easeOut(Math.min(1, Math.max(0, waitedMs) / style.waitRampMs)) : 1;
  const beat = Math.sin((Math.max(0, waitedMs) / 1000) * Math.PI * 2 * 1.6);
  const turn = (style.waitTurn + style.wobble * beat) * ramp;
  /* Lifted at least as far as the turn needs to clear the table. */
  const lift = (Math.max(style.waitLift, Math.sin(Math.abs(turn))) + style.bob * (beat - 1) * 0.5) * ramp;
  return { lift: Math.max(0, lift), turn };
}

/** Starts the waiting pose when this page's own flip goes out, and drops it again if the room refuses the flip. */
export function markPieceFlipPending(motion: PieceFlipMotion, pending: boolean, nowMs: number): PieceFlipMotion {
  const answered = motion.targetRevision !== motion.fromRevision || motion.startedAt !== null;
  if (pending && !answered && motion.waitingSince === undefined) {
    return { ...motion, waitingSince: nowMs };
  }
  if (!pending && !answered && motion.waitingSince !== undefined) {
    return createPieceFlipMotion(motion.targetRevision);
  }
  return motion;
}

export function retargetPieceFlipMotion(
  motion: PieceFlipMotion,
  revision: number,
  nowMs: number,
  faceReady = true,
  style: PieceFlipStyle = PIECE_FLIP_STYLES.today
): PieceFlipMotion {
  if (revision === motion.targetRevision) {
    return motion;
  }

  const active = motion.heldSince !== null || (motion.startedAt !== null && nowMs - motion.startedAt < style.turnMs);
  if (active || revision !== motion.targetRevision + 1) {
    /* Commands block repeated flips. Unexpected snapshots settle to their canonical pose. */
    return createPieceFlipMotion(revision);
  }

  const waited = motion.waitingSince !== undefined && motion.startedAt === null;
  const next: PieceFlipMotion = {
    fromRevision: motion.targetRevision,
    targetRevision: revision,
    startedAt: faceReady ? nowMs : null,
    heldSince: faceReady ? null : nowMs,
  };
  if (faceReady) {
    return waited ? { ...next, from: waitingPose(style, nowMs - motion.waitingSince!) } : next;
  }
  return style === PIECE_FLIP_STYLES.today && !waited
    ? next
    : { ...next, waitingSince: waited ? motion.waitingSince : nowMs };
}

/** Starts a held flip once the face it turns up is ready, or once it has waited `PIECE_FLIP_HOLD_MS` regardless. */
export function releasePieceFlipMotion(
  motion: PieceFlipMotion,
  nowMs: number,
  faceReady: boolean,
  style: PieceFlipStyle = PIECE_FLIP_STYLES.today
): PieceFlipMotion {
  if (motion.heldSince === null || (!faceReady && nowMs - motion.heldSince < PIECE_FLIP_HOLD_MS)) {
    return motion;
  }
  const started = { ...motion, startedAt: nowMs, heldSince: null };
  return motion.waitingSince === undefined
    ? started
    : { ...started, from: waitingPose(style, nowMs - motion.waitingSince) };
}

function matchingFlipIdentity(previous: TablePiece, next: TablePiece): boolean {
  if (previous.id !== next.id || previous.kind !== next.kind) {
    return false;
  }
  return previous.items.length > 0 && previous.items.length === next.items.length;
}

function consecutiveFlipRevisions(previous: number, next: number): boolean {
  if (!Number.isSafeInteger(previous) || !Number.isSafeInteger(next)) {
    return false;
  }
  if (previous < 0 || next < previous) {
    return false;
  }
  return next <= previous + 1;
}

export function canAnimatePieceChange(previous: TablePiece, next: TablePiece): boolean {
  const previousRevision = previous.flipRevision ?? 0;
  const nextRevision = next.flipRevision ?? 0;
  if (!matchingFlipIdentity(previous, next) || !consecutiveFlipRevisions(previousRevision, nextRevision)) {
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
  /* A plate turns over about its own length, so its round end is what swings past the table. */
  if (isPointerToken(piece)) {
    return POINTER_BODY_RADIUS;
  }
  return Math.max(TROOP_BOTTOM_RADIUS, TROOP_TOP_RADIUS) * troopScale(piece);
}

export function pieceFlipFrame(
  motion: PieceFlipMotion,
  piece: TablePiece,
  nowMs: number,
  style: PieceFlipStyle = PIECE_FLIP_STYLES.today
): PieceFlipFrame {
  const height = stackTopHeight(piece);
  const idle: PieceFlipFrame = {
    rotationZ: 0,
    lift: 0,
    pivotY: height / 2,
    labelY: pieceLabelHeight(piece),
    shadowScale: 1,
    active: false,
  };
  if (piece.kind === 'marker' || piece.items.length === 0) {
    return idle;
  }
  const peak = pieceHalfWidth(piece) + FLIP_CLEARANCE;
  const pose = (liftShare: number, rotationZ: number): PieceFlipFrame => {
    const lift = peak * liftShare;
    const pivotY = height / 2 + lift;
    const rotatedHalfHeight =
      (peak - FLIP_CLEARANCE) * Math.abs(Math.sin(rotationZ)) + (height / 2) * Math.abs(Math.cos(rotationZ));
    return {
      rotationZ,
      lift,
      pivotY,
      labelY: pivotY + rotatedHalfHeight + pieceLabelHeight(piece) - height,
      shadowScale: 1 + lift * 0.35,
      active: true,
    };
  };

  /* This page's own flip is on its way to the room: the piece still shows its old faces, unturned. */
  if (motion.targetRevision === motion.fromRevision && motion.startedAt === null && motion.waitingSince !== undefined) {
    const waiting = waitingPose(style, nowMs - motion.waitingSince);
    return waiting.lift === 0 && waiting.turn === 0 ? { ...idle, active: true } : pose(waiting.lift, waiting.turn);
  }
  if ((motion.startedAt === null && motion.heldSince === null) || motion.targetRevision !== motion.fromRevision + 1) {
    return idle;
  }
  /* The new faces are already in place, turned back by half a turn so the old ones still show. */
  if (motion.startedAt === null) {
    const waiting =
      motion.waitingSince === undefined ? { lift: 0, turn: 0 } : waitingPose(style, nowMs - motion.waitingSince);
    return pose(waiting.lift, waiting.turn - Math.PI);
  }

  const fraction = Math.max(0, nowMs - motion.startedAt) / style.turnMs;
  if (fraction >= 1) {
    return idle;
  }

  const easedFraction = fraction * fraction * (3 - 2 * fraction);
  const from = motion.from ?? { lift: 0, turn: 0 };
  const share = from.turn / Math.PI;
  const progress = share + (1 - share) * easedFraction;
  const arc = Math.sin(Math.PI * progress);
  const fromLift =
    easedFraction < 0.5
      ? from.lift + (1 - from.lift) * Math.sin(Math.PI * easedFraction)
      : Math.sin(Math.PI * easedFraction);
  return pose(from.lift > 0 ? Math.max(arc, fromLift) : arc, (progress - 1) * Math.PI);
}
