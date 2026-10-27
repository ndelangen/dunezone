import { accepted, nextSnapshot } from '../../src/shared/play/commands';
import { rosterFactionEventName } from '../../src/shared/play/factionLabels';
import type { MovementAction } from '../../src/shared/play/movement';
import { MOVEMENT_PHASE_ID } from '../../src/shared/play/movement';
import { phaseAt } from '../../src/shared/play/phases';
import { rosterFactionIds, tableForViewer } from '../../src/shared/play/protocol';
import { GameRejection } from '../../src/shared/play/rejection';
import { SPECTATOR_SEAT } from '../../src/shared/play/schema';
import type { StoredSnapshot } from './state';

/**
 * A seated player marks a faction done or not done, or rearranges the turn order. Each player marks their own faction,
 * but the table plays by hand, so anyone seated may correct another's.
 * Marking a faction done logs it and saves a checkpoint after it.
 */
export function movementCommand(snapshot: StoredSnapshot, action: MovementAction): StoredSnapshot {
  if (!movementPhase(snapshot)) {
    throw new GameRejection('Shipment and Movement turns change only during Shipment and Movement.');
  }
  const factions = rosterFactionIds(snapshot.roster);
  const movement = snapshot.movement ?? { done: [] };
  if (action.kind === 'movement-order') {
    if (new Set(action.order).size !== action.order.length || action.order.some((id) => !factions.includes(id))) {
      throw new GameRejection('The turn order names only the factions at the table, each once.');
    }
    const names = action.order.map((id) => rosterFactionEventName(snapshot.roster, id)).join(', ');
    const table = accepted(
      tableForViewer(snapshot, SPECTATOR_SEAT),
      'movement-order',
      `Shipment and Movement now goes ${names}.`
    );
    return { ...nextSnapshot(snapshot, table), movement: { ...movement, order: action.order } };
  }
  if (!factions.includes(action.factionId)) {
    throw new GameRejection('That faction is not at the table.');
  }
  const name = rosterFactionEventName(snapshot.roster, action.factionId);
  const finished = movement.done.includes(action.factionId);
  if (action.kind === 'movement-undo') {
    if (!finished) {
      throw new GameRejection(`${name} has not finished shipping and moving yet.`);
    }
    const table = accepted(
      tableForViewer(snapshot, SPECTATOR_SEAT),
      'movement-undo',
      `${name} is not done shipping and moving after all.`
    );
    return {
      ...nextSnapshot(snapshot, table),
      movement: { ...movement, done: movement.done.filter((id) => id !== action.factionId) },
    };
  }
  if (finished) {
    throw new GameRejection(`${name} has already finished shipping and moving this turn.`);
  }
  const table = accepted(
    tableForViewer(snapshot, SPECTATOR_SEAT),
    'movement-done',
    `${name} has finished shipping and moving.`
  );
  return { ...nextSnapshot(snapshot, table), movement: { ...movement, done: [...movement.done, action.factionId] } };
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
