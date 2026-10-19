import { CENTER, RADIUS } from '@shared/boards/geometry';
import { BOARD_RADIUS } from '@shared/play/tableGeometry';
import { Color } from 'three';
import { describe, expect, it } from 'vite-plus/test';

import { authoredBoardGeometry } from './authoredBoardGeometry';
import { curvedBoard } from './curvedBoard.fixture';

const board = curvedBoard().definition;
const geometry = authoredBoardGeometry(board);
const positions = geometry.getAttribute('position');
const colors = geometry.getAttribute('color');

/* Each triangle's corners on the table's floor, as [x, z] pairs, with the colour its first corner was painted. */
function triangles() {
  return Array.from({ length: positions.count / 3 }, (_, triangle) => {
    const index = triangle * 3;
    return {
      corners: [0, 1, 2].map((corner) => [positions.getX(index + corner), positions.getZ(index + corner)] as const),
      color: [colors.getX(index), colors.getY(index), colors.getZ(index)],
    };
  });
}

function contains(corners: readonly (readonly [number, number])[], [x, z]: readonly [number, number]) {
  const signs = corners.map(([ax, az], index) => {
    const [bx, bz] = corners[(index + 1) % 3]!;
    return Math.sign((bx - ax) * (z - az) - (bz - az) * (x - ax));
  });
  return signs.every((sign) => sign >= 0) || signs.every((sign) => sign <= 0);
}

describe('authoredBoardGeometry', () => {
  it('lays every triangle of the cubic and arc edges flat and facing up', () => {
    expect(positions.count).toBeGreaterThan(0);
    expect(positions.count % 3).toBe(0);
    for (const { corners } of triangles()) {
      const [[ax, az], [bx, bz], [cx, cz]] = corners as [[number, number], [number, number], [number, number]];
      expect((bz - az) * (cx - ax) - (bx - ax) * (cz - az)).toBeGreaterThan(-1e-6);
    }
    for (let index = 0; index < positions.count; index++) {
      expect(positions.getY(index)).toBe(0);
    }
  });

  it('cuts the island out of the territory around it, so only the stronghold covers its centre', () => {
    const [ilx, ily] = board.nodes.il!;
    const [irx, iry] = board.nodes.ir!;
    const centre = [
      (((ilx + irx) / 2 - CENTER[0]) / RADIUS) * BOARD_RADIUS,
      (((ily + iry) / 2 - CENTER[1]) / RADIUS) * BOARD_RADIUS,
    ] as const;
    const covering = triangles().filter(({ corners }) => contains(corners, centre));
    const stronghold = new Color('#F7BA7A');
    expect(covering.length).toBeGreaterThan(0);
    for (const { color } of covering) {
      expect(color.map((channel) => channel.toFixed(4))).toEqual(
        [stronghold.r, stronghold.g, stronghold.b].map((channel) => channel.toFixed(4))
      );
    }
  });

  it('keeps no triangles for a polar-only build of a board without a Polar Sink', () => {
    expect(Object.values(board.properties).some((property) => property.type === 'polar')).toBe(false);
    expect(authoredBoardGeometry(board, true).getAttribute('position').count).toBe(0);
  });
});
