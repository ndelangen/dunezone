/// <reference types="vite/client" />
// @vitest-environment edge-runtime

import { afterEach, beforeEach, describe, expect, test, vi } from 'vite-plus/test';

import { PLAY_FIXTURE_KEY } from '../src/shared/play/admission';
import { peekSeatPass } from '../src/shared/play/seatPass';
import { api, internal } from './_generated/api';
import type { MutationCtx } from './_generated/server';
import { applicationTest } from './application.test.fixture';

function setup() {
  const t = applicationTest();
  return t;
}

/* The protocol verifier's subject, a synthetic test game on an isolated backend, since the hosted fixture admits nobody. */
async function fixture() {
  const t = setup();
  const { gameId, secret, attemptId } = await t.mutation(internal.playTesting.createFixture, {});
  const credentials = { gameId, secret, attemptId };
  expect(await t.mutation(api.playProvisioning.confirmProvisioning, credentials)).toEqual({ ok: true });
  const identity = await t.run(async (ctx) => {
    const userId = await ctx.db.insert('users', { account_state: 'active', name: 'Synthetic player' });
    const sessionId = await ctx.db.insert('authSessions', { userId, expirationTime: Date.now() + 3_600_000 });
    const refreshId = await ctx.db.insert('authRefreshTokens', { sessionId, expirationTime: Date.now() + 600_000 });
    await ctx.db.insert('profiles', {
      user_id: userId,
      username: 'Synthetic player',
      avatar_url: null,
      account_state: 'active',
      slug: 'synthetic-player',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    });
    return { userId, sessionId, refreshId };
  });
  const player = t.withIdentity({ subject: `${identity.userId}|${identity.sessionId}` });
  return { t, player, credentials, ...identity };
}

const admissionFailures: Record<
  string,
  (ctx: MutationCtx, subject: Awaited<ReturnType<typeof fixture>>) => Promise<void>
> = {
  deletion_pending: (ctx, subject) => ctx.db.patch(subject.userId, { account_state: 'deletion_pending' }),
  deleted: (ctx, subject) => ctx.db.patch(subject.userId, { account_state: 'deleted' }),
  anonymous: (ctx, subject) => ctx.db.patch(subject.userId, { isAnonymous: true }),
  missing_session: (ctx, subject) => ctx.db.delete(subject.sessionId),
  checkpoint_revoked: async (ctx, subject) => {
    const session = await ctx.db.get(subject.sessionId);
    await ctx.db.patch(subject.userId, { auth_sessions_revoked_through: session!._creationTime });
  },
  mismatched_session: async (ctx, subject) => {
    await ctx.db.patch(subject.sessionId, { userId: await ctx.db.insert('users', {}) });
  },
  expired_session: (ctx, subject) => ctx.db.patch(subject.sessionId, { expirationTime: Date.now() - 1 }),
  expired_refresh: (ctx, subject) => ctx.db.patch(subject.refreshId, { expirationTime: Date.now() - 1 }),
  used_refresh: (ctx, subject) => ctx.db.patch(subject.refreshId, { firstUsedTime: Date.now() }),
};

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

describe('Play admission', () => {
  const enrol = (subject: Awaited<ReturnType<typeof fixture>>) =>
    subject.player.mutation(api.playAdmission.enrolPlayer, { gameId: subject.credentials.gameId });
  const renew = (subject: Awaited<ReturnType<typeof fixture>>) =>
    subject.player.mutation(api.playAdmission.renewSeatPass, { gameId: subject.credentials.gameId });
  async function passOf(result: Awaited<ReturnType<typeof enrol>>) {
    if (!result.ok) {
      throw new Error(`Seat pass refused: ${result.reason}`);
    }
    return { pass: result.pass, payload: peekSeatPass(result.pass)! };
  }

  test('closing the hosted fixture refuses its passes', async () => {
    const subject = await fixture();
    await passOf(await enrol(subject));
    /* The same row under the hosted fixture's key, as production keeps that game stored. */
    await subject.t.run(
      async (ctx) => await ctx.db.patch(subject.credentials.gameId, { fixture_key: PLAY_FIXTURE_KEY })
    );
    expect(await renew(subject)).toEqual({ ok: false, reason: 'unavailable' });
    expect(await enrol(subject)).toEqual({ ok: false, reason: 'unavailable' });
  });

  test.each(Object.entries(admissionFailures))('refuses a pass after %s', async (_name, change) => {
    const subject = await fixture();
    await passOf(await enrol(subject));
    await subject.t.run((ctx) => change(ctx, subject));
    expect(await renew(subject)).toEqual({ ok: false, reason: 'not_authorized' });
    expect(await enrol(subject)).toEqual({ ok: false, reason: 'not_authorized' });
  });

  test('ends a pass with the unused refresh branch, found behind more than 128 newer used rows', async () => {
    const subject = await fixture();
    await subject.t.run(async (ctx) => {
      for (let index = 0; index < 256; index++) {
        await ctx.db.insert('authRefreshTokens', {
          sessionId: subject.sessionId,
          expirationTime: Date.now() + 3_600_000,
          firstUsedTime: Date.now(),
        });
      }
    });
    expect((await passOf(await enrol(subject))).payload.exp).toBe(Date.now() + 600_000);
    await subject.t.run(async (ctx) => {
      await ctx.db.insert('authRefreshTokens', { sessionId: subject.sessionId, expirationTime: Date.now() + 120_000 });
    });
    expect((await passOf(await renew(subject))).payload.exp).toBe(Date.now() + 120_000);
  });

  test('removing Administrator keeps the pass coming, while a revocation checkpoint or Auth row deletion ends it', async () => {
    const subject = await fixture();
    await subject.t.run(async (ctx) => await ctx.db.patch(subject.userId, { isAdmin: true }));
    await passOf(await enrol(subject));
    await subject.t.run(async (ctx) => await ctx.db.patch(subject.userId, { isAdmin: false }));
    await passOf(await renew(subject));
    await subject.t.run(async (ctx) => {
      const session = await ctx.db.get(subject.sessionId);
      await ctx.db.patch(subject.userId, { auth_sessions_revoked_through: session!._creationTime });
    });
    expect(await renew(subject)).toEqual({ ok: false, reason: 'not_authorized' });
  });

  test('rate limits pass requests across tabs of the same account', async () => {
    const subject = await fixture();
    const results = await Promise.all(Array.from({ length: 11 }, () => enrol(subject)));
    expect(results.filter((result) => result.ok)).toHaveLength(10);
    expect(results.find((result) => !result.ok)).toMatchObject({ ok: false, reason: 'rate_limited' });
  });

  test('rejected requests from an exhausted account leave pass capacity for another account', async () => {
    const subject = await fixture();
    const request = { gameId: subject.credentials.gameId };
    for (let attempt = 0; attempt < 10; attempt++) {
      expect(await enrol(subject)).toMatchObject({ ok: true });
    }
    for (let attempt = 0; attempt < 100; attempt++) {
      expect(await enrol(subject)).toEqual({ ok: false, reason: 'rate_limited', retryAfterMs: 2000 });
    }
    const secondIdentity = await subject.t.run(async (ctx) => {
      const userId = await ctx.db.insert('users', { account_state: 'active' });
      const sessionId = await ctx.db.insert('authSessions', { userId, expirationTime: Date.now() + 3_600_000 });
      await ctx.db.insert('authRefreshTokens', { sessionId, expirationTime: Date.now() + 600_000 });
      return { subject: `${userId}|${sessionId}` };
    });
    expect(await subject.t.withIdentity(secondIdentity).mutation(api.playAdmission.enrolPlayer, request)).toMatchObject(
      { ok: true }
    );
  });
});
