import { BOARD_RADIUS } from '@shared/play/tableGeometry';
import { PLAYER_RING_RADIUS } from '@shared/play/tableSettings';
import { playUiColors } from '@shared/uiPalette';
import { createContext } from 'react';
import { ExtrudeGeometry, Path, Shape, Vector2 } from 'three';
import type { BufferGeometry } from 'three';

/* The round base covers about a third of the planet's radius (Norbert, #1007). */
const RADIUS = BOARD_RADIUS * 0.35;
/* The token rests on the Seat's station at the player ring; the point stops a hand's width short of its edge. */
const TIP = PLAYER_RING_RADIUS - 0.5;
const DEPTH = 0.08;

/** The bidder shapes on trial: the current teardrop and six proposals (bidder shape exploration, Norbert 2026-11-08). */
export const BIDDER_SHAPES = [
  'current',
  'needle',
  'clockHand',
  'softDrop',
  'chevron',
  'bluntDrop',
  'dial',
  'hollowBluntDrop',
] as const;
export type BidderShape = (typeof BIDDER_SHAPES)[number];

/** Which shape the bidder draws; only the shape exploration stories pick another. */
export const BidderShapeContext = createContext<BidderShape>('current');

/** One flat slab of the bidder: its outline extruded, laid on the table, raised by `lift` and painted in `color`. */
export type BidderPart = { geometry: BufferGeometry; color: string; lift: number };

const ground = playUiColors.bidderGround;
const accent = playUiColors.bidderAccent;

/* Every outline is drawn with its point along +x and laid flat, the same frame the turn expects. */
function slab(shape: Shape, depth = DEPTH, bevel = 0) {
  const geometry = new ExtrudeGeometry(shape, {
    depth,
    bevelEnabled: bevel > 0,
    bevelThickness: bevel,
    bevelSize: bevel,
    bevelSegments: 4,
    curveSegments: 64,
  });
  geometry.rotateX(-Math.PI / 2);
  return geometry;
}

function circle(radius: number, hole = 0) {
  const shape = new Shape();
  shape.absarc(0, 0, radius, 0, Math.PI * 2, false);
  if (hole > 0) {
    const path = new Path();
    path.absarc(0, 0, hole, 0, Math.PI * 2, true);
    shape.holes.push(path);
  }
  return shape;
}

/* A round end at the origin narrowing straight to a point at `tip`, along the tangents. */
function teardrop(radius: number, tip: number) {
  const tangent = Math.acos(radius / tip);
  const shape = new Shape();
  shape.moveTo(tip, 0);
  shape.lineTo(radius * Math.cos(tangent), radius * Math.sin(tangent));
  shape.absarc(0, 0, radius, tangent, Math.PI * 2 - tangent, false);
  shape.lineTo(tip, 0);
  return shape;
}

/* A slim kite from `from` to `to` along +x, widest at `widest`. */
function kite(from: number, widest: number, to: number, halfWidth: number) {
  const shape = new Shape();
  shape.moveTo(from, 0);
  shape.lineTo(widest, halfWidth);
  shape.lineTo(to, 0);
  shape.lineTo(widest, -halfWidth);
  shape.lineTo(from, 0);
  return shape;
}

function current(): BidderPart[] {
  return [{ geometry: slab(teardrop(RADIUS, TIP)), color: ground, lift: 0 }];
}

/* A smaller dark disc under a slim brass compass needle that runs across it to the faction. */
function needle(): BidderPart[] {
  const radius = RADIUS * 0.8;
  return [
    { geometry: slab(circle(radius)), color: ground, lift: 0 },
    { geometry: slab(kite(-radius * 0.9, radius * 0.25, TIP, 0.16), 0.04), color: accent, lift: DEPTH },
  ];
}

/* The dark disc in a brass ring, with a tapered brass clock hand from its rim to the faction. */
function clockHand(): BidderPart[] {
  const hand = new Shape();
  hand.moveTo(RADIUS - 0.1, 0.14);
  hand.lineTo(TIP, 0.025);
  hand.lineTo(TIP, -0.025);
  hand.lineTo(RADIUS - 0.1, -0.14);
  hand.lineTo(RADIUS - 0.1, 0.14);
  return [
    { geometry: slab(circle(RADIUS)), color: ground, lift: 0 },
    { geometry: slab(circle(RADIUS, RADIUS - 0.09), 0.03), color: accent, lift: DEPTH },
    { geometry: slab(hand, 0.04), color: accent, lift: 0.02 },
  ];
}

/* A drop with gently hollowed sides and a shorter point, on a brass outline. */
function softDrop(): BidderPart[] {
  const tip = TIP - 0.7;
  const outline = (radius: number, reach: number) => {
    /* The sides leave the round end along its tangent and bow inwards on their way to the point. */
    const start = Math.PI / 4;
    const pull = radius * 0.65;
    const control = [
      radius * Math.cos(start) + pull * Math.sin(start),
      radius * Math.sin(start) - pull * Math.cos(start),
    ] as const;
    const shape = new Shape();
    shape.moveTo(reach, 0);
    shape.quadraticCurveTo(control[0], control[1], radius * Math.cos(start), radius * Math.sin(start));
    shape.absarc(0, 0, radius, start, Math.PI * 2 - start, false);
    shape.quadraticCurveTo(control[0], -control[1], reach, 0);
    return shape;
  };
  return [
    { geometry: slab(outline(RADIUS + 0.07, tip + 0.2), 0.05), color: accent, lift: 0 },
    { geometry: slab(outline(RADIUS, tip), DEPTH - 0.02), color: ground, lift: 0.02 },
  ];
}

/* The dark disc alone, and a brass chevron standing apart from it, pointing at the faction. */
function chevron(): BidderPart[] {
  const back = RADIUS + 0.45;
  const point = TIP - 0.25;
  const arm = 0.5;
  const thick = 0.26;
  const shape = new Shape();
  shape.moveTo(point, 0);
  shape.lineTo(back, arm);
  shape.lineTo(back + thick, 0);
  shape.lineTo(back, -arm);
  shape.lineTo(point, 0);
  return [
    { geometry: slab(circle(RADIUS)), color: ground, lift: 0 },
    { geometry: slab(shape, 0.05), color: accent, lift: 0 },
  ];
}

/* The hull of the round end and a small round nose: a cone with a blunt tip and no sharp point. */
function bluntDrop(): BidderPart[] {
  const nose = 0.24;
  const reach = TIP - 0.3 - nose;
  /* The tangent common to both circles, from the round end to the nose. */
  const angle = Math.acos((RADIUS - nose) / reach);
  const shape = new Shape();
  shape.absarc(0, 0, RADIUS, angle, Math.PI * 2 - angle, false);
  shape.absarc(reach, 0, nose, -angle, angle, false);
  shape.closePath();
  return [{ geometry: slab(shape, DEPTH, 0.03), color: ground, lift: 0 }];
}

/* An open dark ring the board shows through, with a long brass pointer from its rim at the faction. */
function dial(): BidderPart[] {
  const outer = RADIUS * 0.9;
  const tab = new Shape();
  tab.moveTo(TIP - 0.2, 0);
  tab.lineTo(outer - 0.15, 0.26);
  tab.lineTo(outer - 0.15, -0.26);
  tab.lineTo(TIP - 0.2, 0);
  return [
    { geometry: slab(circle(outer, outer - 0.32)), color: ground, lift: 0 },
    { geometry: slab(tab, 0.05), color: accent, lift: DEPTH - 0.02 },
  ];
}

/*
 * The blunt drop's outline: the round end and a small round nose joined along their common tangents.
 * Shrinking both radii by the same amount keeps the tangent angle, so an inset outline runs parallel to this one.
 */
function bluntOutline(radius: number, nose: number, reach: number) {
  const angle = Math.acos((radius - nose) / reach);
  const path = new Path();
  path.absarc(0, 0, radius, angle, Math.PI * 2 - angle, false);
  path.absarc(reach, 0, nose, -angle, angle, false);
  path.closePath();
  return path.getPoints(64);
}

/* The blunt drop as an open band: the board shows through its middle, under the bidding face. */
function hollowBluntDrop(): BidderPart[] {
  const nose = 0.24;
  const band = 0.22;
  const reach = TIP - 0.3 - nose;
  const shape = new Shape(bluntOutline(RADIUS, nose, reach));
  const hole = new Path(
    bluntOutline(RADIUS - band, nose - band, reach)
      .reverse()
      .map((point) => new Vector2(point.x, point.y))
  );
  shape.holes.push(hole);
  return [{ geometry: slab(shape, DEPTH, 0.02), color: ground, lift: 0 }];
}

const BUILDERS: Record<BidderShape, () => BidderPart[]> = {
  current,
  needle,
  clockHand,
  softDrop,
  chevron,
  bluntDrop,
  dial,
  hollowBluntDrop,
};

/** The slabs that make up the bidder in the given shape, pointing along +x. */
export function bidderParts(shape: BidderShape): BidderPart[] {
  return BUILDERS[shape]();
}
