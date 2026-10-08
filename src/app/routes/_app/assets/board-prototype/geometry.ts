import InteriorPointArea from 'jsts/org/locationtech/jts/algorithm/InteriorPointArea.js';
import Coordinate from 'jsts/org/locationtech/jts/geom/Coordinate.js';
import GeometryFactory from 'jsts/org/locationtech/jts/geom/GeometryFactory.js';
import type Polygon from 'jsts/org/locationtech/jts/geom/Polygon.js';
import BufferOp from 'jsts/org/locationtech/jts/operation/buffer/BufferOp.js';
import Polygonizer from 'jsts/org/locationtech/jts/operation/polygonize/Polygonizer.js';
import UnaryUnionOp from 'jsts/org/locationtech/jts/operation/union/UnaryUnionOp.js';

import arrakis from './arrakis.fixture.json';

export type Point = [number, number];
export type Edge = {
  id: string;
  a: string;
  b: string;
  kind: 'line' | 'cubic' | 'arc';
  c1?: Point;
  c2?: Point;
  arc?: number[];
  strokeWidth?: number;
};
export type Decal = {
  id: string;
  artwork: string;
  x: number;
  y: number;
  scale: number;
  rotation: number;
  outline: boolean;
};
export type ContourAnchor = { edge: string; t: number; offset: Point };
export type AppearanceContour = {
  role: 'band' | 'inset';
  segments: { kind: string; values: (number | ContourAnchor)[] }[];
  fill: string;
  stroke: string;
  strokeWidth: number;
  strokeLinecap: 'round' | 'square' | 'butt';
  strokeLinejoin: 'round' | 'bevel' | 'miter';
  strokeDasharray?: string;
  strokeDashoffset?: string;
};
export type Properties = {
  name: string;
  type: 'sand' | 'rock' | 'stronghold' | 'polar';
  insetLine: 'none' | 'solid' | 'dashed';
  decals: Decal[];
  appearance?: AppearanceContour[];
  paintOrder?: number;
  border?: { width: number; linecap: 'round' | 'square' | 'butt'; linejoin: 'round' | 'bevel' | 'miter' };
};
export type Board = {
  nodes: Record<string, Point>;
  edges: Edge[];
  properties: Record<string, Properties>;
  fixture: string;
};
export type Face = {
  key: string;
  path: string;
  inset: string;
  rings: Point[][];
  center: Point;
  edges: string[];
  area: number;
  polygon: Polygon;
};
type Sample = { a: Point; b: Point; edge: Edge; t0: number; t1: number };
const factory = new GeometryFactory();
export const commonArtwork = {
  city: '../../../../../../media/vector/icon/city.svg',
  sietch: '../../../../../../media/vector/icon/seitch.svg',
  ornithopter: '../../../../../../media/vector/icon/ornithopter.svg',
  arrakisCity: '../../../../../../media/vector/icon/arrakis-city.svg',
  arrakisSietch: '../../../../../../media/vector/icon/arrakis-sietch.svg',
};
export const CENTER: Point = [243.53, 243.53];
export const RADIUS = 240;
const round = (n: number) => Number(n.toFixed(6));
const xy = (p: Point) => `${round(p[0])} ${round(p[1])}`;
export const distance = (a: Point, b: Point) => Math.hypot(a[0] - b[0], a[1] - b[1]);
const lerp = (a: Point, b: Point, t: number): Point => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];

export function boundPoint(point: Point): Point {
  const radius = distance(point, CENTER);
  return radius > RADIUS ? lerp(CENTER, point, RADIUS / radius) : point;
}

export function movePoint(board: Board, node: string, input: Point): Board {
  const attached = board.edges.filter((edge) => edge.a === node || edge.b === node);
  /* The recovered reference uses approximate ellipses; its outer boundary stays fixed. */
  if (
    (board.fixture === 'Arrakis recreation' && distance(board.nodes[node], CENTER) > RADIUS - 1) ||
    attached.some((edge) => edge.kind === 'arc' && edge.arc![0] > 200 && !edge.id.startsWith('rim'))
  ) {
    return board;
  }
  const rim = attached.filter((edge) => edge.id.startsWith('rim'));
  let point = boundPoint(input);
  let edges = board.edges;
  if (rim.length) {
    const tau = Math.PI * 2;
    const angle = (p: Point) => Math.atan2(p[1] - CENTER[1], p[0] - CENTER[0]);
    const positive = (value: number) => ((value % tau) + tau) % tau;
    const current = angle(board.nodes[node]);
    let lower = -Math.PI * 2,
      upper = Math.PI * 2;
    for (const edge of rim) {
      const other = board.nodes[edge.a === node ? edge.b : edge.a];
      const clockwise = edge.a === node ? edge.arc![4] === 1 : edge.arc![4] === 0;
      if (clockwise) {
        upper = Math.min(upper, positive(angle(other) - current));
      } else {
        lower = Math.max(lower, -positive(current - angle(other)));
      }
    }
    const desired = distance(input, CENTER) < 1e-6 ? 0 : positive(angle(input) - current + Math.PI) - Math.PI;
    const next = current + Math.max(lower + 1e-5, Math.min(upper - 1e-5, desired));
    point = [CENTER[0] + RADIUS * Math.cos(next), CENTER[1] + RADIUS * Math.sin(next)];
    edges = board.edges.map((edge) => {
      if (!rim.includes(edge)) {
        return edge;
      }
      const a = edge.a === node ? point : board.nodes[edge.a];
      const b = edge.b === node ? point : board.nodes[edge.b];
      const delta = positive(edge.arc![4] === 1 ? angle(b) - angle(a) : angle(a) - angle(b));
      return { ...edge, arc: [RADIUS, RADIUS, 0, delta > Math.PI ? 1 : 0, edge.arc![4]] };
    });
  }
  return { ...board, nodes: { ...board.nodes, [node]: point }, edges };
}

/* Native SVG arcs remain arcs in artwork; chords are used only for the disposable face graph. */
function arcParameters(board: Board, edge: Edge) {
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
function derivative(board: Board, edge: Edge, t: number): Point {
  const a = board.nodes[edge.a],
    b = board.nodes[edge.b];
  return [0, 1].map(
    (i) =>
      3 * (1 - t) ** 2 * (edge.c1![i] - a[i]) +
      6 * (1 - t) * t * (edge.c2![i] - edge.c1![i]) +
      3 * t * t * (b[i] - edge.c2![i])
  ) as Point;
}
function command(board: Board, edge: Edge, t0: number, t1: number) {
  const end = at(board, edge, t1);
  if (edge.kind === 'arc') {
    const p = arcParameters(board, edge);
    return `A${p.rx} ${p.ry} ${edge.arc![2]} ${Math.abs(p.delta * (t1 - t0)) > Math.PI ? 1 : 0} ${t1 > t0 === Boolean(edge.arc![4]) ? 1 : 0} ${xy(end)}`;
  }
  if (edge.kind === 'cubic') {
    const start = at(board, edge, t0),
      d0 = derivative(board, edge, t0),
      d1 = derivative(board, edge, t1),
      dt = (t1 - t0) / 3;
    return `C${xy([start[0] + d0[0] * dt, start[1] + d0[1] * dt])} ${xy([end[0] - d1[0] * dt, end[1] - d1[1] * dt])} ${xy(end)}`;
  }
  return `L${xy(end)}`;
}
export function edgePath(board: Board, edge: Edge) {
  return `M${xy(board.nodes[edge.a])}${command(board, edge, 0, 1)}`;
}
function project(point: Point, a: Point, b: Point) {
  const dx = b[0] - a[0],
    dy = b[1] - a[1];
  const t = Math.max(0, Math.min(1, ((point[0] - a[0]) * dx + (point[1] - a[1]) * dy) / (dx * dx + dy * dy)));
  return { t, distance: distance(point, lerp(a, b, t)) };
}
export function contains(rings: Point[][], p: Point) {
  let inside = false;
  for (const ring of rings) {
    for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
      const a = ring[i],
        b = ring[j];
      if (a[1] > p[1] !== b[1] > p[1] && p[0] < ((b[0] - a[0]) * (p[1] - a[1])) / (b[1] - a[1]) + a[0]) {
        inside = !inside;
      }
    }
  }
  return inside;
}
function polygonRings(polygon: Polygon): Point[][] {
  const rings = [polygon.getExteriorRing()];
  for (let i = 0; i < polygon.getNumInteriorRing(); i++) {
    rings.push(polygon.getInteriorRingN(i));
  }
  return rings.map((ring) => ring.getCoordinates().map((p: Coordinate) => [p.x, p.y] as Point));
}
const straightPath = (rings: Point[][]) => rings.map((ring) => `M${ring.map(xy).join('L')}Z`).join('');

export function derive(board: Board) {
  const started = performance.now();
  const samples: Sample[] = [];
  const lines = board.edges.map((edge) => {
    const count =
      edge.kind === 'line'
        ? 1
        : edge.kind === 'arc'
          ? Math.ceil(Math.abs(arcParameters(board, edge).delta) / (Math.PI / 360))
          : 128;
    const points = Array.from({ length: count + 1 }, (_, i) => at(board, edge, i / count));
    for (let i = 0; i < count; i++) {
      samples.push({ a: points[i], b: points[i + 1], edge, t0: i / count, t1: (i + 1) / count });
    }
    return factory.createLineString(points.map((p) => new Coordinate(p[0], p[1])));
  });
  const polygonizer = new Polygonizer();
  const linework = factory.createMultiLineString(lines);
  polygonizer.add(UnaryUnionOp.union(linework));
  const polygons = polygonizer.getPolygons().toArray() as Polygon[];
  let unrecoveredSegments = 0;
  const faces: Face[] = polygons
    .map((polygon) => {
      const rings = polygonRings(polygon);
      const owners = new Set<string>();
      const path = rings
        .map((ring) => {
          const failuresBeforeRing = unrecoveredSegments;
          const intervals: { edge: Edge; t0: number; t1: number; a: Point; b: Point }[] = [];
          for (let i = 0; i < ring.length - 1; i++) {
            const a = ring[i],
              b = ring[i + 1];
            let best: { sample: Sample; ta: number; tb: number; score: number } | undefined;
            for (const sample of samples) {
              const pa = project(a, sample.a, sample.b),
                pb = project(b, sample.a, sample.b);
              const score = pa.distance + pb.distance;
              if (!best || score < best.score) {
                best = { sample, ta: pa.t, tb: pb.t, score };
              }
              if (score < 1e-8) {
                break;
              }
            }
            if (!best || best.score > 0.02) {
              unrecoveredSegments++;
              continue;
            }
            const { sample, ta, tb } = best;
            owners.add(sample.edge.id);
            const t0 = sample.t0 + ta * (sample.t1 - sample.t0),
              t1 = sample.t0 + tb * (sample.t1 - sample.t0);
            const previous = intervals.at(-1);
            if (previous?.edge.id === sample.edge.id && Math.abs(previous.t1 - t0) < 1e-5) {
              previous.t1 = t1;
              previous.b = b;
            } else {
              intervals.push({ edge: sample.edge, t0, t1, a, b });
            }
          }
          if (intervals.length === 0 || unrecoveredSegments !== failuresBeforeRing) {
            return straightPath([ring]);
          }
          return (
            `M${xy(at(board, intervals[0].edge, intervals[0].t0))}` +
            intervals.map((v) => command(board, v.edge, v.t0, v.t1)).join('') +
            'Z'
          );
        })
        .join('');
      const edgeIds = [...owners].sort();
      const point = InteriorPointArea.getInteriorPoint(polygon) as Coordinate;
      const buffer = BufferOp.bufferOp(polygon, -2.8);
      let inset = '';
      for (let i = 0; i < buffer.getNumGeometries(); i++) {
        const p = buffer.getGeometryN(i) as Polygon;
        if (!p.isEmpty()) {
          inset += straightPath(polygonRings(p));
        }
      }
      return {
        key: edgeIds.join('|'),
        edges: edgeIds,
        path,
        rings,
        inset,
        area: polygon.getArea(),
        center: [point.x, point.y] as Point,
        polygon,
      };
    })
    .sort((a, b) => a.key.localeCompare(b.key));
  return {
    faces,
    milliseconds: performance.now() - started,
    samples: samples.length,
    dangles: polygonizer.getDangles().size(),
    unrecoveredSegments,
  };
}
export function contourPath(board: Board, contour: AppearanceContour): string | null {
  const edges = new Map(board.edges.map((edge) => [edge.id, edge]));
  if (
    contour.segments.some((segment) =>
      segment.values.some((value) => typeof value !== 'number' && !edges.has(value.edge))
    )
  ) {
    return null;
  }
  return contour.segments
    .map(
      (segment) =>
        segment.kind +
        segment.values
          .map((value) => {
            if (typeof value === 'number') {
              return value;
            }
            const origin = at(board, edges.get(value.edge)!, value.t);
            return xy([origin[0] + value.offset[0], origin[1] + value.offset[1]]);
          })
          .join(' ')
    )
    .join('');
}

export function defaults(name: string, type: Properties['type'] = 'sand'): Properties {
  return { name, type, insetLine: type === 'stronghold' ? 'dashed' : type === 'sand' ? 'none' : 'solid', decals: [] };
}
export function reconcile(board: Board, previous: Board, oldFaces: Face[], faces: Face[]): Board {
  const properties: Board['properties'] = {};
  const used = new Set<string>();
  for (const face of faces) {
    const same = previous.properties[face.key];
    const candidates = oldFaces
      .filter((old) => contains(old.rings, face.center) || contains(face.rings, old.center))
      .sort((a, b) => a.key.localeCompare(b.key));
    const value = same || (candidates[0] && previous.properties[candidates[0].key]);
    let name = value?.name || 'territory-1';
    const base = name;
    for (let suffix = 2; used.has(name); suffix++) {
      name = `${base}-${suffix}`;
    }
    used.add(name);
    properties[face.key] = value ? { ...value, name } : defaults(name);
  }
  return { ...board, properties };
}
export function arrakisBoard(): Board {
  return structuredClone(arrakis.board) as unknown as Board;
}
export function studyBoard(): Board {
  const nodes: Board['nodes'] = {
    e: [483.53, 243.53],
    s: [243.53, 483.53],
    w: [3.53, 243.53],
    n: [243.53, 3.53],
    bend: [290, 160],
    join: [300, 295],
    a: [340, 130],
    b: [383, 145],
    c: [377, 190],
    d: [331, 175],
    p1: [215, 218],
    p2: [266, 213],
    p3: [279, 253],
    p4: [234, 275],
    loose: [385, 300],
    tip: [410, 337],
  };
  const edges: Edge[] = [
    ['e', 's'],
    ['s', 'w'],
    ['w', 'n'],
    ['n', 'e'],
  ].map(([a, b], i) => ({ id: `rim-${i}`, a, b, kind: 'arc', arc: [RADIUS, RADIUS, 0, 0, 1] }));
  const line = (a: string, b: string, id = `${a}-${b}`) => edges.push({ id, a, b, kind: 'line' });
  line('n', 'bend');
  line('bend', 'join');
  edges.push({ id: 'shared-curve', a: 'join', b: 's', kind: 'cubic', c1: [370, 330], c2: [210, 408] });
  line('w', 'join');
  for (const loop of [
    ['a', 'b', 'c', 'd'],
    ['p1', 'p2', 'p3', 'p4'],
  ]) {
    loop.forEach((p, i) => line(p, loop[(i + 1) % loop.length]));
  }
  line('loose', 'tip', 'unfinished-cut');
  const board: Board = { nodes, edges, properties: {}, fixture: 'Interaction study' };
  const faces = derive(board).faces;
  faces.forEach(
    (face, i) =>
      (board.properties[face.key] = defaults(
        `territory-${i + 1}`,
        face.edges.includes('a-b') && face.area < 5000
          ? 'stronghold'
          : face.edges.includes('p1-p2') && face.area < 5000
            ? 'polar'
            : i === 2
              ? 'rock'
              : 'sand'
      ))
  );
  const stronghold = faces.find((f) => board.properties[f.key].type === 'stronghold')!;
  board.properties[stronghold.key].decals = [
    { id: 'oversized', artwork: commonArtwork.city, x: 365, y: 155, scale: 100, rotation: 24, outline: true },
    { id: 'ornithopter', artwork: commonArtwork.ornithopter, x: 353, y: 178, scale: 30, rotation: -12, outline: true },
  ];
  return board;
}

function nearestBoundary(board: Board, point: Point) {
  let closest: { edge: Edge; t: number; point: Point; distance: number } | undefined;
  for (const edge of board.edges) {
    const count = edge.kind === 'line' ? 1 : 128;
    for (let i = 0; i < count; i++) {
      const a = at(board, edge, i / count),
        b = at(board, edge, (i + 1) / count);
      const p = project(point, a, b),
        t = (i + p.t) / count;
      if (t < 0.001 || t > 0.999) {
        continue;
      }
      if (!closest || p.distance < closest.distance) {
        closest = { edge, t, point: at(board, edge, t), distance: p.distance };
      }
    }
  }
  return closest;
}
export function snapPoint(
  board: Board,
  point: Point,
  enabled: boolean,
  radius = 12,
  excludeNode?: string
): { point: Point; node?: string; feedback: string } {
  const nearby = Object.entries(board.nodes)
    .filter(([node]) => node !== excludeNode)
    .map(([node, p]) => ({ node, p, d: distance(p, point) }))
    .sort((a, b) => a.d - b.d)[0];
  if (nearby && nearby.d < (enabled ? radius : 0.5)) {
    return { point: nearby.p, node: nearby.node, feedback: 'Snapped to boundary point' };
  }
  if (!enabled) {
    return { point, feedback: 'Free point' };
  }
  /* A dragged point never attracts itself or the edges attached to it. */
  const boundary = nearestBoundary(
    excludeNode
      ? {
          ...board,
          edges: board.edges.filter((e) => e.a !== excludeNode && e.b !== excludeNode),
        }
      : board,
    point
  );
  if (boundary && boundary.distance < radius && !boundary.edge.id.startsWith('rim')) {
    return { point: boundary.point, feedback: 'Snapped to shared boundary' };
  }
  const sector = arrakis.sectorLines
    .map(([a, b]) => ({ a: a as Point, b: b as Point, ...project(point, a as Point, b as Point) }))
    .sort((a, b) => a.distance - b.distance)[0];
  let next = point,
    feedback = 'Free point';
  if (sector && sector.distance < radius) {
    next = lerp(sector.a, sector.b, sector.t);
    feedback = 'Snapped to sector guide';
  }
  if (Math.abs(distance(next, CENTER) - RADIUS) < radius) {
    if (feedback === 'Snapped to sector guide') {
      const dx = sector.b[0] - sector.a[0],
        dy = sector.b[1] - sector.a[1];
      const x = sector.a[0] - CENTER[0],
        y = sector.a[1] - CENTER[1];
      const a = dx * dx + dy * dy,
        b = 2 * (x * dx + y * dy),
        c = x * x + y * y - RADIUS * RADIUS;
      const root = Math.sqrt(b * b - 4 * a * c);
      next =
        [(-b + root) / (2 * a), (-b - root) / (2 * a)]
          .filter((t) => t >= 0 && t <= 1)
          .map((t) => lerp(sector.a, sector.b, t))
          .sort((a, b) => distance(a, next) - distance(b, next))[0] || next;
    } else {
      const theta = Math.atan2(next[1] - CENTER[1], next[0] - CENTER[0]);
      next = [CENTER[0] + RADIUS * Math.cos(theta), CENTER[1] + RADIUS * Math.sin(theta)];
    }
    feedback = feedback === 'Free point' ? 'Snapped to circle boundary' : feedback + ' · Circle boundary';
  }
  return { point: next, feedback };
}
export const referenceSectors = arrakis.sectors;
export const referenceAdjustment = arrakis.greatestAdjustment;

export function connectPoint(
  board: Board,
  input: Point,
  snapping: boolean,
  radius = 12,
  targetEdge?: string
): { board: Board; node: string; point: Point; feedback: string } {
  const snapped = snapPoint(board, boundPoint(input), snapping, radius);
  if (snapped.node && !targetEdge) {
    return { board, node: snapped.node, point: snapped.point, feedback: snapped.feedback };
  }
  const closest = nearestBoundary(
    targetEdge ? { ...board, edges: board.edges.filter((e) => e.id === targetEdge) } : board,
    snapped.point
  );
  const connects = closest && (targetEdge || closest.distance < (snapping ? radius : 0.5));
  const point = boundPoint(connects ? closest.point : snapped.point);
  const node = `point-${crypto.randomUUID()}`;
  const nodes = { ...board.nodes, [node]: point };
  let edges = board.edges;
  let properties = board.properties;
  if (connects) {
    const { edge, t } = closest;
    const first: Edge = { ...edge, id: `${edge.id}:a`, b: node },
      second: Edge = { ...edge, id: `${edge.id}:b`, a: node };
    if (edge.kind === 'cubic') {
      const a = board.nodes[edge.a],
        b = board.nodes[edge.b],
        d = derivative(board, edge, t);
      first.c1 = lerp(a, edge.c1!, t);
      first.c2 = [point[0] - (d[0] * t) / 3, point[1] - (d[1] * t) / 3];
      second.c1 = [point[0] + (d[0] * (1 - t)) / 3, point[1] + (d[1] * (1 - t)) / 3];
      second.c2 = lerp(edge.c2!, b, t);
    }
    if (edge.kind === 'arc') {
      const angle = Math.abs(arcParameters(board, edge).delta);
      first.arc = [...edge.arc!];
      first.arc[3] = angle * t > Math.PI ? 1 : 0;
      second.arc = [...edge.arc!];
      second.arc[3] = angle * (1 - t) > Math.PI ? 1 : 0;
    }
    edges = board.edges.flatMap((v) => (v === edge ? [first, second] : [v]));
    properties = Object.fromEntries(
      Object.entries(board.properties).map(([key, value]) => [
        key,
        {
          ...value,
          ...(value.appearance
            ? {
                appearance: value.appearance.map((contour) => ({
                  ...contour,
                  segments: contour.segments.map((segment) => ({
                    ...segment,
                    values: segment.values.map((anchor) =>
                      typeof anchor === 'number' || anchor.edge !== edge.id
                        ? anchor
                        : {
                            ...anchor,
                            edge: anchor.t <= t ? first.id : second.id,
                            t: anchor.t <= t ? anchor.t / t : (anchor.t - t) / (1 - t),
                          }
                    ),
                  })),
                })),
              }
            : {}),
        },
      ])
    );
  }
  return {
    board: { ...board, nodes, edges, properties },
    node,
    point,
    feedback: connects ? `${snapped.feedback} · Connected to shared boundary` : snapped.feedback,
  };
}

export function pointRemovalReason(board: Board, node: string): string | null {
  const edges = board.edges.filter((e) => e.a === node || e.b === node);
  if (edges.length > 2) {
    return 'Remove a connected edge before removing this junction.';
  }
  if (edges.some((e) => e.id.startsWith('rim')) && !node.startsWith('point-')) {
    return 'The four circle anchors stay in place.';
  }
  return null;
}
export function removePoint(board: Board, node: string): Board {
  if (pointRemovalReason(board, node)) {
    return board;
  }
  const attached = board.edges.filter((e) => e.a === node || e.b === node);
  const edges = board.edges.filter((e) => e.a !== node && e.b !== node);
  if (attached.length === 2) {
    const [first, second] = attached;
    const a = first.a === node ? first.b : first.a,
      b = second.a === node ? second.b : second.a;
    if (a !== b) {
      const joining: Edge = { id: `joined-${crypto.randomUUID()}`, a, b, kind: 'line' };
      if (attached.every((e) => e.id.startsWith('rim') && e.kind === 'arc')) {
        const sweep = first.b === node ? first.arc![4] : 1 - first.arc![4];
        const angle = Math.abs(arcParameters(board, first).delta) + Math.abs(arcParameters(board, second).delta);
        joining.id = `rim-${joining.id}`;
        joining.kind = 'arc';
        joining.arc = [RADIUS, RADIUS, 0, angle > Math.PI ? 1 : 0, sweep];
      }
      edges.push(joining);
    }
  }
  const nodes = { ...board.nodes };
  delete nodes[node];
  return { ...board, nodes, edges };
}

export function blankBoard(): Board {
  const study = studyBoard();
  const board = {
    ...study,
    nodes: Object.fromEntries(['e', 's', 'w', 'n'].map((key) => [key, study.nodes[key]])),
    edges: study.edges.filter((e) => e.id.startsWith('rim')),
    properties: {},
    fixture: 'Blank board',
  };
  const faces = derive(board).faces;
  return { ...board, properties: Object.fromEntries(faces.map((f) => [f.key, defaults('territory-1')])) };
}
