/* @jsxImportSource @app/widgets/tabletop/three-jsx */
import { useFrame, useThree } from '@react-three/fiber/webgpu';
import type { ThreeEvent } from '@react-three/fiber/webgpu';
import type { PublicBattle } from '@shared/play/battle';
import type { Vector3Tuple } from '@shared/play/model';
import { phaseAt, STANDARD_PHASES } from '@shared/play/phases';
import { BOARD_SURFACE_Y } from '@shared/play/tableGeometry';
import { TRACKER_DISC_CONTENT_Y, trackerArcSlots } from '@shared/play/tableTrackers';
import { createContext, useContext, useEffect, useMemo, useRef, useState } from 'react';
import type { Camera, Group, Mesh } from 'three';
import { Plane, Raycaster, Vector2, Vector3 } from 'three';

import type { TableProjection } from '../../../../db/tabletop/TableSession';
import type { BeaconPose, BeaconVariant } from './battleBeaconVariants';
import { BEACON_VARIANTS } from './battleBeaconVariants';

export type { BeaconVariant } from './battleBeaconVariants';
/** Which beacon design the table draws; the stories set it while the variants are compared. */
export const BattleBeaconVariantContext = createContext<BeaconVariant>('lance');

/* How far under the table the beacon waits before it rises, and where it sinks back to. */
const SUNK_DEPTH = 1.4;
const HOME_HEIGHT = 0.6;
const CARRY_HEIGHT = 0.45;
/* The hovering beacon stands out over the tracker; once dropped it shrinks to a marker the size of a faction token. */
const HOVER_SCALE = 1.9;
const PLACED_SCALE = 1;
const RISE_SECONDS = 1.3;
/* The game refuses a mark it cannot place; the beacon waits this long for the battle before it returns to the tracker. */
const PENDING_MS = 2500;
/* A drop counts on the board, as the marker's drop always has. */
const BOARD_DROP_RADIUS = 5.5;

type Mode = 'gone' | 'home' | 'carry' | 'pending' | 'anchor';
type Motion = {
  x: number;
  z: number;
  ground: number;
  presence: number;
  flat: number;
  height: number;
  /* Set when the beacon must sink where it is and rise again at the tracker, after a battle ends. */
  respawn: boolean;
  last: Mode;
};

const damp = (from: number, to: number, rate: number, delta: number) =>
  from + (to - from) * (1 - Math.exp(-rate * delta));
const easeOut = (value: number) => 1 - (1 - value) ** 3;

function boardPoint(event: PointerEvent, canvas: HTMLCanvasElement, camera: Camera): Vector3Tuple | null {
  const bounds = canvas.getBoundingClientRect();
  const ray = new Raycaster();
  ray.setFromCamera(
    new Vector2(
      ((event.clientX - bounds.left) / bounds.width) * 2 - 1,
      (-(event.clientY - bounds.top) / bounds.height) * 2 + 1
    ),
    camera
  );
  const point = ray.ray.intersectPlane(new Plane(new Vector3(0, 1, 0), -BOARD_SURFACE_Y), new Vector3());
  return point && [point.x, 0.18, point.z];
}

type Props = {
  table: TableProjection;
  battle: PublicBattle | null | undefined;
  /** Marks a battle where the beacon was dropped; the game decides whether it stands. */
  onDrop(position: Vector3Tuple): void;
};

/**
 * The battle beacon: during the Battle phase it rises through the table over the tracker's Battle disc and hovers there, pulsing.
 * A player picks it up like a piece and drops it on a territory, where it shrinks and lies flat while the battle runs.
 * A finished battle sinks it into the board and a new one rises at the tracker;
 * when the phase ends it sinks back into the table.
 */
export function BattleBeacon({ table, battle, onDrop }: Props) {
  const variant = useContext(BattleBeaconVariantContext);
  const Variant = BEACON_VARIANTS[variant];
  const phases = table.snapshot.phases ?? STANDARD_PHASES;
  const inBattle = phaseAt(table.snapshot.phase, phases).id === 'battle';
  const battleIndex = phases.findIndex((entry) => entry.id === 'battle');
  const slot = trackerArcSlots(phases.length).find((entry) => entry.phaseIndex === battleIndex);
  const homeX = slot?.position[0];
  const homeZ = slot?.position[2];
  const home = useMemo(
    () =>
      homeX === undefined || homeZ === undefined ? null : { x: homeX, z: homeZ, ground: TRACKER_DISC_CONTENT_Y + 0.004 },
    [homeX, homeZ]
  );
  const { camera, gl, invalidate } = useThree();
  const [carrying, setCarrying] = useState(false);
  const [pending, setPending] = useState<Vector3Tuple | null>(null);
  const carryPoint = useRef<Vector3Tuple | null>(null);
  const group = useRef<Group>(null);
  const hit = useRef<Mesh>(null);
  const pose = useRef<BeaconPose>({ flat: 0, height: HOME_HEIGHT, carried: false });
  const motion = useRef<Motion | null>(null);
  if (!motion.current && home) {
    motion.current = { ...home, presence: 0, flat: 0, height: HOME_HEIGHT, respawn: false, last: 'gone' };
  }

  useEffect(() => {
    if (battle) {
      setPending(null);
    }
  }, [battle]);
  useEffect(() => {
    if (!pending) {
      return;
    }
    const timer = setTimeout(() => setPending(null), PENDING_MS);
    return () => clearTimeout(timer);
  }, [pending]);
  useEffect(() => {
    if (!inBattle) {
      setCarrying(false);
      setPending(null);
    }
    invalidate();
  }, [inBattle, invalidate]);

  const mode: Mode = !inBattle
    ? battle
      ? 'anchor'
      : 'gone'
    : battle
      ? 'anchor'
      : pending
        ? 'pending'
        : carrying
          ? 'carry'
          : 'home';
  const canPickUp = mode === 'home' && table.canHandleTable;

  useFrame((_state, rawDelta) => {
    const state = motion.current;
    if (!state || !home || !group.current) {
      return;
    }
    const delta = Math.min(rawDelta, 0.1);
    if (state.last === 'anchor' && mode !== 'anchor') {
      state.respawn = true;
    }
    state.last = mode;
    const target =
      mode === 'anchor' && battle
        ? { x: battle.anchor[0], z: battle.anchor[2], ground: BOARD_SURFACE_Y + 0.004 }
        : mode === 'pending' && pending
          ? { x: pending[0], z: pending[2], ground: BOARD_SURFACE_Y + 0.004 }
          : mode === 'carry' && carryPoint.current
            ? { x: carryPoint.current[0], z: carryPoint.current[2], ground: BOARD_SURFACE_Y + 0.004 }
            : home;
    let present = mode !== 'gone';
    if (state.respawn) {
      present = false;
      if (state.presence <= 0.001) {
        Object.assign(state, target, { flat: 0, height: HOME_HEIGHT, respawn: false });
      }
    } else {
      const rate = mode === 'carry' ? 22 : 7;
      state.x = damp(state.x, target.x, rate, delta);
      state.z = damp(state.z, target.z, rate, delta);
      state.ground = damp(state.ground, target.ground, rate, delta);
    }
    state.presence = Math.min(1, Math.max(0, state.presence + (present ? 1 : -1) * (delta / RISE_SECONDS)));
    if (!state.respawn) {
      state.flat = damp(state.flat, mode === 'anchor' || mode === 'pending' ? 1 : 0, 6, delta);
      state.height = damp(state.height, mode === 'carry' ? CARRY_HEIGHT : HOME_HEIGHT, 8, delta);
    }
    const sink = (1 - easeOut(state.presence)) * SUNK_DEPTH;
    group.current.position.set(state.x, state.ground - sink, state.z);
    group.current.visible = state.presence > 0.001;
    group.current.scale.setScalar(HOVER_SCALE + (PLACED_SCALE - HOVER_SCALE) * state.flat);
    pose.current.flat = state.flat;
    pose.current.height = state.height;
    pose.current.carried = mode === 'carry';
    if (hit.current) {
      hit.current.position.y = state.height;
    }
    if (group.current.visible || present) {
      /* The table draws on demand; a visible or rising beacon is always moving, so it asks for the next frame. */
      invalidate();
    }
  });

  const pickUp = (event: ThreeEvent<PointerEvent>) => {
    if (!canPickUp || event.button !== 0) {
      return;
    }
    event.stopPropagation();
    const canvas = gl.domElement;
    const pointerId = event.pointerId;
    try {
      canvas.setPointerCapture(pointerId);
    } catch {
      /* A pointer the browser no longer tracks still carries until it lifts. */
    }
    carryPoint.current = boardPoint(event.nativeEvent, canvas, camera);
    setCarrying(true);
    canvas.style.cursor = 'grabbing';
    const move = (moved: PointerEvent) => {
      if (moved.pointerId !== pointerId) {
        return;
      }
      carryPoint.current = boardPoint(moved, canvas, camera) ?? carryPoint.current;
      invalidate();
    };
    const finish = (lifted: PointerEvent | null) => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      window.removeEventListener('pointercancel', cancel);
      window.removeEventListener('keydown', escape);
      canvas.style.cursor = '';
      const point = lifted ? boardPoint(lifted, canvas, camera) : null;
      if (point && Math.hypot(point[0], point[2]) <= BOARD_DROP_RADIUS) {
        setPending(point);
        onDrop(point);
      }
      setCarrying(false);
    };
    const up = (lifted: PointerEvent) => lifted.pointerId === pointerId && finish(lifted);
    const cancel = (lifted: PointerEvent) => lifted.pointerId === pointerId && finish(null);
    const escape = (pressed: KeyboardEvent) => pressed.key === 'Escape' && finish(null);
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
    window.addEventListener('pointercancel', cancel);
    window.addEventListener('keydown', escape);
  };

  if (!home) {
    return null;
  }
  return (
    <group ref={group} visible={false}>
      <Variant key={variant} pose={pose} />
      {canPickUp ? (
        <mesh
          ref={hit}
          position={[0, HOME_HEIGHT, 0]}
          onPointerDown={pickUp}
          onPointerOver={() => {
            gl.domElement.style.cursor = 'grab';
          }}
          onPointerOut={() => {
            gl.domElement.style.cursor = '';
          }}
        >
          <cylinderGeometry args={[0.32, 0.32, 0.7, 12]} />
          <meshBasicMaterial transparent opacity={0} depthWrite={false} colorWrite={false} />
        </mesh>
      ) : null}
    </group>
  );
}
