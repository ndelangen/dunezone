// @vitest-environment jsdom
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it, vi } from 'vitest';

import { boardMapGeometry } from './boardMapGeometry';

const svg = readFileSync(join(import.meta.dirname, 'assets/arrakis-map.svg'), 'utf8');

describe('boardMapGeometry', () => {
  const geometry = boardMapGeometry(svg, 4.25);
  const positions = geometry.getAttribute('position');

  it('loads the map without deprecated SVG conversion warnings', () => {
    const warning = vi.spyOn(console, 'warn').mockImplementation(() => {});
    try {
      boardMapGeometry(svg, 4.25).dispose();
      expect(
        warning.mock.calls.flat().filter((message) => String(message).includes('SVGLoader: createShapes()'))
      ).toEqual([]);
    } finally {
      warning.mockRestore();
    }
  });

  it('lays every shape flat on the board, within its radius', () => {
    expect(positions.count).toBeGreaterThan(1000);
    for (let index = 0; index < positions.count; index++) {
      expect(positions.getY(index)).toBe(0);
      expect(Math.hypot(positions.getX(index), positions.getZ(index))).toBeLessThan(4.251);
    }
  });

  it('turns every triangle to face up', () => {
    for (let index = 0; index < positions.count; index += 3) {
      const [ax, az, bx, bz, cx, cz] = [0, 1, 2].flatMap((corner) => [
        positions.getX(index + corner),
        positions.getZ(index + corner),
      ]);
      const upward = (bz - az) * (cx - ax) - (bx - ax) * (cz - az);
      expect(upward).toBeGreaterThan(-1e-6);
    }
  });

  it('dashes the sector lines', () => {
    const colors = geometry.getAttribute('color');
    const alphas = new Set(Array.from({ length: colors.count }, (_, index) => colors.getW(index).toFixed(2)));
    expect(alphas).toContain('0.30');
  });
});
