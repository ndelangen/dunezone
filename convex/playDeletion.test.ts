/// <reference types="vite/client" />
// @vitest-environment edge-runtime

import { afterEach, beforeEach, describe, expect, test, vi } from 'vite-plus/test';

import { PLAY_FIXTURE_KEY } from '../src/shared/play/admission';
import { api, internal } from './_generated/api';
import { applicationTest } from './application.test.fixture';
import { insertPendingGame } from './lib/playProvisioningSchedule';

/* A confirmed game the player created, before they open it. */
async function createdGame() {
  const t = applicationTest();
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
  return { t, player, game, userId, sessionId };
}

async function fixture() {
  const created = await createdGame();
  const enrolled = await created.player.mutation(api.playAdmission.enrolPlayer, { gameId: created.game._id });
  if (!enrolled.ok) {
    throw new Error('Enrolment refused');
  }
  return created;
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
  test('durable fan-out is idempotent', async () => {
    const subject = await fixture();
    const { event, operationId } = await startDeletion(subject);
    await subject.t.mutation(internal.playDeletion.queueAccountDeletion, {
      operationId,
      paginationOpts: { cursor: null, numItems: 32 },
    });
    expect(await subject.t.run(async (ctx) => await ctx.db.query('play_account_deletions').take(2))).toEqual([event]);
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
    const { event } = await startDeletion(subject);
    const credentials = { gameId: subject.game._id, secret: subject.game.secret };
    await subject.t.mutation(api.playAdmission.ackAccountDeletion, { ...credentials, eventId: event._id });
    expect(await subject.t.run(async (ctx) => (await ctx.db.get(event._id))?.state)).toBe('acknowledged');
  });

  test('retiring the hosted fixture settles its deletions, drops its routing and retries until its room retires', async () => {
    const subject = await fixture();
    await subject.t.run(
      async (ctx) =>
        await ctx.db.patch(subject.game._id, {
          fixture_key: PLAY_FIXTURE_KEY,
          ruleset_id: undefined,
          minimum_players: undefined,
          creator_id: undefined,
        })
    );
    const { event } = await startDeletion(subject);
    const responses = [new Response(null, { status: 403 }), new Response(null, { status: 200 })];
    const fetch = vi.fn(
      async (_url: string, _init?: RequestInit) => responses.shift() ?? new Response(null, { status: 200 })
    );
    vi.stubGlobal('fetch', fetch);

    await subject.t.mutation(internal.migrations.play_hosted_fixture_retire_v1, {});
    await subject.t.finishAllScheduledFunctions(vi.runAllTimers);

    const stored = await subject.t.run(async (ctx) => ({
      game: await ctx.db.get(subject.game._id),
      event: await ctx.db.get(event._id),
      routings: await ctx.db.query('play_game_accounts').collect(),
    }));
    expect(stored.game?.state).toBe('expired');
    expect(stored.event?.state).toBe('acknowledged');
    expect(stored.routings).toEqual([]);
    const retirements = fetch.mock.calls.filter(([url]) => String(url).endsWith('/retire'));
    expect(retirements).toHaveLength(2);
    expect(retirements[1]).toEqual([
      `https://dune.zone/__play/games/${subject.game._id}/retire`,
      expect.objectContaining({ body: JSON.stringify({ gameId: subject.game._id, secret: subject.game.secret }) }),
    ]);
  });

  test('a hosted fixture room that never retires keeps its deletions pending', async () => {
    const subject = await fixture();
    await subject.t.run(
      async (ctx) =>
        await ctx.db.patch(subject.game._id, {
          fixture_key: PLAY_FIXTURE_KEY,
          ruleset_id: undefined,
          minimum_players: undefined,
          creator_id: undefined,
        })
    );
    const { event } = await startDeletion(subject);
    const fetch = vi.fn(async (_url: string, _init?: RequestInit) => new Response(null, { status: 403 }));
    vi.stubGlobal('fetch', fetch);
    vi.spyOn(console, 'error').mockImplementation(() => {});

    await subject.t.mutation(internal.migrations.play_hosted_fixture_retire_v1, {});
    await subject.t.finishAllScheduledFunctions(vi.runAllTimers);

    expect(fetch.mock.calls.filter(([url]) => String(url).endsWith('/retire'))).toHaveLength(17);
    expect(await subject.t.run(async (ctx) => (await ctx.db.get(event._id))?.state)).toBe('pending');
    expect(await subject.t.run(async (ctx) => await ctx.db.query('play_game_accounts').collect())).toHaveLength(1);
  });

  test('a deletion for a game that is not ready waits out its backoff instead of staying due', async () => {
    const subject = await fixture();
    const { event } = await startDeletion(subject);
    await subject.t.run(async (ctx) => await ctx.db.patch(subject.game._id, { state: 'pending' }));
    const fetch = vi.fn(async (_url: string, _init?: RequestInit) => new Response(null, { status: 200 }));
    vi.stubGlobal('fetch', fetch);

    await subject.t.action(internal.playDeletion.deliver, { eventId: event._id });

    const stored = await subject.t.run(async (ctx) => await ctx.db.get(event._id));
    expect(stored?.state).toBe('pending');
    expect(stored?.attempts).toBe(event.attempts + 1);
    expect(stored?.next_attempt_at).toBeGreaterThan(Date.now());
    expect(fetch).not.toHaveBeenCalled();
  });

  test('retiring the hosted fixture leaves every real game as it was', async () => {
    const subject = await fixture();
    const { event } = await startDeletion(subject);
    const fetch = vi.fn(async (_url: string, _init?: RequestInit) => new Response(null, { status: 200 }));
    vi.stubGlobal('fetch', fetch);

    await subject.t.mutation(internal.migrations.play_hosted_fixture_retire_v1, {});

    expect(await subject.t.run(async (ctx) => (await ctx.db.get(subject.game._id))?.state)).toBe('ready');
    expect(await subject.t.run(async (ctx) => (await ctx.db.get(event._id))?.state)).toBe('pending');
    expect(await subject.t.run(async (ctx) => await ctx.db.query('play_game_accounts').collect())).toHaveLength(1);
    expect(fetch.mock.calls.filter(([url]) => String(url).endsWith('/retire'))).toEqual([]);
  });

  test('reaches a creator of a game from before creators were enrolled, through a routing row the fan-out adds', async () => {
    const subject = await createdGame();
    await subject.t.run(async (ctx) => {
      const rows = await ctx.db.query('play_game_accounts').collect();
      await Promise.all(rows.map((row) => ctx.db.delete(row._id)));
    });
    const { operationId } = await subject.player.mutation(api.accountDeletion.confirm, { replacementUserId: null });
    await subject.t.mutation(internal.playDeletion.queueAccountDeletion, {
      operationId,
      paginationOpts: { cursor: null, numItems: 32 },
    });
    await subject.t.mutation(internal.playDeletion.queueCreatorDeletion, { operationId, cursor: null });
    const events = await subject.t.run(async (ctx) => await ctx.db.query('play_account_deletions').collect());
    expect(events).toMatchObject([{ game_id: subject.game._id, user_id: subject.userId, state: 'pending' }]);
  });

  test('reaches a creator deleted before the creator fan-out existed, once, and only for a completed deletion', async () => {
    const subject = await createdGame();
    const { operationId } = await subject.t.run(async (ctx) => {
      const rows = await ctx.db.query('play_game_accounts').collect();
      await Promise.all(rows.map((row) => ctx.db.delete(row._id)));
      const profile = (await ctx.db
        .query('profiles')
        .withIndex('by_user_id', (q) => q.eq('user_id', subject.userId))
        .unique())!;
      await ctx.db.patch(subject.userId, { account_state: 'deleted' });
      const stamp = new Date().toISOString();
      const operation = {
        source_user_id: subject.userId,
        source_profile_id: profile._id,
        replacement_user_id: null,
        phase: 'complete' as const,
        snapshot_kind: null,
        snapshot_cursor: null,
        retry_count: 0,
        error: null,
        created_at: stamp,
        updated_at: stamp,
        completed_at: stamp,
      };
      /* A deletion that failed and was restored names the same account and must reach no game. */
      await ctx.db.insert('account_deletion_operations', { ...operation, state: 'failed', completed_at: null });
      const operationId = await ctx.db.insert('account_deletion_operations', { ...operation, state: 'completed' });
      await ctx.db.patch(subject.userId, { account_deletion_operation_id: operationId });
      return { operationId };
    });
    const events = async () =>
      await subject.t.run(async (ctx) => await ctx.db.query('play_account_deletions').collect());
    const scheduled = async () =>
      (await subject.t.run(async (ctx) => await ctx.db.system.query('_scheduled_functions').collect()))
        .filter((job) => job.name.endsWith('queueCreatorDeletion') && job.state.kind === 'pending')
        .map((job) => job.args[0] as { operationId: typeof operationId; cursor: null });
    for (let run = 0; run < 2; run++) {
      const before = (await scheduled()).length;
      await subject.t.mutation(internal.playDeletion.requeueCreatorDeletions, { cursor: null });
      const queued = (await scheduled()).slice(before);
      expect(queued).toEqual([{ operationId, cursor: null }]);
      await subject.t.mutation(internal.playDeletion.queueCreatorDeletion, queued[0]);
      expect(await events()).toMatchObject([
        { game_id: subject.game._id, user_id: subject.userId, operation_id: operationId, state: 'pending' },
      ]);
    }
  });

  test('reaches no creator whose deleted account was restored, though the restore leaves its deletion completed', async () => {
    const subject = await createdGame();
    await subject.t.run(async (ctx) => {
      const rows = await ctx.db.query('play_game_accounts').collect();
      await Promise.all(rows.map((row) => ctx.db.delete(row._id)));
      const profile = (await ctx.db
        .query('profiles')
        .withIndex('by_user_id', (q) => q.eq('user_id', subject.userId))
        .unique())!;
      const stamp = new Date().toISOString();
      await ctx.db.insert('account_deletion_operations', {
        source_user_id: subject.userId,
        source_profile_id: profile._id,
        replacement_user_id: null,
        phase: 'complete',
        snapshot_kind: null,
        snapshot_cursor: null,
        retry_count: 0,
        error: null,
        created_at: stamp,
        updated_at: stamp,
        completed_at: stamp,
        state: 'completed',
      });
    });
    await subject.t.mutation(internal.playDeletion.requeueCreatorDeletions, { cursor: null });
    const queued = (
      await subject.t.run(async (ctx) => await ctx.db.system.query('_scheduled_functions').collect())
    ).filter((job) => job.name.endsWith('queueCreatorDeletion'));
    expect(queued).toEqual([]);
  });

  test('settles a deletion queued for a game that never opened only once its room has emptied', async () => {
    const subject = await createdGame();
    const { operationId } = await subject.player.mutation(api.accountDeletion.confirm, { replacementUserId: null });
    await subject.t.mutation(internal.playDeletion.queueAccountDeletion, {
      operationId,
      paginationOpts: { cursor: null, numItems: 32 },
    });
    const event = await subject.t.run(async (ctx) => {
      await ctx.db.patch(subject.game._id, { state: 'expired' });
      return (await ctx.db.query('play_account_deletions').first())!;
    });
    const state = async () => (await subject.t.run((ctx) => ctx.db.get(event._id)))?.state;
    const fetch = vi.fn(async () => new Response(null, { status: 403 }));
    vi.stubGlobal('fetch', fetch);
    await subject.t.action(internal.playDeletion.deliver, { eventId: event._id });
    expect(fetch).toHaveBeenCalledWith(
      `https://dune.zone/__play/games/${subject.game._id}/retire`,
      expect.objectContaining({ body: JSON.stringify({ gameId: subject.game._id, secret: subject.game.secret }) })
    );
    expect(await state()).toBe('pending');

    fetch.mockResolvedValue(new Response(JSON.stringify({ ok: true }), { status: 200 }));
    vi.setSystemTime((await subject.t.run((ctx) => ctx.db.get(event._id)))!.next_attempt_at);
    await subject.t.action(internal.playDeletion.deliver, { eventId: event._id });
    expect(await state()).toBe('acknowledged');
  });
});
