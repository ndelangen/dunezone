/* @vitest-environment edge-runtime */

import { afterEach, beforeEach, expect, test, vi } from 'vite-plus/test';

import { api, internal } from './_generated/api';
import { discordNeedsAttention } from './lib/discordRetry';
import { DISCORD_DAY } from './lib/playDiscord';
import { playPerson } from './play.test.fixture';
import { configureDiscord, discordStub, voiceWorld } from './playDiscord.test.fixture';
import { voiceCandidates } from './playDiscordVoice';

type World = Awaited<ReturnType<typeof voiceWorld>>;
type Operation = 'categories' | 'create' | 'invite' | 'rename-ended' | 'rename-active' | 'delete';

beforeEach(() => {
  vi.useFakeTimers();
  configureDiscord();
});
afterEach(() => {
  vi.clearAllTimers();
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

const endpoints: Record<Operation, { method: string; path: string; status: number }> = {
  categories: { method: 'GET', path: '/guilds/100/channels', status: 503 },
  create: { method: 'POST', path: '/guilds/100/channels', status: 403 },
  invite: { method: 'POST', path: '/channels/300/invites', status: 503 },
  'rename-ended': { method: 'PATCH', path: '/channels/300', status: 503 },
  'rename-active': { method: 'PATCH', path: '/channels/300', status: 503 },
  delete: { method: 'DELETE', path: '/channels/300', status: 503 },
};

function rejectEndpoint(discord: ReturnType<typeof discordStub>, operation: Operation) {
  const normal = discord.fetch.getMockImplementation()!;
  const endpoint = endpoints[operation];
  const attempts: number[] = [];
  discord.fetch.mockImplementation(async (input, options) => {
    const url = input instanceof Request ? input.url : String(input);
    if (options?.method === endpoint.method && url === `https://discord.com/api/v10${endpoint.path}`) {
      attempts.push(Date.now());
      return Response.json({}, { status: endpoint.status });
    }
    return await normal(input, options);
  });
  return attempts;
}

function lostCreationRemote(world: World, discord: ReturnType<typeof discordStub>) {
  const marker = `dune-play-${world.gameId}`;
  const normal = discord.fetch.getMockImplementation()!;
  const remote = { visible: false, creates: 0, listings: 0 };
  discord.fetch.mockImplementation(async (input, options) => {
    const url = input instanceof Request ? input.url : String(input);
    if (url === 'https://discord.com/api/v10/guilds/100/channels') {
      if (options?.method === 'POST') {
        remote.creates += 1;
        throw new Error('Discord committed the channel but its response was lost.');
      }
      remote.listings += 1;
      return Response.json([
        { id: '200', type: 4, name: 'Games', guild_id: '100' },
        ...(remote.visible ? [{ id: '300', type: 2, name: marker, parent_id: '200', guild_id: '100' }] : []),
      ]);
    }
    expect(await world.channel()).toMatchObject({ channel_id: '300', state: 'pending' });
    return await normal(input, options);
  });
  return remote;
}

async function operationWorld(operation: Operation) {
  const discord = discordStub();
  const world = await voiceWorld();
  if (operation === 'rename-ended' || operation === 'rename-active' || operation === 'delete') {
    await world.reconcile();
    await world.publish(2, world.summary(undefined, { stage: 'finished' }));
    if (operation !== 'rename-ended') {
      await world.reconcile();
      await world.publish(3, world.summary(undefined, { stage: operation === 'delete' ? 'discarded' : 'play' }));
    }
  }
  const attempts = rejectEndpoint(discord, operation);
  return { ...world, discord, attempts };
}

async function spendAutomaticAttempts(world: World) {
  for (let attempt = 0; attempt < 3; attempt += 1) {
    await world.reconcile();
    if (attempt < 2) {
      const row = (await world.channel())!;
      expect(row.next_attempt_at).toBeLessThan(Number.MAX_SAFE_INTEGER);
      vi.setSystemTime(Math.max(Date.now(), row.next_attempt_at));
    }
  }
}

async function administrator(world: World) {
  const person = await world.t.run((ctx) => playPerson(ctx, 'Moderator', { isAdmin: true }));
  return world.t.withIdentity({ subject: person.subject });
}

test.each(Object.keys(endpoints) as Operation[])(
  '%s stops after three attempts even when cron and stale scheduled actions run again',
  async (operation) => {
    const world = await operationWorld(operation);
    await spendAutomaticAttempts(world);
    expect(world.attempts).toHaveLength(3);
    expect(discordNeedsAttention((await world.channel())!)).toBe(true);

    for (let day = 0; day < 3; day += 1) {
      vi.setSystemTime(Date.now() + DISCORD_DAY);
      await world.t.mutation(internal.playDiscord.retryDue, {});
      await world.reconcile();
    }
    expect(world.attempts).toHaveLength(3);
  }
);

test.each(['play', 'finished', 'discarded'] as const)(
  'repeated %s directory activity and pause/resume do not rearm exhausted work',
  async (stage) => {
    const operation = stage === 'play' ? 'categories' : stage === 'finished' ? 'rename-ended' : 'delete';
    const world = await operationWorld(operation);
    await spendAutomaticAttempts(world);
    const exhausted = (await world.channel())!;
    expect(world.attempts).toHaveLength(3);

    await world.publish(10, world.summary(undefined, { stage, lastActivityAt: Date.now() + 1000 }));
    const settingsId = await world.t.run((ctx) =>
      ctx.db.insert('play_discord_settings', { enabled: false, updated_at: Date.now() })
    );
    await world.reconcile();
    expect(world.attempts).toHaveLength(3);
    await world.t.run((ctx) => ctx.db.patch(settingsId, { enabled: true }));
    await world.t.mutation(internal.playDiscord.retryDue, {});
    await world.reconcile();
    const after = (await world.channel())!;
    expect(after.work_revision).toBe(exhausted.work_revision);
    expect(discordNeedsAttention(after)).toBe(true);
    expect(world.attempts).toHaveLength(3);
  }
);

test('a genuine continue and later finish receive fresh rename budgets', async () => {
  const world = await operationWorld('rename-ended');
  await spendAutomaticAttempts(world);
  const first = (await world.channel())!;

  await world.publish(3, world.summary(undefined, { stage: 'play' }));
  await world.reconcile();
  await world.publish(4, world.summary(undefined, { stage: 'finished' }));
  await spendAutomaticAttempts(world);
  const second = (await world.channel())!;
  expect(second.work_revision).toBeGreaterThan(first.work_revision ?? 0);
  expect(second.next_attempt_at).toBe(Number.MAX_SAFE_INTEGER);
  expect(world.attempts).toHaveLength(6);
  expect(second.channel_id).toBe(first.channel_id);
  expect(second.creation_attempt).toBe(first.creation_attempt);
});

test.each(['invite', 'rename-active'] as const)(
  'inactivity retires exhausted %s work once and never rearms exhausted deletion',
  async (operation) => {
    const world = await operationWorld(operation);
    await spendAutomaticAttempts(world);
    const parked = (await world.channel())!;
    expect(discordNeedsAttention(parked)).toBe(true);
    expect(parked.next_attempt_at).toBe(parked.cleanup_at);
    const deletions = rejectEndpoint(world.discord, 'delete');

    vi.setSystemTime(Date.now() + DISCORD_DAY);
    await world.publish(10, world.summary());
    const active = (await world.channel())!;
    expect(active.work_revision).toBe(parked.work_revision);
    expect(active.cleanup_at).toBeGreaterThan(parked.cleanup_at);
    expect(discordNeedsAttention(active)).toBe(true);

    vi.setSystemTime(parked.cleanup_at);
    await world.t.mutation(internal.playDiscord.retryDue, {});
    await world.reconcile();
    vi.setSystemTime(active.cleanup_at - 1);
    await world.reconcile();
    expect(world.attempts).toHaveLength(3);
    expect(deletions).toHaveLength(0);

    vi.setSystemTime(active.cleanup_at);
    await world.t.mutation(internal.playDiscord.retryDue, {});
    await spendAutomaticAttempts(world);
    const retired = (await world.channel())!;
    expect(world.attempts).toHaveLength(3);
    expect(deletions).toHaveLength(3);
    expect(retired.state).toBe('deleting');
    expect(retired.next_attempt_at).toBe(Number.MAX_SAFE_INTEGER);
    expect(retired.retry).toMatchObject({ kind: 'bounded', operation: 'delete', attempts: 3, needsAttention: true });
    expect(retired.channel_id).toBe(parked.channel_id);

    for (let day = 0; day < 2; day += 1) {
      vi.setSystemTime(Date.now() + 14 * DISCORD_DAY);
      await world.publish(11 + day, world.summary());
      await world.t.mutation(internal.playDiscord.retryDue, {});
      await world.reconcile();
    }
    expect(deletions).toHaveLength(3);
    expect(world.attempts).toHaveLength(3);
    expect((await world.channel())!.next_attempt_at).toBe(Number.MAX_SAFE_INTEGER);
  }
);

test('explicit Retry gives the saved channel one fresh invite budget without changing its identity', async () => {
  const world = await operationWorld('invite');
  await spendAutomaticAttempts(world);
  const before = (await world.channel())!;
  const admin = await administrator(world);

  await admin.mutation(api.playDiscordAdmin.requestRetry, { channelId: before._id });
  await spendAutomaticAttempts(world);
  const after = (await world.channel())!;
  expect(world.attempts).toHaveLength(6);
  expect(discordNeedsAttention(after)).toBe(true);
  expect(after._id).toBe(before._id);
  expect(after.channel_id).toBe(before.channel_id);
  expect(after.creation_marker).toBe(before.creation_marker);
  expect(after.creation_category_id).toBe(before.creation_category_id);
  expect(after.creation_attempt).toBe(before.creation_attempt);
  expect(after.guild_id).toBe(before.guild_id);
  expect(after.category_ids).toEqual(before.category_ids);
  expect(
    world.discord.calls.filter((call) => call.method === 'POST' && call.path === '/guilds/100/channels')
  ).toHaveLength(1);
});

test('repeated hourly empty observations cannot rearm exhausted channel deletion', async () => {
  const discord = discordStub();
  const world = await voiceWorld();
  await world.reconcile();
  await world.publish(2, world.summary(undefined, { stage: 'finished' }));
  await world.reconcile();
  const channels = await world.t.run(voiceCandidates);
  expect(channels).toHaveLength(1);
  const attempts = rejectEndpoint(discord, 'delete');
  await world.t.mutation(internal.playDiscordVoice.reportEmpty, { channels, observedAt: Date.now() });
  await spendAutomaticAttempts(world);
  const exhausted = (await world.channel())!;
  expect(attempts).toHaveLength(3);

  for (let hour = 0; hour < 3; hour += 1) {
    vi.setSystemTime(Date.now() + 3_600_000);
    await world.t.mutation(internal.playDiscordVoice.reportEmpty, { channels, observedAt: Date.now() });
    await world.publish(3 + hour, world.summary(undefined, { stage: 'finished' }));
    await world.t.mutation(internal.playDiscordVoice.checkDue, {});
    await world.t.mutation(internal.playDiscord.retryDue, {});
    await world.reconcile();
  }
  const after = (await world.channel())!;
  expect(after.work_revision).toBe(exhausted.work_revision);
  expect(after.next_attempt_at).toBe(Number.MAX_SAFE_INTEGER);
  expect(attempts).toHaveLength(3);
});

test.each(['global', 'scoped'] as const)(
  'an existing %s provider hold preserves the full attempt budget until its deadline',
  async (scope) => {
    const world = await operationWorld('categories');
    const until = Date.now() + 60_000;
    await world.t.mutation(internal.playDiscordRateLimits.observe, {
      route: 'guildChannels.read',
      major: 'guild:100',
      limit: { until, global: scope === 'global' },
    });
    await world.reconcile();
    vi.setSystemTime(until - 1);
    await world.t.mutation(internal.playDiscord.retryDue, {});
    await world.reconcile();
    expect(world.attempts).toHaveLength(0);

    vi.setSystemTime(until);
    await spendAutomaticAttempts(world);
    expect(world.attempts).toHaveLength(3);
    expect(discordNeedsAttention((await world.channel())!)).toBe(true);
  }
);

test('three crashed owners exhaust work and their stale releases cannot restore another retry', async () => {
  const discord = discordStub();
  const world = await voiceWorld();
  const channelId = (await world.channel())!._id;
  const claims: Array<{ channelId: typeof channelId; lease: string }> = [];
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    const row = (await world.t.mutation(internal.playDiscord.claim, { channelId }))!;
    expect(row.lease).toEqual(expect.any(String));
    expect(row.retry).toMatchObject({ kind: 'bounded', operation: 'provision', attempts: attempt });
    claims.push({ channelId, lease: row.lease! });
    vi.setSystemTime(row.lease_until! + 1);
  }
  expect(await world.t.mutation(internal.playDiscord.claim, { channelId })).toBeNull();
  const exhausted = (await world.channel())!;
  expect(discordNeedsAttention(exhausted)).toBe(true);
  expect(exhausted.retry).toMatchObject({ kind: 'bounded', attempts: 3, needsAttention: true });

  for (const claim of claims) {
    await world.t.mutation(internal.playDiscord.release, {
      ...claim,
      error: 'An expired worker failed after its successor.',
      retryAfterMs: 1000,
      retryOperation: 'categories',
    });
  }
  expect(await world.channel()).toEqual(exhausted);
  await world.t.mutation(internal.playDiscord.retryDue, {});
  await world.reconcile();
  expect(discord.calls).toEqual([]);
});

test('a stale lease cannot exhaust rename attempts after a game continues and finishes again', async () => {
  const world = await operationWorld('rename-ended');
  for (let attempt = 0; attempt < 2; attempt += 1) {
    await world.reconcile();
    vi.setSystemTime((await world.channel())!.next_attempt_at);
  }
  const row = (await world.channel())!;
  const owner = (await world.t.mutation(internal.playDiscord.claim, { channelId: row._id }))!;
  expect(owner.retry).toMatchObject({ kind: 'bounded', operation: 'rename-ended', attempts: 3 });

  await world.publish(3, world.summary(undefined, { stage: 'play' }));
  await world.publish(4, world.summary(undefined, { stage: 'finished' }));
  await world.t.mutation(internal.playDiscord.release, {
    channelId: row._id,
    lease: owner.lease!,
    error: 'The previous finish rename failed.',
    retryOperation: 'rename-ended',
  });
  await spendAutomaticAttempts(world);
  expect(world.attempts).toHaveLength(5);
  expect((await world.channel())!.next_attempt_at).toBe(Number.MAX_SAFE_INTEGER);
});

test('negative recovery parks without replacement, then explicit Retry adopts a later exact marker', async () => {
  const discord = discordStub();
  const world = await voiceWorld();
  const remote = lostCreationRemote(world, discord);

  await world.reconcile();
  vi.setSystemTime((await world.channel())!.next_attempt_at);
  await world.reconcile();
  const parked = (await world.channel())!;
  expect(parked.state).toBe('creating');
  expect(parked.channel_id).toBeUndefined();
  expect(discordNeedsAttention(parked)).toBe(true);
  expect(remote.creates).toBe(1);
  expect(remote.listings).toBe(2);

  vi.setSystemTime(Date.now() + DISCORD_DAY);
  await world.t.mutation(internal.playDiscord.retryDue, {});
  await world.reconcile();
  expect(remote.listings).toBe(2);
  expect(remote.creates).toBe(1);

  const admin = await administrator(world);
  await admin.mutation(api.playDiscordAdmin.requestRetry, { channelId: parked._id });
  await world.reconcile();
  expect(discordNeedsAttention((await world.channel())!)).toBe(true);
  expect(remote.creates).toBe(1);
  expect(remote.listings).toBe(3);

  remote.visible = true;
  await admin.mutation(api.playDiscordAdmin.requestRetry, { channelId: parked._id });
  await world.reconcile();
  expect(await world.channel()).toMatchObject({ state: 'ready', channel_id: '300', creation_attempt: 1 });
  expect(remote.creates).toBe(1);
  expect(remote.listings).toBe(4);
  expect(discord.calls.filter((call) => call.path === '/channels/300/invites')).toHaveLength(1);
});
