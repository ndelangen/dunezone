import { tableHandlingOpen } from '@shared/play/admission';
import { isBattleLeader } from '@shared/play/battle';
import type { BattlePlanInput } from '@shared/play/battle';
import { foldedTurns, rotatedPiece } from '@shared/play/commands';
import { snapshotFactionLabels, snapshotFactionTieBreaks } from '@shared/play/factionLabels';
import type { SpawnSelection } from '@shared/play/inventory';
import type { LogTab } from '@shared/play/log';
import { affordancesFor, gestureBlockReason } from '@shared/play/model';
import type { DraftMove, TablePiece, TableState, Vector3Tuple } from '@shared/play/model';
import { isSeatAction } from '@shared/play/participation';
import { rearrangeable } from '@shared/play/peeking';
import type { Peek } from '@shared/play/peeking';
import { piecesOnPlates } from '@shared/play/pointerRiders';
import { carryPieceId, TABLE_PING_INTERVAL_MS, tableForViewer } from '@shared/play/protocol';
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
import { CARRY_FLIPS_LIMIT, SPECTATOR_SEAT, tablePositionSchema } from '@shared/play/schema';
import { isSwapAction } from '@shared/play/swapping';
import {
  draftForGesture,
  heldPieceFor,
  canFlipInHand,
  projectCarryAtPosition,
  renderedPiecesFor,
} from '@shared/play/tableState';

import { BattleQueue } from './BattleQueue';
import { ConversationSession } from './ConversationSession';
import type { ConversationView } from './ConversationSession';
import type { GameRuntime } from './runtime';
import type { StoredTable } from './storedTable';
import { TablePages } from './TablePages';
import { pickupRidersOf, remoteViewOf, sameForPanels, storedProjection } from './tableProjection';
import type { ConnectionView, TableProjection } from './tableProjection';

export type { ConnectionView, TableProjection } from './tableProjection';
import { isReadRequest } from './TableSubscription';
import type { TableSubscription, TableSubscriptionEvent } from './TableSubscription';

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

/* A carry the table ended before its piece left the hand; the player has to pick it up again. */
const pausedWhileHeld = 'The table paused while you held a piece. Pick it up again to continue.';

/* A drop that never flipped in hand sends no count, as it did before flipping in hand. */
/** A face-up item this page has no front for yet. */
function lacksShownFace(item: TablePiece['items'][number]) {
  return item.faceUp && !item.artwork?.front;
}

function flipsOf(draft: DraftMove) {
  return draft.flips ? { flips: draft.flips } : {};
}

/* How many of this page's commands may wait on the room at once before a further one is dropped. */
const UNANSWERED_COMMANDS_LIMIT = 4;

/* A turn of a piece at rest in 15° steps, clockwise positive; `released` once the key is up but the turn is still to go out. */
type Turn = { pieceId: string; turns: number; released?: boolean };

type LocalCarry = {
  id: string;
  sourceId: string;
  draft: DraftMove;
  granted: boolean;
  pendingDrop?: string;
  /* The drop was released while the table could not send it, such as during a resync; it goes out once the table can act again. */
  dropUnsent?: true;
  /* The held piece as the room last answered a flip with it, which shows any face turned up in hand. */
  revealed?: TablePiece;
  /* A resync completed the drop before the tab holds its snapshot, so the draft keeps the piece where it landed until the fresh view. */
  landed?: true;
};
/** What the hand takes from the table: one loose, unlocked card or battle leader, not something already in an inventory. */
function takeableIntoHand(piece: TablePiece) {
  return (
    !piece.inventory && !piece.locked && piece.items.length === 1 && (piece.kind === 'card' || isBattleLeader(piece))
  );
}

/* Each faction a deck can deal to, with its token art for the deal ring. */
function dealRecipients(snapshot: GameSnapshot) {
  const artwork = snapshot.factionArtwork ?? {};
  return Object.entries(snapshotFactionLabels(snapshot)).map(([id, name]) => ({ id, name, artwork: artwork[id] }));
}

/* The same requests in the same order: conversation sends keep their request objects while they wait. */
function sameRequests(a: readonly unknown[], b: readonly unknown[]) {
  return a.length === b.length && a.every((request, index) => request === b[index]);
}

function stampedLiveSince(saved: { live: boolean; at: number }, now: number) {
  return saved.live && now - saved.at < LIVE_RESTAMP_INTERVAL_MS;
}

/* The same table and the same waiting messages as a save that already went out. */
function sameSave(
  saved: Pick<StoredTable, 'viewer' | 'snapshot'> & { pending: readonly unknown[] },
  table: Pick<StoredTable, 'viewer' | 'snapshot'>,
  pending: readonly unknown[]
) {
  return saved.viewer === table.viewer && saved.snapshot === table.snapshot && sameRequests(saved.pending, pending);
}

/* Commands a held piece does not hold back: a phase change, a removal, a seat, and letting go of a peek, which the room allows mid-carry. */
function passesCarry(action: PieceAction) {
  return action.kind === 'phase' || action.kind === 'peek-close' || isRemovalAction(action) || isSeatAction(action);
}

/* A deck's cards as they stand, by id; the room gives every card a new id whenever it rearranges the deck. */
function deckKey(piece: TablePiece) {
  return piece.items.map((item) => item.id).join(',');
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

function notify(listeners: ReadonlySet<() => void>) {
  for (const listener of listeners) {
    listener();
  }
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

/* A value built from some keys, kept while every key stays the same, so whoever holds it sees no new identity. */
type Cached<T> = { keys: readonly unknown[]; value: T };

function cachedBy<T>(cached: Cached<T> | undefined, keys: readonly unknown[], build: () => T): Cached<T> {
  const same = cached && cached.keys.length === keys.length && cached.keys.every((key, at) => key === keys[at]);
  return same ? cached : { keys, value: build() };
}

/* How often a live table whose saved copy is otherwise unchanged stamps that copy as live again. */
const LIVE_RESTAMP_INTERVAL_MS = 5000;

/* A position the table can hold, or null for one off it. */
function onTable(position: Vector3Tuple | null) {
  return position && tablePositionSchema.safeParse(position).success ? position : null;
}

/** Owns local interactions and presentation over the subscribed server view. */
export class TableSession {
  private readonly listeners = new Set<() => void>();
  private readonly pointerListeners = new Set<() => void>();
  private readonly pingListeners = new Set<(ping: TablePing) => void>();
  /* When this page last pinged, by its monotonic clock; -Infinity before the first. */
  private pingedAt = Number.NEGATIVE_INFINITY;
  private readonly tableListeners = new Set<() => void>();
  private readonly countdownListeners = new Set<() => void>();
  private shownCountdown = 0;
  /* The table as the last update derived it, which the session itself and the scene read. */
  private table: TableProjection | null = null;
  /* The last table there was, which the scene keeps reading while its parent takes it off the page. */
  private shownTable: TableProjection | null = null;
  private shownPointers: PublicPointer[] = [];
  /* Cancels the frame at which the scene hears of a held piece's latest move; set only while one is waiting. */
  private cancelTableFrame: (() => void) | undefined;
  private tickTimer: ReturnType<typeof setInterval> | undefined;
  private poseTimer: ReturnType<typeof setTimeout> | undefined;
  private pointerTimer: ReturnType<typeof setTimeout> | undefined;
  private error: string | null = null;
  private history: Extract<ServerMessage, { type: 'history' }> | null = null;
  private historyClock: (() => number) | null = null;
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
  /* The turn-over a piece in hand is playing, kept apart from the table's flips: a drawn card's id is the carry's own, and a cancelled carry's turn no longer matters. */
  private handFlip: { carryId: string; pieceId: string; revision: number } | null = null;
  /* The commands this page sent that the room has not answered yet. */
  private readonly unanswered = new Set<string>();
  /* A rotation held on a piece at rest turns it on this page only, and goes out as one command when the key comes up. */
  private turning: Turn | null = null;
  /* Rotations sent and not yet answered, by command, shown until the frame that settles them. */
  private readonly sentTurns = new Map<string, Turn>();
  /* Sent turns the room has done whose new table is still on its way after a resync; they show until it arrives. */
  private readonly doneTurns = new Set<string>();
  private pointer: Vector3Tuple | null = null;
  /* The table, board or rim surface under the cursor, where a ping lands so every viewer sees it at the same spot. */
  private pingPoint: Vector3Tuple | null = null;
  private cached: ConnectionView;
  private catalogueRequestId?: string;
  private catalogueSelection?: SpawnSelection;
  /* The Worker captures one catalogue read or spawn request per connection at a time; this is the id it holds. */
  private captureInFlight: string | null = null;
  /* The order this viewer asked for the deck it holds open, shown until the room answers it. */
  private pendingArrangement: { commandId: string; pieceId: string; deck: string; order: number[] } | null = null;
  /*
   * The peek this viewer closed, hidden at once while the room confirms it.
   * The room's frame without the peek, a refused close, a dropped connection or asking to peek again each forget it,
   * so a later peek at the same piece, from this tab or another of the faction's, always shows.
   */
  private closedPeek: { pieceId: string; commandId: string } | null = null;
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
  private queuedCatalogue: { requestId: string; selection: SpawnSelection } | null = null;
  private phaseCooldownUntil = 0;
  /* What `keep` last handed the store, so an emit that changed nothing saved costs no write. */
  private lastSaved: {
    viewer: StoredTable['viewer'];
    snapshot: StoredTable['snapshot'];
    pending: readonly unknown[];
    live: boolean;
    at: number;
  } | null = null;
  private battleCountdownUntil = 0;
  private readonly battle: BattleQueue;
  private catalogueResult?: Extract<ServerMessage, { type: 'catalogue' }>;
  /* A capture never changes once a game holds it, so each answer is kept across reconnects. */
  private retainedBoard: GameSnapshot['board'];
  private readonly pages: TablePages;

  constructor(
    readonly game: string,
    private readonly subscription: TableSubscription,
    private readonly runtime: GameRuntime
  ) {
    this.conversations = new ConversationSession(
      (message) => this.subscription.send(message),
      () => this.emit(),
      runtime.monotonicNow
    );
    this.battle = new BattleQueue({
      canAct: () => this.canAct(),
      snapshot: () => this.snapshot,
      sendPlan: (commandId, battleId, plan, expectedRevision) =>
        this.send({ type: 'command', commandId, expectedRevision, action: { kind: 'battle-plan', battleId, plan } }),
      command: (action) => this.command(action),
      hasRoom: () => this.unanswered.size < UNANSWERED_COMMANDS_LIMIT,
    });
    this.pages = new TablePages(
      (message) => this.send(message),
      runtime.monotonicNow,
      () => this.emit()
    );
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
    const stored = this.lastLive || this.saved ? null : this.runtime.tables?.read(this.game);
    if (!stored) {
      return;
    }
    this.retainedBoard = stored.snapshot.board;
    this.conversations.resume(stored.snapshot, stored.viewer, stored.pending);
    this.kept = {
      viewer: stored.viewer,
      snapshot: stored.snapshot,
      serverNow: stored.serverNow,
      ...(stored.liveAt === undefined ? {} : { liveAt: stored.liveAt }),
    };
    this.lastLive = { table: storedProjection(stored), serverNow: () => stored.serverNow };
    /* A table kept from a reload has no countdown running. */
    this.setCountdown(0);
  }
  /*
   * Saves the table a reload of this tab shows. A carry, a hover or a pointer emits many times a second without changing
   * what is saved, so an unchanged table is only stamped as live again now and then, never written out on every move.
   */
  private keep() {
    if (this.status === 'denied') {
      this.kept = null;
      this.lastSaved = null;
      this.runtime.tables?.clear(this.game);
      return;
    }
    const live = this.status === 'authorized' ? this.subscription.getSnapshot() : null;
    const pending = this.conversations.unconfirmed();
    const now = this.runtime.monotonicNow();
    if (this.alreadySaved(live, pending, now)) {
      return;
    }
    if (live) {
      this.kept = { viewer: live.viewer, snapshot: live.snapshot, serverNow: this.subscription.serverNow() };
    }
    if (this.kept) {
      const { viewer, snapshot } = this.kept;
      this.lastSaved = { viewer, snapshot, pending, live: live !== null, at: now };
      this.runtime.tables?.save(this.game, { ...this.kept, pending }, live !== null);
    }
  }
  /* Whether the store already holds what `keep` would save: the same table and messages, and, for a live table, stamped live recently. */
  private alreadySaved(
    live: Pick<StoredTable, 'viewer' | 'snapshot'> | null,
    pending: readonly unknown[],
    now: number
  ) {
    const saved = this.lastSaved;
    if (!saved) {
      return false;
    }
    const table = live ?? this.kept;
    if (!table) {
      return false;
    }
    /* A table that went live or offline since is saved again, and a live one is stamped again once the interval passes. */
    const sameState = live ? stampedLiveSince(saved, now) : !saved.live;
    return sameState && sameSave(saved, table, pending);
  }
  readonly conversations: ConversationSession;
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
  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };
  /*
   * The connection and a table for the panels. While only held pieces move, the panels' table stays the one they have:
   * where a carried piece is on its way may lag there, and the scene, which shows it, reads `getTable` instead.
   */
  getSnapshot = () => this.cached;
  /* The live table, every move included, for the scene and the table's own controls. */
  subscribeTable = (listener: () => void) => {
    this.tableListeners.add(listener);
    return () => this.tableListeners.delete(listener);
  };
  getTable = () => this.shownTable;
  /*
   * The other players' pointers, apart from the table: they move many times a second, and only the scene's hands follow them,
   * so an update that moves nothing else leaves the table, and everything that reads it, as it was.
   */
  subscribePointers = (listener: () => void) => {
    this.pointerListeners.add(listener);
    return () => this.pointerListeners.delete(listener);
  };
  getPointers = () => this.shownPointers;
  /*
   * The battle countdown's whole seconds, apart from the table: they change every second while it runs, and only the number shows it,
   * so the panels around it render again only when the battle does.
   */
  subscribeBattleCountdown = (listener: () => void) => {
    this.countdownListeners.add(listener);
    return () => this.countdownListeners.delete(listener);
  };
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
      notify(this.countdownListeners);
    }
  }
  /* Each ping as it happens, this page's own included: nothing keeps them, so a listener hears only what comes after it subscribes. */
  subscribePings = (listener: (ping: TablePing) => void) => {
    this.pingListeners.add(listener);
    return () => this.pingListeners.delete(listener);
  };
  private emitPing(ping: TablePing) {
    for (const listener of this.pingListeners) {
      listener(ping);
    }
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
    this.emitPing(ping);
    return true;
  };
  /* This page's ping on the table surface under its cursor, while it has a cursor on the table and may act. */
  private pingHere(sound: PingSound | undefined): TablePing | null {
    if (!this.canAct()) {
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
    if (this.status === 'authorized' && this.current()) {
      this.emitPing(ping);
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
    for (const listener of this.pointerListeners) {
      listener();
    }
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
    const renderedPieces = piecesOnPlates(renderedPiecesFor(state), state.pieces);
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
      spiceReserveControls: undefined,
      deckControls: undefined,
      handControls: undefined,
      deleteControls: undefined,
      peek: null,
      peekControls: undefined,
      closePeek: undefined,
      remoteCarriedIds: new Set(),
      plateRiders: new Map(),
      reservedPieceIds: new Set(),
      gestureActivePieceId: null,
      hoveredPieceId: null,
      flippingPieceIds: new Map(),
      serverNow,
    };
  }
  private presentedSnapshot() {
    const received = this.history?.snapshot ?? this.snapshot;
    /* The board is captured once per game; history and reconnect messages decode fresh copies of that same definition. */
    this.retainedBoard ??= received.board;
    const authoritative = received.board === this.retainedBoard ? received : { ...received, board: this.retainedBoard };
    return this.battle.shown(authoritative, this.history !== null);
  }

  private liveTable(): TableProjection {
    const viewer = this.viewer!;
    const displayed = this.presentedSnapshot();
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
    const { renderedPieces, reservedPieceIds, ...remoteIds } = this.remoteView(local.pieces, remote, state.pieces);
    return {
      viewer,
      snapshot: displayed,
      liveRevision: this.snapshot.revision,
      playback: this.history
        ? {
            step: this.history.step,
            lastStep: Math.max(this.history.lastStep, this.liveHistorySteps),
            recordedAt: this.history.recordedAt,
          }
        : null,
      historyPending: this.pendingHistory !== null,
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
      spiceReserveControls: canHandleTable && displayed.bank ? this.spiceReserveControls : undefined,
      deckControls:
        canHandleTable && this.subscription.supportsCommand('deck-draw') ? this.deckControls(displayed) : undefined,
      deleteControls: this.deleteControls(canHandleTable),
      handControls: this.handControls(canHandleTable),
      /* A look back in time shows no peek: what a faction saw then is not what it holds open now. */
      peek:
        this.history || displayed.peek?.piece.id === this.closedPeek?.pieceId
          ? null
          : this.arrangedPeek(displayed.peek ?? null),
      peekControls: canHandleTable && displayed.bank ? this.peekControls : undefined,
      closePeek: canInteract && displayed.peek ? this.peekCloser(displayed.peek.piece.id) : undefined,
      ...remoteIds,
      reservedPieceIds,
      gestureActivePieceId: local.gestureActivePieceId,
      hoveredPieceId: this.hoveredId,
      flippingPieceIds: local.flippingPieceIds,
      serverNow: this.clockForView(),
    };
  }
  private clockForView() {
    return this.history ? this.historyClock! : this.subscription.serverNow;
  }
  /*
   * The piece menu's controls keep their identity from one table to the next while what they offer is the same,
   * so a carry moving many times a second leaves the open menu, a peeked deck and its rows as they are.
   * The controls that depend on nothing read the table as it is when they are used.
   */
  private readonly spiceReserveControls: NonNullable<TableProjection['spiceReserveControls']> = {
    canCollect: (pieceId) => this.table !== null && !this.table.reservedPieceIds.has(pieceId),
    collect: (pieceId) => this.command({ kind: 'bank-collect', pieceId }),
  };
  private readonly peekControls: NonNullable<TableProjection['peekControls']> = {
    peek: (pieceId) => {
      this.closedPeek = null;
      this.command({ kind: 'peek', pieceId });
    },
    arrange: (pieceId, order) => this.arrange(pieceId, order),
    pull: (pieceId, index) => this.pull(pieceId, index),
  };
  private readonly removal: NonNullable<TableProjection['deleteControls']> = {
    remove: (pieceId) => this.command({ kind: 'delete', pieceId }),
  };
  private readonly taking: NonNullable<TableProjection['handControls']> = {
    canTake: (pieceId) => {
      const piece = this.table?.state.pieces.find((entry) => entry.id === pieceId);
      return piece !== undefined && takeableIntoHand(piece);
    },
    take: (pieceId) => this.command({ kind: 'hand-take', pieceId }),
  };
  private dealing: Cached<NonNullable<TableProjection['deckControls']>> | undefined;
  private peekClosing: Cached<() => void> | undefined;
  /* The deal ring names the factions as the snapshot labels them and shows their art, so it is rebuilt only when those change. */
  private deckControls(displayed: GameSnapshot): TableProjection['deckControls'] {
    this.dealing = cachedBy(
      this.dealing,
      [displayed.roster, displayed.controls?.players, displayed.factionArtwork],
      () => ({
        recipients: dealRecipients(displayed),
        draw: (pieceId, recipient) => this.command({ kind: 'deck-draw', pieceId, recipient }),
        shuffle: (pieceId) => this.command({ kind: 'deck-shuffle', pieceId }),
      })
    );
    return this.dealing.value;
  }
  private peekCloser(pieceId: string) {
    this.peekClosing = cachedBy(this.peekClosing, [pieceId], () => () => this.closePeek(pieceId));
    return this.peekClosing.value;
  }
  private deleteControls(canHandleTable: boolean): TableProjection['deleteControls'] {
    return canHandleTable && this.subscription.supportsCommand('delete') ? this.removal : undefined;
  }
  private handControls(canHandleTable: boolean): TableProjection['handControls'] {
    return canHandleTable && this.subscription.supportsCommand('hand-take') ? this.taking : undefined;
  }
  /* Whether the peeked deck still shows the order this viewer asked for: the room has neither refused it nor sent the deck again. */
  private arrangementShown(peek: Peek | null) {
    const pending = this.pendingArrangement;
    return !!peek && pending?.pieceId === peek.piece.id && pending.deck === deckKey(peek.piece);
  }
  /* A close that never went out, as while reconnecting, leaves the peek showing, so its close button still works. */
  private closePeek(pieceId: string) {
    const commandId = this.command({ kind: 'peek-close' });
    if (commandId) {
      this.closedPeek = { pieceId, commandId };
      this.emit();
    }
  }
  private arrangedPeek(peek: Peek | null): Peek | null {
    if (!peek || !this.arrangementShown(peek)) {
      return peek;
    }
    const { order } = this.pendingArrangement!;
    return { ...peek, piece: { ...peek.piece, items: order.map((index) => peek.piece.items[index]!) } };
  }
  /* One change to a peeked deck at a time: the next waits for the room's frame, so its places count from the deck as the room holds it. */
  private deckSettled(pieceId: string) {
    const peek = this.snapshot.peek ?? null;
    /* A deck over the limit is only looked through: an arrangement of it would be refused before the room reads it. */
    return peek?.piece.id === pieceId && rearrangeable(peek.piece) && !this.arrangementShown(peek) ? peek : null;
  }
  private arrange = (pieceId: string, order: number[]) => {
    const peek = this.deckSettled(pieceId);
    const commandId = peek && this.command({ kind: 'peek-arrange', pieceId, order });
    if (peek && commandId) {
      this.pendingArrangement = { commandId, pieceId, deck: deckKey(peek.piece), order };
      this.emit();
    }
  };
  private pull = (pieceId: string, index: number) => {
    if (this.deckSettled(pieceId)) {
      this.command({ kind: 'peek-pull', pieceId, index });
    }
  };
  private remoteView(pieces: TablePiece[], carries: PublicCarry[], rested: TablePiece[]) {
    /* The live carries, this page's own among them, even while history is shown. */
    return remoteViewOf(pieces, carries, rested, {
      ownDraft: this.carry?.draft ?? null,
      pickupRiders: pickupRidersOf(this.carries),
    });
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
  /*
   * A face-down card turned face up in hand has no face on this page until the room answers the flip,
   * so the held piece borrows each face the room's answer shows.
   */
  private withRevealedFaces(held: TablePiece): TablePiece {
    const shown = this.carry?.revealed;
    if (!shown || !held.items.some(lacksShownFace)) {
      return held;
    }
    const faces = new Map(shown.items.map((item) => [item.id, item.artwork]));
    return {
      ...held,
      items: held.items.map((item) => {
        const face = faces.get(item.id);
        return lacksShownFace(item) && face?.front ? { ...item, artwork: face } : item;
      }),
    };
  }
  private localProjection(state: TableState) {
    const draft = this.carry?.draft;
    const pieces = renderedPiecesFor(state).map((piece) =>
      draft?.pieceId === piece.id
        ? this.withRevealedFaces({ ...piece, position: draft.position, orientation: draft.orientation })
        : this.withTurns(state, piece)
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
  /* The pending turns this page has on a piece, held and sent alike. */
  private turnsOf(pieceId: string) {
    let turns = this.turning?.pieceId === pieceId ? this.turning.turns : 0;
    for (const turn of this.sentTurns.values()) {
      if (turn.pieceId === pieceId) {
        turns += turn.turns;
      }
    }
    return foldedTurns(turns);
  }
  /* A piece this page is turning shows the turn before the room has it; one the turn no longer fits shows as the room has it. */
  private withTurns(state: TableState, piece: TablePiece) {
    /* A look back in time shows the table as it was, and a piece the room has locked, or a table it has closed, shows as the room has it. */
    const turns = this.history ? 0 : this.turnsOf(piece.id);
    return turns && this.turnablePiece(piece.id) ? (rotatedPiece(state, piece, turns) ?? piece) : piece;
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
      notify(this.listeners);
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
    notify(this.tableListeners);
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
      catalogue: this.catalogueResult,
      spiceHistory: this.pages.spiceHistory,
      logHistory: this.pages.logHistory,
      factions: this.pages.factions,
    };
    const changed = (Object.keys(next) as (keyof ConnectionView)[]).some((key) => next[key] !== previous[key]);
    this.cached = changed ? next : previous;
    return changed;
  }
  private canSend(message: Exclude<ClientMessage, { type: 'admit' | 'sync' }>): boolean {
    /* A seat command is the spectator's one way to act, so it passes without a seat; `command` holds it to a current view. */
    const seat = message.type === 'command' && isSeatAction(message.action);
    /* Putting a held piece back also passes while a resync pauses the table, so the Worker never keeps a piece the tab let go of. */
    const release = message.type === 'cancel' && this.carry !== null;
    return this.status === 'authorized' && (isReadRequest(message) || seat || release || this.canAct());
  }
  private send(message: Exclude<ClientMessage, { type: 'admit' | 'sync' }>): boolean {
    return this.canSend(message) && this.subscription.send(message);
  }
  private receive(message: TableSubscriptionEvent) {
    this.settleRequest(message);
    switch (message.type) {
      case 'connection':
        this.conversations.disconnected(this.status === 'denied');
        this.pendingArrangement = null;
        this.closedPeek = null;
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
    this.forgetSettledPeekClose();
    this.battle.discardReplaced(this.saved?.battle?.id);
    this.flushQueues();
    this.emit();
  }
  private settleRequest(message: TableSubscriptionEvent) {
    const settled = settledRequest(message);
    if (!settled) {
      return;
    }
    this.settle(settled.id, settled.outcome, message.type === 'resync');
    /* A refused close leaves the peek open, so it shows again. */
    if (settled.outcome === 'rejected' && settled.id === this.closedPeek?.commandId) {
      this.closedPeek = null;
    }
  }
  /* Once the table holds no open peek, the close went through and there is nothing left to hide. */
  private forgetSettledPeekClose() {
    if (this.closedPeek && !this.saved?.peek) {
      this.closedPeek = null;
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
    this.unanswered.delete(id);
    if (viewFollows && this.sentTurns.has(id)) {
      this.doneTurns.add(id);
    } else {
      this.sentTurns.delete(id);
    }
    /* Refused, the room's order shows again; done, the frame that settles it carries the deck as arranged. */
    if (this.pendingArrangement?.commandId === id) {
      this.pendingArrangement = null;
    }
    if (this.captureInFlight === id) {
      this.captureInFlight = null;
    }
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
    this.flushDrop();
    this.flushCatalogue();
    this.battle.flush();
    this.flushRotation();
  }
  /* A turn let go of while a resync paused the table goes out with the first current view. */
  private flushRotation() {
    if (this.turning?.released && this.current()) {
      this.finishRotation();
    }
  }
  private receiveAuthorizedUpdate(
    message: Exclude<TableSubscriptionEvent, { type: 'connection' | 'resync' | 'view' }>
  ) {
    if (this.conversations.receive(message)) {
      return;
    }
    switch (message.type) {
      case 'log-history':
      case 'spice-history':
      case 'faction':
        this.pages.receive(message);
        break;
      case 'catalogue':
        if (message.requestId === this.catalogueRequestId) {
          this.catalogueResult = message;
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
    const recordedAt = message.recordedAt ?? this.subscription.serverNow();
    this.historyClock = () => recordedAt;
    this.pendingHistory = null;
  }
  private receiveRejection(message: Extract<ServerMessage, { type: 'rejected' }>) {
    this.error = message.message;
    this.pages.forgetFactionReads();
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
      /* A flip made since this answer left the room is still counted here, and goes out on its own. */
      draft: {
        ...message.draft,
        position: current.position,
        orientation: current.orientation,
        flips: Math.max(current.flips ?? 0, message.draft.flips ?? 0),
      },
      ...(message.held ? { revealed: message.held } : {}),
    };
  }
  private receiveRoomUpdate(message: Extract<TableSubscriptionEvent, { type: 'view' }>) {
    this.replaceActivity(message);
    if (message.snapshotChanged) {
      for (const id of this.doneTurns) {
        this.sentTurns.delete(id);
      }
      this.doneTurns.clear();
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
  private replaceActivity(message: Extract<TableSubscriptionEvent, { type: 'view' }>) {
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
  private receiveView(message: Extract<TableSubscriptionEvent, { type: 'view' }>) {
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
    const oldRevisions = new Map(previous?.table.pieces.map((piece) => [piece.id, piece.flipRevision ?? 0]));
    const flips = new Map(this.flipping);
    for (const piece of snapshot.table.pieces) {
      const old = oldRevisions.get(piece.id);
      if (old !== undefined && old !== (piece.flipRevision ?? 0)) {
        flips.set(piece.id, piece.flipRevision ?? 0);
      }
    }
    const present = new Set(snapshot.table.pieces.map((piece) => piece.id));
    this.flipping = new Map([...flips].filter(([id]) => present.has(id)));
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
    this.pages.disconnected();
    /* The Worker holds a capture for the connection, not the seat, so a seat change keeps it and a disconnect frees it. */
    this.captureInFlight = null;
    /* A catalogue read still unanswered goes again on the fresh connection, so the picker that stays on screen is not left checking. */
    const unanswered =
      this.catalogueRequestId !== undefined && this.catalogueResult?.requestId !== this.catalogueRequestId;
    this.queuedCatalogue =
      unanswered && this.catalogueSelection
        ? { requestId: this.catalogueRequestId!, selection: this.catalogueSelection }
        : null;
    this.clearActivity();
  }
  private clearActivity() {
    this.battle.clear();
    this.seatCommandInFlight = null;
    this.traitorGatherInFlight = null;
    this.pages.closeSpiceHistory();
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
    this.handFlip = null;
    this.unanswered.clear();
    this.turning = null;
    this.sentTurns.clear();
    this.doneTurns.clear();
    this.flipping = new Map();
  }
  readLogHistory = (tab: LogTab, before?: number) => this.pages.readLog(tab, before);
  refreshLogHistory = (tab: LogTab) => this.pages.refreshLog(tab);
  readFaction = (factionId: string) => this.pages.readFaction(factionId);
  readSpiceHistory = (before?: number) => this.pages.readSpice(before);
  /* Carries and pointers expire on the Worker, which broadcasts each removal; the tab keeps what the last frame held. */
  private readonly tickActivity = () => {
    this.conversations.tick();
    if (this.carry && !this.carry.pendingDrop) {
      this.send({ type: 'renew', carryId: this.carry.id });
    }
    if (this.pointer !== null && this.canAct()) {
      this.send({ type: 'pointer', seq: ++this.seq, position: this.pointer });
    }
    if (this.table?.phaseCooling && !this.phaseCooling()) {
      this.emit();
    } else if (this.table?.snapshot.battle?.stage === 'countdown') {
      this.showCountdown();
    }
  };
  connect = () => {
    if (!this.lastLive && !this.kept) {
      this.restore();
      this.emit();
    }
    const stop = this.subscription.subscribe((event) =>
      event.type === 'ping' ? this.receivePing(event.ping) : this.receive(event)
    );
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
    this.finishRotation();
    /* A piece picks up as the room has it, so one whose turn is still on its way waits for it, as a flipping one does. */
    if (
      [...this.sentTurns.values()].some((turn) => turn.pieceId === sourceId) ||
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
    /* A mouse can report several moves a frame, and the scene only draws the last of them. */
    this.emit(true);
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
      ...flipsOf(carry.draft),
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
  catalogue = (selection: SpawnSelection) => {
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
    this.battle.editPlan(this.snapshot.battle.id, patch);
    this.emit();
  };
  /*
   * Whether this page may send the command now. Past a few unanswered commands a further one is dropped, not queued,
   * so mashing a button or key never stacks up work for the room; play by hand is answered long before it gets there.
   */
  private mayCommand(action: PieceAction) {
    const allowed = isSeatAction(action) ? this.current() : this.canAct();
    return allowed && !(this.carry && !passesCarry(action)) && this.unanswered.size < UNANSWERED_COMMANDS_LIMIT;
  }
  private sendCommand(commandId: string, action: PieceAction) {
    const sent = this.send({ type: 'command', commandId, action, expectedRevision: this.snapshot.revision });
    if (sent) {
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
    if (!this.sendCommand(commandId, action)) {
      this.pendingFlips.delete(commandId);
      this.error = 'The connection closed before the action could be sent.';
    } else if (seatCommand) {
      this.seatCommandInFlight = commandId;
    } else if (action.kind === 'spawn-request') {
      this.captureInFlight = commandId;
    } else if (action.kind === 'traitors-gather' && this.traitorGatherInFlight === null && this.tabletopTraitors()) {
      /* A second click before the first settles is refused for its stale revision, so the first gather is the one to follow; with no Traitor left on the table there is no pile to look at. */
      this.traitorGatherInFlight = commandId;
    } else if (action.kind === 'battle-disclose') {
      this.battle.disclosureSent(commandId, action);
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
    if (this.carry?.pendingDrop) {
      return;
    }
    if (this.carry) {
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
    if (!pieceId) {
      return;
    }
    if (this.turning && this.turning.pieceId !== pieceId) {
      this.finishRotation();
    }
    const turns = (this.turning?.turns ?? 0) + direction;
    const piece = this.turnablePiece(pieceId);
    /* A step that would overlap another piece is not taken, as the room would refuse it; the turn so far stays. */
    if (!piece || !rotatedPiece(this.requireTable().state, piece, foldedTurns(this.turnsOf(pieceId) + direction))) {
      return;
    }
    this.turning = { pieceId, turns };
    this.emit();
  };
  /** Sends the held rotation as one command, its net turn folded into half a turn either way; a turn back to where it started sends nothing. */
  finishRotation = () => {
    const turning = this.turning;
    if (!turning) {
      return;
    }
    /* Let go of while a resync pauses the table, the turn waits for the fresh view instead of being lost. */
    if (!this.current()) {
      this.turning = { ...turning, released: true };
      return;
    }
    /* The turn stays shown until the command is out, so the piece never springs back in between. */
    const commandId = this.sendTurn(turning);
    this.turning = null;
    if (commandId) {
      this.sentTurns.set(commandId, { pieceId: turning.pieceId, turns: foldedTurns(turning.turns) });
    }
    this.emit();
  };
  /* The piece as the room last sent it, while the room would let it turn: the table open to handling, the piece present, unlocked and not in another player's hand. */
  private turnablePiece(pieceId: string) {
    const snapshot = this.snapshot;
    const piece = tableHandlingOpen(snapshot.stage)
      ? snapshot.table.pieces.find((candidate) => candidate.id === pieceId)
      : undefined;
    if (!piece || gestureBlockReason(piece)) {
      return null;
    }
    /* A piece another player is carrying, as from a deck they draw on, is theirs until they let go. */
    return this.activityForView().carries.some((carry) => carry.reservedIds.includes(pieceId)) ? null : piece;
  }
  /* A piece locked or taken away while the key was held keeps the turn to itself, since the room would refuse it; a turn back to the start sends nothing. */
  private sendTurn({ pieceId, turns: held }: Turn) {
    const turns = foldedTurns(held);
    if (!turns || !this.turnablePiece(pieceId)) {
      return;
    }
    const steps = Math.abs(turns);
    return this.command({ kind: 'rotate', pieceId, direction: turns > 0 ? 1 : -1, ...(steps > 1 ? { steps } : {}) });
  }
  flipSelected = (id?: string) => {
    if (!this.canAct()) {
      return;
    }
    if (this.carry) {
      this.flipCarried();
      return;
    }
    const pieceId = this.target(id);
    if (!pieceId || this.requireTable().flippingPieceIds.has(pieceId)) {
      return;
    }
    this.command({ kind: 'flip', pieceId });
  };
  /* A piece in hand turns over where it is held at once; the room answers with any face it turned up, and the table logs the flip when it lands. */
  private flipCarried() {
    const carry = this.carry;
    const held = carry && !carry.pendingDrop ? this.pieceToFlipInHand(carry) : null;
    if (!carry || !held) {
      return;
    }
    const flips = (carry.draft.flips ?? 0) + 1;
    this.handFlip = { carryId: carry.id, pieceId: held.id, revision: (held.flipRevision ?? 0) + 1 };
    this.carry = { ...carry, draft: { ...carry.draft, flips } };
    this.send({ type: 'flip', carryId: carry.id, flips });
    this.emit();
  }
  /* The piece in hand when it may turn over once more: one the room would let turn, below the carry's cap, and not still turning. */
  private pieceToFlipInHand(carry: LocalCarry) {
    const held = heldPieceFor(this.requireTable().state, carry.draft);
    /* The room never counts back, so a carry stops turning at its cap rather than send a count it refuses. */
    const unrevealed = (stepId: string) => this.snapshot.predictions?.[stepId]?.revealedAt === null;
    if (!held || !canFlipInHand(held, unrevealed) || (carry.draft.flips ?? 0) >= CARRY_FLIPS_LIMIT) {
      return null;
    }
    /* A piece still turning over in hand finishes that turn before it takes another, as one on the table does. */
    return this.handFlip?.carryId === carry.id ? null : held;
  }
  toggleLockSelected = (id?: string) => {
    const pieceId = this.target(id);
    if (pieceId) {
      this.command({ kind: 'lock', pieceId });
    }
  };
  moveStormBy = (direction: -1 | 1 = 1) => this.command({ kind: 'storm', direction });
  spawnSpice = (count: number) => this.command({ kind: 'spice-spawn', count });
  finishPieceFlip = (pieceId: string, revision: number) => {
    if (this.handFlip?.pieceId === pieceId && this.handFlip.revision === revision) {
      this.handFlip = null;
    }
    if (this.flipping.get(pieceId) !== revision) {
      return;
    }
    this.flipping = new Map(this.flipping);
    this.flipping.delete(pieceId);
    this.emit();
  };
  /** Publishes the cursor, and keeps `surface`, the table under it, for a ping to mark. */
  publishPointer = (position: Vector3Tuple | null, surface: Vector3Tuple | null = null) => {
    this.pingPoint = position ? onTable(surface) : null;
    if (!this.canAct()) {
      this.pointer = null;
      clearTimeout(this.pointerTimer);
      this.pointerTimer = undefined;
      return;
    }
    this.pointer = onTable(position);
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
