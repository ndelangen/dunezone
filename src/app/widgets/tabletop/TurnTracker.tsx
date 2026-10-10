/* @jsxImportSource ./three-jsx */
import { useEffect, useMemo } from 'react';

import { PHASE_DISC_COLOR, PHASE_INK_COLOR } from './phaseSymbolLayout';
import { TableLabel } from './TableLabel';
import {
  createTurnTrackerFrame,
  createTurnTrackerPointer,
  createTurnTrackerWedge,
  turnTrackerLayout,
} from './turnTrackerGeometry';

function ignoreRaycast() {
  /* Printed numbers and raised artwork never intercept tabletop gestures. */
}

/* The wheel only shows the turn: players change it by moving through the phases (#1683). */
export function TurnTracker({ radius, turn, lastTurn }: Readonly<{ radius: number; turn: number; lastTurn: number }>) {
  const layout = useMemo(() => turnTrackerLayout({ radius, turn, lastTurn }), [radius, turn, lastTurn]);
  /* Numbers keep their ten-turn size on a shorter game and shrink to fit the narrower sectors of a longer one. */
  const labelScale = Math.min(1, 10 / layout.sectorCount);
  const frame = useMemo(() => createTurnTrackerFrame(layout), [layout]);
  const pointer = useMemo(() => createTurnTrackerPointer(layout), [layout]);
  const wedge = useMemo(() => createTurnTrackerWedge(layout), [layout]);
  useEffect(() => () => frame.dispose(), [frame]);
  useEffect(() => () => pointer.dispose(), [pointer]);
  useEffect(() => () => wedge.dispose(), [wedge]);

  return (
    <group>
      <mesh position={[0, 0.002, 0]} rotation={[-Math.PI / 2, 0, 0]} raycast={ignoreRaycast}>
        <circleGeometry args={[radius * 0.98, 128]} />
        <meshStandardMaterial color={PHASE_DISC_COLOR} roughness={1} metalness={0} fog={false} />
      </mesh>
      {/* Replace each mesh with its geometry so WebGPU cannot reuse disposed vertex buffers. */}
      <mesh key={wedge.uuid} raycast={ignoreRaycast}>
        <primitive object={wedge} attach="geometry" />
        <meshStandardMaterial color="#d8bd74" roughness={1} metalness={0} fog={false} />
      </mesh>
      <mesh key={frame.uuid} raycast={ignoreRaycast}>
        <primitive object={frame} attach="geometry" />
        <meshStandardMaterial color={PHASE_INK_COLOR} roughness={1} metalness={0} fog={false} />
      </mesh>
      {layout.sectors.map((sector) =>
        sector.turn !== null ? (
          <TableLabel
            key={sector.turn}
            position={sector.position}
            fontSize={radius * 0.3 * labelScale}
            maxWidth={radius * 0.32 * labelScale}
            color={PHASE_INK_COLOR}
          >
            {String(sector.turn)}
          </TableLabel>
        ) : null
      )}
      <group rotation={[0, -layout.pointerAngle, 0]}>
        <mesh key={pointer.uuid} raycast={ignoreRaycast}>
          <primitive object={pointer} attach="geometry" />
          <meshStandardMaterial color={PHASE_INK_COLOR} roughness={1} metalness={0} fog={false} />
        </mesh>
      </group>
      <mesh position={[0, 0.032, 0]} rotation={[-Math.PI / 2, 0, 0]} raycast={ignoreRaycast}>
        <circleGeometry args={[radius * 0.045, 32]} />
        <meshStandardMaterial color={PHASE_INK_COLOR} roughness={1} metalness={0} fog={false} />
      </mesh>
    </group>
  );
}
