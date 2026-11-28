import { capturedTokenStackKey } from '@shared/play/assetCapture';
import type { BoardCapture } from '@shared/play/capture';
import { describeCardDraw } from '@shared/play/cardDraw';
import { dealSeats, isDraftAction } from '@shared/play/drafting';
import { hostNow, hostRandomInt } from '@shared/play/engine/host';
import type { Room } from '@shared/play/engine/room';
import { GameSession } from '@shared/play/engine/session';
import { RoomProjection } from '@shared/play/engine/state';
import type { StoredSnapshot } from '@shared/play/engine/state';
import { spawnableKey } from '@shared/play/inventory';
import type { SpawnSelection, StoredSpawnContents } from '@shared/play/inventory';
import { LOG_PAGE_SIZE } from '@shared/play/log';
import type { LogEntry, LogTab } from '@shared/play/log';
import type { TablePiece } from '@shared/play/model';
import type { ClientMessage, GameSnapshot, PieceAction, ServerMessage, Viewer } from '@shared/play/protocol';
import { GameRejection } from '@shared/play/rejection';
import { SPECTATOR_SEAT } from '@shared/play/schema';

import './engineHost';
import { pageStorage } from './browserSqlite';

/*
 * The game Worker's own session (`GameSession`) running in the page on SQLite, from a recorded point: seats, the draft
 * and its deal, trading, commands, battles, recalls, results, history and the log all go through the session exactly as
 * in a game room, for whichever seat the page is viewed as. What the page does itself is what a room's host does: it
 * answers its own socket, keeps the deadlines with timers instead of an alarm, and owes the lobby nothing.
 * Four things differ from a real game, because a tutorial has no catalogue behind it: the deal gives every seat what
 * the recording gave it whenever the drafted pool and the seats are the recorded ones; trading ends with the game
 * waiting at the table; the turn keeps the phases the recording held; and the board is the one the page reads.
 * The tutorial's chapters and the Play sandbox story both play on it.
 */

type View = Extract<ServerMessage, { type: 'view' }>;
/** A carry the page's player set down: the items it held, by id, and whether a take added to it while it was held. */
export type Landing = Readonly<{ itemIds: readonly string[]; grew: boolean }>;

/** A command the learner's table accepted, with its visible source before it changed. */
export type AcceptedTutorialAction = Readonly<{ action: PieceAction; at: number; source?: TablePiece }>;

/** A seat's faction and station as the recorded deal gave them, with the faction token trading shows. */
export type RecordedDeal = readonly { seat: string; factionId: string; position: number; token?: string }[];

export type TableMessage = Exclude<ClientMessage, { type: 'admit' | 'log-history' | 'conversation-history' }>;
type MessageOf<Type extends TableMessage['type']> = Extract<TableMessage, { type: Type }>;
type Activity = MessageOf<'begin' | 'take' | 'flip' | 'renew' | 'cancel'>;

/** Where a local table starts: the stored state, every seat's viewer, the names at the table, and the log so far. */
export type TableStart = Readonly<{
  stored: StoredSnapshot;
  viewers: Readonly<Record<string, Viewer>>;
  players: NonNullable<GameSnapshot['controls']>['players'];
  removalVotes?: GameSnapshot['removalVotes'];
  log: Partial<Record<LogTab, LogEntry[]>>;
  /** The seat the page is viewed as. */
  seat: string;
  /** For a table that starts before the deal: the players the draft waits for, and how the recording dealt. */
  draft?: Readonly<{ minimumPlayers: number; deal: RecordedDeal }>;
}>;

/* A local table's secret guards nothing, since the whole table is the learner's own. */
const LOCAL_SECRET = 'local';

const PAGE_SESSION = { waitsAtTable: true, keepsRecordedTurn: true } as const;
let schema: Uint8Array | undefined;

/*
 * The empty database a game session builds its tables in, made once per page.
 * Every table then opens on a copy of it, which costs far less than building the schema again.
 */
function sessionSchema() {
  if (!schema) {
    const scratch = pageStorage();
    /* Constructing a session is what builds its tables; the session itself is not kept. */
    void new GameSession(scratch.storage, undefined, undefined, PAGE_SESSION);
    schema = scratch.image();
    scratch.close();
  }
  return schema;
}

/** One live table started from a stored state, answering the messages the page sends as the game Worker's room would. */
export class LocalTable {
  private readonly session: GameSession;
  /* The same projection the session holds, for the landings the guide follows by the ids the page sees. */
  private readonly projection = new RoomProjection(LOCAL_SECRET);
  private readonly opening: TableStart;
  /* The page's player, who keeps their account as their seat changes. */
  private readonly learner: string;
  /* The page's player's carries that a take has added to, and the carries they have set down. */
  private readonly grown = new Set<string>();
  private readonly landed: Landing[] = [];
  private readonly accepted: AcceptedTutorialAction[] = [];
  private readonly pingTimes: number[] = [];
  private deadlineTimer: ReturnType<typeof setTimeout> | undefined;
  /** The board the table plays on: the saved Arrakis, once the page has read it. */
  board: BoardCapture | undefined;
  /* The guide's last view of the table, and the room and board it showed. */
  private guideSeen: { room: unknown; board: BoardCapture | undefined; snapshot: GameSnapshot } | undefined;
  /** Delivers a frame to the page; the transport sets it once the page connects. */
  deliver: (message: ServerMessage) => void = () => {};
  /** The seat the page is viewed as. */
  seat: string;
  /** Why the room refused the latest message it refused, for a test to assert on. */
  refusal: string | undefined;
  /* What the catalogue captured for the spawn request being committed, as the Worker hands its capture to the commit. */
  private spawnContents: StoredSpawnContents | undefined;
  /* The asset each catalogue selection captured, by its picker key, so the guide follows a request and its pieces by what was asked for. */
  private readonly captured = new Map<string, string>();
  private readonly closeStorage: () => void;

  constructor(start: TableStart) {
    this.opening = start;
    const { stored } = start;
    this.seat = start.viewers[start.seat] ? start.seat : 'seat-1';
    const learner = start.viewers[this.seat]!;
    this.learner = learner.userId;
    const { storage, close } = pageStorage(sessionSchema());
    this.closeStorage = close;
    this.session = new GameSession(storage, undefined, undefined, {
      board: () => this.board,
      ...PAGE_SESSION,
    });
    const profiles = new Map(start.players.map((player) => [player.seat, player]));
    this.session.restore({
      metadata: {
        gameId: 'tutorial',
        secret: LOCAL_SECRET,
        attemptId: 'tutorial',
        expiresAt: Number.MAX_SAFE_INTEGER,
        confirmed: true,
        seatCount: stored.roster?.seatCount,
        /* No phase cooldown, as on the test stack: a local table is for trying things. */
        testPhaseCooldownMs: 0,
        game: {
          rulesetId: 'tutorial',
          minimumPlayers: (start.draft?.minimumPlayers ?? stored.draft?.minimum ?? 2) as never,
          creator: { userId: learner.userId, displayName: learner.displayName, profileSlug: null },
        },
      },
      snapshot: stored,
      people: Object.entries(start.viewers).map(([seat, viewer]) => ({
        userId: viewer.userId,
        displayName: viewer.displayName,
        issuedAt: 0,
        avatarUrl: profiles.get(seat)?.avatar ?? null,
        profileSlug: profiles.get(seat)?.slug ?? null,
        seat: seat as Viewer['viewerSeat'],
      })),
      logSequence: Math.max(
        0,
        ...Object.values(start.log)
          .flat()
          .map((entry) => entry.sequence)
      ),
    });
    this.noteWatchers();
    this.settleDirectory();
  }

  /** The session's live table. */
  get room(): Room {
    return this.session.liveRoom!;
  }

  /** Puts the table on a board, and shows the page the table on it. */
  setBoard(board: BoardCapture | undefined) {
    if (board === this.board) {
      return;
    }
    this.board = board;
    this.deliver(this.frame());
  }

  private factionFor(userId: string) {
    return this.session.factionFor(userId);
  }

  private seatOf(userId: string): Viewer['viewerSeat'] {
    return this.session.seatFor(userId) ?? SPECTATOR_SEAT;
  }

  /** Tells the session who watches, as the Worker does with its connections, so every view lists the table's spectators. */
  private noteWatchers() {
    this.session.refreshViewers(
      Object.values(this.opening.viewers).map((viewer) => ({ ...viewer, viewerSeat: this.seatOf(viewer.userId) }))
    );
  }

  /** Every seat a player sits in; the spectator watches and acts for no one. */
  seats() {
    return this.session.seats();
  }

  viewer(seat = this.seat): Viewer {
    /* Seats change hands, so a seat's viewer is whoever holds it now, the page's own player first. */
    const viewers = Object.values(this.opening.viewers).sort((a, b) =>
      a.userId === this.learner ? -1 : b.userId === this.learner ? 1 : 0
    );
    const holder = viewers.find((viewer) => this.seatOf(viewer.userId) === seat) ?? this.opening.viewers[seat]!;
    return { ...holder, viewerSeat: seat };
  }

  /** The page's seat's view for the guide, which asks every frame: projected again only once the room or its board has moved on. */
  guideSnapshot() {
    const { snapshot: room } = this.room;
    if (this.guideSeen?.room !== room || this.guideSeen.board !== this.board) {
      this.guideSeen = { room, board: this.board, snapshot: this.frame().snapshot };
    }
    return this.guideSeen.snapshot;
  }

  /** The view a seat receives of the room as it stands, as the session frames it. */
  frame(seat = this.seat, completedCommandId?: string): View {
    const viewer = this.viewer(seat);
    const { snapshot: framed, ...frame } = this.session.roomFrame(viewer);
    const { board: _board, ...snapshot } = framed;
    const room = this.room;
    return {
      type: 'view',
      viewer,
      ...frame,
      snapshot: {
        ...snapshot,
        /* Until the page has read the saved board, the table shows none. */
        ...(this.board ? { board: this.board } : {}),
        /* A recorded table's votes show as they were stored; the votes opened here follow them. */
        ...(room.snapshot.stage
          ? { removalVotes: [...(this.opening.removalVotes ?? []), ...(snapshot.removalVotes ?? [])] }
          : {}),
      },
      phaseCooldownMs: 0,
      battleCountdownMs: Math.max(0, (room.snapshot.battleState?.deadline ?? 0) - hostNow()),
      ...(completedCommandId ? { completedCommandId } : {}),
      /* A local table's clock is the page's, which the session's host reads. */
      serverNow: hostNow(),
    } as View;
  }

  /** Every carry the page's player has set down, oldest first. */
  landings(): readonly Landing[] {
    return this.landed;
  }

  /** Successful learner commands in order. Rejected commands and simulated players are excluded. */
  acceptedActions(): readonly AcceptedTutorialAction[] {
    return this.accepted;
  }

  /** Times the learner sent a ping over the table, in milliseconds since the epoch. */
  pings(): readonly number[] {
    return this.pingTimes;
  }

  /** The latest pages, also used by the sandbox transport. */
  log(): Partial<Record<LogTab, LogEntry[]>> {
    return {
      game: this.logPage('game', Number.MAX_SAFE_INTEGER).entries,
      audit: this.logPage('audit', Number.MAX_SAFE_INTEGER).entries,
    };
  }

  /** Logs a chat clear as the Worker does; true when it added a line. */
  recordChatClear(clear: { factionId: string; peerId: string; through: number }) {
    return this.session.recordChatClear(clear);
  }

  /** New events follow the chapter's recorded log, using the same sequence across both tabs. */
  logPage(tab: LogTab, before: number) {
    const recent = this.session.logPage(tab, before);
    const entries = [...recent.entries, ...(this.opening.log[tab] ?? []).filter((entry) => entry.sequence < before)];
    return { entries: entries.slice(0, LOG_PAGE_SIZE), more: recent.more || entries.length > LOG_PAGE_SIZE };
  }

  /** Finished games replay publicly; during play only the agreed review checkpoint is readable. */
  history(step: number): Extract<ServerMessage, { type: 'history' }> {
    return this.session.historyFor(this.viewer(), step);
  }

  /** Shows the page as another seat; the seat it leaves lets go of anything it was carrying. */
  viewAs(seat: string) {
    if (!this.seatable(seat) || seat === this.seat) {
      return;
    }
    this.session.clearActivity(this.viewer().connectionId);
    this.seat = seat;
    this.deliver(this.frame());
  }

  /**
   * Answers one message from `seat` as the Worker would: a carry reply or a rejection to the sender, then the room as it now stands to the page.
   * A seat other than the page's acts as a second player at the same table.
   * Replays, the spice history, conversations and metrics stay with the scripted transport, so those answer false.
   */
  receive(message: TableMessage, seat = this.seat): boolean {
    const handle = this.handlers[message.type] as
      | ((message: TableMessage, viewer: Viewer, own: boolean) => void)
      | undefined;
    if (!handle) {
      return false;
    }
    const viewer = this.viewer(seat);
    const own = seat === this.seat;
    /* A message that answers with no frame of its own, as a carry's pose, still shows a deadline it brought due. */
    if (this.session.advanceDeadlines()) {
      this.deliver(this.frame());
    }
    try {
      handle(message, viewer, own);
    } catch (error) {
      this.refuse(message, viewer, own, error);
    }
    this.settleDirectory();
    this.scheduleDeadline();
    return true;
  }

  private readonly handlers: {
    [Type in TableMessage['type']]?: (message: MessageOf<Type>, viewer: Viewer, own: boolean) => void;
  } = {
    sync: () => this.deliver(this.frame()),
    history: (message) => this.deliver({ ...this.history(message.step), requestId: message.requestId }),
    pointer: (message, viewer) => {
      this.session.pointer(viewer, message.position, hostNow(), message.seq);
    },
    /* The page shows its own ping as it sends it, and a local table has no other page to pass it on to. */
    ping: (_message, _viewer, own) => {
      if (own) {
        this.pingTimes.push(hostNow());
      }
    },
    pose: (message, viewer, own) => {
      if (this.session.pose(viewer, message) && !own) {
        this.deliver(this.frame());
      }
    },
    /* A renew moves only the carry's expiry, which no page acts on, so no frame goes out, as in the Worker. */
    renew: (message, viewer) => {
      this.session.activity(viewer, message);
    },
    begin: (message, viewer, own) => this.activity(message, viewer, own),
    take: (message, viewer, own) => this.activity(message, viewer, own),
    flip: (message, viewer, own) => this.activity(message, viewer, own),
    cancel: (message, viewer, own) => this.activity(message, viewer, own),
    command: (message, viewer, own) => this.commit(message, viewer, own),
    drop: (message, viewer, own) => this.commit(message, viewer, own),
  };

  /* A refusal as the Worker sends one: a rejected drop lets go of its carry, and an unexpected error is reported but still answered. */
  private refuse(message: TableMessage, viewer: Viewer, own: boolean, error: unknown) {
    if (!(error instanceof GameRejection)) {
      console.error('The local table failed on a message.', error);
    }
    if (message.type === 'drop') {
      this.session.cancelRejectedDrop(viewer, message.carryId);
    }
    const reason = error instanceof GameRejection ? error.message : 'Unable to process the command.';
    this.refusal = reason;
    if (own) {
      this.deliver({ type: 'rejected', requestId: requestId(message), message: reason });
    }
    this.deliver(this.frame());
  }

  private activity(message: Activity, viewer: Viewer, own: boolean) {
    const reply = this.session.activity(viewer, message);
    if (message.type === 'take' && viewer.viewerSeat === this.seat) {
      this.grown.add(message.carryId);
    }
    if (message.type === 'cancel') {
      this.grown.delete(message.carryId);
    }
    if (reply && own) {
      this.deliver(reply);
    }
    this.deliver(this.frame());
  }

  /* One command or drop, committed by the session as a game room commits it, and a completed draft dealt at once. */
  private commit(message: MessageOf<'command' | 'drop'>, viewer: Viewer, own: boolean) {
    const room = this.room;
    const sourceId = message.type === 'command' && 'pieceId' in message.action ? message.action.pieceId : undefined;
    const source =
      own && sourceId ? this.frame().snapshot.table.pieces.find((piece) => piece.id === sourceId) : undefined;
    const draw =
      message.type === 'command' && message.action.kind === 'deck-draw'
        ? describeCardDraw(this.frame(viewer.viewerSeat).snapshot, message.action, this.factionFor(viewer.userId))
        : undefined;
    /* What the page's player holds as they let go, read before the drop ends the carry. */
    const held = message.type === 'drop' && viewer.viewerSeat === this.seat ? room.heldFor(message.carryId) : null;
    const followsLearner = this.seat === this.seatOf(this.learner);
    const seated = this.seats().map((seat) => this.viewer(seat));
    const committed = this.session.execute(viewer, message, this.spawnContents);
    /* A completed draft deals at once; a resent draft command finishes a deal its first send could not complete. */
    if (message.type === 'command' && isDraftAction(message.action)) {
      this.dealIfReady();
    }
    if (!committed) {
      this.deliver(this.frame(this.seat, own ? message.commandId : undefined));
      return;
    }
    /* As the Worker refreshes its viewers, a player the command moved or unseated lets go of what they carried. */
    for (const before of seated) {
      if (this.seatOf(before.userId) !== before.viewerSeat) {
        this.session.clearActivity(before.connectionId);
      }
    }
    this.noteWatchers();
    /* The page keeps the seat it shows, unless that is the learner's, who may have moved, or a seat the command emptied. */
    if (followsLearner || !this.session.holderOf(this.seat)) {
      this.seat = this.seatOf(this.learner);
    }
    if (held && message.type === 'drop') {
      /* By the ids the page sees, as a card's are the projection's, under the handles it has where it landed. */
      const { cardHandles, pieceHandles } = this.room.snapshot;
      const seen = this.projection.piece(held, false, cardHandles, pieceHandles);
      this.landed.push({ itemIds: seen.items.map((item) => item.id), grew: this.grown.delete(message.carryId) });
    }
    if (own && message.type === 'command') {
      this.accepted.push({ action: message.action, at: hostNow(), ...(source ? { source } : {}) });
    }
    this.deliver({
      ...this.frame(this.seat, own ? message.commandId : undefined),
      ...(draw && { cardDraw: { ...draw, epoch: this.room.epoch, revision: this.room.snapshot.revision } }),
    });
  }

  /*
   * The deal, once every gate the Worker waits on is met. A pool and seating the recording dealt are dealt as it dealt them,
   * with the recording's tokens standing in for the faction captures a game reads them from; any other draft deals at random.
   */
  private dealIfReady() {
    const prepared = this.session.prepareAssignment();
    if (!prepared) {
      return;
    }
    const { seated, factions } = prepared;
    const recorded = this.opening.draft?.deal ?? [];
    /* Each seat, station and faction once, as the seats table holds them; any other recording deals at random. */
    const distinct = (values: readonly unknown[]) => new Set(values).size === values.length;
    const asRecorded =
      recorded.length === seated.length &&
      distinct(recorded.map((entry) => entry.seat)) &&
      distinct(recorded.map((entry) => entry.position)) &&
      distinct(recorded.map((entry) => entry.factionId)) &&
      recorded.every((entry) => seated.includes(entry.seat) && factions.includes(entry.factionId));
    const deal = asRecorded ? [...recorded] : dealSeats(seated, factions, hostRandomInt);
    const tokens = Object.fromEntries(
      deal.flatMap((entry) => {
        const token = recorded.find((candidate) => candidate.factionId === entry.factionId)?.token;
        return token ? [[entry.seat, token] as const] : [];
      })
    );
    this.session.completeAssignment(prepared, { deal, tokens });
  }

  /** A catalogue request, committed with what the page's catalogue captured for it, as the Worker commits one after its capture. */
  requestSpawn(message: MessageOf<'command'>, contents: StoredSpawnContents) {
    if (message.action.kind === 'spawn-request') {
      this.captured.set(spawnableKey(message.action), contents.assetId);
    }
    this.spawnContents = contents;
    try {
      this.receive(message);
    } finally {
      this.spawnContents = undefined;
    }
  }

  /** The asset a catalogue selection captured on this table, once the page has requested it. */
  capturedAsset(selection: SpawnSelection) {
    return this.captured.get(spawnableKey(selection));
  }

  /** The selected token's pieces in the learner's projected view, without relying on public stack keys. */
  capturedPieces(selection: SpawnSelection) {
    const assetId = this.capturedAsset(selection);
    if (!assetId) {
      return [];
    }
    const ids = new Set(
      this.room.snapshot.table.pieces
        .filter((piece) => piece.stackKey === capturedTokenStackKey(assetId))
        .map((piece) => piece.id)
    );
    return this.frame().snapshot.table.pieces.filter((piece) => ids.has(piece.id));
  }

  /** A captured asset as the page's catalogue answer shows it. */
  projectContents(contents: StoredSpawnContents) {
    return this.session.projectContents(contents);
  }

  /* The lobby a game room reports to is not there, so every summary the session stages counts as delivered. */
  private settleDirectory() {
    const pending = this.session.pendingDirectory();
    if (pending) {
      this.session.acknowledgeDirectory(pending.sequence);
    }
  }

  /* The session's next deadline (a battle reveal, a bid, trading closing) is kept with a timer, as the Worker keeps it with its alarm. */
  private scheduleDeadline() {
    clearTimeout(this.deadlineTimer);
    const deadline = this.session.nextDeadline();
    if (deadline === undefined) {
      return;
    }
    this.deadlineTimer = setTimeout(
      () => {
        if (this.session.advanceDeadlines()) {
          this.settleDirectory();
          this.deliver(this.frame());
        }
        /* A timer can fire a moment before the deadline, so it waits out the rest. */
        this.scheduleDeadline();
      },
      Math.max(0, deadline - hostNow())
    );
  }

  /** Whether the page can be viewed as a seat: one recorded, or one someone holds now. */
  private seatable(seat: string) {
    return Boolean(this.opening.viewers[seat]) || Boolean(this.session.holderOf(seat));
  }

  /** Stops the deadline timer when the page leaves. */
  dispose() {
    clearTimeout(this.deadlineTimer);
  }

  /** Ends the table for good, as a Reset does to the table it replaces: the timer stops and its database is freed. */
  close() {
    this.dispose();
    this.closeStorage();
  }

  /** A recorded deadline that ran out before the table opened falls due as it opens. */
  open() {
    this.session.advanceDeadlines();
    this.settleDirectory();
    this.scheduleDeadline();
  }
}

/* The id a rejection answers, as the Worker's `messageId` picks it. */
function requestId(message: TableMessage) {
  if ('commandId' in message) {
    return message.commandId;
  }
  if ('requestId' in message) {
    return message.requestId ?? 'message';
  }
  if ('carryId' in message) {
    return message.carryId;
  }
  return 'message';
}
