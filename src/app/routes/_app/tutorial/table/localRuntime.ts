import type { AssetCapture } from '@shared/play/assetCapture';
import type { PublicFaction } from '@shared/play/capture';
import { clientMessageSchema, KEEPALIVE_PING, KEEPALIVE_PONG } from '@shared/play/protocol';
import type { ServerMessage } from '@shared/play/protocol';
import { GameRejection } from '@shared/play/rejection';

import { browserGameRuntime } from '../../play/multiplayer/gameRuntime';
import type { GameRuntime, GameSocket } from '../../play/multiplayer/gameRuntime';
import { LocalConversations } from './localConversations';
import type { LocalTable, TableMessage } from './localTable';

/* A capture's refusal is the reason a player reads; anything else is the Worker's generic answer. */
const refusal = (error: unknown) =>
  error instanceof GameRejection ? error.message : 'The catalogue could not be read. Try again.';
const RESET_REFUSAL = 'The table was reset. Pick the piece again.';

/** A page's local game: its browser effects, and what a chapter's Reset needs to start the page's connection afresh. */
export type LocalRuntime = GameRuntime &
  Readonly<{
    /** The signed-in player's own name, which the other players greet when they answer the chat. */
    greet: (name: string | undefined) => void;
    /** Stops the conversations' answers still on their way. */
    dispose: () => void;
    /** Whether the page is replaying the table's history rather than showing it live. */
    replaying: () => boolean;
    /** Closes the page's connection, which it opens again at once onto whatever table is current. */
    reconnect: () => void;
    /** Answers every catalogue read still out at once, for a Reset that left them behind; their late answers are dropped. */
    settleCaptures: () => void;
  }>;

/*
 * The browser effects of a game whose table runs in the page: its socket is answered by a local table, as the game Worker
 * answers a real one, and it admits itself, so nothing reaches the Worker. A catalogue pick is captured by `catalogue`,
 * which reads the public catalogue as the picker does.
 * `table` is read on every message, so a chapter's Reset can swap the table without the page reconnecting.
 * Its conversations outlive a Reset, as a game's chat outlives anything moved on its table.
 */
export function localRuntime(
  table: () => LocalTable,
  factions: Readonly<Partial<Record<string, PublicFaction | null>>>,
  catalogue: Pick<AssetCapture, 'capture'>
): LocalRuntime {
  let socket: LocalSocket | null = null;
  const conversations = new LocalConversations(table, (message) => queueMicrotask(() => socket?.deliver(message)));

  class LocalSocket {
    /** Whether the page asked this connection for a replay, which only a fresh connection takes it out of. */
    replayed = false;
    readyState: GameSocket['readyState'] = 0;
    bufferedAmount = 0;
    onopen: (() => void) | null = null;
    onmessage: ((event: { data: string }) => void) | null = null;
    onclose: ((event: { code: number }) => void) | null = null;
    onerror: (() => void) | null = null;
    /*
     * Catalogue reads still out, by the request they answer, each with what it answers if a Reset leaves it behind.
     * The page holds one read at a time and refuses the next until it is answered, so a read that stalls past a Reset is answered then.
     */
    private readonly captures = new Map<string, () => ServerMessage>();

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
          this.later(table().frame());
          return conversations.admitted();
        case 'faction':
          return this.later({ ...message, faction: factions[message.factionId] ?? null });
        case 'conversation-history':
        case 'conversation-send':
        case 'conversation-read':
          return conversations.receive(message);
        case 'spice-history':
          return this.later({ ...message, entries: [], more: false });
        /* History is recorded by the local session at the same boundaries as multiplayer. */
        case 'history':
          this.replayed = true;
          return void table().receive(message);
        /* The catalogue answers after its read, as the Worker's capture does; a refusal is the answer's error. */
        case 'catalogue': {
          const { requestId } = message;
          this.captures.set(requestId, () => ({ type: 'catalogue', requestId, contents: null, error: RESET_REFUSAL }));
          return void catalogue.capture(message.selection).then(
            (contents) =>
              this.settled(requestId) &&
              this.deliver({ type: 'catalogue', requestId, contents: table().projectContents(contents) }),
            (error: unknown) =>
              this.settled(requestId) &&
              this.deliver({ type: 'catalogue', requestId, contents: null, error: refusal(error) })
          );
        }
        case 'log-history':
          return this.later({ ...message, ...table().logPage(message.tab, message.before) });
        /* A catalogue request commits once its asset is captured, as the Worker commits it, and a refusal answers the command. */
        case 'command':
          if (message.action.kind === 'spawn-request') {
            /*
             * A Reset while the asset is read replaces the table; the request belonged to the one it left, so it spawns nothing.
             * The Reset answers it with the new table as it stands, or the page would wait on it and refuse every later request.
             */
            const { commandId } = message;
            const origin = table();
            this.captures.set(commandId, () => table().frame(undefined, commandId));
            return void catalogue.capture(message.action).then(
              /* Only onto the table it was asked of: a Reset that came by another way, such as a reconnect, still leaves it behind. */
              (contents) => this.settled(commandId) && table() === origin && origin.requestSpawn(message, contents),
              (error: unknown) =>
                this.settled(commandId) &&
                this.deliver({ type: 'rejected', requestId: commandId, message: refusal(error) })
            );
          }
          return void table().receive(message);
        default:
          table().receive(message as TableMessage);
      }
    }

    /* Whether a read is still waited on; one a Reset already answered is not answered twice. */
    private settled(id: string) {
      return this.captures.delete(id);
    }

    /*
     * Answering a read frees the page's slot, and the page sends the read it queued behind it at once; that one was asked of the old table too,
     * so it is answered in turn until nothing asked before the Reset is still out.
     */
    /* What this connection asked is answered to no one once it closes or the page leaves; the page asks again on its next connection. */
    forgetCaptures() {
      this.captures.clear();
    }

    settleCaptures() {
      for (const [id, answer] of this.captures) {
        this.captures.delete(id);
        this.deliver(answer());
      }
    }

    /* Answers leave after the message that caused them, as they do from a socket. */
    private later(message: ServerMessage) {
      queueMicrotask(() => this.deliver(message));
    }

    /* Every frame carries the table's clock, which is the browser's. */
    deliver(message: ServerMessage) {
      if (message.type === 'view') {
        conversations.authority();
      }
      this.answer(JSON.stringify(message.type === 'admission' ? message : { serverNow: Date.now(), ...message }));
    }

    private answer(data: string) {
      if (this.readyState === WebSocket.OPEN) {
        this.onmessage?.({ data });
      }
    }

    close(code = 1000) {
      this.readyState = WebSocket.CLOSED;
      this.forgetCaptures();
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
    /* The page's pass has the shape the socket's messages require; nothing checks it but that. */
    replaying: () => socket?.replayed ?? false,
    reconnect: () => socket?.close(),
    settleCaptures: () => socket?.settleCaptures(),
    greet: (name) => {
      conversations.learnerName = name;
    },
    dispose: () => {
      socket?.forgetCaptures();
      conversations.dispose();
    },
    admission: {
      request: () => Promise.resolve({ ok: true as const, pass: 'tutorial.local' }),
    },
  };
}
