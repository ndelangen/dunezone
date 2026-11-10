/* @vitest-environment edge-runtime */

import { afterEach, beforeEach, expect, test, vi } from 'vite-plus/test';

import { api, internal } from './_generated/api';
import { DiscordFailure, DiscordPaused, DiscordRest } from './lib/discordRest';
import { SnapshotSocket, snapshotDiscovery, snapshotGuild } from './lib/discordVoiceSnapshot.test.fixture';
import { VOICE_BATCH } from './lib/playDiscordVoice';
import { configureDiscord, discordStub, voiceWorld } from './playDiscord.test.fixture';
import { reportEmpty, voiceCandidates } from './playDiscordVoice';

vi.setConfig({ testTimeout: 30_000 });
beforeEach(() => {
  vi.useFakeTimers();
  configureDiscord();
  SnapshotSocket.sockets = [];
  SnapshotSocket.onIdentify = (socket) => queueMicrotask(() => socket.packet(0, snapshotGuild(), 'GUILD_CREATE'));
  vi.stubGlobal('WebSocket', SnapshotSocket);
});
afterEach(() => {
  vi.clearAllTimers();
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});
async function endedWorld() {
  const discord = discordStub();
  const world = await voiceWorld();
  await world.reconcile();
  await world.publish(2, world.summary(undefined, { stage: 'finished' }));
  await world.reconcile();
  const normal = discord.fetch.getMockImplementation()!;
  discord.fetch.mockImplementation(async (input, options) =>
    (input instanceof Request ? input.url : String(input)).endsWith('/gateway/bot')
      ? Response.json(snapshotDiscovery)
      : normal(input, options)
  );
  return { world, discord };
}
const cleanup = async (world: Awaited<ReturnType<typeof voiceWorld>>) => {
  const channels = await world.t.run(voiceCandidates);
  return await world.t.action(internal.playDiscordVoiceActions.cleanup, { channels });
};

/* The ended-name PATCH can finish before its reconciliation owner releases the lease. */
async function holdCompletedRename(world: Awaited<ReturnType<typeof voiceWorld>>) {
  const row = (await world.channel())!;
  await world.t.run((ctx) => ctx.db.patch(row._id, { renamed_ended: false, next_attempt_at: Date.now() }));
  const claimed = (await world.t.mutation(internal.playDiscord.claim, { channelId: row._id }))!;
  expect(claimed).not.toBeNull();
  const claim = { channelId: row._id, lease: claimed.lease! };
  await world.t.mutation(internal.playDiscord.renamed, { ...claim, ended: true });
  return claim;
}

test('the hourly action uses one snapshot and deletes only an empty ended room', async () => {
  const { world, discord } = await endedWorld();
  await cleanup(world);
  expect(await world.channel()).toMatchObject({ state: 'deleting' });
  await world.reconcile();
  expect(await world.channel()).toMatchObject({ state: 'deleted' });
  expect(discord.calls.filter((call) => call.method === 'DELETE')).toHaveLength(1);
  expect(SnapshotSocket.sockets).toHaveLength(1);
  expect(SnapshotSocket.sockets[0]?.closed).toBe(true);
});

test('an occupied room survives, while each hourly run closes its connection', async () => {
  const { world } = await endedWorld();
  SnapshotSocket.onIdentify = (socket) =>
    queueMicrotask(() => socket.packet(0, snapshotGuild([{ user_id: '900', channel_id: '300' }]), 'GUILD_CREATE'));
  await cleanup(world);
  expect(await world.channel()).toMatchObject({ state: 'ready' });
  expect(SnapshotSocket.sockets[0]?.closed).toBe(true);
  vi.setSystemTime(Date.now() + 3_600_000);
  SnapshotSocket.onIdentify = (socket) => queueMicrotask(() => socket.packet(0, snapshotGuild(), 'GUILD_CREATE'));
  await cleanup(world);
  expect(await world.channel()).toMatchObject({ state: 'deleting' });
  expect(SnapshotSocket.sockets).toHaveLength(2);
});

test('an occupied snapshot makes no retirement mutation call', async () => {
  const { world } = await endedWorld();
  /* convex-test invokes this registration hook, which Convex omits from its public declarations. */
  const registered = reportEmpty as typeof reportEmpty & { _handler: (...args: unknown[]) => unknown };
  const retirement = vi.spyOn(registered, '_handler');
  SnapshotSocket.onIdentify = (socket) =>
    queueMicrotask(() => socket.packet(0, snapshotGuild([{ user_id: '900', channel_id: '300' }]), 'GUILD_CREATE'));
  await cleanup(world);
  expect(SnapshotSocket.sockets).toHaveLength(1);
  expect(SnapshotSocket.sockets[0]?.closed).toBe(true);
  expect(retirement).not.toHaveBeenCalled();
  expect(await world.channel()).toMatchObject({ state: 'ready' });
});

test('a small occupied set needs no fairness writes between hourly checks', async () => {
  const { world } = await endedWorld();
  const before = await world.channel();
  const first = await world.t.run(voiceCandidates);
  vi.setSystemTime(Date.now() + 3_600_000);
  expect(await world.t.run(voiceCandidates)).toEqual(first);
  expect(await world.channel()).toEqual(before);
});

test.each(['no-candidates', 'disabled', 'unconfigured'] as const)(
  '%s makes no Discord request or connection',
  async (mode) => {
    const { world, discord } = await endedWorld();
    if (mode === 'no-candidates') {
      await world.publish(3, world.summary(undefined, { stage: 'play' }));
      await world.reconcile();
    } else if (mode === 'disabled') {
      await world.t.run((ctx) => ctx.db.insert('play_discord_settings', { enabled: false, updated_at: Date.now() }));
    } else {
      vi.stubEnv('DISCORD_BOT_TOKEN', '');
    }
    discord.fetch.mockClear();
    await cleanup(world);
    expect(discord.fetch).not.toHaveBeenCalled();
    expect(SnapshotSocket.sockets).toEqual([]);
  }
);

test.each(
  (['continue', 'refinish', 'replacement', 'old', 'paused'] as const).flatMap((mode) =>
    (['empty', 'missing'] as const).map((observation) => ({ mode, observation }))
  )
)('$mode fences a stale $observation observation', async ({ mode, observation }) => {
  const { world, discord } = await endedWorld();
  const channels = await world.t.run(voiceCandidates);
  const observedAt = Date.now();
  if (mode === 'continue' || mode === 'refinish') {
    await world.publish(3, world.summary(undefined, { stage: 'play' }));
    await world.reconcile();
    if (mode === 'refinish') {
      await world.publish(4, world.summary(undefined, { stage: 'finished' }));
      await world.reconcile();
    }
  } else if (mode === 'replacement') {
    const row = (await world.channel())!;
    await world.t.run((ctx) => ctx.db.patch(row._id, { channel_id: '301' }));
  } else if (mode === 'old') {
    vi.setSystemTime(Date.now() + 30_001);
  } else {
    await world.t.run((ctx) => ctx.db.insert('play_discord_settings', { enabled: false, updated_at: Date.now() }));
  }
  await world.t.mutation(internal.playDiscordVoice.reportEmpty, {
    channels: observation === 'empty' ? channels : [],
    missingChannels: observation === 'missing' ? channels : [],
    observedAt,
  });
  expect(await world.channel()).toMatchObject({ state: 'ready' });
  expect(discord.calls.filter((call) => call.method === 'DELETE')).toEqual([]);
});

test('a held reconcile lease cannot revive a channel confirmed missing', async () => {
  const { world, discord } = await endedWorld();
  const claim = await holdCompletedRename(world);
  const channels = await world.t.run(voiceCandidates);
  await world.t.mutation(internal.playDiscordVoice.reportEmpty, {
    channels: [],
    missingChannels: channels,
    observedAt: Date.now(),
  });
  expect(await world.t.mutation(internal.playDiscord.work, claim)).toBeNull();
  await world.t.mutation(internal.playDiscord.renamed, { ...claim, ended: true });
  await world.t.mutation(internal.playDiscord.release, {
    ...claim,
    error: 'Delayed rename failed',
    retryAfterMs: 1000,
    retryOperation: 'rename-ended',
  });
  await world.reconcile();
  const retired = (await world.channel())!;
  expect(retired.state).toBe('deleted');
  expect(retired.invite_url).toBeUndefined();
  expect(retired.error).toBeUndefined();
  expect(retired.retry_after).toBeUndefined();
  expect(discord.calls.filter((call) => call.method === 'DELETE')).toHaveLength(0);
});

test('empty deletion requested under a held rename lease is not lost on release', async () => {
  const { world, discord } = await endedWorld();
  const claim = await holdCompletedRename(world);
  const channels = await world.t.run(voiceCandidates);
  await world.t.mutation(internal.playDiscordVoice.reportEmpty, { channels, observedAt: Date.now() });
  await world.reconcile();
  expect(discord.calls.filter((call) => call.method === 'DELETE')).toEqual([]);
  await world.t.mutation(internal.playDiscord.release, claim);
  expect((await world.channel())!.next_attempt_at).toBeLessThanOrEqual(Date.now());
  await world.reconcile();
  expect(await world.channel()).toMatchObject({ state: 'deleted' });
});

test('a full occupied batch cannot starve later ended rooms', async () => {
  const { world } = await endedWorld();
  const initial = (await world.channel())!;
  const { _id: _ignoredId, _creationTime: _ignoredTime, ...fields } = initial;
  await world.t.run(async (ctx) => {
    for (let index = 0; index < VOICE_BATCH; index += 1) {
      await ctx.db.insert('play_game_discord_channels', { ...fields, channel_id: String(400 + index) });
    }
  });
  const first = await world.t.run(voiceCandidates);
  expect(first).toHaveLength(VOICE_BATCH);
  vi.setSystemTime(Date.now() + 3_600_000);
  const second = await world.t.run(voiceCandidates);
  expect(second.some((channel) => !first.some((previous) => previous.channelId === channel.channelId))).toBe(true);
});

test('Gateway discovery honors and publishes the existing bot-wide cooldown without retrying', async () => {
  const { world, discord } = await endedWorld();
  discord.fetch.mockClear();
  discord.fetch.mockResolvedValue(Response.json({ global: true, retry_after: 60 }, { status: 429 }));
  await cleanup(world);
  expect(discord.fetch).toHaveBeenCalledTimes(1);
  expect(await world.t.query(internal.playDiscord.cooldownUntil, {})).toBe(Date.now() + 60_000);
  expect(SnapshotSocket.sockets).toEqual([]);
  expect(await world.channel()).toMatchObject({ state: 'ready' });
});

test('the V8 cron dispatches one Node action only when eligible rooms exist', async () => {
  const { world } = await endedWorld();
  const scheduled = () =>
    world.t.run(async (ctx) =>
      (await ctx.db.system.query('_scheduled_functions').take(100)).filter(
        (job) => job.name === 'playDiscordVoiceActions:cleanup'
      )
    );
  await world.t.mutation(internal.playDiscordVoice.checkDue, {});
  expect(await scheduled()).toHaveLength(1);
  await world.publish(3, world.summary(undefined, { stage: 'play' }));
  await world.reconcile();
  await world.t.mutation(internal.playDiscordVoice.checkDue, {});
  expect(await scheduled()).toHaveLength(1);
});

test.each([
  { status: 404, code: 10_003, deleted: true },
  { status: 403, code: 50_001, deleted: false },
  { status: 404, code: 10_004, deleted: false },
  { status: 500, code: 0, deleted: false },
])(
  'a missing snapshot target with GET $status/$code is terminal only for unknown channel',
  async ({ status, code, deleted }) => {
    const { world, discord } = await endedWorld();
    SnapshotSocket.onIdentify = (socket) =>
      queueMicrotask(() => socket.packet(0, { ...snapshotGuild(), channels: [] }, 'GUILD_CREATE'));
    const normal = discord.fetch.getMockImplementation()!;
    discord.fetch.mockImplementation(async (input, options) =>
      input === 'https://discord.com/api/v10/channels/300' && options?.method === 'GET'
        ? Response.json({ code }, { status })
        : normal(input, options)
    );
    await cleanup(world);
    expect(await world.channel()).toMatchObject({ state: deleted ? 'deleted' : 'ready' });
    if (deleted) {
      await world.reconcile();
      expect(await world.channel()).toMatchObject({ state: 'deleted' });
    }
    expect(discord.calls.filter((call) => call.method === 'DELETE')).toHaveLength(0);
  }
);

test.each(['rate-limited', 'paused'] as const)(
  'missing-channel checks stop taking new rooms when the batch is %s',
  async (mode) => {
    const { world } = await endedWorld();
    const original = (await world.channel())!;
    const { _id: _ignoredId, _creationTime: _ignoredTime, ...fields } = original;
    await world.t.run(async (ctx) => {
      for (let index = 0; index < 20; index += 1) {
        await ctx.db.insert('play_game_discord_channels', { ...fields, channel_id: String(400 + index) });
      }
    });
    SnapshotSocket.onIdentify = (socket) =>
      queueMicrotask(() => socket.packet(0, { ...snapshotGuild(), channels: [] }, 'GUILD_CREATE'));
    const requests = vi.spyOn(DiscordRest.prototype, 'request').mockImplementation(async (_method, path) => {
      if (path === '/gateway/bot') {
        return snapshotDiscovery;
      }
      throw mode === 'rate-limited' ? new DiscordFailure(429, undefined, 60_000) : new DiscordPaused();
    });
    await cleanup(world);
    /* The four already-started checks may settle; none of the remaining rooms may start another cooldown read. */
    expect(requests.mock.calls.filter(([_method, path]) => path.startsWith('/channels/'))).toHaveLength(4);
  }
);

test('browser responses contain neither bot credentials nor game secrets', async () => {
  const { world } = await endedWorld();
  await world.t.run((ctx) => ctx.db.patch(world.identity.userId, { isAdmin: true }));
  const dashboard = await world.player.query(api.playDiscordAdmin.dashboard, {
    paginationOpts: { numItems: 10, cursor: null },
  });
  for (const response of [dashboard, await world.menu()]) {
    expect(JSON.stringify(response)).not.toContain('test-token');
    expect(JSON.stringify(response)).not.toContain(world.credentials.secret);
  }
});
