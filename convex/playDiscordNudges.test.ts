// @vitest-environment edge-runtime
import { afterEach, beforeEach, expect, test, vi } from 'vite-plus/test';

import { api } from './_generated/api';
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
  expect(await world.publishNudge({ directorySequence: 3 })).toEqual({ ok: true });
  expect(world.fetch).toHaveBeenCalledTimes(1);
  const [url, options] = world.fetch.mock.calls[0];
  expect(url).toBe('https://discord.com/api/v10/channels/300/messages');
  expect(JSON.parse(String(options?.body))).toEqual({
    content: '<@123456789> Atreides \\<@&777\\> \\[go\\](url) @here is waiting on you in Quiet Sietch.',
    allowed_mentions: { parse: [], users: ['123456789'], replied_user: false },
  });
  expect(await world.rows()).toEqual([]);
});

test('the single target-seat cooldown lasts five minutes across different senders', async () => {
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
    world.t.action(api.playDiscordNudges.publishNudge, { ...world.request(), text: 'secret chat' } as never)
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

test('a directory behind or ahead of the matched seats drops the nudge without spending cooldown', async () => {
  const world = await nudgeWorld();
  await world.publishNudge({ directorySequence: 3 });
  await world.publishNudge({ directorySequence: 1 });
  expect(world.fetch).not.toHaveBeenCalled();
  await world.publishNudge();
  expect(world.fetch).toHaveBeenCalledTimes(1);
});
