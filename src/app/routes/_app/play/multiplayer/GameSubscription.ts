import { PLAY_PENDING_TIMEOUT_MS, PLAY_REQUEST_TIMEOUT_MS } from '@shared/play/admission';
import { serverMessageSchema } from '@shared/play/protocol';
import type { ClientMessage, ServerMessage } from '@shared/play/protocol';
import { applyRoomUpdate } from '@shared/play/updates';
import type { RoomView } from '@shared/play/updates';

import type { requestPlayTicket } from '@db/play';

import { browserGameRuntime } from './gameRuntime';
import type { GameRuntime, GameSocket } from './gameRuntime';

type TicketResult = Awaited<ReturnType<typeof requestPlayTicket>>;
type GrantedTicket = Extract<TicketResult, { ok: true }>;
type TicketAttempt = { readonly generation: number; timer?: ReturnType<typeof setTimeout> };
type Status = 'connecting' | 'authorized' | 'suspended' | 'denied';

export type GameSubscriptionEvent =
  | (RoomView & { snapshotChanged: boolean; previous: RoomView | null })
  | Exclude<ServerMessage, { type: 'view' | 'update' | 'admission' }>
  | { type: 'connection'; error: string | null }
  | { type: 'resync'; completedCommandId?: string };

/**
 * Owns one authenticated player's live view, including admission, patch assembly and reconnects.
 * Local intentions never enter its state and are never replayed after a disconnect.
 */
export class GameSubscription {
  private socket: GameSocket | null = null;
  private listener: ((event: GameSubscriptionEvent) => void) | null = null;
  private reconnectTimer: ReturnType<typeof setTimeout> | undefined;
  private admissionTimer: ReturnType<typeof setTimeout> | undefined;
  private ticketAttempt: TicketAttempt | undefined;
  private generation = 0;
  private current: RoomView | null = null;
  private resyncing = false;
  private connectionStatus: Status = 'connecting';

  constructor(
    private readonly gameId: string,
    private readonly requestTicket: typeof requestPlayTicket,
    private readonly runtime: GameRuntime = browserGameRuntime
  ) {}

  get status() {
    return this.connectionStatus;
  }

  get ready() {
    return this.status === 'authorized' && this.current !== null && !this.resyncing;
  }

  getSnapshot = () => this.current;

  subscribe(listener: (event: GameSubscriptionEvent) => void) {
    this.listener = listener;
    void this.open();
    let stopped = false;
    return () => {
      if (stopped) {
        return;
      }
      stopped = true;
      this.listener = null;
      ++this.generation;
      clearTimeout(this.reconnectTimer);
      clearTimeout(this.admissionTimer);
      clearTimeout(this.ticketAttempt?.timer);
      this.ticketAttempt = undefined;
      const socket = this.socket;
      this.socket = null;
      socket?.close();
      this.current = null;
      this.resyncing = false;
      this.connectionStatus = 'suspended';
    };
  }

  send(message: Exclude<ClientMessage, { type: 'admit' | 'sync' }>): boolean {
    const readOnly = ['catalogue', 'history', 'spice-history', 'metrics'].includes(message.type);
    if (this.status !== 'authorized' || (!readOnly && !this.ready) || this.socket?.readyState !== 1) {
      return false;
    }
    /* Motion can be replaced by a later sample; commands keep their ordering. */
    if ((message.type === 'pose' || message.type === 'pointer') && this.socket.bufferedAmount > 64 * 1024) {
      return false;
    }
    this.socket.send(JSON.stringify(message));
    return true;
  }

  private changeStatus(status: Status, error: string | null = null) {
    this.connectionStatus = status;
    this.current = null;
    this.resyncing = false;
    this.listener?.({ type: 'connection', error });
  }

  private scheduleReconnect(delay = 1000) {
    if (!this.listener || this.status === 'denied') {
      return;
    }
    clearTimeout(this.reconnectTimer);
    this.reconnectTimer = setTimeout(() => void this.open(), delay);
  }

  private async open() {
    if (!this.listener) {
      return;
    }
    const attempt: TicketAttempt = { generation: ++this.generation };
    this.ticketAttempt = attempt;
    this.changeStatus('connecting');
    const result = await this.acquireTicket(attempt);
    if (!this.isCurrentAttempt(attempt) || !result) {
      return;
    }
    if (!result.ok) {
      this.changeStatus(
        result.reason === 'not_authorized' ? 'denied' : 'suspended',
        result.reason === 'not_authorized'
          ? 'Sign in again to access the table.'
          : 'The table is temporarily unavailable.'
      );
      this.scheduleReconnect(Math.max(1000, result.retryAfterMs ?? 1000));
      return;
    }
    if (result.expiresAt <= this.runtime.now()) {
      this.changeStatus('suspended');
      this.scheduleReconnect();
      return;
    }
    try {
      this.openSocket(result);
    } catch {
      this.changeStatus('suspended', 'The table could not connect. Reconnecting...');
      this.scheduleReconnect();
    }
  }

  private isCurrentAttempt(attempt: TicketAttempt) {
    return this.listener !== null && attempt.generation === this.generation;
  }

  private async acquireTicket(attempt: TicketAttempt): Promise<TicketResult | null> {
    try {
      return await Promise.race([
        this.requestTicket(this.gameId),
        new Promise<never>((_, reject) => {
          attempt.timer = setTimeout(() => reject(new Error('Admission timed out.')), PLAY_REQUEST_TIMEOUT_MS);
        }),
      ]);
    } catch {
      if (this.isCurrentAttempt(attempt)) {
        this.changeStatus('suspended', 'The table could not verify this login. Reconnecting...');
        this.scheduleReconnect();
      }
      return null;
    } finally {
      clearTimeout(attempt.timer);
    }
  }

  private openSocket(result: GrantedTicket) {
    const socket = this.runtime.openSocket(this.gameId);
    this.socket = socket;
    let ticket = result.ticket;
    socket.onopen = () => {
      if (!this.isCurrentSocket(socket)) {
        return;
      }
      if (result.expiresAt <= this.runtime.now()) {
        ticket = '';
        socket.close();
        return;
      }
      socket.send(JSON.stringify({ type: 'admit', ticket, updates: 2 }));
      ticket = '';
    };
    socket.onmessage = (event) => {
      if (!this.isCurrentSocket(socket) || this.status === 'denied') {
        return;
      }
      let message: ServerMessage;
      try {
        message = serverMessageSchema.parse(JSON.parse(event.data));
      } catch {
        this.changeStatus('denied', 'This table needs a newer version of the page. Refresh to continue.');
        socket.close();
        return;
      }
      this.receive(message);
    };
    socket.onclose = (event) => {
      if (!this.isCurrentSocket(socket)) {
        return;
      }
      ticket = '';
      this.socket = null;
      clearTimeout(this.admissionTimer);
      /* A refusal already supplied its reason; closing must not erase it. */
      if (this.status !== 'denied') {
        this.changeStatus(event.code === 4401 ? 'denied' : 'suspended');
      }
      this.scheduleReconnect(event.code === 4413 ? 5000 : 1000);
    };
    socket.onerror = () => {
      if (this.isCurrentSocket(socket)) {
        socket.close();
      }
    };
    this.waitForView(socket);
  }

  private isCurrentSocket(socket: GameSocket) {
    return this.socket === socket && this.listener !== null;
  }

  private waitForView(socket: GameSocket) {
    clearTimeout(this.admissionTimer);
    this.admissionTimer = setTimeout(() => {
      if (this.isCurrentSocket(socket) && !this.ready) {
        socket.close();
      }
    }, PLAY_PENDING_TIMEOUT_MS);
  }

  private receive(message: ServerMessage) {
    if (message.type === 'admission') {
      this.changeStatus(
        message.status,
        message.status === 'denied'
          ? 'This login can no longer access the table.'
          : 'Checking the connection. Table actions are paused.'
      );
    } else if (message.type === 'view') {
      const previous = this.current;
      this.current =
        previous && previous.epoch === message.epoch && previous.snapshot.revision > message.snapshot.revision
          ? { ...message, snapshot: previous.snapshot }
          : message;
      this.resyncing = false;
      this.connectionStatus = 'authorized';
      clearTimeout(this.admissionTimer);
      this.listener?.({ ...this.current, snapshotChanged: true, previous });
    } else if (this.status === 'authorized') {
      if (message.type === 'update') {
        this.receiveUpdate(message);
      } else {
        if (message.type === 'activity' && this.current) {
          this.current = {
            ...this.current,
            epoch: message.epoch,
            carries: message.carries,
            pointers: message.pointers,
          };
        }
        this.listener?.(message);
      }
    }
  }

  private receiveUpdate(message: Extract<ServerMessage, { type: 'update' }>) {
    const view = this.resyncing ? null : applyRoomUpdate(this.current ?? undefined, message);
    if (!view) {
      const request = !this.resyncing;
      this.resyncing = true;
      /* A command receipt remains valid even when its accompanying patch cannot apply. */
      this.listener?.({ type: 'resync', completedCommandId: message.completedCommandId });
      if (request && this.socket) {
        this.socket.send(JSON.stringify({ type: 'sync' }));
        this.waitForView(this.socket);
      }
      return;
    }
    const previous = this.current;
    this.current = view;
    this.listener?.({
      ...view,
      previous,
      phaseCooldownMs: message.phaseCooldownMs,
      battleCountdownMs: message.battleCountdownMs,
      snapshotChanged: Boolean(message.snapshot || message.completedCommandId),
    });
  }
}
