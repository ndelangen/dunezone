/* @vitest-environment jsdom */

import type { Vector3Tuple } from '@shared/play/model';
import { act, cleanup, render } from '@testing-library/react';
import { Group, PerspectiveCamera, Scene } from 'three';
import { afterEach, describe, expect, test, vi } from 'vitest';

import { isCursorTablePoint, isPublicTablePoint, ScenePresence, useTablePose } from './ScenePresence';

const scheduler = vi.hoisted(() => ({
  frames: new Set<(state: unknown, delta: number) => void>(),
  three: {} as Record<string, unknown>,
}));

vi.mock('@react-three/fiber/webgpu', async () => {
  const { useLayoutEffect } = await import('react');
  return {
    useThree: (select?: (state: Record<string, unknown>) => unknown) => {
      const state = { invalidate: () => {}, ...scheduler.three };
      return select ? select(state) : state;
    },
    useFrame: (callback: (state: unknown, delta: number) => void) => {
      useLayoutEffect(() => {
        scheduler.frames.add(callback);
        return () => {
          scheduler.frames.delete(callback);
        };
      }, [callback]);
    },
  };
});

vi.mock('@react-three/drei/webgpu', () => ({ Html: () => null }));

vi.mock('./TabletopContext', () => {
  const table = { canInteract: true, publishPointer: () => {} };
  const pointers: never[] = [];
  const actions = { subscribePointers: () => () => {}, getPointers: () => pointers };
  return { useTabletop: () => table, useTabletopActions: () => actions };
});

afterEach(() => {
  cleanup();
  scheduler.frames.clear();
  scheduler.three = {};
  vi.unstubAllEnvs();
});

function renderRemotePose(position: Vector3Tuple) {
  const group = new Group();

  function RemotePose({ at }: { at: Vector3Tuple }) {
    const poseRef = useTablePose(at, 0, true);
    return (
      <span
        ref={(element) => {
          poseRef.current = element ? group : null;
        }}
      />
    );
  }

  const view = render(<RemotePose at={position} />);
  return {
    group,
    moveTo: (next: Vector3Tuple) => view.rerender(<RemotePose at={next} />),
    runFrames: (count: number, delta: number) => {
      for (let frame = 0; frame < count; frame += 1) {
        act(() => {
          for (const callback of scheduler.frames) {
            callback({}, delta);
          }
        });
      }
    },
  };
}

describe('remote pose smoothing', () => {
  /* A smooth frame rate, a slow one, and the slowest two up to the 0.25 s frame clamp. */
  test.each([
    { fps: 60, frames: 12 },
    { fps: 10, frames: 2 },
    { fps: 5, frames: 1 },
    { fps: 4, frames: 1 },
  ])(
    'at $fps fps a remote pose first reaches 99 percent of a move on frame $frames, about 0.2 s in',
    ({ fps, frames }) => {
      const pose = renderRemotePose([0, 0, 0]);
      pose.moveTo([1, 0, 0]);

      pose.runFrames(frames - 1, 1 / fps);
      expect(pose.group.position.x).toBeLessThan(0.99);

      pose.runFrames(1, 1 / fps);
      expect(pose.group.position.x).toBeGreaterThan(0.99);
      expect(pose.group.position.x).toBeLessThanOrEqual(1);
    }
  );
});

/** Renders the scene's presence layer on an 800 by 400 canvas at (100, 50), seen by a camera that looks at the origin. */
function renderPresence() {
  const camera = new PerspectiveCamera(50, 2, 0.1, 100);
  camera.position.set(0, 0, 10);
  camera.lookAt(0, 0, 0);
  camera.updateMatrixWorld();
  const canvas = document.createElement('canvas');
  canvas.getBoundingClientRect = () => ({ left: 100, top: 50, width: 800, height: 400 }) as DOMRect;
  scheduler.three = { camera, renderer: { domElement: canvas }, scene: new Scene() };
  render(<ScenePresence />);
  return camera;
}

describe('the table diagnostic that browser verification projects through', () => {
  test.each([
    ['a development', true, undefined],
    ['the local-auth', false, 'true'],
  ] as const)('%s build installs it, and it projects through the rendered camera', (_build, dev, localAuth) => {
    vi.stubEnv('DEV', dev);
    vi.stubEnv('VITE_E2E_LOCAL_AUTH', localAuth);
    const camera = renderPresence();

    const centre = window.__duneTable?.worldToScreen([0, 0, 0]);
    expect(centre?.x).toBeCloseTo(500);
    expect(centre?.y).toBeCloseTo(250);

    camera.position.set(1, 0, 10);
    camera.updateMatrixWorld();
    expect(window.__duneTable?.worldToScreen([0, 0, 0]).x).toBeLessThan(499);
  });

  test('a production build does not install it', () => {
    vi.stubEnv('DEV', false);
    vi.stubEnv('VITE_E2E_LOCAL_AUTH', undefined);
    renderPresence();

    expect(window.__duneTable).toBeUndefined();
  });
});

describe('cursor points', () => {
  function placed<T extends HTMLElement>(element: T, rectangle: DOMRect) {
    element.getBoundingClientRect = () => rectangle;
    element.getClientRects = () => [rectangle] as unknown as DOMRectList;
    document.body.append(element);
    return element;
  }

  test('a point under the header is no cursor, though a drag may still pass under it (#1665)', () => {
    const canvas = placed(document.createElement('canvas'), new DOMRect(0, 0, 800, 600));
    const header = placed(document.createElement('header'), new DOMRect(0, 0, 800, 80));
    header.dataset.hidesCursor = '';
    try {
      expect(isCursorTablePoint(canvas, 400, 40)).toBe(false);
      expect(isPublicTablePoint(canvas, 400, 40)).toBe(true);
      expect(isCursorTablePoint(canvas, 400, 300)).toBe(true);
      header.hidden = true;
      expect(isCursorTablePoint(canvas, 400, 40)).toBe(true);
    } finally {
      canvas.remove();
      header.remove();
    }
  });
});
