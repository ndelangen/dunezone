// @vitest-environment jsdom

import { act, cleanup, renderHook } from '@testing-library/react';
import { afterEach, expect, test, vi } from 'vite-plus/test';

import { useShortcutKeys } from './shortcuts';
import type { Shortcut } from './shortcuts';

afterEach(() => {
  cleanup();
  document.body.replaceChildren();
});

/* The controls over the table with a button and a chat field in them, and a control beside the table. */
function page() {
  const controls = document.createElement('div');
  controls.setAttribute('data-compass-controls', '');
  const button = document.createElement('button');
  const field = document.createElement('textarea');
  /* A peek at cards opens as a dialog over the table, with its close button focused. */
  const peek = document.createElement('div');
  peek.setAttribute('role', 'dialog');
  const close = document.createElement('button');
  peek.append(close);
  controls.append(button, field, peek);
  const beside = document.createElement('button');
  document.body.append(controls, beside);
  return { button, field, beside, close };
}

function press(key: string, target: EventTarget = document.body, init: KeyboardEventInit = {}) {
  const event = new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true, ...init });
  act(() => void target.dispatchEvent(event));
  return event;
}

test('each letter runs its shortcut over the table and on its controls, whatever the case', () => {
  const { button } = page();
  const onShortcut = vi.fn((_shortcut: Shortcut) => true);
  renderHook(() => useShortcutKeys(true, onShortcut));
  press('h');
  press('J', button);
  press('b');
  press('g');
  press('f');
  press('p');
  press('i');
  press('o');
  press('u');
  expect(onShortcut.mock.calls.map(([shortcut]) => shortcut)).toEqual([
    'hand',
    'hidden',
    'battle',
    'table',
    'ally',
    'pass',
    'raise',
    'lower',
    'faceUp',
  ]);
});

test('a letter typed in a field, in a dialog, beside the table, with a modifier, held, or already taken by a piece does nothing', () => {
  const { field, beside, close } = page();
  const onShortcut = vi.fn((_shortcut: Shortcut) => true);
  renderHook(() => useShortcutKeys(true, onShortcut));
  press('h', field);
  press('h', beside);
  press('p', close);
  press('h', document.body, { metaKey: true });
  press('h', document.body, { repeat: true });
  /* The table flipped the piece under the cursor first. */
  const taken = new KeyboardEvent('keydown', { key: 'f', bubbles: true, cancelable: true });
  taken.preventDefault();
  act(() => void document.body.dispatchEvent(taken));
  press('x');
  expect(onShortcut).not.toHaveBeenCalled();
});

test('with the compass open the letters are its search’s', () => {
  page();
  const onShortcut = vi.fn((_shortcut: Shortcut) => true);
  renderHook(() => useShortcutKeys(false, onShortcut));
  press('h');
  expect(onShortcut).not.toHaveBeenCalled();
});

test('a letter with nothing to do here is left to the table', () => {
  page();
  renderHook(() => useShortcutKeys(true, (shortcut) => shortcut !== 'faceUp'));
  expect(press('u').defaultPrevented).toBe(false);
  expect(press('h').defaultPrevented).toBe(true);
});
