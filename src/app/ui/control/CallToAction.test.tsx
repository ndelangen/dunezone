// @vitest-environment jsdom

import { MantineProvider } from '@mantine/core';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { appContentTheme } from '@ui/theme';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vite-plus/test';

import { CallToAction } from './CallToAction';

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

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

function renderAction(props: { attention?: boolean; disabledReason?: string } = {}) {
  const view = render(
    <MantineProvider theme={appContentTheme} forceColorScheme="light">
      <CallToAction attention href="#start" {...props}>
        Start
      </CallToAction>
    </MantineProvider>
  );
  return { ...view, action: screen.getByText('Start').closest('a, button') as HTMLElement };
}

function advance(ms: number) {
  act(() => {
    vi.advanceTimersByTime(ms);
  });
}

describe('CallToAction attention pulse', () => {
  test('first pulses four seconds in, ends with its own animation, and repeats every five seconds', () => {
    const { action } = renderAction();
    advance(3999);
    expect(action.dataset.pulse).toBeUndefined();
    advance(1);
    expect(action.dataset.pulse).toBe('');

    fireEvent.animationEnd(action);
    expect(action.dataset.pulse).toBeUndefined();

    advance(4999);
    expect(action.dataset.pulse).toBeUndefined();
    advance(1);
    expect(action.dataset.pulse).toBe('');
  });

  test('an animation ending on a child leaves the pulse running', () => {
    const { action } = renderAction();
    advance(4000);
    const child = action.firstElementChild as HTMLElement;
    fireEvent.animationEnd(child);
    expect(action.dataset.pulse).toBe('');
  });

  test('unmounting stops the timers', () => {
    const { unmount } = renderAction();
    unmount();
    expect(vi.getTimerCount()).toBe(0);
  });

  test('never pulses without attention or while disabled', () => {
    const quiet = renderAction({ attention: false });
    advance(10_000);
    expect(quiet.action.dataset.pulse).toBeUndefined();
    quiet.unmount();

    const disabled = renderAction({ disabledReason: 'Not yet.' });
    advance(10_000);
    expect(disabled.action.dataset.pulse).toBeUndefined();
  });
});
