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
async function account(t: ReturnType<typeof setup>, slug: string, provider: 'google' | 'discord', admin = false) {
  return t.run(async (raw) => {
    const ctx = applicationTriggers.wrapDB(raw);
    const userId = await ctx.db.insert('users', { name: slug, account_state: 'active', isAdmin: admin });
    const profileId = await ctx.db.insert('profiles', {
      user_id: userId,
      username: slug,
      slug,
      avatar_url: null,
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

test('admin merges drain multiple batches, preserve overlapping memberships, credentials and old profile links, and revoke the source session', async () => {
  const t = setup();
  const source = await account(t, 'other', 'discord');
  const target = await account(t, 'kept', 'google', true);
  const groups = await t.run(async (raw) => {
    const ctx = applicationTriggers.wrapDB(raw);
    const ids = [];
    for (let i = 0; i < 65; i += 1) {
      const id = await ctx.db.insert('groups', {
        created_by: source.userId,
        created_at: new Date().toISOString(),
        name: `Group ${i}`,
        slug: `group-${i}`,
        is_deleted: false,
      });
      await ctx.db.insert('group_members', {
        group_id: id,
        user_id: source.userId,
        status: 'active',
        requested_at: new Date().toISOString(),
        approved_at: null,
        approved_by: source.userId,
      });
      ids.push(id);
    }
    await ctx.db.insert('group_members', {
      group_id: ids[0]!,
      user_id: target.userId,
      status: 'pending',
      requested_at: new Date().toISOString(),
      approved_at: null,
      approved_by: null,
    });
    return ids;
  });
  const admin = t.withIdentity({ subject: `${target.userId}|${target.sessionId}` });
  const operationId = await admin.mutation(api.accounts.merge, {
    sourceUserId: source.userId,
    targetUserId: target.userId,
  });
  await expect(admin.mutation(api.accountDeletion.confirm, { replacementUserId: null })).rejects.toThrow(
    'merge in progress'
  );
  await t.finishAllScheduledFunctions(() => vi.runAllTimers());
  await t.run(async (ctx) => {
    expect((await ctx.db.get(operationId))?.state).toBe('completed');
    expect((await ctx.db.get(source.authId))?.userId).toBe(target.userId);
    expect(await ctx.db.get(source.sessionId)).toBeNull();
    expect((await ctx.db.get(source.profileId))?.merged_into_profile_id).toBe(target.profileId);
    for (const id of groups) {
      expect((await ctx.db.get(id))?.created_by).toBe(target.userId);
      expect(
        (
          await ctx.db
            .query('group_members')
            .withIndex('by_group_user', (q) => q.eq('group_id', id).eq('user_id', target.userId))
            .unique()
        )?.status
      ).toBe('active');
    }
  });
  expect((await t.query(api.profiles.getBySlug, { slug: 'other' })).profile._id).toBe(target.profileId);
  expect(
    (await t.withIdentity({ subject: `${source.userId}|${source.sessionId}` }).query(api.profiles.session, {})).userId
  ).toBeNull();
  await admin.mutation(api.accounts.disconnect, { provider: 'discord' });
  await expect(admin.mutation(api.accounts.disconnect, { provider: 'google' })).rejects.toThrow('Keep at least one');
});

test('self-service connection requires both proofs and a fresh second session, then consumes the intent once', async () => {
  const t = setup();
  const target = await account(t, 'kept', 'google');
  const source = await account(t, 'other', 'discord');
  const original = t.withIdentity({ subject: `${target.userId}|${target.sessionId}` });
  const intent = await original.mutation(api.accounts.beginConnection, { provider: 'discord' });
  const oldSource = t.withIdentity({ subject: `${source.userId}|${source.sessionId}` });
  await expect(oldSource.mutation(api.accounts.confirmConnection, { token: intent.token })).rejects.toThrow(
    'Sign in with'
  );
  expect(await t.query(api.accounts.connection, { token: intent.token })).toBeNull();
  const secondSession = await t.run(async (ctx) => {
    await ctx.db.delete(target.sessionId);
    return await ctx.db.insert('authSessions', { userId: source.userId, expirationTime: Date.now() + 600_000 });
  });
  const verified = t.withIdentity({ subject: `${source.userId}|${secondSession}` });
  expect(await verified.query(api.accounts.connection, { token: intent.token })).toMatchObject({
    state: 'review',
    targetName: 'kept',
    sourceName: 'other',
  });
  await verified.mutation(api.accounts.confirmConnection, { token: intent.token });
  await expect(verified.mutation(api.accounts.confirmConnection, { token: intent.token })).rejects.toThrow('expired');
  await t.finishAllScheduledFunctions(() => vi.runAllTimers());
  expect(await t.query(api.accounts.connection, { token: intent.token })).toMatchObject({ state: 'completed' });
});

test('a source player survives game reconciliation before and after routing transfer while old sessions lose access', async () => {
  const t = setup();
  const source = await account(t, 'player', 'discord');
  const target = await account(t, 'spectator', 'google', true);
  const game = await t.mutation(internal.playTesting.createFixture, {});
  await t.mutation(api.playProvisioning.confirmProvisioning, {
    gameId: game.gameId,
    secret: game.secret,
    attemptId: game.attemptId,
  });
  await t.run(async (ctx) => {
    await ctx.db.insert('play_game_accounts', { game_id: game.gameId, user_id: source.userId });
    await ctx.db.insert('play_game_accounts', { game_id: game.gameId, user_id: target.userId });
  });
  const admin = t.withIdentity({ subject: `${target.userId}|${target.sessionId}` });
  await admin.mutation(api.accounts.merge, { sourceUserId: source.userId, targetUserId: target.userId });
  const args = { gameId: game.gameId, secret: game.secret, userIds: [source.userId, target.userId] };
  expect(await t.query(api.playAdmission.reconcileAccounts, args)).toMatchObject({
    accounts: [
      { userId: source.userId, state: 'active' },
      { userId: target.userId, state: 'active' },
    ],
  });
  await t.finishAllScheduledFunctions(() => vi.runAllTimers());
  expect(await t.query(api.playAdmission.reconcileAccounts, args)).toMatchObject({
    accounts: [
      { userId: source.userId, state: 'active' },
      { userId: target.userId, state: 'active' },
    ],
  });
  expect(
    await t
      .withIdentity({ subject: `${source.userId}|${source.sessionId}` })
      .mutation(api.playAdmission.issueTicket, { gameId: game.gameId })
  ).toMatchObject({ ok: false, reason: 'not_authorized' });
});

test('ordinary users cannot perform admin merges, and expired connection credentials cannot authorize a merge', async () => {
  const t = setup();
  const target = await account(t, 'kept', 'google');
  const source = await account(t, 'other', 'discord');
  const original = t.withIdentity({ subject: `${target.userId}|${target.sessionId}` });
  await expect(
    original.mutation(api.accounts.merge, { sourceUserId: source.userId, targetUserId: target.userId })
  ).rejects.toThrow('Not authorized');
  const intent = await original.mutation(api.accounts.beginConnection, { provider: 'discord' });
  vi.advanceTimersByTime(600_001);
  const sessionId = await t.run((ctx) =>
    ctx.db.insert('authSessions', { userId: source.userId, expirationTime: Date.now() + 600_000 })
  );
  await expect(
    t
      .withIdentity({ subject: `${source.userId}|${sessionId}` })
      .mutation(api.accounts.confirmConnection, { token: intent.token })
  ).rejects.toThrow('expired');
});

test('merges refuse overlapping private seats and unfinished provisioning, then admit the kept account under its retained actor', async () => {
  const t = setup();
  const source = await account(t, 'source', 'discord');
  const target = await account(t, 'target', 'google', true);
  const game = await t.mutation(internal.playTesting.createFixture, {});
  await t.run(async (ctx) => {
    await ctx.db.patch(game.gameId, { creator_id: source.userId });
  });
  const admin = t.withIdentity({ subject: `${target.userId}|${target.sessionId}` });
  await expect(
    admin.mutation(api.accounts.merge, { sourceUserId: source.userId, targetUserId: target.userId })
  ).rejects.toThrow('game being created');
  await t.run(async (ctx) => {
    await ctx.db.patch(game.gameId, {
      state: 'ready',
      directory: {
        stage: 'play',
        seatCount: 6,
        seats: [
          { seat: 'one', userId: source.userId, faction: null },
          { seat: 'two', userId: target.userId, faction: null },
        ],
        phase: 0,
        lastActivityAt: Date.now(),
        result: null,
      },
    });
  });
  await expect(
    admin.mutation(api.accounts.merge, { sourceUserId: source.userId, targetUserId: target.userId })
  ).rejects.toThrow('Both profiles hold a seat');
  await t.run(async (ctx) => {
    await ctx.db.patch(game.gameId, {
      directory: {
        stage: 'play',
        seatCount: 6,
        seats: [{ seat: 'one', userId: source.userId, faction: null }],
        phase: 0,
        lastActivityAt: Date.now(),
        result: null,
      },
    });
  });
  await admin.mutation(api.accounts.merge, { sourceUserId: source.userId, targetUserId: target.userId });
  await t.finishAllScheduledFunctions(() => vi.runAllTimers());
  const issued = await admin.mutation(api.playAdmission.issueTicket, { gameId: game.gameId });
  expect(issued.ok).toBe(true);
  if (!issued.ok) {
    throw new Error('Expected admission');
  }
  expect(
    await t.mutation(api.playAdmission.redeemTicket, {
      gameId: game.gameId,
      secret: game.secret,
      ticket: issued.ticket,
    })
  ).toMatchObject({ ok: true, userId: source.userId, displayName: 'target' });
});

test.each(['target', 'source'] as const)(
  'a %s creator with no admission row or directory summary retains its original game actor',
  async (creator) => {
    const t = setup();
    const source = await account(t, 'source', 'discord');
    const target = await account(t, 'target', 'google', true);
    const game = await t.mutation(internal.playTesting.createFixture, {});
    const creatorId = creator === 'source' ? source.userId : target.userId;
    await t.run(async (ctx) => {
      await ctx.db.patch(game.gameId, { state: 'ready', creator_id: creatorId });
      if (creator === 'target') {
        await ctx.db.insert('play_game_accounts', { game_id: game.gameId, user_id: source.userId });
      }
    });
    const admin = t.withIdentity({ subject: `${target.userId}|${target.sessionId}` });
    await admin.mutation(api.accounts.merge, { sourceUserId: source.userId, targetUserId: target.userId });
    await t.finishAllScheduledFunctions(() => vi.runAllTimers());
    const routing = await t.run(async (ctx) =>
      ctx.db
        .query('play_game_accounts')
        .withIndex('by_game_id_user_id', (q) => q.eq('game_id', game.gameId).eq('user_id', target.userId))
        .unique()
    );
    expect(routing?.actor_user_ids).toContain(creatorId);
    const issued = await admin.mutation(api.playAdmission.issueTicket, { gameId: game.gameId });
    if (!issued.ok) {
      throw new Error('Expected creator admission');
    }
    expect(
      await t.mutation(api.playAdmission.redeemTicket, {
        gameId: game.gameId,
        secret: game.secret,
        ticket: issued.ticket,
      })
    ).toMatchObject({ ok: true, userId: creatorId, displayName: 'target' });
  }
);

test('two retained answers to one question remain readable and do not allow a third answer', async () => {
  const t = setup();
  const source = await account(t, 'source', 'discord');
  const target = await account(t, 'target', 'google', true);
  const questionId = await t.run(async (raw) => {
    const ctx = applicationTriggers.wrapDB(raw);
    const now = new Date().toISOString();
    const rulesetId = await ctx.db.insert('rulesets', {
      name: 'Rules',
      slug: 'rules',
      about: 'A ruleset for merge coverage.',
      created_at: now,
      updated_at: now,
      owner_id: source.userId,
      group_id: null,
      is_deleted: false,
      image_cover: null,
    });
    const questionId = await ctx.db.insert('faq_items', {
      ruleset_id: rulesetId,
      slug: '1',
      question: 'A retained question?',
      asked_by: source.userId,
      created_at: now,
      updated_at: now,
      accepted_answer_id: null,
    });
    for (const userId of [source.userId, target.userId]) {
      await ctx.db.insert('faq_answers', {
        faq_item_id: questionId,
        answer: 'A retained answer.',
        answered_by: userId,
        created_at: now,
      });
    }
    return questionId;
  });
  const admin = t.withIdentity({ subject: `${target.userId}|${target.sessionId}` });
  await admin.mutation(api.accounts.merge, { sourceUserId: source.userId, targetUserId: target.userId });
  await t.finishAllScheduledFunctions(() => vi.runAllTimers());
  const page = await admin.query(api.faq.questionPage, { rulesetSlug: 'rules', questionSlug: '1' });
  expect(page).not.toBeNull();
  await expect(
    admin.mutation(api.faq.createAnswer, {
      faq_item_id: questionId,
      answer: 'Another sufficiently long answer.',
    })
  ).rejects.toThrow('already answered');
});
