import { createContext, useContext, useSyncExternalStore } from 'react';

type ServerClock = () => number;

/**
 * The connected table's server time, which `HostedTable` provides from its derived table.
 * A derived table exists only after a view anchored the clock, so no reader meets a clock without one.
 */
export const ServerClockContext = createContext<ServerClock>(() => {
  throw new Error('Server time is read only inside a connected table.');
});

/*
 * One exact reading per clock, retaken on a single one-second interval that every caller shares.
 * The reading is never rounded, because the Worker's stamps and deadlines fall anywhere inside a second and a rounded reading skews a countdown by up to a second.
 * The reading is dropped when the last caller leaves, so the next caller starts from a fresh one.
 */
function secondReadings(serverNow: ServerClock) {
  const listeners = new Set<() => void>();
  let reading: number | undefined;
  let timer: ReturnType<typeof setInterval> | undefined;
  return {
    subscribe(listener: () => void) {
      listeners.add(listener);
      timer ??= setInterval(() => {
        reading = serverNow();
        listeners.forEach((notify) => notify());
      }, 1000);
      return () => {
        listeners.delete(listener);
        if (listeners.size === 0) {
          clearInterval(timer);
          timer = undefined;
          reading = undefined;
        }
      };
    },
    read: () => (reading ??= serverNow()),
  };
}

const readings = new WeakMap<ServerClock, ReturnType<typeof secondReadings>>();

function readingsOf(serverNow: ServerClock) {
  let clock = readings.get(serverNow);
  if (!clock) {
    clock = secondReadings(serverNow);
    readings.set(serverNow, clock);
  }
  return clock;
}

/** Server time as read at the latest one-second tick, the same reading for every caller at one table. */
export function useServerNow() {
  const { subscribe, read } = readingsOf(useContext(ServerClockContext));
  return useSyncExternalStore(subscribe, read);
}
