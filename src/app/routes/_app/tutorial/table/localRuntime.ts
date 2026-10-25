import type { PublicFaction } from '@shared/play/capture';
import { LOG_PAGE_SIZE } from '@shared/play/log';
import { clientMessageSchema, KEEPALIVE_PING, KEEPALIVE_PONG } from '@shared/play/protocol';
import type { ServerMessage } from '@shared/play/protocol';

import { browserGameRuntime } from '../../play/multiplayer/gameRuntime';
import type { GameRuntime, GameSocket } from '../../play/multiplayer/gameRuntime';
import type { LocalTable, TableMessage } from './localTable';

/** A page's local game: its browser effects, and what a chapter's Reset needs to start the page's connection afresh. */
export type LocalRuntime = GameRuntime &
  Readonly<{
    /** Whether the page is replaying the table's history rather than showing it live. */
    replaying: () => boolean;
    /** Closes the page's connection, which it opens again at once onto whatever table is current. */
    reconnect: () => void;
  }>;

/*
 * The browser effects of a game whose table runs in the page: its socket is answered by a local table, as the game Worker
 * answers a real one, and it admits itself, so nothing reaches Convex or the Worker.
 * `table` is read on every message, so a chapter's Reset can swap the table without the page reconnecting.
 */
export function localRuntime(
  table: () => LocalTable,
  factions: Readonly<Partial<Record<string, PublicFaction | null>>>
): LocalRuntime {
  let socket: LocalSocket | null = null;

  class LocalSocket {
    /** Whether the page asked this connection for a replay, which only a fresh connection takes it out of. */
    replayed = false;
    readyState: GameSocket['readyState'] = 0;
    bufferedAmount = 0;
    onopen: (() => void) | null = null;
    onmessage: ((event: { data: string }) => void) | null = null;
    onclose: ((event: { code: number }) => void) | null = null;
    onerror: (() => void) | null = null;

    open() {
      queueMicrotask(() => {
        if (this.readyState === 0) {
          this.readyState = WebSocket.OPEN;
          this.onopen?.();
        }
      });
      return this;
    }

    send(data: string) {
      if (data === KEEPALIVE_PING) {
        queueMicrotask(() => this.answer(KEEPALIVE_PONG));
        return;
      }
      /* The Worker closes a socket that sends what the protocol does not allow, rather than throwing at the page. */
      const parsed = clientMessageSchema.safeParse(JSON.parse(data));
      if (!parsed.success) {
        queueMicrotask(() => this.close(1008));
        return;
      }
      const message = parsed.data;
      switch (message.type) {
        case 'admit':
          table().deliver = (next) => queueMicrotask(() => socket?.deliver(next));
          return this.later(table().frame());
        case 'faction':
          return this.later({ ...message, faction: factions[message.factionId] ?? null });
        case 'conversation-history':
        case 'spice-history':
          return this.later({ ...message, entries: [], more: false });
        /* A local table keeps no replay, so its history is the table as it stands. */
        case 'history':
          this.replayed = true;
          return this.later({ type: 'history', step: 0, lastStep: 0, snapshot: table().frame().snapshot });
        case 'catalogue':
          return this.later({
            type: 'catalogue',
            requestId: message.requestId,
            error: 'Bringing your own pieces is not part of this chapter.',
          });
        case 'log-history': {
          const entries = (table().log()[message.tab] ?? []).filter((entry) => entry.sequence < message.before);
          return this.later({
            type: 'log-history',
            tab: message.tab,
            before: message.before,
            entries: entries.slice(0, LOG_PAGE_SIZE),
            more: entries.length > LOG_PAGE_SIZE,
          });
        }
        default:
          table().receive(message as TableMessage);
      }
    }

    /* Answers leave after the message that caused them, as they do from a socket. */
    private later(message: ServerMessage) {
      queueMicrotask(() => this.deliver(message));
    }

    /* Every frame carries the table's clock, which is the browser's. */
    deliver(message: ServerMessage) {
      this.answer(JSON.stringify(message.type === 'admission' ? message : { serverNow: Date.now(), ...message }));
    }

    private answer(data: string) {
      if (this.readyState === WebSocket.OPEN) {
        this.onmessage?.({ data });
      }
    }

    close(code = 1000) {
      this.readyState = WebSocket.CLOSED;
      if (socket === this) {
        socket = null;
      }
      this.onclose?.({ code });
    }
  }

  return {
    ...browserGameRuntime,
    /* A table in the page has nothing to keep for a reload; reopening the chapter starts it again. */
    tables: undefined,
    openSocket: () => {
      socket = new LocalSocket();
      return socket.open();
    },
    /* The page's ticket has the shape the socket's messages require; nothing checks it but that. */
    replaying: () => socket?.replayed ?? false,
    reconnect: () => socket?.close(),
    admission: {
      request: () => Promise.resolve({ ok: true as const, ticket: '0'.repeat(64), expiresInMs: 3_600_000 }),
    },
  };
}
