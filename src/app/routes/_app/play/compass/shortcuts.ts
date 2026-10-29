import { useEffect, useEffectEvent } from 'react';

import type { TileSpot } from './compassSpots';
import type { CompassTable } from './compassTable';

/*
 * One letter per compass arm and per table command, pressed over the table with the compass shut.
 * The compass and its search show each letter beside what it opens, so the keys are learnt by using the compass.
 */

export type Command = 'pass' | 'raise' | 'lower' | 'faceUp';
export type Shortcut = TileSpot | Command;

export const SHORTCUTS: Readonly<Record<Shortcut, string>> = {
  hand: 'H',
  hidden: 'J',
  battle: 'B',
  table: 'G',
  ally: 'F',
  pass: 'P',
  raise: 'I',
  lower: 'O',
  faceUp: 'U',
};

const BY_LETTER = new Map(Object.entries(SHORTCUTS).map(([shortcut, letter]) => [letter, shortcut as Shortcut]));

/** A command the table offers right now, with what the search says it does. */
export type TableCommand = Readonly<{ run: () => void; hint: string }>;

type Table = Pick<CompassTable, 'token' | 'bidding'> | null;

/* Pass hands the bidder on while it points at the viewer; otherwise, in the Bidding phase, it turns the viewer's token face down to sit the bidding out. */
function passOf(table: Table): TableCommand | null {
  const token = table?.token;
  if (table?.bidding) {
    return { run: table.bidding.pass, hint: 'Command: hand the bidder on' };
  }
  return token?.inBidding && token.faceUp ? { run: token.flip, hint: 'Command: your token face down' } : null;
}

/* Flip faction token up brings a token that sat the bidding out back in. */
function faceUpOf(table: Table): TableCommand | null {
  const token = table?.token;
  return token?.inBidding && !token.faceUp ? { run: token.flip, hint: 'Command: bid again' } : null;
}

/** The lettered commands as the table stands, each null while the table does not offer it. */
export function commandsOf(table: Table): Readonly<Record<Command, TableCommand | null>> {
  const bidding = table?.bidding;
  return {
    pass: passOf(table),
    raise: bidding ? { run: bidding.raise, hint: 'Command: bid one spice more' } : null,
    lower: bidding?.lower ? { run: bidding.lower, hint: 'Command: take back your last raise' } : null,
    faceUp: faceUpOf(table),
  };
}

/* A key typed into a text field, a menu, a list or a dialog is theirs; so is one pressed on a control beside the table. */
const KEEPS_LETTERS =
  'input, textarea, select, [contenteditable="true"], [role="menu"], [role="listbox"], dialog, [role="dialog"], [aria-modal="true"]';
function keptElsewhere(target: EventTarget | null) {
  const element = target instanceof Element && target !== document.body && target !== document.documentElement;
  return element && (target.closest(KEEPS_LETTERS) !== null || target.closest('[data-compass-controls]') === null);
}

/* A bare first press of a shortcut's letter that nothing before it answered. */
function shortcutOf(event: KeyboardEvent): Shortcut | undefined {
  const modified = event.metaKey || event.ctrlKey || event.altKey;
  if (modified || event.repeat || event.defaultPrevented || keptElsewhere(event.target)) {
    return undefined;
  }
  return BY_LETTER.get(event.key.toUpperCase());
}

/*
 * The letters, heard after the table's own keys: a letter the table took for a piece under the cursor, such as F to
 * flip it or G to stack it, stays the piece's. The table binds its keys in a layout effect, before this effect runs.
 * A letter is claimed only when it did something, so one with nothing to do here still reaches the table.
 */
export function useShortcutKeys(enabled: boolean, onShortcut: (shortcut: Shortcut) => boolean) {
  const run = useEffectEvent(onShortcut);
  useEffect(() => {
    if (!enabled) {
      return;
    }
    const listener = (event: KeyboardEvent) => {
      const shortcut = shortcutOf(event);
      if (shortcut && run(shortcut)) {
        event.preventDefault();
      }
    };
    window.addEventListener('keydown', listener);
    return () => window.removeEventListener('keydown', listener);
  }, [enabled]);
}
