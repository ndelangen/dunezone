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

/* When storage is blocked, the last choice lives here so the slider still works for the page view. */
let storagelessLighting = TABLE_LIGHTING_DEFAULT;

function clampLighting(value: number): number {
  return Math.min(TABLE_LIGHTING_MAX, Math.max(TABLE_LIGHTING_MIN, value));
}

function readLighting(): number {
  try {
    const stored = Number(localStorage.getItem(TABLE_LIGHTING_STORAGE_KEY));
    return stored > 0 ? clampLighting(stored) : TABLE_LIGHTING_DEFAULT;
  } catch {
    return storagelessLighting;
  }
}

export function setTableLighting(next: number): void {
  storagelessLighting = clampLighting(next);
  try {
    localStorage.setItem(TABLE_LIGHTING_STORAGE_KEY, String(storagelessLighting));
  } catch {
    // Storage may be unavailable (private mode); the fallback above keeps this page view right.
  }
  for (const listener of listeners) {
    listener();
  }
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** The viewer's table lighting, from TABLE_LIGHTING_MIN to TABLE_LIGHTING_MAX. */
export function useTableLighting(): number {
  return useSyncExternalStore(subscribe, readLighting, () => TABLE_LIGHTING_DEFAULT);
}
