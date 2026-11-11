/* @vitest-environment edge-runtime */

import { afterEach, beforeEach, expect, test, vi } from 'vite-plus/test';

import { internal } from './_generated/api';
import { DISCORD_BATCH } from './lib/playDiscord';
import { configureDiscord, voiceWorld } from './playDiscord.test.fixture';

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

test('full batches in every state share one continuation and leave no due rows behind', async () => {
  const world = await voiceWorld();
  await world.t.run(async (ctx) => {
    const row = (await ctx.db.query('play_game_discord_channels').first())!;
    const { _id, _creationTime, ...fields } = row;
    await ctx.db.delete(_id);
    for (const state of ['pending', 'ready', 'deleting'] as const) {
      for (let i = 0; i <= DISCORD_BATCH; i += 1) {
        await ctx.db.insert('play_game_discord_channels', { ...fields, state });
      }
    }
  });
  await world.t.mutation(internal.playDiscord.retryDue, {});
  const queued = () =>
    world.t.run(async (ctx) =>
      (await ctx.db.system.query('_scheduled_functions').take(200)).filter((job) => job.name === 'playDiscord:retryDue')
    );
  expect(await queued()).toHaveLength(1);
  await world.t.mutation(internal.playDiscord.retryDue, {});
  expect(await queued()).toHaveLength(1);
  expect(
    await world.t.run(async (ctx) => {
      const rows = await ctx.db.query('play_game_discord_channels').take(100);
      return rows.filter((row) => row.next_attempt_at <= Date.now());
    })
  ).toEqual([]);
});
