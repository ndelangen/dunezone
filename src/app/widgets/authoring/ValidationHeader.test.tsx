// @vitest-environment jsdom

import { MantineProvider } from '@mantine/core';
import { cleanup, render, screen } from '@testing-library/react';
import { appContentTheme } from '@ui/theme';
import { afterEach, describe, expect, test, vi } from 'vitest';

import { ValidationHeader } from './ValidationHeader';

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

describe('the chip words both warning kinds', () => {
  test('a complaint rides beside missing fields under one source', () => {
    render(
      <MantineProvider theme={appContentTheme} forceColorScheme="light">
        <ValidationHeader
          warnings={[
            { source: 'Backside', missing: 'a label' },
            { source: 'Backside', complaint: 'its referenced token is gone' },
          ]}
          onFocusWarning={() => undefined}
        />
      </MantineProvider>
    );
    expect(
      screen.getByRole('button', { name: 'Backside: missing a label; its referenced token is gone' })
    ).toBeTruthy();
  });

  test('a lone complaint carries no missing wording', () => {
    render(
      <MantineProvider theme={appContentTheme} forceColorScheme="light">
        <ValidationHeader
          warnings={[{ source: 'Backside', complaint: 'its referenced token is gone' }]}
          onFocusWarning={() => undefined}
        />
      </MantineProvider>
    );
    expect(screen.getByRole('button', { name: 'Backside: its referenced token is gone' })).toBeTruthy();
  });
});
