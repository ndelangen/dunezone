/* @vitest-environment edge-runtime */

import { afterEach, beforeEach, expect, test, vi } from 'vite-plus/test';

import { api, internal } from './_generated/api';
import { DISCORD_LEASE, DISCORD_RETRY } from './lib/playDiscord';
import { playPerson } from './play.test.fixture';
import { configureDiscord, discordStub, voiceWorld } from './playDiscord.test.fixture';

beforeEach(() => {
  vi.useFakeTimers();
  configureDiscord();
});
afterEach(() => {
  vi.clearAllTimers();
  vi.useRealTimers();
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

async function setup() {
  const world = await voiceWorld();
  const admin = await world.t.run((ctx) => playPerson(ctx, 'Moderator', { isAdmin: true }));
  return { ...world, admin: world.t.withIdentity({ subject: admin.subject }) };
}

test.each(['pending', 'creating'] as const)(
  'admin retry preserves %s state and the current lease and global deadline',
  async (state) => {
    const world = await setup();
    const discord = discordStub();
    const row = (await world.channel())!;
    const at = Date.now() + DISCORD_LEASE + DISCORD_RETRY;
    await world.t.run(async (ctx) => {
      await ctx.db.patch(row._id, { state, lease: 'current-owner', lease_until: Date.now() + DISCORD_LEASE });
    });
    await world.t.mutation(internal.playDiscord.holdRequests, { until: at });
    const before = await world.channel();
    const jobsBefore = await world.t.run((ctx) => ctx.db.system.query('_scheduled_functions').take(100));
    await expect(world.player.mutation(api.playDiscordAdmin.requestRetry, { channelId: row._id })).rejects.toThrow();
    await world.admin.mutation(api.playDiscordAdmin.requestRetry, { channelId: row._id });
    expect(await world.channel()).toMatchObject({
      state,
      lease: before!.lease,
      lease_until: before!.lease_until,
      next_attempt_at: at,
      work_revision: (before!.work_revision ?? 0) + 1,
    });
    const jobs = await world.t.run((ctx) => ctx.db.system.query('_scheduled_functions').take(100));
    const added = jobs.filter((job) => !jobsBefore.some((before) => before._id === job._id));
    expect(added).toHaveLength(1);
    expect(added[0]).toMatchObject({ name: 'playDiscordActions:reconcile', scheduledTime: at });
    expect(discord.fetch).not.toHaveBeenCalled();
  }
);

test('admin retry respects an existing provider deadline when re-arming work', async () => {
  const world = await setup();
  const row = (await world.channel())!;
  const deadline = Date.now() + 60_000;
  await world.t.run((ctx) =>
    ctx.db.patch(row._id, {
      retry_after: deadline,
      retry: { kind: 'backoff', revision: row.work_revision ?? 0, until: deadline },
    })
  );
  await world.admin.mutation(api.playDiscordAdmin.requestRetry, { channelId: row._id });
  const updated = (await world.channel())!;
  expect(updated.retry_after).toBe(deadline);
  expect(updated.next_attempt_at).toBeGreaterThanOrEqual(deadline);
  const jobs = await world.t.run((ctx) => ctx.db.system.query('_scheduled_functions').take(100));
  expect(jobs).toContainEqual(
    expect.objectContaining({ name: 'playDiscordActions:reconcile', scheduledTime: updated.next_attempt_at })
  );
});

test('admin retry refuses paused work and completed channel states', async () => {
  const world = await setup();
  const row = (await world.channel())!;
  await world.admin.mutation(api.playDiscordAdmin.setEnabled, { enabled: false });
  await expect(world.admin.mutation(api.playDiscordAdmin.requestRetry, { channelId: row._id })).rejects.toThrow(
    'Enable Discord'
  );
  await world.admin.mutation(api.playDiscordAdmin.setEnabled, { enabled: true });
  await world.t.run((ctx) => ctx.db.patch(row._id, { state: 'deleted' }));
  await expect(world.admin.mutation(api.playDiscordAdmin.requestRetry, { channelId: row._id })).rejects.toThrow(
    'no longer tracked'
  );
});

test('cleanup status distinguishes finished setup, failed rename, hourly readiness and pause without changing eligibility', async () => {
  const world = await setup();
  const row = (await world.channel())!;
  const page = () =>
    world.admin.query(api.playDiscordAdmin.dashboard, { paginationOpts: { numItems: 10, cursor: null } });
  expect((await page()).channels.page[0]).toMatchObject({
    cleanup_status: 'scheduled',
    next_attempt_at: row.next_attempt_at,
  });
  await world.publish(2, world.summary(undefined, { stage: 'finished' }));
  expect((await page()).channels.page[0]).toMatchObject({ cleanup_status: 'awaiting_setup', waiting_for_empty: false });
  await world.t.run((ctx) =>
    ctx.db.patch(row._id, {
      state: 'ready',
      channel_id: '300',
      renamed_ended: false,
      error: 'Discord request failed (403).',
    })
  );
  expect((await page()).channels.page[0]).toMatchObject({
    cleanup_status: 'awaiting_rename',
    waiting_for_empty: false,
    error: 'Discord request failed (403).',
  });
  await world.admin.mutation(api.playDiscordAdmin.setEnabled, { enabled: false });
  expect(await page()).toMatchObject({
    enabled: false,
    channels: { page: [{ cleanup_status: 'awaiting_rename', waiting_for_empty: false }] },
  });
  await world.t.run((ctx) => ctx.db.patch(row._id, { renamed_ended: true }));
  expect((await page()).channels.page[0]).toMatchObject({
    cleanup_status: 'waiting_for_empty',
    waiting_for_empty: true,
  });
  for (const state of ['deleting', 'deleted'] as const) {
    await world.t.run((ctx) => ctx.db.patch(row._id, { state }));
    expect((await page()).channels.page[0]).toMatchObject({ cleanup_status: state, waiting_for_empty: false });
  }
});

test('full categories report a specific sanitized error and leave later retry scheduled', async () => {
  const world = await setup();
  const discord = discordStub();
  const normal = discord.fetch.getMockImplementation()!;
  const log = vi.spyOn(console, 'error').mockImplementation(() => undefined);
  discord.fetch.mockResolvedValue(
    Response.json([
      { id: '200', type: 4 },
      { id: '201', type: 4 },
      ...Array.from({ length: 100 }, (_, i) => ({ id: String(1000 + i), type: 2, parent_id: i < 50 ? '200' : '201' })),
    ])
  );
  await world.reconcile();
  expect(await world.channel()).toMatchObject({
    state: 'pending',
    error: 'No configured Discord category has room for another voice channel.',
    next_attempt_at: Date.now() + DISCORD_RETRY,
  });
  expect(log).toHaveBeenCalledWith('Discord channel work failed.', { kind: 'no-room' });
  expect(
    (await world.admin.query(api.playDiscordAdmin.dashboard, { paginationOpts: { numItems: 10, cursor: null } }))
      .channels.page[0]?.error
  ).toBe('No configured Discord category has room for another voice channel.');
  discord.fetch.mockImplementation(normal);
  vi.setSystemTime(Date.now() + DISCORD_RETRY);
  await world.t.mutation(internal.playDiscord.retryDue, {});
  await world.reconcile();
  expect(await world.channel()).toMatchObject({ state: 'ready', channel_id: '300' });
});

test('an invalid channel listing records a specific diagnostic without response contents', async () => {
  const world = await setup();
  const discord = discordStub();
  const log = vi.spyOn(console, 'error').mockImplementation(() => undefined);
  discord.fetch.mockResolvedValue(Response.json({ privateContent: 'must-not-reach-diagnostics' }));
  await world.reconcile();
  expect(await world.channel()).toMatchObject({
    state: 'pending',
    error: 'Discord returned an invalid channel response. Retry is scheduled.',
  });
  expect(log).toHaveBeenCalledWith('Discord channel work failed.', { kind: 'invalid-response' });
  expect(JSON.stringify(log.mock.calls)).not.toContain('must-not-reach-diagnostics');
});

test('a shared invite hold cannot postpone deletion of the same channel', async () => {
  const world = await setup();
  const discord = discordStub();
  const normal = discord.fetch.getMockImplementation()!;
  discord.fetch.mockImplementation((input, options) =>
    input === 'https://discord.com/api/v10/channels/300/invites'
      ? Promise.resolve(
          Response.json(
            { retry_after: 60 },
            { status: 429, headers: { 'X-RateLimit-Scope': 'shared', 'X-RateLimit-Bucket': 'invites' } }
          )
        )
      : normal(input, options)
  );
  await world.reconcile();
  expect(await world.channel()).toMatchObject({ state: 'pending', channel_id: '300' });
  await world.publish(2, world.summary(undefined, { stage: 'discarded' }));
  await world.reconcile();
  expect(await world.channel()).toMatchObject({ state: 'deleted' });
  expect(discord.calls.filter((call) => call.method === 'DELETE')).toHaveLength(1);
});

test.each([
  { state: 'ready', operation: 'rename-ended', channelId: '300' },
  { state: 'ready', operation: 'rename-active', channelId: '300' },
  { state: 'deleting', operation: 'delete', channelId: '300' },
  { state: 'creating', operation: 'provision', channelId: undefined },
] as const)(
  'admin re-arms exhausted $operation work without changing channel identity',
  async ({ state, operation, channelId }) => {
    const world = await setup();
    const row = (await world.channel())!;
    const discord = discordStub();
    await world.t.run((ctx) =>
      ctx.db.patch(row._id, {
        state,
        channel_id: channelId,
        creation_marker: `dune-play-${row.game_id}`,
        creation_category_id: '200',
        work_revision: 7,
        next_attempt_at: Number.MAX_SAFE_INTEGER,
        retry: { kind: 'bounded', operation, revision: 7, attempts: 3, needsAttention: true },
      })
    );
    const page = () =>
      world.admin.query(api.playDiscordAdmin.dashboard, { paginationOpts: { numItems: 10, cursor: null } });
    expect((await page()).channels.page[0]).toMatchObject({ needs_attention: true });
    await expect(world.player.mutation(api.playDiscordAdmin.requestRetry, { channelId: row._id })).rejects.toThrow();
    await world.admin.mutation(api.playDiscordAdmin.requestRetry, { channelId: row._id });
    const result = (await world.channel())!;
    expect(result).toMatchObject({
      state,
      creation_marker: `dune-play-${row.game_id}`,
      creation_category_id: '200',
    });
    expect(result.channel_id).toBe(channelId);
    expect((await page()).channels.page[0]).toMatchObject({ needs_attention: false });
    expect(result.next_attempt_at).toBeLessThan(Number.MAX_SAFE_INTEGER);
    expect(discord.fetch).not.toHaveBeenCalled();
  }
);
