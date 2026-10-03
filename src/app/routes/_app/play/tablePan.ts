import { useSyncExternalStore } from 'react';

/*
 * Whether this viewer drags empty board to slide a close look around, a per-browser trial preference that never reaches the game.
 * Off, a close look moves only by scrolling out and back in over another spot.
 */

const TABLE_PAN_STORAGE_KEY = 'dunezone-table-drag-pan';

const listeners = new Set<() => void>();

let dragPan: boolean | undefined;

function readStoredDragPan(): boolean {
  try {
    return localStorage.getItem(TABLE_PAN_STORAGE_KEY) === 'true';
  } catch {
    return false;
  }
}

function readDragPan(): boolean {
  dragPan ??= readStoredDragPan();
  return dragPan;
}

export function setTableDragPan(next: boolean): void {
  dragPan = next;
  try {
    localStorage.setItem(TABLE_PAN_STORAGE_KEY, String(next));
  } catch {
    // Storage may be unavailable (private mode); the value above keeps this page view right.
  }
  for (const listener of listeners) {
    listener();
  }
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** Whether dragging empty board pans a close look. */
export function useTableDragPan(): boolean {
  return useSyncExternalStore(subscribe, readDragPan, () => false);
}
