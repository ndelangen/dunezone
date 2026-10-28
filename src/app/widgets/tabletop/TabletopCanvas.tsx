/* @jsxImportSource ./three-jsx */

import { Canvas, useFrame, useThree } from '@react-three/fiber/webgpu';
import type { ComponentProps, ReactNode } from 'react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { NeutralToneMapping } from 'three';

import { releaseSharedMeshes } from './sharedMeshes';
import { TableGraphicsBoundary, TableGraphicsUnavailable } from './TableGraphicsBoundary';
import { useTableLighting } from './tableLighting';
import { useTablePalette } from './tablePalette';
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

function PaintedFrames({ onReady }: { onReady?: () => void }) {
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
  onSceneReady,
  onSceneUnavailable,
  children,
}: {
  camera: ComponentProps<typeof Canvas>['camera'];
  presentation: 'play' | 'preview';
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
  return (
    <>
      {graphics === 'unavailable' && (
        <TableGraphicsUnavailable silent={presentation === 'preview'} onShown={onUnavailable} />
      )}
      {graphics === 'ready' && (
        <TableGraphicsBoundary silent={presentation === 'preview'} onShown={onUnavailable}>
          <Canvas
            camera={camera}
            dpr={[1, 2]}
            /* Startup owns its first painted frames; later draws follow interaction and artwork changes. */
            frameloop={!painted ? 'always' : 'demand'}
            renderer={{
              antialias: true,
              alpha: presentation === 'preview',
              powerPreference: 'high-performance',
              toneMapping: NeutralToneMapping,
            }}
          >
            <ReleaseSharedMeshesOnUnmount />
            <TableLights />
            <PaintedFrames onReady={ready} />
            {children}
          </Canvas>
        </TableGraphicsBoundary>
      )}
    </>
  );
}
