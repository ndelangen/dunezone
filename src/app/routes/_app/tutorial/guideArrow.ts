/*
 * The tutorial band's arrow: a part of the band itself that reaches down into the table toward the thing to use.
 * It is drawn as one filled outline whose top runs under the band, so band and arrow read as a single shape,
 * and it stops short of its target, so it points at the part without covering it.
 */

export type Point = Readonly<{ x: number; y: number }>;

/** The arrow shapes on trial (Norbert, 2026-10-23: "create multiple possible variants"). */
export const GUIDE_ARROWS = ['wedge', 'tail', 'ribbon', 'caret'] as const;
export type GuideArrow = (typeof GUIDE_ARROWS)[number];

type Shape = Readonly<{
  /** Half the width where the arrow leaves the band. */
  root: number;
  /** Half the shaft's width just behind the head, or 0 for a point with no head. */
  neck: number;
  /** Half the head's width, and its length. */
  head: Readonly<{ half: number; length: number }> | null;
  /** How far the shaft bows sideways, as a share of its length. */
  bend: number;
  /** The rounded corner where the arrow meets the band's lower edge. */
  fillet: number;
}>;

const SHAPES: Record<GuideArrow, Shape> = {
  /* A straight wedge that narrows from a broad root into a clean head. */
  wedge: { root: 34, neck: 9, head: { half: 24, length: 30 }, bend: 0, fillet: 22 },
  /* A speech bubble's tail: a curved swoop from a wide root down to a sharp point. */
  tail: { root: 46, neck: 0, head: null, bend: 0.16, fillet: 28 },
  /* An even ribbon that bows on its way down, with a broad head. */
  ribbon: { root: 13, neck: 13, head: { half: 28, length: 32 }, bend: 0.12, fillet: 26 },
  /* A tooltip's caret stretched long: straight sides from a wide root to the point. */
  caret: { root: 40, neck: 0, head: null, bend: 0, fillet: 16 },
};

/** How far short of its target the arrow's tip stops. */
export const ARROW_GAP_PX = 50;
const SAMPLES = 24;

const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

/**
 * The outline of the band's arrow from `root` on the band's lower edge toward `target`, as an SVG path.
 * The outline begins and ends a little above the edge, under the band, so the seam does not show.
 */
export function guideArrowPath(arrow: GuideArrow, root: Point, target: Point): string | null {
  const shape = SHAPES[arrow];
  const dx = target.x - root.x;
  const dy = target.y - root.y;
  const distance = Math.hypot(dx, dy);
  const length = distance - ARROW_GAP_PX;
  if (length < 40) {
    return null;
  }
  const along = { x: dx / distance, y: dy / distance };
  /* The side of the shaft to its left, as seen looking from the band toward the target. */
  const across = { x: along.y, y: -along.x };
  const tip = { x: root.x + along.x * length, y: root.y + along.y * length };
  const headLength = shape.head?.length ?? 0;
  const neck = { x: tip.x - along.x * headLength, y: tip.y - along.y * headLength };
  /* The shaft bows through a control point pushed sideways from its middle. */
  const bow = shape.bend * length;
  const control = {
    x: lerp(root.x, neck.x, 0.5) + across.x * bow,
    y: lerp(root.y, neck.y, 0.5) + across.y * bow,
  };

  const left: Point[] = [];
  const right: Point[] = [];
  for (let index = 0; index <= SAMPLES; index += 1) {
    const t = index / SAMPLES;
    const at = {
      x: (1 - t) ** 2 * root.x + 2 * (1 - t) * t * control.x + t ** 2 * neck.x,
      y: (1 - t) ** 2 * root.y + 2 * (1 - t) * t * control.y + t ** 2 * neck.y,
    };
    const tangent = {
      x: 2 * (1 - t) * (control.x - root.x) + 2 * t * (neck.x - control.x),
      y: 2 * (1 - t) * (control.y - root.y) + 2 * t * (neck.y - control.y),
    };
    const size = Math.hypot(tangent.x, tangent.y) || 1;
    const side = { x: tangent.y / size, y: -tangent.x / size };
    /* The width eases from the root to the neck, quicker at first, as a tail or a wedge narrows. */
    const half = lerp(shape.root, shape.neck, 1 - (1 - t) ** 1.6);
    left.push({ x: at.x + side.x * half, y: at.y + side.y * half });
    right.push({ x: at.x - side.x * half, y: at.y - side.y * half });
  }

  /* The root's corners run out along the band's edge, so the arrow grows out of the band instead of standing on it. */
  const [first, second] = left[0]!.x < right[0]!.x ? [left, right] : [right, left];
  const fillet = shape.fillet;
  const hidden = root.y - 8;
  const point = (p: Point) => `${p.x.toFixed(1)} ${p.y.toFixed(1)}`;
  const parts = [
    `M ${point({ x: first[0]!.x - fillet, y: hidden })}`,
    `L ${point({ x: first[0]!.x - fillet, y: root.y })}`,
    `Q ${point({ x: first[0]!.x, y: root.y })} ${point(first[2]!)}`,
    ...first.slice(3).map((p) => `L ${point(p)}`),
  ];
  const lastFirst = first.at(-1)!;
  const lastSecond = second.at(-1)!;
  if (shape.head) {
    const wide = (from: Point) => ({
      x: neck.x + ((from.x - neck.x) / (shape.neck || 1)) * shape.head!.half,
      y: neck.y + ((from.y - neck.y) / (shape.neck || 1)) * shape.head!.half,
    });
    parts.push(`L ${point(wide(lastFirst))}`, `L ${point(tip)}`, `L ${point(wide(lastSecond))}`);
  } else {
    parts.push(`L ${point(tip)}`);
  }
  parts.push(
    ...second
      .slice(2)
      .reverse()
      .map((p) => `L ${point(p)}`),
    `Q ${point({ x: second[0]!.x, y: root.y })} ${point({ x: second[0]!.x + fillet, y: root.y })}`,
    `L ${point({ x: second[0]!.x + fillet, y: hidden })}`,
    'Z'
  );
  return parts.join(' ');
}
