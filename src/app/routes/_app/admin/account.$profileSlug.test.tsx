/** @vitest-environment jsdom */

import { MantineProvider } from '@mantine/core';
import type * as TanStackRouter from '@tanstack/react-router';
import { cleanup, fireEvent, render } from '@testing-library/react';
import { appContentTheme } from '@ui/theme';
import type { ComponentType, ReactNode } from 'react';
import { afterEach, beforeEach, expect, test, vi } from 'vite-plus/test';

const mocks = vi.hoisted(() => ({ slug: 'krell', viewerId: 'admin', ban: vi.fn() }));
vi.mock('@tanstack/react-router', async (importOriginal) => ({
  ...(await importOriginal<typeof TanStackRouter>()),
  createFileRoute: () => (options: unknown) => ({ options, useParams: () => ({ profileSlug: mocks.slug }) }),
  createLink:
    () =>
    ({ children, to }: { children?: ReactNode; to: string }) => <a href={to}>{children}</a>,
}));
vi.mock('@db/profiles', () => ({ useCurrentProfile: () => ({ data: { user_id: mocks.viewerId } }) }));
vi.mock('@db/accountDeletion', () => ({
  useAccountModerationPage: () => ({
    isPending: false,
    data: {
      profile: { userId: mocks.slug, username: null, slug: mocks.slug },
      accountState: 'active',
      operation: null,
      summary: [],
    },
  }),
  useBanAccount: () => ({ mutate: mocks.ban, isPending: false, error: null }),
  useUnbanAccount: () => ({ mutate: vi.fn(), isPending: false, error: null }),
  useResumeAccountContentOperation: () => ({ mutate: vi.fn(), isPending: false, error: null }),
}));
/* The kit owns the five-second hold; this page proves which decision reaches its callback. */
vi.mock('@ui/control/HoldAction', () => ({
  HoldAction: ({
    label,
    onConfirm,
    disabled,
    disabledReason,
  }: {
    label: string;
    onConfirm: () => void;
    disabled?: boolean;
    disabledReason?: string;
  }) => (
    <button disabled={disabled || !!disabledReason} onClick={onConfirm}>
      {label}
    </button>
  ),
}));
vi.mock('@app/pickers/ProfilePicker', () => ({
  ProfilePicker: ({ onPick, adminSourceUserId }: { onPick: (profile: unknown) => void; adminSourceUserId: string }) => (
    <button
      onClick={() =>
        onPick({
          userId: 'central',
          profileId: 'central-profile',
          username: 'Central',
          slug: 'central',
          avatarUrl: null,
        })
      }
    >
      Choose Central for {adminSourceUserId}
    </button>
  ),
}));

import { Route } from './account.$profileSlug.route';

const AccountPage = Route.options.component as ComponentType;
const page = () => (
  <MantineProvider env="test" theme={appContentTheme}>
    <AccountPage />
  </MantineProvider>
);

/* jsdom has no font loading, which the reason field's autosize listens to. */
Object.defineProperty(document, 'fonts', {
  configurable: true,
  value: { addEventListener: vi.fn(), removeEventListener: vi.fn() },
});

beforeEach(() => {
  mocks.slug = 'krell';
  mocks.viewerId = 'admin';
  mocks.ban.mockReset();
  window.matchMedia = vi
    .fn()
    .mockImplementation(() => ({ matches: false, addEventListener() {}, removeEventListener() {} }));
  vi.stubGlobal(
    'ResizeObserver',
    class {
      observe() {}
      unobserve() {}
      disconnect() {}
    }
  );
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

test('submits removal only after acknowledgement and sends the trimmed admin reason', () => {
  const view = render(page());
  const ban = view.getByRole('button', { name: 'Ban account' });
  expect((ban as HTMLButtonElement).disabled).toBe(true);
  fireEvent.change(view.getByRole('textbox', { name: 'Admin reason' }), { target: { value: '  Repeated abuse  ' } });
  fireEvent.click(
    view.getByRole('checkbox', { name: 'Ban krell, soft-delete its content, and remove all hosted games.' })
  );
  fireEvent.click(ban);
  expect(mocks.ban.mock.calls[0]![0]).toEqual({
    sourceUserId: 'krell',
    replacementUserId: null,
    reason: 'Repeated abuse',
  });
});

test('changing the owner requires a new acknowledgement and submits that owner', () => {
  const view = render(page());
  fireEvent.click(view.getByRole('checkbox'));
  fireEvent.click(view.getByRole('button', { name: 'Choose a replacement owner' }));
  fireEvent.click(view.getByRole('button', { name: 'Choose Central for krell' }));
  const ban = view.getByRole('button', { name: 'Ban account' });
  expect((ban as HTMLButtonElement).disabled).toBe(true);
  fireEvent.click(view.getByRole('checkbox', { name: /transfer content to Central/ }));
  fireEvent.click(ban);
  expect(mocks.ban.mock.calls[0]![0]).toEqual({ sourceUserId: 'krell', replacementUserId: 'central' });
});

test('navigating to another account clears the prior acknowledgement and reason', () => {
  const view = render(page());
  fireEvent.change(view.getByRole('textbox', { name: 'Admin reason' }), {
    target: { value: 'Previous account reason' },
  });
  fireEvent.click(view.getByRole('checkbox'));
  mocks.slug = 'central';
  view.rerender(page());
  expect((view.getByRole('button', { name: 'Ban account' }) as HTMLButtonElement).disabled).toBe(true);
  expect((view.getByRole('textbox', { name: 'Admin reason' }) as HTMLTextAreaElement).value).toBe('');
});

test('the administrator cannot submit a ban against their own profile', () => {
  mocks.viewerId = 'krell';
  const view = render(page());
  fireEvent.click(view.getByRole('checkbox'));
  fireEvent.click(view.getByRole('button', { name: 'Ban account' }));
  expect(mocks.ban).not.toHaveBeenCalled();
});
