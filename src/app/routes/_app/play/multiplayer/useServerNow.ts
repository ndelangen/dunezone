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
    subscribe: (listener: () => void) => {
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

/* A caller that shows no clock right now takes no readings, so the tick does not render it. */
const unsubscribed = () => () => {};
const noReading = () => 0;

/**
 * Server time as read at the latest one-second tick, the same reading for every caller at one table.
 * With `live` false the caller shows no clock: it reads 0 and the tick leaves it alone.
 */
export function useServerNow(live = true) {
  const { subscribe, read } = readingsOf(useContext(ServerClockContext));
  return useSyncExternalStore(live ? subscribe : unsubscribed, live ? read : noReading);
}

/**
 * What `select` makes of server time at the latest tick.
 * The caller renders again only when that changes, so a label that moves once a minute is not drawn again every second.
 */
export function useServerNowAs<T extends string | number | boolean>(select: (now: number) => T) {
  const { subscribe, read } = readingsOf(useContext(ServerClockContext));
  return useSyncExternalStore(subscribe, () => select(read()));
}
