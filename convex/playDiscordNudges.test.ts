// @vitest-environment edge-runtime
import { afterEach, beforeEach, expect, test, vi } from 'vite-plus/test';

import type { PlaySendNudgeRequest } from '../src/shared/play/nudges';
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
  expect(await new Response(options?.body).json()).toEqual({
    content: '<@123456789> Atreides \\<@&777\\> \\[go\\](url) @here is waiting on you in Quiet Sietch.',
    allowed_mentions: { parse: [], users: ['123456789'], replied_user: false },
  });
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

type NudgeWorld = Awaited<ReturnType<typeof nudgeWorld>>;
type RejectedNudge = {
  setup?: (world: NudgeWorld) => Promise<unknown>;
  request?: Partial<PlaySendNudgeRequest>;
};

const rejectedNudges: Record<string, RejectedNudge> = {
  disabled: {
    setup: (world) =>
      world.t.run((ctx) => ctx.db.insert('play_discord_settings', { enabled: false, updated_at: Date.now() })),
  },
  'voice off': { setup: (world) => world.t.run((ctx) => ctx.db.patch(world.gameId, { discord_voice: false })) },
  finished: { setup: (world) => world.t.run((ctx) => ctx.db.patch(world.gameId, { directory_stage: 'finished' })) },
  discarded: { setup: (world) => world.t.run((ctx) => ctx.db.patch(world.gameId, { directory_stage: 'discarded' })) },
  'missing sender': { request: { fromSeat: 'absent' } },
  'missing target': { request: { toSeat: 'absent' } },
  unlinked: { setup: (world) => world.t.run((ctx) => ctx.db.delete(world.authAccountId)) },
  deleted: {
    setup: (world) => world.t.run((ctx) => ctx.db.patch(world.identity.userId, { account_state: 'deleted' })),
  },
  anonymous: { setup: (world) => world.t.run((ctx) => ctx.db.patch(world.identity.userId, { isAnonymous: true })) },
  'channel missing': {
    setup: async (world) => {
      const channel = (await world.channel())!;
      await world.t.run((ctx) => ctx.db.delete(channel._id));
    },
  },
  self: { request: { fromSeat: 'seat-1' } },
};

test.each(Object.entries(rejectedNudges))('%s drops a nudge before Discord', async (_state, fixture) => {
  const world = await nudgeWorld();
  await fixture.setup?.(world);
  await world.publishNudge(fixture.request);
  expect(world.fetch).not.toHaveBeenCalled();
});

/** Restoring eligibility must permit the first POST immediately, proving rejection spent no cooldown. */
async function restoreNudgeEligibility(
  world: NudgeWorld,
  restore: () => Promise<unknown>,
  request: Partial<PlaySendNudgeRequest> = {}
) {
  const response = await world.publishNudge(request);
  const callsBeforeRestoring = world.fetch.mock.calls.length;
  await restore();
  await world.publishNudge(request);
  return { response, callsBeforeRestoring, callsAfterRestoring: world.fetch.mock.calls.length };
}

const expectedRestoredEligibility = {
  response: { ok: true },
  callsBeforeRestoring: 0,
  callsAfterRestoring: 1,
};

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
    expect(
      (await world.t.query(internal.playDiscordRateLimits.inspect, { route: 'gatewayBot.read', major: 'none' }))
        ?.globalUntil
    ).toBe(until);
    const rest = new DiscordRest('test-token', 'Another game', {
      inspect: (scope) => world.t.query(internal.playDiscordRateLimits.inspect, scope),
      observe: (observation) => world.t.mutation(internal.playDiscordRateLimits.observe, observation),
    });
    await expect(rest.invite('301')).rejects.toMatchObject({ status: 429, retryAfterMs: 60_000 });
    expect(world.fetch).toHaveBeenCalledTimes(1);
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
    expect(
      (await world.t.query(internal.playDiscordRateLimits.inspect, { route: 'gatewayBot.read', major: 'none' }))
        ?.globalUntil
    ).toBe(0);
    world.fetch.mockResolvedValueOnce(Response.json({ code: 'next-room' }));
    const rest = new DiscordRest('test-token', 'Another game', {
      inspect: (scope) => world.t.query(internal.playDiscordRateLimits.inspect, scope),
      observe: (observation) => world.t.mutation(internal.playDiscordRateLimits.observe, observation),
    });
    expect(await rest.invite('301')).toBe('https://discord.gg/next-room');
    expect(world.fetch).toHaveBeenCalledTimes(2);
  }
);

/* Every inactive sender state is covered, including banned accounts. */
test.each(ACCOUNT_STATES.filter((state) => state !== 'active'))(
  'a sender changed to %s after the directory snapshot cannot nudge or consume quota',
  async (state) => {
    const world = await nudgeWorld();
    await world.t.run((ctx) => ctx.db.patch(world.spectator.userId, { account_state: state }));
    const result = await restoreNudgeEligibility(world, () =>
      world.t.run((ctx) => ctx.db.patch(world.spectator.userId, { account_state: 'active' }))
    );
    expect(result).toEqual(expectedRestoredEligibility);
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
    const result = await restoreNudgeEligibility(
      world,
      () => world.t.run((ctx) => ctx.db.patch(world.spectator.userId, { account_state: 'active' })),
      { fromUserId: aliasId }
    );
    expect(result).toEqual(expectedRestoredEligibility);
  }
);

test.each(['banned', 'unlinked'] as const)(
  'an alias whose canonical recipient is %s cannot be pinged or consume cooldown',
  async (state) => {
    const world = await nudgeWorld();
    const aliasId = await world.t.run(async (ctx) => {
      const aliasId = await ctx.db.insert('users', {
        name: 'Old recipient',
        account_state: 'merge_pending',
        merged_into_user_id: world.identity.userId,
      });
      const game = (await ctx.db.get(world.gameId))!;
      await ctx.db.patch(world.gameId, {
        directory: {
          ...game.directory!,
          seats: game.directory!.seats.map((seat) => (seat.seat === 'seat-1' ? { ...seat, userId: aliasId } : seat)),
        },
      });
      if (state === 'banned') {
        await ctx.db.patch(world.identity.userId, { account_state: 'banned' });
      } else {
        await ctx.db.delete(world.authAccountId);
      }
      return aliasId;
    });

    expect(await world.publishNudge({ toUserId: aliasId })).toEqual({ ok: true });
    expect(world.fetch).not.toHaveBeenCalled();

    await world.t.run(async (ctx) => {
      if (state === 'banned') {
        await ctx.db.patch(world.identity.userId, { account_state: 'active' });
      } else {
        await ctx.db.insert('authAccounts', {
          userId: world.identity.userId,
          provider: 'discord',
          providerAccountId: '123456789',
        });
      }
    });
    await world.publishNudge({ toUserId: aliasId });
    expect(world.fetch).toHaveBeenCalledTimes(1);
    expect(await new Response(world.fetch.mock.calls[0][1]?.body).json()).toMatchObject({
      allowed_mentions: { users: ['123456789'] },
    });
  }
);

test('an anonymous sender cannot nudge or consume quota', async () => {
  const world = await nudgeWorld();
  await world.t.run((ctx) => ctx.db.patch(world.spectator.userId, { isAnonymous: true }));
  const result = await restoreNudgeEligibility(world, () =>
    world.t.run((ctx) => ctx.db.patch(world.spectator.userId, { isAnonymous: false }))
  );
  expect(result).toEqual(expectedRestoredEligibility);
});
