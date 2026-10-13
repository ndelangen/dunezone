/// <reference types="vite/client" />
/* @vitest-environment edge-runtime */

import { convexTest } from 'convex-test';
import { afterEach, expect, test, vi } from 'vitest';

import schema from './schema';

const modules = import.meta.glob('./**/*.ts');

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

test.each(['google', 'discord'])('%s cancellation is a safe routing probe through Convex Auth', async (provider) => {
  vi.stubEnv('AUTH_GOOGLE_ID', 'test-google-client');
  vi.stubEnv('AUTH_GOOGLE_SECRET', 'test-google-secret');
  vi.stubEnv('AUTH_DISCORD_ID', 'test-discord-client');
  vi.stubEnv('AUTH_DISCORD_SECRET', 'test-discord-secret');
  vi.stubEnv('CONVEX_SITE_URL', 'https://backend.convex.site');
  vi.stubEnv('SITE_URL', 'https://dune.zone');
  const providerFetch = vi.fn(async () =>
    Response.json({
      issuer: 'https://accounts.google.com',
      authorization_endpoint: 'https://accounts.google.com/o/oauth2/v2/auth',
      token_endpoint: 'https://oauth2.googleapis.com/token',
      userinfo_endpoint: 'https://openidconnect.googleapis.com/v1/userinfo',
    })
  );
  vi.stubGlobal('fetch', providerFetch);

  const t = convexTest(schema, modules);
  const response = await t.fetch(`/api/auth/callback/${provider}?error=access_denied`);
  expect(response.status).toBe(302);
  expect(new URL(response.headers.get('Location')!).href).toBe('https://dune.zone/');
  expect(providerFetch.mock.calls).toHaveLength(provider === 'google' ? 1 : 0);
  expect(
    await t.run((ctx) =>
      Promise.all([
        ctx.db.query('users').first(),
        ctx.db.query('authAccounts').first(),
        ctx.db.query('authSessions').first(),
      ])
    )
  ).toEqual([null, null, null]);
});
