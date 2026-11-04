import { expect, test } from 'vite-plus/test';

import { PAN_LETTERS, TABLE_KEYS } from '../../../../../widgets/tabletop/TableKeyboard';
import { SHORTCUTS } from '../../compass/shortcuts';
import { PIN_KEYS } from '../../compass/useOpenWindows';
import { SHORTCUT_GROUPS } from './keyboardShortcuts';

const rows = SHORTCUT_GROUPS.flatMap((group) => group.rows);
const cap = (letter: string) => `{${letter.toUpperCase()}}`;

/* What each row a letter's key cap stands in does, in the sheet's order. */
function actionOf(letter: string) {
  const found = rows.filter((row) => row.keys.split(' ').includes(cap(letter)));
  return found.map((row) => row.action);
}

test('each lettered key stands in the row of what it does, and in no other', () => {
  /* A letter the compass and a piece share answers the piece while the pointer is over one, so it has a row in each group. */
  const expected: [string, string][] = [
    [SHORTCUTS.hand, 'Hand & spice'],
    [SHORTCUTS.hidden, 'Private side-table'],
    [SHORTCUTS.battle, 'Battle plan'],
    [SHORTCUTS.table, 'Table chat'],
    [SHORTCUTS.ally, 'Ally chat'],
    [PIN_KEYS.left, 'Pin the open window'],
    [PIN_KEYS.right, 'Pin the open window'],
    [SHORTCUTS.help, 'Show or hide these shortcuts'],
    [SHORTCUTS.faceUp, 'Look straight down at the board'],
    [SHORTCUTS.raise, 'Raise your bid'],
    [SHORTCUTS.lower, 'Take back your last raise'],
    [SHORTCUTS.pass, 'Pass'],
    [SHORTCUTS.faceUp, 'Rejoin the bidding'],
    [TABLE_KEYS.flip, 'Flip it'],
    [TABLE_KEYS.turnLeft, 'Turn it left or right'],
    [TABLE_KEYS.turnRight, 'Turn it left or right'],
    [TABLE_KEYS.stack, 'Stack the pieces there'],
    [TABLE_KEYS.lock, 'Lock or unlock it'],
    [TABLE_KEYS.take, 'Draw from the deck'],
    [TABLE_KEYS.shuffle, 'Shuffle the deck'],
  ];
  const letters = new Set(expected.map(([letter]) => letter.toUpperCase()));
  for (const letter of letters) {
    const wanted = expected.filter(([other]) => other.toUpperCase() === letter).map(([, action]) => action);
    const actions = actionOf(letter);
    expect(actions, letter).toHaveLength(wanted.length);
    actions.forEach((action, index) => expect(action.startsWith(wanted[index]!), `${letter}: ${action}`).toBe(true));
  }
});

test('the cheat sheet names every pan letter beside the arrows', () => {
  expect(PAN_LETTERS).toEqual(['w', 'a', 's', 'd']);
  const arrows = rows.find((row) => row.action.startsWith('Slide the view'));
  for (const letter of PAN_LETTERS) {
    expect(arrows?.action).toContain(cap(letter));
  }
});

test('every key in the cheat sheet is a closed key cap', () => {
  for (const row of rows) {
    for (const text of [row.keys, row.action]) {
      expect(text).toMatch(/^(?:[^{}]|\{[^{}]+\})*$/);
    }
  }
});
