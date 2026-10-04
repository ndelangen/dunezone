/* Throwaway renderer adapter: reuse Play's scene against a small in-memory demo, not its game lifecycle. */
import { freshTableState } from '@shared/play/model';
import type { Vector3Tuple } from '@shared/play/model';
import type { PublicPointer } from '@shared/play/protocol';
import { draftForGesture } from '@shared/play/tableState';

import type { TableProjection, TableSession } from '../play/multiplayer/TableSession';
import { demoPieces } from './fixture';

export class DemoRoom {
  listeners = new Set<() => void>();
  pointerListeners = new Set<() => void>();
  pointers: PublicPointer[] = [];
  id = '';
  visitors = 1;
  revision = 0;
  ready = false;
  error = '';
  lastSent = 0;
  state = {
    ...freshTableState(),
    pieces: demoPieces(),
    viewerSeat: 'demo',
    viewerFaction: null,
    selectedPieceId: null as string | null,
  };
  held = new Map<string, string>();
  projection!: TableProjection;
  ws!: WebSocket;
  constructor(
    readonly member: boolean,
    readonly name: string
  ) {
    this.emit();
  }
  connect = () => {
    this.ws = new WebSocket(
      `ws://${location.hostname}:3018/?role=${this.member ? 'member' : 'guest'}&name=${encodeURIComponent(this.name)}`
    );
    this.ws.onmessage = (event) => {
      const m = JSON.parse(event.data);
      if (m.type === 'hello') {
        this.id = m.id;
        this.ready = true;
      }
      if (m.type === 'state') {
        this.state = { ...this.state, pieces: m.pieces };
        this.held = new Map(m.held);
        this.visitors = m.visitors;
        this.revision = m.revision;
      }
      if (m.type === 'pointers') {
        this.pointers = m.pointers.filter((p: PublicPointer) => p.connectionId !== this.id);
        this.pointerListeners.forEach((f) => f());
        return;
      }
      if (m.type === 'denied') {
        this.error = m.reason;
        this.state = { ...this.state, draftMove: null };
      }
      this.emit();
    };
    return () => this.ws.close();
  };
  send = (m: unknown) => {
    if (this.ws.readyState === 1) this.ws.send(JSON.stringify(m));
  };
  emit = () => {
    const draft = this.state.draftMove;
    this.projection = {
      state: this.state,
      canInteract: this.member && this.ready,
      canHandleTable: this.member && this.ready,
      renderedPieces: this.state.pieces.map((p) => (draft?.pieceId === p.id ? { ...p, position: draft.position } : p)),
      selectedPiece: this.state.pieces.find((p) => p.id === this.state.selectedPieceId) ?? null,
      hoveredPieceId: null,
      gestureActivePieceId: draft?.pieceId ?? null,
      peek: null,
      affordances: [],
      remoteCarriedIds: new Set([...this.held].filter(([, owner]) => owner !== this.id).map(([id]) => id)),
      reservedPieceIds: new Set([...this.held].filter(([, owner]) => owner !== this.id).map(([id]) => id)),
      flippingPieceIds: new Map(),
    } as unknown as TableProjection;
    this.listeners.forEach((f) => f());
  };
  getTable = () => this.projection;
  subscribeTable = (f: () => void) => {
    this.listeners.add(f);
    return () => {
      this.listeners.delete(f);
    };
  };
  getPointers = () => this.pointers;
  subscribePointers = (f: () => void) => {
    this.pointerListeners.add(f);
    return () => {
      this.pointerListeners.delete(f);
    };
  };
  selectPiece = (id: string | null) => {
    this.state = { ...this.state, selectedPieceId: id };
    this.emit();
  };
  setHoveredPiece = () => {};
  beginGesture = (id: string) => {
    const p = this.state.pieces.find((p) => p.id === id);
    if (!this.member || !p || this.held.has(id)) return;
    this.state = { ...this.state, selectedPieceId: id, draftMove: draftForGesture(p, 'whole') };
    this.send({ type: 'begin', id });
    this.emit();
  };
  updateGesture = (position: Vector3Tuple) => {
    const d = this.state.draftMove;
    if (!d) return;
    this.state = { ...this.state, draftMove: { ...d, position } };
    if (performance.now() - this.lastSent > 50) {
      this.send({ type: 'move', id: d.pieceId, position });
      this.lastSent = performance.now();
    }
    this.emit();
  };
  finishGesture = (position: Vector3Tuple) => {
    const d = this.state.draftMove;
    if (!d) return;
    this.send({ type: 'drop', id: d.pieceId, position });
    this.state = { ...this.state, draftMove: null };
    this.emit();
  };
  cancelDraft = () => {
    const d = this.state.draftMove;
    if (d) this.send({ type: 'cancel', id: d.pieceId });
    this.state = { ...this.state, draftMove: null };
    this.emit();
  };
  publishPointer = (position: Vector3Tuple | null) => {
    if (!this.member) return;
    if (position && performance.now() - this.lastPointer < 50) return;
    this.lastPointer = performance.now();
    this.send({ type: 'pointer', position });
  };
  lastPointer = 0;
  finishPieceFlip = () => {};
  flipSelected = () => {};
  moveStormBy = () => {};
  rotateSelected = () => {};
  spawnSpice = () => {};
  splitSelected = () => {};
  stackSelected = () => {};
  takeAdditionalFromTarget = () => {};
  toggleLockSelected = () => {};
  /* This cast is the spike's deliberate shortcut around a production session's lifecycle. Do not ship it. */
  asSession = () => this as unknown as TableSession;
  close = () => this.ws.close();
}
