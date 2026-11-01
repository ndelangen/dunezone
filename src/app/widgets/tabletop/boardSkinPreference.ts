import { useSyncExternalStore } from 'react';

import { BOARD_SKINS } from './boardSkins';
import type { BoardSkin } from './boardSkins';

/*
 * The board skin this viewer picked, kept per browser beside table lighting and pan speed and never sent to the game:
 * every player sees the same pieces on the same territories, each through their own skin.
 */
const STORAGE_KEY = 'dunezone-board-skin';
const FALLBACK: BoardSkin = 'plain';
const listeners = new Set<() => void>();
let value: BoardSkin | undefined;
let following = false;

function parse(stored: string | null): BoardSkin {
  return (BOARD_SKINS as readonly string[]).includes(stored ?? '') ? (stored as BoardSkin) : FALLBACK;
}

function readStored(): BoardSkin {
  try {
    return parse(localStorage.getItem(STORAGE_KEY));
  } catch {
    return FALLBACK;
  }
}

function notify(): void {
  for (const listener of listeners) {
    listener();
  }
}

function follow(): void {
  if (!following && typeof window !== 'undefined') {
    window.addEventListener('storage', (event) => {
      if (event.key === null || event.key === STORAGE_KEY) {
        value = readStored();
        notify();
      }
    });
    following = true;
  }
}

function read(): BoardSkin {
  follow();
  value ??= readStored();
  return value;
}

export function setBoardSkin(next: BoardSkin): void {
  value = next;
  try {
    localStorage.setItem(STORAGE_KEY, next);
  } catch {
    // Storage may be unavailable (private mode); the value above keeps this page view right.
  }
  notify();
}

function subscribe(listener: () => void): () => void {
  follow();
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** This viewer's board skin. */
export function useBoardSkin(): BoardSkin {
  return useSyncExternalStore(subscribe, read, () => FALLBACK);
}
