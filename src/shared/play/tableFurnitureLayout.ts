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
export const TABLE_TANKS_LABEL = 'BENE TLEILAXU TANKS';
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

const TABLE_PLACEMENT_ANCHORS: readonly PlacementAnchor[] = [
  ...CARD_BAY_PLACEMENT_ANCHORS,
  ...SHARED_ITEM_PLACEMENT_ANCHORS,
];

export function cardBaySlotPositions(side: CardBaySide): Vector3Tuple[] {
  return CARD_BAY_PLACEMENT_ANCHORS.filter((anchor) => anchor.id.startsWith(`card-bay-${side}-`)).map((anchor) => [
    ...anchor.position,
  ]);
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
  position: Vector3Tuple
): PlacementAnchor | null {
  return nearestBy(TABLE_PLACEMENT_ANCHORS, (anchor) =>
    anchorCaptures(anchor, piece, position) ? planarDistance(position, anchor.position) : null
  );
}

export function placementAnchorForPose(
  piece: Pick<TablePiece, 'kind' | 'orientation'>,
  position: Vector3Tuple
): PlacementAnchor | null {
  const epsilon = 1e-6;
  return (
    TABLE_PLACEMENT_ANCHORS.find(
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
