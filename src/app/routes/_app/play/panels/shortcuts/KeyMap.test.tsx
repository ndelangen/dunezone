/** @vitest-environment jsdom */

import { cleanup, render } from '@testing-library/react';
import { afterEach, expect, test } from 'vite-plus/test';

import { SHORTCUT_ENTRIES } from './keyboardShortcuts';
import { Caption } from './KeyMap';

afterEach(cleanup);

const entry = (id: string) => SHORTCUT_ENTRIES.find((each) => each.id === id)!;
const lit = (id: string, keyName: string) =>
  render(<Caption entry={entry(id)} keyName={keyName} />).container.querySelector('b')?.textContent ?? null;

test('a key chosen for its word lights its letter in the caption', () => {
  expect(lit('hand', 'H')).toBe('H');
  expect(lit('shuffle', 'R')).toBe('R');
});

test('a letter the caption only happens to contain stays plain', () => {
  /* A slides the view; "Pan" has an a by chance. */
  expect(lit('pan-letters', 'A')).toBeNull();
});
