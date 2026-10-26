// @vitest-environment jsdom

import { MantineProvider } from '@mantine/core';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, expect, test, vi } from 'vite-plus/test';

import { ChatBar } from './ChatBar';
import { CompassTableContext } from './compassTable';
import type { CompassPlayer, CompassTable } from './compassTable';

/* jsdom has no matchMedia, which Mantine asks for. */
window.matchMedia = vi.fn().mockImplementation((query: string) => ({
  matches: false,
  media: query,
  onchange: null,
  addListener: vi.fn(),
  removeListener: vi.fn(),
  addEventListener: vi.fn(),
  removeEventListener: vi.fn(),
  dispatchEvent: vi.fn(),
}));

afterEach(cleanup);

const player = (seat: string, own: boolean): CompassPlayer => ({
  seat,
  name: own ? 'Me' : 'Them',
  factionName: own ? 'Atreides' : 'Fremen',
  token: null,
  unread: 0,
  own,
  canConverse: true,
  attention: false,
  ally: false,
});

function renderBar(players: readonly CompassPlayer[], hasHand = true) {
  const onShow = vi.fn();
  const table: CompassTable = {
    players,
    tableChat: null,
    chat: () => null,
    factionInfo: () => null,
    nextPhase: null,
    token: null,
  };
  render(
    <MantineProvider>
      <CompassTableContext.Provider value={table}>
        <ChatBar inert={false} hasHand={hasHand} isOpen={() => false} onOpenCompass={vi.fn()} onShow={onShow} />
      </CompassTableContext.Provider>
    </MantineProvider>
  );
  return onShow;
}

test('the own token sits left of the Controls button and opens Hand & spice', () => {
  const onShow = renderBar([player('seat-1', true), player('seat-2', false)]);
  const own = screen.getByRole('button', { name: 'Hand & spice, you are playing as Atreides' });
  const launcher = screen.getByRole('button', { name: /Controls/ });
  expect(own.compareDocumentPosition(launcher) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  fireEvent.click(own);
  expect(onShow).toHaveBeenCalledWith('hand');
});

test('a spectator has no own token', () => {
  renderBar([player('seat-2', false)]);
  expect(screen.queryByRole('button', { name: /you are playing as/ })).toBeNull();
});

test('before the table has a Hand & spice window there is no own token to open it', () => {
  renderBar([player('seat-1', true)], false);
  expect(screen.queryByRole('button', { name: /you are playing as/ })).toBeNull();
});
