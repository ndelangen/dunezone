import { useFrame, useThree } from '@react-three/fiber/webgpu';
import type { TablePiece } from '@shared/play/model';
import { useLayoutEffect, useRef } from 'react';
import type { Group } from 'three';

import { useMotionAllowed } from '@app/styles/motion';

/** Animate only a new committed shuffle, never a cold view or the deck's hidden order, and only when the site's Motion setting allows it. */
export function useDeckShuffleAnimation(piece: TablePiece, interrupted: boolean) {
  const group = useRef<Group>(null);
  const previous = useRef(piece.shuffleRevision ?? 0);
  const started = useRef<number | null>(null);
  const { invalidate } = useThree();
  const motionAllowed = useMotionAllowed();
  useLayoutEffect(() => {
    const revision = piece.shuffleRevision ?? 0;
    started.current = shuffleStart(
      started.current,
      revision !== previous.current,
      !interrupted && motionAllowed,
      performance.now()
    );
    previous.current = revision;
    if (started.current === null) {
      resetShuffle(group.current);
    }
    invalidate();
  }, [piece.shuffleRevision, interrupted, invalidate, motionAllowed]);
  useFrame(() => {
    if (started.current === null || !group.current) {
      return;
    }
    started.current = animateShuffle(group.current, started.current);
    invalidate();
  });
  return group;
}

/** When the shuffle wobble started: a new revision starts it now, and an interruption or the Motion setting turning off stops it for good. */
export function shuffleStart(start: number | null, newRevision: boolean, allowed: boolean, now: number): number | null {
  if (!allowed) {
    return null;
  }
  return newRevision ? now : start;
}

function animateShuffle(group: Group, started: number): number | null {
  const progress = Math.min(1, (performance.now() - started) / 650);
  const envelope = Math.sin(progress * Math.PI);
  group.position.set(Math.sin(progress * Math.PI * 8) * 0.15 * envelope, envelope * 0.12, 0);
  group.rotation.y = Math.sin(progress * Math.PI * 6) * 0.12 * envelope;
  if (progress === 1) {
    resetShuffle(group);
  }
  return progress === 1 ? null : started;
}

function resetShuffle(group: Group | null) {
  if (group) {
    group.position.set(0, 0, 0);
    group.rotation.y = 0;
  }
}
