// @vitest-environment jsdom

import { MantineProvider } from '@mantine/core';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { appContentTheme } from '@ui/theme';
import { afterEach, describe, expect, test, vi } from 'vitest';

import { SectionedSurface } from './SectionedSurface';

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

function renderRow(onActivate: () => void, onNestedClick: () => void) {
  render(
    <MantineProvider theme={appContentTheme} forceColorScheme="light">
      <SectionedSurface>
        <SectionedSurface.Row ariaLabel="Open the entry" onActivate={onActivate}>
          <span>entry</span>
          <button type="button" onClick={onNestedClick}>
            Nested
          </button>
        </SectionedSurface.Row>
      </SectionedSurface>
    </MantineProvider>
  );
}

describe('Sectioned surface row', () => {
  test('activates when the row itself is clicked', () => {
    const onActivate = vi.fn();
    renderRow(onActivate, vi.fn());

    fireEvent.click(screen.getByText('entry'));

    expect(onActivate).toHaveBeenCalledTimes(1);
  });

  test('lets a nested control keep its own click', () => {
    const onActivate = vi.fn();
    const onNestedClick = vi.fn();
    renderRow(onActivate, onNestedClick);

    fireEvent.click(screen.getByRole('button', { name: 'Nested' }));

    expect(onNestedClick).toHaveBeenCalledTimes(1);
    expect(onActivate).not.toHaveBeenCalled();
  });

  test('activates on Enter, but only from the row itself', () => {
    const onActivate = vi.fn();
    renderRow(onActivate, vi.fn());

    fireEvent.keyDown(screen.getByRole('button', { name: 'Nested' }), { key: 'Enter' });
    expect(onActivate).not.toHaveBeenCalled();

    fireEvent.keyDown(screen.getByRole('link', { name: 'Open the entry' }), { key: 'Enter' });
    expect(onActivate).toHaveBeenCalledTimes(1);
  });

  test('leaves Space to the page, since the row is a link and not a button', () => {
    const onActivate = vi.fn();
    renderRow(onActivate, vi.fn());

    fireEvent.keyDown(screen.getByRole('link', { name: 'Open the entry' }), { key: ' ' });
    expect(onActivate).not.toHaveBeenCalled();
  });
});
