/* @vitest-environment edge-runtime */

import { afterEach, beforeEach, expect, test, vi } from 'vite-plus/test';

import { internal } from './_generated/api';
import { DiscordRest } from './lib/discordRest';
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
  const cooldown = {
    until: () => world.t.query(internal.playDiscord.cooldownUntil, {}),
    hold: (until: number) => world.t.mutation(internal.playDiscord.holdRequests, { until }),
  };
  const first = new DiscordRest('test-token', 'First game', cooldown);
  const second = new DiscordRest('test-token', 'Second game', cooldown);
  discord.fetch.mockResolvedValue(Response.json({ retry_after: 60, global: true }, { status: 429 }));
  await expect(first.invite('300')).rejects.toMatchObject({ status: 429, retryAfterMs: 60_000 });
  await expect(second.invite('301')).rejects.toMatchObject({ status: 429, retryAfterMs: 60_000 });
  expect(discord.fetch).toHaveBeenCalledTimes(1);
  await cooldown.hold(Date.now() + 1000);
  expect(await cooldown.until()).toBe(Date.now() + 60_000);
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

test('a short rate limit releases its action and retries at the shared deadline', async () => {
  const discord = discordStub();
  const world = await voiceWorld();
  discord.fetch.mockResolvedValueOnce(Response.json({ retry_after: 1, global: true }, { status: 429 }));
  await world.reconcile();
  expect(discord.fetch).toHaveBeenCalledTimes(1);
  expect((await world.channel())!.lease).toBeUndefined();
  const retry = await nextRetry(world);
  expect(retry.scheduledTime).toBe(Date.now() + 1000);
  vi.setSystemTime(retry.scheduledTime);
  await world.t.action(internal.playDiscordActions.reconcile, retry.args[0]);
  expect(await world.channel()).toMatchObject({ state: 'ready' });
});

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

test("retirement supersedes application backoff while retaining Discord's hard deadline", async () => {
  const discord = discordStub();
  const world = await voiceWorld();
  await world.reconcile();
  const row = (await world.channel())!;
  await world.t.run(async (ctx) => {
    await ctx.db.patch(row._id, {
      retry_after: Date.now() + 60_000,
      retry: { kind: 'backoff', until: Date.now() + DISCORD_RETRY, revision: row.work_revision ?? 0 },
    });
    await requestDiscordDeletion(ctx, (await ctx.db.get(row._id))!);
  });
  await world.reconcile();
  expect(discord.calls.filter((call) => call.method === 'DELETE')).toHaveLength(0);
  vi.setSystemTime(Date.now() + 60_000);
  await world.reconcile();
  expect(await world.channel()).toMatchObject({ state: 'deleted' });
  expect(discord.calls.filter((call) => call.method === 'DELETE')).toHaveLength(1);
});

test('repeated short rate limits stop after three attempts and retain the long backoff', async () => {
  const discord = discordStub();
  const world = await voiceWorld();
  discord.fetch.mockImplementation(async () => Response.json({ retry_after: 1, global: true }, { status: 429 }));
  await world.reconcile();
  for (let attempt = 1; attempt < 3; attempt += 1) {
    const retry = await nextRetry(world);
    expect(retry.scheduledTime).toBe(Date.now() + 1000);
    vi.setSystemTime(retry.scheduledTime);
    await world.t.action(internal.playDiscordActions.reconcile, retry.args[0]);
  }
  expect(discord.fetch).toHaveBeenCalledTimes(3);
  expect((await world.channel())!.next_attempt_at).toBe(Date.now() + DISCORD_RETRY);
  const retry = await nextRetry(world);
  expect(retry.scheduledTime).toBe(Date.now() + DISCORD_RETRY);
  vi.setSystemTime(Date.now() + 1000);
  await world.reconcile();
  expect(discord.fetch).toHaveBeenCalledTimes(3);
  vi.setSystemTime(retry.scheduledTime);
  await world.t.action(internal.playDiscordActions.reconcile, retry.args[0]);
  expect(discord.fetch).toHaveBeenCalledTimes(4);
});

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
      expect((await world.channel())!.next_attempt_at).toBe(Date.now() + DISCORD_RETRY);
    }
  }
);

test('a lost creation response after a scheduled retry never schedules another creation', async () => {
  const discord = discordStub();
  const world = await voiceWorld();
  const normal = discord.fetch.getMockImplementation()!;
  let posts = 0;
  discord.fetch.mockImplementation(async (input, options) => {
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
});
