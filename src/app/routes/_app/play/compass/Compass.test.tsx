// @vitest-environment jsdom

import { act, cleanup, render, screen } from '@testing-library/react';
import { useRef, useState } from 'react';
import { afterEach, beforeAll, expect, test, vi } from 'vite-plus/test';

import { Compass } from './Compass';
import type { Spot, TileSpot } from './compassSpots';
import type { Tile } from './compassTiles';
import { useCompassKeys } from './useCompassKeys';

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

/* The open compass over the table, with its keys listening as the controls wire them, and a chat field behind the veil. */
function OpenCompass() {
  const input = useRef<HTMLInputElement>(null);
  useCompassKeys({
    open: true,
    inert: false,
    spot: 'hub',
    query: '',
    cursor: 0,
    suggestions: 0,
    input,
    onOpen: vi.fn(),
    onClose: vi.fn(),
    onSpot: vi.fn(),
    onCursor: vi.fn(),
    onConfirm: vi.fn(),
  });
  return (
    <div data-compass-controls>
      <textarea aria-label="Chat behind the veil" />
      <Compass
        tiles={tiles}
        suggestions={[]}
        spot="hub"
        query=""
        cursor={0}
        refused={0}
        input={input}
        onSpot={vi.fn()}
        onQuery={vi.fn()}
        onCursor={vi.fn()}
        onConfirm={vi.fn()}
        onClose={vi.fn()}
      />
    </div>
  );
}

function tab(target: Element, shiftKey = false) {
  const event = new KeyboardEvent('keydown', { key: 'Tab', shiftKey, bubbles: true, cancelable: true });
  act(() => void target.dispatchEvent(event));
  return event;
}

test('Tab from the compass’s last control comes back to its first, rather than leave for a field behind the veil', () => {
  render(<OpenCompass />);
  const buttons = screen.getAllByRole('button', { hidden: true });
  const last = buttons.at(-1)!;
  last.focus();
  expect(tab(last).defaultPrevented).toBe(true);
  expect(document.activeElement).toBe(buttons[0]);
  expect(tab(buttons[0]!, true).defaultPrevented).toBe(true);
  expect(document.activeElement).toBe(last);
});

test('Tab between the compass’s own controls is the browser’s, and Tab from a field behind the veil comes back in', () => {
  render(<OpenCompass />);
  const buttons = screen.getAllByRole('button', { hidden: true });
  expect(tab(buttons[0]!).defaultPrevented).toBe(false);
  const behind = screen.getByRole('textbox', { name: 'Chat behind the veil' });
  behind.focus();
  expect(tab(behind).defaultPrevented).toBe(true);
  expect(document.activeElement).toBe(buttons[0]);
});

/* The compass with its spot held as the controls hold it, so the arrows really move the selection. */
function SteeredCompass() {
  const input = useRef<HTMLInputElement>(null);
  const [spot, setSpot] = useState<Spot>('hub');
  useCompassKeys({
    open: true,
    inert: false,
    spot,
    query: '',
    cursor: 0,
    suggestions: 0,
    input,
    onOpen: vi.fn(),
    onClose: vi.fn(),
    onSpot: setSpot,
    onCursor: vi.fn(),
    onConfirm: vi.fn(),
  });
  return (
    <div data-compass-controls>
      <Compass
        tiles={tiles}
        suggestions={[]}
        spot={spot}
        query=""
        cursor={0}
        refused={0}
        input={input}
        onSpot={setSpot}
        onQuery={vi.fn()}
        onCursor={vi.fn()}
        onConfirm={vi.fn()}
        onClose={vi.fn()}
      />
    </div>
  );
}

test('an arrow from a tile Tab reached keeps its selection when the caret goes back to the search', () => {
  const { container } = render(<SteeredCompass />);
  const tile = container.querySelector<HTMLElement>('[data-spot="table"]')!;
  act(() => tile.focus());
  act(
    () => void tile.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowLeft', bubbles: true, cancelable: true }))
  );
  expect(document.activeElement).toBe(screen.getByRole('textbox', { name: 'Search controls', hidden: true }));
  expect(container.querySelector('[data-spot="hand"]')?.hasAttribute('data-selected')).toBe(true);
});
