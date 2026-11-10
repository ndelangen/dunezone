/* @vitest-environment edge-runtime */

import { afterEach, beforeEach, expect, test, vi } from 'vite-plus/test';

import { internal } from './_generated/api';
import { SnapshotSocket, snapshotDiscovery, snapshotGuild } from './lib/discordVoiceSnapshot.test.fixture';
import { discordVoiceAtLimit } from './lib/playDiscord';
import { configureDiscord, discordStub, voiceWorld } from './playDiscord.test.fixture';
import { voiceCandidates } from './playDiscordVoice';

beforeEach(() => {
  vi.useFakeTimers();
  configureDiscord();
  SnapshotSocket.sockets = [];
  vi.stubGlobal('WebSocket', SnapshotSocket);
});
afterEach(() => {
  vi.clearAllTimers();
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

test('occupied ended rooms retain creator capacity through continuation and a later finish', async () => {
  const discord = discordStub();
  const world = await voiceWorld();
  await world.reconcile();
  await world.t.run(async (ctx) => {
    const game = (await ctx.db.get(world.gameId))!;
    const channel = (await ctx.db.query('play_game_discord_channels').first())!;
    const { _id: _gameId, _creationTime: _gameCreated, ...gameFields } = game;
    const { _id: _channelId, _creationTime: _channelCreated, ...channelFields } = channel;
    for (let index = 0; index < 2; index += 1) {
      const gameId = await ctx.db.insert('play_games', { ...gameFields, slug: `other-${index}` });
      await ctx.db.insert('play_game_discord_channels', {
        ...channelFields,
        game_id: gameId,
        channel_id: String(400 + index),
      });
    }
  });
  const atLimit = () => world.t.run((ctx) => discordVoiceAtLimit(ctx, world.identity.userId));
  expect(await atLimit()).toBe(true);
  await world.publish(2, world.summary(undefined, { stage: 'finished' }));
  await world.reconcile();
  const firstFinish = await world.t.run(voiceCandidates);
  expect(firstFinish).toHaveLength(1);

  const normal = discord.fetch.getMockImplementation()!;
  discord.fetch.mockImplementation(async (input, options) =>
    (input instanceof Request ? input.url : String(input)).endsWith('/gateway/bot')
      ? Response.json(snapshotDiscovery)
      : normal(input, options)
  );
  SnapshotSocket.onIdentify = (socket) =>
    queueMicrotask(() => socket.packet(0, snapshotGuild([{ user_id: '900', channel_id: '300' }]), 'GUILD_CREATE'));
  await world.t.action(internal.playDiscordVoiceActions.cleanup, { channels: firstFinish });
  expect(await world.channel()).toMatchObject({ state: 'ready' });
  expect(await atLimit()).toBe(true);

  await world.publish(3, world.summary(undefined, { stage: 'play' }));
  await world.reconcile();
  expect(await world.t.run(voiceCandidates)).toEqual([]);
  await world.publish(4, world.summary(undefined, { stage: 'finished' }));
  await world.reconcile();
  await world.t.mutation(internal.playDiscordVoice.reportEmpty, { channels: firstFinish, observedAt: Date.now() });
  expect(await world.channel()).toMatchObject({ state: 'ready' });
  expect(await atLimit()).toBe(true);

  SnapshotSocket.onIdentify = (socket) => queueMicrotask(() => socket.packet(0, snapshotGuild(), 'GUILD_CREATE'));
  await world.t.action(internal.playDiscordVoiceActions.cleanup, { channels: await world.t.run(voiceCandidates) });
  await world.reconcile();
  expect(await world.channel()).toMatchObject({ state: 'deleted' });
  expect(await atLimit()).toBe(false);
  expect(SnapshotSocket.sockets.every((socket) => socket.closed)).toBe(true);
  expect(discord.calls.filter((call) => call.method === 'DELETE')).toHaveLength(1);
});
