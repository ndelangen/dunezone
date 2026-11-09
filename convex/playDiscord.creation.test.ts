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

test('repeated confirmations and concurrent workers create one private voice channel', async () => {
  const discord = discordStub();
  const world = await voiceWorld();
  await world.t.mutation(api.playProvisioning.confirmProvisioning, world.credentials);
  await Promise.all([world.reconcile(), world.reconcile()]);
  const creates = discord.calls.filter((call) => call.method === 'POST');
  expect(creates).toHaveLength(1);
  expect(creates[0]?.body).toEqual({
    name: 'Quiet Sietch',
    type: 2,
    parent_id: '200',
    permission_overwrites: [
      { id: '100', type: 0, allow: '0', deny: '1049600' },
      { id: '999', type: 1, allow: '3214353', deny: '0' },
    ],
  });
  expect(new Headers(creates[0]?.headers).get('X-Audit-Log-Reason')).toContain('Dune%20Play');
  expect(await world.channel()).toMatchObject({ state: 'ready', channel_id: '300', guild_id: '100' });
});

test.each(['DISCORD_BOT_TOKEN', 'DISCORD_GUILD_ID', 'DISCORD_GAMES_CATEGORY_IDS'])(
  'missing %s disables creation and the menu',
  async (key) => {
    vi.stubEnv(key, '');
    const discord = discordStub();
    const world = await voiceWorld();
    await world.reconcile();
    expect(await world.channel()).toBeNull();
    expect(await world.menu()).toMatchObject({ voice: null });
    await expect(world.join()).rejects.toThrow('Only seated');
    expect(discord.calls).toHaveLength(0);
  }
);

test('fixtures never reserve a channel', async () => {
  const discord = discordStub();
  const world = await voiceWorld({ fixture: true });
  await world.reconcile();
  expect(await world.channel()).toBeNull();
  expect(discord.calls).toHaveLength(0);
});

test('an ambiguous creation result is retained without retrying POST', async () => {
  const discord = discordStub();
  const normal = discord.fetch.getMockImplementation()!;
  discord.fetch.mockImplementation(async (input, options) => {
    if (options?.method === 'POST' && (input instanceof Request ? input.url : String(input)).endsWith('/channels')) {
      throw new Error('lost response');
    }
    return await normal(input, options);
  });
  const world = await voiceWorld();
  await world.reconcile();
  expect(await world.channel()).toMatchObject({ state: 'creating' });
  await world.reconcile();
  expect(discord.fetch.mock.calls.filter(([, options]) => options?.method === 'POST')).toHaveLength(1);
});

test('a crashed create attempt remains uncertain when its lease expires', async () => {
  const discord = discordStub();
  const world = await voiceWorld();
  const row = (await world.channel())!;
  const claim = (await world.t.mutation(internal.playDiscord.claim, { channelId: row._id }))!;
  await world.t.mutation(internal.playDiscord.startCreation, { channelId: row._id, lease: claim.lease! });
  vi.setSystemTime(Date.now() + 12 * 60_000);
  await world.reconcile();
  expect(await world.channel()).toMatchObject({ state: 'creating' });
  expect(discord.calls).toHaveLength(0);
});

test('a definitely full category advances to the next configured category', async () => {
  const discord = discordStub();
  const normal = discord.fetch.getMockImplementation()!;
  let creates = 0;
  discord.fetch.mockImplementation(async (input, options) => {
    if (
      options?.method === 'POST' &&
      (input instanceof Request ? input.url : String(input)).endsWith('/channels') &&
      ++creates === 1
    ) {
      return Response.json({ code: 50_035 }, { status: 400 });
    }
    return await normal(input, options);
  });
  const world = await voiceWorld();
  await world.reconcile();
  expect(creates).toBe(2);
  expect(discord.calls.find((call) => call.method === 'POST')?.body).toMatchObject({ parent_id: '201' });
  expect(await world.channel()).toMatchObject({ state: 'ready' });
});
