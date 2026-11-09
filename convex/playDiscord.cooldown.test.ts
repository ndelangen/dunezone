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

test('one game rate limit pauses other games, including their already-running clients', async () => {
  const discord = discordStub();
  const world = await voiceWorld();
  const cooldown = {
    until: () => world.t.query(internal.playDiscord.cooldownUntil, {}),
    hold: (until: number) => world.t.mutation(internal.playDiscord.holdRequests, { until }),
  };
  const first = new DiscordRest('test-token', 'First game', cooldown);
  const second = new DiscordRest('test-token', 'Second game', cooldown);
  discord.fetch.mockResolvedValue(Response.json({ retry_after: 60 }, { status: 429 }));
  await expect(first.member('100', '400')).rejects.toMatchObject({ status: 429, retryAfterMs: 60_000 });
  await expect(second.member('100', '401')).rejects.toMatchObject({ status: 429, retryAfterMs: 60_000 });
  expect(discord.fetch).toHaveBeenCalledTimes(1);
  await cooldown.hold(Date.now() + 1000);
  expect(await cooldown.until()).toBe(Date.now() + 60_000);
  expect(await world.t.mutation(internal.playDiscord.claim, { channelId: (await world.channel())!._id })).toBeNull();
});

test('a short rate limit waits, then retries with the shared deadline checked again', async () => {
  const discord = discordStub();
  const world = await voiceWorld();
  const rest = new DiscordRest('test-token', 'First game', {
    until: () => world.t.query(internal.playDiscord.cooldownUntil, {}),
    hold: (until) => world.t.mutation(internal.playDiscord.holdRequests, { until }),
  });
  discord.fetch.mockResolvedValueOnce(Response.json({ retry_after: 1 }, { status: 429 }));
  const result = rest.member('100', '400');
  await vi.waitFor(async () =>
    expect(await world.t.query(internal.playDiscord.cooldownUntil, {})).toBeGreaterThan(Date.now())
  );
  expect(discord.fetch).toHaveBeenCalledTimes(1);
  await vi.advanceTimersByTimeAsync(1000);
  expect(await result).toBe(true);
  expect(discord.fetch).toHaveBeenCalledTimes(2);
});
