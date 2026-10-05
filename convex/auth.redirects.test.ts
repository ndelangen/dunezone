/// <reference types="vite/client" />
// @vitest-environment edge-runtime

import { convexTest } from 'convex-test';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';

import schema from './schema';

const modules = import.meta.glob('./**/*.ts');

beforeEach(() => {
  vi.stubEnv('AUTH_DISCORD_ID', 'test-discord-client');
  vi.stubEnv('AUTH_DISCORD_SECRET', 'test-discord-secret');
  vi.stubEnv('CONVEX_SITE_URL', 'https://backend.convex.site');
  vi.stubEnv('SITE_URL', 'https://dune.zone');
});

afterEach(() => {
  vi.unstubAllEnvs();
});

async function callback(redirectTo: string) {
  const t = convexTest(schema, modules);
  /* An unsuccessful provider callback still uses the same redirect boundary as a completed sign-in. */
  return await t.fetch('/api/auth/callback/discord?error=access_denied', {
    headers: { Cookie: `__Host-discordRedirectTo=${encodeURIComponent(redirectTo)}` },
  });
}

describe('sign-in destinations', () => {
  test.each([
    'https://dune.zone.evil.example/collect',
    'https://dune.zone@evil.example/collect',
    '//evil.example/collect',
    '/\\evil.example/collect',
    'https://dune.zone:8443/collect',
    'http://dune.zone/collect',
    'javascript:alert(1)',
    'https://[invalid',
  ])('keeps the callback on the site for %s', async (destination) => {
    const response = await callback(destination);
    expect(response.status).toBe(302);
    expect(response.headers.get('Location')).toBe('https://dune.zone/');
  });

  test.each(['/factions?sort=recent#list', 'https://dune.zone/factions?sort=recent#list'])(
    'preserves the same-origin destination %s',
    async (destination) => {
      expect((await callback(destination)).headers.get('Location')).toBe('https://dune.zone/factions?sort=recent#list');
    }
  );

  test('supports the local sign-in destination', async () => {
    vi.stubEnv('SITE_URL', 'http://127.0.0.1:3000');
    expect((await callback('/factions')).headers.get('Location')).toBe('http://127.0.0.1:3000/factions');
  });

  test('refuses to redirect without a configured site', async () => {
    vi.stubEnv('SITE_URL', undefined);
    await expect(callback('//evil.example')).rejects.toThrow('SITE_URL');
  });
});
