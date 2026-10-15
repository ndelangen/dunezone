/** @vitest-environment jsdom */

import { MantineProvider } from '@mantine/core';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { appContentTheme } from '@ui/theme';
import { afterEach, expect, test, vi } from 'vite-plus/test';

import type { TableProjection, TableSession } from '../../../../db/tabletop/TableSession';
import { draftingSnapshot, storyPlayer } from '../drafting.stories.fixture';
import { DraftingHeader, DraftingOverlay, DraftingReady } from './Drafting';
import { stubMatchMedia } from './jsdom.test.fixture';

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

function withRequests(seatRequests: { id: string; requesterName: string; seat: null; own?: boolean }[]) {
  const snapshot = draftingSnapshot(PLAYERS, 4);
  return { ...snapshot, controls: { ...snapshot.controls!, seatRequests } };
}

test('every viewer reads in the drafting chip why the deal failed; Ready deals again', () => {
  show(<DraftingHeader table={projection('neutral', failed)} />);
  const line = screen.getByText('Seats were not dealt', { exact: false });
  expect(line.textContent).toContain('Iduali (no token)');
});

test("a spectator's refused seat request is said beneath the roster where it was asked", () => {
  show(<DraftingOverlay client={client} table={projection('neutral')} error="The table is full." />);
  expect(screen.getByText('The table is full.')).toBeTruthy();
});

test('the drafting chip draws the three steps before the deal, ringing the first one not met', () => {
  show(
    <DraftingHeader
      table={projection('seat-1', draftingSnapshot(PLAYERS, 6, { minimum: 4 }))}
      rulesetName="Dreamrules"
    />
  );
  expect(screen.getByText('Dreamrules', { exact: false })).toBeTruthy();
  expect(screen.getByRole('list', { name: 'Before the deal' }).textContent).toMatch(
    /Players 2\/4\+.*Factions 0\/2.*Ready 0\/2/
  );
  expect(screen.getByText('Waiting for 2 more players')).toBeTruthy();
});

test("a player sees no (+) in the roster: it is a spectator's way to ask for a seat", () => {
  show(<DraftingOverlay client={client} table={projection('seat-1', draftingSnapshot(PLAYERS, 6, { minimum: 4 }))} />);
  expect(screen.queryByRole('button', { name: 'Take a seat' })).toBeNull();
});

test('a spectator asks for a seat with the (+), then waits there and can withdraw', () => {
  const command = vi.fn();
  const watcher = { command } as unknown as TableSession;
  const { rerender } = render(
    <MantineProvider theme={appContentTheme} forceColorScheme="light">
      <DraftingOverlay client={watcher} table={projection('neutral')} />
    </MantineProvider>
  );
  fireEvent.click(screen.getByRole('button', { name: 'Take a seat' }));
  expect(command).toHaveBeenCalledWith({ kind: 'seat-request' });
  rerender(
    <MantineProvider theme={appContentTheme} forceColorScheme="light">
      <DraftingOverlay
        client={watcher}
        table={projection('neutral', withRequests([{ id: 'mine', requesterName: 'Me', seat: null, own: true }]))}
      />
    </MantineProvider>
  );
  expect(screen.queryByRole('button', { name: 'Take a seat' })).toBeNull();
  expect(screen.getByText('Waiting for approval')).toBeTruthy();
  fireEvent.click(screen.getByRole('button', { name: 'Withdraw your seat request' }));
  expect(command).toHaveBeenLastCalledWith({ kind: 'seat-withdraw' });
});

test("a spectator sees only their own request, never anyone else's", () => {
  show(
    <DraftingOverlay
      client={client}
      table={projection('neutral', withRequests([{ id: 'other', requesterName: 'Klyzx', seat: null }]))}
    />
  );
  expect(screen.queryByText('Klyzx')).toBeNull();
  expect(screen.getByRole('button', { name: 'Take a seat' })).toBeTruthy();
});

test('a player approves each request where the requester waits in the roster', () => {
  const command = vi.fn();
  show(
    <DraftingOverlay
      client={{ command } as unknown as TableSession}
      table={projection(
        'seat-1',
        withRequests([
          { id: 'first', requesterName: 'First', seat: null },
          { id: 'second', requesterName: 'Second', seat: null },
        ])
      )}
    />
  );
  const second = screen.getByText('Second').closest('li')!;
  fireEvent.click(within(second).getByRole('button', { name: 'Approve' }));
  expect(command).toHaveBeenCalledExactlyOnceWith({ kind: 'seat-approve', requestId: 'second' });
});

test('after a failed deal a ready player deals again instead of withdrawing', () => {
  const command = vi.fn();
  const snapshot = draftingSnapshot(PLAYERS, 2, { failure: 'Set aside as not ready to deal: Iduali (no token).' });
  const ready = { ...snapshot, draft: { ...snapshot.draft!, ready: ['seat-1'] } } as typeof snapshot;
  show(<DraftingReady client={{ command } as unknown as TableSession} table={projection('seat-1', ready)} />);
  fireEvent.click(screen.getByRole('button', { name: 'Deal again' }));
  expect(command).toHaveBeenCalledExactlyOnceWith({ kind: 'draft-ready', ready: true });
});
