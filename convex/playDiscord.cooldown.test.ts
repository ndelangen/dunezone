/* @vitest-environment edge-runtime */

import { afterEach, beforeEach, expect, test, vi } from 'vite-plus/test';

import { internal } from './_generated/api';
import { DiscordRest } from './lib/discordRest';
import type { DiscordRequestGate } from './lib/discordRest';
import { DISCORD_RETRY, requestDiscordDeletion } from './lib/playDiscord';
import { playRateLimiter } from './lib/playRateLimits';
import { configureDiscord, discordStub, voiceWorld } from './playDiscord.test.fixture';

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

test('one global rate limit pauses other games, including their already-running clients', async () => {
  const discord = discordStub();
  const world = await voiceWorld();
  const gate: DiscordRequestGate = {
    inspect: (scope) => world.t.query(internal.playDiscordRateLimits.inspect, scope),
    observe: (observation) => world.t.mutation(internal.playDiscordRateLimits.observe, observation),
  };
  const first = new DiscordRest('test-token', 'First game', gate);
  const second = new DiscordRest('test-token', 'Second game', gate);
  discord.fetch.mockResolvedValue(Response.json({ retry_after: 60, global: true }, { status: 429 }));
  await expect(first.invite('300')).rejects.toMatchObject({ status: 429, retryAfterMs: 60_000 });
  await expect(second.invite('301')).rejects.toMatchObject({ status: 429, retryAfterMs: 60_000 });
  expect(discord.fetch).toHaveBeenCalledTimes(1);
  await gate.observe({
    route: 'channelInvite.create',
    major: 'channel:300',
    limit: { until: Date.now() + 1000, global: true },
  });
  expect(
    (await world.t.query(internal.playDiscordRateLimits.inspect, { route: 'gatewayBot.read', major: 'none' }))
      ?.globalUntil
  ).toBe(Date.now() + 60_000);
  expect(await world.t.mutation(internal.playDiscord.claim, { channelId: (await world.channel())!._id })).toBeNull();
});

async function nextRetry(world: Awaited<ReturnType<typeof voiceWorld>>) {
  const jobs = await world.t.run(async (ctx) => await ctx.db.system.query('_scheduled_functions').take(100));
  const retry = jobs
    .filter((job) => job.name === 'playDiscordActions:reconcile' && job.scheduledTime > Date.now())
    .sort((a, b) => a.scheduledTime - b.scheduledTime)[0];
  expect(retry).toBeDefined();
  return retry!;
}

test.each([false, true])(
  'a short rate limit releases its action and retries at its deadline, global=%s',
  async (global) => {
    const discord = discordStub();
    const world = await voiceWorld();
    discord.fetch.mockResolvedValueOnce(Response.json({ retry_after: 1, global }, { status: 429 }));
    await world.reconcile();
    expect(discord.fetch).toHaveBeenCalledTimes(1);
    expect((await world.channel())!.lease).toBeUndefined();
    expect((await world.channel())!.retry_after).toBe(Date.now() + 1000);
    expect((await world.channel())!.retry).toMatchObject({
      kind: 'bounded',
      operation: 'provision',
      attempts: 1,
      needsAttention: false,
      until: Date.now() + 1000,
    });
    const retry = await nextRetry(world);
    expect(retry.scheduledTime).toBe(Date.now() + 1000);
    await world.reconcile();
    expect(discord.fetch).toHaveBeenCalledTimes(1);
    vi.setSystemTime(retry.scheduledTime);
    await world.t.action(internal.playDiscordActions.reconcile, retry.args[0]);
    expect(await world.channel()).toMatchObject({ state: 'ready' });
  }
);

test.each(['user', 'shared', 'global'] as const)(
  'discard during an in-flight %s invite limit consults the DELETE scope',
  async (scope) => {
    const discord = discordStub();
    const world = await voiceWorld();
    const normal = discord.fetch.getMockImplementation()!;
    discord.fetch.mockImplementation(async (input, options) => {
      if (
        options?.method === 'POST' &&
        (input instanceof Request ? input.url : String(input)).endsWith('/channels/300/invites')
      ) {
        await world.publish(2, world.summary(undefined, { stage: 'discarded' }));
        return Response.json(
          { retry_after: 60, global: scope === 'global' },
          { status: 429, headers: { 'X-RateLimit-Scope': scope, 'X-RateLimit-Bucket': 'invites' } }
        );
      }
      return await normal(input, options);
    });
    await world.reconcile();
    const until = Date.now() + 60_000;
    expect((await world.channel())!.retry_after).toBe(scope === 'global' ? until : undefined);
    expect((await world.channel())!.retry).toBeUndefined();
    const before = discord.fetch.mock.calls.length;
    await world.reconcile();
    if (scope === 'global') {
      expect(discord.fetch).toHaveBeenCalledTimes(before);
      expect((await world.channel())!.next_attempt_at).toBe(until);
      vi.setSystemTime(until);
      await world.reconcile();
    } else {
      expect(
        await world.t.query(internal.playDiscordRateLimits.inspect, {
          route: 'channelInvite.create',
          major: 'channel:300',
        })
      ).toMatchObject({ blockedUntil: until, globalUntil: 0 });
      expect(
        await world.t.query(internal.playDiscordRateLimits.inspect, {
          route: 'channel.delete',
          major: 'channel:300',
        })
      ).toMatchObject({ blockedUntil: 0, globalUntil: 0 });
    }
    expect(await world.channel()).toMatchObject({ state: 'deleted' });
    expect(discord.calls.filter((call) => call.method === 'DELETE')).toHaveLength(1);
  }
);

test('a queued room cannot bypass its retry-after deadline', async () => {
  const discord = discordStub();
  const normal = discord.fetch.getMockImplementation()!;
  discord.fetch.mockImplementation(async (input, options) => {
    if (input === 'https://discord.com/api/v10/guilds/100/channels') {
      return Response.json({ retry_after: 60, global: true }, { status: 429 });
    }
    return await normal(input, options);
  });
  const world = await voiceWorld();
  await world.reconcile();
  const called = discord.fetch.mock.calls.length;
  await world.reconcile();
  expect(discord.fetch.mock.calls).toHaveLength(called);
  expect(await world.channel()).toMatchObject({ retry_after: Date.now() + 60_000 });
});

test("retirement supersedes a parked rename while retaining Discord's global deadline", async () => {
  const discord = discordStub();
  const world = await voiceWorld();
  await world.reconcile();
  const row = (await world.channel())!;
  await world.t.mutation(internal.playDiscordRateLimits.observe, {
    route: 'gatewayBot.read',
    major: 'none',
    limit: { until: Date.now() + 60_000, global: true },
  });
  await world.t.run(async (ctx) => {
    await ctx.db.patch(row._id, {
      retry_after: Date.now() + 120_000,
      renamed_ended: true,
      retry: {
        kind: 'bounded',
        operation: 'rename-active',
        attempts: 3,
        needsAttention: true,
        revision: row.work_revision ?? 0,
      },
    });
    await requestDiscordDeletion(ctx, (await ctx.db.get(row._id))!);
  });
  expect((await world.channel())!.retry_after).toBeUndefined();
  await world.reconcile();
  expect(discord.calls.filter((call) => call.method === 'DELETE')).toHaveLength(0);
  vi.setSystemTime(Date.now() + 60_000);
  await world.reconcile();
  expect(await world.channel()).toMatchObject({ state: 'deleted' });
  expect(discord.calls.filter((call) => call.method === 'DELETE')).toHaveLength(1);
});

test.each([false, true])(
  'repeated short limits park after three attempts and retain inactivity cleanup, global=%s',
  async (global) => {
    const discord = discordStub();
    const world = await voiceWorld();
    discord.fetch.mockImplementation(async () => Response.json({ retry_after: 1, global }, { status: 429 }));
    await world.reconcile();
    const firstRetry = await nextRetry(world);
    for (let attempt = 1; attempt < 3; attempt += 1) {
      const retry = await nextRetry(world);
      expect(retry.scheduledTime).toBe(Date.now() + 1000);
      vi.setSystemTime(retry.scheduledTime);
      await world.t.action(internal.playDiscordActions.reconcile, retry.args[0]);
    }
    expect(discord.fetch).toHaveBeenCalledTimes(3);
    const parked = (await world.channel())!;
    expect(parked.retry).toMatchObject({
      kind: 'bounded',
      operation: 'provision',
      attempts: 3,
      needsAttention: true,
      revision: parked.work_revision ?? 0,
    });
    expect(parked.next_attempt_at).toBe(parked.cleanup_at);
    expect(parked.lease).toBeUndefined();
    vi.setSystemTime(Date.now() + DISCORD_RETRY);
    await world.t.mutation(internal.playDiscord.retryDue, {});
    await world.reconcile();
    await world.t.action(internal.playDiscordActions.reconcile, firstRetry.args[0]);
    expect(discord.fetch).toHaveBeenCalledTimes(3);
    expect((await world.channel())!.retry).toEqual(parked.retry);
  }
);

test('definite creation retries reuse one creation reservation and the same category', async () => {
  const discord = discordStub();
  const world = await voiceWorld();
  await world.t.run((ctx) => playRateLimiter.limit(ctx, 'discordChannelCreateGlobal', { count: 29 }));
  const normal = discord.fetch.getMockImplementation()!;
  let posts = 0;
  discord.fetch.mockImplementation(async (input, options) => {
    if (
      options?.method === 'POST' &&
      (input instanceof Request ? input.url : String(input)).endsWith('/guilds/100/channels') &&
      posts++ < 2
    ) {
      return Response.json({ retry_after: 1 }, { status: 429 });
    }
    return await normal(input, options);
  });
  await world.reconcile();
  for (let attempt = 0; attempt < 2; attempt += 1) {
    const retry = await nextRetry(world);
    vi.setSystemTime(retry.scheduledTime);
    await world.t.action(internal.playDiscordActions.reconcile, retry.args[0]);
  }
  expect(posts).toBe(3);
  expect(await world.channel()).toMatchObject({ state: 'ready', channel_id: '300' });
  expect(discord.calls.filter((call) => call.path === '/guilds/100/channels' && call.method === 'GET')).toHaveLength(1);
});

test.each(['discard', 'cron'] as const)(
  'a duplicate creation retry respects the work already accepted by %s',
  async (winner) => {
    const discord = discordStub();
    const world = await voiceWorld();
    await world.t.run((ctx) => playRateLimiter.limit(ctx, 'discordChannelCreateGlobal', { count: 29 }));
    const normal = discord.fetch.getMockImplementation()!;
    let posts = 0;
    discord.fetch.mockImplementation(async (input, options) => {
      if (
        options?.method === 'POST' &&
        (input instanceof Request ? input.url : String(input)).endsWith('/guilds/100/channels')
      ) {
        posts += 1;
        return Response.json({ retry_after: 1 }, { status: 429 });
      }
      return await normal(input, options);
    });
    await world.reconcile();
    const retry = await nextRetry(world);
    if (winner === 'discard') {
      await world.publish(2, world.summary(undefined, { stage: 'discarded' }));
      await world.reconcile();
      expect(await world.channel()).toMatchObject({ state: 'deleted' });
    } else {
      vi.setSystemTime(retry.scheduledTime);
      await world.reconcile();
      expect(posts).toBe(2);
    }
    const before = discord.fetch.mock.calls.length;
    vi.setSystemTime(retry.scheduledTime);
    await world.t.action(internal.playDiscordActions.reconcile, retry.args[0]);
    expect(discord.fetch).toHaveBeenCalledTimes(before);
    if (winner === 'cron') {
      const finalRetry = await nextRetry(world);
      vi.setSystemTime(finalRetry.scheduledTime);
      await world.reconcile();
      expect(posts).toBe(3);
      const parked = (await world.channel())!;
      expect(parked.retry).toMatchObject({
        kind: 'bounded',
        operation: 'provision',
        attempts: 3,
        needsAttention: true,
      });
      expect(parked.next_attempt_at).toBe(parked.cleanup_at);
      vi.setSystemTime(Date.now() + DISCORD_RETRY);
      await world.t.mutation(internal.playDiscord.retryDue, {});
      await world.reconcile();
      expect(posts).toBe(3);
    }
  }
);

test('a lost creation response after a scheduled retry parks without a replacement POST', async () => {
  const discord = discordStub();
  const world = await voiceWorld();
  const normal = discord.fetch.getMockImplementation()!;
  let posts = 0;
  discord.fetch.mockImplementation(async (input, options) => {
    if (options?.method === 'GET' && input === 'https://discord.com/api/v10/guilds/100/channels') {
      return Response.json([{ id: '200', type: 4, name: 'Games', guild_id: '100' }]);
    }
    if (
      options?.method === 'POST' &&
      (input instanceof Request ? input.url : String(input)).endsWith('/guilds/100/channels')
    ) {
      if (posts++ === 0) {
        return Response.json({ retry_after: 1 }, { status: 429 });
      }
      throw new Error('Response lost');
    }
    return await normal(input, options);
  });
  await world.reconcile();
  const retry = await nextRetry(world);
  vi.setSystemTime(retry.scheduledTime);
  await world.t.action(internal.playDiscordActions.reconcile, retry.args[0]);
  expect(await world.channel()).toMatchObject({ state: 'creating' });
  vi.setSystemTime(Date.now() + DISCORD_RETRY);
  await world.t.mutation(internal.playDiscord.retryDue, {});
  await world.reconcile();
  expect(posts).toBe(2);
  expect(await world.channel()).toMatchObject({
    state: 'creating',
    retry: { kind: 'bounded', operation: 'provision', attempts: 3, needsAttention: true },
  });
  vi.setSystemTime(Date.now() + DISCORD_RETRY);
  await world.t.mutation(internal.playDiscord.retryDue, {});
  await world.reconcile();
  expect(posts).toBe(2);
});
