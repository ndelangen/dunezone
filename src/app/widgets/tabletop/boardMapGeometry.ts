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

type DashPattern = { dashes: number[]; offset: number };

function dashValues(text: string | null | undefined): number[] {
  return (text ?? '')
    .split(/[\s,]+/)
    .map(Number.parseFloat)
    .filter((value) => Number.isFinite(value) && value >= 0);
}

/* The dash pattern an outline inherits from itself or its groups, in source units, or null for a solid outline. */
function dashPattern(node: Element | undefined): DashPattern | null {
  const values = dashValues(node?.closest('[stroke-dasharray]')?.getAttribute('stroke-dasharray'));
  const total = values.reduce((sum, value) => sum + value, 0);
  if (total <= 0) {
    return null;
  }
  const dashes = values.length % 2 === 0 ? values : [...values, ...values];
  const offset = Number.parseFloat(node?.closest('[stroke-dashoffset]')?.getAttribute('stroke-dashoffset') ?? '0');
  return { dashes, offset: Number.isFinite(offset) ? offset : 0 };
}

/* Walks a dash pattern along a line: which entry is current, an even one drawn and an odd one a gap, and how much of it is left. */
class DashWalk {
  index = 0;
  remaining: number;

  constructor(private readonly dashes: readonly number[]) {
    this.remaining = dashes[0];
  }

  get drawing() {
    return this.index % 2 === 0;
  }

  next() {
    this.index = (this.index + 1) % this.dashes.length;
    this.remaining = this.dashes[this.index];
  }

  /* Walk the pattern forward by the offset before the line starts. */
  skip(offset: number) {
    const period = this.dashes.reduce((sum, value) => sum + value, 0);
    let skip = ((offset % period) + period) % period;
    while (skip >= this.remaining && skip > 0) {
      skip -= this.remaining;
      this.next();
    }
    this.remaining -= skip;
  }
}

/* Lays a dash pattern along a polyline, one segment at a time, collecting the drawn runs. */
class DashCutter {
  readonly runs: Vector2[][] = [];
  private current: Vector2[] | null;

  constructor(
    private readonly walk: DashWalk,
    first: Vector2
  ) {
    this.current = walk.drawing ? [first.clone()] : null;
  }

  /* A dash or a gap ends at this point: a dash closes into a run, a gap opens the next dash. */
  private cut(point: Vector2) {
    if (this.current) {
      this.current.push(point);
      this.finish();
    } else {
      this.current = [point];
    }
    this.walk.next();
  }

  along(start: Vector2, end: Vector2) {
    const length = start.distanceTo(end);
    let travelled = 0;
    while (length - travelled > this.walk.remaining) {
      travelled += this.walk.remaining;
      this.cut(start.clone().lerp(end, travelled / length));
    }
    this.walk.remaining -= length - travelled;
    this.current?.push(end.clone());
  }

  finish() {
    if (this.current && this.current.length > 1) {
      this.runs.push(this.current);
    }
    this.current = null;
  }
}

/* Cuts a polyline into its drawn dashes. */
function dashedRuns(points: readonly Vector2[], pattern: DashPattern): Vector2[][] {
  const walk = new DashWalk(pattern.dashes);
  walk.skip(pattern.offset);
  const cutter = new DashCutter(walk, points[0]);
  for (let segment = 1; segment < points.length; segment++) {
    cutter.along(points[segment - 1], points[segment]);
  }
  cutter.finish();
  return cutter.runs;
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

type Style = Record<string, string | number>;

function painted(value: string | number | undefined) {
  return value !== undefined && value !== '' && value !== 'none' && value !== 'transparent';
}

function fillLayer(path: ShapePath, style: Style, opacity: number): Layer {
  const paint = { color: new Color().setStyle(String(style.fill)), alpha: Number(style.fillOpacity ?? 1) * opacity };
  return { positions: path.toShapes().flatMap(shapeTriangles), paint };
}

function strokeLayer(path: ShapePath, style: Style, opacity: number): Layer {
  const paint = {
    color: new Color().setStyle(String(style.stroke)),
    alpha: Number(style.strokeOpacity ?? 1) * opacity,
  };
  const pattern = dashPattern(path.userData?.node as Element | undefined);
  const positions = path.subPaths.flatMap((subPath) => {
    const points = subPath.getPoints(CURVE_SEGMENTS);
    const runs = pattern ? dashedRuns(points, pattern) : [points];
    return runs.flatMap((run) => strokeTriangles(run, style as unknown as StrokeStyle));
  });
  return { positions, paint };
}

function shown(style: Style | undefined): style is Style {
  return style !== undefined && style.visibility !== 'hidden' && style.display !== 'none';
}

function stroked(style: Style) {
  return painted(style.stroke) && Number(style.strokeWidth) > 0;
}

function pathLayers(path: ShapePath): Layer[] {
  const style = path.userData?.style as Style | undefined;
  if (!shown(style)) {
    return [];
  }
  const opacity = typeof style.opacity === 'number' ? style.opacity : 1;
  const layers: Layer[] = [];
  if (painted(style.fill)) {
    layers.push(fillLayer(path, style, opacity));
  }
  if (stroked(style)) {
    layers.push(strokeLayer(path, style, opacity));
  }
  return layers;
}

type Frame = { minX: number; minY: number; scale: number; radius: number };

function frameOf(xml: unknown, radius: number): Frame {
  const viewBox =
    (xml as Element)
      .getAttribute?.('viewBox')
      ?.split(/[\s,]+/)
      .map(Number) ?? [];
  const [minX = 0, minY = 0, width = 1, height = 1] = viewBox;
  return { minX, minY, scale: (2 * radius) / Math.max(width, height), radius };
}

/* One source triangle on the board, cut at its edge where it reaches past: outlines along the edge do, and the picture this replaces was cut there too. */
function boardPolygon(source: readonly number[], triangle: number, frame: Frame): Point[] {
  const { minX, minY, scale, radius } = frame;
  const corners = [0, 1, 2].map((corner): Point => [
    (source[triangle + corner * 3] - minX) * scale - radius,
    (source[triangle + corner * 3 + 1] - minY) * scale - radius,
  ]);
  const outside = corners.some(([x, z]) => Math.hypot(x, z) > radius);
  return outside ? clipToBoard(corners, radius) : corners;
}

/* Seen from above, with the source's y running toward the viewer, a counter-clockwise triangle has a negative signed area here. */
function upwardFace(a: Point, b: Point, c: Point): Point[] {
  const area = (b[0] - a[0]) * (c[1] - a[1]) - (c[0] - a[0]) * (b[1] - a[1]);
  return area > 0 ? [a, c, b] : [a, b, c];
}

/**
 * The map's geometry on the board's top, centred on the table's middle with the source's top toward the far side, as the picture lay.
 * Each triangle faces up, whatever winding the source gave it.
 */
export function boardMapGeometry(svg: string, radius: number): BufferGeometry {
  const data = new SVGLoader().parse(svg);
  const frame = frameOf(data.xml, radius);
  const positionValues: number[] = [];
  const colorValues: number[] = [];
  for (const { positions: source, paint } of data.paths.flatMap(pathLayers)) {
    for (let triangle = 0; triangle < source.length; triangle += 9) {
      const polygon = boardPolygon(source, triangle, frame);
      for (let fan = 1; fan + 1 < polygon.length; fan++) {
        for (const [x, z] of upwardFace(polygon[0], polygon[fan], polygon[fan + 1])) {
          positionValues.push(x, 0, z);
          colorValues.push(paint.color.r, paint.color.g, paint.color.b, paint.alpha);
        }
      }
    }
  }
  const count = positionValues.length / 3;
  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new BufferAttribute(new Float32Array(positionValues), 3));
  geometry.setAttribute('color', new BufferAttribute(new Float32Array(colorValues), 4));
  const normals = new Float32Array(count * 3);
  for (let index = 0; index < count; index++) {
    normals[index * 3 + 1] = 1;
  }
  geometry.setAttribute('normal', new BufferAttribute(normals, 3));
  return geometry;
}
