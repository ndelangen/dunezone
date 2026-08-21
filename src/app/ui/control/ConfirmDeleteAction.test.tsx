// @vitest-environment jsdom

import { MantineProvider } from '@mantine/core';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
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
      <ConfirmDeleteAction label="Delete card" pending={pending} onConfirm={onConfirm} />
    </MantineProvider>
  );
}

describe('ConfirmDeleteAction', () => {
  test('a five second hold fires the deletion exactly once', () => {
    vi.useFakeTimers();
    const onConfirm = vi.fn();
    renderAction(onConfirm);

    const trigger = screen.getByRole('button', { name: 'Delete card' });
    fireEvent.pointerDown(trigger);
    act(() => vi.advanceTimersByTime(4000));
    expect(onConfirm).not.toHaveBeenCalled();
    act(() => vi.advanceTimersByTime(1000));
    expect(onConfirm).toHaveBeenCalledTimes(1);
    /* The countdown ended; nothing further may fire however long the press lingers. */
    act(() => vi.advanceTimersByTime(5000));
    expect(onConfirm).toHaveBeenCalledTimes(1);
    vi.useRealTimers();
  });

  test('releasing early cancels with nothing fired', () => {
    vi.useFakeTimers();
    const onConfirm = vi.fn();
    renderAction(onConfirm);

    const trigger = screen.getByRole('button', { name: 'Delete card' });
    fireEvent.pointerDown(trigger);
    act(() => vi.advanceTimersByTime(3000));
    fireEvent.pointerUp(trigger);
    act(() => vi.advanceTimersByTime(10_000));
    expect(onConfirm).not.toHaveBeenCalled();
    vi.useRealTimers();
  });

  test('the keyboard holds too, and a repeated keydown does not restart the countdown', () => {
    vi.useFakeTimers();
    const onConfirm = vi.fn();
    renderAction(onConfirm);

    const trigger = screen.getByRole('button', { name: 'Delete card' });
    fireEvent.keyDown(trigger, { key: 'Enter' });
    act(() => vi.advanceTimersByTime(3000));
    /* Held keys repeat; a repeat mid-hold must not reset the clock. */
    fireEvent.keyDown(trigger, { key: 'Enter', repeat: true });
    act(() => vi.advanceTimersByTime(2000));
    expect(onConfirm).toHaveBeenCalledTimes(1);
    vi.useRealTimers();
  });

  test('a completed hold latches: no second hold can fire while the caller is pending', () => {
    vi.useFakeTimers();
    const onConfirm = vi.fn();
    renderAction(onConfirm);

    const trigger = screen.getByRole('button', { name: 'Delete card' });
    fireEvent.pointerDown(trigger);
    act(() => vi.advanceTimersByTime(5000));
    expect(onConfirm).toHaveBeenCalledTimes(1);
    fireEvent.pointerUp(trigger);
    fireEvent.pointerDown(trigger);
    act(() => vi.advanceTimersByTime(5000));
    expect(onConfirm).toHaveBeenCalledTimes(1);
    vi.useRealTimers();
  });
});
