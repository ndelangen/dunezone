/* @vitest-environment edge-runtime */

import { expect, test } from 'vite-plus/test';

import { internal } from './_generated/api';
import { playTest } from './play.test.fixture';

test('retire removes the approved markers atomically and preserves the channel records', async () => {
  const t = playTest();
  const { first, second, untouched } = await t.run(async (ctx) => {
    const gameId = await ctx.db.insert('play_games', {
      name: 'Quiet Sietch',
      slug: 'quiet-sietch',
      state: 'expired',
      secret: 'test',
      attempt_id: 'test',
      created_at: 10,
      provision_expires_at: 30,
    });
    const channel = {
      game_id: gameId,
      guild_id: '100',
      category_ids: ['200'],
      state: 'deleted' as const,
      created_at: 10,
      deleted_at: 30,
      cleanup_at: 30,
      next_attempt_at: 30,
    };
    return {
      first: await ctx.db.insert('play_game_discord_channels', { ...channel, ended_at: 20 }),
      second: await ctx.db.insert('play_game_discord_channels', { ...channel, ended_at: 21 }),
      untouched: await ctx.db.insert('play_game_discord_channels', channel),
    };
  });
  const read = () => t.run((ctx) => Promise.all([ctx.db.get(first), ctx.db.get(second), ctx.db.get(untouched)]));
  const before = await read();
  const rows = [
    { id: first, endedAt: 20 },
    { id: second, endedAt: 21 },
  ];
  await expect(
    t.mutation(internal.discordFinishMarker.retire, {
      rows: [
        { id: first, endedAt: 20 },
        { id: second, endedAt: 22 },
      ],
    })
  ).rejects.toThrow('changed since verification');
  expect(await read()).toEqual(before);

  await t.mutation(internal.discordFinishMarker.retire, { rows });
  await t.mutation(internal.discordFinishMarker.retire, { rows });
  expect(await read()).toEqual(
    before.map((row) => {
      if (!row) {
        throw new Error('Expected a channel record');
      }
      const { ended_at: _endedAt, ...channel } = row;
      return channel;
    })
  );
});
