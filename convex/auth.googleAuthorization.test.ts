/// <reference types="vite/client" />
/* @vitest-environment edge-runtime */

import { convexTest } from 'convex-test';
import { afterEach, expect, test, vi } from 'vitest';

import { api } from './_generated/api';
import schema from './schema';

const modules = import.meta.glob('./**/*.ts');

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

test('Google sign-in requests only identity permissions', async () => {
  vi.stubEnv('AUTH_GOOGLE_ID', 'test-google-client');
  vi.stubEnv('AUTH_GOOGLE_SECRET', 'test-google-secret');
  vi.stubEnv('CONVEX_SITE_URL', 'https://backend.convex.site');
  vi.stubEnv('SITE_URL', 'https://dune.zone');
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: RequestInfo | URL) => {
      const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
      if (url !== 'https://accounts.google.com/.well-known/openid-configuration') {
        throw new Error(`Unexpected provider request: ${url}`);
      }
      return Response.json({
        issuer: 'https://accounts.google.com',
        authorization_endpoint: 'https://accounts.google.com/o/oauth2/v2/auth',
        token_endpoint: 'https://oauth2.googleapis.com/token',
        userinfo_endpoint: 'https://openidconnect.googleapis.com/v1/userinfo',
      });
    })
  );

  const t = convexTest(schema, modules);
  const signIn = await t.action(api.auth.signIn, { provider: 'google', params: { redirectTo: '/' } });
  if (!signIn.redirect) {
    throw new Error('Google sign-in did not start authorization');
  }
  const signInUrl = new URL(signIn.redirect);
  const response = await t.fetch(signInUrl.pathname + signInUrl.search);
  expect(response.status).toBe(302);
  const destination = new URL(response.headers.get('Location')!);
  expect(destination.origin).toBe('https://accounts.google.com');
  expect(destination.searchParams.get('scope')?.split(' ').sort()).toEqual(['openid', 'profile']);
});
