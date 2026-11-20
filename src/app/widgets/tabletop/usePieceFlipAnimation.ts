import { useFrame, useThree } from '@react-three/fiber/webgpu';
import type { TablePiece } from '@shared/play/model';
import {
  canAnimatePieceChange,
  createPieceFlipMotion,
  markPieceFlipPending,
  pieceFlipFrame,
  releasePieceFlipMotion,
  retargetPieceFlipMotion,
} from '@shared/play/pieceFlip';
import { useCallback, useLayoutEffect, useRef } from 'react';
import type { Group } from 'three';

import { flipStyle, playFlipSound } from './deckFlipTrial';

type FlipFrameTargets = {
  pivot: Group | null;
  label: Group | null;
  shadow: Group | null;
  badge: HTMLSpanElement | null;
};

function applyFlipFrame(frame: ReturnType<typeof pieceFlipFrame>, { pivot, label, shadow, badge }: FlipFrameTargets) {
  if (pivot) {
    pivot.rotation.z = frame.rotationZ;
    pivot.position.y = frame.pivotY;
  }
  label?.position.set(0, frame.labelY, 0);
  shadow?.scale.set(frame.shadowScale, 1, frame.shadowScale);
  if (badge) {
    badge.dataset.flipping = String(frame.active);
  }
}

/**
 * Turns a piece over when its flip revision moves on by one.
 * `faceReady` says whether the art of the face it turns up is loaded;
 * until it is, the flip holds on the old face rather than turning up a placeholder.
 * `pending` says this page's own flip of it is on its way to the room, which already shows the waiting pose.
 */
export function usePieceFlipAnimation(
  piece: TablePiece,
  interrupted: boolean,
  onFinish: (pieceId: string, revision: number) => void,
  faceReady = true,
  pending = false
) {
  const pivotRef = useRef<Group>(null);
  const labelRef = useRef<Group>(null);
  const shadowRef = useRef<Group>(null);
  const badgeRef = useRef<HTMLSpanElement>(null);
  const previousPiece = useRef(piece);
  const motion = useRef(createPieceFlipMotion(piece.flipRevision ?? 0));
  const faceReadyRef = useRef(faceReady);
  const invalidate = useThree((state) => state.invalidate);
  useLayoutEffect(() => {
    faceReadyRef.current = faceReady;
  }, [faceReady]);

  const applyPose = useCallback(
    (now: number) => {
      const frame = pieceFlipFrame(motion.current, piece, now, flipStyle());
      applyFlipFrame(frame, {
        pivot: pivotRef.current,
        label: labelRef.current,
        shadow: shadowRef.current,
        badge: badgeRef.current,
      });
      if (!frame.active) {
        onFinish(piece.id, motion.current.targetRevision);
      }
      return frame.active;
    },
    [onFinish, piece]
  );

  useLayoutEffect(() => {
    const now = performance.now();
    const revision = piece.flipRevision ?? 0;
    const startedBefore = motion.current.startedAt;
    motion.current =
      interrupted || !canAnimatePieceChange(previousPiece.current, piece)
        ? createPieceFlipMotion(revision)
        : markPieceFlipPending(
            retargetPieceFlipMotion(motion.current, revision, now, faceReadyRef.current, flipStyle()),
            pending,
            now
          );
    previousPiece.current = piece;
    soundOnStart(startedBefore, motion.current.startedAt);
    /* Compensate for the new canonical faces before the first rendered frame. */
    applyPose(now);
    invalidate();
  }, [applyPose, interrupted, invalidate, piece, pending]);

  useLayoutEffect(() => {
    if (faceReady && motion.current.heldSince !== null) {
      const now = performance.now();
      motion.current = releasePieceFlipMotion(motion.current, now, true, flipStyle());
      soundOnStart(null, motion.current.startedAt);
      applyPose(now);
      invalidate();
    }
  }, [applyPose, faceReady, invalidate]);

  useLayoutEffect(
    () => () => {
      const revision = motion.current.targetRevision;
      motion.current = createPieceFlipMotion(revision);
      onFinish(piece.id, revision);
    },
    [onFinish, piece.id]
  );

  useFrame(() => {
    if (
      motion.current.startedAt === null &&
      motion.current.heldSince === null &&
      motion.current.waitingSince === undefined
    ) {
      return;
    }
    const now = performance.now();
    const startedBefore = motion.current.startedAt;
    motion.current = releasePieceFlipMotion(motion.current, now, faceReadyRef.current, flipStyle());
    soundOnStart(startedBefore, motion.current.startedAt);
    if (applyPose(now)) {
      invalidate();
    } else {
      motion.current = createPieceFlipMotion(motion.current.targetRevision);
    }
  });

  return { pivotRef, labelRef, shadowRef, badgeRef };
}

/* The turn's flick, once, as it begins. */
function soundOnStart(before: number | null, after: number | null) {
  if (before === null && after !== null) {
    playFlipSound();
  }
}
