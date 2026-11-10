import { phaseAt } from '../../src/shared/play/phases';
import { rosterFactionIds } from '../../src/shared/play/protocol';
import type { Viewer } from '../../src/shared/play/protocol';
import { GameRejection } from '../../src/shared/play/rejection';
import { resultFactionCountFits } from '../../src/shared/play/result';
import type { ResultAction } from '../../src/shared/play/result';
import { SPECTATOR_SEAT } from '../../src/shared/play/schema';
import { revised } from './state';
import type { StoredSnapshot } from './state';

/*
 * Determine winner, its declaration and Continue playing. Each is one seated player's act and
 * changes nothing on the table: the phase, pieces, spice reserves, hands and predictions stay as they are,
 * so continuing returns to Mentat Pause of the same turn. Continuing clears readiness, so the players
 * agree afresh before the phase moves on. The caller owns the transaction, the log rows and the
 * directory summary.
 */
export function applyResult(
  snapshot: StoredSnapshot,
  viewer: Viewer,
  action: ResultAction,
  now: number,
  seats: () => readonly string[]
) {
  if (!snapshot.stage || viewer.viewerSeat === SPECTATOR_SEAT) {
    throw new GameRejection('Only current players in a real game can determine the winner.');
  }
  const by = { seat: viewer.viewerSeat, name: viewer.displayName, userId: viewer.userId };
  switch (action.kind) {
    case 'result-open':
      return open(snapshot, by, now);
    case 'result-cancel':
      requireOpener(snapshot, viewer);
      return revised({ ...snapshot, ending: null });
    case 'result-declare':
      return declare(snapshot, viewer, action, now);
    case 'result-continue':
      return resume(snapshot, now);
    case 'result-end':
      return end(snapshot, by, seats(), now);
  }
}

type Actor = NonNullable<StoredSnapshot['ending']>['by'];
type Declaration = Extract<ResultAction, { kind: 'result-declare' }>;

function open(snapshot: StoredSnapshot, by: Actor, now: number) {
  requireMentat(snapshot);
  if (snapshot.ending) {
    throw new GameRejection(`${snapshot.ending.by.name} is already determining the winner.`);
  }
  return revised({ ...snapshot, ending: { by, startedAt: now } });
}

function declare(snapshot: StoredSnapshot, viewer: Viewer, action: Declaration, now: number) {
  requireMentat(snapshot);
  requireOpener(snapshot, viewer);
  requireFittingFactions(snapshot, action);
  return revised({
    ...snapshot,
    stage: 'finished',
    ending: null,
    result: { kind: action.result, factionIds: action.factionIds, by: snapshot.ending!.by, declaredAt: now },
  });
}

/*
 * A player left alone at the table ends the game in any phase of play, with no winner and without Determine winner.
 * Like a declaration it changes nothing on the table, so the game keeps its replay and can still continue.
 */
function end(snapshot: StoredSnapshot, by: Actor, seats: readonly string[], now: number) {
  if (snapshot.stage !== 'play') {
    throw new GameRejection('Only a game in play can be ended.');
  }
  if (seats.length !== 1 || seats[0] !== by.seat) {
    throw new GameRejection('Only the last player at the table can end the game.');
  }
  return revised({
    ...snapshot,
    stage: 'finished',
    ending: null,
    result: { kind: 'none', factionIds: [], by, declaredAt: now },
  });
}

/*
 * A game can end with a bid or a battle countdown running, and their clocks stand still while it is finished:
 * continuing moves each deadline on by the time the game spent finished, so every clock resumes with the time it had left.
 */
function resume(snapshot: StoredSnapshot, now: number) {
  if (snapshot.stage !== 'finished') {
    throw new GameRejection('Only a finished game can continue.');
  }
  const stood = Math.max(0, now - (snapshot.result?.declaredAt ?? now));
  const later = (deadline: number | null) => (deadline === null ? null : deadline + stood);
  const controls = snapshot.controls && { ...snapshot.controls, ready: [] };
  const bidding = snapshot.bidding && { ...snapshot.bidding, deadline: later(snapshot.bidding.deadline) };
  const battleState = snapshot.battleState && {
    ...snapshot.battleState,
    deadline: later(snapshot.battleState.deadline),
  };
  return revised({ ...snapshot, stage: 'play', result: null, controls, bidding, battleState });
}

/** One winner, an alliance of two or more, or none; each named once and each seated at this table. */
function requireFittingFactions(snapshot: StoredSnapshot, action: Declaration) {
  const seated = new Set(rosterFactionIds(snapshot.roster));
  const checks = [
    new Set(action.factionIds).size === action.factionIds.length,
    action.factionIds.every((id) => seated.has(id)),
    resultFactionCountFits(action.result, action.factionIds.length),
  ];
  if (checks.includes(false)) {
    throw new GameRejection('Choose one winning faction, an alliance of two or more, or no winner.');
  }
}

/** An open sequence lives only in Mentat Pause of play and only while its player holds a seat. */
export function settleEnding<Snapshot extends StoredSnapshot>(
  snapshot: Snapshot,
  seatedUserIds: () => ReadonlySet<string>
): Snapshot {
  const ending = snapshot.ending;
  if (!ending) {
    return snapshot;
  }
  const holds = ending.by.userId !== null && seatedUserIds().has(ending.by.userId);
  return holds && inMentat(snapshot) ? snapshot : { ...snapshot, ending: null };
}

function inMentat(snapshot: StoredSnapshot) {
  return snapshot.stage === 'play' && phaseAt(snapshot.phase, snapshot.phases).id === 'mentat-pause';
}

function requireMentat(snapshot: StoredSnapshot) {
  if (!inMentat(snapshot)) {
    throw new GameRejection('Determine winner is available during Mentat Pause.');
  }
}

function requireOpener(snapshot: StoredSnapshot, viewer: Viewer) {
  if (!snapshot.ending || snapshot.ending.by.userId !== viewer.userId) {
    throw new GameRejection('Only the player determining the winner can do that.');
  }
}

/*
 * A recall pauses the table's clocks with it, so a timed bid or battle countdown resumes with the time it had left.
 * A finished game's clocks already stand still until it continues, which moves them on by the whole time it stood finished,
 * so a recall closing then moves nothing: shifting both would count the recall twice.
 */
export function clocksAfterRecall<Snapshot extends StoredSnapshot>(next: Snapshot, paused: number): Snapshot {
  if (next.stage === 'finished') {
    return next;
  }
  const battle = next.battleState;
  const bidding = next.bidding;
  return {
    ...next,
    ...(battle?.deadline ? { battleState: { ...battle, deadline: battle.deadline + paused } } : {}),
    ...(bidding?.deadline ? { bidding: { ...bidding, deadline: bidding.deadline + paused } } : {}),
  };
}
