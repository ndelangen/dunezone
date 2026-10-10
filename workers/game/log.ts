import { alliesOf, isAllianceAction } from '../../src/shared/play/alliances';
import { factionTitleText, rosterFactionTitles } from '../../src/shared/play/factionLabels';
import { LOG_CLASS_TABS, LOG_PAGE_SIZE } from '../../src/shared/play/log';
import type { LogClass, LogEntry, LogTab } from '../../src/shared/play/log';
import { seatLabel } from '../../src/shared/play/participation';
import { phaseAt, STANDARD_PHASES, tableProgressFor } from '../../src/shared/play/phases';
import type { PhaseEntry } from '../../src/shared/play/phases';
import type { ClientMessage, Viewer } from '../../src/shared/play/protocol';
import { describeResult, isResultAction } from '../../src/shared/play/result';
import type { ResultAction } from '../../src/shared/play/result';
import { rosterSeat } from '../../src/shared/play/schema';
import { setupStep } from '../../src/shared/play/setup';
import type { SpiceTransfer } from '../../src/shared/play/spiceReserve';
import type { StoredSnapshot } from './state';

/** The one name retained history shows for a deleted account. */
const DELETED_USER = '[deleted user]';

type CommitMessage = Extract<ClientMessage, { type: 'drop' | 'command' }>;
type BattleResult = StoredSnapshot['battleResults'][number];
/* `deletedAs` is what the slot reads once the account is deleted, when `[deleted user]` alone would not tell it apart. */
type Person = { userId: string | null; name: string; deletedAs?: string };
type Entry = {
  /* Stable per event, so a producer that runs twice files one row. */
  key: string;
  class: LogClass;
  /* The sentence, with `{n}` standing for the n-th person, so a deleted account can be renamed without rewriting prose. */
  template: string;
  people?: Person[];
  context?: string;
  /* When it happened, if not now. */
  at?: number;
};
type Row = {
  sequence: number;
  class: LogClass;
  template: string;
  people: string;
  context: string;
  created_at: number | null;
};
type SeatCause = 'creation' | 'admission' | 'departure' | 'deletion' | 'removal';
type SeatChange = {
  event: 'joined' | 'vacated';
  cause: SeatCause;
  userId: string | null;
  name: string;
  seat: string;
  approver?: Person | null;
  eventId?: string | null;
  context?: string;
  at?: number;
};
type SwapMove = { offerId: string; userId: string | null; name: string; origin: string; target: string; at?: number };
type Ballot = { userId: string | null; name: string; choice: 'remove' | 'keep' | null };
type VoteResult = {
  id: string;
  result: 'removed' | 'failed' | 'nullified';
  target: Person & { seat: string };
  ballots: Ballot[];
  context: string;
  at: number;
};
type PhaseChange = 'turn' | 'step' | 'back';

/**
 * The retained public log of a real game.
 * Every producer files its own row inside the transaction that commits the event, so a retried command, a restart or a failed persistence never leaves the log ahead of or behind the table.
 * Rows are read newest first per tab, and a person named in a row reads `[deleted user]` after that account's deletion without the sentence being rewritten.
 */
export class PublicLog {
  /* Only a real game keeps a log; the hosted fixture has no stage and no Log tab. */
  enabled = false;

  constructor(
    private readonly storage: DurableObjectStorage,
    /* Where an event happened, for a producer that holds no snapshot of its own. */
    private readonly context: () => string
  ) {
    storage.sql.exec(
      'CREATE TABLE IF NOT EXISTS public_log (sequence INTEGER PRIMARY KEY AUTOINCREMENT, key TEXT NOT NULL UNIQUE, class TEXT NOT NULL, template TEXT NOT NULL, people TEXT NOT NULL, context TEXT NOT NULL, created_at INTEGER)'
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

  /** Every entry of a commit: the stage it entered, the phase it reached, a prediction, a spice transfer and a battle result. */
  recordCommit(commit: {
    before: StoredSnapshot;
    next: StoredSnapshot;
    message: CommitMessage;
    viewer: Viewer;
    transfer?: SpiceTransfer;
    holders: readonly Holder[];
  }) {
    if (!this.enabled) {
      return;
    }
    for (const entry of commitEntries(commit)) {
      this.record(entry);
    }
  }

  /** A stage the game entered outside a table command: assignment, the trading deadline, a departure or a deletion. */
  recordStage(before: StoredSnapshot, next: StoredSnapshot) {
    for (const entry of [stageEntry(before, next), endingClosed(before, next)]) {
      if (entry) {
        this.record(entry);
      }
    }
  }

  recordSeat(change: SeatChange) {
    this.record(seatEntry(change));
  }

  recordSwap(move: SwapMove) {
    this.record(swapEntry(move));
  }

  recordVote(vote: VoteResult) {
    this.record(voteEntry(vote));
  }

  page(tab: LogTab, before: number): { entries: LogEntry[]; more: boolean } {
    const classes = (Object.keys(LOG_CLASS_TABS) as LogClass[]).filter((entry) => LOG_CLASS_TABS[entry] === tab);
    const rows = this.storage.sql
      .exec<Row>(
        `SELECT sequence, class, template, people, context, created_at FROM public_log WHERE class IN (${classes.map(() => '?').join(',')}) AND sequence<? ORDER BY sequence DESC LIMIT ?`,
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
        person.userId === userId ? { userId: null, name: person.deletedAs ?? DELETED_USER } : person
      );
      this.storage.sql.exec('UPDATE public_log SET people=? WHERE sequence=?', JSON.stringify(people), row.sequence);
    }
  }
}

/** Where an event happened, as the log labels it: a turn and phase in play, the setup step, or the stage. */
export function logContext(snapshot: Pick<StoredSnapshot, 'stage' | 'phase' | 'phases' | 'setup'>): string {
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
      return playContext(snapshot.phase, snapshot.phases);
  }
}

function playContext(phase: number, phases?: readonly PhaseEntry[]): string {
  return `Turn ${tableProgressFor(phase, phases).turn}, ${phaseAt(phase, phases).label}`;
}

/** Who holds each seat as a commit lands, so a faction whose name another seat shares can name its player. */
type Holder = { seat: string; userId: string; name: string };
/** Writes a faction into a template, adding its player to the row's people when that is what tells it apart (#1667). */
type FactionNamer = (id: string, people: Person[]) => string;

function factionNamer(snapshot: StoredSnapshot, holders: readonly Holder[]): FactionNamer {
  const titles = rosterFactionTitles(snapshot.roster, holders);
  return (id, people) => {
    const title = titles.get(id);
    if (title?.tieBreak?.kind !== 'player') {
      return literal(title ? factionTitleText(title) : id);
    }
    const { userId, name, seat } = title.tieBreak.player;
    people.push({ userId, name, deletedAs: seatLabel(seat) });
    return `${literal(title.name)} ({${people.length - 1}})`;
  };
}

function commitEntries({
  before,
  next,
  message,
  viewer,
  transfer,
  holders,
}: {
  before: StoredSnapshot;
  next: StoredSnapshot;
  message: CommitMessage;
  viewer: Viewer;
  transfer?: SpiceTransfer;
  holders: readonly Holder[];
}): Entry[] {
  const context = logContext(next);
  const faction = factionNamer(next, holders);
  const stage = stageEntry(before, next);
  const change = phaseChangeOf(before, next, message);
  const result = next.battleResults[0];
  return [
    ...(stage ? [stage] : []),
    ...(change ? [phaseEntry(next.revision, next.phase, change, context, next.phases)] : []),
    ...(message.type === 'command' && isResultAction(message.action)
      ? resultEntries(before, next, message.action, viewer, faction)
      : [endingClosed(before, next)].filter((entry) => entry !== undefined)),
    ...(message.type === 'command' ? predictionEntries(next, message.action, faction, context) : []),
    ...placedPredictionEntries(before, next, message, faction, context),
    ...allianceEntries(before, next, message, viewer, faction, context),
    ...(transfer ? [spiceEntry(transfer, { userId: viewer.userId, name: viewer.displayName }, faction, context)] : []),
    ...(result && result.revision === next.revision ? [battleEntry(result, faction, context)] : []),
  ];
}

/*
 * A stage the game entered reads as a Phase row: the deal, the end of trading, the first turn, the discard.
 * A finished game and its continuation name who acted, so their rows come from the result command.
 */
function stageEntry(before: Pick<StoredSnapshot, 'stage'>, next: StoredSnapshot): Entry | undefined {
  if (before.stage === next.stage) {
    return undefined;
  }
  const context = logContext(next);
  switch (next.stage) {
    case 'swapping':
      return {
        key: `stage:swapping:${next.revision}`,
        class: 'phase',
        template: 'The factions were dealt and swapping began.',
        context,
      };
    case 'setup':
      return {
        key: `stage:setup:${next.revision}`,
        class: 'phase',
        template: 'Trading ended and setup began.',
        context,
      };
    case 'play':
      return before.stage === 'finished'
        ? undefined
        : phaseEntry(next.revision, next.phase, 'turn', context, next.phases);
    case 'discarded':
      return {
        key: `stage:discarded:${next.revision}`,
        class: 'phase',
        template: 'The game was discarded: no players remain.',
        context,
      };
    default:
      return undefined;
  }
}

/* Inside play, a phase or turn command that moved the tracker is a step, a return or a turn. */
function phaseChangeOf(before: StoredSnapshot, next: StoredSnapshot, message: CommitMessage): PhaseChange | undefined {
  const movedWithinPlay = before.stage === next.stage && next.stage === 'play' && before.phase !== next.phase;
  if (message.type !== 'command' || !movedWithinPlay) {
    return undefined;
  }
  switch (message.action.kind) {
    case 'phase':
      return message.action.direction === -1 ? 'back' : 'step';
    case 'turn':
      return 'turn';
    default:
      return undefined;
  }
}

/*
 * Determine winner, stopping it, the declaration and Continue playing each file one Phase row naming
 * the player, so the history keeps every declaration and continuation in order.
 */
function resultEntries(
  before: StoredSnapshot,
  next: StoredSnapshot,
  action: ResultAction,
  viewer: Viewer,
  faction: FactionNamer
): Entry[] {
  const people: Person[] = [{ userId: viewer.userId, name: viewer.displayName }];
  const template = (() => {
    switch (action.kind) {
      case 'result-open':
        return '{0} started determining the winner.';
      case 'result-cancel':
        return '{0} stopped determining the winner.';
      case 'result-declare':
        return next.result
          ? `{0} declared the result: ${describeResult(
              next.result.kind,
              next.result.factionIds.map((id) => faction(id, people))
            )}.`
          : undefined;
      case 'result-continue':
        return '{0} continued the game.';
    }
  })();
  if (!template || before.revision === next.revision) {
    return [];
  }
  return [
    {
      key: `result:${next.revision}`,
      class: 'phase',
      template,
      people,
      /* A declaration happened in Mentat pause; the finished stage is where it left the game. */
      context: logContext(action.kind === 'result-declare' ? before : next),
    },
  ];
}

/* An open sequence that closed on its own, because the phase moved on or its player left the seat, says so. */
function endingClosed(before: StoredSnapshot, next: StoredSnapshot): Entry | undefined {
  if (!before.ending || next.ending || next.stage === 'finished' || before.revision === next.revision) {
    return undefined;
  }
  return {
    key: `ending-closed:${next.revision}`,
    class: 'phase',
    template: 'Determining the winner by {0} ended.',
    people: [{ userId: before.ending.by.userId, name: before.ending.by.name }],
    context: logContext(before),
  };
}

/* A lock names only the faction; the choice appears once its player reveals it. */
function predictionEntries(
  next: StoredSnapshot,
  action: Extract<CommitMessage, { type: 'command' }>['action'],
  faction: FactionNamer,
  context: string
): Entry[] {
  if (action.kind !== 'prediction-lock' && action.kind !== 'prediction-reveal') {
    return [];
  }
  const prediction = next.privatePredictions[action.stepId];
  if (!prediction) {
    return [];
  }
  const locked = action.kind === 'prediction-lock';
  const people: Person[] = [];
  return [
    {
      key: `prediction:${action.stepId}:${locked ? 'lock' : 'reveal'}`,
      class: 'prediction',
      template: locked
        ? `${faction(prediction.factionId, people)} locked its prediction.`
        : `${faction(prediction.factionId, people)} revealed its prediction: ${faction(prediction.choice.factionId, people)}, turn ${prediction.choice.turn}.`,
      people,
      context,
    },
  ];
}

/* An alliance formed or grown names all its factions, and a faction leaving names the allies it left; offers stay out of the log. */
function allianceEntries(
  before: StoredSnapshot,
  next: StoredSnapshot,
  message: CommitMessage,
  viewer: Viewer,
  faction: FactionNamer,
  context: string
): Entry[] {
  if (message.type !== 'command' || !isAllianceAction(message.action) || before.revision === next.revision) {
    return [];
  }
  const people: Person[] = [];
  const names = (ids: readonly string[]) => ids.map((id) => faction(id, people)).join(', ');
  const template = (() => {
    if (message.action.kind === 'alliance-break') {
      const leaver = rosterSeat(before.roster, viewer.viewerSeat)?.faction?.id;
      const allies = leaver ? alliesOf(before.alliances, leaver) : [];
      return leaver && allies.length
        ? `${faction(leaver, people)} broke its alliance with ${names(allies)}.`
        : undefined;
    }
    const formed = next.alliances?.groups.find(
      (group) =>
        !before.alliances?.groups.some(
          (known) => known.length === group.length && known.every((id) => group.includes(id))
        )
    );
    return formed ? `${names(formed)} are now allied.` : undefined;
  })();
  return template ? [{ key: `alliance:${next.revision}`, class: 'alliance', template, people, context }] : [];
}

/* A prediction card placed on the table reveals its prediction, by a drop or a play from the hand alike (#1753). */
function placedPredictionEntries(
  before: StoredSnapshot,
  next: StoredSnapshot,
  message: CommitMessage,
  faction: FactionNamer,
  context: string
): Entry[] {
  if (message.type === 'command' && message.action.kind === 'prediction-reveal') {
    return [];
  }
  return Object.entries(next.privatePredictions).flatMap(([stepId, prediction]) => {
    if (prediction.revealedAt === null || before.privatePredictions[stepId]?.revealedAt !== null) {
      return [];
    }
    const people: Person[] = [];
    return [
      {
        key: `prediction:${stepId}:reveal`,
        class: 'prediction' as const,
        template: `${faction(prediction.factionId, people)} placed its prediction card: ${faction(prediction.choice.factionId, people)}, turn ${prediction.choice.turn}.`,
        people,
        context,
      },
    ];
  });
}

function phaseEntry(
  revision: number,
  phase: number,
  change: PhaseChange,
  context: string,
  phases: readonly PhaseEntry[] = STANDARD_PHASES
): Entry {
  const { turn } = tableProgressFor(phase, phases);
  const label = literal(phaseAt(phase, phases).label);
  const template =
    change === 'back'
      ? `Returned to ${label}.`
      : change === 'turn' || phase % phases.length === 0
        ? `Turn ${turn} began${phase % phases.length === 0 ? '' : ` at ${label}`}.`
        : `${label} began.`;
  return { key: `phase:${revision}`, class: 'phase', template, context };
}

function spiceEntry(transfer: SpiceTransfer, actor: Person, faction: FactionNamer, context: string): Entry {
  const people = [actor];
  const amount = `${transfer.amount} spice`;
  /* The `supply` kind is the Spice Bank (see CONTEXT.md); the literal is kept for stored transfer records. */
  const template =
    transfer.kind === 'withdrawal'
      ? `{0} withdrew ${amount} from the ${faction(transfer.source, people)} spice reserve to the table.`
      : transfer.kind === 'collection'
        ? `{0} collected ${amount} from the table into the ${faction(transfer.destination ?? '', people)} spice reserve.`
        : transfer.kind === 'supply'
          ? `{0} took ${amount} from the Spice Bank to the table.`
          : `{0} returned ${amount} to the Spice Bank.`;
  return { key: `spice:${transfer.revision}`, class: 'spice', template, people, context };
}

/* A result names the two factions and who prevailed; the indicator's position stays with the result, never a territory name. */
function battleEntry(result: BattleResult, faction: FactionNamer, context: string): Entry {
  const [left, right] = result.factions;
  const people: Person[] = [];
  const template =
    result.outcome === 'none'
      ? `The battle between ${faction(left, people)} and ${faction(right, people)} ended with no winner.`
      : result.outcome === 'left'
        ? `${faction(left, people)} defeated ${faction(right, people)}.`
        : `${faction(right, people)} defeated ${faction(left, people)}.`;
  return { key: `battle:${result.id}`, class: 'battle', template, people, context };
}

function seatEntry(change: SeatChange): Entry {
  const label = seatLabel(change.seat);
  const template =
    change.event === 'joined'
      ? change.cause === 'creation'
        ? `{0} created the game and took ${label}.`
        : `{0} took ${label}${change.approver ? ', approved by {1}' : ''}.`
      : change.cause === 'removal'
        ? `{0} was removed from ${label}.`
        : change.cause === 'deletion'
          ? `{0} left ${label} when the account was deleted.`
          : `{0} left ${label}.`;
  return {
    key: `seat:${change.eventId ?? `${change.cause}:${change.userId ?? change.seat}`}`,
    class: 'seat',
    template,
    people: [{ userId: change.userId, name: change.name }, ...(change.approver ? [change.approver] : [])],
    context: change.context,
    at: change.at,
  };
}

function swapEntry(move: SwapMove): Entry {
  return {
    key: `swap:${move.offerId}:${move.userId}`,
    class: 'seat',
    template: `{0} moved from ${seatLabel(move.origin)} to ${seatLabel(move.target)}.`,
    people: [{ userId: move.userId, name: move.name }],
    at: move.at,
  };
}

/* The result and every ballot, named, in one sentence: who voted remove, who voted keep, who did not vote. */
function voteEntry(vote: VoteResult): Entry {
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
  return { key: `vote:${vote.id}`, class: 'vote', template, people, context: vote.context, at: vote.at };
}

function list(names: string[]): string {
  return names.length <= 1 ? names.join('') : `${names.slice(0, -1).join(', ')} and ${names.at(-1)}`;
}

/* Names a template carries as text, a faction's or a phase's, keep their braces: `render` reads `{{` back as one brace, never as a player slot. */
function literal(text: string): string {
  return text.replaceAll('{', '{{');
}

function render(template: string, people: Person[]): string {
  return template.replace(/\{\{|\{(\d+)\}/g, (_, index: string | undefined) =>
    index === undefined ? '{' : (people[Number(index)]?.name ?? DELETED_USER)
  );
}
