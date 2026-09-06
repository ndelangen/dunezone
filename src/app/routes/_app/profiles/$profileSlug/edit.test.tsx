/** @vitest-environment jsdom */

import { MantineProvider } from '@mantine/core';
import type * as TanStackRouter from '@tanstack/react-router';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { appContentTheme } from '@ui/theme';
import type { ComponentType, ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  navigate: vi.fn(),
  mutate: vi.fn(),
  useSessionViewer: vi.fn(),
  useDefaultGroupPreference: vi.fn(),
  pending: false,
  error: null as Error | null,
}));

vi.mock('@tanstack/react-router', async (importOriginal) => {
  const actual = await importOriginal<typeof TanStackRouter>();
  return {
    ...actual,
    createFileRoute: () => (options: unknown) => ({
      options,
      useParams: () => ({ profileSlug: 'owner-profile' }),
    }),
    Link: ({ children, to }: { children?: ReactNode; to: string }) => <a href={to}>{children}</a>,
    useNavigate: () => mocks.navigate,
  };
});

vi.mock('@db/profiles', () => ({
  useSessionViewer: mocks.useSessionViewer,
  useDefaultGroupPreference: mocks.useDefaultGroupPreference,
  useUpdateCurrentProfile: () => ({
    mutate: mocks.mutate,
    isPending: mocks.pending,
    isError: mocks.error !== null,
    error: mocks.error,
  }),
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

async function renderPage() {
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
  await chooseTab(view, 'Profile');
  return view;
}

async function chooseTab(view: ReturnType<typeof render>, name: string) {
  const tab = await view.findByRole('tab', { name }, { timeout: 5000 });
  await act(async () => {
    tab.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, button: 0 }));
    tab.click();
  });
}

beforeEach(() => {
  mocks.navigate.mockReset();
  mocks.mutate.mockReset();
  mocks.useSessionViewer.mockReset();
  mocks.useSessionViewer.mockReturnValue({ kind: 'profile', profile });
  mocks.useDefaultGroupPreference.mockReturnValue({
    data: {
      default_group_id: null,
      default_group_options: [{ id: 'group-1', name: 'Spacing Guild', slug: 'spacing-guild' }],
    },
  });
  mocks.pending = false;
  mocks.error = null;
  localStorage.clear();
  document.cookie = 'motion=; path=/; max-age=0';
  document.documentElement.removeAttribute('data-mantine-color-scheme');
  vi.stubGlobal('ResizeObserver', ResizeObserverStub);
  vi.stubGlobal(
    'requestAnimationFrame',
    vi.fn((callback: FrameRequestCallback) => {
      callback(0);
      return 1;
    })
  );
  vi.stubGlobal('cancelAnimationFrame', vi.fn());
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
      view.getByRole('group', { name: 'Default Group' }).querySelector('[role="img"][aria-label="Help"]')
    ).not.toBeNull();

    await chooseTab(view, 'Appearance');
    expect(view.getByRole('radiogroup', { name: 'Ambient motion' })).not.toBeNull();
    expect(view.getByRole('radiogroup', { name: 'Color scheme' })).not.toBeNull();
    expect(
      view.getByRole('group', { name: 'Ambient motion' }).querySelector('[role="img"][aria-label="Help"]')
    ).not.toBeNull();
    expect(
      view.getByRole('group', { name: 'Color scheme' }).querySelector('[role="img"][aria-label="Help"]')
    ).not.toBeNull();
    await chooseTab(view, 'Account');
    expect(view.getByRole('link', { name: 'Delete account' })).not.toBeNull();
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
    mocks.useDefaultGroupPreference.mockReturnValue({ data: undefined });
    const view = await renderPage();
    await chooseTab(view, 'Creation defaults');

    /* Disabled, so it is no longer exposed as a combobox; find it by its label. */
    const field = view.container.querySelector('input[aria-label="Default Group"]');
    expect(field).toHaveProperty('disabled', true);
  });

  it('submits from every tab and includes an explicitly changed default Group', async () => {
    const view = await renderPage();
    fireEvent.change(view.getByRole('textbox', { name: /Display name/ }), { target: { value: 'ChangedOwner' } });

    for (const tab of ['Profile', 'Creation defaults', 'Appearance']) {
      await chooseTab(view, tab);
      fireEvent.click(view.getByRole('button', { name: 'Save profile' }));
    }
    expect(mocks.mutate).toHaveBeenCalledTimes(3);

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
    fireEvent.click(view.getByRole('radio', { name: 'Dark' }));
    expect(localStorage.getItem('dunezone-color-scheme')).toBe('dark');
    expect(document.documentElement.getAttribute('data-mantine-color-scheme')).toBe('dark');

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
    fireEvent.click(systemOptions[1] as HTMLElement);
    expect(document.cookie).not.toContain('motion=');
    expect(localStorage.getItem('dunezone-color-scheme')).toBeNull();
    expect(document.documentElement.getAttribute('data-mantine-color-scheme')).toBe('dark');

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

    mocks.pending = true;
    view.rerender(
      <MantineProvider theme={appContentTheme}>
        <ProfilePage />
      </MantineProvider>
    );
    expect((view.getByRole('button', { name: 'Saving…' }) as HTMLButtonElement).disabled).toBe(true);

    /* The error channel is the mutation result itself now, not a callback: the page renders
       `update.error` whenever `update.isError`, so a failed save is simulated by the hook's state. */
    mocks.pending = false;
    mocks.error = new Error('Profile update failed');
    view.rerender(
      <MantineProvider theme={appContentTheme}>
        <ProfilePage />
      </MantineProvider>
    );
    /* The error shows on the panel the reader is on, with no tab yank: every panel carries it, and
       the selected tab not moving is the contract this pins (the old code jumped to Profile here). */
    expect((view.getByRole('tab', { name: 'Appearance' }) as HTMLElement).getAttribute('aria-selected')).toBe('true');
    expect(view.getByText('Profile update failed')).not.toBeNull();
    await chooseTab(view, 'Profile');
    expect((view.getByRole('textbox', { name: /Display name/ }) as HTMLInputElement).value).toBe('ChangedOwner');
    mocks.error = null;

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
