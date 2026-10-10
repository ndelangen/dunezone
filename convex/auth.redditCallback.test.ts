/// <reference types="vite/client" />
/* @vitest-environment edge-runtime */

import aggregateTest from '@convex-dev/aggregate/test';
import { convexTest } from 'convex-test';
import { afterEach, beforeEach, expect, test, vi } from 'vitest';

import { api } from './_generated/api';
import schema from './schema';

const modules = import.meta.glob('./**/*.ts');

beforeEach(() => {
  vi.stubEnv('AUTH_REDDIT_ID', 'test-reddit-client');
  vi.stubEnv('AUTH_REDDIT_SECRET', 'test-reddit-secret');
  vi.stubEnv('AUTH_REDDIT_USER_AGENT', 'web:dune-zone:v1 (by /u/test-developer)');
  vi.stubEnv('CONVEX_SITE_URL', 'https://backend.convex.site');
  vi.stubEnv('SITE_URL', 'https://dune.zone');
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

async function startReddit(t: ReturnType<typeof convexTest>) {
  const signIn = await t.action(api.auth.signIn, { provider: 'reddit', params: { redirectTo: '/' } });
  if (!signIn.redirect) {
    throw new Error('Reddit authorization did not start');
  }
  const start = new URL(signIn.redirect);
  const response = await t.fetch(start.pathname + start.search);
  const destination = new URL(response.headers.get('Location')!);
  return {
    destination,
    cookies: response.headers
      .getSetCookie()
      .map((cookie) => cookie.split(';')[0])
      .join('; '),
  };
}

test('Reddit requests temporary identity access and completes profile creation', async () => {
  const t = convexTest(schema, modules);
  aggregateTest.register(t, 'statistics');
  aggregateTest.register(t, 'profileActivity');
  aggregateTest.register(t, 'profileDiscovery');
  const requests = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
    expect(new Headers(init?.headers).get('User-Agent')).toBe('web:dune-zone:v1 (by /u/test-developer)');
    if (url === 'https://www.reddit.com/api/v1/access_token') {
      return Response.json({ access_token: 'test-access-token', token_type: 'bearer', expires_in: 3600 });
    }
    if (url === 'https://oauth.reddit.com/api/v1/me') {
      return Response.json({ id: 'stable-reddit-id', name: 'Reddit_Player', email: 'ignored@example.com' });
    }
    throw new Error(`Unexpected provider request: ${url}`);
  });
  vi.stubGlobal('fetch', requests);
  const { destination, cookies } = await startReddit(t);
  expect(destination.origin).toBe('https://www.reddit.com');
  expect(destination.searchParams.get('scope')).toBe('identity');
  expect(destination.searchParams.get('duration')).toBe('temporary');
  expect(destination.searchParams.get('redirect_uri')).toBe('https://backend.convex.site/api/auth/callback/reddit');
  const response = await t.fetch(
    `/api/auth/callback/reddit?${new URLSearchParams({ code: 'test-code', state: destination.searchParams.get('state')! })}`,
    { headers: { Cookie: cookies } }
  );
  expect(response.status).toBe(302);
  expect(new URL(response.headers.get('Location')!).searchParams.get('code')).toEqual(expect.any(String));
  const user = await t.run(async (ctx) => {
    const account = await ctx.db
      .query('authAccounts')
      .withIndex('providerAndAccountId', (q) => q.eq('provider', 'reddit').eq('providerAccountId', 'stable-reddit-id'))
      .unique();
    return account ? await ctx.db.get(account.userId) : null;
  });
  expect(user?.name).toBe('Reddit_Player');
  expect(user?.email).toBeUndefined();
});

test('Reddit rejects mismatched state before requesting provider data', async () => {
  const t = convexTest(schema, modules);
  const requests = vi.fn();
  vi.stubGlobal('fetch', requests);
  const { cookies } = await startReddit(t);
  const response = await t.fetch('/api/auth/callback/reddit?code=test-code&state=wrong-state', {
    headers: { Cookie: cookies },
  });
  expect(response.headers.get('Location')).toBe('https://dune.zone/');
  expect(requests).not.toHaveBeenCalled();
});

test('Reddit stays unavailable until credentials and the developer user agent are configured', async () => {
  const t = convexTest(schema, modules);
  expect(await t.query(api.accounts.providers, {})).toContainEqual({ provider: 'reddit', available: true });
  vi.stubEnv('AUTH_REDDIT_USER_AGENT', '');
  expect(await t.query(api.accounts.providers, {})).toContainEqual({ provider: 'reddit', available: false });
});
