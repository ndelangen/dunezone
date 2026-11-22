/* @vitest-environment edge-runtime */

import { afterEach, beforeEach, expect, test, vi } from 'vite-plus/test';

import { api, internal } from './_generated/api';
import type { Id } from './_generated/dataModel';
import { playPerson, playRuleset, playTest } from './play.test.fixture';
import { configureDiscord, discordStub } from './playDiscord.test.fixture';

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

async function creationWorld() {
  const t = playTest();
  const player = await t.run(async (ctx) => await playPerson(ctx, 'Voice creator'));
  const rulesetId = await t.run(async (ctx) => await playRuleset(ctx, player.userId));
  const viewer = t.withIdentity({ subject: player.subject });
  return { t, viewer, settings: { rulesetId, minimumPlayers: 4 as const, lastTurn: 6 } };
}

for (const path of ['generated', 'custom'] as const) {
  test.each([true, false, undefined])(
    `${path} creation preserves Discord voice choice %s`,
    async (discordVoice) => {
      const discord = discordStub();
      const { t, viewer, settings } = await creationWorld();
      const args = { ...settings, ...(discordVoice === undefined ? {} : { discordVoice }) };
      const outcome =
        path === 'generated'
          ? await viewer.action(api.playGames.createGeneratedGame, { ...args, generatedName: 'Secret Caladan picnic' })
          : await viewer.action(api.playGames.createGameWithName, { ...args, name: 'Quiet Sietch' });
      if (!outcome.ok) {
        throw new Error(`Game creation failed: ${outcome.reason}`);
      }
      const game = await t.run(async (ctx) => await ctx.db.get('play_games', outcome.gameId as Id<'play_games'>));
      expect(game).toMatchObject({
        discord_voice: discordVoice === true,
        name: path === 'generated' ? 'Secret Caladan picnic' : 'Quiet Sietch',
        minimum_players: 4,
        last_turn: 6,
      });
      if (!game) {
        throw new Error('Created game is missing.');
      }
      await t.mutation(api.playProvisioning.confirmProvisioning, {
        gameId: game._id,
        secret: game.secret,
        attemptId: game.attempt_id,
      });
      const channel = await t.run(
        async (ctx) =>
          await ctx.db
            .query('play_game_discord_channels')
            .withIndex('by_game_id', (q) => q.eq('game_id', game._id))
            .unique()
      );
      if (discordVoice === true) {
        expect(channel).toMatchObject({ game_id: game._id, state: 'pending' });
        await t.action(internal.playDiscordActions.reconcile, { channelId: channel!._id });
        expect(await viewer.query(api.playGameDirectory.getGameByAddress, { address: game.slug! })).toMatchObject({
          voice: { url: 'https://discord.gg/shared-room' },
        });
      } else {
        expect(channel).toBeNull();
        expect(discord.calls).toHaveLength(0);
        expect(await viewer.query(api.playGameDirectory.getGameByAddress, { address: game.slug! })).toMatchObject({
          voice: null,
        });
      }
    },
    15_000
  );
}

test('two opted-in games receive independent channels and invites and never recreate them on retry', async () => {
  const discord = discordStub(['300', '301']);
  const { t, viewer, settings } = await creationWorld();
  const gameIds: Id<'play_games'>[] = [];
  for (const generatedName of ['Secret Caladan picnic', 'Arrakeen surprise party']) {
    const outcome = await viewer.action(api.playGames.createGeneratedGame, {
      ...settings,
      generatedName,
      discordVoice: true,
    });
    if (!outcome.ok) {
      throw new Error(`Game creation failed: ${outcome.reason}`);
    }
    gameIds.push(outcome.gameId as Id<'play_games'>);
  }
  const channels = [];
  for (const gameId of gameIds) {
    const game = (await t.run(async (ctx) => await ctx.db.get('play_games', gameId)))!;
    await t.mutation(api.playProvisioning.confirmProvisioning, {
      gameId,
      secret: game.secret,
      attemptId: game.attempt_id,
    });
    const row = (await t.run(
      async (ctx) =>
        await ctx.db
          .query('play_game_discord_channels')
          .withIndex('by_game_id', (q) => q.eq('game_id', gameId))
          .unique()
    ))!;
    channels.push(row);
  }
  await Promise.all(channels.map((row) => t.action(internal.playDiscordActions.reconcile, { channelId: row._id })));
  const ready = await Promise.all(channels.map((row) => t.run(async (ctx) => await ctx.db.get(row._id))));
  expect(new Set(ready.map((row) => row?.channel_id))).toEqual(new Set(['300', '301']));
  expect(new Set(ready.map((row) => row?.invite_url))).toEqual(
    new Set(['https://discord.gg/shared-room', 'https://discord.gg/room-301'])
  );
  for (const row of ready) {
    expect(row).toMatchObject({ state: 'ready' });
    expect(await viewer.query(api.playGameDirectory.getGameByAddress, { address: row!.game_id })).toMatchObject({
      voice: { url: row!.invite_url },
    });
  }
  const calls = discord.calls.length;
  await Promise.all(channels.map((row) => t.action(internal.playDiscordActions.reconcile, { channelId: row._id })));
  expect(discord.calls).toHaveLength(calls);
  expect(discord.calls.filter((call) => call.path === '/guilds/100/channels' && call.method === 'POST')).toHaveLength(
    2
  );
  expect(discord.calls.filter((call) => call.path.endsWith('/invites'))).toHaveLength(2);
});

test('creation offers Discord voice only when its deployment configuration is complete', async () => {
  discordStub();
  const { viewer } = await creationWorld();
  expect(await viewer.query(api.playGames.creatable, {})).toMatchObject({
    access: 'allowed',
    discordVoiceAvailable: true,
  });
  for (const key of ['DISCORD_BOT_TOKEN', 'DISCORD_GUILD_ID', 'DISCORD_GAMES_CATEGORY_IDS']) {
    configureDiscord();
    vi.stubEnv(key, '');
    expect(await viewer.query(api.playGames.creatable, {})).toMatchObject({
      access: 'allowed',
      discordVoiceAvailable: false,
    });
  }
});
