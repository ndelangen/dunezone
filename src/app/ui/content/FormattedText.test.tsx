/** @vitest-environment jsdom */

import { MantineProvider } from '@mantine/core';
import { cleanup, render, screen } from '@testing-library/react';
import { appContentTheme } from '@ui/theme';
import { afterEach, expect, it, vi } from 'vitest';

import { FormattedText } from './FormattedText';
import type { FormattedTextBlocks } from './FormattedText';

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

function renderFormattedText(blocks: FormattedTextBlocks) {
  return render(
    <MantineProvider theme={appContentTheme} forceColorScheme="light">
      <div data-testid="formatted-text-host">
        <FormattedText blocks={blocks} />
      </div>
    </MantineProvider>
  );
}

it('renders paragraph line breaks and fully nested marks as semantic HTML', () => {
  const blocks: FormattedTextBlocks = [
    {
      kind: 'paragraph',
      children: [
        { kind: 'text', value: 'Opening' },
        { kind: 'line-break' },
        {
          kind: 'mark',
          mark: 'underline',
          children: [
            {
              kind: 'mark',
              mark: 'italic',
              children: [{ kind: 'mark', mark: 'bold', children: [{ kind: 'text', value: 'emphasis' }] }],
            },
          ],
        },
      ],
    },
  ];

  const view = renderFormattedText(blocks);

  expect(view.container.querySelector('p > br')).not.toBeNull();
  expect(view.container.querySelector('p > span > em > strong')?.textContent).toBe('emphasis');
});

it('renders parsed list items as one semantic list', () => {
  const blocks: FormattedTextBlocks = [
    {
      kind: 'list',
      items: [
        { children: [{ kind: 'text', value: 'Gather the spice' }] },
        { children: [{ kind: 'text', value: 'Pay the Guild' }] },
      ],
    },
  ];

  renderFormattedText(blocks);

  expect(screen.getByRole('list')).toBeTruthy();
  expect(screen.getAllByRole('listitem').map((item) => item.textContent)).toEqual([
    'Gather the spice',
    'Pay the Guild',
  ]);
});

it('renders no placeholder for empty parsed blocks', () => {
  renderFormattedText([]);

  expect(screen.getByTestId('formatted-text-host').childElementCount).toBe(0);
});
