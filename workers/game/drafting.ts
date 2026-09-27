import { randomInt } from 'node:crypto';

import { accepted, nextSnapshot } from '../../src/shared/play/commands';
import { emptyDraft, isBanned } from '../../src/shared/play/drafting';
import type { DraftAction, DraftFaction, DraftState } from '../../src/shared/play/drafting';
import { emptyPublicControls } from '../../src/shared/play/inventory';
import { seatLabel } from '../../src/shared/play/participation';
import { tableForViewer } from '../../src/shared/play/protocol';
import type { Viewer } from '../../src/shared/play/protocol';
import { GameRejection } from '../../src/shared/play/rejection';
import { SPECTATOR_SEAT } from '../../src/shared/play/schema';
import { eventId } from '../../src/shared/play/tableState';
import type { StoredSnapshot } from './state';

/*
 * The draft as the room applies it, from the contract on #1010. Every change here is a pure step
 * from one stored snapshot to the next; the room commits it like any other command. A pick, a ban
 * or a roster change clears everyone's readiness; readiness itself clears nobody else's.
 */

/** Unbiased picks from the platform's random source, in the shape the shared dealing helpers take. */
export const unbiased = (n: number) => randomInt(n);

/** What `draft_history` keeps about an event that names a player, so a scrubbed name means a rebuilt event. */
export type DraftRecord = {
  eventId: string;
  kind: 'draft-pick' | 'draft-unpick' | 'draft-ban' | 'draft-unban' | 'draft-ready' | 'draft-withdraw' | 'assignment';
  factionName: string | null;
  seat: string;
  position: number | null;
};

/** The one player-facing message for each draft event, rebuilt from its row when a name is scrubbed. */
export function draftMessage(name: string, record: Omit<DraftRecord, 'eventId'>): string {
  const faction = record.factionName ?? '';
  switch (record.kind) {
    case 'draft-pick':
      return `${name} drafted ${faction}.`;
    case 'draft-unpick':
      return `${name} removed ${faction} from the draft.`;
    case 'draft-ban':
      return `${name} banned ${faction}.`;
    case 'draft-unban':
      return `${name} lifted the ban on ${faction}.`;
    case 'draft-ready':
      return `${name} is ready to be dealt.`;
    case 'draft-withdraw':
      return `${name} withdrew readiness.`;
    case 'assignment':
      return `${name} plays ${faction} from ${seatLabel(record.seat)} at station ${(record.position ?? 0) + 1}.`;
  }
}

function factionNamed(draft: DraftState, factionId: string): DraftFaction {
  const faction = draft.factions.find((candidate) => candidate.id === factionId);
  if (!faction) {
    throw new GameRejection('That faction is not in the catalogue this game reads.');
  }
  return faction;
}

type Applied = { snapshot: StoredSnapshot; record: DraftRecord };

function withEvent(
  snapshot: StoredSnapshot,
  viewer: Viewer,
  draft: DraftState,
  kind: 'draft-pick' | 'draft-unpick' | 'draft-ban' | 'draft-unban',
  faction: DraftFaction
): Applied {
  const table = tableForViewer(snapshot, SPECTATOR_SEAT);
  const id = eventId(table.nextEventNumber);
  const record = { kind, factionName: faction.name, position: null };
  const message = draftMessage(viewer.displayName, { ...record, seat: viewer.viewerSeat });
  const next = nextSnapshot(snapshot, accepted(table, kind, message));
  const controls = snapshot.controls ?? emptyPublicControls();
  return {
    snapshot: { ...next, draft, controls: { ...controls, ready: [] } },
    record: { ...record, eventId: id, seat: viewer.viewerSeat },
  };
}

/** Everyone's readiness clears with the change that invalidates it; a failed attempt's reason goes with it. */
function changed(draft: DraftState): DraftState {
  return { ...draft, ready: [], failure: null };
}

export function applyDraftAction(
  snapshot: StoredSnapshot,
  viewer: Viewer,
  action: DraftAction,
  seated: readonly string[],
  minimum: number
): Applied {
  if (snapshot.stage !== 'drafting') {
    throw new GameRejection('Drafting has ended for this game.');
  }
  const seat = viewer.viewerSeat;
  if (seat === SPECTATOR_SEAT || !seated.includes(seat)) {
    throw new GameRejection('Only a seated player drafts.');
  }
  const draft = snapshot.draft ?? emptyDraft(minimum);
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
      return withEvent(snapshot, viewer, next, action.kind, faction);
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
      return withEvent(snapshot, viewer, next, action.kind, faction);
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
      return withEvent(snapshot, viewer, next, action.kind, faction);
    }
    case 'draft-unban': {
      const faction = factionNamed(draft, action.factionId);
      if (!own.bans.includes(faction.id)) {
        throw new GameRejection(`You have no ban on ${faction.name}.`);
      }
      const next = changed({ ...draft, bans: { ...draft.bans, [seat]: own.bans.filter((id) => id !== faction.id) } });
      return withEvent(snapshot, viewer, next, action.kind, faction);
    }
    case 'draft-ready': {
      const ready = draft.ready.filter((candidate) => candidate !== seat);
      const next = { ...draft, ready: action.ready ? [...ready, seat] : ready, failure: null };
      const table = tableForViewer(snapshot, SPECTATOR_SEAT);
      const id = eventId(table.nextEventNumber);
      const record = {
        kind: action.ready ? ('draft-ready' as const) : ('draft-withdraw' as const),
        factionName: null,
        position: null,
      };
      const message = draftMessage(viewer.displayName, { ...record, seat });
      return {
        snapshot: { ...nextSnapshot(snapshot, accepted(table, action.kind, message)), draft: next },
        record: { ...record, eventId: id, seat },
      };
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
): Applied['snapshot'] & { records: DraftRecord[] } {
  let table = tableForViewer(snapshot, SPECTATOR_SEAT);
  const records: DraftRecord[] = [];
  const record = (message: string) => {
    const id = eventId(table.nextEventNumber);
    table = accepted(table, 'assignment', message);
    return id;
  };
  for (const entry of dealt) {
    const row = {
      kind: 'assignment' as const,
      factionName: entry.factionName,
      seat: entry.seat,
      position: entry.position,
    };
    records.push({ ...row, eventId: record(draftMessage(entry.name, row)) });
  }
  record(`Seats dealt: ${dealt.length} players, trading opens.`);
  return { ...nextSnapshot(snapshot, table), records };
}
