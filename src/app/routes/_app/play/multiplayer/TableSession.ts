import type { BattlePlanInput } from '@shared/play/battle';
import type { SpawnSelection } from '@shared/play/inventory';
import type { LogTab } from '@shared/play/log';
import { affordancesFor, dropPositionFor, gestureBlockReason, zoneById } from '@shared/play/model';
import type { DraftMove, TablePiece, TableState, Vector3Tuple } from '@shared/play/model';
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

type LocalCarry = {
  id: string;
  sourceId: string;
  draft: DraftMove;
  granted: boolean;
  pendingDrop?: string;
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
  /* A seat command is on its way; the bar holds its buttons until the table answers. */
  seatCommandPending: boolean;
  phaseCooling: boolean;
  battleCountdownSeconds: number;
  state: TableState;
  renderedPieces: TablePiece[];
  pointers: PublicPointer[];
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

/** Owns local interactions and presentation over the subscribed server view. */
export class TableSession {
  private readonly listeners = new Set<() => void>();
  private tickTimer: ReturnType<typeof setInterval> | undefined;
  private poseTimer: ReturnType<typeof setTimeout> | undefined;
  private pointerTimer: ReturnType<typeof setTimeout> | undefined;
  private error: string | null = null;
  private history: Extract<ServerMessage, { type: 'history' }> | null = null;
  private pendingHistory: number | null = null;
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
  /* The Worker captures one catalogue read or spawn request per connection at a time; this is the id it holds. */
  private captureInFlight: string | null = null;
  /* One seat command at a time: a second click before the first settles would only fail the revision gate. */
  private seatCommandInFlight: string | null = null;
  private queuedCatalogue: { requestId: string; selection?: SpawnSelection } | null = null;
  private phaseCooldownUntil = 0;
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
    this.cached = {
      status: 'connecting',
      error: null,
      table: null,
      conversations: this.conversations.view(),
      logHistory: {},
    };
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
  private derive(): TableProjection | null {
    if (this.status !== 'authorized') {
      return null;
    }
    if (!this.saved || !this.viewer) {
      return null;
    }
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
      ...tableForViewer(displayed, this.viewer.viewerSeat),
      selectedPieceId: this.selectedId,
      draftMove: this.carry?.draft ?? null,
    };
    const { carries: remote, pointers } = this.activityForView();
    const local = this.localProjection(state);
    return {
      viewer: this.viewer,
      snapshot: displayed,
      liveRevision: this.snapshot.revision,
      playback: this.history ? { step: this.history.step, lastStep: this.history.lastStep } : null,
      historyPending: this.pendingHistory !== null,
      canInteract: this.canAct(),
      seatCommandPending: this.seatCommandInFlight !== null,
      phaseCooling: this.runtime.monotonicNow() < this.phaseCooldownUntil,
      battleCountdownSeconds: Math.max(0, Math.ceil((this.battleCountdownUntil - this.runtime.monotonicNow()) / 1000)),
      state,
      renderedPieces: projectPublicCarries(local.pieces, remote),
      pointers,
      remoteCarriedIds: new Set(remote.map((carry) => carry.held.id)),
      reservedPieceIds: new Set(remote.flatMap((carry) => carry.reservedIds)),
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
      case 'activity':
        this.receiveRoomUpdate(message);
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
  private receiveRoomUpdate(message: Extract<GameSubscriptionEvent, { type: 'view' | 'activity' }>) {
    this.replaceActivity(message);
    if (message.type === 'view' && message.snapshotChanged) {
      this.receiveView(message);
    }
    this.reconcileCarry();
  }
  private replaceActivity(message: Extract<GameSubscriptionEvent, { type: 'view' | 'activity' }>) {
    if (this.epoch && message.epoch !== this.epoch) {
      if (this.carry) {
        this.error = 'The room resumed. Pick up the piece again to continue.';
      }
      this.carry = null;
    }
    this.epoch = message.epoch;
    this.carries = message.carries;
    this.pointers = message.pointers;
  }
  private receiveView(message: Extract<GameSubscriptionEvent, { type: 'view' }>) {
    this.conversations.authority(
      message.conversations ? message.snapshot : { ...message.snapshot, stage: undefined },
      message.viewer
    );
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
    this.queuedCatalogue = null;
    this.clearActivity();
  }
  private clearActivity() {
    this.pendingBattlePlan = null;
    this.queuedBattlePlan = null;
    this.queuedBattleReady = null;
    this.seatCommandInFlight = null;
    this.spiceHistory = undefined;
    this.spiceHistoryBefore = undefined;
    this.history = null;
    this.pendingHistory = null;
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
      (this.cached.table?.phaseCooling && this.runtime.monotonicNow() >= this.phaseCooldownUntil)
    ) {
      this.emit();
    }
  };
  connect = () => {
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
      this.emit();
    };
  };
  private current() {
    return this.subscription.ready && this.saved !== null && this.history === null && this.pendingHistory === null;
  }
  private canAct() {
    return this.viewer?.viewerSeat !== SPECTATOR_SEAT && this.current();
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
    if (!this.canAct()) {
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
      !this.canAct() ||
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
    const commandId = crypto.randomUUID();
    this.carry = { ...this.carry, pendingDrop: commandId };
    this.send({
      type: 'drop',
      carryId: this.carry.id,
      commandId,
      position: this.carry.draft.position,
      orientation: this.carry.draft.orientation,
    });
    this.emit();
  };
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
      (this.carry &&
        action.kind !== 'phase' &&
        action.kind !== 'turn' &&
        !isRemovalAction(action) &&
        !isSeatAction(action))
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
    }
    this.emit();
  };
  private target(id?: string) {
    return id ?? this.hoveredId ?? this.selectedId;
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
        draft: { ...this.carry.draft, orientation: this.carry.draft.orientation + (direction * Math.PI) / 12 },
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
  selectTurn = (turn: number) => this.command({ kind: 'turn', turn });
  spawnSpice = (count: number) => this.command({ kind: 'spice-spawn', count });
  reset = () => this.command({ kind: 'reset' });
  finishPieceFlip = (pieceId: string, revision: number) => {
    if (this.flipping.get(pieceId) !== revision) {
      return;
    }
    this.flipping = new Map(this.flipping);
    this.flipping.delete(pieceId);
    this.emit();
  };
  stageSelectedToZone = (zoneId: string) => {
    if (!this.canAct()) {
      return;
    }
    const piece = this.snapshot.table.pieces.find((candidate) => candidate.id === this.selectedId);
    const zone = zoneById(zoneId);
    if (!piece || !zone) {
      return;
    }
    this.beginGesture(piece.id, 'whole');
    this.finishGesture(dropPositionFor(zone, piece));
  };
  commitDraft = () => {
    if (this.carry) {
      this.finishGesture(this.carry.draft.position);
    }
  };
  renderedPositionFor = (piece: TablePiece): Vector3Tuple => piece.position;
  renderedOrientationFor = (piece: TablePiece) => piece.orientation;
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
  affordances = () => affordancesFor({ ...this.requireTable().state, pieces: this.requireTable().renderedPieces });
}
