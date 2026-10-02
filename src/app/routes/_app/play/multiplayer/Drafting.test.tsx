/** @vitest-environment jsdom */

import { MantineProvider } from '@mantine/core';
import { cleanup, render, screen } from '@testing-library/react';
import { appContentTheme } from '@ui/theme';
import { afterEach, expect, test, vi } from 'vitest';

import { draftingSnapshot, storyPlayer } from '../drafting.stories.fixture';
import { DraftingNotice } from './Drafting';
import type { TableProjection, TableSession } from './TableSession';

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

const PLAYERS = [storyPlayer('seat-1', 'thialfi'), storyPlayer('seat-2', 'ridwan')];

/* Only what the drafting views read of a projection: the snapshot, the viewer's seat and whether it may act. */
function projection(viewerSeat: string, snapshot = draftingSnapshot(PLAYERS, 4)): TableProjection {
  return {
    snapshot,
    viewer: { viewerSeat },
    canInteract: viewerSeat !== 'neutral',
    seatCommandPending: false,
  } as unknown as TableProjection;
}

function show(element: React.ReactElement) {
  render(
    <MantineProvider theme={appContentTheme} forceColorScheme="light">
      {element}
    </MantineProvider>
  );
}

const client = { command: vi.fn() } as unknown as TableSession;
const failed = draftingSnapshot(PLAYERS, 2, { failure: 'Set aside as not ready to deal: Iduali (no token).' });

test('a player is offered the deal again after it failed', () => {
  show(<DraftingNotice client={client} table={projection('seat-1', failed)} />);
  expect(screen.getByRole('alert').textContent).toContain('Seats were not dealt.');
  expect(screen.getByRole<HTMLButtonElement>('button', { name: 'Try again' }).disabled).toBe(false);
});

test('a spectator reads why the deal failed but is offered no deal to try again', () => {
  show(<DraftingNotice client={client} table={projection('neutral', failed)} />);
  expect(screen.getByRole('alert').textContent).toContain('Seats were not dealt.');
  expect(screen.queryByRole('button', { name: 'Try again' })).toBeNull();
});
