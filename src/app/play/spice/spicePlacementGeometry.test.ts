import { createSpiceStack } from '@shared/play/spiceBank';
import { clampPositionToTable } from '@shared/play/tablePhysics';
// @vitest-environment jsdom
import { PerspectiveCamera, Vector3 } from 'three';
import { afterEach, expect, test, vi } from 'vite-plus/test';

import { moveSpicePosition, spicePreviewIsClear, visibleSpicePosition } from './spicePlacementGeometry';

const bounds = new DOMRect(30, 50, 1000, 700);
const footprint = createSpiceStack(0, 1);
const preview = { width: 64, height: 64 };
afterEach(() => {
  document.body.replaceChildren();
  vi.restoreAllMocks();
});

function panel(rect: DOMRect) {
  const element = document.createElement('div');
  element.dataset.hidesCursor = '';
  vi.spyOn(element, 'getBoundingClientRect').mockReturnValue(rect);
  vi.spyOn(element, 'getClientRects').mockReturnValue([rect] as unknown as DOMRectList);
  document.body.append(element);
  return element;
}
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
  const position = visibleSpicePosition(canvas, camera, preview)!;
  expect(position).not.toBeNull();
  expect(clampPositionToTable(footprint, position)).toEqual(position);
  const projected = new Vector3(...position).project(camera);
  expect(Math.abs(projected.x)).toBeLessThan(0.8);
  expect(Math.abs(projected.y)).toBeLessThan(0.8);
  const next = moveSpicePosition(canvas, camera, position, [20, 0], preview)!;
  expect(clampPositionToTable(footprint, next)).toEqual(next);
  expect(next).not.toEqual(position);
});

test('an unsupported viewport center falls back to a visible supported part of the table', () => {
  const { canvas, camera } = scene([5.5, 8, 1], [5.5, 0.18, 0]);
  const position = visibleSpicePosition(canvas, camera, preview)!;
  expect(position).not.toBeNull();
  expect(clampPositionToTable(footprint, position)).toEqual(position);
  const projected = new Vector3(...position).project(camera);
  expect(Math.abs(projected.x)).toBeLessThan(1);
  expect(Math.abs(projected.y)).toBeLessThan(1);
});

test('a camera showing no table offers no invisible placement', () => {
  const { canvas, camera } = scene([30, 8, 1], [30, 0.18, 0]);
  expect(visibleSpicePosition(canvas, camera, preview)).toBeNull();
});

test('screen nudges preserve their distance and refuse destinations beyond the viewport', () => {
  const { canvas, camera } = scene([3, 8, 1], [3, 0.18, 0]);
  const position = visibleSpicePosition(canvas, camera, preview)!;
  const before = new Vector3(...position).project(camera);
  for (const pixels of [4, 20]) {
    const moved = moveSpicePosition(canvas, camera, position, [pixels, 0], preview)!;
    const after = new Vector3(...moved).project(camera);
    expect(((after.x - before.x) * bounds.width) / 2).toBeCloseTo(pixels);
    expect(after.y).toBeCloseTo(before.y);
  }
  expect(moveSpicePosition(canvas, camera, position, [bounds.width, 0], preview)).toBeNull();
  expect(moveSpicePosition(canvas, camera, position, [0, -bounds.height], preview)).toBeNull();
});

test('initial placement avoids the centered hand window and movement cannot enter it', () => {
  const { canvas, camera } = scene([3, 8, 1], [3, 0.18, 0]);
  panel(new DOMRect(bounds.left + 350, bounds.top + 250, 300, 400));
  const position = visibleSpicePosition(canvas, camera, preview)!;
  expect(position).not.toBeNull();
  expect(spicePreviewIsClear(canvas, camera, position, preview)).toBe(true);
  const projected = new Vector3(...position).project(camera);
  const downToCenter = (projected.y * bounds.height) / 2;
  expect(moveSpicePosition(canvas, camera, position, [0, downToCenter], preview)).toBeNull();
});

test('the whole token must clear a panel even when its center is uncovered', () => {
  const { canvas, camera } = scene([3, 8, 1], [3, 0.18, 0]);
  panel(new DOMRect(bounds.left + bounds.width / 2 + 28, bounds.top + bounds.height / 2 - 20, 200, 100));
  expect(spicePreviewIsClear(canvas, camera, [3, 0.18, 0], preview)).toBe(false);
});

test('the compact preview needs no space for an instruction callout', () => {
  const { canvas, camera } = scene([3, 8, 1], [3, 0.18, 0]);
  panel(new DOMRect(bounds.left + 300, bounds.top + 220, 400, 95));
  panel(new DOMRect(bounds.left + 300, bounds.top + 385, 400, 100));
  expect(spicePreviewIsClear(canvas, camera, [3, 0.18, 0], preview)).toBe(true);
});

test('a narrow canvas fits the compact preview and ignores hidden panels', () => {
  const { canvas, camera } = scene([3, 8, 1], [3, 0.18, 0]);
  const narrow = new DOMRect(30, 50, 80, 700);
  vi.mocked(canvas.getBoundingClientRect).mockReturnValue(narrow);
  camera.aspect = narrow.width / narrow.height;
  camera.updateProjectionMatrix();
  panel(narrow).hidden = true;
  const position = visibleSpicePosition(canvas, camera, preview)!;
  expect(position).not.toBeNull();
  expect(spicePreviewIsClear(canvas, camera, position, preview)).toBe(true);
});
