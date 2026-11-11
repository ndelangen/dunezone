/* @vitest-environment edge-runtime */

import { afterEach, beforeEach, expect, test, vi } from 'vite-plus/test';

import { internal } from './_generated/api';
import { DiscordRest } from './lib/discordRest';
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

test('a global rate limit pauses other games, including their already-running clients', async () => {
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

test('a short global rate limit waits, then retries with the shared deadline checked again', async () => {
  const discord = discordStub();
  const world = await voiceWorld();
  const rest = new DiscordRest('test-token', 'First game', {
    until: () => world.t.query(internal.playDiscord.cooldownUntil, {}),
    hold: (until) => world.t.mutation(internal.playDiscord.holdRequests, { until }),
  });
  discord.fetch.mockResolvedValueOnce(Response.json({ retry_after: 1, global: true }, { status: 429 }));
  const result = rest.invite('300');
  await vi.waitFor(async () =>
    expect(await world.t.query(internal.playDiscord.cooldownUntil, {})).toBeGreaterThan(Date.now())
  );
  expect(discord.fetch).toHaveBeenCalledTimes(1);
  await vi.advanceTimersByTimeAsync(1000);
  expect(await result).toBe('https://discord.gg/shared-room');
  expect(discord.fetch).toHaveBeenCalledTimes(2);
});

test('a queued room cannot bypass its retry-after deadline', async () => {
  const discord = discordStub();
  const normal = discord.fetch.getMockImplementation()!;
  discord.fetch.mockImplementation(async (input, options) => {
    if (input === 'https://discord.com/api/v10/guilds/100/channels') {
      return Response.json({ retry_after: 60 }, { status: 429 });
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

test('repeated short global rate limits stop after three attempts and retain the cooldown', async () => {
  const discord = discordStub();
  const world = await voiceWorld();
  const rest = new DiscordRest('test-token', 'Dune Play', {
    until: () => world.t.query(internal.playDiscord.cooldownUntil, {}),
    hold: (until) => world.t.mutation(internal.playDiscord.holdRequests, { until }),
  });
  discord.fetch.mockImplementation(async () => Response.json({ retry_after: 1, global: true }, { status: 429 }));
  const result = expect(rest.invite('300')).rejects.toMatchObject({ status: 429, retryAfterMs: 1000 });
  await vi.waitFor(() => expect(discord.fetch).toHaveBeenCalledTimes(1));
  await vi.advanceTimersByTimeAsync(2000);
  await result;
  expect(discord.fetch).toHaveBeenCalledTimes(3);
  expect(await world.t.query(internal.playDiscord.cooldownUntil, {})).toBeGreaterThan(Date.now());
});
