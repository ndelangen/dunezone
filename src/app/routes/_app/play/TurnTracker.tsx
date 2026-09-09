/* @jsxImportSource ./three-jsx */
import type { ThreeEvent } from '@react-three/fiber/webgpu';
import { useEffect, useMemo } from 'react';

import { PHASE_DISC_COLOR, PHASE_INK_COLOR } from './phaseSymbolLayout';
import { TableLabel } from './TableLabel';
import {
  createTurnTrackerFrame,
  createTurnTrackerPointer,
  createTurnTrackerWedge,
  turnAtTrackerPoint,
  turnTrackerLayout,
} from './turnTrackerGeometry';

function ignoreRaycast() {
  /* Printed numbers and raised artwork never intercept tabletop gestures. */
}

function stopTablePick(event: ThreeEvent<PointerEvent>) {
  event.stopPropagation();
}

export function TurnTracker({
  radius,
  turn,
  onSelectTurn,
}: Readonly<{ radius: number; turn: number; onSelectTurn?: (turn: number) => void }>) {
  const layout = turnTrackerLayout(radius, turn);
  const frame = useMemo(() => createTurnTrackerFrame(radius), [radius]);
  const pointer = useMemo(() => createTurnTrackerPointer(radius), [radius]);
  const wedge = useMemo(() => createTurnTrackerWedge(radius, turn), [radius, turn]);
  useEffect(() => () => frame.dispose(), [frame]);
  useEffect(() => () => pointer.dispose(), [pointer]);
  useEffect(() => () => wedge.dispose(), [wedge]);

  function select(event: ThreeEvent<MouseEvent>) {
    event.stopPropagation();
    if (!onSelectTurn || event.delta > 4 || !event.eventObject.parent) {
      return;
    }
    const point = event.eventObject.parent.worldToLocal(event.point.clone());
    const selected = turnAtTrackerPoint(radius, turn, point.x, point.z);
    if (selected !== null) {
      onSelectTurn(selected);
    }
  }

  return (
    <group>
      <mesh position={[0, 0.002, 0]} rotation={[-Math.PI / 2, 0, 0]} raycast={ignoreRaycast}>
        <circleGeometry args={[radius * 0.98, 128]} />
        <meshStandardMaterial color={PHASE_DISC_COLOR} roughness={1} metalness={0} fog={false} />
      </mesh>
      <mesh raycast={ignoreRaycast}>
        <primitive object={wedge} attach="geometry" />
        <meshStandardMaterial color="#d8bd74" roughness={1} metalness={0} fog={false} />
      </mesh>
      <mesh raycast={ignoreRaycast}>
        <primitive object={frame} attach="geometry" />
        <meshStandardMaterial color={PHASE_INK_COLOR} roughness={1} metalness={0} fog={false} />
      </mesh>
      {layout.sectors.map((sector) =>
        sector.turn !== null ? (
          <TableLabel
            key={sector.turn}
            position={sector.position}
            fontSize={radius * 0.3}
            maxWidth={radius * 0.32}
            color={PHASE_INK_COLOR}
          >
            {String(sector.turn)}
          </TableLabel>
        ) : null
      )}
      <group rotation={[0, -layout.pointerAngle, 0]}>
        <mesh raycast={ignoreRaycast}>
          <primitive object={pointer} attach="geometry" />
          <meshStandardMaterial color={PHASE_INK_COLOR} roughness={1} metalness={0} fog={false} />
        </mesh>
      </group>
      <mesh position={[0, 0.032, 0]} rotation={[-Math.PI / 2, 0, 0]} raycast={ignoreRaycast}>
        <circleGeometry args={[radius * 0.045, 32]} />
        <meshStandardMaterial color={PHASE_INK_COLOR} roughness={1} metalness={0} fog={false} />
      </mesh>
      {onSelectTurn ? (
        <mesh position={[0, 0.045, 0]} rotation={[-Math.PI / 2, 0, 0]} onPointerDown={stopTablePick} onClick={select}>
          <circleGeometry args={[radius, 128]} />
          <meshBasicMaterial transparent opacity={0} depthWrite={false} colorWrite={false} />
        </mesh>
      ) : null}
    </group>
  );
}
