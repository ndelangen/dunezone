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
/* How far the outline reaches past the window's edges, so only its lower edge and the wedge show. */
const BLEED = 4;

/** How far short of its target's edge the arrow's tip stops. */
export const ARROW_GAP_PX = 30;

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
  /* How far the arrow's line runs inside the target's box before it reaches the middle. */
  const inside = Math.min(
    target.halfWidth / Math.max(Math.abs(dx / distance), 1e-6),
    target.halfHeight / Math.max(Math.abs(dy / distance), 1e-6)
  );
  const length = distance - inside - ARROW_GAP_PX;
  if (length < HEAD.length + FILLET + 20 || dy <= 0) {
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

/**
 * The outline of the band, with its arrow toward `target` when there is one, as an SVG path.
 * The arrow leaves the band at `root`, a point on its lower edge.
 */
export function guideShapePath(band: Edges, root: Point, target: Target | null): string {
  const left = band.left - BLEED;
  const right = band.right + BLEED;
  const top = -BLEED;
  const arrow = target ? wedge({ x: root.x, y: band.bottom }, target) : null;
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

