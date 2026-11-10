// @vitest-environment edge-runtime
import { afterEach, beforeEach, expect, test, vi } from 'vite-plus/test';

import { api, internal } from './_generated/api';
import { ACCOUNT_STATES } from './lib/accountLifecycle';
import { DiscordRest } from './lib/discordRest';
import { configureDiscord } from './playDiscord.test.fixture';
import { nudgeWorld } from './playDiscordNudges.test.fixture';

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-11-10T12:00:00Z'));
  configureDiscord();
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

test('posts once with only the target allowed to be mentioned, and stores no delivery', async () => {
  const world = await nudgeWorld();
  await world.publish(
    3,
    world.summary([], {
      seats: [
        {
          seat: 'seat-1',
          userId: world.identity.userId,
          faction: { id: 'harkonnen', name: 'Harkonnen', color: 'red' },
        },
        {
          seat: 'seat-2',
          userId: world.spectator.userId,
          faction: { id: 'atreides', name: 'Atreides <@&777> [go](url) @here', color: 'green' },
        },
      ],
    })
  );
  expect(await world.publishNudge()).toEqual({ ok: true });
  expect(world.fetch).toHaveBeenCalledTimes(1);
  const [url, options] = world.fetch.mock.calls[0];
  expect(url).toBe('https://discord.com/api/v10/channels/300/messages');
  expect(JSON.parse(String(options?.body))).toEqual({
    content: '<@123456789> Atreides \\<@&777\\> \\[go\\](url) @here is waiting on you in Quiet Sietch.',
    allowed_mentions: { parse: [], users: ['123456789'], replied_user: false },
  });
  expect(await world.rows()).toEqual([]);
});

test('the single target-seat cooldown lasts five minutes', async () => {
  const world = await nudgeWorld();
  await world.publishNudge();
  await world.publishNudge();
  vi.setSystemTime(Date.now() + 299_999);
  await world.publishNudge();
  expect(world.fetch).toHaveBeenCalledTimes(1);
  vi.setSystemTime(Date.now() + 1);
  await world.publishNudge();
  expect(world.fetch).toHaveBeenCalledTimes(2);
});

test.each([
  'disabled',
  'voice off',
  'finished',
  'discarded',
  'missing sender',
  'missing target',
  'unlinked',
  'deleted',
  'anonymous',
  'channel missing',
  'self',
] as const)('%s drops a nudge before Discord', async (state) => {
  const world = await nudgeWorld();
  const channel = await world.channel();
  await world.t.run(async (ctx) => {
    if (state === 'disabled') await ctx.db.insert('play_discord_settings', { enabled: false, updated_at: Date.now() });
    if (state === 'voice off') await ctx.db.patch(world.gameId, { discord_voice: false });
    if (state === 'finished' || state === 'discarded') await ctx.db.patch(world.gameId, { directory_stage: state });
    if (state === 'unlinked') await ctx.db.delete(world.authAccountId);
    if (state === 'deleted') await ctx.db.patch(world.identity.userId, { account_state: 'deleted' });
    if (state === 'anonymous') await ctx.db.patch(world.identity.userId, { isAnonymous: true });
    if (state === 'channel missing') await ctx.db.delete(channel!._id);
  });
  await world.publishNudge({
    ...(state === 'missing sender' ? { fromSeat: 'absent' } : {}),
    ...(state === 'missing target' ? { toSeat: 'absent' } : {}),
    ...(state === 'self' ? { fromSeat: 'seat-1' } : {}),
  });
  expect(world.fetch).not.toHaveBeenCalled();
});

test('authentication rejects a bad game credential and chat text never enters the action', async () => {
  const world = await nudgeWorld();
  expect(await world.publishNudge({ secret: '0'.repeat(64) })).toEqual({ ok: false });
  await expect(
    world.t.action(api.playDiscordNudges.sendNudge, { ...world.request(), text: 'secret chat' } as never)
  ).rejects.toThrow();
  expect(world.fetch).not.toHaveBeenCalled();
});

test.each([429, 503])('Discord %s is logged and dropped after one POST without scheduling retries', async (status) => {
  const world = await nudgeWorld();
  const error = vi.spyOn(console, 'error').mockImplementation(() => undefined);
  world.fetch.mockResolvedValue(Response.json({ retry_after: 1, secret: 'private response' }, { status }));
  const scheduled = () => world.t.run((ctx) => ctx.db.system.query('_scheduled_functions').collect());
  const before = await scheduled();
  await world.publishNudge();
  expect(world.fetch).toHaveBeenCalledTimes(1);
  expect(error).toHaveBeenCalledWith('Discord nudge dropped.', `Discord request failed (${status}).`);
  expect(await scheduled()).toEqual(before);
  expect(await world.rows()).toEqual([]);
  expect(await world.t.run((ctx) => ctx.db.query('play_discord_cooldown').take(2))).toEqual([]);
});

test.each(['fromUserId', 'fromFactionId', 'toUserId'] as const)(
  'a mismatched %s drops a stale-seat nudge without spending cooldown',
  async (field) => {
    const world = await nudgeWorld();
    await world.publishNudge({ [field]: 'different-occupant-or-faction' });
    expect(world.fetch).not.toHaveBeenCalled();
    await world.publishNudge();
    expect(world.fetch).toHaveBeenCalledTimes(1);
  }
);

test('an activity-only directory update can be ahead or behind without dropping a valid nudge', async () => {
  const world = await nudgeWorld();
  const game = await world.t.run((ctx) => ctx.db.get(world.gameId));
  await world.t.run((ctx) =>
    ctx.db.patch(world.gameId, {
      directory_sequence: 3,
      directory: { ...game!.directory!, lastActivityAt: Date.now() + 600_000 },
    })
  );
  await world.publishNudge();
  expect(world.fetch).toHaveBeenCalledTimes(1);
});

test('an old Worker mutation remains valid after Convex deploys and drops queued legacy nudges', async () => {
  const world = await nudgeWorld();
  const args = {
    gameId: world.gameId,
    secret: world.credentials.secret,
    nudgeId: 'legacy-event',
    fromFactionId: 'atreides',
    fromFactionName: 'Atreides',
    toSeat: 'seat-1',
    toUserId: world.identity.userId,
    at: Date.now(),
  };
  const scheduled = () => world.t.run((ctx) => ctx.db.system.query('_scheduled_functions').collect());
  const before = await scheduled();
  expect(await world.t.mutation(api.playDiscordNudges.publishNudge, args)).toEqual({ ok: true });
  expect(await world.t.mutation(api.playDiscordNudges.publishNudge, { ...args, secret: '0'.repeat(64) })).toEqual({
    ok: false,
  });
  expect(world.fetch).not.toHaveBeenCalled();
  expect(await scheduled()).toEqual(before);
  expect(await world.rows()).toEqual([]);
});

test.each(['body', 'global header', 'scope header'] as const)(
  'a global 429 identified by %s holds other bot REST requests but never retries the nudge',
  async (source) => {
    const world = await nudgeWorld();
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    world.fetch.mockResolvedValue(
      Response.json(
        { retry_after: 60, ...(source === 'body' ? { global: true } : {}) },
        {
          status: 429,
          headers:
            source === 'global header'
              ? { 'X-RateLimit-Global': 'true' }
              : source === 'scope header'
                ? { 'X-RateLimit-Scope': 'global' }
                : {},
        }
      )
    );
    await world.publishNudge();
    const until = Date.now() + 60_000;
    expect(await world.t.query(internal.playDiscord.cooldownUntil, {})).toBe(until);
    const rest = new DiscordRest('test-token', 'Another game', {
      until: () => world.t.query(internal.playDiscord.cooldownUntil, {}),
      hold: (until) => world.t.mutation(internal.playDiscord.holdRequests, { until }),
    });
    await expect(rest.invite('301')).rejects.toMatchObject({ status: 429, retryAfterMs: 60_000 });
    expect(world.fetch).toHaveBeenCalledTimes(1);
    expect(await world.rows()).toEqual([]);
  }
);

test.each(['user', 'shared'] as const)(
  'a %s 429 drops only the nudge and leaves other bot requests available',
  async (scope) => {
    const world = await nudgeWorld();
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    world.fetch.mockResolvedValueOnce(
      Response.json({ retry_after: 60, global: false }, { status: 429, headers: { 'X-RateLimit-Scope': scope } })
    );
    await world.publishNudge();
    expect(await world.t.query(internal.playDiscord.cooldownUntil, {})).toBe(0);
    world.fetch.mockResolvedValueOnce(Response.json({ code: 'next-room' }));
    const rest = new DiscordRest('test-token', 'Another game', {
      until: () => world.t.query(internal.playDiscord.cooldownUntil, {}),
      hold: (until) => world.t.mutation(internal.playDiscord.holdRequests, { until }),
    });
    expect(await rest.invite('301')).toBe('https://discord.gg/next-room');
    expect(world.fetch).toHaveBeenCalledTimes(2);
  }
);

/* This table also covers bans when the account-ban release adds its state. */
test.each(ACCOUNT_STATES.filter((state) => state !== 'active'))(
  'a sender changed to %s after the directory snapshot cannot nudge or consume quota',
  async (state) => {
    const world = await nudgeWorld();
    await world.t.run((ctx) => ctx.db.patch(world.spectator.userId, { account_state: state }));
    expect(await world.publishNudge()).toEqual({ ok: true });
    expect(world.fetch).not.toHaveBeenCalled();
    await world.t.run((ctx) => ctx.db.patch(world.spectator.userId, { account_state: 'active' }));
    await world.publishNudge();
    expect(world.fetch).toHaveBeenCalledTimes(1);
  }
);

test.each(ACCOUNT_STATES.filter((state) => state !== 'active'))(
  'an alias whose canonical sender is %s cannot nudge or consume quota',
  async (state) => {
    const world = await nudgeWorld();
    const aliasId = await world.t.run(async (ctx) => {
      const aliasId = await ctx.db.insert('users', {
        name: 'Old sender',
        account_state: 'merge_pending',
        merged_into_user_id: world.spectator.userId,
      });
      const game = (await ctx.db.get(world.gameId))!;
      await ctx.db.patch(world.gameId, {
        directory: {
          ...game.directory!,
          seats: game.directory!.seats.map((seat) => (seat.seat === 'seat-2' ? { ...seat, userId: aliasId } : seat)),
        },
      });
      await ctx.db.patch(world.spectator.userId, { account_state: state });
      return aliasId;
    });
    expect(await world.publishNudge({ fromUserId: aliasId })).toEqual({ ok: true });
    expect(world.fetch).not.toHaveBeenCalled();
    await world.t.run((ctx) => ctx.db.patch(world.spectator.userId, { account_state: 'active' }));
    await world.publishNudge({ fromUserId: aliasId });
    expect(world.fetch).toHaveBeenCalledTimes(1);
  }
);

test('an anonymous sender cannot nudge or consume quota', async () => {
  const world = await nudgeWorld();
  await world.t.run((ctx) => ctx.db.patch(world.spectator.userId, { isAnonymous: true }));
  await world.publishNudge();
  expect(world.fetch).not.toHaveBeenCalled();
  await world.t.run((ctx) => ctx.db.patch(world.spectator.userId, { isAnonymous: false }));
  await world.publishNudge();
  expect(world.fetch).toHaveBeenCalledTimes(1);
});
