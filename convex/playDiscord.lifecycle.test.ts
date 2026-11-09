/* @vitest-environment edge-runtime */

import { afterEach, beforeEach, expect, test, vi } from 'vite-plus/test';

import { api, internal } from './_generated/api';
import { DISCORD_DAY } from './lib/playDiscord';
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

test('finished players keep access for 24 hours and duplicate summaries never extend that lifetime', async () => {
  const discord = discordStub();
  const world = await voiceWorld();
  await world.join();
  await world.reconcile();
  const ended = Date.now();
  await world.publish(2, world.summary(undefined, { stage: 'finished' }));
  await world.t.mutation(internal.playDiscord.syncSeats, { gameId: world.gameId, cursor: null });
  await world.reconcile();
  expect(discord.granted.size).toBe(1);
  expect(await world.menu()).toMatchObject({ voice: null });
  vi.setSystemTime(ended + DISCORD_DAY - 1);
  await world.publish(3, world.summary(undefined, { stage: 'finished' }));
  await world.reconcile();
  expect(await world.channel()).toMatchObject({ state: 'ready', ended_at: ended, cleanup_at: ended + DISCORD_DAY });
  vi.setSystemTime(ended + DISCORD_DAY);
  await world.reconcile();
  expect(discord.calls.some((call) => call.path === '/channels/300' && call.method === 'DELETE')).toBe(true);
  expect(await world.channel()).toMatchObject({ state: 'deleted' });
});

test('new activity before retirement preserves the room; committed retirement cannot be revived', async () => {
  discordStub();
  const world = await voiceWorld();
  await world.reconcile();
  vi.setSystemTime(Date.now() + 14 * DISCORD_DAY);
  const row = (await world.channel())!;
  const claim = (await world.t.mutation(internal.playDiscord.claim, { channelId: row._id }))!;
  const args = { channelId: row._id, lease: claim.lease! };
  expect(await world.t.mutation(internal.playDiscord.work, args)).toMatchObject({ remove: true });
  await world.publish(2, world.summary());
  expect(await world.t.mutation(internal.playDiscord.beginDeletion, args)).toBe(false);
  await world.t.mutation(internal.playDiscord.release, args);
  vi.setSystemTime(Date.now() + 14 * DISCORD_DAY);
  const next = (await world.t.mutation(internal.playDiscord.claim, { channelId: row._id }))!;
  const second = { channelId: row._id, lease: next.lease! };
  expect(await world.t.mutation(internal.playDiscord.beginDeletion, second)).toBe(true);
  await world.publish(3, world.summary());
  await world.t.mutation(internal.playDiscord.release, second);
  await world.reconcile();
  expect(await world.channel()).toMatchObject({ state: 'deleted' });
});

test('a missing Discord channel counts as deleted, but a different 404 remains retryable', async () => {
  const discord = discordStub();
  const normal = discord.fetch.getMockImplementation()!;
  let code = 10_004;
  discord.fetch.mockImplementation(async (input, options) => {
    if (
      options?.method === 'DELETE' &&
      (input instanceof Request ? input.url : String(input)).endsWith('/channels/300')
    ) {
      return Response.json({ code }, { status: 404 });
    }
    return await normal(input, options);
  });
  const world = await voiceWorld();
  await world.reconcile();
  vi.setSystemTime(Date.now() + 14 * DISCORD_DAY);
  await world.reconcile();
  expect(await world.channel()).toMatchObject({ state: 'deleting' });
  code = 10_003;
  await world.reconcile();
  expect(await world.channel()).toMatchObject({ state: 'deleted' });
});

test('account deletion revokes access at its start', async () => {
  const discord = discordStub();
  const world = await voiceWorld();
  await world.join();
  await world.reconcile();
  await world.player.mutation(api.accountDeletion.confirm, { replacementUserId: null });
  await world.reconcile();
  expect(discord.granted.size).toBe(0);
  expect(await world.grants()).toMatchObject([{ desired: false, state: 'revoked' }]);
});

test('a failed membership lookup does not block a later seat revocation', async () => {
  const discord = discordStub();
  const world = await voiceWorld();
  await world.join();
  await world.reconcile();
  const grant = (await world.grants())[0]!;
  await world.t.run(async (ctx) => {
    await ctx.db.patch(grant._id, { needs_sync: true });
    const { _id, _creationTime, ...copy } = grant;
    await ctx.db.insert('play_game_discord_grants', {
      ...copy,
      discord_user_id: '401',
      desired: false,
      needs_sync: true,
    });
  });
  discord.granted.add('/channels/300/permissions/401');
  const normal = discord.fetch.getMockImplementation()!;
  discord.fetch.mockImplementation(async (input, options) => {
    if ((input instanceof Request ? input.url : String(input)).endsWith('/members/400')) {
      return Response.json({ code: 50_013 }, { status: 403 });
    }
    return await normal(input, options);
  });
  await world.reconcile();
  expect(discord.granted.has('/channels/300/permissions/401')).toBe(false);
  expect((await world.grants()).find((entry) => entry.discord_user_id === '400')).toMatchObject({
    needs_sync: true,
    retry_at: Date.now() + 15 * 60_000,
  });
});

test('a new Join cannot bypass a Discord retry-after deadline', async () => {
  const discord = discordStub();
  const normal = discord.fetch.getMockImplementation()!;
  discord.fetch.mockImplementation(async (input, options) => {
    if ((input instanceof Request ? input.url : String(input)).endsWith('/users/@me')) {
      return Response.json({ retry_after: 60 }, { status: 429 });
    }
    return await normal(input, options);
  });
  const world = await voiceWorld();
  await world.reconcile();
  const called = discord.fetch.mock.calls.length;
  await world.join();
  await world.reconcile();
  expect(discord.fetch.mock.calls).toHaveLength(called);
  expect(await world.channel()).toMatchObject({ retry_after: Date.now() + 60_000 });
});

test('existing games continue using their recorded guild after the deployment changes guilds', async () => {
  const discord = discordStub();
  const world = await voiceWorld();
  await world.reconcile();
  vi.stubEnv('DISCORD_GUILD_ID', '101');
  await world.join();
  await world.reconcile();
  expect(discord.calls.find((call) => call.path.includes('/members/'))?.path).toBe('/guilds/100/members/400');
  expect(await world.menu()).toMatchObject({ voice: { request: { url: 'https://discord.com/channels/100/300' } } });
});
