import { tableHandlingOpen } from '@shared/play/admission';
import type { BattlePlanInput } from '@shared/play/battle';
import type { CardDraw } from '@shared/play/cardDraw';
import { snapshotFactionTieBreaks } from '@shared/play/factionLabels';
import type { SpawnSelection } from '@shared/play/inventory';
import type { LogTab } from '@shared/play/log';
import { affordancesFor } from '@shared/play/model';
import type { TablePiece, TableState, Vector3Tuple } from '@shared/play/model';
import { isSeatAction } from '@shared/play/participation';
import { TABLE_PING_INTERVAL_MS, tableForViewer } from '@shared/play/protocol';
import type {
  ClientMessage,
  GameSnapshot,
  PieceAction,
  PublicCarry,
  PublicPointer,
  ServerMessage,
  PingSound,
  TablePing,
} from '@shared/play/protocol';
import { isRemovalAction } from '@shared/play/removal';
import { isReviewAction, reviewRunning } from '@shared/play/review';
import { SPECTATOR_SEAT, tablePositionSchema } from '@shared/play/schema';
import type { SpiceGift } from '@shared/play/spiceReserve';
import { isSwapAction } from '@shared/play/swapping';
import { renderedPiecesFor } from '@shared/play/tableState';

import { BattleQueue } from './BattleQueue';
import { BoardKeeper } from './BoardKeeper';
import { CarryController, pausedWhileHeld } from './CarryController';
import type { GiftPointer } from './CarryController';
import { CatalogueRequests } from './CatalogueRequests';
import { ConversationSession } from './ConversationSession';
import type { ConversationView } from './ConversationSession';
import { Listeners } from './Listeners';
import { MovementOrder } from './MovementOrder';
import { OwnChanges } from './OwnChanges';
import { PeekState } from './PeekState';
import { PieceFlips } from './PieceFlips';
import { PieceTurns } from './PieceTurns';
import type { GameRuntime } from './runtime';
import { SpiceBlowQueue } from './SpiceBlowQueue';
import { TableControls } from './TableControls';
import { TableKeeper } from './TableKeeper';
import { TablePages } from './TablePages';
import { TablePlayback } from './TablePlayback';
import { TablePointer } from './TablePointer';
import { pausedProjection, pickupRidersOf, remoteViewOf, sameForPanels, storedProjection } from './tableProjection';
import type { ConnectionView, TableProjection } from './tableProjection';

export type { ConnectionView, TableProjection } from './tableProjection';
import { isReadRequest } from './TableSubscription';
import type { TableSubscription, TableSubscriptionEvent } from './TableSubscription';

type OutgoingMessage = Exclude<ClientMessage, { type: 'admit' | 'sync' }>;

function settledRequest(message: TableSubscriptionEvent): { id: string; outcome: 'completed' | 'rejected' } | null {
  switch (message.type) {
    case 'view':
    case 'resync':
      return message.completedCommandId ? { id: message.completedCommandId, outcome: 'completed' } : null;
    case 'catalogue':
      return { id: message.requestId, outcome: 'completed' };
    case 'rejected':
      return { id: message.requestId, outcome: 'rejected' };
    default:
      return null;
  }
}

/* How many of this page's commands may wait on the room at once before a further one is dropped. */
const UNANSWERED_COMMANDS_LIMIT = 4;

/* Commands a held piece does not hold back: a phase change, a removal, a seat, and letting go of a peek, which the room allows mid-carry. */
function passesCarry(action: PieceAction) {
  return (
    action.kind === 'phase' ||
    action.kind === 'peek-close' ||
    isRemovalAction(action) ||
    isSeatAction(action) ||
    isReviewAction(action)
  );
}

function sameConversations(previous: ConversationView, next: ConversationView) {
  return (
    previous.context === next.context &&
    previous.online === next.online &&
    previous.summaries === next.summaries &&
    previous.pages === next.pages &&
    previous.pending === next.pending
  );
}

/* Runs `callback` when the page next draws, or a frame's time later where nothing draws; the returned function cancels it. */
function onNextFrame(callback: () => void): () => void {
  if (typeof requestAnimationFrame === 'function') {
    const frame = requestAnimationFrame(callback);
    return () => cancelAnimationFrame(frame);
  }
  const timer = setTimeout(callback, 16);
  return () => clearTimeout(timer);
}

/* A position the table can hold, or null for one off it. */
function onTable(position: Vector3Tuple | null) {
  return position && tablePositionSchema.safeParse(position).success ? position : null;
}

/**
 * Owns local interactions and presentation over the subscribed server view.
 * Each interaction area keeps its own state in a part of its own;
 * the session routes the room's messages to them, gates and sends commands, and derives the one table the scene and the panels read.
 */
export class TableSession {
  private readonly listeners = new Listeners();
  private readonly pointerListeners = new Listeners();
  private readonly pingListeners = new Listeners<TablePing>();
  private readonly drawListeners = new Listeners<CardDraw>();
  private readonly tableListeners = new Listeners();
  private readonly countdownListeners = new Listeners();
  private lastDraw: Pick<CardDraw, 'epoch' | 'revision'> | null = null;
  /* When this page last pinged, by its monotonic clock; -Infinity before the first. */
  private pingedAt = Number.NEGATIVE_INFINITY;
  private shownCountdown = 0;
  /* The table as the last update derived it, which the session itself and the scene read. */
  private table: TableProjection | null = null;
  /* The last table there was, which the scene keeps reading while its parent takes it off the page. */
  private shownTable: TableProjection | null = null;
  private shownPointers: PublicPointer[] = [];
  /* Cancels the frame at which the scene hears of a held piece's latest move; set only while one is waiting. */
  private cancelTableFrame: (() => void) | undefined;
  private tickTimer: ReturnType<typeof setInterval> | undefined;
  private error: string | null = null;
  private epoch = '';
  private seq = 0;
  private selectedId: string | null = null;
  private hoveredId: string | null = null;
  private carries: PublicCarry[] = [];
  private pointers: PublicPointer[] = [];
  /* The commands this page sent that the room has not answered yet. */
  private readonly unanswered = new Set<string>();
  private readonly pointer: TablePointer;
  /* The table, board or rim surface under the cursor, where a ping lands so every viewer sees it at the same spot. */
  private pingPoint: Vector3Tuple | null = null;
  private cached: ConnectionView;
  /* What this viewer's own commands changed, by the room's answers, for the soft notices. */
  private readonly ownChanges = new OwnChanges();
  /* One seat command at a time: a second click before the first settles would only fail the revision gate. */
  private seatCommandInFlight: string | null = null;
  private traitorGatherInFlight: string | null = null;
  private traitorsGathered = 0;
  /* The last live table, kept read-only while a lost connection is restored; its clock stops when the connection drops, not at the last update. */
  private lastLive: { table: TableProjection; serverNow?: () => number } | null = null;
  private phaseCooldownUntil = 0;
  private battleCountdownUntil = 0;
  private readonly battle: BattleQueue;
  private readonly pages: TablePages;
  private readonly keeper: TableKeeper;
  private readonly boards = new BoardKeeper();
  private readonly playback: TablePlayback;
  private readonly carrying: CarryController;
  private readonly turns: PieceTurns;
  private readonly flips = new PieceFlips();
  private readonly peeks: PeekState;
  private readonly spiceBlows: SpiceBlowQueue;
  private readonly controls: TableControls;
  private readonly catalogues: CatalogueRequests;
  private readonly movement = new MovementOrder();
  readonly conversations: ConversationSession;

  constructor(
    readonly game: string,
    private readonly subscription: TableSubscription,
    private readonly runtime: GameRuntime,
    { refreshStationaryPointer = false }: { refreshStationaryPointer?: boolean } = {}
  ) {
    const command = (action: PieceAction) => this.command(action);
    const emit = () => this.emit();
    const snapshot = () => this.snapshot;
    const table = () => this.table;
    this.pointer = new TablePointer(
      (position) => this.send({ type: 'pointer', seq: ++this.seq, position }),
      () => this.canPoint(),
      refreshStationaryPointer
    );
    this.conversations = new ConversationSession(
      (message) => this.subscription.send(message),
      emit,
      runtime.monotonicNow
    );
    this.battle = new BattleQueue({
      canAct: () => this.canAct(),
      snapshot,
      sendPlan: (commandId, battleId, plan, expectedRevision) =>
        this.send({ type: 'command', commandId, expectedRevision, action: { kind: 'battle-plan', battleId, plan } }),
      command,
      hasRoom: () => this.unanswered.size < UNANSWERED_COMMANDS_LIMIT,
    });
    this.pages = new TablePages((message) => this.send(message), runtime.monotonicNow, emit);
    this.keeper = new TableKeeper(
      game,
      () => runtime.tables,
      () => runtime.monotonicNow()
    );
    this.playback = new TablePlayback({
      send: (message) => this.send(message),
      monotonicNow: () => runtime.monotonicNow(),
      serverNow: () => this.subscription.serverNow(),
      hidePointer: () => this.publishPointer(null),
      flushQueues: () => this.flushQueues(),
    });
    this.turns = new PieceTurns({
      snapshot,
      state: () => this.requireTable().state,
      showsHistory: () => this.playback.shown !== null,
      current: () => this.current(),
      remoteCarries: () => this.activityForView().carries,
      command,
      emit,
    });
    this.carrying = new CarryController({
      send: (message) => this.send(message),
      nextSeq: () => ++this.seq,
      snapshot,
      table,
      canHandle: () => this.canHandle(),
      connectionId: () => this.viewer?.connectionId,
      roomCarries: () => this.carries,
      turnSending: (pieceId) => this.turns.sending(pieceId),
      finishRotation: () => this.turns.finish(),
      select: (pieceId) => {
        this.selectedId = pieceId;
      },
      setError: (error) => {
        this.error = error;
      },
      emit: (coalesce) => this.emit(coalesce),
    });
    this.peeks = new PeekState({ snapshot, command, emit });
    this.spiceBlows = new SpiceBlowQueue({ table, command, awaiting: (commandId) => this.unanswered.has(commandId) });
    this.controls = new TableControls(
      {
        table,
        snapshot,
        viewerSeat: () => this.viewer!.viewerSeat,
        supportsCommand: (kind) => this.subscription.supportsCommand(kind),
        command,
      },
      this.peeks,
      this.spiceBlows
    );
    this.catalogues = new CatalogueRequests((message) => this.send(message));
    this.restore();
    this.table = this.derive();
    this.shownTable = this.table;
    this.cached = {
      status: 'connecting',
      error: null,
      table: this.table,
      conversations: this.conversations.view(),
      logHistory: {},
      factions: {},
    };
  }
  /*
   * Only into the read-only last table, never into the subscription: a stored base that an update could patch would pass for live.
   * The subscription's first view replaces it, and its `ready` stays false until then, so nothing is sent from it.
   */
  private restore() {
    const stored = this.lastLive || this.saved ? null : this.keeper.restore();
    if (!stored) {
      return;
    }
    this.boards.restore(stored.snapshot.board);
    this.conversations.resume(stored.snapshot, stored.viewer, stored.pending);
    this.lastLive = { table: storedProjection(stored), serverNow: () => stored.serverNow };
    /* A table kept from a reload has no countdown running. */
    this.setCountdown(0);
  }
  /* Saves the table a reload of this tab shows; a refused table forgets it. */
  private keep() {
    if (this.status === 'denied') {
      this.keeper.forget();
      return;
    }
    const live = this.status === 'authorized' ? this.subscription.getSnapshot() : null;
    this.keeper.keep(live, this.conversations.unconfirmed(), () => this.subscription.serverNow());
  }
  private get status() {
    return this.subscription.status;
  }
  private get saved() {
    return this.subscription.getSnapshot()?.snapshot ?? null;
  }
  private get viewer() {
    return this.subscription.getSnapshot()?.viewer ?? null;
  }
  private get snapshot(): GameSnapshot {
    if (!this.saved) {
      throw new Error('The table has not been admitted.');
    }
    return this.saved;
  }
  private requireTable(): TableProjection {
    const table = this.table;
    if (!table) {
      throw new Error('The table is not authorized.');
    }
    return table;
  }
  subscribe = this.listeners.subscribe;
  /*
   * The connection and a table for the panels. While only held pieces move, the panels' table stays the one they have:
   * where a carried piece is on its way may lag there, and the scene, which shows it, reads `getTable` instead.
   */
  getSnapshot = () => this.cached;
  /* The live table, every move included, for the scene and the table's own controls. */
  subscribeTable = this.tableListeners.subscribe;
  getTable = () => this.shownTable;
  /** The normal controls keep their own last live presentation while recall uses another controller. */
  getLastLiveTable = () => this.lastLive?.table ?? null;
  /*
   * The other players' pointers, apart from the table: they move many times a second, and only the scene's hands follow them,
   * so an update that moves nothing else leaves the table, and everything that reads it, as it was.
   */
  subscribePointers = this.pointerListeners.subscribe;
  getPointers = () => this.shownPointers;
  /*
   * The battle countdown's whole seconds, apart from the table: they change every second while it runs, and only the number shows it,
   * so the panels around it render again only when the battle does.
   */
  subscribeBattleCountdown = this.countdownListeners.subscribe;
  getBattleCountdownSeconds = () => this.shownCountdown;
  /* A live table, or one looked back on, counts down; a lost connection holds the number where it stopped until the table is live again. */
  private showCountdown() {
    if (!this.table || this.table.reconnecting) {
      return;
    }
    this.setCountdown(this.battleCountdownSeconds());
  }
  private setCountdown(seconds: number) {
    if (seconds !== this.shownCountdown) {
      this.shownCountdown = seconds;
      this.countdownListeners.notify();
    }
  }
  /* Each ping as it happens, this page's own included: nothing keeps them, so a listener hears only what comes after it subscribes. */
  subscribePings = this.pingListeners.subscribe;
  /** Accepted draws reach every current viewer once, independently of the pieces they remove. */
  subscribeCardDraws = this.drawListeners.subscribe;
  private canShowCardDraws() {
    if (this.status !== 'authorized') {
      return false;
    }
    return this.current() && !reviewRunning(this.saved?.review);
  }
  private receiveCardDraw(draw: CardDraw) {
    if (!this.canShowCardDraws()) {
      return;
    }
    if (draw.epoch !== this.epoch || draw.revision !== this.snapshot.revision) {
      return;
    }
    if (this.lastDraw?.epoch === draw.epoch && draw.revision <= this.lastDraw.revision) {
      return;
    }
    this.lastDraw = { epoch: draw.epoch, revision: draw.revision };
    this.drawListeners.notify(draw);
  }
  /**
   * Pings the table where the cursor is, for everyone, and answers whether the ping key was used.
   * It was not when there is no cursor on the table, or the connection cannot carry pings, as on the homepage's table.
   * A ping sooner than the interval after the last is skipped, though the key still counts as used.
   * A `sound` plays instead of the usual tone, for everyone.
   */
  ping = (sound?: PingSound): boolean => {
    const ping = this.pingHere(sound);
    if (!ping) {
      return false;
    }
    const now = this.runtime.monotonicNow();
    if (now - this.pingedAt < TABLE_PING_INTERVAL_MS) {
      return true;
    }
    if (!this.send({ type: 'ping', position: ping.position, ...(sound && { sound }) })) {
      return false;
    }
    this.pingedAt = now;
    this.pingListeners.notify(ping);
    return true;
  };
  /* This page's ping on the table surface under its cursor, while it has a cursor on the table and may act. */
  private pingHere(sound: PingSound | undefined): TablePing | null {
    if (!this.canPoint()) {
      return null;
    }
    const viewer = this.viewer;
    if (!viewer || this.pingPoint === null) {
      return null;
    }
    const { connectionId, viewerSeat, displayName, color } = viewer;
    return { connectionId, viewerSeat, displayName, color, position: this.pingPoint, ...(sound && { sound }) };
  }
  /* A ping changes nothing on the table, so it skips the update every other message makes. */
  private receivePing(ping: TablePing) {
    if (this.status === 'authorized' && this.seesSharedTable()) {
      this.pingListeners.notify(ping);
    }
  }
  private emitPointers() {
    const next = this.status === 'authorized' ? this.activityForView().pointers : [];
    if (
      next.length === this.shownPointers.length &&
      next.every((pointer, index) => pointer === this.shownPointers[index])
    ) {
      return;
    }
    this.shownPointers = next;
    this.pointerListeners.notify();
  }
  /* An update that moved only pointers: the room, the carries and the phase cooldown are as the last frame left them; the battle countdown keeps its own listeners. */
  private movesOnlyPointers(message: Extract<TableSubscriptionEvent, { type: 'view' }>) {
    const table = this.table;
    return (
      !message.snapshotChanged &&
      message.previous !== null &&
      this.status === 'authorized' &&
      table !== null &&
      !table.reconnecting &&
      message.epoch === this.epoch &&
      message.carries === this.carries &&
      table.phaseCooling === this.phaseCooling()
    );
  }
  private phaseCooling() {
    return this.runtime.monotonicNow() < this.phaseCooldownUntil;
  }
  private battleCountdownSeconds() {
    return Math.max(0, Math.ceil((this.battleCountdownUntil - this.runtime.monotonicNow()) / 1000));
  }
  private derive(): TableProjection | null {
    if (this.status !== 'authorized') {
      return this.reconnectingTable();
    }
    if (!this.saved || !this.viewer) {
      return null;
    }
    const table = this.liveTable();
    if (this.current() && !reviewRunning(this.saved?.review)) {
      this.lastLive = { table };
    }
    return table;
  }
  /* A refusal shows nothing; any other lost connection keeps the last table on screen with every action paused. */
  private reconnectingTable(): TableProjection | null {
    if (this.status === 'denied' || !this.lastLive) {
      this.lastLive = null;
      return null;
    }
    if (!this.lastLive.serverNow) {
      const now = this.subscription.serverNow();
      this.lastLive.serverNow = () => now;
    }
    return pausedProjection(this.lastLive.table, this.lastLive.serverNow);
  }
  private presentedSnapshot() {
    const history = this.playback.shown;
    const received = history?.snapshot ?? this.movement.arranged(this.snapshot);
    return this.battle.shown(this.boards.shown(received, history !== null), history !== null);
  }
  private liveTable(): TableProjection {
    const viewer = this.viewer!;
    const displayed = this.presentedSnapshot();
    const state = this.stateForView(displayed);
    const { carries: remote } = this.activityForView();
    const local = this.localProjection(state);
    const canInteract = this.canAct();
    const canHandleTable = this.canHandle();
    const showsHistory = this.playback.shown !== null;
    const { renderedPieces, reservedPieceIds, ...remoteIds } = this.remoteView(local.pieces, remote, state.pieces);
    return {
      viewer,
      snapshot: displayed,
      ...(this.movement.dragged && !showsHistory ? { confirmedSnapshot: this.snapshot } : {}),
      ownChanges: this.ownChanges.view(),
      liveRevision: this.snapshot.revision,
      playback: this.playback.playback(),
      historyPending: this.playback.pending,
      ...(this.snapshot.review !== undefined && {
        review: {
          current: this.snapshot.review,
          checkpoints: this.snapshot.reviewCheckpoints ?? [],
          seat: viewer.viewerSeat === SPECTATOR_SEAT ? null : viewer.viewerSeat,
          finished: this.snapshot.stage === 'finished',
        },
      }),
      canInteract,
      canHandleTable,
      reconnecting: false,
      seatCommandPending: this.seatCommandInFlight !== null,
      traitorsGathered: this.traitorsGathered,
      phaseCooling: this.phaseCooling(),
      state,
      renderedPieces,
      selectedPiece: renderedPieces.find((piece) => piece.id === state.selectedPieceId) ?? null,
      affordances: affordancesFor({ ...state, pieces: renderedPieces }),
      ...this.controls.forTable(displayed, { canInteract, canHandleTable, showsHistory }),
      spiceGift: this.carrying.spiceGift(displayed, state, showsHistory),
      ...remoteIds,
      reservedPieceIds,
      gestureActivePieceId: local.gestureActivePieceId,
      hoveredPieceId: this.hoveredId,
      flippingPieceIds: local.flippingPieceIds,
      serverNow: this.playback.shownClock() ?? this.subscription.serverNow,
    };
  }
  private stateForView(displayed: GameSnapshot) {
    return {
      ...tableForViewer(displayed, this.viewer!.viewerSeat),
      factionTieBreaks: snapshotFactionTieBreaks(displayed),
      selectedPieceId: this.canHandle() ? this.selectedId : null,
      draftMove: this.carrying.current?.draft ?? null,
    };
  }
  private remoteView(pieces: TablePiece[], carries: PublicCarry[], rested: TablePiece[]) {
    /* The live carries, this page's own among them, even while history is shown. */
    return remoteViewOf(pieces, carries, rested, {
      ownDraft: this.carrying.current?.draft ?? null,
      pickupRiders: pickupRidersOf(this.carries),
    });
  }
  private activityForView() {
    const history = this.playback.shown;
    if (history && !reviewRunning(this.saved?.review)) {
      return { carries: [], pointers: [] };
    }
    const connectionId = this.viewer?.connectionId;
    return {
      carries: history ? [] : this.carries.filter((carry) => carry.connectionId !== connectionId),
      pointers: this.pointers.filter((pointer) => pointer.connectionId !== connectionId),
    };
  }
  private localProjection(state: TableState) {
    const draft = this.carrying.current?.draft;
    const pieces = renderedPiecesFor(state).map((piece) =>
      draft?.pieceId === piece.id
        ? this.carrying.withRevealedFaces({ ...piece, position: draft.position, orientation: draft.orientation })
        : this.turns.shown(state, piece)
    );
    return {
      pieces,
      gestureActivePieceId: this.carrying.gestureActivePieceId(),
      flippingPieceIds: this.flips.view(this.snapshot),
    };
  }
  /*
   * `coalesce` is for a held piece's moves: the table is derived at once, but the scene hears of it at most once per drawn frame.
   * Any other emit, a drop or a cancel among them, tells the scene straight away, a move still waiting included, so it never hears out of order.
   */
  private emit(coalesce = false) {
    this.keep();
    const table = this.derive();
    this.table = table;
    const panelsChanged = this.showPanels(table);
    const tableChanged = table !== null && table !== this.shownTable;
    this.shownTable = table ?? this.shownTable;
    /* The countdown is settled first, so a panel that starts showing it reads the seconds this table has. */
    this.showCountdown();
    if (panelsChanged) {
      this.listeners.notify();
    }
    /* Only a held piece's own moves wait for the next frame; anything the panels show goes out at once. */
    const waitsForFrame = tableChanged && coalesce && !panelsChanged;
    if (waitsForFrame) {
      this.cancelTableFrame ??= onNextFrame(this.flushTable);
    } else if (tableChanged || this.cancelTableFrame) {
      this.flushTable();
    }
    this.emitPointers();
  }
  /* Tells the scene of the table as it is now, and drops any frame still waiting to. */
  private readonly flushTable = () => {
    this.cancelTableFrame?.();
    this.cancelTableFrame = undefined;
    this.tableListeners.notify();
  };
  /* Replaces the panels' view only when something they show changed, and says whether it did. */
  private showPanels(table: TableProjection | null) {
    const previous = this.cached;
    const conversations = this.conversations.view();
    const next: ConnectionView = {
      status: this.status,
      conversations: sameConversations(previous.conversations, conversations) ? previous.conversations : conversations,
      error: this.error,
      table: table && previous.table && sameForPanels(previous.table, table) ? previous.table : table,
      catalogue: this.catalogues.result,
      spiceHistory: this.pages.spiceHistory,
      logHistory: this.pages.logHistory,
      factions: this.pages.factions,
      treacheryDeck: this.pages.treacheryDeck,
      treacheryDeckSeat: this.pages.treacheryDeckSeat,
    };
    const changed = (Object.keys(next) as (keyof ConnectionView)[]).some((key) => next[key] !== previous[key]);
    this.cached = changed ? next : previous;
    return changed;
  }
  private canSend(message: OutgoingMessage): boolean {
    if (this.status !== 'authorized') {
      return false;
    }
    if (isReadRequest(message)) {
      return true;
    }
    if (message.type === 'pointer' || message.type === 'ping') {
      return this.canPoint() || (message.type === 'pointer' && message.position === null);
    }
    return this.canAct() || this.canSendWhilePaused(message);
  }
  private canSendWhilePaused(message: OutgoingMessage): boolean {
    if (message.type === 'command') {
      return isSeatAction(message.action) || isReviewAction(message.action);
    }
    /* A held piece must return even while resync or recall pauses the table. */
    return message.type === 'cancel' && this.carrying.current !== null;
  }
  private send(message: OutgoingMessage): boolean {
    return this.canSend(message) && this.subscription.send(message);
  }
  private receive(message: Exclude<TableSubscriptionEvent, { type: 'ping' | 'card-draw' }>) {
    this.settleRequest(message);
    switch (message.type) {
      case 'connection':
        this.conversations.disconnected(this.status === 'denied');
        this.movement.forget();
        this.ownChanges.forget();
        this.peeks.disconnected();
        this.carrying.noteEnded({
          held: pausedWhileHeld,
          placing: 'The connection dropped as you placed a piece. Check where it landed.',
        });
        this.clearDisconnectedActivity();
        this.selectedId = null;
        this.hoveredId = null;
        this.error = message.error;
        break;
      case 'resync':
        break;
      case 'view':
        this.phaseCooldownUntil = this.runtime.monotonicNow() + (message.phaseCooldownMs ?? 0);
        this.battleCountdownUntil = this.runtime.monotonicNow() + (message.battleCountdownMs ?? 0);
        const historyMoved = this.playback.recordLiveSteps(message.historySteps);
        if (!historyMoved && this.movesOnlyPointers(message)) {
          this.pointers = message.pointers;
          this.emitPointers();
          this.showCountdown();
          this.keep();
          return;
        }
        this.receiveRoomUpdate(message);
        break;
      default:
        if (this.status === 'authorized') {
          this.receiveAuthorizedUpdate(message);
        }
    }
    this.peeks.forgetSettledClose(this.saved);
    this.battle.discardReplaced(this.saved?.battle?.id);
    this.flushQueues();
    this.followReview();
    this.emit();
  }
  /*
   * A running table review shows its checkpoint to everyone at once, so this page asks for it without being asked,
   * once per review, and goes back to the live table when the review ends.
   */
  private followReview() {
    const review = this.status === 'authorized' && this.saved ? this.snapshot.review : null;
    this.playback.follow(review, this.carrying.current !== null);
  }
  private settleRequest(message: TableSubscriptionEvent) {
    const settled = settledRequest(message);
    /* The subscription applies a view before it hands it on, so the room's table already shows what each taken command did. */
    this.ownChanges.observed(this.saved);
    if (!settled) {
      return;
    }
    const viewFollows = message.type === 'resync';
    this.settle(settled.id, settled.outcome, viewFollows);
    this.ownChanges.settled(settled.id, settled.outcome, { room: this.saved, followsLater: viewFollows });
  }
  private settle(id: string, outcome: 'completed' | 'rejected', viewFollows: boolean) {
    this.carrying.settle(id, outcome, viewFollows);
    this.flips.settle(id);
    this.unanswered.delete(id);
    /* Any answer frees room under the unanswered limit; after its frame is applied, so the next card finds its spot among the spice just placed. */
    this.spiceBlows.settle(id);
    this.turns.settle(id, viewFollows);
    this.peeks.settle(id, outcome);
    this.movement.settle(id);
    this.catalogues.settle(id);
    if (this.seatCommandInFlight === id) {
      this.seatCommandInFlight = null;
    }
    this.battle.settle(id, outcome);
    if (this.traitorGatherInFlight === id) {
      this.traitorGatherInFlight = null;
      if (outcome === 'completed') {
        this.traitorsGathered++;
      }
    }
  }
  private flushQueues() {
    if (!this.saved) {
      return;
    }
    this.carrying.flushDrop();
    this.catalogues.flush();
    this.battle.flush();
    this.turns.flush();
  }
  private receiveAuthorizedUpdate(
    message: Exclude<TableSubscriptionEvent, { type: 'connection' | 'resync' | 'view' | 'ping' | 'card-draw' }>
  ) {
    if (this.conversations.receive(message) || this.pages.receive(message)) {
      return;
    }
    switch (message.type) {
      case 'catalogue':
        this.catalogues.receive(message);
        break;
      case 'history':
        if (this.playback.receive(message)) {
          this.error = null;
        }
        break;
      case 'rejected':
        this.receiveRejection(message);
        break;
      case 'carry':
        this.carrying.receive(message);
        break;
      case 'metrics':
        break;
    }
  }
  private receiveRejection(message: Extract<ServerMessage, { type: 'rejected' }>) {
    if (this.playback.ignores(message)) {
      return;
    }
    this.error = message.message;
    this.pages.forgetFactionReads();
    this.playback.rejected(message);
    this.catalogues.rejected(message);
  }
  private receiveRoomUpdate(message: Extract<TableSubscriptionEvent, { type: 'view' }>) {
    this.replaceActivity(message);
    if (message.snapshotChanged) {
      this.turns.viewArrived();
      this.receiveView(message);
    }
    const notice = this.carrying.takeNotice();
    if (notice) {
      this.error = notice;
    }
    this.carrying.reconcile();
  }
  private replaceActivity(message: Extract<TableSubscriptionEvent, { type: 'view' }>) {
    if (this.epoch && message.epoch !== this.epoch) {
      this.pointer.forgetSent();
      this.carrying.noteEnded({
        held: 'The room resumed. Pick up the piece again to continue.',
        placing: 'The room resumed as you placed a piece. Check where it landed.',
      });
      this.carrying.end();
    }
    this.epoch = message.epoch;
    this.carries = message.carries;
    this.pointers = message.pointers;
  }
  private receiveView(message: Extract<TableSubscriptionEvent, { type: 'view' }>) {
    this.conversations.authority(message.snapshot, message.viewer);
    if (message.previous?.viewer.viewerSeat !== message.viewer.viewerSeat) {
      this.pointer.forgetSent();
    }
    if (
      message.previous?.snapshot.bank?.factionId !== message.snapshot.bank?.factionId ||
      message.previous?.viewer.viewerSeat !== message.viewer.viewerSeat
    ) {
      this.clearActivity();
      this.replaceActivity(message);
    }
    this.error = null;
    this.flips.accept(message.snapshot, message.previous?.snapshot);
    this.carrying.viewArrived();
    /* A Spice blow the table could not take a moment ago goes on with the view it waited for. */
    this.spiceBlows.resume();
  }
  private clearDisconnectedActivity() {
    this.pointer.forgetSent();
    this.pages.disconnected();
    this.catalogues.disconnected();
    this.clearActivity();
  }
  private clearActivity() {
    this.battle.clear();
    this.spiceBlows.clear();
    this.seatCommandInFlight = null;
    this.traitorGatherInFlight = null;
    this.pages.closeSpiceHistory();
    this.playback.clear();
    this.carrying.clear();
    this.carries = [];
    this.pointers = [];
    this.pointer.cancel();
    this.unanswered.clear();
    this.turns.clear();
    this.flips.clear();
  }
  readLogHistory = (tab: LogTab, before?: number) => this.pages.readLog(tab, before);
  refreshLogHistory = (tab: LogTab) => this.pages.refreshLog(tab);
  readFaction = (factionId: string) => this.pages.readFaction(factionId);
  readTreacheryDeck = (seat: string | null) => this.pages.readTreacheryDeck(seat);
  readSpiceHistory = (before?: number) => this.pages.readSpice(before);
  /* Carries and homepage preview pointers expire on the Worker. */
  private readonly tickActivity = () => {
    this.conversations.tick();
    if (this.playback.expire()) {
      this.error = 'The checkpoint did not arrive. Try loading it again.';
      this.emit();
    }
    this.carrying.renew();
    this.pointer.refresh();
    if (this.table?.phaseCooling && !this.phaseCooling()) {
      this.emit();
    } else if (this.table?.snapshot.battle?.stage === 'countdown') {
      this.showCountdown();
    }
  };
  connect = () => {
    if (!this.lastLive && !this.keeper.holds()) {
      this.restore();
      this.emit();
    }
    const stop = this.subscription.subscribe((event) => {
      if (event.type === 'ping') {
        this.receivePing(event.ping);
      } else if (event.type === 'card-draw') {
        this.receiveCardDraw(event.draw);
      } else {
        this.receive(event);
      }
    });
    const stopVisibility = this.runtime.onHidden(() => {
      this.publishPointer(null);
      this.cancelDraft();
    });
    this.tickTimer = setInterval(this.tickActivity, 1000);
    return () => {
      stop();
      stopVisibility();
      clearInterval(this.tickTimer);
      this.clearDisconnectedActivity();
      this.lastLive = null;
      this.emit();
    };
  };
  private current() {
    return this.subscription.ready && this.saved !== null && this.playback.shown === null && !this.playback.pending;
  }
  private seesSharedTable() {
    return (
      this.subscription.ready &&
      this.saved !== null &&
      (this.current() || this.playback.showsReview(this.saved?.review))
    );
  }
  private canPoint() {
    return this.viewer?.viewerSeat !== SPECTATOR_SEAT && this.seesSharedTable();
  }
  /** Retry the shared checkpoint without changing what everyone has selected. */
  retryRecall = () => {
    if (!reviewRunning(this.saved?.review) || this.playback.pending) {
      return;
    }
    this.error = null;
    const review = this.status === 'authorized' && this.saved ? this.snapshot.review : null;
    this.playback.refollow(review, this.carrying.current !== null);
    this.emit();
  };
  private canAct() {
    return this.viewer?.viewerSeat !== SPECTATOR_SEAT && this.current() && !reviewRunning(this.saved?.review);
  }
  private canHandle() {
    return this.canAct() && tableHandlingOpen(this.snapshot.stage);
  }
  /** Whether this viewer can request a nudge from the current live table. */
  get canNudge(): boolean {
    if (!this.canAct()) {
      return false;
    }
    if (!['setup', 'play'].includes(this.snapshot.stage ?? '')) {
      return false;
    }
    const sender = this.snapshot.roster?.seats.find((seat) => seat.id === this.viewer?.viewerSeat);
    return Boolean(sender?.faction);
  }
  /** Sends one best-effort request; a disconnected table never queues it. */
  nudge = (toSeat: string): boolean => {
    if (!this.canNudge) {
      return false;
    }
    if (toSeat === this.viewer?.viewerSeat) {
      return false;
    }
    const target = this.snapshot.controls?.players.find((player) => player.seat === toSeat);
    if (!target) {
      return false;
    }
    if (!this.snapshot.roster?.seats.some((seat) => seat.id === toSeat)) {
      return false;
    }
    return this.send({ type: 'nudge', requestId: crypto.randomUUID(), toSeat });
  };
  requestHistory = (step: number) => {
    if (this.status !== 'authorized' || this.carrying.current || this.playback.holds()) {
      return;
    }
    if (!Number.isSafeInteger(step) || step < 0) {
      return;
    }
    this.playback.request(step);
    this.emit();
  };
  resumeLive = () => {
    if (!this.playback.leave()) {
      return;
    }
    this.flushQueues();
    this.emit();
  };
  selectPiece = (id: string | null) => {
    /* Clearing a selection sends nothing, so it is allowed even when the table cannot be handled. */
    if (id !== null && !this.canHandle()) {
      return;
    }
    this.selectedId = id;
    this.emit();
  };
  setHoveredPiece = (id: string | null) => {
    if (this.hoveredId === id) {
      return;
    }
    this.hoveredId = id;
    this.emit();
  };
  beginGesture = (sourceId: string, pickup: 'top' | 'whole') => this.carrying.begin(sourceId, pickup);
  updateGesture = (position: Vector3Tuple) => this.carrying.update(position);
  /**
   * Lets go of the held piece at `position`.
   * `pointer` is where the pointer let go, and its ray from the camera.
   * Spice let go over another faction's token waits there for the placer to say what it is.
   */
  finishGesture = (position: Vector3Tuple, pointer?: GiftPointer) => this.carrying.finish(position, pointer);
  /** Gives the spice waiting over a faction's token to that faction, as a bribe or a payment. */
  giveSpice = (as: SpiceGift) => this.carrying.giveSpice(as);
  cancelDraft = () => this.carrying.cancel();
  takeAdditionalFromTarget = () => this.carrying.takeAdditionalFromTarget();
  /**
   * A newer selection waits until the capture in flight answers, and only the latest one is sent.
   * The picker keys its status on the latest request id, so a queued read shows as checking.
   */
  catalogue = (selection: SpawnSelection) => this.catalogues.request(selection);
  editBattlePlan = (patch: Partial<BattlePlanInput>) => {
    if (!this.canAct() || !this.snapshot.battlePlan || !this.snapshot.battle) {
      return;
    }
    this.error = null;
    this.battle.editPlan(this.snapshot.battle.id, patch);
    this.emit();
  };
  /*
   * Whether this page may send the command now. Past a few unanswered commands a further one is dropped, not queued,
   * so mashing a button or key never stacks up work for the room; play by hand is answered long before it gets there.
   */
  private mayCommand(action: PieceAction) {
    /* Agreeing to, withdrawing or ending a review is for a seated player whatever checkpoint shows. */
    const live = this.subscription.ready && this.saved !== null && this.viewer?.viewerSeat !== SPECTATOR_SEAT;
    const allowed = isReviewAction(action) ? live : isSeatAction(action) ? this.current() : this.canAct();
    const held = this.carrying.current !== null;
    return allowed && !(held && !passesCarry(action)) && this.unanswered.size < UNANSWERED_COMMANDS_LIMIT;
  }
  private sendCommand(commandId: string, action: PieceAction) {
    const sent = this.send({ type: 'command', commandId, action, expectedRevision: this.snapshot.revision });
    if (sent) {
      this.ownChanges.sent(commandId, action);
      this.unanswered.add(commandId);
    }
    return sent;
  }
  /** Whether a command this page sent is still waiting for the table's answer. */
  awaiting = (commandId: string) => this.unanswered.has(commandId);
  /** Sends a table command, and returns its id when it went out. */
  command = (action: PieceAction): string | undefined => {
    if (!this.subscription.supportsCommand(action.kind)) {
      return;
    }
    const seatCommand = isSeatAction(action) || isSwapAction(action);
    if (seatCommand && this.seatCommandInFlight) {
      return;
    }
    if (this.battle.queueBehindPlan(action)) {
      this.emit();
      return;
    }
    if (!this.mayCommand(action)) {
      return;
    }
    if (action.kind === 'flip' && this.requireTable().flippingPieceIds.has(action.pieceId)) {
      return;
    }
    if (action.kind === 'spawn-request' && this.catalogues.busy) {
      /* The Worker would refuse it and the refusal would free the slot the earlier capture still holds. */
      this.error = 'A catalogue request is already in flight.';
      this.emit();
      return;
    }
    this.error = null;
    const commandId = crypto.randomUUID();
    if (action.kind === 'flip') {
      this.flips.sent(commandId, action.pieceId);
    }
    if (!this.sendCommand(commandId, action)) {
      this.flips.settle(commandId);
      this.error = 'The connection closed before the action could be sent.';
    } else if (seatCommand) {
      this.seatCommandInFlight = commandId;
    } else if (action.kind === 'spawn-request') {
      this.catalogues.spawnSent(commandId);
    } else if (action.kind === 'traitors-gather' && this.traitorGatherInFlight === null && this.tabletopTraitors()) {
      /* A second click before the first settles is refused for its stale revision, so the first gather is the one to follow; with no Traitor left on the table there is no pile to look at. */
      this.traitorGatherInFlight = commandId;
    } else if (action.kind === 'battle-disclose') {
      this.battle.disclosureSent(commandId, action);
    } else if (action.kind === 'movement-order') {
      this.movement.sent(commandId, action.order);
    }
    this.emit();
    return this.error === null ? commandId : undefined;
  };
  private tabletopTraitors() {
    return this.snapshot.table.pieces.some(
      (piece) => piece.kind === 'card' && piece.stackKey === 'cards:traitor' && !piece.inventory
    );
  }
  /* A piece command names its piece only while the table can be handled, so a finished table never sends one the room refuses. */
  private target(id?: string) {
    return this.canHandle() ? (id ?? this.hoveredId ?? this.selectedId) : null;
  }
  splitSelected = (count = 1, id?: string) => {
    const pieceId = this.target(id);
    if (pieceId) {
      this.command({ kind: 'split', pieceId, count });
    }
  };
  stackSelected = (id?: string) => {
    const pieceId = this.target(id);
    if (pieceId) {
      this.command({ kind: 'stack', pieceId });
    }
  };
  rotateSelected = (direction: -1 | 1 = 1, id?: string) => {
    /* A piece let go of turns no more, and nothing at rest turns while it lands, since the room would refuse that turn. */
    if (this.carrying.current) {
      this.carrying.rotate(direction);
      return;
    }
    const pieceId = this.target(id);
    if (pieceId) {
      this.turns.step(pieceId, direction);
    }
  };
  /** Sends the held rotation as one command, its net turn folded into half a turn either way; a turn back to where it started sends nothing. */
  finishRotation = () => this.turns.finish();
  flipSelected = (id?: string) => {
    if (!this.canAct()) {
      return;
    }
    if (this.carrying.current) {
      this.carrying.flip();
      return;
    }
    const pieceId = this.target(id);
    if (!pieceId || this.requireTable().flippingPieceIds.has(pieceId)) {
      return;
    }
    this.command({ kind: 'flip', pieceId });
  };
  toggleLockSelected = (id?: string) => {
    const pieceId = this.target(id);
    if (pieceId) {
      this.command({ kind: 'lock', pieceId });
    }
  };
  moveStormBy = (direction: -1 | 1 = 1) => this.command({ kind: 'storm', direction });
  spawnSpice = (count: number) => this.command({ kind: 'spice-spawn', count });
  finishPieceFlip = (pieceId: string, revision: number) => {
    this.carrying.finishFlip(pieceId, revision);
    if (this.flips.finish(pieceId, revision)) {
      this.emit();
    }
  };
  /** Publishes the cursor, and keeps `surface`, the table under it, for a ping to mark. */
  publishPointer = (position: Vector3Tuple | null, surface: Vector3Tuple | null = null) => {
    this.pingPoint = position ? onTable(surface) : null;
    this.pointer.publish(this.canPoint() ? onTable(position) : null);
  };
}
