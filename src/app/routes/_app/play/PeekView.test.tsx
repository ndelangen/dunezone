/** @vitest-environment jsdom */

import { MantineProvider } from '@mantine/core';
import { initialSnapshot } from '@shared/play/commands';
import type { TablePiece } from '@shared/play/model';
import { PEEK_DECK_LIMIT } from '@shared/play/peeking';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { appContentTheme } from '@ui/theme';
import { afterEach, expect, test, vi } from 'vitest';

import { stubMatchMedia } from './multiplayer/jsdom.test.fixture';
import type { TableProjection, TableSession } from './multiplayer/TableSession';
import { PeekView } from './PeekView';
import { TabletopSessionProvider } from './TabletopContext';

stubMatchMedia();

afterEach(cleanup);

const deck = initialSnapshot().table.pieces.find((piece) => piece.id === 'treachery-deck') as TablePiece;

/* Only what the peek view reads of the live table, behind a session that renders again when the test changes it. */
function liveTable(piece: TablePiece) {
  const listeners = new Set<() => void>();
  const controls = { peek: vi.fn(), arrange: vi.fn(), pull: vi.fn() };
  let table = { peek: { piece }, peekControls: controls, closePeek: vi.fn() } as unknown as TableProjection;
  const session = {
    getTable: () => table,
    subscribeTable: (listener: () => void) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  } as unknown as TableSession;
  render(
    <MantineProvider theme={appContentTheme} forceColorScheme="light">
      <TabletopSessionProvider session={session}>
        <PeekView />
      </TabletopSessionProvider>
    </MantineProvider>
  );
  return {
    controls,
    show(next: TablePiece) {
      table = { ...table, peek: { piece: next } } as TableProjection;
      act(() => listeners.forEach((listener) => listener()));
    },
  };
}

const handles = () => screen.getAllByRole('button', { name: /\.( Arrow keys move it\.)?$/ });

test('the card moved with the keyboard keeps focus when the room gives the deck new ids, so the arrows stay with the deck', () => {
  const { controls, show } = liveTable(deck);
  handles()[0]!.focus();
  fireEvent.keyDown(handles()[0]!, { key: 'ArrowRight' });
  /* Top first on screen, bottom first to the room: the top card moves one place down. */
  expect(controls.arrange).toHaveBeenCalledWith('treachery-deck', [0, 1, 3, 2]);

  const moved = [0, 1, 3, 2].map((index, place) => ({ ...deck.items[index]!, id: `rekeyed-${place}` }));
  show({ ...deck, items: moved });
  expect(document.activeElement).toBe(handles()[1]);
  const arrow = new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true, cancelable: true });
  document.activeElement!.dispatchEvent(arrow);
  expect(arrow.defaultPrevented).toBe(true);
});

test('a locked deck can be looked through, but offers no move and no pull', () => {
  const { controls } = liveTable({ ...deck, locked: true });
  expect(screen.getByText('Only you see these cards. Unlock the deck to change it.')).toBeTruthy();
  const [top] = handles();
  fireEvent.keyDown(top!, { key: 'ArrowRight' });
  fireEvent.pointerDown(top!, { button: 0, pointerId: 1, clientX: 10 });
  expect(controls.arrange).not.toHaveBeenCalled();
  for (const pull of screen.getAllByRole<HTMLButtonElement>('button', { name: 'Pull out' })) {
    expect(pull.disabled).toBe(true);
  }
});

test('a deck over the limit can only be looked through', () => {
  const items = Array.from({ length: PEEK_DECK_LIMIT + 1 }, (_, index) => ({ ...deck.items[0]!, id: `card-${index}` }));
  const { controls } = liveTable({ ...deck, items });
  expect(screen.getByText(/can only be looked through/)).toBeTruthy();
  fireEvent.keyDown(handles()[0]!, { key: 'ArrowRight' });
  expect(controls.arrange).not.toHaveBeenCalled();
  expect(screen.getAllByRole<HTMLButtonElement>('button', { name: 'Pull out' }).every((pull) => pull.disabled)).toBe(
    true
  );
});
