/// <reference types="vite/client" />
// @vitest-environment edge-runtime
import aggregateTest from '@convex-dev/aggregate/test';
import rateLimiterTest from '@convex-dev/rate-limiter/test';
import { convexTest } from 'convex-test';
import { afterEach, beforeEach, expect, test, vi } from 'vitest';

import { api, internal } from './_generated/api';
import { applicationTriggers } from './lib/applicationTriggers';
import schema from './schema';

const modules = import.meta.glob('./**/*.ts');
function setup() {
  const t = convexTest(schema, modules);
  for (const name of ['statistics', 'profileDiscovery', 'profileActivity']) {
    aggregateTest.register(t, name);
  }
  rateLimiterTest.register(t);
  return t;
}
async function account(
  t: ReturnType<typeof setup>,
  slug: string,
  provider: 'google' | 'discord' | 'reddit',
  admin = false
) {
  return t.run(async (raw) => {
    const ctx = applicationTriggers.wrapDB(raw);
    const userId = await ctx.db.insert('users', { name: slug, account_state: 'active', isAdmin: admin });
    const profileId = await ctx.db.insert('profiles', {
      user_id: userId,
      username: slug,
      slug,
      avatar_url: 'https://example.com/avatar.png',
      account_state: 'active',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    });
    const authId = await ctx.db.insert('authAccounts', { userId, provider, providerAccountId: slug });
    const sessionId = await ctx.db.insert('authSessions', { userId, expirationTime: Date.now() + 3_600_000 });
    await ctx.db.insert('authRefreshTokens', { sessionId, expirationTime: Date.now() + 600_000 });
    return { userId, profileId, authId, sessionId };
  });
}
beforeEach(() => {
  vi.useFakeTimers();
  vi.stubEnv('IS_TEST', 'true');
  vi.stubEnv('E2E_LOCAL_AUTH', 'true');
  vi.stubEnv('CONVEX_CLOUD_URL', 'http://127.0.0.1:3210');
  vi.stubEnv('SITE_URL', 'http://127.0.0.1:8787');
  vi.stubEnv('AUTH_GOOGLE_ID', 'test-google');
  vi.stubEnv('AUTH_GOOGLE_SECRET', 'test-google-secret');
  vi.stubEnv('AUTH_DISCORD_ID', 'test-discord');
  vi.stubEnv('AUTH_DISCORD_SECRET', 'test-discord-secret');
});
afterEach(() => {
  vi.clearAllTimers();
  vi.useRealTimers();
  vi.unstubAllEnvs();
});

test.each(['absolute', 'idle'] as const)(
  '%s expiry rejects writes immediately and removes private reads after cleanup',
  async (expiry) => {
    const t = setup();
    const user = await account(t, 'expired-session', 'google');
    const caller = t.withIdentity({ subject: `${user.userId}|${user.sessionId}` });
    await t.run(async (ctx) => {
      if (expiry === 'absolute') {
        await ctx.db.patch(user.sessionId, { expirationTime: Date.now() - 1 });
      } else {
        const refresh = await ctx.db
          .query('authRefreshTokens')
          .withIndex('sessionId', (q) => q.eq('sessionId', user.sessionId))
          .first();
        await ctx.db.patch(refresh!._id, { expirationTime: Date.now() - 1 });
      }
    });
    await expect(
      caller.mutation(api.profiles.updateCurrent, {
        username: 'Rejected',
        avatar_url: 'https://example.com/avatar.png',
      })
    ).rejects.toThrow('Not authenticated');
    await expect(caller.mutation(api.accountDeletion.confirm, { replacementUserId: null })).rejects.toThrow(
      'Not authenticated'
    );
    await t.mutation(internal.authSessions.expireOne, { sessionId: user.sessionId });
    expect((await caller.query(api.profiles.settings, {})).account).toBeNull();
    expect((await t.run((ctx) => ctx.db.get(user.profileId)))?.username).toBe('expired-session');
  }
);

test('sign-out revokes the session for account deletion as well as ordinary writes', async () => {
  const t = setup();
  const user = await account(t, 'signed-out', 'google');
  const caller = t.withIdentity({ subject: `${user.userId}|${user.sessionId}` });
  await caller.action(api.auth.signOut, {});
  await expect(
    caller.mutation(api.profiles.updateCurrent, { username: 'Rejected', avatar_url: 'https://example.com/avatar.png' })
  ).rejects.toThrow('Not authenticated');
  await expect(caller.mutation(api.accountDeletion.confirm, { replacementUserId: null })).rejects.toThrow(
    'Not authenticated'
  );
  expect((await t.run((ctx) => ctx.db.get(user.userId)))?.account_state).toBe('active');
});

test('disconnect revokes all existing sessions and real refreshes before cleanup, while a new session remains usable', async () => {
  const t = setup();
  const user = await account(t, 'disconnect-session', 'google');
  const sessions = await t.run(async (ctx) => {
    await ctx.db.insert('authAccounts', {
      userId: user.userId,
      provider: 'discord',
      providerAccountId: 'disconnect-discord',
    });
    const sessions = [];
    for (let i = 0; i < 17; i++) {
      const id = await ctx.db.insert('authSessions', { userId: user.userId, expirationTime: Date.now() + 3_600_000 });
      const tokenId = await ctx.db.insert('authRefreshTokens', { sessionId: id, expirationTime: Date.now() + 600_000 });
      sessions.push({ id, tokenId });
    }
    return sessions;
  });
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
  vi.stubEnv('CONVEX_SITE_URL', 'https://test.convex.site');
  const owner = t.withIdentity({ subject: `${user.userId}|${user.sessionId}` });
  await owner.mutation(api.accounts.disconnect, { provider: 'discord' });
  const pending = sessions.at(-1)!;
  expect(await t.run((ctx) => ctx.db.get(pending.id))).not.toBeNull();
  const revoked = t.withIdentity({ subject: `${user.userId}|${pending.id}` });
  expect((await revoked.query(api.profiles.settings, {})).account).toBeNull();
  await expect(revoked.mutation(api.accountDeletion.confirm, { replacementUserId: null })).rejects.toThrow(
    'Not authenticated'
  );
  await expect(t.action(api.auth.signIn, { refreshToken: `${pending.tokenId}|${pending.id}` })).rejects.toThrow(
    'Sign in again'
  );
  const removed = sessions[0]!;
  expect((await t.action(api.auth.signIn, { refreshToken: `${removed.tokenId}|${removed.id}` })).tokens).toBeNull();
  vi.advanceTimersByTime(1);
  const fresh = await t.run(async (ctx) => {
    const id = await ctx.db.insert('authSessions', { userId: user.userId, expirationTime: Date.now() + 3_600_000 });
    const tokenId = await ctx.db.insert('authRefreshTokens', { sessionId: id, expirationTime: Date.now() + 600_000 });
    return { id, tokenId };
  });
  await t.finishAllScheduledFunctions(() => vi.runAllTimers());
  expect((await t.action(api.auth.signIn, { refreshToken: `${fresh.tokenId}|${fresh.id}` })).tokens?.token).toEqual(
    expect.any(String)
  );
  const signedIn = t.withIdentity({ subject: `${user.userId}|${fresh.id}` });
  await signedIn.mutation(api.profiles.updateCurrent, {
    username: 'Recovered',
    avatar_url: 'https://example.com/avatar.png',
  });
  await expect(signedIn.mutation(api.accounts.disconnect, { provider: 'google' })).rejects.toThrow('Keep at least one');
  await t.run(async (ctx) => {
    expect(await ctx.db.get(fresh.id)).not.toBeNull();
    expect(
      await ctx.db
        .query('authSessions')
        .withIndex('userId', (q) => q.eq('userId', user.userId))
        .collect()
    ).toHaveLength(1);
    expect((await ctx.db.get(user.profileId))?.username).toBe('Recovered');
  });
});

test('cleanup drains expired sessions and their token batches without removing a rotated live session', async () => {
  const t = setup();
  const live = await account(t, 'still-active', 'google');
  const expired = await t.run(async (ctx) => {
    await ctx.db.insert('authRefreshTokens', {
      sessionId: live.sessionId,
      expirationTime: Date.now() - 1,
      firstUsedTime: Date.now() - 100,
    });
    const expired = [];
    for (let i = 0; i < 10; i++) {
      const sessionId = await ctx.db.insert('authSessions', { userId: live.userId, expirationTime: Date.now() - 1 });
      expired.push(sessionId);
      for (let token = 0; token < 35; token++) {
        await ctx.db.insert('authRefreshTokens', { sessionId, expirationTime: Date.now() + 600_000 });
      }
    }
    return expired;
  });
  for (const sessionId of expired) {
    await t.mutation(internal.authSessions.expireOne, { sessionId });
  }
  await t.finishAllScheduledFunctions(() => vi.runAllTimers());
  await t.run(async (ctx) => {
    expect(await ctx.db.get(live.sessionId)).not.toBeNull();
    expect(await ctx.db.query('authSessions').collect()).toHaveLength(1);
    expect(await ctx.db.query('authRefreshTokens').collect()).toHaveLength(2);
  });
});
