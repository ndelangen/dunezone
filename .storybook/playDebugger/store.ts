import { useSyncExternalStore } from 'react';
import { STORY_CHANGED } from 'storybook/internal/core-events';
import { addons } from 'storybook/manager-api';

import { PLAY_DEBUGGER_EVENTS } from './events';
import type { DebuggerState, TrafficEntry } from './events';

/*
 * What the panel knows of the story's game, kept outside React so nothing is lost while the panel is closed or another
 * addon's tab is showing.
 */

/* The panel keeps the newest messages; older ones drop off the top of the history. */
const KEPT = 2000;

export type DebuggerSnapshot = { state: DebuggerState | null; traffic: TrafficEntry[] };

let snapshot: DebuggerSnapshot = { state: null, traffic: [] };
const listeners = new Set<() => void>();

function set(next: Partial<DebuggerSnapshot>) {
  snapshot = { ...snapshot, ...next };
  for (const listener of listeners) {
    listener();
  }
}

/** Starts listening on the manager's channel; the addon calls it once as it registers. */
export function listenForPlay() {
  const channel = addons.getChannel();
  channel.on(STORY_CHANGED, () => set({ state: null, traffic: [] }));
  channel.on(PLAY_DEBUGGER_EVENTS.reset, () => set({ state: null, traffic: [] }));
  channel.on(PLAY_DEBUGGER_EVENTS.state, (state: DebuggerState) => set({ state }));
  channel.on(PLAY_DEBUGGER_EVENTS.traffic, (entries: TrafficEntry[]) =>
    set({ traffic: [...snapshot.traffic, ...entries].slice(-KEPT) })
  );
}

/** Empties the history the panel shows, and the preview's copy it replays to a panel that opens later; the story keeps running. */
export function clearTraffic() {
  addons.getChannel().emit(PLAY_DEBUGGER_EVENTS.clear);
  set({ traffic: [] });
}

export const usePlayDebugger = () =>
  useSyncExternalStore(
    (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    () => snapshot
  );
