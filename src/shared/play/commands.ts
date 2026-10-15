import { isFactionToken } from './factionToken';
import { freshTableState, gestureBlockReason, nearestZone, pieceCount } from './model';
import type { TablePiece, TableState } from './model';
import { phaseAt, STANDARD_PHASES, stepPhase, tableProgressFor, TURN_SELECT_REFUSAL } from './phases';
import type { PhaseEntry } from './phases';
import { ROTATE_STEPS_LIMIT } from './protocol';
import type { DurableTable, GameSnapshot, TableAction } from './protocol';
import { GameRejection } from './rejection';
import { isSpicePiece } from './spice';
import { createSpiceStack } from './spiceBank';
import { planarDistance, restingPositionAt, stackPreviewPositionFor } from './tableGeometry';
import { isCollisionFreePosition, nearestCollisionFreePosition } from './tablePhysics';
import {
  accepted,
  applyDraftToState,
  compatibleStackTarget,
  flipPieceInState,
  labelForCount,
  moveStormInState,
  pieceUnits,
} from './tableState';

export { accepted };

function durableTable(table: TableState): DurableTable {
  const {
    viewerSeat: _viewer,
    viewerFaction: _faction,
    factionNames: _names,
    handCounts: _handCounts,
    selectedPieceId: _selection,
    draftMove: _draft,
    ...durable
  } = table;
  return durable;
}

export function initialSnapshot(): GameSnapshot {
  const table = durableTable(freshTableState());
  return { revision: 0, table, versions: Object.fromEntries(table.pieces.map((piece) => [piece.id, 0])), phase: 0 };
}

/** A real game's first snapshot: no pieces until setup supplies them, drafting from the first view. */
export function emptySnapshot(): GameSnapshot {
  const table = durableTable({ ...freshTableState(), pieces: [], selectedPieceId: null });
  table.events = [{ id: 'evt-001', command: 'window.open', message: 'Table ready. Drafting.', status: 'accepted' }];
  return { revision: 0, table, versions: {}, phase: 0, stage: 'drafting' };
}

export function nextSnapshot<Snapshot extends GameSnapshot>(
  previous: Snapshot,
  table: TableState,
  phase = previous.phase,
  reset = false
): Snapshot {
  const revision = previous.revision + 1;
  /* Revision stamps keep reused IDs newer than retired versions without retaining tombstones. */
  const versions = Object.fromEntries(
    table.pieces.map((piece) => {
      const before = previous.table.pieces.find((candidate) => candidate.id === piece.id);
      const changed = reset || JSON.stringify(before) !== JSON.stringify(piece);
      return [piece.id, changed ? revision : (previous.versions[piece.id] ?? revision)];
    })
  );
  return { ...previous, revision, table: durableTable(table), versions, phase };
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
  action: Exclude<TableAction, { pieceId: string }>,
  phase: number,
  actorName: string,
  phases: readonly PhaseEntry[]
): TableState {
  switch (action.kind) {
    case 'reset':
      return freshTableState();
    case 'storm':
      /*
       * This guard is what keeps faction phase ordering stable within a turn (#1138): storm order is read live from the marker,
       * so the marker may move only in Storm, and every phase after it that turn sees the new order.
       */
      if (phaseAt(phase, phases).id !== 'storm') {
        throw new GameRejection('The storm moves only during the Storm phase.');
      }
      return requireAccepted(state, moveStormInState(state, action.direction));
    case 'phase': {
      const next = stepPhase(phase, action.direction);
      const current = phaseAt(next, phases);
      return accepted(
        state,
        action.direction === -1 ? 'phase.previous' : 'phase.advance',
        `Turn ${tableProgressFor(next, phases).turn}: ${current.label}.`
      );
    }
    /* The protocol keeps the action so an older client is refused rather than disconnected. */
    case 'turn':
      throw new GameRejection(TURN_SELECT_REFUSAL);
    case 'spice-spawn':
      return spawnSpiceInState(state, action.count, actorName);
  }
}

function actionablePiece(state: TableState, action: Extract<TableAction, { pieceId: string }>): TablePiece {
  const piece = state.pieces.find((candidate) => candidate.id === action.pieceId);
  if (!piece || pieceCount(piece) === 0) {
    throw new GameRejection('That piece is no longer available.');
  }
  const blocked = action.kind === 'lock' ? null : gestureBlockReason(piece);
  if (blocked) {
    throw new GameRejection(blocked);
  }
  return piece;
}

export function applyPieceAction(
  state: TableState,
  action: TableAction,
  phase: number,
  actorName = 'A player',
  phases: readonly PhaseEntry[] = STANDARD_PHASES
): TableState {
  if (!('pieceId' in action)) {
    return applyTableAction(state, action, phase, actorName, phases);
  }
  const piece = actionablePiece(state, action);
  switch (action.kind) {
    case 'flip':
      return requireAccepted(state, flipPieceInState(state, piece.id));
    case 'lock':
      return lockPiece(state, piece);
    case 'rotate':
      return rotatePiece(state, piece, action.direction, action.steps);
    case 'stack':
      return stackPiece(state, piece);
    case 'split':
      return splitPiece(state, piece, action.count);
    case 'delete':
      return deletePiece(state, piece, actorName);
  }
}

/** Whether a piece may be taken out of the game: markers, faction tokens and pieces in a battle or the shared inventory stay. */
export function deletablePiece(piece: TablePiece): boolean {
  return piece.kind !== 'marker' && !isFactionToken(piece) && !piece.inventory && !piece.battleOverlay;
}

/** A face-up single card is named by its face, which everyone sees; anything else by its label, which never names a hidden face. */
export function deletedName(piece: TablePiece): string {
  const [item] = piece.items;
  const name = piece.kind === 'card' && piece.items.length === 1 && item?.faceUp ? item.artwork?.name : undefined;
  return name ? `${name} card` : piece.label;
}

function deletePiece(state: TableState, piece: TablePiece, actorName: string): TableState {
  if (!deletablePiece(piece)) {
    throw new GameRejection(`${piece.label} cannot be removed from the game.`);
  }
  return accepted(
    {
      ...state,
      pieces: state.pieces.filter((candidate) => candidate.id !== piece.id),
      selectedPieceId: state.selectedPieceId === piece.id ? null : state.selectedPieceId,
    },
    'piece.delete',
    `${actorName} deleted ${deletedName(piece)} from the game.`
  );
}

/** The spice already resting on the spot a new stack would spawn at, if any. */
function spiceAt(state: TableState, piece: TablePiece): TablePiece | undefined {
  return state.pieces.find(
    (candidate) => isSpicePiece(candidate) && planarDistance(candidate.position, piece.position) < 0.000001
  );
}

/** The table with new spice added to the stack already on the spot, or set down as its own stack. */
function withSpawnedSpice(state: TableState, piece: TablePiece, existing: TablePiece | undefined): TablePiece[] {
  return existing
    ? state.pieces.map((candidate) =>
        candidate === existing ? { ...existing, items: [...existing.items, ...piece.items] } : candidate
      )
    : [...state.pieces, piece];
}

export function spawnSpiceInState(state: TableState, count: number, actorName = 'A player'): TableState {
  const piece = createSpiceStack(state.nextEventNumber, count);
  const existing = spiceAt(state, piece);
  if (existing?.locked) {
    throw new GameRejection('The spice at the Spice Bank is locked or being moved.');
  }
  if (
    !isCollisionFreePosition(
      piece,
      piece.position,
      state.pieces.filter((candidate) => candidate !== existing)
    )
  ) {
    throw new GameRejection('Move the piece blocking the Spice Bank spawn point first.');
  }
  piece.zoneId = nearestZone(piece.position)?.id ?? null;
  const pieces = withSpawnedSpice(state, piece, existing);
  return accepted(
    { ...state, pieces, selectedPieceId: existing?.id ?? piece.id },
    'spice.spawn',
    `${actorName} spawned ${count} spice.`
  );
}

function lockPiece(state: TableState, piece: TablePiece): TableState {
  const locked = !piece.locked;
  return accepted(
    {
      ...state,
      pieces: state.pieces.map((candidate) => (candidate.id === piece.id ? { ...piece, locked } : candidate)),
    },
    'piece.lock',
    `${piece.label} ${locked ? 'locked' : 'unlocked'}.`
  );
}

/** One press of Q or E turns a piece this far. */
const ROTATE_STEP = Math.PI / 12;

/** The net turn of a held rotation in 15° steps, clockwise positive, folded into half a turn either way. */
export function foldedTurns(turns: number): number {
  const folded = ((turns % 24) + 24) % 24;
  return folded > ROTATE_STEPS_LIMIT ? folded - 24 : folded;
}

/** The piece turned by `turns` 15° steps, clockwise positive, resting where it lands; null when it would overlap another piece, or for a faction token, which always faces the board. */
export function rotatedPiece(state: TableState, piece: TablePiece, turns: number): TablePiece | null {
  if (isFactionToken(piece)) {
    return null;
  }
  const orientation = piece.orientation - turns * ROTATE_STEP;
  const rotated = {
    ...piece,
    orientation,
    position: restingPositionAt(piece.position, { ...piece, orientation }),
  };
  return isCollisionFreePosition(
    rotated,
    rotated.position,
    state.pieces.filter((candidate) => candidate.id !== piece.id)
  )
    ? rotated
    : null;
}

function rotatePiece(state: TableState, piece: TablePiece, direction: -1 | 1, steps = 1): TableState {
  if (isFactionToken(piece)) {
    throw new GameRejection(`${piece.label} always faces the board.`);
  }
  const rotated = rotatedPiece(state, piece, direction * steps);
  if (!rotated) {
    throw new GameRejection(`There is no room to rotate ${piece.label} here.`);
  }
  return accepted(
    { ...state, pieces: state.pieces.map((candidate) => (candidate.id === piece.id ? rotated : candidate)) },
    'piece.rotate',
    `${piece.label} rotated ${direction > 0 ? 'clockwise' : 'counterclockwise'} by ${steps * 15} degrees.`
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
    return [{ ...candidate, items: remaining, label: labelForCount(candidate, remaining.length, state.factionNames) }];
  });
}

function splitPlacement(state: TableState, piece: TablePiece, count: number) {
  const remaining = piece.items.slice(0, -count);
  const [offsetX, offsetZ] = piece.kind === 'card' ? [1, 0.25] : [0.325, 0.125];
  const split: TablePiece = {
    ...piece,
    id: `split-${state.nextEventNumber}`,
    label: labelForCount(piece, count, state.factionNames, true),
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
  const [one, many] = pieceUnits(piece);
  return `${count} ${count === 1 ? one : many} taken from ${piece.label}.`;
}

function splitPiece(state: TableState, piece: TablePiece, requestedCount: number): TableState {
  if (pieceCount(piece) <= 1) {
    throw new GameRejection('That piece cannot be split.');
  }
  const count = Math.min(requestedCount, pieceCount(piece));
  return accepted(
    { ...state, pieces: splitPlacement(state, piece, count) },
    piece.kind === 'card' ? 'deck.draw' : 'stack.split',
    splitDescription(piece, count)
  );
}
