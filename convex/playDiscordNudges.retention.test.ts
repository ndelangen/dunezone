/* @vitest-environment edge-runtime */

import { afterEach, beforeEach, expect, test, vi } from 'vite-plus/test';

import { internal } from './_generated/api';
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
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

test.each(['pending', 'sent', 'dropped'] as const)(
  '%s delivery records expire after two minutes without resetting the seat cooldown',
  async (state) => {
    const world = await nudgeWorld();
    const now = Date.now();
    await world.publishNudge();
    const args = await world.delivery();
    if (state === 'sent') {
      await world.deliver();
    } else if (state === 'dropped') {
      await world.t.run((ctx) => ctx.db.delete(world.authAccountId));
      await world.deliver();
      await world.t.run((ctx) =>
        ctx.db.insert('authAccounts', {
          userId: world.identity.userId,
          provider: 'discord',
          providerAccountId: '123456789',
        })
      );
    }
    expect((await world.rows())[0]).toMatchObject({ state });
    const scheduled = await world.t.run((ctx) => ctx.db.system.query('_scheduled_functions').collect());
    expect(
      scheduled.some(
        (entry) => entry.scheduledTime === now + 120_000 && entry.name.includes('playDiscordNudges:expire')
      )
    ).toBe(true);
    vi.setSystemTime(now + 120_000);
    await world.t.mutation(internal.playDiscordNudges.expire, args);
    expect(await world.rows()).toEqual([]);
    await world.publishNudge({ nudgeId: 'still-in-cooldown' });
    expect(await world.rows()).toEqual([]);
    vi.setSystemTime(now + 300_000);
    await world.publishNudge({ nudgeId: 'cooldown-finished' });
    expect(await world.rows()).toHaveLength(1);
  }
);

test.each(['failed', 'uncertain', 'sending'] as const)(
  '%s deliveries retain sanitized diagnostics for one day and are then removed',
  async (state) => {
    const world = await nudgeWorld();
    const now = Date.now();
    await world.publishNudge();
    const args = await world.delivery();
    if (state === 'sending') {
      await world.t.mutation(internal.playDiscordNudges.start, args);
    } else {
      world.fetch.mockResolvedValue(Response.json({}, { status: state === 'failed' ? 403 : 500 }));
      await world.deliver();
    }
    expect((await world.rows())[0]).toMatchObject({ state });
    vi.setSystemTime(now + 120_000);
    await world.t.mutation(internal.playDiscordNudges.expire, args);
    const retained = (await world.rows())[0]!;
    expect(retained).toMatchObject({ state: state === 'sending' ? 'uncertain' : state });
    expect(retained).not.toHaveProperty('to_user_id');
    expect(retained).not.toHaveProperty('auth_account_id');
    const scheduled = await world.t.run((ctx) => ctx.db.system.query('_scheduled_functions').collect());
    expect(
      scheduled.some(
        (entry) => entry.scheduledTime === now + 86_400_000 && entry.name.includes('playDiscordNudges:expire')
      )
    ).toBe(true);
    vi.setSystemTime(now + 86_400_000);
    await world.t.mutation(internal.playDiscordNudges.expire, args);
    expect(await world.rows()).toEqual([]);
  }
);

test('a delayed expiry for an older event cannot delete its replacement at the same seat', async () => {
  const world = await nudgeWorld();
  await world.publishNudge();
  const previous = await world.delivery();
  world.fetch.mockResolvedValue(Response.json({}, { status: 500 }));
  await world.deliver();
  vi.setSystemTime(Date.now() + 300_000);
  await world.publishNudge({ nudgeId: 'replacement' });
  const replacement = (await world.rows())[0]!;
  expect(replacement._id).toBe(previous.id);
  await world.t.mutation(internal.playDiscordNudges.expire, previous);
  expect(await world.rows()).toEqual([replacement]);
});

test('an expired event cannot deliver or settle after its record has been removed', async () => {
  const world = await nudgeWorld();
  await world.publishNudge();
  const args = await world.delivery();
  vi.setSystemTime(Date.now() + 120_000);
  await world.t.mutation(internal.playDiscordNudges.expire, args);
  await world.t.action(internal.playDiscordNudgeActions.deliver, args);
  await world.t.mutation(internal.playDiscordNudges.settle, { ...args, outcome: 'sent', messageId: '123' });
  expect(world.fetch).not.toHaveBeenCalled();
  expect(await world.rows()).toEqual([]);
});
