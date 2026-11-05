/** @vitest-environment jsdom */

import { MantineProvider } from '@mantine/core';
import { cleanup, render, screen } from '@testing-library/react';
import { appContentTheme } from '@ui/theme';
import { afterEach, expect, it, vi } from 'vite-plus/test';

import { FormattedTextSource, InlineFormattedTextSource } from './FormattedText';

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

function renderSource(source: string) {
  return render(
    <MantineProvider theme={appContentTheme} forceColorScheme="light">
      <div data-testid="formatted-text-host">
        <FormattedTextSource source={source} />
      </div>
    </MantineProvider>
  );
}

it('renders paragraph line breaks and fully nested marks as semantic HTML', () => {
  const view = renderSource('Opening\n_-*emphasis*-_');

  expect(view.container.querySelector('p > br')).not.toBeNull();
  expect(view.container.querySelector('p > span > em > strong')?.textContent).toBe('emphasis');
});

it('renders parsed list items as one semantic list', () => {
  renderSource('- Gather the spice\n- Pay the Guild');

  expect(screen.getByRole('list')).toBeTruthy();
  expect(screen.getAllByRole('listitem').map((item) => item.textContent)).toEqual([
    'Gather the spice',
    'Pay the Guild',
  ]);
});

it('renders no placeholder for empty source', () => {
  renderSource('');

  expect(screen.getByTestId('formatted-text-host').childElementCount).toBe(0);
});

it('parses stored prose and marks through the Content reader', () => {
  render(
    <MantineProvider theme={appContentTheme} forceColorScheme="light">
      <FormattedTextSource source={'Opening *bold*.\n\n- First\n- Second'} />
      <h2>
        <InlineFormattedTextSource source="A _marked_ question" />
      </h2>
    </MantineProvider>
  );

  expect(screen.getByText('bold').tagName).toBe('STRONG');
  expect(screen.getByText('marked').tagName).toBe('SPAN');
  expect(screen.getAllByRole('listitem')).toHaveLength(2);
});

it('shows legacy invalid source as plain text instead of dropping it', () => {
  render(
    <MantineProvider theme={appContentTheme} forceColorScheme="light">
      <FormattedTextSource source="*unfinished" />
    </MantineProvider>
  );

  expect(screen.getByText('*unfinished')).toBeTruthy();
});
