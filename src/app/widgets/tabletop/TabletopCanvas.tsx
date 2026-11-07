/* @jsxImportSource ./three-jsx */

import { Canvas, useFrame, useThree } from '@react-three/fiber/webgpu';
import type { ComponentProps, ReactNode } from 'react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { NeutralToneMapping } from 'three';

import { SceneHoldsContext } from './sceneHolds';
import type { SceneHolds } from './sceneHolds';
import { releaseSharedMeshes } from './sharedMeshes';
import { TableGraphicsBoundary, TableGraphicsUnavailable } from './TableGraphicsBoundary';
import { useTableLighting } from './tableLighting';
import { useTablePalette } from './tablePalette';
import { TABLE_ANTIALIAS, TABLE_DPR } from './tableRendering';
import { useTableGraphics } from './useTableGraphics';

/** Releases the table's shared shapes before Fiber disposes the renderer after root teardown. */
function ReleaseSharedMeshesOnUnmount() {
  const renderer = useThree((state) => state.renderer);
  useEffect(
    () => () => {
      if (!renderer.domElement.isConnected) {
        releaseSharedMeshes(renderer);
      }
    },
    [renderer]
  );
  return null;
}

/* The table's lights, scaled by this viewer's lighting choice; only they re-render while the slider moves. */
function TableLights() {
  const lighting = useTableLighting();
  const palette = useTablePalette();
  return (
    <>
      <ambientLight intensity={1.25 * lighting} />
      <directionalLight position={[-4, 9, 5]} intensity={3.1 * lighting} color={palette.keyLight} />
      <pointLight position={[5, 4, -4]} intensity={14 * lighting} distance={16} color={palette.fillLight} />
    </>
  );
}

/* Reports the renderer's first frame, then the ready scene: a few frames painted after every hold let go. */
function PaintedFrames({
  held,
  onStarted,
  onReady,
}: {
  held: () => boolean;
  onStarted?: () => void;
  onReady?: () => void;
}) {
  const started = useRef(false);
  const frames = useRef(0);
  const complete = useRef(false);
  const pending = useRef<number | null>(null);
  useEffect(
    () => () => {
      if (pending.current !== null) {
        cancelAnimationFrame(pending.current);
      }
    },
    []
  );
  useFrame(() => {
    if (complete.current) {
      return;
    }
    if (!started.current) {
      started.current = true;
      onStarted?.();
    }
    /* A held part restarts the count, so the frames that count are the ones that drew it. */
    if (held()) {
      frames.current = 0;
      return;
    }
    if (++frames.current > 3) {
      complete.current = true;
      pending.current = requestAnimationFrame(() => onReady?.());
    }
  });
  return null;
}

/** Keeps the renderer independent of live table data, so a preview can open onto its board while connecting. */
export function TabletopCanvas({
  camera,
  presentation,
  onSceneStarted,
  onSceneReady,
  onSceneUnavailable,
  children,
}: {
  camera: ComponentProps<typeof Canvas>['camera'];
  presentation: 'play' | 'preview';
  /** The renderer drew its first frame; the scene may still be waiting on parts that hold it. */
  onSceneStarted?: () => void;
  onSceneReady?: () => void;
  onSceneUnavailable?: () => void;
  children: ReactNode;
}) {
  const graphics = useTableGraphics();
  const [painted, setPainted] = useState(false);
  const ready = useCallback(() => {
    setPainted(true);
    onSceneReady?.();
  }, [onSceneReady]);
  const onUnavailable = onSceneUnavailable ?? onSceneReady;
  const holdCount = useRef(0);
  const holds = useMemo<SceneHolds>(
    () => ({
      hold: () => {
        holdCount.current += 1;
        let released = false;
        return () => {
          if (!released) {
            released = true;
            holdCount.current -= 1;
          }
        };
      },
    }),
    []
  );
  const held = useCallback(() => holdCount.current > 0, []);
  return (
    <>
      {graphics === 'unavailable' && (
        <TableGraphicsUnavailable silent={presentation === 'preview'} onShown={onUnavailable} />
      )}
      {graphics === 'ready' && (
        <TableGraphicsBoundary silent={presentation === 'preview'} onShown={onUnavailable}>
          <Canvas
            camera={camera}
            dpr={TABLE_DPR}
            /* Startup owns its first painted frames; later draws follow interaction and artwork changes. */
            frameloop={!painted ? 'always' : 'demand'}
            renderer={{
              antialias: TABLE_ANTIALIAS,
              alpha: presentation === 'preview',
              powerPreference: 'high-performance',
              toneMapping: NeutralToneMapping,
            }}
          >
            <ReleaseSharedMeshesOnUnmount />
            <TableLights />
            <PaintedFrames held={held} onStarted={onSceneStarted} onReady={ready} />
            <SceneHoldsContext value={holds}>{children}</SceneHoldsContext>
          </Canvas>
        </TableGraphicsBoundary>
      )}
    </>
  );
}
