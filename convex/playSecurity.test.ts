/// <reference types="vite/client" />
// @vitest-environment edge-runtime

import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';

import type { PlayDirectorySummary } from '../src/shared/play/directory';
import { api } from './_generated/api';
import type { Doc, Id } from './_generated/dataModel';
import type { MutationCtx } from './_generated/server';
import { playPerson, playRuleset, playTest } from './play.test.fixture';

/*
 * Who may call each Play function in Convex.
 * Players reach five with their session; the game Worker reaches the rest with one game's secret.
 * Seats, votes and results live in the game Worker, which publishes only the directory summary here.
 */

/* Two players, each with a ready real game, and a third player who has no game. */
async function world() {
  const t = playTest();
  const seeded = await t.run(async (ctx) => {
    const host = await playPerson(ctx, 'Host');
    const rival = await playPerson(ctx, 'Rival');
    const outsider = await playPerson(ctx, 'Outsider');
    return { host, rival, outsider, rulesetId: await playRuleset(ctx, host.userId) };
  });
  const as = (subject: string) => t.withIdentity({ subject });
  async function readyGame(subject: string) {
    const created = await as(subject).mutation(api.playGames.createGame, {
      rulesetId: seeded.rulesetId,
      minimumPlayers: 2,
    });
    if (!created.ok) {
      throw new Error('Game not created');
    }
    return (await t.run(async (ctx) => {
      await ctx.db.patch(created.gameId, { state: 'ready', confirmed_at: Date.now() });
      return await ctx.db.get(created.gameId);
    }))!;
  }
  const mine = await readyGame(seeded.host.subject);
  const theirs = await readyGame(seeded.rival.subject);
  return { t, as, seeded, mine, theirs };
}

const summary = (userIds: string[], extra: Partial<PlayDirectorySummary> = {}): PlayDirectorySummary => ({
  stage: 'play',
  seatCount: 2,
  seats: userIds.map((userId, index) => ({ seat: `seat-${index + 1}`, userId, faction: null })),
  phase: null,
  lastActivityAt: 1000,
  result: null,
  ...extra,
});

/* Every Play row that a refused request must leave as it was. */
async function playRows(t: Awaited<ReturnType<typeof world>>['t']) {
  return await t.run(async (ctx) => ({
    games: await ctx.db.query('play_games').collect(),
    tickets: await ctx.db.query('play_tickets').collect(),
    registrations: await ctx.db.query('play_auth_registrations').collect(),
    accounts: await ctx.db.query('play_game_accounts').collect(),
  }));
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

describe('Play functions in Convex refuse callers who may not use them', () => {
  type Person = { userId: Id<'users'>; sessionId: Id<'authSessions'>; refreshId: Id<'authRefreshTokens'> };
  const refusals: Record<string, (ctx: MutationCtx, person: Person) => Promise<void>> = {
    anonymous: (ctx, { userId }) => ctx.db.patch(userId, { isAnonymous: true }),
    'deletion pending': (ctx, { userId }) => ctx.db.patch(userId, { account_state: 'deletion_pending' }),
    deleted: (ctx, { userId }) => ctx.db.patch(userId, { account_state: 'deleted' }),
    'signed out': (ctx, { sessionId }) => ctx.db.delete(sessionId),
  };
  /* Queries read no clock, so a session past its deadline is refused where a mutation acts: its sign-in token lapses on its own soon after. */
  const lapses: Record<string, (ctx: MutationCtx, person: Person) => Promise<void>> = {
    'idle past its refresh': (ctx, { refreshId }) => ctx.db.patch(refreshId, { expirationTime: Date.now() - 1 }),
    'past its lifetime': (ctx, { sessionId }) => ctx.db.patch(sessionId, { expirationTime: Date.now() - 1 }),
  };

  async function refusedWrites(
    outsider: ReturnType<Awaited<ReturnType<typeof world>>['as']>,
    rulesetId: Id<'rulesets'>,
    gameId: Id<'play_games'>
  ) {
    expect(await outsider.mutation(api.playGames.createGame, { rulesetId, minimumPlayers: 2 })).toEqual({
      ok: false,
      reason: 'not_authorized',
    });
    expect(await outsider.mutation(api.playAdmission.issueTicket, { gameId })).toEqual({
      ok: false,
      reason: 'not_authorized',
    });
  }

  test.each(Object.keys(refusals))('a %s account reads nothing and writes nothing', async (state) => {
    const { t, as, seeded, mine } = await world();
    await t.run(async (ctx) => await refusals[state](ctx, seeded.outsider));
    const before = await playRows(t);
    const outsider = as(seeded.outsider.subject);
    expect(await outsider.query(api.playGames.creatable, {})).toEqual({ access: 'unauthenticated' });
    expect(await outsider.query(api.playGames.getGame, { gameId: mine._id })).toEqual({ status: 'sign_in_required' });
    expect(await outsider.query(api.playDirectory.listGames, {})).toEqual({ status: 'sign_in_required' });
    await refusedWrites(outsider, seeded.rulesetId, mine._id);
    expect(await playRows(t)).toEqual(before);
  });

  test.each(Object.keys(lapses))('a session %s creates no game and takes no ticket', async (state) => {
    const { t, as, seeded, mine } = await world();
    await t.run(async (ctx) => await lapses[state](ctx, seeded.outsider));
    const before = await playRows(t);
    await refusedWrites(as(seeded.outsider.subject), seeded.rulesetId, mine._id);
    expect(await playRows(t)).toEqual(before);
  });

  test('a caller with no identity reads nothing and writes nothing', async () => {
    const { t, seeded, mine } = await world();
    const before = await playRows(t);
    expect(await t.query(api.playGames.creatable, {})).toEqual({ access: 'unauthenticated' });
    expect(await t.query(api.playGames.getGame, { gameId: mine._id })).toEqual({ status: 'sign_in_required' });
    expect(await t.query(api.playDirectory.listGames, {})).toEqual({ status: 'sign_in_required' });
    expect(await t.mutation(api.playGames.createGame, { rulesetId: seeded.rulesetId, minimumPlayers: 2 })).toEqual({
      ok: false,
      reason: 'not_authorized',
    });
    expect(await t.mutation(api.playAdmission.issueTicket, { gameId: mine._id })).toEqual({
      ok: false,
      reason: 'not_authorized',
    });
    expect(await playRows(t)).toEqual(before);
  });

  test("one game's secret opens nothing on another game", async () => {
    const { t, as, seeded, mine, theirs } = await world();
    /* The rival's player holds a registration on the rival's game. */
    const issued = await as(seeded.rival.subject).mutation(api.playAdmission.issueTicket, { gameId: theirs._id });
    if (!issued.ok) {
      throw new Error('Ticket refused');
    }
    const admitted = await t.mutation(api.playAdmission.redeemTicket, {
      gameId: theirs._id,
      secret: theirs.secret,
      ticket: issued.ticket,
    });
    if (!admitted.ok) {
      throw new Error('Admission refused');
    }
    const { registrationId } = admitted;
    const before = await playRows(t);
    const borrowed = { gameId: theirs._id, secret: mine.secret };

    expect(
      await t.mutation(api.playDirectory.publishSummary, {
        ...borrowed,
        sequence: 1,
        summary: summary([seeded.host.userId]),
      })
    ).toEqual({ ok: false });
    expect(
      await t.query(api.playAdmission.watchAuthorizations, {
        ...borrowed,
        generation: 'g',
        registrationIds: [registrationId],
      })
    ).toEqual({ ok: false });
    expect(await t.query(api.playAdmission.reconcileAccounts, { ...borrowed, userIds: [seeded.rival.userId] })).toEqual(
      {
        ok: false,
      }
    );
    for (const provisioning of [api.playProvisioning.validateProvisioning, api.playProvisioning.confirmProvisioning]) {
      expect(await t.mutation(provisioning, { ...borrowed, attemptId: theirs.attempt_id })).toEqual({ ok: false });
    }
    expect(
      await t.mutation(api.playProvisioning.failProvisioning, {
        ...borrowed,
        attemptId: theirs.attempt_id,
        reason: 'x',
      })
    ).toEqual({ ok: false });

    /* With its own secret, a game still learns nothing about another game's players. */
    const own = { gameId: mine._id, secret: mine.secret };
    expect(
      await t.query(api.playAdmission.watchAuthorizations, {
        ...own,
        generation: 'g',
        registrationIds: [registrationId],
      })
    ).toMatchObject({ ok: true, entries: [{ registrationId, userId: null, sessionId: null, allowed: false }] });
    expect(
      await t.query(api.playAdmission.reconcileAccounts, { ...own, userIds: [seeded.rival.userId] })
    ).toMatchObject({
      ok: true,
      accounts: [{ userId: seeded.rival.userId, state: 'unknown' }],
    });
    expect(await playRows(t)).toEqual(before);
  });

  test('a game that is not ready takes no directory summary', async () => {
    const { t, mine } = await world();
    for (const state of ['pending', 'expired'] as const) {
      await t.run(async (ctx) => await ctx.db.patch(mine._id, { state }));
      expect(
        await t.mutation(api.playDirectory.publishSummary, {
          gameId: mine._id,
          secret: mine.secret,
          sequence: 1,
          summary: summary([]),
        })
      ).toEqual({ ok: false });
    }
    expect((await t.run(async (ctx) => await ctx.db.get(mine._id)))?.directory).toBeUndefined();
  });

  test('what a signed-in player reads names no account, credential or attempt', async () => {
    const { t, as, seeded, mine, theirs } = await world();
    await t.mutation(api.playDirectory.publishSummary, {
      gameId: theirs._id,
      secret: theirs.secret,
      sequence: 1,
      summary: summary([seeded.rival.userId, seeded.host.userId]),
    });
    const outsider = as(seeded.outsider.subject);
    const read = JSON.stringify([
      await outsider.query(api.playDirectory.listGames, {}),
      await outsider.query(api.playGames.getGame, { gameId: mine._id }),
      await outsider.query(api.playGames.getGame, { gameId: theirs._id }),
      await outsider.query(api.playGames.creatable, {}),
    ]);
    expect(read).toContain('Rival');
    const secrets = (game: Doc<'play_games'>) => [game.secret, game.attempt_id];
    for (const value of [
      ...secrets(mine),
      ...secrets(theirs),
      seeded.host.userId,
      seeded.rival.userId,
      seeded.host.sessionId,
      seeded.rival.sessionId,
    ]) {
      expect(read).not.toContain(value);
    }
  });
});
