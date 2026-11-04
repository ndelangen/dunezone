import { expect, test } from 'vite-plus/test';

import { SHORTCUTS } from '../../compass/shortcuts';
import { PIN_KEYS } from '../../compass/useOpenWindows';
import { SHORTCUT_GROUPS } from './keyboardShortcuts';

const listed = SHORTCUT_GROUPS.flatMap((group) => group.rows.map((row) => row.keys)).join(' ');

test('the cheat sheet lists every lettered compass key and both pin keys', () => {
  for (const letter of [...Object.values(SHORTCUTS), ...Object.values(PIN_KEYS)]) {
    expect(listed).toContain(`{${letter}}`);
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
