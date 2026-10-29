import { TAB_BOTTOM_Z, TWO_BOARD_TABS } from './boardLayout';
import type { TableLayout } from './boardLayout';
import type { TablePiece, Vector3Tuple } from './model';
import { CARD_DEPTH, CARD_WIDTH, nearestBy, planarDistance, TABLE_SURFACE_Y } from './tableGeometry';

export type CardBaySide = 'left' | 'right';

export const FURNITURE_SURFACE_Y = TABLE_SURFACE_Y;
export const SIDE_SHELF_SIZE: Vector3Tuple = [2.2, 0.12, 4.1];
export const SIDE_SHELF_CENTER_X = 6.22;
export const BOTTOM_SHELF_SIZE: Vector3Tuple = [4.8, 0.12, 6.2];
export const BOTTOM_SHELF_POSITION: Vector3Tuple = [0, FURNITURE_SURFACE_Y - BOTTOM_SHELF_SIZE[1] / 2, 8.55];
const CARD_SLOT_RIM = 0.06;
export const CARD_SLOT_GAP = 0.14;
export const TABLE_TANKS_LABEL = 'TLEILAXU TANKS';
export const TABLE_TANKS_LABEL_POSITION: Vector3Tuple = [0, FURNITURE_SURFACE_Y + 0.012, 6.2];

const CARD_SLOT_ROWS = [-1.32, 0, 1.32] as const;

export const CARD_SLOT_OUTER_SIZE = {
  width: CARD_WIDTH + CARD_SLOT_RIM * 2,
  depth: CARD_DEPTH + CARD_SLOT_RIM * 2,
} as const;

export type PlacementAnchor = Readonly<{
  id: string;
  position: Vector3Tuple;
  orientation: number;
  acceptedKinds: readonly TablePiece['kind'][];
  captureSize: Readonly<{ width: number; depth: number }>;
}>;

function positionsForCardBay(side: CardBaySide): Vector3Tuple[] {
  const direction = side === 'left' ? -1 : 1;
  const innerX = direction * 5.72;
  const outerX = direction * 6.72;

  return side === 'left'
    ? [
        [innerX, FURNITURE_SURFACE_Y, CARD_SLOT_ROWS[0]],
        [outerX, FURNITURE_SURFACE_Y, CARD_SLOT_ROWS[0]],
        [innerX, FURNITURE_SURFACE_Y, CARD_SLOT_ROWS[1]],
        [outerX, FURNITURE_SURFACE_Y, CARD_SLOT_ROWS[1]],
        [innerX, FURNITURE_SURFACE_Y, CARD_SLOT_ROWS[2]],
      ]
    : [
        [innerX, FURNITURE_SURFACE_Y, CARD_SLOT_ROWS[0]],
        [innerX, FURNITURE_SURFACE_Y, CARD_SLOT_ROWS[1]],
        [outerX, FURNITURE_SURFACE_Y, CARD_SLOT_ROWS[1]],
        [innerX, FURNITURE_SURFACE_Y, CARD_SLOT_ROWS[2]],
        [outerX, FURNITURE_SURFACE_Y, CARD_SLOT_ROWS[2]],
      ];
}

export const CARD_BAY_PLACEMENT_ANCHORS: readonly PlacementAnchor[] = (['left', 'right'] as const).flatMap((side) =>
  positionsForCardBay(side).map((position, index) => ({
    id: `card-bay-${side}-${index + 1}`,
    position,
    orientation: 0,
    acceptedKinds: ['card'] as const,
    captureSize: CARD_SLOT_OUTER_SIZE,
  }))
);

export const SHARED_ITEM_PLACEMENT_ANCHORS: readonly PlacementAnchor[] = Array.from({ length: 8 }, (_, index) => ({
  id: `shared-item-${index + 1}`,
  position: [
    ((index % 4) - 1.5) * (CARD_WIDTH + CARD_SLOT_GAP),
    FURNITURE_SURFACE_Y,
    8.9 + Math.floor(index / 4) * (CARD_DEPTH + CARD_SLOT_GAP),
  ],
  orientation: 0,
  acceptedKinds: ['card', 'force', 'marker'],
  captureSize: CARD_SLOT_OUTER_SIZE,
}));

/*
 * On the two-board table the shared table inventory, the Tanks and the decks move to the tabs below the boards (Norbert,
 * 2026-10-29), left to right: the inventory, the Tanks, the Treachery bay (the left bay) and the Spice bay (the right
 * bay). Each bay keeps its two columns and three rows; the inventory stands in four rows.
 */
const TAB_COLUMN_PITCH = CARD_WIDTH + CARD_SLOT_GAP;
const TAB_ROW_PITCH = 1.32;
const TAB_FIRST_ROW_Z = TAB_BOTTOM_Z - 0.9 - TAB_ROW_PITCH * 3;

function tabColumns([left, right]: readonly [number, number]): [inner: number, outer: number] {
  const middle = (left + right) / 2;
  return [middle - TAB_COLUMN_PITCH / 2, middle + TAB_COLUMN_PITCH / 2];
}

function tabCardBayPositions(side: CardBaySide): Vector3Tuple[] {
  const [first, second] = tabColumns(side === 'left' ? TWO_BOARD_TABS.treachery : TWO_BOARD_TABS.spice);
  const row = (index: number) => TAB_FIRST_ROW_Z + TAB_ROW_PITCH * (index + 0.5);
  return [
    [first, FURNITURE_SURFACE_Y, row(0)],
    [second, FURNITURE_SURFACE_Y, row(0)],
    [first, FURNITURE_SURFACE_Y, row(1)],
    [second, FURNITURE_SURFACE_Y, row(1)],
    [first, FURNITURE_SURFACE_Y, row(2)],
  ];
}

const TWO_BOARD_ANCHORS: readonly PlacementAnchor[] = [
  ...(['left', 'right'] as const).flatMap((side) =>
    tabCardBayPositions(side).map((position, index) => ({
      id: `card-bay-${side}-${index + 1}`,
      position,
      orientation: 0,
      acceptedKinds: ['card'] as const,
      captureSize: CARD_SLOT_OUTER_SIZE,
    }))
  ),
  ...Array.from({ length: 8 }, (_, index): PlacementAnchor => {
    const columns = tabColumns(TWO_BOARD_TABS.inventory);
    return {
      id: `shared-item-${index + 1}`,
      position: [columns[index % 2]!, FURNITURE_SURFACE_Y, TAB_FIRST_ROW_Z + TAB_ROW_PITCH * Math.floor(index / 2)],
      orientation: 0,
      acceptedKinds: ['card', 'force', 'marker'],
      captureSize: CARD_SLOT_OUTER_SIZE,
    };
  }),
];

const TABLE_PLACEMENT_ANCHORS: readonly PlacementAnchor[] = [
  ...CARD_BAY_PLACEMENT_ANCHORS,
  ...SHARED_ITEM_PLACEMENT_ANCHORS,
];

/** Every well on a layout's table: the deck bays and the shared table inventory. */
export function placementAnchors(layout: TableLayout): readonly PlacementAnchor[] {
  return layout === 'two-boards' ? TWO_BOARD_ANCHORS : TABLE_PLACEMENT_ANCHORS;
}

/** The shared table inventory's wells on a layout's table. */
export function sharedItemAnchors(layout: TableLayout = 'one-board'): readonly PlacementAnchor[] {
  return placementAnchors(layout).filter((anchor) => anchor.id.startsWith('shared-item-'));
}

/** Where the Tleilaxu Tanks' label lies on a layout's table. */
export function tanksLabelPosition(layout: TableLayout = 'one-board'): Vector3Tuple {
  const [left, right] = TWO_BOARD_TABS.tanks;
  return layout === 'two-boards'
    ? [(left + right) / 2, FURNITURE_SURFACE_Y + 0.012, 6.4]
    : [...TABLE_TANKS_LABEL_POSITION];
}

export function cardBaySlotPositions(side: CardBaySide, layout: TableLayout = 'one-board'): Vector3Tuple[] {
  return placementAnchors(layout)
    .filter((anchor) => anchor.id.startsWith(`card-bay-${side}-`))
    .map((anchor) => [...anchor.position]);
}

/** Whether a piece of this kind dropped at `position` falls inside the anchor's capture box. */
function anchorCaptures(anchor: PlacementAnchor, piece: Pick<TablePiece, 'kind'>, position: Vector3Tuple): boolean {
  return (
    anchor.acceptedKinds.includes(piece.kind) &&
    !(
      Math.abs(position[0] - anchor.position[0]) > anchor.captureSize.width / 2 ||
      Math.abs(position[2] - anchor.position[2]) > anchor.captureSize.depth / 2
    )
  );
}

export function placementAnchorAtPosition(
  piece: Pick<TablePiece, 'kind'>,
  position: Vector3Tuple,
  layout: TableLayout = 'one-board'
): PlacementAnchor | null {
  return nearestBy(placementAnchors(layout), (anchor) =>
    anchorCaptures(anchor, piece, position) ? planarDistance(position, anchor.position) : null
  );
}

export function placementAnchorForPose(
  piece: Pick<TablePiece, 'kind' | 'orientation'>,
  position: Vector3Tuple,
  layout: TableLayout = 'one-board'
): PlacementAnchor | null {
  const epsilon = 1e-6;
  return (
    placementAnchors(layout).find(
      (anchor) =>
        anchor.acceptedKinds.includes(piece.kind) &&
        Math.abs(position[0] - anchor.position[0]) <= epsilon &&
        Math.abs(position[2] - anchor.position[2]) <= epsilon &&
        Math.abs(
          Math.atan2(Math.sin(piece.orientation - anchor.orientation), Math.cos(piece.orientation - anchor.orientation))
        ) <= epsilon
    ) ?? null
  );
}
