import { PLAY_ADMISSION_RETRY_MAX_MS, PLAY_PENDING_TIMEOUT_MS, PLAY_REQUEST_TIMEOUT_MS } from '@shared/play/admission';
import {
  ADMISSION_REFUSED_CLOSE_CODE,
  KEEPALIVE_INTERVAL_MS,
  KEEPALIVE_PING,
  KEEPALIVE_PONG,
  PASS_EXPIRED_CLOSE_CODE,
  RATE_LIMITED_CLOSE_CODE,
  serverClockSchema,
  serverMessageSchema,
} from '@shared/play/protocol';
import type { ClientMessage, ServerMessage } from '@shared/play/protocol';
import { peekSeatPass, PLAY_SEAT_PASS_RENEW_MS } from '@shared/play/seatPass';
import { applyRoomUpdate } from '@shared/play/updates';
import type { RoomView } from '@shared/play/updates';

import type { requestPlayAdmission, watchSeatPass } from '@db/play';
import { isReadRequest } from '@db/tabletop/TableSubscription';
import type { TableSubscriptionEvent, TableConnectionStatus } from '@db/tabletop/TableSubscription';

import { browserGameRuntime } from './gameRuntime';
import type { GameRuntime, GameSocket } from './gameRuntime';
import { TableTelemetry, TELEMETRY_REPORT_MS } from './tableTelemetry';

const UNREACHABLE = 'The table could not be reached. Reconnecting...';
/* Renewal retries after a refused or failed attempt, doubling from a second, about a minute in all. */
const PASS_RENEWAL_ATTEMPTS = 6;
/* How long an admission request still on the wire is waited on by the next attempt rather than asked again. */
const ADMISSION_REQUEST_REUSE_MS = 30_000;

type AdmissionResult = Awaited<ReturnType<typeof requestPlayAdmission>>;
type AdmissionAttempt = { readonly generation: number; timer?: ReturnType<typeof setTimeout> };
type AdmissionRequest = { readonly result: Promise<AdmissionResult>; readonly requestedAt: number };
/**
 * Owns one authenticated player's live view, including admission, patch assembly and reconnects.
 * Local intentions never enter its state and are never replayed after a disconnect.
 */
export class GameSubscription {
  supportsCommand = () => true;
  private socket: GameSocket | null = null;
  private listener: ((event: TableSubscriptionEvent) => void) | null = null;
  private reconnectTimer: ReturnType<typeof setTimeout> | undefined;
  /* Whether the waiting reconnect is the plain one-second retry, which a returning network may skip; a wait the Worker asked for may not be. */
  private reconnectSkippable = false;
  private admissionTimer: ReturnType<typeof setTimeout> | undefined;
  private keepaliveTimer: ReturnType<typeof setInterval> | undefined;
  /* Keepalive ticks since the socket last delivered any frame, its answers included (#1662). */
  private silentTicks = 0;
  private stopOnline: (() => void) | undefined;
  private stopVisible: (() => void) | undefined;
  private admissionAttempt: AdmissionAttempt | undefined;
  /* The admission request still on the wire: an attempt that gives up waiting leaves it there for the next attempt to take its answer. */
  private admissionRequest: AdmissionRequest | undefined;
  private generation = 0;
  private current: RoomView | null = null;
  /* Whether this attempt has shown the table once: a suspended admission before that is still the first connect, not a pause. */
  private sawView = false;
  /* The Worker's name for the last connection that showed the table; the next admission asks the Worker to retire it, since a connection lost without a close frame still holds its carry and pointer there. */
  private connectionId: string | undefined;
  private wireView: RoomView | null = null;
  private resyncing = false;
  private connectionStatus: TableConnectionStatus = 'connecting';
  /* Server time less monotonic time, the largest since this attempt connected: transit delay only ever makes a frame's reading smaller. */
  private serverOffset = Number.NEGATIVE_INFINITY;
  /* Admissions retried since the table last showed, for a lapsed pass; each one doubles the wait before the next. */
  private admissionRetries = 0;
  /** Why the last attempt failed before a table showed, kept on screen through the retries so a table that never answers never reads as still connecting. */
  private retryReason: string | null = null;
  private readonly telemetry: TableTelemetry;
  private telemetryTimer: ReturnType<typeof setInterval> | undefined;
  private stopLongTasks: (() => void) | undefined;
  private stopPasses: (() => void) | undefined;
  /* Renews the seat pass this page holds shortly before it ends, unless a fresher one arrived first. */
  private passTimer: ReturnType<typeof setTimeout> | undefined;
  private renewOnOpen = false;
  /* The latest pass this page holds, which the renewal is timed against. */
  private renewing: string | undefined;

  constructor(
    private readonly gameId: string,
    private readonly requestAdmission: typeof requestPlayAdmission,
    private readonly runtime: GameRuntime = browserGameRuntime,
    private readonly watchPass?: typeof watchSeatPass
  ) {
    this.telemetry = new TableTelemetry(runtime.monotonicNow);
  }

  get status() {
    return this.connectionStatus;
  }

  get ready() {
    return this.status === 'authorized' && this.current !== null && !this.resyncing;
  }

  getSnapshot = () => this.current;

  /** The Worker's clock, advanced on the monotonic clock since its newest frame; a view has always set it before a snapshot exists. */
  serverNow = () => this.runtime.monotonicNow() + this.serverOffset;

  subscribe(listener: (event: TableSubscriptionEvent) => void) {
    this.listener = listener;
    this.stopOnline = this.runtime.onOnline(() => this.networkReturned());
    /* A tab frozen in the background would otherwise find a dead socket only after two keepalive intervals. */
    this.stopVisible = this.runtime.onVisible(() => this.networkReturned());
    this.stopLongTasks = this.runtime.onLongTask?.((durationMs) => this.telemetry.longTask(durationMs));
    this.telemetryTimer = setInterval(() => this.sendTelemetry(), TELEMETRY_REPORT_MS);
    this.stopPasses = this.watchPass?.(this.gameId, (pass) => this.handOverPass(pass));
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
    this.stopVisible?.();
    this.stopVisible = undefined;
    this.stopLongTasks?.();
    this.stopLongTasks = undefined;
    clearInterval(this.telemetryTimer);
    this.stopPasses?.();
    this.stopPasses = undefined;
    clearTimeout(this.passTimer);
    ++this.generation;
    clearTimeout(this.reconnectTimer);
    this.reconnectTimer = undefined;
    clearTimeout(this.admissionTimer);
    clearInterval(this.keepaliveTimer);
    clearTimeout(this.admissionAttempt?.timer);
    this.admissionAttempt = undefined;
    this.admissionRequest = undefined;
    const socket = this.socket;
    this.socket = null;
    socket?.close();
    this.current = null;
    this.wireView = null;
    this.resyncing = false;
    this.connectionStatus = 'suspended';
    this.admissionRetries = 0;
    this.retryReason = null;
  }

  send(message: Exclude<ClientMessage, { type: 'admit' | 'sync' }>): boolean {
    if (this.status !== 'authorized' || this.socket?.readyState !== 1) {
      return false;
    }
    /* Putting a held piece back depends on no table state, so it is not held for a resync: the Worker would keep the piece in hand meanwhile. */
    if (!this.ready && !isReadRequest(message) && message.type !== 'cancel') {
      return false;
    }
    /* Motion can be replaced by a later sample; commands keep their ordering. */
    if (['pose', 'pointer'].includes(message.type) && this.socket.bufferedAmount > 64 * 1024) {
      return false;
    }
    this.socket.send(JSON.stringify(message));
    if (message.type === 'command' || message.type === 'drop') {
      this.telemetry.sent(message.commandId);
    }
    return true;
  }

  /* A report that cannot go out now is dropped with its interval, so a long disconnection never sends a backlog. */
  private sendTelemetry() {
    const report = this.telemetry.report();
    if (report && this.status === 'authorized' && this.socket?.readyState === 1) {
      this.socket.send(JSON.stringify(report));
    }
  }

  /* A fresher pass goes to the room over the open socket, so the connection never has to reconnect when the pass it entered with ends. */
  private handOverPass(pass: string) {
    this.schedulePassRenewal(pass);
    /* The room ignores a pass that arrives before its admission finishes, and the page reconnects with the held one then. */
    if (this.socket?.readyState === 1) {
      this.socket.send(JSON.stringify({ type: 'pass', pass } satisfies ClientMessage));
    }
  }

  /* Timed on the room's clock, which is the one that ends the pass; until the room's first frame gives it, the renewal waits for that frame. */
  private schedulePassRenewal(pass: string) {
    clearTimeout(this.passTimer);
    this.passTimer = undefined;
    this.renewing = pass;
    const payload = peekSeatPass(pass);
    if (!payload || !Number.isFinite(this.serverOffset)) {
      return;
    }
    this.passTimer = setTimeout(
      () => void this.renewPass(),
      Math.max(1000, payload.exp - this.serverNow() - PLAY_SEAT_PASS_RENEW_MS)
    );
  }

  /*
   * Asking for admission renews a pass near its end; the fresh one reaches the socket through the pass watch, which also cancels any retry.
   * A busy or failed renewal tries again, after Convex's wait when it names one, since the room announces an expired pass only once.
   */
  private async renewPass(attempt = 0) {
    if (!this.listener) {
      return;
    }
    const generation = this.generation;
    const pass = this.renewing;
    let result: AdmissionResult | undefined;
    try {
      result = await this.requestAdmission(this.gameId, { renew: true });
    } catch {
      /* Convex did not answer; the retry below asks again. */
    }
    /* A replacement connection or pass owns its own renewal, so an earlier answer cannot deny it or change its timer. */
    if (!this.listener || generation !== this.generation || pass !== this.renewing) {
      return;
    }
    if (result?.ok) {
      return;
    }
    if (result?.reason === 'not_authorized') {
      this.changeStatus('denied', 'Sign in again to access the table.');
      this.socket?.close();
      return;
    }
    clearTimeout(this.passTimer);
    if (attempt < PASS_RENEWAL_ATTEMPTS) {
      this.passTimer = setTimeout(
        () => void this.renewPass(attempt + 1),
        Math.max(result?.retryAfterMs ?? 0, 1000 * 2 ** attempt)
      );
      return;
    }
    /* Out of quick retries: reconnecting hands recovery to the admission backoff, which keeps trying. */
    this.renewOnOpen = true;
    this.socket?.close();
  }

  private changeStatus(status: TableConnectionStatus, error: string | null = null) {
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

  /* Every retry asks Convex for a fresh pass, so the wait doubles to keep an outage from spending the pass rate limits. */
  private admissionRetryDelay() {
    return Math.min(1000 * 2 ** this.admissionRetries++, PLAY_ADMISSION_RETRY_MAX_MS);
  }

  private renewExpiredPass() {
    /* The room said the pass ran out; a held pass the browser still thinks current is renewed rather than offered again. */
    this.renewOnOpen = true;
    this.changeStatus('suspended');
    this.scheduleReconnect(this.admissionRetryDelay());
  }

  private async open() {
    if (!this.listener) {
      return;
    }
    const attempt: AdmissionAttempt = { generation: ++this.generation };
    this.admissionAttempt = attempt;
    this.sawView = false;
    this.serverOffset = Number.NEGATIVE_INFINITY;
    this.changeStatus('connecting', this.retryReason);
    const result = await this.acquireAdmission(attempt, this.pendingAdmissionRequest());
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
    this.schedulePassRenewal(result.pass);
    try {
      this.openSocket(result.pass);
    } catch {
      this.retryAfterFailure('The table could not connect. Reconnecting...');
    }
  }

  private isCurrentAttempt(attempt: AdmissionAttempt) {
    return this.listener !== null && attempt.generation === this.generation;
  }

  /**
   * Reuses the request an earlier attempt stopped waiting for (#1378).
   * Asking again would not overtake it: one client's mutations run in order, so each new request queues behind the old one.
   * A connection whose round trip outlasts the wait would then throw away every answer and never be admitted.
   * Only a request that has hung for longer than `ADMISSION_REQUEST_REUSE_MS` is replaced.
   */
  private pendingAdmissionRequest(): AdmissionRequest {
    const now = this.runtime.monotonicNow();
    if (this.admissionRequest && now - this.admissionRequest.requestedAt < ADMISSION_REQUEST_REUSE_MS) {
      return this.admissionRequest;
    }
    const renew = this.renewOnOpen;
    this.renewOnOpen = false;
    const request: AdmissionRequest = {
      result: renew ? this.requestAdmission(this.gameId, { renew }) : this.requestAdmission(this.gameId),
      requestedAt: now,
    };
    this.admissionRequest = request;
    /* A failed request is never reused; the next attempt asks again. */
    request.result.catch(() => {
      if (this.admissionRequest === request) {
        this.admissionRequest = undefined;
      }
    });
    return request;
  }

  private async acquireAdmission(
    attempt: AdmissionAttempt,
    request: AdmissionRequest
  ): Promise<AdmissionResult | null> {
    try {
      const result = await Promise.race([
        request.result,
        new Promise<never>((_, reject) => {
          attempt.timer = setTimeout(() => reject(new Error('Admission timed out.')), PLAY_REQUEST_TIMEOUT_MS);
        }),
      ]);
      /* An answer is used once; whatever happens next asks again. */
      if (this.admissionRequest === request) {
        this.admissionRequest = undefined;
      }
      return result;
    } catch {
      if (this.isCurrentAttempt(attempt)) {
        this.retryAfterFailure(UNREACHABLE);
      }
      return null;
    } finally {
      clearTimeout(attempt.timer);
    }
  }

  private openSocket(pass: string) {
    const socket = this.runtime.openSocket(this.gameId);
    this.socket = socket;
    socket.onopen = () => {
      if (!this.isCurrentSocket(socket)) {
        return;
      }
      /* The Worker answered, so whatever happens next is not a table that could not be reached. */
      this.retryReason = null;
      const admit: ClientMessage = {
        type: 'admit',
        supportsBoard: true,
        pass,
        ...(this.connectionId ? { replaces: this.connectionId } : {}),
      };
      socket.send(JSON.stringify(admit));
      this.startKeepalive(socket, 0);
    };
    socket.onmessage = (event) => this.receiveSocketMessage(socket, event.data);
    socket.onclose = (event) => {
      if (!this.isCurrentSocket(socket)) {
        return;
      }
      this.socket = null;
      clearTimeout(this.admissionTimer);
      clearInterval(this.keepaliveTimer);
      /* A refusal already supplied its reason; closing must not erase it. */
      if (this.status === 'denied') {
        return;
      }
      if (event.code === PASS_EXPIRED_CLOSE_CODE) {
        this.renewExpiredPass();
        return;
      }
      if (event.code === ADMISSION_REFUSED_CLOSE_CODE) {
        this.changeStatus('denied', 'This login can no longer access the table.');
        return;
      }
      const delay = event.code === RATE_LIMITED_CLOSE_CODE ? 5000 : 1000;
      /* A socket that closes before its table showed is a Worker that refused, failed or never answered; one that closes after reconnects as the connection opening. */
      if (this.sawView) {
        this.changeStatus('suspended');
        this.scheduleReconnect(delay);
        return;
      }
      this.retryAfterFailure(UNREACHABLE, delay);
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
    if (!this.isCurrentSocket(socket)) {
      return;
    }
    this.silentTicks = 0;
    if (this.status === 'denied' || data === KEEPALIVE_PONG) {
      return;
    }
    let message: ServerMessage;
    try {
      const frame: unknown = JSON.parse(data);
      message = serverMessageSchema.parse(frame);
      if (message.type !== 'admission') {
        const known = Number.isFinite(this.serverOffset);
        this.serverOffset = Math.max(this.serverOffset, serverClockSchema.parse(frame).serverNow - receivedAt);
        if (!known && this.renewing) {
          this.schedulePassRenewal(this.renewing);
        }
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
    this.retryAfterFailure(UNREACHABLE);
  }

  /* Coming back online or to the foreground reconnects at once when the plain retry is waiting, and otherwise asks the open socket to prove it still works. */
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
    if (message.type === 'rejected') {
      this.telemetry.rejected(message.requestId);
    }
    this.listener?.(message);
  }

  /* The Worker admits every socket as suspended until its authorization is confirmed, so on a first connect the pause is the connection still opening and reads as such. */
  private receiveAdmission(message: Extract<ServerMessage, { type: 'admission' }>) {
    if (message.status === 'refresh') {
      this.changeStatus('denied', 'This table needs a newer version of the page. Refresh to continue.');
      return;
    }
    if (message.status === 'pass-expired') {
      /* The room holds the table until a fresh pass arrives through the pass watch. */
      void this.renewPass();
      this.changeStatus('suspended', this.sawView ? 'Renewing access. Table actions are paused.' : null);
      return;
    }
    /* A pause cancels a pending resync, so the wait for its view must not close the socket; the Worker sends a view when the pause lifts. */
    if (this.sawView) {
      clearTimeout(this.admissionTimer);
    }
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
    this.telemetry.completed(message.completedCommandId);
    this.connectionId = message.viewer.connectionId;
    this.admissionRetries = 0;
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
    this.telemetry.completed(message.completedCommandId);
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
      historySteps: message.historySteps,
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
