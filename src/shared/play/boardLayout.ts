/*
 * A game's table layout (Norbert, 2026-10-29). The standard table holds one board. The two-board table holds a second
 * board of the same size to the left of the main board, on one rounded table shaped round both: the main board keeps
 * the player stations, the trackers run along the top over the second board, and four tabs below the boards hold,
 * from left to right, the shared table inventory, the Tleilaxu Tanks, the Treachery deck and the Spice deck.
 */

import { STANDARD_PHASE_COUNT, trackerArcSlots } from './tableTrackers';
import type { TrackerArcSlot } from './tableTrackers';

export const TABLE_LAYOUTS = ['one-board', 'two-boards'] as const;
export type TableLayout = (typeof TABLE_LAYOUTS)[number];

/** A table's layout, from its stored value; a table that stores none is the standard one-board table. */
export function tableLayoutOf(layout: TableLayout | undefined): TableLayout {
  return layout ?? 'one-board';
}

/** One board on the table: where its centre stands and how large it is against the main board. */
export type BoardPlacement = Readonly<{ x: number; z: number; scale: number }>;

export const MAIN_BOARD_PLACEMENT: BoardPlacement = { x: 0, z: 0, scale: 1 };

/* The second board's centre lies this far left of the main board's: the boards' rims stand a little under a unit apart. */
const SECOND_BOARD_X = -9.4;
export const SECOND_BOARD_PLACEMENT: BoardPlacement = { x: SECOND_BOARD_X, z: 0, scale: 1 };

const ONE_BOARD: readonly BoardPlacement[] = [MAIN_BOARD_PLACEMENT];
const TWO_BOARDS: readonly BoardPlacement[] = [MAIN_BOARD_PLACEMENT, SECOND_BOARD_PLACEMENT];

/** Every board on the table, the main board first. */
export function boardPlacements(layout: TableLayout = 'one-board'): readonly BoardPlacement[] {
  return layout === 'two-boards' ? TWO_BOARDS : ONE_BOARD;
}

/*
 * The two-board table, as a distance from its edge: negative on the table. Its body is a capsule round both boards;
 * the tracker discs push scallops out of its top edge, and four tabs reach down from its bottom edge, joined to the
 * body in small curves. Rendering, physics, zoom and pings all read this one shape.
 */

/* The body reaches this far past each board's centre, as the standard table reaches past its board. */
const BODY_RADIUS = 5.47;
/* The tabs below the boards, as [left, right] across the table. */
export const TWO_BOARD_TABS = {
  inventory: [-12.45, -8.95],
  tanks: [-8.07, -2.35],
  treachery: [-1.75, 0.8],
  spice: [1.35, 3.85],
} as const satisfies Record<string, readonly [number, number]>;
/* Every tab starts inside the body and ends this far down the table. */
const TAB_TOP_Z = 3.5;
export const TAB_BOTTOM_Z = 9.5;
const TAB_CORNER_RADIUS = 0.32;
/* The tracker scallops reach this far past each disc, as on the standard table's crown. */
const SCALLOP_BORDER = 0.16;
const SCALLOP_SOFTNESS = 0.3;
const TAB_SOFTNESS = 0.45;

/* The tracker discs the table's scallops wrap round: the standard turn's, worked out on first use. */
let trackerDiscs: readonly TrackerArcSlot[] | null = null;

function twoBoardTrackerDiscs(): readonly TrackerArcSlot[] {
  trackerDiscs ??= trackerArcSlots(STANDARD_PHASE_COUNT, 'two-boards');
  return trackerDiscs;
}

/* A union of two distances that blends where they come within `softness` of each other, so shapes join in curves. */
function smoothUnion(a: number, b: number, softness: number): number {
  const blend = Math.max(softness - Math.abs(a - b), 0) / softness;
  return Math.min(a, b) - (blend * blend * softness) / 4;
}

function tabDistance([left, right]: readonly [number, number], x: number, z: number): number {
  const halfX = (right - left) / 2 - TAB_CORNER_RADIUS;
  const halfZ = (TAB_BOTTOM_Z - TAB_TOP_Z) / 2 - TAB_CORNER_RADIUS;
  const qx = Math.abs(x - (left + right) / 2) - halfX;
  const qz = Math.abs(z - (TAB_TOP_Z + TAB_BOTTOM_Z) / 2) - halfZ;
  return Math.hypot(Math.max(qx, 0), Math.max(qz, 0)) + Math.min(Math.max(qx, qz), 0) - TAB_CORNER_RADIUS;
}

/** How far outside the two-board table a point lies; zero or less is on it. */
export function twoBoardTableDistance(x: number, z: number): number {
  const along = Math.max(SECOND_BOARD_X, Math.min(0, x));
  let distance = Math.hypot(x - along, z) - BODY_RADIUS;
  for (const { position, radius } of twoBoardTrackerDiscs()) {
    const disc = Math.hypot(x - position[0], z - position[2]) - radius - SCALLOP_BORDER;
    distance = smoothUnion(distance, disc, SCALLOP_SOFTNESS);
  }
  for (const tab of Object.values(TWO_BOARD_TABS)) {
    distance = smoothUnion(distance, tabDistance(tab, x, z), TAB_SOFTNESS);
  }
  return distance;
}

/** Whether a point lies on the two-board table, at least `inset` in from its edge. */
export function isOnTwoBoardTable(x: number, z: number, inset = 0): boolean {
  return twoBoardTableDistance(x, z) + inset <= 0;
}

const GRADIENT_STEP = 1e-3;
const PROJECTION_STEPS = 12;

/** The point nearest a point off the two-board table that lies `inset` in from its edge. */
export function nearestOnTwoBoardTable(x: number, z: number, inset = 0): [number, number] {
  let px = x;
  let pz = z;
  for (let step = 0; step < PROJECTION_STEPS; step++) {
    const distance = twoBoardTableDistance(px, pz) + inset;
    if (distance <= 0) {
      break;
    }
    const gx = (twoBoardTableDistance(px + GRADIENT_STEP, pz) - twoBoardTableDistance(px - GRADIENT_STEP, pz)) / 2;
    const gz = (twoBoardTableDistance(px, pz + GRADIENT_STEP) - twoBoardTableDistance(px, pz - GRADIENT_STEP)) / 2;
    const length = Math.hypot(gx, gz) || 1;
    /* A hair past the edge, so the point lands on the table rather than on its line. */
    px -= ((distance + 1e-4) * gx) / length;
    pz -= ((distance + 1e-4) * gz) / length;
  }
  return [px, pz];
}

/* The outline is traced over a grid this fine, over bounds that hold the whole table. */
const OUTLINE_CELL = 0.04;
const OUTLINE_BOUNDS = { minX: -15.6, maxX: 6.6, minZ: -7.8, maxZ: 11.8 } as const;
const OUTLINES = new Map<number, readonly (readonly [x: number, z: number])[]>();

/*
 * The two-board table's edge as [x, z] corners, `spread` outside it, traced by marching squares and worked out once per
 * spread. The table is one piece without holes, so its longest loop is its edge.
 */
export function twoBoardTableOutline(spread = 0): readonly (readonly [x: number, z: number])[] {
  const known = OUTLINES.get(spread);
  if (known) {
    return known;
  }
  const columns = Math.ceil((OUTLINE_BOUNDS.maxX - OUTLINE_BOUNDS.minX) / OUTLINE_CELL) + 1;
  const rows = Math.ceil((OUTLINE_BOUNDS.maxZ - OUTLINE_BOUNDS.minZ) / OUTLINE_CELL) + 1;
  const values = new Float64Array(columns * rows);
  for (let row = 0; row < rows; row++) {
    for (let column = 0; column < columns; column++) {
      values[row * columns + column] =
        twoBoardTableDistance(OUTLINE_BOUNDS.minX + column * OUTLINE_CELL, OUTLINE_BOUNDS.minZ + row * OUTLINE_CELL) -
        spread;
    }
  }
  /* Each crossing sits on a grid edge, keyed by that edge, so neighbouring cells share their ends exactly. */
  const points = new Map<string, readonly [number, number]>();
  const crossing = (column: number, row: number, horizontal: boolean): string => {
    const key = `${horizontal ? 'h' : 'v'}${column},${row}`;
    if (!points.has(key)) {
      const a = values[row * columns + column]!;
      const b = horizontal ? values[row * columns + column + 1]! : values[(row + 1) * columns + column]!;
      const t = a / (a - b);
      const x = OUTLINE_BOUNDS.minX + (column + (horizontal ? t : 0)) * OUTLINE_CELL;
      const z = OUTLINE_BOUNDS.minZ + (row + (horizontal ? 0 : t)) * OUTLINE_CELL;
      points.set(key, [x, z]);
    }
    return key;
  };
  /* Each crossing joins the one or two crossings it shares a cell with; the loop is walked from neighbour to neighbour. */
  const neighbours = new Map<string, string[]>();
  const join = (a: string, b: string) => {
    neighbours.set(a, [...(neighbours.get(a) ?? []), b]);
    neighbours.set(b, [...(neighbours.get(b) ?? []), a]);
  };
  for (let row = 0; row < rows - 1; row++) {
    for (let column = 0; column < columns - 1; column++) {
      const inside = (c: number, r: number) => values[r * columns + c]! <= 0;
      const corners = [
        inside(column, row),
        inside(column + 1, row),
        inside(column + 1, row + 1),
        inside(column, row + 1),
      ];
      /* The cell's edges in turn round it: top, right, bottom, left, each between two corners. */
      const edges = [
        () => crossing(column, row, true),
        () => crossing(column + 1, row, false),
        () => crossing(column, row + 1, true),
        () => crossing(column, row, false),
      ];
      const crossed: string[] = [];
      for (let edge = 0; edge < 4; edge++) {
        if (corners[edge] !== corners[(edge + 1) % 4]) {
          crossed.push(edges[edge]!());
        }
      }
      for (let index = 0; index + 1 < crossed.length; index += 2) {
        join(crossed[index]!, crossed[index + 1]!);
      }
    }
  }
  let longest: (readonly [number, number])[] = [];
  const seen = new Set<string>();
  for (const start of neighbours.keys()) {
    if (seen.has(start)) {
      continue;
    }
    const loop: (readonly [number, number])[] = [];
    let key: string | undefined = start;
    while (key !== undefined) {
      seen.add(key);
      loop.push(points.get(key)!);
      key = neighbours.get(key)!.find((neighbour) => !seen.has(neighbour));
    }
    if (loop.length > longest.length) {
      longest = loop;
    }
  }
  OUTLINES.set(spread, longest);
  return longest;
}
