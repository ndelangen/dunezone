import { useEffect, useEffectEvent, useState } from 'react';

import { pulse } from './pulse';
import type { Pulse } from './pulse';
import { SIDES } from './slotLimits';
import type { Side } from './slotLimits';
import { useRemembered } from './useRemembered';
import type { PlayerTab, TableWindow } from './windows';

/*
 * Which windows are open: one in the centre, which goes when the table is clicked, and one pinned in each bottom slot,
 * which stays until unpinned. Pinning moves the centre window into a slot, replacing whatever was pinned there.
 */

/** A window that is open, and for a player's window the tab it shows. */
export type Opened = Readonly<{ key: string; tab: PlayerTab }>;

export type Slots = Readonly<Record<Side, Opened | null>>;

/* A press on the table itself, not on any of the chrome over it. */
function useTablePress(onPress: () => void, enabled: boolean) {
  const press = useEffectEvent(onPress);
  useEffect(() => {
    if (!enabled) {
      return;
    }
    const listener = (event: PointerEvent) => {
      if (event.target instanceof HTMLCanvasElement) {
        press();
      }
    };
    window.addEventListener('pointerdown', listener, true);
    return () => window.removeEventListener('pointerdown', listener, true);
  }, [enabled]);
}

export function useOpenWindows(windows: readonly TableWindow[], compassOpen: boolean) {
  const [centre, setCentre] = useState<Opened | null>(null);
  const [slots, setSlots] = useRemembered<Slots>('slots', { left: null, right: null });
  /* Bumps when a pinned window is asked for again, lighting its slot up. */
  const [flash, setFlash] = useState<Pulse>(null);

  /* A player's window opens on the chat when there is one to have, otherwise on what they show. */
  const firstTab = (key: string): PlayerTab => {
    const player = windows.find((entry) => entry.key === key)?.player;
    return player && !player.own && player.canConverse ? 'conversation' : 'public';
  };
  /* Already pinned: the slot shows it, so it lights up (on the tab asked for) rather than opening twice. */
  const showPinned = (side: Side, key: string, tab?: PlayerTab) => {
    if (tab) {
      setSlots((current) => ({ ...current, [side]: { key, tab } }));
    }
    setFlash(pulse(side));
    setCentre(null);
  };
  /** Opens a window in the centre; asking again for the one already there closes it. */
  const show = (key: string, tab?: PlayerTab) => {
    const side = SIDES.find((entry) => slots[entry]?.key === key);
    if (side) {
      showPinned(side, key, tab);
      return;
    }
    const again = (current: Opened | null) => current?.key === key && (tab === undefined || current.tab === tab);
    setCentre((current) => (again(current) ? null : { key, tab: tab ?? firstTab(key) }));
  };
  const pin = (side: Side) => {
    if (!centre) {
      return;
    }
    setSlots((current) => ({ ...current, [side]: centre }));
    setCentre(null);
  };
  const unpin = (side: Side) => setSlots((current) => ({ ...current, [side]: null }));
  const close = () => setCentre(null);
  const showTab = (side: Side | 'centre', key: string, tab: PlayerTab) => {
    if (side === 'centre') {
      setCentre({ key, tab });
    } else {
      setSlots((current) => ({ ...current, [side]: { key, tab } }));
    }
  };
  /** Whether a window is open anywhere: in the centre or pinned. */
  const isOpen = (key: string) => [centre, slots.left, slots.right].some((entry) => entry?.key === key);

  /* Escape closes the centre window once the compass is not there to take it. */
  useEffect(() => {
    if (compassOpen || centre === null) {
      return;
    }
    const escape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setCentre(null);
      }
    };
    window.addEventListener('keydown', escape);
    return () => window.removeEventListener('keydown', escape);
  }, [compassOpen, centre]);
  useTablePress(close, centre !== null && !compassOpen);

  return { centre, slots, flash, show, pin, unpin, close, showTab, isOpen };
}
