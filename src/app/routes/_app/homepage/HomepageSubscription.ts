import { HOMEPAGE_RENEW_MS, homepageActionSchema, homepageCommandAllowed } from '@shared/homepage/protocol';
import {
  KEEPALIVE_PING,
  KEEPALIVE_PONG,
  KEEPALIVE_INTERVAL_MS,
  serverClockSchema,
  serverMessageSchema,
} from '@shared/play/protocol';
import type { ClientMessage } from '@shared/play/protocol';
import { applyRoomUpdate } from '@shared/play/updates';
import type { RoomView } from '@shared/play/updates';

import type { requestHomepageTicket } from '@db/homepage';
import type { GameRuntime, GameSocket } from '@db/tabletop/runtime';
import type { TableSubscription, TableSubscriptionEvent, TableConnectionStatus } from '@db/tabletop/TableSubscription';

/* Public observation and renewable handling permission share Play's table subscription contract. */
export class HomepageSubscription implements TableSubscription {
  private current: RoomView | null = null;
  private socket: GameSocket | null = null;
  private listener: ((event: TableSubscriptionEvent) => void) | null = null;
  private connectionStatus: TableConnectionStatus = 'connecting';
  private generation = 0;
  private offset = 0;
  private resyncing = false;
  private authPending = false;
  supportsCommand = homepageCommandAllowed;
  private connectionDeadline?: ReturnType<typeof setTimeout>;
  private reconnect?: ReturnType<typeof setTimeout>;
  private admission?: ReturnType<typeof setInterval>;
  private keepalive?: ReturnType<typeof setInterval>;
  private silentTicks = 0;
  private backoff = 1000;

  constructor(
    private readonly runtime: GameRuntime,
    private readonly requestTicket: typeof requestHomepageTicket | null
  ) {}

  get status() {
    return this.connectionStatus;
  }
  get ready() {
    return this.status === 'authorized' && this.current !== null && !this.resyncing;
  }
  getSnapshot = () => this.current;
  serverNow = () => this.runtime.monotonicNow() + this.offset;

  subscribe(listener: (event: TableSubscriptionEvent) => void) {
    this.listener = listener;
    this.open();
    const stopOnline = this.runtime.onOnline(() => {
      if (!this.socket) {
        clearTimeout(this.reconnect);
        this.open();
      }
    });
    return () => {
      this.listener = null;
      ++this.generation;
      clearTimeout(this.reconnect);
      clearTimeout(this.connectionDeadline);
      clearInterval(this.admission);
      clearInterval(this.keepalive);
      this.socket?.close();
      this.socket = null;
      stopOnline();
    };
  }

  private open() {
    if (!this.listener || this.socket) {
      return;
    }
    const generation = ++this.generation;
    this.current = null;
    this.resyncing = false;
    this.offset = Number.NEGATIVE_INFINITY;
    this.connectionStatus = 'connecting';
    this.listener({ type: 'connection', error: null });
    let socket: GameSocket;
    try {
      socket = this.runtime.openSocket('homepage');
    } catch {
      this.retry();
      return;
    }
    this.socket = socket;
    this.connectionDeadline = setTimeout(() => this.closed(socket), 10_000);
    const live = () => this.listener !== null && this.socket === socket && generation === this.generation;
    socket.onopen = () => {
      if (!live()) {
        return;
      }
      this.silentTicks = 0;
      void this.authenticate(socket, generation);
      this.admission = setInterval(() => {
        void this.authenticate(socket, generation);
      }, HOMEPAGE_RENEW_MS);
      this.keepalive = setInterval(() => {
        if (!live() || socket.readyState !== 1) {
          return;
        }
        if (++this.silentTicks >= 2) {
          this.closed(socket);
          return;
        }
        socket.send(KEEPALIVE_PING);
      }, KEEPALIVE_INTERVAL_MS);
    };
    socket.onmessage = (event) => {
      if (!live()) {
        return;
      }
      this.silentTicks = 0;
      if (event.data === KEEPALIVE_PONG) {
        return;
      }
      try {
        const raw: unknown = JSON.parse(event.data);
        const message = serverMessageSchema.parse(raw);
        this.offset = Math.max(this.offset, serverClockSchema.parse(raw).serverNow - this.runtime.monotonicNow());
        if (message.type === 'view' || message.type === 'update') {
          const previous = this.current;
          const view =
            message.type === 'view'
              ? message
              : applyRoomUpdate(this.resyncing ? undefined : (previous ?? undefined), message);
          if (!view) {
            this.listener?.({ type: 'resync', completedCommandId: message.completedCommandId });
            if (!this.resyncing) {
              socket.send(JSON.stringify({ type: 'sync' }));
            }
            this.resyncing = true;
            return;
          }
          clearTimeout(this.connectionDeadline);
          this.current = view;
          this.resyncing = false;
          this.connectionStatus = 'authorized';
          this.backoff = 1000;
          this.listener?.({
            ...view,
            previous,
            snapshotChanged: message.type === 'view' || Boolean(message.snapshot || message.completedCommandId),
          });
        } else if (message.type !== 'admission') {
          this.listener?.(message);
        }
      } catch {
        this.closed(socket);
      }
    };
    socket.onclose = () => {
      if (live()) {
        this.closed(socket);
      }
    };
    socket.onerror = () => {
      if (live()) {
        this.closed(socket);
      }
    };
  }

  private async authenticate(socket: GameSocket, generation: number) {
    if (!this.requestTicket || this.authPending) {
      return;
    }
    this.authPending = true;
    try {
      const result = await this.requestTicket();
      if (generation === this.generation && this.socket === socket && socket.readyState === 1 && result) {
        socket.send(JSON.stringify({ type: 'authenticate', ticket: result.ticket }));
      }
    } catch {
      /* Observation survives a failed renewal. The server expires handling permission independently. */
    } finally {
      this.authPending = false;
    }
  }

  private closed(socket: GameSocket) {
    if (this.socket !== socket) {
      return;
    }
    this.socket = null;
    ++this.generation;
    clearTimeout(this.connectionDeadline);
    clearInterval(this.admission);
    clearInterval(this.keepalive);
    socket.close();
    this.current = null;
    this.connectionStatus = 'suspended';
    this.listener?.({ type: 'connection', error: null });
    this.retry();
  }

  private retry() {
    if (!this.listener) {
      return;
    }
    clearTimeout(this.reconnect);
    this.reconnect = setTimeout(() => this.open(), this.backoff);
    this.backoff = Math.min(30_000, this.backoff * 2);
  }

  send(message: Exclude<ClientMessage, { type: 'admit' | 'sync' }>) {
    if (!this.ready || !this.current || this.socket?.readyState !== 1) {
      return false;
    }
    const parsed = homepageActionSchema.safeParse(message);
    if (!parsed.success) {
      return false;
    }
    if (['pose', 'pointer'].includes(message.type) && this.socket.bufferedAmount > 64 * 1024) {
      return false;
    }
    this.socket.send(JSON.stringify({ type: 'act', epoch: this.current.epoch, message: parsed.data }));
    return true;
  }
}
