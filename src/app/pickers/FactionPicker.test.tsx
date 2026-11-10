/** @vitest-environment jsdom */

import { MantineProvider } from '@mantine/core';
import { cleanup, fireEvent, render } from '@testing-library/react';
import { appContentTheme } from '@ui/theme';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vite-plus/test';

const mocks = vi.hoisted(() => ({ picker: vi.fn() }));

vi.mock('@db/factions', () => ({ useFactionLoadPicker: mocks.picker }));
vi.mock('@db/profiles', () => ({ useCurrentProfile: () => ({ data: undefined }) }));
vi.mock('@tanstack/react-router', () => ({ Link: () => null }));
/* The schema check passes any row; the test is about which row the keyboard picks. */
vi.mock('@shared/factions/schema', () => ({
  FactionInputSchema: { safeParse: (data: unknown) => ({ success: true, data }) },
}));
/* The rows' faces are drawn elsewhere; a name is all a keyboard test needs. */
vi.mock('./FactionPicker.parts', () => ({
  FactionLoadOptionRow: ({ name }: { name: string }) => <span>{name}</span>,
  factionLoadOptionSearchText: (row: { slug: string; data: { name: string } }) => `${row.data.name} ${row.slug}`,
  factionLoadOwnerLabel: () => 'Owner',
}));

import { FactionPicker } from './FactionPicker';

class ResizeObserverStub {
  observe() {}
  unobserve() {}
  disconnect() {}
}

const row = (id: string, name: string) => ({
  id,
  slug: name.toLowerCase(),
  data: { name },
  groupId: null,
  groupLabel: 'No group',
  ownerId: 'user',
  ownerUsername: 'Owner',
});

beforeEach(() => {
  mocks.picker.mockReturnValue({
    data: { rows: [row('f-1', 'Atreides'), row('f-2', 'Harkonnen'), row('f-3', 'Fremen')], memberGroupIds: [] },
    isPending: false,
  });
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

function renderPicker(onPick: () => void) {
  return render(
    <MantineProvider theme={appContentTheme}>
      <FactionPicker
        commitOnSelect
        copy={{ errorTitle: 'Could not load', emptyMessage: 'None.' }}
        onUnusable={vi.fn()}
        onPick={onPick}
      />
    </MantineProvider>
  );
}

describe('FactionPicker', () => {
  it('picks the first match of a search with Enter, not a row of the list before it', () => {
    const onPick = vi.fn();
    const view = renderPicker(onPick);
    const search = view.getByRole('searchbox', { name: 'Search factions' });
    fireEvent.change(search, { target: { value: 'frem' } });
    fireEvent.keyDown(search, { key: 'Enter', code: 'Enter' });
    expect(onPick).toHaveBeenCalledTimes(1);
    expect(onPick.mock.calls[0]?.[0]).toMatchObject({ id: 'f-3', slug: 'fremen' });
  });

  it('highlights nothing before the reader types', () => {
    const onPick = vi.fn();
    const view = renderPicker(onPick);
    fireEvent.keyDown(view.getByRole('searchbox', { name: 'Search factions' }), { key: 'Enter', code: 'Enter' });
    expect(onPick).not.toHaveBeenCalled();
  });
});
