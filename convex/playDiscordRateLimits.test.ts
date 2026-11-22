/* @vitest-environment edge-runtime */

import { afterEach, beforeEach, expect, test, vi } from 'vite-plus/test';

import { internal } from './_generated/api';
import { DiscordRest, DiscordPaused, discordBucketHoldKey, discordRouteHoldKey } from './lib/discordRest';
import type { DiscordRateLimitObservation, DiscordRequestGate, DiscordRequestScope } from './lib/discordRest';
import { playTest } from './play.test.fixture';
import { configureDiscord } from './playDiscord.test.fixture';

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

function client() {
  const t = playTest();
  const inspect = (scope: DiscordRequestScope) => t.query(internal.playDiscordRateLimits.inspect, scope);
  const observe = vi.fn((args: DiscordRateLimitObservation) =>
    t.mutation(internal.playDiscordRateLimits.observe, args)
  );
  const gate: DiscordRequestGate = { inspect, observe };
  return { t, inspect, observe, rest: new DiscordRest('test-token', 'Dune Play test', gate), gate };
}

const inviteScope: DiscordRequestScope = { route: 'channelInvite.create', major: 'channel:300' };

test.each(['user', 'shared'])(
  '%s 429 holds its route and bucket without blocking another resource or DELETE',
  async (scope) => {
    const { rest, inspect, t } = client();
    const fetch = vi.fn().mockResolvedValue(
      Response.json(
        { retry_after: 1.25, global: false },
        {
          status: 429,
          headers: {
            'Retry-After': '2.5',
            'X-RateLimit-Scope': scope,
            'X-RateLimit-Bucket': 'invites',
            'X-RateLimit-Remaining': '9',
            'X-RateLimit-Reset-After': '0.1',
          },
        }
      )
    );
    vi.stubGlobal('fetch', fetch);
    await expect(rest.invite('300')).rejects.toMatchObject({
      status: 429,
      retryAt: Date.now() + 2500,
      retryAfterMs: 2500,
      global: false,
    });
    expect(fetch).toHaveBeenCalledTimes(1);
    expect((await inspect(inviteScope))?.blockedUntil).toBe(Date.now() + 2500);
    expect((await inspect({ ...inviteScope, major: 'channel:301' }))?.blockedUntil).toBe(0);
    expect((await inspect({ route: 'channel.delete', major: 'channel:300' }))?.blockedUntil).toBe(0);
    expect((await inspect({ route: 'guildChannels.create', major: 'guild:100' }))?.blockedUntil).toBe(0);
    expect(
      (await t.query(internal.playDiscordRateLimits.inspect, { route: 'gatewayBot.read', major: 'none' }))?.globalUntil
    ).toBe(0);
    const holds = await t.run((ctx) => ctx.db.query('play_discord_rate_limits').take(10));
    expect(holds.map((row) => row.key).sort()).toEqual(
      [discordRouteHoldKey(inviteScope), discordBucketHoldKey('invites', inviteScope.major)].sort()
    );
    fetch.mockResolvedValueOnce(Response.json({ id: '300' }));
    await rest.remove('300');
    expect(fetch).toHaveBeenCalledTimes(2);
  }
);

test('known routes sharing a bucket and major resource share its hold', async () => {
  const { rest, observe, inspect } = client();
  const renameScope: DiscordRequestScope = { route: 'channel.rename', major: 'channel:300' };
  await observe({ ...renameScope, bucketId: 'same-bucket' });
  vi.stubGlobal(
    'fetch',
    vi
      .fn()
      .mockResolvedValue(
        Response.json({ retry_after: 30 }, { status: 429, headers: { 'X-RateLimit-Bucket': 'same-bucket' } })
      )
  );
  await expect(rest.invite('300')).rejects.toMatchObject({ status: 429 });
  expect((await inspect(renameScope))?.blockedUntil).toBe(Date.now() + 30_000);
  expect((await inspect({ ...renameScope, major: 'channel:301' }))?.blockedUntil).toBe(0);
});

test('a headerless 429 remains held through later alias changes', async () => {
  const { rest, observe, inspect } = client();
  await observe({ ...inviteScope, bucketId: 'old' });
  const fetch = vi.fn().mockResolvedValue(Response.json({ retry_after: 60 }, { status: 429 }));
  vi.stubGlobal('fetch', fetch);
  await expect(rest.invite('300')).rejects.toMatchObject({ status: 429 });
  await observe({ ...inviteScope, bucketId: 'new' });
  expect(await inspect(inviteScope)).toMatchObject({ bucketId: 'new', blockedUntil: Date.now() + 60_000 });
  await expect(rest.invite('300')).rejects.toMatchObject({ retryAt: Date.now() + 60_000 });
  expect(fetch).toHaveBeenCalledTimes(1);
});

test('a bucketed 429 also preserves its exact route hold after alias churn', async () => {
  const { observe, inspect } = client();
  await observe({ ...inviteScope, bucketId: 'old', limit: { until: Date.now() + 60_000, global: false } });
  await observe({ ...inviteScope, bucketId: 'new' });
  expect((await inspect(inviteScope))?.blockedUntil).toBe(Date.now() + 60_000);
});

test.each(['body', 'scope', 'global-header'] as const)(
  'only explicit %s global indication holds all requests',
  async (indicator) => {
    const { rest, inspect, t } = client();
    const headers: HeadersInit | undefined =
      indicator === 'scope'
        ? { 'X-RateLimit-Scope': 'global' }
        : indicator === 'global-header'
          ? { 'X-RateLimit-Global': 'true' }
          : undefined;
    const fetch = vi
      .fn()
      .mockResolvedValue(
        Response.json({ retry_after: 60, ...(indicator === 'body' ? { global: true } : {}) }, { status: 429, headers })
      );
    vi.stubGlobal('fetch', fetch);
    await expect(rest.invite('300')).rejects.toMatchObject({ global: true, retryAt: Date.now() + 60_000 });
    await expect(rest.request('POST', '/guilds/101/channels', {})).rejects.toMatchObject({ global: true });
    expect(fetch).toHaveBeenCalledTimes(1);
    expect((await inspect({ route: 'gatewayBot.read', major: 'none' }))?.globalUntil).toBe(Date.now() + 60_000);
    expect(await t.run((ctx) => ctx.db.query('play_discord_rate_limits').take(10))).toEqual([]);
  }
);

test('unchanged successful bucket mappings cause no observation mutation', async () => {
  const { rest, observe, t } = client();
  const fetch = vi
    .fn()
    .mockImplementation(async () =>
      Response.json({ code: 'shared-room' }, { headers: { 'X-RateLimit-Bucket': 'stable' } })
    );
  vi.stubGlobal('fetch', fetch);
  await rest.invite('300');
  expect(observe).toHaveBeenCalledTimes(1);
  await rest.invite('301');
  expect(observe).toHaveBeenCalledTimes(1);
  fetch.mockImplementationOnce(async () =>
    Response.json({ code: 'shared-room' }, { headers: { 'X-RateLimit-Bucket': 'changed' } })
  );
  await rest.invite('302');
  expect(observe).toHaveBeenCalledTimes(2);
  const aliases = await t.run((ctx) => ctx.db.query('play_discord_route_buckets').take(10));
  expect(aliases).toHaveLength(1);
  expect(aliases[0]).toMatchObject({ route: 'channelInvite.create', bucket_id: 'changed' });
});

test('shorter observations cannot shorten scoped or global holds', async () => {
  const { observe, inspect } = client();
  for (const global of [false, true]) {
    await observe({ ...inviteScope, bucketId: 'stable', limit: { until: Date.now() + 60_000, global } });
    await observe({ ...inviteScope, bucketId: 'stable', limit: { until: Date.now() + 1000, global } });
    expect((await inspect(inviteScope))?.blockedUntil).toBe(Date.now() + 60_000);
  }
});

test('rare observations prune at most eight expired holds and preserve live holds', async () => {
  const { t, observe } = client();
  await t.run(async (ctx) => {
    for (let i = 0; i < 12; i += 1) {
      await ctx.db.insert('play_discord_rate_limits', { key: `expired:${i}`, blocked_until: Date.now() - 1 });
    }
    await ctx.db.insert('play_discord_rate_limits', { key: 'live', blocked_until: Date.now() + 60_000 });
  });
  await observe({ ...inviteScope, bucketId: 'first' });
  let holds = await t.run((ctx) => ctx.db.query('play_discord_rate_limits').take(20));
  expect(holds).toHaveLength(5);
  expect(holds.filter((row) => row.key === 'live')).toHaveLength(1);
  await observe({ ...inviteScope, bucketId: 'second' });
  holds = await t.run((ctx) => ctx.db.query('play_discord_rate_limits').take(20));
  expect(holds.map((row) => row.key)).toEqual(['live']);
});

test('all eight aliases exclude concrete resource IDs and unsupported routes never fetch', async () => {
  const inspect = vi.fn<DiscordRequestGate['inspect']>().mockResolvedValue({ blockedUntil: 0, globalUntil: 0 });
  const rest = new DiscordRest('test-token', 'Dune Play test', { inspect, observe: vi.fn() });
  const fetch = vi.fn().mockImplementation(async () => Response.json({}));
  vi.stubGlobal('fetch', fetch);
  const requests = [
    ['GET', '/guilds/101/channels', 'guildChannels.read', 'guild:101'],
    ['POST', '/guilds/101/channels', 'guildChannels.create', 'guild:101'],
    ['GET', '/channels/301', 'channel.read', 'channel:301'],
    ['PATCH', '/channels/301', 'channel.rename', 'channel:301'],
    ['DELETE', '/channels/301', 'channel.delete', 'channel:301'],
    ['POST', '/channels/301/invites', 'channelInvite.create', 'channel:301'],
    ['POST', '/channels/301/messages', 'channelMessage.create', 'channel:301'],
    ['GET', '/gateway/bot', 'gatewayBot.read', 'none'],
  ] as const;
  for (const [method, path, route, major] of requests) {
    await rest.request(method, path);
    expect(inspect).toHaveBeenLastCalledWith({ route, major });
  }
  await expect(rest.request('GET', '/users/@me')).rejects.toThrow('Unsupported Discord request route.');
  expect(fetch).toHaveBeenCalledTimes(8);
});

test('header-only long 429 returns once with an absolute deadline, without sleeping', async () => {
  const { rest, observe } = client();
  const fetch = vi
    .fn()
    .mockResolvedValue(new Response('not JSON', { status: 429, headers: { 'Retry-After': '65.5' } }));
  vi.stubGlobal('fetch', fetch);
  await expect(rest.invite('300')).rejects.toMatchObject({ retryAfterMs: 65_500, retryAt: Date.now() + 65_500 });
  expect(fetch).toHaveBeenCalledTimes(1);
  expect(observe).toHaveBeenCalledTimes(1);
});

test('non-JSON 2xx remains an ambiguous failure and does not record a successful mapping', async () => {
  const { rest, observe } = client();
  vi.stubGlobal(
    'fetch',
    vi.fn().mockResolvedValue(
      new Response('not JSON', {
        status: 200,
        headers: { 'X-RateLimit-Bucket': 'stable' },
      })
    )
  );
  await expect(rest.request('POST', '/guilds/100/channels', {})).rejects.toMatchObject({ status: 0 });
  expect(observe).not.toHaveBeenCalled();
});

test('the hourly deadline prevents a fetch after gate lookup consumes its remaining time', async () => {
  const deadline = Date.now() + 25_000;
  const inspect: DiscordRequestGate['inspect'] = async () => {
    vi.setSystemTime(deadline);
    return { blockedUntil: 0, globalUntil: 0 };
  };
  const fetch = vi.fn();
  vi.stubGlobal('fetch', fetch);
  const rest = new DiscordRest('test-token', 'Dune Play test', { inspect, observe: vi.fn() }, deadline);
  await expect(rest.request('GET', '/gateway/bot')).rejects.toMatchObject({ status: 0 });
  expect(fetch).not.toHaveBeenCalled();
});

test('a hold beyond the hourly deadline remains intact without fetching or waiting', async () => {
  const { gate, observe } = client();
  const until = Date.now() + 60_000;
  await observe({ route: 'gatewayBot.read', major: 'none', limit: { until, global: true } });
  const fetch = vi.fn();
  vi.stubGlobal('fetch', fetch);
  const rest = new DiscordRest('test-token', 'Dune Play test', gate, Date.now() + 25_000);
  await expect(rest.request('GET', '/gateway/bot')).rejects.toMatchObject({ retryAt: until });
  expect(fetch).not.toHaveBeenCalled();
});

test('recovery lists the saved guild with full names and rejects conflicting guild data', async () => {
  const { rest } = client();
  const channels = [
    { id: '201', type: 4, name: 'Games' },
    {
      id: '301',
      type: 2,
      name: 'dune-play-exact-game',
      parent_id: '201',
      guild_id: '101',
    },
  ];
  const fetch = vi.fn().mockResolvedValueOnce(Response.json(channels));
  vi.stubGlobal('fetch', fetch);
  expect(await rest.listChannels('101')).toEqual(channels);
  expect(fetch.mock.calls[0]?.[0]).toBe('https://discord.com/api/v10/guilds/101/channels');
  fetch.mockResolvedValueOnce(Response.json([{ ...channels[1], guild_id: '100' }]));
  await expect(rest.listChannels('101')).rejects.toThrow('different server');
  fetch.mockResolvedValueOnce(Response.json([{ id: '301', type: 2 }]));
  await expect(rest.listChannels('101')).rejects.toThrow();
});

test('paused integration stops new requests and skips mapping-only observations', async () => {
  const { rest, t, observe } = client();
  await t.run((ctx) => ctx.db.insert('play_discord_settings', { enabled: false, updated_at: Date.now() }));
  const fetch = vi.fn();
  vi.stubGlobal('fetch', fetch);
  await expect(rest.invite('300')).rejects.toBeInstanceOf(DiscordPaused);
  await observe({ ...inviteScope, bucketId: 'ignored' });
  expect(fetch).not.toHaveBeenCalled();
  expect(await t.run((ctx) => ctx.db.query('play_discord_route_buckets').take(10))).toEqual([]);
});

test.each(['user', 'shared', 'global'] as const)(
  'an in-flight %s 429 received during pause still holds its scope after resume',
  async (scope) => {
    const { rest, t, inspect } = client();
    const until = Date.now() + 60_000;
    const fetch = vi.fn(async () => {
      await t.run((ctx) => ctx.db.insert('play_discord_settings', { enabled: false, updated_at: Date.now() }));
      return Response.json(
        { retry_after: 60, global: scope === 'global' },
        { status: 429, headers: { 'X-RateLimit-Scope': scope, 'X-RateLimit-Bucket': 'inflight' } }
      );
    });
    vi.stubGlobal('fetch', fetch);
    await expect(rest.invite('300')).rejects.toMatchObject({ status: 429, retryAt: until });
    expect(await inspect(inviteScope)).toBeNull();
    await expect(rest.invite('301')).rejects.toBeInstanceOf(DiscordPaused);
    await t.run(async (ctx) => {
      const settings = await ctx.db.query('play_discord_settings').unique();
      await ctx.db.patch(settings!._id, { enabled: true, updated_at: Date.now() });
    });
    expect(await inspect(inviteScope)).toMatchObject({
      blockedUntil: until,
      globalUntil: scope === 'global' ? until : 0,
      bucketId: 'inflight',
    });
    await expect(rest.invite('300')).rejects.toMatchObject({ retryAt: until, global: scope === 'global' });
    expect(fetch).toHaveBeenCalledTimes(1);
    for (const other of [
      { ...inviteScope, major: 'channel:301' },
      { route: 'channel.delete', major: 'channel:300' },
    ] satisfies DiscordRequestScope[]) {
      expect((await inspect(other))?.blockedUntil).toBe(scope === 'global' ? until : 0);
    }
  }
);
