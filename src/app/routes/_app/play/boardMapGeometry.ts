import { BufferAttribute, BufferGeometry, Color, ShapeGeometry } from 'three';
import type { Shape, ShapePath, Vector2 } from 'three';
import { SVGLoader } from 'three/examples/jsm/loaders/SVGLoader.js';
import type { StrokeStyle } from 'three/examples/jsm/loaders/SVGLoader.js';

/*
 * The board's map as flat geometry, drawn from its vector source instead of a picture, so it stays sharp however close the camera comes.
 * Every fill and outline becomes triangles in the source's own painting order, in one geometry with a colour and alpha per vertex:
 * drawn in one call without writing depth, each later shape paints over the earlier ones, as the SVG paints them.
 */

const CURVE_SEGMENTS = 12;
/* The board's edge as a polygon fine enough to read as its circle. */
const EDGE_SIDES = 256;

type Point = [number, number];

/* Keeps the part of a convex polygon inside the board's edge (Sutherland–Hodgman against each side of the edge polygon). */
function clipToBoard(polygon: Point[], radius: number): Point[] {
  let output = polygon;
  for (let side = 0; side < EDGE_SIDES && output.length > 0; side++) {
    const angle = ((side + 0.5) * 2 * Math.PI) / EDGE_SIDES;
    const normal: Point = [Math.cos(angle), Math.sin(angle)];
    const inside = (point: Point) => point[0] * normal[0] + point[1] * normal[1] <= radius;
    const input = output;
    output = [];
    for (let index = 0; index < input.length; index++) {
      const current = input[index];
      const previous = input[(index + input.length - 1) % input.length];
      const currentIn = inside(current);
      const previousIn = inside(previous);
      if (currentIn !== previousIn) {
        const from = previous[0] * normal[0] + previous[1] * normal[1] - radius;
        const to = current[0] * normal[0] + current[1] * normal[1] - radius;
        const t = from / (from - to);
        output.push([previous[0] + (current[0] - previous[0]) * t, previous[1] + (current[1] - previous[1]) * t]);
      }
      if (currentIn) {
        output.push(current);
      }
    }
  }
  return output;
}

type Paint = Readonly<{ color: Color; alpha: number }>;

type Layer = { positions: number[]; paint: Paint };

/* The dash pattern an outline inherits from itself or its groups, in source units, or null for a solid outline. */
function dashPattern(node: Element | undefined): { dashes: number[]; offset: number } | null {
  const owner = node?.closest('[stroke-dasharray]');
  const values = (owner?.getAttribute('stroke-dasharray') ?? '')
    .split(/[\s,]+/)
    .map(Number.parseFloat)
    .filter((value) => Number.isFinite(value) && value >= 0);
  const total = values.reduce((sum, value) => sum + value, 0);
  if (values.length === 0 || total <= 0) {
    return null;
  }
  const dashes = values.length % 2 === 0 ? values : [...values, ...values];
  const offset = Number.parseFloat(node?.closest('[stroke-dashoffset]')?.getAttribute('stroke-dashoffset') ?? '0');
  return { dashes, offset: Number.isFinite(offset) ? offset : 0 };
}

/* Cuts a polyline into its drawn dashes. */
function dashedRuns(points: readonly Vector2[], pattern: { dashes: number[]; offset: number }): Vector2[][] {
  const period = pattern.dashes.reduce((sum, value) => sum + value, 0);
  let index = 0;
  let remaining = pattern.dashes[0];
  /* Walk the pattern forward by the offset before the line starts. */
  let skip = ((pattern.offset % period) + period) % period;
  while (skip > 0) {
    if (skip >= remaining) {
      skip -= remaining;
      index = (index + 1) % pattern.dashes.length;
      remaining = pattern.dashes[index];
    } else {
      remaining -= skip;
      skip = 0;
    }
  }
  const runs: Vector2[][] = [];
  let current: Vector2[] | null = index % 2 === 0 ? [points[0].clone()] : null;
  for (let segment = 1; segment < points.length; segment++) {
    const start = points[segment - 1];
    const end = points[segment];
    const length = start.distanceTo(end);
    let travelled = 0;
    while (length - travelled > remaining) {
      travelled += remaining;
      const cut = start.clone().lerp(end, travelled / length);
      if (current) {
        current.push(cut);
        if (current.length > 1) {
          runs.push(current);
        }
        current = null;
      } else {
        current = [cut];
      }
      index = (index + 1) % pattern.dashes.length;
      remaining = pattern.dashes[index];
    }
    remaining -= length - travelled;
    current?.push(end.clone());
  }
  if (current && current.length > 1) {
    runs.push(current);
  }
  return runs;
}

function shapeTriangles(shape: Shape): number[] {
  const geometry = new ShapeGeometry(shape, CURVE_SEGMENTS).toNonIndexed();
  const values = Array.from(geometry.getAttribute('position').array);
  geometry.dispose();
  return values;
}

function strokeTriangles(points: readonly Vector2[], style: StrokeStyle): number[] {
  const geometry = SVGLoader.pointsToStroke(points as Vector2[], style);
  if (!geometry) {
    return [];
  }
  const flat = geometry.index ? geometry.toNonIndexed() : geometry;
  const values = Array.from(flat.getAttribute('position').array);
  geometry.dispose();
  flat.dispose();
  return values;
}

function pathLayers(path: ShapePath): Layer[] {
  const style = path.userData?.style as Record<string, string | number> | undefined;
  const node = path.userData?.node as Element | undefined;
  if (!style || style.visibility === 'hidden' || style.display === 'none') {
    return [];
  }
  const layers: Layer[] = [];
  const opacity = typeof style.opacity === 'number' ? style.opacity : 1;
  if (style.fill && style.fill !== 'none' && style.fill !== 'transparent') {
    const paint = { color: new Color().setStyle(String(style.fill)), alpha: Number(style.fillOpacity ?? 1) * opacity };
    const positions = SVGLoader.createShapes(path).flatMap(shapeTriangles);
    layers.push({ positions, paint });
  }
  if (style.stroke && style.stroke !== 'none' && Number(style.strokeWidth) > 0) {
    const paint = {
      color: new Color().setStyle(String(style.stroke)),
      alpha: Number(style.strokeOpacity ?? 1) * opacity,
    };
    const pattern = dashPattern(node);
    const positions = path.subPaths.flatMap((subPath) => {
      const points = subPath.getPoints(CURVE_SEGMENTS);
      const runs = pattern ? dashedRuns(points, pattern) : [points];
      return runs.flatMap((run) => strokeTriangles(run, style as unknown as StrokeStyle));
    });
    layers.push({ positions, paint });
  }
  return layers;
}

/**
 * The map's geometry on the board's top, centred on the table's middle with the source's top toward the far side, as the picture lay.
 * Each triangle faces up, whatever winding the source gave it.
 */
export function boardMapGeometry(svg: string, radius: number): BufferGeometry {
  const data = new SVGLoader().parse(svg);
  const viewBox =
    (data.xml as unknown as Element)
      .getAttribute?.('viewBox')
      ?.split(/[\s,]+/)
      .map(Number) ?? [];
  const [minX = 0, minY = 0, width = 1, height = 1] = viewBox;
  const scale = (2 * radius) / Math.max(width, height);
  const positionValues: number[] = [];
  const colorValues: number[] = [];
  for (const { positions: source, paint } of data.paths.flatMap(pathLayers)) {
    for (let triangle = 0; triangle < source.length; triangle += 9) {
      const corners = [0, 1, 2].map((corner): Point => [
        (source[triangle + corner * 3] - minX) * scale - radius,
        (source[triangle + corner * 3 + 1] - minY) * scale - radius,
      ]);
      /* Outlines along the edge reach past it; the picture this replaces was cut at the board's edge too. */
      const outside = corners.some(([x, z]) => Math.hypot(x, z) > radius);
      const polygon = outside ? clipToBoard(corners, radius) : corners;
      for (let fan = 1; fan + 1 < polygon.length; fan++) {
        const face = [polygon[0], polygon[fan], polygon[fan + 1]];
        /* Seen from above, with the source's y running toward the viewer, a counter-clockwise triangle has a negative signed area here. */
        const area =
          (face[1][0] - face[0][0]) * (face[2][1] - face[0][1]) - (face[2][0] - face[0][0]) * (face[1][1] - face[0][1]);
        for (const corner of area > 0 ? [0, 2, 1] : [0, 1, 2]) {
          positionValues.push(face[corner][0], 0, face[corner][1]);
          colorValues.push(paint.color.r, paint.color.g, paint.color.b, paint.alpha);
        }
      }
    }
  }
  const count = positionValues.length / 3;
  const positions = new Float32Array(positionValues);
  const colors = new Float32Array(colorValues);
  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new BufferAttribute(positions, 3));
  geometry.setAttribute('color', new BufferAttribute(colors, 4));
  const normals = new Float32Array(count * 3);
  for (let index = 0; index < count; index++) {
    normals[index * 3 + 1] = 1;
  }
  geometry.setAttribute('normal', new BufferAttribute(normals, 3));
  return geometry;
}
