import type { BattleOutlineOption } from '@shared/play/territoryTints';
import { useSyncExternalStore } from 'react';

/*
 * The territory under the battle marker while a player drags it, so the board lights the territory the battle would be in.
 * One page carries one marker; null when it is not carried or not over a territory.
 */
let hovered: string | null = null;
const listeners = new Set<() => void>();

/** Lights a territory under the carried battle marker, or none with null. */
export function setBattleMarkerHover(territoryId: string | null) {
  if (hovered === territoryId) {
    return;
  }
  hovered = territoryId;
  for (const listener of listeners) {
    listener();
  }
}

/** The territory the carried battle marker lights right now, if any. */
export function battleMarkerHover() {
  return hovered;
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function useBattleMarkerHover() {
  return useSyncExternalStore(
    subscribe,
    () => hovered,
    () => null
  );
}

/*
 * Which of the outline colours being compared the board draws; the comparison stories switch it, the game keeps the first.
 * It goes once Norbert picks one.
 */
let outline: BattleOutlineOption = 'gold';
const outlineListeners = new Set<() => void>();

export function setBattleOutlineOption(next: BattleOutlineOption) {
  outline = next;
  for (const listener of outlineListeners) {
    listener();
  }
}

export function useBattleOutlineOption() {
  return useSyncExternalStore(
    (listener) => {
      outlineListeners.add(listener);
      return () => outlineListeners.delete(listener);
    },
    () => outline,
    () => 'gold' as const
  );
}
