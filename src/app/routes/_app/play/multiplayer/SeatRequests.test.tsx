/** @vitest-environment jsdom */

import { MantineProvider } from '@mantine/core';
import { SPECTATOR_SEAT } from '@shared/play/schema';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { appContentTheme } from '@ui/theme';
import { afterEach, expect, test, vi } from 'vitest';

import type { TableSession } from '../../../../db/tabletop/TableSession';
import { SeatPopover, StagePlayback, VacantSeatRequests } from './SeatRequests';

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

function vacantTable(seatRequests: { id: string; requesterName: string; seat: string }[]) {
  return {
    viewer: { viewerSeat: 'seat-1' },
    snapshot: {
      stage: 'play',
      roster: {
        seatCount: 3,
        seats: ['seat-1', 'seat-2', 'seat-3'].map((id, position) => ({ id, position, faction: null })),
      },
      controls: { seats: ['seat-1', 'seat-2'], seatRequests },
    },
    playback: null,
    seatCommandPending: false,
  } as unknown as Parameters<typeof VacantSeatRequests>[0]['table'];
}

test("a player approves a request from the vacant seat's Info; a seat taken since offers nothing", () => {
  const client = { command: vi.fn() };
  const table = vacantTable([
    { id: 'request-taken', requesterName: 'Late', seat: 'seat-2' },
    { id: 'request-open', requesterName: 'Next', seat: 'seat-3' },
  ]);
  const { rerender } = render(
    <MantineProvider theme={appContentTheme}>
      <VacantSeatRequests client={client as unknown as TableSession} table={table} seat="seat-2" />
    </MantineProvider>
  );
  expect(screen.queryByRole('button', { name: 'Approve' })).toBeNull();
  rerender(
    <MantineProvider theme={appContentTheme}>
      <VacantSeatRequests client={client as unknown as TableSession} table={table} seat="seat-3" />
    </MantineProvider>
  );
  expect(screen.getByText('Next', { exact: false }).textContent).toBe('Next');
  fireEvent.click(screen.getByRole('button', { name: 'Approve' }));
  expect(client.command).toHaveBeenCalledWith({ kind: 'seat-approve', requestId: 'request-open' });
});

test('a finished game offers no approval until it continues', () => {
  const table = vacantTable([{ id: 'request-open', requesterName: 'Next', seat: 'seat-3' }]);
  const finished = { ...table, snapshot: { ...table.snapshot, stage: 'finished' } } as typeof table;
  render(
    <MantineProvider theme={appContentTheme}>
      <VacantSeatRequests client={{ command: vi.fn() } as unknown as TableSession} table={finished} seat="seat-3" />
    </MantineProvider>
  );
  expect(screen.queryByRole('button', { name: 'Approve' })).toBeNull();
});

test('a press that began on one request never approves the request swapped in under it', () => {
  const client = { command: vi.fn() };
  const info = (table: ReturnType<typeof vacantTable>) => (
    <MantineProvider theme={appContentTheme}>
      <VacantSeatRequests client={client as unknown as TableSession} table={table} seat="seat-3" />
    </MantineProvider>
  );
  const first = { id: 'seat-request-1', requesterName: 'First', seat: 'seat-3' };
  const second = { id: 'seat-request-2', requesterName: 'Second', seat: 'seat-3' };
  const { rerender } = render(info(vacantTable([first])));
  /* Another tab approves the first request before this press ends, and a second request takes its place. */
  pressAcross(screen.getByRole('button', { name: 'Approve' }), () => rerender(info(vacantTable([second]))));
  expect(client.command).not.toHaveBeenCalled();
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
