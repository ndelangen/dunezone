import { randomInt } from 'node:crypto';

import { nextSnapshot } from '../../src/shared/play/commands';
import { emptyDraft, isBanned } from '../../src/shared/play/drafting';
import type { DraftAction, DraftFaction, DraftState } from '../../src/shared/play/drafting';
import { emptyPublicControls } from '../../src/shared/play/inventory';
import type { TableEvent, TableState } from '../../src/shared/play/model';
import { seatLabel } from '../../src/shared/play/participation';
import { tableForViewer } from '../../src/shared/play/protocol';
import type { Viewer } from '../../src/shared/play/protocol';
import { GameRejection } from '../../src/shared/play/rejection';
import { SPECTATOR_SEAT } from '../../src/shared/play/schema';
import { appendEvent, eventId } from '../../src/shared/play/tableState';
import type { StoredSnapshot } from './state';

/*
 * The draft as the room applies it, from the contract on #1010. Every change here is a pure step
 * from one stored snapshot to the next; the room commits it like any other command. A pick, a ban
 * or a roster change clears everyone's readiness; readiness itself clears nobody else's.
 */

/** Unbiased picks from the platform's random source, in the shape the shared dealing helpers take. */
export const unbiased = (n: number) => randomInt(n);

function factionNamed(draft: DraftState, factionId: string): DraftFaction {
  const faction = draft.factions.find((candidate) => candidate.id === factionId);
  if (!faction) {
    throw new GameRejection('That faction is not in the catalogue this game reads.');
  }
  return faction;
}

function withEvent(snapshot: StoredSnapshot, draft: DraftState, command: string, message: string): StoredSnapshot {
  const table: TableState = tableForViewer(snapshot, SPECTATOR_SEAT);
  const event: TableEvent = { id: eventId(table.nextEventNumber), command, message, status: 'accepted' };
  const next = nextSnapshot(snapshot, { ...table, ...appendEvent(table, event) });
  const controls = snapshot.controls ?? emptyPublicControls();
  return { ...next, draft, controls: { ...controls, ready: [] } };
}

/** Everyone's readiness clears with the change that invalidates it; a failed attempt's reason goes with it. */
function changed(draft: DraftState): DraftState {
  return { ...draft, ready: [], failure: null };
}

export function applyDraftAction(
  snapshot: StoredSnapshot,
  viewer: Viewer,
  action: DraftAction,
  seated: readonly string[]
): StoredSnapshot {
  if (snapshot.stage !== 'drafting') {
    throw new GameRejection('Drafting has ended for this game.');
  }
  const seat = viewer.viewerSeat;
  if (seat === SPECTATOR_SEAT || !seated.includes(seat)) {
    throw new GameRejection('Only a seated player drafts.');
  }
  const draft = snapshot.draft ?? emptyDraft(2);
  const own = { picks: draft.picks[seat] ?? [], bans: draft.bans[seat] ?? [] };
  switch (action.kind) {
    case 'draft-pick': {
      const faction = factionNamed(draft, action.factionId);
      if (!faction.published) {
        throw new GameRejection(`${faction.name} is not generated yet; its assets are not published.`);
      }
      if (isBanned(draft, faction.id)) {
        throw new GameRejection(`${faction.name} is banned; every ban on it has to go first.`);
      }
      if (own.picks.includes(faction.id)) {
        throw new GameRejection(`${faction.name} is already in your draft.`);
      }
      const next = changed({ ...draft, picks: { ...draft.picks, [seat]: [...own.picks, faction.id] } });
      return withEvent(snapshot, next, action.kind, `${viewer.displayName} drafted ${faction.name}.`);
    }
    case 'draft-unpick': {
      const faction = factionNamed(draft, action.factionId);
      if (!own.picks.includes(faction.id)) {
        throw new GameRejection(`${faction.name} is not in your draft.`);
      }
      const next = changed({
        ...draft,
        picks: { ...draft.picks, [seat]: own.picks.filter((id) => id !== faction.id) },
      });
      return withEvent(snapshot, next, action.kind, `${viewer.displayName} removed ${faction.name} from the draft.`);
    }
    case 'draft-ban': {
      const faction = factionNamed(draft, action.factionId);
      if (own.bans.includes(faction.id)) {
        throw new GameRejection(`You already banned ${faction.name}.`);
      }
      /* A ban strips the faction from every draft list; removing the last ban restores no pick. */
      const picks = Object.fromEntries(
        Object.entries(draft.picks).map(([owner, list]) => [owner, list.filter((id) => id !== faction.id)])
      );
      const next = changed({ ...draft, picks, bans: { ...draft.bans, [seat]: [...own.bans, faction.id] } });
      return withEvent(snapshot, next, action.kind, `${viewer.displayName} banned ${faction.name}.`);
    }
    case 'draft-unban': {
      const faction = factionNamed(draft, action.factionId);
      if (!own.bans.includes(faction.id)) {
        throw new GameRejection(`You have no ban on ${faction.name}.`);
      }
      const next = changed({ ...draft, bans: { ...draft.bans, [seat]: own.bans.filter((id) => id !== faction.id) } });
      return withEvent(snapshot, next, action.kind, `${viewer.displayName} lifted the ban on ${faction.name}.`);
    }
    case 'draft-ready': {
      const ready = draft.ready.filter((candidate) => candidate !== seat);
      const next = { ...draft, ready: action.ready ? [...ready, seat] : ready, failure: null };
      const table: TableState = tableForViewer(snapshot, SPECTATOR_SEAT);
      const event: TableEvent = {
        id: eventId(table.nextEventNumber),
        command: action.kind,
        message: `${viewer.displayName} ${action.ready ? 'is ready to be dealt' : 'withdrew readiness'}.`,
        status: 'accepted',
      };
      return { ...nextSnapshot(snapshot, { ...table, ...appendEvent(table, event) }), draft: next };
    }
  }
}

/** A roster change while drafting clears everyone's readiness; a departing player's lists go with them. */
export function draftAfterRosterChange(draft: DraftState | undefined, departed?: string): DraftState | undefined {
  if (!draft) {
    return draft;
  }
  const without = (lists: DraftState['picks']) =>
    Object.fromEntries(Object.entries(lists).filter(([seat]) => seat !== departed));
  return changed({ ...draft, picks: without(draft.picks), bans: without(draft.bans) });
}

/** The catalogue read again: picks and readiness stay, the factions behind them are the latest. */
export function draftWithCatalogue(draft: DraftState, factions: DraftFaction[], now: number): DraftState {
  return { ...draft, factions, catalogueAt: now };
}

/** The events that record a public assignment, one per seat and one for the count, newest first in the table. */
export function assignmentEvents(
  snapshot: StoredSnapshot,
  dealt: readonly { seat: string; name: string; factionName: string; position: number }[]
): StoredSnapshot {
  let table: TableState = tableForViewer(snapshot, SPECTATOR_SEAT);
  const record = (message: string) => {
    const event: TableEvent = {
      id: eventId(table.nextEventNumber),
      command: 'assignment',
      message,
      status: 'accepted',
    };
    table = { ...table, ...appendEvent(table, event) };
  };
  for (const entry of dealt) {
    record(`${entry.name} plays ${entry.factionName} from ${seatLabel(entry.seat)} at station ${entry.position + 1}.`);
  }
  record(`Seats dealt: ${dealt.length} players, trading opens.`);
  return nextSnapshot(snapshot, table);
}
