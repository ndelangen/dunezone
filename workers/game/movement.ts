import { accepted, nextSnapshot } from '../../src/shared/play/commands';
import { rosterFactionEventName } from '../../src/shared/play/factionLabels';
import type { MovementAction, MovementTurns } from '../../src/shared/play/movement';
import { MOVEMENT_PHASE_ID } from '../../src/shared/play/movement';
import { phaseAt } from '../../src/shared/play/phases';
import { rosterFactionIds, tableForViewer } from '../../src/shared/play/protocol';
import { GameRejection } from '../../src/shared/play/rejection';
import { SPECTATOR_SEAT } from '../../src/shared/play/schema';
import type { StoredSnapshot } from './state';

/**
 * A seated player marks a faction done or not done, or rearranges the turn order.
 * Each player marks their own faction, but the table plays by hand, so anyone seated may correct another's.
 * Marking a faction done logs it and saves a checkpoint after it.
 */
export function movementCommand(snapshot: StoredSnapshot, action: MovementAction): StoredSnapshot {
  if (!movementPhase(snapshot)) {
    throw new GameRejection('Shipment and Movement turns change only during Shipment and Movement.');
  }
  const factions = rosterFactionIds(snapshot.roster);
  const movement = snapshot.movement ?? { done: [] };
  if (action.kind === 'movement-order') {
    return arrange(snapshot, movement, factions, action.order);
  }
  if (!factions.includes(action.factionId)) {
    throw new GameRejection('That faction is not at the table.');
  }
  return mark(snapshot, movement, action.factionId, action.kind === 'movement-done');
}

function arrange(
  snapshot: StoredSnapshot,
  movement: MovementTurns,
  factions: string[],
  order: string[]
): StoredSnapshot {
  if (new Set(order).size !== order.length || order.some((id) => !factions.includes(id))) {
    throw new GameRejection('The turn order names only the factions at the table, each once.');
  }
  const names = order.map((id) => rosterFactionEventName(snapshot.roster, id)).join(', ');
  const table = accepted(
    tableForViewer(snapshot, SPECTATOR_SEAT),
    'movement-order',
    `Shipment and Movement now goes ${names}.`
  );
  return { ...nextSnapshot(snapshot, table), movement: { ...movement, order } };
}

function mark(snapshot: StoredSnapshot, movement: MovementTurns, factionId: string, done: boolean): StoredSnapshot {
  const name = rosterFactionEventName(snapshot.roster, factionId);
  if (movement.done.includes(factionId) === done) {
    throw new GameRejection(
      done
        ? `${name} has already finished shipping and moving this turn.`
        : `${name} has not finished shipping and moving yet.`
    );
  }
  const table = done
    ? accepted(tableForViewer(snapshot, SPECTATOR_SEAT), 'movement-done', `${name} has finished shipping and moving.`)
    : accepted(
        tableForViewer(snapshot, SPECTATOR_SEAT),
        'movement-undo',
        `${name} is not done shipping and moving after all.`
      );
  const finished = done ? [...movement.done, factionId] : movement.done.filter((id) => id !== factionId);
  return { ...nextSnapshot(snapshot, table), movement: { ...movement, done: finished } };
}

const MOVEMENT_KINDS = new Set(['movement-done', 'movement-undo', 'movement-order']);
export function isMovementAction(action: { kind: string }): action is MovementAction {
  return MOVEMENT_KINDS.has(action.kind);
}

function movementPhase(snapshot: StoredSnapshot): boolean {
  const playing = snapshot.stage === undefined || snapshot.stage === 'play';
  return playing && phaseAt(snapshot.phase, snapshot.phases).id === MOVEMENT_PHASE_ID;
}

/** Leaving the phase, either way, forgets the turns, so the next Shipment and Movement starts in storm order with nobody done. */
export function movementAfterTable(snapshot: StoredSnapshot, next: StoredSnapshot): Pick<StoredSnapshot, 'movement'> {
  return next.phase === snapshot.phase ? { movement: snapshot.movement } : { movement: undefined };
}
