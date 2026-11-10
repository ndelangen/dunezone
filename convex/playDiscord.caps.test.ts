/* @vitest-environment edge-runtime */

import { afterEach, beforeEach, expect, test, vi } from 'vite-plus/test';

import { api, internal } from './_generated/api';
import type { Id } from './_generated/dataModel';
import { playRateLimiter } from './lib/playRateLimits';
import { playPerson, playRuleset, playTest } from './play.test.fixture';
import { configureDiscord, discordStub, voiceWorld } from './playDiscord.test.fixture';

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

test('concurrent confirmations reserve at most three channels and leave the fourth game without voice', async () => {
  const { t, gameIds, confirm, viewer } = await world();
  const results = await Promise.all(gameIds.map(confirm));
  expect(results).toEqual(gameIds.map(() => ({ ok: true })));
  const rows = await t.run(async (ctx) => await ctx.db.query('play_game_discord_channels').collect());
  expect(rows).toHaveLength(3);
  expect(await viewer.query(api.playGames.creatable, {})).toMatchObject({ discordVoiceAtLimit: true });
  const games = await t.run(async (ctx) => await Promise.all(gameIds.map((id) => ctx.db.get(id))));
  expect(games.filter((game) => game?.discord_voice === false)).toHaveLength(1);
  await t.run(async (ctx) => await ctx.db.patch(rows[0]!._id, { state: 'deleting' }));
  expect(await viewer.query(api.playGames.creatable, {})).toMatchObject({ discordVoiceAtLimit: false });
});

test('the global create budget delays channels from different creators until retryDue runs after refill', async () => {
  const discord = discordStub(['300', '301']);
  const { t, gameIds, confirm } = await world();
  const other = await t.run(async (ctx) => await playPerson(ctx, 'Another creator'));
  await t.run(async (ctx) => await ctx.db.patch(gameIds[1]!, { creator_id: other.userId }));
  await confirm(gameIds[0]!);
  await confirm(gameIds[1]!);
  const rows = await t.run(async (ctx) => await ctx.db.query('play_game_discord_channels').collect());
  await t.run(async (ctx) => await playRateLimiter.limit(ctx, 'discordChannelCreateGlobal', { count: 30 }));
  for (const row of rows) {
    await t.action(internal.playDiscordActions.reconcile, { channelId: row._id });
  }
  for (const row of rows) {
    const pending = (await t.run(async (ctx) => await ctx.db.get(row._id)))!;
    expect(pending.state).toBe('pending');
    expect(pending.next_attempt_at).toBeGreaterThan(Date.now());
  }
  expect(discord.calls.filter((call) => call.method === 'POST')).toHaveLength(0);
  vi.advanceTimersByTime(4 * 60_000);
  await t.mutation(internal.playDiscord.retryDue, {});
  await t.finishAllScheduledFunctions(vi.runAllTimers);
  for (const row of rows) {
    expect(await t.run(async (ctx) => await ctx.db.get(row._id))).toMatchObject({ state: 'ready' });
  }
  expect(discord.calls.filter((call) => call.path === '/guilds/100/channels' && call.method === 'POST')).toHaveLength(
    2
  );
});

test('game creation remains available at the voice cap and voice returns after deletion', async () => {
  const { t, gameIds, rulesetId, confirm, viewer } = await world();
  for (const gameId of gameIds.slice(0, 3)) {
    await confirm(gameId);
  }
  const create = (generatedName: string) =>
    viewer.action(api.playGames.createGeneratedGame, {
      rulesetId,
      minimumPlayers: 4,
      generatedName,
      discordVoice: true,
    });
  const fourth = await create('Secret Caladan picnic');
  expect(fourth.ok).toBe(true);
  if (!fourth.ok) {
    throw new Error('Game creation failed');
  }
  expect(await t.run(async (ctx) => await ctx.db.get(fourth.gameId as Id<'play_games'>))).toMatchObject({
    discord_voice: false,
  });
  const row = (await t.run(async (ctx) => await ctx.db.query('play_game_discord_channels').first()))!;
  await t.run(async (ctx) => await ctx.db.patch(row._id, { state: 'deleted' }));
  const next = await create('Arrakeen surprise party');
  expect(next.ok).toBe(true);
  if (!next.ok) {
    throw new Error('Game creation failed');
  }
  const game = await t.run(async (ctx) => await ctx.db.get(next.gameId as Id<'play_games'>));
  expect(game).toMatchObject({ discord_voice: true });
  await t.mutation(api.playProvisioning.confirmProvisioning, {
    gameId: game!._id,
    secret: game!.secret,
    attemptId: game!.attempt_id,
  });
  expect(
    await t.run(
      async (ctx) =>
        await ctx.db
          .query('play_game_discord_channels')
          .withIndex('by_game_id', (q) => q.eq('game_id', game!._id))
          .unique()
    )
  ).toMatchObject({ state: 'pending' });
});

test('discarding a channel removes its game from active voice candidates before DELETE completes', async () => {
  const discord = discordStub();
  const world = await voiceWorld();
  await world.reconcile();
  expect(await world.t.run((ctx) => ctx.db.get(world.gameId))).toMatchObject({ discord_voice: true });
  const normal = discord.fetch.getMockImplementation()!;
  discord.fetch.mockImplementation(async (input, options) => {
    if (options?.method === 'DELETE') {
      expect(await world.channel()).toMatchObject({ state: 'deleting' });
      expect(await world.t.run((ctx) => ctx.db.get(world.gameId))).toMatchObject({ discord_voice: false });
    }
    return normal(input, options);
  });
  await world.publish(2, world.summary(undefined, { stage: 'discarded' }));
  await world.reconcile();
  expect(await world.channel()).toMatchObject({ state: 'deleted' });
  expect(await world.t.run((ctx) => ctx.db.get(world.gameId))).toMatchObject({ discord_voice: false });
});
