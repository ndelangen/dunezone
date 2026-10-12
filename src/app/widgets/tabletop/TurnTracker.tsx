/* @jsxImportSource ./three-jsx */
import { useEffect, useMemo, useState } from 'react';

import { ignoreRaycast } from './ignoreRaycast';
import { PHASE_DISC_COLOR, PHASE_INK_COLOR } from './phaseSymbolLayout';
import {
  createTurnTrackerFrame,
  createTurnTrackerPointer,
  createTurnTrackerWedge,
  NUMBER_RADIUS,
  turnTrackerLayout,
} from './turnTrackerGeometry';
import { createTurnNumbersTexture, loadTurnNumberFont } from './turnTrackerNumbers';

/** The printed numbers, drawn once the number face has loaded and again only when the wheel's block of turns changes. */
function useTurnNumbers(layout: ReturnType<typeof turnTrackerLayout>) {
  const [fontReady, setFontReady] = useState(false);
  useEffect(() => {
    let mounted = true;
    void loadTurnNumberFont().then(() => mounted && setFontReady(true));
    return () => {
      mounted = false;
    };
  }, []);
  const { firstTurn, sectors } = layout;
  const texture = useMemo(
    () => (fontReady ? createTurnNumbersTexture(sectors, NUMBER_RADIUS, PHASE_INK_COLOR) : null),
    // The sectors are rebuilt with every turn; their printed numbers change only with the block.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [fontReady, firstTurn, sectors.length]
  );
  useEffect(() => () => texture?.dispose(), [texture]);
  return texture;
}

/* The wheel only shows the turn: players change it by moving through the phases (#1683). */
export function TurnTracker({ radius, turn, lastTurn }: Readonly<{ radius: number; turn: number; lastTurn?: number }>) {
  const layout = useMemo(() => turnTrackerLayout({ radius, turn, lastTurn }), [radius, turn, lastTurn]);
  const frame = useMemo(() => createTurnTrackerFrame(layout), [layout]);
  const pointer = useMemo(() => createTurnTrackerPointer(layout), [layout]);
  const wedge = useMemo(() => createTurnTrackerWedge(layout), [layout]);
  const numbers = useTurnNumbers(layout);
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
      {numbers ? (
        <mesh key={numbers.uuid} position={[0, 0.019, 0]} rotation={[-Math.PI / 2, 0, 0]} raycast={ignoreRaycast}>
          <planeGeometry args={[radius * 2, radius * 2]} />
          <meshBasicMaterial
            map={numbers}
            transparent
            alphaTest={0.01}
            depthWrite={false}
            fog={false}
            toneMapped={false}
            polygonOffset
            polygonOffsetFactor={-1}
            polygonOffsetUnits={-1}
          />
        </mesh>
      ) : null}
      <group rotation={[0, -layout.pointerAngle, 0]}>
        <mesh key={pointer.uuid} raycast={ignoreRaycast}>
          <primitive object={pointer} attach="geometry" />
          <meshStandardMaterial color={PHASE_INK_COLOR} roughness={1} metalness={0} fog={false} />
        </mesh>
      </group>
    </group>
  );
}
