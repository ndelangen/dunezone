import type { SvgMeta, ViewBox } from "./types";

export function parseViewBox(value: string | null): ViewBox | null {
  if (!value) return null;
  const parts = value.trim().split(/[\s,]+/).map(Number);
  if (parts.length !== 4 || !parts.every(Number.isFinite)) return null;
  return [parts[0], parts[1], parts[2], parts[3]];
}

function parseLength(value: string | null): number | null {
  if (!value) return null;
  const n = parseFloat(value);
  return Number.isFinite(n) ? n : null;
}

/**
 * Read layout metadata directly off an SVG root element.
 */
export function readMeta(svg: SVGSVGElement): SvgMeta {
  const viewBox = parseViewBox(svg.getAttribute("viewBox"));
  let width = parseLength(svg.getAttribute("width"));
  let height = parseLength(svg.getAttribute("height"));

  if ((width === null || height === null) && viewBox) {
    width = width ?? viewBox[2];
    height = height ?? viewBox[3];
  }

  const effectiveW = viewBox ? viewBox[2] : width;
  const effectiveH = viewBox ? viewBox[3] : height;
  const aspectRatio =
    effectiveW && effectiveH && effectiveH !== 0 ? effectiveW / effectiveH : null;

  return { viewBox, width, height, aspectRatio };
}

export function formatViewBox(box: ViewBox): string {
  return box.map((n) => roundTo(n, 4)).join(" ");
}

export function roundTo(value: number, decimals = 4): number {
  const f = 10 ** decimals;
  return Math.round(value * f) / f;
}

/**
 * Count the total number of path commands across all <path> elements in an SVG
 * string. Used as a cheap "complexity" metric for optimize before/after badges.
 */
export function countPathCommands(svg: string): number {
  let total = 0;
  const dRegex = /\bd\s*=\s*"([^"]*)"/g;
  let m: RegExpExecArray | null;
  while ((m = dRegex.exec(svg)) !== null) {
    const commands = m[1].match(/[a-zA-Z]/g);
    total += commands ? commands.length : 0;
  }
  return total;
}

/**
 * Resolve an element's effective content window: prefer the viewBox, otherwise
 * fall back to width/height (origin 0,0). Returns null if neither is present.
 */
export function effectiveViewBox(svg: SVGSVGElement): ViewBox | null {
  const vb = parseViewBox(svg.getAttribute("viewBox"));
  if (vb) return vb;
  const w = parseLength(svg.getAttribute("width"));
  const h = parseLength(svg.getAttribute("height"));
  if (w !== null && h !== null) return [0, 0, w, h];
  return null;
}

/** Write viewBox (and optionally width/height) onto an element. */
export function applyViewBox(
  svg: SVGSVGElement,
  box: ViewBox,
  opts: { syncDimensions?: boolean; preserveAspectRatio?: string } = {},
): void {
  svg.setAttribute("viewBox", box.map((n) => roundTo(n)).join(" "));
  if (opts.syncDimensions) {
    svg.setAttribute("width", String(roundTo(box[2])));
    svg.setAttribute("height", String(roundTo(box[3])));
  }
  if (opts.preserveAspectRatio) {
    svg.setAttribute("preserveAspectRatio", opts.preserveAspectRatio);
  }
}
