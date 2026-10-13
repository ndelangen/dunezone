/* @jsxImportSource @app/widgets/tabletop/three-jsx */
import { Html } from '@react-three/drei/webgpu';
import { useFrame, useThree } from '@react-three/fiber/webgpu';
import type { PublicBattle } from '@shared/play/battle';
import type { Vector3Tuple } from '@shared/play/model';
import { phaseAt, STANDARD_PHASES } from '@shared/play/phases';
import { TRACKER_DISC_CONTENT_Y, trackerArcSlots } from '@shared/play/tableTrackers';
import type { RefObject } from 'react';
import { useEffect, useMemo, useRef, useState } from 'react';
import type { Group } from 'three';

import type { TableProjection } from '../../../../db/tabletop/TableSession';
import { useMotionAllowed } from '../../../../styles/motion';
import styles from './BattleBeacon.module.css';
import type { BeaconMode, BeaconMotion, BeaconSpot } from './beaconMotion';
import { beaconMode, beaconRisen, beaconTarget, HOME_HEIGHT, initialMotion, stepBeacon } from './beaconMotion';
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

/** Moves the beacon every frame from its motion state, and hands the strike mark the pose it draws. */
function useBeaconFrame({
  home,
  mode,
  anchor,
  pending,
  carryAt,
  motion,
  group,
  handle,
}: {
  home: BeaconSpot | null;
  mode: BeaconMode;
  anchor: Vector3Tuple | undefined;
  pending: Vector3Tuple | null;
  /* Read every frame, since a carry moves the point without rendering. */
  carryAt(): Vector3Tuple | null;
  motion: boolean;
  group: RefObject<Group | null>;
  handle: RefObject<Group | null>;
}) {
  const invalidate = useThree((state) => state.invalidate);
  const pose = useRef<BeaconPose>({ flat: 0, height: HOME_HEIGHT, fade: 1, carried: false, motion });
  const moving = useRef<BeaconMotion | null>(null);
  /* The handle appears only once the beacon is up, so nobody grabs a beacon still rising or sinking out of sight. */
  const [risen, setRisen] = useState(false);
  const risenShown = useRef(false);
  useEffect(() => invalidate(), [mode, invalidate]);
  useFrame((_state, delta) => {
    if (!home || !group.current) {
      return;
    }
    const target = beaconTarget(mode, home, { anchor, pending, carry: mode === 'carry' ? carryAt() : null });
    moving.current ??= initialMotion(home, mode, target);
    const state = moving.current;
    const frame = stepBeacon(state, mode, target, delta, motion);
    if (beaconRisen(state) !== risenShown.current) {
      risenShown.current = beaconRisen(state);
      setRisen(risenShown.current);
    }
    group.current.position.set(state.x, frame.y, state.z);
    group.current.visible = frame.visible;
    group.current.scale.setScalar(frame.scale);
    Object.assign(pose.current, {
      flat: state.flat,
      height: state.height,
      fade: state.fade,
      motion,
      carried: mode === 'carry',
    });
    handle.current?.position.setY(state.height);
    if (frame.animating) {
      invalidate();
    }
  });
  return { pose, risen };
}

/** An invisible button over the disc: what players grab, and what assistive tech and tests find. */
function BeaconHandle({
  handle,
  enabled,
  pickUp,
}: {
  handle: RefObject<Group | null>;
  enabled: boolean;
  pickUp(event: PointerEvent): void;
}) {
  return (
    <group ref={handle} position={[0, HOME_HEIGHT, 0]}>
      <Html center zIndexRange={[1, 0]}>
        <button
          type="button"
          className={styles.handle}
          aria-label="Drag battle marker onto territory"
          data-local-carry
          disabled={!enabled}
          onPointerDown={(event) => event.button === 0 && pickUp(event.nativeEvent)}
        />
      </Html>
    </group>
  );
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
  const { camera, renderer, invalidate } = useThree();
  const [pending, setPending] = usePendingDrop(battle, inBattle);
  const motion = useMotionAllowed();
  const { carrying, carryAt, pickUp, putDown } = useBeaconCarry({
    canvas: renderer.domElement,
    camera,
    invalidate,
    onDrop(point) {
      setPending(point);
      onDrop(point);
    },
  });
  const group = useRef<Group>(null);
  const handle = useRef<Group>(null);
  const mode = beaconMode({ inBattle, battle: Boolean(battle), pending: Boolean(pending), carrying });
  useEffect(() => {
    if (!inBattle) {
      putDown();
    }
  }, [inBattle, putDown]);
  const { pose, risen } = useBeaconFrame({
    home,
    mode,
    anchor: battle?.anchor,
    pending,
    carryAt,
    motion,
    group,
    handle,
  });

  if (!home) {
    return null;
  }
  return (
    <group ref={group} visible={false}>
      <StrikeMark pose={pose} />
      {(mode === 'home' && risen) || mode === 'carry' ? (
        <BeaconHandle handle={handle} enabled={mode === 'home' && table.canHandleTable} pickUp={pickUp} />
      ) : null}
    </group>
  );
}
