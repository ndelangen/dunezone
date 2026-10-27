/*
 * The tutorial rail and its arrow, drawn as one outline: the rail down the left of the window,
 * and a wedge that grows out of its edge toward the thing to use.
 * One outline lets the rail's inner shadow and its edge run on into the wedge, so the two read as a single shape.
 * The wedge stops short of its target, so it points at the part without covering it.
 * The geometry below is worked out as a band across the top of the window, its arrow growing down;
 * `transposed` turns that onto its side, into the rail.
 */

export type Point = Readonly<{ x: number; y: number }>;
export type Edges = Readonly<{ left: number; right: number; bottom: number }>;
/** A box on the page the arrow should not cross, such as an open window. */
export type Obstacle = Readonly<{ left: number; top: number; right: number; bottom: number }>;
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
  const shortest = HEAD.length + FILLET + 20;
  const along = { x: dx / distance, y: dy / distance };
  /* The side of the shaft on the band's left, looking from the band toward the target. */
  const across = { x: along.y, y: -along.x };
  const head = (length: number) => {
    const tip = { x: root.x + along.x * length, y: root.y + along.y * length };
    const neck = { x: tip.x - along.x * HEAD.length, y: tip.y - along.y * HEAD.length };
    const side = (half: number, sign: 1 | -1): Point => ({
      x: neck.x - across.x * half * sign,
      y: neck.y - across.y * half * sign,
    });
    return { tip, side };
  };
  /*
   * The tip stops short of the target's edge along its line, and then further back until the barbs clear it as well:
   * met near a corner at a slant, a barb would otherwise reach over what sits at the target's edge, such as a field's label.
   */
  let length = distance - inside - ARROW_GAP_PX;
  while (length >= shortest && !headClear(head(length), target)) {
    length -= 2;
  }
  if (length < shortest) {
    return null;
  }
  const { tip, side } = head(length);
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

/* Whether the arrowhead, its tip, both barbs and the edges between them, keeps the gap from every side of the target's box. */
function headClear(
  { tip, side }: Readonly<{ tip: Point; side: (half: number, sign: 1 | -1) => Point }>,
  target: Target
): boolean {
  const outside = (p: Point) =>
    Math.abs(p.x - target.x) >= target.halfWidth + ARROW_GAP_PX ||
    Math.abs(p.y - target.y) >= target.halfHeight + ARROW_GAP_PX;
  return ([1, -1] as const).every((sign) => {
    const barb = side(HEAD.half, sign);
    return [0, 0.25, 0.5, 0.75, 1].every((t) =>
      outside({ x: tip.x + (barb.x - tip.x) * t, y: tip.y + (barb.y - tip.y) * t })
    );
  });
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

/* How much of the segment from `from` to `to` runs through `box`, as a share of its length, by clipping it to the box's slabs. */
function inside(from: Point, to: Point, box: Obstacle): number {
  let enter = 0;
  let leave = 1;
  for (const [start, delta, low, high] of [
    [from.x, to.x - from.x, box.left, box.right],
    [from.y, to.y - from.y, box.top, box.bottom],
  ] as const) {
    if (Math.abs(delta) < 1e-9) {
      if (start < low || start > high) {
        return 0;
      }
      continue;
    }
    const a = (low - start) / delta;
    const b = (high - start) / delta;
    enter = Math.max(enter, Math.min(a, b));
    leave = Math.min(leave, Math.max(a, b));
  }
  return Math.max(0, leave - enter);
}

/**
 * Where along the band's edge the arrow leaves from so it crosses as little of `obstacles` as it can, none where there is a way, as near `preferred` as that allows.
 * A box holding the target itself is not in the way.
 */
export function clearRoot(
  band: Edges,
  preferred: number,
  target: Target,
  obstacles: readonly Obstacle[],
  margin: number
): number {
  /* Each box grows by the shaft's half width and a little, so the wedge's sides keep off it too, not just its line. */
  const grow = NECK + 4;
  const blocking = obstacles
    .filter((box) => !(target.x >= box.left && target.x <= box.right && target.y >= box.top && target.y <= box.bottom))
    .map((box) => ({ left: box.left - grow, top: box.top - grow, right: box.right + grow, bottom: box.bottom + grow }));
  /* How far the arrow from `x` would run over the boxes, or nothing when the wedge could not be drawn from there at all. */
  const overlap = (x: number) => {
    const from = { x, y: band.bottom };
    const distance = Math.hypot(target.x - x, target.y - band.bottom);
    if (distance <= 0 || (target.y - band.bottom) / distance < 0.5) {
      return Infinity;
    }
    return blocking.reduce((total, box) => total + inside(from, target, box) * distance, 0);
  };
  let best = preferred;
  let least = overlap(preferred);
  const low = band.left + margin;
  const high = band.right - margin;
  for (let offset = 8; least > 0 && offset <= high - low; offset += 8) {
    for (const x of [preferred - offset, preferred + offset]) {
      const over = x >= low && x <= high ? overlap(x) : Infinity;
      /* A root nearer the preferred one wins unless a further one crosses clearly less. */
      if (over < least - 1) {
        best = x;
        least = over;
      }
    }
  }
  return best;
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

/**
 * A path mirrored across the window's diagonal, every point's x and y swapped: the band's outline, worked out along a top edge, becomes a rail's down the left with its arrow grown from the rail's right edge.
 */
export function transposed(path: string): string {
  return path.replaceAll(/(-?[\d.]+) (-?[\d.]+)/g, '$2 $1');
}
