import type { Board, Edge, Point } from './schema';
const lerp = (a: Point, b: Point, t: number): Point => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
export function arcParameters(board: Board, edge: Edge) {
  const a = board.nodes[edge.a],
    b = board.nodes[edge.b];
  let [rx, ry, rotation, large, sweep] = edge.arc!;
  const phi = (rotation * Math.PI) / 180,
    co = Math.cos(phi),
    si = Math.sin(phi);
  const dx = (a[0] - b[0]) / 2,
    dy = (a[1] - b[1]) / 2;
  const px = co * dx + si * dy,
    py = -si * dx + co * dy;
  const ratio = (px * px) / (rx * rx) + (py * py) / (ry * ry);
  if (ratio > 1) {
    rx *= Math.sqrt(ratio);
    ry *= Math.sqrt(ratio);
  }
  const factor =
    (large === sweep ? -1 : 1) *
    Math.sqrt(
      Math.max(0, (rx * rx * ry * ry - rx * rx * py * py - ry * ry * px * px) / (rx * rx * py * py + ry * ry * px * px))
    );
  const cx = (factor * rx * py) / ry,
    cy = (-factor * ry * px) / rx;
  const center: Point = [co * cx - si * cy + (a[0] + b[0]) / 2, si * cx + co * cy + (a[1] + b[1]) / 2];
  const start = Math.atan2((py - cy) / ry, (px - cx) / rx);
  let delta = Math.atan2((-py - cy) / ry, (-px - cx) / rx) - start;
  if (sweep && delta < 0) {
    delta += Math.PI * 2;
  }
  if (!sweep && delta > 0) {
    delta -= Math.PI * 2;
  }
  return { rx, ry, co, si, center, start, delta };
}
export function at(board: Board, edge: Edge, t: number): Point {
  const a = board.nodes[edge.a],
    b = board.nodes[edge.b];
  if (t === 0) {
    return a;
  }
  if (t === 1) {
    return b;
  }
  if (edge.kind === 'arc') {
    const p = arcParameters(board, edge),
      angle = p.start + p.delta * t;
    const x = p.rx * Math.cos(angle),
      y = p.ry * Math.sin(angle);
    return [p.center[0] + p.co * x - p.si * y, p.center[1] + p.si * x + p.co * y];
  }
  if (edge.kind === 'cubic') {
    const u = 1 - t;
    return [0, 1].map(
      (i) => u ** 3 * a[i] + 3 * u * u * t * edge.c1![i] + 3 * u * t * t * edge.c2![i] + t ** 3 * b[i]
    ) as Point;
  }
  return lerp(a, b, t);
}
