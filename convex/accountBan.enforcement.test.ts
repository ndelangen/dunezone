/// <reference types="vite/client" />
/* @vitest-environment edge-runtime */

import { generateKeyPairSync } from 'node:crypto';

import { afterEach, beforeEach, expect, test, vi } from 'vite-plus/test';

import { BANNED_ACCOUNT_SIGN_IN } from '../src/shared/authDestination';
import { api, internal } from './_generated/api';
import { account, setup, stubAuthEnvironment, restoreAuthEnvironment } from './authAccount.test.fixture';
import { applicationTriggers } from './lib/applicationTriggers';
import { currentPlaySession, playSessionAuthorization } from './lib/playAuthorization';

beforeEach(stubAuthEnvironment);
afterEach(restoreAuthEnvironment);

async function bannedAccount(t: ReturnType<typeof setup>, provider: 'google' | 'discord' | 'steam' = 'google') {
  const owner = await account(t, 'banned-account', provider, true);
  await t.run(async (raw) => {
    const ctx = applicationTriggers.wrapDB(raw);
    await ctx.db.patch(owner.userId, { account_state: 'banned' });
    await ctx.db.patch(owner.profileId, { account_state: 'banned' });
  });
  return { ...owner, viewer: t.withIdentity({ subject: `${owner.userId}|${owner.sessionId}` }) };
}

function signingKey() {
  vi.stubEnv('CONVEX_SITE_URL', 'https://test.convex.site');
  vi.stubEnv(
    'JWT_PRIVATE_KEY',
    generateKeyPairSync('rsa', { modulusLength: 2048 }).privateKey.export({ type: 'pkcs8', format: 'pem' }).toString()
  );
}

test('a banned session reads only its ban status and cannot change or unlink the account', async () => {
  const t = setup();
  const owner = await bannedAccount(t);
  await expect(owner.viewer.query(api.profiles.session, {})).resolves.toEqual({
    userId: null,
    profile: null,
    isAdmin: false,
    isBanned: true,
  });
  await expect(owner.viewer.query(api.profiles.settings, {})).rejects.toThrow('You have been banned');
  await expect(owner.viewer.query(api.accounts.connectedMethods, {})).rejects.toThrow('You have been banned');
  await expect(
    owner.viewer.query(api.accounts.adminPage, {
      accountState: 'active',
      paginationOpts: { cursor: null, numItems: 10 },
      selectedUserIds: [],
    })
  ).rejects.toThrow('You have been banned');
  await expect(owner.viewer.query(api.accountDeletion.page, { profileSlug: 'banned-account' })).rejects.toThrow(
    'You have been banned'
  );
  await expect(owner.viewer.mutation(api.profiles.bootstrapCurrent, {})).rejects.toThrow('You have been banned');
  await expect(owner.viewer.mutation(api.accounts.disconnect, { provider: 'google' })).rejects.toThrow(
    'You have been banned'
  );
  await expect(owner.viewer.mutation(api.accounts.beginConnection, { provider: 'discord' })).rejects.toThrow(
    'You have been banned'
  );
  await expect(owner.viewer.mutation(api.accounts.confirmConnection, { token: 'a'.repeat(64) })).rejects.toThrow(
    'You have been banned'
  );
  await expect(owner.viewer.mutation(api.accountDeletion.confirm, { replacementUserId: null })).rejects.toThrow(
    'You have been banned'
  );
  expect(await t.run((ctx) => ctx.db.get(owner.authId))).toMatchObject({ userId: owner.userId });
  await expect(t.query(api.profiles.pageBySlug, { slug: 'banned-account' })).rejects.toThrow('not found');
});

test('a banned account cannot enter games, renew passes, or receive a homepage ticket', async () => {
  const t = setup();
  const owner = await bannedAccount(t);
  await expect(owner.viewer.run((ctx) => currentPlaySession(ctx))).rejects.toThrow('You have been banned');
  expect(await t.run((ctx) => playSessionAuthorization(ctx, owner.userId, owner.sessionId))).toEqual({
    allowed: false,
    authExpiresAt: 0,
    sessionExpiresAt: 0,
  });
  await expect(owner.viewer.mutation(api.homepageAdmission.issueTicket, {})).rejects.toThrow('You have been banned');
  const game = await t.mutation(internal.playTesting.createFixture, {});
  await expect(owner.viewer.mutation(api.playAdmission.enrolPlayer, { gameId: game.gameId })).rejects.toThrow(
    'You have been banned'
  );
  await expect(owner.viewer.mutation(api.playAdmission.renewSeatPass, { gameId: game.gameId })).rejects.toThrow(
    'You have been banned'
  );
});

test('banning revokes sessions, queues game cutoffs and expires provider connections', async () => {
  const t = setup();
  const owner = await account(t, 'suspended-player', 'google');
  const viewer = t.withIdentity({ subject: `${owner.userId}|${owner.sessionId}` });
  await viewer.mutation(api.accounts.beginConnection, { provider: 'discord' });
  const game = await t.mutation(internal.playTesting.createFixture, {});
  const admin = await account(t, 'admin', 'google', true);
  const session = await t.run(async (ctx) => {
    await ctx.db.insert('play_game_accounts', { game_id: game.gameId, user_id: owner.userId });
    return (await ctx.db.get(owner.sessionId))!;
  });
  await t.withIdentity({ subject: `${admin.userId}|${admin.sessionId}` }).mutation(api.accountDeletion.adminBan, {
    sourceUserId: owner.userId,
    replacementUserId: null,
  });
  await t.run(async (ctx) => {
    expect(await ctx.db.get(owner.sessionId)).toBeNull();
    expect(
      await ctx.db
        .query('authRefreshTokens')
        .withIndex('sessionId', (q) => q.eq('sessionId', owner.sessionId))
        .first()
    ).toBeNull();
    expect(await ctx.db.get(owner.authId)).not.toBeNull();
    expect(await ctx.db.query('account_connections').collect()).toMatchObject([{ state: 'expired' }]);
    const cutoff = await ctx.db.query('play_session_cutoffs').unique();
    expect(cutoff).toMatchObject({ game_id: game.gameId, principal_id: owner.userId, state: 'pending' });
    expect(cutoff!.through).toBeGreaterThanOrEqual(session._creationTime);
  });
});

test.each(['google', 'discord'] as const)(
  'a banned %s sign-in keeps its provider and refuses a new session',
  async (provider) => {
    signingKey();
    const t = setup();
    const owner = await bannedAccount(t, provider);
    const signature = crypto.randomUUID();
    const verifier = await t.run((ctx) => ctx.db.insert('authVerifiers', { signature }));
    const code = await t.mutation(internal.auth.store, {
      args: {
        type: 'userOAuth',
        provider,
        providerAccountId: 'banned-account',
        profile: { name: 'Same provider' },
        signature,
      },
    });
    await expect(t.action(api.auth.signIn, { params: { code }, verifier })).rejects.toMatchObject({
      data: BANNED_ACCOUNT_SIGN_IN,
    });
    await t.run(async (ctx) => {
      expect(await ctx.db.query('users').collect()).toHaveLength(1);
      expect(await ctx.db.query('profiles').collect()).toHaveLength(1);
      expect(await ctx.db.get(owner.authId)).toMatchObject({ userId: owner.userId });
      expect(await ctx.db.get(owner.profileId)).toMatchObject({ account_state: 'banned' });
    });
  }
);
