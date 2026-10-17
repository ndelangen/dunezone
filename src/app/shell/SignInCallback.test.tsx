/** @vitest-environment jsdom */

import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vite-plus/test';

const mocks = vi.hoisted(() => ({
  signIn: vi.fn(),
  navigate: vi.fn(),
  replace: vi.fn(),
  inactive: new Error('inactive'),
}));

vi.mock('@convex-dev/auth/react', () => ({ useAuthActions: () => ({ signIn: mocks.signIn }) }));
vi.mock('@tanstack/react-router', () => ({
  useRouter: () => ({ navigate: mocks.navigate, history: { replace: mocks.replace } }),
}));
vi.mock('@db/accounts', () => ({ refusedAsInactiveAccount: (error: unknown) => error === mocks.inactive }));

const VERIFIER = '__convexAuthOAuthVerifier_test';
vi.mock('@db/playTables', () => ({ storedOAuthVerifierKey: () => VERIFIER }));

/* The handler runs once per page load, so each case loads it afresh. */
async function land(href: string) {
  window.history.replaceState(null, '', href);
  const { SignInCallback } = await import('./SignInCallback');
  const root = createRoot(document.createElement('div'));
  await act(async () => {
    root.render(<SignInCallback />);
  });
  await act(async () => {});
  root.unmount();
}

beforeEach(() => {
  vi.resetModules();
  mocks.signIn.mockReset().mockResolvedValue({ signingIn: true });
  mocks.navigate.mockReset();
  mocks.replace.mockReset();
  localStorage.clear();
});

afterEach(() => {
  localStorage.clear();
});

describe('SignInCallback', () => {
  it('finishes a returning sign-in with its verifier and takes the code out of the address', async () => {
    localStorage.setItem(VERIFIER, 'verifier');
    await land('/rulesets/arrakis?tab=faq&code=one-time#rules');
    expect(mocks.replace).toHaveBeenCalledWith('/rulesets/arrakis?tab=faq#rules');
    expect(mocks.signIn).toHaveBeenCalledWith(undefined, { code: 'one-time' });
    expect(mocks.navigate).not.toHaveBeenCalled();
  });

  it('sends a refused sign-in to the sign-in page with the reason and the page to return to', async () => {
    mocks.signIn.mockRejectedValue(mocks.inactive);
    await land('/factions/create?code=one-time');
    expect(mocks.navigate).toHaveBeenCalledWith({
      to: '/auth/login',
      search: { redirect: '/factions/create', failed: 'inactive' },
      replace: true,
    });
  });

  it('reports a code that no longer signs anyone in', async () => {
    mocks.signIn.mockResolvedValue({ signingIn: false });
    await land('/?code=spent');
    expect(mocks.navigate).toHaveBeenCalledWith({ to: '/auth/login', search: { failed: 'failed' }, replace: true });
  });

  it('reports a sign-in that left for the provider and came back without a code', async () => {
    localStorage.setItem(VERIFIER, 'verifier');
    await land('/rulesets/arrakis');
    expect(localStorage.getItem(VERIFIER)).toBeNull();
    expect(mocks.signIn).not.toHaveBeenCalled();
    expect(mocks.navigate).toHaveBeenCalledWith({
      to: '/auth/login',
      search: { redirect: '/rulesets/arrakis', failed: 'unfinished' },
      replace: true,
    });
  });

  it('leaves an ordinary page load alone', async () => {
    await land('/rulesets/arrakis');
    expect(mocks.signIn).not.toHaveBeenCalled();
    expect(mocks.navigate).not.toHaveBeenCalled();
    expect(mocks.replace).not.toHaveBeenCalled();
  });

  it('lets a connect page explain its own unfinished sign-in', async () => {
    localStorage.setItem(VERIFIER, 'verifier');
    await land('/profiles/owner/connect');
    expect(mocks.navigate).not.toHaveBeenCalled();
  });
});
