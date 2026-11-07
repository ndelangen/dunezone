/** @vitest-environment jsdom */

import { MantineProvider } from '@mantine/core';
import { SPECTATOR_SEAT } from '@shared/play/schema';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { appContentTheme } from '@ui/theme';
import { afterEach, expect, test, vi } from 'vite-plus/test';

import type { TableProjection, TableSession } from '../../../../../db/tabletop/TableSession';
import { ConnectedSeatsPanel, seatRequestsWaiting } from './useSeatsPanel';

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

type Request = { id: string; requesterName: string; seat: string | null; own?: boolean };

/* A three-seat game in play with seat 3 open, seen from seat 1 unless a story names another viewer. */
function tableWith(seatRequests: Request[], overrides: { stage?: string; viewerSeat?: string } = {}) {
  return {
    viewer: { viewerSeat: overrides.viewerSeat ?? 'seat-1' },
    snapshot: {
      stage: overrides.stage ?? 'play',
      roster: {
        seatCount: 3,
        seats: ['seat-1', 'seat-2', 'seat-3'].map((id, position) => ({ id, position, faction: null })),
      },
      controls: { seats: ['seat-1', 'seat-2'], seatRequests, spectators: [], guests: 0 },
    },
    playback: null,
    seatCommandPending: false,
  } as unknown as TableProjection;
}

function panel(client: { command: ReturnType<typeof vi.fn> }, table: TableProjection) {
  return (
    <MantineProvider theme={appContentTheme}>
      <ConnectedSeatsPanel client={client as unknown as TableSession} table={table} />
    </MantineProvider>
  );
}

/** A press that begins on a button, sees the panel change under it, then ends on that same button. */
function pressAcross(pressed: HTMLElement, change: () => void) {
  fireEvent.pointerDown(pressed);
  change();
  fireEvent.pointerUp(pressed);
  fireEvent.click(pressed);
}

test('a player approves a request for the open seat; a request for a seat taken since offers nothing', () => {
  const client = { command: vi.fn() };
  const table = tableWith([
    { id: 'request-taken', requesterName: 'Late', seat: 'seat-2' },
    { id: 'request-open', requesterName: 'Next', seat: 'seat-3' },
  ]);
  render(panel(client, table));
  expect(screen.getByText('Seat 2 is taken now.')).toBeTruthy();
  expect(screen.queryByRole('button', { name: 'Approve Late' })).toBeNull();
  fireEvent.click(screen.getByRole('button', { name: 'Approve Next' }));
  expect(client.command).toHaveBeenCalledWith({ kind: 'seat-approve', requestId: 'request-open' });
  expect(seatRequestsWaiting(table)).toBe(1);
});

test('a finished game offers no approval, and nothing waits on its players', () => {
  const table = tableWith([{ id: 'request-open', requesterName: 'Next', seat: 'seat-3' }], { stage: 'finished' });
  render(panel({ command: vi.fn() }, table));
  expect(screen.queryByRole('button', { name: /Approve/ })).toBeNull();
  expect(seatRequestsWaiting(table)).toBe(0);
});

test('an observer sees the requests and no action at all', () => {
  const table = tableWith([{ id: 'request-open', requesterName: 'Next', seat: 'seat-3' }], {
    viewerSeat: SPECTATOR_SEAT,
  });
  render(panel({ command: vi.fn() }, table));
  expect(screen.getByText('Next')).toBeTruthy();
  expect(screen.queryByRole('button')).toBeNull();
  expect(seatRequestsWaiting(table)).toBe(0);
});

test('a press that began on one request never approves the request swapped in under it', () => {
  const client = { command: vi.fn() };
  const first = { id: 'seat-request-1', requesterName: 'First', seat: 'seat-3' };
  const second = { id: 'seat-request-2', requesterName: 'Second', seat: 'seat-3' };
  const { rerender } = render(panel(client, tableWith([first])));
  /* Another tab approves the first request before this press ends, and a second request takes its place. */
  pressAcross(screen.getByRole('button', { name: 'Approve First' }), () =>
    rerender(panel(client, tableWith([second])))
  );
  expect(client.command).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole('button', { name: 'Approve Second' }));
  expect(client.command).toHaveBeenCalledExactlyOnceWith({ kind: 'seat-approve', requestId: 'seat-request-2' });
});
