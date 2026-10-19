/// <reference types="vite/client" />
/* @vitest-environment edge-runtime */

import { afterEach, beforeEach, expect, test, vi } from 'vite-plus/test';

import { api } from './_generated/api';
import { accountsBackend, stubIsolatedBackend, syntheticAccount } from './syntheticAccounts.test.fixture';

/* Auth queues month-long session expiry jobs, which exceed Node's timer limit. */
beforeEach(() => vi.useFakeTimers());

/* `convex/auth.ts` picks its providers when it loads, so each backend loads it afresh. */
afterEach(() => {
  vi.clearAllTimers();
  vi.useRealTimers();
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
  const t = accountsBackend();
  await expect(t.action(api.auth.signIn, signUp())).resolves.toMatchObject({
    tokens: { token: expect.any(String) },
  });

  vi.advanceTimersByTime(0);
  await t.finishInProgressScheduledFunctions();
  const session = await t.run((ctx) => ctx.db.query('authSessions').unique());
  expect(session?.expirationTime).toBe(Date.now() + 30 * 24 * 60 * 60 * 1000);
  expect(session?.expiry_job_id).toBeDefined();
  const deadline = await t.run((ctx) => ctx.db.system.get(session!.expiry_job_id!));
  expect(deadline).toMatchObject({ scheduledTime: session!.expirationTime, state: { kind: 'pending' } });

  /* Move the clock without running millions of bounded timer callbacks. */
  vi.setSystemTime(session!.expirationTime - 2);
  vi.advanceTimersByTime(1);
  await t.finishInProgressScheduledFunctions();
  expect(await t.run((ctx) => ctx.db.get(session!._id))).not.toBeNull();
  vi.advanceTimersByTime(1);
  await t.finishInProgressScheduledFunctions();
  expect(await t.run((ctx) => ctx.db.get(session!._id))).toBeNull();
});
