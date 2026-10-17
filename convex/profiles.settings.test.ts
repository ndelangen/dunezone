/// <reference types="vite/client" />
/* @vitest-environment edge-runtime */

import { expect, test } from 'vite-plus/test';

import { api } from './_generated/api';
import { applicationTest } from './application.test.fixture';

test("settings returns only the authenticated owner's methods and rejects a revoked session", async () => {
  const t = applicationTest();
  const { userId, sessionId } = await t.run(async (ctx) => {
    const userId = await ctx.db.insert('users', { account_state: 'active' });
    const otherId = await ctx.db.insert('users', { account_state: 'active' });
    await ctx.db.insert('profiles', {
      user_id: userId,
      username: 'Central',
      slug: 'central',
      avatar_url: null,
      account_state: 'active',
      created_at: '2026-10-10T00:00:00.000Z',
      updated_at: '2026-10-10T00:00:00.000Z',
    });
    await ctx.db.insert('authAccounts', { userId, provider: 'google', providerAccountId: 'owner-google' });
    await ctx.db.insert('authAccounts', { userId: otherId, provider: 'discord', providerAccountId: 'other-discord' });
    const sessionId = await ctx.db.insert('authSessions', { userId, expirationTime: Date.now() + 60_000 });
    return { userId, sessionId };
  });
  const owner = t.withIdentity({ subject: `${userId}|${sessionId}` });
  expect((await owner.query(api.profiles.settings, {})).account).toMatchObject({
    methods: [
      { provider: 'google', connected: true },
      { provider: 'discord', connected: false },
    ],
    merging: false,
  });
  expect((await t.query(api.profiles.settings, {})).account).toBeNull();
  await t.run(async (ctx) => {
    await ctx.db.delete(sessionId);
  });
  expect((await owner.query(api.profiles.settings, {})).account).toBeNull();
});
