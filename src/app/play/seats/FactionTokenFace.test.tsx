// @vitest-environment jsdom

import { MantineProvider } from '@mantine/core';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { stubTooltipDom, tooltipTestTheme } from '@ui/tooltip.test.fixture';
import { afterEach, beforeEach, expect, test, vi } from 'vite-plus/test';

import { FactionTokenGroup } from './FactionTokenFace';

beforeEach(() => {
  vi.useFakeTimers();
  stubTooltipDom();
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

test('each allied token names its own faction on hover and releases the hint on leave', async () => {
  render(
    <MantineProvider theme={tooltipTestTheme} forceColorScheme="dark">
      <FactionTokenGroup
        tokens={[
          { id: 'fremen', name: 'Fremen' },
          { id: 'guild', name: 'Spacing Guild' },
        ]}
        size={24}
      />
    </MantineProvider>
  );
  for (const name of ['Fremen', 'Spacing Guild']) {
    const token = screen.getByRole('img', { name });
    fireEvent.mouseEnter(token);
    await act(() => vi.runOnlyPendingTimersAsync());
    expect(screen.getByRole('tooltip').textContent).toBe(name);
    expect(token.hasAttribute('title')).toBe(false);
    fireEvent.mouseLeave(token);
    await act(() => vi.runOnlyPendingTimersAsync());
    expect(screen.queryByRole('tooltip')).toBeNull();
  }
});
