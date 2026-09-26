/** @vitest-environment jsdom */

import { MantineProvider } from '@mantine/core';
import { initialSnapshot } from '@shared/play/commands';
import { act, cleanup, render, screen } from '@testing-library/react';
import { appContentTheme } from '@ui/theme';
import { afterEach, expect, test, vi } from 'vitest';

import { runtime, Socket } from './gameRuntime.test.fixture';
import { SwappingReadiness } from './Swapping';
import { TableSession } from './TableSession';
import { ServerClockContext } from './useServerNow';

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

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

/* The Worker sets the deadline a few milliseconds before it stamps the frame, and neither falls on a whole second. */
test('the countdown starts at 4:00 and trading ends at the first tick past the Worker deadline', async () => {
  vi.useFakeTimers();
  Socket.instances = [];
  const serverNow = 1_800_000_000_700;
  const client = new TableSession(
    'fixture-one',
    async () => ({ ok: true, ticket: 'a'.repeat(64), expiresInMs: 30_000 }),
    runtime
  );
  const disconnect = client.connect();
  await vi.advanceTimersByTimeAsync(0);
  const socket = Socket.instances[0];
  socket.open();
  socket.deliver(
    {
      type: 'view',
      viewer: {
        connectionId: 'connection-one',
        userId: 'user-one',
        viewerSeat: 'harkonnen',
        displayName: 'One',
        color: '#ed927c',
      },
      epoch: 'epoch-one',
      snapshot: {
        ...initialSnapshot(),
        stage: 'swapping',
        swapping: {
          round: 'round-one',
          deadline: serverNow + 239_995,
          closed: false,
          ready: [],
          offers: [],
          nextOrder: 1,
          tokens: {},
        },
      },
      carries: [],
      pointers: [],
    },
    serverNow
  );
  const table = client.getSnapshot().table;
  if (!table) {
    throw new Error('The table is not authorized.');
  }
  render(
    <MantineProvider theme={appContentTheme} forceColorScheme="light">
      <ServerClockContext.Provider value={table.serverNow}>
        <SwappingReadiness client={client} table={table} />
      </ServerClockContext.Provider>
    </MantineProvider>
  );
  const countdown = () => screen.getByLabelText('Trading time remaining').textContent;
  const ready = () => screen.getByRole('button', { name: 'Ready to start' });

  expect(countdown()).toBe('4:00');
  await act(() => vi.advanceTimersByTimeAsync(239_000));
  expect(countdown()).toBe('0:01');
  expect(ready()).toHaveProperty('disabled', false);
  await act(() => vi.advanceTimersByTimeAsync(1000));
  expect(countdown()).toBe('Trading ended. Your assignments are fixed.');
  expect(ready()).toHaveProperty('disabled', true);
  disconnect();
});
