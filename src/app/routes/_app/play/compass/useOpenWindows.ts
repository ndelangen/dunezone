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

/** An open window; a player's also has its tab, and any removal vote against them, which it follows across seats. */
export type Opened = Readonly<{ key: string; tab: PlayerTab; vote?: string }>;

export type Slots = Readonly<Record<Side, Opened | null>>;

/** The open windows and the ways to open, pin, unpin and close them. */
export type OpenWindows = ReturnType<typeof useOpenWindows>;

/* Something open over the table that takes Escape first: a menu, a list, a dialog, or the control whose popover is open. */
const OPEN_ABOVE = '[role="menu"], [role="listbox"], [role="dialog"], [aria-modal="true"]';
const EXPANDED = '[aria-expanded="true"]';

function escapeTaken(target: EventTarget | null) {
  return (
    document.querySelector(OPEN_ABOVE) !== null || (target instanceof Element && target.closest(EXPANDED) !== null)
  );
}

/* A primary press on the table itself: not on any of the chrome over it, and not the secondary press that opens a piece's menu. */
function useTablePress(onPress: () => void, enabled: boolean) {
  const press = useEffectEvent(onPress);
  useEffect(() => {
    if (!enabled) {
      return;
    }
    const listener = (event: PointerEvent) => {
      if (event.target instanceof HTMLCanvasElement && event.button === 0) {
        /* A field commits its draft on blur, which has to happen before the press closes its window. */
        if (document.activeElement instanceof HTMLElement) {
          document.activeElement.blur();
        }
        press();
      }
    };
    window.addEventListener('pointerdown', listener, true);
    return () => window.removeEventListener('pointerdown', listener, true);
  }, [enabled]);
}

export function useOpenWindows(windows: readonly TableWindow[], compassOpen: boolean) {
  const [openCentre, setCentre] = useState<Opened | null>(null);
  const [openSlots, setSlots] = useRemembered<Slots>('slots', { left: null, right: null });
  /* Bumps when a pinned window is asked for again, lighting its slot up. */
  const [flash, setFlash] = useState<Pulse>(null);

  /* A player's window keeps the vote against them, so it moves with them when they trade seats. */
  const opened = (key: string, tab: PlayerTab): Opened => {
    const vote = windows.find((entry) => entry.key === key)?.player?.vote;
    return vote ? { key, tab, vote } : { key, tab };
  };
  const followed = (entry: Opened | null): Opened | null => {
    const target = entry?.vote ? windows.find((window) => window.player?.vote === entry.vote) : undefined;
    return entry && target && target.key !== entry.key ? { ...entry, key: target.key } : entry;
  };
  const centre = followed(openCentre);
  const slots: Slots = { left: followed(openSlots.left), right: followed(openSlots.right) };

  /* A player's window opens on the chat when there is one to have, otherwise on what they show. */
  const firstTab = (key: string): PlayerTab => {
    const player = windows.find((entry) => entry.key === key)?.player;
    return player && !player.own && player.canConverse ? 'conversation' : 'public';
  };
  /* Already pinned: the slot shows it, so it lights up (on the tab asked for) rather than opening twice. */
  const showPinned = (side: Side, key: string, tab?: PlayerTab) => {
    if (tab) {
      setSlots((current) => ({ ...current, [side]: opened(key, tab) }));
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
    setCentre((current) => (again(followed(current)) ? null : opened(key, tab ?? firstTab(key))));
  };
  /* Brings a window into view without closing anything: a pinned one lights up beside the centre window, one already in the centre stays, else it opens there. */
  const reveal = (key: string) => {
    const side = SIDES.find((entry) => slots[entry]?.key === key);
    if (side) {
      setFlash(pulse(side));
      return;
    }
    setCentre((current) => (followed(current)?.key === key ? current : opened(key, firstTab(key))));
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
      setCentre(opened(key, tab));
    } else {
      setSlots((current) => ({ ...current, [side]: opened(key, tab) }));
    }
  };
  /** Whether a window is open anywhere: in the centre or pinned. */
  const isOpen = (key: string) => [centre, slots.left, slots.right].some((entry) => entry?.key === key);

  /* Escape closes the centre window once the compass is not there to take it, and no menu, list, popover or dialog is open to take it first. */
  useEffect(() => {
    if (compassOpen || openCentre === null) {
      return;
    }
    const escape = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !escapeTaken(event.target)) {
        setCentre(null);
      }
    };
    /* Seen first, before whatever is open answers the key and goes, so the window stays while Escape closed something else. */
    window.addEventListener('keydown', escape, true);
    return () => window.removeEventListener('keydown', escape, true);
  }, [compassOpen, openCentre]);
  useTablePress(close, openCentre !== null && !compassOpen);

  return { centre, slots, flash, show, reveal, pin, unpin, close, showTab, isOpen };
}
