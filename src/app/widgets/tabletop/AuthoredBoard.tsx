/* @jsxImportSource ./three-jsx */
import { MantineProvider } from '@mantine/core';
import { Html } from '@react-three/drei/webgpu';
import { useThree } from '@react-three/fiber/webgpu';
import type { Board } from '@shared/boards/schema';
import { LabeledAction } from '@ui/control/LabeledAction';
import { appContentTheme } from '@ui/theme';
import { RotateCcw } from 'lucide-react';
import { useEffect, useMemo, useReducer } from 'react';
import type { Texture } from 'three';

import { authoredBoardGeometry } from './authoredBoardGeometry';
import { authoredBoardTexture } from './authoredBoardTexture';
import { POLAR_SINK_RENDER_ORDER } from './boardRenderOrder';
import { useBoardSkinPaint } from './useBoardSkinMaterial';

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

/** Mounted once for a retained definition; geometry and decoded artwork share its lifetime. */
/** `onPainted` reports the board drawn in full, its artwork in its skin, or failed and offering a retry. */
export default function AuthoredBoard({ board, onPainted }: { board: Board; onPainted?: () => void }) {
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
  const { material: paint, ready: paintReady } = useBoardSkinPaint({
    geometry,
    board,
    map: state.texture,
    vertexColors: !state.texture,
    polygonOffset: true,
  });
  const { material: polarPaint, ready: polarReady } = useBoardSkinPaint({
    geometry: polarSink,
    /* The disc's geometry covers the Polar Sink too, so both paints read one bake. */
    bakeGeometry: geometry,
    board,
    map: state.texture,
    vertexColors: !state.texture,
    polygonOffset: true,
  });
  const painted = state.error || (state.texture !== null && paintReady && polarReady);
  useEffect(() => {
    if (painted) {
      onPainted?.();
    }
  }, [painted, onPainted]);
  return (
    <>
      {/* The disc owns depth; its paint draws before the storm and stays above the disc at distant camera angles. */}
      <mesh geometry={geometry} material={paint} receiveShadow renderOrder={-3} raycast={() => {}} />
      <mesh
        geometry={polarSink}
        material={polarPaint}
        receiveShadow
        renderOrder={POLAR_SINK_RENDER_ORDER}
        raycast={() => {}}
      />
      {state.error && (
        <Html center>
          <MantineProvider
            theme={appContentTheme}
            forceColorScheme="dark"
            getRootElement={() => undefined}
            withCssVariables={false}
          >
            <LabeledAction emphasis="strong" icon={<RotateCcw size={16} />} onClick={() => dispatch({ type: 'retry' })}>
              Board artwork failed to load. Retry
            </LabeledAction>
          </MantineProvider>
        </Html>
      )}
    </>
  );
}
