import { CENTER, RADIUS } from '@shared/boards/geometry';
import type { Board } from '@shared/boards/schema';
import { boardTerritories } from '@shared/boards/territories';
import { BOARD_RADIUS } from '@shared/play/tableGeometry';
import { BufferAttribute, BufferGeometry, Color, ShapeUtils, Vector2 } from 'three';

const colors = { sand: '#F6D979', rock: '#A67A3E', stronghold: '#F7BA7A', polar: '#ffffff' };

/** The same sampled rings supply visible triangles and territory lookup; `polarOnly` keeps just the Polar Sink. */
export function authoredBoardGeometry(board: Board, polarOnly = false) {
  const positions: number[] = [],
    normals: number[] = [],
    uv: number[] = [],
    painted: number[] = [];
  for (const face of boardTerritories(board)) {
    if (polarOnly && board.properties[face.key].type !== 'polar') {
      continue;
    }
    const rings = face.rings.map((ring) => ring.slice(0, -1).map(([x, y]) => new Vector2(x, y)));
    const flat = rings.flat();
    const color = new Color(colors[board.properties[face.key].type]);
    for (const triangle of ShapeUtils.triangulateShape(rings[0], rings.slice(1))) {
      const points = triangle.map((index) => flat[index]);
      const [a, b, c] = points;
      if ((b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x) > 0) {
        points.reverse();
      }
      for (const point of points) {
        const x = (point.x - CENTER[0]) / RADIUS,
          z = (point.y - CENTER[1]) / RADIUS;
        positions.push(x * BOARD_RADIUS, 0, z * BOARD_RADIUS);
        normals.push(0, 1, 0);
        uv.push(x / 2 + 0.5, 0.5 - z / 2);
        painted.push(color.r, color.g, color.b);
      }
    }
  }
  const geometry = new BufferGeometry();
  for (const [name, values, size] of [
    ['position', positions, 3],
    ['normal', normals, 3],
    ['uv', uv, 2],
    ['color', painted, 3],
  ] as const) {
    geometry.setAttribute(name, new BufferAttribute(new Float32Array(values), size));
  }
  geometry.computeBoundingSphere();
  return geometry;
}
