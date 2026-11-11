/* @vitest-environment edge-runtime */

import { afterEach, beforeEach, expect, test, vi } from 'vite-plus/test';

import { internal } from './_generated/api';
import { DISCORD_DAY, requestDiscordDeletion } from './lib/playDiscord';
import { configureDiscord, discordStub, voiceWorld } from './playDiscord.test.fixture';

/* Cold handler and component imports need headroom on a busy runner. */
vi.setConfig({ testTimeout: 30_000 });

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

test('discard deletes an existing voice room immediately', async () => {
  const discord = discordStub();
  const world = await voiceWorld();
  await world.reconcile();
  await world.publish(2, world.summary(undefined, { stage: 'discarded' }));
  await world.reconcile();

  expect(await world.menu()).toMatchObject({ voice: null });
  const deletions = discord.calls.filter((call) => call.path === '/channels/300' && call.method === 'DELETE');
  expect(deletions).toHaveLength(1);
  expect(new Headers(deletions[0]?.headers).get('X-Audit-Log-Reason')).toContain('Dune%20Play');
  expect(await world.channel()).toMatchObject({ state: 'deleted' });
});

test('a deletion request during creation saves its returned ID even when the first DELETE fails', async () => {
  const discord = discordStub();
  const world = await voiceWorld();
  const normal = discord.fetch.getMockImplementation()!;
  let deletions = 0;
  discord.fetch.mockImplementation(async (input, options) => {
    if (options?.method === 'DELETE' && deletions++ === 0) {
      return Response.json({}, { status: 503 });
    }
    const response = await normal(input, options);
    if (input === 'https://discord.com/api/v10/guilds/100/channels' && options?.method === 'POST') {
      const channel = (await world.channel())!;
      await world.t.run((ctx) => requestDiscordDeletion(ctx, channel));
    }
    return response;
  });
  await world.reconcile();
  expect(await world.channel()).toMatchObject({ state: 'deleting', channel_id: '300' });
  await world.reconcile();
  expect(await world.channel()).toMatchObject({ state: 'deleted', channel_id: '300' });
  expect(deletions).toBe(2);
  expect(discord.calls.filter((call) => call.path === '/guilds/100/channels' && call.method === 'POST')).toHaveLength(
    1
  );
});

test('finished games rename once and retain an occupied room', async () => {
  const discord = discordStub();
  const world = await voiceWorld();
  await world.reconcile();
  const ended = Date.now();
  await world.publish(2, world.summary(undefined, { stage: 'finished' }));
  await world.reconcile();

  expect(discord.calls.filter((call) => call.method === 'PATCH')).toEqual([
    expect.objectContaining({ path: '/channels/300', body: { name: 'Quiet Sietch (ended)' } }),
  ]);
  expect(await world.menu()).toMatchObject({ voice: null });

  /* The observer has not reported empty; neither age nor another finished summary may delete the room. */
  for (const elapsed of [DISCORD_DAY, 15 * DISCORD_DAY]) {
    vi.setSystemTime(ended + elapsed);
    await world.reconcile();
  }
  await world.publish(3, world.summary(undefined, { stage: 'finished' }));
  await world.reconcile();
  expect(await world.channel()).toMatchObject({ state: 'ready', renamed_ended: true });
  expect(discord.calls.filter((call) => call.method === 'DELETE')).toEqual([]);
  expect(discord.calls.filter((call) => call.method === 'PATCH')).toHaveLength(1);
});

test.each(['finished', 'discarded'] as const)('%s before creation does not allocate a Discord room', async (stage) => {
  const discord = discordStub();
  const world = await voiceWorld();
  await world.publish(2, world.summary(undefined, { stage }));
  await world.reconcile();

  expect(discord.calls).toEqual([]);
  expect(await world.channel()).toMatchObject({ state: 'deleted' });
});

test.each(['creation', 'invite'] as const)(
  'discard during %s deletes the returned channel without leaving an invite',
  async (step) => {
    const discord = discordStub();
    const world = await voiceWorld();
    const normal = discord.fetch.getMockImplementation()!;
    const heldPath = step === 'creation' ? '/guilds/100/channels' : '/channels/300/invites';
    discord.fetch.mockImplementation(async (input, options) => {
      const response = await normal(input, options);
      if (input === `https://discord.com/api/v10${heldPath}` && options?.method === 'POST') {
        await world.publish(2, world.summary(undefined, { stage: 'discarded' }));
      }
      return response;
    });
    await world.reconcile();

    expect(discord.calls.filter((call) => call.path === '/guilds/100/channels' && call.method === 'POST')).toHaveLength(
      1
    );
    expect(discord.calls.filter((call) => call.path === '/channels/300/invites')).toHaveLength(
      step === 'creation' ? 0 : 1
    );
    expect(discord.calls.filter((call) => call.method === 'DELETE')).toHaveLength(1);
    expect(await world.channel()).toMatchObject({ state: 'deleted' });
    expect((await world.channel())?.invite_url).toBeUndefined();
  }
);

test('continue during the ended-name PATCH restores the name before the hourly check', async () => {
  const discord = discordStub();
  const world = await voiceWorld();
  await world.reconcile();
  await world.publish(2, world.summary(undefined, { stage: 'finished' }));
  const normal = discord.fetch.getMockImplementation()!;
  let continued = false;
  discord.fetch.mockImplementation(async (input, options) => {
    const response = await normal(input, options);
    if (options?.method === 'PATCH' && !continued) {
      continued = true;
      await world.publish(3, world.summary(undefined, { stage: 'play' }));
    }
    return response;
  });
  await world.reconcile();

  expect(discord.calls.filter((call) => call.method === 'PATCH').map((call) => call.body)).toEqual([
    { name: 'Quiet Sietch (ended)' },
    { name: 'Quiet Sietch' },
  ]);
  expect(discord.calls.filter((call) => call.method === 'DELETE')).toEqual([]);
  expect(await world.channel()).toMatchObject({ state: 'ready', renamed_ended: false });
  expect(await world.menu()).toMatchObject({ voice: { url: 'https://discord.gg/shared-room' } });
});

test.each([
  { status: 403, delay: 0 },
  { status: 429, delay: 60_000 },
])('discard during invite refusal $status waits only for a required Discord rate limit', async ({ status, delay }) => {
  const discord = discordStub();
  const world = await voiceWorld();
  const normal = discord.fetch.getMockImplementation()!;
  discord.fetch.mockImplementation(async (input, options) => {
    if (input === 'https://discord.com/api/v10/channels/300/invites') {
      await world.publish(2, world.summary(undefined, { stage: 'discarded' }));
      return Response.json({ code: 50_013, retry_after: delay / 1000 }, { status });
    }
    return await normal(input, options);
  });
  await world.reconcile();
  expect((await world.channel())!.next_attempt_at).toBe(Date.now() + delay);
  if (delay > 0) {
    await world.reconcile();
    expect(discord.calls.filter((call) => call.method === 'DELETE')).toEqual([]);
    vi.setSystemTime(Date.now() + delay);
  }
  await world.reconcile();
  expect(discord.calls.filter((call) => call.method === 'DELETE')).toHaveLength(1);
  expect(await world.channel()).toMatchObject({ state: 'deleted' });
});

test('a finish arriving under a held lease remains due when that owner releases it', async () => {
  const discord = discordStub();
  const world = await voiceWorld();
  await world.reconcile();
  const row = (await world.channel())!;
  const claim = (await world.t.mutation(internal.playDiscord.claim, { channelId: row._id }))!;
  await world.publish(2, world.summary(undefined, { stage: 'finished' }));
  await world.reconcile();
  await world.t.mutation(internal.playDiscord.release, { channelId: row._id, lease: claim.lease! });

  expect((await world.channel())!.next_attempt_at).toBeLessThanOrEqual(Date.now());
  await world.reconcile();
  expect(discord.calls.filter((call) => call.method === 'PATCH')).toHaveLength(1);
});

test.each([10_003, 10_004])(
  'rename 404 code %s distinguishes a removed channel from a retryable failure',
  async (code) => {
    const discord = discordStub();
    const world = await voiceWorld();
    await world.reconcile();
    await world.publish(2, world.summary(undefined, { stage: 'finished' }));
    const normal = discord.fetch.getMockImplementation()!;
    discord.fetch.mockImplementation(async (input, options) =>
      options?.method === 'PATCH' ? Response.json({ code }, { status: 404 }) : await normal(input, options)
    );
    await world.reconcile();

    expect(await world.channel()).toMatchObject({ state: code === 10_003 ? 'deleted' : 'ready' });
    expect(discord.calls.filter((call) => call.method === 'DELETE')).toEqual([]);
    if (code !== 10_003) {
      expect((await world.channel())?.error).toBe('Discord request failed (404).');
    }
  }
);

test('a rate-limited rename waits before becoming eligible for the hourly check', async () => {
  const discord = discordStub();
  const world = await voiceWorld();
  await world.reconcile();
  await world.publish(2, world.summary(undefined, { stage: 'finished' }));
  const normal = discord.fetch.getMockImplementation()!;
  let patches = 0;
  discord.fetch.mockImplementation(async (input, options) => {
    if (options?.method === 'PATCH' && ++patches === 1) {
      return Response.json({ retry_after: 60 }, { status: 429 });
    }
    return await normal(input, options);
  });
  await world.reconcile();
  await world.reconcile();
  expect(patches).toBe(1);
  expect((await world.channel())?.renamed_ended).not.toBe(true);
  vi.setSystemTime(Date.now() + 60_000);
  await world.reconcile();
  expect(patches).toBe(2);
  expect((await world.channel())?.renamed_ended).toBe(true);
});

test('new activity before retirement preserves the room; committed retirement cannot be revived', async () => {
  discordStub();
  const world = await voiceWorld();
  await world.reconcile();
  vi.setSystemTime(Date.now() + 14 * DISCORD_DAY);
  const row = (await world.channel())!;
  const claim = (await world.t.mutation(internal.playDiscord.claim, { channelId: row._id }))!;
  const args = { channelId: row._id, lease: claim.lease! };
  expect(await world.t.mutation(internal.playDiscord.work, args)).toMatchObject({ remove: true });
  await world.publish(2, world.summary());
  expect(await world.t.mutation(internal.playDiscord.beginDeletion, args)).toBe(false);
  await world.t.mutation(internal.playDiscord.release, args);
  vi.setSystemTime(Date.now() + 14 * DISCORD_DAY);
  const next = (await world.t.mutation(internal.playDiscord.claim, { channelId: row._id }))!;
  const second = { channelId: row._id, lease: next.lease! };
  expect(await world.t.mutation(internal.playDiscord.beginDeletion, second)).toBe(true);
  await world.publish(3, world.summary());
  await world.t.mutation(internal.playDiscord.release, second);
  await world.reconcile();
  expect(await world.channel()).toMatchObject({ state: 'deleted' });
});

test('a missing Discord channel counts as deleted, but a different 404 remains retryable', async () => {
  const discord = discordStub();
  const normal = discord.fetch.getMockImplementation()!;
  let code = 10_004;
  discord.fetch.mockImplementation(async (input, options) => {
    if (options?.method === 'DELETE') {
      return Response.json({ code }, { status: 404 });
    }
    return await normal(input, options);
  });
  const world = await voiceWorld();
  await world.reconcile();
  vi.setSystemTime(Date.now() + 14 * DISCORD_DAY);
  await world.reconcile();
  expect(await world.channel()).toMatchObject({ state: 'deleting' });
  code = 10_003;
  await world.reconcile();
  expect(await world.channel()).toMatchObject({ state: 'deleted' });
});

test('a pending room keeps its recorded guild when deployment configuration changes', async () => {
  const discord = discordStub();
  const world = await voiceWorld();
  vi.stubEnv('DISCORD_GUILD_ID', '101');
  await world.reconcile();
  expect(discord.calls.find((call) => call.method === 'POST')).toMatchObject({ path: '/guilds/100/channels' });
  expect(await world.channel()).toMatchObject({ guild_id: '100', state: 'ready' });
  expect(await world.menu()).toMatchObject({ voice: { url: 'https://discord.gg/shared-room' } });
});
