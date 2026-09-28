/// <reference types="vite/client" />
// @vitest-environment edge-runtime

import rateLimiterTest from '@convex-dev/rate-limiter/test';
import { convexTest } from 'convex-test';
import { afterEach, expect, test, vi } from 'vitest';

import { api, internal } from './_generated/api';
import schema from './schema';

const modules = import.meta.glob('./**/*.ts');
afterEach(() => {
  vi.unstubAllEnvs();
});

test('a load profile is selected by trusted provisioning only on a synthetic backend', async () => {
  const t = convexTest(schema, modules);
  rateLimiterTest.register(t);
  vi.stubEnv('IS_TEST', 'true');
  vi.stubEnv('E2E_LOCAL_AUTH', 'true');
  vi.stubEnv('CONVEX_CLOUD_URL', 'http://127.0.0.1:3210');
  vi.stubEnv('SITE_URL', 'http://127.0.0.1:8787');
  const fixture = await t.mutation(internal.playTesting.createFixture, { loadProfile: 'stacked' });
  const credentials = { gameId: fixture.gameId, secret: fixture.secret, attemptId: fixture.attemptId };
  expect(await t.mutation(api.playProvisioning.validateProvisioning, credentials)).toMatchObject({
    ok: true,
    loadProfile: 'stacked',
  });
  expect(
    await t.mutation(api.playProvisioning.validateProvisioning, { ...credentials, secret: 'a'.repeat(64) })
  ).toEqual({ ok: false });
  vi.stubEnv('SITE_URL', 'https://dune.zone');
  await expect(t.mutation(api.playProvisioning.validateProvisioning, credentials)).rejects.toThrow('isolated loopback');
  await expect(t.mutation(internal.playTesting.createFixture, { loadProfile: 'separated' })).rejects.toThrow(
    'isolated loopback'
  );
});
