/* @vitest-environment edge-runtime */

import { afterEach, beforeEach, expect, test, vi } from 'vite-plus/test';

import { internal } from './_generated/api';
import { DISCORD_DAY } from './lib/playDiscord';
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

test.each(['finished', 'discarded'] as const)(
  '%s games keep their room for 24 hours without extending the deadline',
  async (stage) => {
    const discord = discordStub();
    const world = await voiceWorld();
    await world.reconcile();
    const ended = Date.now();
    await world.publish(2, world.summary(undefined, { stage }));
    await world.reconcile();
    expect(await world.menu()).toMatchObject({ voice: null });
    expect(discord.calls.filter((call) => call.method === 'DELETE')).toHaveLength(0);
    vi.setSystemTime(ended + DISCORD_DAY - 1);
    await world.publish(3, world.summary(undefined, { stage }));
    await world.reconcile();
    expect(await world.channel()).toMatchObject({ state: 'ready', ended_at: ended, cleanup_at: ended + DISCORD_DAY });
    vi.setSystemTime(ended + DISCORD_DAY);
    await world.reconcile();
    const deletions = discord.calls.filter((call) => call.path === '/channels/300' && call.method === 'DELETE');
    expect(deletions).toHaveLength(1);
    expect(new Headers(deletions[0]?.headers).get('X-Audit-Log-Reason')).toContain('Dune%20Play');
    expect(await world.channel()).toMatchObject({ state: 'deleted' });
  }
);

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
