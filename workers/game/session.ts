import type { z } from 'zod';

import type { playGameProvisionSchema } from '../../src/shared/play/admission';
import type { BugReportBrowser } from '../../src/shared/play/bugReports';
import { publicFaction } from '../../src/shared/play/capture';
import type { CaptureReadiness } from '../../src/shared/play/capture';
import { emptySnapshot } from '../../src/shared/play/commands';
import { isRecallConversation } from '../../src/shared/play/conversations';
import { conversationMembers } from '../../src/shared/play/conversations';
import type { PlayDirectorySummary } from '../../src/shared/play/directory';
import type { DraftFaction, DraftState } from '../../src/shared/play/drafting';
import {
  dealSeats,
  draftedPool,
  draftGates,
  emptyDraft,
  isDraftAction,
  PLAY_DRAFT_CATALOGUE_TTL_MS,
  resolveFactionPool,
} from '../../src/shared/play/drafting';
import type { StoredSpawnContents } from '../../src/shared/play/inventory';
import { emptyPublicControls } from '../../src/shared/play/inventory';
import { isSeatAction, seatSubject } from '../../src/shared/play/participation';
import { composeTurn, lobbyPhaseIndex, recomposedTurn } from '../../src/shared/play/phases';
import type { PhaseEntry } from '../../src/shared/play/phases';
import { rosterFactionIds } from '../../src/shared/play/protocol';
import type { ClientMessage, CommitMessage, GameSnapshot, ServerMessage, Viewer } from '../../src/shared/play/protocol';
import { GameRejection } from '../../src/shared/play/rejection';
import { isRemovalAction } from '../../src/shared/play/removal';
import { isResultAction } from '../../src/shared/play/result';
import { isReviewAction, REVIEW_CHECKPOINTS, reviewableStage, reviewRunning } from '../../src/shared/play/review';
import type { TableReview } from '../../src/shared/play/review';
import type { TableRoster } from '../../src/shared/play/schema';
import { SPECTATOR_SEAT } from '../../src/shared/play/schema';
import type { SpiceTransfer } from '../../src/shared/play/spiceReserve';
import { stormOrder } from '../../src/shared/play/stormSector';
import { isSwapAction } from '../../src/shared/play/swapping';
import { isTableSeatCount } from '../../src/shared/play/tableSettings';
import { eventId as tableEventId } from '../../src/shared/play/tableState';
import type { RoomFrame } from '../../src/shared/play/updates';
import { ActorDirectory } from './actors';
import { expireBattle } from './battle';
import { biddingDeadline, expireBidding } from './bidding';
import { CaptureStore } from './captures';
import { Conversations } from './conversations';
import { DirectoryOutbox } from './directory';
import {
  applyDraftAction,
  dealtSnapshot,
  draftWithCatalogue,
  draftWithSetAside,
  rewrittenDraft,
  unbiased,
} from './drafting';
import type { SetAsideJudgement } from './drafting';
import { hostedFixturePlan } from './fixture';
import type { FixturePlan } from './fixture';
import { logContext, PublicLog } from './log';
import type { SeatPlan } from './participation';
import { ownRequests, Participation } from './participation';
import { revealPlacedPredictions } from './predictionCards';
import { PublicActions } from './publicActions';
import { RemovalVotes } from './removal';
import { applyResult, settleEnding } from './result';
import { TableReviews } from './review';
import type { ReviewCommand } from './review';
import { Room } from './room';
import type { HistoryRow } from './sessionHistory';
import { SessionHistory } from './sessionHistory';
import { initializeSessionStorage } from './sessionStorage';
import { SetupSupply } from './setup';
import { initialSetup } from './setup-progress';
import { SpiceLedger } from './spiceLedger';
import type { StoredSnapshot } from './state';
import {
  internalAction,
  internalPieceId,
  RoomProjection,
  seatedFaction,
  storedSnapshotSchema,
  validatedSnapshot,
  withKnownCardFaces,
} from './state';
import { Swapping } from './swapping';

/** A ruleset that brings a second board opens the game on the two-board table. */
function withSecondBoard(snapshot: GameSnapshot, secondBoard: unknown): GameSnapshot {
  return secondBoard ? { ...snapshot, table: { ...snapshot.table, tableLayout: 'two-boards' } } : snapshot;
}

/** The opening table records that the creator holds the first seat, so the log starts with the seating and not after it. */
function creatorSeated(snapshot: GameSnapshot, roster: TableRoster): GameSnapshot {
  const events = [
    ...snapshot.table.events,
    {
      id: 'evt-002',
      command: 'seat',
      message: `${seatSubject(CREATOR_SEAT)} is taken by the creator.`,
      status: 'accepted' as const,
    },
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
  /* Stations around the rim, fixed when the seating is. A room from before this field reads its fixture plan. */
  seatCount?: TableRoster['seatCount'];
  /* A real game's fixed ruleset, minimum and creator; absent on a fixture. */
  game?: z.infer<typeof playGameProvisionSchema>;
  /* An isolated backend may deal provisional catalogue content; a real game refuses unready factions. */
  provisional?: boolean;
  /* The shorter phase cooldown a synthetic backend provisioned in the isolated local stack; absent means the real one. */
  testPhaseCooldownMs?: number;
  /* The catalogue deck the hosted fixture deals as its treachery cards; absent until the catalogue answers. */
  fixtureDeck?: StoredSpawnContents;
};

type CommandMessage = Extract<ClientMessage, { type: 'command' }>;
type TableMessage =
  | Extract<CommitMessage, { type: 'drop' }>
  | (CommandMessage & { action: Parameters<Room['command']>[1] });

/** What an attempt must find unchanged after its captures: the roster, the lists and the factions set aside, order aside. */
function draftStamp(seated: readonly string[], draft: NonNullable<StoredSnapshot['draft']>): string {
  return JSON.stringify({
    seated: [...seated].sort((a, b) => a.localeCompare(b)),
    picks: draft.picks,
    bans: draft.bans,
    ready: [...draft.ready].sort((a, b) => a.localeCompare(b)),
    setAside: Object.keys(draft.setAside ?? {}).sort((a, b) => a.localeCompare(b)),
  });
}

/** A command's receipt row: one per user and command id, so a retry finds the commit it repeats. */
function receiptKey(viewer: Viewer, message: CommitMessage): string {
  return `${viewer.userId}:${message.commandId}`;
}

/** The seat a real game's creator holds from creation. */
const CREATOR_SEAT = 'seat-1';

/** A capture refused for readiness, carrying its first problem alone for the draft to show beside the faction. */
export class NotReady extends GameRejection {
  constructor(
    subject: string,
    readonly problem: string
  ) {
    super(`This ${subject} is not ready: ${problem}`);
  }
}

/** The first readiness problem, as the draft and a refusal both phrase it; nothing when the capture is ready. */
export function readinessProblem(readiness: CaptureReadiness): string | undefined {
  const problem = readiness.ready ? undefined : readiness.problems[0];
  return problem && `${problem.subject}, ${problem.reason}`;
}

/** Owns game state and its durable transitions; the host owns connections and delivery. */
export class GameSession {
  private readonly actors: ActorDirectory;
  private readonly log: PublicLog;
  private readonly removal: RemovalVotes;
  private readonly reviews: TableReviews;
  private readonly conversations: Conversations;
  private readonly participation: Participation;
  private readonly swapping: Swapping;
  private readonly spiceLedger: SpiceLedger;
  private readonly directory: DirectoryOutbox;
  private readonly captures: CaptureStore;
  private metadata: Metadata | undefined;
  private room: Room | undefined;
  private readonly history: SessionHistory;
  private readonly publicActions: PublicActions;
  private roomProjection?: RoomProjection;
  private get projection() {
    this.roomProjection ??= new RoomProjection(this.metadata!.secret);
    return this.roomProjection;
  }
  constructor(
    private readonly storage: DurableObjectStorage,
    /* What a fixture room seats and lays out: the hosted fixture's, unless a load entry supplies its own. */
    private readonly fixturePlan: FixturePlan = hostedFixturePlan,
    /* Whether a user is at the seat limit, which the host learns from each admission. */
    atSeatLimit?: (userId: string) => boolean
  ) {
    this.log = new PublicLog(this.storage, () => (this.room ? logContext(this.room.snapshot) : 'Drafting'));
    this.actors = new ActorDirectory(this.storage, this.log);
    this.spiceLedger = new SpiceLedger(this.storage);
    this.history = new SessionHistory(this.storage, this.actors, this.spiceLedger);
    this.publicActions = new PublicActions(this.storage);
    this.directory = new DirectoryOutbox(this.storage);
    this.captures = new CaptureStore(this.storage);
    const sql = this.storage.sql;
    initializeSessionStorage(sql);
    this.participation = new Participation(this.storage, this.actors, atSeatLimit);
    this.swapping = new Swapping(this.storage, this.actors, new SetupSupply(this.storage, this.captures), this.log);
    this.actors.participation = this.participation;
    this.removal = new RemovalVotes(this.storage, this.actors, this.log);
    this.reviews = new TableReviews(this.storage, this.actors, this.log, (id) => this.conversations.discardRecall(id));
    this.conversations = new Conversations(this.storage, this.actors);
    const metadata = sql.exec<{ data: string }>('SELECT data FROM metadata WHERE id=1').toArray()[0];
    if (metadata) {
      this.metadata = JSON.parse(metadata.data) as Metadata;
      /* Only a real game keeps a log, and a woken room must keep filing it. */
      this.log.enabled = Boolean(this.metadata.game);
      this.room = this.openRoom(this.withRoster(this.spiceLedger.project(this.storedSnapshot())));
      this.history.restoreBoundary();
      /* A room evicted mid-attempt wakes owing a deal; the gates are judged again without waiting for a command. */
      this.closeDueTrading();
      this.installSetupProgress();
      this.finishSetupCleanup();
    }
  }

  private reloadMetadata() {
    const { data } = this.storage.sql.exec<{ data: string }>('SELECT data FROM metadata WHERE id=1').one();
    this.metadata = JSON.parse(data) as Metadata;
  }

  private seatCount(): TableRoster['seatCount'] {
    const row = this.storage.sql.exec<{ data: string }>('SELECT data FROM metadata WHERE id=1').toArray()[0];
    return (row && (JSON.parse(row.data) as Metadata).seatCount) ?? this.fixturePlan.roster.seatCount;
  }

  /** The stored seating rides on every snapshot the room holds, as the current occupancy already does. */
  private withRoster<Snapshot extends StoredSnapshot>(snapshot: Snapshot): Snapshot {
    const settled = settleEnding(snapshot, () => new Set(this.actors.seated().map((occupant) => occupant.userId)));
    const roster = this.actors.roster(this.seatCount());
    const composed = this.composedTurn(roster, settled.table);
    /* Before play no phase has been played, so the turn takes the order as it stands, and the first turn plays it. */
    const playing = inPlay(settled.stage) && (!this.room || inPlay(this.room.snapshot.stage));
    const phases = playing
      ? recomposedTurn(settled.phase, this.room?.snapshot.phase, settled.phases, composed)
      : composed;
    return { ...settled, roster, phases };
  }

  /**
   * The turn a real game plays once its factions are captured: the seated factions' declarations around the standard phases, ordered by the marker as it stands (#1138).
   * Recomposed with every snapshot the room accepts, so a storm move reorders the entries after Storm and nothing stores an order.
   * A game whose seated factions declare nothing (a fixture, one still drafting, or plain factions) plays the standard turn and carries no list.
   */
  private composedTurn(roster: TableRoster, table: StoredSnapshot['table']): PhaseEntry[] | undefined {
    const seated = new Set(rosterFactionIds(roster));
    const factions = this.captures
      .phaseDeclarations()
      .filter((entry) => seated.has(entry.factionId) && entry.declarations.length > 0);
    if (!factions.length) {
      return undefined;
    }
    return composeTurn(factions, stormOrder(table.stormSectorIndex, roster, table.pieces));
  }

  /** A drafting roster that outgrew its stations fixes a larger count, inside the caller's transaction. */
  private growStations() {
    const highest = this.actors.roster(this.seatCount()).seats.reduce((top, seat) => Math.max(top, seat.position), -1);
    const needed = highest + 1;
    if (!this.metadata) {
      return;
    }
    if (needed <= this.seatCount()) {
      return;
    }
    if (!isTableSeatCount(needed)) {
      return;
    }
    this.storage.sql.exec("UPDATE metadata SET data=json_set(data, '$.seatCount', ?) WHERE id=1", needed);
  }

  private openRoom(snapshot: StoredSnapshot): Room {
    return new Room(
      snapshot,
      () => this.actors.seats(),
      (userId) => this.actors.factionFor(userId),
      this.metadata?.fixtureDeck,
      this.metadata?.testPhaseCooldownMs
    );
  }

  private isHostedFixture(metadata: Metadata) {
    return !metadata.game && this.fixturePlan.hosted;
  }

  /** A real game retains only ready content; the isolated development path may retain provisional content and says so. */
  private requireReady(subject: string, readiness: CaptureReadiness, options: { provisional?: boolean }) {
    if (readiness.ready) {
      return;
    }
    if (options.provisional) {
      return;
    }
    const problem = readinessProblem(readiness);
    if (!problem) {
      return;
    }
    throw new NotReady(subject, problem);
  }

  /**
   * A seated faction's public starting sheet as this game captured it, or nothing otherwise.
   * A deal refused partway can leave captures of factions never seated, and those stay unanswered.
   */
  publicFaction(factionId: string) {
    const seated = this.room && seatedFaction(this.room.snapshot, factionId);
    const capture = seated ? this.captures.faction(factionId) : undefined;
    return capture ? publicFaction(capture) : null;
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
      : this.fixturePlan.roster;
    const metadata: Metadata = {
      ...provisioned,
      seatCount: roster.seatCount,
    };
    this.log.enabled = Boolean(game);
    const snapshot = game
      ? storedSnapshotSchema.parse({
          ...withSecondBoard(creatorSeated(emptySnapshot(), roster), this.captures.ruleset()?.secondBoard),
          draft: emptyDraft(game.minimumPlayers, factions ?? [], factions ? Date.now() : 0),
          ...(game.lastTurn === undefined ? {} : { lastTurn: game.lastTurn }),
        })
      : this.fixturePlan.snapshot(roster, metadata.fixtureDeck);
    const data = JSON.stringify(snapshot);
    this.storage.transactionSync(() => {
      this.storage.sql.exec('INSERT INTO metadata VALUES (1, ?)', JSON.stringify(metadata));
      this.storage.sql.exec('INSERT INTO current_state VALUES (1, ?)', data);
      this.history.seed(snapshot);
      this.actors.install(roster);
      if (game) {
        this.actors.seatCreator(game.creator.userId, game.creator.displayName, CREATOR_SEAT, game.creator);
        this.directory.stage(this.directorySummary(snapshot, Date.now(), metadata), Date.now());
      }
    });
    this.metadata = metadata;
    this.room = this.openRoom(snapshot);
    this.history.accept(0, snapshot);
  }

  private installSetupProgress() {
    const room = this.room;
    if (!room || room.snapshot.stage !== 'setup' || room.snapshot.setup) {
      return;
    }
    const next = {
      ...room.snapshot,
      setup: initialSetup(
        this.captures.factions(),
        room.snapshot.roster,
        room.snapshot.table.stormSectorIndex,
        room.snapshot.table.pieces
      ),
      controls: { ...(room.snapshot.controls ?? emptyPublicControls()), ready: [] },
    };
    this.writeState(next);
    room.accept(next);
  }

  private finishSetupCleanup() {
    const room = this.room;
    const next = room?.finishSetupCleanup();
    if (!room || !next) {
      return false;
    }
    const history = this.history.checkpoint(next);
    this.storage.transactionSync(() => {
      this.writeState(next);
      this.history.write(history);
    });
    room.accept(next);
    this.history.accept(history.step, next);
    return true;
  }

  /** An overdue cutoff runs before a command and on wake, even if the alarm was delayed. */
  private closeDueTrading() {
    const room = this.room;
    if (!room || room.snapshot.stage !== 'swapping') {
      return;
    }
    const swapping = room.snapshot.swapping;
    if (!swapping) {
      return;
    }
    if (swapping.closed) {
      const filled = room.snapshot.roster?.seats.every((seat) => this.actors.holderOf(seat.id));
      if (!filled) {
        return;
      }
    }
    if (this.tradingDeadline > Date.now()) {
      return;
    }
    const next = this.storage.transactionSync(() => {
      const prior = room.snapshot;
      const result = this.withRoster(
        this.swapping.reconcile(prior, { commandId: `deadline-${swapping.round}`, now: Date.now(), actor: null })
      );
      this.log.recordStage(prior, result);
      this.writeState(result);
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
    const seats = this.actors.roster(seatCount).seats;
    const factions = new Map(seats.map((seat) => [seat.id, seat.faction]));
    const factionName = (id: string) => seats.find((seat) => seat.faction?.id === id)?.faction?.name ?? id;
    return {
      stage,
      seatCount,
      seats: this.actors.seated().map(({ seat, userId }) => ({ seat, userId, faction: factions.get(seat) ?? null })),
      /* The lobby reads a standard-turn index, so a composed turn reports its turn and the standard phase it is at or before. */
      phase: stage === 'play' ? lobbyPhaseIndex(snapshot.phase, snapshot.phases) : null,
      lastActivityAt: now,
      result:
        stage === 'finished' && snapshot.result
          ? {
              kind: snapshot.result.kind,
              factions: snapshot.result.factionIds.map((id) => ({ id, name: factionName(id) })),
              declaredBy: snapshot.result.by.userId,
              declaredAt: snapshot.result.declaredAt,
            }
          : null,
    };
  }

  /** Stages the summary inside the caller's transaction, so the change and its delivery obligation commit together. */
  private stageDirectory(snapshot: StoredSnapshot, now: number) {
    if (this.metadata?.game) {
      this.directory.stage(this.directorySummary(snapshot, now), now);
    }
  }

  /*
   * A deadline that ran out: a battle reveal or a bidder pass. Each is a playback step between two others,
   * so it stores its change; the outcome after it is the checkpoint.
   */
  private applyDue(expire: (snapshot: StoredSnapshot, now: number) => StoredSnapshot | undefined) {
    if (!this.room) {
      return;
    }
    const next = expire(this.room.snapshot, Date.now());
    if (!next) {
      return;
    }
    const history = this.history.patch(next);
    this.storage.transactionSync(() => {
      this.writeState(next);
      this.history.write(history);
      this.stageDirectory(next, Date.now());
    });
    this.history.accept(history.step, next);
    this.room.accept(next);
    return true;
  }

  private storedSnapshot(): StoredSnapshot {
    const row = this.storage.sql.exec<{ data: string }>('SELECT data FROM current_state WHERE id=1').one();
    return storedSnapshotSchema.parse(JSON.parse(row.data));
  }

  private writeState(next: StoredSnapshot) {
    this.storage.sql.exec('UPDATE current_state SET data=? WHERE id=1', JSON.stringify(next));
  }

  deleteActor(userId: string, eventId?: string) {
    const oldSeat = this.actors.seatFor(userId);
    const occupants = this.actors.seated();
    const committed = this.withReviewCache(() =>
      this.storage.transactionSync(() => {
        const stored = this.room ? this.storedSnapshot() : undefined;
        /* The vacated row and the event it names are written apart; they agree on the id the table hands out next. */
        const vacatedEventId =
          stored?.stage && occupants.some((occupant) => occupant.userId === userId)
            ? tableEventId(stored.table.nextEventNumber)
            : undefined;
        this.removal.scrub(userId);
        this.reviews.scrub(userId);
        this.conversations.scrub(userId);
        this.actors.delete(userId, eventId, vacatedEventId);
        this.spiceLedger.deleteActor(userId);
        if (!stored) {
          return;
        }
        const scrubbed = this.storedSnapshot();
        const departed = this.participation.afterDeletion(userId, oldSeat, {
          snapshot: scrubbed,
          roster: this.actors.roster(this.seatCount()),
          now: Date.now(),
        });
        const settled = this.swapping.settleParticipation({
          before: scrubbed,
          after: departed,
          commandId: eventId ?? `deletion-${departed.revision}`,
          actor: null,
          occupants,
        });
        const voted = this.reconcileVotes(settled, Date.now());
        const next = this.withRoster(
          this.spiceLedger.project({
            ...voted,
            controls: voted.controls && { ...voted.controls, seats: this.actors.seats() },
          })
        );
        this.log.recordStage(scrubbed, next);
        this.writeState(next);
        this.stageDirectory(next, Date.now());
        return { snapshot: next, boundary: this.history.restore(this.history.steps) };
      })
    );
    this.reloadMetadata();
    if (committed) {
      this.room!.accept(committed.snapshot);
      this.history.accept(this.history.steps, committed.boundary);
      this.putBackCarriesForReview();
    }
  }

  /* The open review is cached; a transaction that fails rolls storage back, so the cache is dropped with it. */
  private withReviewCache<T>(run: () => T): T {
    try {
      return run();
    } catch (error) {
      this.reviews.forget();
      throw error;
    }
  }

  /* A review that runs puts every carried piece back, since the table takes no move until it ends. */
  private putBackCarriesForReview() {
    if (this.reviews.running()) {
      this.room?.cancelCarries();
    }
  }

  alreadyCommitted(viewer: Viewer, message: CommitMessage): boolean {
    return this.hasReceipt(receiptKey(viewer, message), message);
  }

  private hasReceipt(key: string, message: CommitMessage): boolean {
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

  private removeVotedPlayer = (
    snapshot: StoredSnapshot,
    userId: string,
    commandId: string,
    now: number
  ): StoredSnapshot => {
    const occupants = this.actors.seated();
    const after = this.participation.remove(userId, snapshot, now);
    return this.swapping.settleParticipation({ before: snapshot, after, commandId, actor: null, occupants }, () => now);
  };

  private reconcileVotes(snapshot: StoredSnapshot, now: number) {
    const running = this.reviews.running();
    const removed = this.removal.reconcile(snapshot, now, this.removeVotedPlayer);
    return this.resumedAfterReview(running, this.reviews.reconcile(removed, now), now);
  }

  /* A review pauses the table's clocks with it: a timed bid or battle countdown resumes with the time it had left. */
  private resumedAfterReview(running: TableReview | null, next: StoredSnapshot, now: number): StoredSnapshot {
    if (!reviewRunning(running) || this.reviews.running()) {
      return next;
    }
    const paused = now - running.startedAt;
    const battle = next.battleState;
    const bidding = next.bidding;
    return {
      ...next,
      ...(battle?.deadline ? { battleState: { ...battle, deadline: battle.deadline + paused } } : {}),
      ...(bidding?.deadline ? { bidding: { ...bidding, deadline: bidding.deadline + paused } } : {}),
    };
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
      const applied = this.swapping.settleParticipation({
        before: this.room!.snapshot,
        after: participated,
        commandId: message.commandId,
        actor: viewer.userId,
        occupants,
      });
      this.growStations();
      const next = this.withRoster(this.reconcileVotes(applied, Date.now()));
      this.log.recordStage(this.room!.snapshot, next);
      this.writeState(next);
      this.stageDirectory(next, Date.now());
      this.recordReceipt(key, viewer, message, next.revision);
      return next;
    });
  }

  private recordReceipt(key: string, viewer: Viewer, message: CommitMessage, revision: number) {
    this.storage.sql.exec(
      'INSERT INTO receipts VALUES(?,?,?,?)',
      key,
      viewer.userId,
      JSON.stringify(message),
      revision
    );
  }

  private persistCommit(commit: {
    key: string;
    viewer: Viewer;
    message: CommitMessage;
    next: StoredSnapshot;
    history?: HistoryRow;
    contents?: StoredSpawnContents;
    transfer?: SpiceTransfer;
  }) {
    const { key, viewer, message, next, history, contents, transfer } = commit;
    this.storage.transactionSync(() => {
      this.writeState(next);
      this.stageDirectory(next, Date.now());
      const result = next.battleResults[0];
      if (result && result.revision === next.revision) {
        this.storage.sql.exec('INSERT INTO battle_results VALUES(?,?)', result.revision, JSON.stringify(result));
      }
      if (transfer) {
        this.spiceLedger.record(transfer, viewer.userId);
      }
      this.log.recordCommit({
        before: this.room!.snapshot,
        next,
        message,
        viewer,
        transfer,
        holders: this.actors.occupants(),
      });
      this.recordReceipt(key, viewer, message, next.revision);
      this.publicActions.record({
        key,
        viewer,
        message,
        before: this.room!.snapshot,
        next,
        contents,
        factionId:
          message.type === 'command' && message.action.kind === 'deck-draw'
            ? this.actors.factionFor(viewer.userId)
            : undefined,
      });
      if (history) {
        this.history.write(history);
      }
    });
  }

  /*
   * What a viewer receives on top of the projection: who holds each seat, by name and avatar, read
   * from the directory at send time and never stored; and for the requester alone, which pending
   * request is theirs. Nobody's id travels.
   */
  private forViewer(projected: GameSnapshot, viewer: Viewer): GameSnapshot {
    const { board, secondBoard } = this.captures.ruleset() ?? {};
    if (board) {
      projected = { ...projected, board };
    }
    if (secondBoard) {
      projected = { ...projected, secondBoard };
    }
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
    return this.roomFrames()(viewer);
  }

  /**
   * Frames for one delivery pass over the room's current state.
   * The carries and pointers are built once for the pass, and viewers with the same faction and own seat request share one snapshot, so the delivery compares each shared part once.
   */
  roomFrames(): (viewer: Viewer) => RoomFrame {
    const room = this.room!;
    const carries = this.projection.carries(room.publicCarries(), room.snapshot);
    const pointers = [...room.pointers.values()];
    const snapshots = new Map<string, RoomFrame['snapshot']>();
    const review = reviewableStage(room.snapshot.stage)
      ? { review: this.reviews.current(), reviewCheckpoints: this.history.recent(REVIEW_CHECKPOINTS) }
      : {};
    return (viewer) => {
      const factionId = this.actors.factionFor(viewer.userId);
      const own = viewer.viewerSeat === SPECTATOR_SEAT ? this.participation.pendingRequestId(viewer.userId) : undefined;
      const audience = JSON.stringify([factionId ?? null, own ?? null]);
      let snapshot = snapshots.get(audience);
      if (!snapshot) {
        snapshot = {
          ...this.forViewer(this.projection.snapshot(room.snapshot, factionId), viewer),
          ...(room.snapshot.stage ? { removalVotes: this.removal.current() } : {}),
          ...review,
        };
        snapshots.set(audience, snapshot);
      }
      return { epoch: room.epoch, snapshot, carries, pointers };
    };
  }
  private applyCommand(key: string, viewer: Viewer, message: CommitMessage, contents?: StoredSpawnContents) {
    if (this.reviews.running() && !(message.type === 'command' && isReviewAction(message.action))) {
      throw new GameRejection(REVIEW_PAUSE);
    }
    if (message.type === 'drop') {
      return this.commitTable(key, viewer, message);
    }
    const { action } = message;
    if (isReviewAction(action)) {
      return this.commitReview(key, viewer, { ...message, action });
    }
    if (isSwapAction(action)) {
      return this.commitSwap(key, viewer, { ...message, action });
    }
    if (isDraftAction(action)) {
      return this.commitDraft(key, viewer, { ...message, action });
    }
    if (isRemovalAction(action)) {
      return this.commitRemoval(key, viewer, { ...message, action });
    }
    if (isResultAction(action)) {
      return this.commitResult(key, viewer, { ...message, action });
    }
    if (isSeatAction(action)) {
      return this.commitSeat(key, viewer, { ...message, action });
    }
    return this.commitTable(key, viewer, { ...message, action }, contents);
  }
  private commitSwap(
    key: string,
    viewer: Viewer,
    message: CommandMessage & { action: Parameters<Swapping['apply']>[0]['action'] }
  ) {
    const room = this.room!;
    room.assertRevision(message.action, message.expectedRevision);
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
  }

  private commitDraft(
    key: string,
    viewer: Viewer,
    message: CommandMessage & { action: Parameters<typeof applyDraftAction>[2] }
  ) {
    const room = this.room!;
    room.assertRevision(message.action, message.expectedRevision, 'The draft changed. Try the action again.');
    const applied = applyDraftAction(
      room.snapshot,
      viewer,
      message.action,
      this.actors.seats(),
      this.metadata?.game?.minimumPlayers ?? 2
    );
    const next = this.withRoster(applied);
    this.persistCommit({ key, viewer, message, next });
    room.accept(next);
  }

  private commitRemoval(
    key: string,
    viewer: Viewer,
    message: CommandMessage & { action: Parameters<RemovalVotes['apply']>[2] }
  ) {
    const room = this.room!;
    room.assertRevision(message.action, message.expectedRevision);
    const action = message.action;
    const next = this.storage.transactionSync(() => {
      const applied = this.removal.apply(room.snapshot, viewer, action, Date.now());
      const settled = this.withRoster(this.reconcileVotes(applied, Date.now()));
      this.persistCommit({ key, viewer, message, next: settled });
      return settled;
    });
    this.reloadMetadata();
    room.accept(next);
  }

  private commitReview(key: string, viewer: Viewer, message: CommandMessage & { action: ReviewCommand['action'] }) {
    const room = this.room!;
    room.assertRevision(message.action, message.expectedRevision);
    const action = message.action;
    const next = this.storage.transactionSync(() => {
      const now = Date.now();
      const running = this.reviews.running();
      const applied = this.reviews.apply({
        snapshot: room.snapshot,
        viewer,
        action,
        now,
        checkpoint: (step) => this.reviewable(step),
      });
      const settled = this.resumedAfterReview(running, this.reviews.reconcile(applied, now), now);
      this.persistCommit({ key, viewer, message, next: settled });
      return settled;
    });
    room.accept(next);
  }

  /* A review shows one of the recent checkpoints, named as the log names it. */
  private reviewable(step: number) {
    return this.history.recent(REVIEW_CHECKPOINTS).find((checkpoint) => checkpoint.step === step)?.context;
  }

  /* Determine winner, its declaration and Continue playing commit with their log rows and the summary the lobby is owed. */
  private commitResult(
    key: string,
    viewer: Viewer,
    message: CommandMessage & { action: Parameters<typeof applyResult>[2] }
  ) {
    const room = this.room!;
    room.assertRevision(message.action, message.expectedRevision);
    const action = message.action;
    const { next, history } = this.storage.transactionSync(() => {
      const now = Date.now();
      const settled = this.withRoster(this.reconcileVotes(applyResult(room.snapshot, viewer, action, now), now));
      const entry = this.history.entry(message, room.snapshot, settled);
      this.persistCommit({ key, viewer, message, next: settled, history: entry });
      return { next: settled, history: entry };
    });
    room.accept(next);
    if (history) {
      this.history.accept(history.step, next);
    }
  }

  private commitSeat(
    key: string,
    viewer: Viewer,
    message: CommandMessage & { action: Parameters<Participation['plan']>[0] }
  ) {
    const room = this.room!;
    room.assertRevision(message.action, message.expectedRevision);
    const plan = this.participation.plan(message.action, {
      viewer,
      snapshot: room.snapshot,
      roster: this.actors.roster(this.seatCount()),
      now: Date.now(),
    });
    const next = this.persistSeatCommit(key, viewer, message, plan);
    this.reloadMetadata();
    room.accept(next);
  }
  private nextTableSnapshot(viewer: Viewer, message: TableMessage, contents?: StoredSpawnContents) {
    const room = this.room!;
    if (message.type === 'drop') {
      return room.drop(viewer, message.carryId, message);
    }
    if (message.action.kind === 'spawn-request') {
      return room.publicCommand(viewer, message.action, contents);
    }
    return room.command(viewer, internalAction(room.snapshot, message.action), message.expectedRevision);
  }
  private commitTable(key: string, viewer: Viewer, message: TableMessage, contents?: StoredSpawnContents) {
    const room = this.room!;
    const next = withKnownCardFaces(
      room.snapshot,
      revealPlacedPredictions(
        this.withRoster(validatedSnapshot(room.snapshot, this.nextTableSnapshot(viewer, message, contents))),
        Date.now()
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
    const history = this.history.entry(message, room.snapshot, next);
    const completedCarryId = message.type === 'drop' ? message.carryId : undefined;
    const clearAll = message.type === 'command' && message.action.kind === 'reset';
    const cleaned = room.finishSetupCleanup(next, completedCarryId, clearAll);
    const cleanupHistory = cleaned ? this.history.checkpoint(cleaned, history) : undefined;
    this.storage.transactionSync(() => {
      this.persistCommit({ key, viewer, message, next, history, contents, transfer });
      if (cleaned && cleanupHistory) {
        this.writeState(cleaned);
        this.history.write(cleanupHistory);
      }
    });
    room.accept(cleaned ?? next, completedCarryId, clearAll);
    const finalHistory = cleanupHistory ?? history;
    if (finalHistory) {
      this.history.accept(finalHistory.step, cleaned ?? next);
    }
  }

  /** A change to the stored draft outside any command: the catalogue read again, or a failed attempt's reason. */
  private rewriteDraft(rewrite: (draft: NonNullable<StoredSnapshot['draft']>) => NonNullable<StoredSnapshot['draft']>) {
    const room = this.room;
    if (!room?.snapshot.draft || room.snapshot.stage !== 'drafting') {
      return;
    }
    const next = rewrittenDraft(room.snapshot, rewrite(room.snapshot.draft));
    this.storage.transactionSync(() => {
      this.writeState(next);
    });
    room.accept(next);
  }

  /** Installs the dealt stations without colliding with the unique seat-position constraint. */
  private installDeal(deal: ReturnType<typeof dealSeats>, current: DraftState) {
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
  }

  private assignmentTokens(deal: ReturnType<typeof dealSeats>) {
    return Object.fromEntries(
      deal.flatMap((entry) => {
        const token = this.captures.faction(entry.factionId)?.components.token.front;
        return token ? [[entry.seat, token]] : [];
      })
    );
  }

  /** Records the public assignment and forms the opening swapping state inside the deal's transaction. */
  private recordAssignment(stored: StoredSnapshot, current: DraftState, deal: ReturnType<typeof dealSeats>) {
    return this.withRoster(
      dealtSnapshot(stored, current, deal, {
        seats: this.actors.seats(),
        tokens: this.assignmentTokens(deal),
        closeRosterRequests: (controls, now) => this.participation.closeRosterRequests(controls, now),
        now: Date.now(),
      })
    );
  }

  completeAssignment(prepared: NonNullable<ReturnType<GameSession['prepareAssignment']>>) {
    const { seated, factions, stamp } = prepared;
    const room = this.room!;
    const deal = dealSeats(seated, factions, unbiased);
    const committed = this.storage.transactionSync(() => {
      const stored = this.storedSnapshot();
      const current = stored.draft;
      const still = stored.stage === 'drafting' && current && draftStamp(this.actors.seats(), current) === stamp;
      if (!still) {
        return null;
      }
      this.installDeal(deal, current);
      this.storage.sql.exec("UPDATE metadata SET data=json_set(data, '$.seatCount', ?) WHERE id=1", seated.length);
      const next = this.recordAssignment(stored, current, deal);
      const history = this.history.checkpoint(next);
      this.log.recordStage(stored, next);
      this.writeState(next);
      this.history.write(history);
      this.stageDirectory(next, Date.now());
      return { next, history };
    });
    this.reloadMetadata();
    if (!committed) {
      return;
    }
    this.history.accept(committed.history.step, committed.next);
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
  get epoch() {
    return this.room!.epoch;
  }
  resumeEpoch(epoch: string) {
    this.room!.epoch = epoch;
  }
  get historySteps() {
    return this.history.steps;
  }
  get receiptCount() {
    return this.storage.sql.exec<{ count: number }>('SELECT COUNT(*) AS count FROM receipts').one().count;
  }
  get phaseCooldownEndsAt() {
    return this.room?.phaseCooldownEndsAt ?? 0;
  }
  get battleDeadline() {
    return this.room?.snapshot.battleState?.deadline ?? 0;
  }

  confirm() {
    const next = { ...this.metadata!, confirmed: true };
    this.storage.sql.exec('UPDATE metadata SET data=? WHERE id=1', JSON.stringify(next));
    this.metadata = next;
  }
  adoptFixtureDeck(deck: StoredSpawnContents) {
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
    this.requireReady(`faction ${capture.faction.name}`, capture.readiness, options);
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
  private get tradingDeadline() {
    const snapshot = this.room?.snapshot;
    if (snapshot?.stage !== 'swapping') {
      return 0;
    }
    if (snapshot.swapping?.closed) {
      return 0;
    }
    return snapshot.swapping?.deadline ?? 0;
  }
  get biddingDeadline() {
    return this.room ? biddingDeadline(this.room.snapshot) : 0;
  }
  nextDeadline() {
    /* A running review holds the table's clocks; they resume, with the time they had left, when it ends. */
    const paused = this.reviews.running() !== null;
    const deadlines = [
      paused ? 0 : this.battleDeadline,
      paused ? 0 : this.biddingDeadline,
      this.directory.pending()?.retryAt,
      this.tradingDeadline,
    ].filter((deadline): deadline is number => Boolean(deadline));
    return deadlines.length ? Math.min(...deadlines) : undefined;
  }
  advanceDeadlines() {
    const paused = this.reviews.running() !== null;
    const battle = !paused && this.applyDue(expireBattle);
    const bidding = !paused && this.applyDue(expireBidding);
    const trading = this.closeDueTrading();
    return Boolean(battle || bidding || trading);
  }
  execute(viewer: Viewer, message: CommitMessage, contents?: StoredSpawnContents) {
    const key = receiptKey(viewer, message);
    if (this.hasReceipt(key, message)) {
      return false;
    }
    this.withReviewCache(() =>
      this.room!.commit(message.type === 'command' ? message.action.kind : undefined, () =>
        this.applyCommand(key, viewer, message, contents)
      )
    );
    this.putBackCarriesForReview();
    this.reloadMetadata();
    return true;
  }
  seatFor(userId: string) {
    return this.actors.seatFor(userId);
  }
  /** The identity the provisioning replay commands as (#1594): the creator at their seat, or a placeholder the room admits as a spectator. */
  provisionViewer(userId: string, displayName: string): Viewer {
    return this.actors.viewer(`provision:${userId}`, userId, displayName, { seatNewcomers: false });
  }
  /** The room's current snapshot, for a caller that judges its next command by the stage and revision. */
  currentSnapshot(): StoredSnapshot {
    return this.room!.snapshot;
  }
  bugReportActivity() {
    return { carries: [...this.room!.carries.values()], pointers: [...this.room!.pointers.values()] };
  }
  bugReportConversations() {
    return this.conversations.report();
  }
  bugReportBrowser(browser: BugReportBrowser) {
    return this.conversations.reportBrowser(browser);
  }
  recordBugReport(requestId: string, userId: string, name: string, issueUrl?: string) {
    this.log.record({
      key: `bug-report:${requestId}:${issueUrl ? 'complete' : 'requested'}`,
      class: 'bug-report',
      template: issueUrl
        ? `Bug report ${requestId} published the full game state, including hidden information: ${issueUrl}`
        : `{0} requested a bug report that exports the full game state, including every player's hidden information. Report ${requestId}.`,
      people: issueUrl ? [] : [{ userId, name }],
    });
  }
  /** The seat request a spectator has open, if any. */
  pendingSeatRequest(userId: string) {
    return this.participation.pendingRequestId(userId);
  }
  factionFor(userId: string) {
    return this.actors.factionFor(userId);
  }
  viewer(...args: Parameters<ActorDirectory['viewer']>) {
    const viewer = this.actors.viewer(...args);
    this.restampSeats(this.room!);
    return viewer;
  }
  /** The snapshot's seats and roster are read again from the seat rows. */
  private restampSeats(room: Room) {
    const controls = room.snapshot.controls ?? emptyPublicControls();
    room.snapshot = this.withRoster({ ...room.snapshot, controls: { ...controls, seats: this.actors.seats() } });
  }
  /** A connection whose seat changed loses its activity, and the roster is read again. */
  refreshViewers(viewers: readonly Viewer[]) {
    const current = this.actors.currentViewers(viewers);
    viewers.forEach((viewer, index) => {
      if (current[index]?.viewerSeat !== viewer.viewerSeat) {
        this.clearActivity(viewer.connectionId);
        if (this.room) {
          this.restampSeats(this.room);
        }
      }
    });
    return current;
  }
  logPage(...args: Parameters<PublicLog['page']>) {
    return this.log.page(...args);
  }
  spicePage(...args: Parameters<SpiceLedger['page']>) {
    return this.spiceLedger.page(...args);
  }
  projectContents(contents: StoredSpawnContents) {
    return this.projection.contents(contents);
  }
  historyFor(viewer: Viewer, step: number): Extract<ServerMessage, { type: 'history' }> {
    const stage = this.room!.snapshot.stage;
    /*
     * Players may not keep notes, so a real game opens its replay only once it is finished.
     * Before that, everyone sees the one checkpoint a table review shows while it runs, and nothing else.
     */
    if (stage !== undefined && stage !== 'finished' && this.reviews.running()?.step !== step) {
      throw new GameRejection('Replay opens once the game is finished.');
    }
    if (step > this.history.steps) {
      throw new GameRejection('Unknown history step.');
    }
    /*
     * Every checkpoint uses the live game's complete face list, so comparing old checkpoints cannot reveal a hidden card's departure.
     * Ordinary replay remains public.
     * A collective recall separately includes only the current seat's frozen historical inventory, including a predecessor's contents at that seat.
     */
    const restored = this.history.restore(step);
    const past = this.projection.snapshot(
      restored,
      this.room!.snapshot.stage === undefined ? this.actors.factionFor(viewer.userId) : undefined,
      this.room!.snapshot
    );
    const seat = this.actors.seatFor(viewer.userId);
    const faction =
      this.reviews.running()?.step === step && seat && seat !== SPECTATOR_SEAT
        ? restored.roster?.seats.find((entry) => entry.id === seat)?.faction?.id
        : undefined;
    const recalled = faction ? { ...past, ...this.projection.frozenInventory(restored, faction) } : past;

    return {
      type: 'history',
      step,
      lastStep: this.history.steps,
      recordedAt: this.history.recordedAt(step),
      snapshot: this.forViewer(recalled, viewer),
    };
  }
  conversationFaction(viewer: Viewer) {
    return this.conversations.faction(this.room!.snapshot, viewer);
  }
  conversationPage(viewer: Viewer, request: Extract<ClientMessage, { type: 'conversation-history' }>) {
    this.conversations.authorize(this.room!.snapshot, viewer, request, this.reviews.running()?.id);
    return { ...request, ...this.conversations.page(request) };
  }
  markConversationRead(viewer: Viewer, request: Extract<ClientMessage, { type: 'conversation-read' }>) {
    const faction = this.conversations.authorize(this.room!.snapshot, viewer, request, this.reviews.running()?.id);
    this.conversations.read(request);
    return faction;
  }
  sendConversation(viewer: Viewer, request: Extract<ClientMessage, { type: 'conversation-send' }>) {
    if (this.reviews.running() && !isRecallConversation(request.peerId)) {
      throw new GameRejection('Only recall chat is available during Mentat recall.');
    }
    this.conversations.authorize(this.room!.snapshot, viewer, request, this.reviews.running()?.id);
    return this.storage.transactionSync(() => {
      const saved = this.conversations.save(viewer, request, Date.now());
      if (saved.inserted) {
        this.stageDirectory(this.room!.snapshot, Date.now());
      }
      return saved;
    });
  }
  conversationMembers(request: Extract<ClientMessage, { type: 'conversation-send' }>) {
    return conversationMembers(request.factionId, request.peerId, rosterFactionIds(this.room!.snapshot.roster)) ?? [];
  }
  conversationSummaries(viewer: Viewer): Extract<ServerMessage, { type: 'conversations' }> | undefined {
    const factionId = this.conversationFaction(viewer);
    if (!factionId) {
      return;
    }
    const peers = rosterFactionIds(this.room!.snapshot.roster);
    return {
      type: 'conversations',
      factionId,
      generation: this.conversations.generation(),
      entries: this.conversations.summaries(factionId, peers, this.reviews.running()?.id),
    };
  }
  draftWork() {
    const draft = this.room?.snapshot.draft;
    if (!this.metadata?.game || this.room?.snapshot.stage !== 'drafting' || !draft) {
      return;
    }
    return { refresh: Date.now() - draft.catalogueAt >= PLAY_DRAFT_CATALOGUE_TTL_MS };
  }
  updateDraftCatalogue(factions: DraftFaction[], setAside?: SetAsideJudgement) {
    this.rewriteDraft((draft) => draftWithCatalogue(draft, factions, Date.now(), setAside));
  }
  /** The factions set aside now, for a catalogue refresh to judge again. */
  draftSetAside(): Readonly<Record<string, string>> {
    return this.room?.snapshot.draft?.setAside ?? {};
  }
  setFactionsAside(refused: Readonly<Record<string, string>>, options?: { atDeal?: boolean }) {
    this.rewriteDraft((draft) => draftWithSetAside(draft, refused, options));
  }
  /** The drafted pool as it stands, for a judgement of its picks ahead of the deal. */
  draftedPicks(): string[] {
    const draft = this.room?.snapshot.stage === 'drafting' ? this.room.snapshot.draft : undefined;
    return draft ? draftedPool(draft) : [];
  }
  assignmentFailed(reason: string) {
    this.rewriteDraft((draft) => ({ ...draft, failure: reason }));
  }
  private assignmentEligible(draft: DraftState, seated: readonly string[], minimum: number) {
    const gates = draftGates(draft, seated, minimum);
    return gates.minimumMet && gates.allReady && gates.enoughFactions;
  }

  prepareAssignment() {
    const room = this.room;
    const game = this.metadata?.game;
    if (!room || !game) {
      return;
    }
    const draft = room.snapshot.draft;
    if (room.snapshot.stage !== 'drafting' || !draft) {
      return;
    }
    const seated = this.actors.seats();
    if (!this.assignmentEligible(draft, seated, game.minimumPlayers)) {
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
    message: Extract<ClientMessage, { type: 'begin' | 'take' | 'flip' | 'renew' | 'cancel' }>
  ): Extract<ServerMessage, { type: 'carry' }> | undefined {
    const room = this.room!;
    if (this.reviews.running() && (message.type === 'begin' || message.type === 'take' || message.type === 'flip')) {
      throw new GameRejection(REVIEW_PAUSE);
    }
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
      case 'flip':
        return this.flippedCarry(viewer, message);
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
  /* A flip answers with the held piece too, so a face turned up in hand reaches the carrier with the reply rather than with the next frame. */
  private flippedCarry(
    viewer: Viewer,
    message: Extract<ClientMessage, { type: 'flip' }>
  ): Extract<ServerMessage, { type: 'carry' }> {
    const room = this.room!;
    const draft = room.flip(viewer, message);
    const [carry] = this.projection.carries(
      room.publicCarries().filter((candidate) => candidate.id === message.carryId),
      room.snapshot
    );
    return {
      type: 'carry',
      carryId: message.carryId,
      draft: this.projection.draft(draft, room.snapshot),
      ...(carry ? { held: carry.held } : {}),
    };
  }
  carryHistory(connectionId: string) {
    return this.room?.carryHistory(connectionId) ?? [];
  }
  restoreCarryHistory(connectionId: string, carryIds: readonly string[]) {
    this.room?.restoreCarryHistory(connectionId, carryIds);
  }
  pointer(...args: Parameters<Room['pointer']>) {
    return this.room!.pointer(...args);
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
  /** Whether anything here expires on its own: a carry or a pointer. */
  get hasActivity() {
    return Boolean(this.room && (this.room.carries.size || this.room.pointers.size));
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

const REVIEW_PAUSE = 'The table is paused for a review.';

/* A fixture carries no stage and plays its phases from the start. */
function inPlay(stage: StoredSnapshot['stage']) {
  return stage === undefined || stage === 'play';
}
