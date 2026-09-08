/* @jsxImportSource ./three-jsx */
import { useMemo } from 'react';
import type { ExtrudeGeometry } from 'three';

import type { Vector3Tuple } from './model';
import {
  cardBaySlotPositions,
  CARD_SLOT_OUTER_SIZE,
  TABLE_TANKS_LABEL,
  TABLE_TANKS_LABEL_POSITION,
} from './tableFurnitureLayout';
import type { CardBaySide } from './tableFurnitureLayout';
import { CARD_DEPTH, CARD_WIDTH } from './tableGeometry';
import { TableLabel } from './TableLabel';
import { createRoundedRectangleShape, createTablePlateLayers } from './tablePlateGeometry';
import type { TrackerArcSlot } from './tableTrackers';

const SHELF_TOP_COLOR = '#3a2a22';
const TABLE_BASE_COLOR = '#201713';
const SLOT_RIM_COLOR = '#806a4c';
const SLOT_WELL_COLOR = '#241a16';
const TABLE_PLATE_EXTRUDE_OPTIONS = {
  bevelEnabled: false,
  curveSegments: 48,
  steps: 1,
} as const;
const SLOT_RIM_SHAPE = createRoundedRectangleShape(CARD_SLOT_OUTER_SIZE.width, CARD_SLOT_OUTER_SIZE.depth, 0.1);
const SLOT_WELL_SHAPE = createRoundedRectangleShape(CARD_WIDTH, CARD_DEPTH, 0.08);

function ignoreRaycast() {
  // Fixed furniture stays outside tabletop pointer picking.
}

function TablePlate({ trackerSlots }: { trackerSlots: readonly TrackerArcSlot[] }) {
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
        <meshStandardMaterial color={TABLE_BASE_COLOR} metalness={0.06} roughness={0.74} />
      </mesh>
      <mesh
        key={layers.upper.shape.uuid}
        position={[0, layers.upper.surfaceY, 0]}
        raycast={ignoreRaycast}
        receiveShadow
        rotation={[Math.PI / 2, 0, 0]}
      >
        <extrudeGeometry args={geometryArgs.upper} />
        <meshStandardMaterial color={SHELF_TOP_COLOR} metalness={0.02} roughness={0.9} />
      </mesh>
    </group>
  );
}

function CardWell({ position }: { position: Vector3Tuple }) {
  return (
    <group key={`${SLOT_RIM_SHAPE.uuid}:${SLOT_WELL_SHAPE.uuid}`} position={position}>
      <mesh position={[0, 0.009, 0]} raycast={ignoreRaycast} receiveShadow rotation={[-Math.PI / 2, 0, 0]}>
        <shapeGeometry args={[SLOT_RIM_SHAPE, 24]} />
        <meshStandardMaterial color={SLOT_RIM_COLOR} metalness={0.06} roughness={0.82} />
      </mesh>
      <mesh position={[0, 0.02, 0]} raycast={ignoreRaycast} receiveShadow rotation={[-Math.PI / 2, 0, 0]}>
        <shapeGeometry args={[SLOT_WELL_SHAPE, 24]} />
        <meshStandardMaterial color={SLOT_WELL_COLOR} metalness={0} roughness={0.96} />
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

export function TableFurniture({ trackerSlots }: { trackerSlots: readonly TrackerArcSlot[] }) {
  return (
    <group>
      <TablePlate trackerSlots={trackerSlots} />
      <SideCardBay side="left" />
      <SideCardBay side="right" />
      <TableLabel position={TABLE_TANKS_LABEL_POSITION}>{TABLE_TANKS_LABEL}</TableLabel>
    </group>
  );
}
