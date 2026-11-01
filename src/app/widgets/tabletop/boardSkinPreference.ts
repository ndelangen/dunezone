import { useSyncExternalStore } from 'react';

import { BOARD_SKINS } from './boardSkins';
import type { BoardSkin } from './boardSkins';

/*
 * How this viewer's board looks: its skin and whether it is shaded like a planet.
 * Both are kept per browser beside table lighting and pan speed and never sent to the game:
 * every player sees the same pieces on the same territories, each through their own look.
 */
function storedChoice<T extends string>(storageKey: string, parse: (stored: string | null) => T, fallback: T) {
  const listeners = new Set<() => void>();
  let value: T | undefined;
  let following = false;

  const readStored = (): T => {
    try {
      return parse(localStorage.getItem(storageKey));
    } catch {
      return fallback;
    }
  };
  const notify = () => {
    for (const listener of listeners) {
      listener();
    }
  };
  const follow = () => {
    if (!following && typeof window !== 'undefined') {
      window.addEventListener('storage', (event) => {
        if (event.key === null || event.key === storageKey) {
          value = readStored();
          notify();
        }
      });
      following = true;
    }
  };
  const read = (): T => {
    follow();
    value ??= readStored();
    return value;
  };
  const set = (next: T): void => {
    value = next;
    try {
      localStorage.setItem(storageKey, next);
    } catch {
      // Storage may be unavailable (private mode); the value above keeps this page view right.
    }
    notify();
  };
  const subscribe = (listener: () => void) => {
    follow();
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  };
  const use = (): T => useSyncExternalStore(subscribe, read, () => fallback);
  return { set, use };
}

const skin = storedChoice<BoardSkin>(
  'dunezone-board-skin',
  (stored) => ((BOARD_SKINS as readonly string[]).includes(stored ?? '') ? (stored as BoardSkin) : 'none'),
  'none'
);
const planet = storedChoice<'on' | 'off'>(
  'dunezone-planet-shading',
  (stored) => (stored === 'on' ? 'on' : 'off'),
  'off'
);

export const setBoardSkin = skin.set;
/** This viewer's board skin. */
export const useBoardSkin = skin.use;

export const setPlanetShading = (on: boolean) => planet.set(on ? 'on' : 'off');
/** Whether this viewer shades the board like a lit planet. */
export const usePlanetShading = () => planet.use() === 'on';
