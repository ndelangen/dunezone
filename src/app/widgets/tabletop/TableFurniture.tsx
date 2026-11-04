/* @jsxImportSource ./three-jsx */

import type { Vector3Tuple } from '@shared/play/model';
import {
  cardBaySlotPositions,
  SHARED_ITEM_PLACEMENT_ANCHORS,
  TABLE_TANKS_LABEL,
  TABLE_TANKS_LABEL_POSITION,
  tanksLayout,
} from '@shared/play/tableFurnitureLayout';
import type { CardBaySide, TanksLayout } from '@shared/play/tableFurnitureLayout';
import { CARD_DEPTH, CARD_WIDTH, TABLE_VISIBLE_RADIUS } from '@shared/play/tableGeometry';
import type { TrackerArcSlot } from '@shared/play/tableTrackers';
import { useMemo } from 'react';
import { Path, Shape } from 'three';
import type { ExtrudeGeometry } from 'three';

import { ignoreRaycast } from './ignoreRaycast';
import { TableLabel } from './TableLabel';
import { useTablePalette } from './tablePalette';
import { createRoundedRectangleShape, createTablePlateLayers } from './tablePlateGeometry';

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

/* The Tanks' engraved lines are as wide as a card well's rim, in the same colour. */
const TANKS_LINE_WIDTH = 0.045;
const TANKS_TRAY_RIM = 0.06;

function circleZ(x: number, radius = TABLE_VISIBLE_RADIUS) {
  return Math.sqrt(Math.max(0, radius * radius - x * x));
}

/* A flat shape lies in x and y and is turned flat onto the table, so a shape's y is the table's -z. */
function crescentShape(gap: number, halfWidth: number, maxZ: number, grow: number): Shape {
  const radius = TABLE_VISIBLE_RADIUS + gap - grow;
  const width = halfWidth + grow;
  const bottom = maxZ + grow;
  const corner = 0.3;
  const shape = new Shape();
  const samples = 48;
  shape.moveTo(-width, -circleZ(-width, radius));
  for (let index = 1; index <= samples; index += 1) {
    const x = -width + (2 * width * index) / samples;
    shape.lineTo(x, -circleZ(x, radius));
  }
  shape.lineTo(width, -bottom + corner);
  shape.absarc(width - corner, -bottom + corner, corner, 0, -Math.PI / 2, true);
  shape.lineTo(-width + corner, -bottom);
  shape.absarc(-width + corner, -bottom + corner, corner, -Math.PI / 2, -Math.PI, true);
  shape.closePath();
  return shape;
}

function trayShapes(layout: TanksLayout): { rim: Shape; well: Shape; center: Vector3Tuple } | null {
  const boundary = layout.boundary;
  if (boundary?.kind === 'tray') {
    const width = boundary.maxX - boundary.minX;
    const depth = boundary.maxZ - boundary.minZ;
    return {
      rim: createRoundedRectangleShape(width + TANKS_TRAY_RIM * 2, depth + TANKS_TRAY_RIM * 2, 0.3 + TANKS_TRAY_RIM),
      well: createRoundedRectangleShape(width, depth, 0.3),
      center: [(boundary.minX + boundary.maxX) / 2, 0, (boundary.minZ + boundary.maxZ) / 2],
    };
  }
  if (boundary?.kind === 'crescent') {
    return {
      rim: crescentShape(boundary.gap, boundary.halfWidth, boundary.maxZ, TANKS_TRAY_RIM),
      well: crescentShape(boundary.gap, boundary.halfWidth, boundary.maxZ, 0),
      center: [0, 0, 0],
    };
  }
  return null;
}

/* A well's raised lip: how thick its wall is and how far it stands above the plate. */
const WELL_WALL = 0.1;
const WELL_WALL_HEIGHT = 0.07;

function shapeFromOutline(points: readonly (readonly [number, number])[], into: Path = new Shape()) {
  points.forEach(([x, z], index) => (index === 0 ? into.moveTo(x, -z) : into.lineTo(x, -z)));
  into.closePath();
  return into;
}

function wellShapes(outline: (grow: number) => readonly (readonly [number, number])[]) {
  const inner = outline(0);
  const wall = shapeFromOutline(outline(WELL_WALL)) as Shape;
  wall.holes.push(shapeFromOutline(inner, new Path()));
  return { wall, floor: shapeFromOutline(inner) as Shape };
}

function TanksWell({ outline }: { outline: (grow: number) => readonly (readonly [number, number])[] }) {
  const palette = useTablePalette();
  const shapes = useMemo(() => wellShapes(outline), [outline]);
  return (
    <group>
      <mesh position={[0, 0.02, 0]} raycast={ignoreRaycast} receiveShadow rotation={[-Math.PI / 2, 0, 0]}>
        <shapeGeometry args={[shapes.floor, 48]} />
        <meshStandardMaterial color={palette.well} metalness={0} roughness={0.96} />
      </mesh>
      <mesh position={[0, 0.005, 0]} raycast={ignoreRaycast} castShadow receiveShadow rotation={[-Math.PI / 2, 0, 0]}>
        <extrudeGeometry
          args={[
            shapes.wall,
            {
              depth: WELL_WALL_HEIGHT,
              bevelEnabled: true,
              bevelSize: 0.02,
              bevelThickness: 0.02,
              bevelSegments: 3,
              curveSegments: 48,
            },
          ]}
        />
        <meshStandardMaterial color={palette.top} metalness={0.02} roughness={0.9} />
      </mesh>
    </group>
  );
}

function TanksBoundary() {
  const palette = useTablePalette();
  const layout = tanksLayout();
  const tray = useMemo(() => trayShapes(layout), [layout]);
  const halfWidth = layout.shelfWidth / 2;
  const grooveAngle = Math.asin(Math.min(1, halfWidth / TABLE_VISIBLE_RADIUS));

  return (
    <group>
      {layout.boundary?.kind === 'groove' ? (
        <mesh position={[0, 0.012, 0]} raycast={ignoreRaycast} receiveShadow rotation={[-Math.PI / 2, 0, 0]}>
          <ringGeometry
            args={[
              TABLE_VISIBLE_RADIUS - TANKS_LINE_WIDTH / 2,
              TABLE_VISIBLE_RADIUS + TANKS_LINE_WIDTH / 2,
              96,
              1,
              -Math.PI / 2 - grooveAngle,
              grooveAngle * 2,
            ]}
          />
          <meshStandardMaterial color={palette.slotRim} metalness={0.06} roughness={0.82} />
        </mesh>
      ) : null}
      {layout.dividers.map((x) => {
        const top = circleZ(x);
        const bottom = layout.shelfMaxZ - 0.25;
        return (
          <mesh
            key={x}
            position={[x, 0.012, (top + bottom) / 2]}
            raycast={ignoreRaycast}
            receiveShadow
            rotation={[-Math.PI / 2, 0, 0]}
          >
            <planeGeometry args={[TANKS_LINE_WIDTH, bottom - top]} />
            <meshStandardMaterial color={palette.slotRim} metalness={0.06} roughness={0.82} />
          </mesh>
        );
      })}
      {layout.boundary?.kind === 'well' ? <TanksWell outline={layout.boundary.outline} /> : null}
      {tray ? (
        <group position={tray.center}>
          <mesh position={[0, 0.009, 0]} raycast={ignoreRaycast} receiveShadow rotation={[-Math.PI / 2, 0, 0]}>
            <shapeGeometry args={[tray.rim, 24]} />
            <meshStandardMaterial color={palette.slotRim} metalness={0.06} roughness={0.82} />
          </mesh>
          <mesh position={[0, 0.02, 0]} raycast={ignoreRaycast} receiveShadow rotation={[-Math.PI / 2, 0, 0]}>
            <shapeGeometry args={[tray.well, 24]} />
            <meshStandardMaterial color={palette.well} metalness={0} roughness={0.96} />
          </mesh>
        </group>
      ) : null}
    </group>
  );
}

export function TableFurniture({ trackerSlots }: { trackerSlots: readonly TrackerArcSlot[] }) {
  return (
    <group>
      <TablePlate trackerSlots={trackerSlots} />
      <SideCardBay side="left" />
      <SideCardBay side="right" />
      {SHARED_ITEM_PLACEMENT_ANCHORS.map((anchor) => (
        <CardWell key={anchor.id} position={anchor.position} />
      ))}
      <TanksBoundary />
      <TableLabel position={TABLE_TANKS_LABEL_POSITION}>{TABLE_TANKS_LABEL}</TableLabel>
    </group>
  );
}
