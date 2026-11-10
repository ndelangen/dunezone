/* @vitest-environment edge-runtime */

import { afterEach, beforeEach, expect, test, vi } from 'vite-plus/test';

import { api, internal } from './_generated/api';
import type { Id } from './_generated/dataModel';
import { DISCORD_LEASE } from './lib/playDiscord';
import { playPerson, playRuleset, playTest } from './play.test.fixture';
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
    name: 'Quiet Sietch',
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
  expect(await world.t.mutation(internal.playDiscord.startCreation, stale)).toBe(false);
  await world.t.mutation(internal.playDiscord.release, stale);
  expect((await world.channel())?.lease).toBe(replacement.lease);
});

test('a crashed create attempt remains uncertain when its lease expires', async () => {
  const discord = discordStub();
  const world = await voiceWorld();
  const row = (await world.channel())!;
  const claim = (await world.t.mutation(internal.playDiscord.claim, { channelId: row._id }))!;
  await world.t.mutation(internal.playDiscord.startCreation, { channelId: row._id, lease: claim.lease! });
  vi.setSystemTime(claim.lease_until! + 1);
  await world.reconcile();
  expect(await world.channel()).toMatchObject({ state: 'creating' });
  expect(discord.calls).toHaveLength(0);
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

async function creatorWithThreeGames() {
  const t = playTest();
  const { user, gameIds, rulesetId } = await t.run(async (ctx) => {
    const user = await playPerson(ctx, 'Creator');
    const rulesetId = await playRuleset(ctx, user.userId);
    const gameIds = [];
    for (let i = 0; i < 3; i++) {
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
  return { t, gameIds, rulesetId, confirm, viewer: t.withIdentity({ subject: user.subject }) };
}

test('voice stays enabled for a new game when its creator already has three voice rooms', async () => {
  vi.stubEnv('TYPESAFE_API_KEY', '');
  const discord = discordStub(['300', '301', '302', '303']);
  const { t, gameIds, rulesetId, confirm, viewer } = await creatorWithThreeGames();
  for (const gameId of gameIds) {
    expect(await confirm(gameId)).toEqual({ ok: true });
  }
  await t.finishAllScheduledFunctions(vi.runAllTimers);
  const result = await viewer.action(api.playGames.createGeneratedGame, {
    rulesetId,
    minimumPlayers: 4,
    generatedName: 'Secret Caladan picnic',
    discordVoice: true,
  });
  if (!result.ok) {
    throw new Error('Game creation failed');
  }
  const game = (await t.run((ctx) => ctx.db.get(result.gameId as Id<'play_games'>)))!;
  expect(game.discord_voice).toBe(true);
  expect(
    await t.mutation(api.playProvisioning.confirmProvisioning, {
      gameId: game._id,
      secret: game.secret,
      attemptId: game.attempt_id,
    })
  ).toEqual({ ok: true });
  await t.finishAllScheduledFunctions(vi.runAllTimers);
  expect(discord.calls.filter((call) => call.method === 'POST' && call.path === '/guilds/100/channels')).toHaveLength(
    4
  );
});
