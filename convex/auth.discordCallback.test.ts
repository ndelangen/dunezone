/// <reference types="vite/client" />
/* @vitest-environment edge-runtime */

import { generateKeyPairSync } from 'node:crypto';

import { afterEach, beforeEach, describe, expect, test, vi } from 'vite-plus/test';

import { api } from './_generated/api';
import { applicationTest } from './application.test.fixture';
import { applicationTriggers } from './lib/applicationTriggers';

beforeEach(() => {
  /* Keep scheduled avatar and month-long session jobs under this suite's control. */
  vi.useFakeTimers();
  vi.stubEnv('AUTH_DISCORD_ID', 'test-discord-client');
  vi.stubEnv('AUTH_DISCORD_SECRET', 'test-discord-secret');
  vi.stubEnv('CONVEX_SITE_URL', 'https://backend.convex.site');
  vi.stubEnv('SITE_URL', 'https://dune.zone');
});

afterEach(() => {
  vi.clearAllTimers();
  vi.useRealTimers();
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

async function discordCallback(
  issuer: string,
  expectedCallback = 'https://backend.convex.site/api/auth/callback/discord',
  t = applicationTest()
) {
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
  return { response, account, providerFetch, verifier: signIn.verifier, t };
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

  test('a login whose account was deleted starts a new account and leaves the deleted one untouched', async () => {
    vi.stubEnv(
      'JWT_PRIVATE_KEY',
      generateKeyPairSync('rsa', { modulusLength: 2048 }).privateKey.export({ type: 'pkcs8', format: 'pem' }).toString()
    );
    const t = applicationTest();
    const deletedUserId = await t.run(async (raw) => {
      const ctx = applicationTriggers.wrapDB(raw);
      const userId = await ctx.db.insert('users', { name: 'Old name', account_state: 'deleted' });
      await ctx.db.insert('profiles', {
        user_id: userId,
        username: 'Old name',
        slug: 'discord-player',
        avatar_url: null,
        account_state: 'deleted',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      });
      await ctx.db.insert('authAccounts', { userId, provider: 'discord', providerAccountId: '123456789012345678' });
      return userId;
    });
    const { response, account, verifier } = await discordCallback('https://discord.com', undefined, t);
    const code = new URL(response.headers.get('Location')!).searchParams.get('code')!;
    expect(account?.userId).not.toBe(deletedUserId);
    const signedIn = await t.action(api.auth.signIn, { params: { code }, verifier });
    expect(signedIn.tokens?.token).toEqual(expect.any(String));
    await t.run(async (ctx) => {
      expect(await ctx.db.get(deletedUserId)).toMatchObject({ name: 'Old name', account_state: 'deleted' });
      expect(await ctx.db.get(account!.userId)).toMatchObject({ name: 'Discord player' });
      const profile = await ctx.db
        .query('profiles')
        .withIndex('by_user_id', (q) => q.eq('user_id', account!.userId))
        .unique();
      expect(profile).toMatchObject({ username: 'Discord player', account_state: 'active' });
      expect(profile?.slug).not.toBe('discord-player');
    });
  });
});
