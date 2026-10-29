/*
 * A game's boards (Norbert, 2026-10-29): one main board in the middle of the table and up to six extra boards, each
 * about two thirds its size. The extras stand on one arc round the main board, spread evenly over its upper half:
 * one extra sits on top, two sit left and right, and more share the arc between them. The table flows out to them in
 * one smooth piece, with curved joins between the main table, the extras and their neighbours.
 */

export const MAX_EXTRA_BOARDS = 6;
/* An extra board is this much the size of the main board: its map, its rim and the pieces' room on it. */
export const EXTRA_BOARD_SCALE = 0.63;
/* Every extra board's centre lies this far from the main board's: just past the card shelves at the sides. */
const EXTRA_BOARD_ARC_RADIUS = 10.3;
/* The table round an extra board reaches this far past its rim, as the main table reaches past the main board's. */
const EXTRA_TABLE_MARGIN = 0.75;
/* Main board numbers repeated from tableGeometry, which imports this module. */
const MAIN_BOARD_RIM_RADIUS = 4.23;
export const EXTRA_BOARD_TABLE_RADIUS = MAIN_BOARD_RIM_RADIUS * EXTRA_BOARD_SCALE + EXTRA_TABLE_MARGIN;
/* The joins start from a round just inside the main table's edge, so they flow out of it rather than meeting it. */
const MAIN_JOIN_RADIUS = 5.3;
/* How far apart two rounds may be and still flow together; larger makes wider, softer joins. */
const JOIN_SOFTNESS = 6.5;
/* The outline is kept as the table's reach in this many directions round the middle. */
const OUTLINE_SAMPLES = 720;
const OUTLINE_SEARCH_LIMIT = 16;
const OUTLINE_SEARCH_STEP = 0.1;
const OUTLINE_REFINEMENTS = 12;

/** One board on the table: where its centre stands and how large it is against the main board. */
export type BoardPlacement = Readonly<{ x: number; z: number; scale: number }>;

export const MAIN_BOARD_PLACEMENT: BoardPlacement = { x: 0, z: 0, scale: 1 };

/** How many extra boards a table has, from its stored count; anything out of range counts as none or the most. */
export function extraBoardCount(count: number | undefined): number {
  return Math.max(0, Math.min(MAX_EXTRA_BOARDS, Math.trunc(count ?? 0)));
}

/* Where on the arc each extra stands, as an angle on the table: -π/2 is the top, π the left and 0 the right. */
function arcAngles(count: number): number[] {
  if (count === 1) {
    return [-Math.PI / 2];
  }
  return Array.from({ length: count }, (_, index) => Math.PI + (index * Math.PI) / (count - 1));
}

/* Worked out once per count: the table's surface is asked for its boards on every move. */
const PLACEMENTS: readonly (readonly BoardPlacement[])[] = Array.from({ length: MAX_EXTRA_BOARDS + 1 }, (_, count) => [
  MAIN_BOARD_PLACEMENT,
  ...arcAngles(count).map((angle) => ({
    x: Math.cos(angle) * EXTRA_BOARD_ARC_RADIUS,
    z: Math.sin(angle) * EXTRA_BOARD_ARC_RADIUS,
    scale: EXTRA_BOARD_SCALE,
  })),
]);

/** Every board on the table, the main board first, then the extras in board order, left to right over the top. */
export function boardPlacements(count: number | undefined): readonly BoardPlacement[] {
  return PLACEMENTS[extraBoardCount(count)] ?? [MAIN_BOARD_PLACEMENT];
}

/** The extra boards' placements, in board order: the game's second board first. */
export function extraBoardPlacements(count: number | undefined): readonly BoardPlacement[] {
  return boardPlacements(count).slice(1);
}

/** The round of table each extra board stands on. */
export type ExtraBoardRound = Readonly<{ x: number; z: number; radius: number }>;

export function extraBoardRounds(count: number | undefined): readonly ExtraBoardRound[] {
  return extraBoardPlacements(count).map(({ x, z }) => ({ x, z, radius: EXTRA_BOARD_TABLE_RADIUS }));
}

/* A union of two distances that blends where they come within `softness` of each other, so rounds join in curves. */
function smoothUnion(a: number, b: number, softness: number): number {
  const blend = Math.max(softness - Math.abs(a - b), 0) / softness;
  return Math.min(a, b) - (blend * blend * softness) / 4;
}

/* How far outside the table the extras add a point lies; zero or less is on it. */
function extraTableDistance(rounds: readonly ExtraBoardRound[], x: number, z: number): number {
  let distance = Math.hypot(x, z) - MAIN_JOIN_RADIUS;
  for (const round of rounds) {
    distance = smoothUnion(distance, Math.hypot(x - round.x, z - round.z) - round.radius, JOIN_SOFTNESS);
  }
  return distance;
}

/* The table's reach from the middle in one direction: the furthest point along it that is still on the table. */
function reachAlong(rounds: readonly ExtraBoardRound[], angle: number): number {
  const cos = Math.cos(angle);
  const sin = Math.sin(angle);
  const on = (radius: number) => extraTableDistance(rounds, cos * radius, sin * radius) <= 0;
  let outside = OUTLINE_SEARCH_LIMIT;
  let inside = outside - OUTLINE_SEARCH_STEP;
  while (inside > MAIN_JOIN_RADIUS && !on(inside)) {
    outside = inside;
    inside -= OUTLINE_SEARCH_STEP;
  }
  for (let step = 0; step < OUTLINE_REFINEMENTS; step++) {
    const middle = (inside + outside) / 2;
    if (on(middle)) {
      inside = middle;
    } else {
      outside = middle;
    }
  }
  return Math.max(inside, MAIN_JOIN_RADIUS);
}

/*
 * The extra table's edge as its reach in every direction, worked out once per count on first use. Seen from the middle
 * the shape never folds back on itself, so its reach in each direction says everything: what is drawn, where a piece
 * may rest and where a close look may go all read the same edge.
 */
const REACHES = new Map<number, Float64Array>();

function reaches(count: number): Float64Array {
  const known = REACHES.get(count);
  if (known) {
    return known;
  }
  const rounds = extraBoardRounds(count);
  const found = new Float64Array(OUTLINE_SAMPLES);
  for (let index = 0; index < OUTLINE_SAMPLES; index++) {
    found[index] = reachAlong(rounds, (index / OUTLINE_SAMPLES) * Math.PI * 2);
  }
  REACHES.set(count, found);
  return found;
}

/** How far the table the extras add reaches from the middle at a direction, between the samples. */
export function extraTableReach(count: number | undefined, angle: number): number {
  const extras = extraBoardCount(count);
  if (extras === 0) {
    return 0;
  }
  const samples = reaches(extras);
  const position = ((((angle / (Math.PI * 2)) % 1) + 1) % 1) * OUTLINE_SAMPLES;
  const below = Math.floor(position) % OUTLINE_SAMPLES;
  const above = (below + 1) % OUTLINE_SAMPLES;
  const blend = position - Math.floor(position);
  return samples[below]! * (1 - blend) + samples[above]! * blend;
}

/** How far inside the table the extras add a point lies; negative outside it. */
export function extraTableDepth(count: number | undefined, x: number, z: number): number {
  return extraBoardCount(count) === 0
    ? Number.NEGATIVE_INFINITY
    : extraTableReach(count, Math.atan2(z, x)) - Math.hypot(x, z);
}

/** Whether a point on the table lies over the table the extra boards add. */
export function isOnExtraTable(count: number | undefined, x: number, z: number): boolean {
  return extraTableDepth(count, x, z) >= 0;
}

/** The point of the extra table nearest a point outside it, `inset` in from the edge, toward the middle. */
export function nearestOnExtraTable(count: number | undefined, x: number, z: number, inset = 0): [number, number] {
  const angle = Math.atan2(z, x);
  const radius = Math.min(Math.hypot(x, z), Math.max(0, extraTableReach(count, angle) - inset));
  return [Math.cos(angle) * radius, Math.sin(angle) * radius];
}

/** The extra table's edge, as [x, z] corners round the middle; empty without extra boards. */
export function extraTableOutline(count: number | undefined, spread = 0): readonly (readonly [x: number, z: number])[] {
  const extras = extraBoardCount(count);
  if (extras === 0) {
    return [];
  }
  return Array.from(reaches(extras), (reach, index) => {
    const angle = (index / OUTLINE_SAMPLES) * Math.PI * 2;
    return [Math.cos(angle) * (reach + spread), Math.sin(angle) * (reach + spread)] as const;
  });
}
