import type { SpiceTransfer } from '../../src/shared/play/banks';
import { LOG_CLASS_TABS, LOG_PAGE_SIZE } from '../../src/shared/play/log';
import type { LogClass, LogEntry, LogTab } from '../../src/shared/play/log';
import { seatLabel } from '../../src/shared/play/participation';
import { phaseAt, TABLE_PHASES, tableProgressFor } from '../../src/shared/play/phases';
import type { ClientMessage, Viewer } from '../../src/shared/play/protocol';
import { setupStep } from '../../src/shared/play/setup';
import type { StoredSnapshot } from './state';

/** The one name retained history shows for a deleted account. */
export const DELETED_USER = '[deleted user]';
/** Rooms stamped below this rebuild their log from the older tables once at startup. */
export const PUBLIC_LOG_VERSION = 1;

type CommitMessage = Extract<ClientMessage, { type: 'drop' | 'command' }>;
type BattleResult = StoredSnapshot['battleResults'][number];
type Person = { userId: string | null; name: string };
type Entry = {
  /* Stable per event, so a producer that runs twice files one row. */
  key: string;
  class: LogClass;
  /* The sentence, with `{n}` standing for the n-th person, so a deleted account can be renamed without rewriting prose. */
  template: string;
  people?: Person[];
  context?: string;
  at?: number;
};
type Row = { sequence: number; class: LogClass; template: string; people: string; context: string; created_at: number };
type SeatCause = 'creation' | 'admission' | 'departure' | 'deletion' | 'removal';
type Ballot = { userId: string | null; name: string; choice: 'remove' | 'keep' | null };

/**
 * The retained public log of a real game.
 * Every producer files its own row inside the transaction that commits the event, so a retried command, a restart or a failed persistence never leaves the log ahead of or behind the table.
 * Rows are read newest first per tab, and a person named in a row reads `[deleted user]` after that account's deletion without the sentence being rewritten.
 */
export class PublicLog {
  /* Only a real game keeps a log; the hosted fixture has no stage and no Log tab. */
  enabled = false;
  /* Where an event happened, for a producer that holds no snapshot of its own. */
  context: () => string = () => 'Drafting';

  constructor(private readonly storage: DurableObjectStorage) {
    storage.sql.exec(
      'CREATE TABLE IF NOT EXISTS public_log (sequence INTEGER PRIMARY KEY AUTOINCREMENT, key TEXT NOT NULL UNIQUE, class TEXT NOT NULL, template TEXT NOT NULL, people TEXT NOT NULL, context TEXT NOT NULL, created_at INTEGER NOT NULL)'
    );
  }

  record(entry: Entry) {
    if (!this.enabled) {
      return;
    }
    this.storage.sql.exec(
      'INSERT OR IGNORE INTO public_log(key,class,template,people,context,created_at) VALUES(?,?,?,?,?,?)',
      entry.key,
      entry.class,
      entry.template,
      JSON.stringify(entry.people ?? []),
      entry.context ?? this.context(),
      entry.at ?? Date.now()
    );
  }

  /** Every entry of a commit: the phase it entered, a prediction, a spice transfer and a battle result. */
  recordCommit(commit: {
    before: StoredSnapshot;
    next: StoredSnapshot;
    message: CommitMessage;
    viewer: Viewer;
    transfer?: SpiceTransfer;
  }) {
    for (const entry of commitEntries(commit)) {
      this.record(entry);
    }
  }

  recordSeat(change: {
    event: 'joined' | 'vacated';
    cause: SeatCause;
    userId: string | null;
    name: string;
    seat: string;
    approver?: Person | null;
    eventId?: string | null;
    context?: string;
    at?: number;
  }) {
    const people = [{ userId: change.userId, name: change.name }, ...(change.approver ? [change.approver] : [])];
    this.record({
      key: `seat:${change.eventId ?? `${change.cause}:${change.userId ?? change.seat}`}`,
      class: 'seat',
      template: seatTemplate(change.event, change.cause, change.seat, Boolean(change.approver)),
      people,
      context: change.context,
      at: change.at,
    });
  }

  recordSwap(move: { offerId: string; userId: string; name: string; origin: string; target: string }) {
    this.record({
      key: `swap:${move.offerId}:${move.userId}`,
      class: 'seat',
      template: `{0} moved from ${seatLabel(move.origin)} to ${seatLabel(move.target)}.`,
      people: [{ userId: move.userId, name: move.name }],
    });
  }

  recordVote(vote: {
    id: string;
    result: 'removed' | 'failed' | 'nullified';
    target: Person & { seat: string };
    ballots: Ballot[];
    context: string;
    at: number;
  }) {
    const people: Person[] = [vote.target];
    const named = (ballots: Ballot[]) =>
      list(
        ballots.map((ballot) => {
          people.push(ballot);
          return `{${people.length - 1}}`;
        })
      );
    const remove = vote.ballots.filter((ballot) => ballot.choice === 'remove');
    const keep = vote.ballots.filter((ballot) => ballot.choice === 'keep');
    const uncast = vote.ballots.filter((ballot) => ballot.choice === null);
    const seat = seatLabel(vote.target.seat);
    const breakdown = [
      remove.length ? `${named(remove)} voted remove` : '',
      keep.length ? `${named(keep)} voted keep` : '',
      uncast.length ? `${named(uncast)} did not vote` : '',
    ]
      .filter(Boolean)
      .join('; ');
    const template =
      vote.result === 'nullified'
        ? `The vote about {0} ended without a result when they left ${seat}.`
        : `{0} ${vote.result === 'removed' ? 'is removed from' : 'keeps'} ${seat}: ${breakdown}.`;
    this.record({ key: `vote:${vote.id}`, class: 'vote', template, people, context: vote.context, at: vote.at });
  }

  page(tab: LogTab, before: number): { entries: LogEntry[]; more: boolean } {
    const classes = (Object.keys(LOG_CLASS_TABS) as LogClass[]).filter((entry) => LOG_CLASS_TABS[entry] === tab);
    const rows = this.storage.sql
      .exec<Row>(
        `SELECT * FROM public_log WHERE class IN (${classes.map(() => '?').join(',')}) AND sequence<? ORDER BY sequence DESC LIMIT ?`,
        ...classes,
        before,
        LOG_PAGE_SIZE + 1
      )
      .toArray();
    return {
      entries: rows.slice(0, LOG_PAGE_SIZE).map((row) => ({
        sequence: row.sequence,
        class: row.class,
        text: render(row.template, JSON.parse(row.people) as Person[]),
        context: row.context,
        at: row.created_at,
      })),
      more: rows.length > LOG_PAGE_SIZE,
    };
  }

  /** Every row naming the account now names `[deleted user]`; the events themselves stay. */
  scrub(userId: string) {
    const needle = `"userId":${JSON.stringify(userId)}`;
    for (const row of this.storage.sql
      .exec<{ sequence: number; people: string }>(
        'SELECT sequence, people FROM public_log WHERE instr(people, ?)>0',
        needle
      )
      .toArray()) {
      const people = (JSON.parse(row.people) as Person[]).map((person) =>
        person.userId === userId ? { userId: null, name: DELETED_USER } : person
      );
      this.storage.sql.exec('UPDATE public_log SET people=? WHERE sequence=?', JSON.stringify(people), row.sequence);
    }
  }

  /**
   * A real game from before the log gains its rows once, from the tables its producers already kept: seat history, swap moves and vote results for Audit, spice transfers, battle results and phase changes for Game.
   * Each tab keeps its own order, so Audit rows follow their clocks and Game rows follow the table revision.
   * Predictions left no durable record of their own and are not rebuilt.
   */
  backfill(factionName: (id: string) => string) {
    const sql = this.storage.sql;
    type Timed = { at: number; order: number; entry: Entry };
    const audit: Timed[] = [];
    for (const row of sql
      .exec<{
        id: number;
        user_id: string | null;
        display_name: string;
        seat: string;
        event: 'joined' | 'vacated';
        created_at: number;
        cause: SeatCause | null;
        approver_id: string | null;
        approver_name: string | null;
        event_id: string | null;
      }>('SELECT * FROM seat_history ORDER BY id')
      .toArray()) {
      const cause = row.cause ?? (row.event === 'joined' ? 'admission' : 'departure');
      const approver = row.approver_name ? { userId: row.approver_id, name: row.approver_name } : null;
      audit.push({
        at: row.created_at,
        order: row.id,
        entry: {
          key: `seat:${row.event_id ?? `row:${row.id}`}`,
          class: 'seat',
          template: seatTemplate(row.event, cause, row.seat, Boolean(approver)),
          people: [{ userId: row.user_id, name: row.display_name }, ...(approver ? [approver] : [])],
          context: '',
          at: row.created_at,
        },
      });
    }
    for (const row of sql
      .exec<{
        sequence: number;
        created_at: number;
        affected_id: string | null;
        display_name: string | null;
        origin: string;
        target: string;
        offer_id: string;
      }>(
        "SELECT swap_audit.sequence, swap_audit.created_at, swap_audit.affected_id, actors.display_name, swap_audit.origin, swap_audit.target, swap_audit.offer_id FROM swap_audit LEFT JOIN actors ON actors.user_id=swap_audit.affected_id WHERE swap_audit.kind='swap-move' AND swap_audit.offer_id IS NOT NULL ORDER BY swap_audit.sequence"
      )
      .toArray()) {
      audit.push({
        at: row.created_at,
        order: row.sequence,
        entry: {
          key: `swap:${row.offer_id}:${row.affected_id ?? `row:${row.sequence}`}`,
          class: 'seat',
          template: `{0} moved from ${seatLabel(row.origin)} to ${seatLabel(row.target)}.`,
          people: [
            { userId: row.affected_id, name: row.affected_id ? (row.display_name ?? DELETED_USER) : DELETED_USER },
          ],
          context: '',
          at: row.created_at,
        },
      });
    }
    const votes = sql
      .exec<{ sequence: number; vote_id: string; data: string; result: string; resolved_at: number; context: string }>(
        'SELECT * FROM removal_votes WHERE result IS NOT NULL ORDER BY sequence'
      )
      .toArray();
    const enabled = this.enabled;
    this.enabled = true;
    for (const row of [...audit].sort((left, right) => left.at - right.at || left.order - right.order)) {
      this.record(row.entry);
    }
    for (const row of votes) {
      const vote = JSON.parse(row.data) as { target: Person & { seat: string }; ballots: Ballot[] };
      this.recordVote({
        id: row.vote_id,
        result: row.result as 'removed' | 'failed' | 'nullified',
        target: vote.target,
        ballots: vote.ballots,
        context: row.context,
        at: row.resolved_at,
      });
    }
    const game: { revision: number; entry: Entry }[] = [];
    const contexts: { revision: number; context: string }[] = [];
    let previous: { phase: number; stage: string | undefined } | undefined;
    for (const row of sql
      .exec<{ revision: number; phase: number; kind: string; data: string }>('SELECT * FROM history ORDER BY step')
      .toArray()) {
      const snapshot = JSON.parse(row.data) as Partial<StoredSnapshot> & { stage?: string };
      const stage = row.kind === 'checkpoint' ? snapshot.stage : (previous?.stage ?? undefined);
      const current = { phase: row.phase, stage };
      const context =
        row.kind === 'checkpoint'
          ? logContext({ stage: snapshot.stage, phase: row.phase, setup: snapshot.setup })
          : playContext(row.phase);
      contexts.push({ revision: row.revision, context });
      if (previous && stage === 'play' && previous.stage !== 'play') {
        game.push({ revision: row.revision, entry: phaseEntry(row.revision, row.phase, 'turn', context) });
      } else if (previous && (stage === 'play' || stage === undefined) && row.phase !== previous.phase) {
        game.push({
          revision: row.revision,
          entry: phaseEntry(row.revision, row.phase, row.phase < previous.phase ? 'back' : 'step', context),
        });
      }
      previous = current;
    }
    const contextAt = (revision: number) =>
      [...contexts].reverse().find((entry) => entry.revision <= revision)?.context ?? playContext(0);
    for (const row of sql
      .exec<{ revision: number; user_id: string | null; data: string }>(
        'SELECT * FROM spice_transfers ORDER BY revision'
      )
      .toArray()) {
      const transfer = JSON.parse(row.data) as SpiceTransfer;
      game.push({
        revision: row.revision,
        entry: spiceEntry(
          transfer,
          { userId: row.user_id, name: transfer.actor },
          factionName,
          contextAt(row.revision)
        ),
      });
    }
    for (const row of sql
      .exec<{ revision: number; data: string }>('SELECT * FROM battle_results ORDER BY revision')
      .toArray()) {
      game.push({
        revision: row.revision,
        entry: battleEntry(JSON.parse(row.data) as BattleResult, factionName, contextAt(row.revision)),
      });
    }
    for (const row of [...game].sort((left, right) => left.revision - right.revision)) {
      this.record({ ...row.entry, at: 0 });
    }
    this.enabled = enabled;
  }
}

/** Where an event happened, as the log labels it: a turn and phase in play, the setup step, or the stage. */
export function logContext(snapshot: Pick<StoredSnapshot, 'stage' | 'phase' | 'setup'>): string {
  switch (snapshot.stage) {
    case 'drafting':
      return 'Drafting';
    case 'swapping':
      return 'Swapping';
    case 'setup':
      return snapshot.setup ? `Setup, ${setupStep(snapshot.setup).title}` : 'Setup';
    case 'finished':
      return 'Finished';
    case 'discarded':
      return 'Discarded';
    default:
      return playContext(snapshot.phase);
  }
}

function playContext(phase: number): string {
  return `Turn ${tableProgressFor(phase).turn}, ${phaseAt(phase).label}`;
}

function factionNameIn(snapshot: StoredSnapshot, id: string): string {
  return snapshot.roster?.seats.find((seat) => seat.faction?.id === id)?.faction?.name ?? id;
}

function commitEntries({
  before,
  next,
  message,
  viewer,
  transfer,
}: {
  before: StoredSnapshot;
  next: StoredSnapshot;
  message: CommitMessage;
  viewer: Viewer;
  transfer?: SpiceTransfer;
}): Entry[] {
  const entries: Entry[] = [];
  const context = logContext(next);
  const faction = (id: string) => factionNameIn(next, id);
  if (before.stage !== 'play' && next.stage === 'play') {
    entries.push(phaseEntry(next.revision, next.phase, 'turn', context));
  } else if (message.type === 'command' && next.stage === 'play' && before.phase !== next.phase) {
    switch (message.action.kind) {
      case 'phase':
        entries.push(phaseEntry(next.revision, next.phase, message.action.direction === -1 ? 'back' : 'step', context));
        break;
      case 'turn':
        entries.push(phaseEntry(next.revision, next.phase, 'turn', context));
        break;
    }
  }
  if (
    message.type === 'command' &&
    (message.action.kind === 'prediction-lock' || message.action.kind === 'prediction-reveal')
  ) {
    const prediction = next.privatePredictions[message.action.stepId];
    if (prediction) {
      entries.push({
        key: `prediction:${message.action.stepId}:${message.action.kind === 'prediction-lock' ? 'lock' : 'reveal'}`,
        class: 'prediction',
        template:
          message.action.kind === 'prediction-lock'
            ? `${faction(prediction.factionId)} locked its prediction.`
            : `${faction(prediction.factionId)} revealed its prediction: ${faction(prediction.choice.factionId)}, turn ${prediction.choice.turn}.`,
        context,
      });
    }
  }
  if (transfer) {
    entries.push(spiceEntry(transfer, { userId: viewer.userId, name: viewer.displayName }, faction, context));
  }
  const result = next.battleResults[0];
  if (result && result.revision === next.revision) {
    entries.push(battleEntry(result, faction, context));
  }
  return entries;
}

function phaseEntry(revision: number, phase: number, change: 'turn' | 'step' | 'back', context: string): Entry {
  const { turn } = tableProgressFor(phase);
  const label = phaseAt(phase).label;
  const template =
    change === 'back'
      ? `Returned to ${label}.`
      : change === 'turn' || phase % TABLE_PHASES.length === 0
        ? `Turn ${turn} began${phase % TABLE_PHASES.length === 0 ? '' : ` at ${label}`}.`
        : `${label} began.`;
  return { key: `phase:${revision}`, class: 'phase', template, context };
}

function spiceEntry(transfer: SpiceTransfer, actor: Person, faction: (id: string) => string, context: string): Entry {
  const amount = `${transfer.amount} spice`;
  const template =
    transfer.kind === 'withdrawal'
      ? `{0} withdrew ${amount} from the ${faction(transfer.source)} bank to the table.`
      : transfer.kind === 'collection'
        ? `{0} collected ${amount} from the table into the ${faction(transfer.destination ?? '')} bank.`
        : transfer.kind === 'supply'
          ? `{0} supplied ${amount} to the table.`
          : `{0} removed ${amount} from play.`;
  return { key: `spice:${transfer.revision}`, class: 'spice', template, people: [actor], context };
}

/* A result names the two factions and who prevailed; the indicator's position stays with the result, never a territory name. */
function battleEntry(result: BattleResult, faction: (id: string) => string, context: string): Entry {
  const [left, right] = result.factions;
  const template =
    result.outcome === 'none'
      ? `${faction(left)} and ${faction(right)} agreed on no winner.`
      : result.outcome === 'left'
        ? `${faction(left)} defeated ${faction(right)}.`
        : `${faction(right)} defeated ${faction(left)}.`;
  return { key: `battle:${result.id}`, class: 'battle', template, context };
}

function seatTemplate(event: 'joined' | 'vacated', cause: SeatCause, seat: string, approved: boolean): string {
  const label = seatLabel(seat);
  if (event === 'joined') {
    return cause === 'creation'
      ? `{0} created the game and took ${label}.`
      : `{0} took ${label}${approved ? ', approved by {1}' : ''}.`;
  }
  switch (cause) {
    case 'removal':
      return `{0} was removed from ${label}.`;
    case 'deletion':
      return `{0} left ${label} when the account was deleted.`;
    default:
      return `{0} left ${label}.`;
  }
}

function list(names: string[]): string {
  return names.length <= 1 ? names.join('') : `${names.slice(0, -1).join(', ')} and ${names.at(-1)}`;
}

function render(template: string, people: Person[]): string {
  return template.replace(/\{(\d+)\}/g, (_, index: string) => people[Number(index)]?.name ?? DELETED_USER);
}
