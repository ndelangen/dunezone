/** @vitest-environment jsdom */

import { MantineProvider } from '@mantine/core';
import type * as TanStackRouter from '@tanstack/react-router';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { appContentTheme } from '@ui/theme';
import type { AnchorHTMLAttributes, ComponentType } from 'react';
import { useSyncExternalStore } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vite-plus/test';

import type * as Accounts from '@db/accounts';

const mocks = vi.hoisted(() => ({
  search: {} as Record<string, unknown>,
  /* The backend's refusal for a stale sign-in, as the doorway tells it apart; the words are what the page shows. */
  staleSignIn: new Error('Sign in again to confirm it is you, then try again.'),
  navigate: vi.fn(),
  beginConnection: vi.fn(),
  signIn: vi.fn(),
  signOut: vi.fn(),
  disconnectMethod: vi.fn(),
  signOutEverywhere: vi.fn(),
  resyncLinked: vi.fn(),
  applyLinked: vi.fn(),
  mutate: vi.fn(),
  useSessionViewer: vi.fn(),
  useProfileSettings: vi.fn(),
  mutationState: { isPending: false, error: null as Error | null },
  mutationListeners: new Set<() => void>(),
}));

vi.mock('@tanstack/react-router', async (importOriginal) => {
  const actual = await importOriginal<typeof TanStackRouter>();
  return {
    ...actual,
    createFileRoute: () => (options: unknown) => ({
      options,
      useParams: () => ({ profileSlug: 'owner-profile' }),
      useSearch: () => mocks.search,
    }),
    /* The link's search lands in its address, so a test can read where a link sends the reader. */
    Link: ({
      children,
      to,
      search,
      ...props
    }: AnchorHTMLAttributes<HTMLAnchorElement> & { to: string; search?: Record<string, string | boolean> }) => (
      <a
        {...props}
        href={
          search
            ? `${to}?${new URLSearchParams(Object.entries(search).map(([key, value]) => [key, String(value)]))}`
            : to
        }
      >
        {children}
      </a>
    ),
    useNavigate: () => mocks.navigate,
  };
});

vi.mock('@db/profiles', () => ({
  useSessionViewer: mocks.useSessionViewer,
  useProfileSettings: mocks.useProfileSettings,
  useUpdateCurrentProfile: () => {
    const state = useSyncExternalStore(
      (listener) => {
        mocks.mutationListeners.add(listener);
        return () => mocks.mutationListeners.delete(listener);
      },
      () => mocks.mutationState
    );
    return { mutate: mocks.mutate, ...state, isError: state.error !== null };
  },
}));

vi.mock('@convex-dev/auth/react', () => ({ useAuthActions: () => ({ signIn: mocks.signIn, signOut: mocks.signOut }) }));
vi.mock('@db/accounts', async (importOriginal) => ({
  ...(await importOriginal<typeof Accounts>()),
  needsRecentSignIn: (error: unknown) => error === mocks.staleSignIn,
  useBeginAuthConnection: () => mocks.beginConnection,
  useDisconnectAuthMethod: () => mocks.disconnectMethod,
  useSignOutEverywhere: () => mocks.signOutEverywhere,
  useResyncLinkedAccounts: () => mocks.resyncLinked,
  useApplyLinkedAccount: () => mocks.applyLinked,
}));

import { Route } from './edit.route';

class ResizeObserverStub {
  constructor(_callback: ResizeObserverCallback) {}
  observe() {}
  unobserve() {}
  disconnect() {}
}

const profile = {
  _id: 'profile-1',
  _creationTime: 1,
  user_id: 'user-1',
  username: 'Owner profile',
  avatar_url: 'https://avatar.example/original.png',
  default_group_id: null,
  slug: 'owner-profile',
  created_at: '2026-08-20T00:00:00.000Z',
  updated_at: '2026-08-20T00:00:00.000Z',
};

const ProfilePage = Route.options.component as ComponentType;

/* A mutation update notifies its subscriber even when a memoized parent keeps the same child. */
function setMutationState(state: typeof mocks.mutationState) {
  act(() => {
    mocks.mutationState = state;
    for (const listener of mocks.mutationListeners) {
      listener();
    }
  });
}

/* The page as the address opens it, on whichever tab the address names. */
async function mountPage() {
  let view: ReturnType<typeof render> | undefined;
  await act(async () => {
    view = render(
      <MantineProvider theme={appContentTheme}>
        <ProfilePage />
      </MantineProvider>
    );
  });
  if (!view) {
    throw new Error('Profile page did not render');
  }
  return view;
}

async function renderPage() {
  const view = await mountPage();
  await chooseTab(view, 'Profile');
  return view;
}

async function chooseTab(view: ReturnType<typeof render>, name: string) {
  const tab = await view.findByRole('tab', { name });
  await act(async () => {
    tab.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, button: 0 }));
    tab.click();
  });
}

beforeEach(() => {
  mocks.search = {};
  mocks.navigate.mockReset();
  mocks.beginConnection.mockReset().mockResolvedValue({ slug: 'owner-profile', token: 'connection-token' });
  mocks.signIn.mockReset().mockResolvedValue(undefined);
  mocks.signOut.mockReset().mockResolvedValue(undefined);
  mocks.disconnectMethod.mockReset().mockResolvedValue(undefined);
  mocks.signOutEverywhere.mockReset().mockResolvedValue(null);
  mocks.resyncLinked.mockReset();
  mocks.applyLinked.mockReset();
  mocks.mutate.mockReset();
  mocks.useSessionViewer.mockReset();
  mocks.useSessionViewer.mockReturnValue({ kind: 'profile', profile });
  mocks.useProfileSettings.mockReturnValue({
    data: {
      default_group_id: null,
      default_group_options: [{ id: 'group-1', name: 'Spacing Guild', slug: 'spacing-guild' }],
      account: {
        methods: [
          { provider: 'google', connected: true, available: true },
          { provider: 'discord', connected: false, available: true },
        ],
        merging: false,
      },
    },
  });
  mocks.mutationState = { isPending: false, error: null };
  localStorage.clear();
  document.cookie = 'motion=; path=/; max-age=0';
  document.documentElement.removeAttribute('data-mantine-color-scheme');
  vi.stubGlobal('ResizeObserver', ResizeObserverStub);
  Object.defineProperty(HTMLElement.prototype, 'scrollIntoView', {
    configurable: true,
    value: vi.fn(),
  });
  window.matchMedia = vi.fn().mockImplementation((query: string) => ({
    matches: false,
    media: query,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  })) as unknown as typeof window.matchMedia;
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('profile settings page', () => {
  it('uses one connected body and keeps the save action associated with the route form', async () => {
    const view = await renderPage();

    expect((await view.findAllByRole('tab')).map((tab) => tab.textContent?.trim())).toEqual([
      'Profile',
      'Creation defaults',
      'Appearance',
      'Sign-in methods',
      'Account',
    ]);
    expect(mocks.useSessionViewer).toHaveBeenCalledTimes(1);

    const save = view.getByRole('button', { name: 'Save profile' }) as HTMLButtonElement;
    const formId = save.getAttribute('form');
    expect(formId).toBeTruthy();
    expect(save.closest('form')).toBeNull();
    expect(document.getElementById(formId as string)?.tagName).toBe('FORM');
    expect(save.disabled).toBe(true);
    expect(save.querySelector('svg')).not.toBeNull();

    const displayNameControl = view.getByRole('group', { name: 'Display name *' });
    expect(displayNameControl.getAttribute('aria-describedby')).toBeTruthy();
    expect(displayNameControl.querySelector('[role="img"][aria-label="Help"]')).not.toBeNull();

    await chooseTab(view, 'Creation defaults');
    expect(view.getByRole('combobox', { name: 'Default Group' })).not.toBeNull();
    expect(
      view
        .getByRole('combobox', { name: 'Default Group' })
        .closest('[role="group"]')!
        .querySelector('[role="img"][aria-label="Help"]')
    ).not.toBeNull();

    await chooseTab(view, 'Appearance');
    expect(view.getByRole('radiogroup', { name: 'Ambient motion' })).not.toBeNull();
    expect(view.queryByRole('radiogroup', { name: 'Color scheme' })).toBeNull();
    expect(
      view
        .getByRole('radiogroup', { name: 'Ambient motion' })
        .closest('[role="group"]')!
        .querySelector('[role="img"][aria-label="Help"]')
    ).not.toBeNull();
    await chooseTab(view, 'Sign-in methods');
    expect(view.getByRole('button', { name: 'Disconnect Google' })).toHaveProperty('disabled', true);
    expect(view.getByRole('button', { name: 'Connect Discord' })).toHaveProperty('type', 'button');
    expect(view.queryByRole('link', { name: 'Delete account' })).toBeNull();
    await chooseTab(view, 'Account');
    expect(view.getByRole('link', { name: 'Delete account' })).not.toBeNull();
  });

  it('clears local authentication after disconnecting a method', async () => {
    mocks.useProfileSettings.mockReturnValue({
      data: {
        account: {
          merging: false,
          methods: [
            { provider: 'google', connected: true, available: true },
            { provider: 'discord', connected: true, available: true },
          ],
        },
      },
    });
    const view = await renderPage();
    await chooseTab(view, 'Sign-in methods');
    expect(
      view.getAllByText('Disconnecting signs you out on every device. Sign in again with a remaining method.')
    ).toHaveLength(2);
    vi.useFakeTimers();
    try {
      fireEvent.keyDown(view.getByRole('button', { name: 'Disconnect Discord' }), { key: 'Enter' });
      await act(async () => {
        await vi.advanceTimersByTimeAsync(5000);
      });
      expect(mocks.disconnectMethod).toHaveBeenCalledWith({ provider: 'discord' });
      expect(mocks.signOut).toHaveBeenCalledOnce();
    } finally {
      vi.useRealTimers();
    }
  });

  it('ends every session after a held sign-out, then clears local authentication', async () => {
    const view = await renderPage();
    await chooseTab(view, 'Sign-in methods');
    const trigger = view.getByRole('button', { name: 'Sign out on all devices' });
    expect(trigger).toHaveProperty('disabled', false);
    vi.useFakeTimers();
    try {
      fireEvent.keyDown(trigger, { key: 'Enter' });
      await act(async () => {
        await vi.advanceTimersByTimeAsync(5000);
      });
      expect(mocks.signOutEverywhere).toHaveBeenCalledWith({});
      expect(mocks.signOut).toHaveBeenCalledOnce();
    } finally {
      vi.useRealTimers();
    }
  });

  it('says that signing out everywhere leaves the connected methods in place', async () => {
    const view = await renderPage();
    await chooseTab(view, 'Sign-in methods');
    expect(
      view.getByText(
        'Signs this profile out everywhere, including here. Connected sign-in methods stay as they are. After a lost device or a suspected break-in, use it and also check the methods above.'
      )
    ).not.toBeNull();
  });

  it('opens on the tab the address names', async () => {
    mocks.search = { tab: 'sign-in' };
    const view = await mountPage();
    expect((await view.findByRole('tab', { name: 'Sign-in methods' })).getAttribute('aria-selected')).toBe('true');
    expect(view.getByRole('button', { name: 'Connect Discord' })).not.toBeNull();
  });

  describe('name and picture from a sign-in method', () => {
    const googleOption = {
      provider: 'google',
      name: 'Norbert de Langen',
      displayName: 'NorbertdeLangen',
      image: 'https://lh3.example/photo.jpg',
      syncedAt: 1,
    };
    const discordOption = {
      provider: 'discord',
      name: 'Bo',
      displayName: null,
      image: 'https://cdn.discordapp.com/a.png',
      syncedAt: 1,
    };
    const applied = (provider: 'google' | 'discord', slug = 'owner-profile') => ({
      provider,
      name: true,
      avatar: true,
      profile: {
        username: 'NorbertdeLangen',
        avatar_url: 'https://lh3.example/photo.jpg',
        bgg_profile_url: null,
        default_group_id: null,
        slug,
      },
    });
    const bothConnected = () =>
      mocks.useProfileSettings.mockReturnValue({
        data: {
          default_group_id: null,
          default_group_options: [],
          account: {
            methods: [
              { provider: 'google', connected: true, available: true },
              { provider: 'discord', connected: true, available: true },
              { provider: 'steam', connected: false, available: true },
            ],
            merging: false,
          },
        },
      });
    const resyncFromToolbar = async (view: Awaited<ReturnType<typeof renderPage>>) => {
      await act(async () => {
        fireEvent.click(view.getByRole('button', { name: 'Resync name and picture' }));
      });
    };

    it('opens the Sign-in methods tab, applies the one method at once, and the form takes the result', async () => {
      mocks.resyncLinked.mockResolvedValue({ kind: 'applied', applied: applied('google'), options: [googleOption] });
      const view = await renderPage();
      expect(view.getByRole('tab', { name: 'Profile' }).getAttribute('aria-selected')).toBe('true');
      await resyncFromToolbar(view);
      expect(mocks.resyncLinked).toHaveBeenCalledWith({});
      expect(view.getByRole('tab', { name: 'Sign-in methods' }).getAttribute('aria-selected')).toBe('true');
      /* The resync is done: one line says what was taken, and the rows offer nothing. */
      expect(view.getByText('Name and picture updated from Google.')).not.toBeNull();
      expect(view.queryByText('Norbert de Langen')).toBeNull();
      expect(view.queryByRole('button', { name: 'Take Google name and picture' })).toBeNull();
      await chooseTab(view, 'Profile');
      expect((view.getByRole('textbox', { name: 'Display name' }) as HTMLInputElement).value).toBe('NorbertdeLangen');
      expect((view.getByRole('textbox', { name: 'Avatar image URL' }) as HTMLInputElement).value).toBe(
        'https://lh3.example/photo.jpg'
      );
      expect(mocks.navigate).not.toHaveBeenCalled();
    });

    it('follows the profile to its new address when the name changed it, keeping the tab', async () => {
      mocks.resyncLinked.mockResolvedValue({
        kind: 'applied',
        applied: applied('google', 'norbertdelangen'),
        options: [googleOption],
      });
      const view = await renderPage();
      await resyncFromToolbar(view);
      expect(mocks.navigate).not.toHaveBeenCalled();
      /* The live profile learns of the rename; the address still names the old one. */
      mocks.useSessionViewer.mockReturnValue({ kind: 'profile', profile: { ...profile, slug: 'norbertdelangen' } });
      await act(async () => {
        view.rerender(
          <MantineProvider theme={appContentTheme}>
            <ProfilePage />
          </MantineProvider>
        );
      });
      expect(mocks.navigate).toHaveBeenCalledWith({
        to: '/profiles/$profileSlug/edit',
        params: { profileSlug: 'norbertdelangen' },
        search: true,
        replace: true,
      });
      expect(view.queryByText('This is not your profile')).toBeNull();
      /* The editor stays as it was: on the Sign-in methods tab, still saying what Google gave. */
      expect(view.getByRole('tab', { name: 'Sign-in methods' }).getAttribute('aria-selected')).toBe('true');
      expect(view.getByText('Name and picture updated from Google.')).not.toBeNull();
    });

    it('leaves an unsaved edit to another field alone when a method is applied', async () => {
      mocks.resyncLinked.mockResolvedValue({ kind: 'applied', applied: applied('google'), options: [googleOption] });
      const view = await renderPage();
      fireEvent.change(view.getByRole('textbox', { name: 'BoardGameGeek profile URL' }), {
        target: { value: 'https://boardgamegeek.com/user/norbert' },
      });
      await resyncFromToolbar(view);
      await chooseTab(view, 'Profile');
      expect((view.getByRole('textbox', { name: 'Display name' }) as HTMLInputElement).value).toBe('NorbertdeLangen');
      expect((view.getByRole('textbox', { name: 'BoardGameGeek profile URL' }) as HTMLInputElement).value).toBe(
        'https://boardgamegeek.com/user/norbert'
      );
      /* The edit is still unsaved, so Save stays available. */
      expect((view.getByRole('button', { name: 'Save profile' }) as HTMLButtonElement).disabled).toBe(false);
    });

    it('shows each method\u2019s offer on its row when several report something, and takes the chosen one', async () => {
      bothConnected();
      mocks.resyncLinked.mockResolvedValue({ kind: 'choose', options: [googleOption, discordOption] });
      mocks.applyLinked.mockResolvedValue({ ...applied('discord'), name: false });
      const view = await renderPage();
      await resyncFromToolbar(view);
      expect(view.getByText('Takes the name NorbertdeLangen and picture.')).not.toBeNull();
      expect(view.getByText(/“Bo” does not fit a display name/)).not.toBeNull();
      expect(view.getByRole('button', { name: 'Take Google name and picture' })).not.toBeNull();
      await act(async () => {
        fireEvent.click(view.getByRole('button', { name: 'Take Discord name and picture' }));
      });
      expect(mocks.applyLinked).toHaveBeenCalledWith({ provider: 'discord' });
      expect(view.getByText(/Picture updated from Discord/)).not.toBeNull();
      /* Taking one ends the choice: the offers leave every row. */
      expect(view.queryByRole('button', { name: 'Take Google name and picture' })).toBeNull();
      expect(view.queryByRole('button', { name: 'Take Discord name and picture' })).toBeNull();
      expect(view.queryByText('Takes the name NorbertdeLangen and picture.')).toBeNull();
    });

    it('says on each row when no method has reported anything yet', async () => {
      bothConnected();
      mocks.resyncLinked.mockResolvedValue({
        kind: 'nothing',
        options: [
          { ...googleOption, name: null, displayName: null, image: null, syncedAt: null },
          { ...discordOption, name: null, image: null, syncedAt: null },
        ],
      });
      const view = await renderPage();
      await resyncFromToolbar(view);
      expect(view.getAllByText(/Nothing reported yet/)).toHaveLength(2);
      expect(view.getByRole('button', { name: 'Take Google name and picture' }).getAttribute('aria-disabled')).toBe(
        'true'
      );
    });

    it('shows a failed resync as an error on the tab', async () => {
      mocks.resyncLinked.mockRejectedValue(new Error('Steam did not answer.'));
      const view = await renderPage();
      await resyncFromToolbar(view);
      const alert = view.getByRole('alert');
      expect(alert.textContent).toContain('Name and picture could not be updated');
      expect(alert.textContent).toContain('Steam did not answer.');
      expect(view.getByRole('button', { name: 'Resync name and picture' })).toHaveProperty('disabled', false);
    });
  });

  it('offers to sign in again when connecting a method needs a recent sign-in', async () => {
    mocks.beginConnection.mockRejectedValue(mocks.staleSignIn);
    const view = await renderPage();
    await chooseTab(view, 'Sign-in methods');
    await act(async () => {
      fireEvent.click(view.getByRole('button', { name: 'Connect Discord' }));
    });
    expect(mocks.signIn).not.toHaveBeenCalled();
    const alert = view.getByRole('alert');
    expect(alert.textContent).toContain('Sign-in methods could not be changed');
    expect(alert.textContent).toContain(mocks.staleSignIn.message);
    /* The way through returns to this tab, not to the page's first one. */
    expect(view.getByRole('link', { name: 'Sign in again' }).getAttribute('href')).toBe(
      '/auth/login?redirect=%2Fprofiles%2Fowner-profile%2Fedit%3Ftab%3Dsign-in&reauthenticate=true'
    );
    expect(view.getByRole('button', { name: 'Connect Discord' })).toHaveProperty('disabled', false);
  });

  it('offers to sign in again when disconnecting a method needs a recent sign-in', async () => {
    mocks.useProfileSettings.mockReturnValue({
      data: {
        account: {
          merging: false,
          methods: [
            { provider: 'google', connected: true, available: true },
            { provider: 'discord', connected: true, available: true },
          ],
        },
      },
    });
    mocks.disconnectMethod.mockRejectedValue(mocks.staleSignIn);
    const view = await renderPage();
    await chooseTab(view, 'Sign-in methods');
    vi.useFakeTimers();
    try {
      fireEvent.keyDown(view.getByRole('button', { name: 'Disconnect Discord' }), { key: 'Enter' });
      await act(async () => {
        await vi.advanceTimersByTimeAsync(5000);
      });
    } finally {
      vi.useRealTimers();
    }
    expect(mocks.signOut).not.toHaveBeenCalled();
    expect(view.getByRole('alert').textContent).toContain(mocks.staleSignIn.message);
    expect(view.getByRole('link', { name: 'Sign in again' })).not.toBeNull();
  });

  it('shows any other refusal in its own words, with no sign-in offer', async () => {
    mocks.beginConnection.mockRejectedValue(new Error('This sign-in method is not available.'));
    const view = await renderPage();
    await chooseTab(view, 'Sign-in methods');
    await act(async () => {
      fireEvent.click(view.getByRole('button', { name: 'Connect Discord' }));
    });
    expect(view.getByRole('alert').textContent).toContain('This sign-in method is not available.');
    expect(view.queryByRole('link', { name: 'Sign in again' })).toBeNull();
  });

  it('keeps the sign-out everywhere control locked while a merge is in progress', async () => {
    mocks.useProfileSettings.mockReturnValue({
      data: {
        account: {
          merging: true,
          methods: [{ provider: 'google', connected: true, available: true }],
        },
      },
    });
    const view = await renderPage();
    await chooseTab(view, 'Sign-in methods');
    expect(view.getByRole('button', { name: 'Sign out on all devices' })).toHaveProperty('disabled', true);
  });

  it('connects from its own tab without saving the draft and releases buttons when sign-in settles', async () => {
    const view = await renderPage();
    fireEvent.change(view.getByRole('textbox', { name: /Display name/ }), { target: { value: 'ChangedOwner' } });
    await chooseTab(view, 'Sign-in methods');
    await act(async () => {
      fireEvent.click(view.getByRole('button', { name: 'Connect Discord' }));
    });
    expect(mocks.beginConnection).toHaveBeenCalledWith({ provider: 'discord' });
    expect(mocks.signIn).toHaveBeenCalledWith('discord', { redirectTo: '/profiles/owner-profile/connect' });
    expect(sessionStorage.getItem('dunezone-account-connection')).toBe('connection-token');
    expect(mocks.mutate).not.toHaveBeenCalled();
    expect(view.getByRole('button', { name: 'Connect Discord' })).toHaveProperty('disabled', false);
    await chooseTab(view, 'Profile');
    expect(view.getByRole('textbox', { name: /Display name/ })).toHaveProperty('value', 'ChangedOwner');
  });

  it('shows empty, invalid, loading, successful, and unavailable avatar states', async () => {
    const view = await renderPage();
    const avatar = await view.findByRole('textbox', { name: /Avatar image URL/ });

    fireEvent.change(avatar, { target: { value: '' } });
    expect(view.getByRole('status').textContent).toContain('Enter an avatar URL to see a preview.');

    fireEvent.change(avatar, { target: { value: 'not a URL' } });
    expect(view.getByRole('alert').textContent).toContain('Enter a valid https:// image URL.');

    fireEvent.change(avatar, { target: { value: 'https://avatar.example/ready.png' } });
    expect(view.getByRole('status').textContent).toContain('Loading avatar preview...');
    const readyImage = view.container.querySelector<HTMLImageElement>('img[src="https://avatar.example/ready.png"]');
    expect(readyImage).not.toBeNull();
    fireEvent.load(readyImage as HTMLImageElement);
    expect(view.getByRole('img', { name: 'Avatar preview for Owner profile' })).not.toBeNull();

    fireEvent.change(avatar, { target: { value: 'https://avatar.example/unavailable.png' } });
    expect(view.getByRole('status').textContent).toContain('Loading avatar preview...');
    const unavailableImage = view.container.querySelector<HTMLImageElement>(
      'img[src="https://avatar.example/unavailable.png"]'
    );
    fireEvent.load(readyImage as HTMLImageElement);
    expect(view.getByRole('status').textContent).toContain('Loading avatar preview...');
    fireEvent.error(unavailableImage as HTMLImageElement);
    expect(view.getByRole('alert').textContent).toContain('This image could not be loaded.');

    fireEvent.change(avatar, { target: { value: 'https://avatar.example/recovered.png' } });
    const recoveredImage = view.container.querySelector<HTMLImageElement>(
      'img[src="https://avatar.example/recovered.png"]'
    );
    fireEvent.load(recoveredImage as HTMLImageElement);
    expect(view.getByRole('img', { name: 'Avatar preview for Owner profile' })).not.toBeNull();
  });

  it('offers no Group choice until the options have actually arrived', async () => {
    /* The preference query is held by this page, so there is a window where it has not resolved.
       An enabled control listing only "No default Group" would state that the viewer is in no Groups,
       and choosing it saves a cleared default they never meant to change. */
    mocks.useProfileSettings.mockReturnValue({ data: undefined });
    const view = await renderPage();
    await chooseTab(view, 'Creation defaults');

    /* Disabled, so it is no longer exposed as a combobox; find it by its title. */
    const field = view.getByLabelText('Default Group', { selector: 'input' });
    expect(field).toHaveProperty('disabled', true);
  });

  it('submits from every tab and includes an explicitly changed default Group', async () => {
    const view = await renderPage();
    fireEvent.change(view.getByRole('textbox', { name: /Display name/ }), { target: { value: 'ChangedOwner' } });

    for (const tab of ['Profile', 'Creation defaults', 'Appearance', 'Sign-in methods']) {
      await chooseTab(view, tab);
      fireEvent.click(view.getByRole('button', { name: 'Save profile' }));
    }
    expect(mocks.mutate).toHaveBeenCalledTimes(4);

    await chooseTab(view, 'Creation defaults');
    fireEvent.click(view.getByRole('combobox', { name: 'Default Group' }));
    fireEvent.click(screen.getByText('Spacing Guild'));
    fireEvent.click(view.getByRole('button', { name: 'Save profile' }));

    expect(mocks.mutate).toHaveBeenLastCalledWith(
      {
        input: {
          username: 'ChangedOwner',
          avatar_url: 'https://avatar.example/original.png',
          default_group_id: 'group-1',
        },
      },
      expect.any(Object)
    );
  });

  it('applies appearance immediately and retains dirty edits through pending, error, and success', async () => {
    const view = await renderPage();

    await chooseTab(view, 'Appearance');
    fireEvent.click(view.getByRole('radio', { name: 'Off' }));
    expect(document.cookie).toContain('motion=off');

    window.matchMedia = vi.fn().mockImplementation((query: string) => ({
      matches: query.includes('dark') || query.includes('reduce'),
      media: query,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    })) as unknown as typeof window.matchMedia;
    const systemOptions = view.getAllByRole('radio', { name: 'System' });
    fireEvent.click(systemOptions[0] as HTMLElement);
    expect(document.cookie).not.toContain('motion=');

    await chooseTab(view, 'Profile');
    fireEvent.change(view.getByRole('textbox', { name: /Display name/ }), { target: { value: 'ChangedOwner' } });
    await chooseTab(view, 'Appearance');
    const save = view.getByRole('button', { name: 'Save profile' }) as HTMLButtonElement;
    expect(save.disabled).toBe(false);
    const form = document.getElementById(save.getAttribute('form') as string);
    if (!form) {
      throw new Error('Missing profile settings form');
    }
    fireEvent.submit(form);

    expect(mocks.mutate).toHaveBeenCalledWith(
      {
        input: {
          username: 'ChangedOwner',
          avatar_url: 'https://avatar.example/original.png',
        },
      },
      expect.any(Object)
    );

    setMutationState({ isPending: true, error: null });
    /* Save is an icon now, so pending shows as its spinner and its disabled state rather than a "Saving…" label. */
    expect((view.getByRole('button', { name: 'Save profile' }) as HTMLButtonElement).disabled).toBe(true);

    /* The error channel is the mutation result itself now, not a callback: the page renders
       `update.error` whenever `update.isError`, so a failed save is simulated by the hook's state. */
    setMutationState({ isPending: false, error: new Error('Profile update failed') });
    /* The error shows on the panel the reader is on, with no tab yank: every panel carries it, and
       the selected tab not moving is the contract this pins (the old code jumped to Profile here). */
    expect((view.getByRole('tab', { name: 'Appearance' }) as HTMLElement).getAttribute('aria-selected')).toBe('true');
    expect(view.getByText('Profile update failed')).not.toBeNull();
    await chooseTab(view, 'Profile');
    expect((view.getByRole('textbox', { name: /Display name/ }) as HTMLInputElement).value).toBe('ChangedOwner');
    setMutationState({ isPending: false, error: null });

    fireEvent.submit(form);
    const secondOptions = mocks.mutate.mock.calls[1]?.[1] as {
      onSuccess: (entry: typeof profile, variables: unknown, unavailable: boolean) => void;
    };
    act(() =>
      secondOptions.onSuccess(
        { ...profile, username: 'ChangedOwner', slug: 'changed-owner', updated_at: '2026-08-20T00:01:00.000Z' },
        {},
        false
      )
    );
    expect((view.getByRole('button', { name: 'Save profile' }) as HTMLButtonElement).disabled).toBe(true);
    expect(mocks.navigate).toHaveBeenCalledWith({
      to: '/profiles/$profileSlug',
      params: { profileSlug: 'changed-owner' },
      replace: true,
    });
  });
});
