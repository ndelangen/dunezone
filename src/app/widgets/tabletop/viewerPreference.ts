import { useSyncExternalStore } from 'react';

/*
 * What this viewer picks for their own table, kept per browser and never sent to the game.
 * Each preference reads storage once, stays right for the page view even when storage refuses writes, and follows other tabs.
 */
type ViewerPreference = Readonly<{
  min: number;
  max: number;
  /** The current choice, for code outside React such as a frame loop. */
  read: () => number;
  set: (next: number) => void;
  use: () => number;
}>;

/** A choice this viewer makes, kept per browser as text and never sent to the game. */
type ViewerChoice<T> = Readonly<{
  /** The current choice, for code outside React such as a frame loop. */
  read: () => T;
  set: (next: T) => void;
  use: () => T;
}>;

export function viewerChoice<T>(
  storageKey: string,
  codec: Readonly<{ parse: (stored: string | null) => T; serialize: (value: T) => string; fallback: T }>
): ViewerChoice<T> {
  const { parse, serialize, fallback } = codec;
  const listeners = new Set<() => void>();
  let value: T | undefined;

  function readStored(): T {
    try {
      return parse(localStorage.getItem(storageKey));
    } catch {
      return fallback;
    }
  }

  /* Once anything reads the preference it follows other tabs for good, so a frame loop reading it with no slider open stays right. */
  let following = false;
  function follow(): void {
    if (!following && typeof window !== 'undefined') {
      window.addEventListener('storage', relayStorage);
      following = true;
    }
  }

  function read(): T {
    follow();
    value ??= readStored();
    return value;
  }

  function notify(): void {
    for (const listener of listeners) {
      listener();
    }
  }

  function set(next: T): void {
    value = next;
    try {
      localStorage.setItem(storageKey, serialize(next));
    } catch {
      // Storage may be unavailable (private mode); the value above keeps this page view right.
    }
    notify();
  }

  // Another tab changing the preference reaches this one through the storage event.
  function relayStorage(event: StorageEvent): void {
    if (event.key !== null && event.key !== storageKey) {
      return;
    }
    value = readStored();
    notify();
  }

  function subscribe(listener: () => void): () => void {
    follow();
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  }

  const use = () => useSyncExternalStore(subscribe, read, () => fallback);
  return { read, set, use };
}

/** A number this viewer picks on a slider, clamped to its bounds. */
export function viewerPreference(
  storageKey: string,
  bounds: Readonly<{ min: number; max: number; fallback: number }>
): ViewerPreference {
  const { min, max, fallback } = bounds;
  const clamp = (next: number) => Math.min(max, Math.max(min, next));
  const choice = viewerChoice(storageKey, {
    parse: (stored) => {
      const number = Number(stored);
      return number > 0 ? clamp(number) : fallback;
    },
    serialize: String,
    fallback,
  });
  return { min, max, read: choice.read, set: (next) => choice.set(clamp(next)), use: choice.use };
}
