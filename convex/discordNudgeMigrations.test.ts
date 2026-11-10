// @vitest-environment edge-runtime
import { expect, test } from 'vite-plus/test';

import { internal } from './_generated/api';
import { playTest } from './play.test.fixture';

const batch = { cursor: null, dryRun: false, oneBatchOnly: true, batchSize: 100 };

test('retirement deletes a bounded page of legacy deliveries and replays safely', async () => {
  const t = playTest();
  const gameId = await t.run(async (ctx) => {
    const gameId = await ctx.db.insert('play_games', {
      name: 'Retained game',
      slug: 'retained-game',
      state: 'ready',
      secret: 'a'.repeat(64),
      attempt_id: 'b'.repeat(64),
      created_at: 0,
      provision_expires_at: 0,
    });
    for (let index = 0; index < 101; index += 1) {
      await ctx.db.insert('play_game_discord_nudges', {
        game_id: gameId,
        to_seat: `seat-${index}`,
        nudge_id: `old-${index}`,
        from_faction_name: 'Atreides',
        at: 0,
        state: 'failed',
        attempts: 1,
      });
    }
    return gameId;
  });
  const game = await t.run((ctx) => ctx.db.get(gameId));
  expect(await t.query(internal.discordNudgeMigrations.verifyRetired, {})).toEqual({ empty: false });
  expect(await t.mutation(internal.discordNudgeMigrations.retire, batch)).toMatchObject({ isDone: false });
  expect(await t.run((ctx) => ctx.db.query('play_game_discord_nudges').take(2))).toHaveLength(1);
  await t.mutation(internal.discordNudgeMigrations.retire, batch);
  expect(await t.query(internal.discordNudgeMigrations.verifyRetired, {})).toEqual({ empty: true });
  await t.mutation(internal.discordNudgeMigrations.retire, batch);
  expect(await t.query(internal.discordNudgeMigrations.verifyRetired, {})).toEqual({ empty: true });
  expect(await t.run((ctx) => ctx.db.get(gameId))).toEqual(game);
});
