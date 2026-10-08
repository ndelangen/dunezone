import { readFileSync, writeFileSync } from 'node:fs';

import { DOMParser } from 'linkedom';
import { chromium } from 'playwright';
import svgpath from 'svgpath';

import {
  at,
  distance,
  commonArtwork,
  contains,
  defaults,
  derive,
} from '../src/app/routes/_app/assets/board-prototype/geometry';
import type {
  AppearanceContour,
  Board,
  ContourAnchor,
  Edge,
  Point,
  Properties,
} from '../src/app/routes/_app/assets/board-prototype/geometry';

/* One-time conversion of the maintained Arrakis map into a quick-load board preset. */
/* Imported inset vertices follow their owning shared boundary, retaining the source contour at rest. */
function anchorContourPoint(board: Board, edges: string[], point: Point): ContourAnchor {
  let closest: { edge: Edge; t: number; distance: number } | undefined;
  for (const edge of board.edges.filter((edge) => edges.includes(edge.id))) {
    const count = edge.kind === 'line' ? 1 : 128;
    for (let i = 0; i < count; i++) {
      const a = at(board, edge, i / count),
        b = at(board, edge, (i + 1) / count);
      const dx = b[0] - a[0],
        dy = b[1] - a[1];
      const projection = {
        t: Math.max(0, Math.min(1, ((point[0] - a[0]) * dx + (point[1] - a[1]) * dy) / (dx * dx + dy * dy))),
      };
      const t = (i + projection.t) / count;
      const residual = distance(point, at(board, edge, t));
      if (!closest || residual < closest.distance) {
        closest = { edge, t, distance: residual };
      }
    }
  }
  if (!closest) {
    throw new Error('An inset contour needs an owning boundary.');
  }
  const origin = at(board, closest.edge, closest.t);
  return { edge: closest.edge.id, t: closest.t, offset: [point[0] - origin[0], point[1] - origin[1]] };
}
const svg = new DOMParser().parseFromString(readFileSync('media/vector/background/map.svg', 'utf8'), 'image/svg+xml');
const nodes: Record<string, [number, number]> = {};
let edges: Edge[] = [];
const shapes: {
  name: string;
  type: string;
  edges: string[];
  insetLine: string;
  appearance: AppearanceContour[];
  border: NonNullable<Properties['border']>;
  paintOrder: number;
}[] = [];
const sourceContours = new Map<string, Element[]>();
const edgeKeys = new Set<string>();
let greatestAdjustment = 0;
function node(x: number, y: number) {
  for (const [key, p] of Object.entries(nodes)) {
    const distance = Math.hypot(p[0] - x, p[1] - y);
    if (distance < 0.025) {
      greatestAdjustment = Math.max(greatestAdjustment, distance);
      return key;
    }
  }
  const key = `n${Object.keys(nodes).length}`;
  nodes[key] = [x, y];
  return key;
}
for (const type of ['strongholds', 'polar', 'rock', 'sand']) {
  const group = svg.getElementById(type)!;
  const bases = [...group.querySelectorAll('path')].filter(
    (p) => p.getAttribute('fill') !== 'none' && p.hasAttribute('stroke')
  );
  for (const base of bases) {
    const name =
      base.id || (base.parentElement!.id && base.parentElement!.id !== type ? base.parentElement!.id : 'polar-sink');
    const path = svgpath(base.getAttribute('d')!)
      .transform(base.getAttribute('transform') || '')
      .abs()
      .unshort();
    let x = 0,
      y = 0,
      sx = 0,
      sy = 0;
    const shapeEdges: string[] = [];
    path.iterate((segment) => {
      const [kind, ...values] = segment;
      if (kind === 'M') {
        x = values[0]!;
        y = values[1]!;
        sx = x;
        sy = y;
        return;
      }
      let nx = x,
        ny = y;
      if (kind === 'H') {
        nx = values[0]!;
      } else if (kind === 'V') {
        ny = values[0]!;
      } else if (kind === 'Z') {
        nx = sx;
        ny = sy;
      } else {
        [nx, ny] = values.slice(-2);
      }
      const a = node(x, y),
        b = node(nx, ny);
      if (a !== b) {
        const forward = a < b;
        const parameters =
          kind === 'C'
            ? forward
              ? values.slice(0, 4)
              : [...values.slice(2, 4), ...values.slice(0, 2)]
            : kind === 'A'
              ? [...values.slice(0, 4), forward ? values[4] : 1 - values[4]!]
              : [];
        const signature = [a, b].sort().join(':') + (parameters.length ? `:${kind}:${parameters.join(',')}` : '');
        const id = signature;
        shapeEdges.push(id);
        if (!edgeKeys.has(signature)) {
          edgeKeys.add(signature);
          edges.push({
            id,
            a,
            b,
            kind: kind === 'A' ? 'arc' : kind === 'C' ? 'cubic' : 'line',
            strokeWidth: 2.2 * Math.sqrt(0.99213 * 0.99369),
            ...(kind === 'A' ? { arc: values.slice(0, 5) } : {}),
            ...(kind === 'C' ? { c1: values.slice(0, 2) as Point, c2: values.slice(2, 4) as Point } : {}),
          });
        }
      }
      x = nx;
      y = ny;
    });
    const contours: Element[] = [];
    for (let sibling = base.nextElementSibling; sibling?.tagName === 'path'; sibling = sibling.nextElementSibling) {
      if (sibling.getAttribute('fill') !== 'none' && sibling.hasAttribute('stroke')) {
        break;
      }
      contours.push(sibling);
    }
    sourceContours.set(name, contours);
    shapes.push({
      name,
      type: type === 'strongholds' ? 'stronghold' : type,
      edges: shapeEdges,
      appearance: [],
      paintOrder: shapes.length,
      border: {
        width: 2.2 * Math.sqrt(0.99213 * 0.99369),
        linecap: (base.getAttribute('stroke-linecap') ||
          base.parentElement!.getAttribute('stroke-linecap') ||
          'butt') as NonNullable<Properties['border']>['linecap'],
        linejoin: (base.getAttribute('stroke-linejoin') ||
          base.parentElement!.getAttribute('stroke-linejoin') ||
          'miter') as NonNullable<Properties['border']>['linejoin'],
      },
      insetLine: contours.some((contour) => contour.hasAttribute('stroke-dasharray'))
        ? 'dashed'
        : type === 'sand'
          ? 'none'
          : 'solid',
    });
  }
}
/* Neighboring legacy outlines sometimes divide the same straight border at different vertices.
 * Connect those vertices before polygonization, using the same source precision tolerance as endpoint merging.
 * Both territories then own identical editable segments rather than almost coincident independent lines.
 */
const replacements = new Map<string, string[]>();
const shared = new Map<string, Edge>();
for (const edge of edges) {
  if (edge.kind !== 'line') {
    shared.set(edge.id, edge);
    continue;
  }
  const a = nodes[edge.a],
    b = nodes[edge.b];
  const dx = b[0] - a[0],
    dy = b[1] - a[1];
  const length = Math.hypot(dx, dy);
  const junctions = Object.entries(nodes)
    .flatMap(([id, point]) => {
      if (id === edge.a || id === edge.b) {
        return [];
      }
      const t = ((point[0] - a[0]) * dx + (point[1] - a[1]) * dy) / (length * length);
      const deviation = Math.abs(dx * (point[1] - a[1]) - dy * (point[0] - a[0])) / length;
      if (t <= 0 || t >= 1 || deviation >= 0.025) {
        return [];
      }
      greatestAdjustment = Math.max(greatestAdjustment, deviation);
      return [{ id, t }];
    })
    .sort((a, b) => a.t - b.t);
  const points = [edge.a, ...junctions.map((j) => j.id), edge.b];
  const ids: string[] = [];
  for (let i = 1; i < points.length; i++) {
    const id = [points[i - 1], points[i]].sort().join(':');
    ids.push(id);
    if (!shared.has(id)) {
      shared.set(id, { ...edge, id, a: points[i - 1], b: points[i], kind: 'line' });
    }
  }
  replacements.set(edge.id, ids);
}
edges = [...shared.values()];
shapes.forEach((shape) => {
  shape.edges = shape.edges.flatMap((id) => replacements.get(id) || [id]);
});
const board: Board = { nodes, edges, properties: {}, fixture: 'Arrakis recreation' };
for (const shape of shapes) {
  shape.appearance = (sourceContours.get(shape.name) || []).map((element) => {
    const path = svgpath(element.getAttribute('d')!)
      .transform(element.getAttribute('transform') || '')
      .abs()
      .unshort();
    let x = 0,
      y = 0;
    const segments: AppearanceContour['segments'] = [];
    path.iterate(([kind, ...values]) => {
      if (kind === 'H') {
        kind = 'L';
        values = [values[0]!, y];
      }
      if (kind === 'V') {
        kind = 'L';
        values = [x, values[0]!];
      }
      const anchored: (number | ReturnType<typeof anchorContourPoint>)[] = [];
      const prefix = kind === 'A' ? 5 : 0;
      anchored.push(...(values.slice(0, prefix) as number[]));
      for (let i = prefix; i < values.length; i += 2) {
        const point: Point = [values[i]!, values[i + 1]!];
        anchored.push(anchorContourPoint(board, shape.edges, point));
        [x, y] = point;
      }
      segments.push({ kind, values: anchored });
    });
    const inherited = (name: string, fallback: string) =>
      element.getAttribute(name) || element.parentElement?.getAttribute(name) || fallback;
    const matrix = element
      .getAttribute('transform')
      ?.match(/matrix\(([^)]+)\)/)?.[1]
      .split(/[ ,]+/)
      .map(Number);
    const scale = matrix ? Math.sqrt(Math.abs(matrix[0] * matrix[3] - matrix[1] * matrix[2])) : 1;
    return {
      role: element.getAttribute('fill') === 'none' ? 'inset' : 'band',
      segments,
      fill: inherited('fill', '#000'),
      stroke: inherited('stroke', 'none'),
      strokeWidth: Number(inherited('stroke-width', '1')) * scale,
      strokeLinecap: inherited('stroke-linecap', 'butt') as AppearanceContour['strokeLinecap'],
      strokeLinejoin: inherited('stroke-linejoin', 'miter') as AppearanceContour['strokeLinejoin'],
      ...(element.hasAttribute('stroke-dasharray')
        ? {
            strokeDasharray: element
              .getAttribute('stroke-dasharray')!
              .split(/[ ,]+/)
              .map((v) => Number(v) * scale)
              .join(' '),
          }
        : {}),
      ...(element.hasAttribute('stroke-dashoffset')
        ? { strokeDashoffset: String(Number(element.getAttribute('stroke-dashoffset')) * scale) }
        : {}),
    };
  });
}
const sectors = svg.getElementById('sectors')!.outerHTML;
const sectorLines = [...svg.getElementById('sectors')!.querySelectorAll('path')].map((element) => {
  const points: [number, number][] = [];
  svgpath(element.getAttribute('d')!)
    .transform(element.parentElement!.getAttribute('transform') || '')
    .abs()
    .iterate(([kind, ...values]) => {
      const previous = points.at(-1);
      points.push(
        kind === 'H' ? [values[0]!, previous![1]] : kind === 'V' ? [previous![0], values[0]!] : [values[0]!, values[1]!]
      );
    });
  return points;
});
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage();
await page.setContent(readFileSync('media/vector/background/map.svg', 'utf8'));
const symbolBounds = await page.evaluate(() =>
  [...document.querySelectorAll('#icons path')]
    .filter((_, i) => i % 2 === 0)
    .map((element, i) => {
      const p = element as SVGGraphicsElement,
        outline = p.nextElementSibling as SVGGraphicsElement;
      const a = p.getBBox(),
        b = outline.getBBox();
      const x = Math.min(a.x, b.x),
        y = Math.min(a.y, b.y);
      const width = Math.max(a.x + a.width, b.x + b.width) - x;
      const height = Math.max(a.y + a.height, b.y + b.height) - y;
      return {
        id: `arrakis-decal-${i}`,
        x: x + width / 2,
        y: y + height / 2,
        scale: Math.max(width, height),
        bounds: { x, y, width, height },
      };
    })
);
const symbols = symbolBounds.map(({ bounds: _bounds, ...symbol }) => symbol);
const iconPaths = [...svg.getElementById('icons')!.querySelectorAll('path')];
for (const [name, index] of [
  ['arrakis-city', 0],
  ['arrakis-sietch', 2],
] as const) {
  const bounds = symbolBounds[index].bounds;
  const paths = iconPaths.slice(index * 2, index * 2 + 2).map((element, i) => {
    const path = svgpath(element.getAttribute('d')!).translate(-bounds.x, -bounds.y).abs().unshort().toString();
    return `<path${i === 1 ? ' data-decal-outline="true"' : ''} fill="${element.getAttribute('fill')}"${element.hasAttribute('fill-opacity') ? ` fill-opacity="${element.getAttribute('fill-opacity')}"` : ''} fill-rule="nonzero" d="${path}"/>`;
  });
  writeFileSync(
    `media/vector/icon/${name}.svg`,
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${bounds.width} ${bounds.height}">\n${paths.join('\n')}\n</svg>\n`
  );
}
await browser.close();
const faces = derive(board).faces;
for (const face of faces) {
  const shape = shapes.find((shape) => [...new Set(shape.edges)].sort().join('|') === face.key);
  if (!shape) {
    throw new Error('An Arrakis region does not match its source territory.');
  }
  board.properties[face.key] = {
    ...defaults(shape.name, shape.type as Properties['type']),
    insetLine: shape.insetLine as Properties['insetLine'],
    appearance: shape.appearance,
    border: shape.border,
    paintOrder: shape.paintOrder,
  };
}
for (const symbol of symbols) {
  const face = faces.find((face) => contains(face.rings, [symbol.x, symbol.y]));
  if (!face) {
    throw new Error('An Arrakis symbol has no owning territory.');
  }
  const property = board.properties[face.key];
  property.decals.push({
    ...symbol,
    artwork:
      property.name === 'arrakeen' || property.name === 'carthag'
        ? commonArtwork.arrakisCity
        : commonArtwork.arrakisSietch,
    rotation: 0,
    outline: true,
  });
}
writeFileSync(
  'src/app/routes/_app/assets/board-prototype/arrakis.fixture.json',
  JSON.stringify(
    {
      board,
      shapes: shapes.map(({ appearance: _appearance, ...shape }) => shape),
      sectors,
      sectorLines,
      greatestAdjustment,
    },
    null,
    2
  ) + '\n'
);
console.log({ nodes: Object.keys(nodes).length, edges: edges.length, territories: shapes.length, greatestAdjustment });
