/* @jsxImportSource ./three-jsx */
import { useFrame, useThree } from '@react-three/fiber/webgpu';
import { useLayoutEffect, useRef } from 'react';
import type { ReactNode } from 'react';
import type { Group } from 'three';

import { useMotionAllowed } from '@app/styles/motion';

import type { PieceSceneState } from './TabletopScene';

export function PieceArrival({
  delay,
  interaction,
  children,
}: {
  readonly delay?: number;
  readonly interaction: Pick<PieceSceneState, 'selected' | 'reserved' | 'drafted' | 'locallyCarried' | 'remoteCarried'>;
  readonly children: ReactNode;
}) {
  const carried = interaction.locallyCarried || interaction.remoteCarried;
  const handled = interaction.selected || interaction.reserved || interaction.drafted;
  const interrupted = carried || handled;
  return delay === undefined ? (
    children
  ) : (
    <AnimatedPieceArrival delay={delay} interrupted={interrupted}>
      {children}
    </AnimatedPieceArrival>
  );
}

function AnimatedPieceArrival({
  delay,
  interrupted,
  children,
}: {
  readonly delay: number;
  readonly interrupted: boolean;
  readonly children: ReactNode;
}) {
  const group = useRef<Group>(null);
  const started = useRef<number | null>(null);
  const finished = useRef(false);
  const motion = useMotionAllowed();
  const invalidate = useThree((state) => state.invalidate);
  useLayoutEffect(() => {
    const target = group.current;
    if (!target) {
      return;
    }
    if (!motion || interrupted) {
      finished.current = true;
      target.visible = true;
      target.position.y = 0;
      target.scale.setScalar(1);
    } else if (!finished.current && started.current === null) {
      started.current = performance.now() + delay;
      target.visible = false;
      target.position.y = 0.18;
      target.scale.setScalar(0.97);
    }
    invalidate();
  }, [delay, interrupted, invalidate, motion]);
  useFrame(() => {
    const target = group.current;
    if (!target || finished.current) {
      return;
    }
    if (started.current === null) {
      return;
    }
    const progress = Math.min(1, Math.max(0, (performance.now() - started.current) / 780));
    const eased = 1 - (1 - progress) ** 3;
    target.visible = progress > 0;
    target.position.y = 0.18 * (1 - eased);
    target.scale.setScalar(0.97 + 0.03 * eased);
    finished.current = progress === 1;
    invalidate();
  });
  return (
    <group ref={group} userData={{ dunePreviewPiece: true }}>
      {children}
    </group>
  );
}
