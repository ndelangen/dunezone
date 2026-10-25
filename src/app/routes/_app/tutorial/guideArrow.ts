/*
 * The tutorial band and its arrow, drawn as one outline: the band across the top of the window,
 * and a wedge that grows out of its lower edge toward the thing to use.
 * One outline lets the band's inner shadow and its edge run on into the wedge, so the two read as a single shape.
 * The wedge stops short of its target, so it points at the part without covering it.
 */

export type Point = Readonly<{ x: number; y: number }>;
export type Edges = Readonly<{ left: number; right: number; bottom: number }>;
/** Where the arrow points: a spot, and the half size of the thing there, so the gap is kept from its edge, not its middle. */
export type Target = Readonly<{ x: number; y: number; halfWidth: number; halfHeight: number }>;

/* Half the wedge's width where it leaves the band, measured along the band's edge. */
const ROOT = 34;
/* Half the shaft's width just behind the head. */
const NECK = 9;
/* Half the head's width, and its length. */
const HEAD = { half: 24, length: 30 };
/* How far the rounded corners where the wedge meets the band reach along each side. */
const FILLET = 22;
/*
 * The hook beside a target close under the band: its gap to the target, its head, the shaft's half width,
 * how far the tail hangs from the head and how wide it drops, its corners, and the room it keeps under the band.
 */
const HOOK = {
  gap: 15,
  head: { half: 20, length: 26 },
  shaft: 8,
  reach: 26,
  drop: 44,
  bend: 30,
  fillet: 20,
  clear: 6,
};
/* How far the outline reaches past the window's edges, so only its lower edge and the wedge show. */
const BLEED = 4;

/** How far short of its target's edge the arrow's tip stops. */
export const ARROW_GAP_PX = 15;

/** How far inside the visible area the arrow stops when its target is out of view. */
const OFFSCREEN_INSET_PX = 40;

/**
 * A target out of view moved to the edge of `view`, in the direction it lies from the view's middle, so the arrow keeps pointing the way to go instead of disappearing (Norbert, 2026-10-24).
 * A target in view is kept as it is.
 */
export function keepInView(
  target: Target,
  view: Readonly<{ left: number; top: number; right: number; bottom: number }>
): Target {
  const inView = target.x >= view.left && target.x <= view.right && target.y >= view.top && target.y <= view.bottom;
  if (inView) {
    return target;
  }
  const middle = { x: (view.left + view.right) / 2, y: (view.top + view.bottom) / 2 };
  const reach = {
    x: Math.max(0, (view.right - view.left) / 2 - OFFSCREEN_INSET_PX),
    y: Math.max(0, (view.bottom - view.top) / 2 - OFFSCREEN_INSET_PX),
  };
  const dx = target.x - middle.x;
  const dy = target.y - middle.y;
  const scale = Math.min(reach.x / Math.max(Math.abs(dx), 1e-6), reach.y / Math.max(Math.abs(dy), 1e-6));
  return { x: middle.x + dx * scale, y: middle.y + dy * scale, halfWidth: 0, halfHeight: 0 };
}

const point = (p: Point) => `${p.x.toFixed(1)} ${p.y.toFixed(1)}`;
const toward = (from: Point, to: Point, distance: number): Point => {
  const length = Math.hypot(to.x - from.x, to.y - from.y) || 1;
  return { x: from.x + ((to.x - from.x) / length) * distance, y: from.y + ((to.y - from.y) / length) * distance };
};

/*
 * The wedge from `root` on the band's edge toward `target`, as path commands that run from its right corner to its left,
 * the way the outline travels along the band's lower edge, or nothing when the target is too close to the band for an arrow.
 */
function wedge(root: Point, target: Target): string[] | null {
  const dx = target.x - root.x;
  const dy = target.y - root.y;
  const distance = Math.hypot(dx, dy);
  /* A target beside or above the band's edge, or one the arrow would reach almost flat along it, gets no arrow. */
  if (distance < 1 || dy / distance < 0.5) {
    return null;
  }
  /* How far the arrow's line runs inside the target's box before it reaches the middle. */
  const inside = Math.min(
    target.halfWidth / Math.max(Math.abs(dx / distance), 1e-6),
    target.halfHeight / Math.max(Math.abs(dy / distance), 1e-6)
  );
  const length = distance - inside - ARROW_GAP_PX;
  if (length < HEAD.length + FILLET + 20) {
    return null;
  }
  const along = { x: dx / distance, y: dy / distance };
  /* The side of the shaft on the band's left, looking from the band toward the target. */
  const across = { x: along.y, y: -along.x };
  const tip = { x: root.x + along.x * length, y: root.y + along.y * length };
  const neck = { x: tip.x - along.x * HEAD.length, y: tip.y - along.y * HEAD.length };
  const side = (half: number, sign: 1 | -1): Point => ({
    x: neck.x - across.x * half * sign,
    y: neck.y - across.y * half * sign,
  });
  /* The corners sit on the band's edge itself, so the wedge leaves the band evenly on both sides at any angle. */
  const corner = { left: { x: root.x - ROOT, y: root.y }, right: { x: root.x + ROOT, y: root.y } };
  const neckLeft = side(NECK, 1);
  const neckRight = side(NECK, -1);
  return [
    `L ${point({ x: corner.right.x + FILLET, y: root.y })}`,
    `Q ${point(corner.right)} ${point(toward(corner.right, neckRight, FILLET))}`,
    `L ${point(neckRight)}`,
    `L ${point(side(HEAD.half, -1))}`,
    `L ${point(tip)}`,
    `L ${point(side(HEAD.half, 1))}`,
    `L ${point(neckLeft)}`,
    `L ${point(toward(corner.left, neckLeft, FILLET))}`,
    `Q ${point(corner.left)} ${point({ x: corner.left.x - FILLET, y: root.y })}`,
  ];
}

/*
 * A target that hugs the band, with no room for the wedge to come down at it, gets a hook instead (Norbert, 2026-10-23: "B"):
 * the band drops a short tail beside the target that turns and points across at it.
 * It hangs on the target's left, or on its right where the left has no room. Nothing at all when the target is too close for even that.
 */
function hook(band: Edges, target: Target): string[] | null {
  const edge = band.bottom;
  const y = target.y;
  if (y - HOOK.head.half < edge + HOOK.clear) {
    return null;
  }
  const reach = HOOK.gap + HOOK.head.length + HOOK.drop + HOOK.fillet;
  const fitsLeft = target.x - target.halfWidth - reach > band.left;
  const fitsRight = target.x + target.halfWidth + reach < band.right;
  if (!fitsLeft && !fitsRight) {
    return null;
  }
  /* Points right from the target's left, or left from its right; every x below is measured back from the tip. */
  const toward = fitsLeft ? 1 : -1;
  const tip = target.x - toward * (target.halfWidth + HOOK.gap);
  const at = (back: number, height: number): Point => ({ x: tip - toward * back, y: height });
  const base = HOOK.head.length;
  /* The tail's two sides, nearer the target and further from it. */
  const near = base + HOOK.reach;
  const far = near + HOOK.drop;
  const shaft = HOOK.shaft;
  const commands = [
    [at(near - HOOK.fillet, edge)],
    [at(near, edge), at(near, y - shaft)],
    [at(base, y - shaft)],
    [at(base, y - HOOK.head.half)],
    [at(0, y)],
    [at(base, y + HOOK.head.half)],
    [at(base, y + shaft)],
    [at(far - HOOK.bend, y + shaft)],
    [at(far, y + shaft), at(far, edge + HOOK.fillet)],
    [at(far, edge), at(far + HOOK.fillet, edge)],
  ];
  /* The outline runs right to left along the band's lower edge, so a hook on the target's right is walked the other way. */
  return (toward === 1 ? commands : backwards(commands)).map((step) =>
    step.length === 2 ? `Q ${point(step[0]!)} ${point(step[1]!)}` : `L ${point(step[0]!)}`
  );
}

/*
 * An outline walked from its other end. Each step is its end point, after its curve's control point if it has one;
 * the first step is where the outline starts. Walked back, each step ends where the step before it ended, through the same control.
 */
function backwards(steps: readonly (readonly Point[])[]): Point[][] {
  const end = (step: readonly Point[]) => step.at(-1)!;
  const result: Point[][] = [[end(steps.at(-1)!)]];
  for (let index = steps.length - 1; index > 0; index -= 1) {
    const step = steps[index]!;
    result.push(step.length === 2 ? [step[0]!, end(steps[index - 1]!)] : [end(steps[index - 1]!)]);
  }
  return result;
}

/**
 * The outline of the band, with its arrow toward `target` when there is one, as an SVG path.
 * The arrow leaves the band at `root`, a point on its lower edge.
 */
export function guideShapePath(band: Edges, root: Point, target: Target | null): string {
  const left = band.left - BLEED;
  const right = band.right + BLEED;
  const top = -BLEED;
  const arrow = target ? (wedge({ x: root.x, y: band.bottom }, target) ?? hook(band, target)) : null;
  /* Clockwise from the top left: across the top, down the right, back along the lower edge through the arrow. */
  return [
    `M ${point({ x: left, y: top })}`,
    `L ${point({ x: right, y: top })}`,
    `L ${point({ x: right, y: band.bottom })}`,
    ...(arrow ?? []),
    `L ${point({ x: left, y: band.bottom })}`,
    'Z',
  ].join(' ');
}

/* The short arrow beside a target, for a guide on the window's side: its length, its shaft and head, and its rounded tail's reach. */
const SHORT = { length: 96, shaft: 10, head: { half: 26, length: 32 } };

/**
 * A short arrow that comes in from `origin`'s direction and stops just short of `target`, as an SVG path, with where its tail ends.
 * It never stretches across the table: only its last stretch is drawn, so it reads as a marker on the part, not a line from the guide.
 */
export function shortArrowPath(origin: Point, target: Target): Readonly<{ path: string; tail: Point }> {
  const dx = target.x - origin.x;
  const dy = target.y - origin.y;
  const distance = Math.hypot(dx, dy) || 1;
  const along = { x: dx / distance, y: dy / distance };
  const across = { x: along.y, y: -along.x };
  const inside = Math.min(
    target.halfWidth / Math.max(Math.abs(along.x), 1e-6),
    target.halfHeight / Math.max(Math.abs(along.y), 1e-6)
  );
  const tip = { x: target.x - along.x * (inside + ARROW_GAP_PX), y: target.y - along.y * (inside + ARROW_GAP_PX) };
  const at = (back: number, side: number): Point => ({
    x: tip.x - along.x * back + across.x * side,
    y: tip.y - along.y * back + across.y * side,
  });
  const neck = SHORT.head.length;
  const end = SHORT.length;
  const shaft = SHORT.shaft;
  /* The tail is rounded off by two quarter curves around its end. */
  const path = [
    `M ${point(at(end, shaft))}`,
    `L ${point(at(neck, shaft))}`,
    `L ${point(at(neck, SHORT.head.half))}`,
    `L ${point(tip)}`,
    `L ${point(at(neck, -SHORT.head.half))}`,
    `L ${point(at(neck, -shaft))}`,
    `L ${point(at(end, -shaft))}`,
    `Q ${point(at(end + shaft, -shaft))} ${point(at(end + shaft, 0))}`,
    `Q ${point(at(end + shaft, shaft))} ${point(at(end, shaft))}`,
    'Z',
  ].join(' ');
  return { path, tail: at(end + shaft + 22, 0) };
}

/** A rounded ring around `target`, padded off its edge, as an SVG path; a point gets a round ring of its own. */
export function ringPath(target: Target): string {
  const pad = 10;
  const halfWidth = Math.max(target.halfWidth + pad, 30);
  const halfHeight = Math.max(target.halfHeight + pad, 30);
  const radius = Math.min(halfWidth, halfHeight, 30);
  const left = target.x - halfWidth;
  const right = target.x + halfWidth;
  const top = target.y - halfHeight;
  const bottom = target.y + halfHeight;
  return [
    `M ${point({ x: left + radius, y: top })}`,
    `L ${point({ x: right - radius, y: top })}`,
    `Q ${point({ x: right, y: top })} ${point({ x: right, y: top + radius })}`,
    `L ${point({ x: right, y: bottom - radius })}`,
    `Q ${point({ x: right, y: bottom })} ${point({ x: right - radius, y: bottom })}`,
    `L ${point({ x: left + radius, y: bottom })}`,
    `Q ${point({ x: left, y: bottom })} ${point({ x: left, y: bottom - radius })}`,
    `L ${point({ x: left, y: top + radius })}`,
    `Q ${point({ x: left, y: top })} ${point({ x: left + radius, y: top })}`,
    'Z',
  ].join(' ');
}
