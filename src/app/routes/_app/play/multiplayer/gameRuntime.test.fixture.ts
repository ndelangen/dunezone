import { clientMessageSchema } from '@shared/play/protocol';
import type { ClientMessage, ServerMessage } from '@shared/play/protocol';

import type { GameRuntime, GameSocket } from './gameRuntime';

export class Socket {
  static OPEN = 1 as const;
  static instances: Socket[] = [];
  readyState: GameSocket['readyState'] = 0;
  bufferedAmount = 0;
  sent: ClientMessage[] = [];
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
export const runtime: GameRuntime = {
  openSocket: (gameId) => new Socket(gameId),
  monotonicNow: () => performance.now(),
  onHidden(listener) {
    hidden.add(listener);
    return () => {
      hidden.delete(listener);
    };
  },
};
