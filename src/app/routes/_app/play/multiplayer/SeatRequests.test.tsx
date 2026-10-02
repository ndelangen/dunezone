/** @vitest-environment jsdom */

import { MantineProvider } from '@mantine/core';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { appContentTheme } from '@ui/theme';
import { afterEach, expect, test, vi } from 'vitest';

import { SeatPopover, SeatRequests } from './SeatRequests';
import type { TableSession } from './TableSession';

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

/* jsdom has no layout; the Seats popover positions itself with a ResizeObserver. */
globalThis.ResizeObserver = class ResizeObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
};

afterEach(cleanup);

function renderPlayback(stage: 'drafting' | 'play', step: number) {
  const client = { requestHistory: vi.fn(), resumeLive: vi.fn() };
  const table = {
    snapshot: { stage },
    playback: { step, lastStep: 3 },
    historyPending: false,
  } as unknown as Parameters<typeof SeatRequests>[0]['table'];
  render(
    <MantineProvider theme={appContentTheme}>
      <SeatRequests
        client={client as unknown as TableSession}
        table={table}
        error="The table refused that."
        leaving={false}
        onStay={() => {}}
      />
    </MantineProvider>
  );
  return client;
}

test('playback of a stage before play steps through checkpoints, returns to live and shows a rejection', () => {
  const client = renderPlayback('drafting', 0);
  expect(screen.getByText('Playback checkpoint 0 of 3')).toBeTruthy();
  expect(screen.getByText('The table refused that.')).toBeTruthy();
  expect(screen.getByRole('button', { name: 'Earlier phase' }).hasAttribute('disabled')).toBe(true);
  fireEvent.click(screen.getByRole('button', { name: 'Later phase' }));
  expect(client.requestHistory).toHaveBeenCalledWith(1);
  fireEvent.click(screen.getByRole('button', { name: 'Return to live' }));
  expect(client.resumeLive).toHaveBeenCalled();
});

test('a player approves the request for an open seat when an earlier request names a seat taken since', () => {
  const client = { command: vi.fn() };
  const table = {
    viewer: { viewerSeat: 'seat-1' },
    snapshot: {
      stage: 'play',
      roster: {
        seatCount: 3,
        seats: ['seat-1', 'seat-2', 'seat-3'].map((id, position) => ({ id, position, faction: null })),
      },
      controls: {
        seats: ['seat-1', 'seat-2'],
        seatRequests: [
          { id: 'request-taken', requesterName: 'Late', seat: 'seat-2' },
          { id: 'request-open', requesterName: 'Next', seat: 'seat-3' },
        ],
      },
    },
    playback: null,
    seatCommandPending: false,
  } as unknown as Parameters<typeof SeatRequests>[0]['table'];
  render(
    <MantineProvider theme={appContentTheme}>
      <SeatRequests
        client={client as unknown as TableSession}
        table={table}
        error={null}
        leaving={false}
        onStay={() => {}}
      />
    </MantineProvider>
  );
  expect(screen.getByText('Next asks for seat 3')).toBeTruthy();
  const approve = screen.getByRole('button', { name: 'Approve' });
  expect(approve.hasAttribute('disabled')).toBe(false);
  fireEvent.click(approve);
  expect(client.command).toHaveBeenCalledWith({ kind: 'seat-approve', requestId: 'request-open' });
});

test('a press that began on one request never approves the request swapped in under it', () => {
  const client = { command: vi.fn() };
  const tableWith = (seatRequests: { id: string; requesterName: string; seat: null }[]) =>
    ({
      viewer: { viewerSeat: 'seat-1' },
      snapshot: { stage: 'drafting', roster: null, controls: { seats: ['seat-1'], seatRequests } },
      playback: null,
      seatCommandPending: false,
    }) as unknown as Parameters<typeof SeatRequests>[0]['table'];
  const bar = (table: Parameters<typeof SeatRequests>[0]['table']) => (
    <MantineProvider theme={appContentTheme}>
      <SeatRequests
        client={client as unknown as TableSession}
        table={table}
        error={null}
        leaving={false}
        onStay={() => {}}
      />
    </MantineProvider>
  );
  const first = { id: 'seat-request-1', requesterName: 'First', seat: null };
  const second = { id: 'seat-request-2', requesterName: 'Second', seat: null };
  const { rerender } = render(bar(tableWith([first, second])));
  expect(screen.getByText('First asks for a seat')).toBeTruthy();
  const pressed = screen.getByRole('button', { name: 'Approve' });
  fireEvent.pointerDown(pressed);

  /* Another tab approves the first request before this press ends, so the bar now offers the second. */
  rerender(bar(tableWith([second])));
  expect(screen.getByText('Second asks for a seat')).toBeTruthy();
  fireEvent.pointerUp(pressed);
  fireEvent.click(pressed);
  expect(client.command).not.toHaveBeenCalled();

  /* A fresh press on the request now on screen approves that one. */
  fireEvent.click(screen.getByRole('button', { name: 'Approve' }));
  expect(client.command).toHaveBeenCalledExactlyOnceWith({ kind: 'seat-approve', requestId: 'seat-request-2' });
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
  const pressed = await screen.findByRole('button', { name: 'Request a seat' });
  fireEvent.pointerDown(pressed);

  /* Someone takes seat 2, the one this press would ask for, before the press ends; seat 4 is all that is left. */
  rerender(popover(tableWith(['seat-1', 'seat-2', 'seat-3'])));
  fireEvent.pointerUp(pressed);
  fireEvent.click(pressed);
  expect(client.command).not.toHaveBeenCalled();

  /* A fresh press asks for the seat now named on the button. jsdom never finishes the popover's transition, hence hidden. */
  fireEvent.click(screen.getByRole('button', { name: /^Request seat 4$/i, hidden: true }));
  expect(client.command).toHaveBeenCalledExactlyOnceWith({ kind: 'seat-request', seat: 'seat-4' });
});

test('playback in play leaves the controls to the Phase tab', () => {
  renderPlayback('play', 2);
  expect(screen.queryByText(/Playback checkpoint/)).toBeNull();
});
