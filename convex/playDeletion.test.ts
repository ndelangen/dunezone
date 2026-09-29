/// <reference types="vite/client" />
// @vitest-environment edge-runtime

import aggregateTest from '@convex-dev/aggregate/test';
import rateLimiterTest from '@convex-dev/rate-limiter/test';
import { convexTest } from 'convex-test';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';

import { PLAY_FIXTURE_KEY } from '../src/shared/play/admission';
import { api, internal } from './_generated/api';
import { insertPendingGame } from './lib/playProvisioningSchedule';
import schema from './schema';

const modules = import.meta.glob('./**/*.ts');

async function fixture() {
  const t = convexTest(schema, modules);
  rateLimiterTest.register(t);
  aggregateTest.register(t, 'statistics');
  aggregateTest.register(t, 'profileDiscovery');
  aggregateTest.register(t, 'profileActivity');
  const { userId, sessionId } = await t.run(async (ctx) => {
    const userId = await ctx.db.insert('users', { account_state: 'active' });
    const sessionId = await ctx.db.insert('authSessions', { userId, expirationTime: Date.now() + 3_600_000 });
    await ctx.db.insert('authRefreshTokens', { sessionId, expirationTime: Date.now() + 600_000 });
    await ctx.db.insert('profiles', {
      user_id: userId,
      username: 'Synthetic player',
      avatar_url: null,
      account_state: 'active',
      slug: 'synthetic-player',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    });
    return { userId, sessionId };
  });
  /* A real game the player created: deletion never reads its ruleset, so a bare row stands in. */
  const { gameId, secret, attemptId } = await t.run(async (ctx) => {
    const stamp = new Date().toISOString();
    const rulesetId = await ctx.db.insert('rulesets', {
      name: 'Classic',
      slug: 'classic',
      about: '',
      created_at: stamp,
      updated_at: stamp,
      owner_id: userId,
      group_id: null,
      is_deleted: false,
      image_cover: null,
    });
    return await insertPendingGame(ctx, { ruleset_id: rulesetId, minimum_players: 4, creator_id: userId });
  });
  await t.mutation(api.playProvisioning.confirmProvisioning, { gameId, secret, attemptId });
  const game = await t.run(async (ctx) => await ctx.db.get(gameId));
  if (!game) {
    throw new Error('Missing game');
  }
  const player = t.withIdentity({ subject: `${userId}|${sessionId}` });
  const issued = await player.mutation(api.playAdmission.issueTicket, { gameId });
  if (!issued.ok) {
    throw new Error('Issuance refused');
  }
  const admitted = await t.mutation(api.playAdmission.redeemTicket, {
    gameId,
    secret: game.secret,
    ticket: issued.ticket,
  });
  if (!admitted.ok) {
    throw new Error('Admission refused');
  }
  return { t, player, game, userId, sessionId, registrationId: admitted.registrationId };
}

async function startDeletion(subject: Awaited<ReturnType<typeof fixture>>) {
  const { operationId } = await subject.player.mutation(api.accountDeletion.confirm, { replacementUserId: null });
  await subject.t.mutation(internal.playDeletion.queueAccountDeletion, {
    operationId,
    paginationOpts: { cursor: null, numItems: 32 },
  });
  const event = await subject.t.run(async (ctx) => await ctx.db.query('play_account_deletions').first());
  if (!event) {
    throw new Error('Deletion event missing');
  }
  return { event, operationId };
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.stubEnv('SITE_URL', 'https://dune.zone');
  vi.stubEnv('PLAY_SERVICE_URL', 'https://dune.zone');
});
afterEach(() => {
  vi.clearAllTimers();
  vi.useRealTimers();
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe('Play account deletion', () => {
  test('confirmation suspends the registered session and supplies deletion reconciliation before notification delivery', async () => {
    const subject = await fixture();
    const { operationId } = await subject.player.mutation(api.accountDeletion.confirm, { replacementUserId: null });
    expect(
      await subject.t.query(api.playAdmission.watchAuthorizations, {
        gameId: subject.game._id,
        secret: subject.game.secret,
        generation: 'deletion-test',
        registrationIds: [subject.registrationId],
      })
    ).toMatchObject({ ok: true, entries: [{ allowed: false }] });
    expect(
      await subject.t.query(api.playAdmission.reconcileAccounts, {
        gameId: subject.game._id,
        secret: subject.game.secret,
        userIds: [subject.userId],
      })
    ).toEqual({
      ok: true,
      accounts: [{ userId: subject.userId, state: 'deletion_pending', deletionOperationId: operationId }],
    });
  });

  test('durable fan-out is idempotent, and recovery cannot resurrect historical game identity', async () => {
    const subject = await fixture();
    const { event, operationId } = await startDeletion(subject);
    await subject.t.mutation(internal.playDeletion.queueAccountDeletion, {
      operationId,
      paginationOpts: { cursor: null, numItems: 32 },
    });
    expect(await subject.t.run(async (ctx) => await ctx.db.query('play_account_deletions').take(2))).toEqual([event]);
    await subject.t.run(
      async (ctx) =>
        await ctx.db.patch(subject.userId, { account_state: 'active', account_deletion_operation_id: undefined })
    );
    expect(
      await subject.t.query(api.playAdmission.reconcileAccounts, {
        gameId: subject.game._id,
        secret: subject.game.secret,
        userIds: [subject.userId],
      })
    ).toEqual({ ok: true, accounts: [{ userId: subject.userId, state: 'deleted', deletionOperationId: operationId }] });
  });

  test('retains and retries lost deliveries until the exact game acknowledges its durable cleanup', async () => {
    const subject = await fixture();
    const { event, operationId } = await startDeletion(subject);
    const fetch = vi.fn(async () => {
      throw new Error('Synthetic connection loss');
    });
    vi.stubGlobal('fetch', fetch);
    await subject.t.action(internal.playDeletion.deliver, { eventId: event._id });
    const attempted = await subject.t.run(async (ctx) => await ctx.db.get(event._id));
    expect(attempted).toMatchObject({ state: 'pending', attempts: 1 });
    expect(attempted?.next_attempt_at).toBeGreaterThan(Date.now());
    expect(fetch).toHaveBeenCalledWith(
      `https://dune.zone/__play/games/${subject.game._id}/account-deletion`,
      expect.objectContaining({
        body: JSON.stringify({
          gameId: subject.game._id,
          secret: subject.game.secret,
          eventId: event._id,
          userId: subject.userId,
          deletionOperationId: operationId,
        }),
      })
    );
    await subject.t.mutation(api.playAdmission.ackAccountDeletion, {
      gameId: subject.game._id,
      secret: 'a'.repeat(64),
      eventId: event._id,
    });
    expect(await subject.t.run(async (ctx) => (await ctx.db.get(event._id))?.state)).toBe('pending');
    await subject.t.mutation(api.playAdmission.ackAccountDeletion, {
      gameId: subject.game._id,
      secret: subject.game.secret,
      eventId: event._id,
    });
    await subject.t.mutation(api.playAdmission.ackAccountDeletion, {
      gameId: subject.game._id,
      secret: subject.game.secret,
      eventId: event._id,
    });
    vi.setSystemTime(attempted!.next_attempt_at);
    await subject.t.action(internal.playDeletion.deliver, { eventId: event._id });
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(await subject.t.run(async (ctx) => (await ctx.db.get(event._id))?.state)).toBe('acknowledged');
  });

  test('a successful HTTP response alone is not a deletion acknowledgement', async () => {
    const subject = await fixture();
    const { event } = await startDeletion(subject);
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response(null, { status: 200 }))
    );
    await subject.t.action(internal.playDeletion.deliver, { eventId: event._id });
    expect(await subject.t.run(async (ctx) => (await ctx.db.get(event._id))?.state)).toBe('pending');
  });

  test('the closed hosted fixture still settles the deletion of an account routed to it', async () => {
    const subject = await fixture();
    /* The hosted fixture's stored row: its key and no ruleset, with the routing its players' admissions left. */
    await subject.t.run(
      async (ctx) =>
        await ctx.db.patch(subject.game._id, {
          fixture_key: PLAY_FIXTURE_KEY,
          ruleset_id: undefined,
          minimum_players: undefined,
          creator_id: undefined,
        })
    );
    const { event, operationId } = await startDeletion(subject);
    const credentials = { gameId: subject.game._id, secret: subject.game.secret };
    expect(
      await subject.t.query(api.playAdmission.reconcileAccounts, { ...credentials, userIds: [subject.userId] })
    ).toEqual({ ok: true, accounts: [{ userId: subject.userId, state: 'deleted', deletionOperationId: operationId }] });
    await subject.t.mutation(api.playAdmission.ackAccountDeletion, { ...credentials, eventId: event._id });
    expect(await subject.t.run(async (ctx) => (await ctx.db.get(event._id))?.state)).toBe('acknowledged');
  });

  test('server-only reconciliation cannot read unregistered accounts from a different game', async () => {
    const subject = await fixture();
    const unregistered = await subject.t.run(
      async (ctx) => await ctx.db.insert('users', { name: 'Unrelated synthetic account' })
    );
    expect(
      await subject.t.query(api.playAdmission.reconcileAccounts, {
        gameId: subject.game._id,
        secret: subject.game.secret,
        userIds: [unregistered],
      })
    ).toEqual({ ok: true, accounts: [{ userId: unregistered, state: 'unknown', deletionOperationId: null }] });
    expect(
      await subject.t.query(api.playAdmission.reconcileAccounts, {
        gameId: subject.game._id,
        secret: 'b'.repeat(64),
        userIds: [subject.userId],
      })
    ).toEqual({ ok: false });
  });
});
