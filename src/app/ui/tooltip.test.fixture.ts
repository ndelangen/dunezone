import { mergeThemeOverrides } from '@mantine/core';
import { vi } from 'vite-plus/test';

import { appContentTheme } from './theme';

/** Tooltip interactions run under the app theme with time controlled by the test. */
export const tooltipTestTheme = mergeThemeOverrides(appContentTheme, {
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

/** jsdom provides neither media-query observation nor element resize observation. */
export function stubTooltipDom() {
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
}
