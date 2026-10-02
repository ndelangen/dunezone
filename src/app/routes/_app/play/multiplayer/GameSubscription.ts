import {
  PLAY_PENDING_TIMEOUT_MS,
  PLAY_REQUEST_TIMEOUT_MS,
  PLAY_TICKET_RETRY_MAX_MS,
  PLAY_TICKET_TTL_MS,
} from '@shared/play/admission';
import {
  KEEPALIVE_INTERVAL_MS,
  KEEPALIVE_PING,
  KEEPALIVE_PONG,
  serverClockSchema,
  serverMessageSchema,
  TICKET_EXPIRED_CLOSE_CODE,
} from '@shared/play/protocol';
import type { ClientMessage, ServerMessage } from '@shared/play/protocol';
import { applyRoomUpdate } from '@shared/play/updates';
import type { RoomView } from '@shared/play/updates';

import type { requestPlayTicket } from '@db/play';

import { browserGameRuntime } from './gameRuntime';
import type { GameRuntime, GameSocket } from './gameRuntime';

type TicketResult = Awaited<ReturnType<typeof requestPlayTicket>>;
type TicketAttempt = { readonly generation: number; timer?: ReturnType<typeof setTimeout> };
type TicketRequest = { readonly result: Promise<TicketResult>; readonly requestedAt: number };
type Status = 'connecting' | 'authorized' | 'suspended' | 'denied';

/** Reads stay available while gameplay waits for synchronization or shows history. */
export function isReadRequest(message: ClientMessage) {
  return ['catalogue', 'history', 'spice-history', 'log-history', 'conversation-history', 'metrics'].includes(
    message.type
  );
}

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
  /* Whether the waiting reconnect is the plain one-second retry, which a returning network may skip; a wait the Worker asked for may not be. */
  private reconnectSkippable = false;
  private admissionTimer: ReturnType<typeof setTimeout> | undefined;
  private keepaliveTimer: ReturnType<typeof setInterval> | undefined;
  /* Keepalive ticks since the socket last delivered any frame, its answers included (#1662). */
  private silentTicks = 0;
  private stopOnline: (() => void) | undefined;
  private ticketAttempt: TicketAttempt | undefined;
  /* The ticket request still on the wire: an attempt that gives up waiting leaves it there for the next attempt to take its answer. */
  private ticketRequest: TicketRequest | undefined;
  private generation = 0;
  private current: RoomView | null = null;
  /* Whether this attempt has shown the table once: a suspended admission before that is still the first connect, not a pause. */
  private sawView = false;
  private wireView: RoomView | null = null;
  private resyncing = false;
  private connectionStatus: Status = 'connecting';
  /* Server time less monotonic time, the largest since this attempt connected: transit delay only ever makes a frame's reading smaller. */
  private serverOffset = Number.NEGATIVE_INFINITY;
  /* Tickets that expired since the table last showed; each one doubles the wait before the next. */
  private expiredTickets = 0;
  /** Why the last attempt failed before a table showed, kept on screen through the retries so a table that never answers never reads as still connecting. */
  private retryReason: string | null = null;

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

  /** The Worker's clock, advanced on the monotonic clock since its newest frame; a view has always set it before a snapshot exists. */
  serverNow = () => this.runtime.monotonicNow() + this.serverOffset;

  subscribe(listener: (event: GameSubscriptionEvent) => void) {
    this.listener = listener;
    this.stopOnline = this.runtime.onOnline(() => this.networkReturned());
    void this.open();
    let stopped = false;
    return () => {
      if (stopped) {
        return;
      }
      stopped = true;
      this.stop();
    };
  }

  private stop() {
    this.listener = null;
    this.stopOnline?.();
    this.stopOnline = undefined;
    ++this.generation;
    clearTimeout(this.reconnectTimer);
    this.reconnectTimer = undefined;
    clearTimeout(this.admissionTimer);
    clearInterval(this.keepaliveTimer);
    clearTimeout(this.ticketAttempt?.timer);
    this.ticketAttempt = undefined;
    this.ticketRequest = undefined;
    const socket = this.socket;
    this.socket = null;
    socket?.close();
    this.current = null;
    this.wireView = null;
    this.resyncing = false;
    this.connectionStatus = 'suspended';
    this.expiredTickets = 0;
    this.retryReason = null;
  }

  send(message: Exclude<ClientMessage, { type: 'admit' | 'sync' }>): boolean {
    if (this.status !== 'authorized' || this.socket?.readyState !== 1) {
      return false;
    }
    if (!this.ready && !isReadRequest(message)) {
      return false;
    }
    /* Motion can be replaced by a later sample; commands keep their ordering. */
    if (['pose', 'pointer'].includes(message.type) && this.socket.bufferedAmount > 64 * 1024) {
      return false;
    }
    this.socket.send(JSON.stringify(message));
    return true;
  }

  private changeStatus(status: Status, error: string | null = null) {
    this.connectionStatus = status;
    this.current = null;
    this.wireView = null;
    this.resyncing = false;
    this.listener?.({ type: 'connection', error });
  }

  private scheduleReconnect(delay = 1000) {
    if (!this.listener || this.status === 'denied') {
      return;
    }
    clearTimeout(this.reconnectTimer);
    this.reconnectSkippable = delay <= 1000;
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = undefined;
      void this.open();
    }, delay);
  }

  /* Only a failure before the table showed is kept for the retries; after one, the next attempt reads as the connection opening. */
  private retryAfterFailure(reason: string, delay = 1000) {
    this.retryReason = this.sawView ? null : reason;
    this.changeStatus('suspended', reason);
    this.scheduleReconnect(delay);
  }

  private renewExpiredTicket() {
    this.changeStatus('suspended');
    this.scheduleReconnect(Math.min(1000 * 2 ** this.expiredTickets++, PLAY_TICKET_RETRY_MAX_MS));
  }

  private async open() {
    if (!this.listener) {
      return;
    }
    const attempt: TicketAttempt = { generation: ++this.generation };
    this.ticketAttempt = attempt;
    this.sawView = false;
    this.serverOffset = Number.NEGATIVE_INFINITY;
    this.changeStatus('connecting', this.retryReason);
    const request = this.pendingTicketRequest();
    const result = await this.acquireTicket(attempt, request);
    if (!this.isCurrentAttempt(attempt) || !result) {
      return;
    }
    if (!result.ok) {
      if (result.reason === 'not_authorized') {
        this.changeStatus('denied', 'Sign in again to access the table.');
        return;
      }
      this.retryAfterFailure('The table is temporarily unavailable.', Math.max(1000, result.retryAfterMs ?? 1000));
      return;
    }
    const expiresAt = request.requestedAt + result.expiresInMs;
    if (expiresAt <= this.runtime.monotonicNow()) {
      this.renewExpiredTicket();
      return;
    }
    try {
      this.openSocket(result.ticket, expiresAt);
    } catch {
      this.retryAfterFailure('The table could not connect. Reconnecting...');
    }
  }

  private isCurrentAttempt(attempt: TicketAttempt) {
    return this.listener !== null && attempt.generation === this.generation;
  }

  /**
   * Reuses the request an earlier attempt stopped waiting for (#1378).
   * Asking again would not overtake it: one client's mutations run in order, so each new request queues behind the old one.
   * A connection whose round trip outlasts the wait would then throw away every answer and never be admitted.
   * Only a request older than a ticket's whole lifetime is replaced, because nothing it could still answer would be usable.
   */
  private pendingTicketRequest(): TicketRequest {
    const now = this.runtime.monotonicNow();
    if (this.ticketRequest && now - this.ticketRequest.requestedAt < PLAY_TICKET_TTL_MS) {
      return this.ticketRequest;
    }
    /* The ticket's lifetime starts somewhere inside the request, so measuring from before it can only end early. */
    const request: TicketRequest = { result: this.requestTicket(this.gameId), requestedAt: now };
    this.ticketRequest = request;
    /* A failed request is never reused; the next attempt asks again. */
    request.result.catch(() => {
      if (this.ticketRequest === request) {
        this.ticketRequest = undefined;
      }
    });
    return request;
  }

  private async acquireTicket(attempt: TicketAttempt, request: TicketRequest): Promise<TicketResult | null> {
    try {
      const result = await Promise.race([
        request.result,
        new Promise<never>((_, reject) => {
          attempt.timer = setTimeout(() => reject(new Error('Admission timed out.')), PLAY_REQUEST_TIMEOUT_MS);
        }),
      ]);
      /* An answer is used once; whatever happens next asks for a fresh ticket. */
      if (this.ticketRequest === request) {
        this.ticketRequest = undefined;
      }
      return result;
    } catch {
      if (this.isCurrentAttempt(attempt)) {
        this.retryAfterFailure('The table could not be reached. Reconnecting...');
      }
      return null;
    } finally {
      clearTimeout(attempt.timer);
    }
  }

  private openSocket(issued: string, expiresAt: number) {
    const socket = this.runtime.openSocket(this.gameId);
    this.socket = socket;
    let ticket = issued;
    socket.onopen = () => {
      if (!this.isCurrentSocket(socket)) {
        return;
      }
      /* Detached before closing: the close event reports whatever code the Worker answers with, so the expiry renews the ticket here. */
      if (expiresAt <= this.runtime.monotonicNow()) {
        ticket = '';
        this.socket = null;
        socket.close();
        this.renewExpiredTicket();
        return;
      }
      /* The Worker answered, so whatever happens next is not a table that could not be reached. */
      this.retryReason = null;
      socket.send(JSON.stringify({ type: 'admit', ticket }));
      ticket = '';
      this.startKeepalive(socket, 0);
    };
    socket.onmessage = (event) => this.receiveSocketMessage(socket, event.data);
    socket.onclose = (event) => {
      if (!this.isCurrentSocket(socket)) {
        return;
      }
      ticket = '';
      this.socket = null;
      clearTimeout(this.admissionTimer);
      clearInterval(this.keepaliveTimer);
      /* A refusal already supplied its reason; closing must not erase it. */
      if (this.status === 'denied') {
        return;
      }
      if (event.code === TICKET_EXPIRED_CLOSE_CODE) {
        this.renewExpiredTicket();
        return;
      }
      if (event.code === 4401) {
        this.changeStatus('denied', 'This login can no longer access the table.');
        return;
      }
      const delay = event.code === 4413 ? 5000 : 1000;
      /* A socket that closes before its table showed is a Worker that refused, failed or never answered; one that closes after reconnects as the connection opening. */
      if (this.sawView) {
        this.changeStatus('suspended');
        this.scheduleReconnect(delay);
        return;
      }
      this.retryAfterFailure('The table could not be reached. Reconnecting...', delay);
    };
    socket.onerror = () => {
      if (this.isCurrentSocket(socket)) {
        socket.close();
      }
    };
    this.waitForView(socket);
  }

  private receiveSocketMessage(socket: GameSocket, data: string) {
    const receivedAt = this.runtime.monotonicNow();
    if (this.isCurrentSocket(socket)) {
      this.silentTicks = 0;
    }
    if (!this.isCurrentSocket(socket) || this.status === 'denied' || data === KEEPALIVE_PONG) {
      return;
    }
    let message: ServerMessage;
    try {
      const frame: unknown = JSON.parse(data);
      message = serverMessageSchema.parse(frame);
      if (message.type !== 'admission') {
        this.serverOffset = Math.max(this.serverOffset, serverClockSchema.parse(frame).serverNow - receivedAt);
      }
    } catch {
      this.changeStatus('denied', 'This table needs a newer version of the page. Refresh to continue.');
      socket.close();
      return;
    }
    this.receive(message);
  }

  /**
   * Pings the Worker, which answers every ping, and drops a socket that stayed silent for a whole interval after one (#1662).
   * A connection lost without a close frame never fires the close event, so silence is the only sign the table went away.
   */
  private keepAlive(socket: GameSocket) {
    if (!this.isCurrentSocket(socket) || socket.readyState !== 1) {
      return;
    }
    if (++this.silentTicks >= 2) {
      this.dropSilentSocket(socket);
      return;
    }
    socket.send(KEEPALIVE_PING);
  }

  private startKeepalive(socket: GameSocket, silentTicks: number) {
    clearInterval(this.keepaliveTimer);
    this.silentTicks = silentTicks;
    this.keepaliveTimer = setInterval(() => this.keepAlive(socket), KEEPALIVE_INTERVAL_MS);
  }

  private dropSilentSocket(socket: GameSocket) {
    this.socket = null;
    clearTimeout(this.admissionTimer);
    clearInterval(this.keepaliveTimer);
    socket.close();
    if (this.status === 'denied') {
      return;
    }
    this.retryAfterFailure('The table could not be reached. Reconnecting...');
  }

  /* Coming back online reconnects at once when the plain retry is waiting, and otherwise asks the open socket to prove it still works. */
  private networkReturned() {
    if (!this.listener || this.status === 'denied') {
      return;
    }
    const socket = this.socket;
    if (!socket) {
      if (this.reconnectTimer !== undefined && this.reconnectSkippable) {
        clearTimeout(this.reconnectTimer);
        this.reconnectTimer = undefined;
        void this.open();
      }
      return;
    }
    /* The probe counts as a tick already, and the interval restarts so its answer always has a whole interval to arrive. */
    if (socket.readyState === 1) {
      this.startKeepalive(socket, 1);
      socket.send(KEEPALIVE_PING);
    }
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
      this.receiveAdmission(message);
      return;
    }
    if (message.type === 'view') {
      this.receiveView(message);
      return;
    }
    if (this.status !== 'authorized') {
      return;
    }
    if (message.type === 'update') {
      this.receiveUpdate(message);
      return;
    }
    this.listener?.(message);
  }

  /* The Worker admits every socket as suspended until its authorization is confirmed, so on a first connect the pause is the connection still opening and reads as such. */
  private receiveAdmission(message: Extract<ServerMessage, { type: 'admission' }>) {
    this.changeStatus(
      message.status,
      message.status === 'denied'
        ? 'This login can no longer access the table.'
        : this.sawView
          ? 'Checking the connection. Table actions are paused.'
          : null
    );
  }

  private receiveView(message: RoomView) {
    this.sawView = true;
    this.expiredTickets = 0;
    this.retryReason = null;
    const previous = this.acceptView(message);
    this.resyncing = false;
    this.connectionStatus = 'authorized';
    clearTimeout(this.admissionTimer);
    this.listener?.({ ...this.current!, snapshotChanged: true, previous });
  }

  private acceptView(message: RoomView) {
    const previous = this.current;
    /* Patches apply to the exact received frame, while presentation keeps the newest saved snapshot. */
    this.wireView = message;
    this.current =
      previous && previous.epoch === message.epoch && previous.snapshot.revision > message.snapshot.revision
        ? { ...message, snapshot: previous.snapshot }
        : message;
    return previous;
  }

  private receiveUpdate(message: Extract<ServerMessage, { type: 'update' }>) {
    const view = this.resyncing ? null : applyRoomUpdate(this.wireView ?? undefined, message);
    if (!view) {
      this.requestFreshView(message.completedCommandId);
      return;
    }
    const previous = this.acceptView(view);
    this.listener?.({
      ...this.current!,
      previous,
      phaseCooldownMs: message.phaseCooldownMs,
      battleCountdownMs: message.battleCountdownMs,
      snapshotChanged: Boolean(message.snapshot || message.completedCommandId),
    });
  }

  private requestFreshView(completedCommandId: string | undefined) {
    const request = !this.resyncing;
    this.resyncing = true;
    /* A command receipt remains valid even when its accompanying patch cannot apply. */
    this.listener?.({ type: 'resync', completedCommandId });
    if (request && this.socket) {
      this.socket.send(JSON.stringify({ type: 'sync' }));
      this.waitForView(this.socket);
    }
  }
}
