/* @vitest-environment edge-runtime */

import { afterEach, beforeEach, expect, test, vi } from 'vite-plus/test';

import { api, internal } from './_generated/api';
import type { Id } from './_generated/dataModel';
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

test('account revocation drains batches without revoking a new Discord connection', async () => {
  discordStub();
  const world = await voiceWorld();
  await world.join();
  const grant = (await world.grants())[0]!;
  await world.t.run(async (ctx) => {
    const { _id, _creationTime, ...copy } = grant;
    for (let i = 1; i < 65; i += 1) {
      await ctx.db.insert('play_game_discord_grants', { ...copy, discord_user_id: String(400 + i) });
    }
  });
  const args = { userId: world.identity.userId, disconnectedAuthIds: [world.authId!] };
  await world.t.mutation(internal.playDiscord.revokeAccount, args);
  const fresh = await world.t.run(async (ctx) => {
    const authId = await ctx.db.insert('authAccounts', {
      userId: world.identity.userId,
      provider: 'discord',
      providerAccountId: '900',
    });
    const { _id, _creationTime, ...copy } = grant;
    return await ctx.db.insert('play_game_discord_grants', {
      ...copy,
      auth_account_id: authId,
      discord_user_id: '900',
    });
  });
  for (let batch = 0; batch < 3; batch += 1) {
    const jobs = await world.t.run((ctx) => ctx.db.system.query('_scheduled_functions').collect());
    const job = jobs.find((entry) => entry.name === 'playDiscord:revokeAccount' && entry.state.kind === 'pending');
    if (!job) {
      break;
    }
    const next = job.args[0] as {
      userId: Id<'users'>;
      disconnectedAuthIds: Id<'authAccounts'>[];
      cursor: string | null;
    };
    await world.t.mutation(internal.playDiscord.revokeAccount, next);
    await world.t.run((ctx) => ctx.scheduler.cancel(job._id));
  }
  const rows = await world.grants();
  expect(rows.filter((entry) => entry.auth_account_id === world.authId).every((entry) => !entry.desired)).toBe(true);
  expect(rows.find((entry) => entry._id === fresh)).toMatchObject({ desired: true });
});

test('an account merge removes the source account grants as the merge starts', async () => {
  const discord = discordStub();
  const world = await voiceWorld();
  await world.join();
  await world.reconcile();
  await world.t.run((ctx) => ctx.db.patch(world.spectator.userId, { isAdmin: true }));
  await world.t.withIdentity({ subject: world.spectator.subject }).mutation(api.accounts.merge, {
    sourceUserId: world.identity.userId,
    targetUserId: world.spectator.userId,
  });
  await world.reconcile();
  expect(discord.granted.size).toBe(0);
  expect(await world.grants()).toMatchObject([{ state: 'revoked', desired: false }]);
});
