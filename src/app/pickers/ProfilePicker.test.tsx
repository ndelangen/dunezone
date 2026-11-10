/** @vitest-environment jsdom */

import { MantineProvider } from '@mantine/core';
import { fireEvent, render } from '@testing-library/react';
import { appContentTheme } from '@ui/theme';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vite-plus/test';

const mocks = vi.hoisted(() => ({
  loadMore: vi.fn(),
  hook: vi.fn(),
}));

vi.mock('@db/accountDeletion', () => ({ useReplacementProfiles: mocks.hook }));

import { resetPickerDom, searchAndEnter, stubPickerDom } from './pickerTestDom';
import { ProfilePicker } from './ProfilePicker';

const profiles = [
  { profileId: 'profile-1', userId: 'user-1', username: 'Paul Atreides', slug: 'paul-atreides', avatarUrl: null },
  { profileId: 'profile-2', userId: 'user-2', username: 'Chani Kynes', slug: 'chani-kynes', avatarUrl: null },
];

beforeEach(() => {
  mocks.loadMore.mockReset();
  mocks.hook.mockImplementation((search: string) => ({
    data: search
      ? profiles.filter((profile) => profile.slug.startsWith(search.toLocaleLowerCase().replaceAll(' ', '-')))
      : profiles,
    status: 'CanLoadMore',
    loadMore: mocks.loadMore,
  }));
  stubPickerDom();
});

afterEach(resetPickerDom);

function renderPicker({ onPick = vi.fn(), onCancel = vi.fn() }: { onPick?: () => void; onCancel?: () => void }) {
  return render(
    <MantineProvider theme={appContentTheme}>
      <ProfilePicker onPick={onPick} onCancel={onCancel} />
    </MantineProvider>
  );
}

describe('ProfilePicker', () => {
  it('searches, selects with keyboard-compatible options, and returns the chosen profile', () => {
    const onPick = vi.fn();
    const view = renderPicker({ onPick });
    fireEvent.change(view.getByRole('searchbox', { name: 'Search profiles' }), { target: { value: 'chani' } });
    expect(mocks.hook).toHaveBeenLastCalledWith('chani');
    expect(view.queryByText('Paul Atreides')).toBeNull();
    fireEvent.click(view.getByRole('option', { name: /Chani Kynes/ }));
    fireEvent.click(view.getByRole('button', { name: 'Use this profile' }));
    expect(onPick).toHaveBeenCalledWith(profiles[1]);
    fireEvent.click(view.getByRole('button', { name: 'Load more profiles' }));
    expect(mocks.loadMore).toHaveBeenCalledTimes(1);
  });

  it('highlights the first match of a search, so Enter chooses it', () => {
    const onPick = vi.fn();
    const view = renderPicker({ onPick });
    searchAndEnter(view.getByRole('searchbox', { name: 'Search profiles' }), 'chani');
    fireEvent.click(view.getByRole('button', { name: 'Use this profile' }));
    expect(onPick).toHaveBeenCalledWith(profiles[1]);
  });

  it('supports cancellation and empty/loading states', () => {
    const onCancel = vi.fn();
    mocks.hook.mockReturnValue({ data: [], status: 'LoadingFirstPage', loadMore: mocks.loadMore });
    const view = renderPicker({ onCancel });
    expect(view.getByRole('status').textContent).toBe('Loading profiles');
    fireEvent.click(view.getByRole('button', { name: 'Cancel' }));
    expect(onCancel).toHaveBeenCalledTimes(1);
  });
});
