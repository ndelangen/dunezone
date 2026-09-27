/* @jsxImportSource ./three-jsx */
import { useFrame, useThree } from '@react-three/fiber/webgpu';
import type { TablePiece } from '@shared/play/model';
import {
  CARD_FOOTPRINT_HALF_X,
  CARD_FOOTPRINT_HALF_Z,
  MARKER_FOOTPRINT_RADIUS,
  pieceFootprintContains,
  stackTopHeight,
} from '@shared/play/tableGeometry';
import { useEffect, useLayoutEffect, useMemo, useRef } from 'react';
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

import { ConfettiField, DISC_RADIUS, DISC_THICKNESS, FOIL_COLORS } from './confettiSimulation';
import type { ConfettiSupport } from './confettiSimulation';
import { useTabletop } from './TabletopContext';

/** One stream to fire: its identity, the table angles of the slots it fires from, and how far into it the viewer arrives. */
export type ConfettiLaunch = Readonly<{ id: number; angles: readonly number[]; elapsed: number }>;

type Props = Readonly<{
  /** The stream running now, if any; each id fires once while this stays mounted. */
  launch: ConfettiLaunch | null;
}>;

/* A card's footprint reaches to its half-diagonal; nothing else reaches past a marker's radius. */
const CARD_REACH = Math.hypot(CARD_FOOTPRINT_HALF_X, CARD_FOOTPRINT_HALF_Z);

function ignoreRaycast() {
  /* Confetti is decoration: it never takes a pointer from the table. */
}

function pieceSupports(pieces: readonly TablePiece[]): ConfettiSupport[] {
  return pieces
    .filter((piece) => !piece.battleOverlay && !piece.inventory)
    .map((piece) => ({
      x: piece.position[0],
      z: piece.position[2],
      reach: piece.kind === 'card' ? CARD_REACH : MARKER_FOOTPRINT_RADIUS,
      top: piece.position[1] + stackTopHeight(piece),
      contains: (x: number, z: number) =>
        pieceFootprintContains([x - piece.position[0], 0, z - piece.position[2]], piece),
    }));
}

function createDiscMesh(capacity: number): InstancedMesh {
  const geometry = new CylinderGeometry(DISC_RADIUS, DISC_RADIUS, DISC_THICKNESS, 14);
  const material = new MeshStandardMaterial({ color: '#ffffff', metalness: 0.35, roughness: 0.3, side: DoubleSide });
  const mesh = new InstancedMesh(geometry, material, capacity);
  mesh.instanceMatrix.setUsage(DynamicDrawUsage);
  mesh.instanceColor = new InstancedBufferAttribute(new Float32Array(capacity * 3), 3);
  mesh.count = 0;
  mesh.frustumCulled = false;
  mesh.raycast = ignoreRaycast;
  return mesh;
}

type Scratch = { matrix: Matrix4; position: Vector3; rotation: Quaternion; scale: Vector3 };

/* Redraws the discs that moved; only the discs in use go to the GPU, and their colours only when new ones appeared. */
function drawDiscs({
  field,
  mesh,
  palette,
  scratch,
}: Readonly<{ field: ConfettiField; mesh: InstancedMesh; palette: readonly Color[]; scratch: Scratch }>) {
  const recolor = field.takeSpawned();
  const { matrix, position, rotation, scale } = scratch;
  for (const index of field.takeChanged()) {
    position.fromArray(field.position, index * 3);
    rotation.fromArray(field.rotation, index * 4);
    scale.setScalar(field.isVisible(index) ? 1 : 0);
    matrix.compose(position, rotation, scale);
    mesh.setMatrixAt(index, matrix);
    if (recolor) {
      mesh.setColorAt(index, palette[field.color[index]!]!);
    }
  }
  mesh.count = field.count;
  mesh.instanceMatrix.clearUpdateRanges();
  mesh.instanceMatrix.addUpdateRange(0, field.count * 16);
  mesh.instanceMatrix.needsUpdate = true;
  if (recolor && mesh.instanceColor) {
    mesh.instanceColor.clearUpdateRanges();
    mesh.instanceColor.addUpdateRange(0, field.count * 3);
    mesh.instanceColor.needsUpdate = true;
  }
}

/**
 * The Foil cannons celebration drawn on the table: one instanced disc per piece of foil.
 * Settled discs stay where they landed, including on a piece that later moves.
 * The caller mounts it only while there is a celebration, so a table that never finishes allocates nothing, and unmounting it stops the stream and clears the table.
 */
export function FoilConfetti({ launch }: Props) {
  const invalidate = useThree((state) => state.invalidate);
  const { renderedPieces } = useTabletop();
  const pieces = useRef(renderedPieces);
  useLayoutEffect(() => {
    pieces.current = renderedPieces;
  }, [renderedPieces]);
  /* Supports are rebuilt only on frames that simulate, and only when the pieces changed. */
  const supports = useRef<{ from: readonly TablePiece[] | null; list: ConfettiSupport[] }>({ from: null, list: [] });

  const field = useMemo(() => new ConfettiField(), []);
  const mesh = useMemo(() => createDiscMesh(field.capacity), [field]);
  const palette = useMemo(() => FOIL_COLORS.map((color) => new Color(color)), []);

  useEffect(
    () => () => {
      mesh.geometry.dispose();
      (mesh.material as MeshStandardMaterial).dispose();
      mesh.dispose();
    },
    [mesh]
  );

  const fired = useRef<number | null>(null);
  useEffect(() => {
    if (!launch || fired.current === launch.id) {
      return;
    }
    fired.current = launch.id;
    field.launch(launch);
    invalidate();
  }, [field, invalidate, launch]);

  const scratch = useMemo(
    () => ({ matrix: new Matrix4(), position: new Vector3(), rotation: new Quaternion(), scale: new Vector3() }),
    []
  );

  useFrame((_, delta) => {
    if (!field.active) {
      return;
    }
    if (supports.current.from !== pieces.current) {
      supports.current = { from: pieces.current, list: pieceSupports(pieces.current) };
    }
    field.step({ seconds: delta, supports: supports.current.list });
    drawDiscs({ field, mesh, palette, scratch });
    invalidate();
  });

  return <primitive object={mesh} />;
}
