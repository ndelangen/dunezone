/* @jsxImportSource ./three-jsx */
import { Button } from '@mantine/core';
import { Html } from '@react-three/drei/webgpu';
import { useThree } from '@react-three/fiber/webgpu';
import type { Board } from '@shared/boards/schema';
import { useEffect, useMemo, useReducer } from 'react';
import type { Texture } from 'three';

import { authoredBoardGeometry } from './authoredBoardGeometry';
import { authoredBoardTexture } from './authoredBoardTexture';

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
export default function AuthoredBoard({ board }: { board: Board }) {
  const geometry = useMemo(() => authoredBoardGeometry(board), [board]);
  const invalidate = useThree((state) => state.invalidate);
  const [state, dispatch] = useReducer(reducer, { texture: null, error: false, attempt: 0 });
  useEffect(() => () => geometry.dispose(), [geometry]);
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
      <mesh geometry={geometry} receiveShadow raycast={() => {}}>
        <meshStandardMaterial
          key={state.texture ? 'artwork' : 'territories'}
          map={state.texture}
          vertexColors={!state.texture}
          roughness={0.88}
          metalness={0}
        />
      </mesh>
      {state.error && (
        <Html center>
          <Button onClick={() => dispatch({ type: 'retry' })}>Board artwork failed to load. Retry</Button>
        </Html>
      )}
    </>
  );
}
