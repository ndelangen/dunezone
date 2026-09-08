import { useFrame, useThree } from '@react-three/fiber/webgpu';
import { useCallback, useLayoutEffect, useRef } from 'react';
import type { Group } from 'three';

import type { TablePiece } from './model';
import { canAnimatePieceChange, createPieceFlipMotion, pieceFlipFrame, retargetPieceFlipMotion } from './pieceFlip';

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

export function usePieceFlipAnimation(
  piece: TablePiece,
  interrupted: boolean,
  onFinish: (pieceId: string, revision: number) => void
) {
  const pivotRef = useRef<Group>(null);
  const labelRef = useRef<Group>(null);
  const shadowRef = useRef<Group>(null);
  const badgeRef = useRef<HTMLSpanElement>(null);
  const previousPiece = useRef(piece);
  const motion = useRef(createPieceFlipMotion(piece.flipRevision ?? 0));
  const { invalidate } = useThree();

  const applyPose = useCallback(
    (now: number) => {
      const frame = pieceFlipFrame(motion.current, piece, now);
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
    motion.current =
      interrupted || !canAnimatePieceChange(previousPiece.current, piece)
        ? createPieceFlipMotion(revision)
        : retargetPieceFlipMotion(motion.current, revision, now);
    previousPiece.current = piece;
    /* Compensate for the new canonical faces before the first rendered frame. */
    applyPose(now);
    invalidate();
  }, [applyPose, interrupted, invalidate, piece]);

  useLayoutEffect(
    () => () => {
      const revision = motion.current.targetRevision;
      motion.current = createPieceFlipMotion(revision);
      onFinish(piece.id, revision);
    },
    [onFinish, piece.id]
  );

  useFrame(() => {
    if (motion.current.startedAt === null) {
      return;
    }
    if (applyPose(performance.now())) {
      invalidate();
    } else {
      motion.current = createPieceFlipMotion(motion.current.targetRevision);
    }
  });

  return { pivotRef, labelRef, shadowRef, badgeRef };
}
