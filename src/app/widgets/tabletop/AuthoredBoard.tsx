/* @jsxImportSource ./three-jsx */
import { Button, MantineProvider } from '@mantine/core';
import { Html } from '@react-three/drei/webgpu';
import { useThree } from '@react-three/fiber/webgpu';
import type { Board } from '@shared/boards/schema';
import { appContentTheme } from '@ui/theme';
import { useEffect, useMemo, useReducer } from 'react';
import type { Texture } from 'three';

import { authoredBoardGeometry } from './authoredBoardGeometry';
import { authoredBoardTexture } from './authoredBoardTexture';
import { POLAR_SINK_RENDER_ORDER } from './boardRenderOrder';

type State = { texture: Texture | null; error: boolean; attempt: number };
type Event = { type: 'ready'; texture: Texture } | { type: 'failed' } | { type: 'retry' };
function reducer(state: State, event: Event): State {
  switch (event.type) {
    case 'ready':
      return { ...state, texture: event.texture, error: false };
    case 'failed':
      return { ...state, error: true };
    case 'retry':
      return { texture: null, error: false, attempt: state.attempt + 1 };
  }
}

function BoardPaintMaterial({ texture }: { texture: Texture | null }) {
  return (
    <meshStandardMaterial
      key={texture ? 'artwork' : 'territories'}
      map={texture}
      vertexColors={!texture}
      transparent
      depthWrite={false}
      polygonOffset
      polygonOffsetFactor={-1}
      polygonOffsetUnits={-1}
      roughness={0.88}
      metalness={0}
    />
  );
}

/** Mounted once for a retained definition; geometry and decoded artwork share its lifetime. */
export default function AuthoredBoard({ board }: { board: Board }) {
  const geometry = useMemo(() => authoredBoardGeometry(board), [board]);
  const polarSink = useMemo(() => authoredBoardGeometry(board, true), [board]);
  const invalidate = useThree((state) => state.invalidate);
  const [state, dispatch] = useReducer(reducer, { texture: null, error: false, attempt: 0 });
  useEffect(
    () => () => {
      geometry.dispose();
      polarSink.dispose();
    },
    [geometry, polarSink]
  );
  useEffect(() => {
    const controller = new AbortController();
    let texture: Texture | undefined;
    void authoredBoardTexture(board, controller.signal)
      .then((value) => {
        if (controller.signal.aborted) {
          value.dispose();
          return;
        }
        texture = value;
        dispatch({ type: 'ready', texture: value });
        invalidate();
      })
      .catch(() => {
        if (!controller.signal.aborted) {
          dispatch({ type: 'failed' });
          invalidate();
        }
      });
    return () => {
      controller.abort();
      texture?.dispose();
    };
  }, [board, state.attempt, invalidate]);
  return (
    <>
      {/* The disc owns depth; its paint draws before the storm and stays above the disc at distant camera angles. */}
      <mesh geometry={geometry} receiveShadow renderOrder={-3} raycast={() => {}}>
        <BoardPaintMaterial texture={state.texture} />
      </mesh>
      <mesh geometry={polarSink} receiveShadow renderOrder={POLAR_SINK_RENDER_ORDER} raycast={() => {}}>
        <BoardPaintMaterial texture={state.texture} />
      </mesh>
      {state.error && (
        <Html center>
          <MantineProvider
            theme={appContentTheme}
            forceColorScheme="dark"
            getRootElement={() => undefined}
            withCssVariables={false}
          >
            <Button onClick={() => dispatch({ type: 'retry' })}>Board artwork failed to load. Retry</Button>
          </MantineProvider>
        </Html>
      )}
    </>
  );
}
