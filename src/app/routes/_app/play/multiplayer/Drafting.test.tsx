/** @vitest-environment jsdom */

import { MantineProvider } from '@mantine/core';
import { cleanup, render, screen } from '@testing-library/react';
import { appContentTheme } from '@ui/theme';
import { afterEach, expect, test, vi } from 'vitest';

import { draftingSnapshot, storyPlayer } from '../drafting.stories.fixture';
import { DraftingNotice, DraftingOverlay } from './Drafting';
import { stubMatchMedia } from './jsdom.test.fixture';
import type { TableProjection, TableSession } from './TableSession';

stubMatchMedia();

afterEach(cleanup);

/* Unlinked, so the ledger draws their avatars without a router to lead to their profiles. */
const PLAYERS = [storyPlayer('seat-1', 'thialfi'), storyPlayer('seat-2', 'ridwan')].map((player) => ({
  ...player,
  slug: null,
}));

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

test('the ledger offers as many open seats as the header still waits for, after players left a larger table', () => {
  /* Six seats, dealt from four: two players remain, so two more are needed, not four. */
  show(<DraftingOverlay client={client} table={projection('seat-1', draftingSnapshot(PLAYERS, 6, { minimum: 4 }))} />);
  expect(screen.getAllByTitle('Open seat')).toHaveLength(2);
});

test('the ledger offers no open seat once the table meets its minimum', () => {
  show(<DraftingOverlay client={client} table={projection('seat-1', draftingSnapshot(PLAYERS, 6, { minimum: 2 }))} />);
  expect(screen.queryAllByTitle('Open seat')).toHaveLength(0);
});
