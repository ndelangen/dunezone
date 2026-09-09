import { initialSnapshot } from '@shared/play/commands';
import { clientMessageSchema } from '@shared/play/protocol';
import type { ClientMessage, GameSnapshot, ServerMessage, Viewer } from '@shared/play/protocol';

import { STORYBOOK_NOW } from '@db/storybook';

/* Scripted transport for route stories. Commands are recorded, never executed here. */
export function hostedStoryTransport(viewerSeat: Viewer['viewerSeat'], snapshot: GameSnapshot = initialSnapshot()) {
  const nativeSocket = globalThis.WebSocket;
  const messages: ClientMessage[] = [];
  const sockets: StorySocket[] = [];
  const viewer: Viewer = {
    connectionId: 'story-connection',
    userId: 'story-user',
    displayName: 'Storybook player',
    viewerSeat,
    color: '#ed927c',
  };

  function view(next: GameSnapshot, completedCommandId?: string): ServerMessage {
    return {
      type: 'view',
      viewer,
      epoch: 'story-epoch',
      snapshot: next,
      carries: [],
      pointers: [],
      completedCommandId,
    };
  }

  class StorySocket {
    static OPEN = 1;
    readyState = 0;
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
      if (message.type === 'admit') {
        queueMicrotask(() => this.deliver(view(snapshot)));
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

  return {
    messages,
    install() {
      /* Ticket issuance uses real Convex handlers; browser expiry checks share the worker's clock. */
      const now = Date.now;
      Date.now = () => STORYBOOK_NOW;
      Object.defineProperty(globalThis, 'WebSocket', { configurable: true, writable: true, value: StorySocket });
      return () => {
        for (const socket of sockets) {
          socket.onclose = null;
          socket.close();
        }
        Object.defineProperty(globalThis, 'WebSocket', { configurable: true, writable: true, value: nativeSocket });
        Date.now = now;
      };
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
