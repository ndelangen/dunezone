/// <reference types="vite/client" />
// @vitest-environment edge-runtime

import { afterEach, beforeEach, describe, expect, test, vi } from 'vite-plus/test';

import { api, internal } from './_generated/api';
import type { Id } from './_generated/dataModel';
import type { MutationCtx } from './_generated/server';
import { playPerson, playTest } from './play.test.fixture';

async function banSetup(ctx: MutationCtx) {
  const source = await playPerson(ctx, 'Source');
  const other = await playPerson(ctx, 'Other');
  const profile = await ctx.db
    .query('profiles')
    .withIndex('by_user_id', (q) => q.eq('user_id', source.userId))
    .unique();
  const stamp = new Date().toISOString();
  const ruleset = await ctx.db.insert('rulesets', {
    name: 'Classic',
    slug: 'classic',
    about: '',
    owner_id: other.userId,
    group_id: null,
    is_deleted: false,
    image_cover: null,
    created_at: stamp,
    updated_at: stamp,
  });
  const operationId = await ctx.db.insert('account_deletion_operations', {
    kind: 'ban',
    ban_games_queued: false,
    source_user_id: source.userId,
    source_profile_id: profile!._id,
    replacement_user_id: null,
    state: 'running',
    phase: 'finalizing',
    snapshot_kind: null,
    snapshot_cursor: null,
    retry_count: 0,
    error: null,
    created_at: stamp,
    updated_at: stamp,
    completed_at: null,
  });
  return { source, other, profile: profile!, ruleset, operationId };
}

async function fixture({ hosted = 1, joined = 1 } = {}) {
  const t = playTest();
  const data = await t.run(async (ctx) => {
    const { source, other, profile, ruleset, operationId } = await banSetup(ctx);
    const hostedIds: Id<'play_games'>[] = [],
      joinedIds: Id<'play_games'>[] = [];
    for (let index = 0; index < hosted + joined; index += 1) {
      const owned = index < hosted;
      const gameId = await ctx.db.insert('play_games', {
        creator_id: owned ? source.userId : other.userId,
        ruleset_id: ruleset,
        minimum_players: 4,
        name: `Game ${index}`,
        slug: `game-${index}`,
        state: 'ready',
        secret: 'a'.repeat(64),
        attempt_id: 'b'.repeat(64),
        provision_expires_at: Date.now() + 60_000,
        created_at: Date.now(),
      });
      (owned ? hostedIds : joinedIds).push(gameId);
      await ctx.db.insert('play_game_accounts', { game_id: gameId, user_id: source.userId });
      await ctx.db.insert('play_game_accounts', { game_id: gameId, user_id: other.userId });
    }
    const channelId = hostedIds.length
      ? await ctx.db.insert('play_game_discord_channels', {
          game_id: hostedIds[0]!,
          guild_id: 'guild',
          category_ids: ['category'],
          channel_id: 'channel',
          invite_url: 'https://discord.gg/example',
          state: 'ready',
          created_at: Date.now(),
          cleanup_at: Date.now() + 1_000_000,
          next_attempt_at: Date.now() + 1_000_000,
        })
      : null;
    await ctx.db.patch(source.userId, { account_state: 'banned' });
    await ctx.db.patch(profile._id, { account_state: 'banned' });
    return { source, other, operationId, hostedIds, joinedIds, channelId };
  });
  return { t, ...data };
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.stubEnv('SITE_URL', 'https://dune.zone');
  vi.stubEnv('PLAY_SERVICE_URL', 'https://dune.zone');
});
afterEach(() => {
  vi.clearAllTimers();
  vi.useRealTimers();
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe('Ban game cleanup', () => {
  test('closes hosted games for other players, requests Discord deletion, and retains games owned by others', async () => {
    const { t, operationId, hostedIds, joinedIds, other, channelId } = await fixture();
    await t.mutation(internal.playDeletion.queueBanGames, { operationId });
    const state = await t.run(async (ctx) => ({
      hosted: await ctx.db.get(hostedIds[0]!),
      joined: await ctx.db.get(joinedIds[0]!),
      channel: await ctx.db.get(channelId!),
      events: await ctx.db.query('play_account_deletions').take(10),
    }));
    expect(state.hosted).toMatchObject({ state: 'expired', ban_operation_id: operationId });
    expect(state.joined?.state).toBe('ready');
    expect(state.channel).toMatchObject({ state: 'deleting', ban_operation_id: operationId });
    expect(state.channel?.invite_url).toBeUndefined();
    expect(state.events).toHaveLength(1);
    expect(state.events[0]).toMatchObject({ ban_retirement: true, state: 'pending' });
    const viewer = t.withIdentity({ subject: other.subject });
    expect(await viewer.query(api.playGameDirectory.getGameByAddress, { address: state.hosted!.slug })).toEqual({
      status: 'not_found',
    });
    expect(await viewer.mutation(api.playAdmission.enrolPlayer, { gameId: hostedIds[0]! })).toEqual({
      ok: false,
      reason: 'unavailable',
    });
  });

  test('retires hosted games even when no creator routing remains', async () => {
    const { t, operationId, hostedIds } = await fixture({ joined: 0 });
    await t.run(async (ctx) => {
      for (const row of await ctx.db.query('play_game_accounts').take(10)) {
        await ctx.db.delete(row._id);
      }
    });
    expect(await t.mutation(internal.playDeletion.applyBanGamesBatch, { operationId })).toEqual({
      done: false,
      retryAt: Date.now(),
    });
    const event = await t.run(async (ctx) => (await ctx.db.query('play_account_deletions').first())!);
    expect(event).toMatchObject({ game_id: hostedIds[0], ban_retirement: true, state: 'pending' });
  });

  test('requires hosted-game delivery acknowledgements across retirement pages', async () => {
    const { t, operationId, hostedIds } = await fixture({ hosted: 35, joined: 35 });
    const batch = () => t.mutation(internal.playDeletion.applyBanGamesBatch, { operationId });
    expect(await batch()).toEqual({ done: false, retryAt: Date.now() });
    const first = await t.run(async (ctx) => await ctx.db.get(operationId));
    expect(first).toMatchObject({ ban_games_queued: false });
    expect(first?.ban_games_cursor).toBeTruthy();
    for (let page = 0; page < 2; page += 1) {
      expect(await batch()).toEqual({ done: false, retryAt: Date.now() });
    }
    expect(await t.run(async (ctx) => await ctx.db.get(operationId))).toMatchObject({
      ban_games_queued: true,
    });
    const events = await t.run(async (ctx) => await ctx.db.query('play_account_deletions').collect());
    expect(events).toHaveLength(hostedIds.length);
    expect(events.filter((event) => event.ban_retirement)).toHaveLength(hostedIds.length);
    await t.run(async (ctx) => {
      for (const event of events) {
        await ctx.db.patch(event._id, { state: 'acknowledged' });
      }
    });
    expect(await batch()).toEqual({ done: true });
    await t.mutation(internal.playDeletion.queueBanGames, { operationId });
    await t.mutation(internal.playDeletion.queueAccountDeletion, {
      operationId,
      paginationOpts: { cursor: null, numItems: 32 },
    });
    expect(await batch()).toEqual({ done: true });
    expect(await t.run(async (ctx) => await ctx.db.query('play_account_deletions').collect())).toHaveLength(
      hostedIds.length
    );
  });

  test('waits for the earliest pending delivery retry once hosted games are queued', async () => {
    const { t, operationId } = await fixture({ hosted: 2, joined: 0 });
    const batch = () => t.mutation(internal.playDeletion.applyBanGamesBatch, { operationId });
    await batch();
    await batch();
    const events = await t.run(async (ctx) => await ctx.db.query('play_account_deletions').take(10));
    const retryAt = Date.now() + 300_000;
    await t.run(async (ctx) => {
      await ctx.db.patch(events[0]!._id, { next_attempt_at: retryAt + 60_000 });
      await ctx.db.patch(events[1]!._id, { attempts: 9, next_attempt_at: Date.now() });
    });
    await t.mutation(internal.playDeletion.claimDelivery, { eventId: events[1]!._id });
    expect(await batch()).toEqual({ done: false, retryAt });
    expect(await batch()).toEqual({ done: false, retryAt });
    await t.run(async (ctx) => await ctx.db.patch(events[1]!._id, { state: 'acknowledged' }));
    expect(await batch()).toEqual({ done: false, retryAt: retryAt + 60_000 });
  });

  test('continues fanout recovery promptly even when existing deliveries have backed off', async () => {
    const { t, operationId } = await fixture({ hosted: 35, joined: 0 });
    const batch = () => t.mutation(internal.playDeletion.applyBanGamesBatch, { operationId });
    await batch();
    await t.run(async (ctx) => {
      for (const event of await ctx.db.query('play_account_deletions').take(40)) {
        await ctx.db.patch(event._id, { next_attempt_at: Date.now() + 300_000 });
      }
    });
    expect(await batch()).toEqual({ done: false, retryAt: Date.now() });
    expect(await t.run(async (ctx) => await ctx.db.get(operationId))).toMatchObject({ ban_games_queued: false });
  });

  test('bounds finalization checks when a delivery action was lost before claiming', async () => {
    const { t, operationId } = await fixture({ hosted: 1, joined: 0 });
    const batch = () => t.mutation(internal.playDeletion.applyBanGamesBatch, { operationId });
    await batch();
    await batch();
    const event = await t.run(async (ctx) => (await ctx.db.query('play_account_deletions').first())!);
    expect(event).toMatchObject({ attempts: 0, next_attempt_at: Date.now() });
    expect(await batch()).toEqual({ done: false, retryAt: Date.now() });
    vi.setSystemTime(Date.now() + 6000);
    expect(await batch()).toEqual({ done: false, retryAt: Date.now() + 300_000 });
    expect(await t.run(async (ctx) => await ctx.db.get(event._id))).toMatchObject({ attempts: 0 });
  });

  test.each(['deleting', 'deleted'] as const)(
    'links an already %s Discord channel to the ban operation',
    async (state) => {
      const { t, operationId, channelId } = await fixture({ joined: 0 });
      await t.run(async (ctx) => await ctx.db.patch(channelId!, { state }));
      await t.mutation(internal.playDeletion.queueBanGames, { operationId });
      expect(await t.run(async (ctx) => await ctx.db.get(channelId!))).toMatchObject({
        state,
        ban_operation_id: operationId,
      });
    }
  );

  test('keeps retirement pending while removing more than one batch of player routing', async () => {
    const { t, operationId, hostedIds } = await fixture({ joined: 0 });
    await t.run(async (ctx) => {
      for (let index = 0; index < 65; index += 1) {
        const userId = await ctx.db.insert('users', { account_state: 'active' });
        await ctx.db.insert('play_game_accounts', { game_id: hostedIds[0]!, user_id: userId });
      }
    });
    await t.mutation(internal.playDeletion.queueBanGames, { operationId });
    const event = await t.run(async (ctx) => (await ctx.db.query('play_account_deletions').first())!);
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response(null, { status: 200 }))
    );
    await t.action(internal.playDeletion.deliver, { eventId: event._id });
    expect(await t.run(async (ctx) => (await ctx.db.get(event._id))?.state)).toBe('pending');
    expect(await t.run(async (ctx) => await ctx.db.query('play_game_accounts').take(10))).toHaveLength(3);
    await t.mutation(internal.playDeletion.settleUnopenedDeletion, { eventId: event._id });
    expect(await t.run(async (ctx) => (await ctx.db.get(event._id))?.state)).toBe('acknowledged');
    expect(await t.run(async (ctx) => await ctx.db.query('play_game_accounts').take(10))).toEqual([]);
  });

  test('retirement retries failures and removes all player routing only after success', async () => {
    const { t, operationId, hostedIds } = await fixture({ joined: 0 });
    await t.mutation(internal.playDeletion.queueBanGames, { operationId });
    const event = await t.run(async (ctx) => (await ctx.db.query('play_account_deletions').first())!);
    const fetch = vi.fn(async () => new Response(null, { status: 403 }));
    vi.stubGlobal('fetch', fetch);
    await t.action(internal.playDeletion.deliver, { eventId: event._id });
    const attempted = await t.run(async (ctx) => await ctx.db.get(event._id));
    expect(attempted).toMatchObject({ state: 'pending', attempts: 1 });
    expect(await t.run(async (ctx) => await ctx.db.query('play_game_accounts').take(10))).toHaveLength(2);
    fetch.mockResolvedValue(new Response(null, { status: 200 }));
    vi.setSystemTime(attempted!.next_attempt_at);
    await t.action(internal.playDeletion.deliver, { eventId: event._id });
    expect(fetch).toHaveBeenLastCalledWith(
      `https://dune.zone/__play/games/${hostedIds[0]}/retire`,
      expect.objectContaining({
        body: JSON.stringify({ gameId: hostedIds[0], secret: 'a'.repeat(64), banOperationId: operationId }),
      })
    );
    expect(await t.run(async (ctx) => await ctx.db.query('play_game_accounts').take(10))).toEqual([]);
    expect(await t.run(async (ctx) => await ctx.db.get(event._id))).toMatchObject({ state: 'acknowledged' });
    expect(await t.mutation(internal.playDeletion.applyBanGamesBatch, { operationId })).toEqual({ done: true });
  });
});
