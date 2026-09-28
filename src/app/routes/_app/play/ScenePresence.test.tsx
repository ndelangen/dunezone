/* @vitest-environment jsdom */

import type { Vector3Tuple } from '@shared/play/model';
import { act, cleanup, render } from '@testing-library/react';
import { Group } from 'three';
import { afterEach, describe, expect, test, vi } from 'vitest';

import { useTablePose } from './ScenePresence';

const scheduler = vi.hoisted(() => ({
  frames: new Set<(state: unknown, delta: number) => void>(),
}));

vi.mock('@react-three/fiber/webgpu', async () => {
  const { useLayoutEffect } = await import('react');
  return {
    useThree: () => ({ invalidate: () => {} }),
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

afterEach(() => {
  cleanup();
  scheduler.frames.clear();
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
  test.each([
    { fps: 60, frames: 12 },
    { fps: 20, frames: 4 },
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
