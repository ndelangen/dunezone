/// <reference types="vite/client" />
/* @vitest-environment edge-runtime */
import migrationsTest from '@convex-dev/migrations/test';
import { convexTest } from 'convex-test';
import { afterEach, beforeEach, expect, test, vi } from 'vitest';

import { internal } from './_generated/api';
import { revokeAccountSessions } from './lib/authSessionLifecycle';
import schema from './schema';

const modules = import.meta.glob('./**/*.ts');
function setup() {
  const t = convexTest(schema, modules);
  migrationsTest.register(t);
  return t;
}
async function seed(t: ReturnType<typeof setup>, count = 1) {
  return t.run(async (ctx) => {
    const userId = await ctx.db.insert('users', { account_state: 'active' });
    const sessions = [];
    for (let i = 0; i < count; i++) {
      const sessionId = await ctx.db.insert('authSessions', { userId, expirationTime: Date.now() + 10_000 });
      const tokenId = await ctx.db.insert('authRefreshTokens', { sessionId, expirationTime: Date.now() + 1000 });
      sessions.push({ sessionId, tokenId });
    }
    return { userId, sessions };
  });
}
async function ready(t: ReturnType<typeof setup>) {
  for (let i = 0; i < 10; i++) {
    vi.advanceTimersByTime(0);
    await t.finishInProgressScheduledFunctions();
    const pending = await t.run(async (ctx) =>
      (await ctx.db.system.query('_scheduled_functions').collect()).some(
        (job) => job.state.kind === 'pending' && job.scheduledTime <= Date.now()
      )
    );
    if (!pending) {
      return;
    }
  }
  throw new Error('Ready jobs did not drain');
}
beforeEach(() => vi.useFakeTimers());
afterEach(() => {
  vi.clearAllTimers();
  vi.useRealTimers();
  vi.unstubAllEnvs();
});

test('overlapping registration drains bounded pages and creates one deadline per session', async () => {
  const t = setup();
  const account = await seed(t, 19);
  const args = { userId: account.userId, since: 0, cursor: null };
  await t.mutation(internal.authSessions.registerNew, args);
  await t.mutation(internal.authSessions.registerNew, args);
  await ready(t);
  const jobs = await t.run((ctx) => ctx.db.system.query('_scheduled_functions').collect());
  expect(jobs.filter((job) => job.state.kind === 'pending')).toHaveLength(19);
  vi.advanceTimersByTime(1000);
  await ready(t);
  expect(await t.run((ctx) => ctx.db.query('authSessions').collect())).toHaveLength(0);
  expect(await t.run((ctx) => ctx.db.query('authRefreshTokens').collect())).toHaveLength(0);
});

test('rotation before idle expiry preserves the session until its new deadline', async () => {
  const t = setup();
  const account = await seed(t);
  const session = account.sessions[0]!;
  await t.mutation(internal.authSessions.registerNew, { userId: account.userId, since: 0, cursor: null });
  vi.advanceTimersByTime(999);
  await t.run(async (ctx) => {
    await ctx.db.patch(session.tokenId, { firstUsedTime: Date.now() });
    await ctx.db.insert('authRefreshTokens', { sessionId: session.sessionId, expirationTime: Date.now() + 2000 });
  });
  vi.advanceTimersByTime(1);
  await ready(t);
  expect(await t.run((ctx) => ctx.db.get(session.sessionId))).not.toBeNull();
  vi.advanceTimersByTime(1999);
  await ready(t);
  expect(await t.run((ctx) => ctx.db.get(session.sessionId))).toBeNull();
});

test('explicit revocation cancels a replacement deadline and drains credentials', async () => {
  const t = setup();
  const account = await seed(t);
  const session = account.sessions[0]!;
  await t.mutation(internal.authSessions.registerNew, { userId: account.userId, since: 0, cursor: null });
  await t.run((ctx) => ctx.db.patch(session.tokenId, { expirationTime: Date.now() + 5000 }));
  vi.advanceTimersByTime(1000);
  await ready(t);
  await t.run((ctx) => revokeAccountSessions(ctx, account.userId));
  expect(await t.run((ctx) => ctx.db.get(session.sessionId))).toBeNull();
  expect(await t.run((ctx) => ctx.db.query('authRefreshTokens').collect())).toHaveLength(0);
  expect(
    (await t.run((ctx) => ctx.db.system.query('_scheduled_functions').collect())).filter(
      (job) => job.state.kind === 'pending'
    )
  ).toHaveLength(0);
});

test('deletion before registration and before an old callback is harmless', async () => {
  const t = setup();
  const account = await seed(t);
  const session = account.sessions[0]!;
  await t.run(async (ctx) => {
    await ctx.db.delete(session.tokenId);
    await ctx.db.delete(session.sessionId);
  });
  await t.mutation(internal.authSessions.registerNew, { userId: account.userId, since: 0, cursor: null });
  await t.mutation(internal.authSessions.expireOne, { sessionId: session.sessionId });
  expect(await t.run((ctx) => ctx.db.system.query('_scheduled_functions').collect())).toHaveLength(0);
});

test('backfill deletes expired sessions and registers live sessions once', async () => {
  const t = setup();
  const account = await seed(t, 2);
  await t.run((ctx) => ctx.db.patch(account.sessions[0]!.sessionId, { expirationTime: Date.now() - 1 }));
  await t.mutation(internal.migrations.auth_session_expiry_jobs_v1, {});
  await t.mutation(internal.migrations.auth_session_expiry_jobs_v1, { reset: true });
  expect(await t.run((ctx) => ctx.db.get(account.sessions[0]!.sessionId))).toBeNull();
  expect(await t.run((ctx) => ctx.db.get(account.sessions[1]!.sessionId))).not.toBeNull();
  expect(
    (await t.run((ctx) => ctx.db.system.query('_scheduled_functions').collect())).filter(
      (job) => job.state.kind === 'pending'
    )
  ).toHaveLength(1);
});

test('the library creates tokens before bootstrap registers its configured idle deadline', async () => {
  const t = setup();
  const account = await seed(t, 0);
  vi.stubEnv('AUTH_SESSION_TOTAL_DURATION_MS', '10000');
  vi.stubEnv('AUTH_SESSION_INACTIVE_DURATION_MS', '1000');
  vi.stubEnv('CONVEX_SITE_URL', 'https://test.convex.site');
  const keyPair = await crypto.subtle.generateKey(
    { name: 'RSASSA-PKCS1-v1_5', modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: 'SHA-256' },
    true,
    ['sign', 'verify']
  );
  const privateBytes = new Uint8Array(await crypto.subtle.exportKey('pkcs8', keyPair.privateKey));
  vi.stubEnv(
    'JWT_PRIVATE_KEY',
    `-----BEGIN PRIVATE KEY-----\n${btoa(String.fromCharCode(...privateBytes))}\n-----END PRIVATE KEY-----`
  );
  const signedIn = await t.mutation(internal.auth.store, {
    args: { type: 'signIn', userId: account.userId, generateTokens: true },
  });
  expect(signedIn).toMatchObject({ tokens: { token: expect.any(String) } });
  await ready(t);
  const session = await t.run((ctx) => ctx.db.query('authSessions').first());
  expect(session?.expiry_job_id).toBeDefined();
  vi.advanceTimersByTime(1000);
  await ready(t);
  expect(await t.run((ctx) => ctx.db.query('authSessions').collect())).toHaveLength(0);
});
