import { useEffect, useEffectEvent, useRef } from 'react';
import type { Dispatch, RefObject, SetStateAction } from 'react';

import { ARROWS, MOVES } from './compassSpots';
import type { Arrow, Spot } from './compassSpots';

/*
 * The compass's keys. Space opens it; a tap leaves it open to steer with the arrows and confirm with Space or Enter,
 * a hold with the arrows opens what they point at when Space is let go. Escape closes it, and anything else typed
 * goes to the search. The table hears none of them.
 */

export type CompassKeys = Readonly<{
  open: boolean;
  /** The table is held in a gesture, so Space stays with it. */
  inert: boolean;
  spot: Spot;
  query: string;
  cursor: number;
  /** How many suggestions the cursor can step through. */
  suggestions: number;
  input: RefObject<HTMLInputElement | null>;
  onOpen: () => void;
  onClose: () => void;
  onSpot: Dispatch<SetStateAction<Spot>>;
  onCursor: Dispatch<SetStateAction<number>>;
  onConfirm: () => void;
}>;

/* Tab moves focus as usual, and a button Tab reached opens itself on Enter or Space. */
function leftToBrowser(event: KeyboardEvent) {
  const activates = event.key === 'Enter' || event.code === 'Space';
  return event.key === 'Tab' || (activates && event.target instanceof HTMLButtonElement);
}

/* A key typed into a text field, other than the compass's own search, belongs to that field. */
function typingElsewhere(event: KeyboardEvent, search: HTMLInputElement | null) {
  const target = event.target;
  if (target === search || !(target instanceof HTMLElement)) {
    return false;
  }
  return target.isContentEditable || target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement;
}

/*
 * Space is the compass's everywhere on the table, even on a button left focused by a click, which keeps Enter.
 * Only an open menu (a piece's radial menu holds Space to confirm), a list being stepped through, a select or a dialog keep it.
 */
const KEEPS_SPACE = '[role="menu"], [role="listbox"], select, dialog, [role="dialog"], [aria-modal="true"]';
function spaceBelongsTo(target: EventTarget | null) {
  return target instanceof Element && target.closest(KEEPS_SPACE) !== null;
}

/* A fresh Space on the table, while nothing holds it, opens the compass. */
function opensCompass(event: KeyboardEvent, inert: boolean) {
  return event.code === 'Space' && !event.repeat && !inert && !spaceBelongsTo(event.target);
}

type Press = 'confirm' | 'held' | 'close' | 'search';

/* What a key other than an arrow does on the open compass; nothing when the browser keeps it. */
function pressOf(event: KeyboardEvent, holding: boolean, query: string, search: HTMLInputElement | null): Press | null {
  if (leftToBrowser(event)) {
    return null;
  }
  const space = event.code === 'Space';
  if (event.key === 'Enter' || (space && !holding && !query)) {
    return 'confirm';
  }
  if (holding) {
    return 'held';
  }
  if (event.key === 'Escape') {
    return 'close';
  }
  const letter = event.key.length === 1 && !event.metaKey && !event.ctrlKey;
  return letter && event.target !== search ? 'search' : null;
}

export function useCompassKeys(keys: CompassKeys) {
  /* Whether Space is down since it opened the compass, and whether an arrow was pressed while it was. */
  const hold = useRef({ down: false, steered: false });

  /* Up from the first suggestion returns to the hub; otherwise the cursor steps through them. */
  const moveCursor = (arrow: Arrow) => {
    if (arrow === 'up' && keys.cursor === 0) {
      keys.onSpot('hub');
      return;
    }
    const step = arrow === 'up' ? -1 : 1;
    keys.onCursor((current) => Math.max(0, Math.min(keys.suggestions - 1, current + step)));
  };
  /* An arrow steers between tiles, moves through the suggestions, or moves the search field's caret. */
  const steer = (event: KeyboardEvent, arrow: Arrow) => {
    const sideways = arrow === 'left' || arrow === 'right';
    if (keys.spot === 'hub' && keys.query && sideways) {
      return;
    }
    event.preventDefault();
    if (keys.spot === 'search' && !sideways) {
      moveCursor(arrow);
      return;
    }
    hold.current.steered = true;
    keys.onSpot((current) => MOVES[current][arrow]);
  };
  const press = (event: KeyboardEvent) => {
    const holding = event.code === 'Space' && (hold.current.down || event.repeat);
    switch (pressOf(event, holding, keys.query, keys.input.current)) {
      case 'confirm':
        event.preventDefault();
        keys.onConfirm();
        break;
      case 'held':
        event.preventDefault();
        break;
      case 'close':
        keys.onClose();
        break;
      case 'search':
        keys.input.current?.focus();
        break;
      case null:
        break;
    }
  };
  const keydown = useEffectEvent((event: KeyboardEvent) => {
    if (typingElsewhere(event, keys.input.current)) {
      return;
    }
    if (!keys.open) {
      if (opensCompass(event, keys.inert)) {
        event.preventDefault();
        event.stopPropagation();
        keys.onOpen();
        hold.current = { down: true, steered: false };
      }
      return;
    }
    event.stopPropagation();
    const arrow = ARROWS[event.key];
    if (arrow) {
      steer(event, arrow);
    } else {
      press(event);
    }
  });
  /* Held and steered: letting go opens. A tap leaves the compass open to steer. */
  const keyup = useEffectEvent((event: KeyboardEvent) => {
    if (event.code !== 'Space' || !hold.current.down) {
      return;
    }
    const steered = hold.current.steered;
    hold.current = { down: false, steered: false };
    if (steered && keys.open) {
      keys.onConfirm();
    }
  });
  useEffect(() => {
    const down = (event: KeyboardEvent) => keydown(event);
    const up = (event: KeyboardEvent) => keyup(event);
    window.addEventListener('keydown', down, true);
    window.addEventListener('keyup', up, true);
    return () => {
      window.removeEventListener('keydown', down, true);
      window.removeEventListener('keyup', up, true);
    };
  }, []);
}
