/** @vitest-environment jsdom */

import { MantineProvider } from '@mantine/core';
import { cleanup, fireEvent, render } from '@testing-library/react';
import { appContentTheme } from '@ui/theme';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  loadMore: vi.fn(),
  hook: vi.fn(),
}));

vi.mock('@db/accountDeletion', () => ({ useReplacementProfiles: mocks.hook }));

import { ProfilePicker } from './ProfilePicker';

class ResizeObserverStub {
  observe() {}
  unobserve() {}
  disconnect() {}
}

const profiles = [
  { profileId: 'profile-1', userId: 'user-1', username: 'Paul Atreides', slug: 'paul-atreides', avatarUrl: null },
  { profileId: 'profile-2', userId: 'user-2', username: 'Chani Kynes', slug: 'chani-kynes', avatarUrl: null },
];

beforeEach(() => {
  mocks.loadMore.mockReset();
  mocks.hook.mockReturnValue({ data: profiles, status: 'CanLoadMore', loadMore: mocks.loadMore });
  window.matchMedia = vi.fn().mockImplementation((query: string) => ({
    matches: false,
    media: query,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  })) as unknown as typeof window.matchMedia;
  vi.stubGlobal('ResizeObserver', ResizeObserverStub);
  Object.defineProperty(HTMLElement.prototype, 'scrollIntoView', {
    configurable: true,
    value: vi.fn(),
  });
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('ProfilePicker', () => {
  it('searches, selects with keyboard-compatible options, and returns the chosen profile', () => {
    const onPick = vi.fn();
    const view = render(
      <MantineProvider theme={appContentTheme}>
        <ProfilePicker onPick={onPick} onCancel={vi.fn()} />
      </MantineProvider>
    );
    fireEvent.change(view.getByRole('searchbox', { name: 'Search profiles' }), { target: { value: 'chani' } });
    expect(view.queryByText('Paul Atreides')).toBeNull();
    fireEvent.click(view.getByRole('option', { name: /Chani Kynes/ }));
    fireEvent.click(view.getByRole('button', { name: 'Use this profile' }));
    expect(onPick).toHaveBeenCalledWith(profiles[1]);
    fireEvent.click(view.getByRole('button', { name: 'Load more profiles' }));
    expect(mocks.loadMore).toHaveBeenCalledTimes(1);
  });

  it('supports cancellation and empty/loading states', () => {
    const onCancel = vi.fn();
    mocks.hook.mockReturnValue({ data: [], status: 'LoadingFirstPage', loadMore: mocks.loadMore });
    const view = render(
      <MantineProvider theme={appContentTheme}>
        <ProfilePicker onPick={vi.fn()} onCancel={onCancel} />
      </MantineProvider>
    );
    expect(view.getByLabelText('Loading profiles')).not.toBeNull();
    fireEvent.click(view.getByRole('button', { name: 'Cancel' }));
    expect(onCancel).toHaveBeenCalledTimes(1);
  });
});
