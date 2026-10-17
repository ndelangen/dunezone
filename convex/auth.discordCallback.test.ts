/// <reference types="vite/client" />
/* @vitest-environment edge-runtime */

import { afterEach, beforeEach, describe, expect, test, vi } from 'vite-plus/test';

import { api } from './_generated/api';
import { applicationTest } from './application.test.fixture';

beforeEach(() => {
  vi.stubEnv('AUTH_DISCORD_ID', 'test-discord-client');
  vi.stubEnv('AUTH_DISCORD_SECRET', 'test-discord-secret');
  vi.stubEnv('CONVEX_SITE_URL', 'https://backend.convex.site');
  vi.stubEnv('SITE_URL', 'https://dune.zone');
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

async function discordCallback(
  issuer: string,
  expectedCallback = 'https://backend.convex.site/api/auth/callback/discord'
) {
  const t = applicationTest();
  const providerFetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
    if (url === 'https://discord.com/api/oauth2/token') {
      expect(new URLSearchParams(init?.body as string).get('redirect_uri')).toBe(expectedCallback);
      return Response.json({ access_token: 'test-access-token', token_type: 'Bearer', expires_in: 3600 });
    }
    if (url === 'https://discord.com/api/users/@me') {
      return Response.json({ id: '123456789012345678', username: 'Discord player', discriminator: '0', avatar: null });
    }
    throw new Error(`Unexpected provider request: ${url}`);
  });
  vi.stubGlobal('fetch', providerFetch);

  const signIn = await t.action(api.auth.signIn, { provider: 'discord', params: { redirectTo: '/' } });
  if (!signIn.redirect) {
    throw new Error('Discord sign-in did not start authorization');
  }
  const signInUrl = new URL(signIn.redirect);
  const authorization = await t.fetch(signInUrl.pathname.replace(/^\/auth\//, '/api/auth/') + signInUrl.search);
  const cookies = authorization.headers
    .getSetCookie()
    .map((cookie) => cookie.split(';')[0])
    .join('; ');
  const response = await t.fetch(
    `/api/auth/callback/discord?${new URLSearchParams({ code: 'test-code', iss: issuer })}`,
    {
      headers: { Cookie: cookies },
    }
  );
  const account = await t.run((ctx) =>
    ctx.db
      .query('authAccounts')
      .withIndex('providerAndAccountId', (q) =>
        q.eq('provider', 'discord').eq('providerAccountId', '123456789012345678')
      )
      .unique()
  );
  return { response, account, providerFetch };
}

describe('Discord authorization callback', () => {
  test('accepts the published issuer and completes account creation', async () => {
    const { response, account } = await discordCallback('https://discord.com');
    expect(response.status).toBe(302);
    const destination = new URL(response.headers.get('Location')!);
    expect(destination.origin).toBe('https://dune.zone');
    expect(destination.searchParams.get('code')).toEqual(expect.any(String));
    expect(account?.provider).toBe('discord');
  });

  test('exchanges the provider code with the dune.zone callback after the public URL switch', async () => {
    vi.stubEnv('CUSTOM_AUTH_SITE_URL', 'https://dune.zone');
    vi.stubEnv('CUSTOM_AUTH_PATH', '/auth');
    const { response, account } = await discordCallback(
      'https://discord.com',
      'https://dune.zone/auth/callback/discord'
    );
    expect(response.status).toBe(302);
    expect(account?.provider).toBe('discord');
  });

  test('rejects a different issuer before exchanging the authorization code', async () => {
    const { response, account, providerFetch } = await discordCallback('https://wrong.example');
    expect(response.headers.get('Location')).toBe('https://dune.zone/');
    expect(account).toBeNull();
    expect(providerFetch).not.toHaveBeenCalled();
  });
});
