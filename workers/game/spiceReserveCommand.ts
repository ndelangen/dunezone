import type { TablePiece, TableState, Vector3Tuple } from '../../src/shared/play/model';
import type { Viewer } from '../../src/shared/play/protocol';
import { GameRejection } from '../../src/shared/play/rejection';
import { rosterSeat } from '../../src/shared/play/schema';
import { isSpicePiece } from '../../src/shared/play/spice';
import { createSpiceStack } from '../../src/shared/play/spiceBank';
import { restingPositionAt } from '../../src/shared/play/tableGeometry';
import { clampPositionToTable, nearestCollisionFreePosition } from '../../src/shared/play/tablePhysics';
import { PLAYER_RING_RADIUS, tableSeatAngles } from '../../src/shared/play/tableSettings';
import { territoryAtTable, territoryLanding, withNudges } from '../../src/shared/play/territoryPlacement';
import type { TerritoryNudge } from '../../src/shared/play/territoryPlacement';
import type { StoredSnapshot } from './state';

type Seat = Viewer['viewerSeat'];

/** What a spice reserve change leaves behind: the faction's new balance, the table, and the log line. */
export type SpiceReserveChange = { balance: number; table: TableState; message: string };

/** The spot just in front of a seat's station, whichever station its seating fixed; none for a seat without one. */
export function stationFront(roster: StoredSnapshot['roster'], seat: Seat): Vector3Tuple | undefined {
  const station = rosterSeat(roster, seat);
  if (!roster || !station) {
    return undefined;
  }
  const angle = tableSeatAngles(roster.seatCount)[station.position]!;
  const radius = PLAYER_RING_RADIUS - 0.55;
  return [Math.cos(angle) * radius, 0, Math.sin(angle) * radius];
}

export function withdrawSpice(
  table: TableState,
  roster: StoredSnapshot['roster'],
  balance: number,
  amount: number,
  seat: Seat,
  position?: Vector3Tuple
): SpiceReserveChange {
  if (amount > balance) {
    throw new GameRejection('There is not enough spice in the spice reserve for that withdrawal.');
  }
  const { piece, nudges } = spiceReserveStack(table, roster, amount, seat, position);
  return {
    balance: balance - amount,
    table: { ...table, pieces: [...withNudges(table.pieces, nudges), piece] },
    message: `withdrew ${amount} spice onto the table.`,
  };
}

export function collectSpice(table: TableState, balance: number, pieceId: string): SpiceReserveChange {
  const piece = table.pieces.find((candidate) => candidate.id === pieceId);
  if (!isSpicePiece(piece) || piece.locked) {
    throw new GameRejection('Choose an unlocked spice stack on the table.');
  }
  if (!Number.isSafeInteger(balance + piece.items.length)) {
    throw new GameRejection('This collection exceeds the spice reserve capacity.');
  }
  return {
    balance: balance + piece.items.length,
    table: { ...table, pieces: table.pieces.filter((candidate) => candidate.id !== piece.id) },
    message: `collected ${piece.items.length} spice from the table.`,
  };
}

/* New withdrawals use the chosen drop point; older clients retain their station-front placement. */
function spiceReserveStack(
  table: TableState,
  roster: StoredSnapshot['roster'],
  amount: number,
  seat: Seat,
  requested?: Vector3Tuple
): { piece: TablePiece; nudges?: TerritoryNudge[] } {
  const piece = createSpiceStack(table.nextEventNumber, 1);
  piece.items = Array.from({ length: amount }, (_, index) => ({ id: `${piece.id}-${index + 1}`, faceUp: true }));
  const front = stationFront(roster, seat);
  if (!front) {
    throw new GameRejection('This seat has no station on the table.');
  }
  const origin = restingPositionAt(requested ?? front, piece);
  const supported = clampPositionToTable(piece, origin);
  if (requested && Math.hypot(supported[0] - origin[0], supported[2] - origin[2]) > 1e-6) {
    throw new GameRejection('Drop the spice on the table.');
  }
  /* Spice set down in a territory keeps inside it, as a carried stack does, and the stacks there make room. */
  const landing = territoryLanding(table, piece, origin, table.pieces);
  if (landing === null) {
    throw new GameRejection(`${territoryAtTable(table, origin)!.name} has no room for that.`);
  }
  if (landing) {
    return { piece: { ...piece, position: landing.position }, nudges: landing.nudges };
  }
  const position = nearestCollisionFreePosition(piece, origin, table.pieces);
  if (!position) {
    throw new GameRejection('Make room on the table before withdrawing spice.');
  }
  return { piece: { ...piece, position } };
}
