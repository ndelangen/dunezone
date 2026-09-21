import type { z } from 'zod';

import type { playGameProvisionSchema } from '../../src/shared/play/admission';
import type { SpiceTransfer } from '../../src/shared/play/banks';
import type { CaptureReadiness } from '../../src/shared/play/capture';
import { emptySnapshot } from '../../src/shared/play/commands';
import type { PlayDirectorySummary } from '../../src/shared/play/directory';
import type { DraftFaction } from '../../src/shared/play/drafting';
import {
  dealSeats,
  draftGates,
  emptyDraft,
  isDraftAction,
  PLAY_DRAFT_CATALOGUE_TTL_MS,
  resolveFactionPool,
} from '../../src/shared/play/drafting';
import type { SpawnContents } from '../../src/shared/play/inventory';
import { emptyPublicControls } from '../../src/shared/play/inventory';
import type { LoadProfile } from '../../src/shared/play/loadFixture';
import { isSeatAction } from '../../src/shared/play/participation';
import type { ClientMessage, GameSnapshot, ServerMessage, Viewer } from '../../src/shared/play/protocol';
import { GameRejection } from '../../src/shared/play/rejection';
import { isRemovalAction } from '../../src/shared/play/removal';
import type { TableRoster } from '../../src/shared/play/schema';
import { SPECTATOR_SEAT } from '../../src/shared/play/schema';
import { isSwapAction, openSwapping } from '../../src/shared/play/swapping';
import { isTableSeatCount } from '../../src/shared/play/tableSettings';
import { eventId as tableEventId } from '../../src/shared/play/tableState';
import type { RoomFrame } from '../../src/shared/play/updates';
import { ActorDirectory } from './actors';
import { HISTORY_REPAIR_VERSION } from './anonymizeHistory';
import { expireBattle } from './battle';
import { CaptureStore } from './captures';
import { Conversations } from './conversations';
import { DirectoryOutbox } from './directory';
import type { DraftRecord } from './drafting';
import { applyDraftAction, assignmentEvents, draftWithCatalogue, unbiased } from './drafting';
import { fixtureRoster, fixtureSnapshot, legacyFixtureRoster, seedFactionState } from './fixture';
import type { Patch } from './history';
import { applyPatch, diff } from './history';
import { logContext, PUBLIC_LOG_VERSION, PublicLog } from './log';
import type { SeatPlan } from './participation';
import { ownRequests, Participation } from './participation';
import { RemovalVotes } from './removal';
import { Room } from './room';
import { SetupSupply } from './setup';
import { initialSetup } from './setup-progress';
import { SpiceLedger } from './spiceLedger';
import type { StoredSnapshot } from './state';
import { internalAction, internalPieceId, RoomProjection, storedSnapshotSchema } from './state';
import { Swapping } from './swapping';

/** The opening table records who holds the first seat, so the log starts with the seating and not after it. */
function creatorSeated(snapshot: GameSnapshot, roster: TableRoster, displayName: string): GameSnapshot {
  const events = [
    ...snapshot.table.events,
    { id: 'evt-002', command: 'seat', message: `${displayName} holds seat 1.`, status: 'accepted' as const },
  ];
  return {
    ...snapshot,
    roster,
    table: { ...snapshot.table, events, nextEventNumber: snapshot.table.nextEventNumber + 1 },
  };
}

export type Metadata = {
  gameId: string;
  secret: string;
  attemptId: string;
  expiresAt: number;
  confirmed: boolean;
  loadProfile?: LoadProfile;
  /* Stations around the rim, fixed when the seating is. A room from before this field reads its fixture plan. */
  seatCount?: TableRoster['seatCount'];
  /* A real game's fixed ruleset, minimum and creator; absent on a fixture. */
  game?: z.infer<typeof playGameProvisionSchema>;
  /* An isolated backend may deal provisional catalogue content; a real game refuses unready factions. */
  provisional?: boolean;
  /* The scrub release this room's history is repaired to: stamped at creation, or committed with a startup repair. */
  historyRepair?: number;
  /* The public-log release this real game's log is complete to: stamped at creation, or committed with a startup backfill. */
  publicLog?: number;
  /* The catalogue deck the hosted fixture deals as its treachery cards; absent until the catalogue answers. */
  fixtureDeck?: SpawnContents;
};

type HistoryRow = {
  step: number;
  base_revision: number;
  revision: number;
  phase: number;
  kind: string;
  data: string;
  bytes: number;
};

type CommitMessage = Extract<ClientMessage, { type: 'drop' | 'command' }>;

/** What an attempt must find unchanged after its captures: the roster and the lists, order aside. */
function draftStamp(seated: readonly string[], draft: NonNullable<StoredSnapshot['draft']>): string {
  return JSON.stringify({
    seated: [...seated].sort((a, b) => a.localeCompare(b)),
    picks: draft.picks,
    bans: draft.bans,
    ready: [...draft.ready].sort((a, b) => a.localeCompare(b)),
  });
}

function tableColumns(sql: SqlStorage, table: 'seat_history' | 'actors'): Set<string> {
  return new Set(
    sql
      .exec<{ name: string }>(`PRAGMA table_info(${table})`)
      .toArray()
      .map((row) => row.name)
  );
}
const CREATOR_SEAT = 'seat-1';

/** Owns game state and its durable transitions; the host owns connections and delivery. */
export class GameSession {
  private readonly actors: ActorDirectory;
  private readonly log: PublicLog;
  private readonly removal: RemovalVotes;
  private readonly conversations: Conversations;
  private readonly participation: Participation;
  private readonly swapping: Swapping;
  private readonly spiceLedger: SpiceLedger;
  private readonly directory: DirectoryOutbox;
  private readonly captures: CaptureStore;
  private metadata: Metadata | undefined;
  private room: Room | undefined;
  private boundary: StoredSnapshot | undefined;
  private historyStep = 0;
  private roomProjection?: RoomProjection;
  private get projection() {
    this.roomProjection ??= new RoomProjection(this.metadata!.secret);
    return this.roomProjection;
  }
  constructor(private readonly storage: DurableObjectStorage) {
    this.log = new PublicLog(this.storage, () => (this.room ? logContext(this.room.snapshot) : 'Drafting'));
    this.actors = new ActorDirectory(this.storage, this.log);
    this.spiceLedger = new SpiceLedger(this.storage);
    this.directory = new DirectoryOutbox(this.storage);
    this.captures = new CaptureStore(this.storage);
    const sql = this.storage.sql;
    sql.exec('CREATE TABLE IF NOT EXISTS metadata (id INTEGER PRIMARY KEY CHECK(id=1), data TEXT NOT NULL)');
    sql.exec('CREATE TABLE IF NOT EXISTS current_state (id INTEGER PRIMARY KEY CHECK(id=1), data TEXT NOT NULL)');
    sql.exec(
      'CREATE TABLE IF NOT EXISTS history (step INTEGER PRIMARY KEY, base_revision INTEGER NOT NULL, revision INTEGER NOT NULL, phase INTEGER NOT NULL, kind TEXT NOT NULL, data TEXT NOT NULL, bytes INTEGER NOT NULL)'
    );
    sql.exec(
      'CREATE TABLE IF NOT EXISTS receipts (receipt_key TEXT PRIMARY KEY, actor_id TEXT, payload TEXT NOT NULL, revision INTEGER NOT NULL)'
    );
    sql.exec(
      'CREATE TABLE IF NOT EXISTS actors (user_id TEXT PRIMARY KEY, seat TEXT NOT NULL, display_name TEXT NOT NULL, deleted INTEGER NOT NULL DEFAULT 0)'
    );
    sql.exec(
      'CREATE TABLE IF NOT EXISTS seat_history (id INTEGER PRIMARY KEY, user_id TEXT, display_name TEXT NOT NULL, seat TEXT NOT NULL, event TEXT NOT NULL, created_at INTEGER NOT NULL)'
    );
    /*
     * Why a seat changed hands, who approved it and the event it wrote, added for explicit
     * participation. A room from before carries nulls there; an earlier release ignores the columns.
     */
    for (const column of ['cause TEXT', 'approver_id TEXT', 'approver_name TEXT', 'event_id TEXT']) {
      if (!tableColumns(sql, 'seat_history').has(column.split(' ')[0]!)) {
        sql.exec(`ALTER TABLE seat_history ADD COLUMN ${column}`);
      }
    }
    if (!tableColumns(sql, 'actors').has('avatar_url')) {
      sql.exec('ALTER TABLE actors ADD COLUMN avatar_url TEXT');
    }
    this.participation = new Participation(this.storage, this.actors);
    this.swapping = new Swapping(this.storage, this.actors, new SetupSupply(this.storage, this.captures), this.log);
    this.actors.participation = this.participation;
    this.removal = new RemovalVotes(this.storage, this.actors, this.log);
    this.conversations = new Conversations(this.storage, this.actors);
    sql.exec(
      'CREATE TABLE IF NOT EXISTS public_action_history (receipt_key TEXT PRIMARY KEY, user_id TEXT, display_name TEXT NOT NULL, action TEXT NOT NULL, contents TEXT, created_at INTEGER NOT NULL)'
    );
    sql.exec('CREATE TABLE IF NOT EXISTS battle_results (revision INTEGER PRIMARY KEY, data TEXT NOT NULL)');
    sql.exec('CREATE TABLE IF NOT EXISTS deletion_receipts (event_id TEXT PRIMARY KEY)');
    /*
     * Server-side only: which account filed a spawn request, so history replay can mask a deleted
     * requester, and the captured definitions the live snapshot omits, so approval and dismissal
     * audit rows still carry the full contents.
     */
    sql.exec(
      'CREATE TABLE IF NOT EXISTS spawn_requests (request_id TEXT PRIMARY KEY, user_id TEXT, definitions TEXT NOT NULL)'
    );
    /*
     * The seating a game fixed: one row per seat with its station and the faction it carries.
     * A room provisioned before this table existed carried the fixture pair in `faction_seats`;
     * it receives its fixture plan once, and that older table stays in place unread so an earlier
     * release can still start against the same storage.
     */
    sql.exec(
      'CREATE TABLE IF NOT EXISTS seats (seat TEXT PRIMARY KEY, position INTEGER NOT NULL UNIQUE, faction_id TEXT UNIQUE, faction_name TEXT, faction_color TEXT)'
    );
    /* Server-side only: which account each draft or assignment event names, so a deletion can rebuild the event. */
    sql.exec(
      'CREATE TABLE IF NOT EXISTS draft_history (id INTEGER PRIMARY KEY, event_id TEXT NOT NULL, user_id TEXT, display_name TEXT NOT NULL, kind TEXT NOT NULL, faction_name TEXT, seat TEXT NOT NULL, position INTEGER)'
    );
    const metadata = sql.exec<{ data: string }>('SELECT data FROM metadata WHERE id=1').toArray()[0];
    if (metadata) {
      this.metadata = JSON.parse(metadata.data) as Metadata;
      this.installLegacySeating();
      this.repairDeletedHistory();
      const stored = sql.exec<{ data: string }>('SELECT data FROM current_state WHERE id=1').one();
      this.room = this.openRoom(
        this.withRoster(this.spiceLedger.project(storedSnapshotSchema.parse(JSON.parse(stored.data))))
      );
      this.historyStep = sql.exec<{ step: number }>('SELECT MAX(step) AS step FROM history').one().step;
      this.boundary = this.restoreHistory(this.historyStep);
      this.installPublicLog();
      this.installDraft();
      /* A room evicted mid-attempt wakes owing a deal; the gates are judged again without waiting for a command. */
      this.closeDueTrading();
      this.installSetupProgress();
      this.finishSetupCleanup();
    }
  }

  /*
   * Deletion scrubs history inside its own transaction, so startup repairs only rows an older scrub release left.
   * The version commits with the rewrite; a failed rewrite keeps the old version and the next start repairs again.
   * In the constructor workerd discards every write of a throwing start anyway; the transaction keeps the method
   * safe should it ever run from a request.
   */
  private repairDeletedHistory() {
    const metadata = this.metadata!;
    if (metadata.historyRepair === HISTORY_REPAIR_VERSION) {
      return;
    }
    this.storage.transactionSync(() => {
      this.actors.scrubDeletedHistory();
      this.storage.sql.exec(
        "UPDATE metadata SET data=json_set(data, '$.historyRepair', ?) WHERE id=1",
        HISTORY_REPAIR_VERSION
      );
    });
    this.reloadMetadata();
  }

  /*
   * The public log is kept for real games only; one from before the log rebuilds its rows once from the
   * tables its producers already kept, and the version commits with them, as the history repair does.
   */
  private installPublicLog() {
    const metadata = this.metadata!;
    this.log.enabled = Boolean(metadata.game);
    if (!metadata.game || metadata.publicLog === PUBLIC_LOG_VERSION) {
      return;
    }
    const snapshot = this.room!.snapshot;
    this.storage.transactionSync(() => {
      this.log.backfill(snapshot);
      this.storage.sql.exec("UPDATE metadata SET data=json_set(data, '$.publicLog', ?) WHERE id=1", PUBLIC_LOG_VERSION);
    });
    this.reloadMetadata();
  }

  private reloadMetadata() {
    const { data } = this.storage.sql.exec<{ data: string }>('SELECT data FROM metadata WHERE id=1').one();
    this.metadata = JSON.parse(data) as Metadata;
  }

  /*
   * A room from before this release has no seats and no stored station count. It carried its
   * faction-to-seat mapping in `faction_seats` if it ever started under the previous release;
   * either way it is seated once from what it has, and its snapshot gains a bank and combat faces
   * for any house it lacks. A room from this release onward always has its count stored.
   */
  private installLegacySeating() {
    const sql = this.storage.sql;
    const legacy = sql.exec("SELECT name FROM sqlite_master WHERE type='table' AND name='faction_seats'").toArray();
    if (this.actors.hasSeats() || (!legacy.length && this.metadata?.seatCount !== undefined)) {
      return;
    }
    const rows = legacy.length
      ? sql
          .exec<{ faction_id: string; seat: string }>('SELECT faction_id, seat FROM faction_seats ORDER BY rowid')
          .toArray()
      : [];
    const roster = legacyFixtureRoster(rows, this.metadata?.loadProfile);
    this.storage.transactionSync(() => {
      this.actors.install(roster);
      const stored = sql.exec<{ data: string }>('SELECT data FROM current_state WHERE id=1').one();
      const seeded = seedFactionState(storedSnapshotSchema.parse(JSON.parse(stored.data)), roster);
      sql.exec('UPDATE current_state SET data=? WHERE id=1', JSON.stringify(seeded));
    });
  }

  /* A real game that was drafting before drafts existed gains an empty one; its catalogue is read on the first change. */
  private installDraft() {
    const room = this.room;
    const game = this.metadata?.game;
    if (!room || !game || room.snapshot.stage !== 'drafting' || room.snapshot.draft) {
      return;
    }
    const next: StoredSnapshot = { ...room.snapshot, draft: emptyDraft(game.minimumPlayers, [], 0) };
    this.storage.transactionSync(() => {
      this.storage.sql.exec('UPDATE current_state SET data=? WHERE id=1', JSON.stringify(next));
    });
    room.accept(next);
  }

  private seatCount(): TableRoster['seatCount'] {
    const row = this.storage.sql.exec<{ data: string }>('SELECT data FROM metadata WHERE id=1').toArray()[0];
    return (row && (JSON.parse(row.data) as Metadata).seatCount) ?? fixtureRoster(this.metadata?.loadProfile).seatCount;
  }

  /** The stored seating rides on every snapshot the room holds, as the current occupancy already does. */
  private withRoster<Snapshot extends StoredSnapshot>(snapshot: Snapshot): Snapshot {
    return { ...snapshot, roster: this.actors.roster(this.seatCount()) };
  }

  /** A drafting roster that outgrew its stations fixes a larger count, inside the caller's transaction. */
  private growStations() {
    const highest = this.actors.roster(this.seatCount()).seats.reduce((top, seat) => Math.max(top, seat.position), -1);
    const needed = highest + 1;
    if (this.metadata && needed > this.seatCount() && isTableSeatCount(needed)) {
      this.storage.sql.exec("UPDATE metadata SET data=json_set(data, '$.seatCount', ?) WHERE id=1", needed);
    }
  }

  private openRoom(snapshot: StoredSnapshot): Room {
    return new Room(
      snapshot,
      this.metadata?.loadProfile,
      () => this.actors.seats(),
      (userId) => this.actors.factionFor(userId),
      this.metadata?.fixtureDeck
    );
  }

  private isHostedFixture(metadata: Metadata) {
    return !metadata.game && !metadata.loadProfile;
  }

  /** A real game retains only ready content; the isolated development path may retain provisional content and says so. */
  private requireReady(subject: string, readiness: CaptureReadiness, options: { provisional?: boolean }) {
    const problem = readiness.problems[0];
    if (!readiness.ready && !options.provisional && problem) {
      throw new GameRejection(`This ${subject} is not ready: ${problem.subject}, ${problem.reason}`);
    }
  }

  retainedCaptures() {
    return { ruleset: this.captures.ruleset() ?? null, factions: this.captures.factions() };
  }

  /*
   * A fixture opens with its houses and pieces; a real game opens drafting with an empty table, its
   * minimum count of stations and its creator in the first seat, and nothing from any fixture.
   */
  initialize(provisioned: Metadata, factions: DraftFaction[] | null) {
    const game = provisioned.game;
    const roster: TableRoster = game
      ? { seatCount: game.minimumPlayers, seats: [{ id: CREATOR_SEAT, position: 0, faction: null }] }
      : fixtureRoster(provisioned.loadProfile);
    const metadata: Metadata = {
      ...provisioned,
      seatCount: roster.seatCount,
      historyRepair: HISTORY_REPAIR_VERSION,
      publicLog: PUBLIC_LOG_VERSION,
    };
    this.log.enabled = Boolean(game);
    const snapshot = game
      ? storedSnapshotSchema.parse({
          ...creatorSeated(emptySnapshot(), roster, game.creator.displayName),
          draft: emptyDraft(game.minimumPlayers, factions ?? [], factions ? Date.now() : 0),
        })
      : fixtureSnapshot(roster, metadata.loadProfile, metadata.fixtureDeck);
    const data = JSON.stringify(snapshot);
    this.storage.transactionSync(() => {
      this.storage.sql.exec('INSERT INTO metadata VALUES (1, ?)', JSON.stringify(metadata));
      this.storage.sql.exec('INSERT INTO current_state VALUES (1, ?)', data);
      this.storage.sql.exec(
        "INSERT INTO history VALUES (0, 0, 0, 0, 'checkpoint', ?, ?)",
        data,
        new TextEncoder().encode(data).byteLength
      );
      this.actors.install(roster);
      if (game) {
        this.actors.seatCreator(
          game.creator.userId,
          game.creator.displayName,
          CREATOR_SEAT,
          game.creator.avatarUrl ?? null
        );
        this.directory.stage(this.directorySummary(snapshot, Date.now(), metadata), Date.now());
      }
    });
    this.metadata = metadata;
    this.room = this.openRoom(snapshot);
    this.boundary = snapshot;
  }

  private installSetupProgress() {
    const room = this.room;
    if (!room || room.snapshot.stage !== 'setup' || room.snapshot.setup) {
      return;
    }
    const next = {
      ...room.snapshot,
      setup: initialSetup(this.captures.factions()),
      controls: { ...(room.snapshot.controls ?? emptyPublicControls()), ready: [] },
    };
    this.storage.sql.exec('UPDATE current_state SET data=? WHERE id=1', JSON.stringify(next));
    room.accept(next);
  }

  private finishSetupCleanup() {
    const room = this.room;
    const next = room?.finishSetupCleanup();
    if (!room || !next) {
      return false;
    }
    const history = this.battleCheckpoint(next);
    this.storage.transactionSync(() => {
      this.storage.sql.exec('UPDATE current_state SET data=? WHERE id=1', JSON.stringify(next));
      this.writeHistory(history);
    });
    room.accept(next);
    this.historyStep = history.step;
    this.boundary = next;
    return true;
  }

  /** An overdue cutoff runs before a command and on wake, even if the alarm was delayed. */
  private closeDueTrading() {
    const room = this.room;
    if (
      !room ||
      room.snapshot.stage !== 'swapping' ||
      (room.snapshot.swapping?.closed && !room.snapshot.roster?.seats.every((seat) => this.actors.holderOf(seat.id))) ||
      (room.snapshot.swapping && !room.snapshot.swapping.closed && room.snapshot.swapping.deadline > Date.now())
    ) {
      return;
    }
    const next = this.storage.transactionSync(() => {
      /* Older assignment releases stored no timer. They stay closed rather than inventing a new trading window. */
      const prior = room.snapshot.swapping
        ? room.snapshot
        : { ...room.snapshot, swapping: { ...openSwapping('legacy-assignment', 0), deadline: 0 } };
      const result = this.withRoster(
        this.swapping.reconcile(prior, { commandId: `deadline-${prior.swapping!.round}`, now: Date.now(), actor: null })
      );
      this.log.recordStage(prior, result);
      this.storage.sql.exec('UPDATE current_state SET data=? WHERE id=1', JSON.stringify(result));
      this.stageDirectory(result, Date.now());
      return result;
    });
    room.accept(next);
    return true;
  }

  /*
   * The directory summary a real game owes the lobby: its stage, who holds which seat with any
   * public faction, the phase during play and the time of its last durable change. Fixtures
   * publish nothing; the lobby lists real games only.
   */
  private directorySummary(snapshot: StoredSnapshot, now: number, metadata = this.metadata!): PlayDirectorySummary {
    const stage = snapshot.stage ?? 'play';
    const seatCount = this.metadata ? this.seatCount() : metadata.seatCount!;
    const factions = new Map(this.actors.roster(seatCount).seats.map((seat) => [seat.id, seat.faction]));
    return {
      stage,
      seatCount,
      seats: this.actors.seated().map(({ seat, userId }) => ({ seat, userId, faction: factions.get(seat) ?? null })),
      phase: stage === 'play' ? snapshot.phase : null,
      lastActivityAt: now,
      result: null,
    };
  }

  /** Stages the summary inside the caller's transaction, so the change and its delivery obligation commit together. */
  private stageDirectory(snapshot: StoredSnapshot, now: number) {
    if (this.metadata?.game) {
      this.directory.stage(this.directorySummary(snapshot, now), now);
    }
  }

  private revealDueBattle() {
    if (!this.room) {
      return;
    }
    const next = expireBattle(this.room.snapshot, Date.now());
    if (!next) {
      return;
    }
    const history = this.battleCheckpoint(next);
    this.storage.transactionSync(() => {
      this.storage.sql.exec('UPDATE current_state SET data=? WHERE id=1', JSON.stringify(next));
      this.writeHistory(history);
      this.stageDirectory(next, Date.now());
    });
    this.historyStep = history.step;
    this.boundary = next;
    this.room.accept(next);
    return true;
  }

  deleteActor(userId: string, eventId?: string) {
    const oldSeat = this.actors.seatFor(userId);
    const occupants = this.actors.seated();
    const committed = this.storage.transactionSync(() => {
      const stored = this.room
        ? storedSnapshotSchema.parse(
            JSON.parse(this.storage.sql.exec<{ data: string }>('SELECT data FROM current_state WHERE id=1').one().data)
          )
        : undefined;
      /* The vacated row and the event it names are written apart; they agree on the id the table hands out next. */
      const vacatedEventId =
        stored?.stage && oldSeat && oldSeat !== SPECTATOR_SEAT ? tableEventId(stored.table.nextEventNumber) : undefined;
      this.removal.scrub(userId);
      this.conversations.scrub(userId);
      this.actors.delete(userId, eventId, vacatedEventId);
      this.spiceLedger.deleteActor(userId);
      if (!stored) {
        return;
      }
      const scrubbed = storedSnapshotSchema.parse(
        JSON.parse(this.storage.sql.exec<{ data: string }>('SELECT data FROM current_state WHERE id=1').one().data)
      );
      const departed = this.participation.afterDeletion(userId, oldSeat, {
        snapshot: scrubbed,
        roster: this.actors.roster(this.seatCount()),
        now: Date.now(),
      });
      this.swapping.recordParticipation({
        before: scrubbed,
        after: departed,
        commandId: eventId ?? `deletion-${departed.revision}`,
        actor: null,
        occupants,
        now: Date.now(),
      });
      const settled = this.swapping.reconcile(departed, {
        commandId: eventId ?? `deletion-${departed.revision}`,
        now: Date.now(),
        actor: null,
      });
      const voted = this.reconcileVotes(settled, Date.now());
      const next = this.withRoster(
        this.spiceLedger.project({
          ...voted,
          controls: voted.controls && { ...voted.controls, seats: this.actors.seats() },
        })
      );
      this.log.recordStage(scrubbed, next);
      this.storage.sql.exec('UPDATE current_state SET data=? WHERE id=1', JSON.stringify(next));
      this.stageDirectory(next, Date.now());
      return { snapshot: next, boundary: this.restoreHistory(this.historyStep) };
    });
    this.reloadMetadata();
    if (committed) {
      this.room!.accept(committed.snapshot);
      this.boundary = committed.boundary;
    }
  }

  alreadyCommitted(key: string, message: CommitMessage): boolean {
    const receipt = this.storage.sql
      .exec<{ payload: string }>('SELECT payload FROM receipts WHERE receipt_key=?', key)
      .toArray()[0];
    if (!receipt) {
      return false;
    }
    if (receipt.payload !== JSON.stringify(message)) {
      throw new GameRejection('That command ID was already used for different input.');
    }
    return true;
  }

  private battleCheckpoint(
    next: StoredSnapshot,
    step = this.historyStep + 1,
    baseRevision = this.boundary!.revision
  ): HistoryRow {
    const data = JSON.stringify(next);
    return {
      step,
      base_revision: baseRevision,
      revision: next.revision,
      phase: next.phase,
      kind: 'checkpoint',
      data,
      bytes: new TextEncoder().encode(data).byteLength,
    };
  }

  private writeHistory(history: HistoryRow) {
    this.storage.sql.exec(
      'INSERT INTO history VALUES(?,?,?,?,?,?,?)',
      history.step,
      history.base_revision,
      history.revision,
      history.phase,
      history.kind,
      history.data,
      history.bytes
    );
  }

  private historyEntry(message: CommitMessage, next: StoredSnapshot): HistoryRow | undefined {
    if (next.revision === this.room?.snapshot.revision) {
      return;
    }
    if (
      message.type === 'command' &&
      (['prediction-lock', 'prediction-reveal', 'traitors-gather', 'storm-random'].includes(message.action.kind) ||
        (this.room?.snapshot.stage === 'setup' && ['ready', 'phase'].includes(message.action.kind)))
    ) {
      return this.battleCheckpoint(next);
    }
    if (message.type === 'command' && message.action.kind === 'battle-outcome' && !next.battleState) {
      return this.battleCheckpoint(next);
    }
    if (message.type !== 'command' || !['phase', 'turn', 'reset'].includes(message.action.kind)) {
      return;
    }
    const checkpoint = message.action.kind === 'reset';
    const data = JSON.stringify(checkpoint ? next : diff(this.boundary!, next));
    return {
      step: this.historyStep + 1,
      base_revision: this.boundary!.revision,
      revision: next.revision,
      phase: next.phase,
      kind: checkpoint ? 'checkpoint' : 'patch',
      data,
      bytes: new TextEncoder().encode(data).byteLength,
    };
  }

  private definitionsFor(requestId: string): SpawnContents['definitions'] {
    const row = this.storage.sql
      .exec<{ definitions: string }>('SELECT definitions FROM spawn_requests WHERE request_id=?', requestId)
      .toArray()[0];
    return row ? (JSON.parse(row.definitions) as SpawnContents['definitions']) : [];
  }

  private recordDraftEvent(record: DraftRecord, userId: string | null, displayName: string) {
    this.storage.sql.exec(
      'INSERT INTO draft_history(event_id,user_id,display_name,kind,faction_name,seat,position) VALUES(?,?,?,?,?,?,?)',
      record.eventId,
      userId,
      displayName,
      record.kind,
      record.factionName,
      record.seat,
      record.position
    );
  }

  private removeVotedPlayer = (
    snapshot: StoredSnapshot,
    userId: string,
    commandId: string,
    now: number
  ): StoredSnapshot => {
    const occupants = this.actors.seated();
    const after = this.participation.remove(userId, snapshot, now);
    this.swapping.recordParticipation({ before: snapshot, after, commandId, actor: null, occupants, now });
    return this.swapping.reconcile(after, { commandId, actor: null, now });
  };

  private reconcileVotes(snapshot: StoredSnapshot, now: number) {
    return this.removal.reconcile(snapshot, now, this.removeVotedPlayer);
  }

  /*
   * A seat command changes the seating and the snapshot together: the plan's writes, the stored
   * state, the summary the lobby is owed and the receipt commit in one transaction, and the roster
   * is restamped after the seating changed so the snapshot never shows a seat the rows lack.
   */
  private persistSeatCommit(key: string, viewer: Viewer, message: CommitMessage, plan: SeatPlan): StoredSnapshot {
    return this.storage.transactionSync(() => {
      const occupants = this.actors.seated();
      const participated = plan.apply();
      this.swapping.recordParticipation({
        before: this.room!.snapshot,
        after: participated,
        commandId: message.commandId,
        actor: viewer.userId,
        occupants,
        now: Date.now(),
      });
      const applied = this.swapping.reconcile(participated, {
        commandId: message.commandId,
        now: Date.now(),
        actor: viewer.userId,
      });
      this.growStations();
      const next = this.withRoster(this.reconcileVotes(applied, Date.now()));
      this.log.recordStage(this.room!.snapshot, next);
      this.storage.sql.exec('UPDATE current_state SET data=? WHERE id=1', JSON.stringify(next));
      this.stageDirectory(next, Date.now());
      this.storage.sql.exec(
        'INSERT INTO receipts VALUES(?,?,?,?)',
        key,
        viewer.userId,
        JSON.stringify(message),
        next.revision
      );
      return next;
    });
  }

  private persistCommit(commit: {
    key: string;
    viewer: Viewer;
    message: CommitMessage;
    next: StoredSnapshot;
    history?: HistoryRow;
    contents?: SpawnContents;
    transfer?: SpiceTransfer;
    draft?: DraftRecord;
  }) {
    const { key, viewer, message, next, history, contents, transfer, draft } = commit;
    this.storage.transactionSync(() => {
      this.storage.sql.exec('UPDATE current_state SET data=? WHERE id=1', JSON.stringify(next));
      if (draft) {
        this.recordDraftEvent(draft, viewer.userId, viewer.displayName);
      }
      this.stageDirectory(next, Date.now());
      const result = next.battleResults[0];
      if (result && result.revision === next.revision) {
        this.storage.sql.exec('INSERT INTO battle_results VALUES(?,?)', result.revision, JSON.stringify(result));
      }
      if (transfer) {
        this.spiceLedger.record(transfer, viewer.userId);
      }
      this.log.recordCommit({ before: this.room!.snapshot, next, message, viewer, transfer });
      this.storage.sql.exec(
        'INSERT INTO receipts VALUES(?,?,?,?)',
        key,
        viewer.userId,
        JSON.stringify(message),
        next.revision
      );
      if (message.type === 'command' && ['deck-draw', 'deck-shuffle'].includes(message.action.kind)) {
        const action =
          message.action.kind === 'deck-draw'
            ? { ...message.action, recipient: message.action.recipient ?? this.actors.factionFor(viewer.userId) }
            : message.action;
        this.storage.sql.exec(
          'INSERT INTO public_action_history VALUES(?,?,?,?,?,?)',
          key,
          viewer.userId,
          viewer.displayName,
          JSON.stringify(action),
          null,
          Date.now()
        );
      }
      if (
        message.type === 'command' &&
        ['spawn-request', 'spawn-approve', 'spawn-dismiss'].includes(message.action.kind)
      ) {
        const action = message.action;
        const pendingBefore = this.room!.snapshot.controls?.requests.length ?? 0;
        /* A sole player's request spawns directly and files nothing; only a filed request gets a row. */
        const filed =
          action.kind === 'spawn-request' && (next.controls?.requests.length ?? 0) > pendingBefore
            ? next.controls!.requests.at(-1)
            : undefined;
        const request =
          'requestId' in action
            ? this.room!.snapshot.controls?.requests.find((entry) => entry.id === action.requestId)
            : filed;
        if (filed) {
          this.storage.sql.exec(
            'INSERT OR IGNORE INTO spawn_requests VALUES(?,?,?)',
            filed.id,
            viewer.userId,
            JSON.stringify(contents?.definitions ?? [])
          );
        }
        const recorded = contents ?? (request && { ...request.contents, definitions: this.definitionsFor(request.id) });
        this.storage.sql.exec(
          'INSERT INTO public_action_history VALUES(?,?,?,?,?,?)',
          key,
          viewer.userId,
          viewer.displayName,
          JSON.stringify(action),
          JSON.stringify(recorded),
          Date.now()
        );
      }
      if (history) {
        this.writeHistory(history);
      }
    });
  }

  private restoreHistory(step: number): StoredSnapshot {
    const checkpoint = this.storage.sql
      .exec<HistoryRow>("SELECT * FROM history WHERE kind='checkpoint' AND step<=? ORDER BY step DESC LIMIT 1", step)
      .one();
    let snapshot = storedSnapshotSchema.parse(JSON.parse(checkpoint.data));
    let restoredStep = checkpoint.step;
    for (const row of this.storage.sql.exec<HistoryRow>(
      'SELECT * FROM history WHERE step>? AND step<=? ORDER BY step',
      checkpoint.step,
      step
    )) {
      if (row.step !== restoredStep + 1 || row.base_revision !== snapshot.revision) {
        throw new Error('History is incomplete.');
      }
      snapshot = this.restorePatch(snapshot, row);
      restoredStep = row.step;
    }
    if (restoredStep !== step) {
      throw new Error('History is incomplete.');
    }
    /* A patch row written before the seat-named requester replays the old key; the parse strips it. */
    return this.spiceLedger.project(this.actors.publicSnapshot(storedSnapshotSchema.parse(snapshot)));
  }

  private restorePatch(snapshot: StoredSnapshot, row: HistoryRow): StoredSnapshot {
    const next = storedSnapshotSchema.parse(applyPatch(snapshot, JSON.parse(row.data) as Patch[]));
    if (next.revision !== row.revision) {
      throw new Error('History is incomplete.');
    }
    return next;
  }

  /*
   * What a viewer receives on top of the projection: who holds each seat, by name and avatar, read
   * from the directory at send time and never stored; and for the requester alone, which pending
   * request is theirs. Nobody's id travels.
   */
  private forViewer(projected: GameSnapshot, viewer: Viewer): GameSnapshot {
    if (!projected.controls) {
      return projected;
    }
    const own = viewer.viewerSeat === SPECTATOR_SEAT ? this.participation.pendingRequestId(viewer.userId) : undefined;
    return {
      ...projected,
      controls: {
        ...projected.controls,
        players: this.actors.holders(),
        seatRequests: ownRequests(projected.controls.seatRequests, own),
      },
    };
  }

  roomFrame(viewer: Viewer): RoomFrame {
    return {
      epoch: this.room!.epoch,
      snapshot: {
        ...this.forViewer(this.projection.snapshot(this.room!.snapshot, this.actors.factionFor(viewer.userId)), viewer),
        ...(this.room!.snapshot.stage ? { removalVotes: this.removal.current() } : {}),
      },
      carries: this.projection.carries(this.room!.publicCarries(), this.room!.snapshot),
      pointers: [...this.room!.pointers.values()],
    };
  }
  private applyCommand(viewer: Viewer, message: CommitMessage, contents?: SpawnContents) {
    const room = this.room!;
    const key = `${viewer.userId}:${message.commandId}`;
    if (message.type === 'command' && isSwapAction(message.action)) {
      if (message.expectedRevision !== room.snapshot.revision) {
        throw new GameRejection('The table changed. Try the action again.');
      }
      const action = message.action;
      const next = this.storage.transactionSync(() => {
        const swapped = this.withRoster(
          this.swapping.apply({
            snapshot: room.snapshot,
            viewer,
            action,
            commandId: message.commandId,
            now: Date.now(),
          })
        );
        const applied = this.reconcileVotes(swapped, Date.now());
        this.persistCommit({ key, viewer, message, next: applied });
        return applied;
      });
      room.accept(next);
      return;
    }
    if (message.type === 'command' && isDraftAction(message.action)) {
      if (message.expectedRevision !== room.snapshot.revision) {
        throw new GameRejection('The draft changed. Try the action again.');
      }
      const applied = applyDraftAction(
        room.snapshot,
        viewer,
        message.action,
        this.actors.seats(),
        this.metadata?.game?.minimumPlayers ?? 2
      );
      const next = this.withRoster(applied.snapshot);
      this.persistCommit({ key, viewer, message, next, draft: applied.record });
      room.accept(next);
      return;
    }
    if (message.type === 'command' && isRemovalAction(message.action)) {
      if (message.expectedRevision !== room.snapshot.revision) {
        throw new GameRejection('The table changed. Try the action again.');
      }
      const action = message.action;
      const next = this.storage.transactionSync(() => {
        const applied = this.removal.apply(room.snapshot, viewer, action, Date.now());
        const settled = this.withRoster(this.reconcileVotes(applied, Date.now()));
        this.persistCommit({ key, viewer, message, next: settled });
        return settled;
      });
      this.reloadMetadata();
      room.accept(next);
      return;
    }
    if (message.type === 'command' && isSeatAction(message.action)) {
      if (message.expectedRevision !== room.snapshot.revision) {
        throw new GameRejection('The table changed. Try the action again.');
      }
      const plan = this.participation.plan(message.action, {
        viewer,
        snapshot: room.snapshot,
        roster: this.actors.roster(this.seatCount()),
        now: Date.now(),
      });
      const next = this.persistSeatCommit(key, viewer, message, plan);
      this.reloadMetadata();
      room.accept(next);
      return;
    }
    const next = this.withRoster(
      storedSnapshotSchema.parse(
        message.type === 'drop'
          ? room.drop(viewer, message.carryId, message.position, message.orientation)
          : message.action.kind === 'spawn-request'
            ? room.publicCommand(viewer, message.action, contents)
            : room.command(viewer, internalAction(room.snapshot, message.action), message.expectedRevision)
      )
    );
    const transfer = this.spiceLedger.describe(
      room.snapshot,
      next,
      message,
      viewer,
      this.actors.factionFor(viewer.userId)
    );
    if (transfer) {
      next.spiceTransfers = [transfer, ...(room.snapshot.spiceTransfers ?? [])].slice(0, 20);
    }
    const history = this.historyEntry(message, next);
    const completedCarryId = message.type === 'drop' ? message.carryId : undefined;
    const clearAll = message.type === 'command' && ['reset', 'enforcement'].includes(message.action.kind);
    const cleaned = room.finishSetupCleanup(next, completedCarryId, clearAll);
    const cleanupHistory = cleaned
      ? this.battleCheckpoint(
          cleaned,
          (history?.step ?? this.historyStep) + 1,
          history ? next.revision : this.boundary!.revision
        )
      : undefined;
    this.storage.transactionSync(() => {
      this.persistCommit({ key, viewer, message, next, history, contents, transfer });
      if (cleaned && cleanupHistory) {
        this.storage.sql.exec('UPDATE current_state SET data=? WHERE id=1', JSON.stringify(cleaned));
        this.writeHistory(cleanupHistory);
      }
    });
    room.accept(cleaned ?? next, completedCarryId, clearAll);
    const finalHistory = cleanupHistory ?? history;
    if (finalHistory) {
      this.historyStep = finalHistory.step;
      this.boundary = cleaned ?? next;
    }
  }

  /** A change to the stored draft outside any command: the catalogue read again, or a failed attempt's reason. */
  private rewriteDraft(rewrite: (draft: NonNullable<StoredSnapshot['draft']>) => NonNullable<StoredSnapshot['draft']>) {
    const room = this.room;
    if (!room?.snapshot.draft || room.snapshot.stage !== 'drafting') {
      return;
    }
    const next: StoredSnapshot = { ...room.snapshot, draft: rewrite(room.snapshot.draft) };
    this.storage.transactionSync(() => {
      this.storage.sql.exec('UPDATE current_state SET data=? WHERE id=1', JSON.stringify(next));
    });
    room.accept(next);
  }

  completeAssignment(prepared: NonNullable<ReturnType<GameSession['prepareAssignment']>>) {
    const { seated, factions, stamp } = prepared;
    const room = this.room!;
    const deal = dealSeats(seated, factions, unbiased);
    const committed = this.storage.transactionSync(() => {
      const stored = storedSnapshotSchema.parse(
        JSON.parse(this.storage.sql.exec<{ data: string }>('SELECT data FROM current_state WHERE id=1').one().data)
      );
      const current = stored.draft;
      const still = stored.stage === 'drafting' && current && draftStamp(this.actors.seats(), current) === stamp;
      if (!still) {
        return null;
      }
      /* Stations are unique per row, so every seat parks on a negative station before taking its dealt one. */
      for (const [index, entry] of deal.entries()) {
        this.storage.sql.exec('UPDATE seats SET position=? WHERE seat=?', -(index + 1), entry.seat);
      }
      for (const entry of deal) {
        const faction = current.factions.find((candidate) => candidate.id === entry.factionId)!;
        this.storage.sql.exec(
          'UPDATE seats SET position=?, faction_id=?, faction_name=?, faction_color=? WHERE seat=?',
          entry.position,
          faction.id,
          faction.name,
          faction.color,
          entry.seat
        );
      }
      this.storage.sql.exec("UPDATE metadata SET data=json_set(data, '$.seatCount', ?) WHERE id=1", seated.length);
      const occupants = new Map(this.actors.occupants().map((holder) => [holder.seat, holder]));
      const { draft: _ended, ...rest } = stored;
      const { records, ...dealt } = assignmentEvents(
        rest,
        deal.map((entry) => ({
          seat: entry.seat,
          name: occupants.get(entry.seat)?.name ?? entry.seat,
          factionName: current.factions.find((candidate) => candidate.id === entry.factionId)?.name ?? entry.factionId,
          position: entry.position,
        }))
      );
      for (const record of records) {
        const holder = occupants.get(record.seat);
        this.recordDraftEvent(record, holder?.userId ?? null, holder?.name ?? record.seat);
      }
      const controls = dealt.controls ?? emptyPublicControls();
      const next = this.withRoster({
        ...dealt,
        stage: 'swapping' as const,
        swapping: {
          ...openSwapping(crypto.randomUUID(), Date.now()),
          tokens: Object.fromEntries(
            deal.flatMap((entry) => {
              const token = this.captures.faction(entry.factionId)?.components.token.front;
              return token ? [[entry.seat, token]] : [];
            })
          ),
        },
        controls: { ...controls, ready: [], seats: this.actors.seats() },
      });
      const history = this.battleCheckpoint(next);
      this.log.recordStage(stored, next);
      this.storage.sql.exec('UPDATE current_state SET data=? WHERE id=1', JSON.stringify(next));
      this.writeHistory(history);
      this.stageDirectory(next, Date.now());
      return { next, history };
    });
    this.reloadMetadata();
    if (!committed) {
      return;
    }
    this.historyStep = committed.history.step;
    this.boundary = committed.next;
    room.accept(committed.next);
    return true;
  }

  get info(): Readonly<Metadata> | undefined {
    return this.metadata;
  }
  get ready() {
    return this.room !== undefined;
  }
  get needsFixtureDeck() {
    return this.metadata && this.isHostedFixture(this.metadata) && !this.metadata.fixtureDeck;
  }
  get revision() {
    return this.room!.snapshot.revision;
  }
  get historySteps() {
    return this.historyStep;
  }
  get receiptCount() {
    return this.storage.sql.exec<{ count: number }>('SELECT COUNT(*) AS count FROM receipts').one().count;
  }
  get phaseChangedAt() {
    return this.room?.snapshot.controls?.phaseChangedAt ?? 0;
  }
  get battleDeadline() {
    return this.room?.snapshot.battleState?.deadline ?? 0;
  }

  confirm() {
    const next = { ...this.metadata!, confirmed: true };
    this.storage.sql.exec('UPDATE metadata SET data=? WHERE id=1', JSON.stringify(next));
    this.metadata = next;
  }
  adoptFixtureDeck(deck: SpawnContents) {
    if (!this.metadata || this.metadata.fixtureDeck) {
      return;
    }
    const next = { ...this.metadata, fixtureDeck: deck };
    this.storage.sql.exec('UPDATE metadata SET data=? WHERE id=1', JSON.stringify(next));
    this.metadata = next;
    if (this.room) {
      this.room.fixtureDeck = deck;
    }
  }
  retainedRuleset(id: string) {
    return this.captures.expectRuleset(id);
  }
  retainedFaction(id: string) {
    return this.captures.faction(id);
  }
  retainRuleset(capture: Parameters<CaptureStore['retainRuleset']>[0], options: { provisional?: boolean }) {
    this.requireReady('ruleset', capture.readiness, options);
    return this.storage.transactionSync(() => this.captures.retainRuleset(capture));
  }
  retainFaction(capture: Parameters<CaptureStore['retainFaction']>[0], options: { provisional?: boolean }) {
    this.requireReady('faction', capture.readiness, options);
    return this.storage.transactionSync(() => this.captures.retainFaction(capture));
  }
  pendingDirectory() {
    return this.directory.pending();
  }
  acknowledgeDirectory(sequence: number) {
    this.directory.acknowledge(sequence);
  }
  advanceDirectory(sequence: number) {
    this.directory.advance(sequence);
  }
  deferDirectory(sequence: number, retryAt: number) {
    this.directory.defer(sequence, retryAt);
  }
  nextDeadline() {
    const deadlines = [
      this.room?.snapshot.battleState?.deadline,
      this.directory.pending()?.retryAt,
      this.room?.snapshot.stage === 'swapping' && !this.room.snapshot.swapping?.closed
        ? this.room.snapshot.swapping?.deadline
        : undefined,
    ].filter((deadline): deadline is number => deadline != null);
    return deadlines.length ? Math.min(...deadlines) : undefined;
  }
  advanceDeadlines() {
    const battle = this.revealDueBattle();
    const trading = this.closeDueTrading();
    return Boolean(battle || trading);
  }
  execute(viewer: Viewer, message: CommitMessage, contents?: SpawnContents) {
    if (this.alreadyCommitted(`${viewer.userId}:${message.commandId}`, message)) {
      return false;
    }
    this.applyCommand(viewer, message, contents);
    this.reloadMetadata();
    return true;
  }
  actorBatch(cursor: string) {
    return this.actors.batch(cursor);
  }
  seatFor(userId: string) {
    return this.actors.seatFor(userId);
  }
  factionFor(userId: string) {
    return this.actors.factionFor(userId);
  }
  viewer(...args: Parameters<ActorDirectory['viewer']>) {
    const viewer = this.actors.viewer(...args);
    const controls = this.room!.snapshot.controls ?? emptyPublicControls();
    this.room!.snapshot = this.withRoster({
      ...this.room!.snapshot,
      controls: { ...controls, seats: this.actors.seats() },
    });
    return viewer;
  }
  refreshViewer(viewer: Viewer) {
    const current = this.actors.currentViewer(viewer.connectionId, viewer.userId);
    if (current?.viewerSeat !== viewer.viewerSeat) {
      this.clearActivity(viewer.connectionId);
      if (this.room) {
        const controls = this.room.snapshot.controls ?? emptyPublicControls();
        this.room.snapshot = this.withRoster({
          ...this.room.snapshot,
          controls: { ...controls, seats: this.actors.seats() },
        });
      }
    }
    return current;
  }
  logPage(...args: Parameters<PublicLog['page']>) {
    return this.log.page(...args);
  }
  spicePage(...args: Parameters<SpiceLedger['page']>) {
    return this.spiceLedger.page(...args);
  }
  projectContents(contents: SpawnContents) {
    return this.projection.contents(contents);
  }
  historyFor(viewer: Viewer, step: number): Extract<ServerMessage, { type: 'history' }> {
    if (step > this.historyStep) {
      throw new GameRejection('Unknown history step.');
    }
    return {
      type: 'history',
      step,
      lastStep: this.historyStep,
      snapshot: this.forViewer(
        this.projection.snapshot(this.restoreHistory(step), this.actors.factionFor(viewer.userId)),
        viewer
      ),
    };
  }
  conversationFaction(viewer: Viewer) {
    return this.conversations.faction(this.room!.snapshot, viewer);
  }
  conversationPage(viewer: Viewer, request: Extract<ClientMessage, { type: 'conversation-history' }>) {
    this.conversations.authorize(this.room!.snapshot, viewer, request);
    return { ...request, ...this.conversations.page(request) };
  }
  markConversationRead(viewer: Viewer, request: Extract<ClientMessage, { type: 'conversation-read' }>) {
    const faction = this.conversations.authorize(this.room!.snapshot, viewer, request);
    this.conversations.read(request);
    return faction;
  }
  sendConversation(viewer: Viewer, request: Extract<ClientMessage, { type: 'conversation-send' }>) {
    this.conversations.authorize(this.room!.snapshot, viewer, request);
    return this.storage.transactionSync(() => {
      const saved = this.conversations.save(viewer, request, Date.now());
      if (saved.inserted) {
        this.stageDirectory(this.room!.snapshot, Date.now());
      }
      return saved;
    });
  }
  conversationSummaries(viewer: Viewer): Extract<ServerMessage, { type: 'conversations' }> | undefined {
    const factionId = this.conversationFaction(viewer);
    if (!factionId) {
      return;
    }
    const peers = this.room!.snapshot.roster?.seats.flatMap((seat) => (seat.faction ? [seat.faction.id] : [])) ?? [];
    return {
      type: 'conversations',
      factionId,
      generation: this.conversations.generation(),
      entries: this.conversations.summaries(factionId, peers),
    };
  }
  draftWork() {
    const draft = this.room?.snapshot.draft;
    if (!this.metadata?.game || this.room?.snapshot.stage !== 'drafting' || !draft) {
      return;
    }
    return { refresh: Date.now() - draft.catalogueAt >= PLAY_DRAFT_CATALOGUE_TTL_MS };
  }
  updateDraftCatalogue(factions: DraftFaction[]) {
    this.rewriteDraft((draft) => draftWithCatalogue(draft, factions, Date.now()));
  }
  assignmentFailed(reason: string) {
    this.rewriteDraft((draft) => ({ ...draft, failure: reason }));
  }
  prepareAssignment() {
    const draft = this.room?.snapshot.draft;
    const game = this.metadata?.game;
    if (!game || !draft || this.room?.snapshot.stage !== 'drafting') {
      return;
    }
    const seated = this.actors.seats();
    const gates = draftGates(draft, seated, game.minimumPlayers);
    if (!gates.minimumMet || !gates.allReady || !gates.enoughFactions) {
      return;
    }
    const factions = resolveFactionPool(draft, seated.length, unbiased);
    if (!factions) {
      return;
    }
    return { seated, factions, stamp: draftStamp(seated, draft) };
  }
  activity(
    viewer: Viewer,
    message: Extract<ClientMessage, { type: 'begin' | 'take' | 'renew' | 'cancel' }>
  ): Extract<ServerMessage, { type: 'carry' }> | undefined {
    const room = this.room!;
    let draft;
    switch (message.type) {
      case 'begin':
        draft = room.begin(viewer, {
          ...message,
          sourcePieceId: internalPieceId(room.snapshot, message.sourcePieceId),
        });
        break;
      case 'take':
        draft = room.take(viewer, { ...message, donorPieceId: internalPieceId(room.snapshot, message.donorPieceId) });
        break;
      case 'renew':
        room.renew(viewer, message.carryId);
        break;
      case 'cancel':
        room.cancel(viewer, message.carryId);
        break;
    }
    this.finishSetupCleanup();
    return draft
      ? { type: 'carry', carryId: message.carryId, draft: this.projection.draft(draft, room.snapshot) }
      : undefined;
  }
  pointer(...args: Parameters<Room['pointer']>) {
    this.room!.pointer(...args);
  }
  pose(...args: Parameters<Room['pose']>) {
    return this.room!.pose(...args);
  }
  clearActivity(connectionId: string) {
    this.room?.clearActivity(connectionId);
    this.finishSetupCleanup();
  }
  disconnect(connectionId: string) {
    this.room?.disconnect(connectionId);
    this.finishSetupCleanup();
  }
  sweep() {
    const swept = this.room?.sweep();
    const cleaned = this.finishSetupCleanup();
    return Boolean(swept || cleaned);
  }

  cancelRejectedDrop(viewer: Viewer, carryId: string) {
    if (this.room?.carries.get(carryId)?.connectionId !== viewer.connectionId) {
      return false;
    }
    this.room.cancel(viewer, carryId);
    this.finishSetupCleanup();
    return true;
  }
}
