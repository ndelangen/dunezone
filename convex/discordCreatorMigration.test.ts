/* @vitest-environment edge-runtime */

import { afterEach, beforeEach, expect, test, vi } from 'vite-plus/test';

import { api, internal } from './_generated/api';
import { playPerson, playRuleset, playTest } from './play.test.fixture';
import { configureDiscord } from './playDiscord.test.fixture';

beforeEach(() => {
  vi.useFakeTimers();
  configureDiscord();
  vi.stubEnv('TYPESAFE_API_KEY', '');
});
afterEach(() => {
  vi.clearAllTimers();
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

async function world() {
  const t = playTest();
  const { user, gameIds, rulesetId } = await t.run(async (ctx) => {
    const user = await playPerson(ctx, 'Creator');
    const rulesetId = await playRuleset(ctx, user.userId);
    const gameIds = [];
    for (let i = 0; i < 4; i++) {
      gameIds.push(
        await ctx.db.insert('play_games', {
          name: `Game ${i}`,
          slug: `game-${i}`,
          state: 'pending',
          ruleset_id: rulesetId,
          minimum_players: 4,
          discord_voice: true,
          creator_id: user.userId,
          secret: 'a'.repeat(64),
          attempt_id: 'b'.repeat(64),
          created_at: Date.now(),
          provision_expires_at: Date.now() + 60_000,
        })
      );
    }
    return { user, gameIds, rulesetId };
  });
  const confirm = (gameId: (typeof gameIds)[number]) =>
    t.mutation(api.playProvisioning.confirmProvisioning, {
      gameId,
      secret: 'a'.repeat(64),
      attemptId: 'b'.repeat(64),
    });
  return { t, user, gameIds, rulesetId, confirm, viewer: t.withIdentity({ subject: user.subject }) };
}

test('creator backfill handles legacy rows and replays without changes', async () => {
  const { t, user, gameIds } = await world();
  const rowId = await t.run(
    async (ctx) =>
      await ctx.db.insert('play_game_discord_channels', {
        game_id: gameIds[0]!,
        guild_id: '100',
        category_ids: ['200'],
        state: 'pending',
        created_at: Date.now(),
        cleanup_at: Date.now() + 60_000,
        next_attempt_at: Date.now(),
      })
  );
  const orphanId = await t.run(async (ctx) => {
    await ctx.db.delete(gameIds[2]!);
    return await ctx.db.insert('play_game_discord_channels', {
      game_id: gameIds[2]!,
      guild_id: '100',
      category_ids: ['200'],
      state: 'deleted',
      created_at: Date.now(),
      cleanup_at: Date.now(),
      next_attempt_at: Date.now(),
    });
  });
  const other = await t.run(async (ctx) => await playPerson(ctx, 'Previous creator'));
  const staleId = await t.run(
    async (ctx) =>
      await ctx.db.insert('play_game_discord_channels', {
        game_id: gameIds[1]!,
        creator_id: other.userId,
        guild_id: '100',
        category_ids: ['200'],
        state: 'ready',
        created_at: Date.now(),
        cleanup_at: Date.now() + 60_000,
        next_attempt_at: Date.now(),
      })
  );
  const ids = ['discord_channel_creators_v1', 'discord_channel_creators_verify_v1'];
  for (let pass = 0; pass < 2; pass++) {
    await t.mutation(internal.migrations.runRequired, { ids });
    await t.finishAllScheduledFunctions(vi.runAllTimers);
    await expect(t.query(internal.migrations.assertReadyForNarrow, { required: ids })).resolves.toMatchObject({
      ok: true,
    });
    expect(await t.run(async (ctx) => await ctx.db.get(rowId))).toMatchObject({ creator_id: user.userId });
    expect(await t.run(async (ctx) => await ctx.db.get(staleId))).toMatchObject({ creator_id: user.userId });
    expect(await t.run(async (ctx) => await ctx.db.get(orphanId))).toMatchObject({ creator_id: null });
  }
});
