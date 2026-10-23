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
