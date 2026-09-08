/// <reference types="vite/client" />
// @vitest-environment edge-runtime

import aggregateTest from '@convex-dev/aggregate/test';
import rateLimiterTest from '@convex-dev/rate-limiter/test';
import { convexTest } from 'convex-test';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';

import { api, internal } from './_generated/api';
import type { Id } from './_generated/dataModel';
import type { MutationCtx } from './_generated/server';
import schema from './schema';

const modules = import.meta.glob('./**/*.ts');

function setup() {
  const t = convexTest(schema, modules);
  rateLimiterTest.register(t);
  aggregateTest.register(t, 'statistics');
  aggregateTest.register(t, 'profileActivity');
  aggregateTest.register(t, 'profileDiscovery');
  return t;
}

async function fixture() {
  const t = setup();
  const { gameId } = await t.mutation(internal.playProvisioning.beginFixtureProvision, {});
  const game = await t.run(async (ctx) => await ctx.db.get(gameId));
  if (!game) {
    throw new Error('Missing test fixture');
  }
  const credentials = { gameId, secret: game.secret, attemptId: game.attempt_id };
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

async function admit(subject: Awaited<ReturnType<typeof fixture>>) {
  const issued = await subject.player.mutation(api.playAdmission.issueTicket, { gameId: subject.credentials.gameId });
  if (!issued.ok) {
    throw new Error('Ticket issuance refused');
  }
  const admission = await subject.t.mutation(api.playAdmission.redeemTicket, {
    gameId: subject.credentials.gameId,
    secret: subject.credentials.secret,
    ticket: issued.ticket,
  });
  if (!admission.ok) {
    throw new Error('Admission refused');
  }
  return { issued, admission };
}

function watchArgs(subject: Awaited<ReturnType<typeof fixture>>, registrationIds: string[]) {
  return {
    gameId: subject.credentials.gameId,
    secret: subject.credentials.secret,
    generation: 'synthetic-generation',
    registrationIds,
  };
}

const admissionFailures: Record<
  string,
  (ctx: MutationCtx, subject: Awaited<ReturnType<typeof fixture>>) => Promise<void>
> = {
  deletion_pending: (ctx, subject) => ctx.db.patch(subject.userId, { account_state: 'deletion_pending' }),
  deleted: (ctx, subject) => ctx.db.patch(subject.userId, { account_state: 'deleted' }),
  anonymous: (ctx, subject) => ctx.db.patch(subject.userId, { isAnonymous: true }),
  missing_session: (ctx, subject) => ctx.db.delete(subject.sessionId),
  mismatched_session: async (ctx, subject) => {
    await ctx.db.patch(subject.sessionId, { userId: await ctx.db.insert('users', {}) });
  },
  expired_session: (ctx, subject) => ctx.db.patch(subject.sessionId, { expirationTime: Date.now() - 1 }),
  expired_refresh: (ctx, subject) => ctx.db.patch(subject.refreshId, { expirationTime: Date.now() - 1 }),
  used_refresh: (ctx, subject) => ctx.db.patch(subject.refreshId, { firstUsedTime: Date.now() }),
};

beforeEach(() => vi.useFakeTimers());
afterEach(() => {
  vi.clearAllTimers();
  vi.useRealTimers();
});

describe('Play admission', () => {
  test('serves only safe ready metadata to a signed-in non-administrator', async () => {
    const subject = await fixture();
    expect(await subject.t.query(api.playAdmission.getFixture, {})).toEqual({ status: 'sign_in_required' });
    expect(await subject.player.query(api.playAdmission.getFixture, {})).toEqual({
      status: 'ready',
      gameId: subject.credentials.gameId,
      name: 'Hosted fixture',
    });
    const { admission, issued } = await admit(subject);
    expect(issued.ticket).toMatch(/^[0-9a-f]{64}$/);
    expect(admission).toMatchObject({
      userId: subject.userId,
      sessionId: subject.sessionId,
      displayName: 'Synthetic player',
    });
    const stored = await subject.t.run(async (ctx) => await ctx.db.query('play_tickets').first());
    expect(stored?.digest).not.toBe(issued.ticket);
    expect(stored).not.toHaveProperty('ticket');
  });

  test('consumes each ticket once, including simultaneous attempts, and deduplicates session registrations', async () => {
    const subject = await fixture();
    const ticket = await subject.player.mutation(api.playAdmission.issueTicket, { gameId: subject.credentials.gameId });
    if (!ticket.ok) {
      throw new Error('Ticket issuance refused');
    }
    const request = { gameId: subject.credentials.gameId, secret: subject.credentials.secret, ticket: ticket.ticket };
    const answers = await Promise.all([
      subject.t.mutation(api.playAdmission.redeemTicket, request),
      subject.t.mutation(api.playAdmission.redeemTicket, request),
    ]);
    expect(answers.filter((answer) => answer.ok)).toHaveLength(1);
    const first = answers.find((answer) => answer.ok);
    const second = await admit(subject);
    expect(first?.ok && first.registrationId).toBe(second.admission.registrationId);
  });

  test('wrong-game, wrong-secret and malformed tickets reveal the same refusal without consuming a valid ticket', async () => {
    const subject = await fixture();
    const issued = await subject.player.mutation(api.playAdmission.issueTicket, { gameId: subject.credentials.gameId });
    if (!issued.ok) {
      throw new Error('Ticket issuance refused');
    }
    for (const request of [
      { gameId: 'unknown-game', secret: subject.credentials.secret, ticket: issued.ticket },
      { gameId: subject.credentials.gameId, secret: 'a'.repeat(64), ticket: issued.ticket },
      { gameId: subject.credentials.gameId, secret: subject.credentials.secret, ticket: 'malformed' },
    ]) {
      expect(await subject.t.mutation(api.playAdmission.redeemTicket, request)).toEqual({ ok: false });
    }
    expect(
      await subject.t.mutation(api.playAdmission.redeemTicket, {
        gameId: subject.credentials.gameId,
        secret: subject.credentials.secret,
        ticket: issued.ticket,
      })
    ).toMatchObject({ ok: true });
  });

  test('refuses an expired ticket while Auth remains valid', async () => {
    const subject = await fixture();
    const issued = await subject.player.mutation(api.playAdmission.issueTicket, { gameId: subject.credentials.gameId });
    if (!issued.ok) {
      throw new Error('Ticket issuance refused');
    }
    vi.setSystemTime(issued.expiresAt);
    expect(
      await subject.t.mutation(api.playAdmission.redeemTicket, {
        gameId: subject.credentials.gameId,
        secret: subject.credentials.secret,
        ticket: issued.ticket,
      })
    ).toEqual({ ok: false });
    expect(
      await subject.player.mutation(api.playAdmission.issueTicket, { gameId: subject.credentials.gameId })
    ).toMatchObject({ ok: true });
  });

  test.each(Object.entries(admissionFailures))(
    'refuses admission and outstanding tickets after %s',
    async (_name, change) => {
      const subject = await fixture();
      const issued = await subject.player.mutation(api.playAdmission.issueTicket, {
        gameId: subject.credentials.gameId,
      });
      if (!issued.ok) {
        throw new Error('Ticket issuance refused');
      }
      await subject.t.run((ctx) => change(ctx, subject));
      expect(
        await subject.player.mutation(api.playAdmission.issueTicket, { gameId: subject.credentials.gameId })
      ).toEqual({ ok: false, reason: 'not_authorized' });
      expect(
        await subject.t.mutation(api.playAdmission.redeemTicket, {
          gameId: subject.credentials.gameId,
          secret: subject.credentials.secret,
          ticket: issued.ticket,
        })
      ).toEqual({ ok: false });
    }
  );

  test('finds the unused refresh branch behind more than 128 newer used rows', async () => {
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
    expect((await admit(subject)).admission.authExpiresAt).toBe(Date.now() + 600_000);
    await subject.t.run(async (ctx) => {
      await ctx.db.insert('authRefreshTokens', { sessionId: subject.sessionId, expirationTime: Date.now() + 120_000 });
    });
    expect((await admit(subject)).admission.authExpiresAt).toBe(Date.now() + 120_000);
  });

  test('returns an expiry deadline without treating query execution or game activity as an Auth refresh', async () => {
    const subject = await fixture();
    const { admission } = await admit(subject);
    const request = watchArgs(subject, [admission.registrationId]);
    const before = await subject.t.query(api.playAdmission.watchAuthorizations, request);
    vi.setSystemTime(admission.authExpiresAt + 1);
    expect(await subject.t.query(api.playAdmission.watchAuthorizations, request)).toEqual(before);
    expect(
      await subject.player.mutation(api.playAdmission.issueTicket, { gameId: subject.credentials.gameId })
    ).toEqual({ ok: false, reason: 'not_authorized' });
  });

  test('uses current refresh and total deadlines even when they move earlier', async () => {
    const subject = await fixture();
    const { admission } = await admit(subject);
    const request = watchArgs(subject, [admission.registrationId]);
    const before = await subject.t.query(api.playAdmission.watchAuthorizations, request);
    if (!before.ok || !before.entries[0]) {
      throw new Error('Missing initial refresh branch');
    }
    vi.setSystemTime(Date.now() + 10);
    const refreshExpiresAt = Date.now() + 120_000;
    await subject.t.run(async (ctx) => {
      await ctx.db.patch(subject.refreshId, { firstUsedTime: Date.now() });
      await ctx.db.insert('authRefreshTokens', { sessionId: subject.sessionId, expirationTime: refreshExpiresAt });
    });
    const rotated = await subject.t.query(api.playAdmission.watchAuthorizations, request);
    if (!rotated.ok || !rotated.entries[0]) {
      throw new Error('Missing rotated refresh branch');
    }
    expect(rotated.entries[0].authExpiresAt).toBe(refreshExpiresAt);
    expect(rotated.entries[0].authExpiresAt).toBeLessThan(before.entries[0].authExpiresAt);
    const sessionExpiresAt = Date.now() + 30_000;
    await subject.t.run(async (ctx) => await ctx.db.patch(subject.sessionId, { expirationTime: sessionExpiresAt }));
    expect(await subject.t.query(api.playAdmission.watchAuthorizations, request)).toMatchObject({
      ok: true,
      entries: [{ authExpiresAt: sessionExpiresAt }],
    });
  });

  test('removing Administrator does not revoke the session, but Auth row deletion does', async () => {
    const subject = await fixture();
    await subject.t.run(async (ctx) => await ctx.db.patch(subject.userId, { isAdmin: true }));
    const { admission } = await admit(subject);
    await subject.t.run(async (ctx) => await ctx.db.patch(subject.userId, { isAdmin: false }));
    expect(
      await subject.t.query(api.playAdmission.watchAuthorizations, watchArgs(subject, [admission.registrationId]))
    ).toMatchObject({ ok: true, entries: [{ allowed: true }] });
    await subject.t.run(async (ctx) => await ctx.db.delete(subject.sessionId));
    expect(
      await subject.t.query(api.playAdmission.watchAuthorizations, watchArgs(subject, [admission.registrationId]))
    ).toMatchObject({ ok: true, entries: [{ allowed: false }] });
  });

  test('answers every requested registration and refuses oversized batches instead of truncating them', async () => {
    const subject = await fixture();
    const { admission } = await admit(subject);
    const answer = await subject.t.query(
      api.playAdmission.watchAuthorizations,
      watchArgs(subject, [admission.registrationId, 'missing'])
    );
    expect(answer).toMatchObject({
      ok: true,
      generation: 'synthetic-generation',
      entries: [
        { registrationId: admission.registrationId, allowed: true },
        { registrationId: 'missing', allowed: false, userId: null, sessionId: null },
      ],
    });
    expect(
      await subject.t.query(
        api.playAdmission.watchAuthorizations,
        watchArgs(
          subject,
          Array.from({ length: 65 }, () => admission.registrationId)
        )
      )
    ).toEqual({ ok: false });
    expect(
      await subject.t.query(api.playAdmission.watchAuthorizations, {
        ...watchArgs(subject, [admission.registrationId]),
        secret: 'f'.repeat(64),
      })
    ).toEqual({ ok: false });
  });

  test('expired registration cleanup preserves account routing for sleeping-game deletion', async () => {
    const subject = await fixture();
    const { admission } = await admit(subject);
    vi.setSystemTime(Date.now() + 3_600_000);
    await subject.t.mutation(internal.playAdmission.expireRegistration, {
      registrationId: admission.registrationId as Id<'play_auth_registrations'>,
    });
    expect(
      await subject.t.query(api.playAdmission.watchAuthorizations, watchArgs(subject, [admission.registrationId]))
    ).toMatchObject({ ok: true, entries: [{ allowed: false, userId: null }] });
    expect(
      await subject.t.query(api.playAdmission.reconcileAccounts, {
        gameId: subject.credentials.gameId,
        secret: subject.credentials.secret,
        userIds: [subject.userId, 'missing'],
      })
    ).toEqual({
      ok: true,
      accounts: [
        { userId: subject.userId, state: 'active', deletionOperationId: null },
        { userId: 'missing', state: 'unknown', deletionOperationId: null },
      ],
    });
  });

  test('rate limits ticket requests across tabs of the same account', async () => {
    const subject = await fixture();
    const requests = Array.from({ length: 11 }, () =>
      subject.player.mutation(api.playAdmission.issueTicket, { gameId: subject.credentials.gameId })
    );
    const results = await Promise.all(requests);
    expect(results.filter((result) => result.ok)).toHaveLength(10);
    expect(results.find((result) => !result.ok)).toMatchObject({ ok: false, reason: 'rate_limited' });
  });
});
