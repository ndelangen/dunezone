/** @vitest-environment jsdom */

import { MantineProvider } from '@mantine/core';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { appContentTheme } from '@ui/theme';
import { afterEach, expect, test, vi } from 'vitest';

import { SeatRequests } from './SeatRequests';
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

test('playback in play leaves the controls to the Phase tab', () => {
  renderPlayback('play', 2);
  expect(screen.queryByText(/Playback checkpoint/)).toBeNull();
});
