/* @vitest-environment edge-runtime */

import { afterEach, beforeEach, expect, test, vi } from 'vite-plus/test';

import { api, internal } from './_generated/api';
import { DISCORD_LEASE } from './lib/playDiscord';
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

test('repeated confirmations and concurrent workers create one ordinary voice channel and one shared invite', async () => {
  const discord = discordStub();
  const world = await voiceWorld();
  await world.t.mutation(api.playProvisioning.confirmProvisioning, world.credentials);
  await Promise.all([world.reconcile(), world.reconcile()]);
  const creates = discord.calls.filter((call) => call.path === '/guilds/100/channels' && call.method === 'POST');
  expect(creates).toHaveLength(1);
  expect(creates[0]?.body).toEqual({
    name: `dune-play-${world.gameId}`,
    type: 2,
    parent_id: '200',
  });
  const invites = discord.calls.filter((call) => call.path === '/channels/300/invites');
  expect(invites).toHaveLength(1);
  expect(invites[0]?.body).toEqual({ max_uses: 0, max_age: 0, unique: false });
  for (const call of [...creates, ...invites]) {
    expect(new Headers(call.headers).get('X-Audit-Log-Reason')).toContain('Dune%20Play');
  }
  expect(await world.channel()).toMatchObject({
    state: 'ready',
    channel_id: '300',
    guild_id: '100',
    invite_url: 'https://discord.gg/shared-room',
  });
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
    expect(discord.calls).toHaveLength(0);
  }
);

test('fixtures never reserve a channel', async () => {
  const discord = discordStub();
  const world = await voiceWorld({ fixture: true });
  await world.reconcile();
  expect(await world.channel()).toBeNull();
  expect(discord.calls.filter((call) => call.method !== 'GET')).toEqual([]);
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

test('a lease outlasts the default action runtime and fences its former owner after expiry', async () => {
  const world = await voiceWorld();
  const row = (await world.channel())!;
  const startedAt = Date.now();
  const first = (await world.t.mutation(internal.playDiscord.claim, { channelId: row._id }))!;

  vi.setSystemTime(startedAt + 30 * 60_000);
  expect(await world.t.mutation(internal.playDiscord.claim, { channelId: row._id })).toBeNull();
  vi.setSystemTime(startedAt + DISCORD_LEASE - 1);
  expect(await world.t.mutation(internal.playDiscord.claim, { channelId: row._id })).toBeNull();

  vi.setSystemTime(startedAt + DISCORD_LEASE + 1);
  const replacement = (await world.t.mutation(internal.playDiscord.claim, { channelId: row._id }))!;
  expect(replacement.lease).not.toBe(first.lease);
  const stale = { channelId: row._id, lease: first.lease! };
  expect(await world.t.mutation(internal.playDiscord.work, stale)).toBeNull();
  expect(await world.t.mutation(internal.playDiscord.startCreation, { ...stale, categoryId: '200' })).toBe(false);
  await world.t.mutation(internal.playDiscord.release, stale);
  expect((await world.channel())?.lease).toBe(replacement.lease);
});

test('a crashed create attempt remains uncertain when its lease expires', async () => {
  const discord = discordStub();
  const world = await voiceWorld();
  const row = (await world.channel())!;
  const claim = (await world.t.mutation(internal.playDiscord.claim, { channelId: row._id }))!;
  await world.t.mutation(internal.playDiscord.startCreation, {
    channelId: row._id,
    lease: claim.lease!,
    categoryId: '200',
  });
  vi.setSystemTime(claim.lease_until! + 1);
  await world.reconcile();
  expect(await world.channel()).toMatchObject({ state: 'creating' });
  expect(discord.calls.filter((call) => call.method !== 'GET')).toEqual([]);
});

test('a definitely full category advances to the next configured category', async () => {
  const discord = discordStub();
  const normal = discord.fetch.getMockImplementation()!;
  let creates = 0;
  discord.fetch.mockImplementation(async (input, options) => {
    if (options?.method !== 'POST') {
      return await normal(input, options);
    }
    if (input !== 'https://discord.com/api/v10/guilds/100/channels') {
      return await normal(input, options);
    }
    creates += 1;
    if (creates === 1) {
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

test('an invite failure retries the invite without recreating its channel', async () => {
  const discord = discordStub();
  const normal = discord.fetch.getMockImplementation()!;
  let invites = 0;
  discord.fetch.mockImplementation(async (input, options) => {
    if (input === 'https://discord.com/api/v10/channels/300/invites') {
      invites += 1;
      if (invites === 1) {
        return Response.json({ code: 50_013 }, { status: 403 });
      }
    }
    return await normal(input, options);
  });
  const world = await voiceWorld();
  await world.reconcile();
  expect(await world.channel()).toMatchObject({ state: 'pending', channel_id: '300' });
  expect(await world.menu()).toMatchObject({ voice: null });
  vi.setSystemTime(Date.now() + 15 * 60_000);
  await world.t.mutation(internal.playDiscord.retryDue, {});
  await world.reconcile();
  expect(invites).toBe(2);
  expect(discord.calls.filter((call) => call.path === '/guilds/100/channels' && call.method === 'POST')).toHaveLength(
    1
  );
  expect(await world.menu()).toMatchObject({ voice: { url: 'https://discord.gg/shared-room' } });
});
