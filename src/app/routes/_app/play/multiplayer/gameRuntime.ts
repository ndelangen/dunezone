import { createContext } from 'react';

import { storageNow, storedAuthToken } from '@db/playTables';

import { sessionTableStore, tokenAccount } from './storedTable';
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
  /* Where a tab keeps its last table for a reload; a runtime without one starts every load at the connecting frame. */
  tables?: TableStore;
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
  onOnline(listener) {
    window.addEventListener('online', listener);
    return () => window.removeEventListener('online', listener);
  },
  tables:
    typeof window === 'undefined'
      ? undefined
      : sessionTableStore({
          storage: () => {
            try {
              return window.sessionStorage;
            } catch {
              return null;
            }
          },
          account: () => tokenAccount(storedAuthToken()),
          now: storageNow,
          onLeave(listener) {
            window.addEventListener('pagehide', listener);
            document.addEventListener('visibilitychange', () => {
              if (document.hidden) {
                listener();
              }
            });
          },
        }),
};

export const GameRuntimeContext = createContext(browserGameRuntime);
