/* @jsxImportSource ./three-jsx */
import { useFrame, useThree } from '@react-three/fiber/webgpu';
import type { TablePiece } from '@shared/play/model';
import { pieceFootprintContains, stackTopHeight } from '@shared/play/tableGeometry';
import { useEffect, useMemo, useRef } from 'react';
import {
  Color,
  CylinderGeometry,
  DoubleSide,
  DynamicDrawUsage,
  InstancedBufferAttribute,
  InstancedMesh,
  Matrix4,
  MeshStandardMaterial,
  Quaternion,
  Vector3,
} from 'three';

import { useMotionAllowed } from '@app/styles/motion';

import { ConfettiField, DISC_RADIUS, DISC_THICKNESS, FOIL_COLORS } from './confettiSimulation';
import type { ConfettiSupport } from './confettiSimulation';
import { useTabletop } from './TabletopContext';

/** One stream to fire: its identity, the table angles of the slots it fires from, and how far into it the viewer arrives. */
export type ConfettiLaunch = Readonly<{
  id: number;
  angles: readonly number[];
  elapsed: number;
}>;

type Props = Readonly<{
  /** The latest stream; a new id fires it once. */
  launch: ConfettiLaunch | null;
  /** Each increase stops every stream and clears the table. */
  clearRevision: number;
}>;

/* The longest frame the simulation takes in one step, so a backgrounded tab does not throw discs through the board. */
const MAX_STEP_SECONDS = 1 / 30;

function ignoreRaycast() {
  /* Confetti is decoration: it never takes a pointer from the table. */
}

function pieceSupports(pieces: readonly TablePiece[]): ConfettiSupport[] {
  return pieces
    .filter((piece) => !piece.battleOverlay && !piece.inventory)
    .map((piece) => ({
      top: piece.position[1] + stackTopHeight(piece),
      contains: (x: number, z: number) =>
        pieceFootprintContains([x - piece.position[0], 0, z - piece.position[2]], piece),
    }));
}

/**
 * The Foil cannons celebration drawn on the table: one instanced disc per piece of foil.
 * Settled discs stay where they landed, including on a piece that later moves.
 */
export function FoilConfetti({ launch, clearRevision }: Props) {
  const invalidate = useThree((state) => state.invalidate);
  const motion = useMotionAllowed();
  const { renderedPieces } = useTabletop();
  const supports = useMemo(() => pieceSupports(renderedPieces), [renderedPieces]);
  const supportsRef = useRef(supports);
  supportsRef.current = supports;

  const field = useMemo(() => new ConfettiField(), []);
  const mesh = useMemo(() => {
    const geometry = new CylinderGeometry(DISC_RADIUS, DISC_RADIUS, DISC_THICKNESS, 14);
    const material = new MeshStandardMaterial({
      color: '#ffffff',
      metalness: 0.35,
      roughness: 0.3,
      side: DoubleSide,
    });
    const instanced = new InstancedMesh(geometry, material, field.capacity);
    instanced.instanceMatrix.setUsage(DynamicDrawUsage);
    const colors = new Float32Array(field.capacity * 3);
    instanced.instanceColor = new InstancedBufferAttribute(colors, 3);
    instanced.count = 0;
    instanced.frustumCulled = false;
    instanced.raycast = ignoreRaycast;
    return instanced;
  }, [field]);
  const palette = useMemo(() => FOIL_COLORS.map((color) => new Color(color)), []);

  useEffect(
    () => () => {
      mesh.geometry.dispose();
      (mesh.material as MeshStandardMaterial).dispose();
      mesh.dispose();
    },
    [mesh]
  );

  const lastClear = useRef(clearRevision);
  useEffect(() => {
    if (clearRevision !== lastClear.current) {
      lastClear.current = clearRevision;
      field.clear();
      mesh.count = 0;
      invalidate();
    }
  }, [clearRevision, field, invalidate, mesh]);

  const fired = useRef<number | null>(null);
  useEffect(() => {
    if (!launch || fired.current === launch.id) {
      return;
    }
    fired.current = launch.id;
    /* A viewer who asked for less motion is spared the stream. */
    if (motion) {
      field.launch(launch.angles, launch.elapsed);
      invalidate();
    }
  }, [field, invalidate, launch, motion]);

  const scratch = useMemo(
    () => ({
      matrix: new Matrix4(),
      position: new Vector3(),
      rotation: new Quaternion(),
      scale: new Vector3(),
    }),
    []
  );

  useFrame((_, delta) => {
    if (!field.active) {
      return;
    }
    field.step(Math.min(delta, MAX_STEP_SECONDS), supportsRef.current);
    const { matrix, position, rotation, scale } = scratch;
    for (const index of field.takeChanged()) {
      position.fromArray(field.position, index * 3);
      rotation.fromArray(field.rotation, index * 4);
      scale.setScalar(field.isVisible(index) ? 1 : 0);
      matrix.compose(position, rotation, scale);
      mesh.setMatrixAt(index, matrix);
      mesh.setColorAt(index, palette[field.color[index]!]!);
    }
    mesh.count = field.count;
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) {
      mesh.instanceColor.needsUpdate = true;
    }
    invalidate();
  });

  return <primitive object={mesh} />;
}
