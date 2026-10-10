/// <reference types="vite/client" />
/* @vitest-environment edge-runtime */
import { convexTest } from 'convex-test';
import { afterEach, beforeEach, expect, test, vi } from 'vitest';

import { api, internal } from './_generated/api';
import { scheduleSessionExpiry } from './lib/authSessionLifecycle';
import schema from './schema';

const modules = import.meta.glob('./**/*.ts');
beforeEach(() => {
  vi.useFakeTimers();
  vi.stubEnv('IS_TEST', 'true');
  vi.stubEnv('E2E_LOCAL_AUTH', 'true');
  vi.stubEnv('CONVEX_CLOUD_URL', 'http://127.0.0.1:3210');
  vi.stubEnv('SITE_URL', 'http://127.0.0.1:8787');
});
afterEach(() => {
  vi.clearAllTimers();
  vi.useRealTimers();
  vi.unstubAllEnvs();
});

test('fixture reset ignores completed jobs and preserves retained session expiry', async () => {
  const t = convexTest(schema, modules);
  const rows = await t.run(async (ctx) => {
    const userId = await ctx.db.insert('users', { account_state: 'active' });
    const sessionId = await ctx.db.insert('authSessions', { userId, expirationTime: Date.now() + 1000 });
    await ctx.db.insert('authRefreshTokens', { sessionId, expirationTime: Date.now() + 1000 });
    await scheduleSessionExpiry(ctx, (await ctx.db.get(sessionId))!);
    const connectionId = await ctx.db.insert('account_connections', {
      digest: 'disposable-reset',
      user_id: userId,
      session_id: sessionId,
      provider: 'google',
      state: 'pending',
      expires_at: Date.now() + 500,
    });
    const completedId = await ctx.scheduler.runAfter(0, internal.accounts.expireConnection, { connectionId });
    const pendingId = await ctx.scheduler.runAfter(500, internal.accounts.expireConnection, { connectionId });
    return { sessionId, completedId, pendingId };
  });
  vi.advanceTimersByTime(0);
  await t.finishInProgressScheduledFunctions();
  await t.mutation(api.e2e.clearAll, {});
  expect(await t.run((ctx) => ctx.db.get(rows.sessionId))).not.toBeNull();
  expect((await t.run((ctx) => ctx.db.system.get(rows.completedId)))?.state.kind).toBe('success');
  expect((await t.run((ctx) => ctx.db.system.get(rows.pendingId)))?.state.kind).toBe('canceled');
  vi.advanceTimersByTime(1000);
  await t.finishInProgressScheduledFunctions();
  expect(await t.run((ctx) => ctx.db.get(rows.sessionId))).toBeNull();
});
