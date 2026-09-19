import { useFrame, useThree } from '@react-three/fiber/webgpu';
import { useLayoutEffect, useRef } from 'react';
import type { Group } from 'three';

import type { TablePiece } from './model';

/** Animate only a new committed shuffle, never a cold view or the deck's hidden order. */
export function useDeckShuffleAnimation(piece: TablePiece, interrupted: boolean) {
  const group = useRef<Group>(null);
  const previous = useRef(piece.shuffleRevision ?? 0);
  const started = useRef<number | null>(null);
  const { invalidate } = useThree();
  useLayoutEffect(() => {
    const revision = piece.shuffleRevision ?? 0;
    if (revision !== previous.current) {
      started.current =
        !interrupted && !window.matchMedia('(prefers-reduced-motion: reduce)').matches ? performance.now() : null;
      previous.current = revision;
    }
    if (interrupted) {
      started.current = null;
    }
    if (started.current === null && group.current) {
      group.current.position.set(0, 0, 0);
      group.current.rotation.y = 0;
    }
    invalidate();
  }, [piece.shuffleRevision, interrupted, invalidate]);
  useFrame(() => {
    if (started.current === null || !group.current) {
      return;
    }
    started.current = animateShuffle(group.current, started.current);
    invalidate();
  });
  return group;
}

function animateShuffle(group: Group, started: number): number | null {
  const progress = Math.min(1, (performance.now() - started) / 650);
  const envelope = Math.sin(progress * Math.PI);
  group.position.set(Math.sin(progress * Math.PI * 8) * 0.15 * envelope, envelope * 0.12, 0);
  group.rotation.y = Math.sin(progress * Math.PI * 6) * 0.12 * envelope;
  if (progress === 1) {
    group.position.set(0, 0, 0);
    group.rotation.y = 0;
  }
  return progress === 1 ? null : started;
}
