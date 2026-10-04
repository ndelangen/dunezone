import { Object3D } from 'three';
import { describe, expect, test } from 'vitest';

import { cameraPoseFor, tableCamera } from '../playView';
import { faceHalfHeight, faceHalfWidth, faceOnCanvas, PICKS_PER_LINE } from './bidderFacePosition';

const centre = new Object3D();
centre.updateMatrixWorld();

describe("the bidder's face", () => {
  test('sits over the board centre when the view frames it', () => {
    const size = { width: 1600, height: 900 };
    const [x, y] = faceOnCanvas(faceHalfWidth(null))(centre, tableCamera(cameraPoseFor('map', 16 / 9), 16 / 9), size);
    expect(x).toBeCloseTo(800);
    expect(y).toBeGreaterThan(96);
    expect(y).toBeLessThan(804);
  });

  test("stays on the canvas in the Bidding phase's side view on a narrow window", () => {
    const size = { width: 900, height: 1200 };
    const [x, y] = faceOnCanvas(faceHalfWidth(null))(centre, tableCamera(cameraPoseFor('left', 0.75), 0.75), size);
    expect(x).toBe(900 - 72);
    expect(y).toBeGreaterThanOrEqual(96);
    expect(y).toBeLessThanOrEqual(1200 - 96);
  });

  test('keeps the whole start-at row on the canvas, however many factions it holds', () => {
    const size = { width: 600, height: 700 };
    for (const factions of [2, 6, 10, 18]) {
      const perLine = Math.min(factions, PICKS_PER_LINE);
      const row = perLine * 36 + (perLine - 1) * 4;
      const lines = Math.ceil(factions / PICKS_PER_LINE);
      const [x, y] = faceOnCanvas(faceHalfWidth(factions), faceHalfHeight(factions))(
        centre,
        tableCamera(cameraPoseFor('left', 600 / 700), 600 / 700),
        size
      );
      expect(x + row / 2).toBeLessThanOrEqual(size.width);
      expect(x - row / 2).toBeGreaterThanOrEqual(0);
      expect(y + 96 + ((lines - 1) * 40) / 2).toBeLessThanOrEqual(size.height);
    }
  });
});
