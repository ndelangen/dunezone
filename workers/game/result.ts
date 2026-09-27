import { nextSnapshot } from '../../src/shared/play/commands';
import { phaseAt } from '../../src/shared/play/phases';
import { tableForViewer } from '../../src/shared/play/protocol';
import type { Viewer } from '../../src/shared/play/protocol';
import { GameRejection } from '../../src/shared/play/rejection';
import { resultFactionCountFits } from '../../src/shared/play/result';
import type { ResultAction } from '../../src/shared/play/result';
import { SPECTATOR_SEAT } from '../../src/shared/play/schema';
import type { StoredSnapshot } from './state';

/** The one name retained state shows for a deleted account. */
const DELETED_USER = '[deleted user]';

/*
 * Determine winner, its declaration and Continue playing. Each is one seated player's act and
 * changes nothing on the table: the phase, pieces, banks, hands and predictions stay as they are,
 * so continuing returns to Mentat pause of the same turn. The caller owns the transaction, the
 * log rows and the directory summary.
 */
export function applyResult(snapshot: StoredSnapshot, viewer: Viewer, action: ResultAction, now: number) {
  if (!snapshot.stage || viewer.viewerSeat === SPECTATOR_SEAT) {
    throw new GameRejection('Only current players in a real game can determine the winner.');
  }
  const by = { seat: viewer.viewerSeat, name: viewer.displayName, userId: viewer.userId };
  switch (action.kind) {
    case 'result-open': {
      requireMentat(snapshot);
      if (snapshot.ending) {
        throw new GameRejection(`${snapshot.ending.by.name} is already determining the winner.`);
      }
      return changed({ ...snapshot, ending: { by, startedAt: now } });
    }
    case 'result-cancel': {
      requireOpener(snapshot, viewer);
      return changed({ ...snapshot, ending: null });
    }
    case 'result-declare': {
      requireMentat(snapshot);
      requireOpener(snapshot, viewer);
      const factionIds = [...new Set(action.factionIds)];
      const seated = new Set(snapshot.roster?.seats.flatMap((seat) => (seat.faction ? [seat.faction.id] : [])));
      if (
        factionIds.length !== action.factionIds.length ||
        !resultFactionCountFits(action.result, factionIds.length) ||
        factionIds.some((id) => !seated.has(id))
      ) {
        throw new GameRejection('Choose one winning faction, an alliance of two or more, or no winner.');
      }
      return changed({
        ...snapshot,
        stage: 'finished',
        ending: null,
        result: { kind: action.result, factionIds, by, declaredAt: now },
      });
    }
    case 'result-continue': {
      if (snapshot.stage !== 'finished') {
        throw new GameRejection('Only a finished game can continue.');
      }
      return changed({ ...snapshot, stage: 'play', result: null });
    }
  }
}

/** An open sequence lives only in Mentat pause of play and only while its player holds a seat. */
export function settleEnding(snapshot: StoredSnapshot, seatedUserIds: ReadonlySet<string>): StoredSnapshot {
  const ending = snapshot.ending;
  if (!ending) {
    return snapshot;
  }
  const holds = ending.by.userId !== null && seatedUserIds.has(ending.by.userId);
  return holds && inMentat(snapshot) ? snapshot : { ...snapshot, ending: null };
}

/** The retained result and any open sequence name `[deleted user]` once that account is deleted. */
export function scrubResult(snapshot: StoredSnapshot, userId: string): StoredSnapshot {
  const scrub = <Acted extends { by: { userId: string | null } }>(acted: Acted | null) =>
    acted && acted.by.userId === userId ? { ...acted, by: { ...acted.by, userId: null, name: DELETED_USER } } : acted;
  return { ...snapshot, ending: scrub(snapshot.ending), result: scrub(snapshot.result) };
}

function inMentat(snapshot: StoredSnapshot) {
  return snapshot.stage === 'play' && phaseAt(snapshot.phase).id === 'mentat-pause';
}

function requireMentat(snapshot: StoredSnapshot) {
  if (!inMentat(snapshot)) {
    throw new GameRejection('Determine winner is available during Mentat pause.');
  }
}

function requireOpener(snapshot: StoredSnapshot, viewer: Viewer) {
  if (!snapshot.ending || snapshot.ending.by.userId !== viewer.userId) {
    throw new GameRejection('Only the player determining the winner can do that.');
  }
}

function changed(snapshot: StoredSnapshot) {
  return nextSnapshot(snapshot, tableForViewer(snapshot, SPECTATOR_SEAT));
}
