/// <reference types="vite/client" />
/* @vitest-environment edge-runtime */

import { generateKeyPairSync } from 'node:crypto';

import { afterEach, beforeEach, describe, expect, test, vi } from 'vite-plus/test';

import { steamAssertionFrom, steamSignInUrl } from '../src/shared/steamOpenId';
import { api } from './_generated/api';
import { applicationTest } from './application.test.fixture';
import { applicationTriggers } from './lib/applicationTriggers';

const STEAM_ID = '76561197960287930';
const NOW = Date.parse('2026-11-08T18:30:00Z');

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(NOW);
  vi.stubEnv('SITE_URL', 'https://dune.zone');
  vi.stubEnv('CONVEX_SITE_URL', 'https://backend.convex.site');
  vi.stubEnv(
    'JWT_PRIVATE_KEY',
    generateKeyPairSync('rsa', { modulusLength: 2048 }).privateKey.export({ type: 'pkcs8', format: 'pem' }).toString()
  );
});

afterEach(() => {
  vi.clearAllTimers();
  vi.useRealTimers();
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

/** What Steam puts on the return address after a successful sign-in. */
function steamAssertion(overrides: Record<string, string> = {}) {
  const returnTo = new URL(
    steamSignInUrl(new URL('https://dune.zone'), 'tab-state').searchParams.get('openid.return_to')!
  );
  const claimed = `https://steamcommunity.com/openid/id/${STEAM_ID}`;
  returnTo.search = new URLSearchParams({
    ...Object.fromEntries(returnTo.searchParams),
    'openid.ns': 'http://specs.openid.net/auth/2.0',
    'openid.mode': 'id_res',
    'openid.op_endpoint': 'https://steamcommunity.com/openid/login',
    'openid.claimed_id': claimed,
    'openid.identity': claimed,
    'openid.return_to': `https://dune.zone/auth/steam?state=tab-state`,
    'openid.response_nonce': '2026-11-08T18:29:40Zabc123',
    'openid.assoc_handle': '1234567890',
    'openid.signed': 'signed,op_endpoint,claimed_id,identity,return_to,response_nonce,assoc_handle',
    'openid.sig': 'c2lnbmF0dXJl',
    ...overrides,
  }).toString();
  return steamAssertionFrom(returnTo.searchParams);
}

function stubSteam({
  valid = true,
  player = { personaname: 'Steam player', avatarfull: 'https://avatars.steamstatic.com/a_full.jpg' },
} = {}) {
  const steamFetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(typeof input === 'string' ? input : input instanceof URL ? input.href : input.url);
    if (url.href === 'https://steamcommunity.com/openid/login') {
      const body = new URLSearchParams(init?.body as string);
      expect(body.get('openid.mode')).toBe('check_authentication');
      expect(body.get('openid.sig')).toBe('c2lnbmF0dXJl');
      return new Response(`ns:http://specs.openid.net/auth/2.0\nis_valid:${valid}\n`);
    }
    if (url.origin + url.pathname === 'https://api.steampowered.com/ISteamUser/GetPlayerSummaries/v2/') {
      expect(url.searchParams.get('steamids')).toBe(STEAM_ID);
      return Response.json({ response: { players: [player] } });
    }
    throw new Error(`Unexpected request: ${url}`);
  });
  vi.stubGlobal('fetch', steamFetch);
  return steamFetch;
}

async function lookupOutcome(t: ReturnType<typeof applicationTest>) {
  return await t.run(
    async (ctx) =>
      (
        await ctx.db
          .query('steam_profile_lookups')
          .withIndex('by_steam_id', (q) => q.eq('steam_id', STEAM_ID))
          .unique()
      )?.outcome
  );
}

async function steamAccount(t: ReturnType<typeof applicationTest>) {
  return await t.run((ctx) =>
    ctx.db
      .query('authAccounts')
      .withIndex('providerAndAccountId', (q) => q.eq('provider', 'steam').eq('providerAccountId', STEAM_ID))
      .unique()
  );
}

describe('Steam sign-in', () => {
  test('is offered once the site address is configured', async () => {
    const t = applicationTest();
    expect(await t.query(api.accounts.providers, {})).toContainEqual({ provider: 'steam', available: true });
  });

  test('a confirmed assertion creates an account named after the Steam profile', async () => {
    vi.stubEnv('STEAM_WEB_API_KEY', 'test-key');
    stubSteam();
    const t = applicationTest();
    const signedIn = await t.action(api.auth.signIn, { provider: 'steam', params: steamAssertion() });
    expect(signedIn.tokens?.token).toEqual(expect.any(String));
    const account = await steamAccount(t);
    await t.run(async (ctx) => {
      expect(await ctx.db.get(account!.userId)).toMatchObject({
        name: 'Steam player',
        image: 'https://avatars.steamstatic.com/a_full.jpg',
      });
      const profile = await ctx.db
        .query('profiles')
        .withIndex('by_user_id', (q) => q.eq('user_id', account!.userId))
        .unique();
      expect(profile).toMatchObject({ username: 'Steam player', account_state: 'active' });
    });
  });

  test('signs in without a profile when no Web API key is configured', async () => {
    vi.stubEnv('STEAM_WEB_API_KEY', '');
    const steamFetch = stubSteam();
    const t = applicationTest();
    const params = steamAssertion();
    const signedIn = await t.action(api.auth.signIn, { provider: 'steam', params });
    expect(signedIn.tokens?.token).toEqual(expect.any(String));
    expect(steamFetch).toHaveBeenCalledTimes(1);
    /* Steam is asked about exactly the assertion it sent, with only the mode changed. */
    const checked = new URLSearchParams(steamFetch.mock.calls[0]![1]?.body as string);
    for (const [key, value] of Object.entries(params)) {
      expect(checked.get(key)).toBe(key === 'openid.mode' ? 'check_authentication' : value);
    }
    expect(await steamAccount(t)).not.toBeNull();
  });

  test('the same assertion cannot sign in twice', async () => {
    stubSteam();
    const t = applicationTest();
    const params = steamAssertion();
    await t.action(api.auth.signIn, { provider: 'steam', params });
    const replay = await t.action(api.auth.signIn, { provider: 'steam', params });
    expect(replay.tokens).toBeFalsy();
  });

  test('a second sign-in returns to the same account', async () => {
    stubSteam();
    const t = applicationTest();
    await t.action(api.auth.signIn, { provider: 'steam', params: steamAssertion() });
    const first = await steamAccount(t);
    const signedIn = await t.action(api.auth.signIn, {
      provider: 'steam',
      params: steamAssertion({ 'openid.response_nonce': '2026-11-08T18:29:50Zdef456' }),
    });
    expect(signedIn.tokens?.token).toEqual(expect.any(String));
    expect((await steamAccount(t))!.userId).toBe(first!.userId);
  });

  test('the next sign-in replaces a failed lookup outcome with its latest result', async () => {
    vi.stubEnv('STEAM_WEB_API_KEY', 'test-key');
    const steamFetch = stubSteam();
    const steam = steamFetch.getMockImplementation()!;
    steamFetch.mockImplementation(async (input, init) =>
      String(input instanceof Request ? input.url : input).startsWith('https://api.steampowered.com/')
        ? new Response('Forbidden', { status: 403 })
        : steam(input, init)
    );
    const t = applicationTest();
    const signedIn = await t.action(api.auth.signIn, { provider: 'steam', params: steamAssertion() });
    expect(signedIn.tokens?.token).toEqual(expect.any(String));
    expect(await lookupOutcome(t)).toBe('failed with HTTP 403');
    stubSteam();
    await t.action(api.auth.signIn, {
      provider: 'steam',
      params: steamAssertion({ 'openid.response_nonce': '2026-11-08T18:29:50Zdef456' }),
    });
    expect(await lookupOutcome(t)).toBe('ok');
  });

  test('reports a name without a usable avatar as an incomplete lookup', async () => {
    vi.stubEnv('STEAM_WEB_API_KEY', 'test-key');
    stubSteam({ player: { personaname: 'Steam player', avatarfull: 'http://unsafe.example/avatar.jpg' } });
    const t = applicationTest();
    const signedIn = await t.action(api.auth.signIn, { provider: 'steam', params: steamAssertion() });
    expect(signedIn.tokens?.token).toEqual(expect.any(String));
    expect(await lookupOutcome(t)).toBe('returned a player without a usable avatar');
  });

  test('records why the profile lookup failed without storing request details', async () => {
    vi.stubEnv('STEAM_WEB_API_KEY', 'secret key');
    const steamFetch = stubSteam();
    const t = applicationTest();
    const steam = steamFetch.getMockImplementation()!;
    steamFetch.mockImplementation(async (input, init) => {
      const url = String(input instanceof Request ? input.url : input);
      if (url.startsWith('https://api.steampowered.com/')) {
        throw new TypeError(`could not reach ${url}`);
      }
      return steam(input, init);
    });
    await t.action(api.auth.signIn, { provider: 'steam', params: steamAssertion() });
    const outcome = await lookupOutcome(t);
    expect(outcome).toBe('failed: TypeError');
    expect(outcome).not.toContain('secret');
  });

  test('stops asking Steam once the check budget is spent', async () => {
    const steamFetch = stubSteam({ valid: false });
    const t = applicationTest();
    for (let attempt = 0; attempt < 31; attempt++) {
      const nonce = `2026-11-08T18:29:40Zforged${attempt}`;
      await t.action(api.auth.signIn, {
        provider: 'steam',
        params: steamAssertion({ 'openid.response_nonce': nonce }),
      });
    }
    expect(steamFetch).toHaveBeenCalledTimes(30);
  });

  test('refuses an assertion Steam does not confirm', async () => {
    stubSteam({ valid: false });
    const t = applicationTest();
    const result = await t.action(api.auth.signIn, { provider: 'steam', params: steamAssertion() });
    expect(result.tokens).toBeFalsy();
    expect(await steamAccount(t)).toBeNull();
  });

  test.each([
    ['another site', { 'openid.return_to': 'https://evil.example/auth/steam?state=x' }],
    ['another return page', { 'openid.return_to': 'https://dune.zone/somewhere' }],
    ['another provider', { 'openid.op_endpoint': 'https://evil.example/openid/login' }],
    ['a stale assertion', { 'openid.response_nonce': '2026-11-08T18:10:00Zold' }],
    ['a mismatched identity', { 'openid.identity': 'https://steamcommunity.com/openid/id/76561197960287931' }],
    [
      'an unsigned return address',
      { 'openid.signed': 'signed,op_endpoint,claimed_id,identity,response_nonce,assoc_handle' },
    ],
  ])('refuses %s without asking Steam', async (_name, overrides) => {
    const steamFetch = stubSteam();
    const t = applicationTest();
    const result = await t.action(api.auth.signIn, { provider: 'steam', params: steamAssertion(overrides) });
    expect(result.tokens).toBeFalsy();
    expect(steamFetch).not.toHaveBeenCalled();
  });

  test('a login whose account was deleted starts a new account', async () => {
    vi.stubEnv('STEAM_WEB_API_KEY', 'test-key');
    stubSteam();
    const t = applicationTest();
    const deletedUserId = await t.run(async (raw) => {
      const ctx = applicationTriggers.wrapDB(raw);
      const userId = await ctx.db.insert('users', { name: 'Old name', account_state: 'deleted' });
      await ctx.db.insert('authAccounts', { userId, provider: 'steam', providerAccountId: STEAM_ID });
      return userId;
    });
    const signedIn = await t.action(api.auth.signIn, { provider: 'steam', params: steamAssertion() });
    expect(signedIn.tokens?.token).toEqual(expect.any(String));
    const account = await steamAccount(t);
    expect(account!.userId).not.toBe(deletedUserId);
    await t.run(async (ctx) => {
      expect(await ctx.db.get(deletedUserId)).toMatchObject({ account_state: 'deleted' });
      const profile = await ctx.db
        .query('profiles')
        .withIndex('by_user_id', (q) => q.eq('user_id', account!.userId))
        .unique();
      expect(profile).toMatchObject({
        username: 'Steam player',
        avatar_url: 'https://avatars.steamstatic.com/a_full.jpg',
      });
    });
  });
});
