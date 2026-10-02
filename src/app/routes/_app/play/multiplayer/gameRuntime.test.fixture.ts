import { clientMessageSchema, KEEPALIVE_PING, KEEPALIVE_PONG } from '@shared/play/protocol';
import type { ClientMessage, ServerMessage } from '@shared/play/protocol';

import type { GameRuntime, GameSocket } from './gameRuntime';

export class Socket {
  static OPEN = 1 as const;
  static instances: Socket[] = [];
  readyState: GameSocket['readyState'] = 0;
  bufferedAmount = 0;
  sent: ClientMessage[] = [];
  keepalives = 0;
  /* The Worker answers every keepalive on its own; a test turns this off to stand for a connection that went away silently. */
  answersKeepalives = true;
  onopen: (() => void) | null = null;
  onmessage: ((event: { data: string }) => void) | null = null;
  onclose: ((event: { code: number }) => void) | null = null;
  onerror: (() => void) | null = null;

  constructor(readonly gameId: string) {
    Socket.instances.push(this);
  }

  open() {
    this.readyState = Socket.OPEN;
    this.onopen?.();
  }

  send(data: string) {
    if (data === KEEPALIVE_PING) {
      this.keepalives++;
      if (this.answersKeepalives) {
        this.onmessage?.({ data: KEEPALIVE_PONG });
      }
      return;
    }
    this.sent.push(clientMessageSchema.parse(JSON.parse(data)));
  }

  close(code = 1000) {
    this.readyState = 3;
    this.onclose?.({ code });
  }

  /* Stamps every frame but admission as the Worker's send path does; the default reads the test's own clock as the server's. */
  deliver(message: ServerMessage, serverNow = Date.now()) {
    this.onmessage?.({ data: JSON.stringify(message.type === 'admission' ? message : { ...message, serverNow }) });
  }
}

export const hidden = new Set<() => void>();
export const online = new Set<() => void>();
export const runtime: GameRuntime = {
  openSocket: (gameId) => new Socket(gameId),
  monotonicNow: () => performance.now(),
  onHidden(listener) {
    hidden.add(listener);
    return () => {
      hidden.delete(listener);
    };
  },
  onOnline(listener) {
    online.add(listener);
    return () => {
      online.delete(listener);
    };
  },
};
