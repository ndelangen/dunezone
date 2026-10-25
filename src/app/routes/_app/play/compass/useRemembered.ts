import { createContext, useCallback, useContext, useEffect, useState } from 'react';

const REMEMBERED = 'dunezone-compass:';

/** Whether choices are remembered in this browser; a tutorial turns it off, so a lesson neither reads nor overwrites a game's. */
export const RememberedContext = createContext(true);

function readRemembered<T>(key: string, fallback: T): T {
  try {
    const stored = localStorage.getItem(`${REMEMBERED}${key}`);
    return stored === null ? fallback : (JSON.parse(stored) as T);
  } catch {
    /* Blocked storage, or a value that no longer parses, remembers nothing. */
    return fallback;
  }
}

/** A remembered choice (what is pinned, how tall a slot is), in this browser only. */
export function useRemembered<T>(key: string, fallback: T) {
  const remembers = useContext(RememberedContext);
  /* `touched` keeps a value nobody has changed out of storage, so one read back is not written again. */
  const [state, setState] = useState(() => ({
    value: remembers ? readRemembered(key, fallback) : fallback,
    touched: false,
  }));
  const update = useCallback(
    (next: T | ((current: T) => T)) =>
      setState((current) => ({
        value: typeof next === 'function' ? (next as (current: T) => T)(current.value) : next,
        touched: true,
      })),
    []
  );
  /* Stored once the change is committed, so the updater stays pure for React to replay. */
  useEffect(() => {
    if (!remembers || !state.touched) {
      return;
    }
    try {
      localStorage.setItem(`${REMEMBERED}${key}`, JSON.stringify(state.value));
    } catch {
      /* A private window keeps the choice for this visit only. */
    }
  }, [key, remembers, state]);
  return [state.value, update] as const;
}
