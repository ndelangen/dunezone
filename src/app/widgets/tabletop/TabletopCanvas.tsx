/* @jsxImportSource ./three-jsx */
import { Canvas, useFrame, useThree } from '@react-three/fiber/webgpu';
import type { ComponentProps, ReactNode } from 'react';
import { useEffect, useRef } from 'react';
import { NeutralToneMapping } from 'three';

import { releaseSharedMeshes } from './sharedMeshes';
import { TableGraphicsBoundary, TableGraphicsUnavailable } from './TableGraphicsBoundary';
import { useTableLighting } from './tableLighting';
import { useTableGraphics } from './useTableGraphics';

/**
 * Frees the renderer, and with it the canvas's WebGL context or GPU device, once the table's canvas has left the page.
 * R3F does this on unmount only for its legacy WebGLRenderer, so every remount of the table (a reconnect, a reload of the view) otherwise left a live context behind until the browser ran out of them.
 * A canvas still on the page is a remount of this component alone, as R3F's own teardown assumes, and keeps its renderer.
 */
function ReleaseRendererOnUnmount() {
  const renderer = useThree((state) => state.renderer);
  useEffect(
    () => () => {
      if (!renderer.domElement.isConnected) {
        releaseSharedMeshes(renderer);
        renderer.dispose();
      }
    },
    [renderer]
  );
  return null;
}

/* The table's lights, scaled by this viewer's lighting choice; only they re-render while the slider moves. */
function TableLights() {
  const lighting = useTableLighting();
  return (
    <>
      <ambientLight intensity={1.25 * lighting} />
      <directionalLight position={[-4, 9, 5]} intensity={3.1 * lighting} color="#ffe2ae" />
      <pointLight position={[5, 4, -4]} intensity={14 * lighting} distance={16} color="#d67b44" />
    </>
  );
}

/**
 * Reports the preview ready a few browser frames after its first rendered frame.
 * The count runs on the browser's own animation frames rather than on further rendered frames: in hosted CI an unsigned visitor's demand-mode canvas rendered three frames and no fourth, so its sneak peek never became ready or showed pieces.
 * Leaving the page through Suspense cancels the count, and returning starts it again.
 */
function PaintedFrames({ onReady }: { onReady?: () => void }) {
  const invalidate = useThree((state) => state.invalidate);
  const painted = useRef(false);
  const complete = useRef(false);
  useFrame(() => {
    painted.current = true;
  });
  useEffect(() => {
    if (complete.current) {
      return;
    }
    let frames = 0;
    let pending = requestAnimationFrame(function step() {
      if (painted.current && ++frames > 3) {
        complete.current = true;
        onReady?.();
        return;
      }
      invalidate();
      pending = requestAnimationFrame(step);
    });
    return () => cancelAnimationFrame(pending);
  }, [invalidate, onReady]);
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
            frameloop="demand"
            renderer={{
              antialias: true,
              alpha: presentation === 'preview',
              powerPreference: 'high-performance',
              toneMapping: NeutralToneMapping,
            }}
            onCreated={presentation === 'play' ? onSceneReady : undefined}
          >
            <ReleaseRendererOnUnmount />
            <TableLights />
            {presentation === 'preview' && <PaintedFrames onReady={onSceneReady} />}
            {children}
          </Canvas>
        </TableGraphicsBoundary>
      )}
    </>
  );
}
