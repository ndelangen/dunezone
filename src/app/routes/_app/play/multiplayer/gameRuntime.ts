import { createContext } from 'react';

import { storageNow, storedAuthToken } from '@db/playTables';
import type { GameRuntime } from '@db/tabletop/runtime';

import { sessionTableStore, tokenAccount } from '../../../../db/tabletop/storedTable';
export type { GameRuntime, GameSocket } from '@db/tabletop/runtime';

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
  onVisible(listener) {
    const changed = () => {
      if (document.visibilityState === 'visible') {
        listener();
      }
    };
    document.addEventListener('visibilitychange', changed);
    return () => document.removeEventListener('visibilitychange', changed);
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
