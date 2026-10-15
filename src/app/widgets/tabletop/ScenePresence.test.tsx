/* @vitest-environment jsdom */

import type { Vector3Tuple } from '@shared/play/model';
import { act, cleanup, render } from '@testing-library/react';
import { useCallback } from 'react';
import { Group, PerspectiveCamera, Scene } from 'three';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vite-plus/test';

import { ScenePresence } from './ScenePresence';
import styles from './ScenePresence.module.css';
import { isCursorTablePoint, isPublicTablePoint } from './tablePointerPoint';
import { PlateFollowersProvider, useTablePose } from './useTablePose';

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

describe('a rider on a plate another player carries', () => {
  type Pose = { at: Vector3Tuple; turn: number };
  let plate = new Group();
  let rider = new Group();
  beforeEach(() => {
    plate = new Group();
    rider = new Group();
  });

  function Posed({
    pose,
    group,
    links,
    remote = Boolean(links?.plateId),
    immediate = false,
  }: {
    pose: Pose;
    group: Group;
    links: Parameters<typeof useTablePose>[4];
    remote?: boolean;
    immediate?: boolean;
  }) {
    const poseRef = useTablePose(pose.at, pose.turn, remote, immediate, links);
    /* A stable ref, as the scene's own groups have: an inline one is let go and taken again on every render. */
    const attach = useCallback(
      (element: HTMLSpanElement | null) => {
        poseRef.current = element ? group : null;
      },
      [group, poseRef]
    );
    return <span ref={attach} />;
  }

  /*
   * The plate is carried by someone else while `riding`, so the rider follows it; otherwise both rest on their own.
   * `snapped` sets the plate down at once, as this page's own hand does; `riderCarried` has someone pick the rider up.
   */
  function Plate({
    plate: platePose,
    rider: riderPose,
    riding = true,
    snapped = false,
    riderCarried = false,
  }: {
    plate: Pose;
    rider: Pose;
    riding?: boolean;
    snapped?: boolean;
    riderCarried?: boolean;
  }) {
    return (
      <PlateFollowersProvider>
        <Posed pose={platePose} group={plate} links={{ plateId: 'hms' }} immediate={snapped} />
        <Posed pose={riderPose} group={rider} links={{ follows: riding ? 'hms' : undefined }} remote={riderCarried} />
      </PlateFollowersProvider>
    );
  }

  const runFrames = (count: number) => {
    for (let frame = 0; frame < count; frame += 1) {
      act(() => {
        for (const callback of scheduler.frames) {
          callback({}, 1 / 60);
        }
      });
    }
  };
  /* How far the rider is from where it sits on the plate as shown, at 0.75 towards the plate's point. */
  const offPlate = () => {
    const turn = plate.rotation.y;
    return Math.hypot(
      rider.position.x - (plate.position.x + 0.75 * Math.sin(turn) * -1),
      rider.position.z - (plate.position.z - 0.75 * Math.cos(turn))
    );
  };

  test('keeps its place on the plate while the plate turns, rather than cutting across it', () => {
    const view = render(<Plate plate={{ at: [0, 0, 0], turn: 0 }} rider={{ at: [0, 0, -0.75], turn: 0 }} />);
    view.rerender(<Plate plate={{ at: [0, 0, 0], turn: Math.PI }} rider={{ at: [0, 0, 0.75], turn: Math.PI }} />);
    runFrames(1);
    expect(plate.rotation.y).toBeGreaterThan(0);
    expect(plate.rotation.y).toBeLessThan(Math.PI);
    expect(offPlate()).toBeCloseTo(0);
    expect(rider.rotation.y).toBeCloseTo(plate.rotation.y);
  });

  test('stays on the plate after the carry ends, until the plate has settled', () => {
    const view = render(<Plate plate={{ at: [0, 0, 0], turn: 0 }} rider={{ at: [0, 0, -0.75], turn: 0 }} />);
    view.rerender(<Plate plate={{ at: [0, 0, 0], turn: Math.PI }} rider={{ at: [0, 0, 0.75], turn: Math.PI }} />);
    runFrames(1);
    view.rerender(
      <Plate plate={{ at: [0, 0, 0], turn: Math.PI }} rider={{ at: [0, 0, 0.75], turn: Math.PI }} riding={false} />
    );
    runFrames(1);
    expect(plate.rotation.y).toBeLessThan(Math.PI - 0.01);
    expect(offPlate()).toBeCloseTo(0);
    runFrames(60);
    expect(rider.position.z).toBeCloseTo(0.75);
    expect(rider.rotation.y).toBeCloseTo(Math.PI);
  });

  /* Lets the rider's release, decided once every piece has taken the new table, run. */
  const settleRelease = () => act(async () => {});

  test('turns with the plate when a carry held still is cancelled', async () => {
    const view = render(<Plate plate={{ at: [0, 0, 0], turn: 0 }} rider={{ at: [0, 0, -0.75], turn: 0 }} />);
    view.rerender(<Plate plate={{ at: [0, 0, 0], turn: Math.PI }} rider={{ at: [0, 0, 0.75], turn: Math.PI }} />);
    runFrames(60);
    view.rerender(<Plate plate={{ at: [0, 0, 0], turn: 0 }} rider={{ at: [0, 0, -0.75], turn: 0 }} riding={false} />);
    await settleRelease();
    runFrames(1);
    expect(plate.rotation.y).toBeGreaterThan(0.01);
    expect(offPlate()).toBeCloseTo(0);
    runFrames(60);
    expect(rider.position.z).toBeCloseTo(-0.75);
  });

  test('goes its own way when picked up while it still rides out a turning plate', async () => {
    const view = render(<Plate plate={{ at: [0, 0, 0], turn: 0 }} rider={{ at: [0, 0, -0.75], turn: 0 }} />);
    view.rerender(<Plate plate={{ at: [0, 0, 0], turn: Math.PI }} rider={{ at: [0, 0, 0.75], turn: Math.PI }} />);
    runFrames(1);
    view.rerender(
      <Plate plate={{ at: [0, 0, 0], turn: Math.PI }} rider={{ at: [0, 0, 0.75], turn: Math.PI }} riding={false} />
    );
    await settleRelease();
    view.rerender(
      <Plate
        plate={{ at: [0, 0, 0], turn: Math.PI }}
        rider={{ at: [3, 0, 3], turn: Math.PI }}
        riding={false}
        riderCarried
      />
    );
    const before = rider.position.clone();
    runFrames(1);
    const amount = 1 - Math.exp(-24 / 60);
    expect(rider.position.x).toBeCloseTo(before.x + (3 - before.x) * amount);
    expect(rider.position.z).toBeCloseTo(before.z + (3 - before.z) * amount);
  });

  test('lets go of the plate when the plate is set down at once', async () => {
    const view = render(<Plate plate={{ at: [0, 0, 0], turn: 0 }} rider={{ at: [0, 0, -0.75], turn: 0 }} />);
    view.rerender(<Plate plate={{ at: [0, 0, 0], turn: Math.PI }} rider={{ at: [0, 0, 0.75], turn: Math.PI }} />);
    runFrames(1);
    view.rerender(
      <Plate plate={{ at: [0, 0, 0], turn: Math.PI }} rider={{ at: [0, 0, 0.75], turn: Math.PI }} riding={false} />
    );
    await settleRelease();
    view.rerender(
      <Plate
        plate={{ at: [0, 0, 0], turn: Math.PI }}
        rider={{ at: [0, 0, 0.75], turn: Math.PI }}
        riding={false}
        snapped
      />
    );
    view.rerender(
      <Plate plate={{ at: [2, 0, 0], turn: Math.PI }} rider={{ at: [0, 0, 0.75], turn: Math.PI }} riding={false} />
    );
    runFrames(1);
    expect(rider.position.x).toBeCloseTo(0);
    expect(rider.position.z).toBeCloseTo(0.75);
  });

  test('takes a new place on a still plate at once', () => {
    const view = render(<Plate plate={{ at: [2, 0, 0], turn: 0 }} rider={{ at: [2, 0, -0.75], turn: 0 }} />);
    runFrames(30);
    view.rerender(<Plate plate={{ at: [2, 0, 0], turn: 0 }} rider={{ at: [2.2, 0, -0.5], turn: 0.4 }} />);
    expect(rider.position.x).toBeCloseTo(2.2);
    expect(rider.position.z).toBeCloseTo(-0.5);
    expect(rider.rotation.y).toBeCloseTo(0.4);
  });
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
    vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function (this: HTMLElement) {
      if (this.dataset.tableHand !== 'local') {
        /* The spy sits on HTMLElement.prototype, so Element.prototype still holds the browser's own measurement. */
        return Element.prototype.getBoundingClientRect.call(this);
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
