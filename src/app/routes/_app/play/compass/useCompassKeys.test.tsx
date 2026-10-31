// @vitest-environment jsdom

import { act, cleanup, renderHook } from '@testing-library/react';
import { useState } from 'react';
import { afterEach, expect, test, vi } from 'vite-plus/test';

import type { Spot } from './compassSpots';
import { useCompassKeys } from './useCompassKeys';

afterEach(() => {
  cleanup();
  document.body.replaceChildren();
});

/* The compass's search field and a table button, as the keys find them in the document. */
function page() {
  const input = document.createElement('input');
  const button = document.createElement('button');
  const textarea = document.createElement('textarea');
  const menu = document.createElement('div');
  menu.setAttribute('role', 'menu');
  const item = document.createElement('div');
  menu.append(item);
  const ring = document.createElement('div');
  ring.setAttribute('role', 'menu');
  ring.setAttribute('data-radial-menu', '');
  const spoke = document.createElement('button');
  ring.append(spoke);
  const controls = document.createElement('div');
  controls.setAttribute('data-compass-controls', '');
  controls.append(input, button, textarea, menu);
  /* A control beside the table, as a tutorial's guide is. */
  const beside = document.createElement('button');
  /* A piece's radial ring is portalled to the body, outside the controls. */
  document.body.append(controls, beside, ring);
  return { input, button, textarea, item, spoke, beside };
}

/* The compass's state as the controls hold it, with the hook listening for the keys. */
function compass(options: { inert?: boolean; suggestions?: number } = {}) {
  const input = document.querySelector('input')!;
  const onConfirm = vi.fn();
  const hook = renderHook(() => {
    const [open, setOpen] = useState(false);
    const [spot, setSpot] = useState<Spot>('hub');
    const [query, setQuery] = useState('');
    const [cursor, setCursor] = useState(0);
    useCompassKeys({
      open,
      inert: options.inert ?? false,
      spot,
      query,
      cursor,
      suggestions: options.suggestions ?? 3,
      input: { current: input },
      onOpen: () => {
        setOpen(true);
        setSpot('hub');
      },
      onClose: () => setOpen(false),
      onSpot: setSpot,
      onCursor: setCursor,
      onConfirm,
    });
    return { open, spot, cursor, setSpot, setQuery };
  });
  return { ...hook, onConfirm };
}

type Key = Partial<Pick<KeyboardEvent, 'key' | 'code' | 'repeat' | 'metaKey' | 'ctrlKey' | 'isComposing' | 'keyCode'>>;

/* A key as the browser sends it: to the target, up through the document, where the hook hears it on the window. */
function press(type: 'keydown' | 'keyup', key: Key, target: EventTarget = document.body) {
  const event = new KeyboardEvent(type, { bubbles: true, cancelable: true, ...key });
  act(() => {
    target.dispatchEvent(event);
  });
  return event;
}

const SPACE = { key: ' ', code: 'Space' };

test('a tapped Space opens the compass and leaves it open; the arrows then steer and Space confirms', () => {
  page();
  const { result, onConfirm } = compass();
  expect(press('keydown', SPACE).defaultPrevented).toBe(true);
  expect(result.current.open).toBe(true);
  press('keyup', SPACE);
  expect(result.current.open).toBe(true);
  expect(onConfirm).not.toHaveBeenCalled();

  press('keydown', { key: 'ArrowLeft' });
  expect(result.current.spot).toBe('hand');
  press('keydown', { key: 'ArrowLeft' });
  expect(result.current.spot).toBe('hidden');
  press('keydown', { key: 'ArrowRight' });
  expect(result.current.spot).toBe('hand');
  press('keydown', SPACE);
  expect(onConfirm).toHaveBeenCalledTimes(1);
});

test('Space held while the arrows steer opens what they point at when it is let go', () => {
  page();
  const { result, onConfirm } = compass();
  press('keydown', SPACE);
  /* The key repeats while held, and the repeats are swallowed rather than confirming. */
  expect(press('keydown', { ...SPACE, repeat: true }).defaultPrevented).toBe(true);
  press('keydown', { key: 'ArrowRight' });
  expect(result.current.spot).toBe('table');
  expect(onConfirm).not.toHaveBeenCalled();
  press('keyup', SPACE);
  expect(onConfirm).toHaveBeenCalledTimes(1);
});

test('W, A, S and D steer as the arrows do while Space is held and nothing is typed, then they spell', () => {
  page();
  const { result } = compass();
  press('keydown', SPACE);
  press('keydown', { key: 'a' });
  expect(result.current.spot).toBe('hand');
  press('keydown', { key: 'A' });
  expect(result.current.spot).toBe('hidden');
  press('keydown', { key: 'd' });
  press('keydown', { key: 'w' });
  expect(result.current.spot).toBe('battle');
  press('keydown', { key: 's' });
  expect(result.current.spot).toBe('hub');
  act(() => result.current.setQuery('spi'));
  expect(press('keydown', { key: 'd' }).defaultPrevented).toBe(false);
  expect(result.current.spot).toBe('hub');
});

test('On a compass Space only tapped open, W, A, S and D go to the search, so a search for "Shared" keeps its S', () => {
  page();
  const { result } = compass();
  press('keydown', SPACE);
  press('keyup', SPACE);
  for (const key of ['s', 'w', 'a', 'd', 'S']) {
    expect(press('keydown', { key }).defaultPrevented).toBe(false);
    expect(result.current.spot).toBe('hub');
  }
});

test('Space let go while the window is in the background ends the hold, so the open compass then reads as tapped open', () => {
  page();
  const { result, onConfirm } = compass();
  press('keydown', SPACE);
  press('keydown', { key: 'ArrowRight' });
  /* The keyup goes to whatever window has focus now, never to this one. */
  act(() => {
    window.dispatchEvent(new Event('blur'));
  });
  expect(result.current.open).toBe(true);
  expect(onConfirm).not.toHaveBeenCalled();
  /* Back in the window, a letter goes to the search rather than steering, and a tapped Space confirms. */
  expect(press('keydown', { key: 's' }).defaultPrevented).toBe(false);
  expect(result.current.spot).toBe('table');
  press('keydown', SPACE);
  expect(onConfirm).toHaveBeenCalledTimes(1);
});

test('Enter confirms and Escape closes', () => {
  page();
  const { result, onConfirm } = compass();
  press('keydown', SPACE);
  press('keyup', SPACE);
  press('keydown', { key: 'Enter' });
  expect(onConfirm).toHaveBeenCalledTimes(1);
  press('keydown', { key: 'Escape' });
  expect(result.current.open).toBe(false);
});

test('Tab moves through the tiles as the browser does, and Enter or Space on a tile Tab reached is the tile’s own', () => {
  const { button } = page();
  const { onConfirm } = compass();
  press('keydown', SPACE);
  press('keyup', SPACE);
  expect(press('keydown', { key: 'Tab' }).defaultPrevented).toBe(false);
  expect(press('keydown', { key: 'Enter' }, button).defaultPrevented).toBe(false);
  expect(press('keydown', SPACE, button).defaultPrevented).toBe(false);
  expect(onConfirm).not.toHaveBeenCalled();
});

test('a letter typed anywhere on the open compass goes to the search field', () => {
  const { input } = page();
  compass();
  press('keydown', SPACE);
  press('keyup', SPACE);
  expect(press('keydown', { key: 'r' }).defaultPrevented).toBe(false);
  expect(document.activeElement).toBe(input);
});

test('up and down step through the suggestions, and up from the first returns to the hub', () => {
  page();
  const { result } = compass({ suggestions: 2 });
  press('keydown', SPACE);
  press('keyup', SPACE);
  press('keydown', { key: 'ArrowDown' });
  expect(result.current.spot).toBe('search');
  press('keydown', { key: 'ArrowDown' });
  expect(result.current.cursor).toBe(1);
  press('keydown', { key: 'ArrowDown' });
  expect(result.current.cursor).toBe(1);
  press('keydown', { key: 'ArrowUp' });
  expect(result.current.cursor).toBe(0);
  press('keydown', { key: 'ArrowUp' });
  expect(result.current.spot).toBe('hub');
});

test('with something typed, left and right move the caret and Space is a letter', () => {
  const { input } = page();
  const { result, onConfirm } = compass();
  press('keydown', SPACE);
  press('keyup', SPACE);
  act(() => result.current.setQuery('ri'));
  expect(press('keydown', { key: 'ArrowLeft' }, input).defaultPrevented).toBe(false);
  expect(result.current.spot).toBe('hub');
  expect(press('keydown', SPACE, input).defaultPrevented).toBe(false);
  expect(onConfirm).not.toHaveBeenCalled();
});

test('Space stays with a text field, an open menu, a held table and a repeat', () => {
  const { textarea, item } = page();
  const { result, rerender } = compass();
  expect(press('keydown', SPACE, textarea).defaultPrevented).toBe(false);
  expect(press('keydown', SPACE, item).defaultPrevented).toBe(false);
  expect(press('keydown', { ...SPACE, repeat: true }).defaultPrevented).toBe(false);
  expect(result.current.open).toBe(false);
  rerender();
  cleanup();
  const held = compass({ inert: true });
  expect(press('keydown', SPACE).defaultPrevented).toBe(false);
  expect(held.result.current.open).toBe(false);
});

test('a button on the table opens the compass with Space, and one beside the table keeps Space to press itself', () => {
  const { button, beside } = page();
  const { result } = compass();
  expect(press('keydown', SPACE, beside).defaultPrevented).toBe(false);
  expect(result.current.open).toBe(false);
  expect(press('keydown', SPACE, button).defaultPrevented).toBe(true);
  expect(result.current.open).toBe(true);
});

test('Space on a piece’s radial ring, left open after a draw, opens the compass instead of pressing the spoke again', () => {
  const { spoke } = page();
  const { result } = compass();
  expect(press('keydown', SPACE, spoke).defaultPrevented).toBe(true);
  expect(result.current.open).toBe(true);
});

// Safari can finish composition with isComposing false while retaining key code 229.
const COMPOSITION_EVENTS = [{ isComposing: true }, { keyCode: 229 }];

test.each(COMPOSITION_EVENTS)('composing keys stay with the compass search: %j', (composition) => {
  const { input } = page();
  const { result, onConfirm } = compass();
  press('keydown', SPACE);
  press('keyup', SPACE);
  act(() => result.current.setQuery('sp'));
  for (const key of ['Enter', 'ArrowDown', 'Escape']) {
    const event = press('keydown', { key, ...composition }, input);
    expect(event.defaultPrevented).toBe(false);
    expect(result.current.open).toBe(true);
    expect(result.current.spot).toBe('hub');
    expect(result.current.cursor).toBe(0);
    expect(onConfirm).not.toHaveBeenCalled();
  }
  // An ordinary Enter still confirms after the composition ends.
  press('keydown', { key: 'Enter' }, input);
  expect(onConfirm).toHaveBeenCalledTimes(1);
});

test.each(COMPOSITION_EVENTS)('composing Space does not open the compass: %j', (composition) => {
  page();
  const { result, onConfirm } = compass();
  expect(press('keydown', { ...SPACE, ...composition }).defaultPrevented).toBe(false);
  press('keyup', { ...SPACE, ...composition });
  expect(result.current.open).toBe(false);
  expect(onConfirm).not.toHaveBeenCalled();
});

test.each(COMPOSITION_EVENTS)('composing Space release does not confirm a held compass: %j', (composition) => {
  const { input } = page();
  const { onConfirm } = compass();
  press('keydown', SPACE);
  press('keydown', { key: 'ArrowRight' });
  press('keyup', { ...SPACE, ...composition }, input);
  expect(onConfirm).not.toHaveBeenCalled();
  // The released hold is gone, so another keyup cannot confirm it later.
  press('keyup', SPACE, input);
  expect(onConfirm).not.toHaveBeenCalled();
});

test('a control with an explicit Space shortcut keeps Space for its own action', () => {
  const { button } = page();
  button.setAttribute('aria-keyshortcuts', 'Enter Space');
  const { result } = compass();
  expect(press('keydown', SPACE, button).defaultPrevented).toBe(false);
  expect(result.current.open).toBe(false);
});
