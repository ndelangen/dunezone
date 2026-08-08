/**
 * jsdom does not implement SVGGraphicsElement.getBBox(). Several pipeline steps
 * (and the @svg-fns/layout helpers they call) rely on getBBox to measure
 * content. This module installs a geometry-based polyfill that computes bounding
 * boxes directly from element attributes / path data, so unit tests exercise the
 * real cropping math instead of returning zeros.
 *
 * It intentionally ignores transforms, strokes and filters — fixtures are kept
 * simple so the geometry is exact.
 */

interface Box {
  x: number;
  y: number;
  width: number;
  height: number;
}

function boxFromPoints(points: Array<[number, number]>): Box | null {
  if (points.length === 0) return null;
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const [x, y] of points) {
    if (!Number.isFinite(x) || !Number.isFinite(y)) continue;
    if (x < minX) minX = x;
    if (y < minY) minY = y;
    if (x > maxX) maxX = x;
    if (y > maxY) maxY = y;
  }
  if (!Number.isFinite(minX)) return null;
  return { x: minX, y: minY, width: maxX - minX, height: maxY - minY };
}

function num(el: Element, attr: string, fallback = 0): number {
  const v = parseFloat(el.getAttribute(attr) ?? "");
  return Number.isFinite(v) ? v : fallback;
}

function parsePointsAttr(value: string | null): Array<[number, number]> {
  if (!value) return [];
  const nums = value
    .trim()
    .split(/[\s,]+/)
    .map(Number)
    .filter(Number.isFinite);
  const pts: Array<[number, number]> = [];
  for (let i = 0; i + 1 < nums.length; i += 2) {
    pts.push([nums[i], nums[i + 1]]);
  }
  return pts;
}

const ARG_COUNT: Record<string, number> = {
  m: 2,
  l: 2,
  h: 1,
  v: 1,
  c: 6,
  s: 4,
  q: 4,
  t: 2,
  a: 7,
  z: 0,
};

function parsePathPoints(d: string): Array<[number, number]> {
  const tokens = d.match(/[a-zA-Z]|-?\d*\.?\d+(?:[eE][+-]?\d+)?/g);
  if (!tokens) return [];
  const points: Array<[number, number]> = [];
  let cx = 0;
  let cy = 0;
  let startX = 0;
  let startY = 0;
  let i = 0;
  let cmd = "";

  const readNums = (n: number): number[] => {
    const out: number[] = [];
    for (let k = 0; k < n; k++) {
      out.push(parseFloat(tokens[i++]));
    }
    return out;
  };

  while (i < tokens.length) {
    const t = tokens[i];
    if (/[a-zA-Z]/.test(t)) {
      cmd = t;
      i++;
      if (cmd === "z" || cmd === "Z") {
        cx = startX;
        cy = startY;
        continue;
      }
    }
    const lower = cmd.toLowerCase();
    const rel = cmd === lower;
    const argc = ARG_COUNT[lower] ?? 0;
    if (argc === 0) {
      i++;
      continue;
    }
    const args = readNums(argc);
    switch (lower) {
      case "m":
      case "l":
      case "t": {
        const x = rel ? cx + args[0] : args[0];
        const y = rel ? cy + args[1] : args[1];
        cx = x;
        cy = y;
        if (lower === "m") {
          startX = x;
          startY = y;
          cmd = rel ? "l" : "L";
        }
        points.push([x, y]);
        break;
      }
      case "h": {
        cx = rel ? cx + args[0] : args[0];
        points.push([cx, cy]);
        break;
      }
      case "v": {
        cy = rel ? cy + args[0] : args[0];
        points.push([cx, cy]);
        break;
      }
      case "c": {
        const c1x = rel ? cx + args[0] : args[0];
        const c1y = rel ? cy + args[1] : args[1];
        const c2x = rel ? cx + args[2] : args[2];
        const c2y = rel ? cy + args[3] : args[3];
        const ex = rel ? cx + args[4] : args[4];
        const ey = rel ? cy + args[5] : args[5];
        points.push([c1x, c1y], [c2x, c2y], [ex, ey]);
        cx = ex;
        cy = ey;
        break;
      }
      case "s":
      case "q": {
        const ax = rel ? cx + args[0] : args[0];
        const ay = rel ? cy + args[1] : args[1];
        const ex = rel ? cx + args[2] : args[2];
        const ey = rel ? cy + args[3] : args[3];
        points.push([ax, ay], [ex, ey]);
        cx = ex;
        cy = ey;
        break;
      }
      case "a": {
        const ex = rel ? cx + args[5] : args[5];
        const ey = rel ? cy + args[6] : args[6];
        points.push([ex, ey]);
        cx = ex;
        cy = ey;
        break;
      }
    }
  }
  return points;
}

const SKIP_TAGS = new Set([
  "defs",
  "symbol",
  "clippath",
  "mask",
  "marker",
  "lineargradient",
  "radialgradient",
  "pattern",
  "metadata",
  "title",
  "desc",
  "style",
]);

const CONTAINER_TAGS = new Set(["svg", "g", "a", "switch"]);

function unionBoxes(boxes: Box[]): Box | null {
  const flat: Array<[number, number]> = [];
  for (const b of boxes) {
    flat.push([b.x, b.y], [b.x + b.width, b.y + b.height]);
  }
  return boxFromPoints(flat);
}

function geometryBox(el: Element): Box | null {
  const tag = el.tagName.toLowerCase();
  if (SKIP_TAGS.has(tag)) return null;

  switch (tag) {
    case "rect":
      return {
        x: num(el, "x"),
        y: num(el, "y"),
        width: num(el, "width"),
        height: num(el, "height"),
      };
    case "circle": {
      const r = num(el, "r");
      return { x: num(el, "cx") - r, y: num(el, "cy") - r, width: 2 * r, height: 2 * r };
    }
    case "ellipse": {
      const rx = num(el, "rx");
      const ry = num(el, "ry");
      return { x: num(el, "cx") - rx, y: num(el, "cy") - ry, width: 2 * rx, height: 2 * ry };
    }
    case "line":
      return boxFromPoints([
        [num(el, "x1"), num(el, "y1")],
        [num(el, "x2"), num(el, "y2")],
      ]);
    case "polyline":
    case "polygon":
      return boxFromPoints(parsePointsAttr(el.getAttribute("points")));
    case "path":
      return boxFromPoints(parsePathPoints(el.getAttribute("d") ?? ""));
  }

  if (CONTAINER_TAGS.has(tag)) {
    const childBoxes: Box[] = [];
    for (const child of Array.from(el.children)) {
      const b = geometryBox(child);
      if (b) childBoxes.push(b);
    }
    return unionBoxes(childBoxes);
  }

  return null;
}

export function installSvgBBoxPolyfill(): void {
  const proto = (globalThis as any).SVGElement?.prototype;
  if (!proto) return;
  proto.getBBox = function getBBox(this: Element) {
    const box = geometryBox(this) ?? { x: 0, y: 0, width: 0, height: 0 };
    return {
      x: box.x,
      y: box.y,
      width: box.width,
      height: box.height,
      top: box.y,
      left: box.x,
      right: box.x + box.width,
      bottom: box.y + box.height,
      toJSON() {
        return box;
      },
    } as DOMRect;
  };
}
