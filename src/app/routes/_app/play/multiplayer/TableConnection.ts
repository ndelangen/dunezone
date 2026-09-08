import { PLAY_PENDING_TIMEOUT_MS, PLAY_REQUEST_TIMEOUT_MS } from '@shared/play/admission';
import { affordancesFor, dropPositionFor, gestureBlockReason, zoneById } from '@shared/play/model';
import type { DraftMove, TablePiece, TableState, Vector3Tuple } from '@shared/play/model';
import { carryPieceId, tableForViewer, serverMessageSchema } from '@shared/play/protocol';
import type {
  ClientMessage,
  GameSnapshot,
  PieceAction,
  Viewer,
  PublicCarry,
  PublicPointer,
  ServerMessage,
} from '@shared/play/protocol';
import { draftForGesture, projectCarryAtPosition, renderedPiecesFor } from '@shared/play/tableState';

import type { requestPlayTicket } from '@db/play';

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

type LocalCarry = { id: string; sourceId: string; draft: DraftMove; granted: boolean; pendingDrop?: string };
export type TableProjection = {
  viewer: Viewer;
  snapshot: GameSnapshot;
  liveRevision: number;
  playback: { step: number; lastStep: number } | null;
  historyPending: boolean;
  canInteract: boolean;
  state: TableState;
  renderedPieces: TablePiece[];
  pointers: PublicPointer[];
  remoteCarriedIds: ReadonlySet<string>;
  reservedPieceIds: ReadonlySet<string>;
  gestureActivePieceId: string | null;
  hoveredPieceId: string | null;
  flippingPieceIds: ReadonlyMap<string, number>;
};

export type ConnectionView = {
  status: 'connecting' | 'authorized' | 'suspended' | 'denied';
  error: string | null;
  table: TableProjection | null;
};

/** Browser-local presentation and connection lifecycle. Only commands mutate saved state. */
export class TableConnection {
  private socket: WebSocket | null = null;
  private listeners = new Set<() => void>();
  private reconnectTimer: ReturnType<typeof setTimeout> | undefined;
  private tickTimer: ReturnType<typeof setInterval> | undefined;
  private poseTimer: ReturnType<typeof setTimeout> | undefined;
  private pointerTimer: ReturnType<typeof setTimeout> | undefined;
  private active = false;
  private status: ConnectionView['status'] = 'connecting';
  private error: string | null = null;
  private viewer: Viewer | null = null;
  private generation = 0;
  private admissionTimer: ReturnType<typeof setTimeout> | undefined;
  private requestTimer: ReturnType<typeof setTimeout> | undefined;
  private saved: GameSnapshot | null = null;
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
  private pendingFlips = new Map<string, string>();
  private pointer: Vector3Tuple | null = null;
  private cached: ConnectionView;

  constructor(
    readonly game: string,
    private readonly requestTicket: typeof requestPlayTicket
  ) {
    this.cached = { status: 'connecting', error: null, table: null };
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
    if (this.status !== 'authorized' || !this.saved || !this.viewer) {
      return null;
    }
    const displayed = this.history?.snapshot ?? this.snapshot;
    const state = {
      ...tableForViewer(displayed, this.viewer.viewerSeat),
      selectedPieceId: this.selectedId,
      draftMove: this.carry?.draft ?? null,
    };
    const remote = (this.history ? [] : this.carries).filter(
      (carry) => carry.connectionId !== this.viewer?.connectionId && carry.expiresAt > Date.now()
    );
    const localPieces = renderedPiecesFor(state).map((piece) =>
      this.carry?.draft.pieceId === piece.id
        ? { ...piece, position: this.carry.draft.position, orientation: this.carry.draft.orientation }
        : piece
    );
    return {
      viewer: this.viewer,
      snapshot: displayed,
      liveRevision: this.snapshot.revision,
      playback: this.history ? { step: this.history.step, lastStep: this.history.lastStep } : null,
      historyPending: this.pendingHistory !== null,
      canInteract: this.canAct(),
      state,
      renderedPieces: projectPublicCarries(localPieces, remote),
      pointers: (this.history ? [] : this.pointers).filter(
        (pointer) => pointer.connectionId !== this.viewer?.connectionId && Date.now() - pointer.updatedAt < 3000
      ),
      remoteCarriedIds: new Set(remote.map((carry) => carry.held.id)),
      reservedPieceIds: new Set(remote.flatMap((carry) => carry.reservedIds)),
      gestureActivePieceId: this.carry && !this.carry.pendingDrop ? this.carry.sourceId : null,
      hoveredPieceId: this.hoveredId,
      flippingPieceIds: new Map([
        ...this.flipping,
        ...[...this.pendingFlips.values()].map(
          (id) => [id, this.snapshot.table.pieces.find((piece) => piece.id === id)?.flipRevision ?? 0] as const
        ),
      ]),
    };
  }
  private emit() {
    this.cached = { status: this.status, error: this.error, table: this.derive() };
    for (const listener of this.listeners) {
      listener();
    }
  }
  private send(message: ClientMessage): boolean {
    const readOnly = message.type === 'history' || message.type === 'metrics';
    if (this.status !== 'authorized' || (!readOnly && !this.canAct()) || this.socket?.readyState !== WebSocket.OPEN) {
      return false;
    }
    /* Motion can be replaced by a later sample. Commands must keep their ordering. */
    if ((message.type === 'pose' || message.type === 'pointer') && this.socket.bufferedAmount > 64 * 1024) {
      return false;
    }
    this.socket.send(JSON.stringify(message));
    return true;
  }
  private receive(message: ServerMessage) {
    if (message.type === 'admission') {
      this.status = message.status;
      this.clearActivity();
      this.error =
        message.status === 'denied'
          ? 'This login can no longer access the table.'
          : 'Checking the connection. Table actions are paused.';
      this.emit();
      return;
    }
    if (message.type !== 'view' && this.status !== 'authorized') {
      return;
    }
    if (message.type === 'history') {
      if (this.pendingHistory === message.step) {
        this.history = message;
        this.pendingHistory = null;
        this.emit();
      }
      return;
    }
    if (message.type === 'metrics') {
      return;
    }
    if (message.type === 'rejected') {
      this.error = message.message;
      this.pendingFlips.delete(message.requestId);
      if (this.carry && [this.carry.id, this.carry.pendingDrop].includes(message.requestId)) {
        this.send({ type: 'cancel', carryId: this.carry.id });
        this.carry = null;
      }
      this.emit();
      return;
    }
    if (message.type === 'carry') {
      if (this.carry?.id === message.carryId) {
        const current = this.carry.draft;
        this.carry = {
          ...this.carry,
          granted: true,
          draft: { ...message.draft, position: current.position, orientation: current.orientation },
        };
        this.emit();
      }
      return;
    }
    if (this.epoch && message.epoch !== this.epoch) {
      if (this.carry) {
        this.error = 'The room resumed. Pick up the piece again to continue.';
      }
      this.carry = null;
    }
    this.epoch = message.epoch;
    this.carries = message.carries;
    this.pointers = message.pointers;
    if (message.type === 'view') {
      clearTimeout(this.admissionTimer);
      this.viewer = message.viewer;
      this.status = 'authorized';
      this.error = null;
      const oldPieces = this.saved?.table.pieces ?? [];
      if (!this.saved || message.snapshot.revision >= this.saved.revision) {
        this.saved = message.snapshot;
        const flips = new Map(this.flipping);
        for (const piece of this.snapshot.table.pieces) {
          const old = oldPieces.find((candidate) => candidate.id === piece.id);
          if (old && (old.flipRevision ?? 0) !== (piece.flipRevision ?? 0)) {
            flips.set(piece.id, piece.flipRevision ?? 0);
          }
        }
        this.flipping = new Map(
          [...flips].filter(([id]) => this.snapshot.table.pieces.some((piece) => piece.id === id))
        );
      }
      if (this.carry?.pendingDrop === message.completedCommandId) {
        this.carry = null;
      }
      if (message.completedCommandId) {
        this.pendingFlips.delete(message.completedCommandId);
      }
    }
    if (this.carry && !this.carry.granted) {
      const sources = new Set([
        this.carry.sourceId,
        ...this.carry.draft.withdrawals.map((withdrawal) => withdrawal.sourcePieceId),
      ]);
      if (
        this.carries.some(
          (carry) =>
            carry.connectionId !== this.viewer?.connectionId &&
            carry.expiresAt > Date.now() &&
            carry.reservedIds.some((id) => sources.has(id))
        )
      ) {
        this.send({ type: 'cancel', carryId: this.carry.id });
        this.selectedId = this.carry.sourceId;
        this.carry = null;
        this.error = 'Another player picked up that source first.';
      }
    }
    if (this.carry?.granted && !this.carries.some((carry) => carry.id === this.carry?.id)) {
      this.carry = null;
    }
    this.emit();
  }
  private clearActivity() {
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
  private scheduleReconnect(delay = 1000) {
    if (!this.active || this.status === 'denied') {
      return;
    }
    clearTimeout(this.reconnectTimer);
    this.reconnectTimer = setTimeout(() => {
      void this.open();
    }, delay);
  }
  private async open() {
    if (!this.active) {
      return;
    }
    const generation = ++this.generation;
    this.status = 'connecting';
    this.error = null;
    this.emit();
    let result: Awaited<ReturnType<typeof requestPlayTicket>>;
    try {
      result = await Promise.race([
        this.requestTicket(this.game),
        new Promise<never>((_, reject) => {
          this.requestTimer = setTimeout(() => reject(new Error('Admission timed out.')), PLAY_REQUEST_TIMEOUT_MS);
        }),
      ]);
    } catch {
      if (!this.active || generation !== this.generation) {
        return;
      }
      this.status = 'suspended';
      this.error = 'The table could not verify this login. Reconnecting...';
      this.emit();
      this.scheduleReconnect();
      return;
    } finally {
      if (generation === this.generation) {
        clearTimeout(this.requestTimer);
      }
    }
    if (!this.active || generation !== this.generation) {
      return;
    }
    if (!result.ok) {
      this.status = result.reason === 'not_authorized' ? 'denied' : 'suspended';
      this.error =
        result.reason === 'not_authorized'
          ? 'Sign in again to access the table.'
          : 'The table is temporarily unavailable.';
      this.emit();
      this.scheduleReconnect(Math.max(1000, result.retryAfterMs ?? 1000));
      return;
    }
    if (result.expiresAt <= Date.now()) {
      this.status = 'suspended';
      this.emit();
      this.scheduleReconnect();
      return;
    }
    const url = new URL(`/__play/games/${encodeURIComponent(this.game)}/socket`, window.location.href);
    url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:';
    const socket = new WebSocket(url);
    this.socket = socket;
    let ticket = result.ticket;
    socket.onopen = () => {
      if (this.socket !== socket || !this.active) {
        return;
      }
      if (result.expiresAt <= Date.now()) {
        ticket = '';
        socket.close();
        return;
      }
      socket.send(JSON.stringify({ type: 'admit', ticket }));
      ticket = '';
    };
    socket.onmessage = (event) => {
      if (this.socket !== socket || !this.active || this.status === 'denied') {
        return;
      }
      try {
        const message = serverMessageSchema.safeParse(JSON.parse(event.data));
        if (!message.success) {
          throw new Error('Invalid table update.');
        }
        this.receive(message.data);
      } catch {
        this.status = 'denied';
        this.error = 'This table needs a newer version of the page. Refresh to continue.';
        this.clearActivity();
        this.emit();
        socket.close();
      }
    };
    socket.onclose = (event) => {
      if (this.socket !== socket) {
        return;
      }
      ticket = '';
      this.socket = null;
      clearTimeout(this.admissionTimer);
      this.status = event.code === 4401 || this.status === 'denied' ? 'denied' : 'suspended';
      this.clearActivity();
      this.emit();
      this.scheduleReconnect(event.code === 4413 ? 5000 : 1000);
    };
    socket.onerror = () => socket.close();
    this.admissionTimer = setTimeout(() => {
      if (this.socket === socket && this.status === 'connecting') {
        socket.close();
      }
    }, PLAY_PENDING_TIMEOUT_MS);
  }
  connect = () => {
    this.active = true;
    void this.open();
    const visibility = () => {
      if (document.hidden) {
        this.publishPointer(null);
        this.cancelDraft();
      }
    };
    document.addEventListener('visibilitychange', visibility);
    this.tickTimer = setInterval(() => {
      const now = Date.now();
      const ownCarry = this.carries.find((carry) => carry.id === this.carry?.id);
      if (ownCarry && ownCarry.expiresAt <= now && !this.carry?.pendingDrop) {
        this.cancelDraft();
      }
      if (this.carry && !this.carry.pendingDrop) {
        this.send({ type: 'renew', carryId: this.carry.id });
      }
      if (this.pointer !== null && this.canAct()) {
        this.send({ type: 'pointer', seq: ++this.seq, position: this.pointer });
      }
      if (this.pointers.length || this.carries.length) {
        this.carries = this.carries.filter((carry) => carry.expiresAt > now);
        this.pointers = this.pointers.filter((pointer) => now - pointer.updatedAt < 3000);
        this.emit();
      }
    }, 1000);
    return () => {
      this.active = false;
      ++this.generation;
      document.removeEventListener('visibilitychange', visibility);
      clearTimeout(this.reconnectTimer);
      clearInterval(this.tickTimer);
      clearTimeout(this.admissionTimer);
      clearTimeout(this.requestTimer);
      const socket = this.socket;
      this.socket = null;
      socket?.close();
      this.clearActivity();
      this.viewer = null;
      this.saved = null;
      this.status = 'suspended';
      this.emit();
    };
  };
  private canAct() {
    return (
      this.viewer?.viewerSeat !== 'neutral' &&
      this.status === 'authorized' &&
      this.saved !== null &&
      this.history === null &&
      this.pendingHistory === null
    );
  }
  requestHistory = (step: number) => {
    if (this.status !== 'authorized' || this.carry || !Number.isSafeInteger(step) || step < 0) {
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
    if (!piece || gestureBlockReason(this.requireTable().state, piece)) {
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
  private flushPose = () => {
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
    if (!this.carry || this.carry.pendingDrop || !this.carry.draft.targetPieceId) {
      return;
    }
    this.flushPose();
    this.send({
      type: 'take',
      carryId: this.carry.id,
      requestId: crypto.randomUUID(),
      donorPieceId: this.carry.draft.targetPieceId,
    });
  };
  command = (action: PieceAction) => {
    if (!this.canAct() || this.carry) {
      return;
    }
    if (action.kind === 'flip' && this.requireTable().flippingPieceIds.has(action.pieceId)) {
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
  setEnforcement = (policy: TableState['enforcement']) => this.command({ kind: 'enforcement', policy });
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
    this.pointer = position;
    if (position === null) {
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
