/// <reference types="vite/client" />
// @vitest-environment edge-runtime

import { describe, expect, test } from 'vitest';

import type { PlayDirectorySummary } from '../src/shared/play/directory';
import { api } from './_generated/api';
import { playPerson, playRuleset, playTest } from './play.test.fixture';

async function world() {
  const t = playTest();
  const seeded = await t.run(async (ctx) => {
    const admin = await playPerson(ctx, 'Administrator', { isAdmin: true });
    const member = await playPerson(ctx, 'Member');
    const gone = await playPerson(ctx, 'Departed', { accountState: 'deleted' });
    return { admin, member, gone, rulesetId: await playRuleset(ctx, admin.userId) };
  });
  const admin = t.withIdentity({ subject: seeded.admin.subject });
  const created = await admin.mutation(api.playGames.createGame, { rulesetId: seeded.rulesetId, minimumPlayers: 4 });
  if (!created.ok) {
    throw new Error('Game not created');
  }
  const game = (await t.run(async (ctx) => {
    await ctx.db.patch(created.gameId, { state: 'ready', confirmed_at: Date.now() });
    return await ctx.db.get(created.gameId);
  }))!;
  const publish = (sequence: number, summary: PlayDirectorySummary, secret = game.secret) =>
    t.mutation(api.playDirectory.publishSummary, { gameId: game._id, secret, sequence, summary });
  const summary = (seats: string[], extra: Partial<PlayDirectorySummary> = {}): PlayDirectorySummary => ({
    stage: 'drafting',
    seatCount: 4,
    seats: seats.map((userId, index) => ({ seat: `seat-${index + 1}`, userId, faction: null })),
    phase: null,
    lastActivityAt: 1000,
    result: null,
    ...extra,
  });
  return {
    t,
    admin,
    member: t.withIdentity({ subject: seeded.member.subject }),
    ids: { admin: seeded.admin.userId, member: seeded.member.userId, gone: seeded.gone.userId },
    game,
    publish,
    summary,
  };
}

describe('the directory keeps the newest published summary and lists it to every signed-in player', () => {
  test('a later sequence replaces, an older or repeated one is acknowledged without effect, a wrong secret is refused', async () => {
    const { t, admin, ids, game, publish, summary } = await world();
    expect(await publish(1, summary([ids.admin]), 'f'.repeat(64))).toEqual({ ok: false });
    expect(await publish(2, summary([ids.admin], { lastActivityAt: 2000 }))).toEqual({ ok: true, sequence: 2 });
    /* Delayed and duplicate deliveries answer with the sequence held, and change nothing. */
    expect(await publish(1, summary([ids.admin, ids.member]))).toEqual({ ok: true, sequence: 2 });
    expect(await publish(2, summary([ids.admin, ids.member]))).toEqual({ ok: true, sequence: 2 });
    const held = await t.run(async (ctx) => await ctx.db.get(game._id));
    expect(held?.directory_sequence).toBe(2);
    expect(held?.directory?.seats).toHaveLength(1);
    expect(await publish(3, summary([ids.admin, ids.member], { lastActivityAt: 3000 }))).toEqual({
      ok: true,
      sequence: 3,
    });
    const lobby = await admin.query(api.playDirectory.listGames, {});
    expect(lobby).toMatchObject({
      status: 'ready',
      past: [],
      ongoing: [
        {
          gameId: game._id,
          name: 'Classic',
          stage: 'drafting',
          seatsFilled: 2,
          seatCount: 4,
          viewerSeated: true,
          players: [
            { displayName: 'Administrator', faction: null },
            { displayName: 'Member', faction: null },
          ],
          lastActivityAt: 3000,
        },
      ],
    });
  });

  test('names come from current profiles, so a deleted account never appears and a finished game moves to past', async () => {
    const { t, admin, member, ids, game, publish, summary } = await world();
    await publish(1, summary([ids.admin, ids.gone]));
    expect(await t.query(api.playDirectory.listGames, {})).toEqual({ status: 'sign_in_required' });
    /* A player without the Administrator flag reads the same listing. */
    expect(await member.query(api.playDirectory.listGames, {})).toMatchObject({
      status: 'ready',
      ongoing: [{ seatsFilled: 1, players: [{ displayName: 'Administrator' }] }],
    });
    const listed = await admin.query(api.playDirectory.listGames, {});
    expect(listed).toMatchObject({
      ongoing: [{ seatsFilled: 1, players: [{ displayName: 'Administrator' }] }],
    });
    const result = {
      kind: 'faction' as const,
      factions: [{ id: 'atreides', name: 'Atreides' }],
      declaredBy: ids.admin,
      declaredAt: 5000,
    };
    await publish(2, summary([ids.admin], { stage: 'finished', result, lastActivityAt: 5000 }));
    /* The lobby reads faction names and no user id from a result, even when the winner's seat is empty. */
    expect(await admin.query(api.playDirectory.listGames, {})).toMatchObject({
      ongoing: [],
      past: [{ gameId: game._id, stage: 'finished', result: { kind: 'faction', factions: ['Atreides'] } }],
    });
    /* Continue playing after a delayed finish: the newer sequence wins whichever arrives last. */
    await publish(3, summary([ids.admin], { stage: 'play', phase: 12, lastActivityAt: 6000 }));
    expect(await publish(2, summary([ids.admin], { stage: 'finished', result }))).toEqual({ ok: true, sequence: 3 });
    expect(await admin.query(api.playDirectory.listGames, {})).toMatchObject({
      past: [],
      ongoing: [{ stage: 'play', phase: 12 }],
    });
  });
});
