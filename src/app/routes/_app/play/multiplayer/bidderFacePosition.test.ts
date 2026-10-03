import { Object3D } from 'three';
import { describe, expect, test } from 'vitest';

import { cameraPoseFor, tableCamera } from '../playView';
import { faceOnCanvas } from './bidderFacePosition';

const centre = new Object3D();
centre.updateMatrixWorld();

describe("the bidder's face", () => {
  test('sits over the board centre when the view frames it', () => {
    const size = { width: 1600, height: 900 };
    const [x, y] = faceOnCanvas(centre, tableCamera(cameraPoseFor('map', 16 / 9), 16 / 9), size);
    expect(x).toBeCloseTo(800);
    expect(y).toBeGreaterThan(72);
    expect(y).toBeLessThan(828);
  });

  test("stays on the canvas in the Bidding phase's side view on a narrow window", () => {
    const size = { width: 900, height: 1200 };
    const [x, y] = faceOnCanvas(centre, tableCamera(cameraPoseFor('left', 0.75), 0.75), size);
    expect(x).toBe(900 - 72);
    expect(y).toBeGreaterThanOrEqual(72);
    expect(y).toBeLessThanOrEqual(1200 - 72);
  });
});
