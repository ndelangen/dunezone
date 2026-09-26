import { createContext } from 'react';

export type GameSocket = Pick<
  WebSocket,
  'readyState' | 'bufferedAmount' | 'send' | 'close' | 'onopen' | 'onmessage' | 'onclose' | 'onerror'
>;

/** Browser effects used by a single hosted table; stories supply their own socket. */
export type GameRuntime = {
  openSocket(gameId: string): GameSocket;
  monotonicNow(): number;
  onHidden(listener: () => void): () => void;
};

export const browserGameRuntime: GameRuntime = {
  openSocket(gameId) {
    const url = new URL(`/__play/games/${encodeURIComponent(gameId)}/socket`, window.location.href);
    url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:';
    return new WebSocket(url);
  },
  monotonicNow: () => performance.now(),
  onHidden(listener) {
    const changed = () => {
      if (document.hidden) {
        listener();
      }
    };
    document.addEventListener('visibilitychange', changed);
    return () => document.removeEventListener('visibilitychange', changed);
  },
};

export const GameRuntimeContext = createContext(browserGameRuntime);
