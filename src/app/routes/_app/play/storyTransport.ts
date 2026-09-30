import { LOG_PAGE_SIZE } from '@shared/play/log';
import type { LogEntry, LogTab } from '@shared/play/log';
import { isSeatAction } from '@shared/play/participation';
import { clientMessageSchema, KEEPALIVE_PING } from '@shared/play/protocol';
import type { ClientMessage, GameSnapshot, ServerMessage, Viewer } from '@shared/play/protocol';
import { isSwapAction } from '@shared/play/swapping';

import { STORYBOOK_NOW } from '@db/storybook';

import { browserGameRuntime } from './multiplayer/gameRuntime';
import type { GameRuntime, GameSocket } from './multiplayer/gameRuntime';

/*
 * Scripted transport for route stories. Commands are recorded, never executed here. `holdView` leaves an admitted socket without a view, so a story can show the frame that waits for one.
 * `admitView` replaces the view built from `snapshot` with a recorded frame, and a `logEntries` callback is read on every page request, so a replayed journey can move its log with its step.
 */
export function storyTransport(
  viewerSeat: Viewer['viewerSeat'],
  snapshot: GameSnapshot,
  {
    holdView = false,
    holdLogHistory = false,
    logEntries = {},
    conversationMessages = [],
    admitView,
    answerCommand,
  }: {
    holdView?: boolean;
    holdLogHistory?: boolean;
    /* Newest first, as the table answers; a page is cut at the requested cursor. */
    logEntries?: Partial<Record<LogTab, LogEntry[]>> | (() => Partial<Record<LogTab, LogEntry[]>>);
    admitView?: () => Extract<ServerMessage, { type: 'view' }>;
    /* Answers every command in place of the scripted reply below, as a replayed journey follows its recording. */
    answerCommand?: (message: Extract<ClientMessage, { type: 'command' }>) => Extract<ServerMessage, { type: 'view' }>;
    conversationMessages?: Extract<ServerMessage, { type: 'conversation-history' }>['entries'];
  } = {}
) {
  const messages: ClientMessage[] = [];
  const sockets: StorySocket[] = [];
  const viewer: Viewer = {
    connectionId: 'story-connection',
    userId: 'story-user',
    displayName: snapshot.controls?.players.find((player) => player.seat === viewerSeat)?.name ?? 'Klyzx',
    viewerSeat,
    color: '#ed927c',
  };

  function view(next: GameSnapshot, completedCommandId?: string): Extract<ServerMessage, { type: 'view' }> {
    return {
      type: 'view',
      viewer,
      epoch: 'story-epoch',
      snapshot: next,
      carries: [],
      pointers: [],
      completedCommandId,
      battleCountdownMs: next.battle?.stage === 'countdown' ? 5000 : 0,
    };
  }

  class StorySocket {
    static OPEN = 1 as const;
    readyState: GameSocket['readyState'] = 0;
    bufferedAmount = 0;
    onopen: (() => void) | null = null;
    onmessage: ((event: { data: string }) => void) | null = null;
    onclose: ((event: { code: number }) => void) | null = null;
    onerror: (() => void) | null = null;

    constructor(url: URL) {
      if (!url.pathname.startsWith('/__play/games/')) {
        throw new Error('A story transport only accepts game sockets.');
      }
      sockets.push(this);
      queueMicrotask(() => {
        if (this.readyState !== 0) {
          return;
        }
        this.readyState = StorySocket.OPEN;
        this.onopen?.();
      });
    }

    send(data: string) {
      if (data === KEEPALIVE_PING) {
        return;
      }
      const message = clientMessageSchema.parse(JSON.parse(data));
      messages.push(message);
      if (message.type === 'admit' && !holdView) {
        queueMicrotask(() => this.deliver(admitView?.() ?? view(snapshot)));
      }
      if (message.type === 'conversation-history') {
        const entries = conversationMessages.filter((entry) => entry.sequence < message.before);
        queueMicrotask(() => this.deliver({ ...message, entries: entries.slice(-50), more: entries.length > 50 }));
      }
      if (message.type === 'log-history' && !holdLogHistory) {
        const entries = ((typeof logEntries === 'function' ? logEntries() : logEntries)[message.tab] ?? []).filter(
          (entry) => entry.sequence < message.before
        );
        queueMicrotask(() =>
          this.deliver({
            type: 'log-history',
            tab: message.tab,
            before: message.before,
            entries: entries.slice(0, LOG_PAGE_SIZE),
            more: entries.length > LOG_PAGE_SIZE,
          })
        );
      }
      if (message.type === 'command' && answerCommand) {
        queueMicrotask(() => this.deliver(answerCommand(message)));
        return;
      }
      /* A seat command is answered as the table answers it, with the same view marked complete, so the panel does not wait forever. */
      if (message.type === 'command' && (isSeatAction(message.action) || isSwapAction(message.action))) {
        queueMicrotask(() => this.deliver(view(snapshot, message.commandId)));
      }
    }

    /*
     * Every frame but admission carries the Worker's clock; the fixtures date their deadlines and votes from the same instant.
     * A recorded frame keeps the clock it was recorded with, since its deadlines are dated from that reading.
     */
    deliver(message: ServerMessage) {
      if (this.readyState === StorySocket.OPEN) {
        this.onmessage?.({
          data: JSON.stringify(message.type === 'admission' ? message : { serverNow: STORYBOOK_NOW, ...message }),
        });
      }
    }

    close(code = 1000) {
      this.readyState = 3;
      this.onclose?.({ code });
    }
  }

  const runtime: GameRuntime = {
    ...browserGameRuntime,
    openSocket: (gameId) =>
      new StorySocket(new URL(`/__play/games/${encodeURIComponent(gameId)}/socket`, 'https://dune.zone')),
  };
  return {
    messages,
    snapshot,
    runtime,
    dispose() {
      for (const socket of sockets) {
        socket.onclose = null;
        socket.close();
      }
    },
    deliver(message: ServerMessage) {
      const socket = sockets.at(-1);
      if (!socket) {
        throw new Error('The story has not connected.');
      }
      socket.deliver(message);
    },
    disconnect() {
      sockets.at(-1)?.close();
    },
    /** Whether the page holds an open socket a frame can be delivered to. */
    connected: () => sockets.at(-1)?.readyState === StorySocket.OPEN,
    view,
  };
}
