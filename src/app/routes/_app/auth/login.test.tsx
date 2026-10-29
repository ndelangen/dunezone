/** @vitest-environment jsdom */
import { MantineProvider } from '@mantine/core';
import type * as TanStackRouter from '@tanstack/react-router';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { appContentTheme } from '@ui/theme';
import type { AnchorHTMLAttributes, ComponentType } from 'react';
import { afterEach, beforeEach, expect, test, vi } from 'vite-plus/test';

const mocks = vi.hoisted(() => ({
  search: {} as Record<string, unknown>,
  profile: { username: 'Krell' } as { username: string } | null,
  navigate: vi.fn(),
  signIn: vi.fn(),
  signOut: vi.fn(),
}));

vi.mock('@tanstack/react-router', async (importOriginal) => ({
  ...(await importOriginal<typeof TanStackRouter>()),
  createFileRoute: () => (options: unknown) => ({ options, useSearch: () => mocks.search }),
  useNavigate: () => mocks.navigate,
  Link: ({ children, to, ...props }: AnchorHTMLAttributes<HTMLAnchorElement> & { to: string }) => (
    <a {...props} href={to}>
      {children}
    </a>
  ),
}));
vi.mock('@convex-dev/auth/react', () => ({
  useAuthActions: () => ({ signIn: mocks.signIn, signOut: mocks.signOut }),
}));
vi.mock('@db/profiles', () => ({ useCurrentProfile: () => ({ data: mocks.profile }) }));
vi.mock('@db/accounts', () => ({
  authProviderNames: { google: 'Google', discord: 'Discord' },
  useSignInProviders: () => [{ provider: 'google', available: true }],
  useLastSignInMethod: () => null,
  noteSignInStarted: vi.fn(),
  settleStartedSignIn: vi.fn(),
}));

import { keepsPlayTable, STORED_PLAY_TABLE_PREFIX } from '@db/playTables';

import { Route } from './login.route';

const LoginPage = Route.options.component as ComponentType;
const destination = '/play/dreamrules?view=table#hand';
const storedTableKey = `${STORED_PLAY_TABLE_PREFIX}dreamrules`;
const privateTable = '{"hand":["private-card"]}';

beforeEach(() => {
  mocks.search = { redirect: destination, reauthenticate: true };
  mocks.profile = { username: 'Krell' };
  mocks.navigate.mockReset();
  mocks.signOut.mockReset().mockResolvedValue(undefined);
  mocks.signIn.mockReset().mockResolvedValue({ signingIn: true });
  keepsPlayTable('dreamrules');
  sessionStorage.setItem(storedTableKey, privateTable);
  vi.stubGlobal('matchMedia', () => ({ matches: false, addEventListener() {}, removeEventListener() {} }));
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
  sessionStorage.clear();
  localStorage.clear();
  keepsPlayTable('dreamrules');
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

async function page() {
  await act(async () => {
    render(
      <MantineProvider theme={appContentTheme}>
        <LoginPage />
      </MantineProvider>
    );
  });
}

test('recovery shows sign-in choices without redirecting or signing out on arrival', async () => {
  await page();
  expect(screen.getByRole('button', { name: 'Continue with Google' })).toBeTruthy();
  expect(mocks.navigate).not.toHaveBeenCalled();
  expect(mocks.signOut).not.toHaveBeenCalled();
  expect(sessionStorage.getItem(storedTableKey)).toBe(privateTable);
});

test('recovery waits for sign-out, then reloads the destination after fresh credentials arrive', async () => {
  const ended = Promise.withResolvers<void>();
  mocks.signOut.mockReturnValue(ended.promise);
  await page();
  await act(async () => {
    fireEvent.click(screen.getByRole('button', { name: 'Continue with Google' }));
  });
  expect(mocks.signOut).toHaveBeenCalledOnce();
  expect(sessionStorage.getItem(storedTableKey)).toBeNull();
  expect(mocks.signIn).not.toHaveBeenCalled();
  expect((screen.getByRole('button', { name: 'Continue with Google' }) as HTMLButtonElement).disabled).toBe(true);
  await act(async () => {
    ended.resolve();
  });
  expect(mocks.signIn).toHaveBeenCalledExactlyOnceWith('google', { redirectTo: destination });
  expect(mocks.navigate).toHaveBeenCalledExactlyOnceWith({ href: destination, replace: true, reloadDocument: true });
});

test('failed session cleanup keeps recovery open and can be retried', async () => {
  mocks.signOut.mockRejectedValueOnce(new Error('Session cleanup failed.'));
  await page();
  await act(async () => {
    fireEvent.click(screen.getByRole('button', { name: 'Continue with Google' }));
  });
  expect(screen.getByRole('alert').textContent).toContain('Session cleanup failed.');
  expect(sessionStorage.getItem(storedTableKey)).toBeNull();
  expect(mocks.signIn).not.toHaveBeenCalled();
  expect(mocks.navigate).not.toHaveBeenCalled();
  await act(async () => {
    fireEvent.click(screen.getByRole('button', { name: 'Continue with Google' }));
  });
  expect(mocks.signIn).toHaveBeenCalledOnce();
});

test('returning from an unfinished provider sign-in leaves recovery available', async () => {
  mocks.signIn.mockResolvedValue({ signingIn: false, redirect: new URL('https://accounts.google.com/') });
  await page();
  await act(async () => {
    fireEvent.click(screen.getByRole('button', { name: 'Continue with Google' }));
  });
  expect(mocks.signIn).toHaveBeenCalledExactlyOnceWith('google', { redirectTo: destination });
  expect(mocks.navigate).not.toHaveBeenCalled();
  expect((screen.getByRole('button', { name: 'Continue with Google' }) as HTMLButtonElement).disabled).toBe(true);
  await act(async () => {
    window.dispatchEvent(new Event('pageshow'));
  });
  expect((screen.getByRole('button', { name: 'Continue with Google' }) as HTMLButtonElement).disabled).toBe(false);
  expect(mocks.navigate).not.toHaveBeenCalled();
});

test('ordinary sign-in still returns an authenticated player to the requested page', async () => {
  mocks.search = { redirect: destination };
  await page();
  expect(mocks.navigate).toHaveBeenCalledExactlyOnceWith({ href: destination, replace: true });
  expect(mocks.signOut).not.toHaveBeenCalled();
  expect(sessionStorage.getItem(storedTableKey)).toBe(privateTable);
});

test('local recovery returns with a fresh page after password sign-in', async () => {
  vi.stubEnv('VITE_E2E_LOCAL_AUTH', 'true');
  await page();
  fireEvent.change(screen.getByLabelText('Email'), { target: { value: 'krell@example.test' } });
  fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'local-test-password' } });
  await act(async () => {
    fireEvent.click(screen.getByRole('button', { name: 'Continue with local auth' }));
  });
  expect(mocks.signOut).toHaveBeenCalledOnce();
  expect(sessionStorage.getItem(storedTableKey)).toBeNull();
  expect(mocks.signIn).toHaveBeenCalledExactlyOnceWith('password', {
    flow: 'signIn',
    email: 'krell@example.test',
    password: 'local-test-password',
  });
  expect(mocks.navigate).toHaveBeenCalledExactlyOnceWith({ href: destination, replace: true, reloadDocument: true });
});
