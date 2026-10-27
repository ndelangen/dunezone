/** @vitest-environment jsdom */

import { MantineProvider } from '@mantine/core';
import { SPECTATOR_SEAT } from '@shared/play/schema';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { appContentTheme } from '@ui/theme';
import { afterEach, expect, test, vi } from 'vite-plus/test';

import type { TableProjection, TableSession } from '../../../../db/tabletop/TableSession';
import { stubMatchMedia } from './jsdom.test.fixture';
import { LastTurnSettings } from './LastTurnSettings';

stubMatchMedia();
afterEach(cleanup);

function table(lastTurn: number, viewerSeat = 'seat-1') {
  return {
    viewer: { viewerSeat },
    canInteract: true,
    snapshot: { lastTurn, bank: { factionId: 'atreides', balance: 0 } },
  } as unknown as TableProjection;
}

function renderSettings(client: TableSession, lastTurn: number) {
  return (
    <MantineProvider theme={appContentTheme}>
      <LastTurnSettings client={client} table={table(lastTurn)} />
    </MantineProvider>
  );
}

/* The number field reports focus on the next task, after placing the caret. */
async function focus(field: HTMLElement) {
  await act(async () => {
    fireEvent.focusIn(field);
    await new Promise((resolve) => setTimeout(resolve, 10));
  });
}

test('leaving the field untouched never undoes another player change made meanwhile', async () => {
  const command = vi.fn();
  const client = { command } as unknown as TableSession;
  const { rerender } = render(renderSettings(client, 10));
  const field = screen.getByRole('textbox', { name: 'Last turn' });
  await focus(field);
  rerender(renderSettings(client, 7));
  fireEvent.focusOut(field);
  expect(command).not.toHaveBeenCalled();
  expect(field).toHaveProperty('value', '7');
});

test('an observer reads the last turn without a field to change it', () => {
  render(
    <MantineProvider theme={appContentTheme}>
      <LastTurnSettings client={{ command: vi.fn() } as unknown as TableSession} table={table(8, SPECTATOR_SEAT)} />
    </MantineProvider>
  );
  expect(screen.queryByRole('textbox', { name: 'Last turn' })).toBeNull();
  expect(screen.getByText('Last turn: 8')).toBeTruthy();
});
