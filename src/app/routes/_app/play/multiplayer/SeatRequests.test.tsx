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

test('playback in play leaves the controls to the Phase tab', () => {
  renderPlayback('play', 2);
  expect(screen.queryByText(/Playback checkpoint/)).toBeNull();
});
