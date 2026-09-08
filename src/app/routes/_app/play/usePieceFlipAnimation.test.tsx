/* @vitest-environment jsdom */

import { act, cleanup, render } from '@testing-library/react';
import { Group } from 'three';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';

import type { TablePiece } from './model';
import { usePieceFlipAnimation } from './usePieceFlipAnimation';

const scheduler = vi.hoisted(() => ({
  frames: new Set<() => void>(),
  invalidate: vi.fn(),
}));

vi.mock('@react-three/fiber/webgpu', async () => {
  const { useLayoutEffect } = await import('react');
  return {
    useThree: () => ({ invalidate: scheduler.invalidate }),
    useFrame: (callback: () => void) => {
      useLayoutEffect(() => {
        scheduler.frames.add(callback);
        return () => {
          scheduler.frames.delete(callback);
        };
      }, [callback]);
    },
  };
});

let now = 0;

beforeEach(() => {
  now = 0;
  vi.spyOn(performance, 'now').mockImplementation(() => now);
  scheduler.invalidate.mockClear();
});

afterEach(() => {
  cleanup();
  scheduler.frames.clear();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

function renderPiece() {
  const piece: TablePiece = {
    id: 'card',
    label: 'Card',
    kind: 'card',
    owner: 'neutral',
    color: '#754421',
    accent: '#e3ce91',
    stackKey: 'cards',
    position: [0, 0, 0],
    orientation: 0,
    zoneId: null,
    locked: false,
    items: [{ id: 'card-1', faceUp: true }],
    flipRevision: 0,
  };
  const flippedPiece: TablePiece = {
    ...piece,
    items: [{ id: 'card-1', faceUp: false }],
    flipRevision: 1,
  };
  const pivot = new Group();
  const label = new Group();
  const shadow = new Group();
  const onFinish = vi.fn();

  function AnimatedPiece({ value, interrupted = false }: { value: TablePiece; interrupted?: boolean }) {
    const { pivotRef, labelRef, shadowRef, badgeRef } = usePieceFlipAnimation(value, interrupted, onFinish);
    return (
      <span
        data-testid="flip-badge"
        ref={(element) => {
          pivotRef.current = element ? pivot : null;
          labelRef.current = element ? label : null;
          shadowRef.current = element ? shadow : null;
          badgeRef.current = element;
        }}
      />
    );
  }

  const view = render(<AnimatedPiece value={piece} />);
  const badge = view.getByTestId('flip-badge');
  onFinish.mockClear();

  const readPose = () => ({
    rotationZ: pivot.rotation.z,
    pivotY: pivot.position.y,
    active: badge.dataset.flipping === 'true',
    completions: onFinish.mock.calls.map(([id, revision]) => [id, revision]),
  });

  return {
    onFinish,
    readPose,
    unmount: view.unmount,
    flip: () => view.rerender(<AnimatedPiece value={flippedPiece} />),
    interrupt: () => view.rerender(<AnimatedPiece value={flippedPiece} interrupted />),
    sample: (time: number) => {
      act(() => {
        now = time;
        for (const callback of scheduler.frames) {
          callback();
        }
      });
      return readPose();
    },
  };
}

describe('explicit flip animation', () => {
  test.each([false, true])('animates the object with reduced motion set to %s', (reduced) => {
    vi.stubGlobal(
      'matchMedia',
      vi.fn((query: string) => ({
        matches: reduced,
        media: query,
        onchange: null,
        addListener: vi.fn(),
        removeListener: vi.fn(),
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        dispatchEvent: vi.fn(),
      }))
    );
    const animation = renderPiece();

    animation.flip();
    const start = animation.readPose();
    expect(start.active).toBe(true);
    expect(start.completions).toEqual([]);
    expect(start.rotationZ).toBe(-Math.PI);

    const invalidations = scheduler.invalidate.mock.calls.length;
    const middle = animation.sample(260);
    expect(middle.active).toBe(true);
    expect(middle.completions).toEqual([]);
    expect(middle.rotationZ).toBeCloseTo(-Math.PI / 2, 12);
    expect(middle.pivotY).toBeGreaterThan(start.pivotY);
    expect(scheduler.invalidate.mock.calls.length).toBeGreaterThan(invalidations);

    const end = animation.sample(520);
    expect(end.active).toBe(false);
    expect(end.rotationZ).toBe(0);
    expect(end.pivotY).toBe(start.pivotY);
    expect(end.completions).toEqual([['card', 1]]);
    animation.sample(780);
    expect(animation.onFinish).toHaveBeenCalledTimes(1);
  });

  test('releases the matching revision immediately when a flip is interrupted', () => {
    const animation = renderPiece();
    animation.flip();
    expect(animation.readPose().completions).toEqual([]);
    expect(animation.sample(260).active).toBe(true);
    expect(animation.onFinish).not.toHaveBeenCalled();

    animation.interrupt();
    expect(animation.readPose()).toMatchObject({
      active: false,
      rotationZ: 0,
      completions: [['card', 1]],
    });
    animation.sample(520);
    expect(animation.onFinish).toHaveBeenCalledTimes(1);
  });

  test('releases the matching revision on unmount before the flip finishes', () => {
    const animation = renderPiece();
    animation.flip();
    expect(animation.readPose().completions).toEqual([]);
    expect(animation.sample(260).active).toBe(true);
    expect(animation.onFinish).not.toHaveBeenCalled();

    animation.unmount();
    expect(animation.onFinish).toHaveBeenCalledExactlyOnceWith('card', 1);
    expect(scheduler.frames.size).toBe(0);
    animation.sample(520);
    expect(animation.onFinish).toHaveBeenCalledTimes(1);
  });
});
