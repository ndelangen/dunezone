/* @vitest-environment edge-runtime */

import { afterEach, beforeEach, expect, test, vi } from 'vite-plus/test';

import { api, internal } from './_generated/api';
import { DiscordRest } from './lib/discordRest';
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
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

test.each([
  'unlinked',
  'relinked',
  'deleted',
  'off',
  'unopted',
  'finished',
  'channel-expired',
  'nudge-expired',
] as const)('delivery rechecks a recipient or game that became %s while queued', async (change) => {
  const world = await nudgeWorld();
  await world.publishNudge();
  await world.t.run(async (ctx) => {
    if (change === 'unlinked' || change === 'relinked') {
      await ctx.db.delete(world.authAccountId);
      if (change === 'relinked') {
        await ctx.db.insert('authAccounts', {
          userId: world.identity.userId,
          provider: 'discord',
          providerAccountId: '123456789',
        });
      }
    } else if (change === 'deleted') {
      await ctx.db.patch(world.identity.userId, { account_state: 'deleted' });
    } else if (change === 'off') {
      await ctx.db.insert('play_discord_settings', { enabled: false, updated_at: Date.now() });
    } else if (change === 'unopted') {
      await ctx.db.patch(world.gameId, { discord_voice: false });
    } else if (change === 'finished') {
      await ctx.db.patch(world.gameId, { directory_stage: 'finished' });
    } else if (change === 'channel-expired') {
      const channel = await ctx.db.query('play_game_discord_channels').first();
      await ctx.db.patch(channel!._id, { cleanup_at: Date.now() });
    }
  });
  if (change === 'nudge-expired') {
    vi.setSystemTime(Date.now() + 120_000);
  }
  await world.deliver();
  expect(world.fetch).not.toHaveBeenCalled();
  expect((await world.rows())[0]).toMatchObject({ state: 'dropped' });
  expect((await world.rows())[0]).not.toHaveProperty('auth_account_id');
  expect((await world.rows())[0]).not.toHaveProperty('to_user_id');
});

test('the message uses fixed wording and permits only the intended user mention with hostile public names', async () => {
  const world = await nudgeWorld();
  await world.t.run((ctx) => ctx.db.patch(world.gameId, { name: 'Dune @everyone <@999>\n**Secret**' }));
  await world.publishNudge({ fromFactionName: 'Atreides <@&777>\n[go](https://example.com) @here' });
  await world.deliver();
  expect(world.fetch).toHaveBeenCalledTimes(1);
  const [url, options] = world.fetch.mock.calls[0]!;
  expect(url).toBe('https://discord.com/api/v10/channels/300/messages');
  expect(options!.method).toBe('POST');
  expect(JSON.parse(options!.body as string)).toEqual({
    content:
      '<@123456789> Atreides \\<@&777\\> \\[go\\](https://example.com) @here is waiting on you in Dune @everyone \\<@999\\> \\*\\*Secret\\*\\*.',
    allowed_mentions: { parse: [], users: ['123456789'], replied_user: false },
    nonce: expect.stringMatching(/^[a-f0-9]{24}$/),
    enforce_nonce: true,
  });
  const row = (await world.rows())[0]!;
  expect(row).toMatchObject({ state: 'sent', message_id: '987654321' });
  expect(row).not.toHaveProperty('to_user_id');
  expect(row).not.toHaveProperty('auth_account_id');
});

test('the public nudge endpoint rejects chat text rather than forwarding it', async () => {
  const world = await nudgeWorld();
  const extra = { ...world.request(), body: 'Do not publish this private chat message' };
  await expect(world.t.mutation(api.playDiscordNudges.publishNudge, extra)).rejects.toThrow();
  expect(world.fetch).not.toHaveBeenCalled();
  expect(await world.rows()).toEqual([]);
});

test.each(['timeout', '500', 'malformed-success'] as const)(
  '%s has an uncertain result and never retries the POST',
  async (failure) => {
    const world = await nudgeWorld();
    await world.publishNudge();
    if (failure === 'timeout') {
      world.fetch.mockRejectedValue(new DOMException('Request timed out', 'TimeoutError'));
    } else {
      world.fetch.mockResolvedValue(
        Response.json(failure === '500' ? { secret: 'response-must-stay-private' } : {}, {
          status: failure === '500' ? 500 : 200,
        })
      );
    }
    await world.deliver();
    await world.deliver();
    expect(world.fetch).toHaveBeenCalledTimes(1);
    expect((await world.rows())[0]).toMatchObject({ state: 'uncertain', attempts: 1 });
    expect(JSON.stringify(await world.rows())).not.toContain('response-must-stay-private');
  }
);

test('a definite permission refusal is terminal and stores only the safe status', async () => {
  const world = await nudgeWorld();
  await world.publishNudge();
  world.fetch.mockResolvedValue(
    Response.json({ message: 'response-must-stay-private', code: 50_013 }, { status: 403 })
  );
  await world.deliver();
  await world.deliver();
  expect(world.fetch).toHaveBeenCalledTimes(1);
  expect((await world.rows())[0]).toMatchObject({ state: 'failed', error: 'Discord request failed (403).' });
});

test('a crash after starting delivery cannot resend an event with an unknown outcome', async () => {
  const world = await nudgeWorld();
  await world.publishNudge();
  const args = await world.delivery();
  expect(await world.t.mutation(internal.playDiscordNudges.start, args)).not.toBeNull();
  await world.deliver();
  expect(world.fetch).not.toHaveBeenCalled();
  expect((await world.rows())[0]).toMatchObject({ state: 'sending', attempts: 1 });
});

test('pausing after delivery starts drops the known-unsent nudge before POST', async () => {
  const world = await nudgeWorld();
  await world.publishNudge();
  const nudge = DiscordRest.prototype.nudge;
  vi.spyOn(DiscordRest.prototype, 'nudge').mockImplementationOnce(async function (this: DiscordRest, ...args) {
    await world.t.run((ctx) => ctx.db.insert('play_discord_settings', { enabled: false, updated_at: Date.now() }));
    return await nudge.apply(this, args);
  });
  await world.deliver();
  expect(world.fetch).not.toHaveBeenCalled();
  const row = (await world.rows())[0]!;
  expect(row).toMatchObject({ state: 'dropped' });
  expect(row).not.toHaveProperty('error');
  expect(row).not.toHaveProperty('auth_account_id');
  expect(row).not.toHaveProperty('to_user_id');
});

test('a definite 429 schedules a retry at its deadline without an inline POST retry', async () => {
  const world = await nudgeWorld();
  await world.publishNudge();
  world.fetch.mockResolvedValueOnce(Response.json({ retry_after: 3 }, { status: 429 }));
  const now = Date.now();
  await world.deliver();
  expect(world.fetch).toHaveBeenCalledTimes(1);
  expect((await world.rows())[0]).toMatchObject({ state: 'pending', attempts: 1 });
  const scheduled = await world.t.run((ctx) => ctx.db.system.query('_scheduled_functions').collect());
  expect(
    scheduled.some((entry) => entry.scheduledTime === now + 3000 && entry.name.includes('playDiscordNudgeActions'))
  ).toBe(true);
  vi.setSystemTime(now + 3000);
  await world.deliver();
  expect(world.fetch).toHaveBeenCalledTimes(2);
  expect((await world.rows())[0]).toMatchObject({ state: 'sent', attempts: 2 });
  const first = JSON.parse(world.fetch.mock.calls[0]![1]!.body as string);
  const second = JSON.parse(world.fetch.mock.calls[1]![1]!.body as string);
  expect(second.nonce).toBe(first.nonce);
});

test('a 429 whose deadline reaches expiry is dropped', async () => {
  const world = await nudgeWorld();
  await world.publishNudge();
  world.fetch.mockResolvedValue(Response.json({ retry_after: 120 }, { status: 429 }));
  await world.deliver();
  await world.deliver();
  expect(world.fetch).toHaveBeenCalledTimes(1);
  expect((await world.rows())[0]).toMatchObject({ state: 'dropped', attempts: 1 });
});

test('repeated definite 429s have a finite attempt budget', async () => {
  const world = await nudgeWorld();
  await world.publishNudge();
  world.fetch.mockImplementation(async () => Response.json({ retry_after: 1 }, { status: 429 }));
  for (let attempt = 0; attempt < 5; attempt += 1) {
    await world.deliver();
    vi.setSystemTime(Date.now() + 1000);
  }
  expect(world.fetch).toHaveBeenCalledTimes(4);
  expect((await world.rows())[0]).toMatchObject({ state: 'dropped', attempts: 4 });
});

test('a recipient who disconnects during a 429 wait receives no retry', async () => {
  const world = await nudgeWorld();
  await world.publishNudge();
  world.fetch.mockResolvedValueOnce(Response.json({ retry_after: 1 }, { status: 429 }));
  await world.deliver();
  await world.t.run((ctx) => ctx.db.delete(world.authAccountId));
  vi.setSystemTime(Date.now() + 1000);
  await world.deliver();
  expect(world.fetch).toHaveBeenCalledTimes(1);
  expect((await world.rows())[0]).toMatchObject({ state: 'dropped' });
});

test.each(['removed', 'replaced'] as const)(
  'a target seat %s after acceptance is dropped before POST',
  async (change) => {
    const world = await nudgeWorld();
    await world.publishNudge();
    await world.publish(2, world.summary(change === 'removed' ? [] : [world.spectator.userId]));
    await world.deliver();
    expect(world.fetch).not.toHaveBeenCalled();
    expect((await world.rows())[0]).toMatchObject({ state: 'dropped' });
  }
);

test('a directory updated to the same merged account keeps the admitted recipient', async () => {
  const world = await nudgeWorld();
  await world.publishNudge();
  await world.t.run(async (ctx) => {
    await ctx.db.patch(world.identity.userId, {
      merged_into_user_id: world.spectator.userId,
      account_state: 'deleted',
    });
    await ctx.db.patch(world.authAccountId, { userId: world.spectator.userId });
  });
  await world.publish(2, world.summary([world.spectator.userId]));
  await world.deliver();
  expect(world.fetch).toHaveBeenCalledTimes(1);
  expect((await world.rows())[0]).toMatchObject({ state: 'sent' });
});

test.each(['removed', 'replaced'] as const)(
  'a target seat %s during a 429 wait does not receive a retry',
  async (change) => {
    const world = await nudgeWorld();
    await world.publishNudge();
    world.fetch.mockResolvedValueOnce(Response.json({ retry_after: 1 }, { status: 429 }));
    await world.deliver();
    await world.publish(2, world.summary(change === 'removed' ? [] : [world.spectator.userId]));
    vi.setSystemTime(Date.now() + 1000);
    await world.deliver();
    expect(world.fetch).toHaveBeenCalledTimes(1);
    expect((await world.rows())[0]).toMatchObject({ state: 'dropped' });
  }
);
