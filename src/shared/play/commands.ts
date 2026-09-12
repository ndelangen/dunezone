import { freshTableState, nearestZone, pieceCount, viewerCanControl } from './model';
import type { TablePiece, TableState } from './model';
import { phaseAt, phaseForTurn, stepPhase, tableProgressFor } from './phases';
import type { DurableTable, GameSnapshot, PieceAction } from './protocol';
import { GameRejection } from './rejection';
import { createSpiceStack, isSpicePiece } from './spiceSupply';
import { restingPositionAt, stackPreviewPositionFor } from './tableGeometry';
import { isCollisionFreePosition, nearestCollisionFreePosition } from './tablePhysics';
import {
  appendEvent,
  applyDraftToState,
  assistedControlWarning,
  assistedStackWarning,
  compatibleStackTarget,
  eventId,
  flipPieceInState,
  labelForCount,
  moveStormInState,
} from './tableState';

function durableTable(table: TableState): DurableTable {
  const { viewerSeat: _viewer, selectedPieceId: _selection, draftMove: _draft, ...durable } = table;
  /* Old clients validate this literal. Hosted phase state comes only from snapshot.phase. */
  return { ...durable, phase: 'Harkonnen shipment' };
}

export function initialSnapshot(): GameSnapshot {
  const table = durableTable(freshTableState());
  table.events = table.events.map((event) => ({ ...event, message: 'Table ready. Turn 1: Storm.' }));
  return { revision: 0, table, versions: Object.fromEntries(table.pieces.map((piece) => [piece.id, 0])), phase: 0 };
}

export function nextSnapshot(
  previous: GameSnapshot,
  table: TableState,
  phase = previous.phase,
  reset = false
): GameSnapshot {
  const revision = previous.revision + 1;
  /* Revision stamps keep reused IDs newer than retired versions without retaining tombstones. */
  const versions = Object.fromEntries(
    table.pieces.map((piece) => {
      const before = previous.table.pieces.find((candidate) => candidate.id === piece.id);
      const changed = reset || JSON.stringify(before) !== JSON.stringify(piece);
      return [piece.id, changed ? revision : (previous.versions[piece.id] ?? revision)];
    })
  );
  return { revision, table: durableTable(table), versions, phase };
}

function accepted(state: TableState, command: string, message: string, warning: string | null = null): TableState {
  return {
    ...state,
    ...appendEvent(state, {
      id: eventId(state.nextEventNumber),
      command,
      message,
      status: warning ? 'accepted-with-warning' : 'accepted',
    }),
  };
}

export function requireAccepted(before: TableState, after: TableState): TableState {
  if (before === after || before.nextEventNumber === after.nextEventNumber) {
    throw new GameRejection('That action is not available.');
  }
  if (after.events[0]?.status === 'rejected') {
    throw new GameRejection(after.events[0].message);
  }
  return after;
}

function applyTableAction(
  state: TableState,
  action: Exclude<PieceAction, { pieceId: string }>,
  phase: number,
  actorName: string
): TableState {
  if (action.kind === 'reset') {
    return freshTableState();
  }
  if (action.kind === 'storm') {
    return requireAccepted(state, moveStormInState(state, action.direction));
  }
  if (action.kind === 'phase') {
    const next = stepPhase(phase, action.direction);
    const current = phaseAt(next);
    return accepted(
      { ...state, phase: current.label },
      action.direction === -1 ? 'phase.previous' : 'phase.advance',
      `Turn ${tableProgressFor(next).turn}: ${current.label}.`
    );
  }
  if (action.kind === 'turn') {
    const next = phaseForTurn(phase, action.turn);
    return accepted(state, 'turn.select', `Turn ${action.turn}: ${phaseAt(next).label}.`);
  }
  if (action.kind === 'spice-spawn') {
    return spawnSpiceInState(state, action.count, actorName);
  }
  return accepted(
    { ...state, enforcement: action.policy },
    'enforcement.change',
    `Enforcement changed to ${action.policy}.`
  );
}

function actionablePiece(state: TableState, action: Extract<PieceAction, { pieceId: string }>): TablePiece {
  const piece = state.pieces.find((candidate) => candidate.id === action.pieceId);
  if (!piece || pieceCount(piece) === 0) {
    throw new GameRejection('That piece is no longer available.');
  }
  assertPieceControl(state, piece, action);
  return piece;
}

function assertPieceControl(state: TableState, piece: TablePiece, action: PieceAction) {
  if (state.enforcement === 'strict' && !viewerCanControl(state, piece)) {
    throw new GameRejection(`Another seat controls ${piece.label}.`);
  }
  if (piece.locked && action.kind !== 'lock') {
    throw new GameRejection(`${piece.label} is locked.`);
  }
}

export function applyPieceAction(
  state: TableState,
  action: PieceAction,
  phase: number,
  actorName = 'A player'
): TableState {
  if (!('pieceId' in action)) {
    return applyTableAction(state, action, phase, actorName);
  }
  const piece = actionablePiece(state, action);
  switch (action.kind) {
    case 'flip':
      return requireAccepted(state, flipPieceInState(state, piece.id));
    case 'lock':
      return lockPiece(state, piece);
    case 'rotate':
      return rotatePiece(state, piece, action.direction);
    case 'stack':
      return stackPiece(state, piece);
    case 'split':
      return splitPiece(state, piece, action.count);
  }
}

export function spawnSpiceInState(state: TableState, count: number, actorName = 'A player'): TableState {
  const piece = createSpiceStack(state.nextEventNumber, count);
  const existing = state.pieces.find(
    (candidate) =>
      isSpicePiece(candidate) &&
      Math.hypot(candidate.position[0] - piece.position[0], candidate.position[2] - piece.position[2]) < 0.000001
  );
  if (existing?.locked) {
    throw new GameRejection('The spice at the supply is locked or being moved.');
  }
  if (
    !isCollisionFreePosition(
      piece,
      piece.position,
      state.pieces.filter((candidate) => candidate !== existing)
    )
  ) {
    throw new GameRejection('Move the piece blocking the spice supply spawn point first.');
  }
  piece.zoneId = nearestZone(piece.position)?.id ?? null;
  const pieces = existing
    ? state.pieces.map((candidate) =>
        candidate === existing ? { ...existing, items: [...existing.items, ...piece.items] } : candidate
      )
    : [...state.pieces, piece];
  return accepted(
    { ...state, pieces, selectedPieceId: existing?.id ?? piece.id },
    'spice.spawn',
    `${actorName} spawned ${count} spice.`
  );
}

function lockPiece(state: TableState, piece: TablePiece): TableState {
  const warning = assistedControlWarning(state, piece);
  const locked = !piece.locked;
  return accepted(
    {
      ...state,
      pieces: state.pieces.map((candidate) => (candidate.id === piece.id ? { ...piece, locked } : candidate)),
    },
    'piece.lock',
    `${piece.label} ${locked ? 'locked' : 'unlocked'}.`,
    warning
  );
}

function rotatePiece(state: TableState, piece: TablePiece, direction: -1 | 1): TableState {
  const warning = assistedControlWarning(state, piece);
  const orientation = piece.orientation + (direction * Math.PI) / 12;
  const rotated = {
    ...piece,
    orientation,
    position: restingPositionAt(piece.position, { kind: piece.kind, orientation }),
  };
  if (
    !isCollisionFreePosition(
      rotated,
      rotated.position,
      state.pieces.filter((candidate) => candidate.id !== piece.id)
    )
  ) {
    throw new GameRejection(`${piece.label} does not have room to rotate here.`);
  }
  return accepted(
    { ...state, pieces: state.pieces.map((candidate) => (candidate.id === piece.id ? rotated : candidate)) },
    'piece.rotate',
    `${piece.label} rotated ${direction > 0 ? 'clockwise' : 'counterclockwise'} by 15 degrees.`,
    warning
  );
}

function stackPiece(state: TableState, piece: TablePiece): TableState {
  const target = compatibleStackTarget(state, piece, piece.position, { includeNearby: true });
  if (!target) {
    throw new GameRejection('There is no compatible stack nearby.');
  }
  return requireAccepted(
    state,
    applyDraftToState(state, {
      operation: 'merge',
      pieceId: piece.id,
      sourcePieceId: piece.id,
      pickedUpItemIds: piece.items.map((item) => item.id),
      withdrawals: [],
      origin: [...piece.position],
      originOrientation: piece.orientation,
      position: stackPreviewPositionFor(target),
      orientation: piece.orientation,
      targetZoneId: target.zoneId,
      targetPieceId: target.id,
      warning: assistedStackWarning(state, piece, target),
    })
  );
}

function remainingPieces(state: TableState, piece: TablePiece, remaining: TablePiece['items']): TablePiece[] {
  return state.pieces.flatMap((candidate) => {
    if (candidate.id !== piece.id) {
      return [candidate];
    }
    if (!remaining.length) {
      return [];
    }
    return [{ ...candidate, items: remaining, label: labelForCount(candidate, remaining.length) }];
  });
}

function splitPlacement(state: TableState, piece: TablePiece, count: number) {
  const remaining = piece.items.slice(0, -count);
  const [offsetX, offsetZ] = piece.kind === 'card' ? [1, 0.25] : [0.325, 0.125];
  const split: TablePiece = {
    ...piece,
    id: `split-${state.nextEventNumber}`,
    label: labelForCount(piece, count, true),
    items: piece.items.slice(-count),
    position: [piece.position[0] + offsetX, piece.position[1], piece.position[2] + offsetZ],
  };
  const pieces = remainingPieces(state, piece, remaining);
  const position = nearestCollisionFreePosition(split, split.position, pieces);
  if (!position) {
    throw new GameRejection(`There is no clear space beside ${piece.label}.`);
  }
  split.position = restingPositionAt(position, split);
  split.zoneId = nearestZone(position)?.id ?? null;
  return [...pieces, split];
}

function splitDescription(piece: TablePiece, count: number) {
  if (isSpicePiece(piece)) {
    return `${count} spice taken from ${piece.label}.`;
  }
  const unit = piece.kind === 'card' ? 'card' : 'force';
  const plural = count === 1 ? '' : 's';
  return `${count} ${unit}${plural} taken from ${piece.label}.`;
}

function splitPiece(state: TableState, piece: TablePiece, requestedCount: number): TableState {
  if (pieceCount(piece) <= 1) {
    throw new GameRejection('That piece cannot be split.');
  }
  const count = Math.min(requestedCount, pieceCount(piece));
  return accepted(
    { ...state, pieces: splitPlacement(state, piece, count) },
    piece.kind === 'card' ? 'deck.draw' : 'stack.split',
    splitDescription(piece, count),
    assistedControlWarning(state, piece)
  );
}
