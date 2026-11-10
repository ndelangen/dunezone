/** @vitest-environment jsdom */

import { MantineProvider } from '@mantine/core';
import { render } from '@testing-library/react';
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
import { resetPickerDom, searchAndEnter, stubPickerDom } from './pickerTestDom';

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
  stubPickerDom();
});

afterEach(resetPickerDom);

function renderPicker(onPick: () => void) {
  return render(
    <MantineProvider theme={appContentTheme}>
      <AssetPicker
        types={['card-treachery']}
        copy={{ searchLabel: 'Search cards', searchPlaceholder: 'Name', emptyMessage: 'No cards.' }}
        onPick={onPick}
      />
    </MantineProvider>
  );
}

describe('AssetPicker', () => {
  it('picks the first match of a search with Enter, not a row of the list before it', () => {
    const onPick = vi.fn();
    const view = renderPicker(onPick);
    searchAndEnter(view.getByRole('searchbox', { name: 'Search cards' }), 'crys');
    expect(onPick).toHaveBeenCalledTimes(1);
    expect(onPick.mock.calls[0]?.[0]).toMatchObject({ id: 'card-2', name: 'Crysknife' });
  });

  it('highlights nothing before the reader types', () => {
    const onPick = vi.fn();
    const view = renderPicker(onPick);
    searchAndEnter(view.getByRole('searchbox', { name: 'Search cards' }));
    expect(onPick).not.toHaveBeenCalled();
  });
});
