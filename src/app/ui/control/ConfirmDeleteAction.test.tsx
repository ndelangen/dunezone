// @vitest-environment jsdom

import { MantineProvider } from '@mantine/core';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { appContentTheme } from '@ui/theme';
import { afterEach, describe, expect, test, vi } from 'vitest';

import { ConfirmDeleteAction } from './ConfirmDeleteAction';

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

function renderAction(onConfirm: () => void, pending = false) {
  return render(
    <MantineProvider theme={appContentTheme} forceColorScheme="light">
      <ConfirmDeleteAction label="Delete card" prompt="Delete card?" pending={pending} onConfirm={onConfirm} />
    </MantineProvider>
  );
}

describe('ConfirmDeleteAction', () => {
  test('a double click fires the destructive callback once', () => {
    const onConfirm = vi.fn();
    renderAction(onConfirm);

    fireEvent.click(screen.getByRole('button', { name: 'Delete card' }));
    const confirm = screen.getByRole('button', { name: 'Delete' });
    /* The caller's pending arrives a render later; both clicks land in that gap. */
    fireEvent.click(confirm);
    fireEvent.click(confirm);

    expect(onConfirm).toHaveBeenCalledTimes(1);
  });
});
