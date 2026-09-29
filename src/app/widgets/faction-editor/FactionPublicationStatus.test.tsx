// @vitest-environment jsdom

import { MantineProvider } from '@mantine/core';
import { cleanup, render, screen } from '@testing-library/react';
import { appContentTheme } from '@ui/theme';
import { afterEach, describe, expect, test, vi } from 'vitest';

import { FactionPublicationStatus } from './FactionPublicationStatus';

/* Mantine reads the colour scheme through matchMedia, which jsdom lacks. */
vi.stubGlobal('matchMedia', (media: string) => ({
  matches: false,
  media,
  addEventListener: () => undefined,
  removeEventListener: () => undefined,
}));

afterEach(cleanup);

describe('FactionPublicationStatus', () => {
  test('tells the editor a failed replacement left the previous sheet published', () => {
    render(
      <MantineProvider theme={appContentTheme} forceColorScheme="light">
        <FactionPublicationStatus
          publication={{
            status: 'current',
            captureStatus: 'error',
            publicationHref: '/published/sheet.pdf',
            lastPublishedAt: null,
          }}
        />
      </MantineProvider>
    );

    expect(
      screen.getByRole('img', {
        name: 'The previous faction sheet is still published, but the latest changes were not captured.',
      })
    ).toBeTruthy();
  });
});
