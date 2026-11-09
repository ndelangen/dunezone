/* @vitest-environment edge-runtime */

import { afterEach, beforeEach, expect, test, vi } from 'vite-plus/test';

import { api } from './_generated/api';
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

test('seated players and spectators get the same invite without connecting Discord', async () => {
  const discord = discordStub();
  const world = await voiceWorld();
  expect(await world.menu()).toMatchObject({ voice: null });
  await world.reconcile();
  const calls = discord.calls.length;
  const spectator = world.t.withIdentity({ subject: world.spectator.subject });
  const seated = await world.menu();
  const watching = await spectator.query(api.playGameDirectory.getGameByAddress, { address: 'quiet-sietch' });
  expect(seated).toMatchObject({ voice: { url: 'https://discord.gg/shared-room' } });
  expect(watching).toMatchObject({ voice: { url: 'https://discord.gg/shared-room' } });
  expect(discord.calls).toHaveLength(calls);
  expect(discord.calls.some((call) => /permissions|members/.test(call.path))).toBe(false);
  await world.t.run(async (ctx) => {
    for (const userId of [world.identity.userId, world.spectator.userId]) {
      const account = await ctx.db
        .query('authAccounts')
        .withIndex('userIdAndProvider', (q) => q.eq('userId', userId).eq('provider', 'discord'))
        .first();
      expect(account).toBeNull();
    }
  });
});

test('leaving a seat does not change the shared voice link or call Discord', async () => {
  const discord = discordStub();
  const world = await voiceWorld();
  await world.reconcile();
  const calls = discord.calls.length;
  await world.publish(2, world.summary([]));
  await world.reconcile();
  expect(await world.menu()).toMatchObject({ voice: { url: 'https://discord.gg/shared-room' } });
  expect(discord.calls).toHaveLength(calls);
});
