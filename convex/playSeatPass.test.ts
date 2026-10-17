/// <reference types="vite/client" />
// @vitest-environment edge-runtime

import { afterEach, beforeEach, describe, expect, test, vi } from 'vite-plus/test';

import { PLAY_SEAT_PASS_TTL_MS, peekSeatPass, verifySeatPass } from '../src/shared/play/seatPass';
import { api, internal } from './_generated/api';
import { applicationTest } from './application.test.fixture';
import { revokeAccountSessions } from './lib/authSessionLifecycle';

async function fixture() {
  const t = applicationTest();
  const { gameId, secret, attemptId } = await t.mutation(internal.playTesting.createFixture, {});
  expect(await t.mutation(api.playProvisioning.confirmProvisioning, { gameId, secret, attemptId })).toEqual({
    ok: true,
  });
  const identity = await t.run(async (ctx) => {
    const userId = await ctx.db.insert('users', { account_state: 'active', name: 'Synthetic player' });
    const sessionId = await ctx.db.insert('authSessions', { userId, expirationTime: Date.now() + 3 * 3_600_000 });
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
  const player = t.withIdentity({ subject: `${identity.userId}|${identity.sessionId}` });
  return { t, player, gameId, secret, ...identity };
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.stubEnv('IS_TEST', 'true');
  vi.stubEnv('E2E_LOCAL_AUTH', 'true');
  vi.stubEnv('CONVEX_CLOUD_URL', 'http://127.0.0.1:3210');
  vi.stubEnv('SITE_URL', 'http://127.0.0.1:8787');
});
afterEach(() => {
  vi.clearAllTimers();
  vi.useRealTimers();
  vi.unstubAllEnvs();
});

describe('Seat passes', () => {
  test('enrol an account once, then ride on the game query and renew for an hour at most', async () => {
    const subject = await fixture();
    const address = { address: subject.gameId };
    expect(await subject.player.query(api.playGames.getGameByAddress, address)).toMatchObject({
      status: 'ready',
      pass: null,
    });
    expect(await subject.player.mutation(api.playAdmission.renewSeatPass, { gameId: subject.gameId })).toEqual({
      ok: false,
      reason: 'not_authorized',
    });

    const enrolled = await subject.player.mutation(api.playAdmission.enrolPlayer, { gameId: subject.gameId });
    if (!enrolled.ok) {
      throw new Error('Enrolment refused');
    }
    const pass = await verifySeatPass(subject.secret, enrolled.pass);
    const session = await subject.t.run(async (ctx) => await ctx.db.get(subject.sessionId));
    expect(pass).toMatchObject({
      gameId: subject.gameId,
      actorId: subject.userId,
      principalId: subject.userId,
      sessionId: subject.sessionId,
      sessionCreatedAt: session?._creationTime,
      displayName: 'Synthetic player',
      profileSlug: 'synthetic-player',
    });
    expect(pass!.exp - pass!.issuedAt).toBeLessThanOrEqual(PLAY_SEAT_PASS_TTL_MS);
    expect(await verifySeatPass('b'.repeat(64), enrolled.pass)).toBeNull();

    /* Enrolling again keeps the one routing row; the query now carries a pass of its own. */
    expect((await subject.player.mutation(api.playAdmission.enrolPlayer, { gameId: subject.gameId })).ok).toBe(true);
    const rows = await subject.t.run(async (ctx) =>
      ctx.db
        .query('play_game_accounts')
        .withIndex('by_game_id_user_id', (q) => q.eq('game_id', subject.gameId).eq('user_id', subject.userId))
        .collect()
    );
    expect(rows).toHaveLength(1);
    const access = await subject.player.query(api.playGames.getGameByAddress, address);
    expect(access.status === 'ready' && peekSeatPass(access.pass ?? '')?.principalId).toBe(subject.userId);
    const renewed = await subject.player.mutation(api.playAdmission.renewSeatPass, { gameId: subject.gameId });
    expect(renewed.ok && (await verifySeatPass(subject.secret, renewed.pass))?.actorId).toBe(subject.userId);
  });

  test('are refused to signed-out, deleting and revoked accounts', async () => {
    const subject = await fixture();
    expect(await subject.t.mutation(api.playAdmission.enrolPlayer, { gameId: subject.gameId })).toEqual({
      ok: false,
      reason: 'not_authorized',
    });
    await subject.t.run((ctx) => ctx.db.patch(subject.userId, { account_state: 'deletion_pending' }));
    expect((await subject.player.mutation(api.playAdmission.enrolPlayer, { gameId: subject.gameId })).ok).toBe(false);
    await subject.t.run((ctx) => ctx.db.patch(subject.userId, { account_state: 'active' }));
    expect((await subject.player.mutation(api.playAdmission.enrolPlayer, { gameId: subject.gameId })).ok).toBe(true);
    await subject.t.run((ctx) => revokeAccountSessions(ctx, subject.userId));
    expect((await subject.player.mutation(api.playAdmission.renewSeatPass, { gameId: subject.gameId })).ok).toBe(false);
  });

  test('tell the room whether an account is at its seat limit, only with the game secret', async () => {
    const subject = await fixture();
    const request = { gameId: subject.gameId, secret: subject.secret, userId: subject.userId };
    expect(await subject.t.query(api.playAdmission.seatLimitReached, request)).toEqual({ ok: true, reached: false });
    expect(
      await subject.t.query(api.playAdmission.seatLimitReached, { ...request, secret: 'b'.repeat(64) })
    ).toMatchObject({ ok: false });
    expect(
      await subject.t.query(api.playAdmission.seatLimitReached, { ...request, userId: 'unknown-account' })
    ).toEqual({ ok: true, reached: true });
  });
});

describe('Session cutoffs', () => {
  test('queue a sign-out for every enrolled game and retire it only on an acknowledgement that covers it', async () => {
    const subject = await fixture();
    await subject.player.mutation(api.playAdmission.enrolPlayer, { gameId: subject.gameId });
    await subject.t.run((ctx) => revokeAccountSessions(ctx, subject.userId));
    const [event] = await subject.t.run(async (ctx) => await ctx.db.query('play_session_cutoffs').collect());
    expect(event).toMatchObject({ game_id: subject.gameId, principal_id: subject.userId, state: 'pending' });
    const ack = (through: number) =>
      subject.t.mutation(api.playSessionCutoffs.ackSessionCutoff, {
        gameId: subject.gameId,
        secret: subject.secret,
        eventId: event!._id,
        through,
      });
    await ack(event!.through - 1);
    expect((await subject.t.run((ctx) => ctx.db.get(event!._id)))?.state).toBe('pending');
    await subject.t.mutation(api.playSessionCutoffs.ackSessionCutoff, {
      gameId: subject.gameId,
      secret: 'b'.repeat(64),
      eventId: event!._id,
      through: event!.through,
    });
    expect((await subject.t.run((ctx) => ctx.db.get(event!._id)))?.state).toBe('pending');
    await ack(event!.through);
    expect((await subject.t.run((ctx) => ctx.db.get(event!._id)))?.state).toBe('acknowledged');
  });

  test('stop retrying once every pass the cutoff ends has expired', async () => {
    const subject = await fixture();
    await subject.player.mutation(api.playAdmission.enrolPlayer, { gameId: subject.gameId });
    await subject.t.run((ctx) => revokeAccountSessions(ctx, subject.userId));
    await subject.t.finishAllScheduledFunctions(() => vi.runAllTimers());
    expect(await subject.t.run(async (ctx) => await ctx.db.query('play_session_cutoffs').collect())).toEqual([]);
  });
});
