/// <reference types="vite/client" />
// @vitest-environment edge-runtime
import { afterEach, beforeEach, expect, test, vi } from 'vite-plus/test';

import { peekSeatPass } from '../src/shared/play/seatPass';
import { api, internal } from './_generated/api';
import { account, setup, stubAuthEnvironment, restoreAuthEnvironment } from './authAccount.test.fixture';
import { applicationTriggers } from './lib/applicationTriggers';
import { insertPendingGame } from './lib/playProvisioningSchedule';

/* Answers a merge's session cutoff as the room does, acknowledging it as soon as it arrives; unanswered, it would retry for the pass lifetime. */
function roomAcknowledgesCutoffs(t: ReturnType<typeof setup>) {
  vi.stubEnv('PLAY_SERVICE_URL', 'http://127.0.0.1:8787');
  vi.stubGlobal('fetch', async (url: string, init: RequestInit) => {
    if (!url.endsWith('/session-cutoff')) {
      return new Response(null, { status: 404 });
    }
    const { gameId, secret, eventId, through } = JSON.parse(init.body as string) as Record<string, never>;
    await t.mutation(api.playSessionCutoffs.ackSessionCutoff, { gameId, secret, eventId, through });
    return Response.json({ ok: true });
  });
}

/** The seat pass an account's session is signed for at a game, as the room would read it. */
async function passOf(player: ReturnType<ReturnType<typeof setup>['withIdentity']>, gameId: string) {
  const result = await player.mutation(api.playAdmission.enrolPlayer, { gameId });
  if (!result.ok) {
    throw new Error(`Seat pass refused: ${result.reason}`);
  }
  return peekSeatPass(result.pass);
}

beforeEach(stubAuthEnvironment);
afterEach(() => {
  restoreAuthEnvironment();
  vi.unstubAllGlobals();
});

test('admin merges drain multiple batches, preserve overlapping memberships, credentials and old profile links, and revoke the source session', async () => {
  const t = setup();
  roomAcknowledgesCutoffs(t);
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
  expect((await t.query(api.profiles.pageBySlug, { slug: 'other' })).profile._id).toBe(target.profileId);
  expect(
    (await t.withIdentity({ subject: `${source.userId}|${source.sessionId}` }).query(api.profiles.session, {})).userId
  ).toBeNull();
  await admin.mutation(api.accounts.disconnect, { provider: 'discord' });
  await expect(admin.mutation(api.accounts.disconnect, { provider: 'google' })).rejects.toThrow('Not authenticated');
});

test('a failed partial transfer resumes without undoing completed writes and unlocks the kept account', async () => {
  const t = setup();
  roomAcknowledgesCutoffs(t);
  const source = await account(t, 'source', 'discord');
  const target = await account(t, 'target', 'google', true);
  const groups = await t.run(async (raw) => {
    const ctx = applicationTriggers.wrapDB(raw);
    const ids = [];
    for (let i = 0; i < 40; i += 1) {
      ids.push(
        await ctx.db.insert('groups', {
          created_by: source.userId,
          created_at: new Date().toISOString(),
          name: `Group ${i}`,
          slug: `group-${i}`,
          is_deleted: false,
        })
      );
    }
    return ids;
  });
  const admin = t.withIdentity({ subject: `${target.userId}|${target.sessionId}` });
  const operationId = await admin.mutation(api.accounts.merge, {
    sourceUserId: source.userId,
    targetUserId: target.userId,
  });
  await t.mutation(internal.accounts.advanceBatch, { operationId });
  await t.mutation(internal.accounts.failMerge, { operationId, error: 'Operator repair required' });
  await t.finishAllScheduledFunctions(() => vi.runAllTimers());
  await t.run(async (ctx) => {
    expect(await ctx.db.get(operationId)).toMatchObject({ state: 'failed', phase: 0 });
    const rows = await Promise.all(groups.map((id) => ctx.db.get(id)));
    expect(rows.filter((row) => row?.created_by === target.userId)).toHaveLength(32);
    expect(rows.filter((row) => row?.created_by === source.userId)).toHaveLength(8);
    expect((await ctx.db.get(source.authId))?.userId).toBe(source.userId);
  });
  await expect(admin.mutation(api.accounts.beginConnection, { provider: 'discord' })).rejects.toThrow(
    'merge in progress'
  );
  expect((await admin.query(api.profiles.session, {})).userId).toBe(target.userId);
  await admin.mutation(api.accounts.resumeMerge, { operationId });
  await t.finishAllScheduledFunctions(() => vi.runAllTimers());
  await t.run(async (ctx) => {
    expect((await ctx.db.get(operationId))?.state).toBe('completed');
    expect((await ctx.db.get(target.userId))?.account_merge_operation_id).toBeUndefined();
    expect((await ctx.db.get(source.authId))?.userId).toBe(target.userId);
    for (const id of groups) {
      expect((await ctx.db.get(id))?.created_by).toBe(target.userId);
    }
  });
});

test('Discord connection requires both proofs and a fresh second session, then consumes the intent once', async () => {
  const provider = 'discord';
  const t = setup();
  roomAcknowledgesCutoffs(t);
  const target = await account(t, 'kept', 'google');
  const source = await account(t, 'other', provider);
  const original = t.withIdentity({ subject: `${target.userId}|${target.sessionId}` });
  const intent = await original.mutation(api.accounts.beginConnection, { provider });
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
  expect(await t.query(api.accounts.connection, { token: intent.token })).toMatchObject({ state: 'running' });
  await t.finishAllScheduledFunctions(() => vi.runAllTimers());
  expect(await t.query(api.accounts.connection, { token: intent.token })).toBeNull();
});

test("a self-service connection never carries the source account's admin rights", async () => {
  const provider = 'discord';
  const t = setup();
  roomAcknowledgesCutoffs(t);
  const target = await account(t, 'requester', 'google');
  const source = await account(t, 'administrator', provider, true);
  const intent = await t
    .withIdentity({ subject: `${target.userId}|${target.sessionId}` })
    .mutation(api.accounts.beginConnection, { provider });
  const secondSession = await t.run(
    async (ctx) => await ctx.db.insert('authSessions', { userId: source.userId, expirationTime: Date.now() + 600_000 })
  );
  await t
    .withIdentity({ subject: `${source.userId}|${secondSession}` })
    .mutation(api.accounts.confirmConnection, { token: intent.token });
  await t.finishAllScheduledFunctions(() => vi.runAllTimers());
  await t.run(async (ctx) => {
    expect((await ctx.db.get(source.authId))?.userId).toBe(target.userId);
    expect((await ctx.db.get(target.userId))?.isAdmin).toBeFalsy();
  });
});

test("a merge takes a game away from the source account's old sessions", async () => {
  const t = setup();
  roomAcknowledgesCutoffs(t);
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
  await t.finishAllScheduledFunctions(() => vi.runAllTimers());
  expect(
    await t
      .withIdentity({ subject: `${source.userId}|${source.sessionId}` })
      .mutation(api.playAdmission.enrolPlayer, { gameId: game.gameId })
  ).toMatchObject({ ok: false, reason: 'not_authorized' });
  expect(await passOf(admin, game.gameId)).toMatchObject({ principalId: target.userId });
});

test('ordinary users cannot perform admin merges, and expired connection credentials cannot authorize a merge', async () => {
  const t = setup();
  roomAcknowledgesCutoffs(t);
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
  roomAcknowledgesCutoffs(t);
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
  expect(await passOf(admin, game.gameId)).toMatchObject({ actorId: source.userId, displayName: 'target' });
});

test.each(['target', 'source'] as const)(
  'a %s creator with no admission row or directory summary retains its original game actor',
  async (creator) => {
    const t = setup();
    roomAcknowledgesCutoffs(t);
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
    expect(await passOf(admin, game.gameId)).toMatchObject({ actorId: creatorId, displayName: 'target' });
  }
);

test('two retained answers to one question remain readable and do not allow a third answer', async () => {
  const t = setup();
  roomAcknowledgesCutoffs(t);
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
  await t.run(async (ctx) => {
    /* The merge moves the question and the source's answer to the target, so both answers now belong to one account. */
    await expect(ctx.db.get('faq_items', questionId)).resolves.toMatchObject({ asked_by: target.userId });
    const answers = await ctx.db
      .query('faq_answers')
      .withIndex('by_faq_item_created', (q) => q.eq('faq_item_id', questionId))
      .collect();
    expect(answers.map((answer) => answer.answered_by)).toEqual([target.userId, target.userId]);
  });
  const page = await admin.query(api.faq.question, { rulesetSlug: 'rules', questionSlug: '1' });
  expect(page).not.toBeNull();
  await expect(
    admin.mutation(api.faq.createAnswer, {
      faq_item_id: questionId,
      answer: 'Another sufficiently long answer.',
    })
  ).rejects.toThrow('already answered');
});

test('a creator who never entered keeps their seat when merged into an account already routed to the game', async () => {
  const t = setup();
  roomAcknowledgesCutoffs(t);
  const source = await account(t, 'creator', 'discord');
  const target = await account(t, 'spectator', 'google', true);
  const game = await t.run(async (ctx) => {
    const now = new Date().toISOString();
    const rulesetId = await ctx.db.insert('rulesets', {
      name: 'Classic',
      slug: 'classic',
      about: 'A ruleset for merge coverage.',
      created_at: now,
      updated_at: now,
      owner_id: source.userId,
      group_id: null,
      is_deleted: false,
      image_cover: null,
    });
    return await insertPendingGame(ctx, { ruleset_id: rulesetId, minimum_players: 4, creator_id: source.userId });
  });
  await t.mutation(api.playProvisioning.confirmProvisioning, {
    gameId: game.gameId,
    secret: game.secret,
    attemptId: game.attemptId,
  });
  await t.run(async (ctx) => {
    await ctx.db.insert('play_game_accounts', {
      game_id: game.gameId,
      user_id: target.userId,
      actor_user_ids: [target.userId],
    });
  });
  const admin = t.withIdentity({ subject: `${target.userId}|${target.sessionId}` });
  await admin.mutation(api.accounts.merge, { sourceUserId: source.userId, targetUserId: target.userId });
  await t.finishAllScheduledFunctions(() => vi.runAllTimers());
  expect(await passOf(admin, game.gameId)).toMatchObject({ actorId: source.userId });
});

test('a connected Discord account protects the last usable method', async () => {
  const t = setup();
  roomAcknowledgesCutoffs(t);
  const owner = await account(t, 'discord-owner', 'discord');
  const viewer = t.withIdentity({ subject: `${owner.userId}|${owner.sessionId}` });
  await expect(viewer.mutation(api.accounts.disconnect, { provider: 'discord' })).rejects.toThrow('Keep at least one');
  await t.run((ctx) =>
    ctx.db.insert('authAccounts', { userId: owner.userId, provider: 'google', providerAccountId: 'google-extra' })
  );
  await viewer.mutation(api.accounts.disconnect, { provider: 'google' });
  vi.advanceTimersByTime(1);
  const sessionId = await t.run((ctx) =>
    ctx.db.insert('authSessions', { userId: owner.userId, expirationTime: Date.now() + 600_000 })
  );
  const signedIn = t.withIdentity({ subject: `${owner.userId}|${sessionId}` });
  expect((await signedIn.query(api.profiles.settings, {})).account?.methods).toContainEqual({
    provider: 'discord',
    connected: true,
    available: true,
  });
});

test('a merge moves large assets within the transaction limits', async () => {
  const t = setup({ transactionLimits: true });
  roomAcknowledgesCutoffs(t);
  const source = await account(t, 'other', 'discord');
  const target = await account(t, 'kept', 'google', true);
  /* Thirty-three cards near the document limit: one 32-row batch of them reads past the 16 MiB limit. */
  const text = 'x'.repeat(700 * 1024);
  for (let index = 0; index < 33; index += 1) {
    await t.run(async (raw) => {
      await applicationTriggers.wrapDB(raw).db.insert('assets', {
        type: 'card-treachery',
        slug: `large-card-${index}`,
        data: { name: `Large card ${index}`, description: text },
        owner_id: source.userId,
        group_id: null,
        is_deleted: false,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      });
    });
  }
  const admin = t.withIdentity({ subject: `${target.userId}|${target.sessionId}` });
  const operationId = await admin.mutation(api.accounts.merge, {
    sourceUserId: source.userId,
    targetUserId: target.userId,
  });
  await t.finishAllScheduledFunctions(() => vi.runAllTimers());
  await t.run(async (ctx) => {
    expect((await ctx.db.get(operationId))?.state).toBe('completed');
    const left = await ctx.db
      .query('assets')
      .withIndex('by_owner_deleted', (q) => q.eq('owner_id', source.userId))
      .first();
    expect(left).toBeNull();
  });
}, 60_000);
