import { expect, test } from 'vite-plus/test';

import { PAN_LETTERS, TABLE_KEYS } from '../../../../../widgets/tabletop/TableKeyboard';
import { SHORTCUTS } from '../../compass/shortcuts';
import { PIN_KEYS } from '../../compass/useOpenWindows';
import { SHORTCUT_ENTRIES, actionOf, capOfEvent, capsOf, entriesForCap, meaningNow } from './keyboardShortcuts';

const cap = (letter: string) => letter.toUpperCase();

test('each lettered key stands for what it does, and for nothing else', () => {
  /* A letter the compass and a piece share answers the piece while the pointer is over one, so it has an entry for each. */
  const expected: [string, string][] = [
    [SHORTCUTS.hand, 'Hand & spice'],
    [SHORTCUTS.hidden, 'Private side-table'],
    [SHORTCUTS.battle, 'Battle plan'],
    [SHORTCUTS.table, 'Table chat'],
    [SHORTCUTS.ally, 'Ally chat'],
    [PIN_KEYS.left, 'Pin the window'],
    [PIN_KEYS.right, 'Pin the window'],
    [SHORTCUTS.help, 'These shortcuts'],
    [SHORTCUTS.faceUp, 'Look straight down'],
    [SHORTCUTS.raise, 'Raise your bid'],
    [SHORTCUTS.lower, 'Take back your last raise'],
    [SHORTCUTS.pass, 'Pass'],
    [SHORTCUTS.faceUp, 'Rejoin the bidding'],
    [TABLE_KEYS.flip, 'Flip it'],
    [TABLE_KEYS.turnLeft, 'Turn it left or right'],
    [TABLE_KEYS.turnRight, 'Turn it left or right'],
    [TABLE_KEYS.take, 'Draw from the deck'],
    [TABLE_KEYS.take, 'Take one more'],
    [TABLE_KEYS.shuffle, 'Shuffle the deck'],
    ...PAN_LETTERS.map((letter): [string, string] => [letter, 'Slide the view']),
  ];
  for (const letter of new Set(expected.map(([key]) => cap(key)))) {
    const wanted = expected.filter(([key]) => cap(key) === letter).map(([, action]) => action);
    const actions = entriesForCap(letter).map((entry) => entry.action);
    expect(actions, letter).toHaveLength(wanted.length);
    for (const want of wanted) {
      expect(
        actions.some((action) => action.startsWith(want)),
        `${letter}: ${want}`
      ).toBe(true);
    }
  }
});

test('a key shows what it does in the moment that holds, and what it does anywhere otherwise', () => {
  const flip = cap(TABLE_KEYS.flip);
  expect(meaningNow(flip, [])?.action).toBe('Ally chat');
  expect(meaningNow(flip, ['piece', 'flip'])?.action).toBe('Flip it');
  expect(meaningNow(cap(SHORTCUTS.raise), [])).toBeNull();
  expect(meaningNow(cap(SHORTCUTS.raise), ['raise'])?.action).toBe('Raise your bid by one');
  expect(meaningNow(cap(TABLE_KEYS.take), ['flip', 'turn', 'split'])).toBeNull();
  expect(meaningNow(cap(TABLE_KEYS.take), ['putBack', 'takeMore'])?.action).toBe('Take one more');
  expect(meaningNow(cap(TABLE_KEYS.take), ['piece', 'draw'])?.action).toBe('Draw from the deck');
  expect(meaningNow(cap(SHORTCUTS.faceUp), ['pass'])?.action).toBe('Look straight down, and back');
  expect(meaningNow(cap(SHORTCUTS.faceUp), ['faceUp'])?.action).toBe('Rejoin the bidding');
});

test('a digit says what it does with its own number', () => {
  const spice = SHORTCUT_ENTRIES.find((entry) => entry.id === 'spice-take')!;
  expect(actionOf(spice, '0')).toBe('Take 10 spice');
  expect(actionOf(spice, '3')).toBe('Take 3 spice');
});

test('a pressed key is read in the spelling its cap shows', () => {
  expect(capOfEvent({ key: ' ' })).toBe('Space');
  expect(capOfEvent({ key: 'Escape' })).toBe('Esc');
  expect(capOfEvent({ key: 'ArrowLeft' })).toBe('←');
  expect(capOfEvent({ key: 'f' })).toBe('F');
  expect(capOfEvent({ key: '7' })).toBe('7');
  /* A key the table does not answer to lights nothing. */
  expect(capOfEvent({ key: 'k' })).toBeNull();
});

test('every entry has a short word and at least one key, and ids are unique', () => {
  const ids = SHORTCUT_ENTRIES.map((entry) => entry.id);
  expect(new Set(ids).size).toBe(ids.length);
  for (const entry of SHORTCUT_ENTRIES) {
    expect(entry.short.length, entry.id).toBeGreaterThan(0);
    expect(capsOf(entry).length, entry.id).toBeGreaterThan(0);
  }
});
