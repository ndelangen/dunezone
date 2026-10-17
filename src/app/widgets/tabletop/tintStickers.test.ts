// @vitest-environment jsdom
import { ShapeGeometry } from 'three';
import { SVGLoader } from 'three/examples/jsm/loaders/SVGLoader.js';
import { describe, expect, it } from 'vitest';

import { TINT_STICKERS } from './tintStickers';

describe('the Block sticker', () => {
  it('keeps the gap through its rings and stays inside its circle once loaded for the board', () => {
    const geometry = new ShapeGeometry(
      new SVGLoader().parse(TINT_STICKERS.block.svg).paths.flatMap((path) => path.toShapes())
    );
    const position = geometry.getAttribute('position');
    const index = geometry.getIndex()!;
    for (let i = 0; i < index.count; i += 3) {
      const corners = [0, 1, 2].map((k) => index.getX(i + k));
      const x = corners.reduce((sum, c) => sum + position.getX(c), 0) / 3;
      const y = corners.reduce((sum, c) => sum + position.getY(c), 0) / 3;
      expect(y < 47 || y > 56).toBe(true);
      expect(Math.hypot(x - 50, y - 51.5)).toBeLessThan(50);
    }
  });
});
