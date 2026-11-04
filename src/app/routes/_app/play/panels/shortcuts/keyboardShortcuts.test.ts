import { expect, test } from 'vite-plus/test';

import { PAN_LETTERS, TABLE_KEYS } from '../../../../../widgets/tabletop/TableKeyboard';
import { SHORTCUTS } from '../../compass/shortcuts';
import { PIN_KEYS } from '../../compass/useOpenWindows';
import { SHORTCUT_GROUPS } from './keyboardShortcuts';

const listed = SHORTCUT_GROUPS.flatMap((group) => group.rows.map((row) => row.keys)).join(' ');

const actions = SHORTCUT_GROUPS.flatMap((group) => group.rows.map((row) => row.action)).join(' ');

test('the cheat sheet lists every lettered compass key, both pin keys and every piece key', () => {
  for (const letter of [...Object.values(SHORTCUTS), ...Object.values(PIN_KEYS), ...Object.values(TABLE_KEYS)]) {
    expect(listed).toContain(`{${letter.toUpperCase()}}`);
  }
});

test('the cheat sheet names every pan letter beside the arrows', () => {
  expect(PAN_LETTERS).toEqual(['w', 'a', 's', 'd']);
  for (const letter of PAN_LETTERS) {
    expect(actions).toContain(`{${letter.toUpperCase()}}`);
  }
});

test('every key in the cheat sheet is a closed key cap', () => {
  for (const group of SHORTCUT_GROUPS) {
    for (const row of group.rows) {
      for (const text of [row.keys, row.action]) {
        expect(text.split('{').length).toBe(text.split('}').length);
      }
    }
  }
});
