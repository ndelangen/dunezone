import { initialSnapshot } from '@shared/play/commands';
import { isSeatAction } from '@shared/play/participation';
import { clientMessageSchema } from '@shared/play/protocol';
import type { ClientMessage, GameSnapshot, ServerMessage, Viewer } from '@shared/play/protocol';
import { isSwapAction } from '@shared/play/swapping';

import { STORYBOOK_NOW } from '@db/storybook';

import { browserGameRuntime } from './multiplayer/gameRuntime';
import type { GameRuntime, GameSocket } from './multiplayer/gameRuntime';

/* Scripted transport for route stories. Commands are recorded, never executed here. `holdView` leaves an admitted socket without a view, so a story can show the frame that waits for one. */
export function hostedStoryTransport(
  viewerSeat: Viewer['viewerSeat'],
  snapshot: GameSnapshot = initialSnapshot(),
  { holdView = false }: { holdView?: boolean } = {}
) {
  const messages: ClientMessage[] = [];
  const sockets: StorySocket[] = [];
  const viewer: Viewer = {
    connectionId: 'story-connection',
    userId: 'story-user',
    displayName: 'Storybook player',
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
        throw new Error('The hosted story only accepts game sockets.');
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
      const message = clientMessageSchema.parse(JSON.parse(data));
      messages.push(message);
      if (message.type === 'admit' && !holdView) {
        queueMicrotask(() => this.deliver(view(snapshot)));
      }
      /* A seat command is answered as the table answers it, with the same view marked complete, so the panel does not wait forever. */
      if (message.type === 'command' && (isSeatAction(message.action) || isSwapAction(message.action))) {
        queueMicrotask(() => this.deliver(view(snapshot, message.commandId)));
      }
    }

    deliver(message: ServerMessage) {
      if (this.readyState === StorySocket.OPEN) {
        this.onmessage?.({ data: JSON.stringify(message) });
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
    /* Ticket issuance uses real Convex handlers; this table shares their fixed clock. */
    now: () => STORYBOOK_NOW,
  };
  return {
    messages,
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
        throw new Error('The hosted story has not connected.');
      }
      socket.deliver(message);
    },
    view,
  };
}
