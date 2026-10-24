import { useCallback, useEffect, useState } from 'react';

const REMEMBERED = 'dunezone-compass:';

/** Forgets every remembered choice, so the compass opens as it first would; read before it mounts. */
export function forgetRemembered() {
  try {
    for (const key of Object.keys(localStorage).filter((entry) => entry.startsWith(REMEMBERED))) {
      localStorage.removeItem(key);
    }
  } catch {
    /* Nothing remembered where storage is blocked. */
  }
}

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
  /* `touched` keeps a value nobody has changed out of storage, so a forgotten choice stays forgotten. */
  const [state, setState] = useState(() => ({ value: readRemembered(key, fallback), touched: false }));
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
    if (!state.touched) {
      return;
    }
    try {
      localStorage.setItem(`${REMEMBERED}${key}`, JSON.stringify(state.value));
    } catch {
      /* A private window keeps the choice for this visit only. */
    }
  }, [key, state]);
  return [state.value, update] as const;
}
