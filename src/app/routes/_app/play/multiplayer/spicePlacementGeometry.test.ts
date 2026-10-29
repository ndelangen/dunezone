import { createSpiceStack } from '@shared/play/spiceBank';
import { clampPositionToTable } from '@shared/play/tablePhysics';
// @vitest-environment jsdom
import { PerspectiveCamera, Vector3 } from 'three';
import { expect, test, vi } from 'vite-plus/test';

import { moveSpicePosition, visibleSpicePosition } from './spicePlacementGeometry';

const bounds = new DOMRect(30, 50, 1000, 700);
const footprint = createSpiceStack(0, 1);
function scene(eye: [number, number, number], target: [number, number, number]) {
  const canvas = document.createElement('canvas');
  vi.spyOn(canvas, 'getBoundingClientRect').mockReturnValue(bounds);
  const camera = new PerspectiveCamera(18, bounds.width / bounds.height, 0.1, 100);
  camera.position.set(...eye);
  camera.lookAt(...target);
  camera.updateMatrixWorld();
  return { canvas, camera };
}

test.each([
  {
    label: 'zoomed and panned',
    eye: [3, 8, 1] as [number, number, number],
    target: [3, 0.18, 0] as [number, number, number],
  },
  {
    label: 'side camera',
    eye: [3, 2, 7] as [number, number, number],
    target: [3, 0.18, 0] as [number, number, number],
  },
])('keyboard spice starts visibly and can move with a $label', ({ eye, target }) => {
  const { canvas, camera } = scene(eye, target);
  const origin = new Vector3(0, 0.18, 0).project(camera);
  expect(Math.abs(origin.x)).toBeGreaterThan(1);
  const position = visibleSpicePosition(canvas, camera)!;
  expect(position).not.toBeNull();
  expect(clampPositionToTable(footprint, position)).toEqual(position);
  const projected = new Vector3(...position).project(camera);
  expect(Math.abs(projected.x)).toBeLessThan(0.8);
  expect(Math.abs(projected.y)).toBeLessThan(0.8);
  const next = moveSpicePosition(canvas, camera, position, [20, 0])!;
  expect(clampPositionToTable(footprint, next)).toEqual(next);
  expect(next).not.toEqual(position);
});

test('an unsupported viewport center falls back to a visible supported part of the table', () => {
  const { canvas, camera } = scene([5.5, 8, 1], [5.5, 0.18, 0]);
  const position = visibleSpicePosition(canvas, camera)!;
  expect(position).not.toBeNull();
  expect(clampPositionToTable(footprint, position)).toEqual(position);
  const projected = new Vector3(...position).project(camera);
  expect(Math.abs(projected.x)).toBeLessThan(1);
  expect(Math.abs(projected.y)).toBeLessThan(1);
});

test('a camera showing no table offers no invisible placement', () => {
  const { canvas, camera } = scene([30, 8, 1], [30, 0.18, 0]);
  expect(visibleSpicePosition(canvas, camera)).toBeNull();
});

test('screen nudges preserve their distance and refuse destinations beyond the viewport', () => {
  const { canvas, camera } = scene([3, 8, 1], [3, 0.18, 0]);
  const position = visibleSpicePosition(canvas, camera)!;
  const before = new Vector3(...position).project(camera);
  for (const pixels of [4, 20]) {
    const moved = moveSpicePosition(canvas, camera, position, [pixels, 0])!;
    const after = new Vector3(...moved).project(camera);
    expect(((after.x - before.x) * bounds.width) / 2).toBeCloseTo(pixels);
    expect(after.y).toBeCloseTo(before.y);
  }
  expect(moveSpicePosition(canvas, camera, position, [bounds.width, 0])).toBeNull();
  expect(moveSpicePosition(canvas, camera, position, [0, -bounds.height])).toBeNull();
});
