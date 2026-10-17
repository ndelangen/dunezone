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
  onLongTask(listener) {
    /* Chromium reports long tasks; elsewhere the page reports none, which the room reads as no measurement. */
    if (typeof PerformanceObserver === 'undefined' || !PerformanceObserver.supportedEntryTypes?.includes('longtask')) {
      return () => undefined;
    }
    const observer = new PerformanceObserver((entries) => {
      for (const entry of entries.getEntries()) {
        listener(entry.duration);
      }
    });
    observer.observe({ type: 'longtask', buffered: false });
    return () => observer.disconnect();
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
