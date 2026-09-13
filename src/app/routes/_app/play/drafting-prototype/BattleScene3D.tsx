/* @jsxImportSource ../three-jsx */
import { MantineProvider } from '@mantine/core';
/* The battle is anchored to the real territory; its marker belongs below the phase disc. */
import { Html } from '@react-three/drei/webgpu';
import { useThree } from '@react-three/fiber/webgpu';
import { TABLE_PHASES } from '@shared/play/phases';
import { BOARD_RADIUS } from '@shared/play/tableGeometry';
import { trackerArcSlots } from '@shared/play/tableTrackers';
import { appContentTheme } from '@ui/theme';
import { useEffect, useRef, useState } from 'react';
import { Plane, Raycaster, Vector2, Vector3 } from 'three';

import { battleTerritory } from './battle';
import type { BattleAction } from './battle';
import { BattleCard } from './BattlePrototype';
import { BattleCallout, BattleLeftovers } from './BattlePrototype';
import type { BattleProps } from './BattlePrototype';

export function BattleScene3D({
  state,
  dispatch,
  variant,
  now,
  phaseLabel,
}: BattleProps & { now: number; phaseLabel: string }) {
  const territoryPosition = state.anchor;
  const calloutHost = useRef<HTMLDivElement>(null);
  const [placing, setPlacing] = useState(false);
  const { camera, renderer, invalidate } = useThree();
  /* Html can initialize its DOM root after a demand frame has cached the position.
   * Reposition on every requested frame so a remount cannot keep its initial offscreen transform.
   */
  useEffect(() => {
    invalidate();
    const frame = requestAnimationFrame(() => invalidate());
    return () => cancelAnimationFrame(frame);
  }, [invalidate, state, variant]);
  const act = (action: BattleAction) => {
    if ((action.type === 'move' || action.type === 'start') && action.screen) {
      const bounds = renderer.domElement.getBoundingClientRect();
      const [x, y] = action.screen;
      if (x < bounds.left || x > bounds.right || y < bounds.top || y > bounds.bottom) {
        return;
      }
      const ray = new Raycaster();
      ray.setFromCamera(
        new Vector2(((x - bounds.left) / bounds.width) * 2 - 1, (-(y - bounds.top) / bounds.height) * 2 + 1),
        camera
      );
      const hit = ray.ray.intersectPlane(new Plane(new Vector3(0, 1, 0), -0.3), new Vector3());
      if (hit && (action.type !== 'start' || Math.hypot(hit.x, hit.z) <= BOARD_RADIUS)) {
        dispatch({ ...action, position: [hit.x, 0.3, hit.z] });
      }
    } else {
      dispatch(action);
    }
  };
  useEffect(() => {
    if (variant !== 'F' && variant !== 'G' && variant !== 'H' && variant !== 'I') {
      return;
    }
    const canvas = renderer.domElement;
    const acceptMarker = (event: DragEvent) => {
      if (event.dataTransfer?.types.includes('text/battle-marker')) {
        event.preventDefault();
      }
    };
    canvas.addEventListener('dragover', acceptMarker);
    return () => canvas.removeEventListener('dragover', acceptMarker);
  }, [renderer, variant]);
  const slot = trackerArcSlots(TABLE_PHASES.length).find((value) => value.phaseIndex === 6)!;
  const idle = state.stage === 'idle' || state.stage === 'resolved';
  return (
    <group>
      {idle && phaseLabel === 'Battle' ? (
        <Html eps={-1} position={[slot.position[0] * 0.86, 0.25, slot.position[2] * 0.86]} center zIndexRange={[8, 0]}>
          <button
            type="button"
            aria-label="Place battle marker"
            title={
              variant === 'F' || variant === 'G' || variant === 'H' || variant === 'I'
                ? undefined
                : 'Drag the marker to a territory, or select it then select Arrakeen'
            }
            onDragEnd={(event) => {
              if (variant === 'F' || variant === 'G' || variant === 'H' || variant === 'I') {
                act({ type: 'start', screen: [event.clientX, event.clientY] });
                setPlacing(false);
              }
            }}
            disabled={state.viewer === 'spectator'}
            draggable={state.viewer !== 'spectator'}
            onDragStart={(event) => {
              event.dataTransfer.setData('text/battle-marker', 'battle');
              setPlacing(true);
            }}
            onClick={() => setPlacing(true)}
            style={{
              width: 36,
              height: 36,
              border: 0,
              borderRadius: '50%',
              background: '#f0c077',
              cursor: 'grab',
              padding: 6,
            }}
          >
            <svg viewBox="0 0 100 100" aria-hidden="true">
              <use href="/vector/icon/combat.svg#root" width="100" height="100" fill="#17130f" />
            </svg>
          </button>
        </Html>
      ) : null}
      {idle && placing ? (
        <Html eps={-1} position={territoryPosition} center zIndexRange={[9, 0]}>
          <button
            type="button"
            className="button button--primary"
            onDragOver={(event) => event.preventDefault()}
            onDrop={(event) => {
              event.preventDefault();
              if (event.dataTransfer.getData('text/battle-marker')) {
                dispatch({ type: 'start' });
                setPlacing(false);
              }
            }}
            onClick={() => {
              dispatch({ type: 'start' });
              setPlacing(false);
            }}
          >
            {variant === 'F' || variant === 'G' || variant === 'H' || variant === 'I'
              ? 'Place battle here'
              : `Battle in ${battleTerritory(state)}`}
          </button>
        </Html>
      ) : null}
      {!idle ? (
        <Html
          eps={-1}
          ref={calloutHost}
          position={territoryPosition}
          zIndexRange={[8, 0]}
          calculatePosition={(object, viewCamera, size) => {
            const point = new Vector3().setFromMatrixPosition(object.matrixWorld).project(viewCamera);
            const x = ((point.x + 1) * size.width) / 2;
            const y = ((1 - point.y) * size.height) / 2;
            if (
              variant === 'D' ||
              variant === 'E' ||
              variant === 'F' ||
              variant === 'G' ||
              variant === 'H' ||
              variant === 'I'
            ) {
              const halfWidth =
                variant === 'H' || variant === 'I' ? 250 : variant === 'F' || variant === 'G' ? 294 : 325;
              const centreX = Math.max(halfWidth + 12, Math.min(size.width - halfWidth - 12, size.width / 2));
              const below = y < size.height / 2;
              const top = below ? Math.min(size.height - 318, y + 120) : Math.max(72, y - 410);
              const targetY = y - top;
              const baseY = below ? 90 : 200;
              const host = calloutHost.current;
              host?.style.setProperty('--callout-tail-top', `${Math.min(baseY, targetY)}px`);
              host?.style.setProperty('--callout-tail-height', `${Math.abs(targetY - baseY)}px`);
              host?.style.setProperty('--callout-tail-base', below ? '100%' : '0%');
              host?.style.setProperty('--callout-tail-tip', below ? '0%' : '100%');
              host?.style.setProperty('--callout-tail-skew', `${Math.atan((x - centreX) / (targetY - baseY))}rad`);
              return [centreX, top];
            }
            const half = variant === 'B' ? 365 : variant === 'C' ? 300 : 255;
            const clampedX = Math.max(half + 12, Math.min(size.width - half - 12, x));
            const clampedY = Math.max(72, y);
            calloutHost.current?.style.setProperty('--battle-anchor-dx', `${x - clampedX}px`);
            calloutHost.current?.style.setProperty('--battle-anchor-dy', `${22 + clampedY - y}px`);
            return [clampedX, clampedY];
          }}
        >
          <MantineProvider theme={appContentTheme} forceColorScheme="dark">
            <BattleCallout state={state} dispatch={act} variant={variant} now={now} />
          </MantineProvider>
        </Html>
      ) : null}
      {state.moved.map((piece) => (
        <Html eps={-1} key={piece} position={state.positions[piece]} zIndexRange={[9, 0]}>
          <div
            data-moved-piece={piece}
            draggable={state.viewer !== 'spectator'}
            onDragEnd={(event) => act({ type: 'move', piece, screen: [event.clientX, event.clientY] })}
          >
            <BattleCard id={piece.split(':')[1]} width={58} />
          </div>
        </Html>
      ))}
      <Html eps={-1} position={[1.9, 0.3, territoryPosition[2] + 0.8]} zIndexRange={[7, 0]}>
        <MantineProvider theme={appContentTheme} forceColorScheme="dark">
          <BattleLeftovers state={state} />
        </MantineProvider>
      </Html>
    </group>
  );
}
