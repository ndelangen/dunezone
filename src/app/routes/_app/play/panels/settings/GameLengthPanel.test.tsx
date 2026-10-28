/** @vitest-environment jsdom */

import { MantineProvider } from '@mantine/core';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { appContentTheme } from '@ui/theme';
import { afterEach, expect, test, vi } from 'vite-plus/test';

import { stubMatchMedia } from '../../multiplayer/jsdom.test.fixture';
import { GameLengthPanel } from './GameLengthPanel';

stubMatchMedia();
afterEach(cleanup);

function renderSettings(onLastTurn: (turn: number) => void, lastTurn: number, observing = false) {
  return (
    <MantineProvider theme={appContentTheme}>
      <GameLengthPanel lastTurn={lastTurn} disabled={false} observing={observing} onLastTurn={onLastTurn} />
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
  const onLastTurn = vi.fn();
  const { rerender } = render(renderSettings(onLastTurn, 10));
  const field = screen.getByRole('textbox', { name: 'Last turn' });
  await focus(field);
  rerender(renderSettings(onLastTurn, 7));
  fireEvent.focusOut(field);
  expect(onLastTurn).not.toHaveBeenCalled();
  expect(field).toHaveProperty('value', '7');
});

test('an observer reads the last turn without a field to change it', () => {
  render(renderSettings(vi.fn(), 8, true));
  expect(screen.queryByRole('textbox', { name: 'Last turn' })).toBeNull();
  expect(screen.getByText('Last turn: 8')).toBeTruthy();
});
