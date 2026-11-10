/* @vitest-environment edge-runtime */

import { afterEach, beforeEach, expect, test, vi } from 'vite-plus/test';

import { api, internal } from './_generated/api';
import type { Id } from './_generated/dataModel';
import { playRateLimiter } from './lib/playRateLimits';
import { playPerson, playTest } from './play.test.fixture';
import { configureDiscord, discordStub, voiceWorld } from './playDiscord.test.fixture';

type TestWorld = ReturnType<typeof playTest>;
type Administrator = ReturnType<TestWorld['withIdentity']>;

beforeEach(() => {
  vi.useFakeTimers();
  configureDiscord();
});
afterEach(() => {
  vi.clearAllTimers();
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

async function administrator(t: TestWorld) {
  const person = await t.run(async (ctx) => await playPerson(ctx, 'Moderator', { isAdmin: true }));
  return t.withIdentity({ subject: person.subject });
}

async function banOwnedGames(t: TestWorld, admin: Administrator, sourceUserId: Id<'users'>) {
  const { operationId } = await admin.mutation(api.accountDeletion.adminBan, {
    sourceUserId,
    replacementUserId: null,
  });
  await t.mutation(internal.playDeletion.queueBanGames, { operationId });
  return operationId;
}

test.each(['ban', 'discard'] as const)(
  'a game waiting for the global creation budget never creates voice after %s',
  async (removal) => {
    const discord = discordStub();
    const world = await voiceWorld();
    await world.t.run(async (ctx) => await playRateLimiter.limit(ctx, 'discordChannelCreateGlobal', { count: 30 }));
    await world.reconcile();
    expect(await world.channel()).toMatchObject({ state: 'pending' });
    expect((await world.channel())!.next_attempt_at).toBeGreaterThan(Date.now());
    expect(discord.calls.filter((call) => call.method === 'POST')).toEqual([]);

    if (removal === 'ban') {
      await banOwnedGames(world.t, await administrator(world.t), world.identity.userId);
    } else {
      await world.publish(2, world.summary(undefined, { stage: 'discarded' }));
    }
    await world.reconcile();
    expect(await world.channel()).toMatchObject({ state: 'deleted' });

    vi.setSystemTime(Date.now() + 4 * 60_000);
    await world.t.mutation(internal.playDiscord.retryDue, {});
    await world.reconcile();
    expect(await world.channel()).toMatchObject({ state: 'deleted' });
    expect(discord.calls.filter((call) => call.method === 'POST')).toEqual([]);
    expect(discord.calls.filter((call) => call.method === 'DELETE')).toEqual([]);
  }
);

test.each(['ban', 'discard'] as const)(
  '%s during a held lease clears the obsolete creation-budget delay on release',
  async (removal) => {
    const discord = discordStub();
    const world = await voiceWorld();
    const channel = (await world.channel())!;
    const claimed = (await world.t.mutation(internal.playDiscord.claim, { channelId: channel._id }))!;
    const claim = { channelId: channel._id, lease: claimed.lease! };
    await world.t.run(async (ctx) => await playRateLimiter.limit(ctx, 'discordChannelCreateGlobal', { count: 30 }));
    expect(await world.t.mutation(internal.playDiscord.work, claim)).toBeNull();
    expect((await world.channel())!.retry_after).toBeGreaterThan(Date.now());

    if (removal === 'ban') {
      await banOwnedGames(world.t, await administrator(world.t), world.identity.userId);
    } else {
      await world.publish(2, world.summary(undefined, { stage: 'discarded' }));
    }
    expect((await world.channel())!.lease).toBe(claim.lease);
    await world.t.mutation(internal.playDiscord.release, claim);
    expect((await world.channel())!.next_attempt_at).toBeLessThanOrEqual(Date.now());
    await world.reconcile();
    expect(await world.channel()).toMatchObject({ state: 'deleted' });
    expect(discord.calls).toEqual([]);
  }
);

test('a channel ID returned after ban survives a failed delete and never gains an invite', async () => {
  const discord = discordStub();
  const world = await voiceWorld();
  const admin = await administrator(world.t);
  const normal = discord.fetch.getMockImplementation()!;
  let operationId: Id<'account_deletion_operations'> | undefined;
  let deleteAttempts = 0;
  discord.fetch.mockImplementation(async (input, options) => {
    if (options?.method === 'DELETE' && deleteAttempts++ === 0) {
      return Response.json({}, { status: 503 });
    }
    const response = await normal(input, options);
    if (input === 'https://discord.com/api/v10/guilds/100/channels' && options?.method === 'POST') {
      operationId = await banOwnedGames(world.t, admin, world.identity.userId);
    }
    return response;
  });

  await world.reconcile();
  expect(operationId).toBeDefined();
  expect(await world.channel()).toMatchObject({
    state: 'deleting',
    channel_id: '300',
    ban_operation_id: operationId,
  });
  expect((await world.channel())?.invite_url).toBeUndefined();
  vi.setSystemTime((await world.channel())!.next_attempt_at);
  await world.reconcile();

  expect(await world.channel()).toMatchObject({
    state: 'deleted',
    channel_id: '300',
    ban_operation_id: operationId,
  });
  expect(deleteAttempts).toBe(2);
  expect(discord.calls.filter((call) => call.path.endsWith('/invites'))).toEqual([]);
  expect(discord.calls.filter((call) => call.method === 'POST' && call.path === '/guilds/100/channels')).toHaveLength(
    1
  );
});

test('banning a merged owner removes the transferred game and voice channel under its original actor', async () => {
  const discord = discordStub();
  const world = await voiceWorld();
  await world.reconcile();
  const admin = await administrator(world.t);
  const target = await world.t.run(async (ctx) => await playPerson(ctx, 'Retained'));
  const mergeId = await admin.mutation(api.accounts.merge, {
    sourceUserId: world.identity.userId,
    targetUserId: target.userId,
  });
  for (let batch = 0; batch < 100; batch += 1) {
    const merge = await world.t.run(async (ctx) => await ctx.db.get(mergeId));
    if (merge?.state === 'completed') {
      break;
    }
    await world.t.mutation(internal.accounts.advanceBatch, { operationId: mergeId });
  }
  expect(await world.t.run(async (ctx) => await ctx.db.get(mergeId))).toMatchObject({ state: 'completed' });
  expect(await world.t.run(async (ctx) => await ctx.db.get(world.gameId))).toMatchObject({
    creator_id: target.userId,
    creator_actor_id: world.identity.userId,
  });
  expect(await world.channel()).toMatchObject({ creator_id: target.userId, state: 'ready' });

  const operationId = await banOwnedGames(world.t, admin, target.userId);
  await world.reconcile();
  expect(await world.channel()).toMatchObject({
    creator_id: target.userId,
    state: 'deleted',
    ban_operation_id: operationId,
  });
  expect(await world.t.run(async (ctx) => await ctx.db.get(world.gameId))).toMatchObject({
    creator_id: target.userId,
    creator_actor_id: world.identity.userId,
    state: 'expired',
    ban_operation_id: operationId,
  });
  expect(
    await world.t.withIdentity({ subject: world.spectator.subject }).query(api.playGameDirectory.getGameByAddress, {
      address: 'quiet-sietch',
    })
  ).toEqual({ status: 'not_found' });
  expect(discord.calls.filter((call) => call.method === 'DELETE' && call.path === '/channels/300')).toHaveLength(1);
});

test('creator backfill preserves lifecycle and ban cleanup metadata on replay', async () => {
  const t = playTest();
  const { channelId, creatorId } = await t.run(async (ctx) => {
    const creator = await playPerson(ctx, 'Banned');
    const profile = await ctx.db
      .query('profiles')
      .withIndex('by_user_id', (q) => q.eq('user_id', creator.userId))
      .unique();
    const stamp = new Date().toISOString();
    const operationId = await ctx.db.insert('account_deletion_operations', {
      kind: 'ban',
      source_user_id: creator.userId,
      source_profile_id: profile!._id,
      replacement_user_id: null,
      state: 'completed',
      phase: 'complete',
      snapshot_kind: null,
      snapshot_cursor: null,
      retry_count: 0,
      error: null,
      created_at: stamp,
      updated_at: stamp,
      completed_at: stamp,
    });
    const gameId = await ctx.db.insert('play_games', {
      name: 'Retired game',
      slug: 'retired-game',
      creator_id: creator.userId,
      state: 'expired',
      ban_operation_id: operationId,
      secret: 'a'.repeat(64),
      attempt_id: 'b'.repeat(64),
      provision_expires_at: Date.now(),
      created_at: Date.now(),
    });
    const channelId = await ctx.db.insert('play_game_discord_channels', {
      game_id: gameId,
      guild_id: '100',
      category_ids: ['200'],
      channel_id: '300',
      state: 'deleting',
      ban_operation_id: operationId,
      created_at: Date.now() - 60_000,
      ended_at: Date.now() - 30_000,
      renamed_ended: true,
      voice_checked_at: Date.now() - 20_000,
      work_revision: 9,
      lease_revision: 8,
      deletion_requested_at: Date.now() - 10_000,
      cleanup_at: Date.now(),
      next_attempt_at: Date.now() + 300_000,
      retry_after: Date.now() + 300_000,
      lease: 'unfinished-delete',
      lease_until: Date.now() + 600_000,
      error: 'Discord voice work could not finish.',
    });
    await ctx.db.patch(creator.userId, { account_state: 'banned' });
    await ctx.db.patch(profile!._id, { account_state: 'banned' });
    return { channelId, creatorId: creator.userId };
  });
  const before = await t.run(async (ctx) => await ctx.db.get(channelId));
  const ids = ['discord_channel_creators_v1', 'discord_channel_creators_verify_v1'];
  for (let replay = 0; replay < 2; replay += 1) {
    if (replay === 0) {
      await t.mutation(internal.migrations.runRequired, { ids });
      await t.finishAllScheduledFunctions(vi.runAllTimers);
    } else {
      await t.mutation(internal.discordMigrations.discord_channel_creators_v1, { reset: true });
      await t.finishAllScheduledFunctions(vi.runAllTimers);
      await t.mutation(internal.discordMigrations.discord_channel_creators_verify_v1, { reset: true });
      await t.finishAllScheduledFunctions(vi.runAllTimers);
    }
    await expect(t.query(internal.migrations.assertReadyForNarrow, { required: ids })).resolves.toMatchObject({
      ok: true,
    });
    expect(await t.run(async (ctx) => await ctx.db.get(channelId))).toEqual({ ...before, creator_id: creatorId });
  }
});
