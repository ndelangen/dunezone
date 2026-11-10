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

test.each(['sent', 'failed'] as const)(
  'a late %s response resolves an in-flight send after expiry without restoring recipient identity',
  async (outcome) => {
    const world = await nudgeWorld();
    const now = Date.now();
    await world.publishNudge();
    const args = await world.delivery();
    let respond!: (response: Response) => void;
    let entered!: () => void;
    const started = new Promise<void>((resolve) => {
      entered = resolve;
    });
    world.fetch.mockImplementationOnce(async () => {
      entered();
      return await new Promise<Response>((resolve) => {
        respond = resolve;
      });
    });
    vi.setSystemTime(now + 119_000);
    const delivery = world.deliver();
    await started;
    expect((await world.rows())[0]).toMatchObject({ state: 'sending', attempts: 1 });
    vi.setSystemTime(now + 120_000);
    await world.t.mutation(internal.playDiscordNudges.expire, args);
    const expired = (await world.rows())[0]!;
    expect(expired).toMatchObject({ state: 'uncertain' });
    expect(expired).not.toHaveProperty('to_user_id');
    expect(expired).not.toHaveProperty('auth_account_id');
    vi.setSystemTime(now + 125_000);
    respond(
      outcome === 'sent'
        ? Response.json({ id: '987654321' })
        : Response.json({ message: 'response-must-stay-private' }, { status: 403 })
    );
    await delivery;
    if (outcome === 'sent') {
      expect(await world.rows()).toEqual([]);
    } else {
      const failed = (await world.rows())[0]!;
      expect(failed).toMatchObject({ state: 'failed', attempts: 1, error: 'Discord request failed (403).' });
      expect(failed).not.toHaveProperty('to_user_id');
      expect(failed).not.toHaveProperty('auth_account_id');
      expect(JSON.stringify(failed)).not.toContain('response-must-stay-private');
      vi.setSystemTime(now + 86_400_000);
      await world.t.mutation(internal.playDiscordNudges.expire, args);
      expect(await world.rows()).toEqual([]);
    }
    await world.t.action(internal.playDiscordNudgeActions.deliver, args);
    expect(world.fetch).toHaveBeenCalledTimes(1);
  }
);

test.each(['rate_limited', 'uncertain', 'dropped'] as const)(
  'an expired uncertain send ignores late %s settlement and never retries',
  async (outcome) => {
    const world = await nudgeWorld();
    await world.publishNudge();
    const args = await world.delivery();
    await world.t.mutation(internal.playDiscordNudges.start, args);
    vi.setSystemTime(Date.now() + 120_000);
    await world.t.mutation(internal.playDiscordNudges.expire, args);
    const expired = (await world.rows())[0]!;
    const jobs = await world.t.run((ctx) => ctx.db.system.query('_scheduled_functions').collect());
    await world.t.mutation(internal.playDiscordNudges.settle, {
      ...args,
      outcome,
      error: 'Late diagnostic',
      retryAfterMs: 1000,
    });
    expect(await world.rows()).toEqual([expired]);
    expect(await world.t.run((ctx) => ctx.db.system.query('_scheduled_functions').collect())).toEqual(jobs);
    await world.t.action(internal.playDiscordNudgeActions.deliver, args);
    expect(world.fetch).not.toHaveBeenCalled();
  }
);

test('a late terminal response cannot change a newer event at the same seat', async () => {
  const world = await nudgeWorld();
  await world.publishNudge();
  const previous = await world.delivery();
  await world.t.mutation(internal.playDiscordNudges.start, previous);
  vi.setSystemTime(Date.now() + 120_000);
  await world.t.mutation(internal.playDiscordNudges.expire, previous);
  vi.setSystemTime(Date.now() + 180_000);
  await world.publishNudge({ nudgeId: 'replacement' });
  const replacement = (await world.rows())[0]!;
  expect(replacement._id).toBe(previous.id);
  for (const outcome of ['sent', 'failed'] as const) {
    await world.t.mutation(internal.playDiscordNudges.settle, {
      ...previous,
      outcome,
      messageId: '987654321',
      error: 'Discord request failed (403).',
    });
    expect(await world.rows()).toEqual([replacement]);
  }
});
