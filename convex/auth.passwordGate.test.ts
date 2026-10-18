/// <reference types="vite/client" />
/* @vitest-environment edge-runtime */

import { afterEach, expect, test, vi } from 'vite-plus/test';

import { api } from './_generated/api';
import { accountsBackend, stubIsolatedBackend, syntheticAccount } from './syntheticAccounts.test.fixture';

/* `convex/auth.ts` picks its providers when it loads, so each backend loads it afresh. */
afterEach(() => {
  vi.unstubAllEnvs();
  vi.resetModules();
});

const signUp = () => ({ provider: 'password', params: { flow: 'signUp', ...syntheticAccount('gate') } });

test('the test password sign-in stays off on a hosted backend even with its variable set', async () => {
  stubIsolatedBackend();
  vi.stubEnv('CONVEX_CLOUD_URL', 'https://example-deployment.convex.cloud');
  vi.stubEnv('SITE_URL', 'https://dune.zone');
  await expect(accountsBackend().action(api.auth.signIn, signUp())).rejects.toThrow('not configured');
});

test('the test password sign-in works on an isolated loopback backend', async () => {
  stubIsolatedBackend();
  await expect(accountsBackend().action(api.auth.signIn, signUp())).resolves.toMatchObject({
    tokens: { token: expect.any(String) },
  });
});
