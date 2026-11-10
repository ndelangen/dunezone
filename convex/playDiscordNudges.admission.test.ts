/* @vitest-environment edge-runtime */

import { afterEach, beforeEach, expect, test, vi } from 'vite-plus/test';

import { internal } from './_generated/api';
import { configureDiscord } from './playDiscord.test.fixture';
import { nudgeWorld } from './playDiscordNudges.test.fixture';

/* The first fixture loads the Convex handlers and component modules on a busy runner. */
vi.setConfig({ testTimeout: 20_000 });

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

test('only the game credential admits a nudge', async () => {
  const world = await nudgeWorld();
  expect(await world.publishNudge({ secret: '0'.repeat(64) })).toEqual({ ok: false });
  expect(await world.publishNudge({ gameId: 'unknown-game' })).toEqual({ ok: false });
  expect(await world.rows()).toEqual([]);
  expect(world.fetch).not.toHaveBeenCalled();
});

test.each([
  'off',
  'unconfigured',
  'unopted',
  'fixture',
  'finished',
  'discarded',
  'expired',
  'missing-ruleset',
  'channel-expired',
  'channel-deleted',
] as const)('%s games acknowledge and drop nudges', async (reason) => {
  const world = await nudgeWorld();
  await world.t.run(async (ctx) => {
    if (reason === 'off') {
      await ctx.db.insert('play_discord_settings', { enabled: false, updated_at: Date.now() });
    } else if (reason === 'unconfigured') {
      vi.stubEnv('DISCORD_BOT_TOKEN', '');
    } else if (reason === 'unopted') {
      await ctx.db.patch(world.gameId, { discord_voice: false });
    } else if (reason === 'fixture') {
      await ctx.db.patch(world.gameId, { fixture_key: 'synthetic-fixture' });
    } else if (reason === 'finished' || reason === 'discarded') {
      await ctx.db.patch(world.gameId, { directory_stage: reason });
    } else if (reason === 'expired') {
      await ctx.db.patch(world.gameId, { state: 'expired' });
    } else if (reason === 'missing-ruleset') {
      await ctx.db.patch(world.gameId, { ruleset_id: undefined });
    } else {
      const channel = await ctx.db.query('play_game_discord_channels').first();
      await ctx.db.patch(
        channel!._id,
        reason === 'channel-expired' ? { cleanup_at: Date.now() } : { state: 'deleted' }
      );
    }
  });
  expect(await world.publishNudge()).toEqual({ ok: true });
  expect(await world.rows()).toEqual([]);
  expect(world.fetch).not.toHaveBeenCalled();
});

test.each([-120_000, 10_001])('a nudge timestamp offset of %s ms cannot send', async (offset) => {
  const world = await nudgeWorld();
  expect(await world.publishNudge({ at: Date.now() + offset })).toEqual({ ok: true });
  expect(await world.rows()).toEqual([]);
});

test.each([
  'deleted',
  'deletion_pending',
  'merge_pending',
  'anonymous',
  'unlinked',
  'malformed-discord',
  'missing-user',
] as const)('a recipient who is %s does not receive a nudge', async (state) => {
  const world = await nudgeWorld();
  await world.t.run(async (ctx) => {
    if (state === 'unlinked') {
      await ctx.db.delete(world.authAccountId);
    } else if (state === 'malformed-discord') {
      await ctx.db.patch(world.authAccountId, { providerAccountId: '@everyone' });
    } else if (state === 'anonymous') {
      await ctx.db.patch(world.identity.userId, { isAnonymous: true });
    } else if (state === 'missing-user') {
      await ctx.db.delete(world.identity.userId);
    } else {
      await ctx.db.patch(world.identity.userId, { account_state: state });
    }
  });
  expect(await world.publishNudge()).toEqual({ ok: true });
  expect(await world.rows()).toEqual([]);
});

test('an actor retained in the game resolves to the merged account Discord link', async () => {
  const world = await nudgeWorld();
  await world.t.run(async (ctx) => {
    await ctx.db.patch(world.identity.userId, {
      merged_into_user_id: world.spectator.userId,
      account_state: 'deleted',
    });
    await ctx.db.patch(world.authAccountId, { userId: world.spectator.userId });
  });
  await world.publishNudge();
  await world.deliver();
  expect(world.fetch).toHaveBeenCalledTimes(1);
  expect(JSON.parse(world.fetch.mock.calls[0]![1]!.body as string)).toMatchObject({
    allowed_mentions: { users: ['123456789'] },
  });
});

test('duplicate delivery sends once; different senders share the target seat five-minute cooldown', async () => {
  const world = await nudgeWorld();
  await world.publishNudge();
  await world.deliver();
  await world.publishNudge();
  await world.deliver();
  await world.publishNudge({ nudgeId: 'harkonnen-nudge', fromFactionId: 'harkonnen', fromFactionName: 'Harkonnen' });
  await world.deliver();
  expect(world.fetch).toHaveBeenCalledTimes(1);
  vi.setSystemTime(Date.now() + 299_999);
  await world.publishNudge({ nudgeId: 'too-soon' });
  expect((await world.rows())[0]!.nudge_id).toBe('first-nudge');
  vi.setSystemTime(Date.now() + 1);
  await world.publishNudge({ nudgeId: 'after-cooldown' });
  await world.deliver();
  expect(world.fetch).toHaveBeenCalledTimes(2);
  expect(await world.rows()).toHaveLength(1);
});

test('another target seat has its own cooldown', async () => {
  const world = await nudgeWorld();
  await world.t.run((ctx) =>
    ctx.db.insert('authAccounts', {
      userId: world.spectator.userId,
      provider: 'discord',
      providerAccountId: '555555555',
    })
  );
  await world.publish(2, world.summary([world.identity.userId, world.spectator.userId]));
  await world.publishNudge();
  await world.deliver();
  await world.publishNudge({ nudgeId: 'other-seat', toSeat: 'seat-2', toUserId: world.spectator.userId });
  const rows = await world.rows();
  expect(rows).toHaveLength(2);
  const other = rows.find((row) => row.to_seat === 'seat-2')!;
  await world.t.action(internal.playDiscordNudgeActions.deliver, { id: other._id, nudgeId: other.nudge_id });
  expect(world.fetch).toHaveBeenCalledTimes(2);
  expect(JSON.parse(world.fetch.mock.calls[1]![1]!.body as string)).toMatchObject({
    allowed_mentions: { users: ['555555555'] },
  });
});
