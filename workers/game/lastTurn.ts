import { accepted, nextSnapshot } from '../../src/shared/play/commands';
import { lastTurnOf } from '../../src/shared/play/lastTurn';
import type { LastTurnAction } from '../../src/shared/play/lastTurn';
import { tableForViewer } from '../../src/shared/play/protocol';
import { GameRejection } from '../../src/shared/play/rejection';
import { SPECTATOR_SEAT } from '../../src/shared/play/schema';
import type { StoredSnapshot } from './state';

/** Any seated faction may change the last turn while the game plays; the wheel follows it and play goes on past it. */
export function lastTurnCommand(snapshot: StoredSnapshot, action: LastTurnAction): StoredSnapshot {
  if (snapshot.stage !== undefined && snapshot.stage !== 'play') {
    throw new GameRejection('The last turn can change only while the game is being played.');
  }
  if (action.turn === lastTurnOf(snapshot)) {
    throw new GameRejection(`The last turn is already turn ${action.turn}.`);
  }
  const table = accepted(
    tableForViewer(snapshot, SPECTATOR_SEAT),
    'last-turn',
    `The game now ends after turn ${action.turn}.`
  );
  return { ...nextSnapshot(snapshot, table), lastTurn: action.turn };
}
