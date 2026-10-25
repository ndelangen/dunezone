// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { createRef } from 'react';
import { afterEach, beforeAll, expect, test, vi } from 'vite-plus/test';

import { Compass } from './Compass';
import type { TileSpot } from './compassSpots';
import type { Tile } from './compassTiles';

/* jsdom has the dialog element without its show(). */
beforeAll(() => {
  HTMLDialogElement.prototype.show ??= function show(this: HTMLDialogElement) {
    this.setAttribute('open', '');
  };
});
afterEach(() => {
  cleanup();
  document.body.replaceChildren();
});

const SPOTS: readonly TileSpot[] = ['battle', 'hidden', 'hand', 'table', 'ally'];
const tiles = Object.fromEntries(
  SPOTS.map((spot): [TileSpot, Tile] => [spot, { spot, label: spot, detail: '', keys: '', icon: null }])
) as Record<TileSpot, Tile>;

function compass() {
  const behind = document.body.appendChild(document.createElement('textarea'));
  render(
    <Compass
      tiles={tiles}
      suggestions={[]}
      spot="hub"
      query=""
      cursor={0}
      refused={0}
      input={createRef()}
      onSpot={vi.fn()}
      onQuery={vi.fn()}
      onCursor={vi.fn()}
      onConfirm={vi.fn()}
      onClose={vi.fn()}
    />
  );
  return { behind, buttons: screen.getAllByRole('button', { hidden: true }) };
}

test('Tab from the last control comes back to the first, rather than leave for a field behind the veil', () => {
  const { behind, buttons } = compass();
  const last = buttons.at(-1)!;
  last.focus();
  expect(fireEvent.keyDown(last, { key: 'Tab' })).toBe(false);
  expect(document.activeElement).toBe(buttons[0]);
  expect(fireEvent.keyDown(buttons[0]!, { key: 'Tab', shiftKey: true })).toBe(false);
  expect(document.activeElement).toBe(last);
  expect(document.activeElement).not.toBe(behind);
});

test('Tab between the compass’s own controls is the browser’s', () => {
  const { buttons } = compass();
  buttons[0]!.focus();
  expect(fireEvent.keyDown(buttons[0]!, { key: 'Tab' })).toBe(true);
});
