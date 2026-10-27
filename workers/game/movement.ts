import { accepted, nextSnapshot } from '../../src/shared/play/commands';
import { rosterFactionEventName } from '../../src/shared/play/factionLabels';
import { MOVEMENT_PHASE_ID } from '../../src/shared/play/movement';
import { phaseAt } from '../../src/shared/play/phases';
import { tableForViewer } from '../../src/shared/play/protocol';
import { GameRejection } from '../../src/shared/play/rejection';
import { SPECTATOR_SEAT } from '../../src/shared/play/schema';
import type { StoredSnapshot } from './state';

/** A faction says it has finished shipping and moving; the table logs it and saves a checkpoint after it. */
export function movementCommand(snapshot: StoredSnapshot, factionId: string): StoredSnapshot {
  if (
    (snapshot.stage !== undefined && snapshot.stage !== 'play') ||
    phaseAt(snapshot.phase, snapshot.phases).id !== MOVEMENT_PHASE_ID
  ) {
    throw new GameRejection('A faction finishes its turn only during Shipment and Movement.');
  }
  const done = snapshot.movement?.done ?? [];
  if (done.includes(factionId)) {
    throw new GameRejection('Your faction has already finished shipping and moving this turn.');
  }
  const table = accepted(
    tableForViewer(snapshot, SPECTATOR_SEAT),
    'movement-done',
    `${rosterFactionEventName(snapshot.roster, factionId)} has finished shipping and moving.`
  );
  return { ...nextSnapshot(snapshot, table), movement: { done: [...done, factionId] } };
}

/** Leaving the phase, either way, forgets who finished, so the next Shipment and Movement starts with nobody done. */
export function movementAfterTable(snapshot: StoredSnapshot, next: StoredSnapshot): Pick<StoredSnapshot, 'movement'> {
  return next.phase === snapshot.phase ? { movement: snapshot.movement } : { movement: undefined };
}
