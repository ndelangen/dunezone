import type { TableStore } from './storedTable';

export type GameSocket = Pick<
  WebSocket,
  'readyState' | 'bufferedAmount' | 'send' | 'close' | 'onopen' | 'onmessage' | 'onclose' | 'onerror'
>;

/** Browser effects used by a single hosted table; stories supply their own socket. */
export type GameRuntime = {
  openSocket(gameId: string): GameSocket;
  monotonicNow(): number;
  onHidden(listener: () => void): () => void;
  onOnline(listener: () => void): () => void;
  /* A tab coming back to the foreground, whose socket may have died while its timers were frozen. */
  onVisible(listener: () => void): () => void;
  /* Where a tab keeps its last table for a reload; a runtime without one starts every load at the connecting frame. */
  tables?: TableStore;
};
