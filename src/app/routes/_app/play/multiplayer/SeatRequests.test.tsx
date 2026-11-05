/** @vitest-environment jsdom */

import { MantineProvider } from '@mantine/core';
import { SPECTATOR_SEAT } from '@shared/play/schema';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { appContentTheme } from '@ui/theme';
import { afterEach, expect, test, vi } from 'vite-plus/test';

import type { TableSession } from '../../../../db/tabletop/TableSession';
import { SeatPopover, StagePlayback } from './SeatRequests';

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

/* jsdom has no layout; the Seats popover positions itself with a ResizeObserver. */
vi.stubGlobal(
  'ResizeObserver',
  class {
    observe = vi.fn();
    unobserve = vi.fn();
    disconnect = vi.fn();
  }
);

/** A press that begins on a button, sees the bar change under it, then ends on that same button. */
function pressAcross(pressed: HTMLElement, change: () => void) {
  fireEvent.pointerDown(pressed);
  change();
  fireEvent.pointerUp(pressed);
  fireEvent.click(pressed);
}

function renderPlayback(stage: 'drafting' | 'play' | 'finished', step: number, error: string | null = null) {
  const client = { requestHistory: vi.fn(), resumeLive: vi.fn() };
  const table = {
    snapshot: { stage },
    playback: { step, lastStep: 3 },
    historyPending: false,
  } as unknown as Parameters<typeof StagePlayback>[0]['table'];
  render(
    <MantineProvider theme={appContentTheme}>
      <StagePlayback client={client as unknown as TableSession} table={table} error={error} />
    </MantineProvider>
  );
  return client;
}

test('playback of a stage before play steps through checkpoints from the header and returns to live', () => {
  const client = renderPlayback('drafting', 0);
  expect(screen.getByText('Playback checkpoint 0 of 3')).toBeTruthy();
  expect(screen.getByRole('button', { name: 'Earlier phase' }).hasAttribute('disabled')).toBe(true);
  fireEvent.click(screen.getByRole('button', { name: 'Later phase' }));
  expect(client.requestHistory).toHaveBeenCalledWith(1);
  fireEvent.click(screen.getByRole('button', { name: 'Return to live' }));
  expect(client.resumeLive).toHaveBeenCalled();
});

test('playback of a finished game keeps stepping and returning to live in the header', () => {
  const client = renderPlayback('finished', 3);
  expect(screen.getByText('Playback checkpoint 3 of 3')).toBeTruthy();
  expect(screen.getByRole('button', { name: 'Later phase' }).hasAttribute('disabled')).toBe(true);
  fireEvent.click(screen.getByRole('button', { name: 'Earlier phase' }));
  expect(client.requestHistory).toHaveBeenCalledWith(2);
  fireEvent.click(screen.getByRole('button', { name: 'Return to live' }));
  expect(client.resumeLive).toHaveBeenCalled();
});

test('a spectator press that began on one open seat never requests the seat left once it is taken', async () => {
  const client = { command: vi.fn() };
  const tableWith = (seats: string[]) =>
    ({
      viewer: { viewerSeat: 'neutral' },
      snapshot: {
        stage: 'play',
        roster: { seatCount: 4, seats: ['seat-1', 'seat-2', 'seat-3', 'seat-4'].map((id) => ({ id })) },
        controls: { seats, seatRequests: [] },
      },
      playback: null,
      seatCommandPending: false,
    }) as unknown as Parameters<typeof SeatPopover>[0]['table'];
  const popover = (table: Parameters<typeof SeatPopover>[0]['table']) => (
    <MantineProvider theme={appContentTheme}>
      <SeatPopover client={client as unknown as TableSession} table={table} error={null} />
    </MantineProvider>
  );
  const { rerender } = render(popover(tableWith(['seat-1', 'seat-3'])));
  fireEvent.click(screen.getByRole('button', { name: 'Seats' }));
  /* Someone takes seat 2, the one this press would ask for, before the press ends; seat 4 is all that is left. */
  pressAcross(await screen.findByRole('button', { name: 'Request a seat' }), () =>
    rerender(popover(tableWith(['seat-1', 'seat-2', 'seat-3'])))
  );
  expect(client.command).not.toHaveBeenCalled();

  /* A fresh press asks for the seat now named on the button. jsdom never finishes the popover's transition, hence hidden. */
  fireEvent.click(screen.getByRole('button', { name: /^Request seat 4$/i, hidden: true }));
  expect(client.command).toHaveBeenCalledExactlyOnceWith({ kind: 'seat-request', seat: 'seat-4' });
});

test('a refused playback step says why beside the header controls', () => {
  renderPlayback('play', 2, 'The table refused that.');
  expect(screen.getByText('The table refused that.')).toBeTruthy();
});

test('playback in play keeps returning to live in the header, outside the tabs', () => {
  const client = renderPlayback('play', 2);
  expect(screen.getByText('Playback checkpoint 2 of 3')).toBeTruthy();
  fireEvent.click(screen.getByRole('button', { name: 'Return to live' }));
  expect(client.resumeLive).toHaveBeenCalled();
});

test('a spectator whose requested seat was taken since is told so and can still withdraw', () => {
  const client = { command: vi.fn() };
  const table = {
    viewer: { viewerSeat: SPECTATOR_SEAT },
    snapshot: {
      stage: 'play',
      roster: {
        seatCount: 3,
        seats: ['seat-1', 'seat-2', 'seat-3'].map((id, position) => ({
          id,
          position,
          faction: id === 'seat-2' ? { name: 'Atreides' } : null,
        })),
      },
      controls: {
        seats: ['seat-1', 'seat-2'],
        seatRequests: [{ id: 'request-own', requesterName: 'Me', seat: 'seat-2', own: true }],
      },
    },
    playback: null,
    seatCommandPending: false,
  } as unknown as Parameters<typeof SeatPopover>[0]['table'];
  render(
    <MantineProvider theme={appContentTheme} env="test">
      <SeatPopover client={client as unknown as TableSession} table={table} error={null} />
    </MantineProvider>
  );
  fireEvent.click(screen.getByRole('button', { name: 'Seats' }));
  expect(screen.getByText('Seat requested')).toBeTruthy();
  expect(screen.getByText('Seat 2 (Atreides) is taken now')).toBeTruthy();
  expect(
    screen.getByText('A player can approve you if it opens again. Withdraw to ask for another seat.')
  ).toBeTruthy();
  expect(screen.queryByText('Waiting for a player to approve you')).toBeNull();
  fireEvent.click(screen.getByRole('button', { name: 'Withdraw' }));
  expect(client.command).toHaveBeenCalledWith({ kind: 'seat-withdraw' });
});
