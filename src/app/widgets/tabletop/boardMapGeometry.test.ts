// @vitest-environment jsdom
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it, vi } from 'vite-plus/test';

import { boardMapGeometry } from './boardMapGeometry';

const svg = readFileSync(join(import.meta.dirname, 'assets/arrakis-map.svg'), 'utf8');

describe('boardMapGeometry', () => {
  /* The first build is the one that parses the map, so it is the one watched for warnings. */
  const warning = vi.spyOn(console, 'warn').mockImplementation(() => {});
  const geometry = boardMapGeometry(svg, 4.25);
  const warnings = warning.mock.calls.flat();
  warning.mockRestore();
  const positions = geometry.getAttribute('position');

  it('loads the map without deprecated SVG conversion warnings', () => {
    expect(warnings.filter((message) => String(message).includes('SVGLoader: createShapes()'))).toEqual([]);
  });

  it('parses the map once, and gives each caller geometry of its own to dispose', () => {
    const again = boardMapGeometry(svg, 4.25);
    const position = again.getAttribute('position');
    /* Identity checks as booleans: a failing `toBe` would diff tens of thousands of vertices. */
    expect([again === geometry, position === positions, position.array === positions.array]).toEqual([
      false,
      false,
      true,
    ]);
    again.dispose();
    expect(geometry.getAttribute('position') === positions).toBe(true);
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

  it('draws only the Polar Sink, near the centre, when asked for its group', () => {
    const polar = boardMapGeometry(svg, 4.25, 'polar').getAttribute('position');
    expect(polar.count).toBeGreaterThan(0);
    expect(polar.count).toBeLessThan(positions.count / 10);
    for (let index = 0; index < polar.count; index++) {
      expect(Math.hypot(polar.getX(index), polar.getZ(index))).toBeLessThan(1.2);
    }
  });
});
