/** @vitest-environment jsdom */

import { MantineProvider } from '@mantine/core';
import { cleanup, fireEvent, render } from '@testing-library/react';
import { appContentTheme } from '@ui/theme';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vite-plus/test';

const mocks = vi.hoisted(() => ({ catalogue: vi.fn() }));

vi.mock('@app/db/assets', () => ({ useAssetsByTypes: mocks.catalogue }));
/* The rows' faces are drawn elsewhere; a name is all a keyboard test needs. */
vi.mock('./AssetPicker.parts', () => ({
  AssetPickerOptionRow: ({ entry }: { entry: { name: string } }) => <span>{entry.name}</span>,
  assetPickerSearchText: (entry: { name: string; slug: string }) => `${entry.name} ${entry.slug}`,
}));

import { AssetPicker } from './AssetPicker';

class ResizeObserverStub {
  observe() {}
  unobserve() {}
  disconnect() {}
}

const row = (id: string, name: string) => ({
  id,
  type: 'card-treachery',
  slug: name.toLowerCase().replaceAll(' ', '-'),
  name,
  data: {},
  previewHref: null,
});

const cards = [row('card-1', 'Lasgun'), row('card-2', 'Crysknife'), row('card-3', 'Maula Pistol')];

beforeEach(() => {
  mocks.catalogue.mockReturnValue({ data: cards, isPending: false });
  window.matchMedia = vi.fn().mockImplementation((query: string) => ({
    matches: false,
    media: query,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  })) as unknown as typeof window.matchMedia;
  vi.stubGlobal('ResizeObserver', ResizeObserverStub);
  Object.defineProperty(HTMLElement.prototype, 'scrollIntoView', { configurable: true, value: vi.fn() });
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('AssetPicker', () => {
  it('picks the first match of a search with Enter, not a row of the list before it', () => {
    const onPick = vi.fn();
    const view = render(
      <MantineProvider theme={appContentTheme}>
        <AssetPicker
          types={['card-treachery']}
          copy={{ searchLabel: 'Search cards', searchPlaceholder: 'Name', emptyMessage: 'No cards.' }}
          onPick={onPick}
        />
      </MantineProvider>
    );
    const search = view.getByRole('searchbox', { name: 'Search cards' });
    fireEvent.change(search, { target: { value: 'crys' } });
    fireEvent.keyDown(search, { key: 'Enter', code: 'Enter' });
    expect(onPick).toHaveBeenCalledTimes(1);
    expect(onPick.mock.calls[0]?.[0]).toMatchObject({ id: 'card-2', name: 'Crysknife' });
  });

  it('highlights nothing before the reader types', () => {
    const onPick = vi.fn();
    const view = render(
      <MantineProvider theme={appContentTheme}>
        <AssetPicker
          types={['card-treachery']}
          copy={{ searchLabel: 'Search cards', searchPlaceholder: 'Name', emptyMessage: 'No cards.' }}
          onPick={onPick}
        />
      </MantineProvider>
    );
    fireEvent.keyDown(view.getByRole('searchbox', { name: 'Search cards' }), { key: 'Enter', code: 'Enter' });
    expect(onPick).not.toHaveBeenCalled();
  });
});
