import { useEffect, useEffectEvent, useState } from 'react';

import { brushTakes, territoryBrush } from '../../../../widgets/tabletop/territoryBrush';
import { pulse } from './pulse';
import type { Pulse } from './pulse';
import { SIDES } from './slotLimits';
import type { Side } from './slotLimits';
import { useRemembered } from './useRemembered';
import type { TableWindow } from './windows';

/*
 * Which windows are open: one in the centre, which goes when the table is clicked, and one pinned in each bottom slot,
 * which stays until unpinned. Pinning moves the centre window into a slot, replacing whatever was pinned there.
 */

/** An open window; the faction information also has the seat it is set on. */
export type Opened = Readonly<{ key: string; seat?: string }>;

export type Slots = Readonly<Record<Side, Opened | null>>;

/** The open windows and the ways to open, pin, unpin and close them. */
export type OpenWindows = ReturnType<typeof useOpenWindows>;

/*
 * Something that takes Escape first: a menu, a list, a dialog, the control whose popover is open, a piece carried in the hidden zone
 * or along a sortable row, a field with an edit Escape drops, or the territory paintbrush.
 * Escape then stops painting and leaves the window open, and a second Escape closes it.
 */
const OPEN_ABOVE = '[role="menu"], [role="listbox"], [role="dialog"], [aria-modal="true"]';
const EXPANDED = '[aria-expanded="true"]';
const CARRIED = '[data-carried]';
const TAKES_ESCAPE = '[data-takes-escape]';

/* Shown, not just mounted: a select keeps its list in the document, hidden, while it is shut. */
function shown(element: Element) {
  for (let node: Element | null = element; node; node = node.parentElement) {
    const style = getComputedStyle(node);
    if (style.display === 'none' || style.visibility === 'hidden') {
      return false;
    }
  }
  return true;
}

function escapeTaken(event: KeyboardEvent) {
  const target = event.target;
  return (
    brushTakes(event) ||
    [...document.querySelectorAll(OPEN_ABOVE)].some(shown) ||
    document.querySelector(CARRIED) !== null ||
    (target instanceof Element && target.closest(`${EXPANDED}, ${TAKES_ESCAPE}`) !== null)
  );
}

/*
 * A primary press on the table itself: not on any of the chrome over it, and not the secondary press that opens a piece's menu.
 * While the territory paintbrush is on, a press paints, so the window that holds the brush stays open.
 */
function closesWindow(event: PointerEvent) {
  const onTable = event.target instanceof HTMLCanvasElement && event.button === 0;
  return onTable && territoryBrush() === null;
}

function useTablePress(onPress: () => void, enabled: boolean) {
  const press = useEffectEvent(onPress);
  useEffect(() => {
    if (!enabled) {
      return;
    }
    const listener = (event: PointerEvent) => {
      if (closesWindow(event)) {
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

/* The keys that pin the centre window: [ to the bottom left and ] to the bottom right. */
export const PIN_KEYS: Readonly<Record<Side, string>> = { left: '[', right: ']' };

function typing(target: EventTarget | null) {
  return (
    target instanceof HTMLElement &&
    (target.isContentEditable || target.closest('input, textarea, select, [role="textbox"]') !== null)
  );
}

/* A bare [ or ] away from a text field pins the centre window, as its pin buttons do. */
function usePinKeys(onPin: (side: Side) => void, enabled: boolean) {
  const pinTo = useEffectEvent(onPin);
  useEffect(() => {
    if (!enabled) {
      return;
    }
    const listener = (event: KeyboardEvent) => {
      const side = SIDES.find((entry) => PIN_KEYS[entry] === event.key);
      if (!side || event.repeat || event.metaKey || event.ctrlKey || event.altKey || typing(event.target)) {
        return;
      }
      event.preventDefault();
      pinTo(side);
    };
    window.addEventListener('keydown', listener);
    return () => window.removeEventListener('keydown', listener);
  }, [enabled]);
}

export function useOpenWindows(windows: readonly TableWindow[], compassOpen: boolean) {
  const [centre, setCentre] = useState<Opened | null>(null);
  const [slots, setSlots] = useRemembered<Slots>('slots', { left: null, right: null });
  /* Bumps when a pinned window is asked for again, lighting its slot up. */
  const [flash, setFlash] = useState<Pulse>(null);
  /*
   * On a narrow table the centre window reaches over the slots, so the window last brought up or pressed comes to the front:
   * the faction information a centre chat opens in a slot shows above that chat.
   */
  const [front, setFront] = useState<Side | 'centre' | null>(null);

  const opened = (key: string, seat?: string): Opened => (seat ? { key, seat } : { key });
  /* Already pinned: the slot shows it, so it lights up (on the seat asked for) rather than opening twice. */
  const showPinned = (side: Side, key: string, seat?: string) => {
    if (seat) {
      setSlots((current) => ({ ...current, [side]: opened(key, seat) }));
    }
    setFlash(pulse(side));
    setFront(side);
    setCentre(null);
  };
  /** Opens a window in the centre; asking again for the one already there closes it. */
  const show = (key: string, seat?: string) => {
    const side = SIDES.find((entry) => slots[entry]?.key === key);
    if (side) {
      showPinned(side, key, seat);
      return;
    }
    const again = (current: Opened | null) => current?.key === key && (seat === undefined || current.seat === seat);
    setFront('centre');
    setCentre((current) =>
      again(current) ? null : opened(key, seat ?? (current?.key === key ? current.seat : undefined))
    );
  };
  /*
   * Brings a window into view without closing anything, as the table's own openings and a chat's faction token do:
   * a pinned one lights up, one already in the centre stays, either set on the seat asked for.
   * Else it goes into a free slot, beside the board rather than over it, and only into the centre when both slots hold a window.
   */
  const reveal = (key: string, seat?: string) => {
    const side = SIDES.find((entry) => slots[entry]?.key === key);
    const where = side ?? (centre?.key === key ? 'centre' : undefined);
    if (where) {
      if (seat) {
        showSeat(where, key, seat);
      }
      if (side) {
        setFlash(pulse(side));
      }
      setFront(where);
      return;
    }
    /* A slot is free when it holds nothing, or a window the table no longer has, such as the last battle's. */
    const free = SIDES.find((entry) => !windows.some((window) => window.key === slots[entry]?.key));
    if (free) {
      setSlots((current) => ({ ...current, [free]: opened(key, seat) }));
      setFlash(pulse(free));
      setFront(free);
      return;
    }
    setCentre(opened(key, seat));
    setFront('centre');
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
  /** Sets an open window on another seat where it stands, as the faction information's tokens do. */
  const showSeat = (side: Side | 'centre', key: string, seat: string) => {
    if (side === 'centre') {
      setCentre(opened(key, seat));
    } else {
      setSlots((current) => ({ ...current, [side]: opened(key, seat) }));
    }
  };
  /** Whether a window is open anywhere, in the centre or pinned; with a seat, whether it is set on that seat. */
  const isOpen = (key: string, seat?: string) =>
    [centre, slots.left, slots.right].some(
      (entry) => entry?.key === key && (seat === undefined || entry.seat === seat)
    );

  /* Escape closes the centre window once the compass is not there to take it, and no menu, list, popover or dialog is open to take it first. */
  useEffect(() => {
    if (compassOpen || centre === null) {
      return;
    }
    const escape = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !escapeTaken(event)) {
        setCentre(null);
      }
    };
    /* Seen first, before whatever is open answers the key and goes, so the window stays while Escape closed something else. */
    window.addEventListener('keydown', escape, true);
    return () => window.removeEventListener('keydown', escape, true);
  }, [compassOpen, centre]);
  useTablePress(close, centre !== null && !compassOpen);
  usePinKeys(pin, centre !== null && !compassOpen);

  return { centre, slots, flash, front, raise: setFront, show, reveal, pin, unpin, close, showSeat, isOpen };
}
