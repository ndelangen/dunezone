/** @vitest-environment jsdom */

import { MantineProvider } from '@mantine/core';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { appContentTheme } from '@ui/theme';
import { afterEach, expect, test, vi } from 'vite-plus/test';

import { YouTube } from './postContent';

window.matchMedia = vi.fn().mockImplementation((query: string) => ({
  matches: false,
  media: query,
  addEventListener: vi.fn(),
  removeEventListener: vi.fn(),
}));

afterEach(cleanup);

/* The play button is gone once pressed, so without this a keyboard reader would be sent back to the top of the page. */
test('pressing play hands the focus to the player', () => {
  render(
    <MantineProvider theme={appContentTheme} forceColorScheme="light">
      <YouTube id="abc" title="A video" posterKey="/web/blog/why-dune/mcdm-plays-dune.jpg" />
    </MantineProvider>
  );
  fireEvent.click(screen.getByRole('button', { name: 'Play A video' }));
  expect(document.activeElement).toBe(screen.getByTitle('A video'));
});
