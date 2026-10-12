import { tableHandlingOpen } from '@shared/play/admission';
import type { BattlePlan, BattlePlanInput, Disclosure } from '@shared/play/battle';
import type { PublicFaction } from '@shared/play/capture';
import { foldedTurns, rotatedPiece } from '@shared/play/commands';
import { snapshotFactionLabels, snapshotFactionTieBreaks } from '@shared/play/factionLabels';
import type { SpawnSelection } from '@shared/play/inventory';
import type { LogTab } from '@shared/play/log';
import { affordancesFor, gestureBlockReason } from '@shared/play/model';
import type { Affordance, DraftMove, TablePiece, TableState, Vector3Tuple } from '@shared/play/model';
import { isSeatAction } from '@shared/play/participation';
import { rearrangeable } from '@shared/play/peeking';
import type { Peek } from '@shared/play/peeking';
import { carryPieceId, TABLE_PING_INTERVAL_MS, tableForViewer } from '@shared/play/protocol';
import type {
  ClientMessage,
  GameSnapshot,
  PieceAction,
  Viewer,
  PublicCarry,
  PublicPointer,
  ServerMessage,
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

import { ConversationSession } from './ConversationSession';
import type { ConversationView } from './ConversationSession';
import type { GameRuntime } from './runtime';
import type { StoredTable } from './storedTable';
import { isReadRequest } from './TableSubscription';
import type { TableSubscription, TableSubscriptionEvent } from './TableSubscription';

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

/* A turn of a piece at rest in 15° steps, clockwise positive. */
type Turn = { pieceId: string; turns: number };

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
  /* The piece menu's spice reserve and deck actions, present only while this viewer can act. */
  spiceReserveControls?: {
    canCollect(pieceId: string): boolean;
    collect(pieceId: string): void;
  };
  deckControls?: {
    /* Each faction a card can be dealt to, with its token artwork where the room published one. */
    recipients: { id: string; name: string; artwork?: NonNullable<GameSnapshot['factionArtwork']>[string] }[];
    draw(pieceId: string, recipient?: string): void;
    shuffle(pieceId: string): void;
  };
  /* Taking a card, token or stack out of the game for good; present only while this viewer can act. */
  deleteControls?: {
    remove(pieceId: string): void;
  };
  /* The piece this viewer's faction holds open by peeking, faces showing; only its own frames carry one. */
  peek: Peek | null;
  /* Peeking at a hidden card, token or deck, and changing a deck held open; present only while this viewer's faction can act. */
  peekControls?: {
    peek(pieceId: string): void;
    arrange(pieceId: string, order: number[]): void;
    pull(pieceId: string, index: number): void;
  };
  /* Letting go of the peek held open; a seated viewer can, even once the game is finished and the table no longer handles. */
  closePeek?: () => void;
  remoteCarriedIds: ReadonlySet<string>;
  reservedPieceIds: ReadonlySet<string>;
  gestureActivePieceId: string | null;
  hoveredPieceId: string | null;
  flippingPieceIds: ReadonlyMap<string, number>;
  /* Only a derived table reads server time, because the view that derived it anchored the clock. */
  serverNow: () => number;
};

export type ConnectionView = {
  status: TableSubscription['status'];
  conversations: ConversationView;
  error: string | null;
  table: TableProjection | null;
  catalogue?: Extract<ServerMessage, { type: 'catalogue' }>;
  spiceHistory?: Extract<ServerMessage, { type: 'spice-history' }>;
  logHistory: Partial<Record<LogTab, LogPage>>;
  /* Seated factions' captured starting sheets by faction id; null when the game holds no capture of one. */
  factions: Readonly<Partial<Record<string, PublicFaction | null>>>;
};
export type LogPage = Extract<ServerMessage, { type: 'log-history' }>;

/* Each faction a deck can deal to, with its token art for the deal ring. */
function dealRecipients(snapshot: GameSnapshot) {
  const artwork = snapshot.factionArtwork ?? {};
  return Object.entries(snapshotFactionLabels(snapshot)).map(([id, name]) => ({ id, name, artwork: artwork[id] }));
}

/* Whether two sets hold the same members, so a table rebuilt for a move keeps the sets a panel already read. */
function sameMembers<T>(a: ReadonlySet<T> | ReadonlyMap<T, unknown>, b: ReadonlySet<T> | ReadonlyMap<T, unknown>) {
  if (a.size !== b.size) {
    return false;
  }
  for (const key of a.keys()) {
    if (!b.has(key)) {
      return false;
    }
  }
  return true;
}

/* The controls a panel offers only while present, so only their presence counts for a panel's render. */
const PANEL_CONTROLS = ['spiceReserveControls', 'deckControls', 'deleteControls', 'peekControls', 'closePeek'] as const;

/*
 * Whether the panels would show `next` as they show `previous`: everything they read is the same, and only where held pieces are on their way differs.
 * A carry moves many times a second, and only the scene follows it, so the panels keep the table they have until something they show changes.
 */
function sameForPanels(previous: TableProjection, next: TableProjection) {
  return (
    previous.viewer === next.viewer &&
    previous.snapshot === next.snapshot &&
    previous.liveRevision === next.liveRevision &&
    previous.playback?.step === next.playback?.step &&
    previous.playback?.lastStep === next.playback?.lastStep &&
    previous.historyPending === next.historyPending &&
    previous.canInteract === next.canInteract &&
    previous.canHandleTable === next.canHandleTable &&
    previous.reconnecting === next.reconnecting &&
    previous.seatCommandPending === next.seatCommandPending &&
    previous.traitorsGathered === next.traitorsGathered &&
    previous.phaseCooling === next.phaseCooling &&
    previous.battleCountdownSeconds === next.battleCountdownSeconds &&
    previous.serverNow === next.serverNow &&
    previous.state.selectedPieceId === next.state.selectedPieceId &&
    previous.state.draftMove?.pieceId === next.state.draftMove?.pieceId &&
    previous.gestureActivePieceId === next.gestureActivePieceId &&
    previous.hoveredPieceId === next.hoveredPieceId &&
    PANEL_CONTROLS.every((key) => Boolean(previous[key]) === Boolean(next[key])) &&
    (previous.peek === null) === (next.peek === null) &&
    sameMembers(previous.remoteCarriedIds, next.remoteCarriedIds) &&
    sameMembers(previous.reservedPieceIds, next.reservedPieceIds) &&
    sameMembers(previous.flippingPieceIds, next.flippingPieceIds) &&
    [...previous.flippingPieceIds].every(([id, revision]) => next.flippingPieceIds.get(id) === revision)
  );
}

/* Commands a held piece does not hold back: a phase change, a removal, a seat, and letting go of a peek, which the room allows mid-carry. */
function waitsForPlan(
  action: PieceAction
): action is Extract<PieceAction, { kind: 'battle-ready' | 'battle-disclose' }> {
  return action.kind === 'battle-ready' || action.kind === 'battle-disclose';
}
/* The part a battle action reveals in the given battle, if it reveals one. */
function revealIn(action: PieceAction, battleId?: string): Disclosure[] {
  return action.kind === 'battle-disclose' && action.shown && action.battleId === battleId ? [action.disclosure] : [];
}
function shownWith(shown: BattlePlan['disclosed'], disclosure: Disclosure): BattlePlan['disclosed'] {
  return disclosure.element === 'card'
    ? { ...shown, cardIds: [...new Set([...shown.cardIds, disclosure.cardId])] }
    : { ...shown, [disclosure.element]: true };
}
/* The snapshot with its battle plan replaced, the bank holding back the spice the new plan commits. */
function withPlan(snapshot: GameSnapshot, was: BattlePlan, plan: BattlePlan): GameSnapshot {
  const bank = snapshot.bank && {
    ...snapshot.bank,
    balance: snapshot.bank.balance + was.spice - plan.spice,
  };
  return { ...snapshot, battlePlan: plan, ...(bank ? { bank } : {}) };
}
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
    peek: null,
    remoteCarriedIds: new Set(),
    reservedPieceIds: new Set(),
    gestureActivePieceId: null,
    hoveredPieceId: null,
    flippingPieceIds: new Map(),
    serverNow: () => serverNow,
  };
}

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
  /* The table as the last update derived it, which the session itself and the scene read. */
  private table: TableProjection | null = null;
  /* The last table there was, which the scene keeps reading while its parent takes it off the page. */
  private shownTable: TableProjection | null = null;
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
  /* A rotation held on a piece at rest turns it on this page only, and goes out as one command when the key comes up. */
  private turning: Turn | null = null;
  /* Rotations sent and not yet answered, by command, shown until the frame that settles them. */
  private readonly sentTurns = new Map<string, Turn>();
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
  private queuedCatalogue: { requestId: string; selection?: SpawnSelection } | null = null;
  private phaseCooldownUntil = 0;
  private keptOnPointersAt = Number.NEGATIVE_INFINITY;
  private battleCountdownUntil = 0;
  private pendingBattlePlan: { commandId: string; battleId: string; patch: Partial<BattlePlanInput> } | null = null;
  private queuedBattlePlan: { battleId: string; patch: Partial<BattlePlanInput> } | null = null;
  /* Readiness and early reveals wait for the plan edits sent before them, so the room judges the plan the player saw. */
  private queuedBattleActions: Extract<PieceAction, { kind: 'battle-ready' | 'battle-disclose' }>[] = [];
  private disclosuresInFlight = new Map<string, Extract<PieceAction, { kind: 'battle-disclose' }>>();
  private catalogueResult?: Extract<ServerMessage, { type: 'catalogue' }>;
  private spiceHistory?: Extract<ServerMessage, { type: 'spice-history' }>;
  private spiceHistoryBefore?: number;
  private logHistory: Partial<Record<LogTab, LogPage>> = {};
  /* A capture never changes once a game holds it, so each answer is kept across reconnects. */
  private factions: Readonly<Partial<Record<string, PublicFaction | null>>> = {};
  /* Reads sent and not yet answered; a dropped connection or a refusal forgets them, so the panel can ask again. */
  private factionRequests = new Set<string>();
  private logHistoryBefore: Record<LogTab, number> = latestLogPages();

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
   */
  ping = (): boolean => {
    const ping = this.pingHere();
    if (!ping) {
      return false;
    }
    const now = this.runtime.monotonicNow();
    if (now - this.pingedAt < TABLE_PING_INTERVAL_MS) {
      return true;
    }
    if (!this.send({ type: 'ping', position: ping.position })) {
      return false;
    }
    this.pingedAt = now;
    this.emitPing(ping);
    return true;
  };
  /* This page's ping on the table surface under its cursor, while it has a cursor on the table and may act. */
  private pingHere(): TablePing | null {
    if (!this.canAct()) {
      return null;
    }
    const viewer = this.viewer;
    if (!viewer || this.pingPoint === null) {
      return null;
    }
    const { connectionId, viewerSeat, displayName, color } = viewer;
    return { connectionId, viewerSeat, displayName, color, position: this.pingPoint };
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
  /* An update that moved only pointers: the room, the carries and every countdown the table shows are as the last frame left them. */
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
      spiceReserveControls: undefined,
      deckControls: undefined,
      deleteControls: undefined,
      peek: null,
      peekControls: undefined,
      closePeek: undefined,
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
    const displayed = this.withUnsettledDisclosures(this.withPendingPlan(authoritative));
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
      spiceReserveControls:
        canHandleTable && displayed.bank
          ? {
              canCollect: (pieceId) => !reservedPieceIds.has(pieceId),
              collect: (pieceId) => this.command({ kind: 'bank-collect', pieceId }),
            }
          : undefined,
      deckControls:
        canHandleTable && this.subscription.supportsCommand('deck-draw')
          ? {
              recipients: dealRecipients(displayed),
              draw: (pieceId, recipient) => this.command({ kind: 'deck-draw', pieceId, recipient }),
              shuffle: (pieceId) => this.command({ kind: 'deck-shuffle', pieceId }),
            }
          : undefined,
      deleteControls: this.deleteControls(canHandleTable),
      /* A look back in time shows no peek: what a faction saw then is not what it holds open now. */
      peek:
        this.history || displayed.peek?.piece.id === this.closedPeek?.pieceId
          ? null
          : this.arrangedPeek(displayed.peek ?? null),
      peekControls:
        canHandleTable && displayed.bank
          ? {
              peek: (pieceId) => {
                this.closedPeek = null;
                this.command({ kind: 'peek', pieceId });
              },
              arrange: this.arrange,
              pull: this.pull,
            }
          : undefined,
      closePeek: canInteract && displayed.peek ? () => this.closePeek(displayed.peek!.piece.id) : undefined,
      remoteCarriedIds: new Set(remote.map((carry) => carry.held.id)),
      reservedPieceIds,
      gestureActivePieceId: local.gestureActivePieceId,
      hoveredPieceId: this.hoveredId,
      flippingPieceIds: local.flippingPieceIds,
      serverNow: this.subscription.serverNow,
    };
  }
  private deleteControls(canHandleTable: boolean): TableProjection['deleteControls'] {
    return canHandleTable && this.subscription.supportsCommand('delete')
      ? { remove: (pieceId) => this.command({ kind: 'delete', pieceId }) }
      : undefined;
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
    const turns = this.turnsOf(piece.id);
    return turns ? (rotatedPiece(state, piece, turns) ?? piece) : piece;
  }
  private emit() {
    this.keep();
    const table = this.derive();
    this.table = table;
    const panelsChanged = this.showPanels(table);
    const tableChanged = table !== null && table !== this.shownTable;
    this.shownTable = table ?? this.shownTable;
    if (panelsChanged) {
      notify(this.listeners);
    }
    if (tableChanged) {
      notify(this.tableListeners);
    }
    this.emitPointers();
  }
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
      spiceHistory: this.spiceHistory,
      logHistory: this.logHistory,
      factions: this.factions,
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
    this.forgetSettledPeekClose();
    this.discardReplacedBattleCommands();
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
  private discardReplacedBattleCommands() {
    if (
      (this.pendingBattlePlan && this.saved?.battle?.id !== this.pendingBattlePlan.battleId) ||
      (this.queuedBattlePlan && this.saved?.battle?.id !== this.queuedBattlePlan.battleId) ||
      this.queuedBattleActions.some((action) => this.saved?.battle?.id !== action.battleId)
    ) {
      this.pendingBattlePlan = null;
      this.queuedBattlePlan = null;
      this.queuedBattleActions = [];
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
    this.sentTurns.delete(id);
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
    this.disclosuresInFlight.delete(id);
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
        this.queuedBattleActions = [];
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
    this.flushBattleActions();
  }
  private receiveAuthorizedUpdate(
    message: Exclude<TableSubscriptionEvent, { type: 'connection' | 'resync' | 'view' }>
  ) {
    if (this.conversations.receive(message)) {
      return;
    }
    switch (message.type) {
      case 'log-history':
        this.receiveLogPage(message);
        break;
      case 'spice-history':
        this.receiveSpicePage(message);
        break;
      case 'faction':
        this.factionRequests.delete(message.factionId);
        this.factions = { ...this.factions, [message.factionId]: message.faction };
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
  /* A page arrives for the cursor it was asked with; one the panel has since moved past is dropped. */
  private receiveLogPage(message: LogPage) {
    if (message.before === this.logHistoryBefore[message.tab]) {
      this.logHistory = { ...this.logHistory, [message.tab]: message };
    }
  }
  private receiveSpicePage(message: Extract<ServerMessage, { type: 'spice-history' }>) {
    if (message.before === this.spiceHistoryBefore) {
      this.spiceHistory = message;
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
    /* A refused read carries no id; forgetting the faction reads lets the panel ask again on its next look. */
    this.factionRequests.clear();
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
    this.factionRequests.clear();
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
    this.queuedBattleActions = [];
    this.disclosuresInFlight.clear();
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
    this.turning = null;
    this.sentTurns.clear();
    this.flipping = new Map();
  }
  /* Each tab keeps the page it asked for through live updates; the newest page is the default and the reset. */
  readLogHistory = (tab: LogTab, before = this.logHistoryBefore[tab]) => {
    this.logHistoryBefore = { ...this.logHistoryBefore, [tab]: before };
    this.send({ type: 'log-history', tab, before });
  };
  /* Asks once for a seated faction's captured sheet; a read that was never answered can be asked again. */
  readFaction = (factionId: string) => {
    const known = factionId in this.factions || this.factionRequests.has(factionId);
    if (!known && this.send({ type: 'faction', factionId })) {
      this.factionRequests.add(factionId);
    }
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
    if (this.table?.snapshot.battle?.stage === 'countdown' || (this.table?.phaseCooling && !this.phaseCooling())) {
      this.emit();
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
    const { strength: _strength, faces: _faces, pieces: _pieces, disclosed: _disclosed, ...input } = plan;
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
  /* Plan edits still on their way, which readiness and early reveals queue behind. */
  private planInFlight() {
    return !!(this.pendingBattlePlan || this.queuedBattlePlan);
  }
  /* Readiness or a reveal queues while a plan edit is unanswered, or behind another one already queued so they keep their order. */
  private queueBehindPlan(action: PieceAction) {
    const waiting = !!this.pendingBattlePlan || this.queuedBattleActions.length > 0;
    if (!waiting || !waitsForPlan(action)) {
      return false;
    }
    this.queuedBattleActions.push(action);
    return true;
  }
  /* Plan edits not yet answered show at once, with the bank holding the spice they commit. */
  private withPendingPlan(authoritative: GameSnapshot): GameSnapshot {
    const pending = this.pendingBattlePlan;
    if (this.history || !pending) {
      return authoritative;
    }
    if (!authoritative.battlePlan || authoritative.battle?.id !== pending.battleId) {
      return authoritative;
    }
    const was = authoritative.battlePlan;
    return withPlan(authoritative, was, { ...was, ...pending.patch, ...this.queuedBattlePlan?.patch });
  }
  /*
   * A reveal not yet answered, queued behind plan edits or on its way, already shows as revealed, so its part locks
   * before a later edit can overtake it and change what the room reveals. A hide shows only once the room has it,
   * keeping the part locked meanwhile.
   */
  private withUnsettledDisclosures(snapshot: GameSnapshot): GameSnapshot {
    /* Replayed history shows the plan as it stood then. */
    if (this.history || !snapshot.battlePlan) {
      return snapshot;
    }
    const unsettled = [...this.queuedBattleActions, ...this.disclosuresInFlight.values()];
    const reveals = unsettled.flatMap((action) => revealIn(action, snapshot.battle?.id));
    return reveals.length
      ? {
          ...snapshot,
          battlePlan: {
            ...snapshot.battlePlan,
            disclosed: reveals.reduce((shown, reveal) => shownWith(shown, reveal), snapshot.battlePlan.disclosed),
          },
        }
      : snapshot;
  }
  private flushBattleActions() {
    if (this.canAct() && !this.planInFlight() && this.queuedBattleActions.length) {
      const actions = this.queuedBattleActions;
      this.queuedBattleActions = [];
      actions.forEach((action) => this.command(action));
    }
  }
  /** Sends a table command, and returns its id when it went out. */
  command = (action: PieceAction): string | undefined => {
    if (!this.subscription.supportsCommand(action.kind)) {
      return;
    }
    const seatCommand = isSeatAction(action) || isSwapAction(action);
    if (seatCommand && this.seatCommandInFlight) {
      return;
    }
    if (this.queueBehindPlan(action)) {
      this.emit();
      return;
    }
    if (!(isSeatAction(action) ? this.current() : this.canAct()) || (this.carry && !passesCarry(action))) {
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
    } else if (action.kind === 'battle-disclose') {
      this.disclosuresInFlight.set(commandId, action);
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
    if (!pieceId) {
      return;
    }
    if (this.turning && this.turning.pieceId !== pieceId) {
      this.finishRotation();
    }
    const turns = (this.turning?.turns ?? 0) + direction;
    const state = this.requireTable().state;
    const piece = state.pieces.find((candidate) => candidate.id === pieceId);
    /* A step that would overlap another piece is not taken, as the room would refuse it; the turn so far stays. */
    if (!piece || !rotatedPiece(state, piece, foldedTurns(this.turnsOf(pieceId) + direction))) {
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
    const turns = foldedTurns(turning.turns);
    const steps = Math.abs(turns);
    /* The turn stays shown until the command is out, so the piece never springs back in between. */
    const commandId = turns
      ? this.command({
          kind: 'rotate',
          pieceId: turning.pieceId,
          direction: turns > 0 ? 1 : -1,
          ...(steps > 1 ? { steps } : {}),
        })
      : undefined;
    this.turning = null;
    if (commandId) {
      this.sentTurns.set(commandId, { pieceId: turning.pieceId, turns });
    }
    this.emit();
  };
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
    if (!carry || carry.pendingDrop) {
      return;
    }
    const held = heldPieceFor(this.requireTable().state, carry.draft);
    /* The room never counts back, so a carry stops turning at its cap rather than send a count it refuses. */
    const unrevealed = (stepId: string) => this.snapshot.predictions?.[stepId]?.revealedAt === null;
    if (!canFlipInHand(held, unrevealed) || (carry.draft.flips ?? 0) >= CARRY_FLIPS_LIMIT) {
      return;
    }
    const flips = (carry.draft.flips ?? 0) + 1;
    this.carry = { ...carry, draft: { ...carry.draft, flips } };
    this.send({ type: 'flip', carryId: carry.id, flips });
    this.emit();
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
