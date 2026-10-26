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

/*
 * The commands as the table stands: Pass hands the bidder on while it points at the viewer, and otherwise turns the
 * viewer's token face down to sit the bidding out; Flip faction token up brings a token that sat out back in.
 */
export function commandsOf(
  table: Pick<CompassTable, 'token' | 'bidding'> | null
): Readonly<Record<Command, TableCommand | null>> {
  const bidding = table?.bidding ?? null;
  const token = table?.token ?? null;
  const pass = bidding
    ? { run: bidding.pass, hint: 'Command: hand the bidder on' }
    : token?.faceUp
      ? { run: token.flip, hint: 'Command: your token face down' }
      : null;
  return {
    pass,
    raise: bidding ? { run: bidding.raise, hint: 'Command: bid one spice more' } : null,
    lower: bidding?.lower ? { run: bidding.lower, hint: 'Command: take back your last raise' } : null,
    faceUp: token && !token.faceUp ? { run: token.flip, hint: 'Command: bid again' } : null,
  };
}

/* A key typed into a text field, a menu, a list or a dialog is theirs; so is one pressed on a control beside the table. */
const KEEPS_LETTERS = 'input, textarea, select, [contenteditable="true"], [role="menu"], [role="listbox"], dialog';
function keptElsewhere(target: EventTarget | null) {
  if (!(target instanceof Element) || target === document.body || target === document.documentElement) {
    return false;
  }
  return target.closest(KEEPS_LETTERS) !== null || target.closest('[data-compass-controls]') === null;
}

/*
 * The letters, heard after the table's own keys: a letter the table took for a piece under the cursor, such as F to
 * flip it or G to stack it, stays the piece's.
 */
export function useShortcutKeys(enabled: boolean, onShortcut: (shortcut: Shortcut) => void) {
  const run = useEffectEvent(onShortcut);
  useEffect(() => {
    if (!enabled) {
      return;
    }
    const listener = (event: KeyboardEvent) => {
      const shortcut = BY_LETTER.get(event.key.toUpperCase());
      const modified = event.metaKey || event.ctrlKey || event.altKey;
      if (!shortcut || modified || event.repeat || event.defaultPrevented || keptElsewhere(event.target)) {
        return;
      }
      event.preventDefault();
      run(shortcut);
    };
    window.addEventListener('keydown', listener);
    return () => window.removeEventListener('keydown', listener);
  }, [enabled]);
}
