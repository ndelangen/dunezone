// @vitest-environment jsdom

import { MantineProvider } from '@mantine/core';
import { cleanup, render, screen } from '@testing-library/react';
import { appContentTheme } from '@ui/theme';
import { afterEach, describe, expect, test, vi } from 'vitest';

import { FactionPublicationStatus } from './FactionPublicationStatus';
import markStyles from '@ui/content/StatusMark.module.css';

/* Mantine reads the colour scheme through matchMedia, which jsdom lacks. */
vi.stubGlobal('matchMedia', (media: string) => ({
  matches: false,
  media,
  addEventListener: () => undefined,
  removeEventListener: () => undefined,
}));

afterEach(cleanup);

describe('FactionPublicationStatus', () => {
  test('tells the editor a failed replacement may have left the published sheet out of date', () => {
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

    const mark = screen.getByRole('img', {
      name: 'The published faction sheet may be out of date because the latest changes were not captured.',
    });
    /* The glyph reads as failed too, not only the words. */
    expect(mark.classList.contains(markStyles.negative)).toBe(true);
  });
});
