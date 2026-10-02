import { useSyncExternalStore } from 'react';

/*
 * How bright this viewer wants the table lights, a per-browser preference that never reaches the game.
 * 1 is the table's own lighting; the slider in the game menu scales it between the bounds below.
 */

const TABLE_LIGHTING_STORAGE_KEY = 'dunezone-table-lighting';

export const TABLE_LIGHTING_MIN = 0.4;
export const TABLE_LIGHTING_MAX = 1.4;
const TABLE_LIGHTING_DEFAULT = 1;

const listeners = new Set<() => void>();

/* The current choice, read from storage once; it stays right for the page view even when storage refuses writes. */
let lighting: number | undefined;

function clampLighting(value: number): number {
  return Math.min(TABLE_LIGHTING_MAX, Math.max(TABLE_LIGHTING_MIN, value));
}

function readStoredLighting(): number {
  try {
    const stored = Number(localStorage.getItem(TABLE_LIGHTING_STORAGE_KEY));
    return stored > 0 ? clampLighting(stored) : TABLE_LIGHTING_DEFAULT;
  } catch {
    return TABLE_LIGHTING_DEFAULT;
  }
}

function readLighting(): number {
  lighting ??= readStoredLighting();
  return lighting;
}

function notify(): void {
  for (const listener of listeners) {
    listener();
  }
}

export function setTableLighting(next: number): void {
  lighting = clampLighting(next);
  try {
    localStorage.setItem(TABLE_LIGHTING_STORAGE_KEY, String(lighting));
  } catch {
    // Storage may be unavailable (private mode); the value above keeps this page view right.
  }
  notify();
}

// Another tab changing the preference reaches this one through the storage event.
function relayStorage(event: StorageEvent): void {
  if (event.key !== null && event.key !== TABLE_LIGHTING_STORAGE_KEY) {
    return;
  }
  lighting = readStoredLighting();
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

/** The viewer's table lighting, from TABLE_LIGHTING_MIN to TABLE_LIGHTING_MAX. */
export function useTableLighting(): number {
  return useSyncExternalStore(subscribe, readLighting, () => TABLE_LIGHTING_DEFAULT);
}
