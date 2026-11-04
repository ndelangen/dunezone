import type { TablePiece, Vector3Tuple } from './model';
import { CARD_DEPTH, CARD_WIDTH, nearestBy, planarDistance, TABLE_SURFACE_Y } from './tableGeometry';

export type CardBaySide = 'left' | 'right';

export const FURNITURE_SURFACE_Y = TABLE_SURFACE_Y;
export const SIDE_SHELF_SIZE: Vector3Tuple = [2.2, 0.12, 4.1];
export const SIDE_SHELF_CENTER_X = 6.22;
/* Mutated in place by `setTanksLayoutOption` while the Tanks layout options are explored (#2675). */
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

const SLOT_PITCH_X = CARD_WIDTH + CARD_SLOT_GAP;
const SLOT_PITCH_Z = CARD_DEPTH + CARD_SLOT_GAP;

function sharedItemPositionsBelow(firstRowZ: number): Vector3Tuple[] {
  return Array.from({ length: 8 }, (_, index) => [
    ((index % 4) - 1.5) * SLOT_PITCH_X,
    FURNITURE_SURFACE_Y,
    firstRowZ + Math.floor(index / 4) * SLOT_PITCH_Z,
  ]);
}

export const SHARED_ITEM_PLACEMENT_ANCHORS: readonly PlacementAnchor[] = sharedItemPositionsBelow(8.9).map(
  (position, index) => ({
    id: `shared-item-${index + 1}`,
    position,
    orientation: 0,
    acceptedKinds: ['card', 'force', 'marker'],
    captureSize: CARD_SLOT_OUTER_SIZE,
  })
);

const TABLE_PLACEMENT_ANCHORS: readonly PlacementAnchor[] = [
  ...CARD_BAY_PLACEMENT_ANCHORS,
  ...SHARED_ITEM_PLACEMENT_ANCHORS,
];

/*
 * Tanks layout exploration (#2675): a playtester found no boundary between the bottom seat's area and the Tleilaxu Tanks,
 * and the Tanks too small once many leaders are in them. Each option is a shelf size, a boundary and a place for the shared item slots.
 * Only one survives; the option switch exists so the options can be compared side by side in Storybook.
 */
export type TanksBoundary =
  /* An engraved line that continues the round table's edge across the shelf. */
  | Readonly<{ kind: 'groove' }>
  /* A recessed tray with a rim, set apart from the round table by a strip of bare plate. */
  | Readonly<{
      kind: 'tray';
      minX: number;
      maxX: number;
      minZ: number;
      maxZ: number;
    }>
  /* A recessed basin whose top edge runs parallel to the round table's edge, a gap away from it. */
  | Readonly<{
      kind: 'crescent';
      gap: number;
      halfWidth: number;
      maxZ: number;
    }>
  /* A recessed well of any outline, walled in by a raised lip, so the Tanks read as a vessel rather than an area marked out with lines. */
  | Readonly<{ kind: 'well'; outline: (grow: number) => readonly PlanePoint[] }>;

/* A table point as [x, z]. */
type PlanePoint = readonly [x: number, z: number];

function arcPoints(cx: number, cz: number, radius: number, from: number, to: number, samples = 24): PlanePoint[] {
  return Array.from({ length: samples + 1 }, (_, index) => {
    const angle = from + ((to - from) * index) / samples;
    return [cx + Math.cos(angle) * radius, cz + Math.sin(angle) * radius] as const;
  });
}

/** A round vat: a circle, grown outward by `grow`. */
function vatOutline(cz: number, radius: number) {
  return (grow: number) => arcPoints(0, cz, radius + grow, 0, Math.PI * 2, 96).slice(0, -1);
}

/** A pill: a wide rectangle with round ends. */
function pillOutline(halfWidth: number, minZ: number, maxZ: number) {
  return (grow: number) => {
    const radius = (maxZ - minZ) / 2 + grow;
    const cz = (minZ + maxZ) / 2;
    const reach = halfWidth - (maxZ - minZ) / 2;
    return [
      ...arcPoints(reach, cz, radius, -Math.PI / 2, Math.PI / 2, 32),
      ...arcPoints(-reach, cz, radius, Math.PI / 2, (Math.PI * 3) / 2, 32),
    ];
  };
}

/** An octagon with cut corners, like a cistern hatch. */
function octagonOutline(halfWidth: number, minZ: number, maxZ: number, chamfer: number) {
  return (grow: number): PlanePoint[] => {
    const w = halfWidth + grow;
    const top = minZ - grow;
    const bottom = maxZ + grow;
    const c = chamfer + grow * (Math.SQRT2 - 1);
    return [
      [-w + c, top],
      [w - c, top],
      [w, top + c],
      [w, bottom - c],
      [w - c, bottom],
      [-w + c, bottom],
      [-w, bottom - c],
      [-w, top + c],
    ];
  };
}

/** A trough curved round the table: a band between two circles about the table's centre, over the angles either side of straight down. */
function arcTroughOutline(innerRadius: number, outerRadius: number, halfAngle: number) {
  return (grow: number) => {
    const down = Math.PI / 2;
    const inner = innerRadius - grow;
    const outer = outerRadius + grow;
    const spread = halfAngle + grow / ((innerRadius + outerRadius) / 2);
    return [
      ...arcPoints(0, 0, outer, down - spread, down + spread, 48),
      ...arcPoints(0, 0, inner, down + spread, down - spread, 48),
    ];
  };
}

export type TanksLayout = Readonly<{
  label: string;
  shelfWidth: number;
  shelfMaxZ: number;
  boundary: TanksBoundary | null;
  /* Engraved lines along z at these x, from the round table's edge to the shelf's far edge, fencing the Tanks off from side slots. */
  dividers: readonly number[];
  sharedItems: readonly Vector3Tuple[];
  labelZ: number;
  /* Where the stories toss dead leaders: inside the Tanks, below the engraved name. */
  pile?: Readonly<{ halfWidth: number; top: number; bottom: number }>;
}>;

const SHELF_MIN_Z = 5.45;

function sharedItemPositionsBeside(firstRowZ: number): Vector3Tuple[] {
  const columns = [-4, -3, 3, 4];
  return Array.from({ length: 8 }, (_, index) => [
    columns[index % 4]! * SLOT_PITCH_X,
    FURNITURE_SURFACE_Y,
    firstRowZ + Math.floor(index / 4) * SLOT_PITCH_Z,
  ]);
}

export const TANKS_LAYOUTS = {
  current: {
    label: 'Current',
    shelfWidth: 4.8,
    shelfMaxZ: 11.65,
    boundary: null,
    dividers: [],
    sharedItems: sharedItemPositionsBelow(8.9),
    labelZ: 6.2,
  },
  groove: {
    label: 'A: Engraved circle',
    shelfWidth: 6.6,
    shelfMaxZ: 12.4,
    boundary: { kind: 'groove' },
    dividers: [],
    sharedItems: sharedItemPositionsBelow(10.36),
    labelZ: 6.05,
  },
  tray: {
    label: 'B: Recessed tray',
    shelfWidth: 7.2,
    shelfMaxZ: 13.1,
    boundary: { kind: 'tray', minX: -3.3, maxX: 3.3, minZ: 5.95, maxZ: 10.45 },
    dividers: [],
    sharedItems: sharedItemPositionsBelow(11.2),
    labelZ: 6.45,
  },
  crescent: {
    label: 'C: Crescent basin',
    shelfWidth: 7.8,
    shelfMaxZ: 12.75,
    boundary: { kind: 'crescent', gap: 0.32, halfWidth: 3.6, maxZ: 10.15 },
    dividers: [],
    sharedItems: sharedItemPositionsBelow(10.9),
    labelZ: 6.4,
  },
  columns: {
    label: 'D: Full-depth Tanks, slots beside',
    shelfWidth: 9.3,
    shelfMaxZ: 11.6,
    boundary: { kind: 'groove' },
    dividers: [-2.48, 2.48],
    sharedItems: sharedItemPositionsBeside(9.0),
    labelZ: 6.05,
  },
  vat: {
    label: 'E: Round vat',
    shelfWidth: 6.6,
    shelfMaxZ: 13.5,
    boundary: { kind: 'well', outline: vatOutline(8.35, 2.75) },
    dividers: [],
    sharedItems: sharedItemPositionsBelow(11.85),
    labelZ: 6.3,
    pile: { halfWidth: 1.7, top: 7.0, bottom: 10.0 },
  },
  pill: {
    label: 'F: Pill',
    shelfWidth: 7.8,
    shelfMaxZ: 12.95,
    boundary: { kind: 'well', outline: pillOutline(3.55, 5.95, 10.35) },
    dividers: [],
    sharedItems: sharedItemPositionsBelow(11.15),
    labelZ: 6.5,
    pile: { halfWidth: 2.4, top: 7.0, bottom: 9.8 },
  },
  octagon: {
    label: 'G: Octagon',
    shelfWidth: 7.8,
    shelfMaxZ: 12.95,
    boundary: { kind: 'well', outline: octagonOutline(3.55, 5.95, 10.35, 1.1) },
    dividers: [],
    sharedItems: sharedItemPositionsBelow(11.15),
    labelZ: 6.45,
    pile: { halfWidth: 2.7, top: 7.0, bottom: 9.8 },
  },
  trough: {
    label: 'H: Arc round the table',
    shelfWidth: 9.6,
    shelfMaxZ: 12.4,
    boundary: { kind: 'well', outline: arcTroughOutline(5.85, 9.45, 0.5) },
    dividers: [],
    sharedItems: sharedItemPositionsBelow(10.4),
    labelZ: 6.45,
    pile: { halfWidth: 3.35, top: 6.95, bottom: 8.1 },
  },
} as const satisfies Record<string, TanksLayout>;

export type TanksLayoutOption = keyof typeof TANKS_LAYOUTS;

let activeTanksLayout: TanksLayoutOption = 'current';

export function tanksLayout(): TanksLayout {
  return TANKS_LAYOUTS[activeTanksLayout];
}

/** Switches the Tanks layout for the exploration stories; every shelf constant above is updated in place, so importers see it. */
export function setTanksLayoutOption(option: TanksLayoutOption): void {
  activeTanksLayout = option;
  const layout = TANKS_LAYOUTS[option];
  BOTTOM_SHELF_SIZE[0] = layout.shelfWidth;
  BOTTOM_SHELF_SIZE[2] = layout.shelfMaxZ - SHELF_MIN_Z;
  BOTTOM_SHELF_POSITION[2] = (layout.shelfMaxZ + SHELF_MIN_Z) / 2;
  TABLE_TANKS_LABEL_POSITION[1] =
    FURNITURE_SURFACE_Y + (layout.boundary && layout.boundary.kind !== 'groove' ? 0.027 : 0.012);
  TABLE_TANKS_LABEL_POSITION[2] = layout.labelZ;
  SHARED_ITEM_PLACEMENT_ANCHORS.forEach((anchor, index) => {
    const position = anchor.position as Vector3Tuple;
    position[0] = layout.sharedItems[index]![0];
    position[2] = layout.sharedItems[index]![2];
  });
}

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
