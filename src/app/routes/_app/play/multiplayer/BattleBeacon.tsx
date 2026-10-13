/* @jsxImportSource @app/widgets/tabletop/three-jsx */
import { Html } from '@react-three/drei/webgpu';
import { useFrame, useThree } from '@react-three/fiber/webgpu';
import type { PublicBattle } from '@shared/play/battle';
import type { Vector3Tuple } from '@shared/play/model';
import { phaseAt, STANDARD_PHASES } from '@shared/play/phases';
import { TRACKER_DISC_CONTENT_Y, trackerArcSlots } from '@shared/play/tableTrackers';
import { useEffect, useMemo, useRef, useState } from 'react';
import type { Group } from 'three';

import type { TableProjection } from '../../../../db/tabletop/TableSession';
import styles from './BattleBeacon.module.css';
import type { BeaconMotion } from './beaconMotion';
import { beaconMode, beaconTarget, HOME_HEIGHT, restingMotion, stepBeacon } from './beaconMotion';
import type { BeaconPose } from './StrikeMark';
import { StrikeMark } from './StrikeMark';
import { useBeaconCarry } from './useBeaconCarry';

/* The game refuses a mark it cannot place; the beacon waits this long for the battle before it returns to the tracker. */
const PENDING_MS = 2500;

function useBeaconHome(table: TableProjection) {
  const phases = table.snapshot.phases ?? STANDARD_PHASES;
  const inBattle = phaseAt(table.snapshot.phase, phases).id === 'battle';
  const battleIndex = phases.findIndex((entry) => entry.id === 'battle');
  const slot = trackerArcSlots(phases.length).find((entry) => entry.phaseIndex === battleIndex);
  const homeX = slot?.position[0];
  const homeZ = slot?.position[2];
  const home = useMemo(
    () =>
      homeX === undefined || homeZ === undefined
        ? null
        : { x: homeX, z: homeZ, ground: TRACKER_DISC_CONTENT_Y + 0.004 },
    [homeX, homeZ]
  );
  return { inBattle, home };
}

/** The point the beacon was dropped on, held until the battle arrives or the game is plainly not placing one. */
function usePendingDrop(battle: PublicBattle | null | undefined, inBattle: boolean) {
  const [pending, setPending] = useState<Vector3Tuple | null>(null);
  useEffect(() => {
    if (battle || !inBattle) {
      setPending(null);
    }
  }, [battle, inBattle]);
  useEffect(() => {
    if (!pending) {
      return;
    }
    const timer = setTimeout(() => setPending(null), PENDING_MS);
    return () => clearTimeout(timer);
  }, [pending]);
  return [pending, setPending] as const;
}

type Props = {
  table: TableProjection;
  battle: PublicBattle | null | undefined;
  /** Marks a battle where the beacon was dropped; the game decides whether it stands. */
  onDrop(position: Vector3Tuple): void;
};

/**
 * The battle beacon: during the Battle phase it rises through the table over the tracker's Battle disc and hovers there.
 * A player picks it up like a piece and drops it on a territory, where it lies flat and fades out as the battle shows.
 * A finished battle brings a new one up at the tracker;
 * when the phase ends it sinks back into the table.
 */
export function BattleBeacon({ table, battle, onDrop }: Props) {
  const { inBattle, home } = useBeaconHome(table);
  const { camera, gl, invalidate } = useThree();
  const [pending, setPending] = usePendingDrop(battle, inBattle);
  const { carrying, carryPoint, pickUp, putDown } = useBeaconCarry({
    canvas: gl.domElement,
    camera,
    invalidate,
    onDrop(point) {
      setPending(point);
      onDrop(point);
    },
  });
  const group = useRef<Group>(null);
  const handle = useRef<Group>(null);
  const pose = useRef<BeaconPose>({ flat: 0, height: HOME_HEIGHT, fade: 1, carried: false });
  const motion = useRef<BeaconMotion | null>(null);
  if (!motion.current && home) {
    motion.current = restingMotion(home);
  }

  const mode = beaconMode({ inBattle, battle: Boolean(battle), pending: Boolean(pending), carrying });
  const canPickUp = mode === 'home' && table.canHandleTable;
  useEffect(() => {
    if (!inBattle) {
      putDown();
    }
  }, [inBattle, putDown]);
  useEffect(() => invalidate(), [mode, invalidate]);

  useFrame((_state, delta) => {
    const state = motion.current;
    if (!state || !home || !group.current) {
      return;
    }
    const target = beaconTarget(mode, home, { anchor: battle?.anchor, pending, carry: carryPoint.current });
    const frame = stepBeacon(state, mode, target, delta);
    group.current.position.set(state.x, frame.y, state.z);
    group.current.visible = frame.visible;
    group.current.scale.setScalar(frame.scale);
    Object.assign(pose.current, {
      flat: state.flat,
      height: state.height,
      fade: state.fade,
      carried: mode === 'carry',
    });
    handle.current?.position.setY(state.height);
    if (frame.animating) {
      invalidate();
    }
  });

  if (!home) {
    return null;
  }
  return (
    <group ref={group} visible={false}>
      <StrikeMark pose={pose} />
      {inBattle && !battle && !pending ? (
        <group ref={handle} position={[0, HOME_HEIGHT, 0]}>
          <Html center zIndexRange={[1, 0]}>
            <button
              type="button"
              className={styles.handle}
              aria-label="Drag battle marker onto territory"
              data-local-carry
              disabled={!canPickUp}
              onPointerDown={(event) => event.button === 0 && pickUp(event.nativeEvent)}
            />
          </Html>
        </group>
      ) : null}
    </group>
  );
}
