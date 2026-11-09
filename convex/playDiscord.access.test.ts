/* @vitest-environment edge-runtime */

import { afterEach, beforeEach, expect, test, vi } from 'vite-plus/test';

import { api, internal } from './_generated/api';
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

test('a seated player without Discord gets the profile connection route', async () => {
  discordStub();
  const world = await voiceWorld({ connected: false });
  expect(await world.menu()).toMatchObject({ voice: { kind: 'connect', profileSlug: 'player' } });
  await expect(world.join()).rejects.toThrow('Connect Discord');
});

test('a member gets access and a deep link while a spectator gets neither', async () => {
  const discord = discordStub();
  const world = await voiceWorld();
  const spectator = world.t.withIdentity({ subject: world.spectator.subject });
  await expect(spectator.mutation(api.playDiscord.join, { gameId: world.gameId })).rejects.toThrow('Only seated');
  expect(await spectator.query(api.playGameDirectory.getGameByAddress, { address: 'quiet-sietch' })).toMatchObject({
    voice: null,
  });
  const id = await world.join();
  await world.reconcile();
  expect(await world.menu()).toMatchObject({
    voice: {
      kind: 'join',
      request: { id, state: 'ready', kind: 'channel', url: 'https://discord.com/channels/100/300' },
    },
  });
  expect(discord.granted.has('/channels/300/permissions/400')).toBe(true);
});

test('a non-member gets a single-use invite and a pending grant that applies on the next click', async () => {
  const discord = discordStub();
  discord.member(false);
  discord.pregrant(false);
  const world = await voiceWorld();
  await world.join();
  await world.reconcile();
  expect(await world.menu()).toMatchObject({
    voice: { request: { state: 'ready', kind: 'invite', url: 'https://discord.gg/one-use' } },
  });
  expect(discord.calls.find((call) => call.path.endsWith('/invites'))?.body).toEqual({
    max_uses: 1,
    max_age: 3600,
    unique: true,
  });
  expect(await world.grants()).toMatchObject([{ state: 'pending' }]);
  discord.member(true);
  await world.join();
  await world.reconcile();
  expect(await world.grants()).toMatchObject([{ state: 'granted' }]);
  expect(await world.menu()).toMatchObject({ voice: { request: { kind: 'channel' } } });
});

test('a delayed permission write is removed after a seat departs', async () => {
  const discord = discordStub();
  const normal = discord.fetch.getMockImplementation()!;
  let release!: () => void;
  let entered!: () => void;
  const started = new Promise<void>((resolve) => {
    entered = resolve;
  });
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  discord.fetch.mockImplementation(async (input, options) => {
    if (options?.method === 'PUT') {
      entered();
      await gate;
    }
    return await normal(input, options);
  });
  const world = await voiceWorld();
  await world.join();
  const work = world.reconcile();
  await started;
  await world.publish(2, world.summary([]));
  release();
  await work;
  expect(discord.granted.size).toBe(0);
  expect(await world.grants()).toMatchObject([{ state: 'revoked', desired: false }]);
});

test('disconnecting Discord queues revocation before losing the Discord identity', async () => {
  const discord = discordStub();
  vi.stubEnv('AUTH_GOOGLE_ID', 'test');
  vi.stubEnv('AUTH_GOOGLE_SECRET', 'test');
  const world = await voiceWorld();
  await world.join();
  await world.reconcile();
  await world.player.mutation(api.accounts.disconnect, { provider: 'discord' });
  await world.reconcile();
  expect(discord.granted.size).toBe(0);
  expect(await world.grants()).toMatchObject([{ discord_user_id: '400', state: 'revoked' }]);
});

test('a repeated Join during a delayed permission write retains access when the game finishes', async () => {
  const discord = discordStub();
  const world = await voiceWorld();
  await world.join();
  await world.reconcile();
  vi.setSystemTime(Date.now() + 60_000);
  const normal = discord.fetch.getMockImplementation()!;
  let release!: () => void;
  let entered!: () => void;
  const started = new Promise<void>((resolve) => {
    entered = resolve;
  });
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  discord.fetch.mockImplementation(async (input, options) => {
    if (options?.method === 'PUT') {
      entered();
      await gate;
    }
    return await normal(input, options);
  });
  await world.join();
  const work = world.reconcile();
  await started;
  await world.join();
  await world.publish(2, world.summary(undefined, { stage: 'finished' }));
  release();
  await work;
  expect(discord.granted.has('/channels/300/permissions/400')).toBe(true);
  expect(await world.grants()).toMatchObject([{ state: 'granted', desired: true, needs_sync: false }]);
  expect(discord.calls.filter((call) => call.method === 'DELETE')).toHaveLength(0);
});

test('a canonical account can join a seat held by its old actor and select one of several Discord methods', async () => {
  discordStub();
  const world = await voiceWorld();
  await world.t.run(async (ctx) => {
    const actor = await ctx.db.insert('users', {
      account_state: 'deleted',
      merged_into_user_id: world.identity.userId,
    });
    await ctx.db.insert('authAccounts', {
      userId: world.identity.userId,
      provider: 'discord',
      providerAccountId: '401',
    });
    const game = (await ctx.db.get(world.gameId))!;
    await ctx.db.patch(game._id, {
      directory: { ...game.directory!, seats: [{ seat: 'seat-1', userId: actor, faction: null }] },
    });
  });
  await world.join();
  await world.reconcile();
  expect(await world.grants()).toMatchObject([
    { user_id: world.identity.userId, discord_user_id: '400', state: 'granted' },
  ]);
});

test('terminal games refuse new links and pending grants cannot survive a departure', async () => {
  const discord = discordStub();
  const world = await voiceWorld();
  await world.join();
  await world.publish(2, world.summary([], { stage: 'finished' }));
  await world.t.mutation(internal.playDiscord.syncSeats, { gameId: world.gameId, cursor: null });
  await world.reconcile();
  await expect(world.join()).rejects.toThrow('Only seated');
  expect(discord.granted.size).toBe(0);
  expect(await world.menu()).toMatchObject({ voice: null });
});
