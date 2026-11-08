import { afterEach, beforeEach, expect, test, vi } from 'vite-plus/test';

import { RECENT_SIGN_IN_REQUIRED } from '../src/shared/authDestination';
import { api } from './_generated/api';
import type { Id } from './_generated/dataModel';
import { account, setup, stubAuthEnvironment, restoreAuthEnvironment } from './authAccount.test.fixture';
import { RECENT_SIGN_IN_MS } from './lib/policy';

beforeEach(stubAuthEnvironment);
afterEach(restoreAuthEnvironment);

type Test = ReturnType<typeof setup>;

/** A signed-in account with Google and Discord connected, whose session stays usable for a day of fake time. */
async function connectedAccount(t: Test, slug: string) {
  const user = await account(t, slug, 'google');
  await t.run(async (ctx) => {
    await ctx.db.insert('authAccounts', { userId: user.userId, provider: 'discord', providerAccountId: `${slug}-d` });
    await ctx.db.patch(user.sessionId, { expirationTime: Date.now() + 86_400_000 });
    await ctx.db.insert('authRefreshTokens', { sessionId: user.sessionId, expirationTime: Date.now() + 86_400_000 });
  });
  return { ...user, viewer: t.withIdentity({ subject: `${user.userId}|${user.sessionId}` }) };
}

async function newSession(t: Test, userId: Id<'users'>) {
  const sessionId = await t.run((ctx) =>
    ctx.db.insert('authSessions', { userId, expirationTime: Date.now() + 3_600_000 })
  );
  return t.withIdentity({ subject: `${userId}|${sessionId}` });
}

test('connecting, disconnecting and deleting need a sign-in from the last few minutes', async () => {
  const t = setup();
  const user = await connectedAccount(t, 'stale-session');
  vi.advanceTimersByTime(RECENT_SIGN_IN_MS + 1);
  await expect(user.viewer.mutation(api.accounts.disconnect, { provider: 'discord' })).rejects.toThrow(
    RECENT_SIGN_IN_REQUIRED
  );
  await t.run((ctx) => ctx.db.delete(user.authId));
  await expect(user.viewer.mutation(api.accounts.beginConnection, { provider: 'google' })).rejects.toThrow(
    RECENT_SIGN_IN_REQUIRED
  );
  await expect(user.viewer.mutation(api.accountDeletion.confirm, { replacementUserId: null })).rejects.toThrow(
    RECENT_SIGN_IN_REQUIRED
  );
  /* The same session still does everything else. */
  expect((await user.viewer.query(api.profiles.settings, {})).account).not.toBeNull();

  const fresh = await newSession(t, user.userId);
  await expect(fresh.mutation(api.accounts.beginConnection, { provider: 'google' })).resolves.toMatchObject({
    slug: 'stale-session',
  });
});

test('a fresh sign-in may disconnect and start deleting the account', async () => {
  const t = setup();
  const user = await connectedAccount(t, 'fresh-session');
  await user.viewer.mutation(api.accounts.disconnect, { provider: 'discord' });
  vi.advanceTimersByTime(1);
  const again = await newSession(t, user.userId);
  await expect(again.mutation(api.accountDeletion.confirm, { replacementUserId: null })).resolves.toMatchObject({
    operationId: expect.any(String),
  });
});

test('signing out on all devices ends a pending connection, and a new connection replaces the last one', async () => {
  const t = setup();
  const user = await account(t, 'connector', 'google');
  const viewer = t.withIdentity({ subject: `${user.userId}|${user.sessionId}` });
  const first = await viewer.mutation(api.accounts.beginConnection, { provider: 'discord' });
  const second = await viewer.mutation(api.accounts.beginConnection, { provider: 'discord' });
  const states = () =>
    t.run(async (ctx) => (await ctx.db.query('account_connections').collect()).map((row) => row.state));
  expect(await states()).toEqual(['expired', 'pending']);
  expect(first.token).not.toBe(second.token);

  await viewer.mutation(api.accounts.signOutEverywhere, {});
  expect(await states()).toEqual(['expired', 'expired']);

  /* Signing in with the other account afterwards no longer finishes the old connection. */
  const other = await account(t, 'other-account', 'discord');
  vi.advanceTimersByTime(1);
  const proof = await newSession(t, other.userId);
  expect(await proof.query(api.accounts.connection, { token: second.token })).toBeNull();
  await expect(proof.mutation(api.accounts.confirmConnection, { token: second.token })).rejects.toThrow('expired');
});
