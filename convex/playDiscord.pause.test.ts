/* @vitest-environment edge-runtime */

import { afterEach, beforeEach, expect, test, vi } from 'vite-plus/test';

import { DiscordRest } from './lib/discordRest';
import { configureDiscord, discordStub, voiceWorld } from './playDiscord.test.fixture';

beforeEach(() => {
  vi.useFakeTimers();
  configureDiscord();
});
afterEach(() => {
  vi.clearAllTimers();
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

test('pausing before the channel POST leaves a known-unsent creation retryable', async () => {
  const discord = discordStub();
  const world = await voiceWorld();
  const create = DiscordRest.prototype.create;
  vi.spyOn(DiscordRest.prototype, 'create').mockImplementationOnce(async function (this: DiscordRest, ...args) {
    await world.t.run(async (ctx) => {
      await ctx.db.insert('play_discord_settings', { enabled: false, updated_at: Date.now() });
    });
    return await create.apply(this, args);
  });
  await world.reconcile();
  expect(await world.channel()).toMatchObject({ state: 'pending' });
  expect(discord.calls.filter(({ method }) => method === 'POST')).toHaveLength(0);
  await world.t.run(async (ctx) => {
    const settings = (await ctx.db.query('play_discord_settings').unique())!;
    await ctx.db.patch(settings._id, { enabled: true });
  });
  await world.reconcile();
  expect(await world.channel()).toMatchObject({ state: 'ready', channel_id: '300' });
});

test('pausing keeps the shared invite and prevents due cleanup', async () => {
  const discord = discordStub();
  const world = await voiceWorld();
  await world.reconcile();
  const channel = (await world.channel())!;
  await world.t.run(async (ctx) => {
    await ctx.db.insert('play_discord_settings', { enabled: false, updated_at: Date.now() });
    await ctx.db.patch(channel._id, { cleanup_at: Date.now() - 1 });
  });
  await world.reconcile();
  expect(await world.menu()).toMatchObject({ voice: { url: 'https://discord.gg/shared-room' } });
  expect(discord.calls.some(({ method }) => method === 'DELETE')).toBe(false);
});
