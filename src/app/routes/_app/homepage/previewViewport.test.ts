import { PerspectiveCamera, Raycaster, Vector2, Vector3 } from 'three';
import { describe, expect, it } from 'vite-plus/test';

import { applyPreviewViewport, previewViewport } from './previewViewport';

describe('homepage canvas crop', () => {
  it.each([
    [2544, 1204.16, 1440, 568],
    [3392, 1605.55, 2560, 758],
    [1908, 903.12, 1024, 427],
  ])('preserves projection and pointer rays for a %i by %i frame', (width, height, clipWidth, clipHeight) => {
    const frame = { left: (clipWidth - width) / 2, top: -height * 0.157, width, height };
    const clip = { left: 0, top: 0, width: clipWidth, height: clipHeight };
    const viewport = previewViewport(frame, clip)!;
    const original = new PerspectiveCamera(35, width / height, 0.1, 100);
    original.position.set(0, 7, 4);
    original.lookAt(0, 0, 0);
    original.updateMatrixWorld();
    const cropped = original.clone();
    applyPreviewViewport(cropped, viewport);

    for (const point of [new Vector3(), new Vector3(-2, 0, 1), new Vector3(2, 0.2, -1)]) {
      const before = point.clone().project(original);
      const after = point.clone().project(cropped);
      expect(((before.x + 1) * width) / 2 + frame.left).toBeCloseTo(((after.x + 1) * clipWidth) / 2, 8);
      expect(((1 - before.y) * height) / 2 + frame.top).toBeCloseTo(((1 - after.y) * clipHeight) / 2, 8);
    }
    for (const [x, y] of [
      [1, 1],
      [clipWidth - 1, 1],
      [1, clipHeight - 1],
      [clipWidth - 1, clipHeight - 1],
      [clipWidth / 2, clipHeight / 2],
    ]) {
      const before = new Raycaster();
      before.setFromCamera(
        new Vector2(((x - frame.left) / width) * 2 - 1, 1 - ((y - frame.top) / height) * 2),
        original
      );
      const after = new Raycaster();
      after.setFromCamera(new Vector2((x / clipWidth) * 2 - 1, 1 - (y / clipHeight) * 2), cropped);
      expect(before.ray.direction.distanceTo(after.ray.direction)).toBeLessThan(1e-12);
    }
  });

  it('waits for both framing boxes to have a size', () => {
    expect(
      previewViewport({ left: 0, top: 0, width: 0, height: 0 }, { left: 0, top: 0, width: 1440, height: 568 })
    ).toBeNull();
  });
});
