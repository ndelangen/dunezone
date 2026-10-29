/* @jsxImportSource ./three-jsx */

import type { TableLayout } from '@shared/play/boardLayout';
import type { Vector3Tuple } from '@shared/play/model';
import {
  cardBaySlotPositions,
  sharedItemAnchors,
  TABLE_TANKS_LABEL,
  tanksLabelPosition,
} from '@shared/play/tableFurnitureLayout';
import type { CardBaySide } from '@shared/play/tableFurnitureLayout';
import { CARD_DEPTH, CARD_WIDTH } from '@shared/play/tableGeometry';
import type { TrackerArcSlot } from '@shared/play/tableTrackers';
import { useMemo } from 'react';
import type { ExtrudeGeometry } from 'three';

import { ignoreRaycast } from './ignoreRaycast';
import { TableLabel } from './TableLabel';
import { useTablePalette } from './tablePalette';
import {
  createRoundedRectangleShape,
  createTablePlateLayers,
  createTwoBoardTablePlateLayers,
} from './tablePlateGeometry';

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

function TablePlate({ trackerSlots, layout }: { trackerSlots: readonly TrackerArcSlot[]; layout: TableLayout }) {
  const palette = useTablePalette();
  const layers = useMemo(
    () => (layout === 'two-boards' ? createTwoBoardTablePlateLayers() : createTablePlateLayers(trackerSlots)),
    [layout, trackerSlots]
  );
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

function SideCardBay({ side, layout }: { side: CardBaySide; layout: TableLayout }) {
  return (
    <group>
      {cardBaySlotPositions(side, layout).map((position, index) => (
        <CardWell key={`${side}-${index}`} position={position} />
      ))}
    </group>
  );
}

export function TableFurniture({
  trackerSlots,
  layout = 'one-board',
}: {
  trackerSlots: readonly TrackerArcSlot[];
  layout?: TableLayout;
}) {
  return (
    <group>
      <TablePlate trackerSlots={trackerSlots} layout={layout} />
      <SideCardBay side="left" layout={layout} />
      <SideCardBay side="right" layout={layout} />
      {sharedItemAnchors(layout).map((anchor) => (
        <CardWell key={anchor.id} position={anchor.position} />
      ))}
      <TableLabel position={tanksLabelPosition(layout)}>{TABLE_TANKS_LABEL}</TableLabel>
    </group>
  );
}
