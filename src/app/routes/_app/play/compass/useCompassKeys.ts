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

/** Whether Space is down since it opened the compass, and whether an arrow was pressed while it was. */
type Hold = Readonly<{ down: boolean; steered: boolean }>;

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

/* Space is held when it is still down from opening the compass, or the key repeats. */
function spaceHeld(event: KeyboardEvent, hold: Hold) {
  return event.code === 'Space' && (hold.down || event.repeat);
}

type Press = 'confirm' | 'held' | 'close' | 'search';

/** What was pressed on the open compass, read once so the presses below each ask one question. */
type Pressed = Readonly<{
  enter: boolean;
  escape: boolean;
  holding: boolean;
  /** Space tapped on its own, with nothing typed: confirms what the compass points at. */
  taps: boolean;
  /** A letter typed outside the search field, which the search then takes. */
  letter: boolean;
}>;

function pressedOf(event: KeyboardEvent, holding: boolean, query: string, search: HTMLInputElement | null): Pressed {
  const bare = !event.metaKey && !event.ctrlKey;
  return {
    enter: event.key === 'Enter',
    escape: event.key === 'Escape',
    holding,
    taps: event.code === 'Space' && !holding && !query,
    letter: event.key.length === 1 && bare && event.target !== search,
  };
}

/* The presses in the order they are asked: the first that fits is the one. */
const PRESSES: readonly (readonly [Press, (pressed: Pressed) => boolean])[] = [
  ['confirm', (pressed) => pressed.enter || pressed.taps],
  ['held', (pressed) => pressed.holding],
  ['close', (pressed) => pressed.escape],
  ['search', (pressed) => pressed.letter],
];

/* What a key other than an arrow does on the open compass; nothing when the browser keeps it. */
function pressOf(event: KeyboardEvent, holding: boolean, query: string, search: HTMLInputElement | null): Press | null {
  if (leftToBrowser(event)) {
    return null;
  }
  const pressed = pressedOf(event, holding, query, search);
  return PRESSES.find(([, fits]) => fits(pressed))?.[0] ?? null;
}

const ANSWERS: Record<Press, (event: KeyboardEvent, keys: CompassKeys) => void> = {
  confirm: (event, keys) => {
    event.preventDefault();
    keys.onConfirm();
  },
  held: (event) => event.preventDefault(),
  close: (_event, keys) => keys.onClose(),
  search: (_event, keys) => keys.input.current?.focus(),
};

/* A left or right arrow in the hub with text typed moves the search field's caret, as it would anywhere. */
function movesCaret(keys: CompassKeys, arrow: Arrow) {
  const sideways = arrow === 'left' || arrow === 'right';
  return keys.spot === 'hub' && keys.query !== '' && sideways;
}

/* Up and down among the suggestions step through them. */
function stepsSuggestions(keys: CompassKeys, arrow: Arrow) {
  return keys.spot === 'search' && (arrow === 'up' || arrow === 'down');
}

export function useCompassKeys(keys: CompassKeys) {
  const hold = useRef<Hold>({ down: false, steered: false });

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
    if (movesCaret(keys, arrow)) {
      return;
    }
    event.preventDefault();
    if (stepsSuggestions(keys, arrow)) {
      moveCursor(arrow);
      return;
    }
    hold.current = { ...hold.current, steered: true };
    keys.onSpot((current) => MOVES[current][arrow]);
  };
  const press = (event: KeyboardEvent) => {
    const pressed = pressOf(event, spaceHeld(event, hold.current), keys.query, keys.input.current);
    if (pressed) {
      ANSWERS[pressed](event, keys);
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
