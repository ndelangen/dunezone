/*
 * A game's boards (Norbert, 2026-10-29): one main board in the middle of the table and up to six extra boards,
 * each about two thirds its size, in fixed slots round the main board's upper half. The extras fill the slots in an
 * order that keeps the table balanced: one extra sits on top, two sit left and right, and more climb from the sides
 * towards the top. Each extra stands on its own round of table, joined to the main table by the side shelves or a bridge.
 */

export const MAX_EXTRA_BOARDS = 6;
/* An extra board is this much the size of the main board: its map, its rim and the pieces' room on it. */
export const EXTRA_BOARD_SCALE = 0.63;
/* The table round an extra board reaches this far past its rim, as the main table reaches past the main board's. */
const EXTRA_TABLE_MARGIN = 0.75;
/* Main board numbers repeated from tableGeometry, which imports this module. */
const MAIN_BOARD_RIM_RADIUS = 4.23;
export const EXTRA_BOARD_TABLE_RADIUS = MAIN_BOARD_RIM_RADIUS * EXTRA_BOARD_SCALE + EXTRA_TABLE_MARGIN;

type SlotId = 'left' | 'right' | 'upperLeft' | 'upperRight' | 'top' | 'topLeft' | 'topRight';

/* Where each slot's board stands, in table units: left and right just past the card shelves, the rest clear of the trackers. */
const SLOTS: Record<SlotId, readonly [x: number, z: number]> = {
  left: [-10.33, 0],
  right: [10.33, 0],
  upperLeft: [-8.17, -6.27],
  upperRight: [8.17, -6.27],
  top: [0, -9.9],
  topLeft: [-2.85, -9.9],
  topRight: [2.85, -9.9],
};

/* Which slots hold the extras, for each number of extras. */
const SLOT_ORDER: readonly (readonly SlotId[])[] = [
  [],
  ['top'],
  ['left', 'right'],
  ['left', 'right', 'top'],
  ['left', 'right', 'upperLeft', 'upperRight'],
  ['left', 'right', 'upperLeft', 'upperRight', 'top'],
  ['left', 'right', 'upperLeft', 'upperRight', 'topLeft', 'topRight'],
];

/** One board on the table: where its centre stands and how large it is against the main board. */
export type BoardPlacement = Readonly<{ x: number; z: number; scale: number }>;

export const MAIN_BOARD_PLACEMENT: BoardPlacement = { x: 0, z: 0, scale: 1 };

/** How many extra boards a table has, from its stored count; anything out of range counts as none or the most. */
export function extraBoardCount(count: number | undefined): number {
  return Math.max(0, Math.min(MAX_EXTRA_BOARDS, Math.trunc(count ?? 0)));
}

/* Worked out once per count: the table's surface is asked for its boards on every move. */
const PLACEMENTS: readonly (readonly BoardPlacement[])[] = SLOT_ORDER.map((slots) => [
  MAIN_BOARD_PLACEMENT,
  ...slots.map((slot) => {
    const [x, z] = SLOTS[slot];
    return { x, z, scale: EXTRA_BOARD_SCALE };
  }),
]);

/** Every board on the table, the main board first, then the extras in board order. */
export function boardPlacements(count: number | undefined): readonly BoardPlacement[] {
  return PLACEMENTS[extraBoardCount(count)] ?? [MAIN_BOARD_PLACEMENT];
}

/** The extra boards' placements, in board order: the game's second board first. */
export function extraBoardPlacements(count: number | undefined): readonly BoardPlacement[] {
  return boardPlacements(count).slice(1);
}

/** A part of the table an extra board adds: its round, or a bridge that joins it to the main table. */
export type ExtraTableArea =
  | Readonly<{ kind: 'circle'; x: number; z: number; radius: number }>
  | Readonly<{ kind: 'rect'; minX: number; maxX: number; minZ: number; maxZ: number }>;

/*
 * The side shelves already join the left and right boards' rounds to the main table, and the upper boards' rounds
 * overlap the side rounds; the top boards stand past the trackers, so a bridge runs up to them from the main table.
 */
const TOP_BRIDGE_MIN_Z = -9.9;
const TOP_BRIDGE_MAX_Z = -5;
const TOP_BRIDGE_HALF_WIDTH = 1.4;

function tableAreasFor(slots: readonly SlotId[]): readonly ExtraTableArea[] {
  const areas: ExtraTableArea[] = slots.map((slot) => {
    const [x, z] = SLOTS[slot];
    return { kind: 'circle', x, z, radius: EXTRA_BOARD_TABLE_RADIUS };
  });
  const topXs = slots.filter((slot) => slot.startsWith('top')).map((slot) => SLOTS[slot][0]);
  if (topXs.length > 0) {
    areas.push({
      kind: 'rect',
      minX: Math.min(...topXs) - TOP_BRIDGE_HALF_WIDTH,
      maxX: Math.max(...topXs) + TOP_BRIDGE_HALF_WIDTH,
      minZ: TOP_BRIDGE_MIN_Z,
      maxZ: TOP_BRIDGE_MAX_Z,
    });
  }
  return areas;
}

const TABLE_AREAS = SLOT_ORDER.map(tableAreasFor);

/** The table the extra boards add round the main table. */
export function extraTableAreas(count: number | undefined): readonly ExtraTableArea[] {
  return TABLE_AREAS[extraBoardCount(count)] ?? [];
}

/** Whether a point on the table lies over the table an extra board adds. */
export function isOnExtraTable(areas: readonly ExtraTableArea[], x: number, z: number): boolean {
  return areas.some((area) =>
    area.kind === 'circle'
      ? Math.hypot(x - area.x, z - area.z) <= area.radius
      : x >= area.minX && x <= area.maxX && z >= area.minZ && z <= area.maxZ
  );
}
