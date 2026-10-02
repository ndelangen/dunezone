import { tableHandlingOpen } from '@shared/play/admission';
import type { BattlePlanInput } from '@shared/play/battle';
import { snapshotFactionLabels, snapshotFactionTieBreaks } from '@shared/play/factionLabels';
import type { SpawnSelection } from '@shared/play/inventory';
import type { LogTab } from '@shared/play/log';
import { affordancesFor, gestureBlockReason } from '@shared/play/model';
import type { Affordance, DraftMove, TablePiece, TableState, Vector3Tuple } from '@shared/play/model';
import { isSeatAction } from '@shared/play/participation';
import { carryPieceId, tableForViewer } from '@shared/play/protocol';
import type {
  ClientMessage,
  GameSnapshot,
  PieceAction,
  Viewer,
  PublicCarry,
  PublicPointer,
  ServerMessage,
} from '@shared/play/protocol';
import { isRemovalAction } from '@shared/play/removal';
import { SPECTATOR_SEAT, tablePositionSchema } from '@shared/play/schema';
import { isSwapAction } from '@shared/play/swapping';
import { draftForGesture, projectCarryAtPosition, renderedPiecesFor } from '@shared/play/tableState';

import type { requestPlayTicket } from '@db/play';

import { ConversationSession } from './ConversationSession';
import type { ConversationView } from './ConversationSession';
import { browserGameRuntime } from './gameRuntime';
import type { GameRuntime } from './gameRuntime';
import { GameSubscription, isReadRequest } from './GameSubscription';
import type { GameSubscriptionEvent } from './GameSubscription';
import type { StoredTable } from './storedTable';

/* Both tabs open on their newest page. */
function latestLogPages(): Record<LogTab, number> {
  return { game: Number.MAX_SAFE_INTEGER, audit: Number.MAX_SAFE_INTEGER };
}

function projectPublicCarries(pieces: TablePiece[], carries: PublicCarry[]): TablePiece[] {
  let result = pieces;
  for (const carry of carries) {
    result = result
      .map((piece) => {
        const count = carry.withdrawnCounts[piece.id] ?? 0;
        return count ? { ...piece, items: piece.items.slice(0, Math.max(0, piece.items.length - count)) } : piece;
      })
      .filter((piece) => piece.id !== carry.held.id);
    result = [...result, carry.held];
  }
  return result;
}

function settledRequest(message: GameSubscriptionEvent): { id: string; outcome: 'completed' | 'rejected' } | null {
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

/* A carry the table ended before its piece left the hand; the player has to pick it up again. */
const pausedWhileHeld = 'The table paused while you held a piece. Pick it up again to continue.';

type LocalCarry = {
  id: string;
  sourceId: string;
  draft: DraftMove;
  granted: boolean;
  pendingDrop?: string;
  /* The drop was released while the table could not send it, such as during a resync; it goes out once the table can act again. */
  dropUnsent?: true;
  /* A resync completed the drop before the tab holds its snapshot, so the draft keeps the piece where it landed until the fresh view. */
  landed?: true;
};
export type TableProjection = {
  viewer: Viewer;
  snapshot: GameSnapshot;
  liveRevision: number;
  playback: { step: number; lastStep: number } | null;
  historyPending: boolean;
  canInteract: boolean;
  /* Whether the viewer may handle the table's pieces: acting, at a stage whose table can change. A finished game, or one still drafting or trading, keeps its table as it is. */
  canHandleTable: boolean;
  /* The connection is being restored: this is the last live table, read-only, until a fresh view replaces it. */
  reconnecting: boolean;
  /* A seat command is on its way; the bar holds its buttons until the table answers. */
  seatCommandPending: boolean;
  /* How many of this viewer's own Traitor gathers the table has completed, so the camera can follow the pile they made. */
  traitorsGathered: number;
  phaseCooling: boolean;
  battleCountdownSeconds: number;
  state: TableState;
  renderedPieces: TablePiece[];
  selectedPiece: TablePiece | null;
  affordances: Affordance[];
  /* The piece menu's bank and deck actions, present only while this viewer can act. */
  bankControls?: {
    canCollect(pieceId: string): boolean;
    collect(pieceId: string): void;
  };
  deckControls?: {
    recipients: { id: string; name: string }[];
    draw(pieceId: string, recipient?: string): void;
    shuffle(pieceId: string): void;
  };
  remoteCarriedIds: ReadonlySet<string>;
  reservedPieceIds: ReadonlySet<string>;
  gestureActivePieceId: string | null;
  hoveredPieceId: string | null;
  flippingPieceIds: ReadonlyMap<string, number>;
  /* Only a derived table reads server time, because the view that derived it anchored the clock. */
  serverNow: () => number;
};

export type ConnectionView = {
  status: GameSubscription['status'];
  conversations: ConversationView;
  error: string | null;
  table: TableProjection | null;
  catalogue?: Extract<ServerMessage, { type: 'catalogue' }>;
  spiceHistory?: Extract<ServerMessage, { type: 'spice-history' }>;
  logHistory: Partial<Record<LogTab, LogPage>>;
};
export type LogPage = Extract<ServerMessage, { type: 'log-history' }>;

/* How often a table hearing only pointer moves re-saves its kept copy, so a reload knows it was live recently. */
const POINTER_KEEP_INTERVAL_MS = 5000;

/* A table a reloaded tab kept from its last visit: read-only, with nothing in hand or in motion, until a fresh view replaces it. */
function storedProjection({ viewer, snapshot, serverNow }: StoredTable): TableProjection {
  const state = {
    ...tableForViewer(snapshot, viewer.viewerSeat),
    factionTieBreaks: snapshotFactionTieBreaks(snapshot),
    selectedPieceId: null,
    draftMove: null,
  };
  return {
    viewer,
    snapshot,
    liveRevision: snapshot.revision,
    playback: null,
    historyPending: false,
    canInteract: false,
    canHandleTable: false,
    reconnecting: true,
    seatCommandPending: false,
    traitorsGathered: 0,
    phaseCooling: false,
    battleCountdownSeconds: 0,
    state,
    renderedPieces: renderedPiecesFor(state),
    selectedPiece: null,
    affordances: [],
    remoteCarriedIds: new Set(),
    reservedPieceIds: new Set(),
    gestureActivePieceId: null,
    hoveredPieceId: null,
    flippingPieceIds: new Map(),
    serverNow: () => serverNow,
  };
}

/** Owns local interactions and presentation over the subscribed server view. */
export class TableSession {
  private readonly listeners = new Set<() => void>();
  private readonly pointerListeners = new Set<() => void>();
  private shownPointers: PublicPointer[] = [];
  private tickTimer: ReturnType<typeof setInterval> | undefined;
  private poseTimer: ReturnType<typeof setTimeout> | undefined;
  private pointerTimer: ReturnType<typeof setTimeout> | undefined;
  private error: string | null = null;
  private history: Extract<ServerMessage, { type: 'history' }> | null = null;
  private pendingHistory: number | null = null;
  /* The live room's newest history step, which grows while a viewer sits in playback. */
  private liveHistorySteps = 0;
  private epoch = '';
  private seq = 0;
  private selectedId: string | null = null;
  private hoveredId: string | null = null;
  private carry: LocalCarry | null = null;
  private carries: PublicCarry[] = [];
  private pointers: PublicPointer[] = [];
  private flipping = new Map<string, number>();
  private readonly pendingFlips = new Map<string, string>();
  private pointer: Vector3Tuple | null = null;
  private cached: ConnectionView;
  private catalogueRequestId?: string;
  private catalogueSelection?: SpawnSelection;
  /* The Worker captures one catalogue read or spawn request per connection at a time; this is the id it holds. */
  private captureInFlight: string | null = null;
  /* One seat command at a time: a second click before the first settles would only fail the revision gate. */
  private seatCommandInFlight: string | null = null;
  private traitorGatherInFlight: string | null = null;
  /* Set when a held piece went back to the table without a drop; the next view shows it, since a fresh view clears older errors. */
  private droppedCarryNotice: string | null = null;
  /* The last live table, kept read-only while a lost connection is restored; its clock stops when the connection drops, not at the last update. */
  private lastLive: { table: TableProjection; serverNow?: () => number } | null = null;
  /* The server's own view of the last live table, which a reload of this tab shows until a fresh view arrives (#1746). */
  private kept: Omit<StoredTable, 'pending'> | null = null;
  private traitorsGathered = 0;
  private queuedCatalogue: { requestId: string; selection?: SpawnSelection } | null = null;
  private phaseCooldownUntil = 0;
  private keptOnPointersAt = Number.NEGATIVE_INFINITY;
  private battleCountdownUntil = 0;
  private pendingBattlePlan: { commandId: string; battleId: string; patch: Partial<BattlePlanInput> } | null = null;
  private queuedBattlePlan: { battleId: string; patch: Partial<BattlePlanInput> } | null = null;
  private queuedBattleReady: Extract<PieceAction, { kind: 'battle-ready' }> | null = null;
  private catalogueResult?: Extract<ServerMessage, { type: 'catalogue' }>;
  private spiceHistory?: Extract<ServerMessage, { type: 'spice-history' }>;
  private spiceHistoryBefore?: number;
  private logHistory: Partial<Record<LogTab, LogPage>> = {};
  private logHistoryBefore: Record<LogTab, number> = latestLogPages();

  constructor(
    readonly game: string,
    requestTicket: typeof requestPlayTicket,
    private readonly runtime: GameRuntime = browserGameRuntime
  ) {
    this.subscription = new GameSubscription(game, requestTicket, runtime);
    this.conversations = new ConversationSession(
      (message) => this.subscription.send(message),
      () => this.emit(),
      runtime.monotonicNow
    );
    this.restore();
    this.cached = {
      status: 'connecting',
      error: null,
      table: this.derive(),
      conversations: this.conversations.view(),
      logHistory: {},
    };
  }
  /*
   * Only into the read-only last table, never into the subscription: a stored base that an update could patch would pass for live.
   * The subscription's first view replaces it, and its `ready` stays false until then, so nothing is sent from it.
   */
  private restore() {
    const stored = this.lastLive || this.saved ? null : this.runtime.tables?.read(this.game);
    if (!stored) {
      return;
    }
    this.conversations.resume(stored.snapshot, stored.viewer, stored.pending);
    this.kept = {
      viewer: stored.viewer,
      snapshot: stored.snapshot,
      serverNow: stored.serverNow,
      ...(stored.liveAt === undefined ? {} : { liveAt: stored.liveAt }),
    };
    this.lastLive = { table: storedProjection(stored), serverNow: () => stored.serverNow };
  }
  /* A table that hears only pointers still stamps its saved copy as live, now and then rather than on every move. */
  private keepWhilePointersMove() {
    const now = this.runtime.monotonicNow();
    if (now - this.keptOnPointersAt >= POINTER_KEEP_INTERVAL_MS) {
      this.keptOnPointersAt = now;
      this.keep();
    }
  }
  private keep() {
    const live = this.subscription.getSnapshot();
    if (this.status === 'denied') {
      this.kept = null;
      this.runtime.tables?.clear(this.game);
      return;
    }
    const isLive = this.status === 'authorized' && live !== null;
    if (isLive) {
      this.kept = { viewer: live.viewer, snapshot: live.snapshot, serverNow: this.subscription.serverNow() };
    }
    if (this.kept) {
      this.runtime.tables?.save(this.game, { ...this.kept, pending: this.conversations.unconfirmed() }, isLive);
    }
  }
  readonly conversations: ConversationSession;
  private readonly subscription: GameSubscription;
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
    const table = this.cached.table;
    if (!table) {
      throw new Error('The table is not authorized.');
    }
    return table;
  }
  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };
  getSnapshot = () => this.cached;
  /*
   * The other players' pointers, apart from the table: they move many times a second, and only the scene's hands follow them,
   * so an update that moves nothing else leaves the table, and everything that reads it, as it was.
   */
  subscribePointers = (listener: () => void) => {
    this.pointerListeners.add(listener);
    return () => this.pointerListeners.delete(listener);
  };
  getPointers = () => this.shownPointers;
  private emitPointers() {
    const next = this.status === 'authorized' ? this.activityForView().pointers : [];
    if (
      next.length === this.shownPointers.length &&
      next.every((pointer, index) => pointer === this.shownPointers[index])
    ) {
      return;
    }
    this.shownPointers = next;
    for (const listener of this.pointerListeners) {
      listener();
    }
  }
  /* An update that moved only pointers: the room, the carries and every countdown the table shows are as the last frame left them. */
  private movesOnlyPointers(message: Extract<GameSubscriptionEvent, { type: 'view' }>) {
    const table = this.cached.table;
    return (
      !message.snapshotChanged &&
      message.previous !== null &&
      this.status === 'authorized' &&
      table !== null &&
      !table.reconnecting &&
      message.epoch === this.epoch &&
      message.carries === this.carries &&
      table.phaseCooling === this.phaseCooling() &&
      table.battleCountdownSeconds === this.battleCountdownSeconds()
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
    if (!table.playback && !table.historyPending) {
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
    const { table, serverNow } = this.lastLive;
    const state = { ...table.state, draftMove: null };
    const renderedPieces = renderedPiecesFor(state);
    return {
      ...table,
      reconnecting: true,
      canInteract: false,
      canHandleTable: false,
      seatCommandPending: false,
      phaseCooling: false,
      state,
      renderedPieces,
      selectedPiece: null,
      affordances: [],
      bankControls: undefined,
      deckControls: undefined,
      remoteCarriedIds: new Set(),
      reservedPieceIds: new Set(),
      gestureActivePieceId: null,
      hoveredPieceId: null,
      flippingPieceIds: new Map(),
      serverNow,
    };
  }
  private liveTable(): TableProjection {
    const viewer = this.viewer!;
    const authoritative = this.history?.snapshot ?? this.snapshot;
    const pendingPlan =
      !this.history &&
      authoritative.battlePlan &&
      this.pendingBattlePlan &&
      authoritative.battle?.id === this.pendingBattlePlan.battleId
        ? {
            ...authoritative.battlePlan,
            ...this.pendingBattlePlan.patch,
            ...this.queuedBattlePlan?.patch,
          }
        : null;
    const displayed = pendingPlan
      ? {
          ...authoritative,
          battlePlan: pendingPlan,
          ...(authoritative.bank
            ? {
                bank: {
                  ...authoritative.bank,
                  balance: authoritative.bank.balance + authoritative.battlePlan!.spice - pendingPlan.spice,
                },
              }
            : {}),
        }
      : authoritative;
    const state = {
      ...tableForViewer(displayed, viewer.viewerSeat),
      factionTieBreaks: snapshotFactionTieBreaks(displayed),
      /* A selection made before handling closed is not shown, so nothing offers to act on it. */
      selectedPieceId: tableHandlingOpen(this.snapshot.stage) ? this.selectedId : null,
      draftMove: this.carry?.draft ?? null,
    };
    const { carries: remote } = this.activityForView();
    const local = this.localProjection(state);
    const canInteract = this.canAct();
    const canHandleTable = this.canHandle();
    const renderedPieces = projectPublicCarries(local.pieces, remote);
    const reservedPieceIds = new Set(remote.flatMap((carry) => carry.reservedIds));
    return {
      viewer,
      snapshot: displayed,
      liveRevision: this.snapshot.revision,
      playback: this.history
        ? { step: this.history.step, lastStep: Math.max(this.history.lastStep, this.liveHistorySteps) }
        : null,
      historyPending: this.pendingHistory !== null,
      canInteract,
      canHandleTable,
      reconnecting: false,
      seatCommandPending: this.seatCommandInFlight !== null,
      traitorsGathered: this.traitorsGathered,
      phaseCooling: this.phaseCooling(),
      battleCountdownSeconds: this.battleCountdownSeconds(),
      state,
      renderedPieces,
      selectedPiece: renderedPieces.find((piece) => piece.id === state.selectedPieceId) ?? null,
      affordances: affordancesFor({ ...state, pieces: renderedPieces }),
      bankControls:
        canHandleTable && displayed.bank
          ? {
              canCollect: (pieceId) => !reservedPieceIds.has(pieceId),
              collect: (pieceId) => this.command({ kind: 'bank-collect', pieceId }),
            }
          : undefined,
      deckControls: canHandleTable
        ? {
            recipients: Object.entries(snapshotFactionLabels(displayed)).map(([id, name]) => ({ id, name })),
            draw: (pieceId, recipient) => this.command({ kind: 'deck-draw', pieceId, recipient }),
            shuffle: (pieceId) => this.command({ kind: 'deck-shuffle', pieceId }),
          }
        : undefined,
      remoteCarriedIds: new Set(remote.map((carry) => carry.held.id)),
      reservedPieceIds,
      gestureActivePieceId: local.gestureActivePieceId,
      hoveredPieceId: this.hoveredId,
      flippingPieceIds: local.flippingPieceIds,
      serverNow: this.subscription.serverNow,
    };
  }
  private activityForView() {
    if (this.history) {
      return { carries: [], pointers: [] };
    }
    const connectionId = this.viewer?.connectionId;
    return {
      carries: this.carries.filter((carry) => carry.connectionId !== connectionId),
      pointers: this.pointers.filter((pointer) => pointer.connectionId !== connectionId),
    };
  }
  private localProjection(state: TableState) {
    const draft = this.carry?.draft;
    const pieces = renderedPiecesFor(state).map((piece) =>
      draft?.pieceId === piece.id ? { ...piece, position: draft.position, orientation: draft.orientation } : piece
    );
    return {
      pieces,
      gestureActivePieceId: this.carry && !this.carry.pendingDrop ? this.carry.sourceId : null,
      flippingPieceIds: new Map([
        ...this.flipping,
        ...[...this.pendingFlips.values()].map(
          (id) => [id, this.snapshot.table.pieces.find((piece) => piece.id === id)?.flipRevision ?? 0] as const
        ),
      ]),
    };
  }
  private emit() {
    this.keep();
    this.cached = {
      status: this.status,
      conversations: this.conversations.view(),
      error: this.error,
      table: this.derive(),
      catalogue: this.catalogueResult,
      spiceHistory: this.spiceHistory,
      logHistory: this.logHistory,
    };
    for (const listener of this.listeners) {
      listener();
    }
    this.emitPointers();
  }
  private canSend(message: Exclude<ClientMessage, { type: 'admit' | 'sync' }>): boolean {
    /* A seat command is the spectator's one way to act, so it passes without a seat; `command` holds it to a current view. */
    const seat = message.type === 'command' && isSeatAction(message.action);
    return this.status === 'authorized' && (isReadRequest(message) || seat || this.canAct());
  }
  private send(message: Exclude<ClientMessage, { type: 'admit' | 'sync' }>): boolean {
    return this.canSend(message) && this.subscription.send(message);
  }
  private receive(message: GameSubscriptionEvent) {
    const settled = settledRequest(message);
    if (settled) {
      this.settle(settled.id, settled.outcome, message.type === 'resync');
    }
    switch (message.type) {
      case 'connection':
        this.conversations.disconnected(this.status === 'denied');
        this.noteEndedCarry({
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
        const historySteps = message.historySteps ?? this.liveHistorySteps;
        const historyMoved = historySteps !== this.liveHistorySteps;
        this.liveHistorySteps = historySteps;
        if (!historyMoved && this.movesOnlyPointers(message)) {
          this.pointers = message.pointers;
          this.emitPointers();
          this.keepWhilePointersMove();
          return;
        }
        this.receiveRoomUpdate(message);
        break;
      default:
        if (this.status === 'authorized') {
          this.receiveAuthorizedUpdate(message);
        }
    }
    this.discardReplacedBattleCommands();
    this.flushQueues();
    this.emit();
  }
  private discardReplacedBattleCommands() {
    if (
      (this.pendingBattlePlan && this.saved?.battle?.id !== this.pendingBattlePlan.battleId) ||
      (this.queuedBattlePlan && this.saved?.battle?.id !== this.queuedBattlePlan.battleId) ||
      (this.queuedBattleReady && this.saved?.battle?.id !== this.queuedBattleReady.battleId)
    ) {
      this.pendingBattlePlan = null;
      this.queuedBattlePlan = null;
      this.queuedBattleReady = null;
    }
  }
  private settle(id: string, outcome: 'completed' | 'rejected', viewFollows: boolean) {
    if (viewFollows && this.carry?.pendingDrop === id) {
      this.carry = { ...this.carry, landed: true };
    } else if (this.carry && (this.carry.pendingDrop === id || (outcome === 'rejected' && this.carry.id === id))) {
      if (outcome === 'rejected') {
        this.send({ type: 'cancel', carryId: this.carry.id });
      }
      this.carry = null;
    }
    this.pendingFlips.delete(id);
    if (this.captureInFlight === id) {
      this.captureInFlight = null;
    }
    if (this.seatCommandInFlight === id) {
      this.seatCommandInFlight = null;
    }
    if (this.traitorGatherInFlight === id) {
      this.traitorGatherInFlight = null;
      if (outcome === 'completed') {
        this.traitorsGathered++;
      }
    }
    if (this.pendingBattlePlan?.commandId === id) {
      this.pendingBattlePlan = null;
      if (outcome === 'rejected') {
        this.queuedBattlePlan = null;
        this.queuedBattleReady = null;
      }
    }
  }
  private flushQueues() {
    if (!this.saved) {
      return;
    }
    this.flushDrop();
    this.flushCatalogue();
    this.flushBattlePlan();
    this.flushBattleReady();
  }
  private receiveAuthorizedUpdate(message: Exclude<GameSubscriptionEvent, { type: 'connection' | 'resync' | 'view' }>) {
    if (this.conversations.receive(message)) {
      return;
    }
    switch (message.type) {
      case 'log-history':
        if (message.before === this.logHistoryBefore[message.tab]) {
          this.logHistory = { ...this.logHistory, [message.tab]: message };
        }
        break;
      case 'spice-history':
        if (message.before === this.spiceHistoryBefore) {
          this.spiceHistory = message;
        }
        break;
      case 'catalogue':
        if (message.requestId === this.catalogueRequestId) {
          this.catalogueResult = { entries: this.catalogueResult?.entries, ...message };
        }
        break;
      case 'history':
        this.receiveHistory(message);
        break;
      case 'rejected':
        this.receiveRejection(message);
        break;
      case 'carry':
        this.receiveCarry(message);
        break;
      case 'metrics':
        break;
    }
  }
  private receiveHistory(message: Extract<ServerMessage, { type: 'history' }>) {
    if (this.pendingHistory !== message.step) {
      return;
    }
    this.history = message;
    this.pendingHistory = null;
  }
  private receiveRejection(message: Extract<ServerMessage, { type: 'rejected' }>) {
    this.error = message.message;
    if (this.pendingHistory !== null && message.requestId === 'message') {
      /*
       * A history read carries no id, so the Worker refuses it as 'message'. It never gets a history reply, so the
       * viewer stays on the checkpoint they were on and sees the reason instead of waiting.
       */
      this.pendingHistory = null;
    }
    if (message.requestId === this.catalogueRequestId) {
      /* A refused catalogue read never gets a catalogue reply; the picker shows the reason instead of waiting. */
      this.catalogueResult = {
        type: 'catalogue',
        requestId: message.requestId,
        entries: this.catalogueResult?.entries,
        contents: null,
        error: message.message,
      };
    }
  }
  private receiveCarry(message: Extract<ServerMessage, { type: 'carry' }>) {
    if (this.carry?.id !== message.carryId) {
      return;
    }
    const current = this.carry.draft;
    this.carry = {
      ...this.carry,
      granted: true,
      draft: { ...message.draft, position: current.position, orientation: current.orientation },
    };
  }
  private receiveRoomUpdate(message: Extract<GameSubscriptionEvent, { type: 'view' }>) {
    this.replaceActivity(message);
    if (message.snapshotChanged) {
      this.receiveView(message);
    }
    if (this.droppedCarryNotice) {
      this.error = this.droppedCarryNotice;
      this.droppedCarryNotice = null;
    }
    this.reconcileCarry();
  }
  /* A drop already sent may or may not have landed, so it asks the player to look; a drop still waiting to go out never left the hand, and one the server confirmed needs no notice. */
  private noteEndedCarry(notice: { held: string; placing: string }) {
    if (this.carry && !this.carry.landed) {
      this.droppedCarryNotice = this.carry.pendingDrop && !this.carry.dropUnsent ? notice.placing : notice.held;
    }
  }
  private replaceActivity(message: Extract<GameSubscriptionEvent, { type: 'view' }>) {
    if (this.epoch && message.epoch !== this.epoch) {
      this.noteEndedCarry({
        held: 'The room resumed. Pick up the piece again to continue.',
        placing: 'The room resumed as you placed a piece. Check where it landed.',
      });
      this.carry = null;
    }
    this.epoch = message.epoch;
    this.carries = message.carries;
    this.pointers = message.pointers;
  }
  private receiveView(message: Extract<GameSubscriptionEvent, { type: 'view' }>) {
    this.conversations.authority(message.snapshot, message.viewer);
    if (
      message.previous?.snapshot.bank?.factionId !== message.snapshot.bank?.factionId ||
      message.previous?.viewer.viewerSeat !== message.viewer.viewerSeat
    ) {
      this.clearActivity();
      this.replaceActivity(message);
    }
    this.error = null;
    this.acceptSnapshot(message.snapshot, message.previous?.snapshot);
    if (this.carry?.landed) {
      this.carry = null;
    }
  }
  private acceptSnapshot(snapshot: GameSnapshot, previous: GameSnapshot | undefined) {
    const oldPieces = previous?.table.pieces ?? [];
    const flips = new Map(this.flipping);
    for (const piece of snapshot.table.pieces) {
      const old = oldPieces.find((candidate) => candidate.id === piece.id);
      if (old && (old.flipRevision ?? 0) !== (piece.flipRevision ?? 0)) {
        flips.set(piece.id, piece.flipRevision ?? 0);
      }
    }
    this.flipping = new Map([...flips].filter(([id]) => snapshot.table.pieces.some((piece) => piece.id === id)));
  }
  private competingCarry(local: LocalCarry) {
    const sources = new Set([local.sourceId, ...local.draft.withdrawals.map((withdrawal) => withdrawal.sourcePieceId)]);
    return this.carries.some(
      (carry) => carry.connectionId !== this.viewer?.connectionId && carry.reservedIds.some((id) => sources.has(id))
    );
  }
  private reconcileCarry() {
    const local = this.carry;
    if (!local) {
      return;
    }
    if (local.granted) {
      if (!this.carries.some((carry) => carry.id === local.id)) {
        /* A drop still waiting to go out never reached the Worker, so the piece snaps back and the player is told why. */
        if (local.dropUnsent) {
          this.error = pausedWhileHeld;
        }
        this.carry = null;
      }
      return;
    }
    if (this.competingCarry(local)) {
      this.send({ type: 'cancel', carryId: local.id });
      this.selectedId = local.sourceId;
      this.carry = null;
      this.error = 'Another player picked up that source first.';
    }
  }
  private clearDisconnectedActivity() {
    this.logHistory = {};
    this.logHistoryBefore = latestLogPages();
    /* The Worker holds a capture for the connection, not the seat, so a seat change keeps it and a disconnect frees it. */
    this.captureInFlight = null;
    /* A catalogue read still unanswered goes again on the fresh connection, so the picker that stays on screen is not left checking. */
    const unanswered =
      this.catalogueRequestId !== undefined && this.catalogueResult?.requestId !== this.catalogueRequestId;
    this.queuedCatalogue = unanswered
      ? { requestId: this.catalogueRequestId!, selection: this.catalogueSelection }
      : null;
    this.clearActivity();
  }
  private clearActivity() {
    this.pendingBattlePlan = null;
    this.queuedBattlePlan = null;
    this.queuedBattleReady = null;
    this.seatCommandInFlight = null;
    this.traitorGatherInFlight = null;
    this.spiceHistory = undefined;
    this.spiceHistoryBefore = undefined;
    this.history = null;
    this.pendingHistory = null;
    this.liveHistorySteps = 0;
    this.carry = null;
    this.carries = [];
    this.pointers = [];
    this.pointer = null;
    clearTimeout(this.poseTimer);
    clearTimeout(this.pointerTimer);
    this.poseTimer = undefined;
    this.pointerTimer = undefined;
    this.pendingFlips.clear();
    this.flipping = new Map();
  }
  /* Each tab keeps the page it asked for through live updates; the newest page is the default and the reset. */
  readLogHistory = (tab: LogTab, before = this.logHistoryBefore[tab]) => {
    this.logHistoryBefore = { ...this.logHistoryBefore, [tab]: before };
    this.send({ type: 'log-history', tab, before });
  };
  readSpiceHistory = (before?: number) => {
    this.spiceHistoryBefore = before;
    this.spiceHistory = undefined;
    if (before !== undefined) {
      this.send({ type: 'spice-history', before });
    }
    this.emit();
  };
  /* Carries and pointers expire on the Worker, which broadcasts each removal; the tab keeps what the last frame held. */
  private readonly tickActivity = () => {
    this.conversations.tick();
    if (this.carry && !this.carry.pendingDrop) {
      this.send({ type: 'renew', carryId: this.carry.id });
    }
    if (this.pointer !== null && this.canAct()) {
      this.send({ type: 'pointer', seq: ++this.seq, position: this.pointer });
    }
    if (
      this.cached.table?.snapshot.battle?.stage === 'countdown' ||
      (this.cached.table?.phaseCooling && !this.phaseCooling())
    ) {
      this.emit();
    }
  };
  connect = () => {
    if (!this.lastLive && !this.kept) {
      this.restore();
      this.emit();
    }
    const stop = this.subscription.subscribe((event) => this.receive(event));
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
    return this.subscription.ready && this.saved !== null && this.history === null && this.pendingHistory === null;
  }
  private canAct() {
    return this.viewer?.viewerSeat !== SPECTATOR_SEAT && this.current();
  }
  private canHandle() {
    return this.canAct() && tableHandlingOpen(this.snapshot.stage);
  }
  requestHistory = (step: number) => {
    if (this.status !== 'authorized' || this.carry) {
      return;
    }
    if (!Number.isSafeInteger(step) || step < 0) {
      return;
    }
    this.publishPointer(null);
    this.pendingHistory = step;
    if (!this.send({ type: 'history', step })) {
      this.pendingHistory = null;
    }
    this.emit();
  };
  resumeLive = () => {
    this.history = null;
    this.pendingHistory = null;
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
  beginGesture = (sourceId: string, pickup: 'top' | 'whole') => {
    if (
      !this.canHandle() ||
      this.carry ||
      this.requireTable().reservedPieceIds.has(sourceId) ||
      this.requireTable().flippingPieceIds.has(sourceId)
    ) {
      return;
    }
    const piece = this.snapshot.table.pieces.find((candidate) => candidate.id === sourceId);
    if (!piece || gestureBlockReason(piece)) {
      return;
    }
    const draft = draftForGesture(piece, pickup);
    if (!draft) {
      return;
    }
    const id = crypto.randomUUID();
    if (draft.pieceId !== sourceId) {
      draft.pieceId = carryPieceId(id);
    }
    this.carry = { id, sourceId, draft, granted: false };
    this.selectedId = draft.pieceId;
    this.error = null;
    this.send({
      type: 'begin',
      carryId: id,
      sourcePieceId: sourceId,
      pickup,
      expectedVersion: this.snapshot.versions[sourceId] ?? 0,
    });
    this.emit();
  };
  private readonly flushPose = () => {
    clearTimeout(this.poseTimer);
    this.poseTimer = undefined;
    if (!this.carry || this.carry.pendingDrop) {
      return;
    }
    this.send({
      type: 'pose',
      carryId: this.carry.id,
      seq: ++this.seq,
      position: this.carry.draft.position,
      orientation: this.carry.draft.orientation,
    });
  };
  updateGesture = (position: Vector3Tuple) => {
    if (!this.carry || this.carry.pendingDrop) {
      return;
    }
    const draft = projectCarryAtPosition(this.requireTable().state, this.carry.draft, position);
    if (!draft) {
      return;
    }
    this.carry = { ...this.carry, draft };
    if (!this.poseTimer) {
      this.poseTimer = setTimeout(this.flushPose, 50);
    }
    this.emit();
  };
  finishGesture = (position: Vector3Tuple) => {
    if (!this.carry || this.carry.pendingDrop) {
      return;
    }
    this.updateGesture(position);
    this.flushPose();
    this.carry = { ...this.carry, pendingDrop: crypto.randomUUID(), dropUnsent: true };
    this.flushDrop();
    this.emit();
  };
  private flushDrop() {
    const carry = this.carry;
    if (!carry?.pendingDrop || !carry.dropUnsent) {
      return;
    }
    const sent = this.send({
      type: 'drop',
      carryId: carry.id,
      commandId: carry.pendingDrop,
      position: carry.draft.position,
      orientation: carry.draft.orientation,
    });
    if (sent) {
      const { dropUnsent: _unsent, ...rest } = carry;
      this.carry = rest;
    }
  }
  cancelDraft = () => {
    if (!this.carry || this.carry.pendingDrop) {
      return;
    }
    this.send({ type: 'cancel', carryId: this.carry.id });
    this.selectedId = this.carry.sourceId;
    this.carry = null;
    this.emit();
  };
  takeAdditionalFromTarget = () => {
    if (!this.carry || this.carry.pendingDrop) {
      return;
    }
    const donorPieceId = this.carry.draft.targetPieceId;
    if (!donorPieceId) {
      return;
    }
    this.flushPose();
    this.send({
      type: 'take',
      carryId: this.carry.id,
      requestId: crypto.randomUUID(),
      donorPieceId,
    });
  };
  /**
   * A newer selection waits until the capture in flight answers, and only the latest one is sent.
   * The picker keys its status on the latest request id, so a queued read shows as checking.
   */
  catalogue = (selection?: SpawnSelection) => {
    const requestId = crypto.randomUUID();
    this.catalogueRequestId = requestId;
    this.catalogueSelection = selection;
    this.queuedCatalogue = { requestId, selection };
    this.flushCatalogue();
    return requestId;
  };
  private flushCatalogue() {
    if (this.captureInFlight || !this.queuedCatalogue) {
      return;
    }
    const { requestId, selection } = this.queuedCatalogue;
    this.queuedCatalogue = null;
    if (this.send({ type: 'catalogue', requestId, selection })) {
      this.captureInFlight = requestId;
    }
  }
  editBattlePlan = (patch: Partial<BattlePlanInput>) => {
    if (!this.canAct() || !this.snapshot.battlePlan || !this.snapshot.battle) {
      return;
    }
    this.error = null;
    this.queuedBattlePlan = { battleId: this.snapshot.battle.id, patch: { ...this.queuedBattlePlan?.patch, ...patch } };
    this.flushBattlePlan();
    this.emit();
  };
  private flushBattlePlan() {
    const battle = this.snapshot.battle;
    const plan = this.snapshot.battlePlan;
    if (!this.canAct() || this.pendingBattlePlan || !this.queuedBattlePlan || !battle || !plan) {
      return;
    }
    const { strength: _strength, faces: _faces, pieces: _pieces, ...input } = plan;
    const commandId = crypto.randomUUID();
    const patch = this.queuedBattlePlan.patch;
    this.queuedBattlePlan = null;
    this.pendingBattlePlan = { commandId, battleId: battle.id, patch };
    this.send({
      type: 'command',
      commandId,
      expectedRevision: this.snapshot.revision,
      action: { kind: 'battle-plan', battleId: battle.id, plan: { ...input, ...patch } },
    });
  }
  private flushBattleReady() {
    if (this.canAct() && !this.pendingBattlePlan && !this.queuedBattlePlan && this.queuedBattleReady) {
      const ready = this.queuedBattleReady;
      this.queuedBattleReady = null;
      this.command(ready);
    }
  }
  command = (action: PieceAction) => {
    const seatCommand = isSeatAction(action) || isSwapAction(action);
    if (seatCommand && this.seatCommandInFlight) {
      return;
    }
    if (action.kind === 'battle-ready' && this.pendingBattlePlan) {
      this.queuedBattleReady = action;
      return;
    }
    if (
      !(isSeatAction(action) ? this.current() : this.canAct()) ||
      (this.carry && action.kind !== 'phase' && !isRemovalAction(action) && !isSeatAction(action))
    ) {
      return;
    }
    if (action.kind === 'flip' && this.requireTable().flippingPieceIds.has(action.pieceId)) {
      return;
    }
    if (action.kind === 'spawn-request' && this.captureInFlight) {
      /* The Worker would refuse it and the refusal would free the slot the earlier capture still holds. */
      this.error = 'A catalogue request is already in flight.';
      this.emit();
      return;
    }
    this.error = null;
    const commandId = crypto.randomUUID();
    if (action.kind === 'flip') {
      this.pendingFlips.set(commandId, action.pieceId);
    }
    if (!this.send({ type: 'command', commandId, action, expectedRevision: this.snapshot.revision })) {
      this.pendingFlips.delete(commandId);
      this.error = 'The connection closed before the action could be sent.';
    } else if (seatCommand) {
      this.seatCommandInFlight = commandId;
    } else if (action.kind === 'spawn-request') {
      this.captureInFlight = commandId;
    } else if (action.kind === 'traitors-gather' && this.traitorGatherInFlight === null && this.tabletopTraitors()) {
      /* A second click before the first settles is refused for its stale revision, so the first gather is the one to follow; with no Traitor left on the table there is no pile to look at. */
      this.traitorGatherInFlight = commandId;
    }
    this.emit();
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
    if (this.carry && !this.carry.pendingDrop) {
      this.carry = {
        ...this.carry,
        draft: { ...this.carry.draft, orientation: this.carry.draft.orientation - (direction * Math.PI) / 12 },
      };
      this.updateGesture(this.carry.draft.position);
      this.flushPose();
      this.emit();
      return;
    }
    const pieceId = this.target(id);
    if (pieceId) {
      this.command({ kind: 'rotate', pieceId, direction });
    }
  };
  flipSelected = (id?: string) => {
    if (!this.canAct()) {
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
    if (this.flipping.get(pieceId) !== revision) {
      return;
    }
    this.flipping = new Map(this.flipping);
    this.flipping.delete(pieceId);
    this.emit();
  };
  publishPointer = (position: Vector3Tuple | null) => {
    if (!this.canAct()) {
      this.pointer = null;
      clearTimeout(this.pointerTimer);
      this.pointerTimer = undefined;
      return;
    }
    this.pointer = position && tablePositionSchema.safeParse(position).success ? position : null;
    if (this.pointer === null) {
      clearTimeout(this.pointerTimer);
      this.pointerTimer = undefined;
      this.send({ type: 'pointer', seq: ++this.seq, position: null });
    } else if (!this.pointerTimer) {
      this.pointerTimer = setTimeout(() => {
        this.pointerTimer = undefined;
        this.send({ type: 'pointer', seq: ++this.seq, position: this.pointer });
      }, 50);
    }
  };
}
