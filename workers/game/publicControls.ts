import { randomInt } from 'node:crypto';

import { accepted, nextSnapshot } from '../../src/shared/play/commands';
import { emptyPublicControls } from '../../src/shared/play/inventory';
import type { PublicAction, StoredControls, StoredSpawnContents } from '../../src/shared/play/inventory';
import type { TablePiece, TableState } from '../../src/shared/play/model';
import { seatSubject } from '../../src/shared/play/participation';
import { phaseAt } from '../../src/shared/play/phases';
import type { PhaseEntry } from '../../src/shared/play/phases';
import type { Viewer } from '../../src/shared/play/protocol';
import { GameRejection } from '../../src/shared/play/rejection';
import type { StoredSnapshot } from './state';

/** What the room supplies for one public control: its table as of now, who is seated, and the table as this seat sees it. */
export type PublicControlsRoom = {
  snapshot: StoredSnapshot;
  seats: Viewer['viewerSeat'][];
  viewerTable: () => TableState;
  phases: readonly PhaseEntry[];
};

/** Readiness and spawn requests: the controls every seated player shares, outside any one faction's pieces. */
export function publicControlsCommand(
  room: PublicControlsRoom,
  identity: Viewer,
  action: PublicAction,
  contents?: StoredSpawnContents
): StoredSnapshot {
  const { snapshot } = room;
  const controls = structuredClone(snapshot.controls ?? emptyPublicControls());
  controls.seats = room.seats;
  if (!controls.seats.includes(identity.viewerSeat)) {
    throw new GameRejection('Only a current seated player can use this control.');
  }
  const table = { ...room.viewerTable(), pieces: [...snapshot.table.pieces] };
  let message: string;
  switch (action.kind) {
    case 'ready':
      message = setReadiness(room, identity, action.ready, controls);
      break;
    case 'spawn-request':
      message = requestSpawn({ revision: snapshot.revision, controls, table }, identity, contents);
      break;
    default:
      message = resolveSpawn(identity, action, controls, table);
  }
  return { ...nextSnapshot(snapshot, accepted(table, action.kind, message)), controls };
}

function setReadiness(room: PublicControlsRoom, identity: Viewer, ready: boolean, controls: StoredControls): string {
  if (!phaseAt(room.snapshot.phase, room.phases).allPlayersMustBeReady) {
    throw new GameRejection('Ready applies only during a phase where everyone must be ready, such as Mentat Pause.');
  }
  controls.ready = controls.ready.filter((seat) => seat !== identity.viewerSeat);
  if (ready) {
    controls.ready.push(identity.viewerSeat);
  }
  return `${seatSubject(identity.viewerSeat)} ${ready ? 'is ready' : 'withdrew readiness'}.`;
}

/** Where a spawn request lands: the table's revision, its shared controls and the table it may spawn onto. */
type SpawnTarget = { revision: number; controls: StoredControls; table: TableState };

function requestSpawn(
  { revision, controls, table }: SpawnTarget,
  identity: Viewer,
  contents?: StoredSpawnContents
): string {
  if (!contents) {
    throw new GameRejection('Choose a complete published asset first.');
  }
  const requestId = `spawn-${revision + 1}`;
  if (controls.seats.length === 1) {
    table.pieces.push(...spawnPieces(contents, requestId));
    return `${contents.name} requested and spawned.`;
  }
  controls.requests.push({
    id: requestId,
    requesterSeat: identity.viewerSeat,
    requesterName: identity.displayName,
    /* The live snapshot carries what approval spawns; the audit row keeps the captured definitions. */
    contents: { ...contents, definitions: [] },
  });
  return `${contents.name} requested.`;
}

function resolveSpawn(
  identity: Viewer,
  action: Extract<PublicAction, { requestId: string }>,
  controls: StoredControls,
  table: TableState
): string {
  const request = controls.requests.find((request) => request.id === action.requestId);
  if (!request) {
    throw new GameRejection('That spawn request has already been resolved.');
  }
  if (action.kind === 'spawn-approve') {
    /* The requester never supplies the approval; a lone player spawns directly and dismisses leftovers. */
    if (request.requesterSeat === identity.viewerSeat) {
      throw new GameRejection('One different seated player must approve this request.');
    }
    table.pieces.push(...spawnPieces(request.contents, request.id));
  }
  controls.requests = controls.requests.filter((candidate) => candidate !== request);
  return `${request.contents.name} ${action.kind === 'spawn-approve' ? 'approved and spawned' : 'dismissed'}.`;
}

function spawnPieces(contents: StoredSpawnContents, requestId: string): TablePiece[] {
  return contents.pieces.map((piece, index) => {
    const items = piece.items.map((item, itemIndex) => ({
      ...item,
      id: piece.kind === 'card' ? crypto.randomUUID() : `${requestId}-${index}-${itemIndex}`,
      faceUp: piece.kind !== 'card',
    }));
    /* A new deck's hidden runtime order is independent of its public catalogue recipe. */
    if (piece.kind === 'card') {
      for (let cursor = items.length - 1; cursor > 0; cursor--) {
        const other = randomInt(cursor + 1);
        [items[cursor], items[other]] = [items[other], items[cursor]];
      }
    }
    return { ...piece, id: `${requestId}-${index}`, inventory: 'shared', items };
  });
}
