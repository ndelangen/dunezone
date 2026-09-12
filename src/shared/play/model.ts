import type { z } from 'zod';

import type { TABLE_PHASES } from './phases';
import type {
  draftMoveSchema,
  durableTableSchema,
  enforcementPolicySchema,
  tableSeatSchema,
  tablePieceSchema,
  tablePositionSchema,
} from './schema';
import { isSpicePiece } from './spice';
import { DEFAULT_STORM_SECTOR_INDEX } from './stormSector';
import { restingPositionAt } from './tableGeometry';

export const HOSTED_TABLE_SEAT_COUNT = 6;

export type Vector3Tuple = z.infer<typeof tablePositionSchema>;
export type TablePiece = z.infer<typeof tablePieceSchema>;
export type TableItem = TablePiece['items'][number];
export type EnforcementPolicy = z.infer<typeof enforcementPolicySchema>;
export type DraftMove = z.infer<typeof draftMoveSchema>;
export type TableEvent = TableState['events'][number];

export type Zone = {
  id: string;
  label: string;
  shortLabel: string;
  position: Vector3Tuple;
  radius: number;
  tone: string;
  kind: 'territory' | 'reserve';
};

export type Affordance = {
  id: string;
  commandType:
    | 'piece.move'
    | 'stack.merge'
    | 'stack.split'
    | 'deck.draw'
    | 'piece.rotate'
    | 'piece.flip'
    | 'piece.lock';
  label: string;
  description: string;
  targetZoneIds?: string[];
};

export type TableState = Omit<z.infer<typeof durableTableSchema>, 'phase'> & {
  phase: z.infer<typeof durableTableSchema>['phase'] | (typeof TABLE_PHASES)[number]['label'];
  viewerSeat: z.infer<typeof tableSeatSchema>;
  selectedPieceId: string | null;
  draftMove: DraftMove | null;
};

export const ZONES: Zone[] = [
  {
    id: 'arrakeen',
    label: 'Arrakeen',
    shortLabel: 'ARRAKEEN',
    position: [0.95, 0.18, -3.05],
    radius: 0.68,
    tone: '#d4833f',
    kind: 'territory',
  },
  {
    id: 'carthag',
    label: 'Carthag',
    shortLabel: 'CARTHAG',
    position: [-0.25, 0.18, -3.12],
    radius: 0.68,
    tone: '#8d5335',
    kind: 'territory',
  },
  {
    id: 'polar-sink',
    label: 'Polar Sink',
    shortLabel: 'POLAR SINK',
    position: [0, 0.18, 0],
    radius: 0.72,
    tone: '#c8b688',
    kind: 'territory',
  },
  {
    id: 'harkonnen-reserve',
    label: 'Harkonnen reserve',
    shortLabel: 'H RESERVE',
    position: [-3.4, 0.2, 3.22],
    radius: 0.82,
    tone: '#8f2730',
    kind: 'reserve',
  },
  {
    id: 'bene-gesserit-reserve',
    label: 'Bene Gesserit reserve',
    shortLabel: 'BG RESERVE',
    position: [3.64, 0.2, 2.95],
    radius: 0.82,
    tone: '#70629c',
    kind: 'reserve',
  },
];

function tableItems(ids: string[], faceUp = true): TableItem[] {
  return ids.map((id) => ({ id, faceUp }));
}

const INITIAL_PIECES: TablePiece[] = [
  {
    id: 'harkonnen-force-stack',
    label: 'Harkonnen forces',
    owner: 'harkonnen',
    color: '#7d202d',
    accent: '#efac63',
    items: tableItems(['h-force-1', 'h-force-2', 'h-force-3', 'h-force-4', 'h-force-5']),
    stackKey: 'forces:harkonnen',
    position: restingPositionAt([-3.64, 0, 2.95], { kind: 'force', orientation: 0 }),
    orientation: 0,
    zoneId: 'harkonnen-reserve',
    locked: false,
    kind: 'force',
  },
  {
    id: 'harkonnen-force-loose',
    label: 'Harkonnen force',
    owner: 'harkonnen',
    color: '#7d202d',
    accent: '#efac63',
    items: tableItems(['h-force-6']),
    stackKey: 'forces:harkonnen',
    position: restingPositionAt([-3.14, 0, 3.49], { kind: 'force', orientation: 0 }),
    orientation: 0,
    zoneId: 'harkonnen-reserve',
    locked: false,
    kind: 'force',
  },
  {
    id: 'atreides-force-stack',
    label: 'Atreides forces',
    owner: 'atreides',
    color: '#176a73',
    accent: '#8bd1c7',
    items: tableItems(['a-force-1', 'a-force-2', 'a-force-3', 'a-force-4', 'a-force-5']),
    stackKey: 'forces:atreides',
    position: restingPositionAt([0.95, 0, -3.05], { kind: 'force', orientation: 0 }),
    orientation: 0,
    zoneId: 'arrakeen',
    locked: false,
    kind: 'force',
  },
  {
    id: 'bene-gesserit-force',
    label: 'Bene Gesserit force',
    owner: 'bene-gesserit',
    color: '#6d5c99',
    accent: '#d4c5ff',
    items: tableItems(['bg-force-1']),
    stackKey: 'forces:bene-gesserit',
    position: restingPositionAt([3.64, 0, 2.95], { kind: 'force', orientation: 0 }),
    orientation: 0,
    zoneId: 'bene-gesserit-reserve',
    locked: false,
    kind: 'force',
  },
  {
    id: 'treachery-deck',
    label: 'Treachery deck',
    owner: 'shared',
    color: '#3f2523',
    accent: '#d99b57',
    items: tableItems(['treachery-1', 'treachery-2', 'treachery-3', 'treachery-4'], false),
    stackKey: 'cards:treachery',
    position: restingPositionAt([4.15, 0, -1.25], { kind: 'card', orientation: -0.08 }),
    orientation: -0.08,
    zoneId: null,
    locked: false,
    kind: 'card',
  },
  {
    id: 'treachery-card-loose',
    label: 'Treachery card',
    owner: 'shared',
    color: '#996143',
    accent: '#f1c27a',
    items: tableItems(['treachery-5']),
    stackKey: 'cards:treachery',
    position: restingPositionAt([4.15, 0, 0.35], { kind: 'card', orientation: 0.12 }),
    orientation: 0.12,
    zoneId: null,
    locked: false,
    kind: 'card',
  },
];

export function pieceCount(piece: TablePiece): number {
  return piece.items.length;
}

export function topItemFaceUp(piece: TablePiece): boolean {
  return piece.items.at(-1)?.faceUp ?? true;
}

export function viewerCanControl(state: TableState, piece: TablePiece): boolean {
  return piece.owner === state.viewerSeat || piece.owner === 'shared';
}

export function gestureBlockReason(state: TableState, piece: TablePiece): string | null {
  if (piece.locked) {
    return `${piece.label} is locked.`;
  }
  if (state.enforcement === 'strict' && !viewerCanControl(state, piece)) {
    return `Another seat controls ${piece.label}.`;
  }
  return null;
}

export function freshTableState(): TableState {
  return {
    viewerSeat: 'harkonnen',
    phase: 'Harkonnen shipment',
    stormSectorIndex: DEFAULT_STORM_SECTOR_INDEX,
    enforcement: 'sandbox',
    pieces: INITIAL_PIECES.map((piece) => ({
      ...piece,
      flipRevision: piece.flipRevision ?? 0,
      items: piece.items.map((item) => ({ ...item })),
      position: [...piece.position],
    })),
    selectedPieceId: 'harkonnen-force-stack',
    draftMove: null,
    events: [
      {
        id: 'evt-001',
        command: 'window.open',
        message: 'Harkonnen may ship forces to Arrakeen.',
        status: 'accepted',
      },
    ],
    nextEventNumber: 2,
  };
}

export function zoneById(zoneId: string | null): Zone | null {
  return ZONES.find((zone) => zone.id === zoneId) ?? null;
}

export function nearestZone(position: Vector3Tuple): Zone | null {
  let nearest: { zone: Zone; distance: number } | null = null;

  for (const zone of ZONES) {
    const dx = position[0] - zone.position[0];
    const dz = position[2] - zone.position[2];
    const distance = Math.hypot(dx, dz);
    if (Number.isNaN(distance) || distance > zone.radius) {
      continue;
    }
    if (!nearest || distance < nearest.distance) {
      nearest = { zone, distance };
    }
  }

  return nearest?.zone ?? null;
}

export function dropPositionFor(zone: Zone, piece: TablePiece): Vector3Tuple {
  // Preserve the leading UTF-16 unit used to place existing piece IDs.
  const seed = [...piece.id].reduce((sum, character) => sum + character.charCodeAt(0), 0);
  const angle = ((seed % 12) / 12) * Math.PI * 2;
  const distance = zone.kind === 'reserve' ? 0.12 : 0.27;
  return restingPositionAt(
    [zone.position[0] + Math.cos(angle) * distance, 0, zone.position[2] + Math.sin(angle) * distance],
    piece
  );
}

function moveAffordance(state: TableState, piece: TablePiece, isOwnPiece: boolean): Affordance {
  const isHarkonnenShipmentForce =
    state.phase === 'Harkonnen shipment' && piece.owner === 'harkonnen' && piece.kind === 'force';
  const strictTargets = isHarkonnenShipmentForce ? ['arrakeen'] : [];
  const broadTargets = ZONES.filter((zone) => zone.id !== piece.zoneId).map((zone) => zone.id);
  return {
    id: 'move',
    commandType: 'piece.move',
    label: isHarkonnenShipmentForce ? 'Ship forces' : 'Move piece',
    description: isOwnPiece
      ? 'Stage a move, inspect its target, then commit it.'
      : 'This belongs to another seat. Assisted play records an override.',
    targetZoneIds: state.enforcement === 'strict' && isHarkonnenShipmentForce ? strictTargets : broadTargets,
  };
}

function splitAffordance(piece: TablePiece): Affordance {
  const isCard = piece.kind === 'card';
  const isSpice = isSpicePiece(piece);
  return {
    id: isCard ? 'draw' : 'split',
    commandType: isCard ? 'deck.draw' : 'stack.split',
    label: isCard ? 'Draw top card' : isSpice ? 'Split one spice' : 'Split one force',
    description: isCard
      ? 'Take the top card into a new loose table object.'
      : isSpice
        ? 'Create a separate spice stack beside this stack.'
        : 'Create a separate one-force stack beside this stack.',
  };
}

function mergeAffordance(piece: TablePiece): Affordance {
  return {
    id: 'merge',
    commandType: 'stack.merge',
    label: piece.kind === 'card' ? 'Make deck' : 'Make stack',
    description: 'Drop this object onto a compatible object, or press G while they overlap.',
  };
}

function canOfferFlip(state: TableState, piece: TablePiece): boolean {
  const supportedKind = piece.kind === 'card' || piece.kind === 'force';
  return !state.draftMove && pieceCount(piece) > 0 && supportedKind;
}

function flipAffordance(piece: TablePiece): Affordance {
  const isStack = pieceCount(piece) > 1;
  const cardLabel = isStack ? 'Flip deck' : 'Flip card';
  const forceLabel = isStack ? 'Flip stack' : 'Flip token';
  const label = piece.kind === 'card' ? cardLabel : forceLabel;
  return {
    id: 'flip',
    commandType: 'piece.flip',
    label,
    description: isStack ? 'Turn the whole stack over, including every item.' : 'Turn this piece over.',
  };
}

function lockAffordance(piece: TablePiece): Affordance {
  return {
    id: 'lock',
    commandType: 'piece.lock',
    label: piece.locked ? 'Unlock piece' : 'Lock piece',
    description: piece.locked ? 'Permit direct manipulation again.' : 'Prevent an accidental move.',
  };
}

export function affordancesFor(state: TableState): Affordance[] {
  const piece = state.pieces.find((candidate) => candidate.id === state.selectedPieceId);
  if (!piece) {
    return [];
  }
  const isOwnPiece = viewerCanControl(state, piece);
  if (state.enforcement === 'strict' && !isOwnPiece) {
    return [];
  }
  if (piece.locked) {
    return [lockAffordance(piece)];
  }
  return [
    moveAffordance(state, piece, isOwnPiece),
    ...(pieceCount(piece) > 1 ? [splitAffordance(piece)] : []),
    ...(piece.stackKey ? [mergeAffordance(piece)] : []),
    {
      id: 'rotate',
      commandType: 'piece.rotate',
      label: 'Rotate 15°',
      description: 'Record a new canonical orientation.',
    },
    ...(canOfferFlip(state, piece) ? [flipAffordance(piece)] : []),
    lockAffordance(piece),
  ];
}
