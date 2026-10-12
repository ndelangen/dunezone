import { useSyncExternalStore } from 'react';

/*
 * A number this viewer picks on a slider, kept per browser and never sent to the game.
 * Each preference reads storage once, stays right for the page view even when storage refuses writes, and follows other tabs.
 */
export type ViewerPreference = Readonly<{
  min: number;
  max: number;
  /** The current choice, for code outside React such as a frame loop. */
  read: () => number;
  set: (next: number) => void;
  use: () => number;
}>;

export function viewerPreference(
  storageKey: string,
  bounds: Readonly<{ min: number; max: number; fallback: number }>
): ViewerPreference {
  const { min, max, fallback } = bounds;
  const listeners = new Set<() => void>();
  let value: number | undefined;

  const clamp = (next: number) => Math.min(max, Math.max(min, next));

  function readStored(): number {
    try {
      const stored = Number(localStorage.getItem(storageKey));
      return stored > 0 ? clamp(stored) : fallback;
    } catch {
      return fallback;
    }
  }

  function read(): number {
    value ??= readStored();
    return value;
  }

  function notify(): void {
    for (const listener of listeners) {
      listener();
    }
  }

  function set(next: number): void {
    value = clamp(next);
    try {
      localStorage.setItem(storageKey, String(value));
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
    if (listeners.size === 0) {
      window.addEventListener('storage', relayStorage);
    }
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
      if (listeners.size === 0) {
        window.removeEventListener('storage', relayStorage);
      }
    };
  }

  const use = () => useSyncExternalStore(subscribe, read, () => fallback);
  return { min, max, read, set, use };
}
