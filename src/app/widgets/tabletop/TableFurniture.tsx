/* @jsxImportSource ./three-jsx */

import type { Vector3Tuple } from '@shared/play/model';
import {
  cardBaySlotPositions,
  SHARED_ITEM_PLACEMENT_ANCHORS,
  TABLE_TANKS_LABEL,
  TABLE_TANKS_LABEL_POSITION,
} from '@shared/play/tableFurnitureLayout';
import type { CardBaySide } from '@shared/play/tableFurnitureLayout';
import { CARD_DEPTH, CARD_WIDTH } from '@shared/play/tableGeometry';
import type { TrackerArcSlot } from '@shared/play/tableTrackers';
import { useMemo } from 'react';
import type { ExtrudeGeometry, Shape } from 'three';

import { ignoreRaycast } from './ignoreRaycast';
import { TableLabel } from './TableLabel';
import { useTablePalette } from './tablePalette';
import { createExtraTablePlateLayers, createRoundedRectangleShape, createTablePlateLayers } from './tablePlateGeometry';

const TABLE_PLATE_EXTRUDE_OPTIONS = {
  bevelEnabled: false,
  curveSegments: 48,
  steps: 1,
} as const;
/* The engraved line is narrower than the slot's capture area, which still owns card placement. */
const SLOT_EDGE_WIDTH = 0.025;
const SLOT_RIM_SHAPE = createRoundedRectangleShape(
  CARD_WIDTH + SLOT_EDGE_WIDTH * 2,
  CARD_DEPTH + SLOT_EDGE_WIDTH * 2,
  0.08 + SLOT_EDGE_WIDTH
);
const SLOT_WELL_SHAPE = createRoundedRectangleShape(CARD_WIDTH, CARD_DEPTH, 0.08);

function TablePlate({ trackerSlots }: { trackerSlots: readonly TrackerArcSlot[] }) {
  const palette = useTablePalette();
  const layers = useMemo(() => createTablePlateLayers(trackerSlots), [trackerSlots]);
  const geometryArgs = useMemo(
    () => ({
      upper: [
        layers.upper.shape,
        { ...TABLE_PLATE_EXTRUDE_OPTIONS, depth: layers.upper.thickness },
      ] as ConstructorParameters<typeof ExtrudeGeometry>,
      lower: [
        layers.lower.shape,
        { ...TABLE_PLATE_EXTRUDE_OPTIONS, depth: layers.lower.thickness },
      ] as ConstructorParameters<typeof ExtrudeGeometry>,
    }),
    [layers]
  );

  return (
    <group>
      {/* Geometry and mesh share a lifetime, including after a live code update. */}
      <mesh
        key={layers.lower.shape.uuid}
        position={[0, layers.lower.surfaceY, 0]}
        raycast={ignoreRaycast}
        receiveShadow
        rotation={[Math.PI / 2, 0, 0]}
        scale={[layers.lower.outlineScale, layers.lower.outlineScale, 1]}
      >
        <extrudeGeometry args={geometryArgs.lower} />
        <meshStandardMaterial color={palette.base} metalness={0.06} roughness={0.74} />
      </mesh>
      <mesh
        key={layers.upper.shape.uuid}
        position={[0, layers.upper.surfaceY, 0]}
        raycast={ignoreRaycast}
        receiveShadow
        rotation={[Math.PI / 2, 0, 0]}
      >
        <extrudeGeometry args={geometryArgs.upper} />
        <meshStandardMaterial color={palette.top} metalness={0.02} roughness={0.9} />
      </mesh>
    </group>
  );
}

function ExtraPlateMesh({
  shape,
  surfaceY,
  thickness,
  color,
  metalness,
  roughness,
}: {
  shape: Shape;
  surfaceY: number;
  thickness: number;
  color: string;
  metalness: number;
  roughness: number;
}) {
  const args = useMemo(
    () =>
      [shape, { ...TABLE_PLATE_EXTRUDE_OPTIONS, depth: thickness }] as ConstructorParameters<typeof ExtrudeGeometry>,
    [shape, thickness]
  );
  return (
    <mesh
      key={shape.uuid}
      position={[0, surfaceY, 0]}
      raycast={ignoreRaycast}
      receiveShadow
      rotation={[Math.PI / 2, 0, 0]}
    >
      <extrudeGeometry args={args} />
      <meshStandardMaterial color={color} metalness={metalness} roughness={roughness} />
    </mesh>
  );
}

/* The table the extra boards add, in the main plate's colours and at its heights. */
function ExtraTablePlates({ extraBoards }: { extraBoards: number }) {
  const palette = useTablePalette();
  const layers = useMemo(() => createExtraTablePlateLayers(extraBoards), [extraBoards]);
  return (
    <group>
      <ExtraPlateMesh
        shape={layers.lower}
        surfaceY={layers.lowerSurfaceY}
        thickness={layers.lowerThickness}
        color={palette.base}
        metalness={0.06}
        roughness={0.74}
      />
      <ExtraPlateMesh
        shape={layers.upper}
        surfaceY={layers.upperSurfaceY}
        thickness={layers.upperThickness}
        color={palette.top}
        metalness={0.02}
        roughness={0.9}
      />
    </group>
  );
}

function CardWell({ position }: { position: Vector3Tuple }) {
  const palette = useTablePalette();
  return (
    <group key={`${SLOT_RIM_SHAPE.uuid}:${SLOT_WELL_SHAPE.uuid}`} position={position}>
      <mesh position={[0, 0.009, 0]} raycast={ignoreRaycast} receiveShadow rotation={[-Math.PI / 2, 0, 0]}>
        <shapeGeometry args={[SLOT_RIM_SHAPE, 24]} />
        <meshStandardMaterial color={palette.slotRim} metalness={0.06} roughness={0.82} />
      </mesh>
      <mesh position={[0, 0.02, 0]} raycast={ignoreRaycast} receiveShadow rotation={[-Math.PI / 2, 0, 0]}>
        <shapeGeometry args={[SLOT_WELL_SHAPE, 24]} />
        <meshStandardMaterial color={palette.well} metalness={0} roughness={0.96} />
      </mesh>
    </group>
  );
}

function SideCardBay({ side }: { side: CardBaySide }) {
  return (
    <group>
      {cardBaySlotPositions(side).map((position, index) => (
        <CardWell key={`${side}-${index}`} position={position} />
      ))}
    </group>
  );
}

export function TableFurniture({
  trackerSlots,
  extraBoards = 0,
}: {
  trackerSlots: readonly TrackerArcSlot[];
  extraBoards?: number;
}) {
  return (
    <group>
      <TablePlate trackerSlots={trackerSlots} />
      {extraBoards > 0 ? <ExtraTablePlates extraBoards={extraBoards} /> : null}
      <SideCardBay side="left" />
      <SideCardBay side="right" />
      {SHARED_ITEM_PLACEMENT_ANCHORS.map((anchor) => (
        <CardWell key={anchor.id} position={anchor.position} />
      ))}
      <TableLabel position={TABLE_TANKS_LABEL_POSITION}>{TABLE_TANKS_LABEL}</TableLabel>
    </group>
  );
}
