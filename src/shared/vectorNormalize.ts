import svgpath from 'svgpath';

import { VECTOR_PRECISION, VECTOR_ROOT_ID, VECTOR_VIEWBOX_SIZE } from './vectorRules';

/**
 * Pure-math normalization of a cropped SVG source into the shared `0 0 100 100` space (#296): the source viewBox maps to the square uniformly scaled and centered, and the transform is BAKED into every coordinate — path data, stroke widths, dash arrays — rather than wrapped in a `<g>`, because fragment consumers (`<use href="…#arrakeen">`) clone elements without ancestor transforms.
 * The corpus is paths-only (verified in #306), so baking = svgpath over `d` plus scaling the stroke-* attributes.
 *
 * DOM access is injected so the same code runs under linkedom (generator), jsdom, or a real browser (the authoring tool, moving in-repo per #298).
 */

/** The minimal element surface the baking walk needs — satisfied structurally by any DOM. */
export type SvgElementLike = {
  readonly tagName: string;
  getAttribute(name: string): string | null;
  setAttribute(name: string, value: string): void;
  removeAttribute(name: string): void;
  querySelector(selector: string): unknown;
  readonly children: Iterable<SvgElementLike>;
};

export type SvgDom = {
  parse(svg: string): SvgElementLike;
  serialize(root: SvgElementLike): string;
};

type Matrix = [number, number, number, number, number, number];

const IDENTITY: Matrix = [1, 0, 0, 1, 0, 0];

function multiply(a: Matrix, b: Matrix): Matrix {
  return [
    a[0] * b[0] + a[2] * b[1],
    a[1] * b[0] + a[3] * b[1],
    a[0] * b[2] + a[2] * b[3],
    a[1] * b[2] + a[3] * b[3],
    a[0] * b[4] + a[2] * b[5] + a[4],
    a[1] * b[4] + a[3] * b[5] + a[5],
  ];
}

/** Average absolute scale of a matrix — used to scale stroke widths (uniform for our matrices). */
function scaleOf(matrix: Matrix): number {
  return Math.sqrt(Math.abs(matrix[0] * matrix[3] - matrix[1] * matrix[2]));
}

function parseTransform(value: string | null): Matrix {
  if (!value) {
    return IDENTITY;
  }
  let matrix = IDENTITY;
  const calls = value.matchAll(/(matrix|translate|scale|rotate|skewX|skewY)\s*\(([^)]*)\)/g);
  for (const [, name, argsText] of calls) {
    const args = (argsText ?? '')
      .trim()
      .split(/[\s,]+/)
      .map(Number);
    let next: Matrix;
    switch (name) {
      case 'matrix':
        next = args as Matrix;
        break;
      case 'translate':
        next = [1, 0, 0, 1, args[0] ?? 0, args[1] ?? 0];
        break;
      case 'scale':
        next = [args[0] ?? 1, 0, 0, args[1] ?? args[0] ?? 1, 0, 0];
        break;
      case 'rotate': {
        const angle = ((args[0] ?? 0) * Math.PI) / 180;
        const [cx, cy] = [args[1] ?? 0, args[2] ?? 0];
        const rotation: Matrix = [Math.cos(angle), Math.sin(angle), -Math.sin(angle), Math.cos(angle), 0, 0];
        next = multiply(multiply([1, 0, 0, 1, cx, cy], rotation), [1, 0, 0, 1, -cx, -cy]);
        break;
      }
      case 'skewX':
        next = [1, 0, Math.tan(((args[0] ?? 0) * Math.PI) / 180), 1, 0, 0];
        break;
      case 'skewY':
        next = [1, Math.tan(((args[0] ?? 0) * Math.PI) / 180), 0, 1, 0, 0];
        break;
      default:
        next = IDENTITY;
    }
    matrix = multiply(matrix, next);
  }
  return matrix;
}

const SCALED_LENGTH_ATTRIBUTES = ['stroke-width', 'stroke-dashoffset'] as const;

/** Geometry that carries coordinates outside `d` — the corpus is paths-only (#306); refuse loud. */
const UNBAKEABLE_TAGS = new Set(['rect', 'circle', 'ellipse', 'line', 'polyline', 'polygon', 'text', 'image', 'use']);

function bake(element: SvgElementLike, parent: Matrix): void {
  const own = parseTransform(element.getAttribute('transform'));
  const matrix = multiply(parent, own);
  element.removeAttribute('transform');

  const tag = element.tagName.toLowerCase();
  if (UNBAKEABLE_TAGS.has(tag)) {
    throw new VectorNormalizeError(
      `<${tag}> cannot be coordinate-baked — convert it to a <path> in the authoring tool`
    );
  }
  if (tag === 'path') {
    const d = element.getAttribute('d');
    if (d) {
      element.setAttribute('d', svgpath(d).matrix(matrix).round(VECTOR_PRECISION).toString());
    }
  }

  const k = scaleOf(matrix);
  /* A stroked element without an explicit width uses the SVG default of 1 user unit — after
     coordinate baking that implicit 1 must become an explicit 1×k or strokes fatten by 1/k. */
  const stroke = element.getAttribute('stroke');
  if (stroke && stroke !== 'none' && !element.getAttribute('stroke-width')) {
    element.setAttribute('stroke-width', String(round(k)));
  }
  for (const attribute of SCALED_LENGTH_ATTRIBUTES) {
    const value = element.getAttribute(attribute);
    if (value) {
      element.setAttribute(attribute, String(round(parseLength(attribute, value) * k)));
    }
  }
  const dashes = element.getAttribute('stroke-dasharray');
  if (dashes && dashes !== 'none') {
    element.setAttribute(
      'stroke-dasharray',
      dashes
        .split(/[\s,]+/)
        .map((part) => String(round(parseLength('stroke-dasharray', part) * k)))
        .join(',')
    );
  }

  for (const child of Array.from(element.children)) {
    bake(child, matrix);
  }
}

function round(value: number): number {
  const factor = 10 ** VECTOR_PRECISION;
  return Math.round(value * factor) / factor;
}

/** `px` equals user units and is droppable; any other unit cannot be coordinate-baked. */
function parseLength(attribute: string, value: string): number {
  const match = /^([+-]?[\d.]+(?:[eE][+-]?\d+)?)(px)?$/.exec(value.trim());
  if (!match) {
    throw new VectorNormalizeError(
      `${attribute}="${value}" has a unit that cannot be baked — use user units in the source`
    );
  }
  return Number(match[1]);
}

class VectorNormalizeError extends Error {}

/**
 * Normalize one SVG source into the shared square space.
 * The source's viewBox is the crop (the authoring tool's responsibility);
 * the art is uniformly scaled and centered into `0 0 100 100`.
 */
export function normalizeSvg(source: string, dom: SvgDom): string {
  const root = dom.parse(source);
  const viewBox = root.getAttribute('viewBox');
  if (!viewBox) {
    throw new VectorNormalizeError('source has no viewBox — run it through the authoring tool');
  }
  const [minX, minY, width, height] = viewBox
    .trim()
    .split(/[\s,]+/)
    .map(Number);
  if (!(width! > 0) || !(height! > 0)) {
    throw new VectorNormalizeError(`unusable viewBox "${viewBox}"`);
  }

  const scale = VECTOR_VIEWBOX_SIZE / Math.max(width!, height!);
  const translateX = (VECTOR_VIEWBOX_SIZE - width! * scale) / 2 - minX! * scale;
  const translateY = (VECTOR_VIEWBOX_SIZE - height! * scale) / 2 - minY! * scale;
  const normalization: Matrix = [scale, 0, 0, scale, translateX, translateY];

  for (const child of Array.from(root.children)) {
    bake(child, normalization);
  }

  root.setAttribute('viewBox', `0 0 ${VECTOR_VIEWBOX_SIZE} ${VECTOR_VIEWBOX_SIZE}`);
  // Some files (map.svg) expose `#root` as an inner group — the svg element must not shadow it.
  if (root.querySelector(`[id="${VECTOR_ROOT_ID}"]`)) {
    root.removeAttribute('id');
  } else {
    root.setAttribute('id', VECTOR_ROOT_ID);
  }
  root.setAttribute('overflow', 'visible');
  root.removeAttribute('width');
  root.removeAttribute('height');
  return dom.serialize(root);
}
