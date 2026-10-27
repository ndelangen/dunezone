// @vitest-environment jsdom

import { MantineProvider, mergeThemeOverrides } from '@mantine/core';
import { emptySnapshot } from '@shared/play/commands';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { appContentTheme } from '@ui/theme';
import { afterEach, beforeEach, expect, test, vi } from 'vite-plus/test';

import { FactionTokenGroup } from './FactionTokenFace';

const theme = mergeThemeOverrides(appContentTheme, {
  components: {
    Tooltip: {
      defaultProps: {
        hideDetached: false,
        openDelay: 0,
        closeDelay: 0,
        transitionProps: { duration: 0 },
      },
    },
  },
});

beforeEach(() => {
  vi.useFakeTimers();
  vi.stubGlobal(
    'matchMedia',
    vi.fn((media: string) => ({
      media,
      matches: false,
      addEventListener() {},
      removeEventListener() {},
    }))
  );
  vi.stubGlobal(
    'ResizeObserver',
    class {
      observe() {}
      unobserve() {}
      disconnect() {}
    }
  );
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

test('each allied token names its own faction on hover and releases the hint on leave', async () => {
  const table = { snapshot: emptySnapshot() } as Parameters<typeof FactionTokenGroup>[0]['table'];
  render(
    <MantineProvider theme={theme} forceColorScheme="dark">
      <FactionTokenGroup
        table={table}
        factionIds={['fremen', 'guild']}
        names={{ fremen: 'Fremen', guild: 'Spacing Guild' }}
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
