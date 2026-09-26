import { createContext, useContext, useSyncExternalStore } from 'react';

/**
 * The connected table's server time, which `HostedTable` provides from its derived table.
 * A derived table exists only after a view anchored the clock, so no reader meets a clock without one.
 */
export const ServerClockContext = createContext<() => number>(() => {
  throw new Error('Server time is read only inside a connected table.');
});

function everySecond(tick: () => void) {
  const timer = setInterval(tick, 1000);
  return () => clearInterval(timer);
}

/** Server time in whole seconds, re-read once a second while the caller is mounted. */
export function useServerNow() {
  const serverNow = useContext(ServerClockContext);
  return useSyncExternalStore(everySecond, () => Math.floor(serverNow() / 1000) * 1000);
}
