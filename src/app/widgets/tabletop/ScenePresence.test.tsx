/* @vitest-environment jsdom */

import type { Vector3Tuple } from '@shared/play/model';
import { act, cleanup, render } from '@testing-library/react';
import { Group, PerspectiveCamera, Scene } from 'three';
import { afterEach, describe, expect, test, vi } from 'vitest';

import { ScenePresence } from './ScenePresence';
import styles from './ScenePresence.module.css';
import { isCursorTablePoint, isPublicTablePoint } from './tablePointerPoint';
import { useTablePose } from './useTablePose';

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
  const table = { canInteract: true, viewer: { color: '#abcdef', avatarUrl: '' } };
  const commands = { publishPointer: () => {} };
  const pointers: never[] = [];
  const actions = { subscribePointers: () => () => {}, getPointers: () => pointers };
  return {
    useTabletopSelector: (select: (value: typeof table) => unknown) => select(table),
    useTabletopCommands: () => commands,
    useTabletopActions: () => actions,
  };
});

afterEach(() => {
  cleanup();
  scheduler.frames.clear();
  scheduler.three = {};
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
  Reflect.deleteProperty(document, 'elementFromPoint');
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
function renderPresence(showLocal = false) {
  const camera = new PerspectiveCamera(50, 2, 0.1, 100);
  camera.position.set(0, 0, 10);
  camera.lookAt(0, 0, 0);
  camera.updateMatrixWorld();
  const canvas = document.createElement('canvas');
  canvas.getBoundingClientRect = () => new DOMRect(100, 50, 800, 400);
  scheduler.three = { camera, renderer: { domElement: canvas }, scene: new Scene() };
  Object.defineProperty(document, 'elementFromPoint', { configurable: true, value: () => canvas });
  render(<ScenePresence showLocal={showLocal} />);
  return camera;
}

describe('the viewer cursor', () => {
  test.each([0, 15])('positions the avatar at the pointer with a %s px fixed-position origin', (gutter) => {
    let fixedOrigin = gutter;
    const originalBounds = HTMLElement.prototype.getBoundingClientRect;
    vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function (this: HTMLElement) {
      if (this.dataset.tableHand !== 'local') {
        return originalBounds.call(this);
      }
      const translation = this.style.transform.match(/translate3d\(([-\d.]+)px, ([-\d.]+)px, 0\)/);
      return new DOMRect(fixedOrigin + Number(translation?.[1] ?? 0), Number(translation?.[2] ?? 0), 26, 32);
    });
    renderPresence(true);
    window.dispatchEvent(new MouseEvent('pointermove', { clientX: 500, clientY: 250 }));
    const avatar = document.querySelector<HTMLElement>('[data-table-hand=local]');
    expect(avatar?.getBoundingClientRect().x).toBe(492);
    expect(avatar?.getBoundingClientRect().y).toBe(248);
    fixedOrigin = gutter === 0 ? 15 : 0;
    window.dispatchEvent(new Event('resize'));
    expect(avatar?.getBoundingClientRect().x).toBe(492);
    expect(avatar?.getBoundingClientRect().y).toBe(248);
  });

  test('uses a native cursor and moves the avatar during input without a scene frame', () => {
    renderPresence(true);
    const canvas = (scheduler.three.renderer as { domElement: HTMLCanvasElement }).domElement;
    for (const [x, y] of [
      [500, 250],
      [640, 300],
      [400, 250],
    ]) {
      window.dispatchEvent(new MouseEvent('pointermove', { clientX: x, clientY: y }));
      expect(canvas.style.getPropertyValue('--table-hand-cursor')).toContain('url(');
      expect(canvas.classList.contains(styles.localCursor)).toBe(true);
      const avatar = document.querySelector<HTMLElement>('[data-table-hand=local]');
      expect(avatar?.style.transform).toBe(`translate3d(${x - 8}px, ${y - 2}px, 0)`);
      expect(avatar?.hidden).toBe(false);
    }
    window.dispatchEvent(new Event('blur'));
    expect(canvas.classList.contains(styles.localCursor)).toBe(false);
    expect(document.querySelector<HTMLElement>('[data-table-hand=local]')?.hidden).toBe(true);
    cleanup();
    expect(canvas.style.getPropertyValue('--table-hand-cursor')).toBe('');
    expect(document.querySelector('[data-table-hand=local]')).toBeNull();
  });
});

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
